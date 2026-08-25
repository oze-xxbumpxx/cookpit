# 試験計画: expiry-alert-ops（フロントエンド）

- レベル: L2
- 設計書: `docs/designs/expiry-alert-ops.md`

## 観点一覧

| ID         | 層 / コンポーネント     | 観点                                | 期待                                                                                           |
| ---------- | ----------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| PC-DEEP-01 | PantryClient            | `highlightStockId` が一致           | 行に `border-primary` / ring。EmptyState なし。編集ダイアログ非表示。`scrollIntoView` 呼び出し |
| PC-DEEP-02 | PantryClient            | 未知の `highlightStockId`           | 一覧維持・強調なし・EmptyState なし・スクロールなし                                            |
| SR-DEEP-01 | StockRow                | `highlighted`                       | `border-primary` と `ring-2`                                                                   |
| EAS-14     | ExpiryAlertSubscription | iOS UA + 非 standalone              | ホーム画面案内あり。ON ボタンは disabled にしない                                              |
| EAS-15     | ExpiryAlertSubscription | iOS UA + `display-mode: standalone` | 案内なし                                                                                       |
| EAS-16     | ExpiryAlertSubscription | Android UA                          | 案内なし                                                                                       |

## 回帰（既存のまま）

- EAS-04: `requestPermission` はクリックのコールスタック内で同期呼び出し
- `sw.ts` の `/` 始まりチェックは本ユニットで変更しない（手動/既存 SW テスト）

## 対象外

- Cron / VAPID / payload 生成の結合試験（backend slice）
- 新通知タイプの追加試験
