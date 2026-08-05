import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createShoppingItemDto,
  createShoppingListDto,
  PRODUCTS,
  STORES,
} from './shopping-list-test-fixtures';

const { getShoppingList, postItem, postBought, postChecked, postTargetStore, deleteItem } =
  vi.hoisted(() => ({
    getShoppingList: vi.fn(),
    postItem: vi.fn(),
    postBought: vi.fn(),
    postChecked: vi.fn(),
    postTargetStore: vi.fn(),
    deleteItem: vi.fn(),
  }));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      'shopping-lists': {
        ':id': {
          $get: (...args: unknown[]) => getShoppingList(...args),
          items: {
            $post: (...args: unknown[]) => postItem(...args),
            ':itemId': {
              $delete: (...args: unknown[]) => deleteItem(...args),
              bought: { $post: (...args: unknown[]) => postBought(...args) },
              checked: { $post: (...args: unknown[]) => postChecked(...args) },
              'target-store': { $post: (...args: unknown[]) => postTargetStore(...args) },
            },
          },
        },
      },
    },
  },
}));

import { ShoppingListClient } from '../../../../src/app/shopping-lists/_components/shopping-list-client';

const SOY_SAUCE = createShoppingItemDto({
  id: 'item-1',
  displayName: '醤油',
  source: 'manually_added',
});
const ONION = createShoppingItemDto({
  id: 'item-2',
  displayName: '玉ねぎ',
  source: 'from_meal_plan',
});

function renderList(items = [SOY_SAUCE, ONION], status: 'active' | 'completed' = 'active') {
  const shoppingList = createShoppingListDto({ items, status });
  render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);
  return shoppingList;
}

async function requestRemove(displayName: string): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: `${displayName}を削除` }));
}

async function confirmRemove(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '削除する' }));
}

describe('ShoppingListClient（品目削除）', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('SDL-01: 各行に削除ボタンが描画される', () => {
    renderList();

    expect(screen.getByRole('button', { name: '醤油を削除' })).toBeDefined();
    expect(screen.getByRole('button', { name: '玉ねぎを削除' })).toBeDefined();
  });

  it('SDL-02: 削除ボタンを押すと確認ダイアログが開き、API はまだ呼ばれない', async () => {
    renderList();

    await requestRemove('醤油');

    expect(screen.getByText('醤油を削除しますか？')).toBeDefined();
    expect(deleteItem).not.toHaveBeenCalled();
  });

  it('SDL-03: 「削除する」で行が消え、$delete が正しい param で呼ばれる', async () => {
    deleteItem.mockResolvedValue({ ok: true, status: 204 });
    const shoppingList = renderList();

    await requestRemove('醤油');
    await confirmRemove();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '醤油を削除' })).toBeNull();
    });
    expect(deleteItem).toHaveBeenCalledWith({
      param: { id: shoppingList.id, itemId: 'item-1' },
    });
    expect(screen.getByRole('button', { name: '玉ねぎを削除' })).toBeDefined();
  });

  it('SDL-04: 「キャンセル」では削除されず API も呼ばれない', async () => {
    const user = userEvent.setup();
    renderList();

    await requestRemove('醤油');
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(deleteItem).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '醤油を削除' })).toBeDefined();
  });

  it('SDL-05: 500 では行が戻りエラーバナーが出る', async () => {
    deleteItem.mockResolvedValue({ ok: false, status: 500 });
    renderList();

    await requestRemove('醤油');
    await confirmRemove();

    // 楽観削除の巻き戻しはエラーバナー表示とは別コミットで反映されるため、
    // 行の復帰も waitFor の中で待つ（外に置くとまれに巻き戻し前に評価されて落ちる）。
    await waitFor(() => {
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
      expect(screen.getByRole('button', { name: '醤油を削除' })).toBeDefined();
    });
  });

  it('SDL-06: 422 では回復導線つきの文言が出る', async () => {
    deleteItem.mockResolvedValue({ ok: false, status: 422 });
    renderList();

    await requestRemove('醤油');
    await confirmRemove();

    await waitFor(() => {
      expect(
        screen.getByText('買い物完了後は変更できません。「買い物を再開」してください。'),
      ).toBeDefined();
    });
    expect(screen.getByRole('button', { name: '醤油を削除' })).toBeDefined();
  });

  it('SDL-07: 404 は成功として扱い、行が消えてエラーバナーを出さない', async () => {
    deleteItem.mockResolvedValue({ ok: false, status: 404 });
    renderList();

    await requestRemove('醤油');
    await confirmRemove();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '醤油を削除' })).toBeNull();
    });
    expect(screen.queryByText('操作に失敗しました。')).toBeNull();
  });

  it('SDL-08: 通信エラーでは行が戻り通信エラー文言が出る', async () => {
    deleteItem.mockRejectedValue(new Error('network'));
    renderList();

    await requestRemove('醤油');
    await confirmRemove();

    await waitFor(() => {
      expect(screen.getByText('通信エラーが発生しました。')).toBeDefined();
    });
    expect(screen.getByRole('button', { name: '醤油を削除' })).toBeDefined();
  });

  it('SDL-09: 金額入力を展開中の行を削除すると展開状態がクリアされる', async () => {
    const user = userEvent.setup();
    deleteItem.mockResolvedValue({ ok: true, status: 204 });
    renderList([
      createShoppingItemDto({
        id: 'item-1',
        displayName: '醤油',
        status: 'bought',
        source: 'manually_added',
      }),
    ]);
    await user.click(screen.getByRole('button', { name: '金額を記録' }));
    expect(screen.getByLabelText('価格')).toBeDefined();

    await requestRemove('醤油');
    await confirmRemove();

    await waitFor(() => {
      expect(screen.queryByLabelText('価格')).toBeNull();
    });
  });

  it('SDL-10: 全件削除すると空状態になる', async () => {
    deleteItem.mockResolvedValue({ ok: true, status: 204 });
    renderList([SOY_SAUCE]);

    await requestRemove('醤油');
    await confirmRemove();

    await waitFor(() => {
      expect(screen.getByText('リストにアイテムがありません')).toBeDefined();
    });
  });

  it('SDL-11: completed のリストでは削除ボタンを描画しない', () => {
    renderList([SOY_SAUCE, ONION], 'completed');

    expect(screen.queryByRole('button', { name: '醤油を削除' })).toBeNull();
  });

  // 楽観削除で対象行は即座に消えるため、「操作中の行を disable」ではなく「レスポンス待ちの
  // 間も残りの行が操作できる」ことを固定する。
  it('SDL-12: 削除のレスポンス待ち中も他の行は操作できる', async () => {
    const user = userEvent.setup();
    let settleDelete: () => void = () => {};
    deleteItem.mockReturnValue(
      new Promise((resolve) => {
        settleDelete = () => resolve({ ok: true, status: 204 });
      }),
    );
    postChecked.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        createShoppingItemDto({ id: 'item-2', displayName: '玉ねぎ', status: 'bought' }),
    });
    renderList();

    await requestRemove('醤油');
    await confirmRemove();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '醤油を削除' })).toBeNull();
    });

    await user.click(screen.getByRole('checkbox', { name: /玉ねぎ/ }));

    await waitFor(() => {
      expect(postChecked).toHaveBeenCalled();
    });

    // 保留中の Promise を解決し、他テストの startTransition/useOptimistic に影響を残さない
    settleDelete();
    await waitFor(() => {
      expect(deleteItem).toHaveBeenCalled();
    });
  });

  it('SDL-13: 献立由来の品目では同期で復活する旨を説明する', async () => {
    renderList();

    await requestRemove('玉ねぎ');

    // 「献立の変更を反映」は同期ボタンのラベルとも一致するため、説明文の全文で特定する。
    expect(
      screen.getByText(
        'この品目は献立から作られています。削除しても「献立の変更を反映」を押すと再び追加されます。',
      ),
    ).toBeDefined();
  });

  it('SDL-14: 手動追加の品目では既定の文言を説明する', async () => {
    renderList();

    await requestRemove('醤油');

    expect(screen.getByText('削除すると元に戻せません。')).toBeDefined();
  });
});
