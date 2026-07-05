# 試験計画: meal-plan-core

- 作成日: 2026-07-05
- 対象スプリント: Sprint 3 Unit A
- 関連設計書: `docs/designs/meal-plan-core.md`（確定・2026-07-05）
- 関連要件書: `docs/requirements/meal-plan-core.md`
- 関連実装計画: `docs/implementation-plans/meal-plan-core.md`（ready）
- 変更レベル: L3（Domain / Application / Infrastructure / API-Contract / Presentation 全層）
- 実装状況: **未実装**（本計画は実装着手前に試験観点を先出しする。コードは存在しない。
  implementer は本計画の観点を co-located Vitest テストとして実装する）

---

## 1. 概要・前提

### 1-1. テスト対象コンポーネント（実装計画 §変更対象ファイル一覧に対応）

| 層 | コンポーネント | ファイル（実装後の想定パス） |
|---|---|---|
| Domain | `MealPlanId` | `packages/domain/src/meal-plan/meal-plan-id.ts` |
| Domain | `PlannedRecipeId` | `packages/domain/src/meal-plan/planned-recipe-id.ts` |
| Domain | `WeekIdentifier` | `packages/domain/src/shared/week-identifier.ts` |
| Domain | `MealPlan`（集約）/ `PlannedRecipe`（集約内エンティティ）/ `MealPlanStatus` | `packages/domain/src/meal-plan/meal-plan.ts` |
| Domain | `MealPlanRepository`（インターフェース） | `packages/domain/src/meal-plan/meal-plan.repository.ts` |
| Application | `MealPlanDto` / `PlannedRecipeDto` / 各 InputDto | `packages/application/src/meal-plan/meal-plan.dto.ts` |
| Application | `toMealPlanDto` / `toPlannedRecipeDto` | `packages/application/src/meal-plan/meal-plan.mapper.ts` |
| Application | `MealPlanNotFoundError` / `PlannedRecipeNotFoundError` / `InvalidMealPlanStateError` | `packages/application/src/meal-plan/*.error.ts` |
| Application | `CreateMealPlanUseCase` / `AddRecipeToMealPlanUseCase` / `RemoveRecipeFromMealPlanUseCase` / `GetCurrentMealPlanUseCase` / `GetMealPlanHistoryUseCase` | `packages/application/src/meal-plan/*.use-case.ts` |
| Infrastructure | `DrizzleMealPlanRepository` | `packages/infrastructure/src/repositories/drizzle-meal-plan.repository.ts` |
| Infrastructure | `meal_plans` / `planned_recipes` スキーマ・PGlite DDL | `packages/infrastructure/src/db/schema.ts`、`packages/infrastructure/src/testing/create-test-db.ts`（G-2 追記前提） |
| API Contract | 5 リクエストスキーマ + レスポンススキーマ群 + `errorResponseSchema` | `packages/api-contract/src/meal-plan.schema.ts` |
| Presentation | `mealPlansRoute`（5 エンドポイント） | `apps/web/src/server/routes/meal-plans.ts` |
| Presentation | `app.ts` の `onError` 追加分岐 | `apps/web/src/server/app.ts` |

### 1-2. 既存テストの有無

meal-plan 関連のテストは現時点で**存在しない**（Glob 確認済み。`packages/domain/src/meal-plan/`・`packages/domain/src/shared/week-identifier.ts` 等は未作成）。
以下の既存テストを実装パターンの先例として参照する。

| 参照先 | パターン |
|---|---|
| `apps/web/src/server/routes/products.test.ts` | Hono テストクライアント（`app.request()`）、`vi.mock('@/db/client')` + `vi.mock('@cookpit/application')` で UseCase をモック化 |
| `packages/application/src/product/product-use-cases.test.ts` | `InMemoryProductRepository`（`saveCount`/`deletedIds` 等の副作用カウンタを持つテストダブル） |
| `packages/infrastructure/src/repositories/drizzle-product.repository.test.ts` + `packages/infrastructure/src/testing/create-test-db.ts` | PGlite 統合テスト。`DDL` 定数への手動 CREATE TABLE 追記が必須 |
| `docs/tests/store-master.md` | 本計画のセクション構成・観点 ID 採番方式の先例 |

### 1-3. スコープ外（要件書 §1-2・設計書 §2 に整合）

- 画面・UI 実装（Unit B）。本 Unit A に E2E（Playwright）観点は含めない（詳細は §12）
- ステータス遷移 API・`markAsCooked`/`scheduleForDay` API エンドポイントの公開試験（**ドメインロジックとしては実装対象のため Domain 単体試験には含める**。API 経由の試験のみ対象外）
- ShoppingList 連携試験
- `MealPlanAlreadyExistsError`（409）関連試験。C-3 は案 A（冪等）で確定済みのため発生しない（要件 E-15 は不採用側のケースとして「対象外」— §9 参照）

---

## 2. 試験レイヤ構成

| レイヤ | 何を検証するか | テストランナー | 備考 |
|---|---|---|---|
| Domain 単体 | `WeekIdentifier`（土曜始まり週境界・年またぎ・ラウンドトリップ）、`MealPlanId`/`PlannedRecipeId`、`MealPlan`/`PlannedRecipe` の生成・状態遷移・不変条件・防御的コピー | Vitest（co-located、外部 I/O なし） | 最も手厚く検証する層。ステータス遷移 14 経路を悉皆的にカバー |
| Application UseCase（モック Repository） | 5 UseCase の入出力・エラー投げ分け・冪等性。`InMemoryMealPlanRepository` を実装して DB を使わず検証 | Vitest（co-located） | Product 先例（`InMemoryProductRepository`）を踏襲 |
| Infrastructure Repository（PGlite 統合） | `DrizzleMealPlanRepository` の save/findById/findByWeek/findRecent。JOIN 復元・upsert・`NOT IN` 削除・`numeric`/`date` 型変換 | Vitest + `@electric-sql/pglite` | **前提**: `create-test-db.ts` の DDL に `meal_plans`/`planned_recipes` の `CREATE TABLE` が追記されていること（実装計画 G-2）。未追記の場合は本層の全ケースが DB エラーで失敗する |
| Presentation Hono ルート（テストクライアント） | 5 エンドポイントの成功系・400/404/422、`GET /current` の 200+`{data:null}`（D-4）、`onError` マッピング | Vitest + Hono `app.request()` | UseCase をモック化し配線のみ検証（Product 先例踏襲） |
| API Contract（契約テスト） | Zod スキーマの `parse()`/`safeParse()`。正常通過・不正 reject・coerce・default・レスポンス型往復 | Vitest（**導入前提**。実装計画 G-3 で `packages/api-contract` に Vitest 未導入と判明。E-6/N-25a で導入後にのみ実行可能） | 導入前は観点だけ残し「未実装（基盤整備待ち）」と明記する |

---

## 3. 公開 API 網羅チェック

実装計画の新規作成ファイル一覧（N-1〜N-27）から全 public メソッド・static ファクトリ・ゲッターを列挙し、対応する試験観点 ID を付す。

### 3-1. `MealPlanId` / `PlannedRecipeId`

| メソッド | 試験観点 |
|---|---|
| `static generate(): MealPlanId` | D-ID-01, D-ID-02 |
| `static fromString(value: string): MealPlanId` | D-ID-03 |
| `equals(other: MealPlanId): boolean` | D-ID-04, D-ID-05 |
| `get value(): string` | D-ID-03（副次確認） |
| `PlannedRecipeId` の同名メソッド一式 | D-PRID-01〜D-PRID-05（同一パターン） |

### 3-2. `WeekIdentifier`

| メソッド | 試験観点 |
|---|---|
| `static fromDate(date: Date): WeekIdentifier` | D-WI-01〜D-WI-04, D-WI-12 |
| `static current(): WeekIdentifier` | D-WI-05, D-WI-06 |
| `static fromString(value: string): WeekIdentifier` | D-WI-13（ラウンドトリップ） |
| `startDate(): Date` | D-WI-01, D-WI-15（防御的コピー） |
| `endDate(): Date` | D-WI-07, D-WI-15 |
| `next(): WeekIdentifier` | D-WI-08 |
| `previous(): WeekIdentifier` | D-WI-09 |
| `equals(other: WeekIdentifier): boolean` | D-WI-10, D-WI-11 |
| `toString(): string` | D-WI-01, D-WI-13, D-WI-14（JST/UTC ズレ回帰） |

### 3-3. `PlannedRecipe`（集約内エンティティ）

| メソッド | 試験観点 |
|---|---|
| `static create(recipeId: RecipeId, scaleFactor: number): PlannedRecipe` | D-PR-01〜D-PR-05 |
| `static reconstruct(props: PlannedRecipeProps): PlannedRecipe` | D-PR-06 |
| `scheduleFor(date: Date): void` | D-SCH-01 |
| `markAsCooked(at: Date): void` | D-COOK-01 |
| `get id/recipeId/scaleFactor/scheduledDate/cookedAt/notes` | D-PR-05, D-PR-09（防御的コピー） |

### 3-4. `MealPlan`（集約ルート）

| メソッド | 試験観点 |
|---|---|
| `static create(weekOf: WeekIdentifier): MealPlan` | D-MP-01, D-MP-02 |
| `static reconstruct(props: MealPlanProps): MealPlan` | D-MP-03 |
| `addRecipe(recipeId, scaleFactor): PlannedRecipeId` | D-AR-01〜D-AR-08 |
| `removeRecipe(plannedRecipeId): void` | D-RR-01〜D-RR-05 |
| `transitionTo(newStatus): void` | T-01〜T-14（§4-5） |
| `scheduleForDay(plannedRecipeId, date): void` | D-SCH-01, D-SCH-02 |
| `markAsCooked(plannedRecipeId, at): void` | D-COOK-01, D-COOK-02 |
| `private canTransitionTo(newStatus): boolean` | 直接呼び出し不可（private）。`transitionTo` 経由で間接的に T-01〜T-14 が全分岐を踏む |
| `get id/weekOf/plannedRecipes/status/createdAt/completedAt` | D-MP-04, D-MP-05（防御的コピー）、D-TR-15（`completedAt` 副作用） |

### 3-5. `MealPlanRepository`（インターフェース）

インターフェース自体はテスト対象外。実装（`DrizzleMealPlanRepository`）を通じて I-01〜I-18 で間接的に検証する。

### 3-6. `toMealPlanDto` / `toPlannedRecipeDto`

| 関数 | 試験観点 |
|---|---|
| `toMealPlanDto(mealPlan): MealPlanDto` | A-CR-01（間接）, Z-22（契約型往復） |
| `toPlannedRecipeDto(plannedRecipe): PlannedRecipeDto` | A-ADD-01（間接）, Z-23（契約型往復） |

Mapper 単体の専用テストファイルは設計・実装計画に明記がないため、UseCase テスト内の DTO 検証と契約テストの型往復で代替する（Store 先例の `store.mapper.test.ts` のような単独ファイルは本 Unit のファイル一覧に含まれていない。もし implementer が Mapper 専用テストを追加する場合は歓迎するが必須にはしない）。

### 3-7. エラークラス 3 本

| クラス | 試験観点 |
|---|---|
| `MealPlanNotFoundError` | A-ADD-05, A-REM-02（`message`/`name` 確認込み） |
| `PlannedRecipeNotFoundError` | A-REM-03 |
| `InvalidMealPlanStateError` | A-ADD-06〜08, A-REM-04（`current`/`operation` を含む message 確認） |

### 3-8. UseCase 5 本

| UseCase | 試験観点 |
|---|---|
| `CreateMealPlanUseCase.execute()` | A-CR-01〜A-CR-04 |
| `AddRecipeToMealPlanUseCase.execute()` | A-ADD-01〜A-ADD-10 |
| `RemoveRecipeFromMealPlanUseCase.execute()` | A-REM-01〜A-REM-04 |
| `GetCurrentMealPlanUseCase.execute()` | A-CUR-01, A-CUR-02 |
| `GetMealPlanHistoryUseCase.execute()` | A-HIST-01〜A-HIST-05 |

### 3-9. `DrizzleMealPlanRepository`

| メソッド | 試験観点 |
|---|---|
| `findById(id)` | I-03, I-04 |
| `findByWeek(weekIdentifier)` | I-05, I-06 |
| `findRecent(limit)` | I-07〜I-09 |
| `save(mealPlan)` | I-01, I-02, I-10〜I-13, I-16, I-17 |

### 3-10. `meal-plan.schema.ts`（Zod）

| スキーマ | 試験観点 |
|---|---|
| `createMealPlanSchema` | Z-01〜Z-05 |
| `addRecipeToMealPlanSchema` | Z-08〜Z-13 |
| `mealPlanIdParamSchema` | Z-06 |
| `plannedRecipeIdParamSchema` | Z-07 |
| `getMealPlanHistoryQuerySchema` | Z-14〜Z-21 |
| `mealPlanResponseSchema` / `plannedRecipeResponseSchema` / `getCurrentMealPlanResponseSchema` / `mealPlanHistoryResponseSchema` | Z-22〜Z-25 |
| `errorResponseSchema` | Z-26 の一部（既存 `{error}` 形式との整合確認） |

### 3-11. `mealPlansRoute`（Hono、5 エンドポイント）

| エンドポイント | 試験観点 |
|---|---|
| `POST /api/meal-plans` | P-01, P-02 |
| `GET /api/meal-plans/current` | P-03, P-04 |
| `GET /api/meal-plans/history` | P-05, P-06 |
| `POST /api/meal-plans/:id/recipes` | P-07〜P-10 |
| `DELETE /api/meal-plans/:id/recipes/:plannedRecipeId` | P-11〜P-14 |
| `onError` 追加分岐（3 種） | P-09, P-10, P-12〜P-14 |

---

## 4. Domain 層試験観点

テストランナー: Vitest（co-located）。ファイル: `packages/domain/src/meal-plan/meal-plan-id.test.ts`、
`packages/domain/src/meal-plan/meal-plan.test.ts`、`packages/domain/src/shared/week-identifier.test.ts`。

### 4-1. `MealPlanId` / `PlannedRecipeId`

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| D-ID-01 | — | `MealPlanId.generate()` | UUID 形式（`/^[0-9a-f-]{36}$/`）の値を持つ | 正常 |
| D-ID-02 | — | `MealPlanId.generate()` を2回 | `equals()` が `false`（毎回異なる UUID） | 正常 |
| D-ID-03 | — | `MealPlanId.fromString('id-1')` | `.value === 'id-1'` | 正常 |
| D-ID-04 | 同一文字列から生成した2つの ID | `a.equals(b)` | `true` | 正常 |
| D-ID-05 | 異なる文字列から生成した2つの ID | `a.equals(b)` | `false` | 正常 |
| D-PRID-01〜05 | 同上 | `PlannedRecipeId` に同一パターン | 同上 | 正常 |

### 4-2. `WeekIdentifier`（重点試験）

**方針**: `current()` の検証は `vitest.setSystemTime()` で現在日時を固定してから呼び出す。
`beforeEach`/`afterEach` で `vi.useFakeTimers()` / `vi.useRealTimers()` を対にする。

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| D-WI-01 (B-01) | `date = new Date('2026-07-04T00:00:00')`（土曜） | `WeekIdentifier.fromDate(date)` | `startDate().getTime() === date.getTime()`、`toString() === '2026-07-04'` | 境界 |
| D-WI-02 (B-03) | `date = new Date('2026-07-04T23:59:59.999')`（同じ土曜の終端） | `WeekIdentifier.fromDate(date)` | `startDate()` は `2026-07-04T00:00:00`（B-01 と同一週）、`.equals()` で D-WI-01 のインスタンスと `true` | 境界 |
| D-WI-03 (B-02) | `date = new Date('2026-07-10T23:59:59.999')`（金曜の終端） | `WeekIdentifier.fromDate(date)` | `startDate()` が直前の土曜 `2026-07-04T00:00:00` を返す | 境界 |
| D-WI-04 | `date` を日〜木（2026-07-05〜09）の各曜日で用意 | 各日付で `fromDate(date)` | 全て `toString() === '2026-07-04'`（同一週に属する。要件外だが `fromDate` の網羅性確保のため追加） | 境界（追加） |
| D-WI-05 (B-04) | `vi.setSystemTime(new Date('2026-07-04T10:00:00'))`（土曜） | `WeekIdentifier.current()` | `toString() === '2026-07-04'` | 境界 |
| D-WI-06 (B-05) | `vi.setSystemTime(new Date('2026-07-10T10:00:00'))`（金曜） | `WeekIdentifier.current()` | `toString() === '2026-07-04'`（6日前の土曜） | 境界 |
| D-WI-07 | `WeekIdentifier.fromString('2026-07-04')` | `endDate()` | `2026-07-10T23:59:59.999`（ローカルタイム。`getFullYear/getMonth/getDate/getHours/getMinutes/getSeconds/getMilliseconds` を個別 assert） | 正常 |
| D-WI-08 | 同上 | `next().toString()` | `'2026-07-11'` | 正常 |
| D-WI-09 | 同上 | `previous().toString()` | `'2026-06-27'` | 正常 |
| D-WI-10 | 同一週開始日から生成した2つの `WeekIdentifier` | `a.equals(b)` | `true` | 正常 |
| D-WI-11 | 異なる週開始日 | `a.equals(b)` | `false` | 正常 |
| D-WI-12 (B-11) | `date = new Date('2027-01-01T00:00:00')`（金曜、年またぎ週の終端） | `WeekIdentifier.fromDate(date).toString()` | `'2026-12-26'`（年をまたいでも週開始日が前年内に正しく算出される） | 境界 |
| D-WI-13 | 複数の日付文字列（`'2026-07-04'`, `'2026-01-01'`, `'2026-12-26'`） | `WeekIdentifier.fromString(s).toString()` | 各 `s` に対して `=== s`（ラウンドトリップが恒等） | 正常 |
| D-WI-14（R-4回帰） | `WeekIdentifier.fromString('2026-07-04')`（local midnight 構築） | `toString()` | `'2026-07-04'`。**実装が `toISOString().slice(0,10)` を使っている場合、テスト環境の TZ 設定次第でズレて失敗し得る回帰検知テスト**として位置づける（実装計画 R-4 対応確認） | 防御性 |
| D-WI-15 | `const wi = WeekIdentifier.fromString('2026-07-04'); const d = wi.startDate();` | `d.setFullYear(2099)` | 直後に `wi.startDate().getFullYear()` を再取得すると `2026` のまま（getter が防御的コピーを返す。`endDate()` も同様に確認） | 防御性 |

**試験データ・環境の注意**: `fromDate`/`current` はサーバーの実行 TZ（JST 前提。設計 §4-6）に依存する。Vitest 実行環境の `TZ` が未設定の場合、CI 環境依存でテストが不安定になる可能性がある。`vitest.config` または該当テストファイルの `beforeAll` で `process.env.TZ` を固定するか、日付文字列に時刻を明示（`'T00:00:00'`）してローカル解釈を安定させる。既存 `product.test.ts` 等が `new Date('...T00:00:00.000Z')`（UTC 明示）を使っているのに対し、`WeekIdentifier` はローカルタイム前提の設計のため、Z サフィックスを付けない日付リテラルを意図的に使うこと（つけると UTC 解釈になり `getDay()` がズレるリスクがある）。

### 4-3. `PlannedRecipe.create()` / `reconstruct()`

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| D-PR-01 (B-07) | — | `PlannedRecipe.create(recipeId, 0.001)` | 正常に生成される（`scaleFactor === 0.001`） | 境界 |
| D-PR-02 (B-08) | — | `PlannedRecipe.create(recipeId, 3)` | 正常に生成される（整数も許容） | 境界 |
| D-PR-03 | — | `PlannedRecipe.create(recipeId, 0)` | `Error('scaleFactor must be positive')` を throw | 異常 |
| D-PR-04 | — | `PlannedRecipe.create(recipeId, -1)` | `Error` を throw（負数） | 異常 |
| D-PR-05 | — | `PlannedRecipe.create(recipeId, 1.5)` | `scheduledDate === null`、`cookedAt === null`、`notes === ''`（初期値確認） | 正常 |
| D-PR-06 | 任意の `PlannedRecipeProps`（`scaleFactor: 0` を含む） | `PlannedRecipe.reconstruct(props)` | バリデーションを通さず props 通りに復元される（DB 復元専用の非検証経路を確認） | 正常 |
| D-PR-09 | `scheduleFor(date)` 実行済みの PlannedRecipe | `const d = pr.scheduledDate; d?.setFullYear(2099);` | 再度 `pr.scheduledDate` を取得すると変更前の値のまま（getter の防御的コピー） | 防御性 |

### 4-4. `PlannedRecipe.scheduleFor()` / `markAsCooked()`（ドメインには実装するが API 非公開。§1-3 参照）

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| D-SCH-01 | `PlannedRecipe.create(recipeId, 1)` | `pr.scheduleFor(new Date('2026-07-06T00:00:00'))` | `pr.scheduledDate` が指定日と一致 | 正常 |
| D-COOK-01 | 同上 | `pr.markAsCooked(new Date('2026-07-06T18:00:00'))` | `pr.cookedAt` が指定日時と一致 | 正常 |

### 4-5. `MealPlan.addRecipe()` / `removeRecipe()`（status ガード）

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| D-AR-01 (N-03) | `MealPlan.create(weekOf)`（status=draft） | `mealPlan.addRecipe(recipeId, 1)` | `PlannedRecipeId` が返り、`mealPlan.plannedRecipes` に1件追加される | 正常 |
| D-AR-02 (N-04) | draft から `transitionTo('shopping')` 済み | `addRecipe(recipeId, 1)` | 同上（shopping でも許可） | 正常 |
| D-AR-03 (N-05) | status=draft | `addRecipe(recipeId, 1.5)` | 追加された `PlannedRecipe.scaleFactor === 1.5` | 正常 |
| D-AR-04 (N-06 / B-10) | status=draft、同一 `recipeId` | `addRecipe(recipeId, 1)` を2回 | 2件の `PlannedRecipe` が作成され、それぞれ異なる `PlannedRecipeId`（重複許容） | 境界 |
| D-AR-05 | status=cooking（draft→shopping→cooking 遷移済み） | `addRecipe(recipeId, 1)` | `Error`（`Cannot addRecipe...`）を throw、`plannedRecipes` は変化しない | 異常 |
| D-AR-06 | status=consuming | `addRecipe(recipeId, 1)` | `Error` を throw | 異常 |
| D-AR-07 | status=completed | `addRecipe(recipeId, 1)` | `Error` を throw | 異常 |
| D-AR-08 | status=draft | `addRecipe(recipeId, 0)` | `Error('scaleFactor must be positive')` を throw（`PlannedRecipe.create` 内部の二重防御。Hono の Zod バリデーションをバイパスした場合の Domain 側保護を確認） | 異常・防御性 |
| D-RR-01 (N-07) | status=draft、`addRecipe` 済みの `plannedRecipeId` | `mealPlan.removeRecipe(plannedRecipeId)` | `plannedRecipes` から該当エンティティが削除される | 正常 |
| D-RR-02 (E-09) | status=cooking、`plannedRecipes` に1件存在 | `removeRecipe(plannedRecipeId)` | `Error` を throw、削除されない | 異常 |
| D-RR-03 | status=consuming | 同上 | `Error` を throw | 異常 |
| D-RR-04 | status=completed | 同上 | `Error` を throw | 異常 |
| D-RR-05 (B-09) | status=draft、`plannedRecipes` が0件 | `removeRecipe(存在しないID)` | `Error`（PlannedRecipe not found 相当）を throw | 境界 |

### 4-6. ステータス遷移の全 14 経路（要件 §6-4）

`MealPlan.transitionTo(newStatus)` を全 14 組み合わせで悉皆テストする。`describe.each` または個別 `it()` のいずれでもよいが、**14 行すべてに対応するテストケースが存在すること**を完了条件とする。

| # | 経路 | 可否 | 対応する要件 ID | 期待結果 |
|---|---|---|---|---|
| T-01 | draft → shopping | 可 | N-13 | `status === 'shopping'`、`completedAt` は `null` のまま |
| T-02 | shopping → draft | 可 | N-14 | `status === 'draft'`（やり直し） |
| T-03 | shopping → cooking | 可 | N-15（前段） | `status === 'cooking'` |
| T-04 | cooking → consuming | 可 | N-15（中段） | `status === 'consuming'` |
| T-05 | consuming → completed | 可 | N-15（後段） | `status === 'completed'`、**`completedAt` が `new Date()` 相当の値に設定される**（設定前は `null` だったことも確認） |
| T-06 | draft → cooking | 不可 | E-10 | `Error` を throw、`status` は変化しない |
| T-07 | draft → consuming | 不可 | （追加） | `Error` を throw |
| T-08 | draft → completed | 不可 | （追加） | `Error` を throw |
| T-09 | cooking → draft | 不可 | E-11 | `Error` を throw |
| T-10 | cooking → shopping | 不可 | （追加） | `Error` を throw |
| T-11 | consuming → draft | 不可 | （追加） | `Error` を throw |
| T-12 | consuming → shopping | 不可 | （追加） | `Error` を throw |
| T-13 | consuming → cooking | 不可 | （追加） | `Error` を throw |
| T-14 | completed → draft/shopping/cooking/consuming/completed（全5パターン） | 不可 | E-12（completed→completed を代表例として明記） | 5パターン全てで `Error` を throw。`completedAt` は変化しない |

備考: 要件書 §6-4 の表は「completed → any」を1行にまとめているため、T-14 は実際には 5 サブケース（completed→draft, →shopping, →cooking, →consuming, →completed）を意味する。本試験計画では全サブケースを個別にテストすることを推奨する（`for (const target of ['draft','shopping','cooking','consuming','completed'])` のループでも可）。

### 4-7. 防御性（不変条件・防御的コピー・副作用検証）

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| D-MP-01 | — | `MealPlan.create(weekOf)` | `status === 'draft'`、`plannedRecipes` が空配列、`completedAt === null`、`id` が UUID 形式 | 正常 |
| D-MP-02 | — | `MealPlan.create(weekOf)` を2回 | 各 `id` が異なる | 正常 |
| D-MP-03 | 任意の `MealPlanProps` | `MealPlan.reconstruct(props)` | バリデーションを経ずに props 通り復元される（例: `status: 'completed'` かつ `plannedRecipes` に不正な要素があっても reconstruct は拒否しない） | 正常 |
| D-MP-04 | `addRecipe` 済みの `MealPlan` | `const arr = mealPlan.plannedRecipes; arr.push(dummyPlannedRecipe);` | 直後に再取得した `mealPlan.plannedRecipes.length` は変化しない（getter が `[...this.plannedRecipes]` の防御的コピーを返す。実装計画 Step 3 の完了条件に明記） | 防御性 |
| D-MP-05 | `MealPlan.create(weekOf)` | `const d = mealPlan.createdAt; d.setFullYear(2099);` | 再取得した `mealPlan.createdAt.getFullYear()` は変化しない | 防御性 |
| D-TR-15 | `MealPlan` を draft→shopping→cooking→consuming と遷移させた状態（`completedAt` はまだ `null`） | `transitionTo('completed')` | 遷移前は `completedAt === null`、遷移後は `completedAt` が `Date` インスタンスかつ現在時刻近傍（副作用: 完了時刻の記録） | 防御性・副作用 |
| D-SCH-02 | `plannedRecipes` に対象 ID が存在しない `MealPlan` | `mealPlan.scheduleForDay(存在しないID, date)` | `Error`（PlannedRecipe not found 相当）を throw | 異常 |
| D-COOK-02 | 同上 | `mealPlan.markAsCooked(存在しないID, at)` | `Error` を throw | 異常 |

---

## 5. Application 層試験観点（UseCase、InMemory Repository）

テストランナー: Vitest（co-located: `packages/application/src/meal-plan/meal-plan-use-cases.test.ts`）。
`InMemoryMealPlanRepository`（`ProductRepository` 先例踏襲。`findById`/`findByWeek`/`findRecent`/`save` を実装し、`saveCount` で副作用を観測する）を実装する。

### 5-1. `CreateMealPlanUseCase`（冪等性含む。C-3）

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| A-CR-01 (N-01) | `InMemoryMealPlanRepository`（空） | `execute({ weekIdentifier: '2026-07-04' })` | `dto.status === 'draft'`、`dto.plannedRecipes === []`、`dto.weekIdentifier === '2026-07-04'`、`repository.saveCount === 1` | 正常 |
| A-CR-02 (N-02) | 上記実行済み（同一週の MealPlan が既存） | 同一 `weekIdentifier` で再度 `execute()` | 既存と同一の `id` を持つ `MealPlanDto` が返る。**`repository.saveCount` が2回目実行後も `1` のまま**（新規 `save` が発生しない＝重複作成なし） | 冪等性 |
| A-CR-03 | 既存 MealPlan の status が `cooking`（draft 以外） | 同一週で `execute()` | ステータスに関わらず既存の `MealPlanDto`（`status: 'cooking'`）がそのまま返る（C-3 確定: draft 以外でも冪等） | 冪等性 |
| A-CR-04 | — | `execute({ weekIdentifier: '2026-07-04' })` | `dto.weekIdentifier === '2026-07-04'`（`WeekIdentifier.fromString` → `toMealPlanDto` の往復が入力と一致） | 正常 |

### 5-2. `AddRecipeToMealPlanUseCase`

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| A-ADD-01 (N-03) | status=draft の MealPlan が repository に seed 済み | `execute({ mealPlanId, recipeId, scaleFactor: 1 })` | `PlannedRecipeDto` が返り、`recipeId`/`scaleFactor` が入力と一致 | 正常 |
| A-ADD-02 (N-04) | status=shopping | 同上 | 同上（shopping でも成功） | 正常 |
| A-ADD-03 (N-05) | status=draft | `scaleFactor: 1.5` | `dto.scaleFactor === 1.5` | 正常 |
| A-ADD-04 (N-06) | status=draft | 同一 `recipeId` で2回 `execute()` | 2件の `PlannedRecipeDto` が異なる `id` で返る | 正常 |
| A-ADD-05 (E-01) | repository が空（対象 `mealPlanId` 不存在） | `execute({ mealPlanId: '不存在', ... })` | `MealPlanNotFoundError` を throw | 異常 |
| A-ADD-06 (E-02) | status=cooking の MealPlan | `execute(...)` | `InvalidMealPlanStateError` を throw、`repository.saveCount` は増加しない | 異常 |
| A-ADD-07 (E-03) | status=consuming | 同上 | `InvalidMealPlanStateError` を throw | 異常 |
| A-ADD-08 (E-04) | status=completed | 同上 | `InvalidMealPlanStateError` を throw | 異常 |
| A-ADD-09 (E-05/E-06 UseCase 入口の二重防御) | status=draft | `execute({ ..., scaleFactor: 0 })` および `scaleFactor: -1` | Domain の `PlannedRecipe.create` 経由でエラーが伝搬する（UseCase は Zod を経由しないため、UseCase 単体では Domain のガードのみで保護されることを確認） | 異常・防御性 |
| A-ADD-10 | status=draft | `execute(...)` 成功後 | `repository.saveCount === 1`（`findById` → `addRecipe` → `save` の一連が実行される） | 正常 |

### 5-3. `RemoveRecipeFromMealPlanUseCase`

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| A-REM-01 (N-07) | status=draft、`plannedRecipeId` が存在 | `execute({ mealPlanId, plannedRecipeId })` | `void` が返り、`save` 後の MealPlan から該当 PlannedRecipe が消えている | 正常 |
| A-REM-02 (E-07) | `mealPlanId` 不存在 | `execute(...)` | `MealPlanNotFoundError` を throw | 異常 |
| A-REM-03 (E-08) | MealPlan は存在するが `plannedRecipeId` が不一致 | `execute(...)` | `PlannedRecipeNotFoundError` を throw | 異常 |
| A-REM-04 (E-09) | status=cooking 以降（cooking/consuming/completed の3パターン） | `execute(...)` | `InvalidMealPlanStateError` を throw、`save` は呼ばれない | 異常 |

### 5-4. `GetCurrentMealPlanUseCase`

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| A-CUR-01 (N-08) | `asOf = new Date('2026-07-04T10:00:00')` の週に MealPlan を seed | `execute(asOf)` | 対象 `MealPlanDto` が返る | 正常 |
| A-CUR-02 (N-09) | `asOf` の週に MealPlan が存在しない | `execute(asOf)` | `null` が返る | 正常 |

`asOf` 引数（設計 §6-4 の「単体テストでの現在日時制御用」）を利用し、`vi.setSystemTime()` に頼らずテストの決定性を確保する。

### 5-5. `GetMealPlanHistoryUseCase`

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| A-HIST-01 (N-10) | 5週分の MealPlan を seed（週開始日が異なる） | `execute({ limit: 4 })` | 週の新しい順で4件返る | 正常 |
| A-HIST-02 (N-11) | 2週分のみ seed | `execute({ limit: 4 })` | 実件数（2件）のみ返る。エラーなし | 正常 |
| A-HIST-03 (N-12) | repository が空 | `execute({ limit: 4 })` | `[]`（空配列） | 正常 |
| A-HIST-04 (B-06) | 3週分 seed | `execute({ limit: 1 })` | 最新1件のみ返る | 境界 |
| A-HIST-05 | 2週分 seed | `execute({})`（`limit` 未指定） | UseCase 内部で `limit ?? 4` が適用され、2件返る（デフォルト4が効くが実件数超過はしない） | 正常 |

---

## 6. Infrastructure 層試験観点（PGlite 統合）

テストランナー: Vitest（co-located: `packages/infrastructure/src/repositories/drizzle-meal-plan.repository.test.ts`）。

**前提条件（必須）**: `packages/infrastructure/src/testing/create-test-db.ts` の `DDL` 定数に
`meal_plans`/`planned_recipes` の `CREATE TABLE IF NOT EXISTS` 文が追記されていること（実装計画 G-2）。
未追記のままテストを実行すると全ケースが `relation "meal_plans" does not exist` 等の DB エラーで失敗する。
実装順序上は Step 4（スキーマ追記）完了後でないと本層のテストは書けない。

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| I-01 | 空DB | `repository.save(mealPlan)`（`plannedRecipes` 込み） | `meal_plans` テーブルに1行 INSERT される | 正常 |
| I-02 | 同上（`plannedRecipes` に2件） | `save(mealPlan)` | `planned_recipes` テーブルに2行 INSERT される | 正常 |
| I-03 | `save()` 済みの MealPlan | `repository.findById(mealPlan.id)` | ドメイン `MealPlan` に復元され、`weekOf`/`status`/`plannedRecipes` が元の値と一致 | 正常 |
| I-04 | 空DB | `findById(MealPlanId.generate())` | `null` | 正常 |
| I-05 | `save()` 済み | `repository.findByWeek(weekOf)` | 対象 MealPlan が返る | 正常 |
| I-06 | 空DB | `findByWeek(未保存の週)` | `null` | 正常 |
| I-07 | 3週分 `save()` 済み（週開始日が異なる） | `repository.findRecent(2)` | `week_start_date DESC` で2件返る | 正常 |
| I-08（R-1リスク対応） | 1つの MealPlan に `plannedRecipes` を3件持たせ、他に別週の MealPlan を2件 `save()` | `findRecent(1)` | **JOIN で行が膨らんでも `MealPlan` としては正しく1件のみ**返る（グルーピング後に `slice(0, limit)` が実装されていることの確認。設計 §5-2 / 実装計画 Step 6 の完了条件） | 境界・防御性 |
| I-09 (B-12) | MealPlan が3件のみ存在 | `findRecent(4)` | 3件返る（エラーなし。`limit` 超過でも例外なし） | 境界 |
| I-10 | `save()` 済みの MealPlan の `status` を変更 | 同一 `id` で再 `save()` | `meal_plans` テーブルが1行のまま `status` が更新される（`onConflictDoUpdate`） | 正常 |
| I-11 | `save()` 済み | 同一 `id` で再 `save()` | `week_start_date` は変化しない（upsert の `set` に含めない。設計 §5-2 / 実装計画 Step 6 の完了条件） | データ整合性 |
| I-12（removeRecipe の反映） | `plannedRecipes` 2件を持つ MealPlan を `save()` 済み | ドメイン側で `removeRecipe()` した MealPlan を再 `save()` | `planned_recipes` テーブルから該当行が `DELETE` される（`NOT IN (currentIds)` ロジック確認） | データ整合性 |
| I-13（R-2） | `scaleFactor: 1.5` の PlannedRecipe を `save()` | `findById()` で取得 | `scaleFactor` が `number` 型で `1.5`（文字列のまま返らない。`Number()` 変換確認） | データ整合性 |
| I-14（R-3） | `weekOf` を `save()` | `findByWeek()`/`findById()` で復元 | `mealPlan.weekOf.toString()` が保存前と同一文字列（`date` 型の `'T00:00:00'` 補完往復。タイムゾーンズレなし） | データ整合性 |
| I-15（R-3） | `scheduleForDay()` で `scheduledDate` をセットした PlannedRecipe を `save()` | `findById()` で復元 | `scheduledDate` が保存前と同一日付（時刻部分の誤差なし） | データ整合性 |
| I-16 | `cookedAt`/`completedAt` が `null` の MealPlan を `save()` | `findById()` で復元 | `cookedAt`/`completedAt` が `null`（`undefined` にならない） | 正常 |
| I-17 | `notes: ''` の PlannedRecipe | `save()` → `findById()` | `notes === ''` が往復する（空文字許容） | 境界 |
| I-18（対象外・明記のみ） | 手動 INSERT で不正な `status` 文字列を投入するケース | — | **本試験計画では対象外**。DB は常にアプリ経由（Drizzle）で書き込まれる前提であり、型アサーション（`row.status as MealPlanStatus`）の妥当性は手動 INSERT を想定した試験まで行わない | 対象外 |

---

## 7. API-Contract 契約試験観点

**前提（実装計画 G-3）**: `packages/api-contract` に Vitest が未導入（`package.json` に `test` スクリプト・`vitest` devDependency・`vitest.config.ts` が存在しない）。
実装計画 Step 8-1 で `E-6`（package.json 追記）・`N-25a`（vitest.config.ts 新規）が導入されて初めて本節のテストは `pnpm test` から実行可能になる。
**導入前でも観点は削らず残す**。導入されなかった場合は「未実装（テスト基盤未整備）」として完了条件から除外し、Orchestrator に確認する。

テストランナー: Vitest（co-located: `packages/api-contract/src/meal-plan.schema.test.ts`）。

### 7-1. `createMealPlanSchema`

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| Z-01 | — | `parse({ weekIdentifier: '2026-07-04' })` | 成功 | 正常 |
| Z-02 (E-13) | — | `parse({ weekIdentifier: '2026/07/04' })` | `ZodError`（フォーマット不正） | 異常 |
| Z-03 (E-13) | — | `parse({ weekIdentifier: '2026-13-01' })` | `ZodError`（月が13は不正） | 異常 |
| Z-04 (E-13) | — | `parse({ weekIdentifier: '2026-02-30' })` | `ZodError`（2月30日は存在しない暦日） | 異常 |
| Z-05 | — | `parse({ weekIdentifier: '2028-02-29' })` | 成功（2028年は閏年） | 境界 |

### 7-2. `mealPlanIdParamSchema` / `plannedRecipeIdParamSchema`

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| Z-06 (E-14) | — | `mealPlanIdParamSchema.parse({ id: 'not-a-uuid' })` | `ZodError` | 異常 |
| Z-07 (E-14) | — | `plannedRecipeIdParamSchema.parse({ id: <valid uuid>, plannedRecipeId: 'not-a-uuid' })` | `ZodError` | 異常 |

### 7-3. `addRecipeToMealPlanSchema`

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| Z-08 (E-14) | — | `parse({ recipeId: 'not-a-uuid', scaleFactor: 1 })` | `ZodError` | 異常 |
| Z-09 (E-05) | — | `parse({ recipeId: <uuid>, scaleFactor: 0 })` | `ZodError`（`0` は reject） | 異常 |
| Z-10 (E-06) | — | `parse({ recipeId: <uuid>, scaleFactor: -1 })` | `ZodError`（負数は reject） | 異常 |
| Z-11 (B-07) | — | `parse({ recipeId: <uuid>, scaleFactor: 0.001 })` | 成功 | 境界 |
| Z-12 (B-08) | — | `parse({ recipeId: <uuid>, scaleFactor: 3 })` | 成功 | 境界 |
| Z-13（境界メモ・対応不要） | — | `parse({ recipeId: <uuid>, scaleFactor: Infinity })` | **意図的に試験しない**（`Infinity > 0` が真のため `z.number().positive()` は accept する可能性が高いが、設計 §19-11・実装計画 R-6 により MVP1 では対応不要と確定済み）。§11 参照 | 対象外（既知の許容） |

### 7-4. `getMealPlanHistoryQuerySchema`

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| Z-14 (B-06) | — | `parse({ limit: '1' })` | 成功、`limit === 1`（`z.coerce.number()` で文字列→数値） | 境界 |
| Z-15 (D-5上限) | — | `parse({ limit: '12' })` | 成功、`limit === 12` | 境界 |
| Z-16 | — | `parse({ limit: '13' })` | `ZodError`（`.max(12)` 違反） | 異常 |
| Z-17 | — | `parse({ limit: '0' })` | `ZodError`（`.min(1)` 違反） | 異常 |
| Z-18 | — | `parse({ limit: '' })` | `ZodError`（`Number('')` が `0` に coerce され reject） | 異常 |
| Z-19 | — | `parse({ limit: 'abc' })` | `ZodError`（`NaN`） | 異常 |
| Z-20 | — | `parse({ limit: '2.5' })` | `ZodError`（`.int()` 違反） | 異常 |
| Z-21 | — | `parse({})`（`limit` 省略） | 成功、`limit === 4`（`.default(4)`） | 正常 |

### 7-5. レスポンススキーマの型往復

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| Z-22 | `toMealPlanDto()` が返す `MealPlanDto` の値（`plannedRecipes` 複数件含む） | `mealPlanResponseSchema.parse(dto)` | 成功する（Mapper 出力が契約を満たす） | 正常・回帰 |
| Z-23 | `toPlannedRecipeDto()` が返す `PlannedRecipeDto`（`scheduledDate`/`cookedAt` が値ありのケースと `null` のケース両方） | `plannedRecipeResponseSchema.parse(dto)` | 両ケースとも成功する | 正常・境界 |
| Z-24 (N-09) | `getCurrentMealPlanResponseSchema` | `parse({ data: null })` | 成功する（D-4: 現在週に MealPlan なしの表現） | 正常 |
| Z-25 | `mealPlanResponseSchema` | `parse({ ..., completedAt: null })` | 成功する（`completed` 未到達を表す `null`） | 正常 |

### 7-6. 後方互換確認

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| Z-26 | `meal-plan.schema.ts` 追加後 | 既存 `product.schema.ts`/`store.schema.ts`/`recipe.schema.ts` の既存テスト（存在すれば）を実行 | 引き続き green のまま（新規ファイル追加のみで既存契約に影響なし） | 回帰 |

---

## 8. Presentation 層試験観点（Hono ルート）

テストランナー: Vitest（co-located: `apps/web/src/server/routes/meal-plans.test.ts`）。
`products.test.ts` のパターン（`vi.mock('@/db/client')` + `vi.mock('@cookpit/application')` で UseCase をモック化し、Repository/DB 接続を経由しない）を踏襲する。

| # | 前提 | 操作 | 期待結果 | 分類 |
|---|---|---|---|---|
| P-01 | `CreateMealPlanUseCase.execute` をモックし `MealPlanDto` を返す | `POST /api/meal-plans` body: `{ "weekIdentifier": "2026-07-04" }` | 201 + `MealPlanDto`、`execute` が呼ばれた引数を確認 | 正常 |
| P-02 (E-13) | — | `POST /api/meal-plans` body: `{ "weekIdentifier": "2026/07/04" }` | 400、`execute` は呼ばれない | 異常 |
| P-03 (N-08) | `GetCurrentMealPlanUseCase.execute` が `MealPlanDto` を返すようモック | `GET /api/meal-plans/current` | 200 + `{ "data": MealPlanDto }` | 正常 |
| P-04 (N-09, D-4) | `GetCurrentMealPlanUseCase.execute` が `null` を返すようモック | `GET /api/meal-plans/current` | **200**（204 ではない） + `{ "data": null }` | 正常 |
| P-05 | `GetMealPlanHistoryUseCase.execute` が配列を返すようモック | `GET /api/meal-plans/history?limit=4` | 200 + `MealPlanDto[]`、`execute` に `{ limit: 4 }` が渡る | 正常 |
| P-06 | — | `GET /api/meal-plans/history?limit=13` | 400（Zod、`.max(12)` 違反） | 境界・異常 |
| P-07 | `AddRecipeToMealPlanUseCase.execute` が `PlannedRecipeDto` を返すようモック | `POST /api/meal-plans/:id/recipes` body: `{ "recipeId": <uuid>, "scaleFactor": 1.5 }` | 201 + `PlannedRecipeDto`、`execute` に `{ mealPlanId: id, recipeId, scaleFactor: 1.5 }` が渡る | 正常 |
| P-08 (E-14) | — | `POST /api/meal-plans/not-a-uuid/recipes` | 400、`execute` は呼ばれない | 異常 |
| P-08b (E-05/E-06) | — | `POST /api/meal-plans/:id/recipes` body: `{ "recipeId": <uuid>, "scaleFactor": 0 }`（および `-1`） | 400（Zod、UseCase 到達前に reject） | 異常 |
| P-09 (E-01) | `AddRecipeToMealPlanUseCase.execute` が `MealPlanNotFoundError` を reject | `POST /api/meal-plans/:id/recipes`（有効な body） | 404 + `{ "error": "MealPlan not found: ..." }`（`app.ts` の `onError`） | 異常 |
| P-10 (E-02〜E-04) | `AddRecipeToMealPlanUseCase.execute` が `InvalidMealPlanStateError` を reject | 同上 | 422 + `{ "error": "Cannot addRecipe a MealPlan with status '...'" }` | 異常 |
| P-11 (N-07) | `RemoveRecipeFromMealPlanUseCase.execute` が正常終了するようモック | `DELETE /api/meal-plans/:id/recipes/:plannedRecipeId` | 204（body なし）、`execute` に `{ mealPlanId, plannedRecipeId }` が渡る | 正常 |
| P-12 (E-07) | `execute` が `MealPlanNotFoundError` を reject | `DELETE .../recipes/:plannedRecipeId` | 404 | 異常 |
| P-13 (E-08) | `execute` が `PlannedRecipeNotFoundError` を reject | 同上 | 404 | 異常 |
| P-14 (E-09) | `execute` が `InvalidMealPlanStateError` を reject | 同上 | 422 | 異常 |
| P-15（回帰） | `mealPlansRoute` を `app.ts` にマウント後 | `GET /api/health`、`GET /api/recipes`、`GET /api/products`、`GET /api/stores` | 既存レスポンスが変わらない | 回帰 |
| P-16（回帰） | 同上 | 既存の `RecipeNotFoundError`/`ProductNotFoundError`/`StoreNotFoundError` 分岐に該当するリクエスト | 既存の 404 挙動が変わらない | 回帰 |

---

## 9. 要件書 §6 観点マトリクス（全ケース対応表）

要件書 `docs/requirements/meal-plan-core.md` §6 の全ケース（正常系15・異常系15・境界12・遷移14経路）を
本計画の観点 ID・担当ファイル・レイヤに対応づける。**全 56 ケース漏れなく記載する**。

### 9-1. 正常系（N-01〜N-15）

| 要件 No | 担当ファイル | レイヤ | 本計画観点 ID | 期待結果概要 |
|---|---|---|---|---|
| N-01 | `meal-plan-use-cases.test.ts` | Application | A-CR-01 | 新規 MealPlanDto（status=draft） |
| N-02 | `meal-plan-use-cases.test.ts` | Application | A-CR-02 | 冪等（既存返却、saveCount増加なし） |
| N-03 | `meal-plan.test.ts` + `meal-plan-use-cases.test.ts` | Domain + Application | D-AR-01, A-ADD-01 | PlannedRecipeDto 返却 |
| N-04 | 同上 | Domain + Application | D-AR-02, A-ADD-02 | shopping でも追加可能 |
| N-05 | 同上 | Domain + Application | D-AR-03, A-ADD-03 | scaleFactor=1.5 保持 |
| N-06 | 同上 | Domain + Application | D-AR-04, A-ADD-04 | 別 PlannedRecipeId で複数作成 |
| N-07 | 同上 | Domain + Application | D-RR-01, A-REM-01 | 削除後に消えている |
| N-08 | `meal-plan-use-cases.test.ts` | Application | A-CUR-01 | 現在週の MealPlanDto |
| N-09 | 同上 + `meal-plans.test.ts` | Application + Presentation | A-CUR-02, P-04 | `null`（200+data:null） |
| N-10 | `meal-plan-use-cases.test.ts` | Application | A-HIST-01 | 最新4件、週の新しい順 |
| N-11 | 同上 | Application | A-HIST-02 | 実件数のみ |
| N-12 | 同上 | Application | A-HIST-03 | 空配列 |
| N-13 | `meal-plan.test.ts` | Domain | T-01 | draft→shopping 成功 |
| N-14 | 同上 | Domain | T-02 | shopping→draft 成功 |
| N-15 | 同上 | Domain | T-03, T-04, T-05, D-TR-15 | cooking→consuming→completed 連鎖、completedAt 設定 |

### 9-2. 異常系（E-01〜E-15）

| 要件 No | 担当ファイル | レイヤ | 本計画観点 ID | 期待結果概要 |
|---|---|---|---|---|
| E-01 | `meal-plan-use-cases.test.ts` + `meal-plans.test.ts` | Application + Presentation | A-ADD-05, P-09 | MealPlanNotFoundError → 404 |
| E-02 | 同上 + `meal-plan.test.ts` | Domain + Application + Presentation | D-AR-05, A-ADD-06, P-10 | InvalidMealPlanStateError → 422 |
| E-03 | 同上 | 同上 | D-AR-06, A-ADD-07, P-10 | 同上（consuming） |
| E-04 | 同上 | 同上 | D-AR-07, A-ADD-08, P-10 | 同上（completed） |
| E-05 | `meal-plan.schema.test.ts` + `meal-plan.test.ts` + `meal-plans.test.ts` | Contract + Domain + Presentation | Z-09, D-PR-03, P-08b | scaleFactor=0 → 400（契約）／Error（Domain 二重防御） |
| E-06 | 同上 | 同上 | Z-10, D-PR-04, P-08b | scaleFactor<0 → 400／Error |
| E-07 | `meal-plan-use-cases.test.ts` + `meal-plans.test.ts` | Application + Presentation | A-REM-02, P-12 | MealPlanNotFoundError → 404 |
| E-08 | 同上 | 同上 | A-REM-03, P-13 | PlannedRecipeNotFoundError → 404 |
| E-09 | 同上 + `meal-plan.test.ts` | Domain + Application + Presentation | D-RR-02〜04, A-REM-04, P-14 | InvalidMealPlanStateError → 422 |
| E-10 | `meal-plan.test.ts` | Domain | T-06 | draft→cooking 不可 |
| E-11 | 同上 | Domain | T-09 | cooking→draft 不可（逆遷移代表例） |
| E-12 | 同上 | Domain | T-14 | completed→completed 不可（completed→any 代表例） |
| E-13 | `meal-plan.schema.test.ts` + `meal-plans.test.ts` | Contract + Presentation | Z-02〜Z-04, P-02 | weekIdentifier 不正 → 400 |
| E-14 | 同上 | Contract + Presentation | Z-06〜Z-08, P-08 | UUID 不正 → 400 |
| E-15 | — | — | **対象外** | C-3 は案 A（冪等）で確定済みのため `MealPlanAlreadyExistsError`（409）は発生しない。設計 §19-8「C-3（冪等）のため 409 は発生しない」に基づき、本ケースは**試験しない**（不採用案のテスト） |

### 9-3. 境界条件（B-01〜B-12）

| 要件 No | 担当ファイル | レイヤ | 本計画観点 ID | 期待結果概要 |
|---|---|---|---|---|
| B-01 | `week-identifier.test.ts` | Domain | D-WI-01 | 土曜00:00:00 → 当日が週開始日 |
| B-02 | 同上 | Domain | D-WI-03 | 金曜23:59:59 → 直前の土曜 |
| B-03 | 同上 | Domain | D-WI-02 | 土曜23:59:59 → B-01と同一週 |
| B-04 | 同上 | Domain | D-WI-05 | current実行日=土曜 → 当日 |
| B-05 | 同上 | Domain | D-WI-06 | current実行日=金曜 → 6日前の土曜 |
| B-06 | `meal-plan-use-cases.test.ts` + `meal-plan.schema.test.ts` | Application + Contract | A-HIST-04, Z-14 | limit=1 → 最新1件 |
| B-07 | `meal-plan.test.ts` + `meal-plan.schema.test.ts` | Domain + Contract | D-PR-01, Z-11 | scaleFactor=0.001 → 正常 |
| B-08 | 同上 | Domain + Contract | D-PR-02, Z-12 | scaleFactor=3 → 正常 |
| B-09 | `meal-plan.test.ts` | Domain | D-RR-05 | plannedRecipes 0件でremoveRecipe → Error |
| B-10 | 同上 | Domain | D-AR-04 | 同一recipeId2回 → 別ID2件 |
| B-11 | `week-identifier.test.ts` | Domain | D-WI-12 | 年またぎ週 → 2026-12-26週として扱われる |
| B-12 | `drizzle-meal-plan.repository.test.ts` | Infrastructure | I-09 | limit=4でDBに3件 → 3件返却 |

### 9-4. ステータス遷移の全14経路

§4-6（T-01〜T-14）を参照。全経路が `meal-plan.test.ts` の Domain 単体試験でカバーされる。

---

## 10. 冪等性試験（C-3）

| # | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| A-CR-02 | 同一週の MealPlan が既存（status=draft） | `CreateMealPlanUseCase.execute()` を同一週で2回実行 | 2回目は新規保存されず、既存の `MealPlanDto` が返る（`repository.saveCount === 1` のまま） |
| A-CR-03 | 同一週の MealPlan が既存（status=draft 以外。例: cooking） | 同上 | ステータスに関わらず既存の `MealPlanDto` がそのまま返る（C-3 確定: draft 以外でも冪等） |
| I-10 | Infrastructure レベル | `save()` を同一 `id` で複数回 | `onConflictDoUpdate` により行が重複しない（`meal_plans` テーブルの一意性が保たれる） |

**冪等性の対象範囲の明記**: 冪等なのは `CreateMealPlanUseCase`（同一週の重複作成防止）のみ。`AddRecipeToMealPlanUseCase` は意図的に非冪等（同一 `recipeId` を複数回追加すると複数の `PlannedRecipe` が作成される。N-06/B-10/D-AR-04 で確認済み）。この非対称性を試験計画上明記し、実装者が誤って `AddRecipeToMealPlanUseCase` にも重複防止ロジックを入れないよう注意喚起する。

---

## 11. 境界メモ（試験しない・既知の許容事項）

設計 §19-11・実装計画 R-5/R-6 で「MVP1 では対応しない」と明記された事項。本試験計画でも**意図的に試験対象から除外**し、将来対応時の観点のみ記録する。

| # | 事項 | 現状 | 試験しない理由 | 将来対応時の試験観点（記録のみ） |
|---|---|---|---|---|
| 1 | 非土曜日の `weekIdentifier`（例 `"2026-07-05"` 日曜）を `POST /api/meal-plans` に渡すケース | Zod（`z.iso.date()`）も Domain（`WeekIdentifier.fromString`）も曜日検証をしないため拒否されない | 設計 §19-11・実装計画 R-5 により MVP1 では対応しない方針が確定済み。Domain に曜日検証を追加するか否かは architecture-designer の判断事項であり、test-designer が独断で試験観点として要求しない | 将来 `WeekIdentifier.fromString` に曜日検証を追加する場合: `fromString('2026-07-05')`（日曜）で `Error` を throw することを確認するテストを追加する |
| 2 | `scaleFactor: Infinity` を `addRecipeToMealPlanSchema`/`PlannedRecipe.create` に渡すケース | `z.number().positive()` は `Infinity > 0` が真のため accept する可能性が高い | 設計 §19-11・実装計画 R-6 により契約違反ではなく対応不要と判断済み | 将来上限値を設ける場合: `z.number().positive().finite()` 相当への変更後、`scaleFactor: Infinity` が reject されることを確認するテストを追加する（Z-13 の昇格） |

これらは「Orchestrator 要確認」ではなく、設計・実装計画で既に確定済みの**既知の許容事項**として扱う（矛盾ではない）。

---

## 12. 未実装観点（基盤待ち・スコープ外）

### 12-1. ブラウザ E2E（Playwright）

`apps/web/e2e/`（`playwright.config.ts` 導入済み。既存 `recipe-crud.smoke.spec.ts` が先例）に対応する
`meal-plan-*.spec.ts` は、**本 Unit A（バックエンドのみ）では作成しない**。

理由: 要件書 §1-2・設計書 §2 の対象外に「画面・UI 実装（Unit B で別途扱う）」と明記されている。
MealPlan 作成・レシピ追加・現在週表示・履歴表示の画面が存在しない現時点では、ブラウザ経由の
E2E シナリオ（例: 「献立作成ボタンをクリック→レシピを検索して追加→買い出しボタンで shopping へ遷移」）を
検証する対象自体が存在しない。

Unit B（UI 実装）で以下を対象に E2E を追加する想定を申し送る:
- 献立作成〜レシピ追加〜削除の画面操作フロー（POST /api/meal-plans, POST .../recipes, DELETE .../recipes/:id と対応）
- 現在週の献立表示（GET /current の 200+data:null 分岐を画面が正しくハンドリングするか）
- 履歴一覧表示（GET /history）
- ステータス遷移 UI（Sprint 4 以降。ShoppingList 連携後）

### 12-2. API Contract 層（条件付き未実装）

§7 に記載の通り、`packages/api-contract` の Vitest 導入（実装計画 G-3・Step 8-1）が完了するまでは
`meal-plan.schema.test.ts` は `pnpm test` から実行できない。観点自体は本計画に全て記載済みのため、
実装時に Step 8-1 が計画通り実施されることを前提とする。万一 Step 8-1 が省略された場合は
Orchestrator へ確認する。

---

## 13. データ整合性

| # | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| DI-01 | `CreateMealPlanUseCase` で生成した `MealPlanDto.id` | DB に INSERT された `meal_plans.id` と比較 | 一致する（I-01 と同一） |
| DI-02 | `AddRecipeToMealPlanUseCase` で作成した `PlannedRecipeDto.id` | DB の `planned_recipes.id` と比較 | 一致する |
| DI-03 | `RemoveRecipeFromMealPlanUseCase` 実行後 | DB の `planned_recipes` テーブルを直接 SELECT | 該当行が存在しない（I-12 と同一） |
| DI-04 | `WeekIdentifier.toString()` の値と DB `week_start_date` | `save()` → 直接 SELECT | 文字列として一致（I-14 と同一） |
| DI-05 | `mealPlan.plannedRecipes.length` と `save()` 後の DB 行数 | `save()` → `SELECT COUNT(*) FROM planned_recipes WHERE meal_plan_id = ?` | 一致する |

---

## 14. 権限

MVP1 は認証なし（設計 §12。ADR-003 準拠）。本試験計画に権限関連の観点は含めない。

---

## 15. メソッド網羅チェック表

実装コードから列挙した全 public メソッド・static ファクトリ・ゲッターと、対応する試験観点 No の対照表。

| クラス/関数 | メソッド | 対応する試験観点 No |
|---|---|---|
| `MealPlanId` | `generate/fromString/equals/value` | D-ID-01〜05 |
| `PlannedRecipeId` | `generate/fromString/equals/value` | D-PRID-01〜05 |
| `WeekIdentifier` | `fromDate/current/fromString/startDate/endDate/next/previous/equals/toString` | D-WI-01〜15 |
| `PlannedRecipe` | `create/reconstruct/scheduleFor/markAsCooked/id/recipeId/scaleFactor/scheduledDate/cookedAt/notes` | D-PR-01〜09, D-SCH-01, D-COOK-01 |
| `MealPlan` | `create/reconstruct/addRecipe/removeRecipe/transitionTo/scheduleForDay/markAsCooked/id/weekOf/plannedRecipes/status/createdAt/completedAt` | D-MP-01〜05, D-AR-01〜08, D-RR-01〜05, T-01〜14, D-SCH-02, D-COOK-02, D-TR-15 |
| `MealPlanRepository`（IF） | `findById/findByWeek/findRecent/save` | I-01〜18（`DrizzleMealPlanRepository` 経由で間接検証） |
| `toMealPlanDto` | — | A-CR-01, Z-22 |
| `toPlannedRecipeDto` | — | A-ADD-01, Z-23 |
| `MealPlanNotFoundError` | `constructor/name/message` | A-ADD-05, A-REM-02 |
| `PlannedRecipeNotFoundError` | `constructor/name/message` | A-REM-03 |
| `InvalidMealPlanStateError` | `constructor/name/message` | A-ADD-06〜08, A-REM-04 |
| `CreateMealPlanUseCase` | `execute` | A-CR-01〜04 |
| `AddRecipeToMealPlanUseCase` | `execute` | A-ADD-01〜10 |
| `RemoveRecipeFromMealPlanUseCase` | `execute` | A-REM-01〜04 |
| `GetCurrentMealPlanUseCase` | `execute` | A-CUR-01〜02 |
| `GetMealPlanHistoryUseCase` | `execute` | A-HIST-01〜05 |
| `DrizzleMealPlanRepository` | `findById/findByWeek/findRecent/save` | I-01〜18 |
| `meal-plan.schema.ts` の各スキーマ | `parse/safeParse` | Z-01〜26 |
| `mealPlansRoute` | `POST /`, `GET /current`, `GET /history`, `POST /:id/recipes`, `DELETE /:id/recipes/:plannedRecipeId` | P-01〜16 |

---

## 16. 回帰試験範囲

| # | 対象 | 確認方法 |
|---|---|---|
| REG-01 | Domain 層の既存テスト（Recipe/Product/Store/Money/Quantity 等） | `pnpm test` で 0 failures |
| REG-02 | Application 層の既存テスト（Recipe/Product/Store UseCase） | `pnpm test` で 0 failures |
| REG-03 | Infrastructure 層の既存テスト（`drizzle-product.repository.test.ts` 等） | `pnpm test` で 0 failures。`create-test-db.ts` への DDL 追記が既存4テーブルの DDL を変更していないこと |
| REG-04 | `packages/application/src/index.ts`／`packages/api-contract/src/index.ts`／`packages/infrastructure/src/index.ts` の既存エクスポート | `pnpm type-check` で既存 import が壊れていないこと |
| REG-05 | `apps/web/src/server/app.ts` の既存 `onError` 3分岐（Recipe/Product/Store） | `meal-plans.test.ts` の P-15/P-16 および既存 `products.test.ts`/`recipes.test.ts`/`stores.test.ts` が green のまま |
| REG-06 | `app.ts` の Hono RPC 型（`AppType`） | `mealPlansRoute` 追加後も既存クライアント型が壊れない（`pnpm type-check`） |
| REG-07 | マイグレーション（実装計画 G-1: `apps/web/src/db/migrations/`） | 新規マイグレーションが既存4テーブルへの `ALTER` を含まない（実装計画 Step 5 完了条件） |

---

## 17. 試験データ

### 17-1. 固定日時

| 用途 | 値 |
|---|---|
| 基準の土曜日（週開始日） | `new Date('2026-07-04T00:00:00')` |
| 同週の金曜終端 | `new Date('2026-07-10T23:59:59.999')` |
| 年またぎ週の開始（土曜） | `new Date('2026-12-26T00:00:00')` |
| 年またぎ週の終端（翌年金曜） | `new Date('2027-01-01T23:59:59.999')` |
| `MealPlan.createdAt` 固定値（Application/Infra テスト用） | `new Date('2026-01-01T00:00:00.000Z')`（Product 先例に合わせ UTC 明示。`WeekIdentifier` 関連のみローカルタイム日付リテラルを使う点に注意） |

### 17-2. 固定 UUID

| 用途 | 値（例） |
|---|---|
| MealPlanId | `'11111111-1111-1111-1111-111111111111'` |
| PlannedRecipeId | `'22222222-2222-2222-2222-222222222222'` |
| RecipeId（ID参照のみ、実体不要） | `'33333333-3333-3333-3333-333333333333'` |

### 17-3. 週識別子文字列

| 用途 | 値 |
|---|---|
| 基本週 | `'2026-07-04'` |
| 次週 | `'2026-07-11'` |
| 前週 | `'2026-06-27'` |
| 年またぎ週 | `'2026-12-26'` |

### 17-4. `InMemoryMealPlanRepository`

Application 層テストで使用する。`ProductRepository` 先例（`product-use-cases.test.ts`）に倣い、
`Map<string, MealPlan>` をバックエンドに `saveCount`・`seed()` メソッドを持つテストダブルを実装する。

### 17-5. TZ 設定に関する注意（D-WI-14/R-4 関連）

`WeekIdentifier` 関連のテストはローカルタイム前提（JST 想定）。テスト実行環境の `TZ` 環境変数が
未設定または JST 以外の場合、`fromDate`/`current` の境界テストが不安定になる可能性がある。
実装時に `vitest.config.ts` または `package.json` の `test` スクリプトで `TZ=Asia/Tokyo` を明示するか、
少なくとも CI 環境の TZ 設定を確認すること（設計 §4-6「Next.js / Vercel デプロイ時はタイムゾーンを
`TZ=Asia/Tokyo` に設定する」との整合）。

---

## 18. 完了条件

### 18-1. 必須（リリースブロッカー）

- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` が全てエラー・failure なしで完走する
- [ ] 要件書 §6 の全56ケース（N-01〜15, E-01〜15［E-15は対象外理由つき除外］, B-01〜12, T-01〜14）が
      §9 のマトリクスに従い、いずれかのテストファイルで実装・検証されている
- [ ] Domain 層のステータス遷移14経路（T-01〜T-14）が `meal-plan.test.ts` で悉皆的にカバーされている
- [ ] `WeekIdentifier` の週境界・年またぎ・ラウンドトリップ（D-WI-01〜15）が実装されている
- [ ] Application 層の冪等性試験（A-CR-02, A-CR-03）が実装され、`saveCount` で重複作成なしを確認している
- [ ] Infrastructure 層のテストが green（前提: `create-test-db.ts` への DDL 追記（G-2）が完了していること）
- [ ] Presentation 層のテストが green（`GET /current` の 200+`{data:null}` を含む）
- [ ] 防御性観点（D-WI-15, D-MP-04〜05, D-PR-09）が実装されている
- [ ] メソッド網羅チェック表（§15）の全行に対応するテストが存在する

### 18-2. 条件付き必須（テスト基盤整備が前提）

- [ ] `packages/api-contract` に Vitest が導入されていること（実装計画 G-3・Step 8-1）。導入されていれば
      Z-01〜Z-26 が実装され `pnpm --filter @cookpit/api-contract test` が green
- [ ] 導入されなかった場合は、その旨を実装完了報告に明記し Orchestrator に確認する（本計画の観点は
      削除しない）

### 18-3. 対象外（明記のみ・実装不要）

- [ ] E-15（`MealPlanAlreadyExistsError` 409）— C-3 確定（案A採用）により発生しないため試験しない
- [ ] 非土曜 `weekIdentifier` の拒否（§11-1）— MVP1 対応不要
- [ ] `scaleFactor: Infinity` の拒否（§11-2 / Z-13）— MVP1 対応不要
- [ ] E2E（Playwright）（§12-1）— Unit A は UI 非対象。Unit B で対応

---

## 19. サマリ

| 層 | 観点数（目安） | ファイル |
|---|---|---|
| Domain | 約 60件（ID系10 + WeekIdentifier 15 + PlannedRecipe 9 + addRecipe/removeRecipe 13 + 遷移14 + 防御性等 8） | `meal-plan-id.test.ts`, `meal-plan.test.ts`, `week-identifier.test.ts` |
| Application | 23件（Create 4 + Add 10 + Remove 4 + Current 2 + History 5） | `meal-plan-use-cases.test.ts` |
| Infrastructure | 18件 | `drizzle-meal-plan.repository.test.ts` |
| API Contract | 26件（テスト基盤導入前提） | `meal-plan.schema.test.ts` |
| Presentation | 17件 | `meal-plans.test.ts` |

要件書 §6 の56ケース（N15・E15・B12・T14）は全て §9 のマトリクスで上記いずれかのテストにマッピング済み（E-15のみ対象外理由つきで除外）。
