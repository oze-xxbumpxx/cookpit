import { GetRecipesUseCase } from '@cookpit/application';
import { recipeRepository } from '@/server/repositories';
import { RecipeListClient } from './_components/recipe-list-client';

export const dynamic = 'force-dynamic';

export default async function RecipesPage() {
  const useCase = new GetRecipesUseCase(recipeRepository());
  const recipes = await useCase.execute();

  return <RecipeListClient initialRecipes={recipes} />;
}
