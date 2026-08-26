# 試験計画: meal-plan-week-application

- 前提となる設計書: `docs/designs/meal-plan-week-application.md`
- レベル: L2（構造移動・振る舞い同一性のロック。新規ドメインルールの追加なし）
- 目的: `apps/web/src/app/meal-plans/page.tsx` の現行ロジック（今週判定・`?week=` 解釈・
  prev/next 算出）を Application 層の純関数へ移す**前に**、現行挙動を凍結するテストを
  先行して追加する。実装後にアサーションの意味を変えないこと（挙動同一性）が目的であり、
  新しい仕様を追加するものではない。

## 試験種別

- 単体試験のみ。新規対象（`currentWeekIdentifier` / `resolveMealPlanWeekQuery`）は Domain
  リポジトリ等の外部依存を持たない純関数であり、結合試験（Repository・DB を跨ぐ確認）は
  不要。
- 既存の結合試験相当（`meal-plan-use-cases.test.ts` の `GetMealPlanByWeekUseCase`、
  `meal-plan-client.test.tsx` の WC-M-14/15/16）は**回帰試験範囲**として無改修のまま実行する
  （後述）。

## 単体試験観点（新規: `packages/application/tests/meal-plan/meal-plan-week-query.test.ts`）

全観点は「先行ロック」（実装前に追加し、`page.tsx` の現行挙動と一致することをロックする）。
`asOf` を固定して決定的にする。基準値: `asOf = 2026-07-10T10:00:00`（金曜）→ 現在週
`2026-07-04`（土曜開始、Domain の既存テストと同じ週）。

| # | 観点 | 前提 | 操作 | 期待結果 | 分類 |
| --- | --- | --- | --- | --- | --- |
| MPWQ-01 | 有効な土曜日付の raw はそのまま selected に採用 | `asOf` 固定 | `resolveMealPlanWeekQuery('2026-07-11', asOf)` | `selectedWeekIdentifier === '2026-07-11'`（スナップされない） | 正常 |
| MPWQ-02 | `asOf` 指定時の現在週算出 | `asOf = 2026-07-10T10:00:00`（金） | `currentWeekIdentifier(asOf)` | `'2026-07-04'`（直前の土曜） | 正常 |
| MPWQ-03 | `resolveMealPlanWeekQuery` の戻り値形状が過不足なし | `asOf` 固定・raw 有効土曜 `'2026-07-11'` | 戻り値全体を `toEqual` で比較 | `{ currentWeekIdentifier: '2026-07-04', selectedWeekIdentifier: '2026-07-11', previousWeekIdentifier: '2026-07-04', nextWeekIdentifier: '2026-07-18' }` と完全一致（プロパティの過不足なし。DTO の4フィールドすべてが `string`） | 正常 |
| MPWQ-04 | `raw === undefined` は現在週にフォールバック | `asOf` 固定 | `resolveMealPlanWeekQuery(undefined, asOf)` | `selectedWeekIdentifier === currentWeekIdentifier === '2026-07-04'` | 異常（入力欠落） |
| MPWQ-05 | 形式不正（スラッシュ区切り）は現在週にフォールバック | `asOf` 固定 | `resolveMealPlanWeekQuery('2026/07/04', asOf)` | `selectedWeekIdentifier === '2026-07-04'`（current と同じ） | 異常 |
| MPWQ-06 | 形式不正（ゼロ埋めなし）は現在週にフォールバック | `asOf` 固定 | `resolveMealPlanWeekQuery('2026-7-4', asOf)` | `selectedWeekIdentifier === '2026-07-04'` | 異常 |
| MPWQ-07 | 空文字は現在週にフォールバック | `asOf` 固定 | `resolveMealPlanWeekQuery('', asOf)` | `selectedWeekIdentifier === '2026-07-04'` | 異常 |
| MPWQ-08 | ゴミ文字列は現在週にフォールバック | `asOf` 固定 | `resolveMealPlanWeekQuery('garbage', asOf)` | `selectedWeekIdentifier === '2026-07-04'` | 異常 |
| MPWQ-09 | 非土曜スナップ（日曜） | `asOf` 固定・raw `'2026-07-05'`（日） | `resolveMealPlanWeekQuery('2026-07-05', asOf)` | `selectedWeekIdentifier === '2026-07-04'`（直前の土曜。current フォールバックではなくスナップ経由で同値になる） | 境界 |
| MPWQ-10 | 非土曜スナップ（金曜） | `asOf` 固定・raw `'2026-07-10'`（金） | `resolveMealPlanWeekQuery('2026-07-10', asOf)` | `selectedWeekIdentifier === '2026-07-04'` | 境界 |
| MPWQ-11 | 年またぎスナップ | `asOf` 固定・raw `'2027-01-01'` | `resolveMealPlanWeekQuery('2027-01-01', asOf)` | `selectedWeekIdentifier === '2026-12-26'`（前年12月の土曜。Domain の年またぎテストと同じ結果） | 境界 |
| MPWQ-12 | 正規表現の右端アンカー（`$`）— 末尾に余分な1文字があると不一致 | `asOf` 固定・raw `'2026-07-04x'` | `resolveMealPlanWeekQuery('2026-07-04x', asOf)` | `selectedWeekIdentifier === '2026-07-04'`（current フォールバック。誤って部分一致で採用されないこと） | 境界 |
| MPWQ-13 | 正規表現の左端アンカー（`^`）— 先頭に余分な1文字があると不一致 | `asOf` 固定・raw `'x2026-07-04'` | `resolveMealPlanWeekQuery('x2026-07-04', asOf)` | `selectedWeekIdentifier === '2026-07-04'`（current フォールバック） | 境界 |
| MPWQ-14 | 正規表現は通るが `Date` が Invalid Date（`getTime()` が `NaN`）になる入力 | `asOf` 固定・raw `'2026-99-99'`（`\d{4}-\d{2}-\d{2}` に一致するが月日が不成立で `new Date('2026-99-99T00:00:00')` が Invalid Date） | `resolveMealPlanWeekQuery('2026-99-99', asOf)` | `selectedWeekIdentifier === '2026-07-04'`（current フォールバック）。**実装前に Node で `Number.isNaN(new Date('2026-99-99T00:00:00').getTime())` が `true` であることを確認してから使う入力**（`2026-02-30` は overflow して Invalid Date にならないため、このケースには使わない。設計書の「`2026-02-30` は Invalid Date」という記述は V8 では誤り） | 境界（異常値） |
| MPWQ-15 | 正規表現は通り `Date` が overflow して有効になる日付（Invalid Date にならない） | `asOf` 固定・raw `'2026-02-30'` | (a) `resolveMealPlanWeekQuery('2026-02-30', asOf)` の `selectedWeekIdentifier`<br>(b) 同じテスト内で `WeekIdentifier.fromDate(new Date('2026-02-30T00:00:00')).toString()`（`@cookpit/domain` から直接呼ぶ）を期待値として計算 | (a) と (b) が一致する。**current フォールバック値（`'2026-07-04'`）に固定してはならない**（`2026-02-30` は 3/2（月）に overflow し、直前の土曜 `2/28` にスナップされるのが現行 `page.tsx` の実挙動であり、これを変えずに移すことが目的）。期待値をテストコード側でハードコードせず Domain の `fromDate` から導出することで、Application がスナップ計算を再実装していないことも同時に確認する | 境界（overflow・現行挙動の凍結で最重要） |
| MPWQ-16 | prev/next は selected の ±7日（土曜入力・スナップ不要ケース） | `asOf` 固定・raw `'2026-07-11'` | `resolveMealPlanWeekQuery('2026-07-11', asOf)` の `previousWeekIdentifier` / `nextWeekIdentifier` | `{ previousWeekIdentifier: '2026-07-04', nextWeekIdentifier: '2026-07-18' }` に `toEqual` で一致（selected 自身は `'2026-07-11'`） | 正常・境界（集合固定） |
| MPWQ-17 | prev/next は selected の ±7日（非土曜スナップ後を基準に算出） | `asOf` 固定・raw `'2026-07-13'`（月、`'2026-07-11'` へスナップ） | `resolveMealPlanWeekQuery('2026-07-13', asOf)` の `selected`/`previous`/`next` | `{ selectedWeekIdentifier: '2026-07-11', previousWeekIdentifier: '2026-07-04', nextWeekIdentifier: '2026-07-18' }` に `toEqual` で一致（±7日はスナップ**後**の土曜が基準であり、raw の生日付 `'2026-07-13'` からではない） | 境界 |
| MPWQ-18 | Application はスナップ計算を再実装していない（防御性の代替観点） | `asOf` 固定。MPWQ-09/10/11/15 のいずれかの raw | `resolveMealPlanWeekQuery(raw, asOf).selectedWeekIdentifier` と `WeekIdentifier.fromDate(new Date(\`${raw}T00:00:00\`)).toString()`（Domain を直接呼んだ結果）を同一テスト内で比較 | 両者が一致する。Application 側で土曜判定（`getDay()` 等）の計算式を独自実装していないことを、Domain の計算結果との一致で確認する（Domain 側の実装変更なし） | 防御性の代替（Domain VO 自体は変更対象外のため新規の防御的コピー等は不要） |
| MPWQ-19 | `asOf` 省略時（`new Date()` 相当）の `currentWeekIdentifier` | `vi.useFakeTimers()` + `vi.setSystemTime(new Date('2026-07-10T10:00:00'))` | `currentWeekIdentifier()`（第2引数省略） | `'2026-07-04'`。`afterEach` で `vi.useRealTimers()` | 正常（契約: `asOf` 省略 = `new Date()`） |
| MPWQ-20 | `asOf` 省略時、`resolveMealPlanWeekQuery` のフォールバック先と `currentWeekIdentifier()` が同じ週になる | 同上の fake timers | `resolveMealPlanWeekQuery(undefined)` と `currentWeekIdentifier()` を同一テスト内で呼ぶ | `resolveMealPlanWeekQuery(undefined).currentWeekIdentifier === resolveMealPlanWeekQuery(undefined).selectedWeekIdentifier === currentWeekIdentifier()`（すべて `'2026-07-04'`）。ページ側は `asOf` を渡さないため、この一致がページの実挙動（`WeekIdentifier.current()` 相当）と同じであることの根拠になる | 正常（契約確認。既知の限界: フェイクタイマーは時刻を固定するため、実装内部で `new Date()` を複数回呼んでいても本テストでは検出できない。設計書 R-1（`asOf` を1度だけ評価すべきという注意）はこのテストの守備範囲外であり、実装レビュー観点として残す） |

## 結合試験観点

対象外。本タスクの新規対象（純関数 2 つ）は Repository・DB・外部 I/O を持たないため、単体試験
のみで仕様を固定できる。`GetMealPlanByWeekUseCase` との結合（`selectedWeekIdentifier` を渡した
後の振る舞い）は既存の `meal-plan-use-cases.test.ts`（無改修）でロック済みであり、回帰試験範囲
として扱う。

## 特性観点

- 権限: 対象外。認証機構は MVP1 で未導入であり、本タスクはこれに影響しない（設計書「セキュリ
  ティ」節と同じ)。
- データ整合性: 対象外。DB 書き込み・永続化を伴わない（`?week=` の解釈のみ）。
- 冪等性: **対象外**。書き込み系 UseCase ではなく、同一入力に対し常に同一出力を返す純関数
  （副作用なし）のため、多重実行・再送を考慮する冪等性の概念自体が適用されない。
- 障害系（外部 I/O）: **対象外**。Infrastructure 経由の外部 API・ストレージ I/O を新設/経由
  しない（設計書「エラー処理」節と同じ）。
- フロントエンド固有: `page.tsx` / `history/page.tsx`（Server Component）への新規 RTL は
  **必須にしない**（設計書「テスト方針」5 のとおり。ロジックは Application のテストで固定済み）。
  代わりに以下を回帰試験範囲に含める。
  - `apps/web/tests/app/meal-plans/_components/meal-plan-client.test.tsx` の WC-M-14/15/16
    （href・POST の呼び出しアサーション）を無改修のまま実行し、`MealPlanClient` への props 形
    （4つの週識別子文字列）が変わっていないことを確認する。
- 防御性（Domain Entity/VO の場合）: **対象外（本タスクでは新設なし）**。`WeekIdentifier` は
  1行も変更しないため、防御的コピー・不変条件・タイムスタンプ副作用・不正引数伝搬の新規観点は
  不要。代替として MPWQ-18 で「Application がスナップ計算を再実装していないこと（Domain の
  計算結果と一致すること）」を確認する。

## メソッド網羅チェック表

対象: `packages/application/src/meal-plan/meal-plan-week-query.ts`（設計どおり実装後に新設。
現時点で実装コードは存在しないため、設計書「バックエンド設計」節のシグネチャに基づき列挙）。

| モジュール | public API | 対応する試験観点 No |
| --- | --- | --- |
| `meal-plan-week-query.ts` | `currentWeekIdentifier(asOf?: Date): string` | MPWQ-02, MPWQ-03（戻り値内の `currentWeekIdentifier` フィールドとの整合）, MPWQ-19, MPWQ-20 |
| `meal-plan-week-query.ts` | `resolveMealPlanWeekQuery(raw: string \| undefined, asOf?: Date): MealPlanWeekSelection` | MPWQ-01, MPWQ-03〜MPWQ-18, MPWQ-20 |
| `meal-plan.dto.ts` | `MealPlanWeekSelection`（型。4フィールドすべて `string`） | MPWQ-03（`toEqual` による形状固定） |

参考: 既存 public API（本タスクでは変更なし。回帰試験範囲でのみ確認）。

| モジュール | public API | 変更 | 確認手段 |
| --- | --- | --- | --- |
| `get-meal-plan-by-week.use-case.ts` | `GetMealPlanByWeekUseCase.execute(weekIdentifier: string)` | なし | `meal-plan-use-cases.test.ts`（無改修） |
| `get-current-meal-plan.use-case.ts` | `GetCurrentMealPlanUseCase.execute(asOf?: Date)` | なし | 既存テスト（無改修、本タスクの対象外） |
| `get-meal-plan-history.use-case.ts` | `GetMealPlanHistoryUseCase.execute({ limit })` | なし | `meal-plan-use-cases.test.ts`（無改修） |
| `packages/domain/src/shared/week-identifier.ts` | `WeekIdentifier.fromDate/current/fromString/startDate/endDate/next/previous/equals/toString` | なし（1行も変更しない） | `week-identifier.test.ts`（無改修） |

## 回帰試験範囲

以下は本タスクで**アサーション・観点を変更しない**。実装後（`page.tsx` / `history/page.tsx`
の import 切り替え後）に無改修のまま緑であることを確認する。

| ファイル | 確認内容 | 変更方針 |
| --- | --- | --- |
| `packages/domain/tests/shared/week-identifier.test.ts` | 土曜スナップの正典（`fromDate`/`current`/`next`/`previous`/`fromString`/防御的コピー等） | 無改修 |
| `packages/application/tests/meal-plan/meal-plan-use-cases.test.ts` | `GetMealPlanByWeekUseCase` の「非土曜スナップ」テスト（L369-375: raw `'2026-07-08'` → `'2026-07-04'`） | 無改修 |
| `apps/web/tests/app/meal-plans/_components/meal-plan-client.test.tsx` | WC-M-14（prev/next href）・WC-M-15（選択週での POST）・WC-M-16（prev/next 未指定時の後方互換） | 無改修 |
| `apps/web` の `history-week-card` 関連テスト | `history/page.tsx` は Domain import 削除のみ（`isCurrentWeek` の算出元を差し替えるだけ）で、`HistoryWeekCard` 自体・その props 契約は変更しないため対象外 | 触らない（変更提案もしない） |

実装後（`implementer` の作業後）に以下の順で全体を再実行し、影響がないことを確認する。

1. `packages/domain` の `week-identifier.test.ts`
2. `packages/application` の `meal-plan-week-query.test.ts`（新規）と `meal-plan-use-cases.test.ts`
3. `apps/web` の `meal-plan-client.test.tsx`
4. `packages/application` / `apps/web` の lint・type-check（`@cookpit/domain` import が
   `page.tsx` / `history/page.tsx` から消えたことを型検査・lint でも確認できる）

## 試験データ

- 固定基準日 `asOf = new Date('2026-07-10T10:00:00')`（金曜）。現在週は `'2026-07-04'`
  （土曜開始）。Domain の既存テスト（`week-identifier.test.ts` の「current は現在日時が金曜
  なら6日前の土曜を週開始日にする」）と同じ基準日・同じ期待値を用いることで、Application が
  Domain と矛盾する計算をしていないことを保証する。
- 土曜の有効入力: `'2026-07-11'`（スナップ不要の代表値）。
- 非土曜スナップの入力: `'2026-07-05'`（日）、`'2026-07-10'`（金）、`'2026-07-13'`（月）。
- 年またぎ入力: `'2027-01-01'`。
- 形式不正の入力: `'2026/07/04'`（区切り違い）、`'2026-7-4'`（ゼロ埋めなし）、`''`（空文字）、
  `'garbage'`（無関係文字列）、`'2026-07-04x'` / `'x2026-07-04'`（正規表現アンカー境界）。
- Invalid Date の入力: `'2026-99-99'`（**実装時に Node 等で
  `Number.isNaN(new Date('2026-99-99T00:00:00').getTime())` が `true` になることを確認して
  使う。確信が持てない場合はこの確認手順自体をテストコードのコメントに残す**）。
- overflow の入力（Invalid Date にならない）: `'2026-02-30'`（3/2（月）に overflow し、直前の
  土曜 `'2026-02-28'` にスナップされる。current フォールバックにしないこと）。
- `undefined`（`raw` 省略）。

## 完了条件

- MPWQ-01〜MPWQ-20 がすべて実装され、実装前（テスト先行）の段階では
  `packages/application/src/meal-plan/meal-plan-week-query.ts` が未実装のため red、実装後は
  すべて green であること。
- 上記「回帰試験範囲」の既存テスト（Domain 週識別子・`GetMealPlanByWeekUseCase`・
  `meal-plan-client.test.tsx` WC-M-14/15/16）に **diff がなく**、実装後も無改修で green のまま
  であること（設計書 R-4 の確認項目と同一）。
- メソッド網羅チェック表の全 public API（`currentWeekIdentifier` / `resolveMealPlanWeekQuery`）
  に対応する観点があること。
- MPWQ-15（overflow 日付）と MPWQ-14（Invalid Date）が異なる入力・異なる期待結果で区別されて
  実装されていること（設計書の「`2026-02-30` は Invalid Date」という記述をそのまま踏襲せず、
  実際の `Date` 挙動で検証されていること）。
- 新規テストファイルのパスが `packages/application` の vitest `include`
  （`tests/**/*.test.ts`、`packages/config/vitest/base.cjs`）に一致していること
  （`packages/application/tests/meal-plan/meal-plan-week-query.test.ts` は一致・確認済み）。
- `page.tsx` / `history/page.tsx` への新規 RTL テストを追加していないこと（追加してもよいが
  本計画では必須としない。追加する場合も本計画の観点と矛盾しないこと）。
