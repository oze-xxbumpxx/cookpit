# Agent 責務一覧

各 Subagent の責務・入出力・ツール権限・禁止事項の早見表。定義の実体は
`.claude/agents/<name>.md`。詳細な工程手順はそこと各 Skill にある。

## 一覧（11・IMP-2026-031）

| Agent                     | 役割                                                           | 主な出力                                                | ツール                                          | コード変更 |
| ------------------------- | -------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------- | ---------- |
| orchestrator              | 指揮・委譲・統合                                               | 委譲計画・統合報告                                      | Agent, Read, Grep, Glob                         | しない     |
| architecture-designer     | 技術設計（L3 は requirements + 条件付き性能節）                | `docs/requirements/` + `docs/designs/<feature>.md`      | Read, Grep, Glob, Write                         | しない     |
| contract-designer         | 契約設計（Zod/Drizzle/Hono RPC/DTO）。必要時のみ               | `docs/designs/<feature>.md` の Contract 節              | Read, Grep, Glob, Write                         | しない     |
| implementation-planner    | 実装計画                                                       | `docs/implementation-plans/<feature>.md`                | Read, Grep, Glob, Write                         | しない     |
| implementer               | 実装・単体/E2E・lint/型チェック                                | ソースコード・テスト                                    | Read, Grep, Glob, Edit, Write, Bash             | する       |
| test-designer             | 試験観点・試験計画                                             | `docs/tests/<feature>.md`                               | Read, Grep, Glob, Write                         | しない     |
| reviewer                  | 整合性・品質・文書レビュー                                     | 4 軸指摘 + review assessment                            | Read, Grep, Glob, Bash                          | しない     |
| security-reviewer         | セキュリティ専門レビュー（OWASP・認証/認可・秘密情報・脆弱性） | 4 軸指摘 + 専門 evidence                                | Read, Grep, Glob, Bash                          | しない     |
| reflection-agent          | 振り返り・改善候補抽出                                         | `docs/claude-code/improvements/candidates/<task-id>.md` | Read, Grep, Glob, Write                         | しない     |
| agent-evaluator           | 固定評価ケースで回帰評価                                       | `docs/claude-code/improvements/evaluations/`            | Read, Grep, Glob, Write                         | しない     |
| agent-improvement-manager | 横断分析・改善提案                                             | `docs/claude-code/improvements/proposals/`              | Read, Grep, Glob, Write, Agent(agent-evaluator) | しない     |

> ツール権限は最小限に絞る。`Agent` を持つのは **orchestrator** と
> **agent-improvement-manager**（evaluator のみ）。プロダクションコードを変更するのは
> **implementer** のみ（E2E テストも同 Agent が条件付きで担当）。
> 吸収済み（起動しない）: requirements-analyst / performance-designer /
> e2e-test-implementer / document-reviewer。
> 改善系の詳細は [improvement-cycle.md](./improvement-cycle.md) を参照。

## architecture-designer

- 技術設計、レイヤーと責務、API/DB/フロント/バックエンド設計、データフロー、
  エラー処理、ログと監視、セキュリティ、性能、後方互換性、テスト方針。
- **L3**: `docs/requirements/<feature>.md` も作成（Skill `create-requirements-document`）。
- 外部 I/O・大量データ時は設計書の性能節を厚く書く（旧 performance-designer）。
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
- 後方互換破壊はユーザー確認なしに確定しない。入出力スキーマは Zod で
  `packages/api-contract` に定義して共有する（`.claude/rules/presentation-layer.md`）。

## implementation-planner

- 設計書を実装可能な単位へ分解、変更対象ファイル特定、ファイルごとの変更内容、
  実装順序、依存関係、各ステップの完了条件、テスト追加箇所、リスク、ロールバック方法、
  ドキュメント更新箇所。
- 成果は `docs/implementation-plans/<feature>.md`（Skill `create-implementation-plan`）。
- **実装コードは変更しない。**

## implementer

- 確定済みの `docs/designs/<feature>.md` と `docs/implementation-plans/<feature>.md` を
  実装前に必ず確認する。
- 計画に沿って実装し、必要な単体テストを作成、`pnpm lint` / `pnpm type-check` /
  該当パッケージの `pnpm test`（Vitest・全層導入済み）を実行する。
- **L3 かつ E2E 基盤整備済み**では結合/E2E テストも実装する（旧 e2e-test-implementer）。
- 設計から逸脱が必要になったら**独断で変更せず Orchestrator へ差し戻す。**
- アーキテクチャ原則は `.claude/rules/` を遵守（特に domain 層の制約）。

## test-designer

- 単体/結合試験観点、正常系・異常系・境界値・権限・データ整合性・冪等性、
  回帰試験範囲、試験データ、完了条件。
- 成果は `docs/tests/<feature>.md`（Skill `create-test-plan`）。
- **コードは変更しない。**（E2E 実装は implementer）

## reviewer

- 要件充足性、設計との整合性、実装計画との整合性、コード品質、責務分離、
  エラー処理、セキュリティ（概要）、性能（概要）、テスト不足、ドキュメント更新漏れ。
- 文書成果物の事実整合・矛盾・参照生存・鮮度（旧 document-reviewer。条件付き）。
- 原則コードを変更せず、指摘を action / impact / evidence / status の 4 軸で検証する。
- current packet 用の `review_assessment` JSON を返し、Orchestrator が
  `docs/reviews/<feature>.md` の監査ログと marker へ統合する。
- 人間へ渡すのは主観・不可逆・未知の最大 3 件。AI 自身はマージを承認しない。
- 事実確認は自身の Read/Grep で行う（他 Agent を起動しない）。

## security-reviewer

- 起動条件の正典は [orchestration-policy.md](./orchestration-policy.md) §security-reviewer。
  L3 は原則必須。L2 はセキュリティ触点があるとき必須、省略条件に該当すれば省略可
  （Presentation のみ / 契約不変の内部リファクタ / テスト基盤のみ 等）。
- OWASP Top 10・入力検証（Zod 境界）・認証/認可の漏れ・秘密情報のログ漏洩・
  `pnpm audit` による依存脆弱性・セキュリティヘッダー（フロント変更時のみ）を確認する。
- `reviewer` と役割を分担: reviewer は品質/整合性を担当、security-reviewer はセキュリティ深掘り。
- コードを変更せず、reviewer と同じ 4 軸の指摘と専門 evidence を返す。Reviewer / Orchestrator が
  重複を除いて assessment へ統合する。
