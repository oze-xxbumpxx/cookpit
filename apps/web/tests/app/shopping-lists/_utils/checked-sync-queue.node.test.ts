import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  bumpAttempts,
  deleteCheckedOp,
  enqueueCheckedOp,
  listCheckedOps,
} from '../../../../src/app/shopping-lists/_utils/checked-sync-queue';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('checked-sync-queue', () => {
  it('OQ-01: enqueueCheckedOp → listCheckedOps で往復し、同一内容が読める', async () => {
    await enqueueCheckedOp({
      key: 'list-1:item-1',
      shoppingListId: 'list-1',
      itemId: 'item-1',
      checked: true,
    });

    const ops = await listCheckedOps();

    expect(ops).toEqual([
      {
        key: 'list-1:item-1',
        shoppingListId: 'list-1',
        itemId: 'item-1',
        checked: true,
        enqueuedAt: expect.any(Number),
        attempts: 0,
      },
    ]);
  });

  it('OQ-02: 同一 key で 2 回 enqueueCheckedOp すると 1 件に上書きされる（P-1 の coalesce）', async () => {
    await enqueueCheckedOp({
      key: 'list-1:item-1',
      shoppingListId: 'list-1',
      itemId: 'item-1',
      checked: true,
    });
    await enqueueCheckedOp({
      key: 'list-1:item-1',
      shoppingListId: 'list-1',
      itemId: 'item-1',
      checked: false,
    });

    const ops = await listCheckedOps();

    expect(ops).toHaveLength(1);
    expect(ops[0]?.checked).toBe(false);
  });

  it('OQ-03: enqueue 時のデフォルト値（enqueuedAt/attempts）が防御的に初期化される', async () => {
    const before = Date.now();

    await enqueueCheckedOp({
      key: 'list-1:item-1',
      shoppingListId: 'list-1',
      itemId: 'item-1',
      checked: true,
    });

    const after = Date.now();
    const ops = await listCheckedOps();
    expect(ops[0]?.attempts).toBe(0);
    expect(ops[0]?.enqueuedAt).toBeGreaterThanOrEqual(before);
    expect(ops[0]?.enqueuedAt).toBeLessThanOrEqual(after);
  });

  it('OQ-04: deleteCheckedOp 後は listCheckedOps に含まれない', async () => {
    await enqueueCheckedOp({
      key: 'list-1:item-1',
      shoppingListId: 'list-1',
      itemId: 'item-1',
      checked: true,
    });

    await deleteCheckedOp('list-1:item-1');

    expect(await listCheckedOps()).toEqual([]);
  });

  it('OQ-05: 存在しない key への deleteCheckedOp は例外を投げない', async () => {
    await expect(deleteCheckedOp('missing:missing')).resolves.toBeUndefined();
  });

  it('OQ-06: bumpAttempts で attempts が増加する', async () => {
    await enqueueCheckedOp({
      key: 'list-1:item-1',
      shoppingListId: 'list-1',
      itemId: 'item-1',
      checked: true,
    });

    await bumpAttempts('list-1:item-1');
    await bumpAttempts('list-1:item-1');

    const ops = await listCheckedOps();
    expect(ops[0]?.attempts).toBe(2);
  });

  it('OQ-07: 存在しない key への bumpAttempts は例外を投げず新規作成もしない', async () => {
    await bumpAttempts('missing:missing');

    expect(await listCheckedOps()).toEqual([]);
  });

  it('OQ-08: 別リストの同一 itemId は別エントリとして扱われる（複合キー）', async () => {
    await enqueueCheckedOp({
      key: 'list-1:item-1',
      shoppingListId: 'list-1',
      itemId: 'item-1',
      checked: true,
    });
    await enqueueCheckedOp({
      key: 'list-2:item-1',
      shoppingListId: 'list-2',
      itemId: 'item-1',
      checked: true,
    });

    expect(await listCheckedOps()).toHaveLength(2);
  });

  it('OQ-09: 空ストアでの listCheckedOps は空配列を返す', async () => {
    expect(await listCheckedOps()).toEqual([]);
  });

  it('OQ-10: 異なる key の並行 enqueue は互いに破壊しない', async () => {
    await Promise.all([
      enqueueCheckedOp({
        key: 'list-1:item-1',
        shoppingListId: 'list-1',
        itemId: 'item-1',
        checked: true,
      }),
      enqueueCheckedOp({
        key: 'list-1:item-2',
        shoppingListId: 'list-1',
        itemId: 'item-2',
        checked: false,
      }),
    ]);

    expect(await listCheckedOps()).toHaveLength(2);
  });

  it('indexedDB が未宣言の環境では例外を投げて呼び出し側へ伝える（Orchestrator 確定要求 1(a)）', async () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error テストのため意図的に未定義にする
    globalThis.indexedDB = undefined;

    await expect(
      enqueueCheckedOp({
        key: 'list-1:item-1',
        shoppingListId: 'list-1',
        itemId: 'item-1',
        checked: true,
      }),
    ).rejects.toThrow('indexedDB is not available in this environment');

    globalThis.indexedDB = original;
  });
});
