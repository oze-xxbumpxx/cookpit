import type { ProductDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { putProduct, refresh, push, replace } = vi.hoisted(() => ({
  putProduct: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push, replace }),
}));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      products: {
        ':id': {
          $put: (...args: unknown[]) => putProduct(...args),
        },
      },
    },
  },
}));

import { ProductEditFormClient } from '../../../../../../src/app/products/[id]/edit/_components/product-edit-form-client';

function createProductDto(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: '玉ねぎ',
    aliases: ['玉葱'],
    category: '野菜',
    defaultUnit: '個',
    priceHistory: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ProductEditFormClient', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('PEC-01: DTO の初期値がフォームに反映される', () => {
    render(<ProductEditFormClient product={createProductDto()} />);

    expect((screen.getByLabelText(/商品名/) as HTMLInputElement).value).toBe('玉ねぎ');
    expect((screen.getByLabelText(/別名/) as HTMLInputElement).value).toBe('玉葱');
  });

  it('PEC-02: 未編集でキャンセルすると確認ダイアログを出さずに遷移する', async () => {
    const user = userEvent.setup();
    const product = createProductDto();
    render(<ProductEditFormClient product={product} />);

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(screen.queryByText('本当に戻りますか？')).toBeNull();
    expect(push).toHaveBeenCalledWith(`/products/${product.id}`);
  });

  it('PEC-03: 編集後にキャンセルすると確認ダイアログが出て遷移しない', async () => {
    const user = userEvent.setup();
    render(<ProductEditFormClient product={createProductDto()} />);
    await user.type(screen.getByLabelText(/商品名/), '追加');

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(screen.getByText('本当に戻りますか？')).toBeDefined();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('PEC-04: 保存成功後は確認ダイアログを出さずに遷移する', async () => {
    const user = userEvent.setup();
    putProduct.mockResolvedValue({ ok: true });
    const product = createProductDto();
    render(<ProductEditFormClient product={product} />);
    await user.type(screen.getByLabelText(/商品名/), '追加');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.queryByText('本当に戻りますか？')).toBeNull();
    expect(replace).toHaveBeenCalledWith(`/products/${product.id}`);
    expect(refresh).toHaveBeenCalled();
  });
});
