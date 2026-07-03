# 実装計画: recipe-servings

- 前提となる設計書: `docs/designs/recipe-servings.md`
- レベル: L2
- 作成日: 2026-07-03

---

## 前提・確認済み設計判断

設計書は architecture-designer + contract-designer 確定済み（ステータス: draft、未決事項なし）。
本計画は設計書の内容を忠実に分解したものであり、追加の設計判断は行っていない。

実装者が注意すべき実装上の制約が 1 点ある（設計書 §2 から派生する型システム上の必然）:

> **Private フィールド名の衝突**: 現行の `packages/domain/src/recipe/recipe.ts` はコンストラクタ内に
> `private servings: number`（`baseServings` 値を格納）という private フィールドを持つ。
> 設計書が要求する `get servings(): number | null` ゲッターを追加すると TypeScript の重複識別子エラーが発生する。
> 既存の private フィールドを `private baseServingsValue: number` に改名し、
> `get baseServings()` の返り値も `this.baseServingsValue` に更新する必要がある。
> これはリネームのみで動作変更はない。

---

## 変更対象ファイル（修正）

| # | パス | 変更理由 |
|---|---|---|
| 1 | `packages/api-contract/src/recipe.schema.ts` | `servings` フィールドを両スキーマに追加 |
| 2 | `packages/domain/src/recipe/recipe.ts` | Entity フィールド・バリデーション・メソッド追加、private フィールド改名 |
| 3 | `packages/application/src/recipe/recipe.dto.ts` | `servings` フィールドを 3 インターフェースに追加 |
| 4 | `packages/application/src/recipe/recipe.mapper.ts` | `toRecipeDto()` に `servings` マッピング追加 |
| 5 | `packages/application/src/recipe/create-recipe.use-case.ts` | `Recipe.create()` への `servings` 引き渡し追加 |
| 6 | `packages/application/src/recipe/update-recipe.use-case.ts` | `recipe.updateServings()` 呼び出し追加 |
| 7 | `packages/infrastructure/src/db/schema.ts` | `servings` カラム定義追加 |
| 8 | `packages/infrastructure/src/repositories/drizzle-recipe.repository.ts` | `toEntity()`・`toRow()`・`save()` の `servings` 対応 |
| 9 | `packages/infrastructure/src/testing/create-test-db.ts` | テスト用 DDL に `servings integer` カラム追加 |
| 10 | `packages/domain/src/recipe/recipe.test.ts` | T-D01〜T-D11 追加 |
| 11 | `packages/application/src/recipe/recipe-use-cases.test.ts` | `seededRecipe` ヘルパー更新 + T-A01〜T-A04 追加 |
| 12 | `packages/application/src/recipe/recipe.mapper.test.ts` | `toRecipeDto` テストに `servings` フィールドの検証を追加 |

## 新規作成ファイル

| # | パス | 作成理由 |
|---|---|---|
| 13 | `apps/web/src/db/migrations/0004_*.sql` | `drizzle-kit generate` による自動生成（ALTER TABLE） |
| 14 | `packages/infrastructure/src/repositories/drizzle-recipe.repository.test.ts` | T-I01〜T-I03（Recipe Repository 結合テスト） |
| 15 | `apps/web/src/server/routes/recipes.test.ts` | T-P01〜T-P05（Hono ルートテスト） |

---

## 実装ステップ

### Step 1: infrastructure DB スキーマ更新（ブロッカー: migration 生成）

**対象ファイル**: `packages/infrastructure/src/db/schema.ts`

**変更内容**:
`recipes` テーブル定義の `steps` フィールドと `createdAt` フィールドの間（設計書 §4 の差分参照）に以下を追加する。

```
servings: integer('servings'),
```

`.notNull()` なし・`.default()` なし（NULL 許可、既存行は NULL）。

**完了条件**:
- `RecipeRow`（`typeof recipes.$inferSelect`）の型に `servings: number | null` が含まれること。
- `pnpm type-check`（`packages/infrastructure` スコープ）がエラーなしで通ること。

---

### Step 2: migration ファイル生成

**作業**: `apps/web/` で `drizzle-kit generate` を実行する。

```
cd apps/web
pnpm drizzle-kit generate
```

**生成先**: `apps/web/src/db/migrations/0004_<drizzle-generated-name>.sql`

**生成内容の確認**: 生成された SQL が以下のみを含むことを確認する。

```sql
ALTER TABLE "recipes" ADD COLUMN "servings" integer;
```

それ以外の差分（`DROP COLUMN` など）が含まれていれば、Step 1 の schema.ts に意図しない変更が混入している可能性があるため差し戻すこと。

**完了条件**:
- `apps/web/src/db/migrations/0004_*.sql` が存在し、上記 ALTER TABLE 文のみを含む。
- `apps/web/src/db/migrations/meta/_journal.json` の `entries` に `idx: 4` のエントリが追加される。

**依存**: Step 1 完了後に実施。

---

### Step 3: テスト用 DDL 更新

**対象ファイル**: `packages/infrastructure/src/testing/create-test-db.ts`

**変更内容**:
`DDL` 定数内の `recipes` テーブル定義に `servings` カラムを追加する。

```
-- 変更前
  steps jsonb NOT NULL DEFAULT '[]',
  created_at timestamp NOT NULL DEFAULT now(),

-- 変更後
  steps jsonb NOT NULL DEFAULT '[]',
  servings integer,
  created_at timestamp NOT NULL DEFAULT now(),
```

コメントが示す通り、このファイルは `schema.ts` と機械的に対応させる（設計書 §5.4 案 b の注釈による）。Step 1 で `schema.ts` に追加したカラムをここにも反映させる。

**完了条件**:
- DDL を適用した PGlite テスト DB の `recipes` テーブルに `servings integer` カラムが存在すること（Step 5 の infrastructure テストで確認できる）。

**依存**: Step 1 完了後に実施。Step 2 とは独立（並行可）。

---

### Step 4: domain Entity 更新

**対象ファイル**: `packages/domain/src/recipe/recipe.ts`

**変更内容**:

1. **インターフェース `CreateRecipeInput` にフィールド追加**:
   ```
   servings?: number | null
   ```

2. **インターフェース `RecipeProps` にフィールド追加**:
   ```
   servings: number | null
   ```

3. **コンストラクタの private フィールド改名**:
   既存の `private servings: number`（baseServings を格納していた）を `private baseServingsValue: number` に改名する。
   これにより、後続で追加する `get servings()` ゲッターとの重複識別子エラーを回避する。

4. **コンストラクタに新 private フィールドを追加**:
   `private servingsValue: number | null` をコンストラクタパラメータの最後に追加する。

5. **`get baseServings()` ゲッターの更新**:
   改名後のフィールドを返すよう `this.servings` → `this.baseServingsValue` に変更する。

6. **`static create()` の変更**:
   - `input.servings` を受け取り、`null` でない場合に `Number.isInteger(v) && v >= 1` を検証する。
   - エラーメッセージ: `'Recipe servings must be a positive integer'`
   - `new Recipe(...)` 呼び出しの末尾に `input.servings ?? null` を追加する。

7. **`static reconstruct()` の変更**:
   - `new Recipe(...)` 呼び出しの末尾に `props.servings` を追加する（バリデーションなし）。

8. **`get servings(): number | null` ゲッターを追加**:
   ```typescript
   get servings(): number | null {
     return this.servingsValue;
   }
   ```

9. **`updateServings(servings: number | null): void` メソッドを追加**:
   - `null` 以外の場合に `Number.isInteger(servings) && servings >= 1` を検証する。
   - エラーメッセージ: `'Recipe servings must be a positive integer'`
   - `this.servingsValue = servings` + `this.touch()` を呼ぶ。

**完了条件**:
- `get baseServings()` が引き続き正しく動作すること（既存テストが通ること）。
- `Recipe.create({ servings: 4 }).servings === 4` が成立すること。
- `Recipe.create({ servings: 0 })` がエラーをスローすること。
- `pnpm type-check`（`packages/domain` スコープ）がエラーなしで通ること。

**依存**: 他ステップに依存しない（Step 1 と並行可）。

---

### Step 5: application 層更新

**依存**: Step 4（domain Entity の変更）完了後に実施。Step 1〜3 とは独立して開始できる。

#### Step 5-a: `recipe.dto.ts`

**対象ファイル**: `packages/application/src/recipe/recipe.dto.ts`

**変更内容**:

- `RecipeDto` に必須フィールドを追加: `servings: number | null`（`?` なし）
- `CreateRecipeInputDto` に任意フィールドを追加: `servings?: number | null`
- `UpdateRecipeInputDto` に任意フィールドを追加: `servings?: number | null`

**完了条件**:
- `RecipeDto['servings']` の型が `number | null`（必須、`undefined` を含まない）であること。
- `CreateRecipeInputDto['servings']` の型が `number | null | undefined` であること。

#### Step 5-b: `recipe.mapper.ts`

**対象ファイル**: `packages/application/src/recipe/recipe.mapper.ts`

**変更内容**:
`toRecipeDto()` 関数の返却オブジェクトに `servings: recipe.servings` を追加する。

**完了条件**:
- `toRecipeDto()` が `servings` フィールドを返すこと。

#### Step 5-c: `create-recipe.use-case.ts`

**対象ファイル**: `packages/application/src/recipe/create-recipe.use-case.ts`

**変更内容**:
`Recipe.create()` 呼び出しに `servings: input.servings ?? null` を追加する。

`input.servings` が `undefined`（省略）の場合も `?? null` で `null` に正規化して渡す。

**完了条件**:
- `CreateRecipeInputDto.servings` が `undefined` のとき `Recipe.create()` に `null` が渡ること。

#### Step 5-d: `update-recipe.use-case.ts`

**対象ファイル**: `packages/application/src/recipe/update-recipe.use-case.ts`

**変更内容**:
既存の `recipe.updateNotes(input.notes)` の後（`recipeRepository.save()` の前）に以下を追加する。

```
recipe.updateServings(input.servings ?? null);
```

`input.servings` が `undefined`（省略）の場合も `?? null` で正規化する。

**完了条件**:
- 更新 UseCase が `servings` を `null` に正規化してドメインへ渡すこと。
- `pnpm type-check`（`packages/application` スコープ）がエラーなしで通ること。

---

### Step 6: infrastructure Repository 更新

**対象ファイル**: `packages/infrastructure/src/repositories/drizzle-recipe.repository.ts`

**依存**: Step 1（schema.ts）完了後・Step 4（domain）完了後に実施。

**変更内容**:

1. **`toEntity()` の変更**:
   `Recipe.reconstruct()` 呼び出しに `servings: row.servings ?? null` を追加する。
   （`row.servings` が DB から `null` として来る場合も `?? null` でフォールバック）

2. **`toRow()` の変更**:
   返却オブジェクトに `servings: recipe.servings` を追加する。

3. **`save()` の変更**:
   `onConflictDoUpdate` の `set` オブジェクトに `servings: row.servings` を追加する。
   これにより upsert 時の冪等性を保持する。

**完了条件**:
- `save(recipe)` → `findById(id)` の往復で `recipe.servings` が保持されること。
- `pnpm type-check`（`packages/infrastructure` スコープ）がエラーなしで通ること。

---

### Step 7: テスト追加・更新

**依存**: Step 4〜6 の実装完了後に実施（テスト対象コードが揃ってから追加する）。

#### Step 7-a: domain テスト追加

**対象ファイル**: `packages/domain/src/recipe/recipe.test.ts`

**追加するテストケース**（設計書「テスト方針 Domain 層」T-D01〜T-D11）:

`Recipe.create` describe ブロックに追加:
- T-D01: `Recipe.create({ servings: 4 })` → `recipe.servings === 4`
- T-D02: `Recipe.create({ servings: null })` → `recipe.servings === null`
- T-D03: `Recipe.create()` で `servings` 省略 → `recipe.servings === null`
- T-D04: `Recipe.create({ servings: 0 })` → エラー `'Recipe servings must be a positive integer'`
- T-D05: `Recipe.create({ servings: -1 })` → エラー `'Recipe servings must be a positive integer'`
- T-D06: `Recipe.create({ servings: 1.5 })` → エラー `'Recipe servings must be a positive integer'`

`Recipe の状態変更` describe ブロックに追加:
- T-D07: `recipe.updateServings(2)` → `servings === 2`、`updatedAt` が createdAt 以降に進む
- T-D08: `recipe.updateServings(null)` → `servings === null`
- T-D09: `recipe.updateServings(0)` → エラー `'Recipe servings must be a positive integer'`

`Recipe.reconstruct` describe ブロックに追加:
- T-D10: `Recipe.reconstruct({ servings: 3 })` → `recipe.servings === 3`
- T-D11: `Recipe.reconstruct({ servings: null })` → `recipe.servings === null`

既存テストの更新:
- `Recipe.reconstruct` の既存テスト（R12）で使用している `RecipeProps` を構築する箇所に
  `servings: null` を追加する（インターフェース変更により必須フィールドになるため）。

**完了条件**: `pnpm test`（`packages/domain`）が全て pass すること。

#### Step 7-b: application use-case テスト追加

**対象ファイル**: `packages/application/src/recipe/recipe-use-cases.test.ts`

**既存ヘルパー更新**:
`seededRecipe` ヘルパー関数の `Recipe.reconstruct()` 呼び出しに `servings: null` を追加する
（`RecipeProps` のインターフェース変更による必須化）。

`baseInput`（`CreateRecipeInputDto`）は `servings` を任意フィールドとして持つため変更不要。
`updateInput`（`UpdateRecipeInputDto`）も同様。

**追加テストケース**（T-A01〜T-A04）:

`CreateRecipeUseCase` describe ブロックに追加:
- T-A01: `execute({ ...baseInput, servings: 4 })` → DTO `servings === 4`
- T-A02: `execute(baseInput)`（`servings` 省略）→ DTO `servings === null`

`UpdateRecipeUseCase` describe ブロックに追加:
- T-A03: `execute({ ...updateInput, servings: 2 })` → DTO `servings === 2`
- T-A04: `execute({ ...updateInput, servings: null })` → DTO `servings === null`

既存テストの `seededRecipe` ヘルパーを `Recipe.reconstruct({ ..., servings: null })` に更新する。

**完了条件**: `pnpm test`（`packages/application`）が全て pass すること。

#### Step 7-c: application mapper テスト更新

**対象ファイル**: `packages/application/src/recipe/recipe.mapper.test.ts`

**既存テスト更新**:

`toRecipeDto` describe ブロック内の `buildRecipe()` ヘルパーが `Recipe.reconstruct()` を呼んでおり、
`RecipeProps` に `servings` が必須化されるため `servings: null`（または適切な値）を追加する。

M8（「Recipe の全フィールドを RecipeDto に変換する」）のアサーションに
`expect(dto.servings).toBeNull()` を追加する。

cookingTime が null のケース（M11）など `Recipe.reconstruct()` を使う全テストの props に
`servings: null` を追加する。

**完了条件**: `pnpm test`（`packages/application`）が全て pass すること。

#### Step 7-d: infrastructure Recipe Repository テスト新規作成

**対象ファイル（新規）**: `packages/infrastructure/src/repositories/drizzle-recipe.repository.test.ts`

`drizzle-product.repository.test.ts` の構造（`createTestDb()` + `beforeEach`）を参照して作成する。

**テストケース**（T-I01〜T-I03）:

```
describe('DrizzleRecipeRepository', () => {
  // beforeEach: createTestDb() + DrizzleRecipeRepository 初期化

  // T-I01: save() → findById() で servings: 4 が保持される
  // T-I02: save() → findById() で servings: null が保持される
  // T-I03: save(insert) → save(update: updateServings(2)) → findById() で servings が 2 に更新される
})
```

各テスト内で `Recipe.create()` または `Recipe.reconstruct()` を使って Entity を構築し、
`repository.save()` → `repository.findById()` のラウンドトリップで値が保持されることを確認する。

**完了条件**: `pnpm test`（`packages/infrastructure`）が全て pass すること。

#### Step 7-e: Hono ルートテスト新規作成

**対象ファイル（新規）**: `apps/web/src/server/routes/recipes.test.ts`

`apps/web/src/server/routes/products.test.ts` のモック構造を参照して作成する。
- `vi.mock('@/db/client', ...)` で DB をモック
- `vi.mock('@cookpit/application', ...)` で UseCase をモック
- Hono `app` に対して `app.request()` または `fetch` で HTTP リクエストを送信

**テストケース**（T-P01〜T-P05、設計書「テスト方針 Hono ルート」参照）:

```
describe('recipesRoute', () => {
  // T-P01: POST /api/recipes with servings: 4 → 201、response.servings === 4
  // T-P02: POST /api/recipes without servings → 201、response.servings === null
  // T-P03: PUT /api/recipes/:id with servings: 2 → 200、response.servings === 2
  // T-P04: GET /api/recipes → 200、各要素に servings フィールドが存在する
  // T-P05: GET /api/recipes/:id → 200、servings フィールドが存在する
})
```

T-P01/T-P02 では `CreateRecipeUseCase.execute` のモック戻り値に `servings` を含む `RecipeDto` を設定する。
T-P03 では `UpdateRecipeUseCase.execute` のモック戻り値に `servings: 2` の `RecipeDto` を設定する。

**完了条件**: `pnpm test`（`apps/web` の node プロジェクト）が全て pass すること。

---

### Step 8: 品質ゲート

**依存**: 全 Step 完了後に実施。

```bash
# 型チェック（モノレポ全体）
pnpm type-check

# lint
pnpm lint

# テスト（変更が生じた全パッケージ）
pnpm test
```

確認対象パッケージ:
- `packages/domain`
- `packages/application`
- `packages/infrastructure`
- `apps/web`

**完了条件**: 上記すべてがエラーなしで通ること。

---

## 依存関係グラフ

```
Step 1 (schema.ts) ─────────────────────────────────┐
Step 2 (migration) ← Step 1 のみ                     │
Step 3 (test DDL) ← Step 1 のみ                      │
Step 4 (domain) ─────────────────────────────────────┼────┐
Step 5-a (dto) ← Step 4                              │    │
Step 5-b (mapper) ← Step 4, 5-a                      │    │
Step 5-c (create-uc) ← Step 4, 5-a                   │    │
Step 5-d (update-uc) ← Step 4, 5-a                   │    │
Step 6 (repository) ← Step 1, Step 4 ───────────────┘    │
Step 7-a (domain test) ← Step 4 ─────────────────────────┘
Step 7-b (uc test) ← Step 4, 5-a, 5-c, 5-d
Step 7-c (mapper test) ← Step 4, 5-a, 5-b
Step 7-d (infra test) ← Step 1, 3, 4, 6
Step 7-e (route test) ← Step 1, 5-a, 5-c, 5-d
Step 8 (quality gate) ← 全 Step
```

**並行実施可能な組み合わせ**:
- Step 1 と Step 4 は独立しており同時に着手できる。
- Step 2（migration）と Step 3（test DDL）は Step 1 完了後に並行できる。
- Step 5-a〜5-d は Step 4 完了後に並行できる。
- Step 6 は Step 1 と Step 4 の両方完了後に着手できる。

---

## リスク対応

### R1: Hono ルートと UseCase の型整合性

設計書 §リスク R1 に記載の通り、`recipes.ts` ルートは変更しない。
Step 8 の `pnpm type-check` で `apps/web` を通した際に型エラーが発生した場合は、
`apps/web/src/server/routes/recipes.ts` の `execute(body)` を
`execute({ ...body, servings: body.servings ?? null })` に変更する。
（ただし設計書はこれを例外処理として位置付けており、通常は変更不要と判断している）

### R2: `baseServings` / `servings` 意味的混在

設計書の説明コメントをドメインコード（`recipe.ts`）の `updateServings` メソッドに残す。
「スケーリング用ではなく表示用アノテーション」であることを Why コメントとして記述する。

---

## ロールバック方法

本変更はすべて後方互換。問題発生時のロールバック手順:

1. **DB ロールバック**: 以下 SQL を本番 DB に適用する。
   ```sql
   ALTER TABLE "recipes" DROP COLUMN "servings";
   ```

2. **コードロールバック**: 作業ブランチの変更を revert し、マイグレーションファイルを削除する。

3. **migration journal 更新**: `apps/web/src/db/migrations/meta/_journal.json` から `idx: 4` のエントリを削除する。

---

## ドキュメント更新箇所

本変更で更新が必要なドキュメント:

| ドキュメント | 更新内容 |
|---|---|
| `docs/04-domain-model.md` | `Recipe` 集約のフィールド一覧に `servings: number \| null`（任意）を追記 |

`docs/designs/recipe-servings.md` のステータスを `confirmed` に更新する（実装完了後）。

---

## 確認事項（実装者へ）

1. **drizzle-kit generate 後の確認**: 生成された migration SQL が `ALTER TABLE "recipes" ADD COLUMN "servings" integer;` のみであること。不要な差分が含まれる場合は `schema.ts` を再確認する。

2. **`api-contract` のテスト不在**: `packages/api-contract` には vitest 設定が存在しない。T-C01〜T-C07（Zod スキーマ境界値テスト）は本計画のスコープ外とする。api-contract のテスト基盤整備は別タスクで対応する。

3. **`apps/web/src/server/routes/recipes.ts` は変更しない**: 設計書 §5 の通り、`zValidator` が自動的に更新済みスキーマを参照するため修正不要。
