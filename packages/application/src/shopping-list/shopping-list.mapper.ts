import type { ShoppingItem, ShoppingList } from '@cookpit/domain';
import { toLocalDateString } from '../shared/date';
import type { ShoppingItemDto, ShoppingListDto } from './shopping-list.dto';

export function toShoppingItemDto(item: ShoppingItem): ShoppingItemDto {
  return {
    id: item.id.value,
    productId: item.productId?.value ?? null,
    displayName: item.displayName,
    requiredAmount:
      item.requiredAmount === null
        ? null
        : { value: item.requiredAmount.value, unit: item.requiredAmount.unit },
    amountNote: item.amountNote,
    targetStoreId: item.targetStore?.value ?? null,
    status: item.status,
    actualPrice:
      item.actualPrice === null
        ? null
        : { amount: item.actualPrice.amount, currency: item.actualPrice.currency },
    actualStoreId: item.actualStore?.value ?? null,
    source: item.source,
    // スナップショット永続化は別バックエンド切片。未着の間は常に null（レガシーと同形）。
    pantryDeductedAmount: null,
  };
}

export function toShoppingListDto(shoppingList: ShoppingList): ShoppingListDto {
  return {
    id: shoppingList.id.value,
    mealPlanId: shoppingList.mealPlanId.value,
    shoppingDate: toLocalDateString(shoppingList.shoppingDate),
    status: shoppingList.status,
    items: shoppingList.items.map(toShoppingItemDto),
    // スナップショット永続化は別バックエンド切片。未着の間は常に null（レガシーと同形）。
    coveredIngredients: null,
    createdAt: shoppingList.createdAt.toISOString(),
  };
}
