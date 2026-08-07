import {
  GetProductDetailUseCase,
  ProductNotFoundError,
  type ProductDetailResultDto,
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
  let result: ProductDetailResultDto;
  try {
    const getProductDetail = new GetProductDetailUseCase(productRepository(), storeRepository());
    result = await getProductDetail.execute(id);
  } catch (error) {
    if (error instanceof ProductNotFoundError) {
      notFound();
    }
    throw error;
  }

  return <ProductDetailClient product={result.product} cheapestStore={result.cheapestStore} />;
}
