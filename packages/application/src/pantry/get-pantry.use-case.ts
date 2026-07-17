import type { PantryRepository } from '@cookpit/domain/src/pantry/pantry.repository';
import type { PantryDto } from './pantry.dto';
import { toPantryDto } from './pantry.mapper';

/** 在庫 0 件でも常に成功する（S-1。「未作成」という状態が存在しない）。 */
export class GetPantryUseCase {
  constructor(private readonly pantryRepository: PantryRepository) {}

  async execute(): Promise<PantryDto> {
    const pantry = await this.pantryRepository.find();
    return toPantryDto(pantry);
  }
}
