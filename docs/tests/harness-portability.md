# 試験計画: harness-portability

- 前提となる設計書: docs/designs/harness-portability.md
- レベル: L2

## 試験種別

単体試験のみ。ランナーは **node:test**（`pnpm test:harness` =
`node --test .claude/tests/*.test.mjs`）。追加先は既存の
`.claude/tests/harness-paths.test.mjs` 1 本で、新規テストファイルは作らない。

Vitest 対象外のため `tests/**/*.node.test.ts` 等の命名規約は適用されない
（`create-test-plan` 手順 9・10 の確認: `package.json` に `test:harness` が実在する）。

結合試験は対象外。名前空間の導出は `resolveStateDir` の内部決定で、外部 I/O や
パッケージ間結合を伴わない。

本変更は**振る舞い不変のリファクタ**（設計書「目的」: Cookpit 側の挙動を変えない）。
`create-test-plan` の選択基準表に従い**回帰観点（入出力不変）を最優先**する。

## 単体試験観点

| #   | 観点                                                    | 前提                                                              | 操作                                                                  | 期待結果                                                          | 分類 |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- | ---- |
| 1   | `HARNESS_NAMESPACE` が最優先される                      | sandbox の `root` / `home`                                        | `resolveNamespace({ env: { HARNESS_NAMESPACE: 'my-ns' }, root })`     | `'my-ns'`                                                         | 正常 |
| 2   | `package.json` の `name` から `-harness` 付きで導出する | `root` に `{"name":"acme"}` の `package.json` を置く              | `resolveNamespace({ env: {}, root })`                                 | `'acme-harness'`                                                  | 正常 |
| 3   | `package.json` が無ければ既定値へ落ちる                 | `root` に `package.json` を置かない                               | `resolveNamespace({ env: {}, root })`                                 | `DEFAULT_NAMESPACE`（`'claude-harness'`）                         | 異常 |
| 4   | スコープ付き名を安全な 1 セグメントへ変換する           | `{"name":"@acme/web"}`                                            | `resolveNamespace({ env: {}, root })`                                 | `'acme-web-harness'`（`@` 除去・`/` → `-`）                       | 境界 |
| 5   | 相対参照を名前空間に持ち込めない                        | —                                                                 | `resolveNamespace({ env: { HARNESS_NAMESPACE: '../../etc' }, root })` | パス区切りと `..` が落ちた単一セグメント。`/` と `..` を含まない  | 異常 |
| 6   | 空・空白・記号のみの指定は既定値へ落ちる                | —                                                                 | `HARNESS_NAMESPACE` に `''` / `'   '` / `'///'` を与える              | いずれも `DEFAULT_NAMESPACE`                                      | 境界 |
| 7   | `package.json` が壊れていても例外を投げない             | `root` に不正 JSON の `package.json` を置く                       | `resolveNamespace({ env: {}, root })`                                 | 例外を投げず `DEFAULT_NAMESPACE`（設計書「エラー処理」の方針）    | 異常 |
| 8   | **回帰**: Cookpit のリポジトリルートで現行値と一致する  | `root` = リポジトリルート（実 `package.json`、`name: 'cookpit'`） | `resolveNamespace({ env: {}, root })`                                 | `'cookpit-harness'`（既存状態ディレクトリと同一 = 移行不要。R-2） | 正常 |

### 自動試験を追加しない変更（理由つき）

| #   | 対象                                                   | 理由と代替の確認方法                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 9   | 環境変数の改名（TZ + GAP_CAP_MIN。mjs 3 本 / sh 2 本） | `.claude/tests/` に対象スクリプトのテストが存在せず、本 Phase で新設するとスコープを超える。代替: `grep -rn 'COOKPIT_'` の残存が後方互換フォールバックと対象外ファイル（`record-task-metrics.sh`）のみであることの照合（実装手順 4） |
| 10  | shell 2 本の日付出力                                   | 同上。代替: `session-briefing.sh` / `sprint-summary.sh` を実行し、日付行が変更前と同値であることの目視確認（実装手順 5）                                                                                                             |
| 11  | コメント・ドキュメントの追随                           | 実行時挙動を持たない。代替: 差分レビュー                                                                                                                                                                                             |

## 結合試験観点

| #   | 観点   | 前提 | 操作 | 期待結果 | 分類 |
| --- | ------ | ---- | ---- | -------- | ---- |
| —   | 対象外 | —    | —    | —        | —    |

対象外の理由: 名前空間の導出は `resolveStateDir` 内部の決定で、パッケージ間結合・
外部 I/O・DB を伴わない。`resolveStateDir` 経由の振る舞いは既存 7 件が回帰として担保する。

## 特性観点

- **権限**: 状態ディレクトリ作成時の mode 0700 は不変（`stateDir` 未変更）。
  `hasSafePermissions` の判定基準も不変。新規観点なし。
- **データ整合性**: 導出結果が現行値と一致することが整合性の要件（観点 8 で固定）。
  一致しなければ既存状態ファイルが孤児化するため、実装手順 3 をゲートに置く。
- **冪等性**: 対象外。`resolveNamespace` は純粋関数（同一 `env` / `root` で常に同一結果）で、
  書き込み系 UseCase・外部連携・メッセージ再処理のいずれにも該当しない。
- **障害系（外部 I/O がある場合）**: 対象外。外部 API / ストレージへの I/O を含まない。
  唯一のファイル読み取り（`package.json`）の失敗系は観点 3・7 で単体側に含めた。
- **フロントエンド（apps/web の場合）**: 対象外。`apps/web` に変更なし。
- **防御性（Domain 層 Entity/VO の場合）**: 対象外。`packages/domain` の
  Entity / Value Object に変更なし（対象は `.claude/` のハーネスコードのみ）。
  ただし観点 5・6 で「外部入力を内部パスへ連結する前の無害化」を確認しており、
  防御性の趣旨はこちらで満たす。

## メソッド網羅チェック表

`.claude/lib/harness-paths.mjs` の公開 API を全列挙する。

| クラス / モジュール | メソッド                             | 対応する試験観点 No                                                         |
| ------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| harness-paths       | `DEFAULT_NAMESPACE`（新規 const）    | 3, 6, 7                                                                     |
| harness-paths       | `resolveNamespace`（新規）           | 1〜8                                                                        |
| harness-paths       | `resolveStateDir`（変更）            | 既存 5 件（回帰）+ 観点 8                                                   |
| harness-paths       | `isInside`                           | 既存 1 件（回帰。変更なし）                                                 |
| harness-paths       | `StateDirError`                      | 既存 3 件（`inside_repo` / `not_absolute` / `symlink_into_repo`。変更なし） |
| harness-paths       | `STATE_NAMESPACE`（削除）            | 削除のため観点なし。参照残存が無いことを実装手順 1 の完了条件で確認         |
| harness-paths       | `repoRoot`                           | **本タスク対象外**（既存未整備・本変更で挙動不変）                          |
| harness-paths       | `stateDir`                           | **本タスク対象外**（同上。副作用ありのため sandbox 整備が必要）             |
| harness-paths       | `statePath`                          | **本タスク対象外**（同上）                                                  |
| harness-paths       | `safeStatePath`                      | **本タスク対象外**（同上）                                                  |
| harness-paths       | `legacyStateDir` / `legacyStatePath` | **本タスク対象外**（同上）                                                  |
| harness-paths       | `resolveReadablePath`                | **本タスク対象外**（同上）                                                  |
| harness-paths       | `hasSafePermissions`                 | **本タスク対象外**（同上）                                                  |

「本タスク対象外」の 7 件は**本変更以前から未整備**で、かつ本変更で挙動が変わらない。
依頼スコープ外の改善に当たるため追加しない（CLAUDE.md「スコープ」）。
**未整備の事実は振り返りで改善候補として残す**（既存カバレッジの穴であり、
本タスクが作った穴ではない）。

## 回帰試験範囲

| 対象                                                                                                 | 影響理由                                                   | 確認方法                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `.claude/tests/harness-paths.test.mjs` 既存 7 件                                                     | `resolveStateDir` の内部を変更                             | `pnpm test:harness` 全件 PASS                                                                         |
| `harness-state.mjs` 経由の状態読み書き                                                               | 保存先パスの決定経路が変わる                               | 観点 8 で同一パスを固定。加えて `node .claude/scripts/harness-run.mjs where` が変更前と同じパスを出す |
| 記録系 Hook 4 本（record-activity / record-subagent / check-deliverables / check-improvement-cycle） | `safeStatePath` / `resolveReadablePath` 経由で保存先に依存 | 既存 `~/.local/state/cookpit-harness/activity-log.jsonl` が変更後も追記先であること                   |
| 集計系 3 本（collect-task-metrics / estimate-session-time / sprint-summary）                         | 保存先 + TZ の両方に依存                                   | 変更前後で同じ集計結果が出ること                                                                      |
| `.claude/tests/` 他 3 本（guard-dangerous / harness-state / assert-e2e-results）                     | 同一ランナーで実行される                                   | `pnpm test:harness` 全件 PASS                                                                         |
| アプリコード（domain / application / infrastructure / apps/web）                                     | 影響なし（`.claude/` のみ変更）                            | `pnpm lint` / `type-check` / `test` が現行と同じ結果                                                  |

## 試験データ

sandbox（`mkdtempSync`）配下に既存 `sandbox()` ヘルパーと同じ構成で `root` / `home` を作り、
観点ごとに `root/package.json` を書き分ける。

| 観点 | `package.json` の内容                                                          |
| ---- | ------------------------------------------------------------------------------ |
| 2    | `{"name":"acme"}`                                                              |
| 3, 6 | 置かない                                                                       |
| 4    | `{"name":"@acme/web"}`                                                         |
| 7    | `{"name":` （不正 JSON）                                                       |
| 8    | リポジトリ実物（`name: "cookpit"`。`root` に `CLAUDE_PROJECT_DIR` 相当を渡す） |

`HARNESS_NAMESPACE` は `env` オブジェクトで渡し、`process.env` を汚さない
（既存試験と同じ方式）。

## 完了条件

**必須（本タスクのブロッカー）**

- 観点 1〜8 がすべて PASS。
- 既存 7 件が PASS（回帰）。
- 観点 8 が `'cookpit-harness'` を返す = データ移行不要（R-2）。**ここが FAIL なら実装を
  中断してユーザーへ報告する**（実装計画 手順 3 のゲート）。
- `pnpm test:harness` 全件 PASS（4 テストファイル）。
- `pnpm lint` / `pnpm type-check` / `pnpm test` が変更前と同じ結果（既存 warning 1 は許容）。
- `node .claude/scripts/harness-run.mjs where` が変更前と同じパスを出す。
- `grep -rn 'COOKPIT_'` の残存が後方互換フォールバックと対象外ファイル
  （`record-task-metrics.sh` の `COOKPIT_METRICS_*`）のみ。

**推奨**

- `session-briefing.sh` / `sprint-summary.sh` の実行で日付が現行と同値。

**将来フェーズ**

- メソッド網羅チェック表の「本タスク対象外」7 件への試験追加（別タスク）。
