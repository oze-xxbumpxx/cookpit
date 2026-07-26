# 設計書: harness-personal-light-mode

- ステータス: confirmed（ユーザー承認: 2026-07-26「最善策でプランを立てて取り掛かって」）
- レベル: L2
- 関連: docs/claude-code/improvements/candidates/harness-complexity-audit.md（事象 4・5） /
  IMP-2026-030 / IMP-2026-031

## 背景

Cookpit の Claude Code ハーネスは成熟したが、個人開発としては重い。
2026-07-20 の `harness-complexity-audit` で、重さは開発ワークフロー本体より
**低稼働 Agent の維持**と**改善サイクルの自己参照的肥大**に偏在すると診断済み。
事象 1〜3 は IMP-027/028/029 で対応済み。事象 4・5 が採否待ちだった。

## 目的

個人開発でも品質ゲートと DDD 規律を保ちつつ、毎回の認知負荷とメタ作業を下げる。

1. 運用の軽量モードを正典化する（設定変更なしでも効く）
2. 改善サイクルを減速し、記録をアーカイブ可能にする（事象 5）
3. 低稼働 Agent 4 本を吸収し、常備 Agent を減らす（事象 4。security-reviewer は維持）

## 要件

- 毎回意識する対象を「Rules + 品質ゲート + セッション運用 + Codex 委譲」中心に落とせる
- 改善サイクルは 5 タスク / 同種 3 回 / ユーザー依頼時以外で manager を回さない
- 早期昇格を原則禁止し、対応済み candidate を archive できる
- 低稼働 Agent（requirements-analyst / performance-designer / e2e-test-implementer /
  document-reviewer）を起動対象から外し、責務を既存 Agent へ吸収する
- security-reviewer は観点独立性のため単独維持
- 歴史的ドキュメント（logs / accepted / evals results）は書き換えない

## 対象範囲

- `docs/claude-code/usage-guide.md`（軽量運用モード節）
- `docs/claude-code/memory-policy.md` / `improvement-cycle.md`
- `docs/claude-code/orchestration-policy.md` / `agent-responsibilities.md` / `README.md`
- `docs/claude-code/improvements/`（proposals / backlog / metrics テンプレ / archive）
- `.claude/agents/`（吸収先の拡張・吸収元の archive 移設）
- 現行参照する Skill / evals cases の起動 Agent 名同期

## 対象外

- アプリの Domain / Application / Infrastructure / Presentation コード
- DB / API 契約
- Hook のブロック条件変更（今回は触らない）
- security-reviewer の統合
- 歴史ログ・過去 evals results・accepted IMP 本文の書き換え

## 現状構成

- Agent 15 / Skill 17 / 改善記録が開発本体より重い
- 実運用の正規ルートは「メイン直接指揮 + Codex 委譲」（IMP-028 済み）
- 低稼働 4 Agent はログ言及がほぼ各 1

## 変更後構成

### Agent（15 → 11）

| 吸収元 | 吸収先 | 内容 |
| --- | --- | --- |
| requirements-analyst | orchestrator（調査）+ architecture-designer（requirements 保存） | L3 要求整理 |
| performance-designer | architecture-designer | L3・外部 I/O/大量データ時の性能節 |
| e2e-test-implementer | implementer | L3・基盤整備済み時の E2E 実装 |
| document-reviewer | reviewer | 文書品質レビュー観点（依頼時・文書中心時） |

残す: orchestrator / architecture-designer / contract-designer / implementation-planner /
implementer / test-designer / reviewer / security-reviewer / reflection-agent /
agent-evaluator / agent-improvement-manager

> 監査案は「e2e → test-designer」だったが、テストコード実装権限は implementer に既にあるため
> **implementer へ吸収**する（ツール適合を優先。試験計画の E2E 観点は従来どおり test-designer）。

### 運用モード

usage-guide に「個人開発ライトモード」を追加。L0/L1 積極活用、改善は溜めてから、
reflection は feature 完了時、を正典化。

### 改善サイクル減速

- 早期昇格の原則禁止（例外: 確証あり・修正極小を 1 行だけ）
- `candidates/archive/` への移動基準
- metrics に `meta_work_ratio` を追加

## データフロー

対象外（アプリデータなし）

## API 設計

対象外

## DB 設計

対象外

## フロントエンド設計

対象外

## バックエンド設計

対象外

## エラー処理

対象外（外部 I/O なし）

## ログと監視

- metrics の `process.meta_work_ratio` でメタ作業割合を監視
- 次スプリントの IMP 起票数・「後始末」比率を定性確認

## セキュリティ

- Agent 削除は起動面を減らす方向（権限拡大は implementer の既存 E2E 範囲に限定）
- 保護ファイル（`.claude/agents/**`）変更は PR レビュー承認をもって人間承認とする
  （IMP-2026-029 案 A と同型）

## 性能

- 常備 Agent 減・改善頻度減によりトークン/セッション時間を削減する設計
- 定量は次の L2/L3 数件で before/after 比較

## テスト方針

- ハーネス単体テスト（`.claude/tests`）が通ること
- 文書整合: Agent 数・起動フロー・tools 列挙が正典間で一致
- 既存 evals cases の「起動すべき Agent」期待を 11 Agent 構成に更新（結果ファイルは対象外）
- `pnpm test:harness`（または相当）と品質ゲート

## 移行とリリース

1. docs（ライトモード + 事象 5 + 正典の 11 Agent 記述）を本 PR で適用
2. Agent/Skill の実ファイルは
   `docs/claude-code/improvements/patches/IMP-2026-031/APPLY.md` を人間が
   `harness-approve` 後に適用（リモート AI は保護対象へ Write 不可）
3. 同期文書は本 PR で更新済み
4. PR マージ + APPLY 完了をもって本適用完了

## リスク

| リスク | 緩和 |
| --- | --- |
| L3 要求整理の品質低下 | architecture-designer に requirements 手順を明示 / orchestrator 先行調査を維持 |
| E2E 実装漏れ | implementer に起動条件セクションを移植、orchestration-policy に残す |
| 文書レビュー観点の埋没 | reviewer に条件付きセクションとしてチェックリストを移植 |
| 旧名参照の残存 | 現行正典・Skill・evals cases を同期。歴史文書は触らない |
| 統合先 Agent 肥大 | 条件付きセクションは発動条件+観点リストに限定 |

## 未決事項

なし（ユーザーが最善策での着手を承認済み。security-reviewer 維持・e2e は implementer 吸収を本設計の推奨として確定）
