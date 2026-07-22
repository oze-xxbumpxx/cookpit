import type { LucideIcon } from 'lucide-react';

interface Props {
  Icon: LucideIcon;
  message: string;
}

/** 一覧が空のときの共通表示（柔らかいアイコン + メッセージ）。 */
export function EmptyState({ Icon, message }: Props) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
      <Icon className="size-8 opacity-60" aria-hidden="true" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
