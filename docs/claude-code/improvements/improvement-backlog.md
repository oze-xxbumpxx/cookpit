# 改善バックログ

候補（candidate）と提案（proposal）の一覧。reflection-agent / agent-improvement-manager が
起票・更新する。ID 採番と運用は [README.md](./README.md) を参照。

> 新しい行は表の末尾に追加する。ステータスが変わったら同じ行を更新する（行を増やさない）。

## 提案（IMP）

| ID | タイトル | 対象 | ステータス | 候補 | 提案 | 評価 | 決定 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| IMP-2026-001 | create-test-plan Skill に冪等性・障害系・FE固有観点 +「観点の選択基準」を追加（事象2(b)・4 統合） | .claude/skills/create-test-plan/SKILL.md | accepted | [candidates/test-runner-introduction.md](candidates/test-runner-introduction.md) | [proposals/IMP-2026-001.md](proposals/IMP-2026-001.md) | [evaluations/IMP-2026-001.md](evaluations/IMP-2026-001.md) | 2026-06-24 採用（manager / 悪化なし・本適用済み） |

凡例: ステータス = candidate / proposal / evaluated / accepted / rejected。
「候補」「提案」「評価」「決定」列には該当ファイルへの相対リンクまたは日付を入れる。

## インシデント（INC）

| ID | タイトル | 影響 | 検知日 | ステータス | 関連提案 |
| --- | --- | --- | --- | --- | --- |
| _（まだ無し）_ | | | | | |

## 申し送り（proposal 対象外だが追跡する判断）

| 項目 | 決定 | 担当 | 起票元 |
| --- | --- | --- | --- |
| eval ベースライン再採点（テスト網羅性ほか） | Phase 3 完了後に全軸を一括再採点（部分再採点しない）。IMP-2026-001 の即時 before/after は evaluations で担保済み | evaluator/baseline タスク | 事象 2(a) |

## 候補のうち「Memory 留め（昇格せず）」の記録

昇格条件を満たさず Auto / Subagent Memory に留めた知見は、再発回数の追跡のためここに
軽く残す（肥大化させない。詳細は各候補ファイル）。

| 事象 | 直近観測タスク | 累計発生回数 | 保存先 |
| --- | --- | --- | --- |
| turbo キャッシュが既存エラーを不可視化（node:crypto type-check 失敗） | test-runner-introduction | 1 | implementer Subagent Memory |
| auto モード安全性判定器障害からのチェックポイントコミット復旧パターン | test-runner-introduction | 1 | implementer Subagent Memory |
| contract-designer 起動条件が orchestrator 判断依存で不明確 | test-runner-introduction（ベースライン採点） | 1（実タスク未発生） | orchestrator Subagent Memory |

## 昇格候補（candidate ファイルあり・proposal 起票待ち）

| task-id | 事象タイトル | 対象 | ステータス | 候補ファイル |
| --- | --- | --- | --- | --- |
| test-runner-introduction | テスト網羅性弱点解消後の再採点 + create-test-plan Skill 観点追加（冪等性・障害系・FE固有） | .claude/skills/create-test-plan.md / evals/baselines | proposal 化済み（→ IMP-2026-001） | [candidates/test-runner-introduction.md](candidates/test-runner-introduction.md) |
