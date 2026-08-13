import {
  PriceRecord,
  PriceRecordId,
  ProductId,
  Quantity,
  ShoppingItemId,
  ShoppingListId,
  UnitPriceCalculator,
} from '@cookpit/domain';
import type {
  UnitOfWork,
  CreateStockInput,
  MealPlanId,
  MealPlanRepository,
  Pantry,
  PantryRepository,
  ProductRepository,
  ShoppingItem,
  ShoppingList,
  ShoppingListRepository,
} from '@cookpit/domain';
import { InvalidStockOperationError } from '../pantry/invalid-stock-operation.error';
import { requireItem } from './load-shopping-list';
import type {
  CompleteShoppingInputDto,
  ShoppingListDto,
  StockAdditionInputDto,
} from './shopping-list.dto';
import { toShoppingListDto } from './shopping-list.mapper';
import { ShoppingListNotFoundError } from './shopping-list-not-found.error';

/** 検証済みの在庫追加指定と、その対象となる買い物品目の組。 */
interface ResolvedStockAddition {
  item: ShoppingItem;
  addition: StockAdditionInputDto;
}

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
        await this.repairMealPlanTransition(shoppingList.mealPlanId);
        return toShoppingListDto(shoppingList);
      }

      const boughtItems = shoppingList.items.filter((item) => item.isBought());
      const now = new Date();

      // 検証は書き込みより前にまとめて行い、不正な指定が 1 件でもあれば何も保存しないようにする。
      const resolved = this.resolveStockAdditions(shoppingList, input.stockAdditions);
      await this.addStocks(resolved, now);

      await this.recordPrices(boughtItems, now);

      shoppingList.complete();
      await this.shoppingListRepository.save(shoppingList);

      await this.repairMealPlanTransition(shoppingList.mealPlanId);

      return toShoppingListDto(shoppingList);
    });
  }

  private resolveStockAdditions(
    shoppingList: ShoppingList,
    additions: StockAdditionInputDto[],
  ): ResolvedStockAddition[] {
    const resolved: ResolvedStockAddition[] = [];
    const seen = new Set<string>();

    for (const addition of additions) {
      // 同一品目の重複指定は先勝ちで 1 件だけ採用する。UI からは作れないが、DB の
      // source_shopping_item_id UNIQUE に当てて 500 にするより穏当（D-4）。
      if (seen.has(addition.itemId)) {
        continue;
      }
      seen.add(addition.itemId);

      const item = requireItem(
        shoppingList,
        ShoppingItemId.fromString(addition.itemId),
        addition.itemId,
      );
      if (!item.isBought()) {
        throw new InvalidStockOperationError(
          `ShoppingItem ${addition.itemId} is not bought, cannot add to pantry`,
        );
      }
      resolved.push({ item, addition });
    }

    return resolved;
  }

  private async addStocks(resolved: ResolvedStockAddition[], now: Date): Promise<void> {
    if (resolved.length === 0) {
      return;
    }

    const pantry = await this.pantryRepository.find();
    let changed = false;
    for (const { item, addition } of resolved) {
      // 前回の完了で在庫化済みの品目はスキップする。reopen→再完了での二重在庫を防ぐ
      // （Application 側の事前スキップ。DB の source_shopping_item_id UNIQUE が二段目）。
      if (pantry.hasStockFromShoppingItem(item.id)) {
        continue;
      }
      this.addStock(pantry, item, addition, now);
      changed = true;
    }

    if (changed) {
      await this.pantryRepository.save(pantry);
    }
  }

  private addStock(
    pantry: Pantry,
    item: ShoppingItem,
    addition: StockAdditionInputDto,
    now: Date,
  ): void {
    const stockInput: CreateStockInput = {
      productId: item.productId,
      displayName: item.displayName,
      amount: Quantity.of(addition.amount.value, addition.amount.unit),
      purchasedAt: now,
      // ローカル 0 時で構築し、mapper の toLocalDateString と往復整合させる（AddStockUseCase と同じ）。
      expiresAt: addition.expiresAt === null ? null : new Date(`${addition.expiresAt}T00:00:00`),
      storedLocation: addition.storedLocation,
      sourceShoppingItemId: item.id,
    };

    try {
      pantry.addStock(stockInput);
    } catch (error) {
      throw new InvalidStockOperationError(
        error instanceof Error ? error.message : 'Failed to add stock',
      );
    }
  }

  private async recordPrices(boughtItems: ShoppingItem[], now: Date): Promise<void> {
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
        this.productRepository.findById(ProductId.fromString(productIdValue)),
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
        const record = this.buildPriceRecord(item, priceRecordId, now);
        if (record !== null) {
          product.recordPrice(record);
          changed = true;
        }
      }
      if (changed) {
        await this.productRepository.save(product);
      }
    }
  }

  private buildPriceRecord(
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

  private async repairMealPlanTransition(mealPlanId: MealPlanId): Promise<void> {
    const mealPlan = await this.mealPlanRepository.findById(mealPlanId);
    if (mealPlan === null) {
      return;
    }
    if (mealPlan.status === 'draft') {
      mealPlan.transitionTo('shopping');
      mealPlan.transitionTo('cooking');
      await this.mealPlanRepository.save(mealPlan);
      return;
    }
    if (mealPlan.status === 'shopping') {
      mealPlan.transitionTo('cooking');
      await this.mealPlanRepository.save(mealPlan);
    }
  }
}
