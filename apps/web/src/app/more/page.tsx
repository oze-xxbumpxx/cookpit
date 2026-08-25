import { MoreMenu } from './_components/more-menu';

export default function MorePage() {
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <h1 className="text-xl font-semibold text-foreground">その他</h1>
        <MoreMenu />
      </div>
    </main>
  );
}
