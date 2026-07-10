# 設計書: meal-plan-screens

- ステータス: 実装済み（2026-07-09）
- レベル: L2
- スプリント: Sprint 3 Unit B
- 関連: `docs/designs/meal-plan-core.md`（Unit A 設計・C-1〜C-4 / D-4〜D-7）、
  `docs/requirements/meal-plan-core.md`（§5-4 に Unit B への申し送りあり）、
  `docs/decisions/ADR-0005-week-definition-saturday-start.md`、
  `docs/designs/recipe-edit-screen.md`（L2 画面追加の先例）

> 要件定義書（docs/requirements/meal-plan-screens.md）は作成しない。
> 画面要件は依頼内容 + Unit A 要件書の申し送りで明確なため、本書の「要件」節に含める
> （recipe-edit-screen 先例と同方式）。

## 背景

Sprint 3 Unit A（meal-plan-core）で MealPlan のバックエンド一式
（Domain / Application / Infrastructure / API Contract / Hono API 5 本）が完了した
（PR #37/#42/#44/#45/#46 マージ済み）。画面（UI)のみ未着手で、roadmap 上 Sprint 3 の残タスク。

## 目的

土曜日に「今週の献立」を決めるフローを画面で完結させる。

- 1 週間分の献立を画面で組み立てられる（Sprint 3 完了条件）
- 過去 4 週間の献立を遡れる（Sprint 3 完了条件）

## 要件

1. **献立作成画面（`/meal-plans`）**
   - 現在週の MealPlan を表示する（週表示は「7/4（土）〜7/10（金）」形式）。
   - 未作成なら「今週の献立をはじめる」ボタンを表示し、押下で作成する（Create は冪等・C-3）。
   - レシピを検索・選択して献立に追加できる。
   - 倍量（scaleFactor）はプリセット 1× / 1.5× / 2× / 3× から選択する（デフォルト 1×）。
   - 追加済みレシピを削除できる。
2. **履歴ビュー（`/meal-plans/history`）**
   - 過去の献立を新しい週順に表示する。デフォルト 4 週、最大 12 週
     （`GET /api/meal-plans/history?limit=`、default 4 / max 12・D-5）。
   - 現在週も履歴に含まれる（「今週」ラベルで区別）。閲覧のみで操作はしない。
3. **削除済み Recipe の表示（C-4 申し送り）**
   - レシピ名を解決できない項目は「削除済みレシピ」とグレーアウト表示し、詳細リンクは付けない。
   - 作成画面では献立からの削除（DELETE）は可能なままにする。履歴では表示のみ。
4. **ビジュアル**: 既存の「温かいキッチン」セマンティックトークンに合わせる。新規トークン・
   新規デザインシステムは作らない。
5. **導線**: recipes / products 一覧ヘッダーの既存リンク群に「献立」を追加する。

## 設計判断サマリ

### ユーザー確定事項（2026-07-09 確認済み）

| #   | 判断項目               | 確定内容                                                                              | 非採用案                                |
| --- | ---------------------- | ------------------------------------------------------------------------------------- | --------------------------------------- |
| S-1 | 画面構成               | ルート分割（`/meal-plans` + `/meal-plans/history`）                                   | 1 画面タブ切替                          |
| S-2 | scaleFactor UI         | プリセットのみ（1×/1.5×/2×/3×）。契約は正の数を許容済みで自由入力は後付け可           | プリセット + 自由入力 / 自由入力のみ    |
| S-3 | scheduledDate          | 今回は入れない（UI 非表示）。契約に設定手段がなく、入れると契約変更 = L3 化           | 契約拡張して追加                        |
| S-4 | 削除済み Recipe        | 「削除済みレシピ」表示 + 献立からの削除は可（掃除できないと詰むため）                 | 操作不可 / 非表示                       |
| S-5 | レシピ名の解決         | Recipe 一覧を 1 リクエストで取得し recipeId→名前 Map を構築。Map に無い ID = 削除済み | PlannedRecipe ごとの個別取得（N+1）     |
| S-6 | 初期表示方式           | Server Component 直呼び + 操作は素の Hono RPC。TanStack Query は導入しない            | TanStack Query 導入 / 全て Client + RPC |
| S-7 | MealPlan 作成トリガー  | 明示ボタン。閲覧だけの訪問で空 draft を作らない                                       | 画面表示時に自動作成                    |
| S-8 | `/meal-plans` への導線 | recipes / products 一覧ヘッダーの既存リンク群に「献立」を追加                         | 導線なし / グローバルナビ新設           |

### 設計者判断（本書で確定。別案を選ぶ場合の差分を併記）

| #   | 判断項目                   | 採用                                                                                                 | 別案との差分                                                                                |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| D-1 | 対象週                     | **現在週のみ**。任意週（過去・未来）の表示・編集は対象外                                             | 任意週対応には「週指定で MealPlan を取得する API」が必要（未公開）→ 契約追加 = L3 化        |
| D-2 | ステータスバッジ           | 表示しない。Sprint 3 では全件 draft で情報量がなく、遷移 UI（Sprint 4）と同時導入が自然              | 表示する場合: バッジ用の文言・配色定義が必要になるだけで構造影響なし                        |
| D-3 | レシピ削除の確認ダイアログ | 出さない（即時削除）。再追加が容易で破壊的でないため。レシピ本体の削除（AlertDialog 2 段階）とは別物 | 出す場合: recipe-detail-client の AlertDialog パターンを流用                                |
| D-4 | 履歴の追加読み込み         | `?limit=` クエリパラメータ + 「さらに表示」リンク（4→8→12）。Server Component 完結で Client 状態不要 | Client + RPC 再フェッチにする場合: history 画面にも Client Component と状態管理が必要になる |
| D-5 | 現在週の週識別子の算出     | Server Component で `WeekIdentifier.current().toString()` を呼び、Client へ props で渡す             | Client 側で土曜始まり計算を再実装する案は、ドメインロジックの重複実装になるため不採用       |

D-5 の補足: `apps/web` → `packages/domain` の依存は許容方向（`docs/03-architecture.md`）。
値オブジェクトの再利用であり、Presentation にドメインロジックを書くことにはあたらない。
週の起点計算を UI で重複実装する方が規約違反リスクが高い。

## 対象範囲

- `apps/web/src/app/meal-plans/`（新規ディレクトリ一式。詳細は「変更後構成」）
- `apps/web/src/app/recipes/_components/recipe-list-client.tsx`（ヘッダーに「献立」リンク追加のみ）
- `apps/web/src/app/products/_components/product-list-client.tsx`（同上）

## 対象外

- ステータス遷移 UI（draft→shopping 等）→ Sprint 4（ShoppingList 連動）
- markAsCooked / scheduleForDay の API 新規公開・UI（S-3）
- scheduledDate の表示・入力（S-3。値は常に null のため表示もしない）
- 任意週（過去・未来週）の作成・編集（D-1。現在週のみ）
- ShoppingList 連携（Sprint 4）
- Domain / DB / UseCase / Zod 契約の変更（`packages/*` と `apps/web/src/server/` は一切変更しない）
- TanStack Query の導入（S-6）
- グローバルナビゲーションの新設（S-8。必要なら Sprint 6 で別タスク化）
- 認証・認可（MVP1 方針どおり）

## 現状構成

```
apps/web/src/app/
├── page.tsx                        # / → /recipes へ redirect
├── recipes/                        # 一覧・作成・詳細・編集（Sprint 1）
│   └── _components/recipe-list-client.tsx   # ヘッダーに /products リンクあり
├── products/                       # 一覧・作成・詳細・編集（Sprint 2）
│   └── _components/product-list-client.tsx  # ヘッダーに /recipes リンクあり
└── meal-plans/                     # ★ 存在しない（未着手）

apps/web/src/server/routes/meal-plans.ts     # API 5 本実装済み（変更しない）
packages/api-contract/src/meal-plan.schema.ts # 契約実装済み（変更しない）
```

確立済みの先例パターン（本設計はこれを踏襲する）:

- 一覧初期表示: Server Component が UseCase を手動 DI で直呼び → Client Component に初期値を渡す
  （`recipes/page.tsx`）
- 書き込み: Client Component から素の Hono RPC（`client.api...`）→ 成功後 `router.refresh()` /
  `router.push()`（recipe-edit-screen 設計 / recipe-detail-client）
- `export const dynamic = 'force-dynamic'` を SSR ページへ付与

## 変更後構成

```
apps/web/src/app/meal-plans/
├── page.tsx                              # 新規: 献立作成画面（Server Component）
├── history/
│   └── page.tsx                          # 新規: 履歴ビュー（Server Component のみ・Client なし）
├── _components/
│   ├── meal-plan-client.tsx              # 新規: 今週の献立の表示・作成・追加・削除（Client）
│   ├── planned-recipe-item.tsx           # 新規: 献立内レシピ 1 行（名前/削除済み・倍量・削除ボタン）
│   ├── recipe-picker.tsx                 # 新規: レシピ選択（検索絞り込み + 倍量プリセット + 追加）
│   └── history-week-card.tsx             # 新規: 履歴の週カード（純粋表示・Server/RTL 両用）
└── _utils/
    └── meal-plan-view.ts                 # 新規: formatWeekRange / buildRecipeNameMap

apps/web/src/app/recipes/_components/recipe-list-client.tsx    # 変更: ヘッダーに「献立」リンク追加
apps/web/src/app/products/_components/product-list-client.tsx  # 変更: ヘッダーに「献立」リンク追加
```

## データフロー

### 初期表示（献立作成画面）

```
ブラウザ → /meal-plans
  → meal-plans/page.tsx (Server Component, force-dynamic)
      → Promise.all([
          GetCurrentMealPlanUseCase.execute(),   # 手動 DI: DrizzleMealPlanRepository
          GetRecipesUseCase.execute(),           # 手動 DI: DrizzleRecipeRepository
        ])
      → currentWeekIdentifier = WeekIdentifier.current().toString()
  → <MealPlanClient mealPlan={dto|null} recipes={recipes}
                    currentWeekIdentifier={currentWeekIdentifier} />
      → recipeId→名前 Map を buildRecipeNameMap(recipes) で構築
```

### 献立作成（未作成時のみ）

```
「今週の献立をはじめる」押下
  → client.api['meal-plans'].$post({ json: { weekIdentifier: currentWeekIdentifier } })
      → POST /api/meal-plans（冪等・C-3。二重押下・リトライ安全）
  → 成功: router.refresh()（Server Component 再実行 → mealPlan props 更新）
  → 失敗: errorMessage 表示
```

### レシピ追加

```
[レシピを追加] → recipe-picker 展開
  → 検索テキストで recipes を絞り込み（recipe-list-client の検索パターン踏襲）
  → レシピ選択 → 倍量プリセット選択（デフォルト 1×）→ [献立に追加]
  → client.api['meal-plans'][':id'].recipes.$post({
      param: { id: mealPlan.id }, json: { recipeId, scaleFactor } })
  → 成功: router.refresh()。picker は開いたまま（連続追加できるように）
  → 失敗: errorMessage 表示
```

### レシピ削除（確認ダイアログなし・D-3）

```
献立項目の削除ボタン押下
  → client.api['meal-plans'][':id'].recipes[':plannedRecipeId'].$delete({ param: {...} })
  → 成功: router.refresh() / 失敗: errorMessage 表示
```

### 履歴表示

```
ブラウザ → /meal-plans/history?limit=4（省略時 4。1〜12 に clamp、不正値は 4）
  → history/page.tsx (Server Component, force-dynamic)
      → Promise.all([GetMealPlanHistoryUseCase.execute({ limit }), GetRecipesUseCase.execute()])
      → WeekIdentifier.current().toString() と一致する週に「今週」ラベル
  → <HistoryWeekCard> を週ごとに列挙（サーバーレンダリングのみ・操作なし）
  → 取得件数 === limit かつ limit < 12 のとき
     「さらに表示」リンク → /meal-plans/history?limit=min(limit+4, 12)
```

## API 設計

**変更なし。** 既存の 5 エンドポイントをそのまま使用する
（正本: `packages/api-contract/src/meal-plan.schema.ts`）。

| 用途                            | エンドポイント                                        | 画面での使い方                                                                                 |
| ------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 現在週の取得                    | `GET /api/meal-plans/current`                         | Server Component 直呼び（UseCase 経由）。`{ data: MealPlanDto \| null }`・null でも 200（D-4） |
| 献立作成                        | `POST /api/meal-plans`                                | RPC。`{ weekIdentifier: "YYYY-MM-DD" }`。冪等（C-3）                                           |
| レシピ追加                      | `POST /api/meal-plans/:id/recipes`                    | RPC。`{ recipeId, scaleFactor }`。201 + PlannedRecipeDto                                       |
| レシピ削除                      | `DELETE /api/meal-plans/:id/recipes/:plannedRecipeId` | RPC。204                                                                                       |
| 履歴取得                        | `GET /api/meal-plans/history?limit=`                  | Server Component 直呼び（UseCase 経由）。default 4 / max 12                                    |
| レシピ一覧（名前解決・選択 UI） | `GET /api/recipes` 相当                               | Server Component 直呼び（GetRecipesUseCase）                                                   |

- `PlannedRecipeDto` は `recipeId` のみで `recipeName` を持たない（D-7 確定）。名前解決は S-5 のとおり画面側の Map で行う。
- Hono RPC の呼び出し形は `client.api['meal-plans']...`（`app.ts` の `basePath('/api')` 済み `AppType` を `import type`）。

## DB 設計

変更なし。

## フロントエンド設計

### `meal-plans/page.tsx`（Server Component）

- `export const dynamic = 'force-dynamic'`。
- 手動 DI で `GetCurrentMealPlanUseCase`（DrizzleMealPlanRepository）と
  `GetRecipesUseCase`（DrizzleRecipeRepository）を組み立て、`Promise.all` で並列実行する。
- `WeekIdentifier.current().toString()` で現在週の識別子を算出し、Client へ props で渡す（D-5）。
- try/catch はしない（recipes 先例どおり。DB 障害は Next.js のエラーバウンダリに委ねる）。

### `_components/meal-plan-client.tsx`（Client Component）

- `'use client'`。Props: `{ mealPlan: MealPlanDto | null, recipes: RecipeDto[], currentWeekIdentifier: string }`。
- **MealPlan データはローカル state に持たない**。props をそのまま描画し、変更系の成功後は
  `router.refresh()` で Server Component を再実行して最新 props を受け取る
  （single source of truth をサーバー側に保つ。楽観的更新は採用しない — recipe-edit-screen と同判断）。
- ローカル state は UI 状態のみ: `submitting`（操作中の多重発火防止・ボタン disable）、
  `errorMessage: string | null`、picker の開閉、picker 内の選択レシピ・選択倍量、検索テキスト。
- 表示分岐:
  - `mealPlan === null` → 空状態カード（「今週の献立はまだありません」）+「今週の献立をはじめる」ボタン。
  - `mealPlan` あり → 週表示（`formatWeekRange`）+ 献立リスト + [レシピを追加]。
  - `plannedRecipes` が 0 件 → 「レシピがまだ追加されていません」の空状態文言。
- ヘッダーは recipes / products 一覧と同構造（タイトル「今週の献立」+ 「レシピ」「商品」「履歴」リンク）。

### `_components/planned-recipe-item.tsx`

- Props: `{ plannedRecipe: PlannedRecipeDto, recipeName: string | null, onRemove: (plannedRecipeId: string) => void, submitting: boolean }`。
- `recipeName !== null` → レシピ名 + `/recipes/[id]` への詳細リンク。
- `recipeName === null` → 「削除済みレシピ」を muted トークンでグレーアウト表示・リンクなし（S-4 / C-4）。
- 倍量は「2×」「1.5×」形式のバッジ表示。削除ボタン（X アイコン・`aria-label="献立から削除"`）は
  削除済みレシピでも有効（S-4）。

### `_components/recipe-picker.tsx`

- Props: `{ recipes: RecipeDto[], onAdd: (recipeId: string, scaleFactor: number) => void, submitting: boolean }`。
- 検索入力（名前部分一致。recipe-list-client の絞り込みパターン踏襲）→ レシピ行タップで選択 →
  倍量プリセット（1× / 1.5× / 2× / 3× のトグルボタン、デフォルト 1×）→ [献立に追加]。
- 追加後も picker は開いたまま・選択状態のみリセット（土曜の連続追加運用に合わせる）。
- 同一レシピの複数回追加は API 仕様どおり許容（別 PlannedRecipeId で追加される。要件書 B-10）。

### `history/page.tsx`（Server Component のみ・D-4）

- `export const dynamic = 'force-dynamic'`。Client Component を持たない（閲覧のみ）。
- `searchParams` から `limit` を読み、整数化 → 1〜12 に clamp、不正値・省略時は 4。
- `GetMealPlanHistoryUseCase.execute({ limit })` + `GetRecipesUseCase.execute()` を並列実行。
- 週ごとに `<HistoryWeekCard>` を列挙。0 件時は「履歴はまだありません」。
- 「さらに表示」は `<Link href="/meal-plans/history?limit=N">`（取得件数 === limit かつ limit < 12 のときのみ）。
- ヘッダーに `/meal-plans` への戻りリンク。

### `_components/history-week-card.tsx`

- 純粋表示コンポーネント（`'use client'` なし。Server からも RTL からも使える）。
- Props: `{ mealPlan: MealPlanDto, recipeNameMap: Map<string, string>, isCurrentWeek: boolean }`。
- 週表示（`formatWeekRange`）+ `isCurrentWeek` なら「今週」ラベル + レシピ名（倍量付き）の列挙。
  削除済みは「削除済みレシピ」表示。レシピ 0 件の週は「レシピなし」。
- ステータスバッジは表示しない（D-2）。

### `_utils/meal-plan-view.ts`

```typescript
// weekIdentifier "2026-07-04" → 「7/4（土）〜7/10（金）」
// Date 構築は new Date(value + 'T00:00:00')（ローカルタイム規約。meal-plan-core 設計 4-6 と同一）
export function formatWeekRange(weekIdentifier: string): string;

// Map に無い recipeId = 削除済みと判定（S-5）
export function buildRecipeNameMap(recipes: RecipeDto[]): Map<string, string>;
```

### 導線の追加（S-8）

- `recipe-list-client.tsx`: ヘッダーの `/products` リンクの並びに `/meal-plans`「献立」リンクを追加。
- `product-list-client.tsx`: 同様に「献立」リンクを追加。
- 既存リンクと同じ見た目（既存の `Link` + クラス構成を踏襲）。変更は各ファイル数行のみ。

### ビジュアル

- 既存のセマンティックトークン（`bg-background` / `text-foreground` / `text-muted-foreground` /
  `border` / `primary` 系）のみ使用。`zinc-*` 等の直接色指定・新規トークン追加はしない。
- shadcn/ui の既存コンポーネント（Button / Input）と lucide-react アイコンを流用。新規 UI 基盤は導入しない。

## バックエンド設計

変更なし。既存の Hono ルート（`apps/web/src/server/routes/meal-plans.ts`）・UseCase・Repository を
そのまま使用する。手動 DI の組み立ては Server Component（初期表示）と既存 Hono ルート（RPC 経由の
書き込み）が担う。

## エラー処理

外部 API / 外部ストレージへの I/O は含まない（DB は既存接続のみ）ため、リトライ・タイムアウト等の
5 項目は対象外。画面のエラーハンドリングは以下のとおり。

| エラー種別                             | 発生箇所                 | 処理                                                                                          |
| -------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| DB 障害（初期表示）                    | Server Component         | try/catch せず Next.js エラーバウンダリへ（recipes 先例どおり）                               |
| 作成/追加/削除の失敗（`!response.ok`） | Client（RPC 呼び出し後） | `errorMessage` に「操作に失敗しました。」表示。画面状態は維持                                 |
| ネットワークエラー                     | Client（catch）          | `errorMessage` に「通信エラーが発生しました。」表示                                           |
| 404（MealPlan / PlannedRecipe 消失）   | サーバー（既存 onError） | 上記「操作に失敗しました。」に合流。`router.refresh()` で実態と再同期                         |
| 422（InvalidMealPlanState）            | サーバー（既存 onError） | Sprint 3 では遷移 API 非公開のため実質発生しない。発生時も上記に合流                          |
| 入力バリデーション                     | —                        | 入力は選択式のみ（検索テキストは絞り込み用途）で、クライアント検証は不要。サーバー側 Zod が正 |

冪等性: 作成は API 側で冪等（C-3）のため、二重送信ガードは `submitting` フラグの UX 目的のみ。

## ログと監視

対象外（MVP1 方針どおり）。サーバー側エラーは既存の `app.onError` の `console.error` に委ねる。

## セキュリティ

- 認証なしは MVP1 の既存前提と同じ（本機能で状況は変わらない）。
- 書き込み入力はすべて既存の Zod 契約（`meal-plan.schema.ts`）でサーバー側検証される。
  倍量はプリセット選択のみでクライアント任意値を送らない。
- 表示文字列（レシピ名等）は React の標準エスケープに委ねる。`dangerouslySetInnerHTML` は使用しない。

## 性能

- 初期表示の UseCase 2 本（current + recipes / history + recipes）は `Promise.all` で並列実行する。
- `GetRecipesUseCase` は ingredients / steps を含む全件を返すため、レシピ件数が増えると
  ペイロードが太る。MVP1 の個人利用規模（数十件）では許容。将来問題になれば名前のみの軽量一覧
  DTO を検討する（スコープ外の気づきとして記録）。
- 楽観的更新は採用せず `router.refresh()` の再取得に統一（データ量が小さく、確実性を優先）。

## テスト方針

apps/web のテスト基盤（Vitest + RTL、Hono ルートテスト）は導入済み（2026-07-01 PR #21）。
詳細な試験計画は実装フェーズ開始時に test-designer が `docs/tests/meal-plan-screens.md` を作成する。
本設計から引き継ぐ観点:

- **RTL（Client / 純粋コンポーネント）**
  - meal-plan-client: 未作成時に作成ボタンが出る / 押下で POST が呼ばれる / mealPlan ありで週表示と
    献立リストが出る / 追加・削除で対応する RPC が呼ばれる / 失敗時に errorMessage が表示される
  - planned-recipe-item: 名前解決あり（リンクあり）/ なし（「削除済みレシピ」・リンクなし・削除は可）
  - recipe-picker: 検索絞り込み / 倍量プリセットのデフォルト 1× / onAdd に選択値が渡る
  - history-week-card: 週表示・「今週」ラベル・削除済み表示・レシピ 0 件表示
- **ユーティリティ単体**: formatWeekRange（通常週・年またぎ週 2026-12-26〜2027-01-01・曜日表記）、
  buildRecipeNameMap
- **API ルートテスト**: 既存 `meal-plans.test.ts` で担保済み（変更なし・追加不要）
- **実画面確認**: manual-browser-verify スキルで確認（トークン適用・レスポンシブ・導線リンク。
  Codex 委譲時は review-codex-implementation の Tailwind タイポ検査が必須）
- **E2E smoke**: 既存 Playwright smoke への `/meal-plans` 表示追加は test-designer 判断

## 移行とリリース

- DB スキーマ変更・マイグレーションなし。既存データへの影響なし。
- API・契約の変更なし（後方互換性の論点なし）。
- Vercel へのデプロイのみで完結。

## リスク

| リスク                                                                                         | 影響                                                 | 対策                                                                                                      |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `currentWeekIdentifier` props の鮮度（金曜深夜に開いたまま土曜に作成ボタンを押すと前週で作成） | 前週の MealPlan が作られる（冪等なので重複はしない） | 発生頻度が極小のため MVP では許容。`router.refresh()` 後は正しい週に再計算される。気づきとして記録        |
| 「一覧に無い recipeId = 削除済み」判定が GetRecipes の全件取得前提                             | 将来レシピ一覧にページングを入れると誤判定           | 現実装は全件返却で問題なし。ページング導入時に名前解決 API の再設計が必要な旨を本書に明記（この行が記録） |
| `router.refresh()` 完了まで旧表示が残る（楽観的更新なし）                                      | 追加・削除の反映に体感ラグ                           | `submitting` でボタン disable + ローディング表示。個人利用のデータ量では十分小さい                        |
| 週表示フォーマットのタイムゾーンずれ                                                           | 週範囲が 1 日ずれて表示                              | `new Date(value + 'T00:00:00')` のローカルタイム規約を meal-plan-core 設計 4-6 と揃え、単体テストで固定   |
| 既存 2 ファイル（recipes / products の一覧ヘッダー）への変更                                   | 既存画面の回帰                                       | 変更はリンク 1 個の追加のみ。RTL の既存テスト（product-list-client.test.tsx）が回帰を検知                 |

## 未決事項

1. **実装ルート**（ユーザー確認待ち）: 推奨は **Codex 委譲**。
   理由: 設計判断が全件確定済みで、確立済み先例パターン（SC 直呼び + 素の RPC + トークン）の
   定型実装比重が高く「指示書に書き切れる」（docs/06-ai-tools.md の判断目安）。Sprint 1〜2 の
   画面実装・Unit A（01〜05）と同ルートで、コスト面でも有利。
   受け入れは review-codex-implementation スキル（Tailwind タイポ等の機械検出 + 実画面確認）で行う。
   代替: 対話的に細部を詰めたい場合は Orchestrator / implementer ルート（recipe-edit-screen 実績）。
2. 上記以外の設計判断はすべて確定済み（S-1〜S-8 ユーザー確定、D-1〜D-5 設計者判断）。
   実装中に本設計から逸脱が必要になった場合は独断で変えず Orchestrator へ差し戻す。
