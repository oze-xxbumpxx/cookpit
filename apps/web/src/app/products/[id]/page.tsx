import {
  GetCheapestStoreUseCase,
  GetProductUseCase,
  ProductNotFoundError,
  type CheapestStoreResultDto,
  type ProductDto,
} from '@cookpit/application';
import { productRepository, storeRepository } from '@/server/repositories';
import { notFound } from 'next/navigation';
import { ProductDetailClient } from './_components/product-detail-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  let product: ProductDto;
  let cheapestStore: CheapestStoreResultDto | null;
  try {
    const getProduct = new GetProductUseCase(productRepository(), storeRepository());
    product = await getProduct.execute(id);

    const getCheapestStore = new GetCheapestStoreUseCase(productRepository(), storeRepository());
    cheapestStore = await getCheapestStore.execute(id);
  } catch (error) {
    if (error instanceof ProductNotFoundError) {
      notFound();
    }
    throw error;
  }

  return <ProductDetailClient product={product} cheapestStore={cheapestStore} />;
}
