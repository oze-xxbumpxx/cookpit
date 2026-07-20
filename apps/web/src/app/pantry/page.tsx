import { GetPantryUseCase } from '@cookpit/application';
import { pantryRepository } from '@/server/repositories';
import { PantryClient } from './_components/pantry-client';

export const dynamic = 'force-dynamic';

export default async function PantryPage() {
  const pantry = await new GetPantryUseCase(pantryRepository()).execute();
  return <PantryClient pantry={pantry} />;
}
