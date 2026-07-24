'use client';

import { EmptyState } from '@/app/_components/empty-state';
import { Button } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import type { PantryDto, StockDto } from '@cookpit/application';
import { Plus, Refrigerator } from 'lucide-react';
import { useEffect, useState } from 'react';
import { groupStocksByLocation } from '../_utils/pantry-view';
import { AddStockForm, type AddStockFormInput } from './add-stock-form';
import { LocationGroup } from './location-group';

interface Props {
  pantry: PantryDto;
}

export function PantryClient({ pantry }: Props) {
  const [stocks, setStocks] = useState<StockDto[]>(pantry.stocks);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittingStockId, setSubmittingStockId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);

  async function handleConsume(stockId: string): Promise<void> {
    if (submittingStockId === stockId) {
      return;
    }
    setSubmittingStockId(stockId);
    setErrorMessage(null);
    try {
      const stock = stocks.find((candidate) => candidate.id === stockId) ?? null;
      if (stock === null) {
        return;
      }
      const response = await client.api.pantry.stocks[':stockId'].consume.$post({
        param: { stockId },
        json: { amount: { value: stock.amount.value, unit: stock.amount.unit } },
      });
      if (!response.ok) {
        setErrorMessage('操作に失敗しました。');
        return;
      }
      const dto = await response.json();
      setStocks(dto.stocks);
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setSubmittingStockId(null);
    }
  }

  async function handleDiscard(stockId: string): Promise<void> {
    if (submittingStockId === stockId) {
      return;
    }
    setSubmittingStockId(stockId);
    setErrorMessage(null);
    try {
      const stock = stocks.find((candidate) => candidate.id === stockId) ?? null;
      if (stock === null) {
        return;
      }
      const response = await client.api.pantry.stocks[':stockId'].discard.$post({
        param: { stockId },
      });
      if (!response.ok) {
        setErrorMessage('操作に失敗しました。');
        return;
      }
      const dto = await response.json();
      setStocks(dto.stocks);
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setSubmittingStockId(null);
    }
  }

  async function handleAddStock(input: AddStockFormInput): Promise<void> {
    if (addSubmitting) {
      return;
    }
    setAddSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await client.api.pantry.stocks.$post({ json: input });
      if (!response.ok) {
        setErrorMessage('在庫の追加に失敗しました。');
        return;
      }
      const dto = await response.json();
      setStocks(dto.stocks);
      setAddFormOpen(false);
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handleRefetch({ silent }: { silent: boolean }): Promise<void> {
    if (!silent) {
      setRefreshing(true);
    }
    try {
      const response = await client.api.pantry.$get();
      if (!response.ok) {
        if (!silent) {
          setErrorMessage('操作に失敗しました。');
        }
        return;
      }
      const dto = await response.json();
      setStocks(dto.stocks);
      setErrorMessage(null);
    } catch {
      if (!silent) {
        setErrorMessage('通信エラーが発生しました。');
      }
    } finally {
      if (!silent) {
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    function handleFocus(): void {
      void handleRefetch({ silent: true });
    }
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const groupedStocks = groupStocksByLocation(stocks);

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <header className="flex items-center justify-between gap-3">
          <h1 className="truncate text-xl font-semibold text-foreground">在庫</h1>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleRefetch({ silent: false })}
              disabled={refreshing}
              className="h-9 px-2 text-foreground"
            >
              更新
            </Button>
          </div>
        </header>

        {errorMessage !== null && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        {stocks.length === 0 ? (
          <EmptyState Icon={Refrigerator} message="在庫がありません" />
        ) : (
          <div className="flex flex-col gap-4">
            {groupedStocks.map((group) => (
              <LocationGroup
                key={group.location ?? 'unset'}
                location={group.location}
                stocks={group.stocks}
                submittingStockId={submittingStockId}
                onConsume={(stockId) => void handleConsume(stockId)}
                onDiscard={(stockId) => void handleDiscard(stockId)}
              />
            ))}
          </div>
        )}

        {addFormOpen ? (
          <AddStockForm submitting={addSubmitting} onAdd={(input) => void handleAddStock(input)} />
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setAddFormOpen(true)}
            className="h-11 w-full"
          >
            <Plus className="size-4" aria-hidden="true" />
            在庫を追加
          </Button>
        )}
      </div>
    </main>
  );
}
