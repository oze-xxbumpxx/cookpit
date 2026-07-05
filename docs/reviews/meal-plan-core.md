# コードレビュー: meal-plan-core（Domain 層 / Unit A）

- レビュー日: 2026-07-05
- ブランチ: `feature/meal-plan-core-domain`
- 対象コミット: `3c1f622`「meal Domain層実装」
- レビュアー: Claude（reviewer.md の観点に準拠）
- 設計書: `docs/designs/meal-plan-core.md` §4 / 実装計画: `docs/implementation-plans/meal-plan-core.md` Step 1〜3 / 試験計画: `docs/tests/meal-plan-core.md` §4
- 判定: **Approve**（ハードブロッカーなし。ただし実在する指摘 6 件 — Should 2 / Nice 3 / 情報 1。N-A・N-B は要留意）
- 補足: 初版は設計適合チェック中心で「指摘なし」寄りだったが、実バグ観点で再精査し N-A〜N-D を追記した（2026-07-05 追記）

---

## レビュー範囲

commit `3c1f622` の Domain 層のみ（929 行 / 9 ファイル）。Infrastructure / Application / API-Contract / Presentation は未実装のため対象外。

| ファイル | 内容 |
|---|---|
| `packages/domain/src/meal-plan/meal-plan-id.ts` | MealPlanId VO |
| `packages/domain/src/meal-plan/planned-recipe-id.ts` | PlannedRecipeId VO |
| `packages/domain/src/shared/week-identifier.ts` | WeekIdentifier VO（土曜始まり） |
| `packages/domain/src/meal-plan/meal-plan.ts` | MealPlan 集約 + PlannedRecipe + MealPlanStatus |
| `packages/domain/src/meal-plan/meal-plan.repository.ts` | MealPlanRepository インターフェース |
| （+ 上記各 `.test.ts` 4 ファイル） | 単体テスト |

---

## 確認観点と結果サマリ

| # | 観点 | 結果 |
|---|---|---|
| 1 | 設計 §4 / 実装計画 Step 1〜3 との整合 | 完全一致（遷移表・振る舞い・シグネチャ） |
| 2 | コーディング規約（`any`/default export/`import type`/`===`/`null`） | 準拠 |
| 3 | 責務分離（Domain 依存方向・集約跨ぎ ID 参照） | 準拠（`RecipeId` の ID 参照のみ）。ただし集約エンティティの可変性漏れあり（N-B） |
| 4 | 不変条件・値の一貫性 | **`fromDate`/`fromString` の土曜スナップ非対称**（N-A）。堅牢性ギャップ（N-C） |
| 5 | エラー処理 | 計画採用方針（素 `Error` + UseCase 側変換）どおり。申し送り（N-C-err） |
| 6 | テスト（試験計画 vs 実装 / public API 網羅 / 防御性） | ほぼ完全網羅。防御的コピーは配列レベルのみ検証（N-B 関連）・軽微な未実装（N-E） |
| 7 | Codex 頻出バグ（タイポ・無限ループ getter・結線漏れ） | 検出なし |

---

## 良い点（特筆）

- **タイムゾーンの罠を両方回避**（`week-identifier.ts`）
  - `toString()` は `toISOString().slice()` を使わず `getFullYear/getMonth/getDate` で手動組み立て（実装計画 R-4 対応）
  - `fromString()` は `new Date(value + 'T00:00:00')` でローカル解釈（R-3 対応）
  - `fromDate()` が引数 `Date` を破壊せずコピー（`new Date(date)`）— テストでも担保（`week-identifier.test.ts:64`）
- **状態遷移表が設計 §4-3 と完全一致**。テストが全経路を悉皆カバー（許可 5 ＋ 不可 11 ＋ completed→any 5）。
- **防御的コピーが全 getter で徹底**（`createdAt`・`completedAt`・`scheduledDate`・`cookedAt` の Date、`plannedRecipes` の配列）。入力・出力の両方向の変更不変をテストで検証。ただし `plannedRecipes` は配列のみで要素は共有参照（N-B）。
- Codex 頻出のタイポ（`plannedRecipeRecipeId` 等）・自己参照無限ループ getter は無し。

---

## 指摘事項

> 初版は設計適合チェック中心で、下記のうち N-C-err・N-E のみを挙げていた。実バグ観点で再精査し N-A・N-B・N-C・N-D を追記（2026-07-05）。

### [Resolved（旧 Should）] N-A: `WeekIdentifier.fromDate` と `fromString` の土曜スナップが非対称

**該当箇所**: `packages/domain/src/shared/week-identifier.ts:4-11`（fromDate）, `:17-19`（fromString）

`fromDate` は直前の土曜へスナップするが、`fromString` はスナップも曜日検証もせず入力日をそのまま週開始日にする。

```text
fromDate(new Date('2026-07-05'))  → startDate = 2026-07-04（土, スナップ）
fromString('2026-07-05')          → startDate = 2026-07-05（日, そのまま）
```

**破綻シナリオ**（`CreateMealPlanUseCase` は `fromString(input.weekIdentifier)` を使う設計 §6-4）:

1. `POST /api/meal-plans {"weekIdentifier":"2026-07-05"}`（日曜）— `z.iso.date()` は曜日を見ないので通過。
2. `week_start_date = '2026-07-05'` で保存。
3. `GetCurrentMealPlanUseCase` は `fromDate(new Date())` → 土曜 `'2026-07-04'` で `findByWeek` → **ヒットせず**。作成した「今週の献立」が current から取得不能。
4. UNIQUE 制約は文字列一致のため、同一週に土曜版・日曜版の 2 件が作成可能。

**評価**: 実装計画 **R-5** で「MVP1 では対応不要」とされていた既知項目。ハードブロッカーではないが `fromDate`/`fromString` の非対称は実在した。

**Resolution（2026-07-05、ユーザー承認）**: 案 (a) を採用し、`fromString` を `fromDate` 委譲に変更して非土曜入力も直前の土曜へスナップ（`week-identifier.ts:17-20`）。生成元によらず週開始日 = 土曜が保証され、破綻パスは解消。回帰テスト追加（`week-identifier.test.ts`「fromString は非土曜の入力を直前の土曜へスナップする」）。設計 §4-6・実装計画 R-5 更新済み。

### [Should/Nice] N-B: `plannedRecipes` getter の防御的コピーが shallow で可変エンティティを漏らす

**該当箇所**: `packages/domain/src/meal-plan/meal-plan.ts:176-178`

```typescript
get plannedRecipes(): PlannedRecipe[] {
  return [...this.mealPlanPlannedRecipes];  // 配列はコピー、要素は同一参照
}
```

`PlannedRecipe` は `scheduleFor()`/`markAsCooked()` を持つ可変エンティティのため、`mealPlan.plannedRecipes[0].scheduleFor(new Date())` で集約ルートを迂回して内部状態を変更できる。`MealPlan` が仲介口（`scheduleForDay`/`markAsCooked`）を用意した意図を部分的に無効化する。

**評価**: 設計 §4-5 が「`[...this.plannedRecipes]`」＝shallow copy を明記しており**実装は設計どおり**、現状これを悪用するコード（Mapper/Repository は読み取りのみ）もない。ただし設計がエンティティ単位の可変性まで考慮できていなかった可能性あり。ハードニング（読み取り専用ビュー化など）の余地を申し送り。テスト D-MP-04 も配列レベルしか検証していない。

### [Nice] N-C: `fromString` は不正文字列を検証せず `Invalid Date` を素通しする

**該当箇所**: `packages/domain/src/shared/week-identifier.ts:17-19`

`fromString('garbage')` → `Invalid Date` → `toString()` が `'NaN-NaN-NaN'`、`equals` が常に false。DB/Zod 経由の信頼入力前提（reconstruct 系）のため実害は低いが、N-A と同根の堅牢性ギャップ。

### [情報] N-D: `PlannedRecipe.notes` に更新手段がない

**該当箇所**: `packages/domain/src/meal-plan/meal-plan.ts`（PlannedRecipe）

`create()` は `''` 固定・更新メソッドなし・値が入るのは `reconstruct`（DB）のみ。Sprint 3 で notes 編集 API 非公開のため設計上の保留だが、「新規 PlannedRecipe の notes は常に空」という制約は意識しておく。

### [Nice / 次工程への申し送り] N-C-err: Domain エラーがメッセージ文字列でしか区別できない

**該当箇所**: `packages/domain/src/meal-plan/meal-plan.ts:123, 134, 143, 205`

`addRecipe`/`removeRecipe`/`findPlannedRecipe` はすべて素の `Error` を投げ、状態ガード違反（`'Cannot ... with status'`）と not-found（`'PlannedRecipe not found'`）が **メッセージ文字列でのみ判別可能**。実装計画 Step 3 の方針「素 `Error` + UseCase 側変換」どおりで本コミットの欠陥ではないが、R-7 が「文字列マッチは壊れやすい」と警告済み。Application 層で 404/422 を出し分ける際、(a) メッセージ照合で割り切る / (b) Domain に軽量な判別情報を持たせる、を Step 3・7 一貫で決める。

### [Nice] N-E: addRecipe 経由の scaleFactor 二重防御テストが未実装

**該当箇所**: `packages/domain/src/meal-plan/meal-plan.test.ts`（試験計画 D-AR-08 相当）

`mealPlan.addRecipe(recipeId, 0)` が `PlannedRecipe.create` 内部ガードで弾かれる明示テストがない。`PlannedRecipe.create` 単体で境界（0・負数）は検証済み（`meal-plan.test.ts:110`）のため機能的にはカバー済み。必須ではない。

---

## テスト網羅（試験計画 §4 Domain との対応）

| 試験観点 | 実装 |
|---|---|
| D-ID / D-PRID（ID VO 各 5 ケース） | ✅ `meal-plan-id.test.ts` / `planned-recipe-id.test.ts` |
| D-WI-01〜15（週境界・年またぎ・current・ラウンドトリップ・防御的コピー・R-4 回帰） | ✅ `week-identifier.test.ts`（+ 引数不変テスト追加） |
| D-PR-01〜09（create/reconstruct/scheduleFor/markAsCooked/防御的コピー） | ✅ `meal-plan.test.ts` |
| D-MP-01〜05（create/reconstruct/防御的コピー） | ✅ |
| D-AR / D-RR（status ガード・重複追加・not-found） | ✅（D-AR-08 のみ N-E 参照） |
| T-01〜T-14（全 14 経路 / completed→any 5 サブケース） | ✅ 悉皆 |
| D-SCH / D-COOK（正常・not-found） | ✅ |
| D-TR-15（completedAt 副作用） | ✅ |

public API（全 static ファクトリ・メソッド・getter）にテストあり。

---

## 品質ゲート

本レビューでは未実行（ユーザー判断によりスキップ）。静的解析ベースの評価。
実行確認する場合は次を推奨:

```bash
pnpm --filter @cookpit/domain type-check
pnpm --filter @cookpit/domain test
```

---

## 結論

Domain 層は設計・実装計画・試験計画に忠実で、タイムゾーン変換・状態遷移・Codex 頻出バグといった要注意点は正しく処理されている。**マージ可能**（ハードブロッカーなし）。

ただし「指摘なし」ではない。実バグ観点で以下が実在する:

- **N-A（Resolved）**: `fromDate`/`fromString` の土曜スナップ非対称による「今週の献立が current から取れない」破綻パス。→ `fromString` にスナップを追加して解消（2026-07-05、ユーザー承認）。
- **N-B（Should/Nice）**: `plannedRecipes` getter の shallow copy が可変 `PlannedRecipe` を漏らし、集約ルートを迂回した変更が可能。設計準拠だが要ハードニング検討。
- **N-C / N-D / N-C-err / N-E**: 堅牢性・notes 更新手段・エラー判別・テスト補強の軽微項目。

**次アクション**: N-A・N-B は設計判断を伴うため Orchestrator/ユーザーへ申し送り（reviewer は独断で設計変更しない）。N-C-err は Application 層（Unit A 続き）着手時に一貫方針を決める。
