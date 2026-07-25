# 設計書: productref-to-productid

- ステータス: confirmed
- レベル: L2
- 関連: docs/decisions/ADR-0010-package-public-boundary.md（案 D） /
  docs/decisions/ADR-0011-recipe-ingredient-product-id.md /
  docs/04-domain-model.md

## 背景

ADR-0010 でバレル公開のため、`RecipeIngredient` 側の衝突する `interface ProductId` を
一時的に `ProductRef`（構造的 `{ value: string }`）へ改名した。これにより公称型付け
（`Identifier<'ProductId'>` のファントムブランド）が効かず、任意の `{ value: string }` を
商品参照として渡せてしまう。ADR-0010 案 D と `docs/04-domain-model.md` はもともと
`ProductId | null` を正としている。

## 目的

`RecipeIngredient.productRef` の型を `ProductId | null` に戻し、集約をまたぐ ID 参照の
型安全性を回復する。外部から観測可能な API・DB・画面挙動は変えない。

## 要件

1. Domain の `productRef` 型は `ProductId | null` とする。
2. `export interface ProductRef` を削除する（バレルからも消える）。
3. Application / Infrastructure の組み立ては `ProductId.fromString(...)` を使う。
4. API 契約（`productRef: string | null`）・DB JSON 形・HTTP レスポンスは不変。
5. プロパティ名 `productRef` は維持する（DTO / API との対応を崩さない）。

## 対象範囲

- `packages/domain` の `RecipeIngredient`
- 組み立て箇所（`recipe.mapper` / `drizzle-recipe.repository` / 関連テスト）
- 利用側の冗長変換の整理（`ingredient-aggregation`）
- 恒久ドキュメント・ADR

## 対象外

- API / DB スキーマ変更
- UI での商品マスタ連携（`productRef` は引き続き多くの経路で `null`）
- `ShoppingItem.productId` の改名や他集約のリネーム
- TanStack Query / Zustand 導入

## 現状構成

```ts
export interface ProductRef {
  readonly value: string;
}
// RecipeIngredient.productRef: ProductRef | null
// mapper: { value: dto.productRef }
```

## 変更後構成

```ts
// RecipeIngredient.productRef: ProductId | null
// mapper: ProductId.fromString(dto.productRef)
```

- 集約間参照は ID のみ（`.claude/rules/domain-layer.md` 準拠）。
- `Product` Entity 自体は Recipe に持たせない。

## データフロー

変更なし。買い物リスト生成時の `productRef` → `ProductId` 解決は、Domain 側が既に
`ProductId` を持つため、Application の再ラップが不要になる（等価）。

## API 設計

変更なし（`packages/api-contract` の `productRef: z.string().nullable()` を維持）。

## DB 設計

変更なし（recipes.ingredients JSON の `productRef: string | null` を維持）。

## フロントエンド設計

変更なし（MVP1 は `productRef: null` 送信のまま）。

## バックエンド設計

Repository 復元時に `ProductId.fromString`、永続化時は従来どおり `.value`。

## エラー処理

対象外（外部 API / 外部ストレージ I/O なし）。
`ProductId.fromString` の入力検証は既存 `Identifier` の挙動に従う（空文字等は現行どおり）。

## ログと監視

変更なし。

## セキュリティ

変更なし。

## 性能

変更なし（オブジェクト生成は従来の構造的リテラルと同等）。

## テスト方針

- 既存 `recipe-ingredient` / `recipe.mapper` / recipe repository / shopping-list 生成テストを
  `ProductId.fromString` に追随させ、件数を維持する。
- 追加観点: `productRef` が `ProductId` インスタンスであること（`instanceof` または
  `equals`）。構造的 `{ value }` を渡すと型エラーになることは type-check で担保。

## 移行とリリース

- データ移行不要。デプロイ手順変更なし。

## リスク

| リスク                       | 対応                                      |
| ---------------------------- | ----------------------------------------- |
| 構造的リテラルの取りこぼし   | type-check 全パッケージで検出             |
| バレルに `ProductRef` が残る | `index.ts` に明示 export が無いことを確認 |
| 実行時の文字列解釈差         | `fromString` は現行 Identifier と同じ経路 |

## 未決事項

なし（ADR-0010 案 D の採用として確定）。
