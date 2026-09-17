# レビュー記録: better-auth-login

<!-- review-readiness:begin -->
<!-- prettier-ignore-start -->

<!-- review-readiness:state
{
  "schemaVersion": 1,
  "feature": "better-auth-login",
  "status": "human_review_requested",
  "reviewTier": "R3",
  "subject": {
    "algorithm": "git-raw-v1",
    "baseSha": "45a704c34af757040671fe1c02d9b624600f77bd",
    "digest": "sha256:3d6d19153b06ec6f0700723664bb5ed9e2af2429fc2bc49fbe347e145badfaea",
    "source": "commit",
    "entryCount": 66
  },
  "aiAssessment": {
    "blockingOpen": 0,
    "highImpactUnverified": 0,
    "followUpOpen": 2
  },
  "humanItems": [
    {
      "id": "H-01",
      "kind": "irreversible",
      "question": "「先行 PR #207 をマージ → 本 PR を rebase → 本 PR の CI が本番 Neon へ認証テーブルを追加 → マージ」の順序のまま進めますか？",
      "recommendation": "accept。テーブル追加のみで既存 9 テーブルへの差分が無いことは検証済み（EV-08）。#207 を先に入れないと依存監査が赤のまま残る。本番データへの不可逆な適用とマージ順序は運用判断で、AI が代わりに決められない。",
      "evidenceRefs": [
        "EV-08"
      ]
    },
    {
      "id": "H-02",
      "kind": "unknown",
      "question": "Vercel でしか確認できない 2 点（IP ごとの試行制限が効くか、ホーム画面 PWA でログインが維持されるか）を Preview と実機での確認に委ね、コードは今の内容で確定しますか？",
      "recommendation": "accept_risk。プラットフォームが付けるヘッダと OS の Cookie 永続はこの環境で再現できない。実機と Preview を持つ本人にしか確認できず、外れたときの受容も本人の判断になる。",
      "evidenceRefs": [
        "EV-07"
      ]
    },
    {
      "id": "H-03",
      "kind": "irreversible",
      "question": "旧方式の環境変数（BASIC_AUTH_*）の削除を、本番での応答確認と 2 名の実機確認が終わった後まで遅らせる順序で実行しますか？",
      "recommendation": "accept。先に削除すると前デプロイへ巻き戻したときに保護が無い時間帯が生まれる。削除の実行時点の判断と Vercel 操作は人間にしか行えない。",
      "evidenceRefs": [
        "EV-01"
      ]
    }
  ],
  "residualRisks": [
    "プラットフォームが付けるとされる IP ヘッダの実挙動は未検証。付与されない場合、試行回数の制限が全利用者共有の 1 枠へ退避する（総当たり防御の弱化、または正規ログインの巻き添え制限）。Preview での確認項目を追加したうえで受容する。",
    "他端末ログアウト・パスワード変更の失効は、対象端末のキャッシュ Cookie が切れるまで最大 5 分遅れる。DB のセッション行は即時削除されることを確認済みで、ADR-0023 に記録した既知の特性として受容する。",
    "iOS / Android のホーム画面 PWA でのログイン維持・通知クリック起動は未確認。実機確認で確定させる前提で受容する。",
    "保護を Proxy 1 箇所へ集約しているため、除外パスの追加や Proxy 自体の不具合が全画面の保護に直結する。設計上の選択として受容し、除外パスを変える際は境界テストを必ず伴わせる。",
    "本番 URL での応答確認（未認証の 302 / 401、除外パスの 200、定期実行の Bearer 判定）は未実施。デプロイ後の確認手順に委ねる。"
  ],
  "behaviorChanges": [
    "本番を開くとブラウザ標準のパスワード入力ダイアログではなく、アプリ内のログイン画面が出る。メールアドレスとパスワードでログインすれば、以後 30 日は聞かれない。",
    "「その他」画面にログアウトと「アカウント」が増え、アカウント画面で表示名・メールの確認、パスワード変更（12〜128 文字の案内と理由別のエラー表示）、他の端末からのログアウトができる。",
    "ログイン画面では下部のタブが消え、ログイン後は元々開こうとしていた画面へ戻る。",
    "操作中やオフライン分の送り直し中にログインが切れると、失敗メッセージではなくログイン画面へ移り、再ログイン後に元の画面と未送信のチェック操作が復帰する。",
    "ログアウトすると、オフライン表示のために端末へ残っていた買い物リストなどの一時データも消える。"
  ],
  "evidence": [
    {
      "id": "EV-01",
      "claim": "lint / type-check / test（1,046 件）/ format / build がキャッシュ無しで通る",
      "kind": "test",
      "result": "pass",
      "ref": "TURBO_FORCE=true pnpm test・pnpm lint・pnpm type-check / pnpm format:check / pnpm --filter @cookpit/web build（2026-09-17 再実行）"
    },
    {
      "id": "EV-02",
      "claim": "前回指摘 B-01 の追加テスト（IT-H-06/07/08/09/12/13/24）が実装され green。残る未実装 ID は試験計画 §14-3 に理由と代替つきで記録された",
      "kind": "test",
      "result": "pass",
      "ref": "apps/web/tests/server/auth/auth-route.test.ts:116-380 / docs/tests/better-auth-login.md §14-3・§15-2"
    },
    {
      "id": "EV-03",
      "claim": "前回指摘 B-02 が解消し、旧環境変数の記述が README を含めて 0 件になった",
      "kind": "static",
      "result": "pass",
      "ref": "README.md:8-14,65-72 / grep -rn BASIC_AUTH README.md apps/web docs/0[1-7]*.md = 0 件"
    },
    {
      "id": "EV-04",
      "claim": "セキュリティ指摘 SEC-1 が解消し、制御文字を含む遷移先と自オリジン以外へ解決される値はすべて / に落ちる",
      "kind": "counterfactual",
      "result": "pass",
      "ref": "apps/web/src/app/login/_components/login-form.tsx:17-44 / login-form.test.tsx の TAB・LF・CR ケース"
    },
    {
      "id": "EV-05",
      "claim": "前回の改善提案 3 件が反映され動作する（パスワード変更の理由別文言、送り直し 401 でのログイン誘導、/more の実行時レンダリング）",
      "kind": "test",
      "result": "pass",
      "ref": "change-password-form.test.tsx / use-checked-sync-queue.test.tsx UOQ-15,16 / build のルート一覧が ƒ /more"
    },
    {
      "id": "EV-06",
      "claim": "取り込み時の競合解決が安全側である（キャッシュ判定は取り込み元の条件を厳密に含み、401 時の退避経路も残置されている）",
      "kind": "static",
      "result": "pass",
      "ref": "apps/web/src/app/sw.ts:42-145（cacheWillUpdate は status 200 かつ非リダイレクトのみ許可）"
    },
    {
      "id": "EV-07",
      "claim": "認証ライブラリの IP 解決は値が複数あるヘッダを信頼せず null に落とすため、単一値ヘッダを優先する SEC-2 の修正方針は妥当（ただし実環境での付与は未検証）",
      "kind": "static",
      "result": "pass",
      "ref": "@better-auth/core dist/utils/ip.mjs:190（forwardedIps.length !== 1 で null）/ auth-route.test.ts の SEC-2 ケース"
    },
    {
      "id": "EV-08",
      "claim": "新規マイグレーションは認証 5 テーブルの追加のみで、既存 9 テーブルへの差分が無い",
      "kind": "counterfactual",
      "result": "pass",
      "ref": "apps/web/src/db/migrations/0010_majestic_namor.sql / 0009 の SQL とスナップショット比較（前回レビューで確定。差分なし）"
    }
  ],
  "reviewer": {
    "agent": "reviewer",
    "model": "claude-opus-5",
    "reviewedAt": "2026-09-17T14:40:00Z"
  }
}
-->
## Review handoff

> **人間レビュー待ちです。**
> Claude の評価です。これは承認ではありません。以下の判断事項・残余リスク・振る舞い差分を確認してください。
> 対象: `sha256:3d6d19153b06…` / R3 / 66 changes

### あなたが判断・確認すること（3 件）

1. **[不可逆] 「先行 PR \#207 をマージ → 本 PR を rebase → 本 PR の CI が本番 Neon へ認証テーブルを追加 → マージ」の順序のまま進めますか？** — 推奨: accept。テーブル追加のみで既存 9 テーブルへの差分が無いことは検証済み（EV-08）。\#207 を先に入れないと依存監査が赤のまま残る。本番データへの不可逆な適用とマージ順序は運用判断で、AI が代わりに決められない。 / 証拠: EV-08
2. **[未知] Vercel でしか確認できない 2 点（IP ごとの試行制限が効くか、ホーム画面 PWA でログインが維持されるか）を Preview と実機での確認に委ね、コードは今の内容で確定しますか？** — 推奨: accept\_risk。プラットフォームが付けるヘッダと OS の Cookie 永続はこの環境で再現できない。実機と Preview を持つ本人にしか確認できず、外れたときの受容も本人の判断になる。 / 証拠: EV-07
3. **[不可逆] 旧方式の環境変数（BASIC\_AUTH\_\*）の削除を、本番での応答確認と 2 名の実機確認が終わった後まで遅らせる順序で実行しますか？** — 推奨: accept。先に削除すると前デプロイへ巻き戻したときに保護が無い時間帯が生まれる。削除の実行時点の判断と Vercel 操作は人間にしか行えない。 / 証拠: EV-01

### 残余リスク・未確認

- プラットフォームが付けるとされる IP ヘッダの実挙動は未検証。付与されない場合、試行回数の制限が全利用者共有の 1 枠へ退避する（総当たり防御の弱化、または正規ログインの巻き添え制限）。Preview での確認項目を追加したうえで受容する。
- 他端末ログアウト・パスワード変更の失効は、対象端末のキャッシュ Cookie が切れるまで最大 5 分遅れる。DB のセッション行は即時削除されることを確認済みで、ADR-0023 に記録した既知の特性として受容する。
- iOS / Android のホーム画面 PWA でのログイン維持・通知クリック起動は未確認。実機確認で確定させる前提で受容する。
- 保護を Proxy 1 箇所へ集約しているため、除外パスの追加や Proxy 自体の不具合が全画面の保護に直結する。設計上の選択として受容し、除外パスを変える際は境界テストを必ず伴わせる。
- 本番 URL での応答確認（未認証の 302 / 401、除外パスの 200、定期実行の Bearer 判定）は未実施。デプロイ後の確認手順に委ねる。

### 振る舞い差分

- 本番を開くとブラウザ標準のパスワード入力ダイアログではなく、アプリ内のログイン画面が出る。メールアドレスとパスワードでログインすれば、以後 30 日は聞かれない。
- 「その他」画面にログアウトと「アカウント」が増え、アカウント画面で表示名・メールの確認、パスワード変更（12〜128 文字の案内と理由別のエラー表示）、他の端末からのログアウトができる。
- ログイン画面では下部のタブが消え、ログイン後は元々開こうとしていた画面へ戻る。
- 操作中やオフライン分の送り直し中にログインが切れると、失敗メッセージではなくログイン画面へ移り、再ログイン後に元の画面と未送信のチェック操作が復帰する。
- ログアウトすると、オフライン表示のために端末へ残っていた買い物リストなどの一時データも消える。

### 証拠

| ID | 主張 | 種別 | 結果 | 参照 |
| --- | --- | --- | --- | --- |
| EV-01 | lint / type-check / test（1,046 件）/ format / build がキャッシュ無しで通る | test | pass | TURBO\_FORCE=true pnpm test・pnpm lint・pnpm type-check / pnpm format:check / pnpm --filter @cookpit/web build（2026-09-17 再実行） |
| EV-02 | 前回指摘 B-01 の追加テスト（IT-H-06/07/08/09/12/13/24）が実装され green。残る未実装 ID は試験計画 §14-3 に理由と代替つきで記録された | test | pass | apps/web/tests/server/auth/auth-route.test.ts:116-380 / docs/tests/better-auth-login.md §14-3・§15-2 |
| EV-03 | 前回指摘 B-02 が解消し、旧環境変数の記述が README を含めて 0 件になった | static | pass | README.md:8-14,65-72 / grep -rn BASIC\_AUTH README.md apps/web docs/0\[1-7\]\*.md = 0 件 |
| EV-04 | セキュリティ指摘 SEC-1 が解消し、制御文字を含む遷移先と自オリジン以外へ解決される値はすべて / に落ちる | counterfactual | pass | apps/web/src/app/login/\_components/login-form.tsx:17-44 / login-form.test.tsx の TAB・LF・CR ケース |
| EV-05 | 前回の改善提案 3 件が反映され動作する（パスワード変更の理由別文言、送り直し 401 でのログイン誘導、/more の実行時レンダリング） | test | pass | change-password-form.test.tsx / use-checked-sync-queue.test.tsx UOQ-15,16 / build のルート一覧が ƒ /more |
| EV-06 | 取り込み時の競合解決が安全側である（キャッシュ判定は取り込み元の条件を厳密に含み、401 時の退避経路も残置されている） | static | pass | apps/web/src/app/sw.ts:42-145（cacheWillUpdate は status 200 かつ非リダイレクトのみ許可） |
| EV-07 | 認証ライブラリの IP 解決は値が複数あるヘッダを信頼せず null に落とすため、単一値ヘッダを優先する SEC-2 の修正方針は妥当（ただし実環境での付与は未検証） | static | pass | @better-auth/core dist/utils/ip.mjs:190（forwardedIps.length \!== 1 で null）/ auth-route.test.ts の SEC-2 ケース |
| EV-08 | 新規マイグレーションは認証 5 テーブルの追加のみで、既存 9 テーブルへの差分が無い | counterfactual | pass | apps/web/src/db/migrations/0010\_majestic\_namor.sql / 0009 の SQL とスナップショット比較（前回レビューで確定。差分なし） |

<details>
<summary>AI assessment</summary>

- blocking open: 0
- high-impact unverified: 0
- follow-up open: 2
- reviewer: reviewer / claude-opus-5
- reviewed at: 2026-09-17T14:40:00Z

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
- 受け入れ条件（AC）: AC-01 充足（設計書 D-1〜D-19）/ AC-02 文書上は充足・実装は B-01 の乖離あり / **AC-03 充足**（lint・type-check・test・build を実行）/ AC-04・AC-05 未実施（人間）/ **AC-06 充足**（差分ゼロ）/ **AC-07 充足**（ADR-0023 Accepted・ADR-0021 Superseded）/ AC-08 コードは充足・README に残存（B-02）。

#### Orchestrator 指定観点への回答

1. **`pnpm dlx @better-auth/cli@1.4.21` 運用**: `cli.config.ts:9-21` に再生成コマンドと devDependency 化が壊れる理由が記載されており、第二段（`passkey()` 追加）での再現手順として十分。`cli.config.ts` は `server-only` を import せず `.env.local` を読むため CLI から単独実行できる。妥当。
2. **migration の手動除去**: P-01 のとおり no-op と確定。`0010_snapshot.json` は旧形式のキーを持たないため再発しない。
3. **vitest alias の `fileURLToPath` 化**: ASCII のみのパスでは `new URL(...).pathname` と出力が同一（`file:///a/b` → `/a/b`）。CI（ASCII パス）への影響なし。`server-only` の alias も同じ理由で是正済み。妥当。
4. **`/more/account` の `force-dynamic`**: 他の DB 参照ページ 12 件と同じ規約で整合。ただし同じ理由が `/more` にも当てはまる（F-03）。
5. **`docs/01-overview.md` の「複数ユーザー対応」是正**: 「複数ユーザー対応（ロール・3 人目以降の運用。2 名分のログイン認証自体は ADR-0023 で導入済み）」は要件書「対象外」（ロール・3 人目以降）と一致。事実整合あり。
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
  ADR-0003 追記 / ADR-0021 Status（Superseded）/ ADR-0023（Accepted）/ `apps/web/e2e/README.md` / `.env.example`。
  実装計画 9-1〜9-9 はすべて実施済み（9-8 / 9-9 は「更新不要」の確認）。
- 不一致: `README.md:68-71`（B-02）。
- 契約書 §11-5 の実装時是正 3 件は、いずれも設計判断の変更ではなく記録として妥当。§10 の実測更新も本レビューの実測と矛盾しない。

### Task 2: closure review（2026-09-17 / reviewer: claude-opus-5）

- 対象: `feat/better-auth-login` の `origin/main..HEAD`（28 コミット・66 エントリ）。base `origin/main` = `45a704c`。
- subject digest: `sha256:3d6d19153b06ec6f0700723664bb5ed9e2af2429fc2bc49fbe347e145badfaea`（`--source commit`）。
- state: `human_review_requested`（open BLOCK 0 / high 未検証 0 / FOLLOW_UP open 2）。これは承認ではなく、人間へ判断材料を渡せる状態を指す。
- 注記: 先行 PR #207 のマージ後に再 rebase すると digest が変わるため、その時点で `subject` の再計算と `render` が必要。

#### 前回指摘の解消確認

| ID   | 処置                                                                                                                                           | reviewer の検証                                                                                                                                                                                                                    | status                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| B-01 | (a) `auth-route.test.ts` に IT-H-06/07/08/09/12/13/24 を追加 (b) 試験計画 §14-3 に未実装 ID の理由・代替を記録し §15-2 を実態へ更新（87/102）  | `apps/web/tests/server/auth/auth-route.test.ts:116-380` を読み、Cookie 属性 + `Max-Age=0` 失効 + DB 行削除（IT-H-06）、`session_data` を落として DB 再検証を強制する他端末失効（IT-H-09）、4 回目 429（IT-H-12）を確認。全件 green | resolved               |
| B-02 | `README.md` の 2 箇所（冒頭「このリポジトリについて」・ローカル起動）を Better Auth 前提へ置換                                                 | `README.md:8-14,65-72` を確認。`grep -rn "BASIC_AUTH" README.md apps/web docs/0[1-7]*.md` = 0 件                                                                                                                                   | resolved               |
| F-01 | `change-password-form.tsx` に `resolveChangePasswordErrorMessage()`（429 / `PASSWORD_TOO_SHORT`・`TOO_LONG` / 既定）と `minLength`・ヒント追加 | 分岐が前回実測（EV-06: 400 `PASSWORD_TOO_SHORT`/`TOO_LONG`、429）と一致。既定が現行文言のままで列挙防止も維持。テスト追加あり                                                                                                      | resolved               |
| F-02 | `use-api-action.ts` から `redirectToLogin()` を export し、キューの再送 401 で op を残したまま遷移。UOQ-15/16 追加                             | `use-checked-sync-queue.ts:170-175` を確認。`return` でループを打ち切り `finally` が実行フラグを解除するため再入も安全。404/422/5xx の既存分岐は不変（回帰なし）                                                                   | resolved               |
| F-03 | `/more/page.tsx` に `force-dynamic`                                                                                                            | 再ビルドのルート一覧が `ƒ /more` / `ƒ /more/account` に変化（前回は `○ /more`）                                                                                                                                                    | resolved               |
| P-01 | —                                                                                                                                              | 変更なし。0010 の migration は追加のみのまま                                                                                                                                                                                       | resolved（前回どおり） |

#### security 指摘の統合確認（判断は security-reviewer、反映確認のみ実施）

- SEC-1（BLOCK）: `login-form.tsx:17-44` で制御文字（`\x00-\x1f\x7f`）を拒否し、`new URL(value, window.location.origin)` の origin 一致で二重化。`/\t//evil.com` 等 3 ケースをテストに追加し、正常系（`/shopping-lists/abc?x=1`）が維持されることも確認。契約書 §4.1 の ABNF も `%x20-2E` 起点へ是正済み。**resolved**。
  - 補足: サーバー側 `buildNextParam` は制御文字を明示的に落とさないが、`nextUrl.pathname` は percent-encode 済みの文字列しか返さないため文法違反値を生成できない（穴ではない）。
- SEC-2（high）: `create-auth.ts:49-56` に `ipAddressHeaders: ['x-vercel-forwarded-for', 'x-forwarded-for']`。ライブラリ実装（`@better-auth/core` `dist/utils/ip.mjs:190`）が「値が複数あるヘッダは信頼せず null」であることを実読で確認したため、単一値ヘッダを優先する方針は妥当。**実環境でのヘッダ付与は未検証**のため残余リスク + Preview 確認項目として扱う。
- SEC-3 / SEC-4 / SEC-5: ADR-0023 §残るリスクへ 5 分遅延を追記、`apps/web/e2e/README.md` の実値パスワード除去、設計書・契約書へ `/api/auth/*` の 500 追記をそれぞれ確認。**resolved**。
- SEC-10: 先行 PR #207 に委譲。本 PR 側のコード変更なし。人間項目 H-01（マージ順序）に統合した。

#### 取り込み（rebase）時の競合解決の評価

- `sw.ts`: `cacheWillUpdate`（`status === 200 && !redirected`）は `origin/main` の `cacheOnlyOk`（`status === 200`）を厳密に含むため機能後退なし。`redirectToRootOn401` を残したのも妥当（Better Auth 移行後は未認証 navigation が 302 になるため通常到達しないが、想定外の 401 に対する退避経路として無害）。
- `proxy.ts`: 本 feature 側の全採用は要件 E-02 / E-04 と契約書 §4 に一致。401 は JSON + `Content-Type` を持つため、`f9b953d`（iOS Safari のダウンロード扱い）の再発条件を満たさない。ただし **503 は本文も `Content-Type` も持たない**ままで、`f9b953d` が 503 にも本文を付けた意図は引き継がれていない（下記 FU-A）。

#### 新規 FOLLOW_UP（今回は止めない）

| ID   | action      | impact | evidence | status | path:line                                               | 根拠・再現                                                                                                                                                                                                                                                                                                                                                                  | 修正案                                                                                                                                                                                                                              |
| ---- | ----------- | ------ | -------- | ------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FU-A | `FOLLOW_UP` | low    | E1       | open   | `apps/web/src/proxy.ts:34`                              | `origin/main` の `f9b953d`（2026-09-16 の iOS Safari 障害対応）は 401 と **503 の両方**に HTML 本文 + `Content-Type` を付けた。本 PR の 503 は `new NextResponse(null, ...)` で本文・`Content-Type` ともに無く、同障害の「不明なファイル扱い → ダウンロード提案 → 完了しない」条件を 503 側だけ満たしうる。発生は `BETTER_AUTH_SECRET` 未設定 × production の設定不備時のみ | 要件 E-04 / 契約書 §4 / UT-P-09 が「本文なし」を明示しているため、仕様変更として扱う。(a) 503 に最小 HTML（`f9b953d` の `UNAVAILABLE_HTML` 相当）を付け 3 文書と UT-P-09 を更新するか、(b) 本文なしを維持する理由を設計書へ記録する |
| FU-B | `FOLLOW_UP` | low    | E1       | open   | `apps/web/tests/server/auth/auth-route.test.ts:376-400` | IT-H-13（Origin 検査）は `NODE_ENV=test` で検査がスキップされる制約を回避するため `betterAuth(...)` を**テスト内に再定義**して検証している。ライブラリの挙動は確認できるが、`create-auth.ts` 側の設定（`trustedOrigins` の受け渡し・将来 `disableOriginCheck` を足す等）の後退は検知できない                                                                                | `createAuth()` の戻り値の `options.trustedOrigins` / `advanced` を直接アサートする軽量ケースを 1 本足すか、`create-auth.ts` に `disableOriginCheck: false` を明示して同じ経路をテストから使えるようにする                           |

#### PRE_EXISTING（本 PR の差分外）

- `pnpm test:harness` の `harness-state.test.mjs:301` が日本語パス環境で `URL#pathname` により 1 件失敗する。本 feature の差分外で、先行 PR #207 で修正済みと報告を受けている。今回の受け入れ判定からは分離する。

#### 実行した検証（closure）

| 種別 | 内容                                                                                              | 結果                                                                   |
| ---- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| gate | `TURBO_FORCE=true pnpm lint` / `pnpm type-check`                                                  | pass                                                                   |
| gate | `TURBO_FORCE=true pnpm test`                                                                      | 5 パッケージ green（web 87 files / 1,046 tests、合計 2,345 tests）     |
| gate | `pnpm format:check`                                                                               | pass                                                                   |
| gate | `pnpm --filter @cookpit/web build`                                                                | pass（`✓ Compiled successfully` / `ƒ /more` / `ƒ Proxy (Middleware)`） |
| 静的 | ADR 振り直しの整合（`ADR-0022` の残存参照が review-readiness 側のみ、`ADR-0023` が実在）          | pass                                                                   |
| 静的 | `grep -rn "BASIC_AUTH" README.md apps/web docs/0[1-7]*.md`                                        | 0 件                                                                   |
| 静的 | `@better-auth/core` の `getIPFromHeader` 実読（複数値ヘッダ → null）                              | SEC-2 の方針が妥当であることを確認                                     |
| 差分 | `git diff --stat origin/main..HEAD -- packages/domain packages/application packages/api-contract` | 差分ゼロ（AC-06 維持）                                                 |

#### 人間の実機確認へ渡す最小項目（更新版）

前回の 5 項目に security 由来の Preview 確認 1 項目を足した **6 項目**で足りる。固定チェック表（MB 15 + BB 11）の全走査は不要。

| #   | 項目                                                                                                                        | 理由（AI で代替できない点）                                          | 対応 ID              |
| --- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------- |
| 1   | iOS ホーム画面 PWA でログイン → 終了 → 再起動でログイン維持                                                                 | Cookie 永続と ITP の扱いが OS 実装依存                               | MB-01 / 02           |
| 2   | 通知クリックで PWA 起動（セッション有効時・失効時）                                                                         | Web Push + standalone 起動は実機でのみ再現できる                     | MB-05 / 09           |
| 3   | Android PWA でログイン → 再起動 → ログアウト                                                                                | ブラウザ差分の確認                                                   | MB-06 / 07 / 08      |
| 4   | Preview で `X-Forwarded-For` を変えた連打が IP ごとに 429 に分かれるか（併せてログインが 403 にならないこと）               | プラットフォームのヘッダ付与と信頼境界は実環境でしか判らない         | SEC-2 / SEC-7 BB     |
| 5   | 本番 URL への `curl` 6 本（`/`・`/api/pantry`・`/login`・`/manifest.webmanifest`・`/api/cron/expiry-alerts`・`/api/authx`） | 本番の Proxy 実行環境での matcher と応答は実デプロイでのみ確認できる | BB-01/02/03/06/09/11 |
| 6   | `/shopping-lists/<id>` を開いた状態でセッション失効 → 再ログイン → オフライン再訪問                                         | SW キャッシュと 302 の相互作用は実ブラウザの挙動                     | MB-11                |

Tailwind の表示崩れ・ハンドラ結線は前回同様に機械的確認で確定しており、人間の再走査は求めない
（新規追加分のヒント文言・`minLength` も RTL テストで結線を確認済み）。
