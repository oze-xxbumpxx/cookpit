# 契約設計: pantry-core

> §集約設計・DB設計・API設計・S-x/D-x は `docs/designs/pantry-core.md` を参照。
> 本書はその API/DB 契約を implementer（Codex）が Zod/Drizzle/Hono を追加検討なしに
> 実装できる詳細水準まで落とすものであり、本体設計書と矛盾する記述は無効（矛盾に気づいた
> 場合は Orchestrator へ差し戻す）。

- ステータス: **draft**（`docs/designs/pantry-core.md` の S-x がユーザー確定するまで本書も draft）
- 対象: `packages/api-contract`（Zod）/ `packages/infrastructure/src/db/schema.ts`（Drizzle）/
  Hono RPC（`apps/web/src/server/routes/pantry.ts` 新設・`shopping-lists.ts` 追記・`app.ts` 追記）
- 参照した既存契約: `shopping-list.schema.ts`（+ `.test.ts`）/ `meal-plan.schema.ts` /
  `recipe.schema.ts`（`unitSchema`）/ `index.ts` / `db/schema.ts` / `app.ts` / `routes/shopping-lists.ts`
- プロダクションコードは変更しない（実装は後続 Codex）。

---

## 1. Zod スキーマ契約（`packages/api-contract`）

### 1.1 新規ファイル `packages/api-contract/src/pantry.schema.ts`

既存パターン（`shopping-list.schema.ts` の `nonBlankString` local helper、`recipe.schema.ts` の
`unitSchema`）に倣う。`unitSchema` は `recipe.schema.ts` から import して再利用（独自定義しない）。

```typescript
import z from 'zod';
import { unitSchema } from './recipe.schema';

export const stockIdParamSchema = z.object({
  stockId: z.uuid(),
});

export const consumeStockSchema = z.object({
  amount: z.object({
    value: z.number().positive(), // D-6: 0 を reject（Quantity.of(0) は Domain では合法だが契約層で入力ミス防止）
    unit: unitSchema,
  }),
});

export const storageLocationSchema = z.enum(['fridge', 'freezer', 'pantry']); // D-2

export const stockResponseSchema = z.object({
  id: z.uuid(),
  productId: z.uuid().nullable(),
  displayName: z.string(),
  amount: z.object({ value: z.number(), unit: unitSchema }),
  purchasedAt: z.iso.datetime(),
  expiresAt: z.iso.date().nullable(),
  storedLocation: storageLocationSchema.nullable(),
});

export const pantryResponseSchema = z.object({
  stocks: z.array(stockResponseSchema), // D-7: pantry id は含めない
});

export type StockIdParam = z.infer<typeof stockIdParamSchema>;
export type ConsumeStockBody = z.infer<typeof consumeStockSchema>;
export type StorageLocationSchemaType = z.infer<typeof storageLocationSchema>;
export type StockResponse = z.infer<typeof stockResponseSchema>;
export type PantryResponse = z.infer<typeof pantryResponseSchema>;
```

**discard API にリクエストボディスキーマは存在しない**（S-10。ボディなし POST。Hono ルートに
`zValidator('json', ...)` を付けない）。

**完了 API（`POST /api/shopping-lists/:id/complete`）にも新規リクエストスキーマは存在しない**。
ボディなし・param は既存 `shoppingListIdParamSchema`（`shopping-list.schema.ts`）をそのまま再利用する。
レスポンスも既存 `shoppingListResponseSchema` / `ShoppingListResponse` を再利用し、`shopping-list.schema.ts`
への変更は**不要**（申し送り「新規スキーマ追加は pantry.schema.ts の 2 本 + stockIdParamSchema のみ」と一致）。

### 1.2 `packages/api-contract/src/index.ts` への追記

```typescript
export * from './pantry.schema';
```

（1 行追記のみ。既存 5 行の末尾に追加。既存 export の並び順・内容に変更なし）

### 1.3 スキーマ一覧まとめ

| スキーマ名 | ファイル | 用途 | 新規/再利用 |
| --- | --- | --- | --- |
| `stockIdParamSchema` | `pantry.schema.ts` | Consume/Discard の param | 新規 |
| `consumeStockSchema` | `pantry.schema.ts` | Consume の json body | 新規 |
| `storageLocationSchema` | `pantry.schema.ts` | `StockDto.storedLocation` の enum | 新規 |
| `stockResponseSchema` | `pantry.schema.ts` | `StockDto` の応答検証 | 新規 |
| `pantryResponseSchema` | `pantry.schema.ts` | `PantryDto` の応答検証 | 新規 |
| `unitSchema` | `recipe.schema.ts` | 数量単位（17 値） | 再利用（import） |
| `shoppingListIdParamSchema` | `shopping-list.schema.ts` | 完了 API の param | 再利用 |
| `shoppingListResponseSchema` | `shopping-list.schema.ts` | 完了 API の応答 | 再利用 |

`shopping-list.schema.ts` 自体への変更は不要（S-3 の申し送りどおり）。discard API 用の
json スキーマは存在しない（ボディなし）。

---

## 2. Drizzle スキーマ契約（`packages/infrastructure/src/db/schema.ts`）

`docs/designs/pantry-core.md` §S-2 案 A（`stocks` 単一テーブル）を正とする。以下は
その列・制約・index の確定表（本体設計書のコード片と一致。追加変更なし）。

### 2.1 `stocks` テーブル

| カラム | Drizzle 型 | 制約 | ドメイン対応 | 備考 |
| --- | --- | --- | --- | --- |
| `id` | `text('id')` | PRIMARY KEY | `Stock.id`（StockId） | UUID 文字列 |
| `product_id` | `text('product_id')` | NULL 許容・FK なし | `Stock.productId`（ProductId \| null） | D-8: 集約またぎ ID 参照・FK なし |
| `display_name` | `text('display_name')` | NOT NULL | `Stock.displayName` | S-5 |
| `amount_value` | `numeric('amount_value', { precision: 10, scale: 3 })` | NOT NULL | `Stock.amount.value` | 既存 `required_amount_value` / `package_size_value` と同精度 |
| `amount_unit` | `text('amount_unit')` | NOT NULL | `Stock.amount.unit` | 17 値 union（text 格納・D-2） |
| `purchased_at` | `timestamp('purchased_at')` | NOT NULL | `Stock.purchasedAt` | FIFO 順序の基準 |
| `expires_at` | `date('expires_at')` | NULL 許容 | `Stock.expiresAt` | S-4 案 α。ローカル日付整形（JST 注意） |
| `stored_location` | `text('stored_location')` | NULL 許容 | `Stock.storedLocation` | `'fridge' \| 'freezer' \| 'pantry'`（S-4 案 α） |
| `source_shopping_item_id` | `text('source_shopping_item_id')` | **UNIQUE**・NULL 許容・FK なし | `Stock.sourceShoppingItemId` | S-3 二重追加防止の最終防衛線。D-8。PostgreSQL の UNIQUE は NULL 同士を重複とみなさない |
| `created_at` | `timestamp('created_at').notNull().defaultNow()` | NOT NULL | Domain にマッピングしない | `planned_recipes.created_at` と同じ扱い |

### 2.2 Index

| index 名 | 対象列 | 用途 |
| --- | --- | --- |
| `stocks_product_id_idx` | `product_id` | Unit C `findByProduct` 相当・一般参照経路の先行カバー（S-11 非実装と矛盾しない） |

### 2.3 Drizzle 定義（確定形・本体設計書 §S-2 と同一）

```typescript
export const stocks = pgTable(
  'stocks',
  {
    id: text('id').primaryKey(),
    productId: text('product_id'),
    displayName: text('display_name').notNull(),
    amountValue: numeric('amount_value', { precision: 10, scale: 3 }).notNull(),
    amountUnit: text('amount_unit').notNull(),
    purchasedAt: timestamp('purchased_at').notNull(),
    expiresAt: date('expires_at'),
    storedLocation: text('stored_location'),
    sourceShoppingItemId: text('source_shopping_item_id').unique(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('stocks_product_id_idx').on(table.productId)],
);

export type StockRow = typeof stocks.$inferSelect;
export type NewStockRow = typeof stocks.$inferInsert;
```

`pantries` テーブルは**存在しない**（S-1 常在モデル + S-2 単一テーブル案）。`Pantry.id` は
DB に永続化せず、復元時に常に `PantryId.singleton()` を与える。

### 2.4 マイグレーション

`schema.ts` へ追記 → `drizzle-kit generate` → `migrate`。既存テーブルの列・制約への変更なし
（追加のみ）。ロールバックは `stocks` テーブルの DROP のみで完結する。

---

## 3. Hono RPC 型・エンドポイント契約

`docs/designs/pantry-core.md` §API 設計の表と一致。新規ファイル `apps/web/src/server/routes/pantry.ts`
+ `shopping-lists.ts` への 1 エンドポイント追記。

| メソッド | パス | zValidator | UseCase | 成功レスポンス |
| --- | --- | --- | --- | --- |
| POST | `/api/shopping-lists/:id/complete` | `param: shoppingListIdParamSchema`（json バリデーションなし・ボディを読まない） | `CompleteShoppingUseCase` | `200 + ShoppingListResponse` |
| GET | `/api/pantry` | なし | `GetPantryUseCase` | `200 + PantryResponse`（空でも 200） |
| POST | `/api/pantry/stocks/:stockId/consume` | `param: stockIdParamSchema` + `json: consumeStockSchema` | `ConsumeStockUseCase` | `200 + PantryResponse` |
| POST | `/api/pantry/stocks/:stockId/discard` | `param: stockIdParamSchema`（json バリデーションなし） | `DiscardStockUseCase` | `200 + PantryResponse` |

`pantry.ts` は `shopping-lists.ts` と同型（手動 DI ファクトリ関数 + `zValidator` + `Hono()` チェーン）
で実装する。フロントからの型取り込みは Hono RPC（`import type { AppType } from '.../app'`）。
本書は型契約のみを定義し、フロント側の呼び出しコードは対象外（Unit B）。

`app.ts` への追記は `.route('/pantry', pantryRoute)`（既存 `.route()` チェーンの末尾）+
onError 分岐 2 件のみ（§4 参照）。既存分岐の順序・挙動に影響しない。

---

## 4. エラー形式・HTTP ステータス対応

既存 `{ error: string }` 形（`err.message` をそのまま格納）を踏襲。新規エラークラス 2 種の
コンストラクタ・onError 追記位置を確定する。

| エラークラス | 発生 UseCase | HTTP | メッセージ方針 | 状態 |
| --- | --- | --- | --- | --- |
| `ShoppingListNotFoundError` | CompleteShopping | 404 | 既存 `shoppingListId` を含む message | 既存（変更なし） |
| `InvalidShoppingListStateError` | （冪等案では到達しない。S-3） | 422 | 既存 | 既存（変更なし・分岐そのまま） |
| `StockNotFoundError`（新規） | ConsumeStock / DiscardStock | 404 | `` `Stock not found: ${stockId}` `` 形（`ShoppingItemNotFoundError` 先例に倣う） | 新規 |
| `InvalidStockOperationError`（新規） | ConsumeStock（単位不一致） | 422 | 呼び出し側で組み立てたメッセージをそのまま格納（`InvalidShoppingListStateError` 先例） | 新規 |
| Zod バリデーション失敗 | Hono zValidator | 400 | Hono 既定の 400 JSON | 既存（変更なし） |
| DB エラー・未知（UNIQUE 違反含む） | — | 500 | `console.error` + `{ error: 'Internal Server Error' }` | 既存（変更なし。UNIQUE 違反はクライアント再送で収束） |

### 4.1 `app.ts` onError 追記（差分イメージ・実装はしない）

```typescript
// import 追加: StockNotFoundError, InvalidStockOperationError を @cookpit/application から
if (err instanceof StockNotFoundError) {
  return c.json({ error: err.message }, 404);
}
if (err instanceof InvalidStockOperationError) {
  return c.json({ error: err.message }, 422);
}
```

既存の分岐順序（Recipe → Product → Store → MealPlan → PlannedRecipe → InvalidMealPlanState →
ShoppingList → ShoppingItem → InvalidShoppingListState → `console.error`/500）の**どこに挿入しても
機能的に等価**（`instanceof` の個別分岐で相互排他）だが、可読性のため ShoppingList 系の直後
（既存 54-56 行目相当の後）に追記することを推奨する。

---

## 5. 冪等性キー一覧（契約サマリ・確定）

`docs/designs/pantry-core.md` L724-731 と一致。

| 操作 | エンドポイント | 冪等性 | キー |
| --- | --- | --- | --- |
| CompleteShopping | `POST /:id/complete` | **冪等** | `shoppingListId` の `completed` 状態判定 + Stock 単位では `stocks.source_shopping_item_id` UNIQUE |
| ConsumeStock | `POST /stocks/:stockId/consume` | **非冪等** | なし（二重送信で二重減算。AddItem と同じ制約。Unit B の二重送信抑止は将来課題） |
| DiscardStock | `POST /stocks/:stockId/discard` | 実質冪等寄り | なし（2 回目は対象消失で 404。副作用は増えない） |
| GetPantry | `GET /pantry` | 読み取りのみ | — |

契約テストでは「冪等キーの有無」自体は Zod / Drizzle レベルで検証できない（UseCase/Repository
の振る舞いテストの領域）。契約テストの責務は UNIQUE 制約が確かに定義されていること
（Infrastructure テストの round-trip・違反テストで検証。§7 参照）と、200/404/422 のスキーマ
形が一致することに限定する。

---

## 6. サンプルペイロード

### 6.1 買い物完了（`POST /api/shopping-lists/:id/complete`）

リクエスト: ボディなし。

```
POST /api/shopping-lists/11111111-1111-4111-8111-111111111111/complete
```

レスポンス（200・初回・冪等再実行とも同一形。既存 `ShoppingListResponse`）:

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "mealPlanId": "22222222-2222-4222-8222-222222222222",
  "shoppingDate": "2026-07-11",
  "status": "completed",
  "items": [
    {
      "id": "33333333-3333-4333-8333-333333333333",
      "productId": "44444444-4444-4444-8444-444444444444",
      "displayName": "玉ねぎ",
      "requiredAmount": { "value": 2, "unit": "個" },
      "amountNote": null,
      "targetStoreId": "55555555-5555-4555-8555-555555555555",
      "status": "bought",
      "actualPrice": { "amount": 198, "currency": "JPY" },
      "actualStoreId": "66666666-6666-4666-8666-666666666666",
      "source": "from_meal_plan"
    }
  ],
  "createdAt": "2026-07-11T01:00:00.000Z"
}
```

エラー（404・List 不存在）: `{ "error": "ShoppingList not found: <id>" }`

### 6.2 在庫取得（`GET /api/pantry`）

レスポンス（200・在庫ありの例）:

```json
{
  "stocks": [
    {
      "id": "77777777-7777-4777-8777-777777777777",
      "productId": "44444444-4444-4444-8444-444444444444",
      "displayName": "玉ねぎ",
      "amount": { "value": 2, "unit": "個" },
      "purchasedAt": "2026-07-11T01:00:00.000Z",
      "expiresAt": null,
      "storedLocation": null
    },
    {
      "id": "88888888-8888-4888-8888-888888888888",
      "productId": null,
      "displayName": "塩",
      "amount": { "value": 1, "unit": "個" },
      "purchasedAt": "2026-07-11T01:00:00.000Z",
      "expiresAt": "2026-08-01",
      "storedLocation": "pantry"
    }
  ]
}
```

未作成・在庫 0 件（S-1・常に 200）:

```json
{ "stocks": [] }
```

### 6.3 在庫消費（`POST /api/pantry/stocks/:stockId/consume`）

リクエスト:

```json
{ "amount": { "value": 1, "unit": "個" } }
```

レスポンス（200・更新後 PantryDto。D-3。全量消費で該当 Stock が配列から消える）:

```json
{ "stocks": [] }
```

エラー例:

- 404（Stock 不存在）: `{ "error": "Stock not found: <stockId>" }`
- 422（単位不一致。`amount.unit` が `stock.amount.unit` と一致しない）:
  `{ "error": "Unit mismatch: expected 個, got g" }`
- 400（`amount.value` が 0 または負数。Zod 既定の 400 JSON。`{ success: false, error: {...} }` 形は Hono `zValidator` 既定に従う）

### 6.4 在庫廃棄（`POST /api/pantry/stocks/:stockId/discard`）

リクエスト: ボディなし。

```
POST /api/pantry/stocks/77777777-7777-4777-8777-777777777777/discard
```

レスポンス（200・更新後 PantryDto。残量に関わらず全量削除）:

```json
{ "stocks": [] }
```

エラー（404・Stock 不存在）: `{ "error": "Stock not found: <stockId>" }`

---

## 7. 契約テスト方針（test-designer への引き継ぎ・確定は行わない）

`shopping-list.schema.test.ts` / `meal-plan.schema.test.ts` の先例パターン（`describe` を
スキーマ単位に分け、正常系・境界・reject を並べる）に倣う。以下は本書から渡す観点であり、
最終的な試験項目確定は test-designer が `docs/tests/pantry-core.md` で行う。

### 7.1 `packages/api-contract/src/pantry.schema.test.ts`（新規）

| 対象スキーマ | 観点 |
| --- | --- |
| `stockIdParamSchema` | 正常 uuid を受け入れる／不正な `stockId`（`'not-a-uuid'`）を reject する |
| `consumeStockSchema` | `amount.value = 0` を reject する（D-6。`addItemSchema` の `value: z.number().min(0)` との**意図的な非対称**をテストで明示）／`amount.value` 負数を reject する／`amount.value` 正数を受け入れる／`amount.unit` が 17 値それぞれを受け入れる（`it.each(VALID_UNITS)` 先例）／17 値に含まれない単位を reject する／`amount` キー省略を reject する |
| `storageLocationSchema` | `'fridge'` / `'freezer'` / `'pantry'` を受け入れる／未知の文字列を reject する |
| `stockResponseSchema` | `productId` / `expiresAt` / `storedLocation` すべて null の Stock を parse できる（nullability 全 null パターン）／すべて非 null の Stock を parse できる／`purchasedAt` が ISO datetime 形式でない場合 reject する／`expiresAt` が ISO date 形式でない場合 reject する（datetime 文字列を date として reject することを含む） |
| `pantryResponseSchema` | `stocks: []` を parse できる（S-1 の空 Pantry 応答）／複数 Stock を含む配列を parse できる |

### 7.2 既存ファイルへの追記想定（新規ファイルは作らない）

| ファイル | 追記内容 |
| --- | --- |
| `shopping-list.schema.test.ts` | 変更不要（完了 API は既存 `shoppingListIdParamSchema` / `shoppingListResponseSchema` を無変更で再利用するため、新規テストケース追加の必要なし。強いて言えば「completed ステータスの ShoppingListResponse を parse できる」を確認する 1 ケースの追加は任意） |

### 7.3 型の往復・後方互換の確認観点

- `StockResponse` / `PantryResponse` 型が Application 層 `StockDto` / `PantryDto`
  （`docs/designs/pantry-core.md` §Application 設計）と構造的に一致すること（`shoppingListResponseSchema`
  の「Task 3 Mapper の実出力相当の DTO を parse できる」先例に倣い、`PantryDto` 実体を想定した
  fixture で parse 一致を確認）
- `consumeStockSchema` の 0 reject が `addItemSchema.requiredAmount.value` の 0 許容と非対称で
  あることを退行防止のため明示テストする（設計意図の記録・D-6）
- Drizzle `stocks` の nullability（`product_id` / `expires_at` / `stored_location` /
  `source_shopping_item_id` の 4 列すべて null 許容）は Infrastructure 層（PGlite）の round-trip
  テストで確認する契約テストではない領域だが、本書 §2 の表がその際の一次情報になる
- `source_shopping_item_id` UNIQUE 制約は Infrastructure テストで違反ケース（同一値 2 回 insert）
  を確認する（S-3 の最終防衛線の契約保証）

### 7.4 Hono ルート契約テスト（apps/web 既存パターンに倣う。詳細は test-designer）

- `GET /api/pantry` が空でも 200 + `{ stocks: [] }` を返す（404 にならないことの確認。S-1）
- `POST /api/pantry/stocks/:stockId/consume` の `amount.value: 0` が 400 で reject されること
  （Hono ルートレベルでも zValidator 経由で D-6 が効いていることの確認）
- `POST /api/shopping-lists/:id/complete` を 2 回連続呼び出し、両方 200 で
  `ShoppingListResponse` 形が一致すること（S-3 冪等の契約レベル確認。UseCase 内部の副作用非重複
  は Application 層テストの責務）

---

## 8. 実装ファイル一覧（`packages/api-contract` / Drizzle 追加分。再掲・本体設計書と重複なく整合）

| ファイル | 変更種別 | 内容 |
| --- | --- | --- |
| `packages/api-contract/src/pantry.schema.ts` | 新規 | §1.1 のスキーマ 5 本 |
| `packages/api-contract/src/pantry.schema.test.ts` | 新規 | §7.1 のテスト（test-designer 確定後に implementer が実装） |
| `packages/api-contract/src/index.ts` | 追記 | `export * from './pantry.schema';` の 1 行 |
| `packages/infrastructure/src/db/schema.ts` | 追記 | §2.3 の `stocks` テーブル定義 |
| `packages/infrastructure/src/index.ts` | 追記 | `DrizzlePantryRepository` の re-export（本体設計書 §既存ファイルへの追記・変更に既出） |
| `apps/web/src/server/routes/pantry.ts` | 新規 | §3 のエンドポイント 3 本 |
| `apps/web/src/server/routes/shopping-lists.ts` | 追記 | §3 の完了エンドポイント 1 本 |
| `apps/web/src/server/app.ts` | 追記 | §4.1 の onError 2 分岐 + `.route('/pantry', pantryRoute)` |

`shopping-list.schema.ts` はスキーマ変更なし（インポート元として参照されるのみ）。

---

## 9. 後方互換性判定

- 既存テーブル・既存 Zod スキーマへの破壊的変更は**なし**（`stocks` テーブル新設・
  `pantry.schema.ts` 新設・`index.ts` / `app.ts` / `shopping-lists.ts` への追記のみ）。
- `shoppingListResponseSchema` を完了 API のレスポンスとして再利用するが、スキーマ定義自体は
  無変更（`status: 'completed'` は既存 `shoppingListStatusSchema` enum に既に含まれる値であり、
  型拡張は不要）。
- 既存クライアント（Unit B 未実装のため実質なし）への影響なし。
- 破壊的変更が発生する論点は本書には存在しない。**ユーザー確認が必要な事項は本体設計書の
  S-1〜S-11 に集約されており、契約設計はその推奨案をそのまま反映したのみ**（本書独自の
  追加判断はしていない）。

---

## 10. 未決事項・エスカレーション

- 本書は `docs/designs/pantry-core.md` の S-1〜S-11 が**ドラフト（推奨案）の段階**で書かれている。
  S-x がユーザー確定で覆った場合（特に S-2 が案 B に倒れて `pantries` テーブルが復活する場合、
  S-10 が覆って discard に reason が入る場合）は本書の §1〜§3 を再改訂する必要がある。
  contract-designer は S-x 確定を待たずに Codex 着手可能な水準まで先行して詳細化したが、
  **実装着手前に S-x の最終確定を implementation-planner が確認すること**（本体設計書 R-1 の
  引き継ぎ）。
- `InvalidStockOperationError` のメッセージ文言（`Unit mismatch: expected X, got Y`）は本書の
  提案であり、`InvalidShoppingListStateError` 同様メッセージ内容自体は Domain/Application の
  実装裁量。契約として保証するのは HTTP ステータス（422）と `{ error: string }` 形のみ。
