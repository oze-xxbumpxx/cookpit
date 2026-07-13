import { unitSchema } from '@cookpit/api-contract';
import type { StoreDto } from '@cookpit/application';
import { cleanup, render, screen, within } from '@testing-library/react';
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

  it('AF-02: 必須項目を入力すると追加ボタンが有効化される', async () => {
    const user = userEvent.setup();
    render(<AddItemForm stores={STORES} submitting={false} onAdd={vi.fn()} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '卵');
    await user.type(screen.getByLabelText('数量'), '1');

    expect(screen.getByRole('button', { name: '追加' }).hasAttribute('disabled')).toBe(false);
  });

  it('AF-03: 店舗未定のまま送信すると targetStoreId: null で送信される（D-6）', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddItemForm stores={STORES} submitting={false} onAdd={onAdd} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '卵');
    await user.type(screen.getByLabelText('数量'), '1');
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(onAdd).toHaveBeenCalledWith({
      displayName: '卵',
      requiredAmount: { value: 1, unit: 'g' },
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
    await user.type(screen.getByLabelText('数量'), '1');
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
    await user.type(screen.getByLabelText('数量'), '1');
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
    await user.type(screen.getByLabelText('数量'), '0');

    expect(screen.getByRole('button', { name: '追加' }).hasAttribute('disabled')).toBe(false);

    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredAmount: { value: 0, unit: 'g' },
      }),
    );
  });

  it('AF-07: 追加後もフォームは展開維持され、入力欄のみクリアされる', async () => {
    const user = userEvent.setup();
    render(<AddItemForm stores={STORES} submitting={false} onAdd={vi.fn()} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '卵');
    await user.type(screen.getByLabelText('数量'), '1');
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(screen.getByRole('heading', { name: '手動で追加' })).toBeDefined();
    expect((screen.getByLabelText('品目名', { exact: false }) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('数量') as HTMLInputElement).value).toBe('');
  });

  it('AF-08: submitting 中は追加ボタンが disabled', async () => {
    const user = userEvent.setup();
    render(<AddItemForm stores={STORES} submitting={true} onAdd={vi.fn()} />);

    await user.type(screen.getByLabelText('品目名', { exact: false }), '卵');
    await user.type(screen.getByLabelText('数量'), '1');

    expect(screen.getByRole('button', { name: '追加' }).hasAttribute('disabled')).toBe(true);
  });

  it('AF-09: 単位選択肢は unitSchema.options 全件が過不足なく描画される', async () => {
    const user = userEvent.setup();
    render(<AddItemForm stores={STORES} submitting={false} onAdd={vi.fn()} />);

    await user.click(screen.getByRole('combobox', { name: '単位' }));
    const listbox = screen.getByRole('listbox');

    expect(within(listbox).getAllByRole('option')).toHaveLength(unitSchema.options.length);
  });

  it('AF-10: productId 選択に相当する UI 要素が存在しない（D-6）', () => {
    render(<AddItemForm stores={STORES} submitting={false} onAdd={vi.fn()} />);

    expect(screen.queryByText('商品')).toBeNull();
    expect(screen.queryByLabelText('商品')).toBeNull();
  });
});
