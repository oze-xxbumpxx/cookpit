#!/usr/bin/env bash
# SessionStart Hook — セッション開始時のコンテキスト注入。
# 1) 実在する品質コマンドの検出結果（detect-project-commands.sh）
# 2) 最新の作業ログ（CLAUDE.md「前回作業は logs/ の最新ファイル」の情報源を自動提示）
# 読み取り専用。失敗してもセッションを止めない（常に exit 0）。
set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"

"$ROOT/.claude/scripts/detect-project-commands.sh" 2>/dev/null || true

latest_log=$(ls "$ROOT"/logs/2*.md 2>/dev/null | sort | tail -1 || true)
if [ -n "${latest_log:-}" ]; then
  echo
  echo "# 前回作業ログ: ${latest_log#"$ROOT"/}"
  echo "# （引き継ぎはこのファイルを参照。3日以上古い場合は write-work-log で追記すること）"
fi

exit 0
