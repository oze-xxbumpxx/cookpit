# セキュリティレビュー: expiry-alert（Sprint 8 Unit B / 設計フェーズ）

- レビュー日: 2026-08-09 / 対象: 設計成果物のみ（プロダクションコード 0 件を実測確認）
- 実測に使ったファイル: `apps/web/src/server/app.ts` / `apps/web/src/server/repositories.ts` /
  `apps/web/src/server/routes/health.ts` / `apps/web/src/db/client.ts` /
  `apps/web/src/app/api/[[...route]]/route.ts` / `apps/web/next.config.ts` /
  `apps/web/package.json` / `.gitignore` / `package.json` / `pnpm audit` 実行結果
- 判定: **Critical 0 / High 2 / Medium 4 / Low 5**。実装着手をブロックするのは High 2 件のみ。

## Critical

なし。

## High

### H-1. 無認証 `POST /api/push/subscribe` の受容根拠が論理的に誤っている（第三者が世帯の在庫名ダイジェストを受信できる）

- 対象: `docs/designs/expiry-alert.md` §API 設計・§セキュリティ、`docs/designs/expiry-alert.contract.md` §1.1、`docs/decisions/ADR-0017-web-push-expiry-alert.md`「悪い影響 / 残るリスク」
- 問題: 設計書は無認証 subscribe の受容根拠を「`endpoint` は推測困難な URL だから実務上のリスクは小さい」としている。しかし **`endpoint` の推測困難性は「登録」を防がない**。攻撃者は自分のブラウザ（またはスクリプト）で正規の Push 購読を作れば、自分の `endpoint` / `p256dh` / `auth` を持っている。しかも購読作成に必要な `applicationServerKey` は `GET /api/push/vapid-public-key` が**無認証で公開している**。したがって手順は「アプリ URL を知る → 公開鍵を GET → 自分で購読を作る → POST /subscribe」だけで、`endpoint` を一切推測せずに `push_subscriptions` に自分の行を追加でき、以後の日次ダイジェスト（在庫の表示名・件数を含む）を毎日受信できる。件数上限も無いため、行の無制限追加（DB 肥大・Cron の並列送信数増大）も同じ経路で成立する。
  - 「アプリ URL は 2 人しか知らない」も強い前提ではない。`*.vercel.app` のホスト名は証明書透明性ログから列挙されうる（一般的事実。本プロジェクトで実測はしていない）。
  - 推測困難性が有効に効くのは **unsubscribe（他人の購読の削除）** と **なりすまし送信** に対してであり、そちらは実際に低リスク（下記「確認済み」参照）。根拠の適用先が 1 つずれている。
- 根拠: 設計書の `vapid-public-key` は無認証、`subscribe` は zValidator のみで所有者チェック無し、`findAll()` の全購読へ一律配信。ADR-0017 の残るリスク一覧に本経路の記載が無いこと。
- 修正案（ADR-0003 を覆さない範囲で）:
  1. `SubscribeToExpiryAlertUseCase` に**購読件数の上限**を入れる（例: 既存行が上限 N 件以上かつ新規 `endpoint` なら `InvalidOperationError` → 422）。N=10 程度なら 2 人・数台の運用を阻害しない。upsert 経路（既存 `endpoint` の再登録）は上限の対象外にする。
  2. 検知の運用化: cron ハンドラが既に `console.log('expiry-alerts cron result', result)` で `subscriptionCount` を出しているので、「想定台数を超えたら購読テーブルを確認する」を試験計画 §10 の事後確認と実装計画のリリース後チェックに 1 行追加する。
  3. 設計書 §セキュリティと ADR-0017「残るリスク」の文言を修正する。**根拠の記述だけでも必ず直すこと** — 誤った根拠が残ると下流（Unit C・Sprint 9）が同じ論法を再利用する。

### H-2. `.gitignore` が `.env.production` 等をカバーしておらず、新規に増える 2 つの秘密の誤コミット経路が開いている

- 対象: `.gitignore`（実測。`.env` / `.env.local` / `.env.*.local` の 3 行のみ）、設計書 §移行とリリース、ADR-0017 §Migration
- 問題: `.env.production` / `.env.development` / `.env.test` / `.env.preview` は**追跡対象のまま**。本ユニットは秘密情報を `DATABASE_URL` 1 つから 3 つ（`VAPID_PRIVATE_KEY` / `CRON_SECRET` / 場合により `VAPID_SUBJECT` のメールアドレス）へ増やし、ADR-0017 自身が「`.env.example` も検証層も無い」と認識しているのに、**設計成果物のどこにも `.gitignore` / `.env.example` の整備が入っていない**。秘密の誤コミットは事後の rotate では完全には取り返せない（Git 履歴・fork・CI ログに残る）。
- 修正案: 実装 PR に以下を含める。コスト 3 行。

  ```
  # .gitignore
  .env*
  !.env.example
  ```

  加えて `.env.example` を新設し、**キー名とフォーマット注記のみ**（値は空）を置く:
  `DATABASE_URL=` / `VAPID_PUBLIC_KEY=` / `VAPID_PRIVATE_KEY=` /
  `VAPID_SUBJECT=  # mailto: か https:// のみ（罠 8）` /
  `CRON_SECRET=  # openssl rand -base64 32` / `TZ=Asia/Tokyo`。
  これは罠 4・罠 5・ADR-0017 の「設定が失われる」懸念への直接的な対処も兼ねる。

## Medium

### M-1. `endpoint` が攻撃者制御の任意 HTTPS URL で、サーバが Cron 実行時にそこへ POST する（blind SSRF、1 ビットのオラクル付き）

- 対象: 契約設計書 §3.1 `pushEndpointSchema` / §4.1、設計書の `WebPushSender.send`
- 問題: 契約設計の `.max(2048)` + `https://` 限定は妥当な方向だが、**宛先ホストは無制限**。H-1 のとおり誰でも登録できるので、任意の HTTPS エンドポイント（社内ネットワーク・クラウドのメタデータ相当・第三者サイト）へ、Vercel Function から VAPID JWT 付きの POST を毎日 1 回撃たせられる。レスポンス本文はクライアントへ返らないため blind だが、**404/410 かどうかが `removedCount` に反映されるので 1 ビットの応答オラクルになる**。Vercel の実行環境から内部アドレスへ到達できるかは未確認（**推測**: マネージド環境なので到達範囲は限定的と思われるが、断定しない）。VAPID JWT は `aud` が宛先オリジンに束縛されるため転用は困難で、公開鍵自体も公開情報のため、鍵漏洩の追加リスクは小さい。
- 修正案（トレードオフを提示。判断は Orchestrator / ユーザー）:
  - 案 A（推奨・軽量）: `hostname` が IP リテラル（IPv4 / IPv6）でないこと、`localhost` / `.local` / `.internal` で終わらないことだけを弾く。誤拒否リスクほぼゼロ。
  - 案 B（強い）: 既知 Push Service のホスト許可リスト（`fcm.googleapis.com` / `*.push.services.mozilla.com` / `web.push.apple.com` / `*.notify.windows.com`）。将来のブラウザ・新 Push Service で**正規ユーザーの購読を誤って拒否する**リスクがあるため、採るなら環境変数で追加ホストを許す逃げ道を併設すること。
  - **どちらを採るにせよ、判定は `new URL(value).hostname` で行い、文字列の前方一致・`includes` を使わないこと**（`https://evil.example@fcm.googleapis.com/x` や `https://fcm.googleapis.com.evil.example/x` を通してしまう）。
  - 置き場所: Zod の `refine` に入れると api-contract がホスト名の知識を持つことになるが、既存の `store.schema.ts` の防御的上限と同じ「アプリ境界の検証」として許容範囲。Application 層に置く選択肢もある。

### M-2. `CRON_SECRET` の強度要件が「ランダムな秘匿文字列」としか書かれておらず、レート制限も無い

- 対象: 実装計画 Step 7、設計書 §移行とリリース、試験計画 §10-1
- 問題: `GET /api/cron/expiry-alerts` は公開エンドポイントで、401 に対する回数制限・ロックアウトが無い（Hono の `.use(` 0 件を実測、レート制限ミドルウェアも当然無い）。したがって**総当たりが唯一の現実的な攻撃**であり、その成否は `CRON_SECRET` のエントロピー**のみ**に依存する。手順書が長さ・生成方法を指定していないと、人手で短い文字列が設定される。突破されると任意タイミングで Push を再送させられる（通知スパム）。
- 修正案: 実装計画 Step 7 と試験計画 §10-1 の「値の形式」欄に `openssl rand -base64 32`（256 bit）を明記。あわせて「Vercel は `CRON_SECRET` 環境変数が設定されているとき Cron 実行に `Authorization: Bearer $CRON_SECRET` を自動付与する」というプラットフォーム仕様への依存を明文化しておくと、設定漏れ時の 401 連発を切り分けやすい。

### M-3. Preview Deployment に本番同等の VAPID 鍵 / `CRON_SECRET` を置く手順になっており、Preview URL の公開性と噛み合っていない

- 対象: 試験計画 §10-1（環境変数の準備チェックリスト）・§10-3 手順 7、設計書 P-11
- 問題: Vercel の Preview Deployment は Deployment Protection を有効にしていない限り URL を知る者は誰でもアクセスできる。H-1 と組み合わさると、Preview に置いた鍵で誰でも購読を登録できる。さらに手順 7 は手動 `curl` に `CRON_SECRET` の実値を使うため、シェル履歴・CI ログ・`logs/` 配下の作業記録へ実値が転記される経路がある（本プロジェクトは `logs/` に作業記録を残す運用）。
- 修正案:
  1. Preview では**本番とは別の VAPID 鍵ペアと別の `CRON_SECRET`** を発行し、検証完了後に破棄する旨を §10-1 に明記。
  2. `curl` は `-H "Authorization: Bearer $CRON_SECRET"` の形でシェル変数を参照し、**実値を `docs/` / `logs/` / PR 本文に貼らない**ことを §10-3 手順 7 に注記。
  3. 可能なら Preview に Vercel Deployment Protection を有効化する（ただし手動 `curl` に bypass token が必要になり手順が増えるトレードオフあり。Cron 自体は Production デプロイに対してのみ実行されるので Cron 側への影響は無い）。

### M-4. `p256dh` / `auth` の下限が `min(1)` のため、復号不能な購読行が永久に残る（失効検知に乗らない）

- 対象: 契約設計書 §3.1 / §4.2、設計書の `WebPushSender.send`
- 問題: 契約は文字集合（base64url）と上限のみを課し、下限は 1 文字。RFC 8291 上、`p256dh` は非圧縮 P-256 公開鍵 65 バイト固定、`auth` は 16 バイト固定であり、**可変長ではない**。長さが不正な鍵を登録すると、`web-push` の暗号化処理が**送信前に**例外を投げる（**推測**: `web-push` は 65 バイト / 16 バイトを検証して throw するが、当該バージョンの挙動は未確認）。この例外は `WebPushSender` の `catch` で `statusCode` を持たないため `reason: 'other'` に落ち、設計上 `'other'` は**購読を削除しない**。結果、その行は 404/410 を返す機会が永遠に来ないため**恒久的に残り、毎日必ず失敗する**。H-1 と組み合わせると意図的に大量投入できる。
  - 契約書 §4.2 の「完全一致長にしない理由（ブラウザ実装差・将来の鍵長変更）」は、P-256 固定という仕様の前提を踏まえると弱い。将来 P-384 等が導入されるなら `web-push` 側の対応と同時になるため、そのとき契約を緩めればよい。
- 修正案:
  1. `p256dh` を `.min(86).max(88)`、`auth` を `.min(22).max(24)`（パディング有無・実装差を吸収した幅）にする。より厳密にやるなら `refine` で `Buffer.from(v, 'base64url').length === 65` / `=== 16` を検証する（api-contract は Node 前提ではないため、幅指定のほうが無難）。
  2. 併せて `SendExpiryAlertsUseCase` 側で「同じ `endpoint` が繰り返し `'other'` で失敗する場合の扱い」を将来課題として設計書の申し送りに 1 行残す（本ユニットでは実装不要）。

## Low

### L-1. Bearer 比較の定数時間化（契約書 §12 項目 7 への回答）

- 対象: 設計書の cron ルート、契約設計書 §12 項目 7
- **判定: この規模・脅威モデルでは対策不要。実装をブロックしない。** 根拠は 3 点。(1) 比較対象はサーバレス関数の中で、コールドスタート・ネットワークジッタ（ms 級）がバイト単位の差（ns 級）を完全に覆い隠す。(2) 統計的に必要なリクエスト数が非現実的で、それだけ撃てるならレート制限が無い以上 **M-2 の総当たりのほうが遥かに効率的**。つまり優先すべきは秘密の長さであって比較方法ではない。(3) 漏洩時の被害は「通知の再送」であり、データの読み書きではない。
- それでも入れる場合の修正案（3 行、副作用なし）: `crypto.timingSafeEqual` は**長さが違うと throw する**ため生の値同士を渡さないこと。両者を `createHash('sha256').update(x).digest()` して固定長にしてから比較する。

### L-2. `app.onError` の `console.error(err)` 経由で `endpoint` がサーバログに出うる

- 対象: `apps/web/src/server/app.ts`（実測）、設計書 §セキュリティ
- 問題: Postgres の一意制約違反等のエラーは `detail` に `Key (endpoint)=(https://fcm.googleapis.com/...) already exists.` の形で**値そのもの**を含むことがあり、それが Vercel の実行ログへ出る。設計が `endpoint` を「事実上の秘匿情報」と位置づけている以上、記述と実挙動が整合しない（ログ閲覧権限は Vercel プロジェクトのメンバーに限られるため実害は小さい）。
- 修正案: 本ユニットでは**コード対処不要**（既存 `onError` を変更しない方針は妥当）。設計書 §セキュリティに「`endpoint` は秘匿情報として扱うが、DB エラー時に Vercel の実行ログへ出うる。ログ閲覧権限の範囲内に留まることを前提に受容する」と 1 行の但し書きを入れて整合させること。

### L-3. `sw.ts` の `notificationclick` が Push ペイロード由来の URL を無検証で `clients.openWindow()` に渡す

- 対象: 設計書 §変更後構成 Presentation の `sw.ts`
- 問題: ペイロードを注入するには VAPID 秘密鍵**かつ**当該購読の `p256dh` / `auth` が必要なので、現実の攻撃経路は無い（サーバ側が既に侵害されている場合のみ）。ただし `event.data?.json() as {...}` は型検証をしておらず、`data.url` が外部サイトでもそのまま `openWindow` する。多層防御として安価。
- 修正案: `url` が `/` で始まる相対パスであることだけ確認してから `openWindow`（違えば `/` にフォールバック）。`title` / `body` も `typeof === 'string'` を確認する。`event.data?.json()` は不正 JSON で throw しうる点も併せて try/catch する。

### L-4. `https://` 判定が文字列前方一致で大小文字を区別する

- 対象: 契約設計書 §3.1 `pushEndpointSchema`
- 問題: `HTTPS://fcm.googleapis.com/...` を拒否する（URL スキームは本来大小文字非依存）。実ブラウザは小文字を返すため実害はほぼ無いが、**M-1 でホスト検証を足す場合は文字列一致では確実に穴が開く**。
- 修正案: `refine` の中身を `try { return new URL(value).protocol === 'https:' } catch { return false }` にする（Zod の pinned バージョンが `z.url({ protocol: ... })` を持つならそちらでもよい。バージョン差の確認は implementer に委ねる）。

### L-5. `Cache-Control: no-store` の明示が無い

- 対象: 設計書の push / cron ルート
- 問題: Next.js 16 の Route Handler は既定で動的、かつ cron は `Authorization` ヘッダ付きなので中間キャッシュの対象になりにくい（**未検証**）。実害は想定しにくいが、cron 応答は在庫件数を含む。
- 修正案: 両ルートの応答に `c.header('Cache-Control', 'no-store')` を付ける。1 行。

## 確認済み・問題なし（後続は再検証不要）

1. **VAPID 秘密鍵のクライアント露出経路は無い。** (a) `vapid-public-key` ハンドラは `process.env.VAPID_PUBLIC_KEY` のみ返す。(b) 秘密鍵を読むのは `apps/web/src/server/repositories.ts` の `pushSender()` と `packages/infrastructure` の `WebPushSender` だけで、いずれもサーバ実行経路。(c) 変数名に `NEXT_PUBLIC_` 接頭辞が無いため Next.js はクライアントバンドルへ値をインライン化しない（リポジトリ・設計成果物を grep して `NEXT_PUBLIC` 0 件を実測）。(d) 罠 4 / R-4 として設計書にも明記済み。**Nice**: `apps/web/src/server/repositories.ts` の先頭に `import 'server-only'` を足すと構造的に固定できる（現状リポジトリ全体で `server-only` の使用は 0 件を実測）。
2. **SQL インジェクションは無い。** Repository 実装案は Drizzle のクエリビルダ（`eq` / `inArray` / `onConflictDoUpdate`）のみ。生 `sql` タグの使用箇所は `set: { p256dh: sql\`excluded.p256dh\` }`の 2 か所（定数式・外部入力なし）と既存`health.ts`の`sql\`SELECT 1\`` のみで、文字列連結は存在しない。
3. **検証済み型の貫通に穴は無い。** `subscribe` / `unsubscribe` は `zValidator('json', ...)` を通り、`c.req.valid('json')` の値だけが UseCase に渡る。未検証の `string` が UseCase へ届く経路は設計上存在しない（cron はボディを取らず、`Authorization` はインライン `if` で消費される）。
4. **P-12 のフェイルクローズは内部情報を漏らしていない。** クライアントへ返るのは固定文字列 `{ error: 'Server misconfigured' }` のみで、変数名・値・スタックを含まない。サーバ側 `console.error('VAPID_PUBLIC_KEY is not configured')` も**変数名のみ**で値を含まない。「設定済みか否か」が外部から観測できる点は残るが、公開鍵は公開情報なので実害なし。契約書 §5-3 のチェック順序（未設定 → 500 が Bearer 比較より先）はフェイルクローズとして正しい。
5. **設計上のログに購読情報は出ない。** 明示されたログは cron の `console.log('expiry-alerts cron result', result)`（整数 4 つのみ）と設定不備の 2 メッセージだけ。`endpoint` / `p256dh` / `auth` を意図的に出力する箇所は無い（間接経路は L-2 のみ）。`WebPushSender` の `catch` も `statusCode` しか読まず、エラーオブジェクトをログしない。
6. **Push ペイロードの機微度は妥当。** 在庫の表示名と件数のみ。`showNotification` の `body` はプレーンテキストとして扱われ HTML 解釈されないため、在庫名経由の XSS は成立しない。
7. **認証ミドルウェアの掛け忘れは無い（該当概念が存在しない）。** `apps/web/src/server/app.ts` を実測し、既存 7 ルート + 新規 2 ルートいずれも ADR-0003 に従い無認証、cron のみインライン `if` で保護という設計どおり。`.use(` を導入しない方針は既存 0 件の実測と整合。将来認証を足す際の差し込み箇所が `app.ts` の `.route()` 群の直前 1 か所に集約されている構造も維持されている。
8. **`unsubscribe` による他人の購読削除・なりすまし送信のリスクは低い。** 削除には正確な `endpoint`（Push Service 発行の高エントロピー URL）が必要で、これは推測困難性の根拠が**正しく効く**ケース。仮に削除されても影響は「通知が止まる」だけで、再購読で復旧する。なりすまし送信には VAPID 秘密鍵と購読鍵の両方が必要。
9. **cron を `GET` にする判断は妥当。** 契約書 §1.2 の 3 点に加え、ブラウザからのクロスオリジン `fetch` で `Authorization` を付けるとプリフライトが要求され、CORS ミドルウェアが存在しない（`.use(` 0 件）ため成功しない。CSRF 的な誤発火経路は無い。
10. **Cookie / CSP。** 本ユニットは Cookie を一切導入しない（購読状態はブラウザの `PushManager` 側が保持）。`apps/web/next.config.ts` に既存のセキュリティヘッダ 5 種（`X-Content-Type-Options` / `X-Frame-Options: DENY` / `Referrer-Policy` / `X-DNS-Prefetch-Control` / `Permissions-Policy`）を実測。**CSP は未設定**だが、これは本ユニット以前からの状態で、本ユニットが悪化させるものではない（スコープ外。CSP 導入は別タスクとして申し送り）。
11. **後方互換・既存ルートへの影響。** `app.ts` は `.route()` 2 行の追加のみで `onError` 不変。既存ルートの認可状態・エラー形を変えない。

## 依存パッケージ

`pnpm audit` 実測（2026-08-09 実行）: **9 件（high 4 / moderate 3 / low 2）**。

| 重大度      | パッケージ         | 経路                                              | 修正版      | 本ユニットへの影響                                                                                                                                                                                                        |
| ----------- | ------------------ | ------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| high ×3     | `brace-expansion`  | `apps/web > eslint > minimatch > brace-expansion` | `>=1.1.18`  | **なし**（dev 依存・ランタイム非搭載）。DoS 3 件                                                                                                                                                                          |
| high ×1     | `js-yaml`          | `apps/web > eslint > @eslint/eslintrc > js-yaml`  | `>=5.2.2`   | **なし**（dev 依存）                                                                                                                                                                                                      |
| moderate ×3 | `hono` 4.12.33     | `apps/web > hono`                                 | `>=4.12.34` | `memo()` の SSR 出力がリクエスト間で残る情報漏洩 / Language ミドルウェア ReDoS / Proxy ヘルパー。**3 件とも該当機能を本コードベースは使用していない**（`hono/jsx` の memo・languageDetector・proxy いずれも未使用を確認） |
| low ×2      | `esbuild` / `hono` | dev / 未使用機能                                  | —           | なし                                                                                                                                                                                                                      |

- **Should（本ユニット起因ではないが着手前に済ませると安い）**: `apps/web` の `hono` は `^4.12.33` なので `pnpm update hono` で 4.12.34 以上に上がる。本ユニットは Hono ルートを 2 本増やすため、増やす前に上げておくのが順序として自然。
- **Nice（別タスク）**: ルート `package.json` の `pnpm.overrides` に既に `brace-expansion` と `js-yaml` の指定があるのに、eslint 配下の 1.x / 5.x 系には範囲が合っておらず効いていない。override の範囲指定を見直せば high 4 件が消える。本ユニットのスコープ外。
- **`web-push`（新規追加）について — 以下は推測を含み、実測ではない**:
  - 未導入なので `pnpm audit` の結果には現れない。**現時点で「脆弱性が無い」とは言えない。**
  - `web-push`（web-push-libs）は Node の Web Push 実装として事実上の標準で広く使われているが、**メンテナンスの活発さは時期によって波がある**という認識（学習時点の知識であり、現在のリリース頻度・未修正 advisory の有無は確認していない）。HTTP クライアント / JWT 系の推移的依存を持つ。
  - **必須の申し送り**: 実装計画の依存追加ステップに「`pnpm add web-push` 直後に `pnpm audit` を再実行し、`web-push` 配下の推移的依存に high/critical が出ないことを確認する。出た場合は `pnpm.overrides` で解決するか Orchestrator へ差し戻す」を追記すること。
  - 追加先が `packages/infrastructure/package.json` である点（ADR-0017 Rollback 手順 6 と一致）と、型定義（`@types/web-push` が必要かどうか）の確認も実装計画に入れること。

## 契約設計書 §12「security-reviewer の確認事項」への直接回答

| §12 項目                                   | 回答                                                                                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. `endpoint` の `.max(2048)` + HTTPS 限定 | 方向は妥当だが**不十分**。SSRF の観点でホスト検証が無い（M-1）。判定を文字列前方一致でやっている点も要修正（L-4）                                                                                   |
| 2. `p256dh` / `auth` の base64url 正規表現 | 文字集合の制約は**妥当**（ブラウザは RFC 4648 §5 のパディング無し base64url を返す）。ただし下限が `min(1)` のため復号不能な行が恒久的に残る（M-4）。RFC 8291 で鍵長は固定なので長さも絞ってよい    |
| 7. Bearer 比較の定数時間化                 | **この規模・脅威モデルでは不要**と判断（L-1）。優先度は `CRON_SECRET` のエントロピー確保（M-2）のほうが上。入れる場合は SHA-256 ダイジェスト同士の `timingSafeEqual`（生値だと長さ差で throw する） |
| 9. `web-push` の追加                       | **追加後の再 `pnpm audit` を条件に承認**。現時点の脆弱性有無は未確認（上記のとおり推測を含む）                                                                                                      |

## 実装着手前に必須の対応（Must）

1. **H-1**: 設計書 §セキュリティ / ADR-0017「残るリスク」の根拠の記述を修正（+ 購読件数上限の要否を Orchestrator / ユーザーが判断）。
2. **H-2**: `.gitignore` の `.env*` 化 + `.env.example` の新設を実装計画に追加。

## 着手前に判断が必要（Should — トレードオフのためユーザー確認推奨）

- **M-1**: SSRF 対策を案 A（IP リテラル / 内部ホスト拒否）と案 B（許可リスト）のどちらにするか。
- **M-4**: `p256dh` / `auth` の長さ制約を厳密化するか（契約書 §4.2 の判断を覆すため）。
- **M-2 / M-3**: 実装計画と試験計画 §10-1 への文言追加（判断不要・追記のみ）。
