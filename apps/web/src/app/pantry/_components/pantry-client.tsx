'use client';

import { EmptyState } from '@/app/_components/empty-state';
import { Button } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import { useApiAction } from '@/lib/use-api-action';
import type { PantryDto, StockDto } from '@cookpit/application';
import { Plus, Refrigerator } from 'lucide-react';
import { useEffect, useState } from 'react';
import { groupStocksByLocation } from '../_utils/pantry-view';
import { AddStockForm, type AddStockFormInput } from './add-stock-form';
import { LocationGroup } from './location-group';

interface Props {
  pantry: PantryDto;
}

/** 在庫追加・再取得を表す実行中キー。在庫行の操作は stockId をキーにする。 */
const ADD_KEY = 'add';
const REFRESH_KEY = 'refresh';

export function PantryClient({ pantry }: Props) {
  const [stocks, setStocks] = useState<StockDto[]>(pantry.stocks);
  const [addFormOpen, setAddFormOpen] = useState(false);
  // 在庫行の操作・追加・再取得はエラーバナーを共有するため 1 インスタンスにまとめ、
  // 「どれが実行中か」は キーごとの isPending で区別する。
  const action = useApiAction();

  async function handleConsume(stockId: string): Promise<void> {
    const stock = stocks.find((candidate) => candidate.id === stockId) ?? null;
    if (stock === null) {
      return;
    }
    await action.run(
      () =>
        client.api.pantry.stocks[':stockId'].consume.$post({
          param: { stockId },
          json: { amount: { value: stock.amount.value, unit: stock.amount.unit } },
        }),
      { key: stockId, onSuccess: (dto) => setStocks(dto.stocks) },
    );
  }

  async function handleDiscard(stockId: string): Promise<void> {
    const stock = stocks.find((candidate) => candidate.id === stockId) ?? null;
    if (stock === null) {
      return;
    }
    await action.run(
      () => client.api.pantry.stocks[':stockId'].discard.$post({ param: { stockId } }),
      { key: stockId, onSuccess: (dto) => setStocks(dto.stocks) },
    );
  }

  async function handleAddStock(input: AddStockFormInput): Promise<void> {
    await action.run(() => client.api.pantry.stocks.$post({ json: input }), {
      key: ADD_KEY,
      failureMessage: '在庫の追加に失敗しました。',
      onSuccess: (dto) => {
        setStocks(dto.stocks);
        setAddFormOpen(false);
      },
    });
  }

  async function handleRefetch({ silent }: { silent: boolean }): Promise<void> {
    await action.run(() => client.api.pantry.$get(), {
      key: REFRESH_KEY,
      silent,
      onSuccess: (dto) => {
        setStocks(dto.stocks);
        // 再同期に成功したら過去の書き込み失敗のバナーは古い情報になるため消す
        action.setErrorMessage(null);
      },
    });
  }

  useEffect(() => {
    function handleFocus(): void {
      void handleRefetch({ silent: true });
    }
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
              disabled={action.isPending(REFRESH_KEY)}
              className="h-9 px-2 text-foreground"
            >
              更新
            </Button>
          </div>
        </header>

        {action.errorMessage !== null && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {action.errorMessage}
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
                submittingStockId={
                  group.stocks.find((stock) => action.isPending(stock.id))?.id ?? null
                }
                onConsume={(stockId) => void handleConsume(stockId)}
                onDiscard={(stockId) => void handleDiscard(stockId)}
              />
            ))}
          </div>
        )}

        {addFormOpen ? (
          <AddStockForm
            submitting={action.isPending(ADD_KEY)}
            onAdd={(input) => void handleAddStock(input)}
          />
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
