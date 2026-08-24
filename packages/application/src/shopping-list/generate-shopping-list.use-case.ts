import { MealPlanId, ShoppingItem, ShoppingList } from '@cookpit/domain';
import type {
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
  resolveMealPlanIngredients,
  resolveTargetStores,
} from './ingredient-aggregation';
import type {
  GenerateShoppingListInputDto,
  GenerateShoppingListResultDto,
} from './shopping-list.dto';
import { toShoppingListDto } from './shopping-list.mapper';

/**
 * MealPlan（draft）から買い物リストを生成し、MealPlan を shopping へ遷移させる。
 * 冪等: 既存リストがあれば新規生成せずそれを返す（created: false）。その際 MealPlan が
 * draft のままなら shopping へ遷移させ、部分失敗状態を自己修復する（S-6）。
 *
 * 初回生成（created: true）時は Pantry の在庫を考慮し、productId・単位が一致する在庫分を
 * 必要量から差し引いてから ShoppingItem を生成する。差し引いた分は Pantry から実際に消費し
 * 保存する（副作用）。冪等パス（created: false）では在庫消費を行わない。
 *
 * @throws MealPlanNotFoundError mealPlanId の MealPlan が存在しない
 * @throws InvalidMealPlanStateError MealPlan が draft 以外で、かつ既存リストもない
 */
export class GenerateShoppingListUseCase {
  constructor(
    private readonly mealPlanRepository: MealPlanRepository,
    private readonly recipeRepository: RecipeRepository,
    private readonly productRepository: ProductRepository,
    private readonly shoppingListRepository: ShoppingListRepository,
    private readonly pantryRepository: PantryRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(input: GenerateShoppingListInputDto): Promise<GenerateShoppingListResultDto> {
    return this.unitOfWork.execute(async () => {
      const mealPlanId = MealPlanId.fromString(input.mealPlanId);
      const mealPlan = await this.mealPlanRepository.findById(mealPlanId);
      if (mealPlan === null) {
        throw new MealPlanNotFoundError(input.mealPlanId);
      }

      const existing = await this.shoppingListRepository.findByMealPlanId(mealPlanId);
      if (existing !== null) {
        if (mealPlan.status === 'draft') {
          mealPlan.transitionTo('shopping');
          await this.mealPlanRepository.save(mealPlan);
        }
        return { shoppingList: toShoppingListDto(existing), created: false };
      }

      if (mealPlan.status !== 'draft') {
        throw new InvalidMealPlanStateError(mealPlan.status, 'generate a ShoppingList from');
      }

      const aggregated = await resolveMealPlanIngredients(mealPlan, this.recipeRepository);
      const pantry = await this.pantryRepository.find();
      const {
        ingredients: afterDeduction,
        coveredIngredients,
        consumed,
      } = applyPantryDeduction(aggregated, pantry);
      const targetStoreMap = await resolveTargetStores(afterDeduction, this.productRepository);

      const items = afterDeduction.map((ingredient) =>
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

      const shoppingList = ShoppingList.create({
        mealPlanId,
        items,
        shoppingDate: mealPlan.weekOf.startDate(),
        coveredIngredients,
      });

      // 集約横断の永続化順序（D-7）: ShoppingList → Pantry → MealPlan。同一 UoW で原子的に保存する。
      await this.shoppingListRepository.save(shoppingList);
      if (consumed) {
        await this.pantryRepository.save(pantry);
      }
      mealPlan.transitionTo('shopping');
      await this.mealPlanRepository.save(mealPlan);

      return { shoppingList: toShoppingListDto(shoppingList), created: true };
    });
  }
}
