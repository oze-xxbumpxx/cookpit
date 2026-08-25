# 設計書: dashboard-home-ia

- ステータス: **confirmed**（Gate A でユーザー確定済み。本設計書内の値を再提案しない）
- レベル: L2（Presentation のみ。新規 API / DB / Domain / Infra / 新規 UseCase なし）
- 関連: docs/designs/dashboard.md（既存ダッシュボード設計。本文は残し末尾にポインタを追記）

## 背景

現行ホーム（`/`）は「今週の献立」カード + 「賞味期限が近い在庫」+ 「メニュー」（5 リンクの
グリッド）の 3 セクション構成で、下部 NavBar も 6 タブ（ホーム/献立/買い物/在庫/レシピ/商品）
になっている。ホームとグローバルナビの両方に同じ行き先（レシピ・商品・献立・買い物・在庫）が
並んでおり、ホームが「次に何をすべきか」を即答しない一覧ページになっている。

ユーザーは「2番」案（ホームを司令塔化し、NavBar を 4 一次タブ + その他に整理する）を Gate A
で確定した。本設計書はその確定内容を実装可能な粒度に落とす。

## 目的

- ホームを「今週の献立の状態から次に取るべき 1 アクション」を即答するヒーロー + 進行ステッパー
  に置き換える。
- グローバル NavBar を 5 タブ（ホーム/献立/買い物/在庫/その他）にし、二次的な行き先（レシピ・
  商品）は `/more` に集約する。
- 既存の賞味期限セクションのロジック・表示・テストは変更しない（回帰対象としてのみ扱う）。

## 要件

1. `Dashboard`（`apps/web/src/app/_components/dashboard.tsx`）の「今週の献立」セクションを、
   状態駆動のヒーロー（次の一手 1 CTA）+ 週次ステッパーに置換する。
2. `Dashboard` の「メニュー」セクション（`QUICK_LINKS`）を削除する。
3. `NavBar`（`apps/web/src/app/_components/nav-bar.tsx`）を 5 タブ（ホーム/献立/買い物/在庫/
   その他）にし、`/more` 系（`/more` `/recipes` `/products`）で「その他」を active にする。
4. `apps/web/src/app/more/page.tsx` を新設し、レシピ・商品への二次ナビを提供する。
5. `getNextAction` / `MEAL_PLAN_STATUS_STEPS` / `getStepState` を
   `apps/web/src/app/_utils/dashboard-view.ts` に純関数として追加する。
6. データ取得（`GetCurrentMealPlanUseCase` / `GetExpiringStocksUseCase`）・Application/Domain/
   Infrastructure 層は変更しない。

## 対象範囲

- `apps/web/src/app/_utils/dashboard-view.ts`（`getNextAction` / `MEAL_PLAN_STATUS_STEPS` /
  `getStepState` の追加。既存 `MEAL_PLAN_STATUS_LABELS` は変更なし）
- `apps/web/src/app/_components/dashboard.tsx`（ヒーロー + ステッパーへの置換、メニュー削除）
- `apps/web/src/app/_components/nav-bar.tsx`（5 タブ化、`/more` の active 判定）
- `apps/web/src/app/more/page.tsx`（新規）
- `apps/web/src/app/more/_components/more-menu.tsx`（新規）
- `apps/web/src/app/loading.tsx`（ヒーロー用スケルトンの高さ調整）
- `docs/designs/dashboard.md`（末尾に本設計書への 1 段落ポインタを追記）

## 対象外

- レシピ名チップ（献立の個別レシピ名表示）。
- PC サイドバー・レスポンシブなデスクトップナビ。
- 買い物進捗（未購入件数など、新規 UseCase を要する集計）。
- 賞味期限カードの再装飾（既存のカード・バッジ・アイコンをそのまま維持）。
- 分析グラフ・トレンド表示。
- 新規 UseCase / API エンドポイント / Domain 変更 / Infrastructure 変更。
- レシピ名解決（`GetRecipesUseCase` の呼び出し追加）。
- 新規 CSS カスタムプロパティ（トークン）の追加。
- `apps/web/src/app/more/loading.tsx`（静的ページのため作成しない）。
- セキュリティレビュー（`security-reviewer` 省略対象。認可・入力検証の変更なし）。

## 現状構成

### ホーム（`apps/web/src/app/page.tsx` → `Dashboard`）

```
h1「今週の状態」+ ThemeToggle
├─ section「今週の献立」
│   ├─ mealPlan === null: 「今週の献立はまだありません」+ CTA「今週の献立を作る」(→ /meal-plans)
│   └─ mealPlan !== null: カード全体を /meal-plans へリンク（週レンジ + 状態チップ + レシピ N 品）
├─ section「賞味期限が近い在庫」（ExpiryAlertSubscription + カード一覧 or 空メッセージ）
└─ section「メニュー」（QUICK_LINKS: 献立/買い物リスト/在庫/レシピ/商品 の 2 列グリッド）
```

### NavBar（`apps/web/src/app/_components/nav-bar.tsx`）

6 タブ（ホーム/献立/買い物/在庫/レシピ/商品）。全幅 `border-t` + `bg-card/95`。ラベルは
`text-[10px]`（6 タブを iPhone SE 幅に収めるため）。

### 依存関係

`layout.tsx` が `<NavBar />` を全ページ共通のフッターとしてレンダリングし、`globals.css` の
`main { padding-bottom: calc(4.5rem + env(safe-area-inset-bottom)); }` で本文がナビに隠れない
余白を確保している。

## 変更後構成

### ホーム（`Dashboard`）

```
h1「今週の状態」+ ThemeToggle  … 変更なし
├─ section（見出しなし・ヒーロー自身が主情報）
│   ├─ mealPlan !== null のときのみ: 週レンジ + 状態チップ（既存 mealPlanStatusChipClass /
│   │   MEAL_PLAN_STATUS_LABELS）+ レシピ N 品
│   ├─ 次の一手 title（h2 相当の見出し）+ description
│   ├─ プライマリ CTA（buttonVariants({variant:'default'})、h-11、Link、getNextAction().href）
│   └─ ステッパー（5 ステップ、ol、current/complete/upcoming の視覚区分）
├─ section「賞味期限が近い在庫」… 変更なし（回帰対象）
└─ （メニューセクションは削除）
```

### NavBar

5 タブ（ホーム/献立/買い物/在庫/その他）。ナビ背景をコンテンツ幅（`max-w-md`）に合わせる。
ラベルは `text-xs` に戻す。

### `/more`（新規）

```
apps/web/src/app/more/page.tsx        … Server Component（静的、UseCase 呼び出しなし）
apps/web/src/app/more/_components/more-menu.tsx … 表示コンポーネント（レシピ/商品の 2 リンクカード）
```

## データフロー

```
apps/web/src/app/page.tsx (Server Component)
  → GetCurrentMealPlanUseCase.execute(now)   … 変更なし
  → GetExpiringStocksUseCase.execute(now)    … 変更なし
  → <Dashboard mealPlan expiringStocks asOf />
       → getNextAction(mealPlan)             … 新規・純関数（UI 内で導出。prop 追加なし）
       → MEAL_PLAN_STATUS_STEPS + getStepState(mealPlan?.status ?? null, step.status)
```

`/more` はデータ取得を行わない静的ページのため、フローは `more-menu.tsx` への props 無しの
レンダリングのみ。

Application / Domain / Infrastructure 層への新規依存・変更は無い。`page.tsx` の UseCase 呼び出し
2 本は不変（プロンプト指示どおり prop 追加なしが基本）。

## API 設計

対象外。契約変更なし（既存 UseCase をそのまま呼ぶ。新規 Hono ルートなし）。

## DB 設計

対象外。スキーマ変更なし。

## フロントエンド設計

### `dashboard-view.ts` の追加（確定）

```ts
export interface DashboardNextAction {
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
}

export function getNextAction(mealPlan: MealPlanDto | null): DashboardNextAction {
  if (mealPlan === null) {
    return {
      title: '今週の献立はまだありません',
      description: '土曜の起点は献立決めから。',
      href: '/meal-plans',
      ctaLabel: '今週の献立を作る',
    };
  }
  switch (mealPlan.status) {
    case 'draft':
      return {
        title: '献立を仕上げましょう',
        description: 'レシピを追加して今週のメニューを確定する',
        href: '/meal-plans',
        ctaLabel: '献立を続ける',
      };
    case 'shopping':
      return {
        title: '買い物に出かけましょう',
        description: '買い物リストを開いて購入を進める',
        href: '/shopping-lists',
        ctaLabel: '買い物リストを開く',
      };
    case 'cooking':
      return {
        title: '作り置きの時間です',
        description: '献立のレシピを見ながら調理する',
        href: '/meal-plans',
        ctaLabel: '献立を開く',
      };
    case 'consuming':
      return {
        title: '作り置きを食べましょう',
        description: '期限が近い在庫から消費するのがおすすめ',
        href: '/pantry',
        ctaLabel: '在庫を見る',
      };
    case 'completed':
      return {
        title: '今週は完了しました',
        description: '次の週の献立を準備できます',
        href: '/meal-plans',
        ctaLabel: '献立を見る',
      };
  }
}
```

- `switch` は `MealPlanStatus`（`'draft' | 'shopping' | 'cooking' | 'consuming' | 'completed'`）を
  網羅する。`default` 節を置かない（未知の値が追加された場合はコンパイルエラーで検出させる。
  「draft にフォールバックしない」という確定要件をコンパイル時に保証する設計）。
- 戻り値は `MealPlanDto | null` のみから導出する純関数。Application 層の DTO 型
  （`MealPlanDto` / `MealPlanStatus`）を `@cookpit/application` から型としてのみ import する
  （既存 `MEAL_PLAN_STATUS_LABELS` と同型。UI 文言・href の定義であり Application 層に上げない
  という確定判断を維持）。

### ステッパー定数・ヘルパー（確定）

```ts
export const MEAL_PLAN_STATUS_STEPS: { status: MealPlanStatus; label: string }[] = [
  { status: 'draft', label: '献立' },
  { status: 'shopping', label: '買い物' },
  { status: 'cooking', label: '調理' },
  { status: 'consuming', label: '消費' },
  { status: 'completed', label: '完了' },
];

export type StepState = 'complete' | 'current' | 'upcoming';

export function getStepState(current: MealPlanStatus | null, step: MealPlanStatus): StepState {
  if (current === null) {
    return 'upcoming';
  }
  const currentIndex = MEAL_PLAN_STATUS_STEPS.findIndex((s) => s.status === current);
  const stepIndex = MEAL_PLAN_STATUS_STEPS.findIndex((s) => s.status === step);
  if (stepIndex < currentIndex) {
    return 'complete';
  }
  if (stepIndex === currentIndex) {
    return 'current';
  }
  return 'upcoming';
}
```

- `mealPlan === null` のとき `Dashboard` は `getStepState(null, step.status)` を全ステップに渡し、
  すべて `'upcoming'`（muted）にする。
- `mealPlan !== null` のとき `current = mealPlan.status` を渡す。

### `Dashboard`（`apps/web/src/app/_components/dashboard.tsx`）の変更

1. **削除**: `QUICK_LINKS` 定数、`メニュー` セクション（`<section>` + `<nav className="grid …">`）、
   使われなくなる `lucide-react` の `CalendarDays` / `ChefHat` / `ShoppingCart` / `Tag` の import
   （`LOCATION_ICONS` が使う `Refrigerator` / `Snowflake` / `Package` / `CircleHelp` は賞味期限
   セクションで継続使用するため残す）。
2. **置換**: 「今週の献立」の `<section>` をヒーローに置換する。見出し `<h2>今週の献立</h2>` は
   置かない（ヒーロー自身が主情報のため）。
   - `const nextAction = getNextAction(mealPlan);` を導出。
   - `mealPlan !== null` のときのみ、週レンジ + 状態チップ + レシピ件数の行を表示（既存の
     `formatWeekRange` / `mealPlanStatusChipClass` / `MEAL_PLAN_STATUS_LABELS` をそのまま再利用）。
   - `nextAction.title` を見出し（`text-base font-semibold text-foreground` 目安）、
     `nextAction.description` を本文（`text-sm text-muted-foreground`）として表示。
   - プライマリ CTA: `<Link href={nextAction.href} className={cn(buttonVariants({ variant:
'default' }), 'h-11')}>{nextAction.ctaLabel}</Link>`。ヒーロー全体を Link で包まない
     （既存の「カード全体をリンクにする」実装は廃止し、CTA だけが主リンクになる）。
   - ステッパー: `<ol className="flex items-center gap-1">` 相当で `MEAL_PLAN_STATUS_STEPS` を
     `map`。各ステップは `getStepState(mealPlan?.status ?? null, step.status)` の結果に応じて
     `text-primary`（current）/ `text-foreground`（complete）/ `text-muted-foreground`
     （upcoming）を適用。ステップ間の接続線はセマンティックトークンの `border`
     （例: `border-t border-border`）で表現し、新規カラートークンは追加しない。ステッパーは
     装飾であり、各ステップは非クリッカブル（`<li>` テキストのみ。`<Link>` を使わない）。
3. カード全体は `rounded-lg border border-border bg-card p-4` の既存トーンを維持する。

### `NavBar`（`apps/web/src/app/_components/nav-bar.tsx`）の変更

```ts
const TABS: Tab[] = [
  { href: '/', label: 'ホーム', Icon: House },
  { href: '/meal-plans', label: '献立', Icon: CalendarDays },
  { href: '/shopping-lists', label: '買い物', Icon: ShoppingCart },
  { href: '/pantry', label: '在庫', Icon: Refrigerator },
  { href: '/more', label: 'その他', Icon: Ellipsis },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  if (href === '/more') {
    return (
      pathname === '/more' || pathname.startsWith('/recipes') || pathname.startsWith('/products')
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
```

- `lucide-react` の import を `ChefHat` / `Tag` → `Ellipsis` に入れ替える。
- ラベルのクラスを `text-[10px]` → `text-xs` に戻す。6 タブ時の折り返し対策コメントを、
  5 タブでは `text-xs` でも `main` の下余白予算（4.5rem）内に収まる旨に更新する。
- ナビのマークアップ構造を変更する（全幅の線を残さず、背景・区切り線をコンテンツ幅
  `max-w-md` に合わせる）:

```tsx
<nav aria-label="メインナビゲーション" className="fixed inset-x-0 bottom-0 z-40">
  <div className="mx-auto w-full max-w-md border-t border-border bg-card/95 backdrop-blur">
    <ul className="flex items-stretch justify-around px-0.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {/* 既存の TABS.map(...) をそのまま移す */}
    </ul>
  </div>
</nav>
```

- `aria-label="メインナビゲーション"` は `<nav>` に維持。
- 外側 `<nav>` は位置固定のみを担い、背景色・上border・パディングは内側 `<div>` に移す
  （`mx-auto w-full max-w-md` でコンテンツ幅の見た目に統一）。

### `/more`（新規）

`apps/web/src/app/more/page.tsx`:

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

- Server Component。UseCase 呼び出しなし・`export const dynamic` 指定不要（静的で問題ない）。

`apps/web/src/app/more/_components/more-menu.tsx`:

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

- 旧 `Dashboard` の `QUICK_LINKS` カード見た目（`border` / `bg-card` / icon + label /
  `hover:bg-muted` / `active:scale-[0.98]`）をそのまま移植する。
- `ThemeToggle` は `/more` に置かない（ダッシュボードに残す。確定事項）。

### `page.tsx`（`apps/web/src/app/page.tsx`）

変更なし。`GetCurrentMealPlanUseCase` + `GetExpiringStocksUseCase` の並列取得と
`<Dashboard mealPlan expiringStocks asOf />` の呼び出しは既存のまま。`getNextAction` /
`getStepState` は `Dashboard` 内（または `dashboard-view.ts` を呼ぶ形）で `mealPlan` から導出し、
新規 prop は追加しない。

### `loading.tsx`（`apps/web/src/app/loading.tsx`）

ヒーローが従来の献立カードより高くなるため、献立スケルトンの高さを `h-24` → `h-40` 目安に
上げる。賞味期限用の 3 枚スケルトンはそのまま残す。メニュー相当の 4 枚目グリッドスケルトンは
追加しない（メニューセクション自体を削除したため）。

## バックエンド設計

対象外。Hono ルート・UseCase・Repository・DB スキーマの変更なし。

## エラー処理

対象外。新規の外部 I/O・書き込み操作を追加しないため、SKILL.md が要求する
リトライ/タイムアウト/冪等性/部分失敗/フォールバックの記載は不要。既存の
`GetCurrentMealPlanUseCase` / `GetExpiringStocksUseCase` のエラー処理（`page.tsx` の
`export const dynamic = 'force-dynamic'` 配下、Next.js のデフォルトエラーバウンダリに委ねる
既存挙動）は変更しない。

## ログと監視

対象外。新規ログ・メトリクス・アラートの追加なし。

## セキュリティ

対象外。認可・入力検証・公開エンドポイントの変更なし。`/more` は既存の `/recipes` /
`/products` への静的なリンクのみで、新規に公開する情報・操作はない。`security-reviewer` の
レビュー対象外とする。

## 性能

対象外（下記条件のいずれにも該当しないため、通常の L2 性能記載を割愛する）。

- Infrastructure 経由の外部 API / 外部ストレージ I/O の新設・変更: なし
  （`page.tsx` の UseCase 呼び出し 2 本は既存のまま不変）。
- 大量データを扱う DB クエリの新設・変更: なし。
- 明示された性能要件: なし。

参考情報として、`/more` は静的な Server Component（データ取得なし）のため既存ページより
軽量。NavBar の DOM 構造変更（`<nav>` → `<nav><div><ul>`）はレイアウト計算に影響しない
（`position: fixed` の対象要素が変わらないため、リフローコストの増加は無いと推定）。

## テスト方針

詳細な試験項目・観点は test-designer が `docs/tests/dashboard-home-ia.md` に作成する。設計書
としては以下の方針・境界値を引き継ぐ。

- **`getNextAction`**（`dashboard-view.node.test.ts`）: `null` + 5 status（draft/shopping/
  cooking/consuming/completed）の 6 状態すべてを検証する。各状態の `href` / `ctaLabel` の組を
  `toEqual` で固定する（表の値と一致することを回帰的に保証する）。
- **`getStepState`**（`dashboard-view.node.test.ts`）: `current === null`（全 upcoming）/
  `draft`（先頭ステップが current、残り upcoming）/ `consuming`（中間、前が complete・後が
  upcoming）/ `completed`（末尾、全て complete または current）の 4 パターンを検証する。
- **`Dashboard`**（`dashboard.test.tsx`、RTL）:
  - メニューリンク（`href=/recipes` 等の `QUICK_LINKS` 由来リンク）が存在しないことを確認する。
  - `mealPlan === null` で CTA ラベル「今週の献立を作る」が表示される。
  - `mealPlan.status === 'shopping'` で CTA ラベル「買い物リストを開く」・`href=/shopping-lists`
    が表示される。
  - ステッパーの 5 ラベル（献立/買い物/調理/消費/完了）が表示される。
  - 賞味期限セクションの既存 `DC-*` ケース（カード表示・色分けバッジ・空状態）は回帰として
    そのまま緑を維持する。
- **`NavBar`**（`nav-bar.test.tsx`）:
  - 5 タブ（ホーム/献立/買い物/在庫/その他）が表示され、レシピ・商品タブが存在しない。
  - `/recipes`・`/products`・`/more` のいずれの pathname でも「その他」タブに
    `aria-current="page"` が付く。
  - `/` は完全一致のみ active になる（`/meal-plans` 等では active にならない）ことを維持する。
- **`MoreMenu`**（`more-menu.test.tsx`、新規）: レシピ（`href=/recipes`）・商品
  （`href=/products`）へのリンクが表示される。
- 品質ゲート: `pnpm lint` / `pnpm type-check` / `pnpm test`（`apps/web` パッケージ。既存の
  `dashboard.test.tsx` / `nav-bar.test.tsx` の既存アサーションは本変更で書き換えが必要になる
  箇所以外は回帰として維持する）。

## 移行とリリース

- フィーチャーフラグなし。通常のマージ・リリースで反映する。
- データ移行: なし（表示ロジックのみの変更。永続化データに影響しない）。
- 後方互換性: `/recipes` `/products` の URL・画面自体は変更しない（二次ナビ化のみ）。既存の
  ブックマーク・外部リンクは引き続き有効。

## リスク

- ヒーローの CTA だけが主リンクになる UI 変更により、従来「カード全体をタップして献立へ」
  という操作に慣れたユーザーの誤操作（タップ後の反応がない）が一時的に増える可能性がある。
  CTA ボタンを `h-11` の十分なタップ領域で目立たせることで緩和する（確定 UI 仕様どおり）。
- `getNextAction` の網羅 `switch` に `default` を置かないため、将来 `MealPlanStatus` に新しい
  値が追加された場合はコンパイルエラーで検知される（意図的な設計。実装時に対応が必要になる
  ことをリスクとして明記する）。
- NavBar のマークアップ変更（`<nav>` 1 段 → `<nav><div>` 2 段）により、既存 E2E/RTL テストが
  DOM 構造に依存していた場合は影響を受ける可能性がある。既存テストは `getByRole('link', ...)`
  ベースで構造に依存していないことを確認済み（`apps/web/tests/app/_components/nav-bar.test.tsx`
  参照）。

## 未決事項

なし（Gate A でユーザー確定済み。本設計書の採用値をそのまま実装する）。

## 実装記録（2026-08-25・implementer）

- 変更ファイル:
  - `apps/web/src/app/_utils/dashboard-view.ts`（`getNextAction` / `MEAL_PLAN_STATUS_STEPS` /
    `StepState` / `getStepState` を追加。既存 `MEAL_PLAN_STATUS_LABELS` は変更なし）
  - `apps/web/src/app/_components/dashboard.tsx`（ヒーロー+ステッパーへ置換、`QUICK_LINKS`/
    メニューセクション削除。ヒーロー見出しは `<h2>{nextAction.title}</h2>` として実装）
  - `apps/web/src/app/_components/nav-bar.tsx`（5 タブ化、`/more` の `isActive`、
    `<nav><div><ul>` の 2 段マークアップ、ラベル `text-xs`）
  - `apps/web/src/app/loading.tsx`（献立スケルトン `h-24` → `h-40` の 1 行のみ）
  - 新規: `apps/web/src/app/more/page.tsx` / `apps/web/src/app/more/_components/more-menu.tsx`
  - テスト更新: `apps/web/tests/app/_utils/dashboard-view.node.test.ts`（NA-01〜06, SS-01〜07 を追加）、
    `apps/web/tests/app/_components/dashboard.test.tsx`（DH-01〜07 を追加、旧クイックリンクテストを
    DH-01 に置換）、`apps/web/tests/app/_components/nav-bar.test.tsx`（NV-01〜08 に更新）
  - 新規テスト: `apps/web/tests/app/more/_components/more-menu.test.tsx`（MM-01〜03）
- テスト件数: node project 追加 13 件（NA-01〜06 6 件 + SS-01 1 件 + SS-02〜07 6 件、既存
  `MEAL_PLAN_STATUS_LABELS` 1 件は維持）、dom project は `dashboard.test.tsx` 7 件追加
  （DH-01〜07。DH-08/09 は既存 DC-\*/DASH-REG-\* の維持・置換で担保）、`nav-bar.test.tsx` は
  NV-01〜08 相当 9 件（既存「在庫」ケースを NV-08 相当に転用）、`more-menu.test.tsx` 新規 3 件
  （MM-01〜03）。合計 `pnpm --filter @cookpit/web test` で 79 ファイル / 930 件 PASS。
- 品質ゲート結果: `pnpm lint`（turbo 全パッケージ）/ `pnpm type-check`（turbo 全パッケージ）/
  `pnpm --filter @cookpit/web test` すべて成功（lint は本変更と無関係な既存 warning 1 件のみ）。
- 設計・計画からの逸脱: なし。テスト容易性のための最小追加として `aria-label="今週の進捗"` を
  ステッパー `<ol>` に付与（許容根拠は実装計画の `dashboard.test.tsx` 節。設計書本文には未記載）。
