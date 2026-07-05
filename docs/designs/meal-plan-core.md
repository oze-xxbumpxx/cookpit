# 設計書: meal-plan-core

- ステータス: 確定（2026-07-05 ユーザー確認完了。C-1〜C-4 は全て推奨案 A で確定）
- レベル: L3
- スプリント: Sprint 3 Unit A
- 関連: `docs/requirements/meal-plan-core.md`（要件定義）、`docs/04-domain-model.md`、`docs/03-architecture.md`

---

## 1. 目的

土曜始まりの週次献立（MealPlan）バックエンド一式を実装する。
ユーザーが週を指定して MealPlan を作成し、Recipe を追加・削除し、現在週の献立と過去の献立履歴を取得できるようにする。
Domain / Application / Infrastructure / API-Contract / Presentation(API) の全層を縦断する L3 実装。画面（UI）は Unit B のスコープ。

---

## 2. スコープ

### 対象

| 層 | 実装対象 |
|---|---|
| Domain | MealPlan 集約、PlannedRecipe（集約内エンティティ）、MealPlanId、PlannedRecipeId、MealPlanStatus、WeekIdentifier（shared/） |
| Infrastructure | `meal_plans` / `planned_recipes` Drizzle スキーマ、マイグレーション、DrizzleMealPlanRepository |
| Application | UseCase 5本（後述）、MealPlanDto / PlannedRecipeDto、MealPlanMapper、エラークラス 3本 |
| API Contract | Zod スキーマの項目一覧（詳細は contract-designer が確定） |
| Presentation (API) | Hono ルート 5本、app.ts へのマウント |

### 対象外

- 画面・UI 実装（Unit B）
- ステータス遷移・markAsCooked・scheduleForDay の API エンドポイント公開（ドメインには実装するが Sprint 3 では非公開）
- Zod スキーマの詳細確定（必須/任意・nullability・エラー形式・契約テスト。contract-designer 担当）
- ShoppingList との連携（Sprint 4 以降）
- プロダクションコードの変更（本書は設計書のみ）

---

## 3. 設計判断サマリ（2026-07-05 ユーザー確認済み・確定）

以下の 4 判断はユーザー確認により**全て案 A（推奨案）で確定**した。

| # | 判断項目 | 案 A | 案 B | 案 C | 確定 | 影響範囲 |
|---|---|---|---|---|---|---|
| **C-1** | WeekIdentifier の内部表現 | 週開始日の `Date`（例: 2026-07-04） | 年 + 独自週番号（例: 2026-27） | — | **案 A（確定）** | DB スキーマ確定に直結。`week_start_date` カラム型・`toString()` の形式・Repository マッピング全体 |
| **C-2** | planned_recipes の正規化方針 | 独立テーブル（JOIN 復元） | meal_plans への JSONB 集約保存 | — | **案 A（確定）** | スキーマ設計の根幹。後からの変更コストが高い |
| **C-3** | 同一週 MealPlan の一意性 / CreateMealPlan の冪等性 | 冪等（既存あれば既存を返す） | 409 エラー（MealPlanAlreadyExistsError） | 複数許容（制約なし） | **案 A（確定）** | DB の UNIQUE 制約有無・UseCase のロジック・GetCurrentMealPlan の語義。ステータスに関わらず冪等で返す |
| **C-4** | 削除済み Recipe を参照する PlannedRecipe の扱い | recipeId のみ保持（UI が「削除済み」と表示） | MealPlan から自動削除（カスケード） | Recipe を論理削除 | **案 A（確定）** | RecipeRepository への依存有無・Domain のクリーン度 |

各確定案の根拠・非採用案とのトレードオフは「セクション 17. 未確定事項」（現在は確定記録として参照）に詳述する。

### 設計細目（D-4〜D-7）

これらは推奨案を設計書に明記し、ユーザー確認を要さない設計者判断として扱う。
ただし別案を選ぶ場合の影響箇所を明記する。

| # | 判断項目 | 推奨案 | 別案との差分（デルタ） |
|---|---|---|---|
| **D-4** | GET /current で MealPlan なし時の HTTP ステータス | `200 + { data: null }` | 204 を選ぶ場合: Hono RPC 型定義が分岐し、フロント側で `response.status` チェックが必要になる |
| **D-5** | GetMealPlanHistoryUseCase の limit 最大値 | max 12（デフォルト 4） | 上限を大きくする場合: findRecent の ORDER BY + LIMIT クエリは変わらないが、LIMIT 値の Zod バリデーション調整のみ |
| **D-6** | scaleFactor の DB 精度 | `numeric(10, 3)` | `numeric(10, 2)` にする場合: PlannedRecipe.create の検証ロジックは変わらず、スキーマとマッピングのみ変更 |
| **D-7** | PlannedRecipeDto に recipeName を含めるか | **含めない**（recipeId のみ） | 含める場合: AddRecipeToMealPlanUseCase に RecipeRepository を追加 DI する。deleted Recipe への対応で null 補完も必要になる |

---

## 4. Domain 設計

### 4-1. ファイル配置

```
packages/domain/src/
├── meal-plan/
│   ├── meal-plan-id.ts          # MealPlanId 値オブジェクト
│   ├── planned-recipe-id.ts     # PlannedRecipeId 値オブジェクト
│   ├── meal-plan.ts             # MealPlan 集約 + PlannedRecipe エンティティ + MealPlanStatus 型
│   └── meal-plan.repository.ts  # MealPlanRepository インターフェース
└── shared/
    └── week-identifier.ts       # WeekIdentifier 値オブジェクト（土曜始まり）
```

### 4-2. MealPlanId / PlannedRecipeId

ProductId パターンを完全に踏襲する。

```
MealPlanId
  private constructor(value: string)
  static generate(): MealPlanId          // randomUUID()
  static fromString(value: string): MealPlanId
  equals(other: MealPlanId): boolean
  get value(): string

PlannedRecipeId  // 同上パターン
```

### 4-3. MealPlanStatus と遷移表

```typescript
export type MealPlanStatus =
  | 'draft'      // 献立検討中（初期状態）
  | 'shopping'   // 買い物中（ShoppingList 生成後。Sprint 4 連動）
  | 'cooking'    // 作り置き中
  | 'consuming'  // 平日消費中
  | 'completed'; // 週終了
```

| 現在 \ 次 | draft | shopping | cooking | consuming | completed |
|---|---|---|---|---|---|
| draft | — | 可 | 不可 | 不可 | 不可 |
| shopping | 可（やり直し） | — | 可 | 不可 | 不可 |
| cooking | 不可 | 不可 | — | 可 | 不可 |
| consuming | 不可 | 不可 | 不可 | — | 可 |
| completed | 不可 | 不可 | 不可 | 不可 | — |

遷移テーブルは `Record<MealPlanStatus, MealPlanStatus[]>` で `canTransitionTo` に閉じ込める。`transitionTo` が `canTransitionTo` を内部呼び出しし、`false` なら `Error` を throw。

### 4-4. PlannedRecipe エンティティ（集約内）

| フィールド | 型 | 不変条件 |
|---|---|---|
| id | PlannedRecipeId | 不変 |
| recipeId | RecipeId | 不変。集約またぎは ID 参照のみ |
| scaleFactor | number | > 0。`create()` 入口で検証。上限なし |
| scheduledDate | Date \| null | null = 日付未指定（ビュッフェ運用のデフォルト） |
| cookedAt | Date \| null | null = 未調理 |
| notes | string | 空文字許容 |

```
PlannedRecipe
  private constructor(...)
  static create(recipeId: RecipeId, scaleFactor: number): PlannedRecipe
    - scaleFactor <= 0 → throw Error('scaleFactor must be positive')
    - id = PlannedRecipeId.generate()、scheduledDate = null、cookedAt = null、notes = ''
  static reconstruct(props: PlannedRecipeProps): PlannedRecipe
    - バリデーション不要、DB 復元専用

  scheduleFor(date: Date): void
  markAsCooked(at: Date): void

  get id(): PlannedRecipeId
  get recipeId(): RecipeId
  get scaleFactor(): number
  get scheduledDate(): Date | null
  get cookedAt(): Date | null
  get notes(): string
```

`import type { RecipeId } from '../recipe/recipe-id'` で同パッケージ内インポート（packages/domain 内部依存のみ、外部パッケージへの依存なし）。

### 4-5. MealPlan 集約

```
MealPlan (集約ルート)
  private constructor(
    id: MealPlanId,
    weekOf: WeekIdentifier,
    plannedRecipes: PlannedRecipe[],
    status: MealPlanStatus,
    createdAt: Date,
    completedAt: Date | null,
  )
```

**フィールド一覧**

| フィールド | 型 | 説明 |
|---|---|---|
| id | MealPlanId | 不変 |
| weekOf | WeekIdentifier | 不変。どの週に属するか |
| plannedRecipes | PlannedRecipe[] | 集約内エンティティのリスト |
| status | MealPlanStatus | 現在のステータス |
| createdAt | Date | 不変 |
| completedAt | Date \| null | completed 遷移時に `new Date()` を設定 |

**振る舞い**

```
static create(weekOf: WeekIdentifier): MealPlan
  → id = MealPlanId.generate()、status = 'draft'、plannedRecipes = []
    createdAt = new Date()、completedAt = null

static reconstruct(props: MealPlanProps): MealPlan
  → DB 復元専用。バリデーションなし

addRecipe(recipeId: RecipeId, scaleFactor: number): PlannedRecipeId
  → status が 'draft' または 'shopping' 以外 → throw InvalidMealPlanStateError
  → PlannedRecipe.create(recipeId, scaleFactor)（scaleFactor バリデーションはこちら）
  → plannedRecipes.push(planned)
  → 戻り値: planned.id

removeRecipe(plannedRecipeId: PlannedRecipeId): void
  → status が 'draft' または 'shopping' 以外 → throw InvalidMealPlanStateError
  → plannedRecipes から削除。見つからない → throw PlannedRecipeNotFoundError

transitionTo(newStatus: MealPlanStatus): void
  → canTransitionTo(newStatus) が false → throw Error
  → status 更新。newStatus === 'completed' なら completedAt = new Date()

scheduleForDay(plannedRecipeId: PlannedRecipeId, date: Date): void
  → 対象 PlannedRecipe を検索。なければ throw PlannedRecipeNotFoundError
  → plannedRecipe.scheduleFor(date)

markAsCooked(plannedRecipeId: PlannedRecipeId, at: Date): void
  → 対象 PlannedRecipe を検索。なければ throw PlannedRecipeNotFoundError
  → plannedRecipe.markAsCooked(at)

private canTransitionTo(newStatus: MealPlanStatus): boolean
  → transitions テーブルで現在 status → newStatus の遷移可否を返す

get id(): MealPlanId
get weekOf(): WeekIdentifier
get plannedRecipes(): PlannedRecipe[]  // 防御的コピーを返す（[...this.plannedRecipes]）
get status(): MealPlanStatus
get createdAt(): Date
get completedAt(): Date | null
```

**不変条件**

1. `status` の遷移は `canTransitionTo` で制御される。以外は不変。
2. `addRecipe` / `removeRecipe` は `draft` か `shopping` のみ許可。
3. `completedAt` は `completed` 遷移時のみ設定される。
4. `plannedRecipes` の各要素は `scaleFactor > 0` を保証している（`PlannedRecipe.create` が保証）。

**Props / Input インターフェース**

```typescript
export interface PlannedRecipeProps {
  id: PlannedRecipeId;
  recipeId: RecipeId;
  scaleFactor: number;
  scheduledDate: Date | null;
  cookedAt: Date | null;
  notes: string;
}

export interface MealPlanProps {
  id: MealPlanId;
  weekOf: WeekIdentifier;
  plannedRecipes: PlannedRecipe[];
  status: MealPlanStatus;
  createdAt: Date;
  completedAt: Date | null;
}
```

### 4-6. WeekIdentifier（packages/domain/src/shared/week-identifier.ts）

**基本仕様（確定事項）**

- 土曜始まりの 7 日間（土〜金）を識別する値オブジェクト
- ISO 8601 週番号（月曜始まり）は使用しない（要件書 2 章確定事項）
- `docs/04-domain-model.md` に示された `year / _weekNumber` + ISO 8601 実装は**本実装では採用しない**

**内部表現: C-1 に依存（要ユーザー確認）**

本設計書は**案 A（週開始日の Date）推奨**で記述する。実際の確定は C-1 の確認後。

```
WeekIdentifier（案 A: Date ベース）
  private constructor(weekStartDate: Date)
    // weekStartDate は常に土曜 00:00:00 local time

  static fromDate(date: Date): WeekIdentifier
    // date.getDay(): 0=日, 1=月, ..., 5=金, 6=土
    // daysFromSaturday = (date.getDay() + 1) % 7
    //   土(6): 0, 日(0): 1, 月(1): 2, ..., 金(5): 6
    // 直前の土曜まで date を巻き戻し、時刻を 00:00:00.000 にリセット

  static current(): WeekIdentifier
    // WeekIdentifier.fromDate(new Date())

  static fromString(value: string): WeekIdentifier
    // value = "2026-07-04"（ISO date）
    // new Date(value + 'T00:00:00') で local midnight の Date を構築
    // Repository マッピング用。DB からの復元に使用

  startDate(): Date   // 週開始日（土曜 00:00:00 local）
  endDate(): Date     // 週終了日（金曜 23:59:59.999 local）
  next(): WeekIdentifier       // startDate + 7 days
  previous(): WeekIdentifier   // startDate - 7 days
  equals(other: WeekIdentifier): boolean
    // startDate().getTime() === other.startDate().getTime()
  toString(): string
    // 案 A: 週開始日の ISO date 文字列 "2026-07-04"
    // これが weekIdentifier の外部表現として API / DB に使われる
```

**案 B（year + weekNumber）を選んだ場合の差分**

- `toString()` は `"2026-W27"` 相当の独自書式になる
- `fromString` でのパース実装が必要（`"YYYY-Www"` → year/weekNumber 分解）
- `fromDate` での weekNumber 計算が複雑（土曜始まりの独自算出が必要）
- DB カラムは `week_start_year integer + week_start_number integer` の複合になるか `text` で書式文字列を保存する
- 年またぎ週のエッジケース（例: 2026-12-26 → year=2026 or 2027）に注意が必要

**タイムゾーン規約**

- `fromDate(date: Date)` は `date.getDay()` を使用する（ローカルタイムの曜日）
- サーバープロセスが JST（UTC+9）環境で動くことを前提とする
- Next.js / Vercel デプロイ時はタイムゾーンを `TZ=Asia/Tokyo` に設定する
- 既存の `new Date()` 呼び出し（`Product.create()`, `Store.create()` 等）と同一の規約
- テスト環境では `vitest.setSystemTime()` で現在日時をコントロールする

**MealPlanRepository インターフェース**

```typescript
// packages/domain/src/meal-plan/meal-plan.repository.ts
export interface MealPlanRepository {
  findById(id: MealPlanId): Promise<MealPlan | null>;
  findByWeek(weekIdentifier: WeekIdentifier): Promise<MealPlan | null>;
  findRecent(limit: number): Promise<MealPlan[]>;
  save(mealPlan: MealPlan): Promise<void>;
}
```

削除（delete）は Sprint 3 スコープ外のため定義しない。

---

## 5. Infrastructure 設計

### 5-1. Drizzle スキーマ（C-1 / C-2 の推奨案 A ベース）

```typescript
// packages/infrastructure/src/db/schema.ts（追記分）
import { date, index, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const mealPlans = pgTable('meal_plans', {
  id: text('id').primaryKey(),
  weekStartDate: date('week_start_date').notNull().unique(),
  //   ↑ C-1 に依存: 案 A なら date 型（"2026-07-04" を格納）
  //     案 B なら text('week_identifier') として "2026-W27" を格納する
  status: text('status').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

export type MealPlanRow = typeof mealPlans.$inferSelect;
export type NewMealPlanRow = typeof mealPlans.$inferInsert;

export const plannedRecipes = pgTable('planned_recipes', {
  id: text('id').primaryKey(),
  mealPlanId: text('meal_plan_id')
    .notNull()
    .references(() => mealPlans.id, { onDelete: 'cascade' }),
  recipeId: text('recipe_id').notNull(),
  // ↑ Recipe 集約への参照は ID 参照のみ（外部キー制約なし）
  //   削除済み Recipe への参照を保持し続けるため（C-4 推奨案 A）
  scaleFactor: numeric('scale_factor', { precision: 10, scale: 3 }).notNull(),
  // ↑ D-6: numeric(10, 3) 推奨。1.5, 2.0, 3.0 等を保存
  scheduledDate: date('scheduled_date'),
  cookedAt: timestamp('cooked_at'),
  notes: text('notes').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('planned_recipes_meal_plan_id_idx').on(table.mealPlanId),
]);

export type PlannedRecipeRow = typeof plannedRecipes.$inferSelect;
export type NewPlannedRecipeRow = typeof plannedRecipes.$inferInsert;
```

**C-2 正規化方針の根拠（独立テーブル推奨理由）**

| 観点 | 案 A（独立テーブル、推奨） | 案 B（JSONB 集約） |
|---|---|---|
| PlannedRecipe の独立性 | 各 PlannedRecipe が PlannedRecipeId を持ち、個別の removeRecipe が O(1) で発行可能 | JSONB 全体を上書きするため、1件削除でも MealPlan 行全体を UPDATE |
| scheduleForDay / markAsCooked の更新 | 特定の plannedRecipes 行のみ UPDATE 可能（将来の部分更新 API に対応しやすい） | JSONB 全体を書き直す必要あり |
| Recipe との整合 | Recipe.ingredients が JSONB 集約なのは RecipeIngredient に独立 ID がないから。PlannedRecipe は独立 ID を持つため異なる扱いが適切 | パターン統一の観点だけで JSONB にすると PlannedRecipeId が名目だけになる |
| 実装コスト | DrizzleProductRepository（price_records）と同じ JOIN パターン。実装コストは既知 | JOIN 不要だがシリアライズ/デシリアライズが必要 |

Recipe（JSONB）と Product（独立テーブル）の二方針が現状共存しているが、PlannedRecipe は Product の price_records に近い性質（独立 ID あり・個別更新あり）のため独立テーブルを推奨する。

**インデックス**

- `planned_recipes(meal_plan_id)` — findById / findRecent でのレシピ一覧取得
- `meal_plans.week_start_date` — UNIQUE 制約によりインデックスが自動生成（findByWeek で使用）

### 5-2. DrizzleMealPlanRepository

**ファイル**: `packages/infrastructure/src/repositories/drizzle-meal-plan.repository.ts`

**メソッド設計**

```
class DrizzleMealPlanRepository implements MealPlanRepository {
  constructor(private readonly db: DrizzleClient) {}

  async findById(id: MealPlanId): Promise<MealPlan | null>
    // SELECT meal_plans.*, planned_recipes.*
    //   FROM meal_plans
    //   LEFT JOIN planned_recipes ON meal_plans.id = planned_recipes.meal_plan_id
    //   WHERE meal_plans.id = ?
    // → DrizzleProductRepository の toProducts() と同じグルーピングロジック

  async findByWeek(weekIdentifier: WeekIdentifier): Promise<MealPlan | null>
    // WHERE meal_plans.week_start_date = weekIdentifier.toString()
    // → C-1 案 A では "2026-07-04" の date 文字列で等値比較
    // → UNIQUE 制約により最大 1 件

  async findRecent(limit: number): Promise<MealPlan[]>
    // LEFT JOIN planned_recipes
    // ORDER BY meal_plans.week_start_date DESC
    // LIMIT limit
    // → グルーピング後に limit 件取り出す（JOIN で行が膨らむため DB LIMIT ≠ 最終件数に注意）
    // → 実装上は「全グループ化後に slice(0, limit)」または「サブクエリで meal_plan_id を先に取得」

  async save(mealPlan: MealPlan): Promise<void>
    // 1. meal_plans を upsert（ON CONFLICT (id) DO UPDATE）
    // 2. 現在の plannedRecipes ID リストを取得
    // 3. planned_recipes WHERE meal_plan_id = ? AND id NOT IN (currentIds) を DELETE
    // 4. 各 plannedRecipe を upsert（ON CONFLICT (id) DO UPDATE）
    // ↑ DrizzleProductRepository.save() の price_records 処理と同一パターン
}
```

**ドメイン → DB 行 マッピング**

| ドメインフィールド | DB カラム | 変換 |
|---|---|---|
| `mealPlan.weekOf.toString()` | `week_start_date` | `"2026-07-04"` 文字列 |
| `mealPlan.status` | `status` | text そのまま |
| `mealPlan.createdAt` | `created_at` | Date → timestamp |
| `mealPlan.completedAt` | `completed_at` | Date \| null → timestamp \| null |
| `plannedRecipe.scaleFactor` | `scale_factor` | number → string（numeric） |
| `plannedRecipe.scheduledDate` | `scheduled_date` | Date \| null → date 文字列 \| null |
| `plannedRecipe.cookedAt` | `cooked_at` | Date \| null → timestamp \| null |

**DB 行 → ドメイン reconstruct マッピング**

| DB カラム | ドメインフィールド | 変換 |
|---|---|---|
| `week_start_date` | `weekOf` | `WeekIdentifier.fromString(row.weekStartDate)` |
| `status` | `status` | `row.status as MealPlanStatus`（型アサーション） |
| `scale_factor` | `scaleFactor` | `Number(row.scaleFactor)` |
| `scheduled_date` | `scheduledDate` | `row.scheduledDate ? new Date(row.scheduledDate + 'T00:00:00') : null` |
| `cooked_at` | `cookedAt` | `row.cookedAt ?? null` |

**findRecent での N+1 対策**

`findRecent` は全 MealPlan を LEFT JOIN で一度に取得し、アプリ層でグルーピングする。
limit 件の meal_plan_id を先にサブクエリで取得してから JOIN する方法も有効だが、
MVP1 規模（月数十件）では JOIN + グルーピングで十分。将来のボトルネックとなれば 2 クエリ方式に移行する。

### 5-3. マイグレーション生成方針

既存の `drizzle-kit` 運用に合わせる。

1. `packages/infrastructure/src/db/schema.ts` に `mealPlans` / `plannedRecipes` テーブル定義を追記
2. `pnpm db:generate`（または `drizzle-kit generate`）でマイグレーションファイルを自動生成
3. `pnpm db:migrate`（または `drizzle-kit migrate`）で適用

---

## 6. Application 設計

### 6-1. DTO 定義

**ファイル**: `packages/application/src/meal-plan/meal-plan.dto.ts`

```typescript
export type MealPlanStatus = 'draft' | 'shopping' | 'cooking' | 'consuming' | 'completed';

export interface PlannedRecipeDto {
  id: string;                    // PlannedRecipeId.value
  recipeId: string;              // RecipeId.value（ID 参照のみ。D-7: recipeName は含めない）
  scaleFactor: number;           // > 0
  scheduledDate: string | null;  // ISO date "2026-07-06" | null
  cookedAt: string | null;       // ISO 8601 datetime | null
  notes: string;                 // 空文字許容
}

export interface MealPlanDto {
  id: string;                         // MealPlanId.value
  weekIdentifier: string;             // WeekIdentifier.toString() "2026-07-04"（案 A）
  status: MealPlanStatus;
  plannedRecipes: PlannedRecipeDto[];
  createdAt: string;                  // ISO 8601 datetime
  completedAt: string | null;         // ISO 8601 datetime | null
}

// UseCase 入力 DTO（Hono ルートから UseCase へ渡す）
export interface CreateMealPlanInputDto {
  weekIdentifier: string;  // "2026-07-04"（Hono ルートで Zod バリデーション済み）
}

export interface AddRecipeToMealPlanInputDto {
  mealPlanId: string;
  recipeId: string;
  scaleFactor: number;
}

export interface RemoveRecipeFromMealPlanInputDto {
  mealPlanId: string;
  plannedRecipeId: string;
}

export interface GetMealPlanHistoryInputDto {
  limit?: number;  // デフォルト 4、最大 12（D-5）
}
```

### 6-2. Mapper

**ファイル**: `packages/application/src/meal-plan/meal-plan.mapper.ts`

```typescript
export function toMealPlanDto(mealPlan: MealPlan): MealPlanDto
  // Entity → DTO 変換。Entity を境界外に漏らさない

export function toPlannedRecipeDto(plannedRecipe: PlannedRecipe): PlannedRecipeDto
  // scheduledDate: scheduledDate?.toISOString().slice(0, 10) ?? null
  //   → Date | null → ISO date 文字列 | null
  // cookedAt: cookedAt?.toISOString() ?? null
```

### 6-3. エラークラス

```
// packages/application/src/meal-plan/meal-plan-not-found.error.ts
class MealPlanNotFoundError extends Error
  constructor(mealPlanId: string)
  name = 'MealPlanNotFoundError'

// packages/application/src/meal-plan/planned-recipe-not-found.error.ts
class PlannedRecipeNotFoundError extends Error
  constructor(plannedRecipeId: string)
  name = 'PlannedRecipeNotFoundError'

// packages/application/src/meal-plan/invalid-meal-plan-state.error.ts
class InvalidMealPlanStateError extends Error
  constructor(current: MealPlanStatus, operation: string)
  // 例: "Cannot addRecipe to a MealPlan with status 'cooking'"
  name = 'InvalidMealPlanStateError'
```

`MealPlan.addRecipe` / `removeRecipe` が throw するエラーは Domain 内の `Error` だが、UseCase が `InvalidMealPlanStateError` として変換してもよい。
あるいは Domain が直接 `InvalidMealPlanStateError` を throw するパターンもある。
**設計者判断**: Domain は `@cookpit/application` に依存できないため、Domain は汎用 `Error` を throw し、UseCase の入口で `instanceof Error` かつメッセージで判別してラップするか、別途ドメインエラー型を定義する。

推奨: Domain に独自の軽量エラー型（`MealPlanDomainError`）を定義し、Application 層でそれを catch して Application エラーに変換する。ただし既存の Recipe/Product パターンに合わせ、単純な `Error` throw でも可。実装時に implementer が決定する。

### 6-4. UseCase 設計

#### CreateMealPlanUseCase

```
// packages/application/src/meal-plan/create-meal-plan.use-case.ts
class CreateMealPlanUseCase
  constructor(private readonly mealPlanRepository: MealPlanRepository)

  async execute(input: CreateMealPlanInputDto): Promise<MealPlanDto>
```

**シーケンス（C-3 推奨: 冪等）**

```
1. WeekIdentifier.fromString(input.weekIdentifier)  → WeekIdentifier
2. mealPlanRepository.findByWeek(weekIdentifier)
   ├── 既存あり → toMealPlanDto(existing) を返す（冪等。重複作成なし）
   └── なし → MealPlan.create(weekIdentifier)
                → mealPlanRepository.save(mealPlan)
                → toMealPlanDto(mealPlan) を返す
```

**C-3 案 B（409）を選んだ場合の差分**: findByWeek で既存があれば `MealPlanAlreadyExistsError` を throw し、Hono ルートで 409 にマップする。UI 側のエラーハンドリングが追加で必要。

#### AddRecipeToMealPlanUseCase

```
// packages/application/src/meal-plan/add-recipe-to-meal-plan.use-case.ts
class AddRecipeToMealPlanUseCase
  constructor(private readonly mealPlanRepository: MealPlanRepository)

  async execute(input: AddRecipeToMealPlanInputDto): Promise<PlannedRecipeDto>
```

**シーケンス**

```
1. mealPlanRepository.findById(MealPlanId.fromString(input.mealPlanId))
   └── null → throw MealPlanNotFoundError(input.mealPlanId)
2. mealPlan.addRecipe(RecipeId.fromString(input.recipeId), input.scaleFactor)
   ├── status が draft/shopping 以外 → throw InvalidMealPlanStateError（Hono で 422）
   └── scaleFactor <= 0 → throw Error（Hono ルートの Zod で事前検証済みのため到達しない想定だが Domain でも保護）
   → PlannedRecipeId を返す
3. mealPlanRepository.save(mealPlan)
4. 追加された PlannedRecipe を mealPlan.plannedRecipes から取得
5. toPlannedRecipeDto(plannedRecipe) を返す
```

**DI**: MealPlanRepository のみ。RecipeRepository は不要（D-7: recipeName を含めないため）。

#### RemoveRecipeFromMealPlanUseCase

```
// packages/application/src/meal-plan/remove-recipe-from-meal-plan.use-case.ts
class RemoveRecipeFromMealPlanUseCase
  constructor(private readonly mealPlanRepository: MealPlanRepository)

  async execute(input: RemoveRecipeFromMealPlanInputDto): Promise<void>
```

**シーケンス**

```
1. mealPlanRepository.findById(MealPlanId.fromString(input.mealPlanId))
   └── null → throw MealPlanNotFoundError
2. mealPlan.removeRecipe(PlannedRecipeId.fromString(input.plannedRecipeId))
   ├── status が draft/shopping 以外 → throw InvalidMealPlanStateError（422）
   └── PlannedRecipeId が存在しない → throw PlannedRecipeNotFoundError（404）
3. mealPlanRepository.save(mealPlan)
```

#### GetCurrentMealPlanUseCase

```
// packages/application/src/meal-plan/get-current-meal-plan.use-case.ts
class GetCurrentMealPlanUseCase
  constructor(private readonly mealPlanRepository: MealPlanRepository)

  async execute(asOf?: Date): Promise<MealPlanDto | null>
```

**シーケンス**

```
1. WeekIdentifier.fromDate(asOf ?? new Date())  → 現在週の WeekIdentifier
2. mealPlanRepository.findByWeek(weekIdentifier)
   ├── MealPlan あり → toMealPlanDto(mealPlan)
   └── null → return null
```

`asOf` は単体テストでの「現在日時」制御用。Hono ルートからは引数なしで呼ぶ。

**null 時の HTTP ステータス（D-4 推奨: 200）**

Hono ルートで `c.json({ data: null })` として 200 を返す。
204 を選ぶ場合は Hono ルートで `return c.body(null, 204)` にする（Hono RPC の型が `void` になる）。

#### GetMealPlanHistoryUseCase

```
// packages/application/src/meal-plan/get-meal-plan-history.use-case.ts
class GetMealPlanHistoryUseCase
  constructor(private readonly mealPlanRepository: MealPlanRepository)

  async execute(input: GetMealPlanHistoryInputDto): Promise<MealPlanDto[]>
```

**シーケンス**

```
1. limit = input.limit ?? 4
   （Hono ルートの Zod で 1 ≦ limit ≦ 12 に制限済み）
2. mealPlanRepository.findRecent(limit)
3. mealPlanDtos = mealPlans.map(toMealPlanDto)
4. return mealPlanDtos  （週の新しい順はリポジトリが保証）
```

#### バレルエクスポート

```typescript
// packages/application/src/meal-plan/index.ts
export * from './create-meal-plan.use-case';
export * from './add-recipe-to-meal-plan.use-case';
export * from './remove-recipe-from-meal-plan.use-case';
export * from './get-current-meal-plan.use-case';
export * from './get-meal-plan-history.use-case';
export * from './meal-plan.dto';
export * from './meal-plan.mapper';
export * from './meal-plan-not-found.error';
export * from './planned-recipe-not-found.error';
export * from './invalid-meal-plan-state.error';

// packages/application/src/index.ts への追記
// export * from './meal-plan';
```

---

## 7. Presentation(API) 設計

### 7-1. エンドポイント一覧

| メソッド | パス | UseCase | 正常レスポンス |
|---|---|---|---|
| POST | `/api/meal-plans` | CreateMealPlanUseCase | 201 + MealPlanDto |
| GET | `/api/meal-plans/current` | GetCurrentMealPlanUseCase | 200 + `{ data: MealPlanDto }` または `{ data: null }`（D-4） |
| GET | `/api/meal-plans/history` | GetMealPlanHistoryUseCase | 200 + MealPlanDto[] |
| POST | `/api/meal-plans/:id/recipes` | AddRecipeToMealPlanUseCase | 201 + PlannedRecipeDto |
| DELETE | `/api/meal-plans/:id/recipes/:plannedRecipeId` | RemoveRecipeFromMealPlanUseCase | 204 |

Sprint 3 で**公開しないエンドポイント**:
- ステータス遷移（`POST /api/meal-plans/:id/transition`）
- markAsCooked（`POST /api/meal-plans/:id/recipes/:plannedRecipeId/cooked`）
- scheduleForDay（`PATCH /api/meal-plans/:id/recipes/:plannedRecipeId`）

### 7-2. Zod バリデーション概要

詳細な Zod スキーマ確定は contract-designer の担当（セクション 12 参照）。
Hono ルートで使う入力スキーマの概要のみ示す。

| スキーマ | 主な検証項目 |
|---|---|
| `createMealPlanSchema` | `weekIdentifier: z.string().regex(ISO date パターン)` |
| `addRecipeToMealPlanSchema` | `recipeId: z.uuid()`、`scaleFactor: z.number().positive()` |
| `mealPlanIdParamSchema` | `id: z.uuid()` |
| `plannedRecipeIdParamSchema` | `id: z.uuid()`、`plannedRecipeId: z.uuid()` |
| `getMealPlanHistoryQuerySchema` | `limit?: z.number().int().min(1).max(12).default(4)` |

### 7-3. Hono ルート骨子

**ファイル**: `apps/web/src/server/routes/meal-plans.ts`

```typescript
// 手動 DI ファクトリ（products.ts パターン踏襲）
function mealPlanRepository(): DrizzleMealPlanRepository {
  return new DrizzleMealPlanRepository(getDb());
}

export const mealPlansRoute = new Hono()
  .post('/', zValidator('json', createMealPlanSchema), async (c) => {
    const body = c.req.valid('json');
    const useCase = new CreateMealPlanUseCase(mealPlanRepository());
    const dto = await useCase.execute(body);
    return c.json(dto, 201);
  })
  .get('/current', async (c) => {
    const useCase = new GetCurrentMealPlanUseCase(mealPlanRepository());
    const dto = await useCase.execute();
    return c.json({ data: dto });  // D-4: null でも 200 + { data: null }
  })
  .get('/history', zValidator('query', getMealPlanHistoryQuerySchema), async (c) => {
    const { limit } = c.req.valid('query');
    const useCase = new GetMealPlanHistoryUseCase(mealPlanRepository());
    const dtos = await useCase.execute({ limit });
    return c.json(dtos);
  })
  .post('/:id/recipes',
    zValidator('param', mealPlanIdParamSchema),
    zValidator('json', addRecipeToMealPlanSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const useCase = new AddRecipeToMealPlanUseCase(mealPlanRepository());
      const dto = await useCase.execute({ mealPlanId: id, ...body });
      return c.json(dto, 201);
    }
  )
  .delete('/:id/recipes/:plannedRecipeId',
    zValidator('param', plannedRecipeIdParamSchema),
    async (c) => {
      const { id, plannedRecipeId } = c.req.valid('param');
      const useCase = new RemoveRecipeFromMealPlanUseCase(mealPlanRepository());
      await useCase.execute({ mealPlanId: id, plannedRecipeId });
      return c.body(null, 204);
    }
  );
```

### 7-4. onError マッピング

**apps/web/src/server/app.ts への追記**

```typescript
// 既存の onError ハンドラに追加
if (err instanceof MealPlanNotFoundError) {
  return c.json({ error: err.message }, 404);
}
if (err instanceof PlannedRecipeNotFoundError) {
  return c.json({ error: err.message }, 404);
}
if (err instanceof InvalidMealPlanStateError) {
  return c.json({ error: err.message }, 422);
}
```

**エラー → HTTP ステータス対応表**

| エラー種別 | 発生箇所 | HTTP | 処理 |
|---|---|---|---|
| MealPlanNotFoundError | UseCase | 404 | app.ts onError |
| PlannedRecipeNotFoundError | UseCase | 404 | app.ts onError |
| InvalidMealPlanStateError | UseCase | 422 | app.ts onError |
| Zod バリデーション失敗 | Hono zValidator | 400 | @hono/zod-validator 自動処理 |
| MealPlanAlreadyExistsError（C-3 案 B 採用時のみ） | UseCase | 409 | app.ts onError（案 B 時に追加） |
| DB 接続エラー / 未知の Error | — | 500 | 既存 console.error + 500 JSON |

### 7-5. app.ts へのマウント

```typescript
// apps/web/src/server/app.ts（追記）
import { mealPlansRoute } from './routes/meal-plans';
import { MealPlanNotFoundError, PlannedRecipeNotFoundError, InvalidMealPlanStateError } from '@cookpit/application';

export const routes = app
  .route('/health', healthRoute)
  .route('/recipes', recipesRoute)
  .route('/products', productsRoute)
  .route('/stores', storesRoute)
  .route('/meal-plans', mealPlansRoute);  // 追加
```

### 7-6. 手動 DI の組み立て箇所

DI は Hono ルートハンドラ内で完結する（コンストラクタ注入）。
UseCase に必要な Repository インスタンスをハンドラ内で生成し UseCase に渡す。
現状の全 UseCase で必要な DI 依存は `MealPlanRepository` のみ（D-7 推奨: RecipeRepository 不要）。

---

## 8. 変更後構成

### 8-1. 新規作成ファイル

```
packages/domain/src/
├── meal-plan/
│   ├── meal-plan-id.ts
│   ├── planned-recipe-id.ts
│   ├── meal-plan.ts
│   ├── meal-plan.repository.ts
│   ├── meal-plan-id.test.ts
│   └── meal-plan.test.ts
└── shared/
    ├── week-identifier.ts
    └── week-identifier.test.ts

packages/application/src/meal-plan/
    ├── meal-plan.dto.ts
    ├── meal-plan.mapper.ts
    ├── meal-plan-not-found.error.ts
    ├── planned-recipe-not-found.error.ts
    ├── invalid-meal-plan-state.error.ts
    ├── create-meal-plan.use-case.ts
    ├── add-recipe-to-meal-plan.use-case.ts
    ├── remove-recipe-from-meal-plan.use-case.ts
    ├── get-current-meal-plan.use-case.ts
    ├── get-meal-plan-history.use-case.ts
    ├── meal-plan-use-cases.test.ts
    └── index.ts

packages/infrastructure/src/
├── repositories/
│   ├── drizzle-meal-plan.repository.ts
│   └── drizzle-meal-plan.repository.test.ts
└── db/migrations/  （drizzle-kit 自動生成）

packages/api-contract/src/
└── meal-plan.schema.ts  （契約概要のみ。詳細は contract-designer）

apps/web/src/server/routes/
└── meal-plans.ts
```

### 8-2. 既存ファイルへの追記

| ファイル | 変更内容 |
|---|---|
| `packages/infrastructure/src/db/schema.ts` | `mealPlans` / `plannedRecipes` テーブル定義を追記 |
| `packages/infrastructure/src/index.ts` | `DrizzleMealPlanRepository` の re-export 追加 |
| `packages/application/src/index.ts` | `export * from './meal-plan'` を追加 |
| `packages/api-contract/src/index.ts` | `export * from './meal-plan.schema'` を追加 |
| `apps/web/src/server/app.ts` | `mealPlansRoute` のマウント・3 エラーの `onError` ハンドリング追加 |

### 8-3. 既存集約への影響

| 集約 | 影響 |
|---|---|
| Recipe | RecipeId を ID 参照するのみ。Recipe 側の変更なし |
| Product | 影響なし |
| Store | 影響なし |
| ShoppingList | 影響なし（Sprint 4 以降で連携） |

---

## 9. データフロー

### 献立作成

```
POST /api/meal-plans  { weekIdentifier: "2026-07-04" }
  → Hono zValidator（createMealPlanSchema）
      → CreateMealPlanUseCase.execute({ weekIdentifier: "2026-07-04" })
          1. WeekIdentifier.fromString("2026-07-04")
          2. DrizzleMealPlanRepository.findByWeek(weekIdentifier)
             └── なし → MealPlan.create(weekIdentifier) → save()
          3. toMealPlanDto(mealPlan)
      → 201 + MealPlanDto
```

### レシピ追加

```
POST /api/meal-plans/:id/recipes  { recipeId, scaleFactor }
  → AddRecipeToMealPlanUseCase.execute(...)
      1. findById(id) → null → 404
      2. mealPlan.addRecipe(recipeId, scaleFactor)
         └── status 違反 → 422
      3. save(mealPlan)
      4. PlannedRecipe 取得 → toPlannedRecipeDto()
  → 201 + PlannedRecipeDto
```

### 現在週の献立取得

```
GET /api/meal-plans/current
  → GetCurrentMealPlanUseCase.execute()
      1. WeekIdentifier.fromDate(new Date())  // JST での今日
      2. findByWeek(weekIdentifier)
         ├── MealPlan あり → { data: MealPlanDto }
         └── null → { data: null }
  → 200 + { data: MealPlanDto | null }
```

---

## 10. エラー処理

| エラー | 発生箇所 | HTTP | 処理 |
|---|---|---|---|
| `MealPlanNotFoundError` | UseCase（AddRecipe / RemoveRecipe） | 404 | app.ts onError |
| `PlannedRecipeNotFoundError` | UseCase（RemoveRecipe） | 404 | app.ts onError |
| `InvalidMealPlanStateError` | UseCase（AddRecipe / RemoveRecipe） | 422 | app.ts onError |
| Zod バリデーション失敗 | Hono zValidator | 400 | 自動 |
| `MealPlanAlreadyExistsError`（C-3 案 B 時） | CreateMealPlanUseCase | 409 | app.ts onError（案 B 採用時のみ追加） |
| DB エラー / 未知 | — | 500 | 既存 onError フォールバック |

---

## 11. ログと監視

対象外（MVP1 では監視基盤なし）。既存の `console.error` in `app.ts` onError で対応。

---

## 12. セキュリティ

MVP1 は認証なし（ADR-003 準拠、既存機能と同一前提）。
入力値は Zod スキーマ（zValidator）でサーバー側検証。
`recipeId` の存在検証は行わない（C-4 推奨 A: 削除済み Recipe への参照は許容）。

---

## 13. 性能

MVP1（2名利用・週1回の献立作成）では `meal_plans` が年 50 件前後、`planned_recipes` が年数百件程度。性能問題は生じない。
`planned_recipes(meal_plan_id)` のインデックスで findById / findRecent のレシピ一覧取得に対応。
`meal_plans.week_start_date` UNIQUE 制約がインデックスを兼ねる（findByWeek に対応）。

---

## 14. 後方互換性

- 既存の `recipes` / `products` / `stores` / `price_records` テーブル・Hono ルートへの変更は一切行わない
- `app.ts` への `onError` 追加は既存ハンドラの順序・挙動に影響しない（追記のみ）
- `packages/application/src/index.ts` / `packages/api-contract/src/index.ts` への re-export 追加は後方互換

---

## 15. 契約への申し送り（contract-designer）

contract-designer が `packages/api-contract/src/meal-plan.schema.ts` で確定すべき項目。

| 項目 | 概要 / 方針 | 未解決 |
|---|---|---|
| `createMealPlanSchema.weekIdentifier` | ISO date 形式（`"2026-07-04"`）の正規表現または `z.string().date()` | C-1 確定後に書式が確定する |
| `addRecipeToMealPlanSchema.scaleFactor` | `z.number().positive()`（0 超） | 上限値は不問（MVP1） |
| `getMealPlanHistoryQuerySchema.limit` | `z.coerce.number().int().min(1).max(12).default(4)` | max 値は D-5 推奨 12 |
| `MealPlanDto` / `PlannedRecipeDto` の response スキーマ | DTO 構造と一致。nullability は上記 DTO 定義に従う | — |
| エラーレスポンス形式 | 既存 `{ error: string }` と統一 | — |
| 契約テスト方針 | Vitest で Zod スキーマの `parse()` テストを行う | — |

---

## 16. ADR 候補

**ADR 候補: MealPlan の週定義に ISO 8601 週番号を採用せず土曜始まりを採用**

- **決定**: `WeekIdentifier` は ISO 8601 週番号（月曜始まり）を採用せず、土曜始まりの週定義を実装する
- **理由**: ユーザーのユースケース（土曜に献立を決め→買い出し→金曜まで消費）と ISO 8601 の週定義（月曜始まり）が矛盾するため
- **`docs/04-domain-model.md` との差異**: `WeekIdentifier` のコードスニペットに「ISO 8601 週番号で算出」と記述があるが、要件書で明示的に否定された（要件書 §2 前提 1）
- **採番**: ADR-0005 起点。後続の reviewer 工程で正式採番を行う。

---

## 17. 設計判断の確定記録（2026-07-05 ユーザー確認完了）

### C-1: WeekIdentifier の内部表現

| 項目 | 案 A（推奨）| 案 B |
|---|---|---|
| 内部表現 | 週開始日の `Date`（土曜 00:00:00 local） | 年 + 独自週番号（例: year=2026, weekNumber=1） |
| `toString()` 外部表現 | `"2026-07-04"`（ISO date 文字列） | `"2026-W27"` 相当の独自書式 |
| DB カラム | `week_start_date date NOT NULL UNIQUE` | `week_start_text text NOT NULL UNIQUE` または年/週番号の複合 |
| `fromDate()` 計算 | 直前の土曜を求める算術（曜日オフセット）。シンプル | 年をまたぐ週の番号計算が複雑 |
| `equals()` 比較 | `Date.getTime()` 比較 | 年と週番号の両方比較 |
| 年またぎ週（2026-12-26〜2027-01-01） | `weekStartDate = 2026-12-26`。年またぎ自然に表現 | どちらの年に属するかのルールが必要 |

**推奨**: 案 A。土曜であることが Date に直接反映され ISO 週番号との混同が生じない。DB は `date` 型が最も意味論的に正確。

**確定（2026-07-05）**: 案 A を採用。

---

### C-2: planned_recipes の正規化方針

| 項目 | 案 A（独立テーブル、推奨） | 案 B（JSONB） |
|---|---|---|
| 永続化構造 | `planned_recipes` 独立テーブル。JOIN で復元 | `meal_plans.planned_recipes jsonb` |
| PlannedRecipeId | DB の first-class citizen として機能 | ID はあるが JSONB 内の値 |
| removeRecipe の永続化 | NOT IN (currentIds) DELETE + upsert | meal_plan 行全体の JSONB 上書き |
| scheduleForDay / markAsCooked の将来 | 特定行のみ UPDATE 可能 | JSONB 全体書き直し |
| 実装パターン | DrizzleProductRepository (price_records) と同一 | DrizzleRecipeRepository (ingredients) と同一 |
| 変更コスト | 今回設計通り | JSONB シリアライズ/デシリアライズ実装が必要 |

**推奨**: 案 A（独立テーブル）。PlannedRecipe は独立した ID を持ち個別更新のユースケースがあることが、Recipe の ingredients（ID なし・一括更新）と根本的に異なる。

**確定（2026-07-05）**: 案 A（独立テーブル）を採用。

---

### C-3: 同一週 MealPlan の一意性 / CreateMealPlan の冪等性

| 項目 | 案 A（冪等、推奨） | 案 B（409） | 案 C（複数許容） |
|---|---|---|---|
| 挙動 | 既存があれば既存を返す | MealPlanAlreadyExistsError（409） | 制約なし |
| DB 制約 | UNIQUE 制約あり | UNIQUE 制約あり | UNIQUE 制約なし |
| UI 副作用 | 重複 HTTP リクエストに安全 | エラーハンドリングが必要 | GetCurrentMealPlan が「どれか」を返すロジックが必要 |
| GetCurrentMealPlan との整合 | 1 週に最大 1 件が保証される | 同上 | 壊れる（複数ある場合の定義が必要） |

**推奨**: 案 A（冪等）。2名の個人アプリでは誤操作・リトライを考慮すると最も安全。

**確定（2026-07-05）**: 案 A（冪等）を採用。ステータスに関わらず既存があれば既存を返す（draft 以外でも冪等）。

---

### C-4: 削除済み Recipe を参照する PlannedRecipe の扱い

| 項目 | 案 A（ID 保持、推奨） | 案 B（カスケード削除） | 案 C（論理削除） |
|---|---|---|---|
| PlannedRecipe の扱い | recipeId を保持したまま。Recipe が存在しなくても PlannedRecipe は残る | Recipe 削除時に MealPlan.removeRecipe を呼ぶ | Recipe に削除フラグを追加 |
| Domain の純粋性 | 高い（ID 参照原則を厳守） | Recipe 削除 UseCase が MealPlanRepository に依存する（依存方向違反のリスク） | Recipe 設計変更が必要。Sprint 3 スコープ外 |
| 実装コスト | 最小 | Recipe 削除 UseCase の変更が必要 | Recipe 全体の変更が必要 |
| 履歴の意味 | 過去の献立に「削除済みレシピを使った」記録が残る | 過去の献立からレシピが消える | 参照整合性が常に保たれる |

**推奨**: 案 A。Domain の ID 参照原則を守り、最小実装で Sprint 3 を完結させる。UI 側（Unit B）で `recipeName: null` などを適切に表示する責務を持つ。

**確定（2026-07-05）**: 案 A（recipeId のみ保持）を採用。

---

## 18. 移行とリリース

- DB マイグレーション: `meal_plans` / `planned_recipes` テーブルの追加。既存テーブルへの変更なし
- ロールバック: マイグレーション前に戻す場合は該当テーブルを DROP（データロスなし）
- デプロイ: マイグレーション実行後に Next.js デプロイ

---

## 19. 契約確定仕様（contract-designer, 2026-07-05）

本セクションは §15「契約への申し送り」を受けて contract-designer が確定した最終仕様。
`packages/api-contract/src/meal-plan.schema.ts` へそのまま転記できる粒度で記述する。
実際のファイル作成・変更は implementer が行う（本書は仕様のみ）。

### 19-0. zod バージョンと API 選択の根拠

`packages/api-contract/package.json` / `apps/web/package.json` とも `"zod": "^4.4.3"`（Zod v4 classic API、`@hono/zod-validator@0.8.0` もこれに整合）。
既存の `product.schema.ts` / `store.schema.ts` が `z.uuid()` のようなトップレベル関数（v3 の `z.string().uuid()` ではない）を使っているため、本契約も同一スタイル（v4 のトップレベル API: `z.uuid()` / `z.iso.date()` / `z.iso.datetime()` / `z.coerce.number()`）に統一する。

### 19-1. `createMealPlanSchema`（POST `/api/meal-plans`, json）

```typescript
export const createMealPlanSchema = z.object({
  weekIdentifier: z.iso.date(),
});

export type CreateMealPlanBody = z.infer<typeof createMealPlanSchema>;
```

- `z.iso.date()`（Zod v4 の `zod/v4/classic/iso.ts` に実装。`node_modules/zod/v4/core/regexes.js` の `dateSource` 定数を実測確認済み）は次を検証する。
  - フォーマット: `YYYY-MM-DD`
  - 暦日としての妥当性: 月ごとの日数上限・うるう年判定込み（例: `"2026-02-30"` は reject、`"2026-04-31"` は reject、閏年の `"2028-02-29"` は accept）
- **曜日（土曜であること）の検証は行わない**。理由: 設計 §4-6 の `WeekIdentifier.fromString(value)` 自体が `new Date(value + 'T00:00:00')` を構築するのみで曜日を検証しない実装のため、Zod 側だけ厳格化すると「Zod は通すが `fromString` も通す・整合するが週の意味論的検証はどこにもない」状態と「Zod は通すが Domain だけ検証する」状態の非対称を生む。Zod は形式（+ 暦日妥当性）のみを担当し、Domain の意味論的検証は Domain の責務のまま矛盾なく残す（詳細は 19-11 参照）。
- 上限・下限（過去/未来の範囲制限）は設けない（要件 §3-1 の記載通り）。

### 19-2. `addRecipeToMealPlanSchema`（POST `/api/meal-plans/:id/recipes`, json）

```typescript
export const addRecipeToMealPlanSchema = z.object({
  recipeId: z.uuid(),
  scaleFactor: z.number().positive(),
});

export type AddRecipeToMealPlanBody = z.infer<typeof addRecipeToMealPlanSchema>;
```

- `recipeId`: UUID 形式のみ検証。存在チェックはしない（C-4: 削除済み Recipe への参照は許容。UseCase 層でも存在チェックしない）。
- `scaleFactor`: `z.number().positive()`（`recordPriceSchema.priceAmount` と同一パターン）。`0` と負数は reject。上限なし（D-6 / 要件前提3 と整合）。小数（`1.5`）を許容。

### 19-3. `mealPlanIdParamSchema`（param。POST `/api/meal-plans/:id/recipes` で使用）

```typescript
export const mealPlanIdParamSchema = z.object({
  id: z.uuid(),
});

export type MealPlanIdParam = z.infer<typeof mealPlanIdParamSchema>;
```

### 19-4. `plannedRecipeIdParamSchema`（param。DELETE `/api/meal-plans/:id/recipes/:plannedRecipeId` で使用）

```typescript
export const plannedRecipeIdParamSchema = z.object({
  id: z.uuid(),
  plannedRecipeId: z.uuid(),
});

export type PlannedRecipeIdParam = z.infer<typeof plannedRecipeIdParamSchema>;
```

`mealPlanIdParamSchema` と `plannedRecipeIdParamSchema` はフィールドが重複するが別スキーマとして定義する（§7-3 のルート骨子で `POST /:id/recipes` は `id` のみ、`DELETE /:id/recipes/:plannedRecipeId` は `id` + `plannedRecipeId` を要求するため、用途ごとに固定した方が呼び出し側の型が明確になる。既存 `products.ts` の `idParamSchema` 単体パターンより一段厳密だが、パスパラメータの数が異なるため統合しない）。

### 19-5. `getMealPlanHistoryQuerySchema`（query。GET `/api/meal-plans/history`）

```typescript
export const getMealPlanHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(4),
});

export type GetMealPlanHistoryQuery = z.infer<typeof getMealPlanHistoryQuerySchema>;
```

- クエリパラメータは常に文字列（または未指定）で渡ってくるため `z.coerce.number()` が必須（`z.number()` 単体では文字列 `"4"` を reject する）。
- `limit` キーが省略された場合、`c.req.valid('query')` に渡る値は `limit: undefined` 相当になり、`.default(4)` が適用されて `4` になる（D-5: デフォルト 4）。
- `max(12)`（D-5 推奨）。`limit=13` は reject（400）。
- 境界値の挙動:
  - `?limit=1` → `1`（accept、B-06 対応）
  - `?limit=12` → `12`（accept、境界上限）
  - `?limit=13` → reject
  - `?limit=0` → reject（`.min(1)`）
  - `?limit=` （空文字）→ `Number('')` は `0` に coerce され reject
  - `?limit=abc` → `Number('abc')` は `NaN` となり reject
  - `?limit=2.5` → `.int()` で reject

### 19-6. レスポンススキーマ

`storeResponseSchema`（`store.schema.ts`、store-master D-1/D-2 の先例）と同じ方針を踏襲する。すなわち、レスポンス構造は Zod スキーマとして `api-contract` に定義するが、Hono ルートの `zValidator` には使わない（既存 `products.ts` / `stores.ts` と同様、UseCase の戻り値型で型安全性を担保し、レスポンススキーマは Mapper 出力の構造検証専用の契約テストとして使う）。

```typescript
export const mealPlanStatusSchema = z.enum(['draft', 'shopping', 'cooking', 'consuming', 'completed']);

export const plannedRecipeResponseSchema = z.object({
  id: z.uuid(),
  recipeId: z.uuid(),
  scaleFactor: z.number(),
  scheduledDate: z.iso.date().nullable(),
  cookedAt: z.iso.datetime().nullable(),
  notes: z.string(),
});

export const mealPlanResponseSchema = z.object({
  id: z.uuid(),
  weekIdentifier: z.iso.date(),
  status: mealPlanStatusSchema,
  plannedRecipes: z.array(plannedRecipeResponseSchema),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
});

export const getCurrentMealPlanResponseSchema = z.object({
  data: mealPlanResponseSchema.nullable(),
});

export const mealPlanHistoryResponseSchema = z.array(mealPlanResponseSchema);

export type MealPlanStatusSchemaType = z.infer<typeof mealPlanStatusSchema>;
export type PlannedRecipeResponse = z.infer<typeof plannedRecipeResponseSchema>;
export type MealPlanResponse = z.infer<typeof mealPlanResponseSchema>;
export type GetCurrentMealPlanResponse = z.infer<typeof getCurrentMealPlanResponseSchema>;
export type MealPlanHistoryResponse = z.infer<typeof mealPlanHistoryResponseSchema>;
```

`z.iso.datetime()`（オプション未指定）は `precision` 無指定・`offset: false`・`local: false` がデフォルトであり、`Date.prototype.toISOString()` が生成する `"2026-07-04T00:00:00.000Z"` 形式（ミリ秒 3 桁 + 末尾 `Z`）を過不足なく受理する（`node_modules/zod/v4/core/regexes.js` の `datetime()` 実装で確認済み）。Mapper（§6-2）の `toISOString()` 出力とスキーマの期待形式が一致する。

nullability は DTO（§6-1）と完全一致させる。

| フィールド | 型 | `null` の意味 |
|---|---|---|
| `plannedRecipeResponseSchema.scheduledDate` | `string \| null` | 日付未指定（ビュッフェ運用のデフォルト） |
| `plannedRecipeResponseSchema.cookedAt` | `string \| null` | 未調理 |
| `mealPlanResponseSchema.completedAt` | `string \| null` | `completed` 未到達 |
| `getCurrentMealPlanResponseSchema.data` | `MealPlanResponse \| null` | 現在週に MealPlan が存在しない（D-4） |

### 19-7. エラーレスポンス形式

本契約のエラーレスポンスは **2 系統が併存**する。これは新規に導入するものではなく、`apps/web/src/server/app.ts`（既存 `onError`）と `@hono/zod-validator@0.8.0` の既存デフォルト実装（`apps/web/node_modules/.pnpm/@hono+zod-validator@0.8.0.../dist/index.js` で実装確認済み: `if (!result.success) return c.json(result, 400);`）にそのまま追従する。

```typescript
// app.ts の onError が返す形（404 / 422 / 500 に共通）
export const errorResponseSchema = z.object({
  error: z.string(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
```

- **404 / 422 / 500**: `app.ts` の `onError` から返る `{ error: string }`（`errorResponseSchema` に一致）。
- **400**（Zod バリデーション失敗。json / param / query いずれも共通）: `@hono/zod-validator` の既定フックが `c.json(result, 400)` を返す。`result` は `schema.safeParseAsync()` の失敗結果そのもの（`{ success: false, error: ZodError }` 形。`ZodError` はネストしたオブジェクトで `errorResponseSchema` の `{ error: string }` とは**異なる形**）。`errorResponseSchema` は 400 には適用されない。
- 既存 `apps/web/src/server/routes/products.test.ts` の `WH-P-03`（不正ボディで 400）も `res.status` のみを検証し body 構造は検証していない。本契約もこれに倣い、400 の契約テストは「ステータスコードのみ検証」を基本方針とする（body 構造を固定契約にはしない）。

### 19-8. HTTP ステータスマッピング表

| エンドポイント | 正常 | 異常 |
|---|---|---|
| `POST /api/meal-plans` | 201 + `MealPlanResponse` | 400（`weekIdentifier` 形式不正。zValidator 既定形） |
| `GET /api/meal-plans/current` | 200 + `{ data: MealPlanResponse \| null }`（D-4） | （バリデーション対象パラメータなし） |
| `GET /api/meal-plans/history` | 200 + `MealPlanResponse[]` | 400（`limit` 不正） |
| `POST /api/meal-plans/:id/recipes` | 201 + `PlannedRecipeResponse` | 400（`id` / `recipeId` / `scaleFactor` 不正）／404（`MealPlanNotFoundError`）／422（`InvalidMealPlanStateError`） |
| `DELETE /api/meal-plans/:id/recipes/:plannedRecipeId` | 204（body なし） | 400（`id` / `plannedRecipeId` 不正）／404（`MealPlanNotFoundError` または `PlannedRecipeNotFoundError`）／422（`InvalidMealPlanStateError`） |
| 全エンドポイント共通 | — | 500（未知エラー。`{ error: 'Internal Server Error' }`） |

C-3（冪等、案 A で確定）のため **409 は発生しない**。`MealPlanAlreadyExistsError` および対応する Zod/HTTP マッピングは本契約に含めない（設計 §7-4 の「C-3 案 B 採用時のみ」の記載通り、案 A 確定により不要）。

### 19-9. 契約テスト方針（test-designer への申し送り）

要件 `docs/requirements/meal-plan-core.md` §6 の観点と対応させ、Vitest で `packages/api-contract/src/meal-plan.schema.test.ts`（新規）に実装する。試験計画の確定は test-designer が行う。

| 観点 | 対象スキーマ | 対応する要件試験観点 |
|---|---|---|
| 正常な `weekIdentifier` の `parse()` 通過 | `createMealPlanSchema` | N-01 の前提 |
| 不正フォーマット・不正暦日の reject | `createMealPlanSchema` | E-13（例: `"2026/07/04"`、`"2026-13-01"`、`"2026-02-30"`） |
| UUID 不正の reject | `mealPlanIdParamSchema` / `plannedRecipeIdParamSchema` / `addRecipeToMealPlanSchema.recipeId` | E-14 |
| `scaleFactor` 境界 | `addRecipeToMealPlanSchema` | E-05（`0`）／E-06（負数）／B-07（`0.001`）／B-08（`3`） |
| `limit` の coerce・default・境界 | `getMealPlanHistoryQuerySchema` | B-06（`limit=1`）／D-5 の `max=12`／未指定時 `default=4` |
| `limit` の異常系 | `getMealPlanHistoryQuerySchema` | `limit=0` reject／`limit=13` reject／`limit=""` reject／`limit="abc"` reject／`limit=2.5` reject |
| レスポンス構造の型往復（Mapper 出力の契約適合） | `mealPlanResponseSchema` / `plannedRecipeResponseSchema` | `toMealPlanDto` / `toPlannedRecipeDto`（§6-2）の出力が `parse()` を通過すること（store-master の型往復テストパターンを踏襲） |
| nullable フィールドの通過 | `plannedRecipeResponseSchema`（`scheduledDate` / `cookedAt`）、`mealPlanResponseSchema`（`completedAt`）、`getCurrentMealPlanResponseSchema`（`data`） | N-09（現在週に MealPlan なし → `data: null`） |
| 400 の契約は「ステータスのみ」検証（body 構造は固定契約にしない） | 全 json / param / query スキーマ | E-13 / E-14（Hono ルート統合テスト側。§19-7 参照） |
| 既存契約への非破壊確認 | `product.schema.ts` / `store.schema.ts` / `recipe.schema.ts` | 本契約は新規ファイル追加のみのため、既存 `.test.ts` が green のまま保たれること |

### 19-10. 後方互換性判定

新規ファイル `packages/api-contract/src/meal-plan.schema.ts` の追加、および `packages/api-contract/src/index.ts` への `export * from './meal-plan.schema'` 追加のみ。既存の `product.schema.ts` / `store.schema.ts` / `recipe.schema.ts` の型・エクスポートは一切変更しない。既存 API クライアント・既存データへの破壊的変更はなく、後方互換を壊さない。ユーザー確認は不要（設計 §14 の判定と同一）。

### 19-11. 未解決点（申し送り。本契約のスコープ外）

- Domain 層 `WeekIdentifier.fromString`（設計 §4-6）は曜日（土曜であること）を検証しない。本契約の `z.iso.date()` も同様に曜日検証を行わないため、**Zod と Domain の間に新たな矛盾は生じない**。
- ただし、非土曜日の `weekIdentifier`（例: `"2026-07-05"` 日曜）を `POST /api/meal-plans` に渡した場合、現行設計のままでは Zod・Domain いずれもこれを拒否せず、`MealPlan.weekOf.startDate()` が実際の土曜日と一致しない不整合な週データが生成され得る。これは Zod 契約側で解決すべき事項ではなく Domain 層（`WeekIdentifier.fromString` に曜日検証を追加するか否か）の設計判断であるため、本契約では確定しない。実装時に顕在化した場合は architecture-designer / Orchestrator へ差し戻すこと。
- `scaleFactor` に `Infinity` を渡した場合、`z.number().positive()` は `Infinity > 0` が真のため accept してしまう可能性がある（要件・設計とも上限を定めていないため契約違反ではないが、実運用上は無意味な値になり得る）。MVP1 では対応不要と判断するが、test-designer が境界値として検討する場合の参考情報として記載する。
