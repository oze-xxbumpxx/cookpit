# 設計書: better-auth-login

- ステータス: draft（Gate A 承認待ち）
- レベル: L3
- 作成日: 2026-09-17
- 関連: `docs/requirements/better-auth-login.md` /
  `docs/decisions/ADR-0022-better-auth-login.md`（草案）/
  `docs/decisions/ADR-0021-basic-auth-for-public-repository.md`（置換対象）/
  `docs/decisions/ADR-0004-no-user-in-domain.md`（維持）/
  `docs/decisions/ADR-0010-package-public-boundary.md` /
  `docs/decisions/ADR-0002-nextjs-hono-mounted.md` /
  `docs/decisions/ADR-0020-tx-connection-per-request.md`

## 背景

要件定義書「背景」参照。要点: ADR-0021 の Basic 認証は公開前の暫定策であり、ログアウト不可・
Service Worker 経由 401 の行き止まり・CSRF（ambient authority）・総当たり対策なし・通知
クリック起動時の再認証という残存リスクを自ら記録している。ユーザーは Better Auth の
email + password（第一段）とパスキー（第二段）の二段構えへの置換を確定した。

## 目的

Basic 認証を Better Auth のログイン画面と Cookie セッション認証へ置き換え、上記の残存
リスクを構造的に解消する。ドメイン層には触れず（ADR-0004 維持）、追加費用ゼロを保ち、
第二段（パスキー）を阻害しない土台を作る。

## 要件

要件定義書の F-01〜F-17 / N-01〜N-13 / E-01〜E-12 / B-01〜B-09 を満たす。ユーザー確定事項
U-1〜U-7 は設計で覆さない。

## 対象範囲

| 区分 | パス                                                                                 | 内容                                                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 変更 | `apps/web/src/proxy.ts`                                                              | Basic 認証 → セッション検証（D-3）                                                                                                                                                      |
| 置換 | `apps/web/tests/proxy.node.test.ts`                                                  | Proxy テスト（§テスト方針）                                                                                                                                                             |
| 新規 | `apps/web/src/server/auth/create-auth.ts`                                            | `createAuth()` ファクトリ（env を読まない純粋関数。D-1）                                                                                                                                |
| 新規 | `apps/web/src/server/auth/index.ts`                                                  | `getAuth()` 遅延シングルトン + `isAuthConfigured()`（D-1）                                                                                                                              |
| 新規 | `apps/web/src/server/auth/cli.config.ts`                                             | `@better-auth/cli generate` 用の設定エントリ（D-6）                                                                                                                                     |
| 変更 | `apps/web/src/server/app.ts`                                                         | `/auth/*` マウント（D-2）                                                                                                                                                               |
| 新規 | `packages/infrastructure/src/db/auth-schema.ts`                                      | CLI 生成の Drizzle スキーマ（D-6）                                                                                                                                                      |
| 変更 | `packages/infrastructure/src/index.ts`                                               | `export * as authSchema`（D-6）                                                                                                                                                         |
| 変更 | `apps/web/drizzle.config.ts`                                                         | `schema` を配列に（D-6）                                                                                                                                                                |
| 新規 | `apps/web/src/db/migrations/0010_*.sql`                                              | Better Auth テーブル追加（D-6）                                                                                                                                                         |
| 新規 | `apps/web/src/lib/auth-client.ts`                                                    | `createAuthClient`（D-7）                                                                                                                                                               |
| 変更 | `apps/web/src/lib/use-api-action.ts`                                                 | 401 → `/login?next=`（D-8）                                                                                                                                                             |
| 新規 | `apps/web/src/app/login/page.tsx` + `_components/login-form.tsx`                     | ログイン画面（D-7）                                                                                                                                                                     |
| 変更 | `apps/web/src/app/more/page.tsx` + `_components/more-menu.tsx`                       | 表示名・アカウント・ログアウト（D-7）                                                                                                                                                   |
| 新規 | `apps/web/src/app/more/account/page.tsx` + `_components/*`                           | アカウント設定（D-7）                                                                                                                                                                   |
| 変更 | `apps/web/src/app/_components/nav-bar.tsx`                                           | `/login` で非表示（D-7）                                                                                                                                                                |
| 変更 | `apps/web/src/app/sw.ts`                                                             | リダイレクト応答を cache しない（D-9）                                                                                                                                                  |
| 新規 | `apps/web/src/app/_utils/sw-cache-plugins.ts`                                        | `cacheWillUpdate` の純関数（D-9。`sw.ts` は `__SW_MANIFEST` 依存で単体テストから import できないため切り出す。既存の `_utils/` ヘルパーと同じ置き場。Orchestrator 統合判断 2026-09-17） |
| 新規 | `apps/web/scripts/auth-create-user.ts` / `auth-set-password.ts`                      | アカウント発行・再設定（D-10）                                                                                                                                                          |
| 変更 | `apps/web/package.json`                                                              | `better-auth` 追加、`tsx`（dev）追加、`auth:*` scripts                                                                                                                                  |
| 変更 | `apps/web/.env.example` / `apps/web/playwright.config.ts` / `apps/web/e2e/README.md` | env・E2E（D-15）                                                                                                                                                                        |
| 変更 | `docs/01-overview.md` / `02-tech-stack.md` / `03-architecture.md` / ADR-0021         | 記述更新（§ドキュメント更新）                                                                                                                                                           |

`packages/domain` / `packages/application` / `packages/api-contract` は変更しない。

## 対象外

要件定義書「対象外」のとおり。特に: 第二段の実装、`createdBy` のドメイン導入、
`push_subscriptions` のユーザー紐づけ、メール送信、OAuth、ロール。

## 現状構成

```
apps/web/src/
  proxy.ts                       # Basic 認証（BASIC_AUTH_USER / PASSWORD）。matcher で静的・cron を除外
  app/api/[[...route]]/route.ts  # hono/vercel の catch-all。GET/POST/PUT/PATCH/DELETE を export
  server/app.ts                  # new Hono().basePath('/api')。routes チェーンが AppType
  server/repositories.ts         # 手動 DI（import 'server-only'）
  db/client.ts                   # getDb()（neon-http。DATABASE_URL=pglite:// なら dev PGlite）
  app/sw.ts                      # Serwist。/shopping-lists* navigation と一部 API が NetworkFirst
  app/more/                      # 「その他」: レシピ / 商品 の 2 リンクのみ
  app/layout.tsx                 # NavBar を全ページに描画
  lib/use-api-action.ts          # !ok → 「操作に失敗しました。」（401 の特別扱い無し）
packages/infrastructure/src/db/
  schema.ts                      # 全テーブル（snake_case 列・複数形テーブル）
apps/web/drizzle.config.ts       # schema: '../../packages/infrastructure/src/db/schema.ts'（単一文字列）
apps/web/tests/e2e/              # Playwright スモーク 2 本（CI で必ず実行。pnpm dev = NODE_ENV=development）
```

「ログインユーザー」の概念はどの層にも無い（ADR-0004）。

## 変更後構成

```
apps/web/src/
  proxy.ts                       # セッション検証（D-3）。/login と /api/auth/* を公開
  server/
    app.ts                       # app.on(['GET','POST'], '/auth/*', c => getAuth().handler(c.req.raw))
    auth/
      create-auth.ts             # createAuth(options): betterAuth({...})。env を読まない
      index.ts                   # import 'server-only'; getAuth() / isAuthConfigured()
      cli.config.ts              # CLI generate 用（server-only を import しない）
  lib/
    auth-client.ts               # createAuthClient({ basePath: '/api/auth' })
    use-api-action.ts            # 401 → window.location.assign('/login?next=...')
  app/
    login/page.tsx               # 薄い Server Component（NavBar 非表示・フォーム配置）
    login/_components/login-form.tsx
    more/page.tsx                # 表示名 + MoreMenu（アカウント / ログアウト）
    more/account/page.tsx        # セッション表示・パスワード変更・他端末失効（第二段でパスキー UI）
    more/account/_components/change-password-form.tsx / revoke-other-sessions-button.tsx
    more/_components/logout-button.tsx
    sw.ts                        # cacheWillUpdate で redirected / 非 200 を弾く
  scripts/
    auth-create-user.ts / auth-set-password.ts
packages/infrastructure/src/db/
  schema.ts                      # 変更なし
  auth-schema.ts                 # 新規（CLI 生成）。index.ts から `authSchema` として公開
```

依存方向: `apps/web → better-auth`、`apps/web → @cookpit/infrastructure（authSchema）`。
`packages/domain` / `packages/application` は Better Auth を知らない。
`packages/infrastructure` も `better-auth` に依存しない（Drizzle テーブル定義のみ持つ）。

## 設計判断一覧（12 論点との対応）

| D    | 論点             | 決定（推奨）                                                                                                                                                                                                                                |
| ---- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1  | 1 層配置         | auth インスタンスは `apps/web/src/server/auth/`（composition root）。Drizzle スキーマは `packages/infrastructure/src/db/auth-schema.ts`。Gate A 質問 1                                                                                      |
| D-2  | Hono マウント    | Hono に `/auth/*` をマウント（`toNextJsHandler` は不採用）                                                                                                                                                                                  |
| D-3  | 2 Proxy          | Proxy で `auth.api.getSession` により完全検証。未認証: 画面 302 `/login?next=`、`/api/*` 401 JSON。fail-closed 503。Gate A 質問 2                                                                                                           |
| D-4  | 7 セッション     | `expiresIn` 30 日 / `updateAge` 1 日 / `cookieCache` 有効・`maxAge` 5 分 / `SameSite=Lax`                                                                                                                                                   |
| D-5  | 7 総当たり       | Better Auth 組み込み `rateLimit`、`storage: 'database'`（要検証。不可なら memory を受容）。閾値は Better Auth 既定（全体 100 req/60 s、`/sign-in/email` 3 req/10 s）を採用し `customRules` は設定しない（Orchestrator 統合判断 2026-09-17） |
| D-6  | 9 DB             | 別ファイル `auth-schema.ts`、テーブル名複数形（`usePlural: true`）、CLI 生成 → `drizzle-kit generate` → `migrate`。既存テーブル変更なし                                                                                                     |
| D-7  | 5 画面           | `/login`（Client フォーム）、`/more` にログアウト、`/more/account` にパスワード変更・他端末失効。NavBar は `/login` で非表示                                                                                                                |
| D-8  | 5 401 回復       | `useApiAction` が 401 を検知したら `/login?next=<現在>` へフルナビゲーション                                                                                                                                                                |
| D-9  | 4 SW             | `NetworkFirst` 2 件に `cacheWillUpdate`（`redirected` / 非 200 は cache しない）。`/login` `/api/auth/*` は runtimeCaching 対象外。ログアウトで runtime cache 破棄                                                                          |
| D-10 | 6 スクリプト     | `tsx` で TS スクリプトを実行。発行は別設定 `createAuth({ allowSignUp: true })` + `auth.api.signUpEmail`。再設定は `auth.$context` の内部アダプタ（フォールバック併記）                                                                      |
| D-11 | 3 移行           | 一括切替。同一 PR で Basic 認証コード削除。`BASIC_AUTH_*` 環境変数は実機確認完了まで残す（ロールバック用）。Gate A 質問 3                                                                                                                   |
| D-12 | 8 Preview        | `BETTER_AUTH_URL` は本番のみ明示。Preview は推定に委ね、`trustedOrigins` を `VERCEL_URL` / `VERCEL_BRANCH_URL` から組む。Preview 用の別 secret                                                                                              |
| D-13 | 11 第二段        | §第二段（パスキー）設計。`passkeys` テーブルの migration は第二段で作る（第一段では作らない）                                                                                                                                               |
| D-14 | ログ             | 503 のみ `console.error`。資格情報・メールはログしない                                                                                                                                                                                      |
| D-15 | 12 E2E / CI      | `NODE_ENV!=production` × secret 未設定はスキップ（現行規約を踏襲）。ログイン E2E は資格情報 env があるときだけ実行                                                                                                                          |
| D-16 | 5 表示名         | Better Auth `users.name` を使う。`/more` と `/more/account` に Server Component で表示                                                                                                                                                      |
| D-17 | 1 依存の閉じ込め | `packages/domain` / `packages/application` / `api-contract` に差分ゼロ。`packages/infrastructure` は `better-auth` に依存しない                                                                                                             |
| D-18 | 10 DB 接続       | 認証は `getDb()`（neon-http）上で動かす。アダプタがトランザクションを要求するなら `transaction` 無効化 → 不可なら WebSocket 接続に切替（要検証）                                                                                            |
| D-19 | ドキュメント     | ADR-0021 Status 更新、01/02/03 の記述更新は実装 PR に含める                                                                                                                                                                                 |

## データフロー

### DF-1 未認証の画面ナビゲーション

```
GET /pantry（Cookie 無し or 無効）
  → proxy.ts（matcher 該当）
     1. isAuthConfigured()? 否 かつ production → 503。否 かつ非 production → next()
     2. getSessionCookie(request) が null → 検証せず即 302 /login?next=/pantry
        非 null → getAuth().api.getSession({ headers, returnHeaders: true })
           - Cookie キャッシュ有効（署名一致・maxAge 内）→ DB なしで session を得る
           - キャッシュ失効 → sessions JOIN users を 1 クエリ（neon-http）。有効なら
             session_data Cookie を再発行（Set-Cookie を next() の応答へ転送）
     3. session null → 302 Location: /login?next=%2Fpantry（`_rsc` は除去）
  → ブラウザが /login を表示
```

### DF-2 ログイン

```
/login?next=/pantry（Client Component）
  → authClient.signIn.email({ email, password })
  → POST /api/auth/sign-in/email（Proxy の matcher 除外。Better Auth が Origin を検査）
  → Hono app.on('/auth/*') → getAuth().handler(c.req.raw)
  → Better Auth: users/accounts を照会 → scrypt 検証 → sessions に 1 行 INSERT
     → Set-Cookie: session_token（署名付き）+ session_data（Cookie キャッシュ）
  → 成功: window.location.assign(safeNext('/pantry'))（フルナビゲーションで SSR を確実に再実行）
     失敗: 401/403 → 「メールアドレスまたはパスワードが違います」/ 429 → 試行過多の文言
```

### DF-3 認証済みリクエスト（通常）

```
GET /shopping-lists/abc（Cookie あり）
  → proxy.ts: getSession → Cookie キャッシュで即通過（DB なし）→ next()
  → Server Component が UseCase を呼び SSR（方式 A。既存どおり。session は使わない）
POST /api/shopping-lists/abc/items（Client → Hono RPC）
  → proxy.ts: 同上 → next() → Hono ルート（既存どおり。session は使わない）
```

### DF-4 セッション失効中の API 呼び出し（D-8）

```
Client: client.api.pantry.$post(...)
  → proxy.ts: session null かつ /api/* → 401 { error: 'Unauthorized' }
  → useApiAction: status === 401 → window.location.assign('/login?next=' + encode(現在の pathname+search))
```

### DF-5 ログアウト（D-7 / D-9）

```
/more「ログアウト」
  → authClient.signOut()（POST /api/auth/sign-out。sessions の該当行を DELETE、Cookie を消す）
  → caches.keys() の 'shopping-list-detail-cache' / 'shopping-lists-pages-cache' / 'stores-cache' を delete（失敗は無視）
  → window.location.assign('/login')
```

### DF-6 アカウント発行（D-10）

```
DATABASE_URL=<Neon> AUTH_USER_EMAIL=a@example.com AUTH_USER_NAME=太郎 pnpm --filter @cookpit/web auth:create-user
  → パスワードは AUTH_USER_PASSWORD env、無ければ対話入力（TTY 時のみ・エコー無し）
  → createAuth({ db, secret: 任意, allowSignUp: true, autoSignIn: false, rateLimitStorage: 'memory' })
  → auth.api.signUpEmail({ body: { email, password, name } })
  → users + accounts(providerId='credential', password=scrypt) を作成
  → 既存 email → Better Auth のエラー → exit 1
```

## API 設計

### Hono マウント（D-2）

```ts
// apps/web/src/server/app.ts（概念）
export const app = new Hono().basePath('/api');
// AppType（routes チェーン）に混ぜない。auth のルート型は RPC クライアントに不要。
app.on(['GET', 'POST'], '/auth/*', (c) => getAuth().handler(c.req.raw));
export const routes = app.route('/health', healthRoute); /* ...既存... */
```

- `basePath('/api')` + `/auth/*` = `/api/auth/*` で、Better Auth 既定の `basePath` と一致する。
- `hono/vercel` の `handle(app)` は GET / POST を export 済み。Better Auth は GET / POST のみ
  使うため `route.ts` は変更しない。
- `app.onError` は Better Auth を経由しない（`handler` は例外を投げず Response を返す）。
- **`toNextJsHandler` を採らない理由**: `app/api/auth/[...all]/route.ts` を別に置くと API の
  入口が 2 本になり ADR-0002（Hono 一本マウント）と `app.request()` によるテストの一貫性を
  崩す。Next.js のルーティング上は specific route が catch-all に勝つので動作はするが、
  利点は `nextCookies()` との親和性だけで、本設計は Server Action から Cookie を書かないため
  不要。

### Proxy の応答規約（D-3）

| 条件                                                | 応答                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` 未設定 × `NODE_ENV=production` | `503`、本文なし、`Cache-Control: no-store`、`console.error`（資格情報は出さない）     |
| 同 × production 以外                                | `next()`（認証スキップ。CI E2E / `pnpm dev`）                                         |
| `/login` × セッション有効                           | `302 Location: /`、`Cache-Control: no-store`（契約書 §11-4）                          |
| `/login` × セッション無し                           | `next()`                                                                              |
| 保護パス × セッション有効                           | `next()`。`getSession` が返した `Set-Cookie` を応答へ転送                             |
| 保護パス（非 `/api/`）× セッション無し              | `302 Location: /login?next=<pathname+search（_rsc 除去）>`、`Cache-Control: no-store` |
| `/api/*` × セッション無し                           | `401 { "error": "Unauthorized" }`、`Cache-Control: no-store`                          |
| DB 到達不能で検証不能                               | 例外 → Next.js 既定の 500（通さない）                                                 |

`matcher`（現行に `api/auth/` を追加。セグメント境界の規約は維持）:

```ts
export const config = {
  matcher: [
    '/((?!(?:favicon\\.ico|manifest\\.webmanifest|sw\\.js)$|_next/static/|icons/|api/cron/|api/auth/).*)',
  ],
};
```

`/login` は matcher から除外しない（ログイン済みなら `/` へ返すため Proxy を通す）。

### Better Auth の使用エンドポイント（第一段）

| 経路                                   | 呼び出し元                                              | 用途                                                     |
| -------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| `POST /api/auth/sign-in/email`         | `authClient.signIn.email`                               | ログイン                                                 |
| `POST /api/auth/sign-out`              | `authClient.signOut`                                    | ログアウト                                               |
| `POST /api/auth/change-password`       | `authClient.changePassword`                             | パスワード変更（`revokeOtherSessions: true` オプション） |
| `POST /api/auth/revoke-other-sessions` | `authClient.revokeOtherSessions`                        | 他端末失効                                               |
| `GET /api/auth/get-session`            | （使わない。Server Component は `auth.api.getSession`） | -                                                        |
| `GET /api/auth/ok`                     | テスト（疎通）                                          | マウント確認                                             |
| `POST /api/auth/sign-up/email`         | スクリプトのみ（HTTP では閉鎖）                         | 発行                                                     |

サーバー内呼び出し: Proxy と Server Component は `getAuth().api.getSession({ headers })`。
セッション情報を Application 層へ渡すことはしない（U-1）。

## DB 設計

### 追加テーブル（骨子。列名・casing は contract-designer が CLI 出力を基に確定）

| テーブル        | 主な列                                                                                                                             | 備考                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `users`         | `id` PK, `name`, `email` UNIQUE, `email_verified`, `image`, `created_at`, `updated_at`                                             | Better Auth 所有。ドメインの集約ではない                               |
| `sessions`      | `id` PK, `token` UNIQUE, `user_id` FK→users(cascade), `expires_at`, `ip_address`, `user_agent`, `created_at`, `updated_at`         | Cookie の `session_token` はこの `token` の署名付き値                  |
| `accounts`      | `id` PK, `user_id` FK→users(cascade), `account_id`, `provider_id`(`'credential'`), `password`(scrypt), OAuth 用の token 列群, 日時 | OAuth 列は未使用のまま残す（CLI 生成物を手で削らない）                 |
| `verifications` | `id` PK, `identifier`, `value`, `expires_at`, 日時                                                                                 | 第一段では未使用（メール検証・リセット未導入）。必須テーブルのため作る |
| `rate_limits`   | `key` PK, `count`, `last_request`                                                                                                  | D-5 で `storage: 'database'` を採る場合のみ                            |
| `passkeys`      | （第二段で追加）                                                                                                                   | D-13。第一段の migration には含めない                                  |

- テーブル名は `usePlural: true` で複数形にする（既存 `recipes` 等と揃える。単数形 `user` は
  PostgreSQL の予約語で手書き SQL のたびに引用符が要る）。
- 列名の casing は CLI 出力に従う。既存テーブルの snake_case と混在する場合でも、Better Auth
  所有テーブルは別ファイルに隔離しているため許容する（揃えるなら adapter の列マッピングが
  要り、第二段の再生成で毎回手直しになる）。
- インデックス: `users.email` UNIQUE、`sessions.token` UNIQUE、`sessions.user_id`、
  `accounts.user_id`、`rate_limits.key` PK。CLI が生成しないものは contract-designer が追加を
  判断する（§性能）。
- ID 生成は Better Auth 既定（`generateId`）に任せる。既存テーブルの UUID と形式が違うが
  相互参照が無いため問題ない（揃えたければ `advanced.database.generateId` で `crypto.randomUUID`）。

### 生成・適用手順（D-6）

1. `apps/web/src/server/auth/cli.config.ts` を用意する（`createAuth()` に `.env.local` の
   `DATABASE_URL` から作った `createDb()` を渡す。**`server-only` を import しない**。
   `drizzle.config.ts` と同じ `process.loadEnvFile` の作法）。
2. `pnpm dlx @better-auth/cli@1.4.21 generate --config src/server/auth/cli.config.ts --output ../../packages/infrastructure/src/db/auth-schema.ts`
   （apps/web で実行。コマンドの正確なフラグは実装時に `--help` で確認）。
3. `packages/infrastructure/src/index.ts` に `export * as authSchema from './db/auth-schema';` を追加
   （`schema` と同じ namespace export の作法）。
4. `apps/web/drizzle.config.ts` の `schema` を配列にする:
   `['../../packages/infrastructure/src/db/schema.ts', '../../packages/infrastructure/src/db/auth-schema.ts']`
   （drizzle-kit の `Config.schema` は `string | string[]`。確認推奨）。
5. `pnpm --filter @cookpit/web db:generate` → `0010_*.sql` を確認（既存テーブルへの差分が
   **ゼロ**であることを必ず目視）→ `db:migrate`。
6. dev PGlite（`scripts/setup-pglite-dev.mjs`）は journal を読んで適用するため追加作業なし。
   CI の E2E（Neon 経路）は `db:migrate` を実行するため、PR の CI が本番 Neon に適用する
   （既存の運用どおり。§移行とリリースの順序に影響）。

### PGlite での扱い

- `packages/infrastructure/tests/testing/create-test-db.ts` の手書き DDL は Repository テスト
  用で、認証テーブルを含めない（Repository は認証を知らない）。infrastructure 側に認証
  テストは置かない。
- Better Auth アダプタの疎通テストは `apps/web/tests/server/auth/` に置き、PGlite に
  `apps/web/src/db/migrations/*.sql` を journal 順に流して（`setup-pglite-dev.mjs` と同じ
  ロジックをテストヘルパー化）`createAuth({ db: drizzle(pglite) })` で `signUpEmail` →
  `signInEmail` を確認する。**`drizzle-orm/pglite` 上でアダプタが動くかは要検証**
  （`provider: 'pg'` はダイアレクト指定でありドライバ非依存の想定。動かなければこの
  テストは Neon 限定の手動確認に格下げする）。

## 契約骨子（contract-designer が確定）

詳細は [better-auth-login.contract.md](./better-auth-login.contract.md)（contract-designer 確定・2026-09-17）を正典とする。architecture-designer が固定した骨子は次のとおり。

- **環境変数**: `BETTER_AUTH_SECRET`（必須。32 バイト以上。Preview と Production で別値）、
  `BETTER_AUTH_URL`（Production のみ `https://cookpit-web.vercel.app`。Preview / local は未設定）。
  削除: `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`。
- **Cookie**: 名前は Better Auth 規約（`<prefix>.session_token` / `<prefix>.session_data`。
  HTTPS では `__Secure-` が付く）。`prefix` は `cookpit` を提案（`advanced.cookiePrefix`。
  `getSessionCookie(request, { cookiePrefix })` と一致させる）。属性 `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=30 日`。
- **リダイレクト規約**: `302`、`Location: /login?next=<URL エンコードした相対パス>`。`next` の
  許可形式は要件 B-02。
- **401 JSON**: `{ "error": "Unauthorized" }`（`cron.ts` と同形）。
- **DB スキーマ**: 上表。列名・型・インデックスは CLI 出力を正とし、contract-designer が
  migration SQL の差分を確認して確定する。
- **Zod（`packages/api-contract`）**: 変更なし。ログインフォームの入力検証は Better Auth の
  スキーマに委ね、フロントは空欄チェックのみ（重複定義しない）。

## フロントエンド設計

### `/login`（D-7）

- `apps/web/src/app/login/page.tsx`: Server Component。`searchParams.next` を読み、
  `LoginForm` に渡す。データ取得なし。`metadata.title` は「ログイン | Cookpit」。
- `_components/login-form.tsx`（`'use client'`）:
  - shadcn `Input`（`type="email"`、`autoComplete="username"`）/ `Input`（`type="password"`、
    `autoComplete="current-password"`）/ `Button`。日本語文言。
  - 送信: `authClient.signIn.email({ email, password })`。`pending` 中はボタン無効。
  - 成功: `window.location.assign(safeNext(next))`。`router.push` ではなくフル
    ナビゲーションにするのは、Cookie が付いた状態で Server Component の SSR を確実に
    やり直すためと、SW の navigation 経路に乗せるため。
  - 失敗文言: 401/403 → 「メールアドレスまたはパスワードが違います。」（区別しない。E-01）、
    429 → 「試行回数が多すぎます。しばらく待ってから再度お試しください。」、通信例外 →
    既存 `NETWORK_ERROR_MESSAGE`。
  - `safeNext(value)`: `^\/(?![\/\\])` に一致し 2,000 文字以下なら採用、それ以外は `/`（B-02）。
  - 第二段に備え、フォーム下に「別の方法でログイン」領域を置ける構造にする（第一段では描画しない）。
- `NavBar`（`apps/web/src/app/_components/nav-bar.tsx`）: `usePathname() === '/login'` なら
  `null` を返す（未ログイン画面にタブを見せない）。既存テスト `nav-bar.test.tsx` に 1 件追加。
- standalone PWA: 既存 `viewport`（`viewportFit: 'cover'`）と `main` の余白規約に従う。
  `/login` は precache 対象外（build 時に静的化されても Serwist の precache manifest は
  `_next/static` のみ）。

### `/more`（D-7 / D-16）

- `page.tsx` を async Server Component にし、`getAuth().api.getSession({ headers: await headers() })`
  で表示名を取得して「<name> でログイン中」を見出し下に表示する（`null` なら表示しない。
  dev のスキップ経路）。
- `MoreMenu` にリンク「アカウント」（`/more/account`）を追加し、その下に `LogoutButton`
  （Client）を置く。既存テスト MM-03「リンクはちょうど 2 件」は 3 件に更新する。
- `LogoutButton`: `authClient.signOut()` → runtime cache 破棄（DF-5）→ `location.assign('/login')`。
  失敗時は `API_FAILURE_MESSAGE` と同じ扱いでバナー表示。

### `/more/account`（D-7）

- Server Component で session を取得（`null` なら `redirect('/login?next=/more/account')`。
  Proxy が既に守っているが、表示に session が要るため二重でも構わない）。
- 表示: 表示名・メールアドレス。
- `ChangePasswordForm`（Client）: 現在のパスワード / 新パスワード / 確認 →
  `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })`。
  成功文言「パスワードを変更しました。他の端末では再ログインが必要です。」。
- `RevokeOtherSessionsButton`（Client）: `authClient.revokeOtherSessions()`。
- 第二段でこの画面に「パスキー」セクション（一覧・登録・削除）を足す。

### `useApiAction` の 401（D-8）

`!response.ok && response.status === 401` のとき、`errorMessage` を出さずに
`window.location.assign('/login?next=' + encodeURIComponent(location.pathname + location.search))`
を呼ぶ。`silent: true` の呼び出し（focus 時同期など）でも遷移する（セッション切れは
ユーザーに見せるべき状態のため）。テスト `use-api-action.test.tsx` に 401 ケースを追加する。
`window.location` は happy-dom でスタブする。

### `authClient`（`apps/web/src/lib/auth-client.ts`）

```ts
import { createAuthClient } from 'better-auth/react';
export const authClient = createAuthClient({ basePath: '/api/auth' }); // baseURL 省略 = 同一オリジン
```

`useSession()` フックは使わない（マウントごとに `/api/auth/get-session` を叩き、Server
Component で得られる情報と二重になる）。

### Service Worker（D-9）

- `shopping-list-detail-cache` と `shopping-lists-pages-cache` の `NetworkFirst` に
  `plugins: [{ cacheWillUpdate: async ({ response }) => (response.status === 200 && !response.redirected ? response : null) }]`
  を追加する。理由: navigation リクエストの `redirect` モードは `manual` で、Proxy の 302 は
  SW に `opaqueredirect`（status 0）として届く。Workbox / Serwist の既定
  `cacheOkAndOpaquePlugin` は status 0 を cache するため、`/shopping-lists/<id>` のキーで
  リダイレクト応答が保存され、ログイン後のオフライン再訪問で `/login` へ飛ばされる事故が
  起きうる（実測はしていない。要検証だが、防いで損は無い）。`stores-cache`（SWR）は
  `/api/stores` の 401 JSON が 200 でないため既定でも cache されないが、同じ plugin を付けて
  規約を揃える。
- `/login` / `/api/auth/*` は既存 matcher に該当しない。新たに matcher を足さない旨を
  `sw.ts` のコメントに残す。
- ログアウト時の runtime cache 破棄は Client 側（`LogoutButton`）から `caches.delete()` で
  行う（`sw.ts` の変更不要）。
- **ADR-0021 残存リスク「SW 経由の 401 でダイアログが出ない」は構造的に解消される**:
  未認証の navigation は 401 ではなく 302 → `/login` という通常のページ遷移になり、
  ブラウザの認証ダイアログに依存しない。API の 401 は D-8 でアプリ自身が回復経路を持つ。
- `notificationclick` → `clients.openWindow(url)` は navigation なので DF-1 と同じ経路で
  `/login?next=<url>` を経て元 URL へ戻る（N-08）。

## バックエンド設計

### `createAuth()`（D-1 / D-4 / D-5 / D-12）

```ts
// apps/web/src/server/auth/create-auth.ts（概念。オプション名は better-auth 1.7.5 で確認）
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { authSchema, type DrizzleClient } from '@cookpit/infrastructure';

export interface CreateAuthOptions {
  db: DrizzleClient;
  /** null は Better Auth 既定（dev の警告付き既定値）に委ねる。production では必ず渡す。 */
  secret: string | null;
  /** null はリクエストからの推定に委ねる（Preview / local）。 */
  baseURL: string | null;
  trustedOrigins: string[];
  /** スクリプトのみ true。HTTP 経由のサインアップは常に閉鎖。 */
  allowSignUp: boolean;
  rateLimitStorage: 'database' | 'memory';
}

export function createAuth(o: CreateAuthOptions) {
  return betterAuth({
    ...(o.secret !== null ? { secret: o.secret } : {}),
    ...(o.baseURL !== null ? { baseURL: o.baseURL } : {}),
    basePath: '/api/auth',
    trustedOrigins: o.trustedOrigins,
    database: drizzleAdapter(o.db, { provider: 'pg', schema: authSchema, usePlural: true }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !o.allowSignUp,
      autoSignIn: false,
      requireEmailVerification: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },
    rateLimit: { enabled: true, storage: o.rateLimitStorage },
    advanced: { cookiePrefix: 'cookpit' },
  });
}
export type Auth = ReturnType<typeof createAuth>;
```

```ts
// apps/web/src/server/auth/index.ts（概念）
import 'server-only';
import { getDb } from '@/db/client';
import { createAuth, type Auth } from './create-auth';

export function isAuthConfigured(): boolean {
  const s = process.env.BETTER_AUTH_SECRET;
  return s !== undefined && s !== '';
}

function vercelOrigins(): string[] {
  return [
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ]
    .filter((h): h is string => h !== undefined && h !== '')
    .map((h) => `https://${h}`);
}

let instance: Auth | null = null;
/** 遅延生成。dev のスキップ経路（secret 未設定）では一度も呼ばれない。 */
export function getAuth(): Auth {
  instance ??= createAuth({
    db: getDb(),
    secret: process.env.BETTER_AUTH_SECRET ?? null,
    baseURL: process.env.BETTER_AUTH_URL ?? null,
    trustedOrigins: vercelOrigins(),
    allowSignUp: false,
    rateLimitStorage: 'database',
  });
  return instance;
}
```

- `create-auth.ts` は env を読まず `server-only` も import しない。スクリプトと CLI 設定が
  同じ関数を使う（D-10）。
- `apps/web/src/server/` を composition root として `repositories.ts` と並べる。
  `docs/03-architecture.md` の「infrastructure（web から）は `@/server/repositories` と `@/db/*` に閉じる」
  規約に `@/server/auth` を追記する（§ドキュメント更新）。

### `proxy.ts`（D-3）

```ts
// apps/web/src/proxy.ts（概念）
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { getAuth, isAuthConfigured } from '@/server/auth';

const NEXT_MAX_LENGTH = 2000;

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function buildNextParam(request: NextRequest): string {
  const url = request.nextUrl.clone();
  url.searchParams.delete('_rsc'); // クライアントナビゲーションの RSC 取得が付ける
  const next = `${url.pathname}${url.search}`;
  return next.length <= NEXT_MAX_LENGTH ? next : '/';
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  if (!isAuthConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      console.error('BETTER_AUTH_SECRET is not configured');
      return new NextResponse(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === '/login';

  let session: unknown = null;
  let setCookies: string[] = [];
  // Cookie が無ければ auth を初期化せず即応答（DB も HMAC も不要）
  if (getSessionCookie(request, { cookiePrefix: 'cookpit' }) !== null) {
    const result = await getAuth().api.getSession({
      headers: request.headers,
      returnHeaders: true,
    });
    session = result.response;
    setCookies = result.headers.getSetCookie();
  }

  if (isLoginPage) {
    return session !== null
      ? NextResponse.redirect(new URL('/', request.url), {
          status: 302,
          headers: { 'Cache-Control': 'no-store' }, // Proxy 生成応答は全て no-store（契約書 §11-4）
        })
      : NextResponse.next();
  }
  if (session === null) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const login = new URL('/login', request.url);
    login.searchParams.set('next', buildNextParam(request));
    return NextResponse.redirect(login, { status: 302, headers: { 'Cache-Control': 'no-store' } });
  }
  const response = NextResponse.next();
  for (const cookie of setCookies) response.headers.append('set-cookie', cookie); // キャッシュ更新を転送
  return response;
}
```

- **検証方式の比較**（論点 2）:
  - P-a 楽観検査（`getSessionCookie` の存在確認のみ）: DB も HMAC も不要で最軽量だが、偽 Cookie
    で Server Component の SSR データが見える。本リポジトリは方式 A（SSR で UseCase 直呼び）が
    全ページにあるため不採用。
  - P-b **完全検証（推奨）**: Proxy が `getSession` を呼ぶ。Cookie キャッシュにより通常は HMAC
    検証のみで DB を叩かない。単一の関門で全ページ・全 API を守れ、ページを追加しても
    検証漏れが起きない（ADR-0021 と同じ「全経路の手前」の構造を維持）。代償は Proxy バンドルに
    `better-auth` + drizzle + neon クライアントが入ること（§性能）。
  - P-c 楽観検査 + 各ページ・各 Hono ルートで検証: 多層防御になるが、10 画面 + 9 ルート
    ファイルに検証を足し、ルートテスト十数本にセッションのモックが要る。1 ページ忘れると
    SSR データが漏れる。第一段では不採用。多層防御が必要になったら Hono の `app.use` に
    1 本足す形で追加できる（Proxy が付与する信頼ヘッダ方式は要検討）。
- `getSessionCookie` は「Cookie が無いときの早期 return」専用。存在＝認証済みとは扱わない。
- `Set-Cookie` の転送を忘れると Cookie キャッシュが更新されず、`maxAge` 経過後は毎リクエスト
  DB を叩く（§実装上の罠 1）。
- Proxy は Node.js ランタイム。`@/db/client.ts` の top-level `await import('./pglite-client')`
  は `DATABASE_URL=pglite://` の dev 時のみ評価される。Proxy バンドルで TLA が通るかは
  `pnpm build` で確認（要確認）。

### スクリプト（D-10）

| スクリプト                     | 入力                                                                                                         | 動作                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/auth-create-user.ts`  | `DATABASE_URL`、`AUTH_USER_EMAIL`、`AUTH_USER_NAME`、`AUTH_USER_PASSWORD`（無ければ TTY で対話・エコー無し） | `createAuth({ allowSignUp: true, autoSignIn: false, secret: 任意の文字列, rateLimitStorage: 'memory' })` → `auth.api.signUpEmail`。既存 email / 12 文字未満は exit 1 |
| `scripts/auth-set-password.ts` | `DATABASE_URL`、`AUTH_USER_EMAIL`、`AUTH_USER_PASSWORD`（同上）                                              | `auth.$context` → `internalAdapter.findUserByEmail` → `password.hash` → `internalAdapter.updatePassword` → `internalAdapter.deleteSessions`（全端末失効）            |

- 置き場所は既存 `apps/web/scripts/` に揃える。既存は `.mjs` だが、`createAuth` を再利用
  するため `.ts` にし、`tsx` を devDependency に追加して `package.json` の
  `auth:create-user` / `auth:set-password` から実行する（代替: Node 22.18+ の型注釈除去。
  `.nvmrc` は 20 のため採らない）。
- `BETTER_AUTH_SECRET` は不要（パスワードハッシュは secret に依存しない。セッションを
  発行しないため署名も不要）。開発者が本番 secret を手元に持たずに済む。
- DB 接続は `DATABASE_URL` が `pglite://` なら `drizzle-orm/pglite`、それ以外は
  `createTxConnection`（WebSocket。1 プロセス 1 接続で `close()`）を使う。スクリプトは
  一過性プロセスなのでトランザクション可否を気にせず済む（D-18 の回避策にもなる）。
- **フォールバック**（`$context` の内部 API が 1.7.5 で使えない場合）: `better-auth/crypto`
  の `hashPassword` でハッシュを作り、`accounts.password`（`provider_id = 'credential'`）を
  UPDATE、`sessions` を `user_id` で DELETE する SQL を Drizzle で直接発行する。この経路は
  Better Auth のテーブル形状に依存するため、採った場合は設計書に「1.7.5 固定」と明記する。
- パスワードは引数に渡さない（シェル履歴・`ps` に残さない）。対話入力は `node:readline` の
  `question` をエコー無効で使う（`stdin` の `setRawMode`）。
- 実行手順は `apps/web/e2e/README.md` ではなく `apps/web/README.md` か `.env.example` の
  コメントに置く（implementer 判断）。

## エラー処理

外部ライブラリ経由の DB I/O（セッション検証・認証エンドポイント）を新設するため、Skill
手順 6 の 5 項目を記載する。

- **(a) リトライ**: Proxy の `getSession` と Better Auth の DB 操作は自動リトライしない
  （0 回）。失敗はそのまま 500 / ログイン失敗として返す。ユーザーの再操作が再試行になる。
- **(b) タイムアウト**: `neon-http` の HTTP 1 往復は Vercel Function の実行上限に従う。Proxy
  独自のタイムアウトは設けない（既存の SSR クエリと同じ扱い）。スクリプトの WebSocket 接続は
  既存 `CONNECTION_TIMEOUT_MS`（5 秒）を継承する。
- **(c) 冪等性**: サインイン（sessions への INSERT）は再実行で別セッションが増えるだけで
  害は無い（`revokeOtherSessions` で掃除できる）。サインアウトは冪等。アカウント発行は
  `email` UNIQUE で二重作成を拒否する（E-11）。
- **(d) 部分失敗**: サインアップは users + accounts の 2 行を書く。`neon-http` では
  トランザクションが張れないため、2 行目で失敗すると users だけ残りうる。**発生経路は
  スクリプトのみ**（HTTP サインアップは閉鎖）で、スクリプトは WebSocket 接続を使うため
  アダプタが `db.transaction` を使えるならアトミックになる。使えない場合は「失敗したら
  `auth-set-password` ではなく手動で users 行を削除して再実行」を運用手順に書く。
  パスワード再設定（accounts UPDATE → sessions DELETE）は途中失敗しても「新パスワードで
  ログインでき、旧セッションが残る」だけで、再実行で収束する。
- **(e) フォールバック**: DB 到達不能時に「検証不能なら通す」には倒さない（fail-closed）。
  ユーザーには Next.js 既定の 500 画面。Neon のコールドスタート数秒は既存 SSR と同じ。

本機能固有:

- `BETTER_AUTH_SECRET` 未設定 × production → 503（既存 Basic の規約を踏襲）。
- 401 と 302 の使い分けは `/api/` プレフィックスのみで判定し、`Accept` を見ない（単純さ優先）。
- Proxy 内の未捕捉例外（DB 例外等）は Next.js 既定処理に委ねる。UseCase 層のエラー規約は
  適用外（Proxy は UseCase を呼ばない）。
- ログイン画面の失敗文言は HTTP ステータスで分岐し、Better Auth のエラーメッセージ本文は
  表示しない（メールの存在有無等を漏らさない）。

## ログと監視

- 503（設定不備）のみ `console.error`（既存 `cron.ts` / `push.ts` の作法）。値は出さない。
- 401 / 302 はログしない（既存方針。メールアドレスをログへ残さない）。
- Better Auth の内部 `logger` は既定レベルのまま。`debugLogs` は有効にしない。
- `rate_limits` テーブルが事実上の試行回数の記録になる（D-5 採用時）。専用ダッシュボードは
  作らない。Vercel Function Logs で 5xx を目視する運用。

## セキュリティ

- **防御方式**: 共有 Basic 資格情報 → 個人アカウント + 署名付き Cookie セッション。パスワードは
  scrypt（Better Auth 既定）。`BETTER_AUTH_SECRET`（`openssl rand -base64 32`）が Cookie 署名の
  根拠。secret を回転すると全端末が再ログインになる（sessions 行は残るが Cookie が無効化）。
- **Cookie**: `HttpOnly`（JS から読めない。XSS でのセッション奪取を緩和）、`Secure`（HTTPS
  では `__Secure-` プレフィックス）、`SameSite=Lax`、`Path=/`。
- **CSRF**: `SameSite=Lax` によりクロスサイトの POST / fetch には Cookie が付かない。ADR-0021 が
  受容していた「JSON スキーマの必須項目に依存する緩和」は不要になり、全項目任意のボディを
  取る POST を将来足しても CSRF は成立しない。`/api/auth/*` は Better Auth が `Origin` を
  `baseURL` + `trustedOrigins` と照合する。`hono/csrf` は引き続き導入しない。
- **総当たり**: Better Auth 組み込みレート制限。サーバーレスではインメモリがインスタンス
  ごとにリセットされるため `storage: 'database'` を採る（D-5。要検証）。不可なら memory を
  受容し、防御はパスワード長（12 文字以上）と scrypt のコストに依存する旨を ADR に残す。
- **オープンリダイレクト**: `next` は Proxy が生成し、Client は B-02 の形式検査を通したもの
  だけ使う。`//evil` / `/\evil` / 絶対 URL は `/` に落とす。
- **偽造 Cookie**: 署名検証で弾く（E-08）。Cookie キャッシュも署名付きで、改ざんすれば
  DB 再検証に落ちる。
- **列挙**: ログイン失敗はメール / パスワードのどちらが誤りかを区別しない。サインアップは
  閉鎖しているため「登録済みメール」の応答差は生じない。
- **fail-closed**: secret 未設定 × production → 503。DB 不能 → 500。`VERCEL_ENV` ではなく
  `NODE_ENV` で判定（ADR-0021 の理由を踏襲。Preview も保護対象）。
- **dev のスキップ経路**: `NODE_ENV!=production` × secret 未設定でのみ有効。`.env` に secret を
  入れた開発者はローカルでもログインが要る（Basic と同じ規約）。
- **cron**: `/api/cron/*` は Proxy 対象外のまま `CRON_SECRET` Bearer で保護（変更なし）。
- **Web Push**: `/api/push/*` は認証済みページからの fetch で Cookie が付く。購読件数上限
  （ADR-0017）は維持。`push_subscriptions` はユーザーに紐づけない（対象外）。
- **既知脆弱性**: `better-auth` の推移的依存が CI の `pnpm audit --prod --audit-level=high`
  に掛かる可能性がある（依存変更時に実行される）。検出時は `pnpm.auditConfig.ignoreGhsas` では
  なく更新で対処する方針。
- **ログアウト後のキャッシュ**: SW の runtime cache に残る買い物リスト HTML / JSON は
  ログアウト時に破棄する（D-9）。IndexedDB のオフラインキュー（checked 操作）は破棄しない
  （個人端末前提。§スコープ外の気づき）。
- **セキュリティヘッダ**: `next.config.ts` の `securityHeaders` は独立して有効。変更なし。

## 性能

L3 かつ性能設計の条件 1（外部ライブラリ経由の DB I/O 新設）に該当するため厚く書く。数値は
すべて**推定**であり、実装後に Vercel Function のログで確認することを推奨する。

- **Proxy のモジュール読み込み**: 現行 Proxy は `next/server` のみに依存する。変更後は
  `better-auth`（+ `@better-auth/*`、`jose`、`@noble/*`、`kysely` 等の推移的依存）、
  `drizzle-orm`、`@neondatabase/serverless`、`ws`、`auth-schema` が Proxy バンドルに入る。
  コールドスタート増分は数十〜数百 ms（推定）。Cookie が無いリクエストでは `getAuth()` を
  呼ばない（遅延生成）ため、モジュール評価は起きるがインスタンス生成は起きない。
  `pnpm build` 後の `.next/server/proxy.js` 相当のサイズを実装時に記録する（確認推奨）。
- **DB 接続の有無**: `getDb()` は neon-http（HTTPS 1 往復・接続プール無し）で、Proxy から
  呼んでもソケットを持ち越さない（ADR-0020 の失敗モードに当たらない）。WebSocket は Proxy
  から使わない。
- **Cookie キャッシュ有効時の DB 往復頻度**: アクティブな利用者 1 人あたり、`maxAge`
  （5 分）ごとに最大 1 回の `SELECT sessions JOIN users`。加えて `updateAge`（1 日）ごとに
  最大 1 回の `UPDATE sessions SET expires_at`。ログイン / ログアウト / パスワード変更で
  各 1〜2 回の書き込み。2 名利用で 1 日あたり数十クエリ規模（推定）。
- **Neon の compute 時間への影響**: ほぼゼロ（推定）。理由: 全ページの SSR が既に Neon へ
  クエリを発行しており、Proxy の検証クエリは同じリクエスト内で compute が起きている時間に
  重なる。Neon の autosuspend を新たに妨げる常時アクセスは発生しない。よって `maxAge` を
  5 分より長くしても compute 節約にはならず、失効（他端末のログアウト・パスワード変更）が
  反映されるまでの遅延だけが延びる。**`maxAge` を 5 分（Better Auth 既定）にする根拠**。
- **レスポンスタイム予算（推定）**: Cookie キャッシュ命中時の Proxy 追加コストは HMAC 検証 +
  JSON パースで 1 ms 未満（P50）。キャッシュ失効時は neon-http 1 往復（同リージョンで
  20〜80 ms、Neon がサスペンド中なら数秒。ただし後者は既存 SSR も同じ）。目標: 認証済み
  ページの P50 が現行 + 5 ms 以内、P99 が現行 + 100 ms 以内（キャッシュ失効時を除く）。
  計測方法: `curl -w '%{time_total}'` で `/pantry` を Cookie あり 20 回、Basic 時代の
  `logs/2026-08-13.md` の計測値と比較する。
- **N+1 リスク**: 無し。`getSession` は 1 クエリ（sessions と users の JOIN または 2 クエリ。
  Better Auth の実装依存）で、一覧・集計クエリは新設しない。`listSessions` は使わない。
- **インデックス**: `sessions.token`（UNIQUE。毎検証の検索キー）、`sessions.user_id`
  （`deleteSessions` / `revokeOtherSessions`）、`accounts.user_id`（サインイン時の
  credential 検索）、`users.email`（UNIQUE。サインイン）、`rate_limits.key`（PK）。CLI 出力に
  無ければ contract-designer が追加を判断する。
- **キャッシュ**: TanStack Query は未導入（`docs/02-tech-stack.md`）。Better Auth の Cookie
  キャッシュのみ。`useSession()` フックは使わない（マウントごとの `/api/auth/get-session`
  往復を避ける）。
- **neon-http で十分か**: セッション検証・サインイン・サインアウトは単一行の SELECT /
  INSERT / DELETE で、トランザクションを要しない。サインアップ（2 行）はスクリプト経由のみで
  WebSocket 接続を使う（D-10 / D-18）。**要確認**: `drizzleAdapter` が内部で `db.transaction`
  を呼ぶ経路があるか。neon-http の drizzle は `transaction()` で例外を投げるため、呼ぶなら
  アダプタの `transaction` オプションで無効化する（オプションが無ければ `getTxConnection`
  経由の WebSocket 接続を認証専用に張る案へ切り替える。その場合は ADR-0020 の「1 リクエスト
  1 接続・`finally` で閉じる」規約を Proxy にも適用する）。
- **負荷試験シナリオの骨子**: 本番相当の負荷試験基盤は導入しない（2 名利用）。代わりに
  次の 2 本を手動で行う。(1) レート制限スモーク: 誤パスワードで `POST /api/auth/sign-in/email`
  を 10 秒間に 10 回 → N 回目以降 429 になることと、別インスタンス（Preview）でも
  カウントが共有されること（`storage: 'database'` の検証）。(2) Proxy 追加コスト: 上記
  `curl` 計測を Cookie キャッシュ命中 / 失効直後の 2 条件で行い、設計書の推定と比較する。

## テスト方針

自動テストは `apps/web/tests/` のミラー構成に従う（node プロジェクト: `*.node.test.ts` と
`tests/server/**`、dom プロジェクト: `*.test.tsx`）。ID 接頭辞は試験計画で確定する（案:
AU-P Proxy / AU-H Hono / AU-UI 画面 / AU-S スクリプト / AU-SW / AU-M 実機）。

- **Proxy 単体**（`apps/web/tests/proxy.node.test.ts` を置換。`@/server/auth` と
  `better-auth/cookies` を `vi.mock`）: Cookie 無し → 302 と `next` の値（`/pantry?x=1`、
  `_rsc` 除去、`/` のとき `next=/`）/ `/api/pantry` → 401 JSON + `no-store` / 有効セッション →
  200 + `Set-Cookie` 転送 / 無効セッション（`getSession` が null）→ 302 / `/login` ×
  有効 → 302 `/` / `/login` × 無効 → 通過 / secret 未設定 × production → 503・本文空・
  `WWW-Authenticate` 無し・`console.error` 1 回 / secret 未設定 × development・test → 通過 /
  `getSession` が throw → 例外伝播（通さない）/ matcher 構造テスト（`/api/auth/sign-in/email`
  除外、`/api/authx` 保護、既存 MW-M01〜M12 の踏襲）。
- **Hono マウント**（`apps/web/tests/server/auth/auth-route.test.ts`）: `@/server/auth` を
  モックし `GET /api/auth/ok` が `handler` に到達すること。PGlite で実インスタンスを組む
  疎通テスト（`sign-up/email` が `disableSignUp` で 4xx、スクリプト相当の `allowSignUp`
  インスタンスで作った user で `sign-in/email` が 200 と `Set-Cookie`）。アダプタが PGlite で
  動かない場合は後者を手動確認へ格下げ（§DB 設計）。
- **画面（RTL）**: `LoginForm`（送信で `authClient.signIn.email` が呼ばれる / 401 文言 /
  429 文言 / 通信例外文言 / `next` の安全化 5 パターン / pending 中の無効化）、
  `LogoutButton`、`ChangePasswordForm`（確認不一致・成功文言）、`MoreMenu`（リンク 3 件）、
  `NavBar`（`/login` で描画しない）、`useApiAction`（401 で `location.assign` が
  `/login?next=` 付きで呼ばれ、`errorMessage` は null のまま）。
- **Service Worker**: `cacheWillUpdate` を純関数として切り出し、`status 200 && !redirected` →
  応答、`redirected` / 0 / 401 → null を単体テスト。既存の `runtimeCaching` 回帰
  （`docs/tests/saturday-flow.md` のオフライン再訪問）を実機で確認。
- **スクリプト**: `DATABASE_URL=pglite://` の一時ディレクトリに対して `auth:create-user` →
  `auth:set-password` を実行し、新パスワードで `signInEmail` が通り、旧パスワードが通らず、
  `sessions` が空になることを Vitest（node）から `execa` 相当の `child_process` で確認する。
  重複 email → exit 1。12 文字未満 → exit 1。
- **E2E（Playwright）**: 基盤は**整備済み**（`apps/web/tests/e2e/` に 2 本、CI で必ず実行、
  `apps/web/e2e/README.md` は説明のみ）。既存 2 本は D-15 のスキップ経路で無変更。追加:
  `auth-login.spec.ts` — `E2E_AUTH_EMAIL` / `E2E_AUTH_PASSWORD` が設定されているときだけ
  実行（未設定なら `test.skip`）。`/pantry` → `/login?next=%2Fpantry` へリダイレクト →
  ログイン → `/pantry` に戻る → ログアウト → `/login`。`playwright.config.ts` の
  `httpCredentials` は削除し、代わりに同 env が揃っているときの `storageState` 生成を
  `globalSetup` で行うかは test-designer が決める（CI では両 env 未設定のためスキップ）。
- **実機確認（自動化不可）**:
  1. iOS ホーム画面 PWA（standalone）: ログイン → アプリを終了して再起動 → ログイン不要 /
     7 日以上放置後の起動（ITP は HttpOnly Cookie に影響しない想定。要確認）/ ログアウト /
     通知クリック起動（未認証時に `/login` → 元 URL）。
  2. Android Chrome PWA: 同上。
  3. 30 日後の挙動は待てないため、`auth-set-password` で全セッションを失効させて
     「次の操作で `/login` へ戻る」ことで代替する。
  4. `/shopping-lists/<id>` を SW 経由で開いた状態でセッション失効 → 302 → `/login` →
     ログイン後にオフラインで再訪問し、リダイレクト応答が cache されていないこと。
  5. Preview URL でのログイン（`trustedOrigins` の妥当性）。
  6. 本番 black-box 確認表（§移行とリリース）。

## 移行とリリース

順序が重要（逆順は無防備または締め出しの窓を開ける）。ロールバックは Vercel の前デプロイ
への即時ロールバック。

1. **PR 作成 → CI**: CI の E2E ジョブが Neon に `db:migrate` を実行するため、migration は
   PR の段階で本番 Neon に適用される（既存運用）。追加テーブルのみで既存テーブルに触れない
   ことを migration SQL のレビューで確認する。
2. **Preview 環境変数**: `BETTER_AUTH_SECRET`（Preview 専用の値）を登録。`BETTER_AUTH_URL` は
   登録しない（推定に委ねる）。
3. **アカウント発行**: 開発者の手元から `DATABASE_URL=<本番 Neon>` で `auth:create-user` を
   2 回（開発者・パートナー）。パスワードは対話入力。パートナーへは別経路で伝える。
4. **Preview で実機確認**: ログイン / ログアウト / パスワード変更 / 通知クリック /
   `/manifest.webmanifest` 200 / `/api/cron/*` の Bearer 判定。
5. **Production 環境変数**: `BETTER_AUTH_SECRET`（本番用）、`BETTER_AUTH_URL=https://cookpit-web.vercel.app`。
   **`BASIC_AUTH_*` はまだ消さない**（ロールバック時に前デプロイが必要とする）。
6. **マージ → 本番デプロイ**。
7. **本番 black-box 確認**（ADR-0021 手順 3 の作法。matcher は Vercel 側のエンジンで評価される
   ため本番で再確認する）:

   | パス                                         | 期待                                                                                      |
   | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
   | `/`（Cookie 無し）                           | 302 `/login?next=%2F`                                                                     |
   | `/api/pantry`（Cookie 無し）                 | 401 JSON、`Cache-Control: no-store`                                                       |
   | `/login`                                     | 200                                                                                       |
   | `/api/auth/ok`                               | 200                                                                                       |
   | `/api/auth/sign-up/email`（POST）            | 4xx（閉鎖）                                                                               |
   | `/manifest.webmanifest`                      | 200                                                                                       |
   | `/_next/static/...`（実在アセット）          | 200                                                                                       |
   | `/_next/image?url=/icons/icon.svg&w=64&q=75` | 302（除外していないことの確認）                                                           |
   | `/api/cron/expiry-alerts`                    | 401 だが Proxy ではなく cron 自身の判定（`{ error: 'Unauthorized' }` で `Location` 無し） |
   | `/api/cron/..%2fpantry`                      | 401 か 404。200 ならパス正規化の穴                                                        |
   | `/api/authx`                                 | 401（`api/auth/` 前方一致の境界）                                                         |

8. **2 名の端末でログイン**（iOS / Android の実機確認項目）。
9. **後片付け**: Vercel の `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` を Production / Preview
   から削除。ADR-0022 を Accepted、ADR-0021 を `Superseded by ADR-0022` に更新。
   `docs/01-overview.md` / `02-tech-stack.md` / `03-architecture.md` の Basic 認証の記述を更新。

**共存期間を設けない理由（D-11）**: Basic を外側に残す案は「新コードを Basic の内側で本番
検証できる」利点があるが、Preview で同じ検証ができる。2 名に二重の認証（ダイアログ +
ログイン画面）を一時的にでも強いる価値は無く、`proxy.ts` に 2 方式を同居させると「未設定なら
503」の意味（どちらの未設定か）が曖昧になる。ロールバックは再デプロイで即時にできるため、
一括切替で十分。Basic 認証コードの削除も同一 PR で行う（残すと `BASIC_AUTH_*` が
`.env.example` と Playwright 設定に残り続け、削除タスクが忘れられる）。

## 第二段（パスキー）設計

**本 feature の実装スコープ外**。第一段が第二段を阻害しないことの確認と、第二段の骨子。

- **パッケージ**: `@better-auth/passkey@1.7.5`。サーバー `plugins: [passkey({ rpID, rpName: 'Cookpit', origin, authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' } })]`、
  クライアント `plugins: [passkeyClient()]`。
- **テーブル**: `passkeys`（`id`, `name`, `public_key`, `user_id` FK, `credential_id`
  UNIQUE, `counter`, `device_type`, `backed_up`, `transports`, `created_at`, `aaguid`）。
  第二段で `cli.config.ts` にプラグインを足して `generate` を再実行し、`auth-schema.ts` を
  上書き → `db:generate` で `0011_*.sql`。**第一段では作らない**（未使用テーブルを先に置く
  利点が無く、CLI 出力を手で先取りすると再生成時に差分が出る）。別ファイルにした理由の一つ。
- **RP ID / origin**: 本番は `cookpit-web.vercel.app` / `https://cookpit-web.vercel.app` を
  `BETTER_AUTH_URL` から導出。Vercel Preview はオリジンが毎回異なるため、Preview では
  `rpID` を `VERCEL_URL` にする（Preview で登録したパスキーは本番で使えない。逆も同じ。
  `logs/2026-09-17.md` の気づき）。独自ドメインへ移す場合は全員が登録し直す。
- **登録 UI**: `/more/account` に「パスキー」セクション（一覧 `authClient.passkey.listUserPasskeys`、
  「このデバイスを登録」`authClient.passkey.addPasskey({ name })`、削除）。第一段でこの画面を
  作っておく（D-7）。
- **ログイン UI**: `/login` のメール欄に `autoComplete="username webauthn"` を付け、
  `PublicKeyCredential.isConditionalMediationAvailable()` が真ならマウント時に
  `authClient.signIn.passkey({ autoFill: true })` を開始（条件付き UI。パスワード
  マネージャーの候補にパスキーが並ぶ）。加えて「パスキーでログイン」ボタン。第一段の
  フォーム構造（「別の方法でログイン」領域）に収まる。
- **復旧経路**: パスワードは残す（第二段でも `emailAndPassword.enabled: true`）。端末紛失時は
  `auth-set-password` で再設定 + 全セッション失効 → 新端末でパスワードログイン → パスキー
  再登録。iOS は iCloud キーチェーン、Android は Google パスワードマネージャーで同期される
  ため、同一プラットフォーム内の機種変更では再登録不要（要確認）。
- **第一段が用意しておくもの**: `users.name`（パスキーの表示名に使う）、`/more/account`、
  ログインフォームの拡張領域、`auth-schema.ts` の再生成手順、`createAuth()` の
  `plugins` 差し込み口（第一段では空配列）。

## 実装上の罠

1. **`Set-Cookie` の転送**: Proxy で `getSession` を呼んでも、返ってきた `Set-Cookie` を
   `NextResponse.next()` に付けなければ Cookie キャッシュが更新されず、`maxAge` 後は毎回 DB
   を叩く。`returnHeaders: true` の戻りから `getSetCookie()` で取り出して `append` する。
2. **`getSessionCookie` の prefix**: `advanced.cookiePrefix` を変えたら
   `getSessionCookie(request, { cookiePrefix })` にも同じ値を渡す。ずれると常に「Cookie
   無し」扱いになり全員締め出し（dev では気づきにくい）。
3. **`_rsc` クエリ**: クライアントナビゲーションの RSC 取得は `?_rsc=xxxx` を付ける。
   `next` に混ざると `/login?next=%2Fpantry%3F_rsc%3Dabc` になり、ログイン後に無意味な
   クエリ付きで遷移する。Proxy で除去する。
4. **`server-only` と CLI**: `apps/web/src/server/auth/index.ts` は `server-only` を import
   するため `@better-auth/cli` から読み込めない。CLI には `cli.config.ts`（`createAuth` を
   直接使う）を渡す。
5. **既存テストのモック**: `apps/web/tests/server/routes/*.test.ts` は `@/db/client` を
   `vi.mock` している。`app.ts` が `@/server/auth` を import しても `getAuth()` は遅延なので
   壊れないが、`vi.mock('@/server/auth')` を足す必要が出たら共通のモックヘルパーにする。
6. **`MoreMenu` テスト MM-03**: 「リンクはちょうど 2 件」を 3 件へ更新する。
7. **Preview の `Origin` 検査**: Preview で `BETTER_AUTH_URL` を登録すると、そのデプロイ固有
   URL と branch alias のどちらかで Origin 不一致になる。Preview は未設定 + `trustedOrigins`
   に `VERCEL_URL` / `VERCEL_BRANCH_URL` を入れる。
8. **`session.freshAge`**: Better Auth は一部の機微操作に「新鮮なセッション」（既定 1 日）を
   要求する。30 日セッションで `changePassword` / `revokeOtherSessions` が拒否されるなら
   `freshAge: 0` で無効化する（2 名利用で現在のパスワード確認があれば十分）。要確認。
9. **Zod のバージョン**: `better-auth@1.7.5` が要求する `zod` と本リポジトリの `zod@^4.4`
   の整合を `pnpm install` の warning で確認する。
10. **Proxy の top-level await**: `@/db/client.ts` は TLA を含む。Proxy バンドルで通ることを
    `pnpm build` で確認する（通らなければ `pglite-client` の分岐を関数内 `await import` に
    変える。dev 経路のみの変更）。

## リスク

| #    | リスク                                                                           | 影響                                           | 対策                                                                                                                          |
| ---- | -------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| R-1  | Proxy バンドル肥大でコールドスタートが延びる                                     | 初回アクセスが遅い（推定 +数十〜数百 ms）      | §性能の計測。許容できなければ P-c（楽観 + 各経路検証）へ切替可能な構造にしておく                                              |
| R-2  | アダプタが neon-http のトランザクション不可で失敗する                            | サインインが 500                               | D-18。`transaction` 無効化 → 不可なら WebSocket 接続。実装初期に検証                                                          |
| R-3  | `rateLimit.storage: 'database'` がサーバーレスで期待どおり動かない               | 総当たり耐性がインスタンス単位に落ちる         | Preview で 2 インスタンス相当の確認。不可なら memory を受容し ADR に記録                                                      |
| R-4  | 全員が締め出される設定ミス（prefix ずれ・secret 誤登録・`BETTER_AUTH_URL` 誤り） | 誰もログインできない                           | Preview で先に検証。ロールバック手順（前デプロイ + `BASIC_AUTH_*` 温存）                                                      |
| R-5  | SW がリダイレクト応答を cache する                                               | ログイン後もオフライン再訪問で `/login` に飛ぶ | D-9 の `cacheWillUpdate`。実機確認 4                                                                                          |
| R-6  | iOS standalone で Cookie が想定より早く消える                                    | 頻繁な再ログイン                               | 実機確認 1。発生時は `expiresIn` ではなく iOS 側の挙動を調査（設計変更なし）                                                  |
| R-7  | CI の E2E がスキップ経路に依存し、ログインフローが CI で検証されない             | ログイン画面の回帰を CI が捉えない             | RTL でフォームを、`auth-login.spec.ts` をローカル / Preview で実行。将来 CI に E2E 用アカウントを持つ案は §スコープ外の気づき |
| R-8  | migration が CI（PR 時）で本番 Neon に先行適用される                             | コードより先にテーブルが存在する               | 追加テーブルのみで無害。既存運用どおり                                                                                        |
| R-9  | `better-auth` の推移的依存に high 以上の脆弱性                                   | CI の audit で赤                               | バージョン更新で対処。ignore は使わない                                                                                       |
| R-10 | Better Auth のマイナー更新で API 名が変わる                                      | 設計書の擬似コードと差異                       | 実装時に 1.7.5 の型定義で確認。設計書は「概念」と明記                                                                         |

## ドキュメント更新

実装 PR に含める（D-19）。

- `docs/decisions/ADR-0021-basic-auth-for-public-repository.md`: Status を
  `Superseded by ADR-0022`（日付）に。本文は残す。
- `docs/decisions/ADR-0022-better-auth-login.md`: Proposed → Accepted。
- `docs/01-overview.md`: 「本番デプロイは Basic 認証で保護して」→ Better Auth のログインへ。
- `docs/02-tech-stack.md`: サマリ表「認証」行と「認証は Basic 認証」節。
- `docs/03-architecture.md`: ツリーの `proxy.ts` コメント、`server/auth/` の追加、
  「使い分けの方針」の認証注記、「パッケージ公開境界」表の `@/server/auth` 追記。
- `apps/web/.env.example`: `BASIC_AUTH_*` 削除、`BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` 追加
  （生成方法・Preview は別値・URL は本番のみ）。
- `apps/web/e2e/README.md`: ログイン E2E の実行条件。

## 未決事項

### Gate A でユーザーに確認する（最大 3 件）

> **確定（2026-09-17 Gate A）**: 3 件ともユーザーが推奨案を採用した。1: インスタンスは
> `apps/web/src/server/auth/`、Drizzle スキーマは `packages/infrastructure/src/db/auth-schema.ts`
> （別ファイル・複数形）。2: Proxy で `auth.api.getSession` による完全検証。3: 一括切替・同一 PR で
> Basic 認証コードを削除（Vercel の `BASIC_AUTH_*` は実機確認完了まで温存）。

1. **Better Auth の置き場所（D-1 / D-6）** — 推奨: インスタンスは `apps/web/src/server/auth/`
   （`repositories.ts` と同じ composition root）、Drizzle スキーマは
   `packages/infrastructure/src/db/auth-schema.ts`（別ファイル・テーブル名複数形）。
   根拠: (a) `betterAuth()` の戻りは HTTP ハンドラ + サーバー API で、Presentation の横断関心
   （現行 `proxy.ts` と同じ位置づけ）。クライアント（`better-auth/react`）と型を共有する
   のも apps/web。(b) `packages/infrastructure` は「Repository 実装 + DB 接続」のままにでき、
   `better-auth` 依存を持たない。(c) テーブル定義だけは infrastructure に置くことで
   drizzle.config / migrations / DDL の正典が 1 パッケージに保たれる。(d) 別ファイルなら
   第二段でプラグインを足したときに CLI 出力で上書きでき、手書き `schema.ts` と混ざらない。
   代替 B（`packages/infrastructure/src/auth/create-auth.ts`）: DB アダプタと同じ場所に
   まとまるが、infrastructure が HTTP ハンドラを export し、`better-auth` 依存と
   `$Infer` 型が infrastructure 経由になる。代替 C（`schema.ts` に統合）: config 変更が
   不要だが、CLI 再生成のたびに手書き部分とマージが要る。
2. **Proxy での完全検証（D-3）** — 推奨: `auth.api.getSession` を Proxy で呼ぶ（P-b）。
   根拠: 方式 A（SSR で UseCase 直呼び）が全ページにあるため、Cookie 存在確認だけでは偽
   Cookie で SSR データが見える。単一関門ならページ追加時の検証漏れが起きず、ADR-0021 の
   「全経路の手前」構造を維持できる。Cookie キャッシュにより通常は DB を叩かない。代償は
   Proxy バンドルに DB クライアントが入ること（推定 +数十〜数百 ms のコールドスタート。
   §性能で計測）。代替 P-c（楽観 + 各ページ・各ルートで検証）は多層防御になるが 10 画面 +
   9 ルートファイル + ルートテスト十数本に手が入り、1 ページ忘れると漏れる。
3. **切替方式（D-11）** — 推奨: 一括切替。同一 PR で Basic 認証コードを削除し、Vercel の
   `BASIC_AUTH_*` は本番実機確認完了まで残してから削除。根拠: Preview で事前検証でき、
   ロールバックは前デプロイへの即時ロールバックで済む。共存は 2 名に二重認証を強い、
   「未設定なら 503」の意味を曖昧にする。

### implementer / contract-designer が検証・確定する（ユーザー確認不要）

- D-18: `drizzleAdapter` が neon-http で動くか。`transaction` オプションの有無。
- D-5: `rateLimit.storage: 'database'` の可否と `rate_limits` テーブルの CLI 生成。
- PGlite（`drizzle-orm/pglite`）上でアダプタが動くか（テストの成立条件）。
- CLI 出力のテーブル名・列名 casing・インデックス（契約骨子 → 契約確定）。
- `tsx` devDependency の追加可否（代替: Node 22.18+）。
- `session.freshAge` の影響（罠 8）。
- `getSession({ returnHeaders: true })` の戻り形と `getSetCookie()` の利用可否（罠 1）。
- `cookieCache.strategy` の既定値（`compact` を想定。変更しない）。
- `advanced.cookiePrefix` / `generateId` の最終値（契約骨子の提案どおりで問題なければ確定）。

## スコープ外の気づき

- オフラインキュー（`use-checked-sync-queue.ts`）は 401 を「再試行可能」として扱い、
  `attempts` を消費する。セッション失効中に flush が走ると 5 回で `exhausted` になる。401 は
  「再試行を止めてログインへ」にする方が正しい（本 feature では D-8 の `useApiAction` 経路
  のみ対応。別タスク候補）。
- CI の E2E は認証スキップ経路に依存する。将来、CI 専用アカウント（PGlite 経路のみ）を
  `setup-pglite-dev.mjs` から発行してログイン込みの E2E を回す案がある（Neon 経路では
  本番 DB にテストアカウントを作ることになるため採らない）。
- `apps/web/scripts/` は `.mjs` と `.ts` が混在することになる。既存の verify 系スクリプトを
  `.ts` に寄せるかは別タスク。
- `docs/02-tech-stack.md` の「クライアント状態」節は TanStack Query 未導入を前提にしている。
  `authClient.useSession()` を使わない方針はこれと整合する。
- `/api/health` はセッション必須のまま（外形監視が無いため）。外形監視を入れるなら除外を
  検討する。
