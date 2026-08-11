import type { PantryRepository } from '@cookpit/domain';
import { EXPIRY_URGENCY_WITHIN_DAYS, selectExpiringStocks } from './expiry';
import type { StockDto } from './pantry.dto';
import { toPantryDto } from './pantry.mapper';

/**
 * 期限が近い在庫を取得する。ダッシュボード表示（初期表示）と日次通知
 * （`SendExpiryAlertsUseCase`）の両方から呼ばれる共有ロジック。
 * 数量 0 の在庫はここでは除外しない（表示用途と通知用途で除外要否が異なるため、
 * 除外は通知経路である `SendExpiryAlertsUseCase` 側のみで行う）。
 */
export class GetExpiringStocksUseCase {
  constructor(private readonly pantryRepository: PantryRepository) {}

  async execute(asOf: Date, withinDays: number = EXPIRY_URGENCY_WITHIN_DAYS): Promise<StockDto[]> {
    const pantry = await this.pantryRepository.find();
    return selectExpiringStocks(toPantryDto(pantry).stocks, asOf, withinDays);
  }
}
