# Task 2: ループ状態と状態遷移 — bounded-repair-state.mjs

## 概要

有界修正ループの状態スキーマ・遷移表・永続化・二重実行防止を実装する。**ここが制御構造の
中核**で、まだ AI 修正処理は接続しない。永続化の原始関数は既存 `.claude/lib/harness-state.mjs`
の `withLock` / `atomicWriteJson` / `readJsonStrict` を**再利用**する（自前で書かない）。
保存先の解決は `harness-paths.mjs` の `stateDir()` / `statePath()` を使う。

新規ファイル: `.claude/lib/bounded-repair-state.mjs`

## アーキテクチャ制約

- Node ESM（`.mjs`）。**新規依存の追加は禁止**。
- デフォルトエクスポート禁止。`===` / `!==`。「値なし」は `null`。
- 公開関数には JSDoc（不変条件・`@throws`・冪等性のみ）。
- **読み取りは例外を投げず `{ ok, reason }` を返す。** 呼び出し側が fail-closed を選べるようにする
  （既存 `loadRunState` と同じ契約）。
- **秘密情報を状態に書かない**（U13）。環境変数は名前のみ、値は記録しない。
- 既存 `run-state.json` とその `validateRunState` は**一切変更しない**（U1）。

## 状態スキーマ（`<stateDir>/bounded-repair-state.json`）

```json
{
  "schemaVersion": 1,
  "stateVersion": 0,
  "runId": "run-...",
  "taskId": "",
  "phase": "implementing",
  "status": "active",
  "attempt": 0,
  "maxAttempts": 2,
  "replanCount": 0,
  "maxReplans": 0,
  "startedAt": "ISO 8601",
  "updatedAt": "ISO 8601",
  "deadlineAt": "ISO 8601",
  "modelCalls": 0,
  "maxModelCalls": 3,
  "toolCalls": 0,
  "maxToolCalls": 60,
  "inputTokens": null,
  "outputTokens": null,
  "maxTotalTokens": null,
  "estimatedCost": null,
  "maxEstimatedCost": null,
  "budgetSupport": { "tokens": "unsupported", "cost": "unsupported" },
  "changedFiles": [],
  "maxChangedFiles": 5,
  "addedLines": 0,
  "deletedLines": 0,
  "maxDiffLines": 150,
  "gateResults": [],
  "currentFailure": null,
  "lastFailureFingerprint": null,
  "consecutiveSameFailureCount": 0,
  "remainingRisks": [],
  "stopReason": null,
  "lease": null
}
```

- `phase`: `implementing` | `gates` | `repairing` | `blocked` | `completed` | `failed`
- `status`: `active` | `completed` | `needs_human_review` | `budget_exceeded` |
  `unsafe_change_detected` | `failed`
- `lease`: `null` または `{ owner: string, acquiredAt: ISO, expiresAt: ISO }`（U7 の実行中フラグ）
- `deadlineAt` は `startedAt + maxElapsedMs` で算出して**保存する**（毎回再計算しない。
  途中で上限を変えても既存 run の期限が伸びないようにするため）

`validateBoundedRepairState()` は既存 `validateRunState` と同じ厳格さで検証する:
未知フィールド拒否 / 必須欠落拒否 / 列挙値外拒否 / 非 ISO 8601 タイムスタンプ拒否。

## 状態遷移表（これ以外は拒否する）

| 現在 phase     | イベント                | 次 phase    | status                   | 条件                                           |
| -------------- | ----------------------- | ----------- | ------------------------ | ---------------------------------------------- |
| `implementing` | `gates_started`         | `gates`     | `active`                 | —                                              |
| `gates`        | `gates_passed`          | `completed` | `completed`              | 必須ゲート全合格・差分上限内・状態正常         |
| `gates`        | `repair_authorized`     | `repairing` | `active`                 | 開始条件すべて満たす（Task 6）                 |
| `gates`        | `human_review_required` | `blocked`   | `needs_human_review`     | 上限到達・同一失敗・自動修正対象外・未知の失敗 |
| `gates`        | `budget_exhausted`      | `blocked`   | `budget_exceeded`        | 時間・モデル呼び出し・ツール呼び出し上限       |
| `gates`        | `unsafe_change`         | `blocked`   | `unsafe_change_detected` | 保護対象変更・ゲート弱体化・テスト削除/skip    |
| `gates`        | `internal_error`        | `failed`    | `failed`                 | 状態保存失敗・ロック失敗・ゲート実行不能       |
| `repairing`    | `gates_started`         | `gates`     | `active`                 | 修正 1 回完了後の再実行                        |
| `repairing`    | `human_review_required` | `blocked`   | `needs_human_review`     | 修正中に判明した停止条件                       |
| `repairing`    | `budget_exhausted`      | `blocked`   | `budget_exceeded`        | 同上                                           |
| `repairing`    | `unsafe_change`         | `blocked`   | `unsafe_change_detected` | 同上                                           |
| `repairing`    | `internal_error`        | `failed`    | `failed`                 | 同上                                           |

**禁止する遷移（明示的に拒否し、テストで固定する）:**

| 禁止                                                     | 理由                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| `completed` → `repairing`                                | 完了済み run を自動再開しない                               |
| `failed` → `repairing`                                   | 失敗から自動再開しない                                      |
| `blocked`(`budget_exceeded`) → `repairing`               | 予算超過後に追加呼び出しをしない                            |
| `blocked`(`unsafe_change_detected`) → `repairing`        | 危険変更後に自動継続しない                                  |
| `blocked`(`needs_human_review`) → `repairing`            | 人間の介入なしに再開しない                                  |
| `completed` → `gates`                                    | 終了済みの再評価をしない                                    |
| 任意 → `implementing`                                    | ループは実装フェーズへ戻らない（新しい run として開始する） |
| `status` の `waiting_*` から AI 操作で `approved` 相当へ | 承認状態を AI が変更しない                                  |

## 実装対象ファイル

```js
// .claude/lib/bounded-repair-state.mjs

export const BOUNDED_REPAIR_SCHEMA_VERSION = 1
export const BOUNDED_REPAIR_FILENAME = 'bounded-repair-state.json'
export const LOOP_PHASES        // Object.freeze([...])
export const LOOP_STATUSES      // Object.freeze([...])
export const LOOP_EVENTS        // Object.freeze([...])
export const TERMINAL_STATUSES  // Object.freeze(['completed','needs_human_review','budget_exceeded','unsafe_change_detected','failed'])
export const ALLOWED_TRANSITIONS // Object.freeze({ [phase]: { [event]: { phase, status } } })

/** @returns {{ ok: true } | { ok: false, reason: string, detail: string }} */
export function validateBoundedRepairState(value)

/** 初期状態を作る。deadlineAt = startedAt + maxElapsedMs。 */
export function createLoopState({ runId, taskId = '', limits, now = new Date() })

/**
 * 遷移の可否を判定する（純粋関数・副作用なし）。
 * @returns {{ ok: true, phase: string, status: string }
 *          | { ok: false, reason: 'illegal_transition'|'terminal_state', detail: string }}
 */
export function canTransition(state, event)

/**
 * 遷移を適用した新しい状態を返す（保存はしない）。不正遷移は例外ではなく `{ ok: false }`。
 * stopReason は blocked / failed へ遷移するときのみ設定できる。
 */
export function applyTransition(state, event, { stopReason = null, now = new Date() } = {})

/** @returns {{ ok: true, state: object } | { ok: false, reason: string, detail: string }} */
export function loadLoopState(opts = {})

/**
 * compare-and-swap で保存する。`expectedVersion` が現在の `stateVersion` と一致しなければ
 * 書き込まず `{ ok: false, reason: 'version_conflict' }` を返す。成功時 stateVersion を +1。
 * 読み取りから書き込みまでを**単一のロック区間**に収める（lost update 防止）。
 */
export function saveLoopState(state, { expectedVersion, ...opts } = {})

/**
 * lease（実行中フラグ）を取得する。有効な他者の lease があれば失敗する。
 * `expiresAt` を過ぎた lease は孤児として回収してよい（U8・30 秒）。
 * @returns {{ ok: true, state: object } | { ok: false, reason: 'lease_held'|'version_conflict', detail: string }}
 */
export function acquireLease(state, { owner, ttlMs = 30_000, now = new Date(), ...opts } = {})

/** lease を解放する（冪等。自分の owner でない lease は解放しない）。 */
export function releaseLease(state, { owner, ...opts } = {})
```

## 公開識別子一覧（タイポ照合基準・この綴りを厳守）

`BOUNDED_REPAIR_SCHEMA_VERSION` / `BOUNDED_REPAIR_FILENAME` / `LOOP_PHASES` / `LOOP_STATUSES` /
`LOOP_EVENTS` / `TERMINAL_STATUSES` / `ALLOWED_TRANSITIONS` / `validateBoundedRepairState` /
`createLoopState` / `canTransition` / `applyTransition` / `loadLoopState` / `saveLoopState` /
`acquireLease` / `releaseLease`

イベント名: `gates_started` / `gates_passed` / `repair_authorized` / `human_review_required` /
`budget_exhausted` / `unsafe_change` / `internal_error`

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **読み取りから書き込みまでを 1 つのロック区間に収める（最重要）。** 既存
  `harness-state.mjs` の `updateRunState` のコメントに、これを守らず 4 並行中 3 件の更新が
  無言で消えた実測が記録されている。`loadLoopState()` を呼んでロック外で加工し
  `saveLoopState()` する実装にしてはいけない。**`withLock` の中で読んで書く**。
  `attempt` カウンタが失われると上限そのものが機能しなくなる。
- **孤児ロックの年齢は `mtime` で判定する。** 既存 `withLock` のコメントどおり、生成直後の
  ロックは内容が空になりうるため、内容ベースだと `Date.now() - 0` の巨大値になって
  **生きたロックを奪う**。lease も `expiresAt`（保存値）で判定し、内容の空文字に依存しない。
- **`blocked` は phase であり status ではない。** 停止理由の区別は `status`
  （`needs_human_review` / `budget_exceeded` / `unsafe_change_detected`）が担う。
  `phase: 'blocked'` だけ見て「人間レビュー待ち」と決めつける実装を書かない。
- **`TERMINAL_STATUSES` からの遷移は phase ではなく status で判定する。** `phase: 'blocked'`
  からの遷移可否は status によって変わる（どの停止理由でも `repairing` へは戻らない）。
- `stateVersion` は**保存側で +1** する。呼び出し側にインクリメントさせない（二重加算になる）。
- `deadlineAt` は保存値を使う。`startedAt + limits.maxElapsedMs` を毎回再計算すると、
  設定変更で既存 run の期限が伸びてしまう（上限の骨抜き）。
- 遷移表は**データとして持つ**（`ALLOWED_TRANSITIONS` オブジェクト）。`if/else` の羅列で
  書くと「禁止遷移のテスト」が実装の写しになり、抜けを検出できない。
- タイムスタンプは既存 `isIsoTimestamp()` を import して検証する（正規表現を再実装しない）。

## テスト

新規 `.claude/tests/bounded-repair-state.test.mjs`（一時ディレクトリを使い、実ユーザー状態を
触らない。既存 `harness-state.test.mjs` の `sandbox()` の作法に合わせる）:

**スキーマ**

- 正常な状態を検証できる / 未知フィールド拒否 / `schemaVersion` 不一致拒否 /
  必須欠落拒否 / 不正な `phase`・`status` 拒否 / 非 ISO 8601 拒否

**遷移**

- 許可された遷移だけ成功する（遷移表の全行をループで検証）
- `completed` → `repairing` を拒否
- `failed` → `repairing` を拒否
- `budget_exceeded` → `repairing` を拒否
- `unsafe_change_detected` → `repairing` を拒否
- `needs_human_review` → `repairing` を拒否
- 任意 → `implementing` を拒否
- 未知のイベント名を拒否

**永続化と二重実行**

- CAS: 古い `expectedVersion` での保存が `version_conflict` で失敗する
- 並行更新でカウンタが失われない（`attempt` を並行で +1 したとき最終値が正しい）
- 状態保存に失敗したら状態が変わっていない（部分書き込みが正式状態として読まれない）
- `acquireLease` が二重取得を拒否（`lease_held`）
- 期限切れ lease は回収できる（孤児 lease の安全な処理）
- `releaseLease` が他人の lease を解放しない・冪等である

## 完了条件

- [ ] `pnpm test:harness` 全 green
- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` 全 green
- [ ] 既存 `run-state.json` のスキーマ・`validateRunState` を変更していない（`git diff` で確認）
- [ ] 遷移表がデータとして定義され、禁止遷移のテストが全件ある
- [ ] 読み取り〜書き込みが単一ロック区間に収まっている
- [ ] 状態ファイルが `0600`・状態ディレクトリが `0700` で作成される
- [ ] 秘密情報を状態へ書いていない
