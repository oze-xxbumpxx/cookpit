'use client';

import { Button } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import type { RecipeDto } from '@cookpit/application';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { LeaveConfirmationDialog } from '@/app/_components/leave-confirmation-dialog';
import { isRecipeFormDirty, type RecipeFormSnapshot } from '@/app/recipes/_utils/recipe-form-dirty';
import { useLeaveConfirmation } from '@/lib/use-leave-confirmation';
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

  // baseServings は編集不可なので、初期値・現在値の両方に同じ文字列を渡して判定から外す。
  const baseServings = String(recipe.baseServings);
  const [initialSnapshot] = useState<RecipeFormSnapshot>(() => ({ value, baseServings }));
  const dirty = isRecipeFormDirty(initialSnapshot, { value, baseServings });
  const detailHref = `/recipes/${recipe.id}`;
  const leave = useLeaveConfirmation({ dirty, fallbackHref: detailHref });

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
        leave.leaveAfterSave(detailHref);
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
        <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex justify-start">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => leave.requestLeave(detailHref)}
              className="h-9 px-2"
            >
              キャンセル
            </Button>
          </div>
          <h1 className="min-w-0 truncate text-center text-xl font-semibold text-foreground">
            レシピを編集
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

      <LeaveConfirmationDialog
        open={leave.confirmOpen}
        onOpenChange={leave.onConfirmOpenChange}
        onConfirm={leave.confirmLeave}
      />
    </main>
  );
}
