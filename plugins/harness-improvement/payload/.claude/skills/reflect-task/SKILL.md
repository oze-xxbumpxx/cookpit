---
name: reflect-task
description: >
  タスク完了後の振り返りを行い、再利用可能な知見と改善候補を抽出する手順とチェックリスト。
  ユーザーが振り返りを頼んだとき、このセッションで
  docs/claude-code/improvements/candidates/<task-id>.mdを書く。毎タスクでは使わない。
---

# タスク振り返りスキル

タスク完了後の振り返りを、このセッションで行い、Memory候補と改善候補を抽出する手順。
**設定ファイルは変更しない。** 出力は`docs/claude-code/improvements/candidates/<task-id>.md`。
正典は[improvement-cycle.md](../../../docs/claude-code/improvement-cycle.md)と
[memory-policy.md](../../../docs/claude-code/memory-policy.md)。

## 入力

- `.claude/state/subagent-log.jsonl`（SubagentStopの記録）
- 成果物（`docs/designs/` `docs/implementation-plans/` `docs/tests/` `docs/reviews/`）
- 会話上のユーザー修正・差し戻し・Reviewer指摘

## チェックリスト（各項目を「事象 / 回数 / 対象タスク / 原因仮説」で記録）

- [ ] 何がうまくいったか（再現したい成功手順）
- [ ] 何が失敗したか
- [ ] 手戻り（やり直し・前提のひっくり返り）
- [ ] 要件見落とし
- [ ] 設計変更（途中での方針転換）
- [ ] テスト失敗（仕様誤解 / 実装漏れ / 環境）
- [ ] Reviewer指摘（action / impact / evidence / status、誤検出、再発性）
- [ ] ユーザー訂正（同じ訂正が何回目か）
- [ ] Agent間の認識不一致
- [ ] 重複作業・不要なAgent呼び出し・トークン浪費
- [ ] 再利用可能な知見 / 一時的（検証中）な知見の区別

## 昇格判定

各知見について、[memory-policy.md](../../../docs/claude-code/memory-policy.md)の昇格条件
（同問題3回 / 同訂正2回 / 同種重大指摘複数 / 重大不具合 / 複数Agentの認識不足 /
継続的浪費 / 成功パターンの複数再現）を満たすか判定する。

- 満たす → 改善候補としてcandidateに起票し、`improvement-backlog.md`に1行追記。
- 満たさない → 「Memory留め（昇格せず）」と明記し、再発監視のためbacklogの留め置き表へ。

## 出力

`docs/claude-code/improvements/candidates/<task-id>.md`（雛形は
`docs/claude-code/improvements/candidates/_TEMPLATE.md`）。各候補に観測事象・発生回数・
対象タスク・原因仮説・改善案・変更対象・想定副作用・評価方法を含める。

良い例（配布元Cookpitでの実績）: 事象ごとに観測事実と原因仮説を分離し、
昇格判定に理由を明記したcandidateが、proposal → 採用までつながった。

## メトリクス記録（L2/L3）

candidateファイル作成後、タスクのメトリクスを記録する。

1. `bash .claude/scripts/record-task-metrics.sh <task-id> <feature-name> <level>`を実行してテンプレートを生成する（既存なら上書き不要）。
2. 生成された`docs/claude-code/improvements/metrics/<task-id>.yml`に実値を埋める：
   - `agents.calls`：subagent-logから自動補完済みかを確認。未補完ならsubagent-logを数えて記入。
   - `quality.reviewer_block_open/high_impact_unverified/follow_up_open/pre_existing`：
     `docs/reviews/<feature>.md`のcurrent assessmentと監査ログから記入する。
   - `quality.reviewer_critical/major/minor`：過去との比較が必要な場合だけimpact別件数を記入する。
   - `review.handoff_items/rounds/stale_invalidations/verified_findings/false_positive_findings`：
     packetと監査ログから取得できる値だけを記入する。
   - `review.active_time_bucket/confidence/full_diff_opened`：人間が任意で答えた場合だけ記入する。
   - `quality.user_corrections`：会話上のユーザー修正・差し戻し回数。
   - `process.*_rework`：各フェーズの手戻り回数。
   - 判定できない値は`unknown`のまま残す（推測値を入れない）。
   - 横断集計・振り返りの入力は**コミット済みの`metrics/*.yml`を正**とする。
     `.claude/state/subagent-log.jsonl`は同一セッション内でのみ有効で、リモート
     （エフェメラル）環境ではセッションを跨いで残らない（improvement-cycle.md §計測の原則 /
     IMP-2026-019）。同一セッション内で自動補完が働かない値は会話ログから数えて手動記入し、
     判別できない値は`unknown`とする（出典:
     `cookpit/test-infra-expansion`事象4）。

## 禁止事項

- CLAUDE.md / Agent定義 / Skill / Rule / Hook / settings.jsonの変更（提案はcandidateに書くだけ）。
- 単発事象を恒久ルール化すべきと結論すること（昇格判断は条件に委ねる）。
