# AGENTS.md

Codex がこのプロジェクトで作業する際に守るべきルールを定義する。

## 作業開始前に必ず読むこと

実装に着手する前に、以下のドキュメントを必ず読み込むこと。

| ドキュメント                                       | 読む目的                                     |
| -------------------------------------------------- | -------------------------------------------- |
| [docs/01-overview.md](docs/01-overview.md)         | プロジェクトの目的・スコープを把握する       |
| [docs/02-tech-stack.md](docs/02-tech-stack.md)     | 使用技術と選定理由を把握する                 |
| [docs/03-architecture.md](docs/03-architecture.md) | 層構成・ディレクトリ構成・依存方向を把握する |
| [docs/04-domain-model.md](docs/04-domain-model.md) | 集約・Entity・Value Object の設計を把握する  |
| [docs/07-dev-rules.md](docs/07-dev-rules.md)       | コーディング規約・命名規則を把握する         |

実装対象が特定のドメインに限定される場合は、該当集約の設計（`docs/04-domain-model.md` の該当セクション）を重点的に確認すること。

## 基本姿勢

- このプロジェクトは **Clean Architecture + DDD** を採用している。
- 設計判断は Claude Code が行う。Codex は**決定済みの設計に従って実装する**。
- 設計方針が不明な場合は実装を止め、確認を求めること。

## アーキテクチャ原則・コーディング規約

正典は以下の 2 ファイル。実装前に必ず読み、逸脱しないこと（本ファイルには再掲しない）。

- [.claude/rules/domain-layer.md](.claude/rules/domain-layer.md) — 依存方向・`create()`/`reconstruct()`・集約間参照
- [.claude/rules/coding-standards.md](.claude/rules/coding-standards.md) — 型・構文・コメント・エラー処理・品質ゲート

背景・詳細は [docs/03-architecture.md](docs/03-architecture.md) /
[docs/04-domain-model.md](docs/04-domain-model.md) / [docs/07-dev-rules.md](docs/07-dev-rules.md)。

## 実装後のルール

- 実装したコードは必ず Claude Code でレビューを受けてからコミットする。
- スコープ外のリファクタリング・改善は行わない。気になる点はコメントとして伝えるにとどめる。
