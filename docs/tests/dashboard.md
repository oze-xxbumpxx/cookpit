# 試験計画: dashboard

- 前提となる設計書: `docs/designs/dashboard.md`
  - 基本計画（P-1〜P-3）: confirmed・**実装済み**（実装記録 2026-07-21・実画面確認 PASS）。
  - **改訂（P-4〜P-7・「賞味期限が近い在庫」のカード表現化）: confirmed・本計画の主対象**。
- 要件定義書: なし（設計書がユーザー確定案を直接記述。手順8の要件書照合は対象外）。
- 先例: `docs/tests/pantry-screens.md`（Presentation 層・純関数 + RTL の粒度をこれに揃える）。
- レベル: L2（Presentation のみ・既存 `PantryDto` の再表現。新規 UseCase/API/Domain/Infra なし）。
- 実装ルート: メインセッション直接指揮 + implementer（IMP-2026-028 正規ルート）。
- 既存試験計画の有無: `docs/tests/` にダッシュボード関連の既存計画は無し（本ファイルが初版）。
  基本計画（P-1〜P-3）分は実装記録に「+ 単体テスト 6 件」「+ RTL 5 件」とあり**実装済み・green**のため、
  本計画では新規設計はせず「回帰試験範囲」で existing green を維持する対象として扱う。

---

## 試験種別

| 種別             | 対象                                           | ランナー / 手段                                                                   |
| ---------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| 単体（純関数）   | `_utils/dashboard-view.ts`（新規 3 関数）      | Vitest node 環境（`*.node.test.ts`。既存 `dashboard-view.node.test.ts` への追記） |
| 単体（純関数）   | `_utils/category-color.ts`（新規 1 関数）      | Vitest node 環境（既存 `category-color.node.test.ts` への追記）                   |
| コンポーネント   | `_components/dashboard.tsx`                    | Vitest + RTL（happy-dom。既存 `dashboard.test.tsx` の更新 + 追記）                |
| Server Component | `app/page.tsx`（`asOf={now}` の受け渡しのみ）  | RTL 対象外（async Server Component）。type-check + 実画面確認（MB 系）で担保      |
| 実画面           | 賞味期限セクションのカード表示・配色・アイコン | manual-browser-verify スキル（MB 系）                                             |

新規/追記テストのファイルパスは vitest `include`（`apps/web/vitest.node.config.mts` の
`src/**/*.node.test.ts`、`apps/web/vitest.dom.config.mts` の `src/**/*.test.tsx`）と整合させる:

- `apps/web/src/app/_utils/dashboard-view.node.test.ts`（既存ファイルへの追記。既存ケースと衝突しないよう
  新規ケースは `EU-xx` プレフィックスを用いる）
- `apps/web/src/app/_utils/category-color.node.test.ts`（既存ファイルへの追記。新規ケースは `EC-xx`）
- `apps/web/src/app/_components/dashboard.test.tsx`（既存ファイルへの追記・既存 5 件の呼び出し更新。
  新規ケースは `DC-xx`）

---

## 単体試験観点

### `dashboard-view.ts`: `getExpiryRemainingDays` / `getExpiryUrgency` / `formatExpiryUrgencyLabel`（prefix EU）

基準日は既存テストと揃え `asOf = new Date('2026-07-21T09:00:00')` を既定値とする（`selectExpiringStocks`
の既存テストと同一の日付規約・同一 asOf を使うことで、両関数の整合性を回帰的に確認できる）。

| #     | 観点                                                            | 前提                                                                                                        | 操作                                                                     | 期待結果                                                                                                                                     | 分類 |
| ----- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| EU-01 | 当日（0 日）                                                    | `asOf = 2026-07-21`                                                                                         | `getExpiryRemainingDays('2026-07-21', asOf)`                             | `0`                                                                                                                                          | 境界 |
| EU-02 | 翌日（1 日）                                                    | 同上                                                                                                        | `getExpiryRemainingDays('2026-07-22', asOf)`                             | `1`                                                                                                                                          | 正常 |
| EU-03 | 期限切れ（負値・1 日前）                                        | 同上                                                                                                        | `getExpiryRemainingDays('2026-07-20', asOf)`                             | `-1`                                                                                                                                         | 境界 |
| EU-04 | 期限切れ（負値・大幅超過）                                      | 同上                                                                                                        | `getExpiryRemainingDays('2026-07-01', asOf)`                             | `-20`                                                                                                                                        | 異常 |
| EU-05 | 月またぎ                                                        | `asOf = 2026-07-31`                                                                                         | `getExpiryRemainingDays('2026-08-01', asOf)`                             | `1`（`pantry-view.ts` PV-08 と同型の月またぎバグ検出）                                                                                       | 境界 |
| EU-06 | 年またぎ                                                        | `asOf = 2026-12-31`                                                                                         | `getExpiryRemainingDays('2027-01-01', asOf)`                             | `1`                                                                                                                                          | 境界 |
| EU-07 | `asOf` の時刻成分に依存しない（ローカル 0 時基準・防御）        | 同一の `expiresAt = 2026-07-22`                                                                             | `asOf` を `00:00:00` / `09:00:00` / `23:59:59` の 3 パターンで呼ぶ       | いずれも `1` を返す（`toLocalMidnight` 正規化が効いている）                                                                                  | 防御 |
| EU-08 | 不正な `expiresAt` 文字列（防御・不正引数の伝搬）               | `expiresAt = ''`（空文字。呼び出し元では発生しない想定だが関数単体としては受理し得る型）                    | `getExpiryRemainingDays('', asOf)`                                       | 例外を投げない（`Invalid Date` 由来で `NaN` を返す。`parseExpiryDate` が非検証である既存仕様を踏襲）                                         | 防御 |
| EU-09 | urgency 境界: `critical`→`soon` の切り替わり（P-4・**最重要**） | —                                                                                                           | `getExpiryUrgency(1)` と `getExpiryUrgency(2)`                           | `1` → `'critical'`、`2` → `'soon'`（1→2 で切り替わる）                                                                                       | 境界 |
| EU-10 | urgency 境界: `overdue`→`critical` の切り替わり（P-4）          | —                                                                                                           | `getExpiryUrgency(-1)` と `getExpiryUrgency(0)`                          | `-1` → `'overdue'`、`0` → `'critical'`                                                                                                       | 境界 |
| EU-11 | urgency 上限境界（3 日）                                        | —                                                                                                           | `getExpiryUrgency(3)`                                                    | `'soon'`                                                                                                                                     | 境界 |
| EU-12 | urgency 範囲外入力（防御・仕様範囲外だが例外を投げないこと）    | `selectExpiringStocks` の閾値（3 日以内）フィルタにより実運用では発生しないが、関数単体としての全域性を確認 | `getExpiryUrgency(4)` および `getExpiryUrgency(100)`                     | 例外を投げず `'soon'` を返す（3 段階のうち唯一の残余分岐に落ちる、3 分岐判定の実装として自然な挙動。**実装フェーズで意図と一致するか確認**） | 防御 |
| EU-13 | label: 期限切れ                                                 | —                                                                                                           | `formatExpiryUrgencyLabel(-1)`                                           | `'期限切れ'`                                                                                                                                 | 正常 |
| EU-14 | label: 本日まで                                                 | —                                                                                                           | `formatExpiryUrgencyLabel(0)`                                            | `'本日まで'`                                                                                                                                 | 境界 |
| EU-15 | label: 明日まで                                                 | —                                                                                                           | `formatExpiryUrgencyLabel(1)`                                            | `'明日まで'`                                                                                                                                 | 境界 |
| EU-16 | label: あと2日                                                  | —                                                                                                           | `formatExpiryUrgencyLabel(2)`                                            | `'あと2日'`                                                                                                                                  | 境界 |
| EU-17 | label: あと3日                                                  | —                                                                                                           | `formatExpiryUrgencyLabel(3)`                                            | `'あと3日'`                                                                                                                                  | 境界 |
| EU-18 | label と urgency の連動（結合的な境界確認・**重点**）           | EU-01〜06 の `remainingDays` セット                                                                         | 各値について `getExpiryUrgency` と `formatExpiryUrgencyLabel` を両方呼ぶ | P-4/P-6 の対応表どおり（-3→overdue/期限切れ、0→critical/本日まで、1→critical/明日まで、2→soon/あと2日、3→soon/あと3日）がすべて一致する      | 正常 |

### `category-color.ts`: `expiryUrgencyChipClass`（prefix EC）

| #     | 観点                                         | 前提 | 操作                                                                                                          | 期待結果                                                                       | 分類 |
| ----- | -------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---- |
| EC-01 | `overdue`（赤）                              | —    | `expiryUrgencyChipClass('overdue')`                                                                           | `bg-destructive/10` と `text-destructive` を含む                               | 正常 |
| EC-02 | `critical`（オレンジ）                       | —    | `expiryUrgencyChipClass('critical')`                                                                          | `bg-accent` と `text-accent-foreground` を含む                                 | 正常 |
| EC-03 | `soon`（黄）                                 | —    | `expiryUrgencyChipClass('soon')`                                                                              | `CHIP.amber` と一致（`bg-[#F4E8D2] text-[#785A1E]`）                           | 正常 |
| EC-04 | `rose` との混同がないこと（D-6の意図・回帰） | —    | `expiryUrgencyChipClass('critical')` の値が `productCategoryChipClass('肉')`（`CHIP.rose`）と異なることを確認 | 一致しない（`critical` に `rose` を誤用していない）                            | 境界 |
| EC-05 | 未知値のフォールバック                       | —    | `expiryUrgencyChipClass('unknown')`                                                                           | `CHIP.neutral`（`bg-secondary text-secondary-foreground`）にフォールバックする | 異常 |

---

## コンポーネント試験観点（`dashboard.tsx`。prefix DC）

既存 5 件（今週の献立なし CTA / status バッジ・レシピ件数 / 賞味期限空メッセージ /
賞味期限リスト表示 / クイックリンク）は **`asOf` prop 追加に伴い呼び出し側の更新が必須**
（`asOf` は必須 prop・デフォルト値なしのため、既存の `<Dashboard mealPlan={...} expiringStocks={...} />`
は型エラーになる。全 5 箇所に `asOf={new Date('2026-07-21T09:00:00')}` 等を追加する）。
以下は新規追加ケース。

| #     | 観点                                                                                   | 前提                                                                                                                                                                                                                           | 操作   | 期待結果                                                                                                                                                                                                                                                                                                                                                             | 分類 |
| ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| DC-01 | 期限切れ在庫が赤バッジ + 「期限切れ」文言で表示される（P-4/P-6・最重要）               | `asOf = 2026-07-21`、`stocks = [{ expiresAt: '2026-07-19' }]`                                                                                                                                                                  | render | バッジに「期限切れ」が表示され、バッジ要素の class に `bg-destructive/10`（または `text-destructive`）を含む                                                                                                                                                                                                                                                         | 正常 |
| DC-02 | 当日〜1 日がオレンジバッジで表示される（`critical`）                                   | `stocks` に `expiresAt` が当日 / 翌日 の 2 件                                                                                                                                                                                  | render | それぞれ「本日まで」「明日まで」が表示され、バッジ class に `bg-accent`（または `text-accent-foreground`）を含む                                                                                                                                                                                                                                                     | 正常 |
| DC-03 | 2〜3 日が黄バッジで表示される（`soon`）                                                | `stocks` に `expiresAt` が 2 日後 / 3 日後 の 2 件                                                                                                                                                                             | render | それぞれ「あと2日」「あと3日」が表示され、バッジ class に amber 系（`bg-[#F4E8D2]`）を含む                                                                                                                                                                                                                                                                           | 正常 |
| DC-04 | urgency 境界（1→2）がバッジ色にも反映される（EU-09 のコンポーネント版・**重点**）      | `stocks` に `expiresAt` が 1 日後 / 2 日後 の 2 件                                                                                                                                                                             | render | 1 日後カードは `critical` 配色（accent系）、2 日後カードは `soon` 配色（amber系）と、色が切り替わっている                                                                                                                                                                                                                                                            | 境界 |
| DC-05 | 保存場所ごとに異なるアイコンが表示される（P-5）                                        | `stocks` に `storedLocation` が `fridge`/`freezer`/`pantry`/`null` の 4 件                                                                                                                                                     | render | 4 件それぞれで異なるアイコン（`Refrigerator`/`Snowflake`/`Package`/`CircleHelp`）が描画される。判別手段は `container.querySelector('.lucide-<name>')`（実装確定）。ただし `CircleHelp` は lucide-react v1.14.0 内部で `circle-question-mark` の別名のため、実際のクラス名は `lucide-circle-question-mark`（`lucide-circle-help` ではない。R-2 関連の実装時発見事項） | 正常 |
| DC-06 | 既存テキスト表示の非回帰（displayName / 保存場所ラベル / `M/Dまで`）                   | `stock = { displayName: '鶏むね肉', expiresAt: '2026-07-22', storedLocation: 'freezer' }`                                                                                                                                      | render | 既存 5 件目のテスト同様「鶏むね肉」「冷凍」「7/22まで」がすべて表示される（カード化後も既存テキストが失われない）                                                                                                                                                                                                                                                    | 正常 |
| DC-07 | 見出しの件数バッジ表示（P-7）                                                          | `expiringStocks` が 3 件                                                                                                                                                                                                       | render | 見出し付近に件数「3」を含むバッジと `Clock` アイコンが表示される                                                                                                                                                                                                                                                                                                     | 正常 |
| DC-08 | 見出しの件数バッジ・0 件時の挙動（P-7・境界・実装確認済み）                            | `expiringStocks = []`                                                                                                                                                                                                          | render | 空メッセージ（「まもなく期限を迎える在庫はありません。」）は従来どおり表示される。件数バッジは 0 件時**非表示**（実装確定・R-3 の解釈を採用。0 件時は空メッセージ表示と重複するため）                                                                                                                                                                                | 境界 |
| DC-09 | `expiresAt: null` 混入時の防御的挙動（防御・prop 型上は許容されるため）                | `expiringStocks` に `expiresAt: null` の stock を 1 件含める（`page.tsx` は `selectExpiringStocks` で事前に除外するため実運用では発生しないが、`Dashboard` の prop 型 `StockDto[]` は `expiresAt: string \| null` を許容する） | render | 例外を投げずに render が完了する（クラッシュしない）。既存コードが `formatExpiresAt(stock.expiresAt ?? '')` と同様に `null` を安全策で吸収していることを、`getExpiryRemainingDays` 呼び出し箇所でも確認する                                                                                                                                                          | 防御 |
| DC-10 | 複数在庫が残日数の昇順で表示される（既存 `selectExpiringStocks` の並び順を維持・回帰） | `expiringStocks` に異なる `expiresAt` を持つ 3 件（既に昇順ソート済みの配列を渡す。ソート自体は `selectExpiringStocks` の責務）                                                                                                | render | カードが渡された配列順（昇順）どおりに描画される（`Dashboard` 自身が再ソートしていない）                                                                                                                                                                                                                                                                             | 境界 |
| DC-11 | 「今週の献立」チップとの視覚的一貫性（D-6・回帰）                                      | `mealPlan` あり + 期限バッジありの両方を同時 render                                                                                                                                                                            | render | 賞味期限バッジのクラスに `rounded-full` と `text-xs` と `font-medium`（`mealPlanStatusChipClass` のチップと同型のベースクラス）が含まれる                                                                                                                                                                                                                            | 境界 |

---

## 特性観点

- **権限**: 対象外（MVP1 は認証なし。既存画面と同前提）。
- **データ整合性**: 対象外に近い（新規の書き込み・集計ロジックは追加しない。`expiringStocks` は
  引き続き `page.tsx` の `selectExpiringStocks(stocks, now, EXPIRY_WITHIN_DAYS)` の結果をそのまま
  表示するのみで、`Dashboard`/`dashboard-view.ts`/`category-color.ts` はいずれも既存データの
  **再表現**に徹する。P-7 の件数バッジも既存配列の `length` を表示するのみで新規集計は行わない
  （設計書「追加の対象外」）。
- **冪等性**: 対象外（読み取り専用の表示コンポーネント。副作用のある操作なし）。
- **障害系**: 対象外（新規の外部 I/O なし。`page.tsx` の DB 障害時挙動は既存 Server Component の
  パターンを踏襲し、本改訂固有の新規観点はない）。
- **フロントエンド固有（必須。Presentation 層のため）**: ローディング/楽観的更新は対象外
  （読み取り専用・書き込み系操作を持たないため該当コードパスが存在しない）。エラー表示も対象外
  （表示コンポーネント自体はエラー状態を持たない）。該当する FE 固有観点は「見た目の分岐が
  データに応じて正しく切り替わること」（DC-01〜04・EU-09/10 の色・文言境界）に限定される。
- **防御性**: Domain 層の Entity/VO 変更は無いため、防御的コピー・`updatedAt` 等のタイムスタンプ
  副作用検証は対象外。一方で本改訂固有の防御的観点として以下を含める（pantry-screens 先例の
  Presentation 層防御性観点と同型）:
  - (a) 不正引数の伝搬: `getExpiryRemainingDays` に空文字列等の非検証入力を渡しても例外を
    投げないこと（EU-08）。
  - (b) 全域性: `getExpiryUrgency` / `formatExpiryUrgencyLabel` が P-4/P-6 で明示された範囲
    （0〜3 日、負値）の外側（4 日以上）を渡されても例外を投げず、3 分岐のいずれかに収束すること
    （EU-12。実運用では `selectExpiringStocks` の 3 日以内フィルタにより発生しない防御的観点）。
  - (c) `Dashboard` の prop 型 `StockDto[]` が許容する `expiresAt: null` を実際に渡しても
    render がクラッシュしないこと（DC-09。既存 `formatExpiresAt(stock.expiresAt ?? '')` と
    同水準の防御）。
  - (d) 色トークンの意味衝突がないこと（EC-04。D-6 が明示的に回避した `rose` との混同を回帰確認）。

---

## メソッド網羅チェック表

| 対象                | public API                                                           | 対応する試験観点 No                                                  |
| ------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `dashboard-view.ts` | `selectExpiringStocks`（既存）                                       | 実装済み（`dashboard-view.node.test.ts` 既存分。回帰試験範囲で担保） |
| `dashboard-view.ts` | `MEAL_PLAN_STATUS_LABELS`（既存）                                    | 実装済み（同上）                                                     |
| `dashboard-view.ts` | `ExpiryUrgency`（型。値は関数の戻り値で間接的に担保）                | EU-09〜18                                                            |
| `dashboard-view.ts` | `getExpiryRemainingDays`（新規）                                     | EU-01〜08                                                            |
| `dashboard-view.ts` | `getExpiryUrgency`（新規）                                           | EU-09〜12、EU-18                                                     |
| `dashboard-view.ts` | `formatExpiryUrgencyLabel`（新規）                                   | EU-13〜18                                                            |
| `category-color.ts` | `recipeTagChipClass`（既存・変更なし）                               | 実装済み（`category-color.node.test.ts` 既存分。回帰対象）           |
| `category-color.ts` | `productCategoryChipClass`（既存・変更なし）                         | 実装済み（同上）                                                     |
| `category-color.ts` | `mealPlanStatusChipClass`（既存・変更なし）                          | 実装済み（同上）                                                     |
| `category-color.ts` | `expiryUrgencyChipClass`（新規）                                     | EC-01〜05                                                            |
| `dashboard.tsx`     | `Dashboard`（`mealPlan` / `expiringStocks` 既存 + `asOf` 新規 prop） | 既存 5 件（更新要）+ DC-01〜11                                       |
| `page.tsx`          | default（Server Component。`asOf={now}` 追加のみ）                   | 型上の結線確認は type-check、表示確認は MB-01（実画面）で担保        |

---

## 実画面確認（MB 系。manual-browser-verify で PASS / BLOCKED / FAIL を報告）

| #     | 確認内容                                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MB-01 | `/`（ダッシュボード）: 賞味期限が近い在庫がカード表示になり、期限切れ/当日〜1日/2〜3日で赤/オレンジ/黄に色分けされる（実データで最低各 1 件確認できると理想。無ければ PGlite シードで境界データを用意） |
| MB-02 | 保存場所（冷蔵/冷凍/常温/未設定）ごとに異なるアイコンが表示される                                                                                                                                       |
| MB-03 | 見出しに件数バッジと `Clock` アイコンが表示される（P-7）                                                                                                                                                |
| MB-04 | 「温かいキッチン」トークン適用（`zinc-*`/`bg-white` 等の直書き混入なし）・モバイル幅（max-w-md）で崩れがない                                                                                            |
| MB-05 | 既存導線（賞味期限セクション見出しの「在庫を見る」→ `/pantry`、クイックリンク 5 件）が回帰なく動作する                                                                                                  |
| MB-06 | 「今週の献立」セクションのチップと賞味期限バッジの見た目トーン（角丸・余白・フォントサイズ）が揃っている（D-6）                                                                                         |

---

## 回帰試験範囲

- `dashboard-view.node.test.ts` 既存 6 件（`selectExpiringStocks` の並び順・境界・null 除外、
  `MEAL_PLAN_STATUS_LABELS` の網羅）が green のまま（新規関数追加による回帰がないこと）。
- `category-color.node.test.ts` 既存分（`recipeTagChipClass` / `productCategoryChipClass` /
  `mealPlanStatusChipClass`）が green のまま（`expiryUrgencyChipClass` 追加による回帰がないこと）。
- `dashboard.test.tsx` 既存 5 件が **`asOf` prop 追加後も意図（CTA 表示・status バッジ・レシピ件数・
  空メッセージ・displayName/保存場所/期限テキスト・クイックリンク href）を保ったまま green** で
  あること（呼び出し箇所の更新は必須だが、期待値自体は変えない）。
- `page.tsx` の `<Dashboard ... asOf={now} />` 追加が、`selectExpiringStocks` への `now` の
  渡し方（既存ロジック）を変更していないこと（コード上の差分確認。P-1 の `EXPIRY_WITHIN_DAYS` 挙動は
  不変）。
- 実画面確認: 基本計画（P-1〜P-3）で PASS 済みの 22 項目（今週の献立カード・クイックリンク・
  empty 状態）が本改訂後も崩れていないこと（MB-05 に統合）。

## 試験データ

- `StockDto` フィクスチャ: 既存 `dashboard-view.node.test.ts` / `dashboard.test.tsx` の
  `createStock(overrides)` を流用・拡張する。
- 境界データセット（EU/DC 共通の基準日 `asOf = 2026-07-21`）:
  - 期限切れ: `expiresAt: '2026-07-19'`（-2 日）/ `'2026-07-20'`（-1 日）
  - 当日〜1 日（`critical`）: `expiresAt: '2026-07-21'`（0 日）/ `'2026-07-22'`（1 日）
  - 2〜3 日（`soon`）: `expiresAt: '2026-07-23'`（2 日）/ `'2026-07-24'`（3 日）
  - 月またぎ: `asOf: 2026-07-31` / `expiresAt: '2026-08-01'`
  - 年またぎ: `asOf: 2026-12-31` / `expiresAt: '2027-01-01'`
  - 不正値（防御）: `expiresAt: ''`
  - 保存場所 4 パターン: `storedLocation` に `'fridge'` / `'freezer'` / `'pantry'` / `null` を
    1 件ずつ。

## 完了条件

**必須（リリースブロッカー）**

- EU-01〜18・EC-01〜05・DC-01〜11 全件が Vitest で green。**特に EU-09/10（P-4 の閾値境界）・
  EU-13〜17（P-6 Option B の 5 パターン文言）・DC-01〜04（バッジ色と文言の結線）は最重要観点として
  個別に green を確認する。**
- 既存 6 件（`dashboard-view.node.test.ts`）・既存分（`category-color.node.test.ts`）・既存 5 件
  （`dashboard.test.tsx`、`asOf` 追加後）が green のまま（回帰試験範囲）。
- `pnpm lint` / `pnpm type-check` / `pnpm test`（web パッケージ）全 green。
- MB-01〜06 が manual-browser-verify で全 PASS（**本改訂の実装フェーズでは未実施**。
  静的テスト・品質ゲートまで完了。実施要否は Orchestrator が判断する）。
- ~~DC-08（件数バッジの 0 件時挙動）は実装後の挙動を implementer が確定し...~~ →
  実装確定: 0 件時は件数バッジ非表示（R-3 の解釈を採用）。上記 DC-08 行を更新済み。

**推奨（任意）**

- ~~DC-05（保存場所アイコンの判別手段...）~~ → 実装確定: `container.querySelector('.lucide-<name>')`
  によるクラス名判別を採用（`data-testid` は不要と判断）。上記 DC-05 行を更新済み。

## 実施結果（2026-07-21・改訂分実装）

- EU-01〜18・EC-01〜05・DC-01〜11 を含む Vitest 全件 green（web パッケージ 371 テスト PASS、
  内訳: `dashboard-view.node.test.ts` 24 件 / `category-color.node.test.ts` 11 件 /
  `dashboard.test.tsx` 16 件）。
- `pnpm lint` 0 error（既存の無関係 warning 1 件のみ）/ `pnpm type-check` 5/5 package PASS。
- MB-01〜06（実画面確認）は本タスクのスコープでは未実施。
