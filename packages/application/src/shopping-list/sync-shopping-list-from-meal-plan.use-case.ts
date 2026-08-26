import { ShoppingItem, ShoppingListId } from '@cookpit/domain';
import type {
  CoveredIngredient,
  UnitOfWork,
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
import {
  collectNoteUpdates,
  reconcileItemDeduction,
  rewriteCoveredIngredients,
  splitDuplicateItems,
} from './sync-shopping-list-diff';

/**
 * 献立の変更を既存の買い物リストへ差分マージする（ADR-0007 / ADR-0018）。
 * 対象 MealPlan の現在の材料を再集計し、(a) 新規キーを追加 (b) from_meal_plan かつ pending の
 * 数量を上書き (c) 同じく注記（「適量」等）を上書き (d) 集計に無い from_meal_plan かつ pending を
 * 削除 (e) 照合キーが重複する from_meal_plan かつ pending の行を 1 行へ寄せる。bought と手動追加は
 * 変更・削除しない。from_meal_plan かつ pending の品目には、既に引いた量を除く残り必要量へ
 * 在庫引き算を適用する。
 *
 * 差分があった場合は coveredIngredients スナップショットも書き換える（在庫カバレッジ表示用）。
 * 追加・更新・削除・重複解消が 0 件なら no-op で現状のリストを返す（スナップショットも触らない）。
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
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(input: SyncShoppingListInputDto): Promise<ShoppingListDto> {
    return this.unitOfWork.execute(async () => {
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
      const { uniqueItems, duplicateItems } = splitDuplicateItems(shoppingList.items);
      const existingKeys = new Set(shoppingList.items.map(itemMatchKey));

      const newIngredients = aggregated.filter(
        (ingredient) => !existingKeys.has(ingredientMatchKey(ingredient)),
      );

      const updateCandidates = uniqueItems.filter((item) => {
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
        return true;
      });

      const noteUpdates = collectNoteUpdates(uniqueItems, aggregatedByKey);

      const removalCandidates = uniqueItems.filter(
        (item) =>
          item.source === 'from_meal_plan' &&
          item.status === 'pending' &&
          !aggregatedByKey.has(itemMatchKey(item)),
      );

      if (
        newIngredients.length === 0 &&
        updateCandidates.length === 0 &&
        noteUpdates.length === 0 &&
        removalCandidates.length === 0 &&
        duplicateItems.length === 0
      ) {
        return toShoppingListDto(shoppingList);
      }

      const pantry = await this.pantryRepository.find();
      let listChanged = false;
      let pantryConsumed = false;
      const newlyCovered: CoveredIngredient[] = [];

      for (const item of updateCandidates) {
        const result = reconcileItemDeduction(item, aggregatedByKey, pantry);
        pantryConsumed ||= result.consumed;
        if (result.covered !== null) {
          newlyCovered.push(result.covered);
        }
        if (result.action === 'remove') {
          shoppingList.removeItem(item.id);
          listChanged = true;
        } else if (result.action === 'update') {
          shoppingList.updateItemRequiredAmount(item.id, result.amount);
          if (result.pantryDeductedAmount !== undefined) {
            shoppingList.updateItemPantryDeductedAmount(item.id, result.pantryDeductedAmount);
          }
          listChanged = true;
        } else if (result.pantryDeductedAmount !== undefined) {
          // 買う量が変わらない場合でも、引き算スナップショットは更新する。
          shoppingList.updateItemPantryDeductedAmount(item.id, result.pantryDeductedAmount);
          listChanged = true;
        }
      }

      for (const { item, note } of noteUpdates) {
        shoppingList.updateItemAmountNote(item.id, note);
        listChanged = true;
      }

      for (const item of [...removalCandidates, ...duplicateItems]) {
        shoppingList.removeItem(item.id);
        listChanged = true;
      }

      if (newIngredients.length > 0) {
        const {
          ingredients: afterDeduction,
          coveredIngredients,
          consumed,
        } = applyPantryDeduction(newIngredients, pantry);
        pantryConsumed = pantryConsumed || consumed;
        newlyCovered.push(...coveredIngredients);
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
              pantryDeductedAmount: ingredient.pantryDeductedAmount,
            }),
          );
          listChanged = true;
        }
      }

      if (
        !listChanged &&
        !pantryConsumed &&
        newlyCovered.length === 0 &&
        newIngredients.length === 0
      ) {
        return toShoppingListDto(shoppingList);
      }

      // 献立に残る既存 covered + 今回の全量まかないでスナップショットを書き換える。
      const rewritten = rewriteCoveredIngredients(
        shoppingList.coveredIngredients,
        aggregatedByKey,
        newlyCovered,
      );
      shoppingList.replaceCoveredIngredients(rewritten);
      listChanged = true;

      if (listChanged) {
        await this.shoppingListRepository.save(shoppingList);
      }
      if (pantryConsumed) {
        await this.pantryRepository.save(pantry);
      }

      return toShoppingListDto(shoppingList);
    });
  }
}
