import { StockId } from '@cookpit/domain';
import type { PantryRepository } from '@cookpit/domain';
import type { DiscardStockInputDto, PantryDto } from './pantry.dto';
import { toPantryDto } from './pantry.mapper';
import { StockNotFoundError } from './stock-not-found.error';

/**
 * 在庫を残量に関わらず全量廃棄する（部分廃棄はない。S-10: reason は受け取らない）。
 *
 * @throws StockNotFoundError stockId の Stock が存在しない
 */
export class DiscardStockUseCase {
  constructor(private readonly pantryRepository: PantryRepository) {}

  async execute(input: DiscardStockInputDto): Promise<PantryDto> {
    const pantry = await this.pantryRepository.find();
    const stockId = StockId.fromString(input.stockId);
    const stock = pantry.stocks.find((candidate) => candidate.id.equals(stockId)) ?? null;
    if (stock === null) {
      throw new StockNotFoundError(input.stockId);
    }

    pantry.discardStock(stockId);
    await this.pantryRepository.save(pantry);
    return toPantryDto(pantry);
  }
}
