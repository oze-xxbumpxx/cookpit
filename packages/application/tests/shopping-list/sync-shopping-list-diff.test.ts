import { describe, expect, it } from 'vitest';
import { Pantry, ProductId, Quantity } from '@cookpit/domain';
import { ingredientMatchKey } from '../../src/shopping-list/ingredient-aggregation';
import {
  collectNoteUpdates,
  previousGrossRequiredAmount,
  reconcileItemDeduction,
  rewriteCoveredIngredients,
  splitDuplicateItems,
} from '../../src/shopping-list/sync-shopping-list-diff';
import { PRODUCT_ID, seededItem, stockInput } from './test-helpers';

function resolvedIngredient(
  displayName: string,
  value: number,
  productId: string | null = PRODUCT_ID,
) {
  return {
    productId: productId === null ? null : ProductId.fromString(productId),
    displayName,
    requiredAmount: Quantity.of(value, '個'),
    amountNote: null,
  };
}

function aggregatedMap(
  displayName: string,
  value: number,
  productId: string | null = PRODUCT_ID,
): Map<string, ReturnType<typeof resolvedIngredient>> {
  const ingredient = resolvedIngredient(displayName, value, productId);
  return new Map([[ingredientMatchKey(ingredient), ingredient]]);
}

function pantryWithStock(value: number): Pantry {
  const pantry = Pantry.create();
  if (value > 0) {
    pantry.addStock(stockInput(PRODUCT_ID, value, '個'));
  }
  return pantry;
}

describe('sync-shopping-list-diff', () => {
  it('previousGrossRequiredAmount は sunk 分なしでは買う量を返す', () => {
    expect(previousGrossRequiredAmount(seededItem())).toBe(2);
  });

  it('previousGrossRequiredAmount は買う量に sunk 分を加算する', () => {
    expect(
      previousGrossRequiredAmount(
        seededItem({
          requiredAmount: Quantity.of(3, '個'),
          pantryDeductedAmount: Quantity.of(2, '個'),
        }),
      ),
    ).toBe(5);
  });

  it('増加して pantry が十分なら remove と全量 covered を返す', () => {
    const result = reconcileItemDeduction(
      seededItem(),
      aggregatedMap('玉ねぎ', 4),
      pantryWithStock(5),
    );

    expect(result).toMatchObject({
      action: 'remove',
      consumed: true,
      covered: {
        displayName: '玉ねぎ',
        productId: ProductId.fromString(PRODUCT_ID),
        requiredAmount: Quantity.of(4, '個'),
        coveredAmount: Quantity.of(4, '個'),
      },
    });
  });

  it('増加して pantry が部分的なら sunk 分に新規控除を加算する', () => {
    const result = reconcileItemDeduction(
      seededItem(),
      aggregatedMap('玉ねぎ', 4),
      pantryWithStock(1),
    );

    expect(result).toEqual({
      action: 'update',
      amount: Quantity.of(3, '個'),
      consumed: true,
      covered: null,
      pantryDeductedAmount: Quantity.of(1, '個'),
    });
  });

  it('増加して pantry が空なら引き算スナップショットを null のままにする', () => {
    const result = reconcileItemDeduction(
      seededItem(),
      aggregatedMap('玉ねぎ', 4),
      pantryWithStock(0),
    );

    expect(result).toEqual({
      action: 'update',
      amount: Quantity.of(4, '個'),
      consumed: false,
      covered: null,
      pantryDeductedAmount: null,
    });
  });

  it('減少後の必要量が sunk 分以下なら pantry を触らず remove する', () => {
    const result = reconcileItemDeduction(
      seededItem({
        requiredAmount: Quantity.of(3, '個'),
        pantryDeductedAmount: Quantity.of(2, '個'),
      }),
      aggregatedMap('玉ねぎ', 2),
      pantryWithStock(0),
    );

    expect(result).toMatchObject({
      action: 'remove',
      consumed: false,
      covered: {
        requiredAmount: Quantity.of(2, '個'),
        coveredAmount: Quantity.of(2, '個'),
      },
    });
  });

  it('減少後も sunk 分だけでは足りず pantry が空なら買う量を更新する', () => {
    const result = reconcileItemDeduction(
      seededItem({
        requiredAmount: Quantity.of(3, '個'),
        pantryDeductedAmount: Quantity.of(2, '個'),
      }),
      aggregatedMap('玉ねぎ', 4),
      pantryWithStock(0),
    );

    expect(result).toEqual({
      action: 'update',
      amount: Quantity.of(2, '個'),
      consumed: false,
      covered: null,
      pantryDeductedAmount: Quantity.of(2, '個'),
    });
  });

  it('減少後も足りない分を pantry から追加控除する', () => {
    const result = reconcileItemDeduction(
      seededItem({
        requiredAmount: Quantity.of(3, '個'),
        pantryDeductedAmount: Quantity.of(2, '個'),
      }),
      aggregatedMap('玉ねぎ', 4),
      pantryWithStock(1),
    );

    expect(result).toEqual({
      action: 'update',
      amount: Quantity.of(1, '個'),
      consumed: true,
      covered: null,
      pantryDeductedAmount: Quantity.of(3, '個'),
    });
  });

  it('productId が null の品目は pantry を消費せず受け取った必要量を更新する', () => {
    const pantry = pantryWithStock(5);
    const result = reconcileItemDeduction(
      seededItem({ productId: null, displayName: '豚肉' }),
      aggregatedMap('豚肉', 4, null),
      pantry,
    );

    expect(result).toEqual({
      action: 'update',
      amount: Quantity.of(4, '個'),
      consumed: false,
      covered: null,
      pantryDeductedAmount: null,
    });
    expect(pantry.stocks[0]?.amount.value).toBe(5);
  });

  it('productId が null で追加必要量がない場合は covered 化せず 0 に更新する', () => {
    const result = reconcileItemDeduction(
      seededItem({
        productId: null,
        displayName: '豚肉',
        requiredAmount: Quantity.of(2, '個'),
      }),
      aggregatedMap('豚肉', 0, null),
      pantryWithStock(0),
    );

    expect(result).toEqual({
      action: 'update',
      amount: Quantity.of(0, '個'),
      consumed: false,
      covered: null,
    });
  });

  it('集計に一致する品目がなくても例外を投げず none を返す', () => {
    const result = reconcileItemDeduction(seededItem(), new Map(), pantryWithStock(0));

    expect(result).toEqual({
      action: 'none',
      consumed: false,
      covered: null,
    });
  });

  it('splitDuplicateItems は同一キーの pending 重複を分離する', () => {
    const result = splitDuplicateItems([
      seededItem({ id: 'item-1' }),
      seededItem({ id: 'item-2' }),
    ]);

    expect(result.uniqueItems.map((item) => item.id.value)).toEqual(['item-1']);
    expect(result.duplicateItems.map((item) => item.id.value)).toEqual(['item-2']);
  });

  it('collectNoteUpdates は集計結果と異なる注記を収集する', () => {
    const item = seededItem({
      productId: null,
      displayName: '小ねぎ',
      requiredAmount: null,
      amountNote: '適量',
    });
    const ingredient = {
      productId: null,
      displayName: '小ねぎ',
      requiredAmount: null,
      amountNote: '少々',
    };

    expect(
      collectNoteUpdates([item], new Map([[ingredientMatchKey(ingredient), ingredient]])),
    ).toEqual([{ item, note: '少々' }]);
  });

  it('rewriteCoveredIngredients は献立に残る既存値と新規値をマージする', () => {
    const previous = [
      {
        displayName: '玉ねぎ',
        productId: ProductId.fromString(PRODUCT_ID),
        requiredAmount: Quantity.of(2, '個'),
        coveredAmount: Quantity.of(2, '個'),
      },
    ];
    const aggregate = resolvedIngredient('玉ねぎ', 4);
    const newlyCovered = [
      {
        displayName: '玉ねぎ',
        productId: ProductId.fromString(PRODUCT_ID),
        requiredAmount: Quantity.of(4, '個'),
        coveredAmount: Quantity.of(4, '個'),
      },
    ];

    expect(
      rewriteCoveredIngredients(
        previous,
        new Map([[ingredientMatchKey(aggregate), aggregate]]),
        newlyCovered,
      ),
    ).toEqual(newlyCovered);
  });
});
