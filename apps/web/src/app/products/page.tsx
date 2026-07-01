import { getDb } from '@/db/client';
import { GetProductsUseCase } from '@cookpit/application';
import { DrizzleProductRepository, DrizzleStoreRepository } from '@cookpit/infrastructure';
import { ProductListClient } from './_components/product-list-client';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const productRepository = new DrizzleProductRepository(getDb());
  const storeRepository = new DrizzleStoreRepository(getDb());
  const useCase = new GetProductsUseCase(productRepository, storeRepository);
  const products = await useCase.execute();

  return <ProductListClient initialProducts={products} />;
}
