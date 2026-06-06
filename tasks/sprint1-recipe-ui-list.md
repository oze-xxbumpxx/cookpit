# Sprint 1：Recipe 一覧画面 実装指針

Codex への実装指示書。実装後は必ず Claude Code でレビューを受けること。

**前提**：`tasks/sprint1-recipe-hono-api.md` の作業が完了していること（`/api/recipes` が動作する＝UseCase 一式が組み立て可能）。

---

## 事前確認

実装前に以下を必ず読むこと。

- `docs/03-architecture.md`（Presentation 層・サーバーサイドの2つのアプローチ＝**初期表示は Server Component が直接 UseCase を呼ぶ**方針）
- `docs/07-dev-rules.md`（コーディング規約）
- `designs/wireframes/recipe-wireframes.html`（**画面 1 「レシピ一覧」**セクション。レイアウト・配置はこれに従う）

以下の実装済みファイル・型を読んでから実装すること。

- `packages/application/src/recipe/recipe.dto.ts`（`RecipeDto` / `RecipeTag` の値）
- `packages/application/src/index.ts`（`GetRecipesUseCase` の import パス）
- `apps/web/src/db/client.ts`（`getDb()`）
- `apps/web/src/components/ui/button.tsx`（既存 shadcn ボタンのスタイル流儀）
- `apps/web/src/app/layout.tsx`（既存ルートレイアウト）

---

## タスク概要

`/recipes` に Recipe 一覧画面を実装する。

```
[Server] /recipes (page.tsx)
   ├─ Server Component: getDb() → DrizzleRecipeRepository → GetRecipesUseCase.execute()
   │    └─ 初期 RecipeDto[] を取得
   └─ Client Component (RecipeListClient): 受け取った初期データを保持し
        ├─ 検索（name 部分一致）
        └─ タグフィルタ（単一選択：すべて / 主菜 / 副菜 / 汁物 / 作り置き向き / 冷凍可）
        を **クライアント側で絞り込む**（再フェッチしない）
```

### 画面要素（スケッチ準拠）

1. **トップバー**：タイトル「レシピ」、右に「＋ 追加」ボタン（`/recipes/new` へリンク）
2. **検索ボックス**：プレースホルダ「レシピを検索」
3. **タグチップ**：横スクロール可。`すべて / 主菜 / 副菜 / 汁物 / 作り置き向き / 冷凍可`。単一選択。`すべて` がデフォルト。
4. **カード一覧**：
   - サムネイル枠（MVP1 はプレースホルダの灰色ボックスのみ。画像は読み込まない）
   - レシピ名
   - タグミニ（最大3個程度。`tags` をそのまま表示。1つ目を accent 色にする）
   - メタ（調理時間 `cookingTime` 分。`null` なら非表示）
   - カードタップ → `/recipes/:id` へ遷移（`next/link`）
5. **空状態**：レシピが0件のとき「まだレシピがありません。右上から追加できます。」を表示。
6. **絞り込み結果が0件**：「該当するレシピがありません」を表示。

レイアウト・カラーは既存 `apps/web/src/app/page.tsx` と同じく Tailwind（`bg-zinc-*` / `text-zinc-*` 系）でモバイル前提（最大幅・余白はスケッチに準拠）。

---

## 作成・変更するファイル一覧

```
新規作成
apps/web/src/app/recipes/page.tsx                            # Server Component（初期データ取得）
apps/web/src/app/recipes/_components/recipe-list-client.tsx  # Client Component（検索・絞り込み）
apps/web/src/app/recipes/_components/recipe-card.tsx         # 1カードの表示（Presentational）
apps/web/src/app/recipes/_components/tag-filter.tsx          # タグチップ群
apps/web/src/components/ui/input.tsx                         # shadcn Input を追加（CLI: 後述）

更新
apps/web/src/app/page.tsx                                    # ルート / を /recipes へ redirect（後述）
```

> `_components` プレフィックスは **Next.js のプライベートフォルダ**規約。`app/` 配下に置いても route として認識されない。一覧画面でしか使わないコンポーネントを共通 `components/` に置かないための慣用パターン。

---

## ステップ 0：shadcn Input の追加

```bash
cd apps/web
pnpm dlx shadcn@latest add input
```

`apps/web/src/components/ui/input.tsx` が生成される。

---

## ステップ 1：`apps/web/src/app/recipes/page.tsx`（Server Component）

Server Component から `GetRecipesUseCase` を**直接**呼ぶ。HTTP 経由（`fetch`）にしない。

```tsx
import { getDb } from '@/db/client';
import { GetRecipesUseCase } from '@cookpit/application';
import { DrizzleRecipeRepository } from '@cookpit/infrastructure';
import { RecipeListClient } from './_components/recipe-list-client';

export const dynamic = 'force-dynamic';

export default async function RecipesPage() {
  const useCase = new GetRecipesUseCase(new DrizzleRecipeRepository(getDb()));
  const recipes = await useCase.execute();

  return <RecipeListClient initialRecipes={recipes} />;
}
```

### 設計のポイント

- `dynamic = 'force-dynamic'` で静的化を回避（毎リクエスト DB 取得）。MVP1 では ISR / キャッシュ戦略を入れない。
- DI（repo → useCase）は**ハンドラ内で組み立て**る（API ルートと同じ流儀）。
- 失敗時のエラーは Next.js のデフォルト error boundary に任せる（MVP1 では `error.tsx` 追加は不要。後続タスクで導入）。

---

## ステップ 2：`recipe-list-client.tsx`（Client Component）

検索・タグ絞り込みを **クライアント側 useState** で行う。**再フェッチしない**（MVP1）。

```tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { RecipeDto } from '@cookpit/application';
import { RecipeCard } from './recipe-card';
import { TagFilter, type TagFilterValue } from './tag-filter';

interface Props {
  initialRecipes: RecipeDto[];
}

export function RecipeListClient({ initialRecipes }: Props) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<TagFilterValue>('all');

  const filtered = useMemo(() => {
    const q = query.trim();
    return initialRecipes.filter((recipe) => {
      if (tag !== 'all' && !recipe.tags.includes(tag)) return false;
      if (q !== '' && !recipe.name.includes(q)) return false;
      return true;
    });
  }, [initialRecipes, query, tag]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
      {/* トップバー */}
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">レシピ</h1>
        <Button asChild size="sm">
          <Link href="/recipes/new">＋ 追加</Link>
        </Button>
      </header>

      {/* 検索 */}
      <Input
        type="search"
        placeholder="レシピを検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {/* タグ */}
      <TagFilter value={tag} onChange={setTag} />

      {/* 一覧 */}
      {initialRecipes.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">
          まだレシピがありません。右上から追加できます。
        </p>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500">該当するレシピがありません</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((recipe) => (
            <li key={recipe.id}>
              <RecipeCard recipe={recipe} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

### 設計のポイント

- 検索は **`includes` の部分一致**（大文字小文字区別あり）。日本語前提なので小文字化は不要。
- タグフィルタは **単一選択**（スケッチで `chip on` が1つだけ）。「すべて」は `'all'` センチネル。
- 並び順は repository の `findAll` が返す順（`createdAt` 昇順）をそのまま使う。
- 検索/タグの状態を URL に同期しない（MVP1）。リロードでリセットされる。

---

## ステップ 3：`tag-filter.tsx`

```tsx
'use client';

import type { RecipeTag } from '@cookpit/application';

const ALL_TAGS = ['主菜', '副菜', '汁物', '作り置き向き', '冷凍可'] as const satisfies readonly RecipeTag[];

export type TagFilterValue = 'all' | RecipeTag;

interface Props {
  value: TagFilterValue;
  onChange: (next: TagFilterValue) => void;
}

export function TagFilter({ value, onChange }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      <Chip selected={value === 'all'} onClick={() => onChange('all')}>
        すべて
      </Chip>
      {ALL_TAGS.map((tag) => (
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
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors ' +
        (selected
          ? 'border-zinc-900 bg-zinc-900 text-white'
          : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50')
      }
    >
      {children}
    </button>
  );
}
```

### 設計のポイント

- `RecipeTag` のリテラル配列は `as const satisfies readonly RecipeTag[]` で**ドメインとの型一致を強制**。タグが増えたらここの定義漏れがコンパイルエラーで気づける。
- スクロール対応は `overflow-x-auto`。

---

## ステップ 4：`recipe-card.tsx`

```tsx
import Link from 'next/link';
import type { RecipeDto } from '@cookpit/application';

interface Props {
  recipe: RecipeDto;
}

export function RecipeCard({ recipe }: Props) {
  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="flex gap-3 rounded-lg border border-zinc-200 bg-white p-3 transition-colors hover:bg-zinc-50"
    >
      {/* サムネイル（MVP1 は灰色プレースホルダのみ） */}
      <div className="h-16 w-16 shrink-0 rounded-md bg-zinc-200" aria-hidden="true" />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="truncate text-sm font-medium text-zinc-900">{recipe.name}</div>

        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {recipe.tags.slice(0, 3).map((tag, index) => (
              <span
                key={tag}
                className={
                  'rounded px-1.5 py-0.5 text-[10px] ' +
                  (index === 0
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-zinc-100 text-zinc-600')
                }
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {recipe.cookingTime !== null && (
          <div className="text-xs text-zinc-500">調理時間 {recipe.cookingTime} 分</div>
        )}
      </div>
    </Link>
  );
}
```

### 設計のポイント

- サムネイルは MVP1 では枠だけ（プロジェクト決定事項）。`aria-hidden` を付与。
- タグは最大 3 個まで（スケッチ準拠）。1つ目を accent。
- カード全体が `<Link>`。タップ領域 44px 以上はパディングで確保。

---

## ステップ 5：ルート `/` を `/recipes` にリダイレクト

既存 `apps/web/src/app/page.tsx` は Next.js 雛形のままで MVP1 では不要。Recipe 一覧をトップ画面として扱うため、`/` → `/recipes` にリダイレクトする。

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/recipes');
}
```

> 雛形のテキスト・SVG 参照を削除すると `public/next.svg` などへの import も不要になるが、ファイル自体は残しておいて構わない（依存していたのは雛形のみ）。

---

## 型チェック・動作確認

```bash
pnpm --filter @cookpit/web type-check
pnpm --filter @cookpit/web dev --webpack   # webpack 起動（既存設定の都合）
```

ブラウザで以下を確認：

- `http://localhost:3000/` が `/recipes` にリダイレクトされる
- DB が空なら「まだレシピがありません」が出る
- `curl -X POST` などで2〜3件投入 → 一覧に表示される
- 検索ボックスに name の一部を入れる → 該当だけ残る
- タグチップを切り替える → そのタグを持つレシピだけ残る
- 「該当するレシピがありません」が出るパターンも確認
- `＋ 追加` ボタンのリンク先が `/recipes/new`（まだページ未実装なので 404 で OK）
- カードクリックで `/recipes/<id>` に遷移する（同上 404 で OK）

モバイル幅（375px）でレイアウトが崩れないこと（DevTools のレスポンシブ）。

---

## 共通の注意事項

- `any` / 型アサーション（`as`）は禁止（`as const satisfies` を除く）。
- デフォルトエクスポート禁止（Next.js が要求する page.tsx / layout.tsx のみ例外）。
- Server Component 内では `'use client'` を書かない。Client Component は冒頭に必ず `'use client'`。
- Server Component から Client Component に渡すデータは **DTO（プレーンオブジェクト）のみ**。`Recipe` エンティティを直接渡さない（既に UseCase が DTO に変換済み）。
- 画像最適化（`next/image`）は MVP1 では使わない（サムネイル無し）。
- TanStack Query は **導入しない**（パッケージにもまだ追加していない）。状態は `useState` のみ。

---

## 完了条件

- [ ] shadcn `input` を追加し、`@/components/ui/input.tsx` が存在する
- [ ] `apps/web/src/app/recipes/page.tsx` が Server Component として `GetRecipesUseCase` を直接呼んでいる（fetch していない）
- [ ] `recipe-list-client.tsx` / `recipe-card.tsx` / `tag-filter.tsx` が `_components` 配下に作成されている
- [ ] 検索とタグ絞り込みがクライアント側 `useState` で動く（再フェッチなし）
- [ ] 空状態・絞り込み0件状態の両方が表示される
- [ ] `/` が `/recipes` にリダイレクトされる
- [ ] `pnpm --filter @cookpit/web type-check` が通る
- [ ] モバイル幅（375px）でレイアウトが崩れない
- [ ] 実装後に Claude Code へレビュー依頼を行う

---

## このタスクのスコープ外（次の指針で扱う）

- `/recipes/new`（新規作成フォーム） — `sprint1-recipe-ui-form.md` で扱う
- `/recipes/[id]`（詳細画面） — `sprint1-recipe-ui-detail.md` で扱う
- `/recipes/[id]/edit`（編集） — フォーム指針で扱う
- 削除確認 AlertDialog — 詳細指針で扱う
</content>
</invoke>
