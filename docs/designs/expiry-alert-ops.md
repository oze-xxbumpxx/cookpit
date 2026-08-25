# 設計書: expiry-alert-ops

- ステータス: confirmed（P-1〜P-3 ユーザー確定）
- レベル: L2
- 関連:
  - `docs/designs/expiry-alert.md`（本体設計。本ドキュメントはその運用磨き込み差分）
  - `docs/decisions/ADR-0017-web-push-expiry-alert.md`
  - `docs/tests/expiry-alert.md`（既存試験計画。本差分の追加観点は §テスト方針）

## 背景

Sprint 8 Unit B（expiry-alert）で Web Push + 日次 Cron は実装済み。残課題は「通知タップが
`/pantry` 一覧止まり」「iOS はホーム画面 PWA 必須であることの UI 明示」「本番の
`CRON_SECRET` / VAPID 3 変数が揃っていることの運用確認」である。新規の通知基盤は作らない。

## 目的

- 通知タップで、ダイジェスト先頭（最も期限が近い）在庫行へ直接たどり着けるようにする。
- 日次ダイジェストの本文・送信回数・除外条件は変えない。
- iOS 利用者に PWA（ホーム画面追加）前提を一文で伝える。
- 本番シークレット未設定を fail-closed のまま維持し、人間がマージ後に確認できるチェックリストを残す。

## 要件

| ID  | 内容                                                                                                                                        | 確定 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| P-1 | 通知タップは一致する在庫行へ（一覧だけではない）。該当なしは無視（EmptyState にしない）                                                     | 済   |
| P-2 | 本番 `CRON_SECRET` + VAPID（public / private / subject）の検証を完了条件とする。未設定は fail-closed。シークレットは invent / commit しない | 済   |
| P-3 | deep-link は先頭の期限近い在庫 1 件のみ。本文は「先頭 3 件 + 他 n 件」のまま。件ごとの deep-link はしない                                   | 済   |

## 対象範囲

- Application: `SendExpiryAlertsUseCase` の payload `url` を `/pantry?stock=<firstId>` に変更。
- Presentation: `PantryPage` / `PantryClient` / `StockRow` / `LocationGroup` の query 強調 + スクロール。
- Presentation: `ExpiryAlertSubscription` に iOS PWA 一文。
- Docs: 本設計書（本番運用チェックリスト含む）。
- Tests: UseCase / Pantry / Subscribe /（既存）Cron の回帰。

## 対象外

- 認証導入、送信履歴テーブル、他通知種別、在庫消費・廃棄フロー変更、新規集約。
- Cron 時刻変更（`vercel.json` の `0 23 * * *` を維持）。
- 「やっぱり買う」、件ごとの deep-link。
- Service Worker の書き換え（`url` が `/` 始まりなら既存 `openWindow` で足りる）。
- Vercel 環境変数の設定作業そのもの（エージェントからは不可。§本番運用チェックリスト参照）。

## 現状構成

- `buildDigestPayload` の `url` は固定 `/pantry`（P-7）。
- `sw.ts` は `url.startsWith('/')` のとき `clients.openWindow(url)`。クエリ付き相対パスも通る。
- Cron: `GET /api/cron/expiry-alerts`。`CRON_SECRET` 欠落/空 → 500、Bearer 不一致 → 401、
  VAPID 不完全 → 500。購読 0 / 期限在庫 0（数量 0 除外後）は送らない。
- 数量 0 は通知経路のみ除外（P-10b）。`GetExpiringStocksUseCase` は変えない。

## 変更後構成

```
SendExpiryAlertsUseCase
  └─ buildDigestPayload
       body: 先頭3 + 他n件（変更なし）
       url:  /pantry?stock=<stocks[0].id>   ← 変更（P-1 / P-3）

PantryPage(?stock=)
  └─ PantryClient(highlightStockId)
       ├─ 一致行あり → scrollIntoView + ring 強調（チェックボックス無し）
       └─ 一致なし → no-op（EmptyState にしない）

ExpiryAlertSubscription
  └─ iOS PWA 一文を常時表示（権限要求は従来どおりユーザー操作起点）
```

## データフロー

変更なし（Cron → UseCase → PushSender → SW push → notificationclick → openWindow）。
遷移先 URL のクエリだけが増える。

## API 設計

変更なし。Cron / push subscribe・unsubscribe / vapid-public-key の契約は維持。

## DB 設計

対象外（スキーマ変更なし。送信履歴テーブルも作らない）。

## フロントエンド設計

1. `page.tsx` が `searchParams.stock` を `highlightStockId` として渡す（meal-plans と同型）。
2. `StockRow` に `data-stock-id` と `highlighted`（`ring-2 ring-primary/40`）。選択 UI は付けない。
3. 購読 UI に
   「iOS ではホーム画面に追加したアプリからのみ通知が使えます（Safari のタブでは動作しません）。」

## バックエンド設計

- payload `url` のみ変更。`encodeURIComponent(stockId)` を使う。
- Cron ガード・fail-closed・送信スキップ条件は現状維持（確認のみ）。

## エラー処理

外部 I/O の新規追加なし。既存 expiry-alert の (a)〜(e) を継承。

- VAPID / `CRON_SECRET` 未設定: fail-closed（500 + ログ）。送信は行わない。
- 購読 0 / 期限在庫 0: 200 でカウント 0、送信なし。

## ログと監視

既存 `console.log('expiry-alerts cron result', result)` /
`console.error('CRON_SECRET is not configured')` /
`console.error('VAPID environment variables are not configured')` を維持。

## セキュリティ

- シークレットをリポジトリ・設計書・ログに書かない。
- クエリ `stock` は UUID 想定。存在しない ID は強調しない（情報漏洩にならない）。

## 性能

変更なし（日次 1 ダイジェスト / 購読全件配信のまま）。

## テスト方針

| 観点                                        | 置き場                                       |
| ------------------------------------------- | -------------------------------------------- |
| payload url が `/pantry?stock=<firstId>`    | `send-expiry-alerts.use-case.test.ts` SEA-10 |
| 本文は先頭 3 + 他 n / 件ごと deep-link なし | 同上                                         |
| 数量 0 除外・購読 0 / 期限 0 で送らない     | SEA-01 / 02 / 07（既存）                     |
| Pantry 強調 + scroll / 欠落 ID は no-op     | `pantry-client.test.tsx` PC-DEEPLINK-*       |
| Cron 401 / VAPID 500 fail-closed            | `cron.test.ts`（既存）                       |
| iOS PWA 一文                                | `expiry-alert-subscription.test.tsx` EAS-14  |
| 「やっぱり買う」が出ないこと                | 差分に当該文言を入れない（回帰不要）         |

## 移行とリリース

コードマージ後、人間が §本番運用チェックリストを実行する。エージェントは Vercel env を設定できない。

## リスク

- 先頭在庫が消費・廃棄済みだと強調されない（意図どおり no-op）。一覧は見えるので許容。
- iOS 一文を読まず Safari タブで購読しようとして失敗する利用者は残りうる（既存の技術制約）。

## 未決事項

なし（P-1〜P-3 確定済み）。

## 本番運用チェックリスト（マージ後・人間作業）

本番シークレットが「設定済みである」とは本ドキュメントでは主張しない。以下をマージ後に確認する。

1. **Cron 発火**
   - Vercel Project → Cron Jobs で `/api/cron/expiry-alerts` が `0 23 * * *` になっている。
   - 実行ログに `expiry-alerts cron result` が出る（またはダッシュボードの Cron 成功）。
2. **`CRON_SECRET`**
   - Production に設定されている（値はここへ書かない。生成例: `openssl rand -base64 32`）。
   - 手動確認: ヘッダー無し / 誤 Bearer → **401**。未設定時のデプロイでは **500**（fail-closed）。
3. **VAPID 3 変数**
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`（`mailto:` または HTTPS URL）が
     Production に揃っている。
   - いずれか欠落 → Cron は認証後に **500**（送信しない）。
   - `GET /api/push/vapid-public-key` が Production で **200**。
4. **fail-closed の再確認**
   - 秘密欠落時に Push が飛ばないこと（ログに misconfigured、`sentCount` が出ない）。
5. **失敗ログ**
   - Vercel Logs で `CRON_SECRET is not configured` /
     `VAPID environment variables are not configured` /
     UseCase 例外時の 500 を追えること。

Preview に本番と同じ鍵を置かない（expiry-alert セキュリティレビュー M-3 の方針を維持）。
