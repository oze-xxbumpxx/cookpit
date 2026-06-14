---
name: reflect-task
description: >
  タスク完了後の振り返りを行い、再利用可能な知見と改善候補を抽出する手順とチェックリスト。
  reflection-agent が docs/claude-code/improvements/candidates/<task-id>.md を作成するときに使う。
---

# タスク振り返りスキル

reflection-agent がタスク完了後の振り返りを行い、Memory 候補・改善候補を抽出する手順。
**設定ファイルは変更しない。** 出力は `docs/claude-code/improvements/candidates/<task-id>.md`。
正典は [improvement-cycle.md](../../../docs/claude-code/improvement-cycle.md) と
[memory-policy.md](../../../docs/claude-code/memory-policy.md)。

## 入力

- `.claude/state/subagent-log.jsonl`（SubagentStop の記録）
- 成果物（`docs/designs/` `docs/implementation-plans/` `docs/tests/` `docs/reviews/`）
- 会話上のユーザー修正・差し戻し・Reviewer 指摘

## チェックリスト（各項目を「事象 / 回数 / 対象タスク / 原因仮説」で記録）

- [ ] 何がうまくいったか（再現したい成功手順）
- [ ] 何が失敗したか
- [ ] 手戻り（やり直し・前提のひっくり返り）
- [ ] 要件見落とし
- [ ] 設計変更（途中での方針転換）
- [ ] テスト失敗（仕様誤解 / 実装漏れ / 環境）
- [ ] Reviewer 指摘（重大度・種類・再発性）
- [ ] ユーザー訂正（同じ訂正が何回目か）
- [ ] Agent 間の認識不一致
- [ ] 重複作業・不要な Agent 呼び出し・トークン浪費
- [ ] 再利用可能な知見 / 一時的（検証中）な知見の区別

## 昇格判定

各知見について、[memory-policy.md](../../../docs/claude-code/memory-policy.md) の昇格条件
（同問題 3 回 / 同訂正 2 回 / 同種重大指摘複数 / 重大不具合 / 複数 Agent の認識不足 /
継続的浪費 / 成功パターンの複数再現）を満たすか判定する。

- 満たす → 改善候補として candidate に起票し、`improvement-backlog.md` に 1 行追記。
- 満たさない → 「Memory 留め（昇格せず）」と明記し、再発監視のため backlog の留め置き表へ。

## 出力

`docs/claude-code/improvements/candidates/<task-id>.md`（雛形は
`docs/claude-code/improvements/candidates/_TEMPLATE.md`）。各候補に観測事象・発生回数・
対象タスク・原因仮説・改善案・変更対象・想定副作用・評価方法を含める。

## 禁止事項

- CLAUDE.md / Agent 定義 / Skill / Rule / Hook / settings.json の変更（提案は candidate に書くだけ）。
- 単発事象を恒久ルール化すべきと結論すること（昇格判断は条件に委ねる）。
