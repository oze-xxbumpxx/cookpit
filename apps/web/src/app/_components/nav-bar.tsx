'use client';

import { cn } from '@/lib/utils';
import { CalendarDays, ChefHat, House, Refrigerator, ShoppingCart, Tag } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Tab {
  href: string;
  label: string;
  Icon: LucideIcon;
}

const TABS: Tab[] = [
  { href: '/', label: 'ホーム', Icon: House },
  { href: '/meal-plans', label: '献立', Icon: CalendarDays },
  { href: '/shopping-lists', label: '買い物', Icon: ShoppingCart },
  { href: '/pantry', label: '在庫', Icon: Refrigerator },
  { href: '/recipes', label: 'レシピ', Icon: ChefHat },
  { href: '/products', label: '商品', Icon: Tag },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="メインナビゲーション"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur"
    >
      <ul className="mx-auto flex w-full max-w-md items-stretch justify-around px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {TABS.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-lg py-2 text-xs font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
