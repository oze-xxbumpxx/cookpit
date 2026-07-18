import { describe, expect, it } from 'vitest';
import { RecipeId } from '../recipe/recipe-id';
import { WeekIdentifier } from '../shared/week-identifier';
import { MealPlan, PlannedRecipe, type MealPlanStatus } from './meal-plan';
import { MealPlanId } from './meal-plan-id';
import { PlannedRecipeId } from './planned-recipe-id';
import type { MealPlanProps, PlannedRecipeProps } from './meal-plan';

interface TransitionCase {
  from: MealPlanStatus;
  to: MealPlanStatus;
}

const createRecipeId = (value: string = 'recipe-1'): RecipeId => RecipeId.fromString(value);

const createMealPlan = (): MealPlan => MealPlan.create(WeekIdentifier.fromString('2026-07-04'));

const createPlannedRecipe = (id: string = 'planned-recipe-1'): PlannedRecipe =>
  PlannedRecipe.reconstruct({
    id: PlannedRecipeId.fromString(id),
    recipeId: createRecipeId(),
    scaleFactor: 1,
    scheduledDate: null,
    cookedAt: null,
    notes: '',
  });

const findPlannedRecipe = (mealPlan: MealPlan, id: PlannedRecipeId): PlannedRecipe => {
  const plannedRecipe = mealPlan.plannedRecipes.find((recipe) => recipe.id.equals(id)) ?? null;

  if (plannedRecipe === null) {
    throw new Error('Expected planned recipe in test');
  }

  return plannedRecipe;
};

const createMealPlanAtStatus = (status: MealPlanStatus): MealPlan => {
  const mealPlan = createMealPlan();

  if (status === 'draft') {
    return mealPlan;
  }

  mealPlan.transitionTo('shopping');
  if (status === 'shopping') {
    return mealPlan;
  }

  mealPlan.transitionTo('cooking');
  if (status === 'cooking') {
    return mealPlan;
  }

  mealPlan.transitionTo('consuming');
  if (status === 'consuming') {
    return mealPlan;
  }

  mealPlan.transitionTo('completed');
  return mealPlan;
};

const createMealPlanWithRecipeAtStatus = (
  status: MealPlanStatus,
): { mealPlan: MealPlan; plannedRecipeId: PlannedRecipeId } => {
  const mealPlan = createMealPlan();
  const plannedRecipeId = mealPlan.addRecipe(createRecipeId(), 1);

  if (status === 'draft') {
    return { mealPlan, plannedRecipeId };
  }

  mealPlan.transitionTo('shopping');
  if (status === 'shopping') {
    return { mealPlan, plannedRecipeId };
  }

  mealPlan.transitionTo('cooking');
  if (status === 'cooking') {
    return { mealPlan, plannedRecipeId };
  }

  mealPlan.transitionTo('consuming');
  if (status === 'consuming') {
    return { mealPlan, plannedRecipeId };
  }

  mealPlan.transitionTo('completed');
  return { mealPlan, plannedRecipeId };
};

describe('PlannedRecipe', () => {
  it('create は正の scaleFactor で PlannedRecipe を生成する', () => {
    const plannedRecipe = PlannedRecipe.create(createRecipeId(), 1.5);

    expect(plannedRecipe.id.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(plannedRecipe.recipeId.equals(createRecipeId())).toBe(true);
    expect(plannedRecipe.scaleFactor).toBe(1.5);
    expect(plannedRecipe.scheduledDate).toBeNull();
    expect(plannedRecipe.cookedAt).toBeNull();
    expect(plannedRecipe.notes).toBe('');
  });

  it('create は 0.001 と 3 を許容する', () => {
    expect(PlannedRecipe.create(createRecipeId(), 0.001).scaleFactor).toBe(0.001);
    expect(PlannedRecipe.create(createRecipeId(), 3).scaleFactor).toBe(3);
  });

  it('create は scaleFactor が 0 以下なら拒否する', () => {
    expect(() => PlannedRecipe.create(createRecipeId(), 0)).toThrow('scaleFactor must be positive');
    expect(() => PlannedRecipe.create(createRecipeId(), -1)).toThrow(
      'scaleFactor must be positive',
    );
  });

  it('reconstruct はバリデーションなしで props 通り復元する', () => {
    const scheduledDate = new Date('2026-07-06T00:00:00');
    const cookedAt = new Date('2026-07-06T18:00:00');
    const props: PlannedRecipeProps = {
      id: PlannedRecipeId.fromString('planned-recipe-1'),
      recipeId: createRecipeId('recipe-2'),
      scaleFactor: 0,
      scheduledDate,
      cookedAt,
      notes: 'メモ',
    };

    const plannedRecipe = PlannedRecipe.reconstruct(props);

    expect(plannedRecipe.id.value).toBe('planned-recipe-1');
    expect(plannedRecipe.recipeId.value).toBe('recipe-2');
    expect(plannedRecipe.scaleFactor).toBe(0);
    expect(plannedRecipe.scheduledDate?.getTime()).toBe(scheduledDate.getTime());
    expect(plannedRecipe.cookedAt?.getTime()).toBe(cookedAt.getTime());
    expect(plannedRecipe.notes).toBe('メモ');
  });

  it('scheduleFor と markAsCooked は Date を防御的コピーで保持する', () => {
    const plannedRecipe = PlannedRecipe.create(createRecipeId(), 1);
    const scheduledDate = new Date('2026-07-06T00:00:00');
    const cookedAt = new Date('2026-07-06T18:00:00');

    plannedRecipe.scheduleFor(scheduledDate);
    plannedRecipe.markAsCooked(cookedAt);
    scheduledDate.setFullYear(2099);
    cookedAt.setFullYear(2099);

    expect(plannedRecipe.scheduledDate?.getFullYear()).toBe(2026);
    expect(plannedRecipe.cookedAt?.getFullYear()).toBe(2026);

    const returnedScheduledDate = plannedRecipe.scheduledDate;
    const returnedCookedAt = plannedRecipe.cookedAt;
    if (returnedScheduledDate === null || returnedCookedAt === null) {
      throw new Error('Expected dates in test');
    }

    returnedScheduledDate.setFullYear(2099);
    returnedCookedAt.setFullYear(2099);

    expect(plannedRecipe.scheduledDate?.getFullYear()).toBe(2026);
    expect(plannedRecipe.cookedAt?.getFullYear()).toBe(2026);
  });
});

describe('MealPlan.create / reconstruct', () => {
  it('create は draft の空の MealPlan を生成する', () => {
    const mealPlan = createMealPlan();

    expect(mealPlan.id.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(mealPlan.weekOf.toString()).toBe('2026-07-04');
    expect(mealPlan.status).toBe('draft');
    expect(mealPlan.plannedRecipes).toEqual([]);
    expect(mealPlan.completedAt).toBeNull();
    expect(mealPlan.createdAt).toBeInstanceOf(Date);
  });

  it('create は毎回異なる MealPlanId を生成する', () => {
    expect(createMealPlan().id.equals(createMealPlan().id)).toBe(false);
  });

  it('reconstruct はバリデーションなしで props 通り復元する', () => {
    const plannedRecipe = createPlannedRecipe();
    const props: MealPlanProps = {
      id: MealPlanId.fromString('meal-plan-1'),
      weekOf: WeekIdentifier.fromString('2026-07-04'),
      plannedRecipes: [plannedRecipe],
      status: 'completed',
      createdAt: new Date('2026-07-04T09:00:00'),
      completedAt: new Date('2026-07-10T20:00:00'),
    };

    const mealPlan = MealPlan.reconstruct(props);

    expect(mealPlan.id.value).toBe('meal-plan-1');
    expect(mealPlan.weekOf.toString()).toBe('2026-07-04');
    expect(mealPlan.plannedRecipes).toEqual([plannedRecipe]);
    expect(mealPlan.status).toBe('completed');
    expect(mealPlan.createdAt.getTime()).toBe(props.createdAt.getTime());
    expect(mealPlan.completedAt?.getTime()).toBe(props.completedAt?.getTime());
  });
});

describe('MealPlan.addRecipe', () => {
  it('draft と shopping で PlannedRecipe を追加できる', () => {
    const draftMealPlan = createMealPlanAtStatus('draft');
    const shoppingMealPlan = createMealPlanAtStatus('shopping');

    const draftPlannedRecipeId = draftMealPlan.addRecipe(createRecipeId(), 1.5);
    const shoppingPlannedRecipeId = shoppingMealPlan.addRecipe(createRecipeId(), 2);

    expect(findPlannedRecipe(draftMealPlan, draftPlannedRecipeId).scaleFactor).toBe(1.5);
    expect(findPlannedRecipe(shoppingMealPlan, shoppingPlannedRecipeId).scaleFactor).toBe(2);
  });

  it('cooking / consuming / completed では追加できない', () => {
    const statuses: MealPlanStatus[] = ['cooking', 'consuming', 'completed'];

    for (const status of statuses) {
      const mealPlan = createMealPlanAtStatus(status);

      expect(() => mealPlan.addRecipe(createRecipeId(), 1)).toThrow(
        `Cannot addRecipe to a MealPlan with status '${status}'`,
      );
      expect(mealPlan.plannedRecipes).toEqual([]);
    }
  });

  it('同一 recipeId を2回追加しても別 PlannedRecipeId で2件作成する', () => {
    const mealPlan = createMealPlan();
    const recipeId = createRecipeId();

    const firstId = mealPlan.addRecipe(recipeId, 1);
    const secondId = mealPlan.addRecipe(recipeId, 1);

    expect(firstId.equals(secondId)).toBe(false);
    expect(mealPlan.plannedRecipes).toHaveLength(2);
  });
});

describe('MealPlan.removeRecipe', () => {
  it('draft と shopping で PlannedRecipe を削除できる', () => {
    const draftMealPlan = createMealPlanAtStatus('draft');
    const draftPlannedRecipeId = draftMealPlan.addRecipe(createRecipeId(), 1);

    draftMealPlan.removeRecipe(draftPlannedRecipeId);

    expect(draftMealPlan.plannedRecipes).toHaveLength(0);

    const shoppingMealPlan = createMealPlanAtStatus('shopping');
    const shoppingPlannedRecipeId = shoppingMealPlan.addRecipe(createRecipeId(), 1);

    shoppingMealPlan.removeRecipe(shoppingPlannedRecipeId);

    expect(shoppingMealPlan.plannedRecipes).toHaveLength(0);
  });

  it('存在しない PlannedRecipeId は拒否する', () => {
    const mealPlan = createMealPlan();

    expect(() => mealPlan.removeRecipe(PlannedRecipeId.fromString('unknown'))).toThrow(
      'PlannedRecipe not found',
    );
  });

  it('cooking / consuming / completed では削除できない', () => {
    const statuses: MealPlanStatus[] = ['cooking', 'consuming', 'completed'];

    for (const status of statuses) {
      const { mealPlan, plannedRecipeId } = createMealPlanWithRecipeAtStatus(status);

      expect(() => mealPlan.removeRecipe(plannedRecipeId)).toThrow(
        `Cannot removeRecipe from a MealPlan with status '${status}'`,
      );
    }
  });
});

describe('MealPlan.transitionTo', () => {
  const allowedTransitions: TransitionCase[] = [
    { from: 'draft', to: 'shopping' },
    { from: 'shopping', to: 'draft' },
    { from: 'shopping', to: 'cooking' },
    { from: 'cooking', to: 'consuming' },
    { from: 'consuming', to: 'completed' },
  ];

  for (const transition of allowedTransitions) {
    it(`${transition.from} から ${transition.to} へ遷移できる`, () => {
      const mealPlan = createMealPlanAtStatus(transition.from);
      const beforeCompletedAt = mealPlan.completedAt;

      mealPlan.transitionTo(transition.to);

      expect(mealPlan.status).toBe(transition.to);
      if (transition.to === 'completed') {
        expect(beforeCompletedAt).toBeNull();
        expect(mealPlan.completedAt).toBeInstanceOf(Date);
      } else {
        expect(mealPlan.completedAt).toBeNull();
      }
    });
  }

  const disallowedTransitions: TransitionCase[] = [
    { from: 'draft', to: 'cooking' },
    { from: 'draft', to: 'consuming' },
    { from: 'draft', to: 'completed' },
    { from: 'shopping', to: 'consuming' },
    { from: 'shopping', to: 'completed' },
    { from: 'cooking', to: 'draft' },
    { from: 'cooking', to: 'shopping' },
    { from: 'cooking', to: 'completed' },
    { from: 'consuming', to: 'draft' },
    { from: 'consuming', to: 'shopping' },
    { from: 'consuming', to: 'cooking' },
  ];

  for (const transition of disallowedTransitions) {
    it(`${transition.from} から ${transition.to} へは遷移できない`, () => {
      const mealPlan = createMealPlanAtStatus(transition.from);

      expect(() => mealPlan.transitionTo(transition.to)).toThrow(
        `Cannot transition from ${transition.from} to ${transition.to}`,
      );
      expect(mealPlan.status).toBe(transition.from);
    });
  }

  it('completed から any へは遷移できず completedAt も変わらない', () => {
    const targets: MealPlanStatus[] = ['draft', 'shopping', 'cooking', 'consuming', 'completed'];

    for (const target of targets) {
      const mealPlan = createMealPlanAtStatus('completed');
      const completedAt = mealPlan.completedAt;
      if (completedAt === null) {
        throw new Error('Expected completedAt in test');
      }
      const completedAtTime = completedAt.getTime();

      expect(() => mealPlan.transitionTo(target)).toThrow(
        `Cannot transition from completed to ${target}`,
      );
      expect(mealPlan.status).toBe('completed');
      expect(mealPlan.completedAt?.getTime()).toBe(completedAtTime);
    }
  });
});

describe('MealPlan scheduleForDay / markAsCooked', () => {
  it('対象 PlannedRecipe の scheduledDate と cookedAt を更新する', () => {
    const mealPlan = createMealPlan();
    const plannedRecipeId = mealPlan.addRecipe(createRecipeId(), 1);
    const scheduledDate = new Date('2026-07-06T00:00:00');
    const cookedAt = new Date('2026-07-06T18:00:00');

    mealPlan.scheduleForDay(plannedRecipeId, scheduledDate);
    mealPlan.markAsCooked(plannedRecipeId, cookedAt);

    const plannedRecipe = findPlannedRecipe(mealPlan, plannedRecipeId);
    expect(plannedRecipe.scheduledDate?.getTime()).toBe(scheduledDate.getTime());
    expect(plannedRecipe.cookedAt?.getTime()).toBe(cookedAt.getTime());
  });

  it('存在しない PlannedRecipeId は拒否する', () => {
    const mealPlan = createMealPlan();
    const plannedRecipeId = PlannedRecipeId.fromString('unknown');

    expect(() => mealPlan.scheduleForDay(plannedRecipeId, new Date())).toThrow(
      'PlannedRecipe not found',
    );
    expect(() => mealPlan.markAsCooked(plannedRecipeId, new Date())).toThrow(
      'PlannedRecipe not found',
    );
  });
});

describe('MealPlan の防御的コピー', () => {
  it('plannedRecipes getter は配列の防御的コピーを返す', () => {
    const mealPlan = createMealPlan();
    mealPlan.addRecipe(createRecipeId(), 1);

    const plannedRecipes = mealPlan.plannedRecipes;
    plannedRecipes.push(createPlannedRecipe('planned-recipe-2'));

    expect(mealPlan.plannedRecipes).toHaveLength(1);
  });

  it('createdAt と completedAt getter は Date の防御的コピーを返す', () => {
    const mealPlan = createMealPlanAtStatus('completed');
    const createdAt = mealPlan.createdAt;
    const completedAt = mealPlan.completedAt;
    if (completedAt === null) {
      throw new Error('Expected completedAt in test');
    }

    createdAt.setFullYear(2099);
    completedAt.setFullYear(2099);

    expect(mealPlan.createdAt.getFullYear()).not.toBe(2099);
    expect(mealPlan.completedAt?.getFullYear()).not.toBe(2099);
  });
});
