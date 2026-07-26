# Task 4: 品質ゲート結果の構造化 — bounded-repair-gates.mjs

## 概要

品質ゲートの標準出力を**そのまま AI へ渡さない**ために、各ゲートの結果を構造化する。
ゲート定義は複製せず、既存 `.claude/scripts/run-quality-gates.sh` を**子プロセスとして呼ぶ**
（U11）。同スクリプトには「構造化結果の追記」だけを行い、**標準出力と終了コードは変えない**。

- 新規: `.claude/lib/bounded-repair-gates.mjs`
- 変更: `.claude/scripts/run-quality-gates.sh`（追記のみ・後方互換）

## アーキテクチャ制約

- Node ESM（`.mjs`）。**新規依存の追加は禁止**（子プロセスは `node:child_process`）。
- デフォルトエクスポート禁止。`===` / `!==`。「値なし」は `null`。
- **秘密情報を保存しない**（U13）。コマンド文字列・ログ・要約のすべてから、
  `.env` の値・トークン・接続文字列・Cookie・`Authorization` ヘッダを除去する。
- ログ全文は**永続領域のログファイル**へ書き、状態には `logReference` だけを持たせる。
- 既存スクリプトの `set -uo pipefail` を外さない。

## 構造化ゲート結果（この形へ変換する）

```json
{
  "gate": "unit_tests",
  "status": "passed",
  "command": "pnpm run test",
  "exitCode": 0,
  "durationMs": 12000,
  "executedTests": 42,
  "failedTests": [
    {
      "name": "test name",
      "file": "packages/domain/src/x.test.ts",
      "message": "正規化されたエラー概要"
    }
  ],
  "errorType": null,
  "summary": "短い失敗概要",
  "logReference": {
    "path": "<stateDir>/gate-logs/test-<ts>.log",
    "bytes": 4096,
    "truncated": false
  }
}
```

- `status`: `passed` | `failed` | `timed_out` | `not_run` | `infrastructure_error`
- `command` は**秘密情報を除いた**実行コマンド（環境変数の値を含めない。名前のみ）
- `executedTests` は**取得できない場合 `null`**（0 と区別する。0 は「テストが 1 件も走らなかった」）
- `failedTests` は最大 10 件まで。`message` は `normalizeMessage()`（Task 3）を通した要約
- `logReference.path` は永続領域の絶対パス。**ログ全文を状態へ埋め込まない**

## `run-quality-gates.sh` への変更（追記のみ）

現在の `run_gate()` は `if "$@"; then ...` で成否のみを見ており、終了コード・所要時間・
出力を捨てている。次を**追加**する。

1. ゲートごとに開始・終了時刻を記録し、`durationMs` を得る。
2. ゲート出力を `tee` で**標準出力へ流しつつ**ログファイルへ保存する。
   保存先は永続領域の `gate-logs/` 配下（`harness-paths.mjs` の `stateDir()` に問い合わせる。
   リポジトリ配下へ書かない）。
3. ゲートごとの終了コードを記録する。
4. 全ゲート終了後、構造化結果を `<stateDir>/gate-results.jsonl` へ 1 行 1 JSON で追記する。

**変えてはいけないもの（後方互換）:**

- 標準出力の既存フォーマット（`── gate: <name>` / `✓ PASS` / `✗ FAIL` / `===== summary =====` /
  `RESULT: OK` / `RESULT: FAIL (...)`）
- 最終終了コード（失敗が 1 件以上あれば 1、なければ 0）
- 既存の引数（`--level` / `--format` / `--build` / `--all`）
- 既存の `quality-gates-log.jsonl` への追記と run 状態の `gateResults` 更新
- 「実在しないコマンドは実行せず unknown と報告する」方針
- 1 つのゲート失敗で即終了せず全ゲートを実行する方針

## 実装対象ファイル

```js
// .claude/lib/bounded-repair-gates.mjs

export const GATE_STATUSES  // Object.freeze(['passed','failed','timed_out','not_run','infrastructure_error'])
export const REQUIRED_GATES // Object.freeze(['lint','type-check','test','harness'])

/**
 * run-quality-gates.sh を子プロセスで実行し、構造化結果を返す。
 * タイムアウトしたら status を 'timed_out' にする（プロセスは必ず kill する）。
 * @returns {{ ok: boolean, exitCode: number, gates: object[], startedAt: string, finishedAt: string }}
 */
export function runQualityGates({ level = 1, timeoutMs = 600_000, cwd = null, env = {} } = {})

/** gate-results.jsonl を読み、最新 run 分の構造化結果を返す。 */
export function readGateResults(opts = {})

/** テキスト出力から失敗テスト・実行件数を抽出する（Vitest / node --test / eslint / tsc）。 */
export function parseGateOutput(gateName, text, { exitCode, root = null })

/** 秘密情報を除去する。除去できたかではなく「残っていないこと」を保証する。 */
export function redactSecrets(text)

/**
 * 必須ゲートがすべて合格したかを判定する。
 * `not_run` / `timed_out` / `infrastructure_error` は**合格にしない**。
 * 実行テスト数 0 も合格にしない。requireE2E のとき E2E 未実行は合格にしない。
 * @returns {{ ok: true } | { ok: false, reason: string, detail: string }}
 */
export function evaluateRequiredGates(gates, { requireE2E = false } = {})

/** ログ全文をファイルへ書き、参照だけを返す。 */
export function writeGateLog(gateName, text, opts = {})
```

## 秘密情報の除去パターン（最低限これらを潰す）

| 対象              | 例                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 接続文字列        | `postgres://user:pass@host/db` / `mysql://` / `redis://` / `pglite://` の資格情報部分                                       |
| Bearer / API キー | `Authorization: Bearer ...` / `sk-...` / `ghp_...` / `github_pat_...`                                                       |
| Cookie            | `Set-Cookie:` / `Cookie:` の値                                                                                              |
| `.env` の代入     | `KEY=value` 形式のうち、キー名が `TOKEN` / `SECRET` / `PASSWORD` / `KEY` / `CREDENTIAL` / `DSN` / `DATABASE_URL` を含むもの |
| AWS               | `AKIA...`                                                                                                                   |

置換は `<REDACTED>` に統一する。**キー名は残して値だけ消す**（デバッグ可能性を保つため）。

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **`tee` を挟むと `$?` は `tee` の終了コードになる（最重要）。** `set -uo pipefail` 下でも
  `$?` はパイプライン最後のコマンドの値。ゲートの終了コードは
  **`${PIPESTATUS[0]}`** で取る。ここを間違えると失敗ゲートが成功として記録され、
  「品質ゲート失敗時は非ゼロ終了する」という既存の保証が崩れる。
- **`executedTests: null`（取得不能）と `0`（1 件も走らなかった）を区別する。** `0` は
  `completed` にしてはいけない状態、`null` は判定材料が無い状態。`if (!executedTests)` と
  書くと両者が同じになる。必ず `=== null` / `=== 0` で分岐する。
- **`not_run` / `timed_out` を `passed` に丸めない。** 既存 `run-quality-gates.sh` は
  「実在しないコマンドは unknown」として SKIP に入れる。SKIP を合格として数えないこと。
- **ログの保存先はリポジトリ配下にしない。** `harness-paths.mjs` の `stateDir()` が返す
  永続領域を使う。リポジトリ内に書くとエフェメラル環境で失われ、`.gitignore` 漏れで
  秘密情報を含むログをコミットする事故につながる。
- **既存スクリプトの出力文字列を変えない。** `record-task-metrics.sh` や
  `collect-task-metrics.mjs` が `RESULT:` 行や `PASS:` 行を読んでいる可能性があるため、
  既存フォーマットは 1 文字も変えず、構造化結果は**別ファイル**へ出す。
- Bash 配列は `${PASS[*]:-}` のように未定義展開に備える（既存スクリプトの作法。
  `set -u` 下で未定義配列を展開するとエラーになる）。
- 子プロセスは `timeoutMs` 経過時に必ず kill する。kill し忘れると
  「CI ジョブにタイムアウトがある」という保証がローカルで破れる。
- `redactSecrets` は**構造化結果を組み立てる直前に 1 回だけ**通すのではなく、
  `command` / `summary` / `failedTests[].message` / ログ書き出しのそれぞれに適用する。

## テスト

新規 `.claude/tests/bounded-repair-gates.test.mjs`（**モック品質ゲート**を使う。
`pnpm lint` 等の実コマンドを走らせない。一時ディレクトリに固定出力を返すスタブスクリプトを
作って呼ぶ）:

**構造化**

- eslint 風出力から `lint` の失敗テスト/件数を抽出できる
- Vitest 風出力から失敗テスト名・ファイル・件数を抽出できる
- `node --test` 風出力（`# fail 1`）から件数を抽出できる
- 終了コード・所要時間が記録される

**合格判定**

- 必須ゲート全合格で `evaluateRequiredGates` が `ok: true`
- 1 つでも `failed` なら `ok: false`
- **`not_run` を合格にしない**
- **`timed_out` を成功扱いしない**
- **`infrastructure_error` を合格にしない**
- **`executedTests: 0` を合格にしない**（テスト 0 件で completed にしない）
- `executedTests: null` は「不明」として合格にしない
- `requireE2E: true` で E2E が `not_run` のとき `ok: false`
- `requireE2E: true` で E2E が 1 件以上成功なら `ok: true`

**秘密情報**

- `postgres://user:pass@host/db` が結果・ログ・要約に残らない
- `Authorization: Bearer xxx` / `sk-xxx` / `ghp_xxx` が残らない
- `DATABASE_URL=...` の値が残らない（キー名は残る）
- ログ全文が状態オブジェクトへ埋め込まれず `logReference` だけになる

**スクリプト後方互換**

- モック環境で `run-quality-gates.sh` を実行し、失敗時に**終了コード 1**、成功時に **0**
- 既存の `RESULT:` / `PASS:` / `FAIL:` 行のフォーマットが変わっていない

## 完了条件

- [ ] `pnpm test:harness` 全 green
- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` 全 green
- [ ] `bash .claude/scripts/run-quality-gates.sh --level 1` が従来と同じ出力形式・終了コードで動く
- [ ] 失敗ゲートの終了コードが `PIPESTATUS[0]` で正しく取れている
- [ ] `not_run` / `timed_out` / テスト 0 件が合格にならないテストがある
- [ ] 秘密情報が状態・ログ参照・要約に残らないテストがある
- [ ] ゲートログが永続領域（リポジトリ外）へ書かれている
- [ ] `continue-on-error` 相当の失敗隠蔽（`|| true` の追加など）を**していない**
