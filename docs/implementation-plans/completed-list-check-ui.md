# 実装計画: completed-list-check-ui

- 対応設計書: docs/designs/completed-list-check-ui.md（confirmed / L2）
- 試験計画: docs/tests/completed-list-check-ui.md
- 実装ルート: **Claude Code 直接実装**（変更は apps/web の 3 コンポーネント + 共通フックに閉じ、
  既に再現・原因特定まで済んでいるため、指示書を介する Codex 委譲より直接実装が早い）

## 全体の完了条件

- 完了済みリストで、チェックボックス・店舗チップが `disabled`、「金額を記録」が非表示。
- 完了済みリストに「買い物を再開」への導線文が出る。
- 422 のとき具体的な文言が出る。
- `pnpm lint` / `type-check` / `test` / `format:check` が通る。
- ドメイン・API・DB・`packages/` に変更が無い。

## ステップ 1: `useApiAction` の失敗文言をステータスで出し分け可能にする

### 対象ファイル

- `apps/web/src/lib/use-api-action.ts`
- `apps/web/src/lib/use-api-action.test.tsx`

### 内容

1. `RunOptions.failureMessage` の型を `string | ((status: number) => string)` に広げる。
2. `run` 内で関数なら `response.status` を渡して評価する。既定は従来どおり
   `API_FAILURE_MESSAGE`。
3. 関数形式のテストを 1 件追加する。

### 完了条件

既存の 8 件が挙動を変えずに通り、関数形式のテストが追加されて通る。

### 実装との差分（実施後に追記）

計画では「既存 8 件が**無修正で**通る」としていたが、`ApiResponseLike` に `status: number` を
必須で追加したため、テスト側のレスポンス模擬（`okResponse` / `errorResponse`）に `status` の
付与が必要になった。**アサーションと期待値は 1 件も変えていない**（模擬の形だけを実物の
`ClientResponse` に合わせた）。`status` を任意化して回避する案は採らなかった —
実際の Hono レスポンスは常に `status` を持ち、任意にすると呼び出し側で `undefined` を
考慮する分岐が増えるため。

## ステップ 2: 行を読み取り専用にできるようにする

### 対象ファイル

- `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`
- `apps/web/src/app/shopping-lists/_components/store-group.tsx`

### 内容

1. `ShoppingItemRow` の Props に `readOnly: boolean` を追加する。
   - チェックボックス: `disabled={submitting || readOnly}`
   - 「金額を記録」ボタン: `readOnly` のとき描画しない
   - 店舗チップ / 店舗セレクト: `disabled={submitting || readOnly}`
2. `StoreGroup` の Props に `readOnly: boolean` を追加し、そのまま各行へ渡す。

### 完了条件

型チェックが通り、`readOnly` を渡さないと型エラーになる（伝播漏れを型で防ぐため任意化しない）。

## ステップ 3: クライアントから読み取り専用と導線文を出す

### 対象ファイル

- `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`

### 内容

1. `const readOnly = status !== 'active';` を導出し、`StoreGroup` に渡す。
2. `status === 'completed'` のとき、「買い物を再開」ボタンの直前に導線文を表示する。
3. 422 用の文言と判定関数を定義し、
   - `handleReassignStore`（`itemsAction.run`）は `failureMessage` に関数を渡す
   - `handleSetChecked` / `handleMarkAsBought`（楽観的更新のためフックを通さない）は
     `response.status` を見て同じ関数で文言を決める

### 完了条件

完了済みリストで操作要素が無効化され、導線文が出る。active では従来どおり操作できる。

## ステップ 4: テストの更新と追加

### 対象ファイル

- `apps/web/src/app/shopping-lists/_components/shopping-list-client.complete.test.tsx`
- `apps/web/src/app/shopping-lists/_components/shopping-item-row.test.tsx`
- `apps/web/src/app/shopping-lists/_components/store-group.test.tsx`

### 内容

1. **CB-11 を仕様変更に合わせて書き換える**。「完了後も UI を残す」→
   「完了後はチェック・店舗変更が操作できない（表示は残る）」。
2. 完了済みリストでの各要素の状態を固定するケースを追加する。
3. 422 のときの文言を固定するケースを追加する。
4. `readOnly` を Props に追加したことで既存テストが型エラーになる箇所を追随させる。

### 完了条件

web のテストが全 PASS。件数は追加分だけ増える。

## ステップ 5: 品質ゲートと成果物

### 内容

`pnpm format:check` / `lint` / `type-check` / `test` を通し、コミット・push・PR 作成。
実画面での確認（dev:pglite + Playwright）も行い、完了済みリストで操作できないことを確かめる。

### 完了条件

全ゲート PASS。実画面確認で完了済みリストのチェックボックスが押せないこと。

## リスクとロールバック

| リスク                                    | 対応                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `readOnly` の伝播漏れ                     | Props を必須にして型で強制。行内 3 要素をテストで個別に固定                        |
| 既存テストの大量修正                      | `readOnly` は 2 コンポーネントの Props 追加に留め、影響を局所化                    |
| 422 文言の出し分けで既存の 2 文言が壊れる | `useApiAction` の既定値は変えず、関数形式は任意。既存 8 件が無修正で通ることを確認 |

ロールバックは本 PR の `git revert` 1 回。ドメイン・API に触れないため副作用は UI に閉じる。

## 実施順の根拠

共通フック（ステップ 1）を先に広げてから、それを使う側（ステップ 3）を書く。
コンポーネントの Props 追加（ステップ 2）はクライアント（ステップ 3）より先に済ませ、
型エラーで伝播漏れを検出できる状態にしてから配線する。
