import { PriceRecord, PriceRecordId, ProductId, UnitPriceCalculator } from '@cookpit/domain';
import type { ProductRepository, ShoppingItem } from '@cookpit/domain';

export async function recordPrices(
  boughtItems: ShoppingItem[],
  productRepository: ProductRepository,
  now: Date,
): Promise<void> {
  const groups = new Map<string, ShoppingItem[]>();
  for (const item of boughtItems) {
    if (item.productId === null) {
      continue;
    }
    const key = item.productId.value;
    const existing = groups.get(key) ?? [];
    existing.push(item);
    groups.set(key, existing);
  }

  // product の取得（読み取り）は N+1 を避けて並列化する。保存は group 順に逐次実行し、
  // 保存順序を決定的に保つ（複数 product でも並列書き込みにしない）。
  const groupEntries = [...groups];
  const products = await Promise.all(
    groupEntries.map(([productIdValue]) =>
      productRepository.findById(ProductId.fromString(productIdValue)),
    ),
  );

  for (const [index, [, items]] of groupEntries.entries()) {
    const product = products[index] ?? null;
    if (product === null) {
      continue;
    }
    let changed = false;
    for (const item of items) {
      // 価格レコード ID を品目 ID から決定的に導出し、既に記録済みならスキップする。
      // reopen→再 complete での二重記録を防ぐ（品目単位の冪等化）。
      const priceRecordId = PriceRecordId.fromString(item.id.value);
      if (product.priceHistory.some((record) => record.id.equals(priceRecordId))) {
        continue;
      }
      const record = buildPriceRecord(item, priceRecordId, now);
      if (record !== null) {
        product.recordPrice(record);
        changed = true;
      }
    }
    if (changed) {
      await productRepository.save(product);
    }
  }
}

function buildPriceRecord(
  item: ShoppingItem,
  priceRecordId: PriceRecordId,
  now: Date,
): PriceRecord | null {
  const actualPrice = item.actualPrice;
  const actualStore = item.actualStore;
  if (actualPrice === null || actualStore === null) {
    return null;
  }
  if (actualPrice.amount <= 0) {
    return null;
  }
  if (item.requiredAmount === null || item.requiredAmount.value <= 0) {
    return null;
  }

  const packageSize = item.requiredAmount;
  const unitPrice = UnitPriceCalculator.calculate(actualPrice, packageSize);
  if (unitPrice.amount <= 0) {
    return null;
  }

  return PriceRecord.create({
    id: priceRecordId,
    storeId: actualStore,
    price: actualPrice,
    unitPrice,
    packageSize,
    observedAt: now,
  });
}
