#!/usr/bin/env bash
# 既存設定から実在する品質コマンドを検出する（§12）。
# プロジェクトを変更せず、検出結果だけを標準出力に出す。実在しないものはunavailableとする。
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT"

has_script() {
  node -e 'const s=(require("./package.json").scripts)||{};process.exit(s[process.argv[1]]?0:1)' "$1" 2>/dev/null
}

detect_pm() {
  if [ -f pnpm-lock.yaml ]; then echo pnpm
  elif [ -f yarn.lock ]; then echo yarn
  elif [ -f bun.lockb ] || [ -f bun.lock ]; then echo bun
  else echo npm
  fi
}

PM="$(detect_pm)"

pm_script_label() {
  local script="$1"
  case "$PM" in
    pnpm) echo "pnpm ${script}" ;;
    yarn) echo "yarn ${script}" ;;
    bun) echo "bun run ${script}" ;;
    *) echo "npm run ${script}" ;;
  esac
}

report() { printf '%-16s %s\n' "$1" "$2"; }

echo "# Detected quality commands"
echo "# repo: $ROOT"
echo "# package manager: $PM（lockfile 優先。無ければ npm）"
echo

if ls .claude/tests/*.test.mjs >/dev/null 2>&1; then
  report "harness" "node --test .claude/tests/*.test.mjs [available]"
  report "harness-daily" "既定の run-quality-gates は review-readiness.test.mjs を除く（--all で全件）"
else
  report "harness" "[unavailable]"
fi

if has_script lint; then        report "lint"        "$(pm_script_label lint)            [available]"; else report "lint" "[unavailable]"; fi
if has_script type-check; then  report "type-check"  "$(pm_script_label type-check)      [available]"; else report "type-check" "[unavailable]"; fi
if has_script build; then       report "build"       "$(pm_script_label build)           [available]"; else report "build" "[unavailable]"; fi
if has_script format; then      report "format-write" "$(pm_script_label format)          [available, --write]"; else report "format-write" "[unavailable]"; fi

prettier_ok=0
case "$PM" in
  pnpm) pnpm exec prettier --version >/dev/null 2>&1 && prettier_ok=1 ;;
  yarn) yarn exec prettier --version >/dev/null 2>&1 && prettier_ok=1 ;;
  bun) bunx --no-install prettier --version >/dev/null 2>&1 && prettier_ok=1 ;;
  *) npx --no-install prettier --version >/dev/null 2>&1 && prettier_ok=1 ;;
esac
if [ "$prettier_ok" = "1" ]; then
  case "$PM" in
    npm) report "format-check" "npx --no-install prettier --check \"**/*.{ts,tsx,md}\" [available]" ;;
    bun) report "format-check" "bunx --no-install prettier --check \"**/*.{ts,tsx,md}\" [available]" ;;
    *) report "format-check" "${PM} exec prettier --check \"**/*.{ts,tsx,md}\" [available]" ;;
  esac
else
  report "format-check" "[unavailable]"
fi

for t in test "test:unit" "test:integration" "test:e2e" "test:contract" "test:harness"; do
  if has_script "$t"; then report "$t" "$(pm_script_label "$t")        [available]"; fi
done
if ! has_script test; then report "test" "[unavailable]"; fi

echo
echo "# 注意: [unavailable] のゲートは run-quality-gates.sh で実行せず unknown として報告する。"
