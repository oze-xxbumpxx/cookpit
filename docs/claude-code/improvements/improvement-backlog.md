# 改善バックログ

候補（candidate）と提案（proposal）の一覧。reflection-agent / agent-improvement-manager が
起票・更新する。ID 採番と運用は [README.md](./README.md) を参照。

> 新しい行は表の末尾に追加する。ステータスが変わったら同じ行を更新する（行を増やさない）。

## 提案（IMP）

| ID | タイトル | 対象 | ステータス | 候補 | 提案 | 評価 | 決定 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| IMP-2026-001 | create-test-plan Skill に冪等性・障害系・FE固有観点 +「観点の選択基準」を追加（事象2(b)・4 統合） | .claude/skills/create-test-plan/SKILL.md | accepted | [candidates/test-runner-introduction.md](candidates/test-runner-introduction.md) | [proposals/IMP-2026-001.md](proposals/IMP-2026-001.md) | [evaluations/IMP-2026-001.md](evaluations/IMP-2026-001.md) | 2026-06-24 採用（manager / 悪化なし・本適用済み） |
| IMP-2026-002 | Stop フックの反復ノイズを変更検知デバウンスで抑制 | .claude/hooks/check-deliverables.mjs / check-improvement-cycle.mjs | accepted | [candidates/recipe-edit-screen.md](candidates/recipe-edit-screen.md)（事象5） | [proposals/IMP-2026-002.md](proposals/IMP-2026-002.md) | スクリプト試験4項目 合格 | 2026-06-24 採用（人間承認・本適用済み） |
| IMP-2026-003 | reviewer に障害設計レビュー観点を追加（外部 I/O / 障害系タスク限定で適用） | .claude/agents/reviewer.md | accepted | ベースライン採点（INDEX 弱軸 §3 レビュー品質 3.7） | [proposals/IMP-2026-003.md](proposals/IMP-2026-003.md) | [evaluations/IMP-2026-003.md](evaluations/IMP-2026-003.md) | 2026-06-25 採用（人間承認・本適用済み・悪化なし） |
| IMP-2026-004 | contract-designer の起動条件を明示化（L2 の Zod スキーマ変更で必須起動） | docs/claude-code/orchestration-policy.md / .claude/agents/orchestrator.md | accepted | ベースライン採点（INDEX 弱軸 §2 契約品質 3.4）+ [candidates/recipe-edit-screen.md](candidates/recipe-edit-screen.md)（事象5） | [proposals/IMP-2026-004.md](proposals/IMP-2026-004.md) | [evaluations/IMP-2026-004.md](evaluations/IMP-2026-004.md) | 2026-06-25 採用（人間承認・本適用済み・悪化なし） |
| IMP-2026-005 | Stop フックのデバウンスを feature-only ハッシュに変更（IMP-2026-002 の追加修正） | .claude/hooks/check-deliverables.mjs / check-improvement-cycle.mjs | accepted | [candidates/recipe-edit-screen.md](candidates/recipe-edit-screen.md)（事象5残存） | — | スクリプト試験3項目 合格 | 2026-06-25 採用（人間承認・本適用済み） |
| IMP-2026-006 | 不足サブエージェント3種追加（security-reviewer / performance-designer / e2e-test-implementer）と障害設計の設計前倒し | .claude/agents/{security-reviewer,performance-designer,e2e-test-implementer}.md / orchestrator.md / orchestration-policy.md / agent-responsibilities.md / create-design-document SKILL | accepted | ユーザー要求（委譲ギャップ分析） | [proposals/IMP-2026-006.md](proposals/IMP-2026-006.md) | dry run 5ケース・悪化軸ゼロ（[evals/results/…SUMMARY.md](../../.claude/evals/results/agent-addition-security-perf-e2e--SUMMARY.md)） | 2026-06-27 採用（人間承認・本適用済み） |
| IMP-2026-007 | orchestrator L3 設計フェーズの逐次実行＋重複探索を改善（改善A: 設計系並列化 / 改善B: 先行調査共有） | .claude/agents/orchestrator.md / docs/claude-code/orchestration-policy.md | evaluated | [candidates/orchestrator-parallelization.md](candidates/orchestrator-parallelization.md)（**ユーザー指定の必須昇格**） | [proposals/IMP-2026-007.md](proposals/IMP-2026-007.md) | [evaluations/IMP-2026-007.md](evaluations/IMP-2026-007.md)（2026-06-27 実施・3ケース全軸悪化なし・効率改善は定量未確認・採用推奨[条件付き]） | 未決定（人間承認必須） |
| IMP-2026-008 | orchestrator stop/resume 後の Sub-agent notification 待ちループを解消（状態ファイル + 通知非依存の冪等再開 / 単一委譲は同期既定） | .claude/agents/orchestrator.md / docs/claude-code/orchestration-policy.md / .claude/state/inflight-agents.json | accepted | [candidates/store-master.md](candidates/store-master.md)（事象1） | [accepted/IMP-2026-008.md](accepted/IMP-2026-008.md) | [evaluations/IMP-2026-008.md](evaluations/IMP-2026-008.md)（v1 悪化2軸→v2 悪化ゼロ・条件付き採用推奨） | 2026-07-01 採用（人間承認・本適用済み・v2） |

凡例: ステータス = candidate / proposal / evaluated / accepted / rejected。
「候補」「提案」「評価」「決定」列には該当ファイルへの相対リンクまたは日付を入れる。

## インシデント（INC）

| ID | タイトル | 影響 | 検知日 | ステータス | 関連提案 |
| --- | --- | --- | --- | --- | --- |
| _（まだ無し）_ | | | | | |

## 申し送り（proposal 対象外だが追跡する判断）

| 項目 | 決定 | 担当 | 起票元 |
| --- | --- | --- | --- |
| eval ベースライン再採点（テスト網羅性ほか） | 2026-06-25 実施済み。`INDEX-2026-06-25.md` に新ベースライン保存（IMP-2026-003/004/005・Application Vitest・Playwright 反映）。次回再採点は次の主要改善適用後。 | 完了 | 事象 2(a) |
| IMP-2026-001 の実タスク事後確認（recipe-edit-screen で観点選択基準が正しく機能） | evaluations/IMP-2026-001.md への事後補記を manager に推奨 | manager | recipe-edit-screen 事象 2 |
| **IMP-2026-007 採否判断のための定量計測**（次の L3 タスクで実施）: reflection-agent が `duration_ms` / `tool uses` / 合計トークンの before/after を記録し、`docs/claude-code/improvements/evaluations/IMP-2026-007.md` の「実タスク計測」節に追記すること。計測後に人間が採否を最終判断する。 | **store-master（2026-06-28）で計測実施したが、orchestrator の notification 待ちループにより手動オーケストレーション状態となり、正常動作時の before 値として使いにくい**。次の L3 タスク（orchestrator 正常動作かつ notification ループ未発生）で再計測を推奨。evaluations/IMP-2026-007.md の「実タスク計測」節に詳細記録済み。 | reflection-agent + 人間 | IMP-2026-007 A案決定（2026-06-27）+ store-master 計測（2026-06-28）|
| **orchestrator stop/resume 後の Sub-agent notification 待ちループ問題**（新規・重要）: orchestrator が background で Sub-agent を起動した後に stop すると、再開時に Sub-agent 完了通知を受け取れず無限待機に陥る。store-master で初観測。IMP-2026-007 の計測前提を崩す根本問題であり、並列化改善より先に解決が必要な可能性がある。候補ファイル: [candidates/store-master.md](candidates/store-master.md) 事象 1 参照。 | 未実施。manager が次の L3 タスク前に proposal 起票するか判断する。 | manager | store-master 事象 1（2026-06-28）|

## 候補のうち「Memory 留め（昇格せず）」の記録

昇格条件を満たさず Auto / Subagent Memory に留めた知見は、再発回数の追跡のためここに
軽く残す（肥大化させない。詳細は各候補ファイル）。

| 事象 | 直近観測タスク | 累計発生回数 | 保存先 |
| --- | --- | --- | --- |
| turbo キャッシュが既存エラーを不可視化（node:crypto type-check 失敗） | test-runner-introduction | 1 | implementer Subagent Memory |
| auto モード安全性判定器障害からのチェックポイントコミット復旧パターン | test-runner-introduction | 1 | implementer Subagent Memory |
| contract-designer 起動条件が orchestrator 判断依存で不明確 | ベースライン再採点（post-phase3）| 2（実タスク未発生・→ IMP-2026-004 へ昇格・proposal 化）| orchestrator Subagent Memory → proposal |
| orchestrator L2 フルフロー 5 本が手戻りゼロで完走（成功パターン） | recipe-edit-screen | 1 | orchestrator Subagent Memory |
| classify-change Skill の「新規画面 = L3」という読める曖昧な記述（潜在誤判定リスク） | recipe-edit-screen | 1（明示的誤判定は未発生） | orchestrator Subagent Memory |
| coding-standards.md に Next.js page/layout の default export 例外が未記載（reviewer N2） | recipe-edit-screen | 1 | reviewer Subagent Memory |
| Stop フック（check-deliverables/check-improvement-cycle）が多段進行中に毎ターン発火しノイズ | recipe-edit-screen | 1 | orchestrator Subagent Memory |
| reviewer に障害設計固有観点（リトライ嵐・冪等性欠如等）が不足 | ベースライン再採点（post-phase3）| 2（→ IMP-2026-003 へ昇格・proposal 化）| reviewer Agent 定義 → proposal |
| sw.js（Serwist 自動生成 Service Worker）が ESLint error（no-this-alias）を出す | Sprint 1 クローズ | 1 | ESLint 除外設定で対応可 |
| architecture-designer 二重起動（orchestrator notification 待ちループの副産物） | store-master | 1 | orchestrator Subagent Memory（事象 1 解消で自然消滅） |
| N-02 テスト（create → getAll 連携）が設計書テスト節省略により未実装（reviewer Should-2） | store-master | 1（再発監視中・次回同種 Should 指摘で create-test-plan Skill 昇格） | test-designer Subagent Memory |
| docs/04-domain-model.md の Store エンティティ定義が実装と乖離（reviewer Nice-2） | store-master | 1（再発監視中・次回同種指摘で昇格） | implementer Subagent Memory |
| hono バージョン ^4.12.18 に脆弱性（GHSA-88fw-hqm2-52qc）・最新パッチ以上に維持する運用ルール | store-master | 1 | implementer Subagent Memory |
| 計画セッション分離型 L2（前日に計画確定→翌日実装）が手戻りゼロで完走（成功パターン） | test-infra-expansion | 1 | orchestrator Subagent Memory |
| 設計書が非推奨 API を指定（Vitest defineWorkspace → test.projects へ実装時置換）。設計時に採用バージョンの現行 API 未確認 | test-infra-expansion | 1（再発で create-design-document Skill 昇格を検討） | architecture-designer Subagent Memory |
| リモート（エフェメラル）環境では subagent-log が残らず record-task-metrics.sh の自動補完・横断計測が機能しない | test-infra-expansion | 1（IMP-2026-007 定量計測の前提にも影響・再発で reflect-task Skill 昇格を検討） | reflection-agent Subagent Memory |
| テスト・設定のみ（プロダクションコード変更 0）の L2 で実装後 reviewer を省略しマージ（省略条件が未明文化） | test-infra-expansion | 1（判断が揺れたら classify-change / validate-deliverables へ明文化） | orchestrator Subagent Memory |

## 昇格候補（candidate ファイルあり・proposal 起票待ち）

| task-id | 事象タイトル | 対象 | ステータス | 候補ファイル |
| --- | --- | --- | --- | --- |
| test-runner-introduction | テスト網羅性弱点解消後の再採点 + create-test-plan Skill 観点追加（冪等性・障害系・FE固有） | .claude/skills/create-test-plan.md / evals/baselines | proposal 化済み（→ IMP-2026-001） | [candidates/test-runner-introduction.md](candidates/test-runner-introduction.md) |
| recipe-edit-screen | classify-change Skill: 「新規画面」単体を L3 と読める曖昧さを解消（再発監視中・次回誤判定で昇格） | .claude/skills/classify-change/SKILL.md | candidate（Memory 留め） | [candidates/recipe-edit-screen.md](candidates/recipe-edit-screen.md) |
| recipe-edit-screen | coding-standards.md: Next.js page/layout の default export 例外を明記（再発監視中・次回同 nit で昇格） | .claude/rules/coding-standards.md | candidate（Memory 留め） | [candidates/recipe-edit-screen.md](candidates/recipe-edit-screen.md) |
| recipe-edit-screen | Stop フック: 多段オーケストレーション進行中の毎ターン誤発火抑制（次回 L2/L3 再発で即昇格・Hook 変更は人間承認必須） | Hook（check-deliverables / check-improvement-cycle） | proposal 化済み（→ IMP-2026-005） | [candidates/recipe-edit-screen.md](candidates/recipe-edit-screen.md) |
| recipe-edit-screen | contract-designer 起動条件の不明確さ（事象5）→ ベースライン再採点と統合し proposal 化 | docs/claude-code/orchestration-policy.md / orchestrator.md | proposal 化済み（→ IMP-2026-004） | [candidates/recipe-edit-screen.md](candidates/recipe-edit-screen.md) |
| orchestrator-parallelization | **【必須・ユーザー指定】** orchestrator L3 設計フェーズの逐次実行＋重複探索を改善（並列化 + 先行調査共有）| .claude/agents/orchestrator.md | proposal 化済み（→ IMP-2026-007） | [candidates/orchestrator-parallelization.md](candidates/orchestrator-parallelization.md) |
| store-master | **【昇格推奨】** orchestrator stop/resume 後の Sub-agent notification 待ちループ（手動オーケストレーションが必要になる根本問題・IMP-2026-007 計測前提を崩す） | .claude/agents/orchestrator.md / docs/claude-code/orchestration-policy.md | candidate（manager が proposal 起票を検討） | [candidates/store-master.md](candidates/store-master.md)（事象 1） |
