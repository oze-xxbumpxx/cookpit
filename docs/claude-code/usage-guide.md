# 運用ガイド（Claude Code マルチエージェント開発基盤）

このリポジトリに構築した Claude Code 開発基盤の**全体像**と**日々の使い方**をまとめる。
各トピックの詳細は正典ドキュメントへリンクする（このファイルは入口・ナビゲーション）。

- 索引・命名対応表：[README.md](./README.md)
- 正典：[development-workflow.md](./development-workflow.md) /
  [document-policy.md](./document-policy.md) / [definition-of-done.md](./definition-of-done.md) /
  [orchestration-policy.md](./orchestration-policy.md) /
  [agent-responsibilities.md](./agent-responsibilities.md) /
  [memory-policy.md](./memory-policy.md) / [improvement-cycle.md](./improvement-cycle.md)

---

## 1. これは何か

機能追加・修正を、**Orchestrator（指揮役）が変更レベルを判定し、専門 Subagent へ
調査・設計・契約・テスト・計画・実装・レビュー・振り返りを委譲する**仕組み。あわせて、

- 変更レベルに応じた**自動成果物**（設計書・実装計画・試験計画・ADR・レビュー記録）
- 機械的な**品質ゲート**と**安全Hook**（破壊的・本番・秘密情報の操作をブロック）
- 独立 Reviewer による評価、タスク後の**振り返り**と**半自動の継続的改善**

を提供する。**最優先は Agent 数ではなく、整合性・手戻り削減・追跡可能性・過剰実行の防止。**

## 1.1 個人開発ライトモード（推奨既定）

個人開発ではフル装備を毎回使わない。次を既定とする（設計:
`docs/designs/harness-personal-light-mode.md` / IMP-2026-030・031）。

| 方針                 | 内容                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| L0/L1 を積極活用     | 相談・調査は L0。文言・単純修正は L1（設計書を作らない）                                                                               |
| 実装の既定ルート     | Codex 委譲（設計・計画・レビューは Claude）                                                                                            |
| 常備で意識する Agent | orchestrator / architecture-designer / implementation-planner / test-designer / implementer / reviewer（+ 必要時 contract / security） |
| reflection           | feature 完了時。毎セッション必須ではない                                                                                               |
| 改善サイクル         | 5 タスクごと / 同種 3 回 / ユーザー依頼時のみ。早期昇格は原則禁止                                                                      |
| 毎セッションの核     | Rules 3 本 + quality-gates + kickoff/close/work-log                                                                                    |

Agent の 11 本化は適用済み（吸収した 4 本は `docs/claude-code/archive/agents/` へ凍結）。
構成ファイルの変更は作業ブランチへコミットし **PR レビュー**で確認する（承認境界の経緯は
[harness-state.md](./harness-state.md) §4）。

## 2. 構成の全体像

```
.claude/
├── settings.json          Hook 登録 + permissions.deny（安全層）
├── agents/   (11 + archive)  Orchestrator + 専門/改善 Subagent
├── skills/   (17)         再利用可能な作業手順とテンプレート
├── rules/    (3)          層・パス別の確定ルール（+ README）
├── hooks/                 決定論的な検証・安全制御
├── scripts/               コマンド検出・品質ゲート・メトリクス
├── evals/                 改善の回帰評価（ケース + rubric + baselines）
└── state/                 実行時の一時状態（Git 非追跡）
docs/claude-code/          方針ドキュメントと改善記録（improvements/）
docs/{requirements,designs,implementation-plans,tests,decisions,reviews}/  feature 単位の成果物
```

### Agent（11・IMP-2026-031）

| Agent                     | Model    | 役割                                    | 起動条件                                      |
| ------------------------- | -------- | --------------------------------------- | --------------------------------------------- |
| orchestrator              | opus-5   | 指揮・委譲・統合                        | 複数工程の開発タスク                          |
| architecture-designer     | sonnet-5 | 技術設計（L3 は requirements + 性能節） | L2/L3                                         |
| contract-designer         | sonnet-5 | 契約設計（Zod/Drizzle/Hono RPC/DTO）    | 契約変更があるとき                            |
| test-designer             | sonnet-5 | 試験観点・試験計画                      | L2/L3                                         |
| implementation-planner    | sonnet-5 | 実装計画                                | L2/L3                                         |
| implementer               | sonnet-5 | 実装・単体/E2E・品質ゲート              | L1〜L3（E2E は L3・基盤整備時）               |
| reviewer                  | opus-5   | 独立レビュー（文書観点含む）            | L2/L3 / 文書レビュー依頼                      |
| security-reviewer         | opus-5   | セキュリティ専門レビュー                | L3 原則必須 / L2 は触点時必須（省略条件あり） |
| reflection-agent          | sonnet-5 | 振り返り・改善候補抽出                  | feature 完了時（ライトモード）                |
| agent-evaluator           | sonnet-5 | 固定ケースで回帰評価                    | 改善提案の評価時                              |
| agent-improvement-manager | opus-5   | 横断分析・改善提案                      | トリガー時のみ                                |

> 吸収済み（起動しない）: requirements-analyst / performance-designer /
> e2e-test-implementer / document-reviewer → `docs/claude-code/archive/agents/`（適用済み）

詳細：[agent-responsibilities.md](./agent-responsibilities.md)。表の Model は短縮表記
（正典は各 `.claude/agents/<name>.md` の frontmatter、例: `claude-sonnet-5`）。

### Skills（17）

Claude が場面に応じて自動選択する。`/<skill-name>` で明示的にも呼べる。

| 分類           | Skill                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 判定・検証     | `classify-change`（変更レベル判定）/ `validate-deliverables`（成果物整合）/ `quality-gates`（lint・型・テスト一括）                |
| 成果物作成     | `create-requirements-document` / `create-design-document` / `create-implementation-plan` / `create-test-plan` / `create-adr`       |
| セッション運用 | `kickoff-session`（開始の段取り）/ `close-session`（終了の一括処理）/ `write-work-log`（日次ログ）                                 |
| Codex 委譲     | `create-codex-brief`（実装指示書）/ `review-codex-implementation`（受け入れレビュー）                                              |
| 確認・振り返り | `manual-browser-verify`（画面手動確認）/ `reflect-task`（振り返り）/ `sprint-review`（週次レトロ）/ `audit-skills`（指示系棚卸し） |

> ライトモードで**毎セッション使うのは 5〜6 本**（`quality-gates` / `kickoff-session` /
> `close-session` / `write-work-log` + 変更レベルに応じた `create-*`）。残りは非常用。

### Rules（3）

[coding-standards.md](../../.claude/rules/coding-standards.md)（全TS）/
[domain-layer.md](../../.claude/rules/domain-layer.md)（`packages/domain`・集約間）/
[presentation-layer.md](../../.claude/rules/presentation-layer.md)（`apps/web`）。

> 指示書の `backend`/`frontend`/`database`/`api-contracts` ルールは、既存の domain-layer /
> presentation-layer / コーディング規約に対応付けて運用する（重複作成しない。README の対応表参照）。

## 3. 基本の使い方（タスクの流れ）

### 起動

- **複数工程の開発**（機能追加・仕様変更・新規API/画面・スキーマ変更）：
  `claude --agent orchestrator` で起動、または通常セッションで依頼すれば Orchestrator 相当の
  判定から始まる。
- **単発の質問・調査**：通常どおり依頼（Level 0。Agent 委譲は不要）。

### 変更レベルと自動成果物（[document-policy.md](./document-policy.md)）

| Level      | 例                                  | 委譲フロー                                                                                    | 自動で作る成果物                                     |
| ---------- | ----------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **0 調査** | 原因調査・設計相談                  | なし（読み取りのみ）                                                                          | なし                                                 |
| **1 軽微** | 文言・typo・単純 null チェック      | implementer（必要なら reviewer）                                                              | なし（最終報告に理由）                               |
| **2 通常** | 既存API項目追加・ロジック変更       | architecture →〔contract〕→ (test ∥ planner) → implementer → reviewer → security → reflection | designs / implementation-plans / tests               |
| **3 重要** | 新規API・DBスキーマ・移行・外部連携 | requirements → … → reviewer（+ADR）→ security → reflection                                    | + requirements / decisions(ADR) / reviews / 振り返り |

> Orchestrator は開始時に**レベルと判定理由**を提示する。小規模変更を Level 3 工程で重くしない。
> L2/L3 では最初の Write 担当が `feature-name` を `.claude/state/current-feature` に記録する。

### 完了条件（[definition-of-done.md](./definition-of-done.md)）

レベル別 DoD を満たすこと。実在する品質コマンド（lint / type-check / test / build /
format-check）のみをゲートにする。Reviewer の Critical/Major が残る間は完了にしない。

## 4. 主要コマンド

```bash
# 実在する品質コマンドを検出
bash .claude/scripts/detect-project-commands.sh

# 品質ゲート実行（実在コマンドのみ。--level 2/3 で build + format-check も）
bash .claude/scripts/run-quality-gates.sh --level 2

# タスク品質メトリクスの雛形を作成（値は埋めない。unknown は unknown のまま）
bash .claude/scripts/record-task-metrics.sh TASK-2026-001 <feature-name> 2
```

> テストランナー（Vitest）は全層に導入済み（domain / application / infrastructure /
> apps/web — 2026-07-01 PR #21）。`pnpm test` は run-quality-gates.sh の既定実行対象。
> E2E（Playwright）は設定のみ存在し、シナリオは feature 単位で整備する。

## 5. 安全機構（Hook と権限）

| イベント     | Hook                          | 役割                                                                       |
| ------------ | ----------------------------- | -------------------------------------------------------------------------- |
| PreToolUse   | `guard-dangerous.mjs`         | 破壊的/本番/秘密情報操作を**ブロック**（exit 2）                           |
| PostToolUse  | `check-deliverables.mjs`      | L2/L3 のソース変更に対し成果物の有無を警告                                 |
| PostToolUse  | `validate-agent-config.mjs`   | Agent/Skill/設定の構文・整合性検証（構文エラーはブロック、方針違反は警告） |
| SubagentStop | `record-subagent.mjs`         | Subagent 完了の機械的事実を `state/subagent-log.jsonl` に記録              |
| Stop         | `check-improvement-cycle.mjs` | reflection/レビュー未実施を警告                                            |

### guard-dangerous がブロックするもの

`rm -rf /`〜`~`/`$HOME`/`*`/`.`、`git push --force`/`-f`、`git reset --hard`、
`npm/pnpm/yarn publish`、`terraform apply/destroy`、`vercel --prod`、`.env`/`.pem`/
`id_rsa`/`.aws/credentials` の読み取り、`printenv` 等。`**rm -rf node_modules` 等の
日常操作は許可\*\*（壊滅的ターゲットのみ deny）。二層目として `settings.json` の
`permissions.deny` も併用。

### 構成ファイルの変更と承認境界

`CLAUDE.md` / `.claude/agents/**` / `.claude/settings.json` などの構成ファイルは、
作業ブランチへコミットし **PR レビュー**で確認する（[improvement-cycle.md](./improvement-cycle.md)
§承認境界はPRレビュー）。`main` へ直接反映しない。

> 2026-07-28 以前は承認ファイル（`config-change-approved` / `harness-approve.mjs`）で Hook が
> 機械的に強制していたが、リモート環境から承認を発行できずハーネス自身を修正できなくなる
> デッドロックを繰り返したため撤去した。
> 現行手順は [harness-state.md](./harness-state.md) を参照する。

### Hook の一時無効化・復旧

`.claude/settings.json` の `hooks.<event>` から該当エントリを外す → 戻す。
例：安全Hookを外す＝`PreToolUse` の `guard-dangerous` 行を削除（復旧は再追加）。

## 6. Memory と継続的改善（半自動）

- **Memory の使い分け**：単発・検証中＝Auto/Subagent Memory、全体・確定＝CLAUDE.md/Rule/Skill。
  段階：`単発 → Memory` / `繰り返す → 改善候補` / `検証済み → Agent・Skill・Rule`。
  分類・昇格条件・誤情報削除は [memory-policy.md](./memory-policy.md)。
- **改善サイクル**：L2/L3 完了後に reflection-agent が
  `improvements/candidates/<task-id>.md` を起票 → 昇格条件（同問題3回 等）成立で
  agent-improvement-manager が `proposals/` に提案 → agent-evaluator が evals で before/after
  回帰評価 → **悪化なし**で反映。重要設定は PR レビューで確認する。
  詳細：[improvement-cycle.md](./improvement-cycle.md)、記録：[improvements/](./improvements/)。
- **回帰評価**：`.claude/evals/`（10 ケース・rubric 1〜5・baselines）。改善で1軸でも悪化したら
  採用しない。指示を増やすだけの改善も非採用（不要指示の削除・移動も改善に含む）。

## 7. よくある操作（早見）

| やりたいこと         | どうする                                                                        |
| -------------------- | ------------------------------------------------------------------------------- |
| 機能追加を頼む       | そのまま依頼 → Orchestrator がレベル判定し委譲                                  |
| 品質ゲートを回す     | `bash .claude/scripts/run-quality-gates.sh --level <N>`                         |
| 改善提案を見る       | `docs/claude-code/improvements/` を見る                                         |
| 危険操作で止められた | 意図的なら手動実行、または settings.json から guard を一時的に外す              |
| Agent/設定を直したい | 提案を `improvements/proposals/` に作り、ブランチへ反映して PR レビューを受ける |
| ルールを足したい     | 局所なら `.claude/rules/`、手順なら `.claude/skills/`、原則のみ `CLAUDE.md`     |

## 8. 設計上の原則（迷ったとき）

- Orchestrator は詳細実装を抱え込まず委譲する。`Agent()` を持つのは orchestrator /
  reviewer / agent-improvement-manager のみ。
- 機械判定は Hook/スクリプト、意味判断は Reviewer。**Hook だけで品質保証したと主張しない。**
- 指示を肥大化させない（同内容を複数所へ重複記載しない）。改善＝追加とは限らない。
- 本番コード・CI/CD・本番インフラ・秘密情報に推測で触れない。重要設定は PR レビューで確認。
