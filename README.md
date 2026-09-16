# Cookpit

毎週の作り置き運用を支える、献立・買い物・在庫管理の Web アプリ。

紙のレシピブックの限界、複数店舗の価格比較の手間、在庫の見える化という日常の困りごとを、
Clean Architecture + DDD の実践と両立させて解決する**個人開発プロジェクト**です。

## このリポジトリについて

**ソースコードは公開する前提ですが、アプリ自体は不特定多数へ提供しません。**
利用者は開発者本人とパートナーの 2 名のみで、本番デプロイは Basic 認証で保護します。
経緯は [ADR-0021](./docs/decisions/ADR-0021-basic-auth-for-public-repository.md) を参照してください。

公開の目的は、Clean Architecture + DDD のモノレポ構成と、Claude Code を中心とした
AI 支援開発のワークフロー（`.claude/` と `docs/claude-code/`）を、実例として残すことです。

## 技術スタック

| レイヤー         | 技術                                        |
| ---------------- | ------------------------------------------- |
| フロントエンド   | Next.js 16 (App Router) + React 19          |
| バックエンド API | Hono（Next.js 内にマウント）                |
| API 通信         | Hono RPC（型安全）                          |
| ORM / DB         | Drizzle ORM + Neon (Serverless PostgreSQL)  |
| バリデーション   | Zod（`packages/api-contract` で契約を共有） |
| スタイリング     | Tailwind CSS v4 + shadcn/ui                 |
| PWA              | Serwist                                     |
| テスト           | Vitest（全層）+ Playwright（E2E スモーク）  |
| モノレポ         | Turborepo + pnpm workspaces                 |
| デプロイ         | Vercel                                      |

選定理由は [docs/02-tech-stack.md](./docs/02-tech-stack.md) にあります。

## アーキテクチャ

依存方向は `Presentation → Application → Domain ← Infrastructure` の一方向です。
`packages/domain` は他のどのパッケージにも依存しません。

```
apps/
  web/                  Next.js App Router + 内マウントの Hono（Presentation）
packages/
  domain/               Entity / Value Object / Repository インターフェース
  application/          UseCase / DTO
  infrastructure/       Drizzle による Repository 実装・DB スキーマ
  api-contract/         Zod スキーマ（API 契約）
  config/               共有設定
```

詳細は [docs/03-architecture.md](./docs/03-architecture.md)、
ドメインモデルは [docs/04-domain-model.md](./docs/04-domain-model.md) を参照してください。

## ローカルでの動かし方

前提: Node.js 20 以上 / pnpm 10 以上。

```bash
pnpm install

# DB を用意せずに動かす場合（PGlite をローカルに生成して起動）
pnpm --filter @cookpit/web dev:pglite

# Neon など実 PostgreSQL を使う場合
cp apps/web/.env.example apps/web/.env   # DATABASE_URL を設定する
pnpm dev
```

`BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` は未設定でも開発時は認証がスキップされるため、
ローカル開発で設定する必要はありません。設定した場合は `pnpm dev` でも Basic 認証が掛かります
（Playwright E2E は同じ変数から資格情報を自動で渡します）。本番相当（`NODE_ENV=production`）で
未設定の場合は fail-closed で 503 を返します。

### 品質ゲート

```bash
pnpm lint
pnpm type-check
pnpm test          # Vitest
pnpm build
```

## ドキュメント

| 場所                                     | 内容                                                             |
| ---------------------------------------- | ---------------------------------------------------------------- |
| [docs/](./docs/)                         | 概要・技術スタック・アーキテクチャ・ドメインモデル・ロードマップ |
| [docs/decisions/](./docs/decisions/)     | ADR（アーキテクチャ意思決定記録）                                |
| [docs/designs/](./docs/designs/)         | 機能ごとの設計書                                                 |
| [docs/claude-code/](./docs/claude-code/) | AI 支援開発のワークフロー・Agent 責務・改善サイクル              |
| [.claude/](./.claude/)                   | Claude Code の Agent 定義・Skill・Hook・Rule                     |
| [logs/](./logs/)                         | 日次の作業ログ                                                   |

## ライセンス

**ライセンスを設定していません。** したがって著作権法上の全権利を留保します。
閲覧と参考にしていただくのは歓迎しますが、複製・改変・再配布・商用利用の許諾はしていません。

利用をご希望の場合は Issue でご相談ください。

## コントリビューション

個人の家庭内利用を目的としたプロジェクトのため、機能追加の Pull Request は受け付けていません。
バグや気づいた点の Issue は歓迎します。
