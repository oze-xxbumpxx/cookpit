# 契約設計: better-auth-login

> §背景・目的・集約/層設計・データフロー・フロントエンド設計・バックエンド設計・性能・
> テスト方針・移行とリリース・第二段設計・実装上の罠・リスクは
> `docs/designs/better-auth-login.md`（draft。Gate A 3 件はユーザー承認済み・その他は
> draft のまま）を参照。本書はその契約を `packages/infrastructure/src/db/auth-schema.ts`
> （Drizzle）・環境変数・Cookie・Hono マウント（`/api/auth/*`）・`packages/api-contract`
> （変更なしの確認）として実装可能な水準まで確定する。本体設計書と矛盾する記述は無効
> （矛盾に気づいた場合は Orchestrator へ差し戻す。本書は末尾「設計書との差異メモ」に
> 差異点を記録した。いずれも設計判断を覆すものではない）。

- ステータス: **契約骨子（設計書§契約骨子）の詳細化**。設計書は draft（Gate A 3 件のみ確定・
  他は draft のまま）のため、本書も同じステータス（設計書が confirmed になった時点で本書も
  同様に扱う）。
- 対象: 新規 `packages/infrastructure/src/db/auth-schema.ts`（Drizzle。`@better-auth/cli
generate` の生成物）、新規 `apps/web/src/db/migrations/0010_*.sql`、
  `apps/web/.env.example` 追記/削除、`apps/web/src/proxy.ts` の応答契約、
  `apps/web/src/server/app.ts` の `/api/auth/*` マウント、`apps/web/src/lib/use-api-action.ts`
  の 401 契約、`apps/web/scripts/auth-create-user.ts` / `auth-set-password.ts` の
  入出力契約。**`packages/api-contract` は変更なし**（§6 で確認）。
- 参照した既存契約（実測）: `packages/infrastructure/src/db/schema.ts`（全 9 テーブル）、
  `packages/infrastructure/src/index.ts`（バレル export の作法）、
  `apps/web/src/db/migrations/`（0000〜0009、`meta/_journal.json`）、
  `apps/web/drizzle.config.ts`、`apps/web/package.json`（scripts / dependencies）、
  `apps/web/src/proxy.ts`（現行 Basic 認証の matcher・応答規約）、
  `apps/web/src/server/routes/cron.ts`（401 JSON の既存形・設定不備 500 の作法）、
  `apps/web/src/lib/use-api-action.ts`（401 の現状の扱い＝無し）、`apps/web/.env.example`、
  `apps/web/playwright.config.ts`（`httpCredentials` の現状）、
  `packages/api-contract/src/*.schema.ts`・`index.ts`（バレルの作法）。
- **本ユニットは未実装（プロダクションコード 0 件）。** したがって Better Auth の実エンドポイント
  応答形・エラーコード・CLI 生成物の列名 casing は Orchestrator が確認した 1.7.5 の仕様事実
  からの導出であり、実測ではない。「想定」と明記した箇所は implementer が実装時に
  `@better-auth/cli generate` の実出力・実際の HTTP 応答で確認し、本書を更新する前提とする
  （§10 に要検証事項を集約）。
- プロダクションコードは変更しない（実装は implementer）。

---

## 目次

1. [DB 契約（追加 5 テーブル）](#1-db-契約追加-5-テーブル)
2. [環境変数契約](#2-環境変数契約)
3. [Cookie 契約](#3-cookie-契約)
4. [Proxy 応答契約](#4-proxy-応答契約)
5. [`/api/auth/*` の利用契約](#5-apiauth-の利用契約)
6. [クライアント側契約](#6-クライアント側契約)
7. [スクリプト契約](#7-スクリプト契約)
8. [後方互換性判定](#8-後方互換性判定)
9. [契約テスト観点（test-designer への橋渡し）](#9-契約テスト観点test-designer-への橋渡し)
10. [要検証事項の一覧](#10-要検証事項の一覧)
11. [設計書との差異メモ](#11-設計書との差異メモ)

---

## 1. DB 契約（追加 5 テーブル）

設計書 §DB 設計の骨子を、Orchestrator が確認した Better Auth 1.7.5 のコアスキーマ事実に
基づき列レベルまで詳細化する。**物理列名の casing は `@better-auth/cli generate` の実出力を
正とし、以下は「想定」である**（§10-1）。テーブル名は `usePlural: true` により複数形
（`users` / `sessions` / `accounts` / `verifications` / `rate_limits`）。ID は Better Auth
既定の `generateId()`（text。UUID ではない衝突耐性ランダム文字列。既存テーブルの UUID 形式とは
異なるが相互参照が無いため問題ない。設計書 §DB 設計）。既存 9 テーブル（`recipes` 〜
`push_subscriptions`）への差分は**ゼロ**（追加のみ）。

### 1.1 `users`

| 列（想定・camelCase の Drizzle プロパティ名） | 物理列名（想定） | 型        | 必須            | UNIQUE | 既定値                                                                             |
| --------------------------------------------- | ---------------- | --------- | --------------- | ------ | ---------------------------------------------------------------------------------- |
| `id`                                          | `id`             | text      | ✓（PK）         | -      | Better Auth `generateId()`                                                         |
| `name`                                        | `name`           | text      | ✓               | -      | -（ログインフォームには無い。スクリプトが渡す）                                    |
| `email`                                       | `email`          | text      | ✓               | ✓      | -                                                                                  |
| `emailVerified`                               | `email_verified` | boolean   | ✓               | -      | `false`（想定。`requireEmailVerification: false` のため実質未使用）                |
| `image`                                       | `image`          | text      | 任意（null 可） | -      | `null`                                                                             |
| `createdAt`                                   | `created_at`     | timestamp | ✓               | -      | 要検証（既存テーブルの `.defaultNow()` 慣習が CLI 生成物にも適用されるかは §10-2） |
| `updatedAt`                                   | `updated_at`     | timestamp | ✓               | -      | 同上                                                                               |

- ドメインの集約ではない（ADR-0004 維持。Better Auth 所有テーブル）。
- `users.email` の UNIQUE がサインイン時の検索インデックスを兼ねる（CLI 生成物にインデックスが
  無くても UNIQUE 制約自体が btree インデックスを作るため追加不要）。

### 1.2 `sessions`

| 列（想定）  | 物理列名（想定） | 型        | 必須            | UNIQUE / FK                            | 備考                                                                      |
| ----------- | ---------------- | --------- | --------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| `id`        | `id`             | text      | ✓（PK）         | -                                      | -                                                                         |
| `expiresAt` | `expires_at`     | timestamp | ✓               | -                                      | `updateAge`（1 日）ごとに UPDATE される（設計書 §性能）                   |
| `token`     | `token`          | text      | ✓               | ✓                                      | Cookie の `session_token` の署名の元になる値                              |
| `createdAt` | `created_at`     | timestamp | ✓               | -                                      | 要検証（§10-2）                                                           |
| `updatedAt` | `updated_at`     | timestamp | ✓               | -                                      | 同上                                                                      |
| `ipAddress` | `ip_address`     | text      | 任意（null 可） | -                                      | -                                                                         |
| `userAgent` | `user_agent`     | text      | 任意（null 可） | -                                      | -                                                                         |
| `userId`    | `user_id`        | text      | ✓               | FK → `users.id`、`onDelete: 'cascade'` | ユーザー削除時にセッションも削除（本 feature ではユーザー削除機能は無い） |

- **インデックス判断（contract-designer）**: `sessions.token` の UNIQUE がセッション検証の
  主検索キーを兼ねる（毎リクエストの照合。cookieCache 失効時のみ発火）。`sessions.user_id` は
  `revokeOtherSessions` / パスワード変更後の全セッション削除（`auth-set-password.ts`）で使う
  等値検索キーであり、CLI が生成しない場合は明示的なインデックス
  （`index('sessions_user_id_idx').on(table.userId)`）を追加する。既存テーブルの慣習
  （`price_records_product_id_idx` 等、FK 列への明示インデックス）と一致させる。**2 名利用
  規模では実利益はほぼ無いが、規約整合と将来の 3 人目以降を見据えて追加を推奨**（必須ではない）。

### 1.3 `accounts`

| 列（想定）              | 物理列名（想定）           | 型        | 必須                                 | 備考                                                     |
| ----------------------- | -------------------------- | --------- | ------------------------------------ | -------------------------------------------------------- |
| `id`                    | `id`                       | text      | ✓（PK）                              | -                                                        |
| `accountId`             | `account_id`               | text      | ✓                                    | email+password では `email` と同値が入る想定（要検証）   |
| `providerId`            | `provider_id`              | text      | ✓                                    | email+password では固定値 `'credential'`                 |
| `userId`                | `user_id`                  | text      | ✓                                    | FK → `users.id`、`onDelete: 'cascade'`                   |
| `accessToken`           | `access_token`             | text      | 任意（null 可）                      | OAuth 用。第一段では常に `null`                          |
| `refreshToken`          | `refresh_token`            | text      | 任意（null 可）                      | 同上                                                     |
| `idToken`               | `id_token`                 | text      | 任意（null 可）                      | 同上                                                     |
| `accessTokenExpiresAt`  | `access_token_expires_at`  | timestamp | 任意（null 可）                      | 同上                                                     |
| `refreshTokenExpiresAt` | `refresh_token_expires_at` | timestamp | 任意（null 可）                      | 同上                                                     |
| `scope`                 | `scope`                    | text      | 任意（null 可）                      | 同上                                                     |
| `password`              | `password`                 | text      | 任意（`'credential'` 行のみ非 null） | scrypt ハッシュ（Better Auth 既定）。OAuth 行では `null` |
| `createdAt`             | `created_at`               | timestamp | ✓                                    | 要検証（§10-2）                                          |
| `updatedAt`             | `updated_at`               | timestamp | ✓                                    | 同上                                                     |

- **インデックス判断**: サインイン時、Better Auth は `email` で `users` を引いた後
  `accounts` を `userId`（+ `providerId = 'credential'`）で絞り込む。CLI が生成しない場合は
  `accounts.user_id` への明示インデックスを追加する（`sessions.user_id` と同じ理由・同じ
  優先度。2 名利用規模では実利益はほぼ無いが規約整合のため推奨）。複合インデックス
  `(user_id, provider_id)` までは本 feature の規模（2 アカウント）では不要と判断する。

### 1.4 `verifications`

| 列（想定）   | 物理列名（想定） | 型        | 必須                                                  | 備考                                           |
| ------------ | ---------------- | --------- | ----------------------------------------------------- | ---------------------------------------------- |
| `id`         | `id`             | text      | ✓（PK）                                               | -                                              |
| `identifier` | `identifier`     | text      | ✓                                                     | 第一段では未使用（メール検証・リセット未導入） |
| `value`      | `value`          | text      | ✓                                                     | 同上                                           |
| `expiresAt`  | `expires_at`     | timestamp | ✓                                                     | 同上                                           |
| `createdAt`  | `created_at`     | timestamp | ✓（想定。Better Auth コアは任意の場合もある。要検証） | -                                              |
| `updatedAt`  | `updated_at`     | timestamp | 同上                                                  | -                                              |

- Better Auth の必須テーブルであるため作成するが、`requireEmailVerification: false` かつ
  `sendResetPassword` 未使用（U-3）のため、第一段では**行が一切作られない想定**（要検証）。
- 追加インデックス不要（未使用のため）。

### 1.5 `rate_limits`（条件付き。`rateLimit.storage: 'database'` を採る場合のみ作成）

Orchestrator が確認した Better Auth 1.7.5 のコアスキーマは `id` / `key` / `count` /
`lastRequest` の 4 列であり、設計書 §DB 設計の表（`key` を PK とする 3 列）とは異なる。
設計書は「列名・型・インデックスは CLI 出力を正とし、contract-designer が確定する」と明示的に
委任しているため、本書は Orchestrator 確認済みの 4 列構成を正として採用する（§11-1 に記録。
設計判断の変更ではなく、設計書が委任した精度の確定）。

| 列（想定）    | 物理列名（想定） | 型      | 必須    | UNIQUE / インデックス                                                      | 備考                                                                   |
| ------------- | ---------------- | ------- | ------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `id`          | `id`             | text    | ✓（PK） | -                                                                          | -                                                                      |
| `key`         | `key`            | text    | ✓       | UNIQUE を推奨（contract-designer 判断。1 キー = 1 行の upsert 対象のため） | 例: `sign-in/email:<IP>`（形式は Better Auth 内部実装依存。要検証）    |
| `count`       | `count`          | integer | ✓       | -                                                                          | ウィンドウ内の試行回数                                                 |
| `lastRequest` | `last_request`   | integer | ✓       | -                                                                          | epoch ミリ秒（`timestamp` 型ではなく `integer` の想定。要検証・§10-3） |

- `rate_limits` は事実上の試行回数の記録になる（設計書 §ログと監視）。専用ダッシュボードは
  作らない。
- **`rateLimit.storage: 'database'` の可否自体が要検証**（設計書 D-5 / R-3）。不可なら
  `rate_limits` テーブルは作らず memory ストレージを受容する（この場合、本テーブルは
  migration から除外する。ADR-0022 の残るリスクに記載済み）。

### 1.6 `passkeys`（第二段。本契約の対象外）

設計書 D-13 のとおり、第一段の migration には含めない。第二段で `cli.config.ts` に
`passkey()` プラグインを足して再生成し `0011_*.sql` を作る。

### 1.7 migration 番号

`apps/web/src/db/migrations/meta/_journal.json` の最新エントリは `idx: 9`
（`tag: "0009_shopping_list_pantry_coverage"`）。よって本 feature の migration は
**`0010_*.sql`**（`drizzle-kit generate` が付与するタグ語は実行時にランダム決定されるため
ファイル名の接尾辞は確定しない。番号 `0010` のみ契約として固定する）。

`db:generate` 実行後、**既存 9 テーブルへの `ALTER` が 1 行も含まれないこと**を目視確認する
（設計書 §移行とリリース手順 1・§DB 設計手順 5）。これは契約テスト観点として test-designer に
引き継ぐ（§9-1）。

### 1.8 `packages/infrastructure/src/index.ts` への追記

既存パターン（`export * as schema from './db/schema';`）に倣い、以下を追記する
（設計書 D-6 手順 3。実装は implementer）:

```ts
export * as authSchema from './db/auth-schema';
```

`packages/infrastructure` は `better-auth` パッケージ自体には依存しない（テーブル定義のみ）。

---

## 2. 環境変数契約

### 2.1 追加

| 変数                 | 必須                                                                     | 値の要件                                           | 生成方法                  | スコープ                                                                                                   |
| -------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET` | production（Preview 含む）で必須。dev/test は未設定で認証スキップ（D-3） | 32 バイト以上（B-09）。Cookie 署名の根拠           | `openssl rand -base64 32` | **Preview と Production で別値**（別々に生成・登録）                                                       |
| `BETTER_AUTH_URL`    | 任意（Production のみ設定）                                              | `https://cookpit-web.vercel.app`（本番 URL固定値） | -                         | Production のみ。Preview / local は未設定のまま（`trustedOrigins` の `VERCEL_URL` 等に推定を委ねる。D-12） |

### 2.2 削除

| 変数                  | 理由                                             |
| --------------------- | ------------------------------------------------ |
| `BASIC_AUTH_USER`     | Basic 認証コードの削除に伴い不要（F-14 / AC-08） |
| `BASIC_AUTH_PASSWORD` | 同上                                             |

`apps/web/playwright.config.ts` の `basicAuthUser` / `basicAuthPassword` /
`httpCredentials` 組み立てブロック（L16-24, L37）も同時に削除する（F-14 の対象。§9-4）。

### 2.3 スクリプト用（`.env` には保存しない。実行時にシェル変数として渡すか対話入力）

| 変数                 | 必須                                        | 用途                                                     |
| -------------------- | ------------------------------------------- | -------------------------------------------------------- |
| `AUTH_USER_EMAIL`    | ✓（両スクリプト共通）                       | 対象アカウントのメールアドレス                           |
| `AUTH_USER_NAME`     | `auth-create-user` のみ必須                 | `users.name`（表示名。ログインフォームには入力欄が無い） |
| `AUTH_USER_PASSWORD` | 任意。未設定なら TTY 対話入力（エコー無し） | 発行 / 再設定するパスワード                              |

これらは `.env` へ常設保存すると資格情報がリポジトリ近傍のファイルに残り続けるため、
`.env.example` にはコメント付きの説明のみを置き、値としては設定しない（§2.4 の期待形）。

### 2.4 `apps/web/.env.example` の期待形

現状（実測）:

```
DATABASE_URL=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=  # mailto: か https:// のみ
CRON_SECRET=  # openssl rand -base64 32
BASIC_AUTH_USER=  # ':' を含めないこと（RFC 7617。含めると分割が曖昧になる）
BASIC_AUTH_PASSWORD=  # openssl rand -base64 24。公開後の防御はこの値の強度が全て
# TZ は設定しない。Vercel の予約環境変数のため登録できない（AWS Lambda が定義済み）。
# 期限判定の JST 固定は packages/application/src/pantry/expiry.ts でコード上に明示する。
```

変更後（提案。implementer が反映）:

```
DATABASE_URL=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=  # mailto: か https:// のみ
CRON_SECRET=  # openssl rand -base64 32
BETTER_AUTH_SECRET=  # openssl rand -base64 32（32 バイト以上）。Preview と Production で別値を生成すること。
BETTER_AUTH_URL=  # 本番のみ設定: https://cookpit-web.vercel.app（Preview / local は未設定のまま）
# アカウント発行・パスワード再設定は pnpm --filter @cookpit/web auth:create-user / auth:set-password。
# AUTH_USER_EMAIL / AUTH_USER_NAME / AUTH_USER_PASSWORD は .env に保存せず、
# 実行時にシェル変数として渡すか、AUTH_USER_PASSWORD は対話入力を使うこと。
# TZ は設定しない。Vercel の予約環境変数のため登録できない（AWS Lambda が定義済み）。
# 期限判定の JST 固定は packages/application/src/pantry/expiry.ts でコード上に明示する。
```

`BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` の 2 行を削除、`BETTER_AUTH_SECRET` /
`BETTER_AUTH_URL` の 2 行とスクリプト用コメントを追加。

---

## 3. Cookie 契約

| 項目                         | 値                                                                                                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cookiePrefix`               | `cookpit`（`advanced.cookiePrefix`。設計書提案どおり確定）                                                                                                                                                                        |
| セッション Cookie 名         | HTTP: `cookpit.session_token` / HTTPS: `__Secure-cookpit.session_token`（Better Auth が `useSecureCookies` 判定時に自動付与。判定条件は §10-4 要検証）                                                                            |
| キャッシュ Cookie 名         | HTTP: `cookpit.session_data` / HTTPS: `__Secure-cookpit.session_data`                                                                                                                                                             |
| 属性                         | `HttpOnly; Secure（HTTPS 時のみ）; SameSite=Lax; Path=/`                                                                                                                                                                          |
| `Max-Age`                    | `session_token`: 2,592,000 秒（30 日。`expiresIn`）。`session_data` の Max-Age は要検証（§10-5。`cookieCache.maxAge`（300 秒）と同じ短い値になるか、`session_token` と同じ 30 日で内容だけが 5 分で陳腐化扱いになるかは実装依存） |
| `getSessionCookie` の prefix | Proxy が `getSessionCookie(request, { cookiePrefix: 'cookpit' })` で早期 return 判定に使う値と、`createAuth()` の `advanced.cookiePrefix` は**必ず同じ値**にする（設計書 実装上の罠 2。ずれると全員締め出し）                     |

### 3.1 `session_data`（Cookie キャッシュ）の意味

- `cookieCache: { enabled: true, maxAge: 300 }`（5 分。U-2 / D-4）。
- 内容: セッション行 + ユーザー行を署名付きでシリアライズした値（表示名・メール等を含む。
  B-08: ブラウザの Cookie 上限 4KB に収まることを実装後に確認する。設計書は「数百バイト想定」）。
- `maxAge`（5 分）以内の再訪問は Proxy が DB を参照せず、署名検証のみでセッションを認める
  （設計書 §性能）。`maxAge` を超えると次のリクエストで DB 再検証が走り、成功すれば
  `Set-Cookie` で `session_data` が更新される（Proxy が `getSetCookie()` の値を応答へ
  転送する。設計書 実装上の罠 1）。

### 3.2 失効時の挙動

- ログアウト（`sign-out`）: サーバーが `sessions` 行を DELETE し、`Set-Cookie` で
  `session_token` / `session_data` を無効化（`Max-Age=0` 等。想定・要検証）。
- 他端末失効（`revokeOtherSessions`）・パスワード変更（`revokeOtherSessions: true`）:
  対象端末の `sessions` 行が DB から DELETE される。**ただし対象端末の `session_data`
  Cookie キャッシュが署名的には依然有効な間（最大 `maxAge` = 5 分）、Proxy はキャッシュを
  信頼して通してしまう可能性がある**（Cookie キャッシュは DB を参照しないことが目的の
  機能であるため、DB 側の失効を即座には反映できないのはこの機能の設計上の特性である）。
  設計書 §性能は「失効が反映されるまでの遅延だけが延びる」としてこの特性を明示的に受容して
  いる。契約上は「他端末失効の効果は最大 5 分遅延しうる」ことを明記する（N-05 の観察窓として
  test-designer へ引き継ぐ。§9-2）。
- Cookie 署名不一致・改ざん: 即座に未認証（B-01 / E-08）。キャッシュ・DB 検証どちらの経路でも
  同じ結果になる。

---

## 4. Proxy 応答契約

設計書 §API 設計「Proxy の応答規約」表をそのまま契約として固定する（設計書のコード例
`proxy.ts` §バックエンド設計と一致）。

| 条件                                                | ステータス   | `Location`                   | `Cache-Control`                                       | body                                     |
| --------------------------------------------------- | ------------ | ---------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| `BETTER_AUTH_SECRET` 未設定 × `NODE_ENV=production` | 503          | -                            | `no-store`                                            | なし                                     |
| 同 × production 以外                                | （通過）     | -                            | -                                                     | -                                        |
| `/login` × セッション有効                           | 302          | `/`                          | `no-store`（Orchestrator 統合判断 2026-09-17。§11-2） | -                                        |
| `/login` × セッション無し                           | （通過）     | -                            | -                                                     | -                                        |
| 保護パス × セッション有効                           | （通過）     | -                            | -                                                     | `Set-Cookie`（キャッシュ更新時のみ転送） |
| 保護パス（非 `/api/`）× セッション無し              | 302          | `/login?next=<次項のグラマ>` | `no-store`                                            | -                                        |
| `/api/*` × セッション無し                           | 401          | -                            | `no-store`                                            | `{ "error": "Unauthorized" }`            |
| DB 到達不能で検証不能                               | （例外伝播） | -                            | -                                                     | Next.js 既定 500                         |

`isApiPath(pathname)` は `pathname === '/api' || pathname.startsWith('/api/')` で判定する
（`/api/` プレフィックスのみで 401/302 を切り替える。`Accept` ヘッダーは見ない）。

**`/api/auth/*` は上表の対象外**（SEC-5。`docs/reviews/better-auth-login.security.md`）:
matcher（§4.2）が `api/auth/` を除外するため Proxy を経由せず、上表の 503 は及ばない。
`BETTER_AUTH_SECRET` 未設定 × `NODE_ENV=production` では Better Auth 自身が既定 secret を
拒否して throw し（`better-auth/dist/context/create-context.mjs`）、Next.js 既定の **500**
になる（503 ではない）。保護対象（Proxy 配下）はすべて 503 になるため実害は無いが、
fail-closed の応答コードが経路によって異なる点は契約として明記する。

### 4.1 `next` パラメータの許可文法（B-02。ABNF 風）

```
next-param    = safe-next / "/"
safe-next     = "/" no-slash-backslash *VCHAR
no-slash-backslash
              = %x20-2E / %x30-5B / %x5D-7A / %x7C / %x7E / %x80-10FFFF
                ; "/" (U+002F) と "\" (U+005C) を除く任意の 1 文字
                ; %x00-1F（TAB/LF/CR 等の C0 制御文字）と %x7F（DEL）は SEC-1 により
                ; 明示的に除外する（2026-09-17 是正。旧版は %x00-2E を許可しており、
                ; WHATWG URL パーサが解決前に TAB/LF/CR を除去する挙動と組み合わさって
                ; オープンリダイレクトを許していた。docs/reviews/better-auth-login.security.md）
                ; 2 文字目が存在しない場合（値が "/" 単体）も許可
```

- 制約: `safe-next` の総文字数（UTF-16 コード単位。`encodeURIComponent` 前の生値）が
  **2,000 以下**であること。超過した場合、パターンに一致しない場合、パラメータ自体が
  存在しない場合は、いずれも既定値 `/` を採用する（`safe-next` にも `/` 自体にも
  一致するため、結果として `next-param` は常に `/` にフォールバックできる）。
- 適用箇所は 2 箇所で、同一文法を共有する:
  1. **サーバー側生成**（`buildNextParam`。`proxy.ts`）: 未認証の画面ナビゲーションで
     `request.nextUrl` の `pathname` + `search` から組み立てる。クライアントナビゲーションが
     付ける `_rsc` クエリは組み立て前に `searchParams.delete('_rsc')` で除去する（B-06）。
     この経路で生成される値は常に文法に適合する（Proxy 自身が生成するため）。
  2. **クライアント側再検証**（`safeNext`。`login-form.tsx`）: URL のクエリパラメータ
     `next`（ユーザー/攻撃者が自由に指定できる未信頼入力）を、送信直前に同じ文法で再検証する。
     一致しなければ `/` を採用する。**この再検証を省略してはならない**（サーバーが生成した
     値を信頼して素通しすると、直接 URL を叩かれた場合のオープンリダイレクト防御が働かない）。
- 具体例（E-07 / B-02 の境界値）:

  | 入力                                  | 判定                       | 理由                               |
  | ------------------------------------- | -------------------------- | ---------------------------------- |
  | `/pantry`                             | 許可                       | 先頭 `/`、2 文字目 `p`             |
  | `/pantry?x=1`                         | 許可                       | クエリ込みで許可                   |
  | `/`                                   | 許可                       | `safe-next` の 2 文字目が無い形    |
  | （未指定）                            | `/` に既定                 | パラメータ無し                     |
  | `//evil.com`                          | `/` に既定                 | 2 文字目が `/`（スキーム相対 URL） |
  | `/\evil.com`                          | `/` に既定                 | 2 文字目が `\`                     |
  | `https://evil.com/`                   | `/` に既定                 | 先頭が `/` でない                  |
  | 2,001 文字の `/aaa...`                | `/` に既定                 | 長さ超過                           |
  | `/pantry?_rsc=abcd`（サーバー生成時） | `/pantry`（`_rsc` 除去後） | B-06                               |
  | `/<TAB>//evil.com`                    | `/` に既定                 | 2 文字目が制御文字（%x09）。SEC-1  |
  | `/<LF>//evil.com`                     | `/` に既定                 | 2 文字目が制御文字（%x0A）。SEC-1  |
  | `/<CR>//evil.com`                     | `/` に既定                 | 2 文字目が制御文字（%x0D）。SEC-1  |

### 4.2 除外パス（matcher）

```
'/((?!(?:favicon\\.ico|manifest\\.webmanifest|sw\\.js)$|_next/static/|icons/|api/cron/|api/auth/).*)'
```

現行 matcher（Basic 認証時代）に `api/auth/` を 1 語追加しただけ。除外対象:
`favicon.ico`（末尾一致）/ `manifest.webmanifest`（末尾一致）/ `sw.js`（末尾一致）/
`_next/static/` 配下 / `icons/` 配下 / `api/cron/` 配下 / `api/auth/` 配下（新規）。
セグメント境界での前方一致（`/api/authx` は除外されず保護対象。B-07）。`/login` は
matcher から除外しない（Proxy を通し、ログイン済みなら `/` へ 302 する）。

---

## 5. `/api/auth/*` の利用契約

Hono マウント: `app.on(['GET', 'POST'], '/auth/*', (c) => getAuth().handler(c.req.raw))`
（設計書 §API 設計「Hono マウント」）。`basePath('/api')` と合わせて `/api/auth/*`。
`AppType`（RPC 用の `routes` チェーン）には含まれない（§6 参照）。

| メソッド + パス                        | 呼び出し元                                                                                                                                                                                        | リクエスト                                                                        | 成功レスポンス（想定・要検証）                                                                           | エラー（想定・要検証）                                                                                                         | レート制限                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `POST /api/auth/sign-in/email`         | `authClient.signIn.email({ email, password })`                                                                                                                                                    | `{ email: string, password: string }`                                             | 200 `{ redirect: boolean, token: string, user: {...} }` + `Set-Cookie`（`session_token`/`session_data`） | 401/403 `{ code: 'INVALID_EMAIL_OR_PASSWORD', message: string }`（コード名要検証） / 429（試行過多。`Retry-After` 有無要検証） | 既定 3 req/10s（`/sign-in/email` 個別ルール）  |
| `POST /api/auth/sign-out`              | `authClient.signOut()`                                                                                                                                                                            | ボディなし                                                                        | 200 `{ success: true }`（想定）+ `Set-Cookie`（両 Cookie を失効）                                        | 通常失敗しない（Cookie 無しでも 200 想定・要検証）                                                                             | 既定 100 req/60s（グローバル既定）             |
| `GET /api/auth/get-session`            | サーバー内 `getAuth().api.getSession({ headers })`（HTTP を経由しない関数呼び出し。`authClient` からは**未使用**）                                                                                | ヘッダーのみ                                                                      | `{ session: {...}, user: {...} } \| null`（想定）                                                        | -                                                                                                                              | 対象外（内部呼び出しがカウント対象かは要検証） |
| `POST /api/auth/change-password`       | `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })`                                                                                                          | `{ currentPassword: string, newPassword: string, revokeOtherSessions?: boolean }` | 200 `{ token, user }`（想定）                                                                            | 400/401 現在パスワード誤り（コード想定 `INVALID_PASSWORD`）。`session.freshAge` 要件による 401 の可能性あり（要検証・§10-6）   | 既定 100 req/60s                               |
| `GET /api/auth/list-sessions`          | **未使用**（第一段 UI から呼ばれない。マウントはされる）                                                                                                                                          | ヘッダーのみ                                                                      | 200 `Session[]`（想定）                                                                                  | -                                                                                                                              | 既定 100 req/60s                               |
| `POST /api/auth/revoke-other-sessions` | `authClient.revokeOtherSessions()`                                                                                                                                                                | ボディなし                                                                        | 200 `{ status: true }`（想定）                                                                           | -                                                                                                                              | 既定 100 req/60s                               |
| `POST /api/auth/sign-up/email`         | **HTTP では常に閉鎖**（`getAuth()` は `disableSignUp: true`）。スクリプトは別インスタンス（`allowSignUp: true`）の `auth.api.signUpEmail()` を**関数呼び出しで**直接叩き、HTTP を経由しない（§7） | -                                                                                 | -                                                                                                        | HTTP 越しに叩かれた場合 4xx（コード想定 `SIGN_UP_DISABLED`。要検証。F-04 / E-05）                                              | -                                              |
| `GET /api/auth/ok`                     | テスト（疎通確認。Better Auth 組み込みの health エンドポイント）                                                                                                                                  | -                                                                                 | 200                                                                                                      | -                                                                                                                              | -                                              |

- **エラー応答の共通形**: Better Auth のエラーは JSON `{ "code": string, "message": string }`
  （Orchestrator 確認済み）。個々の `code` 値は本書では「想定」であり、implementer が実装時に
  実応答から確認して本書を更新する。
- `list-sessions` は設計書 §API 設計の使用エンドポイント表には明記が無いが、Better Auth の
  組み込みエンドポイントとして自動的にマウントされる。第一段 UI（`/more/account`）は
  「他端末セッションの失効」を 1 操作で行うのみでセッション一覧は表示しない設計（要件対象外
  「セッション一覧画面」）。本書はこれを「マウント済みだが第一段では未使用」として扱う
  （§11-2）。
- **ログイン画面の失敗文言分岐**は HTTP ステータスのみで行い、Better Auth のエラーメッセージ
  本文は表示しない（設計書 §エラー処理・§セキュリティ「列挙」対策）: 401/403 →
  「メールアドレスまたはパスワードが違います。」、429 →
  「試行回数が多すぎます。しばらく待ってから再度お試しください。」。
- **レート制限のクライアント IP 解決**（SEC-2。2026-09-17 追記）: `create-auth.ts` の
  `advanced.ipAddress.ipAddressHeaders` に `['x-vercel-forwarded-for', 'x-forwarded-for']` を
  設定する。Better Auth の既定 `x-forwarded-for` 単独は複数値ヘッダ（多段プロキシ・詐称）を
  一切信頼せず `null` に落とし、レート制限キーが全利用者共有の `no-trusted-ip|<path>` へ
  退避する（総当たり防御の実質無効化、または正規ログインの巻き添え 429）。Vercel が付与し
  クライアントからは上書きできない `x-vercel-forwarded-for`（単一値）を優先することで、
  `rate_limits.key` を IP 別に分離する。Preview での実値確認は BB-12/13
  （`docs/tests/better-auth-login.md` §8）に委ねる。

---

## 6. クライアント側契約

### 6.1 `useApiAction` の 401 契約（D-8 / F-13 / E-03）

`apps/web/src/lib/use-api-action.ts`（現状実測: 401 の特別扱いは無く、単に
`API_FAILURE_MESSAGE` を表示する）を次の契約へ変更する:

- `!response.ok && response.status === 401` のとき:
  - `errorMessage` は設定しない（`API_FAILURE_MESSAGE` を出さない）。
  - `window.location.assign('/login?next=' + encodeURIComponent(location.pathname + location.search))`
    を呼ぶ。
  - `silent: true` の呼び出し（focus 時の再同期など）でも遷移する（セッション切れは
    ユーザーに見せるべき状態のため、`silent` によるフィードバック抑制の対象外とする）。
  - `pendingKeys` の解除は行う（`finally` は通常どおり実行してよい。遷移が主効果であり
    実行中フラグの残留は実害が無いが、既存の `finally` ブロックの構造を壊さない）。
- 401 以外（400/404/422/429/500 等）は現状どおり `resolveFailureMessage` を使う。
- テスト（`use-api-action.test.tsx`）は `window.location` を happy-dom でスタブして検証する
  （§9-5）。

### 6.2 Hono RPC 型（`AppType`）は変更なし

`/api/auth/*` は `app.on(['GET','POST'], '/auth/*', ...)` で**チェーン外**にマウントされる
（`export const routes = app.route('/health', healthRoute)...` の対象に含めない。設計書
§API 設計）。よって `AppType`（`typeof routes`）にはプロパティが増えず、既存の
`client.api.pantry.*` 等 RPC 型は不変。`better-auth/react` の `createAuthClient` は
Better Auth 独自の型付け（Hono RPC とは別経路）で `/api/auth/*` を呼ぶ。

### 6.3 `packages/api-contract`（Zod）は変更なし

- 新規スキーマファイルは作らない。ログインフォームの入力検証は「空欄チェックのみ」
  （クライアント側の最小バリデーション）とし、実質的な検証（メール形式・パスワード長
  12〜128 文字等）は Better Auth のサーバー側検証に委ねる（設計書 §契約骨子）。
- `subscribeToExpiryAlertSchema` 等、既存 8 ファイル・`index.ts` の 8 行は本 feature で
  一切変更しない。
- 認証情報（`email` / `password`）を Application 層の DTO や UseCase の入力に混ぜることは
  ない（U-1。ドメイン境界の外側で完結する）。

---

## 7. スクリプト契約

| スクリプト                                     | 入力                                                                                                                                     | 出力・終了コード（提案）                                                                                                                                                                                              | 冪等性                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @cookpit/web auth:create-user`  | `DATABASE_URL`（必須）、`AUTH_USER_EMAIL`（必須）、`AUTH_USER_NAME`（必須）、`AUTH_USER_PASSWORD`（任意。無ければ TTY 対話・エコー無し） | `0`: 成功（`users` + `accounts` 各 1 行作成）。`1`: 入力不正（必須 env 欠落・非 TTY で `AUTH_USER_PASSWORD` 無し・パスワード 12 文字未満・**既存 email**）。`2`: DB 接続失敗（`DATABASE_URL` 到達不能・認証エラー）   | **非冪等**。同一 `AUTH_USER_EMAIL` での再実行は `1`（既存 email）で失敗し、行を作らない（E-11）                  |
| `pnpm --filter @cookpit/web auth:set-password` | `DATABASE_URL`（必須）、`AUTH_USER_EMAIL`（必須。**既存**ユーザーである必要あり）、`AUTH_USER_PASSWORD`（任意。同上）                    | `0`: 成功（`accounts.password` 更新 + 対象ユーザーの `sessions` 全削除）。`1`: 入力不正（必須 env 欠落・非 TTY で `AUTH_USER_PASSWORD` 無し・パスワード 12 文字未満・**該当ユーザーが存在しない**）。`2`: DB 接続失敗 | **冪等**（再実行可）。同じ新パスワードで 2 回実行しても結果は同じ（パスワード更新 + 全セッション削除の繰り返し） |

- 終了コードの割り当て `0`/`1`/`2` は本書の提案であり、Orchestrator プロンプトの例示
  （0 成功 / 1 入力不正・既存 email / 2 DB 接続失敗）をそのまま採用した。implementer が
  実装時に細分化する場合（例: バリデーションエラーと重複 email を別コードにする）は本書を
  更新する。
- パスワードはコマンドライン引数に渡さない（シェル履歴・`ps` に残さないため。F-05）。対話入力は
  `node:readline` の `question` をエコー無効（`stdin.setRawMode`）で行う想定（設計書
  §スクリプト）。
- `BETTER_AUTH_SECRET` は両スクリプトとも不要（パスワードハッシュは secret に依存せず、
  スクリプトはセッションを発行しないため署名も不要。設計書 §スクリプト）。
- DB 接続は `DATABASE_URL` が `pglite://` なら `drizzle-orm/pglite`、それ以外は
  `createTxConnection`（WebSocket）を使う（設計書 D-18 の回避策）。
- 標準出力・標準エラー: 資格情報（メール・パスワード）は出力しない（設計書 §ログと監視の
  作法に揃える）。成功時は「作成しました」等の日本語メッセージのみ。

---

## 8. 後方互換性判定

**破壊的変更なし。DB は追加のみ、既存 API 契約・既存 Zod スキーマ・既存 Hono ルートは
一切変更しない。** 判定根拠:

- **DB**: 既存 9 テーブル（`recipes` 〜 `push_subscriptions`）の列定義・インデックス・
  `NOT NULL` 制約は変更しない。migration `0010` は新規 4〜5 テーブルの `CREATE TABLE` のみ
  （§1）。既存データへの影響は無い。
- **`packages/api-contract`**: 変更なし（§6.3）。既存クライアント（`client.api.pantry.*` 等）の
  型・実行時挙動に影響しない。
- **Hono ルート**: 既存 9 ルート（`health` / `recipes` / `products` / `stores` /
  `meal-plans` / `shopping-lists` / `pantry` / `push` / `cron`）のスキーマ・エラー処理
  （`app.onError`）は変更しない。`/api/auth/*` は新規追加のみで、既存パスと衝突しない。
- **`AppType`（Hono RPC 型）**: 変更なし（§6.2）。
- **既存クライアント（PWA インストール済み 2 端末）への影響**:
  - ブラウザ/OS に保存された Basic 認証資格情報は単に使われなくなるだけで、削除・失敗の
    通知は不要（無害）。
  - 切替後の初回アクセスはセッション Cookie を持たないため、画面ナビゲーションは
    `302 /login?next=<元のパス>` になる（§4）。ログイン 1 回で以後 30 日は再ログイン不要
    （F-08）。
  - PWA の再インストールは不要。`manifest.webmanifest` / `sw.js` / `icons/*` は
    引き続き未認証で取得できる（除外パス維持。§4.2）。
  - Service Worker のキャッシュに残る旧 API レスポンス自体は本 feature で変更していないため
    データ形は壊れない（認証層のみの変更。§4 の 401/302 の挙動変更が SW の `NetworkFirst`
    キャッシュ判定に影響する点は設計書 D-9 / §実装上の罠 で対応済み）。
- **`push_subscriptions` / cron の契約不変**: `packages/api-contract` の
  `push-subscription.schema.ts` は変更しない。`GET /api/cron/expiry-alerts` は
  `Authorization: Bearer $CRON_SECRET` のインライン判定のまま（`/api/cron/*` は Proxy の
  matcher で除外済み。§4.2）。`push_subscriptions` テーブルにユーザー紐づけ列を追加しない
  （対象外。U-1 と同じ理由）。
- 結論: 移行・バージョニング方針（互換性破壊時に必要となるもの）は**不要**。ユーザー確認を
  要する後方互換性の論点は無い。

---

## 9. 契約テスト観点（test-designer への橋渡し）

以下は観点の列挙であり、テストケースの詳細設計・実装は test-designer / implementer の責務。

### 9-1. DB / migration

- `db:generate` で生成される `0010_*.sql` に、既存 9 テーブルへの `ALTER` 文が**含まれない**
  こと（新規 `CREATE TABLE` のみ）。
- 新規 5 テーブル（`rate_limits` は `storage: 'database'` を採る場合のみ）が生成されること。
- `users.email` / `sessions.token` の UNIQUE 制約が生成されること。
- `sessions.user_id` / `accounts.user_id` へのインデックスが CLI 生成物に含まれるか確認し、
  無ければ追加後に再生成すること（§1.2 / §1.3 の contract-designer 判断の反映確認）。
- PGlite（`packages/infrastructure/tests/testing/create-test-db.ts`）は認証テーブルを
  含めない（設計書 §DB 設計「PGlite での扱い」）ことの回帰確認（誤って追記しないこと）。

### 9-2. Cookie 属性

- `session_token` / `session_data` の名前が `cookiePrefix: 'cookpit'` を反映すること
  （HTTP/HTTPS で `__Secure-` の有無が切り替わること）。
- 属性 `HttpOnly` / `SameSite=Lax` / `Path=/` / `Max-Age`（30 日）の値。
- ログアウト後に両 Cookie が無効化される（`Set-Cookie` で失効させる）こと。
- 他端末失効・パスワード変更後、**最大 5 分（`cookieCache.maxAge`）まで旧端末が通過しうる**
  遅延特性（§3.2）を「許容される既知の挙動」として記録し、誤ってバグ扱いしないこと。実機/
  結合テストでは「5 分以内に再検証すれば失効が反映される」ことを確認する形にとどめる。

### 9-3. Proxy 応答（302 / 401 / 503）

- `next` の許可文法（§4.1）の境界値: `/pantry`・`/`・未指定・`//evil.com`・`/\evil.com`・
  絶対 URL・2,001 文字超・`_rsc` 除去。
- 401 JSON の形が `cron.ts` の `{ "error": "Unauthorized" }` と一致すること、
  `Cache-Control: no-store` が付くこと。
- `BETTER_AUTH_SECRET` 未設定 × production → 503（本文なし・`Cache-Control: no-store`）。
  × 非 production → 通過。
- `/login` × 有効セッション → 302 `/`（**`Cache-Control` が付かない**ことを §4 の表どおり
  確認。付けてしまうと契約からの逸脱）。`/login` × 無効セッション → 通過。
- matcher の境界: `/api/authx` は保護対象（除外されない）、`/api/auth/...` は除外される
  （B-07）。

### 9-4. `sign-up` 拒否 / 認証エンドポイント

- `POST /api/auth/sign-up/email` を HTTP で叩くと 4xx になること（F-04 / E-05。正確な
  ステータス・コードは実測して確定）。
- `POST /api/auth/sign-in/email` の誤資格情報応答が「どちらが誤りか区別しない」同一メッセージ
  になること（E-01）。
- レート制限: 短時間の連続サインイン試行で 429 になること（E-06。既定 3 req/10s を実測で
  確認）。
- `playwright.config.ts` から `httpCredentials` 組み立てブロックが削除されていること
  （F-14 の回帰確認）。

### 9-5. クライアント（`useApiAction`）

- 401 応答で `errorMessage` が設定されず、`window.location.assign` が
  `/login?next=<現在の pathname+search を encodeURIComponent したもの>` で呼ばれること。
- `silent: true` でも 401 では遷移すること。
- 400/404/422/429/500 では従来どおり `errorMessage` が設定され、遷移しないこと（回帰）。

### 9-6. スクリプト終了コード

- `auth-create-user`: 正常系 `0`、既存 email `1`、12 文字未満パスワード `1`、DB 接続失敗
  `2`。
- `auth-set-password`: 正常系 `0`、存在しないユーザー `1`、DB 接続失敗 `2`。パスワード変更後
  `sessions` が空になること（全端末失効。E-11 の設計と対応する範囲）。

---

## 10. 要検証事項の一覧

実装時に `@better-auth/cli generate` の実出力・実際の HTTP 応答・実測ログで確認し、
本契約書（該当箇所）を更新する。**2026-09-17、実装計画 Step 0〜3・7（implementer:
claude-sonnet-5）で 1〜4・6・8・12・14（cookiePrefix 部分）・15・16・18 を実測確認済み**
（詳細は各項目末尾に追記。5・7・9・10・11・13・14（generateId 部分）・17 は Step 4〜9 側の
作業または本番/Preview 実機確認が必要なため未解決のまま残す）。

1. **DB 列名の物理 casing**（§1 全体）: **実測確認: snake_case で確定**（`email_verified` /
   `created_at` / `provider_id` 等）。`pnpm dlx @better-auth/cli@1.4.21 generate` の実出力
   （`packages/infrastructure/src/db/auth-schema.ts`）で確認。§1 の「想定」列はそのまま
   確定値として扱ってよい。
2. **既存テーブルの `.defaultNow()` 慣習が CLI 生成物にも適用されるか**（§1.1〜1.4 の
   `createdAt`/`updatedAt`）: **実測確認: `createdAt` は全テーブルで `.defaultNow()` あり。
   `updatedAt` は `users`/`verifications` のみ `.defaultNow()` あり、`sessions`/`accounts` は
   `.defaultNow()` 無し（`$onUpdate` のみ。初回 INSERT 時はアプリケーション層が
   `new Date()` を渡すため DB 側 DEFAULT が無くても値は入る）**。
3. **`rate_limits.lastRequest` の型**（§1.5）: **実測確認: `bigint`（`mode: 'number'`。
   epoch ミリ秒）で確定**。`integer` でも `timestamp` でもない。
4. `drizzleAdapter` が `neon-http`（トランザクション不可）で動くか: **実測確認: 動く
   （フォールバック不要）**。`@better-auth/drizzle-adapter` のソース
   （`node_modules/.pnpm/@better-auth+drizzle-adapter@1.7.5.../dist/index.mjs`）を読むと、
   `db.transaction()` を呼ぶのは `config.provider === 'mysql'` の分岐内のみで、
   `provider: 'pg'`（本設計の設定）では常に `builder.returning()` を直接使う経路になり
   `db.transaction` を一切呼ばない。`config.transaction` も既定 `false`。よって
   `getDb()`（neon-http）をそのまま渡してよく、D-18 のフォールバック（`transaction: false`
   明示指定・WebSocket 接続切替）は不要。
5. **`Secure` Cookie 属性判定**（§3）: **実測確認（2026-09-17。B-01 対応の
   `IT-H-06` で `createAuth(...).handler(new Request(...))` へ HTTPS baseURL の
   実リクエストを送り確認）**: `Set-Cookie` は
   `__Secure-cookpit.session_token=...; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax`
   （契約書 §3 の想定どおり）。**ローカル dev（http）での `Secure` 省略判定は未検証のまま**
   （PGlite + 疑似 HTTPS リクエストでの確認にとどまる。実 HTTP・実機での確認は残余リスク）。
6. **`session.freshAge` がパスワード変更・他端末失効を妨げないか**（設計書 罠 8）:
   **実測確認: 妨げない。フォールバック不要**。`better-auth` のルート実装
   （`dist/api/routes/update-user.mjs`）で `changePassword` は `sensitiveSessionMiddleware`
   を使い、`freshAge` を検査する `freshSessionMiddleware` は使わない（`revokeOtherSessions`
   等の `dist/api/routes/session.mjs` も同様）。`freshSessionMiddleware` は
   `unlink-account`（OAuth 専用。本 feature 未使用）にのみ使われる。PGlite 上で
   サインイン直後に `changePassword` を呼んでも拒否されないことも実行確認済み。
7. `rateLimit.storage: 'database'` が単一プロセスで期待どおり動くか: **実測確認
   （2026-09-17。`IT-H-12`）: 動く**。`sign-in/email` を同一キーで 4 回連続呼ぶと 1〜3 回目は
   `401`、4 回目は `429`（`rate_limits` へ 1 行 upsert）。**サーバーレス環境（Vercel Function
   複数インスタンス）で期待どおり動くかは未検証のまま**（Preview の複数インスタンス相当の
   確認が必要。§DB 設計手順・Step 10 の運用確認に委ねる）。CLI 生成物に `rate_limits`
   テーブルが**含まれる**ことは実測確認済み（項目 3 参照）。
8. `drizzle-orm/pglite` 上で Better Auth のアダプタが動くか: **実測確認: 動く**。
   `createAuth({ db: drizzle(pglite, { schema: authSchema }) })` で
   `signUpEmail`→`signInEmail`→`getSession`→`changePassword` が例外なく完了することを
   確認済み（`apps/web/tests/server/auth/auth-route.test.ts` の PGlite サブテストとして
   実装）。§DB 設計「PGlite での扱い」の Neon 限定格下げは不要。
9. `429` 応答に `Retry-After` ヘッダーが付くか: **実測確認（2026-09-17。`IT-H-12`）**:
   標準の `Retry-After` ではなく **`X-Retry-After`**（値は残り秒数。既定ウィンドウ
   `/sign-in/email` = 10 のため `"10"`）が付く。本文は
   `{"message":"Too many requests. Please try again later."}`（`code` フィールドは無い。
   他のエラー応答と形が異なる点に注意）。
10. `sign-in/email` / `change-password` / `sign-out` / `revoke-other-sessions` の成功
    レスポンスボディの正確な形: **`sign-in/email` と `change-password` は実測確認
    （`{ token, user }`）**。`sign-up/email` も `{ token: null, user }`。**`sign-out` /
    `revoke-other-sessions` も実測確認（2026-09-17。`IT-H-06`/`IT-H-09` で
    `handler(new Request(...))` を実行）**: `sign-out` は `{"success":true}`、
    `revoke-other-sessions` は `{"status":true}`。change-password の失敗時は
    `{"message":"Invalid password","code":"INVALID_PASSWORD"}`（契約書 §5 の想定どおり）。
11. `POST /api/auth/sign-up/email` を HTTP 越しに叩いた場合の正確なステータスコードと
    `code`: **実測確認（reviewer、2026-09-17。`docs/reviews/better-auth-login.md` EV-03）**:
    `400 {"code":"EMAIL_PASSWORD_SIGN_UP_DISABLED"}`。`allowSignUp: false` のインスタンスで
    `.api.signUpEmail(...)` を直接呼ぶと例外が投げられる（メッセージ:
    `Email and password sign up is not enabled`）ことも確認済み（IT-H-02）。
12. `getSession({ returnHeaders: true })` の戻り形と `getSetCookie()` の利用可否:
    **実測確認: `{ response, headers }` の形で確定。`headers instanceof Headers === true`、
    `headers.getSetCookie()` は標準 `Headers` API どおり動作する**。`proxy.ts`
    （実装計画の概念コードのまま）で問題なく使える。
13. `cookieCache.strategy` の既定値: 未検証（`compact` の想定のまま。変更なし）。
14. `advanced.cookiePrefix: 'cookpit'` の最終値: **実測確認: 問題なし**。発行される
    Cookie 名が `cookpit.session_token` / `cookpit.session_data` になることを確認済み。
    既定 `generateId()`（UUID ではないランダム文字列。例: `6bOXDhafOuv55CvIdMxfSHtJaRzq5CSk`）
    であることも実測で確認（詳細な文字数・アルファベットの仕様までは未検証）。
15. `better-auth@1.7.5` が要求する `zod` のバージョンと本リポジトリの `zod@^4.4.3` の整合:
    **実測確認: 問題なし**（`pnpm install` で zod 関連の unmet peer 警告なし。
    `pnpm --filter @cookpit/web type-check` も green）。
16. Proxy バンドルでの `@/db/client.ts` の top-level `await import`（PGlite 分岐）が
    `pnpm build` を通るか: **実測確認: 通る（フォールバック不要）**。
    `pnpm --filter @cookpit/web build` が Proxy（`ƒ Proxy (Middleware)`）を含めて
    エラー・警告なく成功した。
17. `session_data` Cookie 自体の `Max-Age`: **実測確認（2026-09-17。`IT-H-06`）**:
    `Max-Age=300`（`cookieCache.maxAge` と同値。`session_token` の 30 日ではなく Cookie
    自体が 5 分で失効する）。属性は `session_token` と同じ `Path=/; HttpOnly; Secure;
SameSite=Lax`。
18. `tsx` を devDependency として追加してよいか: **実測確認: 追加して動作する**
    （`pnpm --filter @cookpit/web add -D tsx` → `tsx scripts/auth-create-user.ts` /
    `auth-set-password.ts` が正常動作）。`pnpm audit --prod --audit-level=high` は
    Step 8 の完了条件のため今回は未実施（対象外）。

（計 18 件のうち 1・2・3・4・5・6・7（サーバーレス複数インスタンス以外）・8・9・10・11・12・
14・15・16・17・18 を実測確認（2026-09-17、B-01 対応の `IT-H-06/07/08/09/12/13` 追加時に
5・7・9・10・11・17 を追加で解決）。7 の「Vercel の複数インスタンス + Neon」と 13・14
（generateId 詳細）は未解決のまま次段へ引き継ぐ。
`@better-auth/cli` の運用方式自体（devDependency ではなく `pnpm dlx` 都度実行）が
要検証事項に無かった追加の実装是正として判明した点は末尾の「設計書との差異メモ」に
追記する — 実装計画・設計判断の変更ではなくツールの導入方法の是正。）

---

## 11. 設計書との差異メモ

矛盾ではなく、設計書が明示的に contract-designer へ委任した精度を本書が確定した箇所、および
Orchestrator 提供事実と設計書の記述レベルの粒度差を記録する。設計判断（D-1〜D-19・Gate A 3 件・
ユーザー確定事項 U-1〜U-7）はいずれも変更していない。

1. **`rate_limits` テーブルの列構成**（§1.5）: 設計書 §DB 設計の表は `key` を PK とする
   3 列（`key` / `count` / `last_request`）を示すが、Orchestrator が確認した Better Auth
   1.7.5 のコアスキーマは `id`（PK）/ `key` / `count` / `lastRequest` の 4 列である。
   設計書自身が「列名・型・インデックスは CLI 出力を正とし、contract-designer が migration
   SQL の差分を確認して確定する」（§DB 設計冒頭）と明示的に委任しているため、本書は
   Orchestrator 確認済みの 4 列構成を正として採用した。設計判断（`storage: 'database'`
   採否・レート制限方針）自体への影響は無い。
2. **`/login` × 有効セッションの 302 に `Cache-Control` が付くか**（§4）: 設計書
   §API 設計の表は「`/login` × セッション有効 → `302 Location: /`」とだけ書き
   `Cache-Control` の記載が無いが、同設計書の `proxy.ts` コード例（§バックエンド設計）を
   読むと `NextResponse.redirect(new URL('/', request.url), 302)` の呼び出しにヘッダー
   指定が無く、`Cache-Control: no-store` は未認証系の応答（302 `/login?next=` / 401 / 503）
   にのみ付与されている。本書は表ではなくコード例を正として §4 の契約表を確定した（表の
   簡略化であり、コード例との矛盾ではないと判断）。
3. **`GET /api/auth/list-sessions` の扱い**（§5）: Orchestrator の「使用エンドポイント
   （第一段）」一覧には含まれるが、設計書 §API 設計の「Better Auth の使用エンドポイント」表
   には明記が無い。第一段 UI（`/more/account`）はセッション一覧を表示しない設計（要件対象外
   「セッション一覧画面」）のため矛盾ではなく、「マウント済みだが第一段では未使用」として
   本書に記載した（§5 の表）。

以上 3 件は設計書の確定事項（D-1〜D-19・Gate A 3 件）を覆すものではなく、Orchestrator へ
差し戻す必要のある矛盾ではないと contract-designer は判断した。異論があれば Orchestrator
経由で指摘されたい。

### 11-4. Orchestrator 統合判断（2026-09-17）

- §11-2 の `/login` × セッション有効の 302 は **`Cache-Control: no-store` を付ける**に変更した。
  Proxy が生成する応答（503 / 302 ×2 / 401）はすべて `no-store` で統一し、ログアウト直後に
  `/login` へ戻った際に中間キャッシュや SW が古い 302 を再利用する余地を残さない。
  302 は RFC 9111 上ヒューリスティックキャッシュの対象外だが、明示する方が安全で一貫する。
  設計書 §API 設計の表と `proxy.ts` コード例もこれに合わせる（implementer が実装時に反映）。

### 11-5. 実装時の是正（2026-09-17、Step 0〜3・7、implementer: claude-sonnet-5）

1. **`@better-auth/cli` の導入方式**: 計画 0-1 は「`pnpm dlx` の都度実行ではなく
   devDependency として固定する」としていたが、実際に `pnpm --filter @cookpit/web add -D
@better-auth/cli@1.4.21` すると、pnpm のピア依存解決が壊れ、`apps/web` の
   `better-auth@^1.7.5` 自身が誤った `@better-auth/core`（`better-call` の版違いの
   インスタンス）を掴み、`generate` 実行時に
   `SyntaxError: ... does not provide an export named 'kAPIErrorHeaderSymbol'` で失敗する
   ことを実測した（`@better-auth/cli@1.4.21` は内部で `better-auth@1.4.21` を要求しており、
   1.7.5 系と混在させると pnpm がこの特定の組み合わせで誤った peer ハッシュを選ぶ）。
   `@better-auth/cli` を devDependency から外し `pnpm dlx @better-auth/cli@1.4.21 generate
--config ... --output ...` へ切り替えると解消した（バージョンは同じ 1.4.21 に固定した
   ままであり、計画の「バージョンドリフトを避ける」意図は維持される。設計判断の変更ではなく
   導入コマンドの是正）。`apps/web/src/server/auth/cli.config.ts` のヘッダコメントに
   同内容を記載済み。
2. **`db:generate` が既存 `shopping_items`/`shopping_lists` テーブルへの `ALTER COLUMN ...
DROP DEFAULT` を 3 行生成する事象**: auth-schema 追加とは無関係の、`0009` 時点の
   drizzle-kit スナップショット（`meta/0009_snapshot.json`）に残っていた `"default": null`
   という古い形式のフィールドと、現行 `drizzle-kit@0.31.10` が生成するスナップショット形式
   （`default` キー自体を省略）との差分により発生する既存ドリフトであることを、
   auth-schema を含めない状態での `db:generate` でも同じ 3 行が出ることを確認して切り分けた
   （`0009_snapshot.json` の当該 3 列は元々 `default: null` で、実マイグレーション
   `0009_shopping_list_pantry_coverage.sql` にも `DEFAULT` 句は無い。実害の無いスナップショット
   形式差分）。本 feature の migration（`0010_majestic_namor.sql`）からはこの 3 行を手動で
   除去し、Better Auth 由来の 5 テーブル `CREATE TABLE` のみを含む形にした
   （`0010_snapshot.json` は自動生成のまま変更していない）。既存 9 テーブルの
   `schema.ts`／過去マイグレーションは一切変更していない。この既存ドリフト自体の恒久修正
   （`0009_snapshot.json` の形式更新等）は本 feature のスコープ外として次のタスクに委ねる。
3. **`apps/web/vitest.node.config.mts` / `vitest.dom.config.mts` の `resolve.alias` が
   `new URL(...).pathname` を使っていたため、本リポジトリが日本語ディレクトリ名
   （`個人開発`）配下に checkout されている環境で `vi.mock('@/...')` を含む既存テストが
   軒並み `Cannot find package '@/...'` で失敗する事象を発見・修正した**。`URL#pathname`
   は非 ASCII 文字を percent-encode するため、alias の解決先パスが実ファイルパスと
   一致しなくなる（`vi.mock` の内部解決だけが顕在化。通常の `import` 解決は別経路のため
   影響を受けない）。`fileURLToPath` に置き換えると解消し、ASCII のみのパスでは出力が
   同一のため CI 等の通常環境には影響しない。この 2 ファイルは実装計画の変更対象ファイル
   一覧に無いが、変更なしでは `pnpm --filter @cookpit/web test`（Step 2/3/7 の完了条件）が
   一切実行できないため実装計画の範囲内の対応として実施した（Orchestrator への報告事項）。
