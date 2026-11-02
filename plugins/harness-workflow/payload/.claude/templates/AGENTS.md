# <プロダクト名>開発ルール

Claude Code（とDevin）は、このリポジトリの同じルール・成果物を利用する。

<!-- harness-workflowのひな形。導入後に<>の欄を埋め、使わない節を消す。スキルは「作業分担」「休眠」の節を参照する。 -->

## 現在の状態

- <何を作っているか。どこまでできているか>
- 採用スタック: <未決定なら「未決定」と書く>
- スタック固有の規約は、採用済み技術にだけ適用する。存在しない設計書・コマンド・レビュー結果をあるものとして扱わない。
- 品質コマンド: <lint / type-check / test / build。無いものは書かない>。ハーネスの`run-quality-gates.sh`はロックファイルからパッケージマネージャーを選び、実在するものだけを実行する。

## 現在有効なハーネス機能 / 休眠

**現行（今すぐ使う）**

- 作業分担、変更レベル分類、日次ログ、危険操作ガード、実在する品質コマンド、ハーネス試験（日常は`bash .claude/scripts/run-quality-gates.sh`。全件は`node --test .claude/tests/*.test.mjs`）。
- 機能の進め方は`develop-feature`スキル。畳んだあとに正しいスキルへ届くかの確認一覧は`.claude/evals/folded-loop-checklist.md`。

**休眠（アプリのL2 / L3が複数回回るまで必須にしない）**

- `review-readiness` / Gate B / structured packetのhard stop（`docs/reviews/README.md`は未作成）。
- 改善サイクル（振り返り、横断の提案、回帰評価）。手順は`reflect-task`と`improve-harness`。ユーザーが頼むまで必須にしない。`.claude/evals/cases/`は配布元向けのまま使わない。

## 作業分担（AI駆動開発）

AIが実装し、ユーザーは要件提示・設計判断・レビュー・マージを担う。

- 既定でAIが設計案の提示から実装・テスト・PR作成まで、このセッションの一つのループで行う。設計・計画・実装はスキルを読んで進め、子エージェントに分けない。検証（`reviewer`、条件を満たすとき`security-reviewer`）と広い探索（`Explore`）だけ別の文脈に渡す。手順は`develop-feature`スキル。
- L2 / L3では設計書（`docs/designs/`）をユーザーが承認してから実装に入る。L0 / L1は承認なしで進める。
- 誰も求めていない珍しいケースや将来のケースのために設計しない。
- L2 / L3の問いと答え・選ばなかった理由は`docs/discussions/<機能名>.md`（論点の記録）に、工程の状態は`<機能名>.progress.json`に残す（`docs/discussions/README.md`）。Claude Codeは問いと設計の承認依頼を、確認のページ（claude.aiの非公開のページ）で出す。
- 技術スタック・アーキテクチャなどADR級の決定はAIが候補と比較を示し、決定はユーザーが行う。
- `main`へ直接コミットしない。変更は作業ブランチ → PR。破壊的操作（履歴改変・データ削除・本番操作）は事前確認する。
- 実装完了の報告には「何を・なぜそう設計したか・別解との比較」を含める。L2 / L3は必須、L1は3行以内の要約、L0は省略する。
- ユーザーへの説明では、段階の番号・試験の観点IDだけで物事を指さない。プロジェクトの用語で書き、番号は必要なら括弧で添える。

人が止まって判断するゲートは次のとおり。AIはゲートの手前まで進めてよい。

| ゲート | いつ | 誰が決めるか |
| --- | --- | --- |
| L2 / L3の設計承認 | 実装開始前 | ユーザー |
| ADR級の決定（スタック・アーキテクチャ・後方互換） | 採用前 | ユーザー（AIは比較まで） |
| PRのマージ | 品質確認後 | ユーザー |
| 破壊的操作 | 実行前 | ユーザー |

## 作業の進め方

1. 作業開始時に`git status`と`logs/`の最新ログを読み、実装済み・未完了を確認する。
2. `.claude/skills/classify-change/SKILL.md`で変更規模を判断する。判定結果に **ユーザー承認: 必要 / 不要** を含める。L2 / L3の要件定義書・設計書は、書く前に`.claude/skills/ask-questions/SKILL.md`の手順で問いを出し、答えを受けてから書く。
3. 小さな修正は直接進める。ユーザーが既に依頼した範囲で再承認を求めない。
4. 品質コマンドは実在するものだけ実行し、未導入のゲートは`unknown`と報告する。
5. 人が読む文章（報告・ログ・docs・Issue・PR・コメント）は`.claude/rules/writing-style.md`の書き方にする。
6. 終了時は変更・検証・未完了事項を`logs/YYYY-MM-DD.md`に記録する。
7. ハーネス構成（`.claude/` / `.agents/` / `AGENTS.md`）の変更はPRで重点レビューする。

## ツールごとの入口

- Claude Code: `CLAUDE.md`、`.claude/skills/`、検証用の`.claude/agents/`（`reviewer`と`security-reviewer`）、`.claude/settings.json`のフックを使う。ハーネスの状態を扱うコマンドをClaude Codeの外で実行するときは、settingsの`env.HARNESS_NAMESPACE`と同じ値を付ける。
<!-- harness-devinを入れたときだけ残す -->
- Devin: 本ファイルと`.agents/skills/devin-workflow/SKILL.md`を使う。担当はIssue起点のL0 / L1とPRのレビューへの対応。L2 / L3は設計承認後だけ。ブランチは`devin/<内容>`。Claude Codeのフックは動かないため、本ファイルのブランチ運用と破壊的操作の事前確認を守る。
- Devinへの委譲とDevinのPRのレビューは`.claude/skills/review-devin-pr/SKILL.md`。マージ判断をユーザーへ渡す前に、現在headの完全SHAに対するClaudeの完了のコメントを確かめる。マージはユーザーが行う。
