# 実装計画: shopping-complete-stock-selection（買い物完了時に在庫へ追加する品目を選ぶ）

- 対象設計書: `docs/designs/shopping-complete-stock-selection.md`（確定・L2）
- 試験計画: `docs/tests/shopping-complete-stock-selection.md`
- ブランチ: `claude/shopping-list-inventory-sync-wpada4`
- 完了条件: `pnpm lint` / `pnpm type-check` / `pnpm test` 全 PASS、実画面確認 PASS、スコープ外変更なし。

## 前提の確認（実施済み・2026-07-25）

7/24 の設計時に「前提が 1 件外れた」事象（`logs/2026-07-25.md` 気づき）を踏まえ、着手前に実測した。

- [x] `stocks.source_shopping_item_id` 列が現行スキーマに存在し UNIQUE であること → **OK**
- [x] `DrizzlePantryRepository` が `sourceShoppingItemId` を保存・復元していること → **OK**
- [x] `POST /:id/complete` の呼び出し元が `shopping-list-client.tsx` の 1 箇所のみであること → **OK**
- [ ] `Pantry.hasStockFromShoppingItem()` が現存すること → **NG。`972f279`（7/24）で削除済み**

**外れた 1 件の対応**: 列・フィールド・リポジトリ往復は無傷で、消えていたのは Domain のメソッド 7 行と
単体テスト 3 件のみ。DB マイグレーションは不要のままなので、設計書 §バックエンド設計に Step 0 として
「メソッドの復活」を追加し（D-7）、対象範囲に `packages/domain` を足して続行する。
確定済みの UX 判断（Q-1〜Q-3）・API 形状には影響しない。

## 実装順（下位レイヤーから）

### Step 0. Domain（`972f279` の巻き戻し）

- ファイル: `packages/domain/src/pantry/pantry.ts`
- `Pantry.hasStockFromShoppingItem(itemId: ShoppingItemId): boolean` を `discardStock` の直後に復活。
  実装は `972f279` の削除分と同一（`git show 972f279 -- packages/domain/src/pantry/pantry.ts` を参照）。
- `ShoppingItemId` は既に `import type` 済みか確認する（`Stock` が使っているため存在する見込み）。
- テスト: `packages/domain/src/pantry/pantry.test.ts` に `972f279` で消えた 3 件を復活。
- 完了条件: `pnpm --filter @cookpit/domain test` 緑。

### Step 1. api-contract

- ファイル: `packages/api-contract/src/shopping-list.schema.ts`
- 追加: `stockAdditionSchema` / `completeShoppingSchema` と型 `StockAdditionBody` / `CompleteShoppingBody`。
  `storageLocationSchema` を `./pantry.schema` から import する。
- テスト: `shopping-list.schema.test.ts` に parse 成功/失敗（空配列 OK・`amount.value` 0/負数を reject・
  `itemId` 非 UUID を reject・`expiresAt` の日付形式・`storedLocation` の不正値）。
- 完了条件: `pnpm --filter @cookpit/api-contract test` 緑。

### Step 2. Application（DTO）

- ファイル: `packages/application/src/shopping-list/shopping-list.dto.ts`
- 追加: `StockAdditionInputDto`（`itemId` / `amount` / `storedLocation` / `expiresAt`）。
  `StorageLocation` 型は `../pantry/pantry.dto` から import（同一パッケージ内）。
- 変更: `CompleteShoppingInputDto` に `stockAdditions: StockAdditionInputDto[]` を追加（必須）。
- JSDoc: `expiresAt` の形式（`"2026-07-25"` 形式のローカル日付）を記す。

### Step 3. Application（UseCase）

- ファイル: `packages/application/src/shopping-list/complete-shopping.use-case.ts`
- コンストラクタを 4 引数に戻す:
  `shoppingListRepository, pantryRepository, productRepository, mealPlanRepository`。
- `execute` を設計書 §バックエンド設計の手順 1〜8 のとおりに変更。保存順序は
  **Pantry → Product → ShoppingList → MealPlan**。
- 新規 private メソッド:
  - `resolveStockAdditions(shoppingList, additions)`: 不明 `itemId` → `ShoppingItemNotFoundError`、
    bought でない → `InvalidShoppingListStateError`、重複 `itemId` は先勝ちで 1 件（D-4）。
    戻り値は `{ item: ShoppingItem; addition: StockAdditionInputDto }[]`。
  - `addStocks(pantry, resolved, now)`: `pantry.hasStockFromShoppingItem(item.id)` が true ならスキップ。
    `Stock.create` の素の `Error` は `InvalidStockOperationError` に包む。
- `recordPrices` / `buildPriceRecord` / `repairMealPlanTransition` は**変更しない**（D-6 の回帰を避ける）。
- クラス JSDoc を更新（在庫追加が選択制であること・冪等の二段ガード・保存順序）。
- テスト: `complete-shopping.use-case.test.ts` を拡張（試験計画 §Application 参照）。
  既存フェイクに `pantryRepository` を復活させる（`test-helpers.ts` に既存の fake がある想定。
  無ければ `pantry-use-cases.test.ts` の fake に倣う）。
- 完了条件: `pnpm --filter @cookpit/application test` 緑。

### Step 4. Hono ルート

- ファイル: `apps/web/src/server/routes/shopping-lists.ts`
- `POST /:id/complete` に `zValidator('json', completeShoppingSchema)` を追加し、
  `new CompleteShoppingUseCase(shoppingListRepository(), pantryRepository(), productRepository(), mealPlanRepository())`
  に戻す。`execute({ shoppingListId: id, stockAdditions: body.stockAdditions })`。
- import に `completeShoppingSchema` と `pantryRepository` を追加。
- テスト: `apps/web/src/server/routes/shopping-lists.complete.test.ts` をボディ必須化に合わせて更新
  （試験計画 §ルート参照）。
- 完了条件: `pnpm --filter @cookpit/web test -- shopping-lists.complete` 緑。

### Step 5. Presentation UI（パネル）

- 新規: `apps/web/src/app/shopping-lists/_components/complete-shopping-panel.tsx`
  - 雛形は `add-stock-form.tsx`。`QuantityField` / `parseQuantity` / `SelectField` を再利用。
  - 保存場所の選択肢は `pantry/_utils/pantry-view` の `LOCATION_LABELS` と
    `api-contract` の `storageLocationSchema.options` から組む（`add-stock-form.tsx` と同じ構成）。
    **重複が 3 箇所目になるため、`LOCATION_SELECT_OPTIONS` は `pantry/_utils/pantry-view.ts` へ移して
    両方から import する**（スコープ内の最小限の共通化）。
  - 行の state は `Map<itemId, { checked, amountText, storedLocation }>` ではなく
    `Record<string, RowState>` の単一 `useState` にする（`useApiAction` 導入後の既存スタイルに合わせる）。
  - 初期値: `requiredAmount` があれば `${value}${unit}` をプリフィルし `checked: true`、
    無ければ空文字・`checked: false`（Q-2 / Q-3）。
  - 数量が `parseQuantity` で `kind === 'amount'` かつ `value > 0` の行のみチェック可能。
    不可の行はチェックボックスを `disabled` にし、行内に理由を表示。
  - 「すべて選択 / すべて解除」トグル、「キャンセル」「完了する」ボタン。
  - 賞味期限の入力は**置かない**（Q-1）。送信時は `expiresAt: null` 固定。
- 完了条件: `pnpm --filter @cookpit/web type-check` 緑。

### Step 6. Presentation UI（クライアント結線）

- ファイル: `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`
- `completePanelOpen` state を追加。「買い物完了」ボタンは `setCompletePanelOpen(true)`。
  ただし bought 品目が 0 件なら即 `handleComplete([])`（設計書 §フロントエンド設計）。
- `handleComplete(additions: StockAdditionInput[])` が
  `json: { stockAdditions: additions }` を送る。成功時に `setCompletePanelOpen(false)` と
  `setAddedStockCount(additions.length)`。
- 完了バナーに「N 件を在庫に追加しました」を追加（0 件なら出さない）。「在庫を見る」リンクは現状維持。
- 失敗時はパネルを開いたまま（入力を失わない・§エラー処理 e）。
- テスト: `shopping-list-client.complete.test.tsx` を更新（試験計画 §Web コンポーネント参照）。
  api-client モックの `complete.$post` が `json` を受け取る形になる点に注意。
- 完了条件: `pnpm --filter @cookpit/web test` 緑。

### Step 7. ドキュメント・仕上げ

- `docs/designs/remove-shopping-stock-add.md` の冒頭に「本設計は
  `shopping-complete-stock-selection.md`（2026-07-25）で上書きされた」旨の追記（R-5 対策）。
- `docs/04-domain-model.md` の Pantry セクションに、Stock の生成経路が
  「手動追加（`sourceShoppingItemId: null`）／買い物完了時の選択追加（`sourceShoppingItemId` 設定）」の
  2 系統であることを追記（全面同期はしない）。
- 品質ゲート全実行 → 実画面確認（manual-browser-verify）→ 作業ログ追記 → コミット → プッシュ。

## 依存関係

Step 1 → 2 → 3 → 4 → 5 → 6 は順序どおり。Step 5 は Step 4 と独立に着手できるが、
Step 6 は 4・5 の両方に依存する。Step 7 は全 Step 完了後。

## コミット分割

| #   | 範囲      | 想定メッセージ                                                              |
| --- | --------- | --------------------------------------------------------------------------- |
| 1   | Step 0〜3 | `feat(shopping-list): 買い物完了で在庫に追加する品目を受け取れるようにする` |
| 2   | Step 4〜6 | `feat(web): 買い物完了時に在庫へ追加する品目を選べるようにする`             |
| 3   | Step 7    | `docs: shopping-complete-stock-selection の設計・実装計画・試験計画を追加`  |

## リスクとロールバック

- **ロールバック単位**: DB マイグレーションが無いため、コミットの revert のみで完全に戻せる。
  在庫として追加済みの Stock は残るが、在庫画面から破棄できる。
- **Step 3 の回帰リスク**: `recordPrices` に触れると 7/24 に作り込んだ価格冪等（決定的 `PriceRecordId`）が
  壊れる。既存の価格記録テストを 1 件も変更せずに通すことを Step 3 の完了条件に含める。
- **Step 4 の破壊的変更**: ボディ必須化により、Step 6 を入れる前は「買い物完了」が 400 になる。
  コミット 2 で Step 4〜6 をまとめ、単独では壊れた状態を残さない。
