# Task 1: Domain 層 — MealPlan 集約の実装

## 概要

週次献立（MealPlan）のドメインモデルを実装する。既存の Product 集約
（`packages/domain/src/product/product-id.ts` / `product.ts` / `product.repository.ts`）と
同じパターンに従う。`WeekIdentifier` は土曜始まりの週を表す新規の共有値オブジェクト。

## アーキテクチャ制約

- `packages/domain` は他パッケージに依存しない（Clean Architecture の核）。ORM（Drizzle）や HTTP の型を持ち込まない
- Entity 生成は `static create()`、DB 復元は `static reconstruct()`
- 集約をまたぐ参照は ID 参照のみ（`PlannedRecipe` は `RecipeId` のみ保持。`Recipe` エンティティ自体は持たない）
- `any` 禁止、default export 禁止、型のみは `import type`、`===`/`!==`、値なしは `null`
- コメントは Why が非自明な時のみ
- Domain のエラーは**単純な `Error` を throw する**（`InvalidMealPlanStateError` 等の Application エラー型は
  Domain 層に持ち込まない。UseCase 側で変換する。README.md の R-7 参照）

## 実装対象ファイル

すべて `packages/domain/src/` 配下に新規作成する。

### 1. `meal-plan/meal-plan-id.ts` — MealPlanId 値オブジェクト

`packages/domain/src/product/product-id.ts` を一字一句パターン踏襲する。クラス名・プロパティ名のみ置換。

```typescript
import { randomUUID } from 'node:crypto';

export class MealPlanId {
  private constructor(private readonly mealPlanIdValue: string) {}
  static generate(): MealPlanId; // new MealPlanId(randomUUID())
  static fromString(value: string): MealPlanId;
  equals(other: MealPlanId): boolean;
  get value(): string;
}
```

### 2. `meal-plan/planned-recipe-id.ts` — PlannedRecipeId 値オブジェクト

同一パターン。

```typescript
export class PlannedRecipeId {
  private constructor(private readonly plannedRecipeIdValue: string) {}
  static generate(): PlannedRecipeId;
  static fromString(value: string): PlannedRecipeId;
  equals(other: PlannedRecipeId): boolean;
  get value(): string;
}
```

### 3. `shared/week-identifier.ts` — WeekIdentifier 値オブジェクト（土曜始まり）

**重要**: `docs/04-domain-model.md` に「ISO 8601 週番号で算出」という記述があるが、**採用しない**
（ADR-0005 で土曜始まり・`Date` ベースに確定済み）。

```typescript
export class WeekIdentifier {
  private constructor(private readonly weekStartDate: Date) {}

  static fromDate(date: Date): WeekIdentifier;
  static current(): WeekIdentifier; // WeekIdentifier.fromDate(new Date())
  static fromString(value: string): WeekIdentifier; // "2026-07-04" 形式

  startDate(): Date; // 防御的コピーを返す
  endDate(): Date; // 週開始日 + 6日、23:59:59.999
  next(): WeekIdentifier; // startDate() + 7日
  previous(): WeekIdentifier; // startDate() - 7日
  equals(other: WeekIdentifier): boolean;
  toString(): string; // "2026-07-04" 形式
}
```

**実装詳細（正確に従うこと）**:

- `fromDate(date)`: `daysFromSaturday = (date.getDay() + 1) % 7` で直前の土曜まで巻き戻し、
  時刻を `00:00:00.000` にリセットした**新しい** `Date` を生成する。**引数の `date` を破壊的に
  変更しない**（`setHours`/`setDate` は必ずコピーに対して行う。例: `const d = new Date(date); d.setDate(...); d.setHours(0,0,0,0);`）
- `fromString(value)`: `new Date(value + 'T00:00:00')`（ローカルタイムとして解釈させるため。`new Date(value)` だけだと UTC 解釈になり曜日がズレるリスクがある）
- `startDate()`: 内部 `weekStartDate` の防御的コピー（`new Date(this.weekStartDate)`。呼び出し元が戻り値を `setFullYear()` 等で変更しても内部状態は変わらない）
- `endDate()`: `startDate()` に 6 日加算し `23:59:59.999` を設定した新しい `Date`
- `next()`/`previous()`: `startDate()` ± 7日
- `equals(other)`: `startDate().getTime() === other.startDate().getTime()`
- **`toString()` は `toISOString().slice(0,10)` を使わない**（JS の既知の落とし穴: `Date` の内部表現は
  UTC のため、JST 深夜0時付近で日付がズレる）。`getFullYear()`/`getMonth()`/`getDate()` から手動で
  ゼロパディングして `"YYYY-MM-DD"` を組み立てること（例: `` `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` ``）

### 4. `meal-plan/meal-plan.ts` — MealPlan 集約 + PlannedRecipe エンティティ

**模範コード**: `packages/domain/src/product/product.ts`（`recordPrice`/`priceHistory` の扱い）を参照。
`RecipeId` は同パッケージ内の相対インポート: `import type { RecipeId } from '../recipe/recipe-id'`。

```typescript
export type MealPlanStatus = 'draft' | 'shopping' | 'cooking' | 'consuming' | 'completed';

export interface PlannedRecipeProps {
  id: PlannedRecipeId;
  recipeId: RecipeId;
  scaleFactor: number;
  scheduledDate: Date | null;
  cookedAt: Date | null;
  notes: string;
}

export class PlannedRecipe {
  private constructor(/* props に対応するフィールド */) {}

  static create(recipeId: RecipeId, scaleFactor: number): PlannedRecipe;
  // scaleFactor <= 0 → throw new Error('scaleFactor must be positive')
  // id = PlannedRecipeId.generate(), scheduledDate = null, cookedAt = null, notes = ''

  static reconstruct(props: PlannedRecipeProps): PlannedRecipe;
  // バリデーションなし、DB 復元専用

  scheduleFor(date: Date): void; // scheduledDate を更新
  markAsCooked(at: Date): void; // cookedAt を更新

  get id(): PlannedRecipeId;
  get recipeId(): RecipeId;
  get scaleFactor(): number;
  get scheduledDate(): Date | null; // 値がある場合は防御的コピーを返す
  get cookedAt(): Date | null; // 同上
  get notes(): string;
}

export interface MealPlanProps {
  id: MealPlanId;
  weekOf: WeekIdentifier;
  plannedRecipes: PlannedRecipe[];
  status: MealPlanStatus;
  createdAt: Date;
  completedAt: Date | null;
}

export class MealPlan {
  private constructor(/* props に対応するフィールド */) {}

  static create(weekOf: WeekIdentifier): MealPlan;
  // id = MealPlanId.generate(), status = 'draft', plannedRecipes = [], createdAt = new Date(), completedAt = null

  static reconstruct(props: MealPlanProps): MealPlan;

  addRecipe(recipeId: RecipeId, scaleFactor: number): PlannedRecipeId;
  // status が 'draft'/'shopping' 以外 → throw new Error('Cannot addRecipe to a MealPlan with status ...')
  // PlannedRecipe.create(recipeId, scaleFactor) → push → 戻り値: planned.id

  removeRecipe(plannedRecipeId: PlannedRecipeId): void;
  // status が 'draft'/'shopping' 以外 → throw Error
  // 見つからない → throw Error（'PlannedRecipe not found' 相当）

  transitionTo(newStatus: MealPlanStatus): void;
  // canTransitionTo(newStatus) が false → throw Error
  // status 更新。newStatus === 'completed' なら completedAt = new Date()

  scheduleForDay(plannedRecipeId: PlannedRecipeId, date: Date): void;
  // 対象 PlannedRecipe を検索、なければ throw Error。あれば plannedRecipe.scheduleFor(date)

  markAsCooked(plannedRecipeId: PlannedRecipeId, at: Date): void;
  // 同上パターンで plannedRecipe.markAsCooked(at)

  private canTransitionTo(newStatus: MealPlanStatus): boolean;
  // 遷移テーブルで判定

  get id(): MealPlanId;
  get weekOf(): WeekIdentifier;
  get plannedRecipes(): PlannedRecipe[]; // 防御的コピー: return [...this.plannedRecipes]
  get status(): MealPlanStatus;
  get createdAt(): Date; // 防御的コピー
  get completedAt(): Date | null; // 値がある場合は防御的コピー
}
```

**ステータス遷移テーブル**（`Record<MealPlanStatus, MealPlanStatus[]>` として定義し `canTransitionTo` に閉じ込める）:

```typescript
const TRANSITIONS: Record<MealPlanStatus, MealPlanStatus[]> = {
  draft: ['shopping'],
  shopping: ['draft', 'cooking'],
  cooking: ['consuming'],
  consuming: ['completed'],
  completed: [],
};
```

| 現在 \ 次 | draft | shopping | cooking | consuming | completed |
| --------- | ----- | -------- | ------- | --------- | --------- |
| draft     | —     | 可       | 不可    | 不可      | 不可      |
| shopping  | 可    | —        | 可      | 不可      | 不可      |
| cooking   | 不可  | 不可     | —       | 可        | 不可      |
| consuming | 不可  | 不可     | 不可    | —         | 可        |
| completed | 不可  | 不可     | 不可    | 不可      | —         |

### 5. `meal-plan/meal-plan.repository.ts` — MealPlanRepository インターフェース

```typescript
import type { MealPlan } from './meal-plan';
import type { MealPlanId } from './meal-plan-id';
import type { WeekIdentifier } from '../shared/week-identifier';

export interface MealPlanRepository {
  findById(id: MealPlanId): Promise<MealPlan | null>;
  findByWeek(weekIdentifier: WeekIdentifier): Promise<MealPlan | null>;
  findRecent(limit: number): Promise<MealPlan[]>;
  save(mealPlan: MealPlan): Promise<void>;
}
```

`delete` は Sprint 3 スコープ外のため定義しない。

## 命名・記法の注意

- `MealPlanId`/`PlannedRecipeId` のプロパティ名は `mealPlanIdValue`/`plannedRecipeIdValue`
  （`ProductId` の `productIdValue` と同じ命名規則）
- `scheduleForDay`/`markAsCooked` は API 非公開だが**ドメインメソッドとしては実装対象**（削除しない）
- `plannedRecipes` getter・`createdAt`/`completedAt`/`scheduledDate`/`cookedAt` の Date 系 getter は
  すべて防御的コピーを返すこと（呼び出し元が変更しても内部状態が変わらない）

## テスト

テストランナーは Vitest。co-located（`src/**/*.test.ts`）で配置する。

### `meal-plan/meal-plan-id.test.ts`

- `generate()` が UUID 形式を返す。2回呼ぶと異なる値
- `fromString()` の往復一致、`equals()` の true/false
- `planned-recipe-id.test.ts` として `PlannedRecipeId` も同一パターンで作成

### `shared/week-identifier.test.ts`

- 土曜 `00:00:00` → 当日が週開始日。金曜 `23:59:59.999` → 直前の土曜が週開始日
- 土曜 `23:59:59.999` → 同じ週開始日（土曜 `00:00:00` と同一週）
- `current()`: `vi.setSystemTime()` で土曜・金曜それぞれに固定してテスト
- `endDate()`: 週開始日 + 6日 `23:59:59.999`
- `next()`/`previous()`: それぞれ7日後・7日前の週
- `equals()`: 同一週開始日で true、異なる週開始日で false
- **年またぎ週**: `2027-01-01`（金曜）を渡すと `weekStartDate` が `2026-12-26` になる
- `fromString("2026-07-04").toString() === "2026-07-04"` のラウンドトリップ
- **回帰テスト**: `toString()` が `toISOString().slice(0,10)` 実装だと TZ 依存でズレる可能性がある点を
  明示的に検証するテストケースを含める（`WeekIdentifier.fromString('2026-07-04').toString() === '2026-07-04'`）
- `startDate()`/`endDate()` の戻り値を変更しても内部状態が変わらない（防御的コピー確認）

### `meal-plan/meal-plan.test.ts`

- `PlannedRecipe.create()`: `scaleFactor <= 0` で throw、`0.001`/`3`/`1.5` は正常、初期値
  （`scheduledDate`/`cookedAt` が `null`、`notes` が `''`）を確認
- `PlannedRecipe.reconstruct()`: バリデーションを経ず props 通りに復元される
- `scheduleFor()`/`markAsCooked()`: 値が正しく設定される
- `MealPlan.create()`: `status === 'draft'`、`plannedRecipes` が空配列、`completedAt === null`
- `MealPlan.reconstruct()`: バリデーションなしで props 通り復元
- `addRecipe()`: draft/shopping で成功、cooking/consuming/completed で throw。
  同一 recipeId を2回追加すると別 `PlannedRecipeId` で2件作成される（重複許容）
- `removeRecipe()`: draft/shopping で成功、cooking以降で throw。存在しない ID で throw
- **ステータス遷移14経路を全て検証**（可能な5経路 + 不可能な9経路。「completed→any」は
  draft/shopping/cooking/consuming/completed の5パターン全てを個別に検証する）。
  `consuming→completed` 遷移時に `completedAt` が設定されることを確認
- `scheduleForDay()`/`markAsCooked()`（MealPlan 側）: 存在しない `plannedRecipeId` で throw
- 防御性: `plannedRecipes`/`createdAt`/`completedAt` の getter が防御的コピーを返す
  （取得した配列に `push` しても内部状態が変わらない、取得した Date を変更しても内部状態が変わらない）

## 完了条件

```bash
pnpm --filter @cookpit/domain test        # 全 green
pnpm --filter @cookpit/domain type-check  # 通過
pnpm lint                                  # 通過
```

- `MealPlanId`/`PlannedRecipeId`/`WeekIdentifier`/`MealPlan`/`PlannedRecipe`/`MealPlanRepository` が
  全て実装されている
- ステータス遷移14経路すべてにテストケースが存在する
- 他パッケージへの依存が `node:crypto` と同パッケージ内の `RecipeId` 参照のみ
