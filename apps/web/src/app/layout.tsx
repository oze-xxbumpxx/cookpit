import type { Metadata, Viewport } from 'next';
// 丸ゴシック（自ホスト・日本語グリフ込み）を本文・見出し共通のアプリフォントにする。
// next/font は日本語サブセット非対応のため、Fontsource のフォントを自前でサブセット化して使う。
// Fontsource の japanese サブセットをそのまま読むと 3 ウェイトで 4.40MB あり、描画後の
// 大規模な再レイアウトの主因になっていた（scripts/subset-fonts.mjs が fonts.css を生成する）。
// 本文=400 / font-medium=500 / 見出し・font-semibold/bold=700 をカバーする最小限の重みだけ読み込む。
import './fonts.css';
import { NavBar } from './_components/nav-bar';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cookpit',
  description: '毎週の作り置き運用を支える献立・買い物・在庫管理アプリ',
  // iOS ホーム画面（apple-touch-icon）とブラウザタブのアイコンを既存 PWA アイコンに解決させる。
  // manifest の icons は Android 側。iOS はこの apple-touch-icon を参照する。
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192x192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/icons/icon-192x192.png',
  },
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
  // iOS で env(safe-area-inset-*) を有効化する。これがないとホームバー分の余白が 0 になり、
  // ボトムナビが画面最下端に張り付いてタップしづらくなる。
  viewportFit: 'cover',
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
    <html lang="ja" suppressHydrationWarning className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
        <NavBar />
      </body>
    </html>
  );
}
