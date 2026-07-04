import { beforeEach, describe, expect, it } from 'vitest';
import { Recipe } from '@cookpit/domain/src/recipe/recipe';
import { RecipeId } from '@cookpit/domain/src/recipe/recipe-id';
import type { DrizzleClient } from '../db/client';
import { createTestDb } from '../testing/create-test-db';
import { DrizzleRecipeRepository } from './drizzle-recipe.repository';

function createRecipe(overrides: { servings?: number | null } = {}): Recipe {
  return Recipe.create({
    name: '肉じゃが',
    ingredients: [],
    steps: [],
    baseServings: 4,
    tags: ['主菜'],
    cookingTime: 30,
    notes: 'テスト用レシピ',
    servings: overrides.servings !== undefined ? overrides.servings : null,
  });
}

describe('DrizzleRecipeRepository', () => {
  let db: DrizzleClient;
  let repository: DrizzleRecipeRepository;

  beforeEach(async () => {
    db = await createTestDb();
    repository = new DrizzleRecipeRepository(db);
  });

  // T-I01
  it('T-I01: save() → findById() で servings: 4 が保持される', async () => {
    const recipe = createRecipe({ servings: 4 });
    await repository.save(recipe);

    const found = await repository.findById(recipe.id);

    expect(found).not.toBeNull();
    expect(found?.servings).toBe(4);
  });

  // T-I02
  it('T-I02: save() → findById() で servings: null が保持される', async () => {
    const recipe = createRecipe({ servings: null });
    await repository.save(recipe);

    const found = await repository.findById(recipe.id);

    expect(found).not.toBeNull();
    expect(found?.servings).toBeNull();
  });

  // T-I03: upsert 冪等性
  it('T-I03: INSERT 後に updateServings(2) → save() → findById() で servings === 2 になる', async () => {
    const recipe = createRecipe({ servings: 4 });
    await repository.save(recipe);

    recipe.updateServings(2);
    await repository.save(recipe);

    const found = await repository.findById(recipe.id);

    expect(found?.servings).toBe(2);
  });

  // T-I04: findAll() で各 Entity に servings が正しく設定される
  it('T-I04: findAll() で servings: 4 と servings: null の 2 件が正しく復元される', async () => {
    const recipeA = createRecipe({ servings: 4 });
    const recipeB = createRecipe({ servings: null });
    await repository.save(recipeA);
    await repository.save(recipeB);

    const all = await repository.findAll();

    expect(all).toHaveLength(2);
    const byId = Object.fromEntries(all.map((r) => [r.id.value, r]));
    expect(byId[recipeA.id.value]?.servings).toBe(4);
    expect(byId[recipeB.id.value]?.servings).toBeNull();
  });

  // T-I05: 後方互換（既存行 servings カラムが NULL の場合）
  it('T-I05: servings カラムが NULL の既存行を findById() すると servings === null になる', async () => {
    // servings を指定せず INSERT することで既存データ相当の行を作成する
    const recipe = Recipe.reconstruct({
      id: RecipeId.fromString('legacy-id'),
      name: '既存レシピ',
      ingredients: [],
      steps: [],
      baseServings: 2,
      tags: [],
      cookingTime: null,
      notes: '',
      servings: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await repository.save(recipe);

    const found = await repository.findById(RecipeId.fromString('legacy-id'));

    expect(found?.servings).toBeNull();
  });
});
