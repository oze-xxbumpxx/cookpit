# 実装計画: harness-personal-light-mode

- 前提となる設計書: docs/designs/harness-personal-light-mode.md
- レベル: L2
- 実装ルート: Orchestrator（implementer）
- 判断理由: ハーネス指示系・Agent 定義の変更であり Codex 委譲対象外。docs + `.claude/agents` の
  同期更新が主。保護ファイルは PR マージ承認（IMP-029 案 A）

## 変更対象ファイル

| path | なぜ変えるか |
| --- | --- |
| docs/claude-code/usage-guide.md | 個人開発ライトモードを正典化 |
| docs/claude-code/memory-policy.md | 早期昇格禁止・archive 基準 |
| docs/claude-code/improvement-cycle.md | 減速ルール・meta 指標への言及 |
| docs/claude-code/orchestration-policy.md | 委譲フロー・起動条件・Agent 表を 11 本化 |
| docs/claude-code/agent-responsibilities.md | 責務表を 11 本化 |
| docs/claude-code/README.md | Agent 一覧更新 |
| docs/claude-code/development-workflow.md | 旧 Agent 名参照の同期 |
| docs/claude-code/improvements/metrics/\_TEMPLATE.yml | meta_work_ratio |
| docs/claude-code/improvements/improvement-backlog.md | IMP-030/031・事象 4/5 ステータス |
| docs/claude-code/improvements/candidates/harness-complexity-audit.md | 採否反映 |
| .claude/agents/architecture-designer.md | requirements + performance 吸収 |
| .claude/agents/implementer.md | E2E 実装吸収 |
| .claude/agents/reviewer.md | 文書レビュー吸収・requirements-analyst 起動削除 |
| .claude/agents/orchestrator.md | tools/フロー更新・L3 要求は architecture 経由 |
| .claude/skills/classify-change/SKILL.md | 必要 Agent 表の同期 |
| .claude/skills/create-requirements-document/SKILL.md | 実行主体を architecture-designer に |
| .claude/evals/cases/*.md（該当） | 期待 Agent 名の同期 |

## 新規作成ファイル

| path | 役割 |
| --- | --- |
| docs/implementation-plans/harness-personal-light-mode.md | 本計画 |
| docs/designs/harness-personal-light-mode.md | 設計 |
| docs/tests/harness-personal-light-mode.md | 試験計画 |
| docs/claude-code/improvements/proposals/IMP-2026-030.md | 事象 5 proposal |
| docs/claude-code/improvements/proposals/IMP-2026-031.md | 事象 4 proposal |
| docs/claude-code/improvements/candidates/archive/README.md | archive 運用説明 |
| .claude/agents/archive/README.md | 吸収済み Agent の置き場説明 |

## 実装手順

### Step 1: 成果物・proposal を揃える

- 対象: designs / implementation-plans / tests / IMP-030 / IMP-031
- 完了条件: 必須セクションが埋まり、IMP 番号が backlog 未使用（030/031）

### Step 2: Phase1 運用ライトモード

- 対象: usage-guide.md
- 変更: 「個人開発ライトモード」節を追加（L0/L1、改善頻度、reflection タイミング、常備セット）
- 完了条件: usage-guide から memory-policy / orchestration-policy へリンクできる

### Step 3: Phase2 改善サイクル減速（IMP-030）

- 対象: memory-policy.md / improvement-cycle.md / metrics/_TEMPLATE.yml /
  candidates/archive/README.md
- 変更:
  1. 早期昇格原則禁止 + 例外 1 行
  2. 対応済み candidate の archive 移動基準
  3. `process.meta_work_ratio` 欄追加
- 完了条件: 上記 3 点が正典に存在し、テンプレに欄がある

### Step 4: Phase3 Agent 統合（IMP-031）

- 対象: 吸収先 4 Agent + orchestrator + 吸収元 4 ファイルを archive へ移動
- 変更: 設計書の吸収表どおり。reviewer の `Agent(requirements-analyst)` を削除
- 完了条件: `.claude/agents/*.md` が 11 本 + archive/、orchestrator tools に旧名なし

### Step 5: 同期文書・Skill・evals cases

- 対象: README / agent-responsibilities / orchestration-policy / development-workflow /
  classify-change / create-requirements-document / 該当 evals cases
- 完了条件: 現行正典で「Agent 15」や旧単独起動フローが残っていない（archive・歴史文書除く）

### Step 6: backlog / candidate 更新と品質確認

- backlog で事象 4/5 を提案済み→本 PR で accepted 予定に更新
- `pnpm test:harness` 相当と文書整合チェック
- 完了条件: ゲート PASS、PR 作成

## 依存関係

Step1 → Step2/3（並列可）→ Step4 → Step5 → Step6

## テスト計画

docs/tests/harness-personal-light-mode.md 参照

## リスク

- 旧名の取りこぼし → Step5 で rg による現行正典スキャン
- 吸収先肥大 → 条件付きセクションのみ追加
- 保護ファイル → PR マージを人間承認とする

## ロールバック方法

- git revert（本 feature のコミット単位）
- 吸収元 Agent は `.claude/agents/archive/` から復元可能

## ドキュメント更新対象

- docs/claude-code/*（上記）
- CLAUDE.md は Agent 一覧を持たないため原則変更なし（必要な場合のみ 1 行ポインタ）
