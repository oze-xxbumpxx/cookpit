# 試験計画: productref-to-productid

- 対応設計書: docs/designs/productref-to-productid.md
- レベル: L2
- 対象層: Domain / Application / Infrastructure（API・Presentation は契約不変のため回帰のみ）

## 対象 public API（網羅）

| 層             | シンボル                                                         | 試験                                        |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| Domain         | `RecipeIngredient.create`                                        | D-01〜D-03                                  |
| Domain         | `RecipeIngredient.scale`                                         | D-04                                        |
| Domain         | getters (`productRef` / `displayName` / `amount` / `amountNote`) | D-01, D-04                                  |
| Application    | `toIngredient` / `toIngredientDto`                               | A-01〜A-03                                  |
| Application    | `ingredient-aggregation` の productId 解決                       | A-04（既存 shopping-list 生成テストで回帰） |
| Infrastructure | `DrizzleRecipeRepository` 往復                                   | I-01（既存 recipe repository テストで回帰） |

## Domain

| ID   | 前提                       | 操作                                                          | 期待                                                        | 分類 |
| ---- | -------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- | ---- |
| D-01 | なし                       | `create({ productRef: ProductId.fromString('prod-1'), ... })` | `productRef` が非 null で `.value === 'prod-1'`             | 正常 |
| D-02 | なし                       | 同上                                                          | `productRef` が `ProductId` インスタンス（`equals` で一致） | 正常 |
| D-03 | なし                       | `create({ productRef: null, ... })`                           | `productRef === null`                                       | 境界 |
| D-04 | productRef 付き ingredient | `scale(3)`                                                    | productRef が同一 ID で引き継がれる                         | 正常 |
| D-05 | 既存バリデーション         | displayName 空 / amount 排他                                  | 既存エラーメッセージ不変                                    | 回帰 |

防御性: 可変コレクションのゲッターなし。不正 factor は本変更対象外（既存 scale 仕様）。

## Application

| ID   | 前提                          | 操作                 | 期待                                          | 分類 |
| ---- | ----------------------------- | -------------------- | --------------------------------------------- | ---- |
| A-01 | dto.productRef = `'prod-abc'` | `toIngredient`       | Domain の productRef.value が一致             | 正常 |
| A-02 | dto.productRef = null         | `toIngredient`       | productRef null                               | 境界 |
| A-03 | Domain に ProductId 付き      | `toRecipeDto`        | ingredients[].productRef が文字列             | 正常 |
| A-04 | 献立に productRef 付きレシピ  | GenerateShoppingList | 品目の productId が引き継がれる（既存テスト） | 回帰 |

## Infrastructure

| ID   | 前提                                   | 操作     | 期待                                  | 分類 |
| ---- | -------------------------------------- | -------- | ------------------------------------- | ---- |
| I-01 | productRef 文字列を含む Recipe を save | findById | productRef が復元される（既存 T-I\*） | 回帰 |

## 対象外

- 冪等性: 書き込みセマンティクス変更なし → 対象外
- 障害系: 外部 API なし → 対象外
- フロントエンド固有: UI 変更なし → 対象外（web テストは回帰で全緑確認）

## 回帰範囲

- `pnpm test` 全パッケージ（件数はベースライン以上、失敗 0）
- `grep ProductRef` がコード上 0 件
