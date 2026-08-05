import type { PriceRecordDto, ProductDto, StoreDto } from '@cookpit/application';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getStores, putPriceRecord, refresh } = vi.hoisted(() => ({
  getStores: vi.fn(),
  putPriceRecord: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      stores: { $get: (...args: unknown[]) => getStores(...args) },
      products: {
        ':id': {
          'price-records': {
            ':priceRecordId': { $put: (...args: unknown[]) => putPriceRecord(...args) },
          },
        },
      },
    },
  },
}));

import { PriceRecordEditDialog } from '../../../../../src/app/products/[id]/_components/price-record-edit-dialog';

const STORES: StoreDto[] = [
  { id: 'store-a', name: '店舗A', createdAt: '2026-06-01T00:00:00.000Z' },
  { id: 'store-b', name: '店舗B', createdAt: '2026-06-02T00:00:00.000Z' },
];

function createProductDto(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: 'product-1',
    name: '玉ねぎ',
    aliases: [],
    category: '野菜',
    defaultUnit: '個',
    priceHistory: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function createRecord(overrides: Partial<PriceRecordDto> = {}): PriceRecordDto {
  return {
    id: 'record-1',
    storeId: 'store-a',
    storeName: '店舗A',
    priceAmount: 298,
    unitPriceAmount: 99.3,
    packageSizeValue: 3,
    packageSizeUnit: '個',
    observedAt: '2026-06-01T09:00:00.000Z',
    ...overrides,
  };
}

describe('PriceRecordEditDialog', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('PRED-01: 初期値が表示される', async () => {
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    render(
      <PriceRecordEditDialog
        product={createProductDto()}
        record={createRecord()}
        onOpenChange={vi.fn()}
      />,
    );

    expect(await screen.findByText('店舗A')).toBeDefined();
    expect((screen.getByLabelText('価格') as HTMLInputElement).value).toBe('298');
    expect((screen.getByLabelText('内容量', { exact: false }) as HTMLInputElement).value).toBe(
      '3個',
    );
  });

  it('PRED-02: 開くたびに最新の店舗一覧を取得する', async () => {
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    render(
      <PriceRecordEditDialog
        product={createProductDto()}
        record={createRecord()}
        onOpenChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(getStores).toHaveBeenCalled();
    });
  });

  it('PRED-03: 保存で PUT が正しいボディで呼ばれる（observedAt を含まない）', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    putPriceRecord.mockResolvedValue({ ok: true });
    render(
      <PriceRecordEditDialog
        product={createProductDto()}
        record={createRecord()}
        onOpenChange={vi.fn()}
      />,
    );
    await screen.findByText('店舗A');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(putPriceRecord).toHaveBeenCalledWith({
        param: { id: 'product-1', priceRecordId: 'record-1' },
        json: { storeId: 'store-a', priceAmount: 298, packageSizeValue: 3, packageSizeUnit: '個' },
      });
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('PRED-04: 保存成功でダイアログが閉じ、router.refresh() が呼ばれる', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    putPriceRecord.mockResolvedValue({ ok: true });
    const onOpenChange = vi.fn();
    render(
      <PriceRecordEditDialog
        product={createProductDto()}
        record={createRecord()}
        onOpenChange={onOpenChange}
      />,
    );
    await screen.findByText('店舗A');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('PRED-05: PriceRecordNotFoundError では削除済みメッセージを表示しダイアログを閉じて再取得する', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    putPriceRecord.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'PriceRecord not found: record-1' }),
    });
    const onOpenChange = vi.fn();
    render(
      <PriceRecordEditDialog
        product={createProductDto()}
        record={createRecord()}
        onOpenChange={onOpenChange}
      />,
    );
    await screen.findByText('店舗A');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('この記録はすでに削除されています。')).toBeDefined();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(refresh).toHaveBeenCalled();
  });

  it('PRED-06: StoreNotFoundError では店舗未検出メッセージを表示し、店舗一覧を再取得する', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    putPriceRecord.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Store not found: store-a' }),
    });
    render(
      <PriceRecordEditDialog
        product={createProductDto()}
        record={createRecord()}
        onOpenChange={vi.fn()}
      />,
    );
    await screen.findByText('店舗A');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(
      await screen.findByText('選択した店舗が見つかりません。店舗一覧を確認してください。'),
    ).toBeDefined();
    await waitFor(() => {
      expect(getStores).toHaveBeenCalledTimes(2);
    });
  });

  it('PRED-07: サーバーが 400 を返した場合はエラーメッセージを表示する（E-04）', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    putPriceRecord.mockResolvedValue({ ok: false, status: 400 });
    render(
      <PriceRecordEditDialog
        product={createProductDto()}
        record={createRecord()}
        onOpenChange={vi.fn()}
      />,
    );
    await screen.findByText('店舗A');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('記録の更新に失敗しました。')).toBeDefined();
  });

  it('PRED-08: 通信エラーではダイアログを閉じずフォームの入力値を保持する', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    putPriceRecord.mockRejectedValue(new Error('network'));
    const onOpenChange = vi.fn();
    render(
      <PriceRecordEditDialog
        product={createProductDto()}
        record={createRecord()}
        onOpenChange={onOpenChange}
      />,
    );
    await screen.findByText('店舗A');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('通信エラーが発生しました。')).toBeDefined();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect((screen.getByLabelText('価格') as HTMLInputElement).value).toBe('298');
  });

  it('PRED-09: 保存中はボタンが disabled になり「保存中」ラベルになる', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    let resolvePut: (value: { ok: boolean }) => void = () => {};
    putPriceRecord.mockReturnValue(
      new Promise((resolve) => {
        resolvePut = resolve;
      }),
    );
    render(
      <PriceRecordEditDialog
        product={createProductDto()}
        record={createRecord()}
        onOpenChange={vi.fn()}
      />,
    );
    await screen.findByText('店舗A');

    await user.click(screen.getByRole('button', { name: '保存' }));

    const submitting = await screen.findByRole('button', { name: '保存中' });
    expect(submitting.hasAttribute('disabled')).toBe(true);
    resolvePut({ ok: true });
  });

  it('PRED-10: 記録日時の入力欄が無い（B-06）', async () => {
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    render(
      <PriceRecordEditDialog
        product={createProductDto()}
        record={createRecord()}
        onOpenChange={vi.fn()}
      />,
    );
    await screen.findByText('店舗A');

    expect(screen.queryByLabelText(/記録日時/)).toBeNull();
  });
});
