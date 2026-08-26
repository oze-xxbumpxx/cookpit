import { ShoppingListId } from '@cookpit/domain';
import type {
  UnitOfWork,
  MealPlanRepository,
  PantryRepository,
  ProductRepository,
  ShoppingListRepository,
} from '@cookpit/domain';
import { addStocks, resolveStockAdditions } from './complete-shopping-pantry';
import { recordPrices } from './complete-shopping-prices';
import { repairMealPlanTransition } from './complete-shopping-meal-plan';
import type { CompleteShoppingInputDto, ShoppingListDto } from './shopping-list.dto';
import { toShoppingListDto } from './shopping-list.mapper';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

/**
 * 買い物完了を確定し、選択された品目の Pantry への在庫追加・Product への価格記録・
 * MealPlan の shopping→cooking 遷移を行う。
 *
 * 在庫化する品目は呼び出し側が `stockAdditions` で明示する（購入した品目が自動で在庫になることはない）。
 * 価格記録は `stockAdditions` と独立に bought 品目の全件を対象とする。
 *
 * 冪等: 既に completed の場合は在庫追加・価格記録を再実行せず、`stockAdditions` を無視して
 * MealPlan 遷移の修復のみ行い、現状の ShoppingListDto を返す。reopen（買い物再開）→買い足し→
 * 再 complete しても、在庫は同一買い物品目由来の Stock があればスキップし、価格はレコード ID を
 * 買い物品目 ID から決定的に導出して既存ならスキップするため、前回処理済みの品目は二重に
 * 在庫化・価格記録されない。数量不明・0 以下や価格未設定の bought 品目は価格記録をスキップする。
 *
 * 保存順序は Pantry → Product → ShoppingList → MealPlan。ShoppingList の保存が
 * 「これより前は再実行対象・これより後は修復のみ」の境界になる。書き込み全体は
 * `UnitOfWork.execute` で 1 トランザクションになる（ADR-0019）。冪等ガードは
 * リトライ時の二重処理防止として残す。
 *
 * @throws ShoppingListNotFoundError shoppingListId の ShoppingList が存在しない
 * @throws ShoppingItemNotFoundError stockAdditions の itemId がリストに存在しない
 * @throws InvalidStockOperationError stockAdditions の itemId が bought でない、または数量が不正
 */
export class CompleteShoppingUseCase {
  constructor(
    private readonly shoppingListRepository: ShoppingListRepository,
    private readonly pantryRepository: PantryRepository,
    private readonly productRepository: ProductRepository,
    private readonly mealPlanRepository: MealPlanRepository,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(input: CompleteShoppingInputDto): Promise<ShoppingListDto> {
    return this.unitOfWork.execute(async () => {
      const shoppingListId = ShoppingListId.fromString(input.shoppingListId);
      const shoppingList = await this.shoppingListRepository.findById(shoppingListId);
      if (shoppingList === null) {
        throw new ShoppingListNotFoundError(input.shoppingListId);
      }

      if (shoppingList.status === 'completed') {
        await repairMealPlanTransition(shoppingList.mealPlanId, this.mealPlanRepository);
        return toShoppingListDto(shoppingList);
      }

      const boughtItems = shoppingList.items.filter((item) => item.isBought());
      const now = new Date();

      // 検証は書き込みより前にまとめて行い、不正な指定が 1 件でもあれば何も保存しないようにする。
      const resolved = resolveStockAdditions(shoppingList, input.stockAdditions);
      await addStocks(resolved, this.pantryRepository, now);

      await recordPrices(boughtItems, this.productRepository, now);

      shoppingList.complete();
      await this.shoppingListRepository.save(shoppingList);

      await repairMealPlanTransition(shoppingList.mealPlanId, this.mealPlanRepository);

      return toShoppingListDto(shoppingList);
    });
  }
}
