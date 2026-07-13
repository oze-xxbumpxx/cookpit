# ADR-0006: ShoppingList 生成を冪等にし、MealPlan 遷移の担当と meal_plan_id UNIQUE 制約を導入する

- Status: Accepted（2026-07-12 ユーザー確定・S-6。実装済み: Sprint 4 Unit A）
- Date: 2026-07-13
- 関連 feature: shopping-list-core

## Context（背景・なぜ判断が必要か）

`GenerateShoppingListUseCase` は 1 回の実行で 2 つの集約を更新する
（ShoppingList の新規作成 + MealPlan の `draft→shopping` 遷移）。現行の Repository 構成は
DB トランザクションを導入していないため、2 番目の保存が失敗すると部分失敗の窓が残る。
また「1 MealPlan : 最大 1 ShoppingList」という不変条件は集約単体では守れない。

このため次の 2 論点の確定が必要だった（要件 8-5）:

- (a) Generate が MealPlan の取得・遷移・保存まで担うか
- (b) 同一 MealPlan への 2 回目の呼び出し（リトライ・誤操作・2 人同時操作）をどう扱うか

## Decision（採用した決定）

**(a) 案 A + (b) 案 B2（冪等）** を採用する。

1. Generate が MealPlan の `draft→shopping` 遷移を担う（生成成功時に自動遷移）
2. 冪等: 既存 ShoppingList があれば新規生成せずそれを返す（`created: false`）。
   ルート層は新規生成 201 / 冪等既存返却 200 を `GenerateShoppingListResultDto.created` で返し分ける
3. 不変条件「1 MealPlan : 最大 1 ShoppingList」を DB の `shopping_lists.meal_plan_id`
   UNIQUE 制約で担保する（C-3 の `week_start_date UNIQUE` と同型。冪等判定用の
   `ShoppingListRepository.findByMealPlanId()` のインデックスを兼ねる）
4. 部分失敗の自己修復: 保存順は「ShoppingList → MealPlan」。後段失敗で
   「リストあり・MealPlan は draft」となった場合、再実行時に遷移を修復してから既存リストを返す。
   Sprint 4 ではトランザクションを導入しない（現行 Repository の先例に合わせる）
5. 既存リストなしで `MealPlan.status !== 'draft'` の場合は `InvalidMealPlanStateError`（422）

## Alternatives（検討した非採用案と却下理由）

| 論点 | 非採用案                                    | 却下理由                                                                                                 |
| ---- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| (a)  | B: 遷移は別 UseCase に分離                  | meal-plan-core 設計書・roadmap の前方参照と矛盾。生成後も MealPlan が draft のまま「買い物中」を判別不能 |
| (a)  | C: 遷移するが失敗時ロールバックなし         | 非トランザクション構成では案 A と実質同じ問題。(b) の修復設計で吸収する方が明確                          |
| (b)  | B1: エラー方式（既存ありなら 422）          | リトライ・誤操作・2 人同時操作に弱い。roadmap 完了条件「2 人で同じリストを見る」と相性が悪い             |
| (b)  | B3: 再生成（既存を破棄して作り直す）        | 買い物途中のチェック状態が消える危険。明示的な「作り直し」は将来の別 UseCase とすべき                    |
| —    | DB トランザクション導入で部分失敗自体を排除 | 全 Repository 構成に波及する横断課題。Sprint 4 スコープを超えるため申し送り（設計書 §リスク R-3）        |

## Consequences（良い影響・悪い影響・残るリスク）

- 良: 重複リクエストに安全（2 名利用の個人アプリで最重要）。部分失敗が再実行で収束する。
  UNIQUE 制約が不変条件の最終防衛線とインデックスを兼ねる
- 悪: `POST /api/shopping-lists` が 200 / 201 の 2 ステータスを返すため、クライアントは
  ステータスコードで新規/既存を判別する契約になる（契約確定仕様 §10 に明記済み）
- リスク 1: 非トランザクションの部分失敗の窓自体は残る（一時的不整合はありうるが再実行で収束。R-3）
- リスク 2: 将来 MealPlan の遷移 API が公開され「shopping→draft に戻して再生成」が可能になると、
  冪等設計では古いリストが返り続ける。その時点で「明示的な再生成 UseCase」の要否を再訪する
  （設計書 §未決事項）

## Migration（移行が必要な場合の手順。不要なら「対象外」）

対象外（新規テーブル導入のマイグレーション 0006 に UNIQUE 制約込みで含まれており、既存データなし）。

## Rollback（決定を戻す場合の手順）

1. `shopping_lists.meal_plan_id` の UNIQUE 制約を外すマイグレーションを追加
2. `GenerateShoppingListUseCase` の冪等分岐（既存返却 + 修復）をエラー方式（案 B1・422）へ差し替え
3. ルートの `created ? 201 : 200` 分岐と `GenerateShoppingListResultDto.created` を削除

ただしクライアントがリトライ安全性に依存した後の変更は破壊的変更になるため、
戻す場合は Unit B（画面）着手前が望ましい。

## References（設計書・要件・関連 ADR・外部資料へのリンク）

- 設計書: `docs/designs/shopping-list-core.md` §S-6（案比較・付随確定 5 点）・§リスク R-3・
  §契約確定仕様（冪等性キー表・§10 ステータスマッピング）
- 要件: `docs/requirements/shopping-list-core.md` 8-5
- 同型の先例: meal-plan-core の C-3（CreateMealPlan 冪等 + `week_start_date` UNIQUE）
- 実装: `packages/application/src/shopping-list/generate-shopping-list.use-case.ts` /
  `apps/web/src/server/routes/shopping-lists.ts`（PR #54 / #57）
