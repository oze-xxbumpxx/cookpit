'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { client } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { recipeTagSchema, unitSchema, type CreateRecipeBody } from '@cookpit/api-contract';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useId, useRef, useState } from 'react';
import { IngredientRow, type IngredientRowValue } from './ingredient-row';
import { StepRow, type StepRowValue } from './step-row';

type RecipeTag = CreateRecipeBody['tags'][number];

interface FieldErrors {
  baseServings: string | null;
  cookingTime: string | null;
  ingredients: Record<string, string>;
}

interface BuildResult {
  input: CreateRecipeBody | null;
  errors: FieldErrors;
}

const TAG_OPTIONS = recipeTagSchema.options;
const UNIT_OPTIONS = unitSchema.options;

function emptyFieldErrors(): FieldErrors {
  return {
    baseServings: null,
    cookingTime: null,
    ingredients: {},
  };
}

function createIngredientRow(id: string): IngredientRowValue {
  return {
    id,
    displayName: '',
    amountText: '',
    amountUnit: '',
  };
}

function createStepRow(id: string): StepRowValue {
  return {
    id,
    description: '',
  };
}

export function RecipeFormClient() {
  const router = useRouter();
  const nameId = useId();
  const baseServingsId = useId();
  const cookingTimeId = useId();
  const notesId = useId();
  const baseServingsErrorId = useId();
  const cookingTimeErrorId = useId();
  const nextIngredientId = useRef(2);
  const nextStepId = useRef(2);

  const [name, setName] = useState('');
  const [tags, setTags] = useState<RecipeTag[]>([]);
  const [baseServings, setBaseServings] = useState('2');
  const [cookingTime, setCookingTime] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRowValue[]>([
    createIngredientRow('ingredient-1'),
  ]);
  const [steps, setSteps] = useState<StepRowValue[]>([createStepRow('step-1')]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(emptyFieldErrors);

  const canSubmit = name.trim() !== '' && !submitting;

  function toggleTag(tag: RecipeTag): void {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((value) => value !== tag) : [...prev, tag],
    );
  }

  function addIngredient(): void {
    const nextId = `ingredient-${nextIngredientId.current}`;
    nextIngredientId.current += 1;
    setIngredients((prev) => [...prev, createIngredientRow(nextId)]);
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
    setSteps((prev) => [...prev, createStepRow(nextId)]);
  }

  function updateStep(next: StepRowValue): void {
    setSteps((prev) => prev.map((row) => (row.id === next.id ? next : row)));
  }

  function removeStep(id: string): void {
    setSteps((prev) => prev.filter((row) => row.id !== id));
  }

  function buildCreateInput(): BuildResult {
    const errors = emptyFieldErrors();
    const parsedIngredients: CreateRecipeBody['ingredients'] = [];
    const trimmedBaseServings = baseServings.trim();
    const parsedBaseServings = Number(trimmedBaseServings);
    const trimmedCookingTime = cookingTime.trim();
    const parsedCookingTime = trimmedCookingTime === '' ? null : Number(trimmedCookingTime);

    if (
      trimmedBaseServings === '' ||
      !Number.isFinite(parsedBaseServings) ||
      parsedBaseServings <= 0
    ) {
      errors.baseServings = '基準人数は1以上の数値で入力してください。';
    }

    if (
      parsedCookingTime !== null &&
      (!Number.isFinite(parsedCookingTime) ||
        !Number.isInteger(parsedCookingTime) ||
        parsedCookingTime < 0)
    ) {
      errors.cookingTime = '調理時間は0以上の整数で入力してください。';
    }

    for (const row of ingredients) {
      const displayName = row.displayName.trim();
      const amountText = row.amountText.trim();
      const isEmptyRow = displayName === '' && amountText === '' && row.amountUnit === '';

      if (isEmptyRow) {
        continue;
      }

      if (displayName === '') {
        errors.ingredients[row.id] = '食材名を入力してください。';
        continue;
      }

      if (amountText === '') {
        errors.ingredients[row.id] = '量を入力してください。';
        continue;
      }

      const amountValue = Number(amountText);
      const isNumericAmount = !Number.isNaN(amountValue);

      if (isNumericAmount) {
        if (!Number.isFinite(amountValue) || amountValue < 0) {
          errors.ingredients[row.id] = '量は0以上の数値で入力してください。';
          continue;
        }

        if (row.amountUnit === '') {
          errors.ingredients[row.id] = '数値の量には単位を選択してください。';
          continue;
        }

        parsedIngredients.push({
          productRef: null,
          displayName,
          amountValue,
          amountUnit: row.amountUnit,
          amountNote: null,
        });
        continue;
      }

      parsedIngredients.push({
        productRef: null,
        displayName,
        amountValue: null,
        amountUnit: null,
        amountNote: amountText,
      });
    }

    const hasIngredientErrors = Object.keys(errors.ingredients).length > 0;
    if (errors.baseServings !== null || errors.cookingTime !== null || hasIngredientErrors) {
      return {
        input: null,
        errors,
      };
    }

    return {
      input: {
        name: name.trim(),
        tags,
        baseServings: parsedBaseServings,
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
          <h1 className="text-lg font-semibold text-foreground">レシピを追加</h1>
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
                <p id={baseServingsErrorId} className="text-xs text-red-600">
                  {fieldErrors.baseServings}
                </p>
              )}
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
