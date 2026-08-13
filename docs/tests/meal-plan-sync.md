# 試験計画: meal-plan-sync

- 前提となる設計書: `docs/designs/meal-plan-sync.md`
- 前提となる要件定義書: `docs/requirements/meal-plan-sync.md`（**要件書を正**とし、FR/N/E/B の全観点を
  本書に反映する。意図的に外す観点は §要件照合表 に「対象外（理由）」を明記する）
- レベル: L3

## 試験種別

- **単体**: Domain（`ShoppingItem.updateRequiredAmount` / `ShoppingList.updateItemRequiredAmount`）、
  Application（`SyncShoppingListFromMealPlanUseCase.execute`。InMemory リポジトリで UseCase 単体を
  検証）、Presentation 純関数（`shopping-list-view.ts` の `diffSyncResult` / `describeSyncResult`）。
- **結合**: Infrastructure（PGlite を使った `DrizzleShoppingListRepository` の save/find 往復）、
  apps/web コンポーネント（`ShoppingListClient` の `handleSync` を Testing Library でレンダリング検証。
  `client.api...sync.$post` をモックした準結合テスト）。
- E2E（Playwright）は対象外（既存の `apps/web/tests/e2e/` に本機能専用シナリオは追加しない。既存の
  smoke テストの回帰のみ確認する）。

## 単体試験観点（Domain: `packages/domain/src/shopping-list/shopping-list.ts`）

対象ファイル（新規テストはここに追記）: `packages/domain/tests/shopping-list/shopping-list.test.ts`
（既存ファイルへの追記。`tests/` が `src/` をミラーする vitest 既定 include に一致）。

### `ShoppingItem.updateRequiredAmount`（新規）

| #   | 観点                                                                                                                     | 前提                                                        | 操作                                                         | 期待結果                                                                                                                                             | 分類   |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| D-1 | pending 品目の requiredAmount を新しい値に上書きする（FR-5）                                                             | `status: 'pending'`、`requiredAmount: Quantity.of(2, '個')` | `updateRequiredAmount(Quantity.of(5, '個'))`                 | `item.requiredAmount.value === 5`                                                                                                                    | 正常   |
| D-2 | `pending` 以外（`bought`）では拒否する（FR-5・不変条件）                                                                 | `markAsBought()` 後の item                                  | `updateRequiredAmount(Quantity.of(5, '個'))`                 | `Error("Cannot update required amount of a ShoppingItem with status 'bought'")`                                                                      | 異常   |
| D-3 | `pending` 以外（`skipped`）では拒否する                                                                                  | `markAsSkipped()` 後の item                                 | `updateRequiredAmount(Quantity.of(5, '個'))`                 | `Error("Cannot update required amount of a ShoppingItem with status 'skipped'")`                                                                     | 異常   |
| D-4 | amountNote 品目（`requiredAmount === null`）では拒否する（FR-8・B-2）                                                    | `requiredAmount: null, amountNote: '少々'`                  | `updateRequiredAmount(Quantity.of(1, '個'))`                 | `Error('Cannot update required amount of a ShoppingItem with amountNote')`                                                                           | 異常   |
| D-5 | 更新後も amountNote は変わらず null のまま（排他制約の維持・防御性）                                                     | pending・requiredAmount 品目                                | `updateRequiredAmount(Quantity.of(5, '個'))`                 | `item.amountNote === null`                                                                                                                           | 防御性 |
| D-6 | Domain は新旧値の異同を判定せず常に上書きする（差分判定は呼び出し元 Application の責務）                                 | pending、現在値と同じ値                                     | `updateRequiredAmount(Quantity.of(2, '個'))`（現在値と同一） | 例外を投げず `item.requiredAmount.value === 2`（Domain 側は「呼ばれたら常に上書き」。B-3 の「呼ばない」判断は Application 側の責務であることの確認） | 境界   |
| D-7 | 0 値の `Quantity` も拒否せず受理する（source・値の意味は検査しない。B-4 の防御分岐が Domain 側では発生しないことの確認） | pending 品目                                                | `updateRequiredAmount(Quantity.of(0, '個'))`                 | 例外を投げず `item.requiredAmount.value === 0`                                                                                                       | 境界   |

### `ShoppingList.updateItemRequiredAmount`（新規・薄いラッパー）

| #    | 観点                                                                     | 前提                                      | 操作                                                                                        | 期待結果                                                                          | 分類   |
| ---- | ------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------ |
| D-8  | active 状態で対象 item のみ更新する                                      | `createList([target, other])`             | `list.updateItemRequiredAmount(target.id, Quantity.of(5, '個'))`                            | `target.requiredAmount.value === 5`、`other` は不変                               | 正常   |
| D-9  | completed 状態では拒否する                                               | `reconstructCompletedList([item])`        | `list.updateItemRequiredAmount(item.id, Quantity.of(5, '個'))`                              | `Error("Cannot updateItemRequiredAmount a ShoppingList with status 'completed'")` | 異常   |
| D-10 | 存在しない itemId では拒否する                                           | `createList()`（1件）                     | `list.updateItemRequiredAmount(ShoppingItemId.fromString('missing'), Quantity.of(5, '個'))` | `Error('ShoppingItem not found')`                                                 | 異常   |
| D-11 | 対象 item が `bought` のとき `ShoppingItem` 側のエラーがそのまま伝播する | `markAsBought()` 済みの item を含むリスト | `list.updateItemRequiredAmount(item.id, Quantity.of(5, '個'))`                              | `Error("Cannot update required amount of a ShoppingItem with status 'bought'")`   | 異常   |
| D-12 | 他の item の状態・値に影響しない（防御性）                               | 3件の item を含むリスト                   | 中央の item のみ `updateItemRequiredAmount`                                                 | 前後の item の `requiredAmount`/`status` は不変                                   | 防御性 |

## 単体試験観点（Application: `SyncShoppingListFromMealPlanUseCase`）

対象ファイル: `packages/application/tests/shopping-list/sync-shopping-list-from-meal-plan.use-case.test.ts`
（既存ファイルへの追記。`InMemory*Repository` は既存の `test-helpers.ts` を再利用・必要なら拡張する）。

### 削除（FR-1・N-1〜N-3・B-1・B-2）

| #   | 観点                                                                                                                                                                                                                                            | 前提                                                                                             | 操作        | 期待結果                                                                                        | 分類        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------- | ----------- |
| A-1 | キー消失した `from_meal_plan`＋`pending` 品目を削除する（N-1）                                                                                                                                                                                  | 既存リストに玉ねぎ(pending・from_meal_plan)。献立からそのレシピを外す（=集計に無い）             | `execute()` | 玉ねぎが `dto.items` に無い。`shoppingListRepository.saveCount === 1`                           | 正常        |
| A-2 | 削除対象キーが `bought` なら残す（N-2）                                                                                                                                                                                                         | 同上だが玉ねぎが `bought`                                                                        | `execute()` | 玉ねぎが `dto.items` に残る。`status === 'bought'` のまま                                       | 正常        |
| A-3 | 削除対象キーが `manually_added` なら残す（N-3）                                                                                                                                                                                                 | 同上だが玉ねぎが `manually_added`                                                                | `execute()` | 玉ねぎが `dto.items` に残る                                                                     | 正常        |
| A-4 | 集計 0 件（全レシピを外す）で対象品目が全削除、`bought`/`manually_added` は残存（B-1）                                                                                                                                                          | 献立の `plannedRecipes` が空。既存に pending(from_meal_plan) 1件・bought 1件・manually_added 1件 | `execute()` | pending(from_meal_plan) のみ消え、他 2 件が残る                                                 | 境界        |
| A-5 | amountNote 品目（`requiredAmount === null`）もキー消失で削除される（B-2）                                                                                                                                                                       | amountNote の pending・from_meal_plan 品目。献立からそのレシピを外す                             | `execute()` | 削除される                                                                                      | 境界        |
| A-6 | 追加・更新・削除が同時に発生する複合シナリオでも取得直後スナップショットに基づき一貫して分類・適用される（E-5 の設計対応の確認。**真の同時リクエスト競合〈2 プロセス間の DB レース〉は本ユニットの UoW 対象外につき単体テストでは再現しない**） | 3件の献立材料変化（1件削除対象・1件更新対象・1件新規）を同時に発生させる                         | `execute()` | 削除1件・更新1件・追加1件が矛盾なく同時に反映される（配列走査中の削除による取り違えが起きない） | 正常/防御性 |

### 数量更新（FR-2・N-4/N-5・B-3・FR-8）

| #    | 観点                                                                                    | 前提                                                                                 | 操作        | 期待結果                                                                              | 分類               |
| ---- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------- | ------------------ |
| A-7  | 数量増加で `requiredAmount` が新しい値に更新される（N-4）                               | 既存 pending・from_meal_plan（玉ねぎ 2個）。`scaleFactor` を上げて集計値が 5個になる | `execute()` | 玉ねぎの `requiredAmount.value === 5`（Pantry 未使用時）                              | 正常               |
| A-8  | 数量減少で `requiredAmount` が新しい（小さい）値に更新され Pantry は操作されない（N-5） | 既存 5個 → 集計値 2個                                                                | `execute()` | `requiredAmount.value === 2`。`pantryRepository.saveCount === 0`                      | 正常               |
| A-9  | 新旧値が完全一致なら `updateItemRequiredAmount` を呼ばない（更新扱いしない）（B-3）     | 既存 2個・集計値も 2個（他に変化なし）                                               | `execute()` | `shoppingListRepository.saveCount === 0`（他の追加・削除も無いため no-op 全体で確認） | 境界               |
| A-10 | `bought` 品目は数量が変わっても更新されない（FR-8）                                     | 既存 2個・`bought`。集計値 5個                                                       | `execute()` | `requiredAmount.value === 2` のまま、`status === 'bought'`                            | 異常（対象外規則） |
| A-11 | amountNote 品目はキーが継続しても更新対象外（FR-8）                                     | 既存 amountNote・pending・キー継続                                                   | `execute()` | `amountNote` は不変、削除もされない                                                   | 異常（対象外規則） |
| A-12 | `manually_added` 品目は数量更新の対象外（FR-8。`source` 条件で自動的に除外される）      | 既存 `manually_added`・キー一致・集計値が異なる                                      | `execute()` | `requiredAmount` は不変                                                               | 異常（対象外規則） |

### 既存の追加ロジックの回帰（FR-3・N-6）

| #    | 観点                                                            | 前提                                               | 操作        | 期待結果                                          | 分類                 |
| ---- | --------------------------------------------------------------- | -------------------------------------------------- | ----------- | ------------------------------------------------- | -------------------- |
| A-13 | 新しいレシピの材料が新規追加される（既存ロジック無変更・N-6）   | 献立に新規レシピを追加                             | `execute()` | 新材料が `from_meal_plan`・`pending` で追加される | 正常（既存動作回帰） |
| A-14 | 新規追加分の店舗解決・調味料除外（要望1）が本変更後も維持される | 既存テスト「同期でも調味料は追加せず〜」相当を維持 | `execute()` | 調味料は追加されない。店舗が解決される            | 正常（既存動作回帰） |

### 増分のみ Pantry 引き算（FR-4・N-8・B-4・P-7）

| #    | 観点                                                                                                                                   | 前提                                                                                                                                                | 操作        | 期待結果                                                                                                                                 | 分類               |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| A-15 | 数量増加分（delta）のみ Pantry から消費され、既存分は再消費されない（二重消費防止の直接検証・N-8）                                     | 既存 pending 2個・集計値 5個（delta=3）。Pantry に在庫 1個                                                                                          | `execute()` | `requiredAmount.value === 2 + (3 - 1) = 4`。`pantryRepository.saveCount === 1`。消費量は 1個のみ（既存分の 2個は再消費されない）         | 正常               |
| A-16 | delta 全量が在庫でまかなえる場合、見た目は変化しない（`listChanged` 扱いされない）が Pantry 保存は行われる（FR-6 の非対称性）          | 既存 2個・集計値 5個（delta=3）。Pantry に在庫 3個以上                                                                                              | `execute()` | `requiredAmount.value === 2`（不変）。`shoppingListRepository.saveCount === 0`（他に変化が無い前提）。`pantryRepository.saveCount === 1` | 境界               |
| A-17 | 防御的分岐: 既存 requiredAmount が 0 の品目に対し delta 全量が在庫でまかなえると `updatedValue <= 0` になり `removeItem` される（B-4） | 既存品目を `requiredAmount: Quantity.of(0, '個')`（`ShoppingItem.reconstruct` で人為的に構築）で seed。集計値 3個（delta=3）。Pantry に在庫 3個以上 | `execute()` | 対象品目が `dto.items` から消える（`Quantity` の 0 値は作らず `removeItem` で処理される）                                                | 境界（防御的分岐） |

### no-op / 冪等性（FR-6・FR-7・N-7・N-9・B-6）

| #    | 観点                                                                                                                                | 前提                                                                         | 操作                    | 期待結果                                                                                                                          | 分類                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| A-18 | 追加・更新・削除がいずれも 0 件なら両方 save しない（N-7・FR-6）                                                                    | 既存品目と集計結果が完全一致                                                 | `execute()`             | `shoppingListRepository.saveCount === 0`、`pantryRepository.saveCount === 0`。`dto.items` は変化なし                              | 正常                                           |
| A-19 | **【冪等性・必須】** Pantry が空の状態で同一献立を変更なく 2 回連続同期すると 2 回目は完全 no-op（N-9・FR-7）                       | Pantry 空。1 回目 `execute()` 実行後、状態を変えず 2 回目を実行              | `execute()` を 2 回連続 | 2 回目で `shoppingListRepository.saveCount` / `pantryRepository.saveCount` が増えない                                             | 正常（冪等性）                                 |
| A-20 | **【既知の限定・対象外】** Pantry が非空（部分消費済み）の状態で同一献立を 2 回連続同期すると厳密な冪等性は保証されない（B-6・R-4） | Pantry に一部在庫がある状態で新規追加＋数量増加が発生する献立を 2 回連続同期 | `execute()` を 2 回連続 | 厳密な値の一致（`requiredAmount` が変化しないこと）は**アサーションしない**（対象外）。例外を投げず処理が完了することのみ確認する | 境界（受容済みの既知の限定。厳密検証は対象外） |

### 手動削除後の再追加（B-5・既存仕様の確認）

| #    | 観点                                                                                                                                                                                             | 前提                                                                                               | 操作        | 期待結果                                                                                                                 | 分類                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| A-21 | 献立由来品目を手動削除（既存 `removeItem` API 相当）した直後に同期すると、対応する材料が献立集計にまだ存在する限り再度追加される（B-5。ADR-0011 の既存仕様どおりで本ユニットは挙動を変更しない） | 既存リストに対象品目が**存在しない**状態（手動削除済みを模擬）。献立には対応する材料がまだ存在する | `execute()` | 削除前と同じキー・同じ量の品目が `from_meal_plan`・`pending` で再追加される（A-13 と同じ追加コードパスであることの確認） | 正常（既存仕様の明示確認） |

### FR-8 の対象外規則（複合確認）

| #    | 観点                                                                                                              | 前提                                                                                                       | 操作        | 期待結果                              | 分類         |
| ---- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------- | ------------ |
| A-22 | `bought`・`manually_added`・amountNote の 3 種が、削除・更新のトリガ条件下でも一切変更されない（FR-8 の統合確認） | `bought`（キー消失）・`manually_added`（キー消失）・amountNote（値変化なしでキー継続）を同時に含む献立変更 | `execute()` | 3 件とも `dto.items` に元の状態で残る | 正常（複合） |

### 既存の 404/422（E-1〜E-4・回帰）

| #    | 観点                               | 前提                                               | 操作        | 期待結果                                                      | 分類                                                                            |
| ---- | ---------------------------------- | -------------------------------------------------- | ----------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A-23 | ShoppingList が存在しない（E-1）   | 未 seed                                            | `execute()` | `ShoppingListNotFoundError`（既存テストで担保・回帰確認のみ） | 異常（既存動作回帰）                                                            |
| A-24 | ShoppingList が `completed`（E-2） | `seededShoppingList('completed', ...)`             | `execute()` | `InvalidShoppingListStateError`（既存テストで担保）           | 異常（既存動作回帰）                                                            |
| A-25 | **MealPlan が存在しない（E-3）**   | ShoppingList は存在するが対応する MealPlan 未 seed | `execute()` | `MealPlanNotFoundError`                                       | 異常（**既存ファイルに未実装。要件書 DoD が明記するため本タスクで追加が必要**） |
| A-26 | MealPlan が `draft`（E-4）         | `seededMealPlan('draft', [])`                      | `execute()` | `InvalidMealPlanStateError`（既存テストで担保）               | 異常（既存動作回帰）                                                            |

> **A-25 について**: 既存の `sync-shopping-list-from-meal-plan.use-case.test.ts` を走査したところ、E-1/E-2/E-4 の
> テストは存在するが `MealPlanNotFoundError`（E-3）のテストが無い。設計書 §テスト方針・要件書 DoD は
> 「既存の 404/422 テスト（`MealPlanNotFoundError` を含む）が回帰なく通ること」を求めているため、
> このテストは既存不足として**本タスクで新規追加**する（実装自体は無変更のロジックの確認）。

### E-6（部分失敗）・E-7（クライアント側ネットワークエラー）

| #   | 観点                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 分類                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| —   | **【対象外】** E-6: ShoppingList の保存成功後に Pantry の保存が失敗するケース。単一トランザクションではなく本ユニットでは意図的に許容する（設計書 §エラー処理(d)・§対象外。Sprint 10 Unit B の DB トランザクション/UoW 導入で閉じる）。UseCase 側でモックのリポジトリを差し替えて例外を投げさせる形の単体テストは可能だが、**本ユニットのスコープでは「対応しない」ことが確定事項であり検証不要**。実装計画で UoW を導入する際に再度試験計画を作る。 | 対象外（理由: Unit B・別ユニット）                       |
| —   | **【対象外・Presentation で扱う】** E-7: クライアントのネットワークエラーは apps/web 側の観点（下記 C-10）で扱う。Application 層には該当しない。                                                                                                                                                                                                                                                                                                     | 対象外（Presentation 側で扱うため Application では不要） |

## 単体試験観点（Presentation 純関数: `shopping-list-view.ts`）

対象ファイル: `apps/web/tests/app/shopping-lists/_utils/shopping-list-view.node.test.ts`
（既存ファイルへの追記。vitest node project の `include: ['tests/**/*.node.test.ts', ...]` に一致）。

| #    | 観点                                                                                                                | 前提                                                                                                       | 操作                                     | 期待結果                                                                                                     | 分類           |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------- |
| P-1  | 追加のみ（FR-9）                                                                                                    | `before=[A]`, `after=[A, B]`                                                                               | `diffSyncResult(before, after)`          | `{ addedCount: 1, removedCount: 0, updatedCount: 0 }`（`toEqual` で全フィールド固定）                        | 正常           |
| P-2  | 削除のみ（FR-9）                                                                                                    | `before=[A, B]`, `after=[A]`                                                                               | `diffSyncResult(before, after)`          | `{ addedCount: 0, removedCount: 1, updatedCount: 0 }`                                                        | 正常           |
| P-3  | 更新のみ（`requiredAmount.value` の変化）（FR-9）                                                                   | `before=[A(value:2)]`, `after=[A(value:5)]`（同じ id）                                                     | `diffSyncResult(before, after)`          | `{ addedCount: 0, removedCount: 0, updatedCount: 1 }`                                                        | 正常           |
| P-4  | 更新のみ（`unit` のみ変化。value が同じでも unit が変わるケース）（境界）                                           | `before=[A({value:2, unit:'個'})]`, `after=[A({value:2, unit:'袋'})]`                                      | `diffSyncResult(before, after)`          | `updatedCount === 1`（value だけでなく unit も比較していることの確認）                                       | 境界           |
| P-5  | 複合（追加・更新・削除が同時発生）。**集合の過不足なしを `toEqual` で固定する**（FR-9・仕様上意味のある集合）       | `before` 5件（1件は削除対象、2件は更新対象、2件は不変）、`after` は削除対象を除き更新2件・新規2件を含む6件 | `diffSyncResult(before, after)`          | `{ addedCount: 2, removedCount: 1, updatedCount: 2 }`（不変2件が誤って updatedCount に混ざらないことを含む） | 正常           |
| P-6  | 0件（変化なし）（N-7・FR-9）                                                                                        | `before === after`（内容同一）                                                                             | `diffSyncResult(before, after)`          | `{ addedCount: 0, removedCount: 0, updatedCount: 0 }`                                                        | 正常           |
| P-7  | amountNote 品目（`requiredAmount: null`）は null 同値比較で「変化なし」と判定される（境界・防御性）                 | `before=[A(requiredAmount: null)]`, `after=[A(requiredAmount: null)]`（同じ id）                           | `diffSyncResult(before, after)`          | `updatedCount === 0`                                                                                         | 境界           |
| P-8  | null と非 null の非対称な比較でも例外を出さない（防御性。通常仕様上発生しないが `isSameRequiredAmount` の防御確認） | `before=[A(requiredAmount: null)]`, `after=[A(requiredAmount: {value:1,unit:'個'})]`                       | `diffSyncResult(before, after)`          | 例外を投げず、`updatedCount === 1`（異なる値として扱う）                                                     | 境界（防御性） |
| P-9  | `describeSyncResult`: 各パーツの文言・順序が「追加→更新→削除」で固定される（複合・FR-9）                            | `{ addedCount: 2, removedCount: 3, updatedCount: 1 }`                                                      | `describeSyncResult(diff)`               | `'追加2件・更新1件・削除3件'`（この順序で固定。B-6/仕様の文言パーツの過不足なし）                            | 正常           |
| P-10 | `describeSyncResult`: 0件で「変更はありませんでした」（N-7）                                                        | `{ addedCount: 0, removedCount: 0, updatedCount: 0 }`                                                      | `describeSyncResult(diff)`               | `'変更はありませんでした'`                                                                                   | 正常           |
| P-11 | `describeSyncResult`: 追加のみ・削除のみ・更新のみの単独パーツ確認                                                  | 各カウントを 1 つだけ非 0 にする                                                                           | `describeSyncResult(diff)` を 3 パターン | `'追加N件'` / `'更新N件'` / `'削除N件'` のみが出力される（他のパーツが混ざらない）                           | 正常           |

## 結合試験観点（Infrastructure: `DrizzleShoppingListRepository`）

対象ファイル: `packages/infrastructure/tests/repositories/drizzle-shopping-list.repository.test.ts`
（既存ファイルへの追記。PGlite ベースの既存テスト基盤を使う）。

| #   | 観点                                                                                                     | 前提                                                                                                                                                                                                                                          | 操作                                                               | 期待結果                                                                                                                                                                                                                                                           | 分類                                |
| --- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| I-1 | **【R-5・必須】** 数量更新が `save()` → 新しい Repository インスタンスで `find()` の往復後も保持される   | `save()` 済みの item を取得し `requiredAmount` を変更（`ShoppingItem` は Domain 経由で直接操作不可なため `ShoppingList.updateItemRequiredAmount` 相当の状態を作るか、`reconstruct` で新しい `requiredAmount` を持つ item を同じ id で再構築） | 変更後の `ShoppingList` を `save()` → 別の `repository.findById()` | 取得した item の `requiredAmount.value` / `requiredAmount.unit` が更新後の値になっている（`onConflictDoUpdate.set` に `requiredAmountValue`/`requiredAmountUnit` が含まれていることの確認。stock-edit で発覚した「set 句に列が無く見かけ上成功する」罠の再発防止） | 正常（新規・DB 設計節のリスク対応） |
| I-2 | 既存回帰: `removeItem()` で取り除いた item は `save()` 後に行ごと消える                                  | 既存テスト「removeItem() で取り除いた item は save() 後に行ごと消える」                                                                                                                                                                       | （既存テストのまま）                                               | 既存アサーションどおり通る                                                                                                                                                                                                                                         | 正常（既存動作回帰）                |
| I-3 | 既存回帰: 複数 item のバッチ upsert が各行を自身の値で更新する                                           | 既存テスト                                                                                                                                                                                                                                    | （既存テストのまま）                                               | 既存アサーションどおり通る                                                                                                                                                                                                                                         | 正常（既存動作回帰）                |
| I-4 | 既存回帰: `findByMealPlanId` / `countItemsByStore` / `findAllByStore` 等の既存メソッドが無変更で動作する | 既存テスト一式                                                                                                                                                                                                                                | （既存テストのまま）                                               | 既存アサーションどおり通る                                                                                                                                                                                                                                         | 正常（既存動作回帰）                |

## 結合試験観点（apps/web コンポーネント: `ShoppingListClient` の `handleSync`）

対象ファイル: `apps/web/tests/app/shopping-lists/_components/shopping-list-client.sync.test.tsx`
（既存ファイルへの追記・一部既存アサーションの更新。vitest dom project の `include: ['tests/**/*.test.tsx', ...]` に一致）。

| #    | 観点                                                                                                                                                                    | 前提                                                                                   | 操作                                       | 期待結果                                                                                                 | 分類                                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| C-1  | 追加のみ →「追加N件」表示、一覧に追加品目が現れる（既存 SY-01 を新方式へ読み替え）                                                                                      | 既存 items=[A]。`postSync` が `[A, B]` を返す                                          | 「献立の変更を反映」クリック               | `'追加1件'` が表示される。B が一覧に現れる                                                               | 正常（既存回帰・アサーション更新）       |
| C-2  | 削除のみ →「削除N件」表示、一覧から削除品目が消える（新規）                                                                                                             | 既存 items=[A, B]。`postSync` が `[A]` を返す                                          | 「献立の変更を反映」クリック               | `'削除1件'` が表示される。B が一覧から消える                                                             | 正常                                     |
| C-3  | 更新のみ →「更新N件」表示、対象品目の数量表示が更新される（新規）                                                                                                       | 既存 items=[A(requiredAmount:2個)]。`postSync` が `[A(requiredAmount:5個)]` を返す     | 「献立の変更を反映」クリック               | `'更新1件'` が表示される。A の数量表示が 5個 に変わる                                                    | 正常                                     |
| C-4  | 複合（追加＋更新＋削除同時）→「追加X件・更新Y件・削除Z件」表示、一覧が正しく更新される（新規）                                                                          | 既存 items=[A, B, C]。`postSync` が「A は更新・B は削除・D は新規」の `[A', D]` を返す | 「献立の変更を反映」クリック               | `'追加1件・更新1件・削除1件'` が表示される。一覧が `[A', D]` になる                                      | 正常                                     |
| C-5  | 0件（変化なし）→「変更はありませんでした」表示（既存 SY-02 の期待文言を新方式へ置き換え。**回帰時の重要な変更点**）                                                     | 既存 items=[A]。`postSync` が `[A]`（同一）を返す                                      | 「献立の変更を反映」クリック               | `'変更はありませんでした'` が表示される（旧文言 `'追加する材料はありませんでした'` は表示されない）      | 正常（既存アサーションの置き換えが必須） |
| C-6  | 既存回帰（SY-03）: `completed` のとき「献立の変更を反映」ボタンが表示されない                                                                                           | `shoppingList.status === 'completed'`                                                  | render のみ                                | ボタンが存在しない                                                                                       | 正常（既存動作回帰）                     |
| C-7  | **【FE固有・ローディング】** `syncAction.pending` 中はボタンが disabled になる（二重送信防止）                                                                          | `postSync` を pending のまま解決しない Promise にする                                  | クリック後、レスポンス未解決の間に再度参照 | ボタンが `disabled` である（新しい排他制御は追加しない設計方針の確認。既存 `syncAction.pending` のまま） | 正常（FE固有）                           |
| C-8  | **【FE固有・エラー表示】** sync 失敗（`response.ok === false`）で `syncAction.errorMessage` が表示される                                                                | `postSync.mockResolvedValue({ ok: false, status: 500 })`                               | 「献立の変更を反映」クリック               | エラーメッセージが表示される                                                                             | 異常（FE固有）                           |
| C-9  | **【FE固有・失敗時に items を変えない】** sync 失敗時は一覧・チェック状態が変化しない（本変更のロールバック観点は dto 置換のため「失敗時に items を変えない」で満たす） | `postSync` が失敗を返す。事前に items=[A(status:'bought')]                             | 「献立の変更を反映」クリック               | `onSuccess` が呼ばれないため `setItems` が実行されず、一覧の内容・チェック状態が変化しない               | 異常（FE固有）                           |
| C-10 | **【E-7・FE固有】** fetch 自体の例外（ネットワークエラー）でもエラーメッセージが表示され、自動リトライしない                                                            | `postSync.mockRejectedValue(new Error('network'))`                                     | 「献立の変更を反映」クリック               | エラーメッセージが表示される。`postSync` は 1 回のみ呼ばれる（自動リトライしない）                       | 異常（FE固有）                           |

## 特性観点

- 権限: **対象外**（ADR-0003/ADR-0004。単一世帯前提が継続。本設計・要件書ともに認可観点を持たない）。
- データ整合性:
  - 削除候補・更新候補・追加候補は集計結果に対する互いに素な分類であり、UseCase 内で 1 品目が複数の
    分類に同時に属さないこと（A-6・A-22 で確認）。
  - 削除候補の抽出は取得直後のスナップショット（`shoppingList.items`）に対して行い、集約への変更適用
    は判定完了後にまとめて実行すること（A-6）。
  - Infrastructure の `onConflictDoUpdate.set` に `requiredAmountValue`/`requiredAmountUnit` が含まれ、
    数量更新が DB 往復後も保持されること（I-1・R-5）。
- 冪等性（**必須・書き込み系 UseCase**）:
  - Pantry が空の状態での同一献立の 2 回連続同期は完全な no-op になる（A-19・N-9・FR-7）。
  - **既知の限定（対象外）**: Pantry が非空（部分消費済み）の場合は厳密な冪等性を保証しない（A-20・
    B-6・R-4）。試験は「異常終了しないこと」の確認のみに留め、厳密な値の不変は対象外とする。
- 障害系（外部 I/O）: **対象外（理由: DB のみで外部 API 依存が無いため）**。
  - E-6（部分失敗: ShoppingList 保存成功後に Pantry 保存が失敗）は Sprint 10 Unit B（DB トランザクション
    /UoW 導入）で対応する既知の対象外事項であり、本ユニットでは試験しない。
  - タイムアウト・リトライ・バックオフ・フォールバックの新規導入は無い（既存の HTTP タイムアウト設定
    に従うのみ。設計書 §エラー処理(a)(b)(e) 参照）。
- フロントエンド（apps/web。**必須**）:
  - ローディング: `syncAction.pending` 中のボタン disable（C-7）。新しい排他制御は追加しない。
  - エラー表示: `syncAction.errorMessage`（C-8）、fetch 例外（C-10・E-7）。
  - 楽観的更新のロールバック: 本変更は `handleSync` の成功時に `dto.items` へ丸ごと置換する方式であり
    楽観的更新（`useOptimistic`）は使わない。したがって「ロールバック」観点は「失敗時に `items` を
    変えない」（C-9）に還元して満たす。
- 防御性（Domain 層。**必須**）:
  - 防御的コピー: `Quantity` は immutable な値オブジェクト（setter を持たない）のため、
    `updateRequiredAmount` の引数・`requiredAmount` ゲッターに新たな防御的コピー観点は無い
    （既存の `ShoppingList.items`/`shoppingDate`/`createdAt` の防御的コピーは既存テストで担保済み・
    本タスク対象外）。
  - 不変条件の保持: `pending` 以外・amountNote 品目への `updateRequiredAmount` 拒否（D-2〜D-4）。
    更新後も `amountNote` は null のまま（D-5）。
  - 副作用の検証: `ShoppingItem`/`ShoppingList` に `updatedAt` 相当のタイムスタンプは無い
    （既存の `ShoppingList.createdAt` は生成時刻のみで mutation では更新されない設計。対象外）。
  - 不正引数の伝搬: `Quantity.of` に負値を渡すと `Quantity` 自体が拒否する（既存の `Quantity` の責務。
    本タスクでは変更しない）。0 値は Domain では許容し、Application 側の防御分岐（B-4・A-17）で
    `removeItem` に落とし込む。

## メソッド網羅チェック表

| クラス／ファイル                      | メソッド                                                                                                                                                           | 対応する試験観点 No                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `ShoppingItem`                        | `create`（static）                                                                                                                                                 | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingItem`                        | `reconstruct`（static）                                                                                                                                            | 既存テストで担保（本タスク対象外・回帰）。A-17 でも直接利用                                                                     |
| `ShoppingItem`                        | `markAsBought`                                                                                                                                                     | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingItem`                        | `markAsSkipped`                                                                                                                                                    | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingItem`                        | `reassignStore`                                                                                                                                                    | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingItem`                        | `unassignStore`                                                                                                                                                    | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingItem`                        | `check`                                                                                                                                                            | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingItem`                        | `uncheck`                                                                                                                                                          | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingItem`                        | `isBought`                                                                                                                                                         | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingItem`                        | **`updateRequiredAmount`（新規）**                                                                                                                                 | D-1〜D-7                                                                                                                        |
| `ShoppingItem`                        | 各ゲッター（id/productId/displayName/requiredAmount/amountNote/targetStore/status/actualPrice/actualStore/source）                                                 | 既存テストで担保（本タスク対象外・回帰）。D-1/D-5 で requiredAmount/amountNote を再確認                                         |
| `ShoppingList`                        | `create`（static）                                                                                                                                                 | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingList`                        | `reconstruct`（static）                                                                                                                                            | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingList`                        | `addItem`                                                                                                                                                          | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingList`                        | `markAsBought`                                                                                                                                                     | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingList`                        | `reassignStore`                                                                                                                                                    | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingList`                        | `markAsSkipped`                                                                                                                                                    | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingList`                        | `check`                                                                                                                                                            | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingList`                        | `uncheck`                                                                                                                                                          | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingList`                        | `removeItem`                                                                                                                                                       | 既存テストで担保（本タスク対象外・回帰）。A-1〜A-5・A-17 で Application 経由の呼び出しも確認                                    |
| `ShoppingList`                        | `unassignStore`                                                                                                                                                    | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingList`                        | `complete`                                                                                                                                                         | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingList`                        | `reopen`                                                                                                                                                           | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `ShoppingList`                        | **`updateItemRequiredAmount`（新規）**                                                                                                                             | D-8〜D-12                                                                                                                       |
| `ShoppingList`                        | 各ゲッター（id/mealPlanId/items/shoppingDate/status/createdAt）                                                                                                    | 既存テストで担保（`items` の防御的コピーテストを含む。本タスク対象外・回帰）                                                    |
| `SyncShoppingListFromMealPlanUseCase` | **`execute`（変更）**                                                                                                                                              | A-1〜A-26（B-5 の A-21 を含む）                                                                                                 |
| `ingredient-aggregation.ts`           | `resolveMealPlanIngredients`                                                                                                                                       | 変更なし。A-1〜A-26 の間接テストで回帰確認（専用テストファイルは無い）                                                          |
| `ingredient-aggregation.ts`           | `applyPantryDeduction`                                                                                                                                             | 変更なし。A-15〜A-17 の間接テストで回帰確認                                                                                     |
| `ingredient-aggregation.ts`           | `resolveTargetStores`                                                                                                                                              | 変更なし。A-14 の間接テストで回帰確認                                                                                           |
| `ingredient-aggregation.ts`           | `ingredientMatchKey`/`itemMatchKey`                                                                                                                                | 変更なし。A-1〜A-12 の間接テストで回帰確認                                                                                      |
| `shopping-list-view.ts`               | `buildStoreNameMap`                                                                                                                                                | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `shopping-list-view.ts`               | `groupItemsByStore`                                                                                                                                                | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `shopping-list-view.ts`               | `describeRemoveConfirmation`                                                                                                                                       | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `shopping-list-view.ts`               | `formatShoppingDate`                                                                                                                                               | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `shopping-list-view.ts`               | **`diffSyncResult`（新規）**                                                                                                                                       | P-1〜P-8                                                                                                                        |
| `shopping-list-view.ts`               | **`describeSyncResult`（新規）**                                                                                                                                   | P-9〜P-11                                                                                                                       |
| `ShoppingListClient`                  | **`handleSync`（変更）**                                                                                                                                           | C-1〜C-10                                                                                                                       |
| `ShoppingListClient`                  | その他ハンドラ（`handleMarkAsBought`/`handleSetChecked`/`handleRemoveItem`/`handleAddItem`/`handleReassignStore`/`handleComplete`/`handleReopen`/`handleRefetch`） | 既存テストで担保（本タスク対象外・回帰。`handleSync` の変更が他ハンドラのロジックに影響しないことを既存テストの継続通過で確認） |
| `DrizzleShoppingListRepository`       | `findById`                                                                                                                                                         | 既存テストで担保（本タスク対象外・回帰）。I-1 で再確認                                                                          |
| `DrizzleShoppingListRepository`       | `findByMealPlanId`                                                                                                                                                 | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `DrizzleShoppingListRepository`       | **`save`（数量更新の永続化を新規確認）**                                                                                                                           | I-1                                                                                                                             |
| `DrizzleShoppingListRepository`       | `countItemsByStore`                                                                                                                                                | 既存テストで担保（本タスク対象外・回帰）                                                                                        |
| `DrizzleShoppingListRepository`       | `findAllByStore`                                                                                                                                                   | 既存テストで担保（本タスク対象外・回帰）                                                                                        |

## 回帰試験範囲

- **Domain**: 既存の `ShoppingItem`/`ShoppingList` の全メソッド（`create`/`reconstruct`/`markAsBought`/
  `markAsSkipped`/`reassignStore`/`unassignStore`/`check`/`uncheck`/`removeItem`/`complete`/`reopen`/
  各ゲッター）。既存ファイル `shopping-list.test.ts` へ新規テストを追記するのみで、既存テストの変更は
  不要（新規メソッド追加のみで既存メソッドのシグネチャ・振る舞いは無変更）。
- **Application**: `SyncShoppingListFromMealPlanUseCase` の既存 6 テスト（新規追加ロジック・no-op・
  在庫引き算・404/422・調味料除外）がすべて回帰なく通ること。特に既存の「新規材料が無ければ no-op で
  保存しない」テストは、削除・更新ロジック追加後も `newIngredients.length === 0` 判定に加えて削除・
  更新候補も 0 件であることを前提にしており、既存テストのシナリオ（既存品目が完全に一致）では従来
  どおり成立する。
  - `ingredient-aggregation.ts` は無変更のため、`resolveMealPlanIngredients`/`applyPantryDeduction`/
    `resolveTargetStores`/`ingredientMatchKey`/`itemMatchKey` を直接テストする専用ファイルは無く、
    `sync-shopping-list-from-meal-plan.use-case.test.ts` と `generate-shopping-list.use-case.test.ts`
    の既存テストがそのまま回帰試験になる。
  - 他の ShoppingList 系 UseCase（`add-item`/`mark-as-bought`/`remove-item`/`reassign-store`/
    `set-item-checked`/`complete-shopping`/`reopen-shopping-list`/`get-shopping-list`）は本設計で
    変更しないため、既存テストファイル一式の継続通過を回帰確認とする。
- **Infrastructure**: `drizzle-shopping-list.repository.test.ts` の既存全テスト（削除の `notInArray`
  差分削除・バッチ upsert・`findByMealPlanId`/`countItemsByStore`/`findAllByStore`）が回帰なく通ること。
- **apps/web**:
  - `shopping-list-client.sync.test.tsx` の既存 SY-01〜SY-03 は本変更で**アサーション文言の更新が必須**
    （C-1・C-5・C-6 参照。特に SY-02 の期待文言 `'追加する材料はありませんでした'` は
    `'変更はありませんでした'` に置き換わる）。
  - `shopping-list-view.node.test.ts` の既存 `buildStoreNameMap`/`groupItemsByStore`/
    `describeRemoveConfirmation`/`formatShoppingDate` のテストは無変更で回帰確認する。
  - `shopping-list-client.checked.test.tsx`/`shopping-list-client.remove.test.tsx`/
    `shopping-list-client.complete.test.tsx`/`shopping-list-client.offline-queue.test.tsx`/
    `shopping-list-client.view.test.tsx` 等の他コンポーネントテストは `handleSync` 以外のロジックを
    変更しないため無変更で回帰確認する。
- **HTTP ルート**: `apps/web/src/server/routes/shopping-lists.ts` の `.post('/:id/sync', ...)` は無変更。
  専用のルートテスト（`apps/web/tests/server/routes/shopping-lists.*.test.ts`）に sync 用のファイルは
  現状無いため新規追加はしない（UseCase 層の単体テストで振る舞いを担保する。ルーティング自体の
  404/422 マッピングは既存の他エンドポイントのテストパターンと同一で、本設計固有のリスクは無い）。

## 試験データ

- **マッチキー生成**: `productId`（無ければ `displayName.trim()`）× 単位（`normalizeUnit` 後。
  amountNote 系は `'note'`）。既存の `test-helpers.ts` の `amountIngredient`/`noteIngredient`/
  `seededItem`/`seededProduct` をそのまま再利用する。
- **削除・更新候補の構築**:
  - 削除候補: 既存 `seededItem({ status: 'pending' })`（`source: 'from_meal_plan'` は既定値）を seed
    し、対応するレシピを献立から除外する（`seededMealPlan` の `plannedRecipes` に含めない）。
  - 更新候補（増加）: 既存 item の `requiredAmount` より大きい値になるレシピ材料を `seededRecipe` で
    用意し、`scaleFactor` または材料量自体を増やす。
  - 更新候補（減少）: 逆に既存より小さい値になるよう `amountIngredient` の量を調整する。
  - B-4（防御的分岐）用の 0 値品目: `ShoppingItem.reconstruct({ ..., requiredAmount: Quantity.of(0, '個') })`
    で直接構築する（`ShoppingItem.create` 経由では通常到達しない状態を、テストのために `reconstruct`
    で人為的に作る）。
- **Pantry**: `InMemoryPantryRepository.seedStock(stockInput(...))`（既存の `test-helpers.ts`）。
  空 Pantry（既定の `Pantry.create()`）は冪等性テスト（A-19）に使う。
- **apps/web コンポーネント**: 既存の `shopping-list-test-fixtures.ts` の `createShoppingItemDto`/
  `createShoppingListDto`/`PRODUCTS`/`STORES` を再利用する。複合シナリオ（C-4）用に、更新前後で
  `requiredAmount` の異なる `ShoppingItemDto` を明示的に作る。
- **Infrastructure**: 既存の `createTestDb()`（PGlite）をそのまま使う。数量更新確認（I-1）は既存の
  `createItem`/`createList` ヘルパーに `requiredAmount` を変えた 2 回目の `save()` を渡す形で構築する。

## 要件照合表（`docs/requirements/meal-plan-sync.md` との対応）

| 要件ID | 対応する試験観点 No                                                                                                           | 備考                                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| FR-1   | A-1, A-4, A-5                                                                                                                 |                                                              |
| FR-2   | A-7, A-8, A-9                                                                                                                 |                                                              |
| FR-3   | A-13, A-14                                                                                                                    | 既存動作の回帰                                               |
| FR-4   | A-15, A-16, A-17                                                                                                              |                                                              |
| FR-5   | D-1〜D-12                                                                                                                     | Domain 新規メソッド                                          |
| FR-6   | A-16, A-18, A-22                                                                                                              |                                                              |
| FR-7   | A-19                                                                                                                          | 冪等性・必須                                                 |
| FR-8   | A-10, A-11, A-12, A-22                                                                                                        |                                                              |
| FR-9   | P-1〜P-11, C-1〜C-6                                                                                                           |                                                              |
| FR-10  | A-23〜A-26（HTTP 契約自体は無変更のため直接テストは既存ルートテストに委ねる。UseCase の例外種別が既存どおりであることで確認） |                                                              |
| N-1    | A-1                                                                                                                           |                                                              |
| N-2    | A-2                                                                                                                           |                                                              |
| N-3    | A-3                                                                                                                           |                                                              |
| N-4    | A-7                                                                                                                           |                                                              |
| N-5    | A-8                                                                                                                           |                                                              |
| N-6    | A-13                                                                                                                          |                                                              |
| N-7    | A-18, P-6, P-10, C-5                                                                                                          |                                                              |
| N-8    | A-15                                                                                                                          |                                                              |
| N-9    | A-19                                                                                                                          |                                                              |
| E-1    | A-23                                                                                                                          | 既存動作回帰                                                 |
| E-2    | A-24                                                                                                                          | 既存動作回帰                                                 |
| E-3    | **A-25（既存テスト不足のため本タスクで新規追加）**                                                                            |                                                              |
| E-4    | A-26                                                                                                                          | 既存動作回帰                                                 |
| E-5    | A-6                                                                                                                           | 真の同時実行競合は再現しない（設計の防御策の単体確認に限定） |
| E-6    | **対象外**（Sprint 10 Unit B・DB トランザクション/UoW 導入で対応。本ユニットでは試験しない）                                  |                                                              |
| E-7    | C-10                                                                                                                          | apps/web 側                                                  |
| B-1    | A-4                                                                                                                           |                                                              |
| B-2    | A-5, A-11                                                                                                                     |                                                              |
| B-3    | A-9                                                                                                                           |                                                              |
| B-4    | A-17                                                                                                                          | 防御的分岐（通常到達しないが `reconstruct` で人為的に再現）  |
| B-5    | A-21                                                                                                                          | 本ユニットで挙動を変更しない既存仕様（ADR-0011）の明示確認   |
| B-6    | **A-20（既知の限定として「異常終了しないこと」のみ確認。厳密な冪等性の検証は対象外）**                                        | R-4 として設計書に記録済み                                   |

## 完了条件

- Domain: D-1〜D-12 がすべて実装・通過し、`updateRequiredAmount`/`updateItemRequiredAmount` の
  正常系・異常系（`pending` 以外・amountNote 品目・存在しない itemId・completed）が揃っている。
- Application: A-1〜A-26 がすべて実装・通過し、削除・数量更新（増加/減少）・no-op・冪等性
  （Pantry 空・必須）・既存追加ロジックの回帰・既存 404/422（E-3・A-25 の新規追加を含む）・手動削除後の
  再追加（B-5・A-21）が揃っている。B-6（Pantry 非空時の冪等性）は既知の限定として「異常終了しない
  こと」のみ確認し、厳密な値の一致は対象外であることが明記されている。
- Presentation 純関数: P-1〜P-11 がすべて実装・通過し、`diffSyncResult`/`describeSyncResult` の
  追加のみ・削除のみ・更新のみ・複合・0件・null 同値比較（防御性）が集合の過不足なしで確認されている。
- Infrastructure: I-1（R-5・数量更新の save/find 往復）が新規に実装・通過し、既存の削除・upsert
  回帰テスト（I-2〜I-4）が継続通過する。
- apps/web: C-1〜C-10 がすべて実装・通過し、既存 SY-01〜SY-03 のアサーション文言更新
  （特に SY-02 → C-5 の文言変更）が反映されている。ローディング・エラー表示・失敗時の非変更
  （ロールバック相当）が確認されている。
- 要件照合表の全 FR/N/E/B が試験観点に反映されているか、対象外理由（E-6・B-6 の厳密検証部分）
  つきで明記されている（B-5 は A-21 で正面から反映済み・対象外ではない）。
- `pnpm lint` / `pnpm type-check` / `pnpm test`（変更パッケージ: domain / application / infrastructure /
  apps/web）が通ること。
