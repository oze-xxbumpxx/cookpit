import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

interface RecipeFixture {
  id: string;
  name: string;
  ingredientName: string;
}

function resolveRecipeId(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string') {
    return body.id;
  }
  throw new Error('レシピ作成レスポンスに id がありません。');
}

function createUniqueSaturday(token: string): string {
  let hash = 0;
  for (const character of token) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  const baseSaturday = Date.UTC(2030, 0, 5);
  const weekOffset = hash % 10_000;
  return new Date(baseSaturday + weekOffset * 7 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

async function createRecipeFixture(
  request: APIRequestContext,
  token: string,
): Promise<RecipeFixture> {
  const name = `E2E土曜フロー-${token}`;
  const ingredientName = `E2E食材-${token}`;
  const response = await request.post('/api/recipes', {
    data: {
      name,
      ingredients: [
        {
          productRef: null,
          displayName: ingredientName,
          amountValue: 2,
          amountUnit: '個',
          amountNote: null,
        },
      ],
      steps: [{ description: 'E2E用の手順' }],
      baseServings: 2,
      tags: [],
      cookingTime: null,
      notes: '',
    },
  });

  expect(response.status()).toBe(201);
  return { id: resolveRecipeId(await response.json()), name, ingredientName };
}

// 土曜の主要運用を、献立作成から在庫消費まで画面経由で通す。
// MealPlan / ShoppingList には削除 API がないため、一意な未来週を使って共有 DB との衝突を避ける。
test('献立から買い物リストを作り、購入品を在庫化して消費できる', async ({ page, request }) => {
  const token = randomUUID().slice(0, 8);
  const saturday = createUniqueSaturday(token);
  let recipe: RecipeFixture | null = null;

  try {
    recipe = await createRecipeFixture(request, token);

    await page.goto(`/meal-plans?week=${saturday}`);
    await expect(page.getByRole('heading', { name: '献立' })).toBeVisible();
    await page.getByRole('button', { name: 'この週の献立を作る' }).click();
    await expect(page.getByText('献立作成中', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'レシピを追加' }).click();
    await page.getByPlaceholder('レシピを検索').fill(recipe.name);
    await page.getByRole('button', { name: recipe.name, exact: true }).click();
    await page.getByRole('button', { name: '2×', exact: true }).click();
    await page.getByRole('button', { name: '献立に追加' }).click();
    await expect(page.getByRole('link', { name: recipe.name, exact: true })).toBeVisible();

    await page.getByRole('button', { name: '買い物リストを作る' }).click();
    await expect(page).toHaveURL(/\/shopping-lists\/[^/]+$/);
    await expect(page.getByText(recipe.ingredientName, { exact: true })).toBeVisible();

    await page.getByRole('checkbox', { name: `${recipe.ingredientName}をチェックする` }).click();
    await expect(
      page.getByRole('checkbox', { name: `${recipe.ingredientName}のチェックを外す` }),
    ).toBeVisible();

    await page.getByRole('button', { name: '金額を記録' }).click();
    await page.getByLabel('価格').fill('198');
    await page.getByLabel('実購入店舗').click();
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: '購入を記録' }).click();
    await expect(page.getByText(/¥198 購入/)).toBeVisible();

    await page.getByRole('button', { name: '買い物完了' }).click();
    await expect(page.getByRole('heading', { name: '在庫に追加する品目' })).toBeVisible();
    await page.getByRole('button', { name: '完了する' }).click();
    await expect(page.getByText('買い物を完了しました', { exact: true })).toBeVisible();
    await expect(page.getByText('1件を在庫に追加しました', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: '在庫を見る' }).click();
    await expect(page).toHaveURL(/\/pantry$/);
    const stockRow = page.getByRole('listitem').filter({ hasText: recipe.ingredientName });
    await expect(stockRow).toBeVisible();
    await stockRow.getByRole('button', { name: '消費' }).click();
    await expect(stockRow).toHaveCount(0);
  } finally {
    if (recipe !== null) {
      const response = await request.delete(`/api/recipes/${recipe.id}`);
      expect(response.status()).toBe(204);
    }
  }
});
