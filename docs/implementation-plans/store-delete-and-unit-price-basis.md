# 実装計画: store-delete-and-unit-price-basis

- ステータス: confirmed
- レベル: L3
- 設計書: `docs/designs/store-delete-and-unit-price-basis.md`
- 試験計画: `docs/tests/store-delete-and-unit-price-basis.md`
- ADR: `docs/decisions/ADR-0012-store-delete-restrict-on-reference.md`

## 変更対象ファイル

| #   | ファイル                                                                       | 変更                                                     |
| --- | ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 1   | `packages/domain/src/product/product.ts`                                       | `Product.removePriceRecord()` を追加                     |
| 2   | `packages/domain/src/product/product.repository.ts`                            | `countPriceRecordsByStore()` を追加                      |
| 3   | `packages/domain/src/shared/store.repository.ts`                               | `delete()` を追加                                        |
| 4   | `packages/domain/src/shopping-list/shopping-list.repository.ts`                | `countItemsByStore()` を追加                             |
| 5   | `packages/domain/src/product/product.test.ts`                                  | `removePriceRecord` のテスト追加                         |
| 6   | `packages/application/src/product/product.dto.ts`                              | `PriceRecordDto.id` / `DeletePriceRecordInputDto` を追加 |
| 7   | `packages/application/src/product/product.mapper.ts`                           | `id` をマップ                                            |
| 8   | `packages/application/src/product/index.ts`                                    | 新規 UseCase・エラーを export                            |
| 9   | `packages/application/src/store/index.ts`                                      | 新規 UseCase・エラーを export                            |
| 10  | `packages/application/src/product/product-use-cases.test.ts`                   | InMemory 実装の追随 + 新テスト                           |
| 11  | `packages/application/src/product/product.mapper.test.ts`                      | `id` の検証を追加                                        |
| 12  | `packages/application/src/store/store-use-cases.test.ts`                       | InMemory 実装の追随 + 新テスト                           |
| 13  | `packages/application/src/shopping-list/test-helpers.ts`                       | InMemory 実装の追随                                      |
| 14  | `packages/application/src/shopping-list/complete-shopping.use-case.test.ts`    | InMemory 実装の追随                                      |
| 15  | `packages/infrastructure/src/repositories/drizzle-store.repository.ts`         | `delete()` を実装                                        |
| 16  | `packages/infrastructure/src/repositories/drizzle-product.repository.ts`       | `countPriceRecordsByStore()` を実装                      |
| 17  | `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.ts` | `countItemsByStore()` を実装                             |
| 18  | `packages/infrastructure/src/repositories/drizzle-*.repository.test.ts`        | PGlite テスト追加（3 ファイル）                          |
| 19  | `packages/api-contract/src/product.schema.ts`                                  | `priceRecordIdParamSchema` を追加                        |
| 20  | `packages/api-contract/src/product.schema.test.ts`                             | スキーマのテスト追加                                     |
| 21  | `apps/web/src/server/routes/products.ts`                                       | `DELETE /:id/price-records/:priceRecordId`               |
| 22  | `apps/web/src/server/routes/stores.ts`                                         | `DELETE /:id`                                            |
| 23  | `apps/web/src/server/routes/products.test.ts`                                  | ルートテスト追加                                         |
| 24  | `apps/web/src/server/routes/stores.test.ts`                                    | **新規**（現在ルートテストが無い）                       |
| 25  | `apps/web/src/app/products/_utils/product-format.ts`                           | `formatUnitPrice()` 追加・`unitPriceBasisLabel()` 変更   |
| 26  | `apps/web/src/app/products/_utils/product-format.node.test.ts`                 | テスト追加・既存期待値の更新                             |
| 27  | `apps/web/src/app/products/_components/product-card.tsx`                       | `formatUnitPrice` へ差し替え                             |
| 28  | `apps/web/src/app/products/[id]/_components/product-detail-client.tsx`         | `formatUnitPrice` へ差し替え + 記録削除 UI               |
| 29  | `apps/web/src/app/products/[id]/_components/price-record-form.tsx`             | 店舗管理パネル                                           |
| 30  | `apps/web/src/app/products/[id]/_components/price-record-form.test.tsx`        | テスト追加                                               |
| 31  | `apps/web/src/app/products/[id]/_components/product-detail-client.test.tsx`    | **新規**                                                 |

## 新規作成ファイル

| ファイル                                                                    | 目的                   |
| --------------------------------------------------------------------------- | ---------------------- |
| `packages/application/src/product/delete-price-record.use-case.ts`          | 価格記録の削除 UseCase |
| `packages/application/src/product/price-record-not-found.error.ts`          | 404 用エラー           |
| `packages/application/src/store/delete-store.use-case.ts`                   | 店舗削除 UseCase       |
| `packages/application/src/store/store-in-use.error.ts`                      | 422 用エラー           |
| `apps/web/src/server/routes/stores.test.ts`                                 | stores ルートのテスト  |
| `apps/web/src/app/products/[id]/_components/product-detail-client.test.tsx` | 記録削除 UI のテスト   |

## ファイルごとの変更内容

### `packages/domain/src/product/product.ts`

`recordPrice()` の直後に `removePriceRecord()` を追加。存在しなければ throw、
あれば `filter` で除去して `touch()`。JSDoc に `@throws` を書く（公開 API の規約）。

### `packages/domain/src/product/product.repository.ts` / `shared/store.repository.ts` / `shopping-list/shopping-list.repository.ts`

メソッドシグネチャを 1 本ずつ追加し、型に表せない契約（何を数えるか）を JSDoc に書く。

### `packages/application/src/product/product.dto.ts`

- `PriceRecordDto` の先頭に `id: string` を追加
- `DeletePriceRecordInputDto { productId: string; priceRecordId: string }` を追加

### `packages/application/src/product/delete-price-record.use-case.ts`（新規）

```ts
export class DeletePriceRecordUseCase {
  constructor(private readonly productRepository: ProductRepository) {}

  async execute(input: DeletePriceRecordInputDto): Promise<void> {
    const product = await this.productRepository.findById(ProductId.fromString(input.productId));
    if (product === null) throw new ProductNotFoundError(input.productId);

    const priceRecordId = PriceRecordId.fromString(input.priceRecordId);
    const exists = product.priceHistory.some((record) => record.id.equals(priceRecordId));
    if (!exists) throw new PriceRecordNotFoundError(input.priceRecordId);

    product.removePriceRecord(priceRecordId);
    await this.productRepository.save(product);
  }
}
```

### `packages/application/src/store/delete-store.use-case.ts`（新規）

存在確認 → `Promise.all` で件数 2 本 → 合計 > 0 なら `StoreInUseError` → `delete()`。

### `apps/web/src/server/routes/products.ts` / `stores.ts`

既存チェーンの末尾に `.delete(...)` を足す。ボディなし 204（`c.body(null, 204)`）。

### `apps/web/src/app/products/_utils/product-format.ts`

`unitPriceBasis(unit)` を private 関数として置き、`unitPriceBasisLabel` と
`formatUnitPrice` の両方がそれを使う。判定用 `Set` は `UnitPriceCalculator` と同じ
厳密一致にし、**理由をコメントで残す**（Why が非自明なため）。

### `apps/web/src/app/products/[id]/_components/product-detail-client.tsx`

- `formatUnitPrice` へ差し替え（2 箇所）
- `key` を `record.id` に変更
- 行に `Trash2` ボタン、クライアントに制御モードの `AlertDialog` を 1 つ追加
- `pendingDeleteRecord` / `deletingRecordId` / `recordDeleteErrorMessage` の 3 state

### `apps/web/src/app/products/[id]/_components/price-record-form.tsx`

破線パネルを「店舗の管理」に拡張。店舗行の一覧 + 削除ボタン + 既存の追加フォーム。
`pendingDeleteStore` / `deletingStoreId` の 2 state を追加。削除成功時は
`setStores(filter)`、選択中なら `setStoreId('')`。

## 実装手順

1. Domain: `removePriceRecord` + リポジトリインターフェース 3 本 → `pnpm type-check`
   （ここで InMemory 実装 6 箇所のコンパイルエラーが出るのが正常）
2. Domain テスト（`product.test.ts`）を追加して `pnpm test` を Domain だけ通す
3. Application: DTO / mapper / 2 UseCase / 2 エラー / barrel、InMemory 実装 6 箇所を追随
4. Application テスト（UseCase 2 種 + mapper）
5. Infrastructure: 3 リポジトリ実装 + PGlite テスト
6. api-contract: `priceRecordIdParamSchema` + テスト
7. Presentation ルート 2 本 + ルートテスト
8. `product-format.ts` の単価表示 + 純関数テスト
9. 画面 3 ファイル + RTL テスト
10. `pnpm lint` / `pnpm type-check` / `pnpm test` / `pnpm format`
11. ドキュメント更新（README 索引・docs/03-architecture.md の API 一覧があれば）

各層は下から順に完成させる。Domain → Application の途中で `type-check` を挟むことで、
インターフェース追加の波及範囲を早期に確定させる。

## テスト計画

`docs/tests/store-delete-and-unit-price-basis.md` を正とする。

## リスク

| リスク                                                        | 対策                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| InMemory リポジトリの追随漏れ                                 | 手順 1 で意図的に `type-check` を落とし、エラー一覧を潰す          |
| `product-format` の既存テストが `'100g'` を期待していて壊れる | 期待値の更新は仕様変更として明示的に行い、変更理由をテスト名に残す |
| `PriceRecordDto.id` 追加で既存のテストフィクスチャが型エラー  | `type-check` で検出。フィクスチャに `id` を足す                    |
| ルート追加で既存ルートが解決されなくなる                      | 既存のルートテストが無変更で通ることを回帰条件にする               |

## ロールバック

コミット単位で戻せる。DB 変更が無いためデータ側のロールバック手順は不要。
①だけ戻したい場合は `product-format.ts` の `unitPriceBasis` を元の 100g 固定へ戻せばよい
（保存値を変えていないため、表示を戻すだけで完全に元の挙動になる）。

## ドキュメント更新対象

- `docs/decisions/README.md`（ADR-0012 の索引行）
- `docs/designs/README.md` / `docs/implementation-plans/README.md` / `docs/tests/README.md` /
  `docs/requirements/README.md` / `docs/reviews/README.md`（索引がある場合）
- `logs/2026-07-27.md`（作業ログ）
