import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Cookpit',
    short_name: 'Cookpit',
    description: '毎週の作り置き運用を支える献立・買い物・在庫管理アプリ',
    lang: 'ja',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // アプリのデザイントークン（globals.css の light --background）に合わせる。
    // splash / status bar が白から生成されると初回起動時にちらつくため。
    background_color: '#faf6f0',
    theme_color: '#faf6f0',
    orientation: 'portrait',
    icons: [
      // アイコンはクリーム地 × テラコッタ（brand primary）の湯気立つ両手鍋。フルブリード
      // （角丸・縁まで到達）で中央の鍋+湯気は maskable セーフゾーン内に収まる。any / maskable
      // 両文脈で使えるよう、同一アセットを両 purpose で宣言する（Next の型は purpose 単一値のみ
      // 許可のため別エントリ化）。ソースは public/icons/icon.svg。
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
