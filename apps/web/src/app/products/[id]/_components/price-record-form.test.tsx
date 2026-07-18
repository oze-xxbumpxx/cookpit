import type { ProductDto, StoreDto } from '@cookpit/application';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getStores, postStore, postPriceRecord, refresh, push } = vi.hoisted(() => ({
  getStores: vi.fn(),
  postStore: vi.fn(),
  postPriceRecord: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push }),
}));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      stores: {
        $get: (...args: unknown[]) => getStores(...args),
        $post: (...args: unknown[]) => postStore(...args),
      },
      products: {
        ':id': {
          'price-records': {
            $post: (...args: unknown[]) => postPriceRecord(...args),
          },
        },
      },
    },
  },
}));

import { PriceRecordForm } from './price-record-form';

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

const STORES: StoreDto[] = [
  { id: 'store-a', name: '店舗A', createdAt: '2026-06-01T00:00:00.000Z' },
];

describe('PriceRecordForm', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('PRF-01: 店舗読み込み後、必須入力で送信すると payload の形が固定される', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    postPriceRecord.mockResolvedValue({ ok: true });
    const product = createProductDto();
    const { container } = render(<PriceRecordForm product={product} />);

    // 店舗ロード完了（= 先頭店舗が自動選択される）まで待つ
    expect(await screen.findByText('選択肢にない店舗はここから追加できます。')).toBeDefined();

    await user.type(screen.getByLabelText('価格'), '298');
    await user.type(screen.getByLabelText('内容量'), '300');
    expect(screen.getByRole('button', { name: '記録' }).hasAttribute('disabled')).toBe(false);
    // happy-dom は step="0.1" の浮動小数点判定バグで内容量入力を invalid 扱いにし
    // クリック経由の送信をブロックするため、submit イベントを直接発火する
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(postPriceRecord).toHaveBeenCalledWith({
        param: { id: product.id },
        json: {
          storeId: 'store-a',
          priceAmount: 298,
          packageSizeValue: 300,
          packageSizeUnit: '個',
        },
      });
    });
    expect(refresh).toHaveBeenCalled();
    expect((screen.getByLabelText('価格') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('内容量') as HTMLInputElement).value).toBe('');
  });

  it('PRF-02: 価格 0 では native min 制約により送信がブロックされ POST されない', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    render(<PriceRecordForm product={createProductDto()} />);

    // 店舗ロード完了（= 先頭店舗が自動選択される）まで待つ
    expect(await screen.findByText('選択肢にない店舗はここから追加できます。')).toBeDefined();

    await user.type(screen.getByLabelText('価格'), '0');
    await user.type(screen.getByLabelText('内容量'), '300');
    await user.click(screen.getByRole('button', { name: '記録' }));

    expect(postPriceRecord).not.toHaveBeenCalled();
  });

  it('PRF-03: 店舗取得に失敗するとエラーメッセージが表示される', async () => {
    getStores.mockResolvedValue({ ok: false });
    render(<PriceRecordForm product={createProductDto()} />);

    expect(await screen.findByText('店舗の取得に失敗しました。')).toBeDefined();
  });
});
