import { ShoppingItem, ShoppingListId } from '@cookpit/domain';
import type {
  MealPlanRepository,
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
} from './ingredient-aggregation';
import { InvalidShoppingListStateError } from './invalid-shopping-list-state.error';
import type { ShoppingListDto, SyncShoppingListInputDto } from './shopping-list.dto';
import { toShoppingListDto } from './shopping-list.mapper';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

/**
 * 献立の変更を既存の買い物リストへ差分マージする（ADR-0007）。対象 MealPlan の現在の材料を
 * 再集計し、既存リストにまだ無い材料だけを新規 ShoppingItem として追加する。既存品目
 * （チェック済み・購入済み状態）は一切変更・削除しない。数量の増分・削除追随は行わない。
 *
 * 追加分にのみ在庫引き算を適用し、消費があれば Pantry を保存する。追加が 0 件なら no-op で
 * 現状のリストを返す。
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
    const existingKeys = new Set(shoppingList.items.map(itemMatchKey));
    const newIngredients = aggregated.filter(
      (ingredient) => !existingKeys.has(ingredientMatchKey(ingredient)),
    );
    if (newIngredients.length === 0) {
      return toShoppingListDto(shoppingList);
    }

    const pantry = await this.pantryRepository.find();
    const { ingredients: afterDeduction, consumed } = applyPantryDeduction(newIngredients, pantry);
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
    }

    // 追加品目があるときのみリストを保存。在庫でまかなえて追加 0 でも消費があれば Pantry を保存。
    if (afterDeduction.length > 0) {
      await this.shoppingListRepository.save(shoppingList);
    }
    if (consumed) {
      await this.pantryRepository.save(pantry);
    }

    return toShoppingListDto(shoppingList);
  }
}
