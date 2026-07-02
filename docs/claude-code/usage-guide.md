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

## 2. 構成の全体像

```
.claude/
├── settings.json          Hook 登録 + permissions.deny（安全層）
├── agents/   (14)         Orchestrator + 専門/改善 Subagent
├── skills/   (8)          再利用可能な作業手順とテンプレート
├── rules/    (4)          層・パス別の確定ルール
├── hooks/    (5 .mjs)     決定論的な検証・安全制御
├── scripts/  (3 .sh)      コマンド検出・品質ゲート・メトリクス
├── evals/                 改善の回帰評価（10 ケース + rubric + baselines）
└── state/                 実行時の一時状態（Git 非追跡）
docs/claude-code/          方針ドキュメントと改善記録（improvements/）
docs/{requirements,designs,implementation-plans,tests,decisions,reviews}/  feature 単位の成果物
```

### Agent（14）


| Agent                     | Model      | 役割                             | 起動条件       |
| ------------------------- | ---------- | ------------------------------ | ---------- |
| orchestrator              | opus-4-8   | 指揮・委譲・統合                       | 複数工程の開発タスク |
| requirements-analyst      | sonnet-4-6 | 要求整理・既存調査                      | L3（必要な L2） |
| architecture-designer     | sonnet-4-6 | 技術設計                           | L2/L3      |
| contract-designer         | sonnet-4-6 | 契約設計（Zod/Drizzle/Hono RPC/DTO） | 契約変更があるとき  |
| test-designer             | sonnet-4-6 | 試験観点・試験計画                      | L2/L3      |
| implementation-planner    | sonnet-4-6 | 実装計画                           | L2/L3      |
| implementer               | sonnet-4-6 | 実装・単体テスト・品質ゲート                 | L1〜L3      |
| reviewer                  | sonnet-4-6 | 独立レビュー                         | L2/L3      |
| security-reviewer         | sonnet-4-6 | セキュリティ専門レビュー                   | L2/L3（reviewer の後。ドキュメントのみ変更は省略） |
| e2e-test-implementer      | sonnet-4-6 | E2E・結合テスト実装                    | L3・テスト基盤整備済みのとき |
| performance-designer      | sonnet-4-6 | パフォーマンス設計                      | L3・外部I/O/大量データのとき |
| reflection-agent          | sonnet-4-6 | 振り返り・改善候補抽出                    | L2/L3 完了後  |
| agent-evaluator           | sonnet-4-6 | 固定ケースで回帰評価                     | 改善提案の評価時   |
| agent-improvement-manager | opus-4-8   | 横断分析・改善提案                      | トリガー時のみ    |


詳細：[agent-responsibilities.md](./agent-responsibilities.md)。

### Skills（8）

`classify-change`（レベル判定）/ `create-requirements-document` / `create-design-document` /
`create-implementation-plan` / `create-test-plan` / `create-adr` / `validate-deliverables`
（成果物整合チェック）/ `reflect-task`（振り返り）。Claude が場面に応じて自動選択する。

### Rules（4）

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


| Level    | 例                    | 委譲フロー                                                                            | 自動で作る成果物                                         |
| -------- | -------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| **0 調査** | 原因調査・設計相談            | なし（読み取りのみ）                                                                       | なし                                               |
| **1 軽微** | 文言・typo・単純 null チェック | implementer（必要なら reviewer）                                                       | なし（最終報告に理由）                                      |
| **2 通常** | 既存API項目追加・ロジック変更     | architecture →〔contract〕→ (test ∥ planner) → implementer → reviewer → security → reflection | designs / implementation-plans / tests           |
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


| イベント         | Hook                          | 役割                                                |
| ------------ | ----------------------------- | ------------------------------------------------- |
| PreToolUse   | `guard-dangerous.mjs`         | 破壊的/本番/秘密情報操作を**ブロック**（exit 2）                    |
| PostToolUse  | `check-deliverables.mjs`      | L2/L3 のソース変更に対し成果物の有無を警告                          |
| PostToolUse  | `validate-agent-config.mjs`   | Agent/Skill/設定の構文・整合性検証（構文エラーはブロック、方針違反は警告）       |
| SubagentStop | `record-subagent.mjs`         | Subagent 完了の機械的事実を `state/subagent-log.jsonl` に記録 |
| Stop         | `check-improvement-cycle.mjs` | reflection/レビュー未実施を警告                             |


### guard-dangerous がブロックするもの

`rm -rf /`〜`~`/`$HOME`/`*`/`.`、`git push --force`/`-f`、`git reset --hard`、
`npm/pnpm/yarn publish`、`terraform apply/destroy`、`vercel --prod`、`.env`/`.pem`/
`id_rsa`/`.aws/credentials` の読み取り、`printenv` 等。`**rm -rf node_modules` 等の
日常操作は許可**（壊滅的ターゲットのみ deny）。二層目として `settings.json` の
`permissions.deny` も併用。

### 保護ファイルと承認マーカー

`CLAUDE.md` / `.claude/agents/**` / `.claude/settings.json` の変更は**人間承認が必要**
（[improvement-cycle.md](./improvement-cycle.md) §承認境界）。`validate-agent-config` は
未承認変更に警告を出す。承認済みのバッチを編集する間だけ
`.claude/state/config-change-approved` を置き、終わったら削除する（警告抑止）。

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
回帰評価 → **悪化なし＆承認**で反映。重要設定は人間承認まで提案止まり。
詳細：[improvement-cycle.md](./improvement-cycle.md)、記録：[improvements/](./improvements/)。
- **回帰評価**：`.claude/evals/`（10 ケース・rubric 1〜5・baselines）。改善で1軸でも悪化したら
採用しない。指示を増やすだけの改善も非採用（不要指示の削除・移動も改善に含む）。

## 7. よくある操作（早見）


| やりたいこと        | どうする                                                          |
| ------------- | ------------------------------------------------------------- |
| 機能追加を頼む       | そのまま依頼 → Orchestrator がレベル判定し委譲                               |
| 品質ゲートを回す      | `bash .claude/scripts/run-quality-gates.sh --level <N>`       |
| 改善提案を見る       | `docs/claude-code/improvements/` を見る                          |
| 危険操作で止められた    | 意図的なら手動実行、または settings.json から guard を一時的に外す                  |
| Agent/設定を直したい | 提案を `improvements/proposals/` に作り、承認後に反映（重要設定は人間承認）           |
| ルールを足したい      | 局所なら `.claude/rules/`、手順なら `.claude/skills/`、原則のみ `CLAUDE.md` |


## 8. 設計上の原則（迷ったとき）

- Orchestrator は詳細実装を抱え込まず委譲する。`Agent()` を持つのは orchestrator /
reviewer / agent-improvement-manager のみ。
- 機械判定は Hook/スクリプト、意味判断は Reviewer。**Hook だけで品質保証したと主張しない。**
- 指示を肥大化させない（同内容を複数所へ重複記載しない）。改善＝追加とは限らない。
- 本番コード・CI/CD・本番インフラ・秘密情報に推測で触れない。重要設定は人間承認。

