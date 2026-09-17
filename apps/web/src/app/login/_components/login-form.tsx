'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import { NETWORK_ERROR_MESSAGE } from '@/lib/use-api-action';
import { useId, useState, type FormEvent } from 'react';

const INVALID_CREDENTIALS_MESSAGE = 'メールアドレスまたはパスワードが違います。';
const RATE_LIMIT_MESSAGE = '試行回数が多すぎます。しばらく待ってから再度お試しください。';
const NEXT_MAX_LENGTH = 2000;

interface Props {
  next: string | null;
}

// eslint-disable-next-line no-control-regex -- TAB/LF/CR 等の制御文字を意図的に検出する（SEC-1）。
const CONTROL_CHARS_REGEX = /[\x00-\x1f\x7f]/;

/**
 * `next` クエリ（未信頼入力）の再検証。Proxy 側の `buildNextParam`（生成側）とは別実装
 * （契約書 §4.1）。サーバーが生成した値を信頼して素通しすると、`/login?next=...` を
 * 直接叩かれた場合のオープンリダイレクト防御が働かないため、この再検証を省略してはならない。
 *
 * 制御文字（TAB/LF/CR 等）を先に弾くのは、WHATWG URL パーサがこれらを解決前に除去するため
 * 正規表現の `^\/(?![/\\])` だけでは `"/\t//evil.com"` → `https://evil.com/` の解決を防げない
 * ため（SEC-1。`docs/reviews/better-auth-login.security.md`）。加えて `new URL()` で実際に
 * 解決させ origin が自オリジンのままであることを二重に確認する（正規表現の穴に依存しない）。
 */
function safeNext(value: string | null): string {
  if (value === null || value.length > NEXT_MAX_LENGTH || CONTROL_CHARS_REGEX.test(value)) {
    return '/';
  }
  if (!/^\/(?![/\\])/.test(value)) {
    return '/';
  }
  try {
    const resolved = new URL(value, window.location.origin);
    return resolved.origin === window.location.origin
      ? `${resolved.pathname}${resolved.search}`
      : '/';
  } catch {
    return '/';
  }
}

/** ログインフォーム（Client Component）。`authClient.signIn.email` を呼ぶ。 */
export function LoginForm({ next }: Props) {
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canSubmit = email.trim() !== '' && password !== '' && !submitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error !== null) {
        // 401/403 は区別しない（メール存在の列挙防止。E-01）。429 のみ文言を分ける。
        setErrorMessage(
          result.error.status === 429 ? RATE_LIMIT_MESSAGE : INVALID_CREDENTIALS_MESSAGE,
        );
        setSubmitting(false);
        return;
      }
      // フルナビゲーション（router.push ではない）にするのは、Cookie が付いた状態で
      // Server Component の SSR を確実にやり直すためと、SW の navigation 経路に乗せるため。
      window.location.assign(safeNext(next));
    } catch {
      setErrorMessage(NETWORK_ERROR_MESSAGE);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {errorMessage !== null && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor={emailId} className="text-sm font-medium text-foreground">
          メールアドレス
        </label>
        <Input
          id={emailId}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          className="h-11 rounded-xl bg-card"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={passwordId} className="text-sm font-medium text-foreground">
          パスワード
        </label>
        <Input
          id={passwordId}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.currentTarget.value)}
          className="h-11 rounded-xl bg-card"
        />
      </div>

      <Button type="submit" disabled={!canSubmit} className="h-11 w-full">
        {submitting ? 'ログイン中' : 'ログイン'}
      </Button>

      {/* 第二段（パスキー）の拡張領域。「別の方法でログイン」はここに追加する。第一段では何も描画しない。 */}
    </form>
  );
}
