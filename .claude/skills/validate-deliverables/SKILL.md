---
name: validate-deliverables
description: >
  要件・設計・実装計画・コード・テストの整合性を確認するチェックリスト。Hook で機械的に
  判定できない意味的な整合性を人手/Reviewer で確認するときに使う。Orchestrator が完了前に通す。
---

# 成果物整合性チェックスキル

Hook は「ファイルの存在」「必須セクションの非空」までしか見ない。意味的な整合性は
このチェックリストで確認する。reviewer や Orchestrator が完了報告前に通す。

## 前提

`<feature-name>` と変更レベル（L1/L2/L3）を確認する。`.claude/state/current-feature` の値、
および `docs/claude-code/document-policy.md` のレベル定義に従う。

## チェックリスト

### 1. 成果物の存在（レベル相応）
- [ ] L2: designs / implementation-plans / tests が存在
- [ ] L3: 上記 + requirements / decisions(ADR) / reviews が存在
- [ ] L1: 設計書・計画は無くてよい。最終報告に変更理由と確認内容がある

### 2. 必須セクションの非空
- [ ] 設計書の各セクションが「対象外/変更なし」を含め埋まっている
- [ ] 実装計画の各ステップに対象ファイル・変更内容・完了条件がある
- [ ] 試験計画に正常系・異常系・境界値がある

### 3. 横断的な意味整合性（Hook では判定不可）
- [ ] 要件 → 設計：要件のすべてが設計で扱われている（漏れ・矛盾なし）
- [ ] 設計 → 実装計画：設計の変更点が計画のステップに対応している
- [ ] 設計/計画 → 実装：実装が設計どおりで、独断の逸脱がない
- [ ] 設計/計画 → 試験：試験観点が振る舞いと境界を網羅している
- [ ] 変更対象ファイルのパスが実在し、計画と実装が一致している
- [ ] **試験 → 実装（public API 網羅）**: 変更・追加された全 public メソッド・static
  ファクトリ・ゲッターに対応するテストケースが存在する
- [ ] **試験（防御性）**: Domain 層の変更を含む場合、防御的コピー・不変条件・不正引数・
  副作用（updatedAt 等）の観点がテストに含まれている

### 4. アーキテクチャ・規約
- [ ] 依存方向・集約境界（`.claude/rules/domain-layer.md`）に違反がない
- [ ] コーディング規約（`.claude/rules/coding-standards.md`）に違反がない

### 5. 品質ゲート
- [ ] `pnpm lint` が通る
- [ ] `pnpm type-check` が通る
- [ ] `pnpm test` が通る（Vitest は domain / application / infrastructure / apps/web に
  導入済み — 2026-07-01 PR #21 `cookpit/test-infra-expansion 設計書`。E2E は未整備）
- [ ] `apps/web` の画面変更を含む場合、`manual-browser-verify` Skill の確認結果
  （全項目に PASS / BLOCKED(理由) / FAIL）が報告に含まれている

### 6. スコープ・運用
- [ ] 依頼スコープ外の変更が混入していない
- [ ] 恒久ドキュメント/ADR の更新要否が判断されている
- [ ] ユーザー確認が必要な判断がすべて解決済み

### 7. 人間引き渡し（Gate B / L2・L3）
- [ ] L3、または `docs/reviews/<feature>.md` を作成・更新した L2 では、
  `node .claude/scripts/review-readiness.mjs handoff-check --feature <feature> --base origin/main`
  が exit 0
- [ ] review state が current な `human_review_requested`（AI 承認ではない）
- [ ] legacy marker なし文書のまま「完了」「PR 準備完了」としていない
- [ ] チャット/PR 要約が `handoff-blurb` 相当で、`受け入れ可` / `APPROVED` を含まない
- [ ] 人間向け packet が `docs/reviews/README.md` の Gate B 書き方に沿っている
  （内容 lint の WARN は修正または監査ログへ理由を残す）

## 結果

未充足項目があれば、どの成果物を誰が直すべきかを添えて Orchestrator へ返す。
Gate B 未充足のまま人間へマージ判断を渡さない。
