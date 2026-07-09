# Task 1: 献立作成画面 — `/meal-plans` 一式を実装

## 概要

今週の献立画面（表示・冪等作成・レシピ追加・削除）を実装する。
初期表示は Server Component の手動 DI 直呼び、操作は素の Hono RPC + `router.refresh()`。
**模範コード**: 一覧の構造・ヘッダー・検索は `apps/web/src/app/recipes/_components/recipe-list-client.tsx`、
Server Component は `apps/web/src/app/recipes/page.tsx`、RPC + router は
`apps/web/src/app/recipes/[id]/_components/recipe-detail-client.tsx`（`client.api.recipes[':id'].$delete` +
`router.refresh()`）を踏襲する。確定値は `README.md` の確定値表（S/D/G）に従う。

## アーキテクチャ制約

- Presentation 層は UseCase を呼ぶだけ。ドメインロジック（週計算・状態遷移）を書かない。
  現在週の算出は `WeekIdentifier.current()`（Domain の値オブジェクト）を Server Component で呼ぶ（D-5）
- UseCase の組み立て（手動 DI）は Server Component 内で行う。書き込みは既存 Hono ルート経由（RPC）
- `any` 禁止（`unknown` を使う）・default export 禁止（**例外: `page.tsx` は Next 規約で default export**）
- 型のみのインポートは `import type`。「値なし」は `null`（`undefined` と混在させない）
- `===` / `!==` のみ使用。コメントは Why が非自明な場合のみ
- Tailwind はセマンティックトークンのみ（G-7）。新規依存パッケージの追加禁止

## 実装対象ファイル

### 1. `apps/web/src/app/meal-plans/_utils/meal-plan-view.ts`（新規。`'use client'` なし）

```typescript
import type { RecipeDto } from '@cookpit/application';

// "2026-07-04" → 「7/4（土）〜7/10（金）」。終了日 = 開始日 + 6 日。年は表示しない。
// Date 構築は new Date(weekIdentifier + 'T00:00:00')（ローカルタイム規約）
export function formatWeekRange(weekIdentifier: string): string;

// recipe.id → recipe.name。Map に無い ID = 削除済みレシピと判定する（S-5）
export function buildRecipeNameMap(recipes: RecipeDto[]): Map<string, string>;

// history の ?limit= を解決: Number(raw) が整数なら 1〜12 に clamp、非整数・undefined は 4
export function resolveHistoryLimit(raw: string | undefined): number;
```

- 曜日は `['日', '月', '火', '水', '木', '金', '土']` の固定配列（`Date#getDay()` で引く）
- 区切りは `〜`（U+301C）、括弧は全角（G-4）

### 2. `apps/web/src/app/meal-plans/_components/planned-recipe-item.tsx`（新規。`'use client'` **必要**）

```typescript
import type { PlannedRecipeDto } from '@cookpit/application';

interface Props {
  plannedRecipe: PlannedRecipeDto;
  recipeName: string | null; // null = 削除済みレシピ
  onRemove: (plannedRecipeId: string) => void;
  submitting: boolean;
}

export function PlannedRecipeItem({ plannedRecipe, recipeName, onRemove, submitting }: Props);
```

- `recipeName !== null`: レシピ名を表示し `next/link` の `Link` で `/recipes/${plannedRecipe.recipeId}` へ
- `recipeName === null`: 「削除済みレシピ」を `text-muted-foreground` で表示・リンクなし（S-4）
- 倍量バッジ: `` `${plannedRecipe.scaleFactor}×` ``（例: `1.5×`）
- 削除ボタン: lucide-react の `X` アイコン + `aria-label="献立から削除"`。`submitting` 中 disabled。
  **削除済みレシピでも有効**（S-4）。click で `onRemove(plannedRecipe.id)`（`recipeId` ではなく `id`）

### 3. `apps/web/src/app/meal-plans/_components/recipe-picker.tsx`（新規。`'use client'` **必要**）

```typescript
import type { RecipeDto } from '@cookpit/application';

interface Props {
  recipes: RecipeDto[];
  onAdd: (recipeId: string, scaleFactor: number) => void;
  submitting: boolean;
}

export function RecipePicker({ recipes, onAdd, submitting }: Props);
```

- state: 検索テキスト・選択中 recipeId（`string | null`）・選択倍量（`number`、初期値 `1`）
- 検索: `recipe.name.includes(query.trim())`（recipe-list-client と同ロジック）。0 件時は
  「該当するレシピがありません」。検索 `Input` は `@/components/ui/input`、`aria-label` か
  `label` で「レシピを検索」を付ける
- レシピ行タップで選択状態をトグル（選択中の行は `border-primary` 等で強調）
- 倍量プリセット: `[1, 1.5, 2, 3]` のボタン群。表示 `1×` `1.5×` `2×` `3×`。選択中を強調
- [献立に追加] ボタン: 未選択 or `submitting` で disabled。click で `onAdd(選択 recipeId, 選択倍量)` を
  呼んだ後、**選択レシピのみ `null` にリセット**（検索テキスト・倍量は維持。picker は閉じない）

### 4. `apps/web/src/app/meal-plans/_components/meal-plan-client.tsx`（新規。`'use client'` **必要**）

```typescript
import type { MealPlanDto, RecipeDto } from '@cookpit/application';

interface Props {
  mealPlan: MealPlanDto | null;
  recipes: RecipeDto[];
  currentWeekIdentifier: string; // 例 "2026-07-04"。Server Component が算出済み
}

export function MealPlanClient({ mealPlan, recipes, currentWeekIdentifier }: Props);
```

- **MealPlan をローカル state にコピーしない**。props を描画し、変更系の成功後は
  `router.refresh()`（`next/navigation` の `useRouter`）で Server Component を再実行させる
- state は UI 状態のみ: `submitting: boolean` / `errorMessage: string | null` / picker 開閉
- 名前解決: `buildRecipeNameMap(recipes)` を `useMemo` で構築し、`map.get(recipeId) ?? null` を
  `PlannedRecipeItem` へ渡す
- レイアウト（recipe-list-client と同構造。`min-h-dvh bg-background` + `max-w-md`）:

```tsx
<header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
  <div className="flex justify-start gap-1">
    {/* 「レシピ」→ /recipes、「商品」→ /products。buttonVariants({ variant: 'ghost', size: 'sm' }) + 'h-9 px-2 text-foreground' */}
  </div>
  <h1 className="text-lg font-semibold text-foreground">今週の献立</h1>
  <div className="flex justify-end">{/* 「履歴」→ /meal-plans/history。同スタイル */}</div>
</header>
```

- 表示分岐:
  - `mealPlan === null` → 「今週の献立はまだありません」+ [今週の献立をはじめる] ボタン
  - `mealPlan !== null` → `formatWeekRange(mealPlan.weekIdentifier)` の週表示 +
    `plannedRecipes` を `PlannedRecipeItem` で列挙 + [レシピを追加] トグル → `RecipePicker`
  - `plannedRecipes.length === 0` → 「レシピがまだ追加されていません」
- RPC（`import { client } from '@/lib/api-client';`）。3 操作とも共通形:
  `setSubmitting(true)` → try で `$post`/`$delete` → `response.ok` なら `router.refresh()`、
  でなければ `setErrorMessage('操作に失敗しました。')` → catch で
  `setErrorMessage('通信エラーが発生しました。')` → finally で `setSubmitting(false)`

```typescript
// 作成（mealPlan === null のとき）
const response = await client.api['meal-plans'].$post({
  json: { weekIdentifier: currentWeekIdentifier },
});

// レシピ追加（RecipePicker の onAdd から）
const response = await client.api['meal-plans'][':id'].recipes.$post({
  param: { id: mealPlan.id },
  json: { recipeId, scaleFactor },
});

// レシピ削除（PlannedRecipeItem の onRemove から。確認ダイアログなし・D-3）
const response = await client.api['meal-plans'][':id'].recipes[':plannedRecipeId'].$delete({
  param: { id: mealPlan.id, plannedRecipeId },
});
```

- `errorMessage` は `null` でなければリスト上部に `text-destructive` 系で表示。次の操作開始時に `null` へ戻す

### 5. `apps/web/src/app/meal-plans/page.tsx`（新規。Server Component・`'use client'` なし）

```typescript
import { getDb } from '@/db/client';
import { GetCurrentMealPlanUseCase, GetRecipesUseCase } from '@cookpit/application';
import { DrizzleMealPlanRepository, DrizzleRecipeRepository } from '@cookpit/infrastructure';
import { WeekIdentifier } from '@cookpit/domain/src/shared/week-identifier';
import { MealPlanClient } from './_components/meal-plan-client';

export const dynamic = 'force-dynamic';

export default async function MealPlansPage() {
  const db = getDb();
  const [mealPlan, recipes] = await Promise.all([
    new GetCurrentMealPlanUseCase(new DrizzleMealPlanRepository(db)).execute(),
    new GetRecipesUseCase(new DrizzleRecipeRepository(db)).execute(),
  ]);
  const currentWeekIdentifier = WeekIdentifier.current().toString();

  return (
    <MealPlanClient
      mealPlan={mealPlan}
      recipes={recipes}
      currentWeekIdentifier={currentWeekIdentifier}
    />
  );
}
```

- try/catch しない（recipes/page.tsx 先例。DB 障害は Next のエラーバウンダリに委ねる）
- `@cookpit/domain` の import が type-check で通らない場合は**中断して報告**（G-1。回避策を自作しない）

## 命名・記法の注意

- コンポーネント名の正確な綴り: `PlannedRecipeItem` / `RecipePicker` / `MealPlanClient` / `MealPlansPage`
- 関数名: `formatWeekRange` / `buildRecipeNameMap` / `resolveHistoryLimit`（`resolveHistroyLimit` 等のタイポ注意）
- `onRemove` に渡すのは `plannedRecipe.id`（PlannedRecipeId）。`plannedRecipe.recipeId` と混同しない
- UI 文言・エラー文言は README G-3 / G-6 の固定値をそのまま使う（言い換えない）
- Tailwind クラスは既存ファイルからコピーして使う（手打ちで `bg-backgroud` 等のタイポを作らない）

## テスト

配置は co-located。フィクスチャは `product-list-client.test.tsx` の `createProductDto` パターンで
`createRecipeDto` / `createMealPlanDto` / `createPlannedRecipeDto`（overrides 引数つき）を各テスト内に定義する。
`RecipeDto` の必須フィールドは `packages/application/src/recipe/recipe.dto.ts` を参照
（`id` / `name` / `baseServings` / `servings` / `cookingTime` / `tags` / `notes` / `ingredients` / `steps` /
`createdAt` / `updatedAt`）。

### `_utils/meal-plan-view.test.ts`（試験計画 U-V-01〜10）

- U-V-01: `formatWeekRange('2026-07-04')` → `'7/4（土）〜7/10（金）'`
- U-V-02: `formatWeekRange('2026-06-27')` → `'6/27（土）〜7/3（金）'`（月またぎ）
- U-V-03: `formatWeekRange('2026-12-26')` → `'12/26（土）〜1/1（金）'`（年またぎ）
- U-V-04: `buildRecipeNameMap` — 2 件で size 2・`get(id)` が name
- U-V-05: `buildRecipeNameMap([])` → 空 Map
- U-V-06〜10: `resolveHistoryLimit` — `undefined→4` / `'1'→1`・`'4'→4`・`'12'→12` / `'0'→1`・`'-3'→1` /
  `'13'→12` / `'abc'→4`・`'4.5'→4`

### `_components/planned-recipe-item.test.tsx`（WC-I-01〜06）

`vi.mock('next/link')`（product-list-client.test.tsx と同じ `<a href>` モック）。

- WC-I-01: 名前あり → 名前表示 + `/recipes/<recipeId>` への href
- WC-I-02: `recipeName: null` → 「削除済みレシピ」・リンクなし
- WC-I-03: 削除ボタン click → `onRemove` が `plannedRecipe.id` で 1 回呼ばれる
- WC-I-04: `recipeName: null` でも削除ボタン click で `onRemove` が呼ばれる
- WC-I-05: `submitting: true` → 削除ボタン disabled
- WC-I-06: `scaleFactor: 1.5` → `1.5×` が表示される

### `_components/recipe-picker.test.tsx`（WC-K-01〜07）

- WC-K-01: 2 件中「カレー」検索でカレーのみ表示
- WC-K-02: 未選択時 [献立に追加] disabled
- WC-K-03: 選択のみ → 追加 click → `onAdd(recipeId, 1)`
- WC-K-04: 選択 + `2×` click → 追加 click → `onAdd(recipeId, 2)`
- WC-K-05: 追加後 [献立に追加] が再び disabled（選択リセット）
- WC-K-06: `submitting: true` + 選択あり → disabled
- WC-K-07: 全件不一致の検索語 → 「該当するレシピがありません」

### `_components/meal-plan-client.test.tsx`（WC-M-01〜11）

モック雛形（この構成で通らない場合は**テスト側のみ**調整。プロダクションコードを変えない）:

```typescript
const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  createMealPlan: vi.fn(),
  addRecipe: vi.fn(),
  removeRecipe: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn() }),
}));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      'meal-plans': {
        $post: mocks.createMealPlan,
        ':id': {
          recipes: {
            $post: mocks.addRecipe,
            ':plannedRecipeId': { $delete: mocks.removeRecipe },
          },
        },
      },
    },
  },
}));
```

成功レスポンスは `mockResolvedValue({ ok: true, json: async () => ({}) })`、失敗は `{ ok: false }`、
通信エラーは `mockRejectedValue(new Error('network'))`。`afterEach` で `cleanup()` + `vi.clearAllMocks()`。

- WC-M-01: `mealPlan: null` → 「今週の献立はまだありません」+ [今週の献立をはじめる]
- WC-M-02: 作成 click → `createMealPlan` が `{ json: { weekIdentifier: currentWeekIdentifier } }` で
  呼ばれ、成功で `refresh` 1 回
- WC-M-03: `ok: false` → 「操作に失敗しました。」表示・`refresh` 未呼び出し
- WC-M-04: reject → 「通信エラーが発生しました。」表示
- WC-M-05: `mealPlan` あり → `7/4（土）〜7/10（金）` とレシピ名が表示される
- WC-M-06: `plannedRecipes: []` → 「レシピがまだ追加されていません」
- WC-M-07: Map に無い recipeId → 「削除済みレシピ」
- WC-M-08: picker で選択 → 追加 → `addRecipe` が `{ param: { id }, json: { recipeId, scaleFactor } }` で
  呼ばれ、成功で `refresh`
- WC-M-09: 項目の削除 click → `removeRecipe` が `{ param: { id, plannedRecipeId } }` で呼ばれ、成功で `refresh`
- WC-M-10: `$post` を未解決 Promise にして click → ボタンが disabled（二重発火しない）
- WC-M-11: 「レシピ」`/recipes`・「商品」`/products`・「履歴」`/meal-plans/history` の href が存在する

## 完了条件

- [ ] `pnpm --filter @cookpit/web test` / `pnpm --filter @cookpit/web type-check` / `pnpm lint` 全 green
- [ ] U-V-01〜10・WC-I-01〜06・WC-K-01〜07・WC-M-01〜11 が全て実装され green
- [ ] `packages/*`・`apps/web/src/server/` に変更がない（`git status` で確認）
- [ ] `'use client'` が G-5 の指定どおり（client / picker / item に有り、utils / page に無し）
- [ ] Tailwind に直接色（`zinc-*` 等）が混入していない
