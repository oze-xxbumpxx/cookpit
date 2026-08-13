'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { recipeTagSchema, type UpdateRecipeBody } from '@cookpit/api-contract';
import type { RecipeDto } from '@cookpit/application';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Announcements, DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useId, useRef } from 'react';
import { moveArrayItem } from '@/app/recipes/_utils/move-array-item';
import { IngredientRow, type IngredientRowValue } from '@/app/recipes/_components/ingredient-row';
import { StepRow, type StepRowValue } from '@/app/recipes/_components/step-row';
import { buildIngredientInput } from '@/app/recipes/_utils/build-ingredient-input';

export type RecipeTag = UpdateRecipeBody['tags'][number];

export interface RecipeFormValue {
  name: string;
  tags: RecipeTag[];
  cookingTime: string;
  ingredients: IngredientRowValue[];
  steps: StepRowValue[];
  notes: string;
}

export interface RecipeFieldErrors {
  baseServings: string | null;
  cookingTime: string | null;
  ingredients: Record<string, string>;
}

export interface RecipeFormBuildResult {
  input: UpdateRecipeBody | null;
  errors: RecipeFieldErrors;
}

const TAG_OPTIONS = recipeTagSchema.options;

/** dnd-kit の既定通知は英語のため、並べ替え対象に合わせた日本語文言へ差し替える。 */
function sortablePosition(entry: { data: { current?: { sortable?: { index: number } } } }): number {
  return (entry.data.current?.sortable?.index ?? 0) + 1;
}

function createReorderAnnouncements(kind: '材料' | '手順'): Announcements {
  return {
    onDragStart: ({ active }) => `${sortablePosition(active)}番目の${kind}をつかみました`,
    onDragOver: ({ over }) =>
      over === null ? '並べ替えできない位置です' : `${sortablePosition(over)}番目へ移動します`,
    onDragEnd: ({ over }) =>
      over === null ? '並べ替えを取り消しました' : `${sortablePosition(over)}番目に移動しました`,
    onDragCancel: () => '並べ替えを取り消しました',
  };
}

const INGREDIENT_REORDER_ANNOUNCEMENTS = createReorderAnnouncements('材料');
const STEP_REORDER_ANNOUNCEMENTS = createReorderAnnouncements('手順');

export function emptyRecipeFieldErrors(): RecipeFieldErrors {
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
  };
}

function createStepRow(id: string): StepRowValue {
  return {
    id,
    description: '',
  };
}

export function createInitialRecipeFormValue(): RecipeFormValue {
  return {
    name: '',
    tags: [],
    cookingTime: '',
    ingredients: [createIngredientRow('ingredient-0')],
    steps: [createStepRow('step-0')],
    notes: '',
  };
}

function toIngredientRowValue(
  ingredient: RecipeDto['ingredients'][number],
  index: number,
): IngredientRowValue {
  const id = `ingredient-${index}`;
  // 数量+単位は 1 欄（例：300g）へ結合。分量メモはそのまま。どちらも無い場合は空（防御的）。
  if (ingredient.amountValue !== null) {
    return {
      id,
      displayName: ingredient.displayName,
      amountText: `${ingredient.amountValue}${ingredient.amountUnit ?? ''}`,
    };
  }
  return {
    id,
    displayName: ingredient.displayName,
    amountText: ingredient.amountNote ?? '',
  };
}

export function toRecipeFormValue(recipe: RecipeDto): RecipeFormValue {
  return {
    name: recipe.name,
    tags: recipe.tags,
    cookingTime: recipe.cookingTime !== null ? String(recipe.cookingTime) : '',
    ingredients: recipe.ingredients.map((ingredient, index) =>
      toIngredientRowValue(ingredient, index),
    ),
    steps: recipe.steps.map((step, index) => ({
      id: `step-${index}`,
      description: step.description,
    })),
    notes: recipe.notes,
  };
}

/**
 * new/edit 共通のフォーム値検証と API ボディ組み立て。
 * baseServings は含まない（`UpdateRecipeBody` 形）。新規作成時は呼び出し側が
 * baseServings を検証して `CreateRecipeBody` に合成する。
 */
export function buildRecipeFormBody(value: RecipeFormValue): RecipeFormBuildResult {
  const errors = emptyRecipeFieldErrors();
  const trimmedCookingTime = value.cookingTime.trim();
  const parsedCookingTime = trimmedCookingTime === '' ? null : Number(trimmedCookingTime);

  if (
    parsedCookingTime !== null &&
    (!Number.isFinite(parsedCookingTime) ||
      !Number.isInteger(parsedCookingTime) ||
      parsedCookingTime < 0)
  ) {
    errors.cookingTime = '調理時間は0以上の整数で入力してください。';
  }

  const { ingredients: parsedIngredients, errors: ingredientErrors } = buildIngredientInput(
    value.ingredients,
  );
  errors.ingredients = ingredientErrors;

  const hasIngredientErrors = Object.keys(errors.ingredients).length > 0;
  if (errors.cookingTime !== null || hasIngredientErrors) {
    return { input: null, errors };
  }

  return {
    input: {
      name: value.name.trim(),
      tags: value.tags,
      cookingTime: parsedCookingTime,
      notes: value.notes,
      ingredients: parsedIngredients,
      steps: value.steps
        .map((row) => ({ description: row.description.trim() }))
        .filter((row) => row.description !== ''),
    },
    errors,
  };
}

interface Props {
  value: RecipeFormValue;
  fieldErrors: RecipeFieldErrors;
  onChange: (value: RecipeFormValue) => void;
  /** 基準人数フィールド。new は編集可能な Input、edit は読み取り専用表示を注入する。 */
  baseServingsSlot: ReactNode;
  /** 新規作成時にレシピ名へ自動フォーカスする（連続入力を速める）。 */
  autoFocusName?: boolean;
}

export function RecipeFormFields({
  value,
  fieldErrors,
  onChange,
  baseServingsSlot,
  autoFocusName = false,
}: Props) {
  const nameId = useId();
  const cookingTimeId = useId();
  const notesId = useId();
  const cookingTimeErrorId = useId();
  // DndContext は id 未指定だとインスタンス連番で aria-describedby を採番し、SSR と CSR で
  // 値がずれてハイドレーション不一致になる。useId は両者で一致するため id として渡す。
  const ingredientDndId = useId();
  const stepDndId = useId();
  const nextIngredientId = useRef(value.ingredients.length);
  // distance の活性化条件でタップ・クリックとの誤爆を防ぐ。PointerSensor はタッチも扱うため
  // TouchSensor は併用しない（同一操作が二重に活性化しうる）。
  const ingredientSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const stepSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const nextStepId = useRef(value.steps.length);

  function updateValue(next: Partial<RecipeFormValue>): void {
    onChange({
      ...value,
      ...next,
    });
  }

  function toggleTag(tag: RecipeTag): void {
    updateValue({
      tags: value.tags.includes(tag)
        ? value.tags.filter((current) => current !== tag)
        : [...value.tags, tag],
    });
  }

  function addIngredient(): void {
    const nextId = `ingredient-${nextIngredientId.current}`;
    nextIngredientId.current += 1;
    updateValue({ ingredients: [...value.ingredients, createIngredientRow(nextId)] });
  }

  function updateIngredient(next: IngredientRowValue): void {
    updateValue({
      ingredients: value.ingredients.map((row) => (row.id === next.id ? next : row)),
    });
  }

  function removeIngredient(id: string): void {
    updateValue({ ingredients: value.ingredients.filter((row) => row.id !== id) });
  }

  function handleIngredientDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (over === null || active.id === over.id) {
      return;
    }
    const from = value.ingredients.findIndex((row) => row.id === active.id);
    const to = value.ingredients.findIndex((row) => row.id === over.id);
    updateValue({ ingredients: moveArrayItem(value.ingredients, from, to) });
  }

  function addStep(): void {
    const nextId = `step-${nextStepId.current}`;
    nextStepId.current += 1;
    updateValue({ steps: [...value.steps, createStepRow(nextId)] });
  }

  function updateStep(next: StepRowValue): void {
    updateValue({ steps: value.steps.map((row) => (row.id === next.id ? next : row)) });
  }

  function removeStep(id: string): void {
    updateValue({ steps: value.steps.filter((row) => row.id !== id) });
  }

  function handleStepDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (over === null || active.id === over.id) {
      return;
    }
    const from = value.steps.findIndex((row) => row.id === active.id);
    const to = value.steps.findIndex((row) => row.id === over.id);
    updateValue({ steps: moveArrayItem(value.steps, from, to) });
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <label htmlFor={nameId} className="text-sm font-medium text-foreground">
          レシピ名 <span className="text-xs font-normal text-destructive">必須</span>
        </label>
        <Input
          id={nameId}
          value={value.name}
          onChange={(event) => updateValue({ name: event.target.value })}
          placeholder="例：鶏むね肉の塩こうじ漬け"
          autoFocus={autoFocusName}
          className="h-11 rounded-xl bg-card"
        />
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">
          タグ <span className="text-xs font-normal text-muted-foreground">複数選択可</span>
        </p>
        <div className="flex flex-wrap gap-2" aria-label="レシピタグ">
          {TAG_OPTIONS.map((tag) => {
            const selected = value.tags.includes(tag);
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
        {baseServingsSlot}

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
            value={value.cookingTime}
            onChange={(event) => updateValue({ cookingTime: event.target.value })}
            placeholder="25"
            aria-invalid={fieldErrors.cookingTime !== null}
            aria-describedby={fieldErrors.cookingTime === null ? undefined : cookingTimeErrorId}
            className="h-11 rounded-xl bg-card"
          />
          {fieldErrors.cookingTime !== null && (
            <p id={cookingTimeErrorId} className="text-xs text-destructive">
              {fieldErrors.cookingTime}
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">材料</p>
        <div className="flex flex-col gap-2">
          <DndContext
            id={ingredientDndId}
            sensors={ingredientSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleIngredientDragEnd}
            accessibility={{ announcements: INGREDIENT_REORDER_ANNOUNCEMENTS }}
          >
            <SortableContext
              items={value.ingredients.map((ingredient) => ingredient.id)}
              strategy={verticalListSortingStrategy}
            >
              {value.ingredients.map((ingredient, index) => (
                <IngredientRow
                  key={ingredient.id}
                  value={ingredient}
                  index={index}
                  errorMessage={fieldErrors.ingredients[ingredient.id] ?? null}
                  onChange={updateIngredient}
                  onRemove={() => removeIngredient(ingredient.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
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
          <DndContext
            id={stepDndId}
            sensors={stepSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleStepDragEnd}
            accessibility={{ announcements: STEP_REORDER_ANNOUNCEMENTS }}
          >
            <SortableContext
              items={value.steps.map((step) => step.id)}
              strategy={verticalListSortingStrategy}
            >
              {value.steps.map((step, index) => (
                <StepRow
                  key={step.id}
                  index={index}
                  value={step}
                  onChange={updateStep}
                  onRemove={() => removeStep(step.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
          <Button
            type="button"
            variant="outline"
            onClick={addStep}
            className="h-10 justify-start rounded-lg border-dashed bg-card text-foreground"
          >
            <Plus className="size-4" aria-hidden="true" />
            手順を追加
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor={notesId} className="text-sm font-medium text-foreground">
          メモ <span className="text-xs font-normal text-muted-foreground">任意</span>
        </label>
        <Textarea
          id={notesId}
          value={value.notes}
          onChange={(event) => updateValue({ notes: event.target.value })}
          placeholder="補足や保存方法など"
          className="min-h-24 rounded-xl bg-card"
        />
      </section>
    </div>
  );
}
