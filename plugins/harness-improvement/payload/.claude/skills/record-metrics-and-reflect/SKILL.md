---
name: record-metrics-and-reflect
description: >
  タスクメトリクスの記録と振り返り候補の作成を行う手順。close-session から呼ばれるのが
  既定だが、単独でも使える。L2/L3 のみ対象で L0/L1 はスキップする。
  改善サイクル（harness-improvement 層）の入力を作るスキル。
---

# メトリクス記録・振り返りスキル

セッション終了時のメタ作業のうち、**改善サイクルの入力を作る部分**を担う。
`close-session` から分離した（層マニフェスト: `harness-improvement`）。

分離の理由: `close-session` は品質ゲート・ログ・コミットという core 層の作業で完結すべきで、
メトリクス集計と振り返りは改善サイクルを運用しているプロジェクトだけが必要とする
（出典: cookpit/harness-plugin-split — 層をまたぐ依存の解消）。

## 発動条件

- `close-session` の手順から呼ばれたとき（既定の経路）。
- ユーザーが「メトリクスを記録して」「振り返りを作って」と依頼したとき。
- 使わない場面: **L0/L1 のタスク**（過剰工程にしない）。

## 前提

このスキルは以下に依存する。いずれかが無い環境ではスキップしてよい。

- `.claude/scripts/record-task-metrics.sh` / `collect-task-metrics.mjs`
- `.claude/scripts/check-review-coverage.mjs`
- `reflection-agent` と `reflect-task` Skill
- `docs/claude-code/improvements/` の構造

## 手順

1. **メトリクス**（L2/L3 の機能タスクに関与したセッションは毎回）:
   `bash .claude/scripts/record-task-metrics.sh <task-id> <feature> <level>` を実行する。
   - 初回は雛形を作成、2 回目以降は `machine:` セクションだけ再集計して累積する（冪等）。
   - **feature が未完了でも先送りしない**。`machine:` セクションの転記は毎セッション実行する
     （意味値の記入だけタスク完了時でよい。セッション内確定の原則 — improvement-cycle.md
     §計測の原則 / IMP-2026-019）。
   - 所要時間・トークン・ツール/Agent 呼び出し・ゲート実行（手戻りプロキシ）は
     `collect-task-metrics.mjs` が transcript と quality-gates-log から自動で埋める。
     transcript はローカルマシンにしか残らないため、タスク完了時ではなく
     **セッションごと**に実行して YAML へ固定化する（複数日タスクの取りこぼし防止）。
   - ブランチ名に feature 名が含まれないブランチで作業した場合は
     `node .claude/scripts/collect-task-metrics.mjs --feature <feature> --branch <ブランチ部分一致> --task-id <task-id> --write`
     で対象ブランチを明示して再実行する。
   - 意味的な値（quality/process の手戻り・4 軸レビュー指摘・ユーザー修正数）は自動化対象外。
     タスク完了時に reflection-agent が packet / audit から埋める（不明値は unknown のまま）。
   - `review.active_time_bucket/confidence/full_diff_opened` だけは人間の任意回答。計時や回答を
     完了条件にせず、未回答を推測しない。
2. **振り返り**（L2/L3 のみ）: reflection-agent へ委譲し reflect-task Skill で
   candidate を作成する。L0/L1 はスキップ（過剰工程にしない）。
3. **レビュー記録の網羅確認**: 複数 Task の Codex 委譲 feature では、main マージ済み
   Task 分の `docs/reviews/<feature>.md` 記録が揃っているか
   `node .claude/scripts/check-review-coverage.mjs <feature>` で確認する
   （空配列 = 網羅済み。出典: cookpit/pantry-core 事象 2 / IMP-2026-020 適用後の再発）。
4. **引き渡し packet 確認**（人間マージ判断へ渡す L2/L3）:
   `docs/reviews/<feature>.md` がある、または L3 なら
   `node .claude/scripts/review-readiness.mjs handoff-check --feature <feature> --base origin/main`
   を実行する。失敗時はメトリクス記録自体は続けてよいが、完了報告では
   「人間レビュー待ち」と書かず持ち越しにする（正典: close-session 手順 5）。

## 完了条件

- L2/L3 タスクでメトリクス・振り返りを飛ばしていない（飛ばした場合は理由を報告に明記）。
- メトリクス YAML の `machine:` セクションが当セッション分まで反映されている。
- `check-review-coverage.mjs` が空配列を返す（該当する feature がある場合）。
- 人間引き渡し対象 feature では `handoff-check` 成功、または未充足を報告に明記。
