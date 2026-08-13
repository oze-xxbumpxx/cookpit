import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialProductFormValue } from '../../../../../src/app/products/_components/product-form-fields';

const { postProduct, refresh, push, replace } = vi.hoisted(() => ({
  postProduct: vi.fn(),
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
        $post: (...args: unknown[]) => postProduct(...args),
      },
    },
  },
}));

import { ProductFormClient } from '../../../../../src/app/products/new/_components/product-form-client';

describe('ProductFormClient', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('PFC-01: 商品名未入力では保存ボタンが disabled', () => {
    render(<ProductFormClient />);

    expect(screen.getByRole('button', { name: '保存' }).hasAttribute('disabled')).toBe(true);
  });

  it('PFC-02: 送信で POST /api/products に JSON が渡り /products へ遷移する', async () => {
    const user = userEvent.setup();
    postProduct.mockResolvedValue({ ok: true });
    const defaults = createInitialProductFormValue();
    render(<ProductFormClient />);

    await user.type(screen.getByLabelText(/商品名/), '玉ねぎ');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(postProduct).toHaveBeenCalledWith({
      json: {
        name: '玉ねぎ',
        aliases: [],
        category: defaults.category,
        defaultUnit: defaults.defaultUnit,
      },
    });
    expect(replace).toHaveBeenCalledWith('/products');
    expect(refresh).toHaveBeenCalled();
  });

  it('PFC-03: 未編集でキャンセルすると確認ダイアログを出さずに遷移する', async () => {
    const user = userEvent.setup();
    render(<ProductFormClient />);

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(screen.queryByText('本当に戻りますか？')).toBeNull();
    expect(push).toHaveBeenCalledWith('/products');
  });

  it('PFC-04: 編集後にキャンセルすると確認ダイアログが出て遷移しない', async () => {
    const user = userEvent.setup();
    render(<ProductFormClient />);
    await user.type(screen.getByLabelText(/商品名/), '玉ねぎ');

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(screen.getByText('本当に戻りますか？')).toBeDefined();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('PFC-05: 確認ダイアログの「戻る」で離脱する', async () => {
    const user = userEvent.setup();
    render(<ProductFormClient />);
    await user.type(screen.getByLabelText(/商品名/), '玉ねぎ');
    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    await user.click(screen.getByRole('button', { name: '戻る' }));

    expect(replace).toHaveBeenCalledWith('/products');
  });

  it('PFC-06: 保存失敗後もガードが残り、キャンセルで確認ダイアログが出る', async () => {
    const user = userEvent.setup();
    postProduct.mockResolvedValue({ ok: false });
    render(<ProductFormClient />);
    await user.type(screen.getByLabelText(/商品名/), '玉ねぎ');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByText('保存に失敗しました。入力内容を確認してください。')).toBeDefined();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'キャンセル' }));

    expect(screen.getByText('本当に戻りますか？')).toBeDefined();
  });
});
