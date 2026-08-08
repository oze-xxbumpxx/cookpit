# 設計書: stock-edit

- ステータス: confirmed（P-1〜P-6 ユーザー確定・2026-08-07）
- レベル: L3
- 関連:
  - `docs/requirements/stock-edit.md`（本設計の要件定義書）
  - `docs/designs/pantry-core.md` S-4 案 α（Stock の不変性方針の元の決定。本設計はこれを覆す。
    P-5 で ADR-0016 に記録することを確定）
  - `docs/designs/pantry-screens.md` P-3・「将来課題」（保存場所の設定・編集 UI/API の新設は
    本ユニット相当として申し送られていた）
  - `docs/designs/shopping-complete-stock-selection.md` Q-1（完了パネルの期限入力を見送った
    決定。本設計はその再訪）
  - [ADR-0016](../decisions/ADR-0016-stock-details-mutable.md)（Domain 不変性方針の変更。
    設計フェーズで作成済み・2026-08-07）

## 背景

`docs/requirements/stock-edit.md` の背景と同一。要約: Sprint 8 のゴール「在庫の実用化」には
在庫に実際の期限データが入ることが前提だが、現状は買い物完了パネル（`expiresAt: null` 固定・
Q-1）と既存 Stock の編集不可（Domain が readonly・pantry-core S-4 案 α）という 2 つの経路が
どちらも期限を持てない。Unit B（賞味期限アラート）に先立ち、この 2 経路を塞ぐ。

## 目的

- 既存 Stock の賞味期限・保存場所・数量を事後編集できるようにする（roadmap タスク 1。
  数量を含めることは P-1 のユーザー確定による）。
- 買い物完了時に品目ごとに賞味期限を任意入力できるようにする（roadmap タスク 2）。

## 要件

`docs/requirements/stock-edit.md` の FR-1〜FR-8、正常系 N-1〜N-9、異常系 E-1〜E-7、
境界条件 B-1〜B-6 を参照。

## 対象範囲

- Domain（`packages/domain/src/pantry/pantry.ts`）: `Stock` の数量・期限・保存場所を変更する
  メソッド追加、`Pantry` の委譲メソッド追加。
- Application（`packages/application/src/pantry/`）: 既存 Stock を更新する新規 UseCase。
- api-contract（`packages/api-contract/src/pantry.schema.ts`）: 更新用スキーマ追加（数量を含む）。
- Presentation route（`apps/web/src/server/routes/pantry.ts`）: 新規エンドポイント。
- Infrastructure（`packages/infrastructure/src/repositories/drizzle-pantry.repository.ts`）:
  `save()` の `onConflictDoUpdate.set` を 4 列（`amountValue` / `amountUnit` / `expiresAt` /
  `storedLocation`）に拡張（実装上の罠の解消。本ユニットの必須スコープ）。
- UI（`apps/web/src/app/pantry/`・`apps/web/src/app/shopping-lists/`・
  `apps/web/src/app/_utils/`）: 編集ダイアログ新設（数量・保存場所・賞味期限）、編集導線追加、
  完了パネルへの期限入力追加、`/pantry` カードへの保存場所ラベル・緊急度チップ追加、期限
  緊急度ユーティリティの共通化（`expiry.ts` 新設）。

## 対象外

- `displayName`（品目名）の編集（確定・対象外。誤字修正ニーズはあるが、Product 連携時の
  整合性検討・表示専用文字列を超えた設計が必要になるため別ユニットで再検討する）。
- `purchasedAt`（購入日時）の編集（対象外。消費順序等の暗黙の前提に影響するため据え置く）。
- `productId` / `sourceShoppingItemId` の編集（対象外。集約間の ID 参照・冪等ガード
  （`hasStockFromShoppingItem` / DB の UNIQUE 制約）に関わるため変更しない）。
- これら 4 項目は Repository の `onConflictDoUpdate.set` にも追加しない。追加すると
  「実装上の罠」と同種の問題（フィールドを増やしたのに `set` 句の更新を忘れる）が再発する
  リスクがあるため、対象外である間は触れないことを明示しておく（「将来課題」参照）。
- 賞味期限アラート / Web Push（Unit B。Sprint 8 タスク 3）。
- 消費・廃棄の取り消し（undo）・履歴テーブル（Unit C。Sprint 8 タスク 4）。
- DB スキーマ変更・マイグレーション（`stocks` の既存 nullable 列をそのまま使う）。
- 在庫引き算（`GenerateShoppingListUseCase.applyPantryDeduction`）の挙動変更（数量の単位編集が
  この経路に与える影響は「リスク」節で扱うが、ロジック自体は変更しない）。
- 認証・ユーザー概念（ADR-0003 / ADR-0004）。

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
（P-5・ADR-0016 で扱う。ユーザー確定済み）。

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
  無い。** 保存場所はカードに出ず `LocationGroup` の見出しでのみ表現。**緊急度チップも無い。**
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
  `selectExpiringStocks(stocks, asOf, withinDays)` / `getExpiryRemainingDays` / `getExpiryUrgency`
  （`overdue`/`critical`/`soon`）/ `formatExpiryUrgencyLabel`（`期限切れ`/`本日まで`/`明日まで`/
  `あとN日`）/ `expiryUrgencyChipClass`（`apps/web/src/app/_utils/category-color.ts`）。
  `apps/web/src/app/page.tsx` が `EXPIRY_WITHIN_DAYS = 3` というローカル定数（未 export）で
  `selectExpiringStocks(pantry.stocks, now, EXPIRY_WITHIN_DAYS)` を呼び、
  `Dashboard` に `expiringStocks` と `asOf={now}`（Server Component 側で生成した `new Date()`）を
  props で渡している。`getExpiryUrgency` は「`selectExpiringStocks` の閾値日数以内でフィルタ
  済みの値を渡す前提」で、閾値を超える残日数（例: 10 日）を渡しても `'soon'` に収束してしまう
  実装であることに注意（`dashboard-view.ts:53-65` のコメント）。**保存場所アイコンと緊急度
  チップはダッシュボードにだけあり `/pantry` には無い**（非対称。P-4 で解消する）。

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

既存行の `expires_at` / `stored_location` / `amount_unit` / `display_name` は **UPDATE
されない**。Domain とルートを正しく実装しても DB に反映されず、しかも **API は 200 を返し、
画面はレスポンス DTO（メモリ上の集約）を描画するので一見成功して見える**。リロードして
初めて消えたと分かる型の欠陥であり、単体テスト（UseCase 層）やコンポーネントテストでは検出
できない（PGlite を使った Infrastructure 層の回帰テストでのみ検出できる）。

**この罠には 2 つの顔がある点に注意（P-1 確定で数量が編集対象に入ったため顕在化）**:

1. `expires_at` / `stored_location` が丸ごと `set` 句に無い（元々の罠）。
2. `amount_value` は `set` 句にあるが **`amount_unit` は無い**。つまり「数量の**値**は
   反映されるが、**単位**を変えると反映されない」という、外見上はより気づきにくい罠が
   もう 1 つ存在する（値が変わって見えるぶん、動作しているように誤認しやすい）。

**対応**: `set` 句を次の 4 列に拡張する。

```ts
set: {
  amountValue: sql`excluded.amount_value`,
  amountUnit: sql`excluded.amount_unit`,
  expiresAt: sql`excluded.expires_at`,
  storedLocation: sql`excluded.stored_location`,
}
```

`displayName` / `purchasedAt` / `productId` / `sourceShoppingItemId` は本ユニットでは
編集対象に含めない（確定・対象外）ため `set` 句に追加しない。ただし、これらを将来編集対象に
含める場合は同じ罠が再発するため、この節を将来課題としても申し送る。

### ⚠️ 既存テストが罠を「正しい挙動」として固定している（実測・2026-08-07）

`packages/infrastructure/tests/repositories/drizzle-pantry.repository.test.ts:111` の
**`同一 id の再 save() は amountValue のみ更新し不変フィールドを維持する`** が、
現在の `set` 句の挙動をそのままアサートしている。

```ts
expect(rows[0]?.amountUnit).toBe('個'); //         ← 変更後は 'g' になるべき
expect(rows[0]?.expiresAt).toBe('2026-07-18'); //  ← 変更後は '2026-07-19' になるべき
expect(rows[0]?.storedLocation).toBe('fridge'); // ← 変更後は 'freezer' になるべき
```

`set` 句を 4 列へ拡張すると**このテストが 3 つのアサーションで失敗する**。これは回帰ではなく
**期待値の更新が必要な変更**であり、実装計画のタスク分解に「既存テスト 1 件の修正」を
必ず含めること。テスト名も実態に合わせて改める（`amountValue のみ` → 4 列が更新される旨）。

なお `productId` / `displayName` / `purchasedAt` / `sourceShoppingItemId` を維持することの
アサーションは**そのまま残す**（本ユニットで編集対象外＝ `set` 句に追加しないことの
回帰ガードとして引き続き有効）。

**完了条件に含める回帰テスト**: `packages/infrastructure/tests/` に、Stock を編集 →
`save()` → 新しい Repository インスタンスで `find()` → `amount`（値・単位）/ `expiresAt` /
`storedLocation` が更新後の値であることを確認するテストを追加する。**単位のみを変更する
ケース**（値は据え置き、単位だけ変えるリクエスト）を必ずテストケースに含める（罠 2 の
再発防止。値だけ変えるテストでは罠 2 を検出できない）。既存の PGlite テスト基盤を再利用する。

## 変更後構成

### Domain

`Stock` に以下を追加（P-6 確定: 一括 props 版）。

```ts
/**
 * 数量・賞味期限・保存場所を編集する。`create()` と同じ制約（amount.value <= 0 は throw）を
 * 適用する。在庫 0 は `consume()` が集約から除去する概念であり、編集で 0 を設定することは
 * 許さない（正数のみ）。単位変更は許可する（例: 個 → g）。ただし単位変更は
 * `GenerateShoppingListUseCase.applyPantryDeduction` の在庫引き算の噛み合いに影響し得る
 * （リスク参照。本メソッド自体は在庫引き算のロジックを意識しない）。
 * @throws Error amount.value が 0 以下の場合
 */
Stock.updateDetails(props: {
  amount: Quantity;
  expiresAt: Date | null;
  storedLocation: StorageLocation | null;
}): void
```

バリデーションは `create()` と揃える。**`Stock.updateDetails` 内で `amount.value <= 0` を
throw することを必須とする**（実測確定・2026-08-07）。

> `packages/domain/src/shared/quantity.ts` の `Quantity.of()` は **`value < 0` のみ reject** し、
> **`0` は許容する**（`Quantity.of(0, unit)` は成功する。`consume()` が残量 0 を表現するために
> 必要だから）。したがって「`Quantity.of` が非正数を弾くから再チェック不要」は成立しない。
> `Stock.create()` が独自に `amount.value <= 0` を throw しているのと同じ理由で、
> `updateDetails` にも同じチェックが要る。

`Pantry` に委譲メソッドを追加。

```ts
/** @throws Error 指定した stockId の在庫が存在しない場合 */
Pantry.updateStockDetails(
  stockId: StockId,
  props: { amount: Quantity; expiresAt: Date | null; storedLocation: StorageLocation | null },
): void
```

`consumeStock` / `discardStock` と同型（対象 Stock を検索 → 見つからなければ throw →
対象 Stock のメソッドを呼ぶ）。

> **Domain 層は `StockNotFoundError` を throw できない**（実測確定・2026-08-07）。
> `StockNotFoundError` は `packages/application/src/pantry/` にあり、Domain がこれを import すると
> 依存方向（`Application → Domain`）に違反する。既存の `Pantry.consumeStock` は
> `throw new Error('Stock not found')`（`pantry.ts:196`）という素の `Error` を投げており、
> `StockNotFoundError` への変換は **UseCase 側の事前チェック**が担っている
> （`consume-stock.use-case.ts:19-23` で `pantry.stocks.find(...)` して `null` なら throw）。
> `updateStockDetails` も同じ責務分担に従う。

**単位変更を許可する前提の注記**: 単位変更自体をブロックする理由は無い（打ち間違いの訂正
ニーズが P-1 確定の主目的）。ただし単位変更は在庫引き算に波及し得るため「リスク」節で扱う。

### Application

新規 UseCase: `UpdateStockDetailsUseCase`。

```ts
export interface UpdateStockDetailsInputDto {
  stockId: string;
  amount: { value: number; unit: Unit };
  expiresAt: string | null; // YYYY-MM-DD。add-stock と同じ往復規約
  storedLocation: StorageLocation | null;
}

export class UpdateStockDetailsUseCase {
  constructor(private readonly pantryRepository: PantryRepository) {}

  /**
   * @throws StockNotFoundError 指定した stockId の在庫が存在しない場合
   * @throws InvalidStockOperationError amount.value が 0 以下の場合
   */
  async execute(input: UpdateStockDetailsInputDto): Promise<PantryDto> {
    const pantry = await this.pantryRepository.find();
    const stockId = StockId.fromString(input.stockId);

    // 404 の判定は UseCase 側の事前チェックで行う（ConsumeStock / DiscardStock と同型）。
    // Domain は Application の StockNotFoundError を import できないため。
    const stock = pantry.stocks.find((candidate) => candidate.id.equals(stockId)) ?? null;
    if (stock === null) {
      throw new StockNotFoundError(input.stockId);
    }

    try {
      pantry.updateStockDetails(stockId, {
        amount: Quantity.of(input.amount.value, input.amount.unit),
        expiresAt: input.expiresAt === null ? null : new Date(`${input.expiresAt}T00:00:00`),
        storedLocation: input.storedLocation,
      });
    } catch (error) {
      // Domain の素の Error（amount.value <= 0）を 422 へ写像する
      throw new InvalidStockOperationError(
        error instanceof Error ? error.message : 'Invalid stock update',
      );
    }

    await this.pantryRepository.save(pantry);
    return toPantryDto(pantry);
  }
}
```

**404 / 422 の発生経路**（実測した既存 UseCase の慣行に合わせて確定・2026-08-07）:

| 状況                   | 判定場所                                                       | 投げるもの                   | HTTP |
| ---------------------- | -------------------------------------------------------------- | ---------------------------- | ---- |
| `stockId` の在庫が無い | UseCase の**事前チェック**                                     | `StockNotFoundError`         | 404  |
| `amount.value <= 0`    | Domain（`Stock.updateDetails`）が素の `Error` → UseCase が変換 | `InvalidStockOperationError` | 422  |

`ConsumeStockUseCase` は事前チェック型（`consume-stock.use-case.ts:19-23`）、`AddStockUseCase` は
try/catch 変換型で、`UpdateStockDetailsUseCase` は**両方を組み合わせる**。
**存在しない `stockId` かつ数量 0 の複合ケースでは 404 が優先される**（事前チェックが先に走る）。
業務ロジック（何が不正か）は Domain に置き、UseCase が担うのはドメイン境界での
エラー型の写像だけである（`.claude/rules/domain-layer.md`「エラーハンドリングは UseCase の
入口で行う」）。

`complete-shopping.use-case.ts` は変更不要（`StockAdditionInputDto.expiresAt` は既に
受け取れる形であり、UseCase 内部の `Stock.create()` 呼び出しにもそのまま渡っている想定）。
本ユニットで変更が必要なのは呼び出し元（`complete-shopping-panel.tsx`）が `null` 固定を
やめて実際の入力値を渡すようにする UI 側のみ。

### api-contract

```ts
export const updateStockSchema = z.object({
  amount: z.object({ value: z.number().positive(), unit: unitSchema }),
  storedLocation: storageLocationSchema.nullable(),
  expiresAt: z.iso.date().nullable(),
});
export type UpdateStockBody = z.infer<typeof updateStockSchema>;
```

`addStockSchema` から `displayName` を除いた形になる（`amount` / `storedLocation` /
`expiresAt` はプリミティブを共有）。`amount.value` は `addStockSchema` と同じく
`z.number().positive()` で 0 以下を境界で弾く（Domain 側の再チェックと二重防御になるが、
`zValidator` はリクエスト境界での早期拒否として機能し、Domain 側のチェックは
UseCase から直接呼ばれるケース・将来の呼び出し元追加に備えた最終防御線として残す）。
`stockIdParamSchema` は既存のものをそのまま使う。

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
`NotFoundError` 継承として拾い、`InvalidStockOperationError` は `InvalidOperationError` 継承
として拾う）。

### Infrastructure

`drizzle-pantry.repository.ts` の `save()` の `set` 句を 4 列に拡張（詳細は「実装上の罠」節）。

### UI

「UI 設計」節で扱う。

## データフロー

### フロー 1: `/pantry` での在庫編集（数量・保存場所・賞味期限）

1. ユーザーが `stock-row.tsx` の編集ボタンを押す。
2. `pantry-client.tsx` が編集対象の `StockDto` を state に持ち、`StockEditDialog` を開く
   （`record` props パターン。`price-record-edit-dialog.tsx` と同型）。
3. ダイアログのフォームに現在の `amount` / `expiresAt` / `storedLocation` を初期値投入。
4. ユーザーが値を変更し保存 → `client.api.pantry.stocks[':stockId'].$put({ param, json })`。
5. Hono ルート → `UpdateStockDetailsUseCase` → `Pantry.updateStockDetails()` →
   `PantryRepository.save()`（DB UPDATE を含む。4 列すべて）→ `PantryDto` を 200 で返却。
6. ダイアログが閉じ、`router.refresh()` で Server Component 経由の一覧を再取得
   （`price-record-edit-dialog.tsx` と同じ C パターン）。

### フロー 2: 買い物完了時の賞味期限入力

1. `/shopping-lists/[id]` で「買い物完了」操作 → `CompleteShoppingPanel` が表示される。
2. 各行で数量・保存場所に加え、任意で賞味期限を入力（P-3 確定案: 行ごと折りたたみ／任意展開）。
3. 「完了する」→ `stockAdditions: StockAdditionInputDto[]`（`expiresAt` に入力値 or `null`）を
   組み立てて `CompleteShoppingUseCase` を呼ぶ既存フローにそのまま乗る（Application/Domain の
   変更は無し）。

### フロー 3: `/pantry` の在庫カード表示（保存場所ラベル・緊急度チップ）

1. `page.tsx`（Server）が `GetPantryUseCase` の結果に加え `now = new Date()` を生成し、
   `PantryClient` に `pantry` と `asOf={now}` を props で渡す（`page.tsx`（ダッシュボード）と
   同型のパターン）。
2. `PantryClient` → `LocationGroup` → `StockRow` へ `asOf` を伝播する。
3. `StockRow` が `stock.expiresAt !== null` のとき `getExpiryRemainingDays` /
   `getExpiryUrgency`（`expiry.ts` に共通化。後述）で緊急度を算出し、閾値
   `EXPIRY_URGENCY_WITHIN_DAYS`（= 3）以内の場合のみチップを表示する。保存場所ラベルは
   `expiresAt` の有無に関わらず常時表示する。

#### チップの表示条件・文言・レイアウト（レビュー M-1 / M-2 / M-3 を受けて確定・2026-08-07）

- **表示条件は `getExpiryRemainingDays(expiresAt, asOf) <= EXPIRY_URGENCY_WITHIN_DAYS`。**
  つまり**残日数が負（期限切れ）も表示対象に含める**。`0 <= remainingDays && remainingDays <= 3`
  と書くと期限切れが非表示になり、ダッシュボードの `selectExpiringStocks`
  （`dashboard-view.ts:36-39`。期限切れを含める）と意味がずれる。
  **期限切れこそ最も目立つべき**なので含める。
- **文言は `formatExpiryUrgencyLabel(remainingDays)`**（`期限切れ` / `本日まで` / `明日まで` /
  `あとN日`）をそのまま使う。ダッシュボードと同じ文言にする。
  既存のプレーンな日付表示（`〜7/12まで` = `formatExpiresAt`）は**残す**
  （チップは緊急度、日付表示は事実。役割が違う）。
- **レイアウト（M-3）**: `stock-row.tsx` の現在の構造は
  `<li className="flex items-center gap-3">` の中に「情報側 `flex-1`」と
  「ボタン側 `shrink-0` に 2 個」が並ぶ。ここへ**編集ボタン（3 個目）+ 保存場所ラベル +
  緊急度チップ**を同時に足すため、375px 幅で破綻する危険が完了パネル（R-2）より高い。
  - 保存場所ラベルと緊急度チップは**情報側（`flex-1` の列）**に置く。ボタン側には足さない。
  - ボタンが 3 個になるため、`shrink-0` の横並びのままだと情報側が潰れる。
    **ボタン行を情報行の下へ折り返すか、ボタンをアイコンのみに縮めるか**を実装時に選ぶ
    （どちらでもよいが、375px で情報側のテキストが 1 文字も切れないことを基準にする）。
  - **実画面確認 MB 項目に `/pantry` の 375px 目視を必ず含める**（完了パネルの MB-14 と同様）。

## API 設計

| メソッド | パス                          | リクエスト                                                                                                      | レスポンス                              | ステータス      |
| -------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------- |
| PUT      | `/api/pantry/stocks/:stockId` | `{ amount: { value: number; unit: Unit }; storedLocation: StorageLocation \| null; expiresAt: string \| null }` | `PantryDto`（`{ stocks: StockDto[] }`） | 200 / 404 / 422 |

- `amount` / `storedLocation` / `expiresAt` はすべて必須キー（`storedLocation` / `expiresAt` は
  `nullable()` であって `optional()` ではない）。クリアは明示的に `null` を送る（P-2 確定）。
- 買い物完了 API（`POST /api/shopping-lists/:id/complete` 相当。既存）は契約変更なし。

## DB 設計

スキーマ変更なし。`packages/infrastructure/src/db/schema.ts:144-162` の `expires_at`
（`date()`・nullable・インデックス無し）・`stored_location`（`text()`・nullable・enum 制約は
アプリ側の `toStorageLocation` で検証）・`amount_value` / `amount_unit` をそのまま使う。
インデックスは既存の `stocks_product_id_idx` のみで変更なし（本ユニットは単一行の UPDATE の
みで、一覧取得のクエリパターン自体は変わらないため新規インデックスは不要）。

Repository の `save()` 内の `onConflictDoUpdate.set` を 4 列に拡張する必要がある点は
「実装上の罠」節を参照。

## フロントエンド設計

「UI 設計」を参照（下記）。

## UI 設計

### 編集ダイアログ（`stock-edit-dialog.tsx`、新設）

`price-record-edit-dialog.tsx` の構造をそのまま踏襲する。

- Props: `{ stock: StockDto | null, onOpenChange: (open: boolean) => void }`。
  `open = stock !== null`。
- `useEffect([stock?.id])` で `amount`（`QuantityField` 用の文字列表現）/ `expiresAt` /
  `storedLocation` の初期値を state に投入（`price-record-edit-dialog.tsx` L85-131 と同型。
  補助データ取得（店舗一覧相当）は無いため `loading` 相当は不要）。
- フィールドは **数量 / 保存場所 / 賞味期限の 3 つ**（確定・P-1）:
  - 数量: `QuantityField` + `parseQuantity`（`add-stock-form.tsx` と同じ部品・パース関数）。
    `parseQuantity` の結果が `kind !== 'amount'` または `value <= 0` の場合は送信前に
    `fieldErrors` へ反映し、クライアント側で弾く（`price-record-edit-dialog.tsx` の
    `packageSizeValue` フィールドと同じ検証パターン）。
  - 保存場所: `SelectField` + `LOCATION_SELECT_OPTIONS`（`pantry-view.ts` を再利用）。
  - 賞味期限: `Input type="date"`（`add-stock-form.tsx` と同じ部品。空文字 → `null`）。
- 送信: `client.api.pantry.stocks[':stockId'].$put({ param: { stockId: stock.id }, json: body })`。
  `response.ok` で成功、`onOpenChange(false)` → `router.refresh()`。404 は
  「この在庫はすでに削除されています」を表示して閉じる（`price-record-edit-dialog.tsx` の
  404 分岐と同型）。422（数量 0 以下等、クライアント検証をすり抜けたケース）は
  `fieldErrors` に反映。
- 起動導線: `stock-row.tsx` に「編集」ボタンを追加（既存の「消費」「廃棄」ボタンの並びに
  1 つ増やす）。`pantry-client.tsx` が編集対象の `StockDto` を state で保持し、
  `StockEditDialog` に渡す（`pantry-client.tsx` は `consume`/`discard` の送信中 state を
  `useApiAction` で管理しているが、編集ダイアログはパターン C（ローカル `useState` +
  `router.refresh()`）を使うため、既存の `useApiAction` 呼び出しとは独立させる）。

### 買い物完了パネルの改修（P-3 確定: 行ごと任意展開）

現在の行は `flex gap-2` で `QuantityField`（`flex-1`）と `SelectField`（`w-28`）が横並びに
なっている（`complete-shopping-panel.tsx` L241-268）。この行に日付入力を追加で並べると
モバイル幅（375px 目安）で破綻するリスクが高いため、日付入力は**独立した行として追加**する。

変更点:

- `RowState` に `expiresAt: string`（date input の値）と `expiresAtExpanded: boolean` を追加。
- `StockAdditionRow` に「賞味期限を設定」ボタン（テキストリンク調、数量/保存場所の行の下）を
  追加。押すと `Input type="date"` を含む行が展開される。展開中は「賞味期限を削除」に文言が
  変わり、押すと値をクリアして折りたたむ。
- `handleComplete` の `additions.push(...)` の `expiresAt: null` を
  `expiresAt: row.expiresAt === '' ? null : row.expiresAt` に変更。
- 既定は非表示（Q-1 の「全品目に入れるのは負荷が高い」「縦に長くなる」という懸念への対処）。
  展開した行だけパネルの高さが増える。

### `/pantry` カードへの保存場所ラベル・緊急度チップ追加（P-4 確定: 両方追加）

**表示方針**: 保存場所ラベルは全カードに常時表示する（`LocationGroup` の見出しに加えて、
個々のカードにも小さく表示。グルーピングが将来崩れた場合や、フィルタ表示を追加する場合に
備えた保守的な選択）。緊急度チップは**ダッシュボードと同じ閾値（既定 3 日以内）以内の在庫
にのみ**表示する。閾値外（4 日以上先）の在庫は、既存通り `formatExpiresAt` によるプレーンな
日付表示（`〜7/12まで`）のみとし、チップは出さない。

**閾値をこのように扱う理由**: `getExpiryUrgency` は「`selectExpiringStocks` の閾値日数以内で
フィルタ済みの値を渡す前提」の実装で、4 日以上先の残日数を渡しても `'soon'` に収束してしまう
（`dashboard-view.ts:53-65`）。`/pantry` は全在庫を表示する一覧画面であり、ダッシュボードのように
事前に「近い順」でフィルタされていない。したがって `/pantry` 側で `getExpiryRemainingDays`
の結果を閾値と比較し、**閾値以内の場合にのみ** `getExpiryUrgency` の結果をチップとして表示
する（閾値超のカードにチップを出さない）。これによりダッシュボードとの表現の意味は完全に
一致し、`getExpiryUrgency` の実装（4 日以上も `'soon'` に収束する前提）を変更する必要が無い。

**ダッシュボードとの役割重複について**: ダッシュボードは「直近の要注意在庫」を上位数件
サマリするウィジェット、`/pantry` は全在庫の一覧という役割分担は変わらない。`/pantry` では
閾値以内の在庫にだけ同じ意味のチップを出すことで、一覧画面の中でも要注意在庫が視覚的に
目立つようにする（一覧の「どれが優先か」をユーザーがスクロールして探す負担を減らす）。

**実装方針**: `page.tsx`（`/pantry`）がダッシュボードの `page.tsx` と同じパターンで
`now = new Date()` を生成し、`PantryClient` に `asOf` として渡す（フロー 3 参照）。

### 期限緊急度ユーティリティの共通化（`expiry.ts` 新設）

`getExpiryRemainingDays` / `getExpiryUrgency`（`ExpiryUrgency` 型を含む）/
`formatExpiryUrgencyLabel` および、これらが依存する非公開ヘルパー（ローカル日付 0 時基準の
パース関数）を `apps/web/src/app/_utils/dashboard-view.ts` から
`apps/web/src/app/_utils/expiry.ts`（新設）へ**純粋な移動**として切り出す。ロジックは一切
変更しない。`dashboard-view.ts` は `expiry.ts` からこれらを re-import し、
`selectExpiringStocks` の実装（引き続き `dashboard-view.ts` に残す。ダッシュボード固有の
「上位 N 件選出」の責務のため）はそのまま維持する。`page.tsx`（ダッシュボード）のローカル
定数 `EXPIRY_WITHIN_DAYS = 3` も `expiry.ts` に `export const EXPIRY_URGENCY_WITHIN_DAYS = 3`
として切り出し、ダッシュボードの `page.tsx` と `/pantry` の `page.tsx` の両方から参照する
（値は変わらないため挙動不変。「同じ閾値を 2 箇所に別々の名前・別々の値でハードコードしてしまう」
将来のドリフトを防ぐ）。

`expiryUrgencyChipClass` は `category-color.ts` に既存の同型関数（`mealPlanStatusChipClass`
等）と並んでいるため、`category-color.ts` から**動かさない**（「配色はここだけに置く」という
同ファイルの既存方針を尊重する）。`/pantry` 側は `expiry.ts` から緊急度算出関数を、
`category-color.ts` から配色関数を、それぞれ個別に import する（ダッシュボードの既存の
import 構成と同じ形になる）。

**移設に伴う注意（実装計画・試験計画への申し送り）**:

- 移動は挙動不変のため新規テストは不要だが、既存の `dashboard-view.ts` に対するテストが
  `expiry.ts` 由来の関数を re-export 経由でテストする形になる場合、import パスの追随が
  必要になる（テストファイルが直接 `dashboard-view.ts` から該当関数を import している場合は
  `expiry.ts` からの import に変更する）。
- `parseExpiryDate` / `toLocalMidnight` 相当の非公開ヘルパーは、移動後は `expiry.ts` 内に
  閉じる（`dashboard-view.ts` の `selectExpiringStocks` からは `expiry.ts` の公開関数
  （`getExpiryRemainingDays`）経由で利用する形に整理してよいが、既存の直接比較ロジックを
  そのまま残す場合は該当ヘルパーも `expiry.ts` から export する。いずれを選ぶかは実装時に
  「挙動不変」を最優先して判断する）。

## エラー処理

- 404（`StockNotFoundError`）: 存在しない `stockId` を指定した場合。既存の `app.onError` が
  `NotFoundError` 継承で拾うため追加実装不要。UI は「この在庫はすでに削除されています」を
  表示してダイアログを閉じ、`router.refresh()` で一覧を最新化する。
- **400**: `updateStockSchema` の Zod バリデーション失敗（`amount.value` が正数でない、
  `expiresAt` が `YYYY-MM-DD` 形式でない、`storedLocation` が enum 外、キー省略）。
  `zValidator`（`@hono/zod-validator`）が**リクエスト受付時点で自前で 400 を返し、
  `app.onError` を経由しない**。UseCase には到達しない（`apps/web/tests/server/routes/pantry.test.ts`
  の既存テストで実測確認済み）。
- 422（`InvalidStockOperationError`）: Domain 層（`Stock.updateDetails`）が `amount.value <= 0`
  等の不変条件違反を拒否した場合。契約層の 400 で大半は事前に弾かれるため、これは**契約層を
  バイパスする将来の呼び出し元に対する最終防御線**である（ドメイン境界の原則）。
  UI は `fieldErrors` に反映（数量は `parseQuantity` によるクライアント側検証で大半は事前に
  弾かれる想定）。
  > 400 と 422 は**層が違う**（契約層 = `zValidator` / ドメイン層 = `InvalidOperationError`）。
  > 実装時に混同しないこと。詳細は
  > [stock-edit.contract.md](./stock-edit.contract.md) §4 を正典とする。
- ネットワークエラー: `try/catch` で「通信エラーが発生しました」を表示（既存ダイアログと同型）。
- 買い物完了パネル側の異常系（E-6）: 日付は `type="date"` のブラウザ標準バリデーションに
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
- 入力値は `zValidator` による Zod スキーマ検証を境界で行う（`amount.value` の正数制約・
  `expiresAt` の日付形式・`storedLocation` の enum 制約）。
- DB アクセスは Drizzle のパラメータ化クエリのみで、SQL インジェクションのリスクは無い
  （既存の `save()` 実装のパターンを踏襲）。

## 性能

新規の外部 API / 外部ストレージ I/O は導入せず、大量データを扱う一覧・集計クエリの新設・
変更も無く、明示された性能要件も無い（`docs/requirements/stock-edit.md` 非機能要件）。
したがって性能セクションは簡潔にとどめる。

- 想定負荷: 1 リクエストあたり Stock 1 件の UPDATE（4 列）。`Pantry.find()` は既存同様、
  世帯全体の Stock 一覧を毎回取得してから集約内で更新するため、Stock 件数が極端に多い場合
  （数百件超）は読み込みコストが線形に増える可能性があるが、MVP1 の単一世帯利用ではこの
  規模には達しない想定（推定。実測データなし）。
- レスポンスタイム: 既存の `POST /api/pantry/stocks/:stockId/consume` と同等の処理量
  （1 件の集約更新）であり、同程度の応答時間になる見込み（確認推奨。既存エンドポイントの
  実測値がドキュメント化されていないため、本設計では数値を断定しない）。
- `/pantry` カードでの緊急度チップ算出（`getExpiryRemainingDays` 等）は純粋関数によるクライアント
  側計算であり、追加のサーバー I/O は発生しない。Stock 件数分のループ計算のみで、MVP1 の
  規模では無視できるコスト（推定）。
- 将来課題: Unit B で「賞味期限が近い順」のクエリが増える場合、`expires_at` へのインデックス
  追加を検討する（本ユニットでは不要）。

## テスト方針

- Domain（`packages/domain/tests/pantry/`）:
  - `Stock.updateDetails()` の単体テスト: 数量の値変更、単位変更、期限の設定・変更・null
    クリア、保存場所の設定・変更・null クリア、**数量 0 以下の拒否**（境界: 0 と負値の両方）。
  - `Pantry.updateStockDetails()` の単体テスト: 対象 Stock が無い場合に `StockNotFoundError`。
- Application（`packages/application/tests/pantry/`）: `UpdateStockDetailsUseCase` のテスト
  （正常系・404・数量 0 以下で 422 相当のエラー）。
- api-contract: `updateStockSchema` のバリデーションテスト（不正日付・enum 外の値・
  `amount.value` が 0 以下で reject されることの確認）。
- Infrastructure（`packages/infrastructure/tests/repositories/`）: PGlite を使い、
  Stock を編集 → `save()` → 新しい Repository インスタンスで `find()` → 値が保持されている
  ことを確認する回帰テスト。**以下のケースを個別に含める（「実装上の罠」の再発防止の核）**:
  - 数量の値のみ変更（単位は据え置き）。
  - **数量の単位のみ変更**（値は据え置き。罠 2 の直接の検出ケース）。
  - 賞味期限のみ変更・null クリア。
  - 保存場所のみ変更・null クリア。
  - 4 項目すべてを同時に変更。
- apps/web:
  - ルートテスト（`apps/web/tests/server/routes/pantry.test.ts` 相当）: PUT の 200/404/422
    （数量 0 以下・不正日付・enum 外を含む）。
  - コンポーネントテスト: `stock-edit-dialog.tsx` の初期値投入・保存（数量/保存場所/期限）・
    404/422 ハンドリング、`complete-shopping-panel.tsx` の賞味期限展開・入力・送信ペイロード
    への反映（既存テストの回帰確認を含む）、`stock-row.tsx` の保存場所ラベル常時表示・
    緊急度チップの閾値内外での出し分け。
  - 在庫引き算への影響の観点（B-5）: 本ユニットでは `applyPantryDeduction` 自体のテストは
    追加しないが、単位変更が既存の在庫引き算テスト（`pantry-shopping-integration` 系）に
    悪影響を与えないこと（回帰）を確認する。単位変更後の在庫引き算の新規シナリオ自体は
    Unit A の対象外（在庫引き算ロジックの変更ではないため）。

## 移行とリリース

DB マイグレーションは不要。リリース順序に依存関係がある点のみ注意する。

1. Infrastructure の `save()` 修正（実装上の罠の解消・4 列）を先に、または同一 PR で必ず含める。
   UI・API だけ先にリリースすると「保存したのに消える」不具合が本番で発生する。
2. `expiry.ts` への切り出し（純粋な移動）は、ダッシュボードの既存表示に回帰が無いことを
   確認してから `/pantry` 側の利用を追加する順序で進める（移動 → 動作確認 → 新規利用、の
   3 ステップに分けるとレビューしやすい）。
3. Domain/Application/api-contract/route/Infrastructure/UI は 1 ユニットとしてまとめて
   リリースする（機能フラグは導入しない。MVP1 の他機能と同様、単一 PR/デプロイでよい規模）。

## リスク

| #                                          | リスク                                                                             | 影響                              | 対策 |
| ------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------- | ---- |
| R-1                                        | Repository の `onConflictDoUpdate.set` 拡張漏れ（実装上の罠。特に `amount_unit` の |
| 漏れは値が変わって見えるため気づきにくい） | 編集が見かけ上成功しリロードで消える。                                             |
| ユーザー体験を著しく損なう                 | PGlite 回帰テストを完了条件の必須項目にする。単位のみ変更する                      |
| ケースを個別テストとして必須化する         |
| R-2                                        | 完了パネルの改修（P-3）でモバイル幅が崩れる                                        | 主要導線の 1 つが視覚的に破綻する | 日付 |

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
| R-5 | **数量の単位を編集で変更すると、在庫引き算（`GenerateShoppingListUseCase.
  applyPantryDeduction`）の噛み合いが変わる**。同 UseCase は「単位不一致は差し引かず全量購入
（`pantry-shopping-integration.md` D-1）」「数えられる単位（`isCountableUnit`）のみ切り上げ
（P-1）」で動くため、在庫の単位を `個` → `g` のように編集すると、それまで差し引けていた
食材が差し引けなくなる（またはその逆）ことがある | 献立作成時の買い物リスト生成結果が、
ユーザーが在庫編集した直後に意図せず変わる可能性 | 本ユニットで `applyPantryDeduction` の
ロジック自体は変更しない（対象外）。単位変更 UI にはこの影響を説明する注記を付けるかは
実装計画フェーズの判断に委ねるが、試験観点として回帰テスト（B-5）に含めることを必須とする |
| R-6 | 数量を編集で 0 に設定しようとする操作 | `consumeStock` が「0 になったら集約から除去」する
概念と衝突し、Stock の意味論が曖昧になる | Domain 層で 0 以下を明示的に拒否する
（`Stock.updateDetails` の契約として JSDoc に明記。テストで境界値を確認） |
| R-7 | `expiry.ts` への切り出しがダッシュボードの表示に意図せぬ回帰を起こす | ダッシュボードの
賞味期限表示が壊れる | 純粋な移動（ロジック不変）に限定し、移動直後にダッシュボードの
既存テストが全て通ることを確認してから `/pantry` 側の新規利用に進む（移行とリリース節） |

## 確定事項（旧: 未決事項）

P-1〜P-6 はすべて **2026-08-07 にユーザー確定済み**（Orchestrator 経由の確認）。以下に確定
内容と、比較検討した非採用案の記録を残す（`shopping-complete-stock-selection.md` の書式に
倣う）。

| #                                                                              | 論点                                                 | 確定                                                        |
| ------------------------------------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------- |
| P-1                                                                            | 編集できる項目の範囲                                 | **期限・保存場所 + 数量**（`displayName` は対象外）。推奨案 |
| （期限・保存場所のみ）とは異なる。打ち間違いの訂正ニーズを踏まえた実用上の判断 |
| P-2                                                                            | HTTP メソッドと部分更新のセマンティクス              | `PUT /api/pantry/stocks/:stockId`・全項目                   |
| 必須・`null` でクリア（推奨どおり）                                            |
| P-3                                                                            | 完了パネルの賞味期限入力 UI                          | 行ごと折りたたみ／任意展開（推奨どおり）                    |
| P-4                                                                            | `/pantry` カードへの保存場所ラベル・緊急度チップ追加 | **両方追加**。推奨案（保存場所                              |
| ラベルのみ）とは異なる                                                         |
| P-5                                                                            | Domain 不変性方針の変更                              | ADR-0016 で記録する（推奨どおり）                           |
| P-6                                                                            | Domain API の形                                      | `Stock.updateDetails(props)` 一括（推奨どおり）             |

### P-1 の詳細（確定: 案 B 相当・ただし displayName を除く）

比較した案:

- 案 A（推奨だった案）: 期限・保存場所のみ。
- 案 B: 期限・保存場所 + 数量・品目名も含む。

**確定**: 期限・保存場所 + **数量**を編集対象に含める。**品目名（`displayName`）は対象外の
まま**とする（案 B の一部のみ採用）。数量は `consume` で減らせるが増やせない・打ち間違いを
直せないという実態への対応を優先する一方、`displayName` の編集は Product 連携時の整合性
検討・表示専用文字列を超えた設計判断が必要になるため、今回は見送り別ユニットで再検討する。

この確定に伴う波及（Domain のバリデーション拡張・Repository の罠の拡大・在庫引き算への
影響）は「実装上の罠」「変更後構成」「リスク」の各節に反映済み。

### P-2 の詳細（確定: 案 A）

比較した案:

- 案 A: `PUT`。両フィールド必須・`null` でクリア。
- 案 B: `PATCH`。各フィールド `optional().nullable()` で「省略＝変更しない」「`null`＝クリア」
  を区別。

**確定: 案 A**。「省略と null の違い」を常に正しく扱う実装コストを避けられる。編集ダイアログの
UI は 3 フィールド（数量・保存場所・期限）を常に一緒に表示・編集する設計であるため、全項目
送信のデメリットは実質無い。既存の `UpdatePriceRecordUseCase` / `updatePriceRecordSchema` とも
構造が揃う。

### P-3 の詳細（確定: 案 B）

比較した案:

- 案 A: 行ごと常時表示。モバイル幅で 3 コントロールが 1 行に収まらず破綻するリスクが高い。
- 案 B: 行ごと折りたたみ／任意展開。
- 案 C: 一括既定値 + 行上書き。生鮮と乾物で期限の性質が大きく異なり誤適用のリスクがある。
- 案 D: パネルに出さず Unit A の編集ダイアログに委ねる。roadmap の完了条件を満たさず不採用。

**確定: 案 B**。Q-1 の懸念（負荷・縦の長さ）に対処しつつ roadmap の完了条件を満たせる。
実装コストは `RowState` に `expiresAt` と `expiresAtExpanded` を足す程度で既存の `updateRow`
パターンに乗せられる。モバイル幅の問題は日付入力を独立行として追加することで回避する。

### P-4 の詳細（確定: 両方追加。案 A 相当）

比較した案:

- 案 A: 保存場所ラベル・緊急度チップの両方を追加。
- 案 B（推奨だった案）: 保存場所ラベルのみ追加。
- 案 C: どちらも追加しない。

**確定: 案 A（両方追加）**。保存場所は編集可能になるため一覧でも見える必要があり、緊急度
チップもダッシュボードとの表示の非対称を解消する目的で追加する。実装上の論点（共通化の
方法・閾値の扱い）は「UI 設計」節の「`/pantry` カードへの保存場所ラベル・緊急度チップ追加」
「期限緊急度ユーティリティの共通化」に記載済み（`expiry.ts` への切り出しは案 A を採用、
`expiryUrgencyChipClass` は `category-color.ts` から動かさない）。

### P-5 の詳細（確定: ADR-0016 で記録）

`pantry-core.md` S-4 案 α は「値の後付け（在庫編集操作）は Unit B / Phase 2 の検討事項として
申し送る」としていた。`shopping-complete-stock-selection.md` Q-1 も「期限管理を使いたくなった
時点で『Stock 編集』または『完了パネルへの期限入力』のどちらかを足す」と明示的に申し送って
いる（同書 L327-328）。つまり両ドキュメントの申し送り事項が、Sprint 8 で「期限管理を実用化
する」というゴールが明確になったことで、まさに実現するタイミングに来たという整理になる。
当時は編集ニーズ自体が顕在化しておらず、不変性を維持するコスト（実装しない選択）が
妥当だったが、現時点では roadmap の完了条件として明示されたため転換が必要と判断する。

正式な記録は **[ADR-0016](../decisions/ADR-0016-stock-details-mutable.md) で行う。作成済み**
（2026-08-07）。P-1 の確定内容（数量・期限・保存場所を可変にし `displayName` /
`purchasedAt` / `productId` / `sourceShoppingItemId` は不変のまま）、`amount` が元々
`consume()` のために唯一の可変フィールドだったこととの関係、非採用案（廃棄して作り直す運用 /
`expiresAt` のみ可変 / `PATCH` / 差し替え方式）を同 ADR に記録している。

### P-6 の詳細（確定: 案 B）

比較した案:

- 案 A: 個別メソッド `Stock.changeExpiresAt(expiresAt)` / `Stock.changeStoredLocation(location)`
  （+ 数量が入ったことで `Stock.changeAmount(amount)` も追加が必要になる）。単一責任だが、
  `Pantry` 側の委譲メソッドも増え、1 リクエストで複数フィールドを変える場合の呼び出し調整が
  必要になる。
- 案 B: `Stock.updateDetails(props: { amount, expiresAt, storedLocation }): void` 一括。

**確定: 案 B**。P-2（PUT・全項目送信）と自然に対応し、`Product.updatePriceRecord(id, props)`
という既存の一括更新の先例（`packages/domain/src/product/product.ts:197-`）と構造が揃う。
`Pantry` 側は `updateStockDetails(stockId, props): void` という 1 つの委譲メソッドを追加し、
`consumeStock`/`discardStock` と同じ「対象 Stock を検索 → 無ければ `StockNotFoundError`」の
形に揃える。数量が編集対象に加わったことで案 A のメソッド数がさらに増える点も、案 B を選ぶ
理由を補強する。

## 将来課題・申し送り

- Unit B（賞味期限アラート）: 本ユニットで在庫に実際の期限データが入るようになるため、
  アラート対象データが揃う。`expires_at` へのインデックス追加は Unit B で「期限が近い順」の
  クエリが増える場合に検討する（本ユニットでは不要）。
- Unit C（消費・廃棄の取り消し・履歴）: 本ユニットは在庫の「詳細編集」のみを扱い、
  消費・廃棄の取り消しは扱わない。編集ダイアログと undo は別の操作系統として今後も分離する
  想定。
- `displayName`（品目名）の編集は対象外のまま。実データで打ち間違い等の困りごとが観測された
  場合に別ユニットとして再検討する（P-1 確定時の申し送り）。
- 数量の単位編集が在庫引き算（`applyPantryDeduction`）に与える影響（R-5）は、本ユニットでは
  ロジック変更をしないが、実運用で「編集したら買い物リストの生成結果が変わった」という
  困りごとが観測された場合、在庫引き算側のユニットで再検討する。
- ADR-0016（Domain 不変性方針の変更）は**設計フェーズで作成済み**
  （[ADR-0016-stock-details-mutable.md](../decisions/ADR-0016-stock-details-mutable.md)）。
- `pantry-core.md` S-4 案 α の記述に「stock-edit で覆された」旨の注記を追記する
  （R-3。実装計画フェーズでの軽微なドキュメント更新として扱う）。
