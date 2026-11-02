#!/usr/bin/env bash
# セッション開始ブリーフィング（読み取り専用・何も変更しない）。
# kickoff-session SkillのStep 1で使う。前回ログの「次回やること」・改善バックログの
# 未決定項目・git状態を1画面に集約し、段取り（今日のタスク決め）の材料を出す。
#
# 使い方: bash .claude/scripts/session-briefing.sh
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$ROOT"

# COOKPIT_TZは旧名（後方互換）。新規はHARNESS_TZを使う。
echo "# セッションブリーフィング（$(TZ="${HARNESS_TZ:-${COOKPIT_TZ:-Asia/Tokyo}}" date +%F)）"
echo

# ── 前回ログの「次回やること」 ──────────────────────────────
LATEST_LOG="$(ls logs/20??-??-??.md 2>/dev/null | sort | tail -1 || true)"
if [ -n "$LATEST_LOG" ]; then
  echo "## 前回ログ: $LATEST_LOG"
  echo
  awk '/^## 次回やること/{flag=1; next} /^## /{flag=0} flag' "$LATEST_LOG" \
    | sed '/^$/d' || true
  echo
else
  echo "## 前回ログ: 見つからない（logs/ が空）"
  echo
fi

# ── 改善バックログの未決定・監視中項目 ──────────────────────
BACKLOG="docs/claude-code/improvements/improvement-backlog.md"
if [ -f "$BACKLOG" ]; then
  OPEN="$(grep -E '^\| IMP-' "$BACKLOG" | grep -vE '\| accepted \||\| rejected \|' || true)"
  echo "## 改善バックログ（accepted/rejected 以外の IMP）"
  echo
  if [ -n "$OPEN" ]; then
    echo "$OPEN"
  else
    echo "- 未決定の IMP なし"
  fi
  echo
fi

# ── git状態 ────────────────────────────────────────────────
echo "## git 状態"
echo
echo "- ブランチ: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '不明')"
echo "- 未コミット変更: $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') 件"
echo "- 直近コミット: $(git log -1 --format='%h %s (%ar)' 2>/dev/null || echo 'なし')"
echo

# ── 定型リマインダ ──────────────────────────────────────────
cat <<'EOF'
## セッション開始チェック（CLAUDE.md）

- [ ] AGENTS.md と logs/ の最新ファイルを読み込む
- [ ] 変更レベル（L0〜L3）を判定する（classify-change Skill）
- [ ] 実装はこのセッションで行う（develop-feature）
- [ ] Sprint / roadmap 文書があれば確認する（未作成ならスキップ）
EOF
