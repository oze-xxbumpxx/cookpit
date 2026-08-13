import { openDB } from 'idb';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createShoppingItemDto,
  createShoppingListDto,
  PRODUCTS,
  STORES,
} from './shopping-list-test-fixtures';

const { getShoppingList, postChecked } = vi.hoisted(() => ({
  getShoppingList: vi.fn(),
  postChecked: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      'shopping-lists': {
        ':id': {
          $get: (...args: unknown[]) => getShoppingList(...args),
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

import { enqueueCheckedOp } from '../../../../src/app/shopping-lists/_utils/checked-sync-queue';
import { ShoppingListClient } from '../../../../src/app/shopping-lists/_components/shopping-list-client';

/** Step 3 時点では store-group.tsx/shopping-item-row.tsx の unsynced 中継（Step 4）が
 * 未実装のため、行単位の「未送信」表示は検証できない。代わりに画面上部のバナー・
 * aria-checked の持続・postChecked の呼び出し内容/回数で pendingItemIds の挙動を検証する。
 */
const OFFLINE_QUEUE_BANNER =
  'オフライン中の変更があります。オンラインになると自動的に送信されます。';
const COMPLETED_REJECTED_TEXT = '買い物完了後は変更できません。「買い物を再開」してください。';
const QUEUE_SYNC_FAILED_TEXT =
  '同期できなかった変更があります。品目を確認し、もう一度操作してください。';

const TTL_MS = 24 * 60 * 60 * 1000;

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

describe('ShoppingListClient（オフライン書き込みキュー結合シナリオ）', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('LCQ-01: オフラインでチェック後、チェック状態が保持されバナーが出る（未同期の行表示は Step 4 で検証）', async () => {
    const user = userEvent.setup();
    postChecked.mockRejectedValue(new Error('network'));
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
      expect(screen.getByText(OFFLINE_QUEUE_BANNER)).toBeDefined();
    });
  });

  it('LCQ-02: 複数品目のオフライン操作。両方ともチェック状態が保持される', async () => {
    const user = userEvent.setup();
    postChecked.mockRejectedValue(new Error('network'));
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' }),
        createShoppingItemDto({ id: 'item-2', displayName: '味噌', status: 'pending' }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });
    await user.click(screen.getByRole('checkbox', { name: /味噌/ }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
      expect(screen.getByRole('checkbox', { name: /味噌/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
      expect(screen.getByText(OFFLINE_QUEUE_BANNER)).toBeDefined();
    });
  });

  it('LCQ-03: 同一品目の複数回トグルはオンライン復帰後 1 回のみ再送される（coalesce）', async () => {
    const user = userEvent.setup();
    postChecked.mockRejectedValue(new Error('network'));
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);
    const checkbox = screen.getByRole('checkbox', { name: /醤油/ });

    await user.click(checkbox); // checked: true
    await waitFor(() => expect(checkbox.getAttribute('aria-checked')).toBe('true'));
    await user.click(checkbox); // checked: false
    await waitFor(() => expect(checkbox.getAttribute('aria-checked')).toBe('false'));
    await user.click(checkbox); // checked: true（最終的な意図）
    await waitFor(() => expect(checkbox.getAttribute('aria-checked')).toBe('true'));

    postChecked.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'bought' }),
    });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(postChecked).toHaveBeenCalledWith({
        param: { id: shoppingList.id, itemId: 'item-1' },
        json: { checked: true },
      });
    });
    expect(postChecked).toHaveBeenCalledTimes(4); // 3回のオフライン試行 + 再送1回
  });

  it('LCQ-04: online イベントで flush され、成功した品目のバナーが消える', async () => {
    const user = userEvent.setup();
    postChecked.mockRejectedValueOnce(new Error('network'));
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);
    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
    await waitFor(() => {
      expect(screen.getByText(OFFLINE_QUEUE_BANNER)).toBeDefined();
    });

    postChecked.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'bought' }),
    });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(screen.queryByText(OFFLINE_QUEUE_BANNER)).toBeNull();
    });
  });

  it('LCQ-05: focus イベントでは flush が handleRefetch より先に完了する（P-4）', async () => {
    const user = userEvent.setup();
    const callOrder: string[] = [];
    postChecked.mockImplementation(async () => {
      callOrder.push('checked');
      return {
        ok: true,
        status: 200,
        json: async () =>
          createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'bought' }),
      };
    });
    getShoppingList.mockImplementation(async () => {
      callOrder.push('refetch');
      return { ok: true, json: async () => createShoppingListDto() };
    });
    postChecked.mockRejectedValueOnce(new Error('network')); // まずネットワーク例外でキューへ積む
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);
    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
    await waitFor(() => {
      expect(screen.getByText(OFFLINE_QUEUE_BANNER)).toBeDefined();
    });

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(callOrder).toEqual(['checked', 'refetch']);
    });
  });

  it('LCQ-06: flush 未完了のまま handleRefetch が成功しても、pendingItemIds の品目はサーバー値で上書きされない（P-4）', async () => {
    const user = userEvent.setup();
    postChecked.mockRejectedValue(new Error('network')); // flush してもずっと失敗し続ける
    getShoppingList.mockResolvedValue({
      ok: true,
      json: async () =>
        createShoppingListDto({
          items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
        }),
    });
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);
    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
    await waitFor(() => {
      expect(screen.getByText(OFFLINE_QUEUE_BANNER)).toBeDefined();
    });

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(getShoppingList).toHaveBeenCalled();
    });
    // サーバーは pending を返すが、ローカルの未同期な「チェック済み」表示が優先される
    expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });

  it('LCQ-07: flush 中の一部失敗が他エントリの処理を止めない（部分失敗）', async () => {
    const user = userEvent.setup();
    postChecked.mockRejectedValue(new Error('network'));
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' }),
        createShoppingItemDto({ id: 'item-2', displayName: '味噌', status: 'pending' }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);
    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    );
    await user.click(screen.getByRole('checkbox', { name: /味噌/ }));
    await waitFor(() => {
      expect(screen.getByText(OFFLINE_QUEUE_BANNER)).toBeDefined();
    });

    postChecked.mockImplementation(async (args: { param: { itemId: string } }) => {
      if (args.param.itemId === 'item-1') {
        return {
          ok: true,
          status: 200,
          json: async () =>
            createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'bought' }),
        };
      }
      throw new Error('network');
    });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(postChecked).toHaveBeenCalledWith(
        expect.objectContaining({ param: { id: shoppingList.id, itemId: 'item-1' } }),
      );
      expect(postChecked).toHaveBeenCalledWith(
        expect.objectContaining({ param: { id: shoppingList.id, itemId: 'item-2' } }),
      );
    });
    // item-2 は再送に失敗し続けているため、未同期バナーは残る
    expect(screen.getByText(OFFLINE_QUEUE_BANNER)).toBeDefined();
  });

  it('LCQ-08: flush 実行中に再度ネットワークが失われても、後続エントリの再送試行は止まらない', async () => {
    const user = userEvent.setup();
    postChecked.mockRejectedValue(new Error('network'));
    const shoppingList = createShoppingListDto({
      items: [
        createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' }),
        createShoppingItemDto({ id: 'item-2', displayName: '味噌', status: 'pending' }),
        createShoppingItemDto({ id: 'item-3', displayName: '塩', status: 'pending' }),
      ],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);
    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    );
    await user.click(screen.getByRole('checkbox', { name: /味噌/ }));
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /味噌/ }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    );
    await user.click(screen.getByRole('checkbox', { name: /塩/ }));
    await waitFor(() => {
      expect(screen.getByText(OFFLINE_QUEUE_BANNER)).toBeDefined();
    });

    let callCount = 0;
    postChecked.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'bought' }),
        };
      }
      throw new Error('network'); // 2件目以降は再びオフラインになったとみなす
    });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    // item-1 で成功した後も item-2/item-3 への送信試行が止まらないこと（1件の途中失敗が
    // 後続の処理を止めない。UOQ-09 の結合版）
    await waitFor(() => {
      expect(postChecked).toHaveBeenCalledWith(
        expect.objectContaining({ param: { id: shoppingList.id, itemId: 'item-3' } }),
      );
    });
  });

  it('LCQ-09（最重要）: response.json() の失敗をオフラインと誤判定せず、キューに積まない', async () => {
    const user = userEvent.setup();
    postChecked.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('invalid json')),
    });
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    await waitFor(() => {
      // オフラインと誤判定していれば aria-checked は 'true' のまま・バナーが出るはずだが、
      // 正しくは一般失敗として扱われ、楽観値は変化していない確定 state（pending）へ収束する。
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'false',
      );
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
      expect(screen.queryByText(OFFLINE_QUEUE_BANNER)).toBeNull();
    });

    // キューに積まれていないため、online イベントを発火しても再送は発生しない
    // （postChecked の呼び出しは最初の 1 回のみ）。
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(postChecked).toHaveBeenCalledTimes(1);
  });

  it('LCQ-10a: TTL（24時間）未満のエントリは online イベントで送信される', async () => {
    await seedRawOp({
      key: 'shopping-list-1:item-1',
      shoppingListId: 'shopping-list-1',
      itemId: 'item-1',
      checked: true,
      enqueuedAt: Date.now() - (TTL_MS - 1000),
      attempts: 0,
    });
    postChecked.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'bought' }),
    });
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(postChecked).toHaveBeenCalledWith({
        param: { id: shoppingList.id, itemId: 'item-1' },
        json: { checked: true },
      });
    });
  });

  it('LCQ-10b: TTL（24時間）超過のエントリは送信を試みずに破棄される', async () => {
    await seedRawOp({
      key: 'shopping-list-1:item-1',
      shoppingListId: 'shopping-list-1',
      itemId: 'item-1',
      checked: true,
      enqueuedAt: Date.now() - (TTL_MS + 1000),
      attempts: 0,
    });
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(screen.queryByText(OFFLINE_QUEUE_BANNER)).toBeNull();
    });
    expect(postChecked).not.toHaveBeenCalled();
  });

  it('LCQ-11: 再送上限（5回）に到達したエントリは破棄されエラー表示される（E-04）', async () => {
    await seedRawOp({
      key: 'shopping-list-1:item-1',
      shoppingListId: 'shopping-list-1',
      itemId: 'item-1',
      checked: true,
      enqueuedAt: Date.now(),
      attempts: 4,
    });
    postChecked.mockRejectedValue(new Error('network'));
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(screen.queryByText(OFFLINE_QUEUE_BANNER)).toBeNull();
      expect(screen.getByText(QUEUE_SYNC_FAILED_TEXT)).toBeDefined();
    });
  });

  it('LCQ-12: マウント時に前セッションの残留キューが自動的に再送される（FR-5/N-06）', async () => {
    await enqueueCheckedOp({
      key: 'shopping-list-1:item-1',
      shoppingListId: 'shopping-list-1',
      itemId: 'item-1',
      checked: true,
    });
    postChecked.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'bought' }),
    });
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    await waitFor(() => {
      expect(postChecked).toHaveBeenCalledWith({
        param: { id: shoppingList.id, itemId: 'item-1' },
        json: { checked: true },
      });
    });
  });

  it('LCQ-13: flush が 422 を受けるとエラー表示ありでキューから除去される（E-01）', async () => {
    const user = userEvent.setup();
    postChecked.mockRejectedValueOnce(new Error('network'));
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);
    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
    await waitFor(() => {
      expect(screen.getByText(OFFLINE_QUEUE_BANNER)).toBeDefined();
    });

    postChecked.mockResolvedValue({ ok: false, status: 422 });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(screen.queryByText(OFFLINE_QUEUE_BANNER)).toBeNull();
      expect(screen.getByText(COMPLETED_REJECTED_TEXT)).toBeDefined();
    });
  });

  it('LCQ-14: flush が 404 を受けるとエラー表示なしでキューから除去される（E-02）', async () => {
    const user = userEvent.setup();
    postChecked.mockRejectedValueOnce(new Error('network'));
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);
    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
    await waitFor(() => {
      expect(screen.getByText(OFFLINE_QUEUE_BANNER)).toBeDefined();
    });

    postChecked.mockResolvedValue({ ok: false, status: 404 });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(screen.queryByText(OFFLINE_QUEUE_BANNER)).toBeNull();
    });
    expect(screen.queryByText('操作に失敗しました。')).toBeNull();
    expect(screen.queryByText(COMPLETED_REJECTED_TEXT)).toBeNull();
  });

  it('LCQ-15: flush が 5xx を受けるとネットワーク例外と同様にキューに残る（P-5）', async () => {
    const user = userEvent.setup();
    postChecked.mockRejectedValueOnce(new Error('network'));
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);
    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
    await waitFor(() => {
      expect(screen.getByText(OFFLINE_QUEUE_BANNER)).toBeDefined();
    });

    postChecked.mockResolvedValue({ ok: false, status: 500 });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(postChecked).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText(OFFLINE_QUEUE_BANNER)).toBeDefined();
  });

  it('LCQ-16: LWW 容認の固定。オフライン中の自分の意図がそのまま再送される（P-9/E-07）', async () => {
    const user = userEvent.setup();
    postChecked.mockRejectedValueOnce(new Error('network'));
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
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    // オフラインでチェックを外す（自分の意図: pending に戻す）
    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
    await waitFor(() => {
      expect(screen.getByText(OFFLINE_QUEUE_BANNER)).toBeDefined();
    });

    // サーバーが（直前の別ユーザー操作等で）どう変化していたかは確認せず、自分の意図
    // （checked:false）をそのまま送信する（LWW。バグではなく設計の容認事項）
    postChecked.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' }),
    });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(postChecked).toHaveBeenCalledWith({
        param: { id: shoppingList.id, itemId: 'item-1' },
        json: { checked: false },
      });
    });
  });

  it('LCQ-17: 空キューでの online イベントは postChecked を呼ばない', async () => {
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(postChecked).not.toHaveBeenCalled();
  });

  it('LCQ-18: 未同期が 1 件以上ある間バナーが表示される', async () => {
    const user = userEvent.setup();
    postChecked.mockRejectedValue(new Error('network'));
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    expect(screen.queryByText(OFFLINE_QUEUE_BANNER)).toBeNull();

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    await waitFor(() => {
      expect(screen.getByText(OFFLINE_QUEUE_BANNER)).toBeDefined();
    });
  });

  it('LCQ-19: 未同期件数が 0 になるとバナーが消える（回帰）', async () => {
    const user = userEvent.setup();
    postChecked.mockRejectedValueOnce(new Error('network'));
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);
    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
    await waitFor(() => {
      expect(screen.getByText(OFFLINE_QUEUE_BANNER)).toBeDefined();
    });

    postChecked.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'bought' }),
    });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(screen.queryByText(OFFLINE_QUEUE_BANNER)).toBeNull();
    });
  });

  it('LCQ-EX（Orchestrator 確定要求 2 の検証）: IndexedDB が使えない環境ではネットワーク例外時に従来どおりロールバックされる（E-06）', async () => {
    const user = userEvent.setup();
    const originalIndexedDb = globalThis.indexedDB;
    // @ts-expect-error テストのため意図的に未定義にする
    globalThis.indexedDB = undefined;
    // 即座に reject すると楽観的更新（aria-checked=true）が観測できる前に transition が
    // 終了しロールバック後の値しか見えない。中間状態を確実に観測するため遅延させる。
    postChecked.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error('network')), 50);
        }),
    );
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'false',
      );
      expect(screen.getByText('通信エラーが発生しました。')).toBeDefined();
      expect(screen.queryByText(OFFLINE_QUEUE_BANNER)).toBeNull();
    });

    globalThis.indexedDB = originalIndexedDb;
  });
});
