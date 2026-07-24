import type { CreateRecipeBody } from '@cookpit/api-contract';
import type { IngredientRowValue } from '@/app/recipes/_components/ingredient-row';
import { parseQuantity } from '@/lib/parse-quantity';

type RecipeIngredientBody = CreateRecipeBody['ingredients'][number];

export function buildIngredientInput(rows: IngredientRowValue[]): {
  ingredients: RecipeIngredientBody[];
  errors: Record<string, string>;
} {
  const ingredients: RecipeIngredientBody[] = [];
  const errors: Record<string, string> = {};

  for (const row of rows) {
    const displayName = row.displayName.trim();
    const amountText = row.amountText.trim();
    const isEmptyRow = displayName === '' && amountText === '';

    if (isEmptyRow) {
      continue;
    }

    if (displayName === '') {
      errors[row.id] = '食材名を入力してください。';
      continue;
    }

    if (amountText === '') {
      errors[row.id] = '量を入力してください。';
      continue;
    }

    const parsed = parseQuantity(amountText);

    if (parsed.kind === 'amount') {
      ingredients.push({
        productRef: null,
        displayName,
        amountValue: parsed.value,
        amountUnit: parsed.unit,
        amountNote: null,
      });
      continue;
    }

    if (parsed.kind === 'valueOnly') {
      errors[row.id] = '数値の量には単位も入力してください。';
      continue;
    }

    // 数値で始まらない入力（例：少々）は分量メモとして扱う。
    ingredients.push({
      productRef: null,
      displayName,
      amountValue: null,
      amountUnit: null,
      amountNote: amountText,
    });
  }

  return { ingredients, errors };
}
