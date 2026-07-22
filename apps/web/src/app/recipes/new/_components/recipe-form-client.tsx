'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { client } from '@/lib/api-client';
import type { CreateRecipeBody } from '@cookpit/api-contract';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useId, useState } from 'react';
import {
  RecipeFormFields,
  buildRecipeFormBody,
  createInitialRecipeFormValue,
  emptyRecipeFieldErrors,
  type RecipeFieldErrors,
} from '@/app/recipes/_components/recipe-form-fields';

interface BuildResult {
  input: CreateRecipeBody | null;
  errors: RecipeFieldErrors;
}

export function RecipeFormClient() {
  const router = useRouter();
  const baseServingsId = useId();
  const baseServingsErrorId = useId();

  const [value, setValue] = useState(createInitialRecipeFormValue);
  const [baseServings, setBaseServings] = useState('2');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<RecipeFieldErrors>(emptyRecipeFieldErrors);

  const canSubmit = value.name.trim() !== '' && !submitting;

  function buildCreateInput(): BuildResult {
    const result = buildRecipeFormBody(value);
    const errors = result.errors;
    const trimmedBaseServings = baseServings.trim();
    const parsedBaseServings = Number(trimmedBaseServings);

    if (
      trimmedBaseServings === '' ||
      !Number.isFinite(parsedBaseServings) ||
      parsedBaseServings <= 0
    ) {
      errors.baseServings = '基準人数は1以上の数値で入力してください。';
    }

    if (result.input === null || errors.baseServings !== null) {
      return { input: null, errors };
    }

    return {
      input: {
        ...result.input,
        baseServings: parsedBaseServings,
      },
      errors,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const result = buildCreateInput();
    setFieldErrors(result.errors);
    setErrorMessage(null);

    if (result.input === null) {
      setErrorMessage('入力内容を確認してください。');
      return;
    }

    setSubmitting(true);
    try {
      const response = await client.api.recipes.$post({ json: result.input });
      if (!response.ok) {
        setErrorMessage('保存に失敗しました。入力内容を確認してください。');
        return;
      }
      router.push('/recipes');
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
              onClick={() => router.push('/recipes')}
              className="h-9 px-2 text-foreground"
            >
              キャンセル
            </Button>
          </div>
          <h1 className="text-xl font-semibold text-foreground">レシピを追加</h1>
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
              <label htmlFor={baseServingsId} className="text-sm font-medium text-foreground">
                基準人数
              </label>
              <Input
                id={baseServingsId}
                type="number"
                min="1"
                step="1"
                inputMode="decimal"
                value={baseServings}
                onChange={(event) => setBaseServings(event.target.value)}
                aria-invalid={fieldErrors.baseServings !== null}
                aria-describedby={
                  fieldErrors.baseServings === null ? undefined : baseServingsErrorId
                }
                className="h-11 rounded-xl bg-card"
              />
              {fieldErrors.baseServings !== null && (
                <p id={baseServingsErrorId} className="text-xs text-destructive">
                  {fieldErrors.baseServings}
                </p>
              )}
            </div>
          }
          autoFocusName
        />
      </form>
    </main>
  );
}
