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
    "baseSha": "06686c52203c470f68917308af5176cf8446b80e",
    "digest": "sha256:f682b46ab9bc5b05f00834eee12038269cb5ea2281247b09bd9224fcf626468f",
    "source": "commit",
    "entryCount": 90
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
      "question": "この変更をマージした直後に本番へ反映してよいか。No なら Preview で買い物リスト生成・完了・献立同期・店舗削除を一巡させてから反映する。",
      "recommendation": "reject。即時反映は避け、Preview で書き込みを一巡させてからにする。自動試験は簡易 DB だけで、本番の接続方式での保存確定と失敗時の巻き戻しを観測できない。",
      "evidenceRefs": [
        "EV-02",
        "EV-03"
      ]
    },
    {
      "id": "H-02",
      "kind": "unknown",
      "question": "Sprint 9 申し送りの「チェック操作の往復削減」を、問い合わせ回数は変えず接続方式だけ変えた今回で完了として扱ってよいか。",
      "recommendation": "accept_risk。完了印は本番で 1 回測ってから付ける。回数は減っておらず 1 回あたりの費用差は本番でしか測れない。",
      "evidenceRefs": [
        "EV-06"
      ]
    }
  ],
  "residualRisks": [
    "本番の接続方式での保存確定・巻き戻しは自動試験で確認していない（確認は簡易 DB のみ）。",
    "接続の使い回しは既定 10 秒で切れるため、低頻度利用では毎回接続確立が起きうる（未計測）。",
    "BEGIN 失敗時に接続が返却されない既知のドライバ挙動は、取得待ち 5 秒でハングを切る緩和のみ。",
    "同時書き込みでの後勝ち上書きは従来どおり対象外の既知制約。"
  ],
  "behaviorChanges": [
    "買い物リストの生成・完了・献立同期・店舗削除が途中で失敗したとき、途中まで保存された内容が残らず操作前の状態に戻る。",
    "品目のチェックや編集が途中で失敗しても、品目が消えたままの中途半端な状態が残らない。",
    "画面表示と API の入出力・エラー表示は変わらない。変わるのは失敗時に部分的な結果が残らなくなる点だけ。",
    "期限アラートの日次配信の挙動は変わらない。配信の失敗で購読情報がまとめて取り消されることはない。",
    "データベースへの接続方法が変わるため、初回アクセスの応答時間や障害時の失敗の出方が変わる可能性がある。"
  ],
  "evidence": [
    {
      "id": "EV-01",
      "claim": "品質ゲート（harness / lint / type-check / test）が通る",
      "kind": "test",
      "result": "pass",
      "ref": "run-quality-gates.sh RESULT OK。web 872 tests / infrastructure UoW 含む"
    },
    {
      "id": "EV-02",
      "claim": "簡易 DB で確定・単一/横断の巻き戻し・包み外保存・入れ子拒否・ドメイン例外・並行拒否が通る",
      "kind": "test",
      "result": "pass",
      "ref": "packages/infrastructure/tests/uow/drizzle-unit-of-work.test.ts"
    },
    {
      "id": "EV-03",
      "claim": "接続プールに error リスナと 5 秒の取得待ち上限がある",
      "kind": "static",
      "result": "pass",
      "ref": "packages/infrastructure/src/db/client.ts pool.on('error') / connectionTimeoutMillis"
    },
    {
      "id": "EV-04",
      "claim": "書き込み 30 件は 1 トランザクションで包み、読み取りと期限アラート送信は包まない",
      "kind": "static",
      "result": "pass",
      "ref": "packages/application/src の unitOfWork.execute 30 件 / cron.ts は読み取り factory"
    },
    {
      "id": "EV-05",
      "claim": "HTTP 契約・入力検証・DB 定義・マイグレーションに差分がない",
      "kind": "static",
      "result": "pass",
      "ref": "git diff origin/main...HEAD -- packages/api-contract packages/infrastructure/src/db/schema.ts"
    },
    {
      "id": "EV-06",
      "claim": "品目チェックの SQL 形（delete + upsert）は変えず、接続方式だけを変えている",
      "kind": "static",
      "result": "pass",
      "ref": "drizzle-shopping-list.repository.ts の save 複文は維持。client.ts のみ neon-serverless"
    },
    {
      "id": "EV-07",
      "claim": "入場時の busy フラグで入れ子と並行の execute を拒否する",
      "kind": "test",
      "result": "pass",
      "ref": "drizzle-unit-of-work.ts busy / テスト『未完了の execute と並行した 2 本目も拒否する』"
    }
  ],
  "reviewer": {
    "agent": "reviewer",
    "model": "claude-opus-5",
    "reviewedAt": "2026-08-13T06:55:00.000Z"
  }
}
-->
## Review handoff

> **人間レビュー待ちです。**
> Claude の評価です。これは承認ではありません。以下の判断事項・残余リスク・振る舞い差分を確認してください。
> 対象: `sha256:f682b46ab9bc…` / R3 / 90 changes

### あなたが判断・確認すること（2 件）

1. **[不可逆] この変更をマージした直後に本番へ反映してよいか。No なら Preview で買い物リスト生成・完了・献立同期・店舗削除を一巡させてから反映する。** — 推奨: reject。即時反映は避け、Preview で書き込みを一巡させてからにする。自動試験は簡易 DB だけで、本番の接続方式での保存確定と失敗時の巻き戻しを観測できない。 / 証拠: EV-02, EV-03
2. **[未知] Sprint 9 申し送りの「チェック操作の往復削減」を、問い合わせ回数は変えず接続方式だけ変えた今回で完了として扱ってよいか。** — 推奨: accept\_risk。完了印は本番で 1 回測ってから付ける。回数は減っておらず 1 回あたりの費用差は本番でしか測れない。 / 証拠: EV-06

### 残余リスク・未確認

- 本番の接続方式での保存確定・巻き戻しは自動試験で確認していない（確認は簡易 DB のみ）。
- 接続の使い回しは既定 10 秒で切れるため、低頻度利用では毎回接続確立が起きうる（未計測）。
- BEGIN 失敗時に接続が返却されない既知のドライバ挙動は、取得待ち 5 秒でハングを切る緩和のみ。
- 同時書き込みでの後勝ち上書きは従来どおり対象外の既知制約。

### 振る舞い差分

- 買い物リストの生成・完了・献立同期・店舗削除が途中で失敗したとき、途中まで保存された内容が残らず操作前の状態に戻る。
- 品目のチェックや編集が途中で失敗しても、品目が消えたままの中途半端な状態が残らない。
- 画面表示と API の入出力・エラー表示は変わらない。変わるのは失敗時に部分的な結果が残らなくなる点だけ。
- 期限アラートの日次配信の挙動は変わらない。配信の失敗で購読情報がまとめて取り消されることはない。
- データベースへの接続方法が変わるため、初回アクセスの応答時間や障害時の失敗の出方が変わる可能性がある。

### 証拠

| ID | 主張 | 種別 | 結果 | 参照 |
| --- | --- | --- | --- | --- |
| EV-01 | 品質ゲート（harness / lint / type-check / test）が通る | test | pass | run-quality-gates.sh RESULT OK。web 872 tests / infrastructure UoW 含む |
| EV-02 | 簡易 DB で確定・単一/横断の巻き戻し・包み外保存・入れ子拒否・ドメイン例外・並行拒否が通る | test | pass | packages/infrastructure/tests/uow/drizzle-unit-of-work.test.ts |
| EV-03 | 接続プールに error リスナと 5 秒の取得待ち上限がある | static | pass | packages/infrastructure/src/db/client.ts pool.on\('error'\) / connectionTimeoutMillis |
| EV-04 | 書き込み 30 件は 1 トランザクションで包み、読み取りと期限アラート送信は包まない | static | pass | packages/application/src の unitOfWork.execute 30 件 / cron.ts は読み取り factory |
| EV-05 | HTTP 契約・入力検証・DB 定義・マイグレーションに差分がない | static | pass | git diff origin/main...HEAD -- packages/api-contract packages/infrastructure/src/db/schema.ts |
| EV-06 | 品目チェックの SQL 形（delete + upsert）は変えず、接続方式だけを変えている | static | pass | drizzle-shopping-list.repository.ts の save 複文は維持。client.ts のみ neon-serverless |
| EV-07 | 入場時の busy フラグで入れ子と並行の execute を拒否する | test | pass | drizzle-unit-of-work.ts busy / テスト『未完了の execute と並行した 2 本目も拒否する』 |

<details>
<summary>AI assessment</summary>

- blocking open: 0
- high-impact unverified: 0
- follow-up open: 2
- reviewer: reviewer / claude-opus-5
- reviewed at: 2026-08-13T06:55:00.000Z

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
