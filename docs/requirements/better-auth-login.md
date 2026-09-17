# 要件定義: better-auth-login

- task-id / 変更レベル: better-auth-login / L3（判定理由: 認証・認可の変更 + 新規 DB テーブル +
  新規画面 + 依存パッケージ追加。`logs/2026-09-17.md`）
- 作成日: 2026-09-17

## 背景

本番アプリは 2026-09-16 に HTTP Basic 認証（`apps/web/src/proxy.ts`、
[ADR-0021](../decisions/ADR-0021-basic-auth-for-public-repository.md)）で保護され、GitHub
リポジトリは public 化された。Basic 認証は「公開に先立って 2 名以外を排除する」目的の暫定策
であり、ADR-0021 自身が次の残存リスクを記録している。

- ログアウト手段が無い（Basic 認証の性質）。
- Service Worker 経由の 401 では Chromium が認証ダイアログを出さず、`/shopping-lists/<id>`
  から起動した standalone PWA が再認証できずに固まりうる（Chromium issue 623464）。
- Basic 認証はブラウザが資格情報を自動付与する ambient authority であり、CSRF が理屈の上で
  成立する（現状の緩和は JSON スキーマの必須項目に依存しており、フレームワークが保証する
  ものではない）。
- 総当たりに対する試行回数制限・ロックアウトが無く、防御は `BASIC_AUTH_PASSWORD` の
  エントロピーに全面依存する。
- 通知クリックからの standalone PWA 起動時に再認証ダイアログが出る可能性がある。

ユーザーは 2026-09-17 に、Basic 認証を **Better Auth による正式なログイン画面と Cookie
セッション認証**へ置き換えることを決めた。方式は「第一段: email + password」「第二段:
パスキー（Face ID / 指紋）を上乗せし、パスワードは復旧手段へ格下げ」の二段構え。本 feature
は第一段を実装し、第二段は設計のみ含める（実装は別 PR）。

## 目的

1. 2 名の利用者が、自分の端末（iPhone / Android のホーム画面 PWA）で **一度ログインすれば
   30 日程度はログインし直さずに**アプリを使えるようにする。
2. ADR-0021 が受容していた残存リスク（ログアウト不可・SW 経由 401・CSRF・総当たり・通知
   クリック時の再認証）を構造的に解消する。
3. 第二段（パスキー）を阻害しない土台（アカウント・セッション・アカウント設定画面）を作る。
4. 追加費用ゼロ（Vercel Hobby + Neon 無料枠）を維持し、Neon の compute 時間を増やさない。

## ユーザー要求（原文の要約）

ユーザー確定事項（2026-09-17。設計で覆さない）:

- U-1 認証導入とドメインへの User 導入は切り離す。`createdBy` のドメイン導入はスコープ外。
  [ADR-0004](../decisions/ADR-0004-no-user-in-domain.md)（ドメインに User を持たない）は
  維持し、置換するのは ADR-0021 のみ。
- U-2 追加費用ゼロ。Neon の compute 時間を抑えるため Better Auth の Cookie キャッシュ
  （`session.cookieCache`）を有効化する。
- U-3 パスワードリセットは「開発者がスクリプトで再設定」の運用。メール送信基盤は導入しない
  （`requireEmailVerification: false`、`sendResetPassword` 未使用）。
- U-4 サインアップは閉鎖（`emailAndPassword.disableSignUp: true`）。アカウント発行・
  パスワード再設定はスクリプトで行う。
- U-5 セッションは長め（30 日程度・利用で延長）。ホーム画面 PWA で毎回ログインさせない。
- U-6 Google OAuth・マジックリンクは採用しない（将来の選択肢として ADR の非採用案に残す）。
- U-7 第一段は Better Auth の email + password。サインアップ画面は作らず、2 名分の
  アカウントは開発者がスクリプトで発行する。第二段は `@better-auth/passkey`。

## 機能要件

- F-01 `/login` 画面を新設する。メールアドレスとパスワードのフォームで
  `POST /api/auth/sign-in/email`（Better Auth）を呼び、成功したら `next` クエリで指定された
  相対パス（既定 `/`）へ遷移する。
- F-02 全ページと `/api/*`（F-11 の除外を除く）は有効なセッション Cookie を必須とする。
  未認証の画面ナビゲーションは `/login?next=<元の相対パス>` へ 302 でリダイレクトし、
  未認証の `/api/*` は `401` JSON（`{ "error": "Unauthorized" }`、`Cache-Control: no-store`）を
  返してリダイレクトしない。
- F-03 Better Auth の HTTP ハンドラを Hono に `/api/auth/*`（GET / POST）としてマウントする。
  Next.js 側の catch-all（`app/api/[[...route]]/route.ts`）は変更しない。
- F-04 サインアップは閉鎖する（`disableSignUp: true`）。`POST /api/auth/sign-up/email` は
  4xx で拒否される。
- F-05 アカウント発行とパスワード再設定は開発者が `apps/web/scripts/` のスクリプトで行う。
  パスワードはコマンドライン引数で渡さず、環境変数または対話入力で受け取る。パスワード
  再設定はそのユーザーの全セッションを失効させる。
- F-06 ログアウト導線を `/more` に置く。ログアウト後は `/login` へ遷移し、保護ページは再び
  302 になる。
- F-07 アカウント設定画面 `/more/account` を新設する。ログイン中ユーザーの表示名・メール
  アドレスを表示し、パスワード変更（現在のパスワード + 新パスワード）と、他端末セッションの
  失効を行える。第二段のパスキー登録 UI はこの画面に足す。
- F-08 セッションは 30 日で失効し、利用中は延長される（`expiresIn` 30 日・`updateAge` 1 日）。
  Cookie キャッシュを有効化し、キャッシュが有効な間は DB を参照せずに検証する。
- F-09 セッション Cookie は `HttpOnly` / `Secure`（HTTPS 時）/ `SameSite=Lax` / `Path=/` とする。
- F-10 fail-closed: `BETTER_AUTH_SECRET` が未設定または空のとき、`NODE_ENV=production`
  （Vercel Preview を含む）では保護対象パスに `503`（`Cache-Control: no-store`、本文なし）を
  返す。`NODE_ENV` が production 以外では認証をスキップする（現行 Basic 認証と同じ規約。
  CI の E2E と `pnpm dev` を壊さないため）。
- F-11 Proxy の除外パスは現行（`favicon.ico` / `manifest.webmanifest` / `sw.js` /
  `_next/static/` / `icons/` / `api/cron/`）を維持し、`api/auth/` を追加する。`/login` は
  Proxy を通すが認証を要求しない（ログイン済みなら `/` へ 302）。
- F-12 Service Worker（`apps/web/src/app/sw.ts`）の `NetworkFirst` は、リダイレクトされた
  応答・200 以外の応答をキャッシュしない。`/login` と `/api/auth/*` を runtimeCaching の
  対象にしない。ログアウト時にランタイムキャッシュを破棄する（ベストエフォート）。
- F-13 Client Component からの API 呼び出しが `401` を受けたら（セッション失効）、
  `useApiAction` が `/login?next=<現在のパス>` へ遷移する。
- F-14 Basic 認証のコード（`proxy.ts` の Basic 部分・`proxy.node.test.ts`・
  `playwright.config.ts` の `httpCredentials`・`.env.example` の `BASIC_AUTH_*`）を本 PR で
  削除する。
- F-15 Better Auth が要求するテーブル（`users` / `sessions` / `accounts` / `verifications`、
  およびレート制限を DB ストレージにする場合の `rate_limits`）を Drizzle スキーマと
  migration として追加する。既存テーブルは変更しない。
- F-16 サインイン等の認証エンドポイントにレート制限を掛ける（Better Auth 組み込み）。
- F-17 `apps/web/.env.example` を更新し、`BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` を追記する。
  ADR-0021 の Status を `Superseded by ADR-0023` に更新し、`docs/01-overview.md` /
  `docs/02-tech-stack.md` / `docs/03-architecture.md` の Basic 認証の記述を更新する。

## 非機能要件（性能・セキュリティ・可用性など。無ければ「対象外」）

- セキュリティ: 防御方式を「共有資格情報の毎リクエスト送信（Basic）」から「個人アカウント +
  署名付き Cookie セッション」へ切り替える。パスワードは Better Auth 既定のハッシュ（scrypt）
  で保存する。偽造 Cookie（署名不一致）では SSR データも API も返さない。CSRF は
  `SameSite=Lax` Cookie と Better Auth の Origin 検査で緩和する。総当たりはレート制限で緩和する。
- 性能: 外部ライブラリ経由の DB I/O（セッション検証）を新設するため、設計書の性能節を厚く
  書く（性能設計の条件 1）。Cookie キャッシュが有効な間は Proxy が DB を参照しない。数値は
  推定として明示する。
- 可用性: `BETTER_AUTH_SECRET` 未設定時は fail-closed（503）。DB 到達不能時も通さない
  （fail-closed）。
- 費用: 追加費用ゼロ。Neon の compute 時間は「ページ自身の SSR クエリが既に compute を
  起こしている」ため、認証で新たな起床は発生しない見込み（推定）。
- 互換性: iOS / Android のホーム画面 PWA（standalone）でログイン・Cookie 永続・通知クリック
  起動が動くこと。

## 正常系

- N-01 正しいメールアドレスとパスワードで `/login` からログインすると、`next` が指す相対パス
  （無ければ `/`）へ遷移し、以後のページ・API が通る。
- N-02 ログイン後 30 日以内の再訪問（ブラウザ・standalone PWA とも）はログインを求められない。
- N-03 利用中はセッションが延長され、「最後の利用から 30 日」まで有効になる（`updateAge`
  の粒度で延長）。
- N-04 `/more` の「ログアウト」でセッションが失効し `/login` へ遷移する。以後、保護ページは
  302、`/api/*` は 401 になる。
- N-05 `/more/account` でパスワードを変更すると、他端末のセッションは失効し、操作した端末の
  セッションは継続する。
- N-06 `/manifest.webmanifest` / `sw.js` / `/icons/*` / `/favicon.ico` / `/_next/static/*` は
  未認証で取得でき、PWA のインストールと Service Worker 登録が壊れない。
- N-07 Vercel Cron の `GET /api/cron/expiry-alerts` は Proxy の対象外のまま、`CRON_SECRET`
  の Bearer 認証で保護される。
- N-08 通知クリックで standalone PWA が `/pantry` 等を開いたとき、セッションが有効ならそのまま
  表示され、失効していれば `/login?next=/pantry` を経て元の URL に戻る。
- N-09 `NODE_ENV` が production 以外で `BETTER_AUTH_SECRET` 未設定なら認証はスキップされ、
  CI の E2E スモーク 2 本と `pnpm dev` は現状どおり動く。
- N-10 ログイン済みで `/login` を開くと `/` へ 302 される。
- N-11 Vercel Preview デプロイでも（Preview 用の `BETTER_AUTH_SECRET` を登録すれば）
  email + password でログインできる。
- N-12 開発者がスクリプトで 2 名分のアカウントを発行し、必要時にパスワードを再設定できる。
- N-13 Cookie キャッシュが有効な間（`cookieCache.maxAge` 以内）は、Proxy が DB へ問い合わせ
  ずにセッションを検証する。

## 異常系

- E-01 メールアドレスまたはパスワードが誤っていると、どちらが誤りかを区別しない同一の
  エラー文言を表示し、ログインしない。
- E-02 未認証で `/api/*`（`/api/auth/*` と `/api/cron/*` を除く）を呼ぶと `401` JSON が返り、
  リダイレクトされない。
- E-03 画面利用中にセッションが失効し API が `401` を返したら、`useApiAction` が
  `/login?next=<現在のパス>` へ遷移する。
- E-04 `NODE_ENV=production` で `BETTER_AUTH_SECRET` が未設定・空のとき、保護対象パスは
  `503`（本文なし・`Cache-Control: no-store`）になる。`WWW-Authenticate` は付かない。
- E-05 `POST /api/auth/sign-up/email` は `disableSignUp` により 4xx で拒否される。
- E-06 短時間に多数のサインイン試行を行うと Better Auth が `429` を返し、`/login` は
  「試行回数が多すぎます」旨を表示する。
- E-07 `next` に外部 URL（`https://...`）・スキーム相対（`//evil`）・`/\evil` を渡しても
  遷移先は `/` になる（オープンリダイレクト防止）。Proxy が生成する `next` は常に相対パス。
- E-08 署名の合わない偽造 Cookie・改ざんした Cookie キャッシュでは、Proxy が未認証と判定し
  SSR データを返さない。
- E-09 DB に到達できず検証できない場合は通さない（500 系）。「検証不能なら通す」に倒さない。
- E-10 パスワード変更で現在のパスワードが誤っていると変更されず、エラーを表示する。
- E-11 アカウント発行スクリプトは、同じメールアドレスが既に存在すれば非ゼロ終了コードで
  失敗し、行を作らない。パスワードが下限未満でも同様。
- E-12 `/api/auth/*` への POST で `Origin` が信頼済みオリジンでなければ Better Auth が拒否する。

## 境界条件（null・空・上限/下限・権限境界）

- B-01 Cookie が無い・空・署名不一致・期限切れは、いずれも「未認証」として同じ応答にする
  （区別して情報を漏らさない）。
- B-02 `next` は「`/` で始まり、2 文字目が `/` でも `\` でもない」相対パスのみ許可する。
  それ以外・未指定は `/`。長さ上限は 2,000 文字（超過は `/`）。
- B-03 セッション期限ちょうど: `expiresAt` を過ぎたら未認証。Cookie キャッシュの `maxAge`
  を過ぎたら DB で再検証し、有効ならキャッシュを更新する。
- B-04 パスワードは 12 文字以上 128 文字以下（Better Auth 既定の下限 8 を 12 へ引き上げる。
  スクリプトも同じ制約を適用する）。
- B-05 権限境界: アカウントは 2 つとも同権限（ロール無し）。ドメイン層・アプリケーション層は
  ユーザー ID を一切受け取らない（U-1 / ADR-0004）。
- B-06 Next.js のクライアントナビゲーションが付ける `_rsc` クエリは `next` から除去する。
- B-07 除外パスはセグメント境界で判定する（現行 MW-M12 の回帰防止を踏襲）。`api/auth/` は
  前方一致で除外し、`/api/authx` は保護対象。
- B-08 Cookie キャッシュ（`session_data`）はユーザー行 + セッション行を含むため、ブラウザの
  Cookie 上限（約 4 KB）に収まることを確認する（表示名・メールのみで数百バイト想定）。
- B-09 `BETTER_AUTH_SECRET` は 32 バイト以上（`openssl rand -base64 32`）。

## 前提

- 利用者は 2 名（開発者本人とパートナー）。アカウントは 2 つ。
- 本番は Vercel（プロジェクト `cookpit-web`、Hobby）+ Neon 無料枠。Next.js 16.2.12 /
  Hono 4.13.1 / drizzle-orm 0.45.x / drizzle-kit 0.31.x / React 19.2 / Vitest 4.1。
- `better-auth@1.7.5` / `@better-auth/passkey@1.7.5` / `@better-auth/cli@1.4.21` の peer
  要件を本リポジトリは満たす（Orchestrator が 2026-09-17 に確認）。
- Proxy は Next.js 16 の `proxy` 規約（Node.js ランタイム）で動く（ADR-0021 で確認済み）。
- Vercel Preview は `NODE_ENV=production` で動く（ADR-0021）。CI の E2E は `pnpm dev`
  （`NODE_ENV=development`）で動き、`BETTER_AUTH_SECRET` を渡さない。
- 通知（Web Push）と Cron は本 feature で変更しない。`push_subscriptions` はユーザーに
  紐づけない。

## 制約

- Domain / Application 層（`packages/domain` / `packages/application`）は変更しない。
  Better Auth への依存はこの 2 パッケージに一切生じない。
- Better Auth の Drizzle スキーマは `@better-auth/cli generate` の生成物を基にし、手書きで
  逸脱しない（第二段でプラグイン追加時に再生成できるようにする）。
- 既存テーブルは変更しない。追加テーブルのみ。
- 追加費用ゼロ。外部サービス（メール配信・OAuth プロバイダ）を導入しない。
- 実装コードの変更は本要件・設計の確定後（Gate A 承認後）に行う。

## 対象範囲

- `apps/web/src/proxy.ts` の Basic 認証からセッション検証への書き換えと `apps/web/tests/proxy.node.test.ts` の置換。
- Better Auth インスタンスと Hono マウント（`apps/web/src/server/auth/`、`apps/web/src/server/app.ts`）。
- Drizzle スキーマと migration（`packages/infrastructure/src/db/auth-schema.ts`、
  `apps/web/drizzle.config.ts`、`apps/web/src/db/migrations/`）。
- 画面: `apps/web/src/app/login/`、`apps/web/src/app/more/`（ログアウト・アカウント）、
  `apps/web/src/app/_components/nav-bar.tsx`（`/login` で非表示）。
- クライアント: `apps/web/src/lib/auth-client.ts`（新規）、`apps/web/src/lib/use-api-action.ts`（401）。
- Service Worker: `apps/web/src/app/sw.ts`（キャッシュ条件）。
- スクリプト: `apps/web/scripts/auth-create-user.ts` / `auth-set-password.ts`、`apps/web/package.json`。
- 設定: `apps/web/.env.example`、`apps/web/playwright.config.ts`、`apps/web/e2e/README.md`。
- ドキュメント: ADR-0023 新規、ADR-0021 Status 更新、`docs/01-overview.md` /
  `docs/02-tech-stack.md` / `docs/03-architecture.md` の認証記述。

## 対象外

- 第二段（パスキー登録・ログイン）の実装。設計は設計書「第二段（パスキー）設計」に含める。
- ドメイン・アプリケーション層への `userId` / `createdBy` 導入（U-1 / ADR-0004 維持）。
- `push_subscriptions` のユーザー紐づけ、通知のユーザー別配信。
- メール送信（検証メール・リセットメール）、Google OAuth、マジックリンク、サインアップ画面。
- ロール・権限差、3 人目以降のアカウント運用。
- 監査ログ、ログイン履歴画面、セッション一覧画面（他端末セッション失効は「全部失効」の
  1 操作のみ）。
- 独自ドメインへの移行（パスキーの RP ID に影響するが、本 feature では扱わない）。

## 後方互換性・データ移行（該当なければ「対象外」）

- 既存のユーザーデータ（在庫・献立・買い物リスト・レシピ）は変更しない。DB 変更は
  Better Auth テーブルの追加のみ（additive）。
- ブラウザ / OS に保存済みの Basic 資格情報は使われなくなるだけで害は無い。2 名は切替後の
  初回起動時に一度ログインする。PWA の再インストールは不要（`manifest` / `sw.js` は
  未認証で取得できる規約を維持するため）。
- 切替順序（詳細は設計書「移行とリリース」）: migration 適用 → アカウント 2 件発行 →
  Preview で実機確認 → Production 環境変数登録 → デプロイ → 実機確認 → `BASIC_AUTH_*`
  環境変数を削除。ロールバックは Vercel の前デプロイへの即時ロールバックで行う（前デプロイの
  Basic 認証が使う `BASIC_AUTH_*` は実機確認完了まで残す）。
- Basic 認証との共存期間は設けない（一括切替）。理由は設計書 D-11。

## 受け入れ条件（Definition of Done に対応）

- AC-01 F-01〜F-17 が設計書 `docs/designs/better-auth-login.md` に反映され、12 論点すべてに
  決定（またはトレードオフ併記 + 推奨）が書かれている。
- AC-02 N-01〜N-13 / E-01〜E-12 / B-01〜B-09 が試験計画（`docs/tests/better-auth-login.md`）で
  自動テストまたは実機確認項目に対応づけられている。
- AC-03 `pnpm lint` / `pnpm type-check` / `pnpm test` / `pnpm build` が通り、既存 E2E
  スモーク 2 本が CI で従来どおり通る。
- AC-04 本番 URL に対する black-box 確認（設計書「移行とリリース」の確認表）で、保護対象が
  302 / 401、除外パスが 200、`/api/cron/*` が Bearer 判定であることを確認している。
- AC-05 iOS standalone PWA と Android PWA の両方で、ログイン → 再起動でログイン維持 →
  ログアウト → 通知クリック起動の 4 項目を実機確認している。
- AC-06 `packages/domain` / `packages/application` に差分が無い。
- AC-07 ADR-0023 が Accepted になり、ADR-0021 が `Superseded by ADR-0023` に更新されている。
- AC-08 `BASIC_AUTH_*` のコード参照が 0 件になり、`.env.example` から削除されている。

## 未決事項（誰に何を確認するか）

> **確定（2026-09-17 Gate A）**: 設計書「未決事項」の 3 件はすべて推奨案でユーザー承認済み。

Gate A でユーザーに確認する事項（設計書「未決事項」と同一）:

1. Better Auth の置き場所 — インスタンスを `apps/web/src/server/auth/`、Drizzle スキーマを
   `packages/infrastructure/src/db/auth-schema.ts`（既存 `schema.ts` と別ファイル、
   テーブル名は複数形）にする案でよいか。
2. Proxy でセッションを**完全検証**する（`auth.api.getSession` を Proxy から呼び、DB
   クライアントが Proxy バンドルに含まれる）案でよいか。代替は「Proxy は Cookie 存在確認のみ +
   各ページ・各ルートで検証」。
3. 切替方式 — Basic 認証との共存期間を設けず、同一 PR で Basic 認証コードを削除する一括
   切替でよいか。

implementer / contract-designer が検証・確定する事項（ユーザー確認は不要）:

- `better-auth@1.7.5` の Drizzle アダプタが `neon-http`（トランザクション不可）で動くか。
  動かない場合の代替（設計書 D-18）。
- `rateLimit.storage: 'database'` がサーバーレスで期待どおり動くか（設計書 D-5）。
- `drizzle-orm/pglite` 上で Better Auth のアダプタが動くか（dev / テスト経路）。
- `@better-auth/cli generate` の出力（テーブル名・列名の casing）を契約として確定する。
- スクリプト実行に `tsx` を devDependency として追加してよいか（代替: Node 22.18+ の
  型注釈除去）。
- `session.freshAge` がパスワード変更・他端末失効を妨げないか（妨げる場合は無効化）。
