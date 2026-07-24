# 試験計画: shopping-list-item-check

- 前提となる設計書: `docs/designs/shopping-list-item-check.md`（確定・2026-07-24）
- 関連 ADR: `docs/decisions/ADR-0009-shopping-list-item-check-uncheck.md`
- 実装計画: `docs/implementation-plans/shopping-list-item-check.md`（並行作成。本計画と矛盾しないこと）
- レベル: L2（Domain / Application / api-contract / apps/web の4層。Infrastructure は無変更）
- 要件書: 専用の `docs/requirements/shopping-list-item-check.md` は存在しない（Glob 確認済み）。
  設計書「要件」節の R-1〜R-6 を要件相当として §要件対応表 で照合する。

---

## 0. 実装コード走査結果（メソッド網羅チェックの前提）

対象パッケージの既存実装を Read/Grep で走査し、本機能が触れる全 public メソッド・型・コンポーネント
Props を確認した（設計書に記載のないものが無いか確認済み）。

| 対象                      | ファイル                                                               | 既存 public API                                                                                                                                                                           |
| ------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ShoppingItem`            | `packages/domain/src/shopping-list/shopping-list.ts`                   | `create`/`reconstruct`/`markAsBought`/`markAsSkipped`/`reassignStore`/`isBought`/getter 10種（変更なし。`check`/`uncheck` が新規追加対象）                                                |
| `ShoppingList`            | 同上                                                                   | `create`/`reconstruct`/`addItem`/`markAsBought`/`reassignStore`/`markAsSkipped`/`complete`/`reopen`/getter 6種（変更なし。`check(itemId)`/`uncheck(itemId)` が新規追加対象）              |
| `MarkAsBoughtUseCase`     | `packages/application/src/shopping-list/mark-as-bought.use-case.ts`    | `execute()`（**無変更**。回帰対象）                                                                                                                                                       |
| `CompleteShoppingUseCase` | `packages/application/src/shopping-list/complete-shopping.use-case.ts` | `execute()`（ロジック無変更。`buildPriceRecord()` の `null` ガードのテストカバレッジのみ追加）                                                                                            |
| `shopping-list.schema.ts` | `packages/api-contract/src/shopping-list.schema.ts`                    | 既存 6 スキーマ（無変更。`setItemCheckedSchema` が新規追加対象）                                                                                                                          |
| `shoppingListsRoute`      | `apps/web/src/server/routes/shopping-lists.ts`                         | 既存 7 エンドポイント（無変更。`POST /:id/items/:itemId/checked` が新規追加対象）                                                                                                         |
| `ShoppingItemRow`         | `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`    | `onToggleExpand`/`onMarkAsBought`/`onReassignStore` の3コールバック props（`onSetChecked` が新規追加、`onToggleExpand` の意味が変わる）                                                   |
| `PurchaseInputForm`       | `apps/web/src/app/shopping-lists/_components/purchase-input-form.tsx`  | props 無変更。表示文言と親からの表示条件のみ変わる                                                                                                                                        |
| `StoreGroup`              | `apps/web/src/app/shopping-lists/_components/store-group.tsx`          | `onToggleExpand`/`onMarkAsBought`/`onReassignStore` の中継（`onSetChecked` の中継が新規追加）                                                                                             |
| `ShoppingListClient`      | `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx` | `handleMarkAsBought`/`handleAddItem`/`handleReassignStore`/`handleToggleExpand`/`handleComplete`/`handleReopen`/`handleSync`/`handleRefetch`（無変更。`handleSetChecked` が新規追加対象） |

既存テストの有無: 全対象ファイルに co-located テストが既に存在する（`shopping-list.test.ts` /
`shopping-list-use-cases.test.ts` / `complete-shopping.use-case.test.ts` /
`shopping-list.schema.test.ts` / `shopping-lists.test.ts` / `shopping-item-row.test.tsx` /
`purchase-input-form.test.tsx` / `shopping-list-client.test.tsx` / `store-group.test.tsx`）。
本計画はこれらへの追記・一部改修として設計する（新規ファイル作成は不要）。

---

## 1. 試験種別

| 種別             | 対象                                                                                                 | ランナー / 手段                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Domain 単体      | `ShoppingItem.check`/`uncheck`、`ShoppingList.check`/`uncheck`                                       | Vitest（`packages/domain`、co-located `src/**/*.test.ts`）                                                        |
| Application 単体 | `SetItemCheckedUseCase`（新規）、`CompleteShoppingUseCase`（回帰ケース追加）                         | Vitest（`packages/application`、`src/**/*.test.ts`）                                                              |
| Contract 単体    | `setItemCheckedSchema`                                                                               | Vitest（`packages/api-contract`。`package.json` に `test: vitest run` 済み・`vitest.config.ts` 実在確認済み）     |
| API ルート       | `POST /api/shopping-lists/:id/items/:itemId/checked`                                                 | Vitest node project（`apps/web/src/server/routes/*.test.ts` は `vitest.node.config.mts` の include に一致）       |
| コンポーネント   | `shopping-item-row.tsx` / `purchase-input-form.tsx` / `shopping-list-client.tsx` / `store-group.tsx` | Vitest + RTL dom project（`*.test.tsx` は `vitest.dom.config.mts` の include に一致）                             |
| 実画面           | タップ即チェック・チェック解除・金額記録の一連フロー                                                 | manual-browser-verify（**推奨・任意**。個人開発規模・既存フローの延長のため必須にしない）                         |
| E2E              | —                                                                                                    | **対象外**。既存 `recipe-crud.smoke.spec.ts` はこの機能と無関係のため回帰確認のみで足り、新規シナリオは追加しない |

---

## 2. Domain 試験観点（`packages/domain/src/shopping-list/shopping-list.test.ts`）

新規 `describe` を `ShoppingItem` / `ShoppingList` の既存ブロックに追記する。

### 2-1. `ShoppingItem.check()` / `uncheck()`

| #                                  | 観点                                                      | 前提                                                              | 操作                      | 期待結果                                                                                                                                         | 分類              |
| ---------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| SI-CK-01                           | pending からのチェック                                    | `status: 'pending'`（`createItem()`）                             | `item.check()`            | `status === 'bought'`、`actualPrice`/`actualStore` は `null` のまま                                                                              | 正常              |
| SI-CK-02                           | skipped からのチェック                                    | `item.markAsSkipped()` 済み                                       | `item.check()`            | `status === 'bought'`（`markAsBought` の S-11b 寛容方針と同様、現状態を問わず遷移）                                                              | 正常/境界         |
| SI-CK-03                           | bought への再チェック（冪等）                             | `item.check()` 済み                                               | `item.check()` を再度呼ぶ | エラーにならず `status === 'bought'` のまま                                                                                                      | 正常/冪等         |
| SI-CK-04（**重点・データ整合性**） | 価格記録済み item への check() 再適用で価格が消えないこと | `item.markAsBought(Money.of(200,'JPY'), StoreId('store-1'))` 済み | `item.check()`            | `status === 'bought'` のまま、`actualPrice.amount === 200`・`actualStore.value === 'store-1'` は**不変**（`check()` は価格フィールドに触れない） | 正常/データ整合性 |
| SI-CK-05（**重点**）               | bought→pending で価格がクリアされる                       | `markAsBought(Money.of(198,'JPY'), StoreId('store-1'))` 済み      | `item.uncheck()`          | `status === 'pending'`、`actualPrice === null`、`actualStore === null`                                                                           | 正常/データ整合性 |
| SI-CK-06                           | 価格未記録の bought（check() のみ）からの uncheck         | `item.check()` のみ実行済み（価格未記録）                         | `item.uncheck()`          | `status === 'pending'`、`actualPrice`/`actualStore` は引き続き `null`（クラッシュしない）                                                        | 境界              |
| SI-CK-07                           | pending からの uncheck 拒否                               | `status: 'pending'`                                               | `item.uncheck()`          | `Error("Cannot uncheck a ShoppingItem with status 'pending'")` を throw                                                                          | 異常              |
| SI-CK-08                           | skipped からの uncheck 拒否                               | `item.markAsSkipped()` 済み                                       | `item.uncheck()`          | `Error("Cannot uncheck a ShoppingItem with status 'skipped'")` を throw                                                                          | 異常/境界         |

不変引数・防御的コピー: `check()`/`uncheck()` は引数を取らないため対象外。副作用（`updatedAt` 等）:
`ShoppingItem`/`ShoppingList` に該当フィールドが存在しないため対象外（既存 `markAsBought` 等と同様）。

### 2-2. `ShoppingList.check(itemId)` / `uncheck(itemId)`

| #                    | 観点                                                  | 前提                                                                 | 操作                                                 | 期待結果                                                                                                                                                                                             | 分類              |
| -------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| SL-CK-01             | active リストでの check                               | `status: 'active'`、対象 item が存在                                 | `list.check(item.id)`                                | 対象 item の `status === 'bought'`                                                                                                                                                                   | 正常              |
| SL-CK-02             | completed リストでの check 拒否                       | `status: 'completed'`（`reconstructCompletedList`）                  | `list.check(item.id)`                                | `Error("Cannot check a ShoppingList with status 'completed'")` を throw（`assertActive` ガード）                                                                                                     | 異常              |
| SL-CK-03             | 存在しない itemId での check                          | `status: 'active'`                                                   | `list.check(ShoppingItemId.fromString('missing'))`   | `Error('ShoppingItem not found')` を throw                                                                                                                                                           | 異常              |
| SL-CK-04             | active リストでの uncheck                             | `status: 'active'`、対象 item が `markAsBought` 済み（価格記録あり） | `list.uncheck(item.id)`                              | 対象 item の `status === 'pending'`、`actualPrice`/`actualStore` が `null`                                                                                                                           | 正常/データ整合性 |
| SL-CK-05             | completed リストでの uncheck 拒否（アサート順序確認） | `status: 'completed'`、対象 item は `bought`                         | `list.uncheck(item.id)`                              | `Error("Cannot uncheck a ShoppingList with status 'completed'")` を throw（`assertActive` が `findItem`/`item.uncheck()` より先に評価されることを確認。item 側のエラーメッセージが漏れ出さないこと） | 異常/境界         |
| SL-CK-06             | 存在しない itemId での uncheck                        | `status: 'active'`                                                   | `list.uncheck(ShoppingItemId.fromString('missing'))` | `Error('ShoppingItem not found')` を throw                                                                                                                                                           | 異常              |
| SL-CK-07（**境界**） | active リストで pending item への uncheck             | `status: 'active'`、対象 item は `pending`                           | `list.uncheck(item.id)`                              | `assertActive` は通過し、`ShoppingItem.uncheck()` 由来の `Error("Cannot uncheck a ShoppingItem with status 'pending'")` がそのまま伝播する（`ShoppingList` 層で握り潰されない）                      | 異常/境界         |

---

## 3. Application 試験観点（`packages/application/src/shopping-list/`）

### 3-1. `SetItemCheckedUseCase`（新規。`shopping-list-use-cases.test.ts` に `describe('SetItemCheckedUseCase')` を追加）

既存 `describe('MarkAsBoughtUseCase')` と同じ `seededItem()`/`seededShoppingList()` ヘルパを流用する。

| #                                | 観点                                              | 前提                                                                                              | 操作                                                        | 期待結果                                                                                                                                                                                                                                                                                                   | 分類              |
| -------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| SIC-01                           | pending → bought                                  | `seededItem({status:'pending'})`                                                                  | `execute({shoppingListId, itemId, checked: true})`          | `dto.status === 'bought'`                                                                                                                                                                                                                                                                                  | 正常              |
| SIC-02（**重点・データ整合性**） | bought → pending でクリア                         | `seededItem({status:'bought', actualPrice: Money.of(198,'JPY'), actualStoreId:'actual-store-1'})` | `execute({..., checked: false})`                            | `dto.status === 'pending'`、`dto.actualPrice === null`、`dto.actualStoreId === null`                                                                                                                                                                                                                       | 正常/データ整合性 |
| SIC-03（**最重要・冪等**）       | 既に bought の品目に checked:true（価格記録あり） | `seededItem({status:'bought', actualPrice: Money.of(198,'JPY'), actualStoreId:'actual-store-1'})` | `execute({..., checked: true})`                             | 例外を投げず `dto.status === 'bought'`。**`dto.actualPrice`/`dto.actualStoreId` は変化しない**（Domain の `check()` 呼び出し自体がスキップされるため、`uncheck()` が誤って呼ばれて価格が消えることもない）。`shoppingListRepository.saveCount === 1`（no-op でも `save()` は呼ばれる設計であることを確認） | 正常/冪等         |
| SIC-04（**最重要・冪等**）       | 既に pending の品目に checked:false               | `seededItem({status:'pending'})`                                                                  | `execute({..., checked: false})`                            | 例外を投げず `dto.status === 'pending'`（`uncheck()` は pending に対して `Error` を投げる不変条件を持つが、Application 層の冪等ガードにより呼び出し自体がスキップされ例外化しない）                                                                                                                        | 正常/冪等         |
| SIC-05                           | 存在しない ShoppingList                           | シード無し                                                                                        | `execute({shoppingListId:'missing', itemId, checked:true})` | `ShoppingListNotFoundError` を throw                                                                                                                                                                                                                                                                       | 異常              |
| SIC-06                           | completed リスト                                  | `seededShoppingList('completed')`                                                                 | `execute({..., checked: true})`                             | `InvalidShoppingListStateError` を throw（item 存在チェックより先に評価されることを `MarkAsBoughtUseCase` と同順序で確認）                                                                                                                                                                                 | 異常              |
| SIC-07                           | 存在しない ShoppingItem                           | `seededShoppingList('active', [])`                                                                | `execute({..., itemId:'missing', checked:true})`            | `ShoppingItemNotFoundError` を throw                                                                                                                                                                                                                                                                       | 異常              |
| SIC-08（境界）                   | skipped 品目への checked:true                     | `seededItem({status:'skipped'})`                                                                  | `execute({..., checked: true})`                             | 例外にならず `dto.status === 'bought'`（`alreadyChecked` は false のため `check()` が呼ばれる。設計書に明記の非公開経路の挙動固定）                                                                                                                                                                        | 正常/境界         |
| SIC-09（境界）                   | skipped 品目への checked:false                    | `seededItem({status:'skipped'})`                                                                  | `execute({..., checked: false})`                            | 例外にならず `dto.status === 'skipped'`（`alreadyChecked` が false のため no-op のまま）                                                                                                                                                                                                                   | 正常/境界         |
| SIC-10（境界）                   | 価格未記録 bought 品目への checked:false          | `seededItem({status:'bought', actualPrice:null, actualStoreId:null})`                             | `execute({..., checked: false})`                            | `dto.status === 'pending'`、`actualPrice`/`actualStoreId` は引き続き `null`（クラッシュしない）                                                                                                                                                                                                            | 境界              |

### 3-2. `CompleteShoppingUseCase`（回帰・要件 R-4 の明示カバレッジ追加。`complete-shopping.use-case.test.ts` L349-384 の `it.each` に1エントリ追加）

| #                          | 観点                                                              | 前提                                                                                                               | 操作                                                    | 期待結果                                                                                                                                                                                                                                                                                                         | 分類      |
| -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| CS-CK-01（**新規・重点**） | `actualPrice` が `null`（チェックのみで金額未記録）の bought 品目 | `seededItem({ actualPrice: null })`（`productId`/`actualStore` は既定値のまま非 null。`status` 既定は `'bought'`） | `completeShoppingUseCase().execute({ shoppingListId })` | `result.status === 'completed'`、`product.priceHistory` は空のまま、`productRepository.saveCount === 0`（`buildPriceRecord()` の `actualPrice === null` 分岐が実際に機能することを明示的に固定する。既存ケースは `productId が null` と `actualPrice が 0` のみで、`actualPrice === null` 自体は未カバーだった） | 境界/回帰 |

既存の `it.each`（productId が null / actualPrice が 0 / requiredAmount が null 等）5ケースは無変更のまま
green を維持する（回帰確認）。

---

## 4. api-contract 試験観点（`packages/api-contract/src/shopping-list.schema.test.ts`）

新規 `describe('setItemCheckedSchema')` を追加する。

| #                                 | 観点                    | 前提                  | 操作                                           | 期待結果                                          | 分類      |
| --------------------------------- | ----------------------- | --------------------- | ---------------------------------------------- | ------------------------------------------------- | --------- |
| Z-SIC-01                          | `checked: true` の受理  | —                     | `setItemCheckedSchema.parse({checked: true})`  | `{checked: true}` と一致                          | 正常      |
| Z-SIC-02                          | `checked: false` の受理 | —                     | `setItemCheckedSchema.parse({checked: false})` | `{checked: false}` と一致                         | 正常      |
| Z-SIC-03                          | 文字列を reject         | —                     | `parse({checked: 'true'})`                     | `throw`                                           | 異常      |
| Z-SIC-04（it.each）               | 数値を reject           | `1` / `0` の2パターン | `parse({checked: 1})` / `parse({checked: 0})`  | いずれも `throw`                                  | 異常      |
| Z-SIC-05（**回帰固定・§3 対応**） | `null` を reject        | —                     | `parse({checked: null})`                       | `throw`（`.nullable()` を付けていないことの固定） | 異常/境界 |
| Z-SIC-06（**回帰固定・§3 対応**） | キー省略を reject       | —                     | `parse({})`                                    | `throw`（`.optional()` を付けていないことの固定） | 異常/境界 |

既存 `describe('generateShoppingListSchema')` 等6ブロックは無変更のまま green を維持する（回帰確認。
共有ヘルパー・import 順序への副作用がないこと）。

---

## 5. apps/web: Hono ルート試験観点（`apps/web/src/server/routes/shopping-lists.test.ts`）

**実装上の注意（設計書に明記なし・走査で判明）**: このファイルの `vi.mock('@cookpit/application', ...)`
は名前付きモック対象を明示列挙する方式（`AddItemUseCase: vi.fn()` 等）。新規 `SetItemCheckedUseCase` を
このリストに追加し忘れると、モックされない実 UseCase が呼ばれ `vi.mock('@/db/client', () => ({db: null, ...}))`
により DB アクセスで失敗する。既存7 UseCase と同じパターンで追加が必要（implementer への申し送り）。

| #                                             | 観点                                                     | 前提                                                                                  | 操作                                                                     | 期待結果                                                                                                                                                             | 分類      |
| --------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| RT-SIC-01                                     | 200 で ShoppingItemDto を返す                            | `execute` が bought の `ShoppingItemDto` を resolve                                   | `POST /api/shopping-lists/:id/items/:itemId/checked` に `{checked:true}` | `res.status === 200`、body が dto と一致、`execute` が `{shoppingListId, itemId, checked:true}` で呼ばれる                                                           | 正常      |
| RT-SIC-02（it.each）                          | 不正入力で 400                                           | `不正な id` / `不正な itemId` / `checked が文字列` / `checked キー省略` の4パターン   | 各パターンで POST                                                        | `res.status === 400`、`execute` は呼ばれない                                                                                                                         | 異常      |
| RT-SIC-03（it.each）                          | NotFound 系の 404 変換                                   | `execute` が `ShoppingListNotFoundError` / `ShoppingItemNotFoundError` を reject      | POST                                                                     | `res.status === 404`、`{error: message}` が該当エラーの message と一致                                                                                               | 異常      |
| RT-SIC-04                                     | 422 変換                                                 | `execute` が `InvalidShoppingListStateError('completed', 'setItemChecked')` を reject | POST                                                                     | `res.status === 422`、`{error: "Cannot setItemChecked a ShoppingList with status 'completed'"}`                                                                      | 異常      |
| RT-SIC-05（**冪等性の契約テスト・新規観点**） | 同一 `{checked:true}` を同じ `id`/`itemId` に連続2回送信 | `execute` が両呼び出しで同一の bought `ShoppingItemDto` を resolve するようモック     | POST を2回連続実行                                                       | 両方とも `200` かつ同一の `ShoppingItemDto`。`execute` が2回とも同一引数で呼ばれる（ルート層が例外を出さないことの確認。状態不変の検証自体は §3-1 SIC-03/04 が担当） | 正常/冪等 |

既存の `/bought` `/target-store` `/complete` `/reopen` `/sync` `/items` `POST /` `GET /:id` の全既存ケースは
無変更のまま green を維持する（回帰確認）。

---

## 6. apps/web: コンポーネント試験観点

### 6-1. `shopping-item-row.tsx`（`apps/web/src/app/shopping-lists/_components/shopping-item-row.test.tsx`。prefix IR）

**設計書に明記のない改修点（走査で判明。実装計画への申し送り）**:

1. `renderRow()` ヘルパーの `defaults` に `onSetChecked: vi.fn()` を追加する必要がある（Props 型が
   必須プロパティとして要求するため、追加しないと型エラーになる）。
2. 既存 **IR-09**（「expanded のとき PurchaseInputForm が表示される」）は現状 `renderRow({expanded: true})`
   のみで item の `status` を指定しておらず、`createShoppingItemDto()` の既定値 `status: 'pending'` の
   ままテストしている。`PurchaseInputForm` の表示条件が `{bought && expanded && ...}` に変わると、
   **この既存テストはそのままでは red になる**（設計書「テスト方針」は「IR-09/IR-10 に追加」としか
   書いておらず、既存 IR-09 自体が壊れることは明記していない）。`item: createShoppingItemDto({status: 'bought'})`
   を明示的に渡す改修が必須。

| #                              | 観点                                             | 前提                                                                      | 操作                       | 期待結果                                                                                                                                                                                                                     | 分類        | 状態                       |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------- |
| IR-01〜05, IR-07, IR-08, IR-11 | 既存観点（表示・店舗バッジ・submitting disable） | 既存のまま                                                                | 既存のまま                 | 既存のまま                                                                                                                                                                                                                   | —           | 無変更（回帰）             |
| IR-06（**改修**）              | pending item のチェックボタン click              | `status: 'pending'`、`id:'item-1'`                                        | チェックボタン click       | `onSetChecked` が `('item-1', true)` で呼ばれる。`onToggleExpand` は呼ばれない                                                                                                                                               | 正常        | 改修（アサーション先変更） |
| IR-06b（**新規**）             | bought item のチェックボタン click               | `status: 'bought'`、`id:'item-1'`                                         | チェックボタン click       | `onSetChecked` が `('item-1', false)` で呼ばれる。`onToggleExpand` は呼ばれない                                                                                                                                              | 正常        | 新規                       |
| IR-09（**改修必須**）          | expanded かつ bought のとき展開表示              | `expanded: true`、`item: createShoppingItemDto({status:'bought'})` を明示 | render                     | `PurchaseInputForm`（「購入を記録」ボタン）が表示される                                                                                                                                                                      | 正常        | 改修（前提追加）           |
| IR-10                          | expanded でないとき非表示                        | `expanded: false`                                                         | render                     | 表示されない                                                                                                                                                                                                                 | 正常        | 無変更                     |
| IR-12（**廃止**）              | 旧「チェック解除 UI 非搭載」観点                 | —                                                                         | —                          | S-3 の制約自体が本設計で撤回されるため削除。代替として IR-06b が「bought item のチェックボタン click で `onSetChecked(id, false)` が呼ばれる」ことを検証するため、重複回避のため **IR-12 は実装しない**（IR-06b に統合済み） | —           | 削除                       |
| IR-13（新規）                  | pending item の aria-label                       | `status: 'pending', displayName:'醤油'`                                   | render                     | `aria-label === '醤油をチェックする'`                                                                                                                                                                                        | 正常/境界   | 新規                       |
| IR-13b（新規）                 | bought item の aria-label                        | `status: 'bought', displayName:'醤油'`                                    | render                     | `aria-label === '醤油のチェックを外す'`                                                                                                                                                                                      | 正常/境界   | 新規                       |
| IR-14（新規）                  | 「金額を記録」ボタンの表示条件                   | `status: 'pending'` と `status: 'bought'` の2パターン                     | render                     | pending では非表示、bought では表示される                                                                                                                                                                                    | 境界        | 新規                       |
| IR-15（新規）                  | 「金額を記録」ボタンの結線                       | `status: 'bought'`                                                        | 「金額を記録」ボタン click | `onToggleExpand(item.id)` が呼ばれる（`onSetChecked` は呼ばれない）                                                                                                                                                          | 正常        | 新規                       |
| IR-17（新規・**防御性**）      | pending かつ expanded true では非表示            | `status: 'pending', expanded: true`                                       | render                     | `PurchaseInputForm` が表示されない（`bought && expanded` ガードの検証）                                                                                                                                                      | 境界/防御性 | 新規                       |

### 6-2. `purchase-input-form.tsx`（`purchase-input-form.test.tsx`。prefix PF）

既存 PF-01〜08（初期値・プレフィル・disable・送信・キャンセル）は無変更のまま green を維持する
（props・挙動は変わらない）。

| #                               | 観点                       | 前提                | 操作   | 期待結果                                                                                                                                                                                                                                                                                                | 分類 | 状態                                        |
| ------------------------------- | -------------------------- | ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------- |
| PF-09（**改修**）               | bought item の訂正注記文言 | `status: 'bought'`  | render | 新文言「金額・店舗はあとから何度でも訂正できます。チェックを外すとこの記録も消えます。」が表示される（旧文言「未購入には戻せません」は表示されない）                                                                                                                                                    | 正常 | 既存テストのアサーション文字列を更新        |
| PF-10（**改修・実装裁量あり**） | pending item での注記表示  | `status: 'pending'` | render | 実装が `item.status === 'bought'` 条件を維持する場合は非表示のまま green（既存 PF-10 相当を新文言に更新するだけで足りる）。実装が無条件表示化を選んだ場合は、この観点自体が成立しなくなるため実装計画側で採用方針を確認し、成立しない場合は「対象外（無条件表示化を採用したため）」と明記して置き換える | 境界 | 実装方針依存（要 implementation-plan 確認） |

### 6-3. `shopping-list-client.tsx` / `store-group.tsx`（`shopping-list-client.test.tsx`。prefix SC = 新規、LC = 既存改修）

**設計書に明記のない改修点（走査で判明。実装計画への申し送り・最重要）**:

1. `client.api['shopping-lists'][':id'].items[':itemId']` のモックオブジェクトに新規
   `checked: { $post: (...args) => postSetChecked(...args) }` を `bought`/`target-store` と同じ形で
   追加する必要がある。
2. **`fillPurchaseInputForm` ヘルパーと、それに依存する既存 LC-04・LC-05・LC-06・LC-07・LC-08・LC-17・
   LC-18・LC-21 は、現状「チェックボックス click → `PurchaseInputForm` が展開する」という旧仕様の
   前提で書かれている。** チェックボックスの意味が「即チェック（`onSetChecked` 呼び出し）」に変わり、
   `PurchaseInputForm` は bought item の「金額を記録」ボタン経由でのみ開くようになるため、これらの
   既存テストは**そのままでは red になる**。設計書「テスト方針」節は「新規 `handleSetChecked` の
   テストを追加する」としか書いておらず、既存 LC テスト群の破壊・改修必要性には触れていない。
   改修方針: 各テストの前提 item を `status: 'bought'` にした上で、操作を「チェックボックス click」
   から「『金額を記録』ボタン click」に置き換える（`fillPurchaseInputForm` 内の
   `screen.getByRole('checkbox', {name: ...})` クリックを `screen.getByRole('button', {name: '金額を記録'})`
   クリックに変更する）。

| #                                                                 | 観点                                                                               | 前提                                                                                                        | 操作                                                                         | 期待結果                                                                                                                                                                                                                                                                | 分類              | 状態                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------- |
| SC-01（新規）                                                     | チェックで即座に楽観的更新                                                         | pending item、`postSetChecked` が未解決 Promise                                                             | チェックボックス click                                                       | `postSetChecked` が `{json:{checked:true}}` で呼ばれ、レスポンス確定前に `aria-checked` が即座に `true` になる（`useOptimistic`）                                                                                                                                       | 正常/FE固有       | 新規                         |
| SC-02（新規）                                                     | チェック成功で確定値に置換                                                         | 同上、`postSetChecked` が `{ok:true, json: () => bought dto}` を resolve                                    | 同上                                                                         | `aria-checked === 'true'` のまま、サーバー確定 DTO（`actualPrice: null` 等）で該当 item のみ置換される                                                                                                                                                                  | 正常              | 新規                         |
| SC-03（**最重要・ロールバック**）                                 | チェック失敗時のロールバック                                                       | pending item、`postSetChecked` が `{ok:false}` を resolve                                                   | チェックボックス click                                                       | 楽観的に `true` になっていた `aria-checked` が `false` にロールバックされ、「操作に失敗しました。」が表示される                                                                                                                                                         | 異常/FE固有       | 新規                         |
| SC-04（**最重要・ロールバック**）                                 | チェック中の通信エラー                                                             | pending item、`postSetChecked` が reject                                                                    | チェックボックス click                                                       | `aria-checked` が `false` にロールバックされ、「通信エラーが発生しました。」が表示される                                                                                                                                                                                | 異常/FE固有       | 新規                         |
| SC-05（新規）                                                     | チェック解除で楽観的にクリア                                                       | bought item（`actualPrice`/`actualStoreId` 記録済み）                                                       | チェックボックス click                                                       | 即座に `aria-checked === 'false'` になり、価格併記テキスト（「✓ ... 購入」）が消える（楽観的パッチで `actualPrice: null, actualStoreId: null` も反映）                                                                                                                  | 正常/データ整合性 | 新規                         |
| SC-06（新規・**防御性**）                                         | チェック解除成功で価格フォームが閉じる                                             | bought item、「金額を記録」で `PurchaseInputForm` を展開済み、`postSetChecked` がチェック解除成功を resolve | チェックボックス click（解除）                                               | 解除成功後 `PurchaseInputForm` が非表示になる（`expandedItemId` がクリアされる。誤操作防止の二重防御）                                                                                                                                                                  | 正常/防御性       | 新規                         |
| SC-07（新規）                                                     | 二重送信ガード                                                                     | pending item、`postSetChecked` が未解決 Promise                                                             | チェックボックスを連打                                                       | `postSetChecked` は1回のみ呼ばれる（`submittingItemId` ガード。既存 LC-18 と同一観点）                                                                                                                                                                                  | 正常/冪等         | 新規                         |
| SC-08（新規）                                                     | 操作中 item のみ disable                                                           | item 2件、item A の `postSetChecked` が未解決 Promise                                                       | item A のチェックボックス click 直後に render 確認                           | item A のみ disabled、item B は操作可能（既存 LC-17 と同一観点）                                                                                                                                                                                                        | 正常              | 新規                         |
| LC-04（**改修**）                                                 | 「金額を記録」でフォーム展開                                                       | item 1件・`status: 'bought'`（旧: `pending`）                                                               | 「金額を記録」ボタン click（旧: チェックボックス click）                     | `PurchaseInputForm` が展開される                                                                                                                                                                                                                                        | 正常              | 改修                         |
| LC-05（**改修**）                                                 | 購入実績入力の成功                                                                 | item 1件・`status: 'bought'`（旧: `pending`）、`bought.$post` 成功                                          | 「金額を記録」→ 価格入力 → 送信                                              | 価格併記テキストが表示され、他 item は不変                                                                                                                                                                                                                              | 正常              | 改修                         |
| LC-06（**改修・最重要**）                                         | 楽観的更新のロールバック（価格送信失敗）                                           | item 1件・`status: 'bought'`、`bought.$post` が `{ok:false}`                                                | 「金額を記録」→ 価格入力 → 送信                                              | 楽観的に表示されていた価格併記テキストが消え、「操作に失敗しました。」が表示される（`aria-checked` は元々 `true` のため変化しない点に注意。旧テストの「`aria-checked` が false に戻る」というアサーションは成立しなくなるため、価格テキストの有無で判定するよう改める） | 異常              | 改修（アサーション対象変更） |
| LC-07（**改修・最重要**）                                         | 楽観的更新中の通信エラー（価格送信）                                               | 同上、`bought.$post` が reject                                                                              | 同上                                                                         | 価格併記テキストが消え、「通信エラーが発生しました。」が表示される                                                                                                                                                                                                      | 異常              | 改修（アサーション対象変更） |
| LC-08（**改修**）                                                 | 同一 item への再送信で金額上書き                                                   | item 1件・`status: 'bought'`（旧: 変更なし、既に bought だったので前提は同じ）                              | 「金額を記録」ボタン click（旧: チェックボックス click）→ 金額を変更して送信 | 上書きされる                                                                                                                                                                                                                                                            | 正常              | 改修（操作トリガーのみ変更） |
| LC-17（**改修**）                                                 | 操作中 item のみ disable（価格送信中）                                             | item 2件とも `status: 'bought'`                                                                             | 「金額を記録」→ 価格入力 → 送信（item A のみ）                               | item A のチェックボックス・「金額を記録」ボタンが disabled、item B は操作可能                                                                                                                                                                                           | 正常              | 改修                         |
| LC-18（**改修**）                                                 | 連打しても bought.$post は1回                                                      | item 1件・`status: 'bought'`                                                                                | 「金額を記録」→ 価格入力 → 送信ボタンを連打                                  | `bought.$post` は1回のみ                                                                                                                                                                                                                                                | 正常              | 改修                         |
| LC-21（**改修**）                                                 | refetch 成功でエラーバナーがクリアされる                                           | item 1件・`status: 'bought'`、`bought.$post` 失敗 → `更新` ボタン                                           | 「金額を記録」→ 価格入力 → 送信失敗 → 更新ボタン click                       | エラーバナーが消える                                                                                                                                                                                                                                                    | 正常              | 改修                         |
| LC-01, LC-02, LC-03, LC-09〜16, LC-19, LC-20, LC-22, CB-\*, SY-\* | 既存観点（グルーピング・空状態・手動追加・店舗再割当・refetch・完了/再開ボタン等） | 既存のまま                                                                                                  | 既存のまま                                                                   | 既存のまま                                                                                                                                                                                                                                                              | —                 | 無変更（回帰確認のみ）       |

`store-group.tsx` の `onSetChecked` プロップ中継は、既存 `onMarkAsBought`/`onReassignStore` と同じ
中継パターンのため専用の SG テストは追加しない（`ShoppingItemRow` 単体テスト IR-06/06b と、
`ShoppingListClient` 経由の統合テスト SC-01〜08 で間接的に確認できるため。既存 SG-01〜04 は無変更）。

---

## 7. 実画面確認（manual-browser-verify。推奨・任意）

| #     | 確認内容                                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------- |
| MB-01 | 品目タップで即座にチェック（線引き表示）になり、再タップで即座に外れる（体感遅延なし）                     |
| MB-02 | チェック済み品目の「金額を記録」ボタンから価格・店舗を入力して記録できる                                   |
| MB-03 | 価格記録済み品目のチェックを外すと価格表示が消え、再チェックしても価格は復活しない（新規記録が必要）       |
| MB-04 | 買い物完了操作が、価格未記録のままチェックのみされた品目を含んでいてもエラーなく完了する（R-4 実挙動確認） |

---

## 8. 特性観点

- **権限**: 対象外（MVP1 は認証なし。既存エンドポイントと同一前提）。
- **データ整合性**: `uncheck()` が `actualPrice`/`actualStore` を確実にクリアすること（SI-CK-05,
  SL-CK-04, SIC-02）、`check()` が既存価格を破壊しないこと（SI-CK-04）、`CompleteShoppingUseCase` が
  価格未記録品目を安全にスキップすること（CS-CK-01）の3点で担保する。
- **冪等性（必須）**: Application 層の冪等ガード（SIC-03/04・最重要）、ルート層の連続送信契約テスト
  （RT-SIC-05）、UI 層の二重送信ガード（SC-07/08）の3層で担保する。「2人利用時の意味的競合（A が
  チェック→B が外す）」は設計書に明記の対象外（Last-Write-Wins を許容する既存方針と同一のため、
  本計画でもテスト対象外とする）。
- **障害系**: 対象外（外部 I/O は既存 DB アクセスのみで新規の外部依存を追加しない。設計書「エラー処理」
  節で明記済み）。
- **フロントエンド固有（必須）**: ローディング/二重送信ガード（SC-07/08）、エラー表示（SC-03/04・
  LC-06/07 改）、**楽観的更新のロールバック（SC-03・SC-04 が最重要）**。
- **防御性**: Domain 層は引数なしメソッドのため防御的コピー・不正引数観点は対象外。代わりに
  (a) `check()` が価格フィールドを破壊しない不変条件（SI-CK-04）、(b) `assertActive` が item 探索より
  先に評価される順序保証（SL-CK-05）、(c) Presentation 層の `bought && expanded` ガード（IR-17）、
  (d) チェック解除後の価格フォーム自動クローズ（SC-06）を担保する。

---

## 9. メソッド網羅チェック表

| 対象                      | public API / コンポーネント                              | 対応する試験観点 No                            |
| ------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| `ShoppingItem`            | `check(): void`                                          | SI-CK-01〜04                                   |
| `ShoppingItem`            | `uncheck(): void`                                        | SI-CK-05〜08                                   |
| `ShoppingList`            | `check(itemId: ShoppingItemId): void`                    | SL-CK-01〜03                                   |
| `ShoppingList`            | `uncheck(itemId: ShoppingItemId): void`                  | SL-CK-04〜07                                   |
| `SetItemCheckedUseCase`   | `execute(input): Promise<ShoppingItemDto>`               | SIC-01〜10                                     |
| `CompleteShoppingUseCase` | `execute()`（`buildPriceRecord` の null ガード回帰追加） | CS-CK-01                                       |
| `shopping-list.schema.ts` | `setItemCheckedSchema`                                   | Z-SIC-01〜06                                   |
| `shoppingListsRoute`      | `POST /:id/items/:itemId/checked`                        | RT-SIC-01〜05                                  |
| `ShoppingItemRow`         | `onSetChecked` 呼び出し（チェックボタン）                | IR-06, IR-06b                                  |
| `ShoppingItemRow`         | `aria-label` 出し分け                                    | IR-13, IR-13b                                  |
| `ShoppingItemRow`         | 「金額を記録」ボタン（表示条件・結線）                   | IR-14, IR-15                                   |
| `ShoppingItemRow`         | `PurchaseInputForm` 表示条件（`bought && expanded`）     | IR-09（改）, IR-10, IR-17                      |
| `PurchaseInputForm`       | 訂正注記文言                                             | PF-09, PF-10                                   |
| `ShoppingListClient`      | `handleSetChecked`（新規）                               | SC-01〜08                                      |
| `ShoppingListClient`      | `handleMarkAsBought`（導線変更後の回帰）                 | LC-04〜08, LC-17, LC-18, LC-21（改）           |
| `StoreGroup`              | `onSetChecked` 中継                                      | SC/IR 系の統合テストで間接確認（専用 ID なし） |

---

## 10. 要件対応表（設計書「要件」節 R-1〜R-6 との照合）

| 要件 | 内容                                                                              | 対応する試験観点                                                                                                                                               |
| ---- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1  | タップで即座に bought になる（価格・店舗は必須でない）                            | SC-01, SC-02, IR-06                                                                                                                                            |
| R-2  | 再タップで即座に pending に戻る（トグル）                                         | SC-05, IR-06b, SI-CK-05, SIC-02                                                                                                                                |
| R-3  | 価格・購入店舗はチェックとは別の任意操作                                          | IR-14, IR-15, IR-09（改）                                                                                                                                      |
| R-4  | 価格未記録のまま買い物完了しても価格記録処理が正しくスキップされる                | CS-CK-01                                                                                                                                                       |
| R-5  | 既存 `MarkAsBoughtUseCase`/`POST .../bought` の挙動・契約を変更しない（後方互換） | §11 回帰試験範囲（既存 `MarkAsBoughtUseCase` テスト・`markAsBoughtSchema` テスト・`/bought` ルートテストが無変更で green）                                     |
| R-6  | DB マイグレーションを追加しない                                                   | 対象外（Infrastructure 無変更。`DrizzleShoppingListRepository` は既存の nullable マッピングのままで動作するため新規テスト不要。設計書「DB 設計」節で確認済み） |

---

## 11. 回帰試験範囲

- Domain: `ShoppingList`/`ShoppingItem` の既存全テスト（`markAsBought`/`markAsSkipped`/`reassignStore`/
  `complete`/`reopen`/防御的コピー系）が green のまま。
- Application: `MarkAsBoughtUseCase`・`ReassignStoreUseCase`・`AddItemUseCase`・
  `GenerateShoppingListUseCase`・`SyncShoppingListFromMealPlanUseCase`・`GetShoppingListUseCase`・
  `ReopenShoppingListUseCase` の既存全ケースが green のまま。`CompleteShoppingUseCase` の既存 `it.each`
  5ケース（productId null / actualPrice 0 / requiredAmount null 等）も無変更のまま green。
- api-contract: `generateShoppingListSchema`/`addItemSchema`/`markAsBoughtSchema`/`reassignStoreSchema`/
  `shoppingItemResponseSchema`/`shoppingListResponseSchema` の既存全ケースが green のまま。
- apps/web ルート: `/bought`・`/target-store`・`/complete`・`/reopen`・`/sync`・`/items`・`POST /`・
  `GET /:id` の既存全ケースが green のまま。
- apps/web コンポーネント: `store-group.test.tsx`（SG-01〜04）・`add-item-form.test.tsx`・
  `shopping-list-entry-client.test.tsx` は無変更のまま green。`shopping-item-row.test.tsx`・
  `purchase-input-form.test.tsx`・`shopping-list-client.test.tsx` は §6 で明記した改修範囲以外は無変更。
- 他機能への波及なし（本機能は `shopping-list` 集約内に閉じており、`pantry`/`recipe`/`meal-plan`/
  `product`/`store` の既存テストに影響しない）。

---

## 12. 試験データ

- Domain: 既存 `createItem()`/`createList()`/`reconstructCompletedList()` ヘルパをそのまま流用。
- Application: 既存 `seededItem()`/`seededShoppingList()`（`shopping-list-use-cases.test.ts`）、
  `seededItem()`（`complete-shopping.use-case.test.ts` 側の同名別定義。`SeededItemOptions` に
  `actualPrice: null` を明示指定できることを確認済み）をそのまま流用。
- api-contract: 既存の固定 UUID 定数（`VALID_SHOPPING_LIST_ID` 等）をそのまま流用。
- apps/web ルート: 既存 `shoppingItemDto`/`shoppingListDto` 定数をそのまま流用。
- apps/web コンポーネント: 既存 `createStoreDto`/`createShoppingItemDto`/`createShoppingListDto`
  ローカルヘルパをそのまま流用。新規モック関数 `postSetChecked` を `postBought`/`postTargetStore` と
  同じ `vi.fn()` パターンで追加する。

---

## 13. 完了条件

- §2〜§6 の全観点（SI-CK/SL-CK/SIC/CS-CK/Z-SIC/RT-SIC/IR/PF/SC/LC 改修分）が Vitest で green。
  **特に SI-CK-04（check() の価格非破壊）・SIC-03/04（冪等ガード）・SC-03/04（ロールバック）・
  CS-CK-01（R-4 の明示カバレッジ）は最重要観点として個別に green を確認する。**
- `pnpm lint` / `pnpm type-check` / `pnpm test` が全 green（§11 回帰試験範囲を含む）。
- §10 要件対応表の R-1〜R-6 すべてに対応する試験観点があるか、または対象外理由が明記されている。
- §6 で明記した「設計書に無い改修必須点」（IR-09 の前提追加、LC-04〜08/17/18/21 の操作トリガー変更、
  `vi.mock('@cookpit/application')` への `SetItemCheckedUseCase` 追加、`checked` モックの追加）が
  実装計画・実装コードに反映されていること。
- 実装計画のテスト計画セクションと矛盾しないこと（矛盾があれば Orchestrator 経由で整合を取る）。
- MB-01〜04（実画面確認）は推奨・任意（完了条件のブロッカーにはしない）。
