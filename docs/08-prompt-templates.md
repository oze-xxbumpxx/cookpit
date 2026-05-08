# 08. プロンプトテンプレート

AI ツールへの依頼品質を安定させるための定型フォーマット。

---

## セッション開始テンプレート（Claude Code）

新しいセッションを開始するときに最初に送るプロンプト。

```text
以下のドキュメントを読んだ上で作業をサポートしてください。

- docs/01-overview.md（プロジェクト概要）
- docs/02-tech-stack.md（技術スタック）
- docs/03-architecture.md（アーキテクチャ）
- docs/04-domain-model.md（ドメインモデル）
- docs/07-dev-rules.md（開発ルール）

今日のタスク：[作業内容を記載]
現在の Sprint：[Sprint番号]
```

---

## 設計レビュー依頼テンプレート（Claude Code）

```text
以下の設計をレビューしてください。

## 対象
[集約名 / ユースケース名 / ファイルパス]

## 設計内容
[設計の説明またはコードを貼り付け]

## 確認してほしい観点
- [ ] Clean Architecture の依存方向が守られているか
- [ ] DDD の集約境界が適切か
- [ ] ドメインロジックが正しい層に置かれているか
- [ ] docs/04-domain-model.md の設計方針と整合しているか
- [任意の観点を追加]

## 判断に迷っている点（あれば）
[具体的に記載]
```

---

## 実装依頼テンプレート（Claude Code → Codex）

Claude Code で設計を固めた後、Codex に渡す際のフォーマット。

```text
以下の設計に従って実装してください。
AGENTS.md とそこに記載された docs/ を必ず読んでから着手してください。

## 実装対象
[ファイルパス]

## 実装内容
[Claude Code が決定した設計の詳細]

## 制約
- packages/domain は他パッケージに依存しない
- static create() / static reconstruct() パターンを使う
- any 型禁止、デフォルトエクスポート禁止

## 完了条件
- [ ] [条件1]
- [ ] [条件2]
```

---

## コードレビュー依頼テンプレート（Claude Code）

Codex が実装したコードを Claude Code でレビューする際のフォーマット。

```text
以下のコードをレビューしてください。

## 対象ファイル
[ファイルパス]

## 実装した機能
[機能の説明]

## レビューしてほしい観点
- [ ] Clean Architecture の依存方向が守られているか
- [ ] static create() / static reconstruct() パターンが正しく使われているか
- [ ] 集約境界を越えた参照になっていないか
- [ ] docs/07-dev-rules.md の TypeScript 規約に沿っているか
- [ ] any 型・デフォルトエクスポートが使われていないか

## コード
[コードを貼り付け]
```

---

## 調査依頼テンプレート（Gemini）

```text
以下の技術調査をお願いします。

## 調査対象
[ライブラリ名 / 技術名]

## プロジェクトの前提
- Next.js 16 (App Router) + Hono + Drizzle ORM + Neon (PostgreSQL)
- Clean Architecture + DDD 構成
- Vercel + Neon 無料枠で運用

## 知りたいこと
[具体的な質問]

## 判断に使いたい用途
[調査結果をどの判断に使うか]
```

---

## ライブラリ検索テンプレート（Perplexity）

```text
[ライブラリ名] の以下について教えてください（2025年時点の最新情報で）。

- 最新バージョンと主な breaking changes
- [具体的に知りたいこと]
- Next.js 16 / Hono との組み合わせで注意すべき点（あれば）
```
