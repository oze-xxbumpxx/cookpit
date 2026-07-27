# 実装計画: store-limit-and-render-performance

- 設計書: [docs/designs/store-limit-and-render-performance.md](../designs/store-limit-and-render-performance.md)
- ADR: [ADR-0013](../decisions/ADR-0013-store-limit-and-delete-cascade.md)
- 変更レベル: L2
- フェーズ分割: A（店舗）→ B（内容量の例）→ C（描画性能）。フェーズごとに品質ゲート + コミット

## 変更対象ファイル

### フェーズ A — 店舗 3 件上限 / 同名禁止 / カスケード削除

| ファイル                                                                       | 変更内容                                                                   |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `packages/domain/src/shared/store.ts`                                          | `normalizeStoreName()` を追加                                              |
| `packages/domain/src/shared/store.repository.ts`                               | `findByNormalizedName()` を追加                                            |
| `packages/domain/src/product/product.repository.ts`                            | `deletePriceRecordsByStore()` を追加                                       |
| `packages/domain/src/shopping-list/shopping-list.repository.ts`                | `findAllByStore()` を追加                                                  |
| `packages/domain/src/shopping-list/shopping-list.ts`                           | `ShoppingItem.unassignStore()` / `ShoppingList.unassignStore()`            |
| `packages/domain/src/shared/store.test.ts`                                     | `normalizeStoreName` のケース追加                                          |
| `packages/domain/src/shopping-list/shopping-list.test.ts`                      | `unassignStore` のケース追加                                               |
| `packages/infrastructure/src/repositories/drizzle-store.repository.ts`         | `findByNormalizedName` 実装                                                |
| `packages/infrastructure/src/repositories/drizzle-product.repository.ts`       | `deletePriceRecordsByStore` 実装                                           |
| `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.ts` | `findAllByStore` 実装                                                      |
| `packages/infrastructure/src/repositories/drizzle-*.repository.test.ts`        | 上記 3 メソッドの PGlite テスト追加                                        |
| `packages/application/src/store/create-store.use-case.ts`                      | 上限・同名チェックを追加                                                   |
| `packages/application/src/store/delete-store.use-case.ts`                      | カスケード 3 段へ置き換え                                                  |
| `packages/application/src/store/index.ts`                                      | 新規 2 エラー + `GetStoreUsageUseCase` を export、`StoreInUseError` を削除 |
| `packages/application/src/store/store.dto.ts`                                  | `StoreUsageDto` を追加                                                     |
| `packages/application/src/store/store-use-cases.test.ts`                       | 上限・同名・カスケードのケース追加、`StoreInUseError` ケース削除           |
| `packages/api-contract/src/store.schema.ts`                                    | `storeUsageResponseSchema` を追加                                          |
| `packages/api-contract/src/store.schema.test.ts`                               | 上記スキーマのケース追加                                                   |
| `apps/web/src/server/routes/stores.ts`                                         | `GET /:id/usage` を追加                                                    |
| `apps/web/src/app/products/[id]/_components/price-record-form.tsx`             | 上限・同名の UI、削除ダイアログの件数表示、`STORE_IN_USE_MESSAGE` 削除     |
| `apps/web/src/app/products/[id]/_components/price-record-form.test.tsx`        | 上記の UI テスト追加・422 系ケース差し替え                                 |

### フェーズ B — 内容量の例

| ファイル                                                           | 変更内容                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `apps/web/src/app/products/[id]/_components/price-record-form.tsx` | プレースホルダ・エラーメッセージを `packageSizeExample()` 由来に |

### フェーズ C — 描画性能

| ファイル                       | 変更内容                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/layout.tsx`  | `@fontsource` import 3 行を削除                                                                                 |
| `apps/web/src/app/globals.css` | 自前の `@font-face` 3 件を追加                                                                                  |
| `apps/web/package.json`        | `subset-font` を devDependencies に追加、`@fontsource/zen-maru-gothic` を dependencies → devDependencies へ移動 |

## 新規作成ファイル

| ファイル                                                             | 用途                     |
| -------------------------------------------------------------------- | ------------------------ |
| `packages/application/src/store/store-limit-exceeded.error.ts`       | 上限超過エラー（422）    |
| `packages/application/src/store/duplicate-store-name.error.ts`       | 同名エラー（422）        |
| `packages/application/src/store/get-store-usage.use-case.ts`         | 参照件数の取得           |
| `apps/web/src/app/products/_utils/package-size-example.ts`           | 内容量の例（純関数）     |
| `apps/web/src/app/products/_utils/package-size-example.node.test.ts` | 上記のテスト             |
| `apps/web/src/app/loading.tsx`                                       | ダッシュボードの骨組み   |
| `apps/web/src/app/products/[id]/loading.tsx`                         | 商品詳細の骨組み         |
| `apps/web/src/app/shopping-lists/loading.tsx`                        | 買い物入口の骨組み       |
| `apps/web/src/app/shopping-lists/[id]/loading.tsx`                   | 買い物リスト詳細の骨組み |
| `apps/web/src/app/recipes/[id]/loading.tsx`                          | レシピ詳細の骨組み       |
| `apps/web/src/app/meal-plans/history/loading.tsx`                    | 献立履歴の骨組み         |
| `apps/web/scripts/subset-fonts.mjs`                                  | フォントサブセット生成   |
| `apps/web/public/fonts/zen-maru-gothic-subset-400.woff2`             | 生成物（コミットする）   |
| `apps/web/public/fonts/zen-maru-gothic-subset-500.woff2`             | 生成物（コミットする）   |
| `apps/web/public/fonts/zen-maru-gothic-subset-700.woff2`             | 生成物（コミットする）   |

## 削除ファイル

| ファイル                                               | 理由                       |
| ------------------------------------------------------ | -------------------------- |
| `packages/application/src/store/store-in-use.error.ts` | 発生経路が消滅（ADR-0013） |

## 実装手順

### フェーズ A

1. **Domain**: `normalizeStoreName` を `store.ts` に追加し、`store.test.ts` にケースを足す
2. **Domain**: `ShoppingItem.unassignStore` / `ShoppingList.unassignStore` を追加。
   `assertActive` を通さない理由を JSDoc に明記。`shopping-list.test.ts` にケースを足す
3. **Domain**: 3 つのリポジトリインターフェースにメソッドを追加（JSDoc 必須）
4. **Infrastructure**: 3 メソッドを実装し、PGlite テストを追加
5. **Application**: 新規エラー 2 件と `GetStoreUsageUseCase` を作成、`index.ts` を更新
6. **Application**: `CreateStoreUseCase` に上限・同名チェックを追加（上限を先に判定）
7. **Application**: `DeleteStoreUseCase` をカスケード 3 段へ置き換え、`StoreInUseError` を削除
8. **Application**: `store-use-cases.test.ts` を更新（`StoreInUseError` ケースを差し替え）
9. **契約**: `storeUsageResponseSchema` を追加し、テストを足す
10. **Presentation**: `GET /api/stores/:id/usage` ルートを追加
11. **Presentation**: `price-record-form.tsx` の UI（上限無効化・同名警告・件数ダイアログ）
12. 品質ゲート → コミット

### フェーズ B

13. `package-size-example.ts` と `.node.test.ts` を作成
14. `price-record-form.tsx` のプレースホルダとエラーメッセージを差し替え、テストを更新
15. 品質ゲート → コミット

### フェーズ C

16. `loading.tsx` 6 件を作成（既存 `skeleton.tsx` / `list-skeleton.tsx` を再利用）
17. `subset-fonts.mjs` を作成。区点 → Shift_JIS の変換式を `亜` = `0x889F` で自己検証させる
18. `pnpm --filter @cookpit/web add -D subset-font` を実行し、スクリプトを走らせて 3 本生成
19. `globals.css` に `@font-face` を追加、`layout.tsx` の import を削除
20. 生成サイズを実測して設計書の見込みと突き合わせる
21. 品質ゲート → 実画面確認 → コミット

## テスト計画

[docs/tests/store-limit-and-render-performance.md](../tests/store-limit-and-render-performance.md) を正典とする。

## リスク

| リスク                                                  | 緩和                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| `StoreInUseError` 削除の参照漏れで型エラー              | `grep -r StoreInUseError` で全参照を洗ってから削除           |
| `findAllByStore` が completed リストを取り落とす        | PGlite テストで completed を含むケースを明示的に用意         |
| カスケードの順序を誤ると FK `restrict` で 500           | UseCase テストで呼び出し順序を検証（スパイの呼び出し順）     |
| サブセット生成が第一水準を取りこぼす                    | 変換式を既知値で assert。生成後にグリフ数を出力して目視確認  |
| `subset-font` の追加でインストール時間・CI 時間が伸びる | devDependencies に限定。生成物はコミットしビルドで走らせない |

## ロールバック

- フェーズ A: ADR-0013 §Rollback の手順に従う（**削除された価格記録は復元不可**）
- フェーズ B: `price-record-form.tsx` の 2 行を元に戻し、新規 util を削除
- フェーズ C: `loading.tsx` 6 件を削除、`globals.css` の `@font-face` を外して
  `layout.tsx` の `@fontsource` import 3 行を復活

## ドキュメント更新対象

| ドキュメント                                        | 更新内容                                   |
| --------------------------------------------------- | ------------------------------------------ |
| `docs/decisions/ADR-0012-*.md`                      | superseded を記載（済）                    |
| `docs/designs/store-master.md`                      | 上限・同名禁止・カスケード削除への追従     |
| `docs/designs/store-delete-and-unit-price-basis.md` | 削除方針が ADR-0013 で変わった旨を追記     |
| `docs/04-domain-model.md`                           | Store 集約の不変条件（上限・一意名）を追記 |
| `logs/2026-07-27.md`                                | 作業ログ                                   |
