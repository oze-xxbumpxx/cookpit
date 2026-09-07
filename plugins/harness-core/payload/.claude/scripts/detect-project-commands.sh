#!/usr/bin/env bash
# 既存設定から実在する品質コマンドを検出する（§12）。
# プロジェクトを変更せず、検出結果だけを標準出力に出す。実在しないものは unavailable とする。
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT"

# package.json の scripts に指定キーが存在するか（node で厳密に判定）。
has_script() {
  node -e 'const s=(require("./package.json").scripts)||{};process.exit(s[process.argv[1]]?0:1)' "$1" 2>/dev/null
}

# 検出結果を "name=command|status" で出力する。
report() { printf '%-16s %s\n' "$1" "$2"; }

echo "# Detected quality commands (root package.json scripts)"
echo "# repo: $ROOT"
echo

if has_script lint; then        report "lint"        "pnpm lint            [available]"; else report "lint" "[unavailable]"; fi
if has_script type-check; then  report "type-check"  "pnpm type-check      [available]"; else report "type-check" "[unavailable]"; fi
if has_script build; then       report "build"       "pnpm build           [available]"; else report "build" "[unavailable]"; fi
if has_script format; then      report "format-write" "pnpm format          [available, --write]"; else report "format-write" "[unavailable]"; fi

# format の check 版（prettier が解決できる場合のみ）。
if pnpm exec prettier --version >/dev/null 2>&1; then
  report "format-check" "pnpm exec prettier --check \"**/*.{ts,tsx,md}\" [available]"
else
  report "format-check" "[unavailable]"
fi

# テスト系は MVP1 未導入。擬似コマンドを作らない。
for t in test "test:unit" "test:integration" "test:e2e" "test:contract"; do
  if has_script "$t"; then report "$t" "pnpm run $t        [available]"; fi
done
if ! has_script test; then report "test" "[unavailable] (MVP1: test runner 未導入)"; fi

echo
echo "# 注意: [unavailable] のゲートは run-quality-gates.sh で実行せず unknown として報告する。"
