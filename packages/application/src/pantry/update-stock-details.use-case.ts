import { Quantity, StockId } from '@cookpit/domain';
import type { UnitOfWork, PantryRepository } from '@cookpit/domain';
import { InvalidStockOperationError } from './invalid-stock-operation.error';
import type { PantryDto, UpdateStockDetailsInputDto } from './pantry.dto';
import { toPantryDto } from './pantry.mapper';
import { StockNotFoundError } from './stock-not-found.error';

/**
 * 在庫の数量・賞味期限・保存場所を全体置換で更新する。
 *
 * @throws StockNotFoundError stockId の Stock が存在しない
 * @throws InvalidStockOperationError amount.value が 0 以下
 */
export class UpdateStockDetailsUseCase {
  constructor(
    private readonly pantryRepository: PantryRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(input: UpdateStockDetailsInputDto): Promise<PantryDto> {
    return this.unitOfWork.execute(async () => {
      const pantry = await this.pantryRepository.find();
      const stockId = StockId.fromString(input.stockId);
      const stock = pantry.stocks.find((candidate) => candidate.id.equals(stockId)) ?? null;
      if (stock === null) {
        throw new StockNotFoundError(input.stockId);
      }

      try {
        pantry.updateStockDetails(stockId, {
          amount: Quantity.of(input.amount.value, input.amount.unit),
          expiresAt: input.expiresAt === null ? null : new Date(`${input.expiresAt}T00:00:00`),
          storedLocation: input.storedLocation,
        });
      } catch (error) {
        throw new InvalidStockOperationError(
          error instanceof Error ? error.message : 'Failed to update stock',
        );
      }

      await this.pantryRepository.save(pantry);
      return toPantryDto(pantry);
    });
  }
}
