'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark' | 'system';

const ORDER: Theme[] = ['system', 'light', 'dark'];
const LABEL: Record<Theme, string> = {
  system: 'テーマ: OS に追従',
  light: 'テーマ: ライト',
  dark: 'テーマ: ダーク',
};
const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

const listeners = new Set<() => void>();

function readTheme(): Theme {
  const stored = localStorage.getItem('theme');
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function applyTheme(theme: Theme): void {
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

function setTheme(theme: Theme): void {
  localStorage.setItem('theme', theme);
  applyTheme(theme);
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener('storage', callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener('storage', callback);
  };
}

/** テーマ（OS 追従 / ライト / ダーク）を循環切替し localStorage に保存する。 */
export function ThemeToggle() {
  // useSyncExternalStore: SSR は 'system'、クライアントは localStorage を参照（ハイドレーション差分なし）。
  const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => 'system');
  const Icon = ICON[theme];

  function cycle(): void {
    setTheme(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] ?? 'system');
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={LABEL[theme]}
      title={LABEL[theme]}
      className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted active:scale-95"
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
