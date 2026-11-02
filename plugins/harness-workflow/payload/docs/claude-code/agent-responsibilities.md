# エージェントの分け方

2026-10-25に、連鎖していた専門役をメインのセッションへ畳んだ。根拠はAnthropicの「Building agents: When to fold subagents into your main agent loop」。手順は`develop-feature`スキル。検証の起動条件は[orchestration-policy.md](./orchestration-policy.md)。

子エージェントは、別の文脈が要るときだけ残す。問題の種類や役割の名前では分けない。

## 残したもの

| 名前                                         | 役割                                                               | 残した理由                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| reviewer                                     | 実装のあと、品質・整合性・テスト不足を見る。コードは直さない       | 書いた本人の文脈を持たない検証。指示が「直すな」で、実装と衝突する                                       |
| security-reviewer                            | 認証、秘密情報、外部入出力、依存の追加などを見る。コードは直さない | 検証を並行し、使い終わった文脈を捨てる。確認項目が品質レビューと衝突し、毎回メインに載せると文脈が増える |
| 広い探索（Claude Codeでは組み込みのExplore） | 場所と結論だけ返す                                                 | 検索の途中経過はメインに残さなくてよい                                                                   |

定義は`.claude/agents/reviewer.md`と`.claude/agents/security-reviewer.md`。Exploreに定義ファイルは無い。`Agent`ツールを持つプロジェクト内の定義は無い。検証役は互いを起動しない。

起動方法と機能が無い場合の扱いは[develop-feature](../../.claude/skills/develop-feature/SKILL.md#ツールごとの起動方法)に従う。

## スキルに畳んだもの

| 以前の子エージェント      | いま読むスキル                                                            | 畳んだ理由                                                                 |
| ------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| orchestrator              | `develop-feature`、`classify-change`                                      | 振り分け役。計画を書く側と実行する側が分かれると、途中で計画を直せない     |
| architecture-designer     | `ask-questions`、`create-requirements-document`、`create-design-document` | 設計の結果を、計画と実装がすぐ使う                                         |
| implementation-planner    | `create-implementation-plan`                                              | 設計の直後に同じ文書を触る                                                 |
| test-designer             | `create-test-plan`                                                        | 計画と対で、同じ設計を読む                                                 |
| implementer               | `implement-change`                                                        | 設計の理由を持ったまま実装する。編集ツールはメインのセッションが持っている |
| reflection-agent          | `reflect-task`                                                            | 同じタスクの記録を読む後処理。改善サイクルは休眠                           |
| agent-improvement-manager | `improve-harness`                                                         | 休眠の振り分け役。評価役をさらに子に呼んでいた                             |
| agent-evaluator           | `improve-harness`（一覧は`.claude/evals/folded-loop-checklist.md`）       | 休眠。入れ子の採点ループをやめた                                           |

## フックのままにしたもの

文章ではなく、実行時に見る。

| 仕組み                         | 見ていること                                            |
| ------------------------------ | ------------------------------------------------------- |
| `guard-dangerous`              | 破壊的なgit操作、本番相当の操作                         |
| `check-deliverables`           | L2/L3でソースを変えたとき、設計・計画・試験計画があるか |
| `permissions.deny`（settings） | `.env`や秘密鍵の読み書き                                |
| `validate-agent-config`        | エージェント定義とスキルのfrontmatter                   |
| `record-subagent`              | 検証役が動いたことの記録                                |

## 消したもの

上の8つの定義ファイル。中身はスキルと、この一覧と、orchestration-policyに移した。古いevalsの`cases/`は配布元向けのまま残し、休眠とする。
