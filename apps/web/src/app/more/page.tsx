import { getAuth, isAuthConfigured } from '@/server/auth';
import { headers } from 'next/headers';
import { MoreMenu } from './_components/more-menu';

export default async function MorePage() {
  // dev（BETTER_AUTH_SECRET 未設定。Proxy も認証をスキップする経路）では getAuth() を
  // 呼ばず null 扱いにする。DATABASE_URL 自体が未設定な dev 環境だと getDb() が
  // 例外を投げるため、ここで呼ぶと画面が壊れる（D-16 の申し送り）。
  const session = isAuthConfigured()
    ? await getAuth().api.getSession({ headers: await headers() })
    : null;

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <h1 className="text-xl font-semibold text-foreground">その他</h1>
        {session !== null && (
          <p className="text-sm text-muted-foreground">{session.user.name} でログイン中</p>
        )}
        <MoreMenu />
      </div>
    </main>
  );
}
