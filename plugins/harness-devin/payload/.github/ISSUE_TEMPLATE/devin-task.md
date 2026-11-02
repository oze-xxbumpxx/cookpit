---
name: Devinへの委譲
about: Devinに実装を任せるIssueの定型（Claude Codeはgh issue create --body-fileでこの節の順に書く）
title: '<feat|fix|test|docs>(<範囲>): <やること>'
labels: []
---

## 目的

<!-- 何を・なぜ。変更レベル（L0〜L3）と、ユーザー承認: 必要 / 不要（L2 / L3は承認済みの設計書を書く）。 -->

## 元のPR（後続のときだけ）

<!-- 前のPRのレビューの指摘を直すIssueなら、どのPRのどの指摘か。
     委譲の記録は`node .claude/scripts/delegation.mjs init <この Issue> --follow-up-of <前の委譲> …`で作る
     （前の委譲が複数なら、いちばん古いもの）。後続でなければ、この節を消す。 -->

## 読む資料

<!-- 設計書・試験計画（観点ID）・実装計画の手順・既存のコード。 -->

## やること

- [ ]

## テスト

- [ ]

## 既知の指摘（関係する領域のときだけ）

<!-- `.claude/skills/review-devin-pr/SKILL.md`の「既知の指摘」の表から、このIssueの領域の行を写す。
     どの委譲にも効く予防は`devin-workflow`にあるので、ここには書かない。該当が無ければ、この節を消す。 -->

## やらないこと

-

## 完了条件

- `AGENTS.md`の品質コマンド（lint・型チェック・テスト・ビルド）が通る。

## 進め方

`.agents/skills/devin-workflow/SKILL.md`に従う。ブランチは`devin/<内容>-<この Issue の番号>`。PR本文に`Closes #<この Issue の番号>`を書く。
