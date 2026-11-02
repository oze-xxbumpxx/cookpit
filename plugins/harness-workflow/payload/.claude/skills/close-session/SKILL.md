---
name: close-session
description: >
  セッション終了時のメタ作業（品質ゲート・所要時間の自動推定・日次ログ・コミット & プッシュ）
  を一括で行う手順。ユーザーが「今日は終わり」「締めて」「クローズして」と言ったとき、
  または成果報告の直前に使う。kickoff-sessionと対になる。
---

# セッション終了スキル

終了時に毎回発生するメタ作業（ゲート・ログ・コミット）を1コマンドに集約するスキル。
個別Skill（write-work-log）の置き換えではなく、正しい順序で漏れなく呼ぶための
チェックリスト付きラッパー。

メトリクス記録と振り返りは`record-metrics-and-reflect` Skillへ分離している
（層マニフェスト: このスキルは`harness-workflow`、あちらは`harness-improvement`）。
改善サイクルを運用していないプロジェクトでも本スキルだけで終了作業が完結する。

## 発動条件

- 作業セッションを終えるとき（成果報告の直前）。
- ユーザーが「締めて」「今日は終わり」「クローズして」と依頼したとき。
- 使わない場面: タスク途中の一時中断（コミットだけして良い。ログはセッション終了時に書く）。

## 手順

1. **品質ゲート**: コード（`apps/` / `packages/`）を変更したセッションなら
   `bash .claude/scripts/run-quality-gates.sh`を実行する。ドキュメント・`.claude/`のみの
   変更ならスキップしてよい（スキップした場合はログにその旨を書く）。
2. **所要時間の自動推定**: `node .claude/scripts/estimate-session-time.mjs`を実行する。
   - 出力をそのままログの「所要時間」欄に貼る。**推定すら出ない場合のみ**
     「記録なし（推定不能: 理由）」と書く。理由なしの「記録なし」は書かない。
   - 入力は活動ログ（`record-activity` Hookが有効な場合）と当日コミット。Hook未承認の
     環境でもコミットがあれば動く。
3. **日次ログ**: write-work-log Skillの手順で`logs/YYYY-MM-DD.md`を作成・追記する。
   kickoff-sessionで雛形を作っていれば残りの節を埋める。
3a. `harness-devin`を入れているときだけ、進行中の委譲を`node .claude/scripts/delegation.mjs status`で確かめる。起動結果不明のセッションは`devin list`とログで確かめ、自動で起動し直さない。

   **委譲の記録**（DevinのPRをレビューしたときだけ）: `node .claude/scripts/delegation.mjs status`で「PRがマージ／クローズされた」と
   出た委譲に`node .claude/scripts/delegation.mjs finalize <Issue>`（IssueなしPRは`pr-<n>`）を実行し、finalizeした記録
   （`outcome`がmerged / closed）を手順6のコミットに含める。進行中の記録はコミットしない（写しで次のセッションに引き継ぐ。
   写しが残らないクラウドのセッションでは進行中の記録もコミットする。理由は`review-devin-pr`の「完了」）。
   `status`に未起票の昇格候補が出たら、ログの「気づき・メモ」に書く。
   - Devinは`logs/`を編集しない（`devin-workflow` §5）。ログの「AIツール活用記録」に、委譲ごとに
     `Devin: Issue #<n>（PR #<m>）<依頼の要約>。<結果（マージ / round n で手直し / クローズ）>`を1行書く
     （IssueなしPRは`Devin: PR #<m> <要約>`）。題と結果は記録から、検証結果などはPRの説明から取る。
4. **メトリクス・振り返り**（L2/L3のみ）: `record-metrics-and-reflect` Skillが
   利用可能なら実行する（改善サイクルを運用しているプロジェクト）。
   - **利用できない環境ではスキップし、ログにスキップした旨を書く。** セッション終了作業を
     メトリクスの都合で止めない（出典: cookpit/harness-plugin-split要件E-02）。
   - L0/L1はそもそも対象外（過剰工程にしない）。
5. **レビュー引き渡しゲート**（L2/L3のみ）: `review-readiness`は`AGENTS.md`で休眠のため、
   `.claude/state/current-feature`のfeatureで`docs/reviews/<feature>.md`をstructured packetで
   作ったときだけ
   `node .claude/scripts/review-readiness.mjs handoff-check --feature <feature> --base origin/main`
   を実行し、exit 0を確認する。packetを作っていないL2/L3は、レビュー指摘と検証結果がPRと
   日次ログにあることを確かめてスキップする。
   - 失敗したら「人間レビュー待ち / PR準備完了」とは報告せず、packet生成または指摘解消を
     持ち越し（次回やること）へ書く。legacyのままcloseしてマージ判断へ渡さない。
   - L0/L1はスキップする。
6. **コミット & プッシュ**: 指定の作業ブランチへコミットし`git push -u origin <branch>`する
   （CLAUDE.mdの行動制約どおり、作業ブランチへは事前承認不要。構成ファイル
   （CLAUDE.md / agents / hooks / skills / rules / settings.json）を含む変更は、
   PRレビューで重点確認する対象であることをコミットメッセージと報告に明記する）。
   - **強制終了が近い・usageが逼迫しているとき**: フェーズ境界のチェックポイントコミットを
     先にリモートへ出し、「次回やること」を残工程が機械判別できる粒度で書く
     （次セッションの復旧チェックリスト — development-workflow.md §セッション跨ぎの復旧）。
7. **最終報告**: やったこと・ゲート結果・所要時間・持ち越し（次回やること）を要約して
   ユーザーへ報告する。手順5を通した場合はhandoff-checkの結果（または持ち越し理由）を含める。

## 完了条件

- ログの全節が非空で、「所要時間」が推定値または理由つき「記録なし」になっている。
- 「次回やること」が、次セッションのkickoff-sessionがそのまま拾える具体性を持つ。
- 未プッシュのコミットが残っていない（エフェメラル環境では成果消失に直結するため必須）。
- L2/L3タスクで手順4を飛ばした場合、その理由を報告に明記している
  （`record-metrics-and-reflect`を持たない環境なら「improvement層なし」と書く）。
  メトリクス・振り返り自体の完了条件はあちらのSkillが持つ。
- 手順5の対象featureでは`handoff-check`が成功している。失敗したまま
  「人間レビュー待ち」と報告していない。
