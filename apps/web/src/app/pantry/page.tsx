import { GetPantryUseCase } from '@cookpit/application';
import { pantryRepository } from '@/server/repositories';
import { PantryClient } from './_components/pantry-client';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ stock?: string }>;
}

export default async function PantryPage({ searchParams }: Props) {
  const now = new Date();
  const { stock: highlightStockId } = await searchParams;
  const pantry = await new GetPantryUseCase(pantryRepository()).execute();
  return <PantryClient pantry={pantry} asOf={now} highlightStockId={highlightStockId ?? null} />;
}
