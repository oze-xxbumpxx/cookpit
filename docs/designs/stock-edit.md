# 設計書: stock-edit

- ステータス: draft
- レベル: L3
- 関連:
  - `docs/requirements/stock-edit.md`（本設計の要件定義書）
  - `docs/designs/pantry-core.md` S-4 案 α（Stock の不変性方針の元の決定。本設計はこれを覆す）
  - `docs/designs/pantry-screens.md` P-3・「将来課題」（保存場所の設定・編集 UI/API の新設は
    本ユニット相当として申し送られていた）
  - `docs/designs/shopping-complete-stock-selection.md` Q-1（完了パネルの期限入力を見送った
    決定。本設計はその再訪）
  - ADR-0016（Domain 不変性方針の変更を記録。別途起票・本書は参照のみ）

## 背景

`docs/requirements/stock-edit.md` の背景と同一。要約: Sprint 8 のゴール「在庫の実用化」には
在庫に実際の期限データが入ることが前提だが、現状は買い物完了パネル（`expiresAt: null` 固定・
Q-1）と既存 Stock の編集不可（Domain が readonly・pantry-core S-4 案 α）という 2 つの経路が
どちらも期限を持てない。Unit B（賞味期限アラート）に先立ち、この 2 経路を塞ぐ。

## 目的

- 既存 Stock の賞味期限・保存場所を事後編集できるようにする（roadmap タスク 1）。
- 買い物完了時に品目ごとに賞味期限を任意入力できるようにする（roadmap タスク 2）。

## 要件

`docs/requirements/stock-edit.md` の FR-1〜FR-6、正常系 N-1〜N-6、異常系 E-1〜E-5、
境界条件 B-1〜B-4 を参照。

## 対象範囲

- Domain（`packages/domain/src/pantry/pantry.ts`）: `Stock` の期限・保存場所を変更する
  メソッド追加、`Pantry` の委譲メソッド追加。
- Application（`packages/application/src/pantry/`）: 既存 Stock を更新する新規 UseCase。
- api-contract（`packages/api-contract/src/pantry.schema.ts`）: 更新用スキーマ追加。
- Presentation route（`apps/web/src/server/routes/pantry.ts`）: 新規エンドポイント。
- Infrastructure（`packages/infrastructure/src/repositories/drizzle-pantry.repository.ts`）:
  `save()` の `onConflictDoUpdate.set` 拡張（実装上の罠の解消。本ユニットの必須スコープ）。
- UI（`apps/web/src/app/pantry/`・`apps/web/src/app/shopping-lists/`）: 編集ダイアログ新設、
  編集導線追加、完了パネルへの期限入力追加。

## 対象外

- 賞味期限アラート / Web Push（Unit B。Sprint 8 タスク 3）。
- 消費・廃棄の取り消し（undo）・履歴テーブル（Unit C。Sprint 8 タスク 4）。
- DB スキーマ変更・マイグレーション（`stocks.expires_at` / `stored_location` は既存の
  nullable 列をそのまま使う。新規インデックスも本ユニットでは追加しない）。
- 在庫引き算（`GenerateShoppingListUseCase.applyPantryDeduction`）の挙動変更。
- 認証・ユーザー概念（ADR-0003 / ADR-0004）。
- ダッシュボードの緊急度チップ表示ロジック自体の変更（P-4 で `/pantry` への追加要否のみ検討）。

## 現状構成

### Domain — `packages/domain/src/pantry/pantry.ts`

```ts
export type StorageLocation = 'fridge' | 'freezer' | 'pantry';

export class Stock {
  private constructor(
    private readonly stockId: StockId,
    private readonly stockProductId: ProductId | null,
    private readonly stockDisplayName: string,
    private stockAmount: Quantity, // 唯一の可変フィールド
    private readonly stockPurchasedAt: Date,
    private readonly stockExpiresAt: Date | null, // readonly
    private readonly stockStoredLocation: StorageLocation | null, // readonly
    private readonly stockSourceShoppingItemId: ShoppingItemId | null,
  ) {}
  static create(input: CreateStockInput): Stock; // displayName 空白 / amount <= 0 で throw
  static reconstruct(props: StockProps): Stock; // 全フィールド指定可
  consume(amount: Quantity): void; // 単位不一致で throw、全量超過は 0 にクランプ
  isEmpty(): boolean;
  // getter のみ。expiresAt / purchasedAt は防御的コピーを返す
}
```

`Pantry` 集約: `addStock(input): StockId` / `consumeStock(stockId, amount): void`（0 になったら
除去）/ `discardStock(stockId): void`（残量に関わらず除去。部分廃棄なし）/
`hasStockFromShoppingItem(itemId): boolean` / `stocks` getter（コピーを返す）。
`PantryId.singleton()` 固定。Repository は `find(): Promise<Pantry>` / `save(pantry): Promise<void>`
の 2 メソッドのみ。

**この不変性は明示的な設計判断**: `docs/designs/pantry-core.md` S-4 案 α で「`expiresAt` /
`storedLocation` は不変。値の後付け（在庫編集操作）は Unit B / Phase 2 の検討事項として
申し送る」と決めている（同書 L313-315 / L796-797 / L1117-1118）。本設計はこの判断を覆す
（P-5・ADR-0016 で扱う）。

### Application — `packages/application/src/pantry/`

UseCase は `GetPantryUseCase` / `AddStockUseCase` / `ConsumeStockUseCase` /
`DiscardStockUseCase` の 4 本のみ。**更新系は存在しない。**

```ts
export interface StockDto {
  id: string;
  productId: string | null;
  displayName: string;
  amount: { value: number; unit: Unit };
  purchasedAt: string; // ISO datetime
  expiresAt: string | null; // ローカル日付 YYYY-MM-DD
  storedLocation: StorageLocation | null;
}
export interface AddStockInputDto {
  displayName: string;
  amount: { value: number; unit: Unit };
  storedLocation: StorageLocation | null;
  expiresAt: string | null; // YYYY-MM-DD
}
```

ローカル日付の往復規約: 入力は `new Date(\`${input.expiresAt}T00:00:00\`)`
（`add-stock.use-case.ts:27-28`）、出力は `packages/application/src/shared/date.ts`の`toLocalDateString`。更新系 UseCase でも同じ規約を踏襲する。

エラー: `StockNotFoundError`（→ `NotFoundError` 継承 → HTTP 404）/
`InvalidStockOperationError`（→ `InvalidOperationError` 継承 → HTTP 422）。
`apps/web/src/server/app.ts` の `app.onError` が基底 2 種で拾うため **app.ts の修正は不要**。

### 買い物完了 — `packages/application/src/shopping-list/complete-shopping.use-case.ts`

```ts
export interface StockAdditionInputDto {
  itemId: string;
  amount: { value: number; unit: Unit };
  storedLocation: StorageLocation | null;
  expiresAt: string | null; // "2026-07-25" 形式。既に受け取れる形になっている
}
export interface CompleteShoppingInputDto {
  shoppingListId: string;
  stockAdditions: StockAdditionInputDto[];
}
```

冪等ガードは `pantry.hasStockFromShoppingItem(item.id)` + DB の `source_shopping_item_id`
UNIQUE の二段。保存順序は Pantry → Product → ShoppingList → MealPlan で単一トランザクションで
はない。

### api-contract — `packages/api-contract/src/pantry.schema.ts`

```ts
export const stockIdParamSchema = z.object({ stockId: z.uuid() });
export const consumeStockSchema = z.object({
  amount: z.object({ value: z.number().positive(), unit: unitSchema }),
});
export const storageLocationSchema = z.enum(['fridge', 'freezer', 'pantry']);
export const addStockSchema = z.object({
  displayName: z.string().min(1),
  amount: z.object({ value: z.number().positive(), unit: unitSchema }),
  storedLocation: storageLocationSchema.nullable(),
  expiresAt: z.iso.date().nullable(), // datetime ではなく date。キー必須・値 nullable
});
```

`updateStockSchema` は無い。`shopping-list.schema.ts` の `stockAdditionSchema` /
`completeShoppingSchema` は `storageLocationSchema` を pantry.schema から import しており、
`expiresAt: z.iso.date().nullable()` を既に持つ。

### Hono ルート — `apps/web/src/server/routes/pantry.ts`（`/api` basePath、`/pantry` にマウント）

| メソッド | パス                                  | UseCase      | ステータス |
| -------- | ------------------------------------- | ------------ | ---------- |
| GET      | `/api/pantry`                         | GetPantry    | 200        |
| POST     | `/api/pantry/stocks`                  | AddStock     | 201        |
| POST     | `/api/pantry/stocks/:stockId/consume` | ConsumeStock | 200        |
| POST     | `/api/pantry/stocks/:stockId/discard` | DiscardStock | 200        |

`PATCH` / `PUT` / `DELETE` は無い。

### UI（apps/web）

- `/pantry`: `page.tsx`（Server・UseCase 直呼び・`force-dynamic`）→ `pantry-client.tsx`（Client・
  全 API 呼び出しの統括）→ `location-group.tsx` → `stock-row.tsx`（純表示）。
  `_utils/pantry-view.ts` にラベル・`LOCATION_SELECT_OPTIONS`・`toStorageLocation`・
  `UNSET_LOCATION_VALUE`・`groupStocksByLocation`・`formatExpiresAt`。
- `stock-row.tsx` の表示: 品目名 / 数量 / `expiresAt !== null` のとき `〜7/12まで`。
  ボタンは「消費」「廃棄」（確認ダイアログ無し = `pantry-screens.md` P-6 の確定）。**編集導線は
  無い。** 保存場所はカードに出ず `LocationGroup` の見出しでのみ表現。
- `add-stock-form.tsx`（展開パネル方式・ダイアログではない）: 品目名 `Input` / 分量
  `QuantityField` / 保存場所 `SelectField` + `LOCATION_SELECT_OPTIONS` / 賞味期限
  `Input type="date"`（空文字→null）。
- **買い物完了パネル** `apps/web/src/app/shopping-lists/_components/complete-shopping-panel.tsx`
  （実測。行番号は本ファイル）:
  `/shopping-lists/[id]` のリスト内に**インライン `<section>`** として描画（ダイアログではない）。
  ヘッダ行（見出し + すべて選択/解除トグル、L121-134）→ 説明文（L136-138）→ `<ul>` の行
  （`StockAdditionRow`。L199-277。自作 `role="checkbox"` ボタン + 品目名 + `flex gap-2` の中に
  `QuantityField`（`flex-1`）と `SelectField`（`w-28`）が横並び、L241-268）→ キャンセル /
  完了する（L164-182）。行状態は `RowState = { checked, amountText, storedLocation }`
  （L17-21）、`isRowSelected = checked && isAmountValid(amountText)`（L41-43）。
  **L103 で `expiresAt: null` をハードコード**（`shopping-complete-stock-selection.md` Q-1 の
  確定）。行のコンテナは `flex flex-col gap-2`（L215）で、チェックボックス行の下に
  `QuantityField`/`SelectField` 行が縦に積まれている（横 1 行に詰め込んでいるのはこの 2 つの
  フィールドのみ）。
- ダッシュボード `apps/web/src/app/_components/dashboard.tsx` + `_utils/dashboard-view.ts`:
  `selectExpiringStocks(stocks, asOf, 3)` / `getExpiryRemainingDays` / `getExpiryUrgency`
  （`overdue`/`critical`/`soon`）/ `formatExpiryUrgencyLabel` / `expiryUrgencyChipClass`。
  **保存場所アイコンと緊急度チップはダッシュボードにだけあり `/pantry` には無い**（非対称）。

### 再利用できる既存 UI 資産

`packages/ui` は存在しない。`apps/web/src/components/ui/` の 8 ファイルのみ（Base UI v1.6）:
`Button` / `Input`（`type` 透過なので `type="date"` はこれで足りる）/ `Textarea` /
`SelectField` / `QuantityField` / `UnitField` / `AlertDialog` 一式 / `Chart`。
**通常の `Dialog`・`Sheet`・`Popover`・`Checkbox`・`Switch`・`DatePicker` は存在しない。**

**編集ダイアログの完成形の先例**（骨格を踏襲する）:
`apps/web/src/app/products/[id]/_components/price-record-edit-dialog.tsx`（実測）
— `record: T | null` を props にして `open = record !== null`、`useEffect([record?.id])` で
初期値投入、`fieldErrors` オブジェクト、404/422 の分岐、成功時 `router.refresh()`。
`AlertDialogClose` へは `render={<Button .../>}`（Base UI 流。`asChild` ではない）。
`client.api.products[':id']['price-records'][':priceRecordId'].$put({ param, json })` の形で
Hono RPC を PUT 呼び出しし、`response.ok` で成功、404/422 はエラーボディの文言で分岐する。
より単純な版が `store-rename-dialog.tsx`。

対応する Application/Domain 側の先例（`packages/application/src/product/update-price-record.use-case.ts`
・`packages/domain/src/product/product.ts:197-` の `Product.updatePriceRecord(id, props)`）は、
1 メソッドに props オブジェクトをまとめて渡す一括更新の形を取っている（P-6 の判断材料）。

### データ取得・更新のパターン（TanStack Query は使っていない）

`pantry-screens.md` D-4 で「素の Hono RPC + `useState`」と確定済み。3 パターン:

- A: `useApiAction`（`apps/web/src/lib/use-api-action.ts`）— key 単位 pending / 二重送信ガード /
  `failureMessage` は `string | ((status) => string)` / `silent: true` で背景再取得。
  **PantryClient は意図的にこれのみ**（consume が非冪等なので楽観的更新をしない = D-5）
- B: `useOptimistic` + `startTransition`（買い物リストの行操作のみ）
- C: ダイアログ内のローカル `useState` 直書き + 成功時 `router.refresh()`
  （price-record-edit-dialog / store-rename-dialog）

フォーカス同期: 両画面とも `window.addEventListener('focus', ...)` で `silent` 再取得 +
ヘッダの「更新」ボタン。

## 実装上の罠（Repository の onConflictDoUpdate.set）

`packages/infrastructure/src/repositories/drizzle-pantry.repository.ts:27-47`:

```ts
async save(pantry: Pantry): Promise<void> {
  const stockRows = this.toStockRows(pantry);
  const currentIds = stockRows.map((row) => row.id);
  if (currentIds.length > 0) await this.db.delete(stocks).where(notInArray(stocks.id, currentIds));
  else await this.db.delete(stocks);
  if (stockRows.length > 0) {
    await this.db.insert(stocks).values(stockRows).onConflictDoUpdate({
      target: stocks.id,
      set: { amountValue: sql`excluded.amount_value` },   // ← amount_value だけ
    });
  }
}
```

既存行の `expires_at` / `stored_location` / `display_name` は **UPDATE されない**。Domain と
ルートを正しく実装しても DB に反映されず、しかも **API は 200 を返し、画面はレスポンス DTO
（メモリ上の集約）を描画するので一見成功して見える**。リロードして初めて消えたと分かる型の
欠陥であり、単体テスト（UseCase 層）やコンポーネントテストでは検出できない
（PGlite を使った Infrastructure 層の回帰テストでのみ検出できる）。

**対応**: `set` 句に `expiresAt: sql\`excluded.expires_at\``と`storedLocation: sql\`excluded.stored_location\``を追加する。`displayName`/`purchasedAt`/`productId`/`sourceShoppingItemId`は本ユニットでは
編集対象に含めない（P-1 推奨案）ため`set` 句に追加しない。ただし、これらを将来編集対象に
含める場合は同じ罠が再発するため、この節を将来課題としても申し送る。

**完了条件に含める回帰テスト**: `packages/infrastructure/tests/` に、Stock を編集 →
`save()` → 新しい Repository インスタンスで `find()` → `expiresAt` / `storedLocation` が
更新後の値であることを確認するテストを追加する（既存の PGlite テスト基盤を再利用）。

## 変更後構成

### Domain

`Stock` に以下を追加（P-6 推奨: 一括 props 版）。

```ts
Stock.updateDetails(props: {
  expiresAt: Date | null;
  storedLocation: StorageLocation | null;
}): void
```

`Pantry` に委譲メソッドを追加。

```ts
Pantry.updateStockDetails(
  stockId: StockId,
  props: { expiresAt: Date | null; storedLocation: StorageLocation | null },
): void
```

`consumeStock` / `discardStock` と同型（対象 Stock を検索 → 見つからなければ
`StockNotFoundError` → 対象 Stock のメソッドを呼ぶ）。バリデーションは無し
（`expiresAt` は Date 型で受け取る時点で不正日付は Application 層の変換で弾かれている前提。
`storedLocation` は enum 型で受け取るため不正値は型レベルで排除される）。

### Application

新規 UseCase: `UpdateStockDetailsUseCase`。

```ts
export interface UpdateStockDetailsInputDto {
  stockId: string;
  expiresAt: string | null; // YYYY-MM-DD。add-stock と同じ往復規約
  storedLocation: StorageLocation | null;
}

export class UpdateStockDetailsUseCase {
  constructor(private readonly pantryRepository: PantryRepository) {}

  /** @throws StockNotFoundError 指定した stockId の在庫が存在しない場合 */
  async execute(input: UpdateStockDetailsInputDto): Promise<PantryDto> {
    const pantry = await this.pantryRepository.find();
    pantry.updateStockDetails(StockId.fromString(input.stockId), {
      expiresAt: input.expiresAt === null ? null : new Date(`${input.expiresAt}T00:00:00`),
      storedLocation: input.storedLocation,
    });
    await this.pantryRepository.save(pantry);
    return toPantryDto(pantry);
  }
}
```

`Pantry.updateStockDetails` が `StockId` を見つけられない場合に `StockNotFoundError` を
throw する前提（`ConsumeStockUseCase` / `DiscardStockUseCase` と同じ責務分担）。

`complete-shopping.use-case.ts` は変更不要（`StockAdditionInputDto.expiresAt` は既に
受け取れる形であり、UseCase 内部の `Stock.create()` 呼び出しにもそのまま渡っている想定）。
本ユニットで変更が必要なのは呼び出し元（`complete-shopping-panel.tsx`）が `null` 固定を
やめて実際の入力値を渡すようにする UI 側のみ。

### api-contract

```ts
export const updateStockSchema = z.object({
  expiresAt: z.iso.date().nullable(),
  storedLocation: storageLocationSchema.nullable(),
});
export type UpdateStockBody = z.infer<typeof updateStockSchema>;
```

`addStockSchema` と同じプリミティブ（`z.iso.date().nullable()` / `storageLocationSchema`）を
再利用し、契約の一貫性を保つ。`stockIdParamSchema` は既存のものをそのまま使う。

### Presentation route

```ts
.put(
  '/stocks/:stockId',
  zValidator('param', stockIdParamSchema),
  zValidator('json', updateStockSchema),
  async (c) => {
    const { stockId } = c.req.valid('param');
    const body = c.req.valid('json');
    const usecase = new UpdateStockDetailsUseCase(pantryRepository());
    const dto = await usecase.execute({ stockId, ...body });
    return c.json(dto, 200);
  },
)
```

`apps/web/src/server/app.ts` の変更は不要（`StockNotFoundError` は既存の `onError` が
`NotFoundError` 継承として拾う）。

### Infrastructure

`drizzle-pantry.repository.ts` の `save()` の `set` 句を拡張（詳細は「実装上の罠」節）。

### UI

「UI 設計」節で扱う。

## データフロー

### フロー 1: `/pantry` での在庫編集

1. ユーザーが `stock-row.tsx` の編集ボタンを押す。
2. `pantry-client.tsx` が編集対象の `StockDto` を state に持ち、`StockEditDialog` を開く
   （`record` props パターン。`price-record-edit-dialog.tsx` と同型）。
3. ダイアログのフォームに現在の `expiresAt` / `storedLocation` を初期値投入。
4. ユーザーが値を変更し保存 → `client.api.pantry.stocks[':stockId'].$put({ param, json })`。
5. Hono ルート → `UpdateStockDetailsUseCase` → `Pantry.updateStockDetails()` →
   `PantryRepository.save()`（DB UPDATE を含む）→ `PantryDto` を 200 で返却。
6. ダイアログが閉じ、`router.refresh()` で Server Component 経由の一覧を再取得
   （`price-record-edit-dialog.tsx` と同じ C パターン）。

### フロー 2: 買い物完了時の賞味期限入力

1. `/shopping-lists/[id]` で「買い物完了」操作 → `CompleteShoppingPanel` が表示される。
2. 各行で数量・保存場所に加え、任意で賞味期限を入力（P-3 の UI 案）。
3. 「完了する」→ `stockAdditions: StockAdditionInputDto[]`（`expiresAt` に入力値 or `null`）を
   組み立てて `CompleteShoppingUseCase` を呼ぶ既存フローにそのまま乗る（Application/Domain の
   変更は無し）。

## API 設計

| メソッド | パス                          | リクエスト                                                               | レスポンス                              | ステータス      |
| -------- | ----------------------------- | ------------------------------------------------------------------------ | --------------------------------------- | --------------- |
| PUT      | `/api/pantry/stocks/:stockId` | `{ expiresAt: string \| null; storedLocation: StorageLocation \| null }` | `PantryDto`（`{ stocks: StockDto[] }`） | 200 / 404 / 422 |

- `expiresAt` / `storedLocation` は両方とも必須キー（`nullable()` であって `optional()` では
  ない）。クリアは明示的に `null` を送る（P-2 推奨案。詳細は「未決事項」）。
- 買い物完了 API（`POST /api/shopping-lists/:id/complete` 相当。既存）は契約変更なし。

## DB 設計

スキーマ変更なし。`packages/infrastructure/src/db/schema.ts:144-162` の `expires_at`
（`date()`・nullable・インデックス無し）・`stored_location`（`text()`・nullable・enum 制約は
アプリ側の `toStorageLocation` で検証）をそのまま使う。インデックスは既存の
`stocks_product_id_idx` のみで変更なし（本ユニットは単一行の UPDATE のみで、一覧取得の
クエリパターン自体は変わらないため新規インデックスは不要）。

Repository の `save()` 内の `onConflictDoUpdate.set` を拡張する必要がある点は「実装上の罠」
節を参照。

## フロントエンド設計

「UI 設計」を参照（下記）。

## UI 設計

### 編集ダイアログ（`stock-edit-dialog.tsx`、新設）

`price-record-edit-dialog.tsx` の構造をそのまま踏襲する。

- Props: `{ stock: StockDto | null, onOpenChange: (open: boolean) => void, onUpdated: () => void }`。
  `open = stock !== null`。
- `useEffect([stock?.id])` で `expiresAt` / `storedLocation` の初期値を state に投入
  （`price-record-edit-dialog.tsx` L85-131 と同型。ただし本ダイアログは補助データ取得
  （店舗一覧相当）が無いため `storesLoading` 相当は不要）。
- フィールド: 賞味期限 `Input type="date"`（`add-stock-form.tsx` と同じ部品。空文字 → `null`）、
  保存場所 `SelectField` + `LOCATION_SELECT_OPTIONS`（`pantry-view.ts` を再利用）。
- 送信: `client.api.pantry.stocks[':stockId'].$put({ param: { stockId: stock.id }, json: body })`。
  `response.ok` で成功、`onOpenChange(false)` → `router.refresh()`。404 は
  「この在庫はすでに削除されています」を表示して閉じる（`price-record-edit-dialog.tsx` の
  404 分岐と同型）。422 は `fieldErrors` に反映。
- 起動導線: `stock-row.tsx` に「編集」ボタンを追加（既存の「消費」「廃棄」ボタンの並びに
  1 つ増やす）。`pantry-client.tsx` が編集対象の `StockDto` を state で保持し、
  `StockEditDialog` に渡す（`pantry-client.tsx` は `consume`/`discard` の送信中 state を
  `useApiAction` で管理しているが、編集ダイアログはパターン C（ローカル `useState` +
  `router.refresh()`）を使うため、既存の `useApiAction` 呼び出しとは独立させる）。

### 買い物完了パネルの改修（P-3）

「未決事項」節で比較・推奨を記載する。推奨案（行ごと任意展開）を採用する場合の変更点:

- `RowState` に `expiresAt: string`（date input の値）と `expiresAtExpanded: boolean` を追加。
- `StockAdditionRow` に「賞味期限を設定」ボタン（テキストリンク調、数量/保存場所の行の下）を
  追加。押すと `Input type="date"` を含む行が展開される。展開中は「賞味期限を削除」に文言が
  変わり、押すと値をクリアして折りたたむ。
- `handleComplete` の `additions.push(...)` の `expiresAt: null` を
  `expiresAt: row.expiresAt === '' ? null : row.expiresAt` に変更。
- モバイル幅（375px 想定）で既存の `QuantityField`（`flex-1`）+ `SelectField`（`w-28`）の
  横並び行に日付入力を追加で並べると破綻するため、日付入力は独立した行として追加する
  （3 つ目のコントロールを同じ横並びには入れない）。

### `/pantry` カードへの保存場所表示（P-4）

「未決事項」節で扱う。

## バックエンド設計

「変更後構成」の Application / Presentation route / Infrastructure を参照。UseCase は
1 ユースケース = 1 クラス・`execute()` のみ（`UpdateStockDetailsUseCase`）。DI は手動 DI
（`pantryRepository()` をコンストラクタに渡す既存パターンをそのまま踏襲）。

## エラー処理

- 404（`StockNotFoundError`）: 存在しない `stockId` を指定した場合。既存の `app.onError` が
  `NotFoundError` 継承で拾うため追加実装不要。UI は「この在庫はすでに削除されています」を
  表示してダイアログを閉じ、`router.refresh()` で一覧を最新化する。
- 422: `updateStockSchema` の Zod バリデーション（`expiresAt` が `YYYY-MM-DD` 形式でない、
  `storedLocation` が enum 外）。`zValidator` がリクエスト受付時点で弾くため UseCase 内部の
  バリデーションは不要。UI は `fieldErrors` に反映（`price-record-edit-dialog.tsx` の
  `buildBody()` パターンではなく、日付・enum はブラウザ入力（`type="date"` / `<select>`）で
  形式自体は担保されるため、フィールド単位のクライアントバリデーションは薄くてよい）。
- ネットワークエラー: `try/catch` で「通信エラーが発生しました」を表示（既存ダイアログと同型）。
- 買い物完了パネル側の異常系（E-5）: 日付は `type="date"` のブラウザ標準バリデーションに
  委ね、追加のクライアント側チェックは行わない。API 側の 422 は完了操作全体を失敗させ
  （既存の完了 API と同じ扱い）、品目単位の部分失敗は扱わない（`complete-shopping.use-case.ts`
  が単一トランザクションでない点は既存の制約であり本ユニットで変更しない）。

本変更は外部 API / 外部ストレージへの新規 I/O を含まないため、リトライ・タイムアウト・
冪等性・部分失敗・フォールバックの 5 項目の記載は対象外（Skill 手順6の条件に該当しない）。

## ログと監視

Cookpit MVP1 には専用のログ基盤・APM は導入されていない。本変更も既存方針
（サーバーエラーは `app.onError` 経由で HTTP ステータスとして返し、クライアントはエラー
メッセージを画面表示する）を踏襲し、新規のログ・監視の追加は行わない（対象外）。

## セキュリティ

- 認証・認可は対象外（ADR-0003 / ADR-0004。単一世帯前提が継続）。
- 入力値は `zValidator` による Zod スキーマ検証を境界で行う（`expiresAt` の日付形式・
  `storedLocation` の enum 制約）。
- DB アクセスは Drizzle のパラメータ化クエリのみで、SQL インジェクションのリスクは無い
  （既存の `save()` 実装のパターンを踏襲）。

## 性能

新規の外部 API / 外部ストレージ I/O は導入せず、大量データを扱う一覧・集計クエリの新設・
変更も無く、明示された性能要件も無い（`docs/requirements/stock-edit.md` 非機能要件）。
したがって性能セクションは簡潔にとどめる。

- 想定負荷: 1 リクエストあたり Stock 1 件の UPDATE。`Pantry.find()` は既存同様、世帯全体の
  Stock 一覧を毎回取得してから集約内で更新するため、Stock 件数が極端に多い場合（数百件超）は
  読み込みコストが線形に増える可能性があるが、MVP1 の単一世帯利用ではこの規模には達しない
  想定（推定。実測データなし）。
- レスポンスタイム: 既存の `POST /api/pantry/stocks/:stockId/consume` と同等の処理量
  （1 件の集約更新）であり、同程度の応答時間になる見込み（確認推奨。既存エンドポイントの
  実測値がドキュメント化されていないため、本設計では数値を断定しない）。
- 将来課題: Unit B で「賞味期限が近い順」のクエリが増える場合、`expires_at` へのインデックス
  追加を検討する（本ユニットでは不要）。

## テスト方針

- Domain（`packages/domain/tests/pantry/`）: `Stock.updateDetails()` の単体テスト
  （expiresAt/storedLocation の設定・変更・null クリアの組み合わせ）、`Pantry.updateStockDetails()`
  の単体テスト（対象 Stock が無い場合に `StockNotFoundError`）。
- Application（`packages/application/tests/pantry/`）: `UpdateStockDetailsUseCase` のテスト
  （正常系・404）。
- api-contract（該当パッケージに tests があれば）: `updateStockSchema` のバリデーションテスト
  （不正日付・enum 外の値で reject されることの確認）。
- Infrastructure（`packages/infrastructure/tests/repositories/`）: PGlite を使い、
  Stock を編集 → `save()` → 新しい Repository インスタンスで `find()` → 値が保持されている
  ことを確認する回帰テスト（「実装上の罠」の再発防止。**この観点は必須**）。
- apps/web:
  - ルートテスト（`apps/web/tests/server/routes/pantry.test.ts` 相当）: PUT の 200/404/422。
  - コンポーネントテスト: `stock-edit-dialog.tsx` の初期値投入・保存・404/422 ハンドリング、
    `complete-shopping-panel.tsx` の賞味期限展開・入力・送信ペイロードへの反映（既存テストの
    回帰確認を含む）。

## 移行とリリース

DB マイグレーションは不要。リリース順序に依存関係がある点のみ注意する。

1. Infrastructure の `save()` 修正（実装上の罠の解消）を先に、または同一 PR で必ず含める。
   UI・API だけ先にリリースすると「保存したのに消える」不具合が本番で発生する。
2. Domain/Application/api-contract/route/Infrastructure/UI は 1 ユニットとしてまとめて
   リリースする（機能フラグは導入しない。MVP1 の他機能と同様、単一 PR/デプロイでよい規模）。

## リスク

| #                                            | リスク                                                        | 影響                              | 対策 |
| -------------------------------------------- | ------------------------------------------------------------- | --------------------------------- | ---- |
| R-1                                          | Repository の `onConflictDoUpdate.set` 拡張漏れ（実装上の罠） | 編集が見かけ上成功し              |
| リロードで消える。ユーザー体験を著しく損なう | PGlite 回帰テストを完了条件の必須項目にする                   |
| R-2                                          | 完了パネルの改修（P-3）でモバイル幅が崩れる                   | 主要導線の 1 つが視覚的に破綻する | 日付 |

入力を既存の横並び行に追加せず独立行にする（UI 設計節）。実装後に 375px 幅での目視確認を
実装計画・試験計画に含める |
| R-3 | Domain の不変性方針変更（P-5）が pantry-core.md の既存決定と矛盾したまま両ドキュメントが
残る | 将来の実装者が古い決定（S-4 案 α）を正と誤認する | 本設計書と ADR-0016 から
pantry-core.md 該当箇所への参照を残し、pantry-core.md 側にも「stock-edit で覆された」旨の
注記を追記する（実装計画フェーズで対応） |
| R-4 | `complete-shopping-panel.tsx` は Unit A（shopping-list 完了フロー）で完成済みの既存
ファイルであり、改修が既存テストの回帰を招く可能性 | 既存の完了フローが壊れる | 追記は
新規 state（`expiresAt` 関連）・新規 UI（展開ボタン）に限定し、既存の
`checked`/`amountText`/`storedLocation` のロジックには手を入れない |
| R-5 | 数量・品目名を編集対象に含めない（P-1 推奨）ことへの実運用上の不満（打ち間違いを
直せない） | ユーザー体験上の小さな不満が残る可能性 | 「将来課題・申し送り」に明記し、
実データでの困りごととして観測されたら別ユニットで再検討する |

## 未決事項

以下 P-1〜P-6 はいずれも複数案を比較した上での推奨案であり、**確定はユーザー確認を経て
行う**（Orchestrator 経由）。

### P-1: 編集できる項目の範囲

- 案 A: 期限・保存場所のみ。
- 案 B: 期限・保存場所 + 数量・品目名も含む。
  - 数量は `consume` で減らせるが増やせない・打ち間違いを直せない、という実態には対応できる。
  - ただし `displayName` の編集は表示専用文字列の変更にとどまらず、将来 Product 連携が入る
    場合の整合性検討が必要になり、`amount` の編集も単位変更時の意味論（Quantity VO の
    再構築）を新たに設計する必要が生じる。

**推奨: 案 A**。roadmap の完了条件はこの 2 項目のみであり、Domain の不変性緩和
（P-5）は最小限にとどめるべき。数量・品目名の編集ニーズは実データで困りごとが顕在化して
から別ユニットとして扱う（「将来課題」参照）。

### P-2: HTTP メソッドと部分更新のセマンティクス

- 案 A: `PUT /api/pantry/stocks/:stockId`。`expiresAt` / `storedLocation` を両方とも必須キーで
  送り、`null` でクリアを表現する（`addStockSchema` と同じ形。`price-record-edit-and-store-rename`
  の PUT 先例を踏襲）。
- 案 B: `PATCH` で各フィールドを `optional().nullable()` にし、「キー省略＝変更しない」
  「`null` 明示＝クリア」を区別する。

**推奨: 案 A（PUT・全項目必須）**。「省略と null の違い」をクライアント・サーバー双方で
常に正しく扱う実装コストを避けられる。編集ダイアログの UI は元々 2 フィールドを常に一緒に
表示・編集する設計（P-3 と同様に UI 設計節で確定）であるため、全項目送信のデメリットは
実質無い。既存の `UpdatePriceRecordUseCase` / `updatePriceRecordSchema` とも構造が揃う。

### P-3: 完了パネルの賞味期限入力 UI（本ユニットの核）

現在の行は `flex gap-2` で `QuantityField`（`flex-1`）と `SelectField`（`w-28`）が横並びに
なっている（`complete-shopping-panel.tsx` L241-268）。

- 案 A: 行ごと常時表示。数量・保存場所と同じ行に日付入力を追加する。
  - 実装は単純だが、モバイル幅（375px 目安）で 3 つのコントロールを 1 行に収めるのは既に
    厳しい 2 コントロールにさらに足すことになり、破綻するリスクが高い。
- 案 B: 行ごと折りたたみ／任意展開。各行に「賞味期限を設定」ボタンを置き、押した行だけ
  日付入力を展開する。
  - Q-1 の却下理由（「全品目に入れるのは負荷が高い」「縦に長くなる」）に直接対処できる。
    既定は非表示のため、通常時のパネル高さは変わらない。展開時は独立した行として追加する
    ためモバイル幅の破綻を避けられる。
- 案 C: 一括既定値 + 行上書き。パネル上部に共通の賞味期限入力を 1 つ置き、選択中の全行に
  適用。個別に変えたい行だけ上書きする。
  - タップ数は最小になり得るが、生鮮食品と乾物では期限の性質が大きく異なり、一括値の
    有用性が低い。誤って一律適用してしまうリスクもある。
- 案 D: パネルには出さず、完了後に Unit A の編集ダイアログ（本ユニットの機能）に委ねる
  （Q-1 の元の結論の維持）。
  - roadmap の完了条件「買い物完了時に賞味期限を入力できる」を満たさないため不採用。

**推奨: 案 B（行ごと折りたたみ／任意展開）**。Q-1 の懸念に対処しつつ roadmap の完了条件を
満たせる。実装コストは `RowState` に `expiresAt` と `expiresAtExpanded` を足す程度で
既存の `updateRow` パターンに乗せられる。モバイル幅の問題は「独立行として追加する」ことで
回避する（UI 設計節に反映済み）。

### P-4: `/pantry` の在庫カードに保存場所ラベル・緊急度チップを足すか

ダッシュボードにはある（`expiryUrgencyChipClass` 等）が `/pantry` には無い非対称が既存。

- 案 A: 両方足す（表示の非対称を完全に解消）。
- 案 B: 保存場所ラベルのみ足す（緊急度チップは対象外）。
- 案 C: どちらも足さない（編集導線の追加のみに集中）。

**推奨: 案 B**。保存場所は本ユニットで編集可能になるため、編集した値がカードに見えないと
機能の価値検証がしづらい（現状は `LocationGroup` の見出しでのみ表現されており、グルーピング
崩れ時の視認性が低い）。一方、緊急度チップはダッシュボード（サマリ）と `/pantry`（一覧）の
役割分担を崩す可能性があり、Unit B（アラート実装）のタイミングで一覧側の要否も含めて
再検討する方が段階的でリスクが低い。

### P-5: Domain の不変性方針の変更（pantry-core.md S-4 の再検討）

`pantry-core.md` S-4 案 α は「値の後付け（在庫編集操作）は Unit B / Phase 2 の検討事項として
申し送る」としていた。`shopping-complete-stock-selection.md` Q-1 も「期限管理を使いたくなった
時点で『Stock 編集』または『完了パネルへの期限入力』のどちらかを足す」と明示的に申し送って
いる（同書 L327-328）。つまり両ドキュメントの申し送り事項が、Sprint 8 で「期限管理を実用化
する」というゴールが明確になったことで、まさに実現するタイミングに来たという整理になる。
当時は編集ニーズ自体が顕在化しておらず、不変性を維持するコスト（実装しない選択）が
妥当だったが、現時点では roadmap の完了条件として明示されたため転換が必要と判断する。

本書では判断の妥当性のみ示し、正式な記録は **ADR-0016 で行う**（別途起票）。ADR-0016 には
「Stock のどのフィールドを可変にするか（P-1 の確定内容）」「なぜ `amount` だけが元々可変
だったか（`consume` のドメインロジックとの整合）との関係」を含めることを申し送る。

### P-6: Domain API の形

- 案 A: 個別メソッド `Stock.changeExpiresAt(expiresAt)` / `Stock.changeStoredLocation(location)`。
  単一責任だが、Pantry 側の委譲メソッドも 2 つになり、1 リクエストで両方変える場合の
  呼び出し調整が必要になる。
- 案 B: `Stock.updateDetails(props: { expiresAt, storedLocation }): void` 一括。

**推奨: 案 B**。P-2（PUT・全項目送信）と自然に対応し、`Product.updatePriceRecord(id, props)`
という既存の一括更新の先例（`packages/domain/src/product/product.ts:197-`）と構造が揃う。
`Pantry` 側は `updateStockDetails(stockId, props): void` という 1 つの委譲メソッドを追加し、
`consumeStock`/`discardStock` と同じ「対象 Stock を検索 → 無ければ `StockNotFoundError`」の
形に揃える。

## 将来課題・申し送り

- Unit B（賞味期限アラート）: 本ユニットで在庫に実際の期限データが入るようになるため、
  アラート対象データが揃う。`expires_at` へのインデックス追加は Unit B で「期限が近い順」の
  クエリが増える場合に検討する（本ユニットでは不要）。
- Unit C（消費・廃棄の取り消し・履歴）: 本ユニットは在庫の「詳細編集」のみを扱い、
  消費・廃棄の取り消しは扱わない。編集ダイアログと undo は別の操作系統として今後も分離する
  想定。
- P-1 で対象外とした数量・品目名の編集は、実データで打ち間違い等の困りごとが観測された
  場合に別ユニットとして再検討する。
- P-4 で対象外とした緊急度チップの `/pantry` への追加は、Unit B 実装時に一覧側での要否を
  含めて再検討する。
- ADR-0016（Domain 不変性方針の変更）の起票は本ユニットの実装と並行、または直後に行う。
