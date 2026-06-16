# Sprint 1 Recipe 詳細 UI 実装ドキュメント

## 目的

`/recipes/[id]` に Recipe 詳細画面を実装し、登録済みレシピを紙のレシピブックの代わりにすぐ確認できる状態にする。

詳細画面の初期表示は Server Component から Application 層の `GetRecipeUseCase` を直接呼び出す。倍量変更は保存しない表示専用の Client Component state とし、削除だけ Hono RPC 経由で実行する。

依存方向は次を守る。

```text
Presentation(Next.js App Router / Hono RPC) -> Application(UseCase) -> Domain <- Infrastructure
```

## ゴール

- `/recipes/[id]` で Recipe 詳細画面を表示できる。
- Server Component が `params` を await し、`getDb()`、`DrizzleRecipeRepository`、`GetRecipeUseCase` を組み立てて `RecipeDto` を取得する。
- `RecipeNotFoundError` は `notFound()` に変換し、存在しない ID で 404 を表示する。
- Client Component がタグ、調理時間、基準人数、材料、手順、メモを表示する。
- 倍量 `1× / 1.5× / 2× / 3×` の単一選択で、材料の数値量と「N人分」表示が連動する。
- `amountNote` の材料は倍量の影響を受けず、そのまま表示される。
- メモが空文字の場合はメモセクションを表示しない。
- 最下部の削除ボタンから AlertDialog で確認し、`DELETE /api/recipes/:id` 成功後に `/recipes` へ戻って一覧を再取得する。
- 今回は編集ボタンを出さない。
- `pnpm --filter @cookpit/web type-check` が通る。
- 実装後に Claude Code へレビューを依頼する。

## ファイル構成

```text
apps/web/src/
├── app/
│   └── recipes/
│       └── [id]/
│           ├── page.tsx
│           │   └── 新規: Server Component。詳細初期データ取得と 404 変換
│           └── _components/
│               └── recipe-detail-client.tsx
│                   └── 新規: Client Component。表示、倍量 state、削除 RPC
└── components/
    └── ui/
        └── alert-dialog.tsx
            └── 新規: @base-ui/react/alert-dialog ベースの共通 UI ラッパ
```

`[id]/_components` は詳細画面専用に閉じる。`alert-dialog.tsx` は破壊的操作の確認 UI として再利用できるため、共通 `components/ui` に置く。

## 今回使用するフロント知識

- **Next.js App Router**: `app/recipes/[id]/page.tsx` を動的 route として扱う。
- **Next.js 16 の params**: 動的セグメントの `params` は `Promise` なので `await params` する。
- **Server Component**: 初期表示に必要な Recipe 詳細をサーバー側で取得する。
- **Client Component**: 倍量トグル、戻るボタン、削除確認、削除中状態、エラー表示を扱う。
- **Hono RPC**: `client.api.recipes[':id'].$delete({ param: { id } })` で削除 API を型安全に呼ぶ。
- **Base UI Alert Dialog**: `@base-ui/react/alert-dialog` の `Root / Trigger / Portal / Backdrop / Popup / Title / Description / Close` を使う。
- **Tailwind CSS**: 既存の一覧・作成フォームと同じ `max-w-md`、`bg-zinc-*`、白カード中心のモバイル UI に揃える。
- **アクセシビリティ**: 戻るボタンの `aria-label`、倍量ボタンの `aria-pressed`、AlertDialog の Title / Description を設定する。

## React知識

- **`useState`**: 倍量、削除中、削除エラーを保持する。
- **Literal Union**: `SCALE_OPTIONS` から `ScaleFactor` を導出し、選択肢外の値を入れない。
- **派生値**: `recipe.baseServings * scale` と `ingredient.amountValue * scale` は render 時に計算する。
- **条件付きレンダリング**: タグなし、メモなし、削除エラーありを出し分ける。
- **Props の型定義**: Component Props は `interface`、DTO は `import type` を使う。
- **責務分離**: `page.tsx` は取得と 404 変換だけ、`RecipeDetailClient` は UI state と削除操作だけを担当する。

## 実装コード

### `apps/web/src/components/ui/alert-dialog.tsx`

Base UI v1.4.1 では `@base-ui/react/alert-dialog` から `AlertDialog` namespace が export され、parts は `Root / Trigger / Portal / Backdrop / Popup / Title / Description / Close` として使える。`Trigger` と `Close` は `render` prop で `Button` などの任意要素へ合成できる。

```tsx
'use client';

import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

function AlertDialog(props: ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root {...props} />;
}

function AlertDialogTrigger(props: ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger {...props} />;
}

function AlertDialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Popup>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40" />
      <AlertDialogPrimitive.Popup
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[min(360px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-200 bg-white p-5 shadow-lg outline-none',
          className,
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Popup>
    </AlertDialogPrimitive.Portal>
  );
}

function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn('text-base font-semibold text-zinc-900', className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={cn('mt-1 text-sm text-zinc-600', className)}
      {...props}
    />
  );
}

function AlertDialogClose(props: ComponentProps<typeof AlertDialogPrimitive.Close>) {
  return <AlertDialogPrimitive.Close {...props} />;
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
};
```

実装時は必ずローカルの型ファイルを確認する。pnpm 配下では次の実体にある。

```text
node_modules/.pnpm/@base-ui+react@1.4.1_*/node_modules/@base-ui/react/alert-dialog/index.d.ts
node_modules/.pnpm/@base-ui+react@1.4.1_*/node_modules/@base-ui/react/alert-dialog/index.parts.d.ts
```

### `apps/web/src/app/recipes/[id]/page.tsx`

Server Component なので `'use client'` は書かない。HTTP `fetch` ではなく、UseCase を直接呼ぶ。

```tsx
import { getDb } from '@/db/client';
import { GetRecipeUseCase, RecipeNotFoundError } from '@cookpit/application';
import { DrizzleRecipeRepository } from '@cookpit/infrastructure';
import { notFound } from 'next/navigation';
import { RecipeDetailClient } from './_components/recipe-detail-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RecipeDetailPage({ params }: Props) {
  const { id } = await params;
  const repository = new DrizzleRecipeRepository(getDb());
  const useCase = new GetRecipeUseCase(repository);

  try {
    const recipe = await useCase.execute(id);
    return <RecipeDetailClient recipe={recipe} />;
  } catch (error) {
    if (error instanceof RecipeNotFoundError) {
      notFound();
    }

    throw error;
  }
}
```

設計ポイント:

- `RecipeDetailPage` の default export は Next.js page の要求なので例外として許容する。
- `GetRecipeUseCase` と `RecipeNotFoundError` は `packages/application/src/index.ts` から export 済み。
- `dynamic = 'force-dynamic'` を付け、詳細データを静的生成させない。
- DB アクセスは初期表示の 1 回だけにする。削除は Client Component から Hono RPC で行う。

### `apps/web/src/app/recipes/[id]/_components/recipe-detail-client.tsx`

詳細表示、倍量の表示計算、削除確認を担当する Client Component。

```tsx
'use client';

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { RecipeDto } from '@cookpit/application';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Props {
  recipe: RecipeDto;
}

const SCALE_OPTIONS = [1, 1.5, 2, 3] as const;

type ScaleFactor = (typeof SCALE_OPTIONS)[number];

function formatAmount(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function formatIngredientAmount(
  amountValue: number | null,
  amountNote: string | null,
  scale: ScaleFactor,
): string {
  if (amountValue === null) {
    return amountNote ?? '';
  }

  return formatAmount(amountValue * scale);
}

export function RecipeDetailClient({ recipe }: Props) {
  const router = useRouter();
  const [scale, setScale] = useState<ScaleFactor>(1);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const servings = formatAmount(recipe.baseServings * scale);

  async function handleDelete(): Promise<void> {
    setDeleting(true);
    setErrorMessage(null);

    try {
      const res = await client.api.recipes[':id'].$delete({ param: { id: recipe.id } });

      if (!res.ok) {
        setErrorMessage('削除に失敗しました。');
        return;
      }

      router.push('/recipes');
      router.refresh();
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-zinc-50">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-4">
        <header className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            onClick={() => router.push('/recipes')}
            aria-label="一覧に戻る"
            className="text-zinc-700"
          >
            <ChevronLeft className="size-5" aria-hidden="true" />
          </Button>
          <h1 className="truncate text-center text-lg font-semibold text-zinc-900">
            {recipe.name}
          </h1>
          <span aria-hidden="true" className="w-9" />
        </header>

        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {recipe.tags.map((tag, index) => (
              <span
                key={`${tag}-${index}`}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium',
                  index === 0 ? 'bg-amber-100 text-amber-800' : 'bg-zinc-100 text-zinc-700',
                )}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <p className="text-xs text-zinc-500">調理時間</p>
            <p className="text-lg font-semibold text-zinc-900">
              {recipe.cookingTime === null ? '—' : `${recipe.cookingTime}分`}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <p className="text-xs text-zinc-500">基準人数</p>
            <p className="text-lg font-semibold text-zinc-900">{recipe.baseServings}人分</p>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-sm font-medium text-zinc-900">
            倍量 <span className="text-xs font-normal text-zinc-500">材料の数値に反映</span>
          </p>
          <div className="flex gap-2">
            {SCALE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setScale(option)}
                aria-pressed={scale === option}
                className={cn(
                  'flex-1 rounded-lg border py-2 text-sm transition-colors',
                  scale === option
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50',
                )}
              >
                {option}×
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-sm font-medium text-zinc-900">
            材料 <span className="text-xs font-normal text-zinc-500">{servings}人分</span>
          </p>
          <div className="flex flex-col divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
            {recipe.ingredients.map((ingredient, index) => (
              <div
                key={`${ingredient.displayName}-${index}`}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2.5 text-sm"
              >
                <span className="min-w-0 text-zinc-900">{ingredient.displayName}</span>
                <span className="text-right font-medium text-zinc-900">
                  {formatIngredientAmount(ingredient.amountValue, ingredient.amountNote, scale)}
                </span>
                <span className="w-10 text-right text-zinc-500">{ingredient.amountUnit ?? ''}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-sm font-medium text-zinc-900">作り方</p>
          <ol className="flex flex-col gap-3">
            {recipe.steps.map((step, index) => (
              <li key={index} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2">
                <span className="flex size-7 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium text-zinc-700">
                  {index + 1}
                </span>
                <p className="pt-0.5 text-sm whitespace-pre-wrap text-zinc-800">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {recipe.notes.trim() !== '' && (
          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium text-zinc-900">メモ</p>
            <p className="rounded-xl border border-zinc-200 bg-white p-3 text-sm whitespace-pre-wrap text-zinc-800">
              {recipe.notes}
            </p>
          </section>
        )}

        <div className="pt-2 pb-8">
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button type="button" variant="destructive" className="h-11 w-full">
                  このレシピを削除
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogTitle>このレシピを削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>削除すると元に戻せません。</AlertDialogDescription>
              {errorMessage !== null && (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorMessage}
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <AlertDialogClose
                  render={
                    <Button type="button" variant="outline" className="h-9">
                      キャンセル
                    </Button>
                  }
                />
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="h-9"
                >
                  {deleting ? '削除中' : '削除する'}
                </Button>
              </div>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </main>
  );
}
```

設計ポイント:

- `amountValue` が `null` の場合は `amountNote` をそのまま表示し、倍量計算しない。
- `formatAmount()` は `0.1 * 3` のような浮動小数の表示ノイズを避けるため、表示直前にだけ使う。
- `servings` も `formatAmount()` を通し、`baseServings * 1.5` などの表示を安定させる。
- 削除エラーは AlertDialog 内に表示する。削除失敗時はダイアログを閉じず、その場で再試行できるようにする。
- 確認ボタンは `AlertDialogClose` で包まない。成功時は `/recipes` へ遷移し、失敗時は開いたままにする。
- 編集ボタン用の右上領域は空の `span` で幅だけ確保し、タイトル中央寄せを崩さない。

## 実装手順

### 1. AlertDialog ラッパを追加する

対象ファイル:

```text
apps/web/src/components/ui/alert-dialog.tsx
```

変更内容:

- `@base-ui/react/alert-dialog` をラップする。
- `AlertDialog`、`AlertDialogTrigger`、`AlertDialogContent`、`AlertDialogTitle`、`AlertDialogDescription`、`AlertDialogClose` を named export する。
- Backdrop は `fixed inset-0 z-50 bg-black/40`、Popup は中央配置の白カードにする。
- `cn` を使い、呼び出し側から `className` を追加できるようにする。

完了条件:

- `@base-ui/react/alert-dialog` の parts 名がローカル v1.4.1 の型と一致している。
- `render` prop を使う `Trigger` / `Close` が type-check で通る。
- default export を使っていない。

### 2. 詳細 route の Server Component を追加する

対象ファイル:

```text
apps/web/src/app/recipes/[id]/page.tsx
```

変更内容:

- `params: Promise<{ id: string }>` を props として受け取り、`const { id } = await params` で取得する。
- 一覧画面と同じ手動 DI で `DrizzleRecipeRepository(getDb())` と `GetRecipeUseCase` を組み立てる。
- `useCase.execute(id)` の結果を `RecipeDetailClient` に渡す。
- `RecipeNotFoundError` は `notFound()` に変換し、それ以外は再 throw する。
- `export const dynamic = 'force-dynamic'` を追加する。

完了条件:

- `RecipeNotFoundError` で 500 にならず 404 になる。
- Server Component に `'use client'` がない。
- Hono API を `fetch` していない。
- Next.js page の default export 以外は named export の規約に沿っている。

### 3. 詳細 Client Component を追加する

対象ファイル:

```text
apps/web/src/app/recipes/[id]/_components/recipe-detail-client.tsx
```

変更内容:

- 冒頭に `'use client'` を置く。
- `RecipeDto` を `import type` で受け取り、`interface Props` を定義する。
- `SCALE_OPTIONS = [1, 1.5, 2, 3] as const` と `ScaleFactor` を定義する。
- `scale`、`deleting`、`errorMessage` を `useState` で管理する。
- トップバー、タグ、stats、倍量、材料、作り方、メモ、削除ブロックをワイヤーフレーム順に実装する。
- 削除は `client.api.recipes[':id'].$delete({ param: { id: recipe.id } })` を呼ぶ。
- 成功時は `router.push('/recipes')` と `router.refresh()` を実行する。

完了条件:

- 倍量ボタンの選択状態が `aria-pressed` と見た目の両方で反映される。
- `amountValue` 行だけ数値が再計算され、`amountNote` 行は変化しない。
- メモが空文字または空白だけの場合はメモセクションが出ない。
- 削除中は確認ボタンが `disabled` になり、二重送信できない。
- 削除失敗時のメッセージが AlertDialog 内で見える。
- `/recipes/[id]/edit` への編集ボタンやリンクを追加していない。

## 依存関係

- `page.tsx` は `RecipeDetailClient` を import するため、Client Component の export 名を先に決めてから作る。
- `recipe-detail-client.tsx` は `AlertDialog` ラッパに依存するため、`alert-dialog.tsx` を先に追加する。
- Hono RPC の型は `apps/web/src/server/app.ts` の `AppType` から来る。`recipesRoute.delete('/:id', ...)` は実装済みなので API route の追加は不要。
- `RecipeDto`、`GetRecipeUseCase`、`RecipeNotFoundError` は `@cookpit/application` の root export から import できる。
- `DrizzleRecipeRepository` は `@cookpit/infrastructure` の root export から import できる。

## 動作確認

実装後に実行する。

```bash
pnpm --filter @cookpit/web type-check
pnpm --filter @cookpit/web dev --webpack
```

ブラウザ確認項目:

- `/recipes` のカードから `/recipes/[id]` に遷移できる。
- 存在しない UUID の `/recipes/[id]` で 404 になる。
- タグがあるレシピではタグ chip が表示され、タグなしでは非表示になる。
- `cookingTime === null` のレシピでは調理時間が `—` になる。
- 倍量 `1× -> 1.5× -> 2× -> 3×` で材料の数値と「N人分」が連動する。
- `amountNote` の「少々」「適量」などは倍量を変えても変化しない。
- メモが空のレシピではメモセクションが表示されない。
- 「このレシピを削除」から AlertDialog が開き、キャンセルで閉じる。
- 削除確認で `/recipes` に戻り、一覧から対象レシピが消える。
- 削除失敗時に AlertDialog 内へエラーメッセージが出る。
- 375px 幅でトップバー、材料行、削除ダイアログの文字が崩れない。

## 注意点、ポイント

- `apps/web/src/app/recipes/[id]/page.tsx` は Server Component のままにする。
- 初期表示では Hono API を呼ばず、Application UseCase を直接呼ぶ。
- アクションである削除は Hono RPC を使う。
- 倍量計算は表示専用で、サーバー往復も永続化もしない。
- `Recipe.scaleIngredients()` は今回は呼ばない。丸めルールが複雑になった段階で Domain 側へ寄せる。
- `amountValue` と `amountUnit` は DTO 上では nullable。表示では `amountUnit ?? ''` とし、`undefined` を混ぜない。
- `any` と通常の型アサーションは使わない。`as const` は literal union 導出のために使う。
- 型のみの import は `import type` を使う。
- `==` / `!=` は使わず、`===` / `!==` を使う。
- コメントは必要最小限にする。今回の UI では、編集ボタンを出さない理由コメント程度に留める。
- Tailwind は既存 `recipe-card.tsx`、`recipe-list-client.tsx`、`recipe-form-client.tsx` の `zinc` 系・白カード・`max-w-md` に揃える。
- AlertDialog は Base UI で実装する。Radix 系や shadcn CLI の alert-dialog は追加しない。
- 実装後は Claude Code へレビューを依頼してからコミットする。
