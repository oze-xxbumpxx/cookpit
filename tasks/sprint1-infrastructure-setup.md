# Sprint 1：Infrastructure 準備（スキーマ移動・依存追加）

Codex への実装指示書。実装後は必ず Claude Code でレビューを受けること。

---

## 事前確認

実装前に以下を必ず読むこと。

- `docs/03-architecture.md`（パッケージ間の依存関係・ディレクトリ構成）
- `docs/07-dev-rules.md`（コーディング規約）

---

## タスク概要

現在 `apps/web/src/db/schema.ts` にある Drizzle スキーマを `packages/infrastructure` に移動し、
Repository 実装の土台を整える。

### なぜ移動するか

`packages/infrastructure` に Repository を置く場合、スキーマを `apps/web` からインポートすると
`packages → apps` の依存方向が生まれ、アーキテクチャ原則（外側 → 内側のみ）に違反する。
スキーマは Infrastructure 層の責務であるため `packages/infrastructure` に置くのが正しい。

---

## 変更するファイル一覧

```
変更・追加
packages/infrastructure/package.json          ← 依存追加
packages/infrastructure/src/db/schema.ts      ← 新規作成（apps/web から移動）
packages/infrastructure/src/index.ts          ← schema のエクスポートを追加

更新
apps/web/src/db/client.ts                     ← インポートパスを変更
apps/web/drizzle.config.ts                    ← スキーマパスを変更

削除
apps/web/src/db/schema.ts                     ← packages/infrastructure に移動したため削除
```

---

## 手順

### ステップ 1：`packages/infrastructure/package.json` に依存を追加

```json
{
  "name": "@cookpit/infrastructure",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@cookpit/domain": "workspace:*",
    "@neondatabase/serverless": "^1.1.0",
    "drizzle-orm": "^0.45.2"
  },
  "devDependencies": {
    "@cookpit/config": "workspace:*",
    "@types/node": "^20",
    "typescript": "^5.8.3"
  }
}
```

バージョン番号は `apps/web/package.json` に記載のものと揃えること。

---

### ステップ 2：`packages/infrastructure/src/db/schema.ts` を作成

`apps/web/src/db/schema.ts` の内容をそのままコピーする。

```typescript
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const recipes = pgTable('recipes', {
  id:           text('id').primaryKey(),
  name:         text('name').notNull(),
  baseServings: integer('base_servings').notNull(),
  cookingTime:  integer('cooking_time'),
  tags:         text('tags').array().notNull().default([]),
  notes:        text('notes').notNull().default(''),
  ingredients:  jsonb('ingredients').notNull().default([]),
  steps:        jsonb('steps').notNull().default([]),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
});

export type RecipeRow = typeof recipes.$inferSelect;
export type NewRecipeRow = typeof recipes.$inferInsert;
```

---

### ステップ 3：`packages/infrastructure/src/index.ts` を更新

```typescript
export * from './db/schema';
```

---

### ステップ 4：`apps/web/drizzle.config.ts` のスキーマパスを更新

```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: '../../packages/infrastructure/src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

---

### ステップ 5：`apps/web/src/db/client.ts` のインポートパスを更新

スキーマを `@cookpit/infrastructure` からインポートするよう変更する。

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@cookpit/infrastructure';

const createDb = () => {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  return drizzle(neon(url), { schema });
};

export const db = createDb();
```

---

### ステップ 6：`apps/web/src/db/schema.ts` を削除

`packages/infrastructure/src/db/schema.ts` に移動完了のため削除する。

---

### ステップ 7：動作確認

```bash
# ルートで実行
pnpm install

# スキーマ移動後、差分がないことを確認（新しいマイグレーションが生成されないはず）
pnpm --filter @cookpit/web db:generate

# 型チェック
pnpm --filter @cookpit/infrastructure type-check
pnpm --filter @cookpit/web type-check
```

`db:generate` で新しいマイグレーションファイルが生成された場合、スキーマ定義が変わっている可能性があるため Claude Code に確認すること。

---

## 共通の注意事項

- `any` 型は禁止。`unknown` を使う
- デフォルトエクスポートは禁止。名前付きエクスポートのみ
- コメントは「なぜ（Why）」が非自明な場合のみ書く

---

## 完了条件

- [ ] `pnpm install` がエラーなく完了している
- [ ] `pnpm --filter @cookpit/web db:generate` で新しいマイグレーションファイルが生成されない
- [ ] `pnpm --filter @cookpit/infrastructure type-check` がエラーなく通る
- [ ] `pnpm --filter @cookpit/web type-check` がエラーなく通る
- [ ] 実装後に Claude Code へレビュー依頼を行う
