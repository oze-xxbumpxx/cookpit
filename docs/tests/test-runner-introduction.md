# 試験計画: test-runner-introduction

- 前提となる設計書: docs/designs/test-runner-introduction.md
- レベル: L2

## 試験種別

- 単体試験（domain 層の Entity / Value Object）のみ。結合・E2E は対象外（後続フェーズ）。
- テストは現状の振る舞いを記述・固定する（仕様バグ修正は行わない）。

## 単体試験観点

### Quantity（packages/domain/src/shared/quantity.ts）

| # | 観点 | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|---|
| Q1 | 正値で生成 | - | `Quantity.of(100, 'g')` | value=100, unit='g' | 正常 |
| Q2 | 負値は拒否 | - | `Quantity.of(-1, 'g')` | throw 'Quantity must be non-negative' | 異常 |
| Q3 | 0 は許容 | - | `Quantity.of(0, 'ml')` | value=0 | 境界 |
| Q4 | スケール | `of(100,'g')` | `.multiply(2)` | value=200, unit 不変 | 正常 |
| Q5 | スケール0 | `of(100,'g')` | `.multiply(0)` | value=0（負値化しない） | 境界 |

### RecipeIngredient（packages/domain/src/recipe/recipe-ingredient.ts）

| # | 観点 | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|---|
| I1 | amount のみで生成 | amount=Quantity, amountNote=null | `create` | 成功・amount 設定 | 正常 |
| I2 | amountNote のみで生成 | amount=null, amountNote='適量' | `create` | 成功・amountNote 設定 | 正常 |
| I3 | displayName 空 | displayName='  ' | `create` | throw 'Display name is required' | 異常 |
| I4 | 両方未設定 | amount=null, amountNote=null | `create` | throw 'Either amount or amountNote is required' | 異常 |
| I5 | 両方設定 | amount=Quantity, amountNote='適量' | `create` | throw 'amount and amountNote cannot both be set' | 異常 |
| I6 | amountNote 空白のみ | amount=null, amountNote='  ' | `create` | throw（実質「どちらも未設定」扱い） | 境界 |
| I7 | scale（amount あり） | amount=of(100,'g') | `.scale(2)` | 新 amount=200, amountNote=null | 正常 |
| I8 | scale（amount=null） | amount=null, amountNote='適量' | `.scale(2)` | 自身を返す（不変） | 境界 |

### Recipe（packages/domain/src/recipe/recipe.ts）

| # | 観点 | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|---|
| R1 | 最小入力で生成 | name='肉じゃが', baseServings=2, ingredients/steps=[] | `create` | 成功・id 採番・tags=[]・notes=''・cookingTime=null | 正常 |
| R2 | name 空白 | name='  ' | `create` | throw 'Recipe name is required' | 異常 |
| R3 | baseServings 0 | baseServings=0 | `create` | throw 'Recipe base servings must be positive' | 異常 |
| R4 | baseServings 負 | baseServings=-1 | `create` | throw | 異常 |
| R5 | cookingTime 負 | cookingTime=-1 | `create` | throw 'Recipe cooking time must be non-negative' | 異常 |
| R6 | cookingTime 0 | cookingTime=0 | `create` | **成功（現状仕様として固定）** | 境界 |
| R7 | rename 空白 | 生成済み | `.rename('  ')` | throw | 異常 |
| R8 | updateCookingTime 負 | 生成済み | `.updateCookingTime(-1)` | throw | 異常 |
| R9 | updateCookingTime null | 生成済み | `.updateCookingTime(null)` | cookingTime=null | 正常 |
| R10 | scaleIngredients | ingredients=[of(100,'g')] | `.scaleIngredients(2)` | 各 ingredient が scale 委譲され 200 | 正常 |
| R11 | ゲッターの防御的コピー | 生成済み | `recipe.tags.push(...)` 後に再取得 | 内部状態は不変 | 整合性 |
| R12 | reconstruct 往復 | RecipeProps | `reconstruct` | props の値を保持・create のバリデーションを通さない | 正常 |

### RecipeId（packages/domain/src/recipe/recipe-id.ts）

| # | 観点 | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|---|
| ID1 | generate | - | `RecipeId.generate()` | UUID 形式・毎回異なる | 正常 |
| ID2 | fromString 往復 | value='abc' | `fromString('abc').value` | 'abc' | 正常 |
| ID3 | equals 同値 | 同一 value の 2 つ | `.equals` | true | 正常 |
| ID4 | equals 異値 | 異なる value | `.equals` | false | 正常 |

## 結合試験観点

対象外（本フェーズは domain 単体のみ。application/infrastructure 連携テストは後続）。

## 特性観点

- 権限: 対象外（domain は認証・権限を扱わない）。
- データ整合性: ゲッターの防御的コピー（R11）で内部不変条件を検証。
- 冪等性: 対象外（domain の純粋メソッドは副作用なし。値オブジェクトは不変）。

## 回帰試験範囲

- 既存の domain ロジックの振る舞い全般。テストは現状を固定するため、後続で domain を
  変更した際の回帰検知に機能する。
- 本フェーズでは本番コード未変更のため、新規回帰リスクは設定・配線（turbo/script）に限定。

## 試験データ

- インメモリのみ。外部 I/O・DB・秘密情報を使わない。
- Unit は型 `Unit` の有効値（'g' / 'ml' 等）を使用。

## 完了条件

- 上記すべての単体試験観点がテストとして実装され green。
- `pnpm test` / `pnpm lint` / `pnpm type-check` が全て通る。
- `run-quality-gates.sh` の test ゲートが PASS を出す。
