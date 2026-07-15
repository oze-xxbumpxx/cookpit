# Codex Implementation Tasks — pantry-core

Sprint 5 Unit A（Pantry 在庫管理バックエンド一式）を Codex に委譲するための実装指示書。
層単位で分割しており、**番号順に実行する**（依存順）。画面(UI)は対象外（Unit B: pantry-screens、別途）。
在庫引き算連携（Generate への Pantry 注入）も対象外（Unit C、別途）。

## タスク一覧

| #   | ファイル                                       | 対象層             | 概要                                                                                                                  |
| --- | ---------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 1   | [01-domain.md](./01-domain.md)                 | Domain             | `Quantity.subtract()` / `PantryId`・`StockId` / `Pantry` 集約 + `Stock` / `PantryRepository` IF + テスト              |
| 2   | [02-infrastructure.md](./02-infrastructure.md) | Infrastructure     | `stocks` テーブル追記 / PGlite DDL 追記 / マイグレーション生成 / `DrizzlePantryRepository` 実装 + テスト              |
| 3   | [03-application.md](./03-application.md)       | Application        | Pantry DTO / Mapper / エラー2種 / UseCase 3本 → **`CompleteShoppingUseCase`（4集約またぎ・本ユニットの核）** + テスト |
| 4   | [04-api-contract.md](./04-api-contract.md)     | API Contract       | `pantry.schema.ts`（Zod 5 スキーマ）+ 契約テスト                                                                      |
| 5   | [05-presentation.md](./05-presentation.md)     | Presentation (API) | `routes/pantry.ts` 新設 / `shopping-lists.ts` に complete 追加 / `app.ts` 統合                                        |

## 前提（既に確定済み。実装中に変更しない）

要件定義・設計書（S-1〜S-11 全件ユーザー確定 2026-07-14 + S-3 訂正反映済み）・契約設計・
実装計画・試験計画がすべて確定済み。各指示書はこれらから転記した自己完結の内容。詳細な背景・
トレードオフ・全試験ケース一覧が必要な場合のみ参照ドキュメント（下記）を読み取り専用で参照してよい。

## 確定値表（設計判断はすべて確定済み。実装中に変更しない）

| ID    | 確定内容                                                                                                                                                                          |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1   | `PantryRepository.find(): Promise<Pantry>`（引数なし・**常に非 null**）+ `PantryId.singleton()` 固定定数。GetPantry は常に 200                                                    |
| S-2   | `stocks` **単一テーブル**（`pantries` テーブルは作らない）+ `source_shopping_item_id` UNIQUE                                                                                      |
| S-3   | 買い物完了は**冪等成功** + **4 段保存順序（Pantry→Product→ShoppingList→MealPlan）**による自己修復 + UNIQUE 二重追加防止。**価格記録のみ非冪等を許容**（重複記録があり得る）       |
| S-4   | `getBoughtItemsForPantry()` は**作らない**。Application 層で `item.isBought()` filter + 変換。`expiresAt`/`storedLocation` は null                                                |
| S-5   | `Stock.productId: ProductId \| null` + `displayName: string` の両方保持                                                                                                           |
| S-6   | `requiredAmount = null` の bought 品目は `Quantity.of(1, '個')` として Stock 化                                                                                                   |
| S-7   | `Quantity.subtract()` は負値で **throw（厳格）**。過剰消費は `Stock.consume` が**全量消費にクランプ**（責務を取り違えない）                                                       |
| S-8   | `actualPrice = 0`（無料品）は価格記録をスキップ（Stock 追加は行う）                                                                                                               |
| S-9   | `requiredAmount` を `packageSize` に転用して価格記録。スキップ条件 5 種（詳細は Task 3）。**判定順序厳守**                                                                        |
| S-10  | consume/discard に `reason` を受け取らない（履歴テーブルなし。Phase 2）                                                                                                           |
| S-11  | `calculateRequiredAmount`/`findByProduct`/`findExpiringSoon` は**実装しない**（Unit C / Phase 2）                                                                                 |
| D-1   | `CompleteShoppingUseCase` は `application/src/shopping-list/` に配置。API は `POST /api/shopping-lists/:id/complete`                                                              |
| D-2   | `StorageLocation` はプレーン文字列 union。`PantryId` は `singleton()` のみで **`generate()` を持たない**                                                                          |
| D-3   | Consume/Discard の戻り値は更新後 `PantryDto`（全在庫）                                                                                                                            |
| D-4   | 完了時の MealPlan 遷移: 不存在ならスキップ・draft なら二段遷移で修復・shopping なら一段遷移・その他は何もしない                                                                   |
| D-5   | 価格記録は unique productId でグルーピング（Product 1 件につき `findById` 1 回・`save` 1 回）                                                                                     |
| D-6   | `consumeStockSchema.amount.value` は `z.number().positive()`（**0 を reject**）。`unit` は `unitSchema` 再利用                                                                    |
| D-7   | `PantryDto` に Pantry の id を含めない（`{ stocks: StockDto[] }` のみ）                                                                                                           |
| D-8   | 集約またぎ ID 参照（`product_id`/`source_shopping_item_id`）に **FK を張らない**                                                                                                  |
| IMP-1 | マイグレーション出力先は **`apps/web/src/db/migrations/`**・次連番 `0007`（`drizzle-kit generate` 自動採番）                                                                      |
| IMP-2 | `packages/infrastructure/src/testing/create-test-db.ts` の DDL に `stocks` の追記**必須**（漏れると Infrastructure テスト全滅）                                                   |
| IMP-3 | 公開 API（UseCase・DTO・Repository IF・集約公開メソッド）には JSDoc（**型に表せない契約情報のみ**: 不変条件・`@throws`・冪等性。型の言い換えは書かない）                          |
| IMP-4 | `CompleteShoppingInputDto` は **`shopping-list.dto.ts` に追記**（`pantry.dto.ts` に書かない）                                                                                     |
| IMP-5 | complete-shopping のテストは**独立ファイル** `complete-shopping.use-case.test.ts` 新設。InMemory フェイク 4 種はファイル内ローカル定義                                            |
| IMP-6 | 価格記録は productId グループごとに `findById` が非 null なら**常に 1 回 `save`**（1 件も記録されなくても save する。条件分岐で省略しない）                                       |
| IMP-7 | `Stock`/`Pantry`/`StorageLocation`/`CreateStockInput` は単一ファイル `packages/domain/src/pantry/pantry.ts` にまとめる                                                            |
| IMP-8 | `packages/domain/src/index.ts` は**無変更**（Application は深いパスで直接 import する）                                                                                           |
| 契約  | `unitSchema` は `recipe.schema.ts` から import。完了 API は既存 `shoppingListIdParamSchema`/`shoppingListResponseSchema` を再利用（`shopping-list.schema.ts` への変更は**不要**） |

## 完了条件（全タスク通し）

```bash
pnpm lint        # 全 green
pnpm type-check  # 全 green
pnpm test        # 全 green（Domain + Infrastructure + Application + API-Contract + Presentation の新規テスト含む）
```

- 既存テスト（Recipe/Product/Store/MealPlan/ShoppingList/health 関連）に regression がないこと
- **S-3 の保存順序（Pantry→Product→ShoppingList→MealPlan）が `CompleteShoppingUseCase` に
  厳密に反映されていること**（最重要確認点）
- `docs/06-ai-tools.md`「Codex 実装のレビューチェックリスト」の観点（識別子タイポ・
  `import type` 漏れ・バリデーションエラーメッセージ分岐 等）をセルフチェック済みであること
- **作業ブランチでのみコミットする**（main 直コミット禁止。lefthook がブロックする）

## 対象外（このパックで実装しないもの）

- 画面・UI 実装（Unit B: pantry-screens、別セッション）
- `GenerateShoppingListUseCase` への Pantry 注入・在庫引き算・切り上げルール（Unit C）
- `calculateRequiredAmount` / `findByProduct` / `findExpiringSoon`（S-11。Unit C / Phase 2）
- 消費・廃棄の `reason`・履歴テーブル（S-10。Phase 2）
- `pantries` テーブル（S-2。作らない）
- `docs/04-domain-model.md` / `docs/05-roadmap.md` の更新・ADR-0007 起票（実装完了後にメイン側で対応）

## 参照ドキュメント（読み取り専用参照。実装の根拠が必要な場合のみ）

- 要件定義: `docs/requirements/pantry-core.md`
- 設計書: `docs/designs/pantry-core.md`（S-1〜S-11 / D-1〜D-8 の詳細根拠）
- 契約設計: `docs/designs/pantry-core-contract.md`（Zod/Drizzle/Hono の確定形）
- 実装計画: `docs/implementation-plans/pantry-core.md`（IMP-1〜8 の詳細根拠・本パックの転記元）
- 試験計画: `docs/tests/pantry-core.md`（全試験ケース約 143 観点の完全な一覧）
