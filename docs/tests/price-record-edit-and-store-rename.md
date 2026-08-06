# 試験計画: price-record-edit-and-store-rename

- 作成日: 2026-08-05
- 前提となる設計書: `docs/designs/price-record-edit-and-store-rename.md` /
  `docs/designs/price-record-edit-and-store-rename.contract.md`
- 前提となる要件書: `docs/requirements/price-record-edit-and-store-rename.md`
- 関連 ADR: `docs/decisions/ADR-0015-store-rename-for-typo-correction.md`
- レベル: L3（Domain / Application / api-contract / Presentation 全層。Infrastructure は変更なし）
- 本タスクの実装コードはまだ存在しない（`Product.updatePriceRecord()` / `Store.rename()` /
  `UpdatePriceRecordUseCase` / `RenameStoreUseCase` / `updatePriceRecordSchema` /
  `renameStoreSchema` / `PUT` ルート 2 本 / `PriceRecordEditDialog` / `StoreRenameDialog` は
  すべて新設）。本書は実装着手前の試験計画であり、全観点が「未実装」を前提とする。

## 試験種別

- **単体試験**: Domain（`Product.updatePriceRecord()` / `Store.rename()`）、Application
  （`UpdatePriceRecordUseCase` / `RenameStoreUseCase`）、api-contract（Zod スキーマ）。
  外部 I/O を持たないインメモリ Repository / 純粋関数レベルで完結させる。
- **結合試験**: Presentation 層の Hono ルート（`app.request()` によるインプロセス HTTP、UseCase は
  `vi.mock` でスタブ）、RTL コンポーネントテスト（`PriceRecordEditDialog` / `StoreRenameDialog` /
  `ProductDetailClient` / `PriceRecordForm` の結線）。
- Infrastructure は**変更なし**。新規テストは作らず、既存 `IR-P-06` / `IR-P-08`
  （`packages/infrastructure/tests/repositories/drizzle-product.repository.test.ts`）が
  `Product.updatePriceRecord()` 経由の `save()` 更新経路を実質的にカバーしていることを
  実装時に確認する（§7 参照）。店舗名の update-via-save() には既存カバレッジの薄い箇所があり、
  追加を提案する（§7）。

---

## 1. 要件書観点対応表

要件定義書の正常系 N-xx・異常系 E-xx・境界条件 B-xx を正として、全観点が試験計画に反映されて
いるかを対応させる。「対象外」は要件書自体が UI 導線のみで自動テスト対象外としている項目。

| 要件 ID | 内容（要約）                                                                     | 対応する試験観点                                            |
| ------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| N-01    | 店舗のみ変更 → 店舗表示変更・単価再計算                                          | A-UPU-01, PDC-10, MB-05                                     |
| N-02    | 価格のみ変更 → 価格・単価更新                                                    | A-UPU-02                                                    |
| N-03    | 内容量のみ変更 → 内容量・単価更新（単位変更を含む）                              | A-UPU-03, A-UPU-05〜08, MB-03                               |
| N-04    | 記録日時が編集前後で同じ値のまま                                                 | D-PUR-04, A-UPU-04（critical）                              |
| N-05    | 編集後、最安店舗・グラフ・買い物リスト単価比較が再計算される                     | D-PUR-11, D-PUR-12, A-UPU-16, PC-EDIT-01, PC-EDIT-02, MB-05 |
| N-06    | 店舗名編集後、一覧・プルダウン・価格記録の表示が新名になる                       | A-RSU-01, PRF-17, MB-05                                     |
| N-07    | 正規化後に異なる名前（大文字小文字違い等）へ変更でき、同名エラーにならない       | A-RSU-03, A-RSU-04, A-RSU-06, SRD-09, WH-S-13               |
| N-08    | 同じ文字列のまま保存しても自分自身との重複で拒否されない（冪等）                 | A-RSU-02, D-SRN-06, SRD-08, WH-S-12                         |
| E-01    | 存在しない商品 ID → 404（`ProductNotFoundError`）                                | A-UPU-09, WH-P-10                                           |
| E-02    | 存在しない・削除済みの価格記録 ID → 404（`PriceRecordNotFoundError`）            | A-UPU-10, WH-P-11, PRED-05                                  |
| E-03    | 存在しない店舗 ID → 404（`StoreNotFoundError`）                                  | A-UPU-11, WH-P-12, PRED-06                                  |
| E-04    | 価格 0 以下・内容量 0 以下 → 400（Zod）                                          | A-UPU-12, A-UPU-13, Z-UPR-03〜06, WH-P-13                   |
| E-05    | 存在しない店舗 ID（リネーム） → 404（`StoreNotFoundError`）                      | A-RSU-08, WH-S-08, SRD-10                                   |
| E-06    | 正規化後、自分以外の既存店舗と一致 → 422（`DuplicateStoreNameError`）            | A-RSU-05, A-RSU-07, WH-S-09, SRD-11                         |
| E-07    | 空文字列・空白のみ・256 文字以上 → 400（Zod）                                    | Z-RSN-02, Z-RSN-04, WH-S-10, SRD-12                         |
| E-08    | 価格記録編集で通信エラー → エラー表示・値保持                                    | PRED-08, PRED-11, PRED-12                                   |
| E-09    | 店舗名編集で通信エラー → エラー表示・値保持                                      | SRD-13                                                      |
| E-10    | 「最近の記録」に出ない 6 件目以降は編集の導線が無い                              | PDC-11, MB-02（=B-05 と同一事象）                           |
| B-01    | 価格：1 円以上の整数                                                             | A-UPU-14（下限 1 円）, Z-UPR-03/04                          |
| B-02    | 内容量：0 より大きい数値                                                         | A-UPU-13, D-PUR-07                                          |
| B-03    | 店舗名：空白のみ不可・255 文字以内                                               | D-SRN-02, D-SRN-03, Z-RSN-02〜05, SRD-12                    |
| B-04    | 同名判定は `normalizeStoreName()` 後の完全一致。大文字小文字は区別               | A-RSU-03〜07                                                |
| B-05    | 編集対象は「最近の記録」直近 5 件のみ                                            | PDC-11, MB-02                                               |
| B-06    | `observedAt`・`id` は不変・入力欄も出さない                                      | D-PUR-04, A-UPU-04, PRED-10                                 |
| B-07    | リネームは店舗マスタ上限件数に影響しない                                         | A-RSU-10                                                    |
| B-08    | `priceRecordCount` が 0 件でも編集は成功する（警告有無に関わらず操作は妨げない） | SRD-04, SRD-05, §11 設計確認事項                            |

対象外（理由付き）: 無し。要件書の全 ID が上表に反映されている。

---

## 2. メソッド網羅チェック表

実装コードの現状（未実装）と設計書の記述から列挙した、本タスクで新設・変更される全 public
API と対応する試験観点。

### 2-1. Domain

| クラス                                                | メソッド                                        | 変更種別 | 対応する試験観点 No |
| ----------------------------------------------------- | ----------------------------------------------- | -------- | ------------------- |
| `Product`（`packages/domain/src/product/product.ts`） | `updatePriceRecord(priceRecordId, props): void` | 新設     | D-PUR-01〜D-PUR-12  |
| `Store`（`packages/domain/src/shared/store.ts`）      | `rename(name: string): void`                    | 新設     | D-SRN-01〜D-SRN-06  |

既存 public メソッド（`Product.create/reconstruct/update/recordPrice/removePriceRecord/latestPriceAt/latestPriceRecordAt/cheapestStoreAt/averagePrice/isPriceLow`、`Store.create/reconstruct`、各ゲッター）は
本タスクで変更しない。既存テスト（`packages/domain/tests/product/product.test.ts` の P1〜P22・
PRR-01〜06、`packages/domain/tests/shared/store.test.ts` の S1〜S5）が回帰観点として引き続き
有効（§10 回帰試験範囲）。

### 2-2. Application

| クラス                             | メソッド                                                         | 変更種別 | 対応する試験観点 No      |
| ---------------------------------- | ---------------------------------------------------------------- | -------- | ------------------------ |
| `UpdatePriceRecordUseCase`（新設） | `constructor(productRepository, storeRepository)`                | 新設     | ─（DI は各テストで担保） |
| 同上                               | `execute(input: UpdatePriceRecordInputDto): Promise<ProductDto>` | 新設     | A-UPU-01〜A-UPU-17       |
| `RenameStoreUseCase`（新設）       | `constructor(storeRepository)`                                   | 新設     | ─                        |
| 同上                               | `execute(input: RenameStoreInputDto): Promise<StoreDto>`         | 新設     | A-RSU-01〜A-RSU-10       |

DTO 追加（`UpdatePriceRecordInputDto` / `RenameStoreInputDto`）は型のみのため個別のテスト観点は
持たず、上記 UseCase テストの入力型として間接確認する。

### 2-3. api-contract

| スキーマ                                              | 変更種別 | 対応する試験観点 No |
| ----------------------------------------------------- | -------- | ------------------- |
| `updatePriceRecordSchema`（`product.schema.ts` 新設） | 新設     | Z-UPR-01〜Z-UPR-08  |
| `renameStoreSchema`（`store.schema.ts` 新設）         | 新設     | Z-RSN-01〜Z-RSN-05  |

### 2-4. Presentation（apps/web）

| コンポーネント                                                                    | 変更種別                                                     | 対応する試験観点 No                                     |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| `PUT /api/products/:id/price-records/:priceRecordId`（`routes/products.ts` 追加） | 新設                                                         | WH-P-09〜WH-P-15                                        |
| `PUT /api/stores/:id`（`routes/stores.ts` 追加）                                  | 新設                                                         | WH-S-07〜WH-S-13                                        |
| `PriceRecordEditDialog`（新設ファイル）                                           | 新設                                                         | PRED-01〜PRED-12                                        |
| `StoreRenameDialog`（新設ファイル）                                               | 新設                                                         | SRD-01〜SRD-13                                          |
| `ProductDetailClient`（編集アイコン追加）                                         | 変更                                                         | PDC-09〜PDC-12                                          |
| `PriceRecordForm`（リネームアイコン追加）                                         | 変更                                                         | PRF-15〜PRF-17                                          |
| `apps/web/src/app/shopping-lists/_utils/price-comparison.ts`                      | **変更なし**（呼び出し元の `ProductDto` の中身が変わるだけ） | PC-EDIT-01, PC-EDIT-02（回帰 + 編集シナリオの追加確認） |

---

## 3. Domain 単体試験観点

テストランナー: Vitest（`packages/domain/tests/product/product.test.ts` /
`packages/domain/tests/shared/store.test.ts` に追記）。

### 3-1. `Product.updatePriceRecord()`

| #        | 観点                                                          | 前提                                                                                      | 操作                                                                                                       | 期待結果                                                                                                                                                                                                                             | 分類                 |
| -------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| D-PUR-01 | 店舗のみ変更                                                  | `store-1` の記録を 1 件持つ商品                                                           | `updatePriceRecord(id, { storeId: store-2, price: 元と同じ, unitPrice: 元と同じ, packageSize: 元と同じ })` | 該当記録の `storeId` が `store-2` に変わり、`price`/`unitPrice`/`packageSize` は変化しない                                                                                                                                           | 正常                 |
| D-PUR-02 | 価格のみ変更                                                  | 同上                                                                                      | `price` だけ異なる値で呼ぶ                                                                                 | `price` が新しい値、`storeId`/`packageSize` は変化しない                                                                                                                                                                             | 正常                 |
| D-PUR-03 | 内容量のみ変更                                                | 同上                                                                                      | `packageSize` だけ異なる値で呼ぶ                                                                           | `packageSize` が新しい値、`storeId`/`price` は変化しない                                                                                                                                                                             | 正常                 |
| D-PUR-04 | **`id` と `observedAt` が編集前後で同一値である（critical）** | `observedAt = 2026-06-01T10:00:00.000Z` の記録                                            | 店舗・価格・内容量をすべて変更して `updatePriceRecord()` を呼ぶ                                            | 更新後の記録の `id.value` が呼び出し前と完全一致、`observedAt.toISOString()` が `'2026-06-01T10:00:00.000Z'` のまま（編集前の値と `toISOString()` で直接比較する。値が変わっていないことを **PASS 基準として明示的にアサートする**） | 正常・防御性         |
| D-PUR-05 | 存在しない ID                                                 | 記録 1 件を持つ商品                                                                       | 存在しない `priceRecordId` で呼ぶ                                                                          | `Error('Price record not found: <id>')` が throw され、`priceHistory` は変化しない                                                                                                                                                   | 異常                 |
| D-PUR-06 | price が 0（境界値・B-01 下限外）                             | 同上                                                                                      | `price: Money.of(0, 'JPY')` で呼ぶ                                                                         | `Error('Price record price must be positive')`（`PriceRecord.create()` 由来）が throw され、対象記録は変化しない                                                                                                                     | 異常・境界           |
| D-PUR-07 | packageSize が 0（境界値・B-02）                              | 同上                                                                                      | `packageSize: Quantity.of(0, 'g')` で呼ぶ                                                                  | `Error('Price record package size must be positive')` が throw され、対象記録は変化しない                                                                                                                                            | 異常・境界           |
| D-PUR-08 | 副作用: `updatedAt` が進む                                    | 任意の商品                                                                                | `updatePriceRecord()` を呼ぶ前後で `product.updatedAt` を比較                                              | 呼び出し後の `updatedAt` が呼び出し前以上（`touch()` が実行される）                                                                                                                                                                  | 防御性（副作用）     |
| D-PUR-09 | 防御的コピー                                                  | `updatePriceRecord()` 実行後の商品                                                        | `product.priceHistory.push(...)` で取得した配列を外部から変更する                                          | 再度 `product.priceHistory` を取得すると push した要素が含まれない（内部状態が影響を受けない）                                                                                                                                       | 防御性               |
| D-PUR-10 | 不変条件: 対象以外の記録は変化しない                          | 2 件の記録（`record-1`, `record-2`）を持つ商品                                            | `record-1` だけを `updatePriceRecord()` で編集する                                                         | `record-2` の `id`/`storeId`/`price`/`observedAt` がすべて編集前と一致する                                                                                                                                                           | 防御性・データ整合性 |
| D-PUR-11 | N-05: 編集で同一店舗の記録が複数になるケース                  | `store-A`（`observedAt=T1`）と `store-B`（`observedAt=T2`, `T2 > T1`）の 2 記録を持つ商品 | `store-B` の記録を `updatePriceRecord()` で `storeId: store-A` に変更する                                  | `cheapestStoreAt(at)` と `latestPriceRecordAt(store-A)` がどちらも `observedAt` の新しい方（元 `store-B` だった記録）を採用し、`store-A` の記録は 1 件分の候補としてのみ扱われる（2 件が別々にカウントされない）                     | 正常・データ整合性   |
| D-PUR-12 | N-05: 編集で店舗の記録が無くなるケース                        | `store-A` の記録 1 件のみを持つ商品                                                       | その記録を `updatePriceRecord()` で `storeId: store-B` に変更する                                          | `cheapestStoreAt(at)` が `store-B` を返し、`latestPriceRecordAt(store-A)` は `null` を返す（`store-A` は候補から完全に外れる）                                                                                                       | 正常・データ整合性   |

### 3-2. `Store.rename()`

| #        | 観点                                                                   | 前提                                          | 操作                     | 期待結果                                                                                                                            | 分類               |
| -------- | ---------------------------------------------------------------------- | --------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| D-SRN-01 | 正常系: 名前が差し替わる                                               | `name: '業務スーパ'` の店舗                   | `rename('業務スーパー')` | `store.name === '業務スーパー'`                                                                                                     | 正常               |
| D-SRN-02 | 異常系: 空文字を拒否                                                   | 任意の店舗                                    | `rename('')`             | `Error('Store name is required')` が throw され、`name` は変化しない                                                                | 異常・境界（B-03） |
| D-SRN-03 | 異常系: 空白のみを拒否                                                 | 同上                                          | `rename('   ')`          | `Error('Store name is required')` が throw され、`name` は変化しない                                                                | 異常・境界（B-03） |
| D-SRN-04 | 防御性・不変条件: `id` は不変                                          | 任意の店舗                                    | `rename('新名前')`       | `store.id.value` が呼び出し前と一致                                                                                                 | 防御性             |
| D-SRN-05 | 防御性・不変条件: `createdAt` は不変（`touch()` 相当が無いことの確認） | `createdAt = 2026-01-01T00:00:00.000Z` の店舗 | `rename('新名前')`       | `store.createdAt.toISOString()` が `'2026-01-01T00:00:00.000Z'` のまま                                                              | 防御性             |
| D-SRN-06 | 冪等: 同じ名前で `rename()` を呼んでも例外を投げない                   | `name: 'ライフ'` の店舗                       | `rename('ライフ')`       | 例外を投げず成功する（同名禁止の集合制約は `RenameStoreUseCase` の責務であり、`Store.rename()` 単体は自分自身との比較を意識しない） | 正常・冪等性       |

---

## 4. Application 単体試験観点

テストランナー: Vitest（`packages/application/tests/product/product-use-cases.test.ts` /
`packages/application/tests/store/store-use-cases.test.ts` に追記。既存の
`InMemoryProductRepository` / `InMemoryStoreRepository` を再利用する）。

### 4-1. `UpdatePriceRecordUseCase.execute()`

| #        | 観点                                                                | 前提                                                            | 操作                                                                                                               | 期待結果                                                                                                                                                                                                                                                                     | 分類               |
| -------- | ------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| A-UPU-01 | N-01: 店舗のみ変更                                                  | `store-a` の記録を持つ商品、`store-b` を追加登録                | `storeId: 'store-b'` のみ変更して `execute()`                                                                      | 戻り値 `ProductDto.priceHistory[0].storeId === 'store-b'`、`storeName` が `store-b` の登録名に一致、`priceAmount`/`packageSizeValue` は不変                                                                                                                                  | 正常               |
| A-UPU-02 | N-02: 価格のみ変更                                                  | 同上                                                            | `priceAmount` のみ変更                                                                                             | `priceAmount` が新しい値、`unitPriceAmount` が新しい価格から再計算された値、`storeId`/`packageSizeValue` は不変                                                                                                                                                              | 正常               |
| A-UPU-03 | N-03: 内容量のみ変更（単位は同じ）                                  | 同上                                                            | `packageSizeValue` のみ変更（単位は元と同じ `個`）                                                                 | `packageSizeValue` が新しい値、`unitPriceAmount` が再計算された値                                                                                                                                                                                                            | 正常               |
| A-UPU-04 | **critical: `observedAt` と `id` が編集前後で同一値（N-04・B-06）** | `id`・`observedAt` を控えておいた記録を持つ商品                 | 店舗・価格・内容量をすべて変更して `execute()`                                                                     | 戻り値の該当 `PriceRecordDto.id` が編集前の `id` と完全一致、`observedAt` が編集前の `observedAt` 文字列と完全一致（**両方を直接 `toBe` でアサートする**。「維持されているはず」という間接確認では終わらせない）                                                             | 正常・critical     |
| A-UPU-05 | **critical: 単位換算 kg→g 方向**                                    | `price: 1000円, packageSize: 1kg`（元の単価 100円/100g）の記録  | `packageSizeValue: 500, packageSizeUnit: 'g'`（`priceAmount` は 1000 のまま）に変更                                | `unitPriceAmount === 200`（`1000 / 500 * 100`）。100 や 20000 等、桁がズレた値になっていないことを確認する                                                                                                                                                                   | 正常・critical     |
| A-UPU-06 | **critical: 単位換算 g→kg 方向**                                    | `price: 200円, packageSize: 200g`（元の単価 100円/100g）の記録  | `packageSizeValue: 2, packageSizeUnit: 'kg'`（`priceAmount` は 200 のまま）に変更                                  | `unitPriceAmount === 10`（`200 / 2000 * 100`）。1000 倍・1000 分の 1 のズレが起きていないことを確認する                                                                                                                                                                      | 正常・critical     |
| A-UPU-07 | **critical: 単位換算 l→ml 方向**                                    | `price: 180円, packageSize: 2l`（元の単価 9円/100ml）の記録     | `packageSizeValue: 900, packageSizeUnit: 'ml'`（`priceAmount` は 180 のまま）に変更                                | `unitPriceAmount === 20`（`180 / 900 * 100`）                                                                                                                                                                                                                                | 正常・critical     |
| A-UPU-08 | **critical: 単位換算 ml→l 方向**                                    | `price: 250円, packageSize: 500ml`（元の単価 50円/100ml）の記録 | `packageSizeValue: 2.5, packageSizeUnit: 'l'`（`priceAmount` は 250 のまま）に変更                                 | `unitPriceAmount === 10`（`250 / 2500 * 100`）                                                                                                                                                                                                                               | 正常・critical     |
| A-UPU-09 | E-01: 商品が存在しない                                              | 空の `productRepository`                                        | 存在しない `productId` で `execute()`                                                                              | `ProductNotFoundError` が throw され、`productRepository.saveCount === 0`                                                                                                                                                                                                    | 異常               |
| A-UPU-10 | E-02: 価格記録が存在しない                                          | 商品はあるが対象 `priceRecordId` の記録が無い                   | 存在しない `priceRecordId` で `execute()`                                                                          | `PriceRecordNotFoundError` が throw され、`saveCount === 0`                                                                                                                                                                                                                  | 異常               |
| A-UPU-11 | E-03: 店舗が存在しない                                              | 商品・記録はあるが `storeId` に対応する店舗が無い               | 存在しない `storeId` で `execute()`                                                                                | `StoreNotFoundError` が throw され、`saveCount === 0`                                                                                                                                                                                                                        | 異常               |
| A-UPU-12 | E-04/B-01: price が 0 以下                                          | 商品・店舗が存在                                                | `priceAmount: 0` および `priceAmount: -1` で `execute()`（`it.each`）                                              | いずれも例外が throw され、`saveCount === 0`                                                                                                                                                                                                                                 | 異常・境界         |
| A-UPU-13 | E-04/B-02: packageSize が 0 以下                                    | 同上                                                            | `packageSizeValue: 0` および `packageSizeValue: -1` で `execute()`（`it.each`）                                    | いずれも例外が throw され、`saveCount === 0`                                                                                                                                                                                                                                 | 異常・境界         |
| A-UPU-14 | B-01: price が 1 円（下限）                                         | 同上                                                            | `priceAmount: 1` で `execute()`                                                                                    | 例外を投げず成功し、`priceAmount === 1` で保存される                                                                                                                                                                                                                         | 境界               |
| A-UPU-15 | 冪等性（契約§6-1）                                                  | 商品・店舗が存在                                                | 同一入力で `execute()` を 2 回連続で呼ぶ                                                                           | 2 回とも成功し、戻り値の該当 `PriceRecordDto`（`id`/`storeId`/`priceAmount`/`unitPriceAmount`/`packageSizeValue`/`packageSizeUnit`/`observedAt`）が完全一致する。`ProductDto.updatedAt` は 2 回目の方が 1 回目以上（**同一であることをアサートしない**。差異を許容する契約） | 冪等性             |
| A-UPU-16 | N-05統合: 編集後、最安店舗が再計算される                            | `store-a`（安い）と `store-b`（高い）の記録を持つ商品           | `store-b` の記録の `priceAmount` を `store-a` より安い値に編集し、`GetCheapestStoreUseCase.execute()` を続けて呼ぶ | 最安店舗が `store-b` に変わる（都度計算であり、キャッシュされた古い結果が返らないことを確認する）                                                                                                                                                                            | 正常・データ整合性 |
| A-UPU-17 | データ整合性: 戻り値の `storeName` が編集後の `storeId` に対応する  | `store-a`（名前「西友」）から `store-b`（名前「ライフ」）へ編集 | `execute()`                                                                                                        | 戻り値の該当 `PriceRecordDto.storeName === 'ライフ'`（編集前の「西友」ではない）                                                                                                                                                                                             | データ整合性       |

### 4-2. `RenameStoreUseCase.execute()`

| #        | 観点                                               | 前提                                                                 | 操作                                            | 期待結果                                                                                                                                             | 分類               |
| -------- | -------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| A-RSU-01 | 正常系: 名前が変わる                               | `id-1`（名前「業務スーパ」）を保存済み                               | `execute({ id: 'id-1', name: '業務スーパー' })` | 戻り値 `dto.name === '業務スーパー'`、`saveCount === 1`                                                                                              | 正常               |
| A-RSU-02 | N-08: 同じ文字列のまま保存し直しても成功する       | `id-1`（名前「ライフ」）を保存済み                                   | `execute({ id: 'id-1', name: 'ライフ' })`       | 例外を投げず成功し、`dto.name === 'ライフ'`（自分自身との比較で衝突と判定されない）                                                                  | 正常・冪等性       |
| A-RSU-03 | N-07/B-04: 大文字小文字だけ変える                  | `id-1`（名前「Life」）を保存済み                                     | `execute({ id: 'id-1', name: 'life' })`         | 例外を投げず成功し、`dto.name === 'life'`（`normalizeStoreName` は大文字小文字を区別しないため、そもそも自己ヒットにならず通常のリネームとして通る） | 正常・境界         |
| A-RSU-04 | 自己衝突除外: 全角/半角違いを自分自身に適用        | `id-1`（名前「業務スーパー」）を保存済み                             | `execute({ id: 'id-1', name: '業務ｽｰﾊﾟｰ' })`    | 例外を投げず成功し、`dto.name === '業務ｽｰﾊﾟｰ'`（正規化後は自分自身とのみ一致するため衝突としない）                                                   | 正常               |
| A-RSU-05 | E-06: 全角/半角違いが自分以外の既存店舗と一致      | `id-1`（名前「業務スーパー」）、`id-2`（名前「コンビニ」）を保存済み | `execute({ id: 'id-2', name: '業務ｽｰﾊﾟｰ' })`    | `DuplicateStoreNameError` が throw され、`saveCount === 0`                                                                                           | 異常               |
| A-RSU-06 | 自己衝突除外: 前後空白のみの違いを自分自身に適用   | `id-1`（名前「ライフ」）を保存済み                                   | `execute({ id: 'id-1', name: '  ライフ  ' })`   | 例外を投げず成功し、`dto.name === '  ライフ  '`（原文をそのまま保存する。トリムしない）                                                              | 正常               |
| A-RSU-07 | E-06: 前後空白のみの違いが自分以外の既存店舗と一致 | `id-1`（名前「ライフ」）、`id-2`（名前「コンビニ」）を保存済み       | `execute({ id: 'id-2', name: '  ライフ  ' })`   | `DuplicateStoreNameError` が throw され、`saveCount === 0`                                                                                           | 異常               |
| A-RSU-08 | E-05: 店舗が存在しない                             | 空の `storeRepository`                                               | 存在しない `id` で `execute()`                  | `StoreNotFoundError` が throw され、`saveCount === 0`                                                                                                | 異常               |
| A-RSU-09 | 冪等性（契約§6-2）                                 | `id-1`（名前「西友」）を保存済み                                     | 同一 `name` で `execute()` を 2 回連続で呼ぶ    | 2 回とも成功し、戻り値の `StoreDto`（`id`/`name`/`createdAt`）が完全一致する                                                                         | 冪等性             |
| A-RSU-10 | B-07: リネームは店舗件数に影響しない               | 店舗 3 件（上限）を保存済み                                          | いずれか 1 件を `execute()` でリネーム          | `storeRepository.findAll().length === 3` のまま（増減しない）                                                                                        | 境界・データ整合性 |

---

## 5. api-contract 契約試験観点

テストランナー: Vitest（`packages/api-contract/tests/product.schema.test.ts` /
`store.schema.test.ts` に追記。実行環境は整備済み — `packages/api-contract/vitest.config.ts`）。

### 5-1. `updatePriceRecordSchema`

| #           | 観点                                                       | 操作                                                                                           | 期待結果                                                                                                                                                      | 分類         |
| ----------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Z-UPR-01    | 正常な入力を受け入れる                                     | `{storeId: <uuid>, priceAmount: 148, packageSizeValue: 1, packageSizeUnit: '個'}` を `parse()` | 成功し値がそのまま返る                                                                                                                                        | 正常         |
| Z-UPR-02    | 不正な storeId を reject                                   | `storeId: 'not-a-uuid'`                                                                        | `ZodError` が throw される                                                                                                                                    | 異常         |
| Z-UPR-03/04 | priceAmount 0/負数を reject                                | `priceAmount: 0` / `-1`（`it.each`）                                                           | いずれも `ZodError`                                                                                                                                           | 境界         |
| Z-UPR-05/06 | packageSizeValue 0/負数を reject                           | `packageSizeValue: 0` / `-1`（`it.each`）                                                      | いずれも `ZodError`                                                                                                                                           | 境界         |
| Z-UPR-07    | packageSizeUnit の自由入力を受け入れ、空文字は reject      | `packageSizeUnit: '箱'` は成功、`''` は失敗                                                    | 成功/失敗                                                                                                                                                     | 正常・境界   |
| Z-UPR-08    | `recordPriceSchema` とは独立したスキーマである（退行防止） | `updatePriceRecordSchema` と `recordPriceSchema` の `.shape` キー集合を比較                    | 現時点では一致するが、片方だけを変更しても他方のテストが影響を受けないことをコメントで明示する（§2.1 の複製方針が誤って同一参照に統合されないことの記録目的） | 回帰（任意） |

### 5-2. `renameStoreSchema`

| #        | 観点                                          | 操作                        | 期待結果            | 分類       |
| -------- | --------------------------------------------- | --------------------------- | ------------------- | ---------- |
| Z-RSN-01 | 正常な name を受け入れる                      | `{name: 'スーパーA'}`       | 成功                | 正常       |
| Z-RSN-02 | 空白のみの name を reject（E-07/B-03）        | `''` / `'   '`（`it.each`） | いずれも `ZodError` | 異常・境界 |
| Z-RSN-03 | 255 文字の name を受け入れる（B-03 上限）     | `'あ'.repeat(255)`          | 成功                | 境界       |
| Z-RSN-04 | 256 文字の name を reject（E-07/B-03 上限超） | `'あ'.repeat(256)`          | `ZodError`          | 異常・境界 |
| Z-RSN-05 | name キーの省略を reject                      | `{}`                        | `ZodError`          | 異常       |

### 5-3. 型の往復確認（コンパイル時。ランタイムテスト不要）

`UpdatePriceRecordBody` が `UpdatePriceRecordInputDto` の 4 フィールド（`storeId` /
`priceAmount` / `packageSizeValue` / `packageSizeUnit`）と構造的に一致すること、
`RenameStoreBody` が `RenameStoreInputDto` の `name` フィールドと一致することは
`pnpm type-check` で確認する（契約設計書 §9.4）。

---

## 6. Presentation — Hono ルート試験観点

テストランナー: Vitest（node project）。ファイル:
`apps/web/tests/server/routes/products.test.ts` / `stores.test.ts`（既存に追記。
UseCase は `vi.mock('@cookpit/application', ...)` でスタブする既存パターンを踏襲）。

### 6-1. `PUT /api/products/:id/price-records/:priceRecordId`（`products.test.ts` 追記）

| #       | 観点                                | 前提                                                             | 操作                                                                      | 期待結果                                                                                                                                                     | 分類               |
| ------- | ----------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| WH-P-09 | 200: UseCase の返却値をそのまま返す | `UpdatePriceRecordUseCase.execute` が `ProductDto` を解決        | `PUT /api/products/:id/price-records/:priceRecordId` に正常なボディで送信 | `200`、レスポンスボディが `ProductDto` と一致、`execute` が `{productId, priceRecordId, storeId, priceAmount, packageSizeValue, packageSizeUnit}` で呼ばれる | 正常               |
| WH-P-10 | 404: `ProductNotFoundError`         | `execute` が `ProductNotFoundError` を reject                    | 同上                                                                      | `404`、`{ error: 'Product not found: <id>' }`                                                                                                                | 異常（E-01）       |
| WH-P-11 | 404: `PriceRecordNotFoundError`     | `execute` が `PriceRecordNotFoundError` を reject                | 同上                                                                      | `404`、`{ error: 'PriceRecord not found: <id>' }`                                                                                                            | 異常（E-02）       |
| WH-P-12 | 404: `StoreNotFoundError`           | `execute` が `StoreNotFoundError` を reject                      | 同上                                                                      | `404`、`{ error: 'Store not found: <id>' }`                                                                                                                  | 異常（E-03）       |
| WH-P-13 | 400: Zod バリデーション             | —                                                                | `priceAmount: 0` で送信                                                   | `400`、`execute` は呼ばれない                                                                                                                                | 異常・境界（E-04） |
| WH-P-14 | 400: priceRecordId が UUID でない   | —                                                                | パスの `priceRecordId` を `'not-a-uuid'` にして送信                       | `400`、`execute` は呼ばれない                                                                                                                                | 境界               |
| WH-P-15 | 冪等性: 同一ボディで 2 回連続 PUT   | `execute` が呼ばれるたびに同じ `ProductDto` を解決するようモック | 同一ボディで 2 回連続送信                                                 | 両方とも `200`、`execute` が同一引数で 2 回呼ばれる（契約§6-1 のルーティングレベルでの疎通確認。値そのものの冪等性は §4-1 A-UPU-15 で担保）                  | 冪等性             |

### 6-2. `PUT /api/stores/:id`（`stores.test.ts` 追記）

> **採番の注記（2026-08-05 実装時に是正）**: 本節は当初 `WH-S-05` から始めていたが、
> `WH-S-05` / `WH-S-06` は先行タスクで既に使用済みだった
> （`docs/tests/store-delete-and-unit-price-basis.md` の WH-S-04〜06。うち `WH-S-06` =
> DELETE の UUID 検証は `stores.test.ts:176` に現存し、`WH-S-05` = `StoreInUseError` → 422 は
> ADR-0013 のカスケード削除化で退役済み）。同名の試験 ID が 2 つ存在すると追跡できなくなるため、
> 本節の ID を **`WH-S-07`〜`WH-S-13`** へ繰り下げた。既存 `WH-S-01`〜`WH-S-06` は変更していない。

| #       | 観点                                              | 前提                                              | 操作                                                                                                                                   | 期待結果                                                                          | 分類               |
| ------- | ------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------ |
| WH-S-07 | 200: UseCase の返却値をそのまま返す               | `RenameStoreUseCase.execute` が `StoreDto` を解決 | `PUT /api/stores/:id` に正常なボディで送信                                                                                             | `200`、レスポンスボディが `StoreDto` と一致、`execute` が `{id, name}` で呼ばれる | 正常               |
| WH-S-08 | 404: `StoreNotFoundError`                         | `execute` が `StoreNotFoundError` を reject       | 同上                                                                                                                                   | `404`、`{ error: 'Store not found: <id>' }`                                       | 異常（E-05）       |
| WH-S-09 | 422: `DuplicateStoreNameError`                    | `execute` が `DuplicateStoreNameError` を reject  | 同上                                                                                                                                   | `422`                                                                             | 異常（E-06）       |
| WH-S-10 | 400: name 空文字                                  | —                                                 | `{ name: '' }` で送信                                                                                                                  | `400`、`execute` は呼ばれない                                                     | 異常・境界（E-07） |
| WH-S-11 | 400: id が UUID でない                            | —                                                 | パスの `id` を `'not-a-uuid'` にして送信                                                                                               | `400`、`execute` は呼ばれない                                                     | 境界               |
| WH-S-12 | 冪等性（N-08）: 同一 name で 2 回連続 PUT         | `execute` が同じ `StoreDto` を解決                | 同一ボディで 2 回連続送信                                                                                                              | 両方とも `200`（422 にならない）、`execute` が同一引数で 2 回呼ばれる             | 冪等性             |
| WH-S-13 | N-07 の疎通: 大文字小文字だけ変えた name でも 200 | `execute` が `StoreDto` を解決するようモック      | `{ name: 'life' }` で送信（実際の自己衝突除外ロジックは A-RSU-03 で担保済み。ここではルーティングが 422 を誤って返さないことのみ確認） | `200`                                                                             | 正常               |

---

## 7. Infrastructure（変更なしの確認 + 提案）

| #                        | 観点                                                   | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 分類                       |
| ------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| IR-確認-01               | `Product.updatePriceRecord()` 経由の `save()` 更新経路 | 既存 `IR-P-06`（`save()` の upsert（`onConflictDoUpdate`）が既存行を上書きする）・`IR-P-08`（複数 `priceRecords` のバッチ upsert が各行を自身の値で更新する）は、`priceRecords` テーブルへ既存 `id` のまま値を差し替えて `save()` する経路をすでに検証済みであり、`Product.updatePriceRecord()` が生成する差し替え後の `Product` を `save()` した場合も同じ経路（`onConflictDoUpdate` の `excluded.*`）を通る。実装時に `IR-P-06`/`IR-P-08` のアサーションが `Product.updatePriceRecord()` を経由しても成立することをコードリーディングで確認する（新規テストは追加しない、要件どおり）。 | 回帰確認                   |
| IR-提案-01（任意・推奨） | 店舗名の update-via-save() の直接カバレッジが薄い      | `packages/infrastructure/tests/repositories/drizzle-store.repository.test.ts` の既存観点（`IR-S-01`〜`IR-S-05`）は作成・全件取得・削除・正規化検索のみで、「既存 `id` のまま `name` を変えて `save()` すると `findById()` で新しい `name` が返る」ことを直接検証するテストが無い。`RenameStoreUseCase` が依存する経路そのものなので、`IR-S-06: save() の name 更新（upsert）を検証する` の追加を提案する（前提: `id-1` を `save()` 済み → `store.rename('新名前')` 相当のインスタンスを再 `save()` → `findById('id-1').name === '新名前'`、かつ `createdAt` は不変）。                    | 提案（推奨・必須ではない） |

---

## 8. Presentation — コンポーネント試験観点（RTL）

テストランナー: Vitest（dom project、`happy-dom`）。新規ファイルは
`tests/**/*.test.tsx` の include に一致させる。

### 8-1. `PriceRecordEditDialog`（新設。`apps/web/tests/app/products/[id]/_components/price-record-edit-dialog.test.tsx`）

| #       | 観点                                                        | 前提                                                                  | 操作                         | 期待結果                                                                                                                                                                                 | 分類               |
| ------- | ----------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| PRED-01 | 初期値表示                                                  | 対象記録（店舗A・298円・3個）を props で渡してダイアログを開く        | render                       | 店舗プルダウンに店舗Aが選択済み、価格欄に `298`、内容量欄に `3個` が表示される                                                                                                           | 正常               |
| PRED-02 | 開くたびに最新の店舗一覧を取得する                          | —                                                                     | ダイアログを開く             | `GET /api/stores` が呼ばれる                                                                                                                                                             | 正常               |
| PRED-03 | 保存で PUT が正しいボディで呼ばれる                         | フォームに入力済み                                                    | 「保存」をクリック           | `PUT /api/products/:id/price-records/:priceRecordId` が `{storeId, priceAmount, packageSizeValue, packageSizeUnit}` で呼ばれる（`observedAt` を含まない）                                | 正常               |
| PRED-04 | 成功後の遷移                                                | `PUT` が 200 を返す                                                   | 保存                         | ダイアログが閉じ、`router.refresh()` が呼ばれる                                                                                                                                          | 正常               |
| PRED-05 | `PriceRecordNotFoundError`（E-02）                          | `PUT` が 404 を返す                                                   | 保存                         | 「この記録はすでに削除されています。」が表示され、ダイアログが閉じて `router.refresh()` が呼ばれる                                                                                       | 異常               |
| PRED-06 | `StoreNotFoundError`（E-03）                                | `PUT` が 404 を返す（店舗側の理由）                                   | 保存                         | 「選択した店舗が見つかりません。店舗一覧を確認してください。」が表示され、店舗一覧が再取得される（`GET /api/stores` が再度呼ばれる）                                                     | 異常               |
| PRED-07 | Zod バリデーション（E-04）                                  | `PUT` が 400 を返す                                                   | 保存                         | フィールドレベルのエラー表示（既存 `PriceRecordForm` の `FieldErrors` パターンに準拠）                                                                                                   | 異常・境界         |
| PRED-08 | 通信エラー（E-08）                                          | `PUT` が例外を投げる（`fetch` reject）                                | 保存                         | 「通信エラーが発生しました。」が表示され、**ダイアログは閉じずフォームの入力値が保持される**（価格欄・内容量欄の入力値が保存操作前と同じであることを直接アサートする）                   | 異常               |
| PRED-09 | ローディング状態                                            | 保存処理中                                                            | 保存ボタンをクリックした直後 | 保存ボタンが `disabled` になり、「保存中」等のラベルに変わる                                                                                                                             | フロントエンド固有 |
| PRED-10 | B-06 の UI 確認: 記録日時の入力欄が無い                     | ダイアログを開く                                                      | render                       | `observedAt`（記録日時）を入力するフォーム要素が存在しない                                                                                                                               | 境界（UI）         |
| PRED-11 | 店舗一覧の取得失敗時の縮退（レビュー S-1 で追加）           | `GET /api/stores` が例外を投げる／`!response.ok` を返す（2 パターン） | ダイアログを開く             | 「店舗の取得に失敗しました。」が表示され、**かつ編集対象の記録が指す店舗が選択済みとして表示される**（`storeId` に値があるのに選択肢が無く「店舗を選択」と表示される状態にならないこと） | 異常・防御性       |
| PRED-12 | 店舗一覧の取得に失敗しても保存できる（レビュー S-1 で追加） | `GET /api/stores` が例外を投げる                                      | 価格を変更して保存           | `PUT` が記録の元の `storeId` を含む正しいボディで呼ばれる（補助情報の取得失敗が保存操作をブロックしない）                                                                                | 異常・防御性       |

### 8-2. `StoreRenameDialog`（新設。`apps/web/tests/app/products/[id]/_components/store-rename-dialog.test.tsx`）

| #      | 観点                                                                 | 前提                                                                 | 操作                                                  | 期待結果                                                                                                                                                                  | 分類         |
| ------ | -------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| SRD-01 | 初期値表示                                                           | 対象店舗（名前「業務スーパ」）を props で渡してダイアログを開く      | render                                                | 名前入力欄に `業務スーパ` が表示される                                                                                                                                    | 正常         |
| SRD-02 | 開いた時点で usage を取得する                                        | —                                                                    | ダイアログを開く                                      | `GET /api/stores/:id/usage` が呼ばれる                                                                                                                                    | 正常         |
| SRD-03 | 警告文の表示条件: `priceRecordCount > 0`（B-08）                     | usage が `{priceRecordCount: 5, shoppingItemCount: 0}` を返す        | ダイアログを開く                                      | 「この店舗の価格記録 5 件の表示名も変わります。違う店舗を選んでいないか確認してください。」という**件数を含む警告文がテキストとして画面に存在する**ことを直接アサートする | 正常         |
| SRD-04 | 警告文の非表示条件: `priceRecordCount === 0`（B-08）                 | usage が `{priceRecordCount: 0, shoppingItemCount: 0}` を返す        | ダイアログを開く                                      | 警告文（「この店舗の価格記録」を含むテキスト）が画面に**存在しない**ことを `queryByText` で確認する                                                                       | 正常・境界   |
| SRD-05 | usage 取得失敗時も操作を継続できる（B-08・縮退）                     | `GET /usage` が例外を投げる                                          | ダイアログを開く → 名前を変更して保存                 | 警告文は表示されないが、名前入力欄・保存ボタンは有効なまま操作でき、保存を実行すると `PUT /api/stores/:id` が呼ばれる（usage 取得失敗が保存操作をブロックしない）         | 異常・防御性 |
| SRD-06 | 保存で PUT が正しいボディで呼ばれる                                  | フォームに入力済み                                                   | 「保存」をクリック                                    | `PUT /api/stores/:id` が `{ name: <入力値> }` で呼ばれる                                                                                                                  | 正常         |
| SRD-07 | 成功後の遷移（N-06）                                                 | `PUT` が 200 を返す                                                  | 保存                                                  | ダイアログが閉じ、`PriceRecordForm` 側の店舗一覧ローカル state が新しい名前に更新され、`router.refresh()` が呼ばれる                                                      | 正常         |
| SRD-08 | N-08: 自分自身と同じ名前のまま保存できる                             | 対象店舗（名前「ライフ」）、既存店舗一覧に自分自身の「ライフ」を含む | 名前を変更せず「ライフ」のまま保存                    | クライアント側の事前ヒント（`isDuplicateStoreName`）が重複警告を出さず、保存ボタンが有効なまま送信でき、`PUT` が呼ばれる                                                  | 正常         |
| SRD-09 | N-07: 自分自身の名前を大文字小文字だけ変えても事前ヒントが警告しない | 対象店舗（名前「Life」）                                             | 「life」に変更                                        | クライアント側の事前ヒントが重複警告を出さず、保存できる                                                                                                                  | 正常・境界   |
| SRD-10 | `StoreNotFoundError`（E-05）                                         | `PUT` が 404 を返す                                                  | 保存                                                  | 「この店舗はすでに削除されています。」が表示され、ダイアログが閉じて `router.refresh()` が呼ばれる                                                                        | 異常         |
| SRD-11 | `DuplicateStoreNameError`（E-06）                                    | `PUT` が 422 を返す                                                  | 保存                                                  | 「同じ名前の店舗がすでに登録されています。」が表示される                                                                                                                  | 異常         |
| SRD-12 | Zod バリデーション（E-07）                                           | `PUT` が 400 を返す                                                  | 名前を空にして保存を試みる（またはサーバー 400 応答） | 「店舗名を入力してください。」が表示される                                                                                                                                | 異常・境界   |
| SRD-13 | 通信エラー（E-09）                                                   | `PUT` が例外を投げる                                                 | 保存                                                  | 「通信エラーが発生しました。」が表示され、名前入力欄の値が保存操作前と同じまま保持される                                                                                  | 異常         |

### 8-3. `ProductDetailClient`（既存ファイル追記。`product-detail-client.test.tsx`）

| #      | 観点                                            | 前提                                              | 操作                                       | 期待結果                                                                                                                                                                                           | 分類             |
| ------ | ----------------------------------------------- | ------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| PDC-09 | 編集アイコンの表示                              | 価格記録 1 件を持つ商品                           | render                                     | 「最近の記録」の行に、削除アイコン（ゴミ箱）の隣に編集アイコン（鉛筆）が表示される                                                                                                                 | 正常             |
| PDC-10 | 編集アイコンから `PriceRecordEditDialog` を開く | 同上                                              | 編集アイコンをクリック                     | `PriceRecordEditDialog` が該当記録を対象に開く（ダイアログのタイトルが「価格記録を編集」）                                                                                                         | 正常（N-01連携） |
| PDC-11 | **B-05/E-10: 6 件目以降は編集アイコンが出ない** | 6 件の価格記録（`observedAt` が異なる）を持つ商品 | render                                     | 「最近の記録」に表示される行数が 5、対応する編集アイコンの数も 5 である（最も古い 1 件はそもそも一覧に描画されず、編集アイコンも存在しない）ことを**行数とアイコン数の両方でカウントして確認する** | 境界             |
| PDC-12 | 編集成功後、画面が再取得される                  | 同上                                              | `PriceRecordEditDialog` での保存が成功する | `router.refresh()` が呼ばれる（価格記録一覧・最安店舗・グラフが最新化される前提の疎通確認。実際の再計算結果は Server Component 経由のため本テストの対象外）                                        | 正常             |

### 8-4. `PriceRecordForm`（既存ファイル追記。`price-record-form.test.tsx`）

| #      | 観点                                            | 前提                      | 操作                                   | 期待結果                                                                                    | 分類               |
| ------ | ----------------------------------------------- | ------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------ |
| PRF-15 | リネームアイコンの表示                          | 店舗 2 件が表示された状態 | render                                 | 店舗管理カードの各行に、削除アイコン（ゴミ箱）の隣にリネームアイコン（鉛筆）が表示される    | 正常               |
| PRF-16 | リネームアイコンから `StoreRenameDialog` を開く | 同上                      | 「店舗Aを編集」ボタンをクリック        | `StoreRenameDialog` が店舗Aを対象に開く                                                     | 正常               |
| PRF-17 | リネーム成功後のローカル state 更新（N-06）     | 店舗Aをリネーム           | `StoreRenameDialog` での保存が成功する | 店舗一覧の表示名が新しい名前に変わり、選択中だった `storeId` は変わらない（選択が外れない） | 正常・データ整合性 |

---

## 9. 買い物リスト価格比較への影響確認（`price-comparison.ts` 側）

`apps/web/src/app/shopping-lists/_utils/price-comparison.ts` 自体は**変更しない**（都度計算のため
呼び出し元の `ProductDto` の中身が変われば自動的に新しい結果になる設計。設計書 §論点3）。
既存 `apps/web/tests/app/shopping-lists/_utils/price-comparison.node.test.ts` の
「単位換算の 4 方向テスト（必須。改変禁止）」を含む既存観点は無変更のまま全件パスすることを
回帰確認する（§10 REG-02）。加えて、編集シナリオ特有の 2 件を同ファイルに追加する。

| #          | 観点                                         | 前提                                                                                                                                                                                   | 操作                                                                                    | 期待結果                                                                                                                                                              | 分類               |
| ---------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| PC-EDIT-01 | N-05: 編集で同一店舗の記録が複数になるケース | `ProductDto.priceHistory` に `store-A`（`observedAt=T1`）と、編集後に `storeId` が `store-A` になった記録（元 `store-B`、`observedAt=T2 > T1`）の 2 件を持つ `ProductDto` を組み立てる | `buildStoreUnitPriceBreakdown(product)` を呼ぶ                                          | `store-A` の内訳エントリが 1 件のみで、その `unitPriceAmount` は `observedAt` が新しい方（元 `store-B` だった記録）の値になっている（2 件が別エントリとして残らない） | 正常・データ整合性 |
| PC-EDIT-02 | N-05: 編集で店舗の記録が無くなるケース       | `store-A`（唯一の記録）の `storeId` が編集で `store-B` に変わった状態を表す `ProductDto` を組み立てる（`priceHistory` に `store-A` の記録は存在しない）                                | `buildStoreUnitPriceBreakdown(product)` / `estimateItemPriceDiff(item, product)` を呼ぶ | `store-A` がいずれの結果にも一切現れない（候補から自然に除外される）                                                                                                  | 正常・データ整合性 |

---

## 10. 回帰試験範囲

| #      | 対象                                                                                                                                                                        | 確認方法                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| REG-01 | 既存 `GET`/`POST`/`DELETE` の `products`/`stores` ルート（`WH-P-01`〜`08`、`WH-S-01`〜`04`、`WH-01`〜`06`）                                                                 | `pnpm test` を実行し全件 pass                                                                                  |
| REG-02 | `price-comparison.node.test.ts` の既存「単位換算の 4 方向テスト（必須。改変禁止）」                                                                                         | `pnpm test` を実行し全件 pass（本タスクは `price-comparison.ts` を変更しないため）                             |
| REG-03 | `product-detail-client.test.tsx` の既存 `PDC-01`〜`08`                                                                                                                      | 編集アイコン追加後もセレクタ（`/の記録を削除$/` 等）が誤爆しないことを確認しつつ全件 pass                      |
| REG-04 | `price-record-form.test.tsx` の既存 `PRF-01`〜`14`                                                                                                                          | リネームアイコン追加後もセレクタ（`◯を削除` 等）が誤爆しないことを確認しつつ全件 pass                          |
| REG-05 | Domain/Application の既存 `Product`/`Store` 関連テスト（`P1`〜`P22`、`PRR-01`〜`06`、`S1`〜`S5`、`CSU`/`DSU`/`GSU` 系、`RecordPriceUseCase`/`DeletePriceRecordUseCase` 系） | `pnpm test` を実行し全件 pass                                                                                  |
| REG-06 | 型・Lint                                                                                                                                                                    | `pnpm type-check` / `pnpm lint` が通る（`AppType` Hono RPC 型、`api-contract` の `export *` に影響が無いこと） |

---

## 11. 特性観点

- **権限**: 対象外（ADR-0003・MVP1 は認証なし。操作主体の区別・権限制御を行わない）。
- **データ整合性**: A-UPU-17（`storeName` が編集後の `storeId` に対応）、D-PUR-10〜12、
  PC-EDIT-01/02、A-RSU-10（店舗件数不変）。
- **冪等性**: A-UPU-15（`PUT /price-records` は `priceHistory` の内容がべき等・`updatedAt` のみ非べき等）、
  A-RSU-09（`PUT /stores/:id` は `StoreDto` 全体が完全にべき等）、WH-P-15、WH-S-12、SRD-08、A-RSU-02。
- **障害系（外部 I/O）**: 対象外。新規の外部 API・外部ストレージ I/O は無く、既存の DB `save()`
  upsert 経路をそのまま使う（設計書 §エラー処理）。通信エラーへの対処は「フロントエンド固有」
  区分の PRED-08・SRD-13 で扱う。
- **フロントエンド固有**: ローディング（PRED-09）、エラー表示（PRED-05〜08, SRD-10〜13）、
  楽観的更新のロールバックは対象外（設計は `router.refresh()` によるサーバー真実源方式のみで
  楽観的更新を行わない。設計書 §API 設計「なぜ ProductDto を返すか」）。
- **防御性（Domain 層）**:
  - 防御的コピー: D-PUR-09（`priceHistory` ゲッター）。
  - 不変条件: D-PUR-04（`id`/`observedAt` 維持・critical）、D-PUR-10（対象外レコード不変）、
    D-SRN-04（`id` 不変）、D-SRN-05（`createdAt` 不変）。
  - 副作用: D-PUR-08（`updatedAt` の `touch()`）。`Store` は `touch()` 相当を持たないため
    D-SRN-05 で「変化しないこと」を確認する（Product と非対称な設計であることの記録）。
  - 不正引数の伝搬: D-PUR-06（price=0）、D-PUR-07（packageSize=0）、D-SRN-02/03
    （空文字・空白のみ）。

---

## 12. 試験データ

### 12-1. 標準データ

| 用途               | 値                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 商品（編集対象）   | `id: 'product-1'`, `name: '玉ねぎ'`, `defaultUnit: '個'`                                                                                                |
| 店舗A              | `id: 'store-a'`, `name: '西友'`                                                                                                                         |
| 店舗B              | `id: 'store-b'`, `name: 'ライフ'`                                                                                                                       |
| 編集対象の価格記録 | `id: 'record-1'`, `storeId: 'store-a'`, `price: 300`, `unitPrice: 100`, `packageSize: {value: 3, unit: '個'}`, `observedAt: '2026-06-01T10:00:00.000Z'` |

### 12-2. 単位換算 4 方向のデータ（A-UPU-05〜08 と共通）

| 方向 | 編集前                                     | 編集後                               | 期待単価 |
| ---- | ------------------------------------------ | ------------------------------------ | -------- |
| kg→g | `price: 1000, packageSize: 1kg`（単価100） | `packageSize: 500g`（`price` 不変）  | `200`    |
| g→kg | `price: 200, packageSize: 200g`（単価100） | `packageSize: 2kg`（`price` 不変）   | `10`     |
| l→ml | `price: 180, packageSize: 2l`（単価9）     | `packageSize: 900ml`（`price` 不変） | `20`     |
| ml→l | `price: 250, packageSize: 500ml`（単価50） | `packageSize: 2.5l`（`price` 不変）  | `10`     |

### 12-3. 同名チェック自己衝突除外のデータ（A-RSU-03〜07、SRD-08/09）

| ケース                          | 対象店舗（id-1） | もう 1 件（id-2、存在する場合）     | 変更後の name | 期待結果 |
| ------------------------------- | ---------------- | ----------------------------------- | ------------- | -------- |
| 同一文字列（N-08）              | `ライフ`         | —                                   | `ライフ`      | 成功     |
| 大文字小文字違い（N-07）        | `Life`           | —                                   | `life`        | 成功     |
| 全角/半角違い・自己             | `業務スーパー`   | —                                   | `業務ｽｰﾊﾟｰ`   | 成功     |
| 全角/半角違い・他者衝突（E-06） | `業務スーパー`   | `コンビニ`（→ `業務ｽｰﾊﾟｰ` に変更）  | `業務ｽｰﾊﾟｰ`   | 422      |
| 前後空白違い・自己              | `ライフ`         | —                                   | `  ライフ  `  | 成功     |
| 前後空白違い・他者衝突（E-06）  | `ライフ`         | `コンビニ`（→ `  ライフ  ` に変更） | `  ライフ  `  | 422      |

### 12-4. 境界値データ

| 用途                            | 値                                                 |
| ------------------------------- | -------------------------------------------------- |
| 価格の下限（B-01）              | `priceAmount: 1`                                   |
| 価格の下限外（E-04）            | `priceAmount: 0` / `-1`                            |
| 内容量の下限外（E-04/B-02）     | `packageSizeValue: 0` / `-1`                       |
| 店舗名の上限（B-03）            | `'あ'.repeat(255)`                                 |
| 店舗名の上限超過（E-07/B-03）   | `'あ'.repeat(256)`                                 |
| 店舗名の空白のみ（E-07/B-03）   | `''` / `'   '`                                     |
| 「最近の記録」境界（B-05/E-10） | 価格記録 6 件（`observedAt` を全て異なる値にする） |

---

## 13. フロントエンド実画面確認（`manual-browser-verify`）

`apps/web` の画面変更を含むため、実装完了後に `manual-browser-verify` スキルで確認する。
各項目の PASS 基準は項目名が要求する状態をそのまま検証可能な文言で書く。

| #     | 項目                                                                                     | 前提となるテストデータ                                                                                                                                                   | PASS 基準                                                                                                                                                                                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MB-01 | 価格記録編集ダイアログが 390px 幅で崩れず初期値を表示する                                | 商品（`defaultUnit: '個'`）に価格記録 1 件（店舗A・298円・3個）をシード済み。その 1 件の編集アイコンをクリックしてダイアログを開く                                       | ダイアログを開いた時点で店舗プルダウンに店舗Aが選択済み、価格欄に `298`、内容量欄に `3個` が表示され、**390px 幅のビューポートで横スクロールが発生せず、かつラベル・入力欄・保存ボタンが重なりや文字欠けなく縦 1 カラムで表示されている**ことをスクリーンショットで確認する                           |
| MB-02 | 「最近の記録」6 件中、直近 5 件のみに編集アイコンが表示される（B-05/E-10）               | 商品に価格記録 6 件（`observedAt` が全て異なる。最も古い 1 件を `record-oldest` とする）をシード済み                                                                     | 画面に描画される「最近の記録」の行数が 5 であり、`record-oldest` に対応する店舗名・金額の行が**一覧に存在しない**こと、かつ表示された 5 行すべてに編集アイコン（鉛筆）が 1 つずつ、合計 5 個表示されていることを数えて確認する                                                                        |
| MB-03 | kg→g への単位変更編集で、画面上の単価表示が再計算後の値に変わる                          | 価格記録 1 件（店舗A・`price: 1000円`・`packageSize: 1kg`。編集前の単価表示は「100円 / 100g」）をシード済み。編集ダイアログで `packageSize` を `500g` に変更して保存する | 保存後、「最近の記録」の該当行の単価表示が**「200円 / 100g」に変わっており**（「100円 / 100g」のまま残っていないことを明示的に確認する）、内容量表示が「500g」になっていること                                                                                                                        |
| MB-04 | 店舗リネームの警告文が `priceRecordCount > 0` のときだけ表示される（B-08）               | 店舗A（価格記録 2 件をシード）と店舗B（価格記録 0 件）の 2 件を用意する                                                                                                  | 店舗Aのリネームダイアログを開くと「この店舗の価格記録 2 件の表示名も変わります。違う店舗を選んでいないか確認してください。」という**件数入りの警告文が画面に表示され**、店舗Bのリネームダイアログを開くと**同種の警告文（「この店舗の価格記録」を含むテキスト）が一切表示されない**ことを両方確認する |
| MB-05 | 店舗リネーム後、最安店舗表示・価格記録の店舗名表示が新しい名前に切り替わる（N-05・N-06） | 店舗A（名前「業務スーパ」、価格記録 1 件があり最安店舗として表示されている状態）を用意する。店舗名を「業務スーパー」にリネームして保存する                               | 保存後、画面をリロードせず同一操作フロー内で、最安店舗カードの店舗名表示が「業務スーパー」に変わり、かつ「最近の記録」の該当行の店舗名表示も「業務スーパー」に変わっていること（「業務スーパ」の表記が画面のどこにも残っていないことを確認する）                                                      |

---

## 14. 完了条件

### 14-1. 必須（リリースブロッカー）

- [ ] Domain: `Product.updatePriceRecord()`（D-PUR-01〜12）、`Store.rename()`（D-SRN-01〜06）が実装され全件 pass
- [ ] Application: `UpdatePriceRecordUseCase`（A-UPU-01〜17。特に **A-UPU-04 の `id`/`observedAt` 直接比較**と
      **A-UPU-05〜08 の単位換算 4 方向**）、`RenameStoreUseCase`（A-RSU-01〜10。特に自己衝突除外
      A-RSU-02〜07）が実装され全件 pass
- [ ] api-contract: `updatePriceRecordSchema`（Z-UPR-01〜08）、`renameStoreSchema`
      （Z-RSN-01〜05）が実装され全件 pass
- [ ] Presentation（Hono）: `PUT /price-records/:priceRecordId`（WH-P-09〜15）、
      `PUT /stores/:id`（WH-S-07〜13）が実装され全件 pass
- [ ] Presentation（RTL）: `PriceRecordEditDialog`（PRED-01〜12）、`StoreRenameDialog`
      （SRD-01〜13）、`ProductDetailClient` 追加分（PDC-09〜12）、`PriceRecordForm` 追加分
      （PRF-15〜17）が実装され全件 pass
- [ ] `price-comparison.node.test.ts` の PC-EDIT-01/02 が実装され pass、既存観点も無変更で pass
- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` が通る
- [ ] §1 要件書観点対応表の全 N-xx/E-xx/B-xx に対応する試験が実装されている

### 14-2. 推奨（Should）

- [ ] Infrastructure: IR-提案-01（`IR-S-06`: 店舗名の update-via-save() 確認）を追加する
- [ ] §13 `manual-browser-verify`（MB-01〜05）を実行し、全項目に PASS / BLOCKED(理由) / FAIL が
      付いている

### 14-3. 設計確認事項（テストではなくコードレビューで確認）

- B-08 の「`priceRecordCount` が 0 件でも編集は成功する」は、`RenameStoreUseCase` が
  `GetStoreUsageUseCase` の結果に依存せず独立して実行される設計（usage はダイアログ側の UI 警告
  専用であり `RenameStoreUseCase.execute()` の入力に含まれない）になっていることを実装レビューで
  確認する。これは A-RSU-01〜10 が usage を一切セットアップせずに成功する事実からも間接的に
  裏付けられる。
