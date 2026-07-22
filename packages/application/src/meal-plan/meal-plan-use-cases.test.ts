import {
  MealPlan,
  type MealPlanStatus,
  PlannedRecipe,
} from '@cookpit/domain/src/meal-plan/meal-plan';
import { MealPlanId } from '@cookpit/domain/src/meal-plan/meal-plan-id';
import type { MealPlanRepository } from '@cookpit/domain/src/meal-plan/meal-plan.repository';
import { PlannedRecipeId } from '@cookpit/domain/src/meal-plan/planned-recipe-id';
import { RecipeId } from '@cookpit/domain/src/recipe/recipe-id';
import { WeekIdentifier } from '@cookpit/domain/src/shared/week-identifier';
import { beforeEach, describe, expect, it } from 'vitest';
import { AddRecipeToMealPlanUseCase } from './add-recipe-to-meal-plan.use-case';
import { CreateMealPlanUseCase } from './create-meal-plan.use-case';
import { GetCurrentMealPlanUseCase } from './get-current-meal-plan.use-case';
import { GetMealPlanHistoryUseCase } from './get-meal-plan-history.use-case';
import { InvalidMealPlanStateError } from './invalid-meal-plan-state.error';
import { MealPlanNotFoundError } from './meal-plan-not-found.error';
import { PlannedRecipeNotFoundError } from './planned-recipe-not-found.error';
import { RemoveRecipeFromMealPlanUseCase } from './remove-recipe-from-meal-plan.use-case';

class InMemoryMealPlanRepository implements MealPlanRepository {
  private readonly map = new Map<string, MealPlan>();
  public saveCount = 0;

  async findById(id: MealPlanId): Promise<MealPlan | null> {
    return this.map.get(id.value) ?? null;
  }

  async findByWeek(weekIdentifier: WeekIdentifier): Promise<MealPlan | null> {
    return (
      [...this.map.values()].find((mealPlan) => mealPlan.weekOf.equals(weekIdentifier)) ?? null
    );
  }

  async findRecent(limit: number): Promise<MealPlan[]> {
    return [...this.map.values()]
      .sort((a, b) => b.weekOf.startDate().getTime() - a.weekOf.startDate().getTime())
      .slice(0, limit);
  }

  async save(mealPlan: MealPlan): Promise<void> {
    this.saveCount += 1;
    this.map.set(mealPlan.id.value, mealPlan);
  }

  seed(mealPlan: MealPlan): void {
    this.map.set(mealPlan.id.value, mealPlan);
  }

  get size(): number {
    return this.map.size;
  }
}

function seededPlannedRecipe(id: string, recipeId = 'recipe-1', scaleFactor = 1): PlannedRecipe {
  return PlannedRecipe.reconstruct({
    id: PlannedRecipeId.fromString(id),
    recipeId: RecipeId.fromString(recipeId),
    scaleFactor,
    scheduledDate: null,
    cookedAt: null,
    notes: '',
  });
}

function seededMealPlan(
  id: string,
  weekIdentifier: string,
  status: MealPlanStatus = 'draft',
  plannedRecipes: PlannedRecipe[] = [],
): MealPlan {
  return MealPlan.reconstruct({
    id: MealPlanId.fromString(id),
    weekOf: WeekIdentifier.fromString(weekIdentifier),
    plannedRecipes,
    status,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    completedAt: status === 'completed' ? new Date('2026-01-07T00:00:00.000Z') : null,
  });
}

let repository: InMemoryMealPlanRepository;

beforeEach(() => {
  repository = new InMemoryMealPlanRepository();
});

describe('CreateMealPlanUseCase', () => {
  it('新規 MealPlan を draft で保存し、DTO を返す', async () => {
    const dto = await new CreateMealPlanUseCase(repository).execute({
      weekIdentifier: '2026-07-04',
    });

    expect(repository.saveCount).toBe(1);
    expect(repository.size).toBe(1);
    expect(dto.id).not.toBe('');
    expect(dto.weekIdentifier).toBe('2026-07-04');
    expect(dto.status).toBe('draft');
    expect(dto.plannedRecipes).toEqual([]);
    expect(dto.completedAt).toBeNull();
  });

  it('同一週の2回目作成は既存 MealPlan を返し、保存回数を増やさない', async () => {
    const useCase = new CreateMealPlanUseCase(repository);

    const first = await useCase.execute({ weekIdentifier: '2026-07-04' });
    const second = await useCase.execute({ weekIdentifier: '2026-07-04' });

    expect(second.id).toBe(first.id);
    expect(repository.saveCount).toBe(1);
    expect(repository.size).toBe(1);
  });

  it('既存 MealPlan が draft 以外でも冪等にそのまま返す', async () => {
    repository.seed(seededMealPlan('meal-plan-1', '2026-07-04', 'cooking'));

    const dto = await new CreateMealPlanUseCase(repository).execute({
      weekIdentifier: '2026-07-04',
    });

    expect(dto.id).toBe('meal-plan-1');
    expect(dto.status).toBe('cooking');
    expect(repository.saveCount).toBe(0);
  });

  it('非土曜の weekIdentifier は WeekIdentifier により週開始日へ正規化される', async () => {
    const dto = await new CreateMealPlanUseCase(repository).execute({
      weekIdentifier: '2026-07-05',
    });

    expect(dto.weekIdentifier).toBe('2026-07-04');
  });
});

describe('AddRecipeToMealPlanUseCase', () => {
  it('draft の MealPlan にレシピを追加し、PlannedRecipeDto を返す', async () => {
    repository.seed(seededMealPlan('meal-plan-1', '2026-07-04'));

    const dto = await new AddRecipeToMealPlanUseCase(repository).execute({
      mealPlanId: 'meal-plan-1',
      recipeId: 'recipe-1',
      scaleFactor: 1,
    });

    expect(dto.id).not.toBe('');
    expect(dto.recipeId).toBe('recipe-1');
    expect(dto.scaleFactor).toBe(1);
    expect(dto.scheduledDate).toBeNull();
    expect(dto.cookedAt).toBeNull();
    expect(dto.notes).toBe('');
    expect(repository.saveCount).toBe(1);
  });

  it('shopping の MealPlan にもレシピを追加できる', async () => {
    repository.seed(seededMealPlan('meal-plan-1', '2026-07-04', 'shopping'));

    const dto = await new AddRecipeToMealPlanUseCase(repository).execute({
      mealPlanId: 'meal-plan-1',
      recipeId: 'recipe-1',
      scaleFactor: 1,
    });

    expect(dto.recipeId).toBe('recipe-1');
    expect(repository.saveCount).toBe(1);
  });

  it('scaleFactor を PlannedRecipeDto に保持する', async () => {
    repository.seed(seededMealPlan('meal-plan-1', '2026-07-04'));

    const dto = await new AddRecipeToMealPlanUseCase(repository).execute({
      mealPlanId: 'meal-plan-1',
      recipeId: 'recipe-1',
      scaleFactor: 1.5,
    });

    expect(dto.scaleFactor).toBe(1.5);
  });

  it('同一 recipeId を複数回追加しても別 PlannedRecipeId で返る', async () => {
    repository.seed(seededMealPlan('meal-plan-1', '2026-07-04'));
    const useCase = new AddRecipeToMealPlanUseCase(repository);

    const first = await useCase.execute({
      mealPlanId: 'meal-plan-1',
      recipeId: 'recipe-1',
      scaleFactor: 1,
    });
    const second = await useCase.execute({
      mealPlanId: 'meal-plan-1',
      recipeId: 'recipe-1',
      scaleFactor: 1,
    });

    expect(second.id).not.toBe(first.id);
  });

  it('存在しない MealPlanId は MealPlanNotFoundError を投げる', async () => {
    await expect(
      new AddRecipeToMealPlanUseCase(repository).execute({
        mealPlanId: 'missing',
        recipeId: 'recipe-1',
        scaleFactor: 1,
      }),
    ).rejects.toBeInstanceOf(MealPlanNotFoundError);
    expect(repository.saveCount).toBe(0);
  });

  it.each<MealPlanStatus>(['cooking', 'consuming'])(
    '進行中の %s の MealPlan にはレシピを追加できる',
    async (status) => {
      repository.seed(seededMealPlan('meal-plan-1', '2026-07-04', status));

      const result = await new AddRecipeToMealPlanUseCase(repository).execute({
        mealPlanId: 'meal-plan-1',
        recipeId: 'recipe-1',
        scaleFactor: 1,
      });

      expect(result.id).toBeDefined();
      expect(repository.saveCount).toBe(1);
    },
  );

  it('completed の MealPlan にはレシピを追加できない', async () => {
    repository.seed(seededMealPlan('meal-plan-1', '2026-07-04', 'completed'));

    await expect(
      new AddRecipeToMealPlanUseCase(repository).execute({
        mealPlanId: 'meal-plan-1',
        recipeId: 'recipe-1',
        scaleFactor: 1,
      }),
    ).rejects.toBeInstanceOf(InvalidMealPlanStateError);
    expect(repository.saveCount).toBe(0);
  });

  it.each([0, -1])(
    'scaleFactor %s は Domain のバリデーションエラーを伝搬し、保存しない',
    async (scaleFactor) => {
      repository.seed(seededMealPlan('meal-plan-1', '2026-07-04'));

      await expect(
        new AddRecipeToMealPlanUseCase(repository).execute({
          mealPlanId: 'meal-plan-1',
          recipeId: 'recipe-1',
          scaleFactor,
        }),
      ).rejects.toThrow('scaleFactor must be positive');
      expect(repository.saveCount).toBe(0);
    },
  );
});

describe('RemoveRecipeFromMealPlanUseCase', () => {
  it('PlannedRecipe を削除して保存する', async () => {
    repository.seed(
      seededMealPlan('meal-plan-1', '2026-07-04', 'draft', [
        seededPlannedRecipe('planned-recipe-1'),
      ]),
    );

    await new RemoveRecipeFromMealPlanUseCase(repository).execute({
      mealPlanId: 'meal-plan-1',
      plannedRecipeId: 'planned-recipe-1',
    });

    const saved = await repository.findById(MealPlanId.fromString('meal-plan-1'));
    expect(saved?.plannedRecipes).toEqual([]);
    expect(repository.saveCount).toBe(1);
  });

  it('存在しない MealPlanId は MealPlanNotFoundError を投げる', async () => {
    await expect(
      new RemoveRecipeFromMealPlanUseCase(repository).execute({
        mealPlanId: 'missing',
        plannedRecipeId: 'planned-recipe-1',
      }),
    ).rejects.toBeInstanceOf(MealPlanNotFoundError);
    expect(repository.saveCount).toBe(0);
  });

  it('MealPlan 内に存在しない PlannedRecipeId は PlannedRecipeNotFoundError を投げる', async () => {
    repository.seed(seededMealPlan('meal-plan-1', '2026-07-04'));

    await expect(
      new RemoveRecipeFromMealPlanUseCase(repository).execute({
        mealPlanId: 'meal-plan-1',
        plannedRecipeId: 'missing',
      }),
    ).rejects.toBeInstanceOf(PlannedRecipeNotFoundError);
    expect(repository.saveCount).toBe(0);
  });

  it.each<MealPlanStatus>(['cooking', 'consuming'])(
    '進行中の %s の MealPlan からはレシピを削除できる',
    async (status) => {
      repository.seed(
        seededMealPlan('meal-plan-1', '2026-07-04', status, [
          seededPlannedRecipe('planned-recipe-1'),
        ]),
      );

      await new RemoveRecipeFromMealPlanUseCase(repository).execute({
        mealPlanId: 'meal-plan-1',
        plannedRecipeId: 'planned-recipe-1',
      });

      const saved = await repository.findById(MealPlanId.fromString('meal-plan-1'));
      expect(saved?.plannedRecipes).toEqual([]);
      expect(repository.saveCount).toBe(1);
    },
  );

  it('completed の MealPlan からはレシピを削除できない', async () => {
    repository.seed(
      seededMealPlan('meal-plan-1', '2026-07-04', 'completed', [
        seededPlannedRecipe('planned-recipe-1'),
      ]),
    );

    await expect(
      new RemoveRecipeFromMealPlanUseCase(repository).execute({
        mealPlanId: 'meal-plan-1',
        plannedRecipeId: 'planned-recipe-1',
      }),
    ).rejects.toBeInstanceOf(InvalidMealPlanStateError);
    expect(repository.saveCount).toBe(0);
  });
});

describe('GetCurrentMealPlanUseCase', () => {
  it('asOf が属する週の MealPlan を DTO で返す', async () => {
    repository.seed(seededMealPlan('meal-plan-1', '2026-07-04'));

    const dto = await new GetCurrentMealPlanUseCase(repository).execute(
      new Date('2026-07-10T10:00:00'),
    );

    expect(dto?.id).toBe('meal-plan-1');
    expect(dto?.weekIdentifier).toBe('2026-07-04');
  });

  it('asOf が属する週の MealPlan がなければ null を返す', async () => {
    repository.seed(seededMealPlan('meal-plan-1', '2026-07-04'));

    const dto = await new GetCurrentMealPlanUseCase(repository).execute(
      new Date('2026-07-11T10:00:00'),
    );

    expect(dto).toBeNull();
  });
});

describe('GetMealPlanHistoryUseCase', () => {
  it('指定 limit 件を週の新しい順で返す', async () => {
    repository.seed(seededMealPlan('meal-plan-1', '2026-06-06'));
    repository.seed(seededMealPlan('meal-plan-2', '2026-06-13'));
    repository.seed(seededMealPlan('meal-plan-3', '2026-06-20'));
    repository.seed(seededMealPlan('meal-plan-4', '2026-06-27'));
    repository.seed(seededMealPlan('meal-plan-5', '2026-07-04'));

    const dtos = await new GetMealPlanHistoryUseCase(repository).execute({ limit: 4 });

    expect(dtos.map((dto) => dto.weekIdentifier)).toEqual([
      '2026-07-04',
      '2026-06-27',
      '2026-06-20',
      '2026-06-13',
    ]);
  });

  it('実件数が limit 未満でもエラーにせず実件数だけ返す', async () => {
    repository.seed(seededMealPlan('meal-plan-1', '2026-06-27'));
    repository.seed(seededMealPlan('meal-plan-2', '2026-07-04'));

    const dtos = await new GetMealPlanHistoryUseCase(repository).execute({ limit: 4 });

    expect(dtos).toHaveLength(2);
  });

  it('空の場合は空配列を返す', async () => {
    const dtos = await new GetMealPlanHistoryUseCase(repository).execute({ limit: 4 });

    expect(dtos).toEqual([]);
  });

  it('limit 1 なら最新1件だけ返す', async () => {
    repository.seed(seededMealPlan('meal-plan-1', '2026-06-20'));
    repository.seed(seededMealPlan('meal-plan-2', '2026-06-27'));
    repository.seed(seededMealPlan('meal-plan-3', '2026-07-04'));

    const dtos = await new GetMealPlanHistoryUseCase(repository).execute({ limit: 1 });

    expect(dtos.map((dto) => dto.weekIdentifier)).toEqual(['2026-07-04']);
  });

  it('limit 未指定時はデフォルト4で取得する', async () => {
    repository.seed(seededMealPlan('meal-plan-1', '2026-06-06'));
    repository.seed(seededMealPlan('meal-plan-2', '2026-06-13'));
    repository.seed(seededMealPlan('meal-plan-3', '2026-06-20'));
    repository.seed(seededMealPlan('meal-plan-4', '2026-06-27'));
    repository.seed(seededMealPlan('meal-plan-5', '2026-07-04'));

    const dtos = await new GetMealPlanHistoryUseCase(repository).execute({});

    expect(dtos.map((dto) => dto.weekIdentifier)).toEqual([
      '2026-07-04',
      '2026-06-27',
      '2026-06-20',
      '2026-06-13',
    ]);
  });
});
