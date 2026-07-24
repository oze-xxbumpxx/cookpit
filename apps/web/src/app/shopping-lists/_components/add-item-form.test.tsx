import type { StoreDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddItemForm } from './add-item-form';

function createStoreDto(overrides: Partial<StoreDto> = {}): StoreDto {
  return {
    id: 'store-a',
    name: '店舗A',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

const STORES = [createStoreDto({ id: 'store-a', name: '店舗A' })];

describe('AddItemForm', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('AF-01: displayName 未入力時は追加ボタンが disabled', () => {
    render(<AddItemForm stores={STORES} submitting={false} onAdd={vi.fn()} />);

    expect(screen.getByRole('button', { name: '追加' }).hasAttribute('disabled')).toBe(true);
  });

  it('AF-02: 品目名と分量（数量+単位）を入力すると追加ボタンが有効化される', async () => {
    const user = userEvent.setup();
    render(<AddItemForm stores={STORES} submitting={false} onAdd={vi.fn()} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '卵');
    await user.type(screen.getByLabelText('分量', { exact: false }), '1個');

    expect(screen.getByRole('button', { name: '追加' }).hasAttribute('disabled')).toBe(false);
  });

  it('AF-02b: 単位のない分量では有効化されない（数量+単位が必要）', async () => {
    const user = userEvent.setup();
    render(<AddItemForm stores={STORES} submitting={false} onAdd={vi.fn()} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '卵');
    await user.type(screen.getByLabelText('分量', { exact: false }), '1');

    expect(screen.getByRole('button', { name: '追加' }).hasAttribute('disabled')).toBe(true);
  });

  it('AF-03: 店舗未定のまま送信すると targetStoreId: null で送信される（D-6）', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddItemForm stores={STORES} submitting={false} onAdd={onAdd} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '卵');
    await user.type(screen.getByLabelText('分量', { exact: false }), '1個');
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(onAdd).toHaveBeenCalledWith({
      displayName: '卵',
      requiredAmount: { value: 1, unit: '個' },
      targetStoreId: null,
    });
  });

  it('AF-04: 「店舗未定」オプション選択でも targetStoreId: null が送信される', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddItemForm stores={STORES} submitting={false} onAdd={onAdd} />);

    await user.click(screen.getByRole('combobox', { name: /推奨店舗/ }));
    await user.click(screen.getByRole('option', { name: '店舗未定' }));
    await user.type(screen.getByLabelText('品目名', { exact: false }), '卵');
    await user.type(screen.getByLabelText('分量', { exact: false }), '1個');
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        targetStoreId: null,
      }),
    );
  });

  it('AF-05: 店舗を選択すると targetStoreId として送信される', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddItemForm stores={STORES} submitting={false} onAdd={onAdd} />);

    await user.click(screen.getByRole('combobox', { name: /推奨店舗/ }));
    await user.click(screen.getByRole('option', { name: '店舗A' }));
    await user.type(screen.getByLabelText('品目名', { exact: false }), '卵');
    await user.type(screen.getByLabelText('分量', { exact: false }), '1個');
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        targetStoreId: 'store-a',
      }),
    );
  });

  it('AF-06: 数量 0 でも disabled にならず送信できる', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddItemForm stores={STORES} submitting={false} onAdd={onAdd} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '卵');
    await user.type(screen.getByLabelText('分量', { exact: false }), '0個');

    expect(screen.getByRole('button', { name: '追加' }).hasAttribute('disabled')).toBe(false);

    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredAmount: { value: 0, unit: '個' },
      }),
    );
  });

  it('AF-07: 追加後もフォームは展開維持され、入力欄のみクリアされる', async () => {
    const user = userEvent.setup();
    render(<AddItemForm stores={STORES} submitting={false} onAdd={vi.fn()} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '卵');
    await user.type(screen.getByLabelText('分量', { exact: false }), '1個');
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(screen.getByRole('heading', { name: '手動で追加' })).toBeDefined();
    expect((screen.getByLabelText('品目名', { exact: false }) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('分量', { exact: false }) as HTMLInputElement).value).toBe('');
  });

  it('AF-08: submitting 中は追加ボタンが disabled', async () => {
    const user = userEvent.setup();
    render(<AddItemForm stores={STORES} submitting={true} onAdd={vi.fn()} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '卵');
    await user.type(screen.getByLabelText('分量', { exact: false }), '1個');

    expect(screen.getByRole('button', { name: '追加' }).hasAttribute('disabled')).toBe(true);
  });

  it('AF-09: 数量と単位は 1 つの分量入力欄に統合されている（要望2）', () => {
    render(<AddItemForm stores={STORES} submitting={false} onAdd={vi.fn()} />);

    const amountInput = screen.getByLabelText('分量', { exact: false });
    expect(amountInput.tagName).toBe('INPUT');
    expect(screen.queryByLabelText('数量')).toBeNull();
    expect(screen.queryByLabelText('単位')).toBeNull();
  });

  it('AF-11: プリセット外の単位も分量入力から送信できる（項目3）', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddItemForm stores={STORES} submitting={false} onAdd={onAdd} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '卵');
    await user.type(screen.getByLabelText('分量', { exact: false }), '1パック');
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ requiredAmount: { value: 1, unit: 'パック' } }),
    );
  });

  it('AF-10: productId 選択に相当する UI 要素が存在しない（D-6）', () => {
    render(<AddItemForm stores={STORES} submitting={false} onAdd={vi.fn()} />);

    expect(screen.queryByText('商品')).toBeNull();
    expect(screen.queryByLabelText('商品')).toBeNull();
  });
});
