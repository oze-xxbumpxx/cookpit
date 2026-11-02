---
name: record-metrics-and-reflect
description: >
  タスクメトリクスの記録と振り返り候補の作成を行う手順。close-sessionから呼ばれるのが
  既定だが、単独でも使える。L2/L3のみ対象でL0/L1はスキップする。
  改善サイクル（harness-improvement層）の入力を作るスキル。
---

# メトリクス記録・振り返りスキル

セッション終了時のメタ作業のうち、**改善サイクルの入力を作る部分**を担う。
`close-session`から分離した（層マニフェスト: `harness-improvement`）。

分離の理由: `close-session`は品質ゲート・ログ・コミットというcore層の作業で完結すべきで、
メトリクス集計と振り返りは改善サイクルを運用しているプロジェクトだけが必要とする
（出典: cookpit/harness-plugin-split — 層をまたぐ依存の解消）。

## 発動条件

- `close-session`の手順から呼ばれたとき（既定の経路）。
- ユーザーが「メトリクスを記録して」「振り返りを作って」と依頼したとき。
- 使わない場面: **L0/L1のタスク**（過剰工程にしない）。

## 前提

このスキルは以下に依存する。いずれかが無い環境ではスキップしてよい。

- `.claude/scripts/record-task-metrics.sh` / `collect-task-metrics.mjs`
- `reflect-task`スキル（改善サイクルが休眠のあいだは、ユーザーが頼んだときだけ）
- `docs/claude-code/improvements/`の構造

## 手順

1. **メトリクス**（L2/L3の機能タスクに関与したセッションは毎回）:
   `bash .claude/scripts/record-task-metrics.sh <task-id> <feature> <level>`を実行する。
   - 初回は雛形を作成、2回目以降は`machine:`セクションだけ再集計して累積する（冪等）。
   - **featureが未完了でも先送りしない**。`machine:`セクションの転記は毎セッション実行する
     （意味値の記入だけタスク完了時でよい。セッション内確定の原則 — improvement-cycle.md
     §計測の原則 / IMP-2026-019）。
   - 所要時間・トークン・ツール/Agent呼び出し・ゲート実行（手戻りプロキシ）は
     `collect-task-metrics.mjs`がtranscriptとquality-gates-logから自動で埋める。
     transcriptはローカルマシンにしか残らないため、タスク完了時ではなく
     **セッションごと**に実行してYAMLへ固定化する（複数日タスクの取りこぼし防止）。
   - ブランチ名にfeature名が含まれないブランチで作業した場合は
     `node .claude/scripts/collect-task-metrics.mjs --feature <feature> --branch <ブランチ部分一致> --task-id <task-id> --write`
     で対象ブランチを明示して再実行する。
   - 意味的な値（quality/processの手戻り・4軸レビュー指摘・ユーザー修正数）は自動化対象外。
     タスク完了時に、このセッションがpacketとauditから埋める（不明値はunknownのまま）。
   - `review.active_time_bucket/confidence/full_diff_opened`だけは人間の任意回答。計時や回答を
     完了条件にせず、未回答を推測しない。
2. **振り返り**（L2/L3で、ユーザーが頼んだとき）: `reflect-task`スキルをこのセッションで読み、
   candidateを作成する。改善サイクルが休眠のあいだ、およびL0/L1はスキップする。
3. **引き渡しpacket確認**（人間マージ判断へ渡すL2/L3）:
   `docs/reviews/<feature>.md`をstructured packetで作ったときだけ
   （`review-readiness`は`AGENTS.md`で休眠）
   `node .claude/scripts/review-readiness.mjs handoff-check --feature <feature> --base origin/main`
   を実行する。失敗時はメトリクス記録自体は続けてよいが、完了報告では
   「人間レビュー待ち」と書かず持ち越しにする（正典: close-session手順5）。

## 完了条件

- L2/L3タスクでメトリクス・振り返りを飛ばしていない（飛ばした場合は理由を報告に明記）。
- メトリクスYAMLの`machine:`セクションが当セッション分まで反映されている。
- 人間引き渡し対象featureでは`handoff-check`成功、または未充足を報告に明記。
