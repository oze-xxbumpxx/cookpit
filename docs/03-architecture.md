# 03. アーキテクチャ・ディレクトリ構成

## アーキテクチャ方針

Clean Architecture + DDD を、個人開発のスケールに合わせて適用する。

### 層構成

```
┌────────────────────────────────────────────────────┐
│  Presentation Layer                                │
│  ・Next.js Server / Client Components              │
│  ・Hono ルーター                                   │
│  ・shadcn/ui コンポーネント                        │
└──────────────────┬─────────────────────────────────┘
                   │ ユースケース呼び出し
                   ↓
┌────────────────────────────────────────────────────┐
│  Application Layer                                 │
│  ・Use Cases（ユースケース実装）                   │
│  ・DTO（入出力定義）                               │
└──────────────────┬─────────────────────────────────┘
                   │ ドメインモデル操作
                   ↓
┌────────────────────────────────────────────────────┐
│  Domain Layer                                      │
│  ・Entity（集約ルート）                            │
│  ・Value Object                                    │
│  ・Repository Interface                            │
│  ・Domain Service                                  │
└──────────────────┬─────────────────────────────────┘
                   │ Repository 実装で呼ばれる
                   ↓
┌────────────────────────────────────────────────────┐
│  Infrastructure Layer                              │
│  ・Drizzle Repository 実装                         │
│  ・DB 接続                                         │
│  ・外部 API クライアント（Phase 2 以降）           │
└────────────────────────────────────────────────────┘
```

依存方向は外側 → 内側のみ。Domain Layer は他のレイヤーに依存しない。

## モノレポ構成

> 2026-07-25 時点の実装に合わせて更新（project-refactoring / ADR-0010）。
> ソースは `apps/web/src/` 配下（Next.js の `src/` ディレクトリ構成）。

```
cookpit/
├── apps/
│   └── web/                             # Next.js + Hono 一体（@cookpit/web）
│       ├── src/
│       │   ├── proxy.ts                 # セッション検証（Next.js 16 Proxy。ADR-0023）
│       │   ├── app/
│       │   │   ├── api/[[...route]]/
│       │   │   │   └── route.ts         # Hono をマウント
│       │   │   ├── page.tsx             # ダッシュボード
│       │   │   ├── recipes/
│       │   │   ├── meal-plans/
│       │   │   ├── shopping-lists/
│       │   │   ├── pantry/
│       │   │   ├── products/
│       │   │   ├── layout.tsx
│       │   │   └── manifest.ts          # PWA マニフェスト
│       │   ├── server/                  # Hono のサーバー実装
│       │   │   ├── routes/              # recipes / meal-plans / shopping-lists 等
│       │   │   ├── auth/                # Better Auth（createAuth/getAuth。ADR-0023）
│       │   │   ├── repositories.ts      # Repository ファクトリ（DI の入口）
│       │   │   └── app.ts               # Hono アプリ本体（named export）
│       │   ├── db/                      # Neon / PGlite 接続
│       │   ├── components/              # 共有 UI（shadcn 等）
│       │   └── lib/
│       │       ├── api-client.ts        # Hono RPC クライアント
│       │       └── use-api-action.ts    # Client の mutation 共通ヘルパ
│       ├── tests/                       # src/ をミラーする Web テスト
│       │   └── e2e/                     # Playwright E2E スモーク
│       ├── public/
│       └── package.json
│
├── packages/
│   ├── domain/                          # ドメイン層（@cookpit/domain）
│   │   ├── src/
│   │   │   ├── index.ts                 # 公開境界バレル（ADR-0010）
│   │   │   ├── recipe/                  # 集約 + Repository IF
│   │   │   ├── meal-plan/
│   │   │   ├── shopping-list/
│   │   │   ├── pantry/
│   │   │   ├── product/
│   │   │   └── shared/                  # Money / Quantity / Unit / Store 等
│   │   └── tests/                       # src/ をミラーする Domain 単体テスト
│   │
│   ├── application/                     # ユースケース層（@cookpit/application）
│   │   ├── src/
│   │   │   ├── recipe/                  # *UseCase + DTO + mapper
│   │   │   ├── meal-plan/
│   │   │   ├── shopping-list/
│   │   │   ├── pantry/
│   │   │   ├── product/
│   │   │   ├── store/
│   │   │   └── shared/                  # NotFoundError 等の基底・日付ヘルパ
│   │   └── tests/                       # src/ をミラーする UseCase 単体テスト
│   │
│   ├── infrastructure/                  # 永続化層（@cookpit/infrastructure）
│   │   ├── src/
│   │   │   ├── db/                      # schema / client
│   │   │   ├── repositories/            # Drizzle*Repository
│   │   │   └── index.ts                 # バレル（schema を namespace export）
│   │   └── tests/                       # Repository 統合テストとテスト専用ヘルパー
│   │
│   ├── api-contract/                    # API 契約（Zod / @cookpit/api-contract）
│   │   ├── src/
│   │   └── tests/                       # API 契約テスト
│   └── config/                          # eslint / typescript / tailwind
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── docs/
```

各 workspace では、本番コードを `src/`、テストコードとテスト専用ヘルパーを `tests/` に分離する。
`tests/` は対応する `src/` のサブディレクトリ構造をミラーし、テスト対象との対応を明確にする。
本番コードから `tests/` への依存は禁止する。

## パッケージ間の依存関係

```
apps/web
  ├─→ packages/domain
  ├─→ packages/application
  ├─→ packages/infrastructure
  └─→ packages/api-contract

packages/application
  └─→ packages/domain

packages/infrastructure
  ├─→ packages/domain
  └─→ packages/api-contract（必要に応じて）

packages/domain
  └─→ なし（純粋なドメインロジック）
```

`packages/domain` は他に依存しない。これが Clean Architecture の核。

## サーバーサイドの2つのアプローチ

このアプリでは、サーバーサイド処理を呼び出す方法が2通りある。使い分けの方針を明確にする。

### 方法A: Server Component から直接ユースケース呼び出し

初期表示（一覧・詳細の SSR）で使う。Repository は `@/server/repositories` のファクトリ経由で組み立てる（Presentation から `@cookpit/infrastructure` を直接 `new` しない）。

```typescript
// apps/web/src/app/recipes/page.tsx
import { GetRecipesUseCase } from '@cookpit/application';
import { recipeRepository } from '@/server/repositories';
import { RecipeListClient } from './_components/recipe-list-client';

export default async function RecipesPage() {
  const useCase = new GetRecipesUseCase(recipeRepository());
  const recipes = await useCase.execute();

  return <RecipeListClient initialRecipes={recipes} />;
}
```

### 方法B: Client Component から Hono RPC 経由

操作（追加・更新・完了・再取得など）で使う。型安全な `hc<AppType>` クライアントと、
mutation 定型処理用の `useApiAction`（`apps/web/src/lib/use-api-action.ts`）を組み合わせる。

```typescript
// apps/web/src/app/recipes/_components/recipe-list-client.tsx（概念）
'use client';

import { useState } from 'react';
import { client } from '@/lib/api-client';
import { useApiAction } from '@/lib/use-api-action';

export function RecipeListClient({ initialRecipes }) {
  const [recipes, setRecipes] = useState(initialRecipes);
  const action = useApiAction();

  const handleRefetch = () =>
    action.run(() => client.api.recipes.$get(), {
      key: 'refresh',
      onSuccess: (body) => setRecipes(body),
    });

  // ...
}
```

> MVP1 では TanStack Query / Zustand は**未導入**。サーバー状態は「Server Component の
> initial props + Client の `useState` / `useOptimistic` + 必要時の再取得」で足りている。
> キャッシュ戦略が複雑になった段階で再検討する。

### 使い分けの方針

| ユースケース                      | 採用する方法                                      |
| --------------------------------- | ------------------------------------------------- |
| 初期表示（初回ロード）            | A: Server Component 直接                          |
| 一覧の再フェッチ                  | B: Hono RPC + `useApiAction` / ローカル state     |
| フォーム送信・単発 mutation       | B: Hono RPC + `useApiAction`                      |
| 楽観的更新が必要な行操作          | B: Hono RPC + `useOptimistic` / `startTransition` |
| Server Component から直接書き込み | 原則使わない（書き込みは Hono RPC に寄せる）      |

**基本方針**：

- **読み取り**は初期表示を Server Component で、その後の操作は Hono RPC に切り替え
- **書き込み**は基本 Hono RPC（楽観的更新やエラーバナーを効かせやすい）
- 認証は `src/proxy.ts` が Better Auth のセッション（`getSession`）検証で全経路の手前に
  掛かる（[ADR-0023](./decisions/ADR-0023-better-auth-login.md)。Basic 認証
  （[ADR-0021](./decisions/ADR-0021-basic-auth-for-public-repository.md)）を置換）。
  「ログインユーザー」という概念はドメインに持ち込んでいないため（[ADR-0004](./decisions/ADR-0004-no-user-in-domain.md)）、A も B もシンプルなまま

## パッケージ公開境界（ADR-0010）

消費側は必ずパッケージ名のバレルから import する。

| パッケージ                 | 正規 import                                                 | 禁止例                         |
| -------------------------- | ----------------------------------------------------------- | ------------------------------ |
| domain                     | `@cookpit/domain`                                           | `@cookpit/domain/src/...`      |
| application                | `@cookpit/application`                                      | deep path                      |
| infrastructure（web から） | `@/server/repositories`・`@/server/auth`・`@/db/*` に閉じる | page からの直接 `new Drizzle*` |
| api-contract               | `@cookpit/api-contract`                                     | deep path                      |

`packages/domain` 内部の相互参照は相対パスのまま（バレル自己参照で循環を作らない）。

## ユースケース層の DI（依存性注入）

個人開発のスケールでは DI コンテナ（tsyringe など）を使わず、**手動 DI** で十分。
組み立ては `apps/web/src/server/repositories.ts` のファクトリに集約済み。

書き込み UseCase は `UnitOfWork`（Domain のポート。実装は `DrizzleUnitOfWork`）を最後の引数に取る。
`execute()` の本体を `unitOfWork.execute(...)` で包み、1 トランザクションにする（ADR-0019）。
ルートは BEGIN/COMMIT せず、`createWriteContext()` で同じ UoW から Repository と UseCase を組み立てる。

読み取り専用（Get* / SSR）は従来どおり `recipeRepository()` 等を使い、
`drizzle-orm/neon-http`（HTTPS）へ接続する。書き込みは本番の
`DB_WRITE_TRANSACTION=on` のときだけ `drizzle-orm/neon-serverless`（WebSocket）の
`Client` を **1 リクエスト 1 接続**で張り、`UnitOfWork.execute()` の `finally` で閉じる。
キルスイッチが無効なら `work()` の恒等実行へ戻る。dev / テストの PGlite は維持する
（ADR-0019 / ADR-0020）。

```typescript
// packages/application の UseCase（概念）
export class CreateRecipeUseCase {
  constructor(
    private readonly recipeRepo: RecipeRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(input: CreateRecipeInput): Promise<RecipeId> {
    return this.unitOfWork.execute(async () => {
      const recipe = Recipe.create(input);
      await this.recipeRepo.save(recipe);
      return recipe.id;
    });
  }
}

// 書き込み Hono route
import { createWriteContext } from '@/server/repositories';

const { recipe, uow } = createWriteContext();
const useCase = new CreateRecipeUseCase(recipe, uow);
await useCase.execute({ name: 'カレー' /* ... */ });
```

ユースケースの組み立てがさらに煩雑になってきたら、DI コンテナ導入を検討する
（現状のファクトリ集約で足りている間は導入しない）。

## ドメインモデルと DB スキーマの責務分離

業務でも実践している `static create()` / `static reconstruct()` パターンを踏襲する。

```typescript
// packages/domain/src/recipe/recipe.ts（消費側は import { Recipe } from '@cookpit/domain'）
export class Recipe {
  private constructor(
    private readonly _id: RecipeId,
    private _name: string,
    private _ingredients: RecipeIngredient[],
    // ...
  ) {}

  // 新規作成時：ID 採番、初期化ロジック含む
  static create(input: CreateRecipeInput): Recipe {
    return new Recipe(
      RecipeId.generate(),
      input.name,
      input.ingredients,
      // ...
    );
  }

  // DB からの復元時：すでに ID がある、初期化ロジックを通さない
  static reconstruct(props: RecipeProps): Recipe {
    return new Recipe(
      props.id,
      props.name,
      props.ingredients,
      // ...
    );
  }
}

// packages/infrastructure/src/repositories/drizzle-recipe.repository.ts
export class DrizzleRecipeRepository implements RecipeRepository {
  async findById(id: RecipeId): Promise<Recipe | null> {
    const row = await this.db.select().from(recipes).where(eq(recipes.id, id.value)).limit(1);

    if (!row[0]) return null;

    return Recipe.reconstruct({
      id: RecipeId.fromString(row[0].id),
      name: row[0].name,
      ingredients: this.mapIngredients(row[0].ingredients),
      // ...
    });
  }
}
```

DB スキーマの形（フラットな行）と、ドメインモデルの形（集約 + 値オブジェクト）の変換責任は **Repository 実装が持つ**。ドメイン層は DB の形を知らない。
