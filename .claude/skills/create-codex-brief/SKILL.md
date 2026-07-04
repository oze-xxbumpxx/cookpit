---
name: create-codex-brief
description: >
  確定済みの設計書・実装計画から、Codex へ委譲するための自己完結な実装指示書を
  docs/codex-tasks/<feature>/ に生成する手順とテンプレート。タスク開始時に実装ルートを
  「Codex 委譲」と宣言した場合に使う。運用全体は
  docs/claude-code/codex-delegation-playbook.md を参照。
---

# Codex 実装指示書 生成スキル

Codex は別サブスクのため Claude Code の usage を消費しない（最大のコストレバー、
`docs/06-ai-tools.md`）。ただし Codex はプロジェクト文脈を持たないので、指示書の
自己完結性が品質を決める。過去実績（Sprint 1〜2）で反復したミスの型を先回りで潰す。

## 発動条件

- 実装ルートを「Codex 委譲」と宣言したタスクで、設計・実装計画が確定した後。
- 使わない場面: 実装中に設計判断が発生しうるタスク（Orchestrator ルートへ）。
  判断基準は「指示書に書き切れるなら Codex」（docs/06-ai-tools.md）。

## 入力（不足していても止まらない）

必須ではないが、あるほど指示書の質が上がる。**不足があれば不足一覧を提示し、
設計書なしで進めてよいかユーザーに確認してから**、会話文脈と既存コードで補って生成する。

- `docs/designs/<feature>.md`（設計書）
- `docs/implementation-plans/<feature>.md`（実装計画）
- `docs/tests/<feature>.md`（試験計画）
- 参照させる既存実装（例: Recipe 集約のファイルパス）

## 手順

1. 入力ドキュメントを読み、未決事項を洗い出す。未決のまま Codex に渡さない —
   推奨案を「確定値」として表にする（実例: `docs/codex-tasks/README.md` の未決事項表）。
2. 実装単位を層ごとに分割する（Domain → Infrastructure → Application → API → UI の依存順。
   実例: `docs/codex-tasks/01〜05`）。1 ファイル = 1 タスク = Codex の 1 セッションが目安。
3. `docs/codex-tasks/<feature>/` に `README.md`（タスク一覧・確定値表・完了条件）と
   `NN-<layer>.md`（各指示書）を下記テンプレートで作成する。
4. 各指示書に**必ず**含める（過去の Codex ミス実績への先回り。出典: docs/06-ai-tools.md）:
   - アーキテクチャ制約の抜粋（依存方向 / create・reconstruct / any 禁止 / default export 禁止 /
     import type / 値なしは null）
   - 期待するクラス・関数シグネチャ（タイポ照合の基準になる正確な識別子名）
   - 命名の明示（DB テーブルは複数形、など傾向ずれが既知のもの）
   - `'use client'` の要否（UI タスクの場合、ファイルごとに明記）
   - 完了条件（`pnpm lint` / `pnpm type-check` / `pnpm test` 全 green + 機能条件）
5. 生成後、指示書を docs/06-ai-tools.md「Codex 実装のレビューチェックリスト」の観点で
   セルフチェックする（指示書側の曖昧さがミスの温床になるため）。
6. ユーザーへ「Codex への貼り付け手順」（playbook のコピペプロンプト）と、実装完了後の
   レビュー手順（チェックリスト + 実画面確認）を提示して引き渡す。

## 指示書テンプレート（NN-<layer>.md）

```markdown
# Task N: <層> — <feature> の<何>を実装

## 概要

<1〜3 行。参照すべき既存パターンのファイルパスを必ず入れる>

## アーキテクチャ制約

<coding-standards / domain-layer から該当項目を抜粋。リンクではなく本文転記>

## 実装対象ファイル

<ファイルパスごとに、期待するシグネチャをコードブロックで明示>

## 命名・記法の注意

<テーブル複数形・識別子の正確な綴りなど、既知の傾向ずれ>

## テスト

<co-located の \*.test.ts。試験計画から該当ケースを転記>

## 完了条件

- [ ] pnpm lint / pnpm type-check / pnpm test 全 green
- [ ] <機能条件>
```

## 完了条件

- `docs/codex-tasks/<feature>/README.md` と全指示書が存在し、未決事項が確定値表になっている。
- 各指示書が自己完結している（プロジェクト文脈なしで実装可能か、の観点で読み直した）。
- レビュー計画（チェックリスト適用 + 実画面確認の要否）をユーザーに提示済み。
