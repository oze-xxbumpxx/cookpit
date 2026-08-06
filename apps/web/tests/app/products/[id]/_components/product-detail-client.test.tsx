import type { CheapestStoreResultDto, PriceRecordDto, ProductDto } from '@cookpit/application';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { deletePriceRecord, putPriceRecord, deleteProduct, getStores, refresh, push } = vi.hoisted(
  () => ({
    deletePriceRecord: vi.fn(),
    putPriceRecord: vi.fn(),
    deleteProduct: vi.fn(),
    getStores: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
  }),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push }),
}));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      stores: {
        $get: (...args: unknown[]) => getStores(...args),
        $post: vi.fn(),
        ':id': { $delete: vi.fn() },
      },
      products: {
        ':id': {
          $delete: (...args: unknown[]) => deleteProduct(...args),
          'price-records': {
            $post: vi.fn(),
            ':priceRecordId': {
              $delete: (...args: unknown[]) => deletePriceRecord(...args),
              $put: (...args: unknown[]) => putPriceRecord(...args),
            },
          },
        },
      },
    },
  },
}));

import { ProductDetailClient } from '../../../../../src/app/products/[id]/_components/product-detail-client';

const PRODUCT_ID = '2b8f0cbb-3c1e-4c62-9d6a-6a1f6b9a0c11';

function createPriceRecord(overrides: Partial<PriceRecordDto> = {}): PriceRecordDto {
  return {
    id: 'record-1',
    storeId: 'store-a',
    storeName: '店舗A',
    priceAmount: 298,
    // 保存値は 100g 基準の正準値。1kg 表示では 10 倍される。
    unitPriceAmount: 29.8,
    packageSizeValue: 1,
    packageSizeUnit: 'kg',
    observedAt: '2026-06-01T09:00:00.000Z',
    ...overrides,
  };
}

function createProductDto(priceHistory: PriceRecordDto[]): ProductDto {
  return {
    id: PRODUCT_ID,
    name: '砂糖',
    aliases: [],
    category: '調味料',
    defaultUnit: 'g',
    priceHistory,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

const CHEAPEST_STORE: CheapestStoreResultDto = {
  storeId: 'store-a',
  storeName: '店舗A',
  latestPrice: 298,
  unitPrice: 29.8,
  packageSizeUnit: 'kg',
};

function renderDetail(priceHistory: PriceRecordDto[] = [createPriceRecord()]): void {
  getStores.mockResolvedValue({ ok: true, json: async () => [] });
  render(
    <ProductDetailClient product={createProductDto(priceHistory)} cheapestStore={CHEAPEST_STORE} />,
  );
}

describe('ProductDetailClient', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('PDC-01: kg で記録した単価は 1kg 基準で表示する（100g 基準にしない）', () => {
    renderDetail();

    // 最安店舗カードと最近の記録の 2 箇所
    expect(screen.getAllByText('298円 / 1kg')).toHaveLength(2);
    expect(screen.queryByText(/100g/)).toBeNull();
  });

  it('PDC-02: g で記録した単価は従来どおり 100g 基準で表示する', () => {
    renderDetail([
      createPriceRecord({ unitPriceAmount: 99, packageSizeValue: 300, packageSizeUnit: 'g' }),
    ]);

    expect(screen.getByText('99円 / 100g')).toBeDefined();
  });

  it('PDC-03: 記録行に内容量が出るので、誤入力した記録を見分けられる', () => {
    renderDetail([createPriceRecord({ packageSizeValue: 3001, packageSizeUnit: 'kg' })]);

    expect(screen.getByText('3001kg')).toBeDefined();
  });

  it('PDC-04: 削除ボタン → 確認 → 204 で API を呼び、再取得する', async () => {
    const user = userEvent.setup();
    deletePriceRecord.mockResolvedValue({ ok: true, status: 204 });
    renderDetail();

    await user.click(screen.getByRole('button', { name: /の記録を削除$/ }));
    expect(await screen.findByText('この価格記録を削除しますか？')).toBeDefined();

    await user.click(screen.getByRole('button', { name: '削除する' }));

    await waitFor(() => {
      expect(deletePriceRecord).toHaveBeenCalledWith({
        param: { id: PRODUCT_ID, priceRecordId: 'record-1' },
      });
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('PDC-05: 404 は「既に消えている」として成功扱いにする（冪等）', async () => {
    const user = userEvent.setup();
    deletePriceRecord.mockResolvedValue({ ok: false, status: 404 });
    renderDetail();

    await user.click(screen.getByRole('button', { name: /の記録を削除$/ }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    await waitFor(() => {
      expect(refresh).toHaveBeenCalled();
    });
    expect(screen.queryByText('記録の削除に失敗しました。')).toBeNull();
  });

  it('PDC-06: 失敗時はエラーを表示し、再取得しない', async () => {
    const user = userEvent.setup();
    deletePriceRecord.mockResolvedValue({ ok: false, status: 500 });
    renderDetail();

    await user.click(screen.getByRole('button', { name: /の記録を削除$/ }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    expect(await screen.findByText('記録の削除に失敗しました。')).toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('PDC-07: キャンセルすると API を呼ばない', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /の記録を削除$/ }));
    await user.click(await screen.findByRole('button', { name: 'キャンセル' }));

    await waitFor(() => {
      expect(screen.queryByText('この価格記録を削除しますか？')).toBeNull();
    });
    expect(deletePriceRecord).not.toHaveBeenCalled();
  });

  it('PDC-08: 価格記録が無いときは「最近の記録」ごと出ない', () => {
    renderDetail([]);

    expect(screen.queryByText('最近の記録')).toBeNull();
  });

  it('PDC-09: 編集アイコンが表示される', () => {
    renderDetail();
    expect(screen.getByRole('button', { name: /の記録を編集$/ })).toBeDefined();
  });

  it('PDC-10: 編集アイコンから PriceRecordEditDialog を開く', async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(screen.getByRole('button', { name: /の記録を編集$/ }));

    expect(await screen.findByText('価格記録を編集')).toBeDefined();
  });

  it('PDC-11: 6 件中、直近 5 件のみに編集アイコンが表示される（B-05/E-10）', () => {
    const records = Array.from({ length: 6 }, (_, i) =>
      createPriceRecord({ id: `record-${i}`, observedAt: `2026-06-0${i + 1}T09:00:00.000Z` }),
    );
    renderDetail(records);

    expect(screen.getAllByRole('button', { name: /の記録を編集$/ })).toHaveLength(5);
  });

  it('PDC-12: 編集成功後、router.refresh() が呼ばれる', async () => {
    const user = userEvent.setup();
    putPriceRecord.mockResolvedValue({ ok: true });
    renderDetail();

    await user.click(screen.getByRole('button', { name: /の記録を編集$/ }));
    await screen.findByText('価格記録を編集');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
