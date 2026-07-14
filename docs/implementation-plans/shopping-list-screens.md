# 実装計画: shopping-list-screens

- 前提となる設計書: `docs/designs/shopping-list-screens.md`（confirmed・2026-07-13。S-1〜S-6 全件ユーザー確定・D-1〜D-7 確定）
- レベル: L2（Presentation 層のみ・既存 API/契約のみ使用。新規 API・契約・DB・Domain 変更なし）
- 実装ルート: Orchestrator 経路（implementer）
- 参照した先例実装計画: `docs/implementation-plans/meal-plan-screens.md`（章立て・粒度をこれに揃える）

## 対象外（本計画に含めない）

設計書の対象外をそのまま継承する。バックエンド / Domain / Application / Infrastructure /
API Contract（Zod）/ DB スキーマの変更、チェック解除（S-3）、PWA 書き込みキュー（S-5 の書き込み側）、
金額差表示（S-6 案 B/C）、recipes/products ヘッダーへのリンク追加は行わない。

## 実装順序に関する補足（設計書 §未決事項からの技術的な具体化）

設計書の申し送りは「`_utils` → 純粋表示コンポーネント（store-group / shopping-item-row）→
状態管理（shopping-list-client）→ 入力系（purchase-input-form / add-item-form）→ エントリ画面 →
meal-plan-client 追記 → sw.ts 追記」という**概念グループ順**を示している。実際のコンポーネント構成を
確認すると、`shopping-item-row.tsx` は展開時に `<PurchaseInputForm>` を直接レンダリングし
（設計書 §フロントエンド設計 shopping-item-row.tsx 節）、`shopping-list-client.tsx` は
`<StoreGroup>` 経由で同じく `<PurchaseInputForm>` を、フッターで `<AddItemForm>` を直接レンダリングする
（同 shopping-list-client.tsx 節）。つまり入力系フォームは純粋表示コンポーネント・状態管理コンポーネントの
**コンパイル時の被参照先**であり、概念グループの記載順どおりに実装すると型チェックが通らない段階が生じる。

本計画では、コンポーネント境界・Props・挙動は設計書の記載を一切変更せず、**構築順のみ**を
「下位コンポーネントから積み上げる」原則（meal-plan-screens 先例と同じ原則。設計書もこの原則への
準拠を明言している）に沿って次のとおり具体化する: `_utils` → 入力系フォーム（`purchase-input-form` /
`add-item-form`。他コンポーネントに依存しない末端）→ `shopping-item-row`（`purchase-input-form` を利用）→
`store-group`（`shopping-item-row` を利用）→ `shopping-list-client`（`store-group` / `add-item-form` を利用）→
詳細画面 → エントリ画面 → `meal-plan-client` 追記 → `sw.ts` 追記。設計判断（S-x/D-x）の変更ではないため
Orchestrator への差し戻し事項には含めない。

## 変更対象ファイル（既存編集）

| パス                                                                | なぜ変えるか                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `apps/web/src/app/meal-plans/_components/meal-plan-client.tsx`      | 買い物リストへの CTA ボタンを 1 個追加する（S-1）。既存の作成・追加・削除ロジックには触れない                      |
| `apps/web/src/app/meal-plans/_components/meal-plan-client.test.tsx` | 追加した CTA の表示条件・ラベル出し分け・遷移・エラー表示のテストケースを追記する（既存ケースは変更しない）        |
| `apps/web/src/app/sw.ts`                                            | `runtimeCaching` に 3 エントリを追記する（S-5 の読み取りキャッシュ部分）。既存の Google Fonts エントリは変更しない |

上記 3 ファイル以外の既存ファイル（`packages/*`・`apps/web/src/server/`・他の `apps/web/src/app/**`）は
一切変更しない。

## 新規作成ファイル

| パス                                                                              | 役割                                                                                                                                           |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/shopping-lists/_utils/shopping-list-view.ts`                    | `buildStoreNameMap` / `groupItemsByStore` / `formatShoppingDate`（表示用純関数）                                                               |
| `apps/web/src/app/shopping-lists/_utils/shopping-list-view.node.test.ts`          | 上記の単体テスト（vitest.node.config.mts の `*.node.test.ts` 規約に従う。`.test.ts` では node/dom どちらのプロジェクトにも拾われないため注意） |
| `apps/web/src/app/shopping-lists/_components/purchase-input-form.tsx`             | 購入実績入力のインライン展開フォーム（D-5）                                                                                                    |
| `apps/web/src/app/shopping-lists/_components/purchase-input-form.test.tsx`        | RTL テスト                                                                                                                                     |
| `apps/web/src/app/shopping-lists/_components/add-item-form.tsx`                   | 手動追加フォーム（展開パネル、recipe-picker 同型。D-5/D-6）                                                                                    |
| `apps/web/src/app/shopping-lists/_components/add-item-form.test.tsx`              | RTL テスト                                                                                                                                     |
| `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`               | item 1 行（チェック・表示・展開トグル・店舗変更。D-4）                                                                                         |
| `apps/web/src/app/shopping-lists/_components/shopping-item-row.test.tsx`          | RTL テスト                                                                                                                                     |
| `apps/web/src/app/shopping-lists/_components/store-group.tsx`                     | 店舗ごとのグループ（ヘッダー + item 一覧。D-2/S-6 案A）                                                                                        |
| `apps/web/src/app/shopping-lists/_components/store-group.test.tsx`                | RTL テスト                                                                                                                                     |
| `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`            | 詳細画面の状態管理・全体統括（Client。S-4/D-7）                                                                                                |
| `apps/web/src/app/shopping-lists/_components/shopping-list-client.test.tsx`       | RTL テスト（RPC / router / useOptimistic 経路のモック）                                                                                        |
| `apps/web/src/app/shopping-lists/[id]/page.tsx`                                   | 買い物リスト詳細の Server Component（手動 DI・並列取得・404 委譲。D-3）                                                                        |
| `apps/web/src/app/shopping-lists/_components/shopping-list-entry-client.tsx`      | エントリ画面のボタン・空状態（Client。S-1/S-2）                                                                                                |
| `apps/web/src/app/shopping-lists/_components/shopping-list-entry-client.test.tsx` | RTL テスト                                                                                                                                     |
| `apps/web/src/app/shopping-lists/page.tsx`                                        | エントリの Server Component（現在の MealPlan を副作用なく解決）                                                                                |

新規 16 ファイル（実装 8・テスト 8）+ 既存編集 3 ファイル = 計 19 ファイル。

---

## API レスポンス形状の確認（実装前提の明確化）

既存バックエンドの実装（`packages/application/src/shopping-list/*.use-case.ts`）を確認した結果、
書き込み系 3 API のレスポンスは **`ShoppingListDto` ではなく単一の `ShoppingItemDto`** である
（`AddItemUseCase` / `MarkAsBoughtUseCase` / `ReassignStoreUseCase` はいずれも
`toShoppingItemDto(...)` を返す。ルート層も `c.json(dto, ...)` でそのまま返却）。設計書
§データフローの「items state に updated で置換」は「配列内の該当 item 1 件を updated で置換する」意味であり
「レスポンス自体が配列」ではない。実装時の取り違えを避けるため各ステップの完了条件に明記する。

| API                                                       | レスポンス型              | クライアント側の state 反映                         |
| --------------------------------------------------------- | ------------------------- | --------------------------------------------------- |
| `POST /api/shopping-lists`                                | `ShoppingListDto`         | エントリ画面: `result.id` へ `router.push`          |
| `GET /api/shopping-lists/:id`                             | `ShoppingListDto`         | 詳細画面初期表示・refetch: `items` 配列を丸ごと置換 |
| `POST /api/shopping-lists/:id/items`                      | `ShoppingItemDto`（単一） | `items` 配列に 1 件 push                            |
| `POST /api/shopping-lists/:id/items/:itemId/bought`       | `ShoppingItemDto`（単一） | `items` 配列内の該当 id を置換                      |
| `POST /api/shopping-lists/:id/items/:itemId/target-store` | `ShoppingItemDto`（単一） | `items` 配列内の該当 id を置換                      |
| `GET /api/stores`                                         | `StoreDto[]`              | `stores` prop としてそのまま利用                    |

---

## ファイルごとの変更内容

### `apps/web/src/app/shopping-lists/_utils/shopping-list-view.ts`

- 変更内容:
  - `buildStoreNameMap(stores: StoreDto[]): Map<string, string>` — `store.id → store.name`。
  - `groupItemsByStore(items: ShoppingItemDto[], stores: StoreDto[]): Array<{ storeId: string | null; storeName: string; items: ShoppingItemDto[] }>`
    — `targetStoreId` でグルーピング。`storeId: null`（店舗未定）グループを常に先頭に固定する（D-2）。
    店舗未定以外のグループの並び順は `stores` 配列の順序（`GET /api/stores` の返却順）をそのまま使う。
    `items.length === 0` のグループは結果配列から除外する。`targetStoreId` が `stores` に存在しない値
    （データ不整合の防御）は末尾に「不明な店舗」グループとしてまとめる。
  - `formatShoppingDate(shoppingDate: string): string` — `"2026-07-11"` → `「7/11（土）の買い物リスト」`。
    `new Date(shoppingDate + 'T00:00:00')` でローカルタイム構築（`meal-plan-view.ts` の
    `formatWeekRange`/`formatDatePart` と同一のローカルタイム規約・曜日配列 `['日','月','火','水','木','金','土']`
    を踏襲。実装時は `formatDatePart` 相当のヘルパーをこのファイル内にローカル定義してよい
    — `meal-plan-view.ts` からは import しない。他機能から import しない先例（Unit 選択肢と同じ方針））。
- 完了条件: `pnpm --filter @cookpit/web test -- shopping-list-view` が green。最低限のケース:
  通常週の日付整形、店舗未定の先頭固定、複数店舗の集約、0 件店舗の除外、不明な店舗の防御的フォールバック
  （具体ケースは test-designer が確定するが、これらの観点はテストに含めること）。

### `apps/web/src/app/shopping-lists/_components/purchase-input-form.tsx`（D-5）

- 変更内容: `'use client'`。
  Props: `{ item: ShoppingItemDto; stores: StoreDto[]; submitting: boolean; onSubmit: (actualPrice: number, actualStoreId: string) => void; onCancel: () => void }`。
  - 価格入力: `Input type="number" min={0}`。ローカル state `priceInput: string`。初期値は
    `item.actualPrice !== null ? String(item.actualPrice.amount) : ''`（既存 bought item の再タップ時に
    プレフィルして訂正しやすくする。設計書「訂正はプレフィル」要件）。
  - 実購入店舗: `SelectField`。ローカル state `storeId: string`。初期値は
    `item.actualStoreId ?? item.targetStoreId ?? ''`。選択肢は `stores.map((s) => ({ value: s.id, label: s.name }))`。
  - 「購入を記録」ボタン: `storeId === '' || priceInput.trim() === '' || !Number.isFinite(Number(priceInput.trim())) || Number(priceInput.trim()) < 0 || submitting` で disable。
    クリックで `onSubmit(Number(priceInput.trim()), storeId)`。
  - 「キャンセル」ボタン: `onCancel()`。
  - **S-3 の制約表示（設計書 §S-3 で明記された必須要件）**: `item.status === 'bought'` のとき、
    フォーム内に説明文（例:「購入済みの品目です。金額・店舗は訂正できますが、未購入には戻せません。」）を
    `text-xs text-muted-foreground` で表示する。`pending`/`skipped` のときは表示しない。
- 完了条件: RTL テスト（`purchase-input-form.test.tsx`）が green。
  観点: 価格未入力/店舗未選択で disable、bought item の価格プレフィル、店舗初期値のフォールバック順
  （actualStoreId → targetStoreId → 空）、`onSubmit` の引数、`onCancel` 発火、bought 時の説明文表示。

### `apps/web/src/app/shopping-lists/_components/add-item-form.tsx`（D-5/D-6）

- 変更内容: `'use client'`。
  Props: `{ stores: StoreDto[]; submitting: boolean; onAdd: (input: { displayName: string; requiredAmount: { value: number; unit: Unit }; targetStoreId: string | null }) => void }`
  （`Unit` はこのファイル内でエイリアス型 `type ShoppingUnit = (typeof UNIT_OPTIONS)[number]` として
  Zod 推論型から導出し、`@cookpit/domain` を直接 import しない — `apps/web` から domain への直接 import は
  `WeekIdentifier` の 1 先例のみで、それに新しい先例を増やさないための方針）。
  - `UNIT_OPTIONS = unitSchema.options`（`@cookpit/api-contract` から `unitSchema` を import。
    この機能ローカルで定義し、`recipe-form-client.tsx` 等の他機能からは import しない先例に合わせる）。
  - `displayName`（`Input`。非空必須）、`requiredAmount.value`（`Input type="number" min={0}`）、
    `requiredAmount.unit`（`SelectField`。選択肢は `UNIT_OPTIONS`。文字列→Unit の narrowing は
    `product-form-fields.tsx` の `toProductUnit` と同型のローカルヘルパー
    `toShoppingUnit(value: string): ShoppingUnit { return UNIT_OPTIONS.find((o) => o === value) ?? UNIT_OPTIONS[0]; }`
    を用意する）。
  - `targetStoreId`（`SelectField`。「店舗未定」オプション（`value: ''`）+ `stores` 一覧。送信時 `'' → null` 変換）。
  - `productId` は UI に出さず常に `null`（D-6。呼び出し元の `onAdd` シグネチャにも含めない — 呼び出し元
    `shopping-list-client.tsx` が固定で `productId: null` を付与して POST する）。
  - 「追加」ボタン: `displayName.trim() === '' || !Number.isFinite(Number(value.trim())) || Number(value.trim()) < 0 || submitting` で disable。
    クリックで `onAdd(...)` 呼び出し後、`displayName` と `value` のみクリアする（`unit`・`targetStoreId` は
    直前の選択を維持 — 同じ店舗・単位で複数品目を連続追加する運用を想定。recipe-picker の
    「選択のみリセットしパネルは閉じない」先例に準拠する実装判断）。パネルの開閉状態はこのコンポーネントの
    外（`shopping-list-client.tsx` の `addFormOpen`）が持つため、ここでは閉じない。
- 完了条件: RTL テスト（`add-item-form.test.tsx`）が green。
  観点: 非空必須の disable 条件、単位選択肢の表示、店舗未定送信時の `null` 変換、`onAdd` の引数形状、
  追加後の入力欄クリア（unit/targetStoreId は保持）。

### `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`（D-4）

- 変更内容: `'use client'`。
  Props: `{ item: ShoppingItemDto; stores: StoreDto[]; expanded: boolean; submitting: boolean; onToggleExpand: (itemId: string) => void; onMarkAsBought: (itemId: string, actualPrice: number, actualStoreId: string) => void; onReassignStore: (itemId: string, targetStoreId: string) => void }`。
  - チェック UI: `<button type="button" role="checkbox" aria-checked={item.status === 'bought'} onClick={() => onToggleExpand(item.id)}>`（D-4。自作）。
    `item.status === 'bought'` でチェック済みスタイル。`'pending'`/`'skipped'` は未チェックスタイル
    （設計書の型網羅方針どおり `skipped` も分岐に含めるが、Unit A に到達操作がないため通常発生しない）。
  - 表示: `displayName` + (`item.requiredAmount !== null ? \`${item.requiredAmount.value}${item.requiredAmount.unit}\` : item.amountNote`)。
  - `item.status === 'bought'` のとき「✓ {actualStoreName} で ¥{actualPrice.amount} 購入」を併記
    （`actualStoreName = stores.find((s) => s.id === item.actualStoreId)?.name ?? '不明な店舗'`）。
  - 店舗バッジ: `targetStoreId` の店舗名（`stores.find`。`null` なら「店舗未定」）。タップでローカル state
    `storeEditing: boolean` を `true` にし `SelectField` へ切替。選択（`onValueChange`）で即座に
    `onReassignStore(item.id, value)` を呼び `storeEditing` を `false` に戻す（確定ボタンなし。選択即送信）。
  - `expanded === true` のとき行の下に
    `<PurchaseInputForm item={item} stores={stores} submitting={submitting} onSubmit={(actualPrice, actualStoreId) => onMarkAsBought(item.id, actualPrice, actualStoreId)} onCancel={() => onToggleExpand(item.id)} />`
    を表示する（再度 `onToggleExpand(item.id)` を呼ぶことで閉じる = トグル動作と一致）。
- 依存: `purchase-input-form.tsx`。
- 完了条件: RTL テスト（`shopping-item-row.test.tsx`）が green。
  観点: `role="checkbox"`/`aria-checked` の値、bought 時の実績併記、店舗バッジ→SelectField 切替と即時送信、
  展開時の `PurchaseInputForm` 表示と `onMarkAsBought`/`onToggleExpand` への配線。

### `apps/web/src/app/shopping-lists/_components/store-group.tsx`（D-2/S-6 案A）

- 変更内容:
  Props: `{ storeId: string | null; storeName: string; items: ShoppingItemDto[]; expandedItemId: string | null; submittingItemId: string | null; onToggleExpand: (itemId: string) => void; onMarkAsBought: (itemId: string, actualPrice: number, actualStoreId: string) => void; onReassignStore: (itemId: string, targetStoreId: string) => void; stores: StoreDto[] }`。
  - ヘッダー: `storeId === null ? '店舗未定' : storeName`。追加のバッジ・アイコンは付けない（S-6 案A）。
  - `items.map((item) => <ShoppingItemRow key={item.id} item={item} stores={stores} expanded={item.id === expandedItemId} submitting={item.id === submittingItemId} onToggleExpand={onToggleExpand} onMarkAsBought={onMarkAsBought} onReassignStore={onReassignStore} />)`。
- 依存: `shopping-item-row.tsx`。
- 完了条件: RTL テスト（`store-group.test.tsx`）が green。
  観点: `storeId === null` で「店舗未定」ヘッダー、`expandedItemId`/`submittingItemId` が対応する行だけに
  伝播すること。

### `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`（S-4/D-7・状態管理の中心）

- 変更内容: `'use client'`。Props: `{ shoppingList: ShoppingListDto; stores: StoreDto[] }`。
  - ローカル state:
    - `items: ShoppingItemDto[]`（`shoppingList.items` で初期化。書き込みレスポンスで部分更新する）
    - `errorMessage: string | null`
    - `expandedItemId: string | null`
    - `addFormOpen: boolean`
    - `submittingItemId: string | null`（`markAsBought`/`reassignStore` の対象 item のみ disable）
    - `addSubmitting: boolean`（`add-item-form` 用）
    - `refreshing: boolean`（手動更新ボタンの disable 用）
  - **S-4 楽観的更新（`markAsBought` のみに限定 — 設計書 S-4 が「対象はチェック操作を最優先」とし
    手動追加・店舗再割当への適用を実装フェーズの判断に委ねているため、本計画ではリスク最小化のため
    `markAsBought` のみに限定し、手動追加・店舗再割当は非楽観的（応答待ち→state 反映）とする）**:
    - `import { startTransition, useOptimistic, useState, useEffect } from 'react'`。
    - `const [optimisticItems, setOptimisticItems] = useOptimistic(items, (current, action: { itemId: string; patch: Partial<ShoppingItemDto> }) => current.map((item) => item.id === action.itemId ? { ...item, ...action.patch } : item))`。
    - 表示（`groupItemsByStore` への入力）は **`items` ではなく `optimisticItems`** を使う。
    - `handleMarkAsBought(itemId, actualPrice, actualStoreId)`:
      `startTransition(async () => { ... })` の中で、**最初の `await` より前に同期的に**
      `setOptimisticItems({ itemId, patch: { status: 'bought', actualPrice: { amount: actualPrice, currency: 'JPY' }, actualStoreId } })`
      を呼ぶ（React の制約: transition 内の最初の await 前に呼ばないと楽観表示が反映されない）。
      その後 `setSubmittingItemId(itemId)` → `POST /:id/items/:itemId/bought` →
      `!res.ok` なら `setErrorMessage('操作に失敗しました。')` して return（`items` 側は更新しないため、
      transition 完了後に `optimisticItems` は自動的に元の `items` へ戻る。手動でのロールバック処理は不要）→
      成功なら `const updated: ShoppingItemDto = await res.json()` → `setItems((current) => current.map((item) => item.id === updated.id ? updated : item))` →
      `setExpandedItemId(null)`。`catch` は `setErrorMessage('通信エラーが発生しました。')`。
      `finally` で `setSubmittingItemId(null)`。
  - `handleAddItem(input)`（非楽観的）: `setAddSubmitting(true)`; `setErrorMessage(null)`; try
    `POST /:id/items`（`json: { ...input, productId: null }`）; `!res.ok` → `setErrorMessage('操作に失敗しました。')`;
    成功 → `const created: ShoppingItemDto = await res.json()` → `setItems((current) => [...current, created])`;
    `catch` → `setErrorMessage('通信エラーが発生しました。')`; `finally` → `setAddSubmitting(false)`。
  - `handleReassignStore(itemId, targetStoreId)`（非楽観的）: `setSubmittingItemId(itemId)` →
    `POST /:id/items/:itemId/target-store` → 成功なら `setItems` で該当 item を置換、失敗/catch は
    `handleMarkAsBought` と同じ文言。`finally` で `setSubmittingItemId(null)`。
  - `handleRefetch({ silent }: { silent: boolean })`（D-7）: `setRefreshing(true)` →
    `GET /:id` → 成功なら `setItems(dto.items)`、失敗時は `silent === false` の場合のみ
    `setErrorMessage('操作に失敗しました。')`（`silent === true` の場合はエラー表示せず現状維持。
    設計書 §性能「背景で自動的に走る処理のため無視してよい」に対応）→ `catch` も同様の分岐 →
    `finally` で `setRefreshing(false)`。
  - `useEffect`: `window.addEventListener('focus', () => void handleRefetch({ silent: true }))`。
    アンマウント時に `removeEventListener`（D-7）。
  - 派生値: `storeNameMap = buildStoreNameMap(stores)`（ヘッダー等での店舗名解決に使用）、
    `groupedItems = groupItemsByStore(optimisticItems, stores)`。
  - ヘッダー: 「戻る」（`/meal-plans`）+ `formatShoppingDate(shoppingList.shoppingDate)` + 「更新」ボタン
    （`onClick={() => void handleRefetch({ silent: false })}`、`disabled={refreshing}`）。
  - 本文: `optimisticItems.length === 0` は「リストにアイテムがありません」。それ以外は
    `groupedItems.map((group) => <StoreGroup key={group.storeId ?? 'unassigned'} ... />)`。
  - フッター: `addFormOpen` が `false` のとき「手動で追加」ボタン、`true` のとき
    `<AddItemForm stores={stores} submitting={addSubmitting} onAdd={handleAddItem} />`（B-03: 0 件でも表示）。
- 依存: `store-group.tsx`、`add-item-form.tsx`、`_utils/shopping-list-view.ts`。
- 完了条件: RTL テスト（`shopping-list-client.test.tsx`）が green。
  観点: 初期グルーピング表示（店舗未定が先頭・D-2）、チェック→展開→送信成功で該当 item のみ更新かつ
  楽観表示が先行すること、送信失敗で楽観値が破棄されエラー表示されること、手動追加、店舗再割当（グループ
  移動を含む）、`focus` イベントでの silent refetch、手動更新ボタンでの refetch とその失敗時のエラー表示、
  0 件時でも追加フォームが使えること。

### `apps/web/src/app/shopping-lists/[id]/page.tsx`（D-3）

- 変更内容: Server Component。`export const dynamic = 'force-dynamic'`。Props:
  `{ params: Promise<{ id: string }> }`。
  `Promise.all([new GetShoppingListUseCase(new DrizzleShoppingListRepository(getDb())).execute({ shoppingListId: id }), new GetStoresUseCase(new DrizzleStoreRepository(getDb())).execute()])`
  を `try/catch` し、`ShoppingListNotFoundError` は `notFound()`（`products/[id]/page.tsx` と同型）、
  それ以外は `throw error`。`<ShoppingListClient shoppingList={dto} stores={stores} />` を返す。
- 依存: `shopping-list-client.tsx`。
- 完了条件: `pnpm --filter @cookpit/web type-check` 通過。Server Component のため RTL テストは追加しない
  （`products/[id]/page.tsx`/`meal-plans/page.tsx` 先例と同じ扱い）。

### `apps/web/src/app/shopping-lists/_components/shopping-list-entry-client.tsx`（S-1/S-2）

- 変更内容: `'use client'`。Props: `{ mealPlan: MealPlanDto | null }`。
  - ローカル state: `submitting: boolean`、`errorMessage: string | null`。
  - `mealPlan === null` → 「今週の献立がまだありません」+ `/meal-plans` へのリンク（E-01）。
  - `mealPlan !== null` → ボタン 1 個。ラベルは
    `mealPlan.status === 'draft' ? '買い物リストを作る' : '買い物リストを開く'`。
    押下で `client.api['shopping-lists'].$post({ json: { mealPlanId: mealPlan.id } })` →
    `!response.ok` → `setErrorMessage('操作に失敗しました。')` → 成功 →
    `const result: ShoppingListDto = await response.json()` → `router.push(\`/shopping-lists/${result.id}\`)`。
`catch`→`setErrorMessage('通信エラーが発生しました。')`。
  - ヘッダー: 「戻る」（`/meal-plans`）+ タイトル「買い物リスト」（`history/page.tsx` のヘッダー構成
    `grid-cols-[1fr_auto_1fr]` を踏襲）。
- 完了条件: RTL テスト（`shopping-list-entry-client.test.tsx`）が green。
  観点: `mealPlan === null` の空状態とリンク、`draft`/非 `draft` でのラベル出し分け、成功時の
  `router.push` 呼び出し引数、失敗時/通信エラー時のメッセージ出し分け。

### `apps/web/src/app/shopping-lists/page.tsx`（S-2）

- 変更内容: Server Component。`export const dynamic = 'force-dynamic'`。
  `new GetCurrentMealPlanUseCase(new DrizzleMealPlanRepository(getDb())).execute()` を副作用なく呼び出し
  `<ShoppingListEntryClient mealPlan={mealPlan} />` を返す。`try/catch` はしない
  （`meal-plans/page.tsx` 先例。DB 障害は Next.js のエラーバウンダリに委ねる）。
- 依存: `shopping-list-entry-client.tsx`。
- 完了条件: `pnpm --filter @cookpit/web type-check` 通過。`/shopping-lists` が SSR で表示される。

### `apps/web/src/app/meal-plans/_components/meal-plan-client.tsx`（S-1・追記）

- 変更内容: 既存の `submitting`/`errorMessage`/`pickerOpen` state・`handleCreate`/`handleAdd`/`handleRemove`
  には**一切触れない**。以下を独立に追加する:
  - 新規 state: `shoppingListSubmitting: boolean`、`shoppingListErrorMessage: string | null`
    （既存 `submitting`/`errorMessage` とは分離し、既存フローと相互に影響しないようにする。設計書
    「既存の作成・追加・削除フローとは独立した追加処理として実装する」に対応）。
  - 新規関数 `handleShoppingList()`: `client.api['shopping-lists'].$post({ json: { mealPlanId: mealPlan.id } })` →
    `!response.ok` → `setShoppingListErrorMessage('操作に失敗しました。')` → 成功 →
    `const result: ShoppingListDto = await response.json()` → `router.push(\`/shopping-lists/${result.id}\`)`。
`catch`→`setShoppingListErrorMessage('通信エラーが発生しました。')`。`finally`で`setShoppingListSubmitting(false)`（開始時に `true`）。`mealPlan === null` のときは呼び出せない
    （ボタン自体を非表示にするため到達しない）。
  - JSX: `mealPlan !== null` ブロック内、`formatWeekRange(...)` を表示する `<p>` の直後・
    `<section aria-label="献立">` の手前に CTA ボタンを追加する（設計書「週表示の直後、
    plannedRecipes セクションより上」）。ラベルは
    `mealPlan.status === 'draft' ? '買い物リストを作る' : '買い物リストを開く'`。
    `disabled={shoppingListSubmitting}`。`shoppingListErrorMessage !== null` のとき CTA 直下に
    既存エラー表示と同じスタイル（`rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700`）で
    表示する。
  - テスト用モック拡張（`meal-plan-client.test.tsx`）: `vi.mock('@/lib/api-client', ...)` に
    `'shopping-lists': { $post: (...args) => postShoppingList(...args) }` を追加する
    （`useRouter` の `push` は既存モックにすでに含まれているため追加不要）。
- 完了条件: 既存の `meal-plan-client.test.tsx` の全ケースが green のまま、CTA の表示条件・ラベル出し分け・
  成功時 `router.push`・失敗時/通信エラー時のメッセージ表示のテストケースが追加され green。

### `apps/web/src/app/sw.ts`（S-5・追記）

- 変更内容: `import { CacheFirst, ExpirationPlugin, NetworkFirst, Serwist, StaleWhileRevalidate } from 'serwist';`
  へ import を拡張し、`runtimeCaching` 配列に既存の Google Fonts エントリはそのまま残したうえで
  3 エントリを追加する。各 `matcher` は `request.method === 'GET'` を明示する関数形式にする
  （設計書 §PWA設計「設計上の注意点」）。
  1. `GET /api/shopping-lists/:id`:
     `matcher: ({ url, request }) => request.method === 'GET' && /^\/api\/shopping-lists\/[^/]+$/.test(url.pathname)`、
     `handler: new NetworkFirst({ cacheName: 'shopping-list-detail-cache', networkTimeoutSeconds: 3, plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 })] })`。
  2. `GET /api/stores`:
     `matcher: ({ url, request }) => request.method === 'GET' && url.pathname === '/api/stores'`、
     `handler: new StaleWhileRevalidate({ cacheName: 'stores-cache', plugins: [new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 7 })] })`。
  3. `/shopping-lists` 配下の GET（ページ本体・RSC ペイロード）:
     `matcher: ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/shopping-lists')`、
     `handler: new NetworkFirst({ cacheName: 'shopping-lists-pages-cache', networkTimeoutSeconds: 3, plugins: [new ExpirationPlugin({ maxEntries: 15, maxAgeSeconds: 60 * 60 * 24 })] })`。

  （`cacheName`・`maxEntries`・`maxAgeSeconds`・戦略は設計書 §PWA設計の表と完全一致させる。実装時の
  自由度は `cacheName` の命名のみ。）

- 完了条件: `pnpm --filter @cookpit/web type-check` 通過。**Vitest では検証不可**（本番ビルド限定機能）。
  手動確認: `pnpm --filter @cookpit/web build && pnpm --filter @cookpit/web start` を実行し、Chrome
  DevTools Application タブで `/shopping-lists/[id]` を一度オンラインで開いたのちオフラインに切り替え、
  再訪問でキャッシュされた内容が表示されること（O-01）、`/api/stores` がオフラインでも直近値を返すこと、
  書き込み系 POST（bought 等）がキャッシュ対象になっていないこと（Network タブで確認）を確認する
  （R-3 対応。§テスト方針）。

---

## 実装手順

1. **表示ユーティリティ** — `_utils/shopping-list-view.ts` + `.node.test.ts` / 3 関数（`buildStoreNameMap`/
   `groupItemsByStore`/`formatShoppingDate`）/ 単体テスト green
2. **購入実績入力フォーム** — `_components/purchase-input-form.tsx` + `.test.tsx` / D-5 展開フォーム・
   S-3 の bought 時説明文 / RTL green
3. **手動追加フォーム** — `_components/add-item-form.tsx` + `.test.tsx` / D-5/D-6 展開フォーム / RTL green
4. **item 行コンポーネント** — `_components/shopping-item-row.tsx` + `.test.tsx` / D-4 チェック UI・
   店舗バッジ即時送信・`PurchaseInputForm` 統合 / RTL green（Step 2 完了後）
5. **店舗グループコンポーネント** — `_components/store-group.tsx` + `.test.tsx` / D-2 ヘッダー・
   `ShoppingItemRow` 統合 / RTL green（Step 4 完了後）
6. **詳細画面の状態管理クライアント** — `_components/shopping-list-client.tsx` + `.test.tsx` / S-4
   `useOptimistic`（markAsBought 限定）・D-7 focus refetch・手動追加/店舗再割当の非楽観的更新の RPC 結線 /
   RTL green（Step 3・5・1 完了後）
7. **詳細画面 Server Component** — `[id]/page.tsx` / D-3 `notFound()` 委譲・`Promise.all` 並列取得 /
   type-check 通過（Step 6 完了後）
8. **エントリ画面クライアント** — `_components/shopping-list-entry-client.tsx` + `.test.tsx` / S-1/S-2
   ラベル出し分け・冪等 POST・`router.push` / RTL green（Step 1〜7 と独立して着手可）
9. **エントリ画面 Server Component** — `page.tsx` / `GetCurrentMealPlanUseCase` 直呼び / type-check 通過
   （Step 8 完了後）
10. **献立画面への導線追加** — `meal-plans/_components/meal-plan-client.tsx` + `.test.tsx` 追記 / S-1 CTA
    ボタン・独立 state / 既存テスト回帰なし・追加テスト green（Step 8 と同時期でも着手可。API 呼び出し形は
    Step 8 と共通のため Step 8 完了後が望ましい）
11. **PWA runtimeCaching 追記** — `sw.ts` / S-5 の 3 エントリ / type-check 通過 + 手動確認
    （他ステップと独立して着手可。設計書「別ステップとして分離してよい」）
12. **品質ゲート + 実画面確認** — `pnpm lint` / `pnpm type-check` / `pnpm test` 全 green。
    `pnpm --filter @cookpit/web build && pnpm --filter @cookpit/web start` での PWA 手動確認。
    manual-browser-verify（トークン適用・レスポンシブ・導線・冪等 POST の連打・useOptimistic のロール
    バック挙動・focus refetch）。Codex 委譲ではなく Orchestrator 経路のため review-codex-implementation は
    不要（実装ルートが implementer のため）。

## 依存関係

- Step 1 → Step 6（`groupItemsByStore`/`buildStoreNameMap`/`formatShoppingDate` を使用）
- Step 2 → Step 4（`ShoppingItemRow` が `PurchaseInputForm` をレンダリング）
- Step 4 → Step 5（`StoreGroup` が `ShoppingItemRow` をレンダリング）
- Step 3・5・1 → Step 6（`ShoppingListClient` が `AddItemForm`・`StoreGroup`・utils を使用）
- Step 6 → Step 7（`[id]/page.tsx` が `ShoppingListClient` を使用）
- Step 8 → Step 9（`page.tsx` が `ShoppingListEntryClient` を使用）
- Step 8 → Step 10（同じ POST 呼び出し形・エラー文言パターンを踏襲するため。厳密な技術依存ではないが
  手戻り防止のため推奨順）
- Step 11 は他の全ステップと独立
- Step 12 は全ステップ完了後
- パッケージ間依存: なし（`apps/web` 内で完結。`@cookpit/application`/`@cookpit/infrastructure`/
  `@cookpit/api-contract`/`@cookpit/domain`（`WeekIdentifier` 相当の深いパス import は本ユニットでは
  不要）への import は既存 workspace 依存の範囲）

## テスト計画

詳細は `docs/tests/shopping-list-screens.md`（test-designer が並行作成）。配置は既存規約どおり
co-located。**注意**: `_utils/shopping-list-view.ts` のテストは JSX を含まない純粋関数のため
`shopping-list-view.node.test.ts`（`vitest.node.config.mts` の include 対象）として作成する。
`.test.ts`（拡張子のみ）は node/dom いずれのプロジェクトにも含まれず実行されないため使用しないこと。

| 対象                             | ファイル                                                          | 種別 | モック                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `shopping-list-view.ts`          | `_utils/shopping-list-view.node.test.ts`                          | 単体 | なし                                                                                                                                |
| `purchase-input-form.tsx`        | `_components/purchase-input-form.test.tsx`                        | RTL  | なし（props のみ）                                                                                                                  |
| `add-item-form.tsx`              | `_components/add-item-form.test.tsx`                              | RTL  | なし（props のみ）                                                                                                                  |
| `shopping-item-row.tsx`          | `_components/shopping-item-row.test.tsx`                          | RTL  | なし（props のみ）                                                                                                                  |
| `store-group.tsx`                | `_components/store-group.test.tsx`                                | RTL  | なし（props のみ）                                                                                                                  |
| `shopping-list-client.tsx`       | `_components/shopping-list-client.test.tsx`                       | RTL  | `vi.mock('@/lib/api-client')`（`client.api['shopping-lists']` 系）。`useOptimistic`/`startTransition` は React 標準のためモック不要 |
| `shopping-list-entry-client.tsx` | `_components/shopping-list-entry-client.test.tsx`                 | RTL  | `vi.mock('next/navigation')`（`useRouter` → `{ push: vi.fn() }`）、`vi.mock('@/lib/api-client')`                                    |
| `meal-plan-client.tsx`（追記分） | `meal-plan-client.test.tsx`（既存拡張）                           | RTL  | 既存モックに `'shopping-lists': { $post }` を追加                                                                                   |
| `[id]/page.tsx` / `page.tsx`     | なし（Server Component。type-check のみ）                         | -    | -                                                                                                                                   |
| `sw.ts`                          | なし（Vitest では検証不可）                                       | 手動 | `pnpm build && pnpm start` + Chrome DevTools                                                                                        |
| API ルート                       | 追加なし（既存 `shopping-lists.test.ts`/`stores.test.ts` で担保） | -    | -                                                                                                                                   |

## 品質ゲート・実行タイミング

- 各ステップ完了時: `pnpm --filter @cookpit/web type-check` と該当テストファイルの `pnpm --filter @cookpit/web test -- <ファイル名>` を都度実行する（早期にコンパイルエラー・テスト失敗を検出する）。
- 全ステップ完了後（Step 12）:
  - `pnpm lint`
  - `pnpm type-check`
  - `pnpm test`（Vitest。apps/web 全体の回帰確認を含む）
  - `pnpm --filter @cookpit/web build`（本番ビルド。PWA `runtimeCaching` の有効化確認を兼ねる）
  - 必要に応じ `pnpm format`
  - manual-browser-verify（実画面確認。§実装手順 Step 12 参照）

---

## リスク（設計書 R-1〜R-6 の実装上の扱い）

| #   | リスク                                                            | 実装計画での扱い                                                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-1 | S-1〜S-6 未確定のまま着手すると手戻り                             | **解消済み**（2026-07-13 全件ユーザー確定）。本計画はその確定結果のみに基づく。                                                                                                                                                      |
| R-2 | `useOptimistic` 初使用でパターン未確立                            | Step 6 の記述で具体的な呼び出し順序（transition 内の最初の await 前に setter を呼ぶ）を明記。対象を `markAsBought` のみに限定（設計書 S-4 の推奨に準拠する本計画の判断）。RTL テストで送信失敗時の楽観値ロールバックを必ず検証する。 |
| R-3 | PWA `runtimeCaching` は本番ビルドのみ有効                         | Step 11/12 に `pnpm build && pnpm start` での手動確認を明記。Vitest でのカバレッジ主張はしない。                                                                                                                                     |
| R-4 | 店舗未定グループ先頭固定（D-2）が実動線と合わない可能性           | 設計者裁量のため実装はそのまま踏襲。RTL テストで「先頭固定」を確認するのみで、UX 調整は本ユニット外。                                                                                                                                |
| R-5 | S-3（チェック解除なし）で誤タップの完全な取り消しができない       | Step 2（`purchase-input-form.tsx`）に bought 時の説明文表示を明記済み。文言の最終確認は reviewer/実画面確認で行う。                                                                                                                  |
| R-6 | S-6 ベースライン（バッジのみ）は roadmap の金額差例示を満たさない | 実装上の対応なし（意図的な設計判断）。ドキュメント更新で roadmap との差分を明示する（下記「ドキュメント更新対象」参照）。                                                                                                            |

追加のリスク（本計画で識別）:

| #   | リスク                                                                                                              | 検出タイミング                             | 回避策                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| R-7 | 書き込み系 3 API のレスポンスが `ShoppingItemDto`（単一）である点を見落とし、誤って配列で扱うと型エラーになる       | Step 4/6 の type-check                     | 本計画冒頭「API レスポンス形状の確認」表のとおり実装する。型エラーで即座に検出できるため実害は小さい           |
| R-8 | `Unit`（`unitSchema.options` 由来のリテラル型）の narrowing を怠ると `SelectField` の `string` から代入エラーになる | Step 3（`add-item-form.tsx`）の type-check | `product-form-fields.tsx` の `toProductUnit` と同型の `toShoppingUnit` ヘルパーを用意する（Step 3 に明記済み） |

## ロールバック方法

- 新規ファイルは `apps/web/src/app/shopping-lists/` ディレクトリごと削除すれば完全に戻る（他所から
  参照されない。エントリ画面・詳細画面ともにこのディレクトリ配下で完結）。
- `meal-plan-client.tsx`/`meal-plan-client.test.tsx` は CTA 追加分の hunk のみを revert すればよい
  （既存 state・関数名を変更していないため差分は独立している）。
- `sw.ts` は追加した 3 エントリと拡張した import 文の hunk のみを revert すればよい（既存の
  Google Fonts エントリには触れていない）。
- DB・API・契約の変更がないため、データやスキーマのロールバックは不要。

## ドキュメント更新対象

- `docs/05-roadmap.md` — Sprint 4 Unit B の状態を完了時に更新。roadmap の「A店の方が◯円安い」という
  金額差の例示表現に対し、本ユニットが S-6 案A（推奨店舗バッジのみ）で完了する旨を注記する（R-6 対応）。
- `docs/designs/shopping-list-screens.md` — 実装完了時にステータスを「実装済み」へ更新。
- `docs/04-domain-model.md` — **対象外**（ドメインモデル変更なし。既存 ShoppingList 集約の定義を
  変更しないことを整合確認のみ行う）。
- `logs/YYYY-MM-DD.md` — セッションログ（close-session で記録）。

## Orchestrator へ差し戻す事項

**なし。** 確定設計書（S-1〜S-6/D-1〜D-7 すべて確定済み）の範囲内で実装計画を完結できた。

参考までに、本計画作成にあたり設計書に明記のない実装詳細を implementation-planner の裁量で補った箇所
（S-x/D-x の変更ではなく、既存の類似実装パターンに揃えた技術的な具体化）を以下に記録する。実装時に
異なる判断が必要と分かった場合も、これらは差し戻し対象ではなく通常のレビュー指摘として扱ってよい。

- コンポーネントの構築順序（§実装順序に関する補足）。
- `useOptimistic` の適用範囲を `markAsBought` のみに限定（手動追加・店舗再割当は非楽観的）。
- 手動更新ボタン失敗時のエラー文言は既存の「操作に失敗しました。」を再利用し、新規文言は作らない。
- `add-item-form.tsx` の送信後クリア範囲（`displayName`/`value` のみ。`unit`/`targetStoreId` は保持）。
- S-3 の制約文言の表示場所を `purchase-input-form.tsx` 内の bought 時説明文とした。
