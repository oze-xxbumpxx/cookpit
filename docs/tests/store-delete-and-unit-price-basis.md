# 試験計画: store-delete-and-unit-price-basis

- ステータス: confirmed
- レベル: L3
- 設計書: `docs/designs/store-delete-and-unit-price-basis.md`
- 要件定義書: `docs/requirements/store-delete-and-unit-price-basis.md`

## 試験種別

| 種別                   | 対象                                              | 実施                                       |
| ---------------------- | ------------------------------------------------- | ------------------------------------------ |
| 単体（純関数）         | `product-format.ts` の単価表示                    | 実施                                       |
| 単体（Domain）         | `Product.removePriceRecord`                       | 実施                                       |
| 単体（Application）    | `DeletePriceRecordUseCase` / `DeleteStoreUseCase` | 実施                                       |
| 単体（api-contract）   | `priceRecordIdParamSchema`                        | 実施                                       |
| 結合（Infrastructure） | PGlite での物理削除・件数クエリ                   | 実施                                       |
| 結合（Hono ルート）    | ステータスコードと UseCase 引数の固定             | 実施                                       |
| 結合（画面 / RTL）     | 削除フロー・単価表示・422 の文言                  | 実施                                       |
| E2E（Playwright）      | —                                                 | 対象外（本プロジェクトに UI E2E 基盤なし） |

## 単体試験観点

### 純関数（`product-format`）— ID プレフィクス `PF-`

| ID     | 観点                                                                      |
| ------ | ------------------------------------------------------------------------- |
| PF-06  | 表示基準が単位から決まる（g→100g / kg→1kg / ml→100ml / l→1L / 個→1個）    |
| PF-06b | `KG` / 全角 `ｇ` は「その他」扱い（`UnitPriceCalculator` と同じ厳密一致） |
| PF-08  | kg / l は保存値を 10 倍する                                               |
| PF-09  | g / ml は保存値をそのまま使う                                             |
| PF-10  | 未知単位は保存値をそのまま 1 単位あたりで出す                             |
| PF-11  | 換算結果を 0.1 単位へ丸める（浮動小数の桁あふれを出さない）               |

### Domain（`Product.removePriceRecord`）— ID プレフィクス `PRR-`

| ID     | 観点                                                        |
| ------ | ----------------------------------------------------------- |
| PRR-01 | 指定した記録だけを取り除く                                  |
| PRR-02 | 最後の 1 件を取り除くと空配列になる                         |
| PRR-03 | 存在しない ID は throw し、価格履歴は不変                   |
| PRR-04 | 削除後に `updatedAt` が進む                                 |
| PRR-05 | 削除後もゲッターが防御的コピーを返す                        |
| PRR-06 | 削除した記録が `cheapestStoreAt` の判定から外れる（結合性） |

### Application（`DeletePriceRecordUseCase`）— ID プレフィクス `DPR-`

| ID     | 観点                                                  |
| ------ | ----------------------------------------------------- |
| DPR-01 | 記録を取り除いて保存する（`saveCount === 1`）         |
| DPR-02 | 商品が無ければ `ProductNotFoundError`。保存しない     |
| DPR-03 | 記録が無ければ `PriceRecordNotFoundError`。保存しない |
| DPR-04 | 検査順（商品の存在確認が先）                          |
| DPR-05 | 最後の 1 件を削除すると価格履歴が空になる             |

### Application（`DeleteStoreUseCase`）— ID プレフィクス `DSU-`

| ID     | 観点                                                         |
| ------ | ------------------------------------------------------------ |
| DSU-01 | 参照ゼロの店舗を削除する                                     |
| DSU-02 | 店舗が無ければ `StoreNotFoundError`。削除しない              |
| DSU-03 | 価格記録から参照されていれば `StoreInUseError`。削除しない   |
| DSU-04 | 買い物品目から参照されていれば `StoreInUseError`。削除しない |
| DSU-05 | `StoreInUseError` が内訳件数を保持する                       |
| DSU-06 | 検査順（存在確認が参照件数より先）                           |

スタブは「呼ばれてはならないメソッドで throw する」形にし、想定外の呼び出しを検出する。

### api-contract（`priceRecordIdParamSchema`）

正常な 2 UUID を受理 / `priceRecordId` が UUID でない入力を reject / 欠落を reject。

## 結合試験観点

### Infrastructure（PGlite）— ID プレフィクス `IR-`

| ID       | 観点                                                                      |
| -------- | ------------------------------------------------------------------------- |
| IR-S-04  | `delete()` で対象行のみ消え、他店舗は残る                                 |
| IR-S-05  | `delete()` は存在しない ID でも例外にならない（冪等）                     |
| IR-P-10  | `removePriceRecord()` 後の `save()` で該当行だけ消える                    |
| IR-P-11  | 最後の 1 件を消すと当該商品の価格記録が 0 件になる                        |
| IR-P-12  | `countPriceRecordsByStore()` が商品をまたいで店舗ごとに数える             |
| IR-P-13  | 参照が無ければ 0                                                          |
| IR-SL-10 | `countItemsByStore()` が target / actual の両方を見て、**二重計上しない** |
| IR-SL-11 | 参照が無ければ 0                                                          |

IR-SL-10 は「target のみ」「actual のみ」「両方」「無関係」の 4 品目を用意し、
storeA が 3 件（両方を指す品目を 1 件と数える）になることを固定する。

### Hono ルート — ID プレフィクス `WH-`

| ID      | 観点                                                       |
| ------- | ---------------------------------------------------------- |
| WH-P-06 | 価格記録の削除が 204・空ボディ・UseCase 引数の形           |
| WH-P-07 | `PriceRecordNotFoundError` → 404 とメッセージ書式          |
| WH-P-08 | `priceRecordId` が UUID でなければ 400、UseCase を呼ばない |
| WH-S-01 | `GET /api/stores` の既存挙動（回帰）                       |
| WH-S-02 | `POST /api/stores` の既存挙動（回帰）                      |
| WH-S-03 | 店舗削除が 204・空ボディ・UseCase 引数                     |
| WH-S-04 | `StoreNotFoundError` → 404                                 |
| WH-S-05 | `StoreInUseError` → 422、ボディに内訳件数が含まれる        |
| WH-S-06 | `id` が UUID でなければ 400、UseCase を呼ばない            |

WH-S-01/02 は今回新設した `stores.test.ts` に含める（既存のルートテストが無かったため、
DELETE 追加で既存 2 本が壊れていないことをここで担保する）。

### 画面（`ProductDetailClient`）— ID プレフィクス `PDC-`

| ID     | 観点                                                     |
| ------ | -------------------------------------------------------- |
| PDC-01 | kg 記録の単価が `298円 / 1kg`。`100g` 表記が出ない       |
| PDC-02 | g 記録の単価は `99円 / 100g` のまま（回帰）              |
| PDC-03 | 記録行に内容量が出る（`3001kg` を見分けられる）          |
| PDC-04 | 削除ボタン → 確認 → 204 で API を呼び `router.refresh()` |
| PDC-05 | 404 を成功扱いにする（冪等）                             |
| PDC-06 | 失敗時はエラー表示、再取得しない                         |
| PDC-07 | キャンセルで API を呼ばない                              |
| PDC-08 | 価格記録が無いときは「最近の記録」ごと出ない             |

### 画面（`PriceRecordForm`）— ID プレフィクス `PRF-`

| ID     | 観点                                                      |
| ------ | --------------------------------------------------------- |
| PRF-01 | 既存の記録送信フロー（回帰。パネル文言の変更に追随）      |
| PRF-02 | 既存の価格 0 ブロック（回帰）                             |
| PRF-03 | 既存の店舗取得失敗（回帰）                                |
| PRF-04 | 削除成功で一覧から消え、**選択中なら選択が外れる**（F-7） |
| PRF-05 | 422 で削除されず、日本語の理由が出る                      |
| PRF-06 | 404 を成功扱いにする（冪等）                              |

## 特性観点

- **冪等性**: 削除 API は 2 回目に 404。クライアントが 404 を成功として扱うことで、
  ユーザーから見た操作は冪等（PDC-05 / PRF-06 / IR-S-05）。
- **整合性**: 単価の**保存値**を変えないため、店舗間比較（`cheapestStoreAt`）の結果は
  今回の変更で変わらない。PRR-06 で「記録を消したときだけ比較結果が変わる」ことを固定。
- **境界**: 最後の 1 件の削除（PRR-02 / DPR-05 / IR-P-11 / PDC-08）、店舗 0 件（PRF-04 の
  残存店舗確認で部分的に担保）。
- **表記ゆれ**: PF-06b が「正準化側と表示側の判定が同じ」ことを固定する。これが崩れると
  単価が 10 倍ズレるため、リスク表の筆頭項目に対応する試験。

## メソッド網羅チェック表

| 追加した公開メソッド                         | 試験 ID                    |
| -------------------------------------------- | -------------------------- |
| `Product.removePriceRecord`                  | PRR-01〜06                 |
| `StoreRepository.delete`（Drizzle 実装）     | IR-S-04 / IR-S-05          |
| `ProductRepository.countPriceRecordsByStore` | IR-P-12 / IR-P-13          |
| `ShoppingListRepository.countItemsByStore`   | IR-SL-10 / IR-SL-11        |
| `DeletePriceRecordUseCase.execute`           | DPR-01〜05                 |
| `DeleteStoreUseCase.execute`                 | DSU-01〜06                 |
| `formatUnitPrice`                            | PF-06 / PF-06b / PF-08〜11 |
| `formatUnitPrice`（ラベル部）                | PF-06 / PF-06b             |

## 要件書観点の照合

| 要件     | 対応する試験                                                        |
| -------- | ------------------------------------------------------------------- |
| F-1      | PF-06 / PF-08〜10 / PDC-01 / PDC-02                                 |
| F-2      | 保存値に触れる変更が無いこと（PRR-06 が比較の不変を担保）           |
| F-3      | PDC-04 / DPR-01 / WH-P-06 / IR-P-10                                 |
| F-4      | PDC-04 / PDC-07                                                     |
| F-5      | PRF-04 / DSU-01 / WH-S-03 / IR-S-04                                 |
| F-6      | PRF-05 / DSU-03 / DSU-04 / WH-S-05                                  |
| F-7      | PRF-04                                                              |
| F-8      | IR-S-04 / IR-P-10 / IR-P-11                                         |
| N-1〜N-6 | PDC-01 / PDC-02 / PDC-04 / PRF-04 / PRF-05                          |
| E-1〜E-5 | DPR-02 / DPR-03 / DSU-02 / DSU-03 / WH-P-07 / WH-P-08 / WH-S-04〜06 |
| E-6      | PDC-06（通信失敗系はモックの reject で代表）                        |
| B-1      | DPR-05 / IR-P-11 / PDC-08                                           |
| B-2      | PRF-04（残存店舗の確認で部分的に担保）                              |
| B-3      | PF-10                                                               |
| B-4      | PF-06b                                                              |
| B-5      | IR-SL-10（target のみの品目）                                       |

## 回帰試験範囲

- `product-format.node.test.ts` の PF-06 は**期待値が変わる**（`kg` の基準が `100g` から
  `1kg` へ）。仕様変更なので更新し、テスト名とコメントに変更理由を残す。あわせて
  `unitPriceBasisLabel` の削除に伴い、PF-06 / PF-06b は `formatUnitPrice` 経由の検証に移す。
- `price-record-form.test.tsx` の既存 3 本はパネル文言の変更に追随する（PRF-01〜03）。
- `product.mapper.test.ts` は `PriceRecordDto.id` の追加に追随する。
- リポジトリインターフェースへのメソッド追加により、テスト用 InMemory 実装 6 箇所が
  コンパイルエラーになる。`pnpm type-check` を通すことが回帰条件。
- 既存の `products.test.ts`（WH-P-01〜05）が無変更で通ること＝ DELETE 追加でパスが
  食い合っていないこと。

## 試験データ

- 単価: 保存値 29.8（100g 基準）× `kg` = 298円/1kg。実運用の砂糖 1kg 298 円に合わせる。
- 誤入力再現: `packageSizeValue: 3001, packageSizeUnit: 'kg'`（PDC-03）。
- 店舗参照: 価格記録 3 件・買い物品目 1 件（DSU-05 / WH-S-05）。

## 完了条件

- [x] `pnpm lint`（既存の警告 1 件のみ。本変更に起因する指摘なし）
- [x] `pnpm type-check`
- [x] `pnpm test`
- [x] 上記の全試験 ID が実装され、通っている
