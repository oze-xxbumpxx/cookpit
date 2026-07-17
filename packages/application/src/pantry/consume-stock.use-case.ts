import type { PantryRepository } from '@cookpit/domain/src/pantry/pantry.repository';
import { StockId } from '@cookpit/domain/src/pantry/stock-id';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { InvalidStockOperationError } from './invalid-stock-operation.error';
import type { ConsumeStockInputDto, PantryDto } from './pantry.dto';
import { toPantryDto } from './pantry.mapper';
import { StockNotFoundError } from './stock-not-found.error';

/**
 * 在庫を消費する。消費量が現在量以上の場合は Stock 側で全量消費にクランプする（S-7）。
 *
 * @throws StockNotFoundError stockId の Stock が存在しない
 * @throws InvalidStockOperationError amount.unit が対象 Stock の単位と一致しない
 */
export class ConsumeStockUseCase {
  constructor(private readonly pantryRepository: PantryRepository) {}

  async execute(input: ConsumeStockInputDto): Promise<PantryDto> {
    const pantry = await this.pantryRepository.find();
    const stockId = StockId.fromString(input.stockId);
    const stock = pantry.stocks.find((candidate) => candidate.id.equals(stockId)) ?? null;
    if (stock === null) {
      throw new StockNotFoundError(input.stockId);
    }
    if (input.amount.unit !== stock.amount.unit) {
      throw new InvalidStockOperationError(
        `Unit mismatch: expected ${stock.amount.unit}, got ${input.amount.unit}`,
      );
    }

    pantry.consumeStock(stockId, Quantity.of(input.amount.value, input.amount.unit));
    await this.pantryRepository.save(pantry);
    return toPantryDto(pantry);
  }
}
