# Sprint 0 - 環境構築

## 概要

| 項目 | 内容 |
| --- | --- |
| 期間 | 1週間（実績：2026-05-09 単日完了） |
| ブランチ | `main`（初回は直 push） |
| ステータス | ✅ 完了 |

## 目的

開発を継続できる土台を整える。
アプリの機能は一切作らず、**「動く骨格」を Vercel 上に立てることだけ**に集中する。

## ゴール

- [x] `pnpm dev` でローカル起動できる
- [x] Vercel に自動デプロイされる
- [x] DB（Neon）に接続できる（health check が DB を叩く）
- [ ] iPhone / Android 両方でホーム画面に追加できる（実機確認は次回）

## タスク一覧

### 1. モノレポ初期化

- [x] Turborepo 手動セットアップ（create-turbo は既存ファイルと競合のため）
- [x] `apps/web` に Next.js 16 を配置
- [x] `packages/` に空パッケージを作成
  - [x] `domain`
  - [x] `application`
  - [x] `infrastructure`
  - [x] `api-contract`
  - [x] `ui`
  - [x] `config`

### 2. Next.js 16 セットアップ

- [x] App Router 設定
- [x] TypeScript strict mode 設定
- [x] ESLint 設定（Next.js 標準）

### 3. Tailwind CSS v4 + shadcn/ui

- [x] Tailwind v4 セットアップ
- [x] shadcn/ui 初期化（Button コンポーネント生成確認）

### 4. Hono マウント

- [x] `app/api/[[...route]]/route.ts` に Hono ルーターを配置
- [x] `/api/health` エンドポイントを作成
- [x] Hono RPC クライアント（`src/lib/api-client.ts`）を作成

### 5. Drizzle + Neon 接続

- [x] Neon プロジェクト作成（無料枠・ap-southeast-1・PostgreSQL 16）
- [x] Drizzle ORM セットアップ
- [x] `/api/health` から DB を叩いて接続確認（`"db":"connected"` を確認）

### 6. PWA セットアップ（Serwist）

- [x] `manifest.ts` 設定
- [x] アイコン生成（512x512・192x192 プレースホルダー）
- [x] Service Worker 登録（`sw.ts` → `public/sw.js` 生成確認）
- [ ] iPhone / Android で「ホーム画面に追加」を実機確認（次回持ち越し）

### 7. Vercel デプロイ

- [x] GitHub リポジトリと Vercel を連携
- [x] 環境変数設定（`DATABASE_URL`）
- [x] 本番デプロイ確認（`/api/health` が `"db":"connected"` を返す）

## 完了条件

- [x] `pnpm dev` でローカル起動できる
- [x] Vercel に push で自動デプロイされる
- [x] `/api/health` が DB に接続して 200 を返す
- [ ] iPhone / Android 両方でホーム画面に追加できる（Sprint 1 中に確認）

## 学びと気づき

| 項目 | 内容 |
| --- | --- |
| Turborepo | `create-turbo` は既存ファイルがあると失敗。手動セットアップで問題なく動く |
| Next.js 16 | デフォルトで Turbopack が有効。Serwist と競合するためビルドは `--webpack` フラグが必要 |
| Serwist | 開発時は `disable: process.env.NODE_ENV !== 'production'` で Turbopack との競合を回避 |
| Neon | コールドスタート時に数秒の遅延あり（初回 health check が 1 秒以上かかった）。個人利用では問題なし |

## 作業ログ

| 日付 | やったこと |
| --- | --- |
| 2026-05-09 | Sprint 0 全タスク完了。ドキュメント整備 → 環境構築 → Vercel デプロイまで一気通貫 |
