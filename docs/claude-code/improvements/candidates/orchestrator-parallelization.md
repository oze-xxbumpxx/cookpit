# 改善候補: orchestrator-parallelization

> **ユーザー指定の必須改善項目**（通常の昇格条件を満たさなくても必ず proposal 化する）

- **task-id**: orchestrator-parallelization
- **作成日**: 2026-06-26
- **起票元**: Sprint 2 設計フェーズ後のユーザーフィードバック
- **優先度**: 必須（ユーザー指定）

---

## 観測した事象

### 事象 1: L3 設計フェーズが約20分かかりすぎる（orchestrator の逐次実行 + 重複探索）

- **種類**: トークン浪費・待ち時間の問題
- **観測した事象**:
  Sprint 2（product-master）の設計フェーズで以下を計測:
  - 所要時間: 約20分（duration_ms: 1,169,584）
  - tool uses: 191回
  - トークン: 176,022

  原因として2つの構造的問題を確認:

  1. **逐次実行**: requirements-analyst → architecture-designer → contract-designer → implementation-planner → test-designer が直列で、後段は前段の完了を待つ。architecture-designer と contract-designer、implementation-planner と test-designer は並列実行できるが現状は逐次。
  2. **重複ファイル探索**: 各 subagent が毎回コードベースを再探索する（同一ファイルを複数 agent が読む）。orchestrator が調査結果を先取りして各 agent に渡す仕組みがない。

- **発生回数**: Sprint 2 設計フェーズ（初計測）。L2 recipe-edit-screen は5 agent で問題にならなかったが、L3 6 agent で顕在化。
- **対象タスク**: product-master（Sprint 2 設計フェーズ）
- **原因仮説**:
  - orchestrator.md が agent を逐次で直列呼び出しする設計になっている
  - 各 agent に「コードベースを自分で調査せよ」という設計のため、重複読取りが発生する
  - 特に contract-designer は architecture-designer の成果物があれば並列に動ける

- **改善案（2点セット）**:

  **改善A: 並列実行への変更**
  - `architecture-designer` と `contract-designer` を並列実行（contract-designer が設計書ドラフトなしでも動ける範囲の判断を明示）
  - `implementation-planner` と `test-designer` を並列実行（現在も並列指示だが、orchestrator の実装が逐次になっている可能性）
  - 対象: `.claude/agents/orchestrator.md` の L3 フロー定義

  **改善B: orchestrator 先行調査の共有**
  - orchestrator が最初に主要ファイル（schema.ts / 既存 repository / 既存 use case 1本）を読んで要約を作成し、各 subagent へ引き渡す
  - 各 agent が「重複して探索しなくてよい」コンテキストを明示的に提供する
  - 対象: `.claude/agents/orchestrator.md` の調査フェーズ定義

- **変更対象**: `.claude/agents/orchestrator.md`（Agent 定義 → **人間承認必須**）
- **想定される副作用**:
  - 並列化により context が分離され、contract-designer が architecture-designer の最終稿を参照できない可能性 → 契約書に設計書の「参照してください」リンクを入れることで緩和
  - 先行調査の要約が不完全だと後段 agent が誤った前提で動くリスク → orchestrator の要約対象ファイルを限定（schema.ts / 既存 repository 1本 / api-contract 1本 のみ）
- **評価方法**:
  - 次の L3 タスクで所要時間・tool uses を計測し before/after 比較
  - 設計書の品質（必須セクション・整合性）が before と同等以上であることを確認
  - agent-evaluator で回帰評価
- **昇格判定**: **必須（ユーザー指定）** — 通常の昇格条件（再発3回等）を待たず、次の improvement-manager 起動時に proposal 化する

---

## まとめ

- 改善候補として起票: 事象1（orchestrator L3 逐次実行 + 重複探索）
- ユーザー指定必須のため、次回 manager 実行時に即 proposal 化すること
