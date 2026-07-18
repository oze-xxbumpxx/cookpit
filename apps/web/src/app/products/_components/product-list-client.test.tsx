import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductDto } from '@cookpit/application';
import type { ReactNode } from 'react';
import { ProductListClient } from './product-list-client';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('./product-card', () => ({
  ProductCard: ({ product }: { product: ProductDto }) => <div>{product.name}</div>,
}));

function createProductDto(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: '2b8f0cbb-3c1e-4c62-9d6a-6a1f6b9a0c11',
    name: 'トマト',
    aliases: [],
    category: '野菜',
    defaultUnit: '個',
    priceHistory: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ProductListClient', () => {
  afterEach(() => {
    cleanup();
  });

  it('WC-P-01: 商品が 0 件のとき「まだ商品がありません」テキストが表示される', () => {
    render(<ProductListClient initialProducts={[]} />);

    expect(screen.getByText(/まだ商品がありません/)).toBeDefined();
  });

  it('WC-P-02: 商品が 1 件のとき ProductCard が 1 件レンダリングされる', () => {
    render(<ProductListClient initialProducts={[createProductDto()]} />);

    expect(screen.getAllByText('トマト')).toHaveLength(1);
    expect(screen.queryByText(/まだ商品がありません/)).toBeNull();
  });

  it('WC-P-03: 検索ボックスに入力すると商品名でフィルタリングされる', async () => {
    const user = userEvent.setup();
    const products = [
      createProductDto(),
      createProductDto({
        id: '3c9f1dcc-4d2f-5d73-ae7b-7b2f7c0b1d22',
        name: '豚肉',
        category: '肉',
      }),
    ];
    render(<ProductListClient initialProducts={products} />);

    await user.type(screen.getByLabelText('商品を検索'), '豚肉');

    expect(screen.getByText('豚肉')).toBeDefined();
    expect(screen.queryByText('トマト')).toBeNull();
  });

  it('WC-P-04: カテゴリボタンクリックでカテゴリフィルタリングされる', async () => {
    const user = userEvent.setup();
    const products = [
      createProductDto(),
      createProductDto({
        id: '3c9f1dcc-4d2f-5d73-ae7b-7b2f7c0b1d22',
        name: '豚肉',
        category: '肉',
      }),
    ];
    render(<ProductListClient initialProducts={products} />);

    await user.click(screen.getByRole('button', { name: '肉' }));

    expect(screen.getByText('豚肉')).toBeDefined();
    expect(screen.queryByText('トマト')).toBeNull();
  });
});
