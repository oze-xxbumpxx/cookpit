# 要件定義: MealPlan Core（Sprint 3 Unit A）

作成日: 2026-07-03
対象スプリント: Sprint 3 Unit A
変更レベル: L3（Domain / Application / Infrastructure / API-Contract の全層にまたがる新規実装）

---

## 1. 概要 / スコープ

### 1-1. 要求の要約

土曜日に「今週の献立」を決めるフローのバックエンド一式を実装する。
ユーザーが週を指定して MealPlan を作成し、Recipe を追加・削除し、現在週の献立と過去の献立履歴を取得できるようにする。

| 層                 | 実装対象                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain             | MealPlan / MealPlanId / PlannedRecipe / PlannedRecipeId / MealPlanStatus + ステータス遷移ロジック。WeekIdentifier（packages/domain/src/shared/）も新規実装 |
| Infrastructure     | Drizzle スキーマ `meal_plans` / `planned_recipes` + マイグレーション + `DrizzleMealPlanRepository`                                                         |
| Application        | UseCase 5本（後述）、MealPlanDto / PlannedRecipeDto、MealPlanMapper、MealPlanNotFoundError、PlannedRecipeNotFoundError                                     |
| API Contract       | Zod スキーマ（packages/api-contract/src/meal-plan.schema.ts）                                                                                              |
| Presentation (API) | Hono ルート（apps/web/src/server/routes/meal-plans.ts）、app.ts へのマウント                                                                               |

### 1-2. 対象外（このユニットで作らないもの）

- 画面・UI 実装（Unit B で別途扱う）
- ステータス遷移の API エンドポイント公開（draft→shopping など。ドメインロジックとしては実装するが Sprint 3 で公開しない）
- markAsCooked / scheduleForDay の API エンドポイント公開（Unit B）
- scaleFactor のプリセット定義（1×/1.5×/2×/3× の固定ボタンは Unit B の UI 判断）
- ShoppingList との連携（Sprint 4 以降）

---

## 2. 確定済みの前提・制約

### 前提 1: 週の定義は「土曜始まり」（ユーザー確定）

- 「今週」= 直近の土曜日を週開始日とする 7 日間（土曜〜金曜）
- 運用: 土曜日に献立を決め→買い出し→金曜まで消費
- docs/04-domain-model.md の WeekIdentifier に「ISO 8601 週番号で算出」との記述があるが、ISO 週番号は月曜始まりのため本仕様と矛盾する。本要件では**土曜始まりを正とし、ISO 週番号は使用しない**
- **WeekIdentifier の内部表現**（週開始日の Date ベース vs 年+週番号）は architecture-designer が比較・提案してユーザー確認で確定する事項。本要件書では確定しない（セクション 5 参照）

### 前提 2: ステータス遷移ロジックはドメインに実装するが API 公開は Sprint 3 対象外（ユーザー確定）

- MealPlanStatus の遷移ロジック（draft→shopping→cooking→consuming→completed）は Domain 層に実装する
- shopping への遷移は Sprint 4（ShoppingList 作成）と連動して初めて UI に出す
- markAsCooked / scheduleForDay もドメインには実装するが API エンドポイントは Sprint 3 で公開しない

### 前提 3: scaleFactor は「正の数」のみを縛る（ユーザー確定）

- PlannedRecipe.scaleFactor > 0 の制約のみ Domain で定義する
- 1×/1.5×/2×/3× のプリセットは Domain で縛らない（Unit B の UI 判断）

### アーキテクチャ制約（変更不可）

- 依存方向: `Presentation → Application → Domain ← Infrastructure`
- `packages/domain` は他パッケージに依存しない。DrizzleORM の型・HTTP の型を持ち込まない
- Entity 生成は `static create()`、DB 復元は `static reconstruct()`
- 集約をまたぐ参照は **ID 参照のみ**（PlannedRecipe は RecipeId のみ保持）
- UseCase は 1 クラス・`execute()` のみ。手動 DI（コンストラクタ注入）
- `any` 禁止・default export 禁止・`import type` 必須（型のみインポート時）・「値なし」は `null` に統一
- Entity を UseCase の境界外へ漏らさない（MealPlanDto / PlannedRecipeDto を使う。ProductDto 先例に倣う）

---

## 3. 機能要件

### 3-1. UseCase 一覧

#### CreateMealPlanUseCase

| 項目           | 内容                                                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Input          | `weekIdentifier: string`（WeekIdentifier の外部表現。設計で確定。例: 週開始日 `"2026-07-04"` または `"2026-W27"` 相当） |
| Output         | `MealPlanDto`                                                                                                           |
| 事前条件       | なし                                                                                                                    |
| バリデーション | weekIdentifier のフォーマット検証（Hono ルート層で Zod）。過去・未来への範囲制限は MVP1 では設けない                    |
| ドメイン操作   | `MealPlan.create(weekOf)` → `MealPlanRepository.save()`                                                                 |
| 正常系         | 新規 MealPlan を status=draft で作成し MealPlanDto を返す                                                               |
| 異常系         | 同一週の MealPlan が既存の場合（未決: セクション 5-3 参照）                                                             |

#### AddRecipeToMealPlanUseCase

| 項目           | 内容                                                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input          | `mealPlanId: string`、`recipeId: string`、`scaleFactor: number`                                                                                                                                       |
| Output         | `PlannedRecipeDto`（追加された PlannedRecipe）                                                                                                                                                        |
| 事前条件       | 対象 MealPlan が存在すること                                                                                                                                                                          |
| バリデーション | `mealPlanId` / `recipeId` は UUID 形式（Hono ルート層）。`scaleFactor > 0`（UseCase 入口または Domain）                                                                                               |
| ドメイン操作   | `MealPlanRepository.findById()` → `MealPlan.addRecipe(recipeId, scaleFactor)` → `MealPlanRepository.save()`                                                                                           |
| 正常系         | PlannedRecipe が MealPlan に追加され、PlannedRecipeDto を返す                                                                                                                                         |
| 異常系         | MealPlan が存在しない → `MealPlanNotFoundError`（404）。status が `cooking` / `consuming` / `completed` の場合 → `InvalidMealPlanStateError`（422）。`scaleFactor <= 0` → バリデーションエラー（400） |
| 備考           | RecipeId の存在チェックは行わない（削除済み Recipe への参照は許容。セクション 5-4 参照）                                                                                                              |

#### RemoveRecipeFromMealPlanUseCase

| 項目           | 内容                                                                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input          | `mealPlanId: string`、`plannedRecipeId: string`                                                                                                                                                                       |
| Output         | `void`（204）                                                                                                                                                                                                         |
| 事前条件       | 対象 MealPlan が存在すること。対象 PlannedRecipe がその MealPlan に属すること                                                                                                                                         |
| バリデーション | UUID 形式チェック（Hono ルート層）                                                                                                                                                                                    |
| ドメイン操作   | `MealPlanRepository.findById()` → `MealPlan.removeRecipe(plannedRecipeId)` → `MealPlanRepository.save()`                                                                                                              |
| 正常系         | PlannedRecipe が削除される                                                                                                                                                                                            |
| 異常系         | MealPlan が存在しない → `MealPlanNotFoundError`（404）。PlannedRecipe が存在しない → `PlannedRecipeNotFoundError`（404）。status が `cooking` / `consuming` / `completed` の場合 → `InvalidMealPlanStateError`（422） |

#### GetCurrentMealPlanUseCase

| 項目           | 内容                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------- |
| Input          | なし（または `asOf?: Date` を内部注入。設計判断）                                              |
| Output         | `MealPlanDto \| null`                                                                          |
| 事前条件       | なし                                                                                           |
| バリデーション | なし                                                                                           |
| ドメイン操作   | 今日の日付から現在週の WeekIdentifier を算出 → `MealPlanRepository.findByWeek(weekIdentifier)` |
| 正常系         | 現在週の MealPlan があれば MealPlanDto を返す。なければ `null`                                 |
| 異常系         | なし（null 返却）                                                                              |
| 備考           | 「現在週」は土曜始まりで算出。例: 2026-07-03（金曜）なら前の土曜 2026-06-27 始まり週           |

#### GetMealPlanHistoryUseCase

| 項目           | 内容                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| Input          | `limit?: number`（デフォルト 4。最大上限は設計者判断。MVP 推奨: max 12）                                |
| Output         | `MealPlanDto[]`（週の新しい順に返す）                                                                   |
| 事前条件       | なし                                                                                                    |
| バリデーション | `limit` は正の整数（Hono ルート層で Zod）                                                               |
| ドメイン操作   | `MealPlanRepository.findRecent(limit)`                                                                  |
| 正常系         | 最新 limit 件の MealPlan を返す（現在週は含む / 含まないは設計判断。推奨: 含む）                        |
| 異常系         | なし（0件なら空配列）                                                                                   |
| 備考           | Sprint 3 完了条件「過去 4 週間を遡れる」を満たす最小実装。ページネーションは不要（セクション 5-2 参照） |

### 3-2. DTO 構造

```
MealPlanDto {
  id: string                        // UUID
  weekIdentifier: string            // 外部表現（設計で確定）
  status: MealPlanStatus            // 'draft' | 'shopping' | 'cooking' | 'consuming' | 'completed'
  plannedRecipes: PlannedRecipeDto[]
  createdAt: string                 // ISO 8601
  completedAt: string | null        // ISO 8601 または null
}

PlannedRecipeDto {
  id: string                        // UUID（PlannedRecipeId）
  recipeId: string                  // UUID（Recipe への ID 参照のみ。Recipe 詳細は含まない）
  scaleFactor: number               // > 0
  scheduledDate: string | null      // ISO 8601 date、ビュッフェ運用では null
  cookedAt: string | null           // ISO 8601 または null
  notes: string                     // 空文字許容
}
```

DTO 設計の方針:

- Entity を境界外に漏らさない。RecipeDto 先例（ProductDto パターン）に倣い MealPlanDto を使う
- PlannedRecipeDto は `recipeId` のみ保持（集約またぎ禁止）。Recipe 名などは含めない（UI が別途 GET /api/recipes/:id で取得する）
- ただし UI の利便性として recipeName を含める設計も可能（Application 層で RecipeRepository を追加 DI する）。この判断は設計フェーズへ委譲する

### 3-3. API エンドポイント一覧

| メソッド | パス                                           | UseCase                         | ステータス                               |
| -------- | ---------------------------------------------- | ------------------------------- | ---------------------------------------- |
| POST     | `/api/meal-plans`                              | CreateMealPlanUseCase           | 201 + MealPlanDto                        |
| GET      | `/api/meal-plans/current`                      | GetCurrentMealPlanUseCase       | 200 + MealPlanDto \| 204 または 200+null |
| GET      | `/api/meal-plans/history`                      | GetMealPlanHistoryUseCase       | 200 + MealPlanDto[]                      |
| POST     | `/api/meal-plans/:id/recipes`                  | AddRecipeToMealPlanUseCase      | 201 + PlannedRecipeDto                   |
| DELETE   | `/api/meal-plans/:id/recipes/:plannedRecipeId` | RemoveRecipeFromMealPlanUseCase | 204                                      |

`GET /api/meal-plans/current` のレスポンス仕様（null 返却時の HTTP ステータス: 200+null vs 204）は設計フェーズで確定する。

### 3-4. Repository インターフェース（MealPlanRepository）

UseCase が必要とする最小限のメソッド:

```
findById(id: MealPlanId): Promise<MealPlan | null>
findByWeek(weekIdentifier: WeekIdentifier): Promise<MealPlan | null>
findRecent(limit: number): Promise<MealPlan[]>
save(mealPlan: MealPlan): Promise<void>
```

削除（delete）は Sprint 3 スコープ外。

---

## 4. ドメイン要件

### 4-1. MealPlan 集約

集約ルート: `MealPlan`
ファイル配置: `packages/domain/src/meal-plan/`

| フィールド     | 型              | 説明                                                 |
| -------------- | --------------- | ---------------------------------------------------- |
| id             | MealPlanId      | 一意識別子                                           |
| weekOf         | WeekIdentifier  | この MealPlan が属する週                             |
| plannedRecipes | PlannedRecipe[] | 献立に追加されたレシピのリスト（集約内エンティティ） |
| status         | MealPlanStatus  | ステータス（遷移は canTransitionTo で制御）          |
| createdAt      | Date            | 作成日時                                             |
| completedAt    | Date \| null    | 完了日時（completed になった時刻。それ以外は null）  |

主要な振る舞い:

- `static create(weekOf: WeekIdentifier): MealPlan` — 新規作成、status = 'draft'、plannedRecipes = []
- `static reconstruct(props: MealPlanProps): MealPlan` — DB 復元
- `addRecipe(recipeId: RecipeId, scaleFactor: number): PlannedRecipeId` — レシピ追加（draft / shopping のみ許可）
- `removeRecipe(plannedRecipeId: PlannedRecipeId): void` — レシピ削除（draft / shopping のみ許可）
- `transitionTo(newStatus: MealPlanStatus): void` — ステータス遷移（canTransitionTo で事前チェック）
- `scheduleForDay(plannedRecipeId, date): void` — 調理日付指定（ドメインに実装するが API は Sprint 3 非公開）
- `markAsCooked(plannedRecipeId, at): void` — 調理記録（ドメインに実装するが API は Sprint 3 非公開）

### 4-2. PlannedRecipe（MealPlan 内エンティティ）

| フィールド    | 型              | 説明                                                        |
| ------------- | --------------- | ----------------------------------------------------------- |
| id            | PlannedRecipeId | 一意識別子                                                  |
| recipeId      | RecipeId        | Recipe への ID 参照（集約をまたぐため ID のみ）             |
| scaleFactor   | number          | 倍量（> 0。整数・小数どちらも許容）                         |
| scheduledDate | Date \| null    | 調理予定日（null = 日付未指定、ビュッフェ運用のデフォルト） |
| cookedAt      | Date \| null    | 調理完了日時（null = 未調理）                               |
| notes         | string          | メモ（空文字許容）                                          |

- `static create(recipeId: RecipeId, scaleFactor: number): PlannedRecipe` — scaleFactor > 0 チェック
- `static reconstruct(props: PlannedRecipeProps): PlannedRecipe` — DB 復元

### 4-3. MealPlanStatus とステータス遷移

```typescript
export type MealPlanStatus =
  | 'draft' // 献立検討中（初期状態）
  | 'shopping' // 買い物中（ShoppingList 生成後）
  | 'cooking' // 作り置き中（買い物完了後）
  | 'consuming' // 平日消費中
  | 'completed'; // 週終了
```

#### ステータス遷移表

| 現在 \ 次 | draft          | shopping | cooking | consuming | completed |
| --------- | -------------- | -------- | ------- | --------- | --------- |
| draft     | —              | 可       | 不可    | 不可      | 不可      |
| shopping  | 可（やり直し） | —        | 可      | 不可      | 不可      |
| cooking   | 不可           | 不可     | —       | 可        | 不可      |
| consuming | 不可           | 不可     | 不可    | —         | 可        |
| completed | 不可           | 不可     | 不可    | 不可      | —         |

遷移制約の実装:

- `canTransitionTo(newStatus): boolean` でガード
- `transitionTo` が `canTransitionTo` を内部呼び出し、違反時は throw
- `addRecipe` / `removeRecipe` は status が `draft` または `shopping` のみ許可

#### Sprint 3 で公開する遷移

draft ↔ shopping の遷移は Sprint 4 の ShoppingList 生成と連動して初めて UI に出す。
consuming → completed の遷移 UI は Sprint 4 以降。
本 Unit では**遷移 API エンドポイントは作成しない**。

### 4-4. WeekIdentifier（packages/domain/src/shared/week-identifier.ts）

要件:

- 「土曜始まりの 7 日間（土〜金）」を識別するオブジェクト
- `static fromDate(date: Date): WeekIdentifier` — 与えた日付が属する週を返す
- `static current(): WeekIdentifier` — 今日の日付が属する現在週
- `startDate(): Date` — 週開始日（土曜 00:00:00 JST 相当）
- `endDate(): Date` — 週終了日（金曜 23:59:59 JST 相当）
- `next(): WeekIdentifier` / `previous(): WeekIdentifier`
- `equals(other: WeekIdentifier): boolean`
- `toString(): string` — 外部表現文字列（設計で確定）

**内部表現は設計フェーズで確定**（セクション 5-1 参照）。

### 4-5. ID 値オブジェクト（ProductId パターン踏襲）

- `MealPlanId`: `generate()` / `fromString()` / `equals()` / `value` getter
- `PlannedRecipeId`: 同上

### 4-6. scaleFactor の制約

- `scaleFactor > 0` を Domain で強制する
- PlannedRecipe.create() の入口でチェック（0 以下なら throw）
- 上限は定義しない（MVP1 の実運用規模では不要）
- 整数・少数どちらも許容（例: 1.5倍、2倍）

---

## 5. 未決事項と推奨案

### 5-1. WeekIdentifier の内部表現（設計フェーズへ委譲）

**論点**: DB 永続化における週の表現方法。

| 案  | 内部表現                                              | 長所                                          | 短所                                                     |
| --- | ----------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| A   | 週開始日の Date（例: `2026-07-04`）                   | 直感的、SQLで範囲検索しやすい、ISO 週番号不要 | 年をまたぐ週で特殊処理不要                               |
| B   | 年 + オフセット週番号（例: year=2026, weekNumber=27） | 数値演算が簡単                                | 土曜始まり独自番号の管理が必要（ISO 週番号と混同リスク） |

**推奨**: 案 A（週開始日の Date）。土曜始まりであることが Date に直接反映され、ISO 週番号との混同が生じない。DB カラムは `week_start_date date NOT NULL` とし、UNIQUE 制約で一意性を保証する。

ただしこれは設計者が最終確定すること。本要件書では「設計で確定すべき事項」と位置づける。

### 5-2. 履歴ビューの範囲とページネーション

**論点**: GetMealPlanHistory のパラメータ設計。

Sprint 3 完了条件: 「過去 4 週間を遡れる」

MVP 向け推奨方針:

- `limit` パラメータのみ（デフォルト 4、最大 12 程度）。週範囲指定は不要
- 4 週間 = 最大 4 件のため、ページネーションは不要
- 単純リストで十分（`findRecent(limit)` の実装で対応可能）

**推奨**: ページネーションなし。`limit` クエリパラメータのみ（デフォルト 4）。`GET /api/meal-plans/history?limit=4`。将来的に件数が増えたらオフセット / カーソルベースに拡張する。

### 5-3. 同一週の MealPlan 一意性と CreateMealPlan の冪等性

**論点**: 同一 WeekIdentifier に MealPlan は 1 つだけか。CreateMealPlan が既存週に対して呼ばれた時の挙動。

| 案  | 挙動                                      | 長所                                             | 短所                                                            |
| --- | ----------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------- |
| A   | 冪等（既存があれば既存を返す）            | 重複 HTTP リクエストに強い、ユーザーが混乱しない | 「意図的に2つ作りたい」ケースを塞ぐ                             |
| B   | エラー（MealPlanAlreadyExistsError, 409） | 意図的な衝突を検出できる                         | UI 側のエラーハンドリングが必要                                 |
| C   | 複数許容（一意性なし）                    | シンプル                                         | GetCurrentMealPlan の語義が壊れる（どれが「現在の献立」か不明） |

**推奨**: 案 A（冪等）。2 名利用の個人アプリでは誤操作・ネットワークリトライを考慮すると冪等が最も安全。GetCurrentMealPlan の「1 週に 1 つ」という語義と整合する。実装: `findByWeek()` で既存を確認し、あれば既存を返す。なければ新規作成。

ただし、draft 以外のステータスで「同一週に既存がある場合も冪等で返す」か「draft のみ冪等で他はエラー」かは設計フェーズで確定する。

### 5-4. 削除された Recipe を参照する PlannedRecipe の扱い

**論点**: PlannedRecipe は RecipeId の ID 参照のみを保持する（集約またぎ禁止）。Recipe が削除された場合、その RecipeId を持つ PlannedRecipe は「無効な参照」となる。

| 案  | 取り扱い                                                                                                             | 長所                                      | 短所                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| A   | 削除された Recipe の PlannedRecipe は recipeId のみ保持し、DTO でも recipeId を返す（UI が「削除済みレシピ」と表示） | Domain がクリーン。履歴で recipeId は残る | UI 側の処理が必要                                                          |
| B   | MealPlan の PlannedRecipe から自動削除（Recipe 削除時のカスケード的処理）                                            | 履歴が整合する                            | Recipe 削除 UseCase が MealPlanRepository に依存する（アーキテクチャ汚染） |
| C   | Recipe を「論理削除」にして物理削除しない                                                                            | recipeId の整合性が常に保てる             | Recipe 設計の変更が必要。Sprint 3 スコープ外                               |

**推奨**: 案 A。Domain の ID 参照原則を守りつつ、UI が「削除済みレシピ」を表示する（recipeId は保持するが Recipe が取得できない場合の表示は Unit B の UI 判断）。MealPlanDto の PlannedRecipeDto は recipeId のみを返す。履歴取得時に RecipeRepository を使って名前解決する場合、存在しない recipeId には `recipeName: null` を返す設計が自然（設計フェーズで確定）。

---

## 6. 試験観点

### 6-1. 正常系

| No   | ケース                                                              | 確認内容                                                                 |
| ---- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| N-01 | `CreateMealPlanUseCase` — 有効な週指定                              | MealPlanDto が返る。status = 'draft'、plannedRecipes = []                |
| N-02 | `CreateMealPlanUseCase` — 同一週に既存あり（冪等案採用時）          | 既存の MealPlanDto が返る（重複作成なし）                                |
| N-03 | `AddRecipeToMealPlanUseCase` — status=draft                         | PlannedRecipeDto が返る。scaleFactor が正しく保持される                  |
| N-04 | `AddRecipeToMealPlanUseCase` — status=shopping                      | 同上（shopping でもレシピ追加可能）                                      |
| N-05 | `AddRecipeToMealPlanUseCase` — scaleFactor=1.5（小数）              | 小数 scaleFactor が正常に保存・返却される                                |
| N-06 | `AddRecipeToMealPlanUseCase` — 同一 recipeId を複数回追加           | 別 PlannedRecipeId で複数の PlannedRecipe が作成される                   |
| N-07 | `RemoveRecipeFromMealPlanUseCase` — 存在する plannedRecipeId        | void（204）。その後 GetCurrentMealPlan で当該 PlannedRecipe が消えている |
| N-08 | `GetCurrentMealPlanUseCase` — 現在週に MealPlan あり                | 対象 MealPlanDto が返る                                                  |
| N-09 | `GetCurrentMealPlanUseCase` — 現在週に MealPlan なし                | null（または 204）                                                       |
| N-10 | `GetMealPlanHistoryUseCase` — limit=4                               | 最新 4 件が週の新しい順で返る                                            |
| N-11 | `GetMealPlanHistoryUseCase` — 件数が limit より少ない               | 実件数のみ返る（エラーなし）                                             |
| N-12 | `GetMealPlanHistoryUseCase` — 件数 0                                | 空配列 `[]`                                                              |
| N-13 | `MealPlan.transitionTo('shopping')` — status=draft から             | status が 'shopping' に変わる                                            |
| N-14 | `MealPlan.transitionTo('draft')` — status=shopping から（やり直し） | status が 'draft' に戻る                                                 |
| N-15 | `MealPlan.transitionTo('cooking')` → `'consuming'` → `'completed'`  | 全遷移が成功し、completed 時に completedAt が設定される                  |

### 6-2. 異常系

| No   | ケース                                                         | 期待される挙動                                       |
| ---- | -------------------------------------------------------------- | ---------------------------------------------------- |
| E-01 | `AddRecipeToMealPlanUseCase` — 存在しない mealPlanId           | `MealPlanNotFoundError` → 404                        |
| E-02 | `AddRecipeToMealPlanUseCase` — status=cooking                  | `InvalidMealPlanStateError` → 422                    |
| E-03 | `AddRecipeToMealPlanUseCase` — status=consuming                | `InvalidMealPlanStateError` → 422                    |
| E-04 | `AddRecipeToMealPlanUseCase` — status=completed                | `InvalidMealPlanStateError` → 422                    |
| E-05 | `AddRecipeToMealPlanUseCase` — scaleFactor = 0                 | バリデーションエラー → 400（scaleFactor は正数必須） |
| E-06 | `AddRecipeToMealPlanUseCase` — scaleFactor < 0                 | バリデーションエラー → 400                           |
| E-07 | `RemoveRecipeFromMealPlanUseCase` — 存在しない mealPlanId      | `MealPlanNotFoundError` → 404                        |
| E-08 | `RemoveRecipeFromMealPlanUseCase` — 存在しない plannedRecipeId | `PlannedRecipeNotFoundError` → 404                   |
| E-09 | `RemoveRecipeFromMealPlanUseCase` — status=cooking 以降        | `InvalidMealPlanStateError` → 422                    |
| E-10 | `MealPlan.transitionTo('cooking')` — status=draft              | `Error`（canTransitionTo が false）                  |
| E-11 | `MealPlan.transitionTo('draft')` — status=cooking 以降         | `Error`（逆遷移不可）                                |
| E-12 | `MealPlan.transitionTo('completed')` — status=completed        | `Error`（completed からは遷移不可）                  |
| E-13 | `POST /api/meal-plans` — weekIdentifier フォーマット不正       | 400（Zod バリデーションエラー）                      |
| E-14 | `POST /api/meal-plans/:id/recipes` — id が UUID 形式でない     | 400（Zod バリデーションエラー）                      |
| E-15 | `CreateMealPlanUseCase` — 同一週に既存あり（エラー案採用時）   | `MealPlanAlreadyExistsError` → 409                   |

### 6-3. 境界条件

| No   | ケース                                                    | 確認内容                                            |
| ---- | --------------------------------------------------------- | --------------------------------------------------- |
| B-01 | WeekIdentifier.fromDate — 土曜 00:00:00                   | その土曜が週開始日として返る                        |
| B-02 | WeekIdentifier.fromDate — 金曜 23:59:59                   | 直前の土曜を週開始日とする週が返る                  |
| B-03 | WeekIdentifier.fromDate — 土曜 23:59:59                   | その土曜が週開始日として返る（B-01 と同一週）       |
| B-04 | WeekIdentifier.current — 実行日が土曜                     | その日が週開始日                                    |
| B-05 | WeekIdentifier.current — 実行日が金曜                     | 6日前の土曜が週開始日                               |
| B-06 | GetMealPlanHistoryUseCase — limit=1                       | 最新 1 件のみ返る                                   |
| B-07 | PlannedRecipe.create — scaleFactor = 0.001（最小正数）    | 正常に作成される                                    |
| B-08 | PlannedRecipe.create — scaleFactor = 3（整数）            | 正常に作成される                                    |
| B-09 | MealPlan — plannedRecipes が 0 件の状態で removeRecipe    | `PlannedRecipeNotFoundError`                        |
| B-10 | 同一 MealPlan に同一 recipeId を 2 回 addRecipe           | 別 PlannedRecipeId で 2 つ作成される（重複許容）    |
| B-11 | year をまたぐ週（例: 2026-12-26 土曜〜2027-01-01 金曜）   | WeekIdentifier が正しく 2026-12-26 週として扱われる |
| B-12 | GetMealPlanHistoryUseCase — limit=4 で DB に 3 件しかない | 3 件返却（エラーなし）                              |

### 6-4. ステータス遷移の全経路確認

| 経路                  | 可否         |
| --------------------- | ------------ |
| draft → shopping      | 可           |
| shopping → draft      | 可           |
| shopping → cooking    | 可           |
| cooking → consuming   | 可           |
| consuming → completed | 可           |
| draft → cooking       | 不可         |
| draft → consuming     | 不可         |
| draft → completed     | 不可         |
| cooking → draft       | 不可         |
| cooking → shopping    | 不可         |
| consuming → draft     | 不可         |
| consuming → shopping  | 不可         |
| consuming → cooking   | 不可         |
| completed → any       | 不可（全て） |

---

## 7. 影響範囲

### 7-1. 新規作成ファイル

**packages/domain/src/meal-plan/**

| ファイル                  | 内容                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `meal-plan-id.ts`         | MealPlanId 値オブジェクト（ProductId パターン）                                                 |
| `planned-recipe-id.ts`    | PlannedRecipeId 値オブジェクト（同上）                                                          |
| `meal-plan.ts`            | MealPlan 集約・PlannedRecipe エンティティ・MealPlanStatus 型・各種 Props/Input インターフェース |
| `meal-plan.repository.ts` | MealPlanRepository インターフェース                                                             |
| `meal-plan-id.test.ts`    | MealPlanId 単体テスト                                                                           |
| `meal-plan.test.ts`       | MealPlan 集約・ステータス遷移テスト                                                             |

**packages/domain/src/shared/**

| ファイル                  | 内容                                            |
| ------------------------- | ----------------------------------------------- |
| `week-identifier.ts`      | WeekIdentifier 値オブジェクト（土曜始まり）     |
| `week-identifier.test.ts` | WeekIdentifier 単体テスト（週境界・年またぎ等） |

**packages/application/src/meal-plan/**

| ファイル                                   | 内容                                         |
| ------------------------------------------ | -------------------------------------------- |
| `meal-plan.dto.ts`                         | MealPlanDto / PlannedRecipeDto / 各 InputDto |
| `meal-plan.mapper.ts`                      | Entity ↔ DTO 変換                            |
| `meal-plan-not-found.error.ts`             | MealPlanNotFoundError                        |
| `planned-recipe-not-found.error.ts`        | PlannedRecipeNotFoundError                   |
| `invalid-meal-plan-state.error.ts`         | InvalidMealPlanStateError                    |
| `create-meal-plan.use-case.ts`             | CreateMealPlanUseCase                        |
| `add-recipe-to-meal-plan.use-case.ts`      | AddRecipeToMealPlanUseCase                   |
| `remove-recipe-from-meal-plan.use-case.ts` | RemoveRecipeFromMealPlanUseCase              |
| `get-current-meal-plan.use-case.ts`        | GetCurrentMealPlanUseCase                    |
| `get-meal-plan-history.use-case.ts`        | GetMealPlanHistoryUseCase                    |
| `index.ts`                                 | バレルエクスポート                           |
| `meal-plan-use-cases.test.ts`              | UseCase テスト（モック Repository）          |

**packages/infrastructure/src/repositories/**

| ファイル                               | 内容                            |
| -------------------------------------- | ------------------------------- |
| `drizzle-meal-plan.repository.ts`      | DrizzleMealPlanRepository       |
| `drizzle-meal-plan.repository.test.ts` | Repository 統合テスト（PGlite） |

**packages/infrastructure/src/db/migrations/**

- Drizzle 生成マイグレーションファイル（`meal_plans` / `planned_recipes` テーブル）

**packages/api-contract/src/**

| ファイル              | 内容                                                                |
| --------------------- | ------------------------------------------------------------------- |
| `meal-plan.schema.ts` | Zod スキーマ（createMealPlanSchema / addRecipeToMealPlanSchema 等） |

**apps/web/src/server/routes/**

| ファイル        | 内容                          |
| --------------- | ----------------------------- |
| `meal-plans.ts` | mealPlansRoute（Hono ルート） |

### 7-2. 既存ファイルへの追記

| ファイル                                   | 変更内容                                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/infrastructure/src/db/schema.ts` | `meal_plans` / `planned_recipes` テーブル定義を追記                                                                                                     |
| `packages/infrastructure/src/index.ts`     | `DrizzleMealPlanRepository` の re-export 追加                                                                                                           |
| `packages/application/src/index.ts`        | `export * from './meal-plan'` を追加                                                                                                                    |
| `packages/api-contract/src/index.ts`       | `export * from './meal-plan.schema'` を追加                                                                                                             |
| `apps/web/src/server/app.ts`               | `mealPlansRoute` の `.route()` 登録、`MealPlanNotFoundError` / `PlannedRecipeNotFoundError` / `InvalidMealPlanStateError` の `onError` ハンドリング追加 |

### 7-3. 既存集約への影響

| 集約         | 影響                                                                                 |
| ------------ | ------------------------------------------------------------------------------------ |
| Recipe       | 参照されるのみ（ID 参照）。Recipe 側への変更なし                                     |
| Product      | 影響なし                                                                             |
| Store        | 影響なし                                                                             |
| ShoppingList | 影響なし（Sprint 4 で MealPlan → ShoppingList の連携が生じるが Sprint 3 スコープ外） |

### 7-4. DB スキーマ（設計フェーズで確定）

想定テーブル構成（設計者が最終決定すること）:

```
meal_plans
  id              text PRIMARY KEY
  week_start_date date NOT NULL UNIQUE  ← WeekIdentifier の内部表現に依存（設計確定事項）
  status          text NOT NULL
  created_at      timestamp NOT NULL DEFAULT now()
  completed_at    timestamp

planned_recipes
  id              text PRIMARY KEY
  meal_plan_id    text NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE
  recipe_id       text NOT NULL
  scale_factor    numeric(10, 3) NOT NULL
  scheduled_date  date
  cooked_at       timestamp
  notes           text NOT NULL DEFAULT ''
  created_at      timestamp NOT NULL DEFAULT now()
```

インデックス候補: `planned_recipes(meal_plan_id)` — MealPlan ごとのレシピ一覧取得に使用

### 7-5. 依存関係の波及

```
apps/web/src/server/app.ts
  └─→ apps/web/src/server/routes/meal-plans.ts
        ├─→ @cookpit/application (5 UseCases)
        ├─→ @cookpit/infrastructure (DrizzleMealPlanRepository)
        └─→ @cookpit/api-contract (createMealPlanSchema 等)

packages/application/src/meal-plan/*
  └─→ packages/domain/src/meal-plan/meal-plan.ts
  └─→ packages/domain/src/meal-plan/meal-plan.repository.ts
  └─→ packages/domain/src/shared/week-identifier.ts

packages/infrastructure/src/repositories/drizzle-meal-plan.repository.ts
  ├─→ packages/domain/src/meal-plan/meal-plan.ts
  ├─→ packages/domain/src/meal-plan/meal-plan.repository.ts
  └─→ packages/infrastructure/src/db/schema.ts
```

---

## 8. 参照ファイル（主要なもの）

既存実装パターンの参照先:

- `/Users/siro/Desktop/Cookpit/docs/04-domain-model.md` — MealPlan 集約の正典仕様（ユーザー確定判断を優先）
- `/Users/siro/Desktop/Cookpit/docs/03-architecture.md` — 層構成・依存方向・DI 方針
- `/Users/siro/Desktop/Cookpit/packages/domain/src/product/product-id.ts` — ID 値オブジェクトのパターン
- `/Users/siro/Desktop/Cookpit/packages/domain/src/product/product.ts` — Entity の create/reconstruct パターン
- `/Users/siro/Desktop/Cookpit/packages/domain/src/product/product.repository.ts` — Repository インターフェースパターン
- `/Users/siro/Desktop/Cookpit/packages/application/src/product/product.dto.ts` — DTO パターン（平坦構造・ISO 8601 文字列）
- `/Users/siro/Desktop/Cookpit/packages/application/src/product/product.mapper.ts` — Mapper パターン
- `/Users/siro/Desktop/Cookpit/packages/application/src/product/create-product.use-case.ts` — UseCase パターン
- `/Users/siro/Desktop/Cookpit/packages/application/src/product/product-not-found.error.ts` — NotFoundError パターン
- `/Users/siro/Desktop/Cookpit/packages/infrastructure/src/db/schema.ts` — Drizzle スキーマ（追記対象）
- `/Users/siro/Desktop/Cookpit/packages/infrastructure/src/repositories/drizzle-product.repository.ts` — Repository 実装パターン（JOIN・reconstruct）
- `/Users/siro/Desktop/Cookpit/packages/api-contract/src/product.schema.ts` — Zod スキーマパターン
- `/Users/siro/Desktop/Cookpit/apps/web/src/server/routes/products.ts` — Hono ルートパターン
- `/Users/siro/Desktop/Cookpit/apps/web/src/server/app.ts` — onError ハンドリング（追記対象）
- `/Users/siro/Desktop/Cookpit/docs/requirements/store-master.md` — L3 要件書の先例（章立て踏襲）
