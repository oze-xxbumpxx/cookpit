# 実装計画: shopping-list-client-split

- 前提となる設計書: docs/designs/shopping-list-client-split.md
- レベル: L2
- 実装ルート: Orchestrator（implementer）
- 判断理由: 既定（Presentation 分割・挙動不変）

## 変更対象ファイル

| path                                                                   | 理由                            |
| ---------------------------------------------------------------------- | ------------------------------- |
| `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx` | composition + layout に薄くする |
| `docs/designs/shopping-list-client-split.md`                           | 分割方針の記録                  |
| `docs/implementation-plans/shopping-list-client-split.md`              | 本計画                          |
| `docs/tests/shopping-list-client-split.md`                             | 回帰方針                        |

## 新規作成ファイル

| path                                                                   | 役割                                     |
| ---------------------------------------------------------------------- | ---------------------------------------- |
| `apps/web/src/app/shopping-lists/_utils/use-shopping-list-items.ts`    | 品目状態・操作・Sync/refetch・キュー配線 |
| `apps/web/src/app/shopping-lists/_utils/use-shopping-list-complete.ts` | 完了 / 再開                              |

## ステップ

### 1. `useShoppingListItems` 抽出

- 対象: 上記新規 + client からの移動
- 内容: items / coveredIngredients / optimistic / item handlers / Sync / refetch / focus·online·mount / `useCheckedSyncQueue` 配線をそのまま移す
- 完了条件: クライアントが当該 hook 経由でのみ品目状態を読む。ロジック差分なし

### 2. `useShoppingListComplete` 抽出

- 対象: 上記新規
- 内容: status / complete panel / reopen を移す。`boughtItems` は items hook から受け取る
- 完了条件: 完了・再開フローが hook 経由で動く

### 3. `ShoppingListClient` を薄くする

- 対象: `shopping-list-client.tsx`
- 内容: 2 hooks を合成し JSX のみ残す。UI 文言・構造は維持
- 完了条件: ファイルサイズ縮小、export 名 `ShoppingListClient` 維持

### 4. 回帰確認

- 対象: 既存 shopping-list client テスト + lint / type-check
- 内容: アサーション書き換え禁止。必要なら最小限の追加のみ
- 完了条件: 既存テスト緑、lint / type-check PASS

## テスト計画

正本: `docs/tests/shopping-list-client-split.md`

## リスクとロールバック

- リスク: 楽観的更新・キュー優先マージの順序崩れ
- 緩和: コードをほぼ機械的に移動し、既存 RTL で固定
- ロールバック: 当該 PR を revert

## ドキュメント更新

- 設計書・本計画・試験計画のみ（roadmap / domain は対象外）
