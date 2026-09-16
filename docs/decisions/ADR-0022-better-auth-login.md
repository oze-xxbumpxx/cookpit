# ADR-0022: Basic 認証を Better Auth のログイン画面と Cookie セッション認証へ置き換える

- Status: Proposed（Gate A 承認待ち）
- Date: 2026-09-17
- 関連 feature: better-auth-login
- 置換対象: [ADR-0021](./ADR-0021-basic-auth-for-public-repository.md)（本 ADR の Accepted 時に
  `Superseded by ADR-0022` へ更新する）
- 維持: [ADR-0004](./ADR-0004-no-user-in-domain.md)（ドメインに User を持ち込まない）

## Context（背景・なぜ判断が必要か）

2026-09-16 にリポジトリを public 化するにあたり、本番アプリを HTTP Basic 認証で保護した
（ADR-0021）。これは「2 名以外を排除する」ための暫定策で、ADR-0021 自身が次を残存リスクとして
記録している。

1. ログアウト手段が無い。
2. Service Worker が返す 401 に Chromium は認証ダイアログを出さず、`/shopping-lists/<id>` から
   起動した standalone PWA が再認証できず固まりうる（Chromium issue 623464）。
3. Basic 認証は ambient authority であり CSRF が理屈の上で成立する。現状の緩和は「JSON ボディを
   取る POST が必須項目を持つ」という偶然に依存し、全項目任意の POST を足した時点で崩れる。
4. 総当たりに対する試行回数制限・検知が無く、防御は共有パスワードのエントロピーのみ。
5. 通知クリックからの standalone PWA 起動時に再認証ダイアログが出る可能性がある。

加えて、ユーザーは「Face ID / 指紋でログインしたい」「ホーム画面 PWA で毎回ログインしたく
ない」という要望を持つ。Basic 認証はブラウザ / OS の資格情報保存に依存し、これらを満たす
設計余地が無い。

ADR-0003 は Phase 2 の本命として Better Auth を挙げており、ADR-0021 も「将来 Phase 2 で必要に
なった時点で本 ADR を置き換えればよい」としている。その時点が来た。

ただし ADR-0021 が Better Auth を却下した理由の一つ「ADR-0004（ドメインに User を持たない）との
整合を再検討する必要がある」は、今回は**切り離す**ことで解決する。認証（誰がリクエストして
いるかの確認）とドメインの User 概念（誰が何を作ったかの記録）は別問題であり、前者だけを
導入して後者は導入しない。

## Decision（採用した決定）

**Basic 認証を Better Auth による email + password のログイン画面と Cookie セッション認証へ
置き換える（第一段）。パスキー（`@better-auth/passkey`）は第二段として別 PR で上乗せする。**

設計上の主な決定（詳細は設計書 D-1〜D-19）:

- **ドメインに触れない。** `packages/domain` / `packages/application` は Better Auth を知らず、
  UseCase はユーザー ID を受け取らない。`createdBy` の導入はスコープ外（ADR-0004 維持）。
  Better Auth の `users` テーブルはライブラリ所有のテーブルであり、ドメインの集約ではない。
- **置き場所**: auth インスタンスは `apps/web/src/server/auth/`（`repositories.ts` と同じ
  composition root）。Drizzle スキーマは `packages/infrastructure/src/db/auth-schema.ts`
  （既存 `schema.ts` と別ファイル。CLI 生成物を上書きできるようにする）。`packages/infrastructure`
  は `better-auth` に依存しない。
- **Hono にマウント**: `app.on(['GET', 'POST'], '/auth/*', c => getAuth().handler(c.req.raw))`。
  `basePath('/api')` 配下で Better Auth 既定の `/api/auth` と一致する。API の入口は
  引き続き 1 本（ADR-0002）。
- **Proxy で完全検証**: `apps/web/src/proxy.ts` が `auth.api.getSession` でセッションを
  検証する。Cookie 存在確認だけでは、Server Component が UseCase を直接呼ぶ本リポジトリの
  構成（方式 A）で偽 Cookie により SSR データが見えるため。Cookie キャッシュ（署名付き
  `session_data` Cookie）により通常は DB を参照しない。未認証は画面なら
  `302 /login?next=<相対パス>`、`/api/*` なら `401` JSON。`BETTER_AUTH_SECRET` 未設定 ×
  `NODE_ENV=production` は 503（fail-closed。Preview も対象。ADR-0021 の判定規約を踏襲）。
- **サインアップ閉鎖・スクリプト運用**: `disableSignUp: true`。2 名分のアカウント発行と
  パスワード再設定は `apps/web/scripts/` の TypeScript スクリプトで行う。メール送信基盤は
  導入しない（検証メール・リセットメール無し）。
- **セッション**: 30 日・利用で延長（`updateAge` 1 日）・Cookie キャッシュ 5 分・
  `HttpOnly; Secure; SameSite=Lax`。レート制限は Better Auth 組み込み（DB ストレージ。要検証）。
- **一括切替**: Basic 認証との共存期間を設けず、同一 PR で Basic 認証コードを削除する。
  Vercel の `BASIC_AUTH_*` は本番実機確認完了までロールバック用に残す。
- **第二段を阻害しない**: `/more/account`（パスキー登録 UI の置き場）、`users.name`、
  ログインフォームの拡張領域、`auth-schema.ts` の再生成手順を第一段で用意する。`passkeys`
  テーブルの migration は第二段で作る。

## Alternatives（検討した非採用案と却下理由）

### A. Google OAuth（Better Auth の social provider）

パスワードを持たずに済み、UI も Google 任せにできる。

却下理由: Google Cloud プロジェクトと OAuth 同意画面の運用が要り、未検証アプリのまま使うと
テストユーザー枠と定期的な再承認に縛られる。iPhone 利用者（開発者）にとって Google アカウントは
必須ではなく、パートナーに特定のアカウント種別を強いる。外部 ID プロバイダの停止・仕様変更が
そのまま締め出しになる。2 名利用で得るものが少ない。将来 3 人目以降を招く運用になったら
再検討する。

### B. マジックリンク（メールに一時 URL を送る）

パスワード不要で、Better Auth のプラグインで実装できる。

却下理由: メール配信基盤（Resend 等）が要り、無料枠はあっても外部サービスと到達性の
運用が増える。決定的なのは PWA との相性で、iOS のメールアプリからリンクを開くと Safari の
タブで開き、ホーム画面の standalone PWA とは別のストレージ文脈に Cookie が入る。
「PWA でログインしたはずなのに PWA が未ログイン」という体験になる。

### C. 共有パスワードのフォームログイン（自前 Cookie セッション）

Basic 認証のダイアログをフォームに置き換えるだけの最小案。ライブラリ不要。

却下理由: セッション発行・署名・失効・レート制限・パスワードハッシュを自前で書くことになり、
Better Auth を使うより監査対象が増える。個人アカウントが無いため第二段のパスキー（個人の
認証器に紐づく）へ進めない。「ログアウト」「他端末失効」は実装できるが、パスワード変更が
2 名同時に効く共有運用のまま。

### D. Vercel Deployment Protection

ADR-0021 でも検討した案。設定のみで完結する。

却下理由（変わらず）: Hobby プランで使えるのは Vercel Authentication で、パートナーに Vercel
アカウントとチーム所属を要求する。Password Protection は Pro 限定で月額費用が発生する。
パスキーも通知クリック時の UX も改善しない。

### E. Basic 認証を維持する（現状維持）

却下理由: Context に挙げた 5 つの残存リスクと、ユーザー要望（パスキー・毎回ログインしない）を
いずれも満たさない。

### 検討した設計上の代替（採用案の内側）

- `toNextJsHandler` で `app/api/auth/[...all]/route.ts` に置く: API の入口が 2 本になり
  ADR-0002 と `app.request()` によるテストの一貫性を崩す。`nextCookies()` の利点は Server
  Action から Cookie を書かない本設計では不要。不採用。
- Proxy は Cookie 存在確認のみ + 各ページ・各ルートで検証: 多層防御だが 10 画面 +
  9 ルートファイル + ルートテスト十数本に手が入り、1 ページの検証漏れがそのまま漏洩になる。
  第一段では不採用（必要になれば Hono の `app.use` に 1 本足す形で追加できる）。
- Better Auth を `packages/infrastructure` に置く: DB アダプタと同居する筋の良さはあるが、
  infrastructure が HTTP ハンドラを export し `better-auth` に依存することになる。不採用
  （テーブル定義のみ infrastructure に置く）。
- `schema.ts` に Better Auth テーブルを統合: drizzle.config の変更は不要だが、第二段の CLI
  再生成のたびに手書き部分とのマージが要る。不採用。
- Basic 認証との共存期間: Preview で同じ検証ができ、2 名に二重認証を強いる価値が無い。不採用。

## Consequences（良い影響・悪い影響・残るリスク）

### ポジティブ

- ログアウト・パスワード変更・他端末失効が可能になる（残存リスク 1 の解消）。
- 未認証の navigation は 401 ではなく `/login` への 302 になり、Service Worker 経由でも通常の
  ページ遷移として復帰できる。API の 401 はアプリ自身が `/login?next=` へ誘導する
  （残存リスク 2・5 の解消）。
- `SameSite=Lax` の Cookie によりクロスサイトの POST / fetch に資格情報が付かず、CSRF が
  JSON スキーマの偶然に依存しなくなる。`/api/auth/*` は Better Auth の Origin 検査で守られる
  （残存リスク 3 の解消。`hono/csrf` は引き続き不要）。
- 認証エンドポイントにレート制限が掛かり、パスワードは scrypt で保存される。防御が
  「共有パスワードのエントロピー」だけに依存しなくなる（残存リスク 4 の緩和）。
- 30 日セッション + Cookie キャッシュにより、ホーム画面 PWA で毎回ログインせずに済む。
- Cookie キャッシュにより通常のリクエストで DB を参照しない。Neon の compute 時間は
  「ページ自身の SSR クエリが既に compute を起こしている」ため実質増えない（推定）。
- 第二段（パスキー）の土台ができる。
- ドメインモデルは変わらない。ADR-0004 の「必要になってから追加する」原則が維持される。

### ネガティブ

- 依存パッケージが増える（`better-auth` と推移的依存、スクリプト実行用の `tsx`）。CI の
  依存監査に掛かる可能性がある。
- Proxy バンドルに `better-auth` + drizzle + neon クライアントが入り、コールドスタートが
  延びる（推定 +数十〜数百 ms。実装後に計測）。
- Better Auth 所有のテーブル 4〜5 本が増える。`verifications` と `accounts` の OAuth 列は
  第一段では未使用。
- アカウント発行・パスワード再設定が開発者のスクリプト運用になる（メール送信を持たない
  代償。2 名利用では許容）。
- Better Auth 所有テーブルの列名 casing が既存の snake_case と異なりうる（別ファイルに
  隔離することで許容）。

### 残るリスク

- **Proxy が単一の関門である。** matcher の誤りや Vercel 側の正規表現エンジン差はそのまま
  保護漏れになる（ADR-0021 と同じ構造）。本番 black-box 確認表と matcher の構造テストで
  緩和する。多層防御（Hono 側の検証）は必要になった時点で追加する。
- **`rateLimit.storage: 'database'` がサーバーレスで期待どおり動かない可能性。** 動かなければ
  インメモリ（インスタンス単位）を受容し、総当たり耐性はパスワード長（12 文字以上）と scrypt
  に依存する。
- **`drizzleAdapter` が neon-http（トランザクション不可）で動かない可能性。** 動かなければ
  アダプタの `transaction` 無効化 → 不可なら認証専用の WebSocket 接続（ADR-0020 の
  「1 リクエスト 1 接続」規約を Proxy にも適用）へ切り替える。
- **設定ミスによる全員締め出し**（Cookie prefix のずれ・secret 誤登録・`BETTER_AUTH_URL`
  誤り）。Preview で先に検証し、ロールバックは前デプロイ + 温存した `BASIC_AUTH_*` で行う。
- `BETTER_AUTH_SECRET` を回転すると全端末が再ログインになる（sessions 行は残るが Cookie が
  無効化される）。運用手順に明記する。
- iOS standalone PWA での Cookie 永続は実機で確認する。HttpOnly Cookie は ITP の 7 日制限の
  対象外という理解だが、実測で覆れば `expiresIn` ではなく iOS 側の挙動を調査する。
- CI の E2E は「`NODE_ENV!=production` × secret 未設定なら認証スキップ」の経路に依存し、
  ログインフロー自体は CI で走らない（RTL とローカル / Preview の E2E で補う）。
- パスキー（第二段）は RP ID = オリジンに紐づく。Vercel Preview では本番のパスキーが使えず、
  独自ドメインへ移す場合は全員が登録し直す。

## Migration（移行手順）

順序が重要（逆順は無防備または締め出しの窓を開ける）。詳細は設計書「移行とリリース」。

1. PR 作成。CI の E2E ジョブが `db:migrate` を本番 Neon に実行し、Better Auth テーブルが
   追加される（追加のみ。既存テーブルに差分が無いことを migration SQL のレビューで確認）。
2. Preview 環境に Preview 専用の `BETTER_AUTH_SECRET` を登録（`BETTER_AUTH_URL` は登録しない）。
3. 開発者の手元から `auth:create-user` で 2 名分のアカウントを発行（パスワードは対話入力）。
4. Preview で実機確認（ログイン / ログアウト / パスワード変更 / 通知クリック /
   `manifest.webmanifest` 200 / cron の Bearer 判定）。
5. Production 環境に `BETTER_AUTH_SECRET`（本番用）と `BETTER_AUTH_URL=https://cookpit-web.vercel.app`
   を登録。`BASIC_AUTH_*` はまだ消さない。
6. マージ → 本番デプロイ。
7. 本番 black-box 確認（設計書の確認表 11 本。matcher は Vercel 側のエンジンで評価されるため
   本番で再確認する）。
8. 2 名の端末（iOS / Android の standalone PWA）でログインし、再起動でログイン維持を確認。
9. `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` を Vercel から削除。本 ADR を Accepted に、
   ADR-0021 を `Superseded by ADR-0022` に更新。`docs/01-overview.md` / `02-tech-stack.md` /
   `03-architecture.md` の Basic 認証の記述を更新。

## Rollback（決定を戻す場合の手順）

- **実機確認前（手順 7〜8 で問題発覚）**: Vercel で前デプロイへ即時ロールバックする。前
  デプロイは Basic 認証のコードで、温存した `BASIC_AUTH_*` を使うため即座に保護が戻る。
  Better Auth のテーブルは残しても無害（Basic 認証コードは参照しない）。
- **`BASIC_AUTH_*` 削除後**: 前デプロイへ戻すだけでは 503（fail-closed）になる。`BASIC_AUTH_*`
  を再登録してからロールバックする。
- **Better Auth のテーブルを消す場合**: `DROP TABLE` の down migration を別途書く（第一段では
  用意しない。テーブルが残っても害が無いため）。
- 環境変数だけを削除した場合は 503（fail-closed）であり「保護なしでの復旧」にはならない
  （ADR-0021 と同じ）。

## References

- [ADR-0003: MVP1 は認証なしで運用する](./ADR-0003-no-auth-in-mvp1.md) — Better Auth を
  Phase 2 の本命として挙げた元の判断
- [ADR-0004: ドメインから User 集約を外す](./ADR-0004-no-user-in-domain.md) — 本 ADR で維持
- [ADR-0021: リポジトリ公開にあたり本番を Basic 認証で保護する](./ADR-0021-basic-auth-for-public-repository.md) — 本 ADR が置換
- [ADR-0002: Next.js に Hono をマウントする](./ADR-0002-nextjs-hono-mounted.md) — API 入口 1 本の根拠
- [ADR-0010: パッケージの公開境界をバレルに統一する](./ADR-0010-package-public-boundary.md) — 置き場所の判断に使用
- [ADR-0020: トランザクション接続は 1 リクエスト 1 接続](./ADR-0020-tx-connection-per-request.md) — 認証専用 WebSocket 接続へ切り替える場合の規約
- `docs/requirements/better-auth-login.md`
- `docs/designs/better-auth-login.md`
- `logs/2026-09-17.md` — 認証方式の比較と二段構えの確定
