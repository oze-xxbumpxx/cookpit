# 実装計画: dashboard-home-ia

- 前提となる設計書: docs/designs/dashboard-home-ia.md（confirmed。本設計書内の値を再提案しない）
- レベル: L2
- 実装ルート: Orchestrator（implementer）
- 判断理由: 既定（探索的な画面 IA 変更 — ヒーロー/ステッパーの視覚表現・NavBar のマークアップ
  再構成を伴い、「指示書に書き切れる定型実装」の Codex 委譲基準に非該当）

## 変更対象ファイル

- `apps/web/src/app/_utils/dashboard-view.ts` — `getNextAction` / `MEAL_PLAN_STATUS_STEPS` /
  `StepState` / `getStepState` を追加（既存 `MEAL_PLAN_STATUS_LABELS` は変更しない）。
- `apps/web/tests/app/_utils/dashboard-view.node.test.ts` — 上記 4 エクスポートのテストを追記。
- `apps/web/src/app/_components/dashboard.tsx` — 「今週の献立」セクションをヒーロー+ステッパーに
  置換、「メニュー」セクション（`QUICK_LINKS`）を削除。
- `apps/web/tests/app/_components/dashboard.test.tsx` — ヒーロー/ステッパーのアサーションに
  更新、メニューリンクの既存テストを削除。
- `apps/web/src/app/_components/nav-bar.tsx` — 5 タブ化、`/more` の `isActive` 判定、マークアップ
  構造変更（`<nav><div><ul>`）。
- `apps/web/tests/app/_components/nav-bar.test.tsx` — 5 タブ + `/more` active 判定のテストに更新。
- `apps/web/src/app/loading.tsx` — ヒーロー用スケルトンの高さ調整（`h-24` → `h-40`）。

## 新規作成ファイル

- `apps/web/src/app/more/page.tsx` — `/more` の Server Component（静的、UseCase 呼び出しなし）。
- `apps/web/src/app/more/_components/more-menu.tsx` — レシピ・商品への 2 リンクカード表示。
- `apps/web/tests/app/more/_components/more-menu.test.tsx` — `MoreMenu` の RTL テスト。

## ファイルごとの変更内容

### apps/web/src/app/\_utils/dashboard-view.ts

- 変更内容:
  1. 既存の `import type { MealPlanStatus } from '@cookpit/application';` を
     `import type { MealPlanDto, MealPlanStatus } from '@cookpit/application';` に変更する
     （`MealPlanDto` を型としてのみ追加 import）。
  2. `DashboardNextAction` インターフェースを追加してエクスポート（設計書 §フロントエンド設計
     のコードをそのまま採用）:
     ```ts
     export interface DashboardNextAction {
       title: string;
       description: string;
       href: string;
       ctaLabel: string;
     }
     ```
  3. `getNextAction(mealPlan: MealPlanDto | null): DashboardNextAction` を追加してエクスポート
     （設計書のコードをそのまま採用。`mealPlan === null` の分岐 + `MealPlanStatus` を網羅する
     `switch`）。`default` 節は置かない（`MealPlanStatus` に新しい値が追加された場合に
     コンパイルエラーで検出させる、設計書で確定した意図的な設計）。
  4. `MEAL_PLAN_STATUS_STEPS: { status: MealPlanStatus; label: string }[]` を追加してエクスポート
     （設計書のコードをそのまま採用。draft/shopping/cooking/consuming/completed の 5 件、
     この順序で定義する）。
  5. `export type StepState = 'complete' | 'current' | 'upcoming';` を追加してエクスポート。
  6. `getStepState(current: MealPlanStatus | null, step: MealPlanStatus): StepState` を追加して
     エクスポート（設計書のコードをそのまま採用。`MEAL_PLAN_STATUS_STEPS.findIndex` で
     `currentIndex` / `stepIndex` を求め、`stepIndex < currentIndex` → `'complete'`、
     `stepIndex === currentIndex` → `'current'`、それ以外 → `'upcoming'`。`current === null` は
     関数冒頭で `'upcoming'` を即 return）。
  7. 既存の `MEAL_PLAN_STATUS_LABELS` 定数・シグネチャは変更しない。
- 完了条件:
  - `DashboardNextAction` / `getNextAction` / `MEAL_PLAN_STATUS_STEPS` / `StepState` /
    `getStepState` が named export されている。
  - `getNextAction` の `switch` に `default` 節が無い状態で `pnpm --filter web type-check`
    （または `pnpm type-check`）が通る（`MealPlanStatus` の全 5 値を網羅済みであることの
    コンパイル時保証）。
  - 既存 `MEAL_PLAN_STATUS_LABELS` の値・型に変更がない。
  - `any` 不使用、`===`/`!==` 使用。

### apps/web/tests/app/\_utils/dashboard-view.node.test.ts

- 変更内容: 既存の `describe('MEAL_PLAN_STATUS_LABELS', ...)` は維持し、以下を追記する。
  - `import { getNextAction, getStepState, MEAL_PLAN_STATUS_STEPS } from '../../../src/app/_utils/dashboard-view';`
    を追加（既存 import 文に統合、または新規 import 文を追加）。テストで `MealPlanDto` の
    fixture を作る場合は `createMealPlanDto` 相当のヘルパーをこのファイル内に定義する
    （`dashboard.test.tsx` の `createMealPlanDto` と重複してよい。同一 workspace 内の
    共有ヘルパー化は本計画のスコープ外）。
  - `describe('getNextAction', ...)`: 設計書 §テスト方針で確定した 6 状態
    （`null` / `draft` / `shopping` / `cooking` / `consuming` / `completed`）をそれぞれ
    `toEqual` で検証する。各ケースの期待値は設計書 §フロントエンド設計のコード内リテラルと
    完全一致させる（例: `consuming` → `{ title: '作り置きを食べましょう', description: '期限が近い在庫から消費するのがおすすめ', href: '/pantry', ctaLabel: '在庫を見る' }`）。
  - `describe('getStepState', ...)`: 設計書で確定した 4 パターンを検証する。
    - `current === null`: `MEAL_PLAN_STATUS_STEPS` の全ステップに対し `getStepState(null, step.status)`
      が `'upcoming'` になる。
    - `current === 'draft'`: `draft` ステップが `'current'`、残り 4 ステップが `'upcoming'`。
    - `current === 'consuming'`: `draft`/`shopping`/`cooking` が `'complete'`、`consuming` が
      `'current'`、`completed` が `'upcoming'`。
    - `current === 'completed'`: `draft`〜`consuming` が `'complete'`、`completed` が `'current'`
      （全て `'complete'` または `'current'` になり `'upcoming'` は無い）。
- 完了条件: 上記 2 `describe` ブロック（`getNextAction` 6 件 + `getStepState` 4 件、計 10 件前後）
  が追加され、`pnpm --filter web test`（node project）で既存ケースと合わせて全件 PASS する。
  ファイル名は `*.node.test.ts` のまま変更しない。

### apps/web/src/app/\_components/dashboard.tsx

- 変更内容:
  1. **import 整理**:
     - `lucide-react` の `CalendarDays` / `ChefHat` / `ShoppingCart` / `Tag` を削除する
       （`QUICK_LINKS` 専用の使用のため。`LOCATION_ICONS` が使う `Refrigerator` / `Snowflake` /
       `Package` / `CircleHelp`、賞味期限見出しの `Clock` は残す）。
     - `apps/web/src/app/_utils/dashboard-view.ts` からの import に
       `getNextAction`, `MEAL_PLAN_STATUS_STEPS`, `getStepState` を追加する（既存
       `MEAL_PLAN_STATUS_LABELS` と同じ import 文にまとめる）。
  2. **`QUICK_LINKS` 定数を削除する**（`const QUICK_LINKS: { href: string; label: string; Icon: LucideIcon }[] = [...]`
     ブロック全体）。
  3. **「今週の献立」`<section>`（現行 72〜107 行、`<h2>今週の献立</h2>` から続くブロック）を
     ヒーローに置換する**:
     - 見出し `<h2>今週の献立</h2>` は置かない（ヒーロー自身が主情報のため削除）。
     - `const nextAction = getNextAction(mealPlan);` を関数本体冒頭（`return` 直前）で導出する。
     - `mealPlan !== null` のときのみ、週レンジ + 状態チップ + レシピ件数の行を表示する。既存の
       `formatWeekRange(mealPlan.weekIdentifier)` / `mealPlanStatusChipClass(mealPlan.status)` /
       `MEAL_PLAN_STATUS_LABELS[mealPlan.status]` の表示ロジックをそのまま再利用する（現行の
       `<Link href="/meal-plans">...</Link>` ブロック内の中身と同じ JSX。ただし外枠の `<Link>`
       は使わない — 手順 4 参照）。
     - `nextAction.title` を見出し（`text-base font-semibold text-foreground` 目安）、
       `nextAction.description` を本文（`text-sm text-muted-foreground`）として表示する。
     - プライマリ CTA:
       ```tsx
       <Link href={nextAction.href} className={cn(buttonVariants({ variant: 'default' }), 'h-11')}>
         {nextAction.ctaLabel}
       </Link>
       ```
       ヒーロー全体を `<Link>` で包む現行実装（`mealPlan !== null` 分岐のカード全体リンク）は
       廃止し、CTA だけが主リンクになる。
     - ステッパー: `<ol className="flex items-center gap-1">` で `MEAL_PLAN_STATUS_STEPS` を
       `map` する。各ステップは `getStepState(mealPlan?.status ?? null, step.status)` の結果に
       応じて `text-primary`（`'current'`）/ `text-foreground`（`'complete'`）/
       `text-muted-foreground`（`'upcoming'`）を適用する。ステップ間の接続線は
       `border-t border-border` で表現する。各ステップは `<li>` テキストのみで非クリッカブル
       （`<Link>` を使わない）。
     - カード全体は既存トーン `rounded-lg border border-border bg-card p-4` を維持する
       （外枠 `<div>` に付与し、`mealPlan === null` の空状態カードと共通化するか、
       `mealPlan` の有無で分岐して両方に同じクラスを付けるかは implementer の裁量。設計書は
       見た目のみ確定し実装の分岐構造までは規定していない）。
  4. **「メニュー」`<section>`（`QUICK_LINKS.map(...)` を含む末尾のブロック）を削除する。**
  5. **「賞味期限が近い在庫」セクションは変更しない**（`ExpiryAlertSubscription` / カード一覧 /
     空メッセージ / `locationLabel` / `locationIcon` / `LOCATION_ICONS` は既存のまま）。
- 完了条件:
  - `QUICK_LINKS` 定数・「メニュー」`<section>`・削除対象 4 アイコン import が残っていない。
  - `mealPlan === null` で CTA ラベル「今週の献立を作る」・`href="/meal-plans"` が表示される。
  - `mealPlan.status === 'shopping'` で CTA ラベル「買い物リストを開く」・`href="/shopping-lists"`
    が表示される。
  - ステッパーの 5 ラベル（献立/買い物/調理/消費/完了）が常に表示される
    （`mealPlan` の有無・状態に関わらず）。
  - `mealPlan !== null` のときのみ週レンジ + 状態チップ + レシピ件数の行が表示される。
  - 賞味期限セクションの既存 DOM・テキスト・クラスに変更がない（回帰確認は手順 6 の
    `dashboard.test.tsx` の DC-\* ケースで担保）。
  - `any` 不使用、`pnpm lint` / `pnpm type-check` が通る。

### apps/web/tests/app/\_components/dashboard.test.tsx

- 変更内容:
  - 既存テスト「主要画面へのクイックリンクを表示する」（96 行付近、`screen.getByRole('link', { name: '在庫' })`
    / `'レシピ'` を検証）を**削除する**（`QUICK_LINKS` 削除に伴い対象機能が無くなるため）。
  - 既存テスト「今週の献立が無いとき作成 CTA を表示する」（38〜43 行）はそのまま維持できる
    （`getNextAction(null)` の `ctaLabel` が現行と同じ「今週の献立を作る」のため変更不要）。
  - 既存テスト「今週の献立があるとき状態ラベルとレシピ件数を表示する」（45〜72 行）はそのまま
    維持できる（週レンジ+状態チップ+レシピ件数の表示ロジックは変更しないため）。
  - 新規テストケースを追加する:
    - 「メニューへのリンクが表示されない」: `render(<Dashboard mealPlan={null} expiringStocks={[]} asOf={ASOF} />)`
      で `screen.queryByRole('link', { name: 'レシピ' })` と `screen.queryByRole('link', { name: '商品' })`
      が `null` であることを検証する（削除の回帰防止）。
    - 「`mealPlan.status === 'shopping'` で CTA ラベルと href が切り替わる」:
      `createMealPlanDto({ status: 'shopping' })` を渡し、
      `screen.getByRole('link', { name: '買い物リストを開く' })` の `href` が `/shopping-lists`
      であることを検証する。
    - 「ステッパーの 5 ラベルが表示される」: `mealPlan={null}` で `render` し、
      `screen.getByText('献立')` / `'買い物'` / `'調理'` / `'消費'` / `'完了'` がすべて存在する
      ことを検証する。
  - **重要な注意（設計書のラベル衝突）**: `consuming` 状態の CTA ラベルは「在庫を見る」であり、
    賞味期限セクション見出し横の既存リンク（`<Link href="/pantry">在庫を見る</Link>`、120〜125 行）
    と**同じテキスト**になる。`mealPlan.status === 'consuming'` のケースを追加する場合、
    `screen.getByRole('link', { name: '在庫を見る' })` は複数要素にマッチしてエラーになるため、
    `screen.getAllByRole('link', { name: '在庫を見る' })` で件数を絞る、または
    `within(screen.getByRole('...ヒーロー領域...'))` でヒーロー領域内に限定してから
    `getByRole` を呼ぶこと（ヒーロー領域に `data-testid` 等の目印が必要な場合は
    `dashboard.tsx` 側に追加してよい。設計書に無い実装判断だが、テスト容易性のための
    最小限のマークアップ追加として許容する）。
- 完了条件:
  - 削除 1 件・維持 2 件・新規 3 件 + 既存の DC-\*／DASH-REG-\* 回帰ケース全件が
    `pnpm --filter web test`（dom project）で PASS する。
  - `consuming` ケースを追加した場合、CTA と賞味期限見出し横リンクの同名衝突が
    `getAllByRole` または `within` で解消されている。

### apps/web/src/app/\_components/nav-bar.tsx

- 変更内容:
  1. `lucide-react` の import を `CalendarDays, ChefHat, House, Refrigerator, ShoppingCart, Tag`
     から `CalendarDays, Ellipsis, House, Refrigerator, ShoppingCart` に変更する
     （`ChefHat` / `Tag` を削除、`Ellipsis` を追加）。
  2. `TABS` を設計書のコードのとおり 5 件に変更する:
     ```ts
     const TABS: Tab[] = [
       { href: '/', label: 'ホーム', Icon: House },
       { href: '/meal-plans', label: '献立', Icon: CalendarDays },
       { href: '/shopping-lists', label: '買い物', Icon: ShoppingCart },
       { href: '/pantry', label: '在庫', Icon: Refrigerator },
       { href: '/more', label: 'その他', Icon: Ellipsis },
     ];
     ```
  3. `isActive` を設計書のコードのとおり変更する（`/more` 分岐を追加。`/recipes` `/products`
     `/more` のいずれの pathname でも `true` を返す）:
     ```ts
     function isActive(pathname: string, href: string): boolean {
       if (href === '/') {
         return pathname === '/';
       }
       if (href === '/more') {
         return (
           pathname === '/more' ||
           pathname.startsWith('/recipes') ||
           pathname.startsWith('/products')
         );
       }
       return pathname === href || pathname.startsWith(`${href}/`);
     }
     ```
  4. マークアップ構造を設計書のとおり 2 段（`<nav><div><ul>`）に変更する:
     ```tsx
     <nav aria-label="メインナビゲーション" className="fixed inset-x-0 bottom-0 z-40">
       <div className="mx-auto w-full max-w-md border-t border-border bg-card/95 backdrop-blur">
         <ul className="flex items-stretch justify-around px-0.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
           {/* 既存の TABS.map(...) をそのまま移す */}
         </ul>
       </div>
     </nav>
     ```
     外側 `<nav>` は位置固定のみ（`fixed inset-x-0 bottom-0 z-40`）を担い、背景色・上 border・
     パディングは内側 `<div>`（`mx-auto w-full max-w-md border-t border-border bg-card/95 backdrop-blur`）
     に移す。`aria-label="メインナビゲーション"` は `<nav>` に維持する。
  5. 各 `<li>` 内の `<Link>` の `className` を `text-[10px]` → `text-xs` に変更する。併せて
     直上のコメント（「6 タブを iPhone SE（320px）に収める...」）を、5 タブでは `text-xs` でも
     `main` の下余白予算（4.5rem）内に収まる旨に更新する。
- 完了条件:
  - `TABS` が 5 件（ホーム/献立/買い物/在庫/その他）で、`href="/recipes"` `href="/products"` の
    タブが存在しない。
  - `isActive('/recipes/abc', '/more')` / `isActive('/products/xyz', '/more')` /
    `isActive('/more', '/more')` がすべて `true` を返す。
  - `isActive('/meal-plans', '/')` が `false` を返す（ホームの完全一致判定を維持）。
  - 外側 `<nav>` に `aria-label="メインナビゲーション"` が残っている。
  - `any` 不使用、`pnpm lint` / `pnpm type-check` が通る。

### apps/web/tests/app/\_components/nav-bar.test.tsx

- 変更内容:
  - テスト「6 つのタブを href つきで表示する」を「5 つのタブを href つきで表示する」に変更し、
    `screen.getByRole('link', { name: 'レシピ' })` / `'商品'` の検証を削除、
    `screen.getByRole('link', { name: 'その他' }).getAttribute('href')` が `/more` であることの
    検証を追加する。
  - テスト「詳細ページ（/recipes/abc）でも親セクションのタブがアクティブ」を、
    `state.pathname = '/recipes/abc'` で `screen.getByRole('link', { name: 'その他' })` の
    `aria-current` が `'page'` になる検証に変更する（対象タブが「レシピ」→「その他」に変わる）。
  - テスト「商品ページで商品タブがアクティブ」を、`state.pathname = '/products/xyz'` で
    `screen.getByRole('link', { name: 'その他' })` の `aria-current` が `'page'` になる検証に
    変更する。
  - 新規テストケースを追加する: `state.pathname = '/more'` で
    `screen.getByRole('link', { name: 'その他' })` の `aria-current` が `'page'` になることを
    検証する。
  - 「ホームは完全一致のときのみアクティブ」（`state.pathname = '/meal-plans'`）はそのまま維持
    できる（`isActive('/meal-plans', '/')` の挙動は変更しないため）。
  - 「現在の画面のタブに aria-current=page が付く」（`state.pathname = '/pantry'`）の
    `screen.getByRole('link', { name: 'レシピ' }).getAttribute('aria-current')` を検証する行は
    削除する（「レシピ」タブが存在しなくなるため）。代わりに「その他」タブが
    `aria-current` を持たないことを検証する行に置き換える。
- 完了条件: 変更後のテストが `pnpm --filter web test`（dom project）で全件 PASS する。
  「レシピ」「商品」というタブ名でのアサーションが残っていない。

### apps/web/src/app/more/page.tsx（新規）

- 変更内容: 設計書のコードをそのまま採用する。
  ```tsx
  import { MoreMenu } from './_components/more-menu';

  export default function MorePage() {
    return (
      <main className="min-h-dvh bg-background">
        <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
          <h1 className="text-xl font-semibold text-foreground">その他</h1>
          <MoreMenu />
        </div>
      </main>
    );
  }
  ```
  Server Component。UseCase 呼び出し・`export const dynamic` 指定は不要（静的ページ）。
  `default export` は Next.js App Router の `page.tsx` 規約により許可される
  （`.claude/rules/coding-standards.md` の例外規定）。
- 完了条件: `/more` にアクセスすると「その他」見出しと `MoreMenu` が描画される。
  `pnpm type-check` が通る。

### apps/web/src/app/more/\_components/more-menu.tsx（新規）

- 変更内容: 設計書のコードをそのまま採用する（旧 `Dashboard` の `QUICK_LINKS` カード見た目を
  移植）。
  ```tsx
  import { ChefHat, Tag } from 'lucide-react';
  import type { LucideIcon } from 'lucide-react';
  import Link from 'next/link';

  const MORE_LINKS: { href: string; label: string; Icon: LucideIcon }[] = [
    { href: '/recipes', label: 'レシピ', Icon: ChefHat },
    { href: '/products', label: '商品', Icon: Tag },
  ];

  export function MoreMenu() {
    return (
      <nav className="grid grid-cols-2 gap-2">
        {MORE_LINKS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-3 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-muted active:scale-[0.98]"
          >
            <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
    );
  }
  ```
  named export（`MoreMenu`）を使う（`page.tsx` / `loading.tsx` 以外の default export 禁止）。
  `ThemeToggle` は置かない（設計書で確定）。
- 完了条件: `MoreMenu` が `/recipes` と `/products` へのリンク（アイコン付き）を 2 列グリッドで
  描画する。`any` 不使用。

### apps/web/tests/app/more/\_components/more-menu.test.tsx（新規）

- 変更内容: `dashboard.test.tsx` と同様のパターン（`cleanup` / `render` / `screen`）で新規作成する。
  ```tsx
  import { cleanup, render, screen } from '@testing-library/react';
  import { afterEach, describe, expect, it } from 'vitest';
  import { MoreMenu } from '../../../../src/app/more/_components/more-menu';

  describe('MoreMenu', () => {
    afterEach(() => {
      cleanup();
    });

    it('レシピへのリンクを表示する', () => {
      render(<MoreMenu />);

      expect(screen.getByRole('link', { name: 'レシピ' }).getAttribute('href')).toBe('/recipes');
    });

    it('商品へのリンクを表示する', () => {
      render(<MoreMenu />);

      expect(screen.getByRole('link', { name: '商品' }).getAttribute('href')).toBe('/products');
    });
  });
  ```
  相対 import の深さ（`apps/web/tests/app/more/_components/more-menu.test.tsx` から
  `apps/web/src/app/more/_components/more-menu.tsx` まで）に注意し、`../../../../src/...`
  （4 階層上）で解決することを確認する。
- 完了条件: ファイル名が `*.test.tsx`（vitest dom project の include に一致）。
  `pnpm --filter web test` の dom project で 2 件 PASS する。

### apps/web/src/app/loading.tsx

- 変更内容: 「今週の献立」スケルトン部分（16〜19 行）の高さを調整する。
  ```tsx
  <section className="flex flex-col gap-2">
    <Skeleton className="h-4 w-24" />
    <Skeleton className="h-40 w-full rounded-lg" />
  </section>
  ```
  （`h-24` → `h-40` の 1 箇所のみ変更）。見出しスケルトン行・賞味期限用 3 枚スケルトンは
  変更しない。メニュー相当の 4 枚目グリッドスケルトンは追加しない（メニューセクション自体を
  削除したため）。
- 完了条件: `h-24` が `h-40` に置き換わっている。他の `<Skeleton>` 行に変更がない。

## 実装手順

1. **`dashboard-view.ts` に純関数・定数を追加** … 対象ファイル
   `apps/web/src/app/_utils/dashboard-view.ts` / 変更内容は上記「ファイルごとの変更内容」参照 /
   完了条件: `DashboardNextAction` / `getNextAction` / `MEAL_PLAN_STATUS_STEPS` / `StepState` /
   `getStepState` の 5 エクスポートが揃い、既存 `MEAL_PLAN_STATUS_LABELS` に変更がない。
2. **`dashboard-view.node.test.ts` にテストを追加** … 対象ファイル
   `apps/web/tests/app/_utils/dashboard-view.node.test.ts` / 手順 1 の関数に対する
   `getNextAction` 6 状態 + `getStepState` 4 パターン / 完了条件: node project で
   既存ケース含め全件 PASS。手順 1 の完了後に着手する。
3. **`dashboard.tsx` を改訂**（ヒーロー+ステッパー、メニュー削除） … 対象ファイル
   `apps/web/src/app/_components/dashboard.tsx` / 手順 1 の関数を利用 / 完了条件は上記
   「ファイルごとの変更内容」参照。手順 1 の完了後に着手する。
4. **`dashboard.test.tsx` を更新** … 対象ファイル
   `apps/web/tests/app/_components/dashboard.test.tsx` / クイックリンクテスト削除 + 新規 3 ケース
   追加、`consuming` ケースを追加する場合は「在庫を見る」の同名衝突に `getAllByRole` /
   `within` で対処 / 完了条件: dom project で全件 PASS。手順 3 の完了後に着手する。
5. **`nav-bar.tsx` を改訂**（5 タブ化、`/more` active、マークアップ再構成） … 対象ファイル
   `apps/web/src/app/_components/nav-bar.tsx` / 完了条件は上記「ファイルごとの変更内容」参照。
   手順 1〜4 と独立して着手可能（`dashboard-view.ts` に依存しない）。
6. **`nav-bar.test.tsx` を更新** … 対象ファイル `apps/web/tests/app/_components/nav-bar.test.tsx` /
   5 タブ + `/more` 系 3 pathname の active 判定に更新 / 完了条件: dom project で全件 PASS。
   手順 5 の完了後に着手する。
7. **`/more` ページ + `MoreMenu` を新設** … 対象ファイル `apps/web/src/app/more/page.tsx` /
   `apps/web/src/app/more/_components/more-menu.tsx` / 完了条件は上記「ファイルごとの変更内容」
   参照。手順 1〜6 と独立して着手可能。
8. **`more-menu.test.tsx` を新規作成** … 対象ファイル
   `apps/web/tests/app/more/_components/more-menu.test.tsx` / レシピ・商品リンクの 2 件 /
   完了条件: dom project で 2 件 PASS。手順 7 の完了後に着手する。
9. **`loading.tsx` のスケルトン高さを調整** … 対象ファイル `apps/web/src/app/loading.tsx` /
   `h-24` → `h-40` の 1 箇所 / 完了条件: 他行に影響がない。手順 1〜8 と独立して着手可能
   （`Dashboard` の実装詳細に依存しない、視覚的な整合のみの調整）。
10. **品質ゲート実行** … `pnpm lint` / `pnpm type-check` / `pnpm --filter web test`
    （必要に応じてリポジトリルートから `pnpm lint` / `pnpm type-check` / `pnpm test` で全体実行）。
    完了条件: 全コマンドが 0 エラーで完了する。手順 1〜9 すべて完了後に実行する。

## 依存関係

- 手順 1 → 手順 2（テストは実装後）。
- 手順 1 → 手順 3（`dashboard.tsx` は `getNextAction` / `MEAL_PLAN_STATUS_STEPS` / `getStepState`
  を利用するため、先に export が揃っている必要がある）。
- 手順 3 → 手順 4（テストは新しいヒーロー/ステッパーの DOM 構造に合わせる）。
- 手順 5 → 手順 6（テストは新しい `TABS` / `isActive` に合わせる）。
- 手順 7 → 手順 8（テストは新規コンポーネントに依存）。
- 手順 5〜6（NavBar 系）・手順 7〜8（`/more` 系）・手順 9（`loading.tsx`）は、手順 1〜4
  （Dashboard/dashboard-view 系）と相互に独立しており並行可。
- 手順 10（品質ゲート）は手順 1〜9 すべて完了後に実行する。

## テスト計画

| テストファイル                                                   | 追加内容                                                                                                                         | vitest project |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `apps/web/tests/app/_utils/dashboard-view.node.test.ts`          | `getNextAction` の 6 状態（null/draft/shopping/cooking/consuming/completed）+ `getStepState` の 4 パターン                       | node           |
| `apps/web/tests/app/_components/dashboard.test.tsx`              | クイックリンクテスト削除 + メニュー非表示確認 + `shopping` CTA 切替 + ステッパー 5 ラベル表示、既存 DC-\*/DASH-REG-\* は回帰維持 | dom            |
| `apps/web/tests/app/_components/nav-bar.test.tsx`                | 5 タブ表示 + `/more` `/recipes` `/products` `/more` pathname での active 判定 + `/` 完全一致の回帰維持                           | dom            |
| `apps/web/tests/app/more/_components/more-menu.test.tsx`（新規） | レシピ（`/recipes`）・商品（`/products`）へのリンク表示                                                                          | dom            |

ファイル名は既存の命名規約（`*.node.test.ts` / `*.test.tsx`）を維持する。素の `*.test.ts` は
node/dom いずれの include にもマッチせず silent skip になるため、新規ファイル
（`more-menu.test.tsx`）は必ず `.test.tsx` 拡張子で作成する。

**注意（ラベル衝突）**: `consuming` 状態の CTA ラベル「在庫を見る」は、賞味期限セクション見出し
横の既存リンクと同じテキストになる。`dashboard.test.tsx` で `consuming` を検証するテストを追加
する場合は `getByRole` ではなく `getAllByRole` で件数を絞るか、ヒーロー領域を `within()` で
スコープしてから `getByRole` を呼ぶこと（詳細は「ファイルごとの変更内容」の
`dashboard.test.tsx` 節を参照）。

`docs/tests/dashboard-home-ia.md`（test-designer 作成分）とファイル名・観点が食い違う場合は
本計画を正とせず、test-designer 側の試験計画に合わせて調整する。

## リスク

- **R-1 `getNextAction` の網羅 `switch` が将来のステータス追加でコンパイルエラーになる**:
  設計書で確定した意図的な設計（`default` を置かない）。`MealPlanStatus` に新しい値が
  追加された場合、`getNextAction` の実装を先に修正しないと `pnpm type-check` が失敗する。
  回避策: 本計画のスコープでは対応不要（現状 5 値で確定）。将来 `MealPlanStatus` を変更する
  タスクのレビュー観点として引き継ぐ。
- **R-2 ヒーロー CTA のラベル衝突によるテストの取得エラー**: `consuming` 状態の CTA
  「在庫を見る」と賞味期限見出し横リンクが同名になり、`getByRole` が複数要素にマッチして
  失敗する。回避策: 上記「テスト計画」の注意のとおり `getAllByRole` / `within` を使う
  （実装時にテストを書いた瞬間にエラーで検出できるため実害は低い）。
- **R-3 NavBar のマークアップ変更（`<nav>` 1 段 → `<nav><div>` 2 段）による既存テスト依存の破壊**:
  設計書のリスク節で確認済みのとおり、既存テストは `getByRole('link', ...)` ベースで DOM 構造に
  依存していないため影響なしと判断済み。回避策不要（実装後の `pnpm --filter web test` で再確認）。
  参考: `globals.css` の `main { padding-bottom: calc(4.5rem + ...) }` は `<nav>` の高さ予算
  前提のため、手順 5 でクラスを内側 `<div>` に移す際に高さが変わらないことを目視確認する
  （設計書は「変更なし」と確定しているが、実装時のクラス移動ミスで高さが変わる可能性がある
  ため、リスクとして明記する）。
- **R-4 `dashboard.tsx` のヒーローカード分岐構造が設計書のイメージと実装で細部が異なる可能性**:
  設計書はクラス値をイメージとして提示し、`mealPlan` 有無での外枠 `<div>` 分岐構造までは
  規定していない。回避策: 完了条件（CTA ラベル・href・週レンジ表示・ステッパー 5 ラベル）を
  満たせば実装の分岐構造は implementer の裁量とし、独断で新規デザイントークン・レイアウトを
  追加しない（既存トークンの範囲に留める）。
- **R-5 `more-menu.test.tsx` の相対 import パスの階層ミス**: `apps/web/tests/app/more/_components/`
  から `apps/web/src/app/more/_components/` までは 4 階層（`../../../../src/...`）。既存の
  `dashboard.test.tsx`（3 階層 `../../../src/...`）と階層数が異なるため、コピー時に
  パスを直さないと import エラーになる。回避策: 新規作成時に相対パスを目視確認する。

## ロールバック方法

- 変更は既存 6 ファイル（`dashboard-view.ts` / `dashboard-view.node.test.ts` / `dashboard.tsx` /
  `dashboard.test.tsx` / `nav-bar.tsx` / `nav-bar.test.tsx`）+ `loading.tsx` の 1 行差分 +
  新規 3 ファイル（`more/page.tsx` / `more/_components/more-menu.tsx` /
  `more-menu.test.tsx`）に限定される。`git diff` で該当ファイルの変更を確認し、既存ファイルは
  `git checkout -- <path>` で個別に戻せる。新規ファイルは `git rm <path>`（または未コミットなら
  削除）で取り消せる。
- 段階的ロールバックも可能:
  - NavBar のみ戻す場合: `nav-bar.tsx` / `nav-bar.test.tsx` のみ `git checkout -- <path>`
    （6 タブに戻る）。ただしこの場合 `/more` への実質的な到達路が NavBar から消えるため、
    `/more` ページ自体は残してもデッドリンクにはならない（直接 URL アクセスは可能）。
  - `/more` ページのみ戻す場合: `more/` ディレクトリを削除すると、NavBar の「その他」タブが
    404 に遷移する状態になる。NavBar も同時に戻すこと（部分ロールバック時は NavBar +
    `/more` をセットで扱う）。
  - `dashboard.tsx` のヒーロー化のみ戻す場合: `dashboard.tsx` / `dashboard.test.tsx` を
    `git checkout -- <path>` で戻す。`dashboard-view.ts` の追加関数は未使用でも副作用がないため
    残してよい。
- `loading.tsx` の 1 行差分（`h-24` → `h-40`）は単独で戻しても実害がない
  （表示上のスケルトン高さのみで機能に影響しない）。

## ドキュメント更新対象

- ドメインモデル変更なし（`docs/04-domain-model.md` の更新は不要 — 本変更は Presentation 層
  のみで Domain/Application/Infrastructure に変更はない）。
- `docs/designs/dashboard-home-ia.md`: すでに confirmed。実装完了後、implementer が実装記録
  （変更ファイル・品質ゲート結果・実画面確認結果）を末尾に追記する（本計画の作成では追記しない）。
- `docs/designs/dashboard.md`: 末尾のポインタ（2026-08-25 改訂の 1 段落）は
  architecture-designer が既に追記済みのため、本計画・実装では再編集しない。
- `docs/tests/dashboard-home-ia.md`: test-designer が別途作成する試験計画。本計画の
  「テスト計画」節と観点が一致するかを実装前に確認し、食い違いがあれば test-designer 側を正とする。
