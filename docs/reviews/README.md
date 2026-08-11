# docs/reviews

feature 単位のレビュー記録（`<feature-name>.md`）を置く。ここは、現在の意思決定表示と詳細な
監査証跡の**単一の正典**であり、PR 本文へ全文を複製しない。

## 1 ファイルの構造

```markdown
# レビュー記録: <feature>

<!-- review-readiness:begin -->
<!-- prettier-ignore-start -->

<!-- review-readiness:state
{ ... schema v1 JSON ... }
-->

## Review handoff

...
<!-- prettier-ignore-end -->
<!-- review-readiness:end -->

## 監査ログ

## Task 1: ...

...
```

- marker 内: 最新 review subject に対する current state と、人間向けの短い packet。
- marker 外: Reviewer の指摘、処置、ゲート、実画面証拠を残す追記型監査ログ。
- Codex 委譲経路では `## Task N` 見出しを維持する。既存の Task coverage checker が照合する。
- marker は 1 組だけ置き、hidden JSON や表示 Markdown を手で別々に直さない。
- Prettier range-ignore は marker 内の契約の一部。削除すると formatter が表示を変えて drift する。

## 人間向け packet の読み方

表示順は固定する。

1. 人間が判断・確認すること（主観・不可逆・未知だけ、最大 3 件）
2. 残余リスク・未確認
3. 振る舞い差分（最大 5 件）
4. claim と evidence の対応
5. 折り畳んだ AI assessment

`human_review_requested` は AI による承認ではなく、人間へ材料を渡せる状態を表す。
`ai_blocked` / `evidence_pending` は引き渡し前、`stale` は保存した subject と現在差分が異なる状態。
最終的なリスク受容とマージ判断は人間が行う。

## 生成と検証

スクリプトは read-only。対象差分を stage した後、assessment JSON を repository 外の一時
ファイルに置いて使う。

```bash
node .claude/scripts/review-readiness.mjs subject --feature <feature> --base <base>
node .claude/scripts/review-readiness.mjs render \
  --feature <feature> --base <base> --assessment <assessment-json>
node .claude/scripts/review-readiness.mjs check --feature <feature> --base <base>
```

`render` の stdout を Orchestrator が marker 間へ挿入する。当該 review 文書だけは digest から
除外されるが、要件・設計・テスト・`.claude`・`.github` を含む他の変更はすべて対象になる。
subject が変わったら packet を再生成する。

## 既存文書と安全限界

- marker のない既存文書は legacy 監査ログとして保持し、一括変換しない。次に触る feature から
  current packet を追加する。
- digest は「この差分に対する記録」であることを検出する仕組みで、レビュー品質や Claude 実行、
  悪意ある改ざんを証明しない。branch protection と人間のマージ判断を置き換えない。
- 初期 CI は warning-only。blocking 化は試行実績とユーザー承認を要する別タスクとする。

schema、review tier、digest、移行条件の正典は
[`review-readiness` 設計](../designs/review-readiness.md) と
[`ADR-0017`](../decisions/ADR-0017-review-readiness-as-decision-interface.md)。
