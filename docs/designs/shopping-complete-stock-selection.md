# 設計書: shopping-complete-stock-selection（買い物完了時に在庫へ追加する品目を選ぶ）

- ステータス: confirmed（ユーザー確定・2026-07-25。方式＝「完了画面で選んで追加」、Q-1〜Q-3 は推奨案で確定）
- レベル: L2
- 関連:
  - `docs/designs/remove-shopping-stock-add.md`（2026-07-24・自動加算を削除した設計。本設計はその再設計）
  - `docs/designs/pantry-manual-add.md`（項目5・在庫の手動追加。本設計でも導線として残す）
  - `docs/designs/pantry-core.md` / `pantry-shopping-integration.md`（S-3 冪等設計の正典）
  - `docs/designs/shopping-list-core.md`（買い物完了フローの正典）

---

## 背景

2026-07-24 の項目6 で、買い物完了（`CompleteShoppingUseCase`）から Pantry への**自動在庫加算を削除**した
（`docs/designs/remove-shopping-stock-add.md`）。在庫は在庫画面から手動で追加する運用に切り替えたが、
実運用で「買い物が終わったのに在庫タブに何も出てこない」という UX の断絶が確認された（2026-07-25）。

全自動（削除前）と全手動（現状）の中間として、**買い物完了の操作の中で在庫化する品目を選ぶ**方式を
採る（ユーザー確定・2026-07-25）。

## 目的

買い物完了の流れを離れずに、購入した品目のうち在庫化したいものを選び、数量・保存場所を確認して
Pantry に追加できるようにする。買い物リストに出てこない買い物（自宅の作り置き等）のための
在庫画面からの手動追加は、これまでどおり残す。

## 要件

| #   | 要件                                                                           |
| --- | ------------------------------------------------------------------------------ |
| R-1 | 「買い物完了」操作の中で、bought 品目の一覧から在庫に追加する品目を選べる      |
| R-2 | 品目ごとに数量（値＋単位）を確認・修正できる。買い物リストの数量を初期値にする |
| R-3 | 選択しなかった品目は在庫に追加されない。1 件も選ばなくても買い物は完了できる   |
| R-4 | 買い物再開（reopen）→ 再完了しても、同じ品目が二重に在庫追加されない           |
| R-5 | 価格記録（Product）・献立の shopping→cooking 遷移は現行の挙動を変えない        |
| R-6 | 在庫画面からの手動追加（項目5）は残す                                          |

## 対象範囲

- `packages/domain`: `Pantry.hasStockFromShoppingItem()` の復活（下記 §現状構成の実測結果を参照）
- `packages/api-contract`: 買い物完了リクエストボディのスキーマ追加
- `packages/application`: `CompleteShoppingUseCase` の入力・処理拡張、DTO 追加
- `apps/web`: 完了時の選択パネル（新規コンポーネント）、`ShoppingListClient` の完了ハンドラ、
  `POST /:id/complete` ルートのバリデータ追加

## 対象外

- **在庫引き算**（`GenerateShoppingListUseCase.applyPantryDeduction`）の変更 — 現行維持。
- **Stock の編集機能**（追加後に数量・賞味期限・保存場所を直す）— 既存の未実装事項。本タスクでは扱わない。
- **既存 Stock への数量マージ** — 「追加＝常に新規 Stock」の既存方針（`AddStockUseCase`）を踏襲する。
- **`Pantry.addStock` / `Stock` の変更** — 現行のまま使う。Domain の変更は
  `hasStockFromShoppingItem` の復活 1 メソッドのみに限る。
- **DB スキーマ変更・マイグレーション** — なし（下記 §DB 設計）。
- 買い物リスト生成・同期・品目操作の挙動変更。

## 現状構成

```
[買い物完了ボタン] --POST /:id/complete (body なし)--> CompleteShoppingUseCase
                                                        ├ recordPrices(boughtItems)   → Product
                                                        ├ shoppingList.complete()     → ShoppingList
                                                        └ repairMealPlanTransition()  → MealPlan
                                                        （Pantry には一切触れない）
```

- `CompleteShoppingUseCase` のコンストラクタ引数は 3 個（shoppingList / product / mealPlan）。
- 価格記録の冪等性は「価格レコード ID を買い物品目 ID から決定的に導出し、既存ならスキップ」で担保（D-1・7/24）。

### 冪等ガード資産の実測（2026-07-25・実装着手前に確認）

7/24 の `remove-shopping-stock-add.md` は D-5 で「`Stock.sourceShoppingItemId` 列・
`Pantry.hasStockFromShoppingItem` は残置」としていたが、**実測すると 1 件外れていた**。

| 資産                                                  | 実測                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| `stocks.source_shopping_item_id`（`text().unique()`） | ✅ 現存（`packages/infrastructure/src/db/schema.ts`）              |
| `Stock.sourceShoppingItemId` フィールド・getter       | ✅ 現存                                                            |
| `DrizzlePantryRepository` の保存・復元                | ✅ 現存（往復とも実装済み）                                        |
| `Pantry.hasStockFromShoppingItem()`                   | ❌ **削除済み**（`972f279`・7/24。項目6 の後に死コードとして除去） |

`972f279` はメソッド 7 行と単体テスト 3 件を消しただけで、列・フィールド・リポジトリ往復には触れていない。
したがって **DB マイグレーションは不要**で、Domain へのメソッド復活のみで冪等ガードが揃う。

## 変更後構成

```
[買い物完了ボタン] → [在庫追加パネル]（クライアント内・API 往復なし）
                          ↓ 選択・数量調整
       --POST /:id/complete { stockAdditions: [...] }--> CompleteShoppingUseCase
                                                        ├ validateStockAdditions()    （404 / 422）
                                                        ├ addStocks()                 → Pantry
                                                        ├ recordPrices(boughtItems)   → Product
                                                        ├ shoppingList.complete()     → ShoppingList
                                                        └ repairMealPlanTransition()  → MealPlan
```

保存順序は **Pantry → Product → ShoppingList → MealPlan**（削除前の S-3 と同じ順序に戻す）。
`ShoppingList` の保存が「これより前は再実行対象・これより後は修復のみ」の冪等ガードのコミットポイント
であることも変わらない。

## データフロー

1. ユーザーが「買い物完了」を押す。**この時点では API を呼ばない**（現行は即 POST）。
2. クライアントが手元の `items` から bought 品目を抽出し、選択パネルを描画する。
   - `requiredAmount` があれば数量入力にプリフィル（例: `200g`）。
   - `amountNote` のみ（「適量」等）の品目は数量が空 → ユーザーが入力しない限り選択不可。
3. ユーザーがチェック・数量・保存場所を調整し「完了する」を押す。
4. `POST /api/shopping-lists/:id/complete` に `{ stockAdditions: [...] }` を送る。
5. UseCase が Pantry 追加 → 価格記録 → リスト完了 → 献立遷移を順に実行する。
6. レスポンス（`ShoppingListDto`）を受けて完了バナーを出す。追加件数はクライアントが送信数から表示する。

## API 設計

### 新規スキーマ（`packages/api-contract/src/shopping-list.schema.ts`）

```ts
export const stockAdditionSchema = z.object({
  itemId: z.uuid(),
  amount: z.object({ value: z.number().positive(), unit: unitSchema }),
  storedLocation: storageLocationSchema.nullable(),
  expiresAt: z.iso.date().nullable(),
});

export const completeShoppingSchema = z.object({
  stockAdditions: z.array(stockAdditionSchema),
});
```

- `storageLocationSchema` は `pantry.schema.ts` から import する（同一パッケージ内なので依存方向の問題なし）。
- `amount.value` は `positive()`。`Stock.create` が 0 以下を弾く不変条件と一致させ、契約段階で落とす。

### エンドポイント

| メソッド | パス                               | 変更                                                                    |
| -------- | ---------------------------------- | ----------------------------------------------------------------------- |
| POST     | `/api/shopping-lists/:id/complete` | `zValidator('json', completeShoppingSchema)` を追加（**ボディ必須化**） |

| #   | 判断                                              | 理由                                                                                                                                                                  |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | `stockAdditions` は必須フィールド（空配列は許可） | optional にすると「送っていない」と「空」が曖昧になる。呼び出し元は 1 箇所なので同時変更で足りる                                                                      |
| D-2 | 完了と在庫追加を 1 エンドポイントにまとめる       | `POST /pantry/stocks` を N 回叩く案は、部分失敗時にリストだけ未完了・在庫だけ追加という状態を作りやすい。`sourceShoppingItemId` 由来の冪等ガードも UseCase 側に置ける |
| D-3 | レスポンスは現行どおり `ShoppingListDto`          | 追加件数はクライアントが送信数から表示できる。Pantry の全量を返すのは責務過剰                                                                                         |

### 応答

| ステータス | 条件                                              |
| ---------- | ------------------------------------------------- |
| 200        | 完了成功（在庫追加 0 件を含む）                   |
| 400        | ボディがスキーマ不適合（zValidator）              |
| 404        | リストが存在しない／`itemId` がリストに存在しない |
| 422        | `itemId` が bought でない品目を指している         |

## DB 設計

**変更なし。マイグレーション不要。**

- `stocks.source_shopping_item_id`（`text().unique()`）は 7/24 の削除時に vestigial として残置してあり、
  そのまま「1 買い物品目 : 最大 1 Stock」の DB 側ガードとして再利用する。
- `DrizzlePantryRepository` の往復（`sourceShoppingItemId` の保存・復元）は既存実装のまま使える。

## フロントエンド設計

### 新規: `apps/web/src/app/shopping-lists/_components/complete-shopping-panel.tsx`

`'use client'` の展開パネル。`add-stock-form.tsx` / `add-item-form.tsx` と同型のスタイルにする。

- Props: `items: ShoppingItemDto[]`（bought のみ）、`submitting: boolean`、
  `onCancel: () => void`、`onComplete: (additions: StockAdditionInput[]) => void`
- 行ごとの状態: `checked` / `amountText` / `storedLocation`
- 数量入力は既存の `QuantityField` ＋ `parseQuantity`（全角・単位付き入力を吸収する既存実装）を再利用。
- 保存場所は既存の `SelectField` ＋ `LOCATION_SELECT_OPTIONS` 相当を再利用（`pantry/_utils/pantry-view` の
  `LOCATION_LABELS` を import する。Presentation 内の参照なので層の問題なし）。
- 「すべて選択 / すべて解除」の一括切替を置く（品目数が多いときの操作コスト対策・R-2 リスク）。
- 数量が未入力または 0 以下の行はチェックできない（`disabled`）。理由を行内に小さく出す。
- 「完了する」押下時、`checked` かつ数量が有効な行だけを `stockAdditions` に載せる。

### 変更: `shopping-list-client.tsx`

- `completePanelOpen` state を追加。「買い物完了」ボタンは `setCompletePanelOpen(true)` に変える。
- `handleComplete(additions)` が `json: { stockAdditions: additions }` を送る。
- 成功時、既存の完了バナーに「N 件を在庫に追加しました」を足す（0 件なら出さない）。
  既存の「在庫を見る」リンクはそのまま。
- bought 品目が 0 件のときはパネルを挟まず即 POST（`stockAdditions: []`）。選ぶものが無いため。

## バックエンド設計

### `packages/domain/src/pantry/pantry.ts`

`972f279` で削除された判定メソッドを、当時と同じ実装で復活させる（新規設計ではなく削除の巻き戻し）。

```ts
/** 買い物完了の再実行時、同一 ShoppingItem 由来の Stock 追加をスキップする判定に使う（S-3）。 */
hasStockFromShoppingItem(itemId: ShoppingItemId): boolean {
  return this.pantryStocks.some(
    (stock) => stock.sourceShoppingItemId !== null && stock.sourceShoppingItemId.equals(itemId),
  );
}
```

| #   | 判断                                                                       | 理由                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-7 | 判定は Domain のメソッドとして持たせる（UseCase で `stocks` を走査しない） | 「この買い物品目は既に在庫化済みか」は集約の不変条件に関わる問い。`pantry-core.md` S-3 の設計どおりで、CLAUDE.md の「ドメインロジックを UseCase に書かない」にも従う |

### `packages/application/src/shopping-list/shopping-list.dto.ts`

```ts
export interface StockAdditionInputDto {
  itemId: string;
  amount: { value: number; unit: Unit };
  storedLocation: StorageLocation | null;
  /** "2026-07-25" 形式のローカル日付（ISO datetime ではない）。 */
  expiresAt: string | null;
}

export interface CompleteShoppingInputDto {
  shoppingListId: string;
  stockAdditions: StockAdditionInputDto[];
}
```

### `packages/application/src/shopping-list/complete-shopping.use-case.ts`

- コンストラクタを 4 引数に戻す: `shoppingListRepository, pantryRepository, productRepository, mealPlanRepository`。
- `execute` の手順:
  1. `findById` → null なら `ShoppingListNotFoundError`
  2. `status === 'completed'` → `repairMealPlanTransition` のみ実行して早期リターン
     （**`stockAdditions` は無視する**。完了済みリストへの追加操作は受け付けない）
  3. `boughtItems` を抽出
  4. `resolveStockAdditions(shoppingList, input.stockAdditions)` — 検証と品目解決
  5. `addStocks(pantry, resolved, now)` → `pantryRepository.save(pantry)`
  6. `recordPrices(boughtItems, now)`（**現行のまま変更しない**）
  7. `shoppingList.complete()` → `save`
  8. `repairMealPlanTransition`
- `resolveStockAdditions`:
  - リストに存在しない `itemId` → `ShoppingItemNotFoundError`（404）
  - `isBought()` でない品目 → `InvalidShoppingListStateError`（422）
  - 同一 `itemId` の重複指定 → 最初の 1 件のみ採用（後述 D-4）
- `addStocks`:
  - `pantry.hasStockFromShoppingItem(item.id)` が true ならスキップ（reopen→再完了の二重追加防止・R-4）
  - `CreateStockInput` は
    `{ productId: item.productId, displayName: item.displayName, amount: Quantity.of(...),
purchasedAt: now, expiresAt, storedLocation, sourceShoppingItemId: item.id }`
  - `expiresAt` は `AddStockUseCase` と同じく `new Date(\`${expiresAt}T00:00:00\`)`でローカル 0 時に構築し、
mapper の`toLocalDateString` と往復整合させる。
  - `Stock.create` が投げる素の `Error` は `InvalidStockOperationError` に包む（`AddStockUseCase` と同じ扱い）。

| #   | 判断                                                  | 理由                                                                                      |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| D-4 | 重複 `itemId` はエラーにせず先勝ちで 1 件だけ採用     | DB の UNIQUE 制約に当てて 500 にするより穏当。UI 上は重複を作れないため防御的措置         |
| D-5 | 完了済みリストへの再 POST は `stockAdditions` を無視  | 早期リターンの既存仕様（D-3・7/24）を維持。追加したい場合は reopen → 再完了の導線がある   |
| D-6 | 価格記録の対象は `boughtItems` 全件（在庫選択と独立） | 在庫化しない購入品でも価格は記録したい。7/24 で分離した冪等マーカーがそれを可能にしている |

## エラー処理

外部 I/O は自前 DB（PostgreSQL / PGlite）のみ。外部 API 呼び出しはない。

- **(a) リトライ**: なし。DB エラーは 500 として返し、クライアントが再送する（既存方針を踏襲）。
- **(b) タイムアウト**: DB クライアント設定に従う。本変更で追加の設定はしない。
- **(c) 冪等性**: 在庫は `sourceShoppingItemId` の事前スキップ（Application）＋ DB UNIQUE（二段目）。
  価格は決定的 `PriceRecordId`＋`priceHistory` 存在チェック。完了済みリストは早期リターン。
- **(d) 部分失敗**: 4 集約またぎのため単一トランザクションにはしない（現行と同じ制約）。
  Pantry save 済み・ShoppingList save 前に落ちた場合、リストは active のまま在庫だけ入る。
  再実行時は `hasStockFromShoppingItem` が true になりスキップされるため、**前方回復で整合する**
  （在庫が二重にならない）。補償トランザクションは実装しない。
- **(e) フォールバック**: DB 不通時は 500 →クライアントはエラーバナーを出し、選択パネルは開いたままにする
  （入力を失わず再送できる）。

## ログと監視

対象外。現行同様、ハンドルされない例外は `app.onError` の `console.error` に落ちる。専用のメトリクスは追加しない。

## セキュリティ

MVP1 は認証なし（ADR-0003）のため権限制御は対象外。入力は `completeShoppingSchema` で境界検証する。
`itemId` は「そのリストに属する bought 品目か」を UseCase で検証しており、他リストの品目 ID を
渡して在庫を作ることはできない。

## 性能

- 品目数は 1 リストあたり数十件想定。`pantryRepository.find()` 1 回 ＋ `save()` 1 回で、追加の N+1 は発生しない。
- 価格記録の Product 取得は現行の並列化（`Promise.all`）をそのまま維持する。
- 選択パネルの描画はサーバー往復なし（手元の `items` から構成）。

## テスト方針

| 対象                                                        | 観点                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain` `pantry.test.ts`                          | `hasStockFromShoppingItem`: 同一品目由来の Stock がある / ない / `sourceShoppingItemId` が null の Stock のみ（`972f279` で消えた 3 件を復活）                                                                                                                                           |
| `packages/api-contract` `shopping-list.schema.test.ts`      | `completeShoppingSchema` の parse: 空配列 OK / `amount.value` 0・負数を reject / `expiresAt` の日付形式 / 未知フィールド                                                                                                                                                                 |
| `packages/application` `complete-shopping.use-case.test.ts` | 選択品目のみ Stock 化される / 空配列で在庫追加なし / `sourceShoppingItemId` が設定される / 不明 `itemId` で 404 / pending 品目指定で 422 / **reopen→再完了で二重追加なし** / 完了済み早期リターンで `stockAdditions` を無視 / 価格記録は在庫選択と独立に bought 全件（既存ケースの回帰） |
| `apps/web` `shopping-lists.complete.test.ts`                | ボディ必須化に伴う更新。空配列で 200 / スキーマ不適合で 400 / UseCase へ渡る引数                                                                                                                                                                                                         |
| `apps/web` `shopping-list-client.complete.test.tsx`         | 「買い物完了」でパネルが開く（即 POST しない）/ 既定のチェック状態 / 数量プリフィル / 数量なし品目が選択不可 / 一括切替 / 送信ボディの中身 / 完了バナーの件数表示 / bought 0 件なら即 POST                                                                                               |
| `packages/infrastructure`                                   | 変更なし（`sourceShoppingItemId` の往復は既存テストで担保済み）                                                                                                                                                                                                                          |

## 移行とリリース

- DB マイグレーションなし。既存データへの影響なし。
- API のボディ必須化は破壊的変更だが、呼び出し元は `shopping-list-client.tsx` の 1 箇所のみで、
  同一デプロイ単位（`apps/web`）に含まれるため段階リリースは不要。
- 7/24 以降 7/25 までに完了した買い物リストの品目は在庫化されていない。遡及処理はしない
  （在庫画面から手動追加、または reopen → 再完了で対応可能）。

## リスク

| #   | リスク                                                     | 対策                                                                       |
| --- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| R-1 | 完了までのタップ数が増え、買い物完了が面倒になる           | 既定で全選択・数量プリフィル済みにし、「完了する」1 タップで済むようにする |
| R-2 | 品目が多いとパネルが縦に長い                               | 一括チェック切替を用意。行は 1 行構成に圧縮する                            |
| R-3 | 「適量」等（`amountNote`）の品目が在庫化できない           | 数量を手入力すれば追加できる。行内に理由を表示する                         |
| R-4 | 部分失敗でリスト未完了・在庫のみ追加の状態が残る           | 再実行で前方回復（§エラー処理 d）。ユーザー操作は「もう一度完了する」だけ  |
| R-5 | `pantryRepository` 依存の復活で 7/24 の設計意図と食い違う  | 本設計書で上書きし、`remove-shopping-stock-add.md` に追記リンクを張る      |
| R-6 | 7/24 の設計書の「残置」記述が実態とずれていた（§現状構成） | 本設計書に実測表を残す。実装計画の「前提の確認」を着手前に必ず通す         |

## 未決事項

**なし**（Q-1〜Q-3 はユーザー確定・2026-07-25。以下は確定内容として実装する）。

| #   | 論点                                            | 確定                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-1 | 賞味期限を品目ごとに入力できるようにするか      | **パネルには出さない**（クライアントは `expiresAt: null` を送る）。契約・DTO・UseCase は `expiresAt` を受け取れる形にしておき、UI だけ後日足せるようにする。理由: 買い物直後に全品目の期限を入れるのは負荷が高く、パネルも縦に長くなる |
| Q-2 | パネルの既定のチェック状態                      | **全品目 ON**（数量が有効な行のみ）。買った物はたいてい在庫になるため、既定 ON のほうがタップ数が少ない                                                                                                                                |
| Q-3 | `amountNote` のみの品目（「適量」等）の既定数量 | **空のまま・選択不可**。削除前の実装は一律「1 個」で代替していたが、単位の異なる品目に 1 個を当てると在庫引き算が噛み合わない                                                                                                          |

### 申し送り（本タスク対象外の将来課題）

- Stock の編集機能が無いため、Q-1 の決定により在庫の賞味期限は当面すべて `null` になる。
  期限管理を使いたくなった時点で「Stock 編集」または「完了パネルへの期限入力」のどちらかを足す。
