# 試験計画: ci-minutes-reduction

- 対応設計書: docs/designs/ci-minutes-reduction.md（L2）
- 対応実装計画: docs/implementation-plans/ci-minutes-reduction.md

## 基本方針

CI ワークフロー自身の変更であり、アプリケーションのコードは 1 行も変わらない。
したがって Vitest による自動テストの追加対象は無い。

代わりに次の 3 段で検証する。**CI を実行して確かめることができない**
（Actions が課金停止中で、そもそも本変更をマージするまで新ワークフローは動かない）ため、
検証はすべてローカルで完結する手段を選んだ。

1. 静的検証（YAML 構文とジョブ構成）
2. 判定ロジックの単体検証（本変更の唯一の「ロジック」）
3. 実履歴による検証（判定が実際の PR 群で破綻しないか）

## A. 静的検証

| ID  | 観点                              | 確認方法                  | 期待                 | 結果 |
| --- | --------------------------------- | ------------------------- | -------------------- | ---- |
| A-1 | YAML として妥当                   | `yaml.safe_load` でパース | 例外なし             | PASS |
| A-2 | ジョブ構成                        | パース結果の `jobs` キー  | `['quality', 'e2e']` | PASS |
| A-3 | ステップの実行条件                | 各ステップの `if` を列挙  | 設計どおり（下記）   | PASS |
| A-4 | `weekly-maintenance.yml` の非破壊 | 同様にパース              | 変更前と同一         | PASS |
| A-5 | 整形                              | `pnpm format:check`       | クリーン             | PASS |

A-3 の期待値：

- `Format check` … 条件なし（常に実行）
- `Lint` / `Type check` / `Build` / `Test` … `steps.scope.outputs.docs_only != 'true'`
- 監査 4 ステップ … `steps.scope.outputs.deps_changed == 'true'`
  （情報提供用のみ `always() && ...`）
- サマリ … `always()`
- `e2e` ジョブ … `github.event_name == 'pull_request' && needs.quality.outputs.docs_only != 'true'`

## B. 判定ロジックの単体検証

`ci.yml` の判定部分だけを切り出したシェルスクリプトに、変更ファイル一覧を与えて出力を確認する。

| ID   | 入力                                              | 期待                      | 結果 |
| ---- | ------------------------------------------------- | ------------------------- | ---- |
| B-01 | `docs/` 配下のみ 2 件                             | docs_only=true            | PASS |
| B-02 | `docs/` + `logs/` + `notes/` + ルート `README.md` | docs_only=true            | PASS |
| B-03 | `docs/` + `apps/web/src/**.ts`                    | docs_only=false           | PASS |
| B-04 | `packages/**` のコードのみ                        | docs_only=false           | PASS |
| B-05 | `apps/web/README.md`（配下の md）                 | docs_only=false           | PASS |
| B-06 | `pnpm-lock.yaml` + `package.json`                 | deps_changed=true         | PASS |
| B-07 | `docs/` + `apps/web/package.json`                 | deps_changed=true         | PASS |
| B-08 | `.claude/hooks/*.mjs`                             | docs_only=false           | PASS |
| B-09 | `.github/workflows/ci.yml`                        | docs_only=false           | PASS |
| B-10 | 差分が空                                          | docs_only=false（安全側） | PASS |

B-05 / B-08 / B-09 は「ドキュメントに見えるがコード扱いにしたい」ケースの固定。
B-10 は判定不能時に検証をスキップしないことの固定。

### 初回実行で検出した不具合

B-01 / B-02 が `docs_only=false` になった。原因は判定の正規表現を
`^(docs/|logs/|notes/|[^/]*\.md)$` と末尾 `$` で閉じていたことで、`docs/` という文字列
そのものにしかマッチしていなかった。前方一致（`^(docs/|logs/|notes/)`）と
完全一致（`^[^/]*\.md$`）を分けて修正し、全件 PASS になった。

## C. 実履歴による検証

`main` への直近 25 マージについて、マージコミットの第 1 親（main 側）と第 2 親（PR head 側）の
差分を判定に流し、分布を確認する。

| ID  | 観点                               | 期待                  | 結果                                                |
| --- | ---------------------------------- | --------------------- | --------------------------------------------------- |
| C-1 | 判定がエラーなく完了する           | 25 件すべて判定できる | PASS                                                |
| C-2 | ドキュメントのみの PR が識別される | 目視で妥当な件数      | 3 件（12%）— session-log / レビュー系 PR で妥当     |
| C-3 | 依存変更ありの PR が識別される     | 目視で妥当な件数      | 6 件（24%）— dependabot 由来・security 系 PR で妥当 |

C-2 の実測により、設計時に見込んだ削減効果を訂正した
（「push の 60% を削減」→ PR 単位では 12%）。

## D. マージ後に確認すること（未実施）

Actions が課金停止中のため、以下は**マージ後に実地で確認する**。

| ID  | 観点                                   | 確認方法                         | 期待                                                             |
| --- | -------------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| D-1 | 新ワークフローが起動する               | 本 PR 自身の run                 | `quality` / `e2e` の 2 ジョブが表示される                        |
| D-2 | コードを含む変更で全ゲートが走る       | 本 PR（`.github/` を含む）の run | `docs_only=false`。lint / type-check / build / test が実行される |
| D-3 | 課金分数が想定どおり減る               | run の各ジョブ時間               | `quality` 約 4 分・`e2e` 約 2 分（計 6 分。変更前 11 分）        |
| D-4 | ドキュメントのみの PR でスキップされる | 次のドキュメント PR              | `docs_only=true`。`format:check` のみ実行され約 1 分             |
| D-5 | サマリが出る                           | run の Summary タブ              | 実行範囲の表が表示される                                         |
| D-6 | 依存変更 PR で監査が走る               | 次の dependabot PR               | `deps_changed=true`。監査ステップが実行される                    |

D-1 / D-2 は本 PR のマージ前に自動的に確認できる（本 PR が新ワークフローの対象になるため）。
D-3〜D-6 はマージ後の観測事項として作業ログの「次回やること」に残す。

## 対象外

- Vitest によるテスト追加。アプリケーションのコードが変わらないため。
- E2E の実行。CI 上の E2E は `DATABASE_URL` secret に依存し、本変更はその条件分岐を
  変えていない。
- 課金分数の実測比較。Actions 復旧後に D-3 で確認する。

## 完了条件

1. A・B・C の全項目が期待どおり（実施済み）。
2. 検証項目（lint / type-check / build / test / E2E / 依存監査）がコードを含む PR で
   1 つも減っていないこと。
3. D の未実施項目が作業ログに引き継がれていること。
