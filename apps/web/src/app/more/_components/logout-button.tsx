'use client';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { API_FAILURE_MESSAGE } from '@/lib/use-api-action';
import { useState } from 'react';

const RUNTIME_CACHE_NAMES = [
  'shopping-list-detail-cache',
  'shopping-lists-pages-cache',
  'stores-cache',
];

/**
 * ログアウト後、SW ランタイムキャッシュに残る他ユーザー分のデータをベストエフォートで
 * 破棄する（DF-5）。`caches` 非対応環境・削除失敗はログアウト自体を妨げないため無視する。
 */
async function clearRuntimeCaches(): Promise<void> {
  try {
    for (const name of RUNTIME_CACHE_NAMES) {
      await caches.delete(name);
    }
  } catch {
    // ベストエフォート。失敗してもログアウト継続を妨げない。
  }
}

export function LogoutButton() {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await authClient.signOut();
      if (result.error !== null) {
        setErrorMessage(API_FAILURE_MESSAGE);
        setSubmitting(false);
        return;
      }
      await clearRuntimeCaches();
      window.location.assign('/login');
    } catch {
      setErrorMessage(API_FAILURE_MESSAGE);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {errorMessage !== null && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={submitting}
        className="h-11 w-full"
      >
        ログアウト
      </Button>
    </div>
  );
}
