# 試験計画: shopping-list-screens

- 前提となる設計書: `docs/designs/shopping-list-screens.md`（confirmed。S-1〜S-6 全件ユーザー確定済み）
- 要求分析: `docs/requirements/shopping-list-screens.md`（§5 試験観点 N-01〜10 / E-01〜08 / B-01〜07 / O-01〜05 を土台とする）
- 実装計画: `docs/implementation-plans/shopping-list-screens.md`（並行作成。本計画と矛盾しないこと）
- レベル: L2（`apps/web` Presentation 層のみ。Domain / Application / Infrastructure / API Contract 変更なし）
- 確定 S-x: S-1 案B（両建て導線） / S-2 案B（明示ボタン POST・自動発火なし） / S-3 案A（チェック解除UIなし） /
  S-4 案B（`useOptimistic`） / S-5 案A（読み取りキャッシュのみ） / S-6 案A（推奨店舗バッジのみ）

---

## 試験種別

| 種別             | 対象                                                         | ランナー / 手段                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 単体（純関数）   | `_utils/shopping-list-view.ts`                               | Vitest node 環境（`*.node.test.ts`。`meal-plan-view.node.test.ts` 先例）                                                                                                                       |
| コンポーネント   | `_components/*.tsx` + `meal-plan-client.tsx` 追記分          | Vitest + RTL（`*.test.tsx`、happy-dom 環境。`meal-plan-client.test.tsx` 先例）                                                                                                                 |
| Server Component | `shopping-lists/page.tsx` / `shopping-lists/[id]/page.tsx`   | RTL 対象外（async Server Component は RTL 非対応）→ type-check + 実画面確認（MB 系）で担保                                                                                                     |
| API ルート       | `shopping-lists.ts` / `stores.ts`                            | **追加不要**。既存 `shopping-lists.test.ts`（56 ケース相当・全 5 API のステータス分岐・バリデーション・エラー変換を担保済み）/ `stores.test.ts` で担保済み。本ユニットはサーバー側を変更しない |
| PWA              | `apps/web/src/app/sw.ts` の `runtimeCaching` 追記 3 エントリ | **Vitest で検証不能**（本番ビルド `next build --webpack` でのみ Serwist が有効）。手動確認（MB-10〜12）                                                                                        |
| 実画面           | 全画面 + 導線 + PWA                                          | manual-browser-verify スキル（MB 系）                                                                                                                                                          |
| E2E smoke        | ハッピーパス                                                 | Playwright（ローカル `pnpm e2e`）。**推奨・任意**（§E2E smoke の要否判断 参照）                                                                                                                |

---

## 単体試験観点（`shopping-list-view.node.test.ts`）

| #     | 観点                                                   | 前提                                                                    | 操作                                                                    | 期待結果                                                                                                                                                           | 分類      |
| ----- | ------------------------------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| SU-01 | 店舗名 Map 構築                                        | `StoreDto` 2 件                                                         | `buildStoreNameMap(stores)`                                             | size 2・`get(id)` が対応する `name` を返す                                                                                                                         | 正常      |
| SU-02 | 店舗名 Map・空配列                                     | —                                                                       | `buildStoreNameMap([])`                                                 | 空 Map                                                                                                                                                             | 境界      |
| SU-03 | 店舗未定グループの先頭固定（D-2 **重点**）             | items 配列内で `targetStoreId: null` の item を**末尾**に配置           | `groupItemsByStore(items, stores)`                                      | 出力配列の先頭要素が `storeId: null`（元の並び順に依らず先頭固定）                                                                                                 | 境界      |
| SU-04 | 複数店舗の集約（N-03）                                 | `targetStoreId` が A/B 店で混在する items                               | `groupItemsByStore(items, stores)`                                      | 同一 `targetStoreId` の item が同一グループに集約される                                                                                                            | 正常      |
| SU-05 | グループ表示順は stores の返却順                       | `stores` を B店→A店の順で渡す                                           | `groupItemsByStore(items, stores)`                                      | 店舗未定グループの次は B店→A店の順（`GET /api/stores` の返却順をそのまま反映）                                                                                     | 正常      |
| SU-06 | 0 件店舗の除外                                         | `stores` に C店を含むが items に C店を `targetStoreId` に持つものがない | `groupItemsByStore(items, stores)`                                      | C店のグループは出力に含まれない                                                                                                                                    | 境界      |
| SU-07 | 店舗未定 item が 0 件の場合                            | 全 item の `targetStoreId` が非 null                                    | `groupItemsByStore(items, stores)`                                      | `storeId: null` のグループ自体が出力されない（常に空の「店舗未定」ヘッダーを出さない）                                                                             | 境界      |
| SU-08 | 不明な店舗への防御的フォールバック（**重点・防御性**） | item の `targetStoreId` が `stores` に存在しない UUID                   | `groupItemsByStore(items, stores)`                                      | 例外を投げず、当該 item は「不明な店舗」ラベルの独立グループとして扱われる（店舗未定グループとは区別される）                                                       | 異常/防御 |
| SU-09 | items 空配列                                           | —                                                                       | `groupItemsByStore([], stores)`                                         | 空配列を返す                                                                                                                                                       | 境界      |
| SU-10 | 通常日の整形                                           | —                                                                       | `formatShoppingDate('2026-07-11')`                                      | `7/11（土）の買い物リスト`                                                                                                                                         | 正常      |
| SU-11 | 年またぎ日の境界                                       | —                                                                       | `formatShoppingDate('2026-12-31')` / `formatShoppingDate('2027-01-01')` | それぞれ正しい月日・曜日（`12/31（木）の買い物リスト` / `1/1（金）の買い物リスト`）が算出される（`Date` 構築のローカルタイム規約起因の月またぎ・年またぎバグ検出） | 境界      |
| SU-12 | 曜日表記の網羅                                         | 日〜土 7 曜日にそれぞれ該当する日付                                     | `formatShoppingDate(date)` を 7 パターン実行                            | 全曜日ラベルが正しく出力される（`meal-plan-view.ts` の `WEEKDAY_LABELS` と同一規約）                                                                               | 境界      |

---

## コンポーネント試験観点

### `shopping-list-entry-client.tsx`（`ShoppingListEntryClient`。prefix EC）

モック: `vi.mock('next/link')` + `vi.mock('next/navigation')`（`useRouter` → `{ push: vi.fn() }`）+
`vi.mock('@/lib/api-client')`（`client.api['shopping-lists'].$post` を `vi.fn()` 差し替え）。

| #     | 観点                                    | 前提                                                     | 操作                   | 期待結果                                                                                      | 分類 |
| ----- | --------------------------------------- | -------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------- | ---- |
| EC-01 | MealPlan なしの空状態（E-01）           | `mealPlan: null`                                         | render                 | 「今週の献立がまだありません」+ `/meal-plans` への `Link`。ボタンは表示されない               | 正常 |
| EC-02 | draft 時のラベル                        | `mealPlan.status: 'draft'`                               | render                 | ボタンラベル「買い物リストを作る」                                                            | 正常 |
| EC-03 | draft 以外のラベル                      | `mealPlan.status: 'shopping'`                            | render                 | ボタンラベル「買い物リストを開く」                                                            | 正常 |
| EC-04 | 生成/取得の RPC 結線・遷移（N-01/N-02） | `$post` が `{ ok: true, json: () => ({id:'x'}) }` を解決 | ボタン click           | `$post` に `{ json: { mealPlanId: mealPlan.id } }`・成功で `router.push('/shopping-lists/x')` | 正常 |
| EC-05 | 生成失敗の表示（E-02/E-03 統合）        | `$post` が `{ ok: false }`                               | ボタン click           | 「操作に失敗しました。」表示・`push` 未呼び出し                                               | 異常 |
| EC-06 | 通信エラーの表示（E-07）                | `$post` が reject                                        | ボタン click           | 「通信エラーが発生しました。」表示                                                            | 異常 |
| EC-07 | 送信中の二重発火防止                    | `$post` が未解決 Promise                                 | ボタン click 後 render | ボタンが disabled（多重送信されない。O-05 相当）                                              | 正常 |
| EC-08 | ヘッダー導線                            | 任意の `mealPlan`                                        | render                 | 「戻る」`href="/meal-plans"` + タイトル「買い物リスト」                                       | 正常 |

### `shopping-list-client.tsx`（`ShoppingListClient`。prefix LC・**最重要ユニット**）

モック: `vi.mock('@/lib/api-client')`（`client.api['shopping-lists'][':id'].$get` / `.items.$post` /
`.items[':itemId'].bought.$post` / `.items[':itemId']['target-store'].$post` を `vi.fn()` で個別差し替え）。
子コンポーネント（`StoreGroup` / `ShoppingItemRow` / `PurchaseInputForm` / `AddItemForm`）はモックせず実物を
使用する（`meal-plan-client.test.tsx` が `PlannedRecipeItem` / `RecipePicker` を実物で使う先例に合わせる。
状態が複数コンポーネントをまたいで正しく伝播することを検証するため）。

| #     | 観点                                                     | 前提                                                        | 操作                                                     | 期待結果                                                                                                                             | 分類 |
| ----- | -------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| LC-01 | 店舗未定グループの先頭表示（D-2・B-01 **重点**）         | items に `targetStoreId: null` を含む複数店舗の item        | render                                                   | 「店舗未定」グループが画面上でも最初に表示される                                                                                     | 境界 |
| LC-02 | 複数店舗の集約表示（N-03）                               | A店/B店混在の items                                         | render                                                   | 各グループヘッダーに対応する店舗名、配下に対応 item のみ表示される                                                                   | 正常 |
| LC-03 | items 0 件の空状態（B-03）                               | `shoppingList.items: []`                                    | render                                                   | 「リストにアイテムがありません」表示 + 「手動で追加」ボタンは操作可能（disabled でない）                                             | 境界 |
| LC-04 | チェックでフォーム展開                                   | item 1 件・`status: 'pending'`                              | チェックボタン click                                     | 該当 item の下に `PurchaseInputForm` が展開される                                                                                    | 正常 |
| LC-05 | 購入実績入力の成功（N-04・S-4 正常系）                   | pending item・`bought.$post` が成功レスポンスを返す         | 価格・店舗入力 → [購入を記録] click                      | 即座に楽観的に `bought` 表示へ切替わり、レスポンス後も該当 item のみ更新される（他 item は再レンダリングされても値は不変）           | 正常 |
| LC-06 | 楽観的更新のロールバック（**S-4 最重要・O-03**）         | `bought.$post` が `{ ok: false }`（404/422 相当）を返す     | [購入を記録] click                                       | 楽観的に切り替わっていた `bought` 表示が **元の pending 表示にロールバック**され、`errorMessage`「操作に失敗しました。」が表示される | 異常 |
| LC-07 | 楽観的更新中のネットワークエラー（**S-4 最重要・O-04**） | `bought.$post` が reject                                    | [購入を記録] click                                       | 表示が pending にロールバックされ、「通信エラーが発生しました。」が表示される                                                        | 異常 |
| LC-08 | 同一 item への再送信（金額訂正・N-05・S-3 上書き）       | 既に `bought` の item を再タップし別金額を入力              | 再送信                                                   | エラーにならず上書きされる（`actualPrice`/`actualStoreId` が新しい値に更新される）                                                   | 正常 |
| LC-09 | 手動追加の成功（N-07）                                   | `items.$post` が 201 相当を返す                             | 「手動で追加」→ 必須項目入力 → [追加]                    | 一覧に新規 item（`source: 'manually_added'`）が追加される                                                                            | 正常 |
| LC-10 | 手動追加の失敗（E-04/E-06）                              | `items.$post` が `{ ok: false }`                            | [追加] click                                             | 「操作に失敗しました。」表示。一覧は変化しない                                                                                       | 異常 |
| LC-11 | 店舗再割当によるグループ移動（N-08・**重点**）           | item A（targetStoreId: 店舗X）・`target-store.$post` が成功 | 店舗バッジで店舗Y選択                                    | 該当 item が店舗Xグループから消え、店舗Yグループに現れる（`targetStoreId` のみ更新・他フィールド不変）                               | 正常 |
| LC-12 | bought 済み item の店舗再割当（S-11(c)）                 | `status: 'bought'` の item                                  | 店舗再割当                                               | `actualPrice`/`actualStoreId` は変化しない                                                                                           | 境界 |
| LC-13 | 店舗再割当の失敗（E-05）                                 | `target-store.$post` が `{ ok: false }`                     | 店舗再割当操作                                           | 「操作に失敗しました。」表示。グループ移動しない                                                                                     | 異常 |
| LC-14 | フォーカス復帰での自動 refetch（D-7 **最重要**）         | `$get` が最新 items（1 件の item の `status` が変化）を返す | `window` に `focus` イベントを dispatch                  | `$get` が呼ばれ、items state が最新レスポンスで置換される                                                                            | 正常 |
| LC-15 | 手動更新ボタンでの refetch（D-7 **最重要**）             | 同上                                                        | 「更新」ボタン click                                     | `$get` が呼ばれ、items state が置換される（LC-14 と同一ロジック）                                                                    | 正常 |
| LC-16 | アンマウント時のリスナー解除（防御性・副作用検証）       | render 後 `unmount()`                                       | `unmount()` 後に `window` へ `focus` イベントを dispatch | `$get` が呼ばれない（クリーンアップ漏れによるメモリリーク・意図しない refetch が発生しない）                                         | 防御 |
| LC-17 | 操作中 item のみ disable                                 | item 2 件・item A の `bought.$post` が未解決 Promise        | item A の [購入を記録] click 直後に render 確認          | item A の操作系のみ disabled。item B は操作可能なまま                                                                                | 正常 |
| LC-18 | 連打時の二重送信ガード（O-05）                           | `bought.$post` が未解決 Promise                             | 同一 item の [購入を記録] を連打                         | `bought.$post` は 1 回のみ呼ばれる（`submittingItemId` によるガード）                                                                | 正常 |
| LC-19 | ヘッダー表示                                             | `shoppingList.shoppingDate: '2026-07-11'`                   | render                                                   | 「戻る」`href="/meal-plans"` + `formatShoppingDate` の結果「7/11（土）の買い物リスト」表示                                           | 正常 |
| LC-20 | 店舗未定 item の requiredAmount 表示（B-02 統合確認）    | `requiredAmount: null, amountNote: '適量'` の item          | render                                                   | 数量ではなく `amountNote`「適量」が表示される                                                                                        | 境界 |

### `store-group.tsx`（`StoreGroup`。prefix SG）

| #     | 観点                                                              | 前提                                      | 操作   | 期待結果                                                          | 分類 |
| ----- | ----------------------------------------------------------------- | ----------------------------------------- | ------ | ----------------------------------------------------------------- | ---- |
| SG-01 | 店舗未定ヘッダー                                                  | `storeId: null`                           | render | ヘッダーに「店舗未定」表示                                        | 正常 |
| SG-02 | 推奨店舗バッジ（N-09・S-6 案A）                                   | `storeId: 'store-a', storeName: 'イオン'` | render | ヘッダーに「イオン」表示                                          | 正常 |
| SG-03 | item 一覧の展開                                                   | items 3 件                                | render | `ShoppingItemRow` が 3 件レンダリングされる                       | 正常 |
| SG-04 | 金額差表示が存在しないこと（S-6 案A・スコープ確認・防御的テスト） | 任意の items                              | render | 「◯円安い」等の金額差テキストがヘッダー・行のどこにも出力されない | 境界 |

### `shopping-item-row.tsx`（`ShoppingItemRow`。prefix IR）

| #     | 観点                                                     | 前提                                                         | 操作                    | 期待結果                                                                              | 分類 |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------- | ---- |
| IR-01 | pending 表示                                             | `status: 'pending'`                                          | render                  | `role="checkbox"` `aria-checked="false"`・未チェックスタイル                          | 正常 |
| IR-02 | bought 表示                                              | `status: 'bought', actualStoreId, actualPrice: {amount:198}` | render                  | `aria-checked="true"` + 「✓ {店舗名} で ¥198 購入」併記                               | 正常 |
| IR-03 | skipped の型網羅（N-06・到達可能性は低いが型として担保） | `status: 'skipped'`                                          | render                  | `aria-checked="false"`（非 bought は未チェックスタイル。例外を投げない）              | 境界 |
| IR-04 | 数量表示                                                 | `requiredAmount: {value:1, unit:'本'}`                       | render                  | `1本` が表示される                                                                    | 正常 |
| IR-05 | amountNote 表示（B-02）                                  | `requiredAmount: null, amountNote: '適量'`                   | render                  | `適量` が表示される（数量は表示されない）                                             | 境界 |
| IR-06 | チェック操作の結線                                       | `status: 'pending'`                                          | チェックボタン click    | `onToggleExpand(item.id)` が呼ばれる                                                  | 正常 |
| IR-07 | 店舗バッジからの即時再割当                               | `targetStoreId: 'store-a'`                                   | バッジ click → 店舗選択 | `SelectField` に切替わり、選択と同時に `onReassignStore` が呼ばれる（確定ボタンなし） | 正常 |
| IR-08 | 店舗未定バッジ                                           | `targetStoreId: null`                                        | render                  | バッジに「店舗未定」表示                                                              | 境界 |
| IR-09 | 展開時のフォーム表示                                     | `expanded: true`                                             | render                  | 行の下に `PurchaseInputForm` が表示される                                             | 正常 |
| IR-10 | 非展開時は非表示                                         | `expanded: false`                                            | render                  | `PurchaseInputForm` が表示されない                                                    | 正常 |
| IR-11 | submitting 中の disable（O-05）                          | `submitting: true`                                           | render                  | チェックボタン・店舗バッジ操作が disabled                                             | 正常 |
| IR-12 | チェック解除 UI の非搭載（S-3 案A確定・スコープ確認）    | `status: 'bought'`                                           | render                  | 「チェックを外す」等の解除操作ボタンがどこにも存在しない                              | 境界 |

### `purchase-input-form.tsx`（`PurchaseInputForm`。prefix PF）

| #     | 観点                                                   | 前提                                                                      | 操作               | 期待結果                                                                         | 分類 |
| ----- | ------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------- | ---- |
| PF-01 | pending item の初期値                                  | `item.status:'pending', actualStoreId:null, targetStoreId:'store-a'`      | render             | 価格欄は空。実購入店舗の初期選択値が `store-a`（`targetStoreId` フォールバック） | 正常 |
| PF-02 | bought item 再タップ時のプレフィル（N-05・訂正フロー） | `item.status:'bought', actualPrice:{amount:298}, actualStoreId:'store-b'` | render             | 価格欄に `298` がプレフィルされる                                                | 正常 |
| PF-03 | 実購入店舗の初期値優先順位                             | `actualStoreId:'store-b', targetStoreId:'store-a'`                        | render             | 選択値は `actualStoreId`（`store-b`）優先                                        | 境界 |
| PF-04 | 未入力時は送信不可（E-06）                             | 価格未入力 or 店舗未選択                                                  | render             | [購入を記録] ボタンが disabled                                                   | 異常 |
| PF-05 | 価格 0 円の許容（B-04）                                | 価格欄に `0` 入力・店舗選択済み                                           | render             | [購入を記録] ボタンが disabled にならない（`markAsBoughtSchema.min(0)` と整合）  | 境界 |
| PF-06 | 送信の結線                                             | 価格・店舗入力済み                                                        | [購入を記録] click | `onSubmit(price, storeId)` が呼ばれる                                            | 正常 |
| PF-07 | キャンセル                                             | —                                                                         | [キャンセル] click | `onCancel` が呼ばれる                                                            | 正常 |
| PF-08 | submitting 中の disable（O-05）                        | `submitting: true`                                                        | render             | [購入を記録] ボタンが disabled（連打による多重送信を防止）                       | 正常 |

### `add-item-form.tsx`（`AddItemForm`。prefix AF）

| #     | 観点                                             | 前提                                     | 操作                             | 期待結果                                                                                      | 分類 |
| ----- | ------------------------------------------------ | ---------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------- | ---- |
| AF-01 | displayName 未入力時は送信不可（E-06）           | `displayName` 空                         | render                           | [追加] ボタンが disabled                                                                      | 異常 |
| AF-02 | 必須項目充足で送信可能                           | displayName・数量・単位を入力            | render                           | [追加] ボタンが有効化される                                                                   | 正常 |
| AF-03 | 送信内容（N-07・D-6）                            | 必須項目入力済み・`targetStoreId` 未選択 | [追加] click                     | `onAdd({ displayName, requiredAmount, productId: null, targetStoreId: null })` が呼ばれる     | 正常 |
| AF-04 | 店舗未定の明示送信                               | 「店舗未定」オプション選択（value `''`） | [追加] click                     | `targetStoreId: null` で送信される                                                            | 境界 |
| AF-05 | 店舗選択時の送信                                 | 店舗を選択                               | [追加] click                     | 選択した `storeId` が `targetStoreId` として送信される                                        | 正常 |
| AF-06 | 数量 0 の許容（B-05）                            | `requiredAmount.value: 0`                | [追加] click                     | disabled にならず送信できる（`addItemSchema.min(0)` と整合）                                  | 境界 |
| AF-07 | 追加後もフォームは展開維持（recipe-picker 先例） | AF-03 実施後                             | render 確認                      | フォームは開いたまま、入力欄（displayName 等）のみクリアされる（連続追加可能）                | 正常 |
| AF-08 | submitting 中の disable                          | `submitting: true`                       | render                           | [追加] ボタンが disabled                                                                      | 正常 |
| AF-09 | Unit 選択肢の網羅                                | —                                        | `SelectField` のオプションを確認 | `unitSchema.options` 全 17 件が過不足なく描画される（他機能からの import なしのローカル定義） | 境界 |
| AF-10 | productId 選択 UI の非搭載（D-6・スコープ確認）  | —                                        | render                           | 商品検索・選択に相当する UI 要素がどこにも存在しない                                          | 境界 |

### `meal-plan-client.tsx` 追記分（prefix MC。既存 `meal-plan-client.test.tsx` に追加するケース）

モック追加: `client.api['shopping-lists'].$post` を `vi.fn()` で差し替え（既存 `postMealPlan` 等のモックに追加）。

| #     | 観点                         | 前提                           | 操作             | 期待結果                                                                                                   | 分類 |
| ----- | ---------------------------- | ------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------- | ---- |
| MC-01 | CTA ボタンの表示条件         | `mealPlan` あり                | render           | 「買い物リストを作る/開く」ボタンが表示される                                                              | 正常 |
| MC-02 | CTA ボタンの非表示           | `mealPlan: null`               | render           | CTA ボタンが表示されない                                                                                   | 境界 |
| MC-03 | ラベル出し分け（draft）      | `mealPlan.status: 'draft'`     | render           | ラベル「買い物リストを作る」                                                                               | 正常 |
| MC-04 | ラベル出し分け（draft 以外） | `mealPlan.status: 'shopping'`  | render           | ラベル「買い物リストを開く」                                                                               | 正常 |
| MC-05 | RPC 結線・遷移               | `$post` が成功レスポンスを返す | CTA ボタン click | `client.api['shopping-lists'].$post({ json: { mealPlanId: mealPlan.id } })` 呼び出し・成功で `router.push` | 正常 |
| MC-06 | 失敗表示                     | `$post` が `{ ok: false }`     | CTA ボタン click | errorMessage が表示される（既存の作成失敗表示と同一 UI パターン）                                          | 異常 |

---

## API ルートテスト

**追加不要。** `apps/web/src/server/routes/shopping-lists.test.ts`（既存・全 5 API のステータス分岐・Zod
バリデーション 400・`MealPlanNotFoundError`/`ShoppingListNotFoundError`/`ShoppingItemNotFoundError` の
404 変換・`InvalidMealPlanStateError`/`InvalidShoppingListStateError` の 422 変換を担保済み）および
`apps/web/src/server/routes/stores.test.ts`（既存）で担保済み。本ユニットはサーバー側（Domain /
Application / Infrastructure / Hono ルート）を一切変更しないため、追加のルートテストは作成しない。

---

## PWA: Vitest で検証不能な範囲と手動確認

`apps/web/src/app/sw.ts` の `runtimeCaching` は **本番ビルド（`next build --webpack`）でのみ
Serwist が有効になる**（既存 `next.config.ts` の制約）ため、Vitest では検証できない。以下は
manual-browser-verify での確認観点（MB-10〜12。詳細手順は §実画面確認 参照）。

- 手順共通: `pnpm build && pnpm start` でアプリを起動し、対象画面を一度オンラインで開いてから
  Chrome DevTools > Application > Service Workers（または Network タブ）でオフラインをトグルする。
- MB-10: `GET /api/shopping-lists/:id`（`NetworkFirst`）— オンラインで一度開いたリストがオフライン
  再訪問時にも直前のレスポンスで表示される（真っ白にならない・O-01/N-10）。
- MB-11: オフライン時の書き込み操作（チェック・手動追加・店舗再割当）— キュー機構がない（S-5 案A確定）
  ため、いずれも「通信エラーが発生しました。」が表示されるのみであることを確認する（O-02/E-08）。
- MB-12: `GET /api/stores`（`StaleWhileRevalidate`）— DevTools Network タブでキャッシュから即時応答し、
  裏で再検証リクエストが飛ぶことを確認する。

---

## 実画面確認（MB 系。manual-browser-verify で PASS / BLOCKED / FAIL を報告）

| #     | 確認内容                                                                                                                                                 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MB-01 | `/shopping-lists` 初期表示: 今週の MealPlan があり draft のとき「買い物リストを作る」ボタンが表示される                                                  |
| MB-02 | `/shopping-lists`: 今週の MealPlan がない場合の空状態表示 + `/meal-plans` への導線（E-01）                                                               |
| MB-03 | ボタン押下で `/shopping-lists/[id]` に遷移し、店舗ごとにグルーピングされた一覧が表示される。**店舗未定グループが先頭**（D-2）                            |
| MB-04 | 存在しない ID（`/shopping-lists/<random-uuid>`）への直接アクセスで 404 ページが表示される（D-3）                                                         |
| MB-05 | チェック操作 → 購入実績入力パネル展開 → 送信 → bought 表示に切り替わる。連打しても二重送信されない                                                       |
| MB-06 | 手動追加フォームで新規 item を追加。連続追加できる（フォームが閉じない。recipe-picker 同型）                                                             |
| MB-07 | 推奨店舗の変更でアイテムのグループが実際に移動する                                                                                                       |
| MB-08 | `/meal-plans` からの CTA 遷移確認（S-1 両建て: `/meal-plans` のボタン経由 と `/shopping-lists` への直接アクセスの両方が機能する）                        |
| MB-09 | 「温かいキッチン」トークン適用（直接色クラスの混入なし）・モバイル幅（max-w-md）で崩れがない                                                             |
| MB-10 | **PWA**: オフライン再訪問で直前の `GET /:id` レスポンスが表示される（§PWA 手動確認）                                                                     |
| MB-11 | **PWA**: オフラインでの書き込み操作がエラー表示のみになる（§PWA 手動確認）                                                                               |
| MB-12 | **PWA**: `GET /api/stores` の StaleWhileRevalidate 挙動確認（§PWA 手動確認）                                                                             |
| MB-13 | 2 タブ（2 端末相当）で同一リストを開き、片方でチェック操作 → もう片方をフォーカス/手動更新ボタンで最新化されることを確認（D-7・B-07 2 人同時操作の収束） |
| MB-14 | 「買い物リストを作る」ボタンを連打しても ShoppingList が 1 件のみ生成される（冪等性の実確認。API 側は既存試験で担保済み・UI 連打の実挙動確認）           |
| MB-15 | 手動追加フォームを通常操作（クリック連打を伴わない）で使う限り、1 回の送信で 1 行のみ追加される（AddItem 非冪等・UX ガードの実効性確認）                 |

---

## E2E smoke の要否判断

- 既存基盤: `apps/web/e2e/recipe-crud.smoke.spec.ts`（Playwright、レシピ CRUD 1 本のみ）。
  `apps/web/e2e/README.md` の方針は「個人開発・2 人利用のため E2E は網羅せずハッピーパス 1 本に絞る」
  「追加観点が必要になったら（Sprint 3〜4 で画面が増える頃）ここに足す」と明記されており、Sprint 4 が
  その想定タイミングに該当する。
- 一方で meal-plan-screens（Sprint 3 Unit B・同じ L2）は E2E 追加を「推奨・任意」に留め、完了条件には
  含めなかった（実行にはローカル DB が必要でリモート環境では緑判定できないため）。本ユニットも同じ
  制約（DB 必須・リモートでは実行不可）を持つため、**同じ判断（推奨・任意、完了条件に含めない）**を
  踏襲する。
- 追加する場合のシナリオ案（実装時に判断）: `/meal-plans` で献立作成 → CTA から `/shopping-lists/[id]`
  へ遷移 → チェック操作 → 手動追加、のハッピーパス。既存 `recipe-crud.smoke.spec.ts` と同型で
  `apps/web/e2e/shopping-list.smoke.spec.ts`（仮）として追加可能。

---

## 特性観点

- **権限**: 対象外（MVP1 は認証なし。既存画面と同前提）。
- **データ整合性**: サーバーを single source of truth とし、書き込み成功後は更新後 DTO による部分更新
  （LC-05/09/11）、失敗時はロールバック（LC-06/07）、他端末の変更は refetch で収束（LC-14/15・MB-13）
  という 3 系統で担保する。楽観的更新中に refetch が発火した場合は transition 完了後の確定値を優先する
  設計（設計書§データフロー）だが、この競合パターン自体の RTL 再現は複雑度が高いため MB-13 の実画面
  確認で補う。
- **冪等性**: Generate の冪等性自体は Unit A で API 側担保済み（`shopping-lists.test.ts`）。UI 側は
  二重送信ガード（EC-07）と実画面の連打確認（MB-14）のみ。AddItem は非冪等なため UI 側は disable ガード
  （AF-08・LC-17〜18 相当）と実画面確認（MB-15）に留める（設計書のエラー処理節に明記の既存制約）。
- **障害系**: 対象外（外部 I/O は既存 API のみで新規の外部依存を追加しない。DB 障害時の Server Component
  挙動は `products/[id]/page.tsx` 等の既存パターンをそのまま踏襲し、本ユニット固有の新規観点はない）。
- **フロントエンド固有（必須。Presentation 層のため）**: ローディング / 二重送信ガード（EC-07・LC-17〜18・
  PF-08・AF-08）、エラー表示（EC-05/06・LC-06/07/10/13・AF-01・PF-04）、**楽観的更新のロールバック
  （LC-06・LC-07。S-4 の最重要観点）**。
- **防御性**: Domain 層 Entity/VO の変更はないため、DB 復元・防御的コピー等の観点は対象外。一方で
  Presentation 層固有の防御的観点として、(a) 不明な店舗データに対するグルーピングの防御的フォールバック
  （SU-08）、(b) `useEffect` のイベントリスナー解除漏れ検証（LC-16）、(c) スコープ外機能（チェック解除
  UI・金額差表示）が実装に紛れ込んでいないことの確認（SG-04・IR-12・AF-10）を担保する。

---

## メソッド網羅チェック表

| 対象                             | public API / コンポーネント                               | 対応する試験観点 No                                                    |
| -------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| `shopping-list-view.ts`          | `buildStoreNameMap`                                       | SU-01〜02                                                              |
| `shopping-list-view.ts`          | `groupItemsByStore`                                       | SU-03〜09                                                              |
| `shopping-list-view.ts`          | `formatShoppingDate`                                      | SU-10〜12                                                              |
| `shopping-list-entry-client.tsx` | `ShoppingListEntryClient`                                 | EC-01〜08                                                              |
| `shopping-list-client.tsx`       | `ShoppingListClient`                                      | LC-01〜20                                                              |
| `store-group.tsx`                | `StoreGroup`                                              | SG-01〜04                                                              |
| `shopping-item-row.tsx`          | `ShoppingItemRow`                                         | IR-01〜12                                                              |
| `purchase-input-form.tsx`        | `PurchaseInputForm`                                       | PF-01〜08                                                              |
| `add-item-form.tsx`              | `AddItemForm`                                             | AF-01〜10                                                              |
| `meal-plan-client.tsx`（追記分） | `MealPlanClient`（CTA ボタン部分）                        | MC-01〜06（既存 WC-M-01〜11 は回帰試験範囲で別途担保）                 |
| `shopping-lists/page.tsx`        | default（Server Component。named export なし・Next 規約） | MB-01・MB-02・MB-08・MB-14（async SC は RTL 非対応のため実画面で担保） |
| `shopping-lists/[id]/page.tsx`   | default（Server Component）                               | MB-03・MB-04・MB-06・MB-07・MB-09                                      |
| `sw.ts`                          | `runtimeCaching` 追加 3 エントリ                          | MB-10〜12                                                              |

---

## 要件書観点の照合（`docs/requirements/shopping-list-screens.md` §5）

要件書の N/E/B/O ケースを土台に、確定 S-x に照らして採用/対象外を確定する。

### 正常系（N-01〜10）

| 要件書 # | 観点                                      | 対応する試験観点 No                                                                |
| -------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| N-01     | MealPlan あり・未生成 → 作成導線          | EC-04                                                                              |
| N-02     | MealPlan あり・生成済み → 200 既存返却    | EC-04（同一ボタン・同一 RPC で 200/201 双方をカバー）                              |
| N-03     | 店舗ごとの正しいグルーピング              | SU-04・LC-01〜02                                                                   |
| N-04     | チェック→送信成功                         | LC-05                                                                              |
| N-05     | 同一 item への 2 回目チェック（金額訂正） | LC-08・PF-02                                                                       |
| N-06     | skipped item へのチェック                 | IR-03（型網羅として採用。Unit B に到達操作がないため実運用では発生しない旨を注記） |
| N-07     | 手動追加フォームの送信                    | LC-09・AF-03                                                                       |
| N-08     | 推奨店舗の変更                            | LC-11〜12                                                                          |
| N-09     | 店舗名の解決                              | SU-01・SG-02                                                                       |
| N-10     | オフライン読み取り（再訪問）              | MB-10（Vitest 検証不可・PWA 手動確認）                                             |

### 異常系（E-01〜08）

| 要件書 # | 観点                               | 対応する試験観点 No                                                                                                                                                  |
| -------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-01     | 今週の MealPlan が存在しない       | EC-01                                                                                                                                                                |
| E-02     | 生成 POST が 404                   | EC-05                                                                                                                                                                |
| E-03     | 生成 POST が 422                   | EC-05                                                                                                                                                                |
| E-04     | AddItem が 422（completed ガード） | LC-10（`!ok` 全般で UI は一律「操作に失敗しました。」表示のため個別エラーコード別の分岐試験は不要。API 側の 422 変換自体は既存 `shopping-lists.test.ts` で担保済み） |
| E-05     | bought/target-store が 404         | LC-06・LC-13                                                                                                                                                         |
| E-06     | Zod バリデーション失敗（400）      | AF-01・PF-04                                                                                                                                                         |
| E-07     | ネットワークエラー                 | EC-06・LC-07                                                                                                                                                         |
| E-08     | オフライン時の書き込み操作         | MB-11（Vitest では `LC-07` の通信エラーロジックで代替担保。実オフラインは PWA 手動確認）                                                                             |

### 境界条件（B-01〜07）

| 要件書 # | 観点                                  | 対応する試験観点 No                                                                                                                                                                          |
| -------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-01     | `targetStoreId === null` の item      | SU-03・LC-01                                                                                                                                                                                 |
| B-02     | `amountNote` のみの item              | IR-04〜05・LC-20                                                                                                                                                                             |
| B-03     | items 0 件のリスト                    | LC-03                                                                                                                                                                                        |
| B-04     | `actualPrice.amount = 0`              | PF-05                                                                                                                                                                                        |
| B-05     | `requiredAmount.value = 0` の手動追加 | AF-06                                                                                                                                                                                        |
| B-06     | 一意な productId 多数（性能境界）     | **対象外**（理由: S-6 確定 = 案A「推奨店舗バッジのみ」。金額差表示自体を実装しないため `GET /api/products/:id` の N+1 呼び出しコードパスが存在せず、当該観点は本ユニットでは検証不能・不要） |
| B-07     | 2 人が同時に同じ item をチェック      | LC-14〜15・MB-13（refetch による収束で担保。API 側の後勝ち上書きは Unit A 試験で担保済み）                                                                                                   |

### オフライン・楽観的更新のロールバック観点（O-01〜05）

| 要件書 # | 観点                                     | 対応する試験観点 No                                                                                                                                                                |
| -------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O-01     | オフライン状態で画面を再読み込み         | MB-10                                                                                                                                                                              |
| O-02     | オフライン状態でチェック操作（書き込み） | LC-07（ロジック相当）+ MB-11（実オフライン）。要件書の「キューあり採用時」分岐は**対象外**（理由: S-5 確定 = 案A。キュー機構を実装しないため「同期待ち」等の UI 状態は存在しない） |
| O-03     | 楽観的更新中に 404/422 が返る            | **LC-06（最重要）**                                                                                                                                                                |
| O-04     | 楽観的更新中にネットワークエラー         | **LC-07（最重要）**                                                                                                                                                                |
| O-05     | 連打（二重送信ガード）                   | LC-18・PF-08・IR-11・EC-07                                                                                                                                                         |

### 対象外化ケース一覧（理由つき）

| ケース                                   | 理由                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| B-06                                     | S-6 確定 = 案A（推奨店舗バッジのみ）。金額差表示（案B/C）は実装しないため、N+1 相当のコードパス自体が存在しない。               |
| O-02 の「キューあり採用時」分岐          | S-5 確定 = 案A（読み取りキャッシュのみ）。書き込みキューを実装しないため「同期待ち」UI は存在しない。                           |
| チェック解除（bought→pending）操作の試験 | S-3 確定 = 案A（実装しない）。UI 自体が存在しないため操作の試験対象がない。代わりに IR-12 で「UI が存在しないこと」を確認する。 |

---

## 回帰試験範囲

- `meal-plan-client.test.tsx` 既存 WC-M-01〜11 が green のまま（CTA ボタン追加による回帰がないこと）。
- `history-week-card.test.tsx` / `planned-recipe-item.test.tsx` / `recipe-picker.test.tsx` が green のまま
  （meal-plan-client.tsx への追記が影響しないこと）。
- `product-list-client.test.tsx` 既存 4 ケース（WC-P-01〜04）が green のまま。
- 既存 API ルートテスト（`shopping-lists.test.ts` / `stores.test.ts` / `meal-plans.test.ts` /
  `recipes.test.ts` / `products.test.ts`）が green のまま（サーバー側は無変更のため回帰なし前提）。
- 既存 E2E smoke（`recipe-crud.smoke.spec.ts`）が green のまま。
- `/meal-plans` 画面の既存フロー（作成・レシピ追加・削除）が実画面で回帰なく動作すること（MB-08 に統合）。

## 試験データ

- `ShoppingListDto` / `ShoppingItemDto` フィクスチャ: `createShoppingListDto(overrides)` /
  `createShoppingItemDto(overrides)` ヘルパを各テストファイルにローカル定義（`meal-plan-client.test.tsx`
  の `createMealPlanDto` 先例踏襲。UUID は固定値リテラル、`shoppingListDto` 等は既存
  `shopping-lists.test.ts` の値を流用して一貫性を持たせる）。既定値: `shoppingDate: '2026-07-11'`・
  `status: 'active'`・item 既定 `status: 'pending'`・`requiredAmount: {value:1, unit:'本'}`。
- `StoreDto` フィクスチャ: `createStoreDto(overrides)`。既定 2 件（店舗X・店舗Y）+ 「不明な店舗」検証用に
  `stores` に含まれない固定 UUID を用意。
- `MealPlanDto` フィクスチャ: 既存 `meal-plan-client.test.tsx` の `createMealPlanDto` を流用
  （`status: 'draft'` / `'shopping'` の出し分けに使用）。
- 店舗未定 item: `targetStoreId: null`。
- 不明な店舗 item（SU-08 用）: `stores` に存在しない固定 UUID を `targetStoreId` に設定。
- amountNote item（B-02 用）: `requiredAmount: null, amountNote: '適量'`。

## 完了条件

**必須（リリースブロッカー）**

- SU-01〜12・EC-01〜08・LC-01〜20・SG-01〜04・IR-01〜12・PF-01〜08・AF-01〜10・MC-01〜06 全件が
  Vitest で green。**特に LC-06/LC-07（楽観的更新ロールバック）・SU-03/LC-01（D-2 グルーピング順）・
  LC-14/LC-15（D-7 refetch）は最重要観点として個別に green を確認する。**
- `pnpm lint` / `pnpm type-check` / `pnpm test` 全 green（回帰試験範囲を含む）。
- MB-01〜09・MB-13〜15 が manual-browser-verify で全 PASS。
- MB-10〜12（PWA）が `pnpm build && pnpm start` + Chrome DevTools オフライン再現で PASS。

**推奨（任意）**

- E2E smoke（`shopping-list.smoke.spec.ts` 仮）の追加（受け入れレビュー時に判断）。
