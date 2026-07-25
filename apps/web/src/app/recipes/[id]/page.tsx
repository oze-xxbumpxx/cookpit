import { GetRecipeUseCase, type RecipeDto, RecipeNotFoundError } from '@cookpit/application';
import { recipeRepository } from '@/server/repositories';
import { notFound } from 'next/navigation';
import { RecipeDetailClient } from './_components/recipe-detail-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RecipeDetailPage({ params }: Props) {
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
  return <RecipeDetailClient recipe={recipe} />;
}
