'use client';

import { Button } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import type { RecipeDto } from '@cookpit/application';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';
import {
  RecipeFormFields,
  buildRecipeFormBody,
  emptyRecipeFieldErrors,
  toRecipeFormValue,
  type RecipeFieldErrors,
} from '@/app/recipes/_components/recipe-form-fields';

interface Props {
  recipe: RecipeDto;
}

export function RecipeEditFormClient({ recipe }: Props) {
  const router = useRouter();

  const [value, setValue] = useState(() => toRecipeFormValue(recipe));
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<RecipeFieldErrors>(emptyRecipeFieldErrors);

  const canSubmit = value.name.trim() !== '' && !submitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const result = buildRecipeFormBody(value);
    setFieldErrors(result.errors);
    setErrorMessage(null);

    if (result.input === null) {
      setErrorMessage('入力内容を確認してください。');
      return;
    }

    setSubmitting(true);
    try {
      const response = await client.api.recipes[':id'].$put({
        param: { id: recipe.id },
        json: result.input,
      });
      if (response.ok) {
        router.push(`/recipes/${recipe.id}`);
        router.refresh();
        return;
      }
      setErrorMessage('保存に失敗しました。');
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
              variant="outline"
              size="sm"
              onClick={() => router.push(`/recipes/${recipe.id}`)}
              className="h-9 px-2"
            >
              キャンセル
            </Button>
          </div>
          <h1 className="text-xl font-semibold text-foreground">レシピを編集</h1>
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

        <RecipeFormFields
          value={value}
          fieldErrors={fieldErrors}
          onChange={setValue}
          baseServingsSlot={
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">基準人数</p>
              <p className="flex h-11 items-center rounded-xl bg-card px-3 text-sm text-foreground">
                {recipe.baseServings}人分
              </p>
              <p className="text-xs text-muted-foreground">（作成後は変更できません）</p>
            </div>
          }
        />
      </form>
    </main>
  );
}
