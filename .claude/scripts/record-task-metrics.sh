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
  echo "already exists (上書きしない): $OUT" >&2
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
echo "（数値は reflection-agent / 人間が埋める。自動取得できない値は unknown のままにする）"
