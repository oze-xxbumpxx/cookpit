# 実装計画: meal-plan-week-application

- 前提となる設計書: `docs/designs/meal-plan-week-application.md`（confirmed / L2 / 案 A）
- 関連: `docs/tests/meal-plan-week-application.md`（試験観点 MPWQ-01〜MPWQ-20 の正典。
  本計画のテストステップはこれを参照するのみで重複定義しない）
- レベル: L2
- 実装ルート: Orchestrator（implementer）
- 判断理由: 既定。層の小さな構造修正（純関数 2 つの追加 + Presentation 2 ファイルの
  import 差し替え）であり、新規 UseCase・DB・API 契約の変更を伴わないため Codex 委譲は不要
  （出典: `docs/06-ai-tools.md` の実装ルート基準「小さな構造修正は Orchestrator 既定」）。

## 実装順序に関する重要事項（ユーザー要求）

**テスト先行（TDD）を必須とする。** 現行 `apps/web/src/app/meal-plans/page.tsx` の
`resolveSelectedWeek` が持つ query 解釈ロジック（正規表現 + Invalid Date フォールバック +
土曜スナップ + prev/next 算出）には単体テストが無い。このロジックを Application へ移す前に、
移設先のテスト（`meal-plan-week-query.test.ts`）を**先に**書いて現行挙動をロックし、
その後にヘルパー実装 → ページ差し替えを行う。ステップ順序はこの制約を満たすように並べてある
（実装手順の Step 1 がテスト作成、Step 2〜3 が実装、Step 4〜5 がページ差し替え）。

## 変更対象ファイル

| path | 変更する理由 |
| --- | --- |
| `packages/application/src/meal-plan/meal-plan.dto.ts` | `MealPlanWeekSelection` 型を追記する（新規ヘルパーの戻り値型） |
| `packages/application/src/meal-plan/index.ts` | 新規モジュールをバレル export に追加する |
| `apps/web/src/app/meal-plans/page.tsx` | `@cookpit/domain` の直接 import と `resolveSelectedWeek` を削除し、`resolveMealPlanWeekQuery` 呼び出しに置き換える |
| `apps/web/src/app/meal-plans/history/page.tsx` | `@cookpit/domain` の直接 import と `WeekIdentifier.current().toString()` を削除し、`currentWeekIdentifier()` 呼び出しに置き換える |
| `docs/designs/meal-plan-week-selection.md` | 変更なし（D-5 の追記は設計フェーズで既に完了済み。本計画では diff が発生しないことを確認するだけ） |

## 新規作成ファイル

| path | 役割 |
| --- | --- |
| `packages/application/src/meal-plan/meal-plan-week-query.ts` | 週クエリ解釈の純関数 2 つ（`currentWeekIdentifier` / `resolveMealPlanWeekQuery`）を提供する。Domain の `WeekIdentifier` を内部実装詳細としてのみ利用する |
| `packages/application/tests/meal-plan/meal-plan-week-query.test.ts` | 上記モジュールの単体テスト。現行 `page.tsx` の挙動（正規表現・Invalid Date フォールバック・土曜スナップ・prev/next ±7日）をロックする。`@cookpit/application` の vitest `include` は `tests/**/*.test.ts`（`packages/application/vitest.config.ts` → `@cookpit/config/vitest/base` を確認済み）なのでこのファイル名で収集される |

## ファイルごとの変更内容

### `packages/application/tests/meal-plan/meal-plan-week-query.test.ts`（新規・Step 1 で作成）

- 変更内容: **正典は `docs/tests/meal-plan-week-application.md` の単体試験観点表
  MPWQ-01〜MPWQ-20**（test-designer が作成済み）。本実装計画はこれを重複定義しない。
  実装者は MPWQ-01〜MPWQ-20 の全観点を `it(...)` として実装する。要点のみ再掲する。

  - 基準日は `asOf = new Date('2026-07-10T10:00:00')`（金曜）固定。現在週は `'2026-07-04'`
    （`packages/domain/tests/shared/week-identifier.test.ts` の同一基準日テストと同じ期待値。
    Domain と矛盾しないことの根拠にもなる）。
  - Invalid Date fixture は **`'2026-99-99'`** を使う（MPWQ-14）。`'2026-02-30'` は
    正規表現には一致するが Node（`engines.node >=20`。実測 Node 22.14.0）では
    Invalid Date にならず `2026-03-02`（月曜）へ overflow する（実測済み）ため、
    Invalid Date フォールバックの確認には使えない。`'2026-02-30'` は MPWQ-15
    （overflow して有効な日付になり、current フォールバックにしてはいけないケース）として
    別に検証する。**設計書「テスト方針」の `"2026-02-30"` という記述はこの点で誤りであり、
    MPWQ-14/15 の区別を正として実装する**（試験計画で既に訂正済み）。
  - `previous`/`next` は selected の ±7日（MPWQ-16/17）。非土曜スナップ後の土曜が基準になる
    こと（raw の生日付からではないこと）を MPWQ-17 で確認する。
  - `asOf` 省略時（ページが渡さないパス）は `vi.useFakeTimers()` +
    `vi.setSystemTime(new Date('2026-07-10T10:00:00'))` で確認する（MPWQ-19/20）。
    `afterEach` で `vi.useRealTimers()` を呼ぶ（`week-identifier.test.ts` と同じパターン）。
  - MPWQ-18 は `WeekIdentifier.fromDate`（`@cookpit/domain` を直接 import）の計算結果と
    比較し、Application 側で土曜スナップを再実装していないことを保証する。

- 完了条件:
  - MPWQ-01〜MPWQ-20（20 ケース）すべてが `it(...)` として存在する。
  - この時点ではまだ `meal-plan-week-query.ts` を作成していないため、
    `pnpm --filter @cookpit/application test -- meal-plan-week-query` は
    モジュール未検出で失敗する（red 状態が期待どおりであることを確認する。これは
    Step 2〜3 実装後に green化する）。
  - `docs/tests/meal-plan-week-application.md` の「完了条件」節（MPWQ-15/14 の区別、
    メソッド網羅チェック表との対応）も満たしている。

### `packages/application/src/meal-plan/meal-plan.dto.ts`（Step 2）

- 変更内容: ファイル末尾に以下を追記する（既存の型定義は変更しない）。

```typescript
export interface MealPlanWeekSelection {
  currentWeekIdentifier: string;
  selectedWeekIdentifier: string;
  previousWeekIdentifier: string;
  nextWeekIdentifier: string;
}
```

- 完了条件: `MealPlanWeekSelection` が named export され、既存の `MealPlanDto` 等の型定義に
  diff が無い。

### `packages/application/src/meal-plan/meal-plan-week-query.ts`（新規・Step 3）

- 変更内容: 公開関数 2 つを実装する。設計書のサンプルコードは `asOf ?? new Date()` を
  `currentWeekIdentifier` と `parseSelectedWeek`（内部関数）の 2 箇所で別々に評価しており、
  `asOf` 省略時（ページの通常パス）に `new Date()` が 2 回呼ばれて基準時刻がずれ得る
  （設計書 リスク R-1）。**設計書のサンプルコードより R-1 の対策を優先し、
  `resolveMealPlanWeekQuery` の内部で `asOf ?? new Date()` を 1 度だけ評価**してから
  `current` と `selected` の両方に使う（`parseSelectedWeek` には計算済みの `current`
  を fallback 値として渡す。`asOf` を再度参照しない）。実装例（変数名は実装者の裁量で
  調整可。公開関数名・シグネチャ・JSDoc の契約情報は固定）:

```typescript
import { WeekIdentifier } from '@cookpit/domain';
import type { MealPlanWeekSelection } from './meal-plan.dto';

const WEEK_QUERY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * asOf（省略時は現在時刻）が属する週の識別子を返す。週は土曜開始（Domain の
 * WeekIdentifier 不変条件。非土曜は直前の土曜へスナップ）。
 */
export function currentWeekIdentifier(asOf?: Date): string {
  return WeekIdentifier.fromDate(asOf ?? new Date()).toString();
}

/**
 * `?week=` クエリの解釈結果を返す純関数。
 *
 * - raw が undefined、`YYYY-MM-DD` 形式に不一致、または形式に一致しても Invalid Date に
 *   なる場合は現在週（current と同じ週）にフォールバックする（500 を避けるための既存挙動）。
 * - 有効な日付は WeekIdentifier.fromDate により直前の土曜へスナップされる。
 * - asOf ?? new Date() は本関数内で1度だけ評価する。current と selected（フォールバック時）
 *   の基準時刻がずれないようにするため（設計書 R-1）。
 */
export function resolveMealPlanWeekQuery(
  raw: string | undefined,
  asOf?: Date,
): MealPlanWeekSelection {
  const current = WeekIdentifier.fromDate(asOf ?? new Date());
  const selected = parseSelectedWeek(raw, current);

  return {
    currentWeekIdentifier: current.toString(),
    selectedWeekIdentifier: selected.toString(),
    previousWeekIdentifier: selected.previous().toString(),
    nextWeekIdentifier: selected.next().toString(),
  };
}

function parseSelectedWeek(raw: string | undefined, fallback: WeekIdentifier): WeekIdentifier {
  if (raw === undefined || !WEEK_QUERY_PATTERN.test(raw)) {
    return fallback;
  }
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }
  return WeekIdentifier.fromDate(date);
}
```

  - `parseSelectedWeek` は非公開（export しない）。土曜スナップ自体は
    `WeekIdentifier.fromDate` に委譲しており、Application 側で再実装していないことを
    レビュー時に確認する。
  - `any` を使わない。型はすべて明示する（`raw: string | undefined` はそのまま維持し、
    `null` へ変換しない＝ Next.js `searchParams` の契約に合わせる）。

- 完了条件:
  - Step 1 で作成した `meal-plan-week-query.test.ts`（MPWQ-01〜MPWQ-20、20 ケース）が
    全て green になる（`pnpm --filter @cookpit/application test -- meal-plan-week-query`）。
  - `parseSelectedWeek` が export されていない（`index.ts` からも辿れない）。

### `packages/application/src/meal-plan/index.ts`（Step 4）

- 変更内容: 既存の export 一覧に以下を追記する（既存行の削除・並び替えはしない）。

```typescript
export * from './meal-plan-week-query';
```

- 完了条件: `import { currentWeekIdentifier, resolveMealPlanWeekQuery } from '@cookpit/application'`
  が型エラー無く解決する。既存 9 行の export 文に diff が無い。

### `apps/web/src/app/meal-plans/page.tsx`（Step 5）

- 変更内容:
  - 1 行目の import を
    `import { GetMealPlanByWeekUseCase, GetRecipesUseCase, resolveMealPlanWeekQuery } from '@cookpit/application';`
    に変更する。
  - 2 行目 `import { WeekIdentifier } from '@cookpit/domain';` を削除する。
  - `resolveSelectedWeek` 関数（4〜23 行目）を削除する。
  - `MealPlansPage` 本体を以下に置き換える（`MealPlanClient` への props 名・型は現状と
    同一のまま）:

```typescript
export default async function MealPlansPage({ searchParams }: Props) {
  const { week } = await searchParams;
  const {
    currentWeekIdentifier,
    selectedWeekIdentifier,
    previousWeekIdentifier,
    nextWeekIdentifier,
  } = resolveMealPlanWeekQuery(week);

  const [mealPlan, recipes] = await Promise.all([
    new GetMealPlanByWeekUseCase(mealPlanRepository()).execute(selectedWeekIdentifier),
    new GetRecipesUseCase(recipeRepository()).execute(),
  ]);

  return (
    <MealPlanClient
      mealPlan={mealPlan}
      recipes={recipes}
      currentWeekIdentifier={currentWeekIdentifier}
      selectedWeekIdentifier={selectedWeekIdentifier}
      previousWeekIdentifier={previousWeekIdentifier}
      nextWeekIdentifier={nextWeekIdentifier}
    />
  );
}
```

  - `resolveMealPlanWeekQuery` を呼ぶ際に `asOf` を渡さない（ページは常に「現在時刻」基準）。

- 完了条件:
  - `rg "@cookpit/domain" apps/web/src/app/meal-plans/page.tsx` がマッチしない
    （設計書の要件 1）。
  - `rg "resolveSelectedWeek" apps/web/src/app/meal-plans/page.tsx` がマッチしない。
  - `MealPlanClient` に渡す props の名前・個数・型（すべて `string`）が変更前と同一。
  - `apps/web/tests/app/meal-plans/_components/meal-plan-client.test.tsx` に diff が無い。

### `apps/web/src/app/meal-plans/history/page.tsx`（Step 6）

- 変更内容:
  - 3 行目の import を
    `import { GetMealPlanHistoryUseCase, GetRecipesUseCase, currentWeekIdentifier } from '@cookpit/application';`
    に変更する。
  - 4 行目 `import { WeekIdentifier } from '@cookpit/domain';` を削除する。
  - 28 行目 `const currentWeekIdentifier = WeekIdentifier.current().toString();` を
    **ローカル変数名を `currentWeek` にリネームして**（設計書 リスク R-2 の対策。import した
    関数名 `currentWeekIdentifier` とのシャドーイング/衝突を避ける）
    `const currentWeek = currentWeekIdentifier();` に置き換える。
  - 60 行目 `isCurrentWeek={mealPlan.weekIdentifier === currentWeekIdentifier}` を
    `isCurrentWeek={mealPlan.weekIdentifier === currentWeek}` に更新する（比較のロジック・
    意味は変更しない。変数名のみの変更）。
  - `currentWeekIdentifier()` を呼ぶ際に引数を渡さない（履歴ページは常に「現在時刻」基準。
    設計書のデータフロー通り）。

- 完了条件:
  - `rg "@cookpit/domain" apps/web/src/app/meal-plans/history/page.tsx` がマッチしない
    （設計書の要件 2）。
  - ファイル内に `currentWeekIdentifier`（関数呼び出し・import 名）と `currentWeek`
    （ローカル変数名）が共存し、名前の衝突・シャドーイングによる型エラーが無い。
  - `isCurrentWeek` の比較対象・意味に diff が無い。

### `docs/designs/meal-plan-week-selection.md`（Step 7）

- 変更内容: なし。D-5 行に本タスク（`meal-plan-week-application.md`）への参照と
  「計算の実施場所は 2026-08-26 に Application へ移動」の追記は設計フェーズで既に完了済み
  （`docs/designs/meal-plan-week-selection.md` 33 行目で確認済み）。
- 完了条件: `git diff docs/designs/meal-plan-week-selection.md` が空であること
  （実装作業でこのファイルに新たな変更を加えない）。

## 実装手順

1. **【テスト先行】** `packages/application/tests/meal-plan/meal-plan-week-query.test.ts` を
   新規作成し、`docs/tests/meal-plan-week-application.md` の MPWQ-01〜MPWQ-20（20 ケース）
   すべてを書く（現行 `page.tsx` の挙動をロック）。この時点では対象モジュールが存在せず red の
   ままでよい（次ステップで green にする）。
2. `packages/application/src/meal-plan/meal-plan.dto.ts` に `MealPlanWeekSelection` を追記する。
3. `packages/application/src/meal-plan/meal-plan-week-query.ts` を新規作成し、
   `currentWeekIdentifier` / `resolveMealPlanWeekQuery`（R-1 対策込み）を実装する。
   Step 1 のテストが green になることを確認する
   （`pnpm --filter @cookpit/application test -- meal-plan-week-query`）。
4. `packages/application/src/meal-plan/index.ts` に `export * from './meal-plan-week-query';`
   を追記する。
5. `apps/web/src/app/meal-plans/page.tsx` を差し替える（`@cookpit/domain` import 削除、
   `resolveSelectedWeek` 削除、`resolveMealPlanWeekQuery` 呼び出しに統合）。
6. `apps/web/src/app/meal-plans/history/page.tsx` を差し替える（`@cookpit/domain` import 削除、
   ローカル変数を `currentWeek` にリネームして `currentWeekIdentifier()` 呼び出しに統合）。
7. `docs/designs/meal-plan-week-selection.md` に diff が無いことを確認する（変更しない）。
8. **品質ゲート（最後にまとめて実行）**: `pnpm lint` / `pnpm type-check` /
   `pnpm --filter @cookpit/application test` /
   `pnpm --filter @cookpit/web test`（少なくとも
   `apps/web/tests/app/meal-plans/**` と `packages/application/tests/meal-plan/**` が
   対象に含まれることを確認）を実行し、全て green であることを確認する。最後に
   `pnpm test`（turbo 経由の全パッケージ回帰）を実行し、Domain の土曜スナップテスト
   （`packages/domain/tests/shared/week-identifier.test.ts`）と
   `meal-plan-client.test.tsx` の WC-M-14/15/16 に diff が無いまま green であることを
   確認する。

## 依存関係

- Step 1（テスト作成）→ Step 3（実装）: テストは実装より先に書くが、実装が終わるまでは
  意図的に red（モジュール未検出）。
- Step 2（DTO 追記）→ Step 3（`meal-plan-week-query.ts` 実装）: `MealPlanWeekSelection` 型を
  戻り値型として使うため、DTO 追記が先。
- Step 3 → Step 4（barrel export）→ Step 5・6（ページ差し替え）: `apps/web` は
  `@cookpit/application` のバレル経由で import するため、export 追加が先。
- Step 5 と Step 6 は互いに独立（`page.tsx` と `history/page.tsx` はファイルを共有しない）。
  どちらを先にしてもよい。
- Step 7（設計書の diff 確認）は他ステップと独立。いつでも実施可能。
- Step 8（品質ゲート）は Step 1〜7 完了後、最後に一度だけ実行する。

## テスト計画

| 対象 | ファイル | 内容 |
| --- | --- | --- |
| 新規（先行作成） | `packages/application/tests/meal-plan/meal-plan-week-query.test.ts` | `docs/tests/meal-plan-week-application.md` の MPWQ-01〜MPWQ-20（20 ケース）。`@cookpit/application` の vitest include（`tests/**/*.test.ts`）に一致するファイル名・配置 |
| 変更なし（回帰確認のみ） | `packages/application/tests/meal-plan/meal-plan-use-cases.test.ts` | `GetMealPlanByWeekUseCase` のシグネチャ・実装を変えないため無改修で green のまま |
| 変更なし（回帰確認のみ） | `packages/domain/tests/shared/week-identifier.test.ts` | Domain の土曜スナップ不変条件は変更しないため無改修で green のまま |
| 変更なし（回帰確認のみ） | `apps/web/tests/app/meal-plans/_components/meal-plan-client.test.tsx` | `MealPlanClient` の props 形が不変のため WC-M-14/15/16 を含め無改修で green のまま |
| 新規テストなし（意図的） | `apps/web/src/app/meal-plans/page.tsx` / `history/page.tsx` | 設計書「テスト方針 5」により Server Component への新規 RTL テストは必須にしない（ロジックは Application のテストで固定済み） |

## リスク

| # | リスク | 対策 |
| --- | --- | --- |
| R-1（設計書由来） | `asOf ?? new Date()` の二重評価で current/selected の基準時刻がずれる | Step 3 の実装で `resolveMealPlanWeekQuery` 内部で 1 度だけ評価し `parseSelectedWeek` に計算済みの `current` を渡す（設計書サンプルより優先）。ただし `vi.useFakeTimers()` は時刻を凍結するため「二重評価」自体を検出するテストは実質作れない。実装の構造（`const current = ...` を 1 回だけ書く）とコードレビューで担保する |
| R-2（設計書由来） | `history/page.tsx` の変数名 `currentWeekIdentifier` と import する関数名が衝突する | Step 6 でローカル変数名を `currentWeek` にリネームして解消（本計画で確定。実装時の裁量にしない） |
| R-3（設計書由来） | 将来 Presentation が再び `@cookpit/domain` を import する回帰 | 本タスクでは lint 設定変更は対象外（設計書の対象外）。Step 5・6 の完了条件（`rg "@cookpit/domain"` 不一致）をレビュー時に確認する運用でカバーする |
| R-4（設計書由来） | 既存テスト（Domain 土曜スナップ、`meal-plan-client.test.tsx`）を誤って書き換える | Step 8 の品質ゲートで `git diff` を見て、これらのファイルに diff が無いことを確認する |
| R-5（試験計画で検出済み・本計画で再確認） | 設計書のテスト方針が例示する Invalid Date fixture（`"2026-02-30"`）は、このリポジトリの Node ランタイムでは実際には Invalid Date にならず `2026-03-02` へロールオーバーする（実測済み。`docs/tests/meal-plan-week-application.md` MPWQ-14/15 で既に訂正済みで、本計画でも独立に実測して同じ結論を確認した） | Step 1 のテストでは Invalid Date fixture に `"2026-99-99"`（MPWQ-14）を使い、`"2026-02-30"` は overflow して有効になるケース（MPWQ-15）として別に検証する。設計のロジック分岐自体は変更なし。テスト fixture の選定のみ実際の Date 解析結果に合わせて補正する |

## ロールバック方法

DB マイグレーション・フィーチャーフラグを伴わない構造修正のみのため、通常の `git revert` で
戻せる（設計書「移行とリリース」を継承）。ロールバック時は以下の順序を推奨する
（依存関係の逆順）:

1. `apps/web/src/app/meal-plans/page.tsx` / `history/page.tsx` を revert
   （Presentation が再び動かなくなる前に Application 側の export を残しても実害はないため、
   どちらを先に戻しても安全）。
2. `packages/application/src/meal-plan/index.ts` の export 追加を revert。
3. `packages/application/src/meal-plan/meal-plan-week-query.ts` を削除し、
   `meal-plan.dto.ts` の `MealPlanWeekSelection` 追記を revert。
4. `packages/application/tests/meal-plan/meal-plan-week-query.test.ts` を削除。

いずれの手順でも DB データ・既存 API レスポンスへの影響は無い。

## ドキュメント更新対象

- `docs/designs/meal-plan-week-selection.md`: 変更なし（既に追記済みであることを Step 7 で
  確認するのみ）。
- `docs/designs/meal-plan-week-application.md`: 変更なし（本計画の前提として確定済み。
  実装中に設計から逸脱する必要が生じた場合は、この計画・設計書を勝手に書き換えず
  Orchestrator 経由で architecture-designer へ差し戻す）。
- `docs/04-domain-model.md`: 更新不要。本タスクは Domain のエンティティ・集約定義を
  変更しない（`WeekIdentifier` は 1 行も変更しない）。
- ADR: 不要（設計書に ADR 作成の指示なし。既存 ADR-0010 の import 境界方針をそのまま踏襲する
  だけで新たな決定は発生しない）。
