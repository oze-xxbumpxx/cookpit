import type { MealPlanId } from '@cookpit/domain/src/meal-plan/meal-plan-id';
import type { MealPlanRepository } from '@cookpit/domain/src/meal-plan/meal-plan.repository';
import type { CreateStockInput, Pantry } from '@cookpit/domain/src/pantry/pantry';
import type { PantryRepository } from '@cookpit/domain/src/pantry/pantry.repository';
import { PriceRecordId } from '@cookpit/domain/src/product/price-record-id';
import { PriceRecord } from '@cookpit/domain/src/product/product';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import type { ProductRepository } from '@cookpit/domain/src/product/product.repository';
import { UnitPriceCalculator } from '@cookpit/domain/src/product/unit-price-calculator';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import type { ShoppingItem } from '@cookpit/domain/src/shopping-list/shopping-list';
import { ShoppingListId } from '@cookpit/domain/src/shopping-list/shopping-list-id';
import type { ShoppingListRepository } from '@cookpit/domain/src/shopping-list/shopping-list.repository';
import type { CompleteShoppingInputDto, ShoppingListDto } from './shopping-list.dto';
import { toShoppingListDto } from './shopping-list.mapper';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

/**
 * 買い物完了を確定し、Pantry への在庫追加・Product への価格記録・MealPlan の
 * shopping→cooking 遷移までを一括して行う（4 集約またぎ・D-1）。
 *
 * 冪等: 既に completed の場合は Stock 追加・価格記録を再実行せず、MealPlan 遷移の
 * 修復のみ行って現状の ShoppingListDto を返す（S-3 案 B2）。保存順序は
 * Pantry → Product → ShoppingList → MealPlan（S-3 (2)）。ShoppingList の保存が
 * 「これより前は再実行対象・これより後は修復のみ」の境界（冪等ガードのコミットポイント）。
 * 在庫・価格記録とも「既に在庫化済みの品目」を除外して処理するため、reopen（買い物を再開）
 * → 買い足し → 再 complete しても、前回処理済みの品目は二重在庫・二重価格記録されない。
 * 数量不明または 0 以下の bought 品目は、在庫欠落を避けるため 1 個として Stock 化し、
 * 価格記録のみスキップする。
 *
 * @throws ShoppingListNotFoundError shoppingListId の ShoppingList が存在しない
 */
export class CompleteShoppingUseCase {
  constructor(
    private readonly shoppingListRepository: ShoppingListRepository,
    private readonly pantryRepository: PantryRepository,
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

    const pantry = await this.pantryRepository.find();
    // 既に在庫化済み（前回の完了で処理済み）の品目は在庫・価格とも再処理しない。
    // 買い物を再開（reopen）→買い足し→再完了したときに、二重在庫・二重価格記録を防ぐ
    // （品目単位の冪等化。在庫の有無を「その品目が前回処理済みか」の判定に使う）。
    const newlySettledItems = boughtItems.filter(
      (item) => !pantry.hasStockFromShoppingItem(item.id),
    );
    this.addStocks(pantry, newlySettledItems, now);
    await this.pantryRepository.save(pantry);

    await this.recordPrices(newlySettledItems, now);

    shoppingList.complete();
    await this.shoppingListRepository.save(shoppingList);

    await this.repairMealPlanTransition(shoppingList.mealPlanId);

    return toShoppingListDto(shoppingList);
  }

  private addStocks(pantry: Pantry, boughtItems: ShoppingItem[], now: Date): void {
    for (const item of boughtItems) {
      if (!pantry.hasStockFromShoppingItem(item.id)) {
        pantry.addStock(this.toAddStockInput(item, now));
      }
    }
  }

  private toAddStockInput(item: ShoppingItem, now: Date): CreateStockInput {
    const amount =
      item.requiredAmount === null || item.requiredAmount.value <= 0
        ? Quantity.of(1, '個')
        : item.requiredAmount;

    return {
      productId: item.productId,
      displayName: item.displayName,
      amount,
      purchasedAt: now,
      expiresAt: null,
      storedLocation: null,
      sourceShoppingItemId: item.id,
    };
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

    for (const [productIdValue, items] of groups) {
      const product = await this.productRepository.findById(ProductId.fromString(productIdValue));
      if (product === null) {
        continue;
      }
      for (const item of items) {
        const record = this.buildPriceRecord(item, now);
        if (record !== null) {
          product.recordPrice(record);
        }
      }
      await this.productRepository.save(product);
    }
  }

  private buildPriceRecord(item: ShoppingItem, now: Date): PriceRecord | null {
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
      id: PriceRecordId.generate(),
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
