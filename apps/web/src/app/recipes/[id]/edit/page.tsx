import { GetRecipeUseCase, type RecipeDto, RecipeNotFoundError } from '@cookpit/application';
import { recipeRepository } from '@/server/repositories';
import { notFound } from 'next/navigation';
import { RecipeEditFormClient } from './_components/recipe-edit-form-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RecipeEditPage({ params }: Props) {
  const { id } = await params;
  const useCase = new GetRecipeUseCase(recipeRepository());

  let recipe: RecipeDto;
  try {
    recipe = await useCase.execute(id);
  } catch (error) {
    if (error instanceof RecipeNotFoundError) {
      notFound();
    }
    throw error;
  }
  return <RecipeEditFormClient recipe={recipe} />;
}
