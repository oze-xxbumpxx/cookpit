'use client';

import { isDuplicateStoreName, STORE_LIMIT } from '@/app/products/_utils/store-name';
import { client } from '@/lib/api-client';
import type { CreateStoreBody } from '@cookpit/api-contract';
import type { StoreDto, StoreUsageDto } from '@cookpit/application';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export const STORE_LIMIT_MESSAGE = `店舗は${STORE_LIMIT}件までです。追加するには既存の店舗を削除してください。`;
export const DUPLICATE_STORE_MESSAGE = '同じ名前の店舗がすでに登録されています。';

interface Options {
  onStoreCreated?: () => void;
}

export interface StoreManagementResult {
  stores: StoreDto[];
  storesLoading: boolean;
  storesErrorMessage: string | null;
  storeId: string;
  setStoreId: (value: string) => void;
  newStoreName: string;
  setNewStoreName: (value: string) => void;
  creatingStore: boolean;
  pendingDeleteStore: StoreDto | null;
  pendingDeleteUsage: StoreUsageDto | null;
  deletingStore: boolean;
  renamingStore: StoreDto | null;
  setRenamingStore: (store: StoreDto | null) => void;
  canCreateStore: boolean;
  storeLimitReached: boolean;
  duplicateStoreName: boolean;
  handleCreateStore: () => Promise<void>;
  requestDeleteStore: (store: StoreDto) => Promise<void>;
  handleDeleteStore: () => Promise<void>;
  handleDeleteDialogOpenChange: (open: boolean) => void;
  handleRenamedStore: (updated: StoreDto) => void;
}

export function useStoreManagement(options: Options = {}): StoreManagementResult {
  const router = useRouter();
  const [stores, setStores] = useState<StoreDto[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesErrorMessage, setStoresErrorMessage] = useState<string | null>(null);
  const [newStoreName, setNewStoreName] = useState('');
  const [creatingStore, setCreatingStore] = useState(false);
  const [pendingDeleteStore, setPendingDeleteStore] = useState<StoreDto | null>(null);
  const [pendingDeleteUsage, setPendingDeleteUsage] = useState<StoreUsageDto | null>(null);
  const [deletingStore, setDeletingStore] = useState(false);
  const [renamingStore, setRenamingStore] = useState<StoreDto | null>(null);
  const [storeId, setStoreIdState] = useState('');

  const storeLimitReached = stores.length >= STORE_LIMIT;
  const duplicateStoreName = isDuplicateStoreName(
    newStoreName,
    stores.map((store) => store.name),
  );
  const canCreateStore =
    newStoreName.trim() !== '' &&
    !creatingStore &&
    !storesLoading &&
    !storeLimitReached &&
    !duplicateStoreName;

  useEffect(() => {
    let cancelled = false;

    async function loadStores(): Promise<void> {
      setStoresLoading(true);
      setStoresErrorMessage(null);
      try {
        const response = await client.api.stores.$get();
        if (!response.ok) {
          if (!cancelled) {
            setStoresErrorMessage('店舗の取得に失敗しました。');
          }
          return;
        }

        const data = await response.json();
        if (!cancelled) {
          setStores(data);
          setStoreIdState((current) => (current === '' && data.length > 0 ? data[0].id : current));
        }
      } catch {
        if (!cancelled) {
          setStoresErrorMessage('店舗の取得中に通信エラーが発生しました。');
        }
      } finally {
        if (!cancelled) {
          setStoresLoading(false);
        }
      }
    }

    void loadStores();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * サーバーが 422 で拒否した理由を、送信直前の一覧と入力名から推定して日本語化する。
   * 同時実行で一覧が古かった場合はどちらにも当てはまらないため、汎用文言へ落とす。
   */
  function rejectionReason(attemptedName: string): string {
    if (storeLimitReached) {
      return STORE_LIMIT_MESSAGE;
    }
    if (
      isDuplicateStoreName(
        attemptedName,
        stores.map((store) => store.name),
      )
    ) {
      return DUPLICATE_STORE_MESSAGE;
    }
    return '店舗を追加できませんでした。一覧を確認してください。';
  }

  async function handleCreateStore(): Promise<void> {
    if (!canCreateStore) {
      return;
    }

    const input: CreateStoreBody = {
      name: newStoreName.trim(),
    };

    setCreatingStore(true);
    setStoresErrorMessage(null);
    try {
      const response = await client.api.stores.$post({ json: input });
      if (!response.ok) {
        // Hono RPC の型は 422 を知らない（共通 onError 由来で型に現れない）ため number へ広げる。
        const status: number = response.status;
        // 上限超過と同名はどちらも 422 で、本文は英語の内部表現。本文をパースせず、
        // 送信直前の一覧と入力名から理由を組み立てて日本語化する（設計書 §データフロー）。
        setStoresErrorMessage(
          status === 422 ? rejectionReason(input.name) : '店舗の追加に失敗しました。',
        );
        return;
      }

      const createdStore = await response.json();
      setStores((current) => [...current, createdStore]);
      setStoreIdState(createdStore.id);
      setNewStoreName('');
      options.onStoreCreated?.();
    } catch {
      setStoresErrorMessage('店舗の追加中に通信エラーが発生しました。');
    } finally {
      setCreatingStore(false);
    }
  }

  /**
   * 削除確認ダイアログを開く。合わせて失われる件数を取得する（ADR-0013 の R-5）。
   * 取得に失敗しても件数を伏せた定性表現で続行できるようにし、削除操作自体は止めない。
   */
  async function requestDeleteStore(store: StoreDto): Promise<void> {
    setPendingDeleteStore(store);
    setPendingDeleteUsage(null);
    try {
      const response = await client.api.stores[':id'].usage.$get({ param: { id: store.id } });
      if (response.ok) {
        setPendingDeleteUsage(await response.json());
      }
    } catch {
      // 件数は削除の可否に影響しない補助情報なので、失敗を握って定性表現に委ねる。
    }
  }

  async function handleDeleteStore(): Promise<void> {
    if (pendingDeleteStore === null) {
      return;
    }

    const targetStoreId = pendingDeleteStore.id;
    setDeletingStore(true);
    setStoresErrorMessage(null);
    try {
      const response = await client.api.stores[':id'].$delete({ param: { id: targetStoreId } });
      // Hono RPC の型は 404 を知らない（共通 onError 由来で型に現れない）ため number へ広げる。
      const status: number = response.status;
      // 404 は「既に消えている」＝目的達成なので成功として扱う（削除操作を冪等にする）。
      if (!response.ok && status !== 404) {
        setStoresErrorMessage('店舗の削除に失敗しました。');
        // エラー文はパネル側に出るため、ダイアログを開いたままだと裏に隠れて読めない。
        setPendingDeleteStore(null);
        setPendingDeleteUsage(null);
        return;
      }

      setStores((current) => current.filter((store) => store.id !== targetStoreId));
      setStoreIdState((current) => (current === targetStoreId ? '' : current));
      setPendingDeleteStore(null);
      setPendingDeleteUsage(null);
      // 価格記録がカスケード削除されるため、価格履歴・グラフ・最安店舗を取り直す（ADR-0013）。
      router.refresh();
    } catch {
      setStoresErrorMessage('店舗の削除中に通信エラーが発生しました。');
    } finally {
      setDeletingStore(false);
    }
  }

  function handleDeleteDialogOpenChange(open: boolean): void {
    if (!open) {
      setPendingDeleteStore(null);
      setPendingDeleteUsage(null);
    }
  }

  function handleRenamedStore(updated: StoreDto): void {
    setStores((current) => current.map((store) => (store.id === updated.id ? updated : store)));
    setRenamingStore(null);
  }

  return {
    stores,
    storesLoading,
    storesErrorMessage,
    storeId,
    setStoreId: setStoreIdState,
    newStoreName,
    setNewStoreName,
    creatingStore,
    pendingDeleteStore,
    pendingDeleteUsage,
    deletingStore,
    renamingStore,
    setRenamingStore,
    canCreateStore,
    storeLimitReached,
    duplicateStoreName,
    handleCreateStore,
    requestDeleteStore,
    handleDeleteStore,
    handleDeleteDialogOpenChange,
    handleRenamedStore,
  };
}
