# Task 6: ループ制御と CLI — bounded-repair-loop.mjs / bounded-repair.mjs

## 概要

Task 1〜5 を束ね、**開始条件の判定・終了判定・構造化報告**を行う制御層と、その CLI を実装する。
ここが「すべてのガードを通過した場合のみ、既存の AI 実装処理を 1 回だけ許可する」門番になる。

- 新規: `.claude/lib/bounded-repair-loop.mjs`
- 新規: `.claude/scripts/bounded-repair.mjs`（CLI）

## 前提: AI 実装処理との接続方法（重要・誤解しやすい）

本リポジトリに**プログラム的なモデル呼び出し口は存在しない**（Anthropic SDK 依存なし、
`claude -p` / `messages.create` の呼び出しも無い）。実装ハーネスは Orchestrator が対話的に
起動する Claude Code Subagent である。したがって:

- ループは**自律的にモデルを呼ぶ駆動役ではなく、修正許可を出す門番**として実装する。
- `authorize` サブコマンドが全ガードを検査し、通過したときだけ
  **「1 回分の修正許可（repair permit）」**を発行して状態へ記録する（U3: 発行 = 消費）。
- 実際の修正は既存の実装ハーネス（Subagent）が行う。その修正が上限内に収まっていたかは
  `record-repair` と Task 5 の差分検査が**事後に強制**する。
- 上限超過後に AI が編集を続けられないことは **Task 7 の Hook** が強制する。

**モデル API を呼ぶコードを書かないこと。** `fetch` で外部 API を叩く実装は禁止。

## アーキテクチャ制約

- Node ESM（`.mjs`）。**新規依存の追加は禁止**。
- デフォルトエクスポート禁止。`===` / `!==`。「値なし」は `null`。
- **`while (true)` 禁止。終了条件のない再帰禁止。** ループは「1 回の許可発行」を単位とし、
  外側の反復は CLI の再実行で行う（プロセス内で無限に回さない）。
- **例外時にループを続行しない。** 想定外の例外は `internal_error` → `failed` へ遷移して終了。
- **状態保存前に次の許可を発行しない。** 保存失敗時は許可を発行せず `failed`。
- 上限値は Task 1 の `resolveLimits()` から取得する（数値をここに書かない）。

## ループ開始条件（`authorize` が全件検査する。1 つでも欠けたら安全停止）

| #   | 条件                                                                                   | 満たさない場合の status / stopReason               |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | run 状態が正常に読める（既存 `loadRunState`）                                          | `failed` / `state_error`                           |
| 2   | ループ状態が正常に読める・検証を通る                                                   | `failed` / `state_error`                           |
| 3   | ロックと lease を取得できる                                                            | `failed` / `lock_unavailable`                      |
| 4   | 品質ゲートが**実際に実行された**（`not_run` でない）                                   | `blocked` / `gates_not_run`                        |
| 5   | 失敗種別が自動修正可能（`isAutoRepairable`）                                           | `needs_human_review` / `not_auto_repairable`       |
| 6   | 保護対象の変更が無い                                                                   | `unsafe_change_detected` / `protected_file_change` |
| 7   | 高リスク変更が無い                                                                     | `needs_human_review` / `high_risk_change`          |
| 8   | 差分が上限内                                                                           | `needs_human_review` / `max_changed_files` ほか    |
| 9   | 予算内（時間・モデル呼び出し・ツール呼び出し）                                         | `budget_exceeded` / 該当上限名                     |
| 10  | `attempt < maxAttempts`                                                                | `needs_human_review` / `max_attempts_reached`      |
| 11  | 同一失敗が連続していない（`consecutiveSameFailureCount <= maxConsecutiveSameFailure`） | `needs_human_review` / `same_failure_repeated`     |
| 12  | 人間承認待ちでない（run 状態の `approvalStatus !== 'pending'`）                        | `blocked` / `approval_required`                    |
| 13  | 外部環境障害でない（`infrastructure_failure` でない）                                  | `needs_human_review` / `infrastructure_failure`    |
| 14  | 状態遷移が許可されている（`canTransition`）                                            | `failed` / `illegal_transition`                    |

**`maxAttempts: 0` のときは 1 回も許可を発行しない**（条件 10 で即停止）。

## 終了判定

### `completed`（すべて満たすときのみ）

- 必須ゲートがすべて合格（`evaluateRequiredGates` が `ok: true`）
- `requireE2E` のとき E2E が実行済みかつ 1 件以上成功（U12）
- 実行テスト数が 0 でない
- 保護対象への未承認変更なし
- 差分上限内
- 状態が正常
- `remainingRisks` に Critical が無い

### その他の終了状態

`needs_human_review` / `budget_exceeded` / `unsafe_change_detected` / `failed` は
上表と README の遷移表どおり。**すべての終了状態で `stopReason` を必ず設定して保存する。**

## 修正時に渡すコンテキスト（限定する）

`authorize` は、修正に必要な最小限の情報だけを構造化して出力する。**リポジトリ全体や
会話履歴全体を再投入しない。**

含めるもの: 元のタスク目標 / 受入条件 / 今回の失敗種別 / 失敗したゲート /
正規化されたエラー概要 / 関連する失敗テスト / 関連ファイル / 現在の差分の要約 /
変更禁止領域 / 残り試行回数 / 残り時間 / 残り予算

含めないもの: ログ全文（`logReference` のみ）/ 秘密情報 / 無関係なファイルの内容

出力に必ず次の制約文を含める（プロンプト側の明示。**コードで検証できる分は Task 5 が強制**）:

```
- この失敗だけを修正する
- スコープを拡大しない
- 品質ゲートを弱体化しない
- テストを削除・skip しない
- 保護対象を変更しない
- 要件を勝手に変更しない
```

## 人間への報告（安全停止時。この形で保存・出力する）

```json
{
  "runId": "run-...",
  "status": "needs_human_review",
  "stopReason": "same_failure_repeated",
  "attempt": 2,
  "maxAttempts": 2,
  "failedGate": "unit_tests",
  "failureType": "unit_test_failure",
  "failureSummary": "短い説明",
  "failureFingerprint": "hash",
  "changedFiles": [],
  "diffSummary": { "files": 3, "addedLines": 42, "deletedLines": 10 },
  "lastActions": [],
  "gateResults": [],
  "recommendedHumanAction": "確認すべき内容",
  "remainingRisks": []
}
```

秘密情報とログ全文は含めない（`logReference` のみ）。

## CLI（`.claude/scripts/bounded-repair.mjs`）

```
node .claude/scripts/bounded-repair.mjs start        [--task-id <id>] [--max-attempts N] [--require-e2e]
node .claude/scripts/bounded-repair.mjs status       [--json]
node .claude/scripts/bounded-repair.mjs gates        [--level 1|2|3]
node .claude/scripts/bounded-repair.mjs authorize
node .claude/scripts/bounded-repair.mjs record-repair --files <n> --added <n> --deleted <n>
node .claude/scripts/bounded-repair.mjs resume
node .claude/scripts/bounded-repair.mjs cancel       [--reason <text>]
node .claude/scripts/bounded-repair.mjs report       [--json]
```

作法は既存 `.claude/scripts/harness-run.mjs` に合わせる（`parseArgs` の形・`fail()` で
stderr + `process.exit(1)`・日本語メッセージ）。

**終了コードの意味づけ**（CI と人間の双方が判定できるように）:

| コード | 意味                                                                            |
| ------ | ------------------------------------------------------------------------------- |
| 0      | 成功（`authorize` は許可発行、`gates` は全合格、`status` は正常表示）           |
| 1      | 安全停止（`needs_human_review` / `budget_exceeded` / `unsafe_change_detected`） |
| 2      | 使い方の誤り（不正な引数）                                                      |
| 3      | 内部エラー（`failed`。状態保存失敗・ロック失敗・ゲート実行不能）                |

**`resume` の制約（U15）**: 中断された同一ステップの安全な再開のみ。終了済み status
（`completed` / `failed` / `budget_exceeded` / `unsafe_change_detected` / `needs_human_review`）の
run は**再開しない**（`fail()` で終了）。上限の引き上げ・停止解除を行うオプションは**作らない**。

**`cancel`**: 状態を安全に保存し、新たな変更を開始しない。`status` を `failed`、
`stopReason` を `cancelled_by_human` にする。lease を解放する。

## 実装対象ファイル

```js
// .claude/lib/bounded-repair-loop.mjs

/**
 * 修正を開始してよいかを全件検査する（副作用なし・純粋に近い判定関数）。
 * @returns {{ ok: true, remaining: { attempts, elapsedMs, modelCalls, toolCalls } }
 *          | { ok: false, status: string, stopReason: string, detail: string }}
 */
export function checkStartConditions({ runState, loopState, gates, failure, diff, limits, now })

/** 終了判定。completed の条件を満たすかを検査する。 */
export function evaluateCompletion({ loopState, gates, diff, requireE2E })

/** 予算判定。unsupported な項目は評価対象外にし、代替上限で必ず縛る（U2）。 */
export function checkBudget({ loopState, limits, now })

/** 修正エージェントへ渡す最小コンテキストを組み立てる（秘密情報・ログ全文を含めない）。 */
export function buildRepairContext({ loopState, gates, failure, diff, limits })

/** 安全停止時の構造化報告を組み立てる。 */
export function buildStopReport({ loopState, gates, failure, diff })

/** 観測用の 1 行サマリ（ログ追記用。状態とは別）。 */
export function buildObservabilityRecord(loopState)
```

## 公開識別子一覧（タイポ照合基準・この綴りを厳守）

`checkStartConditions` / `evaluateCompletion` / `checkBudget` / `buildRepairContext` /
`buildStopReport` / `buildObservabilityRecord`

stopReason の綴り: `state_error` / `lock_unavailable` / `gates_not_run` / `not_auto_repairable` /
`protected_file_change` / `high_risk_change` / `max_changed_files` / `max_diff_lines` /
`scope_expansion` / `gate_weakening` / `max_attempts_reached` / `same_failure_repeated` /
`approval_required` / `infrastructure_failure` / `illegal_transition` / `max_elapsed_ms` /
`max_model_calls` / `max_tool_calls` / `cancelled_by_human`

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **`while (true)` を書かないこと（最重要）。** 「品質ゲート再実行 → 再判定」の反復を
  プロセス内のループで書くと禁止事項に触れる。1 回の CLI 実行 = 1 回の判定 or 1 回の許可発行。
  反復は呼び出し側（人間 / Orchestrator）が CLI を再実行する形にする。
- **状態保存の成功を確認してから許可を発行する。** `saveLoopState()` が
  `{ ok: false }`（`version_conflict` など）を返したら、**許可を発行せず** exit 3。
  「保存前に次の AI 呼び出しを開始しない」という不変条件はここで守られる。
- **`modelCalls` は許可発行と同一のロック区間でインクリメントする。** 別トランザクションに
  すると、並行実行で 2 回発行されて上限を超える（U7 の CAS が効かない）。
- **予算が `unsupported` の項目を「上限なし」にしない。** `maxTotalTokens === null` のとき、
  トークン評価はスキップするが**時間と回数の上限は必ず評価する**。全項目が
  `null` だからといって `checkBudget` が `ok: true` を返す実装にしてはいけない。
- **`attempt` のインクリメント位置を間違えない。** `authorize` 成功時に +1 する
  （＝許可を出した回数）。ゲート実行時に +1 すると、初回ゲート（修正前）が 1 回目として
  数えられ、実際の修正回数が `maxAttempts` + 1 回になる。
- **`残り時間` は `deadlineAt` から算出する。** `startedAt + maxElapsedMs` を再計算しない
  （Task 2 の注意点と同じ理由）。
- CLI の `resume` に「上限を上げる」「停止を解除する」オプションを**作らない**。
  引数として受け取らなければ、AI がそれを使うことは原理的にできない。
- 既存 `harness-run.mjs` の出力は日本語。メッセージのトーンを合わせる。
- `status` の `--json` 出力に秘密情報を含めない（`command` は redact 済みのものを使う）。

## テスト

新規 `.claude/tests/bounded-repair-loop.test.mjs`（**モックモデル・モックツール・モック
品質ゲート**を使い、実 API・実ユーザー状態を触らない）:

**回数制限**

- `maxAttempts` を超えて許可を発行しない（3 回目の `authorize` が停止）
- **`maxAttempts: 0` では修正を開始しない**
- 上限到達後に追加の許可発行を行わない（`modelCalls` が増えない）

**開始条件**

- 14 条件それぞれについて、欠けたときに期待の status / stopReason で停止する
- ゲートが `not_run` のとき開始しない
- `infrastructure_failure` を修正ループへ入れない
- `security_failure` / `unknown_failure` を修正ループへ入れない
- 承認待ち（`approvalStatus: 'pending'`）で開始しない

**同一失敗**

- 同じフィンガープリントが 2 回連続で `needs_human_review`

**予算**

- 経過時間超過（`deadlineAt` 到達）で `budget_exceeded`
- モデル呼び出し上限で停止
- ツール呼び出し上限で停止
- **利用量を取得できない（`null`）場合に無制限扱いしない**（時間・回数で必ず停止する）

**終了判定**

- 全必須ゲート合格で `completed`
- E2E 未実行（`requireE2E: true`）を `completed` にしない
- テスト 0 件を `completed` にしない
- `timed_out` を成功扱いしない

**状態保存・二重実行**

- 状態保存失敗時に修正処理（許可発行）を開始しない
- ロック取得失敗時に停止する
- 同じ run に対して `authorize` を並行実行しても許可は 1 件だけ（二重のモデル呼び出し防止）

**報告**

- 停止理由が構造化される（必須キーが揃う）
- **秘密情報が含まれない**（`postgres://user:pass@...` を仕込んでも報告に出ない）
- ログ全文ではなく `logReference` が保存される
- 人間が判断できる情報（`recommendedHumanAction` / `failureSummary` / `diffSummary`）が含まれる

**CLI**

- `resume` が終了済み run を再開しない
- `cancel` が状態を保存し新たな変更を開始しない
- 不正な引数で exit 2
- 安全停止で exit 1・内部エラーで exit 3

## 完了条件

- [ ] `pnpm test:harness` 全 green
- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` 全 green
- [ ] `while (true)` / 終了条件のない再帰が**存在しない**（`git grep 'while (true)'` が空）
- [ ] モデル API を呼ぶコードが存在しない（`fetch` による外部呼び出しなし）
- [ ] `maxAttempts: 0` で修正を開始しないテストがある
- [ ] 状態保存失敗時に許可を発行しないテストがある
- [ ] 予算 unsupported を無制限扱いしないテストがある
- [ ] `resume` に上限引き上げ・停止解除のオプションが**無い**
- [ ] 報告に秘密情報が含まれないテストがある
