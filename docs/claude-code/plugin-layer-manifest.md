# Plugin 層マニフェスト

ハーネスを 3 層 Plugin として配布するための、ファイル単位の層割り当て。Phase 3
（Plugin リポジトリ作成）の入力であり、**この表が切り出しの正典**。

- 決定の根拠: [ADR-0014](../decisions/ADR-0014-harness-plugin-three-layer-split.md)
- 設計: [harness-plugin-split](../designs/harness-plugin-split.md)

## 層と依存

| Plugin                | 依存     | 目的                                            |
| --------------------- | -------- | ----------------------------------------------- |
| `harness-core`        | なし     | 安全境界・品質ゲート・作業ログ                  |
| `harness-workflow`    | core     | 変更レベル分類と設計 → 実装 → レビューの工程    |
| `harness-improvement` | workflow | メトリクス・振り返り・改善サイクル・回帰評価    |
| （cookpit-local）     | —        | Plugin へ同梱しない。スタック固有・実績固有資産 |

**下位層は上位層のファイルを参照しない。** これが分割の成立条件（要件 F-2）。

## 割り当て（`.claude/` 全 72 ファイル）

`state/`（gitignore 対象）・`evals/results/`・`evals/baselines/`（実績値）は配布対象外の
ため計上しない。

### harness-core（17）

| path                                      | 備考                                                       |
| ----------------------------------------- | ---------------------------------------------------------- |
| `lib/harness-paths.mjs`                   | 状態パス解決の正典。全層の土台                             |
| `lib/harness-state.mjs`                   | run 状態の読み書き                                         |
| `hooks/guard-dangerous.mjs`               | 破壊的操作の防止。最小構成でも安全境界を効かせる           |
| `hooks/session-start-info.sh`             | → `scripts/detect-project-commands.sh`                     |
| `hooks/record-activity.mjs`               | **D-4 で improvement から移動**。依存は harness-paths のみ |
| `scripts/detect-project-commands.sh`      | 品質コマンドの検出                                         |
| `scripts/run-quality-gates.sh`            | → harness-paths / harness-state                            |
| `scripts/harness-run.mjs`                 | run 状態の確認（`where` / `show`）                         |
| `scripts/estimate-session-time.mjs`       | **D-4 で移動**。`write-work-log` の「所要時間」を埋める    |
| `scripts/migrate-state.mjs`               | リポジトリ内 → 永続領域の移行                              |
| `skills/quality-gates/SKILL.md`           | → detect-project-commands / run-quality-gates              |
| `skills/write-work-log/SKILL.md`          | 依存なし                                                   |
| `rules/coding-standards.md`               | Cookpit 内での正典。Plugin へは断片として配る（D-2）       |
| `templates/claude-md-coding-standards.md` | **新規**。移植先の CLAUDE.md へ取り込む断片（D-2）         |
| `tests/guard-dangerous.test.mjs`          | 安全境界の回帰                                             |
| `tests/harness-paths.test.mjs`            | 公開 API 13 件（`2bcd240` で全件カバー）                   |
| `tests/harness-state.test.mjs`            | 並行更新・復旧の回帰                                       |

### harness-workflow（22）

| path                                           | 備考                                     |
| ---------------------------------------------- | ---------------------------------------- |
| `agents/orchestrator.md`                       | 工程の統括                               |
| `agents/architecture-designer.md`              | 要件 + 設計                              |
| `agents/implementation-planner.md`             | 実装計画                                 |
| `agents/implementer.md`                        | 実装                                     |
| `agents/reviewer.md`                           | レビュー                                 |
| `agents/test-designer.md`                      | 試験計画                                 |
| `agents/security-reviewer.md`                  | 観点独立のため単独維持                   |
| `skills/classify-change/SKILL.md`              | 変更レベル判定                           |
| `skills/create-requirements-document/SKILL.md` | L3 要件定義                              |
| `skills/create-design-document/SKILL.md`       | 設計書                                   |
| `skills/create-implementation-plan/SKILL.md`   | 実装計画                                 |
| `skills/create-test-plan/SKILL.md`             | 試験計画                                 |
| `skills/create-adr/SKILL.md`                   | ADR                                      |
| `skills/validate-deliverables/SKILL.md`        | 整合性確認                               |
| `skills/kickoff-session/SKILL.md`              | → `scripts/session-briefing.sh`          |
| `skills/close-session/SKILL.md`                | **分割後**。improvement 層は条件付き参照 |
| `hooks/check-deliverables.mjs`                 | L2/L3 成果物の存在チェック               |
| `hooks/record-subagent.mjs`                    | Subagent 呼び出しの記録                  |
| `hooks/validate-agent-config.mjs`              | Agent 定義の検証。`agents/` の存在が前提 |
| `scripts/session-briefing.sh`                  | セッション開始ブリーフィング             |
| `evals/cases/documentation-only-change.md`     | スタック非依存のケース                   |
| `evals/cases/small-bug-fix.md`                 | 同上                                     |

方針ドキュメント（`docs/claude-code/` 側）: `document-policy.md` /
`development-workflow.md` / `definition-of-done.md` / `agent-responsibilities.md` /
`orchestration-policy.md`。

### harness-improvement（18）

| path                                                                                                            | 備考                                  |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `agents/reflection-agent.md`                                                                                    | 振り返り                              |
| `agents/agent-improvement-manager.md`                                                                           | 横断分析・改善提案                    |
| `agents/agent-evaluator.md`                                                                                     | 回帰評価                              |
| `skills/reflect-task/SKILL.md`                                                                                  | → `scripts/record-task-metrics.sh`    |
| `skills/audit-skills/SKILL.md`                                                                                  | 指示系の棚卸し                        |
| `skills/sprint-review/SKILL.md`                                                                                 | → `scripts/sprint-summary.sh`         |
| `skills/record-metrics-and-reflect/SKILL.md`                                                                    | **新規**。close-session から分離      |
| `hooks/check-improvement-cycle.mjs`                                                                             | → `scripts/check-review-coverage.mjs` |
| `scripts/collect-task-metrics.mjs`                                                                              | transcript / ゲートログの集計         |
| `scripts/record-task-metrics.sh`                                                                                | メトリクス YAML への転記              |
| `scripts/sprint-summary.sh`                                                                                     | 週次集計                              |
| `scripts/check-review-coverage.mjs`                                                                             | レビュー記録の網羅チェック            |
| `evals/README.md` / `evals/rubrics/scoring-rubric.md`                                                           | 評価の枠組み（汎用）                  |
| `evals/cases/refactoring.md` / `permission-change.md` / `api-field-addition.md` / `external-service-failure.md` | 比較的スタック非依存                  |

方針ドキュメント: `memory-policy.md` / `improvement-cycle.md` /
`improvements/` の空構造 + テンプレート。

### cookpit-local（Plugin 非同梱・14）

D-1 の決定により**手を触れず Cookpit に残す**。

| path                                          | 非同梱の理由                                        |
| --------------------------------------------- | --------------------------------------------------- |
| `agents/contract-designer.md`                 | Drizzle / Hono / Zod 前提                           |
| `skills/manual-browser-verify/SKILL.md`       | `apps/web` / `dev:pglite` 前提                      |
| `skills/review-codex-implementation/SKILL.md` | Codex 委譲運用 + Tailwind 検査前提                  |
| `skills/create-codex-brief/SKILL.md`          | Codex 委譲運用前提                                  |
| `scripts/check-codex-implementation.mjs`      | 861 行。Tailwind クラス辞書検証・`globals.css` 解析 |
| `scripts/assert-e2e-results.mjs`              | Playwright E2E 前提                                 |
| `rules/domain-layer.md`                       | Clean Architecture + DDD 前提                       |
| `rules/presentation-layer.md`                 | Next.js App Router + Hono 前提                      |
| `rules/README.md`                             | Cookpit の rules 構成の説明                         |
| `tests/assert-e2e-results.test.mjs`           | 上記の試験                                          |
| `evals/cases/aws-integration-change.md`       | AWS 前提                                            |
| `evals/cases/contract-validation-change.md`   | Zod 契約前提                                        |
| `evals/cases/database-schema-change.md`       | Drizzle 前提                                        |
| `evals/cases/frontend-screen-addition.md`     | Next.js 画面前提                                    |

### 層に属さない（2）

| path                                                    | 扱い                                                                                                                                                                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings.json`                                         | Plugin では配布せず、**各プロジェクトが自分で持つ**。Claude 経由の編集はハーネスが拒否するためユーザー直接編集（backlog 2026-07-20 で確定）。Plugin 側は README に推奨 permissions / hooks 設定例を載せる |
| `evals/cases/documentation-only-change.md` 以外の未分類 | なし（下の照合で 0 件を確認）                                                                                                                                                                             |

## 割り当ての検算

ディレクトリ別に層へ割り当てた件数（2026-07-31 実測・全 72 ファイル）。

| ディレクトリ    | core   | workflow | improvement | cookpit-local | 層外  | 計     |
| --------------- | ------ | -------- | ----------- | ------------- | ----- | ------ |
| `agents/`       | 0      | 7        | 3           | 1             | 0     | 11     |
| `evals/`        | 0      | 2        | 6           | 4             | 0     | 12     |
| `hooks/`        | 3      | 3        | 1           | 0             | 0     | 7      |
| `lib/`          | 2      | 0        | 0           | 0             | 0     | 2      |
| `rules/`        | 1      | 0        | 0           | 3             | 0     | 4      |
| `scripts/`      | 5      | 1        | 4           | 2             | 0     | 12     |
| `skills/`       | 2      | 9        | 4           | 3             | 0     | 18     |
| `templates/`    | 1      | 0        | 0           | 0             | 0     | 1      |
| `tests/`        | 3      | 0        | 0           | 1             | 0     | 4      |
| `settings.json` | 0      | 0        | 0           | 0             | 1     | 1      |
| **計**          | **17** | **22**   | **18**      | **14**        | **1** | **72** |

`state/`（gitignore 対象）・`evals/results/`・`evals/baselines/`（実績値）は配布対象外
のため計上しない。**未分類 0 件。**

検算コマンド:

```bash
find .claude -type f ! -path "*/state/*" ! -path "*/evals/results/*" \
  ! -path "*/evals/baselines/*" | wc -l          # → 72
```

> この検算表は当初 core 16 / improvement 12（見出し）と 16（検算表）で食い違っており、
> `templates/` の新規分も未計上だった。試験計画の観点 11（未分類 0 件の照合）で検出した。
> **ファイル一覧の表の行数と検算の数値は別々に書くと必ずずれる。** ディレクトリ別の
> 実数から積み上げる形に改めた。

## 層をまたぐ依存の禁止

下位層が上位層を参照していないことを機械照合する。

```bash
# core が workflow / improvement のファイルを参照していないか
grep -rlE "collect-task-metrics|record-task-metrics|sprint-summary|check-review-coverage|session-briefing" \
  .claude/lib .claude/hooks/guard-dangerous.mjs .claude/hooks/record-activity.mjs \
  .claude/hooks/session-start-info.sh .claude/scripts/run-quality-gates.sh \
  .claude/scripts/detect-project-commands.sh .claude/scripts/harness-run.mjs \
  .claude/scripts/estimate-session-time.mjs .claude/scripts/migrate-state.mjs \
  .claude/skills/quality-gates .claude/skills/write-work-log

# workflow が improvement のファイルを参照していないか
grep -rlE "collect-task-metrics|record-task-metrics|sprint-summary|check-review-coverage|reflect-task|reflection-agent" \
  .claude/skills/close-session .claude/skills/kickoff-session .claude/skills/classify-change \
  .claude/skills/validate-deliverables .claude/hooks/check-deliverables.mjs \
  .claude/hooks/record-subagent.mjs .claude/scripts/session-briefing.sh
```

grep は**スクリーニング**であり、ヒット 0 件が条件ではない。各ヒットを 2 分類し、
**無条件依存 0 件**が受け入れ条件。

| 分類                                                           | 判定               |
| -------------------------------------------------------------- | ------------------ |
| (i) 無条件依存: 上位層のスクリプト実行・Agent 起動を前提にする | **不可**。修正する |
| (ii) 条件付き参照: 「存在する場合のみ」+ 無い場合の挙動を明記  | 許容               |

### 現状（2026-07-31 実測）

| ファイル                          | ヒット                                   | 分類                                                 |
| --------------------------------- | ---------------------------------------- | ---------------------------------------------------- |
| `skills/close-session/SKILL.md`   | `record-metrics-and-reflect`             | (ii) 手順 4 で「利用可能なら実行・無ければスキップ」 |
| `skills/classify-change/SKILL.md` | `reflection-agent` / `contract-designer` | (ii) ※注で「存在する場合のみ起動」                   |

無条件依存は **0 件**。

分割前に存在した無条件依存 2 件は本 Phase で解消した。

- `close-session` の手順 4・5 が improvement 層のスクリプト 4 本を無条件実行していた。
- `classify-change` の L2 Agent 早見表が `reflection-agent`（improvement）と
  `contract-designer`（cookpit-local）を無条件で指定していた。後者は
  **層をまたぐ依存の照合で初めて発見**した（close-session と同じ類型の欠陥）。
