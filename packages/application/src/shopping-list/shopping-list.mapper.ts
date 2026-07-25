import type { ShoppingItem, ShoppingList } from '@cookpit/domain';
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
  };
}

export function toShoppingListDto(shoppingList: ShoppingList): ShoppingListDto {
  return {
    id: shoppingList.id.value,
    mealPlanId: shoppingList.mealPlanId.value,
    shoppingDate: toLocalDateString(shoppingList.shoppingDate),
    status: shoppingList.status,
    items: shoppingList.items.map(toShoppingItemDto),
    createdAt: shoppingList.createdAt.toISOString(),
  };
}

// UTC 変換による日付ずれを避け、買い物日をローカル日付のまま境界外へ渡す。
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
