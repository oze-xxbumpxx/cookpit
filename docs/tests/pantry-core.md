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
| `apps/web`                | `src/server/**/*.test.ts` | `apps/web/src/server/routes/pantry.test.ts`(新規)、既存 `shopping-lists.test.ts` への `POST /:id/complete` ケース追記                                                                                                                   | 一致                                                                                                                                                                                                                                  |

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

### 5-2. `CompleteShoppingUseCase`（冪等性・S-3・最重要）

冪等ガード（`status === 'completed'` なら Pantry/Product には一切触れず MealPlan 修復のみ行う）の確認。

| #                        | 前提                                                                                                       | 操作                                   | 期待結果                                                                                                                                                         | 分類       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| CS-IDEM-01（**最重要**） | `status: 'completed'` の ShoppingList を seed                                                              | `execute({ shoppingListId })`          | throw せず `ShoppingListDto`（`status: 'completed'`）が返る                                                                                                      | 正常・冪等 |
| CS-IDEM-02（**最重要**） | 同上。Pantry に既に当該品目由来の Stock が、Product に既に価格履歴が記録済み（1回目実行済みを模した seed） | `execute({ shoppingListId })` を再実行 | `pantryRepository.saveCount === 0`、`productRepository.saveCount === 0`（冪等ガードにより Stock 追加・価格記録の処理自体が実行されない。二重化しないことの確認） | 冪等性     |
| CS-IDEM-03               | `status: 'completed'`、対応 MealPlan が既に `'cooking'`                                                    | `execute({ shoppingListId })`          | `mealPlanRepository.saveCount === 0`（既に修復不要のため MealPlan 保存は発生しない）                                                                             | 冪等性     |

### 5-3. `CompleteShoppingUseCase`（部分失敗の自己修復・3 種・S-3・最重要）

| #                                 | 前提                                                                                                                                                                                                                                          | 操作                          | 期待結果                                                                                                                                                                                                                                                                                                                           | 分類                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| CS-REPAIR-01（**最重要・(i)**）   | `status: 'active'` の ShoppingList（bought 品目2件: item1, item2）。Pantry に item1 由来（`sourceShoppingItemId: item1.id`）の Stock が既に1件存在（1回目実行が Pantry 保存直後に失敗した状態を模した seed）。Product/MealPlan は未更新のまま | `execute({ shoppingListId })` | item1 の Stock は重複追加されない（`stocks` 中 item1 由来は1件のまま）。item2 の Stock が新規追加される（Pantry 内の Stock 総数が bought 品目数と一致）。後続段（価格記録・`complete()`・MealPlan 遷移）はすべて実行される（`productRepository.saveCount`/`mealPlanRepository.saveCount` が増える、`list.status === 'completed'`） | 正常・冪等性・防御性 |
| CS-REPAIR-02（**最重要・(ii)**）  | `status: 'completed'`、対応 MealPlan が `status: 'shopping'`                                                                                                                                                                                  | `execute({ shoppingListId })` | `mealPlan.transitionTo('cooking')` が1回呼ばれ `status === 'cooking'` になる。`mealPlanRepository.saveCount` が1増える                                                                                                                                                                                                             | 正常・冪等性         |
| CS-REPAIR-03（**最重要・(iii)**） | `status: 'completed'`、対応 MealPlan が `status: 'draft'`（Generate の部分失敗が未修復のまま完了に到達したケース）                                                                                                                            | `execute({ shoppingListId })` | 二段遷移（`transitionTo('shopping')` → `transitionTo('cooking')`）で `status === 'cooking'` になる。`mealPlanRepository.saveCount` が1増える（2回の transitionTo に対し save は1回）                                                                                                                                               | 正常・冪等性         |
| CS-REPAIR-04（**最重要・D-4**）   | `status: 'completed'`、対応 MealPlan が `mealPlanRepository.findById` で `null`                                                                                                                                                               | `execute({ shoppingListId })` | エラーにならず `ShoppingListDto` が返る。`mealPlanRepository.saveCount` は増えない（遷移ステップがスキップされる）                                                                                                                                                                                                                 | 正常・防御性         |
| CS-REPAIR-05（境界）              | `status: 'completed'`、対応 MealPlan が `status: 'consuming'`（draft でも shopping でもない）                                                                                                                                                 | `execute({ shoppingListId })` | 何も遷移しない。`mealPlanRepository.saveCount` は増えない                                                                                                                                                                                                                                                                          | 境界                 |

### 5-4. `CompleteShoppingUseCase`（価格記録スキップ 5 条件・S-9・最重要）

いずれも「その品目の価格記録のみスキップし、Stock 追加・完了処理は続行する」ことが期待結果の共通部分。

| #                                         | 前提                                                                                                                                                              | 操作                          | 期待結果                                                                                                                                                   | 分類         |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| CS-SKIP-01（**最重要・条件1**）           | bought 品目の `productId === null`                                                                                                                                | `execute({ shoppingListId })` | 当該品目の価格記録は行われない（`PriceRecord.create` が呼ばれない）。Stock は追加される                                                                    | 正常・境界   |
| CS-SKIP-02（**最重要・条件2・S-8**）      | bought 品目の `actualPrice.amount === 0`（無料でもらった品）                                                                                                      | `execute({ shoppingListId })` | 当該品目の価格記録がスキップされる。Stock は追加される                                                                                                     | 正常・境界   |
| CS-SKIP-03（**最重要・条件3・S-6 連動**） | bought 品目の `requiredAmount === null`（`amountNote` のみ）                                                                                                      | `execute({ shoppingListId })` | 当該品目の価格記録がスキップされる（CS-B-01 と同一 fixture で重複確認）                                                                                    | 正常・境界   |
| CS-SKIP-04（**最重要・条件3**）           | bought 品目の `requiredAmount: Quantity.of(0, 'g')`（value=0）                                                                                                    | `execute({ shoppingListId })` | 当該品目の価格記録がスキップされる（`packageSize` が導出できない）                                                                                         | 境界         |
| CS-SKIP-05（**最重要・条件4**）           | bought 品目の `actualPrice: Money.of(1,'JPY')`、`requiredAmount: Quantity.of(10000,'個')`（`UnitPriceCalculator.calculate` の結果が丸めで 0 になる超安価×大容量） | `execute({ shoppingListId })` | `PriceRecord.create` の呼び出し自体が行われず（正数チェックで throw させない防御的ガード）、価格記録はスキップされる。完了処理全体はエラーにならず続行する | 境界・防御性 |
| CS-SKIP-06（**最重要・条件5**）           | bought 品目の `productId` に対応する `productRepository.findById` が `null`（削除済み Product）                                                                   | `execute({ shoppingListId })` | 当該品目の価格記録がスキップされる。エラーにならず完了処理は続行する                                                                                       | 正常・防御性 |
| CS-SKIP-07（境界）                        | 同一 `productId` を持つ bought 品目が2件、うち1件は `actualPrice.amount === 0`（スキップ条件）、もう1件は正常                                                     | `execute({ shoppingListId })` | 対象 Product に `PriceRecord` が1件だけ追加される（スキップされた品目分は追加されない）                                                                    | 境界         |

### 5-5. `CompleteShoppingUseCase`（D-5 グルーピング・N+1 緩和）

| #                      | 前提                                                           | 操作                          | 期待結果                                                                                                                                                     | 分類       |
| ---------------------- | -------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| CS-D5-01（**最重要**） | 同一 `productId` を持つ bought 品目が2件（ともに価格記録対象） | `execute({ shoppingListId })` | `productRepository.save` が当該 Product に対して**1回だけ**呼ばれる（品目ごとに2回ではない）。`product.priceHistory.length` は2増える（2件とも記録はされる） | 正常・性能 |
| CS-D5-02               | 同上                                                           | `execute({ shoppingListId })` | `productRepository.findById` が当該 `productId` に対して1回だけ呼ばれる（品目数ぶんではなく unique productId 数ぶん）                                        | 正常・性能 |

### 5-6. `ConsumeStockUseCase`（D-3・S-7 クランプ境界・最重要）

依存: `PantryRepository` のみ。戻り値は更新後の `PantryDto`（全在庫。D-3）。

| #                                 | 前提                                                                           | 操作                                                                               | 期待結果                                                                                                                                            | 分類                   |
| --------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| CON-N-01                          | `stocks` に対象 `stockId`（amount 300g）を含む Pantry を seed                  | `execute({ stockId, amount: { value: 100, unit: 'g' } })`                          | 対象 Stock の `amount.value === 200` に更新され、更新後の `PantryDto`（`stocks` に対象 Stock を含む）が返る                                         | 正常                   |
| CON-N-02（**最重要・境界・S-7**） | `stocks` に amount 200g の対象 Stock を含む Pantry                             | `execute({ stockId, amount: { value: 200, unit: 'g' } })`（消費量=在庫量）         | 対象 Stock が返り値の `PantryDto.stocks` から消える（ゼロ到達→削除）                                                                                | 境界                   |
| CON-N-03（**最重要・境界・S-7**） | 同上                                                                           | `execute({ stockId, amount: { value: 999, unit: 'g' } })`（消費量>在庫量）         | throw せず、対象 Stock が返り値の `PantryDto.stocks` から消える（クランプ経由の削除）                                                               | 境界                   |
| CON-E-01（**最重要**）            | 対象 `stockId` が Pantry の `stocks` に存在しない                              | `execute({ stockId: '不存在', amount })`                                           | `StockNotFoundError` を throw                                                                                                                       | 異常                   |
| CON-E-02（**最重要**）            | 対象 Stock の `amount.unit === 'g'`、入力 `amount.unit === '個'`（単位不一致） | `execute({ stockId, amount: { value: 1, unit: '個' } })`                           | `InvalidStockOperationError` を throw（UseCase 入口の事前チェックで検出。Domain の `consume()` 内部 throw には到達しない）                          | 異常                   |
| CON-IDEM-01（非冪等の明示）       | `stocks` に amount 300g の対象 Stock を含む Pantry                             | 同一内容で `execute({ stockId, amount: { value: 100, unit: 'g' } })` を2回連続実行 | 2回目実行後の `amount.value === 100`（300→200→100 と2回分減算される。ConsumeStock は冪等でない。設計書 §API設計「冪等性キー一覧」で明記済みの仕様） | 冪等性（非冪等の確認） |

### 5-7. `DiscardStockUseCase`（D-3・最重要）

依存: `PantryRepository` のみ。戻り値は更新後の `PantryDto`。

| #                            | 前提                                                   | 操作                             | 期待結果                                                                           | 分類 |
| ---------------------------- | ------------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------- | ---- |
| DIS-N-01                     | `stocks` に対象 `stockId` の Stock を含む Pantry       | `execute({ stockId })`           | 対象 Stock が返り値の `PantryDto.stocks` から消える                                | 正常 |
| DIS-N-02（**最重要・境界**） | `amount.value === 500`（大量に残っている）の対象 Stock | `execute({ stockId })`           | 残量に関わらず全量削除される（部分廃棄なし。要件 §7-4 の確認事項に対する確定回答） | 境界 |
| DIS-E-01（**最重要**）       | 対象 `stockId` が Pantry の `stocks` に存在しない      | `execute({ stockId: '不存在' })` | `StockNotFoundError` を throw                                                      | 異常 |

### 5-8. `GetPantryUseCase`（S-1・最重要）

依存: `PantryRepository` のみ。入力なし・エラーなし（設計書どおり）。

| #                           | 前提                                                            | 操作        | 期待結果                                                                                                               | 分類       |
| --------------------------- | --------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- | ---------- |
| GET-N-01                    | `stocks` に複数件の Stock を持つ Pantry                         | `execute()` | 全 Stock を含む `PantryDto` が返る                                                                                     | 正常       |
| GET-N-02（**最重要・S-1**） | `stocks` が空の Pantry（`InMemoryPantryRepository` の初期状態） | `execute()` | throw せず `{ stocks: [] }` が返る（未作成という状態自体が存在しない。要件 §7-5 の「404 か空 Pantry か」への確定回答） | 正常・境界 |

### 5-9. エラークラス 2 本

| #      | 前提 | 操作                                                                  | 期待結果                                                                                                                      | 分類 |
| ------ | ---- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---- |
| ERR-01 | —    | `new StockNotFoundError('stock-1')`                                   | `.message === 'Stock not found: stock-1'`、`.name === 'StockNotFoundError'`（`ShoppingItemNotFoundError` 等の既存先例と同型） | 正常 |
| ERR-02 | —    | `new InvalidStockOperationError('Unit mismatch: expected 個, got g')` | `.message === 'Unit mismatch: expected 個, got g'`、`.name === 'InvalidStockOperationError'`                                  | 正常 |

---

## 6. Infrastructure 層試験観点（PGlite 統合）

テストランナー: Vitest（co-located: `packages/infrastructure/src/repositories/drizzle-pantry.repository.test.ts`）。

**前提条件（必須）**: `create-test-db.ts` の `DDL` 定数に `stocks` の `CREATE TABLE IF NOT EXISTS` 文が
追記されていること（設計書 §DB設計・契約設計書 §2 の列定義と機械的に対応させる。`source_shopping_item_id`
に `UNIQUE` 制約を含めること）。未追記のままテストを実行すると全ケースが
`relation "stocks" does not exist` 等の DB エラーで失敗する。`pantries` テーブルは存在しない（S-2）。

| #                                    | 前提                                                                                                     | 操作                                                                                             | 期待結果                                                                                                                                                                                                                          | 分類                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| INF-01（**最重要・S-1**）            | 空の `stocks` テーブル                                                                                   | `repository.find()`                                                                              | `null` を返さず `Pantry`（`id.equals(PantryId.singleton())`、`stocks === []`）を返す                                                                                                                                              | 正常                 |
| INF-02                               | 空DB                                                                                                     | `repository.save(pantry)`（stocks 2件込み）                                                      | `stocks` テーブルに2行 INSERT される                                                                                                                                                                                              | 正常                 |
| INF-03                               | `save()` 済みの Pantry                                                                                   | `repository.find()`                                                                              | ドメイン `Pantry` に復元され、`stocks` の各フィールドが元の値と一致                                                                                                                                                               | 正常                 |
| INF-04（**最重要**）                 | `productId: null` の Stock を `save()`                                                                   | `find()` で復元                                                                                  | `productId === null`                                                                                                                                                                                                              | データ整合性         |
| INF-05                               | `productId: ProductId.fromString('p1')` の Stock を `save()`                                             | `find()` で復元                                                                                  | `productId.value === 'p1'`（`ProductId.fromString` 経由で復元）                                                                                                                                                                   | データ整合性         |
| INF-06（**最重要**）                 | `expiresAt: null` の Stock を `save()`                                                                   | `find()` で復元                                                                                  | `expiresAt === null`                                                                                                                                                                                                              | データ整合性         |
| INF-07（**最重要・回帰**）           | `expiresAt: new Date('2026-08-01T00:00:00')`（ローカル日付）の Stock を `save()`                         | `find()` で復元                                                                                  | `expiresAt` の年月日が保存前と完全一致（`2026-08-01`）。`toISOString()` ベースの変換による前日ずれが起きないこと（shopping-list-core INF-16・JST 前日ずれ回帰と同型の重点確認）                                                   | データ整合性・防御性 |
| INF-08                               | `storedLocation: null` の Stock を `save()`                                                              | `find()` で復元                                                                                  | `storedLocation === null`                                                                                                                                                                                                         | データ整合性         |
| INF-09                               | `storedLocation` に `'fridge'`/`'freezer'`/`'pantry'`（3パターン）の Stock を `save()`                   | `find()` で復元                                                                                  | それぞれ元の値どおりに復元される（網羅 switch の確認）                                                                                                                                                                            | データ整合性         |
| INF-10（**最重要**）                 | `sourceShoppingItemId: null` の Stock を `save()`                                                        | `find()` で復元                                                                                  | `sourceShoppingItemId === null`                                                                                                                                                                                                   | データ整合性         |
| INF-11                               | `sourceShoppingItemId: ShoppingItemId.fromString('i1')` の Stock を `save()`                             | `find()` で復元                                                                                  | `sourceShoppingItemId.value === 'i1'`（`ShoppingItemId.fromString` 経由で復元）                                                                                                                                                   | データ整合性         |
| INF-12（**最重要・S-3 最終防衛線**） | `sourceShoppingItemId: ShoppingItemId.fromString('i1')` を持つ Stock1件を `save()` 済み                  | 同一 `sourceShoppingItemId: 'i1'` を持つ**別の** Stock（異なる `id`）を追加した状態で再 `save()` | `stocks.source_shopping_item_id UNIQUE` 制約違反により DB エラーが throw される（「1 bought 品目 : 最大 1 Stock」不変条件の最終防衛線。Application 層の事前スキップがバイパスされた場合でも DB レベルで二重追加を防ぐことの確認） | 異常・データ整合性   |
| INF-13                               | stocks 2件を持つ Pantry を `save()` 済み                                                                 | ドメイン側で1件を除いた state（`Pantry.reconstruct` で stocks 1件のみに再構成）を再 `save()`     | `stocks` テーブルから該当行が `DELETE` される（`NOT IN (currentIds)` ロジック確認）                                                                                                                                               | データ整合性         |
| INF-14（境界）                       | stocks 2件を持つ Pantry を `save()` 済み                                                                 | stocks 0件の state で再 `save()`                                                                 | 既存の `stocks` がすべて `DELETE` される（`currentIds.length === 0` 時の全 DELETE 分岐）                                                                                                                                          | 境界・データ整合性   |
| INF-15                               | `amount: Quantity.of(2.5, 'kg')` の Stock を `save()`                                                    | `find()` で復元                                                                                  | `amount.value === 2.5`、`amount.unit === 'kg'`（数値・単位の往復）                                                                                                                                                                | データ整合性         |
| INF-16（**最重要・FIFO**）           | `purchasedAt` が異なる複数の Stock を、保存順序を入れ替えて `save()`（新しい日付の Stock を先に insert） | `find()`                                                                                         | 返される `stocks` が `purchasedAt` 昇順（FIFO）で並んでいる                                                                                                                                                                       | 正常・データ整合性   |
| INF-17                               | 任意の内容で `save()` 済み                                                                               | `find()`                                                                                         | 復元された `Pantry.id` は常に `PantryId.singleton()`（DB に `pantry_id` 相当の永続化列がなくても常に固定値が与えられる）                                                                                                          | 正常                 |
| INF-18                               | `amount: Quantity.of(300,'g')` の Stock を `save()` 済み                                                 | ドメイン側で `amount` を `Quantity.of(100,'g')` に変更した state を同一 `id` で再 `save()`       | `stocks` テーブルが1行のまま `amount_value` のみ更新される（`onConflictDoUpdate` の確認。他の不変列は変化しない）                                                                                                                 | データ整合性         |
| INF-19（境界）                       | `sourceShoppingItemId: null` の Stock を2件同時に `save()`                                               | —                                                                                                | UNIQUE 制約違反にならず両方保存される（PostgreSQL の UNIQUE は NULL 同士を重複とみなさない。S-2 設計注記の確認）                                                                                                                  | 境界・データ整合性   |

---

## 7. Presentation 層試験観点（Hono ルート）

テストランナー: Vitest（co-located: `apps/web/src/server/routes/pantry.test.ts`（新規）、既存
`apps/web/src/server/routes/shopping-lists.test.ts` への追記）。`meal-plans.test.ts`/`shopping-lists.test.ts`
のパターン（`vi.mock('@/db/client')` + `vi.mock('@cookpit/application')` で UseCase をモック化）を踏襲する。

### 7-1. `GET /api/pantry`（GetPantry・S-1）

| #                           | 前提                                                                       | 操作              | 期待結果                                 | 分類       |
| --------------------------- | -------------------------------------------------------------------------- | ----------------- | ---------------------------------------- | ---------- |
| P-GET-01                    | `GetPantryUseCase.execute` が `PantryDto`（stocks 複数件）を返すようモック | `GET /api/pantry` | 200 + `PantryResponse`                   | 正常       |
| P-GET-02（**最重要・S-1**） | `GetPantryUseCase.execute` が `{ stocks: [] }` を返すようモック            | `GET /api/pantry` | 200（404 にならない） + `{ stocks: [] }` | 正常・境界 |

### 7-2. `POST /api/pantry/stocks/:stockId/consume`（ConsumeStock）

| #                           | 前提                                                          | 操作                                                                                          | 期待結果                                                                                              | 分類 |
| --------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---- |
| P-CON-01                    | `ConsumeStockUseCase.execute` が `PantryDto` を返すようモック | `POST /api/pantry/stocks/:stockId/consume` body: `{ "amount": { "value": 1, "unit": "個" } }` | 200 + `PantryResponse`、`execute` に `{ stockId, amount }` が渡る                                     | 正常 |
| P-CON-02                    | —                                                             | `stockId` に不正 UUID                                                                         | 400、`execute` は呼ばれない                                                                           | 異常 |
| P-CON-03（**最重要・D-6**） | —                                                             | body: `{ "amount": { "value": 0, "unit": "個" } }`                                            | 400（`consumeStockSchema` の `positive()` により zValidator レベルで reject。`execute` は呼ばれない） | 異常 |
| P-CON-04                    | `execute` が `StockNotFoundError` を reject                   | `POST .../consume`（有効な body）                                                             | 404                                                                                                   | 異常 |
| P-CON-05                    | `execute` が `InvalidStockOperationError` を reject           | 同上                                                                                          | 422                                                                                                   | 異常 |

### 7-3. `POST /api/pantry/stocks/:stockId/discard`（DiscardStock）

| #        | 前提                                                          | 操作                                                     | 期待結果                    | 分類 |
| -------- | ------------------------------------------------------------- | -------------------------------------------------------- | --------------------------- | ---- |
| P-DIS-01 | `DiscardStockUseCase.execute` が `PantryDto` を返すようモック | `POST /api/pantry/stocks/:stockId/discard`（ボディなし） | 200 + `PantryResponse`      | 正常 |
| P-DIS-02 | —                                                             | `stockId` に不正 UUID                                    | 400、`execute` は呼ばれない | 異常 |
| P-DIS-03 | `execute` が `StockNotFoundError` を reject                   | `POST .../discard`（有効な `stockId`）                   | 404                         | 異常 |

### 7-4. `POST /api/shopping-lists/:id/complete`（CompleteShopping・最重要）

| #                                     | 前提                                                                                                 | 操作                                                      | 期待結果                                                                                                                                  | 分類       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| P-COMPLETE-01                         | `CompleteShoppingUseCase.execute` が `ShoppingListDto`（`status: 'completed'`）を返すようモック      | `POST /api/shopping-lists/:id/complete`（ボディなし）     | 200 + `ShoppingListResponse`                                                                                                              | 正常       |
| P-COMPLETE-02（**最重要・S-3 冪等**） | 同一 `execute` モックを2回連続で呼び出す設定（両方とも `status: 'completed'` の同一形状 DTO を返す） | `POST /api/shopping-lists/:id/complete` を2回連続呼び出し | 両方とも 200、レスポンスの `ShoppingListResponse` 形が一致する（契約レベルの冪等確認。UseCase 内部の副作用非重複は CS-IDEM-01/02 の責務） | 正常・冪等 |
| P-COMPLETE-03                         | —                                                                                                    | `id` に不正 UUID                                          | 400、`execute` は呼ばれない                                                                                                               | 異常       |
| P-COMPLETE-04                         | `execute` が `ShoppingListNotFoundError` を reject                                                   | `POST /api/shopping-lists/:id/complete`（有効な `id`）    | 404                                                                                                                                       | 異常       |

`InvalidShoppingListStateError` は S-3 の冪等設計により `CompleteShoppingUseCase` からは到達しない
（§3-7 で既述）。既存の 422 分岐自体（`app.ts` の変更なし部分）は他エンドポイント経由で回帰確認する。

### 7-5. 回帰

| #        | 前提                                   | 操作                                                                                                                                                             | 期待結果                                                                             | 分類 |
| -------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---- |
| P-REG-01 | `pantryRoute` を `app.ts` にマウント後 | `GET /api/health`、`GET /api/recipes`、`GET /api/products`、`GET /api/stores`、`GET /api/meal-plans/current`、既存 5 本の `shopping-lists` エンドポイント        | 既存レスポンスが変わらない                                                           | 回帰 |
| P-REG-02 | 同上                                   | 既存の 9 onError 分岐（Recipe/Product/Store/MealPlan/PlannedRecipe/InvalidMealPlanState/ShoppingList/ShoppingItem/InvalidShoppingListState）に該当するリクエスト | 既存の 404/422 挙動が変わらない（新規2分岐の追記が既存分岐の順序・挙動に影響しない） | 回帰 |

---

## 8. 契約テスト観点（API Contract）

テストランナー: Vitest（co-located: `packages/api-contract/src/pantry.schema.test.ts`）。基盤は導入済み。
`shopping-list.schema.test.ts`/`meal-plan.schema.test.ts` のパターン（`describe` をスキーマ単位に分け、
正常系・境界・reject を並べる）に倣う。契約設計書 §7.1 の観点を土台とする。

### 8-1. `stockIdParamSchema` / `consumeStockSchema` / `storageLocationSchema`

| #                       | 前提 | 操作                                                                                                  | 期待結果                                                                                              | 分類       |
| ----------------------- | ---- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------- |
| Z-01                    | —    | `stockIdParamSchema.parse({ stockId: <valid uuid> })`                                                 | 成功                                                                                                  | 正常       |
| Z-02                    | —    | `stockIdParamSchema.parse({ stockId: 'not-a-uuid' })`                                                 | `ZodError`                                                                                            | 異常       |
| Z-03（**最重要・D-6**） | —    | `consumeStockSchema.parse({ amount: { value: 0, unit: '個' } })`                                      | `ZodError`（`addItemSchema.requiredAmount.value: z.number().min(0)` の 0 許容との**意図的な非対称**） | 異常       |
| Z-04                    | —    | `consumeStockSchema.parse({ amount: { value: -1, unit: '個' } })`                                     | `ZodError`                                                                                            | 異常       |
| Z-05                    | —    | `consumeStockSchema.parse({ amount: { value: 1, unit: '個' } })`                                      | 成功                                                                                                  | 正常       |
| Z-06                    | —    | `unitSchema` の17値それぞれで `consumeStockSchema.parse({ amount: { value: 1, unit } })`（`it.each`） | 全17値で成功（`recipe.schema.ts` の `unitSchema` 再利用の悉皆確認）                                   | 正常・境界 |
| Z-07                    | —    | `consumeStockSchema.parse({ amount: { value: 1, unit: 'ポンド' } })`                                  | `ZodError`（17値の enum 外）                                                                          | 異常       |
| Z-08                    | —    | `consumeStockSchema.parse({})`（`amount` キー省略）                                                   | `ZodError`                                                                                            | 異常       |
| Z-09                    | —    | `storageLocationSchema.parse('fridge')` / `'freezer'` / `'pantry'`                                    | いずれも成功                                                                                          | 正常       |
| Z-10                    | —    | `storageLocationSchema.parse('shelf')`（未知の文字列）                                                | `ZodError`                                                                                            | 異常       |

### 8-2. `stockResponseSchema` / `pantryResponseSchema`（最重要）

| #                       | 前提 | 操作                                                                                                                                                                          | 期待結果                                                 | 分類       |
| ----------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------- |
| Z-11（**最重要**）      | —    | `stockResponseSchema.parse({ id, productId: null, displayName: '塩', amount: { value: 1, unit: '個' }, purchasedAt: <ISO datetime>, expiresAt: null, storedLocation: null })` | 成功（S-4/S-5 の nullable フィールド全 null パターン）   | 正常       |
| Z-12                    | —    | `productId`/`expiresAt`/`storedLocation` すべて非 null の Stock で `stockResponseSchema.parse()`                                                                              | 成功                                                     | 正常       |
| Z-13                    | —    | `purchasedAt: '2026-08-01'`（ISO date のみ。datetime 形式でない）                                                                                                             | `ZodError`                                               | 異常       |
| Z-14                    | —    | `expiresAt: '2026-08-01T00:00:00.000Z'`（ISO datetime。date 形式でない）                                                                                                      | `ZodError`（`z.iso.date()` は datetime 文字列を reject） | 異常       |
| Z-15（**最重要・S-1**） | —    | `pantryResponseSchema.parse({ stocks: [] })`                                                                                                                                  | 成功（空 Pantry 応答が契約上も正当であることの確認）     | 正常・境界 |
| Z-16                    | —    | `pantryResponseSchema.parse({ stocks: [stock1, stock2] })`                                                                                                                    | 成功                                                     | 正常       |

### 8-3. 型往復・非対称性・回帰

| #                          | 前提                                                                                                                                                     | 操作                                                                                                                                                   | 期待結果                                                                       | 分類       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------- |
| Z-17（**最重要・型往復**） | `Pantry`/`Stock` の fixture（`reconstruct` で組み立て。`productId`/`expiresAt`/`storedLocation`/`sourceShoppingItemId` の null/非null 全パターンを含む） | `toPantryDto(pantry)` → `pantryResponseSchema.parse(dto)`                                                                                              | 成功する（Mapper 出力が契約を満たすことの確認）                                | 正常・回帰 |
| Z-18（**最重要・回帰**）   | —                                                                                                                                                        | `consumeStockSchema` の `value: 0` reject（Z-03）と `addItemSchema.requiredAmount.value` の `value: 0` 許容（shopping-list-core Z-05）を対比するテスト | 意図的な非対称であることをコード上に明示する回帰テスト（D-6 の設計意図の記録） | 回帰       |
| Z-19（回帰）               | `shopping-list.schema.ts` は本ユニットでの変更なし                                                                                                       | `shoppingListResponseSchema.parse()` に `status: 'completed'` の fixture を渡す                                                                        | 引き続き成功する（完了 API がこのスキーマをそのまま再利用することの前提確認）  | 回帰       |

---

## 9. 冪等性・整合性の観点（横断まとめ）

設計由来の最重要観点を層横断で整理する（実装レビュー時のチェックリストとして利用できる粒度）。

### 9-1. CompleteShopping の冪等性・部分失敗修復（S-3・本ユニットの核）

| 観点                                                                                  | 担当層・観点 ID                      |
| ------------------------------------------------------------------------------------- | ------------------------------------ |
| 同一 shoppingListId の2回目呼び出し（completed）は Stock 追加・価格記録を再実行しない | CS-IDEM-01, CS-IDEM-02（**最重要**） |
| (i) Stock 追加済み + status=active → 再実行で二重追加なし・後続段が実行される         | CS-REPAIR-01（**最重要**）           |
| (ii) completed + MealPlan=shopping → 一段遷移で修復                                   | CS-REPAIR-02（**最重要**）           |
| (iii) completed + MealPlan=draft → 二段遷移で修復                                     | CS-REPAIR-03（**最重要**）           |
| MealPlan 不存在はスキップして完了を優先（D-4）                                        | CS-REPAIR-04, CS-N-10（**最重要**）  |
| DB UNIQUE（`source_shopping_item_id`）が最終防衛線                                    | INF-12（**最重要**）                 |
| API 契約レベルでの冪等（2回連続 200・同一形状）                                       | P-COMPLETE-02（**最重要**）          |

### 9-2. 価格記録スキップ 5 条件（S-9）

| 条件 | 内容                                                       | 観点 ID                              |
| ---- | ---------------------------------------------------------- | ------------------------------------ |
| 1    | `productId === null`                                       | CS-SKIP-01（**最重要**）             |
| 2    | `actualPrice.amount <= 0`（S-8・無料品）                   | CS-SKIP-02（**最重要**）             |
| 3    | `requiredAmount === null` または `.value <= 0`             | CS-SKIP-03, CS-SKIP-04（**最重要**） |
| 4    | `UnitPriceCalculator.calculate()` の結果が丸めで 0         | CS-SKIP-05（**最重要**）             |
| 5    | `productRepository.findById` が `null`（削除済み Product） | CS-SKIP-06（**最重要**）             |
| 混在 | 同一 Product 内でスキップ対象・記録対象が混在              | CS-SKIP-07                           |

### 9-3. consume クランプ境界（S-7）

| 観点                                                                | 担当層・観点 ID                    |
| ------------------------------------------------------------------- | ---------------------------------- |
| `Quantity.subtract()` は負値で厳格に throw（VO レベル）             | QTY-SUB-04（**最重要**）           |
| `Stock.consume()` は消費量=在庫量でちょうどゼロ                     | STK-CON-02（**最重要**）           |
| `Stock.consume()` は消費量>在庫量で全量クランプ（throw しない）     | STK-CON-03（**最重要**）           |
| `Pantry.consumeStock()` はゼロ到達で Stock を削除                   | PT-CON-03, PT-CON-04（**最重要**） |
| `ConsumeStockUseCase` は Domain のクランプ結果をそのまま DTO に反映 | CON-N-02, CON-N-03（**最重要**）   |

### 9-4. D-3（更新後 DTO 返却）・D-5（グルーピング）・D-6（契約非対称）

| 観点                                                                                          | 担当層・観点 ID          |
| --------------------------------------------------------------------------------------------- | ------------------------ |
| Consume/Discard は更新後の全 `PantryDto` を返す（`void`/`StockDto\|null` ではない）           | CON-N-01, DIS-N-01       |
| 価格記録は productId ごとにグルーピングし save は Product 1件につき1回                        | CS-D5-01, CS-D5-02       |
| `consumeStockSchema.amount.value` は 0 を reject（Domain の `Quantity.of(0)` 許容とは非対称） | Z-03, Z-18（**最重要**） |

---

## 10. 境界値一覧

| 対象                                          | 境界                         | 許容/拒否                          | 観点 ID                           |
| --------------------------------------------- | ---------------------------- | ---------------------------------- | --------------------------------- |
| `Stock.create().amount.value`                 | `0`                          | 拒否                               | STK-CR-04（**最重要**）           |
| `Stock.create().amount.value`                 | `1` 以上                     | 許容                               | STK-CR-01                         |
| `Quantity.subtract()`                         | 減算結果 `0`（ちょうど一致） | 許容                               | QTY-SUB-03                        |
| `Quantity.subtract()`                         | 減算結果が負                 | 拒否（throw）                      | QTY-SUB-04（**最重要**）          |
| `Stock.consume()`                             | 消費量 = 在庫量              | 許容・ゼロクランプ                 | STK-CON-02（**最重要**）          |
| `Stock.consume()`                             | 消費量 > 在庫量              | 許容・全量クランプ（throw しない） | STK-CON-03（**最重要**）          |
| `consumeStockSchema.amount.value`（契約）     | `0`                          | 拒否（D-6）                        | Z-03（**最重要**）                |
| `consumeStockSchema.amount.value`（契約）     | 正数                         | 許容                               | Z-05                              |
| `requiredAmount`（CompleteShopping 入力）     | `null`（amountNote のみ）    | Stock は 1個・価格記録スキップ     | CS-B-01（**最重要**）             |
| `actualPrice.amount`（CompleteShopping 入力） | `0`                          | Stock 追加は続行・価格記録スキップ | CS-SKIP-02（**最重要**）          |
| `UnitPriceCalculator` 結果                    | 丸めで `0`                   | 価格記録スキップ                   | CS-SKIP-05（**最重要**）          |
| bought 品目数                                 | `0`                          | 完了は成功・Stock 追加なし         | CS-B-02                           |
| `discardStock` 対象の残量                     | 任意（大量含む）             | 残量に関わらず全量削除             | PT-DIS-03, DIS-N-02（**最重要**） |
| `stocks.source_shopping_item_id`（DB）        | 同一値の非 null 重複         | 拒否（UNIQUE 違反）                | INF-12（**最重要**）              |
| `stocks.source_shopping_item_id`（DB）        | `null` 同士の重複            | 許容                               | INF-19                            |
| `GetPantryUseCase` / `GET /api/pantry`        | stocks 0件                   | 200（404 にしない）                | GET-N-02, P-GET-02（**最重要**）  |
| MealPlan.status（D-4 修復）                   | `draft`                      | 二段遷移で修復                     | CS-REPAIR-03（**最重要**）        |
| MealPlan.status（D-4 修復）                   | `shopping`                   | 一段遷移で修復                     | CS-REPAIR-02（**最重要**）        |
| MealPlan.status（D-4 修復）                   | `null`（不存在）             | スキップ（完了優先）               | CS-REPAIR-04（**最重要**）        |
| MealPlan.status（D-4 修復）                   | `consuming`/`completed` 等   | 何もしない                         | CS-REPAIR-05                      |

---

## 11. 試験データ

各層で共通利用できる fixture の方針を示す（具体的な生成関数は implementer が各テストファイル内に実装
する。shopping-list-core の `seededShoppingList`/`seededShoppingItem` パターンを踏襲）。

| Fixture                                                                                   | 内容                                                                                                                                                                                      | 用途                                                     |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `seededPantry(stocks)`                                                                    | `Pantry.reconstruct({ id: PantryId.singleton(), stocks })` で任意の stocks 配列を持つ Pantry を組み立てるヘルパー                                                                         | Domain/Application 全般                                  |
| `seededStock(id, overrides)`                                                              | `Stock.reconstruct(...)` で任意フィールドを上書きできるヘルパー（`productId`/`expiresAt`/`storedLocation`/`sourceShoppingItemId` の null/非null 全パターン、`amount` 任意値を容易に生成） | Domain/Application/Contract 全般                         |
| `InMemoryPantryRepository`                                                                | S-1 に合わせ単一 `Pantry` インスタンスを保持（`find()` は常に非 null）。`save()` で `saveCount` を計測、`seed(pantry)` で初期状態を注入                                                   | Application（Consume/Discard/Get/CompleteShopping 共通） |
| `InMemoryShoppingListRepository`/`InMemoryMealPlanRepository`/`InMemoryProductRepository` | shopping-list-core の既存テストダブルをそのまま再利用・再定義（`saveCount`/`seed`/`findById` 実装）                                                                                       | Application（CompleteShoppingUseCase）                   |
| `CountingProductRepository`（`InMemoryProductRepository` のラッパー）                     | `findById` の呼び出し回数を記録する薄いラッパー                                                                                                                                           | CS-D5-02（N+1 緩和の確認）                               |
| UUID 定数群                                                                               | `SHOPPING_LIST_ID`/`SHOPPING_ITEM_ID_1`/`SHOPPING_ITEM_ID_2`/`MEAL_PLAN_ID`/`PRODUCT_ID`/`STORE_ID`/`STOCK_ID`                                                                            | Application・Presentation・Contract 全般                 |
| 価格スキップ用 fixture                                                                    | `actualPrice: Money.of(1,'JPY')` + `requiredAmount: Quantity.of(10000,'個')`（CS-SKIP-05 の丸め0再現）、`actualPrice: Money.of(0,'JPY')`（CS-SKIP-02）                                    | Application（CompleteShoppingUseCase 価格スキップ）      |
| ローカル日付定数                                                                          | `'2026-08-01'`（`expiresAt` の JST 前日ずれ回帰確認用）                                                                                                                                   | Infrastructure（INF-07）                                 |

**特に用意すべき境界データ**:

- `productId`/`expiresAt`/`storedLocation`/`sourceShoppingItemId` の null/非null 全組み合わせを持つ Stock
  （Infrastructure round-trip・Contract 型往復の両方で使用）
- bought 品目 0 件・1 件・複数件（うち同一 productId 混在）の ShoppingList
- MealPlan.status が `draft`/`shopping`/`cooking`/`consuming`/`completed`/存在しない、の6パターン
  （D-4 修復の悉皆確認用）
- 価格記録スキップ条件 1〜5 それぞれを単独で再現する bought 品目（CS-SKIP-01〜06 用）

---

## 12. 回帰範囲

`Quantity.subtract()` は既存クラスへの**純追加**（既存メソッドのシグネチャ変更なし）。`app.ts`・
`shopping-lists.ts`・各 `index.ts` への追記もすべて既存コードへの追記のみだが、共有ファイルへの変更で
あるため既存利用箇所への影響がないことを明示的に回帰確認する。

| #      | 対象                                                                                                                                     | 確認内容                                                                                                                                                   | 分類 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| REG-01 | `packages/domain/src/shared/quantity.test.ts` の既存ケース（`of`/`multiply`/`add`）                                                      | `subtract()` 追加後も引き続き green                                                                                                                        | 回帰 |
| REG-02 | `packages/domain/src/recipe/` / `packages/domain/src/product/` の `Quantity` 利用箇所（`multiply`/`add` のみ使用）                       | `subtract` を使用しないため直接の影響はないが、`quantity.ts` のインポート・エクスポート形が変わらないことを確認                                            | 回帰 |
| REG-03 | `packages/application/src/shopping-list/shopping-list-use-cases.test.ts`（既存 GEN/ADD/MB/RS/GET 系）                                    | `complete-shopping.use-case.ts` の追加が既存 UseCase テストに影響しない                                                                                    | 回帰 |
| REG-04 | `apps/web/src/server/routes/shopping-lists.test.ts` の既存 5 エンドポイントのテスト                                                      | `POST /:id/complete` 追記後も既存ケースが green                                                                                                            | 回帰 |
| REG-05 | `apps/web/src/server/app.ts` への route マウント + onError 2 分岐追加                                                                    | 既存 6 ルート群（recipes/products/stores/meal-plans/shopping-lists/health）のレスポンス・既存 9 onError 分岐の挙動が変わらない（P-REG-01/02 と対応）       | 回帰 |
| REG-06 | `packages/api-contract/src/index.ts` / `packages/application/src/index.ts` / `packages/infrastructure/src/index.ts` への `export *` 追加 | 既存の named export に名前衝突が発生しないこと                                                                                                             | 回帰 |
| REG-07 | `packages/infrastructure/src/db/schema.ts` への `stocks` 追記                                                                            | 既存テーブル（recipes/stores/products/price_records/meal_plans/planned_recipes/shopping_lists/shopping_items）の Drizzle Repository テストが引き続き green | 回帰 |
| REG-08 | `packages/api-contract/src/*.schema.test.ts`（既存 recipe/product/store/meal-plan/shopping-list 分）                                     | `pantry.schema.ts` からの `unitSchema` re-export が既存 export に影響しない                                                                                | 回帰 |

---

## 13. 完了条件

- 本計画の §4〜§8 に記載した全観点（Domain: PID/SID/QTY-SUB/STK/PT、Application: CS/CON/DIS/GET/ERR、
  Infrastructure: INF、Presentation: P、Contract: Z）が対応する co-located テストファイルに実装され、
  `pnpm test`（`turbo test`）で green
- 特に以下の最重要観点が実装され green であること:
  - **S-3 冪等・3種の部分失敗修復**: CS-IDEM-01〜03、CS-REPAIR-01〜04、INF-12（DB UNIQUE）、
    P-COMPLETE-02
  - **S-9 価格記録スキップ 5 条件**: CS-SKIP-01〜06
  - **S-7 consume クランプ境界**: QTY-SUB-04、STK-CON-02/03、PT-CON-03/04、CON-N-02/03
  - **S-1 常在モデル**: PID-01/02/04、INF-01、GET-N-02、P-GET-02
  - **S-5/S-6 Stock 化方針**: STK-CR-02、CS-N-03、CS-B-01
  - **D-4 MealPlan 修復**: CS-REPAIR-02〜05
- `pnpm lint` / `pnpm type-check` / `pnpm test` が全パッケージで通ること
- §2 のテスト実行環境確認どおり、Infrastructure 層の DDL 追記（`stocks` テーブル）が完了していること
  （前提条件）
- §12 の回帰範囲（既存 Quantity/ShoppingList/onError/export）が green のまま保たれていること

---

## 14. 未実装観点（基盤待ち・E2E 等）

以下は本試験計画のスコープに含めるが、Unit A（本ユニット）の実装だけでは実行できない、または
明示的に対象外とする観点。

| 観点                                                                    | 理由・扱い                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E2E（Playwright）: 買い物完了 → 在庫確認 → 使った/捨てた の一連シナリオ | `apps/web/playwright.config.ts` は既に整備済み（e2e-test-implementer 起動条件 1 を形式上満たす）だが、本ユニットは API のみで**画面が存在しない**（Unit B `pantry-screens` のスコープ）。ブラウザ操作の起点となる UI がないため、本ユニットの範囲では E2E シナリオを組めない。Unit B 実装後に既存 `recipe-crud.smoke.spec.ts` と同型のハッピーパス1本を追加することを推奨する |
| DB レベルでの真の同時実行（race condition）による UNIQUE 制約競合の再現 | PGlite 上での並行トランザクション再現は困難。INF-12 は「順次 `save()` で2回目がエラーになる」ことの確認にとどめ、真の同時アクセス競合は対象外とする（shopping-list-core と同じ方針。実運用は2名利用の低頻度アクセスのため許容）                                                                                                                                               |
| `calculateRequiredAmount` / `findByProduct` / `findExpiringSoon`        | S-11 により本ユニットで実装しないため試験対象外（Unit C / Phase 2）                                                                                                                                                                                                                                                                                                           |
| 消費・廃棄の `reason` と履歴（`stock_events` 相当）                     | S-10 により本ユニットに存在しないため試験対象外（Phase 2）                                                                                                                                                                                                                                                                                                                    |
| ConsumeStock の二重送信防止                                             | 非冪等であること自体は CON-IDEM-01 で確認済みだが、防止機構（デバウンス等）は Unit B のフロントエンド課題であり本ユニットには実装がない                                                                                                                                                                                                                                       |
| 価格記録の非冪等性（R-2・重複窓）                                       | S-3 (4) 案 B により許容されたリスクであり、「重複が起き得る」こと自体は CS-REPAIR-01 で間接的に確認するが、重複回数の上限や自動収束は設計上保証されないため、それ以上の網羅試験は行わない                                                                                                                                                                                     |
| 複数世帯対応時の `stocks.pantry_id` 追加                                | Phase 2（S-2 の申し送り）。本ユニットのシングルトン前提とは非互換になるため対象外                                                                                                                                                                                                                                                                                             |

---

## Orchestrator への確認事項

以下は試験計画作成中に気づいた点。設計判断そのものの変更は提案しない（本書は既存 S-x/D-x を
そのまま反映）が、実装着手前に軽微な確認を推奨する。

1. `docs/designs/pantry-core-contract.md` のヘッダーが `ステータス: draft（S-x がユーザー確定するまで
本書も draft）` のままだが、`docs/designs/pantry-core.md` は S-1〜S-11 全件確定済み（2026-07-14）。
   契約設計書の内容自体は確定済み S-x の推奨案をそのまま反映しており本書との矛盾はないため、本試験
   計画はその内容を確定扱いで採用した。ステータス表記の更新漏れの可能性があるため、implementation-planner
   着手前にヘッダーの `draft` → `confirmed` への更新を確認することを推奨する。
2. `apps/web/playwright.config.ts` が整備済みのため、orchestration-policy の e2e-test-implementer
   起動条件（条件1）を形式上満たす。ただし本ユニット（pantry-core）は API のみで UI 画面を持たない
   （Unit B `pantry-screens` が UI 担当）ため、e2e-test-implementer を本ユニットに対して起動しても
   操作対象の画面が存在しない。§14 に記載のとおり Unit B 実装後への先送りを推奨するが、起動要否の
   最終判断は Orchestrator に委ねる。

---

（本計画はコードを変更しない。試験観点・計画の記録のみを目的とする。テストコードの実装は
implementer の責務。）
