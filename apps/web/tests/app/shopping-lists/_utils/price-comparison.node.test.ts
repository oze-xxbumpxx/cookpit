import type { PriceRecordDto, ProductDto, ShoppingItemDto } from '@cookpit/application';
import { Money, Quantity, UnitPriceCalculator } from '@cookpit/domain';
import { describe, expect, it } from 'vitest';
import { formatYen as productFormatYen } from '../../../../src/app/products/_utils/product-format';
import {
  buildStoreUnitPriceBreakdown,
  estimateItemPriceDiff,
  formatEstimatedDiffMessage,
  formatStoreUnitPriceDiffLabel,
  formatYen,
} from '../../../../src/app/shopping-lists/_utils/price-comparison';

function createPriceRecordDto(overrides: Partial<PriceRecordDto> = {}): PriceRecordDto {
  return {
    id: 'price-record-a',
    storeId: 'store-a',
    storeName: '店舗A',
    priceAmount: 250,
    unitPriceAmount: 50,
    packageSizeValue: 500,
    packageSizeUnit: 'g',
    observedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function createProductDto(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: 'product-a',
    name: '醤油',
    aliases: [],
    category: '調味料',
    defaultUnit: '本',
    priceHistory: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function createShoppingItemDto(overrides: Partial<ShoppingItemDto> = {}): ShoppingItemDto {
  return {
    id: 'item-1',
    productId: 'product-a',
    displayName: '醤油',
    requiredAmount: { value: 1, unit: 'g' },
    amountNote: null,
    targetStoreId: 'store-a',
    status: 'pending',
    actualPrice: null,
    actualStoreId: null,
    source: 'from_meal_plan',
    ...overrides,
  };
}

describe('estimateItemPriceDiff: 単位換算の 4 方向テスト（必須。改変禁止）', () => {
  it('PC-01: 【A】必要量 0.3kg の絶対値検証（weight）', () => {
    const item = createShoppingItemDto({ requiredAmount: { value: 0.3, unit: 'kg' } });
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          priceAmount: 250,
          unitPriceAmount: 50,
          packageSizeValue: 500,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-y',
          storeId: 'store-y',
          storeName: '店舗Y',
          priceAmount: 1200,
          unitPriceAmount: 120,
          packageSizeValue: 1,
          packageSizeUnit: 'kg',
        }),
      ],
    });

    expect(estimateItemPriceDiff(item, product)).toEqual({
      cheapestStoreId: 'store-x',
      cheapestStoreName: '店舗X',
      estimatedDiffYen: 210,
    });
  });

  it('PC-02: 【B】必要量 300g（A と同一実量）の一致性検証', () => {
    const item = createShoppingItemDto({ requiredAmount: { value: 300, unit: 'g' } });
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          priceAmount: 250,
          unitPriceAmount: 50,
          packageSizeValue: 500,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-y',
          storeId: 'store-y',
          storeName: '店舗Y',
          priceAmount: 500,
          unitPriceAmount: 50,
          packageSizeValue: 1,
          packageSizeUnit: 'kg',
        }),
      ],
    });

    expect(estimateItemPriceDiff(item, product)).toBeNull();
  });

  it('PC-03: 【C】必要量 2l の絶対値検証（volume）', () => {
    const item = createShoppingItemDto({ requiredAmount: { value: 2, unit: 'l' } });
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          priceAmount: 100,
          unitPriceAmount: 20,
          packageSizeValue: 500,
          packageSizeUnit: 'ml',
        }),
        createPriceRecordDto({
          id: 'r-y',
          storeId: 'store-y',
          storeName: '店舗Y',
          priceAmount: 800,
          unitPriceAmount: 80,
          packageSizeValue: 1,
          packageSizeUnit: 'l',
        }),
      ],
    });

    expect(estimateItemPriceDiff(item, product)).toEqual({
      cheapestStoreId: 'store-x',
      cheapestStoreName: '店舗X',
      estimatedDiffYen: 1200,
    });
  });

  it('PC-04: 【D】必要量 2000ml（C と同一実量）の一致性検証', () => {
    const item = createShoppingItemDto({ requiredAmount: { value: 2000, unit: 'ml' } });
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          priceAmount: 100,
          unitPriceAmount: 20,
          packageSizeValue: 500,
          packageSizeUnit: 'ml',
        }),
        createPriceRecordDto({
          id: 'r-y',
          storeId: 'store-y',
          storeName: '店舗Y',
          priceAmount: 200,
          unitPriceAmount: 20,
          packageSizeValue: 1,
          packageSizeUnit: 'l',
        }),
      ],
    });

    expect(estimateItemPriceDiff(item, product)).toBeNull();
  });
});

describe('unitBasis の判定基準（UnitPriceCalculator との整合性）', () => {
  it('PC-05: g/kg/ml/l の正準化倍率が UnitPriceCalculator と一致する（値 import で間接検証）', () => {
    const weightX = UnitPriceCalculator.calculate(Money.of(250, 'JPY'), Quantity.of(500, 'g'));
    const weightY = UnitPriceCalculator.calculate(Money.of(1200, 'JPY'), Quantity.of(1, 'kg'));
    const weightItem = createShoppingItemDto({ requiredAmount: { value: 0.3, unit: 'kg' } });
    const weightProduct = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: weightX.amount,
          packageSizeValue: 500,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-y',
          storeId: 'store-y',
          storeName: '店舗Y',
          unitPriceAmount: weightY.amount,
          packageSizeValue: 1,
          packageSizeUnit: 'kg',
        }),
      ],
    });

    expect(estimateItemPriceDiff(weightItem, weightProduct)).toEqual({
      cheapestStoreId: 'store-x',
      cheapestStoreName: '店舗X',
      estimatedDiffYen: 210,
    });

    const volumeX = UnitPriceCalculator.calculate(Money.of(100, 'JPY'), Quantity.of(500, 'ml'));
    const volumeY = UnitPriceCalculator.calculate(Money.of(800, 'JPY'), Quantity.of(1, 'l'));
    const volumeItem = createShoppingItemDto({ requiredAmount: { value: 2, unit: 'l' } });
    const volumeProduct = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: volumeX.amount,
          packageSizeValue: 500,
          packageSizeUnit: 'ml',
        }),
        createPriceRecordDto({
          id: 'r-y',
          storeId: 'store-y',
          storeName: '店舗Y',
          unitPriceAmount: volumeY.amount,
          packageSizeValue: 1,
          packageSizeUnit: 'l',
        }),
      ],
    });

    expect(estimateItemPriceDiff(volumeItem, volumeProduct)).toEqual({
      cheapestStoreId: 'store-x',
      cheapestStoreName: '店舗X',
      estimatedDiffYen: 1200,
    });
  });

  it('PC-06: 大文字 KG 等の表記ゆれ単位は厳密一致せず候補から除外される（正規化なしの確認）', () => {
    const item = createShoppingItemDto({ requiredAmount: { value: 1, unit: 'kg' } });

    const withUppercase = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: 50,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-z',
          storeId: 'store-z',
          storeName: '店舗Z',
          unitPriceAmount: 80,
          packageSizeUnit: 'KG',
        }),
      ],
    });
    expect(estimateItemPriceDiff(item, withUppercase)).toBeNull();
    expect(buildStoreUnitPriceBreakdown(withUppercase)).toBeNull();

    const withLowercase = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: 50,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-z',
          storeId: 'store-z',
          storeName: '店舗Z',
          unitPriceAmount: 80,
          packageSizeUnit: 'kg',
        }),
      ],
    });
    expect(estimateItemPriceDiff(item, withLowercase)).not.toBeNull();
    expect(buildStoreUnitPriceBreakdown(withLowercase)).not.toBeNull();
  });
});

describe('候補の絞り込み条件', () => {
  it('PC-07: kind==="other" の総額差候補は packageSizeUnit の完全一致も要求する', () => {
    const item = createShoppingItemDto({ requiredAmount: { value: 1, unit: '袋' } });
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: 100,
          packageSizeUnit: '袋',
        }),
        createPriceRecordDto({
          id: 'r-y',
          storeId: 'store-y',
          storeName: '店舗Y',
          unitPriceAmount: 150,
          packageSizeUnit: 'パック',
        }),
      ],
    });

    expect(estimateItemPriceDiff(item, product)).toBeNull();
  });

  it('PC-08: targetStoreId（推奨店舗）に依存せず最安店舗を独立して算出する（P-2）', () => {
    const item = createShoppingItemDto({
      requiredAmount: { value: 100, unit: 'g' },
      targetStoreId: 'store-y',
    });
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: 50,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-y',
          storeId: 'store-y',
          storeName: '店舗Y',
          unitPriceAmount: 80,
          packageSizeUnit: 'g',
        }),
      ],
    });

    expect(estimateItemPriceDiff(item, product)?.cheapestStoreId).toBe('store-x');
  });

  it('PC-09: 2 番目に安い店舗との差（3 件以上の候補、1 位と 2 位のみを比較）', () => {
    const item = createShoppingItemDto({ requiredAmount: { value: 100, unit: 'g' } });
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: 100,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-y',
          storeId: 'store-y',
          storeName: '店舗Y',
          unitPriceAmount: 150,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-z',
          storeId: 'store-z',
          storeName: '店舗Z',
          unitPriceAmount: 300,
          packageSizeUnit: 'g',
        }),
      ],
    });

    expect(estimateItemPriceDiff(item, product)?.estimatedDiffYen).toBe(50);
  });
});

describe('フォーマット関数', () => {
  it('PC-10: formatYen の出力フォーマット（カンマ区切り）', () => {
    expect(formatYen(12345)).toBe('12,345円');
  });

  it('PC-11: formatYen が products 側 formatYen と同一出力（複製の乖離防止）', () => {
    for (const amount of [0, 1, 198, 12345, 1000000]) {
      expect(formatYen(amount)).toBe(productFormatYen(amount));
    }
  });

  it('PC-12: formatEstimatedDiffMessage の出力テンプレート', () => {
    expect(
      formatEstimatedDiffMessage({
        cheapestStoreId: 'store-x',
        cheapestStoreName: 'イオン',
        estimatedDiffYen: 210,
      }),
    ).toBe('イオンの方が約210円安い');
  });
});

describe('縮退ケース一覧（設計書 1〜9 の全件対応）', () => {
  it('PC-13: productId が null → 総額差なし', () => {
    const item = createShoppingItemDto({ productId: null });
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({ id: 'r-a', storeId: 'store-a', unitPriceAmount: 50 }),
        createPriceRecordDto({
          id: 'r-b',
          storeId: 'store-b',
          storeName: '店舗B',
          unitPriceAmount: 80,
        }),
      ],
    });

    expect(estimateItemPriceDiff(item, product)).toBeNull();
  });

  it('PC-14: productId が null → 内訳なし（呼び出し側は product=undefined を渡す）', () => {
    expect(buildStoreUnitPriceBreakdown(undefined)).toBeNull();
  });

  it('PC-15: 商品削除済み（productMap に存在しない）→ 両方なし（データ不整合の防御）', () => {
    const item = createShoppingItemDto({ productId: 'deleted-product-id' });

    expect(() => estimateItemPriceDiff(item, undefined)).not.toThrow();
    expect(estimateItemPriceDiff(item, undefined)).toBeNull();
    expect(buildStoreUnitPriceBreakdown(undefined)).toBeNull();
  });

  it('PC-16: priceHistory が 0 件 → 両方なし', () => {
    const item = createShoppingItemDto();
    const product = createProductDto({ priceHistory: [] });

    expect(estimateItemPriceDiff(item, product)).toBeNull();
    expect(buildStoreUnitPriceBreakdown(product)).toBeNull();
  });

  it('PC-17: 換算可能な店舗が 1 件以下 → 両方なし', () => {
    const item = createShoppingItemDto({ requiredAmount: { value: 100, unit: 'g' } });
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-a',
          storeId: 'store-a',
          unitPriceAmount: 50,
          packageSizeUnit: 'g',
        }),
      ],
    });

    expect(estimateItemPriceDiff(item, product)).toBeNull();
    expect(buildStoreUnitPriceBreakdown(product)).toBeNull();
  });

  it('PC-18: requiredAmount が null（amountNote 品目）→ 総額差なし・内訳はあり', () => {
    const item = createShoppingItemDto({ requiredAmount: null, amountNote: '適量' });
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-a',
          storeId: 'store-a',
          storeName: '店舗A',
          unitPriceAmount: 50,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-b',
          storeId: 'store-b',
          storeName: '店舗B',
          unitPriceAmount: 80,
          packageSizeUnit: 'g',
        }),
      ],
    });

    expect(estimateItemPriceDiff(item, product)).toBeNull();
    expect(buildStoreUnitPriceBreakdown(product)).not.toBeNull();
  });

  it('PC-19: 単位区分が不一致で候補 2 件未満に絞られる → 両方なし', () => {
    const item = createShoppingItemDto({ requiredAmount: { value: 1, unit: 'kg' } });
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-a',
          storeId: 'store-a',
          storeName: '店舗A',
          unitPriceAmount: 50,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-b',
          storeId: 'store-b',
          storeName: '店舗B',
          unitPriceAmount: 50,
          packageSizeUnit: 'ml',
        }),
      ],
    });

    expect(estimateItemPriceDiff(item, product)).toBeNull();
    expect(buildStoreUnitPriceBreakdown(product)).toBeNull();
  });

  it('PC-20: storeName === "" の記録は候補・内訳から除外される（異常・データ不整合の防御）', () => {
    const item = createShoppingItemDto({ requiredAmount: { value: 100, unit: 'g' } });
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: 50,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-y',
          storeId: 'store-y',
          storeName: '店舗Y',
          unitPriceAmount: 80,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-deleted',
          storeId: 'store-deleted',
          storeName: '',
          unitPriceAmount: 10,
          packageSizeUnit: 'g',
        }),
      ],
    });

    const diff = estimateItemPriceDiff(item, product);
    expect(diff?.cheapestStoreId).toBe('store-x');
    expect(diff?.estimatedDiffYen).toBe(30);

    const breakdown = buildStoreUnitPriceBreakdown(product);
    expect(breakdown?.entries).toHaveLength(2);
    expect(breakdown?.entries.some((entry) => entry.storeId === 'store-deleted')).toBe(false);
  });

  it('PC-20b: 全記録の storeName === "" → 例外を投げず双方 null（M-1 回帰）', () => {
    const item = createShoppingItemDto({ requiredAmount: { value: 100, unit: 'g' } });
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-deleted-1',
          storeId: 'store-deleted-1',
          storeName: '',
          unitPriceAmount: 10,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-deleted-2',
          storeId: 'store-deleted-2',
          storeName: '',
          unitPriceAmount: 20,
          packageSizeUnit: 'g',
        }),
      ],
    });

    expect(() => buildStoreUnitPriceBreakdown(product)).not.toThrow();
    expect(buildStoreUnitPriceBreakdown(product)).toBeNull();
    expect(estimateItemPriceDiff(item, product)).toBeNull();
  });

  it('PC-20c: 有効な記録が 1 店舗だけ残る → 内訳は null（M-1 の境界）', () => {
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: 50,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-deleted',
          storeId: 'store-deleted',
          storeName: '',
          unitPriceAmount: 10,
          packageSizeUnit: 'g',
        }),
      ],
    });

    expect(buildStoreUnitPriceBreakdown(product)).toBeNull();
  });

  it('PC-21: 総額差 1 位・2 位が同額 → 非表示（3 位との比較はしない）', () => {
    const item = createShoppingItemDto({ requiredAmount: { value: 100, unit: 'g' } });
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: 100,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-y',
          storeId: 'store-y',
          storeName: '店舗Y',
          unitPriceAmount: 100,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-z',
          storeId: 'store-z',
          storeName: '店舗Z',
          unitPriceAmount: 300,
          packageSizeUnit: 'g',
        }),
      ],
    });

    expect(estimateItemPriceDiff(item, product)).toBeNull();
  });

  it('PC-22: 内訳の全店舗が同額 → 全行「← 最安」相当（isCheapest: true）', () => {
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: 50,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-y',
          storeId: 'store-y',
          storeName: '店舗Y',
          unitPriceAmount: 50,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-z',
          storeId: 'store-z',
          storeName: '店舗Z',
          unitPriceAmount: 50,
          packageSizeUnit: 'g',
        }),
      ],
    });

    const breakdown = buildStoreUnitPriceBreakdown(product);
    expect(
      breakdown?.entries.every((entry) => entry.isCheapest && entry.diffFromCheapestYen === 0),
    ).toBe(true);
  });
});

describe('buildStoreUnitPriceBreakdown 固有の順序・基準ロジック', () => {
  it('PC-23: 店舗ごとに直近（observedAt 最大）の記録 1 件のみを候補にする', () => {
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'old',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: 200,
          packageSizeUnit: 'g',
          observedAt: '2026-01-01T00:00:00.000Z',
        }),
        createPriceRecordDto({
          id: 'new',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: 50,
          packageSizeUnit: 'g',
          observedAt: '2026-06-01T00:00:00.000Z',
        }),
        createPriceRecordDto({
          id: 'store-y-record',
          storeId: 'store-y',
          storeName: '店舗Y',
          unitPriceAmount: 80,
          packageSizeUnit: 'g',
          observedAt: '2026-03-01T00:00:00.000Z',
        }),
      ],
    });

    const breakdown = buildStoreUnitPriceBreakdown(product);
    const storeXEntry = breakdown?.entries.find((entry) => entry.storeId === 'store-x');
    expect(storeXEntry?.unitPriceAmount).toBe(50);
  });

  it('PC-24: 同一店舗・同一 observedAt の重複は配列走査順で後に見つかった方を採用', () => {
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'first',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: 60,
          packageSizeUnit: 'g',
          observedAt: '2026-06-01T00:00:00.000Z',
        }),
        createPriceRecordDto({
          id: 'second',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: 90,
          packageSizeUnit: 'g',
          observedAt: '2026-06-01T00:00:00.000Z',
        }),
        createPriceRecordDto({
          id: 'store-y-record',
          storeId: 'store-y',
          storeName: '店舗Y',
          unitPriceAmount: 80,
          packageSizeUnit: 'g',
          observedAt: '2026-06-01T00:00:00.000Z',
        }),
      ],
    });

    const breakdown = buildStoreUnitPriceBreakdown(product);
    const storeXEntry = breakdown?.entries.find((entry) => entry.storeId === 'store-x');
    expect(storeXEntry?.unitPriceAmount).toBe(90);
  });

  it('PC-25: entries は unitPriceAmount 昇順、diffFromCheapestYen は Math.round(unitPriceAmount - 最安値)', () => {
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-a',
          storeId: 'store-a',
          storeName: '店舗A',
          unitPriceAmount: 50.3,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-b',
          storeId: 'store-b',
          storeName: '店舗B',
          unitPriceAmount: 62.1,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-c',
          storeId: 'store-c',
          storeName: '店舗C',
          unitPriceAmount: 70.9,
          packageSizeUnit: 'g',
        }),
      ],
    });

    const breakdown = buildStoreUnitPriceBreakdown(product);
    expect(breakdown?.entries.map((entry) => entry.storeId)).toEqual([
      'store-a',
      'store-b',
      'store-c',
    ]);
    expect(breakdown?.entries[0].diffFromCheapestYen).toBe(0);
    expect(breakdown?.entries[1].diffFromCheapestYen).toBe(12);
    expect(breakdown?.entries[2].diffFromCheapestYen).toBe(21);
  });

  it('PC-26: basisLabel は基準区分の kind に基づく', () => {
    const weightProduct = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-a',
          storeId: 'store-a',
          storeName: '店舗A',
          unitPriceAmount: 50,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-b',
          storeId: 'store-b',
          storeName: '店舗B',
          unitPriceAmount: 80,
          packageSizeUnit: 'g',
        }),
      ],
    });
    expect(buildStoreUnitPriceBreakdown(weightProduct)?.basisLabel).toBe('100g');

    const volumeProduct = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-a',
          storeId: 'store-a',
          storeName: '店舗A',
          unitPriceAmount: 20,
          packageSizeUnit: 'ml',
        }),
        createPriceRecordDto({
          id: 'r-b',
          storeId: 'store-b',
          storeName: '店舗B',
          unitPriceAmount: 30,
          packageSizeUnit: 'ml',
        }),
      ],
    });
    expect(buildStoreUnitPriceBreakdown(volumeProduct)?.basisLabel).toBe('100ml');

    const otherProduct = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-a',
          storeId: 'store-a',
          storeName: '店舗A',
          unitPriceAmount: 100,
          packageSizeUnit: '個',
        }),
        createPriceRecordDto({
          id: 'r-b',
          storeId: 'store-b',
          storeName: '店舗B',
          unitPriceAmount: 120,
          packageSizeUnit: '個',
        }),
      ],
    });
    expect(buildStoreUnitPriceBreakdown(otherProduct)?.basisLabel).toBe('1個');
  });

  it('PC-27: kind==="other" の内訳比較は packageSizeUnit の完全一致を要求しない（PC-07 との対比）', () => {
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: 100,
          packageSizeUnit: '袋',
        }),
        createPriceRecordDto({
          id: 'r-y',
          storeId: 'store-y',
          storeName: '店舗Y',
          unitPriceAmount: 150,
          packageSizeUnit: 'パック',
        }),
      ],
    });

    const breakdown = buildStoreUnitPriceBreakdown(product);
    expect(breakdown).not.toBeNull();
    expect(breakdown?.entries.map((entry) => entry.storeId).sort()).toEqual(['store-x', 'store-y']);
  });

  it('PC-28: 店舗上限ちょうど 3 件のとき entries が 3 件返る（境界値）', () => {
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-a',
          storeId: 'store-a',
          storeName: '店舗A',
          unitPriceAmount: 50,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-b',
          storeId: 'store-b',
          storeName: '店舗B',
          unitPriceAmount: 60,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-c',
          storeId: 'store-c',
          storeName: '店舗C',
          unitPriceAmount: 70,
          packageSizeUnit: 'g',
        }),
      ],
    });

    expect(buildStoreUnitPriceBreakdown(product)?.entries).toHaveLength(3);
  });
});

describe('防御性', () => {
  it('PC-29: 呼び出し後も product.priceHistory の順序・内容が変わらない', () => {
    const priceHistory = [
      createPriceRecordDto({
        id: 'r-c',
        storeId: 'store-c',
        storeName: '店舗C',
        unitPriceAmount: 90,
        packageSizeUnit: 'g',
      }),
      createPriceRecordDto({
        id: 'r-a',
        storeId: 'store-a',
        storeName: '店舗A',
        unitPriceAmount: 50,
        packageSizeUnit: 'g',
      }),
      createPriceRecordDto({
        id: 'r-b',
        storeId: 'store-b',
        storeName: '店舗B',
        unitPriceAmount: 70,
        packageSizeUnit: 'g',
      }),
    ];
    const product = createProductDto({ priceHistory });
    const item = createShoppingItemDto({ requiredAmount: { value: 100, unit: 'g' } });
    const before = priceHistory.map((record) => ({ ...record }));

    estimateItemPriceDiff(item, product);
    buildStoreUnitPriceBreakdown(product);

    expect(product.priceHistory).toEqual(before);
    expect(product.priceHistory.map((record) => record.id)).toEqual(['r-c', 'r-a', 'r-b']);
  });

  it('PC-30: product=undefined を渡しても例外を投げない', () => {
    const item = createShoppingItemDto();

    expect(() => estimateItemPriceDiff(item, undefined)).not.toThrow();
    expect(() => buildStoreUnitPriceBreakdown(undefined)).not.toThrow();
    expect(estimateItemPriceDiff(item, undefined)).toBeNull();
    expect(buildStoreUnitPriceBreakdown(undefined)).toBeNull();
  });

  it('PC-31: 境界値: Math.round の端数丸め（x.5 境界）', () => {
    const item = createShoppingItemDto({ requiredAmount: { value: 100, unit: 'g' } });
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: 100,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-y',
          storeId: 'store-y',
          storeName: '店舗Y',
          unitPriceAmount: 249.5,
          packageSizeUnit: 'g',
        }),
      ],
    });

    expect(estimateItemPriceDiff(item, product)?.estimatedDiffYen).toBe(150);
  });

  it('PC-32: 基準区分は最頻の kind（少数派の raw 最小単価に引きずられない・S-3）', () => {
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-a',
          storeId: 'store-a',
          storeName: '店舗A',
          unitPriceAmount: 200,
          packageSizeUnit: '1L',
        }),
        createPriceRecordDto({
          id: 'r-b',
          storeId: 'store-b',
          storeName: '店舗B',
          unitPriceAmount: 150,
          packageSizeUnit: '1L',
        }),
        // 次元の違う volume の単価 18 が raw 最小だが、少数派なので基準にはならない
        createPriceRecordDto({
          id: 'r-c',
          storeId: 'store-c',
          storeName: '店舗C',
          unitPriceAmount: 18,
          packageSizeUnit: 'ml',
        }),
      ],
    });

    const breakdown = buildStoreUnitPriceBreakdown(product);
    expect(breakdown?.basisLabel).toBe('11L');
    expect(breakdown?.entries.map((entry) => entry.storeId)).toEqual(['store-b', 'store-a']);
  });

  it('PC-33: 基準区分が同数のときは weight → volume → other の固定順（S-3 の tie-break）', () => {
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-a',
          storeId: 'store-a',
          storeName: '店舗A',
          unitPriceAmount: 10,
          packageSizeUnit: 'ml',
        }),
        createPriceRecordDto({
          id: 'r-b',
          storeId: 'store-b',
          storeName: '店舗B',
          unitPriceAmount: 20,
          packageSizeUnit: 'ml',
        }),
        createPriceRecordDto({
          id: 'r-c',
          storeId: 'store-c',
          storeName: '店舗C',
          unitPriceAmount: 30,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-d',
          storeId: 'store-d',
          storeName: '店舗D',
          unitPriceAmount: 40,
          packageSizeUnit: 'g',
        }),
      ],
    });

    expect(buildStoreUnitPriceBreakdown(product)?.basisLabel).toBe('100g');
  });

  it('PC-34: 非最安でも丸め後の差が 0 なら「ほぼ同額」（S-1）', () => {
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-x',
          storeId: 'store-x',
          storeName: '店舗X',
          unitPriceAmount: 100,
          packageSizeUnit: 'g',
        }),
        createPriceRecordDto({
          id: 'r-y',
          storeId: 'store-y',
          storeName: '店舗Y',
          unitPriceAmount: 100.4,
          packageSizeUnit: 'g',
        }),
      ],
    });

    const entries = buildStoreUnitPriceBreakdown(product)?.entries ?? [];
    expect(entries[1].isCheapest).toBe(false);
    expect(entries[1].diffFromCheapestYen).toBe(0);
    expect(formatStoreUnitPriceDiffLabel(entries[0])).toBe('← 最安');
    expect(formatStoreUnitPriceDiffLabel(entries[1])).toBe('ほぼ同額');
  });

  it('PC-35: formatStoreUnitPriceDiffLabel は差がある行を +N円 で返す', () => {
    expect(
      formatStoreUnitPriceDiffLabel({
        storeId: 'store-y',
        storeName: '店舗Y',
        unitPriceAmount: 130,
        isCheapest: false,
        diffFromCheapestYen: 30,
      }),
    ).toBe('+30円');
  });
});

describe('編集シナリオ（price-record-edit-and-store-rename）', () => {
  it('PC-EDIT-01: 編集で同一店舗の記録が複数になっても最新 1 件に絞られる', () => {
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-a',
          storeId: 'store-a',
          storeName: '店舗A',
          unitPriceAmount: 100,
          observedAt: '2026-06-01T00:00:00.000Z',
        }),
        // 編集で storeId が store-a に変わった元 store-b の記録（observedAt はより新しい）
        createPriceRecordDto({
          id: 'r-b',
          storeId: 'store-a',
          storeName: '店舗A',
          unitPriceAmount: 80,
          observedAt: '2026-06-02T00:00:00.000Z',
        }),
        createPriceRecordDto({
          id: 'r-c',
          storeId: 'store-c',
          storeName: '店舗C',
          unitPriceAmount: 90,
          observedAt: '2026-06-01T00:00:00.000Z',
        }),
      ],
    });

    const breakdown = buildStoreUnitPriceBreakdown(product);

    const storeAEntries = breakdown?.entries.filter((e) => e.storeId === 'store-a') ?? [];
    expect(storeAEntries).toHaveLength(1);
    expect(storeAEntries[0]?.unitPriceAmount).toBe(80);
  });

  it('PC-EDIT-02: 編集で店舗の記録が無くなると候補から自然に除外される', () => {
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-b',
          storeId: 'store-b',
          storeName: '店舗B',
          unitPriceAmount: 80,
        }),
        createPriceRecordDto({
          id: 'r-c',
          storeId: 'store-c',
          storeName: '店舗C',
          unitPriceAmount: 90,
        }),
      ],
    });

    const breakdown = buildStoreUnitPriceBreakdown(product);

    expect(breakdown?.entries.some((e) => e.storeId === 'store-a')).toBe(false);
  });
});
