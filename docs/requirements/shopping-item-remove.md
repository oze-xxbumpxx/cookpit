# 要件定義: shopping-item-remove

- task-id / 変更レベル: shopping-item-remove / **L3**（新規 API エンドポイントの追加）
- 作成日: 2026-07-25

## 背景

買い物リストには品目の追加（`POST /:id/items`）・チェック・購入記録・店舗再割当があるが、
**一度追加した品目を取り除く手段が UI にもサーバーにも存在しない**。手動追加で品名や数量を
打ち間違えた場合、その品目はリストに残り続ける。

`ShoppingItem.markAsSkipped()` は Domain に存在するが UseCase / API / UI いずれからも
露出しておらず、実質使えない。また `markAsSkipped()` は `pending` からしか呼べないため
購入済み品目には適用できない。

## 目的

誤って追加した品目をユーザーが自分で取り除けるようにする。

## ユーザー要求（原文の要約）

> 買い物リストに誤って追加した際の削除を追加

対象は**すべての品目**（手動追加・献立由来とも）とすることをユーザーが確定済み。

## 機能要件

- F-1: 買い物リスト詳細画面から、品目を 1 件ずつ削除できる。
- F-2: 削除対象は `source` を問わない（`manually_added` / `from_meal_plan` とも）。
- F-3: 削除対象は `status` を問わない（`pending` / `bought` / `skipped` とも）。購入済み品目を
  削除した場合、その品目の購入実績（`actualPrice` / `actualStore`）も一緒に失われる。
- F-4: 削除前に確認ダイアログを表示する。
- F-5: 献立由来（`from_meal_plan`）の品目を削除しようとしたときは、後から「献立の変更を反映」
  を実行すると再び追加されることを確認ダイアログで伝える。
- F-6: 完了済み（`completed`）の買い物リストでは削除できない（既存の `assertActive` 方針に従う）。
- F-7: 削除は永続化される（リロード後も消えたまま）。

## 非機能要件（性能・セキュリティ・可用性など）

- 性能: 品目数は 1 リストあたり数十件規模。追加のクエリ最適化は**対象外**。
- セキュリティ: MVP1 は認証なし（ADR-0003）。認可の観点は**対象外**。
- 可用性: 対象外。

## 正常系

- N-01: `active` なリストの `pending` 品目を削除すると、リストから消える。
- N-02: `bought` 品目を削除できる（購入実績ごと消える）。
- N-03: `from_meal_plan` 品目を削除できる。
- N-04: 削除は DB に反映され、再取得しても消えている。
- N-05: 削除ボタン押下 → 確認ダイアログ → 「削除」で行が即座に消える（楽観的更新）。
- N-06: 確認ダイアログで「キャンセル」を選ぶと削除されず API も呼ばれない。
- N-07: 献立由来の品目の確認ダイアログには、同期で復活する旨の説明が出る。
- N-08: 品目を全件削除すると空状態の表示になる。

## 異常系

- E-01: 存在しない `shoppingListId` → 404。
- E-02: 存在しない `itemId` → 404。
- E-03: `completed` のリストに対する削除 → 422。UI では回復導線（「買い物を再開」）を案内する。
- E-04: 通信エラー → 行が元に戻り、エラーバナーを表示する。
- E-05: サーバーエラー（500） → 行が元に戻り、エラーバナーを表示する。

## 境界条件（null・空・上限/下限・権限境界）

- B-01: 品目 1 件のリストから削除 → 品目 0 件になる（リスト自体は残る）。
- B-02: 不正な UUID 形式の `id` / `itemId` → 400（zValidator）。
- B-03: `completed` のリスト × 存在しない `itemId` → **422 が優先**（既存 UseCase の
  「存在 → 状態」ではなく `loadActiveShoppingList` がリスト状態を先に見る順序に従う）。
- B-04: 削除対象の行が金額入力フォームを展開中だった場合、展開状態がクリアされる。
- B-05: 既に削除済みの品目に対する再削除（404）→ **成功として扱う**（削除は冪等。2 人利用で
  相手が先に消した場合に無用なエラーを出さない）。

## 前提

- `DrizzleShoppingListRepository.save()` は集約に残る item id を集めて `notInArray` で
  他行を DELETE する。**集約から取り除くだけで永続化まで追随し、マイグレーションは不要**。
- `shopping_items` テーブルの `shopping_list_id` は `onDelete: 'cascade'`。
- エラー変換は `apps/web/src/server/app.ts` の既存 `onError` が担う
  （`NotFoundError` → 404、`InvalidOperationError` → 422）。**新規エラークラスは不要**。
- `ShoppingItemDto` には既に `source` が含まれる（F-5 の出し分けに使える）。

## 制約

- Domain は他パッケージに依存しない。UseCase は 1 クラス 1 `execute()`、手動 DI。
- 楽観的更新は共通フック（`useApiAction`）へ寄せない（2026-07-25 の教訓）。
- DB スキーマは変更しない。

## 対象範囲

- `packages/domain/src/shopping-list/shopping-list.ts`（`removeItem` 追加）
- `packages/application/src/shopping-list/`（`RemoveItemUseCase` 新規・DTO・barrel）
- `apps/web/src/server/routes/shopping-lists.ts`（`DELETE` 追加）
- `apps/web/src/app/shopping-lists/_components/`（行の削除ボタン・確認ダイアログ・削除ハンドラ）

## 対象外

- `markAsSkipped()` の API / UI 露出（本件では扱わない。Domain には残す）
- 削除の取り消し（undo）・ゴミ箱・削除履歴
- 献立からレシピを外したときの**自動**削除追随（ADR-0007 の将来課題のまま）
- `packages/api-contract`（既存 `shoppingItemIdParamSchema` を再利用。ボディなし）
- `packages/infrastructure`（既存 `save()` が削除に追随済み）
- DB マイグレーション

## 後方互換性・データ移行

**対象外。** DB スキーマ・既存 API のリクエスト/レスポンス形いずれも変更しない。
追加するのは新規エンドポイント 1 本のみ。

## 受け入れ条件（Definition of Done に対応）

- `pnpm lint` / `pnpm type-check` / `pnpm test` が通る。
- 上記 N-01〜N-08 / E-01〜E-05 / B-01〜B-05 に対応する試験が実装され通る。
- 既存の買い物リスト関連テストが**無修正で**通る（`$delete` のモック追加を除く）。
- L3 成果物（要件・設計・実装計画・試験計画・ADR・レビュー記録）が揃っている。
- 実画面確認（PGlite dev + Playwright）で削除・復活・完了済みの挙動を確認済み。

## 未決事項（誰に何を確認するか）

- なし。物理削除の採用・削除対象の範囲（全品目）はユーザー確認済み。
