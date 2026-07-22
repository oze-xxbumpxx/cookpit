import type { RecipeId } from '../recipe/recipe-id';
import type { WeekIdentifier } from '../shared/week-identifier';
import { MealPlanId } from './meal-plan-id';
import { PlannedRecipeId } from './planned-recipe-id';

export type MealPlanStatus = 'draft' | 'shopping' | 'cooking' | 'consuming' | 'completed';

const TRANSITIONS: Record<MealPlanStatus, MealPlanStatus[]> = {
  draft: ['shopping'],
  shopping: ['draft', 'cooking'],
  cooking: ['consuming'],
  consuming: ['completed'],
  completed: [],
};

export interface PlannedRecipeProps {
  id: PlannedRecipeId;
  recipeId: RecipeId;
  scaleFactor: number;
  scheduledDate: Date | null;
  cookedAt: Date | null;
  notes: string;
}

export class PlannedRecipe {
  private constructor(
    private readonly plannedRecipeId: PlannedRecipeId,
    private readonly plannedRecipeRecipeId: RecipeId,
    private readonly plannedRecipeScaleFactor: number,
    private scheduledDateValue: Date | null,
    private cookedAtValue: Date | null,
    private readonly plannedRecipeNotes: string,
  ) {}

  static create(recipeId: RecipeId, scaleFactor: number): PlannedRecipe {
    if (scaleFactor <= 0) {
      throw new Error('scaleFactor must be positive');
    }

    return new PlannedRecipe(PlannedRecipeId.generate(), recipeId, scaleFactor, null, null, '');
  }

  static reconstruct(props: PlannedRecipeProps): PlannedRecipe {
    return new PlannedRecipe(
      props.id,
      props.recipeId,
      props.scaleFactor,
      props.scheduledDate === null ? null : new Date(props.scheduledDate),
      props.cookedAt === null ? null : new Date(props.cookedAt),
      props.notes,
    );
  }

  scheduleFor(date: Date): void {
    this.scheduledDateValue = new Date(date);
  }

  markAsCooked(at: Date): void {
    this.cookedAtValue = new Date(at);
  }

  get id(): PlannedRecipeId {
    return this.plannedRecipeId;
  }

  get recipeId(): RecipeId {
    return this.plannedRecipeRecipeId;
  }

  get scaleFactor(): number {
    return this.plannedRecipeScaleFactor;
  }

  get scheduledDate(): Date | null {
    return this.scheduledDateValue === null ? null : new Date(this.scheduledDateValue);
  }

  get cookedAt(): Date | null {
    return this.cookedAtValue === null ? null : new Date(this.cookedAtValue);
  }

  get notes(): string {
    return this.plannedRecipeNotes;
  }
}

export interface MealPlanProps {
  id: MealPlanId;
  weekOf: WeekIdentifier;
  plannedRecipes: PlannedRecipe[];
  status: MealPlanStatus;
  createdAt: Date;
  completedAt: Date | null;
}

export class MealPlan {
  private constructor(
    private readonly mealPlanId: MealPlanId,
    private readonly mealPlanWeekOf: WeekIdentifier,
    private mealPlanPlannedRecipes: PlannedRecipe[],
    private mealPlanStatus: MealPlanStatus,
    private readonly createdDate: Date,
    private completedDate: Date | null,
  ) {}

  static create(weekOf: WeekIdentifier): MealPlan {
    return new MealPlan(MealPlanId.generate(), weekOf, [], 'draft', new Date(), null);
  }

  static reconstruct(props: MealPlanProps): MealPlan {
    return new MealPlan(
      props.id,
      props.weekOf,
      [...props.plannedRecipes],
      props.status,
      new Date(props.createdAt),
      props.completedAt === null ? null : new Date(props.completedAt),
    );
  }

  addRecipe(recipeId: RecipeId, scaleFactor: number): PlannedRecipeId {
    if (!this.canChangeRecipes()) {
      throw new Error(`Cannot addRecipe to a MealPlan with status '${this.mealPlanStatus}'`);
    }

    const plannedRecipe = PlannedRecipe.create(recipeId, scaleFactor);
    this.mealPlanPlannedRecipes.push(plannedRecipe);

    return plannedRecipe.id;
  }

  removeRecipe(plannedRecipeId: PlannedRecipeId): void {
    if (!this.canChangeRecipes()) {
      throw new Error(`Cannot removeRecipe from a MealPlan with status '${this.mealPlanStatus}'`);
    }

    const previousLength = this.mealPlanPlannedRecipes.length;
    this.mealPlanPlannedRecipes = this.mealPlanPlannedRecipes.filter(
      (plannedRecipe) => !plannedRecipe.id.equals(plannedRecipeId),
    );

    if (this.mealPlanPlannedRecipes.length === previousLength) {
      throw new Error('PlannedRecipe not found');
    }
  }

  transitionTo(newStatus: MealPlanStatus): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new Error(`Cannot transition from ${this.mealPlanStatus} to ${newStatus}`);
    }

    this.mealPlanStatus = newStatus;
    if (newStatus === 'completed') {
      this.completedDate = new Date();
    }
  }

  scheduleForDay(plannedRecipeId: PlannedRecipeId, date: Date): void {
    const plannedRecipe = this.findPlannedRecipe(plannedRecipeId);
    plannedRecipe.scheduleFor(date);
  }

  markAsCooked(plannedRecipeId: PlannedRecipeId, at: Date): void {
    const plannedRecipe = this.findPlannedRecipe(plannedRecipeId);
    plannedRecipe.markAsCooked(at);
  }

  get id(): MealPlanId {
    return this.mealPlanId;
  }

  get weekOf(): WeekIdentifier {
    return this.mealPlanWeekOf;
  }

  get plannedRecipes(): PlannedRecipe[] {
    return [...this.mealPlanPlannedRecipes];
  }

  get status(): MealPlanStatus {
    return this.mealPlanStatus;
  }

  get createdAt(): Date {
    return new Date(this.createdDate);
  }

  get completedAt(): Date | null {
    return this.completedDate === null ? null : new Date(this.completedDate);
  }

  // 進行中の週（draft/shopping/cooking/consuming）はレシピを編集できる。ビュッフェ運用で
  // 週の途中でも献立を足し引きするため。過去分（completed）のみ編集不可。
  private canChangeRecipes(): boolean {
    return this.mealPlanStatus !== 'completed';
  }

  private canTransitionTo(newStatus: MealPlanStatus): boolean {
    return TRANSITIONS[this.mealPlanStatus].includes(newStatus);
  }

  private findPlannedRecipe(plannedRecipeId: PlannedRecipeId): PlannedRecipe {
    const plannedRecipe =
      this.mealPlanPlannedRecipes.find((recipe) => recipe.id.equals(plannedRecipeId)) ?? null;

    if (plannedRecipe === null) {
      throw new Error('PlannedRecipe not found');
    }

    return plannedRecipe;
  }
}
