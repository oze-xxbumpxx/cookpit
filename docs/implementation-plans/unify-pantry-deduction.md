# 実装計画: unify-pantry-deduction

- 前提となる設計書: `docs/designs/unify-pantry-deduction.md`
- レベル: L2
- 実装ルート: Orchestrator（implementer）
- 判断理由: 既定どおり。`packages/application` 内部のロジック修正（バグ修正）で、
  `docs/06-ai-tools.md` の Codex 委譲基準「仕様・設計が確定済みで定型・ボイラープレート比重が高い」に
  当たらない（分岐の意味変更を伴う実装判断が残るため）。既定の Orchestrator / implementer を使う。

## 変更対象ファイル

| path                                                                                   | なぜ変えるか                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/application/src/shopping-list/sync-shopping-list-diff.ts`                    | `applyQuantityUpdate`（買う量基準の delta 計算。バグの原因）を `reconcileItemDeduction`（sunk 分基準の `additionalNeeded` 計算）に置き換える。`previousGrossRequiredAmount` ヘルパーを追加する。 |
| `packages/application/src/shopping-list/sync-shopping-list-from-meal-plan.use-case.ts` | `updateCandidates` の「変更あり」判定を買う量基準から `previousGrossRequiredAmount` 基準に修正し、呼び出しを `applyQuantityUpdate` → `reconcileItemDeduction` に変更する。                       |

`packages/application/src/shopping-list/ingredient-aggregation.ts`
（`applyPantryDeduction` 本体）・`packages/application/src/shopping-list/generate-shopping-list.use-case.ts`
は設計書どおりコード変更なし（対象範囲に列挙されているが変更内容はゼロ）。

## 新規作成ファイル

| path                                                                       | 役割                                                                                                                                                                                                             |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/application/tests/shopping-list/sync-shopping-list-diff.test.ts` | `previousGrossRequiredAmount` / `reconcileItemDeduction` の単体テスト（分岐ごとの直接検証）。`packages/application` の vitest include（`tests/**/*.test.ts`、`packages/config/vitest/base.cjs`）に合致する配置。 |

## ファイルごとの変更内容

### `packages/application/src/shopping-list/sync-shopping-list-diff.ts`

- 変更内容:
  1. `export function applyQuantityUpdate(...)` を削除し、代わりに以下 2 つを追加する。
     - `export function previousGrossRequiredAmount(item: ShoppingItemType): number`
       — 設計書の実装をそのまま使う（`buy = item.requiredAmount?.value ?? 0`、
       `deducted = item.pantryDeductedAmount?.value ?? 0`、`return buy + deducted`）。
     - `export function reconcileItemDeduction(item, aggregatedByKey, pantry): QuantityUpdateResult`
       — 設計書の実装をそのまま使う（`additionalNeeded = newGross.value - prevDeducted`、
       `additionalNeeded <= 0` の 2 分岐、`applyPantryDeduction` を 1 回だけ呼ぶ分岐、
       全量まかない・部分引き算・sunk 分の加算 `nextDeducted` の計算を含む）。
  2. `QuantityUpdateResult` 型定義は変更しない（`'none' | 'remove' | 'update'` の判別共用体、
     `pantryDeductedAmount?: Quantity | null` を含む既存の形をそのまま使う）。
  3. `splitDuplicateItems` / `collectNoteUpdates` / `rewriteCoveredIngredients` /
     `matchCoveredKey` は変更しない。
  4. import に `Quantity` は既存のまま使用（`Quantity.of` を `reconcileItemDeduction` 内で呼ぶ）。
     新規の import 追加は不要（`ShoppingItemType` / `Pantry` / `CoveredIngredient` /
     `applyPantryDeduction` / `itemMatchKey` / `ResolvedIngredient` は既存 import のまま使う。
     `ingredientMatchKey` は既存どおり `matchCoveredKey` 用に残す）。
- 完了条件:
  - `applyQuantityUpdate` という識別子がファイル内に存在しない。
  - `previousGrossRequiredAmount` と `reconcileItemDeduction` が `export` されている。
  - `pnpm --filter @cookpit/application type-check` が通る。
  - `packages/application/tests/shopping-list/sync-shopping-list-diff.test.ts`
    （後述のステップ 3）が green。

### `packages/application/src/shopping-list/sync-shopping-list-from-meal-plan.use-case.ts`

- 変更内容:
  1. import 文を変更する。

     ```typescript
     import {
       applyQuantityUpdate,
       collectNoteUpdates,
       rewriteCoveredIngredients,
       splitDuplicateItems,
     } from './sync-shopping-list-diff';
     ```

     を

     ```typescript
     import {
       collectNoteUpdates,
       previousGrossRequiredAmount,
       reconcileItemDeduction,
       rewriteCoveredIngredients,
       splitDuplicateItems,
     } from './sync-shopping-list-diff';
     ```

     に変更する。

  2. `updateCandidates` の filter 内、最後の return 文を変更する。

     ```typescript
     return aggregatedIngredient.requiredAmount.value !== item.requiredAmount.value;
     ```

     を

     ```typescript
     // 生必要量が同じでも、未引き算の pending は Generate と同じフル控除を当てる。
     return true;
     ```

     に変更する（`item.requiredAmount === null` の早期リターンなど、他の filter 内条件は
     変更しない）。`previousGrossRequiredAmount` は候補判定には使わない。

  3. `for (const item of updateCandidates)` ループ内の呼び出しを変更する。

     ```typescript
     const result = applyQuantityUpdate(item, aggregatedByKey, pantry);
     ```

     を

     ```typescript
     const result = reconcileItemDeduction(item, aggregatedByKey, pantry);
     ```

     に変更する。ループ内の以降の分岐（`result.covered` / `result.action === 'remove'` /
     `'update'` / `pantryDeductedAmount` の反映、`shoppingList.removeItem` /
     `updateItemRequiredAmount` / `updateItemPantryDeductedAmount` の呼び出し）は
     変更しない。

  4. `newIngredients` の追加経路・`removalCandidates`・`duplicateItems`・
     `rewriteCoveredIngredients` 呼び出し・保存順（`shoppingListRepository.save` →
     `pantryRepository.save`）・コンストラクタ引数は変更しない。
- 完了条件:
  - `applyQuantityUpdate` という識別子がファイル内に存在しない。
  - `updateCandidates` フィルタが数量のある from_meal_plan pending をすべて対象にする（`return true`）。
  - `pnpm --filter @cookpit/application type-check` が通る。
  - 既存の `packages/application/tests/shopping-list/sync-shopping-list-from-meal-plan.use-case.test.ts`
    が green（テスト方針 A: 値が変わらないケース。テスト方針 B: R-4 テストの強化は
    ステップ 5 で行う）。

## 実装手順

1. **`applyQuantityUpdate` の参照確認（削除前チェック）** … 対象ファイル:
   リポジトリ全体（Grep）。変更内容: `applyQuantityUpdate` を Grep し、
   `packages/application/src/shopping-list/sync-shopping-list-diff.ts` と
   `sync-shopping-list-from-meal-plan.use-case.ts` の 2 箇所以外に参照が無いことを確認する
   （`packages/application/src/shopping-list/index.ts` は `sync-shopping-list-diff` を
   re-export していないため、パッケージ外からの参照は無い想定）。
   完了条件: Grep 結果がこの 2 ファイルのみであることを確認済み（想定外の参照があれば
   実装を止めて Orchestrator へ報告する）。

2. **`sync-shopping-list-diff.ts` の置き換え** … 対象ファイル:
   `packages/application/src/shopping-list/sync-shopping-list-diff.ts`。変更内容:
   上記「ファイルごとの変更内容」の通り、`applyQuantityUpdate` を削除し
   `previousGrossRequiredAmount` / `reconcileItemDeduction` を追加する。
   完了条件: `pnpm --filter @cookpit/application type-check` が通る
   （呼び出し元の use-case ファイルはまだ古い名前を参照しているため、この時点では
   use-case 側の型エラーが出る。ステップ 3 とセットで解消される前提でよい。
   両ファイルを続けて変更してから type-check を回す運用でも可）。

3. **`sync-shopping-list-from-meal-plan.use-case.ts` の呼び出し切り替え** … 対象ファイル:
   `packages/application/src/shopping-list/sync-shopping-list-from-meal-plan.use-case.ts`。
   変更内容: 上記「ファイルごとの変更内容」の通り、import・`updateCandidates` の判定式・
   ループ内の呼び出しを変更する。
   完了条件: `pnpm --filter @cookpit/application type-check` が通る。

4. **既存テストの回帰確認（先に green を確認してから新規テストを追加する）** … 対象ファイル:
   `packages/application/tests/shopping-list/sync-shopping-list-from-meal-plan.use-case.test.ts`
   （テストコード自体は変更しない。実行のみ）。変更内容: なし（実行して既存アサーションが
   通ることを確認する）。
   完了条件: `pnpm --filter @cookpit/application test` で
   `sync-shopping-list-from-meal-plan.use-case.test.ts` の全テストが green
   （設計書「テスト方針 A」の分類どおり、既存ケースの期待値は変えずに通る想定）。
   もし green にならない場合は実装（ステップ 2・3）を見直す。既存テストの期待値を
   変更してはならない（変更が必要に見える場合は実装ミスの可能性が高いので、
   まず実装を再確認し、それでも解決しない場合は Orchestrator に相談する）。

5. **`sync-shopping-list-from-meal-plan.use-case.test.ts` に典型1・典型2・決定6・
   Generate/Sync 一致テストを追加** … 対象ファイル:
   `packages/application/tests/shopping-list/sync-shopping-list-from-meal-plan.use-case.test.ts`。
   変更内容: 既存の `describe('SyncShoppingListFromMealPlanUseCase', ...)` 内に、
   設計書「テスト方針」節の新規テスト 1〜5 を `it(...)` として追加する
   （既存の `import` 群・`seededItem` などのフィクスチャをそのまま使う。
   `GenerateShoppingListUseCase` を使うケースは新規に import を追加する）。

   - 5-1. 典型1（既存 pending が増加後の生必要量を pantry が全量カバー）:
     `seededItem()`（買う量 2、`pantryDeductedAmount: null`）を seed、
     `seededPlannedRecipe('planned-1', RECIPE_ID, 2)`（スケール後生必要量 4）、
     `pantryRepository.seedStock(stockInput(PRODUCT_ID, 5, '個'))`。
     期待: `dto.items` に対象品目が無い、`dto.coveredIngredients` に
     `{ displayName: '玉ねぎ', productId: PRODUCT_ID, requiredAmount: { value: 4, unit: '個' }, coveredAmount: { value: 4, unit: '個' } }`
     が含まれる、`pantryRepository.saveCount === 1`。
   - 5-2. 典型2（Generate 直後の部分引き算ありの品目が、献立不変の再同期で真の no-op になる）:
     `seededItem({ requiredAmount: Quantity.of(3, '個'), pantryDeductedAmount: Quantity.of(2, '個') })`
     を seed（生必要量 5・pantry 2 で買う量 3 になった状態を直接 fixture で表現する。
     Generate を実際に呼ぶ 2 段構成にする場合は pantry を空にしてから Sync を呼ぶ）。
     `seededPlannedRecipe('planned-1', RECIPE_ID)`・`amountIngredient('玉ねぎ', 5, '個', PRODUCT_ID)`
     でスケール後生必要量が 5 になるようにする。pantry は空（Stock 無し）。
     期待: `shoppingListRepository.saveCount === 0`、`pantryRepository.saveCount === 0`、
     `dto.items[0].requiredAmount === { value: 3, unit: '個' }`、
     `dto.items[0].pantryDeductedAmount === { value: 2, unit: '個' }`（変わらない）。
   - 5-3. 決定6（数量減少で sunk 分だけで covered になる）:
     `seededItem({ requiredAmount: Quantity.of(3, '個'), pantryDeductedAmount: Quantity.of(2, '個') })`
     を seed。献立変更で生必要量が 2 に減る（例: `amountIngredient('玉ねぎ', 2, '個', PRODUCT_ID)`、
     `scaleFactor: 1`）。pantry は空。
     期待: 対象品目が `dto.items` に無い、`dto.coveredIngredients` に
     `{ requiredAmount: { value: 2, unit: '個' }, coveredAmount: { value: 2, unit: '個' } }` を含む、
     `pantryRepository.saveCount === 0`。
   - 5-4. 決定6の否定側（減少しても sunk 分だけでは足りない）:
     同じ seed（買う量 3・`pantryDeductedAmount: 2`）。献立変更で生必要量が 4 に減る。
     pantry は空。
     期待: `dto.items[0].requiredAmount === { value: 2, unit: '個' }`（4-2）、
     `dto.items[0].pantryDeductedAmount === { value: 2, unit: '個' }`（変わらず）、
     `pantryRepository.saveCount === 0`。
   - 5-5. **Generate vs Sync 一致（Done 条件の直接検証。空リストへの Sync だけでは不足のため
     既存 pending 行がある状態からの Sync も含める）**:
     a. 空リストケース: 同一 `MealPlan`・同一 `Pantry` から
     (a) `GenerateShoppingListUseCase.execute()` の結果と (b) 空の
     `ShoppingList`（`seededShoppingList('active', [], [])`）に対する
     `SyncShoppingListFromMealPlanUseCase.execute()` の結果を比較し、
     `items`（`displayName` / `requiredAmount` / `pantryDeductedAmount`）と
     `coveredIngredients` が一致することを検証する（全量まかない・部分引き算・
     在庫なし の 3 パターンを Pantry の Stock 量を変えて実施）。
     b. **既存 from_meal_plan pending 行がある状態からの Sync ケース（必須）**:
     まず `GenerateShoppingListUseCase` を実行して結果の `ShoppingList` を得る
     （これが「既存 pending 行がある状態」）。同じ `MealPlan`（未変更）・同じ
     `PantryRepository`（Generate 後の消費済み状態）に対し、続けて
     `SyncShoppingListFromMealPlanUseCase.execute()` を実行し、返る `dto` が
     Generate 直後の `dto` と（`items` の `requiredAmount` / `pantryDeductedAmount`、
     `coveredIngredients`）完全一致することを検証する。加えて
     `shoppingListRepository.saveCount` と `pantryRepository.saveCount` が
     Generate 実行直後の値から増えないこと（= 真の no-op）を検証する。
     このケースが「典型2」の一般化であり、Done 条件の「同じ献立+pantry で
     generate vs sync が一致」を空リスト経路だけでなく確認する。
     完了条件:
   - 上記 5-1〜5-5 の `it(...)` が全て green。
   - `pnpm --filter @cookpit/application test` で当該テストファイルが green。

6. **`sync-shopping-list-diff.test.ts` の新規作成** … 対象ファイル（新規）:
   `packages/application/tests/shopping-list/sync-shopping-list-diff.test.ts`。
   変更内容: `previousGrossRequiredAmount` と `reconcileItemDeduction` を直接 import し、
   `ShoppingItem.reconstruct` / `Pantry.create()` + `addStock` で最小限のフィクスチャを
   組み立てて（既存の `test-helpers.ts` の `seededItem` / `stockInput` /
   `InMemoryPantryRepository` 相当の組み立て方を流用してよい。新規ヘルパーが必要なら
   このファイル内 local helper として定義し、`test-helpers.ts` を変更しない）、
   設計書「単体テストの追加提案」節の分岐を関数単体で検証する。

   - `previousGrossRequiredAmount`: 買う量のみ（`pantryDeductedAmount: null`）／
     買う量+sunk分（`pantryDeductedAmount` 非 null）の両方を正しく合算することを検証。
   - `reconcileItemDeduction`:
     - 増加・pantry 不足なし → `action: 'remove'` + `covered` が非 null。
     - 増加・pantry 部分 → `action: 'update'` + `pantryDeductedAmount` が
       `prevDeducted + newlyDeducted` に加算されている。
     - 増加・pantry なし → `action: 'update'`、`pantryDeductedAmount` は
       sunk 分のまま（変わらない）。
     - 減少・sunk 分で足りる → `action: 'remove'` + `covered`、`consumed: false`。
     - 減少・sunk 分で足りない → `action: 'update'`、`consumed` は
       `additionalNeeded` に対する `applyPantryDeduction` の結果次第
       （pantry に在庫があれば `true`、無ければ `false`）。
     - `item.productId === null`（P-2 対象外）→ 常に受け取った量そのままの `'update'`、
       pantry 不変（`consumed: false`）。
       完了条件:
   - 上記 7 ケース（`previousGrossRequiredAmount` 2 ケース + `reconcileItemDeduction` 6 ケース）
     が `it(...)` として存在し、全て green。
   - `pnpm --filter @cookpit/application test` にこのファイルが含まれて実行される
     （`tests/shopping-list/*.test.ts` の既存 include パターンに合致するため追加設定不要）。

7. **品質ゲート** … 対象ファイル: なし（コマンド実行のみ）。変更内容:
   `pnpm lint` / `pnpm type-check` / `pnpm test`
   （`packages/application` に絞ってよい。`packages/domain` はコード変更が無いため、
   domain のテストは回帰確認目的で 1 回実行すれば十分）。
   完了条件: 3 コマンドすべてが 0 exit code。

8. **ドキュメント更新** … 対象ファイル: `docs/designs/unify-pantry-deduction.md`、
   `docs/designs/meal-plan-sync.md`（任意）。変更内容:
   - `docs/designs/unify-pantry-deduction.md` の frontmatter `ステータス: draft` を
     `ステータス: confirmed` に変更する（実装完了後）。
   - `docs/designs/meal-plan-sync.md` の R-4 行（573〜574 行付近の表）に
     「`unify-pantry-deduction` で解消（sunk 分を基準にした変更判定に修正）」という
     参照を追記することは**任意**（設計書「テスト方針 B」および Orchestrator 補足の
     とおり、やらなくても本タスクは完了とみなす。追記する場合は R-4 行の説明・対策列の
     どちらかに 1 文追加する形でよく、既存の記述を削除しない）。
     完了条件: `docs/designs/unify-pantry-deduction.md` のステータスが `confirmed` に
     なっている（必須）。`meal-plan-sync.md` への追記は行った場合のみ確認対象（任意）。

## 依存関係

- ステップ 1（Grep 確認）→ ステップ 2・3（実装）: 参照漏れが無いことを先に確認してから
  安全に `applyQuantityUpdate` を削除する。
- ステップ 2 と 3 は同じ変更セット内の対（`sync-shopping-list-diff.ts` の関数名変更と
  `sync-shopping-list-from-meal-plan.use-case.ts` の呼び出し変更）。型エラーを避けるため
  実質的に同時に完了させる（type-check は両方終わった後に回せば良い）。
- ステップ 4（既存テスト回帰）はステップ 2・3 の直後、ステップ 5・6（新規テスト追加）より
  **先に**行う（設計書のリスク緩和方針: 既存テストを壊さないことを先に確認してから
  新規テストを追加する）。
- ステップ 5・6 は互立（どちらを先にやっても良いが、両方ステップ 4 の後）。
- ステップ 7（品質ゲート）はステップ 2〜6 完了後。
- ステップ 8（ドキュメント更新）はステップ 7（品質ゲート green）の後、実装完了確認として
  最後に行う。

パッケージ間の依存: 本タスクは `packages/application` 内部のみで、
`packages/domain` / `apps/web` / API 契約への依存・影響は無い（設計書「対象範囲」「対象外」節）。

## テスト計画

（`docs/tests/unify-pantry-deduction.md` は本タスクでは作成しない。試験計画は
設計書「テスト方針」節を正典とし、本節はテストファイルへの対応のみ示す。）

| テストファイル                                                                                | 内容                                                                                                                                     | 種別                                                                                            |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `packages/application/tests/shopping-list/sync-shopping-list-from-meal-plan.use-case.test.ts` | 既存ケース（回帰・値不変を確認）+ 新規: 典型1・典型2・決定6・決定6 否定側・Generate/Sync 一致（空リスト + 既存 pending 行ありの 2 系統） | 結合テスト（`SyncShoppingListFromMealPlanUseCase` / 一部 `GenerateShoppingListUseCase` を通す） |
| `packages/application/tests/shopping-list/sync-shopping-list-diff.test.ts`（新規）            | `previousGrossRequiredAmount` / `reconcileItemDeduction` の分岐単体（7 ケース）                                                          | 単体テスト                                                                                      |
| `packages/application/tests/shopping-list/generate-shopping-list.use-case.test.ts`            | 変更しない。回帰確認のみ（`GenerateShoppingListUseCase` はコード変更なし）                                                               | 既存（変更なし）                                                                                |

いずれも `packages/application` の vitest include（`tests/**/*.test.ts`、
`packages/config/vitest/base.cjs` 7 行目）に合致する配置。apps/web の
silent skip 問題（`*.node.test.ts` 等の命名規約）は application パッケージには適用されない
（`tests/**/*.test.ts` のみの単純な include）。

## リスク

| リスク                                                                                        | 緩和                                                                                                                                         |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `reconcileItemDeduction` の分岐（増加/減少/covered/productId null）の実装漏れ                 | ステップ 6 の単体テスト（`sync-shopping-list-diff.test.ts` 新設）で分岐ごとに直接検証する                                                    |
| 既存テストの「値が変わらない」判定が実装時に誤って値変更を要求してしまう                      | ステップ 4 で既存テストが green のまま通ることを確認してから、ステップ 5・6 で新規テストを追加する順を守る（既存テストの期待値は変更しない） |
| `applyQuantityUpdate` の参照漏れ（他パッケージ・他ファイルからの想定外 import）               | ステップ 1 の Grep 確認で事前に検出する。見つかった場合は実装を止めて Orchestrator に報告する                                                |
| `docs/designs/meal-plan-sync.md` の R-4/P-7 記述が本実装後の挙動と食い違って見える            | ステップ 8 で任意の追記を用意している（必須ではない）。追記しない場合でも                                                                    |
| `docs/designs/unify-pantry-deduction.md` の「関連」節が食い違いの説明を既に持つため実害はない |

## ロールバック方法

本タスクは 2 ファイルの内部ロジック修正のみで、DB マイグレーション・API 契約変更・
新規依存パッケージを含まない。問題が発覚した場合:

1. `packages/application/src/shopping-list/sync-shopping-list-diff.ts` と
   `sync-shopping-list-from-meal-plan.use-case.ts` を変更前のコミットに `git revert`
   （または対象コミットのみを取り消す）すれば、`applyQuantityUpdate` ベースの旧実装に戻る。
2. 新規テストファイル（`sync-shopping-list-diff.test.ts`）とステップ 5 で追加した
   `it(...)` ケースは、旧実装に戻す場合は失敗する（旧実装の delta バグを検出するテストの
   ため）ので、ロールバック時は該当テストも同じコミットで一緒に戻す。
3. 既存データ（`pantry_deducted_amount_*` / `covered_ingredients` カラムの既存値）に対する
   backfill は元々不要（設計書「移行とリリース」節）なため、ロールバックに伴うデータ復旧作業は無い。

## ドキュメント更新対象

- `docs/designs/unify-pantry-deduction.md` — ステータスを `draft` → `confirmed` に変更する
  （ステップ 8。必須）。
- `docs/designs/meal-plan-sync.md` — R-4 行への「`unify-pantry-deduction` で解消」の
  参照追記（任意。ステップ 8）。
- `docs/04-domain-model.md` — 確認対象。本タスクは Domain 層（`Pantry` / `Quantity` /
  `ShoppingList` / `CoveredIngredient` のエンティティ定義・メソッド）に変更を加えないため、
  `docs/04-domain-model.md` の該当エンティティ定義は実装後も一致したまま（更新不要）。
  Application 層のみの変更であることを実装完了時に再確認する。
- 対象外: `apps/web` の画面ドキュメント・API 契約ドキュメント（DTO/API 形が不変のため）。
