'use client';

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuantityField } from '@/components/ui/quantity-field';
import { SelectField, type SelectFieldOption } from '@/components/ui/select-field';
import { client } from '@/lib/api-client';
import { parseQuantity } from '@/lib/parse-quantity';
import type { CreateStoreBody, RecordPriceBody } from '@cookpit/api-contract';
import type { ProductDto, StoreDto } from '@cookpit/application';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useId, useState } from 'react';

/** 参照が残っている店舗は削除できない（ADR-0012）。サーバーは 422 を返す。 */
const STORE_IN_USE_MESSAGE =
  'この店舗は価格記録や買い物リストで使われているため削除できません。先にそれらを削除してください。';

interface Props {
  product: ProductDto;
}

interface FieldErrors {
  storeId: string | null;
  priceAmount: string | null;
  packageSizeValue: string | null;
}

interface BuildResult {
  input: RecordPriceBody | null;
  errors: FieldErrors;
}

function emptyFieldErrors(): FieldErrors {
  return {
    storeId: null,
    priceAmount: null,
    packageSizeValue: null,
  };
}

export function PriceRecordForm({ product }: Props) {
  const router = useRouter();
  const storeIdId = useId();
  const priceAmountId = useId();
  const packageSizeId = useId();
  const newStoreNameId = useId();
  const storeIdErrorId = useId();
  const priceAmountErrorId = useId();
  const packageSizeValueErrorId = useId();

  const [stores, setStores] = useState<StoreDto[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesErrorMessage, setStoresErrorMessage] = useState<string | null>(null);
  const [newStoreName, setNewStoreName] = useState('');
  const [creatingStore, setCreatingStore] = useState(false);
  const [pendingDeleteStore, setPendingDeleteStore] = useState<StoreDto | null>(null);
  const [deletingStore, setDeletingStore] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [packageSize, setPackageSize] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(emptyFieldErrors);

  const parsedPackageSize = parseQuantity(packageSize);
  const canSubmit =
    storeId !== '' &&
    priceAmount.trim() !== '' &&
    parsedPackageSize.kind === 'amount' &&
    parsedPackageSize.value > 0 &&
    !submitting;
  const canCreateStore = newStoreName.trim() !== '' && !creatingStore && !storesLoading;
  const storeOptions: SelectFieldOption[] = [
    {
      value: '',
      label: storesLoading ? '読み込み中' : '店舗を選択',
      disabled: true,
    },
    ...stores.map((store) => ({
      value: store.id,
      label: store.name,
    })),
  ];

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
          setStoreId((current) => (current === '' && data.length > 0 ? data[0].id : current));
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

  function buildInput(): BuildResult {
    const errors = emptyFieldErrors();
    const parsedPriceAmount = Number(priceAmount.trim());
    const parsedSize = parseQuantity(packageSize);

    if (storeId === '') {
      errors.storeId = '店舗を選択してください。';
    }
    if (!Number.isFinite(parsedPriceAmount) || parsedPriceAmount <= 0) {
      errors.priceAmount = '価格は1円以上の数値で入力してください。';
    }
    if (parsedSize.kind !== 'amount' || parsedSize.value <= 0) {
      errors.packageSizeValue = '内容量は「数値+単位」で入力してください（例：300g）。';
    }

    if (
      errors.storeId !== null ||
      errors.priceAmount !== null ||
      errors.packageSizeValue !== null ||
      parsedSize.kind !== 'amount'
    ) {
      return {
        input: null,
        errors,
      };
    }

    return {
      input: {
        storeId,
        priceAmount: parsedPriceAmount,
        packageSizeValue: parsedSize.value,
        packageSizeUnit: parsedSize.unit,
      },
      errors,
    };
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
        setStoresErrorMessage('店舗の追加に失敗しました。');
        return;
      }

      const createdStore = await response.json();
      setStores((current) => [...current, createdStore]);
      setStoreId(createdStore.id);
      setNewStoreName('');
      setFieldErrors((current) => ({
        ...current,
        storeId: null,
      }));
    } catch {
      setStoresErrorMessage('店舗の追加中に通信エラーが発生しました。');
    } finally {
      setCreatingStore(false);
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
      // Hono RPC の型は 404 / 422 を知らない（共通 onError 由来で型に現れない）ため number へ広げる。
      const status: number = response.status;
      if (status === 422) {
        setStoresErrorMessage(STORE_IN_USE_MESSAGE);
        setPendingDeleteStore(null);
        return;
      }
      // 404 は「既に消えている」＝目的達成なので成功として扱う（削除操作を冪等にする）。
      if (!response.ok && status !== 404) {
        setStoresErrorMessage('店舗の削除に失敗しました。');
        return;
      }

      setStores((current) => current.filter((store) => store.id !== targetStoreId));
      setStoreId((current) => (current === targetStoreId ? '' : current));
      setPendingDeleteStore(null);
    } catch {
      setStoresErrorMessage('店舗の削除中に通信エラーが発生しました。');
    } finally {
      setDeletingStore(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const result = buildInput();
    setFieldErrors(result.errors);
    setErrorMessage(null);

    if (result.input === null) {
      setErrorMessage('入力内容を確認してください。');
      return;
    }

    setSubmitting(true);
    try {
      const response = await client.api.products[':id']['price-records'].$post({
        param: { id: product.id },
        json: result.input,
      });
      if (!response.ok) {
        setErrorMessage('価格の記録に失敗しました。入力内容を確認してください。');
        return;
      }

      setPriceAmount('');
      setPackageSize('');
      router.refresh();
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">価格を記録</h2>
        <Button type="submit" size="sm" disabled={!canSubmit} className="h-8 px-3">
          {submitting ? '記録中' : '記録'}
        </Button>
      </div>

      {(errorMessage !== null || storesErrorMessage !== null) && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage ?? storesErrorMessage}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor={storeIdId} className="text-sm font-medium text-foreground">
            店舗
          </label>
          <SelectField
            id={storeIdId}
            value={storeId}
            onValueChange={setStoreId}
            options={storeOptions}
            placeholder={storesLoading ? '読み込み中' : '店舗を選択'}
            disabled={storesLoading || stores.length === 0}
            invalid={fieldErrors.storeId !== null}
            describedBy={fieldErrors.storeId === null ? undefined : storeIdErrorId}
          />
          {fieldErrors.storeId !== null && (
            <p id={storeIdErrorId} className="text-xs text-destructive">
              {fieldErrors.storeId}
            </p>
          )}
          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-background p-3">
            <p className="text-xs text-muted-foreground">
              {storesLoading
                ? '店舗を読み込んでいます。'
                : stores.length === 0
                  ? '店舗がまだ登録されていません。価格を記録する前に店舗を追加してください。'
                  : 'プルダウンに出す店舗をここで追加・削除できます。'}
            </p>
            {stores.length > 0 && (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
                {stores.map((store) => (
                  <li
                    key={store.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5"
                  >
                    <span className="truncate text-sm text-foreground">{store.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setPendingDeleteStore(store)}
                      disabled={deletingStore}
                      aria-label={`${store.name}を削除`}
                      className="text-muted-foreground"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <label htmlFor={newStoreNameId} className="sr-only">
              追加する店舗名
            </label>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input
                id={newStoreNameId}
                value={newStoreName}
                onChange={(event) => setNewStoreName(event.currentTarget.value)}
                placeholder="例：近所のスーパー"
                className="h-10 rounded-lg bg-card"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleCreateStore}
                disabled={!canCreateStore}
                className="h-10 px-3"
              >
                {creatingStore ? '追加中' : '追加'}
              </Button>
            </div>
          </div>
        </div>

        <section className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label htmlFor={priceAmountId} className="text-sm font-medium text-foreground">
              価格
            </label>
            <Input
              id={priceAmountId}
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={priceAmount}
              onChange={(event) => setPriceAmount(event.currentTarget.value)}
              placeholder="298"
              aria-invalid={fieldErrors.priceAmount !== null}
              aria-describedby={fieldErrors.priceAmount === null ? undefined : priceAmountErrorId}
              className="h-11 rounded-xl bg-card"
            />
            {fieldErrors.priceAmount !== null && (
              <p id={priceAmountErrorId} className="text-xs text-destructive">
                {fieldErrors.priceAmount}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={packageSizeId} className="text-sm font-medium text-foreground">
              内容量 <span className="text-xs font-normal text-muted-foreground">数量と単位</span>
            </label>
            <QuantityField
              id={packageSizeId}
              value={packageSize}
              onValueChange={setPackageSize}
              placeholder={`例：300${product.defaultUnit}`}
              className="h-11 rounded-xl bg-card"
              invalid={fieldErrors.packageSizeValue !== null}
              describedBy={
                fieldErrors.packageSizeValue === null ? undefined : packageSizeValueErrorId
              }
            />
            {fieldErrors.packageSizeValue !== null && (
              <p id={packageSizeValueErrorId} className="text-xs text-destructive">
                {fieldErrors.packageSizeValue}
              </p>
            )}
          </div>
        </section>
      </div>

      <AlertDialog
        open={pendingDeleteStore !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDeleteStore(null);
          }
        }}
      >
        {pendingDeleteStore !== null && (
          <AlertDialogContent>
            <AlertDialogTitle>{pendingDeleteStore.name}を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              価格記録や買い物リストで使われている店舗は削除できません。使われていない場合のみ削除されます。
            </AlertDialogDescription>
            <div className="mt-4 flex justify-end gap-2">
              <AlertDialogClose
                render={
                  <Button type="button" variant="outline" className="h-9">
                    キャンセル
                  </Button>
                }
              />
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteStore}
                disabled={deletingStore}
                className="h-9"
              >
                {deletingStore ? '削除中' : '削除する'}
              </Button>
            </div>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </form>
  );
}
