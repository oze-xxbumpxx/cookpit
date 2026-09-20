import { beforeEach, describe, expect, it } from 'vitest';
import {
  CookingStep,
  ProductId,
  Quantity,
  Recipe,
  RecipeId,
  RecipeIngredient,
} from '@cookpit/domain';
import type { RecipeTag } from '@cookpit/domain';
import type { DrizzleClient } from '../../src/db/client';
import { recipes } from '../../src/db/schema';
import { createTestDb, DrizzleUnitOfWork } from '../testing/create-test-db';
import { DrizzleRecipeRepository } from '../../src/repositories/drizzle-recipe.repository';

function createRecipe(
  overrides: {
    servings?: number | null;
    ingredients?: RecipeIngredient[];
    steps?: CookingStep[];
    tags?: RecipeTag[];
  } = {},
): Recipe {
  return Recipe.create({
    name: '肉じゃが',
    ingredients: overrides.ingredients ?? [],
    steps: overrides.steps ?? [],
    baseServings: 4,
    tags: overrides.tags ?? ['主菜'],
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
    repository = new DrizzleRecipeRepository(new DrizzleUnitOfWork(db));
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

  // --- 材料（ingredients）の往復 ---
  //
  // `RecipeIngredient` は amount と amountNote が XOR（どちらか一方が必須で両立不可）。
  // productRef の有無と直交するため、有効な組み合わせは以下の 3 通りになる。
  // JSONB ⇔ ドメインモデルの変換は Repository の責務（.claude/rules/domain-layer.md）なので、
  // ここが崩れると材料の数量・単位・マスタ参照が取り違わる。

  it('T-I06: 材料が productRef と amount を持つ場合、往復して復元される', async () => {
    const productId = ProductId.generate();
    const recipe = createRecipe({
      ingredients: [
        RecipeIngredient.create({
          productRef: productId,
          displayName: '豚こま切れ肉',
          amount: Quantity.of(300, 'g'),
          amountNote: null,
        }),
      ],
      steps: [new CookingStep('肉と野菜を炒める')],
    });
    await repository.save(recipe);

    const found = await repository.findById(recipe.id);

    expect(found?.ingredients).toHaveLength(1);
    const ingredient = found?.ingredients[0];
    expect(ingredient?.productRef?.value).toBe(productId.value);
    expect(ingredient?.displayName).toBe('豚こま切れ肉');
    expect(ingredient?.amount?.value).toBe(300);
    expect(ingredient?.amount?.unit).toBe('g');
    expect(ingredient?.amountNote).toBeNull();
    expect(found?.steps.map((step) => step.description)).toEqual(['肉と野菜を炒める']);
  });

  it('T-I07: 材料が productRef を持たず amount のみの場合、productRef は null で復元される', async () => {
    const recipe = createRecipe({
      ingredients: [
        RecipeIngredient.create({
          productRef: null,
          displayName: 'じゃがいも',
          amount: Quantity.of(3, '個'),
          amountNote: null,
        }),
      ],
    });
    await repository.save(recipe);

    const found = await repository.findById(recipe.id);

    const ingredient = found?.ingredients[0];
    expect(ingredient?.productRef).toBeNull();
    expect(ingredient?.amount?.value).toBe(3);
    expect(ingredient?.amount?.unit).toBe('個');
    expect(ingredient?.amountNote).toBeNull();
  });

  it('T-I08: 材料が amountNote のみの場合、amount は null で復元される', async () => {
    const recipe = createRecipe({
      ingredients: [
        RecipeIngredient.create({
          productRef: null,
          displayName: 'タルタルソース',
          amount: null,
          amountNote: '市販でも可',
        }),
      ],
    });
    await repository.save(recipe);

    const found = await repository.findById(recipe.id);

    const ingredient = found?.ingredients[0];
    expect(ingredient?.amount).toBeNull();
    expect(ingredient?.amountNote).toBe('市販でも可');
    expect(ingredient?.displayName).toBe('タルタルソース');
  });

  it('T-I09: 数量つきと数量メモのみの材料が混在しても、それぞれの形で復元される', async () => {
    const recipe = createRecipe({
      ingredients: [
        RecipeIngredient.create({
          productRef: null,
          displayName: '鶏もも肉',
          amount: Quantity.of(300, 'g'),
          amountNote: null,
        }),
        RecipeIngredient.create({
          productRef: null,
          displayName: 'タルタルソース',
          amount: null,
          amountNote: '市販でも可',
        }),
      ],
    });
    await repository.save(recipe);

    const found = await repository.findById(recipe.id);

    expect(found?.ingredients).toHaveLength(2);
    expect(found?.ingredients[0]?.amount?.value).toBe(300);
    expect(found?.ingredients[0]?.amountNote).toBeNull();
    expect(found?.ingredients[1]?.amount).toBeNull();
    expect(found?.ingredients[1]?.amountNote).toBe('市販でも可');
  });

  // --- タグの往復 ---

  it('T-I10: 5 種類すべてのタグが往復して復元される', async () => {
    const allTags: RecipeTag[] = ['主菜', '副菜', '汁物', '作り置き向き', '冷凍可'];
    const recipe = createRecipe({ tags: allTags });
    await repository.save(recipe);

    const found = await repository.findById(recipe.id);

    expect(found?.tags).toEqual(allTags);
  });

  it('T-I11: 未知のタグを持つ行を復元しようとすると例外になる', async () => {
    // アプリ経由では作れない値のため、DB へ直接 INSERT して「不正な既存行」を作る
    // （drizzle-push-subscription.repository.test.ts と同じ作法）。
    await db.insert(recipes).values({
      id: 'unknown-tag-id',
      name: '不正タグのレシピ',
      baseServings: 2,
      cookingTime: null,
      tags: ['未知のタグ'],
      notes: '',
      ingredients: [],
      steps: [],
      servings: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(repository.findById(RecipeId.fromString('unknown-tag-id'))).rejects.toThrow(
      'Unknown recipe tag: 未知のタグ',
    );
  });

  // --- delete() ---

  it('T-I12: delete() で行が削除され、findById() が null になる', async () => {
    const recipe = createRecipe();
    await repository.save(recipe);
    expect(await repository.findById(recipe.id)).not.toBeNull();

    await repository.delete(recipe.id);

    expect(await repository.findById(recipe.id)).toBeNull();
    expect(await repository.findAll()).toHaveLength(0);
  });

  it('T-I13: delete() は他のレシピを巻き込まない', async () => {
    const target = createRecipe();
    const survivor = createRecipe();
    await repository.save(target);
    await repository.save(survivor);

    await repository.delete(target.id);

    const all = await repository.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.id.value).toBe(survivor.id.value);
  });
});
