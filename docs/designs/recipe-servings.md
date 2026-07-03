# 設計書: recipe-servings

- ステータス: draft
- レベル: L2
- 関連: 変更なし（要件ドキュメント・ADR なし）

---

## 背景

Recipe 集約には `baseServings`（材料スケーリングの基準人数、必須）が存在する。
一方で「このレシピが何人前か」をユーザーが自由に記録する任意アノテーションの場が
ない。`servings`（任意・null 許容）を新規追加することでこのニーズに対応する。

---

## 目的

Recipe 集約に任意項目 `servings`（正の整数・null 許容）を追加し、
一覧・詳細 API のレスポンスおよび作成・更新リクエストで扱えるようにする。

---

## 要件

| # | 要件 |
|---|---|
| 1 | `servings` は 1 以上の正の整数、または null（未設定） |
| 2 | `servings: null` が「値なし」を表す（`undefined` との混在なし） |
| 3 | 作成・更新リクエストで `servings` を省略した場合、null として扱う |
| 4 | レスポンス（一覧・詳細）には常に `servings: number | null` を含む |
| 5 | 既存レシピの `servings` は null（移行データなし） |
| 6 | 既存クライアントは `servings` を送信せずとも動作する（後方互換） |

---

## 対象範囲

以下 5 層すべてに変更が生じる。

1. `packages/api-contract` — Zod スキーマ追加
2. `packages/domain` — Entity フィールド・バリデーション・メソッド追加
3. `packages/application` — DTO・UseCase・Mapper 更新
4. `packages/infrastructure` — DB スキーマ・Repository 更新、マイグレーション追加
5. `apps/web/src/server/routes/recipes.ts` — 変更なし（型は自動反映）

---

## 対象外

- UI（フロントエンドのフォーム表示・詳細表示）
- `baseServings` フィールドへの変更
- MealPlan / ShoppingList など他集約

---

## 現状構成

| 層 | ファイル（絶対パス） | 現状 |
|---|---|---|
| api-contract | `packages/api-contract/src/recipe.schema.ts` | `createRecipeSchema` / `updateRecipeSchema` に `servings` なし |
| domain | `packages/domain/src/recipe/recipe.ts` | `Recipe` に `servings` フィールドなし（`baseServings` のみ） |
| application | `packages/application/src/recipe/recipe.dto.ts` | `RecipeDto` / `CreateRecipeInputDto` / `UpdateRecipeInputDto` に `servings` なし |
| application | `packages/application/src/recipe/recipe.mapper.ts` | `toRecipeDto()` に `servings` マッピングなし |
| application | `packages/application/src/recipe/create-recipe.use-case.ts` | `Recipe.create()` に `servings` なし |
| application | `packages/application/src/recipe/update-recipe.use-case.ts` | `servings` 更新メソッド呼び出しなし |
| infrastructure | `packages/infrastructure/src/db/schema.ts` | `recipes` テーブルに `servings` カラムなし |
| infrastructure | `packages/infrastructure/src/repositories/drizzle-recipe.repository.ts` | `servings` のマッピングなし |
| presentation | `apps/web/src/server/routes/recipes.ts` | スキーマ参照のみ、本変更で修正不要 |

---

## 変更後構成

### `baseServings` と `servings` の意味的区別

本変更を正しく実装するために、両フィールドの役割を明確にする。

| フィールド | 必須 | 用途 |
|---|---|---|
| `baseServings` | 必須 | 材料量スケーリングの基準人数。`scaleIngredients()` の除数。変更しない。 |
| `servings` | 任意 | ユーザーが自由に記録する「このレシピの提供人数」アノテーション。スケーリングには使わない。 |

### 1. api-contract

**ファイル**: `packages/api-contract/src/recipe.schema.ts`

追加フィールド（`createRecipeSchema` / `updateRecipeSchema` 共通）:

```
servings: z.number().int().positive().nullable().optional()
```

- `z.int()` + `z.positive()` で 1 以上の整数に制約
- `.nullable()` で null を許可
- `.optional()` で省略（undefined）を許可し、既存クライアントとの後方互換を保つ
- 推論型: `number | null | undefined`（UseCase 側で `?? null` により null に正規化）

### 2. domain

**ファイル**: `packages/domain/src/recipe/recipe.ts`

**インターフェース変更**:

```
CreateRecipeInput:
  + servings?: number | null

RecipeProps:
  + servings: number | null
```

**クラス変更**:

- プライベートフィールド `private servingsValue: number | null` を追加
- `static create()`: `servings` 引数を受け取り、null でない場合に正の整数チェックを行う
- `static reconstruct()`: `props.servings` をそのまま受け取る（バリデーションなし）
- `get servings(): number | null` getter を追加
- `updateServings(servings: number | null): void` メソッドを追加（バリデーション + `touch()`）

**バリデーションルール**（`create` と `updateServings` の両方で適用）:

```
servings が null でない場合:
  - Number.isInteger(servings) === true
  - servings >= 1
エラーメッセージ: 'Recipe servings must be a positive integer'
```

`null` は無条件に受け入れる。

### 3. application

**ファイル**: `packages/application/src/recipe/recipe.dto.ts`

```
RecipeDto:
  + servings: number | null   // レスポンスには常に存在

CreateRecipeInputDto:
  + servings?: number | null

UpdateRecipeInputDto:
  + servings?: number | null
```

**ファイル**: `packages/application/src/recipe/recipe.mapper.ts`

`toRecipeDto()` に `servings: recipe.servings` を追加。

**ファイル**: `packages/application/src/recipe/create-recipe.use-case.ts`

`Recipe.create()` 呼び出しに `servings: input.servings ?? null` を追加。

**ファイル**: `packages/application/src/recipe/update-recipe.use-case.ts`

`recipe.updateServings(input.servings ?? null)` を追加（`input.servings` が
`undefined` の場合も null に正規化してドメインへ渡す）。

### 4. infrastructure

**ファイル**: `packages/infrastructure/src/db/schema.ts`

`recipes` テーブル定義に追加:

```
servings: integer('servings'),   // nullable 暗黙、.notNull() なし、.default() なし
```

`RecipeRow.servings` の型は `number | null` となる。

**ファイル**: `packages/infrastructure/src/repositories/drizzle-recipe.repository.ts`

- `toEntity()`: `servings: row.servings ?? null` を `Recipe.reconstruct()` に追加
- `toRow()`: `servings: recipe.servings` を追加
- `save()` の `onConflictDoUpdate` の `set` に `servings: row.servings` を追加

**マイグレーション** (次番号: `0004_*`):

```sql
ALTER TABLE "recipes" ADD COLUMN "servings" integer;
```

DEFAULT 指定なし（既存行は自動的に NULL）。

### 5. presentation

**ファイル**: `apps/web/src/server/routes/recipes.ts`

変更なし。`zValidator` は `packages/api-contract` の更新済みスキーマを参照するため、
`servings` のバリデーションは自動的に有効になる。UseCase への引き渡しも既存パターン
（`body` をそのまま渡す）で型整合性が成立する（詳細はリスク R1 参照）。

---

## データフロー

### 作成（POST /api/recipes）

```
Client
  ↓ { name, ..., servings: 4 | null | (省略) }
Hono Route: zValidator('json', createRecipeSchema)
  ↓ body.servings: number | null | undefined
CreateRecipeUseCase.execute({ ...body })
  ↓ servings: input.servings ?? null → Recipe.create({ ..., servings })
Recipe.create() [バリデーション: null でなければ正の整数]
  ↓
DrizzleRecipeRepository.save(recipe)
  ↓ toRow(): { ..., servings: recipe.servings }
DB: INSERT INTO recipes (..., servings) VALUES (...)
  ↓
toRecipeDto(recipe): { ..., servings: number | null }
Response: 201 JSON
```

### 更新（PUT /api/recipes/:id）

```
Client
  ↓ { name, ..., servings: 2 | null | (省略) }
Hono Route: zValidator('json', updateRecipeSchema)
  ↓ body.servings: number | null | undefined
UpdateRecipeUseCase.execute({ id, ...body })
  ↓ recipe.updateServings(input.servings ?? null)
Recipe.updateServings() [バリデーション + touch()]
  ↓
DrizzleRecipeRepository.save(recipe)
  ↓ onConflictDoUpdate set: { ..., servings: row.servings }
DB: UPDATE recipes SET ... servings = ? WHERE id = ?
  ↓
toRecipeDto(recipe): { ..., servings: number | null }
Response: 200 JSON
```

### 取得（GET /api/recipes, GET /api/recipes/:id）

```
DB row: { ..., servings: number | null }
  ↓ toEntity(): Recipe.reconstruct({ ..., servings: row.servings ?? null })
Recipe Entity
  ↓ toRecipeDto(): { ..., servings: number | null }
Response: 200 JSON
```

---

## API 設計

### contract-designer への引き継ぎ

本設計書ではスキーマの要点を示す。詳細な型定義・エラーメッセージ仕様は
contract-designer が `packages/api-contract/src/recipe.schema.ts` で詳細化する。

| 観点 | 設計方針 |
|---|---|
| フィールド名 | `servings` |
| 型（レスポンス） | `number \| null` （integer） |
| 型（リクエスト） | `number \| null \| undefined`（省略可） |
| nullability | null 許可（「値なし」 = null に統一） |
| リクエストバリデーション | 提供時: 正の整数 (>= 1)。null 可。省略（undefined）は null に正規化 |
| レスポンス保証 | 常に `servings` フィールドが存在（`number \| null`） |
| 後方互換 | 既存クライアントは省略可能 |

提案 Zod スキーマ（`createRecipeSchema` / `updateRecipeSchema` 共通）:

```typescript
servings: z.number().int().positive().nullable().optional()
```

---

## DB 設計

### 変更点

テーブル: `public.recipes`

| カラム名 | 型 | 制約 | 変更種別 |
|---|---|---|---|
| `servings` | `integer` | NULL 許可・DEFAULT なし | 追加 |

### 移行 SQL

```sql
ALTER TABLE "recipes" ADD COLUMN "servings" integer;
```

- `NOT NULL` を付けない → 既存行は自動的に NULL
- DEFAULT を設定しない → 新規作成時の「値なし」は明示的 NULL

ロールバック SQL:

```sql
ALTER TABLE "recipes" DROP COLUMN "servings";
```

### Drizzle スキーマ追加

```typescript
// packages/infrastructure/src/db/schema.ts
servings: integer('servings'),
```

`.notNull()` なし、`.default()` なし の状態が意図どおり。

---

## フロントエンド設計

対象外（UI 変更は本スコープ外）。

ただし Hono RPC の型推論は `AppType` 経由でクライアント側に自動伝播するため、
将来フロントエンドが `servings` を使用する際は型補完が効く状態になる。

---

## バックエンド設計

### Hono ルート

`apps/web/src/server/routes/recipes.ts` は変更しない。

`zValidator('json', createRecipeSchema)` / `zValidator('json', updateRecipeSchema)` が
更新済みスキーマを参照することで `servings` の検証が自動的に有効になる。

UseCase への引き渡しは `execute(body)` または `execute({ id, ...body })` の既存パターンを維持する。
型整合性はリスク R1 を参照。

### UseCase 正規化の方針

Zod `.optional()` が返す `undefined` を UseCase 入口で `null` に正規化する。
ドメイン層の `create()` / `updateServings()` は `undefined` を受け取らない設計とする。

```
input.servings ?? null  →  Recipe.create({ servings: number | null })
input.servings ?? null  →  recipe.updateServings(number | null)
```

---

## エラー処理

本変更は既存の DB アクセスパターン（`save` / `findById` / `findAll`）に
カラムを追加するのみで、新規の外部 I/O は発生しない。

- (a) リトライ: 変更なし。Neon Serverless の接続リトライは DB クライアント側で制御。
- (b) タイムアウト: 変更なし。
- (c) 冪等性: `save()` の `onConflictDoUpdate` パターンを踏襲。`servings` を `set` に含めることで再送時も冪等性を保つ。
- (d) 部分失敗: 単一テーブルへの単一クエリのため多段失敗なし。
- (e) フォールバック: 変更なし。

---

## ログと監視

変更なし。既存のエラーハンドリング・ロギングパターンを継承する。

---

## セキュリティ

- Zod バリデーションで `servings` の型（正整数 or null）を入口で検証する。
- SQL インジェクションは Drizzle ORM のパラメータバインディングで防止済み。
- 追加の考慮事項なし。

---

## 性能

- `servings` は単純なスカラーカラムであり、検索条件に使用しないためインデックス不要。
- レスポンスサイズへの影響は 1 フィールドの追加のみ（軽微）。

---

## テスト方針

### Domain 層

ファイル: `packages/domain/src/recipe/recipe.test.ts`

| # | テストケース |
|---|---|
| T-D01 | `Recipe.create({ servings: 4 })` → `recipe.servings === 4` |
| T-D02 | `Recipe.create({ servings: null })` → `recipe.servings === null` |
| T-D03 | `Recipe.create()` で `servings` 省略 → `recipe.servings === null` |
| T-D04 | `Recipe.create({ servings: 0 })` → エラー |
| T-D05 | `Recipe.create({ servings: -1 })` → エラー |
| T-D06 | `Recipe.create({ servings: 1.5 })` → エラー（非整数） |
| T-D07 | `recipe.updateServings(2)` → `servings === 2`、`updatedAt` が進む |
| T-D08 | `recipe.updateServings(null)` → `servings === null` |
| T-D09 | `recipe.updateServings(0)` → エラー |
| T-D10 | `Recipe.reconstruct({ servings: 3 })` → `recipe.servings === 3` |
| T-D11 | `Recipe.reconstruct({ servings: null })` → `recipe.servings === null` |

### Application 層

ファイル: `packages/application/src/recipe/recipe-use-cases.test.ts`

| # | テストケース |
|---|---|
| T-A01 | `CreateRecipeUseCase.execute({ ..., servings: 4 })` → DTO `servings === 4` |
| T-A02 | `CreateRecipeUseCase.execute({ ... })` （`servings` 省略）→ DTO `servings === null` |
| T-A03 | `UpdateRecipeUseCase.execute({ ..., servings: 2 })` → DTO `servings === 2` |
| T-A04 | `UpdateRecipeUseCase.execute({ ..., servings: null })` → DTO `servings === null` |

### api-contract

Zod スキーマのユニットテストが追加される場合（`packages/api-contract` にテストがあれば）:

| # | テストケース |
|---|---|
| T-C01 | `createRecipeSchema` — `servings: 4` でパース成功 |
| T-C02 | `createRecipeSchema` — `servings: null` でパース成功 |
| T-C03 | `createRecipeSchema` — `servings` 省略でパース成功 |
| T-C04 | `createRecipeSchema` — `servings: 0` でエラー |
| T-C05 | `createRecipeSchema` — `servings: -1` でエラー |
| T-C06 | `createRecipeSchema` — `servings: 1.5` でエラー |
| T-C07 | `updateRecipeSchema` — 上記 T-C01〜T-C06 と同様 |

### Infrastructure 層

PGlite を使った Repository 結合テストがある場合:

| # | テストケース |
|---|---|
| T-I01 | `save()` → `findById()` で `servings: 4` が保持される |
| T-I02 | `save()` → `findById()` で `servings: null` が保持される |
| T-I03 | `save()` (insert) → `save()` (update) → `findById()` で `servings` が更新される |

### Hono ルート（E2E / ルートテスト）

ファイル: `apps/web/src/server/routes/` 配下のルートテスト

| # | テストケース |
|---|---|
| T-P01 | `POST /api/recipes` with `servings: 4` → 201、`response.servings === 4` |
| T-P02 | `POST /api/recipes` without `servings` → 201、`response.servings === null` |
| T-P03 | `PUT /api/recipes/:id` with `servings: 2` → 200、`response.servings === 2` |
| T-P04 | `GET /api/recipes` → 各要素に `servings: number | null` が存在する |
| T-P05 | `GET /api/recipes/:id` → `servings: number | null` が存在する |

---

## 移行とリリース

### 手順

1. DB マイグレーション実行（`0004_*` ファイルを `drizzle-kit push` または `migrate` で適用）
2. アプリケーションデプロイ（既存データは `servings = null`、動作に影響なし）

### 後方互換性の確認

| 観点 | 状態 |
|---|---|
| 既存 DB 行 | マイグレーション後 `servings = NULL`。Repository は `null` として扱う |
| 既存クライアント（リクエスト） | `servings` を送信しなくても `.optional()` により通過する |
| 既存クライアント（レスポンス） | `servings` フィールドの追加は非破壊的変更（フィールド追加） |
| 「値なし」の表現 | `null` に統一。`undefined` は UseCase 入口で `null` に正規化 |

---

## リスク

### R1: Hono ルートと UseCase の型整合性

**内容**: `createRecipeSchema` の `servings` が `.optional()` を持つため、
`body.servings` の型は `number | null | undefined`。一方 `CreateRecipeInputDto.servings`
は `number | null | undefined`（`?` 付きプロパティ）なので TypeScript 上は互換だが、
`execute(body)` 呼び出し時の型チェックを実装時に必ず確認する。

**対策**: `pnpm type-check` を通す。型エラーが出た場合はルート内で明示的に
`{ ...body, servings: body.servings ?? null }` と正規化する。

### R2: `baseServings` と `servings` の意味的混在

**内容**: 両フィールドが「何人前か」を表し、ユーザー・開発者に混乱を招く可能性がある。

**対策**: 本設計書の意味的区別（スケーリング用 vs. 表示用アノテーション）を
コードコメントおよびドキュメントに明記する。将来的な統合・整理は別途 ADR で判断する
（今回のスコープ外）。

---

## 未決事項

なし。以下は設計判断として「提案」として確定させているもの。

| 項目 | 採用方針 |
|---|---|
| `servings` と `baseServings` の共存 | 両者を独立フィールドとして共存させる（スコープ外変更を避けるため） |
| 非整数の拒否 | `z.int()` + `Number.isInteger()` の両層でチェック |
| 省略時のデフォルト値 | null（UseCase 側で `?? null` により正規化） |

アーキテクチャ・ドメインモデル・DB スキーマへの確定判断が必要と判断した場合は
Orchestrator 経由でユーザー確認を取ること。
