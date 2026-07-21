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
  3. **クイックリンク**: レシピ / 商品 / 献立 / 買い物リスト / 在庫（土曜フローの入口）。

## 対象外

- 買い物リストの詳細集計（未購入件数・店舗別金額）。状態は MealPlan の `status` で代替する（簡易版）。
- 賞味期限アラート / プッシュ通知 / バッジ（Phase 2）。
- 新規 UseCase・API・Domain・Infrastructure の追加。

## ユーザー確定が必要な設計判断（採用値・追認で調整可）

- **P-1 賞味期限「近い」の閾値**: **3 日以内**を採用（`expiresAt` が今日〜+3 日、および期限切れも含める）。
  変更点は `apps/web/src/app/page.tsx` の `EXPIRY_WITHIN_DAYS` のみ。
- **P-2 ホーム `/` のダッシュボード化**: **採用**。従来の `/recipes` リダイレクトを廃止し `/` を土曜運用の起点にした。
- **P-3 状態サマリの粒度**: **採用**。MealPlan status + レシピ件数 + `/meal-plans` 導線まで（買い物リストの詳細集計は対象外）。

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

## テスト方針

- `selectExpiringStocks` の単体テスト（D-2 の境界値）。
- ダッシュボード表示コンポーネントの RTL テスト（今週なし = CTA 表示 / status バッジ / 賞味期限リスト空状態）。
- 品質ゲート: `pnpm lint` / `pnpm type-check` / `pnpm test`（web + application 該当分）。
