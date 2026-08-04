import type { ProductDto, StoreDto } from '@cookpit/application';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getStores, postStore, deleteStore, getStoreUsage, postPriceRecord, refresh, push } =
  vi.hoisted(() => ({
    getStores: vi.fn(),
    postStore: vi.fn(),
    deleteStore: vi.fn(),
    getStoreUsage: vi.fn(),
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
        ':id': {
          $delete: (...args: unknown[]) => deleteStore(...args),
          usage: {
            $get: (...args: unknown[]) => getStoreUsage(...args),
          },
        },
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

import { PriceRecordForm } from '../../../../../src/app/products/[id]/_components/price-record-form';

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
  { id: 'store-b', name: '店舗B', createdAt: '2026-06-02T00:00:00.000Z' },
];

/** 上限（3 件）に到達した状態。既存 2 件に 1 件足す。 */
const STORES_AT_LIMIT: StoreDto[] = [
  ...STORES,
  { id: 'store-c', name: '店舗C', createdAt: '2026-06-03T00:00:00.000Z' },
];

const STORE_PANEL_HINT = 'プルダウンに出す店舗をここで追加・削除できます（3件まで）。';
const STORE_LIMIT_MESSAGE = '店舗は3件までです。追加するには既存の店舗を削除してください。';
const DUPLICATE_STORE_MESSAGE = '同じ名前の店舗がすでに登録されています。';

/** 店舗ロードの完了（= 先頭店舗が自動選択された状態）を待つ。 */
async function waitForStoresLoaded(): Promise<void> {
  expect(await screen.findByText(STORE_PANEL_HINT)).toBeDefined();
}

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

    await waitForStoresLoaded();

    await user.type(screen.getByLabelText('価格'), '298');
    // 内容量は数量と単位を 1 欄で入力する（要望2）
    await user.type(screen.getByLabelText('内容量', { exact: false }), '300個');
    expect(screen.getByRole('button', { name: '記録' }).hasAttribute('disabled')).toBe(false);
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
    expect((screen.getByLabelText('内容量', { exact: false }) as HTMLInputElement).value).toBe('');
  });

  it('PRF-02: 価格 0 では native min 制約により送信がブロックされ POST されない', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    render(<PriceRecordForm product={createProductDto()} />);

    await waitForStoresLoaded();

    await user.type(screen.getByLabelText('価格'), '0');
    await user.type(screen.getByLabelText('内容量', { exact: false }), '300個');
    await user.click(screen.getByRole('button', { name: '記録' }));

    expect(postPriceRecord).not.toHaveBeenCalled();
  });

  it('PRF-03: 店舗取得に失敗するとエラーメッセージが表示される', async () => {
    getStores.mockResolvedValue({ ok: false });
    render(<PriceRecordForm product={createProductDto()} />);

    expect(await screen.findByText('店舗の取得に失敗しました。')).toBeDefined();
  });

  it('PRF-02(上限): 店舗が 2 件なら追加ボタンは有効', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    render(<PriceRecordForm product={createProductDto()} />);

    await waitForStoresLoaded();
    await user.type(screen.getByLabelText('追加する店舗名'), '店舗C');

    expect(screen.getByRole('button', { name: '追加' }).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(STORE_LIMIT_MESSAGE)).toBeNull();
  });

  it('PRF-01(上限): 店舗が 3 件なら追加ボタンが無効になり、理由が表示される', async () => {
    getStores.mockResolvedValue({ ok: true, json: async () => STORES_AT_LIMIT });
    render(<PriceRecordForm product={createProductDto()} />);

    await waitForStoresLoaded();

    expect(await screen.findByText(STORE_LIMIT_MESSAGE)).toBeDefined();
    expect(screen.getByRole('button', { name: '追加' }).hasAttribute('disabled')).toBe(true);
  });

  it('PRF-03(上限): 上限を超える 10 件（本番相当）でも無効化され、既存は表示される', async () => {
    const manyStores: StoreDto[] = Array.from({ length: 10 }, (_, index) => ({
      id: `store-${index}`,
      name: `店舗${index}`,
      createdAt: '2026-06-01T00:00:00.000Z',
    }));
    getStores.mockResolvedValue({ ok: true, json: async () => manyStores });
    render(<PriceRecordForm product={createProductDto()} />);

    await waitForStoresLoaded();

    expect(await screen.findByText(STORE_LIMIT_MESSAGE)).toBeDefined();
    expect(screen.getByRole('button', { name: '店舗9を削除' })).toBeDefined();
  });

  it('PRF-04: 既存と同名を入力すると、送信前に同名メッセージが出て追加できない', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    render(<PriceRecordForm product={createProductDto()} />);

    await waitForStoresLoaded();
    await user.type(screen.getByLabelText('追加する店舗名'), '店舗A');

    expect(await screen.findByText(DUPLICATE_STORE_MESSAGE)).toBeDefined();
    expect(screen.getByRole('button', { name: '追加' }).hasAttribute('disabled')).toBe(true);
    expect(postStore).not.toHaveBeenCalled();
  });

  it('PRF-05: 表記ゆれ（前後空白）でも同名として警告する', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    render(<PriceRecordForm product={createProductDto()} />);

    await waitForStoresLoaded();
    await user.type(screen.getByLabelText('追加する店舗名'), '  店舗A  ');

    expect(await screen.findByText(DUPLICATE_STORE_MESSAGE)).toBeDefined();
  });

  it('PRF-06: 422 のとき本文をパースせず、一覧と入力名から理由を組み立てて表示する', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    // 本文は英語の内部表現。UI はこれを読まない。
    postStore.mockResolvedValue({ ok: false, status: 422 });
    render(<PriceRecordForm product={createProductDto()} />);

    await waitForStoresLoaded();
    await user.type(screen.getByLabelText('追加する店舗名'), '店舗C');
    await user.click(screen.getByRole('button', { name: '追加' }));

    // 一覧は 2 件・入力名は既存と重複しないため、どちらの違反にも当てはまらず汎用文言になる。
    expect(
      await screen.findByText('店舗を追加できませんでした。一覧を確認してください。'),
    ).toBeDefined();
  });

  it('PRF-07: 削除アイコンを押すと usage を取得し、件数入りの確認文が出る', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    getStoreUsage.mockResolvedValue({
      ok: true,
      json: async () => ({ priceRecordCount: 12, shoppingItemCount: 3 }),
    });
    render(<PriceRecordForm product={createProductDto()} />);

    await waitForStoresLoaded();
    await user.click(screen.getByRole('button', { name: '店舗Aを削除' }));

    await waitFor(() => {
      expect(getStoreUsage).toHaveBeenCalledWith({ param: { id: 'store-a' } });
    });
    expect(await screen.findByText('価格記録 12 件')).toBeDefined();
    expect(await screen.findByText(/買い物の品目 3 件/)).toBeDefined();
  });

  it('PRF-08: usage の取得に失敗しても件数を伏せた文言で削除を続行できる', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    getStoreUsage.mockRejectedValue(new Error('network'));
    deleteStore.mockResolvedValue({ ok: true, status: 204 });
    render(<PriceRecordForm product={createProductDto()} />);

    await waitForStoresLoaded();
    await user.click(screen.getByRole('button', { name: '店舗Aを削除' }));

    expect(
      await screen.findByText('この店舗の価格記録はすべて削除されます。元には戻せません。'),
    ).toBeDefined();

    await user.click(await screen.findByRole('button', { name: '削除する' }));

    await waitFor(() => {
      expect(deleteStore).toHaveBeenCalledWith({ param: { id: 'store-a' } });
    });
  });

  it('PRF-09: 参照のある店舗も削除でき、一覧から消えて選択が解除される（ADR-0013）', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    getStoreUsage.mockResolvedValue({
      ok: true,
      json: async () => ({ priceRecordCount: 5, shoppingItemCount: 0 }),
    });
    deleteStore.mockResolvedValue({ ok: true, status: 204 });
    render(<PriceRecordForm product={createProductDto()} />);

    await waitForStoresLoaded();
    expect(screen.getByRole('combobox', { name: '店舗' }).textContent).toContain('店舗A');

    await user.click(screen.getByRole('button', { name: '店舗Aを削除' }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    await waitFor(() => {
      expect(deleteStore).toHaveBeenCalledWith({ param: { id: 'store-a' } });
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '店舗Aを削除' })).toBeNull();
    });
    // 削除した店舗が選択中だったので選択が外れ、プレースホルダに戻る
    expect(screen.getByRole('combobox', { name: '店舗' }).textContent).toContain('店舗を選択');
    // 残った店舗は消えない
    expect(screen.getByRole('button', { name: '店舗Bを削除' })).toBeDefined();
    // 価格記録がカスケード削除されるので再取得する
    expect(refresh).toHaveBeenCalled();
  });

  it('PRF-10: 404 は「既に消えている」として成功扱いにする（冪等）', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    getStoreUsage.mockResolvedValue({
      ok: true,
      json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }),
    });
    deleteStore.mockResolvedValue({ ok: false, status: 404 });
    render(<PriceRecordForm product={createProductDto()} />);

    await waitForStoresLoaded();

    await user.click(screen.getByRole('button', { name: '店舗Bを削除' }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '店舗Bを削除' })).toBeNull();
    });
    expect(screen.queryByText('店舗の削除に失敗しました。')).toBeNull();
  });

  it('PRF-11: 内容量のプレースホルダは可算単位で 1 になる（基本単位=個）', async () => {
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    render(<PriceRecordForm product={createProductDto({ defaultUnit: '個' })} />);

    await waitForStoresLoaded();

    expect(screen.getByLabelText('内容量', { exact: false }).getAttribute('placeholder')).toBe(
      '例：1個',
    );
  });

  it('PRF-12: 内容量のプレースホルダは g で 300 になる（基本単位=g）', async () => {
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    render(<PriceRecordForm product={createProductDto({ defaultUnit: 'g' })} />);

    await waitForStoresLoaded();

    expect(screen.getByLabelText('内容量', { exact: false }).getAttribute('placeholder')).toBe(
      '例：300g',
    );
  });

  it('PRF-13: 単位なしの内容量では送信されない（内容量エラーは canSubmit に阻まれて表示されない）', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    const { container } = render(
      <PriceRecordForm product={createProductDto({ defaultUnit: '個' })} />,
    );

    await waitForStoresLoaded();

    await user.type(screen.getByLabelText('価格'), '298');
    // 数値のみ（単位なし）は parseQuantity が 'valueOnly' を返すため canSubmit が false になる。
    // buildInput まで到達しないので packageSizeValue のエラー文は画面に出ない。
    // プレースホルダとエラー文が同じ例になることは packageSizeExample の単体テストで担保する。
    await user.type(screen.getByLabelText('内容量', { exact: false }), '3');
    fireEvent.submit(container.querySelector('form') as HTMLFormElement);

    expect(postPriceRecord).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '記録' }).hasAttribute('disabled')).toBe(true);
  });

  it('PRF-14: 削除が失敗したら理由を出し、一覧から消さない', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    getStoreUsage.mockResolvedValue({
      ok: true,
      json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }),
    });
    deleteStore.mockResolvedValue({ ok: false, status: 500 });
    render(<PriceRecordForm product={createProductDto()} />);

    await waitForStoresLoaded();

    await user.click(screen.getByRole('button', { name: '店舗Aを削除' }));
    await user.click(await screen.findByRole('button', { name: '削除する' }));

    expect(await screen.findByText('店舗の削除に失敗しました。')).toBeDefined();
    expect(screen.getByRole('button', { name: '店舗Aを削除' })).toBeDefined();
  });
});
