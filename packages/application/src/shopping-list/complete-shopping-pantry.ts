import { Quantity, ShoppingItemId } from '@cookpit/domain';
import type {
  CreateStockInput,
  Pantry,
  PantryRepository,
  ShoppingItem,
  ShoppingList,
} from '@cookpit/domain';
import { InvalidStockOperationError } from '../pantry/invalid-stock-operation.error';
import { requireItem } from './load-shopping-list';
import type { StockAdditionInputDto } from './shopping-list.dto';

/** 検証済みの在庫追加指定と、その対象となる買い物品目の組。 */
export interface ResolvedStockAddition {
  item: ShoppingItem;
  addition: StockAdditionInputDto;
}

export function resolveStockAdditions(
  shoppingList: ShoppingList,
  additions: StockAdditionInputDto[],
): ResolvedStockAddition[] {
  const resolved: ResolvedStockAddition[] = [];
  const seen = new Set<string>();

  for (const addition of additions) {
    // 同一品目の重複指定は先勝ちで 1 件だけ採用する。UI からは作れないが、DB の
    // source_shopping_item_id UNIQUE に当てて 500 にするより穏当（D-4）。
    if (seen.has(addition.itemId)) {
      continue;
    }
    seen.add(addition.itemId);

    const item = requireItem(
      shoppingList,
      ShoppingItemId.fromString(addition.itemId),
      addition.itemId,
    );
    if (!item.isBought()) {
      throw new InvalidStockOperationError(
        `ShoppingItem ${addition.itemId} is not bought, cannot add to pantry`,
      );
    }
    resolved.push({ item, addition });
  }

  return resolved;
}

export async function addStocks(
  resolved: ResolvedStockAddition[],
  pantryRepository: PantryRepository,
  now: Date,
): Promise<void> {
  if (resolved.length === 0) {
    return;
  }

  const pantry = await pantryRepository.find();
  let changed = false;
  for (const { item, addition } of resolved) {
    // 前回の完了で在庫化済みの品目はスキップする。reopen→再完了での二重在庫を防ぐ
    // （Application 側の事前スキップ。DB の source_shopping_item_id UNIQUE が二段目）。
    if (pantry.hasStockFromShoppingItem(item.id)) {
      continue;
    }
    addStock(pantry, item, addition, now);
    changed = true;
  }

  if (changed) {
    await pantryRepository.save(pantry);
  }
}

function addStock(
  pantry: Pantry,
  item: ShoppingItem,
  addition: StockAdditionInputDto,
  now: Date,
): void {
  const stockInput: CreateStockInput = {
    productId: item.productId,
    displayName: item.displayName,
    amount: Quantity.of(addition.amount.value, addition.amount.unit),
    purchasedAt: now,
    // ローカル 0 時で構築し、mapper の toLocalDateString と往復整合させる（AddStockUseCase と同じ）。
    expiresAt: addition.expiresAt === null ? null : new Date(`${addition.expiresAt}T00:00:00`),
    storedLocation: addition.storedLocation,
    sourceShoppingItemId: item.id,
  };

  try {
    pantry.addStock(stockInput);
  } catch (error) {
    throw new InvalidStockOperationError(
      error instanceof Error ? error.message : 'Failed to add stock',
    );
  }
}
