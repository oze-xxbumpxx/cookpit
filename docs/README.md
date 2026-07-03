# 献立・買い物・在庫管理アプリ

毎週の作り置き運用を支える、2人で使う Web アプリ。

## ドキュメント構成

| ファイル                                           | 内容                                               |
| -------------------------------------------------- | -------------------------------------------------- |
| [01-overview.md](./01-overview.md)                 | プロジェクト目的・対象ユーザー・スコープ           |
| [02-tech-stack.md](./02-tech-stack.md)             | 技術スタックと選定理由                             |
| [03-architecture.md](./03-architecture.md)         | アーキテクチャ・ディレクトリ構成                   |
| [04-domain-model.md](./04-domain-model.md)         | ドメインモデル設計                                 |
| [05-roadmap.md](./05-roadmap.md)                   | スプリント計画・ロードマップ                       |
| [06-ai-tools.md](./06-ai-tools.md)                 | AI ツール活用方針                                  |
| [07-dev-rules.md](./07-dev-rules.md)               | 開発ルール（ブランチ戦略・レビュー・コミット規約） |
| [08-prompt-templates.md](./08-prompt-templates.md) | AI ツールへの定型プロンプトテンプレート            |
| [decisions/](./decisions/)                         | feature 起点の ADR（ADR-0005〜。001〜004 は本ディレクトリ直下） |

## クイックスタート

開発開始前の方は、以下の順で読むのがおすすめです。

1. `01-overview.md` で全体像を掴む
2. `02-tech-stack.md` で技術構成を把握
3. `03-architecture.md` でディレクトリ構成と層分けを確認
4. `04-domain-model.md` でドメインモデルを理解
5. `05-roadmap.md` で着手するスプリントを確認

## ADR (Architecture Decision Records)

主要な意思決定の経緯を記録しています（ADR-001〜004 はこのディレクトリ直下、
ADR-0005 以降の feature 起点の決定は `decisions/` に置く）。「なぜこの選択をしたか」が
必要になった時に参照してください。

- [ADR-001: Web アプリで実装する](./001-web-not-native.md)
- [ADR-002: Next.js 内に Hono をマウントする](./002-nextjs-hono-mounted.md)
- [ADR-003: MVP1 は認証なしで運用する](./003-no-auth-in-mvp1.md)
- [ADR-004: ドメインから User 集約を外す](./004-no-user-in-domain.md)
