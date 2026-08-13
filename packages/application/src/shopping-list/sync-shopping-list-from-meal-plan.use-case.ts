import { Quantity, ShoppingItem, ShoppingListId } from '@cookpit/domain';
import type {
  MealPlanRepository,
  Pantry,
  PantryRepository,
  ProductRepository,
  RecipeRepository,
  ShoppingListRepository,
} from '@cookpit/domain';
import { InvalidMealPlanStateError } from '../meal-plan/invalid-meal-plan-state.error';
import { MealPlanNotFoundError } from '../meal-plan/meal-plan-not-found.error';
import {
  applyPantryDeduction,
  ingredientMatchKey,
  itemMatchKey,
  resolveMealPlanIngredients,
  resolveTargetStores,
  type ResolvedIngredient,
} from './ingredient-aggregation';
import { InvalidShoppingListStateError } from './invalid-shopping-list-state.error';
import type { ShoppingListDto, SyncShoppingListInputDto } from './shopping-list.dto';
import { toShoppingListDto } from './shopping-list.mapper';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

/**
 * 献立の変更を既存の買い物リストへ差分マージする（ADR-0007 / ADR-0018）。
 * 対象 MealPlan の現在の材料を再集計し、(a) 新規キーを追加 (b) from_meal_plan かつ pending の
 * 数量を上書き (c) 集計に無い from_meal_plan かつ pending を削除する。bought と手動追加は
 * 変更・削除しない。数量増加分にのみ在庫引き算を適用する。
 *
 * 追加・更新・削除が 0 件なら no-op で現状のリストを返す。
 *
 * @throws ShoppingListNotFoundError shoppingListId の ShoppingList が存在しない
 * @throws InvalidShoppingListStateError ShoppingList が completed（再開してから同期する）
 * @throws MealPlanNotFoundError 対応する MealPlan が存在しない
 * @throws InvalidMealPlanStateError MealPlan が draft（まだ生成前）
 */
export class SyncShoppingListFromMealPlanUseCase {
  constructor(
    private readonly shoppingListRepository: ShoppingListRepository,
    private readonly mealPlanRepository: MealPlanRepository,
    private readonly recipeRepository: RecipeRepository,
    private readonly productRepository: ProductRepository,
    private readonly pantryRepository: PantryRepository,
  ) {}

  async execute(input: SyncShoppingListInputDto): Promise<ShoppingListDto> {
    const shoppingList = await this.shoppingListRepository.findById(
      ShoppingListId.fromString(input.shoppingListId),
    );
    if (shoppingList === null) {
      throw new ShoppingListNotFoundError(input.shoppingListId);
    }
    if (shoppingList.status === 'completed') {
      throw new InvalidShoppingListStateError(shoppingList.status, 'sync');
    }

    const mealPlan = await this.mealPlanRepository.findById(shoppingList.mealPlanId);
    if (mealPlan === null) {
      throw new MealPlanNotFoundError(shoppingList.mealPlanId.value);
    }
    if (mealPlan.status === 'draft') {
      throw new InvalidMealPlanStateError(mealPlan.status, 'sync a ShoppingList from');
    }

    const aggregated = await resolveMealPlanIngredients(mealPlan, this.recipeRepository);
    const aggregatedByKey = new Map(
      aggregated.map((ingredient) => [ingredientMatchKey(ingredient), ingredient]),
    );
    const existingItems = shoppingList.items;
    const existingKeys = new Set(existingItems.map(itemMatchKey));

    const newIngredients = aggregated.filter(
      (ingredient) => !existingKeys.has(ingredientMatchKey(ingredient)),
    );

    const updateCandidates = existingItems.filter((item) => {
      if (item.source !== 'from_meal_plan' || item.status !== 'pending') {
        return false;
      }
      if (item.requiredAmount === null) {
        return false;
      }
      const aggregatedIngredient = aggregatedByKey.get(itemMatchKey(item));
      if (aggregatedIngredient === undefined || aggregatedIngredient.requiredAmount === null) {
        return false;
      }
      return aggregatedIngredient.requiredAmount.value !== item.requiredAmount.value;
    });

    const removalCandidates = existingItems.filter(
      (item) =>
        item.source === 'from_meal_plan' &&
        item.status === 'pending' &&
        !aggregatedByKey.has(itemMatchKey(item)),
    );

    if (
      newIngredients.length === 0 &&
      updateCandidates.length === 0 &&
      removalCandidates.length === 0
    ) {
      return toShoppingListDto(shoppingList);
    }

    const pantry = await this.pantryRepository.find();
    let listChanged = false;
    let pantryConsumed = false;

    for (const item of updateCandidates) {
      const result = applyQuantityUpdate(item, aggregatedByKey, pantry);
      pantryConsumed = pantryConsumed || result.consumed;
      if (result.action === 'remove') {
        shoppingList.removeItem(item.id);
        listChanged = true;
      } else if (result.action === 'update') {
        shoppingList.updateItemRequiredAmount(item.id, result.amount);
        listChanged = true;
      }
    }

    for (const item of removalCandidates) {
      shoppingList.removeItem(item.id);
      listChanged = true;
    }

    if (newIngredients.length > 0) {
      const { ingredients: afterDeduction, consumed } = applyPantryDeduction(
        newIngredients,
        pantry,
      );
      pantryConsumed = pantryConsumed || consumed;
      const targetStoreMap = await resolveTargetStores(afterDeduction, this.productRepository);
      for (const ingredient of afterDeduction) {
        shoppingList.addItem(
          ShoppingItem.create({
            productId: ingredient.productId,
            displayName: ingredient.displayName,
            requiredAmount: ingredient.requiredAmount,
            amountNote: ingredient.amountNote,
            targetStore:
              ingredient.productId === null
                ? null
                : (targetStoreMap.get(ingredient.productId.value) ?? null),
            source: 'from_meal_plan',
          }),
        );
        listChanged = true;
      }
    }

    if (listChanged) {
      await this.shoppingListRepository.save(shoppingList);
    }
    if (pantryConsumed) {
      await this.pantryRepository.save(pantry);
    }

    return toShoppingListDto(shoppingList);
  }
}

type QuantityUpdateResult =
  | { action: 'none'; consumed: boolean }
  | { action: 'remove'; consumed: boolean }
  | { action: 'update'; amount: Quantity; consumed: boolean };

function applyQuantityUpdate(
  item: ShoppingItem,
  aggregatedByKey: Map<string, ResolvedIngredient>,
  pantry: Pantry,
): QuantityUpdateResult {
  const currentAmount = item.requiredAmount;
  const aggregatedIngredient = aggregatedByKey.get(itemMatchKey(item));
  const newAmount = aggregatedIngredient?.requiredAmount ?? null;
  if (currentAmount === null || newAmount === null) {
    return { action: 'none', consumed: false };
  }

  const delta = newAmount.value - currentAmount.value;
  if (delta < 0) {
    return {
      action: 'update',
      amount: Quantity.of(newAmount.value, currentAmount.unit),
      consumed: false,
    };
  }
  if (delta === 0) {
    return { action: 'none', consumed: false };
  }

  const deltaIngredient: ResolvedIngredient = {
    productId: item.productId,
    displayName: item.displayName,
    requiredAmount: Quantity.of(delta, currentAmount.unit),
    amountNote: null,
  };
  const { ingredients: afterDelta, consumed } = applyPantryDeduction([deltaIngredient], pantry);
  const buyDelta = afterDelta[0]?.requiredAmount?.value ?? 0;
  const updatedValue = currentAmount.value + buyDelta;
  if (updatedValue <= 0) {
    return { action: 'remove', consumed };
  }
  if (updatedValue === currentAmount.value) {
    return { action: 'none', consumed };
  }
  return {
    action: 'update',
    amount: Quantity.of(updatedValue, currentAmount.unit),
    consumed,
  };
}
