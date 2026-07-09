# Task 2: 履歴ビュー + 導線 — `/meal-plans/history` とヘッダーリンクを実装

## 概要

献立の履歴ビュー（閲覧のみ・Client Component なし）と、recipes / products 一覧ヘッダーへの
「献立」リンク追加を実装する。
**前提**: Task 1（`01-plan-screen.md`）完了済み。`_utils/meal-plan-view.ts` の
`formatWeekRange` / `buildRecipeNameMap` / `resolveHistoryLimit` をそのまま使用する（再実装しない）。
**模範コード**: Server Component は `apps/web/src/app/recipes/page.tsx`、動的 params の await は
`apps/web/src/app/recipes/[id]/page.tsx`（`params: Promise<...>` を `await` する Next 15 規約）、
ヘッダーリンクは `apps/web/src/app/products/_components/product-list-client.tsx` 49〜60 行の
`Link` + `buttonVariants` 構成を踏襲する。確定値は `README.md` の確定値表（S/D/G）に従う。

## アーキテクチャ制約

- 履歴画面に Client Component を作らない（D-4）。「さらに表示」はリンク遷移で実現する
- 現在週の判定は `WeekIdentifier.current().toString()` を Server Component で算出（D-5）。
  クライアント・カード側で週計算を再実装しない
- `history-week-card.tsx` に `'use client'` を**付けない**（G-5。Map を props で受けるため
  Client 境界にすると Next のシリアライズで壊れる）
- `any` 禁止・default export 禁止（**例外: `history/page.tsx` は Next 規約で default export**）
- 型のみのインポートは `import type`。`===` / `!==` のみ使用。コメントは Why が非自明な場合のみ
- Tailwind はセマンティックトークンのみ（G-7）。新規依存パッケージの追加禁止

## 実装対象ファイル

### 1. `apps/web/src/app/meal-plans/_components/history-week-card.tsx`（新規。`'use client'` **なし**）

```typescript
import type { MealPlanDto } from '@cookpit/application';

interface Props {
  mealPlan: MealPlanDto;
  recipeNameMap: Map<string, string>;
  isCurrentWeek: boolean;
}

export function HistoryWeekCard({ mealPlan, recipeNameMap, isCurrentWeek }: Props);
```

- 純粋表示コンポーネント。操作（ボタン・onClick）は一切持たない
- 週表示: `formatWeekRange(mealPlan.weekIdentifier)`
- `isCurrentWeek === true` のとき「今週」ラベルを週表示の隣に表示
  （`text-primary` 系のトークンで小さめのバッジ。`isCurrentWeek === false` では何も出さない）
- `plannedRecipes` を列挙。各行はレシピ名 + 倍量 `` `${scaleFactor}×` ``（例: `1.5×`）。
  **リンクは付けない**（閲覧専用ビュー。作成画面の `PlannedRecipeItem` とは別物なので流用しない）
  - `recipeNameMap.get(recipeId)` が解決できる → 名前をそのまま表示
  - 解決できない（`undefined`）→ 「削除済みレシピ」を `text-muted-foreground` で表示（S-4）
- `plannedRecipes.length === 0` → 「レシピなし」を表示
- `mealPlan.status` は**一切表示しない**（D-2。`draft` 等の文字列を画面に出さない）
- 外枠は既存カード類と同様に `bg-card` / `border` / `rounded-*` 系トークンで構成する

### 2. `apps/web/src/app/meal-plans/history/page.tsx`（新規。Server Component・`'use client'` なし）

```typescript
import { getDb } from '@/db/client';
import { GetMealPlanHistoryUseCase, GetRecipesUseCase } from '@cookpit/application';
import { DrizzleMealPlanRepository, DrizzleRecipeRepository } from '@cookpit/infrastructure';
import { WeekIdentifier } from '@cookpit/domain/src/shared/week-identifier';
import { HistoryWeekCard } from '../_components/history-week-card';
import { buildRecipeNameMap, resolveHistoryLimit } from '../_utils/meal-plan-view';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ limit?: string }>;
}

export default async function MealPlanHistoryPage({ searchParams }: Props) {
  const { limit: rawLimit } = await searchParams;
  const limit = resolveHistoryLimit(rawLimit);
  // ...
}
```

- `searchParams` は Promise（Next 15）。`await` してから `resolveHistoryLimit` へ渡す
  （clamp ロジックを page に書かない。util が正）。
  **`searchParams` の使用は本リポジトリ初**。`recipes/[id]/page.tsx` の `params` と同じ
  await パターンで書く
- `getDb()` から手動 DI し、`Promise.all` で並列実行:
  `new GetMealPlanHistoryUseCase(new DrizzleMealPlanRepository(db)).execute({ limit })` と
  `new GetRecipesUseCase(new DrizzleRecipeRepository(db)).execute()`
- `const currentWeekIdentifier = WeekIdentifier.current().toString();` を算出し、
  各 `HistoryWeekCard` へ `isCurrentWeek={mealPlan.weekIdentifier === currentWeekIdentifier}` を渡す
- `buildRecipeNameMap(recipes)` を 1 回だけ構築し全カードへ渡す
- レイアウト: `min-h-dvh bg-background` + `max-w-md`（Task 1 の meal-plan-client と同構成）。
  ヘッダーは同じ `grid grid-cols-[1fr_auto_1fr] items-center gap-3`:
  - 左: 「献立」リンク → `/meal-plans`
    （`buttonVariants({ variant: 'ghost', size: 'sm' })` + `'h-9 px-2 text-foreground'`）
  - 中央: `<h1 className="text-lg font-semibold text-foreground">献立の履歴</h1>`
  - 右: 空（`<div />` でグリッド位置を保つ）
- 本文: 履歴を**取得順のまま**列挙（Repository が新しい週順で返す。並べ替えない）
- `mealPlans.length === 0` → 「履歴はまだありません」
- 「さらに表示」リンク: `mealPlans.length === limit && limit < 12` のときのみ表示。
  `<Link href={`/meal-plans/history?limit=${Math.min(limit + 4, 12)}`}>さらに表示</Link>`
  （4→8→12。12 に達したら出さない。取得件数 < limit は「もう続きがない」ので出さない）
- try/catch しない（recipes/page.tsx 先例。DB 障害は Next のエラーバウンダリに委ねる）

### 3. `apps/web/src/app/recipes/_components/recipe-list-client.tsx`（変更。リンク 1 個の追加のみ）

- ヘッダー左のコンテナ `<div className="flex justify-start">`（35 行目）を
  `<div className="flex justify-start gap-1">` にし、既存の「商品」リンクの**後ろ**に
  同一スタイルで「献立」リンクを追加する:

```tsx
<Link
  href="/meal-plans"
  className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-9 px-2 text-foreground')}
>
  献立
</Link>
```

- **これ以外は 1 文字も変更しない**（検索・カテゴリ・カード列挙のロジックに触らない）

### 4. `apps/web/src/app/products/_components/product-list-client.tsx`（変更。リンク 1 個の追加のみ）

- 同上。ヘッダー左のコンテナ（50 行目）に `gap-1` を追加し、既存の「レシピ」リンクの後ろに
  「献立」リンク（href=`/meal-plans`・同スタイル）を追加する。他は一切変更しない

## 命名・記法の注意

- コンポーネント名の正確な綴り: `HistoryWeekCard` / `MealPlanHistoryPage`
- util の import 元は `../_utils/meal-plan-view`（Task 1 で作成済み。`resolveHistroyLimit` 等のタイポ注意）
- UI 文言は README G-6 の固定値をそのまま使う: 「献立の履歴」「今週」「レシピなし」
  「履歴はまだありません」「さらに表示」「削除済みレシピ」（言い換えない）
- 導線リンクの文言は「献立」（recipes / products 両方で同一）
- Tailwind クラスは既存ファイルからコピーして使う（手打ちで `bg-backgroud` 等のタイポを作らない）

## テスト

### `_components/history-week-card.test.tsx`（試験計画 WC-H-01〜06）

`'use client'` なしの同期コンポーネントなので RTL でそのまま render できる（モック不要。
`next/link` を使わないため link モックも不要）。フィクスチャは Task 1 と同じ
`createMealPlanDto(overrides)` / `createPlannedRecipeDto(overrides)` パターンをテスト内に定義する
（`weekIdentifier: '2026-07-04'`・`status: 'draft'`・`scheduledDate: null`・`cookedAt: null`・
`notes: ''`）。`recipeNameMap` は `new Map([[id, name]])` の固定値。`afterEach` で `cleanup()`。

- WC-H-01: レシピ 2 件・名前解決可能 → `7/4（土）〜7/10（金）` + 各レシピ名 + 倍量（`2×` 等）が表示される
- WC-H-02: `isCurrentWeek: true` → 「今週」が表示される
- WC-H-03: `isCurrentWeek: false` → 「今週」が表示されない（`queryByText` で `null`）
- WC-H-04: `plannedRecipes: []` → 「レシピなし」が表示される
- WC-H-05: Map に存在しない `recipeId` の行 → 「削除済みレシピ」が表示される
- WC-H-06: `status: 'draft'` → `draft` という文字列が表示されない（D-2）

### 回帰（既存テストを変更せず green のまま）

- `product-list-client.test.tsx` の WC-P-01〜04（リンク追加が既存アサーションを壊さないこと。
  既存テストはリンク数を固定していないため、**テスト側の修正は不要**のはず。壊れた場合は
  実装側の変更が「リンク 1 個の追加」を超えていないか見直す）
- 既存 API ルートテスト（`meal-plans.test.ts` ほか）

### 対象外

- `history/page.tsx` の RTL テストは書かない（async Server Component は RTL 非対応。
  limit の clamp は Task 1 の U-V-06〜10 で担保済み。画面は受け入れ時の実画面確認 MB-05/06 で担保）

## 完了条件

- [ ] `pnpm --filter @cookpit/web test` / `pnpm --filter @cookpit/web type-check` / `pnpm lint` 全 green
- [ ] WC-H-01〜06 が全て実装され green。WC-P-01〜04 が**無修正のまま** green
- [ ] `packages/*`・`apps/web/src/server/` に変更がない（`git status` で確認）
- [ ] 既存 2 ファイルの diff が「`gap-1` 追加 + `Link` 1 個」だけであること（`git diff` で確認）
- [ ] `'use client'` が G-5 の指定どおり（`history-week-card.tsx` / `history/page.tsx` に**無い**こと）
- [ ] Tailwind に直接色（`zinc-*` 等）が混入していない
