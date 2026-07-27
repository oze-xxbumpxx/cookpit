# 試験計画: store-limit-and-render-performance

- 設計書: [docs/designs/store-limit-and-render-performance.md](../designs/store-limit-and-render-performance.md)
- ADR: [ADR-0013](../decisions/ADR-0013-store-limit-and-delete-cascade.md)
- テストランナー: Vitest

## 試験種別

| 種別           | 対象                                                                 | 実施 |
| -------------- | -------------------------------------------------------------------- | ---- |
| 単体（純関数） | `normalizeStoreName` / `packageSizeExample`                          | 自動 |
| 単体（Domain） | `ShoppingList.unassignStore` / `ShoppingItem.unassignStore`          | 自動 |
| 単体（App）    | `CreateStoreUseCase` / `DeleteStoreUseCase` / `GetStoreUsageUseCase` | 自動 |
| 結合（Infra）  | PGlite での 3 リポジトリメソッド                                     | 自動 |
| 結合（画面）   | `PriceRecordForm`（RTL）                                             | 自動 |
| 契約           | `storeUsageResponseSchema`                                           | 自動 |
| 手動           | `loading.tsx` の骨組み表示、フォント差し替え後の見た目               | 手動 |

## 単体試験観点

### 純関数（`normalizeStoreName`）— ID プレフィクス `NSN-`

| ID     | 入力                | 期待             | 観点                       |
| ------ | ------------------- | ---------------- | -------------------------- |
| NSN-01 | `'ライフ'`          | `'ライフ'`       | 正常系                     |
| NSN-02 | `'  ライフ  '`      | `'ライフ'`       | 前後空白除去               |
| NSN-03 | `'ﾗｲﾌ'`（半角カナ） | `'ライフ'`       | NFKC 正規化                |
| NSN-04 | `'業務ｽｰﾊﾟｰ'`       | `'業務スーパー'` | NFKC 混在                  |
| NSN-05 | `'ＡＢＣ'`          | `'ABC'`          | 全角英字                   |
| NSN-06 | `'Life'` / `'life'` | 互いに不一致     | 大小は区別する（設計判断） |
| NSN-07 | `''`                | `''`             | 境界値                     |

### Domain（`unassignStore`）— ID プレフィクス `UAS-`

| ID     | 前提                                   | 期待                                              |
| ------ | -------------------------------------- | ------------------------------------------------- |
| UAS-01 | 品目の `targetStore` が対象店舗        | `targetStore` が null、戻り値 true                |
| UAS-02 | 品目の `actualStore` が対象店舗        | `actualStore` が null、戻り値 true                |
| UAS-03 | 両方が対象店舗                         | 両方 null、戻り値 true                            |
| UAS-04 | どちらも別店舗                         | 変化なし、戻り値 false                            |
| UAS-05 | 両方 null                              | 変化なし、戻り値 false                            |
| UAS-06 | 複数品目のうち一部だけが対象店舗       | 対象品目のみ null、他は不変、戻り値 true          |
| UAS-07 | **リストが `completed`**               | **例外を投げず適用される**（assertActive 非経由） |
| UAS-08 | `bought` 品目の `actualStore` をクリア | `status` は `bought` のまま（不変条件を壊さない） |
| UAS-09 | `actualPrice` は対象外                 | `actualPrice` が保持される                        |

### Application（`CreateStoreUseCase`）— ID プレフィクス `CSU-`

| ID     | 前提                                        | 期待                                | 観点       |
| ------ | ------------------------------------------- | ----------------------------------- | ---------- |
| CSU-01 | 既存 0 件                                   | 作成成功                            | 正常系     |
| CSU-02 | 既存 2 件                                   | 作成成功（3 件目は可）              | 境界値     |
| CSU-03 | 既存 3 件                                   | `StoreLimitExceededError`           | 境界値     |
| CSU-04 | 既存 10 件（本番相当）                      | `StoreLimitExceededError`           | 移行時     |
| CSU-05 | 既存に `'ライフ'`、入力 `'ライフ'`          | `DuplicateStoreNameError`           | 異常系     |
| CSU-06 | 既存に `'ライフ'`、入力 `'  ライフ '`       | `DuplicateStoreNameError`           | 正規化     |
| CSU-07 | 既存に `'業務スーパー'`、入力 `'業務ｽｰﾊﾟｰ'` | `DuplicateStoreNameError`           | NFKC       |
| CSU-08 | 既存 3 件かつ同名                           | **上限エラーが優先**                | 判定順序   |
| CSU-09 | 空白のみの名前                              | `Store.create` の既存エラー         | 回帰       |
| CSU-10 | 拒否されたとき                              | `storeRepository.save` が呼ばれない | 副作用なし |

### Application（`DeleteStoreUseCase`）— ID プレフィクス `DSU-`

| ID     | 前提                                  | 期待                                                    |
| ------ | ------------------------------------- | ------------------------------------------------------- |
| DSU-01 | 店舗が存在しない                      | `StoreNotFoundError`                                    |
| DSU-02 | 参照ゼロの店舗                        | 削除成功（`StoreInUseError` は投げない）                |
| DSU-03 | 価格記録あり                          | 削除成功。`deletePriceRecordsByStore` が呼ばれる        |
| DSU-04 | 買い物品目あり                        | 削除成功。該当リストが `unassignStore` 後に save される |
| DSU-05 | 価格記録と品目の両方あり              | 両方処理されて削除成功                                  |
| DSU-06 | **呼び出し順序**                      | 価格記録削除 → 品目解除 → 店舗削除 の順（FK 制約対策）  |
| DSU-07 | `unassignStore` が false を返すリスト | `save` を呼ばない（無駄な書き込みをしない）             |
| DSU-08 | completed のリストが参照              | 例外なく解除される                                      |

### Application（`GetStoreUsageUseCase`）— ID プレフィクス `GSU-`

| ID     | 前提               | 期待                                            |
| ------ | ------------------ | ----------------------------------------------- |
| GSU-01 | 店舗が存在しない   | `StoreNotFoundError`                            |
| GSU-02 | 価格記録 3・品目 2 | `{ priceRecordCount: 3, shoppingItemCount: 2 }` |
| GSU-03 | 参照ゼロ           | `{ priceRecordCount: 0, shoppingItemCount: 0 }` |

### 純関数（`packageSizeExample`）— ID プレフィクス `PSE-`

| ID     | 単位              | 期待                             | 観点                       |
| ------ | ----------------- | -------------------------------- | -------------------------- |
| PSE-01 | `'g'`             | `'300g'`                         | 小さい連続量               |
| PSE-02 | `'ml'`            | `'300ml'`                        | 小さい連続量               |
| PSE-03 | `'kg'`            | `'1kg'`                          | 大きい連続量               |
| PSE-04 | `'l'`             | `'1l'`                           | 大きい連続量               |
| PSE-05 | `'個'`            | `'1個'`                          | 可算単位は 1（R-7）        |
| PSE-06 | `'本'`            | `'1本'`                          | 可算単位                   |
| PSE-07 | `'枚'`            | `'1枚'`                          | 可算単位                   |
| PSE-08 | `'缶'`            | `'1缶'`                          | 可算単位（プリセット末尾） |
| PSE-09 | `'大さじ'`        | `'1大さじ'`                      | 計量単位                   |
| PSE-10 | `'cup'`           | `'1cup'`                         | 計量単位                   |
| PSE-11 | `'合'`            | `'1合'`                          | 計量単位                   |
| PSE-12 | `'杯'`            | `'1杯'`                          | 未知単位は 1（安全側）     |
| PSE-13 | `''`              | `'300g'`                         | 空文字は既定へ縮退         |
| PSE-14 | `' 個 '`          | `'1個'`                          | 正規化してから判定         |
| PSE-15 | 全 `UNIT_PRESETS` | `300` が付くのは `g` / `ml` のみ | 網羅（表駆動）             |

## 結合試験観点

### Infrastructure（PGlite）— ID プレフィクス `IR-`

| ID    | 対象                        | 観点                                                         |
| ----- | --------------------------- | ------------------------------------------------------------ |
| IR-01 | `findByNormalizedName`      | 完全一致で 1 件返す                                          |
| IR-02 | `findByNormalizedName`      | 表記ゆれ（半角カナ・前後空白）でも一致する                   |
| IR-03 | `findByNormalizedName`      | 一致なしで null                                              |
| IR-04 | `deletePriceRecordsByStore` | 対象店舗の記録のみ消え、他店舗の記録が残る                   |
| IR-05 | `deletePriceRecordsByStore` | 複数商品にまたがる記録をすべて消す                           |
| IR-06 | `deletePriceRecordsByStore` | 参照ゼロの店舗 ID でも例外にならない（冪等）                 |
| IR-07 | `findAllByStore`            | `target_store_id` 参照のリストを返す                         |
| IR-08 | `findAllByStore`            | `actual_store_id` 参照のリストを返す                         |
| IR-09 | `findAllByStore`            | **completed のリストも返す**                                 |
| IR-10 | `findAllByStore`            | 同一リスト内に複数の該当品目があっても重複して返さない       |
| IR-11 | `findAllByStore`            | 参照なしで空配列                                             |
| IR-12 | カスケード通し              | 価格記録削除 → 店舗削除 が FK `restrict` に当たらず完了する  |
| IR-13 | 順序違反                    | 価格記録を残して店舗を消すと FK エラーになる（安全網の確認） |

### Hono ルート — ID プレフィクス `WH-`

| ID    | リクエスト                               | 期待                                     |
| ----- | ---------------------------------------- | ---------------------------------------- |
| WH-01 | `GET /api/stores/:id/usage`（存在）      | 200 + 件数 2 項目                        |
| WH-02 | `GET /api/stores/:id/usage`（不在）      | 404                                      |
| WH-03 | `GET /api/stores/:id/usage`（UUID 不正） | バリデーションエラー                     |
| WH-04 | `POST /api/stores`（3 件既存）           | 422                                      |
| WH-05 | `POST /api/stores`（同名）               | 422                                      |
| WH-06 | `DELETE /api/stores/:id`（参照あり）     | **204**（旧仕様の 422 からの変更を明示） |

### 画面（`PriceRecordForm`）— ID プレフィクス `PRF-`

| ID     | 前提                              | 期待                                                            |
| ------ | --------------------------------- | --------------------------------------------------------------- |
| PRF-01 | 店舗 3 件                         | 「追加」ボタンが disabled、上限メッセージが表示される           |
| PRF-02 | 店舗 2 件                         | 「追加」ボタンが有効                                            |
| PRF-03 | 店舗 10 件（本番相当）            | disabled かつ上限メッセージ（移行中も壊れない）                 |
| PRF-04 | 既存名と同じ名前を入力            | 追加前に同名メッセージ、ボタン disabled                         |
| PRF-05 | 既存名と表記ゆれで一致する名前    | 同名メッセージ（`normalizeStoreName` 共有の確認）               |
| PRF-06 | `POST /api/stores` が 422         | 一覧と入力名から理由を組み立てて日本語表示（本文パースしない）  |
| PRF-07 | 削除アイコン押下                  | `usage` を取得し、件数入りの確認文が出る                        |
| PRF-08 | `usage` 取得が失敗                | 件数を伏せた定性表現になり、削除操作は継続できる                |
| PRF-09 | 削除が 204                        | 一覧から消え、選択中なら選択解除、`router.refresh()` が呼ばれる |
| PRF-10 | 削除が 404                        | 成功として扱う（既存の冪等方針の回帰）                          |
| PRF-11 | 内容量プレースホルダ（`個` 商品） | `例：1個`                                                       |
| PRF-12 | 内容量プレースホルダ（`g` 商品）  | `例：300g`                                                      |
| PRF-13 | 内容量を空で送信（`個` 商品）     | エラーメッセージの例も `例：1個`（R-8 の一致確認）              |

### 契約（`storeUsageResponseSchema`）

- 正常な 2 項目オブジェクトを受理する
- 負数・小数・欠損項目を拒否する

## 特性観点

| 観点   | 内容                                                                |
| ------ | ------------------------------------------------------------------- |
| 冪等性 | `DELETE /api/stores/:id` の再実行が 404 になり、UI が成功として扱う |
| 整合性 | カスケード後に価格記録・品目のどちらからも当該店舗 ID が消えている  |
| 境界値 | 上限は 2→3 が可・3→4 が不可（CSU-02 / CSU-03）                      |
| 権限   | 対象外（ADR-0003 で認証は MVP1 対象外）                             |
| 障害系 | `usage` 取得失敗時に削除操作が止まらない（PRF-08）                  |
| 性能   | フォント転送量の実測（下記 手動試験 M-04）                          |

## 手動試験

実施は `apps/web/scripts/verify-fonts-and-loading.mjs`（Playwright）で自動化した。
`.env.local` が本番 Neon を指すため**読み取り専用**で走らせ、削除は実行しない
（削除ダイアログは開くが `GET /usage` までで、`削除する` は押さない）。

| ID    | 対象                   | 合否基準                                    | 結果                                                                            |
| ----- | ---------------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| MB-01 | フォント適用           | `font-family` が Zen Maru Gothic から始まる | **PASS**                                                                        |
| MB-02 | 転送量                 | 読み込まれるのがサブセット 3 本だけ         | **PASS** — 実測 1.89MB（4.40MB から -57%）                                      |
| MB-03 | サブセット取りこぼし   | 第一水準の字がサブセットで描画される        | **PASS** — 9/9 字（亜腕鶏豚菜塩漬鮭芋）                                         |
| MB-04 | 店舗の上限表示         | 上限メッセージと追加ボタン無効化            | **PASS** — 本番の 10 件状態で無効化を確認                                       |
| MB-05 | 内容量プレースホルダ   | 単位に応じた例が出る                        | **PASS** — 実データの基本単位 `1L` で `例：1L`（当初 `例：11L` の不具合を修正） |
| MB-06 | 削除ダイアログの件数   | 価格記録の件数が出る                        | **PASS** — 「価格記録 4 件が削除されます / 品目 3 件は未割当に戻ります」        |
| MB-07 | `loading.tsx` の骨組み | 遷移直後に骨組みが描画される                | **PASS** — 5 ルートで skeleton を観測                                           |

### 当初目標に届かなかった項目

**フォントは 1.89MB（目標は 1.0MB 未満）。** 第一水準 2965 字を含む丸ゴシックのグリフが
1 ウェイト約 630KB あり、3 ウェイトでこの量になる。さらに削るには次のいずれかが必要で、
どちらも見た目・運用の判断を伴うため本タスクでは実施しない。

- ウェイトを 400/700 の 2 種へ削る（-33%、約 1.26MB）。`font-medium` が通常太さになる
- 収録字数を常用漢字 2136 字へ削る（-28%）。食材名の第一水準漢字が fallback に落ちる

**unicode-range 分割は試したうえで却下した。** 実測すると実際の画面テキストで 16 スライス
全部に到達し、転送量が単一サブセットと変わらないまま CSS が 73KB 増えた。あの方式が効くのは
グリフを頻度順に並べている場合で、JIS（読み）順のスライスでは漢字がコードポイント全域へ散る。

### MB-03 の判定範囲

「サブセットに含めた字が描画できる」ことのみを判定した。「対象外の字が fallback する」ことは
headless Chromium の fallback チェーンに左右されて安定判定できないため、参考値として出力し
判定には使っていない。

## メソッド網羅チェック表

| 追加・変更したメソッド                        | 対応する試験 ID    |
| --------------------------------------------- | ------------------ |
| `normalizeStoreName`                          | NSN-01〜07         |
| `StoreRepository.findByNormalizedName`        | IR-01〜03          |
| `ProductRepository.deletePriceRecordsByStore` | IR-04〜06          |
| `ShoppingListRepository.findAllByStore`       | IR-07〜11          |
| `ShoppingItem.unassignStore`                  | UAS-01〜05, 08, 09 |
| `ShoppingList.unassignStore`                  | UAS-06, 07         |
| `CreateStoreUseCase.execute`                  | CSU-01〜10         |
| `DeleteStoreUseCase.execute`                  | DSU-01〜08         |
| `GetStoreUsageUseCase.execute`                | GSU-01〜03         |
| `packageSizeExample`                          | PSE-01〜15         |

## 要件書観点の照合

| 要件 | 試験 ID                           |
| ---- | --------------------------------- |
| R-1  | CSU-01〜04, WH-04, PRF-01〜03     |
| R-2  | CSU-05〜07, WH-05, PRF-04, PRF-05 |
| R-3  | DSU-03, DSU-05, IR-04〜06, WH-06  |
| R-4  | DSU-04, DSU-08, UAS-01〜09        |
| R-5  | GSU-02, WH-01, PRF-07             |
| R-6  | PRF-01, PRF-04, PRF-06            |
| R-7  | PSE-01〜15, PRF-11, PRF-12        |
| R-8  | PRF-13                            |
| R-9  | M-01                              |
| R-10 | M-02〜M-04                        |

## 回帰試験範囲

| 範囲                                       | 理由                                                       |
| ------------------------------------------ | ---------------------------------------------------------- |
| `store-use-cases.test.ts` 全体             | `StoreInUseError` 削除の影響                               |
| `price-record-form.test.tsx` 全体          | 店舗パネルと内容量欄の両方を触る                           |
| `drizzle-shopping-list.repository.test.ts` | `findAllByStore` 追加による既存クエリへの影響              |
| `complete-shopping.use-case.test.ts`       | `actualStore` が null の品目で価格記録がスキップされる挙動 |
| `shopping-list-client.*.test.tsx`          | 店舗指定が null の品目の表示（未割当グループ）             |
| 商品詳細画面のテスト                       | `loading.tsx` 追加とグラフ・履歴の再取得                   |

## 試験データ

- 店舗: 本番相当の 10 件（実在 3 + 試し入力 4 + 同名重複 3）を再現するフィクスチャ
- 価格記録: 同一商品に対し複数店舗・複数日付の記録（カスケード対象と非対象の混在）
- 買い物リスト: `active` と `completed` を各 1 件、`target` のみ / `actual` のみ / 両方の品目を含む
- 単位: `UNIT_PRESETS` 全件 + 未知単位（`杯`）+ 空文字

## 完了条件

- 上表の自動試験がすべて PASS
- `pnpm lint` / `pnpm type-check` / `pnpm test` が通る
- 手動試験 M-01〜M-05 が PASS（BLOCKED は理由を明記）
- メソッド網羅チェック表に空欄がない
