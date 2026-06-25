'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { client } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  IngredientRow,
  type IngredientRowValue,
  type IngredientUnit,
} from '@/app/recipes/_components/ingredient-row';
import { StepRow, type StepRowValue } from '@/app/recipes/_components/step-row';
import { buildIngredientInput } from '@/app/recipes/_utils/build-ingredient-input';
import { recipeTagSchema, unitSchema, type UpdateRecipeBody } from '@cookpit/api-contract';
import type { RecipeDto } from '@cookpit/application';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useId, useRef, useState } from 'react';

type RecipeTag = UpdateRecipeBody['tags'][number];

interface FieldErrors {
  cookingTime: string | null;
  ingredients: Record<string, string>;
}

interface BuildResult {
  input: UpdateRecipeBody | null;
  errors: FieldErrors;
}

const TAG_OPTIONS = recipeTagSchema.options;
const UNIT_OPTIONS = unitSchema.options;

function emptyFieldErrors(): FieldErrors {
  return {
    cookingTime: null,
    ingredients: {},
  };
}

function toIngredientRowValue(
  ingredient: RecipeDto['ingredients'][number],
  index: number,
): IngredientRowValue {
  const id = `ingredient-${index}`;
  if (ingredient.amountValue !== null) {
    return {
      id,
      displayName: ingredient.displayName,
      amountText: String(ingredient.amountValue),
      amountUnit: ingredient.amountUnit as IngredientUnit,
    };
  }
  if (ingredient.amountNote !== null) {
    return {
      id,
      displayName: ingredient.displayName,
      amountText: ingredient.amountNote,
      amountUnit: '',
    };
  }
  // 防御的フォールバック: DB 制約上この分岐には入らない
  return {
    id,
    displayName: ingredient.displayName,
    amountText: '',
    amountUnit: '',
  };
}

interface Props {
  recipe: RecipeDto;
}

export function RecipeEditFormClient({ recipe }: Props) {
  const router = useRouter();
  const nameId = useId();
  const cookingTimeId = useId();
  const notesId = useId();
  const cookingTimeErrorId = useId();
  const nextIngredientId = useRef(recipe.ingredients.length + 1);
  const nextStepId = useRef(recipe.steps.length + 1);

  const [name, setName] = useState(recipe.name);
  const [tags, setTags] = useState<RecipeTag[]>(recipe.tags);
  const [cookingTime, setCookingTime] = useState(
    recipe.cookingTime !== null ? String(recipe.cookingTime) : '',
  );
  const [ingredients, setIngredients] = useState<IngredientRowValue[]>(() =>
    recipe.ingredients.map((ingredient, index) => toIngredientRowValue(ingredient, index)),
  );
  const [steps, setSteps] = useState<StepRowValue[]>(() =>
    recipe.steps.map((step, index) => ({ id: `step-${index}`, description: step.description })),
  );
  const [notes, setNotes] = useState(recipe.notes);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(emptyFieldErrors);

  const baseServings = recipe.baseServings;
  const canSubmit = name.trim() !== '' && !submitting;

  function toggleTag(tag: RecipeTag): void {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((value) => value !== tag) : [...prev, tag],
    );
  }

  function addIngredient(): void {
    const nextId = `ingredient-${nextIngredientId.current}`;
    nextIngredientId.current += 1;
    setIngredients((prev) => [
      ...prev,
      { id: nextId, displayName: '', amountText: '', amountUnit: '' },
    ]);
  }

  function updateIngredient(next: IngredientRowValue): void {
    setIngredients((prev) => prev.map((row) => (row.id === next.id ? next : row)));
  }

  function removeIngredient(id: string): void {
    setIngredients((prev) => prev.filter((row) => row.id !== id));
    setFieldErrors((prev) => {
      const nextIngredientErrors = { ...prev.ingredients };
      delete nextIngredientErrors[id];
      return {
        ...prev,
        ingredients: nextIngredientErrors,
      };
    });
  }

  function addStep(): void {
    const nextId = `step-${nextStepId.current}`;
    nextStepId.current += 1;
    setSteps((prev) => [...prev, { id: nextId, description: '' }]);
  }

  function updateStep(next: StepRowValue): void {
    setSteps((prev) => prev.map((row) => (row.id === next.id ? next : row)));
  }

  function removeStep(id: string): void {
    setSteps((prev) => prev.filter((row) => row.id !== id));
  }

  function buildUpdateInput(): BuildResult {
    const errors = emptyFieldErrors();
    const trimmedCookingTime = cookingTime.trim();
    const parsedCookingTime = trimmedCookingTime === '' ? null : Number(trimmedCookingTime);

    if (
      parsedCookingTime !== null &&
      (!Number.isFinite(parsedCookingTime) ||
        !Number.isInteger(parsedCookingTime) ||
        parsedCookingTime < 0)
    ) {
      errors.cookingTime = '調理時間は0以上の整数で入力してください。';
    }

    const { ingredients: parsedIngredients, errors: ingredientErrors } =
      buildIngredientInput(ingredients);
    errors.ingredients = ingredientErrors;

    const hasIngredientErrors = Object.keys(errors.ingredients).length > 0;
    if (errors.cookingTime !== null || hasIngredientErrors) {
      return { input: null, errors };
    }

    return {
      input: {
        name: name.trim(),
        tags,
        cookingTime: parsedCookingTime,
        notes,
        ingredients: parsedIngredients,
        steps: steps
          .map((row) => ({ description: row.description.trim() }))
          .filter((row) => row.description !== ''),
      },
      errors,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const result = buildUpdateInput();
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
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/recipes/${recipe.id}`)}
              className="h-9 px-2 text-foreground"
            >
              キャンセル
            </Button>
          </div>
          <h1 className="text-lg font-semibold text-foreground">レシピを編集</h1>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!canSubmit} className="h-9 px-4">
              {submitting ? '保存中' : '保存'}
            </Button>
          </div>
        </header>

        {errorMessage !== null && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <label htmlFor={nameId} className="text-sm font-medium text-foreground">
              レシピ名 <span className="text-xs font-normal text-red-600">必須</span>
            </label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例：鶏むね肉の塩こうじ漬け"
              className="h-11 rounded-xl bg-card"
            />
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">
              タグ <span className="text-xs font-normal text-muted-foreground">複数選択可</span>
            </p>
            <div className="flex flex-wrap gap-2" aria-label="レシピタグ">
              {TAG_OPTIONS.map((tag) => {
                const selected = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={selected}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm transition-colors',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-secondary text-secondary-foreground hover:bg-muted',
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">基準人数</p>
              <p className="flex h-11 items-center rounded-xl bg-card px-3 text-sm text-foreground">
                {baseServings}人分
              </p>
              <p className="text-xs text-muted-foreground">（作成後は変更できません）</p>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor={cookingTimeId} className="text-sm font-medium text-foreground">
                調理時間 <span className="text-xs font-normal text-muted-foreground">任意</span>
              </label>
              <Input
                id={cookingTimeId}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={cookingTime}
                onChange={(event) => setCookingTime(event.target.value)}
                placeholder="25"
                aria-invalid={fieldErrors.cookingTime !== null}
                aria-describedby={fieldErrors.cookingTime === null ? undefined : cookingTimeErrorId}
                className="h-11 rounded-xl bg-card"
              />
              {fieldErrors.cookingTime !== null && (
                <p id={cookingTimeErrorId} className="text-xs text-red-600">
                  {fieldErrors.cookingTime}
                </p>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">材料</p>
            <div className="flex flex-col gap-2">
              {ingredients.map((ingredient) => (
                <IngredientRow
                  key={ingredient.id}
                  value={ingredient}
                  errorMessage={fieldErrors.ingredients[ingredient.id] ?? null}
                  onChange={updateIngredient}
                  onRemove={() => removeIngredient(ingredient.id)}
                  unitOptions={UNIT_OPTIONS}
                />
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={addIngredient}
                className="h-10 justify-start rounded-lg border-dashed bg-card text-foreground"
              >
                <Plus className="size-4" aria-hidden="true" />
                材料を追加
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">作り方</p>
            <div className="flex flex-col gap-3">
              {steps.map((step, index) => (
                <StepRow
                  key={step.id}
                  index={index}
                  value={step}
                  onChange={updateStep}
                  onRemove={() => removeStep(step.id)}
                />
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={addStep}
                className="h-10 justify-start rounded-lg border-dashed bg-card text-foreground"
              >
                <Plus className="size-4" aria-hidden="true" />
                ステップを追加
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <label htmlFor={notesId} className="text-sm font-medium text-foreground">
              メモ <span className="text-xs font-normal text-muted-foreground">任意</span>
            </label>
            <Textarea
              id={notesId}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="補足や保存方法など"
              className="min-h-24 rounded-xl bg-card"
            />
          </section>
        </div>
      </form>
    </main>
  );
}
