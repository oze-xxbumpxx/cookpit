# 設計書: harness-plugin-split

- ステータス: confirmed（ユーザー承認 2026-07-31: 3 分割 / D-1 Cookpit ローカル /
  D-2 CLAUDE.md テンプレート断片 / D-3 プロジェクト名前置）
- レベル: L3
- 関連: docs/requirements/harness-plugin-split.md / docs/designs/harness-portability.md（Phase 1）

## 背景

要件定義の「背景」を正とする。Phase 1（`d1bf604`）+ 土台試験（`2bcd240`）が完了し、
Plugin 3 分割が確定した。本 Phase は層マニフェストの確定と層をまたぐ依存の解消。

## 目的

3 つの Plugin が単独で成立する状態にする（要件 F-1〜F-2）。

## 要件

要件定義 F-1〜F-7 / N-1〜N-3 を正とする。D-1〜D-3 の決着により以下が確定した。

- **D-1 = Cookpit ローカルに残す** → スタック固有 1,418 行は**変更しない**。Plugin へ
  同梱しないだけで、Cookpit では現状のまま動く。要件 F-5 は「混入させない」であり、
  同梱対象から外すことで充足する。
- **D-2 = CLAUDE.md テンプレートの断片** → `coding-standards.md` の汎用分を
  Plugin 同梱の断片ファイルとして配り、移植先が自分の CLAUDE.md へ取り込む。
- **D-3 = プロジェクト名を前置** → `出典: cookpit/<feature> 事象 N` の形。

## 対象範囲

- `.claude/skills/close-session/SKILL.md` — 分割（F-3・D-5）
- `.claude/skills/` 配下に新規 1 本 — improvement 層のメトリクス・振り返り手順
- `.claude/hooks/record-activity.mjs` / `.claude/scripts/estimate-session-time.mjs` —
  層の再割り当て（D-4。コード変更はコメントのみ）
- `.claude/scripts/record-task-metrics.sh` — `COOKPIT_METRICS_*` 11 箇所の改名
- 出典表記 38 箇所 / 15 ファイル（D-3）
- 層マニフェストの新規文書（Phase 3 の入力）
- CLAUDE.md テンプレート断片の新規ファイル（D-2）

## 対象外

要件定義「対象外」を正とする。特に:

- スタック固有 1,418 行（D-1 により**手を触れない**）
- `plugin.json` / `marketplace.json` / Plugin リポジトリ作成 → Phase 3
- Cookpit の利用側転換 → Phase 3
- アプリコード・DB・API 契約 — 変更なし

## 現状構成

`close-session` の手順 1〜7 が 5 本のスクリプトに依存し、うち 4 本が improvement 層。

| 手順           | 依存                                                  | 層            |
| -------------- | ----------------------------------------------------- | ------------- |
| 1 品質ゲート   | `run-quality-gates.sh`                                | core          |
| 2 所要時間推定 | `estimate-session-time.mjs`                           | → core（D-4） |
| 3 日次ログ     | `write-work-log` Skill                                | core          |
| 4 メトリクス   | `record-task-metrics.sh` / `collect-task-metrics.mjs` | improvement   |
| 5 振り返り     | `reflection-agent` / `reflect-task`                   | improvement   |
| 6 コミット     | なし                                                  | —             |
| 7 最終報告     | なし                                                  | —             |
| 完了条件       | `check-review-coverage.mjs`                           | improvement   |

## 変更後構成

### 層マニフェスト

**`harness-core`**（依存なし）

```
lib/           harness-paths.mjs, harness-state.mjs
hooks/         guard-dangerous.mjs, session-start-info.sh, record-activity.mjs
scripts/       detect-project-commands.sh, run-quality-gates.sh, harness-run.mjs,
               estimate-session-time.mjs, migrate-state.mjs
skills/        quality-gates, write-work-log
tests/         guard-dangerous.test.mjs, harness-paths.test.mjs, harness-state.test.mjs
templates/     coding-standards の CLAUDE.md 断片（新規・D-2）
```

**`harness-workflow`**（core 依存）

```
agents/        orchestrator, architecture-designer, implementation-planner, implementer,
               reviewer, test-designer, security-reviewer
skills/        classify-change, create-requirements-document, create-design-document,
               create-implementation-plan, create-test-plan, create-adr,
               validate-deliverables, kickoff-session, close-session
hooks/         check-deliverables.mjs, record-subagent.mjs, validate-agent-config.mjs
scripts/       session-briefing.sh
docs/          document-policy, development-workflow, definition-of-done,
               agent-responsibilities, orchestration-policy
```

**`harness-improvement`**（workflow 依存）

```
agents/        reflection-agent, agent-improvement-manager, agent-evaluator
skills/        reflect-task, audit-skills, sprint-review,
               record-metrics-and-reflect（新規・close-session から分離）
hooks/         check-improvement-cycle.mjs
scripts/       collect-task-metrics.mjs, record-task-metrics.sh, sprint-summary.sh,
               check-review-coverage.mjs
docs/          memory-policy, improvement-cycle, improvements/ の空構造 + テンプレート
evals/         README, rubrics/scoring-rubric.md, cases/（汎用ケースのみ）
```

**Cookpit ローカル（Plugin 非同梱・D-1）**

```
agents/        contract-designer
skills/        manual-browser-verify, review-codex-implementation, create-codex-brief
scripts/       check-codex-implementation.mjs, assert-e2e-results.mjs
rules/         domain-layer.md, presentation-layer.md
tests/         assert-e2e-results.test.mjs
evals/         baselines/, results/, cases/ のスタック固有分
docs/          codex-delegation-playbook.md ほか Cookpit 運用固有
```

### `close-session` の分割（D-5）

`close-session`（workflow 層）は手順 1・2・3・6・7 を保持し、手順 4・5 と完了条件の
`check-review-coverage.mjs` 参照を新 Skill `record-metrics-and-reflect`（improvement 層）
へ移す。`close-session` からは**条件付き参照**にする。

> improvement 層が利用可能なら `record-metrics-and-reflect` を実行する。
> 無ければスキップし、ログにスキップした旨を書く。

これで要件 E-02（improvement 層が無い環境で失敗せずスキップ）と F-4
（kickoff / close が同一層）を同時に満たす。

### `record-activity` + `estimate-session-time` の層（D-4）

improvement 層から **core 層へ移す**。根拠は 2 つ。

1. 依存が `harness-paths` のみで、core の外に出る必要がない。
2. `write-work-log`（core）のログ雛形に「所要時間」節がある。この 2 本が無いと
   core だけの環境で常に「記録なし」になり、core が不完全な成果物を出す。

**前回の層割り当てを訂正する**（当初は improvement に置いていた）。メトリクスの
_集計_（`collect-task-metrics` → YAML）は改善サイクルの入力なので improvement に残す。
活動の*記録*と時間の*推定*は core。

### 出典表記（D-3）

38 箇所を機械的に一括置換しない。参照先の性質で 3 分類する。

| 分類                                                  | 扱い                                   | 例                                                                       |
| ----------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| (a) 事象記録（`improvements/candidates/` 等）への参照 | `出典: cookpit/<feature> 事象 N` へ    | `candidates/recipe-servings.md 事象2` → `cookpit/recipe-servings 事象 2` |
| (b) Plugin 同梱ファイルへの参照                       | **パス維持**（移植先でも生きる）       | `.claude/evals/cases/frontend-screen-addition.md`                        |
| (c) Cookpit ローカル資産への参照                      | `出典: cookpit/...` へ（パスを落とす） | `docs/designs/store-master.md`                                           |

(b) を一律書き換えると移植先で辿れる参照を壊すため、分類が必要。

## データフロー

変更なし。`close-session` の分割は手順の所属を変えるだけで、状態ファイル・ログ・
メトリクス YAML の形式と保存先は不変。

## API 設計

対象外（HTTP API の変更なし）。`record-task-metrics.sh` の内部環境変数名のみ変更:
`COOKPIT_METRICS_*` → `HARNESS_METRICS_*`。**後方互換は不要**（shell と inline node の
内部受け渡しで、利用者が設定するものではない。要件定義の分類どおり）。

## DB 設計

対象外。

## フロントエンド設計

対象外（`apps/web` 変更なし）。

## バックエンド設計

対象外（アプリコード変更なし。対象は Claude Code ハーネスのみ）。

## エラー処理

外部 API / 外部ストレージへの I/O を含まないため 5 項目は対象外。ハーネス固有の方針:

- `close-session` から improvement 層の Skill を呼べない場合、**エラーにせずスキップ**して
  ログに記録する（要件 E-02）。セッション終了作業を止めないため。
- `check-improvement-cycle` Hook の fail-open は現行維持（要件 E-03）。

## ログと監視

変更なし。活動ログ・ゲートログ・メトリクス YAML の形式は不変。

## セキュリティ

- 層分割そのものにセキュリティ影響はない。
- `guard-dangerous.mjs`（破壊的操作の防止）を **core 層**に置くのは意図的。最小構成でも
  安全境界が最初から有効になる。core を入れずに workflow だけ入れる構成は
  `plugin.json` の依存宣言で防ぐ（要件 E-01・Phase 3 で実装）。

## 性能

影響なし。ファイルの所属を変えるだけで実行経路は不変。

## テスト方針

`pnpm test:harness`（node:test）と機械照合を併用する。詳細は
`docs/tests/harness-plugin-split.md`。

- **層をまたぐ依存が 0 件**であることを grep で機械照合する（本 Phase の中心的検証）。
- `close-session` 分割後、両 Skill の手順が重複・欠落しないことをチェックリストで確認。
- 出典書き換えは (b) を壊していないこと（同梱ファイルへのパスが生存）を確認。
- 既存 67 件の harness テストが回帰しないこと。

## 移行とリリース

- データ移行: 対象外。
- Cookpit への影響: `close-session` は分割後も両 Skill が存在するため手順は実質不変。
  `record-task-metrics.sh` の環境変数改名はスクリプト内部で完結する。
- Plugin としての公開は Phase 3。本 Phase の成果物は「切り出せる状態」までで、
  リポジトリは作らない。

## リスク

| #   | リスク                                                           | 検出タイミング      | 対応                                                                       |
| --- | ---------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------- |
| R-a | `close-session` 分割で手順が欠落・二重化する                     | 実装直後のチェック  | 分割前の手順 1〜7 と完了条件を対照表で照合。両 Skill 合わせて漏れ 0 を確認 |
| R-b | 出典の一括置換で (b) の生きた参照を壊す                          | 実装中・レビュー    | 分類してから置換。置換後に同梱ファイルへのパスが生存しているか grep        |
| R-c | 層マニフェストに漏れがあり、Phase 3 で初めて気づく               | 本 Phase の機械照合 | `.claude/` 全ファイルを 4 分類のいずれかへ割り当て、未分類 0 を確認        |
| R-d | `record-task-metrics.sh` の改名漏れで metrics 記録が黙って壊れる | 実装直後            | 改名後にスクリプトを実行し、YAML が更新されることを確認                    |

## 未決事項

- Phase 3 の `plugin.json` における依存宣言の具体形式（要件 E-01）。Plugin の依存宣言が
  実際にどこまで強制されるかは Phase 3 の調査事項。本 Phase では README 明記で代替する前提。
- `evals/cases/` の「汎用ケースのみ」の線引き。10 ケースのうち
  `aws-integration-change` / `contract-validation-change` / `database-schema-change` /
  `frontend-screen-addition` はスタック前提を含む。Phase 3 で個別判断する。
