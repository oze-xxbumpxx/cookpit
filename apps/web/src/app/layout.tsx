import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
// 見出し用の丸ゴシック（自ホスト・日本語グリフ込み）。next/font は日本語サブセット非対応のため Fontsource を使う。
// 見出しは font-semibold（→700 にマップ）のため 700 のみ読み込む（日本語 woff2 は重いので必要最小限）。
import '@fontsource/zen-maru-gothic/japanese-700.css';
import { NavBar } from './_components/nav-bar';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Cookpit',
  description: '毎週の作り置き運用を支える献立・買い物・在庫管理アプリ',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Cookpit',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf6f0' },
    { media: '(prefers-color-scheme: dark)', color: '#221e1a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

// 保存済みテーマ（light/dark/system）を尊重しつつ、未設定/system は OS 設定に追従する。
// 描画前に実行してちらつきを防ぐ。
const themeScript =
  "try{var t=localStorage.getItem('theme');var m=window.matchMedia('(prefers-color-scheme: dark)');var a=function(){var d=t==='dark'||((t===null||t==='system')&&m.matches);document.documentElement.classList.toggle('dark',d)};a();m.addEventListener('change',function(){if(t===null||t==='system'){a()}})}catch(e){}";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
        <NavBar />
      </body>
    </html>
  );
}
