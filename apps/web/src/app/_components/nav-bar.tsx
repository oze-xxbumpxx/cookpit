'use client';

import { cn } from '@/lib/utils';
import { CalendarDays, Ellipsis, House, Refrigerator, ShoppingCart } from 'lucide-react';
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
  { href: '/more', label: 'その他', Icon: Ellipsis },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  if (href === '/more') {
    return (
      pathname === '/more' || pathname.startsWith('/recipes') || pathname.startsWith('/products')
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav aria-label="メインナビゲーション" className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto w-full max-w-md border-t border-border bg-card/95 backdrop-blur">
        <ul className="flex items-stretch justify-around px-0.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {TABS.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href} className="min-w-0 flex-1">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    // 5 タブなら text-xs でも main の下余白予算（4.5rem）内に収まる。
                    'flex flex-col items-center gap-0.5 rounded-lg px-0.5 py-2 text-xs font-medium leading-none transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
                  <span className="max-w-full truncate">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
