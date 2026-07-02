# 要件定義: MealPlan 献立作成（Sprint 3）

- task-id / 変更レベル: Sprint 3 / L3
- 作成日: 2026-07-02

---

## 背景

Sprint 2（Product マスタ + 価格履歴）が 2026-07-01 にクローズ。
Sprint 3 ではプロジェクトの中核ユースケース「土曜日に今週の献立を決めるフロー」を実装する。
MealPlan 集約は ShoppingList（Sprint 4）の起点であり、買い物リスト自動生成の前提となる。
現在 `packages/domain/src/meal-plan/` ディレクトリは空であり、`WeekIdentifier` も未実装。
全コンポーネントを新規実装する。

## 目的

「1週間分の献立を画面で組み立てられる」「過去4週間の献立を遡れる」を実現し、
土曜日の献立決定フローがアプリで完結できる状態にする（docs/05-roadmap.md Sprint 3 節より）。

## ユーザー要求（原文の要約）

- ゴール:「土曜日に『今週の献立』を決めるフローがアプリで完結する」
- 完了条件（ロードマップ）:
  1. 1週間分の献立を画面で組み立てられる
  2. 過去4週間の献立を遡れる
- 実運用（docs/01-overview.md より）: 土曜日に2人で相談して今週作る料理を選ぶ。
  平日はビュッフェ方式で消費するため、日付とレシピを1:1で固定しない運用が前提。
- 「倍量設定」: 各レシピをレシピ本来の人数（baseServings）の何倍で作るかを指定できる（scaleFactor）。
- 「任意の日付指定」: 画面の「任意の日付指定」の解釈は未決事項 U9 を参照。

---

## 機能要件

### UseCase 一覧と入出力・制約

#### CreateMealPlanUseCase

| 項目 | 内容 |
|---|---|
| Input | `weekOf?: { year: number; weekNumber: number }`（省略時は WeekIdentifier.current() で「今週」を採用） |
| Output | `MealPlanDto` |
| 前提 | 同一 weekYear/weekNumber の MealPlan が存在しない（→ 重複時の挙動は未決 U2） |
| バリデーション | weekNumber は 1〜53 の整数。year は正の整数。 |
| ドメイン操作 | `MealPlan.create(weekOf)` → `MealPlanRepository.save()` |
| エラー | 重複時の挙動は未決 U2（エラーまたはべき等返却） |

#### AddRecipeToMealPlanUseCase

| 項目 | 内容 |
|---|---|
| Input | `mealPlanId: string`, `recipeId: string`, `scaleFactor?: number`（省略時 = 1） |
| Output | `MealPlanDto`（更新後の MealPlan 全体） |
| 前提 | 対象 MealPlan が存在し status が `draft` であること。対象 Recipe が存在すること。 |
| バリデーション | `scaleFactor > 0`（数値制約は未決 U8）。UUID 形式チェックは Hono ルート層で行う。 |
| ドメイン操作 | `MealPlanRepository.findById()` → `RecipeRepository.findById()`（存在確認）→ `mealPlan.addRecipe(recipeId, scaleFactor)` → `MealPlanRepository.save()` |
| エラー | MealPlan 不存在: `MealPlanNotFoundError` → 404。Recipe 不存在: `RecipeNotFoundError` → 404。status が `draft` 以外: ドメイン例外 → 422 |

注: docs/04-domain-model.md では `draft` および `shopping` でレシピ追加を許容しているが、
Sprint 3 スコープでは `draft` のみを対象とする（→ 未決 U3）。

#### RemoveRecipeFromMealPlanUseCase

| 項目 | 内容 |
|---|---|
| Input | `mealPlanId: string`, `plannedRecipeId: string` |
| Output | `MealPlanDto`（更新後の MealPlan 全体） |
| 前提 | 対象 MealPlan が存在し status が `draft` であること。対象 PlannedRecipe が MealPlan 内に存在すること。 |
| バリデーション | UUID 形式チェックは Hono ルート層で行う。 |
| ドメイン操作 | `MealPlanRepository.findById()` → `mealPlan.removeRecipe(plannedRecipeId)` → `MealPlanRepository.save()` |
| エラー | MealPlan 不存在: `MealPlanNotFoundError` → 404。PlannedRecipe 不存在: ドメイン例外 → 422 |

#### GetCurrentMealPlanUseCase

| 項目 | 内容 |
|---|---|
| Input | なし（WeekIdentifier.current() で今週を自動算出） |
| Output | `MealPlanDto \| null` |
| 前提 | なし（今週の MealPlan がなければ null を返す） |
| バリデーション | なし |
| ドメイン操作 | `MealPlanRepository.findByWeek(WeekIdentifier.current())` |
| エラー | なし |

#### GetMealPlanHistoryUseCase

| 項目 | 内容 |
|---|---|
| Input | `limit?: number`（省略時 = 4。過去4週分が完了条件） |
| Output | `MealPlanDto[]`（週の降順。最新が先頭。今週のプランも含む） |
| 前提 | なし（0件の場合は空配列） |
| バリデーション | `limit` は正の整数、上限は未決 U4 |
| ドメイン操作 | `MealPlanRepository.findRecent(limit)` |
| エラー | なし |

### MealPlanDto の構造

```typescript
interface PlannedRecipeDto {
  id: string;                   // PlannedRecipeId の文字列値
  recipeId: string;             // RecipeId（集約間 ID 参照）
  recipeName: string;           // Recipe.name（UseCase が解決。未決 U5）
  scaleFactor: number;          // 倍量（正の実数）
  scheduledDate: string | null; // ISO 8601 date（例: "2026-07-05"）。nullable（ビュッフェ方式対応）
  cookedAt: string | null;      // ISO 8601 datetime。Sprint 3 では常に null
  notes: string;
}

interface MealPlanDto {
  id: string;
  weekYear: number;
  weekNumber: number;
  weekLabel: string;            // 表示用文字列（例: "2026-W27"）
  status: MealPlanStatus;       // Sprint 3 では常に 'draft'
  plannedRecipes: PlannedRecipeDto[];
  createdAt: string;            // ISO 8601 datetime
  completedAt: string | null;
}

type MealPlanStatus = 'draft' | 'shopping' | 'cooking' | 'consuming' | 'completed';
```

### API エンドポイント一覧

| メソッド | パス | UseCase | 説明 |
|---|---|---|---|
| POST | `/api/meal-plans` | CreateMealPlanUseCase | 献立作成 |
| GET | `/api/meal-plans/current` | GetCurrentMealPlanUseCase | 今週の献立取得 |
| GET | `/api/meal-plans/history` | GetMealPlanHistoryUseCase | 過去の献立一覧（?limit=4） |
| POST | `/api/meal-plans/:id/recipes` | AddRecipeToMealPlanUseCase | レシピ追加 |
| DELETE | `/api/meal-plans/:id/recipes/:plannedRecipeId` | RemoveRecipeFromMealPlanUseCase | レシピ削除 |

注: `/current` を静的ルートとし、`/:id` の動的ルートより先に登録する必要がある（Hono のルーティング順）。

### 画面構成

| 画面 | パス | 初期データ取得 | ミューテーション |
|---|---|---|---|
| 献立作成（今週） | `/meal-plans` | Server Component（GetCurrentMealPlanUseCase 直接呼び出し）+ レシピ一覧（GetRecipesUseCase） | Hono RPC POST/DELETE |
| 過去の献立履歴 | `/meal-plans/history` | Server Component（GetMealPlanHistoryUseCase 直接呼び出し） | なし（読み取り専用） |

初期データ取得は presentation-layer.md の方針に従い、Server Component で直接 UseCase を呼ぶ。
追加・削除は Client Component から Hono RPC 経由で行う。

---

## 非機能要件

- パフォーマンス: 2名利用・週1回作成。MealPlan 数は年間約50件。PlannedRecipe は1プランあたり最大10件程度。特別な最適化不要。
- タイムゾーン: WeekIdentifier の「今週」算出はサーバーサイドで JST 基準とする（詳細は未決 U6）。
- データ保全: MealPlan は Sprint 3 では削除機能を提供しない（履歴参照のため全件保持）。
- 型安全性: Hono RPC による型安全な呼び出しを維持する（AppType 経由）。

---

## 正常系

| No | ケース | 確認内容 |
|---|---|---|
| N1 | CreateMealPlanUseCase — weekOf 省略（今週） | status=draft、今週の weekYear/weekNumber を持つ MealPlanDto が返る |
| N2 | CreateMealPlanUseCase — weekOf 指定（先週） | 指定週の weekYear/weekNumber を持つ MealPlanDto が返る |
| N3 | AddRecipeToMealPlanUseCase — scaleFactor=1（省略） | PlannedRecipe が追加され、MealPlanDto.plannedRecipes に含まれる |
| N4 | AddRecipeToMealPlanUseCase — scaleFactor=2（倍量） | scaleFactor=2 の PlannedRecipe が追加される |
| N5 | AddRecipeToMealPlanUseCase — scaleFactor=0.5（半量） | scaleFactor=0.5 の PlannedRecipe が追加される |
| N6 | AddRecipeToMealPlanUseCase — 同一レシピを2回追加 | PlannedRecipe が2件追加される（同一レシピの重複は許容） |
| N7 | RemoveRecipeFromMealPlanUseCase — 存在する plannedRecipeId | 対象 PlannedRecipe が削除され、MealPlanDto.plannedRecipes に含まれなくなる |
| N8 | GetCurrentMealPlanUseCase — 今週のプランが存在する | MealPlanDto が返る |
| N9 | GetCurrentMealPlanUseCase — 今週のプランが存在しない | null が返る |
| N10 | GetMealPlanHistoryUseCase — limit=4、プランが4件以上ある | 最大4件が weekYear/weekNumber の降順で返る |
| N11 | GetMealPlanHistoryUseCase — プランが0件 | 空配列 [] が返る |
| N12 | GetMealPlanHistoryUseCase — プランが2件（limit=4 未満） | 存在する2件が返る |

---

## 異常系

| No | ケース | 期待される挙動 |
|---|---|---|
| E1 | CreateMealPlanUseCase — 同一週に既存 MealPlan | 未決 U2 の判断による（エラーまたはべき等返却） |
| E2 | AddRecipeToMealPlanUseCase — 存在しない mealPlanId | MealPlanNotFoundError → 404 |
| E3 | AddRecipeToMealPlanUseCase — 存在しない recipeId | RecipeNotFoundError → 404 |
| E4 | AddRecipeToMealPlanUseCase — status が draft 以外 | ドメイン例外 → HTTP 422 Unprocessable Entity |
| E5 | AddRecipeToMealPlanUseCase — scaleFactor=0 | Zod バリデーションエラー → 400 Bad Request |
| E6 | AddRecipeToMealPlanUseCase — scaleFactor が負値 | Zod バリデーションエラー → 400 Bad Request |
| E7 | RemoveRecipeFromMealPlanUseCase — 存在しない mealPlanId | MealPlanNotFoundError → 404 |
| E8 | RemoveRecipeFromMealPlanUseCase — 存在しない plannedRecipeId（MealPlan 内） | ドメイン例外 → 422 |
| E9 | RemoveRecipeFromMealPlanUseCase — status が draft 以外 | 未決 U3 の判断による |
| E10 | CreateMealPlanUseCase — weekNumber が 0 または 54 以上 | Zod バリデーションエラー → 400 |
| E11 | GET /api/meal-plans/:id/recipes/:plannedRecipeId — id が UUID 形式でない | Zod param バリデーションエラー → 400 |

---

## 境界条件

| No | ケース | 確認内容 |
|---|---|---|
| B1 | plannedRecipes が 0件の MealPlan | GetCurrentMealPlanUseCase は空の plannedRecipes=[] を持つ MealPlanDto を返す |
| B2 | scaleFactor の最小正値（例: 0.1） | PlannedRecipe.create() が成功し scaleFactor が正確に保持される |
| B3 | scaleFactor の整数境界（1.0） | 浮動小数点として保存・復元しても 1.0 が維持される |
| B4 | 同一レシピを複数回 AddRecipe | 各 PlannedRecipe は別 ID を持ち、独立して削除できる |
| B5 | GetMealPlanHistoryUseCase limit=1 | 直近1件（weekYear/weekNumber が最大のもの）のみ返る |
| B6 | WeekIdentifier.current() の週境界（土曜日 23:59 と翌日 00:00） | 週定義（未決 U6）に応じて正しい weekNumber が算出される |
| B7 | WeekIdentifier の年末年始（例: 2026-12-27 〜 2027-01-02） | 年をまたぐ週番号算出が正しく処理される |
| B8 | Recipe が削除された後の PlannedRecipe | planned_recipes テーブルの FK 制約（未決 U10）の挙動による |
| B9 | MealPlan の plannedRecipes が 10件（想定最大） | 問題なく全件を MealPlanDto に含める |

---

## 前提

- Sprint 1（Recipe CRUD）・Sprint 2（Product マスタ）が完了済み。`RecipeId`・`RecipeRepository` が実装済み。
- `WeekIdentifier` は `packages/domain/src/shared/week-identifier.ts` に存在しない（新規実装が必要）。
- MealPlan 集約全体が未実装（`packages/domain/src/meal-plan/` は空ディレクトリ）。
- `packages/api-contract/src/meal-plan.schema.ts` は存在しない。
- MealPlan → Recipe 参照は RecipeId による ID 参照のみ（RecipeIngredient の `productRef` と同様のパターン）。
- PlannedRecipe 内の `scaleFactor` が倍量を管理する（Recipe 集約は変更しない）。
- `scheduledDate` は nullable（ビュッフェ運用と日付指定運用の両方を同一モデルで表現）。
- Sprint 3 では MealPlan の status は `draft` のみを扱う。`shopping` 以降への遷移は Sprint 4 で実装。
- テスト基盤:
  - domain: co-located Vitest（`packages/domain/src/**/*.test.ts`）
  - application: co-located Vitest（`packages/application/src/**/*.test.ts`）
  - infrastructure: PGlite + createTestDb（`packages/infrastructure/src/repositories/*.test.ts`）
  - web: `vi.mock` を使った Hono `app.request` テスト（`apps/web/src/server/routes/*.test.ts`）

---

## 制約

- アーキテクチャ制約: 依存方向 `Presentation → Application → Domain ← Infrastructure`。`packages/domain` は他に依存しない。Domain 層に Drizzle / HTTP 型を持ち込まない。
- Entity パターン: `static create()` / `static reconstruct()` を必ず使い分ける。
- UseCase: 1クラス・`execute()` のみ。手動 DI（コンストラクタ注入）。DI 組み立ては呼び出し側（Hono ルート / Server Component）で行う。
- コーディング規約: `any` 禁止、default export 禁止、`import type`（型のみ）、`null` 統一、`===`/`!==`。
- Recipe 集約への変更は行わない。
- Product 集約への変更は行わない。
- `packages/domain/src/shared/unit.ts` / `money.ts` / `quantity.ts` / `store.ts` の変更は行わない。

---

## 対象範囲

### 新規作成ファイル

**packages/domain/src/shared/**
- `week-identifier.ts` — WeekIdentifier 値オブジェクト（year, weekNumber, fromDate, current, startDate, endDate, next, previous, toString, equals）
- `week-identifier.test.ts` — WeekIdentifier テスト（週境界・年末年始・JST 対応）

**packages/domain/src/meal-plan/**
- `meal-plan-id.ts` — MealPlanId 値オブジェクト（RecipeId パターン踏襲: generate / fromString / equals / value）
- `planned-recipe-id.ts` — PlannedRecipeId 値オブジェクト（同上）
- `meal-plan.ts` — MealPlan 集約（create / reconstruct / addRecipe / removeRecipe / transitionTo / canTransitionTo）+ PlannedRecipe 値オブジェクト + MealPlanStatus 型
- `meal-plan.repository.ts` — MealPlanRepository インターフェース（findById / findByWeek / findRecent / save）
- `meal-plan-id.test.ts` — MealPlanId テスト
- `meal-plan.test.ts` — MealPlan 集約テスト（ステータス遷移・addRecipe・removeRecipe・境界条件）

**packages/application/src/meal-plan/**
- `meal-plan.dto.ts` — MealPlanDto / PlannedRecipeDto / CreateMealPlanInputDto / AddRecipeInputDto / RemoveRecipeInputDto
- `meal-plan.mapper.ts` — Entity ↔ DTO 変換（`toMealPlanDto` 等の純関数）
- `meal-plan-not-found.error.ts` — MealPlanNotFoundError（RecipeNotFoundError パターン踏襲）
- `create-meal-plan.use-case.ts`
- `add-recipe-to-meal-plan.use-case.ts`
- `remove-recipe-from-meal-plan.use-case.ts`
- `get-current-meal-plan.use-case.ts`
- `get-meal-plan-history.use-case.ts`
- `index.ts`
- `meal-plan-use-cases.test.ts` — UseCase 単体テスト（co-located Vitest、mock Repository）

**packages/infrastructure/src/repositories/**
- `drizzle-meal-plan.repository.ts` — DrizzleMealPlanRepository（findById / findByWeek / findRecent / save）
- `drizzle-meal-plan.repository.test.ts` — PGlite ベーステスト

**packages/api-contract/src/**
- `meal-plan.schema.ts` — Zod スキーマ（createMealPlanSchema / addRecipeToMealPlanSchema / weekIdentifierSchema）

**apps/web/src/server/routes/**
- `meal-plans.ts` — Hono ルート（recipesRoute / productsRoute パターン踏襲）

**apps/web/src/app/(app)/meal-plans/**
- `page.tsx` — 献立作成画面 Server Component（今週の献立 + レシピ一覧の初期取得）
- `_components/meal-plan-client.tsx` — Client Component（レシピ選択・追加・削除・倍量設定）
- `history/page.tsx` — 過去の献立履歴 Server Component
- `_components/history-client.tsx` — Client Component（過去4週分リスト表示）

### 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `packages/infrastructure/src/db/schema.ts` | `meal_plans` テーブル・`planned_recipes` テーブルを追加 |
| `packages/infrastructure/src/testing/create-test-db.ts` | 新テーブル2件分の DDL を追加（schema.ts と機械的に対応） |
| `packages/application/src/index.ts` | `export * from './meal-plan';` を追加 |
| `packages/infrastructure/src/index.ts` | `DrizzleMealPlanRepository` の re-export を追加 |
| `packages/api-contract/src/index.ts` | `export * from './meal-plan.schema';` を追加 |
| `apps/web/src/server/app.ts` | `mealPlansRoute` の `.route('/meal-plans', mealPlansRoute)` 登録・`MealPlanNotFoundError` の `onError` ハンドリングを追加 |

### DB スキーマ方針（論点）

`planned_recipes` は JSONB ではなく別テーブルを推奨する（→ 未決 U7）。

**meal_plans テーブル（案）**

```
id            text      PRIMARY KEY
week_year     integer   NOT NULL
week_number   integer   NOT NULL
status        text      NOT NULL DEFAULT 'draft'
created_at    timestamp NOT NULL DEFAULT now()
completed_at  timestamp NULL
UNIQUE (week_year, week_number)
```

**planned_recipes テーブル（案）**

```
id              text      PRIMARY KEY
meal_plan_id    text      NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE
recipe_id       text      NOT NULL REFERENCES recipes(id) ON DELETE RESTRICT  ← 未決 U10
scale_factor    numeric(10,3) NOT NULL DEFAULT 1
scheduled_date  date      NULL
cooked_at       timestamp NULL
notes           text      NOT NULL DEFAULT ''
created_at      timestamp NOT NULL DEFAULT now()
INDEX (meal_plan_id)
```

---

## 対象外

- MealPlan の status を `shopping` 以降に遷移させる操作（Sprint 4: GenerateShoppingListUseCase でトリガー）
- ShoppingList の生成・Pantry 在庫考慮（Sprint 4/5）
- `markAsCooked()` / `scheduleForDay()` の UseCase 化・API 化（Sprint 3 画面では提供しない）
- MealPlan の削除・アーカイブ機能
- 認証・マルチユーザー対応（MVP1 スコープ外）
- レシピ提案（LLM、Phase 2 以降）
- `UpdateMealPlanUseCase`（タイトル・メモ等のメタ情報更新。そもそもドメインモデルにそのフィールドがない）

---

## 後方互換性・データ移行

- `meal_plans` / `planned_recipes` は新規テーブルのため、既存データへの影響なし。
- 既存テーブル（recipes / stores / products / price_records）のスキーマは変更しない。
- Drizzle マイグレーションの追加が必要（新テーブル2件分）。
- `create-test-db.ts` の DDL 追加は schema.ts の定義と機械的に対応させる（既存の追記パターンを踏襲）。

---

## 受け入れ条件（Definition of Done）

- [ ] 1週間分の献立を画面で組み立てられる（レシピを選択・追加・削除・倍量設定できる）
- [ ] 過去4週間の献立を遡れる（履歴ビューで過去プランのレシピ一覧が見える）
- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` が全通過
- [ ] Domain 層のテスト追加・通過（MealPlan 集約・WeekIdentifier）
- [ ] Application 層のテスト追加・通過（UseCase x5）
- [ ] Infrastructure 層のテスト追加・通過（DrizzleMealPlanRepository on PGlite）
- [ ] Hono ルートの vi.mock テスト追加・通過（meal-plans.ts）
- [ ] Recipe 集約・Product 集約への変更なし（スコープ外変更なし）
- [ ] 設計書（docs/designs/meal-plan.md）・実装計画（docs/implementation-plans/meal-plan.md）が揃っていること

---

## 未決事項（誰に何を確認するか）

| # | 未決事項 | 論点・選択肢 | 推奨案 | 確認先 |
|---|---|---|---|---|
| U1 | 未来の週の MealPlan 作成を許容するか | ロードマップには「任意の日付指定」の記述あり（Sprint 3 タスク4）。今週以外の週（先週・来週）の献立を作成できるか。 | 許容する。過去週・今週・来週（最大2週先）を指定可能にする。先2週を超える未来の週は UI で制限するのが現実的。 | ユーザー |
| U2 | 同一週の MealPlan 重複作成時の挙動 | 既存 MealPlan がある週に CreateMealPlanUseCase を呼んだ場合、エラーにするか、既存を返すか（べき等）。 | 既存を返す（べき等）。土曜に2回操作するなど UI の誤操作で起きやすく、エラーにすると画面が不親切になる。 | ユーザー |
| U3 | status が `draft` 以外の MealPlan へのレシピ追加・削除の許可範囲 | ドメインモデル（docs/04-domain-model.md）では `draft` と `shopping` でレシピ追加を許可している。Sprint 3 では `draft` のみ扱うが、Sprint 4 の ShoppingList 生成後に `shopping` 状態でも追加・削除を許可するか。エラー時の HTTP ステータスは 409 か 422 か。 | Sprint 3 は `draft` のみ許容。`shopping` 以降のドメイン例外は HTTP 422 Unprocessable Entity として返す。Sprint 4 設計時に再検討。 | アーキテクチャ設計者 |
| U4 | GetMealPlanHistoryUseCase の limit 上限値 | limit パラメータの最大値。上限なしだと全件取得になり得る。 | 上限 52（約1年分）。MVP1 は2〜3ヶ月運用なので実質問題なし。Zod スキーマで `z.number().int().positive().max(52)` とする。 | アーキテクチャ設計者 |
| U5 | PlannedRecipeDto に recipeName を含めるか | MealPlanDto.plannedRecipes に `recipeName`（表示用）を含めるか。含める場合、UseCase が RecipeRepository を追加依存として受け取り名前解決する。含めない場合、フロントが GetRecipes 結果とクライアントジョインする。 | 含める。レシピ名は献立画面の必須表示項目であり、サーバー側で解決するほうが Presentation 層がシンプルになる。AddRecipe/RemoveRecipe も更新後 MealPlanDto を返す設計のため一貫性がある。 | アーキテクチャ設計者 |
| U6 | WeekIdentifier の週定義・タイムゾーン | ISO 8601 は月曜始まりだが、実運用は土曜始まり（docs/04-domain-model.md の `startDate()` に「土曜始まり想定」のコメントあり）。ISO 8601 週番号をそのまま使うと週境界が月曜になる矛盾が生じる。サーバーでの JST 処理方針も必要。 | ISO 8601 の週番号は参照しつつ、startDate()/endDate() を土曜〜金曜の7日間として定義する独自週定義を採用する。`WeekIdentifier.fromDate(date)` は JST で「直前の土曜日」を週の起点として算出する。タイムゾーン変換はサーバーサイドで行う。 | ユーザー（運用方針）・アーキテクチャ設計者（実装方針） |
| U7 | planned_recipes のスキーマ方針: 別テーブル vs JSONB | Recipe は ingredients/steps を JSONB で一括保存している。MealPlan の plannedRecipes も同様に JSONB とするか、別テーブルにするか。PlannedRecipe は個別追加・削除・将来的な日付指定更新が必要なため別テーブルが適切と見られる。 | 別テーブル（`planned_recipes`）を強く推奨。理由: (1) 個別 CRUD が必要（AddRecipe/RemoveRecipe を別 UseCase で扱う）、(2) scheduledDate/cookedAt は後続 Sprint で更新される可変フィールド、(3) recipe の JSONB 採用は「ingredients/steps は集約として常に一括置換」という設計前提があるが、planned_recipes は個別操作される。 | アーキテクチャ設計者 |
| U8 | scaleFactor の数値範囲と UI 仕様 | 倍量は正の実数（0.5x, 1x, 2x...）か整数のみか。入力 UI は数値フィールド（自由入力）か、1x/2x/3x のプリセットボタンか。上限値はあるか（例: 最大10倍）。 | 正の実数を許容（0.5倍も有効）。Zod バリデーション: `z.number().positive().max(10)` を推奨。UI はプリセットボタン（1x/2x/3x）＋自由入力の組み合わせが使いやすい。 | ユーザー |
| U9 | 「任意の日付指定」のスコープ | ロードマップ Sprint 3 タスク4に「任意の日付指定」がある。これは (a) 各 PlannedRecipe に曜日・日付を割り当てる機能か、(b) MealPlan 作成時に任意の週を指定する機能か、または両方か。ビュッフェ運用では (a) は任意であり必須でない。 | (b) 任意の週指定（CreateMealPlanUseCase の weekOf パラメータ）を Sprint 3 で実装する。(a) PlannedRecipe の日付割り当て（scheduleForDay UseCase）は Sprint 3 画面では提供せず、ドメイン・DB レベルの nullable フィールドとして保持のみにとどめる。 | ユーザー |
| U10 | planned_recipes テーブルの recipe_id FK 制約 | PlannedRecipe が参照している Recipe が削除されたとき、`ON DELETE RESTRICT`（削除ブロック）か `ON DELETE CASCADE`（PlannedRecipe も削除）か `ON DELETE SET NULL`（nullable 化、ただし recipe_id NOT NULL と矛盾）か。 | `ON DELETE RESTRICT` を推奨。Recipe の削除は献立への参照が残っているうちはブロックする方が安全。UI 側で「この Recipe は献立に使用中です」のメッセージを出すことができる。ただし既存 DeleteRecipeUseCase の挙動変更になるため、画面での対応が必要（→ 設計者判断を要する）。 | アーキテクチャ設計者 |

---

## 参照ファイル（主要なもの）

調査対象として参照した既存実装パターン:

- `/home/user/cookpit/docs/04-domain-model.md` — MealPlan / PlannedRecipe / WeekIdentifier / ステータス遷移の正典仕様
- `/home/user/cookpit/docs/05-roadmap.md` — Sprint 3 タスク・完了条件
- `/home/user/cookpit/docs/01-overview.md` — 実運用フロー（土曜日・ビュッフェ方式）
- `/home/user/cookpit/docs/03-architecture.md` — 層構成・依存方向・DI 方針
- `/home/user/cookpit/packages/domain/src/recipe/recipe.ts` — create/reconstruct パターン
- `/home/user/cookpit/packages/domain/src/recipe/recipe-id.ts` — ID 値オブジェクトパターン
- `/home/user/cookpit/packages/domain/src/shared/quantity.ts` — 値オブジェクトパターン
- `/home/user/cookpit/packages/domain/src/shared/unit.ts` — Unit 型定義（全列挙値）
- `/home/user/cookpit/packages/application/src/recipe/create-recipe.use-case.ts` — UseCase パターン
- `/home/user/cookpit/packages/application/src/recipe/recipe.dto.ts` — DTO パターン
- `/home/user/cookpit/packages/application/src/recipe/recipe.mapper.ts` — Mapper パターン
- `/home/user/cookpit/packages/application/src/recipe/recipe-not-found.error.ts` — NotFoundError パターン
- `/home/user/cookpit/packages/infrastructure/src/db/schema.ts` — Drizzle スキーマ（既存4テーブル）
- `/home/user/cookpit/packages/infrastructure/src/repositories/drizzle-recipe.repository.ts` — Repository 実装（JSONB 変換）
- `/home/user/cookpit/packages/infrastructure/src/repositories/drizzle-product.repository.ts` — Repository 実装（別テーブル JOIN・upsert・stale 削除）
- `/home/user/cookpit/packages/infrastructure/src/testing/create-test-db.ts` — PGlite テスト基盤（DDL 追記パターン）
- `/home/user/cookpit/packages/infrastructure/src/repositories/drizzle-product.repository.test.ts` — Repository テストパターン
- `/home/user/cookpit/packages/api-contract/src/recipe.schema.ts` — Zod スキーマパターン
- `/home/user/cookpit/apps/web/src/server/routes/recipes.ts` — Hono ルートパターン
- `/home/user/cookpit/apps/web/src/server/app.ts` — Hono アプリ・onError（追記対象）
- `/home/user/cookpit/apps/web/src/server/routes/products.test.ts` — Hono ルートテストパターン（vi.mock）
- `/home/user/cookpit/apps/web/src/app/recipes/page.tsx` — Server Component 初期取得パターン
- `/home/user/cookpit/apps/web/src/app/recipes/_components/recipe-list-client.tsx` — Client Component パターン
