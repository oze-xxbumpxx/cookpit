# Codex Implementation Tasks — shopping-list-core

Sprint 4 Unit A（ShoppingList バックエンド一式）を Codex に委譲するための実装指示書。
層単位で分割しており、**番号順に実行する**（依存順）。画面(UI)・PWA オフラインは対象外
（Unit B: shopping-list-screens、別途）。

## タスク一覧

| #   | ファイル                                       | 対象層             | 概要                                                                                         |
| --- | ---------------------------------------------- | ------------------ | -------------------------------------------------------------------------------------------- |
| 1   | [01-domain.md](./01-domain.md)                 | Domain             | `Quantity.add()` / ID VO 2種 / `ShoppingList` 集約 + `ShoppingItem` / Repository IF + テスト |
| 2   | [02-infrastructure.md](./02-infrastructure.md) | Infrastructure     | DB スキーマ追記 / PGlite DDL 追記 / マイグレーション生成 / Repository 実装                   |
| 3   | [03-application.md](./03-application.md)       | Application        | DTO / Mapper / エラー3種 / UseCase 5本 + テスト                                              |
| 4   | [04-api-contract.md](./04-api-contract.md)     | API Contract       | Zod スキーマ / 契約テスト                                                                    |
| 5   | [05-presentation.md](./05-presentation.md)     | Presentation (API) | Hono ルート5本 / app.ts 統合                                                                 |

## 前提（既に確定済み。実装中に変更しない）

要件定義・設計書（S-1〜S-11 全件ユーザー確定 2026-07-12 + §契約確定仕様）・実装計画・試験計画が
すべて確定済み。各指示書はこれらから転記した自己完結の内容。詳細な背景・トレードオフ・全試験
ケース一覧が必要な場合のみ参照ドキュメント（下記）を読み取り専用で参照してよい。

## 確定値表（設計判断はすべて確定済み。実装中に変更しない）

| ID    | 確定内容                                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1   | `shopping_items` は**別テーブル**（JSONB 不採用）。`shopping_lists.meal_plan_id` に UNIQUE 制約                                                           |
| S-2   | Pantry 依存なし（`GenerateShoppingListUseCase` に `PantryRepository` を**注入しない**）                                                                   |
| S-3   | Product 名寄せは `productRef` 引き継ぎのみ（ランタイム alias マッチングなし）                                                                             |
| S-4   | 材料集計は「同一キー（productId ?? displayName.trim()）+ 同一単位」のみ `Quantity.add()` で合算。手動追加は合算しない                                     |
| S-5   | `ShoppingItem.requiredAmount: Quantity \| null` + `amountNote: string \| null`（**ちょうど一方が非 null** の排他）                                        |
| S-6   | Generate が MealPlan の `draft→shopping` 遷移を担い**冪等**（既存 active を返す・`created: false`）。部分失敗は再実行時に自己修復。保存順=リスト→MealPlan |
| S-7   | `GetShoppingListUseCase` + `GET /api/shopping-lists/:id` を含む **UseCase 5 本・API 5 本**                                                                |
| S-8   | `ShoppingList.complete()` は Domain 実装（API 非公開）。`getBoughtItemsForPantry()` は実装しない                                                          |
| S-9   | `ShoppingItem.markAsSkipped()` は Domain 実装のみ（UseCase/API なし）。**ガード = pending のみ許可**（bought/skipped からは throw）                       |
| S-10  | `shoppingDate = mealPlan.weekOf.startDate()`（週開始土曜固定）。DB は `date` 型・**ローカル日付整形**（`toISOString().slice` 禁止 = JST 前日ずれ回避）    |
| S-11  | markAsBought は現状態を問わず上書き許容（bought 再適用・skipped→bought 可）。reassignStore は bought でも targetStore のみ変更可。チェック解除は作らない  |
| D-1   | 最安店舗が決定できない場合 `targetStore = null`                                                                                                           |
| D-2   | items 変更系操作すべてに `status === 'active'` ガード（`assertActive`）                                                                                   |
| D-3   | `storeId` の UseCase 層での実在チェックはしない                                                                                                           |
| D-4   | `findByIds` は新設せず `findById` ループ                                                                                                                  |
| D-5   | MarkAsBought / ReassignStore の戻り値は更新後 `ShoppingItemDto`                                                                                           |
| D-6   | status/source は `text` カラム（pgEnum 不採用）。FK は集約内親子のみ。通貨カラムなし（復元時 `'JPY'` 固定）                                               |
| D-7   | 空 `plannedRecipes` の MealPlan からも生成を許容（`items: []`）                                                                                           |
| D-8   | 削除済み Recipe を参照する PlannedRecipe は生成時にスキップ                                                                                               |
| IMP-1 | マイグレーション出力先は **`apps/web/src/db/migrations/`**・次連番 `0006`                                                                                 |
| IMP-2 | `packages/infrastructure/src/testing/create-test-db.ts` の DDL に 2 テーブル追記**必須**（漏れると Infrastructure テスト全滅）                            |
| IMP-3 | DTO の `unit` は `string` ではなく **`Unit` 型**（`@cookpit/domain/src/shared/unit` の `import type`）                                                    |
| IMP-4 | Generate の戻り値は `GenerateShoppingListResultDto{ shoppingList, created }`。ルートで `c.json(result.shoppingList, result.created ? 201 : 200)`          |
| IMP-5 | `ProductId` は `product/product-id.ts` のクラスのみ import（`recipe-ingredient.ts` の同名ローカル型を import しない）                                     |
| 契約  | `errorResponseSchema` は再定義せず `meal-plan.schema.ts` から再利用。`unitSchema` は `recipe.schema.ts` から import                                       |

## 完了条件（全タスク通し）

```bash
pnpm lint        # 全 green
pnpm type-check  # 全 green
pnpm test        # 全 green（Domain + Infrastructure + Application + API-Contract + Presentation の新規テスト含む）
```

- 既存テスト（Recipe/Product/Store/MealPlan/health 関連）に regression がないこと
- `docs/06-ai-tools.md`「Codex 実装のレビューチェックリスト」の観点（識別子タイポ・
  `import type` 漏れ・バリデーションエラーメッセージ分岐 等）をセルフチェック済みであること
- **作業ブランチでのみコミットする**（main 直コミット禁止。lefthook がブロックする）

## 対象外（このパックで実装しないもの）

- 画面・UI 実装・PWA オフライン強化（Unit B: shopping-list-screens、別セッション）
- `CompleteShoppingUseCase`・Pantry 連携・`getBoughtItemsForPantry()`（Sprint 5）
- `markAsSkipped` / `complete()` の **API エンドポイント公開**（ドメインメソッドとしては実装対象）
- 一覧取得（`GET /api/shopping-lists?mealPlanId=` 相当）・削除 API
- `docs/04-domain-model.md` / `docs/05-roadmap.md` の更新（実装完了後にメイン側で対応）

## 参照ドキュメント（読み取り専用参照。実装の根拠が必要な場合のみ）

- 要件定義: `docs/requirements/shopping-list-core.md`
- 設計書: `docs/designs/shopping-list-core.md`（末尾 §契約確定仕様に API 契約の完全定義）
- 実装計画: `docs/implementation-plans/shopping-list-core.md`（IMP-1〜7 の詳細根拠）
- 試験計画: `docs/tests/shopping-list-core.md`（全試験ケースの完全な一覧）
