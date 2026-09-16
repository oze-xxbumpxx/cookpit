# ADR-0021: リポジトリ公開にあたり本番を Basic 認証で保護する

- Status: Accepted
- Date: 2026-09-16
- 関連 feature: public-release-basic-auth

## Context（背景・なぜ判断が必要か）

GitHub リポジトリ `oze-xxbumpxx/cookpit` を private から public にしたいという要望が出た。

公開監査（2026-09-15 実施。`logs/2026-09-15.md`）の結果、リポジトリの中身には問題が無い。
全 175 コミット・全 ref・追跡ファイル 1207 件を走査し、秘密鍵・トークン・API キー・認証情報
付き接続文字列のいずれも検出されなかった。`.env` は履歴上一度もコミットされていない。

問題はリポジトリの中身ではなく、**公開が本番アプリの防御を消してしまう**ことだった。

[ADR-0003](./ADR-0003-no-auth-in-mvp1.md) は MVP1 を認証なしで運用すると決めており、その
安全性の根拠を決定理由 5「**Vercel URL の推測難度はそこそこ高い**」に置いている。つまり現在の
唯一の防御は URL の秘匿（security by obscurity）である。公開するとこれが 2 重に破れる。

1. 本番 URL `https://cookpit-web.vercel.app` がリポジトリ内に平文で存在する
   （`ADR-0019-db-transaction-uow.md:70` / `docs/designs/store-limit-and-render-performance.md:27,424`
   / `logs/2026-08-13.md:188,195,247`）。
2. **仮にそれらを消しても無意味である。** リポジトリ名 `cookpit` と Vercel プロジェクト名
   `cookpit-web` から URL はほぼ自明に導ける。git 履歴の書き換えも防御にならない。

そして `apps/web/src/server/routes/` は無認証のフル CRUD（GET 12 / POST 19 / PUT 5 / DELETE 6）で、
`middleware.ts` も認証処理も存在しなかった。公開した時点で第三者が在庫・献立・買い物リスト・
レシピを閲覧も編集も削除もできる状態になる。

ADR-0003 は「URL がバレた場合に第三者が編集できる（家庭内利用なので実害は小さい）」を
ネガティブな帰結として受け入れていたが、公開は「バレるかもしれない」ではなく
**確定で URL が導けるようになる**変更であり、前提そのものが成立しなくなる。

## Decision（採用した決定）

**本番アプリを HTTP Basic 認証で保護する。** `apps/web/src/middleware.ts` を新規作成し、
環境変数 `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` による Basic 認証を全ページと
`/api/*`（`/api/cron/*` を除く）に掛ける。利用者は引き続き 2 名で、資格情報は 1 組を共有する。

設計上の主な決定（詳細は設計書 D-1〜D-8）:

- **Edge Runtime のまま `node:crypto` に依存しない。** Basic ヘッダの復号は
  `atob` → `Uint8Array.from` → `TextDecoder` の経路で行い、UTF-8 のパスワードも正しく扱う。
- **定数時間比較は SHA-256 ダイジェスト（常に 32 バイト）へ正規化してから行う。**
  当初案の「上限 256 文字の固定長ループ」は、資格情報が 256 文字を超えたとき末尾を比較せず、
  先頭 256 文字と長さが一致するだけで通してしまう切り詰めバグを持っていた（レビューで検出）。
  ダイジェスト比較なら入力長によらず比較対象が固定長になり、切り詰めと長さ依存が同時に消える。
- **fail-closed の判定は `NODE_ENV === 'production'` で行い、`VERCEL_ENV` では判定しない。**
  Vercel の Preview デプロイも `NODE_ENV=production` で動くため、`NODE_ENV` 判定なら Preview も
  保護対象に入る。`VERCEL_ENV === 'production'` で判定すると、環境変数が未設定の Preview URL が
  素通りして事実上無防備な穴になる。
- **`/manifest.webmanifest` は認証対象から除外する。** ブラウザは manifest を credentials
  無しで取得するため、保護すると 401 になり PWA のインストールが壊れる。内容は app 名・説明・
  アイコンのみで、リポジトリ公開後は誰でも読める情報である。
- **`/api/cron/*` は除外する。** Vercel Cron は Basic 認証ヘッダを送れない。ここは
  `apps/web/src/server/routes/cron.ts` が既に `Authorization: Bearer $CRON_SECRET` で
  自前保護しており、除外しても無防備にはならない。

## Alternatives（検討した非採用案と却下理由）

### A. Vercel Deployment Protection

Vercel ダッシュボードの設定のみで完結し、コード変更がゼロで済む。

却下理由: Hobby プランで使えるのは Vercel Authentication であり、閲覧者に Vercel アカウントと
チーム所属を要求する。2 人利用の相手側（パートナー）に Vercel アカウント作成を強いることになり、
「家庭内の共有メモに近い感覚で使う」という ADR-0003 の利用像を壊す。Password Protection は
Pro プラン限定で、月額費用が発生する。

### B. Better Auth の導入

ADR-0003 が「Phase 2 以降の本命」として挙げていた解。

却下理由: 変更レベル L3 でスコープが過大。userId をドメインモデルに持ち込まないとする
[ADR-0004](./ADR-0004-no-user-in-domain.md) との整合も再検討が必要になる。公開のために
必要な保護水準は「2 名以外を排除する」ことであり、個人を識別する認証はまだ要らない。
将来 Phase 2 で必要になった時点で本 ADR を置き換えればよい。

### C. Vercel プロジェクト名を推測困難な名前に変更する

コード変更ゼロで、ADR-0003 の「URL 秘匿」という前提をそのまま維持できる。旧 URL は解決
しなくなるため、git 履歴に残る旧 URL も無害になる。

却下理由: 防御が obscurity のままである点は変わらない。今後ログや設計書に本番 URL を書くたび
（実際 `logs/2026-08-13.md` は実測のため URL を記録している）再露出のリスクが戻る。公開
リポジトリで運用を続ける以上、秘匿に依存しない防御へ移すべきと判断した。

### D. 公開しない（現状維持）

却下理由: 公開したいという要望そのものを満たさない。

## Consequences（良い影響・悪い影響・残るリスク）

### ポジティブ

- 防御が「URL を知られないこと」から「資格情報を持つこと」へ移り、リポジトリ公開と
  本番の安全性が切り離される。以後、ログや設計書に本番 URL を書いても危険ではなくなる。
- Preview デプロイも同時に保護される（`NODE_ENV` 判定の副次的な利得）。
- 環境変数が未設定のまま本番へ出ても 503 で閉じるため、設定漏れが「無防備な公開」に
  ならない。

### ネガティブ

- 2 名とも初回アクセス時に ID/PW の入力が必要になる。ホーム画面に追加済みの PWA も同様。
- ログアウト手段が無い（Basic 認証の性質）。
- 資格情報の共有・更新を運用で管理する必要が生じる。

### 残るリスク

- 通知クリックから standalone PWA を起動した際、セッションによっては再認証ダイアログが
  出る可能性がある。実機確認で挙動を確かめる。
- Basic 認証は資格情報を毎リクエスト base64 で送る方式であり、暗号化ではない。HTTPS が前提だが、
  Vercel は既定で HTTPS を強制しているため前提は満たされている。
- Preview 環境に環境変数を登録しない場合、Preview URL は 503 になり画面確認に使えなくなる。
  安全側の挙動だが、Preview を使う運用なら登録が必要。
- **CSRF が新たに意味を持つようになった。** 認証なしの頃は API 全体が誰でも叩けたため
  CSRF という概念自体が無意味だったが、Basic 認証はブラウザが資格情報を自動付与する
  ambient authority であり、クロスサイトからの書き込みが理屈の上では成立する
  （セキュリティレビュー SEC-6）。現状の緩和は ① JSON ボディを取る POST が
  **いずれも必須項目を持つスキーマ**であり、`application/json` 以外の content-type では
  `zValidator('json', ...)` がボディを空オブジェクトとして扱うため必須項目不足で 400 になる
  ② ボディ不要の POST 3 本はいずれも推測不可能な UUID を要する
  ③ PUT / DELETE は preflight が必要で CORS ヘッダ未設定のため遮断される、の 3 点。
  **① はフレームワークが content-type を拒否しているのではない**点に注意する。Hono の
  json validator は content-type が一致しないと検証をスキップして空オブジェクトのまま進む
  （hono 4.13.1 + @hono/zod-validator 0.9.0 で再現確認済み。全項目が任意のスキーマなら
  `text/plain` でも 200 が返る）。したがって**全項目が任意のボディを取る POST を将来追加すると
  この緩和は成立しなくなる**。
  2 名利用では実際には起きないと判断して受容するが、`hono/csrf` の導入は将来の選択肢として残す。
- 総当たりに対する試行回数制限・ロックアウトが無く、401 を意図的にログしないため検知手段も
  無い。公開後の防御は `BASIC_AUTH_PASSWORD` のエントロピーに全面的に依存する
  （セキュリティレビュー SEC-3 / SEC-4）。`.env.example` に生成方法を明記した。
- `next@16.2.12` に critical 2 件、`hono@4.13.1` に moderate 3 件の既知脆弱性がある
  （`pnpm audit` で確認）。本変更は `/_next/image` を意図的に認証除外するため、公開後は
  `next` の Image Optimization API が無認証で到達可能になる。現構成では
  `images.remotePatterns` が未設定でアップロード機能も無く悪用可能とは判断していないが、
  バージョン更新は公開前に検討する（セキュリティレビュー SEC-1 / SEC-11。別タスク）。

## Migration（移行手順）

**順序が重要である。逆順にすると無防備な窓が開く。**

1. Vercel の Production 環境変数に `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` を登録する。
   Preview でも画面確認を行うなら Preview 環境にも登録する。
2. `middleware.ts` を含むコードをデプロイする。
3. 本番 URL に対して実機確認する。認証ダイアログが出ること、正しい資格情報で通ること、
   `manifest.webmanifest` が 401 にならず PWA のインストールが壊れていないこと、
   既存 PWA インストール済み端末（2 名分）で再認証できること。

   **matcher は Vercel 本番で必ず再確認する。** ローカルの `next start` は
   `middleware-route-matcher` が `new RegExp()` で matcher を評価するが、Vercel 本番では
   同じ正規表現文字列を Vercel の proxy 層が別のエンジンで評価する。文字列は同じでも
   エンジンが同じとは限らないため、ローカルでの確認は本番の保証にならない
   （セキュリティレビュー SEC-2）。本番 URL に対して次の 6 本を確認する。

   | パス                                | 期待                                                      |
   | ----------------------------------- | --------------------------------------------------------- |
   | `/`                                 | 401                                                       |
   | `/api/pantry`                       | 401                                                       |
   | `/manifest.webmanifest`             | 200                                                       |
   | `/_next/static/...`（実在アセット） | 200                                                       |
   | `/api/cron/expiry-alerts`           | 401 だが `WWW-Authenticate` が付かない（cron 自身の判定） |
   | `/api/cron/..%2fpantry`             | 401 か 404。200 が返るならパス正規化の穴                  |

4. **実機確認が完了して初めて** GitHub リポジトリを private → public に切り替える。
5. 公開後、GitHub 側の設定を有効化する（Secret scanning + Push protection、Actions の
   「Require approval for all external contributors」、`main` の branch protection）。

## Rollback（決定を戻す場合の手順）

`apps/web/src/middleware.ts` を削除して再デプロイすれば、認証なしの状態に即時復帰する。

ただし**リポジトリが public のままなら、これは無防備な状態への復帰**である点に注意する。
戻す場合はリポジトリを private に戻すことをセットで行う。

環境変数だけを削除した場合は本番が 503（fail-closed）になり、「保護なしでの復旧」にはならない。
緊急時は資格情報の再登録を優先し、ファイル削除は最終手段とする。

## References

- [ADR-0003: MVP1 は認証なしで運用する](./ADR-0003-no-auth-in-mvp1.md) — 本 ADR が前提を置き換える対象
- [ADR-0004: ドメインに User を持ち込まない](./ADR-0004-no-user-in-domain.md) — 案 B の却下理由に関連
- `docs/requirements/public-release-basic-auth.md`
- `docs/designs/public-release-basic-auth.md`
- `docs/implementation-plans/public-release-basic-auth.md`
- `docs/tests/public-release-basic-auth.md`
- `logs/2026-09-15.md` — 公開可否の監査結果
