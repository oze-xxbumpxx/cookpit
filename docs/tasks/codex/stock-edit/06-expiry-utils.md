# Task 6: UI 基盤 — 期限の緊急度関数を expiry.ts へ切り出す

## 概要

賞味期限の緊急度を扱う関数群は現在 `apps/web/src/app/_utils/dashboard-view.ts` にあり、
名前のとおりダッシュボード専用の置き場になっている。Task 7 で `/pantry` からも使うため、
共有できる場所へ**ロジックを一切変えずに**移す。

**これは純粋なリファクタリング（移動）である。挙動を変えてはいけない。**
既存のダッシュボードのテストが移動前と完全に同じ結果で通ることが完了条件。

対象は `apps/web/src/app/_utils/` と `apps/web/src/app/page.tsx` / `pantry/page.tsx`。

## アーキテクチャ制約

- Presentation 層。ドメインロジックを書かない（表示のための純関数のみ）。
- `any` 型は禁止。デフォルトエクスポート禁止（**ただし `app/**/page.tsx` の
  default export は Next.js App Router の規約なので既存のまま維持する\*\*）。
- 型のみのインポートは `import type`。`===` / `!==` を使う。「値なし」は `null`。

## 実装対象ファイル

### 1. `apps/web/src/app/_utils/expiry.ts`（新規）

`dashboard-view.ts` から**そのまま移動**する（本体を書き換えない）:

- `parseExpiryDate`（非公開ヘルパー）
- `toLocalMidnight`（非公開ヘルパー）
- `export type ExpiryUrgency = 'overdue' | 'critical' | 'soon'`
- `export function getExpiryRemainingDays(expiresAt: string, asOf: Date): number`
- `export function getExpiryUrgency(remainingDays: number): ExpiryUrgency`
- `export function formatExpiryUrgencyLabel(remainingDays: number): string`

**新設する定数**:

```ts
/** 賞味期限を「近い」と扱う閾値（日数）。ダッシュボードと /pantry で共有する。 */
export const EXPIRY_URGENCY_WITHIN_DAYS = 3;
```

`parseExpiryDate` / `toLocalMidnight` の公開/非公開は、**`dashboard-view.ts` の
`selectExpiringStocks` が挙動を変えずに動くこと**を最優先に決める:

- `selectExpiringStocks` は現在この 2 つを直接使っている
  （`toLocalMidnight(asOf)` で threshold を作り、`parseExpiryDate(stock.expiresAt) <= threshold`）。
- したがって **`expiry.ts` から両方を `export` して `dashboard-view.ts` が import する**のが
  最も安全（挙動が完全に不変）。この方針を採ること。
- 「`getExpiryRemainingDays` 経由に書き換えて統一する」ような**気の利いたリファクタは
  しない**（`<=` 比較と `Math.round` の丸めで境界の扱いが変わりうる）。

### 2. `apps/web/src/app/_utils/dashboard-view.ts`（変更）

- 移動した 4 つ（型 1 + 関数 3）と 2 つの非公開ヘルパーの**定義を削除**し、`expiry.ts` から
  import する。
- **`selectExpiringStocks` はこのファイルに残す**（ダッシュボード固有の「閾値内を選び出す」責務）。
- **`MEAL_PLAN_STATUS_LABELS` はこのファイルに残す**（無関係なので触らない）。
- 既存の import 元（`dashboard.tsx` など）が壊れないよう、移動した関数を
  **`export { ... } from './expiry'` で re-export する**か、呼び出し側の import を
  `expiry.ts` へ張り替えるかは、どちらでもよい。**ただし混在させない**（どちらかに統一する）。

### 3. `apps/web/src/app/page.tsx`（変更）

- ローカル定数 `const EXPIRY_WITHIN_DAYS = 3;`（8 行目）を削除し、
  `expiry.ts` の `EXPIRY_URGENCY_WITHIN_DAYS` を import して使う。
- `selectExpiringStocks(pantry.stocks, now, EXPIRY_URGENCY_WITHIN_DAYS)` になる。
  **値は 3 のままなので結果は変わらない。**

### 4. `apps/web/src/app/pantry/page.tsx`（変更）

- ダッシュボードの `page.tsx` と**同型のパターン**で `const now = new Date();` を作り、
  `PantryClient` に `asOf={now}` を追加で渡す。
- `PantryClient` 側で `asOf` を受け取れるようになるのは **Task 7**。この Task 単体では
  型エラーになるため、**Task 6 と Task 7 は 1 つのコミットにまとめてよい**
  （分ける場合は Task 7 まで通して `pnpm type-check` を確認すること）。

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **`expiryUrgencyChipClass` を動かさない。** これは
  `apps/web/src/app/_utils/category-color.ts` にあり、`mealPlanStatusChipClass` など
  同型の関数と並んでいる。**`expiry.ts` へ移さない**（設計で確定済み）。
- **関数の中身を 1 文字も変えない。** `Math.round(diff / (24 * 60 * 60 * 1000))` の式、
  `remainingDays <= 1` の比較、`localeCompare` によるソート、すべてそのまま。
  「読みやすくする」書き換えをしない。
- **`getExpiryUrgency` の前提条件を変えない。** この関数の JSDoc は
  「`selectExpiringStocks` の 3 日以内フィルタ済みの値を渡す前提のため、**4 日以上も
  `'soon'` に収束する**」と書いてある。つまり**この関数自身は閾値判定をしない**。
  Task 7 で `/pantry`（全在庫一覧）から使うときは**呼び出し側で閾値判定が必要**になる。
  ここで「4 日以上なら `null` を返す」ような改造をしないこと。
- **定数名は `EXPIRY_URGENCY_WITHIN_DAYS`。** 旧名 `EXPIRY_WITHIN_DAYS` を
  `expiry.ts` にそのまま持っていかない（`page.tsx` のローカル定数との重複を避けるため
  リネームすることが確定している）。値は **3**。
- **`'use client'` を付けない。** `expiry.ts` は純関数のモジュールで、Server Component
  （`page.tsx` / `dashboard.tsx`）からも使われる。
- 型のみの import（`StockDto` / `MealPlanStatus` / `ExpiryUrgency`）は `import type`。
- `apps/web/src/app/page.tsx` と `pantry/page.tsx` の **default export は維持する**
  （Next.js App Router の規約。`.claude/rules/coding-standards.md` の明示的な例外）。

## テスト

**新規テストは最小限でよい。このタスクの本質は「既存テストが変わらず通ること」。**

- `apps/web/tests/app/_utils/dashboard-view.node.test.ts`: 移動した関数を直接 import して
  いる場合、import 元を `expiry.ts` へ張り替える（**テストケースの内容は変えない**）。
  必要ならファイルを `expiry.node.test.ts` に分割してもよいが、**観点は 1 件も減らさない**。
- `apps/web/tests/app/_components/dashboard.test.tsx`: **変更不要**で通ること。

追加してよい観点（試験計画 §7-5 EXP-01〜03）:

- `EXPIRY_URGENCY_WITHIN_DAYS` が `3` であること
- ダッシュボードと `/pantry` が同じ閾値定数を参照していること

> **テストファイルの拡張子に注意**: `apps/web` の vitest は `*.node.test.ts` /
> `*.dom.test.ts` / `*.test.tsx` で拾う。**素の `*.test.ts` は `server` 配下以外では
> silent skip になる**（テストが存在しないのに green に見える）。新規ファイルを作る場合は
> 必ず既存の命名に合わせること。

## 完了条件

- [ ] `pnpm --filter @cookpit/web test` 全 green。特に
      `dashboard-view.node.test.ts` と `dashboard.test.tsx` が**移動前と同じ結果**
- [ ] `pnpm --filter @cookpit/web type-check` / `pnpm lint` 全 green
      （Task 7 と合わせて確認してよい）
- [ ] `category-color.ts` に差分が無い（`expiryUrgencyChipClass` を動かしていない）
- [ ] `dashboard-view.ts` に `selectExpiringStocks` と `MEAL_PLAN_STATUS_LABELS` が残っている
- [ ] `expiry.ts` の関数本体が `dashboard-view.ts` の元コードと**論理的に同一**
- [ ] `apps/web/src/app/page.tsx` からローカル定数 `EXPIRY_WITHIN_DAYS` が消え、
      `EXPIRY_URGENCY_WITHIN_DAYS`（値 3）を参照している
