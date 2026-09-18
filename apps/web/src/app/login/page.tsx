import type { Metadata } from 'next';
import { LoginForm } from './_components/login-form';

export const metadata: Metadata = {
  title: 'ログイン | Cookpit',
};

interface Props {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-background px-4 py-8">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">ログイン</h1>
          <p className="text-sm text-muted-foreground">Cookpit へログインしてください。</p>
        </div>
        <LoginForm next={next ?? null} />
      </div>
    </main>
  );
}
