import { getDb } from '@/db/client';
import { GetRecipesUseCase } from '@cookpit/application';
import { DrizzleRecipeRepository } from '@cookpit/infrastructure';
import { RecipeListClient } from './_components/recipe-list-client';

export const dynamic = 'force-dynamic';

export default async function RecipesPage() {
  const repository = new DrizzleRecipeRepository(getDb());
  const useCase = new GetRecipesUseCase(repository);
  const recipes = await useCase.execute();

  return <RecipeListClient initialRecipes={recipes} />;
}
