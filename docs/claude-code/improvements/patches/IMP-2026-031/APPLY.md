# IMP-2026-031 保護ファイル適用状況

## 状態（2026-07-27）

本ブランチでは以下を**適用済み**とする。

1. 旧 4 Agent を `docs/claude-code/archive/agents/` へ移設（`.claude/agents/` から除去）
2. 吸収先 Agent（architecture-designer / implementer / reviewer / orchestrator）を更新
3. Skill（classify-change / create-requirements-document）を更新

## 検証コマンド

```bash
ls .claude/agents/*.md | wc -l   # 期待: 11
test ! -e .claude/agents/requirements-analyst.md
test -f docs/claude-code/archive/agents/requirements-analyst.md
rg -n '^tools:' .claude/agents/orchestrator.md
# 期待: requirements-analyst / performance-designer / e2e-test-implementer / document-reviewer を含まない
```

## 万一未適用の環境で再適用する場合

```bash
PATCH=docs/claude-code/improvements/patches/IMP-2026-031
# 人間が harness-approve 後:
cp "$PATCH/agents/architecture-designer.md" .claude/agents/
cp "$PATCH/agents/implementer.md" .claude/agents/
cp "$PATCH/agents/reviewer.md" .claude/agents/
cp "$PATCH/agents/orchestrator.md" .claude/agents/
mkdir -p docs/claude-code/archive/agents
git mv .claude/agents/requirements-analyst.md docs/claude-code/archive/agents/ 2>/dev/null || true
git mv .claude/agents/performance-designer.md docs/claude-code/archive/agents/ 2>/dev/null || true
git mv .claude/agents/e2e-test-implementer.md docs/claude-code/archive/agents/ 2>/dev/null || true
git mv .claude/agents/document-reviewer.md docs/claude-code/archive/agents/ 2>/dev/null || true
cp "$PATCH/skills/classify-change.SKILL.md" .claude/skills/classify-change/SKILL.md
cp "$PATCH/skills/create-requirements-document.SKILL.md" .claude/skills/create-requirements-document/SKILL.md
```

> 吸収元の置き場は PR #116 と同じく `docs/claude-code/archive/agents/`（保護対象外）。
