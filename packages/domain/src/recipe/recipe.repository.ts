import type { Recipe } from './recipe';
import type { RecipeId } from './recipe-id';

export interface RecipeRepository {
  findById(id: RecipeId): Promise<Recipe | null>;
  findAll(): Promise<Recipe[]>;
  save(recipe: Recipe): Promise<void>;
  delete(id: RecipeId): Promise<void>;
}
