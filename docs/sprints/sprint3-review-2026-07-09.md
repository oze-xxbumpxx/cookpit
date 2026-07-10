# Sprint 3 レビュー（2026-07-09）

> sprint-review Skill の初運用。集計は `sprint-summary.sh --since 2026-07-05 --until 2026-07-09`。

## 期間と Sprint

- 対象期間: 2026-07-05 〜 2026-07-09（Sprint 3 は 7/5 キックオフ）
- Sprint 3 ゴール（roadmap）: 土曜日に「今週の献立」を決めるフローがアプリで完結する
- 結果: **ゴール達成**。Unit A（バックエンド一式）+ Unit B（献立作成画面・履歴ビュー）が完了し、
  roadmap の完了条件 2 項目（1 週間分の献立を画面で組み立て / 過去 4 週間を遡れる）を充足。
  Sprint 4 へ移送済みのスコープ: ステータス遷移 UI / markAsCooked UI（7/8 確認済み）

## 完了したこと

- **Unit A: meal-plan-core**（7/5〜7/8）
  - 要件・設計・契約・実装計画・試験計画・ADR-0005（週定義=土曜始まり）を確定（7/5）
  - Codex 委譲で 5 層実装: Domain（PR #37）/ Infrastructure（PR #42）/ Application（PR #44）/
    api-contract（PR #45）/ Presentation API（PR #46）
  - Task 03 受け入れレビューで Should 1 件（弱いアサーション）修正（7/6）
  - Unit A クローズ: domain-model 同期・設計書ステータス更新・roadmap 追記（7/8・PR #48）
- **Unit B: meal-plan-screens**（7/9）
  - 設計判断 8 点確定 → 実装計画・試験計画（PR #49）
  - 実装ルートをユーザー判断で Codex → **Orchestrator 経路**に変更（滞留 IMP の実地検証を兼ねる）
  - implementer 1 パスで 12 新規 + 2 編集・品質ゲート全 green（web 82 件）
  - reviewer(Opus) 受け入れ可（Must 0 / Should 1 → 即日対応）・security-reviewer は省略条件適用
  - 実画面確認 MB-01〜08 **全 PASS**（リモートで dev:pglite + Playwright 自動実行）
- **ハーネス改善**（7/5〜7/9）
  - IMP-2026-014（モデル采配 4 層）採用・適用（7/5）
  - 業務改善第 2 ラウンド: sprint-review Skill・close-session ナッジ・Codex レビュー機械チェック・
    PGlite dev 経路・pnpm audit CI ほか（7/6・PR #40/#41）
  - IMP-2026-007 A+B / 015 / 016 採用・適用（7/8・PR #47）
  - ハーネス経路分析 → IMP-2026-017（Codex ルート正典化 + main 直コミットガード）/
    018（反映先一覧テンプレ欄）適用、019（メトリクス方針）起票（7/9）

## 所要時間合計

- 7/5: 記録なし / 7/6: 約 3 時間 50 分 / 7/8: 記録なし / 7/9: 本セッションで自動計測
  （TASK-2026-003: 活動約 51 分・Unit B 実装〜レビュー分）
- **「記録なし」2 件**（7/5・7/8。close-session 未発動が原因 — レトロ改善点参照）

## メトリクスサマリ

- TASK-2026-003（meal-plan-screens・L2）: セッション 1・活動 51 分・tool_uses 168・
  agent_calls {implementer:1}・ゲート実行 1（FAIL 0）・手戻り 0
- reviewer 指摘: Unit A Task 03 = Should 1 / Unit B = Should 1・Nice 3（いずれも Must 0）
- 期間内コミット 43・128 files changed / +13,972 -239

## 継続課題（未完了の持ち越し・重複排除済み）

1. CI の DATABASE_URL に Neon ブランチ DB を設定（7/4 起票・E2E smoke が実 DB に書き込むため）
2. ローカル PC 診断（docs/claude-code/local-audit-runbook.md）（7/4 起票）
3. 手動 API 確認 M-1〜M-9（任意。7/8 起票 — MB-01〜08 の自動確認で大半を代替済み）
4. Unit A クローズ PR / Unit B 実装 PR のマージ確認
5. IMP-2026-019（メトリクス方針 A/B）のユーザー選択
6. IMP-2026-007 の定量 after 計測（次の正常 L3 タスクで実施）

## AI ツール活用ハイライト

- **うまく機能した委譲**: Unit B の Orchestrator フル経路（implementer 1 パス + reviewer Opus）。
  手戻りゼロ・逸脱の自主検知/報告・ドキュメント更新完遂（IMP-010 効果）
- **Codex 委譲**（Unit A）: 5 層とも品質ゲート一発通過。既知ミス型の新パターン
  「弱いアサーション」を 1 件検出（レビューで捕捉）
- **失敗と回復**: 7/5 の Orchestrator バックグラウンド委譲がユーザー割り込みで killed →
  成果物の冪等判定で Codex ルートへ切替（orchestration-policy 既知の制約に記録済み）

## レトロ

### うまくいったこと

- 滞留していたハーネス改善 6 件の実地検証を Unit B 1 本でまとめて消化
  （010/014/016 = 機能確認、012 = 部分機能 + 新しい穴の発見、007/009 = 対象外/機会なし）
- リモート環境の実画面確認を dev:pglite + Playwright で**完全自動化**（従来 BLOCKED 常態 → 8 項目 PASS）
- main 直コミット・受け入れレビュー記録なし(7/6 検出)の再発防止を機械化（branch-guard + 正典化）

### 改善点

- 所要時間「記録なし」が 2 日（close-session 未発動）。複数セッション日の記録経路が依然弱い
- 実装計画のテストファイル名が vitest include と不一致（silent skip リスク）→ 改善候補起票
- 「弱いアサーション」が実装ルートを問わず累計 2 件 → あと 1 件で昇格ライン

## 次スプリント候補（採否はユーザー判断）

| 優先 | 候補                                                                                        | 根拠                                           |
| ---- | ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 高   | Sprint 4: ShoppingList 買い物リスト（roadmap 順当。L3 見込み → IMP-007 定量計測の実施機会） | roadmap Sprint 4 / IMP-007 申し送り            |
| 高   | ステータス遷移 UI / markAsCooked UI（Sprint 3 から移送分）                                  | logs/2026-07-08.md                             |
| 中   | IMP-2026-019 方針決定 + 適用（次の L3 前に決めると計測が揃う）                              | proposals/IMP-2026-019.md                      |
| 中   | CI DATABASE_URL（Neon ブランチ DB）設定                                                     | 7/4 持ち越し・E2E smoke の実 DB 書き込みリスク |
| 低   | ローカル PC 診断                                                                            | 7/4 持ち越し                                   |
