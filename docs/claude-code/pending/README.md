# pending/ — 適用待ちのパッチ

保護対象（`.claude/` 配下・`CLAUDE.md`・`lefthook.yml`・`.github/workflows/`）への変更のうち、
**AI が適用できないもの**を一時的に置く場所。適用したら**必ず削除**する。

## なぜここに置くのか

`guard-dangerous.mjs` は保護対象への書き込みに人間承認を要求する。承認の発行
（`harness-approve.mjs`）は TTY か out-of-band トークンを要求するため、**リモートの
Claude Code セッションからは発行できない**。人間がこの環境に端末を持たないためである。

結果として、保護対象の修正は「検証済みパッチを残して人間が適用する」形になる。
この制約自体の評価は [harness-owner-setup.md](../harness-owner-setup.md) §2 を参照。

## 適用待ち

### 2026-07-26-harness-audit-fixes.patch

再監査（2026-07-26）で発見した Critical / High 欠陥の修正。**検証済み・未適用**。

| 修正   | 内容                                                                                                                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-001  | `toRepoRelative` に `path.resolve` による正規化を追加。`.claude/./hooks/` `.claude//hooks/` `.claude/../.claude/hooks/` が保護対象から漏れていた。あわせて case-insensitive FS 向けに大文字小文字を無視した照合を追加 |
| R-003  | `node -e` / `python -c` 等のインライン実行が、リテラルの保護対象パスを含んでいても素通りしていた経路を封鎖                                                                                                            |
| R-004  | `updateRunState` の read-modify-write をロック区間に収めた。並行更新で 4 件中 3 件が無言で失われていた                                                                                                                |
| R-005  | `assertOutsideRepo` が project root 不在時に祖先まで遡って誤判定し、コンテナ破棄後の復旧を壊していた問題を修正                                                                                                        |
| テスト | 回帰テスト 11 件を追加（75 → 86 件）                                                                                                                                                                                  |

検証結果（候補ツリーで実行済み）:

- 攻撃スイート 31 ケース: **31/31 期待どおり**（前回突破した 11 件をすべて拒否、通常操作 10 件は許可のまま）
- ハーネステスト: **86/86 成功**
- 並行更新 6 プロセス: **失われた更新なし**
- project root 不在での状態解決: **成功**

### 適用手順（人間が実行）

```bash
git fetch origin
git checkout claude/ai-harness-maturity-diagnosis-hgfkk3
git pull

# 承認を発行してから適用する（手順書 §2）
node .claude/scripts/harness-run.mjs start
node .claude/scripts/harness-approve.mjs --target .claude/ --ttl-minutes 30

git apply docs/claude-code/pending/2026-07-26-harness-audit-fixes.patch
pnpm test:harness          # 86/86 になること
bash .claude/scripts/run-quality-gates.sh --all

node .claude/scripts/harness-approve.mjs --revoke
git rm -r docs/claude-code/pending
git commit -am "fix(harness): 再監査で発見した保護境界の欠陥を修正する"
```

> `git apply` は `guard-dangerous.mjs` が deny する。上記は**人間の端末**で実行する前提。
