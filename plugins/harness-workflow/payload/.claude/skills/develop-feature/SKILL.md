---
name: develop-feature
description: >
  機能の追加・仕様変更・バグ修正を、このセッションの一つのループで進める。
  変更レベルの分類、問い、要件、設計、実装計画、試験計画、実装までを同じ文脈で行い、
  検証だけ reviewer と（条件を満たすとき）security-reviewer に渡す。
  調査だけの質問、文言だけの修正、DevinのPRレビュー、セッションの締めでは使わない。
---

# 機能をこのセッションで進める

設計・計画・実装・試験計画・振り返りを、子エージェントに渡さない。同じ文脈のまま、必要なスキルだけ読む。

役割の一覧は[agent-responsibilities.md](../../../docs/claude-code/agent-responsibilities.md)。検証役を起動する条件と、契約の節を書く条件は[orchestration-policy.md](../../../docs/claude-code/orchestration-policy.md)。完了の定義は[definition-of-done.md](../../../docs/claude-code/definition-of-done.md)。

## 起動してよい子エージェント

- `reviewer`。実装のあと。品質と整合性。コードは直させない。
- `security-reviewer`。orchestration-policyの「必ず起動する」に当たるとき。`reviewer`と並行してよい。
- 広い探索。ファイルを広く探すときだけ。当たった場所と結論だけを持ち帰らせる。起動方法は下の「ツールごとの起動方法」に従う。

`orchestrator`、`architecture-designer`、`implementation-planner`、`test-designer`、`implementer`、`reflection-agent`、`agent-evaluator`、`agent-improvement-manager`は定義が無い。起動しない。

## 手順

1. [classify-change](../classify-change/SKILL.md)でレベルを決める。判定、理由、ユーザー承認の要否、作らない成果物を短く示す。
2. `feature-name`（kebab-case）を決める。L2/L3だけ`.claude/state/current-feature`に1行で書く。続けて`node .claude/scripts/discussion.mjs init <feature-name> --level L2|L3 --title <機能の名前>`を実行する。
3. L0は読んで答える。実装しない。子に渡せるのは広い探索だけ。
4. L1は[implement-change](../implement-change/SKILL.md)を読んで直す。設計書・計画・試験計画は作らない。振る舞いが変わる修正なら`reviewer`を起動する。`security-reviewer`は起動しない。
5. L2/L3はコードを変える前に、次をこのセッションで書く。
   - [ask-questions](../ask-questions/SKILL.md)。優先度が高い問いを出して、答えが来るまで該当の節を書かない。
   - L3は[create-requirements-document](../create-requirements-document/SKILL.md)。
   - [create-design-document](../create-design-document/SKILL.md)。契約が変わる条件はorchestration-policy。外部入出力か大量データを扱うL3は、設計書の性能の節を厚く書く。
   - ユーザーの設計承認を待つ。承認の前にアプリのコードを変えない。
   - [create-implementation-plan](../create-implementation-plan/SKILL.md)と[create-test-plan](../create-test-plan/SKILL.md)。同じ設計を続けて読んでよい。
6. 承認のあと[implement-change](../implement-change/SKILL.md)を読んで実装する。設計と食い違ったら、実装を止めてユーザーに聞く。
7. 実装のあと`reviewer`を起動する。渡すのは目的、範囲、`feature-name`、差分の場所。返ってきた指摘の表を、自分の文脈でコードと突き合わせてから直す。指摘を無条件では採用しない。
8. `security-reviewer`を起動しなかったL2は、省略理由を報告に1行書く。判断に迷うときは起動する。
9. 改善サイクルは`AGENTS.md`で休眠。振り返りはユーザーが頼んだときだけ[reflect-task](../reflect-task/SKILL.md)。
10. 品質コマンドは実在するものだけ。報告の粒度は`AGENTS.md`の作業分担（L2/L3は何を・なぜ・別案、L1は3行、L0は省略）。

## 検証役への渡し方

目的、対象範囲、対象外、参照ファイル、返してほしい形（指摘の表と、見なかった範囲）だけを渡す。設計の全文や調査の経過は貼らない。検証役はコードを直さない。

## ツールごとの起動方法

- Claude Codeは`.claude/agents/reviewer.md`と`security-reviewer.md`の定義を起動し、モデルは各定義の`model`に従う。広い探索は組み込みの`Explore`を`haiku`で起動する。`CLAUDE_CODE_SUBAGENT_MODEL`は設定しない。L3の方針決めではFableへの切り替えを提案してよい。切り替えはユーザーが行う。
- 子エージェント機能が利用できなければ、その制約と自己点検の範囲を報告する。独立レビュー済みとは扱わない。広い検索を検証役にやらせない。
