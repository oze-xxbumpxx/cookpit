# 試験計画: unify-pantry-deduction

- 前提となる設計書: `docs/designs/unify-pantry-deduction.md`
- レベル: L2
- 対象パッケージ: `packages/application`（`vitest.config.ts` → `@cookpit/config/vitest/base` の
  `include: ['tests/**/*.test.ts']`。projects 分割なし。ファイル名は `tests/shopping-list/*.test.ts`
  であれば実行される）

## 試験種別

- **単体**: `sync-shopping-list-diff.ts` の `previousGrossRequiredAmount`（新規）・
  `reconcileItemDeduction`（`applyQuantityUpdate` の置換）・既存 3 関数（`splitDuplicateItems` /
  `collectNoteUpdates` / `rewriteCoveredIngredients`、いずれもロジック変更なしの回帰確認）を
  新規ファイル `sync-shopping-list-diff.test.ts` で関数単体テストする。
- **結合**: `SyncShoppingListFromMealPlanUseCase.execute` / `GenerateShoppingListUseCase.execute`
  を既存 `InMemory*Repository` フィクスチャ（`test-helpers.ts`）で結合テストする。
  `ingredient-aggregation.ts`（コード変更なし）は Generate 側の既存テスト群と、Sync 側の新規テストで
  間接的に回帰確認する（`applyPantryDeduction` 自体の専用単体テストは既存の
  `generate-shopping-list.use-case.test.ts` が実質的にカバーしており、本タスクでは追加しない）。

## 単体試験観点（`sync-shopping-list-diff.test.ts` 新規）

| #    | 観点                                                                                                                                      | 前提                                                                                                                                                                                                                                                     | 操作                                                                 | 期待結果                                                                                                                                                                                                                                                                                                                                                                     | 分類             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| U-1  | `previousGrossRequiredAmount`: sunk 分なし                                                                                                | `item.requiredAmount = {value:2}`、`pantryDeductedAmount: null`                                                                                                                                                                                          | `previousGrossRequiredAmount(item)` を呼ぶ                           | `2`（買う量のみ）                                                                                                                                                                                                                                                                                                                                                            | 正常系           |
| U-2  | `previousGrossRequiredAmount`: sunk 分あり                                                                                                | `item.requiredAmount = {value:3}`、`pantryDeductedAmount: {value:2}`                                                                                                                                                                                     | 同上                                                                 | `5`（買う量+sunk分の合算）                                                                                                                                                                                                                                                                                                                                                   | 正常系           |
| U-3  | `reconcileItemDeduction`: 増加・pantry 十分（全量まかない）                                                                               | `item` 買う量 2・sunk `null`、`aggregatedByKey` に生必要量 4、`pantry` に該当 product 5個                                                                                                                                                                | `reconcileItemDeduction(item, aggregatedByKey, pantry)`              | `action:'remove'`、`covered:{requiredAmount:{value:4}, coveredAmount:{value:4}}`、`consumed:true`                                                                                                                                                                                                                                                                            | 正常系           |
| U-4  | `reconcileItemDeduction`: 増加・pantry 部分                                                                                               | 買う量 2・sunk `null`、生必要量 4、pantry 1個                                                                                                                                                                                                            | 同上                                                                 | `action:'update'`、`amount:{value:3}`（可算単位切り上げ）、`pantryDeductedAmount:{value:1}`、`consumed:true`                                                                                                                                                                                                                                                                 | 正常系           |
| U-5  | `reconcileItemDeduction`: 増加・pantry 無し                                                                                               | 買う量 2・sunk `null`、生必要量 4、pantry 在庫 0                                                                                                                                                                                                         | 同上                                                                 | `action:'update'`、`amount:{value:4}`、`pantryDeductedAmount:{value:0}`、`consumed:false`                                                                                                                                                                                                                                                                                    | 正常系           |
| U-6  | `reconcileItemDeduction`: 減少・sunk 分で足りる（決定6）                                                                                  | 買う量 3・sunk `{value:2}`（生値相当5）、生必要量が 2 に減少、pantry 在庫 0                                                                                                                                                                              | 同上                                                                 | `action:'remove'`、`covered:{requiredAmount:{value:2}, coveredAmount:{value:2}}`、`consumed:false`（pantry 不変。P-4 準拠）                                                                                                                                                                                                                                                  | 境界値           |
| U-7a | `reconcileItemDeduction`: 減少・sunk 分で足りない・pantry 追加消費なし（決定6の否定）                                                     | 買う量 3・sunk `{value:2}`、生必要量が 4 に減少（不足分 2）、pantry 在庫 0                                                                                                                                                                               | 同上                                                                 | `action:'update'`、`amount:{value:2}`（4-2）、`pantryDeductedAmount:{value:2}`（不変）、`consumed:false`                                                                                                                                                                                                                                                                     | 境界値           |
| U-7b | `reconcileItemDeduction`: 減少・sunk 分で足りない・pantry 追加消費あり                                                                    | 買う量 3・sunk `{value:2}`、生必要量が 4 に減少（不足分 2）、pantry 在庫 1                                                                                                                                                                               | 同上                                                                 | `action:'update'`、`amount:{value:1}`（不足2-在庫1）、`pantryDeductedAmount:{value:3}`（sunk2+新規消費1）、`consumed:true`                                                                                                                                                                                                                                                   | 境界値           |
| U-8  | `reconcileItemDeduction`: `item.productId === null`（P-2 対象外・数量あり材料）                                                           | 増加ケース（生必要量 4、sunk `null`）、`item.productId: null`、pantry に在庫があっても productId 不一致で消費対象外                                                                                                                                      | 同上                                                                 | `action:'update'`、`amount` は受け取った `additionalNeeded` そのまま（4）、`pantryDeductedAmount:{value:0}`、`consumed:false`、pantry 不変                                                                                                                                                                                                                                   | 正常系（防御的） |
| U-9  | `reconcileItemDeduction`: 防御的フォールバック（`productId===null` かつ `additionalNeeded<=0`。理論上発生しない縮退ケース）               | `item.productId: null`、集計後の生必要量が 0 以下になる縮退データを直接構築                                                                                                                                                                              | 同上                                                                 | `action:'update'`、`amount:{value:0}`、`covered:null`、`consumed:false`（`CoveredIngredient.productId` 非 null 制約に反しないためのフォールバック）                                                                                                                                                                                                                          | 異常系（防御性） |
| U-10 | `reconcileItemDeduction`: 呼び出し側前提の破れ（`item.productId===null` だが `aggregatedByKey` 上の一致エントリの `productId` が非 null） | 設計書 JSDoc が `@throws Error` を明記する異常系。`itemMatchKey`/`ingredientMatchKey` の規則上、通常は productId null の item と productId 非 null の集計行が同一キーで一致することは無い（表示名が productId 文字列と偶然一致する等の極端なケースのみ） | 直接この不整合な組を構築して呼ぶ                                     | 設計書の契約どおり `Error` を投げること。**注記**: 設計書に提示された実装例コードには明示的な `throw` 文が確認できず、契約と提示コードの間に食い違いがある。実装時に「例外を投げる」か「安全側 no-op で返す」かを implementer が選択した場合、選択した挙動を本テストで固定する（曖昧なため Orchestrator/implementer 側の確定を待って本テストのアサーションを確定させること） | 異常系           |
| U-11 | `splitDuplicateItems`（回帰・ロジック変更なし）                                                                                           | 同一キーの `from_meal_plan`/`pending` 重複行 2 件                                                                                                                                                                                                        | `splitDuplicateItems(items)`                                         | 既存仕様のまま：先頭 1 件を `uniqueItems`、2 件目以降を `duplicateItems` に分離                                                                                                                                                                                                                                                                                              | 回帰             |
| U-12 | `collectNoteUpdates`（回帰・ロジック変更なし）                                                                                            | `amountNote` が集計結果と異なる pending 品目                                                                                                                                                                                                             | `collectNoteUpdates(items, aggregatedByKey)`                         | 既存仕様のまま：更新対象として収集される                                                                                                                                                                                                                                                                                                                                     | 回帰             |
| U-13 | `rewriteCoveredIngredients`（回帰・ロジック変更なし）                                                                                     | 既存 covered スナップショットと新規 covered のマージ                                                                                                                                                                                                     | `rewriteCoveredIngredients(previous, aggregatedByKey, newlyCovered)` | 既存仕様のまま：献立に残るキーのみ保持し新規分で上書き                                                                                                                                                                                                                                                                                                                       | 回帰             |

## 結合試験観点（`sync-shopping-list-from-meal-plan.use-case.test.ts`）

### 設計テスト方針 A（値不変・既存ケースの再確認）

これらは設計書「テスト方針 A」に列挙された既存ケース。実装後も**アサーションの期待値を変えずに green のまま**であることを確認する回帰観点（sunk 分がゼロのため旧新の式が代数的に一致する）。

| #   | 観点                                                                                                                      | 前提                                                                                 | 操作                         | 期待結果                                                                                                                                | 分類 |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| I-1 | 既存「pending の数量が増えたら上書きする」（sunk=0）                                                                      | 既存 `seededItem()`（買う量2, sunk null）、献立スケール2倍（生必要量4）、pantry 無し | `syncUseCase().execute(...)` | `requiredAmount:{value:4}`、`saveCount:1`、pantry `saveCount:0`（値不変）                                                               | 回帰 |
| I-2 | 既存「pending の数量が減ったら上書きし Pantry は操作しない」（sunk=0）                                                    | 既存 `requiredAmount:{value:4}`、献立が生必要量2に戻る、pantry 無し                  | 同上                         | `requiredAmount:{value:2}`、pantry `saveCount:0`（値不変）                                                                              | 回帰 |
| I-3 | 既存「数量増加分だけ Pantry を消費し既存分は再消費しない」（sunk=0、既存2・生値4・在庫1）                                 | 既存 `seededItem()`、献立2倍、pantry 1個                                             | 同上                         | `requiredAmount:{value:3}`、pantry 消費1個・在庫0（旧実装との数値一致を再確認。**divergence ではない**）                                | 回帰 |
| I-4 | 既存「増加分を在庫でまかなえると買う量は変えず Pantry と引き算スナップショットを保存する」（sunk=0、既存2・生値4・在庫2） | 同条件、pantry 2個                                                                   | 同上                         | `requiredAmount:{value:2}`、`pantryDeductedAmount:{value:2}`、`coveredIngredients:[]`（部分引き算・全量まかない分岐は踏まない。値不変） | 回帰 |
| I-5 | 既存「買う量が0のまま増分を在庫でまかなえると品目を削除する」                                                             | 既存 `requiredAmount:{value:0}`、献立生値2、pantry 2個                               | 同上                         | `items` から削除、`saveCount:1`、pantry `saveCount:1`（値不変）                                                                         | 回帰 |

### 設計テスト方針 B（R-4 強化：厳密な冪等性の格上げ）

| #   | 観点                                                                   | 前提                                     | 操作                                                                  | 期待結果                                                                                                                                                                                                                                                       | 分類   |
| --- | ---------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| I-6 | 「Pantry 非空の再同期は例外なく完了する（R-4）」を真の冪等性検証へ強化 | 既存 `seededItem()`、献立2倍、pantry 1個 | 同一 `shoppingListId` で `syncUseCase().execute(...)` を 2 回連続実行 | 1 回目実行後の `shoppingListRepository.saveCount` / `pantryRepository.saveCount` を記録し、2 回目実行後にそれぞれ**増えていない**こと（`resolves.toBeDefined()` のみの弱い検証から格上げ）。旧実装は本テストで失敗しうる（R-4 が「受容」から「解消」に変わる） | 冪等性 |

### 新規テスト（設計書「テスト方針」新規1〜5）

| #    | 観点（設計書対応）                                                                         | 前提                                                                                                                                                                                                                 | 操作                                                                                                    | 期待結果                                                                                                                                                                                                                                                                                   | 分類                         |
| ---- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| I-7  | 新規1: 典型1（既存 pending 品目が増加後の生必要量を pantry が全量カバー）                  | 既存 `seededItem()`（買う量2, sunk null）、献立スケールで生必要量4、pantry 5個                                                                                                                                       | `syncUseCase().execute(...)`                                                                            | 品目が `items` から消え `coveredIngredients` に `{requiredAmount:{value:4}, coveredAmount:{value:4}}` が追加。`pantryRepository.saveCount:1`（4個消費）。**旧バグ（買う量基準delta=2がpantry(5)でまかなえるため`action:'none'`のまま pending 残留）の直接的レグレッション**                | 異常系→正常化の回帰          |
| I-8  | 新規2: 典型2（献立不変の再同期は真の no-op。Generate 直後の部分引き算あり）                | Generate 相当セットアップ（生5・pantry2 → 買う量3・sunk2）の `ShoppingList` を seed。献立は変更しない                                                                                                                | `syncUseCase().execute(...)`                                                                            | `shoppingListRepository.saveCount===0`、`pantryRepository.saveCount===0`、`items[0].requiredAmount==={value:3}`、`pantryDeductedAmount==={value:2}` のまま。**旧バグ（生値5と買う量3を比較して「変更あり」誤検知→pantry空なら買う量が5に戻る）の直接的レグレッション**（= Done ロック #3） | 冪等性・境界値               |
| I-9  | 新規3: 決定6（数量減少で sunk 分だけで covered になる）                                    | 既存: 買う量3・sunk2（生値相当5）。献立変更で生必要量が2に減少。pantry 在庫0（追加消費なし・巻き戻しもしない検証）                                                                                                   | `syncUseCase().execute(...)`                                                                            | 品目が `items` から消え `coveredIngredients` に `{requiredAmount:{value:2}, coveredAmount:{value:2}}`。`pantryRepository.saveCount===0`（P-4: pantry 不変）                                                                                                                                | 境界値                       |
| I-10 | 新規4: 決定6の否定（減少しても sunk 分だけでは足りない）                                   | 既存: 買う量3・sunk2。献立変更で生必要量が4に減少（不足2）。pantry 在庫なし                                                                                                                                          | `syncUseCase().execute(...)`                                                                            | `items[0].requiredAmount==={value:2}`（4-2）、`pantryDeductedAmount` は `{value:2}`（変わらず）、`pantryRepository.saveCount===0`。「減少したら常に covered にする」という誤った単純化をしていないことの検証                                                                               | 境界値                       |
| I-11 | 新規5: Generate/Sync 一致（Done ロック #1・**空の ShoppingList への Sync＝新規キー経路**） | 同一 MealPlan・同一 Pantry（コピー2セット）から (a) `GenerateShoppingListUseCase.execute` と (b) 空の `ShoppingList`（`items:[]`, `coveredIngredients:[]`）への `SyncShoppingListFromMealPlanUseCase.execute` を実行 | 両方の結果の `items`（displayName・requiredAmount・pantryDeductedAmount）と `coveredIngredients` を比較 | 全量まかない・部分引き算・在庫なし の3パターンそれぞれで (a) と (b) が完全一致すること                                                                                                                                                                                                     | 結合整合性（Done ロック #1） |

### Orchestrator 必須 Done ロック（空リスト Sync だけでは不足という指摘への対応）

設計書の新規5（I-11）は「空の ShoppingList への Sync（新規キー経路）」のみを検証する。Done 条件の
本体は「既存 pending 行（引き算なし）への reconcile 経路」でも同じ一致が成立することであり、以下を
**追加で必須**とする。

| #    | 観点                                                                                                             | 前提                                                                                                                                                                                                                                                                                                    | 操作                                          | 期待結果                                                                                                                                                                     | 分類                         |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| I-12 | Done ロック #2-a: Generate vs 既存 pending 行（引き算なし）への Sync（reconcile 経路）一致・全量まかないパターン | 同一 MealPlan・同一 Pantry（コピー2セット）。(a) `GenerateShoppingListUseCase.execute` の結果。(b) 「引き算なしの pending 行」（`requiredAmount` = 献立変更前の生値、`pantryDeductedAmount: null`）を持つ `ShoppingList` に対して `SyncShoppingListFromMealPlanUseCase.execute`（reconcile 経路を通す） | 両方の `items` と `coveredIngredients` を比較 | 一致すること（当該品目は両方とも `coveredIngredients` に同じ値で載り `items` には出ない）。**これが旧バグの本体**（I-7 は単体の振る舞い確認、I-12 は Generate との直接比較） | 結合整合性（Done ロック #2） |
| I-13 | Done ロック #2-b: 同上・部分引き算パターン                                                                       | 同上構成、pantry が生必要量の一部だけをまかなう量                                                                                                                                                                                                                                                       | 同上                                          | (a) と (b) の当該品目の `requiredAmount`・`pantryDeductedAmount` が一致すること                                                                                              | 結合整合性（Done ロック #2） |
| I-14 | Done ロック #2-c: 同上・在庫なしパターン                                                                         | 同上構成、該当 product の pantry 在庫が 0                                                                                                                                                                                                                                                               | 同上                                          | (a) と (b) の当該品目の `requiredAmount`（差し引きなしの生値）が一致し、`pantryRepository.saveCount` がどちらも増えないこと                                                  | 結合整合性（Done ロック #2） |

I-8（新規2・典型2）が Done ロック #3（部分引き算済みリストを献立不変で再 Sync → 真の no-op。買う量が
生値に戻らない）を兼ねる。重複テストを増やさないため、I-8 のアサーションに「買う量が生値（5）に
戻っていないこと」を明示的に含める。

### 既存エラー系（回帰・変更なし）

| #    | 観点                                                                                                                  | 前提                                                                                           | 操作                         | 期待結果                                   | 分類           |
| ---- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------ | -------------- |
| I-15 | `ShoppingListNotFoundError` / `InvalidShoppingListStateError` / `MealPlanNotFoundError` / `InvalidMealPlanStateError` | 既存テストのまま（`shoppingListId` 不在・`completed` リスト・`draft` MealPlan・MealPlan 不在） | `syncUseCase().execute(...)` | 既存の例外がそのまま投げられる（変更なし） | 異常系（回帰） |

## `GenerateShoppingListUseCase` 側の扱い

`generate-shopping-list.use-case.ts` はコード変更なし。既存 `generate-shopping-list.use-case.test.ts`
の全ケースが変更なしで green であることを回帰確認する（新規テスト追加は不要）。ただし I-11〜I-14 では
`GenerateShoppingListUseCase` を `sync-shopping-list-from-meal-plan.use-case.test.ts`（または新規の
一致検証専用ブロック）から直接呼び出し、Sync 側の結果と比較する「参照実装」として利用する。

## 特性観点

- **権限**: 対象外（MVP1 は認証なし。既存のまま変化なし）。
- **データ整合性**: 各 Done ロック・新規1〜4 のテストで「(買う量 + `pantryDeductedAmount`) が
  集計後の生必要量と一致する」または「`coveredIngredients` の `coveredAmount` が生必要量と一致する」
  ことをアサーションに含める（`additionalNeeded = newGross - prevDeducted` 式の正しさの直接検証）。
  `rewriteCoveredIngredients` のキー整合性（献立から消えた covered キーが残らないこと）は U-13 で確認。
- **冪等性**: **必須**（Application 書き込み系 UseCase）。I-6（R-4 強化）・I-8（典型2 = Done ロック #3）
  で「同一操作の多重実行・再送で結果が変わらない」ことを保存回数（`saveCount`）と数量の両面で検証する。
  既存の `GenerateShoppingListUseCase` の冪等性（`created:false` パス）は変更なしのため既存テストの
  回帰確認のみで足りる。
- **障害系**: 対象外（外部 I/O の新設なし。既存の `UnitOfWork.execute` 内での例外ハンドリングは
  本タスクで変更しない）。
- **フロントエンド固有**: 対象外（`apps/web` の変更なし。DTO 形が不変のため画面側への影響なし）。
- **防御性（Domain 層 Entity/VO）**: 対象外（`packages/domain` はコード変更なし）。ただし
  Application 層内の防御的フォールバック分岐は単体観点に含めた（U-9: `productId===null` かつ
  `additionalNeeded<=0` の縮退ケース、U-10: 呼び出し側前提が崩れた場合の異常系）。

## メソッド網羅チェック表

| ファイル                                        | 関数/メソッド                                                                                    | 変更区分                       | 対応する試験観点 No                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `ingredient-aggregation.ts`                     | `resolveMealPlanIngredients`                                                                     | 変更なし                       | 既存 Generate/Sync テスト群（回帰。新規観点なし）                                                            |
| `ingredient-aggregation.ts`                     | `applyPantryDeduction`                                                                           | 変更なし（呼び出し方のみ変化） | 既存 `generate-shopping-list.use-case.test.ts` 群（回帰）、I-7, I-9, I-10, I-11〜I-14（Sync 経由の間接検証） |
| `ingredient-aggregation.ts`                     | `resolveTargetStores`                                                                            | 変更なし                       | 既存テスト（回帰。新規観点なし）                                                                             |
| `ingredient-aggregation.ts`                     | `ingredientMatchKey`                                                                             | 変更なし                       | 既存テスト（回帰。新規観点なし）                                                                             |
| `ingredient-aggregation.ts`                     | `itemMatchKey`                                                                                   | 変更なし                       | 既存テスト（回帰。新規観点なし）                                                                             |
| `sync-shopping-list-diff.ts`                    | `splitDuplicateItems`                                                                            | 変更なし                       | U-11                                                                                                         |
| `sync-shopping-list-diff.ts`                    | `collectNoteUpdates`                                                                             | 変更なし                       | U-12                                                                                                         |
| `sync-shopping-list-diff.ts`                    | `applyQuantityUpdate` → `reconcileItemDeduction`（置換）                                         | **変更**（内部再設計）         | U-3, U-4, U-5, U-6, U-7a, U-7b, U-8, U-9, U-10                                                               |
| `sync-shopping-list-diff.ts`                    | `previousGrossRequiredAmount`                                                                    | **新規**                       | U-1, U-2, I-6（判定式の呼び出し元として間接確認）                                                            |
| `sync-shopping-list-diff.ts`                    | `rewriteCoveredIngredients`                                                                      | 変更なし                       | U-13                                                                                                         |
| `sync-shopping-list-from-meal-plan.use-case.ts` | `SyncShoppingListFromMealPlanUseCase.execute`（`updateCandidates` 判定式変更・呼び出し関数変更） | **変更**                       | I-1〜I-15（全観点）                                                                                          |
| `generate-shopping-list.use-case.ts`            | `GenerateShoppingListUseCase.execute`                                                            | 変更なし                       | 既存テスト群（回帰）＋ I-11〜I-14（比較対象として直接呼び出し）                                              |

## 回帰試験範囲

- **`sync-shopping-list-from-meal-plan.use-case.test.ts` 既存ケース全体**: 分類 A（I-1〜I-5 に対応する
  5 件）は値が変わらないこと、その他（新規追加・削除・重複解消・amountNote・bought/manually_added
  不変・no-op 系）はロジック非接触のため無条件に green のままであること。
- **`generate-shopping-list.use-case.test.ts` 全体**: コード変更なしのため全ケース green のまま
  （新規テスト不要、既存確認のみ）。
- **`CompleteShopping` の分割ファイル（`complete-shopping-*.ts`）・保存順**: 対象外（触らない）。
  既存の `complete-shopping.use-case.test.ts` が変更なしで green のままであることのみ確認する
  （新規観点は設けない）。
- **献立 status 修復（`GenerateShoppingListUseCase` の draft→shopping 自己修復）**: 対象外（既存のまま）。
  既存の該当テスト（`既存リストがあり MealPlan が draft の部分失敗状態を shopping へ自己修復する` 等）が
  変更なしで green のままであることのみ確認する。
- **D-1〜D-5（`applyPantryDeduction` の引き算ルール本体）**: 本タスクではルールを変更しない。
  既存の `generate-shopping-list.use-case.test.ts` の D-1〜D-5 相当ケース（切り上げ、単位不一致、
  消費順、productId なし等）がすべて変更なしで green のままであることを回帰確認する
  （ルール変更のテストは行わない）。
- **`docs/designs/meal-plan-sync.md` の R-4/P-7**: ドキュメント更新は本試験計画のスコープ外。
  I-6（R-4 強化）・I-9/I-10（決定6/決定6否定）が P-4/P-7 の「Pantry を操作しない」制約を
  破っていないことをテストのアサーション（`pantryRepository.saveCount` 不変）で直接確認する。

## 試験データ

- 既存フィクスチャ（`packages/application/tests/shopping-list/test-helpers.ts`）をそのまま使う。
  `seededItem({ requiredAmount, pantryDeductedAmount })` が既に sunk 分ありの品目を構築できるため、
  新規フィクスチャの追加は不要。
- `stockInput(productId, value, unit, options)` で pantry 在庫を構築する（既存のまま）。
- Done ロック（I-11〜I-14）・新規5（I-11 相当）では「同一献立・同一 pantry」を Generate 用と
  Sync 用に**それぞれ独立なインスタンス**として用意する必要がある（pantry は消費される副作用を持つため、
  同一インスタンスを両方の実行に使うと 2 回目の消費が歪む）。`createRepositories()` を 2 回呼び、
  同じ値で `mealPlanRepository.seed` / `recipeRepository.seed` / `pantryRepository.seedStock` を
  それぞれ独立に行うこと。
- U-9・U-10 は UseCase を経由せず `reconcileItemDeduction` を直接呼ぶため、`Pantry.create()` と
  `ShoppingItem.reconstruct` を diff テストファイル内で直接組み立てる（`test-helpers.ts` の
  `seededItem` を流用可）。

## 設計テスト方針との対応（正本チェック）

| 設計書の項目                                                                                      | 本計画での対応                                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| A. 値不変（既存ケース）                                                                           | I-1〜I-5（アサーション値を変えずに green を確認） |
| B. R-4 強化                                                                                       | I-6（`saveCount` が増えないことを追加検証）       |
| 新規1（典型1）                                                                                    | I-7                                               |
| 新規2（典型2）                                                                                    | I-8（= Done ロック #3 を兼ねる）                  |
| 新規3（決定6）                                                                                    | I-9                                               |
| 新規4（決定6の否定）                                                                              | I-10                                              |
| 新規5（Generate/Sync 一致）                                                                       | I-11（= Done ロック #1）                          |
| diff 単体テスト（`previousGrossRequiredAmount` / `reconcileItemDeduction` の分岐網羅）            | U-1〜U-10                                         |
| （設計書に無いが Orchestrator が追加指定） Done ロック #2（既存 pending 行 reconcile 経路の一致） | I-12〜I-14（新規追加）                            |

## 完了条件

以下すべてを満たすこと。

1. Done ロック 3 点が **すべて green**:
   - Done ロック #1（I-11）: Generate vs 空の ShoppingList への Sync（新規キー経路）が一致。
   - Done ロック #2（I-12〜I-14）: Generate vs 既存 from_meal_plan pending 行（引き算なし）への
     Sync（reconcile 経路）が一致（旧バグの本体）。
   - Done ロック #3（I-8）: 部分引き算済みリストを献立不変で再 Sync すると真の no-op（買う量が生値に
     戻らない）。
2. 設計テスト方針 A（I-1〜I-5）が値を変えずに green。
3. 設計テスト方針 B（I-6）が「保存回数不変」まで強化された状態で green。
4. 新規3・新規4（I-9・I-10）で決定6（減少時の covered 化）とその否定が両方検証されている
   （「減少したら常に covered にする」という誤った単純化になっていないこと）。
5. `sync-shopping-list-diff.test.ts` の新規単体テスト（U-1〜U-10）が `reconcileItemDeduction` の
   全分岐（増加×pantry十分/部分/無し、減少×covered/非covered、productId null、異常系）を網羅している。
6. メソッド網羅チェック表の全 public API に対応する観点があること。
7. 回帰試験範囲に挙げた既存テスト（Generate 全体・Sync の非対象範囲ケース・CompleteShopping・
   献立 status 修復・D-1〜D-5）が変更なしで green のまま。
8. `pnpm lint` / `pnpm type-check` / `pnpm --filter @cookpit/application test` が通ること。
