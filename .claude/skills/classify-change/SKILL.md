---
name: classify-change
description: >
  ユーザー要求を変更レベル（Level 0〜3）へ分類し、判定理由・必須Agent・必須成果物・省略工程を
  決める手順。Orchestrator がタスク開始時に使う。小規模変更を過剰工程にしないための判断に用いる。
---

# 変更レベル分類スキル

Orchestrator がタスク開始時に変更レベルを判定するための手順。レベル定義の正典は
[docs/claude-code/document-policy.md](../../../docs/claude-code/document-policy.md)、完了条件は
[definition-of-done.md](../../../docs/claude-code/definition-of-done.md)。

## 入力

- ユーザー要求（原文）
- 既存構成（影響しそうな層・パッケージ・ファイル）
- 影響範囲の初期見積り

## 判定フロー

1. **コード変更が無いか？** → Level 0（調査・相談）。
2. 変更はあるが**既存仕様を変えない軽微修正**（文言・コメント・CSS 微調整・明らかな typo・
   単純な null チェック・小規模バグ修正）か？ → Level 1。
3. **既存 API/画面/ロジック/Repository の変更**で、複数ファイルに及ぶが後方互換を壊さないか？
   → Level 2。
4. **新規 API・DB スキーマ変更・データ移行・認証認可・外部/AWS 連携・
   アーキテクチャ変更・大規模リファクタ・後方互換に影響**するか？ → Level 3。
   - **新規画面だけでは L3 にしない。** 新規 API / DB 変更を伴う場合のみ L3。既存 API・既存契約
     だけを使う画面追加は L2（出典: `.claude/evals/cases/frontend-screen-addition.md`、
     recipe-edit-screen 実判定 —
     `cookpit/recipe-edit-screen` 事象 3）。
     「新規画面」を L3 トリガー一覧の見出しだけで読まないこと。
5. 境界例（例：API 項目追加だが DB スキーマも変わる）は**上位レベル**として扱う。

### 判定例（実タスクの実績）

- **L2 の例**: recipe-edit-screen — 新規画面だがバックエンド・契約は既存のまま
  （Presentation 層のみ）→ L2。手戻りゼロで完走
  （出典: `cookpit/recipe-edit-screen` 事象 1・3）。
- **L3 の例**: store-master — 新規 API（`GET/POST /api/stores`）+ DB スキーマ変更
  （stores テーブル）を含む全層変更 → L3
  （出典: `cookpit/store-master 要件` / `cookpit/store-master 設計書`）。
- **L2 の例（テストのみの変更）**: test-infra-expansion — プロダクションコード変更 0 の
  テスト基盤拡張だが、新規 9 ファイル・複数パッケージ（infrastructure / apps/web）に及ぶ
  → 「軽微修正」ではなく L2。手戻りゼロで完走
  （出典: `cookpit/test-infra-expansion` 対象タスク概要・事象 1）。

## 出力（会話でユーザーへ提示）

- **判定レベル**（0〜3）
- **判定理由**（なぜそのレベルか、1〜3 行）
- **必要 Agent**（このレベルで起動する Subagent）
- **必要成果物**（document-policy のレベル別成果物）
- **省略する工程と理由**（過剰工程を避けるため、何を作らないか）

### レベル別の必要 Agent・成果物（早見）

| Level | 必要 Agent                                                                                                                                                           | 必須成果物                                                                                  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 0     | （調査のみ。読み取りで完結）                                                                                                                                         | なし（必要なら提案書）                                                                      |
| 1     | implementer（必要なら reviewer）                                                                                                                                     | なし（最終報告に変更理由）                                                                  |
| 2     | architecture-designer →〔契約あれば contract-designer※〕→ (planner ∥ test-designer) → implementer → reviewer →〔security-reviewer（省略条件あり）〕→〔reflection-agent※〕 | designs / implementation-plans / tests                                                      |
| 3     | architecture-designer（requirements + design）→ 上記 + ADR。E2E は implementer が条件付きで担当                                                                      | requirements / designs / implementation-plans / tests / decisions(ADR) / reviews / 振り返り |

※ `contract-designer` と `reflection-agent` は**存在する場合のみ**起動する。前者は
契約（API / DB / スキーマ）を持つプロジェクト固有の Agent、後者は改善サイクルを
運用しているプロジェクトの Agent で、どちらも開発ワークフロー層の必須要素ではない
（層マニフェスト: `docs/claude-code/plugin-layer-manifest.md`）。無い環境では
その工程を飛ばし、飛ばした旨を報告に書く。

## 注意

- 小規模変更に Level 3 相当の工程を当てない（実施指示書
  `docs/claude-code/archive/claude-code-multi-agent-implementation-instructions.md` §22.6 / §5）。
- 判定後、L2/L3 では最初の Write 担当 Subagent が `.claude/state/current-feature` に
  feature-name を書く。L0/L1 では設定しない（Hook 誤検知防止）。
