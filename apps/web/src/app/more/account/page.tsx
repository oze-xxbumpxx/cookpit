import { getAuth } from '@/server/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ChangePasswordForm } from './_components/change-password-form';
import { RevokeOtherSessionsButton } from './_components/revoke-other-sessions-button';

// 他の DB 参照ページ（pantry/products 等）と同じ規約。既定の静的最適化トライアル
// レンダリングで getAuth() が(secret 未設定の場合の警告を含めて)build 時に評価される
// のを避け、常にリクエスト時に評価させる。
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  // Proxy が既に保護しているため通常は到達しないが、表示に session が要るため
  // 二重防御として明示する（設計書のとおり）。
  if (session === null) {
    redirect('/login?next=/more/account');
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">アカウント</h1>
          <p className="text-sm text-foreground">{session.user.name}</p>
          <p className="text-sm text-muted-foreground">{session.user.email}</p>
        </div>
        <ChangePasswordForm />
        <RevokeOtherSessionsButton />
      </div>
    </main>
  );
}
