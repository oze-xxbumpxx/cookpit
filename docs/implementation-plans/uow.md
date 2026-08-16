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

**2026-08-15 以降**は先に環境変数を試す。`DB_WRITE_TRANSACTION` を未設定に戻して再デプロイ
すれば、コード変更なしで 2026-08-13〜15 と同じ挙動（`work()` の恒等実行）に戻る。
コードのロールバックが要るのはそれで直らない場合だけ。

## 追加実装: 案 S（2026-08-15）

ADR-0019 のロールバック後、完了条件 2 を満たし直すための再導入。設計は
`docs/designs/uow.md`「トランザクション再導入（案 S 採用確定）」。

| #   | ステップ                     | 対象                                                                        | 完了条件                                     |
| --- | ---------------------------- | --------------------------------------------------------------------------- | -------------------------------------------- |
| S-1 | tx 専用の接続を足す          | `packages/infrastructure/src/db/client.ts` に `createTxDb`                  | 既存 `createDb`（neon-http）が変わらないこと |
| S-2 | UoW に接続の差し替え口を作る | `drizzle-unit-of-work.ts` の `createTxClient`                               | 無効時に呼ばれないことをテストで固定         |
| S-3 | apps/web の配線              | `apps/web/src/db/client.ts` の `getTxDb` / `repositories.ts` の読み書き分離 | 読み取り経路が WS を張らないこと             |
| S-4 | 依存の再追加                 | `packages/infrastructure/package.json` に `ws` / `@types/ws`                | `pnpm build` が通ること                      |
| S-5 | テスト                       | `tests/uow/drizzle-unit-of-work.test.ts` に `createTxClient` の 5 件        | 14 件 PASS                                   |

**S-1〜S-5 は完了（2026-08-15）。** 品質ゲート lint / type-check / test / build すべて PASS。

**未完了**: 本番・Preview での有効化。`DB_WRITE_TRANSACTION` は既定無効のままで、
デプロイしても挙動は変わらない。手順は設計書「有効化の手順」。

## 追加実装: 接続の寿命をリクエストに揃える（2026-08-16・ADR-0020）

案 S の有効化で本番障害が再発したことを受けた修正。設計は `docs/designs/uow.md`
「接続の寿命 — 1 リクエスト 1 接続へ」、判断は
[ADR-0020](../decisions/ADR-0020-tx-connection-per-request.md)。

| #   | ステップ                          | 対象                                                             | 完了条件                                                                               | 状態 |
| --- | --------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---- |
| T-1 | `TxConnection` 型を定義           | `packages/infrastructure/src/db/client.ts`                       | `{ db, close }` を export し、`index.ts` から公開                                      | 完了 |
| T-2 | `createTxDb` を都度接続に作り直す | 同上                                                             | `globalThis` キャッシュと `Pool` を削除。`Client` を生成し `TxConnection` を返す       | 完了 |
| T-3 | UoW が接続を閉じる                | `packages/infrastructure/src/uow/drizzle-unit-of-work.ts`        | `createTxClient` を `() => Promise<TxConnection>` に変更。`finally` で `await close()` | 完了 |
| T-4 | apps/web の配線を追従             | `apps/web/src/db/client.ts` の `getTxDb`                         | PGlite 経路は `close` を no-op に。`repositories.ts` は原則そのまま                    | 完了 |
| T-5 | テスト追加・既存の追従            | `packages/infrastructure/tests/uow/drizzle-unit-of-work.test.ts` | 下記 3 観点を追加し、既存 14 件も async 化に追従して PASS                              | 完了 |
| T-6 | 品質ゲート                        | `pnpm lint` / `type-check` / `test` / `build`                    | すべて PASS（`build` は `ws` 同梱で Next が通ることの確認）                            | 完了 |

**計画からの逸脱（1 件）**: `createTxDb` を **`createTxConnection`** へ改名した。戻り値が
`DrizzleClient` から「閉じる義務のある `TxConnection`」へ変わったため、名前を据え置くと
呼び出し側が閉じ忘れる。`apps/web` 側も `getTxDb` → `getTxConnection` に合わせた。
`index.ts` は `export * from './db/client'` なので `TxConnection` は自動的に公開され、変更不要。

**実施結果（2026-08-16）**: lint PASS（既存 warning 1 件のみ。`product-form-fields.test.tsx`
の未使用変数で本変更と無関係）/ type-check PASS / infrastructure UoW **17 件 PASS**（14 → 17）/
`pnpm build` PASS。

`apps/web` のフルスイートは `shopping-list-client.offline-queue.test.tsx` が
**既存のフレーキー**で、クリーン HEAD でも 5 回中 3 回落ちることを確認済み（本変更とは無関係。
単体実行では 21 件 PASS）。別課題として切り出す。

### T-5 のテスト観点

| 観点                                                               | 意図                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------- |
| `work()` が正常終了したとき `close()` が呼ばれる                   | 通常経路のリーク防止                                    |
| **`work()` が例外を投げても `close()` が呼ばれる**                 | **これが漏れると障害が即再発する。最重要**              |
| `useTransaction: false` の間は `createTxClient` が一度も呼ばれない | 既存テストの維持。キルスイッチ OFF で WS を張らない保証 |

### 有効化（コードと分離。ユーザーの手が要る）

| #   | 手順                                                                  | 状態                                      |
| --- | --------------------------------------------------------------------- | ----------------------------------------- |
| 1   | Preview に `DB_WRITE_TRANSACTION=on` を設定して再デプロイ             | 完了（2026-08-16・PR #173）               |
| 2   | 読み取りの生存確認 → 書き込みを一巡（買い物完了・献立同期・チェック） | **PASS**（ユーザー実施）                  |
| 3   | 書き込みのレイテンシを実測して U-2 を閉じる（見積もり 10〜30 ms）     | **未実施**。数値未記録で U-2 は開いたまま |
| 4   | 本番へ同じ環境変数を設定して再デプロイ                                | **未実施**                                |

事故時は環境変数を落として再デプロイするだけで戻る（PR 不要）。
**Sprint 10 完了条件 2 は 4 をもって達成**であり、本 PR のマージでは未達。

### スコープ外

- `repositories.ts` のキルスイッチ仕様（`DB_WRITE_TRANSACTION=on` のみ有効・既定 OFF）は変更しない
- 読み取り・SSR の `neon-http` 経路は一切触らない
- U-3（本番 `DATABASE_URL` が pooled か）・U-4（transaction pooling とセッション機能）は本ステップで解決しない

## ドキュメント更新対象

- `docs/03-architecture.md` の DI 節に UoW とドライバ
- `docs/05-roadmap.md` Unit B 状態
- `docs/04-domain-model.md` は Entity 変更なし → 整合確認のみ（更新不要）
- ADR-0006 は superseded しない（冪等は残す）。ADR-0019 が非トランザクション申し送りを閉じると明記済み
