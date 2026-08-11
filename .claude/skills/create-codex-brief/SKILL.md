---
name: create-codex-brief
description: >
  確定済みの設計書・実装計画から、Codex へ委譲するための自己完結な実装指示書を
  docs/tasks/codex/<feature>/ に生成する手順とテンプレート。タスク開始時に実装ルートを
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
   推奨案を「確定値」として表にする（実例: `docs/tasks/codex/README.md` の未決事項表）。
2. 実装単位を層ごとに分割する（Domain → Infrastructure → Application → API → UI の依存順。
   実例: `docs/tasks/codex/01〜05`）。1 ファイル = 1 タスク = Codex の 1 セッションが目安。
3. `docs/tasks/codex/<feature>/` に `README.md`（タスク一覧・確定値表・完了条件）と
   `NN-<layer>.md`（各指示書）を下記テンプレートで作成する。確定値表には必ず「モデル」行として
   「**Codex モデル / reasoning effort**: ＿＿＿＿（実装完了時に実際に使った値をこの行に記入し、
   `docs/reviews/<feature>.md` と metrics YAML の codex 欄に同じ値を記録する）」を含める
   （出典: 2026-07-18 ユーザー承認・IMP-2026-025 効果実測の記録経路。
   実例: `docs/tasks/codex/pantry-screens/README.md`）。
4. 各指示書に**必ず**含める（過去の Codex ミス実績への先回り。出典: docs/06-ai-tools.md /
   shopping-list-core 事象 1・4 で初回 FAIL 0 を再現した必須パターン）:
   - アーキテクチャ制約の抜粋（依存方向 / create・reconstruct / any 禁止 /
     default export 禁止※Next.js page/layout 等は例外・正典は coding-standards.md /
     import type / 値なしは null）
   - 期待するクラス・関数シグネチャ（タイポ照合の基準になる正確な識別子名）
   - **「命名・記法の注意（過去の Codex ミス実績への先回り）」節（必須・空欄不可）**:
     直近の `docs/claude-code/improvements/candidates/` と docs/06-ai-tools.md の既知リスク catalog から、
     **この Task で起きうる既知ミス型**を具体的に列挙する（汎用コピペ禁止。feature/層ごとに抽出）。
     例: ルート変数の単複、`'use client'` 要否、三項演算子の向き、`param`+`json` 2 バリデータ、
     名前衝突（同名型の二重定義）など。
   - `'use client'` の要否（UI タスクの場合、ファイルごとに明記）
   - 完了条件（`pnpm lint` / `pnpm type-check` / `pnpm test` 全 green + 機能条件）
5. 指示書にサンプルコードを置く場合は、**サンプル自体を敵対的に一度読む**（catch の捕捉範囲・
   エラーパスの前提・Zod 境界がサンプルどおりか）。指示書由来のバグは Codex が忠実にコピーする
   （出典: shopping-list-core 事象 2）。疑わしければサンプルを短くするか、境界を厳守事項に書く。
   5b. **完成コードの同梱は層で使い分ける**（出典: pantry-core 事象 3・4 の層別示唆）:
   - Domain / Infrastructure（ボイラープレート色が強い層）: 完成コードを同梱してよい
     （3 タスク連続で識別子・配線ミス 0 の実証あり）。
   - Application / Presentation（ロジックが絡む層）: 公開シグネチャ + 不変条件/落とし穴 +
     テスト観点 + **公開識別子一覧（タイポ照合基準・必須）**を主とし、メソッド本体の完成コード
     貼付は最小化する（サンプル自体の潜在バグが Application 層で 2 回発生。事象 3）。
6. 生成後、指示書を docs/06-ai-tools.md「Codex 実装の既知リスク catalog」のうち
   この Task に該当する観点でセルフチェックする（汎用の全項目走査はしない）。
7. ユーザーへ「Codex への貼り付け手順」（playbook のコピペプロンプト）と、実装完了後の
   レビュー手順（`review-codex-implementation` + `docs/reviews/<feature>.md` 追記）を提示して引き渡す。

## 指示書テンプレート（NN-<layer>.md）

```markdown
# Task N: <層> — <feature> の<何>を実装

## 概要

<1〜3 行。参照すべき既存パターンのファイルパスを必ず入れる>

## アーキテクチャ制約

<coding-standards / domain-layer から該当項目を抜粋。リンクではなく本文転記>

## 実装対象ファイル

<ファイルパスごとに、期待するシグネチャをコードブロックで明示>

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- <この Task 固有の既知ミス型 1（具体的な正しい綴り・向き・要否）>
- <この Task 固有の既知ミス型 2>
- （該当が無い場合でも「本 Task で注意すべき既知ミス型: なし（理由）」と明記。節自体は削除しない）

## テスト

<各 workspace の `tests/` に置くテストファイル名。`src/` の構造をミラーし、対象パッケージの
vitest `include` に合う拡張子にする（apps/web 例: `*.node.test.ts` / `*.dom.test.ts` /
`*.test.tsx`。素の `*.test.ts` は server 配下以外では silent skip になる）>

## 完了条件

- [ ] pnpm lint / pnpm type-check / pnpm test 全 green
- [ ] <機能条件>
```

## 完了条件

- `docs/tasks/codex/<feature>/README.md` と全指示書が存在し、未決事項が確定値表になっている。
- 各指示書が自己完結している（プロジェクト文脈なしで実装可能か、の観点で読み直した）。
- 各指示書に「命名・記法の注意（過去の Codex ミス実績への先回り）」節がある（空欄・削除なし）。
- レビュー計画（チェックリスト適用 + `docs/reviews/` 追記 + 実画面確認の要否）をユーザーに提示済み。
