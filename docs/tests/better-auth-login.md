# 試験計画: better-auth-login

- 前提となる設計書: `docs/designs/better-auth-login.md`（Gate A 承認済み・2026-09-17。D-1〜D-19 確定）
- 前提となる要件書: `docs/requirements/better-auth-login.md`（F-01〜F-17 / N-01〜N-13 / E-01〜E-12 /
  B-01〜B-09 / AC-01〜AC-08）
- 関連 ADR: `docs/decisions/ADR-0022-better-auth-login.md`（Accepted） /
  `docs/decisions/ADR-0021-basic-auth-for-public-repository.md`（置換対象）
- 契約書: `docs/designs/better-auth-login.contract.md` — **本試験計画作成時点で未作成**
  （contract-designer 並列作業中。`Glob` で不存在を確認済み）。本書は設計書「契約骨子」節
  （環境変数・Cookie 名・401 JSON 形・DB スキーマ骨子）を入力にして観点を書いた。列名・
  casing・インデックス・Cookie prefix の最終値に依存する試験データ（IT-H / IT-S 群）は
  **契約書確定後に整合確認が必要**（本書「設計への差し戻し候補」参照）。
- レベル: L3
- 実装状況: **未実装**（要件書「制約」に「実装コードの変更は要件・設計の確定後（Gate A
  承認後）に行う」とあり、2026-09-17 の Gate A 承認直後の本試験計画作成時点でコードは
  存在しない）。設計書の擬似コード・コード例をブループリントとして扱う
  （`docs/tests/public-release-basic-auth.md` の前例を踏襲）。実装後に API 名の差異
  （リスク R-10）が出た場合は implementer が本書と突き合わせる。

## 試験種別

- **単体（UT, Vitest node）**: `apps/web/src/proxy.ts`（置換）と `sw.ts` の純関数
  （`cacheWillUpdate` 相当）。DB・ネットワークを伴わない。
- **結合（IT, Vitest node + PGlite）**: Hono `/api/auth/*` マウント、Better Auth アダプタの
  実 DB 疎通、アカウント発行・パスワード再設定スクリプト。PGlite でアダプタが動作しない
  場合の格下げ条件を明記する（§3-3）。
- **コンポーネント（CT, Vitest dom + RTL）**: `LoginForm` / `MoreMenu` / `LogoutButton` /
  `ChangePasswordForm` / `RevokeOtherSessionsButton` / `NavBar` / `useApiAction`。
- **E2E（Playwright）**: 基盤は整備済み。既存 2 本の無変更確認 + 新規
  `auth-login.spec.ts`（資格情報 env が無ければ skip）。
- **セキュリティ観点（SEC）**: 上記 UT/IT/CT/MB/BB の該当項目を横断参照し、
  security-reviewer への引き継ぎ表として再整理する（新規 ID は最小限）。
- **実機・手動確認（MB）**: iOS / Android の standalone PWA、Preview、SW オフライン挙動。
  すべて人間が実施する（`manual-browser-verify` Skill の PASS / BLOCKED / FAIL 書式）。
- **本番 black-box 確認（BB）**: 設計書「移行とリリース」手順 7 の確認表をそのまま試験項目化。
  人間（開発者）がリリース手順の一部として実施する。

---

## 0. 実装ファイル対応と ID 体系・vitest include 整合

`apps/web` の vitest include（実測。`vitest.node.config.mts` / `vitest.dom.config.mts`）:
node プロジェクトは `tests/**/*.node.test.ts` と `tests/server/**/*.test.ts`、dom プロジェクトは
`tests/**/*.dom.test.ts` と `tests/**/*.test.tsx`。素の `tests/**/*.test.ts`（`server` 配下以外）は
どちらの include にも一致せず silent skip になるため使わない。

| ID 接頭辞 | 対象                             | テストファイル（新規 or 置換）                                                               | vitest プロジェクト / include                      |
| --------- | -------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| UT-P      | `apps/web/src/proxy.ts`          | `apps/web/tests/proxy.node.test.ts`（**置換**）                                              | node（`tests/**/*.node.test.ts`）                  |
| UT-SW     | `sw.ts` の `cacheWillUpdate`     | `apps/web/tests/app/_utils/sw-cache-plugins.node.test.ts`（**新規。§14 差し戻し候補 参照**） | node（`tests/**/*.node.test.ts`）                  |
| IT-H      | Hono `/api/auth/*` マウント・DB  | `apps/web/tests/server/auth/auth-route.test.ts` / `auth-integration.test.ts`                 | node（`tests/server/**/*.test.ts`）                |
| IT-S      | `scripts/auth-*.ts`              | `apps/web/tests/scripts/auth-create-user.node.test.ts` / `auth-set-password.node.test.ts`    | node（`tests/**/*.node.test.ts`）                  |
| IT-INF    | `packages/infrastructure` バレル | `packages/infrastructure/tests/db/auth-schema.test.ts`                                       | infrastructure 既定 config（`tests/**/*.test.ts`） |
| CT        | 画面・コンポーネント             | `apps/web/tests/app/login/_components/login-form.test.tsx` ほか（後述）                      | dom（`tests/**/*.test.tsx`）                       |
| E2E       | Playwright                       | `apps/web/tests/e2e/auth-login.spec.ts`（新規） + 既存 2 本                                  | Playwright（`apps/web/playwright.config.ts`）      |
| MB        | 実機・手動確認                   | —（自動化不可）                                                                              | 人間が実施                                         |
| BB        | 本番 black-box 確認              | —（自動化不可。curl 等）                                                                     | 人間（開発者）が実施                               |

---

## 1. メソッド網羅チェック表

設計書「対象範囲」表と「バックエンド設計」「フロントエンド設計」節から読み取れる、本 feature で
新設・変更される全 public API / エクスポートの一覧（実装前のためコード例からの読み取り。
`docs/tests/expiry-alert.md` §0 と同じ位置づけ）。

| 層／モジュール                                                               | 公開メンバー                                                                                  | 変更種別 | 対応する試験観点 No                            |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------- |
| `apps/web/src/proxy.ts`                                                      | `proxy(request)` / `config`                                                                   | 変更     | UT-P-01〜30                                    |
| `apps/web/src/server/auth/create-auth.ts`                                    | `createAuth(options): Auth` / `type CreateAuthOptions` / `type Auth`                          | 新規     | IT-H-01〜24（間接）、IT-S 全件が同関数を再利用 |
| `apps/web/src/server/auth/index.ts`                                          | `isAuthConfigured()` / `getAuth()`                                                            | 新規     | UT-P-09/10（`isAuthConfigured` 経由）、IT-H-01 |
| `apps/web/src/server/app.ts`                                                 | `app.on(['GET','POST'], '/auth/*', ...)` の追加（既存 `app` / `routes` / `AppType` は非破壊） | 変更     | IT-H-01                                        |
| `packages/infrastructure/src/db/auth-schema.ts`                              | `users` / `sessions` / `accounts` / `verifications` / `rate_limits`（テーブル定義）           | 新規     | IT-INF-01、IT-H 群の前提                       |
| `packages/infrastructure/src/index.ts`                                       | `export * as authSchema from './db/auth-schema'`                                              | 変更     | IT-INF-01                                      |
| `apps/web/src/lib/auth-client.ts`                                            | `authClient`（`signIn.email` / `signOut` / `changePassword` / `revokeOtherSessions`）         | 新規     | CT-01〜24（間接呼び出し元）                    |
| `apps/web/src/lib/use-api-action.ts`                                         | `useApiAction()`（401 分岐を追加。既存 `ApiAction` / `run` は非破壊）                         | 変更     | CT-27〜29                                      |
| `apps/web/src/app/login/page.tsx`                                            | デフォルトエクスポート（Next.js 規約）                                                        | 新規     | CT-01, CT-14（間接）                           |
| `apps/web/src/app/login/_components/login-form.tsx`                          | `LoginForm`（named export）                                                                   | 新規     | CT-01〜14                                      |
| `apps/web/src/app/more/page.tsx`                                             | デフォルトエクスポート（表示名取得を追加）                                                    | 変更     | CT-15                                          |
| `apps/web/src/app/more/_components/more-menu.tsx`                            | `MoreMenu`                                                                                    | 変更     | CT-16, CT-17                                   |
| `apps/web/src/app/more/_components/logout-button.tsx`                        | `LogoutButton`                                                                                | 新規     | CT-18, CT-19                                   |
| `apps/web/src/app/more/account/page.tsx`                                     | デフォルトエクスポート                                                                        | 新規     | CT-20                                          |
| `apps/web/src/app/more/account/_components/change-password-form.tsx`         | `ChangePasswordForm`                                                                          | 新規     | CT-21〜23                                      |
| `apps/web/src/app/more/account/_components/revoke-other-sessions-button.tsx` | `RevokeOtherSessionsButton`                                                                   | 新規     | CT-24                                          |
| `apps/web/src/app/_components/nav-bar.tsx`                                   | `NavBar`（`/login` で非表示を追加）                                                           | 変更     | CT-25, CT-26（既存 NV-01〜08 回帰）            |
| `apps/web/src/app/sw.ts`                                                     | `cacheWillUpdate`（`NetworkFirst` 2 件に追加。純関数として切り出す想定）                      | 変更     | UT-SW-01〜04                                   |
| `apps/web/scripts/auth-create-user.ts`                                       | CLI エントリ（終了コードが公開契約）                                                          | 新規     | IT-S-01〜05, 08, 09                            |
| `apps/web/scripts/auth-set-password.ts`                                      | CLI エントリ（終了コードが公開契約）                                                          | 新規     | IT-S-06, 07, 10                                |

---

## 2. 単体試験観点（UT）

### 2-1. `proxy()`（`apps/web/tests/proxy.node.test.ts` を置換）

前提共通: `NextRequest` を `new NextRequest(new URL(pathname, 'http://localhost'))` で生成し、
`@/server/auth` を `vi.mock`（`getAuth` / `isAuthConfigured` をモック）、`better-auth/cookies` の
`getSessionCookie` も `vi.mock` する（設計書「テスト方針」節のとおり）。`process.env` の
復元は既存 `proxy.node.test.ts` の `beforeEach`/`afterEach` パターンを踏襲する。
`next` の解析（`buildNextParam` 相当）はモジュール非公開関数のため、`proxy()` が返す
`Location` ヘッダを通じて間接的に検証する（`decodeBasicCredentials` 等を直接テストしなかった
`public-release-basic-auth.md` の前例と同型）。

| #       | 観点                                                            | 前提                                                                                                     | 操作                                                                                                                                  | 期待結果                                                                                                                                                                           | 分類        | 対応要件                       |
| ------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------ |
| UT-P-01 | 未認証 navigation → 302 と `next` 生成                          | `isAuthConfigured()` true、Cookie 無し想定（`getSessionCookie` が null）                                 | `/pantry?x=1` へ `proxy()`                                                                                                            | `302`、`Location: /login?next=%2Fpantry%3Fx%3D1`                                                                                                                                   | 正常        | F-02, N-01, DF-1               |
| UT-P-02 | `_rsc` クエリの除去                                             | 同上                                                                                                     | `/pantry?_rsc=abc123` へ `proxy()`                                                                                                    | `Location` の `next` に `_rsc` を含まない（`/login?next=%2Fpantry`）                                                                                                               | 境界/防御性 | B-06, 実装上の罠3              |
| UT-P-03 | `next` 安全化: スキーム相対 `//evil`                            | 未認証                                                                                                   | 直接 `proxy()` を `/login?next=//evil` に呼ぶのではなく、`buildNextParam` 相当の生成側は Proxy 自身が作るため保護ページ経由で確認する | `Location` の `next` は Proxy 生成の相対パスのみで、`//evil` はそもそも生成されない（生成側の安全性は UT-P-01/02 で担保）。**クライアント側の `safeNext` 相当検証は CT-08 で行う** | 正常/境界   | E-07, B-02                     |
| UT-P-04 | `next` 上限長超過（2,000 文字超）→ `/`                          | 未認証                                                                                                   | pathname を 2,001 文字にした URL へ `proxy()`                                                                                         | `Location: /login?next=%2F`（`/` にフォールバック）                                                                                                                                | 境界        | B-02                           |
| UT-P-05 | `next` が 2,000 文字ちょうど（境界）                            | 未認証                                                                                                   | pathname を 2,000 文字にした URL へ `proxy()`                                                                                         | 生成された `next` がそのまま採用される（`/` にフォールバックしない）                                                                                                               | 境界        | B-02                           |
| UT-P-06 | ルート `/`（Cookie 無し）への `next`                            | 未認証                                                                                                   | `/` へ `proxy()`                                                                                                                      | `Location: /login?next=%2F`                                                                                                                                                        | 正常/境界   | B-02, BB-01 前提               |
| UT-P-07 | クエリ付き相対パスが正しく URL エンコードされる                 | 未認証                                                                                                   | `/pantry?tab=a&b=c` へ `proxy()`                                                                                                      | `Location` の `next` が `%2Fpantry%3Ftab%3Da%26b%3Dc` 相当（往復デコードで一致）                                                                                                   | 正常/境界   | B-02                           |
| UT-P-08 | `/api/*` 未認証 → 401 JSON + `no-store`                         | 未認証                                                                                                   | `/api/pantry` へ `proxy()`                                                                                                            | `401`、`{"error":"Unauthorized"}`、`Cache-Control: no-store`、`Location` ヘッダ無し                                                                                                | 異常        | F-02, E-02                     |
| UT-P-09 | secret 未設定 × `NODE_ENV=production` → 503                     | `isAuthConfigured()` が false になるよう `@/server/auth` をモック、`vi.stubEnv('NODE_ENV','production')` | `/` へ `proxy()`                                                                                                                      | `503`、本文空、`Cache-Control: no-store`、`console.error` 1 回（値は出力しない）                                                                                                   | 異常        | F-10, E-04                     |
| UT-P-10 | secret 未設定 × 非 production → スキップ                        | 同上、`NODE_ENV` 未上書き（Vitest 既定 `test`）                                                          | `/` へ `proxy()`                                                                                                                      | 通過（`getAuth()` は呼ばれない）                                                                                                                                                   | 正常        | F-10, N-09                     |
| UT-P-11 | 除外パス: `manifest.webmanifest`                                | `isAuthConfigured()` true                                                                                | `/manifest.webmanifest` へ `proxy()`                                                                                                  | `getAuth()`/`getSessionCookie` を呼ばずに通過（構造テストは §2-1b の matcher 節）                                                                                                  | 正常/境界   | F-11, N-06                     |
| UT-P-12 | 除外パス: `_next/static/`                                       | 同上                                                                                                     | `/_next/static/chunk.js`                                                                                                              | 同上                                                                                                                                                                               | 境界        | F-11, N-06                     |
| UT-P-13 | 除外パス: `icons/`                                              | 同上                                                                                                     | `/icons/icon-192.png`                                                                                                                 | 同上                                                                                                                                                                               | 境界        | F-11, N-06                     |
| UT-P-14 | 除外パス: `sw.js`                                               | 同上                                                                                                     | `/sw.js`                                                                                                                              | 同上                                                                                                                                                                               | 境界        | F-11, N-06                     |
| UT-P-15 | 除外パス: `api/cron/*`                                          | 同上                                                                                                     | `/api/cron/expiry-alerts`                                                                                                             | 同上（`CRON_SECRET` の独立判定に委ねる。既存 `cron.test.ts` は非対象）                                                                                                             | 境界        | F-11, N-07                     |
| UT-P-16 | 除外パス: `api/auth/*`（新規追加）                              | 同上                                                                                                     | `/api/auth/sign-in/email`                                                                                                             | 同上                                                                                                                                                                               | 境界        | F-11                           |
| UT-P-17 | `favicon.ico` 除外（既存回帰）                                  | 同上                                                                                                     | `/favicon.ico`                                                                                                                        | 同上                                                                                                                                                                               | 境界        | N-06（回帰）                   |
| UT-P-18 | `/login` × ログイン済み → 302 `/`                               | `getAuth().api.getSession` が非 null を返す                                                              | `/login` へ `proxy()`                                                                                                                 | `302`、`Location: /`                                                                                                                                                               | 正常        | F-01, N-10                     |
| UT-P-19 | `/login` × 未ログイン → 通過                                    | `getSessionCookie` が null                                                                               | `/login` へ `proxy()`                                                                                                                 | 通過（`NextResponse.next()` 相当。ログイン画面が描画される）                                                                                                                       | 正常        | F-01                           |
| UT-P-20 | 保護パス × 有効セッション → `Set-Cookie` 転送                   | `getSession({ returnHeaders: true })` が `headers.getSetCookie()` に 2 本の Cookie を含む                | `/pantry` へ `proxy()`                                                                                                                | 応答の `set-cookie` ヘッダに転送元と同じ 2 本が含まれる（Cookie キャッシュ更新の反映。実装上の罠1）                                                                                | 正常/防御性 | F-08, 性能節                   |
| UT-P-21 | `getSession` が例外を投げた場合 → 例外伝播（通さない）          | `getAuth().api.getSession` が reject                                                                     | 保護パスへ `proxy()`                                                                                                                  | `proxy()` 自体が例外を投げる（Next.js 既定の 500 に委ねる。フォールバックで通さない）                                                                                              | 異常/防御性 | E-09, エラー処理(e)            |
| UT-P-22 | Cookie 無し → DB を呼ばず即 302                                 | `getSessionCookie` が null                                                                               | 保護パスへ `proxy()`                                                                                                                  | `getAuth()`（DB クライアント生成）が呼ばれない                                                                                                                                     | 正常/性能   | 性能節（Cookie無し早期return） |
| UT-P-23 | 偽造・署名不一致 Cookie → 未認証扱い                            | `getSessionCookie` は非 null だが `getSession` が `{ response: null }` を返す                            | 保護パスへ `proxy()`                                                                                                                  | `302`（画面）/ `401`（API）。SSR データを返す `next()` 経路に入らない                                                                                                              | 異常/防御性 | E-08, B-01                     |
| UT-P-24 | 期限切れ Cookie → 未認証扱い                                    | 同上（`getSession` が `expiresAt` 過去の判定で null 相当）                                               | 保護パスへ `proxy()`                                                                                                                  | 同上                                                                                                                                                                               | 異常/境界   | B-01, B-03                     |
| UT-P-25 | matcher 構造: `api/auth/` は前方一致で除外、`/api/authx` は保護 | ─                                                                                                        | `config.matcher[0]` を `RegExp` として `/api/authx` と `/api/auth/ok` を評価                                                          | `/api/authx` はマッチする（保護対象）、`/api/auth/ok` はマッチしない（除外）                                                                                                       | 境界/防御性 | B-07                           |
| UT-P-26 | matcher 構造: 既存 MW-M02〜M12 相当の回帰（セグメント境界）     | ─                                                                                                        | `/sw.js/api/pantry` 等の前方一致のみのパスを評価                                                                                      | 保護対象としてマッチする（`public-release-basic-auth` MW-M12 の回帰防止を踏襲）                                                                                                    | 境界/防御性 | B-07（回帰）                   |
| UT-P-27 | `_next/image` は除外に追加されていない（ADR-0021 継承）         | ─                                                                                                        | `/_next/image` を matcher で評価                                                                                                      | マッチする（保護対象のまま。除外パス一覧に `_next/image` を追加していないことの回帰）                                                                                              | 境界/防御性 | セキュリティ節（引継ぎ）       |
| UT-P-28 | 503 応答に `WWW-Authenticate` を付与しない                      | secret 未設定 × production                                                                               | `/` へ `proxy()`                                                                                                                      | `res.headers.get('WWW-Authenticate')` が null                                                                                                                                      | 境界/防御性 | E-04                           |
| UT-P-29 | 503 発生時のみ `console.error`、資格情報の値を出力しない        | 同上                                                                                                     | `console.error` を spy                                                                                                                | 1 回だけ呼ばれ、ログ引数に secret の値を含まない                                                                                                                                   | 防御性      | ログと監視節                   |
| UT-P-30 | 401 / 302 発生時は `console.error` / `console.log` を呼ばない   | 未認証                                                                                                   | `/` へ `proxy()`                                                                                                                      | どちらも呼ばれない（メールアドレス等を残さない方針）                                                                                                                               | 防御性      | ログと監視節                   |

> `next` のクライアント側安全化（`safeNext`。`//evil` / `http://` / 空 / `/\evil` / 相対パス
> 正常の 5 パターン）は `LoginForm` 内のロジックであり `proxy()` からは呼ばれないため、
> §4-1 の CT-08〜12 で検証する。UT-P-03 の期待結果はこの分離を明記するための注記行。
> **SEC-1（2026-09-17 追記）**: 正規表現 `^\/(?![/\\])/` だけでは TAB（`\t`）/ LF（`\n`）/
> CR（`\r`）を 2 文字目に許可してしまい、WHATWG URL パーサがこれらを解決前に除去するため
> `"/\t//evil.com"` が `https://evil.com/` に解決されうる（`docs/reviews/better-auth-login.security.md`
> SEC-1）。境界値に TAB/LF/CR（→ `/` に既定）を追加した。CT-08〜12 に反映済み。

### 2-2. Service Worker `cacheWillUpdate`（純関数）

前提: 設計書「フロントエンド設計 > Service Worker」の
`cacheWillUpdate: async ({ response }) => (response.status === 200 && !response.redirected ? response : null)`
を対象にする。**`sw.ts` 全体を import すると `self.__SW_MANIFEST` 依存で失敗しうる**
（`docs/tests/expiry-alert.md` §0-2 で確認済みの既知事象）ため、§14 差し戻し候補のとおり
別ファイルへの切り出しを前提にする。

| #        | 観点                                          | 前提                                                  | 操作                            | 期待結果                 | 分類 | 対応要件      |
| -------- | --------------------------------------------- | ----------------------------------------------------- | ------------------------------- | ------------------------ | ---- | ------------- |
| UT-SW-01 | 200 かつ非 redirected → 応答をそのまま cache  | `Response` モック（`status: 200, redirected: false`） | `cacheWillUpdate({ response })` | 渡した `response` を返す | 正常 | F-12, D-9     |
| UT-SW-02 | redirected → cache しない                     | `status: 200, redirected: true`                       | 同上                            | `null` を返す            | 異常 | F-12, R-5     |
| UT-SW-03 | 200 以外（401 等）→ cache しない              | `status: 401, redirected: false`                      | 同上                            | `null` を返す            | 境界 | F-12          |
| UT-SW-04 | `opaqueredirect`（`status: 0`）→ cache しない | `status: 0, redirected: true`                         | 同上                            | `null` を返す            | 境界 | F-12, E-02 系 |

---

## 3. 結合試験観点（IT, PGlite）

### 3-1. Hono `/api/auth/*` マウント

配置: `apps/web/tests/server/auth/auth-route.test.ts`（マウント確認・モック）、
`apps/web/tests/server/auth/auth-integration.test.ts`（PGlite 実 DB）。
PGlite への migration 適用は §5「試験データ」のヘルパーを使う。

| #       | 観点                                                           | 前提                                                                                          | 操作                                                                                                                                              | 期待結果                                                                                                                                                   | 分類          | 対応要件              |
| ------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------- |
| IT-H-01 | マウント確認（モック）                                         | `@/server/auth` を `vi.mock`（`getAuth().handler` が `200 { ok: true }` 相当を返す）          | `app.request('/api/auth/ok')`                                                                                                                     | モックした `handler` に到達し、応答がそのまま透過する                                                                                                      | 正常          | F-03                  |
| IT-H-02 | サインアップ閉鎖                                               | PGlite に migration 適用済み、既定 `getAuth()`（`allowSignUp: false` 相当）                   | `POST /api/auth/sign-up/email`                                                                                                                    | `4xx`（`disableSignUp` により拒否）、`users` 行が増えない                                                                                                  | 異常          | F-04, E-05            |
| IT-H-03 | sign-in 成功 → 200 + Cookie 属性                               | `allowSignUp: true` の別インスタンスで作成済みユーザー                                        | `POST /api/auth/sign-in/email`（正しい資格情報）                                                                                                  | `200`、`Set-Cookie` の属性に `HttpOnly` / `Secure`（テスト環境なら省略可）/ `SameSite=Lax` / `Path=/` を含む                                               | 正常          | F-09, N-01            |
| IT-H-04 | sign-in 失敗 → 401（同一文言）                                 | 同上                                                                                          | `POST /api/auth/sign-in/email`（誤パスワード）                                                                                                    | `401`。email が存在するかどうかで応答本文が変わらない（メール存在の列挙防止）                                                                              | 異常          | E-01                  |
| IT-H-05 | `get-session`                                                  | IT-H-03 で得た Cookie                                                                         | `GET /api/auth/get-session`（Cookie 付き）                                                                                                        | `200`、ユーザー情報を含む session を返す                                                                                                                   | 正常          | 契約骨子              |
| IT-H-06 | `sign-out` → Cookie 失効                                       | 同上                                                                                          | `POST /api/auth/sign-out`                                                                                                                         | `200`、応答の `Set-Cookie` が失効値（`Max-Age=0` 相当）、以後同 Cookie で `get-session` が未認証                                                           | 正常          | N-04, F-06            |
| IT-H-07 | `change-password` 正常                                         | ログイン済み Cookie、現在パスワードを正しく指定                                               | `POST /api/auth/change-password`                                                                                                                  | `200`、新パスワードで再ログインできる                                                                                                                      | 正常          | N-05                  |
| IT-H-08 | `change-password` 現在パスワード誤り → 拒否                    | 同上                                                                                          | `currentPassword` を誤りにして呼ぶ                                                                                                                | `4xx`、パスワードは変更されない                                                                                                                            | 異常          | E-10                  |
| IT-H-09 | `revoke-other-sessions` → 他端末失効・自端末継続               | 同一ユーザーで 2 セッション（端末 A/B）を作成                                                 | 端末 A の Cookie で `POST /api/auth/revoke-other-sessions`                                                                                        | 端末 B の Cookie で `get-session` が未認証になる／端末 A は継続                                                                                            | 正常          | N-05                  |
| IT-H-10 | `createAuth({ allowSignUp: true })` でアカウント発行           | 別設定インスタンス                                                                            | `auth.api.signUpEmail({ body: {...} })`                                                                                                           | `users` + `accounts`（`provider_id='credential'`）行が作られる                                                                                             | 正常          | F-05, D-10            |
| IT-H-11 | 同一 email の二重発行 → 拒否                                   | IT-H-10 で作成済みの email                                                                    | 同じ email で再度 `signUpEmail`                                                                                                                   | エラー（`users` 行が増えない）                                                                                                                             | 異常          | E-11                  |
| IT-H-12 | レート制限 → 429（回数固定はしない）                           | 同一 IP/セッションから連続で誤パスワード sign-in                                              | `sign-in/email` を短時間に既知の閾値回数＋1 回呼ぶ（閾値はテスト側で `rateLimit` 設定を注入して固定する。Better Auth 既定値をハードコードしない） | 閾値回数以内は 401、閾値超過後は `429`                                                                                                                     | 異常/境界     | E-06, F-16, D-5       |
| IT-H-13 | `Origin` が信頼済みでない POST → 拒否                          | `trustedOrigins` に含まれない `Origin` ヘッダを付与                                           | `POST /api/auth/sign-in/email`                                                                                                                    | Better Auth が拒否する（4xx。CSRF 緩和の確認）                                                                                                             | 異常          | E-12                  |
| IT-H-14 | `change-password` 新パスワード 11 文字 → 拒否（境界）          | ログイン済み                                                                                  | `newPassword` を 11 文字にする                                                                                                                    | `4xx`、変更されない                                                                                                                                        | 境界          | B-04                  |
| IT-H-15 | `change-password` 新パスワード 12 文字 → 成功（境界）          | 同上                                                                                          | `newPassword` を 12 文字にする                                                                                                                    | `200`                                                                                                                                                      | 境界          | B-04                  |
| IT-H-16 | `change-password` 新パスワード 128 文字 → 成功（境界）         | 同上                                                                                          | `newPassword` を 128 文字にする                                                                                                                   | `200`                                                                                                                                                      | 境界          | B-04                  |
| IT-H-17 | `change-password` 新パスワード 129 文字 → 拒否（境界）         | 同上                                                                                          | `newPassword` を 129 文字にする                                                                                                                   | `4xx`、変更されない                                                                                                                                        | 境界          | B-04                  |
| IT-H-18 | sign-in の email 形式不正                                      | ─                                                                                             | `email: 'not-an-email'` で `sign-in/email`                                                                                                        | `4xx`（Better Auth 組み込みスキーマの拒否）                                                                                                                | 異常          | 契約骨子（email形式） |
| IT-H-19 | セッション `expiresAt` が `createdAt + 30日`                   | sign-in 直後                                                                                  | `sessions` 行を直接 SELECT                                                                                                                        | `expiresAt - createdAt` が 30 日（許容誤差数秒）                                                                                                           | 正常/境界     | F-08, N-02            |
| IT-H-20 | `updateAge`（1 日）境界での延長                                | sign-in 直後の `sessions.expiresAt` を記録、DB 上の `updatedAt` を 1 日以上前に直接書き換える | 同じ Cookie で `get-session` を呼ぶ                                                                                                               | `expiresAt` が延長される（N-03 の粒度確認）                                                                                                                | 正常/境界     | N-03, F-08            |
| IT-H-21 | Cookie キャッシュ有効期間内は DB を再検証しない（N-13）        | ─                                                                                             | ─                                                                                                                                                 | **自動化困難と明記**。Better Auth 内部の DB 参照有無を Vitest から直接観測する手段が契約書に無い。性能節の `curl` 計測（手動）に委ねる（§14 差し戻し候補） | 対象外/要検証 | N-13                  |
| IT-H-22 | `session_data` Cookie が 4 KB 未満（B-08）                     | IT-H-03 の応答                                                                                | `Set-Cookie` の `session_data` 部分の長さを計測                                                                                                   | 4,096 バイト未満                                                                                                                                           | 境界          | B-08                  |
| IT-H-23 | sign-in の多重実行は安全（冪等性というより「害が無い再実行」） | 同一資格情報で 2 回連続 sign-in                                                               | `sign-in/email` を 2 回呼ぶ                                                                                                                       | 両方成功し、`sessions` 行が 2 行になるだけで既存セッションを破壊しない（エラー処理(c)）                                                                    | 正常/冪等性   | エラー処理(c)         |
| IT-H-24 | 未ログイン状態での `sign-out` は冪等                           | Cookie 無し                                                                                   | `POST /api/auth/sign-out`（Cookie 無し）                                                                                                          | 例外を投げず完了する（500 にならない）                                                                                                                     | 冪等性/防御性 | エラー処理(c)         |

### 3-2. アカウント発行・パスワード再設定スクリプト

配置: `apps/web/tests/scripts/auth-create-user.node.test.ts` /
`auth-set-password.node.test.ts`。`DATABASE_URL=pglite://<一時ディレクトリ>` に対して
`child_process`（`execa` 相当）でスクリプトを実行し、終了コードと DB の行を確認する
（設計書「テスト方針」節のとおり）。

| #       | 観点                                                    | 前提                                  | 操作                                                                                                        | 期待結果                                                                         | 分類        | 対応要件      |
| ------- | ------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------- | ------------- |
| IT-S-01 | 正常発行                                                | PGlite に migration 適用済み          | `AUTH_USER_EMAIL` / `AUTH_USER_NAME` / `AUTH_USER_PASSWORD`（12文字以上）を指定して `auth-create-user` 実行 | 終了コード 0、`users`/`accounts` 行が作られる                                    | 正常        | F-05, N-12    |
| IT-S-02 | 同一 email 重複 → 失敗                                  | IT-S-01 実行済み                      | 同じ email で再実行                                                                                         | 非ゼロ終了コード、行が増えない（E-11）                                           | 異常/境界   | E-11          |
| IT-S-03 | パスワード 11 文字 → 失敗（境界）                       | ─                                     | `AUTH_USER_PASSWORD` を 11 文字にして実行                                                                   | 非ゼロ終了コード、行を作らない                                                   | 異常/境界   | E-11, B-04    |
| IT-S-04 | パスワード 12 文字 → 成功（境界）                       | ─                                     | 12 文字で実行                                                                                               | 終了コード 0                                                                     | 境界        | B-04          |
| IT-S-05 | DB 接続失敗                                             | 無効な `DATABASE_URL`                 | `auth-create-user` を実行                                                                                   | 非ゼロ終了コード、例外メッセージにパスワードを含まない                           | 異常/防御性 | エラー処理    |
| IT-S-06 | パスワード再設定 → 新パスワードで成功・旧パスワード失敗 | IT-S-01 で発行済みユーザー            | `auth-set-password` を新パスワードで実行 → `signInEmail` を新旧両方で試す                                   | 新パスワードは成功、旧パスワードは失敗                                           | 正常        | F-05          |
| IT-S-07 | パスワード再設定は全セッションを失効させる              | 事前に sign-in してセッション作成済み | `auth-set-password` 実行後、旧 Cookie で `get-session`                                                      | `sessions` が空になり、旧 Cookie は未認証                                        | 正常        | F-05, N-05    |
| IT-S-08 | パスワード 128 文字 → 成功（境界）                      | ─                                     | `AUTH_USER_PASSWORD` を 128 文字で `auth-create-user`                                                       | 終了コード 0                                                                     | 境界        | B-04          |
| IT-S-09 | パスワード 129 文字 → 失敗（境界）                      | ─                                     | 129 文字で実行                                                                                              | 非ゼロ終了コード                                                                 | 境界        | B-04          |
| IT-S-10 | `auth-set-password` の再実行は冪等                      | 同じ新パスワードで 2 回連続実行       | 2 回実行                                                                                                    | 両方成功、最終的にそのパスワードでログインできる（副作用が増えるだけで壊れない） | 冪等性      | エラー処理(c) |

### 3-3. PGlite での制約（未実装観点・基盤待ち）

設計書「DB 設計 > PGlite での扱い」のとおり、`drizzleAdapter` が `drizzle-orm/pglite` 上で
動作するかは**要検証**。動作しない場合、IT-H-02〜24 と IT-S-01〜10 は以下のとおり格下げる。

- **格下げ先**: Neon の Preview 環境を使った手動確認（MB-12「Preview URL でのログイン」に
  統合するか、専用の実機確認項目を implementer / test-designer が追記する）。
- **判断基準**: 実装時に `createAuth({ db: drizzle(pglite) })` で `signUpEmail` が例外なく
  完了するかを最初に確認する（設計書の指示どおり）。失敗する場合は本節を「Neon 限定の
  手動確認に格下げ」と明記し、本書 §14 に追記する。
- 影響を受けないもの: IT-S 系はスクリプトが `DATABASE_URL` の分岐で PGlite または WebSocket
  接続を選ぶため（D-18 の回避策）、PGlite でアダプタが動かない場合でも WebSocket 経路
  （実 Neon）での手動実行確認に切り替え可能。

### 3-4. `packages/infrastructure` バレル

| #         | 観点                                                | 前提                      | 操作                                                   | 期待結果                                                                                                                | 分類 | 対応要件 |
| --------- | --------------------------------------------------- | ------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---- | -------- |
| IT-INF-01 | `authSchema` バレルからテーブル定義を import できる | `auth-schema.ts` 生成済み | `import { authSchema } from '@cookpit/infrastructure'` | `authSchema.users` / `sessions` / `accounts` / `verifications` が定義済みで、既存 `schema` の named export と衝突しない | 正常 | D-6      |

---

## 4. コンポーネント試験観点（CT, RTL）

### 4-1. `LoginForm`

配置: `apps/web/tests/app/login/_components/login-form.test.tsx`（新規）。`authClient` を
`vi.mock`、`window.location.assign` を spy（happy-dom でスタブ）。

| #               | 観点                                                      | 前提                                                  | 操作                                   | 期待結果                                                                           | 分類      | 対応要件                                       |
| --------------- | --------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- | --------- | ---------------------------------------------- |
| CT-01           | 初期表示                                                  | `next=/pantry`                                        | `render(<LoginForm next="/pantry" />)` | メール欄・パスワード欄・送信ボタンが表示される                                     | 正常      | F-01                                           |
| CT-02           | 空欄で送信 → クライアント側チェック                       | ─                                                     | 何も入力せず送信                       | `authClient.signIn.email` が呼ばれない（`required` 属性等でブロック）              | 異常/境界 | フロントエンド設計                             |
| CT-03           | 送信中はボタン無効化                                      | `signIn.email` が pending の Promise を返す           | 送信 → pending 中に再クリック          | ボタンが無効化され、`signIn.email` は 1 回しか呼ばれない                           | 正常      | フロントエンド設計                             |
| CT-04           | 401/403 → 区別しないエラー文言                            | `signIn.email` が `{ error: { status: 401 } }` を返す | 送信                                   | 「メールアドレスまたはパスワードが違います。」を表示                               | 異常      | E-01                                           |
| CT-05           | 429 → 試行過多文言                                        | `signIn.email` が `{ error: { status: 429 } }` を返す | 送信                                   | 「試行回数が多すぎます。しばらく待ってから再度お試しください。」を表示             | 異常      | E-06                                           |
| CT-06           | 通信例外 → 既存 `NETWORK_ERROR_MESSAGE`                   | `signIn.email` が reject                              | 送信                                   | 既存 `NETWORK_ERROR_MESSAGE` と同じ文言を表示                                      | 異常      | エラー処理節                                   |
| CT-07           | 成功時、`next` が有効な相対パスならその遷移先へ           | `signIn.email` が成功、`next="/pantry"`               | 送信                                   | `window.location.assign('/pantry')` が呼ばれる                                     | 正常      | F-01, N-01                                     |
| CT-08           | `safeNext`: `//evil` → `/`                                | `next="//evil"`                                       | 成功送信                               | `window.location.assign('/')`                                                      | 異常/境界 | E-07, B-02                                     |
| CT-09           | `safeNext`: `http://evil.example` → `/`                   | `next="http://evil.example"`                          | 成功送信                               | `window.location.assign('/')`                                                      | 異常/境界 | E-07, B-02                                     |
| CT-10           | `safeNext`: 空 → `/`                                      | `next=""`                                             | 成功送信                               | `window.location.assign('/')`                                                      | 境界      | B-02                                           |
| CT-11           | `safeNext`: `/\evil` → `/`                                | `next="/\\evil"`                                      | 成功送信                               | `window.location.assign('/')`                                                      | 異常/境界 | E-07, B-02                                     |
| CT-12           | `safeNext`: 正常な相対パスはそのまま採用                  | `next="/shopping-lists/abc?x=1"`                      | 成功送信                               | `window.location.assign('/shopping-lists/abc?x=1')`                                | 正常/境界 | B-02                                           |
| CT-08b（SEC-1） | `safeNext`: `/<TAB>//evil.com` → `/`                      | `next="/\t//evil.com"`                                | 成功送信                               | `window.location.assign('/')`                                                      | 異常/境界 | E-07, B-02                                     |
| CT-08c（SEC-1） | `safeNext`: `/<LF>//evil.com` → `/`                       | `next="/\n//evil.com"`                                | 成功送信                               | `window.location.assign('/')`                                                      | 異常/境界 | E-07, B-02                                     |
| CT-08d（SEC-1） | `safeNext`: `/<CR>//evil.com` → `/`                       | `next="/\r//evil.com"`                                | 成功送信                               | `window.location.assign('/')`                                                      | 異常/境界 | E-07, B-02                                     |
| CT-12b（SEC-1） | `safeNext`: `/pantry?x=1` はそのまま採用                  | `next="/pantry?x=1"`                                  | 成功送信                               | `window.location.assign('/pantry?x=1')`                                            | 正常/境界 | B-02                                           |
| CT-12c（SEC-1） | `safeNext`: `/%2F%2Fevil`（percent-encode）はそのまま採用 | `next="/%2F%2Fevil"`                                  | 成功送信                               | `window.location.assign('/%2F%2Fevil')`                                            | 正常/境界 | B-02                                           |
| CT-13           | `autocomplete` 属性                                       | ─                                                     | DOM を検査                             | メール欄 `autoComplete="username"`、パスワード欄 `autoComplete="current-password"` | 正常      | 第二段の伏線（パスキー用 `webauthn` は第二段） |
| CT-14           | `next` 未指定時は `/` へ遷移                              | `next` を渡さない                                     | 成功送信                               | `window.location.assign('/')`                                                      | 境界      | F-01                                           |

### 4-2. `/more`（表示名・アカウントリンク・ログアウト）

配置: `apps/web/tests/app/more/page.test.tsx`（Server Component。`getAuth` をモック）、
`apps/web/tests/app/more/_components/more-menu.test.tsx`（既存更新）、
`apps/web/tests/app/more/_components/logout-button.test.tsx`（新規）。

| #     | 観点                                                            | 前提                                                              | 操作                      | 期待結果                                                                                    | 分類 | 対応要件         |
| ----- | --------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------- | ---- | ---------------- |
| CT-15 | 表示名を表示                                                    | `getAuth().api.getSession` が `{ user: { name: '太郎' } }` を返す | `/more` をレンダリング    | 「太郎 でログイン中」を表示                                                                 | 正常 | D-16             |
| CT-16 | アカウントリンクの存在                                          | ─                                                                 | `MoreMenu` をレンダリング | `/more/account` へのリンク「アカウント」が存在                                              | 正常 | F-07             |
| CT-17 | `MoreMenu` のリンクは 3 件（過不足なし。**MM-03 更新**）        | ─                                                                 | `MoreMenu` をレンダリング | リンクが「レシピ」「商品」「アカウント」の 3 件（既存 MM-03「2 件」を置き換える）           | 正常 | F-07（回帰更新） |
| CT-18 | ログアウト押下 → `signOut` → runtime cache 破棄 → `/login` 遷移 | `authClient.signOut` / `caches.delete` をモック                   | `LogoutButton` をクリック | `signOut()` → `caches.delete` が対象 3 キャッシュ名で呼ばれる → `location.assign('/login')` | 正常 | N-04, DF-5       |
| CT-19 | ログアウト失敗時のエラーバナー                                  | `signOut` が reject                                               | クリック                  | `API_FAILURE_MESSAGE` 相当のバナーを表示し、遷移しない                                      | 異常 | エラー処理節     |

### 4-3. `/more/account`

配置: `apps/web/tests/app/more/account/_components/change-password-form.test.tsx`,
`revoke-other-sessions-button.test.tsx`。

| #     | 観点                                          | 前提                           | 操作                                   | 期待結果                                                               | 分類      | 対応要件           |
| ----- | --------------------------------------------- | ------------------------------ | -------------------------------------- | ---------------------------------------------------------------------- | --------- | ------------------ |
| CT-20 | 表示名・メール表示                            | session あり                   | `/more/account` をレンダリング         | 表示名とメールアドレスが表示される                                     | 正常      | F-07               |
| CT-21 | パスワード変更正常 → 成功文言                 | `changePassword` が成功        | フォーム送信                           | 「パスワードを変更しました。他の端末では再ログインが必要です。」を表示 | 正常      | N-05               |
| CT-22 | 現在のパスワード誤り → エラー表示             | `changePassword` が 4xx を返す | フォーム送信                           | エラー文言を表示、成功文言は出ない                                     | 異常      | E-10               |
| CT-23 | 新パスワード確認不一致 → クライアント側エラー | ─                              | 新パスワードと確認欄を不一致にして送信 | `changePassword` を呼ばずにエラー表示                                  | 異常/境界 | フロントエンド設計 |
| CT-24 | 他端末セッション失効ボタン                    | `revokeOtherSessions` をモック | ボタン押下                             | `authClient.revokeOtherSessions()` が呼ばれる                          | 正常      | N-05               |

### 4-4. `NavBar`（既存 `nav-bar.test.tsx` に追加）

| #     | 観点                                            | 前提                      | 操作                                   | 期待結果                                                                    | 分類 | 対応要件 |
| ----- | ----------------------------------------------- | ------------------------- | -------------------------------------- | --------------------------------------------------------------------------- | ---- | -------- |
| CT-25 | `/login` では `NavBar` が非表示                 | `usePathname` が `/login` | `render(<NavBar />)`                   | `null` を返す（`nav` 要素が DOM に存在しない）                              | 正常 | D-7      |
| CT-26 | 他パスでは従来どおり表示（既存 NV-01〜08 回帰） | ─                         | 既存 `nav-bar.test.tsx` をそのまま実行 | 既存ケースが全てグリーンのまま（`/login` 分岐追加のみで既存ロジック非破壊） | 回帰 | 回帰確認 |

### 4-5. `useApiAction` の 401 処理（既存 `use-api-action.test.tsx` に追加）

| #     | 観点                                                     | 前提                                                                  | 操作                                             | 期待結果                                                                                      | 分類      | 対応要件        |
| ----- | -------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- | --------- | --------------- |
| CT-27 | 401 受信 → `/login?next=<現在の pathname+search>` へ遷移 | `window.location` を happy-dom でスタブ（`pathname`/`search` を設定） | `run(() => Promise.resolve(errorResponse(401)))` | `window.location.assign` が `/login?next=<encodeURIComponent(現在の path+search)>` で呼ばれる | 正常      | F-13, D-8, E-03 |
| CT-28 | `silent: true` でも 401 では遷移する                     | 同上                                                                  | `run(request, { silent: true })`（401）          | 遷移は実行される（`errorMessage`/`pending` は更新しない、という既存 `silent` の意味は維持）   | 正常/境界 | D-8             |
| CT-29 | 401 以外（500 等）は既存の失敗文言のまま（回帰）         | 同上                                                                  | 既存 `UAA-02`〜`UAA-09` をそのまま実行           | 遷移せず、既存どおり `errorMessage` に失敗文言が入る                                          | 回帰      | 回帰確認        |

---

## 5. E2E 試験観点（Playwright）

前提: E2E 基盤は整備済み（`apps/web/tests/e2e/` に 2 本、CI で PR ごとに必ず実行。
`.github/workflows/ci.yml` の `e2e` ジョブは `DATABASE_URL` secret の有無で Neon/PGlite を
切り替えるが、**いずれの経路でも `BETTER_AUTH_SECRET` を設定しない**。`playwright.config.ts`
の `webServer.command` は `pnpm dev`（`NODE_ENV=development`）。設計 F-10/D-15 により
`NODE_ENV!=production` × secret 未設定は認証スキップになるため、既存 2 本は無変更で通る）。

| #      | 観点                                                       | 前提                                                                              | 操作                                                                                                                | 期待結果                                                                                                                                        | 分類      | 対応要件               |
| ------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------- |
| E2E-01 | 既存 `recipe-crud.smoke.spec.ts` は無変更で通る            | CI（`BETTER_AUTH_SECRET` 未設定）                                                 | 既存スイートをそのまま実行                                                                                          | 全ステップ成功（Proxy が認証をスキップするため既存挙動のまま）                                                                                  | 回帰      | N-09, AC-03            |
| E2E-02 | 既存 `saturday-flow.spec.ts` は無変更で通る                | 同上                                                                              | 同上                                                                                                                | 同上                                                                                                                                            | 回帰      | N-09, AC-03            |
| E2E-03 | `auth-login.spec.ts`（新規）: 資格情報 env 未設定なら skip | `E2E_AUTH_EMAIL` / `E2E_AUTH_PASSWORD` 未設定（CI は常にこの状態）                | スイート実行                                                                                                        | `test.skip()` により本体は実行されない（CI の `assert-e2e-results.mjs` の「2 件以上実行」判定に本テストの skip が影響しないことを実装時に確認） | 正常/境界 | D-15, R-7              |
| E2E-04 | `auth-login.spec.ts` 本体（ローカル/Preview 限定）         | `E2E_AUTH_EMAIL` / `E2E_AUTH_PASSWORD` が設定され、対象環境に該当アカウントが存在 | `/pantry` へアクセス → `/login?next=%2Fpantry` へリダイレクト → ログイン → `/pantry` に戻る → ログアウト → `/login` | 一連の遷移がすべて成功する                                                                                                                      | 正常      | N-01, F-06, DF-1, DF-2 |

---

## 6. セキュリティ観点（security-reviewer への引き継ぎ）

新規 ID は追加せず、既存 UT/IT/CT/MB/BB を横断参照する引き継ぎ表として整理する
（ADR-0021 の確認 7 本 — 401 応答の非露出・302 の一貫性・除外パスの過不足無し・
`_next/image` 保護・cron 独立判定・fail-closed・資格情報非ログ — を引き継ぐ）。

| SEC ID | 観点                                                       | 参照する既存試験 ID                                                          | 対応要件                           |
| ------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------- |
| SEC-01 | オープンリダイレクト防止                                   | UT-P-04/05/06, CT-08〜12                                                     | E-07, B-02                         |
| SEC-02 | Cookie 属性（`HttpOnly`/`Secure`/`SameSite=Lax`/`Path=/`） | IT-H-03                                                                      | F-09                               |
| SEC-03 | CSRF（`SameSite=Lax` + Origin 検査）                       | IT-H-13                                                                      | E-12, セキュリティ節               |
| SEC-04 | 総当たり対策（レート制限）                                 | IT-H-12                                                                      | E-06, F-16                         |
| SEC-05 | サインアップ閉鎖                                           | IT-H-02                                                                      | F-04, E-05                         |
| SEC-06 | fail-closed（secret 未設定・DB 到達不能）                  | UT-P-09, UT-P-21                                                             | F-10, E-04, E-09                   |
| SEC-07 | `/api/auth/*` を除外しても他 API は保護されたまま          | UT-P-08, UT-P-16, UT-P-25                                                    | B-07                               |
| SEC-08 | `_next/image` が保護されたまま（ADR-0021 継承）            | UT-P-27, BB-08                                                               | セキュリティ節                     |
| SEC-09 | 偽造 Cookie・列挙防止                                      | UT-P-23, IT-H-04                                                             | E-08, B-01, セキュリティ節「列挙」 |
| SEC-10 | 依存パッケージの既知脆弱性（`better-auth` 推移的依存）     | CI 既存の `pnpm audit --prod --audit-level=high`（新規テスト不要。監視のみ） | リスク R-9                         |

---

## 7. 実機・手動確認（MB。すべて人間が実施）

`manual-browser-verify` Skill の書式（PASS / BLOCKED(理由) / FAIL）に従う。**すべて実装完了後、
人間（開発者。必要に応じてパートナーの端末を借用）が実施する。** 自動化できない理由は
Web Push・standalone PWA・Cookie 永続がブラウザ/OS の実装依存であるため。

| ID    | 確認項目                                                                                                                               | 前提                                                | 期待結果                                                                             | 対応要件                                   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| MB-01 | iOS ホーム画面 PWA: ログイン成功                                                                                                       | 実機・発行済みアカウント                            | ログインでき `/` 等の保護ページが表示される                                          | N-01, AC-05                                |
| MB-02 | iOS: アプリ終了 → 再起動 → ログイン不要                                                                                                | MB-01 実施済み                                      | 再起動後も未ログイン画面へ遷移しない                                                 | N-02, AC-05                                |
| MB-03 | iOS: 7 日以上放置後の起動（ITP が `HttpOnly` Cookie に影響しない想定）                                                                 | 実機で 7 日以上待つ（困難な場合は理由付き BLOCKED） | 未ログインへ落ちない（覆る場合は `expiresIn` ではなく iOS 挙動を別途調査）           | リスク R-6                                 |
| MB-04 | iOS: ログアウト → `/login`、以後保護ページは 302                                                                                       | MB-01 実施済み                                      | ログアウト後、他画面へアクセスすると `/login` に戻る                                 | N-04, AC-05                                |
| MB-05 | iOS: 通知クリック起動（未認証時 `/login`→元 URL、既認証時そのまま表示）                                                                | Web Push 購読済み・通知受信                         | 両ケースとも意図どおりの画面が開く                                                   | N-08, AC-05                                |
| MB-06 | Android Chrome PWA: ログイン成功                                                                                                       | 実機                                                | MB-01 と同様に成功                                                                   | N-01, AC-05                                |
| MB-07 | Android: アプリ終了 → 再起動 → ログイン不要                                                                                            | MB-06 実施済み                                      | MB-02 と同様                                                                         | N-02, AC-05                                |
| MB-08 | Android: ログアウト → `/login`                                                                                                         | MB-06 実施済み                                      | MB-04 と同様                                                                         | N-04, AC-05                                |
| MB-09 | Android: 通知クリック起動                                                                                                              | 同上                                                | MB-05 と同様                                                                         | N-08, AC-05                                |
| MB-10 | 30 日後挙動の代替確認: `auth-set-password` で全セッション失効 → 次操作で `/login` に戻る                                               | 実機ログイン済み端末                                | 失効後、次のページ操作で `/login` へ戻る                                             | N-02（代替）                               |
| MB-11 | `/shopping-lists/<id>` を SW 経由で開いた状態でセッション失効 → 302 →ログイン後オフライン再訪問でリダイレクト応答が cache されていない | standalone/ブラウザで対象 URL を開いた状態を作る    | オフライン再訪問時に `/login` へ飛ばない（R-5 の実機確認）                           | F-12, リスク R-5                           |
| MB-12 | Preview URL でのログイン（`trustedOrigins` の妥当性）                                                                                  | Preview デプロイに `BETTER_AUTH_SECRET` 登録済み    | email + password でログインできる                                                    | N-11, D-12                                 |
| MB-13 | ログアウト後の戻るボタンで保護ページの内容が再表示されない                                                                             | ログアウト直後                                      | ブラウザの「戻る」で以前表示していた保護ページの内容（bfcache 含む）が再表示されない | 境界値項目（要件書に明記なしだが指示事項） |
| MB-14 | `pnpm build` で Proxy バンドルの top-level await が問題なく通る                                                                        | ローカルビルド                                      | ビルドが成功する（罠10）                                                             | 実装上の罠10                               |
| MB-15 | `pnpm build` 後の Proxy バンドルサイズ記録（推奨）                                                                                     | 同上                                                | サイズを記録し、性能節の推定と比較する（必須ではない）                               | 性能節（計測推奨）                         |

---

## 8. 本番 black-box 確認（BB。人間（開発者）がリリース手順の一部として実施）

設計書「移行とリリース」手順 7 の確認表をそのまま試験項目化。実施は本番デプロイ後、
`BASIC_AUTH_*` 削除前（設計 D-11 の順序）。

| ID                      | パス                                                                        | 期待                                                                                                                | 対応要件                    |
| ----------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| BB-01                   | `/`（Cookie 無し）                                                          | `302 Location: /login?next=%2F`                                                                                     | F-02, N-01, AC-04           |
| BB-02                   | `/api/pantry`（Cookie 無し）                                                | `401` JSON、`Cache-Control: no-store`                                                                               | E-02, AC-04                 |
| BB-03                   | `/login`                                                                    | `200`                                                                                                               | F-01, AC-04                 |
| BB-04                   | `/api/auth/ok`                                                              | `200`                                                                                                               | F-03, AC-04                 |
| BB-05                   | `/api/auth/sign-up/email`（POST）                                           | `4xx`（閉鎖）                                                                                                       | F-04, E-05, AC-04           |
| BB-06                   | `/manifest.webmanifest`                                                     | `200`                                                                                                               | N-06, AC-04                 |
| BB-07                   | `/_next/static/...`（実在アセット）                                         | `200`                                                                                                               | N-06, AC-04                 |
| BB-08                   | `/_next/image?url=/icons/icon.svg&w=64&q=75`                                | `302`（除外していないことの確認。ADR-0021 継承）                                                                    | セキュリティ節, AC-04       |
| BB-09                   | `/api/cron/expiry-alerts`                                                   | `401`（Proxy ではなく cron 自身の判定。`{ error: 'Unauthorized' }`、`Location` 無し）                               | N-07, AC-04                 |
| BB-10                   | `/api/cron/..%2fpantry`                                                     | `401` か `404`。`200` ならパス正規化の穴                                                                            | セキュリティ節, AC-04       |
| BB-11                   | `/api/authx`                                                                | `401`（`api/auth/` 前方一致の境界）                                                                                 | B-07, AC-04                 |
| BB-12（Preview・SEC-2） | Preview で `X-Forwarded-For` を偽装しつつ誤パスワードで `/login` を連打する | 攻撃者側 IP ごとに個別の 429 になる（`no-trusted-ip` の共有バケットに落ちず、正規ログインが巻き添えにならないこと） | SEC-2, E-06, F-16, AC-04    |
| BB-13（Preview・SEC-7） | Preview で `trustedOrigins` の実値を確認する                                | Preview からのログインが `403 INVALID_ORIGIN` にならない（`trustedOrigins` が空配列になっていないこと）             | セキュリティ節, N-11, AC-04 |

---

## 9. 特性観点（横断）

- **権限（B-05）**: アカウントは 2 つとも同権限でロール分岐が存在しない。いずれか 1 アカウントで
  IT-H / CT の観点を満たせば両アカウントに等しく適用される。ロール別の追加テストは不要
  （`public-release-basic-auth.md` の前例を踏襲）。
- **データ整合性**: セッション `expiresAt` の計算（IT-H-19）、Cookie キャッシュのサイズ上限
  （IT-H-22, B-08）、`users`/`accounts` の 2 行書き込みの部分失敗リスク（エラー処理(d)。
  スクリプト経由のみで発生しうる。IT-S-01 系はハッピーパスのみを自動化し、部分失敗からの
  手動復旧手順は運用ドキュメント側の担当とする）。
- **冪等性**: sign-in の多重実行（IT-H-23）、未ログイン sign-out（IT-H-24）、
  `auth-set-password` の再実行（IT-S-10）、subscribe 相当の概念は本 feature に無い。
- **障害系（外部ライブラリ経由の DB I/O。設計書「エラー処理」節 (a)〜(e) に対応）**:
  - (a) リトライ無し: UT-P-21（`getSession` 例外がそのまま伝播）で確認。
  - (b) タイムアウト: Vercel Function 実行上限に委ねる設計のため専用テストは無し
    （対象外・理由: Proxy 独自のタイムアウトを設けない設計）。
  - (c) 冪等性: 上記「冪等性」参照。
  - (d) 部分失敗: IT-S 系のハッピーパスのみ自動化（上記データ整合性参照）。
  - (e) フォールバック（fail-closed）: UT-P-09（secret 未設定）、UT-P-21（DB 到達不能相当の
    例外伝播）で「検証不能なら通す」に倒さないことを確認。
- **フロントエンド固有**: ローディング（CT-03）、エラー表示（CT-04〜06, CT-19, CT-22, CT-23）、
  楽観的更新は本 feature に該当なし（対象外。ログイン・ログアウト・パスワード変更はいずれも
  フルナビゲーションかバナー表示で、楽観的更新を行わない設計）。
- **防御性（Domain の Entity/VO は対象に含まないが、Proxy を「単一の関門」として
  `public-release-basic-auth.md` の前例に倣い再解釈して適用する）**:
  - 不変条件: `proxy()` は未認証を一貫して同じ応答（302/401/503）に正規化し、検証不能を
    通過扱いにしない（UT-P-21, UT-P-23, UT-P-24）。
  - 副作用の検証: 503/401 発生時にログへ資格情報・メールアドレスを残さない（UT-P-29, UT-P-30）。
    スクリプトはパスワードを引数・ログに残さない（IT-S-05 の防御性観点）。
  - 不正引数の伝搬: `next` の不正値（外部 URL・スキーム相対・長さ超過）が最終的に `/` へ
    正規化され、無効な遷移先を生成しない（UT-P-04, CT-08〜11）。

---

## 10. 回帰試験範囲

- **既存 Hono ルートテスト**（`cron.test.ts` / `push.test.ts` / `pantry.test.ts` /
  `products.test.ts` / `recipes.test.ts` / `meal-plans.test.ts` /
  `shopping-lists.*.test.ts` / `stores.test.ts`）: いずれも `app.request()` で Hono アプリを
  直接呼び、Next.js の `proxy()` を経由しない（実測: 既存テストに `NextRequest`/`proxy` の
  import が無い）。`app.ts` が新たに `@/server/auth` を import しても `getAuth()` は遅延
  シングルトンのため、これら既存テストの実行結果に変化が無いことをスイート実行で確認する
  （実装上の罠5 の確認も兼ねる。`@/db/client` の `vi.mock` と衝突しないことを含む）。
- **既存 RTL テスト**: `more-menu.test.tsx` は MM-03（「ちょうど 2 件」）を CT-17（3 件）に
  置き換える。`nav-bar.test.tsx` の既存 NV-01〜08 はロジック変更なしで全てグリーンのまま
  （CT-25/26 として明記）。`use-api-action.test.tsx` の既存 UAA-01〜09 は 401 分岐追加の
  影響を受けない（CT-29 で確認）。
- **既存 E2E 2 本**: 無変更で通る（E2E-01, E2E-02。根拠は D-15 のスキップ経路）。
- **PWA インストール**（`manifest.webmanifest` 200）: UT-P-11（単体構造）+ BB-06（本番）で
  二重に確認。
- **`_next/static` 200**: UT-P-12 + BB-07。
- **`push`/`cron` の契約不変**: `push.test.ts`/`cron.test.ts` は `app.request()` 直呼びのため
  無影響。そのまま実行して green を確認する（新規観点の追加は不要）。
- **`packages/domain` / `packages/application` への差分ゼロ**（AC-06）: 自動テストではなく
  `git diff` によるレビュー確認。CI の既存テストスイートに変化が無いことで間接的に裏付ける。
- **既知の flaky（PRE_EXISTING。2026-09-17 implementer 追記）**:
  `tests/app/shopping-lists/_components/shopping-list-client.offline-queue.test.tsx:137` が
  `pnpm --filter @cookpit/web test` の全体実行時に稀に失敗することがある
  （security-reviewer の報告 `docs/reviews/better-auth-login.security.md` 補足。
  `aria-checked` の待ち合わせに見える）。単独実行では 3 回連続で合格し、本 feature は
  `use-checked-sync-queue.ts` の 401 分岐（F-02）以外このファイルに触れていないため、
  本 feature 由来ではなく既存の flaky として回帰範囲から除外する。

---

## 11. 試験データ

- **テスト用アカウント（Vitest/PGlite 用。本番資格情報は書かない）**:
  - email: `test-user-1@example.test` / `test-user-2@example.test`（`.test` TLD で実在ドメインとの衝突を避ける）。
  - 表示名: 「テスト太郎」「テスト花子」。
  - パスワード: テストコード内でリテラル生成する 12 文字以上のダミー値（例:
    `'test-password-1234'`。実運用パスワードと無関係であることをコメントで明記する）。
  - E2E（`auth-login.spec.ts`）: `E2E_AUTH_EMAIL` / `E2E_AUTH_PASSWORD` 環境変数経由。本書には
    値を書かない。CI では未設定のため常に skip（E2E-03）。
- **PGlite migration 適用手順**: `packages/infrastructure/tests/testing/create-test-db.ts` は
  手書き DDL で認証テーブルを含まないため、認証系テスト専用に
  `apps/web/tests/server/auth/testing/apply-auth-migrations.ts`（新規ヘルパー案）を作り、
  `apps/web/src/db/migrations/*.sql` を journal 順に PGlite へ適用する（`setup-pglite-dev.mjs`
  と同じロジックをテスト用に切り出す。設計書「DB 設計 > PGlite での扱い」の指示どおり）。
  IT-H / IT-INF はこのヘルパーを共有する。
- **レート制限テスト（IT-H-12）**: `createAuth()` に注入する `rateLimit` 設定でテスト用の
  小さい閾値（例: `window: 10, max: 3`）を明示的に渡し、Better Auth の実際の既定値に
  依存しない（既定値は D-5 で要検証のため、テストコードが既定値をハードコードすると
  実装時の値変更で無関係に壊れる）。

---

## 12. メソッド網羅チェック表（再掲・観点対応）

§1 の一覧に対応する試験観点 No は各行にすでに記載済み。全 public メンバーに最低 1 件の
観点が付いていることを以下のとおり確認した。

| モジュール                                              | 全 public メンバーに観点が付いているか               |
| ------------------------------------------------------- | ---------------------------------------------------- |
| `proxy.ts`（`proxy` / `config`）                        | 済（UT-P-01〜30）                                    |
| `create-auth.ts` / `server/auth/index.ts`               | 済（IT-H 群、UT-P-09/10 が `isAuthConfigured` 経由） |
| `server/app.ts` の `/auth/*` マウント                   | 済（IT-H-01）                                        |
| `auth-schema.ts` / `infrastructure` バレル              | 済（IT-INF-01）                                      |
| `auth-client.ts`                                        | 済（CT 群が間接的に呼び出し元）                      |
| `use-api-action.ts` の 401 分岐                         | 済（CT-27〜29）                                      |
| `login-form.tsx` / `login/page.tsx`                     | 済（CT-01〜14）                                      |
| `more/page.tsx` / `more-menu.tsx` / `logout-button.tsx` | 済（CT-15〜19）                                      |
| `more/account/page.tsx` とその子コンポーネント          | 済（CT-20〜24）                                      |
| `nav-bar.tsx`                                           | 済（CT-25, CT-26）                                   |
| `sw.ts` の `cacheWillUpdate`                            | 済（UT-SW-01〜04）                                   |
| `scripts/auth-create-user.ts` / `auth-set-password.ts`  | 済（IT-S-01〜10）                                    |

---

## 13. 要件観点の照合（要件書 F/N/E/B の全項目）

| 要件 ID | 反映状況（対応試験 ID）                                                                                                     |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| F-01    | CT-01, CT-07, CT-14, IT-H-03                                                                                                |
| F-02    | UT-P-01, UT-P-08, UT-P-18, UT-P-19, IT-H-01                                                                                 |
| F-03    | IT-H-01                                                                                                                     |
| F-04    | IT-H-02                                                                                                                     |
| F-05    | IT-S-01〜IT-S-10                                                                                                            |
| F-06    | CT-18, IT-H-06                                                                                                              |
| F-07    | CT-20〜CT-24                                                                                                                |
| F-08    | UT-P-20, IT-H-19, IT-H-20                                                                                                   |
| F-09    | IT-H-03                                                                                                                     |
| F-10    | UT-P-09, UT-P-10, UT-P-28, UT-P-29                                                                                          |
| F-11    | UT-P-11〜UT-P-17                                                                                                            |
| F-12    | UT-SW-01〜04, MB-11                                                                                                         |
| F-13    | CT-27, CT-28                                                                                                                |
| F-14    | 回帰試験範囲節（`BASIC_AUTH_*` コード削除は AC-08 として grep レビューで確認。自動テスト対象外）                            |
| F-15    | IT-INF-01、試験データ節の migration 適用手順                                                                                |
| F-16    | IT-H-12                                                                                                                     |
| F-17    | 対象外（ドキュメント更新。自動テスト対象外、レビュー確認事項）                                                              |
| N-01    | CT-07, IT-H-03                                                                                                              |
| N-02    | MB-02, MB-07（実機）、MB-10（代替）                                                                                         |
| N-03    | IT-H-20                                                                                                                     |
| N-04    | CT-18, IT-H-06, MB-04, MB-08                                                                                                |
| N-05    | CT-21, CT-24, IT-H-07, IT-H-09                                                                                              |
| N-06    | UT-P-11〜14, UT-P-17, BB-06, BB-07                                                                                          |
| N-07    | UT-P-15, BB-09（既存 `cron.test.ts` は非対象で回帰確認のみ）                                                                |
| N-08    | MB-05, MB-09                                                                                                                |
| N-09    | UT-P-10, E2E-01, E2E-02                                                                                                     |
| N-10    | UT-P-18                                                                                                                     |
| N-11    | MB-12                                                                                                                       |
| N-12    | IT-S-01, IT-S-06                                                                                                            |
| N-13    | IT-H-21（**自動化困難と明記**。性能節の手動計測に委ねる。§14 参照）                                                         |
| E-01    | CT-04, IT-H-04                                                                                                              |
| E-02    | UT-P-08                                                                                                                     |
| E-03    | CT-27                                                                                                                       |
| E-04    | UT-P-09, UT-P-28                                                                                                            |
| E-05    | IT-H-02                                                                                                                     |
| E-06    | IT-H-12, CT-05                                                                                                              |
| E-07    | UT-P-04, CT-08〜12                                                                                                          |
| E-08    | UT-P-23                                                                                                                     |
| E-09    | UT-P-21                                                                                                                     |
| E-10    | CT-22, IT-H-08                                                                                                              |
| E-11    | IT-S-02, IT-S-03                                                                                                            |
| E-12    | IT-H-13                                                                                                                     |
| B-01    | UT-P-22, UT-P-23, UT-P-24                                                                                                   |
| B-02    | UT-P-04〜07, CT-08〜12                                                                                                      |
| B-03    | UT-P-24, IT-H-20, IT-H-21                                                                                                   |
| B-04    | IT-H-14〜17, IT-S-03, IT-S-04, IT-S-08, IT-S-09                                                                             |
| B-05    | §9 特性観点「権限」で言及。追加テスト不要                                                                                   |
| B-06    | UT-P-02                                                                                                                     |
| B-07    | UT-P-16, UT-P-25, UT-P-26                                                                                                   |
| B-08    | IT-H-22                                                                                                                     |
| B-09    | 対象外（運用手順の確認事項。`openssl rand` で生成する人間の作業であり自動テスト不可。MB/BB 実施前提条件として明記するのみ） |

---

## 14. 未実装観点（基盤待ち）・設計への差し戻し候補

### 14-1. 未実装観点（基盤待ち。実装時の判断待ちのため本書では対象外と明記）

- **第二段（パスキー）の観点**: 本 feature のスコープ外。設計書「第二段（パスキー）設計」に
  骨子があるのみで、実装は別 PR。本書では試験項目を作らない。
- **CI 専用アカウントによるログイン込み E2E**: 設計書「スコープ外の気づき」のとおり、CI は
  認証スキップ経路に依存し続ける（R-7）。PGlite 経路での CI 専用アカウント発行は将来の
  改善候補として設計書に記録済みであり、本書でも対象外とする。
- **IT-H-02〜24 / IT-S-01〜10 の PGlite 格下げ**: §3-3 のとおり、`drizzleAdapter` が
  `drizzle-orm/pglite` で動かない場合は Neon Preview での手動確認に格下げる。実装時に判明
  次第、本書へ追記する。
- **IT-H-21（N-13: Cookie キャッシュ有効時に DB を参照しない）**: Vitest から Better Auth の
  内部 DB 呼び出し回数を直接観測する手段が契約書未確定のため用意できていない。性能節の
  `curl` 計測（手動）に委ねる。

### 14-2. 設計への差し戻し候補（矛盾・不足を見つけた場合。設計は変更せず提示のみ）

1. **`cacheWillUpdate` の単体テストが成立するための前提が設計書の対象範囲表に無い**。
   設計書「フロントエンド設計 > Service Worker」は `cacheWillUpdate` を `NetworkFirst` の
   `plugins` 配列内インラインで記述しており、対象範囲表も `apps/web/src/app/sw.ts` の変更
   としか書いていない。しかし `sw.ts` は `self.__SW_MANIFEST` に依存するモジュールで、
   （`docs/tests/expiry-alert.md` §0-2 で確認済みの既知事象のとおり）Node/happy-dom 環境で
   モジュール全体を import すると `Serwist` コンストラクタ呼び出しで失敗する可能性が高い。
   `cacheWillUpdate` を純関数として単体テスト（UT-SW-01〜04）するには、ロジックを
   `sw.ts` から独立した別ファイル（例: `apps/web/src/app/sw-cache-plugins.ts`）へ切り出す
   実装が必要になる可能性が高いが、これは設計書の対象範囲表に新規ファイルとして記載が
   無い。実装計画に反映してよいか Orchestrator 経由で確認したい。
2. **N-13（Cookie キャッシュ有効時は DB を参照しない）の自動検証方法が未定義**。設計書・
   契約骨子のいずれにも、Proxy/Better Auth が実際に DB へクエリを発行したかどうかを
   テストコードから観測する手段（クエリロガーのフック等）の言及が無い。契約書確定時に
   計測方法を追加するか、性能節の手動 `curl` 計測のみで足りるとするか、Orchestrator 経由で
   方針を確認したい（現時点では IT-H-21 を「自動化困難」として本書に明記した）。
3. **レート制限の具体的な閾値（回数・秒数）が設計書に明記されていない**（D-5 は
   `storage: 'database'` の可否のみ「要検証」とし、`max`/`window` の値は書かれていない）。
   IT-H-12 はテスト側で閾値を注入して固定する方針にしたが、本番相当の実際の閾値は
   contract-designer / implementer の確定を待つ必要がある。

> **Orchestrator 判断（2026-09-17）**: 1 は採用。切り出し先は
> `apps/web/src/app/_utils/sw-cache-plugins.ts`（`cacheWillUpdate`。実装計画 Step 6 と同一）とし、設計書の
> 対象範囲表に追加した（UT-SW-01〜04 はこのファイルを対象にする）。2 は手動 `curl` 計測で
> 足りるとする（IT-H-21 は「自動化困難」のまま。性能節の推定値の確認は Preview で行う）。
> 3 は Better Auth 既定値（全体 100 req/60 s、`/sign-in/email` 3 req/10 s）を採用し
> `customRules` は設定しない（設計書 D-5 に追記。契約書 §5 と一致）。IT-H-12 の閾値注入方針は
> そのままでよい。

### 14-3. 未実装 ID の一覧（reviewer B-01 指摘の追跡。2026-09-17 implementer 追記）

`auth-route.test.ts` へ IT-H-06/07/08/09/12/13 を追加し（B-01 の (a)）、§15-2 の合格基準を
実態に合わせるため、それでも残る未実装 ID を理由・代替とともに記録する（B-01 の (b)）。
IT-H-10 は本タスク以前から実装済み、IT-H-24（未ログイン sign-out の冪等性）は IT-H-06 の
延長で自主的に追加した（試験計画にない観点の自主追加）。

| ID                                                                     | 理由                                                                                                                                                                  | 代替                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| IT-H-05（`get-session` 正常）                                          | 本タスクの指摘範囲（B-01 の追加対象リスト）に含まれない                                                                                                               | IT-H-09 の revoke-other-sessions 検証内で `get-session` が非 null を返すことを間接確認済み。ユーザー情報の中身までの専用アサーションは次タスクで追加する                                                                                   |
| IT-H-11（同一 email 二重発行拒否）                                     | HTTP 経由のサインアップは IT-H-02 で閉鎖済みで、発行経路はスクリプト限定                                                                                              | IT-S-02（`auth-create-user` の重複 email 失敗）で同じ制約をスクリプト側から確認済み                                                                                                                                                        |
| IT-H-14〜17（`change-password` 新パスワード長境界 11/12/128/129 文字） | 本タスクの指摘範囲外。境界値ごとに 4 ケース必要で工数が嵩む                                                                                                           | `create-auth.ts` の `minPasswordLength: 12` / `maxPasswordLength: 128` を静的に確認済み。実測は `docs/reviews/better-auth-login.md` EV-06（11/129 文字が 400 で拒否）で部分的に裏付け済み。12/128 文字ちょうどの成功系は次タスクで追加する |
| IT-H-18（email 形式不正）                                              | Better Auth 組み込みスキーマ依存で本タスクの指摘範囲外                                                                                                                | 次タスクで追加、または BB での手動確認                                                                                                                                                                                                     |
| IT-H-19（`expiresAt` = `createdAt` + 30 日）                           | DB 行の生成時刻比較用ヘルパーが必要で本タスクの指摘範囲外                                                                                                             | 契約書 §10-19（要検証扱いのまま）                                                                                                                                                                                                          |
| IT-H-20（`updateAge` 1 日境界での延長）                                | DB の `updatedAt` を意図的に過去日時へ書き換える追加ヘルパーが必要                                                                                                    | 性能節の `curl` 計測（手動）に委ねる（IT-H-21 と同じ扱い）                                                                                                                                                                                 |
| IT-H-22（`session_data` Cookie が 4KB 未満）                           | Cookie 全体長の計測が必要で本タスクの指摘範囲外                                                                                                                       | `docs/reviews/better-auth-login.md` EV-05（実測 931 バイト）で裏付け済み                                                                                                                                                                   |
| IT-H-23（sign-in の多重実行が害を及ぼさない）                          | 本タスクの指摘範囲外                                                                                                                                                  | 次タスクで追加                                                                                                                                                                                                                             |
| IT-INF-01（`authSchema` バレル import）                                | `packages/infrastructure` は本タスクの変更対象外（コード変更なし）                                                                                                    | `pnpm --filter @cookpit/web type-check` が `authSchema` の実 import 解決に依存しており、失敗時はビルドが落ちるため間接的に担保されている                                                                                                   |
| CT-15（`/more` の表示名表示）                                          | 本リポジトリに Server Component を直接レンダリングする試験の前例が無い（`apps/web/tests` に `page.test.tsx` は 0 件。B-01 (b) で「対象外 + 理由」を書く指摘のとおり） | MB-12（Preview URL でのログイン）で表示名が出ることを手動確認する                                                                                                                                                                          |
| CT-20（`/more/account` の表示名・メール表示）                          | 同上                                                                                                                                                                  | 同上（MB-12 の確認範囲に含める）                                                                                                                                                                                                           |

§15-2 の合格基準はこれらの未実装 ID を除いた実態に更新した（§15-2 参照）。

---

## 15. 完了条件

### 15-1. 受け入れ条件（AC-01〜AC-08）との対応

| AC    | 内容                                                                         | 対応                                                                                                                  |
| ----- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| AC-01 | F-01〜F-17 が設計書に反映され 12 論点に決定が書かれている                    | 対象外（本試験計画の対象外。architecture-designer/reviewer の確認事項。設計書 D-1〜D-19 で充足確認済み）              |
| AC-02 | N-01〜N-13 / E-01〜E-12 / B-01〜B-09 が試験計画に対応づけられている          | §13「要件観点の照合」で充足（全項目に対応 ID または対象外理由あり）                                                   |
| AC-03 | lint / type-check / test / build が通り既存 E2E 2 本が CI で通る             | E2E-01, E2E-02 + 全 UT/IT/CT の green。実装後に `pnpm lint`/`pnpm type-check`/`pnpm test`/`pnpm build` を実行して確認 |
| AC-04 | 本番 black-box 確認（保護対象 302/401、除外パス 200、cron が Bearer 判定）   | §8 BB-01〜BB-13                                                                                                       |
| AC-05 | iOS/Android 実機で 4 項目（ログイン/再起動維持/ログアウト/通知クリック起動） | §7 MB-01/02/04/05（iOS）、MB-06/07/08/09（Android）                                                                   |
| AC-06 | `packages/domain`/`packages/application` に差分が無い                        | 回帰試験範囲節（`git diff` によるレビュー確認。自動テスト対象外）                                                     |
| AC-07 | ADR-0022 が Accepted、ADR-0021 が Superseded に更新                          | 対象外（ドキュメントレビュー事項。ADR-0022 は本書作成時点で既に Accepted と確認済み）                                 |
| AC-08 | `BASIC_AUTH_*` のコード参照が 0 件、`.env.example` から削除                  | 対象外（grep によるレビュー確認。自動テストでは検出できないため実装完了時に確認する）                                 |

### 15-2. 自動テストの合格基準（2026-09-17 implementer 更新。実態に合わせて記録）

§14-3 の未実装 ID を除き、以下が実装され全てグリーンであることを合格基準とする
（B-01 (b)。PGlite 格下げは発生しなかった — §3-3 の判断基準どおり `createAuth({ db:
drizzle(pglite) })` での疎通を確認済み。契約書 §10-8）。

- UT-P-01〜30 / UT-SW-01〜04（34 件、全件実装済み）。
- IT-H-01/02/03/04/06/07/08/09/10/12/13/24（実装済み 12 件。うち 01 は 01b（POST 経路）も
  併せて回帰確認。IT-H-05/11/14〜20/21/22/23 は §14-3・14-1 のとおり未実装で、理由と代替を
  記録済み）。
- IT-S-01〜10（10 件、全件実装済み）。
- IT-INF-01 は未実装（§14-3）。
- CT-01〜29 のうち CT-15/CT-20 を除く 27 件が実装済み（§14-3。既存 `more-menu.test.tsx` の
  MM-03 は CT-17 に置き換わっている）。
- E2E-01〜04（4 件。E2E-03 は skip が正しい動作）が CI で green。
- 自動テストの実装済み ID 数（MB/BB を除く自動化対象 102 件中）: 30 + 4 + 12 + 10 + 0 + 27 + 4
  = **87 件**（UT-P30 + UT-SW4 + IT-H12 + IT-S10 + IT-INF0 + CT27 + E2E4）。
- `pnpm --filter @cookpit/web lint` / `type-check` / `test` / `build` が通ること。
- `pnpm --filter @cookpit/web exec playwright test`（ローカルまたは CI）が 2 件以上実行され
  全件成功すること（既存 `assert-e2e-results.mjs` の判定基準を踏襲）。

### 15-3. 手動確認の記録先

- MB-01〜15（実機・手動確認）と BB-01〜13（本番 black-box。BB-12/13 は Preview 実施）の結果は
  `docs/reviews/better-auth-login.md`（新規作成想定。他タスクの前例に倣い証拠欄を設ける）に
  PASS / BLOCKED(理由) / FAIL で記録する。BLOCKED はコードリーディングでの補完結果と
  完全確認に必要な条件を併記する（`manual-browser-verify` Skill の完了条件のとおり）。
- §14-1「未実装観点（基盤待ち）」に該当した項目は、格下げの判断と結果を同レビュー記録に
  追記する。

---

## 試験項目サマリ

| 種別                                                          | 件数                             |
| ------------------------------------------------------------- | -------------------------------- |
| 単体（UT）                                                    | 34（UT-P 30, UT-SW 4）           |
| 結合（IT）                                                    | 35（IT-H 24, IT-S 10, IT-INF 1） |
| コンポーネント（CT）                                          | 29                               |
| E2E                                                           | 4                                |
| 実機・手動確認（MB。人間実施）                                | 15                               |
| 本番 black-box（BB。人間実施。うち BB-12/13 は Preview 実施） | 13                               |
| **合計**                                                      | **130**                          |
| うち人間が実施する項目数                                      | **28**（MB 15 + BB 13）          |

セキュリティ観点（SEC-01〜10）は新規カウントに含めない横断参照表のため、上記合計には
含めていない。
