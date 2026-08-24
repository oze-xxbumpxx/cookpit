import { openDB } from 'idb';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShoppingItemDto } from '@cookpit/application';

const { postChecked } = vi.hoisted(() => ({ postChecked: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      'shopping-lists': {
        ':id': {
          items: {
            ':itemId': {
              checked: { $post: (...args: unknown[]) => postChecked(...args) },
            },
          },
        },
      },
    },
  },
}));

import { useCheckedSyncQueue } from '../../../../src/app/shopping-lists/_utils/use-checked-sync-queue';

const ITEM: ShoppingItemDto = {
  id: 'item-1',
  productId: null,
  displayName: '醤油',
  requiredAmount: null,
  amountNote: '1本',
  targetStoreId: null,
  status: 'pending',
  actualPrice: null,
  actualStoreId: null,
  source: 'manually_added',
  pantryDeductedAmount: null,
};

/** DB スキーマを import せず直接レコードを注入する（TTL/attempts の境界値を作るため）。 */
async function seedRawOp(overrides: {
  key: string;
  shoppingListId: string;
  itemId: string;
  checked: boolean;
  enqueuedAt: number;
  attempts: number;
}): Promise<void> {
  const db = await openDB('cookpit-offline-queue', 1, {
    upgrade(database) {
      database.createObjectStore('checkedOps', { keyPath: 'key' });
    },
  });
  await db.put('checkedOps', overrides);
  db.close();
}

describe('useCheckedSyncQueue', () => {
  // postChecked は vi.hoisted で作った単一インスタンスをファイル全体で共有するため、
  // 呼び出し回数・mockImplementation を都度クリアしないと後続テストへ汚染が漏れる
  // （dom project の fake-indexeddb setupFiles とは独立の、mock 側のテスト間分離）。
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UOQ-01: enqueue 呼び出し後、pendingItemIds に itemId が含まれ true を返す', async () => {
    const setItems = vi.fn();
    const onQueueError = vi.fn();
    const { result } = renderHook(() =>
      useCheckedSyncQueue({
        items: [ITEM],
        setItems,
        shoppingListId: 'list-1',
        onQueueError,
      }),
    );

    let queued = false;
    await act(async () => {
      queued = await result.current.enqueue({
        shoppingListId: 'list-1',
        itemId: 'item-1',
        checked: true,
      });
    });

    expect(queued).toBe(true);
    await waitFor(() => {
      expect(result.current.pendingItemIds.has('item-1')).toBe(true);
    });
  });

  it('UOQ-02: 同一 itemId を複数回 enqueue しても pendingItemIds のサイズは 1 のまま（coalesce）', async () => {
    const onQueueError = vi.fn();
    const { result } = renderHook(() =>
      useCheckedSyncQueue({
        items: [ITEM],
        setItems: vi.fn(),
        shoppingListId: 'list-1',
        onQueueError,
      }),
    );

    await act(async () => {
      await result.current.enqueue({
        shoppingListId: 'list-1',
        itemId: 'item-1',
        checked: true,
      });
      await result.current.enqueue({
        shoppingListId: 'list-1',
        itemId: 'item-1',
        checked: false,
      });
      await result.current.enqueue({
        shoppingListId: 'list-1',
        itemId: 'item-1',
        checked: true,
      });
    });

    expect(result.current.pendingItemIds.size).toBe(1);
  });

  it('UOQ-03: flush 成功時、pendingItemIds から除去され setItems が呼ばれる', async () => {
    postChecked.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...ITEM, status: 'bought' }),
    });
    const setItems = vi.fn();
    const onQueueError = vi.fn();
    const { result } = renderHook(() =>
      useCheckedSyncQueue({
        items: [ITEM],
        setItems,
        shoppingListId: 'list-1',
        onQueueError,
      }),
    );
    await act(async () => {
      await result.current.enqueue({
        shoppingListId: 'list-1',
        itemId: 'item-1',
        checked: true,
      });
    });

    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.pendingItemIds.has('item-1')).toBe(false);
    expect(setItems).toHaveBeenCalled();
  });

  it('UOQ-04: flush が 404 を受けるとエラー表示なしでキューから除去される（E-02）', async () => {
    postChecked.mockResolvedValue({ ok: false, status: 404 });
    const onQueueError = vi.fn();
    const { result } = renderHook(() =>
      useCheckedSyncQueue({
        items: [ITEM],
        setItems: vi.fn(),
        shoppingListId: 'list-1',
        onQueueError,
      }),
    );
    await act(async () => {
      await result.current.enqueue({
        shoppingListId: 'list-1',
        itemId: 'item-1',
        checked: true,
      });
    });

    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.pendingItemIds.has('item-1')).toBe(false);
    expect(onQueueError).not.toHaveBeenCalled();
  });

  it('UOQ-05: flush が 422 を受けるとエラー表示ありでキューから除去される（E-01）', async () => {
    postChecked.mockResolvedValue({ ok: false, status: 422 });
    const onQueueError = vi.fn();
    const { result } = renderHook(() =>
      useCheckedSyncQueue({
        items: [ITEM],
        setItems: vi.fn(),
        shoppingListId: 'list-1',
        onQueueError,
      }),
    );
    await act(async () => {
      await result.current.enqueue({
        shoppingListId: 'list-1',
        itemId: 'item-1',
        checked: true,
      });
    });

    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.pendingItemIds.has('item-1')).toBe(false);
    expect(onQueueError).toHaveBeenCalledWith('rejected');
  });

  it('UOQ-06: flush がネットワーク例外を受けるとキューに残る（E-03）', async () => {
    postChecked.mockRejectedValue(new Error('network'));
    const onQueueError = vi.fn();
    const { result } = renderHook(() =>
      useCheckedSyncQueue({
        items: [ITEM],
        setItems: vi.fn(),
        shoppingListId: 'list-1',
        onQueueError,
      }),
    );
    await act(async () => {
      await result.current.enqueue({
        shoppingListId: 'list-1',
        itemId: 'item-1',
        checked: true,
      });
    });

    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.pendingItemIds.has('item-1')).toBe(true);
    expect(onQueueError).not.toHaveBeenCalled();
  });

  it('UOQ-07: attempts が上限（5回）を超えたエントリは破棄される（E-04）', async () => {
    await seedRawOp({
      key: 'list-1:item-1',
      shoppingListId: 'list-1',
      itemId: 'item-1',
      checked: true,
      enqueuedAt: Date.now(),
      attempts: 4,
    });
    postChecked.mockRejectedValue(new Error('network'));
    const onQueueError = vi.fn();
    const { result } = renderHook(() =>
      useCheckedSyncQueue({
        items: [ITEM],
        setItems: vi.fn(),
        shoppingListId: 'list-1',
        onQueueError,
      }),
    );

    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.pendingItemIds.has('item-1')).toBe(false);
    expect(onQueueError).toHaveBeenCalledWith('exhausted');
  });

  it('UOQ-08: enqueuedAt が TTL（24時間）を超えたエントリは送信せず破棄される（E-05）', async () => {
    await seedRawOp({
      key: 'list-1:item-1',
      shoppingListId: 'list-1',
      itemId: 'item-1',
      checked: true,
      enqueuedAt: Date.now() - 25 * 60 * 60 * 1000,
      attempts: 0,
    });
    const onQueueError = vi.fn();
    const { result } = renderHook(() =>
      useCheckedSyncQueue({
        items: [ITEM],
        setItems: vi.fn(),
        shoppingListId: 'list-1',
        onQueueError,
      }),
    );

    await act(async () => {
      await result.current.flush();
    });

    expect(postChecked).not.toHaveBeenCalled();
    expect(result.current.pendingItemIds.has('item-1')).toBe(false);
  });

  // レビュー指摘 S4: UOQ-08 は TTL 超過側のみの検証だったため、TTL 未満（まだ再送対象）側の
  // 境界も別途固定する（docs/reviews/offline-write-queue.md S4）。
  it('UOQ-08b: enqueuedAt が TTL（24時間）未満のエントリは送信対象のまま残る', async () => {
    await seedRawOp({
      key: 'list-1:item-1',
      shoppingListId: 'list-1',
      itemId: 'item-1',
      checked: true,
      enqueuedAt: Date.now() - (24 * 60 * 60 * 1000 - 1000),
      attempts: 0,
    });
    postChecked.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ITEM,
    });
    const onQueueError = vi.fn();
    const { result } = renderHook(() =>
      useCheckedSyncQueue({
        items: [ITEM],
        setItems: vi.fn(),
        shoppingListId: 'list-1',
        onQueueError,
      }),
    );

    await act(async () => {
      await result.current.flush();
    });

    expect(postChecked).toHaveBeenCalledTimes(1);
    expect(result.current.pendingItemIds.has('item-1')).toBe(false);
  });

  it('UOQ-09: 複数エントリのうち一部の失敗が他エントリの処理を止めない', async () => {
    await seedRawOp({
      key: 'list-1:item-1',
      shoppingListId: 'list-1',
      itemId: 'item-1',
      checked: true,
      enqueuedAt: Date.now(),
      attempts: 0,
    });
    await seedRawOp({
      key: 'list-1:item-2',
      shoppingListId: 'list-1',
      itemId: 'item-2',
      checked: true,
      enqueuedAt: Date.now(),
      attempts: 0,
    });
    postChecked.mockImplementation(async (args: { param: { itemId: string } }) => {
      if (args.param.itemId === 'item-1') {
        return { ok: true, status: 200, json: async () => ({ ...ITEM, id: 'item-1' }) };
      }
      throw new Error('network');
    });
    const onQueueError = vi.fn();
    const { result } = renderHook(() =>
      useCheckedSyncQueue({
        items: [ITEM, { ...ITEM, id: 'item-2' }],
        setItems: vi.fn(),
        shoppingListId: 'list-1',
        onQueueError,
      }),
    );

    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.pendingItemIds.has('item-1')).toBe(false);
    expect(result.current.pendingItemIds.has('item-2')).toBe(true);
  });

  it('UOQ-10: 同時 flush は排他制御され postChecked は 1 回のみ呼ばれる', async () => {
    let resolvePost: (value: {
      ok: boolean;
      status: number;
      json: () => Promise<unknown>;
    }) => void = () => {};
    postChecked.mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      }),
    );
    const onQueueError = vi.fn();
    const { result } = renderHook(() =>
      useCheckedSyncQueue({
        items: [ITEM],
        setItems: vi.fn(),
        shoppingListId: 'list-1',
        onQueueError,
      }),
    );
    await act(async () => {
      await result.current.enqueue({
        shoppingListId: 'list-1',
        itemId: 'item-1',
        checked: true,
      });
    });

    // fake-indexeddb の IDBRequest はマイクロタスクではなくタスク（マクロタスク相当）で
    // 解決するため（docs/reviews/offline-write-queue.md M1 と同根の性質）、1 回目の flush()
    // が postChecked 呼び出しに到達するタイミングは act() の単純な await では保証できない。
    // waitFor でポーリングして確実に「1 回目が postChecked に到達した後」で 2 回目を呼ぶ。
    let firstFlush: Promise<void> = Promise.resolve();
    act(() => {
      firstFlush = result.current.flush();
    });

    await waitFor(() => {
      expect(postChecked).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.flush();
    });

    expect(postChecked).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePost({ ok: true, status: 200, json: async () => ITEM });
      await firstFlush;
    });
  });

  it('UOQ-11: 空キューでの flush は postChecked を呼ばない', async () => {
    const onQueueError = vi.fn();
    const { result } = renderHook(() =>
      useCheckedSyncQueue({
        items: [ITEM],
        setItems: vi.fn(),
        shoppingListId: 'list-1',
        onQueueError,
      }),
    );

    await act(async () => {
      await result.current.flush();
    });

    expect(postChecked).not.toHaveBeenCalled();
  });

  it('UOQ-12: IndexedDB が使えない環境では enqueue が false を返し flush も no-op になる（E-06）', async () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error テストのため意図的に未定義にする
    globalThis.indexedDB = undefined;
    const setItems = vi.fn();
    const onQueueError = vi.fn();
    const { result } = renderHook(() =>
      useCheckedSyncQueue({
        items: [ITEM],
        setItems,
        shoppingListId: 'list-1',
        onQueueError,
      }),
    );

    let queued = true;
    await act(async () => {
      queued = await result.current.enqueue({
        shoppingListId: 'list-1',
        itemId: 'item-1',
        checked: true,
      });
      await result.current.flush();
    });

    expect(queued).toBe(false);
    expect(result.current.pendingItemIds.size).toBe(0);
    expect(setItems).not.toHaveBeenCalled();
    expect(onQueueError).not.toHaveBeenCalled();
    globalThis.indexedDB = original;
  });

  it('UOQ-13: 失敗後も次回の flush で再送対象のまま成功しうる', async () => {
    postChecked.mockRejectedValueOnce(new Error('network'));
    const onQueueError = vi.fn();
    const { result } = renderHook(() =>
      useCheckedSyncQueue({
        items: [ITEM],
        setItems: vi.fn(),
        shoppingListId: 'list-1',
        onQueueError,
      }),
    );
    await act(async () => {
      await result.current.enqueue({
        shoppingListId: 'list-1',
        itemId: 'item-1',
        checked: true,
      });
      await result.current.flush();
    });
    expect(result.current.pendingItemIds.has('item-1')).toBe(true);

    postChecked.mockResolvedValue({ ok: true, status: 200, json: async () => ITEM });
    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.pendingItemIds.has('item-1')).toBe(false);
  });

  it('UOQ-14: flush 中に response.json() が失敗した場合は成功扱いにせずキューに残す', async () => {
    postChecked.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('invalid json')),
    });
    const setItems = vi.fn();
    const onQueueError = vi.fn();
    const { result } = renderHook(() =>
      useCheckedSyncQueue({
        items: [ITEM],
        setItems,
        shoppingListId: 'list-1',
        onQueueError,
      }),
    );
    await act(async () => {
      await result.current.enqueue({
        shoppingListId: 'list-1',
        itemId: 'item-1',
        checked: true,
      });
    });

    await act(async () => {
      await result.current.flush();
    });

    expect(result.current.pendingItemIds.has('item-1')).toBe(true);
    expect(setItems).not.toHaveBeenCalled();
  });
});
