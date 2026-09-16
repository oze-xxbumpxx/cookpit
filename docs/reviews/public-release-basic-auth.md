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
    "baseSha": "4e99fa25d05e50e40ff8bcd16f97a2f9b47d3488",
    "digest": "sha256:ec74147a85195cdd59b7596258ae76b4e121e52a9ab14b44ad0ef305cd4ecacf",
    "source": "commit",
    "entryCount": 12
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
      "question": "Vercel の本番環境変数登録と実機確認を終えるまでリポジトリを public にしない、という ADR-0021 の順序をそのまま実行しますか？",
      "recommendation": "accept。順序を守れば無防備な公開時間帯は生じない。実際にいつ環境変数を登録し、いつ公開に切り替えるかは AI が代行できない不可逆の運用操作。",
      "evidenceRefs": [
        "EV-06",
        "EV-07"
      ]
    },
    {
      "id": "H-02",
      "kind": "unknown",
      "question": "通知クリックからの PWA 起動時に再認証ダイアログが出る可能性を、実装追加なし（2 名への周知のみ）で受け入れますか？",
      "recommendation": "accept_risk。挙動はブラウザ/OS の資格情報保存に依存し、実機でしか確認できない。この環境では再現できず、受容判断は利用者本人にしか下せない。",
      "evidenceRefs": [
        "EV-06"
      ]
    }
  ],
  "residualRisks": [
    "除外パスの実挙動は manifest.webmanifest / favicon.ico / _next/static / api/cron のみ本番相当サーバで確認済み。sw.js / icons/ / _next/image は未確認のまま受容する。",
    "通知クリックからの PWA 起動時の再認証挙動は実機未確認。周知で対応する方針のまま受容する。",
    "本番で片方の環境変数だけ設定した状態（E-02 の非対称ケース）を通す自動テストが無い。論理上は 503 だが未検証のまま受容する。",
    "本番の資格情報は未登録のため、middleware を含むコードを先にデプロイすると本番は一時的に 503 になる。移行手順の順序で回避する前提で受容する。"
  ],
  "behaviorChanges": [
    "本番サイトを開くとブラウザ標準の ID / パスワード入力を求められ、正しく入力するまで画面もデータも表示されない。",
    "資格情報を付けずに API を直接呼んでも内容は返らず、認証を求める応答だけが返る。",
    "ホーム画面に追加済みの PWA は初回起動時に一度だけ認証を求められる。アイコン・マニフェスト・Service Worker は従来どおり取得できるため、インストール済みアプリは壊れない。",
    "期限アラートの定期配信は従来どおり動く。",
    "本番で資格情報の環境変数が未設定だと、アプリ全体が一時的に利用できなくなる（内容を一切返さない）。"
  ],
  "evidence": [
    {
      "id": "EV-01",
      "claim": "middleware の単体テスト 38 件（MW-01〜MW-23 / MW-M01〜MW-M11 ほか）がすべて通る",
      "kind": "test",
      "result": "pass",
      "ref": "pnpm exec vitest run --project node tests/middleware.node.test.ts: 38 passed（2026-09-16 実行）"
    },
    {
      "id": "EV-02",
      "claim": "MW-15 の入力は旧「256 文字固定長ループ」実装なら一致と判定される値であり、回帰テストとして実効性がある",
      "kind": "counterfactual",
      "result": "pass",
      "ref": "旧案を再現した検証スクリプト: 長さ 600・先頭 256 文字一致で equal=true、現行実装では 401"
    },
    {
      "id": "EV-03",
      "claim": "middleware.ts がコーディング規約（any なし・default export なし・型のみ import・=== / !==・値なしは null）と Presentation 層の責務に適合する",
      "kind": "static",
      "result": "pass",
      "ref": "apps/web/src/middleware.ts:1-89 の読み合わせ（UseCase 呼び出し・ドメインロジックなし）"
    },
    {
      "id": "EV-04",
      "claim": "設計書の性能節だけが旧方式（固定長 256 回の文字コード比較）のまま残り、実装の SHA-256 32 バイト比較と一致しない",
      "kind": "static",
      "result": "pass",
      "ref": "docs/designs/public-release-basic-auth.md:315 と apps/web/src/middleware.ts:34-41"
    },
    {
      "id": "EV-05",
      "claim": "要件 F-04 が挙げる除外 8 種がすべて config.matcher の否定 lookahead に含まれる",
      "kind": "static",
      "result": "pass",
      "ref": "docs/requirements/public-release-basic-auth.md:50-51 と apps/web/src/middleware.ts:85-89"
    },
    {
      "id": "EV-06",
      "claim": "本番相当サーバで保護対象は 401 + WWW-Authenticate、正しい資格情報は 200、manifest.webmanifest / favicon.ico / _next/static は素通り、cron は cron 自身の判定に到達、環境変数未設定時は 503 本文 0 バイトになる",
      "kind": "black_box",
      "result": "pass",
      "ref": "Orchestrator 提供の検証済み事実（next start による curl 確認、2026-09-16）"
    },
    {
      "id": "EV-07",
      "claim": "config.matcher の記法が Next.js 16.2.12 のビルド時静的検証を通り、middleware が成果物に載る",
      "kind": "production_like",
      "result": "pass",
      "ref": "Orchestrator 提供の検証済み事実: pnpm --filter @cookpit/web build 成功（Proxy (Middleware) を確認）"
    },
    {
      "id": "EV-08",
      "claim": "要件書・設計書・ADR-0021 が記す無認証ルートの件数（POST 9 / DELETE 4、PUT の記載なし）が実測（POST 18 / PUT 5 / DELETE 6）と一致しない",
      "kind": "static",
      "result": "pass",
      "ref": "apps/web/src/server/routes/*.ts のルート定義数（cron / health を除く。GET 12 は一致）"
    }
  ],
  "reviewer": {
    "agent": "reviewer",
    "model": "claude-opus-5",
    "reviewedAt": "2026-09-16T05:00:00.000Z"
  }
}
-->
## Review handoff

> **人間レビュー待ちです。**
> Claude の評価です。これは承認ではありません。以下の判断事項・残余リスク・振る舞い差分を確認してください。
> 対象: `sha256:ec74147a8519…` / R3 / 12 changes

### あなたが判断・確認すること（2 件）

1. **[不可逆] Vercel の本番環境変数登録と実機確認を終えるまでリポジトリを public にしない、という ADR-0021 の順序をそのまま実行しますか？** — 推奨: accept。順序を守れば無防備な公開時間帯は生じない。実際にいつ環境変数を登録し、いつ公開に切り替えるかは AI が代行できない不可逆の運用操作。 / 証拠: EV-06, EV-07
2. **[未知] 通知クリックからの PWA 起動時に再認証ダイアログが出る可能性を、実装追加なし（2 名への周知のみ）で受け入れますか？** — 推奨: accept\_risk。挙動はブラウザ/OS の資格情報保存に依存し、実機でしか確認できない。この環境では再現できず、受容判断は利用者本人にしか下せない。 / 証拠: EV-06

### 残余リスク・未確認

- 除外パスの実挙動は manifest.webmanifest / favicon.ico / \_next/static / api/cron のみ本番相当サーバで確認済み。sw.js / icons/ / \_next/image は未確認のまま受容する。
- 通知クリックからの PWA 起動時の再認証挙動は実機未確認。周知で対応する方針のまま受容する。
- 本番で片方の環境変数だけ設定した状態（E-02 の非対称ケース）を通す自動テストが無い。論理上は 503 だが未検証のまま受容する。
- 本番の資格情報は未登録のため、middleware を含むコードを先にデプロイすると本番は一時的に 503 になる。移行手順の順序で回避する前提で受容する。

### 振る舞い差分

- 本番サイトを開くとブラウザ標準の ID / パスワード入力を求められ、正しく入力するまで画面もデータも表示されない。
- 資格情報を付けずに API を直接呼んでも内容は返らず、認証を求める応答だけが返る。
- ホーム画面に追加済みの PWA は初回起動時に一度だけ認証を求められる。アイコン・マニフェスト・Service Worker は従来どおり取得できるため、インストール済みアプリは壊れない。
- 期限アラートの定期配信は従来どおり動く。
- 本番で資格情報の環境変数が未設定だと、アプリ全体が一時的に利用できなくなる（内容を一切返さない）。

### 証拠

| ID | 主張 | 種別 | 結果 | 参照 |
| --- | --- | --- | --- | --- |
| EV-01 | middleware の単体テスト 38 件（MW-01〜MW-23 / MW-M01〜MW-M11 ほか）がすべて通る | test | pass | pnpm exec vitest run --project node tests/middleware.node.test.ts: 38 passed（2026-09-16 実行） |
| EV-02 | MW-15 の入力は旧「256 文字固定長ループ」実装なら一致と判定される値であり、回帰テストとして実効性がある | counterfactual | pass | 旧案を再現した検証スクリプト: 長さ 600・先頭 256 文字一致で equal=true、現行実装では 401 |
| EV-03 | middleware.ts がコーディング規約（any なし・default export なし・型のみ import・=== / \!==・値なしは null）と Presentation 層の責務に適合する | static | pass | apps/web/src/middleware.ts:1-89 の読み合わせ（UseCase 呼び出し・ドメインロジックなし） |
| EV-04 | 設計書の性能節だけが旧方式（固定長 256 回の文字コード比較）のまま残り、実装の SHA-256 32 バイト比較と一致しない | static | pass | docs/designs/public-release-basic-auth.md:315 と apps/web/src/middleware.ts:34-41 |
| EV-05 | 要件 F-04 が挙げる除外 8 種がすべて config.matcher の否定 lookahead に含まれる | static | pass | docs/requirements/public-release-basic-auth.md:50-51 と apps/web/src/middleware.ts:85-89 |
| EV-06 | 本番相当サーバで保護対象は 401 + WWW-Authenticate、正しい資格情報は 200、manifest.webmanifest / favicon.ico / \_next/static は素通り、cron は cron 自身の判定に到達、環境変数未設定時は 503 本文 0 バイトになる | black\_box | pass | Orchestrator 提供の検証済み事実（next start による curl 確認、2026-09-16） |
| EV-07 | config.matcher の記法が Next.js 16.2.12 のビルド時静的検証を通り、middleware が成果物に載る | production\_like | pass | Orchestrator 提供の検証済み事実: pnpm --filter @cookpit/web build 成功（Proxy \(Middleware\) を確認） |
| EV-08 | 要件書・設計書・ADR-0021 が記す無認証ルートの件数（POST 9 / DELETE 4、PUT の記載なし）が実測（POST 18 / PUT 5 / DELETE 6）と一致しない | static | pass | apps/web/src/server/routes/\*.ts のルート定義数（cron / health を除く。GET 12 は一致） |

<details>
<summary>AI assessment</summary>

- blocking open: 0
- high-impact unverified: 0
- follow-up open: 3
- reviewer: reviewer / claude-opus-5
- reviewed at: 2026-09-16T05:00:00.000Z

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

| ID   | action       | impact | evidence | status   | path:line                                                | 根拠・再現                                                                                                                                                                                                                               | 修正案                                                                       |
| ---- | ------------ | ------ | -------- | -------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| F-01 | FOLLOW_UP    | medium | E1       | open     | `docs/designs/public-release-basic-auth.md` ほか（下表） | 定数時間比較の方式差し替えと matcher 検証方法の具体化が、設計書・実装計画へ部分的にしか反映されていない。詳細 4 件は下の「F-01 の内訳」参照                                                                                              | 下表の 4 箇所を実装・試験計画の確定内容に合わせる                            |
| F-02 | FOLLOW_UP    | low    | E2       | open     | `apps/web/tests/middleware.node.test.ts:117-141,195-215` | 要件 E-02 は「いずれかが未設定」を条件にするが、production での**非対称**ケース（片方だけ設定）を通すテストが無い。MW-12 は `NODE_ENV=development`、MW-13 は両方空、MW-19/20/23 は両方未設定。実装計画のケース 11 が試験計画で落ちている | `BASIC_AUTH_USER` のみ設定 + `NODE_ENV=production` → 503 を 1 ケース追加する |
| F-03 | FOLLOW_UP    | low    | E1       | open     | `docs/03-architecture.md:49-77,213` ほか（下表）         | 本変更に伴う周辺ドキュメントの更新漏れと事実誤り。詳細 4 件は下の「F-03 の内訳」参照                                                                                                                                                     | 恒久記録（ADR-0021・アーキテクチャ）を優先して訂正する                       |
| I-01 | 情報         | low    | E1       | resolved | `apps/web/src/middleware.ts:62`                          | 設計の疑似実装に無い `console.error` を実装が追加している。設計「ログと監視」節および実装計画の手順 2 が明示的に要求したものであり、資格情報を出力しないことを検証するテストもある（妥当な逸脱・報告漏れではない）                       | 対応不要                                                                     |
| I-02 | PRE_EXISTING | low    | E1       | open     | `docs/decisions/ADR-0017-*.md`                           | `ADR-0017-review-readiness-as-decision-interface.md` と `ADR-0017-web-push-expiry-alert.md` の採番衝突。本タスクのスコープ外の既知事項で、ADR-0021 の採番自体は空き番であり衝突しない                                                    | 別タスクで採番を整理する                                                     |

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
