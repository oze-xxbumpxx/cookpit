import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  Icon: LucideIcon;
  message: string;
  /** メッセージの下に置くアクション（CTA ボタン等）。省略時は表示しない。 */
  children?: ReactNode;
}

/** 一覧・画面が空のときの共通表示（柔らかいアイコン + メッセージ + 任意のアクション）。 */
export function EmptyState({ Icon, message, children }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
      <Icon className="size-8 opacity-60" aria-hidden="true" />
      <p className="text-sm">{message}</p>
      {children}
    </div>
  );
}
