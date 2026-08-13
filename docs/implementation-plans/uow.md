# 実装計画: uow

- 前提となる設計書: docs/designs/uow.md
- レベル: L3
- 実装ルート: Orchestrator（implementer）
- 判断理由: ドライバ変更・Pool 寿命・トランザクション境界に設計判断が残る（docs/06-ai-tools.md「指示書に書き切れない」側）

## 変更対象ファイル

- `packages/domain/src/index.ts` — `UnitOfWork` を公開
- `packages/infrastructure/src/db/client.ts` — neon-serverless
- `packages/infrastructure/package.json` — `ws` 依存
- `packages/infrastructure/src/index.ts` — `DrizzleUnitOfWork` を公開
- `packages/infrastructure/src/repositories/drizzle-*.repository.ts` — コンストラクタを UoW に
- `packages/infrastructure/tests/repositories/*.test.ts` / `create-test-db.ts` 利用者 — `new DrizzleUnitOfWork(db)`
- `packages/application/src/**/*.use-case.ts`（書き込み） — `UnitOfWork` 注入
- `packages/application/tests/**` — passthrough UoW
- `apps/web/src/server/repositories.ts` — `createWriteContext`
- `apps/web/src/server/routes/*.ts` — 書き込みルートの組み立て
- `docs/03-architecture.md` — DI 節に UoW
- `docs/05-roadmap.md` — Unit B 状態
- `apps/web/src/db/pglite-client.ts` — コメント追随（必要なら）

## 新規作成ファイル

- `packages/domain/src/shared/unit-of-work.ts`
- `packages/infrastructure/src/uow/drizzle-unit-of-work.ts`
- `packages/infrastructure/tests/uow/drizzle-unit-of-work.test.ts`
- `packages/application/tests/shared/passthrough-unit-of-work.ts`
- `docs/requirements/uow.md` / `docs/designs/uow.md` / `docs/implementation-plans/uow.md` / `docs/tests/uow.md` / `docs/decisions/ADR-0019-db-transaction-uow.md`

## ファイルごとの変更内容

### packages/infrastructure/src/db/client.ts

- 変更内容: `Pool` + `drizzle-orm/neon-serverless`。`ws` を WebSocket 実装に。Pool を `globalThis` で `max: 1` 再利用
- 完了条件: `DrizzleClient` が新しい factory の ReturnType。`transaction` を呼べる

### packages/infrastructure/src/uow/drizzle-unit-of-work.ts

- 変更内容: 設計書どおり `client` / `execute`。ネストは throw
- 完了条件: Domain の `UnitOfWork` を実装する

### 各 Drizzle*Repository

- 変更内容: 引数を `DrizzleUnitOfWork` にし、`private get db()` で `uow.client`
- 完了条件: 既存クエリコードの `this.db` 呼び出しがコンパイルできる

### 書き込み UseCase

- 変更内容: 最後の引数に `UnitOfWork`。`execute` → `uow.execute(() => this.run(...))`
- 完了条件: 本体ロジックの差分は包み以外に無い

### apps/web/src/server/repositories.ts

- 変更内容: `createWriteContext()`。既存 factory は UoW ラップに更新
- 完了条件: 書き込みルートが 1 つの context から組み立てられる

## 実装手順

1. Domain ポートとバレル公開 … `unit-of-work.ts` / `index.ts` / 完了: export できる
2. ドライバ + DrizzleUnitOfWork … `client.ts` / `drizzle-unit-of-work.ts` / `ws` / 完了: type-check が通る
3. Repository コンストラクタ … 7 ファイル + テストの `new` / 完了: infrastructure テストがコンパイルできる
4. 書き込み UseCase + passthrough テスト … Application / 完了: application テストが通る
5. Presentation 組み立て … `repositories.ts` + 書き込みルート / 完了: web type-check
6. PGlite ロールバック試験 … `tests/uow/drizzle-unit-of-work.test.ts` / 完了: E-1 相当が red にならない
7. 恒久ドキュメント … architecture / roadmap / 関連設計書の R-3 注記
8. 品質ゲート … lint / type-check / test

## 依存関係

1 → 2 → 3 → 4 と 6（3 の後）→ 5（4 の後）→ 7 → 8

## テスト計画

`docs/tests/uow.md` と同一。新規ファイルは `packages/infrastructure/tests/uow/drizzle-unit-of-work.test.ts`（`tests/**/*.test.ts` に一致）。

## リスク

設計書 R-1〜R-5。検出は type-check（R-1）と PGlite 試験（原子性）。回避: getter、リクエストスコープ UoW、`createWriteContext`、FR-7。

## ロールバック方法

ADR-0019 §Rollback。

## ドキュメント更新対象

- `docs/03-architecture.md` の DI 節に UoW とドライバ
- `docs/05-roadmap.md` Unit B 状態
- `docs/04-domain-model.md` は Entity 変更なし → 整合確認のみ（更新不要）
- ADR-0006 は superseded しない（冪等は残す）。ADR-0019 が非トランザクション申し送りを閉じると明記済み
