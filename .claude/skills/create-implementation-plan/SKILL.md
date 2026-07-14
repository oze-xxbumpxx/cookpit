---
name: create-implementation-plan
description: >
  確定設計から実装計画を docs/implementation-plans/<feature-name>.md に作成する手順と
  テンプレート。implementation-planner が使う。各ステップに対象ファイル・変更内容・完了条件を含める。
---

# 実装計画作成スキル

`docs/implementation-plans/<feature-name>.md` を作成する。入力は確定済みの
`docs/designs/<feature-name>.md`。

## 手順

1. 設計書を読み、実装単位（ステップ）へ分解する。
2. リポジトリを Grep/Glob/Read で確認し、変更対象ファイルを**実在するパス**で特定する。
   新規作成ファイルも具体パスで列挙する。
3. 各ステップに「対象ファイル・変更内容・完了条件」を必ず付ける。
4. テスト計画・リスク・ロールバック・ドキュメント更新対象を埋める。
   - **テスト計画のファイル名**は、対象パッケージの vitest `include`（`vitest.config.*` /
     projects）と突き合わせる。apps/web は `*.node.test.ts` / `*.dom.test.ts` /
     `*.test.tsx` / `src/server/**/*.test.ts` のみ。素の `*.test.ts` は silent skip の原因
     （出典: meal-plan-screens 事象 1 / IMP-2026-012 の残穴）。
5. 既存計画があれば更新する（重複作成しない）。

## テンプレート

```markdown
# 実装計画: <feature-name>

- 前提となる設計書: docs/designs/<feature-name>.md
- レベル: L2 | L3

## 変更対象ファイル
（path ごとに、なぜ変えるか）

## 新規作成ファイル
（path ごとに、役割）

## ファイルごとの変更内容
### <path>
- 変更内容:
- 完了条件:

## 実装手順
1. ステップ名 … 対象ファイル / 変更内容 / 完了条件
2. ...

## 依存関係
（ステップ間・パッケージ間の順序制約）

## テスト計画
（追加するテストと配置先。docs/tests/<feature-name>.md と整合させる）

## リスク
## ロールバック方法
## ドキュメント更新対象
（docs/ 恒久ドキュメントや ADR の更新要否。ドメインモデルを変更する場合は
`docs/04-domain-model.md` の該当エンティティ定義が実装と一致するかを必ず確認対象に含める）
```

## 完了条件

- すべてのステップに対象ファイル・変更内容・完了条件が揃っている。
- 変更/新規ファイルのパスが実在のリポジトリ構成と整合している。
- implementer がこの計画だけで実装に着手できる粒度になっている。
- ドメインモデル変更を含む場合、「ドキュメント更新対象」に `docs/04-domain-model.md` の
  整合確認が含まれている（出典: store-master で更新漏れが reviewer Nice-2 指摘になった —
  `docs/reviews/store-master.md` Nice-2 /
  `docs/claude-code/improvements/candidates/store-master.md` 事象 4）。

## 良い例（実タスクの成果物）

- `docs/implementation-plans/store-master.md` — 9 ステップ全てに対象ファイル・変更内容・
  完了条件があり、依存関係グラフと品質ゲート（Step 9）・手動テスト観点まで含む。
  この計画に沿った実装は reviewer の整合性チェック（要件・設計・実装計画・実装）を
  問題なしで通過した（出典: `docs/reviews/store-master.md`「問題なし（確認済み項目）」）。
- `docs/implementation-plans/test-infra-expansion.md` — リスク表（R-1〜R-4）に検出タイミングと
  **回避策の優先順**を明記（例: R-1 型非互換は「まず型キャストを試す → ダメなら中断して
  ユーザー確認」）。未確定挙動（mergeConfig の include 連結）には「実装時に確認せよ」の注記を
  置いた。実装時の判断がすべて「計画に書いてある分岐を選ぶだけ」になり、手戻り・テスト失敗
  ゼロで完走した（出典: `docs/claude-code/improvements/candidates/test-infra-expansion.md`
  事象 1・3）。
