# 試験計画: pantry-core

- 作成日: 2026-07-14
- 対象スプリント: Sprint 5 Unit A
- 関連設計書: `docs/designs/pantry-core.md`（S-1〜S-11・D-1〜D-8 ユーザー確定済み、2026-07-14）
- 関連契約設計書: `docs/designs/pantry-core-contract.md`（§7 契約テスト方針。ヘッダーは
  `draft` 表記のままだが、内容は確定済み S-x 推奨案をそのまま反映したものであり齟齬はない
  — 本書末尾「Orchestrator への確認事項」参照）
- 関連要件書: `docs/requirements/pantry-core.md`（§7 試験観点、§6 設計判断論点）
- 変更レベル: L3（Domain / Application / Infrastructure / API-Contract / Presentation 全層 +
  4 集約〈ShoppingList / Pantry / Product / MealPlan〉をまたぐオーケストレーション）
- 実装状況: **未実装**（`packages/domain/src/pantry/` 等の対象ファイルはすべて存在しないことを
  Glob で確認済み。既存の `packages/domain/src/shopping-list/`・`meal-plan/`・`product/` は
  Sprint 3/4 で実装済みで、本ユニットはそれらを新規に呼び出す側。本計画は実装着手前に試験観点を
  先出しし、implementer は本計画の観点を co-located Vitest テストとして実装する）

---

## 1. 概要・前提

### 1-1. テスト対象コンポーネント（設計書 §バックエンド設計 対応）

| 層                     | コンポーネント                                                                                                         | ファイル（実装後の想定パス）                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Domain                 | `PantryId` / `StockId`                                                                                                 | `packages/domain/src/pantry/pantry-id.ts` / `stock-id.ts`                                           |
| Domain                 | `Pantry`（集約）/ `Stock`（集約内エンティティ）/ `StorageLocation` 型                                                  | `packages/domain/src/pantry/pantry.ts`                                                              |
| Domain                 | `PantryRepository`（インターフェース）                                                                                 | `packages/domain/src/pantry/pantry.repository.ts`                                                   |
| Domain（既存への追加） | `Quantity.subtract()`（S-7・共有 VO への純追加）                                                                       | `packages/domain/src/shared/quantity.ts`（既存ファイル。既存 `quantity.test.ts` に describe 追加）  |
| Application            | `PantryDto` / `StockDto` / 各 InputDto                                                                                 | `packages/application/src/pantry/pantry.dto.ts`                                                     |
| Application            | `toPantryDto` / `toStockDto`                                                                                           | `packages/application/src/pantry/pantry.mapper.ts`                                                  |
| Application            | `StockNotFoundError` / `InvalidStockOperationError`                                                                    | `packages/application/src/pantry/*.error.ts`                                                        |
| Application            | `ConsumeStockUseCase` / `DiscardStockUseCase` / `GetPantryUseCase`                                                     | `packages/application/src/pantry/*.use-case.ts`                                                     |
| Application（最重要）  | `CompleteShoppingUseCase`（4 集約またぎ。D-1 により shopping-list 側に配置）                                           | `packages/application/src/shopping-list/complete-shopping.use-case.ts`                              |
| Infrastructure         | `DrizzlePantryRepository`                                                                                              | `packages/infrastructure/src/repositories/drizzle-pantry.repository.ts`                             |
| Infrastructure         | `stocks` テーブル・PGlite DDL 追記                                                                                     | `packages/infrastructure/src/db/schema.ts`、`packages/infrastructure/src/testing/create-test-db.ts` |
| API Contract           | `stockIdParamSchema` / `consumeStockSchema` / `storageLocationSchema` / `stockResponseSchema` / `pantryResponseSchema` | `packages/api-contract/src/pantry.schema.ts`                                                        |
| Presentation           | `pantryRoute`（3 エンドポイント）                                                                                      | `apps/web/src/server/routes/pantry.ts`                                                              |
| Presentation           | `shoppingListsRoute` への `POST /:id/complete` 追記                                                                    | `apps/web/src/server/routes/shopping-lists.ts`                                                      |
| Presentation           | `app.ts` の `.route('/pantry', ...)` + `onError` 追加分岐（2 種）                                                      | `apps/web/src/server/app.ts`                                                                        |

### 1-2. 既存テストの有無・実装コード走査結果

pantry 関連のテストは現時点で**存在しない**（`packages/domain/src/pantry/` 等 Glob 確認済み。0 件）。
対象パッケージの既存実装コードを走査し、pantry-core が依存・拡張する既存 public API を確認した。

| 対象                                                                        | 確認結果                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ShoppingList.complete()` / `ShoppingItem.isBought()`（`shopping-list.ts`） | 実装済み。`complete()` は `assertActive('complete')` → `status='completed'` のみ。`isBought()` は `status==='bought'` の薄いラッパー。bought 品目は `markAsBought()` のシグネチャ上 `actualPrice`/`actualStore` が必ず非 null |
| `MealPlan.transitionTo()`（`meal-plan.ts`）                                 | `TRANSITIONS` テーブルで `shopping: ['draft','cooking']` を確認。`draft→cooking` は不許可（D-4 の二段遷移修復の根拠が実コードで成立）                                                                                         |
| `Product.recordPrice()` / `PriceRecord.create()`（`product.ts`）            | `recordPrice` 実装済み（push + touch）。`PriceRecord.create` は `price.amount<=0` / `unitPrice.amount<=0` / `packageSize.value<=0` で `Error`（正数のみ許容）を実コードで確認                                                 |
| `UnitPriceCalculator.calculate()`（`unit-price-calculator.ts`）             | 重量/体積は 100g・100ml 換算 + 小数 1 位丸め（`Math.round(x*10)/10`）、それ以外は線形。丸めで 0 になり得ることを実コードで確認（S-9 条件 4 の根拠）                                                                           |
| `Quantity`（`quantity.ts`）                                                 | `of`/`multiply`/`add` のみ実装済み。**`subtract` は不在**（設計どおり。本ユニットで新規実装）                                                                                                                                 |
| `Money`（`money.ts`）                                                       | `of` は非負のみ許容（0 可）。`add` の実装が `Quantity.subtract` 実装時の対称先例                                                                                                                                              |
| `ProductId`/`ShoppingItemId`（4 点セット）                                  | `generate()`/`fromString()`/`equals()`/`value` の完全同一パターンを実コードで確認。`StockId` が踏襲する先例                                                                                                                   |
| `DrizzleShoppingListRepository`（`drizzle-shopping-list.repository.ts`）    | upsert + `NOT IN` DELETE の子テーブル同期パターン、`toDateString`/`toDate`（ローカル日付整形）を実コードで確認。`DrizzlePantryRepository` が単一テーブル版として踏襲する先例                                                  |
| `create-test-db.ts` の DDL                                                  | `stocks` の `CREATE TABLE` が**まだ存在しない**ことを確認（Infrastructure 層試験の前提条件。shopping-list-core 試験計画時と同型のタスク）                                                                                     |
| `shoppingListsRoute` / `app.ts`（`apps/web/src/server/`）                   | 手動 DI ファクトリ関数 + `zValidator` + `onError` instanceof 分岐パターンを確認。`POST /:id/complete` はまだ存在しない（本ユニットで追記）                                                                                    |
| `shopping-list.schema.test.ts`（想定） / `pantry.schema.ts`（契約設計書）   | `pantry.schema.ts` は契約設計書 §1.1 でスキーマ 5 本が確定済み。`unitSchema` は `recipe.schema.ts` から re-export（再定義ではない）ことを確認                                                                                 |

以下の既存テストを実装パターンの先例として参照する。

| 参照先                                                                         | パターン                                                                                                                                                    |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain/src/shared/money.test.ts`                                     | `Money.of` 非負検証・`add` の同種/異種テストパターン（`Quantity.subtract` の負値挙動テストの直接参照元）                                                    |
| `packages/domain/src/shared/quantity.test.ts`                                  | `add()` の describe ブロック追加パターン（`subtract()` がそのまま踏襲）                                                                                     |
| `packages/application/src/shopping-list/shopping-list-use-cases.test.ts`       | `InMemory*Repository`（`saveCount`/`seed`/`size`）パターン。`InMemoryPantryRepository` はこれを踏襲しつつ「単一インスタンス保持」に変形（S-1 シングルトン） |
| `packages/application/src/shopping-list/generate-shopping-list.use-case.ts`    | ADR-0006 型の冪等・保存順序による自己修復の実装パターン。`CompleteShoppingUseCase` が踏襲する直接先例                                                       |
| `apps/web/src/server/routes/shopping-lists.test.ts`                            | `vi.mock('@/db/client')` + `vi.mock('@cookpit/application')` で UseCase をモック化する Hono ルートテストパターン                                            |
| `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.ts` | PGlite 統合テストの土台となる Repository 実装（JOIN 不要な単一テーブル版として `DrizzlePantryRepository` がさらに単純化）                                   |
| `docs/tests/shopping-list-core.md`                                             | 本計画のセクション構成・観点 ID 採番方式・防御性試験・冪等/部分失敗修復試験の先例（同型 L3 試験計画の直接先例。§構成をそのまま踏襲）                        |

### 1-3. スコープ外（設計書 §対象外・要件書 §2-2 に整合）

- 在庫一覧画面・「使った」「捨てた」ボタン UI・買い物完了導線の UI（Unit B `pantry-screens`、L2）
- `GenerateShoppingListUseCase` への Pantry 注入・在庫引き算・切り上げルール（Unit C）。
  `calculateRequiredAmount()` / `findByProduct()` / `findExpiringSoon()` は S-11 により本ユニットで
  実装しないため試験対象外
- 消費・廃棄の `reason` と履歴永続化（S-10。MVP1 では reason を受け取らない。`ConsumptionReason`
  型・履歴テーブルとも本ユニットに存在しないため試験対象外）
- 認証・複数ユーザー対応（Phase 2）
- E2E（Playwright）による画面操作込みシナリオ（詳細は §14）
- ConsumeStock の二重送信防止機構の実装試験（非冪等であることの確認は含めるが、防止機構自体は
  Unit B の将来課題であり本ユニットには存在しない）

---

## 2. テスト実行環境（層別）

各パッケージの vitest 設定の include パターンは shopping-list-core 試験計画時点から変更がないことを
実ファイルで確認した（`packages/*/vitest.config.ts` → `@cookpit/config/vitest/base` 共通、
`apps/web` は `vitest.node.config.mts` の `['src/**/*.node.test.ts', 'src/server/**/*.test.ts']`）。

| 層                        | include グロブ            | 想定テストファイル                                                                                                                                                                                                                      | 判定                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain`         | `src/**/*.test.ts`        | `pantry-id.test.ts`、`stock-id.test.ts`、`pantry.test.ts`、既存 `quantity.test.ts`（`subtract()` の describe を追記）                                                                                                                   | 一致                                                                                                                                                                                                                                  |
| `packages/application`    | `src/**/*.test.ts`        | `packages/application/src/pantry/pantry-use-cases.test.ts`、`packages/application/src/shopping-list/complete-shopping.use-case.test.ts`（新規。または既存 `shopping-list-use-cases.test.ts` への追加。ファイル分割は implementer 裁量） | 一致                                                                                                                                                                                                                                  |
| `packages/infrastructure` | `src/**/*.test.ts`        | `packages/infrastructure/src/repositories/drizzle-pantry.repository.test.ts`                                                                                                                                                            | 一致。**前提条件**: `create-test-db.ts` の `DDL` に `stocks`（`source_shopping_item_id` UNIQUE 込み）の `CREATE TABLE IF NOT EXISTS` が追記されていること（未追記のままだと全ケースが `relation "stocks" does not exist` で失敗する） |
| `packages/api-contract`   | `src/**/*.test.ts`        | `packages/api-contract/src/pantry.schema.test.ts`                                                                                                                                                                                       | 一致。基盤は導入済み                                                                                                                                                                                                                  |
| `apps/web`                | `src/server/**/*.test.ts` | `apps/web/src/server/routes/pantry.test.ts`（新規）、既存 `shopping-lists.test.ts` への `POST /:id/complete` ケース追記                                                                                                                 | 一致                                                                                                                                                                                                                                  |

**結論**: 全層でテスト基盤・include グロブ・命名規約に不整合はない。唯一の前提条件は Infrastructure 層の
DDL 追記（実装順序「schema.ts 追記 → create-test-db.ts DDL 追記 → Repository 実装 → Repository テスト」
を推奨。設計書 §implementation-planner への申し送りの実装順と一致）。

実行コマンド: `pnpm lint` / `pnpm type-check` / `pnpm test`（ルートから `turbo test` で全パッケージ横断）。

---

## 3. 公開 API 網羅チェック

設計書 §バックエンド設計に記載された全 public メソッド・static ファクトリ・ゲッターを列挙し、
対応する試験観点 ID を付す（実装コードが存在しないため設計書の確定仕様を走査対象にした。実装後に
実コードと本表の乖離がないか implementer 側で再確認すること）。

### 3-1. `PantryId` / `StockId`

| メソッド                                                | 試験観点                         |
| ------------------------------------------------------- | -------------------------------- |
| `static fromString(value): PantryId`                    | PID-03〜05                       |
| `equals(other): boolean`                                | PID-04, PID-05                   |
| `get value(): string`                                   | PID-03                           |
| `static singleton(): PantryId`(`generate()` は持たない) | PID-01, PID-02（**最重要**）     |
| `StockId.generate() / fromString() / equals() / value`  | SID-01〜05（ProductId 完全同型） |

### 3-2. `Quantity.subtract()`（既存クラスへの追加・S-7・最重要）

| メソッド                              | 試験観点       |
| ------------------------------------- | -------------- |
| `subtract(other: Quantity): Quantity` | QTY-SUB-01〜06 |

### 3-3. `Stock`（集約内エンティティ）

| メソッド                                                                                        | 試験観点                             |
| ----------------------------------------------------------------------------------------------- | ------------------------------------ |
| `static create(input): Stock`                                                                   | STK-CR-01〜07（**最重要**: 02, 04）  |
| `static reconstruct(props): Stock`                                                              | STK-RC-01                            |
| `consume(amount: Quantity): void`                                                               | STK-CON-01〜04（**最重要**: 02, 03） |
| `isEmpty(): boolean`                                                                            | STK-IE-01, STK-IE-02                 |
| `get id/productId/displayName/amount/purchasedAt/expiresAt/storedLocation/sourceShoppingItemId` | STK-CR-01〜07 の中で網羅確認         |
| `get purchasedAt()`/`get expiresAt()`（防御的コピー）                                           | STK-DEF-01, STK-DEF-02               |

### 3-4. `Pantry`（集約ルート）

| メソッド                                    | 試験観点                                         |
| ------------------------------------------- | ------------------------------------------------ |
| `static create(): Pantry`                   | PT-CR-01                                         |
| `static reconstruct(props): Pantry`         | PT-RC-01                                         |
| `addStock(input): StockId`                  | PT-ADD-01, PT-ADD-02                             |
| `consumeStock(stockId, amount): void`       | PT-CON-01〜04（**最重要**: 02, 03）              |
| `discardStock(stockId): void`               | PT-DIS-01〜03（**最重要**: 03）                  |
| `hasStockFromShoppingItem(itemId): boolean` | PT-HAS-01, PT-HAS-02（**最重要**: S-3 冪等キー） |
| `get id(): PantryId`                        | PT-CR-01, PT-RC-01                               |
| `get stocks(): Stock[]`（防御的コピー）     | PT-DEF-01                                        |

Domain は「1 bought 品目 : 最大 1 Stock」を単体では保証しない（Application の事前スキップ + DB
UNIQUE の二段防御。設計書の不変条件まとめ参照）。`addStock` 自体に重複拒否ロジックはなく、これは
意図した責務分離であり Domain 層の欠落ではない（本項目に対する Domain 単体の否定テストは設ける
必要がない）。

### 3-5. `PantryRepository`（インターフェース）

インターフェース自体はテスト対象外。実装（`DrizzlePantryRepository`）を通じて INF-01〜19 で
間接的に検証する。

### 3-6. `toPantryDto` / `toStockDto`

| 関数                             | 試験観点                                                    |
| -------------------------------- | ----------------------------------------------------------- |
| `toPantryDto(pantry): PantryDto` | CON-N-01, DIS-N-01, GET-N-01/02（間接）、Z-17（契約型往復） |
| `toStockDto(stock): StockDto`    | 同上（間接）                                                |

Mapper 単体の専用テストファイルは設計書に明記がないため、UseCase テスト内の DTO 検証と契約テストの
型往復で代替する（shopping-list-core 試験計画と同じ扱い）。

### 3-7. エラークラス 2 本

| クラス                       | 試験観点                                                           |
| ---------------------------- | ------------------------------------------------------------------ |
| `StockNotFoundError`         | ERR-01（`message`/`name` 確認込み）。CON-E-01, DIS-E-01 で使用確認 |
| `InvalidStockOperationError` | ERR-02。CON-E-02 で使用確認                                        |

`ShoppingListNotFoundError`（既存クラスの流用・CS-E-01）はエラークラスとしての新規試験は不要
（shopping-list-core で試験済み）。`InvalidShoppingListStateError` は S-3 の冪等設計により
`CompleteShoppingUseCase` からは**到達しない**（既存クラスは既存試験のまま・新規呼び出し確認は不要）。

### 3-8. UseCase 4 本

| UseCase                                           | 試験観点                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `CompleteShoppingUseCase.execute()`（**最重要**） | CS-N-01〜10, CS-B-01〜02, CS-E-01, CS-IDEM-01〜03, CS-REPAIR-01〜05, CS-SKIP-01〜07, CS-D5-01〜02 |
| `ConsumeStockUseCase.execute()`                   | CON-N-01〜03, CON-E-01〜02, CON-IDEM-01                                                           |
| `DiscardStockUseCase.execute()`                   | DIS-N-01〜02, DIS-E-01                                                                            |
| `GetPantryUseCase.execute()`                      | GET-N-01〜02                                                                                      |

### 3-9. `DrizzlePantryRepository`

| メソッド                                 | 試験観点                                             |
| ---------------------------------------- | ---------------------------------------------------- |
| `find(): Promise<Pantry>`（常に非 null） | INF-01〜03, INF-17（**最重要**: INF-01）             |
| `save(pantry): Promise<void>`            | INF-02, INF-04〜16, INF-18〜19（**最重要**: INF-12） |

### 3-10. `pantry.schema.ts`（Zod）

| スキーマ                   | 試験観点                       |
| -------------------------- | ------------------------------ |
| `stockIdParamSchema`       | Z-01, Z-02                     |
| `consumeStockSchema`       | Z-03〜08（**最重要**: Z-03）   |
| `storageLocationSchema`    | Z-09, Z-10                     |
| `stockResponseSchema`      | Z-11〜14（**最重要**: Z-11）   |
| `pantryResponseSchema`     | Z-15, Z-16（**最重要**: Z-15） |
| 型往復・非対称性の回帰確認 | Z-17, Z-18, Z-19               |

### 3-11. `pantryRoute`（Hono、3 エンドポイント）+ `shopping-lists.ts` 追記

| エンドポイント                                      | 試験観点                                            |
| --------------------------------------------------- | --------------------------------------------------- |
| `GET /api/pantry`                                   | P-GET-01, P-GET-02（**最重要**: S-1 常に 200）      |
| `POST /api/pantry/stocks/:stockId/consume`          | P-CON-01〜05（**最重要**: P-CON-03）                |
| `POST /api/pantry/stocks/:stockId/discard`          | P-DIS-01〜03                                        |
| `POST /api/shopping-lists/:id/complete`             | P-COMPLETE-01〜04（**最重要**: P-COMPLETE-02 冪等） |
| `onError` 追加分岐（2 種）                          | P-CON-04/05, P-DIS-03                               |
| 回帰（既存 9 エンドポイント + 既存 9 onError 分岐） | P-REG-01, P-REG-02                                  |

---

## 4. Domain 層試験観点

テストランナー: Vitest（co-located）。新規ファイル: `pantry-id.test.ts`、`stock-id.test.ts`、
`pantry.test.ts`。既存ファイル追記: `quantity.test.ts`。

### 4-1. `PantryId`（S-1 常在モデルの要・最重要）

| #                    | 前提                             | 操作                                                                                       | 期待結果                                                                                                    | 分類 |
| -------------------- | -------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ---- |
| PID-01（**最重要**） | —                                | `PantryId.singleton()`                                                                     | `.value === '00000000-0000-0000-0000-000000000000'`                                                         | 正常 |
| PID-02（**最重要**） | —                                | `PantryId.singleton()` を2回呼び出し                                                       | `equals()` が `true`（毎回同一固定値。`generate()` と異なり呼ぶたびに変わらない）                           | 正常 |
| PID-03               | —                                | `PantryId.fromString('id-1')`                                                              | `.value === 'id-1'`                                                                                         | 正常 |
| PID-04（**最重要**） | —                                | `PantryId.singleton().equals(PantryId.fromString('00000000-0000-0000-0000-000000000000'))` | `true`（`singleton()` 経由でも `fromString()` 経由でも同一値なら同値。Infrastructure 復元時の一貫性の根拠） | 正常 |
| PID-05               | 異なる文字列から生成した2つの ID | `a.equals(b)`                                                                              | `false`                                                                                                     | 正常 |

`PantryId` に `generate()` は存在しない（D-2。シングルトンに採番の概念がないため）。

### 4-2. `StockId`（ProductId 完全同型）

| #      | 前提                             | 操作                         | 期待結果              | 分類 |
| ------ | -------------------------------- | ---------------------------- | --------------------- | ---- |
| SID-01 | —                                | `StockId.generate()`         | UUID 形式の値を持つ   | 正常 |
| SID-02 | —                                | `StockId.generate()` を2回   | `equals()` が `false` | 正常 |
| SID-03 | —                                | `StockId.fromString('id-1')` | `.value === 'id-1'`   | 正常 |
| SID-04 | 同一文字列から生成した2つの ID   | `a.equals(b)`                | `true`                | 正常 |
| SID-05 | 異なる文字列から生成した2つの ID | `a.equals(b)`                | `false`               | 正常 |

### 4-3. `Quantity.subtract()`（S-7・共有 VO 変更・最重要）

`Quantity.add()`（既存）と対称。既存 `quantity.test.ts` に `describe('Quantity.subtract')` を追加する形で
実装する。

| #                              | 前提                                                                                         | 操作                                               | 期待結果                                                                                                                                                                                                       | 分類   |
| ------------------------------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| QTY-SUB-01                     | `Quantity.of(300, 'g')`                                                                      | `.subtract(Quantity.of(100, 'g'))`                 | `value === 200`、`unit === 'g'`                                                                                                                                                                                | 正常   |
| QTY-SUB-02（**最重要**）       | `Quantity.of(100, 'g')`                                                                      | `.subtract(Quantity.of(1, 'kg'))`                  | `Error('Cannot subtract different units')` を throw                                                                                                                                                            | 異常   |
| QTY-SUB-03（境界）             | `Quantity.of(100, 'g')`                                                                      | `.subtract(Quantity.of(100, 'g'))`（ちょうど一致） | `value === 0`（throw しない。`Quantity.of(0,...)` は合法）                                                                                                                                                     | 境界   |
| QTY-SUB-04（**最重要・境界**） | `Quantity.of(100, 'g')`                                                                      | `.subtract(Quantity.of(150, 'g'))`（減算後に負）   | `Error('Quantity must be non-negative')` を throw（`Quantity.of` の既存非負検証に委譲。S-7 (i) 「厳格」方針の直接確認。`Stock.consume()` はこの raw throw に到達しないようクランプで避ける — STK-CON-03 参照） | 異常   |
| QTY-SUB-05（境界）             | `Quantity.of(100, 'g')`                                                                      | `.subtract(Quantity.of(0, 'g'))`                   | `value === 100`（0 減算で不変）                                                                                                                                                                                | 境界   |
| QTY-SUB-06（防御性）           | `const a = Quantity.of(100,'g'); const b = Quantity.of(30,'g'); const diff = a.subtract(b);` | `a.value`/`b.value` を再取得                       | `a.value === 100`、`b.value === 30`（新しい `Quantity` を返し元のインスタンスは不変）                                                                                                                          | 防御性 |

### 4-4. `Stock.create()` / `reconstruct()`（S-5 productId null 許容・最重要）

| #                             | 前提                                                                           | 操作                                                                                                                                                                                                                                 | 期待結果                                                               | 分類 |
| ----------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ---- |
| STK-CR-01                     | —                                                                              | `Stock.create({ productId: ProductId.fromString('p1'), displayName: '玉ねぎ', amount: Quantity.of(2,'個'), purchasedAt: new Date(), expiresAt: null, storedLocation: null, sourceShoppingItemId: ShoppingItemId.fromString('i1') })` | 正常生成。`id` が発行され全フィールドが保持される                      | 正常 |
| STK-CR-02（**最重要・S-5**）  | —                                                                              | `productId: null` で `create()`                                                                                                                                                                                                      | 正常生成、`productId === null`（買った物はすべて在庫化する方針の根拠） | 正常 |
| STK-CR-03                     | —                                                                              | `displayName: '  '`（空白のみ）                                                                                                                                                                                                      | `Error`（displayName 必須）を throw                                    | 異常 |
| STK-CR-04（**最重要・境界**） | —                                                                              | `amount: Quantity.of(0, '個')` で `create()`                                                                                                                                                                                         | `Error`（在庫は正の量で生まれる。`amount.value <= 0` 拒否）を throw    | 異常 |
| STK-CR-05                     | —                                                                              | `expiresAt: null` / 非 null（両パターン）                                                                                                                                                                                            | いずれも正常生成（S-4 案 α。null 許容）                                | 正常 |
| STK-CR-06                     | —                                                                              | `storedLocation` に `null`/`'fridge'`/`'freezer'`/`'pantry'`（4パターン）                                                                                                                                                            | いずれも正常生成                                                       | 正常 |
| STK-CR-07                     | —                                                                              | `sourceShoppingItemId: null`（買い物完了以外の起源を想定）                                                                                                                                                                           | 正常生成、`sourceShoppingItemId === null`                              | 正常 |
| STK-RC-01                     | 任意の `StockProps`（`displayName: ''` 等、`create()` なら拒否される値を含む） | `Stock.reconstruct(props)`                                                                                                                                                                                                           | バリデーションを経ずに props 通り復元される（DB 復元専用の非検証経路） | 正常 |

### 4-5. `Stock.consume()` / `isEmpty()`（S-7 全量クランプ・最重要）

| #                                   | 前提                                     | 操作                                              | 期待結果                                                                                                           | 分類 |
| ----------------------------------- | ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---- |
| STK-CON-01                          | `amount: Quantity.of(300, 'g')` の Stock | `consume(Quantity.of(100, 'g'))`                  | `amount.value === 200`（`subtract` 経由の通常減算）                                                                | 正常 |
| STK-CON-02（**最重要・境界**）      | `amount: Quantity.of(200, 'g')` の Stock | `consume(Quantity.of(200, 'g'))`（消費量=在庫量） | `amount.value === 0`、`isEmpty() === true`                                                                         | 境界 |
| STK-CON-03（**最重要・境界・S-7**） | `amount: Quantity.of(200, 'g')` の Stock | `consume(Quantity.of(300, 'g'))`（消費量>在庫量） | throw せず全量消費にクランプ。`amount.value === 0`、`isEmpty() === true`（QTY-SUB-04 の raw throw には到達しない） | 境界 |
| STK-CON-04                          | `amount: Quantity.of(200, 'g')` の Stock | `consume(Quantity.of(1, '個'))`（単位不一致）     | `Error`（単位不一致）を throw（消費量>在庫量のクランプ判定より前に単位チェックが優先される）                       | 異常 |
| STK-IE-01                           | `amount.value === 0` の Stock            | `isEmpty()`                                       | `true`                                                                                                             | 正常 |
| STK-IE-02                           | `amount.value > 0` の Stock              | `isEmpty()`                                       | `false`                                                                                                            | 正常 |

### 4-6. 防御性（Stock）

| #          | 前提                                         | 操作                                                | 期待結果                                                  | 分類   |
| ---------- | -------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------- | ------ |
| STK-DEF-01 | `expiresAt: new Date('2026-08-01')` の Stock | `const d = stock.expiresAt; d?.setFullYear(2099);`  | 再取得した `stock.expiresAt?.getFullYear()` は変化しない  | 防御性 |
| STK-DEF-02 | 任意の Stock                                 | `const d = stock.purchasedAt; d.setFullYear(2099);` | 再取得した `stock.purchasedAt.getFullYear()` は変化しない | 防御性 |

### 4-7. `Pantry`（集約ルート・最重要）

| #                                  | 前提                                                                                          | 操作                                                              | 期待結果                                                                                | 分類   |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| PT-CR-01                           | —                                                                                             | `Pantry.create()`                                                 | `id.equals(PantryId.singleton()) === true`、`stocks === []`                             | 正常   |
| PT-RC-01                           | 任意の `PantryProps`（stocks 複数件）                                                         | `Pantry.reconstruct(props)`                                       | props 通りに復元される                                                                  | 正常   |
| PT-ADD-01                          | `Pantry.create()`                                                                             | `addStock(input)`                                                 | 新規 `Stock` が `stocks` に追加され、発行された `StockId` が返る                        | 正常   |
| PT-ADD-02                          | `Pantry.create()`                                                                             | `addStock()` を2回（異なる input）                                | `stocks.length === 2`                                                                   | 正常   |
| PT-CON-01                          | `stocks` に対象 `stockId` の Stock（amount 300g）を含む Pantry                                | `consumeStock(stockId, Quantity.of(100,'g'))`                     | 対象 Stock の `amount.value === 200`                                                    | 正常   |
| PT-CON-02（**最重要**）            | 対象 `stockId` が `stocks` に存在しない                                                       | `consumeStock(不存在の stockId, amount)`                          | `Error('Stock not found')` を throw                                                     | 異常   |
| PT-CON-03（**最重要・境界**）      | `stocks` に amount 200g の対象 Stock を含む Pantry                                            | `consumeStock(stockId, Quantity.of(200,'g'))`（ちょうどゼロ到達） | 対象 Stock が `stocks` から削除される（`stocks.length` が1減る。ゼロ到達→削除の確認）   | 境界   |
| PT-CON-04（**最重要・境界・S-7**） | 同上                                                                                          | `consumeStock(stockId, Quantity.of(999,'g'))`（消費量>在庫量）    | throw せず、対象 Stock が `stocks` から削除される（クランプ経由でも同じ削除結果になる） | 境界   |
| PT-DIS-01                          | `stocks` に対象 `stockId` の Stock を含む Pantry                                              | `discardStock(stockId)`                                           | 対象 Stock が `stocks` から削除される                                                   | 正常   |
| PT-DIS-02（**最重要**）            | 対象 `stockId` が `stocks` に存在しない                                                       | `discardStock(不存在の stockId)`                                  | `Error('Stock not found')` を throw                                                     | 異常   |
| PT-DIS-03（**最重要・境界**）      | `amount.value === 500`（大量に残っている）の Stock を含む Pantry                              | `discardStock(stockId)`                                           | 残量に関わらず全量削除される（`stocks` から完全に消える。部分廃棄はサポートしない）     | 境界   |
| PT-HAS-01（**最重要・S-3**）       | `sourceShoppingItemId: ShoppingItemId.fromString('i1')` を持つ Stock を含む Pantry            | `hasStockFromShoppingItem(ShoppingItemId.fromString('i1'))`       | `true`                                                                                  | 正常   |
| PT-HAS-02                          | `sourceShoppingItemId: null` の Stock のみを含む Pantry、または該当 Stock が存在しない Pantry | `hasStockFromShoppingItem(ShoppingItemId.fromString('i1'))`       | `false`                                                                                 | 正常   |
| PT-DEF-01（防御性）                | `stocks` に1件の Stock を持つ Pantry                                                          | `const arr = pantry.stocks; arr.push(dummyStock);`                | 直後に再取得した `pantry.stocks.length` は変化しない（getter が防御的コピーを返す）     | 防御性 |

---

## 5. Application 層試験観点（UseCase 4 本、InMemory Repository）

テストランナー: Vitest（co-located）。`InMemoryPantryRepository`（S-1 に合わせて単一インスタンスを
保持する変形版。`find()` は常に非 null、`save()` で `saveCount` を計測、`seed(pantry)` で初期状態を注入）、
`InMemoryProductRepository`/`InMemoryMealPlanRepository`/`InMemoryShoppingListRepository`（既存
shopping-list-core テストの同名クラスをそのまま再利用・再定義）を用意する。

### 5-1. `CompleteShoppingUseCase`（4 集約またぎ・最重要。設計書 §データフロー擬似コードに対応）

依存: `ShoppingListRepository` / `PantryRepository` / `ProductRepository` / `MealPlanRepository`（D-1）。

**正常系**

| #                          | 前提                                                                                                                                    | 操作                             | 期待結果                                                                                                          | 分類         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------ |
| CS-N-01                    | `status: 'active'` の ShoppingList（bought 品目2件、うち1件は `productId` あり）、対応する `active` な MealPlan（`status: 'shopping'`） | `execute({ shoppingListId })`    | bought 品目と同数の Stock が Pantry に追加される。各 Stock の `sourceShoppingItemId` が対応する item の id と一致 | 正常         |
| CS-N-02                    | 上記 bought 品目のうち `productId` あり・`actualPrice.amount > 0`・`requiredAmount` あり                                                | `execute({ shoppingListId })`    | 対応する Product に `PriceRecord` が1件追加される（`product.priceHistory.length` が1増える）                      | 正常         |
| CS-N-03（**最重要・S-5**） | bought 品目のうち `productId: null` のもの                                                                                              | `execute({ shoppingListId })`    | 価格記録はスキップされるが、Stock は追加される（`productId: null` の Stock として在庫化）                         | 正常         |
| CS-N-04                    | `status: 'active'` の ShoppingList                                                                                                      | `execute({ shoppingListId })`    | 戻り値の `ShoppingListDto.status === 'completed'`。`shoppingListRepository.saveCount` が1増える                   | 正常         |
| CS-N-05                    | 対応 MealPlan が `status: 'shopping'`                                                                                                   | `execute({ shoppingListId })` 後 | `mealPlan.status === 'cooking'`（`transitionTo('cooking')` + save）                                               | 正常         |
| CS-N-06                    | ShoppingList の items が bought 2件・pending 1件・skipped 1件の混在                                                                     | `execute({ shoppingListId })`    | Pantry に追加される Stock は bought の2件のみ（pending/skipped は無視される）                                     | 正常         |
| CS-N-07                    | 任意の正常系実行後                                                                                                                      | 戻り値を確認                     | `ShoppingListDto`（更新後の状態）が返る                                                                           | 正常         |
| CS-N-08（S-4 案 α）        | bought 品目                                                                                                                             | `execute({ shoppingListId })`    | 追加された Stock の `expiresAt === null`、`storedLocation === null`（完了時点では設定しない）                     | 正常         |
| CS-N-09（S-5）             | bought 品目の `displayName: '玉ねぎ'`                                                                                                   | `execute({ shoppingListId })`    | 追加された Stock の `displayName === '玉ねぎ'`（ShoppingItem からのコピー）                                       | 正常         |
| CS-N-10（D-4）             | `status: 'active'` の ShoppingList（初回完了）、対応 MealPlan が `findById` で `null`（存在しない）                                     | `execute({ shoppingListId })`    | エラーにならず完了が成功する（MealPlan 遷移ステップはスキップされ、`mealPlanRepository.saveCount` は増えない）    | 正常・防御性 |

**境界**

| #                          | 前提                                                                       | 操作                          | 期待結果                                                                                                                                | 分類 |
| -------------------------- | -------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| CS-B-01（**最重要・S-6**） | bought 品目が `requiredAmount: null, amountNote: '少々'`（塩など数量なし） | `execute({ shoppingListId })` | 追加された Stock の `amount` が `Quantity.of(1, '個')`（value=1, unit='個'）。かつ当該品目の価格記録はスキップされる（S-9 条件3と連動） | 境界 |
| CS-B-02（境界）            | ShoppingList の items が全て pending/skipped（bought 0件）                 | `execute({ shoppingListId })` | エラーにならず完了する。Pantry に Stock は追加されない。MealPlan 遷移・complete は通常どおり実行される                                  | 境界 |

**異常**

| #       | 前提                                                          | 操作                                    | 期待結果                             | 分類 |
| ------- | ------------------------------------------------------------- | --------------------------------------- | ------------------------------------ | ---- |
| CS-E-01 | `shoppingListRepository` に対象 `shoppingListId` が存在しない | `execute({ shoppingListId: '不存在' })` | `ShoppingListNotFoundError` を throw | 異常 |

`status !== 'active' かつ !== 'completed'` の状態は `ShoppingListStatus` 型に存在しないため
`InvalidShoppingListStateError` に到達するケースはない（S-3 (1) の確定仕様どおり。設計書の
明示的な申し送り事項であり、本計画では意図的にテストケースを設けない）。

---
