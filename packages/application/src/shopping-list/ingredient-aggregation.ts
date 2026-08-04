import {
  isCountableUnit,
  isSeasoningName,
  normalizeUnit,
  ProductId,
  Quantity,
  RecipeId,
} from '@cookpit/domain';
import type {
  MealPlan,
  Pantry,
  PlannedRecipe,
  ProductId as ProductIdType,
  ProductRepository,
  Recipe,
  RecipeRepository,
  ShoppingItem,
  Stock,
  StoreId,
  Unit,
} from '@cookpit/domain';

/**
 * MealPlan の材料を集計・在庫引き算・店舗解決する共通ロジック。
 * GenerateShoppingList（初回生成）と SyncShoppingListFromMealPlan（差分マージ）で共有する。
 */

export interface ResolvedIngredient {
  productId: ProductId | null;
  displayName: string;
  requiredAmount: Quantity | null;
  amountNote: string | null;
}

/**
 * MealPlan の各 PlannedRecipe をスケール適用のうえ材料へ展開し、集計する。
 * 調味料（`isSeasoningName` に一致する材料名）は常備前提で集計から除外する（要望1）。
 */
export async function resolveMealPlanIngredients(
  mealPlan: MealPlan,
  recipeRepository: RecipeRepository,
): Promise<ResolvedIngredient[]> {
  const resolved = await resolveRecipes(mealPlan, recipeRepository);
  return aggregateIngredients(resolved);
}

async function resolveRecipes(
  mealPlan: MealPlan,
  recipeRepository: RecipeRepository,
): Promise<Array<{ plannedRecipe: PlannedRecipe; recipe: Recipe }>> {
  const uniqueRecipeIds = [
    ...new Set(mealPlan.plannedRecipes.map((recipe) => recipe.recipeId.value)),
  ];
  const recipes = await Promise.all(
    uniqueRecipeIds.map((id) => recipeRepository.findById(RecipeId.fromString(id))),
  );
  const recipeMap = new Map<string, Recipe>();
  uniqueRecipeIds.forEach((id, index) => {
    const recipe = recipes[index];
    if (recipe !== null && recipe !== undefined) {
      recipeMap.set(id, recipe);
    }
  });

  const resolved: Array<{ plannedRecipe: PlannedRecipe; recipe: Recipe }> = [];
  for (const plannedRecipe of mealPlan.plannedRecipes) {
    const recipe = recipeMap.get(plannedRecipe.recipeId.value);
    if (recipe === undefined) {
      continue;
    }
    resolved.push({ plannedRecipe, recipe });
  }
  return resolved;
}

function aggregateIngredients(
  resolved: Array<{ plannedRecipe: PlannedRecipe; recipe: Recipe }>,
): ResolvedIngredient[] {
  const aggregated = new Map<
    string,
    { productId: ProductId | null; displayName: string; requiredAmount: Quantity }
  >();
  const individual: ResolvedIngredient[] = [];

  for (const { plannedRecipe, recipe } of resolved) {
    const scaled = recipe.scaleIngredients(plannedRecipe.scaleFactor);
    for (const ingredient of scaled) {
      // 調味料は家に常備されている前提で買い物リストから除外する（要望1）。
      if (isSeasoningName(ingredient.displayName)) {
        continue;
      }
      const productId = ingredient.productRef;

      if (ingredient.amount === null) {
        individual.push({
          productId,
          displayName: ingredient.displayName,
          requiredAmount: null,
          amountNote: ingredient.amountNote,
        });
        continue;
      }

      const key = `${productId === null ? ingredient.displayName.trim() : productId.value}|${normalizeUnit(ingredient.amount.unit)}`;
      const existing = aggregated.get(key);
      if (existing === undefined) {
        aggregated.set(key, {
          productId,
          displayName: ingredient.displayName,
          requiredAmount: ingredient.amount,
        });
      } else {
        aggregated.set(key, {
          ...existing,
          requiredAmount: existing.requiredAmount.add(ingredient.amount),
        });
      }
    }
  }

  const aggregatedResult: ResolvedIngredient[] = [...aggregated.values()].map((ingredient) => ({
    ...ingredient,
    amountNote: null,
  }));
  return [...aggregatedResult, ...individual];
}

/**
 * 集約済みの必要量から Pantry の在庫分を差し引き、買う量に調整した食材配列を返す。
 * 差し引いた在庫は `pantry` から消費する（副作用）。productId・単位が一致する在庫のみ対象。
 * 在庫でまかなえた食材は結果から除外する。
 *
 * @returns ingredients 買う量に調整済みの食材配列 / consumed 在庫を 1 件でも消費したか
 */
export function applyPantryDeduction(
  aggregated: ResolvedIngredient[],
  pantry: Pantry,
): { ingredients: ResolvedIngredient[]; consumed: boolean } {
  const result: ResolvedIngredient[] = [];
  let consumed = false;

  for (const ingredient of aggregated) {
    const required = ingredient.requiredAmount;
    const productId = ingredient.productId;
    if (required === null || productId === null) {
      result.push(ingredient);
      continue;
    }

    const unit = required.unit;
    const normalizedUnit = normalizeUnit(unit);
    const matching = pantry.stocks
      .filter(
        (stock) =>
          stock.productId !== null &&
          stock.productId.value === productId.value &&
          normalizeUnit(stock.amount.unit) === normalizedUnit,
      )
      .sort(compareStockForConsumption);
    const available = matching.reduce((sum, stock) => sum + stock.amount.value, 0);
    if (available === 0) {
      result.push(ingredient);
      continue;
    }

    consumeFromStocks(pantry, matching, Math.min(required.value, available), unit);
    consumed = true;

    const buyRaw = required.value - available;
    if (buyRaw <= 0) {
      continue;
    }
    const buy = isCountableUnit(unit) ? Math.ceil(buyRaw) : buyRaw;
    result.push({ ...ingredient, requiredAmount: Quantity.of(buy, unit) });
  }

  return { ingredients: result, consumed };
}

function consumeFromStocks(
  pantry: Pantry,
  orderedStocks: Stock[],
  totalToConsume: number,
  unit: Unit,
): void {
  let remaining = totalToConsume;
  for (const stock of orderedStocks) {
    if (remaining <= 0) {
      break;
    }
    const portion = Math.min(remaining, stock.amount.value);
    pantry.consumeStock(stock.id, Quantity.of(portion, unit));
    remaining -= portion;
  }
}

/** 食材の productId → 現時点で最安の店舗（無ければ null）を解決する。 */
export async function resolveTargetStores(
  ingredients: ResolvedIngredient[],
  productRepository: ProductRepository,
): Promise<Map<string, StoreId | null>> {
  const uniqueProductIds = [
    ...new Set(
      ingredients
        .map((ingredient) => ingredient.productId)
        .filter((productId): productId is ProductId => productId !== null)
        .map((productId) => productId.value),
    ),
  ];
  const products = await Promise.all(
    uniqueProductIds.map((id) => productRepository.findById(ProductId.fromString(id))),
  );

  const storeMap = new Map<string, StoreId | null>();
  uniqueProductIds.forEach((id, index) => {
    storeMap.set(id, products[index]?.cheapestStoreAt(new Date()) ?? null);
  });
  return storeMap;
}

/**
 * 差分マージ（Sync）用のマッチキー。集計キーと同一の規則で「同じ材料か」を判定する:
 * productId（無ければ displayName の trim）× 単位（requiredAmount が null の材料は 'note'）。
 */
function matchKey(productId: ProductIdType | null, displayName: string, unit: Unit | null): string {
  const base = productId === null ? displayName.trim() : productId.value;
  return `${base}|${unit === null ? 'note' : normalizeUnit(unit)}`;
}

export function ingredientMatchKey(ingredient: ResolvedIngredient): string {
  return matchKey(
    ingredient.productId,
    ingredient.displayName,
    ingredient.requiredAmount?.unit ?? null,
  );
}

export function itemMatchKey(item: ShoppingItem): string {
  return matchKey(item.productId, item.displayName, item.requiredAmount?.unit ?? null);
}

/** 在庫消費順: 賞味期限の近い順（null は最後）→ 購入日の古い順。 */
function compareStockForConsumption(a: Stock, b: Stock): number {
  const aExpires = a.expiresAt;
  const bExpires = b.expiresAt;
  if (aExpires !== null && bExpires !== null) {
    const diff = aExpires.getTime() - bExpires.getTime();
    if (diff !== 0) {
      return diff;
    }
  } else if (aExpires !== null) {
    return -1;
  } else if (bExpires !== null) {
    return 1;
  }
  return a.purchasedAt.getTime() - b.purchasedAt.getTime();
}
