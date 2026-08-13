'use client';

import { Button } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import { LeaveConfirmationDialog } from '@/app/_components/leave-confirmation-dialog';
import {
  ProductFormFields,
  buildProductFormBody,
  createInitialProductFormValue,
  emptyProductFieldErrors,
} from '@/app/products/_components/product-form-fields';
import { isProductFormDirty } from '@/app/products/_utils/product-form-dirty';
import { useLeaveConfirmation } from '@/lib/use-leave-confirmation';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';

export function ProductFormClient() {
  const router = useRouter();
  const [value, setValue] = useState(createInitialProductFormValue);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState(emptyProductFieldErrors);

  // 初回レンダーの値を離脱判定の基準にする。useState の初期化関数は 1 度しか走らないため
  // スナップショットは以後不変（ref はレンダー中に読めないのでこちらを使う）。
  const [initialSnapshot] = useState(() => value);
  const dirty = isProductFormDirty(initialSnapshot, value);
  const leave = useLeaveConfirmation({ dirty, fallbackHref: '/products' });

  const canSubmit = value.name.trim() !== '' && !submitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const result = buildProductFormBody(value);
    setFieldErrors(result.errors);
    setErrorMessage(null);

    if (result.input === null) {
      setErrorMessage('入力内容を確認してください。');
      return;
    }

    setSubmitting(true);
    try {
      const response = await client.api.products.$post({ json: result.input });
      if (!response.ok) {
        setErrorMessage('保存に失敗しました。入力内容を確認してください。');
        return;
      }
      leave.leaveAfterSave('/products');
      router.refresh();
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4"
      >
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex justify-start">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => leave.requestLeave('/products')}
              className="h-9 px-2"
            >
              キャンセル
            </Button>
          </div>
          <h1 className="min-w-0 truncate text-center text-xl font-semibold text-foreground">
            商品を追加
          </h1>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!canSubmit} className="h-9 px-4">
              {submitting ? '保存中' : '保存'}
            </Button>
          </div>
        </header>

        {errorMessage !== null && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        <ProductFormFields
          value={value}
          fieldErrors={fieldErrors}
          onChange={setValue}
          autoFocusName
        />
      </form>

      <LeaveConfirmationDialog
        open={leave.confirmOpen}
        onOpenChange={leave.onConfirmOpenChange}
        onConfirm={leave.confirmLeave}
      />
    </main>
  );
}
