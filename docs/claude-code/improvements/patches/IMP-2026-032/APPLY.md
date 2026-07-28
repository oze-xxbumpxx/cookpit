# IMP-2026-032 保護ファイル適用手順

## 状態（2026-07-28 更新）

- **人間承認**: 取得済み（2026-07-28 チャットで「承認します」）
- **適用**: ✅ **完了**（2026-07-28・commit `1120f93`）。承認層の撤去により
  リモートセッションから直接適用できるようになったため、本パッチ経由ではなく
  作業ブランチで直接編集した。
- **同期文書**: 適用済み。

> **本手順書は歴史的記録**。以降の保護ファイル変更にこの方式は使わない。構成ファイルの
> 承認境界は PR レビューへ移行した（[harness-state-and-approval.md](../../../harness-state-and-approval.md) §5）。
> 下記の「人間が端末から実行する手順」は当時の記録として残すが、`harness-approve.mjs` は
> 現在使用されていない。

## 適用対象（変更 A のみ）

`claude-opus-4-8` → `claude-opus-5`（4 ファイル・frontmatter の 1 行のみ）。

| ファイル                                      | 行  |
| --------------------------------------------- | --- |
| `.claude/agents/orchestrator.md`              | 6   |
| `.claude/agents/reviewer.md`                  | 8   |
| `.claude/agents/security-reviewer.md`         | 6   |
| `.claude/agents/agent-improvement-manager.md` | 7   |

> 変更 B（`implementer.md` の規約再掲削除）は**この適用に含めない**。変更 A 適用後の回帰評価を
> 通過した場合にのみ、別途適用する（proposals/IMP-2026-032.md §変更案）。

## 人間が端末から実行する手順

`.claude/agents/` はディレクトリ前置一致の承認のため、**1 回の承認で 4 ファイルすべてを
バッチ適用できる**（`guard-dangerous.mjs:320-324` — 前置一致の承認は同一 run・期限内に限り再利用可）。

```bash
# 1. run を開始する（承認は runId に束縛される）
node .claude/scripts/harness-run.mjs start

# 2. 承認を発行する（TTY で確認語 "approve" を入力する。AI は実行できない）
node .claude/scripts/harness-approve.mjs --target .claude/agents/ --ttl-minutes 30

# 3. 承認された差分だけを適用する
PATCH=docs/claude-code/improvements/patches/IMP-2026-032
cp "$PATCH/agents/orchestrator.md"              .claude/agents/
cp "$PATCH/agents/reviewer.md"                  .claude/agents/
cp "$PATCH/agents/security-reviewer.md"         .claude/agents/
cp "$PATCH/agents/agent-improvement-manager.md" .claude/agents/

# 4. 承認を取り消す（期限内に残さない）
node .claude/scripts/harness-approve.mjs --revoke
```

### リモートセッションで適用する場合（TTY が無い環境）

環境変数 `HARNESS_APPROVAL_TOKEN` を out-of-band に設定したうえで、手順 2 を次に置き換える。

```bash
node .claude/scripts/harness-approve.mjs --target .claude/agents/ \
  --ttl-minutes 30 --token "$HARNESS_APPROVAL_TOKEN"
```

> トークンは環境変数としてのみ渡す。リポジトリ・ログ・コミットメッセージへ書かない。

## 検証コマンド

```bash
# 期待: 4 件すべて claude-opus-5
rg -n '^model:' .claude/agents/{orchestrator,reviewer,security-reviewer,agent-improvement-manager}.md

# 期待: 出力なし（保護対象と同期文書に旧 ID が残っていない。履歴 record は除外）
rg -n 'claude-opus-4-8' .claude/agents/ docs/claude-code/*.md

# 期待: 差分なし（パッチと適用後が一致）
for f in orchestrator reviewer security-reviewer agent-improvement-manager; do
  diff ".claude/agents/$f.md" "docs/claude-code/improvements/patches/IMP-2026-032/agents/$f.md"
done
```

## ロールバック

```bash
git checkout HEAD -- .claude/agents/
```

適用コミットを含めて戻す場合は、そのコミットを revert する（保護ファイルは単一コミットに
まとめること — improvement-cycle.md §ロールバック）。

## 申し送り: 承認手順の文書ドリフト

`improvement-cycle.md` §リモートセッションでの承認手順（IMP-2026-029）は、承認方式として
`touch .claude/state/config-change-approved` によるマーカー運用を記載しているが、**現在の
実装はこの方式ではない**。`guard-dangerous.mjs` は当該パスへの操作自体を deny し、承認は
`harness-approve.mjs` が発行する runId 束縛・単回使用の JSON（`$HARNESS_STATE_DIR/approval.json`）
でのみ成立する。正典は `harness-state-and-approval.md`。

この記述が残っていると、承認済みの変更を適用しようとした Claude が存在しない手順を実行して
ブロックされる（2026-07-28 に実際に発生）。IMP-2026-029 が解消したはずの
「承認済み変更が適用できないデッドロック」が、**文書ドリフトという別の形で再発している**。
`improvement-cycle.md` の当該節の修正を別提案として起票すること。
