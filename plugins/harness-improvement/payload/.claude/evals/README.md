# Agent回帰評価セット

Agent構成（スキル / ルール / CLAUDE.md / フック / 残した検証役）を変える前後で、正しいスキルとフックに届くかを見る。

いま使う一覧は[folded-loop-checklist.md](./folded-loop-checklist.md)（10件）。改善サイクルの位置づけは[docs/claude-code/improvement-cycle.md](../../docs/claude-code/improvement-cycle.md)。評価はメインのセッションが`improve-harness`スキルで行う。`agent-evaluator`は起動しない。

## 構成

```
.claude/evals/
├── cases/      代表タスク（実在 6 件。配布元ドメイン向けで休眠）
├── rubrics/    採点基準（scoring-rubric.md）
├── baselines/  改善前（before）の基準スコアの保存先
└── results/    評価結果の保存先（<proposal-id>--<case>.md など）
```

## 使い方

1. まず[folded-loop-checklist.md](./folded-loop-checklist.md)で、依頼が期待するスキル、検証役、フックに届くかを見る。ツールごとの期待を区別する。役をスキルへ移す変更では、同じ文書の「成果物まで確かめる比較」で承認・実装・レビューまで確認する。
2. 古い`cases/*.md`は配布元向けで休眠。導入先の判定には使わない。採点の軸が要るときは`rubrics/scoring-rubric.md`を、beforeとafterの両方に使う。
3. 1軸でも悪化（スコア低下・劣化指標の増加・質問/トークンの増加のみ）があれば採用しない。
4. 結果を`results/`に残し、`evaluations/<IMP-...>.md`に集約する。

## 重要

- 評価ケースは「正解の実装」ではなく「期待される進め方と成果物」を定義する。入口の静的確認ではコードを変更しない。成果物までの比較では、一時チェックアウト内で実装と試験を行う。作業中のリポジトリは変更しない。
- ケースは配布元Cookpitの実構成に紐づいている。導入先用に書き換えるまで評価には使わない。
- 評価そのものに過剰なトークンをかけない。対象ケースは提案の影響範囲に絞る。

## ケース一覧

| ファイル | 想定レベル | 主に測る軸 |
| --- | --- | --- |
| `cases/small-bug-fix.md` | L1 | 不要作業量・過剰な質問の抑制・最小修正 |
| `cases/api-field-addition.md` | L2 | 影響範囲調査・設計/契約整合・実装計画 |
| `cases/refactoring.md` | L2 | スコープ厳守・振る舞い不変・回帰観点 |
| `cases/external-service-failure.md` | L2/L3 | 異常系・冪等性・リトライ・安全性 |
| `cases/documentation-only-change.md` | L0/L1 | 過剰工程の抑制・Agent/トークン効率 |
| `cases/permission-change.md` | L3 | 安全性・ユーザー確認 |

未作成のため一覧から外したもの: `database-schema-change` / `frontend-screen-addition` /
`aws-integration-change` / `contract-validation-change`。必要になったら新設する。
