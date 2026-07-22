'use client';

import { Button } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import {
  ProductFormFields,
  buildProductFormBody,
  emptyProductFieldErrors,
  toProductCategory,
  toProductUnit,
  type ProductFormValue,
} from '@/app/products/_components/product-form-fields';
import type { ProductDto } from '@cookpit/application';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';

interface Props {
  product: ProductDto;
}

function toFormValue(product: ProductDto): ProductFormValue {
  return {
    name: product.name,
    aliasesText: product.aliases.join(', '),
    category: toProductCategory(product.category),
    defaultUnit: toProductUnit(product.defaultUnit),
  };
}

export function ProductEditFormClient({ product }: Props) {
  const router = useRouter();
  const [value, setValue] = useState<ProductFormValue>(() => toFormValue(product));
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState(emptyProductFieldErrors);

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
      const response = await client.api.products[':id'].$put({
        param: { id: product.id },
        json: result.input,
      });
      if (!response.ok) {
        setErrorMessage('保存に失敗しました。入力内容を確認してください。');
        return;
      }
      router.push(`/products/${product.id}`);
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
        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex justify-start">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/products/${product.id}`)}
              className="h-9 px-2 text-foreground"
            >
              キャンセル
            </Button>
          </div>
          <h1 className="text-xl font-semibold text-foreground">商品を編集</h1>
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

        <ProductFormFields value={value} fieldErrors={fieldErrors} onChange={setValue} />
      </form>
    </main>
  );
}
