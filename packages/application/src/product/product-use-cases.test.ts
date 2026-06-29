import { beforeEach, describe, expect, it } from 'vitest';
import { Money } from '@cookpit/domain/src/shared/money';
import { PriceRecord, Product } from '@cookpit/domain/src/product/product';
import { PriceRecordId } from '@cookpit/domain/src/product/price-record-id';
import { ProductId } from '@cookpit/domain/src/product/product-id';
import { Quantity } from '@cookpit/domain/src/shared/quantity';
import { Store, StoreId } from '@cookpit/domain/src/shared/store';
import type { ProductRepository } from '@cookpit/domain/src/product/product.repository';
import type { StoreRepository } from '@cookpit/domain/src/shared/store.repository';
import { CreateProductUseCase } from './create-product.use-case';
import { DeleteProductUseCase } from './delete-product.use-case';
import { GetCheapestStoreUseCase } from './get-cheapest-store.use-case';
import { GetProductUseCase } from './get-product.use-case';
import { GetProductsUseCase } from './get-products.use-case';
import { ProductNotFoundError } from './product-not-found.error';
import { RecordPriceUseCase } from './record-price.use-case';
import { StoreNotFoundError } from '../store/store-not-found.error';
import { UpdateProductUseCase } from './update-product.use-case';
import type {
  CreateProductInputDto,
  RecordPriceInputDto,
  UpdateProductInputDto,
} from './product.dto';

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

  async save(store: Store): Promise<void> {
    this.saveCount += 1;
    this.map.set(store.id.value, store);
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
    });
  });
});
