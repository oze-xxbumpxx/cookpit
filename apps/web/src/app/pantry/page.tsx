import { GetPantryUseCase } from '@cookpit/application';
import { pantryRepository } from '@/server/repositories';
import { PantryClient } from './_components/pantry-client';

export const dynamic = 'force-dynamic';

interface Props {
  searchParams: Promise<{ stock?: string }>;
}

/**
 * 通知タップの deep link（`?stock=<id>`）。空・未指定は null。
 * 存在しない id の扱いは PantryClient 側（無視・EmptyState にしない）。
 */
function resolveHighlightStockId(raw: string | undefined): string | null {
  if (raw === undefined || raw === '') {
    return null;
  }
  return raw;
}

export default async function PantryPage({ searchParams }: Props) {
  const { stock } = await searchParams;
  const now = new Date();
  const pantry = await new GetPantryUseCase(pantryRepository()).execute();
  return (
    <PantryClient pantry={pantry} asOf={now} highlightStockId={resolveHighlightStockId(stock)} />
  );
}
