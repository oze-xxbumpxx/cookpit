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

```
recipe-app/
├── apps/
│   └── web/                          # Next.js + Hono 一体
│       ├── app/
│       │   ├── api/
│       │   │   └── [[...route]]/
│       │   │       └── route.ts      # Hono ルーター
│       │   ├── (app)/                # メインアプリ画面
│       │   │   ├── page.tsx          # ダッシュボード
│       │   │   ├── recipes/
│       │   │   ├── meal-plans/
│       │   │   ├── shopping/
│       │   │   ├── pantry/
│       │   │   └── products/
│       │   ├── layout.tsx
│       │   └── manifest.ts           # PWA マニフェスト
│       ├── server/                   # Hono のサーバー実装
│       │   ├── routes/
│       │   │   ├── recipes.ts
│       │   │   ├── meal-plans.ts
│       │   │   ├── shopping-lists.ts
│       │   │   ├── pantry.ts
│       │   │   └── products.ts
│       │   ├── middleware/
│       │   └── app.ts                # Hono アプリ本体
│       ├── components/               # ページ固有コンポーネント
│       ├── lib/
│       │   └── api-client.ts         # Hono RPC クライアント
│       ├── public/
│       └── package.json
│
├── packages/
│   ├── domain/                       # ドメイン層
│   │   ├── src/
│   │   │   ├── recipe/
│   │   │   │   ├── recipe.ts         # Recipe Aggregate
│   │   │   │   ├── recipe-id.ts
│   │   │   │   ├── recipe-ingredient.ts
│   │   │   │   ├── cooking-step.ts
│   │   │   │   └── recipe.repository.ts  # Interface
│   │   │   ├── meal-plan/
│   │   │   ├── shopping-list/
│   │   │   ├── pantry/
│   │   │   ├── product/
│   │   │   └── shared/               # 共有値オブジェクト
│   │   │       ├── money.ts
│   │   │       ├── quantity.ts
│   │   │       ├── unit.ts
│   │   │       ├── week-identifier.ts
│   │   │       └── store.ts
│   │   └── package.json
│   │
│   ├── application/                  # ユースケース層
│   │   ├── src/
│   │   │   ├── recipe/
│   │   │   │   ├── create-recipe.use-case.ts
│   │   │   │   ├── get-recipes.use-case.ts
│   │   │   │   ├── update-recipe.use-case.ts
│   │   │   │   └── delete-recipe.use-case.ts
│   │   │   ├── meal-plan/
│   │   │   ├── shopping-list/
│   │   │   ├── pantry/
│   │   │   └── product/
│   │   └── package.json
│   │
│   ├── infrastructure/               # 永続化層
│   │   ├── src/
│   │   │   ├── db/
│   │   │   │   ├── schema.ts         # Drizzle スキーマ全体
│   │   │   │   ├── client.ts         # DB クライアント
│   │   │   │   └── migrations/
│   │   │   └── repositories/
│   │   │       ├── drizzle-recipe.repository.ts
│   │   │       ├── drizzle-meal-plan.repository.ts
│   │   │       ├── drizzle-shopping-list.repository.ts
│   │   │       ├── drizzle-pantry.repository.ts
│   │   │       └── drizzle-product.repository.ts
│   │   └── package.json
│   │
│   ├── api-contract/                 # API 契約（Zod）
│   │   ├── src/
│   │   │   ├── recipe.schema.ts
│   │   │   ├── meal-plan.schema.ts
│   │   │   └── ...
│   │   └── package.json
│   │
│   └── config/                       # 共通設定
│       ├── eslint/
│       ├── typescript/
│       └── tailwind/
│
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── docs/
```

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

```typescript
// app/(app)/recipes/page.tsx
import { GetRecipesUseCase } from '@recipe-app/application/recipe'
import { DrizzleRecipeRepository } from '@recipe-app/infrastructure/repositories'
import { db } from '@/lib/db'

export default async function RecipesPage() {
  const repo = new DrizzleRecipeRepository(db)
  const useCase = new GetRecipesUseCase(repo)
  const recipes = await useCase.execute()

  return <RecipeList initialRecipes={recipes} />
}
```

### 方法B: Client Component から Hono RPC 経由

```typescript
// app/(app)/recipes/recipe-list.tsx
'use client'
import { useQuery } from '@tanstack/react-query'
import { client } from '@/lib/api-client'

export function RecipeList({ initialRecipes }) {
  const { data } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => client.recipes.$get().then(r => r.json()),
    initialData: initialRecipes,
  })

  return <ul>{data.map(r => <li key={r.id}>{r.name}</li>)}</ul>
}
```

### 使い分けの方針

| ユースケース                       | 採用する方法                 |
| ---------------------------------- | ---------------------------- |
| 初期表示（SEO、初回ロード高速化）  | A: Server Component 直接     |
| 一覧の再フェッチ・ページネーション | B: Hono RPC + TanStack Query |
| フォーム送信（楽観的更新したい）   | B: Hono RPC + TanStack Query |
| ステータス変更などのアクション     | B: Hono RPC + TanStack Query |
| Server Component から直接書き込み  | A: Server Action として      |

**基本方針**：

- **読み取り**は初期表示を Server Component で、その後の操作は Hono RPC に切り替え
- **書き込み**は基本 Hono RPC（楽観的更新を効かせやすい）
- 認証なし MVP1 では「ログインユーザー」を意識する必要がないため、A も B もシンプル

## ユースケース層の DI（依存性注入）

個人開発のスケールでは DI コンテナ（tsyringe など）を使わず、**手動 DI** で十分。

```typescript
// packages/application/recipe/create-recipe.use-case.ts
export class CreateRecipeUseCase {
  constructor(private recipeRepo: RecipeRepository) {}

  async execute(input: CreateRecipeInput): Promise<RecipeId> {
    const recipe = Recipe.create(input)
    await this.recipeRepo.save(recipe)
    return recipe.id
  }
}

// 呼び出し側で組み立てる
const repo = new DrizzleRecipeRepository(db)
const useCase = new CreateRecipeUseCase(repo)
await useCase.execute({ name: 'カレー', ... })
```

ユースケースの組み立てが煩雑になってきたら、以下のいずれかを検討：

- ファクトリ関数で組み立てを集約
- DI コンテナ導入

## ドメインモデルと DB スキーマの責務分離

業務でも実践している `static create()` / `static reconstruct()` パターンを踏襲する。

```typescript
// packages/domain/recipe/recipe.ts
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

// packages/infrastructure/repositories/drizzle-recipe.repository.ts
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
