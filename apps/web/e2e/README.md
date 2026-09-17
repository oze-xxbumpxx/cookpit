# E2E スモークテスト（Playwright）

実装本体は `apps/web/tests/e2e/` に置く。現在は、壊れたときの利用者影響が大きい次の 3 本を
critical-path スモークとして自動化している。

- `recipe-crud.smoke.spec.ts`: レシピの作成 → 詳細 → 編集 → 削除
- `saturday-flow.spec.ts`: 献立作成 → 買い物リスト → 購入記録 → 在庫化 → 消費
- `auth-login.spec.ts`: 保護パスへの直接アクセス → `/login` へリダイレクト → ログイン →
  元のパスへ復帰 → ログアウト → 再度 `/login` へリダイレクト（`E2E_AUTH_EMAIL` /
  `E2E_AUTH_PASSWORD` が未設定の場合は `test.skip()`。CI は常にこの状態で実行しない）

ビジネスロジックの境界値・異常系は Domain / Application / Hono route / RTL の Vitest が担い、
Playwright は画面と API、DB をまたぐ主要導線の配線確認に絞る。

## ローカル実行

Neon を使う場合は `apps/web/.env` に `DATABASE_URL` を設定して実行する。

```bash
pnpm --filter @cookpit/web e2e
pnpm --filter @cookpit/web e2e:ui
```

PGlite を使う場合は、テスト用DBを初期化してから同じスモークを実行できる。

```bash
pnpm --filter @cookpit/web db:seed:pglite
DATABASE_URL=pglite://.pglite-dev pnpm --filter @cookpit/web e2e
```

`playwright.config.ts` の `webServer` は、未起動なら `pnpm dev` を自動起動する。別ポートや
起動済みアプリに当てる場合は `E2E_BASE_URL` で上書きする。

```bash
E2E_BASE_URL=http://localhost:3001 pnpm --filter @cookpit/web e2e
```

### ログイン E2E（`auth-login.spec.ts`）

`E2E_AUTH_EMAIL` / `E2E_AUTH_PASSWORD` を設定したときだけ実行される（未設定なら
`test.skip()`）。事前に対象環境（ローカル PGlite / Neon / Preview）へ同じ email + password で
アカウントを発行しておく。

```bash
DATABASE_URL=pglite://.pglite-dev AUTH_USER_EMAIL=e2e@example.test AUTH_USER_NAME=E2E \
  AUTH_USER_PASSWORD=e2e-test-password-1234 pnpm --filter @cookpit/web auth:create-user

E2E_AUTH_EMAIL=e2e@example.test E2E_AUTH_PASSWORD=e2e-test-password-1234 \
  DATABASE_URL=pglite://.pglite-dev pnpm --filter @cookpit/web e2e
```

Preview URL に対して実行する場合は `E2E_BASE_URL` を Preview の URL に、`E2E_AUTH_EMAIL` /
`E2E_AUTH_PASSWORD` を Preview 上で発行済みのアカウントに合わせる（`BETTER_AUTH_SECRET` が
Preview に登録されていないとログイン自体が機能しない点に注意）。

## CI

Pull Request のコード変更では E2E を必ず実行する。`DATABASE_URL` secret があれば Neon、
無ければ fresh な PGlite を使う。JSON レポートを検査し、2 本未満・全件 skip・失敗を成功扱い
しない。

Chromium の実体を指定する環境では `PLAYWRIGHT_CHROMIUM_EXECUTABLE` を利用できる。未指定なら
Playwright が管理するブラウザを使う。

## テストデータ

- レシピ名などは実行ごとに一意化する。
- 土曜フローは一意な未来週を使い、共有 Neon 上の既存献立と衝突させない。
- 作成した在庫は UI で全量消費し、レシピは DELETE API で削除する。
- MealPlan / ShoppingList には削除 API がないため、土曜フローの未来週データは共有 Neon に残る。

UI のラベル・aria を変更した場合は、実装と spec を同じ変更で追従させる。
