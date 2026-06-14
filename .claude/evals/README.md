# Agent 回帰評価セット

Agent 構成（Agent / Skill / Rule / CLAUDE.md / Hook）を変更する前後で品質が悪化していないかを
確認するための、代表的なタスクセットと採点基準。

改善サイクルの位置づけは [docs/claude-code/improvement-cycle.md](../../docs/claude-code/improvement-cycle.md)
を参照。評価は `agent-evaluator` が実施する。

## 構成

```
.claude/evals/
├── cases/      代表タスク（Cookpit の Recipe ドメインに即した 10 ケース）
├── rubrics/    採点基準（scoring-rubric.md）
├── baselines/  改善前（before）の基準スコアの保存先
└── results/    評価結果の保存先（<proposal-id>--<case>.md など）
```

## 使い方

1. 改善提案（`docs/claude-code/improvements/proposals/<IMP-...>.md`）の変更対象に応じ、
   manager が関連する `cases/*.md` を選ぶ。
2. `agent-evaluator` が **before（現状構成）** と **after（差分適用後の想定）** の両方で、
   各ケースを `rubrics/scoring-rubric.md` の軸で採点する。
3. 1 軸でも悪化（スコア低下・劣化指標の増加・質問/トークンの増加のみ）があれば採用しない。
4. 結果を `results/` に残し、`evaluations/<IMP-...>.md` に集約する。

## 重要

- 評価ケースは「正解の実装」ではなく「**期待される進め方と成果物**」を定義する。実コードを
  変更せずに、Agent の判断・成果物の質を測ることを目的とする。
- ケースは Cookpit の実構成（`packages/domain` `application` `infrastructure` `api-contract` /
  `apps/web`）に紐づける。プロジェクトが変わったら内容も更新する。
- 評価そのものに過剰なトークンをかけない。対象ケースは提案の影響範囲に絞る。

## ケース一覧

| ファイル | 想定レベル | 主に測る軸 |
| --- | --- | --- |
| `cases/small-bug-fix.md` | L1 | 不要作業量・過剰な質問の抑制・最小修正 |
| `cases/api-field-addition.md` | L2 | 影響範囲調査・設計/契約整合・実装計画 |
| `cases/database-schema-change.md` | L2/L3 | 後方互換・移行・層の責務分離 |
| `cases/frontend-screen-addition.md` | L2 | Presentation 層方針・契約利用・テスト |
| `cases/aws-integration-change.md` | L2/L3 | 外部依存・設定/秘匿情報・ロールバック |
| `cases/refactoring.md` | L2 | スコープ厳守・振る舞い不変・回帰観点 |
| `cases/contract-validation-change.md` | L2/L3 | 契約品質・後方互換・contract-designer 起動 |
| `cases/external-service-failure.md` | L2/L3 | 異常系・冪等性・リトライ・安全性 |
| `cases/documentation-only-change.md` | L0/L1 | 過剰工程の抑制・Agent/トークン効率 |
| `cases/permission-change.md` | L3 | 安全性・ユーザー確認（**MVP1 は N/A**：認証未導入） |

> 指示書 §18 の `graphql-validation-change` は Cookpit が GraphQL 未使用のため
> `contract-validation-change`（Hono RPC + Zod）に、`aws-event-flow-change` は
> `aws-integration-change` に翻案。`permission-change` は MVP1 の no-auth（docs/003・004）の
> ため現状 N/A とし、認証導入時に有効化する。
