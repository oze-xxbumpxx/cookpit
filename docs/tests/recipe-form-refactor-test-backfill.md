# 試験計画: recipe-form-refactor-test-backfill

- 設計書: `docs/designs/recipe-form-refactor-test-backfill.md`
- 対象層: Presentation（apps/web）のみ。ランナー: Vitest（node / happy-dom 両プロジェクト）
- 方針: リファクタ前後で挙動不変を保証するため、フォーム系は「送信される JSON の形」を
  最重要観点として固定する。回帰範囲は既存 apps/web テスト全件（`pnpm --filter web test`）

---

## 1. build-ingredient-input（node）BI-xx

| ID    | 観点                                                                            | 分類   |
| ----- | ------------------------------------------------------------------------------- | ------ |
| BI-01 | 全項目空の行はスキップされ、ingredients にも errors にも含まれない              | 正常系 |
| BI-02 | 数値量 + 単位あり → amountValue / amountUnit が入り amountNote は null          | 正常系 |
| BI-03 | 非数値量（例「適量」）→ amountNote に入り amountValue / amountUnit は null      | 正常系 |
| BI-04 | 食材名のみ空 → 「食材名を入力してください。」                                   | 異常系 |
| BI-05 | 量のみ空 → 「量を入力してください。」                                           | 異常系 |
| BI-06 | 数値量だが負数 → 「量は0以上の数値で入力してください。」                        | 境界値 |
| BI-07 | 数値量で単位未選択 → 「数値の量には単位を選択してください。」                   | 異常系 |
| BI-08 | 量 0 + 単位あり → エラーにならず amountValue: 0（境界）。前後空白は trim される | 境界値 |

## 2. product-format（node）PF-xx

| ID    | 観点                                                                              | 分類   |
| ----- | --------------------------------------------------------------------------------- | ------ |
| PF-01 | findLatestPriceRecord: 空配列 → null                                              | 境界値 |
| PF-02 | findLatestPriceRecord: observedAt 最新のレコードを返す（順不同入力）              | 正常系 |
| PF-03 | sortPriceHistoryByObservedAt: 昇順ソート・元配列は破壊しない                      | 正常系 |
| PF-04 | formatYen: 3 桁区切り + 「円」                                                    | 正常系 |
| PF-05 | formatDate / formatDateTime: 不正日付文字列は原文をそのまま返す                   | 異常系 |
| PF-06 | unitPriceBasisLabel: g/kg → 100g、ml/l → 100ml、それ以外 → `1<unit>`              | 正常系 |
| PF-07 | findLatestPriceRecord: observedAt がパース不能なレコードは epoch 0 扱いで劣後する | 異常系 |

## 3. RecipeFormFields（dom）RFF-xx

| ID     | 観点                                                                                    | 分類   |
| ------ | --------------------------------------------------------------------------------------- | ------ |
| RFF-01 | タグチップをクリックすると onChange の tags に追加され、再クリックで除去される          | 正常系 |
| RFF-02 | 「材料を追加」で材料行が増える／削除ボタンで減る                                        | 正常系 |
| RFF-03 | 「ステップを追加」で手順行が増える／削除ボタンで減る                                    | 正常系 |
| RFF-04 | 材料行のエラーメッセージが該当行にのみ表示される                                        | 異常系 |
| RFF-05 | baseServingsSlot に渡した要素が描画される                                               | 正常系 |
| RFF-06 | buildRecipeFormBody: 調理時間が負数/小数 → cookingTime エラー。空 → null                | 境界値 |
| RFF-07 | buildRecipeFormBody: 空ステップは除外・description は trim される                       | 正常系 |
| RFF-08 | toRecipeFormValue: amountValue あり / amountNote のみ / 両方 null の DTO を行に変換する | 正常系 |

## 4. RecipeFormClient（new・dom）RFC-xx

| ID     | 観点                                                                                                         | 分類   |
| ------ | ------------------------------------------------------------------------------------------------------------ | ------ |
| RFC-01 | レシピ名未入力では保存ボタンが disabled                                                                      | 異常系 |
| RFC-02 | 必須入力後の送信で `POST /api/recipes` に現行と同一形の JSON（baseServings 含む）が渡り、/recipes へ遷移する | 正常系 |
| RFC-03 | 基準人数に 0 を入れて送信 → baseServings エラー表示・POST されない                                           | 境界値 |
| RFC-04 | API が !ok → 「保存に失敗しました。入力内容を確認してください。」                                            | 異常系 |
| RFC-05 | 通信例外 → 「通信エラーが発生しました。」                                                                    | 異常系 |

## 5. RecipeEditFormClient（edit・dom）REF-xx

| ID     | 観点                                                                                                 | 分類   |
| ------ | ---------------------------------------------------------------------------------------------------- | ------ |
| REF-01 | DTO の初期値（名前・タグ・材料・手順・メモ・調理時間）がフォームに反映される                         | 正常系 |
| REF-02 | 基準人数は「N人分」の読み取り専用表示で、入力欄が存在しない                                          | 正常系 |
| REF-03 | 送信で `PUT /api/recipes/:id` に現行と同一形の JSON（baseServings なし）が渡り、詳細ページへ遷移する | 正常系 |
| REF-04 | API が !ok → 「保存に失敗しました。」                                                                | 異常系 |

## 6. 小物コンポーネント（dom）

| ID     | 観点                                                                             | 分類   |
| ------ | -------------------------------------------------------------------------------- | ------ |
| IR-01  | IngredientRow: 各入力の変更が onChange に反映される（食材名・量・単位）          | 正常系 |
| IR-02  | IngredientRow: 単位選択肢が unitOptions 全件 + 空オプションで描画される          | 正常系 |
| IR-03  | IngredientRow: 削除ボタンで onRemove が呼ばれる／エラー時のみメッセージ表示      | 正常系 |
| SR-01  | StepRow: 手順番号（index+1）表示・入力変更が onChange に反映・削除で onRemove    | 正常系 |
| TF-01  | TagFilter: 「すべて」+ 5 タグが描画され、クリックで onChange に値が渡る          | 正常系 |
| RC-01  | RecipeCard: 名前・調理時間・タグ（最大 3 件）表示。cookingTime null は非表示     | 境界値 |
| RC-02  | RecipeCard: 詳細ページへのリンク href が正しい                                   | 正常系 |
| RLC-01 | RecipeListClient: 0 件時「まだレシピがありません」表示                           | 境界値 |
| RLC-02 | RecipeListClient: 検索・タグで絞り込まれ、全滅時は「該当するレシピがありません」 | 正常系 |
| RDC-01 | RecipeDetailClient: 主要情報の表示                                               | 正常系 |
| RDC-02 | RecipeDetailClient: 削除確定で `DELETE /api/recipes/:id` → /recipes へ遷移       | 正常系 |

## 7. products 側（dom）PFF-xx / PRF-xx

| ID     | 観点                                                                     | 分類   |
| ------ | ------------------------------------------------------------------------ | ------ |
| PFF-01 | buildProductFormBody: name trim / aliases のカンマ分割・空要素除去       | 正常系 |
| PFF-02 | buildProductFormBody: name 空 → エラーで input null                      | 異常系 |
| PFF-03 | toProductCategory / toProductUnit: 不明値のフォールバック（その他 / 個） | 異常系 |
| PFF-04 | ProductFormFields: 入力変更が onChange に反映・name エラー表示           | 正常系 |
| PRF-01 | PriceRecordForm: 必須入力で送信 payload の形が固定される                 | 正常系 |
| PRF-02 | PriceRecordForm: 不正値（負の価格等）でエラー表示・送信されない          | 異常系 |

## 対象外・完了条件

- 対象外: `price-history-chart`（recharts 描画のみ）、product form クライアント 2 本・
  `product-detail-client`（薄いラッパー。フォローアップ候補として申し送り）、E2E
- 完了条件: 上記全観点が PASS し、既存テスト（apps/web 全件 + 全パッケージ）に回帰がないこと
