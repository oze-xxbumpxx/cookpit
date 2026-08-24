import type { CoveredIngredient, ShoppingItem, ShoppingList } from '@cookpit/domain';
import { toLocalDateString } from '../shared/date';
import type { CoveredIngredientDto, ShoppingItemDto, ShoppingListDto } from './shopping-list.dto';

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
    pantryDeductedAmount:
      item.pantryDeductedAmount === null
        ? null
        : { value: item.pantryDeductedAmount.value, unit: item.pantryDeductedAmount.unit },
  };
}

function toCoveredIngredientDto(covered: CoveredIngredient): CoveredIngredientDto {
  return {
    displayName: covered.displayName,
    productId: covered.productId.value,
    requiredAmount: {
      value: covered.requiredAmount.value,
      unit: covered.requiredAmount.unit,
    },
    coveredAmount: {
      value: covered.coveredAmount.value,
      unit: covered.coveredAmount.unit,
    },
  };
}

export function toShoppingListDto(shoppingList: ShoppingList): ShoppingListDto {
  return {
    id: shoppingList.id.value,
    mealPlanId: shoppingList.mealPlanId.value,
    shoppingDate: toLocalDateString(shoppingList.shoppingDate),
    status: shoppingList.status,
    items: shoppingList.items.map(toShoppingItemDto),
    coveredIngredients:
      shoppingList.coveredIngredients === null
        ? null
        : shoppingList.coveredIngredients.map(toCoveredIngredientDto),
    createdAt: shoppingList.createdAt.toISOString(),
  };
}
