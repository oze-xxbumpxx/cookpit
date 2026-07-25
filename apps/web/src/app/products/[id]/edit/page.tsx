import { GetProductUseCase, ProductNotFoundError, type ProductDto } from '@cookpit/application';
import { productRepository, storeRepository } from '@/server/repositories';
import { notFound } from 'next/navigation';
import { ProductEditFormClient } from './_components/product-edit-form-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProductEditPage({ params }: Props) {
  const { id } = await params;
  const useCase = new GetProductUseCase(productRepository(), storeRepository());

  let product: ProductDto;
  try {
    product = await useCase.execute(id);
  } catch (error) {
    if (error instanceof ProductNotFoundError) {
      notFound();
    }
    throw error;
  }

  return <ProductEditFormClient product={product} />;
}
