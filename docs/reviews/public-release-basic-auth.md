# レビュー記録: public-release-basic-auth

<!-- review-readiness:begin -->
<!-- prettier-ignore-start -->

<!-- review-readiness:state
{
  "schemaVersion": 1,
  "feature": "public-release-basic-auth",
  "status": "human_review_requested",
  "reviewTier": "R3",
  "subject": {
    "algorithm": "git-raw-v1",
    "baseSha": "c0c50d14b75893e257bb590bae03fb5b534dcfc0",
    "digest": "sha256:09052e26cc7182c45c878ddf2c1e0c7cb02d1f315135b826edc44897d207cfca",
    "source": "commit",
    "entryCount": 21
  },
  "aiAssessment": {
    "blockingOpen": 0,
    "highImpactUnverified": 0,
    "followUpOpen": 3
  },
  "humanItems": [
    {
      "id": "H-01",
      "kind": "irreversible",
      "question": "Vercel の本番環境変数登録と実機確認、および ADR-0021 が追加した「本番での matcher 再確認 6 本」を終えるまでリポジトリを public にしない、という順序をそのまま実行しますか？",
      "recommendation": "accept。順序を守れば無防備な公開時間帯は生じない。いつ環境変数を登録し、いつ公開へ切り替えるかは AI が代行できない不可逆の運用操作。",
      "evidenceRefs": [
        "EV-02",
        "EV-07",
        "EV-08"
      ]
    },
    {
      "id": "H-02",
      "kind": "unknown",
      "question": "通知クリックからの PWA 起動時に再認証ダイアログが出る可能性を、実装追加なし（2 名への周知のみ）で受け入れますか？",
      "recommendation": "accept_risk。挙動はブラウザ / OS の資格情報保存に依存し実機でしか確認できない。この環境では再現できず、受容判断は利用者本人にしか下せない。",
      "evidenceRefs": [
        "EV-02"
      ]
    },
    {
      "id": "H-03",
      "kind": "subjective",
      "question": "next@16.2.12 の critical 助言 2 件を更新しないまま公開しますか（A: 公開前に next を更新する / B: 公開後の別タスクにする）？",
      "recommendation": "accept_risk（B）。2 件は Windows ホスト限定と画像最適化の AVIF 経路で、Vercel(Linux) かつ外部ドメイン許可も AVIF 画像も無い現構成では到達経路が無い。ただし更新を公開前に置くかは risk appetite の問題で AI が代わりに決められない。",
      "evidenceRefs": [
        "EV-05"
      ]
    }
  ],
  "residualRisks": [
    "Vercel 本番の proxy が matcher 正規表現を next start とは別エンジンで評価する可能性がある。ローカル black-box の結果は本番の保証にならず、ADR-0021 の移行手順で公開前に 6 本を再確認する前提で受容する。",
    "通知クリックからの PWA 起動時の再認証挙動は実機未確認。2 名への周知で対応する方針のまま受容する。",
    "本番の資格情報は未登録のため、middleware を含むコードを先にデプロイすると本番は一時的に 503 になる。移行手順の順序で回避する前提で受容する。",
    "Basic 認証の導入で CSRF が意味を持つようになった。現行の JSON ボディ POST は全て必須項目を持つため実質通らないが、将来「全項目が任意」のボディを足すとクロスサイト書き込みが通る。条件は ADR-0021 に明記したうえで hono/csrf 未導入のまま受容する。",
    "画像最適化のパスだけは認証除外のため、公開後も無認証で到達する。現構成では外部ドメイン許可も AVIF 画像も無く悪用経路が無いと判断し、next の更新までこのまま受容する。"
  ],
  "behaviorChanges": [
    "本番サイトを開くとブラウザ標準の ID / パスワード入力を求められ、正しく入力するまで画面もデータも表示されない。",
    "資格情報を付けずに API を直接呼んでも内容は返らず、認証を求める応答だけが返る。",
    "除外対象の名前に前方一致するだけのアドレス（`/sw.js/api/pantry` `/favicon.icofoo` など）も認証を求められるようになった。今回の修正前はこれらが認証をすり抜けていた。",
    "ホーム画面に追加済みの PWA は初回起動時に一度だけ認証を求められる。アイコン・マニフェスト・Service Worker は従来どおり取得でき、期限アラートの定期配信も従来どおり動く。",
    "本番で資格情報の環境変数が未設定だと、アプリ全体が一時的に利用できなくなる（内容を一切返さず、その応答もキャッシュされない）。"
  ],
  "evidence": [
    {
      "id": "EV-01",
      "claim": "middleware の単体テスト 49 件が通る。8f29e34 / 3dac8bd はドキュメントのみの変更で、apps と packages に差分は無い",
      "kind": "test",
      "result": "pass",
      "ref": "pnpm exec vitest run --project node tests/middleware.node.test.ts: 49 passed（2026-09-16 再実行）/ git diff --name-only 38b683e HEAD はすべて docs と README"
    },
    {
      "id": "EV-02",
      "claim": "本番相当サーバで、除外名に前方一致するだけの 6 パターンが 401 へ変わり、除外対象（manifest / favicon / _next/static / sw.js / icons / _next/image）と cron は従来どおり素通りする",
      "kind": "black_box",
      "result": "pass",
      "ref": "Orchestrator 提供の検証済み事実: next start + curl 13 ケース全一致（2026-09-16。以後コード変更なし）"
    },
    {
      "id": "EV-03",
      "claim": "N-01 は解消。修正前の matcher 文字列は docs から消え、設計書 113 行・229 行と実装計画 68 行の 3 箇所が middleware.ts:94 と完全一致する",
      "kind": "static",
      "result": "pass",
      "ref": "grep -rn 'workbox-\\.\\*' docs/ は docs/reviews（引用）以外にヒットなし。新パターンの 3 箇所を実装と文字列比較"
    },
    {
      "id": "EV-04",
      "claim": "N-02 は解消。ADR-0021 の訂正後の CSRF 記述（content-type 不一致は空オブジェクト扱いで必須項目不足の 400。全項目任意なら成立しない）が Hono の実挙動と一致する",
      "kind": "counterfactual",
      "result": "pass",
      "ref": "hono 4.13.1 + @hono/zod-validator 0.9.0 の再現: 必須項目ありは text/plain で 400、全項目 optional は text/plain で 200。ADR-0021:117-128 と突き合わせ"
    },
    {
      "id": "EV-05",
      "claim": "next@16.2.12 の critical 助言 2 件は Windows ホスト限定の RCE と画像最適化の AVIF 経路であり、Vercel(Linux) かつ remotePatterns 未設定・AVIF 配置なしの現構成では到達経路が無い",
      "kind": "static",
      "result": "pass",
      "ref": "pnpm audit --json（2026-09-16。vulnerable >=16.0.0 <16.3.3）と apps/web/next.config.ts / public の突き合わせ。apps/web/package.json は next 16.2.12 のまま"
    },
    {
      "id": "EV-06",
      "claim": "今回の訂正から漏れた記述が 2 箇所ある。試験計画の完了条件が MW-M01〜MW-M11 のままで同書 67 / 172 / 190 行の MW-M12 と食い違い、振り返りメトリクスの follow-up 件数と PRE_EXISTING 件数が 0 のまま",
      "kind": "static",
      "result": "pass",
      "ref": "docs/tests/public-release-basic-auth.md:229-230 と docs/claude-code/improvements/metrics/public-release-basic-auth.yml:25-26,38"
    },
    {
      "id": "EV-07",
      "claim": "修正後の matcher が Next.js 16.2.12 のビルド時静的検証を通り、middleware が成果物に載る",
      "kind": "production_like",
      "result": "pass",
      "ref": "Orchestrator 提供の検証済み事実: pnpm --filter @cookpit/web build 成功（matcher 変更後に再実行。以後コード変更なし）"
    },
    {
      "id": "EV-08",
      "claim": "N-03 は解消。README:10 と 01-overview:13 は未来形へ訂正され、GitHub リポジトリは 2026-09-16 時点でまだ private である",
      "kind": "black_box",
      "result": "pass",
      "ref": "GitHub API GET /repos/oze-xxbumpxx/cookpit が private: true を返す（2026-09-16 再実行）。README.md:10 / docs/01-overview.md:13 の現物確認"
    }
  ],
  "reviewer": {
    "agent": "reviewer",
    "model": "claude-opus-5",
    "reviewedAt": "2026-09-16T10:50:00.000Z"
  }
}
-->
## Review handoff

> **人間レビュー待ちです。**
> Claude の評価です。これは承認ではありません。以下の判断事項・残余リスク・振る舞い差分を確認してください。
> 対象: `sha256:09052e26cc71…` / R3 / 21 changes

### あなたが判断・確認すること（3 件）

1. **[不可逆] Vercel の本番環境変数登録と実機確認、および ADR-0021 が追加した「本番での matcher 再確認 6 本」を終えるまでリポジトリを public にしない、という順序をそのまま実行しますか？** — 推奨: accept。順序を守れば無防備な公開時間帯は生じない。いつ環境変数を登録し、いつ公開へ切り替えるかは AI が代行できない不可逆の運用操作。 / 証拠: EV-02, EV-07, EV-08
2. **[未知] 通知クリックからの PWA 起動時に再認証ダイアログが出る可能性を、実装追加なし（2 名への周知のみ）で受け入れますか？** — 推奨: accept\_risk。挙動はブラウザ / OS の資格情報保存に依存し実機でしか確認できない。この環境では再現できず、受容判断は利用者本人にしか下せない。 / 証拠: EV-02
3. **[主観] next@16.2.12 の critical 助言 2 件を更新しないまま公開しますか（A: 公開前に next を更新する / B: 公開後の別タスクにする）？** — 推奨: accept\_risk（B）。2 件は Windows ホスト限定と画像最適化の AVIF 経路で、Vercel\(Linux\) かつ外部ドメイン許可も AVIF 画像も無い現構成では到達経路が無い。ただし更新を公開前に置くかは risk appetite の問題で AI が代わりに決められない。 / 証拠: EV-05

### 残余リスク・未確認

- Vercel 本番の proxy が matcher 正規表現を next start とは別エンジンで評価する可能性がある。ローカル black-box の結果は本番の保証にならず、ADR-0021 の移行手順で公開前に 6 本を再確認する前提で受容する。
- 通知クリックからの PWA 起動時の再認証挙動は実機未確認。2 名への周知で対応する方針のまま受容する。
- 本番の資格情報は未登録のため、middleware を含むコードを先にデプロイすると本番は一時的に 503 になる。移行手順の順序で回避する前提で受容する。
- Basic 認証の導入で CSRF が意味を持つようになった。現行の JSON ボディ POST は全て必須項目を持つため実質通らないが、将来「全項目が任意」のボディを足すとクロスサイト書き込みが通る。条件は ADR-0021 に明記したうえで hono/csrf 未導入のまま受容する。
- 画像最適化のパスだけは認証除外のため、公開後も無認証で到達する。現構成では外部ドメイン許可も AVIF 画像も無く悪用経路が無いと判断し、next の更新までこのまま受容する。

### 振る舞い差分

- 本番サイトを開くとブラウザ標準の ID / パスワード入力を求められ、正しく入力するまで画面もデータも表示されない。
- 資格情報を付けずに API を直接呼んでも内容は返らず、認証を求める応答だけが返る。
- 除外対象の名前に前方一致するだけのアドレス（\`/sw.js/api/pantry\` \`/favicon.icofoo\` など）も認証を求められるようになった。今回の修正前はこれらが認証をすり抜けていた。
- ホーム画面に追加済みの PWA は初回起動時に一度だけ認証を求められる。アイコン・マニフェスト・Service Worker は従来どおり取得でき、期限アラートの定期配信も従来どおり動く。
- 本番で資格情報の環境変数が未設定だと、アプリ全体が一時的に利用できなくなる（内容を一切返さず、その応答もキャッシュされない）。

### 証拠

| ID | 主張 | 種別 | 結果 | 参照 |
| --- | --- | --- | --- | --- |
| EV-01 | middleware の単体テスト 49 件が通る。8f29e34 / 3dac8bd はドキュメントのみの変更で、apps と packages に差分は無い | test | pass | pnpm exec vitest run --project node tests/middleware.node.test.ts: 49 passed（2026-09-16 再実行）/ git diff --name-only 38b683e HEAD はすべて docs と README |
| EV-02 | 本番相当サーバで、除外名に前方一致するだけの 6 パターンが 401 へ変わり、除外対象（manifest / favicon / \_next/static / sw.js / icons / \_next/image）と cron は従来どおり素通りする | black\_box | pass | Orchestrator 提供の検証済み事実: next start + curl 13 ケース全一致（2026-09-16。以後コード変更なし） |
| EV-03 | N-01 は解消。修正前の matcher 文字列は docs から消え、設計書 113 行・229 行と実装計画 68 行の 3 箇所が middleware.ts:94 と完全一致する | static | pass | grep -rn 'workbox-\\.\\\*' docs/ は docs/reviews（引用）以外にヒットなし。新パターンの 3 箇所を実装と文字列比較 |
| EV-04 | N-02 は解消。ADR-0021 の訂正後の CSRF 記述（content-type 不一致は空オブジェクト扱いで必須項目不足の 400。全項目任意なら成立しない）が Hono の実挙動と一致する | counterfactual | pass | hono 4.13.1 + @hono/zod-validator 0.9.0 の再現: 必須項目ありは text/plain で 400、全項目 optional は text/plain で 200。ADR-0021:117-128 と突き合わせ |
| EV-05 | next@16.2.12 の critical 助言 2 件は Windows ホスト限定の RCE と画像最適化の AVIF 経路であり、Vercel\(Linux\) かつ remotePatterns 未設定・AVIF 配置なしの現構成では到達経路が無い | static | pass | pnpm audit --json（2026-09-16。vulnerable &gt;=16.0.0 &lt;16.3.3）と apps/web/next.config.ts / public の突き合わせ。apps/web/package.json は next 16.2.12 のまま |
| EV-06 | 今回の訂正から漏れた記述が 2 箇所ある。試験計画の完了条件が MW-M01〜MW-M11 のままで同書 67 / 172 / 190 行の MW-M12 と食い違い、振り返りメトリクスの follow-up 件数と PRE\_EXISTING 件数が 0 のまま | static | pass | docs/tests/public-release-basic-auth.md:229-230 と docs/claude-code/improvements/metrics/public-release-basic-auth.yml:25-26,38 |
| EV-07 | 修正後の matcher が Next.js 16.2.12 のビルド時静的検証を通り、middleware が成果物に載る | production\_like | pass | Orchestrator 提供の検証済み事実: pnpm --filter @cookpit/web build 成功（matcher 変更後に再実行。以後コード変更なし） |
| EV-08 | N-03 は解消。README:10 と 01-overview:13 は未来形へ訂正され、GitHub リポジトリは 2026-09-16 時点でまだ private である | black\_box | pass | GitHub API GET /repos/oze-xxbumpxx/cookpit が private: true を返す（2026-09-16 再実行）。README.md:10 / docs/01-overview.md:13 の現物確認 |

<details>
<summary>AI assessment</summary>

- blocking open: 0
- high-impact unverified: 0
- follow-up open: 3
- reviewer: reviewer / claude-opus-5
- reviewed at: 2026-09-16T10:50:00.000Z

</details>

<!-- prettier-ignore-end -->
<!-- review-readiness:end -->

## 監査ログ

### Task 1: L3 成果物と実装の整合性レビュー（2026-09-16）

対象: `ed8e785`〜`a7e454e`（12 entry / digest `sha256:ec74147a8519…`）。
review tier は **R3**（成果物 Level L3 と同番。trigger: 認証の新設・`apps/web` の全経路に効く
横断的関心事・公開前提の不可逆な運用判断を含む）。
security 専門観点は並行実施の security-reviewer に委ね、本レビューは整合性と品質に絞った。

未解消の BLOCK は 0 件。以下はいずれも今回の受け入れを止めない。

| ID   | action       | impact | evidence | status   | path:line                                                | 根拠・再現                                                                                                                                                                                                                                                                                                                  | 修正案                                                                       |
| ---- | ------------ | ------ | -------- | -------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| F-01 | FOLLOW_UP    | medium | E1       | open     | `docs/designs/public-release-basic-auth.md` ほか（下表） | 定数時間比較の方式差し替えと matcher 検証方法の具体化が、設計書・実装計画へ部分的にしか反映されていない。詳細 4 件は下の「F-01 の内訳」参照。**38b683e で a・c は解消。b・d は未解消のまま Task 2 の N-01 へ継承**                                                                                                          | 下表の 4 箇所を実装・試験計画の確定内容に合わせる                            |
| F-02 | FOLLOW_UP    | low    | E2       | resolved | `apps/web/tests/middleware.node.test.ts:117-141,195-215` | 要件 E-02 は「いずれかが未設定」を条件にするが、production での**非対称**ケース（片方だけ設定）を通すテストが無い。MW-12 は `NODE_ENV=development`、MW-13 は両方空、MW-19/20/23 は両方未設定。実装計画のケース 11 が試験計画で落ちている。**38b683e の MW-19b（2 ケース）で解消**（EV-01 で再実行確認）                     | `BASIC_AUTH_USER` のみ設定 + `NODE_ENV=production` → 503 を 1 ケース追加する |
| F-03 | FOLLOW_UP    | low    | E1       | resolved | `docs/03-architecture.md:49-77,213` ほか（下表）         | 本変更に伴う周辺ドキュメントの更新漏れと事実誤り。詳細 5 件は下の「F-03 の内訳」参照。**38b683e で a〜e すべて解消**。件数訂正値 GET 12 / POST 19 / PUT 5 / DELETE 6 は本レビューで再集計し一致を確認（EV-03。Task 1 が報告した POST 18 のほうが誤りだった）                                                                | 恒久記録（ADR-0021・アーキテクチャ）を優先して訂正する                       |
| I-01 | 情報         | low    | E1       | resolved | `apps/web/src/middleware.ts:62`                          | 設計の疑似実装に無い `console.error` を実装が追加している。設計「ログと監視」節および実装計画の手順 2 が明示的に要求したものであり、資格情報を出力しないことを検証するテストもある（妥当な逸脱・報告漏れではない）                                                                                                          | 対応不要                                                                     |
| I-02 | PRE_EXISTING | low    | E1       | resolved | `docs/decisions/ADR-0017-*.md`                           | `ADR-0017-review-readiness-as-decision-interface.md` と `ADR-0017-web-push-expiry-alert.md` の採番衝突。本タスクのスコープ外の既知事項で、ADR-0021 の採番自体は空き番であり衝突しない。**2026-09-17 に review-readiness 側を [ADR-0022](../decisions/ADR-0022-review-readiness-as-decision-interface.md) へ振り直して解消** | 別タスクで採番を整理する                                                     |

#### F-01 の内訳（成果物の陳腐化）

| #   | path:line                                                                                                               | 内容                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | `docs/designs/public-release-basic-auth.md:315`                                                                         | 性能節だけが旧方式「固定長 256 回の文字コード比較」のまま。同書のセキュリティ節（278-283）・ADR-0021・実装は SHA-256 ダイジェスト 32 バイト比較。旧方式の記述が残るのはここ 1 箇所のみ（他成果物は全て差し替え済み）                        |
| b   | `docs/designs/public-release-basic-auth.md:122-124,331-333,376-378`                                                     | matcher の検証方法が「実機確認」のまま。特に 331-333 の「除外パスが 401 にならないことを単体テストで確認」と 396-397 の「実挙動は単体テストで担保」は、試験計画 21-42 行が「`middleware()` の単体テストでは検証不能」と明示的に否定している |
| c   | `docs/designs/public-release-basic-auth.md:3,6-7,54,389-393` / `docs/requirements/public-release-basic-auth.md:121,134` | ステータスが `draft` のまま（実装計画・試験計画は「確定済み」と参照）。ADR-0021 は「別工程」「未決事項」のままだが同一範囲の `2647057` で作成済み。要件の対象範囲も「実装はこのタスクでは行わない」のまま                                   |
| d   | `docs/implementation-plans/public-release-basic-auth.md:99-134,159-161`                                                 | 12 ケース・「このテストファイルでは matcher を検証対象にしない」と記すが、実装は後続の試験計画に従って 38 ケース（構造テスト MW-M01〜M11 を含む）。実装は新しい試験計画に準拠しており正しいが、計画側に置き換えの記録が無い                 |

#### F-03 の内訳（ドキュメント更新漏れ・事実誤り）

| #   | path:line                                                                                                                                                                  | 内容                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | `docs/03-architecture.md:49-77`                                                                                                                                            | ディレクトリ構成に `src/middleware.ts` が無い。全リクエストが通る新しい入口であり、構成図に載らないと追跡できない                                                                                                             |
| b   | `docs/03-architecture.md:213`                                                                                                                                              | 「認証なし MVP1 では…」の記述が実態と食い違う。趣旨（利用者識別を持たない）は維持されるので言い換えで足りる                                                                                                                   |
| c   | `docs/05-roadmap.md:963,1126`                                                                                                                                              | 置換済みの ADR-0003 を現行判断として参照。内容（Better Auth は Phase 2 以降）は ADR-0021 でも維持されているため、参照先の差し替えで足りる                                                                                     |
| d   | `docs/requirements/public-release-basic-auth.md:23-25` / `docs/designs/public-release-basic-auth.md:14` / `docs/decisions/ADR-0021-basic-auth-for-public-repository.md:27` | 無認証ルートの件数「GET 12 / POST 9 / DELETE 4」のうち POST・DELETE が実測と不一致、PUT が欠落（実測: GET 12 / POST 18 / PUT 5 / DELETE 6。cron / health を除く集計は GET 11 + health 1）。ADR は恒久記録のため訂正が望ましい |
| e   | `apps/web/.env.example:6-7`                                                                                                                                                | `BASIC_AUTH_USER` に `:` を含めると `user:password` 連結の分割が曖昧になる（RFC 7617 は userid に `:` を許さない）。この制約がどの成果物にも書かれていない                                                                    |

#### 重点観点ごとの確認結果

1. **要件 → 設計 → 実装計画 → 試験計画 → 実装 → テストの一貫性**: 要件 F-01〜F-06 / N-01〜N-05 /
   E-01〜E-03 / B-01〜B-05 はすべて試験計画の照合表に載り、MW-xx として実装されている。
   落ちている要件は無い。テストで担保できない N-02（PWA の資格情報保持）と B-05（権限境界）は
   対象外理由つきで明示されており、B-04 は構造テスト＋ black-box に委ねる区分が妥当。
   唯一の実質的な穴は F-02（E-02 の非対称ケース）。
2. **設計と実装の乖離**: `middleware.ts` は設計の疑似実装とほぼ逐語的に一致する。差分は
   (i) `console.error` の追加（I-01、設計の別節が要求した妥当な逸脱）、(ii) JSDoc の付与、
   (iii) Why コメントの移動、(iv) `import { NextResponse, type NextRequest }` のインライン
   type 指定（実装計画は `import type` の分離を書いていたが、規約「型のみは `import type`」は
   満たす）。報告漏れの乖離は無い。
3. **文書間の矛盾・陳腐化**: 旧方式（固定長 256 文字ループ）の残存は設計書 315 行の 1 箇所のみ
   （F-01a）。matcher の検証方法は未決事項節だけが更新され、API 設計・テスト方針・リスク節が
   旧記述のまま残っている（F-01b）。
4. **参照の生存**: 成果物間リンク・ADR-0003 ⇔ ADR-0021 の相互参照・ADR-0004 / ADR-0019 /
   `logs/2026-09-15.md` の実在、要件が引用する本番 URL の出現箇所（`ADR-0019:70` /
   `store-limit-and-render-performance.md:27,424` / `logs/2026-08-13.md:188,195,247`）を
   確認し、いずれも生存。ADR-0021 の採番も空き番で衝突しない（既知の ADR-0017 衝突は I-02）。
5. **コード品質**: `any` なし / default export なし（`middleware` と `config` は Next.js 規約の
   名前付きエクスポート）/ 型のみ `import type` / `===`・`!==` のみ / 「値なし」は `null` /
   JSDoc は契約情報（fail-closed 条件・401 と 503 の使い分け・cron 除外の理由）に限定 /
   コメントは Why のみ。Presentation 層の責務（UseCase を呼ばない・ドメインロジックなし）も維持。
6. **テストの実効性**: MW-15 は旧「256 文字固定長ループ」実装を実際に落とす。旧実装を再現した
   スクリプトに MW-15 と同じ入力（長さ 600・先頭 256 文字一致・長さ一致・末尾 1 文字のみ相違）を
   与えると `equal = true` になり、現行実装では 401 になることを確認した（EV-02）。
   MW-09 / MW-11 は例外を 401 へ正規化する経路、MW-14 / MW-18 は復号経路、MW-20 / MW-22 は
   `=== 'production'` の厳密一致を固定しており、通るだけのテストではない。
   弱いのは MW-01 / MW-02 で、試験計画が期待する「書き換えなし」までは見ておらず
   `status === 200` のみ（`x-middleware-rewrite` の不在まで見ると強くなる。今回止めない）。
7. **ドキュメント更新漏れ**: F-03 のとおり。なお `docs/01-overview.md` と
   `docs/02-tech-stack.md` は本レビュー範囲の直後のコミット `5c3c282`（範囲外）で更新済み。
   ただし同コミットの `02-tech-stack.md:78-80` は「リポジトリを public にしたことで」と
   完了形で書いており、ADR-0021 の移行手順では public 化はまだ実施前である。範囲外だが
   事実整合として次に触るときに確認したい。

#### 実行した証拠

- `pnpm exec vitest run --project node tests/middleware.node.test.ts`（`apps/web`）: 38 passed（EV-01）
- 旧実装を再現した検証スクリプトによる MW-15 の counterfactual 確認（EV-02）
- `apps/web/src/server/routes/*.ts` のルート定義数の静的集計（EV-08）
- Orchestrator 提供の検証済み事実を前提として利用: `pnpm --filter @cookpit/web build` 成功、
  `turbo test lint --force` の 10 タスク成功（`@cookpit/web` 968 件 PASS）、本番相当サーバでの
  black-box 確認（EV-06 / EV-07）。同じ実行は再現しなかった（再実行不要の指示に従う）。

### Task 2: 再レビュー（`38b683e` 反映後・`origin/main`..HEAD・2026-09-16）

対象: `c0c50d1`（`origin/main`）〜`38b683e`（18 entry / digest `sha256:2d672ec27395…`）。
Task 1 は `ed8e785~1`〜`a7e454e` の 12 entry を subject にしていたため、`38b683e` 追加で
`stale_subject` となった。本 Task で subject を作り直している。
review tier は **R3** を据え置く（trigger: 認証の新設・`apps/web` の全経路に効く横断的関心事・
公開という不可逆な運用判断。Reviewer は tier を下げない）。

未解消の BLOCK は 0 件。以下はいずれも今回の受け入れを止めない。

| ID   | action       | impact | evidence | status   | path:line                                                             | 根拠・再現                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 修正案                                                                                                                                     |
| ---- | ------------ | ------ | -------- | -------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| N-01 | FOLLOW_UP    | medium | E1/E2    | resolved | `docs/designs/public-release-basic-auth.md:113,229` ほか（下表）      | 実装・試験で確定した内容が上流成果物へ戻っていない。特に設計書と実装計画は**今回セキュリティ修正した「修正前の matcher 文字列」をそのまま提示**しており、設計どおりに再実装すると SEC-5 の穴が戻る。MW-M12 が CI で落とすため実害は抑えられているが、恒久記録としては誤り。詳細 4 件は下の「N-01 の内訳」参照                                                                                                                                                                                                                                                                               | 設計書・実装計画の matcher を実装の文字列へ差し替え、検証手段の記述と試験計画のケース表を実装の 49 ケースへ合わせる                        |
| N-02 | FOLLOW_UP    | medium | E3       | resolved | `docs/decisions/ADR-0021-basic-auth-for-public-repository.md:120-121` | CSRF 緩和 ①「`zValidator('json', ...)` を通り `application/json` 以外が 400 で弾かれる」が Hono の実挙動と異なる。Hono の json validator は content-type が合わない場合**空オブジェクトのまま検証へ進む**（`hono/dist/validator/validator.js` の `case 'json'` で `break`）。400 は zod の必須項目不足に由来する。再現: 必須項目ありのスキーマは `text/plain` で 400、全項目 optional のスキーマは `text/plain` で 200（EV-04）。現行の JSON ボディ POST 16 本は全て必須項目を持つため ADR の**結論は成立**するが、防御の根拠がフレームワークではなく個々のスキーマにあることが読み取れない | ADR の ① を「各スキーマが必須項目を持つため空ボディが 400 になる」へ書き換え、「全項目が任意のボディを足すと成立しなくなる」条件を明記する |
| N-03 | FOLLOW_UP    | low    | E4       | resolved | `README.md:10` / `docs/01-overview.md:13`                             | 「ソースコードは公開しています」「ソースコードは GitHub で公開している」と完了形で書いているが、GitHub API は 2026-09-16 時点で `private: true` を返す（EV-08）。同じ `38b683e` で `docs/02-tech-stack.md:79` は完了形→未来形へ訂正済みで、訂正が一部にしか及んでいない。H-01 で「まだ公開しない」と判断した場合、誤りが残り続ける                                                                                                                                                                                                                                                          | 公開切り替えと同時に文面を確定させるか、02-tech-stack と同じ「公開する前提で」という書き方へ揃える                                         |
| I-02 | PRE_EXISTING | low    | E1       | resolved | `docs/decisions/ADR-0017-*.md`                                        | ADR-0017 の採番衝突（Task 1 から継続）。本タスクのスコープ外で、ADR-0021 の採番自体は空き番。**2026-09-17 に review-readiness 側を [ADR-0022](../decisions/ADR-0022-review-readiness-as-decision-interface.md) へ振り直して解消**                                                                                                                                                                                                                                                                                                                                                           | 別タスクで採番を整理する                                                                                                                   |

#### N-01 の内訳（実装の確定内容が上流成果物へ戻っていない）

| #   | path:line                                                                                | 内容                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | `docs/designs/public-release-basic-auth.md:113,229` / `docs/implementation-plans/...:68` | 修正前の matcher `'/((?!_next/static\|_next/image\|favicon\.ico\|icons/\|manifest\.webmanifest\|sw\.js\|workbox-.*\.js\|api/cron/).*)'` が API 設計・疑似実装・実装計画の 3 箇所に残る。実装は `middleware.ts:94` の境界固定版   |
| b   | `docs/designs/public-release-basic-auth.md:331-333,396`                                  | 「除外パスが 401 にならないことを単体テストで確認」「実挙動は middleware の単体テストで担保する」が残る。試験計画 21-42 行と Orchestrator 判断（同 44-66 行）はこれを明示的に否定し、build + 実サーバ black-box に置き換えている |
| c   | `docs/tests/public-release-basic-auth.md`（MW 行 38 件）                                 | 実装は 49 ケース。`38b683e` で追加した MW-19b / MW-19c / MW-M12 と、503 の `Cache-Control: no-store` が試験計画・要件 F-05 に載っていない（F-05 は 401 のみ no-store を要求）                                                    |
| d   | `docs/implementation-plans/public-release-basic-auth.md:133,159,209`                     | 「12 ケース」の記述が残る（Task 1 の F-01d から未解消）                                                                                                                                                                          |

#### 重点観点ごとの確認結果

1. **前回指摘の解消**: F-02（E-02 の非対称ケース）は MW-19b の 2 ケースで解消。F-03 は a〜e
   すべて解消。件数訂正値 `GET 12 / POST 19 / PUT 5 / DELETE 6` はルート定義を再集計して一致を
   確認した（EV-03）。**Task 1 が報告した `POST 18` のほうが誤りで、今回の訂正値が正しい。**
   F-01 は a（性能節）・c（ステータスと ADR 参照）が解消、b・d は未解消で N-01 へ継承。
2. **matcher 修正の妥当性**: 新パターンはファイル型 5 種を `$` で終端し、ディレクトリ型 3 種を
   `/` 付き前方一致へ分離している。除外集合の差分は「除外名に前方一致するだけのパス」が
   保護側へ移るだけで、実配信される資産（`/_next/static/*` は常に `/` を伴い、`/_next/image` は
   pathname が完全一致、`icons/*` は前方一致、`sw.js` は `public/sw.js` 単体でソースマップ生成なし）に
   退行は無い。本番相当サーバの 13 ケースで確認済み（EV-02）。
3. **fail-closed の一貫性**: 503 に `Cache-Control: no-store` が付き、401 と揃った。`WWW-Authenticate` を
   付けない区別（MW-23）は維持されている。非対称ケースは MW-19b で固定。
4. **障害設計の観点**: 外部 I/O・リトライ・再送を持たない同期処理のため (a)(c)(d) は非該当。
   (b) タイムアウトは Edge の実行制限に委ねる。(e) フォールバックは 503 の fail-closed が設計値。
   (f) ログは `console.error` 1 行で資格情報を含まないことをテストで固定済み。
5. **CSRF の記述**: N-02 のとおり根拠の説明が実挙動と異なる。結論（2 名運用で受容）は現時点で成立。
   ボディ不要の POST 3 本（`/stocks/:stockId/discard` / `/:id/reopen` / `/:id/sync`）が UUID を
   要するという ②、PUT / DELETE が preflight で遮断されるという ③ は実装と一致する。
6. **依存の既知脆弱性**: `pnpm audit` の critical 2 件はいずれも `next`（`>=16.0.0 <16.3.3`）。
   1 件は Windows ホスト限定で Vercel(Linux) では非該当、1 件は画像最適化の AVIF/libheif 経路で、
   `images.remotePatterns` 未設定・`public/` に AVIF なしのため到達経路が無い（EV-05）。
   ADR-0021 の残存リスク記述と矛盾しない。更新時期の判断は H-03 として人間へ渡す。

#### 実行した証拠

- `pnpm exec vitest run --project node tests/middleware.node.test.ts`（`apps/web`）: 49 passed（EV-01）
- `pnpm lint`: 成功 / `pnpm type-check`: 成功（5 タスク。turbo キャッシュヒット）
- `hono@4.13.1` + `@hono/zod-validator@0.9.0` の再現スクリプトによる CSRF 緩和 ① の反証（EV-04）
- `pnpm audit --json` と `next.config.ts` / `public/` の突き合わせ（EV-05）
- `apps/web/src/server/routes/*.ts` のメソッド定義の再集計（EV-03）
- GitHub API `GET /repos/oze-xxbumpxx/cookpit` の `private` フラグ確認（EV-08）
- Orchestrator 提供の検証済み事実を前提として利用: `pnpm --filter @cookpit/web build` 成功、
  `turbo test --force` の全 PASS、本番相当サーバでの 13 ケース black-box（EV-02 / EV-07）。
  再実行不要の指示に従い、同じ実行は再現していない。

### Task 3: N-01 / N-02 / N-03 の解消検証（`8f29e34`・`3dac8bd` 反映後・2026-09-16）

対象: `c0c50d1`（`origin/main`）〜`3dac8bd`（21 entry / digest `sha256:09052e26cc71…`）。
review tier は **R3** を据え置く。`8f29e34` / `3dac8bd` は**ドキュメントのみの変更**で
`apps/` `packages/` に差分が無いため（EV-01）、Task 2 のコード系証拠（EV-02 / EV-07）は
そのまま有効として引き継いだ。未解消の BLOCK は 0 件。

#### 前回指摘の解消検証（自己申告ではなく現物で確認）

| ID   | 判定         | 現物での確認内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N-01 | **resolved** | (a) `grep -rn 'workbox-\.\*' docs/` が `docs/reviews`（引用）以外にヒットせず、設計書 113 / 229 行と実装計画 68 行の 3 箇所が `middleware.ts:94` と**文字単位で一致**（EV-03）。(b) 設計書「未決事項」391-397 行が「実挙動は単体テストでは担保しない／正解判定は本番相当サーバの black-box」へ書き換わった。(c) 試験計画に MW-19b / MW-19c / MW-M12 の行が追加され、要件に F-05b（503 の no-store）が新設。(d) 実装計画の「12 ケース」3 箇所が 49 ケースへ更新され、R-3 の検証手段も構造テスト + black-box へ修正 |
| N-02 | **resolved** | ADR-0021:117-128 が「フレームワークが content-type を拒否している」から「各スキーマが必須項目を持つため空オブジェクト扱いで必須項目不足になり 400」へ改まり、**全項目が任意のボディを取る POST を追加すると成立しなくなる**条件も明記された。私の再現（必須項目あり + `text/plain` → 400 / 全項目 optional + `text/plain` → 200）と記述が一致する（EV-04）                                                                                                                                                        |
| N-03 | **resolved** | `README.md:10` が「公開する前提ですが」、`docs/01-overview.md:13` が「公開する」へ変更。GitHub API は依然 `private: true` を返すため、記述と実態の矛盾は解消（EV-08）                                                                                                                                                                                                                                                                                                                                             |

#### 今回新たに検出した指摘

| ID   | action       | impact | evidence | status   | path:line                                                                      | 根拠・再現                                                                                                                                                                                                                                                                                                          | 修正案                                                                                                                                      |
| ---- | ------------ | ------ | -------- | -------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| N-04 | FOLLOW_UP    | low    | E1       | open     | `README.md:11`                                                                 | N-03 の修正で文体が混ざった。「アプリ自体は不特定多数へ提供しません。」（です・ます）の直後が「本番デプロイは Basic 認証で保護する。」（だ・である）。README は 3 / 6 / 12 / 15 行がすべてです・ます調で、公開の主目的が「実例として残すこと」である front page の第 1 段落に残る                                   | 「保護しています」ではなく「保護します」へ揃える（公開前の未来形を保ったままです・ます調にできる）                                          |
| N-05 | FOLLOW_UP    | low    | E1       | open     | `docs/tests/public-release-basic-auth.md:229-230`                              | 完了条件だけが `MW-01〜MW-23` / `MW-M01〜MW-M11` のままで、同書 67 / 172 / 190 行の `MW-M12` および追加した MW-19b / MW-19c と食い違う。完了条件はこの文書のゲートなので、更新漏れが残ると「M12 は完了条件に含まれない」と読めてしまう                                                                              | 完了条件の 2 行を `MW-01〜MW-23 / MW-19b / MW-19c` と `MW-M01〜MW-M12` へ揃える                                                             |
| N-06 | FOLLOW_UP    | low    | E1       | open     | `docs/claude-code/improvements/metrics/public-release-basic-auth.yml:25-26,38` | `reviewer_follow_up_open: 0` / `reviewer_pre_existing: 0` / `unresolved_items: 0` だが、記録時点の Task 2 は follow-up 3 件・PRE_EXISTING 1 件（I-02）が open だった。同ファイル冒頭の「自動取得できない数値は推測せず unknown とする」にも反する。改善サイクルの時系列比較に使う値のため、0 が入ると効果測定が歪む | Task 3 時点の値（follow-up 3 / pre_existing 1 / unresolved_items 1）へ訂正するか `unknown` にする。`review.handoff_items` は 3 を記入できる |
| I-02 | PRE_EXISTING | low    | E1       | resolved | `docs/decisions/ADR-0017-*.md`                                                 | ADR-0017 の採番衝突（Task 1 から継続）。スコープ外。**2026-09-17 に review-readiness 側を [ADR-0022](../decisions/ADR-0022-review-readiness-as-decision-interface.md) へ振り直して解消**                                                                                                                            | 別タスクで採番を整理する                                                                                                                    |

#### 情報（指摘に昇格させないもの）

- 設計書「テスト方針」331-333 行の箇条書きは「除外パス → 401 にならないことを確認」のまま残る。
  ただし同書「未決事項」が**単体テストでは担保しない**ことを明示したため、Task 2 で問題にした
  文書内の矛盾は解消している。観点リストとしては正しいので指摘に昇格させない。
- 試験計画の MW 行は 41 行だが実装は 49 ケース。`it.each` で 1 行が複数ケースになるためで
  （MW-M12 は 8 ケース、MW-M01 は 3 ケース、MW-19b は 2 ケース）、齟齬ではない。
- `docs/claude-code/improvements/candidates/public-release-basic-auth.md` と
  `improvement-backlog.md` は振り返り工程の成果物として情報扱いで確認した。承認表現
  （受け入れ可 / APPROVED / マージ OK）の混入は無い。

#### 実行した証拠

- `pnpm exec vitest run --project node tests/middleware.node.test.ts`（`apps/web`）: 49 passed（EV-01）
- `git diff --name-only 38b683e HEAD` がすべて `docs/` と `README.md` であることの確認（EV-01）
- `grep -rn 'workbox-\.\*' docs/` と新パターン 3 箇所の文字列比較（EV-03）
- `hono@4.13.1` + `@hono/zod-validator@0.9.0` の再現と ADR-0021 訂正文の突き合わせ（EV-04）
- `pnpm audit --json` / `apps/web/package.json` の `next` バージョン確認（EV-05）
- GitHub API `GET /repos/oze-xxbumpxx/cookpit` の `private` フラグ再確認（EV-08）
- `npx prettier --check docs/ README.md`: 本範囲のファイルに指摘なし
  （`docs/designs/wireframes/recipe-wireframes.html` のみ warn。範囲外の既存事象）
- Orchestrator 提供の検証済み事実を引き継ぎ: build 成功、本番相当サーバの 13 ケース
  black-box（EV-02 / EV-07）。`8f29e34` 以降コード変更が無いため有効性は維持される。
