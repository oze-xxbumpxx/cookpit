#!/usr/bin/env bash
# 品質ゲートを実行する（§12）。実在するコマンドだけを実行し、各ゲートの成否を明示する。
#
# 使い方:
#   bash .claude/scripts/run-quality-gates.sh [--level 0|1|2|3] [--format] [--build] [--all]
#     既定（--level 1相当）: harness, lint, type-check, test
#     --level 2 / 3       : + build, format-check
#     --format            : format-checkを追加
#     --build             : buildを追加
#     --all               : 実在する全ゲート + 休眠中のreview-readiness試験
#
# 方針:
# - 1つのゲート失敗で即終了せず、全ゲートを実行して最後に集計する（既存失敗の可視化）。
# - 実在しないコマンドは実行せずunknownと報告する（推測で通過扱いにしない）。
# - パッケージマネージャーはlockfileから検出する（pnpm固定にしない）。
# - ハーネス試験は既定では休眠中のreview-readiness.test.mjsを除いて
#   `node --test`で実行する（D-3）。--allのときだけpackage.jsonのtest:harness
#   （全件実行）を使い、無ければ`node --test .claude/tests/*.test.mjs`に落ちる。
set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT"

LEVEL=1
RUN_FORMAT=0
RUN_BUILD=0
RUN_ALL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --level) LEVEL="${2:-1}"; shift 2 ;;
    --format) RUN_FORMAT=1; shift ;;
    --build) RUN_BUILD=1; shift ;;
    --all) RUN_ALL=1; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
if [ "$LEVEL" = "2" ] || [ "$LEVEL" = "3" ]; then RUN_FORMAT=1; RUN_BUILD=1; fi

detect_pm() {
  if [ -f pnpm-lock.yaml ]; then echo pnpm
  elif [ -f yarn.lock ]; then echo yarn
  elif [ -f bun.lockb ] || [ -f bun.lock ]; then echo bun
  else echo npm
  fi
}

PM="$(detect_pm)"

has_script() {
  node -e 'const s=(require("./package.json").scripts)||{};process.exit(s[process.argv[1]]?0:1)' "$1" 2>/dev/null
}

PASS=(); FAIL=(); SKIP=()
run_gate() { # name, command...
  local name="$1"; shift
  echo "── gate: $name"
  echo "   \$ $*"
  if "$@"; then PASS+=("$name"); echo "   ✓ PASS: $name"; else FAIL+=("$name"); echo "   ✗ FAIL: $name"; fi
  echo
}
skip_gate() { SKIP+=("$1 ($2)"); echo "── gate: $1 → SKIP ($2)"; echo; }

run_pm_script() {
  local name="$1" script="$2"
  case "$PM" in
    pnpm) run_gate "$name" pnpm "$script" ;;
    yarn) run_gate "$name" yarn "$script" ;;
    bun) run_gate "$name" bun run "$script" ;;
    *) run_gate "$name" npm run "$script" ;;
  esac
}

prettier_ok() {
  case "$PM" in
    pnpm) pnpm exec prettier --version >/dev/null 2>&1 ;;
    yarn) yarn exec prettier --version >/dev/null 2>&1 ;;
    bun) bunx --no-install prettier --version >/dev/null 2>&1 ;;
    *) npx --no-install prettier --version >/dev/null 2>&1 ;;
  esac
}

run_prettier() {
  case "$PM" in
    pnpm) run_gate "format-check" pnpm exec prettier --check "**/*.{ts,tsx,md}" ;;
    yarn) run_gate "format-check" yarn exec prettier --check "**/*.{ts,tsx,md}" ;;
    bun) run_gate "format-check" bunx --no-install prettier --check "**/*.{ts,tsx,md}" ;;
    *) run_gate "format-check" npx --no-install prettier --check "**/*.{ts,tsx,md}" ;;
  esac
}

collect_harness_tests() {
  local include_dormant="$1"
  local f
  for f in .claude/tests/*.test.mjs; do
    [ -f "$f" ] || continue
    case "$(basename "$f")" in
      review-readiness.test.mjs)
        if [ "$include_dormant" = "1" ]; then printf '%s\n' "$f"; fi
        ;;
      *) printf '%s\n' "$f" ;;
    esac
  done
}

run_harness() {
  local include=0
  if [ "$RUN_ALL" = "1" ]; then
    include=1
    if has_script test:harness; then
      run_pm_script harness test:harness
      return
    fi
  fi
  local -a tests=()
  local f
  while IFS= read -r f; do
    [ -n "$f" ] && tests+=("$f")
  done < <(collect_harness_tests "$include")
  if [ "${#tests[@]}" -eq 0 ]; then
    skip_gate "harness" "unavailable"
    return
  fi
  # 親がnode --testのとき子ランナーが巻き込まれないよう環境を切る
  run_gate "harness" env -u NODE_TEST_CONTEXT node --test "${tests[@]}"
}

echo "===== run-quality-gates (level=$LEVEL pm=$PM) ====="
echo

run_harness
if has_script lint; then run_pm_script lint lint; else skip_gate "lint" "unavailable"; fi
if has_script type-check; then run_pm_script type-check type-check; else skip_gate "type-check" "unavailable"; fi
if [ "$RUN_BUILD" = "1" ] || [ "$RUN_ALL" = "1" ]; then
  if has_script build; then run_pm_script build build; else skip_gate "build" "unavailable"; fi
fi
if [ "$RUN_FORMAT" = "1" ] || [ "$RUN_ALL" = "1" ]; then
  if prettier_ok; then run_prettier; else skip_gate "format-check" "prettier unavailable"; fi
fi
if has_script test; then run_pm_script test test; else skip_gate "test" "unavailable"; fi

echo "===== summary ====="
echo "PASS: ${PASS[*]:-(none)}"
echo "FAIL: ${FAIL[*]:-(none)}"
echo "SKIP/unknown: ${SKIP[*]:-(none)}"
echo

# 実行結果を永続領域のquality-gates-log.jsonlへ機械記録する（保存先はharness-paths.mjsが決定。
# 既定はリポジトリ外のユーザー状態ディレクトリで、環境破棄でも失われない）。
# あわせてrun状態のゲート結果を更新する。記録に失敗してもゲート判定は変えない。
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
node --input-type=module -e '
import { appendJsonl, loadRunState, updateRunState } from "./.claude/lib/harness-state.mjs";
import { stateDir, statePath } from "./.claude/lib/harness-paths.mjs";
const [branch, level, pass, fail, skip] = process.argv.slice(1);
const split = (s) => (s ? s.split("\u0001") : []);
const passed = split(pass);
const failed = split(fail);
const entry = {
  ts: new Date().toISOString(),
  branch,
  level: Number(level),
  pass: passed,
  fail: failed,
  skip: split(skip),
};
stateDir();
appendJsonl(statePath("quality-gates-log.jsonl"), entry);
if (loadRunState().ok) {
  updateRunState((state) => {
    const gateResults = { ...(state?.gateResults ?? {}) };
    for (const name of passed) gateResults[name] = { result: "pass", at: entry.ts };
    for (const name of failed) gateResults[name] = { result: "fail", at: entry.ts };
    return { phase: "gates", gateResults };
  });
}
' "$BRANCH" "$LEVEL" \
  "$(IFS=$'\001'; echo "${PASS[*]:-}")" \
  "$(IFS=$'\001'; echo "${FAIL[*]:-}")" \
  "$(IFS=$'\001'; echo "${SKIP[*]:-}")" 2>/dev/null || true

if [ "${#FAIL[@]}" -gt 0 ]; then echo "RESULT: FAIL (${#FAIL[@]} gate(s) failed)"; exit 1; fi
echo "RESULT: OK (実行ゲートは全て成功。SKIP は unknown のまま)"
