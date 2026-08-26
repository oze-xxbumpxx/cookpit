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

/**
 * 品目の直前の生必要量（買う量 + 既に引いた量）。候補フィルタには使わない。
 * Sync の照合式とテストで sunk 込みの生値を説明するヘルパー。
 */
export function previousGrossRequiredAmount(item: ShoppingItemType): number {
  const buy = item.requiredAmount?.value ?? 0;
  const deducted = item.pantryDeductedAmount?.value ?? 0;
  return buy + deducted;
}

/**
 * 既存 pending 品目を今回の生必要量と照合し、既に引いた量を再消費せずに残りを控除する。
 * additionalNeeded は生必要量から sunk 分を引いて求め、sunk 分は戻り値に含めない。
 * 値なしの pantryDeductedAmount は null とし、前提が崩れても例外を投げない。
 */
export function reconcileItemDeduction(
  item: ShoppingItemType,
  aggregatedByKey: Map<string, ResolvedIngredient>,
  pantry: Pantry,
): QuantityUpdateResult {
  const currentAmount = item.requiredAmount;
  const aggregatedIngredient = aggregatedByKey.get(itemMatchKey(item));
  const newGross = aggregatedIngredient?.requiredAmount ?? null;
  if (currentAmount === null || aggregatedIngredient === undefined || newGross === null) {
    return { action: 'none', consumed: false, covered: null };
  }

  const unit = currentAmount.unit;
  const prevDeducted = item.pantryDeductedAmount?.value ?? 0;
  const additionalNeeded = newGross.value - prevDeducted;

  if (additionalNeeded <= 0 && item.productId !== null && aggregatedIngredient.productId !== null) {
    return {
      action: 'remove',
      consumed: false,
      covered: {
        displayName: aggregatedIngredient.displayName,
        productId: aggregatedIngredient.productId,
        requiredAmount: newGross,
        coveredAmount: newGross,
      },
    };
  }
  if (additionalNeeded <= 0) {
    return { action: 'update', amount: Quantity.of(0, unit), consumed: false, covered: null };
  }

  const {
    ingredients: afterAdditional,
    coveredIngredients,
    consumed,
  } = applyPantryDeduction(
    [
      {
        productId: item.productId,
        displayName: item.displayName,
        requiredAmount: Quantity.of(additionalNeeded, unit),
        amountNote: null,
      },
    ],
    pantry,
  );

  if (
    afterAdditional.length === 0 &&
    coveredIngredients.length > 0 &&
    item.productId !== null &&
    aggregatedIngredient.productId !== null
  ) {
    return {
      action: 'remove',
      consumed,
      covered: {
        displayName: aggregatedIngredient.displayName,
        productId: aggregatedIngredient.productId,
        requiredAmount: newGross,
        coveredAmount: newGross,
      },
    };
  }

  const newBuy = afterAdditional[0]?.requiredAmount?.value ?? additionalNeeded;
  const newlyDeducted = afterAdditional[0]?.pantryDeductedAmount?.value ?? 0;
  const nextDeductedValue = prevDeducted + newlyDeducted;
  const nextDeducted = nextDeductedValue === 0 ? null : Quantity.of(nextDeductedValue, unit);
  const currentDeductedValue = item.pantryDeductedAmount?.value ?? 0;
  const deductedUnchanged =
    (nextDeducted === null && item.pantryDeductedAmount === null) ||
    (nextDeducted !== null && currentDeductedValue === nextDeducted.value);

  if (newBuy === currentAmount.value && deductedUnchanged) {
    return { action: 'none', consumed, covered: null };
  }

  return {
    action: 'update',
    amount: Quantity.of(newBuy, unit),
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
