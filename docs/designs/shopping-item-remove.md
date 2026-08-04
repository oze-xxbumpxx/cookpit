# 設計書: shopping-item-remove

- ステータス: confirmed
- レベル: L3
- 関連: `docs/requirements/shopping-item-remove.md` / `docs/decisions/ADR-0011-shopping-item-hard-delete.md` /
  ADR-0007（差分マージ）/ ADR-0009（completed リストは 422）

## 背景

買い物リストの品目を取り除く手段が UI にもサーバーにも無い。手動追加で打ち間違えた品目が
残り続ける。詳細は要件定義書の §背景。

## 目的

誤って追加した品目をユーザーが自分で取り除けるようにする。

## 要件

要件定義書 §機能要件 F-1〜F-7 を正とする。要点:

- すべての品目（`source` / `status` を問わない）を 1 件ずつ削除できる
- 削除前に確認ダイアログを出す。献立由来のときは sync で復活する旨を伝える
- `completed` のリストでは削除できない（422）
- 削除は永続化される

## 対象範囲

Domain / Application / Presentation（Hono ルート + 画面）の 3 層。

## 対象外

- `packages/api-contract`: 既存 `shoppingItemIdParamSchema` を再利用。DELETE はボディを持たないため新規スキーマ不要
- `packages/infrastructure`: 既存 `save()` が削除に追随済み（後述）
- DB マイグレーション
- `markAsSkipped()` の API / UI 露出（ADR-0011 で不採用）
- 削除の取り消し（undo）・削除履歴
- 献立変更に対する**自動**削除追随（ADR-0007 の将来課題のまま）

## 現状構成

`ShoppingList` 集約の更新操作は `addItem` / `markAsBought` / `reassignStore` /
`markAsSkipped` / `check` / `uncheck` / `complete` / `reopen`。すべて private
`assertActive(operation)` を通り、`completed` では throw する。**`removeItem` は存在しない。**

Application には `add-item` / `mark-as-bought` / `set-item-checked` / `reassign-store` /
`reopen` / `get` / `generate` / `complete-shopping` / `sync-shopping-list-from-meal-plan` の
9 UseCase があり、削除系は 0 件。品目操作系は共通ヘルパ
`load-shopping-list.ts` の `loadActiveShoppingList` / `requireItem` を使う。

`apps/web` の詳細画面は `shopping-list-client.tsx` が `useState<ShoppingItemDto[]>` +
`useOptimistic(items, applyOptimisticPatch)` + `submittingItemId` + 自作 `useApiAction` で
状態を持ち、`store-group.tsx` → `shopping-item-row.tsx` へ props を流す。

## 変更後構成

| 層                     | 変更                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Domain                 | `ShoppingList.removeItem(itemId)` を追加                                                                                      |
| Application            | `RemoveItemUseCase` を新規追加。`RemoveItemInputDto` を DTO に追加し barrel から export                                       |
| api-contract           | **変更なし**                                                                                                                  |
| Presentation（ルート） | `DELETE /:id/items/:itemId` を追加（204）                                                                                     |
| Presentation（画面）   | 行に削除ボタン、クライアントに確認ダイアログ 1 つ、`handleRemoveItem` を追加。`applyOptimisticPatch` を判別可能ユニオンへ拡張 |
| Infrastructure         | **変更なし**                                                                                                                  |

## データフロー

```
[削除ボタン] → setPendingRemoveItem(item)
    → 確認ダイアログ（source / status に応じて説明文を出し分け）
    → 「削除する」
    → setSubmittingItemId(itemId)            ← startTransition の外
    → startTransition:
         setOptimisticItems({ type: 'remove', itemId })   ← 行が即座に消える
         DELETE /api/shopping-lists/:id/items/:itemId
           → 204            : setItems(filter) で確定
           → 404            : 成功扱い（冪等）。setItems(filter)
           → 422 / その他    : setItems を呼ばない → transition 終了で行が戻る + バナー
```

サーバー側:

```
Hono DELETE → zValidator('param', shoppingItemIdParamSchema)
  → RemoveItemUseCase.execute({ shoppingListId, itemId })
      → loadActiveShoppingList()  … 無ければ ShoppingListNotFoundError / completed なら InvalidShoppingListStateError
      → requireItem()             … 無ければ ShoppingItemNotFoundError
      → ShoppingList.removeItem()
      → repository.save()         … notInArray で該当行が DELETE される
  → c.body(null, 204)
```

## API 設計

| 項目             | 値                                                                            |
| ---------------- | ----------------------------------------------------------------------------- |
| メソッド / パス  | `DELETE /api/shopping-lists/:id/items/:itemId`                                |
| param            | `shoppingItemIdParamSchema`（`{ id: uuid, itemId: uuid }`）— **既存を再利用** |
| リクエストボディ | なし                                                                          |
| 成功             | **204 No Content**（ボディなし）                                              |
| 404              | リストが存在しない / 品目が存在しない                                         |
| 422              | リストが `completed`                                                          |
| 400              | `id` / `itemId` が UUID でない（zValidator）                                  |

204 とボディなしは `meal-plans.ts` の `DELETE /:id/recipes/:plannedRecipeId`、
`recipes.ts`、`products.ts` の既存 3 例と揃える。

エラー → HTTP の変換は `apps/web/src/server/app.ts` の既存 `onError` に乗る
（`ShoppingItemNotFoundError extends NotFoundError` → 404、
`InvalidShoppingListStateError extends InvalidStateError extends InvalidOperationError` → 422）。
**新規エラークラスは追加しない。**

## DB 設計

**変更なし。** `DrizzleShoppingListRepository.save()` は集約に残っている item id を集め、

```ts
await this.db
  .delete(shoppingItems)
  .where(and(eq(shoppingItems.shoppingListId, id), notInArray(shoppingItems.id, currentIds)));
```

で「集約に無い行」を DELETE する（`currentIds` が空なら当該リストの全行を DELETE）。
集約から取り除くだけで永続化まで追随するため、**リポジトリ実装もマイグレーションも不要**。
この挙動は既存の PGlite テスト「再 save() で削除済み item を同期し、0 件では全削除する」で
保証済み。

## フロントエンド設計

### 楽観的更新: `applyOptimisticPatch` を判別可能ユニオンへ拡張する

現在の reducer は `map` でパッチを当てる形で、**行の削除を表現できない**。

```ts
type OptimisticAction =
  | { type: 'patch'; itemId: string; patch: Partial<ShoppingItemDto> }
  | { type: 'remove'; itemId: string };
```

- 既存 3 箇所の `setOptimisticItems({ itemId, patch })` に `type: 'patch'` を足す。
  判別可能ユニオンなので**付け忘れは `pnpm type-check` が確実に検出する**。
- 2026-07-25 の教訓「楽観的更新は共通化しない」は、**共通フック `useApiAction` へ寄せない**
  という意味であり、reducer をコンポーネント内で広げることは教訓に反しない。
- 削除を非楽観にしない理由: 買い物中の片手操作で 200〜400ms 行が残ると「反応しなかった」と
  感じて二度押しされる。同じ行でチェックは即時・削除は遅延という一貫しない体感も避けたい。

### `handleRemoveItem` は `handleSetChecked` と同型で書く

- `setSubmittingItemId` は **`startTransition` の外**（通常優先度）で更新する。transition 内の
  通常 setState は保留されるため、ここを守らないと「操作中の行だけ disable」が壊れる
  （既存コメントの教訓）。
- `useApiAction` は使わない（楽観的更新を伴うため）。エラーバナーだけ
  `itemsAction.setErrorMessage` を共有する（品目操作は同じバナー、という既存の区分に従う）。
- **204 応答なので `response.json()` を一切呼ばない。**
- 失敗時は `setItems` を呼ばない → transition 終了時に `useOptimistic` が `items` へ
  再ベースされ、行が自動的に戻る（既存のチェック操作と同じ挙動）。
- **404 は成功扱い**（削除は冪等。2 人利用で相手が先に消したケースは目的達成済み）。
- 失敗文言は既存の `resolveItemFailureMessage` を再利用（422 のとき
  「買い物完了後は変更できません。「買い物を再開」してください。」）。

### 確認ダイアログはクライアントに 1 つだけ置く

行ごとに `AlertDialog` を置くと DOM が品目数だけ増える。`shopping-list-client.tsx` が
`pendingRemoveItem: ShoppingItemDto | null` を持ち、**制御モード**の `AlertDialog` を 1 つ描画する。

- `pendingRemoveItem` は `items`（確定値）から引く。`optimisticItems` から引くと transition 中の
  値を掴む。
- 説明文の組み立ては純関数 `describeRemoveConfirmation(item): string` に切り出し、
  `_utils/shopping-list-view.ts` に置く（テスト可能にするため）。

| 条件                                                         | 説明文                                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `source === 'from_meal_plan'`                                | 「この品目は献立から作られています。削除しても「献立の変更を反映」を押すと再び追加されます。」 |
| 上記以外で `status === 'bought'` かつ `actualPrice !== null` | 「記録した金額も一緒に削除されます。元に戻せません。」                                         |
| それ以外                                                     | 「削除すると元に戻せません。」                                                                 |

### 行の削除ボタン

- アイコンは `X` ではなく **`Trash2`**。この行には既にチェックボックスがあり、`X` だと
  「チェックを外す」と誤読される（MealPlan の前例は `X` だが、あちらの行にチェックボックスは無い）。
- `aria-label={`${item.displayName}を削除`}`。
- `readOnly`（`status !== 'active'`）のときは**描画しない**（既存の「金額を記録」と同じ扱い）。
- `locked = submitting || readOnly` で `disabled`。

## バックエンド設計

### Domain

```ts
/**
 * 品目をリストから取り除く。誤って追加した品目を消すための操作で、購入済み（bought）の
 * 品目も削除できる（購入実績ごと消える）。
 *
 * @throws Error active でない、または itemId の品目が存在しない場合
 */
removeItem(itemId: ShoppingItemId): void {
  this.assertActive('removeItem');
  this.findItem(itemId);
  this.listItems = this.listItems.filter((candidate) => !candidate.id.equals(itemId));
}
```

`MealPlan.removeRecipe` は「filter して長さ不変なら throw」だが、`ShoppingList` には既に
private `findItem` があるので**既存様式に合わせて `findItem` で存在確認する**。効果は同じで
エラーメッセージも他メソッドと揃う。クラス JSDoc の更新操作の列挙にも `removeItem` を加える。

### Application

`RemoveItemUseCase.execute(input): Promise<void>`。既存共通ヘルパを使い、
`loadActiveShoppingList(repo, id, 'removeItem')` → `requireItem(list, itemId, rawItemId)` →
`removeItem` → `save` の順。返り値なしは `RemoveRecipeFromMealPlanUseCase` と同型。

## エラー処理

外部 API / 外部ストレージへの I/O を含まない（DB のみ）ため、リトライ・タイムアウト・
部分失敗・フォールバックの 5 項目は**対象外**。

ドメイン境界（UseCase の入口）でリスト・品目の存在と状態を検査し、既存のエラークラスを投げる。
ルート層は変換せず `app.ts` の `onError` に委ねる。

冪等性: サーバー側は 2 回目の削除で `ShoppingItemNotFoundError`（404）になる。**クライアントが
404 を成功として扱う**ことで、ユーザーから見た削除操作は冪等になる。

## ログと監視

**対象外**（本プロジェクトに構造化ログ・監視基盤は無い）。

## セキュリティ

MVP1 は認証なし（ADR-0003）のため認可の観点は**対象外**。入力は `zValidator` で UUID 形式を
検証し、Drizzle のパラメタライズドクエリを通すため SQL インジェクションの経路は無い。

## 性能

品目数は 1 リストあたり数十件規模。`save()` は既存どおり「全行 upsert + 差分 DELETE」で、
削除でクエリが増えることはない。**追加の最適化は対象外。**

## テスト方針

`docs/tests/shopping-item-remove.md` を正とする。層ごとの要点:

- Domain: 削除の成功 / bought・from_meal_plan も削除可 / 存在しない itemId で throw /
  completed で throw / 他品目が不変 / `items` の防御的コピーが維持される
- Application: `save` が呼ばれる / 3 種のエラー / エラー時に `save` を呼ばない / 検査順
- Hono ルート: 204・ボディ空 / 400 / 404 / 422（既存の `vi.mock('@cookpit/application')` パターン）
- Infrastructure: 削除経由で行が消えることを PGlite で 1 件固定
- Web: 確認ダイアログ / 楽観削除 / ロールバック / 404 の成功扱い / completed で非表示 /
  文言の出し分け / 既存 3 テストが `$delete` モック追加のみで通ること（回帰）

テストファイル名は apps/web の vitest `include`（`src/server/**/*.test.ts` / `*.test.tsx`）に
合わせる。素の `src/**/*.test.ts` は silent skip になるため使わない。

## 移行とリリース

DB 変更なし・既存契約の変更なしのため、特別な移行手順は**不要**。デプロイ順序の制約もない。

## リスク

| リスク                                                                           | 対策                                                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `OptimisticAction` ユニオン化で既存 3 箇所の更新漏れ                             | 判別可能ユニオンにすることで `type` 未指定は型エラー。既存 3 テストが無変更で通ることを回帰条件にする        |
| 削除直後の focus 起因 silent 再取得が古い items を返し、消した行が復活して見える | 既存のチェック操作にも同種の競合があり、影響は次回再取得までの一時的なもの。本件では対処しない（既知の制約） |
| 献立由来を消しても sync で復活し「削除が効かない」と誤解される                   | 確認ダイアログの説明文で明示（ADR-0011 にも記載）                                                            |
| 購入済み品目の削除で購入実績が失われる                                           | 確認ダイアログで「記録した金額も一緒に削除されます」と明示                                                   |
| ルート追加で既存パスと食い合う                                                   | `DELETE` は既存の `POST /:id/items/:itemId/*` とメソッドが異なる。回帰テストで既存ルートの解決を確認する     |

## 未決事項

なし。物理削除の採用・削除対象の範囲（全品目）・確認ダイアログの有無はユーザー確認済み。
