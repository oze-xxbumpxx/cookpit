import { beforeEach, describe, expect, it } from 'vitest';
import {
  Money,
  normalizeStoreName,
  PriceRecord,
  PriceRecordId,
  Product,
  ProductId,
  Quantity,
  Store,
  StoreId,
} from '@cookpit/domain';
import type { ProductRepository, StoreRepository } from '@cookpit/domain';
import { CreateProductUseCase } from '../../src/product/create-product.use-case';
import { DeletePriceRecordUseCase } from '../../src/product/delete-price-record.use-case';
import { DeleteProductUseCase } from '../../src/product/delete-product.use-case';
import { InvalidOperationError } from '../../src/shared/errors';
import { PriceRecordNotFoundError } from '../../src/product/price-record-not-found.error';
import { GetCheapestStoreUseCase } from '../../src/product/get-cheapest-store.use-case';
import { GetProductUseCase } from '../../src/product/get-product.use-case';
import { GetProductsUseCase } from '../../src/product/get-products.use-case';
import { ProductNotFoundError } from '../../src/product/product-not-found.error';
import { RecordPriceUseCase } from '../../src/product/record-price.use-case';
import { UpdatePriceRecordUseCase } from '../../src/product/update-price-record.use-case';
import { StoreNotFoundError } from '../../src/store/store-not-found.error';
import { UpdateProductUseCase } from '../../src/product/update-product.use-case';
import type {
  CreateProductInputDto,
  RecordPriceInputDto,
  UpdatePriceRecordInputDto,
  UpdateProductInputDto,
} from '../../src/product/product.dto';

// UseCase の検証は外部 I/O を持たないインメモリ Repository で行う（DB 不要）。
// 保存・削除の副作用も観測できるようにする。
class InMemoryProductRepository implements ProductRepository {
  private readonly map = new Map<string, Product>();
  public saveCount = 0;
  public deletedIds: string[] = [];

  async findById(id: ProductId): Promise<Product | null> {
    return this.map.get(id.value) ?? null;
  }

  async findAll(): Promise<Product[]> {
    return [...this.map.values()];
  }

  async save(product: Product): Promise<void> {
    this.saveCount += 1;
    this.map.set(product.id.value, product);
  }

  async delete(id: ProductId): Promise<void> {
    this.deletedIds.push(id.value);
    this.map.delete(id.value);
  }

  async countPriceRecordsByStore(storeId: StoreId): Promise<number> {
    return [...this.map.values()].reduce(
      (total, product) =>
        total + product.priceHistory.filter((record) => record.storeId.equals(storeId)).length,
      0,
    );
  }

  async deletePriceRecordsByStore(storeId: StoreId): Promise<void> {
    for (const product of this.map.values()) {
      for (const record of product.priceHistory) {
        if (record.storeId.equals(storeId)) {
          product.removePriceRecord(record.id);
        }
      }
    }
  }

  seed(product: Product): void {
    this.map.set(product.id.value, product);
  }

  get size(): number {
    return this.map.size;
  }
}

class InMemoryStoreRepository implements StoreRepository {
  private readonly map = new Map<string, Store>();
  public saveCount = 0;

  async findById(id: StoreId): Promise<Store | null> {
    return this.map.get(id.value) ?? null;
  }

  async findAll(): Promise<Store[]> {
    return [...this.map.values()];
  }

  async findByNormalizedName(normalizedName: string): Promise<Store | null> {
    return (
      [...this.map.values()].find((store) => normalizeStoreName(store.name) === normalizedName) ??
      null
    );
  }

  async save(store: Store): Promise<void> {
    this.saveCount += 1;
    this.map.set(store.id.value, store);
  }

  async delete(id: StoreId): Promise<void> {
    this.map.delete(id.value);
  }

  seed(store: Store): void {
    this.map.set(store.id.value, store);
  }
}

function seededStore(id: string, name: string): Store {
  return Store.reconstruct({
    id: StoreId.fromString(id),
    name,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

function seededProduct(id: string, name = '玉ねぎ', priceHistory: PriceRecord[] = []): Product {
  return Product.reconstruct({
    id: ProductId.fromString(id),
    name,
    aliases: ['タマネギ'],
    category: '野菜',
    defaultUnit: '個',
    priceHistory,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

function seededPriceRecord(
  id: string,
  storeId: StoreId,
  priceAmount: number,
  unitPriceAmount: number,
  observedAt: Date,
): PriceRecord {
  return PriceRecord.create({
    id: PriceRecordId.fromString(id),
    storeId,
    price: Money.of(priceAmount, 'JPY'),
    unitPrice: Money.of(unitPriceAmount, 'JPY'),
    packageSize: Quantity.of(3, '個'),
    observedAt,
  });
}

let productRepository: InMemoryProductRepository;
let storeRepository: InMemoryStoreRepository;

beforeEach(() => {
  productRepository = new InMemoryProductRepository();
  storeRepository = new InMemoryStoreRepository();
});

describe('CreateProductUseCase', () => {
  const baseInput: CreateProductInputDto = {
    name: '玉ねぎ',
    aliases: [' 玉葱 ', '', 'タマネギ'],
    category: '野菜',
    defaultUnit: '個',
  };

  it('商品を保存し、入力どおりの DTO を返す', async () => {
    const dto = await new CreateProductUseCase(productRepository).execute(baseInput);

    expect(productRepository.saveCount).toBe(1);
    expect(productRepository.size).toBe(1);
    expect(dto.id).not.toBe('');
    expect(dto.name).toBe('玉ねぎ');
    expect(dto.aliases).toEqual(['玉葱', 'タマネギ']);
    expect(dto.category).toBe('野菜');
    expect(dto.defaultUnit).toBe('個');
    expect(dto.priceHistory).toEqual([]);
  });

  it('空白のみの name はドメインバリデーションで弾かれ、保存されない', async () => {
    await expect(
      new CreateProductUseCase(productRepository).execute({ ...baseInput, name: '  ' }),
    ).rejects.toThrow('Product name is required');
    expect(productRepository.saveCount).toBe(0);
  });

  it('aliases はトリムし、空文字を除去する', async () => {
    const dto = await new CreateProductUseCase(productRepository).execute({
      ...baseInput,
      aliases: [' にんじん ', '  ', '人参'],
    });

    expect(dto.aliases).toEqual(['にんじん', '人参']);
  });
});

describe('GetProductsUseCase', () => {
  it('0件の場合は空配列を返す', async () => {
    const dtos = await new GetProductsUseCase(productRepository, storeRepository).execute();

    expect(dtos).toEqual([]);
  });

  it('複数件の場合は全件を ProductDto[] で返す', async () => {
    productRepository.seed(seededProduct('product-1', '玉ねぎ'));
    productRepository.seed(seededProduct('product-2', 'にんじん'));

    const dtos = await new GetProductsUseCase(productRepository, storeRepository).execute();

    expect(dtos).toHaveLength(2);
    expect(dtos.map((dto) => dto.name).sort()).toEqual(['にんじん', '玉ねぎ']);
  });
});

describe('GetProductUseCase', () => {
  it('存在する商品を Store 名つきの DTO で返す', async () => {
    const storeId = StoreId.fromString('store-1');
    storeRepository.seed(seededStore('store-1', '西友'));
    productRepository.seed(
      seededProduct('product-1', '玉ねぎ', [
        seededPriceRecord('record-1', storeId, 300, 100, new Date('2026-01-01T00:00:00.000Z')),
      ]),
    );

    const dto = await new GetProductUseCase(productRepository, storeRepository).execute(
      'product-1',
    );

    expect(dto.id).toBe('product-1');
    expect(dto.name).toBe('玉ねぎ');
    expect(dto.priceHistory[0]?.storeName).toBe('西友');
    expect(dto.priceHistory[0]?.priceAmount).toBe(300);
    expect(dto.priceHistory[0]?.unitPriceAmount).toBe(100);
    expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('存在しない ID は ProductNotFoundError を投げる', async () => {
    await expect(
      new GetProductUseCase(productRepository, storeRepository).execute('missing'),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});

describe('UpdateProductUseCase', () => {
  const updateInput: UpdateProductInputDto = {
    id: 'product-1',
    name: 'にんじん',
    aliases: [' 人参 ', '  '],
    category: '野菜',
    defaultUnit: '本',
  };

  it('編集可能フィールドを更新し、保存した DTO を返す', async () => {
    productRepository.seed(seededProduct('product-1', '玉ねぎ'));

    const dto = await new UpdateProductUseCase(productRepository, storeRepository).execute(
      updateInput,
    );

    expect(dto.name).toBe('にんじん');
    expect(dto.aliases).toEqual(['人参']);
    expect(dto.defaultUnit).toBe('本');
    expect(productRepository.saveCount).toBe(1);
  });

  it('存在しない ID は ProductNotFoundError を投げ、保存しない', async () => {
    await expect(
      new UpdateProductUseCase(productRepository, storeRepository).execute(updateInput),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(productRepository.saveCount).toBe(0);
  });
});

describe('DeleteProductUseCase', () => {
  it('存在する商品を削除する', async () => {
    productRepository.seed(seededProduct('product-1'));

    await new DeleteProductUseCase(productRepository).execute('product-1');

    expect(productRepository.size).toBe(0);
    expect(productRepository.deletedIds).toEqual(['product-1']);
  });

  it('存在しない ID は ProductNotFoundError を投げ、delete を呼ばない', async () => {
    await expect(
      new DeleteProductUseCase(productRepository).execute('missing'),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(productRepository.deletedIds).toEqual([]);
  });
});

describe('RecordPriceUseCase', () => {
  const input: RecordPriceInputDto = {
    productId: 'product-1',
    storeId: 'store-1',
    priceAmount: 300,
    packageSizeValue: 3,
    packageSizeUnit: '個',
  };

  it('商品に価格履歴を記録し、単価を計算して保存する', async () => {
    productRepository.seed(seededProduct('product-1'));
    storeRepository.seed(seededStore('store-1', '西友'));

    await new RecordPriceUseCase(productRepository, storeRepository).execute(input);

    const product = await productRepository.findById(ProductId.fromString('product-1'));
    const record = product?.latestPriceRecordAt(StoreId.fromString('store-1')) ?? null;
    expect(productRepository.saveCount).toBe(1);
    expect(record?.price.amount).toBe(300);
    expect(record?.unitPrice.amount).toBe(100);
    expect(record?.packageSize.value).toBe(3);
  });

  it('単価が丸めで 0 になる入力を InvalidOperationError 派生で拒否し、保存しない', async () => {
    productRepository.seed(seededProduct('product-1'));
    storeRepository.seed(seededStore('store-1', '西友'));

    await expect(
      new RecordPriceUseCase(productRepository, storeRepository).execute({
        ...input,
        priceAmount: 1,
        packageSizeValue: 9_999_999,
      }),
    ).rejects.toBeInstanceOf(InvalidOperationError);
    expect(productRepository.saveCount).toBe(0);
  });

  it('商品が存在しなければ ProductNotFoundError を投げ、保存しない', async () => {
    storeRepository.seed(seededStore('store-1', '西友'));

    await expect(
      new RecordPriceUseCase(productRepository, storeRepository).execute(input),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(productRepository.saveCount).toBe(0);
  });

  it('店舗が存在しなければ StoreNotFoundError を投げ、保存しない', async () => {
    productRepository.seed(seededProduct('product-1'));

    await expect(
      new RecordPriceUseCase(productRepository, storeRepository).execute(input),
    ).rejects.toBeInstanceOf(StoreNotFoundError);
    expect(productRepository.saveCount).toBe(0);
  });

  it('priceAmount が 0 以下なら入口で拒否する', async () => {
    productRepository.seed(seededProduct('product-1'));
    storeRepository.seed(seededStore('store-1', '西友'));

    await expect(
      new RecordPriceUseCase(productRepository, storeRepository).execute({
        ...input,
        priceAmount: 0,
      }),
    ).rejects.toThrow('Price amount must be positive');
    expect(productRepository.saveCount).toBe(0);
  });

  it('packageSizeValue が 0 以下なら入口で拒否する', async () => {
    productRepository.seed(seededProduct('product-1'));
    storeRepository.seed(seededStore('store-1', '西友'));

    await expect(
      new RecordPriceUseCase(productRepository, storeRepository).execute({
        ...input,
        packageSizeValue: 0,
      }),
    ).rejects.toThrow('Package size must be positive');
    expect(productRepository.saveCount).toBe(0);
  });
});

describe('UpdatePriceRecordUseCase', () => {
  const baseInput: UpdatePriceRecordInputDto = {
    productId: 'product-1',
    priceRecordId: 'record-1',
    storeId: 'store-b',
    priceAmount: 300,
    packageSizeValue: 3,
    packageSizeUnit: '個',
  };

  function seedBase(): void {
    storeRepository.seed(seededStore('store-a', '西友'));
    storeRepository.seed(seededStore('store-b', 'ライフ'));
    productRepository.seed(
      seededProduct('product-1', '玉ねぎ', [
        seededPriceRecord(
          'record-1',
          StoreId.fromString('store-a'),
          300,
          100,
          new Date('2026-06-01T10:00:00.000Z'),
        ),
      ]),
    );
  }

  it('A-UPU-01: 店舗のみ変更する', async () => {
    seedBase();

    const dto = await new UpdatePriceRecordUseCase(productRepository, storeRepository).execute({
      ...baseInput,
      priceAmount: 300,
      packageSizeValue: 3,
      packageSizeUnit: '個',
    });

    expect(dto.priceHistory[0]?.storeId).toBe('store-b');
    expect(dto.priceHistory[0]?.storeName).toBe('ライフ');
    expect(dto.priceHistory[0]?.priceAmount).toBe(300);
    expect(dto.priceHistory[0]?.packageSizeValue).toBe(3);
  });

  it('A-UPU-02: 価格のみ変更する', async () => {
    seedBase();

    const dto = await new UpdatePriceRecordUseCase(productRepository, storeRepository).execute({
      ...baseInput,
      storeId: 'store-a',
      priceAmount: 450,
      packageSizeValue: 3,
      packageSizeUnit: '個',
    });

    expect(dto.priceHistory[0]?.priceAmount).toBe(450);
    expect(dto.priceHistory[0]?.unitPriceAmount).toBe(150);
    expect(dto.priceHistory[0]?.storeId).toBe('store-a');
    expect(dto.priceHistory[0]?.packageSizeValue).toBe(3);
  });

  it('A-UPU-03: 内容量のみ変更する（単位は同じ）', async () => {
    seedBase();

    const dto = await new UpdatePriceRecordUseCase(productRepository, storeRepository).execute({
      ...baseInput,
      storeId: 'store-a',
      priceAmount: 300,
      packageSizeValue: 6,
      packageSizeUnit: '個',
    });

    expect(dto.priceHistory[0]?.packageSizeValue).toBe(6);
    expect(dto.priceHistory[0]?.unitPriceAmount).toBe(50);
  });

  it('A-UPU-04: id と observedAt は編集前後で同一値である（critical）', async () => {
    seedBase();
    const before = (await productRepository.findById(ProductId.fromString('product-1')))
      ?.priceHistory[0];

    const dto = await new UpdatePriceRecordUseCase(productRepository, storeRepository).execute(
      baseInput,
    );

    expect(dto.priceHistory[0]?.id).toBe(before?.id.value);
    expect(dto.priceHistory[0]?.observedAt).toBe(before?.observedAt.toISOString());
  });

  // seed する記録の packageSize は seededPriceRecord() が `3個` 固定で作る。編集後の単位
  // （kg/g/l/ml）とは意図的に別次元にしてあり、単価の再計算が「保存済みの単位」ではなく
  // 「渡された単位」を使うことを担保する。試験 ID は fixture に literal で持たせる
  // （%s 展開だとソース検索で ID 単体を追跡できないため。レビュー S-3）。
  it.each([
    ['A-UPU-05', 'kg→g', { priceAmount: 1000, to: { value: 500, unit: 'g' as const } }, 200],
    ['A-UPU-06', 'g→kg', { priceAmount: 200, to: { value: 2, unit: 'kg' as const } }, 10],
    ['A-UPU-07', 'l→ml', { priceAmount: 180, to: { value: 900, unit: 'ml' as const } }, 20],
    ['A-UPU-08', 'ml→l', { priceAmount: 250, to: { value: 2.5, unit: 'l' as const } }, 10],
  ])(
    '%s: 単位換算 %s 方向で単価が再計算される（critical）',
    async (_id, _label, fixture, expected) => {
      storeRepository.seed(seededStore('store-a', '西友'));
      productRepository.seed(
        seededProduct('product-1', '玉ねぎ', [
          seededPriceRecord(
            'record-1',
            StoreId.fromString('store-a'),
            fixture.priceAmount,
            100,
            new Date('2026-06-01T10:00:00.000Z'),
          ),
        ]),
      );

      const dto = await new UpdatePriceRecordUseCase(productRepository, storeRepository).execute({
        productId: 'product-1',
        priceRecordId: 'record-1',
        storeId: 'store-a',
        priceAmount: fixture.priceAmount,
        packageSizeValue: fixture.to.value,
        packageSizeUnit: fixture.to.unit,
      });

      expect(dto.priceHistory[0]?.unitPriceAmount).toBe(expected);
    },
  );

  // A-UPU-18: 単価が丸めで 0 になる入力は 422 相当（InvalidOperationError 派生）で拒否する。
  // 素の Error のままだと onError が 500 + スタック出力にする（セキュリティレビュー Medium 1）。
  it('A-UPU-18: 単価が丸めで 0 になる入力を InvalidOperationError 派生で拒否し、保存しない', async () => {
    seedBase();

    const promise = new UpdatePriceRecordUseCase(productRepository, storeRepository).execute({
      ...baseInput,
      priceAmount: 1,
      packageSizeValue: 9_999_999,
      packageSizeUnit: '個',
    });

    await expect(promise).rejects.toBeInstanceOf(InvalidOperationError);
    expect(productRepository.saveCount).toBe(0);
  });

  it('A-UPU-09: 商品が存在しなければ ProductNotFoundError を投げ、保存しない', async () => {
    await expect(
      new UpdatePriceRecordUseCase(productRepository, storeRepository).execute(baseInput),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(productRepository.saveCount).toBe(0);
  });

  it('A-UPU-10: 価格記録が存在しなければ PriceRecordNotFoundError を投げ、保存しない', async () => {
    storeRepository.seed(seededStore('store-b', 'ライフ'));
    productRepository.seed(seededProduct('product-1'));

    await expect(
      new UpdatePriceRecordUseCase(productRepository, storeRepository).execute(baseInput),
    ).rejects.toBeInstanceOf(PriceRecordNotFoundError);
    expect(productRepository.saveCount).toBe(0);
  });

  it('A-UPU-11: 店舗が存在しなければ StoreNotFoundError を投げ、保存しない', async () => {
    productRepository.seed(
      seededProduct('product-1', '玉ねぎ', [
        seededPriceRecord('record-1', StoreId.fromString('store-a'), 300, 100, new Date()),
      ]),
    );

    await expect(
      new UpdatePriceRecordUseCase(productRepository, storeRepository).execute(baseInput),
    ).rejects.toBeInstanceOf(StoreNotFoundError);
    expect(productRepository.saveCount).toBe(0);
  });

  it.each([0, -1])(
    'A-UPU-12: priceAmount が %d なら例外を投げ、保存しない',
    async (priceAmount) => {
      seedBase();

      await expect(
        new UpdatePriceRecordUseCase(productRepository, storeRepository).execute({
          ...baseInput,
          priceAmount,
        }),
      ).rejects.toThrow();
      expect(productRepository.saveCount).toBe(0);
    },
  );

  it.each([0, -1])(
    'A-UPU-13: packageSizeValue が %d なら例外を投げ、保存しない',
    async (packageSizeValue) => {
      seedBase();

      await expect(
        new UpdatePriceRecordUseCase(productRepository, storeRepository).execute({
          ...baseInput,
          packageSizeValue,
        }),
      ).rejects.toThrow();
      expect(productRepository.saveCount).toBe(0);
    },
  );

  it('A-UPU-14: price が 1 円（下限）なら成功する', async () => {
    seedBase();

    const dto = await new UpdatePriceRecordUseCase(productRepository, storeRepository).execute({
      ...baseInput,
      priceAmount: 1,
    });

    expect(dto.priceHistory[0]?.priceAmount).toBe(1);
  });

  it('A-UPU-15: 同一入力で 2 回連続 execute しても priceHistory の内容は一致する（冪等性）', async () => {
    seedBase();
    const usecase = new UpdatePriceRecordUseCase(productRepository, storeRepository);

    const first = await usecase.execute(baseInput);
    const second = await usecase.execute(baseInput);

    expect(second.priceHistory[0]).toEqual(first.priceHistory[0]);
    expect(new Date(second.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first.updatedAt).getTime(),
    );
  });

  it('A-UPU-16: 編集後、最安店舗が再計算される（N-05統合）', async () => {
    storeRepository.seed(seededStore('store-a', '西友'));
    storeRepository.seed(seededStore('store-b', 'ライフ'));
    productRepository.seed(
      seededProduct('product-1', '玉ねぎ', [
        seededPriceRecord(
          'record-a',
          StoreId.fromString('store-a'),
          200,
          80,
          new Date('2026-06-01T10:00:00.000Z'),
        ),
        seededPriceRecord(
          'record-b',
          StoreId.fromString('store-b'),
          300,
          100,
          new Date('2026-06-01T11:00:00.000Z'),
        ),
      ]),
    );

    await new UpdatePriceRecordUseCase(productRepository, storeRepository).execute({
      productId: 'product-1',
      priceRecordId: 'record-b',
      storeId: 'store-b',
      priceAmount: 60,
      packageSizeValue: 3,
      packageSizeUnit: '個',
    });

    const result = await new GetCheapestStoreUseCase(productRepository, storeRepository).execute(
      'product-1',
    );

    expect(result?.storeId).toBe('store-b');
  });

  it('A-UPU-17: 戻り値の storeName は編集後の storeId に対応する', async () => {
    seedBase();

    const dto = await new UpdatePriceRecordUseCase(productRepository, storeRepository).execute(
      baseInput,
    );

    expect(dto.priceHistory[0]?.storeName).toBe('ライフ');
  });
});

describe('GetCheapestStoreUseCase', () => {
  it('価格記録がなければ null を返す', async () => {
    productRepository.seed(seededProduct('product-1'));

    const result = await new GetCheapestStoreUseCase(productRepository, storeRepository).execute(
      'product-1',
    );

    expect(result).toBeNull();
  });

  it('複数店舗の最新単価から最安店舗を返す', async () => {
    const storeA = StoreId.fromString('store-a');
    const storeB = StoreId.fromString('store-b');
    storeRepository.seed(seededStore('store-a', '西友'));
    storeRepository.seed(seededStore('store-b', 'ライフ'));
    productRepository.seed(
      seededProduct('product-1', '玉ねぎ', [
        seededPriceRecord('store-a-old', storeA, 240, 80, new Date('2026-01-01T00:00:00.000Z')),
        seededPriceRecord('store-a-new', storeA, 360, 120, new Date('2026-01-02T00:00:00.000Z')),
        seededPriceRecord('store-b-new', storeB, 270, 90, new Date('2026-01-02T00:00:00.000Z')),
      ]),
    );

    const result = await new GetCheapestStoreUseCase(productRepository, storeRepository).execute(
      'product-1',
    );

    expect(result).toEqual({
      storeId: 'store-b',
      storeName: 'ライフ',
      latestPrice: 270,
      unitPrice: 90,
      packageSizeUnit: '個',
    });
  });

  it('商品が存在しなければ ProductNotFoundError を投げる', async () => {
    await expect(
      new GetCheapestStoreUseCase(productRepository, storeRepository).execute('missing'),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it('最安店舗 ID に対応する Store が無くても storeName を空文字で返す（一覧取得と整合）', async () => {
    const storeId = StoreId.fromString('store-1');
    productRepository.seed(
      seededProduct('product-1', '玉ねぎ', [
        seededPriceRecord('record-1', storeId, 300, 100, new Date('2026-01-01T00:00:00.000Z')),
      ]),
    );

    const result = await new GetCheapestStoreUseCase(productRepository, storeRepository).execute(
      'product-1',
    );

    expect(result).toEqual({
      storeId: 'store-1',
      storeName: '',
      latestPrice: 300,
      unitPrice: 100,
      packageSizeUnit: '個',
    });
  });
});

describe('DeletePriceRecordUseCase', () => {
  const storeId = StoreId.fromString('store-1');

  function seedTwoRecords(): void {
    productRepository.seed(
      seededProduct('product-1', '玉ねぎ', [
        seededPriceRecord('record-1', storeId, 300, 100, new Date('2026-01-01T00:00:00.000Z')),
        seededPriceRecord('record-2', storeId, 280, 93.3, new Date('2026-01-02T00:00:00.000Z')),
      ]),
    );
  }

  it('DPR-01: 指定した価格記録を取り除いて保存する', async () => {
    seedTwoRecords();

    await new DeletePriceRecordUseCase(productRepository).execute({
      productId: 'product-1',
      priceRecordId: 'record-1',
    });

    expect(productRepository.saveCount).toBe(1);
    const saved = await productRepository.findById(ProductId.fromString('product-1'));
    expect(saved?.priceHistory.map((record) => record.id.value)).toEqual(['record-2']);
  });

  it('DPR-02: 商品が存在しなければ ProductNotFoundError を投げ、保存しない', async () => {
    await expect(
      new DeletePriceRecordUseCase(productRepository).execute({
        productId: 'missing',
        priceRecordId: 'record-1',
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(productRepository.saveCount).toBe(0);
  });

  it('DPR-03: 価格記録が存在しなければ PriceRecordNotFoundError を投げ、保存しない', async () => {
    seedTwoRecords();

    await expect(
      new DeletePriceRecordUseCase(productRepository).execute({
        productId: 'product-1',
        priceRecordId: 'missing',
      }),
    ).rejects.toBeInstanceOf(PriceRecordNotFoundError);
    expect(productRepository.saveCount).toBe(0);
  });

  it('DPR-04: 商品の存在確認が価格記録の存在確認より先に行われる', async () => {
    await expect(
      new DeletePriceRecordUseCase(productRepository).execute({
        productId: 'missing',
        priceRecordId: 'missing',
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it('DPR-05: 最後の 1 件を削除すると価格履歴が空になる', async () => {
    productRepository.seed(
      seededProduct('product-1', '玉ねぎ', [
        seededPriceRecord('record-1', storeId, 300, 100, new Date('2026-01-01T00:00:00.000Z')),
      ]),
    );

    await new DeletePriceRecordUseCase(productRepository).execute({
      productId: 'product-1',
      priceRecordId: 'record-1',
    });

    const saved = await productRepository.findById(ProductId.fromString('product-1'));
    expect(saved?.priceHistory).toEqual([]);
  });
});
