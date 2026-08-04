import { describe, it, expect, beforeEach } from 'vitest';
import { Recipe, RecipeId } from '@cookpit/domain';
import type { RecipeRepository } from '@cookpit/domain';
import { CreateRecipeUseCase } from '../../src/recipe/create-recipe.use-case';
import { GetRecipeUseCase } from '../../src/recipe/get-recipe.use-case';
import { GetRecipesUseCase } from '../../src/recipe/get-recipes.use-case';
import { UpdateRecipeUseCase } from '../../src/recipe/update-recipe.use-case';
import { DeleteRecipeUseCase } from '../../src/recipe/delete-recipe.use-case';
import { RecipeNotFoundError } from '../../src/recipe/recipe-not-found.error';
import type { CreateRecipeInputDto, UpdateRecipeInputDto } from '../../src/recipe/recipe.dto';

// UseCase の検証は外部 I/O を持たないインメモリ Repository で行う（DB 不要）。
// 副作用（保存・削除回数）も観測できるようにする。
class InMemoryRecipeRepository implements RecipeRepository {
  private readonly store = new Map<string, Recipe>();
  public saveCount = 0;
  public deletedIds: string[] = [];

  async findById(id: RecipeId): Promise<Recipe | null> {
    return this.store.get(id.value) ?? null;
  }

  async findAll(): Promise<Recipe[]> {
    return [...this.store.values()];
  }

  async save(recipe: Recipe): Promise<void> {
    this.saveCount += 1;
    this.store.set(recipe.id.value, recipe);
  }

  async delete(id: RecipeId): Promise<void> {
    this.deletedIds.push(id.value);
    this.store.delete(id.value);
  }

  seed(recipe: Recipe): void {
    this.store.set(recipe.id.value, recipe);
  }

  get size(): number {
    return this.store.size;
  }
}

function seededRecipe(
  id: string,
  name = 'カレー',
  baseServings = 4,
  servings: number | null = null,
): Recipe {
  return Recipe.reconstruct({
    id: RecipeId.fromString(id),
    name,
    ingredients: [],
    steps: [],
    baseServings,
    tags: [],
    cookingTime: null,
    notes: '',
    servings,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

let repository: InMemoryRecipeRepository;

beforeEach(() => {
  repository = new InMemoryRecipeRepository();
});

describe('CreateRecipeUseCase', () => {
  const baseInput: CreateRecipeInputDto = {
    name: '肉じゃが',
    ingredients: [
      {
        productRef: 'prod-1',
        displayName: '玉ねぎ',
        amountValue: 2,
        amountUnit: '個',
        amountNote: null,
      },
      {
        productRef: null,
        displayName: '塩',
        amountValue: null,
        amountUnit: null,
        amountNote: '少々',
      },
    ],
    steps: [{ description: '切る' }, { description: '炒める' }],
    baseServings: 3,
    tags: ['主菜'],
    cookingTime: 30,
    notes: 'おすすめ',
  };

  it('レシピを保存し、入力どおりの DTO を返す（mapper の往復を含む）', async () => {
    const useCase = new CreateRecipeUseCase(repository);

    const dto = await useCase.execute(baseInput);

    expect(repository.saveCount).toBe(1);
    expect(repository.size).toBe(1);
    expect(dto.id).not.toBe('');
    expect(dto.name).toBe('肉じゃが');
    expect(dto.baseServings).toBe(3);
    expect(dto.cookingTime).toBe(30);
    expect(dto.tags).toEqual(['主菜']);
    expect(dto.notes).toBe('おすすめ');
    expect(dto.ingredients).toEqual(baseInput.ingredients);
    expect(dto.steps).toEqual(baseInput.steps);
  });

  it('生成した ID で後から取得できる', async () => {
    const created = await new CreateRecipeUseCase(repository).execute(baseInput);

    const fetched = await new GetRecipeUseCase(repository).execute(created.id);

    expect(fetched.id).toBe(created.id);
    expect(fetched.name).toBe('肉じゃが');
  });

  it('空の name はドメインバリデーションで弾かれ、保存されない', async () => {
    const useCase = new CreateRecipeUseCase(repository);

    await expect(useCase.execute({ ...baseInput, name: '  ' })).rejects.toThrow(
      'Recipe name is required',
    );
    expect(repository.saveCount).toBe(0);
    expect(repository.size).toBe(0);
  });

  it('baseServings が 0 以下なら弾かれる（境界値）', async () => {
    const useCase = new CreateRecipeUseCase(repository);

    await expect(useCase.execute({ ...baseInput, baseServings: 0 })).rejects.toThrow(
      'Recipe base servings must be positive',
    );
  });

  it('cookingTime が負ならドメインバリデーションで弾かれ、保存されない (UC-GAP-1)', async () => {
    const useCase = new CreateRecipeUseCase(repository);

    await expect(useCase.execute({ ...baseInput, cookingTime: -1 })).rejects.toThrow(
      'Recipe cooking time must be non-negative',
    );
    expect(repository.saveCount).toBe(0);
  });

  // T-A01
  it('servings: 4 を指定すると DTO の servings === 4 になる (T-A01)', async () => {
    const dto = await new CreateRecipeUseCase(repository).execute({ ...baseInput, servings: 4 });
    expect(dto.servings).toBe(4);
  });

  // T-A02
  it('servings を省略すると DTO の servings === null になる (T-A02)', async () => {
    const dto = await new CreateRecipeUseCase(repository).execute(baseInput);
    expect(dto.servings).toBeNull();
  });

  // T-A03
  it('servings: null を指定すると DTO の servings === null になる (T-A03)', async () => {
    const dto = await new CreateRecipeUseCase(repository).execute({ ...baseInput, servings: null });
    expect(dto.servings).toBeNull();
  });
});

describe('GetRecipeUseCase', () => {
  it('存在するレシピを DTO で返す', async () => {
    repository.seed(seededRecipe('id-1', 'みそ汁'));

    const dto = await new GetRecipeUseCase(repository).execute('id-1');

    expect(dto.id).toBe('id-1');
    expect(dto.name).toBe('みそ汁');
  });

  it('存在しない ID は RecipeNotFoundError を投げる', async () => {
    await expect(new GetRecipeUseCase(repository).execute('missing')).rejects.toBeInstanceOf(
      RecipeNotFoundError,
    );
  });

  // T-A08
  it('servings: 3 のシード済みレシピを取得すると DTO に servings === 3 が存在する (T-A08)', async () => {
    repository.seed(seededRecipe('id-1', 'みそ汁', 2, 3));

    const dto = await new GetRecipeUseCase(repository).execute('id-1');

    expect(dto.servings).toBe(3);
  });
});

describe('GetRecipesUseCase', () => {
  it('空なら空配列を返す', async () => {
    const dtos = await new GetRecipesUseCase(repository).execute();

    expect(dtos).toEqual([]);
  });

  it('登録済みの全件を返す', async () => {
    repository.seed(seededRecipe('id-1', 'A'));
    repository.seed(seededRecipe('id-2', 'B'));

    const dtos = await new GetRecipesUseCase(repository).execute();

    expect(dtos).toHaveLength(2);
    expect(dtos.map((d) => d.name).sort()).toEqual(['A', 'B']);
  });

  it('各レシピの DTO フィールドが正しくマッピングされる (UC-GAP-4)', async () => {
    repository.seed(seededRecipe('id-1', 'みそ汁', 2));

    const dtos = await new GetRecipesUseCase(repository).execute();

    expect(dtos[0]?.id).toBe('id-1');
    expect(dtos[0]?.name).toBe('みそ汁');
    expect(dtos[0]?.baseServings).toBe(2);
    expect(dtos[0]?.cookingTime).toBeNull();
    expect(dtos[0]?.tags).toEqual([]);
    expect(dtos[0]?.notes).toBe('');
    expect(dtos[0]?.ingredients).toEqual([]);
    expect(dtos[0]?.steps).toEqual([]);
    expect(dtos[0]?.createdAt).toBeDefined();
    expect(dtos[0]?.updatedAt).toBeDefined();
  });

  // T-A09
  it('servings: 2 / null の 2 件を取得すると各 DTO に servings が正しく設定される (T-A09)', async () => {
    repository.seed(seededRecipe('id-1', 'A', 2, 2));
    repository.seed(seededRecipe('id-2', 'B', 2, null));

    const dtos = await new GetRecipesUseCase(repository).execute();

    expect(dtos).toHaveLength(2);
    const byId = Object.fromEntries(dtos.map((d) => [d.id, d]));
    expect(byId['id-1']?.servings).toBe(2);
    expect(byId['id-2']?.servings).toBeNull();
  });
});

describe('UpdateRecipeUseCase', () => {
  const updateInput: UpdateRecipeInputDto = {
    id: 'id-1',
    name: 'カレー（改）',
    ingredients: [],
    steps: [{ description: '煮込む' }],
    tags: ['作り置き向き'],
    cookingTime: 45,
    notes: '更新済み',
  };

  it('編集可能フィールドを更新し、baseServings は変更しない', async () => {
    repository.seed(seededRecipe('id-1', 'カレー', 4));

    const dto = await new UpdateRecipeUseCase(repository).execute(updateInput);

    expect(dto.name).toBe('カレー（改）');
    expect(dto.cookingTime).toBe(45);
    expect(dto.tags).toEqual(['作り置き向き']);
    expect(dto.steps).toEqual([{ description: '煮込む' }]);
    // baseServings は UpdateRecipeUseCase の対象外（入力に持たず、不変であること）
    expect(dto.baseServings).toBe(4);
    expect(repository.saveCount).toBe(1);
  });

  it('更新で updatedAt が createdAt 以降に進む', async () => {
    repository.seed(seededRecipe('id-1'));

    const dto = await new UpdateRecipeUseCase(repository).execute(updateInput);

    expect(new Date(dto.updatedAt).getTime()).toBeGreaterThan(new Date(dto.createdAt).getTime());
  });

  it('cookingTime を null へ更新できる (UC-GAP-2)', async () => {
    repository.seed(seededRecipe('id-1', 'カレー', 4));

    const dto = await new UpdateRecipeUseCase(repository).execute({
      ...updateInput,
      cookingTime: null,
    });

    expect(dto.cookingTime).toBeNull();
    expect(repository.saveCount).toBe(1);
  });

  it('ドメインバリデーション違反は保存されない (UC-GAP-3)', async () => {
    repository.seed(seededRecipe('id-1'));

    await expect(
      new UpdateRecipeUseCase(repository).execute({ ...updateInput, name: '' }),
    ).rejects.toThrow('Recipe name is required');
    expect(repository.saveCount).toBe(0);
  });

  it('存在しない ID は RecipeNotFoundError を投げ、保存しない', async () => {
    await expect(
      new UpdateRecipeUseCase(repository).execute({ ...updateInput, id: 'missing' }),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);
    expect(repository.saveCount).toBe(0);
  });

  // T-A04
  it('servings: null のシード済みレシピに servings: 2 を指定すると DTO の servings === 2 になる (T-A04)', async () => {
    repository.seed(seededRecipe('id-1', 'カレー', 4, null));

    const dto = await new UpdateRecipeUseCase(repository).execute({ ...updateInput, servings: 2 });

    expect(dto.servings).toBe(2);
  });

  // T-A05
  it('servings: 4 のシード済みレシピに servings: null を指定すると DTO の servings === null になる (T-A05)', async () => {
    repository.seed(seededRecipe('id-1', 'カレー', 4, 4));

    const dto = await new UpdateRecipeUseCase(repository).execute({
      ...updateInput,
      servings: null,
    });

    expect(dto.servings).toBeNull();
  });

  // T-A06
  it('servings: 4 のシード済みレシピで servings を省略すると DTO の servings === null になる（?? null 正規化）(T-A06)', async () => {
    repository.seed(seededRecipe('id-1', 'カレー', 4, 4));

    const dto = await new UpdateRecipeUseCase(repository).execute(updateInput);

    expect(dto.servings).toBeNull();
  });

  // T-A07
  it('servings: 0 を指定するとドメインバリデーションエラーになり保存されない (T-A07)', async () => {
    repository.seed(seededRecipe('id-1'));

    await expect(
      new UpdateRecipeUseCase(repository).execute({ ...updateInput, servings: 0 }),
    ).rejects.toThrow('Recipe servings must be a positive integer');
    expect(repository.saveCount).toBe(0);
  });
});

describe('DeleteRecipeUseCase', () => {
  it('存在するレシピを削除する', async () => {
    repository.seed(seededRecipe('id-1'));

    await new DeleteRecipeUseCase(repository).execute('id-1');

    expect(repository.size).toBe(0);
    expect(repository.deletedIds).toEqual(['id-1']);
  });

  it('存在しない ID は RecipeNotFoundError を投げ、delete を呼ばない', async () => {
    await expect(new DeleteRecipeUseCase(repository).execute('missing')).rejects.toBeInstanceOf(
      RecipeNotFoundError,
    );
    expect(repository.deletedIds).toEqual([]);
  });

  it('冪等性: 削除済みの ID を再度削除すると NotFound になる', async () => {
    repository.seed(seededRecipe('id-1'));
    const useCase = new DeleteRecipeUseCase(repository);

    await useCase.execute('id-1');

    await expect(useCase.execute('id-1')).rejects.toBeInstanceOf(RecipeNotFoundError);
    expect(repository.deletedIds).toEqual(['id-1']);
  });

  it('削除後に GetRecipe で取得すると NotFound になる (UC-GAP-5)', async () => {
    repository.seed(seededRecipe('id-1'));

    await new DeleteRecipeUseCase(repository).execute('id-1');

    await expect(new GetRecipeUseCase(repository).execute('id-1')).rejects.toBeInstanceOf(
      RecipeNotFoundError,
    );
  });
});
