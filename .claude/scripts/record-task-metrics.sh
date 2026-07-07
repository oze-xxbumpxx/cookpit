#!/usr/bin/env bash
# タスク品質メトリクスの雛形を生成する（§19）。
# 値は埋めず unknown/0 のテンプレを作るだけ（推測値を入れない）。秘密情報・会話全文は保存しない。
#
# 使い方:
#   bash .claude/scripts/record-task-metrics.sh <task-id> <feature-name> <change-level>
# 例:
#   bash .claude/scripts/record-task-metrics.sh TASK-2026-001 recipe-servings-field 2
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT"

TASK_ID="${1:-}"
FEATURE="${2:-}"
LEVEL="${3:-}"
if [ -z "$TASK_ID" ] || [ -z "$FEATURE" ] || [ -z "$LEVEL" ]; then
  echo "usage: record-task-metrics.sh <task-id> <feature-name> <change-level 0|1|2|3>" >&2
  exit 2
fi

OUT_DIR="docs/claude-code/improvements/metrics"
OUT="$OUT_DIR/${TASK_ID}.yml"
mkdir -p "$OUT_DIR"

if [ -e "$OUT" ]; then
  echo "already exists (雛形は上書きしない): $OUT" >&2
  echo "machine セクションのみ再集計して累積する" >&2
  node "$ROOT/.claude/scripts/collect-task-metrics.mjs" \
    --feature "$FEATURE" --task-id "$TASK_ID" --write || \
    echo "⚠ collect-task-metrics.mjs の自動集計に失敗" >&2
  exit 0
fi

DATE="$(date +%F)"
TPL="$OUT_DIR/_TEMPLATE.yml"
if [ -e "$TPL" ]; then
  sed -e "s/^task_id:.*/task_id: ${TASK_ID}/" \
      -e "s/^feature_name:.*/feature_name: ${FEATURE}/" \
      -e "s/^change_level:.*/change_level: ${LEVEL}/" \
      -e "s/^date:.*/date: ${DATE}/" \
      "$TPL" > "$OUT"
else
  printf 'task_id: %s\nfeature_name: %s\nchange_level: %s\ndate: %s\n' \
    "$TASK_ID" "$FEATURE" "$LEVEL" "$DATE" > "$OUT"
fi

echo "created: $OUT"

# subagent-log から agents.calls を自動補完（feature が一致する行を数える）
SUBAGENT_LOG="$ROOT/.claude/state/subagent-log.jsonl"
if [ -f "$SUBAGENT_LOG" ]; then
  AGENT_CALLS="$(node -e "
const fs = require('fs');
const lines = fs.readFileSync('$SUBAGENT_LOG', 'utf8').trim().split('\n').filter(Boolean);
const n = lines.filter(l => { try { return JSON.parse(l).feature === '$FEATURE'; } catch { return false; } }).length;
process.stdout.write(String(n));
" 2>/dev/null || echo '0')"
  if [ "$AGENT_CALLS" -gt 0 ] 2>/dev/null; then
    node -e "
const fs = require('fs');
let t = fs.readFileSync('$OUT', 'utf8');
t = t.replace(/^  calls: unknown/m, '  calls: $AGENT_CALLS  # subagent-log から自動集計');
fs.writeFileSync('$OUT', t);
" 2>/dev/null && echo "agents.calls を自動補完: $AGENT_CALLS（subagent-log の feature=$FEATURE 行数）"
  fi
fi

# docs の有無から process.missing_documents を自動補完
MISSING=0
[ ! -f "$ROOT/docs/designs/${FEATURE}.md" ]              && MISSING=$((MISSING+1))
[ ! -f "$ROOT/docs/implementation-plans/${FEATURE}.md" ] && MISSING=$((MISSING+1))
[ ! -f "$ROOT/docs/tests/${FEATURE}.md" ]                && MISSING=$((MISSING+1))
if [ "$LEVEL" -ge 2 ] 2>/dev/null && [ "$MISSING" -gt 0 ]; then
  node -e "
const fs = require('fs');
let t = fs.readFileSync('$OUT', 'utf8');
t = t.replace(/^  missing_documents: 0/m, '  missing_documents: $MISSING  # docs 存在チェックから自動補完');
fs.writeFileSync('$OUT', t);
" 2>/dev/null && echo "process.missing_documents を自動補完: $MISSING"
fi

# machine セクション（所要時間・トークン・Agent 呼び出し・ゲート実行）を transcript から自動集計
if node "$ROOT/.claude/scripts/collect-task-metrics.mjs" \
  --feature "$FEATURE" --task-id "$TASK_ID" --write; then
  :
else
  echo "⚠ collect-task-metrics.mjs の自動集計に失敗（machine セクションはテンプレのまま。手動で再実行可）" >&2
fi

echo "（意味的な数値 = quality/process は reflection-agent / 人間が埋める。自動取得できない値は unknown のままにする）"
