# 設計書: public-release-basic-auth

- ステータス: 確定（実装・レビュー完了）
- レベル: L3
- 関連: `docs/requirements/public-release-basic-auth.md` /
  `docs/decisions/ADR-0003-no-auth-in-mvp1.md`（置換済みへ更新済み）/
  `docs/decisions/ADR-0021-basic-auth-for-public-repository.md`（作成済み）

## 背景

GitHub リポジトリ `oze-xxbumpxx/cookpit` を public 化する前提として、本番アプリの唯一の
防御が URL 秘匿（security by obscurity）であることが判明した（`docs/decisions/ADR-0003`
決定理由 5）。リポジトリ公開により本番 URL `https://cookpit-web.vercel.app` は自明になり、
`apps/web/src/server/routes/` の無認証フル CRUD（GET 12 / POST 19 / PUT 5 / DELETE 6。`cron.ts` のみ
既に `Bearer $CRON_SECRET` で保護済み）が第三者に開放される。詳細は要件定義書「背景」参照。

## 目的

`apps/web/src/middleware.ts` を新規作成し、HTTP Basic 認証でアプリ全体（cron を除く）を
保護する。GitHub リポジトリを public にしても、本番アプリのユーザーデータへの第三者アクセス
を防ぐ。

## 要件

`docs/requirements/public-release-basic-auth.md` の F-01〜F-06 / N-01〜N-05 / E-01〜E-03 /
B-01〜B-05 を満たす。特に次の確定済み判断（Orchestrator 確定・変更不可）を前提とする。

- D-1: Edge Runtime で動く middleware。`node:crypto` 不使用。デコードは
  `atob → Uint8Array.from → TextDecoder`。
- D-2: 除外パスは `_next/static` / `_next/image` / `favicon.ico` / `icons/` /
  `manifest.webmanifest` / `sw.js` / `workbox-*.js` / `api/cron/*`。
- D-3: `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` のいずれか未設定時、`NODE_ENV=production`
  なら fail-closed（503）、それ以外はスキップ。
- D-4: CI（`playwright.config.ts` / `ci.yml`）は変更不要。
- D-5: 定数時間比較を自前実装し、長さの差からも情報が漏れないようにする。
- D-6: 401 応答に `WWW-Authenticate: Basic realm="Cookpit", charset="UTF-8"` と
  `Cache-Control: no-store`。
- D-7: Web Push は影響なし。通知クリック起動時の再認証は残るリスクとして記録。
- D-8: ADR-0021 新規作成・ADR-0003 への追記方針（本体作成は別工程）。

## 対象範囲

- `apps/web/src/middleware.ts` の新規設計。
- `apps/web/.env.example` への `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` 追記の設計。
- ADR-0021 新規作成方針、ADR-0003 への追記方針。
- CI への影響評価（結論: 変更不要）。

## 対象外

- リポジトリの private → public 切り替え作業そのもの（GitHub 操作）。
- コード・git 履歴の秘密情報スキャン（別セッションで監査済み）。
- Better Auth 等の本格認証基盤、Vercel Deployment Protection（非採用。要件定義書参照）。
- ドメインモデルへの `userId` 導入（ADR-0004 の方針を維持）。
- ADR-0021 / ADR-0003 追記の本文作成（本設計書は方針提示のみ。作成は別工程）。

## 現状構成

```
apps/web/src/
  app/
    api/[[...route]]/route.ts   # Hono を Next.js に 1 本マウント（ADR-0002）
    manifest.ts                 # /manifest.webmanifest
    sw.ts                       # Serwist 入力（本番ビルドのみ public/sw.js を生成）
  server/routes/
    cron.ts        # 唯一 Bearer 認証で保護済み（CRON_SECRET）
    health.ts / meal-plans.ts / pantry.ts / products.ts / push.ts / recipes.ts /
    shopping-lists.ts / stores.ts   # 無認証のフル CRUD
```

`middleware.ts` は存在しない。Presentation 層（`apps/web/`）に認証処理は無い
（`.claude/rules/presentation-layer.md` の対象外領域）。

## 変更後構成

```
apps/web/src/
  middleware.ts   # 新規。HTTP Basic 認証 + matcher による除外
```

他の既存ファイルへの変更は無い（`.env.example` への追記のみ、コードではない）。

## データフロー

```
リクエスト
  → middleware.ts（Edge Runtime）
      1. パスが matcher 除外対象か判定（_next/static 等・api/cron/*）
         → 除外対象なら middleware をスキップし、そのままルーティング続行
      2. BASIC_AUTH_USER / BASIC_AUTH_PASSWORD が両方設定済みか確認
         → 未設定 かつ NODE_ENV=production → 503 を返却（fail-closed、処理終了）
         → 未設定 かつ NODE_ENV!=production（dev/test） → 認証スキップ、続行
      3. Authorization ヘッダを検証（Basic + base64 デコード + 定数時間比較）
         → 一致 → 続行（Next.js の通常ルーティングへ）
         → 不一致・ヘッダ無し・デコード失敗 → 401 を返却（WWW-Authenticate 付き）
  → （継続する場合）App Router のページ / Hono マウントルート（既存の処理）
```

cron のみ独立した経路: `GET /api/cron/*` は D-2 により middleware の対象外のまま
`apps/web/src/server/routes/cron.ts` の既存 Bearer 認証（`CRON_SECRET`）で保護される。
Vercel Cron は Basic 認証ヘッダを送れないため、この二段構成が必須である。

## API 設計

新規 API エンドポイントは無い。既存 Hono ルート（`/api/*`）の契約・スキーマは変更しない。
`middleware.ts` はエンドポイントの手前で動く横断的関心事であり、`packages/api-contract` の
Zod スキーマにも影響しない。

`config.matcher` の提案（Next.js 16.2.12 の middleware matcher 記法）:

```ts
export const config = {
  matcher: [
    '/((?!(?:_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|workbox-[^/]*\\.js)$|_next/static/|icons/|api/cron/).*)',
  ],
};
```

- 否定 lookahead で除外パスを 1 パターンにまとめ、それ以外の全パス
  （全ページ + `/api/*` のうち cron 以外）を保護対象にする。
- **確認推奨**: Next.js の matcher は内部で path-to-regexp を使うが、バージョンごとに
  サポートする正規表現の記法・エスケープ規則が変わることがある
  （`cookpit/test-infra-expansion` 設計書での Vitest API 誤指定の反省を踏まえた注記）。
  実装時に Next.js 16.2.12 で実際にこの matcher が意図通り動くか、対象パス・除外パスの
  双方で実機確認すること。
- 代替案（トレードオフ併記）: matcher を `'/:path*'` のみにして、除外判定を
  middleware 関数内で `request.nextUrl.pathname.startsWith(...)` により行う方法もある。
  この方法は正規表現の記法リスクを避けられるが、`_next/static` 等の静的アセットへの
  リクエストでも Edge Function が毎回起動するため、D-2 が明記する「middleware 実行コスト
  削減」という除外理由を満たせない。**推奨は matcher 側の正規表現案**とし、上記の
  実機確認を実装時に必須とする。

## DB 設計

対象外（DB スキーマ・マイグレーションへの変更は無い）。

## フロントエンド設計

- 画面・コンポーネントの変更は無い。認証 UI はブラウザ/OS 標準の Basic 認証ダイアログを
  利用し、アプリ側で専用のログイン画面を作らない。
- PWA（standalone 表示）でも同じダイアログが表示される。資格情報はブラウザ/OS の
  資格情報保存機能に保存され、以降は自動送信される想定（N-02）。
- `manifest.webmanifest` / アイコン / `sw.js` は matcher 除外により認証なしで取得できるため、
  PWA のインストール・Service Worker 登録フローに変更は無い（N-03）。

## バックエンド設計

`apps/web/src/middleware.ts`（新規、設計のみ・コードは実装フェーズで作成）の構成案:

```ts
import { NextResponse, type NextRequest } from 'next/server';

const REALM_HEADER = 'Basic realm="Cookpit", charset="UTF-8"';

function decodeBasicCredentials(header: string | null): { user: string; password: string } | null {
  if (header === null || !header.startsWith('Basic ')) {
    return null;
  }
  try {
    const binary = atob(header.slice('Basic '.length));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
      return null;
    }
    return {
      user: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

// タイミング攻撃対策の定数時間比較。crypto.timingSafeEqual は Edge Runtime に無いため
// Web Crypto の SHA-256 ダイジェスト（常に 32 バイト）へ正規化してから比較する。
// 可変長のまま比較すると「固定長ループで打ち切って末尾を見落とす」「ループ長が
// 秘密の長さに依存する」のどちらかに必ず倒れるため、長さを潰してから比べる。
async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

async function timingSafeStringEqual(a: string, b: string): Promise<boolean> {
  const [digestA, digestB] = await Promise.all([sha256(a), sha256(b)]);
  let mismatch = 0;
  for (let i = 0; i < digestA.length; i += 1) {
    mismatch |= digestA[i] ^ digestB[i];
  }
  return mismatch === 0;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPassword = process.env.BASIC_AUTH_PASSWORD;
  const isConfigured =
    expectedUser !== undefined &&
    expectedUser !== '' &&
    expectedPassword !== undefined &&
    expectedPassword !== '';

  if (!isConfigured) {
    if (process.env.NODE_ENV === 'production') {
      // fail-closed: Preview も NODE_ENV=production で動くため、ここで一緒に守られる。
      return new NextResponse(null, { status: 503 });
    }
    return NextResponse.next();
  }

  const credentials = decodeBasicCredentials(request.headers.get('authorization'));
  const provided = credentials === null ? '' : `${credentials.user}:${credentials.password}`;
  const expected = `${expectedUser}:${expectedPassword}`;

  if (credentials === null || !(await timingSafeStringEqual(provided, expected))) {
    return new NextResponse(null, {
      status: 401,
      headers: {
        'WWW-Authenticate': REALM_HEADER,
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!(?:_next/image|favicon\\.ico|manifest\\.webmanifest|sw\\.js|workbox-[^/]*\\.js)$|_next/static/|icons/|api/cron/).*)',
  ],
};
```

上記はコード変更を行わないための**設計上の疑似実装**であり、実装フェーズで
`.claude/rules/coding-standards.md`（`any` 禁止・default export 禁止 — ただし
`middleware.ts` の `export function middleware` は Next.js の規約上デフォルトエクスポート
ではなく名前付き `middleware` 関数なので抵触しない・`import type` の分離・`===`/`!==`・
JSDoc 付与）に沿って実装すること。

`process.env.BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` へのアクセスは Presentation 層
（Edge middleware）に閉じており、Application / Domain 層への影響は無い
（依存方向 `Presentation → Application → Domain ← Infrastructure` を変えない）。

## エラー処理

外部 API・外部ストレージへの新規 I/O は無いため、`create-design-document` Skill が定める
リトライ/タイムアウト/冪等性/部分失敗/フォールバックの 5 項目は対象外（トリガー条件不成立）。

本機能固有のエラー処理:

- 環境変数未設定 × 本番 → 503（fail-closed）。ボディは返さない。既存の `cron.ts` /
  `push.ts` が採用する「未設定は空文字列と同一視する」判定（B-01）に合わせる。
- Basic ヘッダ欠落・形式不正・base64 デコード失敗・資格情報不一致 → いずれも 401 に
  一本化する（欠落と不一致を区別しない。区別すると資格情報の有無を第三者に教える
  ヒントになるため）。
- 想定外の例外（デコード処理の `try/catch` を抜けた場合）は無い設計（`decodeBasicCredentials`
  内で捕捉し `null` を返す）。万一の未捕捉例外は Next.js の既定のエラーハンドリングに委ね、
  UseCase 層のエラーハンドリング規約（`.claude/rules/domain-layer.md`）はこの層には適用されない
  （middleware は UseCase を呼ばないため）。

## ログと監視

- 認証失敗（401）自体はログしない。資格情報やその一部を誤ってログへ残すリスクを避ける
  ため、失敗の記録は行わない（2 名運用の家庭内アプリであり、ブルートフォース検知の
  仕組みは本タスクのスコープ外）。
- 環境変数未設定による 503（fail-closed）発生時のみ、既存パターン（`cron.ts:14` /
  `push.ts:18` の `console.error`）に揃えて `console.error` でサーバー側に記録する。
  資格情報の値そのものは出力しない。
- 追加の監視ダッシュボード整備は対象外。必要になれば Vercel の Function Logs で
  401/503 の発生を目視確認する運用とする。

## セキュリティ

- **防御方式の切り替え**: URL 秘匿（ADR-0003 決定理由 5）から HTTP Basic 認証へ切り替える。
  Basic 認証は資格情報を base64 で毎リクエスト送信する方式であり、暗号化ではないため
  HTTPS 前提（Vercel は既定で HTTPS を強制しており、この前提は既に満たされている）。
- **定数時間比較（D-5）**: `crypto.timingSafeEqual` は Edge Runtime で利用できないため
  自前実装する。**SHA-256 ダイジェスト（常に 32 バイト）へ正規化してから比較する。**
  当初案は上限 256 文字の固定長ループだったが、これは資格情報が 256 文字を超えたとき
  末尾を比較せず、先頭 256 文字と長さが一致するだけで通してしまう切り詰めバグを持つ
  （Orchestrator レビューで検出・差し替え）。ダイジェスト比較なら入力長によらず
  比較対象が 32 バイト固定になり、切り詰めと長さ依存の両方が同時に消える。
  `crypto.subtle` は Edge Runtime で利用できる。
- **fail-closed の判定基準（D-3）**: `NODE_ENV` で判定し、`VERCEL_ENV` では判定しない。
  理由: Vercel の Preview デプロイも `NODE_ENV=production` で動作する。もし
  `VERCEL_ENV === 'production'` で判定していたら、Preview デプロイでは環境変数が
  未設定でも認証がスキップされてしまい、Preview URL が事実上無防備な穴になる。
  `NODE_ENV` 判定であれば Preview も本番と同様に fail-closed の対象になり、
  この穴は生じない。
- **UTF-8 パスワードの正しい復号**: `atob` は Latin-1 の 1 バイト = 1 文字として
  デコードするため、そのまま文字列比較すると UTF-8 マルチバイト文字（日本語パスワード等）
  で破綻する。`atob → Uint8Array.from(binary, c => c.charCodeAt(0)) → TextDecoder().decode()`
  の経路を通すことで、バイト列として正しく UTF-8 デコードできる（B-02）。
- **401 と 503 の情報漏洩最小化**: 401 は「認証が必要」であることのみを伝え、
  ユーザー名・パスワードのどちらが間違っているかは伝えない。503 はアプリの構成不備を
  外部に伝えるが、これは意図的な fail-closed の帰結であり、無防備公開よりましと判断する
  （ADR-0021 で記録する判断）。
- **cron の扱い**: `api/cron/*` を Basic 認証の対象外にしても、`cron.ts` が
  `Authorization: Bearer $CRON_SECRET` で独立に保護しているため、この経路は無防備には
  ならない（要件 N-04）。
- **Web Push への影響（D-7）**: `/api/push/*` は認証済みページ（ブラウザ）からの fetch
  であり、ブラウザは同一オリジンへの Basic 資格情報を自動的に再送する。通知の送信自体
  （サーバー → FCM）は cron 経路であり Basic 認証と無関係。**残るリスク**: 通知クリックで
  standalone PWA が起動する際、ブラウザ/OS のセッション・資格情報保存状態によっては
  Basic 認証ダイアログが再表示される可能性がある。追加実装では対応せず、2 名の利用者への
  周知で対応する（要件定義書「後方互換性・データ移行」参照）。
- **既存セキュリティヘッダとの関係**: `apps/web/next.config.ts` の `securityHeaders`
  （`X-Frame-Options` 等）とは独立した仕組みであり、競合しない。

## 性能

L3 だが、性能セクションを厚く書くトリガー条件（外部 I/O 新設・大量データ集計クエリ・
明示された性能要件）のいずれにも該当しないため、簡潔に記載する。

- 新設する処理は Edge Runtime 上でのヘッダ読み取り・base64 デコード・SHA-256 ダイジェスト
  2 本の算出と 32 バイト比較のみであり、DB・外部 API 呼び出しは無い。追加レイテンシは 1 リクエストあたり
  ミリ秒未満と推定される（計測はしていないため確定値ではない。実装後に Vercel の
  Function 実行時間で確認推奨）。
- `_next/static` 等を matcher で除外していること自体が、静的アセット配信への
  Edge Function 起動コストを避ける主な性能上の狙いである（D-2）。

## テスト方針

実装フェーズ（test-designer / 実装担当）への引き継ぎ観点。本タスクではテストコードは
作成しない。

- 保護対象パス（例: `/`, `/api/pantry`）へ資格情報なしでアクセス → 401 と
  `WWW-Authenticate` ヘッダを確認。
- 正しい資格情報 → 200 系の応答を確認。
- 誤った資格情報（ユーザー名のみ違う／パスワードのみ違う／両方違う） → いずれも 401。
- 除外パス（`manifest.webmanifest` / `sw.js` / `favicon.ico` / `icons/*` /
  `api/cron/expiry-alerts`）→ Basic 認証ヘッダなしでも 401 にならないことを確認。
  `api/cron/*` は `CRON_SECRET` 側の既存テストと合わせて確認する。
- 本番相当（`NODE_ENV=production`）で環境変数未設定 → 503（コンテンツ本文が返らないこと
  も確認）。
- 開発相当（`NODE_ENV=development`）で環境変数未設定 → 認証なしで通ること
  （Playwright の `pnpm dev` 経路が壊れないことの確認に相当）。
- UTF-8 パスワード（日本語等）での認証成功を確認（B-02 の回帰防止）。
- 定数時間比較の実装が長さの異なる入力でも一定のループ回数になっていること
  （コードレビューでの確認。タイミング計測による自動テストは実施しない）。
- 既存の Vitest（Hono ルートテスト等）・Playwright E2E は D-4 の結論どおり変更不要だが、
  上記の新規観点は `apps/web/tests/` 配下に middleware 用のテストを追加する
  （配置は既存の `tests/` ミラー構成に従う）。

## 移行とリリース

1. Vercel の Production 環境変数に `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` を登録する。
   Preview 環境でも手動確認を行う場合は同様に登録する（D-3 により Preview も
   `NODE_ENV=production` で fail-closed の対象になるため、確認目的で Preview を使うなら
   Preview 環境にも登録が必要）。
2. `apps/web/.env.example` に両変数のプレースホルダを追記する（値は書かない。
   `CRON_SECRET` の既存記載形式に揃える）。
3. `apps/web/src/middleware.ts` を実装し、デプロイする。
4. 本番 URL に対して実機確認する: ブラウザで認証ダイアログが出る／正しい資格情報で
   通る／`manifest.webmanifest` が 401 にならず PWA のインストールが壊れていない／
   既存 PWA インストール済み端末（2 名分）で再認証できる。
5. 実機確認が完了して初めて GitHub リポジトリを private → public に切り替える
   （逆順にすると無防備な窓が開くため禁止。要件定義書「後方互換性・データ移行」参照）。
6. `docs/decisions/ADR-0003-no-auth-in-mvp1.md` に `Superseded by ADR-0021` 相当の追記を行う
   （既存の旧形式 `**ステータス**: 採択` を書き換えて無かったことにせず、記録として残す）。
7. 新規 `docs/decisions/ADR-0021-<タイトル>.md` を作成し、本設計書の決定事項
   （D-1〜D-8）を判断の記録として残す。
   手順 6・7 の ADR 本体作成は本タスクのスコープ外（別工程）。

CI への影響: `apps/web/playwright.config.ts` の `webServer.command` は `pnpm dev`
（`NODE_ENV=development`）であり、D-3 によりこの環境では環境変数未設定でも認証が
スキップされる。よって Playwright の `webServer.url` への疎通確認（`baseURL` への
成功応答待ち）は 401/503 の影響を受けず、既存の待機ロジックのまま動く。
`.github/workflows/ci.yml` の E2E ジョブも同じ `pnpm dev` 経路（`playwright.config.ts` 経由）
のため変更不要である（D-4、変更なし）。

## リスク

- **PWA 再認証時の UX 低下**: 通知クリックからの起動時に認証ダイアログが再表示される
  可能性がある（残るリスク、D-7）。2 名運用のため周知で対応し、追加実装はしない。
- **matcher 正規表現の記法リスク**: Next.js 16.2.12 の matcher 実装依存の記法差異により、
  設計書の提案どおりに動かない可能性がある（API 設計節に記載の確認推奨事項）。実装時に
  実機確認を必須とする。
- **Preview 環境の運用負荷**: Preview デプロイでも `NODE_ENV=production` になるため、
  Preview を使った手動確認をする場合は Preview にも環境変数登録が要る。登録を忘れると
  Preview が常に 503 になる（意図した fail-closed であり、これ自体はバグではないが、
  運用手順として周知が必要）。
- **移行順序の運用ミス**: 移行手順（環境変数登録 → デプロイ・実機確認 → public 化）の
  順序を誤ると、public 化後に無防備な時間帯が生じる。手順の明記（本書「移行とリリース」）
  で対応する。

## 未決事項

- ADR-0021 の本文作成タイミング（本設計書確定後、別工程で作成する前提で良いか）を
  Orchestrator 経由でユーザーに確認する。
- 通知クリックからの再認証（残るリスク）について、周知以上の追加対応
  （例: Push 通知の deep link を認証除外にする等）が必要かどうかは、実機確認後に
  Orchestrator が判断する。
- matcher の正規表現の妥当性は `pnpm build` の成功（Next.js がビルド時に静的検証する）で
  確認する。**実挙動は単体テストでは担保しない** — 単体テストが評価するのは matcher 文字列を
  素の `RegExp` にしたもので、Next.js が実際に生成する正規表現とは別物だからである。
  実挙動の正解判定は本番相当サーバ（`next start`）への black-box 確認で行う
  （試験計画「Orchestrator 判断」節）。構造テストはパターン文字列のタイプミス検出として残す。
