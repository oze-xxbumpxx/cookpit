'use client';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { API_FAILURE_MESSAGE } from '@/lib/use-api-action';
import { useState } from 'react';

const SUCCESS_MESSAGE = '他の端末からログアウトしました。';

/** 現在の端末以外の全セッションを失効させるボタン。 */
export function RevokeOtherSessionsButton() {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleClick(): Promise<void> {
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await authClient.revokeOtherSessions();
      if (result.error !== null) {
        setErrorMessage(API_FAILURE_MESSAGE);
        return;
      }
      setSuccessMessage(SUCCESS_MESSAGE);
    } catch {
      setErrorMessage(API_FAILURE_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <h2 className="text-sm font-medium text-foreground">他の端末からログアウト</h2>

      {errorMessage !== null && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}
      {successMessage !== null && (
        <p className="rounded-lg border bg-secondary px-3 py-2 text-sm text-foreground">
          {successMessage}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={submitting}
        className="h-11 w-full"
      >
        他の端末をログアウトする
      </Button>
    </div>
  );
}
