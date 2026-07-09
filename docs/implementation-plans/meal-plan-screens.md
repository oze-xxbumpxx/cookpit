# 実装計画: meal-plan-screens

- 前提となる設計書: `docs/designs/meal-plan-screens.md`（confirmed・2026-07-09）
- レベル: L2
- 実装ルート: Codex 委譲（ブリーフ: `docs/tasks/codex/meal-plan-screens/`。本計画から生成）

## 変更対象ファイル

| パス                                                            | なぜ変えるか                                                                            |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/web/src/app/recipes/_components/recipe-list-client.tsx`   | ヘッダー左のリンク群（現在「商品」のみ）に `/meal-plans`「献立」リンクを追加する（S-8） |
| `apps/web/src/app/products/_components/product-list-client.tsx` | 同上（現在「レシピ」のみ）に「献立」リンクを追加する（S-8）                             |

上記 2 ファイル以外の既存ファイルは変更しない（`packages/*`・`apps/web/src/server/` は一切変更しない）。

## 新規作成ファイル

| パス                                                                   | 役割                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/web/src/app/meal-plans/_utils/meal-plan-view.ts`                 | `formatWeekRange` / `buildRecipeNameMap`（表示用純関数）               |
| `apps/web/src/app/meal-plans/_utils/meal-plan-view.test.ts`            | 上記の単体テスト（年またぎ週・曜日表記を含む）                         |
| `apps/web/src/app/meal-plans/_components/planned-recipe-item.tsx`      | 献立内レシピ 1 行（名前 or 削除済み表示・倍量バッジ・削除ボタン）      |
| `apps/web/src/app/meal-plans/_components/planned-recipe-item.test.tsx` | RTL テスト                                                             |
| `apps/web/src/app/meal-plans/_components/recipe-picker.tsx`            | レシピ選択（検索絞り込み + 倍量プリセット + 追加ボタン）               |
| `apps/web/src/app/meal-plans/_components/recipe-picker.test.tsx`       | RTL テスト                                                             |
| `apps/web/src/app/meal-plans/_components/meal-plan-client.tsx`         | 今週の献立の表示・作成・追加・削除の Client Component（状態管理の親）  |
| `apps/web/src/app/meal-plans/_components/meal-plan-client.test.tsx`    | RTL テスト（RPC / router モック）                                      |
| `apps/web/src/app/meal-plans/page.tsx`                                 | 献立作成画面の Server Component（手動 DI・並列取得・現在週算出）       |
| `apps/web/src/app/meal-plans/_components/history-week-card.tsx`        | 履歴の週カード（`'use client'` なしの純粋表示）                        |
| `apps/web/src/app/meal-plans/_components/history-week-card.test.tsx`   | RTL テスト                                                             |
| `apps/web/src/app/meal-plans/history/page.tsx`                         | 履歴ビューの Server Component（`?limit=` clamp・「さらに表示」リンク） |

## ファイルごとの変更内容

### `apps/web/src/app/meal-plans/_utils/meal-plan-view.ts`

- 変更内容:
  - `formatWeekRange(weekIdentifier: string): string` — `"2026-07-04"` → `「7/4（土）〜7/10（金）」`。
    `new Date(weekIdentifier + 'T00:00:00')` でローカルタイム構築（meal-plan-core 設計 4-6 と同一規約）。
    終了日は開始日 + 6 日。曜日は `['日','月','火','水','木','金','土']` の固定配列。年は表示しない。
  - `buildRecipeNameMap(recipes: RecipeDto[]): Map<string, string>` — `recipe.id` → `recipe.name`。
  - `resolveHistoryLimit(raw: string | undefined): number` — history の `?limit=` 解決。
    `Number(raw)` が整数なら 1〜12 に clamp、非整数・省略は `4`（テスト容易性のため
    page から純関数へ抽出。設計書「履歴表示」の clamp 仕様と同一）。
- 完了条件: 単体テスト（通常週・年またぎ週 `2026-12-26`・曜日・limit clamp 全域）が green。

### `apps/web/src/app/meal-plans/_components/planned-recipe-item.tsx`

- 変更内容: Props `{ plannedRecipe: PlannedRecipeDto; recipeName: string | null; onRemove: (plannedRecipeId: string) => void; submitting: boolean }`。
  `recipeName` ありなら名前 + `/recipes/[recipeId]` への `Link`、`null` なら「削除済みレシピ」を
  `text-muted-foreground` でリンクなし表示（S-4）。倍量は `1.5×` 形式のテキストバッジ
  （`scaleFactor` は number。`${scaleFactor}×` で整形）。削除ボタンは lucide `X` アイコン +
  `aria-label="献立から削除"`、`submitting` 中 disabled。削除済みでも削除ボタンは有効。
- 完了条件: RTL テスト（名前あり/削除済み/削除ボタン発火）が green。

### `apps/web/src/app/meal-plans/_components/recipe-picker.tsx`

- 変更内容: Props `{ recipes: RecipeDto[]; onAdd: (recipeId: string, scaleFactor: number) => void; submitting: boolean }`。
  内部 state: 検索テキスト・選択中 recipeId・選択倍量（デフォルト `1`）。
  検索は `recipe.name.includes(trimmedQuery)`（recipe-list-client と同ロジック）。
  倍量プリセットは `[1, 1.5, 2, 3]` のトグルボタン（表示 `1×`〜`3×`）。
  [献立に追加] は未選択 or `submitting` 中 disabled。`onAdd` 呼び出し後は選択レシピのみリセット
  （検索テキスト・倍量は維持。picker 自体は閉じない — 連続追加運用）。
- 完了条件: RTL テスト（絞り込み・デフォルト 1×・onAdd 引数）が green。

### `apps/web/src/app/meal-plans/_components/meal-plan-client.tsx`

- 変更内容: `'use client'`。Props `{ mealPlan: MealPlanDto | null; recipes: RecipeDto[]; currentWeekIdentifier: string }`。
  - MealPlan はローカル state に持たず props を描画。変更系成功後は `router.refresh()`（設計「フロントエンド設計」）。
  - state: `submitting` / `errorMessage: string | null` / picker 開閉。
  - `mealPlan === null` → 空状態 + 「今週の献立をはじめる」→
    `client.api['meal-plans'].$post({ json: { weekIdentifier: currentWeekIdentifier } })`。
  - 追加: `client.api['meal-plans'][':id'].recipes.$post({ param: { id: mealPlan.id }, json: { recipeId, scaleFactor } })`。
  - 削除: `client.api['meal-plans'][':id'].recipes[':plannedRecipeId'].$delete({ param: { id: mealPlan.id, plannedRecipeId } })`（確認ダイアログなし・D-3）。
  - 失敗時 `errorMessage`: `!response.ok` →「操作に失敗しました。」/ catch →「通信エラーが発生しました。」
    （recipe-edit-screen と同文言）。
  - ヘッダー: `grid-cols-[1fr_auto_1fr]`（既存一覧と同構造）。左に「レシピ」「商品」ghost リンク、
    中央タイトル「今週の献立」、右に「履歴」リンク（`/meal-plans/history`）。
  - 週表示は `formatWeekRange(mealPlan.weekIdentifier)`。`plannedRecipes` 0 件時は空状態文言。
- 完了条件: RTL テスト（下記テスト計画 WC-M 系）が green。

### `apps/web/src/app/meal-plans/page.tsx`

- 変更内容: Server Component。`export const dynamic = 'force-dynamic'`。
  `getDb()` から `DrizzleMealPlanRepository` / `DrizzleRecipeRepository` を手動 DI し、
  `GetCurrentMealPlanUseCase.execute()` と `GetRecipesUseCase.execute()` を `Promise.all` で並列実行。
  `WeekIdentifier.current().toString()` を算出（import は既存規約どおり深いパス
  `@cookpit/domain/src/shared/week-identifier`）し、`<MealPlanClient>` へ 3 props を渡す。
  try/catch しない（recipes/page.tsx 先例）。
- 完了条件: `pnpm --filter @cookpit/web type-check` 通過。`/meal-plans` が SSR で表示される。

### `apps/web/src/app/meal-plans/_components/history-week-card.tsx`

- 変更内容: `'use client'` なしの純粋表示。Props `{ mealPlan: MealPlanDto; recipeNameMap: Map<string, string>; isCurrentWeek: boolean }`。
  週表示（`formatWeekRange`）+ `isCurrentWeek` で「今週」ラベル + レシピ名（倍量付き）列挙。
  削除済みは「削除済みレシピ」muted 表示。0 件週は「レシピなし」。ステータスバッジなし（D-2）。操作なし。
- 完了条件: RTL テスト（WC-H 系）が green。

### `apps/web/src/app/meal-plans/history/page.tsx`

- 変更内容: Server Component のみ（Client なし・D-4）。`export const dynamic = 'force-dynamic'`。
  `searchParams: Promise<{ limit?: string }>` から `resolveHistoryLimit`（`_utils/meal-plan-view.ts`）で
  limit を解決。
  `GetMealPlanHistoryUseCase.execute({ limit })` + `GetRecipesUseCase.execute()` を並列実行。
  `WeekIdentifier.current().toString()` と一致する週へ `isCurrentWeek` を渡す。
  0 件時「履歴はまだありません」。取得件数 === limit かつ limit < 12 のとき
  `<Link href={`/meal-plans/history?limit=${Math.min(limit + 4, 12)}`}>さらに表示</Link>`。
  ヘッダー左に `/meal-plans` への戻りリンク、中央タイトル「献立の履歴」。
- 完了条件: type-check 通過。`?limit=` の clamp（0→4 扱い or 1、13→12、abc→4）が仕様どおり。

### `apps/web/src/app/recipes/_components/recipe-list-client.tsx`

- 変更内容: ヘッダー左 `<div className="flex justify-start">` を `gap-1` 付きにし、既存「商品」リンクの
  隣に同スタイル（`buttonVariants({ variant: 'ghost', size: 'sm' })` + `h-9 px-2 text-foreground`）で
  `/meal-plans`「献立」リンクを追加。他は一切変更しない。
- 完了条件: 既存 RTL・画面挙動に回帰なし。リンクが `/meal-plans` へ遷移する。

### `apps/web/src/app/products/_components/product-list-client.tsx`

- 変更内容: 同上（既存「レシピ」リンクの隣に「献立」リンク追加）。
- 完了条件: 既存 RTL（product-list-client.test.tsx）green のまま。リンクが `/meal-plans` へ遷移する。

## 実装手順

1. **表示ユーティリティ** … `_utils/meal-plan-view.ts` + `.test.ts` / 純関数 2 本 / 単体テスト green
2. **献立項目コンポーネント** … `planned-recipe-item.tsx` + `.test.tsx` / 表示 + onRemove / RTL green
3. **レシピピッカー** … `recipe-picker.tsx` + `.test.tsx` / 検索 + プリセット + onAdd / RTL green
4. **献立クライアント統合** … `meal-plan-client.tsx` + `.test.tsx` / 作成・追加・削除の RPC 結線 / RTL green
5. **作成画面 Server Component** … `meal-plans/page.tsx` / 手動 DI・並列取得・週算出 / type-check 通過
6. **履歴カード + 履歴画面** … `history-week-card.tsx` + `.test.tsx`・`history/page.tsx` / limit clamp・さらに表示 / RTL + type-check green
7. **導線リンク追加** … recipe-list-client.tsx / product-list-client.tsx / 「献立」リンク各 1 個 / 既存テスト回帰なし
8. **品質ゲート + 実画面確認** … `pnpm lint` / `pnpm type-check` / `pnpm test` 全 green。
   manual-browser-verify（Codex 委譲のため review-codex-implementation を先に実行）

## 依存関係

- Step 1 → Step 2〜6（formatWeekRange / buildRecipeNameMap を使用）
- Step 2・3 → Step 4（子コンポーネント）→ Step 5（page が client を使用）
- Step 6 は Step 1 完了後なら Step 2〜5 と独立して実装可
- Step 7 は独立（いつでも可）。Step 8 は全ステップ後
- パッケージ間依存: なし（apps/web 内で完結。`@cookpit/domain` への import は既存 workspace 依存の範囲）

## テスト計画

詳細は `docs/tests/meal-plan-screens.md`（本計画と同時作成）。配置は既存規約どおり co-located。

- 単体: `meal-plan-view.test.ts`（formatWeekRange 通常週・年またぎ・曜日 / buildRecipeNameMap）
- RTL: `planned-recipe-item.test.tsx` / `recipe-picker.test.tsx` / `meal-plan-client.test.tsx` /
  `history-week-card.test.tsx`。モックは `vi.mock('next/link')`（product-list-client.test.tsx 先例）に加え、
  meal-plan-client では `vi.mock('next/navigation')`（`useRouter` → `{ refresh: vi.fn() }`）と
  `vi.mock('@/lib/api-client')`（`client.api['meal-plans']` 系の `$post` / `$delete` を vi.fn で差し替え）
- API ルートテスト: 追加なし（既存 `meal-plans.test.ts` で担保。サーバー側変更なし）
- 実画面: manual-browser-verify（トークン・レスポンシブ・導線・冪等作成の連打）

## リスク

| #   | リスク                                                                                                                                 | 検出タイミング                  | 回避策（優先順）                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | `apps/web` から `@cookpit/domain` を直接 import するのは初（従来は application 経由のみ）。Next のトランスパイル対象になるかの不確実性 | Step 5 の type-check / dev 起動 | ① application と同じ深いパス import（`@cookpit/domain/src/shared/week-identifier`）をまず試す → ② 失敗したら**中断して報告**（`GetMealPlanHistoryUseCase` に現在週を返させる等の代替は設計変更のため独断で行わない） |
| R-2 | Hono RPC のハイフン付きキー `client.api['meal-plans']` の型解決（既存ルートは全て単語 1 個でブラケットアクセス先例なし）               | Step 4 の type-check            | ① ブラケットアクセスで型が通ることを最初に確認 → ② 通らなければ中断して報告                                                                                                                                          |
| R-3 | `meal-plan-client.test.tsx` のモック構成（next/navigation + api-client）は本リポジトリ初のパターン                                     | Step 4 のテスト実行             | 試験計画に具体的なモック雛形を記載済み。雛形どおりで通らない場合はテスト側のみ調整（プロダクションコードを変えない）                                                                                                 |
| R-4 | Codex 既知ミス型（Tailwind クラスタイポ・結線漏れ・`'use client'` 漏れは tsc/eslint を通過する）                                       | Step 8                          | review-codex-implementation（機械検出 → チェックリスト → 実画面確認）を必須で実行                                                                                                                                    |
| R-5 | 既存 2 ファイル（一覧ヘッダー）変更による回帰                                                                                          | Step 7 のテスト                 | 変更はリンク 1 個の追加のみに限定。product-list-client.test.tsx の既存 4 ケースが green のままであることを確認                                                                                                       |

## ロールバック方法

- 新規ファイルは `apps/web/src/app/meal-plans/` ディレクトリごと削除で完全に戻る（他所から参照されない）。
- 既存 2 ファイルはリンク追加の 1 hunk を revert するだけ。
- DB・API・契約の変更がないため、データやスキーマのロールバックは不要。

## ドキュメント更新対象

- `docs/05-roadmap.md` — Sprint 3 Unit B の状態を完了時に更新（完了条件 2 項目のチェック）
- `docs/designs/meal-plan-screens.md` — 実装完了時にステータスを「実装済み」へ更新
- `docs/04-domain-model.md` — **対象外**（ドメインモデル変更なし。整合確認のみ: 本実装は
  WeekIdentifier を読み取り利用するだけで定義を変えない）
- `logs/YYYY-MM-DD.md` — セッションログ（close-session で記録）
