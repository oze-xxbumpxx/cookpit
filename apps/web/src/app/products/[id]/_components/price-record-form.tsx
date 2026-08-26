'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuantityField } from '@/components/ui/quantity-field';
import { SelectField, type SelectFieldOption } from '@/components/ui/select-field';
import { StoreManagementPanel } from '@/app/products/[id]/_components/store-management-panel';
import { useStoreManagement } from '@/app/products/[id]/_components/use-store-management';
import { packageSizeExample } from '@/app/products/_utils/package-size-example';
import { client } from '@/lib/api-client';
import { parseQuantity } from '@/lib/parse-quantity';
import type { RecordPriceBody } from '@cookpit/api-contract';
import type { ProductDto } from '@cookpit/application';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useId, useState } from 'react';

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
  const storeIdErrorId = useId();
  const priceAmountErrorId = useId();
  const packageSizeValueErrorId = useId();

  const [priceAmount, setPriceAmount] = useState('');
  const [packageSize, setPackageSize] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(emptyFieldErrors);

  const storeManagement = useStoreManagement({
    onStoreCreated: () => {
      setFieldErrors((current) => ({
        ...current,
        storeId: null,
      }));
    },
  });
  const { stores, storesLoading, storesErrorMessage, storeId, setStoreId } = storeManagement;

  // プレースホルダとバリデーションエラーで同じ例を出すため、1 か所で組み立てる。
  const sizeExample = packageSizeExample(product.defaultUnit);
  const parsedPackageSize = parseQuantity(packageSize);
  const canSubmit =
    storeId !== '' &&
    priceAmount.trim() !== '' &&
    parsedPackageSize.kind === 'amount' &&
    parsedPackageSize.value > 0 &&
    !submitting;
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
      errors.packageSizeValue = `内容量は「数値+単位」で入力してください（例：${sizeExample}）。`;
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
          <StoreManagementPanel management={storeManagement} />
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
              placeholder={`例：${sizeExample}`}
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
    </form>
  );
}
