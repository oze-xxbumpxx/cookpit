# 試験計画: shopping-list-client-split

- レベル: L2
- 関連設計: docs/designs/shopping-list-client-split.md
- 方針: **挙動不変の回帰**。既存アサーションの書き換え禁止。新規観点は継ぎ目が未カバーのときだけ。

## 対象

Presentation（`ShoppingListClient` とその hooks）。API / Domain / DB は対象外。

## 回帰ゲート（既存・正）

| ファイル                                      | 守る不変条件                                       |
| --------------------------------------------- | -------------------------------------------------- |
| `shopping-list-client.checked.test.tsx`       | check / bought・楽観的更新・422                    |
| `shopping-list-client.complete.test.tsx`      | 完了 / 再開・パネル                                |
| `shopping-list-client.offline-queue.test.tsx` | オフラインキュー・バナー・flush                    |
| `shopping-list-client.remove.test.tsx`        | 削除確認・404 成功扱い                             |
| `shopping-list-client.sync.test.tsx`          | Sync / refetch・キュー優先マージ・covered 同時更新 |
| `shopping-list-client.view.test.tsx`          | EmptyState vs covered-only・readOnly               |

## 追加試験

不要（上記で継ぎ目をカバー済み）。フィクスチャ統一は OUT OF SCOPE。

## 品質ゲート

```
pnpm --filter @cookpit/web exec vitest run tests/app/shopping-lists/_components/shopping-list-client
pnpm --filter @cookpit/web lint
pnpm --filter @cookpit/web type-check
```

## 対象外

- E2E
- hook 単体の新規スイート（クライアント RTL が契約）
- `createShoppingItemDto` 統一
