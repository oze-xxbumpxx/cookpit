# Sprint 1：レシピ詳細画面 実装指針

Codex への実装指示書。実装後は必ず Claude Code でレビューを受けること。

**前提**：`docs/tasks/archive/sprint1-recipe-ui-list.md`（一覧）・`docs/tasks/archive/sprint1-recipe-ui-form.md`（作成フォーム）が完了していること。`/recipes` 一覧のカードから `/recipes/[id]` へのリンクは実装済み（`recipe-card.tsx` の `href={`/recipes/${recipe.id}`}`）。`GET /api/recipes/:id`（`GetRecipeUseCase`）・`DELETE /api/recipes/:id`（`DeleteRecipeUseCase`）はサーバー側で実装済み。

---

## 事前確認

実装前に以下を必ず読むこと。

- `docs/03-architecture.md`（Presentation 層の使い分け表＝**初期表示は Server Component 直接呼び出し**、**アクション（削除）は Hono RPC**）
- `docs/07-dev-rules.md`（コーディング規約）／ `.claude/rules/presentation-layer.md` ／ `.claude/rules/coding-standards.md`
- `docs/designs/wireframes/recipe-wireframes.html`（**画面2「レシピ詳細」**。レイアウト・配置はこれに従う）

以下の実装済みファイル・型を読んでから実装すること。

- `apps/web/src/app/recipes/page.tsx`（**Server Component の手動 DI パターンの手本**。`new DrizzleRecipeRepository(getDb())` → `new GetRecipesUseCase(repo)` → `await useCase.execute()`、`export const dynamic = 'force-dynamic'`）
- `packages/application/src/recipe/recipe.dto.ts`（`RecipeDto` / `RecipeIngredientDto` / `CookingStepDto`）
- `packages/application/src/recipe/get-recipe.use-case.ts`（`execute(id: string): Promise<RecipeDto>`、見つからなければ `RecipeNotFoundError` を throw）
- `apps/web/src/server/routes/recipes.ts`（`DELETE /:id` は 204 を返す。RPC の param キーは `id`）
- `apps/web/src/lib/api-client.ts`（Hono RPC クライアント `client`）
- `apps/web/src/app/recipes/_components/recipe-card.tsx` / `recipe-list-client.tsx`（既存 Client Component のスタイル流儀＝`zinc` 系・`max-w-md`・白カード）
- `apps/web/src/components/ui/button.tsx`（`@base-ui/react/button` ベース。AlertDialog も同じ `@base-ui/react` で揃える）

---

## タスク概要

`/recipes/[id]` にレシピ詳細画面を実装する。

```
[Server] /recipes/[id] (page.tsx)
   ├─ params から id を取得（Next 16：params は Promise なので await）
   ├─ GetRecipeUseCase を手動 DI で組み立て execute(id)
   ├─ RecipeNotFoundError → notFound()（404）
   └─ RecipeDto を Client Component (RecipeDetailClient) に渡す
        ├─ メタ（タグ・調理時間・基準人数）を表示
        ├─ 倍量ボタン（1× / 1.5× / 2× / 3×）→ 材料の数値を表示上で連動（クライアント計算）
        ├─ 材料・手順・メモを表示
        └─ 最下部「削除」→ AlertDialog で確認 → Hono RPC DELETE → /recipes へ push + refresh
```

**サーバーサイド方針**：

- **詳細の初期表示**は Server Component から `GetRecipeUseCase` を直接呼び出す（arch doc の使い分け表に従う。一覧画面と同じ流儀）。
- **削除（アクション）**は Hono RPC（`client.api.recipes[':id'].$delete`）。

---

## 画面要素（スケッチ準拠：画面2）

ワイヤーフレーム画面2に従う。上から順に：

1. **トップバー**：左「← 戻る」（`/recipes` へ戻る or `router.back()`）、中央タイトル＝レシピ名。
   - **右上の「編集」ボタンは今回は出さない**（`/recipes/[id]/edit` は次タスクで未実装のため、デッドリンク/404 を避ける）。編集タスク着手時に追加する。
2. **タグ**：`detail-meta`。タグ chip を横並び表示（`recipe.tags`）。タグが空なら非表示。
3. **調理時間・基準人数**：2カラムの stats。
   - 調理時間：`recipe.cookingTime` が `null` なら「—」等で表示（任意項目）。値があれば「25分」。
   - 基準人数：`recipe.baseServings` を「2人分」。
4. **倍量**：`1× / 1.5× / 2× / 3×` のトグル（単一選択、初期 `1×`）。選択中は塗り。材料セクションの数値に連動。
5. **材料**：`materials` リスト。1行 = `食材名 / 量 / 単位`。
   - セクション見出しに「N人分」を出す（`baseServings × scale` を表示。例：基準2人・×1.5 → 3人分）。
   - 表示は倍量計算後（下記「倍量変更の方針」）。
6. **作り方**：手順を連番付きで表示（`recipe.steps`、`description` をそのまま、`{index + 1}`）。
7. **メモ**：`recipe.notes`。空文字なら**セクションごと非表示**にする。
8. **削除ブロック**：最下部に「このレシピを削除」（破壊的＝赤系）。押下で AlertDialog 確認 → 削除。

レイアウト・カラーは既存 `recipe-list-client.tsx` / `recipe-card.tsx` と同じく Tailwind（`bg-zinc-*` / `text-zinc-*`）でモバイル前提（`max-w-md`）。

---

## 倍量変更の方針（決定事項・必読）

**クライアント側で表示計算のみ行う**（サーバー往復なし・永続化なし）。

- 倍量 `scale ∈ {1, 1.5, 2, 3}` を `useState` で保持。初期 `1`。
- 材料の表示は、`amountValue` を持つ行だけ `amountValue * scale` を表示する。`amountUnit` はそのまま。
- `amountNote`（「少々」など非数値量）の行は**倍量の影響を受けない**（そのまま表示、単位欄は空）。
  - これはドメインの `RecipeIngredient.scale()` の挙動（`amount === null` の行は `this` を返す＝据え置き）と一致させること。
- 計算は `amountValue * factor` の単純乗算（ドメインの `Quantity.multiply()` も丸めなしの単純乗算）。
- **浮動小数の表示ノイズに注意**：`0.1 * 3 = 0.30000000000000004` のような表示を避けるため、表示直前に丸める（例：小数2桁で丸めて末尾ゼロを落とす）。下の付録 `formatAmount` を使う。

> 補足：scaling ロジックはドメインに `Recipe.scaleIngredients()` があるが、今回は**表示専用の即時トグル**であり永続化しないため、画面側で `amountValue * scale` を計算する。これは presentation 層に「単純乗算1行」が乗るトレードオフを承知のうえでの MVP1 判断（サーバー往復・新規エンドポイントを避ける）。丸めルールが将来必要になったらドメイン側へ寄せる。

---

## 削除の方針（決定事項・必読）

**2段階削除**（破壊的操作の事故防止）。AlertDialog は **base-ui（`@base-ui/react/alert-dialog`）** で実装する（既存 `button.tsx` / `input.tsx` と同じ `@base-ui/react` 系で揃える。shadcn CLI の alert-dialog は Radix 依存で二系統混在になるため使わない）。

- 「このレシピを削除」ボタン → AlertDialog 表示（「削除しますか？ 取り消せません」相当）。
- 確認 → `client.api.recipes[':id'].$delete({ param: { id: recipe.id } })`。
- 成功（`res.ok`、204）→ `router.push('/recipes')` + `router.refresh()`（一覧の Server Component を再取得）。
- 失敗 → ダイアログ内/画面にエラーメッセージ表示（「削除に失敗しました」）。
- 削除中は確認ボタンを `disabled`（二重送信防止）。

---

## 作成・変更するファイル一覧

```
新規作成
apps/web/src/app/recipes/[id]/page.tsx                          # Server Component（fetch + notFound）
apps/web/src/app/recipes/[id]/_components/recipe-detail-client.tsx # Client Component（表示・倍量・削除）
apps/web/src/components/ui/alert-dialog.tsx                      # base-ui ベースの AlertDialog ラッパ

更新
（なし。一覧カードのリンク先 /recipes/[id] は実装済み）
```

> `_components` は Next.js のプライベートフォルダ規約。`[id]/` 配下に閉じたコンポーネントは共通 `components/` に置かない。`alert-dialog.tsx` は再利用可能な UI なので `components/ui/` に置く。

---

## ステップ 0：base-ui AlertDialog ラッパの追加

`apps/web/src/components/ui/alert-dialog.tsx` を新規作成する。`@base-ui/react/alert-dialog`（v1.4.1 インストール済み）を使う。parts は `AlertDialog.Root / Trigger / Portal / Backdrop / Popup / Title / Description / Close`。

- **実装前に**インストール済みの `@base-ui/react@1.4.1` の型（`node_modules/@base-ui/react/alert-dialog/index.d.ts`）で各 part の props 名を確認すること（バージョン差異があるため指針のコード例を鵜呑みにしない）。
- スタイルは既存 `button.tsx` / `input.tsx` の Tailwind 流儀（角丸・ボーダー・`bg-*`・`focus-visible:ring-*`）に倣う。Backdrop は半透明オーバーレイ、Popup は中央寄せの白カード。
- 付録のコード例を起点にする。

---

## ステップ 1：`apps/web/src/app/recipes/[id]/page.tsx`（Server Component）

`page.tsx` の手動 DI は一覧 `recipes/page.tsx` と同じ。Next 16 では動的セグメントの `params` は Promise。

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

- `RecipeNotFoundError` は `@cookpit/application` から import（`GetRecipeUseCase` と同じ）。
- DB アクセスは初期表示時の1回だけ（削除は Client から RPC）。

---

## ステップ 2：`recipe-detail-client.tsx`（Client Component）

`RecipeDto` を props で受け取り、表示・倍量・削除を担う。

### props と状態

```tsx
interface Props {
  recipe: RecipeDto; // @cookpit/application
}
```

- `scale: number`（`1 | 1.5 | 2 | 3`、初期 `1`）
- `deleting: boolean`、`errorMessage: string | null`
- `RecipeDto` は `@cookpit/application` から `import type`。

### 倍量

```tsx
const SCALE_OPTIONS = [1, 1.5, 2, 3] as const;
const servings = recipe.baseServings * scale; // 「N人分」表示用
```

材料の表示は付録参照（`amountValue` を持つ行のみ `amountValue * scale` を `formatAmount` で整形、`amountNote` 行は据え置き）。

### 削除（Hono RPC）

```tsx
async function handleDelete() {
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
```

- 削除確認は AlertDialog で囲う。確認ボタンに `onClick={handleDelete}`、`disabled={deleting}`。

---

## 型チェック・動作確認

```bash
pnpm --filter @cookpit/web type-check
pnpm --filter @cookpit/web dev --webpack   # webpack 起動（serwist の都合。素の dev は Turbopack で競合）
```

ブラウザで以下を確認：

- `/recipes` のカードから `/recipes/[id]` に遷移できる
- 存在しない id（適当な UUID）で 404 になる
- 倍量 `1× → 1.5× → 2× → 3×` で材料の数値が連動（例：基準2人・鶏むね肉 300g → ×1.5 で 450g）。見出しの「N人分」も連動
- `amountNote`（「少々」）の行は倍量で変化しない
- メモが空のレシピでメモセクションが出ない
- 「削除」→ AlertDialog 表示 → 確認 → `/recipes` に戻り、一覧から消えている（`router.refresh()`）
- AlertDialog の「キャンセル」で閉じて削除されない
- モバイル幅（375px）でレイアウトが崩れない

---

## 共通の注意事項

- `any` / 型アサーション（`as`）は禁止（`as const satisfies` を除く）。
- デフォルトエクスポート禁止（Next.js が要求する `page.tsx` のみ例外）。
- 型のみの import は `import type`（`RecipeDto` など）。`===` / `!==`、「値なし」は `null`。
- Client Component は冒頭に `'use client'`。
- 倍量計算は `amountValue * scale` の表示専用。フォームのような送信 DTO 変換は無い（この画面は書き込みは削除のみ）。
- 単位・タグの選択肢ハードコードは不要（表示するだけ。`RecipeDto` の値をそのまま出す）。
- TanStack Query は導入しない。状態は `useState` のみ、削除は `client.api.recipes[':id'].$delete`。

---

## 完了条件

- [ ] `apps/web/src/app/recipes/[id]/page.tsx` が Server Component で `GetRecipeUseCase` を直接呼び、`RecipeNotFoundError` → `notFound()`
- [ ] `recipe-detail-client.tsx` が `[id]/_components` 配下に作成されている
- [ ] `components/ui/alert-dialog.tsx`（base-ui ベース）が存在する
- [ ] 倍量 `1× / 1.5× / 2× / 3×` で材料の数値・「N人分」が連動（クライアント計算）
- [ ] `amountNote` 行は倍量で変化しない
- [ ] メモが空ならメモセクション非表示
- [ ] 削除は AlertDialog の2段階 → RPC `$delete` → `/recipes` へ戻り `router.refresh()`
- [ ] 編集ボタンは出していない（今回スコープ外）
- [ ] `pnpm --filter @cookpit/web type-check` が通る
- [ ] モバイル幅（375px）でレイアウトが崩れない
- [ ] 実装後に Claude Code へレビュー依頼

---

## レビュー観点（Claude Code 用・Codex 生成の頻出ミス）

- Tailwind クラス名のタイポ（`tsc` を通過するため目視必須）
- `onClick` / 倍量トグルのハンドラ結線漏れ
- 浮動小数の表示ノイズ（`formatAmount` を通さず `amountValue * scale` を直接表示していないか）
- `amountNote` 行を誤って倍量計算していないか（据え置きが正しい）
- `params` を await しているか（Next 16）
- `RecipeNotFoundError` の捕捉漏れ（throw のまま 500 になっていないか）
- AlertDialog の base-ui props 名が v1.4.1 の型と一致しているか（指針コード例の鵜呑み禁止）
- `$delete` の param キー（`id`）が `idParamSchema` と一致しているか
- `'use client'` の付け忘れ／不要な付与

---

## このタスクのスコープ外（次の指針で扱う）

- `/recipes/[id]/edit`（編集） — `UpdateRecipeUseCase` 向けにフォームを再利用する設計を別途検討。詳細画面に編集ボタンを追加するのもこのタスクで行う
- 商品マスタ連携（`productRef`） — Phase 2
- 倍量のサーバー側計算・永続化 — MVP1 では不要

---

## 付録：完成コード例

実装時は既存ファイルの状態を確認し、差分がある場合は既存実装を優先して調整すること。**base-ui の props 名は必ずインストール済み型で確認すること。**

### `apps/web/src/components/ui/alert-dialog.tsx`（base-ui ベース・起点）

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

### `apps/web/src/app/recipes/[id]/_components/recipe-detail-client.tsx`（起点）

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

// 浮動小数の表示ノイズを避けるため小数2桁で丸めて末尾ゼロを落とす
function formatAmount(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function RecipeDetailClient({ recipe }: Props) {
  const router = useRouter();
  const [scale, setScale] = useState<number>(1);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const servings = recipe.baseServings * scale;

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
          {/* 編集ボタンは今回スコープ外 */}
          <span aria-hidden="true" className="w-9" />
        </header>

        {recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {recipe.tags.map((tag, index) => (
              <span
                key={`${tag}-${index}`}
                className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700"
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
                <span className="text-zinc-900">{ingredient.displayName}</span>
                <span className="text-right font-medium text-zinc-900">
                  {ingredient.amountValue === null
                    ? ingredient.amountNote
                    : formatAmount(ingredient.amountValue * scale)}
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

        {errorMessage !== null && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
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

> 注：base-ui の `Trigger` / `Close` は `render` prop で任意要素に合成する流儀（v1.4.1）。`render` の引数・型はインストール済み型で確認すること。削除ボタン押下後にダイアログを閉じるかどうか（成功時 `router.push` で遷移するため自然に閉じる／失敗時は開いたままエラー表示）も挙動を確認する。

```

```
