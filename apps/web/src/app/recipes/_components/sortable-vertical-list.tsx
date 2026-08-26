'use client';

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Announcements, DragEndEvent } from '@dnd-kit/core';
import {
  sortableKeyboardCoordinates,
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { ReactElement, ReactNode } from 'react';
import { useId } from 'react';
import { moveArrayItem } from '@/app/recipes/_utils/move-array-item';

interface Props<T extends { id: string }> {
  items: readonly T[];
  kind: '材料' | '手順';
  onReorder: (next: T[]) => void;
  children: ReactNode;
}

/** dnd-kit の既定通知は英語のため、並べ替え対象に合わせた日本語文言へ差し替える。 */
function sortablePosition(entry: { data: { current?: { sortable?: { index: number } } } }): number {
  return (entry.data.current?.sortable?.index ?? 0) + 1;
}

function createReorderAnnouncements(kind: '材料' | '手順'): Announcements {
  return {
    onDragStart: ({ active }) => `${sortablePosition(active)}番目の${kind}をつかみました`,
    onDragOver: ({ over }) =>
      over === null ? '並べ替えできない位置です' : `${sortablePosition(over)}番目へ移動します`,
    onDragEnd: ({ over }) =>
      over === null ? '並べ替えを取り消しました' : `${sortablePosition(over)}番目に移動しました`,
    onDragCancel: () => '並べ替えを取り消しました',
  };
}

const INGREDIENT_REORDER_ANNOUNCEMENTS = createReorderAnnouncements('材料');
const STEP_REORDER_ANNOUNCEMENTS = createReorderAnnouncements('手順');

export function SortableVerticalList<T extends { id: string }>({
  items,
  kind,
  onReorder,
  children,
}: Props<T>): ReactElement {
  // DndContext は id 未指定だとインスタンス連番で aria-describedby を採番し、SSR と CSR で
  // 値がずれてハイドレーション不一致になる。useId は両者で一致するため id として渡す。
  const dndId = useId();
  // distance の活性化条件でタップ・クリックとの誤爆を防ぐ。PointerSensor はタッチも扱うため
  // TouchSensor は併用しない（同一操作が二重に活性化しうる）。
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const announcements =
    kind === '材料' ? INGREDIENT_REORDER_ANNOUNCEMENTS : STEP_REORDER_ANNOUNCEMENTS;

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (over === null || active.id === over.id) {
      return;
    }
    const from = items.findIndex((row) => row.id === active.id);
    const to = items.findIndex((row) => row.id === over.id);
    onReorder(moveArrayItem(items, from, to));
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{ announcements }}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}
