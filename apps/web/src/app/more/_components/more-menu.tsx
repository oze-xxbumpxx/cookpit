import { ChefHat, Tag } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

const MORE_LINKS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: '/recipes', label: 'レシピ', Icon: ChefHat },
  { href: '/products', label: '商品', Icon: Tag },
];

export function MoreMenu() {
  return (
    <nav className="grid grid-cols-2 gap-2">
      {MORE_LINKS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-3 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-muted active:scale-[0.98]"
        >
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}
