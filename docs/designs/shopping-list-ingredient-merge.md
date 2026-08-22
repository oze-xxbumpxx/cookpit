# 設計書: shopping-list-ingredient-merge

- ステータス: confirmed
- レベル: L2
- 関連: `docs/designs/shopping-list-core.md`（S-4 / S-5）/ `docs/designs/free-text-units.md`（U-5）/
  `docs/designs/meal-plan-shopping-sync.md` / ADR-0007 / ADR-0018

## 背景

ユーザー報告:「買い物リストに反映させた時に同じ材料を1つに合わせて欲しい。今は各々で表示されている」。

現行の集計（`packages/application/src/shopping-list/ingredient-aggregation.ts`）は
`shopping-list-core.md` S-4 案 B に従い、**`(productId ?? displayName.trim()) + 単位`が完全一致する
数量つき材料のみ**を合算する。その結果、次の 3 パターンが「同じ材料なのに別行」として残っていた。

| #   | パターン                                | 原因                                                                              | 例                                 |
| --- | --------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | 数量なし材料（`amountNote` のみ）の重複 | S-4 で明示的に集計対象外とし、出現ごとに `individual` へ push していた            | 2 レシピの「小ねぎ 適量」→ 2 行    |
| 2   | 同じ材料で注記だけ違う                  | 同上                                                                              | 「豚肉 少々」＋「豚肉 適量」→ 2 行 |
| 3   | 材料名の表記ゆれ                        | 単位は `normalizeUnit`（trim + NFKC）で正規化しているのに、材料名は `trim()` のみ | 「ﾀﾏﾈｷﾞ」と「タマネギ」→ 2 行      |

さらに、Sync（「献立の変更を反映」）は `existingKeys` により**新規追加時は既に重複を防いでいる**ため、
重複行は Generate（初回生成）でのみ作られる。裏を返すと、旧仕様で生成済みの既存リストは
Sync を押しても重複が解消されない。

## 目的

献立を買い物リストへ反映したとき、同じ材料が 1 行にまとまった状態にする。旧仕様で生成済みの
既存リストも「献立の変更を反映」で 1 行に寄せられるようにする。

## 要件

1. 数量なし材料（`amountNote`）は `(productId ?? 正規化 displayName)` 単位で 1 行にまとめる。
2. 注記が複数ある場合は **併記**する（区切りは `・`）。同一注記は重複排除する。順序は初出順。
3. 材料名の照合は **trim + NFKC 正規化**で行う（単位の `normalizeUnit` と同じ規約）。表示は入力原文。
4. Sync は、集計結果で注記が変わった `from_meal_plan` かつ `pending` の品目の注記を上書きする。
5. Sync は、同一照合キーの重複行（旧仕様の生成物）を 1 行へ寄せる。残す 1 行は最初の出現。
6. 上記いずれも変更が無ければ Sync は従来どおり no-op（保存しない）。

## 対象範囲

- Domain: `ShoppingItem.updateAmountNote()` / `ShoppingList.updateItemAmountNote()` の追加。
- Application: `ingredient-aggregation.ts` の集計仕様、`SyncShoppingListFromMealPlanUseCase` の
  注記更新・重複解消。
- Presentation: `diffSyncResult` が注記変更を「更新」として数える。

## 対象外

- **単位違いの合算**（「玉ねぎ 1個」＋「玉ねぎ 100g」）。単位換算を持たない MVP1 制約
  （`free-text-units.md` §対象外）を維持し、別行のまま残す。ユーザー確認済み。
- **数量あり＋数量なしの混在の 1 行化**（「にんじん 1本」＋「にんじん 適量」）。
  `ShoppingItem` の「`requiredAmount` と `amountNote` はちょうど一方が非 null」という不変条件
  （S-5 案 β）の変更が必要になるため見送る。ユーザー確認済み。
- 材料名の別名辞書・あいまい一致（「にんじん」と「人参」）。`shopping-list-core.md` S-3 の
  Product `aliases` 突き合わせ案は従来どおり未採用。
- 手動追加品目（`manually_added`）の自動合算。S-4 の「ユーザーの明示操作をそのまま尊重する」を維持。
- DB スキーマ変更・データ移行バッチ。既存データは Sync 経由で解消する（§移行とリリース）。

## 現状構成

```
GenerateShoppingList ─┐
                      ├─ resolveMealPlanIngredients()
SyncShoppingList ─────┘        └─ aggregateIngredients()
                                    ├─ 数量あり: Map<key, Quantity 合算>   key = (productId ?? name.trim()) + normalizeUnit(unit)
                                    └─ 数量なし: individual[] へ無条件 push  ← 重複の発生源
```

`ingredientMatchKey` / `itemMatchKey`（Sync の照合キー）も同じ `matchKey()` を使うが、
材料名側だけ正規化が `trim()` 止まりだった。

## 変更後構成

```
aggregateIngredients()
  ├─ 数量あり: Map<matchKey(productId, name, unit), Quantity 合算>      （従来どおり）
  └─ 数量なし: Map<matchKey(productId, name, null), 注記リスト>        （新規。initial 順を保持）
                 └─ 出力時に notes.join('・')

matchKey(productId, displayName, unit)
  base = productId?.value ?? normalizeDisplayName(displayName)   // trim + NFKC（新規）
  key  = `${base}|${unit === null ? 'note' : normalizeUnit(unit)}`
```

出力順は従来どおり「数量あり行 → 数量なし行」。数量なし行の中は初出順。

`SyncShoppingListFromMealPlanUseCase`:

1. `existingItems` を照合キーで走査し、2 件目以降で `from_meal_plan` かつ `pending` のものを
   **重複行**として抽出する（残りを `dedupedItems` とする）。`bought` と `manually_added` は残す。
2. 数量更新・削除の判定は `dedupedItems` に対して行う（従来と同じ規則）。
3. 注記更新の判定を追加する。対象は `from_meal_plan` かつ `pending` かつ `amountNote !== null` で、
   集計結果の注記が現在値と異なる品目。
4. 追加・更新・注記更新・削除・重複解消がすべて 0 件なら no-op。

## データフロー

「献立の変更を反映」押下 → `POST /api/shopping-lists/:id/sync` → UseCase（単一 UoW 内）:
MealPlan 取得 → 材料再集計 → 重複行の抽出 → 数量更新（在庫引き算あり）→ 注記更新 → 削除 →
重複行の削除 → 新規追加（在庫引き算あり）→ ShoppingList / Pantry 保存 → DTO 返却。

## API 設計

**変更なし。** `packages/api-contract/src/shopping-list.schema.ts` の
`shoppingItemResponseSchema.amountNote` は `string | null` のままで、値の中身（併記文字列）が
変わるだけ。リクエスト側の変更もなし。

## DB 設計

**変更なし。** `shopping_items.amount_note` は `text` のままで、格納される文字列が変わるだけ。
マイグレーションは不要。

## フロントエンド設計

- `apps/web/src/app/shopping-lists/_utils/shopping-list-view.ts` の `diffSyncResult` が
  `amountNote` の変化も「更新」として数える。これがないと注記だけ変わったときに
  「変更はありませんでした」と誤表示される。
- `ShoppingItemRow` は `item.amountNote` をそのまま表示するため**変更なし**（「少々・適量」と出る）。

## バックエンド設計

- `ShoppingItem.updateAmountNote(note: string)` — `updateRequiredAmount` の対称メソッド。
  `pending` 以外、`amountNote === null`（数量品目）、空白のみの注記を拒否する。
- `ShoppingList.updateItemAmountNote(itemId, note)` — `assertActive` を通す薄いラッパ。
- `normalizeDisplayName()` は Application 層（`ingredient-aggregation.ts`）に置く。集計・照合という
  Application の関心事であり、Domain（`normalizeUnit` は `Quantity.add` の等価判定に必要なため
  Domain にある）へ持ち込む必然がないため。

## エラー処理

外部 API / 外部ストレージへの新規 I/O は**なし**（リトライ・タイムアウト・フォールバックは対象外）。

- 冪等性: Sync は再実行しても差分が無ければ no-op（保存もしない）。重複解消は 1 度で収束し、
  2 度目以降は重複行が無いため no-op になる。
- 部分失敗: 従来どおり `UnitOfWork.execute()` 内で ShoppingList / Pantry を原子的に保存する。
- Domain の新規 throw（`pending` 以外の注記更新など）は UseCase 側で対象を絞ってから呼ぶため
  通常経路では発生しない。発生時は既存のエラー変換（Hono ルート）に委ねる。

## ログと監視

**変更なし。** 既存の Sync 結果トースト（`describeSyncResult`）以外に新規ログは追加しない。

## セキュリティ

**変更なし。** 認証・認可・入力経路に変更はない。注記は既存の Zod 契約を通った文字列の連結で、
新たな外部入力を受け付けない。

## 性能

集計の計算量は変わらない（`individual` 配列が Map になるだけで、材料数に対して O(n)）。
Sync の重複走査は既存品目数に対する 1 パス O(m) の追加のみ。品目数は実運用で数十件のため影響なし。

## テスト方針

詳細は `docs/tests/shopping-list-ingredient-merge.md`。要点:

- Domain: `updateAmountNote` の正常系と 3 つの拒否条件、`ShoppingList` 経由の `completed` 拒否。
- Application（Generate）: 同一注記の重複排除 / 異なる注記の併記 / 材料名の表記ゆれ（半角カナ・
  全角空白）で合算されること / 単位違いは別行のままであること（回帰）。
- Application（Sync）: 注記変更の上書き / 旧仕様の重複行の解消 / bought・manually_added の重複は
  消さないこと / 差分なしの no-op（保存が呼ばれない）。
- Presentation: `diffSyncResult` が注記変更を updated として数えること。

## 移行とリリース

- **データ移行バッチは行わない。** 旧仕様で生成済みのリストは、ユーザーが「献立の変更を反映」を
  押した時点で重複が解消される（要件 5）。押さなければ従来の表示のまま壊れない。
- 後方互換: DB スキーマ・API 契約ともに変更なし。ロールバックはコード差し戻しのみで完結する
  （併記済みの注記文字列は旧コードでもそのまま表示・保存できる）。

## リスク

| #   | リスク                                           | 対策                                                                                                                                      |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | 注記の併記が長くなり 1 行に収まらない            | 表示は既存の `text-xs` 段落で折り返す。注記は重複排除済みで、実運用では 2〜3 個が上限と見込む                                             |
| R-2 | 重複解消が `bought` の購入実績を消す             | 重複行の削除対象を `from_meal_plan` かつ `pending` に限定する。`bought` と `manually_added` は残す                                        |
| R-3 | 材料名の NFKC 正規化で意図しない材料が合算される | NFKC は半角カナ・全角英数の正規化のみで、別語（「人参」と「にんじん」）は結合しない。回帰テストで単位違い・別材料が分かれることを確認する |
| R-4 | Sync の注記上書きがユーザーの手動編集を潰す      | 対象を `from_meal_plan` かつ `pending` に限定する（数量更新と同じ規則）。手動追加品目は触らない                                           |

## 未決事項

なし（対象外とした 2 件はユーザー確認済み）。
