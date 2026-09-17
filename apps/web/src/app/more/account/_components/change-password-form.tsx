'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import { NETWORK_ERROR_MESSAGE } from '@/lib/use-api-action';
import { useId, useState, type FormEvent } from 'react';

const MISMATCH_MESSAGE = '新しいパスワードと確認が一致しません。';
const CURRENT_PASSWORD_ERROR_MESSAGE = '現在のパスワードが正しくありません。';
const SUCCESS_MESSAGE = 'パスワードを変更しました。他の端末では再ログインが必要です。';

/** パスワード変更フォーム。成功時は他端末を全て失効させる（`revokeOtherSessions: true`）。 */
export function ChangePasswordForm() {
  const currentId = useId();
  const newId = useId();
  const confirmId = useId();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const mismatch = newPassword !== '' && confirmPassword !== '' && newPassword !== confirmPassword;
  const canSubmit =
    currentPassword !== '' &&
    newPassword !== '' &&
    confirmPassword !== '' &&
    !mismatch &&
    !submitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error !== null) {
        setErrorMessage(CURRENT_PASSWORD_ERROR_MESSAGE);
        return;
      }
      setSuccessMessage(SUCCESS_MESSAGE);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setErrorMessage(NETWORK_ERROR_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3"
    >
      <h2 className="text-sm font-medium text-foreground">パスワードを変更</h2>

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

      <div className="flex flex-col gap-2">
        <label htmlFor={currentId} className="text-sm font-medium text-foreground">
          現在のパスワード
        </label>
        <Input
          id={currentId}
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.currentTarget.value)}
          className="h-11 rounded-xl bg-background"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={newId} className="text-sm font-medium text-foreground">
          新しいパスワード
        </label>
        <Input
          id={newId}
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.currentTarget.value)}
          className="h-11 rounded-xl bg-background"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={confirmId} className="text-sm font-medium text-foreground">
          新しいパスワード（確認）
        </label>
        <Input
          id={confirmId}
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.currentTarget.value)}
          aria-invalid={mismatch}
          className="h-11 rounded-xl bg-background"
        />
        {mismatch && <p className="text-xs text-destructive">{MISMATCH_MESSAGE}</p>}
      </div>

      <Button type="submit" disabled={!canSubmit} className="h-11 w-full">
        {submitting ? '変更中' : '変更する'}
      </Button>
    </form>
  );
}
