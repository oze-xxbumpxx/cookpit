'use client';

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuantityField } from '@/components/ui/quantity-field';
import { SelectField, type SelectFieldOption } from '@/components/ui/select-field';
import { packageSizeExample } from '@/app/products/_utils/package-size-example';
import { client } from '@/lib/api-client';
import { parseQuantity } from '@/lib/parse-quantity';
import type { UpdatePriceRecordBody } from '@cookpit/api-contract';
import type { PriceRecordDto, ProductDto, StoreDto } from '@cookpit/application';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useId, useState } from 'react';

interface Props {
  product: ProductDto;
  record: PriceRecordDto | null;
  onOpenChange: (open: boolean) => void;
}

interface FieldErrors {
  storeId: string | null;
  priceAmount: string | null;
  packageSizeValue: string | null;
}

function emptyFieldErrors(): FieldErrors {
  return { storeId: null, priceAmount: null, packageSizeValue: null };
}

/**
 * 価格記録編集ダイアログ。`PriceRecordForm`（新規記録）とは別コンポーネントとして新設する
 * （設計書 §論点4: 文言・エラー分岐・observedAt の扱いが異なるため再利用しない）。
 */
export function PriceRecordEditDialog({ product, record, onOpenChange }: Props) {
  const router = useRouter();
  const storeIdId = useId();
  const priceAmountId = useId();
  const packageSizeId = useId();

  const [stores, setStores] = useState<StoreDto[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [packageSize, setPackageSize] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(emptyFieldErrors);

  const open = record !== null;
  const sizeExample = packageSizeExample(product.defaultUnit);
  const parsedPackageSize = parseQuantity(packageSize);
  const canSubmit =
    storeId !== '' &&
    priceAmount.trim() !== '' &&
    parsedPackageSize.kind === 'amount' &&
    parsedPackageSize.value > 0 &&
    !submitting;
  const storeOptions: SelectFieldOption[] = [
    { value: '', label: storesLoading ? '読み込み中' : '店舗を選択', disabled: true },
    ...stores.map((store) => ({ value: store.id, label: store.name })),
  ];

  useEffect(() => {
    if (record === null) {
      return;
    }
    // TS の narrowing はネストした関数のスコープへ引き継がれないため、const で捕捉する。
    const targetRecord = record;

    let cancelled = false;
    // setState は非同期関数側にまとめる（同期的な effect 本体での setState は
    // react-hooks/set-state-in-effect に抵触するため、既存 PriceRecordForm と同じ形にする）。
    async function initialize(): Promise<void> {
      setStoreId(targetRecord.storeId);
      setPriceAmount(String(targetRecord.priceAmount));
      setPackageSize(`${targetRecord.packageSizeValue}${targetRecord.packageSizeUnit}`);
      setErrorMessage(null);
      setFieldErrors(emptyFieldErrors());
      setStoresLoading(true);
      try {
        const response = await client.api.stores.$get();
        if (response.ok && !cancelled) {
          setStores(await response.json());
        }
      } finally {
        if (!cancelled) {
          setStoresLoading(false);
        }
      }
    }
    void initialize();
    return () => {
      cancelled = true;
    };
    // record.id が変わったときだけ再取得すればよい（同じ記録の再描画では走らせない）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  function buildBody(): UpdatePriceRecordBody | null {
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
    setFieldErrors(errors);

    if (
      errors.storeId !== null ||
      errors.priceAmount !== null ||
      errors.packageSizeValue !== null ||
      parsedSize.kind !== 'amount'
    ) {
      return null;
    }
    return {
      storeId,
      priceAmount: parsedPriceAmount,
      packageSizeValue: parsedSize.value,
      packageSizeUnit: parsedSize.unit,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (record === null) {
      return;
    }
    setErrorMessage(null);
    const body = buildBody();
    if (body === null) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await client.api.products[':id']['price-records'][':priceRecordId'].$put({
        param: { id: product.id, priceRecordId: record.id },
        json: body,
      });
      if (response.ok) {
        onOpenChange(false);
        router.refresh();
        return;
      }

      // Hono RPC の型は 404 を知らない（共通 onError 由来で型に現れない）ため number へ広げる。
      const status: number = response.status;
      if (status === 404) {
        // 同じ理由でエラーボディの型も RPC には現れないため unknown 経由で取り出す
        // （R-1: この判定はレスポンス文言への文字列依存であることが前提。文言が変わると壊れる）。
        const payload: unknown = await response.json();
        const message =
          typeof payload === 'object' && payload !== null && 'error' in payload
            ? (payload as { error: unknown }).error
            : null;
        if (typeof message === 'string' && message.startsWith('PriceRecord not found')) {
          setErrorMessage('この記録はすでに削除されています。');
          onOpenChange(false);
          router.refresh();
          return;
        }
        if (typeof message === 'string' && message.startsWith('Store not found')) {
          setErrorMessage('選択した店舗が見つかりません。店舗一覧を確認してください。');
          const refetch = await client.api.stores.$get();
          if (refetch.ok) {
            setStores(await refetch.json());
          }
          return;
        }
      }
      setErrorMessage('記録の更新に失敗しました。');
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {record !== null && (
        <AlertDialogContent>
          <AlertDialogTitle>価格記録を編集</AlertDialogTitle>
          <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
            {errorMessage !== null && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <label htmlFor={storeIdId} className="text-sm font-medium text-foreground">
                店舗
              </label>
              <SelectField
                id={storeIdId}
                value={storeId}
                onValueChange={setStoreId}
                options={storeOptions}
                disabled={storesLoading}
                invalid={fieldErrors.storeId !== null}
              />
              {fieldErrors.storeId !== null && (
                <p className="text-xs text-destructive">{fieldErrors.storeId}</p>
              )}
            </div>
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
                aria-invalid={fieldErrors.priceAmount !== null}
                className="h-11 rounded-xl bg-card"
              />
              {fieldErrors.priceAmount !== null && (
                <p className="text-xs text-destructive">{fieldErrors.priceAmount}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={packageSizeId} className="text-sm font-medium text-foreground">
                内容量
              </label>
              <QuantityField
                id={packageSizeId}
                value={packageSize}
                onValueChange={setPackageSize}
                placeholder={`例：${sizeExample}`}
                invalid={fieldErrors.packageSizeValue !== null}
              />
              {fieldErrors.packageSizeValue !== null && (
                <p className="text-xs text-destructive">{fieldErrors.packageSizeValue}</p>
              )}
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <AlertDialogClose
                render={
                  <Button type="button" variant="outline" className="h-9">
                    キャンセル
                  </Button>
                }
              />
              <Button type="submit" disabled={!canSubmit} className="h-9">
                {submitting ? '保存中' : '保存'}
              </Button>
            </div>
          </form>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
