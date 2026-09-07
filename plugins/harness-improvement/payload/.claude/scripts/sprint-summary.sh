#!/usr/bin/env bash
# 週次スプリントレビュー用の集計（読み取り専用・何も変更しない）。
# sprint-review Skill の Step 1 で使う。期間内の logs / メトリクス / roadmap 現在位置 /
# 改善バックログ / git 履歴を 1 出力に集約し、レビュー文書の材料を出す。
#
# 使い方: bash .claude/scripts/sprint-summary.sh [--since YYYY-MM-DD] [--until YYYY-MM-DD]
#         （既定: 直近 7 日間）
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT"

# COOKPIT_TZ は旧名（後方互換）。新規は HARNESS_TZ を使う。
TZ_NAME="${HARNESS_TZ:-${COOKPIT_TZ:-Asia/Tokyo}}"
UNTIL="$(TZ="$TZ_NAME" date +%F)"
SINCE="$(TZ="$TZ_NAME" date -d '6 days ago' +%F 2>/dev/null || TZ="$TZ_NAME" date -v-6d +%F)"

while [ $# -gt 0 ]; do
  case "$1" in
    --since) SINCE="$2"; shift 2 ;;
    --until) UNTIL="$2"; shift 2 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

echo "# スプリント集計（$SINCE 〜 $UNTIL）"
echo

# ── セクション抽出ヘルパ（見出しが無ければ警告を出す。黙って落とさない） ──
extract_section() {
  local file="$1" heading="$2"
  if ! grep -q "^## $heading" "$file"; then
    echo "（セクション欠落: ## $heading）"
    return 0
  fi
  awk -v h="^## $heading" '$0 ~ h {flag=1; next} /^## /{flag=0} flag' "$file" | sed '/^$/d'
}

# ── 期間内の日次ログ ────────────────────────────────────────
LOGS_FOUND=0
for f in $(ls logs/20??-??-??.md 2>/dev/null | sort); do
  d="$(basename "$f" .md)"
  [[ "$d" < "$SINCE" || "$d" > "$UNTIL" ]] && continue
  LOGS_FOUND=$((LOGS_FOUND + 1))
  echo "## ログ: $f"
  echo
  echo "### Sprint / ブランチ"
  extract_section "$f" "今日のタスク"
  echo
  echo "### やったこと"
  extract_section "$f" "やったこと"
  echo
  echo "### 所要時間"
  extract_section "$f" "所要時間"
  echo
  echo "### AI ツール活用"
  extract_section "$f" "AI ツール活用記録"
  echo
  echo "### 未完了の持ち越し（次回やること のうち未チェック）"
  extract_section "$f" "次回やること" | grep -E '^\s*-\s*\[ \]' || echo "- なし"
  echo
done
if [ "$LOGS_FOUND" -eq 0 ]; then
  echo "## ログ: 期間内に見つからない（$SINCE 〜 $UNTIL）"
  echo
fi

# ── 期間内のタスクメトリクス ────────────────────────────────
echo "## タスクメトリクス（docs/claude-code/improvements/metrics/）"
echo
METRICS_FOUND=0
for y in docs/claude-code/improvements/metrics/TASK-*.yml; do
  [ -e "$y" ] || continue
  md="$(grep -E '^date:' "$y" | head -1 | awk '{print $2}' || true)"
  [ -z "$md" ] && continue
  [[ "$md" < "$SINCE" || "$md" > "$UNTIL" ]] && continue
  METRICS_FOUND=$((METRICS_FOUND + 1))
  echo "### $y"
  grep -E '^(task_id|feature_name|change_level|date):' "$y" || true
  grep -E '^\s+(calls|retries|reviewer_block_open|reviewer_high_impact_unverified|reviewer_follow_up_open|reviewer_critical|reviewer_major|reviewer_minor|user_corrections|implementation_rework|unresolved_items|active_time_bucket|confidence|handoff_items|rounds|stale_invalidations|false_positive_findings):' "$y" || true
  echo
done
[ "$METRICS_FOUND" -eq 0 ] && echo "- 期間内のメトリクスなし" && echo

# ── roadmap の現在位置 ──────────────────────────────────────
echo "## roadmap 現在位置（最新ログの Sprint 行 + docs/05-roadmap.md）"
echo
LATEST_LOG="$(ls logs/20??-??-??.md 2>/dev/null | sort | tail -1 || true)"
SPRINT_LINE=""
if [ -n "$LATEST_LOG" ]; then
  SPRINT_LINE="$(grep -E '^- Sprint：' "$LATEST_LOG" | head -1 || true)"
  echo "- 最新ログ（$LATEST_LOG）: ${SPRINT_LINE:-Sprint 行なし}"
fi
SPRINT_NUM="$(echo "$SPRINT_LINE" | grep -oE 'Sprint [0-9]+' | head -1 || true)"
if [ -n "$SPRINT_NUM" ] && [ -f docs/05-roadmap.md ]; then
  echo
  awk -v h="^## $SPRINT_NUM" '$0 ~ h {flag=1} flag && /^## /{if (++c > 1) exit} flag' docs/05-roadmap.md | head -40
fi
echo

# ── 改善バックログ（未決定 IMP） ────────────────────────────
BACKLOG="docs/claude-code/improvements/improvement-backlog.md"
echo "## 改善バックログ（accepted/rejected 以外の IMP）"
echo
if [ -f "$BACKLOG" ]; then
  grep -E '^\| IMP-' "$BACKLOG" | grep -vE '\| accepted \||\| rejected \|' || echo "- 未決定の IMP なし"
else
  echo "- バックログファイルなし"
fi
echo

# ── git 履歴 ────────────────────────────────────────────────
echo "## git 履歴（$SINCE 〜 $UNTIL）"
echo
git log --since="$SINCE 00:00" --until="$UNTIL 23:59" --date=short \
  --format='- %h %ad %s' 2>/dev/null || echo "- 取得失敗"
echo
echo "### 変更量"
git log --since="$SINCE 00:00" --until="$UNTIL 23:59" --format='%h' 2>/dev/null | wc -l \
  | xargs -I{} echo "- コミット数: {}"
git diff --shortstat "$(git log --since="$SINCE 00:00" --format='%h' 2>/dev/null | tail -1)~1..HEAD" 2>/dev/null \
  | sed 's/^/- 期間差分: /' || true
