# 設計書: meal-plan-week-application（献立の週計算を Application へ移動）

- ステータス: confirmed（ユーザー要求で実装方針が確定済み。案 A 以外は不採用）
- レベル: L2
- 関連: `docs/designs/meal-plan-week-selection.md`（「週を選べる」機能の正典。D-5 の計算場所を
  本書で更新）、`packages/domain/src/shared/week-identifier.ts`（週 = 土曜開始の不変条件。
  変更なし）、`.claude/rules/presentation-layer.md`、`.claude/rules/domain-layer.md`

---

## 背景

`meal-plan-week-selection.md`（D-5）で「prev/next の週識別子は Server Component で
`WeekIdentifier.previous()/next()` から算出し文字列で渡す（Client に Domain を持ち込まない）」
と定めたが、実装は Presentation（`apps/web/src/app/meal-plans/page.tsx` /
`apps/web/src/app/meal-plans/history/page.tsx`）が **Domain の `WeekIdentifier` を直接
import** し、「今週判定」「`?week=` の解釈（正規表現 + Invalid Date フォールバック）」
「prev/next 算出」をページ内で計算している。

`docs/03-architecture.md` の層構成は `Presentation → Application → Domain`。Presentation は
UseCase を呼ぶだけでドメインロジックを書かない方針（`.claude/rules/presentation-layer.md`
「層の責務」）に対し、現状は Presentation が Domain 型・Domain の計算メソッド
（`fromDate` / `current` / `previous` / `next` / `toString`）を直接使っており、方針からの
逸脱（漏れ）である。Application の `GetMealPlanByWeekUseCase.execute` は既に
`weekIdentifier: string` を受け取る設計になっており、Application 側に文字列 in/out の
週解釈ヘルパーを置く余地がある。

## 目的

献立の週計算（今週判定・`?week=` クエリ解釈・prev/next 算出）を Application 層に移し、
`apps/web` の `meal-plans/page.tsx` と `meal-plans/history/page.tsx` が `@cookpit/domain` を
import しなくなるようにする。**構造のみの修正であり、ユーザーから見える挙動・API・DB・
Domain の不変条件は一切変更しない。**

## 設計判断（案 A を確定として採用）

| 案                  | 内容                                                                                                                                                                                                                                                                                                                                                | 採用/不採用理由                                                                                                                                                                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A（推奨・確定）** | Application に純関数 `currentWeekIdentifier(asOf?: Date): string` と `resolveMealPlanWeekQuery(raw: string \| undefined, asOf?: Date): MealPlanWeekSelection` を追加する。`MealPlanWeekSelection` は `{ currentWeekIdentifier, selectedWeekIdentifier, previousWeekIdentifier, nextWeekIdentifier }`（すべて `string`）。ページは文字列だけを扱う。 | 履歴ページは `GetMealPlanByWeekUseCase` を使わない（`isCurrentWeek` 比較のみ）ため、この案だけが両ページを一律にカバーできる。既存 UseCase の契約（シグネチャ・戻り値）を変えずに Presentation の Domain 依存を切れる。週解釈は「クエリパラメータの読み取り」であり永続化を伴わないため、UseCase 化よりも軽量な純関数が層の責務に合う |
| B                   | `GetMealPlanByWeekUseCase.execute` の戻りを `{ mealPlan, weekNav }` のように拡張する                                                                                                                                                                                                                                                                | 履歴ページには効かない（`GetMealPlanByWeekUseCase` を呼んでいない）。既存の呼び出し・テスト（`meal-plan-use-cases.test.ts`）の契約変更を伴い、「戻り値を変えないこと」というユーザー確定制約に反する                                                                                                                                  |
| C                   | 週クエリ解釈を新しい UseCase クラス（`ResolveMealPlanWeekUseCase` 等）として `execute()` のみ持たせる                                                                                                                                                                                                                                               | `.claude/rules/domain-layer.md` の「1 UseCase = 1 クラス」は永続化・業務操作（Repository を伴う操作）を想定した規約であり、DB アクセスを伴わない純粋なクエリ文字列解釈をクラス化するのは過剰。関数で十分に層の責務分離を満たせる                                                                                                      |

**確定**: 案 A。トレードオフの検討は上記で完了しており、本タスクでは他案への変更提案を行わない
（ユーザー要求が既にこの方針で確定しているため）。

## 要件

1. `apps/web/src/app/meal-plans/page.tsx` が `@cookpit/domain` を import しないこと。
2. `apps/web/src/app/meal-plans/history/page.tsx` が `@cookpit/domain` を import しないこと。
3. 週の計算（今週判定・`?week=` 解釈・prev/next 算出）は `packages/application` に置く。
4. Domain は `WeekIdentifier` を引き続き所有し、土曜スナップ不変条件は Domain に残る。
5. `?week=` の土曜スナップ・prev/next リンクの振る舞いは現状と完全に同一（後述「挙動の正典」）。
6. `GetMealPlanByWeekUseCase` / `GetCurrentMealPlanUseCase` / `GetMealPlanHistoryUseCase` の
   シグネチャ・戻り値は変更しない。
7. 既存 meal-plan テスト（Domain の土曜スナップテスト、`meal-plan-client.test.tsx` の
   WC-M-14/15/16）のアサーション意味を変えない。

## 対象範囲

- `packages/application/src/meal-plan/`: 週クエリ解釈用の新規モジュール（純関数 2 つ + 型 1 つ）
  の追加と、`index.ts` バレルへの export 追加。
- `packages/application/tests/meal-plan/`: 新規モジュールの単体テスト追加（先行して追加し、
  現行 `page.tsx` の挙動をロックする）。
- `apps/web/src/app/meal-plans/page.tsx`: `WeekIdentifier` 直接使用をやめ、Application の
  新規ヘルパー呼び出しに置き換え。
- `apps/web/src/app/meal-plans/history/page.tsx`: `WeekIdentifier.current().toString()` を
  Application の新規ヘルパー呼び出しに置き換え。
- `docs/designs/meal-plan-week-selection.md`: D-5 の計算場所に関する短い追記（既存の意味は
  変えない）。

## 対象外

- Domain `WeekIdentifier` の実装変更（土曜開始・`fromDate`/`fromString`/`previous`/`next`/
  `toString` のロジックは 1 行も変えない）。
- `GetMealPlanByWeekUseCase` / `GetCurrentMealPlanUseCase` / `GetMealPlanHistoryUseCase` の
  シグネチャ・戻り値・内部実装の変更。
- 新規 API エンドポイント・Hono ルート・`packages/api-contract` の変更。
- DB スキーマ・マイグレーションの変更。
- `shopping-list` / `pantry` / `cheapest-store` / `recipe` / `price-record` / fixture 関連の
  すべて。特に `cheapest-store` の削除や控除ルールの変更は行わない（本タスクと無関係）。
- UI の文言・週ナビの見た目（`meal-plan-client.tsx` の JSX・文言分岐は変更しない）。
- `meal-plan-week-selection.md` の D-1〜D-7 の意味の変更（D-5 の「計算場所」の記述のみ更新）。
- 週モデルの日付範囲化・買い物リスト生成ロジックの変更（`meal-plan-week-selection.md` の
  既存対象外を継承）。

## 現状構成

```
apps/web/src/app/meal-plans/page.tsx
  import { WeekIdentifier } from '@cookpit/domain'  ← Presentation が Domain 型を直接使用
  resolveSelectedWeek(raw): WeekIdentifier            ← ページ内に正規表現 + スナップ判断
    - GetMealPlanByWeekUseCase.execute(selectedWeek.toString())
    - MealPlanClient へ current/selected/previous/next を toString() して渡す

apps/web/src/app/meal-plans/history/page.tsx
  import { WeekIdentifier } from '@cookpit/domain'
    - WeekIdentifier.current().toString() を isCurrentWeek 比較に使用

packages/application/src/meal-plan/
  get-meal-plan-by-week.use-case.ts   （string 受け取り。変更なし）
  get-current-meal-plan.use-case.ts   （asOf?: Date 受け取り。変更なし。history では未使用）
```

Presentation が `WeekIdentifier.current()` / `.fromDate()` / `.previous()` / `.next()` /
`.toString()` を直接呼んでおり、Application を経由していない。

## 変更後構成

```
packages/application/src/meal-plan/
  meal-plan-week-query.ts   ← 新規：週クエリ解釈の純関数（Domain の WeekIdentifier を利用）
    - currentWeekIdentifier(asOf?: Date): string
    - resolveMealPlanWeekQuery(raw: string | undefined, asOf?: Date): MealPlanWeekSelection
  meal-plan.dto.ts           ← 追記：MealPlanWeekSelection 型
  index.ts                   ← 追記：上記の export

apps/web/src/app/meal-plans/page.tsx
  import { GetMealPlanByWeekUseCase, GetRecipesUseCase, resolveMealPlanWeekQuery }
    from '@cookpit/application'
  （`@cookpit/domain` import 削除）
    - resolveMealPlanWeekQuery(week) から4つの週識別子文字列を取得
    - GetMealPlanByWeekUseCase.execute(selectedWeekIdentifier) はそのまま
    - MealPlanClient への props は文字列のみ（変更なし）

apps/web/src/app/meal-plans/history/page.tsx
  import { currentWeekIdentifier } from '@cookpit/application'
  （`@cookpit/domain` import 削除）
    - currentWeekIdentifier() を isCurrentWeek 比較に使用
```

Presentation は「文字列を受け取り、文字列を UseCase / ヘルパーに渡す」だけになり、
`@cookpit/domain` への依存がゼロになる。週計算のロジック（正規表現・Invalid Date
フォールバック・土曜スナップの利用・±7日算出）は Application の新規モジュールに集約される。
Domain の `WeekIdentifier` はこの新規モジュールの内部実装詳細としてのみ使われ、土曜スナップ
という不変条件は引き続き Domain が所有する（Application は `fromDate`/`previous`/`next` を
呼ぶだけで、スナップ計算そのものを再実装しない）。

## データフロー

### `/meal-plans`（変更後）

```
1. Next.js Server Component が searchParams.week（string | undefined）を受け取る
2. resolveMealPlanWeekQuery(week) を呼ぶ（Application の純関数、asOf 省略 = new Date()）
   → { currentWeekIdentifier, selectedWeekIdentifier,
       previousWeekIdentifier, nextWeekIdentifier }（すべて string）
3. GetMealPlanByWeekUseCase(mealPlanRepository()).execute(selectedWeekIdentifier)
   → 内部で WeekIdentifier.fromString → findByWeek → MealPlanDto | null（変更なし）
4. GetRecipesUseCase(recipeRepository()).execute() → RecipeDto[]（変更なし）
5. MealPlanClient に mealPlan / recipes / 4つの週識別子文字列を渡す（props 形は変更なし）
```

### `/meal-plans/history`（変更後）

```
1. Next.js Server Component が searchParams.limit を受け取る（変更なし）
2. GetMealPlanHistoryUseCase.execute({ limit }) → MealPlanDto[]（変更なし）
3. currentWeekIdentifier()（Application の純関数、引数なし）→ string
4. mealPlan.weekIdentifier === currentWeekIdentifier() で isCurrentWeek 判定（変更なし）
```

いずれも UseCase 呼び出しの前後関係・Repository アクセス・戻り値は変わらない。追加された
のは「週識別子文字列を作る関数の呼び出し元が Presentation から Application 内部関数に
変わった」ことのみで、I/O・DB アクセスパターンは一切増減しない。

## API 設計

対象外（Hono ルート・`packages/api-contract` の変更なし。新規 API エンドポイントを追加しない）。

## DB 設計

対象外（テーブル・カラム・マイグレーションの変更なし。`findByWeek` のクエリ実装も変更しない）。

## フロントエンド設計

### `apps/web/src/app/meal-plans/page.tsx`

- `import { WeekIdentifier } from '@cookpit/domain'` を削除する。
- `resolveSelectedWeek` 関数をページから削除する（Application の
  `resolveMealPlanWeekQuery` に統合されるため不要）。
- `import { GetMealPlanByWeekUseCase, GetRecipesUseCase, resolveMealPlanWeekQuery } from '@cookpit/application'`
  に変更する。
- 実装イメージ（実装者の裁量で内部変数名は調整可。公開関数名・戻り値の形は下記「設計判断」で
  固定）:

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

- `MealPlanClient` への props の名前・型（すべて `string`）は現状と同一。`meal-plan-client.tsx`
  は変更しない。

### `apps/web/src/app/meal-plans/history/page.tsx`

- `import { WeekIdentifier } from '@cookpit/domain'` を削除する。
- `import { currentWeekIdentifier } from '@cookpit/application'`（既存の
  `GetMealPlanHistoryUseCase, GetRecipesUseCase` import に追加する形）。
- `const currentWeekIdentifier = WeekIdentifier.current().toString();` の行を
  `const currentWeekIdentifier = currentWeekIdentifier();` に置き換える
  （変数名とインポート名が衝突する場合は実装時にどちらかをリネームする。挙動は不変）。
- 以降の `isCurrentWeek={mealPlan.weekIdentifier === currentWeekIdentifier}` は変更しない。

## バックエンド設計

`packages/application/src/meal-plan/meal-plan-week-query.ts`（新規ファイル）に、週クエリ
解釈の純関数を 2 つ追加する。UseCase（`static create()`/永続化操作）ではなく、Presentation
から Domain 型を隠すための **Application 層の純関数ヘルパー**として位置づける
（下記「設計判断」B/C との比較を参照）。

```typescript
import { WeekIdentifier } from '@cookpit/domain';
import type { MealPlanWeekSelection } from './meal-plan.dto';

const WEEK_QUERY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function currentWeekIdentifier(asOf?: Date): string {
  return WeekIdentifier.fromDate(asOf ?? new Date()).toString();
}

export function resolveMealPlanWeekQuery(
  raw: string | undefined,
  asOf?: Date,
): MealPlanWeekSelection {
  const selected = parseSelectedWeek(raw, asOf);
  const current = WeekIdentifier.fromDate(asOf ?? new Date());

  return {
    currentWeekIdentifier: current.toString(),
    selectedWeekIdentifier: selected.toString(),
    previousWeekIdentifier: selected.previous().toString(),
    nextWeekIdentifier: selected.next().toString(),
  };
}

function parseSelectedWeek(raw: string | undefined, asOf?: Date): WeekIdentifier {
  if (raw === undefined || !WEEK_QUERY_PATTERN.test(raw)) {
    return WeekIdentifier.fromDate(asOf ?? new Date());
  }
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return WeekIdentifier.fromDate(asOf ?? new Date());
  }
  return WeekIdentifier.fromDate(date);
}
```

`packages/application/src/meal-plan/meal-plan.dto.ts` に型を追記する：

```typescript
export interface MealPlanWeekSelection {
  currentWeekIdentifier: string;
  selectedWeekIdentifier: string;
  previousWeekIdentifier: string;
  nextWeekIdentifier: string;
}
```

`packages/application/src/meal-plan/index.ts` に export を追加する：

```typescript
export * from './meal-plan-week-query';
```

（`meal-plan.dto.ts` は既に export 済みのため型は自動的にバレルへ乗る。）

依存方向は `Application → Domain` のまま（既存の `GetCurrentMealPlanUseCase` /
`GetMealPlanByWeekUseCase` も同様に `@cookpit/domain` の `WeekIdentifier` を import しており、
今回の新規モジュールも同じ層関係）。`packages/domain` 側の変更は無い。

## エラー処理

外部 API・外部ストレージへの新規 I/O は無いため、`create-design-document` Skill の
5 項目（リトライ・タイムアウト・冪等性・部分失敗・フォールバック）は対象外。

本モジュールが担う「エラー処理」は、壊れた `?week=` クエリを 500 にしないための入力検証
（既存挙動の移動）のみ：

- `raw` が `undefined`、または `YYYY-MM-DD` 正規表現に不一致 → 現在週にフォールバック。
- 正規表現には一致するが `new Date(...)` が Invalid Date（例: `2026-99-99`）→ 現在週に
  フォールバック。`2026-02-30` は V8 では overflow して有効日付になるため、この分岐には使わない。
- 例外を投げない・呼び出し元（Server Component）でも try/catch を追加しない（現状も
  例外は発生しないため、この点も変更なし）。

## ログと監視

変更なし（本タスクでログ・監視の追加/変更は行わない。既存のエラーログ方針に影響しない
純関数の移動のみ）。

## セキュリティ

変更なし。`?week=` は正規表現でフォーマットを絞り、`Date` の妥当性を検証してから
`WeekIdentifier.fromDate` に渡す既存の入力サニタイズをそのまま Application 側に移すのみで、
新たな攻撃面は生じない。認証機構は MVP1 で未導入のままであり、本タスクはこれに影響しない。

## 性能

対象外。本タスクは Infrastructure 経由の外部 I/O・DB クエリを新設/変更せず、性能要件も
明示されていない（純関数の配置変更のみで、`findByWeek` の呼び出し回数・SQL は不変）。

## テスト方針

1. **先行してロックする**: `packages/application/tests/meal-plan/` に
   `meal-plan-week-query.test.ts`（新規）を追加し、`page.tsx` の現行挙動と同じケースを
   コードを移す**前に**カバーする。
   - `raw === undefined` → 現在週（`currentWeekIdentifier` と一致）。
   - 形式不一致（例: `"2026/07/04"`、`"20260704"`）→ 現在週。
   - 正規表現には一致するが Invalid Date（例: `"2026-99-99"`。`getTime()` が NaN）→ 現在週。
     `"2026-02-30"` は V8 では overflow して有効日付になるため、current フォールバックではなく
     `WeekIdentifier.fromDate` と同じスナップ先になる（試験計画 MPWQ-14/15）。
   - 有効な土曜日付（例: `"2026-07-11"`）→ そのまま selected に採用。
   - 非土曜の有効日付（例: `"2026-07-13"` 月曜）→ 直前の土曜（`"2026-07-11"`）へスナップ
     （Domain の `fromDate` 経由。Application 側で再実装しないことの確認）。
   - `previousWeekIdentifier` / `nextWeekIdentifier` が selected の ±7日であること。
   - `asOf` を固定した決定的テスト（`resolveMealPlanWeekQuery(raw, asOf)` /
     `currentWeekIdentifier(asOf)`）。ページ側は `asOf` を渡さない（`new Date()` 相当）。
2. Domain の `WeekIdentifier`（土曜スナップ）の既存テストは変更・削除しない。移動対象は
   「クエリ文字列の解釈」であり、スナップという不変条件自体は Domain のテストが引き続き
   ロックする。
3. `GetMealPlanByWeekUseCase` の「非土曜スナップ」テスト（`meal-plan-use-cases.test.ts`）は
   残す。`execute(weekIdentifier: string)` のシグネチャ・内部実装を変えないため、このテストは
   無改修で緑のまま。
4. `apps/web/tests/app/meal-plans/_components/meal-plan-client.test.tsx` の WC-M-14/15/16
   （prev/next の href、選択週での POST）はアサーションを変更しない。`MealPlanClient` の
   props 形は不変のため、このテストファイルは無改修で緑のまま。
5. `page.tsx` / `history/page.tsx` 自体（Server Component）への新規 RTL テストは必須にしない
   （ロジックは Application のテストで固定済みのため）。
6. 実装完了後、既存の meal-plan 関連テストスイート全体（Domain / Application / Component）を
   実行し、全て緑であることを確認する（回帰確認）。

## 移行とリリース

- DB マイグレーション不要（スキーマ変更なし）。
- フィーチャーフラグ不要（ユーザーから見える挙動・レスポンス形は不変）。
- デプロイ順序の制約なし：`packages/application` の新規 export 追加 → `apps/web` の
  import 切り替えは、モノレポの単一デプロイ単位（Next.js が両パッケージを直接 import）
  のため通常の PR 単位でまとめてリリースしてよい。
- ロールバック: 通常の revert で戻せる（DB 状態に依存する変更を含まないため）。

## リスク

| #   | リスク                                                                                                                                            | 対策                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-1 | ページ側のロジックを移す際に `asOf` の受け渡しを誤り（例: `new Date()` を2回別々に呼んで `current` と `selected` の基準時刻がずれる）挙動が変わる | `resolveMealPlanWeekQuery` 内部で `asOf ?? new Date()` を1度だけ評価してから `current`/`selected`/`previous`/`next` を算出する（実装時の注意点として本書に明記）。テストを先に書いて固定する     |
| R-2 | `history/page.tsx` の変数名 `currentWeekIdentifier` と import する関数名 `currentWeekIdentifier` が衝突する                                       | 実装時に変数名を `currentWeek` 等へリネーム、または import 側を `as` エイリアスにする（比較先の意味は変えない）                                                                                  |
| R-3 | `meal-plan-week-query.ts` を Application に置いたことで、将来 Presentation が再び Domain を import する回帰が起きる                               | 既存の import 境界（ADR-0010・`docs/03-architecture.md` 表）に加え、望ましくは lint の import 制限（既存の仕組みがあれば）で検知。本タスクでは lint 設定変更は対象外だが、レビュー観点として記録 |
| R-4 | 既存テスト（Domain の土曜スナップ、`meal-plan-client.test.tsx`）を誤って書き換えてしまう                                                          | 本書「テスト方針」で明示的に「変更しない」と固定。実装計画（implementation-planner）でも差分レビュー時にこれらのファイルに diff が無いことを確認項目にする                                       |

## 未決事項

なし（ユーザー要求で確定：案 A・関数名・DTO 形・対象外領域はすべてユーザー指定のまま採用）。
