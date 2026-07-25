# 設計書: completed-list-check-ui

- ステータス: confirmed
- レベル: L2
- 関連: docs/implementation-plans/completed-list-check-ui.md / docs/tests/completed-list-check-ui.md /
  docs/decisions/ADR-0009-shopping-list-item-check-uncheck.md /
  docs/designs/shopping-list-item-check.md

## 背景

ユーザーから「チェックマークを解除しようとした時に失敗する」と報告があり、dev サーバー（PGlite）と
ブラウザで再現させた。

```
a. checked=true（active）        -> 200
b. complete                     -> 200 (status=completed)
c. checked=false（completed 後）-> 422 Cannot setItemChecked a ShoppingList with status 'completed'
d. checked=true（completed 後） -> 422
e. bought（completed 後）       -> 422
f. reopen                       -> 200 (status=active)
g. checked=false（reopen 後）   -> 200
```

**買い物リストが `completed` のとき、品目に対する変更操作はすべてサーバーが 422 で拒否する。**
これは ADR-0009 の決定 3（`ShoppingList.check/uncheck` に `assertActive` ガードを付ける）および
既存の `markAsBought` / `reassignStore` と同じ設計で、**意図された制約**である。

問題は UI 側にある。`ShoppingItemRow` は完了後もチェックボックス・「金額を記録」・店舗変更を
操作可能なまま描画しており、押すと汎用の「操作に失敗しました。」が出る。
テスト CB-11「完了後も item のチェックと店舗再割当 UI を残す」がこの挙動を固定していた。

つまり **UI がサーバーのルールと食い違っている**。ユーザーには「壊れている」ようにしか見えず、
「買い物を再開すれば変更できる」という回復手段も伝わらない。

### 回帰ではないことの確認

- PR #110（リファクタリング）の直前 `590dfc2` の `SetItemCheckedUseCase` にも
  `status !== 'active'` ガードが存在する。
- ドメインの `assertActive('uncheck')` は機能追加の PR #109（`ccb23d6`・2026-07-24）由来。
- したがって本件は PR #109 の時点から存在する UX 上の欠陥であり、リファクタリングは挙動を保存している。

## 目的

サーバーが拒否する操作を UI 上でも実行できないようにし、代わりに回復手段（買い物を再開）へ導く。

## 要件

1. `completed` の買い物リストでは、品目の変更操作（チェック・金額記録・店舗再割当）を UI から
   実行できない。
2. 変更したい場合に何をすればよいか（「買い物を再開」）が画面から分かる。
3. それでも 422 が返る場合（2 人利用で相手が先に完了した場合）に、汎用文言ではなく
   具体的な理由と回復手段を示す。
4. ドメイン・API・DB は変更しない。ADR-0009 の決定は覆さない。

## 対象範囲

- `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`
- `apps/web/src/app/shopping-lists/_components/store-group.tsx`
- `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`
- `apps/web/src/lib/use-api-action.ts`（失敗文言をステータスに応じて出し分けられるようにする）

## 対象外

- ドメイン（`ShoppingList.check` / `uncheck` / `markAsBought` / `reassignStore` の `assertActive`）。
- API・DB スキーマ・`packages/api-contract`。
- 「完了後も変更できるようにする」案（ADR-0009 の決定を覆す L3 相当。ユーザー判断で不採用）。
- 買い物リスト以外の画面。

## 変更後構成

### 読み取り専用の伝播

`ShoppingListClient` が持つ `status` から `readOnly` を導き、`StoreGroup` 経由で
`ShoppingItemRow` まで渡す。

```
ShoppingListClient (status)
  └─ readOnly = status !== 'active'
       └─ StoreGroup(readOnly)
            └─ ShoppingItemRow(readOnly)
```

`readOnly` のとき `ShoppingItemRow` は次のようにする。

| 要素                 | active | completed（readOnly）                        |
| -------------------- | ------ | -------------------------------------------- |
| チェックボックス     | 操作可 | `disabled`。`aria-checked` は現状を保つ      |
| 「金額を記録」ボタン | 表示   | 非表示（記録済みの価格表示は残す）           |
| 店舗チップ（再割当） | 操作可 | `disabled`                                   |
| 購入実績フォーム     | 展開可 | 展開できない（トグルが無いため描画されない） |

`disabled` にとどめ DOM から消さないのは、完了済みリストの内容（何をいくつ買ったか）は
引き続き読めるようにするため。

### 回復導線

`status === 'completed'` のとき、既存の「買い物を再開」ボタンの直前に
「完了済みのリストは編集できません。変更するには「買い物を再開」してください。」を表示する。

### 422 の文言（2 人利用の競合）

`readOnly` により UI からは操作できなくなるが、**相手が先に「買い物完了」した直後**は
自分の画面がまだ `active` のままで操作でき、422 が返り得る（D-7 の 2 人利用）。
このとき汎用文言では原因が分からないため、次を出す。

> 買い物完了後は変更できません。「買い物を再開」してください。

`useApiAction` の `failureMessage` を `string | ((status: number) => string)` に拡張し、
呼び出し側がステータスで出し分けられるようにする。楽観的更新の 2 経路
（`handleSetChecked` / `handleMarkAsBought`）はフックを通さないため、同じ判定関数を
コンポーネント側で直接使う。

## データフロー / API 設計 / DB 設計

いずれも **変更なし**。

## フロントエンド設計

上記「変更後構成」に記載。バックエンド設計は **対象外**（変更なし）。

## エラー処理

外部 I/O の新規追加は無いため、リトライ・タイムアウト・冪等性・部分失敗・フォールバックの
5 項目は **対象外**。既存の 2 文言（`操作に失敗しました。` / `通信エラーが発生しました。`）は
維持し、422 のときだけ新しい文言を追加する。

## ログと監視 / セキュリティ / 性能

いずれも **変更なし**。

## テスト方針

詳細は docs/tests/completed-list-check-ui.md。要点は次の 3 つ。

1. **CB-11 の仕様変更**。「完了後も UI を残す」→「完了後は操作できない（表示は残る）」へ
   テストを書き換える。これは意図的な仕様変更であり、テストの更新自体が成果物になる。
2. 完了済みリストでチェックボックス・店舗チップが `disabled`、「金額を記録」が非表示であること。
3. 422 のときに具体的な文言が出ること（2 人利用の競合を模したケース）。

## 移行とリリース

データ移行なし。マージ後、完了済みリストの画面が読み取り専用になる。
既に完了しているリストを編集したい場合は、これまでどおり「買い物を再開」を押す。

## リスク

| リスク                                                 | 対応                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 完了後に価格を記録したかったユーザーが操作できなくなる | もともとサーバーが 422 で拒否しており、できていなかった。「買い物を再開」で従来どおり可能 |
| `readOnly` の伝播漏れで一部だけ操作可能に残る          | 行内の 3 つの操作要素をテストで個別に固定する                                             |
| 2 人利用の競合で 422 が出る経路は残る                  | 文言を具体化して回復手段を示す（要件 3）                                                  |

## 未決事項

なし（対応方針・実施単位はユーザー確定済み）。
