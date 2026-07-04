import type { CookingStep } from './cooking-step';
import { RecipeId } from './recipe-id';
import type { RecipeIngredient } from './recipe-ingredient';

export type RecipeTag = '主菜' | '副菜' | '汁物' | '作り置き向き' | '冷凍可';

export interface CreateRecipeInput {
  name: string;
  ingredients: RecipeIngredient[];
  steps: CookingStep[];
  baseServings: number;
  tags?: RecipeTag[];
  cookingTime?: number | null;
  notes?: string;
  servings?: number | null;
}

export interface RecipeProps {
  id: RecipeId;
  name: string;
  ingredients: RecipeIngredient[];
  steps: CookingStep[];
  baseServings: number;
  tags: RecipeTag[];
  cookingTime: number | null;
  notes: string;
  servings: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Recipe {
  private constructor(
    private readonly recipeId: RecipeId,
    private recipeName: string,
    private ingredientList: RecipeIngredient[],
    private cookingSteps: CookingStep[],
    // Renamed from `servings` to avoid collision with the `get servings()` getter below.
    private baseServingsValue: number,
    private recipeTags: RecipeTag[],
    private cookingMinutes: number | null,
    private recipeNotes: string,
    private readonly createdDate: Date,
    private updatedDate: Date,
    private servingsValue: number | null,
  ) {}

  static create(input: CreateRecipeInput): Recipe {
    if (input.name.trim() === '') {
      throw new Error('Recipe name is required');
    }
    if (input.baseServings <= 0) {
      throw new Error('Recipe base servings must be positive');
    }

    if (input.cookingTime !== null && input.cookingTime !== undefined && input.cookingTime < 0) {
      throw new Error('Recipe cooking time must be non-negative');
    }

    const servings = input.servings ?? null;
    if (servings !== null && (!Number.isInteger(servings) || servings < 1)) {
      throw new Error('Recipe servings must be a positive integer');
    }

    const now = new Date();

    return new Recipe(
      RecipeId.generate(),
      input.name,
      [...input.ingredients],
      [...input.steps],
      input.baseServings,
      [...(input.tags ?? [])],
      input.cookingTime ?? null,
      input.notes ?? '',
      now,
      now,
      servings,
    );
  }

  static reconstruct(props: RecipeProps): Recipe {
    return new Recipe(
      props.id,
      props.name,
      [...props.ingredients],
      [...props.steps],
      props.baseServings,
      [...props.tags],
      props.cookingTime,
      props.notes,
      new Date(props.createdAt),
      new Date(props.updatedAt),
      props.servings,
    );
  }

  rename(name: string): void {
    if (name.trim() === '') {
      throw new Error('Recipe name is required');
    }

    this.recipeName = name;
    this.touch();
  }

  updateIngredients(ingredients: RecipeIngredient[]): void {
    this.ingredientList = [...ingredients];
    this.touch();
  }

  updateSteps(steps: CookingStep[]): void {
    this.cookingSteps = [...steps];
    this.touch();
  }

  updateTags(tags: RecipeTag[]): void {
    this.recipeTags = [...tags];
    this.touch();
  }

  updateNotes(notes: string): void {
    this.recipeNotes = notes;
    this.touch();
  }

  updateCookingTime(minutes: number | null): void {
    if (minutes !== null && minutes < 0) {
      throw new Error('Recipe cooking time must be non-negative');
    }
    this.cookingMinutes = minutes;
    this.touch();
  }

  // Display-only annotation for "how many people this serves".
  // Not used for ingredient scaling (that is baseServings's role).
  updateServings(servings: number | null): void {
    if (servings !== null && (!Number.isInteger(servings) || servings < 1)) {
      throw new Error('Recipe servings must be a positive integer');
    }
    this.servingsValue = servings;
    this.touch();
  }

  scaleIngredients(scaleFactor: number): RecipeIngredient[] {
    return this.ingredientList.map((ingredient) => ingredient.scale(scaleFactor));
  }

  get id(): RecipeId {
    return this.recipeId;
  }
  get name(): string {
    return this.recipeName;
  }
  get ingredients(): RecipeIngredient[] {
    return [...this.ingredientList];
  }

  get steps(): CookingStep[] {
    return [...this.cookingSteps];
  }
  get baseServings(): number {
    return this.baseServingsValue;
  }
  get tags(): RecipeTag[] {
    return [...this.recipeTags];
  }

  get cookingTime(): number | null {
    return this.cookingMinutes;
  }

  get notes(): string {
    return this.recipeNotes;
  }

  get servings(): number | null {
    return this.servingsValue;
  }

  get createdAt(): Date {
    return new Date(this.createdDate);
  }
  get updatedAt(): Date {
    return new Date(this.updatedDate);
  }

  private touch(): void {
    this.updatedDate = new Date();
  }
}
