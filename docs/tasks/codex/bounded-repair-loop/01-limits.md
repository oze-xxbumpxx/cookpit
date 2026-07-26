# Task 1: 上限の定義 — bounded-repair-limits.mjs

## 概要

有界修正ループの上限（回数・時間・呼び出し・差分量）を**唯一の場所**で定義する純粋モジュール。
「AI が自分で上限を増やせない」ことをコードで保証する層。副作用を持たせない
（ファイル I/O・`process.exit` を書かない）。作法は `.claude/lib/harness-paths.mjs` の
エクスポート形（名前付き・`Object.freeze` の定数）に合わせる。

新規ファイル: `.claude/lib/bounded-repair-limits.mjs`

## アーキテクチャ制約

- Node ESM（`.mjs`）。**新規依存の追加は禁止**。
- デフォルトエクスポート禁止。名前付きエクスポートのみ。
- `===` / `!==` を使う。「値なし」は `null`。
- 公開関数には JSDoc（不変条件・`@throws` のみ。型の言い換えは書かない）。
- 純粋関数のみ。`process.env` は**引数で受け取る**（`resolveLimits({ env })`）。
  既存 `harness-paths.mjs` の `resolveStateDir({ env })` と同じ作法。テスト容易性のため必須。

## 上限表（この表が唯一の正典。他ファイルへハードコードしない）

| キー                        | 既定値             | 安全上限           | 根拠                                                                                                                   |
| --------------------------- | ------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `maxAttempts`               | 2                  | 3                  | 有界修正の要求値                                                                                                       |
| `maxConsecutiveSameFailure` | 1                  | 1                  | 同一失敗 2 回連続で停止（U5）                                                                                          |
| `maxReplans`                | 0                  | 0                  | 再計画は今回スコープ外                                                                                                 |
| `maxElapsedMs`              | 1_200_000（20 分） | 3_600_000（60 分） | ゲート一式が cold 実測 2 分 6 秒。初回 + 再実行 2 回 + 修正時間。安全上限は CI の 30 分 timeout と承認 TTL 60 分に整合 |
| `maxModelCalls`             | 3                  | 4                  | 修正 2 回 + 分類補助 1 回                                                                                              |
| `maxToolCalls`              | 60                 | 120                | 修正 1 回あたり読取 + 編集 + ゲートで約 20                                                                             |
| `maxTotalTokens`            | `null`             | `null`             | **取得手段なし（U2）**。`unsupported`                                                                                  |
| `maxEstimatedCost`          | `null`             | `null`             | **取得手段なし（U2）**。`unsupported`                                                                                  |
| `maxChangedFiles`           | 5                  | 20                 | 修正コミット実測 1〜5 ファイル（`670eb90` 2 / `77c488a` 1 / `c9913c0` 5）                                              |
| `maxDiffLines`              | 150                | 600                | 同コミット群の実測 11〜80 行。機能コミット（1,700〜4,400 行）とは明確に区別する                                        |

`maxDiffLines` は **追加行 + 削除行の合計**で評価する（`addedLines + deletedLines`）。

## 実装対象ファイル

```js
// .claude/lib/bounded-repair-limits.mjs

/** 安全上限。どの設定でもこれを超えられない。 */
export const HARD_LIMITS: Readonly<Record<string, number|null>>

/** 既定値（プロジェクト設定が無い場合に使う）。 */
export const DEFAULT_LIMITS: Readonly<Record<string, number|null>>

/** 取得不能な予算項目の申告。0 を入れて「予算内」と誤判定させないための明示。 */
export const BUDGET_SUPPORT: Readonly<{ tokens: 'unsupported', cost: 'unsupported' }>

/** 上限キーの一覧（未知キーの検出に使う）。 */
export const LIMIT_KEYS: ReadonlyArray<string>

/**
 * 上限を解決する。優先順位は「安全上限 → プロジェクト設定 → タスク別設定 → 環境変数」で、
 * **後の層は安全上限を超えられない**。超える値は無視ではなく拒否する。
 * @returns {{ ok: true, limits: object, sources: object }
 *          | { ok: false, reason: 'exceeds_hard_limit'|'invalid_value'|'unknown_key',
 *              detail: string, key: string }}
 */
export function resolveLimits({ project = null, task = null, env = {} } = {})

/**
 * 単一の上限値が安全上限内かを判定する。
 * @returns {{ ok: true, value: number } | { ok: false, reason: string, detail: string }}
 */
export function clampCheck(key, value)

/**
 * 予算項目が評価可能かを返す。`unsupported` の項目は上限評価の対象外にし、
 * 呼び出し側は代替の回数・時間上限で必ず縛る。
 * @returns {boolean}
 */
export function isBudgetTracked(key)
```

## 公開識別子一覧（タイポ照合基準・この綴りを厳守）

定数: `HARD_LIMITS` / `DEFAULT_LIMITS` / `BUDGET_SUPPORT` / `LIMIT_KEYS`
関数: `resolveLimits` / `clampCheck` / `isBudgetTracked`
上限キー: `maxAttempts` / `maxConsecutiveSameFailure` / `maxReplans` / `maxElapsedMs` /
`maxModelCalls` / `maxToolCalls` / `maxTotalTokens` / `maxEstimatedCost` / `maxChangedFiles` /
`maxDiffLines`
環境変数の接頭辞: `BOUNDED_REPAIR_`（例 `BOUNDED_REPAIR_MAX_ATTEMPTS`）

環境変数名は上限キーの **SCREAMING_SNAKE_CASE** に接頭辞を付けたもの
（`maxAttempts` → `BOUNDED_REPAIR_MAX_ATTEMPTS`、`maxElapsedMs` → `BOUNDED_REPAIR_MAX_ELAPSED_MS`）。

## 不変条件（テストで固定すること）

1. 安全上限を超える値は、どの層から来ても**拒否**する（クランプして黙って通さない）。
   `resolveLimits` は `{ ok: false, reason: 'exceeds_hard_limit', key }` を返す。
2. `maxAttempts: 0` は**有効な設定**として受理する（＝修正を一度も開始しない）。
   0 は「上限なし」ではない。
3. `maxTotalTokens` / `maxEstimatedCost` は常に `null`。数値を設定しようとしたら
   `{ ok: false, reason: 'invalid_value' }`（取得手段が無いのに上限を張れると誤解させない）。
4. 未知のキーは `{ ok: false, reason: 'unknown_key' }`。黙って無視しない。
5. 負数・非整数・`NaN`・`Infinity`・数値化できない文字列は `invalid_value`。
6. `sources` に各上限値の出自（`'hard'` / `'default'` / `'project'` / `'task'` / `'env'`）を
   記録する（観測可能性のため）。

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **「クランプ」ではなく「拒否」。** 環境変数やタスク設定が安全上限を超えたとき、
  安全上限に丸めて処理を続けるのではなく、エラーとして返す。丸めると「上限を上げようとした」
  という事実が消え、AI が上限を触った痕跡が残らない。
- **`maxAttempts: 0` と「未設定」を区別する。** `task.maxAttempts ?? default` ではなく
  `Object.hasOwn(task, 'maxAttempts')` 等で存在判定する。`||` を使うと `0` が既定値に
  上書きされ、「修正を開始しない」設定が壊れる（最も踏みやすい罠）。
- **`null`（unsupported）と `0`（上限ゼロ）を混同しない。** `maxTotalTokens: null` は
  「評価しない」、`maxAttempts: 0` は「0 回まで」。`if (!limit)` のような真偽値判定を書くと
  両者が同じ扱いになる。必ず `=== null` で明示的に分岐する。
- 環境変数の値は文字列で来る。`Number()` 変換後に `Number.isInteger()` で検証する
  （`parseInt('2abc')` は `2` を返してしまうため使わない）。
- `process.env` を直接参照しないこと（引数で受け取る。テストが実環境に依存する）。
- 単位を名前に残す: `maxElapsedMs`（ミリ秒）。`maxElapsed` や `maxElapsedMinutes` にしない。

## テスト

新規 `.claude/tests/bounded-repair-limits.test.mjs`（`node:test` + `node:assert/strict`）:

- 既定値が上限表と一致する
- タスク別設定で安全上限を超えられない（`maxAttempts: 99` → `exceeds_hard_limit`）
- 環境変数で安全上限を超えられない（`BOUNDED_REPAIR_MAX_ATTEMPTS=99` → 拒否）
- 環境変数で安全上限**以内**の引き下げはできる（`=1` → 1、`sources.maxAttempts === 'env'`）
- `maxAttempts: 0` が受理され、既定値 2 に上書きされない
- `maxTotalTokens` / `maxEstimatedCost` は `null` のまま。数値指定は `invalid_value`
- `isBudgetTracked('maxTotalTokens') === false` / `isBudgetTracked('maxAttempts') === true`
- 未知キーは `unknown_key`
- 負数・小数・`NaN`・`'abc'` は `invalid_value`
- 優先順位: project < task < env（すべて安全上限内の場合）

## 完了条件

- [ ] `pnpm test:harness` 全 green
- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` 全 green
- [ ] 上限値がこのファイル 1 箇所にのみ定義されている（他ファイルに数値をコピーしていない）
- [ ] `maxTotalTokens` / `maxEstimatedCost` が `null` で、0 になっていない
- [ ] `maxAttempts: 0` が既定値に潰されないテストがある
- [ ] 安全上限超過が「拒否」であり「クランプ」でないテストがある
