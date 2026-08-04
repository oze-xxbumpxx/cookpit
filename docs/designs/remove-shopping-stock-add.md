# 設計書: remove-shopping-stock-add（買い物完了時の在庫加算を削除）

> **⚠️ この設計は 2026-07-25 に上書きされた。**
> 在庫加算を全廃した結果「買い物完了後に在庫タブへ何も出てこない」UX 断絶が確認されたため、
> **完了時に在庫化する品目を選ぶ**方式へ再設計した。現行の正典は
> [shopping-complete-stock-selection.md](./shopping-complete-stock-selection.md)。
> 本書は経緯と、価格記録の冪等性を「決定的 `PriceRecordId`」へ移した理由（D-1）の出典として残す。
> なお本書 D-5 の「`Pantry.hasStockFromShoppingItem` は残置」は実態と異なっていた
> （同日 `972f279` で死コードとして削除された）。詳細は上書き先の §現状構成を参照。

- ステータス: superseded（2026-07-25。当初は確定・ユーザー確定 2026-07-24「在庫加算のみ削除」）
- レベル: L2
- 関連: `docs/designs/pantry-shopping-integration.md` / `pantry-core.md`（S-3 冪等設計の正典）、
  `docs/designs/pantry-manual-add.md`（項目5・手動追加＝在庫を増やす代替導線）、
  改善要望 項目6（`logs/2026-07-23.md` セッション2）
- 依存: 項目5（在庫の手動追加）完了済み。手動追加が在庫を増やす手段になったことが前提。

---

## 背景・目的

現状、買い物完了（`CompleteShoppingUseCase`）は bought 品目を Pantry に自動追加していた
（`addStocks`）。ユーザーは在庫を手動（項目5）で管理したいため、この**自動在庫加算のみを削除**する。
価格記録・献立の cooking 遷移・リスト生成時の在庫引き算は維持する（ユーザー確定・2026-07-24）。

## 設計上の要点（冪等性の再設計）

現行は `pantry.hasStockFromShoppingItem(item.id)` を「その品目が前回完了で処理済みか」の唯一の
マーカーとし、**在庫加算と価格記録の両方**の二重実行（reopen→買い足し→再完了）を防いでいた（S-3）。
在庫加算を消すとこのマーカーが失われ、価格記録が二重に走る恐れがある。

**再設計（D-1）**: 価格レコード ID を買い物品目 ID から**決定的に導出**する
（`PriceRecordId.fromString(item.id.value)`）。価格記録前に、対象 Product の `priceHistory` に同 ID が
既に存在すれば**スキップ**する。これにより reopen→再完了でも二重記録しない（スキーマ変更不要・
ドメイン変更不要）。1 買い物品目 = 最大 1 価格レコードの 1:1 対応なので ID 衝突は起きない。

## 設計判断

| #   | 判断                                                                                   | 理由                                                                                                |
| --- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| D-1 | 価格記録の冪等性は「決定的 ID（= 品目 ID）＋ 既存スキップ」で担保                      | 在庫ベースのマーカー喪失を補う。スキーマ/ドメイン変更なし。既存挙動（処理済みは再記録しない）と一致 |
| D-2 | `CompleteShoppingUseCase` から `pantryRepository` 依存を除去                           | `addStocks`/`hasStockFromShoppingItem` を使わなくなるため。コンストラクタ引数を 4→3 に変更          |
| D-3 | `if (status==='completed') return`（早期リターン）は維持                               | 完了済みリストの再処理防止・MealPlan 修復は従来どおり                                               |
| D-4 | 在庫引き算（`GenerateShoppingListUseCase.applyPantryDeduction`）は変更しない           | ユーザー確定「在庫加算のみ削除」。手動在庫に対する引き算は引き続き有効                              |
| D-5 | `Stock.sourceShoppingItemId` 列・`Pantry.hasStockFromShoppingItem` は残置（vestigial） | 削除は破壊的スキーマ変更になるため本タスク対象外。将来クリーンアップ候補                            |

## 変更内容

### `packages/application/src/shopping-list/complete-shopping.use-case.ts`

- コンストラクタから `pantryRepository` を除去（`shoppingListRepository, productRepository, mealPlanRepository`）。
- `addStocks` / `toAddStockInput` を削除。`Pantry`/`CreateStockInput`/`Quantity` の import を整理。
- `execute`: `boughtItems` を求め、`recordPrices(boughtItems, now)` を呼ぶ（pantry 取得・在庫保存を削除）。
  保存順序は Product → ShoppingList → MealPlan。
- `recordPrices`: 各 bought 品目について `priceRecordId = PriceRecordId.fromString(item.id.value)`。
  対象 Product の `priceHistory` に同 ID があればスキップ、無ければ `buildPriceRecord(item, priceRecordId, now)`
  を記録。1 件でも記録した Product のみ save。
- `buildPriceRecord`: 受け取った `priceRecordId` で `PriceRecord.create` する（`generate()` をやめる）。

### `apps/web/src/server/routes/shopping-lists.ts`

- `POST /:id/complete` の `new CompleteShoppingUseCase(...)` から `pantryRepository()` 引数を除去。

## 対象外

- 在庫引き算（生成時）の削除（D-4）。
- `source_shopping_item_id` 列・`hasStockFromShoppingItem` の物理削除（D-5・将来課題）。
- 価格記録・MealPlan 遷移の挙動変更。

## テスト方針

- `complete-shopping.use-case.test.ts` を全面更新: 在庫加算の検証を削除。価格記録が bought 品目に対して
  行われること／`productId` null・価格 0・数量 null/0・unitPrice 0・Product 削除済みでスキップされること／
  **reopen→再完了で価格が二重記録されないこと（決定的 ID）**／完了済み早期リターン／MealPlan 修復／
  bought 0 件でも完了。pantry リポジトリ依存の除去に伴いフェイクとコンストラクタ呼び出しを修正。
- ルートテスト（`shopping-lists.test.ts`）は UseCase をモックしており挙動非依存（変更不要の見込み）。

## リスク

| #   | リスク                                   | 対策                                                                        |
| --- | ---------------------------------------- | --------------------------------------------------------------------------- |
| R-1 | 価格二重記録の回帰                       | 決定的 ID ＋ priceHistory 存在チェックで冪等化。reopen→再完了のテストを追加 |
| R-2 | 在庫が増えなくなり UX 断絶               | 項目5（手動追加）が代替導線。完了済み前提                                   |
| R-3 | vestigial な sourceShoppingItemId の混乱 | 設計書に残置理由を明記。将来クリーンアップ候補として申し送り                |
