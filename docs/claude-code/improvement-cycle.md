# 改善サイクル（半自動型 Agent 改善）

タスク実行で得た知見を蓄積し、Agent 構成を段階的に改善する仕組みの全体像。保存先分類は
[memory-policy.md](./memory-policy.md)、記録の置き場は
[improvements/README.md](./improvements/README.md) を参照。

## 設計思想（半自動型）

完全自動型にはしない。**候補の収集と評価は自動化**し、**重要な設定変更は Opus（manager）
または人間の承認**を必要とする。理由は memory-policy.md の大前提のとおり：Memory は学習済み
モデルではなく永続コンテキストであり、毎タスクの設定変更は過剰適応を生み、指示の追加だけでは
品質は上がらない（むしろ埋没・競合・トークン増を招く）。

## サイクル（11 ステップ）

1. タスクを実行する（Orchestrator 主導の通常開発フロー）。
2. Reviewer が成果物を評価する。
3. reflection-agent が振り返りを作成する。
4. 再利用可能な知見を Memory 候補として抽出する。
5. 改善候補を `improvements/candidates/<task-id>.md` と backlog へ保存する。
6. 複数タスクの候補を agent-improvement-manager が横断分析する。
7. Agent / Skill / Rule / CLAUDE.md / Hook の変更案（提案書）を作成する。
8. agent-evaluator が過去の代表タスク（`.claude/evals`）で回帰評価する。
9. 改善前後（before / after）の結果を比較する。
10. 承認された変更だけを正式に反映する（`accepted/` へ移動）。
11. 変更理由と評価結果を記録する（proposal・backlog・必要なら CLAUDE.md/Rule のコメント）。

```
[タスク実行] → [Reviewer] → [reflection-agent: candidates] → backlog
        ↓（5タスク / 3件蓄積 / インシデント / 要求 / 設定変更前後）
[manager: 横断分析 → proposals] → [evaluator: 回帰評価] → before/after 比較
        ↓ 承認境界で分岐
   自動反映可 ──→ そのまま適用
   manager後可 ─→ manager 判断で適用（proposal 必須）
   人間承認必須 ─→ 承認待ち → accepted/ へ移動
```

## 登場エージェント

| Agent                     | モデル   | 役割                     | 変更権限                                             |
| ------------------------- | -------- | ------------------------ | ---------------------------------------------------- |
| reflection-agent          | sonnet-5 | 振り返り・候補抽出       | 設定変更不可（candidates のみ Write）                |
| agent-improvement-manager | opus-4-8 | 横断分析・提案・軽微反映 | 重要設定は不可（提案のみ）。軽微は proposal 付きで可 |
| agent-evaluator           | sonnet-5 | 回帰評価                 | 変更不可（evaluations のみ Write）                   |

## 実行タイミング

agent-improvement-manager を起動するのは次のいずれか。**毎タスクは起動しない。**

- 5 タスク完了ごと
- 同種の問題が 3 件蓄積した場合
- 重大インシデント発生時（最優先）
- ユーザーが改善を要求した場合
- Agent 設定を変更する前 / 変更後の回帰評価時

> 短期的事象に過剰適応せず、複数タスクで再現した傾向だけを正式設定へ反映する。
> reflection-agent は毎タスク動いてよい（候補を貯めるだけで設定は変えないため）。

## 計測の原則（セッション内確定 / IMP-2026-019 方針 A）

計測データは**セッション終了前にコミット対象ファイルへ確定する**。リモート（エフェメラル）
環境では `.claude/state/`（subagent-log / activity-log / quality-gates-log）がコンテナ回収と
ともに消えるため、「後からまとめて集計」は構造的に成立しない。

- 転記先の正は `improvements/metrics/<task-id>.yml`。横断集計・振り返り・改善評価の入力は
  **コミット済みの metrics YAML のみ**とする（subagent-log を過去に遡って読む前提を置かない）。
- 転記タイミング: orchestrator は L2/L3 の委譲完了後（L3 では主要委譲の完了ごとでもよい）、
  close-session は毎セッション（feature 未完了でも `machine:` セクションは転記する）。
- 相関の前提 2 件（2026-07-09 実地トライアルで確認）: ①`.claude/state/current-feature` は
  **Sub-agent 委譲より前**に設定されていること（SubagentStop Hook が記録時点の値を読むため）。
  ②リモートの自動命名ブランチ（feature 名を含まない）では
  `collect-task-metrics.mjs --branch <実ブランチ部分一致>` を明示すること。
- **フェーズ比較**: 機械集計の既定はセッション全体。設計フェーズ限定の before/after など
  スコープを揃える比較では、`metrics/<task-id>.yml` の `phases:` を手で埋めるか、
  `machine.totals.agent_calls_by_type` から対象 Agent だけを抜き出す
  （セッション全体と設計フェーズを混同しない。出典: IMP-2026-007 after 計測の申し送り）。

## 承認境界

### 自動実行可能（LLM/自動で完結してよい）

- Auto Memory 候補の整理 / 振り返り作成 / 改善候補作成 / 評価レポート作成
- 重複候補の統合 / フォーマット修正 / リンク切れ修正

### agent-improvement-manager のレビュー後に反映可能（非破壊・軽微）

- Skill のチェック項目追加
- テンプレートの改善
- Agent description の軽微な改善
- 非破壊的な Rules 追加

> これらは proposal に差分を明記したうえで manager が適用してよい。適用後も proposal を残す。

### 人間の承認なしに変更してはいけない

- CLAUDE.md
- Agent の責務 / モデル / ツール権限
- Hook のブロック条件
- 自動実行するシェルコマンド
- セキュリティルール
- 成果物の省略条件
- 本番環境へ影響する設定

> これらは proposal に差分を書くだけにとどめる。`PostToolUse` の `validate-agent-config` Hook
> は、これらの保護ファイルが**未承認で**変更された場合に警告する（構文エラーはブロック）。
> 承認の記録は proposal の「採用または却下理由」と `accepted/` への移動で残す。

## 回帰評価の方法

1. manager が提案ごとに対象 eval ケース（`.claude/evals/cases/*.md`）を選ぶ。
2. agent-evaluator が before（現状）/ after（差分適用後）で同じケースを採点する
   （rubric: `.claude/evals/rubrics/scoring-rubric.md`）。
3. **1 軸でも悪化（スコア低下・劣化指標増・質問/トークン増のみ）があれば採用しない。**
4. 結果を `evaluations/<IMP-...>.md` に残し、proposal の「評価結果」へ反映する。

## ロールバック

- accepted 後に問題が出たら、proposal の「ロールバック方法」に従って対象ファイルを戻す。
- 重要設定（保護ファイル）の変更は単一コミットにまとめ、戻しやすくする。保護ファイルを含む
  コミットは人間承認後に行う（指定の作業ブランチへの通常コミット/push は CLAUDE.md 行動制約に従い可）。
- 誤った Memory は memory-policy.md の「誤った知見の削除手順」で撤回する。

## 想定トークン消費（目安）

| 工程                         | 頻度           | 規模感                                  |
| ---------------------------- | -------------- | --------------------------------------- |
| reflection-agent（候補抽出） | 毎タスク       | 小（成果物＋ログを読み 1 ファイル出力） |
| manager（横断分析・提案）    | 5 タスクごと等 | 中（複数候補を読む。opus のため単価高） |
| evaluator（回帰評価）        | 提案ごと       | 中（提案 1 件 × 対象 eval ケース数）    |

コスト方針：reflection は安価な sonnet で毎回回し候補を貯める。高コストな manager(opus) は
トリガー時のみ。evaluator は対象ケースを必要最小限に絞る。指示を増やすほどトークンは増えるため、
**削除・移動を含む改善**でベースのトークンも抑える。
