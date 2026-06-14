# Agent 責務一覧

各 Subagent の責務・入出力・ツール権限・禁止事項の早見表。定義の実体は
`.claude/agents/<name>.md`。詳細な工程手順はそこと各 Skill にある。

## 一覧

| Agent | 役割 | 主な出力 | ツール | コード変更 |
| --- | --- | --- | --- | --- |
| orchestrator | 指揮・委譲・統合 | 委譲計画・統合報告 | Agent, Read, Grep, Glob | しない |
| requirements-analyst | 要求整理・既存調査・観点抽出 | 要件メモ（L3 は `docs/requirements/`） | Read, Grep, Glob, Write* | しない |
| architecture-designer | 技術設計 | `docs/designs/<feature>.md` | Read, Grep, Glob, Write | しない |
| contract-designer | 契約設計（Zod/Drizzle/Hono RPC/DTO）。必要時のみ | `docs/designs/<feature>.md` の Contract 節 | Read, Grep, Glob, Write | しない |
| implementation-planner | 実装計画 | `docs/implementation-plans/<feature>.md` | Read, Grep, Glob, Write | しない |
| implementer | 実装・単体テスト・lint/型チェック | ソースコード・テスト | Read, Grep, Glob, Edit, Write, Bash | する |
| test-designer | 試験観点・試験計画 | `docs/tests/<feature>.md` | Read, Grep, Glob, Write | しない |
| reviewer | 整合性・品質・セキュリティ確認 | 指摘（必要なら `docs/reviews/<feature>.md`） | Read, Grep, Glob, Bash, Agent(requirements-analyst) | しない |
| reflection-agent | 振り返り・改善候補抽出 | `docs/claude-code/improvements/candidates/<task-id>.md` | Read, Grep, Glob, Write | しない |
| agent-evaluator | 固定評価ケースで回帰評価 | `docs/claude-code/improvements/evaluations/` | Read, Grep, Glob, Write | しない |
| agent-improvement-manager | 横断分析・改善提案 | `docs/claude-code/improvements/proposals/` | Read, Grep, Glob, Write, Agent(agent-evaluator) | しない |

> ツール権限は最小限に絞る。`Agent`（Subagent 起動）を持つのは **orchestrator**（全実務 Agent）、
> **reviewer**（検証目的の requirements-analyst のみ）、**agent-improvement-manager**
> （回帰評価の agent-evaluator のみ）の 3 つに限る。implementer 以外はソースコードを変更しない
> （設計・計画・試験・振り返りは Write で `docs/` 配下のみに書く）。
> *requirements-analyst の Write は L3 の `docs/requirements/` 保存用。元計画の目安
> （Read/Grep/Glob のみ）からの意図的な追加で、ソースコードには触れない。
> 改善系 3 Agent の責務詳細は [improvement-cycle.md](./improvement-cycle.md) を参照。

## requirements-analyst

- ユーザー要求の整理、不明点・制約・前提条件の抽出。
- 既存コード・既存仕様の調査、影響範囲の整理。
- 正常系・異常系・境界条件の抽出。
- **コードは変更しない。** 出力は要求メモ。L3 では `docs/requirements/<feature>.md`。

## architecture-designer

- 技術設計、レイヤーと責務、API/DB/フロント/バックエンド設計、データフロー、
  エラー処理、ログと監視、セキュリティ、性能、後方互換性、テスト方針。
- 成果は `docs/designs/<feature>.md` に保存（Skill `create-design-document`）。
- **実装コードは変更しない。**
- このプロジェクトの設計判断（アーキテクチャ・ドメインモデル・DB スキーマ）は
  確定前に Orchestrator 経由でユーザー確認を要する。

## contract-designer

- 契約（Hono RPC 入出力 / `packages/api-contract` の Zod / Drizzle スキーマ / DTO /
  将来の外部連携メッセージ）の型・必須/任意・nullability・バージョン・後方互換・エラー形式・
  冪等性キー・サンプル・契約テスト方針。
- **契約の新設・変更があるときだけ**起動する（過剰工程の禁止）。
- 成果は `docs/designs/<feature>.md` の Contract 節（大きければ `-contract.md` に分割）。
- **実装コードは変更しない**（Zod/Drizzle/Hono の実装は implementer）。
- 後方互換破壊はユーザー確認なしに確定しない。詳細ルールは `.claude/rules/api-contracts.md`。

## implementation-planner

- 設計書を実装可能な単位へ分解、変更対象ファイル特定、ファイルごとの変更内容、
  実装順序、依存関係、各ステップの完了条件、テスト追加箇所、リスク、ロールバック方法、
  ドキュメント更新箇所。
- 成果は `docs/implementation-plans/<feature>.md`（Skill `create-implementation-plan`）。
- **実装コードは変更しない。**

## implementer

- 確定済みの `docs/designs/<feature>.md` と `docs/implementation-plans/<feature>.md` を
  実装前に必ず確認する。
- 計画に沿って実装し、必要な単体テストを作成、`pnpm lint` / `pnpm type-check`
  （テスト導入後は該当テスト）を実行する。
- 設計から逸脱が必要になったら**独断で変更せず Orchestrator へ差し戻す。**
- アーキテクチャ原則は `.claude/rules/` を遵守（特に domain 層の制約）。

## test-designer

- 単体/結合試験観点、正常系・異常系・境界値・権限・データ整合性・冪等性、
  回帰試験範囲、試験データ、完了条件。
- 成果は `docs/tests/<feature>.md`（Skill `create-test-plan`）。
- **コードは変更しない。**

## reviewer

- 要件充足性、設計との整合性、実装計画との整合性、コード品質、責務分離、
  エラー処理、セキュリティ、性能、テスト不足、ドキュメント更新漏れ。
- 原則コードを変更せず、指摘と修正案を提示。保存が必要なら `docs/reviews/<feature>.md`。
- 検証目的に限り requirements-analyst を起動してよい（読み取り専用）。
  変更を伴う再依頼は Orchestrator へ差し戻す。
