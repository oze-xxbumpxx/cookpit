# 実装計画: shopping-list-item-check

- 前提となる設計書: `docs/designs/shopping-list-item-check.md`（ステータス: 確定, 2026-07-24）
- 関連 ADR: `docs/decisions/ADR-0009-shopping-list-item-check-uncheck.md`
- レベル: L2
- 実装ルート: Orchestrator（implementer）
- 判断理由: Domain → Application → api-contract → Hono → Presentation の縦スライス変更に加え、
  既存 Presentation 層テスト（`shopping-item-row.test.tsx` / `shopping-list-client.test.tsx`）の
  複数箇所を仕様変更に合わせて書き換える必要があり、Codex 委譲より Orchestrator 主導で層間の
  整合性を都度確認しながら進める方が安全なため（docs/06-ai-tools.md 実装ルートの使い分け）。

## 前提条件（着手前に確認）

- `docs/designs/shopping-list-item-check.md` のステータスが「確定」であること（確認済み）。
- `docs/decisions/ADR-0009-shopping-list-item-check-uncheck.md` が Accepted であること（確認済み）。
- DB マイグレーションは不要（設計書 §DB 設計で確認済み。`shopping_items.actual_price_amount` /
  `actual_store_id` は既に nullable）。**本計画に Infrastructure スキーマ変更・マイグレーション
  ステップは含まれない。**

---

## 変更対象ファイル一覧

### 既存ファイル変更（20 ファイル）

| #    | ファイルパス                                                                | 変更内容                                                                                         |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| E-1  | `packages/domain/src/shopping-list/shopping-list.ts`                        | `ShoppingItem.check()`/`uncheck()`、`ShoppingList.check()`/`uncheck()` 追加                      |
| E-2  | `packages/domain/src/shopping-list/shopping-list.test.ts`                   | 上記メソッドの単体テスト追加                                                                     |
| E-3  | `packages/application/src/shopping-list/shopping-list.dto.ts`               | `SetItemCheckedInputDto` 追加                                                                    |
| E-4  | `packages/application/src/shopping-list/index.ts`                           | 新規 UseCase の re-export 追加                                                                   |
| E-5  | `packages/application/src/shopping-list/shopping-list-use-cases.test.ts`    | `describe('SetItemCheckedUseCase')` 追加                                                         |
| E-6  | `packages/application/src/shopping-list/complete-shopping.use-case.test.ts` | `actualPrice === null` の it.each ケース追加（R-4 回帰防止）                                     |
| E-7  | `packages/api-contract/src/shopping-list.schema.ts`                         | `setItemCheckedSchema` / `SetItemCheckedBody` 追加                                               |
| E-8  | `packages/api-contract/src/shopping-list.schema.test.ts`                    | `describe('setItemCheckedSchema')` 追加                                                          |
| E-9  | `apps/web/src/server/routes/shopping-lists.ts`                              | `POST /:id/items/:itemId/checked` ルート追加                                                     |
| E-10 | `apps/web/src/server/routes/shopping-lists.test.ts`                         | 新規ルートの 200/400/404/422/冪等性テスト追加                                                    |
| E-11 | `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`         | タップ挙動変更・aria-label 変更・「金額を記録」ボタン追加・表示条件変更                          |
| E-12 | `apps/web/src/app/shopping-lists/_components/shopping-item-row.test.tsx`    | IR-06/09/10/12 修正・新規ケース追加                                                              |
| E-13 | `apps/web/src/app/shopping-lists/_components/purchase-input-form.tsx`       | 注記文言の修正                                                                                   |
| E-14 | `apps/web/src/app/shopping-lists/_components/purchase-input-form.test.tsx`  | 文言変更後のアサーション更新                                                                     |
| E-15 | `apps/web/src/app/shopping-lists/_components/store-group.tsx`               | `onSetChecked` プロップの中継追加                                                                |
| E-16 | `apps/web/src/app/shopping-lists/_components/store-group.test.tsx`          | `renderStoreGroup` の defaults に `onSetChecked` 追加                                            |
| E-17 | `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`      | `handleSetChecked` 追加・`StoreGroup` へ配線                                                     |
| E-18 | `apps/web/src/app/shopping-lists/_components/shopping-list-client.test.tsx` | `checked.$post` モック追加、LC-04 の置き換え、LC-05/06/07/08/17/18/21 の書き換え、新規テスト追加 |
| E-19 | `docs/designs/shopping-list-screens.md`                                     | S-3 supersede 注記 + 4 箇所の更新                                                                |
| E-20 | `docs/04-domain-model.md`                                                   | ShoppingList 集約セクションに実装追記ブロック追加                                                |

### 新規作成ファイル（1 ファイル）

| #   | ファイルパス                                                          | 内容                    |
| --- | --------------------------------------------------------------------- | ----------------------- |
| N-1 | `packages/application/src/shopping-list/set-item-checked.use-case.ts` | `SetItemCheckedUseCase` |

Infrastructure 層（`packages/infrastructure/src/db/schema.ts` /
`packages/infrastructure/src/repositories/drizzle-shopping-list.repository.ts`）は**変更なし**
（設計書 §DB 設計で確認済み。Step 10 で無変更であることの確認のみ行う）。

---

## 実装手順

層の順序（Domain → Application → api-contract → Infrastructure(変更なし) → Hono →
Presentation → ドキュメント更新）に沿って進める。

### Step 1: Domain — `ShoppingItem` / `ShoppingList` にチェック操作を追加

**対象ファイル**: `packages/domain/src/shopping-list/shopping-list.ts`

`ShoppingItem` クラスに `markAsSkipped()` の後・`reassignStore()` の前へ以下を挿入する。

```typescript
  /**
   * 価格・店舗を記録せずに購入済み（チェック済み）にする軽量操作。現状態を問わず 'bought' へ
   * 遷移する（markAsBought と同様、S-11 の「最新状態で上書き」思想を踏襲）。actualPrice /
   * actualStore には触れない。
   */
  check(): void {
    this.itemStatus = 'bought';
  }

  /**
   * チェックを外し 'pending' に戻す。actualPrice / actualStore も同時に null へ戻す
   * （チェックを外した後に再チェックしたとき、無関係になった古い価格が黙って買い物完了時の
   * 価格記録に使われてしまう事故を防ぐため）。
   * @throws Error status が 'bought' 以外の場合
   */
  uncheck(): void {
    if (this.itemStatus !== 'bought') {
      throw new Error(`Cannot uncheck a ShoppingItem with status '${this.itemStatus}'`);
    }
    this.itemStatus = 'pending';
    this.itemActualPrice = null;
    this.itemActualStore = null;
  }
```

`ShoppingList` クラスに `markAsSkipped(itemId)` の後・`complete()` の前へ以下を挿入する。

```typescript
  /** @throws Error active でない、または itemId の品目が存在しない場合 */
  check(itemId: ShoppingItemId): void {
    this.assertActive('check');
    this.findItem(itemId).check();
  }

  /** @throws Error active でない、itemId の品目が存在しない、または品目が bought 以外の場合 */
  uncheck(itemId: ShoppingItemId): void {
    this.assertActive('uncheck');
    this.findItem(itemId).uncheck();
  }
```

既存の `markAsBought` / `markAsSkipped` / `reassignStore` / `complete` / `reopen` は変更しない。

**完了条件**:

- `ShoppingItem.check()` / `uncheck()`、`ShoppingList.check()` / `uncheck()` が上記シグネチャで追加されている。
- 既存メソッド（`markAsBought` 等）が 1 行も変更されていない。
- `pnpm --filter @cookpit/domain type-check` がエラーなし。

---

### Step 2: Domain テスト追加

**対象ファイル**: `packages/domain/src/shopping-list/shopping-list.test.ts`

`describe('ShoppingItem', ...)` ブロックの末尾（`isBought は pending で false を返す` の後）に追加する。

```typescript
it('check は pending から bought にし、actualPrice/actualStore に触れない', () => {
  const item = createItem();

  item.check();

  expect(item.status).toBe('bought');
  expect(item.actualPrice).toBeNull();
  expect(item.actualStore).toBeNull();
});

it('uncheck は bought から pending に戻し actualPrice/actualStore を null にクリアする', () => {
  const item = createItem();
  item.markAsBought(Money.of(198, 'JPY'), StoreId.fromString('store-1'));

  item.uncheck();

  expect(item.status).toBe('pending');
  expect(item.actualPrice).toBeNull();
  expect(item.actualStore).toBeNull();
});

it('uncheck は pending からの呼び出しを拒否する', () => {
  const item = createItem();

  expect(() => item.uncheck()).toThrow("Cannot uncheck a ShoppingItem with status 'pending'");
});

it('uncheck は skipped からの呼び出しを拒否する', () => {
  const item = createItem();
  item.markAsSkipped();

  expect(() => item.uncheck()).toThrow("Cannot uncheck a ShoppingItem with status 'skipped'");
});
```

`describe('ShoppingList', ...)` ブロックの末尾（`createdAt getter は Date の防御的コピーを返す` の後）に追加する。

```typescript
it('check は active 状態で対象 item を bought にする', () => {
  const item = createItem();
  const list = createList([item]);

  list.check(item.id);

  expect(list.items[0]?.status).toBe('bought');
});

it('check は completed 状態で拒否する', () => {
  const item = createItem();
  const list = reconstructCompletedList([item]);

  expect(() => list.check(item.id)).toThrow("Cannot check a ShoppingList with status 'completed'");
});

it('check は存在しない itemId を拒否する', () => {
  const list = createList();

  expect(() => list.check(ShoppingItemId.fromString('missing'))).toThrow('ShoppingItem not found');
});

it('uncheck は active 状態で対象 item を pending に戻す', () => {
  const item = createItem();
  item.markAsBought(Money.of(198, 'JPY'), StoreId.fromString('store-1'));
  const list = createList([item]);

  list.uncheck(item.id);

  expect(list.items[0]?.status).toBe('pending');
  expect(list.items[0]?.actualPrice).toBeNull();
});

it('uncheck は completed 状態で拒否する', () => {
  const item = createItem();
  item.markAsBought(Money.of(198, 'JPY'), StoreId.fromString('store-1'));
  const list = reconstructCompletedList([item]);

  expect(() => list.uncheck(item.id)).toThrow(
    "Cannot uncheck a ShoppingList with status 'completed'",
  );
});

it('uncheck は存在しない itemId を拒否する', () => {
  const list = createList();

  expect(() => list.uncheck(ShoppingItemId.fromString('missing'))).toThrow(
    'ShoppingItem not found',
  );
});
```

**完了条件**:

- 上記 10 ケースが `vitest`（`packages/domain`）で通る。
- 既存の `ShoppingItem` / `ShoppingList` テストが変更されずに通る。

---

### Step 3: Application — `SetItemCheckedInputDto` 追加

**対象ファイル**: `packages/application/src/shopping-list/shopping-list.dto.ts`

`MarkAsBoughtInputDto` の直後に追加する。

```typescript
export interface SetItemCheckedInputDto {
  shoppingListId: string;
  itemId: string;
  checked: boolean;
}
```

**完了条件**: `SetItemCheckedInputDto` が `{ shoppingListId: string; itemId: string; checked: boolean }` で定義されている。

---

### Step 4: Application — `SetItemCheckedUseCase` 新規作成

**対象ファイル（新規）**: `packages/application/src/shopping-list/set-item-checked.use-case.ts`

```typescript
import { ShoppingItemId } from '@cookpit/domain/src/shopping-list/shopping-item-id';
import { ShoppingListId } from '@cookpit/domain/src/shopping-list/shopping-list-id';
import type { ShoppingListRepository } from '@cookpit/domain/src/shopping-list/shopping-list.repository';
import { InvalidShoppingListStateError } from './invalid-shopping-list-state.error';
import type { SetItemCheckedInputDto, ShoppingItemDto } from './shopping-list.dto';
import { toShoppingItemDto } from './shopping-list.mapper';
import { ShoppingItemNotFoundError } from './shopping-item-not-found.error';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

/**
 * 品目のチェック状態（購入予定に印を付ける／外す）を明示的にセットする。価格・店舗の記録は
 * 行わない（`MarkAsBoughtUseCase` が別途担当）。
 *
 * 冪等: input.checked が現在の状態と既に一致する場合は Domain のメソッド呼び出し自体を
 * スキップする（`uncheck()` は status !== 'bought' で例外を投げるため、2人が同時に操作しても
 * 例外にならないようにするための Application 層のガード。D-7 の「2人利用」を踏まえた設計）。
 *
 * @throws ShoppingListNotFoundError リストが存在しない
 * @throws InvalidShoppingListStateError リストが completed
 * @throws ShoppingItemNotFoundError itemId の品目が存在しない
 */
export class SetItemCheckedUseCase {
  constructor(private readonly shoppingListRepository: ShoppingListRepository) {}

  async execute(input: SetItemCheckedInputDto): Promise<ShoppingItemDto> {
    const shoppingList = await this.shoppingListRepository.findById(
      ShoppingListId.fromString(input.shoppingListId),
    );
    if (shoppingList === null) {
      throw new ShoppingListNotFoundError(input.shoppingListId);
    }
    if (shoppingList.status !== 'active') {
      throw new InvalidShoppingListStateError(shoppingList.status, 'setItemChecked');
    }

    const itemId = ShoppingItemId.fromString(input.itemId);
    const item = shoppingList.items.find((candidate) => candidate.id.equals(itemId));
    if (item === undefined) {
      throw new ShoppingItemNotFoundError(input.itemId);
    }

    const alreadyChecked = item.status === 'bought';
    if (input.checked && !alreadyChecked) {
      shoppingList.check(itemId);
    } else if (!input.checked && alreadyChecked) {
      shoppingList.uncheck(itemId);
    }

    await this.shoppingListRepository.save(shoppingList);
    const updated = shoppingList.items.find((candidate) => candidate.id.equals(itemId));
    if (updated === undefined) {
      throw new Error('Updated ShoppingItem not found');
    }
    return toShoppingItemDto(updated);
  }
}
```

注意点:

- `MarkAsBoughtUseCase` / `ReassignStoreUseCase` と同じ構造（findById → status ガード →
  item 存在確認 → 更新 → save → 再取得して DTO 化）を踏襲する。
- `save()` は冪等ガードで no-op になった場合も無条件に呼ぶ（設計どおり。副作用は Upsert のため無害）。

**完了条件**:

- `SetItemCheckedUseCase.execute()` が上記シグネチャ・エラー送出条件で実装されている。
- `pnpm --filter @cookpit/application type-check` がエラーなし（Step 3 完了が前提）。

---

### Step 5: Application — `index.ts` エクスポート追加

**対象ファイル**: `packages/application/src/shopping-list/index.ts`

`mark-as-bought.use-case` の直後に追加する。

```typescript
export * from './generate-shopping-list.use-case';
export * from './add-item.use-case';
export * from './mark-as-bought.use-case';
export * from './set-item-checked.use-case';
export * from './reassign-store.use-case';
export * from './reopen-shopping-list.use-case';
export * from './get-shopping-list.use-case';
export * from './shopping-list.dto';
export * from './shopping-list.mapper';
export * from './shopping-list-not-found.error';
export * from './shopping-item-not-found.error';
export * from './invalid-shopping-list-state.error';
export * from './complete-shopping.use-case';
export * from './sync-shopping-list-from-meal-plan.use-case';
```

**完了条件**: `export * from './set-item-checked.use-case';` が追記され、既存の 13 行が変更されていない。

---

### Step 6: Application テスト — `SetItemCheckedUseCase`

**対象ファイル**: `packages/application/src/shopping-list/shopping-list-use-cases.test.ts`

先頭の import 群に追加する（`ReassignStoreUseCase` の import の直後）。

```typescript
import { SetItemCheckedUseCase } from './set-item-checked.use-case';
```

`describe('MarkAsBoughtUseCase', ...)` ブロックの直後・`describe('ReassignStoreUseCase', ...)` の直前に新規ブロックを追加する。

```typescript
describe('SetItemCheckedUseCase', () => {
  const input = { shoppingListId: SHOPPING_LIST_ID, itemId: SHOPPING_ITEM_ID, checked: true };

  it('pending の品目に checked: true を送ると bought になる', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem({ status: 'pending' })]));

    const dto = await new SetItemCheckedUseCase(shoppingListRepository).execute(input);

    expect(dto.status).toBe('bought');
    expect(dto.actualPrice).toBeNull();
    expect(dto.actualStoreId).toBeNull();
  });

  it('bought の品目に checked: false を送ると pending になり実績が null にクリアされる', async () => {
    shoppingListRepository.seed(
      seededShoppingList('active', [
        seededItem({
          status: 'bought',
          actualPrice: Money.of(198, 'JPY'),
          actualStoreId: 'store-1',
        }),
      ]),
    );

    const dto = await new SetItemCheckedUseCase(shoppingListRepository).execute({
      ...input,
      checked: false,
    });

    expect(dto.status).toBe('pending');
    expect(dto.actualPrice).toBeNull();
    expect(dto.actualStoreId).toBeNull();
  });

  it('冪等: 既に bought の品目に checked: true を送っても例外を投げず bought のまま返す', async () => {
    shoppingListRepository.seed(
      seededShoppingList('active', [
        seededItem({
          status: 'bought',
          actualPrice: Money.of(198, 'JPY'),
          actualStoreId: 'store-1',
        }),
      ]),
    );

    const dto = await new SetItemCheckedUseCase(shoppingListRepository).execute(input);

    expect(dto.status).toBe('bought');
    expect(dto.actualPrice).toEqual({ amount: 198, currency: 'JPY' });
  });

  it('冪等: 既に pending の品目に checked: false を送っても例外を投げず pending のまま返す', async () => {
    shoppingListRepository.seed(seededShoppingList('active', [seededItem({ status: 'pending' })]));

    const dto = await new SetItemCheckedUseCase(shoppingListRepository).execute({
      ...input,
      checked: false,
    });

    expect(dto.status).toBe('pending');
  });

  it('completed の ShoppingList は InvalidShoppingListStateError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('completed'));

    await expect(
      new SetItemCheckedUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(InvalidShoppingListStateError);
  });

  it('存在しない ShoppingList は ShoppingListNotFoundError を投げる', async () => {
    await expect(
      new SetItemCheckedUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(ShoppingListNotFoundError);
  });

  it('存在しない ShoppingItem は ShoppingItemNotFoundError を投げる', async () => {
    shoppingListRepository.seed(seededShoppingList('active', []));

    await expect(
      new SetItemCheckedUseCase(shoppingListRepository).execute(input),
    ).rejects.toBeInstanceOf(ShoppingItemNotFoundError);
  });
});
```

`Money` / `InvalidShoppingListStateError` / `ShoppingListNotFoundError` / `ShoppingItemNotFoundError` /
`seededShoppingList` / `seededItem` / `SHOPPING_LIST_ID` / `SHOPPING_ITEM_ID` は既にファイル内に
定義・import 済みのため追加不要（`SetItemCheckedUseCase` の import のみ追加する）。

**完了条件**: 上記 7 ケースが通る。既存の `MarkAsBoughtUseCase` 等の describe ブロックが変更されない。

---

### Step 7: Application テスト — `CompleteShoppingUseCase` の回帰ケース追加

**対象ファイル**: `packages/application/src/shopping-list/complete-shopping.use-case.test.ts`

L349 付近の `it.each([...])` 配列に、`'actualPrice が 0'` のエントリの直後へ以下を追加する。

```typescript
    {
      label: 'actualPrice が null（チェックのみで金額未記録）',
      options: { actualPrice: null } satisfies SeededItemOptions,
      seedProduct: true,
    },
```

`seededItem()` はデフォルトで `status: 'bought'` になるため、`{ actualPrice: null }` だけで
「チェック済みだが価格未記録」の状態を再現できる（`options.actualPrice === undefined` の場合のみ
`status === 'bought' ? Money.of(200, 'JPY') : null` にフォールバックする既存ロジックのため、
明示的に `null` を渡す必要がある）。

**完了条件**:

- 追加ケースが既存の `it.each` テーブルと同じ `it('$label の品目は価格記録をスキップし Product を保存しない', ...)` の枠内で実行され、`product.priceHistory` が空のまま・`productRepository.saveCount` が増えないことを確認する。
- 既存 5 ケースの結果が変わらない。

---

### Step 8: api-contract — `setItemCheckedSchema` 追加

**対象ファイル**: `packages/api-contract/src/shopping-list.schema.ts`

`markAsBoughtSchema` の直後に追加する。

```typescript
export const setItemCheckedSchema = z.object({
  checked: z.boolean(),
});
```

型エクスポート群（ファイル末尾）に `MarkAsBoughtBody` の直後で追加する。

```typescript
export type SetItemCheckedBody = z.infer<typeof setItemCheckedSchema>;
```

**完了条件**: `setItemCheckedSchema` が `{ checked: boolean }` の必須・非 nullable スキーマとして定義され、`SetItemCheckedBody` がエクスポートされている。既存 6 スキーマ・その型が変更されていない。

---

### Step 9: api-contract テスト — `setItemCheckedSchema`

**対象ファイル**: `packages/api-contract/src/shopping-list.schema.test.ts`

import 文に `setItemCheckedSchema` を追加する（アルファベット順維持。`reassignStoreSchema` の後・`shoppingItemIdParamSchema` の前）。

```typescript
import {
  addItemSchema,
  generateShoppingListSchema,
  markAsBoughtSchema,
  reassignStoreSchema,
  setItemCheckedSchema,
  shoppingItemIdParamSchema,
  shoppingItemResponseSchema,
  shoppingListIdParamSchema,
  shoppingListResponseSchema,
} from './shopping-list.schema';
```

`describe('reassignStoreSchema', ...)` の直後・`describe('shopping list parameter schemas', ...)`
の直前に新規ブロックを追加する。

```typescript
describe('setItemCheckedSchema', () => {
  it('{ checked: true } を受理する', () => {
    expect(setItemCheckedSchema.parse({ checked: true })).toEqual({ checked: true });
  });

  it('{ checked: false } を受理する', () => {
    expect(setItemCheckedSchema.parse({ checked: false })).toEqual({ checked: false });
  });

  it('checked が文字列のとき reject する', () => {
    expect(() => setItemCheckedSchema.parse({ checked: 'true' })).toThrow();
  });

  it('checked が数値のとき reject する', () => {
    expect(() => setItemCheckedSchema.parse({ checked: 1 })).toThrow();
  });

  it('checked が null のとき reject する', () => {
    expect(() => setItemCheckedSchema.parse({ checked: null })).toThrow();
  });

  it('checked キーの省略を reject する', () => {
    expect(() => setItemCheckedSchema.parse({})).toThrow();
  });
});
```

**完了条件**: 上記 6 ケースが通る。既存の `markAsBoughtSchema` 等のテストが変更されず通る。

---

### Step 10: Infrastructure — 無変更の確認（作業なし）

**対象**: `packages/infrastructure/src/db/schema.ts` /
`packages/infrastructure/src/repositories/drizzle-shopping-list.repository.ts`

設計書 §DB 設計のとおり、`shopping_items.actual_price_amount` / `actual_store_id` は既に
`.notNull()` なしで nullable であり、`DrizzleShoppingListRepository` の `toEntity` /
`toShoppingItemRows` も null 分岐済みのため**変更しない**。

**完了条件**:

- `packages/infrastructure/src/db/schema.ts` に差分がない。
- `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.ts` に差分がない。
- 既存の `drizzle-shopping-list.repository.test.ts` がそのまま通る（Step 1 の Domain 変更が
  Repository の read/write ロジックに影響しないことの確認）。

---

### Step 11: Hono ルート — `POST /:id/items/:itemId/checked` 追加

**対象ファイル**: `apps/web/src/server/routes/shopping-lists.ts`

import 文を 2 箇所変更する。

```typescript
import {
  addItemSchema,
  generateShoppingListSchema,
  markAsBoughtSchema,
  reassignStoreSchema,
  setItemCheckedSchema,
  shoppingItemIdParamSchema,
  shoppingListIdParamSchema,
} from '@cookpit/api-contract';
import {
  AddItemUseCase,
  CompleteShoppingUseCase,
  GenerateShoppingListUseCase,
  GetShoppingListUseCase,
  MarkAsBoughtUseCase,
  ReassignStoreUseCase,
  ReopenShoppingListUseCase,
  SetItemCheckedUseCase,
  SyncShoppingListFromMealPlanUseCase,
} from '@cookpit/application';
```

`.post('/:id/items/:itemId/bought', ...)` ブロックの直後・`.post('/:id/items/:itemId/target-store', ...)`
ブロックの直前に新規ルートを挿入する。

```typescript
  .post(
    '/:id/items/:itemId/checked',
    zValidator('param', shoppingItemIdParamSchema),
    zValidator('json', setItemCheckedSchema),
    async (c) => {
      const { id, itemId } = c.req.valid('param');
      const body = c.req.valid('json');
      const usecase = new SetItemCheckedUseCase(shoppingListRepository());
      const dto = await usecase.execute({ shoppingListId: id, itemId, ...body });
      return c.json(dto, 200);
    },
  )
```

`apps/web/src/server/app.ts` は変更不要（`ShoppingListNotFoundError` /
`ShoppingItemNotFoundError` / `InvalidShoppingListStateError` の 3 例外クラスとも既に
`onError` に登録済み。L52-60 で確認済み）。

**完了条件**:

- `POST /:id/items/:itemId/checked` が `zValidator('param', shoppingItemIdParamSchema)` +
  `zValidator('json', setItemCheckedSchema)` を通り、200 で `ShoppingItemDto` を返す。
- `apps/web/src/server/app.ts` に差分がない。
- `pnpm --filter @cookpit/web type-check` がエラーなし。

---

### Step 12: Hono ルートテスト — `/checked` エンドポイント

**対象ファイル**: `apps/web/src/server/routes/shopping-lists.test.ts`

import・モック設定を更新する。

```typescript
import {
  AddItemUseCase,
  CompleteShoppingUseCase,
  GenerateShoppingListUseCase,
  GetShoppingListUseCase,
  InvalidMealPlanStateError,
  InvalidShoppingListStateError,
  MarkAsBoughtUseCase,
  MealPlanNotFoundError,
  ReassignStoreUseCase,
  ReopenShoppingListUseCase,
  SetItemCheckedUseCase,
  ShoppingItemNotFoundError,
  ShoppingListNotFoundError,
  SyncShoppingListFromMealPlanUseCase,
} from '@cookpit/application';
```

```typescript
vi.mock('@cookpit/application', async (importOriginal) => {
  const actual = await importOriginal<typeof ApplicationModule>();
  return {
    ...actual,
    AddItemUseCase: vi.fn(),
    CompleteShoppingUseCase: vi.fn(),
    GenerateShoppingListUseCase: vi.fn(),
    GetShoppingListUseCase: vi.fn(),
    MarkAsBoughtUseCase: vi.fn(),
    ReassignStoreUseCase: vi.fn(),
    ReopenShoppingListUseCase: vi.fn(),
    SetItemCheckedUseCase: vi.fn(),
    SyncShoppingListFromMealPlanUseCase: vi.fn(),
  };
});
```

`markAsBoughtBody` の定義直後に定数を追加する。

```typescript
const setItemCheckedBody = { checked: true };
```

`POST /api/shopping-lists/:id/items/:itemId/bought は InvalidShoppingListStateError を 422 に変換する`
テストの直後（`/target-store` セクションの手前）に以下を追加する。

```typescript
it('POST /api/shopping-lists/:id/items/:itemId/checked は 200 で ShoppingItemDto を返す', async () => {
  const boughtItem: ShoppingItemDto = { ...shoppingItemDto, status: 'bought' };
  const execute = vi.fn().mockResolvedValue(boughtItem);
  vi.mocked(SetItemCheckedUseCase).mockImplementation(
    () => ({ execute }) as unknown as SetItemCheckedUseCase,
  );

  const res = await app.request(
    `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}/checked`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(setItemCheckedBody),
    },
  );

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(boughtItem);
  expect(execute).toHaveBeenCalledWith({
    shoppingListId: SHOPPING_LIST_ID,
    itemId: SHOPPING_ITEM_ID,
    ...setItemCheckedBody,
  });
});

it.each([
  ['不正な id', 'not-a-uuid', SHOPPING_ITEM_ID, setItemCheckedBody],
  ['不正な itemId', SHOPPING_LIST_ID, 'not-a-uuid', setItemCheckedBody],
  ['checked が文字列', SHOPPING_LIST_ID, SHOPPING_ITEM_ID, { checked: 'true' }],
  ['checked キーの欠落', SHOPPING_LIST_ID, SHOPPING_ITEM_ID, {}],
])(
  'POST /api/shopping-lists/:id/items/:itemId/checked は%sで 400 を返す',
  async (_case, id, itemId, body) => {
    const execute = vi.fn();
    vi.mocked(SetItemCheckedUseCase).mockImplementation(
      () => ({ execute }) as unknown as SetItemCheckedUseCase,
    );

    const res = await app.request(`/api/shopping-lists/${id}/items/${itemId}/checked`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  },
);

it.each([
  [
    'ShoppingListNotFoundError',
    new ShoppingListNotFoundError(SHOPPING_LIST_ID),
    `ShoppingList not found: ${SHOPPING_LIST_ID}`,
  ],
  [
    'ShoppingItemNotFoundError',
    new ShoppingItemNotFoundError(SHOPPING_ITEM_ID),
    `ShoppingItem not found: ${SHOPPING_ITEM_ID}`,
  ],
])(
  'POST /api/shopping-lists/:id/items/:itemId/checked は%sを 404 に変換する',
  async (_case, error, message) => {
    const execute = vi.fn().mockRejectedValue(error);
    vi.mocked(SetItemCheckedUseCase).mockImplementation(
      () => ({ execute }) as unknown as SetItemCheckedUseCase,
    );

    const res = await app.request(
      `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}/checked`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setItemCheckedBody),
      },
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: message });
  },
);

it('POST /api/shopping-lists/:id/items/:itemId/checked は InvalidShoppingListStateError を 422 に変換する', async () => {
  const execute = vi
    .fn()
    .mockRejectedValue(new InvalidShoppingListStateError('completed', 'setItemChecked'));
  vi.mocked(SetItemCheckedUseCase).mockImplementation(
    () => ({ execute }) as unknown as SetItemCheckedUseCase,
  );

  const res = await app.request(
    `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}/checked`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(setItemCheckedBody),
    },
  );

  expect(res.status).toBe(422);
  expect(await res.json()).toEqual({
    error: "Cannot setItemChecked a ShoppingList with status 'completed'",
  });
});

it('POST /api/shopping-lists/:id/items/:itemId/checked は同一 checked を連続送信しても 200 を返し続ける（冪等性の契約テスト）', async () => {
  const boughtItem: ShoppingItemDto = { ...shoppingItemDto, status: 'bought' };
  const execute = vi.fn().mockResolvedValue(boughtItem);
  vi.mocked(SetItemCheckedUseCase).mockImplementation(
    () => ({ execute }) as unknown as SetItemCheckedUseCase,
  );

  const first = await app.request(
    `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}/checked`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(setItemCheckedBody),
    },
  );
  const second = await app.request(
    `/api/shopping-lists/${SHOPPING_LIST_ID}/items/${SHOPPING_ITEM_ID}/checked`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(setItemCheckedBody),
    },
  );

  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(await first.json()).toEqual(boughtItem);
  expect(await second.json()).toEqual(boughtItem);
});
```

**完了条件**: 上記 4 ブロック（200 系 1・400 系 4 ケース・404 系 2 ケース・422 系 1・冪等性 1）が
すべて通る。既存の `/bought` `/target-store` 等のテストが変更されず通る。

---

### Step 13: Presentation — `shopping-item-row.tsx`

**対象ファイル**: `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`

全文を以下に置き換える。

```tsx
'use client';

import { cn } from '@/lib/utils';
import { SelectField, type SelectFieldOption } from '@/components/ui/select-field';
import type { ShoppingItemDto, StoreDto } from '@cookpit/application';
import { Check } from 'lucide-react';
import { useId, useState } from 'react';
import { PurchaseInputForm } from './purchase-input-form';

interface Props {
  item: ShoppingItemDto;
  stores: StoreDto[];
  expanded: boolean;
  submitting: boolean;
  onToggleExpand: (itemId: string) => void;
  onSetChecked: (itemId: string, checked: boolean) => void;
  onMarkAsBought: (itemId: string, actualPrice: number, actualStoreId: string) => void;
  onReassignStore: (itemId: string, targetStoreId: string) => void;
}

function resolveStoreName(storeId: string | null, stores: StoreDto[]): string {
  if (storeId === null) {
    return '店舗未定';
  }
  return stores.find((store) => store.id === storeId)?.name ?? '不明な店舗';
}

/** item 1 行（チェック・表示・展開トグル・店舗変更。D-4）。 */
export function ShoppingItemRow({
  item,
  stores,
  expanded,
  submitting,
  onToggleExpand,
  onSetChecked,
  onMarkAsBought,
  onReassignStore,
}: Props) {
  const storeSelectId = useId();
  const [storeEditing, setStoreEditing] = useState(false);

  const bought = item.status === 'bought';
  const storeOptions: SelectFieldOption[] = stores.map((store) => ({
    value: store.id,
    label: store.name,
  }));

  function handleReassign(nextStoreId: string): void {
    setStoreEditing(false);
    if (nextStoreId === '') {
      return;
    }
    onReassignStore(item.id, nextStoreId);
  }

  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-border p-3 transition-colors',
        bought ? 'bg-muted/40' : 'bg-card',
      )}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={bought}
          aria-label={
            bought ? `${item.displayName}のチェックを外す` : `${item.displayName}をチェックする`
          }
          onClick={() => onSetChecked(item.id, !bought)}
          disabled={submitting}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors active:scale-[0.98]',
            bought
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-background',
          )}
        >
          {bought && <Check className="size-4" aria-hidden="true" />}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p
            className={cn(
              'truncate text-sm font-medium',
              bought ? 'text-muted-foreground line-through' : 'text-foreground',
            )}
          >
            {item.displayName}
          </p>
          <p className="text-xs text-muted-foreground">
            {item.requiredAmount !== null
              ? `${item.requiredAmount.value}${item.requiredAmount.unit}`
              : item.amountNote}
          </p>
          {bought && item.actualPrice !== null && (
            <p className="text-xs text-muted-foreground">
              ✓ {resolveStoreName(item.actualStoreId, stores)} で ¥{item.actualPrice.amount} 購入
            </p>
          )}
          {bought && (
            <button
              type="button"
              onClick={() => onToggleExpand(item.id)}
              disabled={submitting}
              className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              金額を記録
            </button>
          )}
        </div>

        {storeEditing ? (
          <div className="w-28">
            <label htmlFor={storeSelectId} className="sr-only">
              推奨店舗を変更
            </label>
            <SelectField
              id={storeSelectId}
              value={item.targetStoreId ?? ''}
              onValueChange={handleReassign}
              options={storeOptions}
              disabled={submitting}
              className="h-9"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setStoreEditing(true)}
            disabled={submitting}
            className="shrink-0 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
          >
            {resolveStoreName(item.targetStoreId, stores)}
          </button>
        )}
      </div>

      {bought && expanded && (
        <PurchaseInputForm
          item={item}
          stores={stores}
          submitting={submitting}
          onSubmit={(actualPrice, actualStoreId) =>
            onMarkAsBought(item.id, actualPrice, actualStoreId)
          }
          onCancel={() => onToggleExpand(item.id)}
        />
      )}
    </li>
  );
}
```

変更点まとめ:

1. `Props` に `onSetChecked` を追加。
2. チェックボタン `onClick` を `onToggleExpand(item.id)` → `onSetChecked(item.id, !bought)` に変更。
3. `aria-label` をトグル対応の文言に変更。
4. チェックボタンの `className` に `active:scale-[0.98]` を追加（既存の `transition-colors` は維持）。
5. `bought` のときのみ表示する「金額を記録」ボタンを新設（`onClick` は既存の `onToggleExpand` を再利用）。
6. `PurchaseInputForm` の表示条件を `{expanded && ...}` → `{bought && expanded && ...}` に変更。

**完了条件**:

- 上記 6 点の変更が反映されている。
- `pnpm --filter @cookpit/web type-check` がエラーなし（Step 15 の `store-group.tsx` 更新と
  合わせて確認する。単体では `StoreGroup` 側が未更新のため型エラーが出る場合がある）。

---

### Step 14: Presentation — `purchase-input-form.tsx` の文言修正

**対象ファイル**: `apps/web/src/app/shopping-lists/_components/purchase-input-form.tsx`

L52-56 を以下に置き換える（`item.status === 'bought'` の条件分岐自体は防御的にそのまま残す）。

```tsx
{
  item.status === 'bought' && (
    <p className="text-xs text-muted-foreground">
      金額・店舗はあとから何度でも訂正できます。チェックを外すとこの記録も消えます。
    </p>
  );
}
```

**完了条件**: 表示文言が「金額・店舗はあとから何度でも訂正できます。チェックを外すとこの記録も消えます。」に変わっている。それ以外の行に差分がない。

---

### Step 15: Presentation — `store-group.tsx` のプロップ中継

**対象ファイル**: `apps/web/src/app/shopping-lists/_components/store-group.tsx`

```tsx
interface Props {
  storeId: string | null;
  storeName: string;
  items: ShoppingItemDto[];
  expandedItemId: string | null;
  submittingItemId: string | null;
  onToggleExpand: (itemId: string) => void;
  onSetChecked: (itemId: string, checked: boolean) => void;
  onMarkAsBought: (itemId: string, actualPrice: number, actualStoreId: string) => void;
  onReassignStore: (itemId: string, targetStoreId: string) => void;
  stores: StoreDto[];
}

/** 店舗ごとのグループ（ヘッダー + item 一覧。D-2/S-6 案A）。 */
export function StoreGroup({
  storeId,
  storeName,
  items,
  expandedItemId,
  submittingItemId,
  onToggleExpand,
  onSetChecked,
  onMarkAsBought,
  onReassignStore,
  stores,
}: Props) {
  const boughtCount = items.filter((item) => item.status === 'bought').length;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-foreground">
          <Store className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{storeId === null ? '店舗未定' : storeName}</span>
        </h2>
        <span className="shrink-0 text-xs font-normal text-muted-foreground">
          {boughtCount}/{items.length}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <ShoppingItemRow
            key={item.id}
            item={item}
            stores={stores}
            expanded={item.id === expandedItemId}
            submitting={item.id === submittingItemId}
            onToggleExpand={onToggleExpand}
            onSetChecked={onSetChecked}
            onMarkAsBought={onMarkAsBought}
            onReassignStore={onReassignStore}
          />
        ))}
      </ul>
    </section>
  );
}
```

**完了条件**: `onSetChecked` が `Props` に追加され、`ShoppingItemRow` へそのまま中継されている。`import` 文・その他ロジックに差分がない。

---

### Step 16: Presentation — `shopping-list-client.tsx` に `handleSetChecked` 追加

**対象ファイル**: `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`

`handleMarkAsBought` 関数の直後・`handleAddItem` 関数の直前に追加する。

```typescript
function handleSetChecked(itemId: string, checked: boolean): void {
  if (submittingItemId === itemId) {
    return;
  }
  setSubmittingItemId(itemId);
  setErrorMessage(null);
  startTransition(async () => {
    setOptimisticItems({
      itemId,
      patch: checked
        ? { status: 'bought' }
        : { status: 'pending', actualPrice: null, actualStoreId: null },
    });
    try {
      const response = await client.api['shopping-lists'][':id'].items[':itemId'].checked.$post({
        param: { id: shoppingList.id, itemId },
        json: { checked },
      });
      if (!response.ok) {
        setErrorMessage('操作に失敗しました。');
        return;
      }
      const updated: ShoppingItemDto = await response.json();
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      if (!checked) {
        // チェックを外したら展開中の価格フォームも閉じる（誤操作防止。設計書 §フロントエンド設計）
        setExpandedItemId((current) => (current === itemId ? null : current));
      }
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setSubmittingItemId(null);
    }
  });
}
```

`<StoreGroup ...>` の呼び出しに `onSetChecked={handleSetChecked}` を追加する（`onToggleExpand` の直後）。

```tsx
<StoreGroup
  key={group.storeId ?? 'unassigned'}
  storeId={group.storeId}
  storeName={group.storeName}
  items={group.items}
  expandedItemId={expandedItemId}
  submittingItemId={submittingItemId}
  onToggleExpand={handleToggleExpand}
  onSetChecked={handleSetChecked}
  onMarkAsBought={handleMarkAsBought}
  onReassignStore={(itemId, targetStoreId) => void handleReassignStore(itemId, targetStoreId)}
  stores={stores}
/>
```

**完了条件**:

- `handleSetChecked` が `handleMarkAsBought` と同じ `useOptimistic` + `startTransition` +
  `submittingItemId` パターンで実装されている。
- `checked === false` のとき `expandedItemId` が対象 item ならクリアされる。
- `<StoreGroup>` に `onSetChecked` が配線されている。
- `pnpm --filter @cookpit/web type-check` がエラーなし（Step 13/15/16 完了後に確認）。

---

### Step 17: Presentation テスト — `shopping-item-row.test.tsx`

**対象ファイル**: `apps/web/src/app/shopping-lists/_components/shopping-item-row.test.tsx`

1. `renderRow` の `defaults` に `onSetChecked: vi.fn()` を追加する。

```typescript
function renderRow(props: Partial<Parameters<typeof ShoppingItemRow>[0]> = {}) {
  const defaults = {
    item: createShoppingItemDto(),
    stores: STORES,
    expanded: false,
    submitting: false,
    onToggleExpand: vi.fn(),
    onSetChecked: vi.fn(),
    onMarkAsBought: vi.fn(),
    onReassignStore: vi.fn(),
  };
  const merged = { ...defaults, ...props };
  render(<ul>{<ShoppingItemRow {...merged} />}</ul>);
  return merged;
}
```

2. `IR-06` を 2 ケースに分割する（`onToggleExpand` ではなく `onSetChecked` を検証するように変更）。

```typescript
it('IR-06a: pending item のチェックボタン click で onSetChecked(id, true) が呼ばれる', async () => {
  const user = userEvent.setup();
  const onSetChecked = vi.fn();
  renderRow({
    item: createShoppingItemDto({ id: 'item-1', status: 'pending' }),
    onSetChecked,
  });

  await user.click(screen.getByRole('checkbox'));

  expect(onSetChecked).toHaveBeenCalledWith('item-1', true);
});

it('IR-06b: bought item のチェックボタン click で onSetChecked(id, false) が呼ばれる', async () => {
  const user = userEvent.setup();
  const onSetChecked = vi.fn();
  renderRow({
    item: createShoppingItemDto({ id: 'item-1', status: 'bought' }),
    onSetChecked,
  });

  await user.click(screen.getByRole('checkbox'));

  expect(onSetChecked).toHaveBeenCalledWith('item-1', false);
});
```

3. `IR-09` / `IR-10` を更新し、`bought &&` ガードを検証するケースを追加する。

```typescript
it('IR-09: bought かつ expanded のとき PurchaseInputForm が表示される', () => {
  renderRow({ item: createShoppingItemDto({ status: 'bought' }), expanded: true });

  expect(screen.getByRole('button', { name: '購入を記録' })).toBeDefined();
});

it('IR-10: expanded でないとき PurchaseInputForm は表示されない', () => {
  renderRow({ item: createShoppingItemDto({ status: 'bought' }), expanded: false });

  expect(screen.queryByRole('button', { name: '購入を記録' })).toBeNull();
});

it('IR-10b: pending かつ expanded のとき PurchaseInputForm は表示されない（bought ガード）', () => {
  renderRow({ item: createShoppingItemDto({ status: 'pending' }), expanded: true });

  expect(screen.queryByRole('button', { name: '購入を記録' })).toBeNull();
});
```

4. `IR-12` を削除し、以下に置き換える。

```typescript
it('IR-12: bought item は「金額を記録」ボタンが表示される', () => {
  renderRow({ item: createShoppingItemDto({ status: 'bought' }) });

  expect(screen.getByRole('button', { name: '金額を記録' })).toBeDefined();
});

it('IR-13: pending item は「金額を記録」ボタンが表示されない', () => {
  renderRow({ item: createShoppingItemDto({ status: 'pending' }) });

  expect(screen.queryByRole('button', { name: '金額を記録' })).toBeNull();
});

it('IR-14: 「金額を記録」ボタン click で onToggleExpand が呼ばれる', async () => {
  const user = userEvent.setup();
  const onToggleExpand = vi.fn();
  renderRow({
    item: createShoppingItemDto({ id: 'item-1', status: 'bought' }),
    onToggleExpand,
  });

  await user.click(screen.getByRole('button', { name: '金額を記録' }));

  expect(onToggleExpand).toHaveBeenCalledWith('item-1');
});
```

**完了条件**:

- `IR-01`〜`IR-05`、`IR-07`、`IR-08`、`IR-11` は変更なしで通る。
- `IR-06a`/`IR-06b`、更新後の `IR-09`/`IR-10`/`IR-10b`、`IR-12`〜`IR-14` が通る。
- 旧 `IR-06`（単一ケース）・旧 `IR-12`（S-3 検証）が残っていない。

---

### Step 18: Presentation テスト — `purchase-input-form.test.tsx`

**対象ファイル**: `apps/web/src/app/shopping-lists/_components/purchase-input-form.test.tsx`

`bought item のとき訂正の制約説明文が表示される（S-3）` と
`pending item のとき訂正の制約説明文は表示されない` の 2 テストの文字列を変更する。

```typescript
  it('bought item のとき訂正の制約説明文が表示される', () => {
    const item = createShoppingItemDto({
      status: 'bought',
      actualPrice: { amount: 298, currency: 'JPY' },
      actualStoreId: 'store-b',
    });
    render(
      <PurchaseInputForm
        item={item}
        stores={STORES}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.getByText('金額・店舗はあとから何度でも訂正できます。チェックを外すとこの記録も消えます。'),
    ).toBeDefined();
  });

  it('pending item のとき訂正の制約説明文は表示されない', () => {
    const item = createShoppingItemDto({ status: 'pending' });
    render(
      <PurchaseInputForm
        item={item}
        stores={STORES}
        submitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(
      screen.queryByText('金額・店舗はあとから何度でも訂正できます。チェックを外すとこの記録も消えます。'),
    ).toBeNull();
  });
```

**完了条件**: `PF-01`〜`PF-08` は無変更で通る。上記 2 テストが新文言で通る。

---

### Step 19: Presentation テスト — `store-group.test.tsx`

**対象ファイル**: `apps/web/src/app/shopping-lists/_components/store-group.test.tsx`

`renderStoreGroup` の `defaults` に `onSetChecked: vi.fn()` を追加する（型エラー回避のため必須）。

```typescript
function renderStoreGroup(props: Partial<Parameters<typeof StoreGroup>[0]> = {}) {
  const defaults = {
    storeId: 'store-a',
    storeName: 'イオン',
    items: [createShoppingItemDto()],
    expandedItemId: null,
    submittingItemId: null,
    onToggleExpand: vi.fn(),
    onSetChecked: vi.fn(),
    onMarkAsBought: vi.fn(),
    onReassignStore: vi.fn(),
    stores: STORES,
  };
  render(<StoreGroup {...defaults} {...props} />);
}
```

推奨（配線regressionの検知用。設計書に明記はないが型変更に伴う最小限の追加）: `SG-04` の後に
プロップ中継の確認テストを 1 件追加する。

```typescript
it('SG-05: チェックボタン click で onSetChecked が呼ばれる（プロップ中継の確認）', async () => {
  const user = userEvent.setup();
  const onSetChecked = vi.fn();
  renderStoreGroup({
    items: [createShoppingItemDto({ id: 'item-1', status: 'pending' })],
    onSetChecked,
  });

  await user.click(screen.getByRole('checkbox'));

  expect(onSetChecked).toHaveBeenCalledWith('item-1', true);
});
```

`userEvent` の import が必要（`import userEvent from '@testing-library/user-event';` を追加）。

**完了条件**: `SG-01`〜`SG-04` が無変更で通る。`defaults` に `onSetChecked` が追加され型エラーがない。`SG-05` を追加した場合は通る。

---

### Step 20: Presentation テスト — `shopping-list-client.test.tsx`

**対象ファイル**: `apps/web/src/app/shopping-lists/_components/shopping-list-client.test.tsx`

#### 20-1. モック配線の追加

`vi.hoisted` に `postChecked` を追加する。

```typescript
const {
  getShoppingList,
  postItem,
  postBought,
  postChecked,
  postTargetStore,
  postComplete,
  postReopen,
  postSync,
  routerPush,
  routerRefresh,
} = vi.hoisted(() => ({
  getShoppingList: vi.fn(),
  postItem: vi.fn(),
  postBought: vi.fn(),
  postChecked: vi.fn(),
  postTargetStore: vi.fn(),
  postComplete: vi.fn(),
  postReopen: vi.fn(),
  postSync: vi.fn(),
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}));
```

`vi.mock('@/lib/api-client', ...)` の `items[':itemId']` に `checked` を追加する。

```typescript
          items: {
            $post: (...args: unknown[]) => postItem(...args),
            ':itemId': {
              bought: {
                $post: (...args: unknown[]) => postBought(...args),
              },
              checked: {
                $post: (...args: unknown[]) => postChecked(...args),
              },
              'target-store': {
                $post: (...args: unknown[]) => postTargetStore(...args),
              },
            },
          },
```

#### 20-2. `LC-04` の置き換え（チェック操作そのものの検証に変更）

旧 `LC-04`（`チェックでフォームが展開される`）は、チェックボタンをタップすると即座に
`PurchaseInputForm` が開くという**旧仕様**を検証していたテストであり、Step 13〜16 の変更後は
この前提が成立しない（チェックボタンは `onSetChecked` を呼ぶだけになり、フォームは「金額を記録」
ボタンからのみ開く）。**旧 `LC-04` の内容は削除し、以下の内容に置き換える**（新規テストとして
別番号を振らず、`LC-04` という番号のまま検証内容だけ差し替える）。

```typescript
  it('LC-04: チェックをタップすると即座に bought になる（handleSetChecked 成功）', async () => {
    const user = userEvent.setup();
    postChecked.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'bought' }),
    });
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });
    expect(postChecked).toHaveBeenCalledWith({
      param: { id: shoppingList.id, itemId: 'item-1' },
      json: { checked: true },
    });
  });
```

#### 20-3. 既存テストの書き換え（トリガを「チェック」から「金額を記録」に変更）

以下のテストは「チェック → フォーム展開 → 入力 → 送信」という**購入実績記録**の検証が目的であり、
チェック機能そのものの検証ではない（20-2 で置き換えた `LC-04` とは検証目的が異なる）。設計変更後は
`PurchaseInputForm` が `bought` の item にしか表示されないため、各テストの初期データを
`status: 'bought'` にし、フォームを開くトリガを `screen.getByRole('checkbox', ...)` クリックから
`screen.getByRole('button', { name: '金額を記録' })` クリックに置き換える。

| 対象テスト ID | 変更内容                                                                                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LC-05         | `createShoppingItemDto({ id: 'item-1', ..., status: 'pending' })` → `status: 'bought'`（`actualPrice: null` のまま）。`await user.click(screen.getByRole('checkbox', { name: /醤油/ }))` を `await user.click(screen.getByRole('button', { name: '金額を記録' }))` に置換 |
| LC-06         | 同上（item の初期 `status` を `'bought'` に、トリガを「金額を記録」ボタンに変更）                                                                                                                                                                                         |
| LC-07         | 同上                                                                                                                                                                                                                                                                      |
| LC-08         | 元々 `status: 'bought'`・`actualPrice` あり。トリガのみ「金額を記録」ボタンに変更                                                                                                                                                                                         |
| LC-17         | 2 item とも初期 `status: 'bought'` に変更。トリガを「金額を記録」ボタンに変更                                                                                                                                                                                             |
| LC-18         | 同上（1 item を `status: 'bought'` に、トリガを「金額を記録」ボタンに変更）                                                                                                                                                                                               |
| LC-21         | item の初期 `status` を `'bought'` に、トリガを「金額を記録」ボタンに変更                                                                                                                                                                                                 |

`fillPurchaseInputForm` ヘルパーは `.closest('li')` で行を特定しているため変更不要
（`screen.getByRole('checkbox', { name: new RegExp(itemDisplayName) })` は `aria-label` が
`${item.displayName}のチェックを外す` に変わっても部分一致で引き続きマッチする）。

具体例（LC-05 の変更後全文）:

```typescript
  it('LC-05: 購入実績入力が成功すると該当 item のみ更新される', async () => {
    const user = userEvent.setup();
    postBought.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          status: 'bought',
          actualPrice: { amount: 198, currency: 'JPY' },
          actualStoreId: 'store-a',
        }),
    });
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          targetStoreId: 'store-a',
          status: 'bought',
        }),
        createShoppingItemDto({
          id: 'item-2',
          displayName: '味噌',
          targetStoreId: 'store-b',
          status: 'pending',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '金額を記録' }));
    await fillPurchaseInputForm('醤油', '198');
    await user.click(screen.getByRole('button', { name: '購入を記録' }));

    await waitFor(() => {
      expect(screen.getByText('✓ 店舗A で ¥198 購入')).toBeDefined();
    });
    expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('checkbox', { name: /味噌/ }).getAttribute('aria-checked')).toBe(
      'false',
    );
  });
```

LC-06/07/17/21 は「金額未記録の bought item」（`actualPrice: null` のまま `status: 'bought'`）から
開始し、ロールバック確認は `screen.getByText('✓ 店舗A で ¥198 購入')` の出現/消失で行う
（`aria-checked` は開始時から `'true'` のまま変化しないため、ロールバック確認の指標としては
使わない）。LC-06 の変更後の該当箇所は以下のとおり。

```typescript
  it('LC-06: 楽観的更新のロールバック（失敗レスポンス。最重要）', async () => {
    const user = userEvent.setup();
    let resolveBought: (value: { ok: boolean }) => void = () => {};
    postBought.mockReturnValue(
      new Promise((resolve) => {
        resolveBought = resolve;
      }),
    );
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          targetStoreId: 'store-a',
          status: 'bought',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '金額を記録' }));
    await fillPurchaseInputForm('醤油', '198');
    await user.click(screen.getByRole('button', { name: '購入を記録' }));

    await waitFor(() => {
      expect(screen.getByText('✓ 店舗A で ¥198 購入')).toBeDefined();
    });

    await act(async () => {
      resolveBought({ ok: false });
    });

    await waitFor(() => {
      expect(screen.queryByText('✓ 店舗A で ¥198 購入')).toBeNull();
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
  });
```

LC-07（ネットワークエラー）・LC-17（他 item は操作可能）・LC-21（refetch でエラーバナー消去）も
同じ方針（初期 `status: 'bought'` + トリガを「金額を記録」ボタンに変更）で書き換える。LC-17 の
disable 確認対象は「金額を記録」ボタンではなく引き続きチェックボタン（`role="checkbox"`）のままで
問題ない（`submitting` は item 単位で `ShoppingItemRow` 全体に伝播するため）。LC-18（連打防止）は
「金額を記録」ボタンクリック後、`購入を記録` ボタンを連打する形に変更する。

#### 20-4. `handleSetChecked` の新規テスト追加

`LC-22` の直後に追加する（`CB-01` の手前）。20-2 で置き換えた `LC-04`（チェックで即 bought になる
成功ケース）とあわせて、以下は「外す」「失敗ロールバック」「展開中フォームのクローズ」「連打防止」の
4 ケースを追加する（番号は `LC-04` の次に使われていない `LC-24` から振り、`LC-23` は欠番とする —
`LC-23` 相当の内容は 20-2 の `LC-04` が兼ねるため）。

```typescript
  it('LC-24: bought item を再タップするとチェックが外れ pending に戻る', async () => {
    const user = userEvent.setup();
    postChecked.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          status: 'pending',
          actualPrice: null,
          actualStoreId: null,
        }),
    });
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          status: 'bought',
          actualPrice: { amount: 198, currency: 'JPY' },
          actualStoreId: 'store-a',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'false',
      );
    });
    expect(postChecked).toHaveBeenCalledWith({
      param: { id: shoppingList.id, itemId: 'item-1' },
      json: { checked: false },
    });
  });

  it('LC-25: チェック操作の失敗レスポンスでロールバックされる', async () => {
    const user = userEvent.setup();
    let resolveChecked: (value: { ok: boolean }) => void = () => {};
    postChecked.mockReturnValue(
      new Promise((resolve) => {
        resolveChecked = resolve;
      }),
    );
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });

    await act(async () => {
      resolveChecked({ ok: false });
    });

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'false',
      );
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
  });

  it('LC-26: チェックを外すと展開中の金額フォームが閉じる', async () => {
    const user = userEvent.setup();
    postChecked.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          status: 'pending',
          actualPrice: null,
          actualStoreId: null,
        }),
    });
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({
          id: 'item-1',
          displayName: '醤油',
          status: 'bought',
          actualPrice: { amount: 198, currency: 'JPY' },
          actualStoreId: 'store-a',
        }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('button', { name: '金額を記録' }));
    expect(screen.getByRole('button', { name: '購入を記録' })).toBeDefined();

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '購入を記録' })).toBeNull();
    });
  });

  it('LC-27: チェック操作の連打は checked.$post を 1 回のみ呼ぶ', async () => {
    const user = userEvent.setup();
    postChecked.mockReturnValue(new Promise(() => {}));
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    const checkbox = screen.getByRole('checkbox', { name: /醤油/ });
    await user.click(checkbox);
    await user.click(checkbox);

    expect(postChecked).toHaveBeenCalledTimes(1);
  });
```

**追記（2026-07-25・reviewer Should-2 対応）**: 試験計画 `docs/tests/shopping-list-item-check.md` の
SC-04（チェック操作中のネットワークエラー→ロールバック）が上記 LC-24〜27 に含まれておらず、
reviewer の受け入れレビューで指摘された。`LC-07`（`markAsBought` の reject 経路）と同型のケースを
`LC-28` として追加済み（`postChecked.mockReturnValue` を reject する Promise にし、`aria-checked` の
ロールバックと「通信エラーが発生しました。」表示を確認）。

```typescript
  it('LC-28: チェック操作中のネットワークエラーでロールバックされる', async () => {
    const user = userEvent.setup();
    let rejectChecked: (reason: unknown) => void = () => {};
    postChecked.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectChecked = reject;
      }),
    );
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });

    await act(async () => {
      rejectChecked(new Error('network'));
    });

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'false',
      );
      expect(screen.getByText('通信エラーが発生しました。')).toBeDefined();
    });
  });
```

**完了条件**:

- `postChecked` モックが `vi.hoisted` と `vi.mock('@/lib/api-client', ...)` に追加されている。
- 20-2 のとおり `LC-04` の内容が「チェックで即 bought になる」検証に置き換わっている。
- LC-05/06/07/08/17/18/21 が「金額を記録」ボタン起点のフローに書き換えられ、通る。
- LC-24〜LC-28（新規。`LC-23` は欠番のまま）が通る。
- LC-01〜03、LC-09〜16、LC-19、LC-20、LC-22、CB-\*、SY-\* が無変更のまま通る。

---

### Step 21: ドキュメント更新 — `docs/designs/shopping-list-screens.md`

**対象ファイル**: `docs/designs/shopping-list-screens.md`

1. L136 の見出し `### S-3: チェック解除（bought→pending）UI・UseCase の要否（S-B3）` の直後
   （表の直前）に supersede 注記を追加する。

```markdown
> **Superseded（2026-07-24, `docs/designs/shopping-list-item-check.md`）**: 本セクションの結論
> 「チェック解除 UI・UseCase は実装しない」は撤回された。ユーザーが「チェック操作を価格記録から
> 分離し、チェックは何度でも外せるようにする」ことを明示的に要求したため、`ShoppingItem.check()` /
> `uncheck()` と `SetItemCheckedUseCase` / `POST /api/shopping-lists/:id/items/:itemId/checked`
> を新設して bought→pending の逆遷移を可能にした。以下の案 A〜C の比較・確定理由は判断の経緯
> として残すが、現行の結論ではない。詳細は `docs/designs/shopping-list-item-check.md` を参照。
```

2. L56 のサマリ表「S-3」行の「Unit B スコープ内/外」列の末尾に注記を追記する。

```markdown
| S-3 | チェック解除（bought→pending）UI・UseCase の要否（S-B3） | 実装しない（Unit B スコープ外のまま据え置き） | 外（実装する場合はバックエンド拡張が必要になり L2 を超える）※Superseded。詳細は S-3 本文参照 |
```

3. L103「対象外」箇条書きの該当行を修正する。

変更前:

```markdown
- チェック解除（bought→pending）UseCase・API の新規実装（S-3。実装しない）。
```

変更後:

```markdown
- ~~チェック解除（bought→pending）UseCase・API の新規実装（S-3。実装しない）。~~
  Superseded（2026-07-24）: `docs/designs/shopping-list-item-check.md` により実装済み。
```

4. L631 の R-5 リスク行に注記を追記する。

変更前:

```markdown
| R-5 | S-3（チェック解除なし）のまま運用すると誤タップの完全な取り消しができない | 「やっぱり買わなかった」を pending に戻せない | S-11(a) の上書き訂正で大半のケースは救える旨を画面文言で示す。要否は Unit B 実使用後に再訪 |
```

変更後（対策列に追記）:

```markdown
| R-5 | S-3（チェック解除なし）のまま運用すると誤タップの完全な取り消しができない | 「やっぱり買わなかった」を pending に戻せない | S-11(a) の上書き訂正で大半のケースは救える旨を画面文言で示す。要否は Unit B 実使用後に再訪。**Superseded（2026-07-24）**: `docs/designs/shopping-list-item-check.md` によりチェック解除を実装したため本リスクは解消済み |
```

5. L664「将来課題」箇条書きの該当行を修正する。

変更前:

```markdown
- チェック解除（bought→pending）UseCase・API の新規実装（S-3）。
```

変更後:

```markdown
- ~~チェック解除（bought→pending）UseCase・API の新規実装（S-3）。~~
  Superseded（2026-07-24）: `docs/designs/shopping-list-item-check.md` により実装済み。
```

**完了条件**: 上記 5 箇所が更新されている（実際の行番号はファイル編集時に再検索して確認する。
本計画作成時点の行番号は `grep -n` で確認済みだが、他の編集で前後する可能性がある）。それ以外の
記述（S-1/S-2/S-4〜S-6・D-x・未決事項セクション等）は変更しない。

---

### Step 22: ドキュメント更新 — `docs/04-domain-model.md`

**対象ファイル**: `docs/04-domain-model.md`

`### ShoppingList 集約` セクション（L413 開始）の「設計ポイント」箇条書きの直後・
`### Pantry 集約`（L486）の直前に、Pantry セクション（L490-495）と同じ形式の実装追記ブロックを
追加する。

```markdown
> 実装追記（2026-07-24, `docs/designs/shopping-list-item-check.md`）: `ShoppingItem` に
> `check()`（価格・店舗に触れず `bought` へ遷移）/ `uncheck()`（`bought` からのみ許可し `pending` に
> 戻すと同時に `actualPrice`/`actualStore` を `null` にクリア。`bought` 以外から呼ぶと `Error`）を
> 追加した。`ShoppingList` にも `assertActive` ガード付きの薄いラッパー `check(itemId)` /
> `uncheck(itemId)` を追加している。これにより **`ItemStatus.bought` は「価格記録済み」を含意
> しなくなった**（`SetItemCheckedUseCase` 経由で価格・店舗なしの `bought` が生成されうる）。
> 既存の `markAsBought(price, store)` / `markAsSkipped()` / `reassignStore()` は無変更。
> `CompleteShoppingUseCase` は元々 `actualPrice === null || actualStore === null` のとき価格記録を
> スキップする分岐を実装済みのため、追加改修は不要だった。正典は
> `packages/domain/src/shopping-list/shopping-list.ts` と
> `docs/designs/shopping-list-item-check.md`。
```

上記コードブロック（L421-471 の `ShoppingList`/`ShoppingItem` クラス例示）自体は変更しない
（他の実装追記ブロックと同様、コード例は設計初期版のままとし、乖離注記で補う方針を踏襲）。

**完了条件**: 実装追記ブロックが `### Pantry 集約` の直前に追加されている。既存のコード例・
「設計ポイント」箇条書きは変更しない。

---

### Step 23: 品質ゲート

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm format
```

**完了条件**:

- `pnpm lint` がエラーなし。
- `pnpm type-check` がエラーなし（`packages/domain` / `packages/application` /
  `packages/api-contract` / `packages/infrastructure` / `apps/web` すべて）。
- `pnpm test` が全パッケージで通過する（新規テストを含み、既存テストに regressionがない）。
- `pnpm format` 実行後に差分がない、またはフォーマット差分のみ。

---

## 実装順序サマリ

```
Step 1  packages/domain/src/shopping-list/shopping-list.ts（check/uncheck 追加）
Step 2  packages/domain/src/shopping-list/shopping-list.test.ts（テスト追加）
Step 3  packages/application/src/shopping-list/shopping-list.dto.ts（DTO 追加）
Step 4  packages/application/src/shopping-list/set-item-checked.use-case.ts（新規）
Step 5  packages/application/src/shopping-list/index.ts（export 追加）
Step 6  packages/application/src/shopping-list/shopping-list-use-cases.test.ts（テスト追加）
Step 7  packages/application/src/shopping-list/complete-shopping.use-case.test.ts（回帰ケース追加）
Step 8  packages/api-contract/src/shopping-list.schema.ts（スキーマ追加）
Step 9  packages/api-contract/src/shopping-list.schema.test.ts（テスト追加）
Step 10 Infrastructure 無変更の確認（既存テスト実行のみ）
Step 11 apps/web/src/server/routes/shopping-lists.ts（ルート追加）
Step 12 apps/web/src/server/routes/shopping-lists.test.ts（テスト追加）
Step 13 apps/web/.../shopping-item-row.tsx（タップ挙動変更）
Step 14 apps/web/.../purchase-input-form.tsx（文言修正）
Step 15 apps/web/.../store-group.tsx（プロップ中継）
Step 16 apps/web/.../shopping-list-client.tsx（handleSetChecked 追加）
Step 17 apps/web/.../shopping-item-row.test.tsx（テスト更新）
Step 18 apps/web/.../purchase-input-form.test.tsx（テスト更新）
Step 19 apps/web/.../store-group.test.tsx（テスト更新）
Step 20 apps/web/.../shopping-list-client.test.tsx（テスト更新・新規）
Step 21 docs/designs/shopping-list-screens.md（supersede 注記）
Step 22 docs/04-domain-model.md（実装追記ブロック）
Step 23 品質ゲート（lint / type-check / test / format）
```

---

## 依存関係グラフ

```
Step 1（Domain 実装）
  └─→ Step 2（Domain テスト）
        └─→ Step 3（Application DTO）
              └─→ Step 4（Application UseCase）
                    └─→ Step 5（Application index export）
                          └─→ Step 6（Application UseCase テスト）
                          └─→ Step 7（CompleteShoppingUseCase 回帰テスト。Step 1 のみに依存、Step 3-6 と並行可）
                                └─→ Step 8（api-contract スキーマ）
                                      └─→ Step 9（api-contract テスト）
                                            └─→ Step 10（Infrastructure 無変更確認）
                                                  └─→ Step 11（Hono ルート）
                                                        └─→ Step 12（Hono ルートテスト）
                                                              └─→ Step 13, 15, 16（Presentation 実装。
                                                                    13→15→16 の順で型を通す。
                                                                    13 単体では StoreGroup 未更新のため
                                                                    型エラーが出うる点に注意）
                                                                    └─→ Step 14（purchase-input-form。
                                                                          Step 13 と独立で並行可）
                                                                    └─→ Step 17, 18, 19, 20
                                                                          （Presentation テスト。
                                                                          対応する実装ステップ完了後）
                                                                          └─→ Step 21, 22（ドキュメント。
                                                                                実装完了後いつでも可、
                                                                                他ステップと並行可）
                                                                                └─→ Step 23（品質ゲート）
```

Step 21・22（ドキュメント更新）は実装本体に依存しないため、実装と並行して着手してよい。ただし
Step 22 の文言は Step 1 の実装が確定してから記述する（メソッドシグネチャの記述に齟齬が出ないようにするため）。

---

## テスト計画

Vitest。既存の vitest include パターン（`packages/domain` / `packages/application` /
`packages/api-contract` は `**/*.test.ts`、`apps/web` は `src/**/*.dom.test.ts` /
`src/**/*.test.tsx`（happy-dom）と `src/server/**/*.test.ts`（node））と整合する既存ファイルの
み変更するため、新規テストファイルは作成しない。

| レイヤー     | ファイル                                                                    | 追加/変更内容                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain       | `packages/domain/src/shopping-list/shopping-list.test.ts`                   | `check()`/`uncheck()` の正常系・異常系 10 ケース                                                                                                      |
| Application  | `packages/application/src/shopping-list/shopping-list-use-cases.test.ts`    | `SetItemCheckedUseCase` の正常系・冪等系・異常系 7 ケース                                                                                             |
| Application  | `packages/application/src/shopping-list/complete-shopping.use-case.test.ts` | `actualPrice === null` の価格記録スキップ回帰ケース 1 件                                                                                              |
| api-contract | `packages/api-contract/src/shopping-list.schema.test.ts`                    | `setItemCheckedSchema` の受理/拒否 6 ケース                                                                                                           |
| apps/web     | `apps/web/src/server/routes/shopping-lists.test.ts`                         | `/checked` ルートの 200/400×4/404×2/422/冪等性 の 9 ケース                                                                                            |
| apps/web     | `apps/web/src/app/shopping-lists/_components/shopping-item-row.test.tsx`    | IR-06 分割・IR-09/10 更新・IR-12〜14 追加（旧 IR-12 削除）                                                                                            |
| apps/web     | `apps/web/src/app/shopping-lists/_components/purchase-input-form.test.tsx`  | 文言変更に伴うアサーション更新 2 件                                                                                                                   |
| apps/web     | `apps/web/src/app/shopping-lists/_components/store-group.test.tsx`          | `defaults` に `onSetChecked` 追加（型エラー回避）、推奨 SG-05 追加                                                                                    |
| apps/web     | `apps/web/src/app/shopping-lists/_components/shopping-list-client.test.tsx` | `postChecked` モック追加、`LC-04` の置き換え、LC-05/06/07/08/17/18/21 書き換え、LC-24〜28 新規（LC-23 は欠番。LC-28 は reviewer Should-2 対応で追記） |

---

## リスク

| ID  | リスク                                                                                                                                                                           | 影響                                                                             | 対策                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | `shopping-list-client.test.tsx` の既存 LC-05〜08/17/18/21 の書き換えで意図せず検証観点が漏れる（特にロールバック確認の指標を `aria-checked` から価格表示テキストへ切り替える点） | 楽観的更新のロールバックが未検証のまま regression になる                         | Step 20 の指定どおり `screen.getByText('✓ 店舗A で ¥198 購入')` の出現/消失で確認する。書き換え後は元テストと同じ「成功時に表示・失敗時に消える」構造を維持する |
| R-2 | `shopping-item-row.tsx` の「金額を記録」ボタン配置がレイアウトを崩す（特に狭い画面幅）                                                                                           | 見た目の軽微な劣化                                                               | Step 13 の配置（テキスト情報ブロック内、`actualPrice` 行の直後）は既存の `text-xs text-muted-foreground` パターンを踏襲。実装後に手動でモバイル幅表示を確認する |
| R-3 | `docs/designs/shopping-list-screens.md` の行番号（L56/L103/L631/L664）が本計画作成後の他編集でずれる                                                                             | 誤った箇所を編集してしまう                                                       | Step 21 実施時に `grep -n "S-3"` 等で該当箇所を再検索してから編集する（本計画にも明記済み）                                                                     |
| R-4 | `SetItemCheckedUseCase` の冪等ガードにより `save()` が no-op でも呼ばれる仕様を実装者が「無駄な書き込み」と誤解し、勝手にスキップする最適化を加えてしまう                        | 設計書の明示的な仕様（無条件 save）からの逸脱                                    | Step 4 のコード例に「注意点」として明記済み。実装時はコード例をそのまま踏襲する                                                                                 |
| R-5 | `store-group.test.tsx` への `onSetChecked` 追加漏れにより型エラーで CI が落ちる                                                                                                  | Step 19 を飛ばすと `pnpm type-check` が失敗する                                  | Step 15（`store-group.tsx` の Props 変更）と Step 19（テストの defaults 更新）を同一コミットで行う                                                              |
| R-6 | `shopping-list-client.test.tsx` の `LC-04` を置き換える際、旧テスト本文の削除漏れで新旧 2 つの `it('LC-04: ...')` が残ってしまう                                                 | 旧仕様の検証が残存し CI が意図せず落ちる、または旧仕様のまま regression を見逃す | Step 20-2 の指示どおり「旧内容を削除し置き換える」ことを実装時に diff で確認する（新規追加ではない点に注意）                                                    |

---

## ロールバック方法

各層は独立してリバートできる（既存 `markAsBought` 系は無変更のため、ロールバックは追加分の除去のみで完結する。ADR-0009 §Rollback と同一方針）。

1. **Domain（Step 1-2）**: `shopping-list.ts` から `check()`/`uncheck()`（`ShoppingItem`・
   `ShoppingList` 両方）を削除し、`shopping-list.test.ts` の追加テストを削除する。
2. **Application（Step 3-7）**: `set-item-checked.use-case.ts` を削除し、`index.ts` の
   export 行・`shopping-list.dto.ts` の `SetItemCheckedInputDto`・
   `shopping-list-use-cases.test.ts` の `describe('SetItemCheckedUseCase', ...)` ブロック・
   `complete-shopping.use-case.test.ts` の追加 `it.each` エントリを削除する。
3. **api-contract（Step 8-9）**: `setItemCheckedSchema` / `SetItemCheckedBody` と対応する
   テストブロックを削除する。
4. **Hono ルート（Step 11-12）**: `/:id/items/:itemId/checked` ルートブロックと import 2 行、
   対応するテストブロックを削除する（`app.ts` は元々無変更のため触らない）。
5. **Presentation（Step 13-20）**: `shopping-item-row.tsx` のタップ挙動を「即トグル」から元の
   「タップ→展開」に戻し（`onClick` を `onSetChecked` → `onToggleExpand` へ、`aria-label` を
   固定文言へ、`PurchaseInputForm` の表示条件を `{expanded && ...}` へ）、「金額を記録」ボタンを
   削除する。`store-group.tsx` / `shopping-list-client.tsx` から `onSetChecked` /
   `handleSetChecked` を削除する。`purchase-input-form.tsx` の文言を旧文言に戻す。対応する
   テストファイルも同様に旧内容へ戻す（`LC-04` は「チェックでフォームが展開される」という旧内容に
   戻す）。
6. **ドキュメント（Step 21-22）**: `docs/designs/shopping-list-screens.md` の supersede 注記・
   4 箇所の追記を削除し S-3 の結論を復元する。`docs/04-domain-model.md` の実装追記ブロックを削除する。

---

## ドキュメント更新対象

- `docs/designs/shopping-list-screens.md`（Step 21）: S-3 の supersede 注記・4 箇所の追記。
- `docs/04-domain-model.md`（Step 22）: ShoppingList 集約セクションへの実装追記ブロック
  （`check()`/`uncheck()` の追加と `ItemStatus.bought` の意味変化を明記）。実装（Step 1）の
  メソッドシグネチャと記述内容が一致するか、Step 22 実施時に必ず確認する。
- `docs/designs/shopping-list-item-check.md`: ステータスは既に「確定」。実装完了後、必要であれば
  Orchestrator の判断で `実装済み` 等への更新を検討する（本計画のスコープ外）。
- `docs/decisions/ADR-0009-shopping-list-item-check-uncheck.md`: Status は既に Accepted。変更不要。

---

## 手動テスト観点（実装後の動作確認）

| #   | ケース                                       | 手順                                                                            | 期待結果                                                                    |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| M-1 | pending item をタップすると即チェックが付く  | 買い物リスト画面で pending item のチェックボタンをタップ                        | チェックが即座に付き、取り消し線表示になる（フォームは開かない）            |
| M-2 | bought item を再タップするとチェックが外れる | 上記の続きでもう一度チェックボタンをタップ                                      | チェックが即座に外れ、通常表示に戻る                                        |
| M-3 | 「金額を記録」でフォームが開く               | bought item の「金額を記録」ボタンをタップ                                      | `PurchaseInputForm` が展開する（新文言「金額・店舗はあとから...」が見える） |
| M-4 | 価格記録後にチェックを外すと価格表示も消える | M-3 で価格を記録 → チェックボタンを再タップ                                     | pending に戻り、`✓ ... 購入` の表示も消える                                 |
| M-5 | completed リストではチェック操作ができない   | 買い物完了後の画面で pending/bought item のチェックボタンをタップ（存在すれば） | 422 エラーがハンドリングされエラーバナーが表示される、または UI 上操作不可  |

---
