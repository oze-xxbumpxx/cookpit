---
name: improve-harness
description: >
  ハーネス（スキル、フック、エージェント定義、CLAUDE.md）の改善を、振り返りと評価ケースで進める。
  ユーザーが改善サイクル、回帰評価、ハーネスの棚卸しを頼んだときだけ使う。
  機能実装の毎タスクでは使わない。
---

# ハーネスの改善をこのセッションで進める

`reflection-agent`、`agent-improvement-manager`、`agent-evaluator`は起動しない。手順の詳細は[improvement-cycle.md](../../../docs/claude-code/improvement-cycle.md)。記録の置き場は[improvements/README.md](../../../docs/claude-code/improvements/README.md)。

`AGENTS.md`で改善サイクルが休眠のあいだは、ユーザーが頼んだときだけ実行する。

## 手順

1. 単発の失敗で定義を変えない。繰り返しなら候補、検証できたらスキルかフックへ移す。
2. 振り返りが必要なら[reflect-task](../reflect-task/SKILL.md)を読み、`docs/claude-code/improvements/candidates/<task-id>.md`を書く。設定ファイルは変えない。
3. 複数タスクを横断するときは、提案を`docs/claude-code/improvements/proposals/`に書く。重要な設定は提案にとどめ、PRのレビューで人が決める。
4. 畳んだあとのルーティングは[folded-loop-checklist.md](../../evals/folded-loop-checklist.md)で見る。古い`.claude/evals/cases/`は配布元向けで休眠。採点の軸は[scoring-rubric.md](../../evals/rubrics/scoring-rubric.md)。
5. 採用前に、期待するスキルかフックが変わっていないかを一覧で照合する。1件でも壊れるなら採用しない。役をスキルへ移す変更では、同じ一覧の「成果物まで確かめる比較」も行う。入口だけの確認と、承認・実装・レビューまで通した結果を分け、未実行を成功と扱わない。
6. スキルの重複や死んだ指示を整理する依頼なら[audit-skills](../audit-skills/SKILL.md)を読む。
