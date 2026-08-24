# 試験計画: shopping-list-pantry-coverage

- 前提: `docs/designs/shopping-list-pantry-coverage.md`
- レベル: L2
- 対象層: Presentation（DOM）+ api-contract schema（型往復）

## 観点一覧

| ID    | 前提                                                     | 操作                 | 期待                                                                         | 分類           |
| ----- | -------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------- | -------------- |
| PC-01 | item に `pantryDeductedAmount: { value: 1, unit: '本' }` | 詳細表示             | 「在庫で 1本」が数量下に見える。チェックは操作可能                           | 正常・P-2      |
| PC-02 | `items: []` かつ `coveredIngredients` に 1 件以上        | 詳細表示             | EmptyState「リストにアイテムがありません」は出ない。「在庫で足りる」が見える | 境界・D-6      |
| PC-03 | `coveredIngredients: null` かつ items あり（レガシー）   | 詳細表示             | 「在庫で足りる」なし。行に「在庫で」ヒントなし                               | 回帰・レガシー |
| PC-04 | Sync 成功で `coveredIngredients` が null → 配列に変化    | 「献立の変更を反映」 | 折りたたみが現れ、新しいカバー名が見える                                     | 正常・D-5      |
| PC-05 | covered 節が表示されている                               | 折りたたみを開く     | 行にチェックボックスが無い（P-1）                                            | 正常・P-1      |
| PC-06 | —                                                        | UI 文言検索          | 「やっぱり買う」が存在しない                                                 | 回帰・P-3      |

## api-contract

| ID      | 期待                                                                                  |
| ------- | ------------------------------------------------------------------------------------- |
| Z-PC-01 | `shoppingItemResponseSchema` が `pantryDeductedAmount: null` / 数量オブジェクトを受理 |
| Z-PC-02 | `shoppingListResponseSchema` が `coveredIngredients: null` / 配列を受理               |
| Z-PC-03 | キー欠落時は default null で parse 成功（段階ロールアウト）                           |
| Z-PC-04 | 既存往復ケース（新フィールド付き fixture）が green                                    |

## 回帰

- 既存 `shopping-list-client.view/sync/checked/complete/remove/offline-queue` が green
- EmptyState（items 空かつ covered null/空）は従来どおり表示（LC-03）

## 対象外

- applyPantryDeduction の単体（既存 pantry-shopping-integration）
- DB 永続化・マイグレーション
- E2E Playwright（本切片は DOM Vitest）
