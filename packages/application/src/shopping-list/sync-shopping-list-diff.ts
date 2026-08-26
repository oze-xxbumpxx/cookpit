import { Quantity } from '@cookpit/domain';
import type { CoveredIngredient, Pantry, ShoppingItem as ShoppingItemType } from '@cookpit/domain';
import {
  applyPantryDeduction,
  ingredientMatchKey,
  itemMatchKey,
  type ResolvedIngredient,
} from './ingredient-aggregation';

/**
 * 照合キーが重複する品目を分離する。旧仕様（数量なし材料を集計しなかった頃）に生成された
 * リストには同じ材料の行が複数あるため、同期のたびに 1 行へ寄せる。残すのは最初の 1 件で、
 * 2 件目以降のうち `from_meal_plan` かつ `pending` のものだけを重複として扱う
 * （bought は購入実績を、manually_added はユーザーの明示操作を失わせないため残す）。
 */
export function splitDuplicateItems(items: ShoppingItemType[]): {
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
export function collectNoteUpdates(
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

export function applyQuantityUpdate(
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
export function rewriteCoveredIngredients(
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
