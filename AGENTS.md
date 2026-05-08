# AGENTS.md

Codex がこのプロジェクトで作業する際に守るべきルールを定義する。

## 作業開始前に必ず読むこと

実装に着手する前に、以下のドキュメントを必ず読み込むこと。

| ドキュメント | 読む目的 |
| --- | --- |
| [docs/01-overview.md](docs/01-overview.md) | プロジェクトの目的・スコープを把握する |
| [docs/02-tech-stack.md](docs/02-tech-stack.md) | 使用技術と選定理由を把握する |
| [docs/03-architecture.md](docs/03-architecture.md) | 層構成・ディレクトリ構成・依存方向を把握する |
| [docs/04-domain-model.md](docs/04-domain-model.md) | 集約・Entity・Value Object の設計を把握する |
| [docs/07-dev-rules.md](docs/07-dev-rules.md) | コーディング規約・命名規則を把握する |

実装対象が特定のドメインに限定される場合は、該当集約の設計（`docs/04-domain-model.md` の該当セクション）を重点的に確認すること。

## 基本姿勢

- このプロジェクトは **Clean Architecture + DDD** を採用している。
- 設計判断は Claude Code が行う。Codex は**決定済みの設計に従って実装する**。
- 設計方針が不明な場合は実装を止め、確認を求めること。

## アーキテクチャ原則

### 依存方向

```
Presentation → Application → Domain ← Infrastructure
```

- `packages/domain` は他のパッケージに依存しない。
- Domain 層に Drizzle・HTTP の型を持ち込まない。

### ドメインモデルのパターン

- Entity の生成は必ず `static create()` を通す。
- DB からの復元は必ず `static reconstruct()` を通す。
- ドメインロジックは Entity / Value Object に閉じ込める。UseCase や Repository に書かない。

### 集約間の参照

- 集約をまたぐ参照は **ID 参照のみ**。集約インスタンスを別集約に持たせない。
- 集約をまたぐ操作は Application Layer の UseCase に置く。

## コーディング規約

命名規則・型・インポートの詳細は [docs/07-dev-rules.md](docs/07-dev-rules.md) を参照。

### 要点

- `any` 型は禁止。`unknown` を使う。
- デフォルトエクスポートは禁止。名前付きエクスポートのみ。
- 型のみのインポートは `import type` を使う。
- `===` / `!==` を使う。`==` / `!=` は禁止。
- 「値なし」は `null` に統一する（`undefined` と混在させない）。

## 実装後のルール

- 実装したコードは必ず Claude Code でレビューを受けてからコミットする。
- スコープ外のリファクタリング・改善は行わない。気になる点はコメントとして伝えるにとどめる。
