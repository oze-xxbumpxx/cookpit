import type { CreateRecipeBody } from '@cookpit/api-contract';
import type { IngredientRowValue } from '@/app/recipes/_components/ingredient-row';

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
    const isEmptyRow = displayName === '' && amountText === '' && row.amountUnit === '';

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

    const amountValue = Number(amountText);
    const isNumericAmount = !Number.isNaN(amountValue);

    if (isNumericAmount) {
      if (!Number.isFinite(amountValue) || amountValue < 0) {
        errors[row.id] = '量は0以上の数値で入力してください。';
        continue;
      }

      if (row.amountUnit === '') {
        errors[row.id] = '数値の量には単位を選択してください。';
        continue;
      }

      ingredients.push({
        productRef: null,
        displayName,
        amountValue,
        amountUnit: row.amountUnit,
        amountNote: null,
      });
      continue;
    }

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
