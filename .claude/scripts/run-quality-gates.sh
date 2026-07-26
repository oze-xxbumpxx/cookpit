#!/usr/bin/env bash
# 品質ゲートを実行する（§12）。実在するコマンドだけを実行し、各ゲートの成否を明示する。
#
# 使い方:
#   bash .claude/scripts/run-quality-gates.sh [--level 0|1|2|3] [--format] [--build] [--all]
#     既定（--level 1 相当）: lint, type-check
#     --level 2 / 3       : lint, type-check, build, format-check
#     --format            : format-check を追加
#     --build             : build を追加
#     --all               : 実在する全ゲート
#
# 方針:
# - 1 つのゲート失敗で即終了せず、全ゲートを実行して最後に集計する（既存失敗の可視化）。
# - 実在しないコマンドは実行せず unknown と報告する（推測で通過扱いにしない）。
# - 既存失敗と今回の失敗の区別はこのスクリプトでは行わない（reviewer / Orchestrator が判断）。
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

has_script() { node -e 'const s=(require("./package.json").scripts)||{};process.exit(s[process.argv[1]]?0:1)' "$1" 2>/dev/null; }

PASS=(); FAIL=(); SKIP=()
run_gate() { # name, command...
  local name="$1"; shift
  echo "── gate: $name"
  echo "   \$ $*"
  if "$@"; then PASS+=("$name"); echo "   ✓ PASS: $name"; else FAIL+=("$name"); echo "   ✗ FAIL: $name"; fi
  echo
}
skip_gate() { SKIP+=("$1 ($2)"); echo "── gate: $1 → SKIP ($2)"; echo; }

echo "===== run-quality-gates (level=$LEVEL) ====="
echo

# harness（ハーネス自身の安全境界テスト。Node 標準ランナーのみで追加依存なし）
if has_script test:harness; then run_gate "harness" pnpm test:harness; else skip_gate "harness" "unavailable"; fi
# lint
if has_script lint; then run_gate "lint" pnpm lint; else skip_gate "lint" "unavailable"; fi
# type-check
if has_script type-check; then run_gate "type-check" pnpm type-check; else skip_gate "type-check" "unavailable"; fi
# build
if [ "$RUN_BUILD" = "1" ] || [ "$RUN_ALL" = "1" ]; then
  if has_script build; then run_gate "build" pnpm build; else skip_gate "build" "unavailable"; fi
fi
# format-check
if [ "$RUN_FORMAT" = "1" ] || [ "$RUN_ALL" = "1" ]; then
  if pnpm exec prettier --version >/dev/null 2>&1; then
    run_gate "format-check" pnpm exec prettier --check "**/*.{ts,tsx,md}"
  else
    skip_gate "format-check" "prettier unavailable"
  fi
fi
# tests（実在時は既定でも実行する。Vitest は全層導入済み — 2026-07-01 PR #21）
if has_script test; then run_gate "test" pnpm run test; else skip_gate "test" "unavailable"; fi

echo "===== summary ====="
echo "PASS: ${PASS[*]:-(none)}"
echo "FAIL: ${FAIL[*]:-(none)}"
echo "SKIP/unknown: ${SKIP[*]:-(none)}"
echo

# 実行結果を永続領域の quality-gates-log.jsonl へ機械記録する（保存先は harness-paths.mjs が決定。
# 既定はリポジトリ外のユーザー状態ディレクトリで、環境破棄でも失われない）。
# あわせて run 状態のゲート結果を更新する。記録に失敗してもゲート判定は変えない。
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
// run 状態がある場合だけゲート結果を反映する（無くてもゲート実行は妨げない）
if (loadRunState().ok) {
  // 関数形式で既存のゲート結果へマージする（上書きすると別実行の結果が消える）
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
