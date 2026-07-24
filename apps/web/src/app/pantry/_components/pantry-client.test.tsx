import type { PantryDto, StockDto } from '@cookpit/application';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getPantry, postConsume, postDiscard, postAddStock } = vi.hoisted(() => ({
  getPantry: vi.fn(),
  postConsume: vi.fn(),
  postDiscard: vi.fn(),
  postAddStock: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      pantry: {
        $get: (...args: unknown[]) => getPantry(...args),
        stocks: {
          $post: (...args: unknown[]) => postAddStock(...args),
          ':stockId': {
            consume: {
              $post: (...args: unknown[]) => postConsume(...args),
            },
            discard: {
              $post: (...args: unknown[]) => postDiscard(...args),
            },
          },
        },
      },
    },
  },
}));

import { PantryClient } from './pantry-client';

function createStockDto(overrides: Partial<StockDto> = {}): StockDto {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    productId: null,
    displayName: '牛乳',
    amount: { value: 1000, unit: 'ml' },
    purchasedAt: '2026-07-11T01:00:00.000Z',
    expiresAt: null,
    storedLocation: null,
    ...overrides,
  };
}

function createPantryDto(stocks: StockDto[] = []): PantryDto {
  return { stocks };
}

function getStockRow(displayName: string): HTMLElement {
  const row = screen.getByText(displayName).closest('li');
  if (row === null) {
    throw new Error(`stock row not found: ${displayName}`);
  }
  return row;
}

function getLocationSection(label: string): HTMLElement {
  const section = screen.getByRole('heading', { level: 2, name: label }).closest('section');
  if (section === null) {
    throw new Error(`location section not found: ${label}`);
  }
  return section;
}

describe('PantryClient', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it('PC-01: stocks が空のとき空状態を表示する', () => {
    render(<PantryClient pantry={createPantryDto()} />);

    expect(screen.getByText('在庫がありません')).toBeDefined();
  });

  it('PC-02: 保存場所ごとに対応 stock のみを固定順で表示する', () => {
    render(
      <PantryClient
        pantry={createPantryDto([
          createStockDto({
            id: '30000000-0000-4000-8000-000000000002',
            displayName: '塩',
            storedLocation: null,
          }),
          createStockDto({
            id: '30000000-0000-4000-8000-000000000003',
            displayName: '冷凍肉',
            storedLocation: 'freezer',
          }),
          createStockDto({
            id: '30000000-0000-4000-8000-000000000004',
            displayName: '牛乳',
            storedLocation: 'fridge',
          }),
        ])}
      />,
    );

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      '冷蔵',
      '冷凍',
      '保存場所未設定',
    ]);
    expect(within(getLocationSection('冷蔵')).getByText('牛乳')).toBeDefined();
    expect(within(getLocationSection('冷蔵')).queryByText('冷凍肉')).toBeNull();
    expect(within(getLocationSection('冷凍')).getByText('冷凍肉')).toBeDefined();
    expect(within(getLocationSection('冷凍')).queryByText('塩')).toBeNull();
    expect(within(getLocationSection('保存場所未設定')).getByText('塩')).toBeDefined();
    expect(within(getLocationSection('保存場所未設定')).queryByText('牛乳')).toBeNull();
  });

  it('PC-03: 全件 location 未設定なら単一グループを表示する', () => {
    render(
      <PantryClient
        pantry={createPantryDto([
          createStockDto({
            id: '30000000-0000-4000-8000-000000000005',
            displayName: '牛乳',
          }),
          createStockDto({
            id: '30000000-0000-4000-8000-000000000006',
            displayName: '卵',
          }),
        ])}
      />,
    );

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe('保存場所未設定');
  });

  it('PC-04: consume 成功時に応答にない stock が一覧から消える', async () => {
    const user = userEvent.setup();
    const milk = createStockDto({
      id: '30000000-0000-4000-8000-000000000007',
      displayName: '牛乳',
    });
    const egg = createStockDto({
      id: '30000000-0000-4000-8000-000000000008',
      displayName: '卵',
      amount: { value: 6, unit: '個' },
    });
    postConsume.mockResolvedValue({
      ok: true,
      json: async () => createPantryDto([egg]),
    });
    render(<PantryClient pantry={createPantryDto([milk, egg])} />);

    await user.click(within(getStockRow('牛乳')).getByRole('button', { name: '使った' }));

    await waitFor(() => {
      expect(screen.queryByText('牛乳')).toBeNull();
      expect(screen.getByText('卵')).toBeDefined();
    });
  });

  it('PC-05: consume に stock の残量全部をそのまま送信する', async () => {
    const user = userEvent.setup();
    const stock = createStockDto({
      id: '30000000-0000-4000-8000-000000000009',
      amount: { value: 300, unit: 'ml' },
    });
    postConsume.mockResolvedValue({
      ok: true,
      json: async () => createPantryDto(),
    });
    render(<PantryClient pantry={createPantryDto([stock])} />);

    await user.click(screen.getByRole('button', { name: '使った' }));

    expect(postConsume).toHaveBeenCalledWith({
      param: { stockId: stock.id },
      json: { amount: { value: 300, unit: 'ml' } },
    });
  });

  it('PC-06: discard 成功時に応答にない stock が一覧から消える', async () => {
    const user = userEvent.setup();
    const milk = createStockDto({
      id: '30000000-0000-4000-8000-000000000010',
      displayName: '牛乳',
    });
    const egg = createStockDto({
      id: '30000000-0000-4000-8000-000000000011',
      displayName: '卵',
      amount: { value: 6, unit: '個' },
    });
    postDiscard.mockResolvedValue({
      ok: true,
      json: async () => createPantryDto([egg]),
    });
    render(<PantryClient pantry={createPantryDto([milk, egg])} />);

    await user.click(within(getStockRow('牛乳')).getByRole('button', { name: '廃棄' }));

    await waitFor(() => {
      expect(screen.queryByText('牛乳')).toBeNull();
      expect(screen.getByText('卵')).toBeDefined();
    });
  });

  it('PC-07: consume 失敗時に操作エラーを表示して一覧を維持する', async () => {
    const user = userEvent.setup();
    postConsume.mockResolvedValue({ ok: false });
    render(<PantryClient pantry={createPantryDto([createStockDto()])} />);

    await user.click(screen.getByRole('button', { name: '使った' }));

    await waitFor(() => {
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
    expect(screen.getByText('牛乳')).toBeDefined();
  });

  it('PC-08: discard 失敗時に操作エラーを表示して一覧を維持する', async () => {
    const user = userEvent.setup();
    postDiscard.mockResolvedValue({ ok: false });
    render(<PantryClient pantry={createPantryDto([createStockDto()])} />);

    await user.click(screen.getByRole('button', { name: '廃棄' }));

    await waitFor(() => {
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
    expect(screen.getByText('牛乳')).toBeDefined();
  });

  it('PC-09: RPC が reject したとき通信エラーを表示する', async () => {
    const user = userEvent.setup();
    postConsume.mockRejectedValue(new Error('network error'));
    render(<PantryClient pantry={createPantryDto([createStockDto()])} />);

    await user.click(screen.getByRole('button', { name: '使った' }));

    await waitFor(() => {
      expect(screen.getByText('通信エラーが発生しました。')).toBeDefined();
    });
  });

  it('PC-10: 操作中 stock の両ボタンだけを disabled にする', async () => {
    const user = userEvent.setup();
    postConsume.mockReturnValue(new Promise(() => {}));
    const milk = createStockDto({
      id: '30000000-0000-4000-8000-000000000012',
      displayName: '牛乳',
    });
    const egg = createStockDto({
      id: '30000000-0000-4000-8000-000000000013',
      displayName: '卵',
      amount: { value: 6, unit: '個' },
    });
    render(<PantryClient pantry={createPantryDto([milk, egg])} />);

    await user.click(within(getStockRow('牛乳')).getByRole('button', { name: '使った' }));

    await waitFor(() => {
      expect(
        within(getStockRow('牛乳'))
          .getByRole('button', { name: '使った' })
          .hasAttribute('disabled'),
      ).toBe(true);
    });
    expect(
      within(getStockRow('牛乳')).getByRole('button', { name: '廃棄' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      within(getStockRow('卵')).getByRole('button', { name: '使った' }).hasAttribute('disabled'),
    ).toBe(false);
    expect(
      within(getStockRow('卵')).getByRole('button', { name: '廃棄' }).hasAttribute('disabled'),
    ).toBe(false);
  });

  it('PC-11: 同一 stock を連打しても consume は 1 回だけ送信する', async () => {
    const user = userEvent.setup();
    postConsume.mockReturnValue(new Promise(() => {}));
    render(<PantryClient pantry={createPantryDto([createStockDto()])} />);
    const consumeButton = screen.getByRole('button', { name: '使った' });

    await user.click(consumeButton);
    await user.click(consumeButton);

    expect(postConsume).toHaveBeenCalledTimes(1);
  });

  it('PC-12: focus で silent refetch し応答の stocks に置換する', async () => {
    const milk = createStockDto({
      id: '30000000-0000-4000-8000-000000000014',
      displayName: '牛乳',
    });
    const egg = createStockDto({
      id: '30000000-0000-4000-8000-000000000015',
      displayName: '卵',
      amount: { value: 6, unit: '個' },
    });
    getPantry.mockResolvedValue({
      ok: true,
      json: async () => createPantryDto([egg]),
    });
    render(<PantryClient pantry={createPantryDto([milk])} />);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(getPantry).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('牛乳')).toBeNull();
      expect(screen.getByText('卵')).toBeDefined();
    });
    expect(screen.queryByText('操作に失敗しました。')).toBeNull();
    expect(screen.queryByText('通信エラーが発生しました。')).toBeNull();
  });

  it('PC-13: 手動更新の失敗時に操作エラーを表示する', async () => {
    const user = userEvent.setup();
    getPantry.mockResolvedValue({ ok: false });
    render(<PantryClient pantry={createPantryDto([createStockDto()])} />);

    await user.click(screen.getByRole('button', { name: '更新' }));

    await waitFor(() => {
      expect(getPantry).toHaveBeenCalledTimes(1);
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
  });

  it('PC-14: unmount 後の focus では refetch しない', async () => {
    getPantry.mockResolvedValue({ ok: true, json: async () => createPantryDto() });
    const { unmount } = render(<PantryClient pantry={createPantryDto([createStockDto()])} />);

    unmount();
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(getPantry).not.toHaveBeenCalled();
  });

  it('PC-15: ヘッダーに在庫タイトル・更新ボタンを表示する（画面間の導線はボトムナビ）', () => {
    render(<PantryClient pantry={createPantryDto()} />);

    expect(screen.getByRole('heading', { level: 1, name: '在庫' })).toBeDefined();
    expect(screen.getByRole('button', { name: '更新' })).toBeDefined();
  });

  it('PC-16: consume 応答の PantryDto で stocks を丸ごと置換する', async () => {
    const user = userEvent.setup();
    const milk = createStockDto({
      id: '30000000-0000-4000-8000-000000000016',
      displayName: '牛乳',
    });
    const juice = createStockDto({
      id: '30000000-0000-4000-8000-000000000017',
      displayName: 'ジュース',
      amount: { value: 1000, unit: 'ml' },
    });
    const updatedJuice = createStockDto({ ...juice, amount: { value: 250, unit: 'ml' } });
    postConsume.mockResolvedValue({
      ok: true,
      json: async () => createPantryDto([updatedJuice]),
    });
    render(<PantryClient pantry={createPantryDto([milk, juice])} />);

    await user.click(within(getStockRow('牛乳')).getByRole('button', { name: '使った' }));

    await waitFor(() => {
      expect(screen.queryByText('牛乳')).toBeNull();
      expect(within(getStockRow('ジュース')).getByText('250ml')).toBeDefined();
    });
  });

  it('PC-18: 在庫を追加ボタンからフォーム展開・入力・追加で一覧に反映しフォームを閉じる', async () => {
    const user = userEvent.setup();
    postAddStock.mockResolvedValue({
      ok: true,
      json: async () =>
        createPantryDto([
          createStockDto({
            id: '30000000-0000-4000-8000-000000000020',
            displayName: '玉ねぎ',
            amount: { value: 3, unit: 'g' },
          }),
        ]),
    });
    render(<PantryClient pantry={createPantryDto()} />);

    await user.click(screen.getByRole('button', { name: '在庫を追加' }));
    await user.type(screen.getByLabelText(/品目名/), '玉ねぎ');
    await user.type(screen.getByLabelText(/分量/), '3個');
    await user.click(screen.getByRole('button', { name: '追加' }));

    expect(postAddStock).toHaveBeenCalledWith({
      json: {
        displayName: '玉ねぎ',
        amount: { value: 3, unit: '個' },
        storedLocation: null,
        expiresAt: null,
      },
    });
    await waitFor(() => {
      expect(screen.getByText('玉ねぎ')).toBeDefined();
      expect(screen.getByRole('button', { name: '在庫を追加' })).toBeDefined();
    });
  });

  it('PC-19: 在庫追加が失敗したときエラーを表示する', async () => {
    const user = userEvent.setup();
    postAddStock.mockResolvedValue({ ok: false });
    render(<PantryClient pantry={createPantryDto()} />);

    await user.click(screen.getByRole('button', { name: '在庫を追加' }));
    await user.type(screen.getByLabelText(/品目名/), '玉ねぎ');
    await user.type(screen.getByLabelText(/分量/), '3個');
    await user.click(screen.getByRole('button', { name: '追加' }));

    await waitFor(() => {
      expect(screen.getByText('在庫の追加に失敗しました。')).toBeDefined();
    });
  });

  it('PC-17: エラー表示中に別 stock の操作を始めるとエラーをクリアする', async () => {
    const user = userEvent.setup();
    const milk = createStockDto({
      id: '30000000-0000-4000-8000-000000000018',
      displayName: '牛乳',
    });
    const egg = createStockDto({
      id: '30000000-0000-4000-8000-000000000019',
      displayName: '卵',
      amount: { value: 6, unit: '個' },
    });
    postConsume
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => createPantryDto([milk]) });
    render(<PantryClient pantry={createPantryDto([milk, egg])} />);

    await user.click(within(getStockRow('牛乳')).getByRole('button', { name: '使った' }));
    await waitFor(() => {
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });

    await user.click(within(getStockRow('卵')).getByRole('button', { name: '使った' }));

    await waitFor(() => {
      expect(screen.queryByText('操作に失敗しました。')).toBeNull();
    });
  });
});
