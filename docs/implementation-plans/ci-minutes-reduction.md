# 実装計画: ci-minutes-reduction

- 対応設計書: docs/designs/ci-minutes-reduction.md（confirmed / L2）
- 試験計画: docs/tests/ci-minutes-reduction.md
- 実装ルート: **Claude Code 直接実装**（変更が CI ワークフロー 1 ファイルに閉じ、
  ドメイン知識より Actions の課金モデルの理解が要るため。Codex 委譲の対象外）

## 全体の完了条件

- `.github/workflows/ci.yml` が YAML として妥当で、ジョブ構成が `quality` / `e2e` の 2 つ。
- 試験計画の確認項目（判定ロジック 10 パターン・実履歴 25 マージ）がすべて期待どおり。
- `pnpm format:check` がクリーン。
- 検証項目（lint / type-check / build / test / E2E / 依存監査）がコードを含む PR で
  1 つも減っていない。

## ステップ 1: 現状の実測

### 対象

なし（調査のみ）

### 内容

1. GitHub Actions のジョブ API から、直近の成功した PR run の各ジョブの
   `started_at` / `completed_at` とステップ内訳を取得し、実時間とセットアップ時間を出す。
2. 分単位切り上げで課金分数を算出する。
3. `main` への直近 25 マージを PR 単位（マージコミットの第 1 親と第 2 親の差分）で分類し、
   ドキュメントのみ / 依存変更ありの割合を実測する。

### 完了条件

削減案の効果を推測でなく実測値から算出できる状態になっていること。

> 実績: 11 分/run・重複セットアップ約 2.5 分・ドキュメントのみ 3/25・依存変更 6/25。
> この計測により、当初口頭で述べた「ジョブ統合で約 40% 削減」「docs スキップで
> 今日の push の 60% を削減」がいずれも過大であったことが判明し、訂正した。

## ステップ 2: 前提条件の確認

### 対象

なし（調査のみ）

### 内容

1. `main` の branch protection を確認する（required status checks があるとジョブ名変更で
   マージ不能になる）。
2. `weekly-maintenance.yml` を確認し、依存監査の安全網が別途あるかを確認する。
3. `playwright.config.ts` を確認し、E2E が Build 成果物に依存するかを確認する。

### 完了条件

ジョブ名の変更・スキップ・依存監査のゲート化が安全だと確認できていること。

> 実績: `main` は `protected: false`。週次監査は月曜 06:00 JST に main の全依存を監査。
> E2E は `webServer` で `pnpm dev` を自前起動するため Build 成果物には依存しない。

## ステップ 3: ワークフローの書き換え

### 対象ファイル

- `.github/workflows/ci.yml`

### 内容

1. `format` / `lint` / `type-check` / `build` / `test` / `audit` の 6 ジョブを
   `quality` ジョブ 1 つに統合する。ステップは実時間の短い順に並べる。
2. `quality` の先頭に「変更範囲を判定」ステップを置き、`docs_only` / `deps_changed` を
   `GITHUB_OUTPUT` へ出す。判定は base との差分（`git diff --name-only <base sha> HEAD`）。
   base の取得のため `actions/checkout` に `fetch-depth: 0` を付ける。
3. `lint` / `type-check` / `build` / `test` に `if: steps.scope.outputs.docs_only != 'true'`。
   `format:check` は Markdown も対象のため条件を付けない。
4. 依存監査をジョブ最後尾へ移す。`packageManager` を書き換えるため後続に影響させない。
   直前に `actions/setup-node@v7`（Node 22）を挿入する（pnpm 11 は Node >= 22.13 が必要）。
   全ステップに `if: steps.scope.outputs.deps_changed == 'true'`。
5. `e2e` を `needs: quality` にし、`needs.quality.outputs.docs_only != 'true'` を条件に加える。
6. 末尾に `GITHUB_STEP_SUMMARY` へ実行範囲を書くステップを `if: always()` で置く。

### 完了条件

- `yaml.safe_load` でパースでき、ジョブが `quality` / `e2e` の 2 つ。
- 各ステップの `if` が設計どおり（試験計画の確認項目 A-1）。
- 監査コマンド（`pnpm audit --prod --audit-level=high` / `--audit-level=critical`）と
  `continue-on-error` の指定が変更前と同一。

## ステップ 4: 判定ロジックの検証

### 対象ファイル

なし（検証用スクリプトはスクラッチパッドに置き、リポジトリには含めない）

### 内容

1. 判定部分だけを切り出したシェルスクリプトを作り、試験計画の 10 パターンを流す。
2. 期待と異なるものがあれば `ci.yml` を修正し、再実行する。
3. `main` への直近 25 マージを同スクリプトに流し、実履歴でも破綻しないことを確認する。

### 完了条件

10 パターンすべてが期待どおりで、実履歴 25 件でも例外が出ないこと。

> 実績: 初回実行で `docs/` 配下のみのケースが `docs_only=false` になる不具合を検出。
> 原因は `^(docs/|logs/|notes/|[^/]*\.md)$` と末尾を `$` で閉じており、
> `docs/` という文字列そのものにしかマッチしていなかったこと。
> `^(docs/|logs/|notes/)|^[^/]*\.md$` へ修正して再実行し、全件一致を確認した。

## ステップ 5: 成果物の作成とコミット

### 対象ファイル

- `docs/designs/ci-minutes-reduction.md`
- `docs/implementation-plans/ci-minutes-reduction.md`（本書）
- `docs/tests/ci-minutes-reduction.md`

### 内容

設計・実装計画・試験計画を作成し、`pnpm format:check` を通してからコミット・push・PR 作成。

### 完了条件

`pnpm format:check` がクリーンで、成果物が 3 点そろっていること。

## リスクとロールバック

| リスク                                                  | 対応                                                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 判定ミスでコードが未検証のままマージされる              | 判定は「全ファイルがドキュメント」のときだけ true。空差分・判定不能・main への push は全ゲート |
| 依存監査の頻度低下                                      | `weekly-maintenance.yml` の週次監査が安全網                                                    |
| 1 ジョブ化により Actions の Checks 一覧の粒度が粗くなる | ステップ名を明示し、サマリに実行範囲を出力                                                     |

ロールバックは本 PR の `git revert` 1 回で足りる（`.github/workflows/ci.yml` の 1 ファイル変更）。
`main` に branch protection が無いため、ジョブ名が戻ることによる副作用も無い。

## 実施順の根拠

実測（ステップ 1）と前提確認（ステップ 2）を先に置いたのは、削減案の選択そのものが
実測値に依存するため。実際、実測前の見立て（ジョブ統合で 40% 削減）は誤っており、
先に測っていなければ誤った設計のまま実装していた。
