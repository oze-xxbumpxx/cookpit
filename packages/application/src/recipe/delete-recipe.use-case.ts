import { RecipeId } from '@cookpit/domain';
import type { UnitOfWork, RecipeRepository } from '@cookpit/domain';
import { RecipeNotFoundError } from './recipe-not-found.error';

export class DeleteRecipeUseCase {
  constructor(
    private readonly recipeRepository: RecipeRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(id: string): Promise<void> {
    return this.unitOfWork.execute(async () => {
      const recipeId = RecipeId.fromString(id);
      const recipe = await this.recipeRepository.findById(recipeId);
      if (recipe === null) {
        throw new RecipeNotFoundError(id);
      }

      await this.recipeRepository.delete(recipeId);
    });
  }
}
