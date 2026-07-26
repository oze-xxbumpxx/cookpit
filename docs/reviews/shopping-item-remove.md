# レビュー記録: shopping-item-remove（L3 / 買い物リストの品目削除）

- レビュー日: 2026-07-25
- 対象: `6f66e27`（実装）
- 関連: `docs/requirements/` / `docs/designs/` / `docs/implementation-plans/` / `docs/tests/` /
  `docs/decisions/ADR-0011-shopping-item-hard-delete.md`
- レビュー実施者: Orchestrator（メインセッション）による自己レビュー。
  **独立した reviewer サブエージェントは起動していない**（本セッションでは Agent ツールの
  使用がユーザー要求時に限定されていたため）。この限界は下記「本レビューの限界」に明記する。

## 結論

**Must 指摘なし・差し戻し不要。** Should 2 件・Nice 2 件を記録する。いずれも本 PR では
対応せず、申し送りとする（理由は各項に記載）。

## 品質ゲート（独立に再現）

| ゲート            | 結果                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `pnpm lint`       | 0 error / 1 warning（`product-form-fields.test.tsx` の未使用 import。**本件と無関係な既存**） |
| `pnpm type-check` | 5/5 パッケージ PASS                                                                           |
| `pnpm test`       | 1,429 件 PASS（domain 365・application 223・infrastructure 55・api-contract 229・web 557）    |

## 要件・設計・実装・試験の整合性

要件定義書の採番観点と実装の対応を機械的に確認した。

| 要件                                        | 実装                                                    | テスト                            |
| ------------------------------------------- | ------------------------------------------------------- | --------------------------------- |
| F-1 品目を 1 件ずつ削除                     | `ShoppingList.removeItem` / `DELETE /:id/items/:itemId` | SLD-01 / SDL-03                   |
| F-2 `source` を問わない                     | Domain に source 分岐なし                               | SLD-03（`manually_added` も確認） |
| F-3 `status` を問わない・購入実績も失われる | Domain に status 分岐なし                               | SLD-02                            |
| F-4 削除前に確認ダイアログ                  | `pendingRemoveItem` + 制御モード `AlertDialog`          | SDL-02 / SDL-04                   |
| F-5 献立由来は sync で復活する旨を伝える    | `describeRemoveConfirmation` の分岐 1                   | DRC-01 / SDL-13                   |
| F-6 completed では削除不可                  | `assertActive('removeItem')`                            | SLD-08 / RIU-04 / SDL-11          |
| F-7 削除が永続化される                      | `save()` の既存 `notInArray` 差分削除                   | SLR-01 / SLR-02                   |

要件書の N-01〜08 / E-01〜05 / B-01〜05 は試験計画 §要件書観点の照合で全件が対応付けられており、
**省略した観点は無い**。

## アーキテクチャ原則の確認

- 依存方向: Domain は他パッケージに依存していない。`removeItem` は ID 値オブジェクトのみを受ける。
- `assertActive` / `findItem` という既存の private ヘルパを使い、集約内の様式を崩していない。
- UseCase は 1 クラス 1 `execute()`・手動 DI。共通ヘルパ `loadActiveShoppingList` / `requireItem`
  を再利用し、既存 5 UseCase と検査順（存在 → 状態）が揃っている。
- api-contract / Infrastructure は無変更。**DB マイグレーションなし**。
- `any` なし / default export なし / `import type` / `===` / 「値なし」は `null`。
- 公開 API（`removeItem` / `RemoveItemUseCase`）に JSDoc あり。型に表せない契約情報
  （`@throws`・冪等性・sync で復活する旨）のみを書いており、型の言い換えは無い。

## 機械検証の結果

### 既存ルートの回帰（DELETE 追加でパスが食い合わないか）

`RIR-07` で `POST /:id/items/:itemId/checked` が引き続き 200 で解決することを固定。
`shopping-lists.{add-item,bought,checked,target-store,complete,generate}.test.ts` の
既存 55 件も無修正で PASS。

### 楽観的更新のユニオン化による既存挙動への影響

`applyOptimisticPatch` → `applyOptimisticAction`（判別可能ユニオン）への変更に対し、
既存の `shopping-list-client.checked.test.tsx`（15 件）・`.view.test.tsx`（12 件）・
`.complete.test.tsx`（24 件）・`.sync.test.tsx`（3 件）が**アサーション無変更で PASS**。
既存 3 箇所への `type: 'patch'` 付与漏れは型エラーになるため、type-check が回帰を担保する。

### 必須 Props の伝播

`ShoppingItemRow.onRequestRemove` / `StoreGroup.onRequestRemove` をいずれも**必須**にした。
中継漏れは型エラーで検出される（2026-07-25「必須 Props で伝播漏れを型に検出させる」の再適用）。
既存テストの修正は defaults への 1 行追加のみで、アサーションは無変更。

### 買い物完了パネルとの相互作用

パネルを開いたまま品目を削除した場合に、削除済み itemId が `stockAdditions` に混入して
`CompleteShoppingUseCase` が 404 を返す競合が理論上ありうる。
**実装を確認した結果、競合しない**: `CompleteShoppingPanel.handleComplete` は
`for (const item of items)`（現在の props）を走査しており、内部 `rows` state に残る
削除済み ID は読まれない。

### スコープ外変更の混入

`git diff` で確認。`shopping-item-remove` の diff は shopping-list 関連の Domain /
Application / ルート / UI と対応するテスト・ドキュメントのみ。無関係なリファクタリングなし。

## Should

### S1: 削除直後の focus 起因 silent 再取得で、消した行が一時的に復活して見え得る

`shopping-list-client.tsx` の `useEffect` は window focus で `handleRefetch({ silent: true })` を
呼ぶ。削除の DELETE が in-flight のうちにタブを切り替えて戻ると、サーバー側がまだ削除を
反映していない GET が返り、消したはずの行が再表示され得る。次の再取得で解消する一時的な現象。

既存のチェック操作にも同種の競合があり本件で新規に生じた問題ではないため、対応しない。
設計書 §リスクに既知の制約として記載済み。

### S2: 404 の成功扱いは「別リストを指した」ケースも成功に見える

クライアントは 404 を冪等な成功として扱う。`shoppingListId` 自体が誤っている場合も 404 に
なるため、行が消えたのに実際は何も削除されていない、という状態があり得る。

ただし `shoppingListId` は画面が保持する自身の ID で、誤りは実質バグ時のみ。
エラーを出す方が有害（2 人利用で相手が先に消した場合に毎回エラーになる）と判断し、
現行のままとする。

## Nice

### N1: `describeRemoveConfirmation` の分岐順が仕様として暗黙

「献立由来 > 購入済み > 既定」の優先順位はコード上の `if` の順序でのみ表現されている。
DRC-04 で分岐順を固定しているため実害はないが、コメントで優先順位を明示してもよい。

### N2: `skipped` が引き続き到達不能

ADR-0011 の決定どおり `markAsSkipped()` は API 非公開のまま残る。死コードに近い状態が続くが、
ADR-0007 が将来の自動追随の回避策として言及しているため削除しない。

## 実画面確認（PGlite dev + Playwright・モバイル 390×780・タッチ有効）

献立を作成 → レシピ 2 件を追加 → 買い物リストを生成、という実運用と同じ経路で確認した。

| #   | 観点                                   | 結果                                              |
| --- | -------------------------------------- | ------------------------------------------------- |
| S-0 | 買い物リスト詳細に到達                 | PASS                                              |
| S-1 | 手動追加できる                         | PASS                                              |
| S-2 | 確認ダイアログが出る（手動追加の文言） | PASS                                              |
| S-3 | 削除で行が消える                       | PASS                                              |
| S-4 | **リロード後も消えたまま**（永続化）   | PASS                                              |
| S-5 | 献立由来では同期で復活する旨を説明する | PASS（`じゃがいも`）                              |
| S-6 | 献立由来も削除できる                   | PASS                                              |
| S-7 | **同期で献立由来が復活する**           | PASS（`献立の変更を反映` で `じゃがいも` が戻る） |
| S-8 | 完了済みでは削除ボタンを出さない       | PASS（削除ボタン 0 個）                           |

S-4 は `save()` の `notInArray` 差分削除が実 DB で効いていることの確認、S-7 は ADR-0011 と
確認ダイアログの文言が実挙動と一致していることの確認にあたる。いずれも自動テストでは
担保していなかった観点。

## 本レビューの限界（申し送り）

- **独立した reviewer サブエージェントによるレビューを実施していない。** 本記録は実装者
  （Orchestrator）自身による自己レビューであり、`docs/reviews/project-refactoring.md` のような
  第三者視点の指摘は含まれない。実装者が気づけなかった観点は原理的に漏れる。
  → 次セッションで reviewer を起動して独立レビューを重ねると、本記録の抜けを検出できる。
