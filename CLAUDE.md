# CLAUDE.md

Claude Code がこのプロジェクトで守るべきルールを定義する。

## セッション開始時

新しいセッションを開始したら、作業前に以下を必ず読み込むこと。

- `docs/01-overview.md`
- `docs/02-tech-stack.md`
- `docs/03-architecture.md`
- `docs/04-domain-model.md`
- `docs/07-dev-rules.md`

前回の作業内容は `logs/` の最新ファイルを確認して把握すること。
定型の依頼フォーマットは `docs/08-prompt-templates.md` を参照すること。

## 基本姿勢

- このプロジェクトは Clean Architecture + DDD を採用している。設計方針の詳細は `docs/` を参照すること。
- 実装より設計を優先する。「動くが設計方針から外れたコード」は書かない。

## 行動制約

### ファイル操作

- **新規ファイルの作成・既存ファイルの削除は、必ず事前に確認を取ること。**
- 複数ファイルにまたがる変更を行う場合は、変更範囲を先に提示してから実施する。

### 設計判断

- 設計判断（アーキテクチャ・ドメインモデル・DB スキーマ）は**提案にとどめる。**
- 合意が取れた後に初めて実装に移る。「提案 → 確認 → 実装」の順を守る。

### スコープ

- 依頼されたスコープ外のリファクタリング・改善は行わない。
- 依頼範囲外で気になる点があれば、実施するのではなく**コメントとして伝える。**

### Git 操作

- `git commit` / `git push` は明示的な指示があるまで実行しない。
- ブランチ作成・削除も事前確認を必須とする。

## アーキテクチャ原則（実装時に必ず守ること）

### 依存方向

```
Presentation → Application → Domain ← Infrastructure
```

- `packages/domain` は他のパッケージに依存しない。
- Domain 層に ORM（Drizzle）や HTTP の型を持ち込まない。

### ドメインモデルのパターン

- Entity の生成は必ず `static create()` を通す。
- DB からの復元は必ず `static reconstruct()` を通す。
- ドメインロジック（バリデーション・状態遷移）は Entity / Value Object に閉じ込める。

### 集約間の参照

- 集約をまたぐ参照は **ID 参照のみ**。集約のインスタンスを別集約に持たせない。
- 集約をまたぐ操作は Application Layer の UseCase に置く。

### UseCase

- UseCase は 1 ユースケース = 1 クラス・`execute()` メソッドのみ。
- DI は手動 DI（コンストラクタ注入）で行う。DI コンテナは導入しない（MVP1 の間）。

## コーディング規約

- コメントは「なぜ（Why）」が非自明な場合のみ書く。「何をしているか（What）」はコメントしない。
- 型は明示する。`any` は使用禁止。
- エラーハンドリングはドメイン境界（UseCase の入口）で行い、内部では例外をそのまま投げる。

## 参照ドキュメント

| ドキュメント                                       | 内容                             |
| -------------------------------------------------- | -------------------------------- |
| [docs/01-overview.md](docs/01-overview.md)         | プロジェクト概要・スコープ       |
| [docs/02-tech-stack.md](docs/02-tech-stack.md)     | 技術スタック・選定理由           |
| [docs/03-architecture.md](docs/03-architecture.md) | アーキテクチャ・ディレクトリ構成 |
| [docs/04-domain-model.md](docs/04-domain-model.md) | ドメインモデル設計               |
| [docs/05-roadmap.md](docs/05-roadmap.md)           | スプリント計画                   |
| [docs/06-ai-tools.md](docs/06-ai-tools.md)         | AI ツール活用方針                |
| [docs/07-dev-rules.md](docs/07-dev-rules.md)       | 開発ルール                       |
