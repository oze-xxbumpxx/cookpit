# 試験計画: shopping-complete-stock-selection（買い物完了時に在庫へ追加する品目を選ぶ）

- 対象設計書: `docs/designs/shopping-complete-stock-selection.md`（確定・L2）
- 実装計画: `docs/implementation-plans/shopping-complete-stock-selection.md`
- テストランナー: Vitest
- 完了条件: 下記ケースがすべて実装され `pnpm test` が緑。既存テストの改変は
  「ボディ必須化に伴う呼び出し形の更新」に限る（アサーションの緩和はしない）。

## 対象層と観点の割り当て

| 層                 | 主な観点                                                   |
| ------------------ | ---------------------------------------------------------- |
| Domain             | 集約の判定ロジック（`hasStockFromShoppingItem`）           |
| api-contract       | 契約の境界値（正常・異常・型）                             |
| Application        | ユースケースの正常系・異常系・冪等性・回帰（価格記録）     |
| Web ルート         | HTTP 境界のステータスコードと UseCase への引き渡し         |
| Web コンポーネント | 画面の状態遷移・送信内容・入力不能条件                     |
| Infrastructure     | 変更なし（既存の `sourceShoppingItemId` 往復テストで担保） |

---

## Domain（`packages/domain/src/pantry/pantry.test.ts`）

`972f279` で削除された 3 件を復活させる。

| #   | 種別 | ケース                                       | 期待    |
| --- | ---- | -------------------------------------------- | ------- |
| D-1 | 正常 | 同一 `ShoppingItemId` 由来の Stock がある    | `true`  |
| D-2 | 正常 | 別の `ShoppingItemId` 由来の Stock しかない  | `false` |
| D-3 | 境界 | `sourceShoppingItemId` が null の Stock のみ | `false` |

## api-contract（`packages/api-contract/src/shopping-list.schema.test.ts`）

| #   | 種別 | ケース                                                         | 期待                 |
| --- | ---- | -------------------------------------------------------------- | -------------------- |
| C-1 | 正常 | `stockAdditions: []`                                           | parse 成功           |
| C-2 | 正常 | 1 件（`storedLocation: 'fridge'` / `expiresAt: '2026-07-25'`） | parse 成功           |
| C-3 | 正常 | `storedLocation: null` / `expiresAt: null`                     | parse 成功           |
| C-4 | 境界 | `amount.value: 0`                                              | reject（`positive`） |
| C-5 | 境界 | `amount.value: -1`                                             | reject               |
| C-6 | 異常 | `itemId` が非 UUID                                             | reject               |
| C-7 | 異常 | `storedLocation: 'shelf'`（未知の値）                          | reject               |
| C-8 | 異常 | `expiresAt: '2026/07/25'`（形式違い）                          | reject               |
| C-9 | 異常 | `stockAdditions` 欠落                                          | reject（必須・D-1）  |

## Application（`packages/application/src/shopping-list/complete-shopping.use-case.test.ts`）

### 正常系

| #   | ケース                                           | 期待                                                                                                                        |
| --- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| A-1 | bought 3 件のうち 2 件を `stockAdditions` に指定 | Pantry に 2 件だけ Stock が追加され、`pantryRepository.save` が 1 回呼ばれる                                                |
| A-2 | `stockAdditions: []`                             | Stock は追加されない。リストは completed になる                                                                             |
| A-3 | 追加された Stock の中身                          | `displayName` / `productId` は買い物品目由来、`amount` は入力値、`sourceShoppingItemId` は品目 ID、`purchasedAt` は実行時刻 |
| A-4 | `storedLocation` / `expiresAt` を指定            | Stock に反映される。`expiresAt` はローカル 0 時（`toLocalDateString` と往復整合）                                           |
| A-5 | 保存順序                                         | Pantry → Product → ShoppingList → MealPlan の順に `save` が呼ばれる                                                         |

### 異常系

| #   | ケース                      | 期待                                                                   |
| --- | --------------------------- | ---------------------------------------------------------------------- |
| A-6 | リストに存在しない `itemId` | `ShoppingItemNotFoundError`。**Pantry も ShoppingList も保存されない** |
| A-7 | pending 品目の `itemId`     | `InvalidShoppingListStateError`。同上                                  |
| A-8 | skipped 品目の `itemId`     | `InvalidShoppingListStateError`                                        |
| A-9 | 存在しない `shoppingListId` | `ShoppingListNotFoundError`（既存ケースの回帰）                        |

### 冪等性

| #    | ケース                                                   | 期待                                                                                       |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A-10 | **reopen → 買い足し → 再完了**で同じ品目を再指定         | 既に `sourceShoppingItemId` を持つ Stock がある品目はスキップされ、二重追加されない（R-4） |
| A-11 | 既に completed のリストに `stockAdditions` 付きで再 POST | 早期リターン。Stock は追加されず、MealPlan 修復のみ行われる（D-5）                         |
| A-12 | 同一 `itemId` を 2 回含む `stockAdditions`               | 先勝ちで 1 件だけ追加（D-4）                                                               |

### 回帰（価格記録・献立遷移 — 既存テストを 1 件も変更せず通す）

| #    | ケース                                                                      | 期待                                             |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------------ |
| A-13 | 在庫に選ばなかった bought 品目                                              | **価格は記録される**（在庫選択と独立・D-6）      |
| A-14 | reopen → 再完了                                                             | 価格が二重記録されない（決定的 `PriceRecordId`） |
| A-15 | `productId` null / 価格 0 / 数量 null・0 / `unitPrice` 0 / Product 削除済み | 価格記録がスキップされる                         |
| A-16 | MealPlan が draft / shopping / cooking                                      | それぞれ正しく遷移・修復される                   |
| A-17 | bought 0 件                                                                 | 完了できる                                       |

## Web ルート（`apps/web/src/server/routes/shopping-lists.complete.test.ts`）

| #   | ケース                                     | 期待                                                               |
| --- | ------------------------------------------ | ------------------------------------------------------------------ |
| H-1 | `{ stockAdditions: [] }`                   | 200 ＋ `ShoppingListDto`。`execute` に `stockAdditions: []` が渡る |
| H-2 | `{ stockAdditions: [1 件] }`               | 200。`execute` の引数に該当要素が渡る                              |
| H-3 | ボディなし                                 | 400                                                                |
| H-4 | `amount.value: 0`                          | 400（zValidator）                                                  |
| H-5 | UseCase が `ShoppingListNotFoundError`     | 404                                                                |
| H-6 | UseCase が `ShoppingItemNotFoundError`     | 404                                                                |
| H-7 | UseCase が `InvalidShoppingListStateError` | 422                                                                |

## Web コンポーネント（`apps/web/src/app/shopping-lists/_components/`）

### `shopping-list-client.complete.test.tsx`

| #   | ケース                                 | 期待                                                                          |
| --- | -------------------------------------- | ----------------------------------------------------------------------------- |
| W-1 | bought 品目ありで「買い物完了」を押す  | **パネルが開くだけで POST しない**                                            |
| W-2 | bought 品目 0 件で「買い物完了」を押す | パネルを挟まず `{ stockAdditions: [] }` で POST                               |
| W-3 | パネルで「完了する」                   | 選択行のみを含むボディで POST。`expiresAt` は全件 `null`（Q-1）               |
| W-4 | 完了成功                               | ステータスが completed になり、完了バナーに「N 件を在庫に追加しました」が出る |
| W-5 | 在庫追加 0 件で完了                    | 件数表示は出ない。完了バナーと「在庫を見る」は出る                            |
| W-6 | 完了が 422 で失敗                      | エラーバナーが出て、**パネルは開いたまま**（再送可能）                        |
| W-7 | パネルの「キャンセル」                 | パネルが閉じ、POST されない                                                   |

### `complete-shopping-panel.test.tsx`（新規）

| #   | ケース                        | 期待                                                         |
| --- | ----------------------------- | ------------------------------------------------------------ |
| P-1 | `requiredAmount` を持つ品目   | 数量がプリフィルされ、チェックが既定 ON（Q-2）               |
| P-2 | `amountNote` のみの品目       | 数量は空・チェック OFF・チェックボックスが `disabled`（Q-3） |
| P-3 | P-2 の行に数量を入力          | チェック可能になる                                           |
| P-4 | 数量を `0` に変更             | その行がチェック不可になる                                   |
| P-5 | 「すべて解除」→「すべて選択」 | 数量が有効な行だけが ON になる（P-2 の行は ON にならない）   |
| P-6 | 数量を編集して「完了する」    | 編集後の値が `onComplete` に渡る                             |
| P-7 | 保存場所を選んで「完了する」  | 選んだ `storedLocation` が渡る。未選択なら `null`            |
| P-8 | 全解除で「完了する」          | 空配列で `onComplete` が呼ばれる（買い物は完了できる・R-3）  |
| P-9 | `submitting: true`            | ボタンが `disabled`                                          |

## Infrastructure

**変更なし**。`DrizzlePantryRepository` の `sourceShoppingItemId` 保存・復元は
`drizzle-pantry.repository.test.ts` の既存ケースで担保済み。本タスクで新規ケースは追加しない。

## 手動確認（manual-browser-verify）

1. 買い物リストで数品目をチェック（購入済みに）してから「買い物完了」を押す → パネルが開く。
2. 1 件のチェックを外し、1 件の数量を編集して「完了する」。
3. 完了バナーに件数が出る → 「在庫を見る」で在庫タブへ。**選んだ品目だけ**が、編集後の数量で並んでいる。
4. 「買い物を再開」→ 再度「買い物完了」（同じ品目を選択）→ 在庫が**二重にならない**（R-4）。
5. 「適量」の品目がある場合、チェックできないこと・数量入力後にチェックできることを確認。

## 回帰範囲

- 買い物リスト詳細画面の既存操作（チェック・購入確定・店舗変更・手動追加・献立同期・買い物再開）。
- 献立の cooking 遷移。
- 買い物リスト生成時の在庫引き算（在庫が増えるようになったため、生成結果が変わり得る点に注意）。
- 在庫画面の手動追加・消費・破棄。
