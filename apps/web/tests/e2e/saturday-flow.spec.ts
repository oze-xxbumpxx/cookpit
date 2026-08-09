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

/**
 * 買い物完了パネルで入力する賞味期限。**固定日**にして「今日」に依存させない
 * （CI が日付境界をまたいでも揺れないようにするため）。緊急度チップの閾値（3 日）から
 * 十分離れているので、在庫カードにはチップではなく `formatExpiresAt` の日付表記だけが出る。
 */
const STOCK_EXPIRES_AT = '2030-12-24';
const STOCK_EXPIRES_AT_LABEL = '12/24まで';

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

    // 賞味期限の任意入力（Sprint 8 Unit A）。既定は非表示で、設定ボタンで独立行を展開する。
    // RTL（CSP-01〜06）はパネル内の挙動までしか見られないので、ここでは
    // 「入力した期限が DB を通って /pantry に出る」ことを end-to-end で押さえる
    // （roadmap Sprint 8 完了条件「買い物完了時に賞味期限を入力できる（任意）」の裏取り）。
    await expect(page.getByLabel('賞味期限')).toHaveCount(0);
    await page.getByRole('button', { name: '賞味期限を設定' }).click();
    await page.getByLabel('賞味期限').fill(STOCK_EXPIRES_AT);

    await page.getByRole('button', { name: '完了する' }).click();
    await expect(page.getByText('買い物を完了しました', { exact: true })).toBeVisible();
    await expect(page.getByText('1件を在庫に追加しました', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: '在庫を見る' }).click();
    await expect(page).toHaveURL(/\/pantry$/);
    const stockRow = page.getByRole('listitem').filter({ hasText: recipe.ingredientName });
    await expect(stockRow).toBeVisible();
    // パネルで入力した期限が在庫に載っていること。ここが通らないと Unit B（賞味期限
    // アラート）は発火対象のデータを得られない。
    await expect(stockRow.getByText(STOCK_EXPIRES_AT_LABEL, { exact: false })).toBeVisible();
    await stockRow.getByRole('button', { name: '消費' }).click();
    await expect(stockRow).toHaveCount(0);
  } finally {
    if (recipe !== null) {
      const response = await request.delete(`/api/recipes/${recipe.id}`);
      expect(response.status()).toBe(204);
    }
  }
});
