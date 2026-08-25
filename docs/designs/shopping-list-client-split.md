# 設計書: shopping-list-client-split

- ステータス: **confirmed**
- レベル: L2（Presentation の god-file 分割。挙動・API・Domain 変更なし）
- 関連: PR #184（Sync / refetch で `items` と `coveredIngredients` を同時置換）、
  `docs/designs/shopping-list-pantry-coverage.md`、
  `apps/web/src/app/shopping-lists/_utils/use-checked-sync-queue.ts`

## 背景

`shopping-list-client.tsx`（約 26KB）が状態・楽観的更新・Sync・完了/再開・オフラインキュー配線を
一手に握っており、次の買い物リスト変更のたびに神ファイルを触るリスクが高い。

## 目的

挙動を変えずに hooks へ責務分割し、`ShoppingListClient` を composition + layout に薄くする。

## 要件

- 楽観的更新の順序・キュー優先マージ vs サーバー refetch・covered-only Saturday の EmptyState 判定・
  pantry coverage スナップショット・完了/再開・オフラインキュー挙動を**一切変えない**。
- Zustand / TanStack Query を導入しない。Clean Architecture 層・Hono mount・手動 DI・集約は触らない。
- Sync / silent refetch は `items` と `coveredIngredients` を**同じ onSuccess で一緒に置換**する（PR #184）。

## 対象範囲

- `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx` の分割
- 新規 hooks（`_utils/`、既存 `use-checked-sync-queue` と同階層）
- 既存 `shopping-list-client.*.test.tsx` の緑維持

## 対象外

- `createShoppingItemDto` フィクスチャ統一
- unused `cheapest-store` API 削除、backend Sync/Complete 分割、auth、Zustand、P-2 device/secret、CI job splits
- `useCheckedSyncQueue` / IndexedDB キュー実装そのものの移動・書き換え（呼び出し配線は items hook 側に残す）

## 現状構成

`ShoppingListClient` 単一ファイルが次を所有する。

- items / coveredIngredients / useOptimistic
- check / bought / remove / add / reassign
- Sync + focus/online refetch（キュー flush 先行）
- complete / reopen
- `useCheckedSyncQueue` の配線

## 変更後構成

| モジュール                      | 責務                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `use-shopping-list-items.ts`    | items / coveredIngredients / 楽観的更新 / 品目操作 / Sync・refetch / キュー配線 |
| `use-shopping-list-complete.ts` | status / 買い物完了・再開パネル状態                                             |
| `use-checked-sync-queue.ts`     | 既存のまま（変更しない）                                                        |
| `shopping-list-client.tsx`      | hooks の composition + レイアウト / バナー / EmptyState                         |

## データフロー

変更なし。クライアント → 既存 Hono RPC → Application UseCase の経路は据え置き。

## API 設計

対象外（契約変更なし）。

## DB 設計

対象外。

## フロントエンド設計

### 継ぎ目（confirmed）

1. **品目 + Sync**: `items` と `coveredIngredients` は Sync / refetch で同時更新するため同一 hook に置く。
   キュー優先マージ（`pendingItemIdsRef`）もここに残す。
2. **完了 / 再開**: `status` と完了バナー・パネルは品目操作から独立しているため別 hook。
   `boughtItems` は items hook 側の確定 `items` から導き、complete hook に渡す。
3. **キュー**: `useCheckedSyncQueue` は移動せず、items hook から従来どおり呼び出す。

### 不変条件（回帰で守る）

- optimistic: `submittingItemId` は `startTransition` の外で先に立てる
- refetch: flush → silent GET。キュー中 itemId はローカル値優先
- Sync success: `setItems(dto.items)` と `setCoveredIngredients(dto.coveredIngredients)` を同ブロック
- EmptyState: `optimisticItems.length === 0 && !hasCovered`（covered-only は Empty にしない）

## バックエンド設計

対象外。

## エラー処理

対象外（既存メッセージ・422/オフライン経路を移すだけ。新規 I/O なし）。

## ログと監視

対象外。

## セキュリティ

対象外。

## 性能

対象外（レンダー構造は同一）。

## テスト方針

既存 `shopping-list-client.*.test.tsx`（checked / complete / offline-queue / remove / sync / view）を
第一の回帰ゲートとする。アサーションの書き換えは禁止。継ぎ目が未カバーなら最小限の追加のみ
（本タスクでは既存で足りると判断）。

## 移行とリリース

通常マージ。フィーチャーフラグなし。

## リスク

- フック境界で stale closure（特に focus の flush/refetch）を壊す → 既存の ref パターンをそのまま移す
- Sync で covered 更新漏れ → 同一 onSuccess に同居させる設計で防止

## 未決事項

なし（分割方針は本タスク指示で confirmed）。
