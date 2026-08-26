import type { PantryDto, StockDto } from '@cookpit/application';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStockDto as createSharedStockDto } from './pantry-test-fixtures';

const { getPantry, postConsume, postDiscard, postAddStock, putStock, refresh } = vi.hoisted(() => ({
  getPantry: vi.fn(),
  postConsume: vi.fn(),
  postDiscard: vi.fn(),
  postAddStock: vi.fn(),
  putStock: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      pantry: {
        $get: (...args: unknown[]) => getPantry(...args),
        stocks: {
          $post: (...args: unknown[]) => postAddStock(...args),
          ':stockId': {
            $put: (...args: unknown[]) => putStock(...args),
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

import { PantryClient } from '../../../../src/app/pantry/_components/pantry-client';

const AS_OF = new Date('2026-08-08T09:00:00');

function createStockDto(overrides: Partial<StockDto> = {}): StockDto {
  return createSharedStockDto({
    id: '30000000-0000-4000-8000-000000000001',
    ...overrides,
  });
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
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto()} />);

    expect(screen.getByText('在庫がありません')).toBeDefined();
  });

  it('PC-02: 保存場所ごとに対応 stock のみを固定順で表示する', () => {
    render(
      <PantryClient
        asOf={AS_OF}
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
        asOf={AS_OF}
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
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto([milk, egg])} />);

    await user.click(within(getStockRow('牛乳')).getByRole('button', { name: '消費' }));

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
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto([stock])} />);

    await user.click(screen.getByRole('button', { name: '消費' }));

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
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto([milk, egg])} />);

    await user.click(within(getStockRow('牛乳')).getByRole('button', { name: '廃棄' }));

    await waitFor(() => {
      expect(screen.queryByText('牛乳')).toBeNull();
      expect(screen.getByText('卵')).toBeDefined();
    });
  });

  it('PC-07: consume 失敗時に操作エラーを表示して一覧を維持する', async () => {
    const user = userEvent.setup();
    postConsume.mockResolvedValue({ ok: false });
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto([createStockDto()])} />);

    await user.click(screen.getByRole('button', { name: '消費' }));

    await waitFor(() => {
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
    expect(screen.getByText('牛乳')).toBeDefined();
  });

  it('PC-08: discard 失敗時に操作エラーを表示して一覧を維持する', async () => {
    const user = userEvent.setup();
    postDiscard.mockResolvedValue({ ok: false });
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto([createStockDto()])} />);

    await user.click(screen.getByRole('button', { name: '廃棄' }));

    await waitFor(() => {
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
    expect(screen.getByText('牛乳')).toBeDefined();
  });

  it('PC-09: RPC が reject したとき通信エラーを表示する', async () => {
    const user = userEvent.setup();
    postConsume.mockRejectedValue(new Error('network error'));
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto([createStockDto()])} />);

    await user.click(screen.getByRole('button', { name: '消費' }));

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
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto([milk, egg])} />);

    await user.click(within(getStockRow('牛乳')).getByRole('button', { name: '消費' }));

    await waitFor(() => {
      expect(
        within(getStockRow('牛乳')).getByRole('button', { name: '消費' }).hasAttribute('disabled'),
      ).toBe(true);
    });
    expect(
      within(getStockRow('牛乳')).getByRole('button', { name: '廃棄' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(
      within(getStockRow('卵')).getByRole('button', { name: '消費' }).hasAttribute('disabled'),
    ).toBe(false);
    expect(
      within(getStockRow('卵')).getByRole('button', { name: '廃棄' }).hasAttribute('disabled'),
    ).toBe(false);
  });

  it('PC-11: 同一 stock を連打しても consume は 1 回だけ送信する', async () => {
    const user = userEvent.setup();
    postConsume.mockReturnValue(new Promise(() => {}));
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto([createStockDto()])} />);
    const consumeButton = screen.getByRole('button', { name: '消費' });

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
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto([milk])} />);

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
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto([createStockDto()])} />);

    await user.click(screen.getByRole('button', { name: '更新' }));

    await waitFor(() => {
      expect(getPantry).toHaveBeenCalledTimes(1);
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });
  });

  it('PC-14: unmount 後の focus では refetch しない', async () => {
    getPantry.mockResolvedValue({ ok: true, json: async () => createPantryDto() });
    const { unmount } = render(
      <PantryClient asOf={AS_OF} pantry={createPantryDto([createStockDto()])} />,
    );

    unmount();
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(getPantry).not.toHaveBeenCalled();
  });

  it('PC-15: ヘッダーに在庫タイトル・更新ボタンを表示する（画面間の導線はボトムナビ）', () => {
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto()} />);

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
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto([milk, juice])} />);

    await user.click(within(getStockRow('牛乳')).getByRole('button', { name: '消費' }));

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
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto()} />);

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
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto()} />);

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
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto([milk, egg])} />);

    await user.click(within(getStockRow('牛乳')).getByRole('button', { name: '消費' }));
    await waitFor(() => {
      expect(screen.getByText('操作に失敗しました。')).toBeDefined();
    });

    await user.click(within(getStockRow('卵')).getByRole('button', { name: '消費' }));

    await waitFor(() => {
      expect(screen.queryByText('操作に失敗しました。')).toBeNull();
    });
  });

  it('PC-EDIT-01: consume pending 中でも別 stock の編集ダイアログを開ける', async () => {
    const user = userEvent.setup();
    postConsume.mockReturnValue(new Promise(() => {}));
    const milk = createStockDto({
      id: '30000000-0000-4000-8000-000000000021',
      displayName: '牛乳',
    });
    const egg = createStockDto({
      id: '30000000-0000-4000-8000-000000000022',
      displayName: '卵',
      amount: { value: 6, unit: '個' },
    });
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto([milk, egg])} />);

    await user.click(within(getStockRow('牛乳')).getByRole('button', { name: '消費' }));
    await user.click(within(getStockRow('卵')).getByRole('button', { name: '編集' }));

    expect(screen.getByRole('heading', { name: '在庫を編集' })).toBeDefined();
    await waitFor(() => {
      expect((screen.getByLabelText('数量') as HTMLInputElement).value).toBe('6個');
    });
  });

  it('PC-EDIT-03: 編集の成功で応答の stocks を一覧へ反映する（リロード不要）', async () => {
    // 回帰ガード。以前の実装はダイアログが router.refresh() するだけだったが、
    // PantryClient は stocks を useState で持ち props と同期しないため、
    // 保存しても一覧が変わらず「編集が効いていない」ように見えた（2026-08-08 実画面確認）。
    const user = userEvent.setup();
    const stock = createStockDto({ displayName: '味噌', amount: { value: 1, unit: '袋' } });
    putStock.mockResolvedValue({
      ok: true,
      json: async () => ({ stocks: [{ ...stock, amount: { value: 9, unit: '袋' } }] }),
    });
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto([stock])} />);

    await user.click(within(getStockRow('味噌')).getByRole('button', { name: '編集' }));
    await waitFor(() => {
      expect((screen.getByLabelText('数量') as HTMLInputElement).value).toBe('1袋');
    });
    await user.clear(screen.getByLabelText('数量'));
    await user.type(screen.getByLabelText('数量'), '9袋');
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(within(getStockRow('味噌')).getByText('9袋')).toBeDefined();
    });
  });

  it('PC-EDIT-04: 編集対象が他経路で消えていたら一覧側にエラーバナーを出す', async () => {
    // 回帰ガード。404 のメッセージはダイアログ内にしか無く、閉じると同時に消えるため
    // 一覧側のバナーで伝える必要がある（2026-08-08 実画面確認 MB-16）。
    const user = userEvent.setup();
    const stock = createStockDto({ displayName: '塩' });
    putStock.mockResolvedValue({ ok: false, status: 404 });
    getPantry.mockResolvedValue({ ok: true, json: async () => ({ stocks: [] }) });
    render(<PantryClient asOf={AS_OF} pantry={createPantryDto([stock])} />);

    await user.click(within(getStockRow('塩')).getByRole('button', { name: '編集' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '在庫を編集' })).toBeDefined();
    });
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByText('この在庫はすでに削除されています')).toBeDefined();
  });

  it('PC-EDIT-02: asOf を在庫行へ伝播し期限3日のチップを表示する', () => {
    render(
      <PantryClient
        asOf={AS_OF}
        pantry={createPantryDto([createStockDto({ expiresAt: '2026-08-11' })])}
      />,
    );

    expect(screen.getByText('あと3日')).toBeDefined();
  });

  it('PC-DEEPLINK-01: highlightStockId が一致する行を強調し scrollIntoView する', () => {
    const targetId = '30000000-0000-4000-8000-000000000099';
    const otherId = '30000000-0000-4000-8000-000000000098';
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <PantryClient
        asOf={AS_OF}
        highlightStockId={targetId}
        pantry={createPantryDto([
          createStockDto({ id: otherId, displayName: '卵', storedLocation: 'fridge' }),
          createStockDto({ id: targetId, displayName: '牛乳', storedLocation: 'fridge' }),
        ])}
      />,
    );

    const targetRow = getStockRow('牛乳');
    expect(targetRow.className).toContain('ring-2');
    expect(getStockRow('卵').className).not.toContain('ring-2');
    expect(scrollIntoView).toHaveBeenCalled();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('PC-DEEPLINK-02: 存在しない highlightStockId は無視し EmptyState にしない', () => {
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <PantryClient
        asOf={AS_OF}
        highlightStockId="30000000-0000-4000-8000-000000000000"
        pantry={createPantryDto([createStockDto({ displayName: '牛乳' })])}
      />,
    );

    expect(screen.queryByText('在庫がありません')).toBeNull();
    expect(screen.getByText('牛乳')).toBeDefined();
    expect(getStockRow('牛乳').className).not.toContain('ring-2');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
