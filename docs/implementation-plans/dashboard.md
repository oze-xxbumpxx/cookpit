# 実装計画: dashboard

- 前提となる設計書: docs/designs/dashboard.md（改訂: 2026-07-21 —「賞味期限が近い在庫」の
  カード表現化（リッチ化）、P-4〜P-7 confirmed）
- レベル: L2
- 実装ルート: Orchestrator（implementer）
- 判断理由: 既定（探索的・対話的 — 視覚表現の微調整を伴う小規模改訂であり、
  「指示書に書き切れる定型実装」の Codex 委譲基準に非該当。元設計（IMP-2026-028）の
  実装ルートを踏襲）

この計画は元設計（簡易ダッシュボード本体）ではなく、2026-07-21 改訂セクション（P-4〜P-7）
のみを対象とする。元設計に基づく本体実装（`page.tsx` のダッシュボード化・`selectExpiringStocks`
等）は実装済みのため対象外。

## 変更対象ファイル

- `apps/web/src/app/_utils/dashboard-view.ts` — 残日数・緊急度・文言の純関数を追加（D-5）。
- `apps/web/src/app/_utils/dashboard-view.node.test.ts` — 追加関数の単体テスト（境界値）。
- `apps/web/src/app/_utils/category-color.ts` — 緊急度チップ配色関数を追加（D-6）。
- `apps/web/src/app/_utils/category-color.node.test.ts` — 追加関数の単体テスト。
- `apps/web/src/app/_components/dashboard.tsx` — `asOf` prop 追加、「賞味期限が近い在庫」の
  カード化（保存場所アイコン + 残日数バッジ）、見出しの件数バッジ + `Clock` アイコン（P-7）。
- `apps/web/src/app/_components/dashboard.test.tsx` — 既存呼び出し箇所へ `asOf` prop 追加、
  新規テストケース（緊急度別バッジ・保存場所別アイコン）を追加。
- `apps/web/src/app/page.tsx` — `<Dashboard ... asOf={now} />` を追加。

## 新規作成ファイル

なし（すべて既存ファイルへの追記）。

## ファイルごとの変更内容

### apps/web/src/app/\_utils/dashboard-view.ts

- 変更内容:
  - 既存の非公開ヘルパー `parseExpiryDate` / `toLocalMidnight` はそのまま再利用する
    （追加エクスポート不要。同一モジュール内から呼ぶ）。
  - 型 `ExpiryUrgency` を追加してエクスポート:
    ```ts
    export type ExpiryUrgency = 'overdue' | 'critical' | 'soon';
    ```
  - `getExpiryRemainingDays(expiresAt: string, asOf: Date): number` を追加してエクスポート。
    `parseExpiryDate(expiresAt)` と `toLocalMidnight(asOf)` の差分をミリ秒 → 日に変換して返す
    （`Math.round(diff / (24 * 60 * 60 * 1000))`）。`selectExpiringStocks` と同一のローカル
    日付規約（UTC 変換によるずれを避ける）に従うこと。
  - `getExpiryUrgency(remainingDays: number): ExpiryUrgency` を追加してエクスポート（P-4 の閾値）:
    - `remainingDays < 0` → `'overdue'`
    - `remainingDays <= 1`（0〜1）→ `'critical'`
    - それ以外（2 以上）→ `'soon'`
    - 呼び出し元は常に `selectExpiringStocks` で 3 日以内に絞り込み済みの値を渡す前提のため、
      4 日以上の値に対する専用区分は設けない（設計書の「2〜3 日区分が実質上限」を反映）。
  - `formatExpiryUrgencyLabel(remainingDays: number): string` を追加してエクスポート（P-6 Option B）:
    - `remainingDays < 0` → `'期限切れ'`
    - `remainingDays === 0` → `'本日まで'`
    - `remainingDays === 1` → `'明日まで'`
    - それ以外 → `` `あと${remainingDays}日` ``（`remainingDays === 2` で「あと2日」、
      `remainingDays === 3` で「あと3日」になる）。
  - 追加関数には JSDoc を付与する（コーディング規約: 公開 API への JSDoc。型に表せない契約情報
    — 例: ローカル日付規約への依存、境界値の扱い — のみ記載し、型の言い換えはしない）。
- 完了条件:
  - `ExpiryUrgency` / `getExpiryRemainingDays` / `getExpiryUrgency` / `formatExpiryUrgencyLabel`
    が named export されている。
  - `any` 不使用、`===`/`!==` 使用、既存の `selectExpiringStocks` / `MEAL_PLAN_STATUS_LABELS` の
    シグネチャ・実装に変更がない（後方互換）。

### apps/web/src/app/\_utils/dashboard-view.node.test.ts

- 変更内容: 既存の `describe('selectExpiringStocks', ...)` / `describe('MEAL_PLAN_STATUS_LABELS', ...)`
  はそのまま維持し、以下を追記する。
  - `describe('getExpiryRemainingDays', ...)`: `asOf = new Date('2026-07-21T09:00:00')` を基準に
    `expiresAt` が `'2026-07-19'`（-2）/ `'2026-07-21'`（0）/ `'2026-07-22'`（1）/ `'2026-07-24'`（3）
    の各ケースで返り値を検証。
  - `describe('getExpiryUrgency', ...)`: `remainingDays` が `-1`（`'overdue'`）/ `0`（`'critical'`）/
    `1`（`'critical'`）/ `2`（`'soon'`）/ `3`（`'soon'`）の境界（P-4 の 1→2 切り替わり点を含む）。
  - `describe('formatExpiryUrgencyLabel', ...)`: `remainingDays` が `-1`（`'期限切れ'`）/ `0`
    （`'本日まで'`）/ `1`（`'明日まで'`）/ `2`（`'あと2日'`）/ `3`（`'あと3日'`）の 5 パターン全て。
- 完了条件: 上記 3 `describe` ブロックが追加され、`pnpm --filter web test` の node プロジェクトで
  全件 PASS する。ファイル名は `*.node.test.ts` のまま変更しない（vitest node project の include
  条件、素の `*.test.ts` は silent skip になるため要注意）。

### apps/web/src/app/\_utils/category-color.ts

- 変更内容:
  - `EXPIRY_URGENCY_CHIP`（非公開・`Record<string, string>`）を追加:
    ```ts
    const EXPIRY_URGENCY_CHIP: Record<string, string> = {
      overdue: 'bg-destructive/10 text-destructive',
      critical: 'bg-accent text-accent-foreground',
      soon: CHIP.amber,
    };
    ```
  - `expiryUrgencyChipClass(urgency: string): string` を追加してエクスポート（既存の
    `mealPlanStatusChipClass` 等と同型・未知値は `CHIP.neutral` にフォールバック）:
    ```ts
    export function expiryUrgencyChipClass(urgency: string): string {
      return EXPIRY_URGENCY_CHIP[urgency] ?? CHIP.neutral;
    }
    ```
  - 既存の `CHIP` パレット・他のチップ関数（`recipeTagChipClass` 等）・`RECIPE_TAG_CHIP` /
    `PRODUCT_CATEGORY_CHIP` / `MEAL_PLAN_STATUS_CHIP` は変更しない。
- 完了条件: `expiryUrgencyChipClass` が named export されている。既存 3 関数の挙動に変更がない。

### apps/web/src/app/\_utils/category-color.node.test.ts

- 変更内容: 既存 `describe` ブロック（`recipeTagChipClass` / `productCategoryChipClass` /
  `mealPlanStatusChipClass`）は維持し、`describe('expiryUrgencyChipClass', ...)` を追記:
  - `expiryUrgencyChipClass('overdue')` が `'bg-destructive/10 text-destructive'` を含む。
  - `expiryUrgencyChipClass('critical')` が `'bg-accent'` と `'text-accent-foreground'` を含む。
  - `expiryUrgencyChipClass('soon')` が `'bg-[#F4E8D2]'`（`CHIP.amber`）を含む。
  - `expiryUrgencyChipClass('unknown')` が `'bg-secondary text-secondary-foreground'`
    （`CHIP.neutral`）と一致する。
- 完了条件: 新規 `describe` ブロックが追加され、既存テストと合わせて全件 PASS する。

### apps/web/src/app/\_components/dashboard.tsx

- 変更内容:
  1. **型インポートの追加**: `import type { MealPlanDto, StockDto, StorageLocation } from '@cookpit/application';`
     （`StorageLocation` を追加）。
  2. **アイコンインポートの追加**: 既存の `lucide-react` インポートに
     `Snowflake` / `Package` / `CircleHelp` / `Clock`（P-7）を追加
     （既存の `CalendarDays, ChefHat, Refrigerator, ShoppingCart, Tag` は維持）。
  3. **ユーティリティインポートの追加**:
     - `apps/web/src/app/_utils/category-color.ts` から `expiryUrgencyChipClass` を追加
       （既存 `mealPlanStatusChipClass` と同じ import 文にまとめる）。
     - `apps/web/src/app/_utils/dashboard-view.ts` から `formatExpiryUrgencyLabel` /
       `getExpiryRemainingDays` / `getExpiryUrgency` を追加（既存 `MEAL_PLAN_STATUS_LABELS` と
       同じ import 文にまとめる）。
  4. **Props への `asOf` 追加**:
     ```ts
     interface Props {
       mealPlan: MealPlanDto | null;
       expiringStocks: StockDto[];
       asOf: Date;
     }
     ```
     関数シグネチャも `export function Dashboard({ mealPlan, expiringStocks, asOf }: Props)` に更新。
  5. **`LOCATION_ICONS` マップ追加**（コンポーネント内ローカル、`QUICK_LINKS` と同型の
     コロケーション。`pantry-view.ts` は変更しない）:
     ```ts
     const LOCATION_ICONS: Record<StorageLocation, LucideIcon> = {
       fridge: Refrigerator,
       freezer: Snowflake,
       pantry: Package,
     };
     ```
  6. **`locationIcon` ヘルパー追加**（既存 `locationLabel` と同型・同じ null 分岐パターン）:
     ```ts
     function locationIcon(stock: StockDto): LucideIcon {
       return stock.storedLocation === null ? CircleHelp : LOCATION_ICONS[stock.storedLocation];
     }
     ```
  7. **「賞味期限が近い在庫」見出しの変更（P-7）**: 現行
     ```tsx
     <h2 className="text-sm font-semibold text-foreground">賞味期限が近い在庫</h2>
     ```
     を、アイコン + 件数バッジ付きに変更する（件数は `expiringStocks.length > 0` のときのみ表示。
     0 件時は既存の空メッセージで十分なため件数バッジは出さない）:
     ```tsx
     <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
       <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
       賞味期限が近い在庫
       {expiringStocks.length > 0 && (
         <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
           {expiringStocks.length}
         </span>
       )}
     </h2>
     ```
     見出し右側の `<Link href="/pantry">在庫を見る</Link>` は変更しない。
  8. **在庫リストのカード化**: 現行の `<li>`（displayName + 保存場所ラベルを縦積み、右に
     `formatExpiresAt` のみ）を、アイコン + 残日数バッジ付きのカードに変更する:
     ```tsx
     <ul className="flex flex-col gap-2">
       {expiringStocks.map((stock) => {
         const Icon = locationIcon(stock);
         const remainingDays = getExpiryRemainingDays(stock.expiresAt ?? '', asOf);
         const urgency = getExpiryUrgency(remainingDays);
         return (
           <li
             key={stock.id}
             className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
           >
             <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
               <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
             </span>
             <span className="flex flex-1 flex-col">
               <span className="text-sm font-medium text-foreground">{stock.displayName}</span>
               <span className="text-xs text-muted-foreground">{locationLabel(stock)}</span>
             </span>
             <span className="flex flex-col items-end gap-1">
               <span
                 className={cn(
                   'rounded-full px-2 py-0.5 text-xs font-medium',
                   expiryUrgencyChipClass(urgency),
                 )}
               >
                 {formatExpiryUrgencyLabel(remainingDays)}
               </span>
               <span className="text-xs text-muted-foreground">
                 {formatExpiresAt(stock.expiresAt ?? '')}
               </span>
             </span>
           </li>
         );
       })}
     </ul>
     ```
     `locationLabel` 関数・空状態（`expiringStocks.length === 0` の分岐）・`formatExpiresAt` の
     呼び出しと表記（`M/Dまで`）は変更しない。上記の Tailwind クラス値（余白・角丸・アイコン枠
     サイズ）はイメージであり、既存トークン（`border-border` / `bg-card` / `bg-muted` /
     `text-muted-foreground` 等、`zinc-*` や `bg-white` 直書き禁止）の範囲で implementer が
     微調整してよい。ただし新規 CSS カスタムプロパティは追加しない（設計書「追加の対象外」）。
  9. **「今週の献立」セクション・`QUICK_LINKS`・`ThemeToggle` 等、他のセクションは変更しない。**
- 完了条件:
  - `Dashboard` コンポーネントが `asOf: Date` を新規 prop として受け取る（既存 2 prop は
    破壊的変更なし）。
  - 期限切れ在庫が `expiryUrgencyChipClass('overdue')` のクラス（`destructive` 系）、
    当日〜1 日が `'critical'`（`accent` 系）、2〜3 日が `'soon'`（`CHIP.amber`）のクラスで
    表示される。
  - 保存場所ごとに `Refrigerator` / `Snowflake` / `Package` / `CircleHelp`
    （`storedLocation === null` のとき）が出し分けられる。
  - 見出しに `Clock` アイコンと件数バッジ（`expiringStocks.length > 0` のとき）が表示される。
  - `pnpm lint` / `pnpm type-check` が通る（`any` 不使用・import ordering は ESLint の指摘に
    従い整形）。

### apps/web/src/app/\_components/dashboard.test.tsx

- 変更内容:
  - 既存の 5 件の `render(<Dashboard mealPlan={...} expiringStocks={...} />)` 呼び出し全てに
    `asOf` prop を追加する（例: `asOf={new Date('2026-07-21T09:00:00')}`）。基準日は
    `dashboard-view.node.test.ts` と同じ `2026-07-21` に揃える。
  - 既存テスト「賞味期限が近い在庫を名称・保存場所・期限つきで一覧表示する」
    （`expiresAt: '2026-07-22'`、`asOf` を `2026-07-21` とすると残日数 1 → `'critical'`・
    「明日まで」）は表示内容の検証（`7/22まで` 等）を変更せず、`asOf` prop 追加のみ行う。
  - 新規テストケースを追加する:
    - 「期限切れの在庫は `overdue` の配色クラスで表示する」: `expiresAt: '2026-07-19'`
      （`asOf` に対し -2 日）のケースで、`screen.getByText('期限切れ')` の親要素（バッジ
      `<span>`）が `expiryUrgencyChipClass('overdue')` 相当のクラス（`'bg-destructive/10'`
      など、実装のクラス文字列に合わせる）を含むことを検証する。
    - 「当日〜1 日の在庫は `critical` の配色クラスで表示する」: `expiresAt: '2026-07-21'`
      （残日数 0・「本日まで」）で同様に検証。
    - 「2〜3 日の在庫は `soon` の配色クラスで表示する」: `expiresAt: '2026-07-24'`
      （残日数 3・「あと3日」）で同様に検証。
    - 「保存場所ごとに異なるアイコンを表示する」: `storedLocation` が `'fridge'` /
      `'freezer'` / `'pantry'` / `null` の 4 stock を渡し、`render` の戻り値 `container`
      に対して `container.querySelectorAll('svg')` またはクラス名セレクタ
      （lucide-react は各アイコンの `<svg>` に `lucide-<kebab-case-name>` クラスを付与する。
      例: `Refrigerator` → `.lucide-refrigerator`、`Snowflake` → `.lucide-snowflake`、
      `Package` → `.lucide-package`、`CircleHelp` → `.lucide-circle-help`）で
      `container.querySelector('.lucide-refrigerator')` 等の存在を検証する
      （`aria-hidden="true"` のため `getByRole` は使わない）。
  - `import { cleanup, render, screen } from '@testing-library/react';` を
    `import { cleanup, render, screen } from '@testing-library/react';`（`container` 取得のため
    `render` の戻り値を使う。追加 import は不要、`render()` の戻り値から分割代入する）。
- 完了条件:
  - 既存 5 件 + 新規 4 件（緊急度 3 件 + アイコン出し分け 1 件）、計 9 件前後のテストが
    全て PASS する。
  - ファイル名は `dashboard.test.tsx` のまま（vitest dom project の `*.test.tsx` include に
    一致、変更不要）。

### apps/web/src/app/page.tsx

- 変更内容: `<Dashboard mealPlan={mealPlan} expiringStocks={expiringStocks} />` を
  `<Dashboard mealPlan={mealPlan} expiringStocks={expiringStocks} asOf={now} />` に変更する。
  既存の `now`（`new Date()`）・`EXPIRY_WITHIN_DAYS`・`selectExpiringStocks` 呼び出しは変更しない。
- 完了条件: `asOf={now}` が渡され、`pnpm type-check` が通る（`Dashboard` の `Props.asOf` が
  必須になるため、渡し忘れると型エラーで検出できる）。

## 実装手順

1. **`dashboard-view.ts` に純関数を追加**（D-5） … 対象ファイル
   `apps/web/src/app/_utils/dashboard-view.ts` / 変更内容は上記「ファイルごとの変更内容」参照 /
   完了条件: 4 つの named export が揃い、既存 export に変更がない。
2. **`dashboard-view.node.test.ts` にテストを追加** … 対象ファイル
   `apps/web/src/app/_utils/dashboard-view.node.test.ts` / 手順 1 の関数に対する境界値テスト /
   完了条件: `pnpm --filter web test` の node プロジェクトで新規ケース含め全件 PASS。
3. **`category-color.ts` に `expiryUrgencyChipClass` を追加**（D-6） … 対象ファイル
   `apps/web/src/app/_utils/category-color.ts` / 完了条件: named export 追加、既存 3 関数に
   変更なし。
4. **`category-color.node.test.ts` にテストを追加** … 対象ファイル
   `apps/web/src/app/_utils/category-color.node.test.ts` / 完了条件: 新規 `describe` が全件 PASS。
5. **`dashboard.tsx` を改訂**（`asOf` prop・カード化・見出しバッジ） … 対象ファイル
   `apps/web/src/app/_components/dashboard.tsx` / 手順 1・3 の関数を利用 / 完了条件は上記
   「ファイルごとの変更内容」参照。手順 1・3 の完了後に着手する。
6. **`dashboard.test.tsx` を更新** … 対象ファイル `apps/web/src/app/_components/dashboard.test.tsx` /
   既存呼び出しへ `asOf` 追加 + 新規 4 ケース追加 / 完了条件: dom プロジェクトで全件 PASS。
   手順 5 の完了後に着手する（`asOf` prop が存在しないとコンパイルエラーになるため）。
7. **`page.tsx` に `asOf={now}` を追加** … 対象ファイル `apps/web/src/app/page.tsx` / 完了条件:
   `pnpm type-check` が通る。手順 5 の完了後に着手する。
8. **品質ゲート実行** … `pnpm lint` / `pnpm type-check` / `pnpm --filter web test`
   （必要に応じてリポジトリルートから `pnpm lint` / `pnpm type-check` / `pnpm test` で全体実行）。
   完了条件: 全コマンドが 0 エラーで完了する。

## 依存関係

- 手順 1 → 手順 2（テストは実装後）。
- 手順 3 → 手順 4（同上）。
- 手順 1・3 → 手順 5（`dashboard.tsx` は両ユーティリティの関数を利用するため、先に export が
  揃っている必要がある）。
- 手順 5 → 手順 6（テストは `asOf` prop 追加後の Props 型に合わせる）。
- 手順 5 → 手順 7（`page.tsx` は `Dashboard` の新 Props 型に依存）。
- 手順 6・7 は手順 5 完了後であれば順不同で並行可。
- 手順 8（品質ゲート）は手順 1〜7 すべて完了後に実行する。

## テスト計画

| テストファイル                                        | 追加内容                                                                                                                         | vitest project                                              |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `apps/web/src/app/_utils/dashboard-view.node.test.ts` | `getExpiryRemainingDays` / `getExpiryUrgency` / `formatExpiryUrgencyLabel` の境界値（期限切れ・当日・1〜3日、P-4 の 1→2 切替点） | node（`vitest.node.config.mts` の `src/**/*.node.test.ts`） |
| `apps/web/src/app/_utils/category-color.node.test.ts` | `expiryUrgencyChipClass` の既知 3 値 + 未知値フォールバック                                                                      | node                                                        |
| `apps/web/src/app/_components/dashboard.test.tsx`     | 既存 5 件への `asOf` 追加 + 緊急度別配色 3 件 + 保存場所別アイコン出し分け 1 件                                                  | dom（`vitest.dom.config.mts` の `src/**/*.test.tsx`）       |

ファイル名は既存の命名規約（`*.node.test.ts` / `*.test.tsx`）を維持する。新規テストファイルの
作成は不要（すべて既存ファイルへの追記）。

## リスク

- **R-1 ローカル日付規約のずれ**: `getExpiryRemainingDays` が `parseExpiryDate` /
  `toLocalMidnight` の規約（`YYYY-MM-DDT00:00:00` のローカルタイム解釈）からずれると、
  `selectExpiringStocks` との整合が崩れ、境界値（当日・閾値ちょうど）で表示が食い違う。
  回避策: 新規関数は必ず同一ファイル内の既存 private ヘルパーを再利用し、独自の日付計算
  （`Date.now()` や UTC ベース）を実装しない。テスト（手順 2）で境界値を明示的に検証する。
- **R-2 アイコンクラス名によるテストの脆さ**: lucide-react の `lucide-<name>` クラス名は
  ライブラリ実装詳細に依存する（バージョン `1.14.0` で確認済み）。バージョンアップで
  クラス命名規則が変わるとテストが壊れる可能性がある。回避策: 現状バージョン固定
  （`package.json` の `^1.14.0`）での確認事項として明記し、将来 lucide-react を更新する際は
  このテストの再確認をレビュー観点に含める（本計画のスコープ外・別タスク）。
- **R-3 P-7 の 0 件時バッジ非表示という細部判断**: 設計書 P-7 は「件数バッジを追加するか」
  までを確定しており、0 件時の表示可否は明記していない。本計画では「0 件時は非表示」を
  実装上の妥当な解釈として採用した（0 件時は空メッセージ表示と重複するため）。実装後の
  レビューでユーザー期待と異なる場合は、Orchestrator 経由で設計書へのフィードバックを検討する。
- **R-4 既存 `dashboard.test.tsx` の破壊的変更漏れ**: `asOf` prop 追加を 1 箇所でも
  更新し忘れると型エラーで即座に検出できる（`pnpm type-check` が失敗する）ため、実害は
  低いが手順 6 で漏れなく確認する。

## ロールバック方法

- 変更は 6 ファイル（`dashboard-view.ts` / `dashboard-view.node.test.ts` / `category-color.ts` /
  `category-color.node.test.ts` / `dashboard.tsx` / `dashboard.test.tsx`）+ `page.tsx` の
  1 行差分に限定される。いずれも新規ファイル作成を伴わないため、`git diff` で該当ファイルの
  変更を確認し `git checkout -- <path>` で個別に戻せる。
- 元の「賞味期限が近い在庫」の文章リスト表示（カード化前の実装、docs/designs/dashboard.md
  「実装記録（2026-07-21）」時点の状態）に戻したい場合は、`apps/web/src/app/_components/dashboard.tsx`
  の該当 `<li>` ブロックのみを差し戻し、`asOf` prop・`page.tsx` の変更は残してよい（`asOf` は
  後方互換な追加 prop のため、カード化を取り消しても実害はない）。
- 段階的ロールバックも可能: 手順 1〜4（ユーティリティ追加）のみ残し、手順 5〜7
  （`dashboard.tsx` / `dashboard.test.tsx` / `page.tsx`）だけを戻すこともできる
  （ユーティリティ関数は未使用でも副作用がないため）。

## ドキュメント更新対象

- ドメインモデル変更なし（`docs/04-domain-model.md` の更新は不要 — 本改訂は既存
  `PantryDto` の表現方法のみを変更し、Domain/Application/Infrastructure に変更はない）。
- `docs/designs/dashboard.md`: 実装完了後、元設計の「実装記録（2026-07-21）」に続けて
  改訂分の実装記録（変更ファイル・品質ゲート結果・実画面確認結果）を追記する
  （既存の記録スタイルに倣う。本計画の作成では追記しない — 実装完了後に implementer が行う）。
- `docs/tests/dashboard.md` が存在する場合は、上記「テスト計画」との整合を確認する
  （2026-07-21 時点で `docs/tests/` 配下に dashboard 関連ファイルが無ければ新規作成は
  スコープ外 — 品質ゲート = `pnpm test` の実行結果で代替する、元設計のテスト方針を踏襲）。
