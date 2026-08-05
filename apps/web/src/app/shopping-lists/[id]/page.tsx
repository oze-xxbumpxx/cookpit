import {
  GetProductsUseCase,
  GetShoppingListUseCase,
  GetStoresUseCase,
  ShoppingListNotFoundError,
  type ProductDto,
  type ShoppingListDto,
  type StoreDto,
} from '@cookpit/application';
import { productRepository, shoppingListRepository, storeRepository } from '@/server/repositories';
import { notFound } from 'next/navigation';
import { ShoppingListClient } from '../_components/shopping-list-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ShoppingListDetailPage({ params }: Props) {
  const { id } = await params;
  let shoppingList: ShoppingListDto;
  let stores: StoreDto[];
  let products: ProductDto[];
  try {
    [shoppingList, stores, products] = await Promise.all([
      new GetShoppingListUseCase(shoppingListRepository()).execute({ shoppingListId: id }),
      new GetStoresUseCase(storeRepository()).execute(),
      new GetProductsUseCase(productRepository(), storeRepository()).execute(),
    ]);
  } catch (error) {
    if (error instanceof ShoppingListNotFoundError) {
      notFound();
    }
    throw error;
  }

  // 買い物リストが参照しない商品まで priceHistory ごとフライトペイロードへ載せない
  // （価格記録は削除しない限り貯まり続けるため、買い物中のモバイル回線で効いてくる）。
  const referencedProductIds = new Set(
    shoppingList.items
      .map((item) => item.productId)
      .filter((productId): productId is string => productId !== null),
  );
  const referencedProducts = products.filter((product) => referencedProductIds.has(product.id));

  return (
    <ShoppingListClient shoppingList={shoppingList} stores={stores} products={referencedProducts} />
  );
}
