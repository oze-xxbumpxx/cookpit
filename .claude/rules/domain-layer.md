# ルール: Domain 層

適用範囲: `packages/domain/`、および集約をまたぐ操作の設計・実装。

出典: `docs/03-architecture.md` / `docs/04-domain-model.md` / CLAUDE.md。詳細はそちらが正典。

## 依存方向

```
Presentation → Application → Domain ← Infrastructure
```

- `packages/domain` は他のパッケージに依存しない。これが Clean Architecture の核。
- Domain 層に ORM（Drizzle）や HTTP の型を持ち込まない。

## ドメインモデルのパターン

- Entity の生成は必ず `static create()` を通す（ID 採番・初期化ロジックを含む）。
- DB からの復元は必ず `static reconstruct()` を通す（初期化ロジックを通さない）。
- ドメインロジック（バリデーション・状態遷移）は Entity / Value Object に閉じ込める。
  UseCase や Repository に書かない。
- DB スキーマ形 ⇔ ドメインモデル形 の変換責任は **Repository 実装**が持つ。
  Domain 層は DB の形を知らない。

## 集約間の参照

- 集約をまたぐ参照は **ID 参照のみ**。集約のインスタンスを別集約に持たせない。
- 集約をまたぐ操作は Application 層の UseCase に置く。

## UseCase（Application 層）

- 1 ユースケース = 1 クラス・`execute()` メソッドのみ。
- DI は手動 DI（コンストラクタ注入）。DI コンテナは導入しない（MVP1 の間）。
- エラーハンドリングは UseCase の入口（ドメイン境界）で行い、内部では例外をそのまま投げる。
