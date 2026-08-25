# 設計書: 簡易ダッシュボード（今週の状態）

- ステータス: **confirmed**（P-1〜P-3 は「最善フローで進行」の委任のもと既定案を採用・実装済み。追認で調整可）
- 変更レベル: L2（Presentation 中心・既存 UseCase を集約する読み取り専用画面）
- 実装ルート: メインセッション直接指揮 + implementer（IMP-2026-028 正規ルート）
- 出典: `docs/05-roadmap.md` Sprint 6 タスク 4 / `docs/03-architecture.md`（`app/(app)/page.tsx` = ダッシュボード）

## 目的

土曜運用の起点となる「今週の状態」を 1 画面で俯瞰できるようにする。現状 `/`（ホーム）は
`/recipes` へリダイレクトするだけで、献立 → 買い物 → 在庫の全体像を見る入口が無い。

## スコープ

- **対象**: `apps/web/src/app/page.tsx` をダッシュボードへ置き換え（Server Component・初期表示＝方法 A）。
- **集約する既存 UseCase**（新規 UseCase / API / Domain / Infra 変更なし）:
  - `GetCurrentMealPlanUseCase`（今週の献立・状態）
  - `GetPantryUseCase`（在庫 → 賞味期限が近いもの）
- **画面構成**:
  1. **今週の状態サマリ**: 今週の `MealPlan` の `status`（draft/shopping/cooking/consuming/completed）+
     献立レシピ件数 + 次アクション導線。今週分が無ければ「今週の献立を作る」CTA（→ `/meal-plans`）。
  2. **賞味期限が近い在庫**: `PantryDto.stocks` のうち `expiresAt !== null` かつ閾値以内を昇順表示。
     MVP1 は**リスト表示のみ**（roadmap 準拠）。表示は displayName / 賞味期限 / 保存場所。→ `/pantry`。
     （2026-07-21 改訂: 表現をカード + 色分けバッジへリッチ化。詳細は下記「改訂」セクション参照）
  3. **クイックリンク**: （2026-08-25 改訂でホームから削除。週次オペレーションは下部ナビ、
     レシピ・商品は `/more`。詳細は [dashboard-home-ia.md](dashboard-home-ia.md)）

## 対象外

- 買い物リストの詳細集計（未購入件数・店舗別金額）。状態は MealPlan の `status` で代替する（簡易版）。
- 賞味期限アラート / プッシュ通知 / バッジ（Phase 2）。（2026-07-21 改訂: 残日数に応じた**色分けバッジ表示**は
  対象内に変更。プッシュ通知・リマインダー通知は引き続き対象外。詳細は下記「改訂」セクション参照）
- 新規 UseCase・API・Domain・Infrastructure の追加。

## ユーザー確定が必要な設計判断（採用値・追認で調整可）

- **P-1 賞味期限「近い」の閾値**: **3 日以内**を採用（`expiresAt` が今日〜+3 日、および期限切れも含める）。
  変更点は `apps/web/src/app/page.tsx` の `EXPIRY_WITHIN_DAYS` のみ。
- **P-2 ホーム `/` のダッシュボード化**: **採用**。従来の `/recipes` リダイレクトを廃止し `/` を土曜運用の起点にした。
- **P-3 状態サマリの粒度**: **採用**。MealPlan status + レシピ件数 + `/meal-plans` 導線まで（買い物リストの詳細集計は対象外）。

（P-4〜P-7 は 2026-07-21 改訂で追加。下記「改訂」セクション参照）

## 実装記録（2026-07-21）

- `apps/web/src/app/page.tsx`: リダイレクト → ダッシュボード Server Component（`GetCurrentMealPlan` +
  `GetPantry` を並列取得・`selectExpiringStocks` で賞味期限抽出）。
- `apps/web/src/app/_utils/dashboard-view.ts`: `selectExpiringStocks` + `MEAL_PLAN_STATUS_LABELS`（+ 単体テスト 6 件）。
- `apps/web/src/app/_components/dashboard.tsx`: 表示コンポーネント（既存 `pantry-view` / `meal-plan-view` を再利用・+ RTL 5 件）。
- 品質ゲート: type-check 5/5 / lint 0 error / web 324 テスト PASS。

## 実画面確認（manual-browser-verify・2026-07-21）

`dev:pglite` + Playwright（Chromium 同梱）でリモート live 確認。**FAIL 0**。

- **populated 状態（22 項目 → 17 チェック）全 PASS**: 今週の献立カード（週レンジ `7/18（土）〜7/24（金）`・
  状態バッジ `買い物中`・`レシピ 1 品`・カード href `/meal-plans`）/ 賞味期限リスト（期限切れ 07-20 →
  期限内 07-22 の昇順・閾値外 07-31 と期限 null を除外・`M/Dまで` 表記・保存場所ラベル）/
  クイックリンク 5 件と href・実遷移（在庫 → `/pantry`）。
- **empty 状態（5 項目）全 PASS**: 献立なしメッセージ + 作成 CTA（href `/meal-plans`）/ 在庫空メッセージ /
  クイックリンク 5 件。
- レイアウト・トークン（温かいキッチン）崩れなし（スクリーンショット確認）。BLOCKED 項目なし
  （PGlite 経路で DB 込み live 確認が成立。PWA/Service Worker はダッシュボードのスコープ外）。

## 設計判断（先例準拠・D-x）

- **D-1**: Server Component から repository ファクトリ（`@/server/repositories`）経由で UseCase を直接呼ぶ
  （`pantry/page.tsx` と同型・`export const dynamic = 'force-dynamic'`）。
- **D-2**: 賞味期限フィルタは純関数 `selectExpiringStocks(stocks, asOf, withinDays)` に切り出し
  co-located 単体テスト（境界: 期限切れ / 当日 / 閾値ちょうど / 閾値超過 / `expiresAt` null）。
- **D-3**: セマンティックトークン（温かいキッチン）を使用。`zinc-*` / `bg-white` 直書きは禁止。
- **D-4**: 「値なし」は `null`。状態バッジの文言・色は既存 meal-plan 画面の status 表示と一貫させる。

（D-5〜D-6 は 2026-07-21 改訂で追加。下記「改訂」セクション参照）

## テスト方針

- `selectExpiringStocks` の単体テスト（D-2 の境界値）。
- ダッシュボード表示コンポーネントの RTL テスト（今週なし = CTA 表示 / status バッジ / 賞味期限リスト空状態）。
- 品質ゲート: `pnpm lint` / `pnpm type-check` / `pnpm test`（web + application 該当分）。

（テスト方針の追加分は下記「改訂」セクション参照）

---

## 改訂: 2026-07-21 — 「賞味期限が近い在庫」のカード表現化（リッチ化）

- ステータス: **confirmed**（P-4〜P-7 すべてデフォルト採用案でユーザー確定・2026-07-21）
- 変更レベル: L2（Presentation のみ・既存 `PantryDto` の再表現。新規 UseCase/API/Domain/Infra なし）
- 実装ルート: メインセッション直接指揮 + implementer（IMP-2026-028 正規ルート、元設計を踏襲）

### 背景

ユーザーから「在庫を見る部分が文章すぎる。もっと料理のダッシュボードっぽさを出したい」との要望。
対象は `apps/web/src/app/_components/dashboard.tsx` の「賞味期限が近い在庫」セクションのみ。
現行は `<ul><li>` の文章リスト（displayName / 保存場所ラベル / `M/Dまで` の期限テキスト）で、
視覚的な強弱（色・アイコン）が無い。

元設計の「対象外: 賞味期限アラート / バッジ（Phase 2）」は、新規 UseCase・API 追加を伴う
「通知・アラート機能」を指していた。今回はその境界を保ったまま、**既存 `PantryDto.stocks` の
データ（displayName / expiresAt / storedLocation）のみを使った表現の強化**に限定する。

### 追加スコープ

「賞味期限が近い在庫」セクションを、文章リストからアイコン付きカード + 残日数の色分けバッジへ
変更する。

1. **保存場所アイコン**: `LOCATION_LABELS`（冷蔵・冷凍・常温・未設定）ごとにアイコンを表示。
2. **残日数バッジ**: 期限切れ / 当日〜1 日 / 2〜3 日の 3 段階を色分けバッジで表現。
3. **視覚的一貫性**: 「今週の献立」セクションのチップ（`rounded-full px-2 py-0.5 text-xs font-medium`、
   `mealPlanStatusChipClass` と同型）に揃え、カードの角丸・余白も既存トーンを踏襲。
4. **見出しの軽い強化（任意・P-7）**: セクション見出しに件数バッジ・アイコンを追加し、
   「今週の献立」セクションと視覚的な釣り合いを取る。

### 追加の対象外

- 保存場所別・残日数段階別の**集計表示**（例: 「冷蔵 3 件・冷凍 1 件」のような新規カウント表示）。
  既存データの単純な `length` 表示（件数バッジ、P-7）を除き、新しい集計ロジックは対象外。
- プッシュ通知・リマインダー通知・ブラウザ通知権限の要求。
- 賞味期限以外の切り口（消費期限との区別、カテゴリ別など）の追加。
- 秒・時間単位の精密なカウントダウン表示。残日数は日単位まで。
- 在庫カードのクリック遷移（詳細画面への導線）。詳細画面が現状無いため、セクション見出しの
  「在庫を見る」リンク（`/pantry`）のみ据え置き。
- 新規 CSS カスタムプロパティ（トークン）の追加。後述の通り既存トークンで表現可能と判断。
- 新規画面・新規ルートの追加。

### 既存トークンでの色分け可否（検討結果）

`globals.css` の「温かいキッチン」トークンを確認した結果、**新規トークン追加は不要**と判断する。

| 用途                   | 採用トークン                        | 実値（Light）                 | 備考                                                                                                                                         |
| ---------------------- | ----------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 期限切れ（赤）         | `destructive`                       | `#C0392B`                     | 既存の危険色。他用途との意味衝突なし。                                                                                                       |
| 当日〜1 日（オレンジ） | `accent` / `accent-foreground`      | `#FBEDE6` / `#B8431F`         | 温かいテラコッタ系。現状バッジ用途で未使用のため新規予約可。                                                                                 |
| 2〜3 日（黄）          | `category-color.ts` の `CHIP.amber` | `bg-[#F4E8D2] text-[#785A1E]` | 商品カテゴリ「調味料」等と色を共有するが、同一画面内で用途が重複しないため実害なし（既存 `CHIP` パレットも複数ドメインで色を共有する設計）。 |

`CHIP.rose`（肉・主菜カテゴリ）との混同を避けるため、当日〜1 日には `rose` ではなく `accent` を
採用する（`rose` は他画面で「カテゴリ: 肉」の意味を既に持つため）。

### ユーザー確定が必要な設計判断（P-4〜P-7）

- **P-4 残日数の色分け閾値・配色**（デフォルト採用案）:
  - 期限切れ（残日数 < 0）: 赤 = `destructive`
  - 当日〜1 日（残日数 0〜1）: オレンジ = `accent`
  - 2〜3 日（残日数 2〜3）: 黄 = `CHIP.amber`
  - ユーザー要望の閾値（赤/オレンジ/黄の 3 区分）をそのまま採用。P-1 の閾値（3 日以内）と
    整合しており、「2〜3 日」区分が実質上限になる。

- **P-5 保存場所アイコンの割当**（デフォルト採用案。lucide-react、追加依存なし）:
  - 冷蔵（fridge）: `Refrigerator`
  - 冷凍（freezer）: `Snowflake`
  - 常温（pantry）: `Package`
  - 未設定: `CircleHelp`（アイコンを省略せず、全カードでアイコン枠の見た目を揃える）

- **P-6 残日数バッジの文言粒度**（**確定: Option B**）:
  - **Option A（簡易・3 パターン固定）**: 「期限切れ」「まもなく」「近日」
  - **Option B（推奨・残日数に応じた精密表示、5 パターン）**: 「期限切れ」「本日まで」「明日まで」
    「あと2日」「あと3日」
  - 推奨理由: 色分け（3 段階）と文言（精密表示）を分離することで、色の意味は単純に保ちつつ
    情報量を上げられる。「料理ダッシュボードっぽさ」の主眼である情報の具体性に寄与する。
  - 色分け（P-4）とは独立した判断のため、Option A/B のどちらでも P-4 の配色ロジックは変更不要。

- **P-7 見出しの追加装飾**（**確定: 採用する**）:
  - 「賞味期限が近い在庫」見出しに件数バッジ（`expiringStocks.length`）とアイコン（`Clock`）を追加するか。
  - 採用した場合も新規集計ロジックは不要（既存配列の `length` のみ）。
  - 不採用の場合、見出しは現状のテキストのみを維持する。

### 追加の設計判断（先例準拠・D-5〜D-6）

- **D-5**: 残日数の算出・段階判定・文言生成は `apps/web/src/app/_utils/dashboard-view.ts` に
  純関数として追加する（D-2 と同型・co-located 単体テストを追加）。

  ```ts
  // dashboard-view.ts に追加（イメージ。最終シグネチャは実装フェーズで確定）
  export type ExpiryUrgency = 'overdue' | 'critical' | 'soon';

  // asOf からの残日数（負値は期限切れ日数）。selectExpiringStocks と同一のローカル日付規約
  // （parseExpiryDate / toLocalMidnight を再利用、追加エクスポート不要）。
  export function getExpiryRemainingDays(expiresAt: string, asOf: Date): number {
    /* ... */
  }

  export function getExpiryUrgency(remainingDays: number): ExpiryUrgency {
    /* P-4 の閾値 */
  }

  export function formatExpiryUrgencyLabel(remainingDays: number): string {
    /* P-6 の文言 */
  }
  ```

  `asOf` は既存の `selectExpiringStocks` 呼び出しと同じ `now`（`page.tsx`）を使う。Dashboard
  コンポーネントへは新規 prop `asOf: Date` として**追加**する（既存 prop `mealPlan` /
  `expiringStocks` は変更しない・破壊的変更なし）。Dashboard は Server Component
  （`'use client'` 無し）のため `Date` を prop として渡すことに問題はない。

- **D-6**: 色クラスは `category-color.ts` の既存方針（「色はここだけに置き、画面側へ散らさない」）
  に従い、`expiryUrgencyChipClass()` を追加する。既存の `mealPlanStatusChipClass` 等と同型
  （未知の値は `CHIP.neutral` にフォールバック）。

  ```ts
  // category-color.ts に追加（イメージ）
  const EXPIRY_URGENCY_CHIP: Record<string, string> = {
    overdue: 'bg-destructive/10 text-destructive',
    critical: 'bg-accent text-accent-foreground',
    soon: CHIP.amber,
  };

  export function expiryUrgencyChipClass(urgency: string): string {
    return EXPIRY_URGENCY_CHIP[urgency] ?? CHIP.neutral;
  }
  ```

  保存場所アイコン（P-5）は他画面での再利用要件が無いため、`pantry-view.ts` は変更せず
  `dashboard.tsx` 内にローカルな `LOCATION_ICONS` マップとして追加する（`QUICK_LINKS` と同型の
  コロケーション）。

### 実装への影響（ファイル別・変更イメージ）

- `apps/web/src/app/_utils/dashboard-view.ts`: `ExpiryUrgency` 型 + `getExpiryRemainingDays` /
  `getExpiryUrgency` / `formatExpiryUrgencyLabel` を追加（D-5）。
- `apps/web/src/app/_utils/category-color.ts`: `expiryUrgencyChipClass` を追加（D-6）。
- `apps/web/src/app/_components/dashboard.tsx`:
  - 新規 prop `asOf: Date` を追加。
  - 「賞味期限が近い在庫」の `<li>` をカード化: 左に保存場所アイコン（円形バッジ）、中央に
    displayName + 保存場所ラベル（既存テキストを維持）、右に残日数バッジ（新規） + 既存の
    `formatExpiresAt` テキスト（`M/Dまで`、既存表記を維持）。
  - （P-7 採用時）見出しに件数バッジ + `Clock` アイコンを追加。
  - 追加インポート: `Snowflake` / `Package` / `CircleHelp`（+ P-7 採用時 `Clock`）を
    `lucide-react` から、`expiryUrgencyChipClass` を `category-color.ts` から。
- `apps/web/src/app/page.tsx`: `<Dashboard ... asOf={now} />` を追加（既存 `now` をそのまま渡す。
  ロジック変更なし）。

既存の `formatExpiresAt` / `LOCATION_LABELS` / `UNSET_LOCATION_LABEL`（`pantry-view.ts`）は
そのまま再利用し、変更しない。

### テスト方針（追加分）

- `getExpiryRemainingDays` / `getExpiryUrgency` / `formatExpiryUrgencyLabel` の単体テスト
  （`dashboard-view.node.test.ts` に追加）: 期限切れ（負値）/ 当日（0）/ 1 日 / 2 日 / 3 日の
  各境界値、および P-4 の閾値境界（1→2 で `critical`→`soon` に切り替わる点）。
- `expiryUrgencyChipClass` の単体テスト（`category-color.ts` に既存テストファイルがあれば追加、
  無ければ新規に軽量なテストを追加）: 既知の 3 値 + 未知値のフォールバック。
- `dashboard.test.tsx`（RTL）: 既存の「賞味期限が近い在庫を名称・保存場所・期限つきで一覧表示する」
  テストは `asOf` prop 追加に伴い呼び出し側の更新が必要（破壊的変更ではなく prop 追加のみ）。
  追加ケース: 期限切れ在庫が赤バッジで表示される / 当日〜1 日がオレンジバッジ / 2〜3 日が黄バッジ /
  保存場所ごとに異なるアイコンが表示される（`aria-hidden` のため `role` ではなくクラス名や
  親要素の存在で検証、または `data-testid` の要否を実装フェーズで判断）。
- 品質ゲート: `pnpm lint` / `pnpm type-check` / `pnpm test`（web パッケージ）。

### 実装記録（2026-07-21・改訂分）

- `apps/web/src/app/_utils/dashboard-view.ts`: `ExpiryUrgency` 型 + `getExpiryRemainingDays` /
  `getExpiryUrgency` / `formatExpiryUrgencyLabel` を追加（D-5）。既存 `selectExpiringStocks` /
  `MEAL_PLAN_STATUS_LABELS` は変更なし。
- `apps/web/src/app/_utils/category-color.ts`: `expiryUrgencyChipClass` を追加（D-6）。
- `apps/web/src/app/_components/dashboard.tsx`: 新規 prop `asOf: Date` 追加、「賞味期限が近い
  在庫」をカード化（保存場所アイコン + 残日数バッジ）、見出しに `Clock` アイコン + 件数バッジ
  （P-7、0 件時は非表示・R-3 の解釈を採用）。
- `apps/web/src/app/page.tsx`: `<Dashboard ... asOf={now} />` を追加。
- テスト: `dashboard-view.node.test.ts`（EU-01〜18 追加・計 24 件）/
  `category-color.node.test.ts`（EC-01〜05 追加・計 11 件）/ `dashboard.test.tsx`（既存 5 件へ
  `asOf` 追加 + DC-01〜11 追加・計 16 件）。
- 品質ゲート: `pnpm lint` 0 error（既存の無関係な warning 1 件のみ）/ `pnpm type-check` 5/5
  package PASS / `pnpm test` 全パッケージ PASS（web 371 テスト green）。
- 実装時の補足（R-2 関連）: 保存場所未設定アイコン `CircleHelp`（lucide-react v1.14.0）は内部で
  `circle-question-mark` へのエイリアスのため、描画される `<svg>` のクラス名は
  `lucide-circle-question-mark`（`lucide-circle-help` ではない）。テスト（DC-05）はこの実際の
  クラス名で検証した。
- 実画面確認（MB-01〜06）: 本改訂では未実施（着手範囲は静的テスト＋品質ゲートまで。実施が
  必要な場合は Orchestrator 経由で manual-browser-verify を別途手配）。

---

**2026-08-25 改訂**: ホームを司令塔化（次の一手ヒーロー + 週次ステッパー）し、NavBar を
4 一次タブ + その他に整理する IA 変更は、本ファイルではなく
[docs/designs/dashboard-home-ia.md](dashboard-home-ia.md) に設計する（重複設計を避けるため）。
本ファイルの内容（賞味期限セクションの表現・色分け仕様等）はそのまま有効。
