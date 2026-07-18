# 試験計画: recipe-servings

- 作成日: 2026-07-03
- 対応設計書: `docs/designs/recipe-servings.md`
- 変更レベル: L2
- テストランナー: Vitest

---

## 概要

Recipe 集約への `servings`（任意・null 許容・1 以上の正の整数）フィールド追加に関する試験計画。
Domain / api-contract / Application / Infrastructure / Presentation の全 5 層を対象とする。

---

## Public API 網羅チェック（実装コード走査結果）

以下は変更対象の全 public メソッド・getter・スキーマを列挙し、試験ケースの有無を照合した。

| 層             | 対象                                 | 変更種別                          | 対応ケース           |
| -------------- | ------------------------------------ | --------------------------------- | -------------------- |
| Domain         | `Recipe.create()`                    | `servings` パラメータ追加         | T-D01〜T-D07         |
| Domain         | `Recipe.reconstruct()`               | `servings` パラメータ追加         | T-D14〜T-D15         |
| Domain         | `recipe.updateServings()`            | 新規メソッド                      | T-D08〜T-D13         |
| Domain         | `get recipe.servings`                | 新規ゲッター                      | T-D01〜T-D15（間接） |
| api-contract   | `createRecipeSchema`                 | `servings` フィールド追加         | T-C01〜T-C09         |
| api-contract   | `updateRecipeSchema`                 | `servings` フィールド追加         | T-C10〜T-C18         |
| Application    | `CreateRecipeUseCase.execute()`      | `servings` 受け渡し追加           | T-A01〜T-A03         |
| Application    | `UpdateRecipeUseCase.execute()`      | `updateServings()` 呼び出し追加   | T-A04〜T-A07         |
| Application    | `GetRecipeUseCase.execute()`         | レスポンス DTO に `servings` 追加 | T-A08                |
| Application    | `GetRecipesUseCase.execute()`        | レスポンス DTO に `servings` 追加 | T-A09                |
| Application    | `toRecipeDto()`                      | `servings` マッピング追加         | T-MAP01〜T-MAP02     |
| Infrastructure | `DrizzleRecipeRepository.save()`     | `servings` 永続化                 | T-I01〜T-I03         |
| Infrastructure | `DrizzleRecipeRepository.findById()` | `servings` 復元                   | T-I01〜T-I02, T-I05  |
| Infrastructure | `DrizzleRecipeRepository.findAll()`  | `servings` 復元                   | T-I04                |
| Presentation   | `POST /api/recipes`                  | `servings` 検証・レスポンス       | T-P01〜T-P06         |
| Presentation   | `PUT /api/recipes/:id`               | `servings` 検証・レスポンス       | T-P07〜T-P10         |
| Presentation   | `GET /api/recipes`                   | `servings` レスポンス確認         | T-P11                |
| Presentation   | `GET /api/recipes/:id`               | `servings` レスポンス確認         | T-P12                |

---

## 既存テストの不足観点

### `packages/domain/src/recipe/recipe.test.ts`

現状カバー: `Recipe.create` / `rename` / `updateIngredients` / `updateSteps` / `updateTags` /
`updateNotes` / `updateCookingTime` / `scaleIngredients` / `reconstruct` / 防御的コピー。

**不足**: `servings` に関するすべての観点（`create` のパラメータ、`updateServings` 新規メソッド、
`get servings` ゲッター、`reconstruct` の `servings`）が未テスト。

### `packages/application/src/recipe/recipe-use-cases.test.ts`

現状カバー: 全 UseCase の基本動作（`servings` なし）。

**不足**:

- `seededRecipe` ヘルパーが `servings` を含まない。`RecipeProps` に `servings: number | null` が
  追加されると型エラーになるため、`servings: null` を追加する必要がある（回帰影響）。
- `servings` 値の伝播・正規化（`undefined → null`）の確認がない。

### `packages/application/src/recipe/recipe.mapper.test.ts`

現状カバー: `toRecipeDto` の全フィールド（`servings` 除く）。

**不足**: `toRecipeDto()` が `recipe.servings` を DTO にマッピングする観点がない。
`buildRecipe()` ヘルパーも `RecipeProps.servings` を含む必要がある（回帰影響）。

### `packages/infrastructure/` — Recipe 用テストなし

`drizzle-recipe.repository.ts` に対応するテストファイルが存在しない。
`drizzle-product.repository.test.ts` のパターンを参考に新規作成が必要。

### `packages/api-contract/` — テストなし

`recipe.schema.ts` に対するユニットテストが存在しない。新規作成が必要。

### `apps/web/src/server/routes/` — レシピルートテストなし

`products.test.ts` のパターン（UseCase をモック）を参考に新規作成が必要。

---

## 試験ケース一覧

### 凡例

各ケースは「前提 / 操作 / 期待結果」の形式で記述する。

---

## 1. Domain 層（T-D）

**ファイル**: `packages/domain/src/recipe/recipe.test.ts`

### 1-1. `Recipe.create()` — servings パラメータ

#### 正常系・境界値

| ケースID | 前提 | 操作                                                     | 期待結果                   |
| -------- | ---- | -------------------------------------------------------- | -------------------------- |
| T-D01    | -    | `Recipe.create({ ..., servings: 4 })`                    | `recipe.servings === 4`    |
| T-D02    | -    | `Recipe.create({ ..., servings: null })`                 | `recipe.servings === null` |
| T-D03    | -    | `Recipe.create({ ... })` （`servings` フィールドを省略） | `recipe.servings === null` |
| T-D07    | -    | `Recipe.create({ ..., servings: 1 })` （最小有効値）     | `recipe.servings === 1`    |

#### 異常系・境界値

| ケースID | 前提 | 操作                                               | 期待結果                                                       |
| -------- | ---- | -------------------------------------------------- | -------------------------------------------------------------- |
| T-D04    | -    | `Recipe.create({ ..., servings: 0 })`              | `Error('Recipe servings must be a positive integer')` を投げる |
| T-D05    | -    | `Recipe.create({ ..., servings: -1 })`             | `Error('Recipe servings must be a positive integer')` を投げる |
| T-D06    | -    | `Recipe.create({ ..., servings: 1.5 })` （非整数） | `Error('Recipe servings must be a positive integer')` を投げる |

### 1-2. `recipe.updateServings()` — 新規メソッド

#### 正常系・境界値

| ケースID | 前提                          | 操作                                      | 期待結果                                                        |
| -------- | ----------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| T-D08    | `servings` が設定済みのレシピ | `recipe.updateServings(2)`                | `recipe.servings === 2` かつ `updatedAt` が操作前以降の値になる |
| T-D09    | `servings: 4` のレシピ        | `recipe.updateServings(null)`             | `recipe.servings === null`                                      |
| T-D13    | -                             | `recipe.updateServings(1)` （最小有効値） | `recipe.servings === 1`                                         |

#### 異常系・境界値

| ケースID | 前提 | 操作                         | 期待結果                                                       |
| -------- | ---- | ---------------------------- | -------------------------------------------------------------- |
| T-D10    | -    | `recipe.updateServings(0)`   | `Error('Recipe servings must be a positive integer')` を投げる |
| T-D11    | -    | `recipe.updateServings(-5)`  | `Error('Recipe servings must be a positive integer')` を投げる |
| T-D12    | -    | `recipe.updateServings(1.5)` | `Error('Recipe servings must be a positive integer')` を投げる |

#### 防御性

| ケースID | 前提                   | 操作                                                         | 期待結果                                                      |
| -------- | ---------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| T-D08b   | `servings: 4` のレシピ | `recipe.updateServings(2)` → `recipe.updateServings(0)` 失敗 | 失敗後も `recipe.servings === 2` のまま（部分更新がないこと） |

### 1-3. `Recipe.reconstruct()` — servings パラメータ

| ケースID | 前提 | 操作                                          | 期待結果                   |
| -------- | ---- | --------------------------------------------- | -------------------------- |
| T-D14    | -    | `Recipe.reconstruct({ ..., servings: 3 })`    | `recipe.servings === 3`    |
| T-D15    | -    | `Recipe.reconstruct({ ..., servings: null })` | `recipe.servings === null` |

> **設計根拠**: `reconstruct()` はバリデーションを通さない（DB 復元パス）。
> 不正値（0・負数・小数）のテストは実施しない（設計書「static reconstruct(): バリデーションなし」）。

---

## 2. api-contract 層（T-C）

**ファイル**: 新規作成 `packages/api-contract/src/recipe.schema.test.ts`

> **実施状況（2026-07-03 reviewer 指摘 Should-3 反映）**: `packages/api-contract` に Vitest 設定が
> 存在しないため、本タスクでは T-C01〜T-C18 は未実施（実装計画 §確認事項 2 の判断）。同等の境界値
> 観点は Hono ルートテスト（`apps/web/src/server/routes/recipes.test.ts` の T-P04〜T-P06・T-P10）で
> `zValidator` 経由の統合テストとして代替済み。`packages/api-contract` への Vitest 導入と
> T-C01〜T-C18 の実装は、本 feature とは別タスクとして扱う（api-contract パッケージ全体への
> テスト基盤導入であり recipe-servings 単体のスコープを超えるため）。

### 2-1. `createRecipeSchema`

#### 正常系・境界値

| ケースID | 前提 | 操作                                                            | 期待結果                                  |
| -------- | ---- | --------------------------------------------------------------- | ----------------------------------------- |
| T-C01    | -    | `createRecipeSchema.parse({ ..., servings: 4 })`                | 例外なし、`result.servings === 4`         |
| T-C02    | -    | `createRecipeSchema.parse({ ..., servings: null })`             | 例外なし、`result.servings === null`      |
| T-C03    | -    | `createRecipeSchema.parse({ ... })` （`servings` 省略）         | 例外なし、`result.servings === undefined` |
| T-C04    | -    | `createRecipeSchema.parse({ ..., servings: 1 })` （最小有効値） | 例外なし、`result.servings === 1`         |

#### 異常系・境界値

| ケースID | 前提 | 操作                                                   | 期待結果                                                                                         |
| -------- | ---- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| T-C05    | -    | `createRecipeSchema.safeParse({ ..., servings: 0 })`   | `{ success: false }`、`issues[0].code === 'too_small'`、`issues[0].path[0] === 'servings'`       |
| T-C06    | -    | `createRecipeSchema.safeParse({ ..., servings: -1 })`  | `{ success: false }`、`issues[0].code === 'too_small'`、`issues[0].path[0] === 'servings'`       |
| T-C07    | -    | `createRecipeSchema.safeParse({ ..., servings: 1.5 })` | `{ success: false }`、`issues[0].code === 'not_multiple_of'`、`issues[0].path[0] === 'servings'` |
| T-C08    | -    | `createRecipeSchema.safeParse({ ..., servings: "4" })` | `{ success: false }`、`issues[0].code === 'invalid_type'`、`issues[0].path[0] === 'servings'`    |

#### 後方互換（回帰）

| ケースID | 前提 | 操作                                                                                       | 期待結果                           |
| -------- | ---- | ------------------------------------------------------------------------------------------ | ---------------------------------- |
| T-C09    | -    | `servings` フィールドを含まない既存クライアント相当のボディで `createRecipeSchema.parse()` | 例外なし（後方互換が保たれている） |

### 2-2. `updateRecipeSchema`

`createRecipeSchema` と同一ルールを適用する。

| ケースID | 対応 T-C   | 観点                                                 |
| -------- | ---------- | ---------------------------------------------------- |
| T-C10    | T-C01 相当 | `servings: 4` → パース成功                           |
| T-C11    | T-C02 相当 | `servings: null` → パース成功                        |
| T-C12    | T-C03 相当 | `servings` 省略 → パース成功、`undefined`            |
| T-C13    | T-C04 相当 | `servings: 1` → 最小有効値、パース成功               |
| T-C14    | T-C05 相当 | `servings: 0` → `too_small` エラー                   |
| T-C15    | T-C06 相当 | `servings: -1` → `too_small` エラー                  |
| T-C16    | T-C07 相当 | `servings: 1.5` → `not_multiple_of` エラー           |
| T-C17    | T-C08 相当 | `servings: "4"` → `invalid_type` エラー              |
| T-C18    | T-C09 相当 | `servings` 省略の既存ボディ → パース成功（後方互換） |

---

## 3. Application 層（T-A, T-MAP）

### 3-1. UseCase テスト

**ファイル**: `packages/application/src/recipe/recipe-use-cases.test.ts`

> **前提注意**: 既存の `seededRecipe()` ヘルパーは `Recipe.reconstruct()` を呼んでいるが、
> `RecipeProps` に `servings: number | null` が追加されると型エラーになる。
> 実装者は `servings: null` を `seededRecipe()` ヘルパーに追加すること（回帰影響）。

#### `CreateRecipeUseCase` — 正常系

| ケースID | 前提                | 操作                                                | 期待結果                                                  |
| -------- | ------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| T-A01    | InMemory リポジトリ | `execute({ ..., servings: 4 })`                     | 返却 DTO の `servings === 4`                              |
| T-A02    | InMemory リポジトリ | `execute({ ... })` （`servings` 省略、`undefined`） | 返却 DTO の `servings === null`（`?? null` 正規化を確認） |
| T-A03    | InMemory リポジトリ | `execute({ ..., servings: null })`                  | 返却 DTO の `servings === null`                           |

#### `UpdateRecipeUseCase` — 正常系

| ケースID | 前提                                | 操作                                   | 期待結果                                            |
| -------- | ----------------------------------- | -------------------------------------- | --------------------------------------------------- |
| T-A04    | `servings: null` のシード済みレシピ | `execute({ ..., servings: 2 })`        | 返却 DTO の `servings === 2`                        |
| T-A05    | `servings: 4` のシード済みレシピ    | `execute({ ..., servings: null })`     | 返却 DTO の `servings === null`（クリア）           |
| T-A06    | `servings: 4` のシード済みレシピ    | `execute({ ... })` （`servings` 省略） | 返却 DTO の `servings === null`（`?? null` 正規化） |

#### `UpdateRecipeUseCase` — 異常系

| ケースID | 前提             | 操作                            | 期待結果                                              |
| -------- | ---------------- | ------------------------------- | ----------------------------------------------------- |
| T-A07    | シード済みレシピ | `execute({ ..., servings: 0 })` | ドメインバリデーションエラーを投げ、`saveCount === 0` |

#### `GetRecipeUseCase` / `GetRecipesUseCase`

| ケースID | 前提                                               | 操作                           | 期待結果                                                      |
| -------- | -------------------------------------------------- | ------------------------------ | ------------------------------------------------------------- |
| T-A08    | `servings: 3` のシード済みレシピ                   | `GetRecipeUseCase.execute(id)` | DTO に `servings === 3` が存在する                            |
| T-A09    | `servings: 2` / `servings: null` の 2 件シード済み | `GetRecipesUseCase.execute()`  | 各 DTO に `servings` フィールドが存在し、それぞれの値が正しい |

### 3-2. Mapper テスト

**ファイル**: `packages/application/src/recipe/recipe.mapper.test.ts`

> **前提注意**: 既存の `buildRecipe()` ヘルパーは `Recipe.reconstruct()` を呼んでいるが、
> `RecipeProps.servings: number | null` が追加されると型エラーになる。
> 実装者は `servings: null`（または任意の値）を追加すること（回帰影響）。

| ケースID | 前提                                                           | 操作                  | 期待結果                |
| -------- | -------------------------------------------------------------- | --------------------- | ----------------------- |
| T-MAP01  | `Recipe.reconstruct({ ..., servings: 4 })` で生成したレシピ    | `toRecipeDto(recipe)` | `dto.servings === 4`    |
| T-MAP02  | `Recipe.reconstruct({ ..., servings: null })` で生成したレシピ | `toRecipeDto(recipe)` | `dto.servings === null` |

---

## 4. Infrastructure 層（T-I）

**ファイル**: 新規作成 `packages/infrastructure/src/repositories/drizzle-recipe.repository.test.ts`

> `drizzle-product.repository.test.ts` のパターン（PGlite + `createTestDb()`）を踏襲する。

### 4-1. `save()` + `findById()` ラウンドトリップ

| ケースID | 前提             | 操作                                                | 期待結果                               |
| -------- | ---------------- | --------------------------------------------------- | -------------------------------------- |
| T-I01    | PGlite テスト DB | `servings: 4` のレシピを `save()` → `findById()`    | 復元した Entity の `servings === 4`    |
| T-I02    | PGlite テスト DB | `servings: null` のレシピを `save()` → `findById()` | 復元した Entity の `servings === null` |

### 4-2. upsert（冪等性）

| ケースID | 前提                                           | 操作                                                 | 期待結果                                                           |
| -------- | ---------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| T-I03    | PGlite テスト DB、`servings: 4` で INSERT 済み | `recipe.updateServings(2)` → `save()` → `findById()` | `servings === 2`（`onConflictDoUpdate` の `set` 句で上書きされる） |

### 4-3. `findAll()`

| ケースID | 前提                                                                                   | 操作        | 期待結果                                                   |
| -------- | -------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------- |
| T-I04    | PGlite テスト DB、`servings: 4` のレシピと `servings: null` のレシピの 2 件を `save()` | `findAll()` | 返却リストの各 Entity に `servings` が正しく設定されている |

### 4-4. 後方互換（既存データ）

| ケースID | 前提                                                                                      | 操作         | 期待結果                                                                              |
| -------- | ----------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| T-I05    | PGlite テスト DB に `servings` カラムを省略して INSERT した行が存在する（既存データ相当） | `findById()` | 復元した Entity の `servings === null`（`row.servings ?? null` の変換が機能している） |

---

## 5. Presentation 層（T-P）

**ファイル**: 新規作成 `apps/web/src/server/routes/recipes.test.ts`

> `products.test.ts` のパターン（UseCase をモック、`app.request()` で呼び出し）を踏襲する。

### 5-1. `POST /api/recipes`

#### 正常系

| ケースID | 前提                                                        | 操作                                                                       | 期待結果                                         |
| -------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------ |
| T-P01    | `CreateRecipeUseCase` モック（`servings: 4` を返す DTO）    | `POST /api/recipes` with `{ ..., servings: 4 }`                            | HTTP 201、レスポンス JSON の `servings === 4`    |
| T-P02    | `CreateRecipeUseCase` モック（`servings: null` を返す DTO） | `POST /api/recipes` with `servings` フィールドなし（既存クライアント相当） | HTTP 201、レスポンス JSON の `servings === null` |
| T-P03    | `CreateRecipeUseCase` モック（`servings: null` を返す DTO） | `POST /api/recipes` with `{ ..., servings: null }`                         | HTTP 201、レスポンス JSON の `servings === null` |

#### 異常系（Zod バリデーション）

| ケースID | 前提 | 操作                                              | 期待結果                       |
| -------- | ---- | ------------------------------------------------- | ------------------------------ |
| T-P04    | -    | `POST /api/recipes` with `{ ..., servings: 0 }`   | HTTP 400、UseCase が呼ばれない |
| T-P05    | -    | `POST /api/recipes` with `{ ..., servings: -1 }`  | HTTP 400、UseCase が呼ばれない |
| T-P06    | -    | `POST /api/recipes` with `{ ..., servings: 1.5 }` | HTTP 400、UseCase が呼ばれない |

### 5-2. `PUT /api/recipes/:id`

| ケースID | 前提                                                        | 操作                                                  | 期待結果                                         |
| -------- | ----------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| T-P07    | `UpdateRecipeUseCase` モック（`servings: 2` を返す DTO）    | `PUT /api/recipes/:id` with `{ ..., servings: 2 }`    | HTTP 200、レスポンス JSON の `servings === 2`    |
| T-P08    | `UpdateRecipeUseCase` モック（`servings: null` を返す DTO） | `PUT /api/recipes/:id` with `{ ..., servings: null }` | HTTP 200、レスポンス JSON の `servings === null` |
| T-P09    | `UpdateRecipeUseCase` モック（`servings: null` を返す DTO） | `PUT /api/recipes/:id` with `servings` 省略           | HTTP 200、レスポンス JSON の `servings === null` |
| T-P10    | -                                                           | `PUT /api/recipes/:id` with `{ ..., servings: 0 }`    | HTTP 400、UseCase が呼ばれない                   |

### 5-3. `GET /api/recipes`

| ケースID | 前提                                                                       | 操作               | 期待結果                                                   |
| -------- | -------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------- |
| T-P11    | `GetRecipesUseCase` モック（`servings: 4` / `servings: null` の 2 件 DTO） | `GET /api/recipes` | HTTP 200、各要素に `servings` フィールドが存在し値が正しい |

### 5-4. `GET /api/recipes/:id`

| ケースID | 前提                                              | 操作                   | 期待結果                                                 |
| -------- | ------------------------------------------------- | ---------------------- | -------------------------------------------------------- |
| T-P12    | `GetRecipeUseCase` モック（`servings: 3` の DTO） | `GET /api/recipes/:id` | HTTP 200、レスポンス JSON に `servings === 3` が存在する |

---

## 6. 後方互換・回帰試験（T-REG）

各層の試験に組み込む観点を以下にまとめる。

### 6-1. API 契約の後方互換

| ケースID | 確認観点                                                                   | 対象ケース    |
| -------- | -------------------------------------------------------------------------- | ------------- |
| T-REG01  | 既存クライアントが `servings` を送信しない POST リクエストが通過する       | T-C09 / T-P02 |
| T-REG02  | 既存クライアントが `servings` を送信しない PUT リクエストが通過する        | T-C18 / T-P09 |
| T-REG03  | レスポンスに `servings` フィールドが追加されても既存フィールドが欠落しない | T-P11 / T-P12 |

### 6-2. 型安全の回帰確認（TypeScript コンパイルで担保）

| ケースID | 確認観点                                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| T-REG04  | `CreateRecipeBody['servings']` が `number \| null \| undefined` 型である（`pnpm type-check` で確認）       |
| T-REG05  | `RecipeDto['servings']` が `number \| null` 型である（`?` なし必須フィールド）（`pnpm type-check` で確認） |

### 6-3. 既存テストの回帰影響

| ケースID | 影響ファイル                                                           | 対処                                                             |
| -------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| T-REG06  | `recipe.test.ts` の `Recipe.reconstruct()` 呼び出し                    | `RecipeProps` に `servings: null` を追加（コンパイルエラー修正） |
| T-REG07  | `recipe-use-cases.test.ts` の `seededRecipe()` ヘルパー                | `RecipeProps` に `servings: null` を追加                         |
| T-REG08  | `recipe.mapper.test.ts` の `buildRecipe()` ヘルパー                    | `RecipeProps` に `servings: null` を追加                         |
| T-REG09  | 既存の `Recipe.create()` テスト群（`servings` なし）が引き続き通過する | `servings` 省略時のデフォルト null 動作が維持される（T-D03）     |

---

## 7. 冪等性確認

| ケースID | 対象                                       | 確認観点                                                                           |
| -------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| T-I03    | `DrizzleRecipeRepository.save()` の upsert | `servings` を `onConflictDoUpdate` の `set` 句に含むことで再送時も同一値に収束する |
| T-A05    | `UpdateRecipeUseCase`                      | `servings: null` で更新後、再度同じリクエストを送っても `servings === null` のまま |

---

## 8. 試験データ

### 有効な `servings` 値

| 値                  | 区分           | 用途                 |
| ------------------- | -------------- | -------------------- |
| `1`                 | 境界値・最小   | 正常系の下限         |
| `4`                 | 正常値         | 一般的なテストデータ |
| `null`              | 正常値         | 値なし               |
| `undefined`（省略） | 正常値（省略） | 既存クライアント相当 |

### 無効な `servings` 値

| 値     | 区分             | 期待エラー                               |
| ------ | ---------------- | ---------------------------------------- |
| `0`    | 境界値・最小無効 | `too_small`（Zod）/ ドメインエラー       |
| `-1`   | 異常値・負数     | `too_small`（Zod）/ ドメインエラー       |
| `1.5`  | 異常値・小数     | `not_multiple_of`（Zod）/ ドメインエラー |
| `"4"`  | 型不正・文字列   | `invalid_type`（Zod）                    |
| `true` | 型不正・真偽値   | `invalid_type`（Zod）                    |

---

## 9. 完了条件

- [ ] 境界値（0 / 負値 / 小数 / 省略 / null / 最小値 1）がすべての対象層で網羅されている
- [ ] 後方互換（既存クライアント・既存 DB データ）の回帰観点（T-REG01〜T-REG09）が含まれる
- [ ] 層ごとにケース ID（T-D / T-C / T-A / T-MAP / T-I / T-P / T-REG）が整理されている
- [ ] `RecipeProps` の `servings` フィールド追加に伴う既存テストヘルパーの型修正が記録されている
- [ ] `pnpm test` が全パッケージで通過する（implementer の責務）
- [ ] `pnpm type-check` が通過する（T-REG04 / T-REG05 の型安全確認を含む）

---

## 10. 試験実施順序（推奨）

1. **Domain** — ドメインロジックが正しいことを確認してから上位層へ進む
2. **api-contract** — Zod スキーマの境界値を単独で確認する
3. **Application Mapper** — DTO 変換の正確性を確認する
4. **Application UseCase** — ドメイン + Mapper の統合を InMemory Repository で確認する
5. **Infrastructure** — PGlite で永続化の往復を確認する
6. **Presentation** — Hono ルート + Zod バリデーションを UseCase モックで確認する
