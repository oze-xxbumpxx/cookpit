'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectField, type SelectFieldOption } from '@/components/ui/select-field';
import { UnitField } from '@/components/ui/unit-field';
import { client } from '@/lib/api-client';
import type { CreateStoreBody, RecordPriceBody } from '@cookpit/api-contract';
import type { ProductDto, StoreDto } from '@cookpit/application';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useId, useState } from 'react';

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
  const packageSizeValueId = useId();
  const packageSizeUnitId = useId();
  const newStoreNameId = useId();
  const storeIdErrorId = useId();
  const priceAmountErrorId = useId();
  const packageSizeValueErrorId = useId();

  const [stores, setStores] = useState<StoreDto[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesErrorMessage, setStoresErrorMessage] = useState<string | null>(null);
  const [newStoreName, setNewStoreName] = useState('');
  const [creatingStore, setCreatingStore] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [packageSizeValue, setPackageSizeValue] = useState('');
  const [packageSizeUnit, setPackageSizeUnit] = useState(product.defaultUnit);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(emptyFieldErrors);

  const canSubmit =
    storeId !== '' && priceAmount.trim() !== '' && packageSizeValue.trim() !== '' && !submitting;
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
    const parsedPackageSizeValue = Number(packageSizeValue.trim());

    if (storeId === '') {
      errors.storeId = '店舗を選択してください。';
    }
    if (!Number.isFinite(parsedPriceAmount) || parsedPriceAmount <= 0) {
      errors.priceAmount = '価格は1円以上の数値で入力してください。';
    }
    if (!Number.isFinite(parsedPackageSizeValue) || parsedPackageSizeValue <= 0) {
      errors.packageSizeValue = '内容量は1以上の数値で入力してください。';
    }

    if (
      errors.storeId !== null ||
      errors.priceAmount !== null ||
      errors.packageSizeValue !== null
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
        packageSizeValue: parsedPackageSizeValue,
        packageSizeUnit,
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
      setPackageSizeValue('');
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
                  : '選択肢にない店舗はここから追加できます。'}
            </p>
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
            <label htmlFor={packageSizeValueId} className="text-sm font-medium text-foreground">
              内容量
            </label>
            <Input
              id={packageSizeValueId}
              type="number"
              min="1"
              step="0.1"
              inputMode="decimal"
              value={packageSizeValue}
              onChange={(event) => setPackageSizeValue(event.currentTarget.value)}
              placeholder="300"
              aria-invalid={fieldErrors.packageSizeValue !== null}
              aria-describedby={
                fieldErrors.packageSizeValue === null ? undefined : packageSizeValueErrorId
              }
              className="h-11 rounded-xl bg-card"
            />
            {fieldErrors.packageSizeValue !== null && (
              <p id={packageSizeValueErrorId} className="text-xs text-destructive">
                {fieldErrors.packageSizeValue}
              </p>
            )}
          </div>
        </section>

        <div className="flex flex-col gap-2">
          <label htmlFor={packageSizeUnitId} className="text-sm font-medium text-foreground">
            内容量の単位
          </label>
          <UnitField
            id={packageSizeUnitId}
            value={packageSizeUnit}
            onValueChange={setPackageSizeUnit}
          />
        </div>
      </div>
    </form>
  );
}
