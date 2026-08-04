# Sprint 1 Recipe 一覧 UI 実装ドキュメント

## 目的

`/recipes` に Recipe 一覧画面を実装し、紙のレシピブックをデジタルで参照するための最初の画面を作る。

Sprint 1 では Recipe CRUD のうち、まず登録済みレシピを一覧で見られる状態にする。一覧の初期データ取得は Server Component から Application 層の `GetRecipesUseCase` を直接呼び出し、検索とタグ絞り込みは Client Component のローカル state で行う。

依存方向は次を守る。

```text
Presentation(Next.js App Router) -> Application(UseCase) -> Domain <- Infrastructure
```

## ゴール

- `/recipes` で Recipe 一覧画面を表示できる。
- Server Component が `getDb()`、`DrizzleRecipeRepository`、`GetRecipesUseCase` を組み立てて初期 `RecipeDto[]` を取得する。
- Client Component が受け取った初期データを使って、レシピ名の部分一致検索を行う。
- タグチップで `すべて / 主菜 / 副菜 / 汁物 / 作り置き向き / 冷凍可` の単一選択フィルタを行う。
- レシピカードをタップすると `/recipes/:id` に遷移する。
- 右上の追加導線から `/recipes/new` に遷移する。
- Recipe が 0 件の空状態と、絞り込み結果 0 件の空状態を出し分ける。
- `/` は `/recipes` にリダイレクトする。
- `pnpm --filter @cookpit/web type-check` が通る。
- 実装後に Claude Code へレビューを依頼する。

## ファイル構成

```text
apps/web/src/
├── app/
│   ├── page.tsx
│   │   └── 更新: / から /recipes へ redirect
│   └── recipes/
│       ├── page.tsx
│       │   └── 新規: Server Component。初期データ取得
│       └── _components/
│           ├── recipe-list-client.tsx
│           │   └── 新規: Client Component。検索・タグ絞り込み・一覧状態管理
│           ├── recipe-card.tsx
│           │   └── 新規: Recipe 1 件分のカード表示
│           └── tag-filter.tsx
│               └── 新規: タグチップ群
└── components/
    └── ui/
        └── input.tsx
            └── 新規: shadcn/ui Input
```

`_components` は Next.js App Router のプライベートフォルダとして扱う。一覧画面専用の UI を共通 `components/` に広げず、`recipes` route の近くに置く。

## 今回使用するフロント知識

- **Next.js App Router**: `app/recipes/page.tsx` を `/recipes` route として扱う。
- **Server Component**: 初期表示に必要な Recipe 一覧をサーバー側で取得する。
- **Client Component**: 検索入力、タグ選択、クリックイベントなどブラウザ上の状態を扱う。
- **next/link**: レシピ詳細と新規作成画面への画面遷移を行う。
- **redirect**: `/` をトップ画面として使わず、Recipe 一覧へ転送する。
- **Tailwind CSS**: モバイル前提の最大幅、余白、横スクロールチップ、カード UI を組む。
- **shadcn/ui + Base UI**: 既存の `buttonVariants` と新規 `Input` を使って UI の見た目を揃える。
- **アクセシビリティ**: 検索 input の label、タグボタンの `aria-pressed`、装飾サムネイルの `aria-hidden` を設定する。

## React知識

- **`useState`**: 検索文字列と選択中タグを保持する。
- **Controlled Component**: `<Input value={query} onChange={...} />` で入力値を React state と同期する。
- **`useMemo`**: `initialRecipes`、`query`、`selectedTag` から絞り込み結果を派生させる。
- **Props の型定義**: Component Props は `interface` で定義し、DTO は `import type` で読み込む。
- **リストレンダリング**: `filteredRecipes.map()` で `<li key={recipe.id}>` を出力する。
- **条件付きレンダリング**: Recipe 0 件、絞り込み 0 件、通常一覧を出し分ける。
- **責務分離**: `RecipeListClient` は状態管理、`TagFilter` はタグ選択 UI、`RecipeCard` は 1 件表示に責務を分ける。

## 実装コード

### `apps/web/src/app/recipes/page.tsx`

Server Component なので `'use client'` は書かない。HTTP `fetch` ではなく、UseCase を直接呼ぶ。

```tsx
import { getDb } from '@/db/client';
import { GetRecipesUseCase } from '@cookpit/application';
import { DrizzleRecipeRepository } from '@cookpit/infrastructure';
import { RecipeListClient } from './_components/recipe-list-client';

export const dynamic = 'force-dynamic';

export default async function RecipesPage() {
  const repository = new DrizzleRecipeRepository(getDb());
  const useCase = new GetRecipesUseCase(repository);
  const recipes = await useCase.execute();

  return <RecipeListClient initialRecipes={recipes} />;
}
```

### `apps/web/src/app/recipes/_components/recipe-list-client.tsx`

Client Component として検索・タグ絞り込みを担当する。再フェッチはしない。

```tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RecipeDto } from '@cookpit/application';
import { RecipeCard } from './recipe-card';
import { TagFilter, type TagFilterValue } from './tag-filter';

interface Props {
  initialRecipes: RecipeDto[];
}

export function RecipeListClient({ initialRecipes }: Props) {
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<TagFilterValue>('all');

  const filteredRecipes = useMemo(() => {
    const trimmedQuery = query.trim();

    return initialRecipes.filter((recipe) => {
      const matchesTag = selectedTag === 'all' || recipe.tags.includes(selectedTag);
      const matchesQuery = trimmedQuery === '' || recipe.name.includes(trimmedQuery);

      return matchesTag && matchesQuery;
    });
  }, [initialRecipes, query, selectedTag]);

  return (
    <main className="min-h-dvh bg-zinc-50">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div aria-hidden="true" />
          <h1 className="text-lg font-semibold text-zinc-900">レシピ</h1>
          <div className="flex justify-end">
            <Link href="/recipes/new" className={cn(buttonVariants({ size: 'sm' }), 'h-9 px-3')}>
              <Plus className="size-3.5" aria-hidden="true" />
              追加
            </Link>
          </div>
        </header>

        <div>
          <label htmlFor="recipe-search" className="sr-only">
            レシピを検索
          </label>
          <Input
            id="recipe-search"
            type="search"
            placeholder="レシピを検索"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 rounded-xl bg-white"
          />
        </div>

        <TagFilter value={selectedTag} onChange={setSelectedTag} />

        <section aria-label="レシピ一覧">
          {initialRecipes.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              まだレシピがありません。右上から追加できます。
            </p>
          ) : filteredRecipes.length === 0 ? (
            <p className="py-12 text-center text-sm text-zinc-500">該当するレシピがありません</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {filteredRecipes.map((recipe) => (
                <li key={recipe.id}>
                  <RecipeCard recipe={recipe} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
```

### `apps/web/src/app/recipes/_components/tag-filter.tsx`

タグは単一選択。`RecipeTag` は `@cookpit/application` の public export ではないため、`RecipeDto['tags'][number]` から導出する。

```tsx
'use client';

import type { ReactNode } from 'react';
import type { RecipeDto } from '@cookpit/application';
import { cn } from '@/lib/utils';

type RecipeTag = RecipeDto['tags'][number];

const RECIPE_TAG_LABELS: Record<RecipeTag, RecipeTag> = {
  主菜: '主菜',
  副菜: '副菜',
  汁物: '汁物',
  作り置き向き: '作り置き向き',
  冷凍可: '冷凍可',
};

const TAG_OPTIONS = Object.values(RECIPE_TAG_LABELS);

export type TagFilterValue = 'all' | RecipeTag;

interface Props {
  value: TagFilterValue;
  onChange: (next: TagFilterValue) => void;
}

export function TagFilter({ value, onChange }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="レシピタグ">
      <Chip selected={value === 'all'} onClick={() => onChange('all')}>
        すべて
      </Chip>
      {TAG_OPTIONS.map((tag) => (
        <Chip key={tag} selected={value === tag} onClick={() => onChange(tag)}>
          {tag}
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors',
        selected
          ? 'border-zinc-900 bg-zinc-900 text-white'
          : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50',
      )}
    >
      {children}
    </button>
  );
}
```

### `apps/web/src/app/recipes/_components/recipe-card.tsx`

1 カードを表示する Presentational Component。カード全体を `Link` にする。

```tsx
import Link from 'next/link';
import type { RecipeDto } from '@cookpit/application';
import { cn } from '@/lib/utils';

interface Props {
  recipe: RecipeDto;
}

export function RecipeCard({ recipe }: Props) {
  const visibleTags = recipe.tags.slice(0, 3);

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      aria-label={`${recipe.name} の詳細を見る`}
      className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-lg border border-zinc-200 bg-white p-3 text-left transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
    >
      <div className="h-14 w-14 rounded-lg border border-zinc-200 bg-zinc-100" aria-hidden="true" />

      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate text-sm font-medium text-zinc-900">{recipe.name}</p>

        {visibleTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {visibleTags.map((tag, index) => (
              <span
                key={`${tag}-${index}`}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                  index === 0 ? 'bg-amber-100 text-amber-800' : 'bg-zinc-100 text-zinc-600',
                )}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {recipe.cookingTime !== null && (
          <p className="text-xs text-zinc-500">調理時間 {recipe.cookingTime}分</p>
        )}
      </div>
    </Link>
  );
}
```

### `apps/web/src/components/ui/input.tsx`

shadcn CLI で追加する場合は `apps/web` で次を実行する。

```bash
pnpm dlx shadcn@latest add input
```

生成されない場合、または既存の見た目に寄せたい場合は次の内容で作成する。

```tsx
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'border-input file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
```

### `apps/web/src/app/page.tsx`

Next.js の初期テンプレートは削除し、トップアクセスを Recipe 一覧へ流す。

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/recipes');
}
```

## 注意点、ポイント

- `apps/web/src/app/recipes/page.tsx` は Server Component のままにする。`'use client'` を書かない。
- Client Component に渡すのは `RecipeDto[]` のみ。Domain Entity の `Recipe` を渡さない。
- 初期表示では Hono API を `fetch` しない。`GetRecipesUseCase` を直接呼ぶ。
- 一覧の検索とタグ絞り込みでは TanStack Query を使わない。MVP1 では `useState` と `useMemo` だけで閉じる。
- `dynamic = 'force-dynamic'` を付け、Recipe 一覧を静的生成させない。
- `RecipeTag` は現時点の application root から直接 export されていないため、UI 側では `RecipeDto['tags'][number]` から導出する。
- 現在の `Button` は Base UI ラップで、Radix 系の `asChild` 前提ではない。`Link` をボタン風にする場合は `buttonVariants` を使う。
- 「値なし」は `null` に統一する方針を守る。DTO の `cookingTime` も `null` 判定で非表示にする。
- タグチップは横スクロールできるように `overflow-x-auto` と `shrink-0` を使う。
- 空状態は 2 種類を区別する。`initialRecipes.length === 0` は未登録、`filteredRecipes.length === 0` は絞り込み結果なし。
- `/recipes/new` と `/recipes/:id` は後続タスクで実装されるため、このタスクでは 404 になってもリンク先が正しければよい。
- 実装後は `pnpm --filter @cookpit/web type-check` を実行し、可能なら `pnpm --filter @cookpit/web dev --webpack` で 375px 幅の表示を確認する。
- コミット前に Claude Code のレビューを受ける。
