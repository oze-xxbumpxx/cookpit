# IMP-2026-031 保護ファイル適用手順

AI は `.claude/agents/` / `.claude/skills/` を承認なしで書き換えられない
（guard-dangerous fail-closed）。人間が端末で以下を実行する。

## 1. 承認の発行

```bash
node .claude/scripts/harness-run.mjs start
node .claude/scripts/harness-approve.mjs --target .claude/agents/
node .claude/scripts/harness-approve.mjs --target .claude/skills/classify-change/SKILL.md
node .claude/scripts/harness-approve.mjs --target .claude/skills/create-requirements-document/SKILL.md
```

（環境の approve CLI がディレクトリ一括を受けない場合は、変更する各ファイルを個別指定）

## 2. 吸収先の上書きと archive 移設

```bash
PATCH=docs/claude-code/improvements/patches/IMP-2026-031

cp "$PATCH/agents/architecture-designer.md" .claude/agents/architecture-designer.md
cp "$PATCH/agents/implementer.md" .claude/agents/implementer.md
cp "$PATCH/agents/reviewer.md" .claude/agents/reviewer.md
cp "$PATCH/agents/orchestrator.md" .claude/agents/orchestrator.md

mkdir -p .claude/agents/archive
mv .claude/agents/requirements-analyst.md .claude/agents/archive/
mv .claude/agents/performance-designer.md .claude/agents/archive/
mv .claude/agents/e2e-test-implementer.md .claude/agents/archive/
mv .claude/agents/document-reviewer.md .claude/agents/archive/

# archive 説明（初回のみ）
cat > .claude/agents/archive/README.md <<'EOF'
# 吸収済み Agent（archive）

IMP-2026-031（2026-07-26）。復元時は本ディレクトリから `.claude/agents/` へ戻し、
orchestration-policy と orchestrator tools を同期すること。

| 旧 Agent | 吸収先 |
| --- | --- |
| requirements-analyst | orchestrator + architecture-designer |
| performance-designer | architecture-designer |
| e2e-test-implementer | implementer |
| document-reviewer | reviewer |
EOF

cp "$PATCH/skills/classify-change.SKILL.md" .claude/skills/classify-change/SKILL.md
cp "$PATCH/skills/create-requirements-document.SKILL.md" .claude/skills/create-requirements-document/SKILL.md
```

## 3. 確認

```bash
ls .claude/agents/*.md | wc -l   # 期待: 11
rg -n "requirements-analyst|performance-designer|e2e-test-implementer|document-reviewer" \
  .claude/agents/orchestrator.md   # 期待: ヒットなし（説明文の「旧〜」以外）
```

## 4. コミット

保護ファイル変更を feature ブランチへコミットし、PR に含める（または追従 PR）。
