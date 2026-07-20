# 凍結: Orchestration の stop/resume 機構と既知の制約（詳細版）

> **凍結文書（2026-07-20 / IMP-2026-028）**。orchestration-policy.md から移動。
> 多段 background 委譲と `inflight-agents.json` 運用は、2026-07 時点のハーネス挙動
> （子エージェントの通知配送・background 強制・isolation 未継承）への補強として設計されたが、
> 「成果物なし完了」が累計 3 系統（store-master / meal-plan-screens / pantry-screens）で
> 反復したため凍結した。現行の正典は orchestration-policy.md §再開時の完了判定（1 原則）。
>
> **復元条件**: ハーネス側で子エージェントへの通知配送・isolation 継承が改善され、
> 多段 background 委譲を再評価する場合に本文書から orchestration-policy.md へ戻す。
> ロールバック手順は proposals/IMP-2026-028.md を参照。

---

## stop/resume を跨ぐ委譲の扱い（通知非依存）

出典: IMP-2026-008（store-master 事象1・stop/resume 後の Sub-agent notification 待ちループ解消）。

- **適用レベル: L3 のみ**（L1/L2 では `inflight-agents.json` を使わない）。
- **background 委譲時のみ**、その前に `.claude/state/inflight-agents.json` へ
  `{ agent, purpose, expected_outputs[] }` を追記する。単一 Sub-agent の同期委譲では追記しない。
- resume 直後（未処理エントリがある場合のみ）は notification を待たず expected_outputs の
  存在で完了を冪等判定する。stop していない通常フローでは発動しない。
- 単一 Sub-agent への委譲は**同期待機を意図**する（stop を跨ぐ揮発状態を最小化）。ただし
  実行環境によっては `run_in_background: false` を指定しても Agent ツールが常に background
  起動になることがある（後述の既知の制約）。その場合も完了判定は notification に依存せず、
  期待成果物の存在確認（本節・IMP-2026-009）で行う。
- background の**意図的な利用**は、複数 Sub-agent の明示的並列化に限定する。
- **クリアタイミング**: `reflection-agent` 起動時、または feature 完了報告前に空にする。
- **追記責務**: 委譲指示の禁止事項に「`inflight-agents.json` の追記を成果物確定前に行わない」を
  明記し、部分書き込みによる完了誤判定を防ぐ。
- **L1/L2 の単一 Sub-agent 委譲への拡張**（2026-07-03 ドライラン検証で発見）: `inflight-agents.json` は
  L3 background 限定だが、L1/L2 の単一 Sub-agent 委譲でも resume 直後に「直前の委譲が完了したか
  分からない」状況は起こりうる（実測: L2 タスクで architecture-designer が resume 後に二重起動）。
  エントリの有無に関わらず、resume 直後で直前の一手が Sub-agent 委譲だった場合は期待成果物の存在・
  更新時刻を確認してから次を決める（`.claude/agents/orchestrator.md` §進め方 4 参照）。

## 既知の制約: 単一 Sub-agent 委譲でも background 起動になり得る

2026-07-09 meal-plan-screens で観測。orchestration-policy は単一委譲を同期待機意図としているが、
一部環境では Agent ツールが `run_in_background: false` 指定でも常に background 起動になる。
Cookpit の Agent 定義だけでは起動方式を強制できない場合がある。

- **運用**: 完了は notification 待ちではなく、期待成果物の存在・更新で冪等判定する（IMP-2026-009）。
- **計測**: SubagentStop Hook / `current-feature` 事前設定（IMP-2026-019）と組み合わせる。

## 既知の制約: Orchestrator を Agent ツールで子エージェントとして起動した場合

2026-07-03 のドライラン検証（実タスクで改善ループを検証）で観測。本来の起動方法である
`claude --agent orchestrator`（メインセッション）ではなく、Claude Code の `Agent` ツールで
Orchestrator 自体を子エージェントとして起動すると（例: 検証目的の isolation 付き dry run）、
以下の既知の制約がある。

- Orchestrator からさらに委譲した孫 Sub-agent（例: contract-designer）の完了通知が、Orchestrator
  本体ではなく最上位セッションへ直接届くことがある。Orchestrator 自身は完了を認識できない。
- `isolation: worktree` で Orchestrator を分離しても、そこから委譲される孫 Sub-agent のファイル
  I/O には継承されず、実ブランチへ直接書き込まれることがある。

これは Cookpit の Agent 定義ではなく Claude Code 側の子エージェント委譲・通知配送の挙動に起因する。
Orchestrator を本来の起動方法（メインセッション）で使う通常運用では発生しない想定だが、Orchestrator
自体を検証目的で子エージェントとして呼び出す場合はこの制約を踏まえること。全工程を通した生の
Orchestrator ドライランより、既存の `agent-evaluator` による dry run（`.claude/evals/cases` を
使った評価、IMP-2026-006/007 で実績あり）の方が現状は安定した検証手段。

> 2026-07-19 pantry-screens で「成果物なし完了」×2 が再発し、本制約が禁止事項へ昇格した
> （orchestration-policy.md §起動方法）。

## 既知の制約: フォアグラウンド割り込みによるバックグラウンドタスクの停止

2026-07-05 に観測（`logs/2026-07-05.md`）。バックグラウンドで実行中の Orchestrator /
Sub-agent は、ユーザーのフォアグラウンド割り込み操作（Escape 等）で `killed` 状態になる
ことがある。フォアグラウンドの操作だけを中断したつもりでも、紐づくバックグラウンドタスク
ごと停止する。

- 長時間のバックグラウンド委譲中は `TaskOutput`（`block: false`）で時々状態を確認する。
- ユーザーが割り込む可能性がある場面では、委譲を細かい単位に分け、各 Sub-agent の成果物を
  こまめに確定させる（killed 時の損失を最小化）。
- killed になった場合は notification を待たず**成果物の存在で進捗を冪等判定**し
  （上記 stop/resume と同じ扱い）、未完了の工程だけを再委譲する。実績: 2026-07-05 は
  contract/plan/test の成果物が確定済みだったため、implementer 以降のみ Codex 委譲へ切替できた。
