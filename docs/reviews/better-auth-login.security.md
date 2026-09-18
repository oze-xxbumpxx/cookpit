# セキュリティレビュー: better-auth-login（第一段 / 実装フェーズ）

> security-reviewer（`claude-opus-5`）の報告を Orchestrator が保存した（2026-09-17）。
> security-reviewer は Write ツールを持たないため本文で返答し、内容は改変せずに転記している
> （HTML エスケープの復元のみ）。Orchestrator の処置は末尾「## Orchestrator の処置」に記す。

- レビュー日: 2026-09-17 / 対象: `feat/better-auth-login` の `main..HEAD`（58 ファイル）
- レビュー種別: security-reviewer（reviewer の一般品質レビューを補完。責務分離・テスト網羅・エラー処理全般は対象外）
- 判定: **Critical 0 / High 2 / Medium 3 / Low 4**。うち `BLOCK` 2 件（SEC-1・SEC-10）。
- 実行した証拠:
  - `node` による `safeNext` 正規表現の反証実行（WHATWG URL 解決まで）— E3
  - `pnpm audit --prod --audit-level=high`（exit=1 / 18 件: 1 low・7 moderate・8 high・2 critical）— E1
  - `vitest run` (node) `proxy.node.test.ts` / `auth-route.test.ts` / `auth-scripts.node.test.ts` / `sw-cache-plugins.node.test.ts` = 64 passed — E2
  - `vitest run` (dom) `login-form.test.tsx` = 15 passed — E2
  - `better-auth@1.7.5` 実装読解（`cookies/index.mjs` / `api/middlewares/origin-check.mjs` / `api/rate-limiter/index.mjs` / `@better-auth/core/dist/utils/ip.mjs` / `context/create-context.mjs` / `api/routes/session.mjs`）— E1

## 指摘一覧（重大度順）

| ID     | action    | impact | evidence | status                    | path:line                                                                                             | 根拠・再現                                                                                                                                                                                                                                          | 修正案                                                                                                                       |
| ------ | --------- | ------ | -------- | ------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| SEC-1  | BLOCK     | medium | E3       | open                      | `apps/web/src/app/login/_components/login-form.tsx:26`                                                | `safeNext` の `^\/(?![/\\])` が TAB/LF/CR を 2 文字目として許可。WHATWG URL パーサはこれらを解決前に除去するため `"/<LF>//evil.com"` → `https://evil.com/` に解決される（実行確認）                                                                 | 制御文字を先に弾く。下記 SEC-1 詳細                                                                                          |
| SEC-10 | BLOCK     | high   | E1       | open                      | `.github/workflows/ci.yml:151` / `apps/web/package.json:43`                                           | 本 PR が `package.json`/`pnpm-lock.yaml` を変更 → `deps_changed=true` → blocking な `pnpm audit --prod --audit-level=high` が作動。ローカル実行で exit=1（high 8 / critical 2、うち `next@16.2.12` critical ×2）                                    | 既存脆弱性の解消（`next>=16.3.3` 等）か、明示的な人間判断。SEC-10 詳細                                                       |
| SEC-2  | FOLLOW_UP | high   | E1       | open                      | `apps/web/src/server/auth/create-auth.ts:48`                                                          | レート制限のキーは `getIP()` 依存。`trustedProxies`/`ipAddressHeaders` 未設定のため既定は「単一値の `x-forwarded-for` のみ信頼」。Vercel 実挙動が未検証で、総当たり防御（E-06/F-16）の成否が確定していない                                          | `advanced.ipAddress.ipAddressHeaders: ['x-vercel-forwarded-for']` 等。**main Reviewer の `highImpactUnverified` へ統合対象** |
| SEC-3  | FOLLOW_UP | medium | E1       | accepted_risk（提案）     | `apps/web/src/server/auth/create-auth.ts:46` / `docs/decisions/ADR-0023-better-auth-login.md:160-181` | Cookie キャッシュ 5 分の失効遅延は Proxy 経路（全ページ + 全 `/api/*`）に及ぶ。`/api/auth/*` 側は `getAuthoritativeSessionFromCtx` で DB 再検証されるため非対象                                                                                     | ADR-0023 §残るリスクへ 1 項目追記（コード変更不要）                                                                          |
| SEC-4  | FOLLOW_UP | medium | E1       | open                      | `apps/web/e2e/README.md:43-49`                                                                        | 公開リポジトリに実在パスワード文字列 `e2e-test-password-1234` を記載し、`Neon / Preview` へ `auth:create-user` する手順を提示。`disableSignUp` はスクリプト経路を防がない                                                                           | 手順から実値を削り `openssl rand -base64 24` 生成に変更。SEC-4 詳細                                                          |
| SEC-5  | FOLLOW_UP | low    | E1       | open                      | `apps/web/src/proxy.ts:90-94`                                                                         | `api/auth/` は matcher 除外のため secret 未設定時の 503 が及ばない。実挙動は better-auth 側の throw → 500（`create-context.mjs:42-43` で production は default secret を拒否）。fail-closed ではあるが設計書/契約書の「503」記述と差異              | 設計書 §セキュリティ・契約書 §4 に「`/api/auth/*` は 500」を追記                                                             |
| SEC-6  | FOLLOW_UP | low    | E1       | open（PRE_EXISTING 由来） | `apps/web/next.config.ts:4-10`                                                                        | CSP 未導入。パスワード入力欄が新設されたため XSS の被害面が拡大（HttpOnly は Cookie を守るが打鍵は守らない）。加えて未使用の `GET /api/auth/list-sessions` が生の `token` を返す（`session.mjs:347-373`）                                           | CSP を別タスクで検討。`/api/auth/*` の未使用経路は現状放置で可                                                               |
| SEC-7  | FOLLOW_UP | low    | E1       | open                      | `apps/web/src/server/auth/index.ts:14-22`                                                             | `trustedOrigins` は Vercel システム env に全面依存。未公開設定なら空配列になり、Origin 照合の基準が `baseURL`（Preview は Host ヘッダ推定）だけになる。ブラウザからの Origin 偽造は不可のため実害は低いが、Preview でログイン不能になる可用性リスク | Preview デプロイで `trustedOrigins` の実値を 1 度確認する運用項目に追加                                                      |
| SEC-8  | —         | low    | E1       | 確認済み（情報）          | `apps/web/src/app/more/account/_components/revoke-other-sessions-button.tsx:20`                       | `revoke-other-sessions` はパスワード再入力を要求しない（Better Auth 既定。DB 再検証はする）。盗難済みアンロック端末から所有者の他セッションを失効可能                                                                                               | 2 名利用では受容。第二段で再認証要件を検討                                                                                   |
| SEC-9  | —         | low    | E1       | 確認済み（情報）          | `pnpm-lock.yaml`                                                                                      | `better-auth` が `drizzle-kit`→`esbuild`(low)、`vitest`→`@vitest/mocker`(moderate ×2) を `--prod` グラフに持ち込む。**high/critical はゼロ**（implementer 報告と一致）。`tsx` 由来は 0 件                                                           | 対応不要。監視のみ                                                                                                           |

## SEC-1 詳細（BLOCK）

**再現（実行済み）** — `login-form.tsx:26` の正規表現をそのまま Node 22 で実行し、`new URL(out, 'https://cookpit-web.vercel.app/login')` で解決した結果:

| `next` の値         | `safeNext` の返り値 | `location.assign` の解決先              |
| ------------------- | ------------------- | --------------------------------------- |
| `//evil.com`        | `/`                 | 自オリジン（防御成功）                  |
| `/\evil.com`        | `/`                 | 自オリジン（防御成功）                  |
| `https://evil.com/` | `/`                 | 自オリジン（防御成功）                  |
| `/<TAB>//evil.com`  | そのまま            | **`https://evil.com/`**                 |
| `/<LF>//evil.com`   | そのまま            | **`https://evil.com/`**                 |
| `/<CR>//evil.com`   | そのまま            | **`https://evil.com/`**                 |
| `/<NUL>//evil.com`  | そのまま            | 自オリジン `/%00//evil.com`（実害なし） |

原理: URL パーサは入力から ASCII タブ / LF / CR を**除去してから**解析する。`"/\t//evil.com"` は `"///evil.com"` になり、`special authority ignore slashes state` で 3 連スラッシュが読み飛ばされて `evil.com` がホストとして解釈される。攻撃 URL は `/login?next=%2F%09%2F%2Fevil.com` で、ログイン成功直後にクロスオリジンへ遷移する（フィッシング）。

**根本原因は契約書にもある**: `docs/designs/better-auth-login.contract.md:318-323` の ABNF `no-slash-backslash = %x00-2E / ...` が制御文字（`%x00`–`%x1F`）を明示的に許可している。実装は契約どおりであり、契約の方を直す必要がある。

**サーバ側 `buildNextParam`（`proxy.ts:14-19`）は影響なし**（実測: `new URL('https://h/a\nb').pathname === '/ab'`、`'/a%0Ab'` はエンコードのまま維持）。問題はクライアント側の未信頼入力再検証だけ。

**修正案（どちらか、推奨は 2）**

1. 制御文字を弾く 1 行追加:

   ```ts
   // eslint-disable-next-line no-control-regex
   const CONTROL_CHARS = /[�-]/;
   function safeNext(value: string | null): string {
     if (value === null || value.length > NEXT_MAX_LENGTH) return '/';
     if (CONTROL_CHARS.test(value)) return '/';
     return /^\/(?![/\\])/.test(value) ? value : '/';
   }
   ```

2. パーサ基準の判定（正規表現の穴に依存しない）:

   ```ts
   function safeNext(value: string | null): string {
     if (value === null || value.length > NEXT_MAX_LENGTH) return '/';
     const origin = window.location.origin;
     const url = URL.parse(value, origin);
     return url !== null && url.origin === origin ? `${url.pathname}${url.search}` : '/';
   }
   ```

   （`URL.parse` は Node 22 / 現行ブラウザで利用可。`new URL` + try/catch でも可。`origin` を実際の解決結果で比較するため、将来の URL 仕様変更にも追随する）

上記 1 の修正版を実行で検証済み — `/<TAB|LF|CR>//evil.com` はいずれも `/` に落ち、`/pantry` `/shopping-lists/abc?x=1` `/%2F%2Fevil` の正常系は維持される。

**併せて必要**:

- `docs/designs/better-auth-login.contract.md:316-350` の ABNF から `%x00`–`%x1F` / `%x7F` を除外し、境界値表に TAB/LF/CR の行を追加。
- `login-form.test.tsx:144-149` の `it.each` に `['/\t//evil.com', '/']` `['/\n//evil.com', '/']` `['/\r//evil.com', '/']` を追加（現状は `//evil` / `http://evil.example` / `/\evil` の 3 パターンのみ）。
- `use-api-action.ts:144` が組み立てる `next` は `window.location.pathname` 由来で生の制御文字を含まないが、受け側の `safeNext` が唯一の関門である構図は変わらない。

## SEC-2 詳細（high・未検証）

`create-auth.ts:48` は `rateLimit: { enabled: true, storage: o.rateLimitStorage }` のみで、`advanced.ipAddress` を設定していない。`@better-auth/core/dist/utils/ip.mjs` の `getIP()` は:

- `ipAddressHeaders` 既定 = `['x-forwarded-for']`
- `trustedProxies` 未設定時は `if (forwardedIps.length !== 1) return null;` — **複数値のヘッダは一切信頼しない**
- 解決できなければ `null` → `rate-limiter/index.mjs:246` で `createRateLimitKey('no-trusted-ip', path)`

Vercel の `x-forwarded-for` の実値次第で 2 つの結末に分岐し、**いずれも未検証**（契約書 §10-7 が「未検証」と明記している項目と同一）:

- (a) Vercel がクライアント送出値に実 IP を追記する場合 → 常に 2 値 → `null` → `no-trusted-ip|/sign-in/email` の**単一グローバルバケット**（max 3 / 10 s）。第三者が 3 秒に 1 回叩くだけで 2 名の正規ログインを恒久的に 429 にできる（可用性 DoS）。`ctx.logger.warn` が 1 度だけ出る（`rate-limiter/index.mjs:241`）。
- (b) Vercel がクライアント送出値を素通しする場合 → 攻撃者が毎リクエスト異なる単一値を送る → キーが毎回変わり**レート制限が完全に無効化**。防御はパスワード 12 文字以上 + scrypt のみ（= ADR-0023 が「解消」と主張した残存リスク 4 が未解消）。

**修正案**: `create-auth.ts` に以下を追加し、Preview で `X-Forwarded-For: 9.9.9.9` を付けた誤パスワード連打で 429 が IP ごとに分離されることを確認する。

```ts
advanced: {
  cookiePrefix: 'cookpit',
  // Vercel のプロキシが付与し、クライアントからは上書きできないヘッダ。
  // 既定の x-forwarded-for は多段/偽装で null に落ち、全 IP 共有バケットになる。
  ipAddress: { ipAddressHeaders: ['x-vercel-forwarded-for'] },
},
```

（`x-vercel-forwarded-for` が単一値であることを併せて実測すること。単一値でなければ `trustedProxies` 方式に切り替える）

**証拠水準**: E1（ライブラリ実装の読解のみ）。Vercel 実機での `x-forwarded-for` 実値を確認していないため断定しない。main Reviewer は `highImpactUnverified` として扱ってよい。

## SEC-4 詳細

`apps/web/e2e/README.md:43-49` が次を提示している。

```bash
DATABASE_URL=pglite://.pglite-dev AUTH_USER_EMAIL=e2e@example.test AUTH_USER_NAME=E2E \
  AUTH_USER_PASSWORD=e2e-test-password-1234 pnpm --filter @cookpit/web auth:create-user
```

同ファイル `:51-53` は「Preview URL に対して実行する場合は…Preview 上で発行済みのアカウントに合わせる」と続く。公開リポジトリに平文で載ったパスワードを Preview / Neon に登録すると、`e2e@example.test` は誰でもログインできるアカウントになる。`disableSignUp: true` はスクリプト経由（`allowSignUp: true` の別インスタンス）を止めないため、この経路を塞ぐ仕組みは無い。また `auth-create-user.ts:100` の長さ検査（12 文字以上）は通る（22 文字）。

**修正案**: README の例から実値を外し、`AUTH_USER_PASSWORD="$(openssl rand -base64 24)"` 形式に変更する。加えて「Preview / 本番の DB に対して E2E 用アカウントを作る場合は毎回ランダム生成し、検証後に削除する」旨を 1 行追加する。

## SEC-10 詳細（BLOCK）

`.github/workflows/ci.yml:69-73` は `package.json` / `pnpm-lock.yaml` の変更で `deps_changed=true` にし、`:145-151` の `pnpm audit --prod --audit-level=high` を**ブロッキングで**実行する。本 PR は両ファイルを変更している。ローカル実測:

```
18 vulnerabilities found
Severity: 1 low | 7 moderate | 8 high | 2 critical
exit=1
```

**本 feature 由来ではない**（全件 `next` / `sharp` / `@serwist/next` / `shadcn` / `hono` 経由。`better-auth` 由来は `esbuild`(low) と `vitest`/`@vitest/mocker`(moderate) の 3 件のみで、いずれも high 未満）。しかし依存を変えた本 PR が初めてこのゲートを踏むため、**このままでは CI が赤で止まる**。

内訳（`--prod`、パス付き）:

| severity          | package                                 | 経路                                                 | patched                                      |
| ----------------- | --------------------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| critical ×2       | `next@16.2.12`                          | `apps/web>next`                                      | `>=16.3.3`                                   |
| high              | `sharp`                                 | `apps/web>next>sharp`                                | `>=0.35.4`（override は `>=0.35.0` 止まり）  |
| high ×2           | `browserslist`                          | `apps/web>@serwist/next>browserslist`                | `>=4.28.7`                                   |
| high              | `nanoid`                                | `apps/web>next>postcss>nanoid`                       | `>=3.3.18`                                   |
| high ×4           | `fast-uri`                              | `apps/web>shadcn>@dotenvx/dotenvx>conf>ajv>fast-uri` | `>=3.1.6`（override は `>=3.1.4 <4` 止まり） |
| moderate ×3       | `hono`                                  | `apps/web>hono`                                      | `>=4.13.5`                                   |
| low / moderate ×3 | `esbuild` / `vitest` / `@vitest/mocker` | **`apps/web>better-auth>…`（本 feature 由来）**      | —                                            |

**修正案（選択はユーザー / Orchestrator）**:

- 案 A（推奨）: `apps/web/package.json` の `next` を `16.3.3` 以上へ上げ、ルート `package.json` の `pnpm.overrides` を `"sharp@<0.35.4": ">=0.35.4"` / `"fast-uri@<3.1.6": ">=3.1.6 <4"` / `"browserslist@<4.28.7": ">=4.28.7"` / `"nanoid@<3.3.18": ">=3.3.18"` に更新。ADR-0021 が「バージョン更新自体は公開前に検討する（別タスク）」としていた宿題がここで期限を迎えた形。
- 案 B: 別タスク化し、本 PR では `pnpm.auditConfig.ignoreGhsas` で一時除外。ただし設計書 §セキュリティ「既知脆弱性」は「`ignoreGhsas` ではなく更新で対処する方針」と明記しているため、採るなら設計書の方針変更としてユーザー承認が要る。

## ADR-0021 §残るリスクの解消判定

| #   | ADR-0021 の残存リスク                                                    | 判定                                             | 根拠                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | ログアウト手段が無い                                                     | **解消**                                         | `more/_components/logout-button.tsx:38` の `authClient.signOut()` + SW ランタイムキャッシュ破棄（`:15-28`）。`logout-button.test.tsx` 合格（E2）                                                                                                                                                                                                                                                 |
| 2   | SW 経由 401 に認証ダイアログが出ず PWA が固まる                          | **解消（構造的）／実機未確認**                   | navigation は 401 ではなく `302 /login?next=`（`proxy.ts:71-73`）。API 401 は `use-api-action.ts:143-148` が `/login?next=` へ誘導。`sw-cache-plugins.ts:14-18` の `cacheWillUpdate` が 302/opaqueredirect を保存しない。iOS standalone は MB 項目として残る                                                                                                                                     |
| 3   | CSRF が ambient authority で成立しうる／緩和が JSON 必須項目の偶然に依存 | **改善（主張は妥当）**                           | Cookie は `SameSite=Lax`（`better-auth/dist/cookies/index.mjs:35`）。既存 Hono ルートの GET は全て読み取り専用であることを実測確認（`server/routes/*.ts`）。`/api/auth/*` は `originCheckMiddleware` が非 GET で Origin を照合（Cookie 付きリクエストは必ず照合、Cookie 無しは `formCsrfMiddleware` が Sec-Fetch-\* で判定）。**残条件**: 将来 GET で状態変更するルートを足すと Lax を素通りする |
| 4   | 総当たり制限・検知が無い                                                 | **部分改善／要検証**                             | パスワードは個人ごと 12 文字以上 + scrypt（`create-auth.ts:39`、`accounts.password` は `0010_majestic_namor.sql:12` に text で保存）。レート制限自体は SEC-2 のとおり Vercel 実挙動が未検証。ADR-0023 の「レート制限が掛かる」は現時点で断定できない                                                                                                                                             |
| 5   | 通知クリックからの standalone 起動で再認証ダイアログ                     | **解消**                                         | Basic ダイアログ自体が消滅。30 日 Cookie + 5 分キャッシュ。iOS 実機は MB 項目                                                                                                                                                                                                                                                                                                                    |
| 6   | `_next/image` を認証の後ろに置く（レビュー指摘で対処済み）               | **継続（維持）**                                 | `proxy.ts:92` の matcher に `_next/image` は含まれず保護対象。UT-P-27 / MW-M03 で回帰テスト済み（E2、合格）                                                                                                                                                                                                                                                                                      |
| 7   | `next` critical 2 件 / `hono` moderate 3 件                              | **継続（悪化なし）／ただし CI ゲートが今回作動** | SEC-10 のとおり。本 feature が追加したのは low 1 / moderate 2 のみ                                                                                                                                                                                                                                                                                                                               |

## 確認済み（指摘なし）

- **Proxy の完全検証**: `proxy.ts:44-53` — `getSessionCookie` は早期 return の最適化にのみ使い（存在＝認証済みとしない）、存在時は `getAuth().api.getSession({ headers, returnHeaders: true })` で署名検証まで行う。UT-P-22/23/24 合格（E2）。
- **`/login` を matcher から除外していない**: `proxy.ts:92` / MW-M01〜M12 合格。ログイン済みなら `302 /` + `no-store`（UT-P-18）。
- **matcher 境界**: `/api/authx` は保護対象（UT-P-25）、`sw.js` 等は `$` 終端で `/sw.js/api/pantry` が除外に落ちない（正規表現構造として確認、MW-M11）。
- **fail-open しない**: `getSession` の例外は伝播して Next.js 既定 500（UT-P-21 合格）。secret 未設定 × `NODE_ENV=production` は 503（UT-P-09）、非 production はスキップ（UT-P-10）。Vercel Preview は `NODE_ENV=production` のため保護対象に入る。
- **`WWW-Authenticate` を返さない / 401・302 でログを出さない**: UT-P-28 / UT-P-29 / UT-P-30 合格。
- **`Cache-Control: no-store`**: 503 / 302(`/login?next=`) / 302(`/`) / 401 の全てに付与（`proxy.ts:6, 34, 59, 68, 73`）。
- **Cookie 属性**: `httpOnly: true` / `sameSite: 'lax'` / `__Secure-` 前置は `useSecureCookies` 判定（`better-auth/dist/cookies/index.mjs:23,35,37`）。`getSessionCookie` は `__Secure-<prefix>.session_token` → `<prefix>.session_token` の順に探す（`:266-267`）。`advanced.cookiePrefix: 'cookpit'` と Proxy の `cookiePrefix` は一致（罠 2 クリア）。
- **Cookie キャッシュの署名検証**: `compact` 戦略で `createHMAC('SHA-256').verify(secret, …)` + `expiresAt` 検査（`cookies/index.mjs:328-343`）。改ざんは `null` に落ちて DB 再検証へ。
- **`change-password` / `revoke-other-sessions` の再認証**: 両者とも `sensitiveSessionMiddleware` → `getAuthoritativeSessionFromCtx`（DB 権威。Cookie キャッシュを信用しない、`session.mjs:304-311`）。`changePassword` は `currentPassword` 必須で、フォームも渡している（`change-password-form.tsx:46-50`）。`freshAge` は両者とも非適用（契約書 §10-6 の実測と一致）。
- **列挙防止**: ログイン失敗は 401/403 を区別せず同一文言、429 のみ分岐（`login-form.tsx:51-56`）。`disableSignUp` により HTTP 経由のサインアップは閉鎖で、IT-H-02 が `rejects.toThrow()` を確認（E2 合格）。
- **秘密情報**: `proxy.ts:33` の `console.error` は値を出さない。スクリプトはパスワードを引数に取らず env か TTY エコー無し（`auth-create-user.ts:26-60`）、成否メッセージに資格情報を含めない。`.env.example` は値ゼロ。`git log -p main..HEAD` の grep で秘密の混入なし。`.gitignore` は `.env*` + `!.env.example`。`better-auth` は production で default secret を throw で拒否（`create-context.mjs:42`）。
- **migration**: `0010_majestic_namor.sql` は `CREATE TABLE` 5 本 + FK 2 + INDEX 3 のみで、既存 9 テーブルへの `ALTER` が 1 行も無いことを全文確認。`accounts.password` は Better Auth の scrypt ハッシュ格納先（`auth-set-password.ts:114` も `ctx.password.hash()` 経由で平文を書かない）。
- **`rate_limits` の肥大化**: `deleteExpiredRows`（`rate-limiter/index.mjs:169-180`）が最長ウィンドウ経過分を背景削除する。2 名利用では実質問題なし。
- **Service Worker**: `/login` と `/api/auth/*` はどの `matcher` にも該当せずランタイムキャッシュ対象外（`sw.ts:67-112`）。3 本の runtime cache 全てに `cacheWillUpdate` を付与し、ログアウト時に `caches.delete` で破棄（`logout-button.tsx:8-28`）。`sw-cache-plugins.node.test.ts` 合格。
- **E2E / CI**: `auth-login.spec.ts:7-12` は `E2E_AUTH_EMAIL`/`E2E_AUTH_PASSWORD` 未設定で `test.skip()`。`playwright.config.ts` から `httpCredentials` と `BASIC_AUTH_*` ブロックが削除済み（diff で確認）。
- **依存注入・入力検証**: `packages/api-contract` は無変更で、既存 Hono ルートの `zValidator` も無変更。Drizzle の生 `sql` タグ追加なし（`auth-create-user.ts:121-125` は `eq()` のパラメータバインディング）。

## 未確認の範囲（本レビューで証拠を取っていないもの）

- Vercel 実環境での `x-forwarded-for` / `x-vercel-forwarded-for` の実値（SEC-2 の判定に直結）
- `Set-Cookie` の実属性文字列（`Secure` / `Max-Age` / `session_data` の `Max-Age`）— 契約書 §10-5・§10-17 と同じく未解決。HTTP 実リクエストが要る
- `session_data` Cookie の実サイズ（4KB 上限、B-08）
- `429` 応答の `Retry-After` 有無（契約書 §10-9）
- `rateLimit.storage: 'database'` の複数インスタンス共有（契約書 §10-7、Preview 実機）
- iOS standalone PWA の Cookie 永続（ADR-0023 §残るリスク、MB 項目）
- 本番 URL / Vercel / GitHub への一切のアクセス（禁止事項のため未実施）

## 受容を提案する残余リスク（reviewer packet の「残余リスク」へ転記可）

1. セッション失効（他端末ログアウト・パスワード変更）は Proxy 経路では Cookie キャッシュにより最大 5 分反映が遅れる。`/api/auth/*` は DB 権威で即時だが、ページと `/api/*` は遅延する。2 名の家庭内利用として受容し、ADR-0023 §残るリスクに明記する。
2. 認証の関門は Proxy 1 箇所のみで、多層防御（Hono 側の検証）は持たない。matcher の構造テストと本番 black-box 確認で緩和し、追加は必要になった時点で `app.use` 1 本として行う（ADR-0023 既記）。

## 人間の判断が必要な項目

| ID   | kind           | 質問                                                                                                                           | 推奨                                                                                                                                                                                          | 根拠                                                                                          |
| ---- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| HD-1 | `subjective`   | SEC-10 の既存脆弱性（critical 2 / high 8）を本 PR でまとめて解消するか、`ignoreGhsas` で一時除外して別 PR に分けるか           | **本 PR で `next>=16.3.3` + overrides 更新を行う**（案 A）。設計書 §セキュリティが `ignoreGhsas` を使わない方針を明記しており、除外を選ぶなら設計方針の変更になる                             | `ci.yml:151` がブロッキング、`deps_changed=true` 確定、ローカル exit=1                        |
| HD-2 | `unknown`      | SEC-2（Vercel でのレート制限キー解決）を Preview 実機で検証してからマージするか、`ipAddressHeaders` を先に設定してマージするか | **先に `ipAddressHeaders: ['x-vercel-forwarded-for']` を入れ、Preview で検証**。未設定のままだと (a) ログイン DoS か (b) レート制限無効化のどちらかに落ち、どちらであるかを事前に確定できない | `@better-auth/core/dist/utils/ip.mjs` の `getIPFromHeader` / `rate-limiter/index.mjs:241-246` |
| HD-3 | `irreversible` | 既に `e2e-test-password-1234` で Preview / Neon にアカウントを作成済みか（作成済みなら即時パスワード再設定または削除が必要）   | 作成済みなら `auth:set-password` でランダム値に再設定（同スクリプトは全セッションも失効させる）                                                                                               | `e2e/README.md:43-53`                                                                         |

## 補足（スコープ外の気づき、指摘ではない）

- `pnpm --filter @cookpit/web test` 実行時に `tests/app/shopping-lists/_components/shopping-list-client.offline-queue.test.tsx:137` が 1 件失敗した（1 failed / 1025 passed）。本 feature のセキュリティ観点とは無関係で、`aria-checked` の待ち合わせに見える。main Reviewer 側の完了条件（`pnpm test` green）に関わるため申し送る。

## Orchestrator の処置（2026-09-17）

| ID     | 処置                                                                                                                                                                                                                                                                  | 担当 / 状態                                       |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| SEC-1  | 修正案 1（制御文字の拒否）を採用し、`new URL` による origin 一致の二重化を許可。契約書 §4.1 の ABNF から `%x00`–`%x1F` / `%x7F` を除外、テストに TAB / LF / CR を追加                                                                                                 | implementer（closure 修正）                       |
| SEC-2  | `advanced.ipAddress.ipAddressHeaders: ['x-vercel-forwarded-for', 'x-forwarded-for']` を追加し、Preview での IP 別 429 分離を BB 項目に追加。実機検証までは reviewer packet の残余リスク（未検証）として扱う                                                           | implementer（closure 修正）+ 人間（Preview 実機） |
| SEC-3  | ADR-0023 §残るリスクへ追記（コード変更なし）                                                                                                                                                                                                                          | implementer（closure 修正）                       |
| SEC-4  | `apps/web/e2e/README.md` から実値を除去し `openssl rand -base64 24` 生成へ。HD-3 への回答: **Preview / Neon にはアカウントを作成していない**（implementer は PGlite のみで実行。リモート DB へのスクリプト実行を禁止していた）                                        | implementer（closure 修正）                       |
| SEC-5  | 設計書 §セキュリティ・契約書 §4 に「`/api/auth/*` は secret 未設定 × production で 500（fail-closed）」を追記                                                                                                                                                         | implementer（closure 修正）                       |
| SEC-6  | CSP は PRE_EXISTING として別タスク候補に送る（本 PR では対応しない）                                                                                                                                                                                                  | 別タスク                                          |
| SEC-7  | Preview で `trustedOrigins` が空でないこと（ログインが 403 にならない）を BB 項目に追加                                                                                                                                                                               | 人間（Preview 実機）                              |
| SEC-8  | 2 名利用として受容。第二段（パスキー）設計時に再認証要件を再検討                                                                                                                                                                                                      | 受容                                              |
| SEC-9  | 対応不要                                                                                                                                                                                                                                                              | —                                                 |
| SEC-10 | **ユーザー判断（HD-1）: 先行 PR で依存更新**。`main` から `chore/deps-audit-fixes` を分岐し、`next` 16.3.x + `hono` + `pnpm.overrides` の更新で `pnpm audit --prod --audit-level=high` を exit 0 にする。本 PR はそのマージ後に rebase する。`ignoreGhsas` は使わない | Orchestrator（先行 PR）                           |

HD-2 は Orchestrator 判断で「`ipAddressHeaders` を先に入れ、Preview で検証」を採用（security の推奨どおり）。
