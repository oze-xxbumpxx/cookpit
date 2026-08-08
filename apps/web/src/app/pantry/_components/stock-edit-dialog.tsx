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
import { SelectField } from '@/components/ui/select-field';
import { client } from '@/lib/api-client';
import { parseQuantity } from '@/lib/parse-quantity';
import type { UpdateStockBody } from '@cookpit/api-contract';
import type { StockDto } from '@cookpit/application';
import { useRouter } from 'next/navigation';
import type { FormEvent, JSX } from 'react';
import { useEffect, useId, useState } from 'react';
import {
  LOCATION_SELECT_OPTIONS,
  UNSET_LOCATION_VALUE,
  toStorageLocation,
} from '../_utils/pantry-view';

interface Props {
  stock: StockDto | null;
  onOpenChange: (open: boolean) => void;
}

interface FieldErrors {
  amount: string | null;
  storedLocation: string | null;
  expiresAt: string | null;
}

function emptyFieldErrors(): FieldErrors {
  return { amount: null, storedLocation: null, expiresAt: null };
}

function errorMessageFromPayload(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) {
    return null;
  }
  return typeof payload.error === 'string' ? payload.error : null;
}

export function StockEditDialog({ stock, onOpenChange }: Props): JSX.Element {
  const router = useRouter();
  const amountId = useId();
  const locationId = useId();
  const expiresAtId = useId();

  const [amount, setAmount] = useState('');
  const [storedLocation, setStoredLocation] = useState(UNSET_LOCATION_VALUE);
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(emptyFieldErrors);

  const open = stock !== null;

  useEffect(() => {
    if (stock === null) {
      return;
    }
    const targetStock = stock;
    let cancelled = false;

    async function initialize(): Promise<void> {
      await Promise.resolve();
      if (cancelled) {
        return;
      }
      setAmount(`${targetStock.amount.value}${targetStock.amount.unit}`);
      setStoredLocation(targetStock.storedLocation ?? UNSET_LOCATION_VALUE);
      setExpiresAt(targetStock.expiresAt ?? '');
      setErrorMessage(null);
      setFieldErrors(emptyFieldErrors());
    }
    void initialize();
    return () => {
      cancelled = true;
    };
    // stock.id が変わったときだけ、編集対象の初期値を再投入する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock?.id]);

  function buildBody(): UpdateStockBody | null {
    const errors = emptyFieldErrors();
    const parsedAmount = parseQuantity(amount);
    if (parsedAmount.kind !== 'amount' || parsedAmount.value <= 0) {
      errors.amount = '数量は「数値+単位」で、0より大きい値を入力してください。';
    }
    setFieldErrors(errors);

    if (errors.amount !== null || parsedAmount.kind !== 'amount') {
      return null;
    }
    return {
      amount: { value: parsedAmount.value, unit: parsedAmount.unit },
      storedLocation: toStorageLocation(storedLocation),
      expiresAt: expiresAt === '' ? null : expiresAt,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (stock === null || submitting) {
      return;
    }
    setErrorMessage(null);
    const body = buildBody();
    if (body === null) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await client.api.pantry.stocks[':stockId'].$put({
        param: { stockId: stock.id },
        json: body,
      });
      if (response.ok) {
        onOpenChange(false);
        router.refresh();
        return;
      }

      const status: number = response.status;
      if (status === 404) {
        setErrorMessage('この在庫はすでに削除されています');
        onOpenChange(false);
        router.refresh();
        return;
      }
      if (status === 422) {
        const message = errorMessageFromPayload(await response.json());
        setFieldErrors({
          ...emptyFieldErrors(),
          amount: message ?? '数量を確認してください。',
        });
        return;
      }
      setErrorMessage('在庫の更新に失敗しました。');
    } catch {
      setErrorMessage('通信エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {stock !== null && (
        <AlertDialogContent>
          <AlertDialogTitle>在庫を編集</AlertDialogTitle>
          <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
            {errorMessage !== null && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <label htmlFor={amountId} className="text-sm font-medium text-foreground">
                数量
              </label>
              <QuantityField
                id={amountId}
                value={amount}
                onValueChange={setAmount}
                invalid={fieldErrors.amount !== null}
              />
              {fieldErrors.amount !== null && (
                <p className="text-xs text-destructive">{fieldErrors.amount}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={locationId} className="text-sm font-medium text-foreground">
                保存場所
              </label>
              <SelectField
                id={locationId}
                value={storedLocation}
                onValueChange={setStoredLocation}
                options={LOCATION_SELECT_OPTIONS}
                invalid={fieldErrors.storedLocation !== null}
              />
              {fieldErrors.storedLocation !== null && (
                <p className="text-xs text-destructive">{fieldErrors.storedLocation}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={expiresAtId} className="text-sm font-medium text-foreground">
                賞味期限
              </label>
              <Input
                id={expiresAtId}
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.currentTarget.value)}
                aria-invalid={fieldErrors.expiresAt !== null}
                className="h-11 rounded-xl bg-card"
              />
              {fieldErrors.expiresAt !== null && (
                <p className="text-xs text-destructive">{fieldErrors.expiresAt}</p>
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
              <Button type="submit" disabled={submitting} className="h-9">
                {submitting ? '保存中' : '保存'}
              </Button>
            </div>
          </form>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
