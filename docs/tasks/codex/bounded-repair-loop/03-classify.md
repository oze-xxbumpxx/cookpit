# Task 3: 失敗分類とフィンガープリント — bounded-repair-classify.mjs

## 概要

品質ゲートの失敗を**決定的に**（ルールベースで）分類し、同一失敗の検出に使う正規化
フィンガープリントを生成する純粋モジュール。LLM は使わない。純粋関数のみでファイル I/O を
持たない（入力は Task 4 が作る構造化ゲート結果オブジェクト）。

新規ファイル: `.claude/lib/bounded-repair-classify.mjs`

## アーキテクチャ制約

- Node ESM（`.mjs`）。**新規依存の追加は禁止**（ハッシュは `node:crypto`）。
- デフォルトエクスポート禁止。`===` / `!==`。「値なし」は `null`。
- 公開関数には JSDoc（正規化規則・不変条件のみ）。
- 純粋関数のみ。`Date.now()` / `process.env` を関数内で直接参照しない。

## 失敗種別（この 18 種のみ。列挙型として定義する）

```
lint_failure          format_failure         typecheck_failure
unit_test_failure     integration_test_failure  e2e_failure
build_failure         security_failure       dependency_failure
requirement_failure   protected_file_change  scope_expansion
timeout               budget_exceeded        infrastructure_failure
state_error           approval_required      unknown_failure
```

**自動修正可能は 5 種のみ**（U10）: `lint_failure` / `format_failure` / `typecheck_failure` /
`unit_test_failure` / `build_failure`。それ以外はすべて安全停止。

## 分類ルール（決定的・この順で評価する）

判定材料はゲート名・終了コード・構造化テスト結果・ファイルパス・既知のエラー形式のみ。

| 種別                     | 判定条件                                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `infrastructure_failure` | ゲート status が `infrastructure_error`、または出力に `ENOTFOUND` / `ECONNREFUSED` / `ETIMEDOUT` / `EAI_AGAIN` / `socket hang up` / `429` / `503` / `Cannot find module` かつ `node_modules` 不在 / `turbo: not found` / `command not found` / `ENOSPC` / `EACCES` |
| `timeout`                | ゲート status が `timed_out`、または終了コード 124 / 143（SIGTERM）                                                                                                                                                                                                |
| `state_error`            | 状態の読込・保存・検証の失敗（呼び出し側が明示的に渡す）                                                                                                                                                                                                           |
| `approval_required`      | 出力に「未承認」「承認が必要」「approval」相当、または guard の deny（exit 2）                                                                                                                                                                                     |
| `security_failure`       | ゲート名が `audit` 系、または出力に `GHSA-` / `CVE-` / `vulnerabilit`                                                                                                                                                                                              |
| `dependency_failure`     | `pnpm-lock.yaml` / `package.json` の不整合、`ERR_PNPM_OUTDATED_LOCKFILE` / `frozen-lockfile`                                                                                                                                                                       |
| `format_failure`         | ゲート名が `format-check` / `format`、または prettier の `Code style issues`                                                                                                                                                                                       |
| `lint_failure`           | ゲート名が `lint`、または eslint の `problems (` 形式                                                                                                                                                                                                              |
| `typecheck_failure`      | ゲート名が `type-check`、または `error TS\d+`                                                                                                                                                                                                                      |
| `build_failure`          | ゲート名が `build`                                                                                                                                                                                                                                                 |
| `unit_test_failure`      | ゲート名が `test` / `harness` かつ失敗テストが 1 件以上（Vitest / `node --test`）                                                                                                                                                                                  |
| `e2e_failure`            | ゲート名が `e2e` 系、または Playwright レポート由来                                                                                                                                                                                                                |
| `protected_file_change`  | 差分検査（Task 5）が保護対象変更を報告（呼び出し側が渡す）                                                                                                                                                                                                         |
| `scope_expansion`        | 差分検査が上限超過・対象外への拡大を報告                                                                                                                                                                                                                           |
| `budget_exceeded`        | 予算判定（Task 6）が上限到達を報告                                                                                                                                                                                                                                 |
| `requirement_failure`    | 受入条件の不足（人間・呼び出し側の明示指定のみ。自動推論しない）                                                                                                                                                                                                   |
| `unknown_failure`        | 上記のいずれにも決定的に当てはまらない**すべて**                                                                                                                                                                                                                   |

**重要**: `infrastructure_failure` / `timeout` の判定を `unit_test_failure` より**先**に置く。
順序を逆にすると、依存が壊れているだけの失敗を「テスト失敗」と誤分類し、環境障害に対して
コードを修正しようとする（禁止事項）。

LLM 分類は今回**実装しない**。将来追加する場合も決定的分類が `unknown_failure` になった後の
補助に限定し、返り値は上記列挙型で検証して未知の値は `unknown_failure` へ変換する
（この方針をコード内 JSDoc に明記するだけでよい）。

## フィンガープリント（同一失敗の検出）

### 材料（この順で連結する）

1. ゲート名（`gate`）
2. 失敗種別（`failureType`）
3. 終了コード（`exitCode`）
4. 失敗したテスト名（**ソート済み・最大 5 件**。名前のみ。ファイルパスは含めない）
5. 主要なエラーコード（`TS2345` / `GHSA-...` / `AssertionError` / eslint ルール名など、最初の 1 件）
6. 正規化された主要メッセージ（下記の正規化後・最大 200 文字）
7. 主要なスタック位置（**リポジトリ相対パス + 関数名のみ。行番号は含めない**）

### 正規化（除外する変動情報）

以下はすべて除去または固定トークンへ置換してからハッシュする。

| 対象                                                             | 置換                 |
| ---------------------------------------------------------------- | -------------------- |
| ISO 8601 / `HH:MM:SS` などのタイムスタンプ                       | `<TS>`               |
| 一時ディレクトリ（`/tmp/...` / `/var/folders/...` / `T/xxxx`）   | `<TMP>`              |
| run ID（`run-` で始まる識別子）                                  | `<RUNID>`            |
| UUID / 16 進の長い乱数（8 桁以上）                               | `<RAND>`             |
| 実行時間（`123ms` / `1.23s` / `duration_ms 123`）                | `<DUR>`              |
| ポート番号（`:3000` / `localhost:5432`）                         | `<PORT>`             |
| メモリアドレス（`0x...`）                                        | `<ADDR>`             |
| 絶対パスの環境依存部分（`/home/user/cookpit` / `process.cwd()`） | リポジトリ相対へ変換 |
| 行番号・列番号（`:12:34`）                                       | 除去                 |
| ANSI エスケープシーケンス                                        | 除去                 |
| 連続空白・改行                                                   | 単一スペース         |

ハッシュは **SHA-256 の先頭 16 hex**（U9）。

### 期待する具体例

```
gate: unit_tests
failureType: unit_test_failure
failedTest: test_refresh_token_expiry
errorCode: AssertionError
message: expected active but received expired
```

→ タイムスタンプ・一時パス・run ID・実行時間が違っても**同一のフィンガープリント**になること。
逆に、**異なるテスト名**（`test_refresh_token_expiry` vs `test_access_token_expiry`）や
**異なるアサーション内容**は**別のフィンガープリント**になること。

## 実装対象ファイル

```js
// .claude/lib/bounded-repair-classify.mjs

export const FAILURE_TYPES        // Object.freeze([...18 種...])
export const AUTO_REPAIRABLE_FAILURE_TYPES  // Object.freeze([...5 種...])

/**
 * 構造化ゲート結果から失敗種別を決定的に分類する。
 * 判定不能なものはすべて 'unknown_failure'（推測で埋めない）。
 */
export function classifyFailure(gateResult, { hints = null } = {})

/** 自動修正の対象かどうか。 */
export function isAutoRepairable(failureType)

/** ログ・メッセージから変動情報を除いた正規形を返す。 */
export function normalizeMessage(text, { root = null } = {})

/** 同一失敗検出用の安定ハッシュ（SHA-256 先頭 16 hex）。 */
export function computeFingerprint(failure)

/** 失敗種別が列挙型に含まれるか検証し、未知の値は 'unknown_failure' へ変換する。 */
export function coerceFailureType(value)
```

## 公開識別子一覧（タイポ照合基準・この綴りを厳守）

`FAILURE_TYPES` / `AUTO_REPAIRABLE_FAILURE_TYPES` / `classifyFailure` / `isAutoRepairable` /
`normalizeMessage` / `computeFingerprint` / `coerceFailureType`

失敗種別の綴りは上記 18 種を厳守（`typecheck_failure` は `type_check_failure` ではない。
`unit_test_failure` は `test_failure` ではない）。

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **`infrastructure_failure` / `timeout` を先に判定する（最重要）。** ゲート名が `test` でも、
  中身が `turbo: not found` や `Cannot find module` なら環境障害。順序を間違えると
  「環境障害をコード不具合として分類しない」というテストが落ちる。実際にこのリポジトリでは
  `node_modules` 不在で `turbo: not found` により 3 ゲートが失敗する状況が発生している。
- **フィンガープリントに行番号を含めない。** 「主要なスタック位置」はパスと関数名まで。
  行番号を含めると、無関係な 1 行追加で同一失敗が別失敗に見え、同一失敗検出が無効化される
  （同じバグを何度も修正し続ける）。
- **失敗テスト名はソートしてから連結する。** テストランナーの出力順は環境で変わるため、
  未ソートだと同じ失敗が別ハッシュになる。
- **絶対パスをそのままハッシュに入れない。** CI と手元でパスが違うため同一失敗と判定できない。
  必ずリポジトリ相対に変換する。
- **`unknown_failure` を「とりあえず再試行」の入口にしない。** 分類できないものは
  `isAutoRepairable` が `false` を返す。ここを緩めると未知の失敗を自動修正してしまう。
- 正規表現の置換は**順序依存**。タイムスタンプ → UUID → 数値系の順で適用し、先に数値を
  潰すとタイムスタンプが検出できなくなる。
- `normalizeMessage` は入力が `null` / 空文字でも例外を投げず空文字を返す
  （ゲートが出力を残さず落ちるケースがある）。

## テスト

新規 `.claude/tests/bounded-repair-classify.test.mjs`:

**分類**

- eslint 出力 → `lint_failure`
- `error TS2345` → `typecheck_failure`
- Vitest の失敗テスト付き出力 → `unit_test_failure`
- prettier `Code style issues` → `format_failure`
- `build` ゲート失敗 → `build_failure`
- **`turbo: not found` / `Cannot find module` / `ECONNREFUSED` → `infrastructure_failure`**
  （`unit_test_failure` にならないこと）
- 終了コード 124 → `timeout`
- `GHSA-xxxx` → `security_failure`、`isAutoRepairable` が `false`
- 分類不能な出力 → `unknown_failure`、`isAutoRepairable` が `false`
- `AUTO_REPAIRABLE_FAILURE_TYPES` がちょうど 5 種
- `coerceFailureType('bogus')` → `'unknown_failure'`

**フィンガープリント**

- タイムスタンプのみ異なる 2 つの失敗が**同一**ハッシュ
- 一時ディレクトリ名のみ異なる 2 つが**同一**ハッシュ
- run ID / 実行時間 / ポート番号 / メモリアドレスのみ異なる 2 つが**同一**ハッシュ
- 行番号のみ異なる 2 つが**同一**ハッシュ
- **異なるテスト名**は**別**ハッシュ
- **異なるアサーションメッセージ**は**別**ハッシュ
- 失敗テストの出力順が違っても**同一**ハッシュ（ソートの検証）
- 同じ入力から常に同じハッシュ（決定性）・長さが 16

## 完了条件

- [ ] `pnpm test:harness` 全 green
- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` 全 green
- [ ] 失敗種別が 18 種ちょうど、自動修正対象が 5 種ちょうど
- [ ] 環境障害をコード不具合として分類しないテストがある
- [ ] 未知の失敗が `isAutoRepairable === false` になる
- [ ] フィンガープリントに行番号・絶対パス・タイムスタンプが混入していない
- [ ] LLM 呼び出しを一切していない
