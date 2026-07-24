import { type CreateStockInput } from '@cookpit/domain/src/pantry/pantry';
import type { PantryRepository } from '@cookpit/domain/src/pantry/pantry.repository';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { InvalidStockOperationError } from './invalid-stock-operation.error';
import type { AddStockInputDto, PantryDto } from './pantry.dto';
import { toPantryDto } from './pantry.mapper';

/**
 * 在庫を手動で 1 件追加する。買い物完了由来ではないため `productId` /
 * `sourceShoppingItemId` は常に null、`purchasedAt` はサーバー現在時刻を用いる。
 * 「追加＝常に新規 Stock」であり、既存 Stock への加算は行わない。
 *
 * @throws InvalidStockOperationError displayName が空白のみ、または amount が 0 以下の場合
 */
export class AddStockUseCase {
  constructor(private readonly pantryRepository: PantryRepository) {}

  async execute(input: AddStockInputDto): Promise<PantryDto> {
    const pantry = await this.pantryRepository.find();

    const stockInput: CreateStockInput = {
      productId: null,
      displayName: input.displayName,
      amount: Quantity.of(input.amount.value, input.amount.unit),
      purchasedAt: new Date(),
      // ローカル 0 時で構築し、mapper の toLocalDateString と往復整合させる。
      expiresAt: input.expiresAt === null ? null : new Date(`${input.expiresAt}T00:00:00`),
      storedLocation: input.storedLocation,
      sourceShoppingItemId: null,
    };

    try {
      pantry.addStock(stockInput);
    } catch (error) {
      throw new InvalidStockOperationError(
        error instanceof Error ? error.message : 'Failed to add stock',
      );
    }

    await this.pantryRepository.save(pantry);
    return toPantryDto(pantry);
  }
}
