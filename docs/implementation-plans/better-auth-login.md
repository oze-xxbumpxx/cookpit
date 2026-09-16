# 実装計画: better-auth-login

- 前提となる要件定義書: `docs/requirements/better-auth-login.md`
- 前提となる設計書: `docs/designs/better-auth-login.md`（ステータス: draft。§未決事項の Gate A
  3 件は 2026-09-17 に確定済み。本計画はこの確定内容と矛盾しない）
- 関連 ADR: `docs/decisions/ADR-0022-better-auth-login.md`（Status: Accepted）、
  `docs/decisions/ADR-0021-basic-auth-for-public-repository.md`（本 PR で Superseded に更新）
- 契約: `docs/designs/better-auth-login.contract.md`（contract-designer が並列作成中。
  **本計画作成時点で未作成**。存在しなければ設計書「契約骨子」節を入力にする。契約確定後、
  Cookie 名・prefix・列名・casing・401/302 の応答形・`next` の許可形式が本計画の記述と
  食い違わないか整合確認すること）
- 試験計画: `docs/tests/better-auth-login.md`（test-designer が並列作成中。
  **本計画作成時点で未作成**。本計画のテストケースは設計書「テスト方針」節をそのまま
  ケース化した草案であり、確定版が出たら ID 対応・過不足を突き合わせる）
- レベル: L3
- 実装ルート: Orchestrator（implementer = `claude-sonnet-5`）。1 PR。第二段（パスキー）は対象外。
- 判断理由: 指示書に書き切れない実装時判断が複数残る（`docs/06-ai-tools.md`
  「指示書に書き切れないなら Orchestrator」）。具体的には (1) Step 0 の 9 項目の検証結果に
  応じて `createAuth()` の実装が枝分かれする（トランザクション無効化 or WebSocket 接続切替、
  レート制限 database or memory 等）、(2) Proxy バンドルの `pnpm build` 結果次第で
  `db/client.ts` の TLA 分岐修正が要る、(3) セキュリティ判断（Cookie 署名検証・fail-closed・
  オープンリダイレクト防止）を含み最終レビューを Claude Code に集約する必要がある、
  (4) DB migration の生成物（CLI + drizzle-kit の 2 段階生成）を都度目視確認する必要がある。
  定型・ボイラープレート比重は低くない画面部分もあるが、上記の分岐判断が支配的なため
  Codex 委譲ではなく Orchestrator 経路とする。

## 前提の確認（実装計画作成時点。Grep/Glob/Read で実測）

| #   | 確認事項                                                              | 実測結果                                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/web/src/proxy.ts` の現状                                        | Basic 認証実装（105 行）。`decodeBasicCredentials`/`sha256`/`timingSafeStringEqual`/`proxy`/`config.matcher` の 5 要素。**全置換**する                                                                                                                                                      |
| 2   | `apps/web/tests/proxy.node.test.ts` の現状                            | 47 ケース（MW-01〜23・MW-18b・MW-19b・MW-19c・MW-M01〜M12）。Basic 認証専用のため**全置換**する                                                                                                                                                                                             |
| 3   | `apps/web/src/server/app.ts` の現状                                   | 全 39 行。`new Hono().basePath('/api')` → 9 ルートを `.route()` でチェーン（`AppType` になる）→ `app.onError`（`NotFoundError`→404 / `InvalidOperationError`→422 / それ以外→500）。`/auth/*` はチェーンに含めず `app.on(...)` を別行で足す                                                  |
| 4   | `apps/web/src/app/api/[[...route]]/route.ts`                          | `hono/vercel` の `handle(app)` を GET/POST/PUT/PATCH/DELETE で export 済み。Better Auth は GET/POST のみ使うため**変更不要**                                                                                                                                                                |
| 5   | `apps/web/src/server/repositories.ts`                                 | `import 'server-only'` + 手動 DI。Better Auth はここに置かない（`server/auth/` に分離。Gate A (1)）。**変更不要**                                                                                                                                                                           |
| 6   | `packages/infrastructure/src/index.ts` の現状                         | `export * from './db/schema'` 等 + `export * as schema from './db/schema'`。`authSchema` も同じ namespace export の作法で追記する                                                                                                                                                           |
| 7   | `packages/infrastructure/src/db/client.ts` の `createDb()`            | `drizzle(neon(databaseUrl), { schema })` — **`schema` は app 用の 1 モジュールのみバインド**。`authSchema` は含まれない。Better Auth の drizzleAdapter が `db.query.*`（リレーショナル API）を使うなら `authSchema` を含まない `db` では失敗しうる（Step 0 に追加検証項目として明記）       |
| 8   | `apps/web/drizzle.config.ts` の現状                                   | `schema: '../../packages/infrastructure/src/db/schema.ts'`（単一文字列）。配列化が必要                                                                                                                                                                                                      |
| 9   | `apps/web/src/db/migrations/` の最大連番                              | `0009_shopping_list_pantry_coverage.sql` が最大。次は `0010`。`meta/_journal.json` の `entries` は 10 件（idx 0-9）                                                                                                                                                                         |
| 10  | `apps/web/scripts/` の既存ファイル形式                                | 全て `.mjs`（`setup-pglite-dev.mjs` 等）。新規スクリプトは `createAuth()` 再利用のため `.ts` にする（design D-10）。`setup-pglite-dev.mjs` はヘッダコメントに使い方を書く慣習があり、新規スクリプトもこれを踏襲する                                                                         |
| 11  | `apps/web/scripts/setup-pglite-dev.mjs` の migration 適用ロジック     | `meta/_journal.json` を読み、未適用 `tag` の `.sql` を `--> statement-breakpoint` で分割して `db.exec()`。テストヘルパー化する際はこのロジックを再利用する                                                                                                                                  |
| 12  | `apps/web/src/db/client.ts` の TLA                                    | モジュールトップレベルで `await import('./pglite-client')`（19-23 行目、`databaseUrl?.startsWith('pglite:')` の分岐内）。Proxy バンドルでこの TLA が許容されるか `pnpm build` で要確認（罠 10）                                                                                             |
| 13  | `apps/web/src/app/more/page.tsx` / `_components/more-menu.tsx` の現状 | `MorePage` は非 async。`MoreMenu` はレシピ・商品の 2 リンクのみ（`MORE_LINKS` 配列）。テスト `more-menu.test.tsx` の MM-03 が「ちょうど 2 件」を検証中                                                                                                                                      |
| 14  | `apps/web/src/app/_components/nav-bar.tsx` の現状                     | `'use client'`。`usePathname()` で active 判定。`/login` の非表示ロジックは無い。テスト `nav-bar.test.tsx` は 9 ケース、`vi.mock('next/navigation')` で `usePathname` を差し替え済み                                                                                                        |
| 15  | `apps/web/src/lib/use-api-action.ts` の現状                           | `!response.ok` を一律 `API_FAILURE_MESSAGE` 扱い。401 の特別扱い無し。`'use client'`。`window` 系 API は未使用（新規で `window.location.assign` を使うため happy-dom でのスタブが必要）                                                                                                     |
| 16  | `apps/web/src/app/sw.ts` の現状                                       | Serwist。`shopping-list-detail-cache` と `shopping-lists-pages-cache` が `NetworkFirst`（`plugins` 未設定）。`stores-cache` は `StaleWhileRevalidate`。`/login` `/api/auth/*` は既存 matcher に該当しない                                                                                   |
| 17  | `apps/web/package.json` の現状                                        | `better-auth`/`@better-auth/cli`/`tsx` 無し。`scripts` に `auth:*` 系統無し。`db:generate`/`db:migrate` は `drizzle-kit generate`/`migrate` のまま（config 側の変更で足りる）                                                                                                               |
| 18  | `packages/infrastructure/package.json` の現状                         | `better-auth` 依存を**持たない**（Gate A (1) のとおり）。`drizzle-orm`/`@neondatabase/serverless`/`web-push`/`ws` のみ                                                                                                                                                                      |
| 19  | `apps/web/.env.example` の現状                                        | `DATABASE_URL`/`VAPID_*`/`CRON_SECRET`/`BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD`（6-7 行目）+ TZ コメント                                                                                                                                                                                     |
| 20  | `apps/web/playwright.config.ts` の現状                                | `BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD` から `httpCredentials` を組む分岐（16-24 行目）。削除対象                                                                                                                                                                                           |
| 21  | `.github/workflows/ci.yml` の migration 適用箇所                      | `e2e` ジョブの `Apply DB migrations (Neon)` ステップが `DATABASE_URL` secret ありのとき `pnpm --filter @cookpit/web db:migrate` を実行（214-220 行目）。PR の CI が本番 Neon に migration を適用する既存運用が本 feature でも成立する                                                       |
| 22  | `apps/web/tests/e2e/` の現状                                          | `recipe-crud.smoke.spec.ts` / `saturday-flow.spec.ts` の 2 本のみ。`E2E_AUTH_EMAIL`/`E2E_AUTH_PASSWORD` は CI に未設定のため新規 `auth-login.spec.ts` は CI では `test.skip` になる                                                                                                         |
| 23  | vitest の include パターン（apps/web）                                | node プロジェクト: `tests/**/*.node.test.ts` と `tests/server/**/*.test.ts`。dom プロジェクト: `tests/**/*.dom.test.ts` と `tests/**/*.test.tsx`。新規テストは必ずこのいずれかに一致させる                                                                                                  |
| 24  | `_utils` 配下の既存パターン                                           | `apps/web/src/app/_utils/category-color.ts`/`dashboard-view.ts` と対応するテスト `apps/web/tests/app/_utils/*.node.test.ts`。SW の純関数切り出し先として踏襲する                                                                                                                            |
| 25  | shadcn コンポーネントの既存資産                                       | `apps/web/src/components/ui/{button,input}.tsx` が既存。`LoginForm`/`ChangePasswordForm` はこれらを再利用する（新規 UI プリミティブは作らない）                                                                                                                                             |
| 26  | Server Component（`page.tsx`）への RTL テストの前例                   | リポジトリ全体で 0 件（`page.tsx` は薄いラッパーとして未テスト。`dashboard.tsx` 等の子コンポーネントのみテスト対象）。`/login`・`/more`・`/more/account` の `page.tsx` もこの慣習に従い RTL 対象外とする                                                                                    |
| 27  | `packages/infrastructure/tests/testing/create-test-db.ts`             | Repository テスト専用の手書き DDL（既存 9 テーブルのみ）。Better Auth テーブルは含めない（設計書のとおり。Repository は認証を知らない）                                                                                                                                                     |
| 28  | ドキュメント中の Basic 認証記述箇所                                   | `docs/01-overview.md:14,70`／`docs/02-tech-stack.md:12,76-84`／`docs/03-architecture.md:54,214-216,217-226`／`docs/05-roadmap.md:963,1126`（Phase 3 対象外候補「認証導入」の記述。設計書に明記は無いが要求元指示で対象に含める）／`docs/07-dev-rules.md` に該当節無し（確認済み・更新不要） |
| 29  | `apps/web/README.md`                                                  | `create-next-app` の既定ボイラープレートのまま。スクリプト使用法はここへ書かず、`setup-pglite-dev.mjs` に倣い各スクリプトのヘッダコメントに書く                                                                                                                                             |
| 30  | ADR-0003 の現状                                                       | 既に「Superseded by ADR-0021」+ 2026-09-16 追記あり。フォローアップ節が「Better Auth への移行は Phase 2 以降の選択肢として残る」と書いている。本 feature で実施されるため、同形式の追記を 1 段追加する                                                                                      |

## 新規作成・削除ファイル一覧（着手前に Orchestrator が一括承認）

CLAUDE.md「新規ファイルの作成・既存ファイルの削除は、必ず事前に確認を取る」に基づき、
実装着手前にまとめて確認を取る。削除ファイルは無い（Basic 認証コードは既存ファイル内の
書き換えで除去する）。

### 新規作成（24 ファイル + migration 自動生成 1 組）

| #   | ファイル                                                                            | Step |
| --- | ----------------------------------------------------------------------------------- | ---- |
| 1   | `apps/web/src/server/auth/create-auth.ts`                                           | 2    |
| 2   | `apps/web/src/server/auth/index.ts`                                                 | 2    |
| 3   | `apps/web/src/server/auth/cli.config.ts`                                            | 1    |
| 4   | `packages/infrastructure/src/db/auth-schema.ts`（CLI 生成）                         | 1    |
| 5   | `apps/web/src/db/migrations/0010_*.sql` + `meta/0010_snapshot.json`（自動生成）     | 1    |
| 6   | `apps/web/src/lib/auth-client.ts`                                                   | 4    |
| 7   | `apps/web/src/app/login/page.tsx`                                                   | 5    |
| 8   | `apps/web/src/app/login/_components/login-form.tsx`                                 | 5    |
| 9   | `apps/web/src/app/more/account/page.tsx`                                            | 5    |
| 10  | `apps/web/src/app/more/account/_components/change-password-form.tsx`                | 5    |
| 11  | `apps/web/src/app/more/account/_components/revoke-other-sessions-button.tsx`        | 5    |
| 12  | `apps/web/src/app/more/_components/logout-button.tsx`                               | 5    |
| 13  | `apps/web/src/app/_utils/sw-cache-plugins.ts`                                       | 6    |
| 14  | `apps/web/scripts/auth-create-user.ts`                                              | 7    |
| 15  | `apps/web/scripts/auth-set-password.ts`                                             | 7    |
| 16  | `apps/web/tests/server/auth/auth-route.test.ts`                                     | 2    |
| 17  | `apps/web/tests/app/login/_components/login-form.test.tsx`                          | 5    |
| 18  | `apps/web/tests/app/more/_components/logout-button.test.tsx`                        | 5    |
| 19  | `apps/web/tests/app/more/account/_components/change-password-form.test.tsx`         | 5    |
| 20  | `apps/web/tests/app/more/account/_components/revoke-other-sessions-button.test.tsx` | 5    |
| 21  | `apps/web/tests/app/_utils/sw-cache-plugins.node.test.ts`                           | 6    |
| 22  | `apps/web/tests/scripts/auth-scripts.node.test.ts`                                  | 7    |
| 23  | `apps/web/tests/e2e/auth-login.spec.ts`                                             | 8    |
| 24  | （予備。実際に必要になった場合のみ）`apps/web/scripts/_lib/auth-script-env.ts`      | 7    |

24 番は「2 スクリプトで TTY パスワード読み取りロジックが重複し、共通化した方が明らかに
安全（コピペミス防止）と implementer が判断した場合のみ」作成する任意ファイル。作らずに
2 ファイルへ直接書いてもよい。作る場合は着手前に Orchestrator へ一報する（CLAUDE.md の
新規ファイル確認原則）。

### 削除

無し。

## 変更対象ファイル

| #   | ファイル                                                      | なぜ変えるか                                                                                                             |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | `apps/web/src/proxy.ts`                                       | Basic 認証 → セッション検証へ全置換（D-3）                                                                               |
| 2   | `apps/web/tests/proxy.node.test.ts`                           | 全置換（新しい検証ロジックのテスト）                                                                                     |
| 3   | `apps/web/src/server/app.ts`                                  | `/auth/*` を Hono にマウント（D-2）                                                                                      |
| 4   | `packages/infrastructure/src/index.ts`                        | `authSchema` の namespace export 追加（D-6）                                                                             |
| 5   | `apps/web/drizzle.config.ts`                                  | `schema` を配列化（D-6）                                                                                                 |
| 6   | `apps/web/src/db/migrations/meta/_journal.json`               | `db:generate` により自動更新（0010 追記）                                                                                |
| 7   | `apps/web/src/app/more/page.tsx`                              | 表示名の取得・表示（D-16）                                                                                               |
| 8   | `apps/web/src/app/more/_components/more-menu.tsx`             | 「アカウント」リンク + `LogoutButton` 追加（D-7）                                                                        |
| 9   | `apps/web/tests/app/more/_components/more-menu.test.tsx`      | MM-03 を 3 件に更新・アカウントリンク/ログアウトボタンのケース追加                                                       |
| 10  | `apps/web/src/lib/use-api-action.ts`                          | 401 検知で `/login?next=` へ遷移（D-8）                                                                                  |
| 11  | `apps/web/tests/lib/use-api-action.test.tsx`                  | 401 遷移のケース追加                                                                                                     |
| 12  | `apps/web/src/app/_components/nav-bar.tsx`                    | `/login` で非表示（D-7）                                                                                                 |
| 13  | `apps/web/tests/app/_components/nav-bar.test.tsx`             | `/login` 非表示のケース追加                                                                                              |
| 14  | `apps/web/src/app/sw.ts`                                      | `cacheWillUpdate` を 2 つの `NetworkFirst` に適用（D-9）                                                                 |
| 15  | `apps/web/package.json`                                       | `better-auth` 追加、`tsx`（要否は Step 0 結果次第）、`auth:*` scripts 追加                                               |
| 16  | `apps/web/.env.example`                                       | `BASIC_AUTH_*` 削除、`BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` 追加                                                         |
| 17  | `apps/web/playwright.config.ts`                               | `httpCredentials` 関連コード削除（F-14）                                                                                 |
| 18  | `apps/web/e2e/README.md`                                      | ログイン E2E の実行条件を追記                                                                                            |
| 19  | `docs/decisions/ADR-0021-basic-auth-for-public-repository.md` | Status を `Superseded by ADR-0022` に更新                                                                                |
| 20  | `docs/decisions/ADR-0003-no-auth-in-mvp1.md`                  | フォローアップ節に「Better Auth 導入完了」の追記                                                                         |
| 21  | `docs/01-overview.md`                                         | Basic 認証記述を Better Auth に更新                                                                                      |
| 22  | `docs/02-tech-stack.md`                                       | 認証行・認証節を更新                                                                                                     |
| 23  | `docs/03-architecture.md`                                     | ツリー・使い分けの方針・パッケージ公開境界表を更新                                                                       |
| 24  | `docs/05-roadmap.md`                                          | 「認証（Better Auth）」を対象外候補から実施済みへ整理（要求元指示。設計書に明記は無いが docs-only で低リスクのため実施） |
| 25  | `pnpm-lock.yaml`                                              | 依存追加に伴う自動更新                                                                                                   |

変更しない（確認済み）: `packages/domain`、`packages/application`、`packages/api-contract`、
`packages/infrastructure/src/db/schema.ts`、`packages/infrastructure/tests/testing/create-test-db.ts`、
`apps/web/src/app/api/[[...route]]/route.ts`、`apps/web/src/server/repositories.ts`、
`docs/04-domain-model.md`（Domain/Application 差分ゼロのため整合確認のみで更新不要）、
`docs/07-dev-rules.md`（該当節無しを確認済み）。

---

## Step 0: 依存追加 + スパイク検証（ブロッキング。最初に完了させる）

**依存**: なし。**このステップの結果が Step 1 以降の実装内容を分岐させる。** 全項目を埋めずに
Step 1 へ進まない。

### 0-1. 依存追加（検証用に先行導入）

```bash
pnpm --filter @cookpit/web add better-auth@^1.7.5
pnpm --filter @cookpit/web add -D @better-auth/cli@1.4.21
```

- `@better-auth/cli` は `pnpm dlx` 都度実行ではなく **devDependency として固定**する
  （バージョンドリフトで生成物が変わるのを避ける。要件書の前提「`@better-auth/cli@1.4.21`」を
  そのまま固定する）。設計書の疑似コマンドは `pnpm dlx` 表記だが、実装は
  `pnpm --filter @cookpit/web exec @better-auth/cli generate ...` に置き換える
  （設計の疑似コードからの軽微な実装是正であり、設計判断の変更ではない）。
- `tsx` の追加可否は 0-9 の結果を待つ（結論は事実上確定済み。0-9 参照）。
- `pnpm install` 実行後、`zod` の peer 警告有無を確認する（0-8）。
- 依存追加のみでこの時点ではコード変更をコミットしない（Step 0 は検証。最終的な
  `package.json` の確定形は Step 1/7 でまとめて反映する）。

### 0-2. `drizzleAdapter` は neon-http（トランザクション不可）で動くか

- **確認方法**: `node_modules/better-auth/dist/adapters/drizzle/` のソースを読み、
  (a) `db.transaction(...)` を呼ぶ経路があるか、(b) アダプタ生成オプションに
  `transaction: false` 相当のフラグがあるかを確認する。次に `getDb()`（neon-http）を渡した
  `createAuth()` インスタンスで `auth.api.signUpEmail` → `auth.api.signInEmail` を
  実行し、例外の有無を見る（Neon dev 接続が無い場合は 0-4 の PGlite 検証と合わせて行う）。
- **NG だった場合の分岐**（設計書 D-18 の許容フォールバック。優先順）:
  1. アダプタに無効化オプションがあれば `transaction: false` を渡す。
  2. 無ければ、認証専用に `packages/infrastructure` の `createTxConnection`
     （WebSocket。ADR-0020 の「1 リクエスト 1 接続・`finally` で閉じる」規約）で
     Proxy 用途にも使えるよう `createAuth()` の `db` を差し替える設計に変更する。
     この場合、Proxy がリクエストごとに WebSocket 接続を張って閉じることになり
     §性能の推定（neon-http 前提）が崩れるため、実装後に §性能の数値を実測し直す
     （ドキュメント更新対象に追記）。
  3. どちらも不可なら Orchestrator に差し戻す（Gate A 決定 (2) の前提が崩れるため）。

### 0-3. `getDb()`（app schema のみバインド）で `authSchema` を扱えるか（前提確認 7 由来の追加検証）

設計書に明記は無いが、本計画作成時のコード調査で見つけた実装リスク。

- **確認方法**: better-auth のドリズルアダプタが `db.query.*`（リレーショナル API。
  `drizzle(client, { schema })` の `schema` に事前バインドされたテーブルしか使えない）を
  使うか、`db.select()/insert()/update()/delete()`（テーブルオブジェクトを都度渡す、
  スキーマ非依存）のみを使うかをソースで確認する。
- **NG 分岐**（`db.query.*` に依存していた場合）: `create-auth.ts` に渡す `db` を
  `getDb()` そのものではなく、`authSchema` を含めて生成した専用インスタンスにする。
  置き場所は既存の `packages/infrastructure/src/db/client.ts` 内に
  `createAuthDb(databaseUrl)`（`drizzle(neon(databaseUrl), { schema: authSchema })`）を
  追加する案が最小変更（Gate A (1) の置き場所決定には抵触しない — スキーマ定義は
  引き続き `packages/infrastructure` 内に閉じるため）。この対応が要る場合は
  「ファイルごとの変更内容」Step 1 に追記して実施する。

### 0-4. `drizzle-orm/pglite` 上でアダプタが動くか（dev / テスト経路）

- **確認方法**: 一時ディレクトリに PGlite を作り、`auth-schema.ts`（0-6 で生成済みのもの）の
  DDL 相当を適用した上で `createAuth({ db: drizzle(pglite, { schema: authSchema }) })` を
  組み、`signUpEmail` → `signInEmail` を実行する。
- **NG だった場合の分岐**: 設計書「DB 設計 > PGlite での扱い」のとおり、
  `apps/web/tests/server/auth/auth-route.test.ts` の PGlite 実結合サブテストを
  `it.skip`（理由コメント付き）に格下げし、Neon 上での手動確認に置き換える。
  Step 2 の完了条件からこのサブテストを除外する。

### 0-5. `rateLimit.storage: 'database'` と `rate_limits` テーブルの CLI 生成

- **確認方法**: `cli.config.ts`（0-7 で作成）の `createAuth()` に
  `rateLimit: { enabled: true, storage: 'database' }` を含めた状態で CLI generate を実行し、
  出力に `rate_limits`（または同等名）テーブルが含まれるか確認する。含まれていれば
  Neon（または PGlite）上で誤パスワードのサインインを連続実行し 429 が返るか、
  `rate_limits` 行が増えるかを確認する（本格的な負荷試験は §性能のシナリオ骨子で別途行う）。
- **NG だった場合の分岐**（設計書 D-5 の許容フォールバック）: `rateLimitStorage: 'memory'` を
  採用する。`rate_limits` テーブルを migration に含めない（CLI 出力にテーブルが無ければ
  自動的にそうなる）。ADR-0022 の「残るリスク」に記載済みの契機であり、ADR 本文の追加修正は
  不要（既に記載されている想定内の分岐）。ただし本計画の Step 1・Step 2 の完了条件から
  `rate_limits` 関連の記述を外す。

### 0-6. CLI 出力のテーブル名・列名・casing・インデックス

- **確認方法**: `pnpm --filter @cookpit/web exec @better-auth/cli generate --config
src/server/auth/cli.config.ts --output ../../packages/infrastructure/src/db/auth-schema.ts`
  を実行し、生成された `auth-schema.ts` を目視する。設計書「DB 設計」の想定列
  （`users`/`sessions`/`accounts`/`verifications`、0-5 の結果次第で `rate_limits`）と
  照合する。`usePlural: true` がテーブル名を複数形にしているか確認する。
- **確定した内容を Step 1 の完了条件に反映する。** 契約書
  （`docs/designs/better-auth-login.contract.md`）が確定済みならそれとも突き合わせ、
  食い違えば Orchestrator 経由で contract-designer に確認する（本計画では独断で契約を
  上書きしない）。

### 0-7. CLI の `--config` / `--output` フラグ

- **確認方法**: `pnpm --filter @cookpit/web exec @better-auth/cli --help` と
  `... generate --help` で正確なフラグ名を確認してから 0-6 を実行する。
- **NG 分岐**: フラグ名が設計書の疑似コマンドと異なれば、実際のフラグ名に置き換えて
  Step 1 に反映する（実装詳細の是正であり設計判断の変更ではない）。

### 0-8. zod v4 との共存

- **確認方法**: `pnpm install` 実行時の `zod` peer dependency 警告の有無を確認し、
  `pnpm --filter @cookpit/web type-check` を実行する。
- **NG 分岐**: 型エラー・解決不能な警告が出た場合は独断で `pnpm.overrides` を追加せず、
  Orchestrator に相談する（`packages/api-contract` が使う `zod@^4.4.3` に影響が及ぶ変更は
  スコープ外リファクタリングになりうるため）。

### 0-9. `tsx` devDependency の要否

- 設計書の「実装上の罠」節で既に結論が出ている（`.nvmrc` が 20 のため Node 22.18+ の型注釈
  除去は採れない）。**確認方法**: `pnpm --filter @cookpit/web add -D tsx` の上で
  `pnpm --filter @cookpit/web exec tsx --version` が動くことのみ確認する（設計判断の
  再検証ではなく設置確認）。

### 0-10. `session.freshAge` の影響（罠 8）

- **確認方法**: 0-4 または 0-2 のいずれかで構築した `createAuth()` インスタンスに対し、
  サインイン直後（fresh なセッション）に `auth.api.changePassword` /
  `auth.api.revokeOtherSessions` 相当を呼び、拒否されないか確認する。
  型定義（`node_modules/better-auth/dist/**/*.d.ts`）で `freshAge` の既定値も確認する。
- **NG だった場合の分岐**（設計書の許容フォールバック）: `session.freshAge: 0` を
  `createAuth()` のオプションに追加して無効化する（「2 名利用で現在のパスワード確認が
  あれば十分」という設計書の理由をそのまま採用）。

### 0-11. `getSession({ returnHeaders: true })` の戻り形と `getSetCookie()`

- **確認方法**: 型定義で `getSession` のオーバーロード（`returnHeaders` 指定時に
  `{ response, headers }` を返すか）を確認する。`headers` が標準 `Headers` インスタンスで
  `getSetCookie()`（Node 18+ 標準 API）を持つかも確認する。
- **NG だった場合の分岐**: 型が異なれば `proxy.ts` の疑似コードをその形に合わせて修正する
  （実装詳細の是正）。`Set-Cookie` を転送できない場合は「実装上の罠 1」のとおり
  Cookie キャッシュが機能せず毎回 DB 参照になる旨をリスクに記録し、性能への影響を
  §性能の実測で確認する。

### 0-12. Proxy バンドルでの top-level await（前提確認 12 の罠 10 検証）

Step 3（Proxy 全置換）完了後に `pnpm --filter @cookpit/web build` で確認する
（依存関係上、このサブ項目だけ Step 3 の後に実施する。0-1〜0-11 は Step 1 着手前に完了させる）。

- **NG だった場合の分岐**: `apps/web/src/db/client.ts` の
  `if (databaseUrl.startsWith('pglite:')) { ... await import('./pglite-client') ... }` を
  関数内 `await import`（トップレベルではなく `getDb()` 呼び出し時に動的 import する形）に
  変更する。dev 経路のみに影響し、Neon 経路（本番）には影響しない変更である旨を
  完了条件に明記する。

### Step 0 完了条件

- 0-1〜0-11 の全項目について、確認結果（OK / NG→採用したフォールバック）を
  実装時のコミットメッセージまたは PR 説明に記録する。
- 0-2・0-5 で「両方不可」（Orchestrator 差し戻し）に該当しないこと。該当した場合は
  Step 1 へ進まず Orchestrator へ報告する。
- 0-6 の確定結果（テーブル名・列名・`rate_limits` の有無）を Step 1 の実装内容に反映する。

---

## Step 1: DB スキーマ生成・マイグレーション

**依存**: Step 0（0-1〜0-11 完了。特に 0-2/0-3/0-5/0-6/0-7 の結果）

### 対象ファイル

| 種別 | ファイル                                                            | 内容                                                   |
| ---- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| 新規 | `apps/web/src/server/auth/cli.config.ts`                            | CLI generate 専用の `createAuth()` 呼び出しファイル    |
| 新規 | `packages/infrastructure/src/db/auth-schema.ts`                     | CLI 生成物（手書きしない）                             |
| 変更 | `packages/infrastructure/src/index.ts`                              | `export * as authSchema from './db/auth-schema';` 追加 |
| 変更 | `apps/web/drizzle.config.ts`                                        | `schema` を配列化                                      |
| 新規 | `apps/web/src/db/migrations/0010_*.sql` + `meta/0010_snapshot.json` | `drizzle-kit generate` 自動生成                        |
| 変更 | `apps/web/src/db/migrations/meta/_journal.json`                     | 自動更新                                               |

### 1-1. `cli.config.ts`

- `server-only` を import しない（CLI は Next.js ランタイム外で実行されるため。罠 4）。
- `.env.local` の `DATABASE_URL` を読み込む点は `drizzle.config.ts` と同じ作法
  （`existsSync` → `process.loadEnvFile`）に揃える。
- `createAuth()`（Step 2 で作る `create-auth.ts` の純粋ファクトリ）に、0-3 の結果に応じて
  `getDb()` 相当（app schema のみ）または `createAuthDb()`（authSchema バインド版。0-3 で
  必要と判明した場合のみ）を渡す。`secret`/`baseURL` は CLI generate 時は使われないため
  ダミー値でよい。`rateLimitStorage` は 0-5 の結果を反映する。
- **完了条件**: `pnpm --filter @cookpit/web exec @better-auth/cli generate --config
src/server/auth/cli.config.ts --output ../../packages/infrastructure/src/db/auth-schema.ts`
  （0-7 で確定した正確なフラグ名に置き換える）が例外なく完走する。

### 1-2. `auth-schema.ts`（CLI 生成。手動編集しない）

- 生成後、0-6 の確認結果どおりのテーブル・列があることを目視する。
- 既存 `packages/infrastructure/src/db/schema.ts` の内容には一切触れていないことを
  `git diff` で確認する。

### 1-3. `packages/infrastructure/src/index.ts` 追記

```ts
export * as authSchema from './db/auth-schema';
```

既存の `export * as schema from './db/schema';`（4 行下）と同じ作法。挿入位置は
`schema` の直後を推奨（並び順の一貫性）。

### 1-4. `apps/web/drizzle.config.ts`

```ts
export default {
  schema: [
    '../../packages/infrastructure/src/db/schema.ts',
    '../../packages/infrastructure/src/db/auth-schema.ts',
  ],
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
```

`Config.schema` が `string | string[]` を受け付けることを `drizzle-kit` の型定義
（`node_modules/drizzle-kit/index.d.ts` 等）で確認してから変更する。

### 1-5. マイグレーション生成・確認

```bash
pnpm --filter @cookpit/web db:generate
```

- 生成先: `apps/web/src/db/migrations/0010_*.sql`（現状最大 `0009` の次）。
- **完了条件（必須の目視確認）**: 生成 SQL に既存 9 テーブルへの `ALTER`/`DROP` が
  **一切含まれない**こと（`CREATE TABLE` のみ）。`meta/_journal.json` に `idx: 10` の
  エントリが追記され、既存 `idx 0`〜`9` は変更されないこと。
- 生成ファイルは手動編集せずそのままコミットする。

### 1-6. dev PGlite への適用確認

`scripts/setup-pglite-dev.mjs` は `meta/_journal.json` の未適用 `tag` を自動適用するため
追加のコード変更は不要。確認のみ:

```bash
pnpm --filter @cookpit/web db:seed:pglite
```

- **完了条件**: `migration applied: 0010_...` のログが出て正常終了すること。
  （0-4 で PGlite アダプタ自体が動かないと判明していても、DDL の適用自体は
  drizzle-kit/PGlite の組み合わせとして別物のため、ここは独立して確認する。）

### Step 1 完了条件

```bash
pnpm --filter @cookpit/web type-check
pnpm lint
```

- `packages/infrastructure/src/db/schema.ts` に差分が無いこと。
- `packages/infrastructure` が `better-auth` に依存していないこと（`package.json` 差分無し。
  Gate A (1) の確認）。

---

## Step 2: サーバー実装（`createAuth` ファクトリ・`getAuth`・Hono マウント）

**依存**: Step 1（`authSchema` が確定済み）、Step 0（0-2/0-3/0-10/0-11 の分岐結果）

### 対象ファイル

| 種別 | ファイル                                        | 内容                                                                        |
| ---- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| 新規 | `apps/web/src/server/auth/create-auth.ts`       | `createAuth(options)` 純粋ファクトリ                                        |
| 新規 | `apps/web/src/server/auth/index.ts`             | `import 'server-only'`。`getAuth()` 遅延シングルトン + `isAuthConfigured()` |
| 変更 | `apps/web/src/server/app.ts`                    | `/auth/*` を Hono にマウント                                                |
| 新規 | `apps/web/tests/server/auth/auth-route.test.ts` | マウント確認 + （0-4 が OK の場合のみ）PGlite 実結合テスト                  |

### 2-1. `create-auth.ts`

設計書「バックエンド設計 > `createAuth()`」の概念コードを実装のベースにする。以下を
Step 0 の結果で確定させる:

- `database: drizzleAdapter(o.db, { provider: 'pg', schema: authSchema, usePlural: true })`。
  0-2 が「アダプタの `transaction` 無効化オプションあり」なら該当オプションを追加する。
- `rateLimit: { enabled: true, storage: o.rateLimitStorage }`（0-5 の結果を型に反映。
  `rate_limits` テーブルが無い場合は `storage` の選択肢を `'memory'` 固定にしてもよい）。
  閾値は Better Auth 既定（全体 100 req/60 s、`/sign-in/email` 3 req/10 s）を採用し
  `customRules` は設定しない（設計書 D-5・契約書 §5）。
- `session.freshAge`: 0-10 が NG なら `freshAge: 0` を追加する。
- `emailAndPassword`: 設計書どおり `disableSignUp: !o.allowSignUp`・
  `minPasswordLength: 12`・`maxPasswordLength: 128`・`revokeSessionsOnPasswordReset: true`・
  `requireEmailVerification: false`・`autoSignIn: false`（U-3/U-4/B-04 の実装）。
- `advanced: { cookiePrefix: 'cookpit' }`。この値は `proxy.ts`（Step 3）の
  `getSessionCookie(request, { cookiePrefix: 'cookpit' })` と**必ず一致**させる
  （罠 2。ずれると全員締め出し）。
- `server-only` を import しない（CLI からも使われるため。1-1 と同一ファイルを共有）。
- JSDoc: 公開 API（`createAuth`・`CreateAuthOptions`）に、型に表せない契約
  （`secret`/`baseURL` に `null` を渡した場合の挙動、`allowSignUp` はスクリプト専用等）を書く
  （コーディング規約）。

### 2-2. `index.ts`

設計書の概念コードをベースに実装する:

```ts
import 'server-only';
import { getDb } from '@/db/client';
import { createAuth, type Auth } from './create-auth';

export function isAuthConfigured(): boolean {
  const s = process.env.BETTER_AUTH_SECRET;
  return s !== undefined && s !== '';
}
// vercelOrigins() / let instance / getAuth() は設計書のとおり
```

- 0-3 が NG（`authSchema` を含む専用 db が必要）だった場合、`getDb()` の代わりに
  `packages/infrastructure` の新設関数（例 `createAuthDb`）を呼ぶ形に差し替える。
- `getAuth()` は遅延生成（`instance ??= createAuth(...)`）。`isAuthConfigured()` が
  `false` の経路では一度も呼ばれないことを Step 3 のテストで確認する。

### 2-3. `app.ts` へのマウント

```ts
import { getAuth } from './auth';
// ...
export const app = new Hono().basePath('/api');

app.on(['GET', 'POST'], '/auth/*', (c) => getAuth().handler(c.req.raw));

export const routes = app
  .route('/health', healthRoute)
  // ...既存 8 行...
  .route('/cron', cronRoute);
```

- `app.on(...)` は `routes` の代入式（チェーン）に含めない。`AppType`（RPC クライアント型）に
  Better Auth のルート型が混入しないことを型検査で確認する。
- `app.onError` は変更しない（Better Auth の `handler` は例外を投げず Response を返すため）。

### 追加テスト（`apps/web/tests/server/auth/auth-route.test.ts`）

1. `@/server/auth` を `vi.mock` し、`getAuth()` が返すダミーオブジェクトの `handler` が
   `GET /api/auth/ok` で呼ばれることを `app.request()` で確認する（マウント配線の確認。
   `@/db/client` の `vi.mock` パターンは既存 `cron.test.ts` に揃える）。
2. （0-4 が OK の場合のみ）PGlite 実結合: 一時 PGlite に migration を適用し、
   `allowSignUp: true` の `createAuth()` インスタンスで `signUpEmail` → 別途
   `allowSignUp: false` のインスタンスで `sign-up/email` が 4xx →
   最初のインスタンスで `signInEmail` が 200 + `Set-Cookie` を確認する。
   0-4 が NG の場合はこのサブテストを `it.skip('PGlite でアダプタが動かないため手動確認に
格下げ。理由: 設計書 §DB設計「PGlite での扱い」')` にする。

### Step 2 完了条件

```bash
pnpm --filter @cookpit/web type-check
pnpm --filter @cookpit/web lint
pnpm --filter @cookpit/web test -- auth
```

- `apps/web/tests/server/routes/*.test.ts`（既存 13 ファイル）が無変更のまま green
  （`app.ts` への import 追加で既存ルートテストが壊れていないことの回帰確認。罠 5）。
- `AppType`（`app.ts` の `export type AppType = typeof routes;`）に `/auth/*` の型が
  含まれていないこと（`routes` の型定義に `auth` が出現しないことを型検査・目視で確認）。

---

## Step 3: Proxy 全置換

**依存**: Step 2（`getAuth`/`isAuthConfigured` が使える）

### 対象ファイル

| 種別 | ファイル                            | 内容                                |
| ---- | ----------------------------------- | ----------------------------------- |
| 変更 | `apps/web/src/proxy.ts`             | Basic 認証 → セッション検証へ全置換 |
| 変更 | `apps/web/tests/proxy.node.test.ts` | 全置換                              |

### 3-1. `proxy.ts`

設計書「バックエンド設計 > `proxy.ts`」の概念コードを実装のベースにする。確定事項:

- `decodeBasicCredentials`/`sha256`/`timingSafeStringEqual`/`REALM_HEADER` は**全削除**
  （F-14）。
- `isApiPath`/`buildNextParam`/`proxy`/`config` を新規実装する。
- `buildNextParam`: `url.searchParams.delete('_rsc')`（罠 3） → `pathname + search` を
  `NEXT_MAX_LENGTH = 2000` で切って `/` にフォールバック（B-02）。
- `getSessionCookie(request, { cookiePrefix: 'cookpit' })` が `null` のときだけ
  `getAuth()` を呼ばずに早期 302/401 する（DB も HMAC も不要な最適化。設計書のとおり）。
- `getAuth().api.getSession({ headers: request.headers, returnHeaders: true })` の
  戻り形は 0-11 の確認結果に従う。
- `session === null` の分岐で `isApiPath(pathname)` により 401 JSON と 302 を出し分ける
  （F-02）。
- `Set-Cookie` の転送（`for (const cookie of setCookies) response.headers.append('set-cookie',
cookie);`）を忘れない（罠 1。テストで必ず確認する）。
- fail-closed 503 の分岐（`isAuthConfigured()` が `false` かつ
  `process.env.NODE_ENV === 'production'`）は既存 Basic 認証の規約をそのまま流用する
  （`console.error` 1 回、資格情報を出さない、`Cache-Control: no-store`）。
- `matcher` に `api/auth/` を追加する:
  ```ts
  export const config = {
    matcher: [
      '/((?!(?:favicon\\.ico|manifest\\.webmanifest|sw\\.js)$|_next/static/|icons/|api/cron/|api/auth/).*)',
    ],
  };
  ```
- `/login` は matcher から除外しない（設計書のとおり。ログイン済みなら `/` へ 302 するため）。
- Proxy が生成する応答（503 / 302 → `/login` / 302 → `/` / 401）は**すべて** `Cache-Control: no-store` を付ける（契約書 §11-4。`/login` × 有効セッションの 302 も含む）。

### 3-2. `apps/web/tests/proxy.node.test.ts`（全置換）

`@/server/auth`（`getAuth`/`isAuthConfigured`）と `better-auth/cookies`
（`getSessionCookie`）を `vi.mock` する。既存の env 保存・復元パターン
（`beforeEach`/`afterEach` + `vi.stubEnv`/`vi.unstubAllEnvs`）を踏襲する。

草案ケース一覧（test-designer 確定後にすり合わせ）:

1. Cookie 無し・保護パス（非 API）→ 302、`Location` が `/login?next=<pathname+search>`。
2. Cookie 無し・`?_rsc=abc` 付き → `next` から `_rsc` が除去されている。
3. Cookie 無し・pathname `/` → `next=%2F`。
4. Cookie 無し・`/api/pantry` → 401 JSON `{ "error": "Unauthorized" }` +
   `Cache-Control: no-store`（リダイレクトしない）。
5. Cookie あり・`getSession` が有効セッションを返す → 200 相当（`NextResponse.next()`）+
   `Set-Cookie` が応答へ転送されている（罠 1 の回帰防止）。
6. Cookie あり・`getSession` が `null` を返す（署名不一致/期限切れ）→ 302（非 API）/
   401（API）。
7. `/login` + 有効セッション → 302 `/` + `Cache-Control: no-store`（契約書 §11-4）。
8. `/login` + セッション無し → 通過（200 相当）。`getSessionCookie` が null を返すケースと
   `getSession` が null を返すケースの両方。
9. secret 未設定 × `NODE_ENV=production` → 503、本文なし、`Cache-Control: no-store`、
   `console.error` 1 回、`WWW-Authenticate` 無し（値のログ出力が無いことも確認）。
10. secret 未設定 × `development`/`test` → 通過（`getAuth()` が呼ばれない = モックの
    呼び出し回数 0 で確認）。
11. `getSession` が例外を投げる → 例外が伝播する（吸収してすり抜けさせない。E-09）。
12. `next` の長さが 2000 文字超 → `/` にフォールバック（B-02）。
13. matcher 構造テスト（既存 MW-M01〜M12 パターンを踏襲）: `api/auth/sign-in/email` が
    除外される、`api/authx` は保護対象のまま（前方一致境界の回帰防止）、`login` 自体は
    保護対象（matcher にマッチする＝Proxy が実行される）。

### Step 3 完了条件

```bash
pnpm --filter @cookpit/web type-check
pnpm --filter @cookpit/web lint
pnpm --filter @cookpit/web test -- proxy
pnpm --filter @cookpit/web build
```

- `pnpm build` の成功をもって 0-12（Proxy バンドルの TLA）を確認する。失敗した場合は
  0-12 のフォールバック（`db/client.ts` の動的 import 化）を適用し再ビルドする。
- `apps/web/src/proxy.ts` に Basic 認証由来の識別子（`decodeBasicCredentials` 等）が
  一切残っていないこと（`grep -n "Basic" apps/web/src/proxy.ts` で確認）。

---

## Step 4: クライアントライブラリ・401 回復

**依存**: Step 2（`/api/auth/*` が疎通する。ただし本 Step のコード自体は型のみ参照するため
Step 2 完了前でも並行して書き始められる）

### 対象ファイル

| 種別 | ファイル                                     | 内容                 |
| ---- | -------------------------------------------- | -------------------- |
| 新規 | `apps/web/src/lib/auth-client.ts`            | `createAuthClient`   |
| 変更 | `apps/web/src/lib/use-api-action.ts`         | 401 → `/login?next=` |
| 変更 | `apps/web/tests/lib/use-api-action.test.tsx` | 401 ケース追加       |

### 4-1. `auth-client.ts`

```ts
import { createAuthClient } from 'better-auth/react';
export const authClient = createAuthClient({ basePath: '/api/auth' });
```

`useSession()` は使わない（設計書のとおり。マウント毎の往復を避ける）。

### 4-2. `use-api-action.ts`

`run()` 内、`!response.ok` の直後に `response.status === 401` の分岐を追加する:

```ts
if (!response.ok) {
  if (response.status === 401) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.assign(`/login?next=${next}`);
    return;
  }
  if (!silent) {
    setErrorMessage(resolveFailureMessage(options.failureMessage, response.status));
  }
  return;
}
```

- `silent: true` の呼び出しでも 401 では遷移する（設計書のとおり。セッション切れは
  ユーザーに見せるべき状態のため、`silent` の意味を「エラーバナーを出さない」に限定し
  遷移は妨げない）。
- JSDoc の `RunOptionsBase.silent` の説明にこの例外を追記する（型に表せない契約の追加）。

### 追加テスト（`use-api-action.test.tsx`）

- 401 応答で `window.location.assign` が `/login?next=<encodeURIComponent(pathname+search)>`
  で呼ばれる。
- 401 応答では `errorMessage` が更新されない（null のまま）。
- `silent: true` でも 401 では遷移する。
- `window.location` は `vi.stubGlobal('location', { pathname: '/pantry', search: '',
assign: vi.fn() })` 相当で happy-dom 上にスタブする（happy-dom は `location.assign` を
  ナビゲーションとして解釈しようとするため、素の `window.location.assign` を直接呼ぶと
  jsdom/happy-dom で "Not implemented" エラーになりうる。事前に `vi.stubGlobal` で
  差し替える）。

### Step 4 完了条件

```bash
pnpm --filter @cookpit/web type-check
pnpm --filter @cookpit/web lint
pnpm --filter @cookpit/web test -- use-api-action
```

---

## Step 5: 画面（`/login`・`/more`・`/more/account`・NavBar）

**依存**: Step 4（`authClient`・401 回復）。Step 2（`/api/auth/*` 疎通）は実機確認に必要だが、
RTL テストは `authClient` を `vi.mock` するため Step 2 完了前でも着手可能。

### 5-1. `/login`

| 種別 | ファイル                                                   |
| ---- | ---------------------------------------------------------- |
| 新規 | `apps/web/src/app/login/page.tsx`                          |
| 新規 | `apps/web/src/app/login/_components/login-form.tsx`        |
| 新規 | `apps/web/tests/app/login/_components/login-form.test.tsx` |
| 変更 | `apps/web/src/app/_components/nav-bar.tsx`                 |
| 変更 | `apps/web/tests/app/_components/nav-bar.test.tsx`          |

`page.tsx`: 設計書のとおり薄い Server Component。`searchParams.next` を読み `LoginForm` に
渡す。`metadata.title = 'ログイン | Cookpit'`。RTL テスト対象外（前提確認 26）。

`login-form.tsx`（`'use client'`）:

- `Input`（`type="email"`, `autoComplete="username"`）/ `Input`（`type="password"`,
  `autoComplete="current-password"`）/ `Button`（`apps/web/src/components/ui/` の既存
  プリミティブを使う。前提確認 25）。
- `authClient.signIn.email({ email, password })` を呼ぶ。成功時
  `window.location.assign(safeNext(next))`。
- 失敗文言: 401/403 → 「メールアドレスまたはパスワードが違います。」（E-01 区別しない）、
  429 → 「試行回数が多すぎます。しばらく待ってから再度お試しください。」、通信例外 →
  既存 `NETWORK_ERROR_MESSAGE`（`apps/web/src/lib/use-api-action.ts` から import して
  再利用。文言の重複定義をしない）。
- `safeNext(value: string | null): string`: `/^\/(?![\/\\])/` に一致し 2000 文字以下なら
  採用、それ以外は `/`（B-02。Proxy の `buildNextParam` とロジックは同型だが、
  クライアント側は `URLSearchParams` から読んだ生文字列を検査する点が異なるため
  別実装でよい。共通化はスコープ外）。
- 第二段の拡張領域（「別の方法でログイン」）は空の `<div>` 等のプレースホルダで構わない。
  第一段では何も描画しない。

`nav-bar.tsx`: `usePathname() === '/login'` なら `null` を返す（早期 return）。

### 追加テスト

`login-form.test.tsx`（`authClient` を `vi.mock`）:

- 送信で `authClient.signIn.email` が `{ email, password }` で呼ばれる。
- 成功時 `window.location.assign` が `safeNext(next)` の結果で呼ばれる。
- 401/403 → 統一エラー文言。429 → 試行過多文言。通信例外（`signIn.email` が reject）→
  `NETWORK_ERROR_MESSAGE`。
- `next` の安全化 5 パターン: `/pantry`（採用）、`https://evil.com`（`/` にフォールバック）、
  `//evil`（フォールバック）、`/\evil`（フォールバック）、2001 文字の `/a...a`
  （フォールバック）。
- 送信中（pending）はボタンが無効化される。

`nav-bar.test.tsx` 追記:

- `/login` で `NavBar` が何も描画しない（`container.firstChild` が `null`、または
  `queryByRole('navigation')` が `null`）。

### 5-2. `/more`（表示名 + アカウントリンク + ログアウト）

| 種別 | ファイル                                                     |
| ---- | ------------------------------------------------------------ |
| 変更 | `apps/web/src/app/more/page.tsx`                             |
| 変更 | `apps/web/src/app/more/_components/more-menu.tsx`            |
| 新規 | `apps/web/src/app/more/_components/logout-button.tsx`        |
| 新規 | `apps/web/tests/app/more/_components/logout-button.test.tsx` |
| 変更 | `apps/web/tests/app/more/_components/more-menu.test.tsx`     |

`page.tsx`: `async function MorePage()` にし、
`await getAuth().api.getSession({ headers: await headers() })` で `session` を取得。
`session?.user.name` があれば見出し下に「`<name>` でログイン中」を表示、無ければ何も
表示しない（dev のスキップ経路対応。D-16）。`next/headers` の `headers()` は Next 16 で
Promise を返す（要 `await`。前提確認の新規事項、本リポジトリに前例無しのため明記）。

`more-menu.tsx`: `MORE_LINKS` に `{ href: '/more/account', label: 'アカウント', Icon:
UserRound（lucide-react 等の既存導入アイコンセットから選定） }` を追加（3 件）。
`<nav>` の下に `<LogoutButton />` を配置する（設計書の配置方針どおり、`MoreMenu` 内に
両方を持たせる）。

`logout-button.tsx`（`'use client'`）: `authClient.signOut()` → 成功なら
`caches.keys()` を使い `'shopping-list-detail-cache'`/`'shopping-lists-pages-cache'`/
`'stores-cache'` を `caches.delete()`（存在しなければ no-op。失敗は無視。ベストエフォート。
try/catch で握りつぶす） → `window.location.assign('/login')`。失敗時は
`API_FAILURE_MESSAGE` と同じ文言をボタン付近にバナー表示する。

### 追加テスト

`more-menu.test.tsx` 更新:

- MM-03 を「リンクはちょうど 3 件」に更新。
- 新規: 「アカウント」リンクの href が `/more/account`。
- 新規: `LogoutButton`（ボタン）がちょうど 1 件描画される。

`logout-button.test.tsx`:

- クリックで `authClient.signOut` が呼ばれる。
- 成功時 `caches.delete` が対象 3 キーで呼ばれ（`caches` を `vi.stubGlobal` でモック）、
  `window.location.assign('/login')` が呼ばれる。
- `caches` が無い環境（`caches` 未定義）でも例外を投げず `location.assign` まで進む
  （ベストエフォートの回帰防止）。
- `signOut` が失敗（reject）した場合はエラーバナーを表示し `location.assign` を呼ばない。

### 5-3. `/more/account`（パスワード変更・他端末失効）

| 種別 | ファイル                                                                            |
| ---- | ----------------------------------------------------------------------------------- |
| 新規 | `apps/web/src/app/more/account/page.tsx`                                            |
| 新規 | `apps/web/src/app/more/account/_components/change-password-form.tsx`                |
| 新規 | `apps/web/src/app/more/account/_components/revoke-other-sessions-button.tsx`        |
| 新規 | `apps/web/tests/app/more/account/_components/change-password-form.test.tsx`         |
| 新規 | `apps/web/tests/app/more/account/_components/revoke-other-sessions-button.test.tsx` |

`page.tsx`: `getAuth().api.getSession({ headers: await headers() })` を呼び、`null` なら
`redirect('/login?next=/more/account')`（`next/navigation` の `redirect`。Proxy が既に
守っているため二重防御だが、表示に session が要るため設計書どおり実装する）。表示名・
メールアドレスを表示し、`ChangePasswordForm` と `RevokeOtherSessionsButton` を配置する。

`change-password-form.tsx`（`'use client'`）: 現在のパスワード / 新パスワード / 確認の
3 フィールド。確認不一致はクライアント側でエラー表示（送信しない）。送信は
`authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })`。
成功文言「パスワードを変更しました。他の端末では再ログインが必要です。」。失敗（現在の
パスワード誤り = E-10）はエラーバナー表示。

`revoke-other-sessions-button.tsx`（`'use client'`）: `authClient.revokeOtherSessions()`。
成功/失敗の文言表示。

### 追加テスト

`change-password-form.test.tsx`:

- 新パスワードと確認が不一致 → 送信されず（`authClient.changePassword` が呼ばれない）
  エラー表示。
- 送信で `authClient.changePassword` が `{ currentPassword, newPassword,
revokeOtherSessions: true }` で呼ばれる。
- 成功文言の表示（E-10 の逆）。
- 失敗（現在のパスワード誤り相当のエラー）→ エラー文言表示（E-10）。

`revoke-other-sessions-button.test.tsx`:

- クリックで `authClient.revokeOtherSessions` が呼ばれる。
- 成功/失敗の文言分岐。

### Step 5 完了条件

```bash
pnpm --filter @cookpit/web type-check
pnpm --filter @cookpit/web lint
pnpm --filter @cookpit/web test
```

- `/more/page.tsx`・`/more/account/page.tsx`・`/login/page.tsx` は RTL テスト対象外
  （前提確認 26 のとおり既存慣習を踏襲。実機/E2E で確認する）。

---

## Step 6: Service Worker

**依存**: なし（Step 0〜5 と並行実装可能。ただし本番ビルド経路でのみ実地確認できる点は
既存 SW 変更と同じ制約）

### 対象ファイル

| 種別 | ファイル                                                  |
| ---- | --------------------------------------------------------- |
| 新規 | `apps/web/src/app/_utils/sw-cache-plugins.ts`             |
| 新規 | `apps/web/tests/app/_utils/sw-cache-plugins.node.test.ts` |
| 変更 | `apps/web/src/app/sw.ts`                                  |

### 6-1. `sw-cache-plugins.ts`（新規。純関数として切り出し）

```ts
/**
 * リダイレクト応答・非 200 応答を SW ランタイムキャッシュへ書き込ませない
 * （Serwist/Workbox の既定 `cacheOkAndOpaquePlugin` は opaqueredirect（status 0）も
 * 保存するため、未認証 navigation の 302 がキャッシュされ、ログイン後のオフライン
 * 再訪問で /login へ誤誘導される事故を防ぐ）。
 */
export async function cacheWillUpdate({
  response,
}: {
  response: Response;
}): Promise<Response | null> {
  return response.status === 200 && !response.redirected ? response : null;
}
```

型はテストで自己完結できるよう最小限にする（Serwist の `WorkboxPlugin['cacheWillUpdate']`
シグネチャに構造的に適合すればよく、Serwist の型を import する必要は無い — `sw.ts` 側で
`plugins: [{ cacheWillUpdate }]` として渡す際に型が合わない場合のみ Serwist の型を
import して合わせる）。

### 6-2. `sw.ts` 変更

`shopping-list-detail-cache` と `shopping-lists-pages-cache` の `NetworkFirst` の
`plugins` 配列に `{ cacheWillUpdate }`（6-1 から import）を追加する。`stores-cache`
（`StaleWhileRevalidate`）にも規約を揃えて同じ plugin を追加する（設計書のとおり）。
`/login`・`/api/auth/*` は既存 `runtimeCaching` の matcher に該当しないため matcher 自体は
変更しない。コメントで「新たに matcher を足さない」理由を残す（設計書のとおり）。

### 追加テスト（`sw-cache-plugins.node.test.ts`）

- `status: 200, redirected: false` → 応答オブジェクトをそのまま返す。
- `status: 200, redirected: true` → `null`。
- `status: 302` → `null`。
- `status: 401` → `null`（API の 401 JSON もキャッシュしない回帰防止）。
- `Response` は `environment: 'node'`（Node 18+ の標準 `Response`）で十分。happy-dom は
  不要（`tests/**/*.node.test.ts` として node プロジェクトに配置する）。

### Step 6 完了条件

```bash
pnpm --filter @cookpit/web type-check
pnpm --filter @cookpit/web lint
pnpm --filter @cookpit/web test -- sw-cache-plugins
pnpm --filter @cookpit/web build
```

- `pnpm build` が成功すること（`self.__SW_MANIFEST` の terser インライン化に関する既存の
  罠 — `apps/web/src/app/sw.ts` 冒頭のコメント参照 — が今回の変更で再発しないか確認する。
  `sw.ts` 内の `sw`（`self` エイリアス）の参照箇所数は変えていないため再発しない想定だが、
  ビルドで最終確認する）。

---

## Step 7: アカウント発行・パスワード再設定スクリプト

**依存**: Step 2（`createAuth`/`create-auth.ts` が完成している）、Step 0（0-9 の `tsx` 導入）

### 対象ファイル

| 種別 | ファイル                                           |
| ---- | -------------------------------------------------- |
| 新規 | `apps/web/scripts/auth-create-user.ts`             |
| 新規 | `apps/web/scripts/auth-set-password.ts`            |
| 新規 | `apps/web/tests/scripts/auth-scripts.node.test.ts` |
| 変更 | `apps/web/package.json`                            |

### 7-1. `auth-create-user.ts`

設計書「バックエンド設計 > スクリプト」の表をそのまま実装する。ヘッダコメントに
`setup-pglite-dev.mjs` と同じ作法で使い方を書く（前提確認 10・29）:

```
使い方:
  DATABASE_URL=<接続文字列> AUTH_USER_EMAIL=a@example.com AUTH_USER_NAME=太郎 \
    pnpm --filter @cookpit/web auth:create-user
  AUTH_USER_PASSWORD 未指定なら TTY（対話・エコー無し）で入力を求める。
```

- `DATABASE_URL` が `pglite://` なら `drizzle-orm/pglite`、それ以外は
  `createTxConnection`（WebSocket。1 プロセス 1 接続で最後に `close()`）を使う
  （D-10・D-18 の回避策）。
- `createAuth({ db, secret: 'script-local-' + Date.now()（任意値。署名に使われないため
固定値でも可だが、複数プロセス衝突を避けるため一応可変にする）, baseURL: null,
trustedOrigins: [], allowSignUp: true, autoSignIn: false, rateLimitStorage: 'memory' })`
  を組み、`auth.api.signUpEmail({ body: { email, password, name } })` を呼ぶ。
- パスワードは引数に渡さない。`AUTH_USER_PASSWORD` 環境変数、無ければ `node:readline` の
  `question` を `stdin.setRawMode(true)` でエコー無効化して対話入力する（TTY でない場合は
  非対話環境と判断し exit 1 で明示エラーにする）。
- 既存 email（Better Auth が重複エラーを返す）/ 12 文字未満のパスワードはいずれも
  非ゼロ終了コードで失敗し、行を作らない（E-11）。Better Auth のエラーメッセージが
  期待どおり非 2xx を返すことを 0-2/0-4 のいずれかの検証で確認済みの経路を再利用する。

### 7-2. `auth-set-password.ts`

設計書のとおり `auth.$context` の内部 API（`internalAdapter.findUserByEmail` →
`password.hash` → `internalAdapter.updatePassword` →
`internalAdapter.deleteSessions`）を使う。**この内部 API が 1.7.5 で使えるかを実装着手時に
型定義で確認し**、使えなければ設計書のフォールバック（`better-auth/crypto` の
`hashPassword` で直接 `accounts.password` を UPDATE、`sessions` を `user_id` で DELETE する
Drizzle クエリ）に切り替える。フォールバックを採った場合は、スクリプトのヘッダコメントに
「better-auth 1.7.5 のテーブル形状に依存」と明記する（設計書の指示どおり）。

### 7-3. `package.json` 追記

```json
"scripts": {
  "auth:create-user": "tsx scripts/auth-create-user.ts",
  "auth:set-password": "tsx scripts/auth-set-password.ts"
}
```

`dependencies` に `better-auth`、`devDependencies` に `tsx`（0-9 の結果に応じて）を
最終確定させる（Step 0 で仮追加した内容をここで確定版として整理する）。

### 追加テスト（`auth-scripts.node.test.ts`）

`DATABASE_URL=pglite://<一時ディレクトリ>` に対し、`node:child_process`（`execFileSync` 等。
Vitest から `tsx` 経由でスクリプトを実サブプロセス実行する）で:

1. `auth:create-user` 相当を実行 → 正常終了（exit 0）。
2. 同じ email で再実行 → 非ゼロ終了（E-11）。
3. `auth:set-password` で新パスワードに変更 → `signInEmail`（テストコード内で直接
   `createAuth()` を組んで呼ぶ）が新パスワードで成功し、旧パスワードでは失敗する。
4. `auth:set-password` 実行後、事前に作った別セッション相当の `sessions` 行が空になる
   （全端末失効の確認）。
5. 12 文字未満のパスワードで `auth:create-user` → 非ゼロ終了。

0-4（PGlite アダプタの疎通）が NG だった場合、このテストファイル全体を `describe.skip`
にし、Neon 上での手動確認に置き換える（設計書「テスト方針 > スクリプト」に明記のとおり
PGlite が前提のため、代替経路が無い）。

### Step 7 完了条件

```bash
pnpm --filter @cookpit/web type-check
pnpm --filter @cookpit/web lint
pnpm --filter @cookpit/web test -- auth-scripts
```

- スクリプトが `console.log`/`console.error` 以外でパスワード平文を出力しないこと
  （`grep` でスクリプト本体を目視）。

---

## Step 8: 既存テストの回帰確認・E2E・品質ゲート

**依存**: Step 1〜7 すべて完了

### 8-1. 既存テストで更新が要るものの棚卸し（再確認）

| ファイル                                                 | 変更内容                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `apps/web/tests/app/more/_components/more-menu.test.tsx` | Step 5-2 で対応済み（MM-03 更新 + 新規ケース）                                         |
| `apps/web/tests/app/_components/nav-bar.test.tsx`        | Step 5-1 で対応済み（`/login` 非表示ケース追加）                                       |
| `apps/web/tests/lib/use-api-action.test.tsx`             | Step 4 で対応済み（401 ケース追加）                                                    |
| `apps/web/tests/proxy.node.test.ts`                      | Step 3 で全置換済み                                                                    |
| `apps/web/tests/server/routes/*.test.ts`（13 ファイル）  | 変更しない。Step 2 完了条件で無変更 green を確認済み                                   |
| `apps/web/playwright.config.ts` 依存の E2E 2 本          | `httpCredentials` 削除後も `NODE_ENV=development` のスキップ経路で無変更のまま通ること |

### 8-2. `playwright.config.ts`

`BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD` から `httpCredentials` を組む 12-24 行目を削除する
（F-14）。`E2E_AUTH_EMAIL`/`E2E_AUTH_PASSWORD` から `storageState` を生成する仕組み
（`globalSetup` 等）を追加するかどうかは test-designer の試験計画確定を待つ
（設計書「テスト方針 > E2E」のとおり）。本 Step では削除のみ行い、`storageState` 生成の
要否は Step 8-4 の `auth-login.spec.ts` 実装時に確定させる。

### 8-3. `apps/web/e2e/README.md`

ログイン E2E（`auth-login.spec.ts`）の実行条件（`E2E_AUTH_EMAIL`/`E2E_AUTH_PASSWORD` が
無ければ `test.skip`）を追記する。「ローカル実行」節に、資格情報 env を渡す例を追加する。

### 8-4. `apps/web/tests/e2e/auth-login.spec.ts`（新規）

`E2E_AUTH_EMAIL`/`E2E_AUTH_PASSWORD` が未設定なら `test.skip()`。設定されていれば:

1. `/pantry` へ直接アクセス → `/login?next=%2Fpantry` へリダイレクトされる。
2. ログインフォームに入力して送信 → `/pantry` に戻る。
3. `/more` の「ログアウト」→ `/login` へ遷移する。
4. ログアウト後に `/pantry` へアクセス → 再び `/login?next=%2Fpantry` になる。

CI では両 env が未設定のため実行されず（`describe`/`test` 自体が skip 扱いになり、
`assert-e2e-results.mjs` の「2 件以上実行され全件成功」判定は既存 2 本
（`recipe-crud.smoke.spec.ts`/`saturday-flow.spec.ts`）で満たされたまま変わらないことを
確認する（既存 2 本は `NODE_ENV=development` の認証スキップ経路で無変更）。

### Step 8 完了条件（モノレポ全体）

```bash
pnpm lint
pnpm type-check
pnpm build
pnpm test
pnpm format:check
```

- 全て green。`packages/domain`・`packages/application`・`packages/api-contract` に
  差分が無いこと（AC-06）。
- 依存追加（`better-auth`/`@better-auth/cli`/`tsx`）に伴い、ローカルで
  `pnpm audit --prod --audit-level=high` を実行し、新規の high/critical が無いことを
  確認する（CI の `deps_changed` 判定で自動実行されるが、実装時にも事前確認する）。

---

## Step 9: ドキュメント更新

**依存**: Step 1〜8（実装内容が確定してから記述する）。設計書 D-19「実装 PR に含める」に
従い、本 Step は Step 10（移行とリリース）の前に完了させる。

### 9-1. `docs/decisions/ADR-0021-basic-auth-for-public-repository.md`

1 行目の `- Status: Accepted` を次に変更する:

```
- Status: Superseded by [ADR-0022](./ADR-0022-better-auth-login.md)（2026-09-17）
```

本文（Context/Decision/Alternatives/Consequences/Migration/Rollback）は残す
（設計書のとおり「本文は残す」）。

### 9-2. `docs/decisions/ADR-0003-no-auth-in-mvp1.md`

既存の 2026-09-16 追記ブロック（3-10 行目）と同じ形式で、フォローアップ節（66-73 行目）の
末尾に追記する:

```
- **2026-09-17 追記**: Better Auth（email + password + Cookie セッション）を
  [ADR-0022](./ADR-0022-better-auth-login.md) で導入した。「Better Auth への移行は
  引き続き Phase 2 以降の選択肢として残る」としていた本項目は解消した。
```

### 9-3. `docs/01-overview.md`

- 14 行目「本番デプロイは Basic 認証で保護して利用者を 2 名に限定した」を
  「本番デプロイは Better Auth（email + password + Cookie セッション、
  [ADR-0022](./decisions/ADR-0022-better-auth-login.md)）で保護して利用者を 2 名に限定した」
  に更新する。
- 70 行目「認証・複数ユーザー対応」（対象外リストの項目）は、個人を識別する認証を
  導入した現状と矛盾しないか確認する。ロール・複数ユーザー運用は引き続き対象外のため、
  文言を「複数ユーザー対応（ロール・3 人目以降の運用）」等に是正するか、
  そのまま残すかは実装時に文脈を読んで判断する（design に明記が無いための implementer 裁量。
  結論をコミットメッセージに残す）。

### 9-4. `docs/02-tech-stack.md`

- 12 行目のサマリ表「認証」行を
  `| 認証 | Better Auth（email + password + Cookie セッション）。ADR-0021（Basic 認証）を置換 | ADR-0022 |`
  相当に更新する。
- 76-84 行目「認証は Basic 認証（Next.js Proxy）」節の見出し・本文を Better Auth 前提に
  書き換える。ADR-0021 への参照は「置換された」旨を明記し、ADR-0022 への参照を追加する。
  84 行目「個人を識別する認証はまだ必要としないため、Phase 2 以降で Better Auth の導入を
  引き続き検討する」は事実と矛盾するため削除・書き換える。

### 9-5. `docs/03-architecture.md`

- 54 行目 `│   │   ├── proxy.ts                 # Basic 認証（Next.js 16 Proxy。ADR-0021）`
  を `# セッション検証（Next.js 16 Proxy。ADR-0022）` に更新する。
- 66-69 行目付近のツリーに `server/auth/` を追記する（`repositories.ts` と同階層）。
- 214 行目「認証は `src/proxy.ts` の Basic 認証で全経路の手前に掛かる（ADR-0021）」を
  Better Auth 前提に書き換える。215 行目の「ログインユーザーという概念はドメインに
  持ち込んでいない（ADR-0004）」は維持（U-1 のとおり不変）。
- 217-226 行目「パッケージ公開境界」表の `infrastructure（web から）` 行の正規 import に
  `@/server/auth` を追記する:
  `| infrastructure（web から） | `@/server/repositories`・`@/server/auth`・`@/db/_`に閉じる | page からの直接`new Drizzle_` |`

### 9-6. `docs/05-roadmap.md`

963 行目・1126 行目の「認証（Better Auth）」対象外記述を、実施済みである旨に更新する
（例: 「認証導入（Better Auth）— ADR-0022 で導入済み（2026-09-17〜）」）。
設計書には明記が無いが、要求元指示により対象に含める。docs-only の低リスク変更であり
設計判断を伴わないため、Orchestrator への差し戻しは不要と判断する。

### 9-7. `apps/web/.env.example`

```diff
 DATABASE_URL=
 VAPID_PUBLIC_KEY=
 VAPID_PRIVATE_KEY=
 VAPID_SUBJECT=  # mailto: か https:// のみ
 CRON_SECRET=  # openssl rand -base64 32
-BASIC_AUTH_USER=  # ':' を含めないこと（RFC 7617。含めると分割が曖昧になる）
-BASIC_AUTH_PASSWORD=  # openssl rand -base64 24。公開後の防御はこの値の強度が全て
+BETTER_AUTH_SECRET=  # openssl rand -base64 32。Preview と Production で別値にする
+BETTER_AUTH_URL=  # 本番のみ。例: https://cookpit-web.vercel.app（Preview/local は未設定のままにする）
 # TZ は設定しない。Vercel の予約環境変数のため登録できない（AWS Lambda が定義済み）。
 # 期限判定の JST 固定は packages/application/src/pantry/expiry.ts でコード上に明示する。
```

### 9-8. `docs/04-domain-model.md` の整合確認

Domain/Application 層に差分が無いため**更新不要**。整合確認のみ実施し、完了条件に記録する。

### 9-9. `docs/07-dev-rules.md`

該当する「環境変数」「スクリプト」専用節が存在しないことを確認済み（前提確認 28）。
**更新不要**。

### Step 9 完了条件

```bash
pnpm format:check
```

- `grep -rn "BASIC_AUTH" apps/web docs` の結果が、ADR-0021 本文（歴史的記録として残す）と
  ADR-0022 本文（比較のための言及）以外に無いこと（コード・`.env.example`・
  `playwright.config.ts` からは 0 件。AC-08）。

---

## Step 10: 移行とリリース（実装完了後の運用手順）

設計書「移行とリリース」の順序をそのまま踏襲し、担当を実装者（コード）/Orchestrator/
人間（ユーザー）に分ける。**順序を逆にしない**（無防備または締め出しの窓が開く）。

| #   | 手順                                                                                                                                                                                                                                           | 担当                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | PR 作成。CI の `quality` ジョブと `e2e` ジョブを実行。`e2e` ジョブが `DATABASE_URL` secret ありの経路で `pnpm --filter @cookpit/web db:migrate` を実行し、**本番 Neon に Better Auth テーブルが追加のみで適用される**（既存運用。前提確認 21） | Orchestrator（PR 作成・CI 監視）                                               |
| 2   | migration SQL（`0010_*.sql`）のレビューで、既存テーブルへの差分がゼロであることを確認                                                                                                                                                          | Orchestrator（レビュー時） / reviewer                                          |
| 3   | Vercel の **Preview** 環境変数に Preview 専用の `BETTER_AUTH_SECRET` を登録（`BETTER_AUTH_URL` は登録しない）                                                                                                                                  | **人間**（Vercel ダッシュボード操作）                                          |
| 4   | 開発者の手元から `DATABASE_URL=<本番 Neon> pnpm --filter @cookpit/web auth:create-user` を 2 回実行し、開発者・パートナー分のアカウントを発行（パスワードは対話入力。パートナーへは別経路で伝える）                                            | **人間**                                                                       |
| 5   | Preview デプロイで実機確認: ログイン / ログアウト / パスワード変更 / 他端末失効 / 通知クリック / `/manifest.webmanifest` 200 / `/api/cron/*` の Bearer 判定                                                                                    | **人間**（実機操作）                                                           |
| 6   | Vercel の **Production** 環境変数に `BETTER_AUTH_SECRET`（本番用）・`BETTER_AUTH_URL=https://cookpit-web.vercel.app` を登録。**`BASIC_AUTH_*` はまだ削除しない**（ロールバック用に温存）                                                       | **人間**                                                                       |
| 7   | PR のレビュー承認 → `main` へマージ → 本番デプロイ                                                                                                                                                                                             | Orchestrator（レビュー調整） / **人間**（マージ承認）                          |
| 8   | 本番 black-box 確認表（設計書「移行とリリース」手順 7 の 11 行）を curl 等で確認                                                                                                                                                               | **人間**（または Orchestrator が curl コマンド列を用意し人間が実行結果を共有） |
| 9   | 2 名の端末（iOS / Android の standalone PWA）でログイン → 再起動でログイン維持 → ログアウト → 通知クリック起動 の 4 項目を実機確認                                                                                                             | **人間**                                                                       |
| 10  | Vercel の `BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD` を Production/Preview から削除                                                                                                                                                               | **人間**                                                                       |

- Step 9（ドキュメント更新。ADR-0021 の Status 変更等）は**この PR に既に含まれている**
  （D-19 のとおり実装 PR 内で完了済み）。上記手順 6〜10 が問題なく終わった後に
  改めてドキュメントを変更する追加コミットは不要。
- **ロールバック**（手順 7〜9 で問題発覚時）: Vercel で前デプロイへ即時ロールバックする
  （**人間**が操作）。前デプロイは Basic 認証コードのままで、手順 6 で温存した
  `BASIC_AUTH_*` を使うため即座に保護が戻る。Better Auth のテーブルは残しても無害
  （Basic 認証コードは参照しない）。`BASIC_AUTH_*` 削除後（手順 10 の後）に問題が出た場合は
  `BASIC_AUTH_*` を再登録してからロールバックする。

---

## 依存関係（Step 間）

```
Step 0（依存追加+スパイク検証。0-1〜0-11 がブロッキング）
  └─→ Step 1（DB スキーマ生成）
        └─→ Step 2（サーバー実装: createAuth/getAuth/Hono マウント）
              ├─→ Step 3（Proxy 全置換）── 完了後に 0-12（build での TLA 確認）
              ├─→ Step 4（クライアントライブラリ・401 回復）※ Step 2 完了前でも型のみで着手可
              │     └─→ Step 5（画面: /login・/more・/more/account・NavBar）
              └─→ Step 7（スクリプト）
        Step 6（Service Worker）── Step 0〜5 と並行実装可能（依存なし）
  Step 3・Step 5・Step 6・Step 7 すべて完了
        └─→ Step 8（既存テスト回帰確認・E2E・品質ゲート）
              └─→ Step 9（ドキュメント更新）
                    └─→ Step 10（移行とリリース。人間作業が主体）
```

**並列可能な組**:

- Step 4（クライアントライブラリ）と Step 6（Service Worker）は Step 0 完了後すぐに
  着手でき、Step 1〜3 と並行して進められる（`authClient`/`cacheWillUpdate` はいずれも
  `getAuth()`/Proxy の実装完了を待たずに書ける。RTL/node テストは `vi.mock` で自己完結）。
- Step 5（画面）は Step 4 完了後に着手し、Step 2（サーバー実装）と並行してよい
  （RTL テストは `authClient` を mock するため実サーバー疎通は不要）。
- Step 7（スクリプト）は Step 2 完了後、Step 3（Proxy）とは独立して進められる。
- Step 3・5・6・7 が全て完了して初めて Step 8（品質ゲート）に進む。

---

## テスト計画

`docs/tests/better-auth-login.md`（test-designer 作成中）確定後、本節のケースと ID・過不足を
突き合わせる。配置はすべて `apps/web/tests/` 配下で `src/` 構造をミラーし、vitest の
include パターン（node: `tests/**/*.node.test.ts` / `tests/server/**/*.test.ts`、dom:
`tests/**/*.dom.test.ts` / `tests/**/*.test.tsx`）に一致させる。

| 種別                  | ファイル                                                                                                                                                                                                                   | 対応する設計書節                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Proxy 単体（node）    | `apps/web/tests/proxy.node.test.ts`（全置換）                                                                                                                                                                              | テスト方針 > Proxy 単体                                       |
| Hono マウント（node） | `apps/web/tests/server/auth/auth-route.test.ts`（新規）                                                                                                                                                                    | テスト方針 > Hono マウント                                    |
| 画面（dom/RTL）       | `login-form.test.tsx` / `logout-button.test.tsx` / `change-password-form.test.tsx` / `revoke-other-sessions-button.test.tsx` / `more-menu.test.tsx`（更新）/ `nav-bar.test.tsx`（更新）/ `use-api-action.test.tsx`（更新） | テスト方針 > 画面（RTL）                                      |
| SW 純関数（node）     | `apps/web/tests/app/_utils/sw-cache-plugins.node.test.ts`（新規）                                                                                                                                                          | テスト方針 > Service Worker                                   |
| スクリプト（node）    | `apps/web/tests/scripts/auth-scripts.node.test.ts`（新規。PGlite 前提。0-4 NG なら skip）                                                                                                                                  | テスト方針 > スクリプト                                       |
| E2E（Playwright）     | `apps/web/tests/e2e/auth-login.spec.ts`（新規。資格情報 env 必須。CI では skip）                                                                                                                                           | テスト方針 > E2E                                              |
| 実機確認（手動）      | 該当無し（自動化不可）                                                                                                                                                                                                     | テスト方針 > 実機確認（自動化不可）。Step 10 手順 5・9 に対応 |

既存テストへの影響: `apps/web/tests/server/routes/*.test.ts`（13 ファイル）は無変更で
green を維持（Step 2 完了条件で確認）。`apps/web/tests/e2e/recipe-crud.smoke.spec.ts` /
`saturday-flow.spec.ts` は `httpCredentials` 削除後も `NODE_ENV=development` の
認証スキップ経路のため無変更で通る想定（Step 8 で確認）。

---

## リスク

設計書 §リスク R-1〜R-10 を実装計画のステップに紐づける。

| #    | リスク                                                                                             | 対応する Step                    | 対策                                                                                                                                             |
| ---- | -------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-1  | Proxy バンドル肥大でコールドスタートが延びる                                                       | Step 3 完了条件 / Step 10 手順 8 | §性能の計測手順（curl）を Step 10 の black-box 確認と合わせて実施。悪化が許容できなければ P-c（楽観 + 各経路検証）への切替を Orchestrator に相談 |
| R-2  | アダプタが neon-http のトランザクション不可で失敗する                                              | Step 0（0-2）                    | フォールバック順（transaction 無効化 → WebSocket 接続切替 → Orchestrator 差し戻し）を明記済み                                                    |
| R-3  | `rateLimit.storage: 'database'` がサーバーレスで期待どおり動かない                                 | Step 0（0-5）                    | memory へフォールバック。ADR-0022 に既記載のリスクのため ADR 追加修正は不要                                                                      |
| R-4  | 全員が締め出される設定ミス（prefix ずれ・secret 誤登録・`BETTER_AUTH_URL` 誤り）                   | Step 10 手順 3〜6                | Preview で先に検証（手順 5）。`cookiePrefix` は create-auth.ts と proxy.ts で一致確認（Step 3 完了条件）                                         |
| R-5  | SW がリダイレクト応答を cache する                                                                 | Step 6                           | `cacheWillUpdate`（6-1）+ 実機確認 4（Step 10 の black-box とは別に設計書「実機確認」項目 4）                                                    |
| R-6  | iOS standalone で Cookie が想定より早く消える                                                      | Step 10 手順 9                   | 実機確認。発生時は設計変更なし（iOS 側挙動の調査）                                                                                               |
| R-7  | CI の E2E がスキップ経路に依存し、ログインフローが CI で検証されない                               | Step 5（RTL）/ Step 8-4          | RTL でフォーム挙動を、`auth-login.spec.ts` をローカル/Preview で実行（CI では skip のまま許容）                                                  |
| R-8  | migration が CI（PR 時）で本番 Neon に先行適用される                                               | Step 10 手順 1                   | 追加テーブルのみで無害。既存運用どおり（前提確認 21）                                                                                            |
| R-9  | `better-auth` の推移的依存に high 以上の脆弱性                                                     | Step 8 完了条件                  | `pnpm audit --prod --audit-level=high` をローカルでも事前実行。ignore は使わずバージョン更新で対処                                               |
| R-10 | Better Auth のマイナー更新で API 名が変わる（設計書の概念コードと差異）                            | Step 2・3・7                     | 実装時に 1.7.5 の型定義で確認し、差異があれば実装詳細の是正として本計画の疑似コードを補正する（設計判断ではない）                                |
| R-11 | `getDb()`（app schema のみ）が Better Auth のリレーショナル API 要求と食い違う（本計画で新規検出） | Step 0（0-3）／Step 1-1          | `createAuthDb()` 相当を `packages/infrastructure` 内に追加するフォールバックを用意済み                                                           |

## ロールバック方法

- **コードのロールバック**: 本 PR は Basic 認証コードを削除する一括切替のため、
  コードだけを部分的に戻すロールバックは行わない。Vercel の**前デプロイへの即時
  ロールバック**（Step 10 のロールバック手順）が正規の手段。
- **migration の down は作らない**（設計書 D-11・ADR-0022 Rollback 節の方針どおり）。
  追加テーブルのみで既存データに影響しないため、Better Auth のテーブルを残したまま
  前デプロイ（Basic 認証）へロールバックしても実害が無い。テーブルを消す必要が生じた
  場合は別途 `DROP TABLE` の migration を新規タスクとして作成する（本 PR では作らない）。
- **環境変数だけを戻す場合**: `BETTER_AUTH_SECRET` を削除・空にすると
  `NODE_ENV=production`（Preview 含む）では 503（fail-closed）になる。「保護なしでの
  復旧」にはならない。緊急時は正しい secret の再登録を優先し、それでも直らない場合のみ
  前デプロイへのロールバックに進む。
- **Step 単位のロールバック**（PR 未マージ・実装途中で後戻りする場合）:
  - Step 0〜2（依存・DB・サーバー実装）のみを戻す: `git revert` または未コミットの破棄で
    足りる。migration が既にローカル PGlite に適用されていても dev 専用のため実害無し。
  - Step 3（Proxy 全置換）を戻す: `apps/web/src/proxy.ts` と
    `apps/web/tests/proxy.node.test.ts` を Step 3 着手前のコミットに戻せば、
    Basic 認証の挙動に復帰する（ただし `package.json`/DB 変更が既に入っていると
    型検査・依存関係が食い違う可能性があるため、Step 3 単独の revert は Step 0〜2 も
    合わせて戻すセットで行う）。
  - Step 5〜7（画面・SW・スクリプト）は他 Step と疎結合なため個別に revert 可能。

## ドキュメント更新対象

Step 9 に詳細を記載済み。要約:

- `docs/decisions/ADR-0021-basic-auth-for-public-repository.md`（Status 更新。本 PR 内）
- `docs/decisions/ADR-0003-no-auth-in-mvp1.md`（フォローアップ追記。本 PR 内）
- `docs/01-overview.md` / `docs/02-tech-stack.md` / `docs/03-architecture.md`
  （Basic 認証 → Better Auth の記述更新。本 PR 内）
- `docs/05-roadmap.md`（Phase 3 候補「認証導入」の扱いを実施済みに整理。要求元指示により
  対象に含める。設計書に明記は無いが docs-only の低リスク変更）
- `apps/web/.env.example`（`BASIC_AUTH_*` 削除、`BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` 追加）
- `apps/web/e2e/README.md`（ログイン E2E の実行条件）
- `docs/04-domain-model.md`（Domain/Application 差分ゼロのため**更新不要**。整合確認のみ
  Step 9-8 で実施）
- `docs/07-dev-rules.md`（該当節無しを確認済み。**更新不要**）
- ADR-0022 自体（`docs/decisions/ADR-0022-better-auth-login.md`）は既に Status: Accepted
  のため本 PR での追加変更は無し（前提確認・設計書確認済み）。

## 設計への差し戻し候補

無し。本計画作成時に検出した実装レベルの技術的リスク（R-11: `getDb()` の schema バインドが
Better Auth のリレーショナル API 要求と食い違う可能性）は、Gate A で確定済みの置き場所
決定（インスタンスは `apps/web/src/server/auth/`、スキーマ定義は
`packages/infrastructure/src/db/`）の範囲内で解決できるフォールバック
（`packages/infrastructure` 内に authSchema バインド済みの `db` を作る関数を追加する）を
Step 0-3／Step 1-1 に用意済みのため、設計判断の変更を要さない。

設計書の疑似コード（`createAuth()`/`proxy.ts`/スクリプト）は「概念」と明記されており
（設計書 R-10）、Better Auth 1.7.5 の実際の型と食い違った場合の実装詳細の是正は
本計画の Step 0・実装上の罠対応の範囲で implementer が行い、Orchestrator への差し戻しを
要しない。

## 完了条件

- `pnpm lint` / `pnpm type-check` / `pnpm test` / `pnpm build` / `pnpm format:check` が
  すべて green（Step 8）。
- `packages/domain` / `packages/application` / `packages/api-contract` に差分が無い
  （AC-06）。
- `grep -rn "BASIC_AUTH" apps/web docs` が ADR-0021/ADR-0022 本文以外で 0 件（AC-08）。
- Step 9 のドキュメント更新がすべて反映されている。
- `node .claude/scripts/review-readiness.mjs handoff-check --feature better-auth-login
--base <base>` が成功する（`docs/claude-code/definition-of-done.md`「Review readiness
  の共通契約」）。
- Step 10 の人間作業（アカウント発行・環境変数登録・実機確認・`BASIC_AUTH_*` 削除）は
  本 PR のマージ・CI green とは別に、Orchestrator がユーザーへ引き継ぐチェックリストとして
  提示する（AC-04・AC-05 は PR マージ単体では満たされない。運用完了をもって feature 全体の
  Definition of Done を満たす）。

## 第二段（パスキー）への引き継ぎ

第一段の実装で第二段が使える状態にしておくもの（設計書「第二段（パスキー）設計」の
「第一段が用意しておくもの」節のとおり。**第二段のコードは本計画に含めない**）:

- `users.name`（Better Auth 既定テーブル。パスキーの表示名に使える状態で存在する）。
- `/more/account` 画面（`change-password-form.tsx`/`revoke-other-sessions-button.tsx` の
  下に「パスキー」セクションを追加できる構造）。
- `login-form.tsx` の拡張領域（「別の方法でログイン」用のプレースホルダ。第一段では
  何も描画しない）。
- `apps/web/src/server/auth/cli.config.ts` と `packages/infrastructure/src/db/auth-schema.ts`
  の再生成手順（Step 1 の手順をそのまま踏襲し、`plugins: [passkey(...)]` を追加して
  再実行すれば `passkeys` テーブルが生成される）。
- `create-auth.ts` の `plugins` 差し込み口（第一段では空配列。`betterAuth({ ..., plugins:
[] })` の形にしておき、第二段で `plugins: [passkey(...)]` に差し替えるだけで済む
  構造にする）。
