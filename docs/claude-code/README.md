# docs/claude-code — Claude Code マルチエージェント開発基盤

このディレクトリは、Cookpit における Claude Code のマルチエージェント開発基盤
（Orchestrator 主導の委譲フロー・変更レベル判定・自動成果物・品質ゲート・独立レビュー・
振り返り・継続的改善）の運用ドキュメント置き場。原則は `CLAUDE.md`、局所ルールは
`.claude/rules/`、工程手順は `.claude/skills/`、Agent 実体は `.claude/agents/` にある。

## ドキュメント一覧

| ファイル | 内容 |
| --- | --- |
| [usage-guide.md](./usage-guide.md) | **運用ガイド（全体像と日々の使い方の入口）** |
| [development-workflow.md](./development-workflow.md) | 標準フロー・実装前条件・完了条件・要確認条件 |
| [document-policy.md](./document-policy.md) | 変更レベル（Level 0〜3）と自動成果物 |
| [definition-of-done.md](./definition-of-done.md) | Level 別 Definition of Done と品質ゲート |
| [orchestration-policy.md](./orchestration-policy.md) | 委譲方針・並列指針・例外 |
| [agent-responsibilities.md](./agent-responsibilities.md) | 各 Agent の責務・入出力・権限の早見表 |
| [memory-policy.md](./memory-policy.md) | Memory 分類・昇格条件・肥大化対策・誤情報削除 |
| [improvement-cycle.md](./improvement-cycle.md) | 改善サイクル・承認境界・回帰評価・実行タイミング |
| [improvements/](./improvements/) | 改善候補・提案・評価・採否の記録 |

## 実施指示書との対応（命名マッピング）

`.claude/docs/claude-code-multi-agent-implementation-instructions.md` の項目名は、重複作成を
避けるため**既存ファイルへ対応付ける**（指示書 §3.4・§22.1）。新規作成したのは既存に無い
ものだけ。

| 指示書の名称 | このリポジトリでの実体 |
| --- | --- |
| development-policy | `development-workflow.md` |
| agent-catalog | `agent-responsibilities.md` |
| improvement-policy | `improvement-cycle.md` |
| memory-policy | `memory-policy.md`（同名） |
| definition-of-done | `definition-of-done.md`（新規） |
| review-deliverables（Skill） | `.claude/skills/validate-deliverables/` |
| rules backend / frontend | `.claude/rules/domain-layer.md` / `presentation-layer.md` |
| scripts/*.sh（検証系） | 一部は `.claude/hooks/*.mjs` で実装（validate-agent-config / check-deliverables）。品質ゲート・メトリクスは `.claude/scripts/*.sh` |

## Agent 構成（14）

正典は各 `.claude/agents/<name>.md` の frontmatter（下表は早見）。

| Agent | Model | 役割 |
| --- | --- | --- |
| orchestrator | opus-4-8 | 指揮・委譲・統合 |
| requirements-analyst | sonnet-4-6 | 要求整理・既存調査・観点抽出 |
| architecture-designer | sonnet-4-6 | 技術設計 |
| contract-designer | sonnet-4-6 | 契約設計（API/DB/イベント/DTO/Zod）。必要時のみ |
| test-designer | sonnet-4-6 | 試験観点・試験計画 |
| implementation-planner | sonnet-4-6 | 実装計画 |
| implementer | sonnet-4-6 | 実装・単体テスト・品質ゲート |
| reviewer | sonnet-4-6 | 独立レビュー |
| security-reviewer | sonnet-4-6 | セキュリティ専門レビュー（L2/L3・reviewer の後） |
| e2e-test-implementer | sonnet-4-6 | E2E・結合テスト実装（L3・基盤整備済みのみ） |
| performance-designer | sonnet-4-6 | パフォーマンス設計（L3・外部I/O/大量データのみ） |
| reflection-agent | sonnet-4-6 | 振り返り・改善候補抽出 |
| agent-evaluator | sonnet-4-6 | 固定評価ケースで回帰評価 |
| agent-improvement-manager | opus-4-8 | 横断分析・改善提案（重要設定は提案のみ） |

## 運用開始

- Orchestrator 起動：`claude --agent orchestrator`
- 品質ゲート：`bash .claude/scripts/run-quality-gates.sh`（実在コマンドのみ実行）
- 改善提案の確認：`docs/claude-code/improvements/`
- Hook 一時無効化・復旧：`.claude/settings.json` の該当エントリをコメント相当で外す／戻す
  （詳細は [usage-guide.md](./usage-guide.md) §5）。
