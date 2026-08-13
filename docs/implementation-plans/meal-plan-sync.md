# 実装計画: meal-plan-sync

- 前提となる設計書: `docs/designs/meal-plan-sync.md`（confirmed・Gate A 2026-08-13・P-1〜P-7）
- レベル: L3
- 実装ルート: Orchestrator（implementer）
- 判断理由: ADR-0007 の「既存品目は一切変更・削除しない」を覆す判断を実装が含む
  （`docs/05-roadmap.md` §Unit A「Unit A は Codex にしない」）。指示書に書き切れない
  設計判断（削除・数量更新の分岐条件、Pantry 増分引き算の境界処理）が実装中に残るため、
  Codex への軽量委譲ではなく Orchestrator 経路（implementer が本計画を読んで直接実装）を取る。

## 変更対象ファイル

| #   | パス                                                                                          | なぜ変えるか                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/domain/src/shopping-list/shopping-list.ts`                                          | `ShoppingItem.updateRequiredAmount` / `ShoppingList.updateItemRequiredAmount` を新設（FR-5）                                                                      |
| 2   | `packages/domain/tests/shopping-list/shopping-list.test.ts`                                   | 上記 2 メソッドの単体テストを追加                                                                                                                                 |
| 3   | `packages/application/src/shopping-list/sync-shopping-list-from-meal-plan.use-case.ts`        | 削除・数量更新の判定と適用を追加（FR-1〜FR-4, FR-6）。既存の追加ロジックは変更しない                                                                              |
| 4   | `packages/application/tests/shopping-list/test-helpers.ts`                                    | `seededItem` に `source` / `requiredAmount` / `amountNote` / `productId` / `displayName` の override を追加（削除・数量更新テストの前提データを組めるようにする） |
| 5   | `packages/application/tests/shopping-list/sync-shopping-list-from-meal-plan.use-case.test.ts` | 削除・数量増減・増分引き算・no-op・既存追加回帰・404/422 のテストケースを追加                                                                                     |
| 6   | `packages/infrastructure/tests/repositories/drizzle-shopping-list.repository.test.ts`         | 数量更新の `save()`→`find()` 往復を確認する回帰テストを追加（R-5 の検出）                                                                                         |
| 7   | `apps/web/src/app/shopping-lists/_utils/shopping-list-view.ts`                                | `SyncDiff` / `diffSyncResult` / `describeSyncResult` / `isSameRequiredAmount` を追加                                                                              |
| 8   | `apps/web/tests/app/shopping-lists/_utils/shopping-list-view.node.test.ts`                    | 上記純関数のテストを追加                                                                                                                                          |
| 9   | `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`                        | `handleSync` の通知メッセージ組み立てを ID 比較ベース（`diffSyncResult`/`describeSyncResult`）に直す                                                              |
| 10  | `apps/web/tests/app/shopping-lists/_components/shopping-list-client.sync.test.tsx`            | 既存 SY-02 の期待文言を更新し、削除・数量更新・複合パターンのケースを追加                                                                                         |
| 11  | `docs/04-domain-model.md`                                                                     | ShoppingList 集約節に `updateRequiredAmount`/`updateItemRequiredAmount` の実装追記を追加                                                                          |
| 12  | `docs/05-roadmap.md`                                                                          | Sprint 10 Unit A の状態列を更新（Gate A 確定 → 実装計画確定 / 実装中、完了後は完了マーク）                                                                        |

**変更しないことを確認済み（コード変更なし。回帰テストのみ追加）**:

- `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.ts`:
  `onConflictDoUpdate.set`（L104-114）は既に `requiredAmountValue: sql\`excluded.required_amount_value\``/`requiredAmountUnit: sql\`excluded.required_amount_unit\`` を含む（確認済み L106-107）。数量更新は
  既存の upsert 経路にそのまま乗るため、Infrastructure のプロダクションコードは変更不要。
- `packages/application/src/shopping-list/ingredient-aggregation.ts`（`resolveMealPlanIngredients` /
  `applyPantryDeduction` / `ingredientMatchKey` / `itemMatchKey` / `resolveTargetStores`）。
- `packages/api-contract` 配下すべて（新規 Zod スキーマなし）。
- `apps/web/src/server/routes/shopping-lists.ts`（`.post('/:id/sync', ...)` は無変更）。
- `packages/infrastructure/src/db/schema.ts`（DB マイグレーション無し）。

## 新規作成ファイル

新規ファイルは無し。対象範囲のテストファイル（`shopping-list-view.node.test.ts` /
`shopping-list-client.sync.test.tsx` / `sync-shopping-list-from-meal-plan.use-case.test.ts` /
`drizzle-shopping-list.repository.test.ts`）はすべて既存ファイルであり、既存ファイルへケース追加する
（vitest include との突き合わせ済み。下記「テスト計画」参照）。

## ファイルごとの変更内容

### `packages/domain/src/shopping-list/shopping-list.ts`

- 変更内容:
  1. `ShoppingItem` クラスに以下のメソッドを追加する（既存の `markAsSkipped`/`uncheck` と同じ
     ガード付き throw のパターンを踏襲）。

     ```ts
     /**
      * 献立同期による数量の上書き専用。pending の from_meal_plan 品目にのみ使うことを想定する
      * （呼び出し元の Application 層が対象を絞る。Domain 側では pending 以外を拒否するのみで
      * source は見ない）。amountNote 品目（requiredAmount が null）は拒否する。
      *
      * @throws Error status が pending 以外の場合
      * @throws Error 現在の requiredAmount が null（amountNote 品目）の場合
      */
     updateRequiredAmount(amount: Quantity): void {
       if (this.itemStatus !== 'pending') {
         throw new Error(
           `Cannot update required amount of a ShoppingItem with status '${this.itemStatus}'`,
         );
       }
       if (this.itemRequiredAmount === null) {
         throw new Error('Cannot update required amount of a ShoppingItem with amountNote');
       }
       this.itemRequiredAmount = amount;
     }
     ```

     挿入位置: `markAsSkipped()`（L109-114）の直後、`reassignStore()`（L117-119）の前。

  2. `ShoppingList` クラスに以下のメソッドを追加する（既存の `markAsBought`/`reassignStore` と
     同型の薄いラッパー）。

     ```ts
     /**
      * @throws Error active でない、itemId の品目が存在しない場合（Domain 側の追加制約は
      * ShoppingItem.updateRequiredAmount を参照）
      */
     updateItemRequiredAmount(itemId: ShoppingItemId, amount: Quantity): void {
       this.assertActive('updateItemRequiredAmount');
       this.findItem(itemId).updateRequiredAmount(amount);
     }
     ```

     挿入位置: `reassignStore()`（L279-283）の直後、`markAsSkipped()`（L285-289）の前。

  3. `Quantity` の import が既に `import type { Quantity } from '../shared/quantity';`（L4）で
     存在するため import 文の変更は不要。値としても使う（`updateRequiredAmount(amount: Quantity)`
     は型参照のみで値生成は行わない）ため `import type` のままで問題ない。
- 完了条件:
  - `ShoppingItem.updateRequiredAmount(amount)` が `pending` かつ `requiredAmount !== null` の
    場合のみ値を更新し、それ以外は例外を投げる。
  - `ShoppingList.updateItemRequiredAmount(itemId, amount)` が `assertActive` を通し、
    存在しない `itemId` では既存の `findItem` の `Error('ShoppingItem not found')` を投げる。
  - 既存メソッド（`addItem`/`markAsBought`/`reassignStore`/`markAsSkipped`/`check`/`uncheck`/
    `removeItem`/`complete`/`unassignStore`/`reopen`）の実装・挙動を変更しない。
  - `pnpm --filter @cookpit/domain type-check` がエラーなし。

### `packages/domain/tests/shopping-list/shopping-list.test.ts`

- 変更内容: `describe('ShoppingItem', ...)` ブロックと `describe('ShoppingList', ...)` ブロック
  それぞれに、既存の `markAsSkipped`/`reassignStore` のテストと同じ書き方でケースを追加する。
  - `ShoppingItem.updateRequiredAmount`:
    - 正常系: `pending` の品目に対して呼ぶと `requiredAmount` が新しい値に変わる
      （`createItem()` で作った item は `pending`・`requiredAmount` 非 null）。
    - 異常系: `status` を `bought`/`skipped` にした品目（`markAsBought`/`markAsSkipped` 呼び出し後）
      に対して呼ぶと `Cannot update required amount of a ShoppingItem with status '...'` を throw。
    - 異常系: `amountNote` 品目（`requiredAmount: null, amountNote: '適量'` で `create`）に対して
      呼ぶと `Cannot update required amount of a ShoppingItem with amountNote` を throw。
  - `ShoppingList.updateItemRequiredAmount`:
    - 正常系: active なリストの既存品目の `requiredAmount` が更新される。
    - 異常系: `reconstructCompletedList()`（既存ヘルパー）に対して呼ぶと
      `Cannot updateItemRequiredAmount a ShoppingList with status 'completed'` を throw。
    - 異常系: 存在しない `itemId` に対して呼ぶと `Error('ShoppingItem not found')` を throw。
- 完了条件: 上記 6 ケースが追加され、`pnpm --filter @cookpit/domain test` が全件通過する。

### `packages/application/src/shopping-list/sync-shopping-list-from-meal-plan.use-case.ts`

- 変更内容: `execute()` 内の「集計取得後、`newIngredients` が空なら早期 return」という現行ロジック
  （L64-71）を、以下の 3 系統（追加・更新・削除）の判定 + 適用に置き換える。既存の
  404/422 チェック（L45-61）は変更しない。

  1. **判定**（`aggregated` 取得直後、Pantry 取得より前に行う。副作用なしの純粋な集合演算）:

     ```ts
     const aggregated = await resolveMealPlanIngredients(mealPlan, this.recipeRepository);
     const aggregatedByKey = new Map(aggregated.map((ing) => [ingredientMatchKey(ing), ing]));
     const existingItems = shoppingList.items; // スナップショット（防御的コピー）
     const existingKeys = new Set(existingItems.map(itemMatchKey));

     const newIngredients = aggregated.filter((ing) => !existingKeys.has(ingredientMatchKey(ing)));

     const updateCandidates = existingItems.filter((item) => {
       if (item.source !== 'from_meal_plan' || item.status !== 'pending') return false;
       if (item.requiredAmount === null) return false;
       const aggIngredient = aggregatedByKey.get(itemMatchKey(item));
       if (aggIngredient?.requiredAmount == null) return false;
       return aggIngredient.requiredAmount.value !== item.requiredAmount.value;
     });

     const removalCandidates = existingItems.filter(
       (item) =>
         item.source === 'from_meal_plan' &&
         item.status === 'pending' &&
         !aggregatedByKey.has(itemMatchKey(item)),
     );

     if (
       newIngredients.length === 0 &&
       updateCandidates.length === 0 &&
       removalCandidates.length === 0
     ) {
       return toShoppingListDto(shoppingList); // no-op（FR-6/FR-7）
     }
     ```

  2. **Pantry 取得**（判定で 3 群のいずれかが非空の場合のみ到達。既存どおり
     `const pantry = await this.pantryRepository.find();` を呼ぶ）。

  3. **更新の適用**（増加・減少で分岐。P-7 の二重消費防止）:

     ```ts
     let listChanged = false;
     let pantryConsumed = false;

     for (const item of updateCandidates) {
       const newAmount = aggregatedByKey.get(itemMatchKey(item))!.requiredAmount!;
       const delta = newAmount.value - item.requiredAmount!.value;

       if (delta < 0) {
         shoppingList.updateItemRequiredAmount(item.id, newAmount);
         listChanged = true;
         continue;
       }

       const deltaIngredient: ResolvedIngredient = {
         productId: item.productId,
         displayName: item.displayName,
         requiredAmount: Quantity.of(delta, item.requiredAmount!.unit),
         amountNote: null,
       };
       const { ingredients: afterDelta, consumed } = applyPantryDeduction(
         [deltaIngredient],
         pantry,
       );
       if (consumed) pantryConsumed = true;

       const buyDelta = afterDelta[0]?.requiredAmount?.value ?? 0;
       const updatedValue = item.requiredAmount!.value + buyDelta;

       if (updatedValue <= 0) {
         // B-4 の防御的分岐。通常のドメイン不変条件下では到達しない想定。
         shoppingList.removeItem(item.id);
         listChanged = true;
       } else if (updatedValue !== item.requiredAmount!.value) {
         shoppingList.updateItemRequiredAmount(
           item.id,
           Quantity.of(updatedValue, item.requiredAmount!.unit),
         );
         listChanged = true;
       }
       // updatedValue === item.requiredAmount!.value のときは見た目は変わらないが
       // pantryConsumed が true のままなら Pantry の save は行う。
     }
     ```

  4. **削除の適用**:

     ```ts
     for (const item of removalCandidates) {
       shoppingList.removeItem(item.id);
       listChanged = true;
     }
     ```

  5. **追加の適用**（既存ロジックを移設するだけ。ロジック自体は変更しない）:

     ```ts
     if (newIngredients.length > 0) {
       const { ingredients: afterDeduction, consumed } = applyPantryDeduction(
         newIngredients,
         pantry,
       );
       if (consumed) pantryConsumed = true;
       const targetStoreMap = await resolveTargetStores(afterDeduction, this.productRepository);
       for (const ingredient of afterDeduction) {
         shoppingList.addItem(
           ShoppingItem.create({
             productId: ingredient.productId,
             displayName: ingredient.displayName,
             requiredAmount: ingredient.requiredAmount,
             amountNote: ingredient.amountNote,
             targetStore:
               ingredient.productId === null
                 ? null
                 : (targetStoreMap.get(ingredient.productId.value) ?? null),
             source: 'from_meal_plan',
           }),
         );
         listChanged = true;
       }
     }
     ```

  6. **保存**（既存の非対称保存パターンを継承。FR-6）:

     ```ts
     if (listChanged) {
       await this.shoppingListRepository.save(shoppingList);
     }
     if (pantryConsumed) {
       await this.pantryRepository.save(pantry);
     }
     return toShoppingListDto(shoppingList);
     ```

  7. **import 追加**: `Quantity` を `@cookpit/domain` から、`ResolvedIngredient` を
     `./ingredient-aggregation` から追加 import する（既存の `ShoppingItem, ShoppingListId` の
     import 文・`applyPantryDeduction, ingredientMatchKey, itemMatchKey, resolveMealPlanIngredients,
resolveTargetStores` の import 文はそのまま維持し、`ResolvedIngredient` を型 import として
     追記する）。

  **実行順序の制約（設計書に明記済み）**: 削除・更新・追加はキーごとに排他的分類のため
  処理順序は結果に影響しない。**唯一の制約**は (3) の増加分の Pantry 引き算と (5) の追加分の
  Pantry 引き算が、同一の `pantry` インスタンスに対して順に適用され、最後に 1 回だけ `save()`
  されること（上記コードはその順序を満たす）。

- 完了条件:
  - N-1〜N-9・E-1〜E-7・B-1〜B-6（`docs/requirements/meal-plan-sync.md`）がすべて満たされる。
  - 既存の 404/422 throw（`ShoppingListNotFoundError`/`InvalidShoppingListStateError`/
    `MealPlanNotFoundError`/`InvalidMealPlanStateError`）の位置・条件を変更しない。
  - `newIngredients.length === 0 && updateCandidates.length === 0 && removalCandidates.length === 0`
    のとき `shoppingListRepository.save`/`pantryRepository.save` のいずれも呼ばれない。
  - `pnpm --filter @cookpit/application type-check` がエラーなし。

### `packages/application/tests/shopping-list/test-helpers.ts`

- 変更内容: `SeededItemOptions` に以下のフィールドを追加し、`seededItem()` の実装を対応させる。

  ```ts
  export interface SeededItemOptions {
    id?: string;
    status?: 'pending' | 'bought' | 'skipped';
    targetStoreId?: string | null;
    actualPrice?: Money | null;
    actualStoreId?: string | null;
    source?: ItemSource; // 追加。既定値は 'from_meal_plan'（既存の既定を維持）
    requiredAmount?: Quantity | null; // 追加。既定値は Quantity.of(2, '個')（既存の既定を維持）
    amountNote?: string | null; // 追加。既定値は null
    productId?: string | null; // 追加。既定値は PRODUCT_ID（requiredAmount が null のときは
    // 呼び出し側が明示的に null を渡す想定。ShoppingItem の排他制約は reconstruct では
    // 検証されないため、テスト側で amountNote 品目を作るときは requiredAmount: null と
    // amountNote: '適量' 等を同時に指定する）
    displayName?: string; // 追加。既定値は '玉ねぎ'
  }
  ```

  `seededItem()` 本体は `options.source ?? 'from_meal_plan'` / `options.requiredAmount ??
Quantity.of(2, '個')` / `options.amountNote ?? null` / `options.productId`（`null` と
  `undefined` を区別する既存の `targetStoreId`/`actualStoreId` と同じ 3 値パターンを踏襲）/
  `options.displayName ?? '玉ねぎ'` を使うよう `ShoppingItem.reconstruct` の呼び出しを書き換える。
  `ItemSource` 型を `@cookpit/domain` から追加 import する。

- 完了条件:
  - 既存の呼び出し（`seededItem()` / `seededItem({ status: 'bought' })` など override 無しの
    既存テストケース）が変更なしで動作する（既定値が現状の固定値と一致すること）。
  - `seededItem({ source: 'manually_added' })` / `seededItem({ requiredAmount: null, amountNote:
'適量' })` / `seededItem({ productId: null, displayName: '人参' })` のような新しい呼び出しが
    型エラーなく書ける。

### `packages/application/tests/shopping-list/sync-shopping-list-from-meal-plan.use-case.test.ts`

- 変更内容: 既存の `describe('SyncShoppingListFromMealPlanUseCase', ...)` に以下のケースを追加する
  （既存の 6 ケースは変更しない）。設計書 §テスト方針と要件定義書 N-1〜N-9 に対応。

  | #   | ケース                                                                                    | 前提                                                                                                                                | 検証                                                                                                  |
  | --- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
  | D-1 | 削除: 献立から材料が消えた `pending`/`from_meal_plan` 品目が削除される                    | `seededItem()`（既定）をリストに seed、対応レシピを献立から外す（`seededMealPlan` に含めない）                                      | 削除後の `dto.items` に対象品目が無い。`saveCount === 1`                                              |
  | D-2 | 削除対象外: `bought` は残る                                                               | `seededItem({ status: 'bought' })`                                                                                                  | `dto.items` に残る                                                                                    |
  | D-3 | 削除対象外: `manually_added` は残る                                                       | `seededItem({ source: 'manually_added' })`                                                                                          | `dto.items` に残る                                                                                    |
  | D-4 | 削除対象: amountNote 品目もキー消失で削除される                                           | `seededItem({ requiredAmount: null, amountNote: '適量', productId: null, displayName: '塩' })`                                      | `dto.items` に無い                                                                                    |
  | U-1 | 数量増加: `requiredAmount` が新しい値に更新される。Pantry 在庫があれば増分のみ消費        | 献立の対応レシピの `scaleFactor` を増やす（`seededPlannedRecipe(id, RECIPE_ID, 2)`）                                                | 更新後 item の `requiredAmount.value` が新集計値。`pantryRepository.saveCount` は在庫有無に応じて 0/1 |
  | U-2 | 数量減少: `requiredAmount` が新しい（小さい）値に更新され、Pantry は操作されない          | `scaleFactor` を減らす                                                                                                              | 更新後の値が小さくなる。`pantryRepository.saveCount === 0`                                            |
  | U-3 | 数量不変: 値が同じときは更新されない（`updateItemRequiredAmount` 相当の save が起きない） | 集計結果が既存値と一致する構成                                                                                                      | `shoppingListRepository.saveCount === 0`（他の変更が無い前提）                                        |
  | U-4 | `bought` 品目は数量が変わっても更新されない                                               | 対象品目を `status: 'bought'` にしたうえで `scaleFactor` を変える                                                                   | `dto.items` 内の該当品目の `requiredAmount` が不変                                                    |
  | U-5 | amountNote 品目は数量更新の対象外                                                         | `requiredAmount: null` の品目でキーが集計に存在し続ける構成                                                                         | 更新されない（削除もされない）                                                                        |
  | U-6 | 増分のみの在庫引き算（二重消費防止）                                                      | Pantry に既存分相当の在庫を仕込んだ状態で増分のみ追加 seed し、増加後の `requiredAmount` が「増分の買う量」だけ増えていることを検証 | 既存分は再消費されない（在庫消費量が増分相当のみ）                                                    |
  | N-1 | no-op/冪等: 追加・更新・削除が 0 件なら両 Repository とも save しない                     | 献立と既存リストが完全一致する構成                                                                                                  | `shoppingListRepository.saveCount === 0` かつ `pantryRepository.saveCount === 0`                      |
  | N-2 | 同一献立を Pantry 空の状態で 2 回同期すると 2 回目は no-op（FR-7/N-9）                    | 1 回目の `execute()` 実行後、同じ入力で 2 回目を実行                                                                                | 2 回目の `saveCount` 増分が 0                                                                         |
  | R-1 | 既存の追加ロジック回帰: 新規材料の追加・在庫引き算・店舗解決が動作する                    | 既存ケース（新規レシピ追加）をそのまま再確認                                                                                        | 既存の 3 ケース（現状のテスト 1〜3 番目）が回帰なく通ること自体が確認（変更不要、削除しない）         |
  | R-2 | 既存の 404/422 回帰                                                                       | 既存ケース（4〜6 番目）をそのまま再確認                                                                                             | 既存ケースが回帰なく通ること（変更不要）                                                              |

  各ケースは `test-helpers.ts` の `seededItem`/`seededPlannedRecipe`/`stockInput` の拡張済み
  ヘルパーを使う。テストファイル冒頭の import に `ItemSource` 等の追加型 import は不要
  （helper 側で吸収する）。

- 完了条件:
  - D-1〜D-4, U-1〜U-6, N-1〜N-2 が新規追加され、既存 6 ケース（R-1/R-2 相当）が無改変で
    通過する。
  - `pnpm --filter @cookpit/application test` が全件通過する。

### `packages/infrastructure/tests/repositories/drizzle-shopping-list.repository.test.ts`

- 変更内容: 既存の `describe('DrizzleShoppingListRepository', ...)` 内、既存の「複数 item のバッチ
  upsert」テスト（L169-195）の直後に、以下のケースを追加する。

  ```ts
  it('数量更新後の save() → find() で requiredAmount が更新後の値のまま復元される', async () => {
    const item = createItem({ status: 'pending', actualPrice: null, actualStore: null });
    await repository.save(createList({ items: [item] }));

    const loaded = requireList(
      await repository.findById(ShoppingListId.fromString('shopping-list-1')),
    );
    loaded.updateItemRequiredAmount(item.id, Quantity.of(5, '個'));
    await repository.save(loaded);

    const found = requireList(
      await repository.findById(ShoppingListId.fromString('shopping-list-1')),
    );
    const foundItem = found.items.find((candidate) => candidate.id.equals(item.id));
    expect(foundItem?.requiredAmount?.value).toBe(5);
    expect(foundItem?.requiredAmount?.unit).toBe('個');
  });
  ```

  既存の `createItem()` の既定は `status: 'bought'` なので、`updateItemRequiredAmount` が
  `pending` のみを受け付ける Domain 制約（本計画の Domain 変更）に合わせ、このテストでは
  `status: 'pending'` を明示的に上書きする。

- 完了条件:
  - 追加テストが通過し、`requiredAmountValue`/`requiredAmountUnit` 列が upsert 後も正しく
    復元されることを検証する（R-5 の検出目的）。既存 13 ケースは無改変で通過する。
  - もしこのテストが失敗した場合（`onConflictDoUpdate.set` に該当列が無い等）は、
    `drizzle-shopping-list.repository.ts` の `set` 句を拡張する対応が必要になる。**事前確認済み
    （L106-107 に両列が含まれている）のため、通常はテスト追加のみで完了する想定。**

### `apps/web/src/app/shopping-lists/_utils/shopping-list-view.ts`

- 変更内容: ファイル末尾（`formatShoppingDate` の後）に以下を追加する。

  ```ts
  export interface SyncDiff {
    addedCount: number;
    removedCount: number;
    updatedCount: number;
  }

  function isSameRequiredAmount(
    a: { value: number; unit: string } | null,
    b: { value: number; unit: string } | null,
  ): boolean {
    if (a === null || b === null) return a === b;
    return a.value === b.value && a.unit === b.unit;
  }

  // 同期前後の items を品目 ID で比較し、追加・削除・数量更新の件数を算出する（P-6）。
  // サーバーはこれらの件数を返さないため、クライアント側でこの差分計算を担う。
  export function diffSyncResult(before: ShoppingItemDto[], after: ShoppingItemDto[]): SyncDiff {
    const beforeById = new Map(before.map((item) => [item.id, item]));
    const afterIds = new Set(after.map((item) => item.id));

    let addedCount = 0;
    let updatedCount = 0;
    for (const item of after) {
      const prior = beforeById.get(item.id);
      if (prior === undefined) {
        addedCount += 1;
        continue;
      }
      if (!isSameRequiredAmount(prior.requiredAmount, item.requiredAmount)) {
        updatedCount += 1;
      }
    }
    const removedCount = before.filter((item) => !afterIds.has(item.id)).length;

    return { addedCount, removedCount, updatedCount };
  }

  export function describeSyncResult({ addedCount, removedCount, updatedCount }: SyncDiff): string {
    if (addedCount === 0 && removedCount === 0 && updatedCount === 0) {
      return '変更はありませんでした';
    }
    const parts: string[] = [];
    if (addedCount > 0) parts.push(`追加${addedCount}件`);
    if (updatedCount > 0) parts.push(`更新${updatedCount}件`);
    if (removedCount > 0) parts.push(`削除${removedCount}件`);
    return parts.join('・');
  }
  ```

  `ShoppingItemDto` は既にファイル先頭で `import type { ShoppingItemDto, StoreDto } from
'@cookpt/application';` の形で import 済みのため追加 import は不要。

- 完了条件:
  - `diffSyncResult`/`describeSyncResult`/`isSameRequiredAmount` が追加され、既存の
    `buildStoreNameMap`/`groupItemsByStore`/`describeRemoveConfirmation`/`formatShoppingDate`
    は無変更。
  - `describeSyncResult` は「追加・更新・削除がすべて 0」のとき `'変更はありませんでした'`、
    それ以外は `'追加N件・更新N件・削除N件'` の該当する部分だけを `・` で連結した文字列を返す。

### `apps/web/tests/app/shopping-lists/_utils/shopping-list-view.node.test.ts`

- 変更内容: 既存の `describe('describeRemoveConfirmation', ...)` の後に、新しい
  `describe('diffSyncResult', ...)` と `describe('describeSyncResult', ...)` を追加する。

  | テスト ID | ケース                                                                             |
  | --------- | ---------------------------------------------------------------------------------- |
  | SD-01     | 追加のみ: `before` に無い id が `after` にある → `addedCount` のみ加算             |
  | SD-02     | 削除のみ: `before` にある id が `after` に無い → `removedCount` のみ加算           |
  | SD-03     | 数量更新のみ: 同じ id で `requiredAmount.value` が変わる → `updatedCount` のみ加算 |
  | SD-04     | 単位のみ変わるケースも更新扱い（`isSameRequiredAmount` が unit も見る）            |
  | SD-05     | `requiredAmount` が `null` → `{value,unit}` へ変わる／逆方向も更新扱い             |
  | SD-06     | 複合: 追加・更新・削除が同時に起きる                                               |
  | SD-07     | 変化なし: 同じ id・同じ `requiredAmount` → 3 カウントとも 0                        |
  | SD-08     | 空配列同士 → 3 カウントとも 0                                                      |
  | DS-01     | `describeSyncResult({0,0,0})` → `'変更はありませんでした'`                         |
  | DS-02     | 追加のみ → `'追加2件'`                                                             |
  | DS-03     | 追加・更新・削除混在 → `'追加1件・更新1件・削除1件'`（順序固定）                   |

- 完了条件: SD-01〜SD-08, DS-01〜DS-03 が追加され、既存の `buildStoreNameMap`/
  `groupItemsByStore`/`formatShoppingDate`/`describeRemoveConfirmation` のテストは無改変で
  通過する。

### `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`

- 変更内容: `handleSync` の `onSuccess` を以下に置き換える。

  ```ts
  async function handleSync(): Promise<void> {
    setSyncMessage(null);
    await syncAction.run(
      () => client.api['shopping-lists'][':id'].sync.$post({ param: { id: shoppingList.id } }),
      {
        onSuccess: (dto) => {
          const diff = diffSyncResult(items, dto.items);
          setItems(dto.items);
          setSyncMessage(describeSyncResult(diff));
        },
      },
    );
  }
  ```

  `diffSyncResult`/`describeSyncResult` を `../_utils/shopping-list-view` の既存 import 文
  （`describeRemoveConfirmation, formatShoppingDate, groupItemsByStore`）に追記する。
  `diffSyncResult(items, dto.items)` の `items` は同期前のクライアント state（`optimisticItems`
  ではない。設計書「フロントエンド設計」節どおり）。

- 完了条件:
  - `handleSync` が `dto.items.length - items.length` による差分計算を使わない。
  - 削除された品目が `setItems(dto.items)` により一覧から自然に消える（この副作用は既存の
    `groupItemsByStore(optimisticItems, stores)` 描画がそのまま処理するため、追加改修不要）。
  - ボタン文言（「献立の変更を反映」）・トリガ（明示ボタンのみ）は変更しない。

### `apps/web/tests/app/shopping-lists/_components/shopping-list-client.sync.test.tsx`

- 変更内容:
  1. 既存 SY-02（「追加が無いとき『追加する材料はありませんでした』を表示する」）の期待文言を
     `describeSyncResult` の no-op 文言に合わせて `'変更はありませんでした'` に変更する
     （テスト名・シナリオ自体は変更しない。文言のみ更新。破壊的変更ではなく新しい仕様への追随）。
  2. 以下のケースを追加する。

     | テスト ID | シナリオ                                                       | 検証                                                                                       |
     | --------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
     | SY-04     | 削除のみ: レスポンスの `dto.items` に既存品目が含まれない      | `'削除1件'` を表示。一覧から該当行が消える                                                 |
     | SY-05     | 数量更新のみ: レスポンスの同一 id の `requiredAmount` が変わる | `'更新1件'` を表示                                                                         |
     | SY-06     | 複合: 追加・更新・削除が同時に発生                             | `'追加1件・更新1件・削除1件'` を表示（`diffSyncResult`/`describeSyncResult` の順序と一致） |

     `createShoppingItemDto`/`createShoppingListDto`（`shopping-list-test-fixtures.ts`、既存の
     `requiredAmount: { value: 1, unit: '本' }` 既定値を持つ）を使い、`postSync.mockResolvedValue`
     のレスポンス `items` を変えるだけでケースを組める（既存 SY-01 と同じパターン）。
- 完了条件:
  - SY-01〜SY-06 がすべて通過する（SY-01/SY-03 は無改変、SY-02 は文言更新、SY-04〜SY-06 が新規）。

### `docs/04-domain-model.md`

- 変更内容: `### ShoppingList 集約` 節（既存の「実装追記」パラグラフが並ぶ箇所、L505-525）の
  末尾に、ADR-0011/ADR-0009 の実装追記と同じ書式で以下を追記する。

  > 実装追記（2026-08-13, `docs/designs/meal-plan-sync.md` / ADR-0018）: `ShoppingItem` に
  > `updateRequiredAmount(amount)`（`pending` かつ `requiredAmount !== null` の品目のみ許可。
  > それ以外は `Error`）を追加した。`ShoppingList` にも `assertActive` ガード付きの薄いラッパー
  > `updateItemRequiredAmount(itemId, amount)` を追加している。`SyncShoppingListFromMealPlanUseCase`
  > はこれを使い、献立集計と一致しない `from_meal_plan`×`pending` の既存品目を削除
  > （既存の `removeItem`）し、集計値が変わった同種品目の数量を上書きするようになった
  > （`bought`・`manually_added`・amountNote 品目は対象外）。ADR-0007 の「既存品目は一切変更・
  > 削除しない」という決定を ADR-0018 が塗り替えた点であり、ADR-0007 自体は破棄されていない
  > （明示トリガ・マッチキーは維持）。正典は `packages/domain/src/shopping-list/shopping-list.ts`
  > と `docs/designs/meal-plan-sync.md`。

- 完了条件: 追記が既存の実装追記ブロックと同じ書式（見出し無し・`>` 引用・日付と出典を先頭に
  明記）で追加され、既存の記述（S-1〜S-11 の要約リスト、他の実装追記ブロック）を変更しない。

### `docs/05-roadmap.md`

- 変更内容: L790（Sprint 10 ユニット一覧の Unit A 行）の「状態」列を更新する。

  - 実装着手時: `**Gate A 確定**（2026-08-13・推奨案を採用）。要件・設計着手中` →
    `**Gate A 確定**（2026-08-13）。設計・実装計画確定。実装中`
  - 実装・品質ゲート完了後（本計画の Step 6 完了後）: `**完了**（PR #<番号>）` に更新する
    （PR 番号は実装 PR 作成後に判明するため、本計画の時点ではプレースホルダのまま残し、
    実装完了時に implementer が確定させる）。

- 完了条件: Unit A 行の状態列が現在の進捗を正しく反映している。他ユニット（Unit B/C・サイド）の
  行・記述には触れない。

## 実装手順

1. **Domain メソッド追加**（対象: `packages/domain/src/shopping-list/shopping-list.ts`,
   `packages/domain/tests/shopping-list/shopping-list.test.ts`）
   - 変更内容: 上記「ファイルごとの変更内容」の該当節どおり。
   - 完了条件: `pnpm --filter @cookpit/domain test` と `pnpm --filter @cookpit/domain type-check`
     が通る。
2. **Application UseCase 拡張**（対象: `sync-shopping-list-from-meal-plan.use-case.ts`,
   `test-helpers.ts`, `sync-shopping-list-from-meal-plan.use-case.test.ts`）
   - 順序: (a) `test-helpers.ts` の `SeededItemOptions` 拡張 → (b) UseCase 本体の実装 →
     (c) テストケース追加。テストヘルパーを先に拡張しないと (c) が書けないため。
   - 完了条件: `pnpm --filter @cookpit/application test` と type-check が通る。D-1〜D-4,
     U-1〜U-6, N-1〜N-2 を含む全ケースが通過し、既存 6 ケースが回帰なく通る。
3. **Infrastructure 回帰テスト**（対象:
   `packages/infrastructure/tests/repositories/drizzle-shopping-list.repository.test.ts`）
   - 前提: Step 1 で `ShoppingList.updateItemRequiredAmount` が実装済みであること
     （このテストが呼び出すため）。
   - 完了条件: 追加テストが通過する。**失敗した場合のみ**
     `drizzle-shopping-list.repository.ts` の `onConflictDoUpdate.set` 句を拡張する
     （事前確認により通常は不要と想定）。`pnpm --filter @cookpit/infrastructure test` が通る。
4. **フロントエンド純関数 + `handleSync` 改修**（対象: `shopping-list-view.ts`,
   `shopping-list-view.node.test.ts`, `shopping-list-client.tsx`,
   `shopping-list-client.sync.test.tsx`）
   - 順序: (a) `shopping-list-view.ts` に純関数追加 → (b) 純関数のテスト追加 →
     (c) `shopping-list-client.tsx` の `handleSync` 改修 → (d) コンポーネントテスト更新・追加。
   - 完了条件: `pnpm --filter @cookpit/web test`（dom + node 両プロジェクト）が通る。
5. **ドキュメント更新**（対象: `docs/04-domain-model.md`, `docs/05-roadmap.md`）
   - `docs/designs/meal-plan-sync.md` は既に confirmed のため変更不要。
   - 完了条件: 上記 2 ファイルへの追記が完了している。
6. **品質ゲート**
   - 実行: `pnpm lint` / `pnpm type-check` / `pnpm test`（モノレポ全体。変更 4 パッケージ
     `domain`/`application`/`infrastructure`/`web` を含む）。
   - 完了条件: 3 コマンドすべてエラーなし。スコープ外パッケージのテストにも回帰が無いこと
     （既存テストを壊していないことの確認）。

## 依存関係

```
Step 1（Domain: updateRequiredAmount / updateItemRequiredAmount）
  └─→ Step 2（Application: UseCase が Step 1 のメソッドを呼ぶ）
        └─→ Step 3（Infrastructure 回帰テスト: Step 1 のメソッドで更新した集約を save する）
  └─→ Step 4（Presentation: Step 2 のレスポンス形は変わらないため Step 2 と並行可能。
              ただし Step 4 のコンポーネントテスト（SY-04〜06）は Step 2 の UseCase 実装が
              返す `ShoppingListDto` の形を前提にしないため、Step 2 と並行して着手できる）
Step 1〜4 完了後 → Step 5（ドキュメント） → Step 6（品質ゲート）
```

- Step 3 は Step 1 に依存する（`updateItemRequiredAmount` が無いとテストが書けない）。
  Step 2 の完了を待つ必要はない（UseCase を経由せず `ShoppingList` を直接操作するテストのため）。
- Step 4 は Step 1・2 と並行着手可能（フロントエンドは `ShoppingItemDto`/`ShoppingListDto`
  という既存の契約のみに依存し、契約は変更しない。P-6）。ただし実装完了の確認
  （E2E 的な手動確認や統合テスト）は Step 2 完了後に行う。
- Step 5（ドキュメント）は Step 1〜4 の実装内容を記述するため、それらの完了後に行う。
- Step 6（品質ゲート）は最後。

## テスト計画

`docs/tests/meal-plan-sync.md` は未作成（test-designer 未起動）。本計画のテストケースは
設計書 `docs/designs/meal-plan-sync.md` §テスト方針と要件定義書の N-1〜N-9/E-1〜E-7/B-1〜B-6 を
直接根拠とする。配置先は vitest の `include` 設定と突き合わせ済み（すべて既存ファイルへの
追記であり、新規ファイル作成は無い）。

| パッケージ/対象                  | ファイル                                                                                      | vitest include                                                            | 追加内容                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `@cookpit/domain`                | `packages/domain/tests/shopping-list/shopping-list.test.ts`                                   | `packages/domain/vitest.config.ts`（baseConfig。`tests/**` 配下をミラー） | `updateRequiredAmount`/`updateItemRequiredAmount` の正常系・異常系 6 ケース |
| `@cookpit/application`           | `packages/application/tests/shopping-list/sync-shopping-list-from-meal-plan.use-case.test.ts` | `packages/application/vitest.config.ts`（baseConfig）                     | D-1〜D-4, U-1〜U-6, N-1〜N-2（14 ケース）+ 既存 6 ケースの回帰確認          |
| `@cookpit/application`（helper） | `packages/application/tests/shopping-list/test-helpers.ts`                                    | 同上（テスト対象外・helper ファイル）                                     | `SeededItemOptions` 拡張                                                    |
| `@cookpit/infrastructure`        | `packages/infrastructure/tests/repositories/drizzle-shopping-list.repository.test.ts`         | `packages/infrastructure/vitest.config.ts`（baseConfig。PGlite）          | 数量更新の save/find 往復 1 ケース                                          |
| `apps/web`（node/純関数）        | `apps/web/tests/app/shopping-lists/_utils/shopping-list-view.node.test.ts`                    | `apps/web/vitest.node.config.mts` の `tests/**/*.node.test.ts`            | `diffSyncResult`/`describeSyncResult` 11 ケース（SD-01〜08, DS-01〜03）     |
| `apps/web`（dom/コンポーネント） | `apps/web/tests/app/shopping-lists/_components/shopping-list-client.sync.test.tsx`            | `apps/web/vitest.dom.config.mts` の `tests/**/*.test.tsx`                 | SY-02 文言更新 + SY-04〜06（3 ケース）新規                                  |

**新規ファイルが不要な理由**: 対象の 4 テストファイル（domain/application/infrastructure の
各テストと `shopping-list-view.node.test.ts`・`shopping-list-client.sync.test.tsx`）はいずれも
既に存在し、vitest の `include` パターン（`apps/web` は `*.node.test.ts`/`*.test.tsx` のみが
実行対象で、素の `*.test.ts` は silent skip）に既に合致している。新規ファイルを作ると
命名規則を再確認する手間と二重管理が生じるため、既存ファイルへの追記を優先する
（`create-implementation-plan` Skill 手順4）。

## リスク

設計書 §リスク R-1〜R-5 を実装時の確認項目に落とす。

| #   | リスク                                                                            | 実装時の確認項目                                                                                                                                                         | 対応                                                                                              |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| R-1 | `bought` 品目がキーを占有していると献立側の増分がリストに出ない                   | Step 2 の判定ロジックで `updateCandidates`/`removalCandidates` が `item.status === 'pending'` を必須条件にしていることを確認する                                         | Gate A で受容済み。実装を変えない（テストケース U-4 で「bought は変わらない」ことを確認するのみ） |
| R-2 | 手動削除した `from_meal_plan`×`pending` 品目が再同期で復活する                    | 新しい削除・更新ロジックがこの既存挙動（`removeItem` 後に同キーが集計に残っていれば `newIngredients` に再度乗る）を変えていないか、Step 2 の追加ロジック実装時に確認する | 既存動作のまま。新規テストは追加しない（設計書が「本ユニットで挙動を変更しない」と明記）          |
| R-3 | ShoppingList 保存成功・Pantry 保存失敗の部分失敗窓                                | Step 2 で `save()` 呼び出しの順序・エラーハンドリングを変えていないか（既存どおり `try/catch` を追加しない）ことを確認する                                               | 対応しない（Sprint 10 Unit B の対象）。実装時に新たなトランザクション制御を追加しない             |
| R-4 | 買う量と集計生値の差で、生成時に在庫を引いた品目が再同期で生値へ戻ることがある    | テストケース N-2 は Pantry 空かつ品目が生値のシナリオでのみ冪等性を確認する。A-20 は例外なく完了することのみ確認し、値の不変はアサーションしない                         | 受容。P-6 のため本計画では生値列を足さない。将来課題として残す                                    |
| R-5 | `onConflictDoUpdate.set` が数量列を含まず数量更新が見かけ上成功しリロードで消える | Step 3 の回帰テストが実際に失敗しないか確認する。**事前確認済み（L106-107 に `requiredAmountValue`/`requiredAmountUnit` が含まれている）**                               | 通常は対応不要。テストが失敗した場合のみ `set` 句を拡張する                                       |

## ロールバック方法

ADR-0018 §Rollback に合わせる。

1. `SyncShoppingListFromMealPlanUseCase` を Step 2 以前（追加のみ）の実装に戻す
   （`sync-shopping-list-from-meal-plan.use-case.test.ts` の D-1〜D-4/U-1〜U-6/N-1〜N-2 ケースも
   合わせて削除する）。
2. `ShoppingItem.updateRequiredAmount` / `ShoppingList.updateItemRequiredAmount` を
   `shopping-list.ts` から削除する（`shopping-list.test.ts` の追加ケースも削除する）。
3. `drizzle-shopping-list.repository.test.ts` の回帰テストを削除する
   （Step 3 でコード変更が発生していた場合はその変更も元に戻す）。
4. クライアントの同期メッセージ（`shopping-list-client.tsx` の `handleSync`）を
   `dto.items.length - items.length` ベースの実装に戻し、`shopping-list-view.ts` から
   `diffSyncResult`/`describeSyncResult`/`isSameRequiredAmount`/`SyncDiff` を削除する
   （関連テストも削除する）。
5. `test-helpers.ts` の `SeededItemOptions` 拡張は、Step 2 のテストケースを削除した後であれば
   使用箇所が無くなるため合わせて削除してよい（残しても既存呼び出しに影響しないため必須ではない）。
6. `docs/04-domain-model.md` の実装追記ブロックと `docs/05-roadmap.md` の状態列更新を戻す。

既存の生成・チェック・手動削除ロジックは無関係なため、上記の追加分の除去のみで元の状態に戻る
（ADR-0018 の記述どおり）。DB マイグレーションは発生していないためスキーマロールバックは不要。

## ドキュメント更新対象

- `docs/04-domain-model.md`: ShoppingList 集約節に実装追記を追加する（上記「ファイルごとの
  変更内容」参照）。**ドメインモデル変更を含むため、実装完了後に `ShoppingItem`/`ShoppingList`
  のメソッド一覧（要約リスト L495-503 も含む）が実装と一致しているかを確認する**
  （`updateRequiredAmount`/`updateItemRequiredAmount` が更新系操作の一覧に暗黙的に含まれる
  ことを確認する。既存の要約リストは「addItem / markAsBought / reassignStore / markAsSkipped /
  complete」のみを明示列挙しているため、新規メソッドをこのリストに追記するか、実装追記の
  パラグラフのみで足りるかは、既存の `check`/`uncheck`/`removeItem` の扱い（要約リストに追記
  されず、実装追記パラグラフのみで記録されている）に揃える。すなわち要約リスト自体は変更せず、
  実装追記パラグラフのみを追加する）。
- `docs/05-roadmap.md`: Sprint 10 Unit A の状態列を更新する（上記「ファイルごとの変更内容」参照）。
- `docs/designs/meal-plan-sync.md`: 変更不要（confirmed のまま。設計からの逸脱が実装中に必要に
  なった場合のみ、Orchestrator 経由で architecture-designer へ差し戻し、この設計書を更新する）。
- `docs/requirements/meal-plan-sync.md`: 変更不要。
- `docs/decisions/ADR-0018-meal-plan-sync-delete-and-quantity.md`: 変更不要（Status は
  `Accepted` のまま。実装が ADR の決定と一致することを Step 6 の完了確認で確かめる）。
