# 試験計画: shopping-item-remove

- 前提となる設計書: `docs/designs/shopping-item-remove.md`
- レベル: L3

## 試験種別

| 層             | 種別                        | ランナー                                         |
| -------------- | --------------------------- | ------------------------------------------------ |
| Domain         | 単体                        | Vitest（`packages/domain`）                      |
| Application    | 単体（Repository はモック） | Vitest（`packages/application`）                 |
| Infrastructure | 結合（実 DB = PGlite）      | Vitest（`packages/infrastructure`）              |
| Hono ルート    | 結合（UseCase はモック）    | Vitest node project（`src/server/**/*.test.ts`） |
| 画面           | 単体（RTL + user-event）    | Vitest dom project（`*.test.tsx`）               |
| 純関数（文言） | 単体                        | Vitest node project（`*.node.test.ts`）          |

E2E（Playwright）は買い物リストの既存 spec が無く、本件では**対象外**（実画面確認で代替）。

## 単体試験観点

### Domain（`ShoppingList.removeItem`）— ID プレフィクス `SLD-`

| #      | 観点                            | 前提                                 | 操作                      | 期待結果                                                            | 分類 |
| ------ | ------------------------------- | ------------------------------------ | ------------------------- | ------------------------------------------------------------------- | ---- |
| SLD-01 | pending 品目を削除できる        | active・品目 3 件                    | `removeItem(item1.id)`    | `items` が 2 件になり item1 が含まれない                            | 正常 |
| SLD-02 | bought 品目も削除できる         | active・item1 が `markAsBought` 済み | `removeItem(item1.id)`    | `items` から消える（購入実績ごと）                                  | 正常 |
| SLD-03 | from_meal_plan 品目も削除できる | active・`source: 'from_meal_plan'`   | `removeItem`              | `items` から消える                                                  | 正常 |
| SLD-04 | 他の品目に影響しない            | active・品目 3 件                    | 中央の 1 件を削除         | 残り 2 件の id / status / actualPrice が不変                        | 正常 |
| SLD-05 | 品目 1 件のリストから削除       | active・品目 1 件                    | `removeItem`              | `items` が空配列になる（例外を投げない）                            | 境界 |
| SLD-06 | 全件を順に削除                  | active・品目 3 件                    | 3 回 `removeItem`         | `items` が空になる                                                  | 境界 |
| SLD-07 | 存在しない itemId               | active                               | 未登録 id で `removeItem` | `Error('ShoppingItem not found')` を投げ、`items` が不変            | 異常 |
| SLD-08 | completed のリスト              | `complete()` 済み                    | `removeItem`              | `Cannot removeItem a ShoppingList with status 'completed'` を投げる | 異常 |
| SLD-09 | 削除後に再度同じ id を削除      | SLD-01 の後                          | 同じ id で `removeItem`   | 投げる（サーバー側は非冪等。冪等化はクライアント責務）              | 異常 |
| SLD-10 | reopen 後は削除できる           | completed → `reopen()`               | `removeItem`              | 成功する                                                            | 境界 |

### Application（`RemoveItemUseCase`）— ID プレフィクス `RIU-`

| #      | 観点                              | 前提                        | 操作                 | 期待結果                                                                    | 分類 |
| ------ | --------------------------------- | --------------------------- | -------------------- | --------------------------------------------------------------------------- | ---- |
| RIU-01 | 正常削除                          | active・品目 2 件           | `execute`            | `repository.save` が 1 回呼ばれ、渡された集約から当該品目が消えている       | 正常 |
| RIU-02 | 戻り値                            | 同上                        | `execute`            | `undefined`（`Promise<void>`）                                              | 正常 |
| RIU-03 | リストが存在しない                | `findById` が null          | `execute`            | `ShoppingListNotFoundError`                                                 | 異常 |
| RIU-04 | リストが completed                | completed                   | `execute`            | `InvalidShoppingListStateError`                                             | 異常 |
| RIU-05 | 品目が存在しない                  | active・未登録 itemId       | `execute`            | `ShoppingItemNotFoundError`                                                 | 異常 |
| RIU-06 | エラー時は保存しない              | RIU-03/04/05 の各ケース     | `execute`            | `repository.save` が呼ばれない                                              | 異常 |
| RIU-07 | 検査順（completed × 不在 itemId） | completed かつ未登録 itemId | `execute`            | **`InvalidShoppingListStateError` が優先**（`loadActiveShoppingList` が先） | 境界 |
| RIU-08 | 不正 UUID の itemId               | active                      | `itemId: 'not-uuid'` | `ShoppingItemId.fromString` が投げる（他 UseCase と同じ扱い）               | 異常 |

### 純関数（`describeRemoveConfirmation`）— ID プレフィクス `DRC-`

| #      | 観点                               | 前提                                                 | 操作 | 期待結果                                     | 分類 |
| ------ | ---------------------------------- | ---------------------------------------------------- | ---- | -------------------------------------------- | ---- |
| DRC-01 | 献立由来                           | `source: 'from_meal_plan'`                           | 呼ぶ | 「献立の変更を反映」で再び追加される旨を含む | 正常 |
| DRC-02 | 手動追加・購入済み・金額あり       | `manually_added` / `bought` / `actualPrice !== null` | 呼ぶ | 「記録した金額も一緒に削除されます」を含む   | 正常 |
| DRC-03 | 手動追加・pending                  | `manually_added` / `pending`                         | 呼ぶ | 「削除すると元に戻せません。」               | 正常 |
| DRC-04 | 献立由来が金額記録済み             | `from_meal_plan` / `bought` / 金額あり               | 呼ぶ | **献立由来の文言が優先**（分岐順の固定）     | 境界 |
| DRC-05 | 購入済みだが金額なし（check のみ） | `manually_added` / `bought` / `actualPrice === null` | 呼ぶ | DRC-03 と同じ文言                            | 境界 |

## 結合試験観点

### Infrastructure（PGlite）— ID プレフィクス `SLR-`

| #      | 観点               | 前提                  | 操作                               | 期待結果                       | 分類 |
| ------ | ------------------ | --------------------- | ---------------------------------- | ------------------------------ | ---- |
| SLR-01 | 削除が永続化される | 品目 3 件を save 済み | `removeItem` → `save` → `findById` | 2 件になり、削除した id が無い | 正常 |
| SLR-02 | 全件削除           | 品目 2 件             | 2 件とも削除 → `save` → `findById` | `items` が空、リスト本体は残る | 境界 |

### Hono ルート — ID プレフィクス `RIR-`

`vi.mock('@cookpit/application')` で UseCase をモックする既存パターンに従う。

| #      | 観点             | 前提                            | 操作                                                              | 期待結果                                                                | 分類 |
| ------ | ---------------- | ------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- | ---- |
| RIR-01 | 正常             | UseCase が resolve              | `DELETE /api/shopping-lists/:id/items/:itemId`                    | **204**・ボディ空・`execute` が `{ shoppingListId, itemId }` で呼ばれる | 正常 |
| RIR-02 | リスト不在       | `ShoppingListNotFoundError`     | 同上                                                              | 404                                                                     | 異常 |
| RIR-03 | 品目不在         | `ShoppingItemNotFoundError`     | 同上                                                              | 404                                                                     | 異常 |
| RIR-04 | completed        | `InvalidShoppingListStateError` | 同上                                                              | 422                                                                     | 異常 |
| RIR-05 | 不正な id        | `id` が UUID でない             | 同上                                                              | 400                                                                     | 境界 |
| RIR-06 | 不正な itemId    | `itemId` が UUID でない         | 同上                                                              | 400                                                                     | 境界 |
| RIR-07 | 既存ルートの回帰 | —                               | `POST /:id/items/:itemId/bought` `.../checked` `.../target-store` | 引き続き解決し 200 を返す（DELETE 追加でパスが食い合わない）            | 正常 |

### 画面（`ShoppingListClient` / `ShoppingItemRow` / `StoreGroup`）— ID プレフィクス `SDL-`

| #      | 観点                       | 前提                                | 操作                             | 期待結果                                                                                                                                                  | 分類 |
| ------ | -------------------------- | ----------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| SDL-01 | 削除ボタンの存在           | active                              | —                                | 各行に `〇〇を削除` の `aria-label` を持つボタンがある                                                                                                    | 正常 |
| SDL-02 | 確認ダイアログ             | active                              | 削除ボタンを click               | ダイアログが開き、API はまだ呼ばれない                                                                                                                    | 正常 |
| SDL-03 | 楽観削除                   | active                              | ダイアログの「削除する」を click | 行が**即座に**消え、`$delete` が正しい param で呼ばれる                                                                                                   | 正常 |
| SDL-04 | キャンセル                 | active                              | ダイアログの「キャンセル」       | 行が残り `$delete` が呼ばれない                                                                                                                           | 正常 |
| SDL-05 | 500 でロールバック         | `$delete` が `ok:false, status:500` | 削除実行                         | 行が戻り、`操作に失敗しました。` が出る                                                                                                                   | 異常 |
| SDL-06 | 422 で回復導線             | `status: 422`                       | 削除実行                         | 行が戻り、`買い物完了後は変更できません。「買い物を再開」してください。` が出る                                                                           | 異常 |
| SDL-07 | 404 は成功扱い             | `status: 404`                       | 削除実行                         | 行が消え、**エラーバナーが出ない**                                                                                                                        | 境界 |
| SDL-08 | 通信エラー                 | `$delete` が reject                 | 削除実行                         | 行が戻り、`通信エラーが発生しました。` が出る                                                                                                             | 異常 |
| SDL-09 | 展開中の行を削除           | 金額入力フォームを展開中            | その行を削除                     | `expandedItemId` がクリアされる                                                                                                                           | 境界 |
| SDL-10 | 全件削除                   | 品目 1 件                           | 削除                             | `リストにアイテムがありません` の空状態になる                                                                                                             | 境界 |
| SDL-11 | completed では出さない     | `status: 'completed'`               | —                                | 削除ボタンが DOM に存在しない                                                                                                                             | 正常 |
| SDL-12 | 削除の応答待ち中の他行操作 | `$delete` が pending                | 削除実行中に別の行をチェック     | 別の行のチェックが成立する                                                                                                                                | 正常 |
| SDL-13 | 献立由来の文言             | `source: 'from_meal_plan'`          | 削除ボタン click                 | ダイアログの説明に「献立の変更を反映」が含まれる                                                                                                          | 正常 |
| SDL-14 | 手動追加の文言             | `source: 'manually_added'`          | 削除ボタン click                 | 説明に「元に戻せません」が含まれる                                                                                                                        | 正常 |
| SDL-15 | 二重実行ガード             | 同じ行                              | 削除中に再度削除要求             | **対象外**（楽観削除で対象行が即座に消えるため UI から二重要求できない。`submittingItemId` のガードは `handleSetChecked` と同型の防御的コードとして残す） | 境界 |
| SDL-16 | 行の必須 prop 中継         | `StoreGroup`                        | 行の削除ボタンを click           | `onRequestRemove` が対象 itemId で呼ばれる（実装は `store-group.test.tsx` の SG-07）                                                                      | 正常 |

> **テストケース名の ID 前置について**: 本表の ID は `apps/web` のテストにのみ前置する
> （既存の `IR-` / `SG-` / `LC-` / `SU-` と同じ運用）。`packages/` 配下のテストは既存
> 全ファイルが ID を持たない日本語表題で統一されているため、そちらの記法に合わせる
> （Domain の SLD-xx / Application の RIU-xx / Infrastructure の SLR-xx は本書内の
> 追跡用 ID であり、テスト表題には現れない）。

## 特性観点

- **権限**: MVP1 は認証なし（ADR-0003）のため**対象外**。
- **データ整合性**: 削除後の集約と DB 行の一致を SLR-01 / SLR-02 で確認する。購入済み品目の
  削除で `actualPrice` / `actualStore` も消えることを SLD-02 で固定する。
- **冪等性**: サーバーは非冪等（2 回目は 404）。**クライアントが 404 を成功として扱う**ことで
  ユーザーから見た操作を冪等にする（SDL-07 / SLD-09）。
- **障害系（外部 I/O）**: DB 以外の外部 API / ストレージを使わないため**対象外**。
- **フロントエンド固有**: ローディング（SDL-12）／エラー表示（SDL-05/06/08）／
  **楽観的更新のロールバック**（SDL-05/06/08）を必須で含める。
- **防御性（Domain Entity/VO）**:
  - 防御的コピー: `items` ゲッタが防御的コピーを返す既存性質が `removeItem` 後も維持される
    （SLD-04 で残存品目の同一性、既存テストで `items` のコピーを担保）
  - 不変条件: 削除は品目の不変条件（`requiredAmount` / `amountNote` の排他）に影響しない
  - 副作用: `ShoppingList` に `updatedAt` は無いため**対象外**
  - 不正引数の伝搬: `removeItem` は ID のみを受けるため factor / multiplier 系は**対象外**。
    不正 UUID は `ShoppingItemId.fromString` が弾く（RIU-08）

## メソッド網羅チェック表

本件で追加・変更する public API のみを対象とする（既存メソッドは既存テストが網羅済み）。

| クラス                  | メソッド                           | 対応する試験観点 No                                           |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------- |
| `ShoppingList`          | `removeItem(itemId)`               | SLD-01〜SLD-10                                                |
| `RemoveItemUseCase`     | `execute(input)`                   | RIU-01〜RIU-08                                                |
| （純関数）              | `describeRemoveConfirmation(item)` | DRC-01〜DRC-05                                                |
| `ShoppingItemRow`       | `onRequestRemove` prop             | SDL-01, SDL-11 / IR-22, IR-23, IR-24                          |
| `StoreGroup`            | `onRequestRemove` prop             | SG-07                                                         |
| `ShoppingListClient`    | `handleRemoveItem`                 | SDL-02〜SDL-10, SDL-12, SDL-15                                |
| `applyOptimisticAction` | `remove` 分岐                      | SDL-03, SDL-05（ロールバック）                                |
| `applyOptimisticAction` | `patch` 分岐（既存）               | 既存の `shopping-list-client.checked.test.tsx` が網羅（回帰） |

## 要件書観点の照合

`docs/requirements/shopping-item-remove.md` の採番観点との対応:

| 要件 | 試験観点                          |
| ---- | --------------------------------- |
| N-01 | SLD-01 / SDL-03                   |
| N-02 | SLD-02                            |
| N-03 | SLD-03                            |
| N-04 | SLR-01                            |
| N-05 | SDL-02, SDL-03                    |
| N-06 | SDL-04                            |
| N-07 | SDL-13, DRC-01                    |
| N-08 | SDL-10                            |
| E-01 | RIU-03 / RIR-02                   |
| E-02 | RIU-05 / RIR-03                   |
| E-03 | SLD-08 / RIU-04 / RIR-04 / SDL-06 |
| E-04 | SDL-08                            |
| E-05 | SDL-05                            |
| B-01 | SLD-05 / SLR-02                   |
| B-02 | RIR-05, RIR-06                    |
| B-03 | RIU-07                            |
| B-04 | SDL-09                            |
| B-05 | SDL-07                            |

省略した要件観点は**なし**。

## 回帰試験範囲

| 対象                                                      | 確認方法                                                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| チェック / uncheck（`OptimisticAction` ユニオン化の影響） | 既存 `shopping-list-client.checked.test.tsx` が**アサーション無変更**で通ること                                                           |
| 購入記録 / 店舗再割当                                     | 既存 `shopping-list-client.view.test.tsx` / `shopping-item-row.test.tsx` / `store-group.test.tsx` が defaults への 1 行追加のみで通ること |
| 買い物完了 / 同期                                         | 既存 `shopping-list-client.complete.test.tsx` / `.sync.test.tsx` が通ること                                                               |
| 既存の買い物リスト API                                    | RIR-07                                                                                                                                    |
| 既存の Repository save                                    | 既存「再 save() で削除済み item を同期し、0 件では全削除する」が通ること                                                                  |

## 試験データ

- 既存の `packages/application/src/shopping-list/test-helpers.ts` と
  `apps/web/src/app/shopping-lists/_components/shopping-list-test-fixtures.ts` を再利用する。
- fixtures には `$delete` のモックを追加する（既存テストのアサーションは変更しない）。
- 献立由来 / 手動追加の両方を含む 3 件構成の品目セットを DRC / SDL 用に用意する。

## 完了条件

- 上記すべての観点が実装され、`pnpm lint && pnpm type-check && pnpm test` が通る。
- 回帰試験範囲の既存テストが**アサーション無変更**で通る。
- 実画面確認（PGlite dev + Playwright）で SDL-03 / SDL-11 / SDL-13 と「削除 → リロードでも
  消えている」「献立由来を削除 → 同期で復活」を確認済み。
