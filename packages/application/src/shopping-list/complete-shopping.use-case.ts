import {
  PriceRecord,
  PriceRecordId,
  ProductId,
  ShoppingListId,
  UnitPriceCalculator,
} from '@cookpit/domain';
import type {
  MealPlanId,
  MealPlanRepository,
  ProductRepository,
  ShoppingItem,
  ShoppingListRepository,
} from '@cookpit/domain';
import type { CompleteShoppingInputDto, ShoppingListDto } from './shopping-list.dto';
import { toShoppingListDto } from './shopping-list.mapper';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

/**
 * 買い物完了を確定し、Product への価格記録・MealPlan の shopping→cooking 遷移を行う。
 * 在庫（Pantry）への自動追加は行わない（在庫は在庫画面から手動で追加する。項目6）。
 *
 * 冪等: 既に completed の場合は価格記録を再実行せず、MealPlan 遷移の修復のみ行って現状の
 * ShoppingListDto を返す。reopen（買い物再開）→買い足し→再 complete しても、価格レコード ID を
 * 買い物品目 ID から決定的に導出し、対象 Product に同 ID が既に存在すればスキップするため、
 * 前回記録済みの品目は二重に価格記録されない。数量不明・0 以下や価格未設定の bought 品目は
 * 価格記録をスキップする。保存順序は Product → ShoppingList → MealPlan。
 *
 * @throws ShoppingListNotFoundError shoppingListId の ShoppingList が存在しない
 */
export class CompleteShoppingUseCase {
  constructor(
    private readonly shoppingListRepository: ShoppingListRepository,
    private readonly productRepository: ProductRepository,
    private readonly mealPlanRepository: MealPlanRepository,
  ) {}

  async execute(input: CompleteShoppingInputDto): Promise<ShoppingListDto> {
    const shoppingListId = ShoppingListId.fromString(input.shoppingListId);
    const shoppingList = await this.shoppingListRepository.findById(shoppingListId);
    if (shoppingList === null) {
      throw new ShoppingListNotFoundError(input.shoppingListId);
    }

    if (shoppingList.status === 'completed') {
      await this.repairMealPlanTransition(shoppingList.mealPlanId);
      return toShoppingListDto(shoppingList);
    }

    const boughtItems = shoppingList.items.filter((item) => item.isBought());
    const now = new Date();

    await this.recordPrices(boughtItems, now);

    shoppingList.complete();
    await this.shoppingListRepository.save(shoppingList);

    await this.repairMealPlanTransition(shoppingList.mealPlanId);

    return toShoppingListDto(shoppingList);
  }

  private async recordPrices(boughtItems: ShoppingItem[], now: Date): Promise<void> {
    const groups = new Map<string, ShoppingItem[]>();
    for (const item of boughtItems) {
      if (item.productId === null) {
        continue;
      }
      const key = item.productId.value;
      const existing = groups.get(key) ?? [];
      existing.push(item);
      groups.set(key, existing);
    }

    // product の取得（読み取り）は N+1 を避けて並列化する。保存は group 順に逐次実行し、
    // 保存順序を決定的に保つ（複数 product でも並列書き込みにしない）。
    const groupEntries = [...groups];
    const products = await Promise.all(
      groupEntries.map(([productIdValue]) =>
        this.productRepository.findById(ProductId.fromString(productIdValue)),
      ),
    );

    for (let index = 0; index < groupEntries.length; index += 1) {
      const product = products[index];
      const entry = groupEntries[index];
      if (product === null || product === undefined || entry === undefined) {
        continue;
      }
      const items = entry[1];
      let changed = false;
      for (const item of items) {
        // 価格レコード ID を品目 ID から決定的に導出し、既に記録済みならスキップする。
        // reopen→再 complete での二重記録を防ぐ（品目単位の冪等化）。
        const priceRecordId = PriceRecordId.fromString(item.id.value);
        if (product.priceHistory.some((record) => record.id.equals(priceRecordId))) {
          continue;
        }
        const record = this.buildPriceRecord(item, priceRecordId, now);
        if (record !== null) {
          product.recordPrice(record);
          changed = true;
        }
      }
      if (changed) {
        await this.productRepository.save(product);
      }
    }
  }

  private buildPriceRecord(
    item: ShoppingItem,
    priceRecordId: PriceRecordId,
    now: Date,
  ): PriceRecord | null {
    const actualPrice = item.actualPrice;
    const actualStore = item.actualStore;
    if (actualPrice === null || actualStore === null) {
      return null;
    }
    if (actualPrice.amount <= 0) {
      return null;
    }
    if (item.requiredAmount === null || item.requiredAmount.value <= 0) {
      return null;
    }

    const packageSize = item.requiredAmount;
    const unitPrice = UnitPriceCalculator.calculate(actualPrice, packageSize);
    if (unitPrice.amount <= 0) {
      return null;
    }

    return PriceRecord.create({
      id: priceRecordId,
      storeId: actualStore,
      price: actualPrice,
      unitPrice,
      packageSize,
      observedAt: now,
    });
  }

  private async repairMealPlanTransition(mealPlanId: MealPlanId): Promise<void> {
    const mealPlan = await this.mealPlanRepository.findById(mealPlanId);
    if (mealPlan === null) {
      return;
    }
    if (mealPlan.status === 'draft') {
      mealPlan.transitionTo('shopping');
      mealPlan.transitionTo('cooking');
      await this.mealPlanRepository.save(mealPlan);
      return;
    }
    if (mealPlan.status === 'shopping') {
      mealPlan.transitionTo('cooking');
      await this.mealPlanRepository.save(mealPlan);
    }
  }
}
