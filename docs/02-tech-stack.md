# 02. 技術スタック

## サマリ

| レイヤー           | 技術                                             | バージョン目安       |
| ------------------ | ------------------------------------------------ | -------------------- |
| フロントエンド     | Next.js (App Router) + React                     | Next.js 16, React 19 |
| バックエンド API   | Hono（Next.js 内マウント）                       | Hono 最新            |
| API 通信（型安全） | Hono RPC + TanStack Query                        | TanStack Query v5    |
| ORM                | Drizzle ORM                                      | 最新                 |
| データベース       | Neon (Serverless PostgreSQL)                     | -                    |
| 認証               | （MVP1 では未使用、Phase 2 で Better Auth 検討） | -                    |
| スタイリング       | Tailwind CSS + shadcn/ui                         | Tailwind v4          |
| クライアント状態   | Zustand                                          | 最新                 |
| バリデーション     | Zod                                              | 最新                 |
| PWA                | Serwist                                          | 最新                 |
| モノレポ           | Turborepo + pnpm workspaces                      | 最新                 |
| デプロイ           | Vercel + Neon                                    | -                    |

## 各技術の選定理由

### Next.js 16 (App Router) + React 19

業務スキル（React / TypeScript）の延長線上にあり、即戦力で使える。App Router の Server Components / Server Actions は Clean Architecture のユースケース層をサーバー側に置く思想と相性が良く、新しい学びにもなる。

ファイルベースルーティングは記述量が少なく、認知負荷が低い。

### Hono（Next.js 内マウント）

Next.js の API Routes として Hono を埋め込む構成（`app/api/[[...route]]/route.ts`）を採用する。これにより：

- Next.js のメリット（Server Components、Server Actions、ファイルベースルーティング）を維持
- Hono の学び（RPC による型安全な通信、ミドルウェア設計、軽量フレームワークの思想）を取得
- デプロイは Vercel 1つで完結（環境変数も1箇所）
- 認証セッション共有の苦労なし
- 将来モバイル対応する時は Hono ルーターを別プロジェクトに切り出せる

完全分離（Cloudflare Workers + Vercel）ではなく中庸案を選んだ理由は [ADR-002](./decisions/ADR-0002-nextjs-hono-mounted.md) に記載。

### Hono RPC + TanStack Query

Hono の型をフロントから直接インポートして、エンドポイントの URL・パラメータ・レスポンスを完全に型安全に呼び出せる。GraphQL の Apollo codegen 相当の体験を、より軽量に得られる。

```typescript
// Client 側
import { hc } from 'hono/client';
import type { AppType } from '@/server/app';

const client = hc<AppType>('/api');
const res = await client.recipes.$get(); // 型補完される
const recipes = await res.json(); // 型推論される
```

TanStack Query でサーバー状態を管理（キャッシュ、再フェッチ、楽観的更新）。

### Drizzle ORM

業務の SQL 知識を活かせる、SQL ライクな記法。エッジランタイム対応。Prisma に比べて軽量・高速・型推論が直接的。

スキーマ定義は TypeScript で記述するため、ドメインモデルとの相互変換が書きやすい。

### Neon (Serverless PostgreSQL)

業務の RDS / PostgreSQL 知識がそのまま使える。スケールゼロ機能で、使っていない時はコストゼロ。無料枠が個人利用には十分。

ブランチング機能（DB を Git のように分岐させる）が開発体験として面白い。

注意点：スケールゼロ状態からのコールドスタートで数秒の遅延が発生することがある。個人利用では実害なし。

### MVP1 では認証なし

Vercel の URL を 2 名で共有して使う運用とする。詳細は [ADR-003](./decisions/ADR-0003-no-auth-in-mvp1.md) を参照。

Phase 2 以降で Better Auth の導入を検討する。

### Tailwind CSS v4 + shadcn/ui

shadcn/ui は「コピーして所有する」コンポーネントライブラリ。デザインシステムの素振りにもなる。Tailwind は業務でも触る機会が増えており、習熟価値が高い。

### Zustand

クライアント状態管理の軽量解。ボイラープレートが最小で、サーバー状態（TanStack Query）との役割分担が明確。

### Zod

スキーマ駆動でバリデーション・型生成・パース処理を統合。Hono のバリデーションミドルウェア、フォームバリデーション、ドメイン入力検証で共通利用する。

### Serwist

`next-pwa` の後継。Next.js App Router 対応。Service Worker の設定、オフラインキャッシュ、ホーム画面追加マニフェストを統合的に扱える。

### Turborepo + pnpm workspaces

モノレポ管理。`apps/` と `packages/` の構成は業務スタックと一致。ビルドキャッシュにより高速。

## クロスプラットフォーム対応の論点

iPhone（Safari）と Android（Chrome）の両方で動かす必要があるため、PWA の差異を意識する。

| 機能               | iOS Safari                      | Android Chrome |
| ------------------ | ------------------------------- | -------------- |
| ホーム画面追加     | ◎                               | ◎              |
| フルスクリーン表示 | ◎                               | ◎              |
| オフライン動作     | ○ (50MB 制限)                   | ◎              |
| プッシュ通知       | △ (iOS 16.4+ 限定対応)          | ◎              |
| カメラアクセス     | ◎                               | ◎              |
| ローカルストレージ | ○ (7日無使用でクリアの場合あり) | ◎              |

**重要な前提**：iOS は7日間アプリを起動しないとローカルストレージがクリアされる場合がある。よって「サーバー（Neon）が真実のソース、ローカルはキャッシュ」という設計を徹底する。

MVP1 ではプッシュ通知を使わないため、両OS で機能差は出ない想定。

## デプロイ戦略

### MVP1 のデプロイ構成

```
[Vercel]
├── Next.js 16 (フロント + Hono API)
└── Serwist (PWA)
            ↓
[Neon]
└── PostgreSQL
```

### 環境

| 環境        | 用途                                     | URL            |
| ----------- | ---------------------------------------- | -------------- |
| development | ローカル開発                             | localhost:3000 |
| preview     | PR ごとの自動デプロイ（Vercel 標準機能） | 自動生成       |
| production  | 本番（2人で実利用）                      | 独自 URL       |

Neon のブランチング機能で、preview 環境ごとに DB を切り替えることも可能（Phase 2 以降で検討）。
