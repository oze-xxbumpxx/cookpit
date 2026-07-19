# 試験計画: pantry-screens

- 前提となる設計書: `docs/designs/pantry-screens.md`（確定。P-1〜P-6 全件ユーザー確定済み・全件推奨案 A 採用。D-1〜D-8 確定済み）
- 要件定義書: なし（設計書冒頭のとおり、Orchestrator 作業指示 + `docs/designs/pantry-core.md` 確定契約を
  入力とする。設計書 §要件の要点をそのまま試験観点に反映する。手順8の要件書照合は対象外）
- 先例: `docs/tests/shopping-list-screens.md`（Sprint 4 Unit B・直近先例。粒度・形式をこれに揃える）
- 実装計画: `docs/implementation-plans/pantry-screens.md`（並行作成。本計画と矛盾しないこと）
- レベル: L2（`apps/web` Presentation 層のみ。Domain / Application / Infrastructure / API Contract 変更なし）
- 実装ルート: Codex 委譲（IMP-2026-025 効果実測対象）。review-codex-implementation の Tailwind タイポ検査が
  完了条件に含まれる（設計書 §テスト方針）。

---

## 試験種別

| 種別             | 対象                                                                                    | ランナー / 手段                                                                                                                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 単体（純関数）   | `pantry/_utils/pantry-view.ts`                                                          | Vitest node 環境（`*.node.test.ts`。`shopping-list-view.node.test.ts` 先例）                                                                                                                          |
| コンポーネント   | `pantry/_components/*.tsx` + `shopping-list-client.tsx` / `meal-plan-client.tsx` 追記分 | Vitest + RTL（`*.test.tsx`、happy-dom 環境）                                                                                                                                                          |
| Server Component | `pantry/page.tsx`                                                                       | RTL 対象外（async Server Component は RTL 非対応）→ type-check + 実画面確認（MB 系）で担保                                                                                                            |
| API ルート       | `pantry.ts` / `shopping-lists.ts`                                                       | **追加不要**。既存 `pantry.test.ts`（Unit A・GET/consume/discard の全ステータス分岐を担保済み）/ `shopping-lists.test.ts`（`/:id/complete` を担保済み）で担保済み。本ユニットはサーバー側を変更しない |
| 実画面           | 全画面 + 導線                                                                           | manual-browser-verify スキル（MB 系）。Codex 委譲のため Tailwind タイポ検査を含む                                                                                                                     |
| E2E smoke        | ハッピーパス                                                                            | Playwright（ローカル `pnpm e2e`）。**推奨・任意**（§E2E smoke の要否判断 参照）                                                                                                                       |

新規テストのファイルパスは vitest `include`（`apps/web/vitest.node.config.mts` の
`src/**/*.node.test.ts` / `src/server/**/*.test.ts`、`apps/web/vitest.dom.config.mts` の
`src/**/*.dom.test.ts` / `src/**/*.test.tsx`）と整合させる:

- `apps/web/src/app/pantry/_utils/pantry-view.node.test.ts`
- `apps/web/src/app/pantry/_components/pantry-client.test.tsx`
- `apps/web/src/app/pantry/_components/location-group.test.tsx`
- `apps/web/src/app/pantry/_components/stock-row.test.tsx`
- `apps/web/src/app/shopping-lists/_components/shopping-list-client.test.tsx`（既存ファイルへの追記。
  既存 `LC-01〜22` と衝突しないよう新規ケースは `CB-xx` プレフィックスを用いる）
- `apps/web/src/app/meal-plans/_components/meal-plan-client.test.tsx`（既存ファイルへの追記。既存
  `WC-M-01〜11` / `MC-01〜06`〈買い物リスト CTA〉と衝突しないよう新規ケースは `MN-xx` プレフィックスを用いる）

---

## 単体試験観点（`pantry-view.node.test.ts`。prefix PV）

| #     | 観点                                                       | 前提                                                                                          | 操作                                                              | 期待結果                                                                                                                                          | 分類 |
| ----- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| PV-01 | 固定順（P-3・**重点**）                                    | `stocks` に `fridge`/`freezer`/`pantry`/`null` の 4 パターンを 1 件ずつ、逆順で混在させて用意 | `groupStocksByLocation(stocks)`                                   | 出力配列の順序が常に `fridge → freezer → pantry → 未設定(null)`（元の並び順に依らない。shopping-list の「未定を先頭固定」とは逆順である点に注意） | 境界 |
| PV-02 | 0 件グループの除外                                         | `stocks` が `fridge` と `null` のみ（`freezer`/`pantry` は 0 件）                             | `groupStocksByLocation(stocks)`                                   | 出力は 2 グループのみ（`freezer`/`pantry` のグループ自体が出力されない）                                                                          | 境界 |
| PV-03 | 全件 `storedLocation === null`（**MVP1 実態・重点**。P-3） | `stocks` 全件 `storedLocation: null`                                                          | `groupStocksByLocation(stocks)`                                   | 出力は「保存場所未設定」の単一グループのみ（`location: null, label: '保存場所未設定'`）                                                           | 境界 |
| PV-04 | 空配列                                                     | —                                                                                             | `groupStocksByLocation([])`                                       | 空配列を返す                                                                                                                                      | 境界 |
| PV-05 | 同一ロケーション内の複数 stock 集約                        | `fridge` の stock 2 件                                                                        | `groupStocksByLocation(stocks)`                                   | 同一グループに 2 件とも含まれ、元の配列順を維持する                                                                                               | 正常 |
| PV-06 | ラベルマッピングの網羅（過不足なし固定）                   | `fridge`/`freezer`/`pantry`/`null` の 4 パターンを含む `stocks`                               | `groupStocksByLocation(stocks)`                                   | `label` が `'冷蔵'`/`'冷凍'`/`'常温'`/`'保存場所未設定'` と 1 対 1 で一致する（`toEqual` で 4 パターン全件固定）                                  | 境界 |
| PV-07 | `formatExpiresAt` 通常日                                   | —                                                                                             | `formatExpiresAt('2026-08-01')`                                   | `'8/1まで'`                                                                                                                                       | 正常 |
| PV-08 | `formatExpiresAt` 年またぎ境界                             | —                                                                                             | `formatExpiresAt('2026-12-31')` / `formatExpiresAt('2027-01-01')` | それぞれ `'12/31まで'` / `'1/1まで'`（`shopping-list-view.ts` SU-11 と同型の月またぎ・年またぎバグ検出）                                          | 境界 |

---

## コンポーネント試験観点

### `pantry-client.tsx`（`PantryClient`。prefix PC）

モック: `vi.mock('@/lib/api-client')`（`client.api.pantry.$get` / `client.api.pantry.stocks[':stockId'].consume.$post` /
`client.api.pantry.stocks[':stockId'].discard.$post` を `vi.fn()` で個別差し替え）。子コンポーネント
（`LocationGroup` / `StockRow`）はモックせず実物を使用する（`shopping-list-client.test.tsx` 先例に合わせ、
状態が複数コンポーネントをまたいで正しく伝播することを検証する）。

| #     | 観点                                                                      | 前提                                                                                                         | 操作                                                     | 期待結果                                                                                                                            | 分類 |
| ----- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---- |
| PC-01 | 在庫 0 件の空状態                                                         | `pantry: { stocks: [] }`                                                                                     | render                                                   | 「在庫がありません」表示                                                                                                            | 境界 |
| PC-02 | 保存場所別グルーピング表示（複数グループ）                                | `fridge`/`freezer`/`null` を含む `stocks`                                                                    | render                                                   | 各グループヘッダー（冷蔵/冷凍/保存場所未設定）配下に対応 stock のみ表示され、PV-01 の固定順で並ぶ                                   | 正常 |
| PC-03 | MVP1 実態: 単一〈未設定〉グループ表示（P-3・**重点**）                    | 全件 `storedLocation: null` の `stocks`                                                                      | render                                                   | 「保存場所未設定」の単一グループのみ表示される                                                                                      | 境界 |
| PC-04 | 「使った」成功で stock が一覧から消える（P-2 案A）                        | `consume.$post` が成功レスポンス（更新後 `PantryDto`。当該 stock は含まれない）を返す                        | 対象 stock の「使った」ボタン click                      | 当該 stock が一覧から消える（他 stock は残る）                                                                                      | 正常 |
| PC-05 | 消費量は残量全部をそのまま送信（P-2 案A・**最重要**）                     | `stock.amount = { value: 300, unit: 'ml' }`                                                                  | 「使った」ボタン click                                   | `consume.$post` が `{ param: { stockId }, json: { amount: { value: 300, unit: 'ml' } } } `（`stock.amount` と完全一致）で呼ばれる   | 正常 |
| PC-06 | 「捨てた」成功で stock が消える                                           | `discard.$post` が成功レスポンス（当該 stock を含まない `PantryDto`）を返す                                  | 対象 stock の「捨てた」ボタン click                      | 当該 stock が一覧から消える（残量に関わらず）                                                                                       | 正常 |
| PC-07 | consume 失敗時のエラー表示（404/422）                                     | `consume.$post` が `{ ok: false }`                                                                           | 「使った」ボタン click                                   | `errorMessage`「操作に失敗しました。」表示。一覧は変化しない                                                                        | 異常 |
| PC-08 | discard 失敗時のエラー表示（404）                                         | `discard.$post` が `{ ok: false }`                                                                           | 「捨てた」ボタン click                                   | `errorMessage`「操作に失敗しました。」表示。一覧は変化しない                                                                        | 異常 |
| PC-09 | 通信エラー時の表示                                                        | `consume.$post` / `discard.$post` が reject                                                                  | いずれかのボタン click                                   | `errorMessage`「通信エラーが発生しました。」表示                                                                                    | 異常 |
| PC-10 | 操作中 stock のみ disable（D-6・**重点**）                                | stock 2 件・stock A の `consume.$post` が未解決 Promise                                                      | stock A の「使った」click 直後に render 確認             | stock A の「使った」「捨てた」双方が disabled。stock B は操作可能なまま                                                             | 正常 |
| PC-11 | 連打時の二重送信ガード（D-6）                                             | `consume.$post` が未解決 Promise                                                                             | 同一 stock の「使った」を連打                            | `consume.$post` は 1 回のみ呼ばれる（`submittingStockId` によるガード）                                                             | 正常 |
| PC-12 | フォーカス復帰での silent refetch（D-7）                                  | `$get` が最新 `PantryDto`（stock 1 件が消えている）を返す                                                    | `window` に `focus` イベントを dispatch                  | `$get` が呼ばれ、stocks state が最新レスポンスで置換される。`errorMessage` は表示されない（silent）                                 | 正常 |
| PC-13 | 手動更新ボタンでの refetch（D-7）                                         | `$get` が失敗レスポンスを返す                                                                                | 「更新」ボタン click                                     | `$get` が呼ばれ、失敗時は `errorMessage`「操作に失敗しました。」が表示される（silent ではない）                                     | 異常 |
| PC-14 | アンマウント時のリスナー解除（防御性・副作用検証）                        | render 後 `unmount()`                                                                                        | `unmount()` 後に `window` へ `focus` イベントを dispatch | `$get` が呼ばれない（クリーンアップ漏れによる意図しない refetch が発生しない）                                                      | 防御 |
| PC-15 | ヘッダー表示                                                              | 任意の `pantry`                                                                                              | render                                                   | 「戻る」`href="/meal-plans"` + タイトル「在庫」+ 「更新」ボタンが表示される                                                         | 正常 |
| PC-16 | 更新後 `PantryDto` による丸ごと state 置換（D-5・データ整合性・**重点**） | 2 件の stock。`consume.$post` の応答 `PantryDto` に、送信していない別 stock の `amount` も変化した値を含める | 対象 stock の「使った」click                             | 応答 `PantryDto` の内容がそのまま state に反映される（送信していない stock もサーバー返却値どおりに更新される。部分マージではない） | 正常 |
| PC-17 | エラー後の再操作でエラーバナーがクリアされる                              | PC-07 実施後（`errorMessage` 表示中）                                                                        | 別 stock の「使った」を click（成功レスポンス）          | 新規操作開始時に `errorMessage` がクリアされる                                                                                      | 正常 |

### `location-group.tsx`（`LocationGroup`。prefix LG）

| #     | 観点                                             | 前提                                                                            | 操作                | 期待結果                                                                | 分類 |
| ----- | ------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------- | ---- |
| LG-01 | ラベル出し分けの網羅（過不足なし固定）           | `location` を `'fridge'`/`'freezer'`/`'pantry'`/`null` の4パターンで render     | render（4パターン） | ヘッダーがそれぞれ `'冷蔵'`/`'冷凍'`/`'常温'`/`'保存場所未設定'` になる | 境界 |
| LG-02 | stock 一覧の展開                                 | `stocks` 3 件                                                                   | render              | `StockRow` が 3 件レンダリングされる                                    | 正常 |
| LG-03 | 0 件 stocks を渡された場合の防御的挙動（防御性） | `stocks: []`（設計上呼び出し側が 0 件グループを渡さない前提だが、防御的に確認） | render              | 例外を投げず、ヘッダーのみ表示され `StockRow` は 0 件                   | 防御 |

### `stock-row.tsx`（`StockRow`。prefix SR）

| #     | 観点                                                          | 前提                                                       | 操作            | 期待結果                                                                                  | 分類 |
| ----- | ------------------------------------------------------------- | ---------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------- | ---- |
| SR-01 | `displayName` + 数量表示                                      | `displayName: '牛乳', amount: { value: 1000, unit: 'ml' }` | render          | `牛乳` と `1000ml` が表示される                                                           | 正常 |
| SR-02 | `expiresAt` 非 null 時の併記（賞味期限・後方互換表示）        | `expiresAt: '2026-08-01'`                                  | render          | 「〜8/1まで」が小さく併記される（`formatExpiresAt` 結線）                                 | 境界 |
| SR-03 | `expiresAt` null 時は非表示（**MVP1 通常ケース**）            | `expiresAt: null`                                          | render          | 賞味期限の併記テキストが表示されない                                                      | 正常 |
| SR-04 | 「使った」ボタンの結線                                        | `submitting: false`                                        | 「使った」click | `onConsume(stock.id)` が呼ばれる（`variant="outline"`）                                   | 正常 |
| SR-05 | 「捨てた」ボタンの結線                                        | `submitting: false`                                        | 「捨てた」click | `onDiscard(stock.id)` が呼ばれる（`variant="destructive"`）                               | 正常 |
| SR-06 | submitting 中の disable（O-05 相当）                          | `submitting: true`                                         | render          | 「使った」「捨てた」双方が disabled                                                       | 正常 |
| SR-07 | 確認ダイアログの非搭載（P-4/P-6 案A確定・スコープ確認・防御） | 任意の `stock`                                             | 各ボタン click  | AlertDialog 等の確認 UI がどこにも出現しない（即座に `onConsume`/`onDiscard` が呼ばれる） | 境界 |

### `shopping-list-client.tsx` 追記分（買い物完了。prefix CB。既存 `shopping-list-client.test.tsx` への追加）

モック追加: `client.api['shopping-lists'][':id'].complete.$post` を `vi.fn()` で差し替え（既存の
`$get` / `.items.$post` 等のモックに追加）。

| #     | 観点                                                                      | 前提                                                                  | 操作                       | 期待結果                                                                                                                                     | 分類 |
| ----- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| CB-01 | `active` 時のみボタン表示                                                 | `shoppingList.status: 'active'`                                       | render                     | 「買い物完了」ボタンが表示される                                                                                                             | 正常 |
| CB-02 | `completed` 時はボタン・手動追加ボタンとも非表示（設計 §データフロー）    | `shoppingList.status: 'completed'`                                    | render                     | 「買い物完了」ボタンおよび「手動で追加」ボタンが両方とも表示されない                                                                         | 境界 |
| CB-03 | RPC 結線                                                                  | `complete.$post` が成功レスポンスを返す                               | 「買い物完了」ボタン click | `client.api['shopping-lists'][':id'].complete.$post({ param: { id: shoppingList.id } })` が呼ばれる                                          | 正常 |
| CB-04 | 成功時の表示切替（P-5 案A・**最重要**）                                   | `complete.$post` が `status: 'completed'` の `ShoppingListDto` を返す | 「買い物完了」ボタン click | 成功バナー「買い物を完了しました」+「在庫を見る」リンク（`href="/pantry"`）が表示され、`status` ローカル state が `'completed'` に更新される | 正常 |
| CB-05 | 自動遷移しないこと（P-5 案A・防御・**重点**）                             | CB-04 と同前提                                                        | 「買い物完了」ボタン click | `router.push` / `router.refresh` のいずれも呼ばれない（画面に留まる）                                                                        | 境界 |
| CB-06 | 失敗時のエラー表示                                                        | `complete.$post` が `{ ok: false }`                                   | 「買い物完了」ボタン click | `completeErrorMessage`「操作に失敗しました。」表示。`status` は変化しない                                                                    | 異常 |
| CB-07 | 通信エラー時の表示                                                        | `complete.$post` が reject                                            | 「買い物完了」ボタン click | 「通信エラーが発生しました。」表示                                                                                                           | 異常 |
| CB-08 | 確認ダイアログの非搭載（P-4 案A確定・スコープ確認・防御）                 | `shoppingList.status: 'active'`                                       | 「買い物完了」ボタン click | AlertDialog 等の確認 UI が出現せず即座に `complete.$post` が呼ばれる                                                                         | 境界 |
| CB-09 | 処理中は disable（二重送信防止）                                          | `complete.$post` が未解決 Promise                                     | click 直後に render 確認   | 「買い物完了」ボタンが disabled                                                                                                              | 正常 |
| CB-10 | 連打時の二重送信ガード                                                    | `complete.$post` が未解決 Promise                                     | 「買い物完了」ボタンを連打 | `complete.$post` は 1 回のみ呼ばれる（`completeSubmitting` によるガード）                                                                    | 正常 |
| CB-11 | 完了後も既存フロー（チェック・店舗再割当）が阻害されないこと（回帰・R-5） | CB-04 実施後、`items` に `pending` item が残っている想定              | render 確認                | 手動追加ボタンのみ非表示になり、既存のチェック・店舗再割当 UI 自体は変化しない（設計 §データフロー「既存どおり残す」）                       | 境界 |

### `meal-plan-client.tsx` 追記分（在庫リンク。P-1 案A。prefix MN。既存 `meal-plan-client.test.tsx` への追加）

| #     | 観点                                  | 前提                               | 操作   | 期待結果                                                                                                                                                   | 分類 |
| ----- | ------------------------------------- | ---------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| MN-01 | 「在庫」リンクの表示・遷移先          | 任意の `mealPlan`（`null` を含む） | render | ヘッダーに「在庫」リンク（`href="/pantry"`）が表示される（`mealPlan` の有無に関わらず常時表示）                                                            | 正常 |
| MN-02 | 既存導線リンクへの非回帰（R-5・防御） | 任意の `mealPlan`                  | render | 既存の「レシピ」（`/recipes`）「商品」（`/products`）「履歴」（`/meal-plans/history`）リンクの href・表示順が変化しない（既存 `WC-M-11` の期待を壊さない） | 境界 |

---

## 実画面確認（MB 系。manual-browser-verify で PASS / BLOCKED / FAIL を報告）

Codex 委譲のため review-codex-implementation の Tailwind タイポ検査を実装レビューと合わせて実施する。

| #     | 確認内容                                                                                                                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| MB-01 | `/pantry` 初期表示: Server Component が `pantryRepository()`（共有ファクトリ経由・D-3）で在庫一覧を取得し表示する                                  |
| MB-02 | `/pantry`: 在庫 0 件時の空状態表示                                                                                                                 |
| MB-03 | `/pantry`: MVP1 実データでは「保存場所未設定」の単一グループのみが表示されること（P-3 の見え方の実確認）                                           |
| MB-04 | 「使った」ボタンで対象 stock が消え、在庫がサーバー側でも消費されている（再読み込みで再出現しない）ことを確認                                      |
| MB-05 | 「捨てた」ボタンで対象 stock が消え、再読み込みで再出現しないことを確認                                                                            |
| MB-06 | `/meal-plans` ヘッダーの「在庫」リンクから `/pantry` へ遷移できる（P-1）                                                                           |
| MB-07 | `/shopping-lists/[id]` で「買い物完了」→ 成功バナー + 「在庫を見る」リンクから `/pantry` へ遷移できる（P-5）                                       |
| MB-08 | 「温かいキッチン」トークン適用（直接色クラスの混入なし）・モバイル幅（max-w-md）で崩れがない（新規 3 コンポーネント + 2 追記箇所すべて）           |
| MB-09 | `/meal-plans` / `/shopping-lists/[id]` の既存フロー（作成・レシピ追加・削除・チェック・手動追加・店舗再割当）が実画面で回帰なく動作すること（R-5） |
| MB-10 | 2 タブ（2 端末相当）で `/pantry` を開き、片方で「使った」操作 → もう片方をフォーカス/手動更新ボタンで最新化されることを確認（D-7）                 |

---

## E2E smoke の要否判断

- 既存基盤: `apps/web/e2e/recipe-crud.smoke.spec.ts`（Playwright、レシピ CRUD 1 本のみ）。方針は
  「個人開発・2 人利用のため E2E は網羅せずハッピーパス 1 本に絞る」。
- `shopping-list-screens`（Sprint 4 Unit B・同じ L2）は E2E 追加を「推奨・任意」に留め、完了条件には
  含めなかった（実行にはローカル DB が必要でリモート環境では緑判定できないため）。本ユニットも同じ
  制約（DB 必須・リモートでは実行不可）を持つため、**同じ判断（推奨・任意、完了条件に含めない）**を
  踏襲する。
- 追加する場合のシナリオ案（実装時に判断）: `/shopping-lists/[id]` で「買い物完了」→ 成功バナーから
  `/pantry` へ遷移 → 「使った」/「捨てた」操作、のハッピーパス。`apps/web/e2e/pantry.smoke.spec.ts`
  （仮）として追加可能。

---

## 特性観点

- **権限**: 対象外（MVP1 は認証なし。既存画面と同前提）。
- **データ整合性**: サーバーを single source of truth とする。consume/discard は D-5 により**更新後
  `PantryDto` で state を丸ごと置換**する方式（shopping-list の部分マージ〈LC-05 等〉とは意図的に異なる。
  PC-16 で担保）。買い物完了は応答 `ShoppingListDto` で `status` のみ更新（自動遷移なし。CB-04/05）。
  他端末との同期はフォーカス refetch + 手動更新ボタンで収束（PC-12/13・MB-10）。
- **冪等性**: 「買い物完了」は既存 API 側で冪等性担保済み（`shopping-lists.test.ts`）。UI 側は二重送信
  ガード（CB-09/10）のみ追加で検証する。consume/discard は**非冪等**（設計 §エラー処理で明記）。
  `submittingStockId` による UI ガード（PC-10/11）で二重送信自体を防ぐが、完全な冪等性は保証されない
  （R-4）。この限界はサーバー側 Zod 検証（`amount.value` positive）が最終防衛線であり Unit A の試験で
  担保済みのため、本試験計画では UI ガードの実効性確認までとする。
- **障害系**: 対象外（外部 I/O は既存 4 API のみで新規の外部依存を追加しない。DB 障害時の Server
  Component 挙動は `shopping-lists/[id]/page.tsx` 等の既存パターンをそのまま踏襲し、本ユニット固有の
  新規観点はない）。
- **フロントエンド固有（必須。Presentation 層のため）**: ローディング / 二重送信ガード（PC-10/11・CB-09/10・
  SR-06）、エラー表示（PC-07/08/09・CB-06/07）。**楽観的更新のロールバック観点は対象外**（理由: D-5 で
  `useOptimistic` を採用せず「レスポンス確定後の丸ごと置換」を選択しているため、楽観的パッチ・ロール
  バックというコードパス自体が存在しない。shopping-list-screens の LC-06/07 相当は本ユニットには適用
  されない）。
- **防御性**: Domain 層 Entity/VO の変更はないため、DB 復元・防御的コピー等の観点は対象外。一方で
  Presentation 層固有の防御的観点として、(a) `useEffect` のイベントリスナー解除漏れ検証（PC-14）、
  (b) スコープ外機能（消費・廃棄の確認ダイアログ、チェック解除に相当する取り消し UI）が実装に紛れ込んで
  いないことの確認（SR-07・CB-08）、(c) `expiresAt` 非 null 時の表示ロジックが将来のための後方互換
  実装として壊れていないことの確認（SR-02。MVP1 では常に null だが表示ロジック自体は存在するため）、
  (d) `location-group` への 0 件 stocks 呼び出しに対する防御的挙動（LG-03）を担保する。

---

## メソッド網羅チェック表

| 対象                                 | public API / コンポーネント                                                                     | 対応する試験観点 No                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `pantry-view.ts`                     | `groupStocksByLocation`                                                                         | PV-01〜06                                             |
| `pantry-view.ts`                     | `formatExpiresAt`                                                                               | PV-07〜08                                             |
| `pantry-client.tsx`                  | `PantryClient`                                                                                  | PC-01〜17                                             |
| `location-group.tsx`                 | `LocationGroup`                                                                                 | LG-01〜03                                             |
| `stock-row.tsx`                      | `StockRow`                                                                                      | SR-01〜07                                             |
| `shopping-list-client.tsx`（追記分） | `ShoppingListClient`（「買い物完了」部分。既存 `LC-01〜22` は回帰試験範囲で別途担保）           | CB-01〜11                                             |
| `meal-plan-client.tsx`（追記分）     | `MealPlanClient`（「在庫」リンク部分。既存 `WC-M-01〜11`/`MC-01〜06` は回帰試験範囲で別途担保） | MN-01〜02                                             |
| `pantry/page.tsx`                    | default（Server Component。named export なし・Next 規約）                                       | MB-01〜03（async SC は RTL 非対応のため実画面で担保） |

---

## 回帰試験範囲

- `shopping-list-client.test.tsx` 既存 `LC-01〜22`（チェック・購入実績入力・楽観的更新ロールバック・
  手動追加・店舗再割当・refetch 等）が green のまま（「買い物完了」追記による回帰がないこと）。
- `meal-plan-client.test.tsx` 既存 `WC-M-01〜11`（作成・レシピ追加/削除・ヘッダー導線）および
  `MC-01〜06`（買い物リスト CTA）が green のまま（「在庫」リンク追記による回帰がないこと）。
- 既存 API ルートテスト（`pantry.test.ts` / `shopping-lists.test.ts` / `meal-plans.test.ts` /
  `recipes.test.ts` / `products.test.ts` / `stores.test.ts`）が green のまま（サーバー側は無変更のため
  回帰なし前提）。
- 既存 E2E smoke（`recipe-crud.smoke.spec.ts`）が green のまま。
- `/shopping-lists/[id]` の既存 Server Component（`notFound()` 委譲。D-8）が変更されないこと（コード上の
  差分確認。テストは既存のまま）。
- `/meal-plans` / `/shopping-lists/[id]` 画面の既存フローが実画面で回帰なく動作すること（MB-09 に統合）。

## 試験データ

- `StockDto` フィクスチャ: `createStockDto(overrides)` を各テストファイルにローカル定義
  （`createShoppingItemDto` 先例踏襲）。既定値: `id` は固定 UUID リテラル、`productId: null`、
  `displayName: '牛乳'`、`amount: { value: 1000, unit: 'ml' }`、`purchasedAt: '2026-07-11T01:00:00.000Z'`、
  `expiresAt: null`、`storedLocation: null`（MVP1 実態）。
- `PantryDto` フィクスチャ: `{ stocks: [...] }`。
- グルーピング境界検証用（PV-01/PC-02）: `fridge`/`freezer`/`pantry`/`null` を 1 件ずつ含む `stocks` セット。
- 単一グループ検証用（PV-03/PC-03。MVP1 実態）: 全件 `storedLocation: null` の `stocks` セット。
- 賞味期限検証用（SR-02・PV-07/08）: `expiresAt: '2026-08-01'` / `'2026-12-31'` / `'2027-01-01'`。
- `ShoppingListDto` フィクスチャ: 既存 `shopping-list-client.test.tsx` の `createShoppingListDto` を流用し、
  `status: 'active'` / `'completed'` の両方を検証する（CB-01〜02）。
- `MealPlanDto` フィクスチャ: 既存 `meal-plan-client.test.tsx` の `createMealPlanDto` を流用（`mealPlan: null`
  を含む 2 パターンで MN-01 を確認）。

## 完了条件

**必須（リリースブロッカー）**

- PV-01〜08・PC-01〜17・LG-01〜03・SR-01〜07・CB-01〜11・MN-01〜02 全件が Vitest で green。**特に
  PC-05（P-2 全量消費の送信内容）・PV-01/PC-03（P-3 固定順・MVP1 実態の単一グループ）・CB-04/05（P-5
  自動遷移しないこと）・PC-16（D-5 丸ごと置換）は最重要観点として個別に green を確認する。**
- `pnpm lint` / `pnpm type-check` / `pnpm test` 全 green（回帰試験範囲を含む）。
- MB-01〜10 が manual-browser-verify で全 PASS（Codex 委譲のため Tailwind タイポ検査を含む）。
- `pantry/page.tsx` が `apps/web/src/server/repositories.ts` の `pantryRepository()` を経由しており、
  `new DrizzlePantryRepository(getDb())` を画面側で直接書いていないこと（D-3。実装レビューでコード上
  確認する。既存 2 画面の先例逸脱点であるため見落としやすい）。

**推奨（任意）**

- E2E smoke（`pantry.smoke.spec.ts` 仮）の追加（受け入れレビュー時に判断）。
