import type { ShoppingItemDto, StoreDto } from '@cookpit/application';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

// meal-plan-view.ts の formatDatePart と同一のローカルタイム規約。機能ローカルで重複定義する
// （Unit 選択肢と同じく、他機能からの import はしない先例）。
function formatDatePart(date: Date): string {
  const weekday = WEEKDAY_LABELS[date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}（${weekday}）`;
}

export function buildStoreNameMap(stores: StoreDto[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const store of stores) {
    map.set(store.id, store.name);
  }
  return map;
}

export interface ShoppingItemGroup {
  storeId: string | null;
  storeName: string;
  items: ShoppingItemDto[];
}

// targetStoreId でグルーピングし、店舗未定グループ（storeId: null）を先頭に固定する（D-2）。
// stores の並び順（GET /api/stores の返却順）をそのまま各グループの表示順に使う。
// items が 0 件の店舗はグループごと出さない。targetStoreId が stores に存在しない場合は
// 防御的に「不明な店舗」として扱う（D-3 shopping-list-core の非チェック方針の帰結）。
export function groupItemsByStore(
  items: ShoppingItemDto[],
  stores: StoreDto[],
): ShoppingItemGroup[] {
  const unassignedItems: ShoppingItemDto[] = [];
  const itemsByStoreId = new Map<string, ShoppingItemDto[]>();

  for (const item of items) {
    if (item.targetStoreId === null) {
      unassignedItems.push(item);
      continue;
    }
    const existing = itemsByStoreId.get(item.targetStoreId);
    if (existing === undefined) {
      itemsByStoreId.set(item.targetStoreId, [item]);
    } else {
      existing.push(item);
    }
  }

  const groups: ShoppingItemGroup[] = [];

  if (unassignedItems.length > 0) {
    groups.push({ storeId: null, storeName: '店舗未定', items: unassignedItems });
  }

  for (const store of stores) {
    const storeItems = itemsByStoreId.get(store.id);
    if (storeItems !== undefined) {
      groups.push({ storeId: store.id, storeName: store.name, items: storeItems });
      itemsByStoreId.delete(store.id);
    }
  }

  // stores に存在しない targetStoreId（データ不整合の防御）は末尾に「不明な店舗」としてまとめる。
  for (const [storeId, storeItems] of itemsByStoreId) {
    groups.push({ storeId, storeName: '不明な店舗', items: storeItems });
  }

  return groups;
}

// shoppingDate "2026-07-11" → 「7/11（土）の買い物リスト」。
// Date 構築は meal-plan-view.ts の formatWeekRange と同一のローカルタイム規約（'T00:00:00' 付与）。
export function formatShoppingDate(shoppingDate: string): string {
  const date = new Date(`${shoppingDate}T00:00:00`);
  return `${formatDatePart(date)}の買い物リスト`;
}
