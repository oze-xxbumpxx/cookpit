# 実装計画: shopping-item-remove

- 前提となる設計書: `docs/designs/shopping-item-remove.md`
- レベル: L3
- 実装ルート: Orchestrator（implementer）
- 判断理由: 既定（`docs/06-ai-tools.md` — 複数層にまたがる契約変更を含むため Claude 側で実装）

## 変更対象ファイル

| path                                                                                | なぜ変えるか                                                                     |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `packages/domain/src/shopping-list/shopping-list.ts`                                | 集約に `removeItem` を追加。クラス JSDoc の更新操作の列挙も更新                  |
| `packages/domain/src/shopping-list/shopping-list.test.ts`                           | `removeItem` の観点を追加                                                        |
| `packages/application/src/shopping-list/shopping-list.dto.ts`                       | `RemoveItemInputDto` を追加                                                      |
| `packages/application/src/shopping-list/index.ts`                                   | `remove-item.use-case` を re-export                                              |
| `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.test.ts` | `removeItem` 経由で行が消えることを PGlite で固定                                |
| `apps/web/src/server/routes/shopping-lists.ts`                                      | `DELETE /:id/items/:itemId` を追加                                               |
| `apps/web/src/app/shopping-lists/_utils/shopping-list-view.ts`                      | `describeRemoveConfirmation` を追加                                              |
| `apps/web/src/app/shopping-lists/_utils/shopping-list-view.node.test.ts`            | 同関数の観点を追加                                                               |
| `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`                 | 削除ボタンを追加（`onRequestRemove` prop）                                       |
| `apps/web/src/app/shopping-lists/_components/shopping-item-row.test.tsx`            | 削除ボタンの観点を追加。既存 `renderRow` の defaults に `onRequestRemove` を足す |
| `apps/web/src/app/shopping-lists/_components/store-group.tsx`                       | `onRequestRemove` を中継（**必須 prop**）                                        |
| `apps/web/src/app/shopping-lists/_components/store-group.test.tsx`                  | defaults に `onRequestRemove` を追加                                             |
| `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`              | `OptimisticAction` ユニオン化・`handleRemoveItem`・確認ダイアログ                |

## 新規作成ファイル

| path                                                                               | 役割                                                             |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `packages/application/src/shopping-list/remove-item.use-case.ts`                   | `RemoveItemUseCase`                                              |
| `packages/application/src/shopping-list/remove-item.use-case.test.ts`              | 同 UseCase のテスト                                              |
| `apps/web/src/server/routes/shopping-lists.remove-item.test.ts`                    | ルートのテスト（既存 `shopping-lists.*.test.ts` の命名に揃える） |
| `apps/web/src/app/shopping-lists/_components/shopping-list-client.remove.test.tsx` | 削除の画面テスト（既存の分割方針に揃える）                       |

## ファイルごとの変更内容

### `packages/domain/src/shopping-list/shopping-list.ts`

- 変更内容: `uncheck()` の直後に `removeItem(itemId: ShoppingItemId): void` を追加。
  `assertActive('removeItem')` → `findItem(itemId)`（存在確認・無ければ throw）→
  `listItems` を filter で置き換える。JSDoc に `@throws` を書く。クラス JSDoc の
  「すべての更新操作（addItem / markAsBought / ...）」の列挙に `removeItem` を加える。
- 完了条件: 既存の `check` / `uncheck` と同じ体裁で、`pnpm test --filter @cookpit/domain` が通る。

### `packages/application/src/shopping-list/shopping-list.dto.ts`

- 変更内容: `ReassignStoreInputDto` の近くに
  `export interface RemoveItemInputDto { shoppingListId: string; itemId: string }` を追加。
- 完了条件: `pnpm type-check` が通る。

### `packages/application/src/shopping-list/remove-item.use-case.ts`（新規）

- 変更内容: `RemoveItemUseCase`。コンストラクタは `shoppingListRepository` のみ。
  `execute(input: RemoveItemInputDto): Promise<void>` で
  `loadActiveShoppingList(repo, input.shoppingListId, 'removeItem')` →
  `ShoppingItemId.fromString(input.itemId)` → `requireItem(list, itemId, input.itemId)` →
  `list.removeItem(itemId)` → `repo.save(list)`。クラス JSDoc に `@throws` 3 種と
  「献立由来は sync で復活する」旨を書く。
- 完了条件: `set-item-checked.use-case.ts` と同じ構造で、テストが通る。

### `packages/application/src/shopping-list/index.ts`

- 変更内容: `export * from './remove-item.use-case';` を `add-item.use-case` の近くに追加。
- 完了条件: `apps/web` から `RemoveItemUseCase` を import できる。

### `apps/web/src/server/routes/shopping-lists.ts`

- 変更内容: import に `RemoveItemUseCase` を追加。`.post('/:id/items/:itemId/target-store', ...)`
  の直後、`.post('/:id/complete', ...)` の前に `.delete('/:id/items/:itemId', zValidator('param',
shoppingItemIdParamSchema), ...)` をチェーンで追加し `c.body(null, 204)` を返す。
- 完了条件: **チェーンを切らない**（Hono RPC の型がフロントに伝わらなくなるため）。
  `client.api['shopping-lists'][':id'].items[':itemId'].$delete` が型として解決する。

### `apps/web/src/app/shopping-lists/_utils/shopping-list-view.ts`

- 変更内容: `describeRemoveConfirmation(item: ShoppingItemDto): string` を追加。
  設計書 §フロントエンド設計の 3 分岐（`from_meal_plan` / `bought` かつ `actualPrice !== null` / それ以外）。
- 完了条件: 純関数で DOM に依存しない。`.node.test.ts` で 3 分岐が固定される。

### `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`

- 変更内容: props に `onRequestRemove: (itemId: string) => void` を**必須**で追加。店舗チップの右に
  `Trash2` の ghost ボタンを追加し、`readOnly` のときは描画しない。`disabled={locked}`。
  `aria-label={`${item.displayName}を削除`}`。
- 完了条件: `readOnly` で削除ボタンが DOM に出ない。既存のチェック・店舗チップの挙動が不変。

### `apps/web/src/app/shopping-lists/_components/store-group.tsx`

- 変更内容: props に `onRequestRemove: (itemId: string) => void` を**必須**で追加し
  `ShoppingItemRow` へそのまま渡す。
- 完了条件: 任意 prop にしない（中継漏れを型エラーで検出させる。2026-07-25 の教訓）。

### `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`

- 変更内容:
  1. `OptimisticAction` を判別可能ユニオンに変更し、`applyOptimisticPatch` を
     `applyOptimisticAction` にリネーム（`remove` 分岐を追加）。既存 3 箇所に `type: 'patch'` を付与。
  2. `pendingRemoveItem: ShoppingItemDto | null` state を追加。
  3. `handleRemoveItem(itemId)` を `handleSetChecked` と同型で追加（`setSubmittingItemId` は
     `startTransition` の外、404 は成功扱い、`response.json()` を呼ばない、
     `expandedItemId` のクリア）。
  4. `StoreGroup` に `onRequestRemove` を渡す（`items` から `pendingRemoveItem` を引く）。
  5. JSX 末尾に制御モードの `AlertDialog` を 1 つ追加。
- 完了条件: 既存の 4 テストファイルが `$delete` モック追加のみで通る。

## 実装手順

1. **Domain** … `shopping-list.ts` に `removeItem` / `shopping-list.test.ts` に観点追加 /
   完了条件: `pnpm lint && pnpm type-check && pnpm test`
2. **Application** … `remove-item.use-case.ts` 新規・DTO・barrel・テスト /
   完了条件: 同上
3. **Infrastructure テスト** … `removeItem` 経由の行削除を PGlite で 1 件固定 /
   完了条件: 同上
4. **Hono ルート** … `.delete(...)` 追加・`shopping-lists.remove-item.test.ts` 新規 /
   完了条件: 同上。既存ルートの解決が壊れていないこと
5. **UI（純関数）** … `describeRemoveConfirmation` と `.node.test.ts` /
   完了条件: 同上
6. **UI（コンポーネント）** … row → store-group → client の順。RPC モックはテストファイル
   ごとに定義する既存方式のため、共有 fixtures の変更は不要だった /
   完了条件: 同上。**既存 4 テストがアサーション無変更で通る**（必須 prop 追加に伴う
   defaults への 1 行追加のみ）
7. **実画面確認** … `manual-browser-verify`（PGlite dev + Playwright）

## テスト計画

正典は `docs/tests/shopping-item-remove.md`。ファイル名と vitest project の対応:

| ファイル                                                                            | project        | 根拠                      |
| ----------------------------------------------------------------------------------- | -------------- | ------------------------- |
| `packages/domain/src/shopping-list/shopping-list.test.ts`                           | domain         | 既存                      |
| `packages/application/src/shopping-list/remove-item.use-case.test.ts`               | application    | 既存                      |
| `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.test.ts` | infrastructure | 既存                      |
| `apps/web/src/server/routes/shopping-lists.remove-item.test.ts`                     | **node**       | `src/server/**/*.test.ts` |
| `apps/web/src/app/shopping-lists/_utils/shopping-list-view.node.test.ts`            | **node**       | `src/**/*.node.test.ts`   |
| `apps/web/.../shopping-list-client.remove.test.tsx`                                 | **dom**        | `src/**/*.test.tsx`       |

素の `src/**/*.test.ts`（server 以外）は**どの project にも一致せず silent skip** になるため
使わない。

## リスク

| リスク                                                                   | 対策                                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `OptimisticAction` ユニオン化で既存 3 箇所の更新漏れ                     | 判別可能ユニオンで型エラーになる。既存テストが無変更で通ることを回帰条件にする         |
| Hono のチェーンを切って RPC 型が壊れる                                   | `.delete` をチェーン内に書く。`$delete` がフロントで型解決することを type-check で確認 |
| `shopping-item-row` / `store-group` の必須 prop 追加で既存テストが壊れる | defaults に 1 行足すだけで済む形にする（`readOnly` 追加時の先例）                      |
| 404 の成功扱いが「本当に消えていないのに消えた表示」を生む               | 404 は「その id の品目がサーバーに無い」＝目的達成済み。設計書に根拠を記載             |

## ロールバック

Domain の `removeItem`、`RemoveItemUseCase` とその export、ルートの `.delete`、UI の削除ボタン・
ダイアログ・`handleRemoveItem` を取り除き、`OptimisticAction` を元の単一形へ戻す。DB 変更が
無いためデータ側の後始末は不要。

## ドキュメント更新対象

- `docs/04-domain-model.md` の ShoppingList 集約セクションに `removeItem` を追記する
- `docs/decisions/ADR-0011-shopping-item-hard-delete.md`（作成済み）
- `docs/reviews/shopping-item-remove.md`（レビュー実施後）
