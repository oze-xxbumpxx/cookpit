# 設計書: expiry-alert-ops

- ステータス: confirmed（P-1〜P-3 ユーザー確定）
- レベル: L2
- 関連:
  - `docs/designs/expiry-alert.md`（本番機能の本体。本ユニットはその運用硬化）
  - `docs/decisions/ADR-0017-web-push-expiry-alert.md`（iOS はホーム画面追加済み PWA 必須）

## 背景

賞味期限アラート（Web Push + Cron）は稼働済み。通知タップは `/pantry` 一覧へ開き、
iOS でブラウザタブから購読しようとすると Push が届かないことがある。本ユニットは
**既存機能の本番硬化**であり、新機能ではない。

## 目的

- 通知タップで対象在庫へ到達できるようにする（行動喚起の摩擦を下げる）。
- iOS 非 PWA では「ホーム画面追加が必要」と明示する（ボタンは無効化しない）。

## 要件

| #   | 論点                       | 確定                                                        |
| --- | -------------------------- | ----------------------------------------------------------- |
| P-1 | 通知タップの遷移先         | 先頭在庫への deep link（推奨）。一覧のみは採らない          |
| P-2 | 本番 secrets（VAPID/Cron） | マージ後の ops 確認。UI に秘密情報ハンドリングを新設しない  |
| P-3 | deep link の粒度           | 先頭在庫 1 件のみ。複数在庫の multi-id deep link は作らない |

画面側の受け入れ:

1. `/pantry?stock=<id>` で一致行をスクロール＋視覚強調する。
2. 未知・消費済み id は no-op（EmptyState にしない。編集ダイアログを自動で開かない）。
3. iOS かつ非 standalone で購読 UI に muted 案内を出す。Android/desktop は案内なし。
4. `Notification.requestPermission()` はユーザージェスチャ起点のまま。

## 対象範囲

- Presentation（`apps/web`）のみ:
  - `/pantry` の `searchParams.stock` 受け渡し
  - `PantryClient` / `LocationGroup` / `StockRow` のハイライト・スクロール
  - `ExpiryAlertSubscription` の iOS 非 PWA 案内
  - 上記の Vitest DOM テスト

## 対象外

- Cron / `CRON_SECRET` / VAPID / digest クエリ / push payload 生成（backend が
  `url` を `/pantry?stock=<first stock id>` に変更する）
- Auth・送信履歴・「やっぱり買う」・在庫引き算
- `sw.ts` の書き換え（`notificationclick` は既に `/` 始まりの相対 URL を `openWindow` する）

## 現状構成

- `apps/web/src/app/sw.ts`: `url.startsWith('/')` のみ許可。`/pantry?stock=<uuid>` は安全。
- `expiry-alert-subscription.tsx`: クリック内で同期的に `requestPermission()`（iOS 要件）。
- `pantry/page.tsx`: Server Component。`searchParams` 未使用。`PantryClient` に渡すのみ。
- `StockRow`: `id` / ハイライトなし。`rounded-xl border border-border` カード。

## 変更後構成

### `/pantry` deep link

- `page.tsx` は Next.js App Router の `searchParams: Promise<{ stock?: string }>` を
  `await` し（既存: `meal-plans/page.tsx` と同型）、`highlightStockId` を
  `PantryClient` へ渡す。
- 一致する `stock.id` があるときだけ:
  - 行に `id={stock-${id}}`（UUID の数字始まり回避）
  - `border-primary ring-2 ring-primary/30` で強調（既存カードに乗る）
  - `scrollIntoView({ behavior: 'smooth', block: 'center' })`
- 不一致・空クエリは無視。在庫 0 件の EmptyState 条件は変えない。

### iOS 案内

- `matchMedia('(display-mode: standalone)')` または `navigator.standalone === true` で
  インストール済み PWA とみなす（ADR-0017 / 設計書罠 3 と整合）。
- iOS UA（`iPhone|iPad|iPod`、および iPadOS の MacIntel + touch）かつ非 standalone のとき
  muted 1 行を出す。ボタンは無効化しない。
- ハイドレーション不一致回避のため `useSyncExternalStore`（サーバー snapshot は false）。

## データフロー

1. Cron（backend）が digest を送り、`data.url = /pantry?stock=<firstId>`。
2. `notificationclick` → `openWindow(url)`（既存・変更なし）。
3. `/pantry` が `stock` を読み、一致行をスクロール＋強調。

## API 設計

変更なし（画面のみ。backend の payload `url` 変更は本 PR 外）。

## DB 設計

対象外。

## フロントエンド設計

§変更後構成を参照。

## バックエンド設計

対象外（別スライス）。

## エラー処理

対象外（外部 I/O 新設なし）。未知 `stock` は黙って無視する。

## ログと監視

変更なし。

## セキュリティ

- `sw.ts` の `/` プレフィックスチェックは緩めない。外部 URL は開かない。
- UI に secrets を持ち込まない（P-2）。

## 性能

`scrollIntoView` は一致時 1 回。リスト件数は世帯規模のため問題にならない。

## テスト方針

- `PantryClient`: 一致ハイライト / 未知 id で EmptyState なし。
- `StockRow`: `highlighted` の class。
- `ExpiryAlertSubscription`: iOS 非 standalone で案内あり / standalone・非 iOS でなし。

## 移行とリリース

フロントのみ。backend の `url` 変更と同時または先行デプロイ可（クエリ無しでも従来どおり一覧表示）。

## リスク

| #   | リスク                           | 対策                                           |
| --- | -------------------------------- | ---------------------------------------------- |
| R-1 | 未知 id で EmptyState になる     | 在庫 0 件条件は触らない。テストで固定          |
| R-2 | iOS 案内でハイドレーション不一致 | `useSyncExternalStore` + server snapshot false |
| R-3 | 権限要求がジェスチャ外に出る     | 既存のクリック内 `requestPermission` を維持    |

## 未決事項

なし（P-1〜P-3 確定済み）。
