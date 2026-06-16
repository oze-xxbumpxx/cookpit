import { getDb } from '@/db/client';
import { GetRecipeUseCase, type RecipeDto, RecipeNotFoundError } from '@cookpit/application';
import { DrizzleRecipeRepository } from '@cookpit/infrastructure';
import { notFound } from 'next/navigation';
import { RecipeDetailClient } from './_components/recipe-detail-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RecipeDetailPage({ params }: Props) {
  const { id } = await params;
  const repository = new DrizzleRecipeRepository(getDb());
  const useCase = new GetRecipeUseCase(repository);

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
