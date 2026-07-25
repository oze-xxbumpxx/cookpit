import { GetProductsUseCase } from '@cookpit/application';
import { productRepository, storeRepository } from '@/server/repositories';
import { ProductListClient } from './_components/product-list-client';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const useCase = new GetProductsUseCase(productRepository(), storeRepository());
  const products = await useCase.execute();

  return <ProductListClient initialProducts={products} />;
}
