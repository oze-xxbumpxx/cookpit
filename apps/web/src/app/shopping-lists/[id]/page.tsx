import {
  GetShoppingListUseCase,
  GetStoresUseCase,
  ShoppingListNotFoundError,
  type ShoppingListDto,
  type StoreDto,
} from '@cookpit/application';
import { shoppingListRepository, storeRepository } from '@/server/repositories';
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
  try {
    [shoppingList, stores] = await Promise.all([
      new GetShoppingListUseCase(shoppingListRepository()).execute({ shoppingListId: id }),
      new GetStoresUseCase(storeRepository()).execute(),
    ]);
  } catch (error) {
    if (error instanceof ShoppingListNotFoundError) {
      notFound();
    }
    throw error;
  }

  return <ShoppingListClient shoppingList={shoppingList} stores={stores} />;
}
