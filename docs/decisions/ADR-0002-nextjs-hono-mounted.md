# ADR-002: Next.js 内に Hono をマウントする

**ステータス**: 採択
**決定日**: 2026-05

## 背景

バックエンド構成として、以下の選択肢があった。

- A. Next.js 一体型（API Routes + Server Actions のみ）
- B. Next.js 内に Hono をマウント（`app/api/[[...route]]/route.ts` で Hono ルーター）
- C. 完全分離（Cloudflare Workers + Vercel）

開発者の業務スタックは「フロントとバックを分離する」思想。一方、個人開発の現実性も考慮する必要があった。

## 検討した観点

| 観点                     | A: 一体型    | B: マウント | C: 完全分離              |
| ------------------------ | ------------ | ----------- | ------------------------ |
| 学びの深さ               | 中           | 高          | 最高                     |
| 実装スピード             | 速           | 中          | 遅                       |
| Hono の RPC 型安全       | ×            | ◎           | ◎                        |
| Server Actions 活用      | ◎            | ○           | ×                        |
| 認証セッション共有の苦労 | なし         | なし        | あり                     |
| デプロイ先               | Vercel 1つ   | Vercel 1つ  | Vercel + Workers/Railway |
| 業務スタックとの近さ     | 中           | 中          | 高                       |
| 将来モバイル対応         | 切り出し必要 | API 流用可  | API 流用可               |
| 2-3ヶ月での完成          | ◎            | ○           | △                        |

## 決定

**B. Next.js 内に Hono をマウントする** 構成を採用する。

具体的には、`app/api/[[...route]]/route.ts` に Hono のルーターを配置し、Hono アプリ本体は `apps/web/server/` 配下に置く。

## 決定の理由

1. **Hono の学びを取得できる**：RPC、ミドルウェア、Zod 統合、軽量フレームワークの設計思想
2. **Server Components と Hono RPC の使い分けができる**：初期表示は Server Component で直接ユースケース呼び出し、インタラクティブな操作は Hono RPC + TanStack Query
3. **デプロイの単純化**：Vercel 1つで完結、環境変数も1箇所
4. **認証セッション共有の問題を回避**：完全分離だと cross-origin cookie の設定で詰まりやすい
5. **将来モバイル対応する場合に備える**：Hono ルーターが独立しているので、別プロジェクトに切り出せる
6. **2〜3ヶ月での完成可能性**：完全分離ほどの運用コストを払わず、学びは取得できるバランス

## 帰結

### ポジティブ

- Hono RPC による型安全な API 通信
- Vercel デプロイの摩擦ゼロ
- 業務スタックの「責務分離」思想は `packages/` 構成で別途実現できる

### ネガティブ

- 完全な「Cloudflare Workers + Hono」のエッジ構成は学べない
- Server Actions と Hono のどちらを使うか、ルール作りが必要

## フォローアップ

- Sprint 1 の早い段階で「Server Components / Server Actions / Hono RPC の使い分け方針」を実装で確認し、ドキュメント `03-architecture.md` に反映する
- Phase 2 以降、API を別クライアント（モバイル等）から使う必要が出たら、Hono ルーターの切り出しを検討する
