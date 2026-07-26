# Task 5: 差分スコープと危険変更の検査 — bounded-repair-diff.mjs

## 概要

修正の前後で Git 差分を計測し、**上限超過・保護対象変更・高リスク領域・品質ゲートの弱体化**を
検出する。プロンプトで「テストを削除しないで」と書く代わりに、**差分検査でコードとして強制**
するための層。`Task 0` の `isProtectedPath()` 修正が前提。

新規ファイル: `.claude/lib/bounded-repair-diff.mjs`

## アーキテクチャ制約

- Node ESM（`.mjs`）。**新規依存の追加は禁止**（Git 呼び出しは `node:child_process` の
  `execFileSync`。シェル経由（`exec`）は使わない — 引数のクォート事故とインジェクションを避ける）。
- デフォルトエクスポート禁止。`===` / `!==`。「値なし」は `null`。
- 保護対象の判定は `.claude/lib/harness-approval.mjs` の `isProtectedPath()` を**import して使う**
  （パス判定を再実装しない。定義の二重化は必ず乖離する）。
- 純粋関数と I/O を分ける: 差分の**解析**は純粋関数（文字列入力）、**取得**だけが I/O。
  これによりテストで実際の git を必要としない。

## 検査項目

### 1. 差分の計測

`git diff --numstat` と `git diff --name-status` から次を得る。

- 変更ファイル数 / 追加行数 / 削除行数
- 新規ファイル（`A`）/ 削除ファイル（`D`）/ リネーム（`R`）

### 2. 上限判定（Task 1 の上限を使う）

- `changedFiles.length > maxChangedFiles` → 停止
- `addedLines + deletedLines > maxDiffLines` → 停止
- **当初の変更対象外へ広がった** → 停止（`baselineFiles` と比較。修正で新たに現れた
  ファイルが `allowedPaths` に含まれない場合）

### 3. 高リスク領域（変更が含まれたら停止）

| 分類         | パターン                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 保護対象     | `isProtectedPath()` が true（`.claude/` の各所・`CLAUDE.md` / `AGENTS.md` / `lefthook.yml` / `.github/workflows/` / `.github/actions/`） |
| 設定ファイル | `*.config.{ts,mts,js,mjs,cjs}` / `tsconfig*.json` / `turbo.json` / `.prettierrc` / `.editorconfig` / `commitlint.config.mjs`             |
| 依存関係     | `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml`                                                                                |
| migration    | `**/migrations/**` / `**/drizzle/**` / `*.sql`                                                                                           |
| CI           | `.github/**`                                                                                                                             |
| Hook         | `lefthook.yml` / `.claude/hooks/**` / `.husky/**`                                                                                        |
| `.claude/`   | `.claude/**`                                                                                                                             |
| 認証・認可   | パスに `auth` / `session` / `permission` / `role` を含む                                                                                 |
| 課金         | パスに `billing` / `payment` / `subscription` / `price` を含む                                                                           |
| 個人情報     | パスに `user` / `profile` / `account` / `pii` を含む                                                                                     |
| 外部送信     | パスに `webhook` / `notify` / `mailer` / `client` を含む、または差分に `fetch(` / `axios` の新規追加                                     |
| インフラ     | `Dockerfile` / `docker-compose*` / `*.tf` / `k8s/**`                                                                                     |

### 4. 品質ゲートの弱体化検出（差分の**追加行**を解析する）

以下が**追加**されていたら `unsafe_change_detected` で停止する。

| 検出対象         | パターン（追加行に出現）                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| テストの skip    | `it.skip(` / `test.skip(` / `describe.skip(` / `it.todo(` / `xit(` / `xdescribe(` / `t.skip(` / `{ skip: true }`         |
| テストの only    | `it.only(` / `describe.only(` / `test.only(`（他テストを実行しなくなる）                                                 |
| テストの削除     | `*.test.*` / `*.spec.*` ファイルの `D`（削除）、またはテストファイルで削除行 > 追加行かつ `it(` / `test(` の減少         |
| lint 無効化      | `eslint-disable`（ファイル全体無効化 `/* eslint-disable */` は特に厳格に）/ `--no-verify`                                |
| 型チェック無効化 | `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` の新規追加 / `"strict": false`                                         |
| 失敗隠蔽         | `continue-on-error` / `\|\| true` / `--passWithNoTests` / `exit 0` の追加（ゲートスクリプト内）                          |
| Hook 回避        | `LEFTHOOK=0` / `HUSKY=0` / `core.hooksPath`                                                                              |
| E2E 未実行化     | `playwright.config` の `testIgnore` 追加 / E2E ジョブへの `if: false`                                                    |
| ゲート定義の削除 | `run-quality-gates.sh` からの `run_gate` 行の削除 / `package.json` の `scripts` から `lint`・`test`・`type-check` の削除 |

**`@ts-expect-error` について**: 既存コードに存在する場合は許容し、**新規追加のみ**検出する
（差分の追加行で判定する）。

## 実装対象ファイル

```js
// .claude/lib/bounded-repair-diff.mjs

export const RISK_CATEGORIES  // Object.freeze([...上表の分類名...])

/**
 * git 差分を取得する（I/O。execFileSync で 'git' を直接呼ぶ）。
 * @returns {{ ok: true, numstat: string, nameStatus: string, patch: string }
 *          | { ok: false, reason: string, detail: string }}
 */
export function collectDiff({ baseRef = 'HEAD', cwd = null } = {})

/** numstat / name-status を解析する（純粋関数）。バイナリ（`-\t-`）とリネームを正しく扱う。 */
export function parseDiffStats(numstat, nameStatus)

/** 変更ファイル群から高リスク分類を返す（純粋関数）。 */
export function detectRiskCategories(files, { root = null } = {})

/** patch の追加行からゲート弱体化を検出する（純粋関数）。 */
export function detectGateWeakening(patch)

/**
 * 差分が許容範囲かを総合判定する。
 * @returns {{ ok: true, stats: object, risks: string[] }
 *          | { ok: false, reason: 'max_changed_files'|'max_diff_lines'|'scope_expansion'
 *              |'protected_file_change'|'high_risk_change'|'gate_weakening',
 *              detail: string, stats: object, risks: string[], findings: object[] }}
 */
export function evaluateDiffScope({ stats, limits, baselineFiles = [], allowedPaths = [], patch = '', root = null })
```

## 公開識別子一覧（タイポ照合基準・この綴りを厳守）

`RISK_CATEGORIES` / `collectDiff` / `parseDiffStats` / `detectRiskCategories` /
`detectGateWeakening` / `evaluateDiffScope`

停止理由の綴り: `max_changed_files` / `max_diff_lines` / `scope_expansion` /
`protected_file_change` / `high_risk_change` / `gate_weakening`

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **`git diff --numstat` のリネーム表記を取りこぼさない（最重要）。** リネームは
  `1\t1\t{old => new}/file.ts` や `1\t1\told.ts\0new.ts` の形で出る。素朴に
  `line.split('\t')[2]` をパスとして扱うと `{old => new}` がそのままファイル名になり、
  **保護対象の判定が漏れる**（`.claude/{lib => libs}/x.mjs` が保護対象と判定されない）。
  リネーム記法を展開し、**旧パスと新パスの両方**を判定対象に含める。
- **バイナリファイルは `-\t-\tpath` で出る。** `Number('-')` は `NaN` になり、
  `addedLines` が `NaN` に汚染されて上限判定が常に false になる（`NaN > 150` は false）。
  必ず `-` を 0 として扱い、`Number.isFinite()` で検証する。
- **`isProtectedPath()` を自前で再実装しない。** import して使う。Task 0 で修正した
  ディレクトリ判定の恩恵をここで受ける必要がある。
- **`detectGateWeakening` は「追加行」だけを見る。** patch 全体を対象にすると、
  もともと `eslint-disable` を含むファイルを 1 行直しただけで停止してしまう（誤検知）。
  `+` で始まり `+++` ではない行のみを対象にする。
- **`|| true` の検出で正規表現をエスケープする。** `|` はパイプなので
  `/\|\|\s*true/` のようにエスケープが必要。素の `/|| true/` は空文字マッチになる。
- **`allowedPaths` が空配列のときの意味を決める。** 空 = 「制限なし」ではなく
  「`baselineFiles` のみ許可」として扱う（fail-closed）。空を無制限にすると
  スコープ拡大検出が無効化される。
- `execFileSync` に渡す引数は配列で渡す（`execFileSync('git', ['diff', '--numstat'])`）。
  文字列連結して `exec` に渡さない。
- git が使えない・リポジトリでない場合は `{ ok: false }` を返す（例外を投げない）。
  呼び出し側は `state_error` として安全停止する。

## テスト

新規 `.claude/tests/bounded-repair-diff.test.mjs`（**実際の git リポジトリを一時ディレクトリに
作るか、固定の numstat/patch 文字列を使う**。ユーザーの作業ツリーを変更しない）:

**計測**

- numstat から変更ファイル数・追加行・削除行を正しく数える
- バイナリ（`-\t-`）で `NaN` にならない
- リネーム（`{old => new}`）で旧新両方のパスを検出する
- 新規ファイル（`A`）・削除ファイル（`D`）を区別する

**上限**

- `maxChangedFiles` 超過で停止（`max_changed_files`）
- `maxDiffLines` 超過で停止（`max_diff_lines`。追加 + 削除の合計で判定）
- 上限ちょうどは**許可**（境界値）
- `baselineFiles` 外への拡大で停止（`scope_expansion`）
- `allowedPaths` が空のとき baseline 外は拒否

**保護対象・高リスク**

- `.claude/hooks/x.mjs` の変更で停止（`protected_file_change`）
- `.claude/lib` 自体の削除で停止（Task 0 の修正が効いていることの確認）
- `CLAUDE.md` / `lefthook.yml` / `.github/workflows/ci.yml` で停止
- `package.json` / `pnpm-lock.yaml` で `dependency` リスク
- `**/migrations/**` で `migration` リスク
- `apps/web/src/app/page.tsx` のみの変更では**停止しない**（誤検知回帰の防止）

**ゲート弱体化**

- `it.skip(` の追加で停止
- `test.only(` の追加で停止
- テストファイルの削除で停止
- `eslint-disable` の追加で停止
- `@ts-nocheck` / `@ts-ignore` の新規追加で停止
- `continue-on-error` の追加で停止
- `|| true` の追加で停止
- `--passWithNoTests` の追加で停止
- `LEFTHOOK=0` / `--no-verify` の追加で停止
- **既存の `eslint-disable` を含むファイルの無関係な 1 行修正では停止しない**（誤検知回帰）

## 完了条件

- [ ] `pnpm test:harness` 全 green
- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` 全 green
- [ ] リネーム・バイナリの取りこぼしテストがある
- [ ] `isProtectedPath()` を import して使っている（再実装していない）
- [ ] テスト削除・skip・ゲート弱体化の各検出テストがある
- [ ] 誤検知回帰テスト（通常のアプリコード変更・既存 eslint-disable）がある
- [ ] ユーザーの作業ツリーを変更するテストが無い（一時ディレクトリのみ）
