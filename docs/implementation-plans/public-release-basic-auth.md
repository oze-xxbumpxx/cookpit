# 実装計画: public-release-basic-auth

- 前提となる設計書: `docs/designs/public-release-basic-auth.md`
- 前提となる要件定義書: `docs/requirements/public-release-basic-auth.md`
- レベル: L3
- 実装ルート: Orchestrator（implementer）
- 判断理由: 指示書に書き切れない実装時判断が残る（docs/06-ai-tools.md「指示書に書き切れないなら
  Orchestrator」）。具体的には (1) `config.matcher` の正規表現が Next.js 16.2.12 で意図通り動くかは
  `pnpm build` の成否と単体テストの両方で実機確認する必要があり、失敗時の対応（記法修正）は
  その場の判断になる、(2) セキュリティ判断（定数時間比較の実装是非）を含むため最終レビューを
  Claude Code に集約する必要がある。定型・ボイラープレート比重は高くない。

## 前提の確認（実装計画作成時点）

- `apps/web/src/middleware.ts` は現時点で**存在しない**（新規作成）。
- 設計書「バックエンド設計」節の疑似実装が**確定版**（SHA-256 ダイジェスト比較、
  `middleware` は `async function`）。設計書に付随する旧案（256 文字固定長ループでの
  定数時間比較）は Orchestrator レビューで指摘・差し替え済みであり、**実装しない**。
- ADR-0021 新規作成・ADR-0003 への追記は本実装計画のスコープ外（別工程）。
  移行手順（環境変数登録 → 実機確認 → public 化）も本実装計画のスコープ外（運用タスク）。
- `.github/workflows/ci.yml` / `apps/web/playwright.config.ts` は変更不要（設計書 D-4。
  理由: E2E の `webServer.command` は `pnpm dev` = `NODE_ENV=development` であり、
  D-3 によりこの環境では環境変数未設定でも認証がスキップされるため、既存の待機ロジック・
  CI ジョブに影響しない）。

## 変更対象ファイル

- `apps/web/.env.example` — `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` のプレースホルダを
  `CRON_SECRET` の記載形式に揃えて追記する。値は書かない。

## 新規作成ファイル

- `apps/web/src/middleware.ts` — HTTP Basic 認証 middleware（Edge Runtime）。
- `apps/web/tests/middleware.node.test.ts` — middleware の単体テスト
  （`src/middleware.ts` の直下配置をミラーする。`tests/**/*.node.test.ts` に一致し
  `vitest.node.config.mts` の include に載る。DOM 依存が無いため `environment: 'node'` で足りる）。

## ファイルごとの変更内容

### apps/web/src/middleware.ts（新規）

- 変更内容: 設計書「バックエンド設計」節の確定版疑似実装を実装する。要点:
  - `decodeBasicCredentials(header: string | null)`: `Basic ` プレフィックス確認 →
    `atob` → `Uint8Array.from(binary, c => c.charCodeAt(0))` → `TextDecoder().decode()` →
    `:` で分割。失敗時は `null`（`try/catch` で吸収。例外を外に投げない）。
  - `sha256(value: string): Promise<Uint8Array>`: `crypto.subtle.digest('SHA-256', ...)`。
    `node:crypto` は使わない（Web Crypto の `crypto.subtle` は Edge Runtime で利用可）。
  - `timingSafeStringEqual(a: string, b: string): Promise<boolean>`: 両者を SHA-256
    ダイジェスト（32 バイト固定長）に正規化してから XOR 累積で比較する。
    **固定長 256 文字ループの実装は禁止**（旧案は資格情報が 256 文字を超えると末尾を
    比較しない切り詰めバグを持つため、Orchestrator レビューで差し替え済み）。
  - `export async function middleware(request: NextRequest): Promise<NextResponse>`:
    1. `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` の両方が非 `undefined` かつ非空文字列か
       判定（B-01: 空文字列は未設定と同義）。
    2. 未設定 かつ `process.env.NODE_ENV === 'production'` → `console.error` でログし
       `new NextResponse(null, { status: 503 })` を返す（fail-closed。E-02/E-03、
       ログ方針は `cron.ts:14` / `push.ts:18` の既存パターンに揃える）。
    3. 未設定 かつ非本番 → `NextResponse.next()`（N-05）。
    4. 設定済み → `Authorization` ヘッダをデコードし、`user:password` 形式に整形した
       `provided` と `expected` を `timingSafeStringEqual` で比較。
    5. 資格情報なし・不一致 → `401`。ヘッダに `WWW-Authenticate: 'Basic realm="Cookpit",
charset="UTF-8"'` と `Cache-Control: 'no-store'` を付与（D-6、欠落と不一致を区別
       しない設計どおり一本化）。
    6. 一致 → `NextResponse.next()`。
  - `export const config = { matcher: [...] }`: 設計書の否定 lookahead 1 パターンを
    そのまま使う。
    ```
    '/((?!_next/static|_next/image|favicon\\.ico|icons/|manifest\\.webmanifest|sw\\.js|workbox-.*\\.js|api/cron/).*)'
    ```
  - コーディング規約対応（設計書が明示する差分のみ。設計に無い判断は追加しない）:
    - `import type { NextRequest }` で型のみ分離。`NextResponse` は値なので通常 import。
    - `any` 不使用（`Uint8Array` / `string` / `null` で完結する）。
    - `===` / `!==` のみ使用。
    - 「値なし」は `null` に統一（`decodeBasicCredentials` の戻り値・失敗時）。
    - `export function middleware` は Next.js 規約上の名前付きエクスポートであり
      default export 禁止ルールに抵触しない（設計書「バックエンド設計」節の注記どおり）。
    - 公開 API の JSDoc: `middleware` 関数に、型に表せない契約（fail-closed 条件・
      401/503 の使い分け・matcher が cron を除外する理由）を簡潔に付与する。
      `decodeBasicCredentials` / `sha256` / `timingSafeStringEqual` は非公開のヘルパーで
      あり JSDoc は必須ではないが、`timingSafeStringEqual` には「なぜ SHA-256 正規化が
      必要か（切り詰めバグの回避）」を Why コメントとして残す（設計書のセキュリティ節の
      要約、要否は実装時に既存コメント密度と合わせて判断）。
- 完了条件:
  - `pnpm --filter @cookpit/web type-check` が通る。
  - `pnpm --filter @cookpit/web lint` が通る（`any` なし・default export なし・
    `import type` 分離・`===`/`!==` のみ）。
  - `apps/web/tests/middleware.node.test.ts` の全ケースが green。
  - `pnpm --filter @cookpit/web build` が成功する（`config.matcher` の静的検証を含む。
    下記「matcher の検証手順」参照）。

### apps/web/tests/middleware.node.test.ts（新規）

- 変更内容: 設計書「テスト方針」節の観点をそのままケース化する。`middleware` を直接呼び出し、
  `NextRequest` を都度生成して検証する（Hono ルートテストのような `app.request` 経由の
  HTTP 起動は不要。middleware は Next.js のミドルウェアランタイムでのみ発火するため、
  関数を直接呼ぶユニットテストで足りる）。
  - `beforeEach`/`afterEach` で `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` / `NODE_ENV` を
    保存・復元する（`cron.test.ts` の `originalCronSecret` パターンに揃える）。
  - ケース一覧（すべて設計書「テスト方針」節に対応。テスト ID は実装時に付与）:
    1. 資格情報なしでアクセス → `401`、`WWW-Authenticate` ヘッダが
       `Basic realm="Cookpit", charset="UTF-8"` であることを確認。
    2. 正しい資格情報（`Authorization: Basic ' + btoa('user:pass')`）→ `NextResponse.next()`
       相当（`res.status` が 200 系、またはリダイレクトでないことと、401/503 でないことを
       確認。`NextResponse.next()` は `status` が `200` になる実装のため `expect(res.status).toBe(200)`
       で固定してよい）。
    3. ユーザー名のみ不一致 → `401`。
    4. パスワードのみ不一致 → `401`。
    5. ユーザー名・パスワード両方不一致 → `401`。
    6. `NODE_ENV=production` かつ環境変数未設定 → `503`、本文が無いこと
       （`res.body` が `null` または空であることを確認）。
    7. `NODE_ENV=development` かつ環境変数未設定 → 認証なしで通過（`NextResponse.next()`）。
    8. UTF-8 マルチバイト文字（例: `パスワード123`）を含むパスワードで正しい資格情報 →
       認証成功（B-02 の回帰防止。`atob → Uint8Array.from → TextDecoder` 経路の確認）。
    9. `Authorization` ヘッダが `Basic ` プレフィックスでない（例: `Bearer xxx`）→ `401`
       （B-03）。
    10. `Authorization` ヘッダの base64 部分が不正でデコードに失敗する →
        例外を投げず `401` になること（B-03、`decodeBasicCredentials` の `try/catch` の
        回帰防止）。
    11. `BASIC_AUTH_USER` のみ設定・`BASIC_AUTH_PASSWORD` 未設定（`NODE_ENV=production`）
        → `503`（B-01: 片方欠落も未設定扱い）。
    12. `BASIC_AUTH_PASSWORD` が空文字列（`NODE_ENV=production`）→ `503`
        （B-01: 空文字列は未設定と同義）。
  - matcher（`config.matcher`）自体の対象パス・除外パス判定は、Next.js のルーティング層が
    実行するため関数呼び出しレベルのテストでは検証できない。これは「matcher の検証手順」
    （後述）で `pnpm build` の静的検証によって担保し、このテストファイルでは matcher の
    エクスポート形（配列であること等）を検証する対象にしない。
    - 除外パスで middleware が実際に発火しないことの検証は、E2E（Playwright）レベルが
      本来適切だが、設計書 D-4 により CI 変更は対象外。実装時にローカルで
      `pnpm --filter @cookpit/web build && pnpm --filter @cookpit/web start` を用いた
      手動確認（`manifest.webmanifest` / `favicon.ico` / `api/cron/expiry-alerts` への
      未認証アクセス）を「移行とリリース」手順の実機確認に含める（設計書の移行手順 4 と
      同一の確認事項であり、本実装計画では新規のテストコードを追加しない）。
- 完了条件: 上記 12 ケースすべてが green。`vitest run --project node`
  （または `pnpm --filter @cookpit/web test`）で新規ファイルが実行されること。

### apps/web/.env.example

- 変更内容: 既存の並び（`DATABASE_URL` → `VAPID_*` → `CRON_SECRET` → 末尾コメント）の後、
  または `CRON_SECRET` の直後に次を追記する。値は書かない。
  ```
  BASIC_AUTH_USER=
  BASIC_AUTH_PASSWORD=
  ```
  `CRON_SECRET=  # openssl rand -base64 32` は生成コマンドのコメント付きだが、
  Basic 認証の値は「Vercel の Production 環境変数に運用担当が登録する」運用値であり
  生成コマンドの前例が無いため、コメント無しでプレースホルダのみとする
  （設計書「移行とリリース」手順 2 の記述と整合）。
- 完了条件: `git diff` が追記 2 行のみであること（既存行を書き換えない）。

## 実装手順

1. **middleware 実装** … `apps/web/src/middleware.ts` を新規作成し、設計書の確定版疑似実装を
   コーディング規約に沿って実装する。完了: `pnpm --filter @cookpit/web type-check` /
   `pnpm --filter @cookpit/web lint` が通る。
2. **matcher のビルド時検証** … `pnpm --filter @cookpit/web build` を実行する。完了:
   ビルドが成功する（Next.js が `config.matcher` を静的検証してエラーにしないことを
   確認する。下記「matcher の検証手順」参照）。ビルド失敗時は記法を修正し本ステップを
   再実行する（対応方針は「リスク」節 R-2 参照）。
3. **単体テスト追加** … `apps/web/tests/middleware.node.test.ts` を新規作成し、上記 12 ケースを
   実装する。完了: 新規テストのみ実行して green（`pnpm --filter @cookpit/web test -- middleware`
   等で対象を絞って先に確認してよい）。
4. **環境変数プレースホルダ追記** … `apps/web/.env.example` に 2 行追記する。完了:
   `git diff` が追記のみであることを確認する。
5. **matcher の実挙動確認（手動）** … ステップ 1〜3 完了後、ローカルで
   `pnpm --filter @cookpit/web build && pnpm --filter @cookpit/web start`（または
   `NODE_ENV=production` 相当の起動）を用いて、対象パス（`/`, `/api/pantry` 等）で
   認証ダイアログが要求されること、除外パス（`/manifest.webmanifest` / `/favicon.ico` /
   `/api/cron/expiry-alerts`）が未認証で通ることを目視確認する。完了: 両方確認できる
   （この手順は「移行とリリース」の実機確認と同一観点であり、本番デプロイ前に一度で
   兼ねてよい。CI には追加しない — D-4）。
6. **品質ゲート** … `pnpm lint` / `pnpm type-check` / `pnpm test`（モノレポ全体）を実行する。
   完了: 全て green。ただし下記「既知の無関係な既存失敗」の 1 件は本変更の失敗として
   扱わない。
7. **.env.example 以外の恒久ドキュメント更新確認** … 「ドキュメント更新対象」節を参照し、
   本実装計画のスコープに含まれないもの（ADR-0021 新規作成・ADR-0003 追記）を
   Orchestrator へ引き継ぐ。完了: 引き継ぎ内容が明確（本計画内に記載済み）。

## 依存関係

1 → 2（1 が終わらないと matcher の記法込みでビルドできない） → 3（middleware 実装が
無いとテストが書けない。2 と 3 は順不同でもよいが、ビルド失敗時の記法修正がテストの
`config.matcher` 検証範囲に影響しないため 2 を先に置く） → 4（依存なし。並行可） →
5（1〜3 完了後） → 6（1〜5 完了後、最終ゲート） → 7（6 の後、引き継ぎ）

## テスト計画

- 新規: `apps/web/tests/middleware.node.test.ts`（`tests/**/*.node.test.ts` として
  `vitest.node.config.mts` の include に一致。`environment: 'node'` で十分 — `NextRequest` /
  `crypto.subtle` はいずれも Node 20+ のグローバルで動作し、DOM は不要）。
  ケースは本計画「ファイルごとの変更内容」節の 12 件（設計書「テスト方針」節の全観点を
  カバー）。
- 既存テストへの影響: 無し（`.github/workflows/ci.yml` / `apps/web/playwright.config.ts`
  は D-4 のとおり変更しない。既存 Hono ルートテスト・Playwright E2E は無変更で通る想定）。
- matcher の検証は 2 段構え（設計書「未決事項」節・要件書 AC-02 対応）:
  1. **ビルド時の静的検証**: Next.js は `config.matcher` の記法をビルド時に検証する。
     `pnpm --filter @cookpit/web build` の成功をもって、正規表現の記法がこの
     Next.js バージョン（16.2.12）で許容されることの確認とする。
  2. **実行時の対象/除外パス判定**: ビルド時検証は「記法が壊れていないか」しか見ないため、
     「意図したパスが実際に除外/保護されるか」は上記単体テストと、実装手順 5 の手動確認
     （ローカルでの本番相当起動）で担保する。CI への Playwright ケース追加は D-4 により
     行わない。

## リスク

| #   | リスク                                                               | 検出タイミング                                 | 対策                                                                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-1 | 固定長ループ方式（旧案）を実装計画・実装が誤って復活させる           | コードレビュー                                 | 本計画・設計書ともに SHA-256 ダイジェスト比較を明記。レビュー時に `for` ループの上限が入力長に依存していないか（`digestA.length` 基準になっているか）を確認する                                                                                                                                                                                  |
| R-2 | `config.matcher` の正規表現が Next.js 16.2.12 で意図通り解釈されない | 実装手順 2（`pnpm build`）                     | ビルドエラー時は matcher 記法を Next.js 16.2.12 のドキュメント・エラーメッセージに沿って修正し、再度ビルドで確認する。**設計書の代替案（`matcher: '/:path*'` + 関数内 `startsWith` 判定）へ切り替える場合は設計からの逸脱になるため、Orchestrator の確認を経てから実装する**（D-2 の「実行コスト削減」という除外理由が弱まるトレードオフのため） |
| R-3 | matcher は通っても実際の対象/除外パス判定が意図と異なる              | 単体テスト（12 ケース）+ 実装手順 5 の手動確認 | 手動確認で不一致が見つかった場合は matcher の否定 lookahead パターンを見直し、再度ビルド・手動確認をやり直す                                                                                                                                                                                                                                     |
| R-4 | 401 ログに資格情報の断片を誤って出力してしまう                       | コードレビュー                                 | 設計書「ログと監視」節どおり 401 はログしない実装にする。503（fail-closed）ログは `console.error` に資格情報の値を含めないことをレビューで確認する                                                                                                                                                                                               |
| R-5 | `apps/web/.env.example` に実際の値を書いてしまう                     | コードレビュー / `git diff` 確認               | プレースホルダのみであることを実装手順 4 の完了条件で確認する                                                                                                                                                                                                                                                                                    |
| R-6 | フルスイート実行時に無関係な既存テストが落ち、本変更の失敗と誤認する | 品質ゲート実行時                               | 下記「既知の無関係な既存失敗」を参照し、該当 1 件のみの失敗であれば本変更の失敗ではないと判断する                                                                                                                                                                                                                                                |

### 既知の無関係な既存失敗（品質ゲート実行時の注記）

このリモート実行環境では、フルスイート並列実行時に
`packages/infrastructure/tests/uow/drizzle-unit-of-work.test.ts` の
`execute 内で例外が出ても接続を閉じる` が 5000ms タイムアウトで落ちることがある。
コンテナが遅く PGlite(WASM) が閾値を超えるための既存事象であり、**本変更と無関係**。
同ファイルを単独実行すると 17/17 成功することを確認済み（`docs/implementation-plans/uow.md`
参照）。品質ゲート（ステップ 6）でこの 1 件のみが失敗し、他の失敗が無い場合は、本変更の
完了条件を満たしていると判断してよい。他のテスト（特に `apps/web` の新規
`middleware.node.test.ts` を含む）が 1 件でも失敗した場合は本変更の不具合として扱う。

## ロールバック方法

- **コードのロールバック**: `apps/web/src/middleware.ts` を削除すれば、Next.js は
  middleware を一切実行しなくなり、直前の無認証状態（実装前の状態）に戻る。
  `apps/web/.env.example` の追記 2 行を削除するかどうかはロールバックの必須要件ではない
  （プレースホルダは値を含まないため残しても実害はない）。
- **環境変数だけを外す場合の挙動（コードは残したまま）**:
  - `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` のどちらかを Vercel から削除・空にすると、
    本番（`NODE_ENV=production`。Preview も同様）ではアプリ全体が `503` になる
    （fail-closed。D-3 の意図した挙動であり、これは「保護なしで公開される」事故を防ぐ
    設計。緊急時に「保護を外して復旧を優先したい」場合は環境変数を外すのではなく
    `middleware.ts` 自体を削除してデプロイし直す必要がある）。
  - 開発環境（`NODE_ENV=development`）では環境変数の有無に関わらず影響なし。
- 本番での事故時の復旧優先順位: (1) 正しい資格情報を再登録する（最速・保護を維持できる）、
  (2) それでも直らない緊急時のみ `middleware.ts` を削除してデプロイし直す（保護が外れる。
  設計書「移行とリリース」の逆順禁止の趣旨に反するため、GitHub リポジトリが public 化済み
  の状態でこの手段を取る場合は特に注意し、Orchestrator 経由でユーザーに確認する）。

## ドキュメント更新対象

- `apps/web/.env.example` — 本実装計画のスコープ内（ステップ 4）。
- `docs/decisions/ADR-0003-no-auth-in-mvp1.md` への `Superseded by ADR-0021` 相当の追記 —
  **本実装計画のスコープ外**。設計書「移行とリリース」手順 6 のとおり、別工程で行う。
- 新規 `docs/decisions/ADR-0021-<タイトル>.md` の作成 — **本実装計画のスコープ外**。
  設計書「移行とリリース」手順 7 のとおり、別工程で行う。ADR 番号 0021 は設計書で
  予約済み。
- `docs/04-domain-model.md` — Entity 変更なし。整合確認のみ（更新不要。Domain/Application
  層への影響が無いため）。
- `docs/03-architecture.md` / `docs/05-roadmap.md` — 設計書・要件書に更新要否の記載が無く、
  本タスクは Presentation 層限定の横断的関心事（Edge middleware）であり既存のアーキテクチャ
  記述と矛盾しないため、更新不要と判断する。疑義があれば実装時に Orchestrator へ確認する。
- リポジトリの private → public 切り替え、Vercel への環境変数登録、実機確認、切り替え後の
  周知 — 本実装計画のスコープ外（設計書「移行とリリース」手順 1・5、運用タスク）。
