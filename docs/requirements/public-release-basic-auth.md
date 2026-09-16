# 要件定義: public-release-basic-auth

- task-id / 変更レベル: public-release-basic-auth / L3（判定理由: 認証・認可の変更）
- 作成日: 2026-09-16

## 背景

GitHub リポジトリ `oze-xxbumpxx/cookpit` を private から public にしたい。前セッションの
監査（`logs/2026-09-15.md`）で、コード・git 履歴（175 コミット）に秘密情報の混入は無いことを
確認済み。唯一のブロッカーは、公開によって本番アプリの防御が消えることである。

`docs/decisions/ADR-0003-no-auth-in-mvp1.md` は MVP1 を認証なしで運用すると決め、その安全性の
根拠を決定理由 5「Vercel URL の推測難度はそこそこ高い」に置いている。つまり現在の唯一の防御は
URL の秘匿（security by obscurity）。リポジトリを public にすると次の 2 点でこの前提が崩れる。

1. 本番 URL `https://cookpit-web.vercel.app` がリポジトリ内に平文で存在する
   （`docs/decisions/ADR-0019-db-transaction-uow.md:70` /
   `docs/designs/store-limit-and-render-performance.md:27,424` /
   `logs/2026-08-13.md:188,195,247`）。
2. 仮に該当箇所を消しても無意味。リポジトリ名 `cookpit` / Vercel プロジェクト名
   `cookpit-web` から URL はほぼ自明に導ける。git 履歴の書き換えも防御にならない。

`apps/web/src/server/routes/` は無認証のフル CRUD（GET 12 / POST 19 / PUT 5 / DELETE 6、
`health.ts` / `meal-plans.ts` / `pantry.ts` / `products.ts` / `push.ts` / `recipes.ts` /
`shopping-lists.ts` / `stores.ts` の 8 ルートファイル。`cron.ts` は既に Bearer 認証で保護済み）
であり、`apps/web/src/proxy.ts`（旧称 `middleware.ts`）は存在しない。公開時点で第三者が在庫・献立・
買い物リスト・レシピを閲覧も編集も削除もできる状態になる。

## 目的

GitHub リポジトリを public 化しても、本番アプリのユーザーデータ（在庫・献立・買い物リスト・
レシピ）を第三者が閲覧・編集・削除できないようにする。実装は HTTP Basic 認証による
アプリ全体保護とし、MVP1 のスコープ（2 名の家庭内利用）を超えない最小構成とする。

## ユーザー要求（原文の要約）

- リポジトリを public にしたい。ブロッカーは本番アプリの無認証状態のみ（コード・履歴の
  秘密情報混入は別セッションで確認済み・対象外）。
- Basic 認証による保護を新設する。実装方式・除外パス・fail-closed 挙動・比較方法・
  401 応答・ADR 方針は Orchestrator が既に確定済み（本文書は成果物化が目的）。

## 機能要件

- F-01 `apps/web/src/proxy.ts`（Next.js 16 の `proxy` 規約。`middleware` 規約は deprecated）を
  新規作成し、HTTP Basic 認証を掛ける。ランタイムに依存しない Web 標準 API のみで書き、
  `node:crypto` に依存しない。
- F-02 `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` の両方が設定されている場合、対象パスへの
  すべてのリクエストで Basic 認証を要求する。
- F-03 資格情報の検証は定数時間比較で行い、ユーザー名・パスワードの長さの差からも
  情報が漏れないようにする。
- F-04 保護対象から次を除外する: `_next/static/`・`favicon.ico`・`icons/`・
  `manifest.webmanifest`・`sw.js`・`api/cron/*`。`_next/image`・`workbox-*.js` は除外しない
  （当初案に含まれていたが PR #202 レビューで削除。理由は設計書 D-2）。
- F-05 認証失敗時は `401` を返し、`WWW-Authenticate: Basic realm="Cookpit", charset="UTF-8"`
  と `Cache-Control: no-store` を付与してブラウザに認証ダイアログを出させる。
- F-05b fail-closed の `503` にも `Cache-Control: no-store` を付与する。設定不備による 503 が
  共有キャッシュに載ると、環境変数を直した後も障害が続きうるため（セキュリティレビュー SEC-9）。
- F-06 `apps/web/.env.example` に `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` を追記する。
  パスワードの生成方法と、ユーザー名に `:` を含めない制約（RFC 7617）も併記する。

## 非機能要件（性能・セキュリティ・可用性など。無ければ「対象外」）

- セキュリティ: URL 秘匿（security by obscurity）から Basic 認証への防御方式の切り替え。
  資格情報比較はタイミング攻撃対策として定数時間比較を用いる（詳細は設計書「セキュリティ」節）。
- 可用性: 環境変数未設定時、本番では fail-closed（503 でコンテンツを一切出さない）とし、
  「保護漏れで無防備公開」より「一時的にアプリが使えない」を優先する。
- 性能: 新設する処理は Proxy 上のヘッダ検査のみで、DB・外部 I/O を伴わない。
  性能設計の追加観点なし（本タスクの L3 判定理由は「認証・認可の変更」であり、
  `docs/designs/<feature-name>.md` の性能セクションのトリガー条件
  ［外部 I/O 新設／大量データ集計クエリ／明示された性能要件］のいずれにも該当しない）。

## 正常系

- N-01 `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` が両方設定済みの本番環境で、正しい資格情報
  を付けてページ・API（cron 以外）にアクセスすると通常どおり応答が返る。
- N-02 PWA として端末にインストール済みの利用者が、資格情報をブラウザ/OS の認証情報保存
  機能で保持したまま利用を継続できる（初回のみ認証ダイアログ）。
- N-03 `manifest.webmanifest` / `sw.js` / アイコン / `favicon.ico` は認証なしで取得できる
  （PWA インストール・Service Worker 登録が壊れない）。
- N-04 Vercel Cron からの `GET /api/cron/expiry-alerts` は Basic 認証の対象外であり、
  既存の `CRON_SECRET` による Bearer 認証がそのまま機能する。
- N-05 開発環境（`pnpm dev` = `NODE_ENV=development`）では環境変数未設定でも認証はスキップ
  され、開発者はローカルで従来どおり作業できる。

## 異常系

- E-01 資格情報未入力・誤入力でページ・API（cron 以外）にアクセスすると `401` が返り、
  `WWW-Authenticate` ヘッダによりブラウザの認証ダイアログが再表示される。
- E-02 本番環境（`NODE_ENV=production`）で `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` の
  いずれかが未設定の場合、保護対象パスへのすべてのリクエストが `503` となり、
  コンテンツは一切返さない（fail-closed）。
- E-03 Preview デプロイ（`VERCEL_ENV=preview` だが `NODE_ENV=production`）で環境変数が
  未設定の場合も E-02 と同様に fail-closed とする（`VERCEL_ENV` ではなく `NODE_ENV` で
  判定するため。理由は設計書「セキュリティ」節参照）。

## 境界条件（null・空・上限/下限・権限境界）

- B-01 `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` が空文字列の場合は「未設定」と同義に扱う
  （`cron.ts` の既存実装が `undefined || ''` を未設定判定にしている前例に揃える）。
- B-02 パスワードに UTF-8 マルチバイト文字（例: 日本語）を含む場合でも、
  `atob → Uint8Array.from → TextDecoder` の経路で正しく復号され、比較できる。
- B-03 `Authorization` ヘッダが無い、または `Basic ` プレフィックスでない、または
  base64 デコードに失敗する場合は認証失敗（`401`）として扱う（例外を投げて 500 にしない）。
- B-04 保護除外パスと保護対象パスの境界は matcher の否定 lookahead で判定する
  （設計書「バックエンド設計」節の matcher 定義を正とする）。
- B-05 権限境界: 資格情報は 2 名の利用者で共有する 1 組のみ。利用者ごとの ID 分離・
  権限差は無い（ADR-0004 のとおりドメインに `userId` を持ち込まないため、Basic 認証も
  単一の共有アカウントに留める）。

## 前提

- 利用者は引き続き 2 名（開発者本人とパートナー）。
- 本番デプロイ先は Vercel（プロジェクト `cookpit-web`）。Next.js 16.2.12。
- コード・git 履歴に秘密情報の混入が無いことは別セッションの監査で確認済み
  （`logs/2026-09-15.md`）。本タスクの対象外。

## 制約

- Domain / Application 層への影響は無い。変更は Presentation 層
  （`apps/web/src/proxy.ts` 新設）と環境変数・ドキュメント、および `playwright.config.ts` の
  `httpCredentials` 追加のみ。
- `node:crypto` はランタイム依存を避けるため使用しない（Web Crypto の `crypto.subtle` を使う）。
- Vercel Hobby プラン。Deployment Protection は非採用（後述）。

## 対象範囲

- `apps/web/src/proxy.ts` の新規設計（実装はコード変更禁止のためこのタスクでは行わない）。
- `apps/web/.env.example` への環境変数追記の設計。
- `docs/decisions/ADR-0003-no-auth-in-mvp1.md` への追記方針、および新規 ADR-0021 作成方針
  （ADR 本体の作成自体は別工程）。
- CI（`.github/workflows/ci.yml` / `apps/web/playwright.config.ts`）への影響評価。

## 対象外

- リポジトリの private → public 切り替え作業そのもの（GitHub 側の操作）。
- コード・git 履歴の秘密情報スキャン（監査済み・別セッション）。
- Better Auth 等の本格的な認証基盤導入（非採用案として後述）。
- Vercel Deployment Protection の導入（非採用案として後述）。
- ドメインモデルへの `userId` 導入（ADR-0004 の方針を維持し対象外）。
- ADR-0021 本体の作成（設計書に方針を記すのみ。ADR 作成は別工程）。

## 後方互換性・データ移行

- 既存の PWA 利用者は 2 名（開発者本人・パートナー）で、いずれもホーム画面にアプリを
  追加済みである。Basic 認証導入後、次回起動時にブラウザ/OS レベルの認証ダイアログが
  表示され、資格情報を入力すれば以降は保存された資格情報で自動的に再認証される
  （データ移行は発生しない。DB スキーマ変更も無い）。
- 導入順序（安全な移行手順。逆順は無防備な窓を開けるため不可）:
  1. `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` を Vercel の Production 環境変数に登録する。
  2. デプロイし、本番 URL に対して実機（ブラウザ・PWA 双方）で認証が効くことを確認する
     （認証ダイアログが出る／正しい資格情報で通る／`manifest.webmanifest` が 401 にならず
     PWA が壊れていないこと）。
  3. 実機確認が完了して初めて GitHub リポジトリを public にする。
  - 逆順（先に public 化）にすると、URL がリポジトリ内外から到達可能になった後も
    アプリは無防備なままの時間帯が生じるため禁止する。
- Web Push（`/api/push/*`）は認証済みページからのブラウザ呼び出しであり、Basic 資格情報が
  自動付与されるため機能に影響しない。通知クリックからの standalone PWA 起動時、
  セッション状態によっては再認証ダイアログが出る可能性があり、これは「残るリスク」として
  設計書に記載する（利用者 2 名への周知で対応、追加実装は不要）。

## 受け入れ条件（Definition of Done に対応）

- AC-01 `apps/web/src/proxy.ts` の設計が F-01〜F-05 を満たす形で
  `docs/designs/public-release-basic-auth.md` に記述されている。
- AC-02 matcher の除外パス一覧と各除外理由が設計書に明記されている（D-2 のとおり）。
- AC-03 環境変数未設定時の fail-closed 判定が `NODE_ENV` 基準であり、`VERCEL_ENV` を
  使わない理由（Preview も `NODE_ENV=production` で動くため）が設計書に明記されている。
- AC-04 CI（`playwright.config.ts` の `webServer` / `ci.yml`）への影響評価と
  「変更不要」の結論・理由が設計書に明記されている。
- AC-05 定数時間比較の方針（長さの差からも情報が漏れない実装）が設計書に明記されている。
- AC-06 ADR-0021 新規作成方針、および ADR-0003 への `Superseded by ADR-0021` 相当の
  追記方針が設計書に明記されている（ADR 本体の作成は別工程）。
- AC-07 移行手順（環境変数登録 → 実機確認 → public 化の順序）が本要件書・設計書双方に
  明記されている。
- AC-08 非採用案（Vercel Deployment Protection / Better Auth / プロジェクト名変更）と
  その理由が本要件書に記載されている。

## 未決事項（誰に何を確認するか）

- 資格情報（`BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` の実際の値）は誰がいつ Vercel に
  登録するか。実装・登録作業は本タスクの範囲外（設計書確定後、実装担当・ユーザー確認が
  必要な運用タスク）。
- ADR-0021 の本文作成タイミング（本設計書確定後に別工程で作成する前提で良いか）を
  Orchestrator 経由でユーザーに確認する。
- 通知クリックからの再認証ダイアログ（残るリスク）について、利用者への周知以上の
  追加対応（例: Push 通知の deep link を認証除外にする等）が必要かどうかは、
  実機確認の結果を見て Orchestrator 判断とする。

## 非採用案と理由（要件レベルの記録）

- **Vercel Deployment Protection**: Hobby プランでは閲覧者（パートナー）に Vercel アカウント
  作成・ログインが必要になり、2 人利用の相手側に負担がかかる。非採用。
- **Better Auth 導入**: L3 としてもスコープ過大（ユーザーテーブル・セッション管理が新設される）。
  ADR-0004「userId をドメインに持ち込まない」との整合を再検討する必要があり、
  MVP1 の合意（ADR-0003）から段階的に踏み出す判断はこのタスクの範囲を超える。非採用。
- **Vercel プロジェクト名の変更**: security by obscurity のままであり、本質的な防御にならない。
  今後もログ・docs に URL を書くたびに再露出するため、恒久的な対策にならない。非採用。
