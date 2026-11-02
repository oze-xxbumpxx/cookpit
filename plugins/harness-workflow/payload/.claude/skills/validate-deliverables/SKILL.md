---
name: validate-deliverables
description: >
  要件・設計・実装計画・コード・テストの整合性を確認するチェックリスト。Hookで機械的に
  判定できない意味的な整合性を、完了前にこのセッションで確認する。reviewerの指摘と突き合わせる。
---

# 成果物整合性チェックスキル

Hookは「ファイルの存在」「必須セクションの非空」までしか見ない。意味的な整合性は
このチェックリストで確認する。完了報告の前に、このセッションが通す。

## 前提

`<feature-name>`と変更レベル（L1/L2/L3）を確認する。`.claude/state/current-feature`の値、
および`docs/claude-code/document-policy.md`のレベル定義に従う。

## チェックリスト

### 1. 成果物の存在（レベル相応）
- [ ] L2: designs / implementation-plans / testsが存在
- [ ] L3: 上記 + requirements / decisions(ADR) / reviewsが存在
- [ ] L1: 設計書・計画は無くてよい。最終報告に変更理由と確認内容がある

### 2. 必須セクションの非空
- [ ] 設計書の各セクションが「対象外/変更なし」を含め埋まっている
- [ ] 実装計画の各ステップに対象ファイル・変更内容・完了条件がある
- [ ] 試験計画に正常系・異常系・境界値がある

### 3. 横断的な意味整合性（Hookでは判定不可）
- [ ] 要件 → 設計：要件のすべてが設計で扱われている（漏れ・矛盾なし）
- [ ] 設計 → 実装計画：設計の変更点が計画のステップに対応している
- [ ] 設計/計画 → 実装：実装が設計どおりで、独断の逸脱がない
- [ ] 設計/計画 → 試験：試験観点が振る舞いと境界を網羅している
- [ ] 変更対象ファイルのパスが実在し、計画と実装が一致している
- [ ] **試験 → 実装（public API網羅）**: 変更・追加された全publicメソッド・static
  ファクトリ・ゲッターに対応するテストケースが存在する
- [ ] **試験（防御性）**: Domain層の変更を含む場合、防御的コピー・不変条件・不正引数・
  副作用（updatedAt等）の観点がテストに含まれている

### 4. アーキテクチャ・規約
- [ ] `AGENTS.md`と実在する`.claude/rules/`（現状は`coding-standards.md`）に違反がない
- [ ] 未作成の層別ルールを前提にした指摘をしていない

### 5. 品質ゲート
- [ ] 実在するlint / 型チェック / テストが通る（未導入は`unknown`）
- [ ] 画面変更を含む場合、ブラウザ確認の結果が報告に含まれている

### 6. スコープ・運用
- [ ] 依頼スコープ外の変更が混入していない
- [ ] 恒久ドキュメント/ADRの更新要否が判断されている
- [ ] ユーザー確認が必要な判断がすべて解決済み

### 7. 人間引き渡し（Gate B / L2・L3）
- [ ] `docs/reviews/<feature>.md`をstructured packetで作成・更新したL2/L3では、
  `node .claude/scripts/review-readiness.mjs handoff-check --feature <feature> --base origin/main`
  がexit 0（`review-readiness`は休眠のため、packetを作らないL3でも必須にしない）
- [ ] packetを作った場合、review stateがcurrentな`human_review_requested`（AI承認ではない）
- [ ] packetを作った場合、legacy markerなし文書のまま「完了」「PR準備完了」としていない
- [ ] チャット/PR要約が`handoff-blurb`相当で、`受け入れ可` / `APPROVED`を含まない
- [ ] Gate B文書（`docs/reviews/README.md`）は未作成。休眠中はレビュー指摘と検証結果を
  PR / 日次ログに残す（packet形式は必須にしない）

## 結果

未充足項目があれば、どの成果物を直すかを報告し、完了にしない。
Gate B未充足のまま人間へマージ判断を渡さない。
