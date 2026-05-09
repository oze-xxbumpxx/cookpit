# Sprint 0 - 環境構築

## 概要

| 項目 | 内容 |
| --- | --- |
| 期間 | 1週間 |
| ブランチ | `chore/sprint-0-setup` |
| ステータス | 未着手 |

## 目的

開発を継続できる土台を整える。
アプリの機能は一切作らず、**「動く骨格」を Vercel 上に立てることだけ**に集中する。

## ゴール

- `pnpm dev` でローカル起動できる
- Vercel に自動デプロイされる
- DB（Neon）に接続できる（health check が DB を叩く）
- iPhone / Android 両方でホーム画面に追加できる

## タスク一覧

### 1. モノレポ初期化

- [ ] `pnpm create turbo@latest` で雛形作成
- [ ] `apps/web` に Next.js 16 を配置
- [ ] `packages/` に空パッケージを作成
  - [ ] `domain`
  - [ ] `application`
  - [ ] `infrastructure`
  - [ ] `api-contract`
  - [ ] `ui`
  - [ ] `config`

### 2. Next.js 16 セットアップ

- [ ] App Router 設定
- [ ] TypeScript strict mode 設定
- [ ] ESLint + Prettier 設定

### 3. Tailwind CSS v4 + shadcn/ui

- [ ] Tailwind v4 セットアップ
- [ ] shadcn/ui 初期化
- [ ] `Button` `Card` の動作確認

### 4. Hono マウント

- [ ] `app/api/[[...route]]/route.ts` に Hono ルーターを配置
- [ ] `/api/health` エンドポイントを作成
- [ ] Hono RPC クライアントの動作確認

### 5. Drizzle + Neon 接続

- [ ] Neon プロジェクト作成（無料枠）
- [ ] Drizzle ORM セットアップ
- [ ] 接続テスト用の最小スキーマでマイグレーション実行
- [ ] `/api/health` から DB を叩いて接続確認

### 6. PWA セットアップ（Serwist）

- [ ] `manifest.ts` 設定
- [ ] アイコン生成
- [ ] Service Worker 登録
- [ ] iPhone と Android で「ホーム画面に追加」を実機確認

### 7. Vercel デプロイ

- [ ] GitHub リポジトリと Vercel を連携
- [ ] 環境変数設定（`DATABASE_URL`）
- [ ] 本番デプロイ確認

## 完了条件

- [ ] `pnpm dev` でローカル起動できる
- [ ] Vercel に push で自動デプロイされる
- [ ] `/api/health` が DB に接続して 200 を返す
- [ ] iPhone / Android 両方でホーム画面に追加できる

## リスクと対策

| リスク | 対策 |
| --- | --- |
| Turborepo の設定でハマる | 公式テンプレートをベースにして最小構成から始める |
| Tailwind v4 の breaking changes | Perplexity で最新セットアップ手順を事前確認する |
| Serwist の iOS 対応で詰まる | PWA は最後にまわし、他が完了してから着手する |
| 1週間で終わらない | PWA（タスク6）を次 Sprint 頭に持ち越す妥協ラインを設ける |

## 作業ログ

| 日付 | やったこと |
| --- | --- |
| | |
