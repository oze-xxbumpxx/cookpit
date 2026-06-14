# ルール: Presentation 層（apps/web）

適用範囲: `apps/web/`（Next.js App Router + 内マウントの Hono）。
出典: `docs/03-architecture.md`。

## サーバーサイド呼び出しの使い分け

| ユースケース | 採用方法 |
| --- | --- |
| 初期表示（SEO・初回ロード高速化） | A: Server Component から直接 UseCase 呼び出し |
| 一覧の再フェッチ・ページネーション | B: Hono RPC + TanStack Query |
| フォーム送信（楽観的更新したい） | B: Hono RPC + TanStack Query |
| ステータス変更などのアクション | B: Hono RPC + TanStack Query |
| Server Component から直接書き込み | A: Server Action として |

基本方針：
- **読み取り**は初期表示を Server Component、その後の操作は Hono RPC に切り替え。
- **書き込み**は基本 Hono RPC（楽観的更新を効かせやすい）。

## 層の責務

- Presentation 層は UseCase を呼ぶだけ。ドメインロジックを Presentation に書かない。
- Hono ルートの型はフロントから `import type` で取り込み、型安全に呼び出す（Hono RPC）。
- UseCase の組み立て（手動 DI）は呼び出し側（Server Component / ルート）で行う。

## バリデーション

- 入出力スキーマは Zod（`packages/api-contract`）で定義し、API 契約として共有する。
