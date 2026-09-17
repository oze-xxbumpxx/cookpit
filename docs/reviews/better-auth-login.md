# レビュー記録: better-auth-login

<!-- review-readiness:begin -->
<!-- prettier-ignore-start -->

<!-- review-readiness:state
{
  "schemaVersion": 1,
  "feature": "better-auth-login",
  "status": "ai_blocked",
  "reviewTier": "R3",
  "subject": {
    "algorithm": "git-raw-v1",
    "baseSha": "b2103c91be46536163cbaff14de269c6e0e2cd4d",
    "digest": "sha256:e931bb10404d94a05c965e8c8c077a776897aa959a1db7711d7f4d1b59d17d44",
    "source": "commit",
    "entryCount": 58
  },
  "aiAssessment": {
    "blockingOpen": 2,
    "highImpactUnverified": 0,
    "followUpOpen": 3
  },
  "humanItems": [
    {
      "id": "H-01",
      "kind": "irreversible",
      "question": "この PR の CI が本番 Neon へ認証テーブル追加のマイグレーションを（マージ前に）適用する順序のまま進めますか？",
      "recommendation": "accept。追加のみで既存 9 テーブルへの差分が無いことは検証済み（EV-02）。ただし本番データへの不可逆な適用をいつ許すかは運用判断であり、AI が代わりに決められない。",
      "evidenceRefs": [
        "EV-02"
      ]
    },
    {
      "id": "H-02",
      "kind": "unknown",
      "question": "iOS / Android のホーム画面 PWA でログイン維持・通知クリック起動が未確認のまま、実機確認を本番デプロイ後に回す進め方でよいですか？",
      "recommendation": "accept_risk。Cookie 永続と通知起動は OS / ブラウザ実装依存でこの環境では再現できない。実機を持つ本人にしか確認できず、失敗時の影響（毎回ログイン）も利用者本人が判断する。",
      "evidenceRefs": [
        "EV-05"
      ]
    },
    {
      "id": "H-03",
      "kind": "irreversible",
      "question": "旧方式の環境変数（BASIC_AUTH_*）の削除を、本番 black-box 確認と 2 名の実機確認が終わった後まで遅らせる順序で実行しますか？",
      "recommendation": "accept。先に削除すると前デプロイへの巻き戻し先が保護されない時間帯が生まれる。実際に削除する時点の判断と Vercel 操作は人間にしか行えない。",
      "evidenceRefs": [
        "EV-01"
      ]
    }
  ],
  "residualRisks": [
    "iOS / Android の standalone PWA でのログイン維持・通知クリック起動は未確認。実機確認（MB-01〜09）で確定させる前提で受容する。",
    "他端末ログアウト・パスワード変更の失効は、対象端末のキャッシュ Cookie が切れるまで最大 5 分遅れる。DB のセッション行は即時削除されることを確認済みで、設計が明示的に受容した特性として扱う。",
    "Cookie 属性・オリジン検査・レート制限は PGlite と疑似 HTTPS リクエストでの確認にとどまる。本番 URL での確認（BB-01〜11）は未実施のまま受容する。",
    "レート制限のデータベース保存は単一プロセスでのみ確認。Vercel の複数インスタンス + Neon での挙動は未確認のまま受容する。",
    "ログイン・ログアウト・パスワード変更・他端末失効の HTTP 面には自動回帰テストが無く、設定変更による劣化を検知できない。BLOCK-1 の解消までこの状態を受容する。"
  ],
  "behaviorChanges": [
    "本番を開くとブラウザ標準のパスワード入力ダイアログではなく、アプリ内のログイン画面が出る。メールアドレスとパスワードでログインすれば、以後 30 日は聞かれない。",
    "「その他」画面にログアウトと「アカウント」が増え、アカウント画面で表示名・メールの確認、パスワード変更、他の端末からのログアウトができる。",
    "ログイン画面では下部のタブが消え、ログイン後は元々開こうとしていた画面へ戻る。",
    "操作中にログインが切れると、失敗メッセージではなくログイン画面へ移り、ログイン後に元の画面へ戻る。",
    "ログアウトすると、オフライン表示のために端末へ残っていた買い物リストなどの一時データも消える。"
  ],
  "evidence": [
    {
      "id": "EV-01",
      "claim": "lint / type-check / test がキャッシュ無しで通る（87 ファイル 1,026 テスト）",
      "kind": "test",
      "result": "pass",
      "ref": "TURBO_FORCE=true pnpm test / pnpm lint / pnpm type-check（2026-09-17 実行）"
    },
    {
      "id": "EV-02",
      "claim": "新規マイグレーションは認証 5 テーブルの追加のみで、手で除去した 3 行の ALTER は実 DB では無効果（対象 3 列は 0009 で DEFAULT 無しで追加されている）",
      "kind": "counterfactual",
      "result": "pass",
      "ref": "apps/web/src/db/migrations/0010_majestic_namor.sql / 0009_shopping_list_pantry_coverage.sql / meta の 0009・0010 スナップショット比較"
    },
    {
      "id": "EV-03",
      "claim": "信頼済みでないオリジンからのログインは 403、HTTP 経由のサインアップは 400 で閉鎖、疎通確認用の応答は 200",
      "kind": "black_box",
      "result": "pass",
      "ref": "PGlite + 実ハンドラへの疑似リクエスト（reviewer の一時スクリプト。オリジン空設定でも同結果）"
    },
    {
      "id": "EV-04",
      "claim": "レート制限はデータベース保存で機能し、ログイン 4 回目で 429 になる。クライアント IP ヘッダが無い場合は全利用者共有の 1 バケットへ退避する",
      "kind": "black_box",
      "result": "pass",
      "ref": "PGlite + 実ハンドラへの疑似リクエスト。rate_limits の key が no-trusted-ip 付き / IP ヘッダ有りでは IP 別"
    },
    {
      "id": "EV-05",
      "claim": "セッション Cookie は HttpOnly / Secure / SameSite=Lax / Path=/ / 30 日、キャッシュ Cookie は 931 バイト、ログアウトで両方が即時失効する",
      "kind": "black_box",
      "result": "pass",
      "ref": "PGlite + 実ハンドラへの疑似リクエスト（Set-Cookie 全文と sessions 行の期限差を実測）"
    },
    {
      "id": "EV-06",
      "claim": "パスワード変更は 11 文字 / 129 文字を 400 で拒否し、現在のパスワード誤りも 400。他端末失効は DB のセッション行を即時削除する",
      "kind": "black_box",
      "result": "pass",
      "ref": "PGlite + 実ハンドラへの疑似リクエスト（PASSWORD_TOO_SHORT / TOO_LONG / INVALID_PASSWORD を確認）"
    },
    {
      "id": "EV-07",
      "claim": "試験計画 §15-2 の合格基準に対し、結合試験 18 件・バレル 1 件・画面 2 件が未実装で、乖離の記録も無い",
      "kind": "static",
      "result": "pass",
      "ref": "docs/tests/better-auth-login.md §15-2 と apps/web/tests 配下の試験 ID の突合（grep）"
    },
    {
      "id": "EV-08",
      "claim": "本番ビルドが Proxy を含めて成功する。ただし認証設定がビルド時に無い環境では /more が静的生成され、ログイン名の表示経路が実行されない",
      "kind": "black_box",
      "result": "pass",
      "ref": "pnpm --filter @cookpit/web build のルート一覧（○ /more / ƒ /more/account）"
    }
  ],
  "reviewer": {
    "agent": "reviewer",
    "model": "claude-opus-5",
    "reviewedAt": "2026-09-17T13:05:00Z"
  }
}
-->
## Review handoff

> **AI review blocked — 人間への引き渡し前です。**
> open blocker: 2。先に指摘を解消してください。
> 対象: `sha256:e931bb10404d…` / R3 / 58 changes

### 引き渡し前に解消する人間項目（3 件）

1. **[不可逆] この PR の CI が本番 Neon へ認証テーブル追加のマイグレーションを（マージ前に）適用する順序のまま進めますか？** — 推奨: accept。追加のみで既存 9 テーブルへの差分が無いことは検証済み（EV-02）。ただし本番データへの不可逆な適用をいつ許すかは運用判断であり、AI が代わりに決められない。 / 証拠: EV-02
2. **[未知] iOS / Android のホーム画面 PWA でログイン維持・通知クリック起動が未確認のまま、実機確認を本番デプロイ後に回す進め方でよいですか？** — 推奨: accept\_risk。Cookie 永続と通知起動は OS / ブラウザ実装依存でこの環境では再現できない。実機を持つ本人にしか確認できず、失敗時の影響（毎回ログイン）も利用者本人が判断する。 / 証拠: EV-05
3. **[不可逆] 旧方式の環境変数（BASIC\_AUTH\_\*）の削除を、本番 black-box 確認と 2 名の実機確認が終わった後まで遅らせる順序で実行しますか？** — 推奨: accept。先に削除すると前デプロイへの巻き戻し先が保護されない時間帯が生まれる。実際に削除する時点の判断と Vercel 操作は人間にしか行えない。 / 証拠: EV-01

### 残余リスク・未確認

- iOS / Android の standalone PWA でのログイン維持・通知クリック起動は未確認。実機確認（MB-01〜09）で確定させる前提で受容する。
- 他端末ログアウト・パスワード変更の失効は、対象端末のキャッシュ Cookie が切れるまで最大 5 分遅れる。DB のセッション行は即時削除されることを確認済みで、設計が明示的に受容した特性として扱う。
- Cookie 属性・オリジン検査・レート制限は PGlite と疑似 HTTPS リクエストでの確認にとどまる。本番 URL での確認（BB-01〜11）は未実施のまま受容する。
- レート制限のデータベース保存は単一プロセスでのみ確認。Vercel の複数インスタンス + Neon での挙動は未確認のまま受容する。
- ログイン・ログアウト・パスワード変更・他端末失効の HTTP 面には自動回帰テストが無く、設定変更による劣化を検知できない。BLOCK-1 の解消までこの状態を受容する。

### 振る舞い差分

- 本番を開くとブラウザ標準のパスワード入力ダイアログではなく、アプリ内のログイン画面が出る。メールアドレスとパスワードでログインすれば、以後 30 日は聞かれない。
- 「その他」画面にログアウトと「アカウント」が増え、アカウント画面で表示名・メールの確認、パスワード変更、他の端末からのログアウトができる。
- ログイン画面では下部のタブが消え、ログイン後は元々開こうとしていた画面へ戻る。
- 操作中にログインが切れると、失敗メッセージではなくログイン画面へ移り、ログイン後に元の画面へ戻る。
- ログアウトすると、オフライン表示のために端末へ残っていた買い物リストなどの一時データも消える。

### 証拠

| ID | 主張 | 種別 | 結果 | 参照 |
| --- | --- | --- | --- | --- |
| EV-01 | lint / type-check / test がキャッシュ無しで通る（87 ファイル 1,026 テスト） | test | pass | TURBO\_FORCE=true pnpm test / pnpm lint / pnpm type-check（2026-09-17 実行） |
| EV-02 | 新規マイグレーションは認証 5 テーブルの追加のみで、手で除去した 3 行の ALTER は実 DB では無効果（対象 3 列は 0009 で DEFAULT 無しで追加されている） | counterfactual | pass | apps/web/src/db/migrations/0010\_majestic\_namor.sql / 0009\_shopping\_list\_pantry\_coverage.sql / meta の 0009・0010 スナップショット比較 |
| EV-03 | 信頼済みでないオリジンからのログインは 403、HTTP 経由のサインアップは 400 で閉鎖、疎通確認用の応答は 200 | black\_box | pass | PGlite + 実ハンドラへの疑似リクエスト（reviewer の一時スクリプト。オリジン空設定でも同結果） |
| EV-04 | レート制限はデータベース保存で機能し、ログイン 4 回目で 429 になる。クライアント IP ヘッダが無い場合は全利用者共有の 1 バケットへ退避する | black\_box | pass | PGlite + 実ハンドラへの疑似リクエスト。rate\_limits の key が no-trusted-ip 付き / IP ヘッダ有りでは IP 別 |
| EV-05 | セッション Cookie は HttpOnly / Secure / SameSite=Lax / Path=/ / 30 日、キャッシュ Cookie は 931 バイト、ログアウトで両方が即時失効する | black\_box | pass | PGlite + 実ハンドラへの疑似リクエスト（Set-Cookie 全文と sessions 行の期限差を実測） |
| EV-06 | パスワード変更は 11 文字 / 129 文字を 400 で拒否し、現在のパスワード誤りも 400。他端末失効は DB のセッション行を即時削除する | black\_box | pass | PGlite + 実ハンドラへの疑似リクエスト（PASSWORD\_TOO\_SHORT / TOO\_LONG / INVALID\_PASSWORD を確認） |
| EV-07 | 試験計画 §15-2 の合格基準に対し、結合試験 18 件・バレル 1 件・画面 2 件が未実装で、乖離の記録も無い | static | pass | docs/tests/better-auth-login.md §15-2 と apps/web/tests 配下の試験 ID の突合（grep） |
| EV-08 | 本番ビルドが Proxy を含めて成功する。ただし認証設定がビルド時に無い環境では /more が静的生成され、ログイン名の表示経路が実行されない | black\_box | pass | pnpm --filter @cookpit/web build のルート一覧（○ /more / ƒ /more/account） |

<details>
<summary>AI assessment</summary>

- blocking open: 2
- high-impact unverified: 0
- follow-up open: 3
- reviewer: reviewer / claude-opus-5
- reviewed at: 2026-09-17T13:05:00Z

</details>

<!-- prettier-ignore-end -->
<!-- review-readiness:end -->

## 監査ログ

### Task 1: better-auth-login 実装レビュー（2026-09-17 / reviewer: claude-opus-5）

- 対象: `feat/better-auth-login` の `main..HEAD`（11 コミット・58 エントリ）。base `main` = `b2103c9`。
- subject digest: `sha256:e931bb10404d94a05c965e8c8c077a776897aa959a1db7711d7f4d1b59d17d44`（`--source commit`）。
- review tier: **R3**（変更レベル L3 と同値。認証・migration・`.env.example`・依存追加を含むため引き下げない）。
- セキュリティ観点（OWASP 網羅）は security-reviewer が並行実施（`docs/reviews/better-auth-login.security.md`）。
  本レビューは要件充足・設計整合・品質・エラー処理・テスト・ドキュメント整合に集中した。

#### 指摘一覧

| ID   | action       | impact | evidence | status   | path:line                                                                                   | 根拠・再現                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 修正案                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | ------------ | ------ | -------- | -------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-01 | BLOCK        | medium | E2       | open     | `docs/tests/better-auth-login.md:612-620` / `apps/web/tests/server/auth/auth-route.test.ts` | 試験計画 §15-2 の合格基準「IT-H-01〜24 / IT-INF-01 が実装され全てグリーン」に対し、実装済みは IT-H-01・01b・02・03・04・10 のみ。IT-H-05〜09 / 11〜20 / 22〜24（18 件。§14 で自動化困難と明記済みの IT-H-21 を除く）と IT-INF-01、CT-15 / CT-20 が未実装で、§14-1「未実装観点」にも記録が無い。要件 E-12（Origin 検査）・E-06 / F-16（レート制限）・N-03（`updateAge` 延長）・B-08（キャッシュ Cookie 上限）は自動テスト・手動確認のどちらにも対応が残っていない  | (a) 実施可能で価値の高い IT-H-12（レート制限）・IT-H-13（Origin）・IT-H-06（sign-out の Cookie 失効）・IT-H-07/08（パスワード変更）・IT-H-09（他端末失効）を `auth-route.test.ts` の PGlite ブロックへ追加する（reviewer の実測どおり `createAuth(...).handler(new Request(...))` で HTTP 面をそのまま叩ける。EV-03〜06）。(b) 残り（IT-H-19/20/22/23、IT-INF-01、CT-15/20）は §14-1 へ「未実装の理由と代替（MB/BB のどの項目で見るか）」を追記して合格基準 §15-2 を実態に合わせる。**(a) と (b) の両方**が必要 |
| B-02 | BLOCK        | medium | E1       | open     | `README.md:68-71`                                                                           | 本 PR で削除した `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` を README が今も案内し、「Playwright E2E は同じ変数から資格情報を自動で渡します」と事実に反する記述が残る（`playwright.config.ts` の `httpCredentials` は削除済み）。実装計画 Step 9 の完了条件 grep が `apps/web docs` しか見ておらずリポジトリ直下の README を対象外にしたため検知されなかった                                                                                                       | 当該段落を Better Auth 前提へ置換する。例: 「`BETTER_AUTH_SECRET` は未設定でも開発時は認証がスキップされるため、ローカル開発で設定する必要はありません（`NODE_ENV=production` で未設定の場合は fail-closed で 503）。ログイン E2E を動かす場合は `apps/web/e2e/README.md` の手順でアカウントを発行します」。あわせて実装計画 Step 9 完了条件の grep 範囲へ `README.md` を含める                                                                                                                                 |
| F-01 | FOLLOW_UP    | medium | E4       | open     | `apps/web/src/app/more/account/_components/change-password-form.tsx:48-51`                  | `result.error !== null` を一律「現在のパスワードが正しくありません。」にしている。実測では新パスワード 11 文字 → `400 PASSWORD_TOO_SHORT`、129 文字 → `400 PASSWORD_TOO_LONG`、短時間の連続試行 → `429` が返る（EV-06）。入力欄に `minLength` もヒント文言も無いため、12 文字未満を入力した利用者は誤った理由を提示されたまま回復できない                                                                                                                         | `result.error.status` と `code` で分岐する（`PASSWORD_TOO_SHORT` / `TOO_LONG` → 「パスワードは 12〜128 文字で入力してください。」、429 → ログイン画面と同じ試行過多文言、それ以外 → 現行文言）。最低でも新パスワード欄に文字数の説明を追加する                                                                                                                                                                                                                                                                  |
| F-02 | FOLLOW_UP    | medium | E1       | open     | `apps/web/src/app/shopping-lists/_utils/use-checked-sync-queue.ts:170-176`                  | オフラインキューの再送は `useApiAction` を経由しないため、本 PR で新設された 401（セッション切れ）が「一時的な障害」として扱われ、最大 5 回再送のうえ破棄され `onQueueError('exhausted')` のバナーになる。F-13 / E-03 の「401 なら `/login?next=` へ」は適用されない。SW キャッシュから復帰した端末でセッションが切れている場合に、チェック操作が黙って失われる                                                                                                   | `flush()` の分岐に `status === 401` を追加し、op をキューへ残したまま `window.location.assign('/login?next=' + ...)` で回復させる（再ログイン後に再送される）。設計書 D-8 の適用範囲としてこの経路を明記する                                                                                                                                                                                                                                                                                                    |
| F-03 | FOLLOW_UP    | low    | E4       | open     | `apps/web/src/app/more/page.tsx:9-19`                                                       | ローカルビルドでは `/more` が `○（Static）` として事前生成され、`/more/account` は `ƒ（Dynamic）` になる（EV-08）。`isAuthConfigured()` が false のビルド環境では `headers()` に到達しないため静的化され、実行時にセッション取得（D-16 の「<name> でログイン中」）が動かない。Vercel の Production ビルドでは環境変数が入るため動的化される見込みだが、Preview に secret 未登録の場合などビルド環境に依存する                                                     | `/more/account` と同じく `export const dynamic = 'force-dynamic'` を `apps/web/src/app/more/page.tsx` に付け、ビルド環境に依存しない挙動へ揃える                                                                                                                                                                                                                                                                                                                                                                |
| P-01 | PRE_EXISTING | low    | E3       | resolved | `apps/web/src/db/migrations/meta/0009_snapshot.json`                                        | `db:generate` が既存 `shopping_items` / `shopping_lists` へ出した `ALTER COLUMN ... DROP DEFAULT` 3 行は、0009 スナップショットの旧形式（`"default": null`）に由来する既存ドリフト。対象 3 列は `0009_shopping_list_pantry_coverage.sql` で `DEFAULT` 句なしに追加されており、実 DB では no-op（EV-02）。手で除去した判断は妥当。生成済みの `0010_snapshot.json` は当該 3 列の `default` キーを持たないため、次回の `db:generate` で同じ 3 行が再発することはない | 追加対応不要。次タスクへの持ち越し項目としても解消済みとして扱ってよい                                                                                                                                                                                                                                                                                                                                                                                                                                          |

#### BLOCK の要約（Orchestrator → implementer）

1. **B-01**: 試験計画 §15-2 と実装の乖離を、テスト追加（IT-H-06/07/08/09/12/13）と試験計画 §14-1 への記録の**両方**で閉じる。
2. **B-02**: `README.md:68-71` の `BASIC_AUTH_*` 案内を Better Auth 前提へ更新する。

#### 実行した検証

| 種別      | 内容                                                                                                | 結果                                                                        |
| --------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| gate      | `pnpm lint` / `pnpm type-check`                                                                     | pass                                                                        |
| gate      | `TURBO_FORCE=true pnpm test`（キャッシュ無効化して再実行）                                          | 87 files / 1,026 tests pass                                                 |
| gate      | `pnpm --filter @cookpit/web build`                                                                  | pass（`ƒ Proxy (Middleware)` を含む。MB-14 相当）                           |
| 静的      | `git diff --stat main..HEAD -- packages/domain packages/application packages/api-contract`          | 差分ゼロ（AC-06）                                                           |
| 静的      | `grep -rn BASIC_AUTH apps/web docs/0*.md`                                                           | 0 件（AC-08。ただし README.md に残存 = B-02）                               |
| 静的      | 新規 6 文書の相対リンク実在確認                                                                     | デッドリンク無し（実装計画内の 2 件は他ファイルへ書き込む断片のため対象外） |
| 反実仮想  | 0009 の SQL / スナップショットと `schema.ts` の突合（P-01）                                         | 除去した 3 行は no-op と確定                                                |
| black-box | PGlite + `createAuth().handler()` へ疑似 HTTP リクエスト（reviewer の一時スクリプト。リポジトリ外） | 下表のとおり                                                                |

black-box で実測した内容（試験計画の未実装 ID を暫定的に埋めるための証拠。CI の回帰にはならない）:

| 確認                                | 実測値                                                                                                                | 対応 ID                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 信頼済みでない Origin の sign-in    | `403 {"code":"INVALID_ORIGIN"}`（`trustedOrigins: []` でも同じ。同一オリジン・Origin 無しは 200）                     | IT-H-13 / E-12                            |
| HTTP 経由の sign-up                 | `400 {"code":"EMAIL_PASSWORD_SIGN_UP_DISABLED"}`                                                                      | IT-H-02 / F-04 / E-05 / BB-05             |
| `/api/auth/ok`                      | `200 {"ok":true}`                                                                                                     | BB-04                                     |
| レート制限（`storage: 'database'`） | 誤パスワード 3 回まで 401、4 回目から 429。`rate_limits` に 1 行 upsert                                               | IT-H-12 / E-06 / F-16、契約書 §10-7       |
| Cookie 属性（HTTPS baseURL）        | `__Secure-cookpit.session_token=...; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax`                         | IT-H-03 / F-09、契約書 §10-5              |
| キャッシュ Cookie サイズ            | `__Secure-cookpit.session_data` の `Set-Cookie` 全長 931 バイト（< 4 KB）                                             | IT-H-22 / B-08                            |
| セッション期限                      | `sessions.expires_at - created_at` = 30 日                                                                            | IT-H-19 / F-08                            |
| sign-out                            | `200 {"success":true}`、`session_token` / `session_data` / `dont_remember` を `Max-Age=0` で失効。Cookie 無しでも 200 | IT-H-06 / IT-H-24 / N-04、契約書 §10-10   |
| change-password                     | 11 文字 `400 PASSWORD_TOO_SHORT` / 129 文字 `400 PASSWORD_TOO_LONG` / 現在パスワード誤り `400 INVALID_PASSWORD`       | IT-H-08 / 14 / 17、E-10 / B-04            |
| revoke-other-sessions               | `200 {"status":true}`、`sessions` 行が 2 → 1。ただし他端末は `session_data` キャッシュが有効な間 `get-session` を通過 | IT-H-09 / N-05、契約書 §3.2（既知・許容） |

契約書 §10 の未解決項目のうち、5（Cookie の `Secure` 判定）・7（DB ストレージのレート制限）・9（429 の形）・10（`sign-out` / `revoke-other-sessions` の応答形）・11（HTTP 経由 sign-up のコード）・17（`session_data` の属性）は上表で実測できた。
**残る未確認は「Vercel の複数インスタンス + Neon での挙動」と「実 HTTPS / 実機での Cookie 永続」**（残余リスクへ記録）。

#### 試験計画との照合

- 実装済み: UT-P-01/02/04〜10/15〜30（UT-P-03・11〜14 は `config.matcher` の構造テストへ集約する旨をテストファイル冒頭に明記。前例 MW-M02〜M12 と同型で妥当）、UT-SW-01〜04、IT-H-01/01b/02/03/04/10、IT-S-01〜10、CT-01〜14（CT-08〜12 は `it.each`）・16・17(+17b)・18・19・21〜25・27〜29、E2E-03/04。
- 未実装: IT-H-05/06/07/08/09/11〜20/22/23/24、IT-INF-01、CT-15、CT-20（CT-26 は既存 NV-01〜08 がグリーンのため充足）。→ B-01。
- CT-15 / CT-20（Server Component）は、本リポジトリに `page.tsx` を直接レンダリングする試験の前例が無く（`apps/web/tests` に `page.test.tsx` は 0 件）、未実装自体は妥当。ただし **試験計画へ「対象外 + 理由」を書く**必要がある（B-01 の (b)）。
- 受け入れ条件（AC）: AC-01 充足（設計書 D-1〜D-19）/ AC-02 文書上は充足・実装は B-01 の乖離あり / **AC-03 充足**（lint・type-check・test・build を実行）/ AC-04・AC-05 未実施（人間）/ **AC-06 充足**（差分ゼロ）/ **AC-07 充足**（ADR-0022 Accepted・ADR-0021 Superseded）/ AC-08 コードは充足・README に残存（B-02）。

#### Orchestrator 指定観点への回答

1. **`pnpm dlx @better-auth/cli@1.4.21` 運用**: `cli.config.ts:9-21` に再生成コマンドと devDependency 化が壊れる理由が記載されており、第二段（`passkey()` 追加）での再現手順として十分。`cli.config.ts` は `server-only` を import せず `.env.local` を読むため CLI から単独実行できる。妥当。
2. **migration の手動除去**: P-01 のとおり no-op と確定。`0010_snapshot.json` は旧形式のキーを持たないため再発しない。
3. **vitest alias の `fileURLToPath` 化**: ASCII のみのパスでは `new URL(...).pathname` と出力が同一（`file:///a/b` → `/a/b`）。CI（ASCII パス）への影響なし。`server-only` の alias も同じ理由で是正済み。妥当。
4. **`/more/account` の `force-dynamic`**: 他の DB 参照ページ 12 件と同じ規約で整合。ただし同じ理由が `/more` にも当てはまる（F-03）。
5. **`docs/01-overview.md` の「複数ユーザー対応」是正**: 「複数ユーザー対応（ロール・3 人目以降の運用。2 名分のログイン認証自体は ADR-0022 で導入済み）」は要件書「対象外」（ロール・3 人目以降）と一致。事実整合あり。
6. **Proxy**: 応答表（302 / 401 / 503 と全応答 `no-store`）・`next` 文法・matcher・例外伝播・`Set-Cookie` 転送は契約書 §4 と設計書のコード例に一致（UT-P-01〜30 で網羅）。`getSessionCookie(request, { cookiePrefix: 'cookpit' })` と `advanced.cookiePrefix: 'cookpit'` は一致しており、実測した Cookie 名（`__Secure-cookpit.session_token`）とも整合（罠 2 を回避）。
7. **クライアント `safeNext`**: `/^\/(?![/\\])/` は契約書 §4.1 の文法と等価で、`//evil` / `/\evil` / `https://` / 空 / 2,000 文字超をすべて `/` に落とす（CT-08〜12 + 長さ分岐）。`window.location.assign` へ渡る値が相対パスに正規化されることを確認した。オープンリダイレクトの反例は見つからなかった（`searchParams` が配列になる `?next=a&next=b` でもカンマ結合により `//` 始まりにはならない）。
8. **`useApiAction` の 401**: 400 / 404 / 422 / 500 経路は `resolveFailureMessage` のまま（CT-29 で回帰）。`silent: true` でも遷移する（CT-28）。オフラインキューは同フックを経由しないため副作用は無いが、キュー側の 401 の扱いに別の穴がある（F-02）。
9. **SW**: `cacheWillUpdate` は `NetworkFirst` 2 件と `StaleWhileRevalidate` 1 件すべてに適用済み。`status === 200 && !response.redirected` により opaqueredirect（`status: 0`）を弾く（UT-SW-01〜04）。`/login` と `/api/auth/*` は matcher に無く runtime cache 対象外。ログアウト時の 3 キャッシュ破棄は `logout-button.tsx` でベストエフォート実装（CT-18）。
10. **スクリプト**: パスワードは引数を取らず env か TTY（エコー無効）で受け取り、標準出力にも例外メッセージにも出さない。終了コードは 0 / 1 / 2 が契約どおり（IT-S-01〜10 で実行確認。DB 接続失敗 = 2 も実測）。`allowSignUp: true` のインスタンスは `scripts/auth-create-user.ts` 内のローカル変数のみで、`getAuth()`（`allowSignUp: false`）とは別経路。本番コードから到達不能であることを確認した。

#### 人間の実機確認へ渡す最小項目（試験計画 §7 MB / §8 BB の圧縮）

固定チェック表（MB 15 + BB 11 = 26 項目）を全走査する必要はない。コードと black-box で確定できない
**5 項目**だけを実施すれば足りる。残りは上表の実測・単体テスト・ビルドで裏が取れている。

| #   | 項目                                                                                                                        | 理由（AI で代替できない点）                                                               | 対応 ID              |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------- |
| 1   | iOS ホーム画面 PWA でログイン → アプリ終了 → 再起動でログイン維持                                                           | `HttpOnly` Cookie の永続と ITP の扱いが OS 実装依存                                       | MB-01 / 02           |
| 2   | 通知クリックで PWA 起動（セッション有効時・失効時の両方）                                                                   | Web Push + standalone 起動の経路は実機でしか再現できない                                  | MB-05 / 09           |
| 3   | Android PWA でログイン → 再起動 → ログアウト                                                                                | 同上（ブラウザ差分の確認）                                                                | MB-06 / 07 / 08      |
| 4   | 本番 URL への `curl` 6 本（`/`・`/api/pantry`・`/login`・`/manifest.webmanifest`・`/api/cron/expiry-alerts`・`/api/authx`） | 本番の Proxy 実行環境で matcher と 302 / 401 が想定どおりかは実デプロイでしか確認できない | BB-01/02/03/06/09/11 |
| 5   | `/shopping-lists/<id>` を開いた状態でセッション失効 → 再ログイン → オフライン再訪問                                         | SW キャッシュと 302 の相互作用は実ブラウザの挙動                                          | MB-11                |

Tailwind の表示崩れ・ハンドラ結線は次のとおり機械的に確定済みのため、人間の確認項目から外した:
新規 UI が使うユーティリティ（`bg-destructive/5` / `border-destructive/30` / `bg-secondary` / `min-h-dvh` 等）は
いずれも既存画面で使用実績があり、`main` の下余白はグローバル CSS（`padding-bottom: calc(4.5rem + safe-area)`）で共通化されている。
送信・ログアウト・パスワード変更・他端末失効の各ハンドラは RTL テスト（CT-03/18/21〜24）で結線を確認済み。
それでも **項目 1〜3 の実機確認は `manual-browser-verify` Skill の書式（PASS / BLOCKED(理由) / FAIL）で本書へ追記する**こと。

#### security-reviewer への引き継ぎ（本レビューでは判断しない）

- レート制限のキーは、クライアント IP ヘッダが無い実行環境では `no-trusted-ip|/sign-in/email` という
  **全利用者共有の 1 バケット**へ退避する（Better Auth が警告ログを出す）。`x-forwarded-for` があれば IP 別になることは実測済みだが、
  `advanced.ipAddress.ipAddressHeaders` / `trustedProxies` は未設定であり、ヘッダの信頼境界（詐称による総当たり回避、
  逆に共有バケット化によるログイン不能）の評価は security-reviewer の担当範囲とする。
- `BETTER_AUTH_SECRET` 未設定 × production では保護対象が 503 になる一方、`/api/auth/*` は matcher の除外により
  到達可能なまま（Better Auth 既定 secret で動作する）。保護対象が全て 503 のため実害は見当たらないが、
  fail-closed の一貫性として security 側の判断を仰ぐ。

#### ドキュメント事実整合

- 更新済みで事実と一致: `docs/01-overview.md` / `02-tech-stack.md` / `03-architecture.md` / `05-roadmap.md` /
  ADR-0003 追記 / ADR-0021 Status（Superseded）/ ADR-0022（Accepted）/ `apps/web/e2e/README.md` / `.env.example`。
  実装計画 9-1〜9-9 はすべて実施済み（9-8 / 9-9 は「更新不要」の確認）。
- 不一致: `README.md:68-71`（B-02）。
- 契約書 §11-5 の実装時是正 3 件は、いずれも設計判断の変更ではなく記録として妥当。§10 の実測更新も本レビューの実測と矛盾しない。
