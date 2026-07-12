# 試験計画: shopping-list-core

- 作成日: 2026-07-12
- 対象スプリント: Sprint 4 Unit A
- 関連設計書: `docs/designs/shopping-list-core.md`（S-1〜S-11 ユーザー確定・§契約確定仕様 確定済み、2026-07-12）
- 関連要件書: `docs/requirements/shopping-list-core.md`（§7 試験観点、§8 論点一覧）
- 変更レベル: L3（Domain / Application / Infrastructure / API-Contract / Presentation 全層）
- 実装状況: **未実装**（`packages/domain/src/shopping-list/` 等の対象ファイルはすべて存在しないことを
  Glob で確認済み。本計画は実装着手前に試験観点を先出しする。implementer は本計画の観点を co-located
  Vitest テストとして実装する）

---

## 1. 概要・前提

### 1-1. テスト対象コンポーネント（設計書 §バックエンド設計 対応）

| 層                     | コンポーネント                                                                                                                      | ファイル（実装後の想定パス）                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Domain                 | `ShoppingListId` / `ShoppingItemId`                                                                                                 | `packages/domain/src/shopping-list/shopping-list-id.ts` / `shopping-item-id.ts`                                       |
| Domain                 | `ShoppingList`（集約）/ `ShoppingItem`（集約内エンティティ）/ 型3種（`ItemStatus`/`ItemSource`/`ShoppingListStatus`）               | `packages/domain/src/shopping-list/shopping-list.ts`                                                                  |
| Domain                 | `ShoppingListRepository`（インターフェース）                                                                                        | `packages/domain/src/shopping-list/shopping-list.repository.ts`                                                       |
| Domain（既存への追加） | `Quantity.add()`（S-4 案 B・共有 VO への純追加）                                                                                    | `packages/domain/src/shared/quantity.ts`（既存ファイル。既存 `quantity.test.ts` に describe 追加）                    |
| Application            | `ShoppingListDto` / `ShoppingItemDto` / 各 InputDto                                                                                 | `packages/application/src/shopping-list/shopping-list.dto.ts`                                                         |
| Application            | `toShoppingListDto` / `toShoppingItemDto`                                                                                           | `packages/application/src/shopping-list/shopping-list.mapper.ts`                                                      |
| Application            | `ShoppingListNotFoundError` / `ShoppingItemNotFoundError` / `InvalidShoppingListStateError`                                         | `packages/application/src/shopping-list/*.error.ts`                                                                   |
| Application            | `GenerateShoppingListUseCase` / `AddItemUseCase` / `MarkAsBoughtUseCase` / `ReassignStoreUseCase` / `GetShoppingListUseCase`（S-7） | `packages/application/src/shopping-list/*.use-case.ts`                                                                |
| Infrastructure         | `DrizzleShoppingListRepository`                                                                                                     | `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.ts`                                        |
| Infrastructure         | `shopping_lists` / `shopping_items` スキーマ・PGlite DDL                                                                            | `packages/infrastructure/src/db/schema.ts`、`packages/infrastructure/src/testing/create-test-db.ts`（DDL 追記が前提） |
| API Contract           | `generateShoppingListSchema` / `addItemSchema` / `markAsBoughtSchema` / `reassignStoreSchema` / param 2 種 / レスポンス 5 種        | `packages/api-contract/src/shopping-list.schema.ts`                                                                   |
| Presentation           | `shoppingListsRoute`（5 エンドポイント）                                                                                            | `apps/web/src/server/routes/shopping-lists.ts`                                                                        |
| Presentation           | `app.ts` の `onError` 追加分岐（3 種）                                                                                              | `apps/web/src/server/app.ts`                                                                                          |

### 1-2. 既存テストの有無・実装コード走査結果

shopping-list 関連のテストは現時点で**存在しない**（`packages/domain/src/shopping-list/` 等 Glob 確認済み。
0 件）。対象パッケージの既存実装コードを走査し、shopping-list-core が依存・拡張する既存 public API を
確認した:

| 対象                                                                                                      | 確認結果                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Quantity`（`packages/domain/src/shared/quantity.ts`）                                                    | `of(value, unit)` / `multiply(factor)` / getter `value`/`unit` のみ。`add()` は不在（設計どおり）。既存 `quantity.test.ts` は Q1〜Q5, Q-GAP-1 の 6 ケース                                                                     |
| `Money`（`packages/domain/src/shared/money.ts`）                                                          | `add()` の実装（`Cannot add different currencies`）が `Quantity.add()` の**そのまま写すべき先例**であることを確認                                                                                                             |
| `RecipeIngredient`（`packages/domain/src/recipe/recipe-ingredient.ts`）                                   | `amount`/`amountNote` 排他検証（`hasAmount === hasAmountNote` で throw）が `ShoppingItem.create()` の排他検証と同文型であることを確認。`recipe-ingredient.test.ts` の I1〜I8 が先例                                           |
| `Product.cheapestStoreAt()`（`packages/domain/src/product/product.ts`）                                   | 価格記録なしで `null` を返す実装済みメソッド。D-1 の根拠として直接利用                                                                                                                                                        |
| `MealPlan.transitionTo()` / `canChangeRecipes()`（`packages/domain/src/meal-plan/meal-plan.ts`）          | `draft→[shopping]` 遷移・ステータスガード先例（`throw new Error(...)` 汎用形）を確認                                                                                                                                          |
| `DrizzleMealPlanRepository`（`packages/infrastructure/src/repositories/drizzle-meal-plan.repository.ts`） | JOIN + グルーピング、`onConflictDoUpdate`、`NOT IN` DELETE、`toDateString`（ローカル日付整形）パターンを確認。`DrizzleShoppingListRepository` が完全踏襲する先例                                                              |
| `create-test-db.ts`（`packages/infrastructure/src/testing/`）                                             | DDL に `shopping_lists`/`shopping_items` の `CREATE TABLE` が**まだ存在しない**ことを確認（Infrastructure 層試験の前提条件）                                                                                                  |
| `mealPlansRoute` / `app.ts`（`apps/web/src/server/`）                                                     | 手動 DI ファクトリ関数 + `zValidator` + `onError` instanceof 分岐パターンを確認。`shoppingListsRoute` が完全踏襲する先例                                                                                                      |
| `meal-plan.schema.test.ts`（`packages/api-contract/src/`）                                                | 契約テストの実装済み先例（Zod `parse`/型往復）。**api-contract は既に Vitest 導入済み**（`package.json` に `test: vitest run`、`vitest.config.ts` あり）。meal-plan-core 試験計画時点（導入前）から状況が変わっている点に注意 |

以下の既存テストを実装パターンの先例として参照する。

| 参照先                                                                                   | パターン                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain/src/shared/money.test.ts`                                               | `add()` の同一種別加算・異種別 throw のテストパターン（`Quantity.add()` がそのまま流用）                                                      |
| `packages/domain/src/recipe/recipe-ingredient.test.ts`                                   | `amount`/`amountNote` 排他検証のテストパターン（`ShoppingItem.create()` がそのまま流用）                                                      |
| `packages/application/src/meal-plan/meal-plan-use-cases.test.ts`                         | `InMemoryMealPlanRepository`（`saveCount`/`seed`/`size` を持つテストダブル）。`InMemoryShoppingListRepository` はこれを踏襲                   |
| `packages/application/src/recipe/recipe-use-cases.test.ts` / `product-use-cases.test.ts` | `InMemoryRecipeRepository` / `InMemoryProductRepository`（`GenerateShoppingListUseCase` が依存する 2 つの Repository のテストダブル先例）     |
| `apps/web/src/server/routes/meal-plans.test.ts`                                          | `vi.mock('@/db/client')` + `vi.mock('@cookpit/application')` で UseCase をモック化する Hono ルートテストパターン                              |
| `packages/api-contract/src/meal-plan.schema.test.ts`                                     | Zod 契約テストのパターン（fixture エンティティ → `reconstruct` → Mapper → `parse()`）                                                         |
| `packages/infrastructure/src/repositories/drizzle-meal-plan.repository.test.ts`          | PGlite 統合テストのパターン（本ファイルは今回未読だが、`drizzle-meal-plan.repository.ts` の実装から同型の JOIN/upsert/DELETE 構造を確認済み） |
| `docs/tests/meal-plan-core.md`                                                           | 本計画のセクション構成・観点 ID 採番方式・防御性試験の先例                                                                                    |

### 1-3. スコープ外（設計書 §対象外・要件書 §1-4 に整合）

- 画面・UI 実装（Unit B `shopping-list-screens`）。本 Unit A に E2E（Playwright）観点は含めない（詳細は §14）
- `CompleteShoppingUseCase` / Pantry 連携の実装試験（Sprint 5）。ただし `ShoppingList.complete()`（Domain・
  API 非公開・S-8）は Domain 単体試験の対象に**含める**
- チェック解除（bought→pending）操作の試験（S-11(d)。Unit A に存在しないため対象外）
- `ItemStatus.skipped` への API 公開試験（S-9。Domain の `markAsSkipped()` は試験対象、UseCase/API は
  存在しないため対象外）
- `GET /api/shopping-lists?mealPlanId=` 相当のクエリ検索試験（S-7 案 B の追加内容外）
- Pantry 依存・`getBoughtItemsForPantry()` 関連試験（S-2/S-8。Sprint 5 スコープ）

---

## 2. テスト実行環境（層別・IMP-012）

各パッケージの vitest 設定の include パターンと、本計画が想定するテストファイル名が実際に拾われる
規約かを実ファイルで確認した。

| 層                        | vitest 設定ファイル                                                                                | include グロブ                                               | 想定テストファイル                                                                                                                                                                                  | 判定                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain`         | `packages/domain/vitest.config.ts` → `@cookpit/config/vitest/base`（`base.cjs`）                   | `src/**/*.test.ts`                                           | `packages/domain/src/shopping-list/shopping-list-id.test.ts`、`shopping-item-id.test.ts`、`shopping-list.test.ts`、既存 `packages/domain/src/shared/quantity.test.ts`（`add()` の describe を追記） | **一致**。すべて `src/**/*.test.ts` に合致し拾われる                                                                                                                                                                                                                                                                                                        |
| `packages/application`    | `packages/application/vitest.config.ts` → 同 base                                                  | `src/**/*.test.ts`                                           | `packages/application/src/shopping-list/shopping-list-use-cases.test.ts`（設計書 §変更後構成に明記済みのファイル名）                                                                                | **一致**                                                                                                                                                                                                                                                                                                                                                    |
| `packages/infrastructure` | `packages/infrastructure/vitest.config.ts` → 同 base                                               | `src/**/*.test.ts`                                           | `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.test.ts`（設計書に明記済み）                                                                                             | **一致**。ただし**前提条件**: `packages/infrastructure/src/testing/create-test-db.ts` の `DDL` 定数に `shopping_lists`/`shopping_items` の `CREATE TABLE IF NOT EXISTS` 文が implementer により追記されていること（現時点で未追記を確認済み）。未追記のままテストを実行すると全ケースが `relation "shopping_lists" does not exist` 等の DB エラーで失敗する |
| `packages/api-contract`   | `packages/api-contract/vitest.config.ts` → 同 base                                                 | `src/**/*.test.ts`                                           | `packages/api-contract/src/shopping-list.schema.test.ts`（設計書 §15 に明記済み）                                                                                                                   | **一致**。meal-plan-core 試験計画時点では api-contract に Vitest 未導入だったが、現時点で `package.json`（`"test": "vitest run"`、`vitest` devDependency）・`vitest.config.ts` が揃っており**導入済み**（`meal-plan.schema.test.ts` が既に存在し稼働中）。本 Unit では基盤整備は不要                                                                        |
| `apps/web`                | `apps/web/vitest.config.mts` → `projects: ['./vitest.node.config.mts', './vitest.dom.config.mts']` | node: `['src/**/*.node.test.ts', 'src/server/**/*.test.ts']` | `apps/web/src/server/routes/shopping-lists.test.ts`                                                                                                                                                 | **一致**。`src/server/**/*.test.ts` パターンに合致（`meal-plans.test.ts` と同じ配置）                                                                                                                                                                                                                                                                       |

**結論**: 全層でテスト基盤・include グロブ・命名規約に不整合はない。唯一の前提条件は
Infrastructure 層の DDL 追記（実装計画のスキーマ追加タスクと同時に行われる想定。本計画は観点を
先出しし、実装順序として「schema.ts 追記 → create-test-db.ts DDL 追記 → Repository 実装 →
Repository テスト」を推奨する）。

実行コマンド: `pnpm lint` / `pnpm type-check` / `pnpm test`（ルートから `turbo test` で全パッケージ横断）。

---

## 3. 公開 API 網羅チェック

設計書 §バックエンド設計・§契約確定仕様に記載された全 public メソッド・static ファクトリ・ゲッターを
列挙し、対応する試験観点 ID を付す（実装コードが存在しないため、設計書の確定仕様を「実装予定コード」
として走査対象にした。実装後に実コードと本表の乖離がないか implementer 側で再確認すること）。

### 3-1. `ShoppingListId` / `ShoppingItemId`

| メソッド                                           | 試験観点                         |
| -------------------------------------------------- | -------------------------------- |
| `static generate(): ShoppingListId`                | SLID-01, SLID-02                 |
| `static fromString(value: string): ShoppingListId` | SLID-03                          |
| `equals(other: ShoppingListId): boolean`           | SLID-04, SLID-05                 |
| `get value(): string`                              | SLID-03（副次確認）              |
| `ShoppingItemId` の同名メソッド一式                | SIID-01〜SIID-05（同一パターン） |

### 3-2. `Quantity.add()`（既存クラスへの追加）

| メソッド                         | 試験観点               |
| -------------------------------- | ---------------------- |
| `add(other: Quantity): Quantity` | QTY-ADD-01〜QTY-ADD-05 |

### 3-3. `ShoppingItem`（集約内エンティティ）

| メソッド                                                                                                   | 試験観点                                       |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `static create(input: CreateShoppingItemInput): ShoppingItem`                                              | SI-CR-01〜SI-CR-09                             |
| `static reconstruct(props: ShoppingItemProps): ShoppingItem`                                               | SI-RC-01                                       |
| `markAsBought(price: Money, store: StoreId): void`                                                         | SI-TR-01, SI-TR-02（S-11a）, SI-TR-03（S-11b） |
| `markAsSkipped(): void`（S-9）                                                                             | SI-TR-04                                       |
| `reassignStore(newStore: StoreId): void`                                                                   | SI-TR-05（含 S-11c は SL 層で確認）            |
| `isBought(): boolean`                                                                                      | SI-IB-01, SI-IB-02                             |
| `get id/productId/displayName/requiredAmount/amountNote/targetStore/status/actualPrice/actualStore/source` | SI-CR-01〜09 の中で網羅的に確認                |

### 3-4. `ShoppingList`（集約ルート）

| メソッド                                      | 試験観点                                          |
| --------------------------------------------- | ------------------------------------------------- |
| `static create(input): ShoppingList`          | SL-CR-01, SL-CR-02, SL-CR-03                      |
| `static reconstruct(props): ShoppingList`     | SL-CR-04                                          |
| `addItem(item: ShoppingItem): void`           | SL-ADD-01, SL-ADD-02（D-2）                       |
| `markAsBought(itemId, price, store): void`    | SL-MB-01, SL-MB-02（D-2）, SL-MB-03（未検出）     |
| `reassignStore(itemId, newStore): void`       | SL-RS-01, SL-RS-02（D-2）, SL-RS-03（未検出）     |
| `markAsSkipped(itemId): void`（S-9）          | SL-SK-01, SL-SK-02（D-2）, SL-SK-03（未検出）     |
| `complete(): void`（S-8）                     | SL-CP-01, SL-CP-02                                |
| `get items(): ShoppingItem[]`（防御的コピー） | SL-DEF-01                                         |
| `get shoppingDate(): Date`（防御的コピー）    | SL-DEF-02                                         |
| `get id/mealPlanId/status/createdAt`          | SL-CR-01〜04、SL-DEF-03（createdAt 防御的コピー） |

### 3-5. `ShoppingListRepository`（インターフェース）

インターフェース自体はテスト対象外。実装（`DrizzleShoppingListRepository`）を通じて INF-01〜INF-18 で
間接的に検証する。

### 3-6. `toShoppingListDto` / `toShoppingItemDto`

| 関数                                       | 試験観点                             |
| ------------------------------------------ | ------------------------------------ |
| `toShoppingListDto(list): ShoppingListDto` | GEN-N-01（間接）, Z-28（契約型往復） |
| `toShoppingItemDto(item): ShoppingItemDto` | ADD-N-01（間接）, Z-28（契約型往復） |

Mapper 単体の専用テストファイルは設計書に明記がないため、UseCase テスト内の DTO 検証と契約テストの
型往復で代替する（meal-plan-core 試験計画と同じ扱い。implementer が Mapper 専用テストを追加すること
は歓迎するが必須にしない）。**注意**: `toShoppingListDto` の `shoppingDate` 整形は
`toISOString().slice(0,10)` を**使わない**（設計書 §Application 設計「Mapper」の注意書き。JST で前日
ずれが起きるため）。この非対称（`meal-plan.mapper.ts` は `toISOString().slice(0,10)` を使っている）が
正しく実装されているかは INF-16（Repository 往復）と GEN-N-01/09（Generate の shoppingDate 検証）で
間接的に確認する。

### 3-7. エラークラス 3 本

| クラス                          | 試験観点                                                                |
| ------------------------------- | ----------------------------------------------------------------------- |
| `ShoppingListNotFoundError`     | ADD-E-01, MB-E-01, RS-E-01, GET-E-01（`message`/`name` 確認込み）       |
| `ShoppingItemNotFoundError`     | MB-E-02, RS-E-02                                                        |
| `InvalidShoppingListStateError` | ADD-E-02, MB-E-03, RS-E-03（`current`/`operation` を含む message 確認） |

`InvalidMealPlanStateError`（既存クラスの流用・GEN-E-02）はエラークラスとしての新規試験は不要（
meal-plan-core で既に試験済み）。流用箇所（`operation: 'generate a ShoppingList from'`）の呼び出し引数
のみ GEN-E-02 で確認する。

### 3-8. UseCase 5 本

| UseCase                                   | 試験観点                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `GenerateShoppingListUseCase.execute()`   | GEN-N-01〜08, GEN-E-01〜02, GEN-IDEM-01〜05, GEN-D8-01〜02, GEN-AGG-01〜08 |
| `AddItemUseCase.execute()`                | ADD-N-01〜05, ADD-E-01〜02, ADD-B-01〜02, ADD-IDEM-01                      |
| `MarkAsBoughtUseCase.execute()`           | MB-N-01〜04, MB-E-01〜03, MB-B-01, MB-DTO-01                               |
| `ReassignStoreUseCase.execute()`          | RS-N-01〜02, RS-E-01〜03, RS-D3-01, RS-DTO-01                              |
| `GetShoppingListUseCase.execute()`（S-7） | GET-N-01, GET-E-01                                                         |

### 3-9. `DrizzleShoppingListRepository`

| メソッド                       | 試験観点               |
| ------------------------------ | ---------------------- |
| `findById(id)`                 | INF-02, INF-03         |
| `findByMealPlanId(mealPlanId)` | INF-04, INF-05         |
| `save(shoppingList)`           | INF-01, INF-06〜INF-18 |

### 3-10. `shopping-list.schema.ts`（Zod）

| スキーマ                                                             | 試験観点                          |
| -------------------------------------------------------------------- | --------------------------------- |
| `generateShoppingListSchema`                                         | Z-01, Z-02                        |
| `addItemSchema`                                                      | Z-03〜Z-12                        |
| `markAsBoughtSchema`                                                 | Z-13〜Z-17                        |
| `reassignStoreSchema`                                                | Z-18〜Z-19                        |
| `shoppingListIdParamSchema` / `shoppingItemIdParamSchema`            | Z-20〜Z-21                        |
| `itemStatusSchema` / `itemSourceSchema` / `shoppingListStatusSchema` | Z-26（enum 値の网羅確認に含める） |
| `shoppingItemResponseSchema`（`superRefine` 込み）                   | Z-22〜Z-26                        |
| `shoppingListResponseSchema`                                         | Z-27, Z-28                        |
| 既存再利用（`unitSchema`/`errorResponseSchema`）                     | Z-31, Z-32                        |

### 3-11. `shoppingListsRoute`（Hono、5 エンドポイント）

| エンドポイント                                            | 試験観点                                      |
| --------------------------------------------------------- | --------------------------------------------- |
| `POST /api/shopping-lists`                                | P-GEN-01〜06                                  |
| `POST /api/shopping-lists/:id/items`                      | P-ADD-01〜04                                  |
| `POST /api/shopping-lists/:id/items/:itemId/bought`       | P-MB-01〜04                                   |
| `POST /api/shopping-lists/:id/items/:itemId/target-store` | P-RS-01〜04                                   |
| `GET /api/shopping-lists/:id`                             | P-GET-01〜03                                  |
| `onError` 追加分岐（3 種）                                | P-ADD-03/04, P-MB-03/04, P-RS-03/04, P-GET-03 |

---

## 4. Domain 層試験観点

テストランナー: Vitest（co-located）。新規ファイル: `packages/domain/src/shopping-list/shopping-list-id.test.ts`、
`shopping-item-id.test.ts`、`shopping-list.test.ts`。既存ファイル追記: `packages/domain/src/shared/quantity.test.ts`。

### 4-1. `ShoppingListId` / `ShoppingItemId`

| #           | 前提                             | 操作                                | 期待結果                                   | 分類 |
| ----------- | -------------------------------- | ----------------------------------- | ------------------------------------------ | ---- |
| SLID-01     | —                                | `ShoppingListId.generate()`         | UUID 形式（`/^[0-9a-f-]{36}$/`）の値を持つ | 正常 |
| SLID-02     | —                                | `ShoppingListId.generate()` を2回   | `equals()` が `false`（毎回異なる UUID）   | 正常 |
| SLID-03     | —                                | `ShoppingListId.fromString('id-1')` | `.value === 'id-1'`                        | 正常 |
| SLID-04     | 同一文字列から生成した2つの ID   | `a.equals(b)`                       | `true`                                     | 正常 |
| SLID-05     | 異なる文字列から生成した2つの ID | `a.equals(b)`                       | `false`                                    | 正常 |
| SIID-01〜05 | 同上                             | `ShoppingItemId` に同一パターン     | 同上                                       | 正常 |

### 4-2. `Quantity.add()`（S-4・共有 VO 変更・最重要）

`Money.add()`（`money.test.ts` M4/M5）を同文型で写す。既存 `quantity.test.ts` に
`describe('Quantity.add')` ブロックを追加する形で実装する。

| #          | 前提                                                                                     | 操作                           | 期待結果                                                                                                                   | 分類   |
| ---------- | ---------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------ |
| QTY-ADD-01 | `Quantity.of(200, 'g')`                                                                  | `.add(Quantity.of(100, 'g'))`  | `value === 300`、`unit === 'g'`                                                                                            | 正常   |
| QTY-ADD-02 | `Quantity.of(100, 'g')`                                                                  | `.add(Quantity.of(1, 'kg'))`   | `Error('Cannot add different units')` を throw（単位変換はしない。g と kg は別単位として扱う）                             | 異常   |
| QTY-ADD-03 | `Quantity.of(100, 'g')`                                                                  | `.add(Quantity.of(0, 'g'))`    | `value === 100`（0 加算で不変）                                                                                            | 境界   |
| QTY-ADD-04 | `Quantity.of(0, 'g')`                                                                    | `.add(Quantity.of(0, 'g'))`    | `value === 0`                                                                                                              | 境界   |
| QTY-ADD-05 | `const a = Quantity.of(100, 'g'); const b = Quantity.of(50, 'g'); const sum = a.add(b);` | `a.value` / `b.value` を再取得 | `a.value === 100`、`b.value === 50`（`add` は新しい `Quantity` を返し、元のインスタンスを変更しない。immutable VO の確認） | 防御性 |

### 4-3. `ShoppingItem.create()` / `reconstruct()`（S-5 排他不変条件・最重要）

`RecipeIngredient.create()`（I1〜I8）と同型の排他検証。`displayName.trim() === ''` の検証も同型。

| #                                | 前提                                                                                             | 操作                                                                                                                                                                                                              | 期待結果                                                                                                                                                                     | 分類 |
| -------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SI-CR-01                         | —                                                                                                | `ShoppingItem.create({ productId: ProductId.fromString('p1'), displayName: '玉ねぎ', requiredAmount: Quantity.of(300, 'g'), amountNote: null, targetStore: StoreId.fromString('s1'), source: 'from_meal_plan' })` | 正常生成。`id` が発行され、`status === 'pending'`、`actualPrice === null`、`actualStore === null`                                                                            | 正常 |
| SI-CR-02                         | —                                                                                                | `displayName: '  '`（空白のみ）で `create()`                                                                                                                                                                      | `Error('Display name is required')` を throw                                                                                                                                 | 異常 |
| SI-CR-03（**S-5 排他・最重要**） | —                                                                                                | `requiredAmount: null, amountNote: null` で `create()`                                                                                                                                                            | 排他条件違反として throw（`RecipeIngredient` の `Either amount or amountNote is required` 相当のメッセージ。実装時に確定するメッセージ文言を implementer が定める）          | 異常 |
| SI-CR-04（**S-5 排他・最重要**） | —                                                                                                | `requiredAmount: Quantity.of(300, 'g'), amountNote: '少々'`（両方非 null）で `create()`                                                                                                                           | 排他条件違反として throw（`amount and amountNote cannot both be set` 相当）                                                                                                  | 異常 |
| SI-CR-05                         | —                                                                                                | `requiredAmount: Quantity.of(300, 'g'), amountNote: null`                                                                                                                                                         | 正常生成（通常の数量材料）                                                                                                                                                   | 正常 |
| SI-CR-06                         | —                                                                                                | `requiredAmount: null, amountNote: '少々'`                                                                                                                                                                        | 正常生成（「適量」「少々」等の非数量材料）                                                                                                                                   | 正常 |
| SI-CR-07                         | —                                                                                                | `productId: null` で `create()`                                                                                                                                                                                   | 正常生成、`productId === null`（S-3: 名寄せ未確定・手動追加）                                                                                                                | 正常 |
| SI-CR-08                         | —                                                                                                | `targetStore: null` で `create()`                                                                                                                                                                                 | 正常生成、`targetStore === null`（D-1: 最安店舗未決定）                                                                                                                      | 正常 |
| SI-CR-09                         | —                                                                                                | `source: 'manually_added'` で `create()`                                                                                                                                                                          | 正常生成、`source === 'manually_added'`                                                                                                                                      | 正常 |
| SI-RC-01                         | 任意の `ShoppingItemProps`（`requiredAmount`/`amountNote` 両方 null 等、不正な組み合わせを含む） | `ShoppingItem.reconstruct(props)`                                                                                                                                                                                 | バリデーションを経ずに props 通り復元される（DB 復元専用の非検証経路。DB は Repository 経由でしか書かれない前提のため実害は薄いが、`create()` を通さないことを明示的に確認） | 正常 |

### 4-4. `ShoppingItem` 状態遷移（S-11 寛容方針・S-9・最重要）

| #                               | 前提                                                                                                  | 操作                                                                    | 期待結果                                                                                                                                                                                                                                                                                                                                                                   | 分類               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| SI-TR-01                        | `status === 'pending'` の ShoppingItem                                                                | `markAsBought(Money.of(198, 'JPY'), StoreId.fromString('s1'))`          | `status === 'bought'`、`actualPrice.amount === 198`、`actualStore.value === 's1'`                                                                                                                                                                                                                                                                                          | 正常               |
| SI-TR-02（**S-11(a)・最重要**） | `status === 'bought'`（`actualPrice: 198円, actualStore: s1` 済み）の ShoppingItem                    | `markAsBought(Money.of(150, 'JPY'), StoreId.fromString('s2'))` を再適用 | エラーにならず**上書き許容**。`status` は引き続き `'bought'`、`actualPrice.amount === 150`（新値に置き換わる）、`actualStore.value === 's2'`（新値に置き換わる）                                                                                                                                                                                                           | 正常・冪等         |
| SI-TR-03（**S-11(b)・最重要**） | `status === 'skipped'` の ShoppingItem                                                                | `markAsBought(Money.of(100, 'JPY'), StoreId.fromString('s1'))`          | エラーにならず許容。`status === 'bought'`（skipped→bought の遷移）                                                                                                                                                                                                                                                                                                         | 正常               |
| SI-TR-04（S-9）                 | `status === 'pending'` の ShoppingItem                                                                | `markAsSkipped()`                                                       | `status === 'skipped'`                                                                                                                                                                                                                                                                                                                                                     | 正常               |
| SI-TR-05（**S-11(c)・最重要**） | `status === 'bought'`（`actualPrice: 198円, actualStore: s1`, `targetStore: s0` 済み）の ShoppingItem | `reassignStore(StoreId.fromString('s2'))`                               | `targetStore.value === 's2'`（変更される）、`status` は `'bought'` のまま変化しない、**`actualPrice.amount === 198`・`actualStore.value === 's1'` は不変**（計画情報と実績情報の独立性を確認する最重要ケース）                                                                                                                                                             | 正常・データ整合性 |
| SI-TR-06                        | `status === 'pending'` の ShoppingItem                                                                | `reassignStore(StoreId.fromString('s2'))`                               | `targetStore.value === 's2'`、`status` は `'pending'` のまま                                                                                                                                                                                                                                                                                                               | 正常               |
| SI-TR-07（境界・要確認）        | `status === 'bought'` の ShoppingItem                                                                 | `markAsSkipped()`                                                       | **設計書に明記がない遷移**（S-9 は「pending → skipped」のみ確定。bought→skipped の可否は未規定）。本試験計画では期待結果を固定せず、実装時に「許容する（寛容方針を bought にも適用）」か「制限なしで無条件遷移する」かのいずれかになる想定で、**実装が選んだ挙動を回帰的に固定するテストとして記録する**（実装前に Orchestrator 経由でユーザー確認が必要な場合は差し戻す） | 境界・要確認       |

### 4-5. `ShoppingItem.isBought()`

| #        | 前提                                               | 操作         | 期待結果 | 分類 |
| -------- | -------------------------------------------------- | ------------ | -------- | ---- |
| SI-IB-01 | `status === 'bought'`                              | `isBought()` | `true`   | 正常 |
| SI-IB-02 | `status === 'pending'` / `'skipped'`（両パターン） | `isBought()` | `false`  | 正常 |

### 4-6. `ShoppingList.create()` / `reconstruct()`

| #        | 前提                                                                          | 操作                                                                                                                          | 期待結果                                                                               | 分類 |
| -------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---- |
| SL-CR-01 | —                                                                             | `ShoppingList.create({ mealPlanId: MealPlanId.fromString('mp1'), items: [], shoppingDate: new Date('2026-07-11T00:00:00') })` | `status === 'active'`、`items` が空配列、`id` が UUID 形式、`createdAt` が現在時刻近傍 | 正常 |
| SL-CR-02 | —                                                                             | `items` に ShoppingItem を2件渡して `create()`                                                                                | `list.items.length === 2`（渡した items がそのまま保持される）                         | 正常 |
| SL-CR-03 | —                                                                             | `ShoppingList.create(...)` を2回                                                                                              | 各 `id` が異なる                                                                       | 正常 |
| SL-CR-04 | 任意の `ShoppingListProps`（`status: 'completed'` かつ不正な items を含む等） | `ShoppingList.reconstruct(props)`                                                                                             | バリデーションを経ずに props 通り復元される                                            | 正常 |

### 4-7. `ShoppingList` 変更系操作と D-2 ガード（`status === 'active'` ガード・最重要）

D-2「items 変更系操作すべてに `status === 'active'` ガード」を `addItem`/`markAsBought`/
`reassignStore`/`markAsSkipped` の全 4 操作で悉皆確認する。

| #                            | 前提                                                   | 操作                                       | 期待結果                                                                       | 分類 |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------ | ---- |
| SL-ADD-01                    | `status === 'active'` の ShoppingList                  | `addItem(item)`                            | `items` に item が追加される                                                   | 正常 |
| SL-ADD-02（**D-2・最重要**） | `status === 'completed'` の ShoppingList（items 1件）  | `addItem(newItem)`                         | `Error`（`Cannot addItem...` 相当）を throw、`items` は変化しない（1件のまま） | 異常 |
| SL-MB-01                     | `status === 'active'`、対象 itemId が存在              | `markAsBought(itemId, price, store)`       | 対象 item が `bought` になる                                                   | 正常 |
| SL-MB-02（D-2）              | `status === 'completed'`                               | `markAsBought(itemId, price, store)`       | `Error` を throw、item は変化しない                                            | 異常 |
| SL-MB-03                     | `status === 'active'`、存在しない itemId               | `markAsBought(存在しないID, price, store)` | `Error('ShoppingItem not found')` を throw                                     | 異常 |
| SL-RS-01                     | `status === 'active'`、対象 itemId が存在              | `reassignStore(itemId, newStore)`          | 対象 item の `targetStore` が更新される                                        | 正常 |
| SL-RS-02（D-2）              | `status === 'completed'`                               | `reassignStore(itemId, newStore)`          | `Error` を throw                                                               | 異常 |
| SL-RS-03                     | `status === 'active'`、存在しない itemId               | `reassignStore(存在しないID, newStore)`    | `Error` を throw                                                               | 異常 |
| SL-SK-01（S-9）              | `status === 'active'`、対象 itemId が存在（`pending`） | `markAsSkipped(itemId)`                    | 対象 item が `skipped` になる                                                  | 正常 |
| SL-SK-02（D-2）              | `status === 'completed'`                               | `markAsSkipped(itemId)`                    | `Error` を throw                                                               | 異常 |
| SL-SK-03                     | `status === 'active'`、存在しない itemId               | `markAsSkipped(存在しないID)`              | `Error` を throw                                                               | 異常 |

### 4-8. `ShoppingList.complete()`（S-8）

| #        | 前提                                          | 操作                    | 期待結果                                                            | 分類 |
| -------- | --------------------------------------------- | ----------------------- | ------------------------------------------------------------------- | ---- |
| SL-CP-01 | `status === 'active'`                         | `complete()`            | `status === 'completed'`                                            | 正常 |
| SL-CP-02 | `status === 'completed'`（`complete()` 済み） | `complete()` を再度呼ぶ | `Error`（`status !== 'active'` ガード）を throw（二重呼び出し拒否） | 異常 |

### 4-9. 防御性（不変条件・防御的コピー・副作用検証）

| #                         | 前提                                       | 操作                                                   | 期待結果                                                                                                                                                                                                                                                                                                                                                                                                                       | 分類   |
| ------------------------- | ------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| SL-DEF-01                 | `addItem` 済みの ShoppingList（items 1件） | `const arr = list.items; arr.push(dummyItem);`         | 直後に再取得した `list.items.length` は変化しない（getter が防御的コピーを返す）                                                                                                                                                                                                                                                                                                                                               | 防御性 |
| SL-DEF-02                 | `ShoppingList.create(...)`                 | `const d = list.shoppingDate; d.setFullYear(2099);`    | 再取得した `list.shoppingDate.getFullYear()` は変化しない                                                                                                                                                                                                                                                                                                                                                                      | 防御性 |
| SL-DEF-03                 | `ShoppingList.create(...)`                 | `const d = list.createdAt; d.setFullYear(2099);`       | 再取得した `list.createdAt.getFullYear()` は変化しない                                                                                                                                                                                                                                                                                                                                                                         | 防御性 |
| SL-DEF-04（不変条件確認） | `ShoppingItem.create()` で生成した item    | `item.markAsBought(...)` 実行後に `item.status` を確認 | `ShoppingItem` は集約内エンティティであり、`ShoppingList` の `items` 配列内の同一インスタンスが更新されている（`ShoppingList.markAsBought` が新しい配列を作らず既存 item を in-place で更新する設計であることの確認。`items` getter が防御的コピーでも中身の `ShoppingItem` インスタンス自体は共有参照であるため、`list.markAsBought()` 後に `list.items.find(...)` で取得した item の `status` が更新後の値になっていること） | 防御性 |

---

## 5. Application 層試験観点（UseCase 5 本、InMemory Repository）

テストランナー: Vitest（co-located: `packages/application/src/shopping-list/shopping-list-use-cases.test.ts`）。
`InMemoryShoppingListRepository`（`InMemoryMealPlanRepository` 先例踏襲。`findById`/`findByMealPlanId`/`save`
を実装し `saveCount` で副作用を観測）、`InMemoryMealPlanRepository`・`InMemoryRecipeRepository`・
`InMemoryProductRepository`（既存の recipe/product テストダブル先例をそのまま流用・再定義）を用意する。

### 5-1. `GenerateShoppingListUseCase`（正常系）

| #                    | 前提                                                                                                                  | 操作                            | 期待結果                                                                                                              | 分類 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---- |
| GEN-N-01             | `mealPlanId`（status=draft）に `plannedRecipes` 1件、対象 Recipe に材料1件（`amount: 300g`, `productRef: p1`）を seed | `execute({ mealPlanId })`       | 新規 `ShoppingListDto`（`status: 'active'`）が返る。`items` に材料1件が反映された `ShoppingItemDto` を含む            | 正常 |
| GEN-N-02             | 同上、`PlannedRecipe.scaleFactor = 1.5`                                                                               | `execute({ mealPlanId })`       | `requiredAmount.value === 450`（`300 * 1.5`。`Recipe.scaleIngredients` 経由の精度確認）                               | 正常 |
| GEN-N-03（S-3 案 A） | 材料に `productRef: ProductId.fromString('p1')` あり                                                                  | `execute({ mealPlanId })`       | 生成された `ShoppingItemDto.productId === 'p1'`（引き継ぎ）                                                           | 正常 |
| GEN-N-04（S-3 案 A） | 材料に `productRef: null`                                                                                             | `execute({ mealPlanId })`       | `ShoppingItemDto.productId === null`                                                                                  | 正常 |
| GEN-N-05（D-1）      | `productId` に紐づく Product が価格履歴を持つ（複数店舗、うち1店舗が最安）                                            | `execute({ mealPlanId })`       | `ShoppingItemDto.targetStoreId` が最安店舗の ID と一致（`Product.cheapestStoreAt(new Date())` の呼び出し結果）        | 正常 |
| GEN-N-06（D-1）      | `productId` が null、または該当 Product が未登録・価格履歴なし                                                        | `execute({ mealPlanId })`       | `ShoppingItemDto.targetStoreId === null`                                                                              | 正常 |
| GEN-N-07（D-7）      | `plannedRecipes` が 0 件の MealPlan（status=draft）                                                                   | `execute({ mealPlanId })`       | `items === []` の `ShoppingListDto` が作成される。かつ MealPlan は `shopping` へ遷移する                              | 正常 |
| GEN-N-08（S-6 案 A） | 上記いずれかの正常系実行後                                                                                            | `mealPlanRepository` から再取得 | `mealPlan.status === 'shopping'`（自動遷移。`mealPlanRepository.saveCount` が 1 増える）                              | 正常 |
| GEN-N-09（S-10）     | `mealPlanId` の `weekOf` が `2026-07-11`（土曜開始週）                                                                | `execute({ mealPlanId })`       | `ShoppingListDto.shoppingDate === '2026-07-11'`（`mealPlan.weekOf.startDate()` 固定。生成時刻に依存しない決定的な値） | 正常 |

### 5-2. `GenerateShoppingListUseCase`（異常系）

| #        | 前提                                                                                                         | 操作                                | 期待結果                                                                                                            | 分類 |
| -------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---- |
| GEN-E-01 | `mealPlanRepository` に対象 `mealPlanId` が存在しない                                                        | `execute({ mealPlanId: '不存在' })` | `MealPlanNotFoundError` を throw                                                                                    | 異常 |
| GEN-E-02 | 既存 ShoppingList なし、MealPlan.status が `shopping`/`cooking`/`consuming`/`completed`（4パターンそれぞれ） | `execute({ mealPlanId })`           | `InvalidMealPlanStateError(mealPlan.status, 'generate a ShoppingList from')` を throw（既存クラスの流用引数を確認） | 異常 |

### 5-3. `GenerateShoppingListUseCase`（S-6 冪等性・部分失敗修復・最重要）

| #                                                      | 前提                                                                                                                                                                                                                         | 操作                                                    | 期待結果                                                                                                                                                                                                                                                                                              | 分類           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| GEN-IDEM-01（**最重要**）                              | `execute({ mealPlanId })` を1回実行済み（MealPlan は `shopping` に遷移済み、`ShoppingList` は active で保存済み）                                                                                                            | 同一 `mealPlanId` で `execute({ mealPlanId })` を再実行 | 新規作成されず、**既存の `ShoppingListDto`（同一 `id`・同一 `items`）がそのまま返る**                                                                                                                                                                                                                 | 正常・冪等     |
| GEN-IDEM-02（**最重要**）                              | 同上                                                                                                                                                                                                                         | 2回目実行後                                             | `shoppingListRepository.saveCount === 1`（1回目実行時のみ保存が発生し、2回目は新規保存が発生しない）                                                                                                                                                                                                  | 冪等性         |
| GEN-IDEM-03（**S-6 部分失敗の自己修復分岐・最重要**）  | 既存 `ShoppingList`（active・items 保持）が `shoppingListRepository` にあるが、対応する `MealPlan` の status が `'draft'` のまま（1回目実行時に「ShoppingList 保存 → MealPlan 遷移保存」の2番目が失敗した状態を模した seed） | `execute({ mealPlanId })`                               | `mealPlan.transitionTo('shopping')` + `mealPlanRepository.save()` が実行されてから既存の `ShoppingListDto` が返る。`mealPlanRepository.saveCount` が実行前より1増える（修復が実際に発生したことを確認）。返る `ShoppingListDto` の `items` は既存のまま変化しない（買い物中のチェック状態を壊さない） | 冪等性・防御性 |
| GEN-IDEM-04                                            | 既存 `ShoppingList` あり、MealPlan.status が `'cooking'`（`draft` でも `shopping` でもない）                                                                                                                                 | `execute({ mealPlanId })`                               | 既存の `ShoppingListDto` がそのまま返る。`mealPlanRepository.saveCount` は増えない（修復分岐に入らず、読み出しの代替として安全に動作する）                                                                                                                                                            | 冪等性         |
| GEN-IDEM-05                                            | 既存 `ShoppingList` なし、MealPlan.status が `'shopping'`（既存リストなしで status ≠ draft）                                                                                                                                 | `execute({ mealPlanId })`                               | GEN-E-02 と同一挙動（`InvalidMealPlanStateError` を throw）。「既存リストあり」の分岐と「既存リストなし」の分岐が正しく区別されていることの確認                                                                                                                                                       | 異常・境界     |
| GEN-UNIQUE-01（Infrastructure へのクロスリファレンス） | —                                                                                                                                                                                                                            | —                                                       | DB レベルの `shopping_lists.meal_plan_id UNIQUE` 制約違反時の挙動は InMemory Repository では再現できない。Infrastructure 層 INF-06 で検証する（本節では言及のみ）                                                                                                                                     | 冪等性（他層） |

### 5-4. `GenerateShoppingListUseCase`（D-8 削除済み Recipe スキップ・D-7 空リスト）

| #         | 前提                                                                                                 | 操作                      | 期待結果                                                                                                    | 分類         |
| --------- | ---------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------ |
| GEN-D8-01 | `plannedRecipes` 2件のうち1件が削除済み Recipe（`recipeRepository.findById` が `null` を返す）を参照 | `execute({ mealPlanId })` | エラーにならず、削除済み Recipe の PlannedRecipe はスキップされる。残り1件の材料のみが `items` に反映される | 正常・防御性 |
| GEN-D8-02 | `plannedRecipes` 全件が削除済み Recipe を参照                                                        | `execute({ mealPlanId })` | `items === []`（D-7 と同じ結果になる。エラーにはならない）                                                  | 境界         |

### 5-5. `GenerateShoppingListUseCase`（S-4 材料集計・S-5 amount=null の境界・最重要）

| #                             | 前提                                                                                                                                      | 操作                      | 期待結果                                                                                                                                                    | 分類 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| GEN-AGG-01（**最重要**）      | 2つの PlannedRecipe（異なる Recipe）がそれぞれ `productId: p1, amount: 200g` の材料を含む                                                 | `execute({ mealPlanId })` | 合算されて `items` に1行（`productId: p1`）のみ、`requiredAmount.value === 400`                                                                             | 正常 |
| GEN-AGG-02                    | 2つの Recipe がそれぞれ `productId: null, displayName: '玉ねぎ', amount: 100g` の材料を含む                                               | `execute({ mealPlanId })` | `displayName.trim()` キーで合算され1行、`value === 200`                                                                                                     | 正常 |
| GEN-AGG-03（**最重要**）      | 同一 `productId: p1` だが単位が異なる材料（`200g` と `1個`）                                                                              | `execute({ mealPlanId })` | 合算せず個別行2件として残る（単位不一致は合算対象外）                                                                                                       | 境界 |
| GEN-AGG-04                    | 同一 `displayName` だが単位が異なる材料（`100g` と `1本`）                                                                                | `execute({ mealPlanId })` | 個別行のまま                                                                                                                                                | 境界 |
| GEN-AGG-05（**S-5・最重要**） | `amount: null, amountNote: '少々'` の材料を含む Recipe が2件、同一 `displayName`（例: 塩）                                                | `execute({ mealPlanId })` | 合算対象外。**個別行2件**として残る（`amount = null` の材料は合算しない）                                                                                   | 境界 |
| GEN-AGG-06                    | 同一キー（`productId`）で `displayName` が異なる複数材料（例: `productRef: p1` に対しレシピ A では「玉ねぎ」、レシピ B では「たまねぎ」） | `execute({ mealPlanId })` | 合算行の `displayName` は**最初に出現した材料**のもの（「玉ねぎ」）になる                                                                                   | 境界 |
| GEN-AGG-07                    | 単一の Recipe に含まれる材料（合算対象なし）                                                                                              | `execute({ mealPlanId })` | 単一行のまま、値は元の材料と一致                                                                                                                            | 正常 |
| GEN-AGG-08                    | `scaleFactor: 1/3`（`0.333...`）の PlannedRecipe、材料 `100g`                                                                             | `execute({ mealPlanId })` | `requiredAmount.value` が丸めなしでそのまま保持される（`100 * (1/3)` の浮動小数点演算結果を検証。四捨五入等の丸め処理を実装が勝手に入れていないことの確認） | 境界 |

### 5-6. `AddItemUseCase`（正常系・異常系・境界）

| #                           | 前提                                                          | 操作                                                                                         | 期待結果                                                                                                                                                | 分類                   |
| --------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| ADD-N-01                    | `status: 'active'` の ShoppingList を seed                    | `execute({ shoppingListId, displayName: '醤油', requiredAmount: { value: 1, unit: '本' } })` | `source === 'manually_added'`、`status === 'pending'` の `ShoppingItemDto` が返る                                                                       | 正常                   |
| ADD-N-02                    | 同上                                                          | `productId: 'p1'` を指定                                                                     | `dto.productId === 'p1'`                                                                                                                                | 正常                   |
| ADD-N-03                    | 同上                                                          | `productId` 未指定（`null`）                                                                 | `dto.productId === null`                                                                                                                                | 正常                   |
| ADD-N-04                    | 同上                                                          | `targetStoreId: 's1'` を指定                                                                 | `dto.targetStoreId === 's1'`                                                                                                                            | 正常                   |
| ADD-N-05                    | 同上                                                          | `targetStoreId` 未指定                                                                       | `dto.targetStoreId === null`                                                                                                                            | 正常                   |
| ADD-E-01                    | `shoppingListRepository` に対象 `shoppingListId` が存在しない | `execute({ shoppingListId: '不存在', ... })`                                                 | `ShoppingListNotFoundError` を throw                                                                                                                    | 異常                   |
| ADD-E-02（D-2）             | `status: 'completed'` の ShoppingList                         | `execute({ shoppingListId, ... })`                                                           | `InvalidShoppingListStateError(status, 'addItem')` を throw                                                                                             | 異常                   |
| ADD-B-01                    | `status: 'active'`                                            | `requiredAmount: { value: 0, unit: 'g' }`                                                    | 正常に通る（`Quantity.of` の非負検証は 0 を許容）                                                                                                       | 境界                   |
| ADD-B-02（防御性）          | `status: 'active'`                                            | `displayName: '  '`（空白のみ。Zod をバイパスした呼び出しを想定した UseCase 単体テスト）     | `ShoppingItem.create()` の Domain ガードで `Error('Display name is required')` を throw（UseCase 自体には Zod 検証がないため、Domain の二重防御を確認） | 異常・防御性           |
| ADD-IDEM-01（非冪等の明示） | `status: 'active'`                                            | 同一内容で `execute()` を2回                                                                 | 2件の `ShoppingItem` が作成される（AddItem は冪等でない。設計書 §エラー処理(c)で明記済みの仕様）                                                        | 冪等性（非冪等の確認） |

### 5-7. `MarkAsBoughtUseCase`（S-11 上書き・skipped→bought・最重要）

| #                              | 前提                                                                 | 操作                                                                                                      | 期待結果                                                                                                                                 | 分類                 |
| ------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| MB-N-01                        | `status: 'active'`、対象 item が `pending`                           | `execute({ shoppingListId, itemId, actualPrice: { amount: 198, currency: 'JPY' }, actualStoreId: 's1' })` | `status === 'bought'`、`actualPrice`/`actualStoreId` が記録される                                                                        | 正常                 |
| MB-N-02                        | 同上、`targetStoreId` が `s0`（提案店舗）                            | `actualStoreId: 's1'`（提案と異なる店）                                                                   | `actualStoreId === 's1'`（提案と異なっても記録できる。`targetStoreId` は変化しない）                                                     | 正常                 |
| MB-N-03（**S-11(a)・最重要**） | 対象 item が既に `bought`（`actualPrice: 198円, actualStoreId: s1`） | `execute({ ..., actualPrice: { amount: 150, currency: 'JPY' }, actualStoreId: 's2' })` を再適用           | エラーにならず上書きされる。`actualPrice.amount === 150`、`actualStoreId === 's2'`                                                       | 正常・冪等（上書き） |
| MB-N-04（**S-11(b)・最重要**） | 対象 item が `skipped`                                               | `execute({ ... })`                                                                                        | エラーにならず `status === 'bought'` に遷移する                                                                                          | 正常                 |
| MB-E-01                        | `shoppingListRepository` に対象 `shoppingListId` が存在しない        | `execute({ shoppingListId: '不存在', ... })`                                                              | `ShoppingListNotFoundError` を throw                                                                                                     | 異常                 |
| MB-E-02                        | `status: 'active'`、存在しない `itemId`                              | `execute({ ..., itemId: '不存在' })`                                                                      | `ShoppingItemNotFoundError` を throw（Domain の `Error('ShoppingItem not found')` を catch して変換）                                    | 異常                 |
| MB-E-03（D-2）                 | `status: 'completed'` の ShoppingList                                | `execute({ ... })`                                                                                        | `InvalidShoppingListStateError(status, 'markAsBought')` を throw（UseCase 入口の事前チェックで検出。Domain の try/catch には到達しない） | 異常                 |
| MB-B-01                        | `status: 'active'`                                                   | `actualPrice: { amount: 0, currency: 'JPY' }`                                                             | 正常に通る（`Money.of` の非負検証は 0 を許容。無料で貰った場合等）                                                                       | 境界                 |
| MB-DTO-01（D-5）               | `execute()` 成功時                                                   | 戻り値を確認                                                                                              | `void` ではなく更新後の `ShoppingItemDto` が返る                                                                                         | 正常                 |

### 5-8. `ReassignStoreUseCase`（S-11(c)・D-3・最重要）

| #                              | 前提                                                                       | 操作                                                       | 期待結果                                                                                                                                                      | 分類               |
| ------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| RS-N-01                        | `status: 'active'`、対象 item が `pending`                                 | `execute({ shoppingListId, itemId, targetStoreId: 's2' })` | `dto.targetStoreId === 's2'`                                                                                                                                  | 正常               |
| RS-N-02（**S-11(c)・最重要**） | 対象 item が `bought`（`actualPrice: 198円, actualStoreId: s1` 記録済み）  | `execute({ ..., targetStoreId: 's3' })`                    | `dto.targetStoreId === 's3'`（変更される）。**`dto.actualPrice.amount === 198`・`dto.actualStoreId === 's1'` は不変**（計画情報のみ更新、実績情報は触れない） | 正常・データ整合性 |
| RS-E-01                        | 対象 `shoppingListId` が存在しない                                         | `execute({ shoppingListId: '不存在', ... })`               | `ShoppingListNotFoundError` を throw                                                                                                                          | 異常               |
| RS-E-02                        | `status: 'active'`、存在しない `itemId`                                    | `execute({ ..., itemId: '不存在' })`                       | `ShoppingItemNotFoundError` を throw                                                                                                                          | 異常               |
| RS-E-03（D-2）                 | `status: 'completed'`                                                      | `execute({ ... })`                                         | `InvalidShoppingListStateError(status, 'reassignStore')` を throw                                                                                             | 異常               |
| RS-D3-01（D-3）                | `status: 'active'`、`targetStoreId` に形式は正しいが実在しない UUID を指定 | `execute({ ..., targetStoreId: '存在しない有効な UUID' })` | エラーにならず正常に処理される（UseCase 層では Store の実在チェックをしない）                                                                                 | 正常・境界         |
| RS-DTO-01（D-5）               | `execute()` 成功時                                                         | 戻り値を確認                                               | 更新後の `ShoppingItemDto` が返る                                                                                                                             | 正常               |

### 5-9. `GetShoppingListUseCase`（S-7）

| #        | 前提                                                    | 操作                                    | 期待結果                                   | 分類 |
| -------- | ------------------------------------------------------- | --------------------------------------- | ------------------------------------------ | ---- |
| GET-N-01 | `shoppingListRepository` に対象 `shoppingListId` が存在 | `execute({ shoppingListId })`           | 対象 `ShoppingListDto`（items 込み）が返る | 正常 |
| GET-E-01 | 対象 `shoppingListId` が存在しない                      | `execute({ shoppingListId: '不存在' })` | `ShoppingListNotFoundError` を throw       | 異常 |

---

## 6. Infrastructure 層試験観点（PGlite 統合）

テストランナー: Vitest（co-located: `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.test.ts`）。

**前提条件（必須）**: `packages/infrastructure/src/testing/create-test-db.ts` の `DDL` 定数に
`shopping_lists`/`shopping_items` の `CREATE TABLE IF NOT EXISTS` 文が追記されていること（設計書
§DB 設計のスキーマ定義と機械的に対応させる。`meal_plans`/`planned_recipes` 追記時の実装計画 G-2 と
同型のタスク）。現時点で未追記であることを確認済み。未追記のままテストを実行すると全ケースが
`relation "shopping_lists" does not exist` 等の DB エラーで失敗する。`shopping_lists.meal_plan_id`
には `UNIQUE` 制約を、`shopping_items.shopping_list_id` には `REFERENCES shopping_lists(id) ON DELETE
CASCADE` と `shopping_items_shopping_list_id_idx` インデックスを DDL に含めること（設計書 §DB 設計の
スキーマ定義どおり）。

| #                                            | 前提                                                                                                                                            | 操作                                                                                              | 期待結果                                                                                                                                                                                                                                 | 分類                 |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| INF-01                                       | 空DB                                                                                                                                            | `repository.save(shoppingList)`（items 2件込み）                                                  | `shopping_lists` テーブルに1行、`shopping_items` テーブルに2行 INSERT される                                                                                                                                                             | 正常                 |
| INF-02                                       | `save()` 済みの ShoppingList                                                                                                                    | `repository.findById(list.id)`                                                                    | ドメイン `ShoppingList` に復元され、`mealPlanId`/`shoppingDate`/`status`/`items` が元の値と一致                                                                                                                                          | 正常                 |
| INF-03                                       | 空DB                                                                                                                                            | `findById(ShoppingListId.generate())`                                                             | `null`                                                                                                                                                                                                                                   | 正常                 |
| INF-04                                       | `save()` 済み                                                                                                                                   | `repository.findByMealPlanId(mealPlanId)`                                                         | 対象 ShoppingList が返る                                                                                                                                                                                                                 | 正常                 |
| INF-05                                       | 空DB                                                                                                                                            | `findByMealPlanId(未保存の MealPlanId)`                                                           | `null`                                                                                                                                                                                                                                   | 正常                 |
| INF-06（**S-6・UNIQUE 制約・最重要**）       | 1件目の ShoppingList（`mealPlanId: mp1`）を `save()` 済み                                                                                       | 同一 `mealPlanId: mp1` を持つ**別インスタンス**（異なる `ShoppingList.id`）を `save()`            | `shopping_lists.meal_plan_id UNIQUE` 制約違反により DB エラーが throw される（「1 MealPlan : 最大 1 ShoppingList」不変条件の最終防衛線。Application 層の冪等ロジックがバイパスされた場合でも DB レベルで二重作成を防ぐことの確認）       | 異常・データ整合性   |
| INF-07                                       | `save()` 済みの ShoppingList の `status` を `'completed'` に変更                                                                                | 同一 `id` で再 `save()`                                                                           | `shopping_lists` テーブルが1行のまま `status` のみ更新される（`onConflictDoUpdate` の `set` 対象が `status` のみで、`mealPlanId`/`shoppingDate`/`createdAt` は不変列であることを個別に確認）                                             | データ整合性         |
| INF-08                                       | items 2件を持つ ShoppingList を `save()` 済み                                                                                                   | ドメイン側で1件を除いた state（`ShoppingList.reconstruct` で items 1件のみに再構成）を再 `save()` | `shopping_items` テーブルから該当行が `DELETE` される（`NOT IN (currentIds)` ロジック確認）                                                                                                                                              | データ整合性         |
| INF-09                                       | items 2件の ShoppingList を `save()` 済み                                                                                                       | items 0件の state で再 `save()`                                                                   | 既存の `shopping_items` がすべて `DELETE` される（`currentIds.length === 0` 時の全 DELETE 分岐）                                                                                                                                         | 境界・データ整合性   |
| INF-10（**S-5 nullability 往復・最重要**）   | `requiredAmount: Quantity.of(300, 'g')`, `amountNote: null` の item を `save()`                                                                 | `findById()` で復元                                                                               | `requiredAmount.value === 300`, `requiredAmount.unit === 'g'`, `amountNote === null`                                                                                                                                                     | データ整合性         |
| INF-11（**S-5 nullability 往復・最重要**）   | `requiredAmount: null`, `amountNote: '少々'` の item を `save()`                                                                                | `findById()` で復元                                                                               | `requiredAmount === null`, `amountNote === '少々'`                                                                                                                                                                                       | データ整合性         |
| INF-12                                       | `actualPrice: null`（未購入）の item を `save()`                                                                                                | `findById()` で復元                                                                               | `actualPrice === null`, `actualStore === null`                                                                                                                                                                                           | 正常                 |
| INF-13（D-6）                                | `actualPrice: Money.of(198, 'JPY')`（bought）の item を `save()`                                                                                | `findById()` で復元                                                                               | `actualPrice.amount === 198`, `actualPrice.currency === 'JPY'`（通貨カラムを持たず常に `'JPY'` を付与して復元することの確認。`drizzle-product.repository.ts` の確定先例どおり）                                                          | データ整合性         |
| INF-14                                       | `productId: null` / `targetStore: null` / `actualStore: null` の item を `save()`                                                               | `findById()` で復元                                                                               | それぞれ `null` のまま                                                                                                                                                                                                                   | 正常                 |
| INF-15                                       | `productId: ProductId.fromString('p1')` / `targetStore: StoreId.fromString('s1')` / `actualStore: StoreId.fromString('s2')` の item を `save()` | `findById()` で復元                                                                               | それぞれ `ProductId.fromString`/`StoreId.fromString` で正しく復元される（`.value` が一致）                                                                                                                                               | データ整合性         |
| INF-16（**S-10 shoppingDate 往復・最重要**） | `shoppingDate: new Date('2026-07-11T00:00:00')`（JST ローカル日付）の ShoppingList を `save()`                                                  | `findById()` / `findByMealPlanId()` で復元                                                        | `shoppingDate` の年月日が保存前と完全一致（`2026-07-11`）。**`toISOString()` ベースの変換による前日ずれが起きないこと**を明示的に確認する回帰テスト（`toDateString`/`toDate` 方式踏襲。meal-plan `weekOf` 往復の I-14 と同型の重点確認） | データ整合性・防御性 |
| INF-17                                       | `save()` 済みの ShoppingList                                                                                                                    | `findById()` で復元                                                                               | `createdAt` が `Date` インスタンスで保存前と一致（`undefined` にならない）                                                                                                                                                               | 正常                 |
| INF-18（対象外・明記のみ）                   | 手動 INSERT で不正な `status`/`source` 文字列を投入するケース                                                                                   | —                                                                                                 | **本試験計画では対象外**。DB は常にアプリ経由（Drizzle）で書き込まれる前提であり、網羅 switch（未知値 throw）は手動 INSERT を想定した試験まで行わない（meal-plan I-18 先例と同一方針）                                                   | 対象外               |

---

## 7. Presentation 層試験観点（Hono ルート）

テストランナー: Vitest（co-located: `apps/web/src/server/routes/shopping-lists.test.ts`）。
`meal-plans.test.ts` のパターン（`vi.mock('@/db/client')` + `vi.mock('@cookpit/application')` で
UseCase をモック化）を踏襲する。

### 7-1. `POST /api/shopping-lists`（Generate）

| #                                          | 前提                                                                         | 操作                                                              | 期待結果                                                                         | 分類       |
| ------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------- |
| P-GEN-01                                   | `GenerateShoppingListUseCase.execute` をモックし `ShoppingListDto` を返す    | `POST /api/shopping-lists` body: `{ "mealPlanId": <uuid> }`       | 201 + `ShoppingListResponse`、`execute` が呼ばれた引数を確認                     | 正常       |
| P-GEN-02（**201/200 分岐・実装時要確認**） | 新規生成のケース                                                             | `POST /api/shopping-lists`（有効な body）                         | **201** が返る                                                                   | 正常       |
| P-GEN-03（**201/200 分岐・実装時要確認**） | 冪等パス（既存 active リストが存在するケース）のシナリオを再現するモック設定 | `POST /api/shopping-lists`（同一 body）                           | **200** が返る（ボディ形状は 201 のケースと同一の `ShoppingListResponse`）       | 正常・冪等 |
| P-GEN-04                                   | —                                                                            | `POST /api/shopping-lists` body: `{ "mealPlanId": "not-a-uuid" }` | 400、`execute` は呼ばれない                                                      | 異常       |
| P-GEN-05                                   | `execute` が `MealPlanNotFoundError` を reject                               | `POST /api/shopping-lists`（有効な body）                         | 404 + `{ "error": "MealPlan not found: ..." }`（`app.ts` の新規 `onError` 分岐） | 異常       |
| P-GEN-06                                   | `execute` が `InvalidMealPlanStateError` を reject                           | 同上                                                              | 422 + `{ "error": "..." }`                                                       | 異常       |

**実装時要確認**（本試験計画では期待結果のみ固定し、実現方法は implementer の裁量とする）: 設計書
§契約確定仕様 §10 は「新規生成: 201 / 冪等既存返却: 200」を確定しているが、`GenerateShoppingListUseCase`
の戻り値型 `ShoppingListDto` には「新規作成か既存返却か」を示すフラグが §Application 設計に明記され
ていない。ルート実装（`c.json(dto, 201)` / `c.json(dto, 200)` の呼び分け）がこの判定をどう行うか
（UseCase が内部フラグを追加で返す・ルートが `findByMealPlanId` を事前に呼んで判定する 等）は本設計書
の記載からは一意に定まらない。P-GEN-02/03 は「どちらの実装方式であっても満たすべき期待結果（ステータス
コードとボディ形状）」として記述しており、モックの具体的な設定方法は implementer が UseCase の実装
方式確定後に具体化する。曖昧さが実装の妨げになる場合は Orchestrator 経由でユーザー確認する。

### 7-2. `POST /api/shopping-lists/:id/items`（AddItem）

| #        | 前提                                                           | 操作                                                                                                                                                             | 期待結果                                                                            | 分類 |
| -------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---- |
| P-ADD-01 | `AddItemUseCase.execute` が `ShoppingItemDto` を返すようモック | `POST /api/shopping-lists/:id/items` body: `{ "displayName": "醤油", "requiredAmount": { "value": 1, "unit": "本" }, "productId": null, "targetStoreId": null }` | 201 + `ShoppingItemResponse`、`execute` に `{ shoppingListId: id, ...body }` が渡る | 正常 |
| P-ADD-02 | —                                                              | `id` 不正 UUID / `displayName` 空文字 / `requiredAmount.value` 負数 / `requiredAmount.unit` 域外 / `productId` キー省略 / `targetStoreId` キー省略 の各パターン  | 400、`execute` は呼ばれない                                                         | 異常 |
| P-ADD-03 | `execute` が `ShoppingListNotFoundError` を reject             | `POST /api/shopping-lists/:id/items`（有効な body）                                                                                                              | 404                                                                                 | 異常 |
| P-ADD-04 | `execute` が `InvalidShoppingListStateError` を reject         | 同上                                                                                                                                                             | 422                                                                                 | 異常 |

### 7-3. `POST /api/shopping-lists/:id/items/:itemId/bought`（MarkAsBought）

| #       | 前提                                                                                              | 操作                                                                                                                          | 期待結果                     | 分類 |
| ------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---- |
| P-MB-01 | `MarkAsBoughtUseCase.execute` が `ShoppingItemDto` を返すようモック                               | `POST .../bought` body: `{ "actualPrice": { "amount": 198, "currency": "JPY" }, "actualStoreId": <uuid> }`                    | 200 + `ShoppingItemResponse` | 正常 |
| P-MB-02 | —                                                                                                 | `id`/`itemId` 不正 UUID、`actualPrice.currency` が `"USD"`、`actualPrice.amount` 負数、`actualStoreId` 不正 UUID の各パターン | 400、`execute` は呼ばれない  | 異常 |
| P-MB-03 | `execute` が `ShoppingListNotFoundError` / `ShoppingItemNotFoundError` を reject（2パターン個別） | `POST .../bought`（有効な body）                                                                                              | 両方とも 404                 | 異常 |
| P-MB-04 | `execute` が `InvalidShoppingListStateError` を reject                                            | 同上                                                                                                                          | 422                          | 異常 |

### 7-4. `POST /api/shopping-lists/:id/items/:itemId/target-store`（ReassignStore）

| #       | 前提                                                                                          | 操作                                                        | 期待結果                     | 分類 |
| ------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------- | ---- |
| P-RS-01 | `ReassignStoreUseCase.execute` が `ShoppingItemDto` を返すようモック                          | `POST .../target-store` body: `{ "targetStoreId": <uuid> }` | 200 + `ShoppingItemResponse` | 正常 |
| P-RS-02 | —                                                                                             | `id`/`itemId`/`targetStoreId` 不正 UUID                     | 400                          | 異常 |
| P-RS-03 | `execute` が `ShoppingListNotFoundError` / `ShoppingItemNotFoundError` を reject（2パターン） | `POST .../target-store`（有効な body）                      | 両方とも 404                 | 異常 |
| P-RS-04 | `execute` が `InvalidShoppingListStateError` を reject                                        | 同上                                                        | 422                          | 異常 |

### 7-5. `GET /api/shopping-lists/:id`（GetShoppingList・S-7）

| #        | 前提                                                                   | 操作                                         | 期待結果                     | 分類 |
| -------- | ---------------------------------------------------------------------- | -------------------------------------------- | ---------------------------- | ---- |
| P-GET-01 | `GetShoppingListUseCase.execute` が `ShoppingListDto` を返すようモック | `GET /api/shopping-lists/:id`                | 200 + `ShoppingListResponse` | 正常 |
| P-GET-02 | —                                                                      | `GET /api/shopping-lists/not-a-uuid`         | 400                          | 異常 |
| P-GET-03 | `execute` が `ShoppingListNotFoundError` を reject                     | `GET /api/shopping-lists/:id`（有効な UUID） | 404                          | 異常 |

### 7-6. 回帰

| #        | 前提                                          | 操作                                                                                                                                                                               | 期待結果                                                                                  | 分類 |
| -------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---- |
| P-REG-01 | `shoppingListsRoute` を `app.ts` にマウント後 | `GET /api/health`、`GET /api/recipes`、`GET /api/products`、`GET /api/stores`、`GET /api/meal-plans/current`                                                                       | 既存レスポンスが変わらない                                                                | 回帰 |
| P-REG-02 | 同上                                          | 既存の `RecipeNotFoundError`/`ProductNotFoundError`/`StoreNotFoundError`/`MealPlanNotFoundError`/`PlannedRecipeNotFoundError`/`InvalidMealPlanStateError` 分岐に該当するリクエスト | 既存の 404/422 挙動が変わらない（新規 3 分岐の追記が既存 6 分岐の順序・挙動に影響しない） | 回帰 |

---

## 8. 契約テスト観点（API Contract）

テストランナー: Vitest（co-located: `packages/api-contract/src/shopping-list.schema.test.ts`）。
**基盤は導入済み**（§2 参照）。`meal-plan.schema.test.ts` のパターン（fixture エンティティ →
`reconstruct` → Mapper → `parse()`）を踏襲する。

### 8-1. リクエストスキーマ

| #                  | 前提 | 操作                                                                                                                                                                                                | 期待結果                                                                                                                     | 分類       |
| ------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Z-01               | —    | `generateShoppingListSchema.parse({ mealPlanId: <valid uuid> })`                                                                                                                                    | 成功                                                                                                                         | 正常       |
| Z-02               | —    | `generateShoppingListSchema.parse({ mealPlanId: 'not-a-uuid' })`                                                                                                                                    | `ZodError`                                                                                                                   | 異常       |
| Z-03               | —    | `addItemSchema.parse({ displayName: '', requiredAmount: {...}, productId: null, targetStoreId: null })`                                                                                             | `ZodError`（`nonBlankString` の trim チェック）                                                                              | 異常       |
| Z-04               | —    | `addItemSchema.parse({ displayName: '   ', ... })`                                                                                                                                                  | `ZodError`（空白のみも reject）                                                                                              | 異常       |
| Z-05（境界）       | —    | `addItemSchema.parse({ displayName: '醤油', requiredAmount: { value: 0, unit: 'g' }, productId: null, targetStoreId: null })`                                                                       | 成功（`.min(0)` は 0 を許容。`Quantity.of` の非負検証と整合）                                                                | 境界       |
| Z-06               | —    | `addItemSchema.parse({ ..., requiredAmount: { value: -1, unit: 'g' } })`                                                                                                                            | `ZodError`（負数 reject）                                                                                                    | 異常       |
| Z-07               | —    | `addItemSchema.parse({ ..., requiredAmount: { value: 1, unit: 'ポンド' } })`                                                                                                                        | `ZodError`（`unitSchema` 17 値の enum 外）                                                                                   | 異常       |
| Z-08               | —    | `unitSchema` の 17 値（`g`/`kg`/`ml`/`l`/`大さじ`/`小さじ`/`cup`/`個`/`本`/`枚`/`玉`/`尾`/`切れ`/`束`/`袋`/`缶`/`合`）それぞれで `addItemSchema.parse({ ..., requiredAmount: { value: 1, unit } })` | 全 17 値で成功（`recipe.schema.ts` の `unitSchema` 再利用が正しく効くことの悉皆確認）                                        | 正常・境界 |
| Z-09（**最重要**） | —    | `addItemSchema.parse({ ..., productId: null, targetStoreId: null })`                                                                                                                                | 成功（`null` は許容）                                                                                                        | 正常       |
| Z-10（**最重要**） | —    | `addItemSchema.parse({ displayName: '醤油', requiredAmount: {...} })`（`productId`/`targetStoreId` キー省略）                                                                                       | `ZodError`（`.nullable()` のみで `.optional()` を付けないため、キー省略は reject。§2 の「optional にしない」確定仕様の検証） | 異常       |
| Z-11               | —    | `addItemSchema.parse({ ..., productId: 'not-a-uuid' })`                                                                                                                                             | `ZodError`                                                                                                                   | 異常       |
| Z-12               | —    | `addItemSchema.parse({ ..., targetStoreId: 'not-a-uuid' })`                                                                                                                                         | `ZodError`                                                                                                                   | 異常       |
| Z-13（境界）       | —    | `markAsBoughtSchema.parse({ actualPrice: { amount: 0, currency: 'JPY' }, actualStoreId: <uuid> })`                                                                                                  | 成功（`Money.of` の非負検証と整合）                                                                                          | 境界       |
| Z-14               | —    | `markAsBoughtSchema.parse({ actualPrice: { amount: -1, currency: 'JPY' }, ... })`                                                                                                                   | `ZodError`                                                                                                                   | 異常       |
| Z-15（**最重要**） | —    | `markAsBoughtSchema.parse({ actualPrice: { amount: 100, currency: 'USD' }, ... })`                                                                                                                  | `ZodError`（`z.literal('JPY')` 固定。S-6 コーディネーター確定の反映確認）                                                    | 異常       |
| Z-16               | —    | `markAsBoughtSchema.parse({ actualPrice: { amount: 100, currency: 'JPY' }, actualStoreId: 'not-a-uuid' })`                                                                                          | `ZodError`                                                                                                                   | 異常       |
| Z-17               | —    | `markAsBoughtSchema.parse({ actualPrice: { amount: 100, currency: 'JPY' }, actualStoreId: <valid uuid> })`                                                                                          | 成功                                                                                                                         | 正常       |
| Z-18               | —    | `reassignStoreSchema.parse({ targetStoreId: 'not-a-uuid' })`                                                                                                                                        | `ZodError`                                                                                                                   | 異常       |
| Z-19               | —    | `reassignStoreSchema.parse({ targetStoreId: <valid uuid> })`                                                                                                                                        | 成功                                                                                                                         | 正常       |
| Z-20               | —    | `shoppingListIdParamSchema.parse({ id: 'not-a-uuid' })`                                                                                                                                             | `ZodError`                                                                                                                   | 異常       |
| Z-21               | —    | `shoppingItemIdParamSchema.parse({ id: <valid uuid>, itemId: 'not-a-uuid' })`                                                                                                                       | `ZodError`                                                                                                                   | 異常       |

### 8-2. レスポンススキーマ（S-5 排他 nullability・最重要）

| #                        | 前提                                                                                                                                                                                                                               | 操作                                                                                                                                                               | 期待結果                                                                            | 分類       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ---------- |
| Z-22（**最重要・S-5**）  | —                                                                                                                                                                                                                                  | `shoppingItemResponseSchema.parse({ ..., requiredAmount: null, amountNote: null, ... })`                                                                           | `ZodError`（`superRefine` で両方 null を reject）                                   | 異常       |
| Z-23（**最重要・S-5**）  | —                                                                                                                                                                                                                                  | `shoppingItemResponseSchema.parse({ ..., requiredAmount: { value: 300, unit: 'g' }, amountNote: '少々', ... })`                                                    | `ZodError`（両方非 null も reject）                                                 | 異常       |
| Z-24（**最重要・S-5**）  | —                                                                                                                                                                                                                                  | `shoppingItemResponseSchema.parse({ ..., requiredAmount: { value: 300, unit: 'g' }, amountNote: null, ... })`                                                      | 成功                                                                                | 正常       |
| Z-25（**最重要・S-5**）  | —                                                                                                                                                                                                                                  | `shoppingItemResponseSchema.parse({ ..., requiredAmount: null, amountNote: '少々', ... })`                                                                         | 成功                                                                                | 正常       |
| Z-26                     | —                                                                                                                                                                                                                                  | `productId`/`targetStoreId`/`actualPrice`/`actualStoreId` の null・非null 全パターン（各フィールド独立に2値 × 4フィールド）で `shoppingItemResponseSchema.parse()` | すべて成功（S-5 の排他条件以外のフィールドは自由に null/非null を組み合わせられる） | 正常・境界 |
| Z-27（D-7）              | —                                                                                                                                                                                                                                  | `shoppingListResponseSchema.parse({ ..., items: [] })`                                                                                                             | 成功（items 0 件でも受理される）                                                    | 境界       |
| Z-28（**型往復・回帰**） | `ShoppingList.reconstruct(...)` + `ShoppingItem.reconstruct(...)`（items 複数件、`requiredAmount`/`amountNote` 双方パターン、`productId`/`targetStoreId`/`actualPrice`/`actualStoreId` の null/非null 全組み合わせを含む fixture） | `toShoppingListDto(list)` → `shoppingListResponseSchema.parse(dto)`                                                                                                | 成功する（Mapper 出力が契約を満たす）                                               | 正常・回帰 |

### 8-3. その他

| #                                    | 前提                                   | 操作                                                                                                                          | 期待結果                                                                                                                                                              | 分類               |
| ------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Z-29                                 | 全 json/param スキーマの reject ケース | Hono `zValidator` 経由の 400 レスポンス                                                                                       | ステータスコードのみ検証（body 構造は固定契約にしない。meal-plan §19-7 と同一方針）                                                                                   | 異常               |
| Z-30（回帰）                         | `shopping-list.schema.ts` 追加後       | 既存 `recipe.schema.test.ts`/`product.schema.test.ts`/`store.schema.test.ts`/`meal-plan.schema.test.ts`（存在するもの）を実行 | 引き続き green のまま                                                                                                                                                 | 回帰               |
| Z-31                                 | —                                      | `import { errorResponseSchema } from './meal-plan.schema'` の再利用箇所を確認                                                 | `shopping-list.schema.ts` 側で `errorResponseSchema` を再定義していないこと（ESM 名前衝突の回避確認）                                                                 | 回帰               |
| Z-32                                 | —                                      | `import { unitSchema } from './recipe.schema'` の再利用確認                                                                   | `requiredAmount.unit`/レスポンスの `unit` フィールドが同一の 17 値 enum を共有していること                                                                            | 回帰               |
| Z-33（201/200 分岐は本節スコープ外） | —                                      | —                                                                                                                             | Generate の新規生成=201・冪等パス=200 の実動作は Presentation 層 P-GEN-02/03（`shopping-lists.test.ts`）の観点。契約テスト側では検証しない（設計書 §15 の方針どおり） | 対象外（明記のみ） |

---

## 9. 冪等性・整合性の観点（横断まとめ）

設計由来の最重要観点を層横断で整理する（実装レビュー時のチェックリストとして利用できる粒度）。

### 9-1. Generate の冪等性・部分失敗修復（S-6）

| 観点                                                                                         | 担当層・観点 ID           |
| -------------------------------------------------------------------------------------------- | ------------------------- |
| 同一 mealPlanId の2回目呼び出しは新規作成しない                                              | GEN-IDEM-01, GEN-IDEM-02  |
| 既存リストあり + MealPlan=draft → 遷移を修復してから返す（自己修復）                         | GEN-IDEM-03（**最重要**） |
| 既存リストあり + MealPlan=draft 以外（例: cooking）→ そのまま返す（修復しない）              | GEN-IDEM-04               |
| 既存リストなし + MealPlan≠draft → 422（新規生成不可）                                        | GEN-E-02, GEN-IDEM-05     |
| DB UNIQUE 制約が最終防衛線（Application 層のロジックがバイパスされても DB が二重作成を拒否） | INF-06（**最重要**）      |
| 新規生成=201 / 冪等既存返却=200 のステータス分岐（ボディ形状は同一）                         | P-GEN-02, P-GEN-03        |

### 9-2. ShoppingItem 状態遷移の寛容方針（S-11）

| 観点                                                                                 | 担当層・観点 ID                                                                                                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| bought への markAsBought 再適用 → 上書き許容（actualPrice/actualStore が新値に置換） | SI-TR-02, MB-N-03（**最重要**）                                                                                                |
| skipped → bought の許容                                                              | SI-TR-03, MB-N-04（**最重要**）                                                                                                |
| bought への reassignStore → targetStore のみ変更、actualPrice/actualStore は不変     | SI-TR-05, RS-N-02（**最重要・データ整合性**）                                                                                  |
| チェック解除（bought→pending）は Unit A に存在しない（境界として記録）               | §1-3 スコープ外に明記。実装時に UseCase/API が誤って追加されていないことをコードレビューで確認（本試験計画には該当ケースなし） |

### 9-3. D-2 status ガードの整合性

| 観点                                                                                               | 担当層・観点 ID                         |
| -------------------------------------------------------------------------------------------------- | --------------------------------------- |
| completed リストへの addItem/markAsBought/reassignStore/markAsSkipped は全操作で一律拒否           | SL-ADD-02, SL-MB-02, SL-RS-02, SL-SK-02 |
| UseCase 入口の事前チェックで status 違反を先に検出（Domain の try/catch には未検出 item のみ到達） | MB-E-03, RS-E-03, ADD-E-02              |

### 9-4. S-5 排他不変条件（requiredAmount xor amountNote）

| 観点                                                                                                     | 担当層・観点 ID                                                                  |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Domain: `ShoppingItem.create()` が排他条件を検証                                                         | SI-CR-03, SI-CR-04（**最重要**）                                                 |
| Infrastructure: DB 往復でも排他性が保たれる（nullability の両パターン）                                  | INF-10, INF-11                                                                   |
| Contract: レスポンススキーマの `superRefine` が同じ条件を二重検証                                        | Z-22〜Z-25（**最重要**）                                                         |
| Application: AddItem は `requiredAmount` 必須（amountNote 付き手動追加は不可。設計上の非対称は意図仕様） | ADD-N-01（`amountNote` を渡さない契約であることの暗黙確認）。Zod 側は Z-03〜Z-12 |

### 9-5. Repository upsert のデータ整合性

| 観点                                                                  | 担当層・観点 ID      |
| --------------------------------------------------------------------- | -------------------- |
| 不変列（mealPlanId/shoppingDate/createdAt）が upsert で書き換わらない | INF-07               |
| NOT IN DELETE パターン（削除された item が正しく除去される）          | INF-08, INF-09       |
| shoppingDate のローカル日付往復（JST 前日ずれの回帰確認）             | INF-16（**最重要**） |

---

## 10. 境界値一覧

| 対象                                                     | 境界                                | 許容/拒否               | 観点 ID                                                |
| -------------------------------------------------------- | ----------------------------------- | ----------------------- | ------------------------------------------------------ |
| `Quantity.of`/`addItemSchema.requiredAmount.value`       | `0`                                 | 許容                    | ADD-B-01, Z-05                                         |
| `Quantity.of`/`addItemSchema.requiredAmount.value`       | 負数                                | 拒否                    | Z-06（Domain 側は既存 `Quantity.of` の Q2 で確認済み） |
| `Money.of`/`markAsBoughtSchema.actualPrice.amount`       | `0`                                 | 許容                    | MB-B-01, Z-13                                          |
| `Money.of`/`markAsBoughtSchema.actualPrice.amount`       | 負数                                | 拒否                    | Z-14（Domain 側は既存 `Money.of` の M3 で確認済み）    |
| `displayName`                                            | 空文字/空白のみ                     | 拒否                    | SI-CR-02, Z-03, Z-04                                   |
| `displayName`                                            | 1文字以上                           | 許容                    | SI-CR-01                                               |
| `unitSchema`（17値）                                     | 列挙外                              | 拒否                    | Z-07                                                   |
| `unitSchema`（17値）                                     | 列挙内すべて                        | 許容                    | Z-08                                                   |
| `actualPrice.currency`                                   | `'JPY'`                             | 許容                    | Z-17                                                   |
| `actualPrice.currency`                                   | `'JPY'` 以外（例: `'USD'`）         | 拒否                    | Z-15（**最重要**）                                     |
| `productId`/`targetStoreId`（Zod契約）                   | `null`                              | 許容                    | Z-09                                                   |
| `productId`/`targetStoreId`（Zod契約）                   | キー省略（`undefined`）             | 拒否                    | Z-10（**最重要**）                                     |
| `Quantity.add()`                                         | 同一単位                            | 加算成功                | QTY-ADD-01                                             |
| `Quantity.add()`                                         | 異なる単位                          | throw                   | QTY-ADD-02                                             |
| `requiredAmount`/`amountNote`（Domain・Contract 双方）   | 両方 null                           | 拒否                    | SI-CR-03, Z-22                                         |
| `requiredAmount`/`amountNote`（Domain・Contract 双方）   | 両方非 null                         | 拒否                    | SI-CR-04, Z-23                                         |
| `requiredAmount`/`amountNote`（Domain・Contract 双方）   | ちょうど一方が非 null               | 許容                    | SI-CR-05/06, Z-24/25                                   |
| `MealPlan.status`（Generate 事前条件・既存リストなし時） | `draft`                             | 許容                    | GEN-N-01                                               |
| `MealPlan.status`（Generate 事前条件・既存リストなし時） | `draft` 以外                        | 拒否（422）             | GEN-E-02                                               |
| `ShoppingList.status`（変更系操作）                      | `active`                            | 許容                    | SL-ADD-01 等                                           |
| `ShoppingList.status`（変更系操作）                      | `completed`                         | 拒否                    | SL-ADD-02 等（D-2）                                    |
| `ShoppingItem.status`（markAsBought の遷移元）           | `pending`/`bought`/`skipped` すべて | 許容（S-11 寛容方針）   | SI-TR-01/02/03                                         |
| `plannedRecipes` 件数                                    | `0`                                 | 許容（空 items で生成） | GEN-N-07（D-7）                                        |
| 削除済み Recipe 混在                                     | あり                                | スキップして継続        | GEN-D8-01（D-8）                                       |
| `scaleFactor`                                            | 小数（例 `1/3`）                    | 丸めなしでそのまま保持  | GEN-AGG-08                                             |
| 材料集計キー（productId優先 or displayName）             | 同一キー+同一単位                   | 合算                    | GEN-AGG-01, GEN-AGG-02                                 |
| 材料集計キー（productId優先 or displayName）             | 同一キー+異なる単位                 | 個別行                  | GEN-AGG-03, GEN-AGG-04                                 |
| 材料集計                                                 | `amount = null` の材料              | 合算対象外・常に個別行  | GEN-AGG-05（S-5）                                      |

---

## 11. 試験データ

各層で共通利用できる fixture の方針を示す（具体的な生成関数は implementer が
`packages/application/src/shopping-list/shopping-list-use-cases.test.ts` 等の各テストファイル内に
実装する。meal-plan-core の `seededMealPlan`/`seededPlannedRecipe` パターンを踏襲）。

| Fixture                                                      | 内容                                                                                                                                                                                         | 用途                                                                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `seededShoppingList(id, mealPlanId, status, items)`          | `ShoppingList.reconstruct(...)` で任意 status・items を組み立てるヘルパー                                                                                                                    | Domain/Application 全般                                                                                     |
| `seededShoppingItem(id, overrides)`                          | `ShoppingItem.reconstruct(...)` で任意フィールドを上書きできるヘルパー（`requiredAmount`/`amountNote` の排他パターン、`status` 各値、nullable フィールド全パターンを容易に生成）             | Domain/Application/Contract 全般                                                                            |
| `seededMealPlan(id, weekIdentifier, status, plannedRecipes)` | 既存 `meal-plan-use-cases.test.ts` の同名ヘルパーをそのまま再利用（GenerateShoppingListUseCase テストで MealPlan を seed）                                                                   | Application（Generate）                                                                                     |
| `seededRecipe(id, ingredients)`                              | 既存 `recipe-use-cases.test.ts` の `seededRecipe` を拡張し、`ingredients: RecipeIngredient[]` を任意設定できるようにする（`productRef` あり/なし、`amount`/`amountNote` 双方パターンを含む） | Application（Generate の材料集計・S-5）                                                                     |
| `seededProduct(id, priceHistory)`                            | 既存 `product-use-cases.test.ts` の `Product.reconstruct` パターンを再利用し、`priceHistory: PriceRecord[]`（複数店舗・価格差あり）を持つ Product と、価格履歴なしの Product の両方を用意    | Application（Generate の D-1 targetStore 決定）                                                             |
| UUID 定数群                                                  | `MEAL_PLAN_ID` / `SHOPPING_LIST_ID` / `SHOPPING_ITEM_ID` / `RECIPE_ID` / `PRODUCT_ID` / `STORE_ID`（複数店舗分）                                                                             | Presentation・Contract のテスト（`meal-plans.test.ts`/`meal-plan.schema.test.ts` の定数命名パターンを踏襲） |
| 週開始土曜の日付定数                                         | `'2026-07-11'`（土曜）を基準に `WeekIdentifier.fromString('2026-07-11')`                                                                                                                     | S-10 shoppingDate 検証（GEN-N-09, INF-16）                                                                  |

**特に用意すべき境界データ**:

- `requiredAmount`/`amountNote` の 4 組み合わせ（両方 null・両方非 null・片方のみ2パターン）
- `unit` 17 値全種の代表データ（少なくとも `g`/`ml`/`個`/`大さじ` 等、系統の異なる単位を複数）
- 同一 `productId` + 異なる `displayName` の材料ペア（GEN-AGG-06 用）
- 削除済み Recipe（`recipeRepository` に存在しない `RecipeId`）を参照する `PlannedRecipe`（GEN-D8 用）
- `ShoppingList.status` が `active`/`completed` それぞれの seed データ（D-2 悉皆確認用）
- `ShoppingItem.status` が `pending`/`bought`/`skipped` それぞれの seed データ（S-11 悉皆確認用）

---

## 12. 回帰範囲（共有 VO Quantity 変更の影響）

`Quantity.add()` は既存クラスへの**純追加**（既存メソッドのシグネチャ変更なし）だが、共有 VO の変更で
あるため、既存利用箇所への影響がないことを明示的に回帰確認する。

| #      | 対象                                                                                                                                     | 確認内容                                                                                                                                                                                                                      | 分類                       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| REG-01 | `packages/domain/src/shared/quantity.test.ts` の既存ケース（Q1〜Q5, Q-GAP-1）                                                            | `add()` 追加後も引き続き green（`of`/`multiply` の挙動が変わらない）                                                                                                                                                          | 回帰                       |
| REG-02 | `packages/domain/src/recipe/recipe.test.ts` / `recipe-ingredient.test.ts`                                                                | `Recipe.scaleIngredients()`（`RecipeIngredient.scale()` 経由で `Quantity.multiply()` のみ使用）が引き続き green。`add()` を使用しないため直接の影響はないが、`quantity.ts` のインポート・エクスポート形が変わらないことを確認 | 回帰                       |
| REG-03 | `packages/domain/src/product/product.test.ts` / `price-record-id.test.ts` / `unit-price-calculator.test.ts`                              | `Product`（`packageSize: Quantity` を持つが `add()` 不使用）が引き続き green                                                                                                                                                  | 回帰                       |
| REG-04 | `packages/application/src/recipe/recipe-use-cases.test.ts` / `packages/application/src/product/product-use-cases.test.ts`                | Recipe/Product の UseCase テストが引き続き green（`Quantity` の型・API に破壊的変更がないことの間接確認）                                                                                                                     | 回帰                       |
| REG-05 | `apps/web/src/server/routes/recipes.test.ts` / `products.test.ts`                                                                        | ルートテストが引き続き green                                                                                                                                                                                                  | 回帰                       |
| REG-06 | `packages/api-contract/src/*.schema.test.ts`（recipe/product/store/meal-plan の既存分）                                                  | `unitSchema` を `shopping-list.schema.ts` からも import する変更が、既存 export に影響しないことを確認                                                                                                                        | 回帰                       |
| REG-07 | `packages/infrastructure/src/db/schema.ts` への `shoppingLists`/`shoppingItems` 追記                                                     | 既存 `recipes`/`stores`/`products`/`price_records`/`meal_plans`/`planned_recipes` の Drizzle Repository テスト（`drizzle-recipe.repository.test.ts` 等）が引き続き green（既存テーブル定義に変更がないこと）                  | 回帰                       |
| REG-08 | `apps/web/src/server/app.ts` への route マウント + onError 3 分岐追加                                                                    | 既存 5 エンドポイント群（recipes/products/stores/meal-plans/health）のレスポンス・既存 6 onError 分岐の挙動が変わらない                                                                                                       | 回帰（P-REG-01/02 と対応） |
| REG-09 | `packages/api-contract/src/index.ts` / `packages/application/src/index.ts` / `packages/infrastructure/src/index.ts` への `export *` 追加 | 既存の named export に名前衝突が発生しないこと（特に `errorResponseSchema` の重複エクスポート回避。Z-31 と対応）                                                                                                              | 回帰                       |

---

## 13. 完了条件

- 本計画の §4〜§8 に記載した全観点（Domain: SLID/SIID/QTY-ADD/SI-CR/SI-TR/SI-IB/SL-CR/SL-ADD/SL-MB/
  SL-RS/SL-SK/SL-CP/SL-DEF、Application: GEN/ADD/MB/RS/GET、Infrastructure: INF、Presentation: P、
  Contract: Z）が対応する co-located テストファイルに実装され、`pnpm test`（`turbo test`）で green
- 特に以下の最重要観点が実装され green であること:
  - **S-6 冪等・自己修復**: GEN-IDEM-01〜05、INF-06（DB UNIQUE）
  - **S-11 寛容遷移**: SI-TR-02/03/05、MB-N-03/04、RS-N-02
  - **S-5 排他不変条件**: SI-CR-03/04、INF-10/11、Z-22〜Z-25
  - **D-2 status ガード**: SL-ADD-02/SL-MB-02/SL-RS-02/SL-SK-02、ADD-E-02/MB-E-03/RS-E-03
  - **S-4 集計と Quantity.add()**: QTY-ADD-01/02、GEN-AGG-01〜08
  - **S-10 shoppingDate**: GEN-N-09、INF-16（前日ずれ回帰）
- `pnpm lint` / `pnpm type-check` / `pnpm test` が全パッケージで通ること
- §2 のテスト実行環境確認どおり、Infrastructure 層の DDL 追記が完了していること（前提条件）
- §12 の回帰範囲（既存 Recipe/Product/MealPlan 関連テスト、既存 5 onError 分岐、既存 export）が
  green のまま保たれていること
- §4-4 SI-TR-07（bought→skipped の遷移可否）が設計に明記のない境界であることが実装レビューで
  認識され、実装が選んだ挙動が回帰テストとして記録されていること（曖昧なまま放置しない）
- §7-1 P-GEN-02/03（201/200 分岐の実現方法）が実装確定後、モックの設定方法が具体化され green

---

## 14. 未実装観点（基盤待ち・E2E 等）

以下は本試験計画のスコープに含めるが、Unit A（本ユニット）の実装だけでは実行できない、または
明示的に対象外とする観点。

| 観点                                                                                | 理由・扱い                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E2E（Playwright）: 献立生成 → 買い物リスト生成 → チェック → 完了の一連シナリオ      | Unit B（`shopping-list-screens`）のスコープ。e2e-test-implementer が Unit B 実装後に画面操作込みで実装する。本計画は API 単体・統合テストまでを扱う                                                                                                                                                    |
| DB レベルでの真の同時実行（race condition）による UNIQUE 制約競合の再現             | PGlite 上での並行トランザクション再現は困難。INF-06 は「順次 `save()` で2回目がエラーになる」ことの確認にとどめ、真の同時アクセス競合（2 リクエストが同時に `findByMealPlanId` の null を見てから同時に `save()` する競合状態）は本試験計画の対象外とする。実運用は 2 名利用の低頻度アクセスのため許容 |
| Pantry 連携（`getBoughtItemsForPantry()` 等）                                       | Sprint 5 スコープ。設計書 S-8 により `getBoughtItemsForPantry()` 自体が Sprint 4 で実装されないため試験対象外                                                                                                                                                                                          |
| チェック解除（bought→pending）操作                                                  | S-11(d) により Unit A に存在しない。Unit B での UseCase 追加時に別途試験計画を起票する                                                                                                                                                                                                                 |
| `ItemStatus.skipped` への API 経由到達（`MarkAsSkippedUseCase`/API エンドポイント） | S-9 により UseCase/API 非公開。Domain の `markAsSkipped()`/`ShoppingList.markAsSkipped()` は SI-TR-04/SL-SK-01〜03 で試験済みだが、API 経由の試験は対象外                                                                                                                                              |
| `GET /api/shopping-lists?mealPlanId=` クエリ検索                                    | S-7 案 B の追加内容外。Unit B 設計で再訪                                                                                                                                                                                                                                                               |
| `docs/04-domain-model.md` の ShoppingList 擬似コード同期後の再検証                  | R-6（設計書リスク）。ドキュメント同期作業自体はテスト観点ではないため対象外。同期後に本試験計画との齟齬がないか implementer が確認することを推奨                                                                                                                                                       |
| SI-TR-07（bought→skipped 遷移の可否）                                               | §13 完了条件に記載のとおり、設計に明記のない境界。実装時に確定した挙動を回帰テストとして固定する（新規の仕様判断はここでは行わない）                                                                                                                                                                   |

---

（本計画はコードを変更しない。試験観点・計画の記録のみを目的とする。テストコードの実装は
implementer の責務。）
