# Sprint 1：Drizzle スキーマ実装指針

Codex への実装指示書。実装後は必ず Claude Code でレビューを受けること。

---

## 事前確認

実装前に以下を必ず読むこと。

- `docs/03-architecture.md`（ディレクトリ構成・DB スキーマとドメインモデルの責務分離）
- `docs/04-domain-model.md`（Recipe 集約の構造）
- `docs/07-dev-rules.md`（コーディング規約）

---

## タスク概要

`apps/web/src/db/schema.ts` に `recipes` テーブルの Drizzle スキーマを追加し、マイグレーションを実行する。

ドメインモデルとしての Recipe 集約は `packages/domain/src/recipe/` に実装済み。
このタスクは DB 永続化のためのスキーマ定義のみを扱う。

---

## 前提知識

### JSONB を使う理由

Recipe 集約は `ingredients`（材料）と `steps`（手順）をネストした構造で持つ。
これらは Recipe なしには存在しない「Recipe の一部」であり、常に Recipe ごと読み書きする。
そのため JOIN を使わず JSONB カラムに配列ごと格納し、1クエリで集約全体を取得する設計を採用する。

---

## 変更するファイル

```
apps/web/src/db/schema.ts   ← recipes テーブルを追加する
```

マイグレーションファイルは `pnpm db:generate` / `pnpm db:migrate` コマンドで自動生成・適用される。

---

## スキーマ定義の仕様

### インポート

```typescript
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
```

### テーブル定義

```typescript
export const recipes = pgTable('recipes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  baseServings: integer('base_servings').notNull(),
  cookingTime: integer('cooking_time'),
  tags: text('tags').array().notNull().default([]),
  notes: text('notes').notNull().default(''),
  ingredients: jsonb('ingredients').notNull().default([]),
  steps: jsonb('steps').notNull().default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

### 各カラムの仕様

| カラム名        | 型          | 制約                     | 説明                               |
| --------------- | ----------- | ------------------------ | ---------------------------------- |
| `id`            | `text`      | PRIMARY KEY              | UUID 文字列（ドメイン側で採番）    |
| `name`          | `text`      | NOT NULL                 | レシピ名                           |
| `base_servings` | `integer`   | NOT NULL                 | 基準人数                           |
| `cooking_time`  | `integer`   | NULL 許容                | 調理時間（分単位）                 |
| `tags`          | `text[]`    | NOT NULL, DEFAULT `'{}'` | レシピタグの配列                   |
| `notes`         | `text`      | NOT NULL, DEFAULT `''`   | メモ                               |
| `ingredients`   | `jsonb`     | NOT NULL, DEFAULT `'[]'` | 材料の配列（構造は下記参照）       |
| `steps`         | `jsonb`     | NOT NULL, DEFAULT `'[]'` | 手順の配列（構造は下記参照）       |
| `created_at`    | `timestamp` | NOT NULL, DEFAULT NOW()  | 作成日時                           |
| `updated_at`    | `timestamp` | NOT NULL, DEFAULT NOW()  | 更新日時（アプリ側で更新すること） |

### JSONB カラムの格納構造

JSONB の中身の型は DB では強制されないため、アプリ側で必ず以下の構造に従うこと。

#### `ingredients` の各要素

```typescript
type IngredientRow = {
  productRef: string | null; // ProductId の UUID 文字列、未登録なら null
  displayName: string; // 表示名（「玉ねぎ」など）
  amountValue: number | null; // 数値量。amountNote と排他（両方 null または片方のみ）
  amountUnit: string | null; // 単位（Unit 型の値）。amountValue が null なら null
  amountNote: string | null; // テキスト量（「少々」など）。amountValue と排他
};
```

#### `steps` の各要素

```typescript
type StepRow = {
  description: string; // 手順の説明文
};
```

手順の順序は配列インデックスで管理する。`order` フィールドは持たない。

---

## 型エクスポート

スキーマ定義と合わせて、Repository 実装で使う型をエクスポートすること。

```typescript
export type RecipeRow = typeof recipes.$inferSelect;
export type NewRecipeRow = typeof recipes.$inferInsert;
```

---

## 実装手順

1. `apps/web/src/db/schema.ts` を開き、既存の `export const schema = {}` を削除する
2. 上記のテーブル定義と型エクスポートを追加する
3. マイグレーションファイルを生成する

   ```bash
   cd apps/web
   pnpm db:generate
   ```

4. 生成されたマイグレーション SQL を `apps/web/src/db/migrations/` で確認する
5. マイグレーションを実行する

   ```bash
   pnpm db:migrate
   ```

---

## 共通の注意事項

- `any` 型は禁止。`unknown` を使う
- デフォルトエクスポートは禁止。名前付きエクスポートのみ
- コメントは「なぜ（Why）」が非自明な場合のみ書く

---

## 完了条件

- [ ] `apps/web/src/db/schema.ts` に `recipes` テーブルが定義されている
- [ ] `RecipeRow` / `NewRecipeRow` 型がエクスポートされている
- [ ] `pnpm db:generate` でマイグレーションファイルが生成されている
- [ ] `pnpm db:migrate` でマイグレーションがエラーなく完了している
- [ ] 実装後に Claude Code へレビュー依頼を行う
