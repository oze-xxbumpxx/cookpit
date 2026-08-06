import type { StoreDto } from '@cookpit/application';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getStoreUsage, putStore, refresh } = vi.hoisted(() => ({
  getStoreUsage: vi.fn(),
  putStore: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      stores: {
        ':id': {
          $put: (...args: unknown[]) => putStore(...args),
          usage: { $get: (...args: unknown[]) => getStoreUsage(...args) },
        },
      },
    },
  },
}));

import { StoreRenameDialog } from '../../../../../src/app/products/[id]/_components/store-rename-dialog';

const STORE: StoreDto = {
  id: 'store-a',
  name: '業務スーパ',
  createdAt: '2026-06-01T00:00:00.000Z',
};

describe('StoreRenameDialog', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('SRD-01: 初期値が表示される', async () => {
    getStoreUsage.mockResolvedValue({
      ok: true,
      json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }),
    });
    render(
      <StoreRenameDialog
        store={STORE}
        existingStoreNames={[]}
        onOpenChange={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );

    expect(((await screen.findByLabelText('店舗名')) as HTMLInputElement).value).toBe('業務スーパ');
  });

  it('SRD-02: 開いた時点で usage を取得する', async () => {
    getStoreUsage.mockResolvedValue({
      ok: true,
      json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }),
    });
    render(
      <StoreRenameDialog
        store={STORE}
        existingStoreNames={[]}
        onOpenChange={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(getStoreUsage).toHaveBeenCalledWith({ param: { id: 'store-a' } });
    });
  });

  it('SRD-03: priceRecordCount > 0 のとき件数入りの警告文が出る（B-08）', async () => {
    getStoreUsage.mockResolvedValue({
      ok: true,
      json: async () => ({ priceRecordCount: 5, shoppingItemCount: 0 }),
    });
    render(
      <StoreRenameDialog
        store={STORE}
        existingStoreNames={[]}
        onOpenChange={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(
        'この店舗の価格記録 5 件の表示名も変わります。違う店舗を選んでいないか確認してください。',
      ),
    ).toBeDefined();
  });

  it('SRD-04: priceRecordCount === 0 のとき警告文が出ない（B-08）', async () => {
    getStoreUsage.mockResolvedValue({
      ok: true,
      json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }),
    });
    render(
      <StoreRenameDialog
        store={STORE}
        existingStoreNames={[]}
        onOpenChange={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );
    await screen.findByLabelText('店舗名');

    expect(screen.queryByText(/この店舗の価格記録/)).toBeNull();
  });

  it('SRD-05: usage 取得失敗時も操作を継続できる（B-08・縮退）', async () => {
    const user = userEvent.setup();
    getStoreUsage.mockRejectedValue(new Error('network'));
    putStore.mockResolvedValue({ ok: true, json: async () => STORE });
    render(
      <StoreRenameDialog
        store={STORE}
        existingStoreNames={[]}
        onOpenChange={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );
    await screen.findByLabelText('店舗名');

    expect(screen.queryByText(/この店舗の価格記録/)).toBeNull();
    expect(screen.getByLabelText('店舗名').hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: '保存' }).hasAttribute('disabled')).toBe(false);

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(putStore).toHaveBeenCalled();
    });
  });

  it('SRD-06: 保存で PUT が正しいボディで呼ばれる', async () => {
    const user = userEvent.setup();
    getStoreUsage.mockResolvedValue({
      ok: true,
      json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }),
    });
    const updated: StoreDto = { ...STORE, name: '業務スーパー' };
    putStore.mockResolvedValue({ ok: true, json: async () => updated });
    render(
      <StoreRenameDialog
        store={STORE}
        existingStoreNames={[]}
        onOpenChange={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );
    const input = await screen.findByLabelText('店舗名');
    await user.clear(input);
    await user.type(input, '業務スーパー');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(putStore).toHaveBeenCalledWith({
        param: { id: 'store-a' },
        json: { name: '業務スーパー' },
      });
    });
  });

  it('SRD-07: 保存成功でダイアログが閉じ、onRenamed が呼ばれ、router.refresh() が呼ばれる（N-06）', async () => {
    const user = userEvent.setup();
    getStoreUsage.mockResolvedValue({
      ok: true,
      json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }),
    });
    const updated: StoreDto = { ...STORE, name: '業務スーパー' };
    putStore.mockResolvedValue({ ok: true, json: async () => updated });
    const onOpenChange = vi.fn();
    const onRenamed = vi.fn();
    render(
      <StoreRenameDialog
        store={STORE}
        existingStoreNames={[]}
        onOpenChange={onOpenChange}
        onRenamed={onRenamed}
      />,
    );
    const input = await screen.findByLabelText('店舗名');
    await user.clear(input);
    await user.type(input, '業務スーパー');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(putStore).toHaveBeenCalledWith({
        param: { id: 'store-a' },
        json: { name: '業務スーパー' },
      });
    });
    expect(onRenamed).toHaveBeenCalledWith(updated);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(refresh).toHaveBeenCalled();
  });

  it('SRD-08: 自分自身と同じ名前のまま保存できる（N-08）', async () => {
    const user = userEvent.setup();
    getStoreUsage.mockResolvedValue({
      ok: true,
      json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }),
    });
    putStore.mockResolvedValue({ ok: true, json: async () => STORE });
    render(
      // existingStoreNames は自分自身を除外済みという契約（設計書 §論点2）
      <StoreRenameDialog
        store={STORE}
        existingStoreNames={[]}
        onOpenChange={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );
    await screen.findByLabelText('店舗名');

    expect(screen.getByRole('button', { name: '保存' }).hasAttribute('disabled')).toBe(false);
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(putStore).toHaveBeenCalled());
  });

  it('SRD-09: 自分自身の名前を大文字小文字だけ変えても事前ヒントが警告しない（N-07）', async () => {
    const user = userEvent.setup();
    const store: StoreDto = { ...STORE, name: 'Life' };
    getStoreUsage.mockResolvedValue({
      ok: true,
      json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }),
    });
    putStore.mockResolvedValue({ ok: true, json: async () => ({ ...store, name: 'life' }) });
    render(
      <StoreRenameDialog
        store={store}
        existingStoreNames={[]}
        onOpenChange={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );
    const input = await screen.findByLabelText('店舗名');
    await user.clear(input);
    await user.type(input, 'life');

    expect(screen.queryByText('同じ名前の店舗がすでに登録されています。')).toBeNull();
    expect(screen.getByRole('button', { name: '保存' }).hasAttribute('disabled')).toBe(false);
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(putStore).toHaveBeenCalled());
  });

  it('SRD-10: StoreNotFoundError（E-05）', async () => {
    const user = userEvent.setup();
    getStoreUsage.mockResolvedValue({
      ok: true,
      json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }),
    });
    putStore.mockResolvedValue({ ok: false, status: 404 });
    const onOpenChange = vi.fn();
    render(
      <StoreRenameDialog
        store={STORE}
        existingStoreNames={[]}
        onOpenChange={onOpenChange}
        onRenamed={vi.fn()}
      />,
    );
    await screen.findByLabelText('店舗名');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('この店舗はすでに削除されています。')).toBeDefined();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(refresh).toHaveBeenCalled();
  });

  it('SRD-11: DuplicateStoreNameError（422）でメッセージを表示する', async () => {
    const user = userEvent.setup();
    getStoreUsage.mockResolvedValue({
      ok: true,
      json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }),
    });
    putStore.mockResolvedValue({ ok: false, status: 422 });
    render(
      <StoreRenameDialog
        store={STORE}
        existingStoreNames={['西友']}
        onOpenChange={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );
    await screen.findByLabelText('店舗名');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('同じ名前の店舗がすでに登録されています。')).toBeDefined();
  });

  it('SRD-12: name を空にすると保存ボタンが無効になり、案内文が出る（E-07）', async () => {
    const user = userEvent.setup();
    getStoreUsage.mockResolvedValue({
      ok: true,
      json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }),
    });
    render(
      <StoreRenameDialog
        store={STORE}
        existingStoreNames={[]}
        onOpenChange={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );
    const input = await screen.findByLabelText('店舗名');
    await user.clear(input);

    expect(await screen.findByText('店舗名を入力してください。')).toBeDefined();
    expect(screen.getByRole('button', { name: '保存' }).hasAttribute('disabled')).toBe(true);
    expect(putStore).not.toHaveBeenCalled();
  });

  it('SRD-13: 通信エラーでは名前入力欄の値を保持したままエラーを表示する', async () => {
    const user = userEvent.setup();
    getStoreUsage.mockResolvedValue({
      ok: true,
      json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }),
    });
    putStore.mockRejectedValue(new Error('network'));
    render(
      <StoreRenameDialog
        store={STORE}
        existingStoreNames={[]}
        onOpenChange={vi.fn()}
        onRenamed={vi.fn()}
      />,
    );
    const input = await screen.findByLabelText('店舗名');
    await user.clear(input);
    await user.type(input, '業務スーパー');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('通信エラーが発生しました。')).toBeDefined();
    expect((screen.getByLabelText('店舗名') as HTMLInputElement).value).toBe('業務スーパー');
  });
});
