# レビュー記録: uow

<!-- review-readiness:begin -->
<!-- prettier-ignore-start -->

<!-- review-readiness:state
{
  "schemaVersion": 1,
  "feature": "uow",
  "status": "human_review_requested",
  "reviewTier": "R3",
  "subject": {
    "algorithm": "git-raw-v1",
    "baseSha": "9d03b3fb71310403be744e9b01d796940ab2e7c9",
    "digest": "sha256:61aef99b535d505f6bfb9e3d526200abeceb0d600d50a4323ad17522b8ddfc0b",
    "source": "index",
    "entryCount": 11
  },
  "aiAssessment": {
    "blockingOpen": 0,
    "highImpactUnverified": 0,
    "followUpOpen": 1
  },
  "humanItems": [],
  "residualRisks": [
    "書き込み時に毎回接続する方式の追加レイテンシは、本番で定量比較していない（U-2）。",
    "本番接続文字列が pooled か、および transaction pooling とセッション機能の制約は確認できていない（U-3 / U-4）。",
    "WebSocket 書き込み経路は本番で動作確認済みだが、実行時挙動を検証する自動テストはない。",
    "同時書き込みでの後勝ち上書きは、従来どおり対象外の既知制約として残る。"
  ],
  "behaviorChanges": [
    "買い物リストの生成・完了・献立同期・店舗削除が途中で失敗したとき、途中まで保存された内容が残らず操作前の状態に戻る。",
    "品目のチェックや編集が途中で失敗しても、品目が消えたままの中途半端な状態が残らない。",
    "画面表示と API の入出力・エラー表示は変わらない。",
    "期限アラートの日次配信の挙動は変わらない。",
    "最初の書き込み応答には、新しいデータベース接続を確立する時間が加わる可能性がある。"
  ],
  "evidence": [
    {
      "id": "EV-01",
      "claim": "品質ゲート（harness / lint / type-check / test）がすべて通る",
      "kind": "test",
      "result": "pass",
      "ref": ".claude/scripts/run-quality-gates.sh: RESULT OK（2026-08-17）"
    },
    {
      "id": "EV-02",
      "claim": "簡易 DB で確定・単一および横断の巻き戻し・包み外保存・入れ子拒否・並行拒否が通る",
      "kind": "test",
      "result": "pass",
      "ref": "packages/infrastructure/tests/uow/drizzle-unit-of-work.test.ts（UoW 17 tests）"
    },
    {
      "id": "EV-03",
      "claim": "リクエスト単位の接続が成功時と例外時のどちらでも閉じられる",
      "kind": "test",
      "result": "pass",
      "ref": "drizzle-unit-of-work.ts の finally close と対応テスト"
    },
    {
      "id": "EV-04",
      "claim": "書き込み操作はトランザクションで包み、読み取りと期限アラート送信は対象外になっている",
      "kind": "static",
      "result": "pass",
      "ref": "packages/application/src の書き込み 30 件と cron.ts の静的確認"
    },
    {
      "id": "EV-05",
      "claim": "HTTP 契約・入力検証・DB 定義・マイグレーションに変更がない",
      "kind": "static",
      "result": "pass",
      "ref": "origin/main との差分確認: packages/api-contract と schema/migrations は対象外"
    },
    {
      "id": "EV-06",
      "claim": "WebSocket の純 JavaScript 実装が成果物に入り、関連 PR のビルドと品質ゲートが通っている",
      "kind": "production_like",
      "result": "pass",
      "ref": "PR #174 / next.config.ts WS_NO_BUFFER_UTIL=1 / ビルド成果物確認"
    },
    {
      "id": "EV-07",
      "claim": "本番でトランザクションを有効にした書き込みと、従来の読み取りが成功した",
      "kind": "black_box",
      "result": "pass",
      "ref": "docs/decisions/ADR-0020-tx-connection-per-request.md と logs/2026-08-16.md"
    },
    {
      "id": "EV-08",
      "claim": "独立 reviewer の最終評価に未解消 BLOCK と未検証の高影響項目がない",
      "kind": "static",
      "result": "pass",
      "ref": "Claude Code reviewer（2026-08-17）: BLOCK 0 / high-impact unverified 0"
    }
  ],
  "reviewer": {
    "agent": "reviewer",
    "model": "claude-opus-4",
    "reviewedAt": "2026-08-17T08:18:00.000Z"
  }
}
-->
## Review handoff

> **人間レビュー待ちです。**
> Claude の評価です。これは承認ではありません。以下の判断事項・残余リスク・振る舞い差分を確認してください。
> 対象: `sha256:61aef99b535d…` / R3 / 11 changes

### あなたが判断・確認すること（0 件）

- 追加の主観・不可逆・未知の判断はありません。これは承認済みを意味しません。

### 残余リスク・未確認

- 書き込み時に毎回接続する方式の追加レイテンシは、本番で定量比較していない（U-2）。
- 本番接続文字列が pooled か、および transaction pooling とセッション機能の制約は確認できていない（U-3 / U-4）。
- WebSocket 書き込み経路は本番で動作確認済みだが、実行時挙動を検証する自動テストはない。
- 同時書き込みでの後勝ち上書きは、従来どおり対象外の既知制約として残る。

### 振る舞い差分

- 買い物リストの生成・完了・献立同期・店舗削除が途中で失敗したとき、途中まで保存された内容が残らず操作前の状態に戻る。
- 品目のチェックや編集が途中で失敗しても、品目が消えたままの中途半端な状態が残らない。
- 画面表示と API の入出力・エラー表示は変わらない。
- 期限アラートの日次配信の挙動は変わらない。
- 最初の書き込み応答には、新しいデータベース接続を確立する時間が加わる可能性がある。

### 証拠

| ID | 主張 | 種別 | 結果 | 参照 |
| --- | --- | --- | --- | --- |
| EV-01 | 品質ゲート（harness / lint / type-check / test）がすべて通る | test | pass | .claude/scripts/run-quality-gates.sh: RESULT OK（2026-08-17） |
| EV-02 | 簡易 DB で確定・単一および横断の巻き戻し・包み外保存・入れ子拒否・並行拒否が通る | test | pass | packages/infrastructure/tests/uow/drizzle-unit-of-work.test.ts（UoW 17 tests） |
| EV-03 | リクエスト単位の接続が成功時と例外時のどちらでも閉じられる | test | pass | drizzle-unit-of-work.ts の finally close と対応テスト |
| EV-04 | 書き込み操作はトランザクションで包み、読み取りと期限アラート送信は対象外になっている | static | pass | packages/application/src の書き込み 30 件と cron.ts の静的確認 |
| EV-05 | HTTP 契約・入力検証・DB 定義・マイグレーションに変更がない | static | pass | origin/main との差分確認: packages/api-contract と schema/migrations は対象外 |
| EV-06 | WebSocket の純 JavaScript 実装が成果物に入り、関連 PR のビルドと品質ゲートが通っている | production\_like | pass | PR \#174 / next.config.ts WS\_NO\_BUFFER\_UTIL=1 / ビルド成果物確認 |
| EV-07 | 本番でトランザクションを有効にした書き込みと、従来の読み取りが成功した | black\_box | pass | docs/decisions/ADR-0020-tx-connection-per-request.md と logs/2026-08-16.md |
| EV-08 | 独立 reviewer の最終評価に未解消 BLOCK と未検証の高影響項目がない | static | pass | Claude Code reviewer（2026-08-17）: BLOCK 0 / high-impact unverified 0 |

<details>
<summary>AI assessment</summary>

- blocking open: 0
- high-impact unverified: 0
- follow-up open: 1
- reviewer: reviewer / claude-opus-4
- reviewed at: 2026-08-17T08:18:00.000Z

</details>

<!-- prettier-ignore-end -->
<!-- review-readiness:end -->

## 監査ログ

### Task 1: 実装レビュー（2026-08-13）

独立 reviewer（claude-opus-5）と security-reviewer。初回の open BLOCK 1 件は後続コミットで処置した。

| ID           | action       | impact        | status   | 処置                                                                                                                 |
| ------------ | ------------ | ------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| R-01 / SEC-2 | BLOCK        | high          | resolved | `createDb` で Pool 生成直後に `pool.on('error')` を登録。ログは `err.message` のみ                                   |
| R-02 / SEC-1 | FOLLOW_UP    | medium / high | open     | `connectionTimeoutMillis: 5000` を入れて無期限待ちは切った。BEGIN 失敗時の接続未返却はドライバ側の既知挙動として残る |
| R-03         | FOLLOW_UP    | medium        | open     | 既定 `idleTimeoutMillis` 10 秒と往復コストは本番未計測。H-02                                                         |
| R-04         | FOLLOW_UP    | low           | resolved | I-6 試験追加、設計の `private run` 記述を実装に合わせて訂正、関連設計書 R-3 に ADR-0019 解消を追記                   |
| R-05         | PRE_EXISTING | low           | open     | 過去文書の neon-http 記述。棚卸し時                                                                                  |
| SEC-3        | FOLLOW_UP    | medium        | resolved | `busy` を `await` 前に立て、並行 execute も拒否。I-7 を追加                                                          |
| SEC-4        | FOLLOW_UP    | low           | resolved | URL 変更時に旧 Pool を `end()`                                                                                       |
| SEC-5        | PRE_EXISTING | high          | open     | `pnpm audit` の eslint / drizzle-kit 配下。今回追加の `ws` には該当なし                                              |

残 FOLLOW_UP 2 件: 本番レイテンシ実測（R-03 / H-02）と、drizzle の BEGIN が try の外にある接続未返却（SEC-1、5 秒タイムアウトで緩和）。

### Task 2: 本番構成反映後の最終レビューと Sprint 10 クローズ（2026-08-17）

PR #173 / #174 で接続方式と WebSocket バンドルが変わったため、Task 1 のパケットを現行差分で
再生成した。独立 reviewer（claude-opus-4）は未解消 BLOCK 0 件、未検証の高影響項目 0 件と評価。
ユーザーから Sprint 10 のクローズ記録更新と PR #175 のマージを実行する明示依頼を受けているため、
追加の人間判断項目は 0 件とした。

| ID   | action    | impact | status    | 処置                                                                          |
| ---- | --------- | ------ | --------- | ----------------------------------------------------------------------------- |
| R-06 | RESOLVED  | high   | resolved  | リクエスト単位の `Client` と `finally close()`、本番書き込み成功を確認        |
| R-07 | RESOLVED  | high   | resolved  | `WS_NO_BUFFER_UTIL=1` の純 JavaScript 経路と PR #174 の全チェック成功を確認   |
| R-08 | FOLLOW_UP | medium | carryover | U-2 の書き込みレイテンシ定量計測を次スプリントへ持ち越し                      |
| R-09 | FOLLOW_UP | medium | carryover | U-3 / U-4 と WebSocket 実行時自動テストを次スプリントへ持ち越し               |
| R-10 | RESOLVED  | medium | resolved  | アーキテクチャ・要件・設計・実装計画・試験・ADR・ロードマップを最終構成へ同期 |

対象ダイジェスト: `sha256:61aef99b535d505f6bfb9e3d526200abeceb0d600d50a4323ad17522b8ddfc0b`

実行証拠:

- `.claude/scripts/run-quality-gates.sh`: harness / lint / type-check / test の全項目 PASS
- Infrastructure: 118 tests（UoW 17 tests）、Application: 373 tests
- 本番 `DB_WRITE_TRANSACTION=on`: 書き込み一巡と読み取り経路の成功を 2026-08-16 に確認
- Sprint 10 完了条件: 3 / 3 達成
