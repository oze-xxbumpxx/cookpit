# 試験計画: shopping-list-ingredient-merge

- 前提となる設計書: docs/designs/shopping-list-ingredient-merge.md
- レベル: L2

## 試験種別

単体試験のみ（Vitest）。Domain / Application / Presentation ユーティリティを対象とする。
結合試験（Hono ルート）は**対象外** — API 契約・ルート実装ともに無変更で、変更はすべて
UseCase 内部の集計・同期ロジックに閉じるため（既存の
`apps/web/tests/server/routes/shopping-lists.generate.test.ts` が回帰として機能する）。
Infrastructure 試験も**対象外**（DB スキーマ・Mapper の形は不変。`amount_note` に入る文字列が
変わるだけで、既存の Repository 試験が保存・復元を担保する）。

## 単体試験観点

### Domain: ShoppingItem / ShoppingList

| #    | 観点                 | 前提                                                 | 操作                                | 期待結果                               | 分類 |
| ---- | -------------------- | ---------------------------------------------------- | ----------------------------------- | -------------------------------------- | ---- |
| M-01 | 注記の上書き         | `amountNote: '少々'` / `pending` の ShoppingItem     | `updateAmountNote('少々・適量')`    | `amountNote` が `'少々・適量'` になる  | 正常 |
| M-02 | 数量品目の拒否       | `requiredAmount` を持つ（`amountNote === null`）品目 | `updateAmountNote('適量')`          | throw（`requiredAmount` 品目である旨） | 異常 |
| M-03 | pending 以外の拒否   | `check()` 済み（`bought`）の注記品目                 | `updateAmountNote('適量')`          | throw（status を含むメッセージ）       | 異常 |
| M-04 | 空白のみの注記の拒否 | `pending` の注記品目                                 | `updateAmountNote('   ')`           | throw（注記が必須である旨）            | 境界 |
| M-05 | 集約経由の委譲       | `active` な ShoppingList に注記品目 1 件             | `updateItemAmountNote(id, '適量')`  | 対象品目の `amountNote` が変わる       | 正常 |
| M-06 | completed の拒否     | `complete()` 済みの ShoppingList                     | `updateItemAmountNote(id, '適量')`  | throw（`assertActive`）                | 異常 |
| M-07 | 存在しない ID        | `active` な ShoppingList                             | 未登録 ID で `updateItemAmountNote` | throw `'ShoppingItem not found'`       | 異常 |
| M-08 | 不変条件の保持       | M-01 実行後                                          | `requiredAmount` を確認             | `null` のまま（排他制約が壊れない）    | 境界 |

### Application: GenerateShoppingList（集計）

| #    | 観点                           | 前提                                              | 操作     | 期待結果                                                  | 分類 |
| ---- | ------------------------------ | ------------------------------------------------- | -------- | --------------------------------------------------------- | ---- |
| G-01 | 同一注記の重複排除             | 2 レシピが同じ「小ねぎ 適量」を持つ献立           | generate | 「小ねぎ」1 行・`amountNote` は `'適量'`                  | 正常 |
| G-02 | 異なる注記の併記               | 1 レシピが「豚肉 少々」「豚肉 適量」を持つ        | generate | 「豚肉」1 行・`amountNote` は `'少々・適量'`（初出順）    | 正常 |
| G-03 | 材料名の表記ゆれ               | 「ﾀﾏﾈｷﾞ 1個」と「タマネギ 2個」（productId なし） | generate | 1 行・`requiredAmount` が 3個・`displayName` は初出の原文 | 境界 |
| G-04 | 単位違いは別行（回帰）         | 「小麦粉 100g」と「小麦粉 0.1kg」                 | generate | 2 行のまま                                                | 境界 |
| G-05 | 数量ありと注記の混在（回帰）   | 「にんじん 1本」と「にんじん 適量」               | generate | 2 行のまま（対象外仕様の固定）                            | 境界 |
| G-06 | productId 一致での合算（回帰） | 同一 productId・別 displayName の注記材料         | generate | 1 行にまとまる（キーは productId 優先）                   | 正常 |
| G-07 | 調味料除外との共存（回帰）     | 「塩 少々」を含む                                 | generate | 塩は行に出ない（`isSeasoningName` 除外が先に効く）        | 正常 |

### Application: SyncShoppingListFromMealPlan

| #    | 観点                      | 前提                                                                                    | 操作                 | 期待結果                                                    | 分類 |
| ---- | ------------------------- | --------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------- | ---- |
| S-01 | 注記の更新                | 既存リストに `from_meal_plan` / `pending` の「豚肉 少々」。献立側の集計は「少々・適量」 | sync                 | 品目の `amountNote` が `'少々・適量'` になり保存される      | 正常 |
| S-02 | 旧仕様の重複解消          | 既存リストに同一キーの「小ねぎ 適量」が 2 行（ともに from_meal_plan / pending）         | sync                 | 1 行に減る（先頭を残す）                                    | 正常 |
| S-03 | 手動追加は残す            | 同一キーの重複 2 行のうち 1 行が `manually_added`                                       | sync                 | 手動追加行は残り、`from_meal_plan` / `pending` 側だけ消える | 境界 |
| S-04 | bought は残す             | 同一キーの重複 2 行のうち 2 行目が `bought`                                             | sync                 | 2 行とも残る（購入実績を失わない）                          | 境界 |
| S-05 | 注記の no-op              | 集計結果の注記が現在値と同じ                                                            | sync                 | `save` が呼ばれない（追加・更新・削除も 0 件）              | 正常 |
| S-06 | 冪等性                    | S-02 の直後                                                                             | 同じ sync をもう一度 | 2 回目は no-op（`save` が呼ばれない）・行数は変わらない     | 冪等 |
| S-07 | bought の注記は更新しない | `bought` の注記品目があり、集計の注記が変わった                                         | sync                 | 当該品目の `amountNote` は変わらない                        | 境界 |
| S-08 | 数量更新との共存（回帰）  | 数量品目の増量と注記変更が同時に起きる                                                  | sync                 | 数量・注記の両方が反映される                                | 正常 |

### Presentation: shopping-list-view

| #    | 観点                   | 前提                                              | 操作             | 期待結果                                          | 分類 |
| ---- | ---------------------- | ------------------------------------------------- | ---------------- | ------------------------------------------------- | ---- |
| P-01 | 注記変更を更新に数える | 同一 ID で `amountNote` だけ変わった before/after | `diffSyncResult` | `updatedCount` が 1                               | 正常 |
| P-02 | 変化なしは 0（回帰）   | before/after が同一                               | `diffSyncResult` | `describeSyncResult` が「変更はありませんでした」 | 境界 |

## 特性観点

- 権限: **対象外**（認証・認可に変更なし。単一ユーザー前提の MVP1）。
- データ整合性: 重複行の削除は `from_meal_plan` かつ `pending` に限定し、購入実績
  （`actualPrice` / `actualStore`）を持ちうる `bought` 行と手動追加行を消さない（S-03 / S-04）。
  ShoppingList / Pantry の保存は従来どおり同一 UnitOfWork 内（既存試験で担保）。
- 冪等性: **必須**（書き込み系 UseCase）。S-05 / S-06 で、差分が無いときに保存が発生せず、
  重複解消が 1 回で収束することを固定する。
- 障害系: **対象外**（外部 API / 外部ストレージへの新規 I/O なし。DB は既存 Repository 経由）。
- フロントエンド: **対象外**（画面コンポーネントの変更なし。`ShoppingItemRow` は
  `amountNote` をそのまま描画するため既存試験が回帰として機能する）。純関数
  `diffSyncResult` のみ P-01 / P-02 で確認する。
- 防御性（Domain）:
  - 防御的コピー: **対象外**（新規メソッドは `string` を受け取り可変オブジェクトを保持しない。
    `items` ゲッターの防御的コピーは既存試験で担保済み）。
  - 不変条件: M-08 で「`requiredAmount` と `amountNote` はちょうど一方が非 null」が
    注記更新後も保たれることを確認する。
  - 副作用: **対象外**（ShoppingItem に `updatedAt` 相当のフィールドが無い）。
  - 不正引数の伝搬: M-04（空白のみ）で確認する。数値引数を取らないため 0 / 負値は対象外。

## メソッド網羅チェック表

| クラス                              | メソッド                                              | 対応する試験観点 No              |
| ----------------------------------- | ----------------------------------------------------- | -------------------------------- |
| ShoppingItem                        | `updateAmountNote`                                    | M-01 / M-02 / M-03 / M-04 / M-08 |
| ShoppingList                        | `updateItemAmountNote`                                | M-05 / M-06 / M-07               |
| ingredient-aggregation              | `resolveMealPlanIngredients`（集計仕様）              | G-01〜G-07                       |
| ingredient-aggregation              | `ingredientMatchKey` / `itemMatchKey`（材料名正規化） | G-03 / S-02                      |
| SyncShoppingListFromMealPlanUseCase | `execute`                                             | S-01〜S-08                       |
| shopping-list-view                  | `diffSyncResult`                                      | P-01 / P-02                      |

既存メソッド（`create` / `reconstruct` / `markAsBought` / `check` / `uncheck` /
`updateRequiredAmount` / `removeItem` ほか）は本タスクで変更しないため、既存試験を回帰として使う。

## 回帰試験範囲

- `packages/application/tests/shopping-list/generate-shopping-list.use-case.test.ts` の
  「集計キーの単位境界、適量の個別行、小数 scaleFactor を保持する」は**新仕様に合わせて期待値を
  更新する**（4 行 → 3 行、注記は `'少々・適量'`）。
- 献立同期の既存観点（追加・数量更新・削除・bought 保護・no-op）が全て緑であること。
- `apps/web/tests/server/routes/shopping-lists.generate.test.ts` / `.sync`（存在すれば）が緑であること。
- 在庫引き算（`applyPantryDeduction`）関連の既存試験が緑であること（注記材料は
  `requiredAmount === null` のため従来どおり素通しされる）。
- 調味料除外（`isSeasoningName`）の既存試験が緑であること。

## 試験データ

- 注記材料: `noteIngredient('小ねぎ', '適量')` / `noteIngredient('豚肉', '少々')`（既存ヘルパ）。
- 表記ゆれ: 半角カナ `'ﾀﾏﾈｷﾞ'` と全角 `'タマネギ'`（NFKC で一致）。
- 重複リスト: `ShoppingItem.create` で同一 `displayName` / `amountNote` の品目を 2 件持つ
  ShoppingList を `reconstruct` で組み立てる（旧仕様の生成物の再現）。

## 完了条件

- M-01〜M-08 / G-01〜G-07 / S-01〜S-08 / P-01〜P-02 が全て緑。
- 新規観点のうち少なくとも G-01・G-02・S-02 は、**変更前のコードで失敗すること**を確認済み
  （空振りテスト防止。2026-08-21 の先例に倣う）。
- `pnpm lint` / `pnpm type-check` / `pnpm test` が全て PASS。
- 回帰試験範囲の既存試験が緑（期待値を更新した 1 件を除き、既存の期待値を変えていない）。
