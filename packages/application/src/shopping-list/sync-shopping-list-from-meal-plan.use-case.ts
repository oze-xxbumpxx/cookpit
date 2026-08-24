import { Quantity, ShoppingItem, ShoppingListId } from '@cookpit/domain';
import type {
  CoveredIngredient,
  UnitOfWork,
  MealPlanRepository,
  Pantry,
  PantryRepository,
  ProductRepository,
  RecipeRepository,
  ShoppingItem as ShoppingItemType,
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
 * 数量を上書き (c) 同じく注記（「適量」等）を上書き (d) 集計に無い from_meal_plan かつ pending を
 * 削除 (e) 照合キーが重複する from_meal_plan かつ pending の行を 1 行へ寄せる。bought と手動追加は
 * 変更・削除しない。数量増加分にのみ在庫引き算を適用する。
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
        return aggregatedIngredient.requiredAmount.value !== item.requiredAmount.value;
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
        const result = applyQuantityUpdate(item, aggregatedByKey, pantry);
        pantryConsumed = pantryConsumed || result.consumed;
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
          // 増分が在庫でまかなえ買う量が変わらない場合でも、引き算スナップショットは更新する。
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

/**
 * 照合キーが重複する品目を分離する。旧仕様（数量なし材料を集計しなかった頃）に生成された
 * リストには同じ材料の行が複数あるため、同期のたびに 1 行へ寄せる。残すのは最初の 1 件で、
 * 2 件目以降のうち `from_meal_plan` かつ `pending` のものだけを重複として扱う
 * （bought は購入実績を、manually_added はユーザーの明示操作を失わせないため残す）。
 */
function splitDuplicateItems(items: ShoppingItemType[]): {
  uniqueItems: ShoppingItemType[];
  duplicateItems: ShoppingItemType[];
} {
  const seenKeys = new Set<string>();
  const uniqueItems: ShoppingItemType[] = [];
  const duplicateItems: ShoppingItemType[] = [];

  for (const item of items) {
    const key = itemMatchKey(item);
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueItems.push(item);
      continue;
    }
    if (item.source === 'from_meal_plan' && item.status === 'pending') {
      duplicateItems.push(item);
    } else {
      uniqueItems.push(item);
    }
  }

  return { uniqueItems, duplicateItems };
}

/** 数量なし材料の注記が集計結果と食い違う品目を集める（対象は数量更新と同じ絞り込み）。 */
function collectNoteUpdates(
  items: ShoppingItemType[],
  aggregatedByKey: Map<string, ResolvedIngredient>,
): Array<{ item: ShoppingItemType; note: string }> {
  const updates: Array<{ item: ShoppingItemType; note: string }> = [];

  for (const item of items) {
    if (item.source !== 'from_meal_plan' || item.status !== 'pending') {
      continue;
    }
    const currentNote = item.amountNote;
    if (currentNote === null) {
      continue;
    }
    const nextNote = aggregatedByKey.get(itemMatchKey(item))?.amountNote ?? null;
    if (nextNote === null || nextNote === currentNote) {
      continue;
    }
    updates.push({ item, note: nextNote });
  }

  return updates;
}

type QuantityUpdateResult =
  | {
      action: 'none';
      consumed: boolean;
      covered: CoveredIngredient | null;
      pantryDeductedAmount?: Quantity | null;
    }
  | {
      action: 'remove';
      consumed: boolean;
      covered: CoveredIngredient | null;
      pantryDeductedAmount?: Quantity | null;
    }
  | {
      action: 'update';
      amount: Quantity;
      consumed: boolean;
      covered: CoveredIngredient | null;
      pantryDeductedAmount?: Quantity | null;
    };

function applyQuantityUpdate(
  item: ShoppingItemType,
  aggregatedByKey: Map<string, ResolvedIngredient>,
  pantry: Pantry,
): QuantityUpdateResult {
  const currentAmount = item.requiredAmount;
  const aggregatedIngredient = aggregatedByKey.get(itemMatchKey(item));
  const newAmount = aggregatedIngredient?.requiredAmount ?? null;
  if (currentAmount === null || newAmount === null) {
    return { action: 'none', consumed: false, covered: null };
  }

  const delta = newAmount.value - currentAmount.value;
  if (delta < 0) {
    return {
      action: 'update',
      amount: Quantity.of(newAmount.value, currentAmount.unit),
      consumed: false,
      covered: null,
    };
  }
  if (delta === 0) {
    return { action: 'none', consumed: false, covered: null };
  }

  const deltaIngredient: ResolvedIngredient = {
    productId: item.productId,
    displayName: item.displayName,
    requiredAmount: Quantity.of(delta, currentAmount.unit),
    amountNote: null,
  };
  const {
    ingredients: afterDelta,
    coveredIngredients,
    consumed,
  } = applyPantryDeduction([deltaIngredient], pantry);
  const buyDelta = afterDelta[0]?.requiredAmount?.value ?? 0;
  const deltaDeducted = afterDelta[0]?.pantryDeductedAmount ?? null;
  const updatedValue = currentAmount.value + buyDelta;

  const previousDeducted = item.pantryDeductedAmount;
  let nextDeducted: Quantity | null | undefined = undefined;
  if (deltaDeducted !== null) {
    nextDeducted =
      previousDeducted === null
        ? deltaDeducted
        : Quantity.of(previousDeducted.value + deltaDeducted.value, previousDeducted.unit);
  } else if (coveredIngredients.length > 0) {
    // 増分が全量まかない → 増分すべてが引き算された扱い。
    const coveredDelta = coveredIngredients[0]?.coveredAmount ?? null;
    if (coveredDelta !== null) {
      nextDeducted =
        previousDeducted === null
          ? coveredDelta
          : Quantity.of(previousDeducted.value + coveredDelta.value, previousDeducted.unit);
    }
  }

  if (updatedValue <= 0) {
    // 防御的: 買う量が 0 以下になる場合は品目削除。集計必要量は covered として記録する。
    const covered: CoveredIngredient | null =
      aggregatedIngredient !== undefined &&
      aggregatedIngredient.productId !== null &&
      aggregatedIngredient.requiredAmount !== null
        ? {
            displayName: aggregatedIngredient.displayName,
            productId: aggregatedIngredient.productId,
            requiredAmount: aggregatedIngredient.requiredAmount,
            coveredAmount: aggregatedIngredient.requiredAmount,
          }
        : (coveredIngredients[0] ?? null);
    return nextDeducted === undefined
      ? { action: 'remove', consumed, covered }
      : { action: 'remove', consumed, covered, pantryDeductedAmount: nextDeducted };
  }
  if (updatedValue === currentAmount.value) {
    return nextDeducted === undefined
      ? { action: 'none', consumed, covered: null }
      : { action: 'none', consumed, covered: null, pantryDeductedAmount: nextDeducted };
  }
  return nextDeducted === undefined
    ? {
        action: 'update',
        amount: Quantity.of(updatedValue, currentAmount.unit),
        consumed,
        covered: null,
      }
    : {
        action: 'update',
        amount: Quantity.of(updatedValue, currentAmount.unit),
        consumed,
        covered: null,
        pantryDeductedAmount: nextDeducted,
      };
}

/**
 * 既存スナップショットのうち献立集計に残るキーを残し、今回の全量まかないをマージして書き換える。
 * 同一キーは今回の値で上書きする。
 */
function rewriteCoveredIngredients(
  previous: CoveredIngredient[] | null,
  aggregatedByKey: Map<string, ResolvedIngredient>,
  newlyCovered: CoveredIngredient[],
): CoveredIngredient[] {
  const byKey = new Map<string, CoveredIngredient>();

  for (const covered of previous ?? []) {
    const key = matchCoveredKey(covered);
    if (aggregatedByKey.has(key)) {
      byKey.set(key, covered);
    }
  }
  for (const covered of newlyCovered) {
    byKey.set(matchCoveredKey(covered), covered);
  }

  return [...byKey.values()];
}

function matchCoveredKey(covered: CoveredIngredient): string {
  return ingredientMatchKey({
    productId: covered.productId,
    displayName: covered.displayName,
    requiredAmount: covered.requiredAmount,
    amountNote: null,
  });
}
