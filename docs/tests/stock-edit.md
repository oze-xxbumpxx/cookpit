# 試験計画: stock-edit

- 作成日: 2026-08-09
- 前提となる設計書: `docs/designs/stock-edit.md`（P-1〜P-6 ユーザー確定・2026-08-09・confirmed）
- 前提となる契約設計書: `docs/designs/stock-edit.contract.md`（confirmed。§9 契約テスト方針を
  そのまま踏襲し、本書では観点に ID を付与して層別に再配置する）
- 前提となる要件書: `docs/requirements/stock-edit.md`（正常系 N-1〜N-9 / 異常系 E-1〜E-6 /
  境界条件 B-1〜B-6）
- レベル: L3（Domain / Application / api-contract / Infrastructure / Presentation 全層。
  実装ルートは Codex 委譲）
- 実装状況: **未実装**。`Stock.updateDetails` / `Pantry.updateStockDetails` /
  `UpdateStockDetailsUseCase` / `updateStockSchema` / `PUT /api/pantry/stocks/:stockId` /
  `stock-edit-dialog.tsx` / `apps/web/src/app/_utils/expiry.ts` はいずれも新規。既存拡張対象は
  `DrizzlePantryRepository.save()` の `set` 句・`complete-shopping-panel.tsx`・`stock-row.tsx`・
  `pantry-client.tsx`・`page.tsx`（`/pantry`）。

## 試験種別

- **単体試験**: Domain（`Stock.updateDetails` / `Pantry.updateStockDetails`）、Application
  （`UpdateStockDetailsUseCase`、InMemory Repository）、api-contract（`updateStockSchema`）。
- **結合試験**: Infrastructure（PGlite。`DrizzlePantryRepository.save()` の回帰。**本ユニット
  最重要**）、Presentation の Hono ルート（`app.request()` インプロセス HTTP、UseCase は
  `vi.mock`）、RTL コンポーネントテスト（`stock-edit-dialog` / `complete-shopping-panel` 追記 /
  `stock-row` 追記 / `expiry.ts` 移設回帰）。
- **手動確認（manual-browser-verify）**: §10。過去 3 回の false PASS 事象を踏まえ、前提データの
  組み合わせ表とチェック項目を必須化する。

---

## 0. 実装コード走査結果（メソッド網羅チェックの基礎）

### 0-1. Domain（`packages/domain/src/pantry/pantry.ts`。実測）

| クラス   | 既存 public メソッド                                                                                                                                                                                                       | 本ユニットでの変更                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `Stock`  | `static create(input)` / `static reconstruct(props)` / `consume(amount)` / `isEmpty()` / 8 getter（`expiresAt`/`purchasedAt` は防御的コピーを返す実測確認済み）                                                            | `updateDetails(props)` を新規追加               |
| `Pantry` | `static create()` / `static reconstruct(props)` / `addStock(input)` / `consumeStock(stockId, amount)` / `discardStock(stockId)` / `hasStockFromShoppingItem(itemId)` / `get id` / `get stocks`（防御的コピー実測確認済み） | `updateStockDetails(stockId, props)` を新規追加 |

**実測で確認した重要な事実（設計書に明記がなく、本書で補う）**:

- `Quantity.of(value, unit)`（`packages/domain/src/shared/quantity.ts`）は **`value < 0` のみ
  reject し、`value === 0` は許容する**（`Quantity.of(0, 'g')` は例外を投げない。既存
  `Stock.consume()` の全量クランプ実装 `Quantity.of(0, unit)` がこれに依存している）。したがって
  設計書 §変更後構成 Domain の「`Quantity.of()` の生成自体が非正数を弾く想定であれば…不要」は
  **成立しない**。`Stock.updateDetails()` は `amount.value <= 0` を**必ず自前でチェックし throw
  する**必要がある（`Stock.create()` の既存チェックと同一パターン）。境界値テスト（STK-UPD-04）を
  必須観点とする。
- `Pantry` の既存 `findStock()`（private）は `consumeStock`/`discardStock` から共有され、
  見つからない場合に**素の `Error('Stock not found')`** を throw する（`StockNotFoundError` では
  ない。`StockNotFoundError` は `packages/application` 側のクラスであり `packages/domain` から
  import できない — 依存方向の制約）。既存 `ConsumeStockUseCase`/`DiscardStockUseCase`
  （実測: `packages/application/src/pantry/consume-stock.use-case.ts` /
  `discard-stock.use-case.ts`）は Domain の例外に頼らず、**UseCase 側で `pantry.stocks.find()`
  により事前に存在確認し** `StockNotFoundError` を throw してから Domain メソッドを呼んでいる
  （Domain 側の `findStock` 由来の Error は通常到達しない防御線）。`AddStockUseCase`（実測）は
  逆に `pantry.addStock()` を `try/catch` で包み、Domain の `Error` を
  `InvalidStockOperationError` に変換している。
  → `UpdateStockDetailsUseCase` は「存在確認は事前チェック（Consume/Discard 型）」+
  「バリデーションエラーは try/catch 変換（AddStock 型）」の**両方を組み合わせる**実装になる
  可能性が高い。設計書はこの組み合わせを明記していないため、**Application 層の試験観点は
  この 2 パターンを両方満たす形で設計し**、実装計画・実装時にどちらの経路で 404/422 が発生するかを
  確定させる（§3 末尾の注記、および本書末尾「不足・矛盾」参照）。

### 0-2. 既存テストの有無（実測）

| 層                 | 既存テストファイル                                                                                                                                                                                                                                                                                                                              | 関連観点                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain             | `packages/domain/tests/pantry/pantry.test.ts`（既存）                                                                                                                                                                                                                                                                                           | `Stock.create/reconstruct/consume/isEmpty`・`Pantry` 全メソッドの既存観点。`updateDetails`/`updateStockDetails` の describe を追記する対象                             |
| Application        | `packages/application/tests/pantry/*.test.ts`（既存 UseCase 4 本分）                                                                                                                                                                                                                                                                            | `InMemoryPantryRepository` を再利用できる                                                                                                                              |
| api-contract       | `packages/api-contract/tests/pantry.schema.test.ts`（既存。`addStockSchema` describe が 117-151 行目）                                                                                                                                                                                                                                          | `updateStockSchema` の describe を追記                                                                                                                                 |
| Infrastructure     | `packages/infrastructure/tests/repositories/drizzle-pantry.repository.test.ts`（既存・実測。9 ケース）                                                                                                                                                                                                                                          | **「同一 id の再 save() は amountValue のみ更新し不変フィールドを維持する」という既存テストが、現在の罠を固定化するテストとして存在する（§5 参照。最重要の修正対象）** |
| apps/web（server） | `apps/web/tests/server/routes/pantry.test.ts`（既存。`vi.mock('@cookpit/application', ...)` パターン）                                                                                                                                                                                                                                          | `.put()` ケースを追記                                                                                                                                                  |
| apps/web（dom）    | `apps/web/tests/app/pantry/_components/{stock-row,pantry-client,add-stock-form,location-group}.test.tsx` / `_utils/pantry-view.node.test.ts` / `apps/web/tests/app/shopping-lists/_components/complete-shopping-panel.test.tsx` / `apps/web/tests/app/_utils/dashboard-view.node.test.ts` / `apps/web/tests/app/_components/dashboard.test.tsx` | 各コンポーネントに追記・新設。`expiry.ts` 移設に伴う import パス確認対象                                                                                               |

`packages/api-contract` は Vitest 実行環境が整備済み（`vitest.config.ts` 実在確認済み）。
全層でテスト基盤・include パターンに不整合はない（§9 層別テスト配置で確認）。

---

## 1. メソッド網羅チェック表

| 層             | クラス/対象                                      | メソッド                                         | 変更種別                   | 対応する試験観点 No |
| -------------- | ------------------------------------------------ | ------------------------------------------------ | -------------------------- | ------------------- |
| Domain         | `Stock`                                          | `updateDetails(props): void`                     | 新設                       | STK-UPD-01〜10      |
| Domain         | `Pantry`                                         | `updateStockDetails(stockId, props): void`       | 新設                       | PT-UPD-01〜05       |
| Application    | `UpdateStockDetailsUseCase`                      | `execute(input): Promise<PantryDto>`             | 新設                       | A-UPD-01〜14        |
| api-contract   | `updateStockSchema`                              | `.parse()`（Zod）                                | 新設                       | Z-UPD-01〜10        |
| Infrastructure | `DrizzlePantryRepository`                        | `save(pantry): Promise<void>`（`set` 句 4 列化） | 変更（既存テスト修正含む） | INF-UPD-01〜08      |
| Presentation   | `pantryRoute`                                    | `PUT /stocks/:stockId`                           | 新設                       | WH-PUT-01〜07       |
| apps/web UI    | `stock-edit-dialog.tsx`                          | コンポーネント（新設）                           | 新設                       | SED-01〜12          |
| apps/web UI    | `complete-shopping-panel.tsx`                    | `StockAdditionRow`（`expiresAt` 追記）           | 変更                       | CSP-01〜06          |
| apps/web UI    | `stock-row.tsx`                                  | 保存場所ラベル・緊急度チップ・編集導線           | 変更                       | SR-EDIT-01〜06      |
| apps/web UI    | `pantry-client.tsx`                              | 編集対象 state・`StockEditDialog` 結線           | 変更                       | PC-EDIT-01〜02      |
| apps/web UI    | `expiry.ts`（新設）/ `dashboard-view.ts`（既存） | 純粋移動                                         | 変更                       | EXP-01〜03          |

対象外項目（`displayName`/`purchasedAt`/`productId`/`sourceShoppingItemId` の編集メソッド）は
仕様上追加されない（設計書「対象外」節）ため、網羅チェックの対象に含めない。

---

## 2. Domain 単体試験観点

配置: `packages/domain/tests/pantry/pantry.test.ts`（既存ファイルへの `describe` 追記）。

### 2-1. `Stock.updateDetails(props)`

| #          | 観点                                   | 前提                                                                                       | 操作                                                                                             | 期待結果                                                                                                                                                                                                                           | 分類                                          |
| ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| STK-UPD-01 | 数量の値のみ変更                       | `amount: Quantity.of(2, '個')` の Stock                                                    | `updateDetails({ amount: Quantity.of(5, '個'), expiresAt: 元のまま, storedLocation: 元のまま })` | `amount.value === 5`、`amount.unit === '個'`（不変）                                                                                                                                                                               | 正常                                          |
| STK-UPD-02 | **数量の単位のみ変更**（値は据え置き） | `amount: Quantity.of(2, '個')` の Stock                                                    | `updateDetails({ amount: Quantity.of(2, 'g'), ... })`                                            | `amount.value === 2`、`amount.unit === 'g'`                                                                                                                                                                                        | 正常・**罠 2 と対になる Domain 側の直接観点** |
| STK-UPD-03 | 期限を設定・変更                       | `expiresAt: null` の Stock                                                                 | `updateDetails({ ..., expiresAt: new Date('2026-08-20T00:00:00') })`                             | `expiresAt` が新しい日付                                                                                                                                                                                                           | 正常                                          |
| STK-UPD-04 | **数量 0 を拒否（最重要・境界）**      | 任意の Stock                                                                               | `updateDetails({ amount: Quantity.of(0, '個'), ... })`                                           | `Error`（`Stock.create()` と同一メッセージ想定: `'Stock amount must be positive'`）を throw。`amount` は変更前のまま                                                                                                               | 異常・境界                                    |
| STK-UPD-05 | 数量負値（参考・Quantity.of 由来）     | —                                                                                          | `Quantity.of(-1, '個')` の生成自体を試みる                                                       | `Quantity.of` の既存検証で `Error('Quantity must be non-negative')` が Stock に到達する前に throw（`Stock.updateDetails` 自体の境界としては非該当。0 のみが `Stock.updateDetails` 固有の境界であることを明示するための参考ケース） | 異常・境界（参考）                            |
| STK-UPD-06 | 期限を `null` にクリア                 | `expiresAt: 非 null` の Stock                                                              | `updateDetails({ ..., expiresAt: null })`                                                        | `expiresAt === null`                                                                                                                                                                                                               | 正常                                          |
| STK-UPD-07 | 保存場所を設定・変更                   | `storedLocation: null` の Stock                                                            | `updateDetails({ ..., storedLocation: 'freezer' })`                                              | `storedLocation === 'freezer'`                                                                                                                                                                                                     | 正常                                          |
| STK-UPD-08 | 保存場所を `null` にクリア             | `storedLocation: 'fridge'` の Stock                                                        | `updateDetails({ ..., storedLocation: null })`                                                   | `storedLocation === null`                                                                                                                                                                                                          | 正常                                          |
| STK-UPD-09 | 不変条件: 対象外フィールドは変化しない | 任意の Stock（`id`/`displayName`/`productId`/`purchasedAt`/`sourceShoppingItemId` を保持） | 3 項目すべてを変更して `updateDetails()`                                                         | `id`/`displayName`/`productId`/`purchasedAt`/`sourceShoppingItemId` が呼び出し前と完全一致                                                                                                                                         | 防御性・不変条件                              |
| STK-UPD-10 | 3 項目すべてを同時変更                 | 任意の Stock                                                                               | `updateDetails({ amount: 新値, expiresAt: 新値, storedLocation: 新値 })`                         | 3 項目すべてが新しい値に更新される                                                                                                                                                                                                 | 正常                                          |

### 2-2. `Pantry.updateStockDetails(stockId, props)`

| #                       | 観点                                       | 前提                                              | 操作                                                                                   | 期待結果                                                                                                                                      | 分類                 |
| ----------------------- | ------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| PT-UPD-01               | 正常委譲                                   | `stocks` に対象 `stockId` の Stock を含む Pantry  | `updateStockDetails(stockId, { amount: 新値, expiresAt: 新値, storedLocation: 新値 })` | 対象 Stock が更新される（`pantry.stocks` から対象を取得して確認）                                                                             | 正常                 |
| PT-UPD-02（**最重要**） | 対象が存在しない場合の例外                 | 対象 `stockId` が `stocks` に存在しない           | `updateStockDetails(不存在の stockId, props)`                                          | `Error('Stock not found')`（**素の `Error`。既存 `consumeStock`/`discardStock` と同型で `StockNotFoundError` ではない** — §0-1 参照）を throw | 異常                 |
| PT-UPD-03               | 数量 0 の伝搬                              | 対象 Stock を含む Pantry                          | `updateStockDetails(stockId, { amount: Quantity.of(0, ...), ... })`                    | `Stock.updateDetails()` 由来の `Error` がそのまま伝搬する（Pantry 側で握りつぶさない）                                                        | 異常                 |
| PT-UPD-04               | 不変条件: 対象外の Stock は影響を受けない  | `stocks` に 2 件（対象 A・非対象 B）を含む Pantry | A のみ `updateStockDetails()` で編集                                                   | B の全フィールドが編集前と一致                                                                                                                | 防御性・データ整合性 |
| PT-UPD-05（防御性）     | `stocks` getter の防御的コピー確認（回帰） | `updateStockDetails()` 実行後の Pantry            | `const arr = pantry.stocks; arr.push(dummy);`                                          | 再取得した `pantry.stocks.length` は変化しない（既存 `PT-DEF-01` の回帰確認を本メソッド経由でも兼ねる）                                       | 防御性               |

---

## 3. Application 単体試験観点

配置: `packages/application/tests/pantry/update-stock-details.use-case.test.ts`（新規）。
`InMemoryPantryRepository`（既存 UseCase テストのものを再利用）。

**注記（§0-1 の帰結）**: `StockNotFoundError` と `InvalidStockOperationError` の発生経路が
実装計画で「事前チェック」「try/catch 変換」のどちらか（または両方の組み合わせ）に確定する。
以下の観点は**結果（例外の型とメッセージ、`saveCount`）のみを固定し、実装の内部経路は問わない**
形で記述する。

| #                            | 観点                                                                 | 前提                                                      | 操作                                                                                                | 期待結果                                                                                                                                                        | 分類           |
| ---------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| A-UPD-01                     | 正常系: 数量の値変更                                                 | `stocks` に対象 Stock（amount 2個）を含む Pantry を seed  | `execute({ stockId, amount: { value: 5, unit: '個' }, expiresAt: 元の値, storedLocation: 元の値 })` | 戻り値 `PantryDto` の対象 Stock の `amount.value === 5`。`pantryRepository.saveCount === 1`                                                                     | 正常           |
| A-UPD-02                     | **正常系: 数量の単位のみ変更（罠 2 の Application 層観点）**         | 同上                                                      | `amount: { value: 2, unit: 'g' }`（値は据え置き）                                                   | 戻り値の `amount.unit === 'g'`、`amount.value === 2`                                                                                                            | 正常           |
| A-UPD-03                     | 正常系: 期限を設定                                                   | `expiresAt: null` の対象 Stock                            | `execute({ ..., expiresAt: '2026-08-20' })`                                                         | 戻り値の `expiresAt === '2026-08-20'`（ローカル日付往復規約の確認）                                                                                             | 正常           |
| A-UPD-04                     | 正常系: 期限を `null` クリア                                         | `expiresAt: 非 null` の対象 Stock                         | `execute({ ..., expiresAt: null })`                                                                 | 戻り値の `expiresAt === null`                                                                                                                                   | 正常           |
| A-UPD-05                     | 正常系: 保存場所を設定・クリア                                       | `storedLocation` あり/なしの各パターン（`it.each`）       | `execute({ ..., storedLocation: 'pantry' })` / `execute({ ..., storedLocation: null })`             | それぞれ反映される                                                                                                                                              | 正常           |
| A-UPD-06                     | 正常系: 3 項目同時変更                                               | 任意の対象 Stock                                          | 3 項目すべて変更して `execute()`                                                                    | すべて反映され、`id`/`displayName`/`productId`/`purchasedAt` は不変                                                                                             | 正常           |
| A-UPD-07（**最重要**）       | 異常系: 存在しない `stockId`                                         | 対象 `stockId` が Pantry の `stocks` に存在しない         | `execute({ stockId: '不存在', ... })`                                                               | `StockNotFoundError` を throw、`saveCount === 0`                                                                                                                | 異常           |
| A-UPD-08（**最重要・境界**） | 異常系: 数量 0                                                       | 対象 Stock を含む Pantry                                  | `execute({ ..., amount: { value: 0, unit: '個' } })`                                                | `InvalidStockOperationError` を throw、`saveCount === 0`                                                                                                        | 異常・境界     |
| A-UPD-09                     | ローカル日付の往復規約（critical）                                   | `expiresAt: '2026-08-20'` を入力                          | `execute()` 実行後、`pantryRepository` から再取得した Stock の `Date` 表現を確認                    | `new Date('2026-08-20T00:00:00')` として構築される（UTC ではなくローカル 0 時。`add-stock.use-case.ts` と同一規約）                                             | 正常・critical |
| A-UPD-10                     | データ整合性: 対象外フィールドが DTO に漏れなく残る                  | 対象 Stock（`displayName: '玉ねぎ'`, `productId` あり）   | 3 項目を変更して `execute()`                                                                        | 戻り値の `displayName`/`productId`/`purchasedAt` が変更前と一致                                                                                                 | データ整合性   |
| A-UPD-11                     | 不変条件: 他 Stock は影響を受けない                                  | `stocks` に対象外 Stock を含む Pantry                     | 対象 Stock のみ編集                                                                                 | 戻り値 `PantryDto.stocks` 中の対象外 Stock が完全に不変                                                                                                         | データ整合性   |
| A-UPD-12（冪等性）           | 同一入力で 2 回連続実行                                              | 対象 Stock を含む Pantry                                  | 同一ボディで `execute()` を 2 回連続                                                                | 2 回とも成功し、戻り値の対象 Stock 部分（`amount`/`expiresAt`/`storedLocation`）が完全一致（`Stock` は `updatedAt` 相当を持たないため契約 §6 どおり完全べき等） | 冪等性         |
| A-UPD-13                     | 防御性: 入力の `amount` オブジェクトを変更しても内部状態に影響しない | 入力用 DTO のプレーンオブジェクトを保持                   | `execute()` 実行後に入力オブジェクトのプロパティを書き換える                                        | 再度 `pantryRepository.find()` した Stock の値が影響を受けない（`Quantity.of` が都度新規生成される契約の確認）                                                  | 防御性         |
| A-UPD-14                     | エラー経路の排他性（設計ギャップの確認・§0-1）                       | 対象 `stockId` が存在せず、かつ入力の `amount.value` も 0 | `execute({ stockId: '不存在', amount: { value: 0, unit: '個' }, ... })`                             | `StockNotFoundError` が優先して throw される（存在確認が先に行われ、`InvalidStockOperationError` にならない。実装計画で確定させる経路の固定）                   | 異常・境界     |

---

## 4. api-contract 契約試験観点

配置: `packages/api-contract/tests/pantry.schema.test.ts`（既存ファイルへ `describe` 追記）。
契約設計書 §9.1/§9.2 の観点表に ID を付与し、api-contract 層の担当範囲として再掲する
（内容は契約設計書を正とし、本書は ID 採番と層別配置の整理のみを行う）。

| #        | 観点                                                                             | テスト値                                                                            | 期待結果                                                  | 分類         |
| -------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------ |
| Z-UPD-01 | 必須 3 項目を満たす入力を受理                                                    | `{ amount: {value:2, unit:'個'}, storedLocation:'fridge', expiresAt:'2026-08-20' }` | 成功                                                      | 正常         |
| Z-UPD-02 | `storedLocation`/`expiresAt` の `null` を受理                                    | 上記の両方 `null`                                                                   | 成功                                                      | 正常・境界   |
| Z-UPD-03 | `amount.value === 0` を reject                                                   | `amount.value: 0`                                                                   | 失敗（`ZodError`）                                        | 異常・境界   |
| Z-UPD-04 | `amount.value` 負値を reject                                                     | `amount.value: -1`                                                                  | 失敗                                                      | 異常・境界   |
| Z-UPD-05 | `amount.value` 小数を受理                                                        | `amount.value: 0.5`（`unit:'g'`）                                                   | 成功                                                      | 正常・境界   |
| Z-UPD-06 | `expiresAt` に datetime 形式を送ると reject                                      | `'2026-08-07T00:00:00Z'`                                                            | 失敗                                                      | 異常・境界   |
| Z-UPD-07 | `storedLocation` enum 外を reject                                                | `'counter'`                                                                         | 失敗                                                      | 異常         |
| Z-UPD-08 | **3 項目それぞれのキー省略を reject**（`it.each`。`PATCH` 非導入の型レベル固定） | `amount`/`storedLocation`/`expiresAt` を個別に省略                                  | いずれも失敗                                              | 異常・回帰   |
| Z-UPD-09 | `displayName` を送っても **strip される**（reject しない）                       | `{ ...有効な updateStockSchema 入力, displayName: '玉ねぎ' }`                       | 成功・`parse()` の戻り値に `displayName` キーが含まれない | 正常・防御性 |
| Z-UPD-10 | 空文字の `amount.unit` を reject／プリセット外自由入力単位を受理                 | `unit: ''` は失敗、`unit: '箱'` は成功（`it.each`）                                 | 上記どおり                                                | 正常・境界   |

**型往復確認（コンパイル時。`pnpm type-check` で確認。ランタイムテスト不要）**:
`UpdateStockBody` が `UpdateStockDetailsInputDto` の `amount`/`expiresAt`/`storedLocation` と
構造的に一致すること（契約設計書 §9.4）。

---

## 5. Infrastructure（PGlite）結合試験観点 — 最重要

配置: `packages/infrastructure/tests/repositories/drizzle-pantry.repository.test.ts`（既存ファイルへ
追記 + **既存テスト 1 件の修正**）。

### 5-1. 既存テストの修正（罠解消の直接証跡・最重要）

既存テスト「**同一 id の再 save() は amountValue のみ更新し不変フィールドを維持する**」
（実測: `drizzle-pantry.repository.test.ts` 111-136 行目）は、現状の `onConflictDoUpdate.set`
が `amountValue` 1 列しか更新しない**罠をそのまま固定化したテスト**である。本ユニットで
`set` 句を 4 列に拡張すると、このテストの `amountUnit`/`expiresAt`/`storedLocation` に関する
アサーション（「変更前の値のまま」）は**失敗するようになる**（意図した仕様変更）。

- **INF-UPD-01（最重要）**: 既存テストのテスト名・アサーションを修正する。
  - テスト名を「同一 id の再 save() は amountValue/amountUnit/expiresAt/storedLocation を
    更新し、displayName/purchasedAt/productId/sourceShoppingItemId は維持する」等に改める。
  - `rows[0]?.amountUnit` / `rows[0]?.expiresAt` / `rows[0]?.storedLocation` の期待値を
    「変更後の値」に変更する。
  - `rows[0]?.productId` / `rows[0]?.displayName` / `rows[0]?.purchasedAt` /
    `rows[0]?.sourceShoppingItemId` は**引き続き「変更前の値のまま」**を期待する
    （対象外 4 フィールドは `set` 句に追加しないため、この部分は既存アサーションを維持）。
  - この修正自体が「実装上の罠が解消されたこと」の直接的な回帰防止線になる。

### 5-2. 新規往復テスト（編集 → `save()` → 新しい Repository インスタンスで `find()`）

`find()` は既存パターンどおり「新しい `DrizzlePantryRepository` インスタンス」を都度生成して
呼ぶ（同一インスタンスの内部キャッシュに依存した見かけ上の成功を排除するため）。

| #                                         | 観点                                                         | 前提                                                                   | 操作                                                                                                      | 期待結果                                                                                                                                                                 | 分類               |
| ----------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ |
| INF-UPD-02                                | 数量の値のみ変更（単位は据え置き）の往復                     | Stock（amount 2個, expiresAt/storedLocation 設定済み）を `save()` 済み | `Stock.updateDetails` 相当で value のみ変更 → `save()` → **新しい** `DrizzlePantryRepository` で `find()` | 再取得した Stock の `amount.value` が新しい値、`amount.unit` は不変                                                                                                      | 正常               |
| INF-UPD-03（**最重要・罠 2 の直接検出**） | **数量の単位のみ変更（値は据え置き）の往復**                 | 同上                                                                   | 単位のみ変更（例: `個` → `g`、値は同じ） → `save()` → 新インスタンスで `find()`                           | 再取得した Stock の `amount.unit` が新しい単位に変わっている（`amount.value` は同じ値のまま）。**値だけを変えるテストでは検出できない罠 2 を、このケース単独で検出する** | 正常・**必須**     |
| INF-UPD-04                                | 賞味期限のみ変更の往復                                       | `expiresAt` 設定済みの Stock                                           | 期限を別の日付に変更 → `save()` → 新インスタンスで `find()`                                               | 再取得した `expiresAt` が新しい日付                                                                                                                                      | 正常               |
| INF-UPD-05                                | 賞味期限を `null` クリアする往復                             | `expiresAt` 設定済みの Stock                                           | `expiresAt: null` に変更 → `save()` → `find()`                                                            | 再取得した `expiresAt === null`                                                                                                                                          | 正常・境界         |
| INF-UPD-06                                | 保存場所のみ変更・`null` クリアの往復                        | `storedLocation` 設定済みの Stock                                      | 変更 → `save()` → `find()`（変更/クリアの 2 パターンを `it.each`）                                        | 再取得した `storedLocation` が新しい値／`null`                                                                                                                           | 正常・境界         |
| INF-UPD-07（**最重要**）                  | 4 項目すべてを同時変更する往復                               | 任意の Stock                                                           | `amount`（値・単位）/`expiresAt`/`storedLocation` を同時に変更 → `save()` → `find()`                      | 再取得した Stock の 4 項目すべてが新しい値。`id`/`displayName`/`productId`/`purchasedAt`/`sourceShoppingItemId` は不変                                                   | 正常・**必須**     |
| INF-UPD-08                                | 対象外フィールドは編集後も `save()` 経路で変化しない（回帰） | 任意の Stock                                                           | 3 項目を変更して `save()` → `find()`                                                                      | `displayName`/`purchasedAt`/`productId`/`sourceShoppingItemId` が編集前と一致（Repository の `set` 句に追加していないことの確認。設計書「対象外」節の直接検証）          | データ整合性・回帰 |

---

## 6. Presentation — Hono ルート結合試験観点

配置: `apps/web/tests/server/routes/pantry.test.ts`（既存ファイルへ追記。既存の
`vi.mock('@cookpit/application', ...)` パターンを踏襲し、`UpdateStockDetailsUseCase` を
モック追加する）。

| #                   | 観点                              | 前提                                                      | 操作                                                                                                             | 期待結果                                                                                                         | 分類                        |
| ------------------- | --------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------- |
| WH-PUT-01           | 200: 正常更新                     | `UpdateStockDetailsUseCase.execute` が `PantryDto` を解決 | `PUT /api/pantry/stocks/:stockId` に正常なボディで送信                                                           | `200`、レスポンスが `PantryDto` と一致、`execute` が `{ stockId, amount, storedLocation, expiresAt }` で呼ばれる | 正常                        |
| WH-PUT-02           | 404: `StockNotFoundError`         | `execute` が `StockNotFoundError` を reject               | 同上                                                                                                             | `404`、`{ error: '<message>' }`                                                                                  | 異常（E-1）                 |
| WH-PUT-03           | 422: `InvalidStockOperationError` | `execute` が `InvalidStockOperationError` を reject       | 同上                                                                                                             | `422`                                                                                                            | 異常                        |
| WH-PUT-04           | 400 × 4: Zod バリデーション       | —                                                         | `amount.value: 0` / `expiresAt` が datetime 形式 / `storedLocation` が enum 外 / いずれかのキー省略（`it.each`） | いずれも `400`、`execute` が呼ばれない                                                                           | 異常・境界（E-2, E-3, E-4） |
| WH-PUT-05           | 400: `stockId` が UUID でない     | —                                                         | パスの `stockId` を `'not-a-uuid'` にして送信                                                                    | `400`、`execute` は呼ばれない                                                                                    | 境界                        |
| WH-PUT-06（冪等性） | 同一ボディで 2 回連続 `PUT`       | `execute` が同じ `PantryDto` を解決するようモック         | 同一ボディで 2 回連続送信                                                                                        | 両方とも `200`、対象 Stock 部分が完全一致                                                                        | 冪等性                      |
| WH-PUT-07（回帰）   | 既存 4 エンドポイントの回帰       | —                                                         | `GET` / `POST(add)` / `POST(consume)` / `POST(discard)` の既存テストを実行                                       | 全件 pass（新規 `.put()` 追加が既存ルートに影響しない）                                                          | 回帰                        |

---

## 7. Presentation — コンポーネント試験観点（RTL）

### 7-1. `stock-edit-dialog.tsx`（新設。配置: `apps/web/tests/app/pantry/_components/stock-edit-dialog.test.tsx`）

`price-record-edit-dialog.test.tsx` の構成パターンを踏襲する。

| #      | 観点                                          | 前提                                                                          | 操作                                       | 期待結果                                                                                             | 分類                 |
| ------ | --------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------- |
| SED-01 | 初期値投入                                    | 対象 Stock（数量 2個・保存場所 fridge・期限 2026-08-20）を props で渡して開く | render                                     | 数量欄に `2`・単位 `個`、保存場所セレクトに `fridge`、期限欄に `2026-08-20` が表示される             | 正常                 |
| SED-02 | `useEffect([stock?.id])` の再投入             | ダイアログが開いた状態で対象 Stock が別の Stock に切り替わる                  | props の `stock` を差し替える              | フォームの値が新しい対象の値に更新される                                                             | 正常                 |
| SED-03 | 保存で PUT が正しいボディで呼ばれる           | フォームに入力済み                                                            | 「保存」をクリック                         | `PUT /api/pantry/stocks/:stockId` が `{ amount, storedLocation, expiresAt }` で呼ばれる              | 正常                 |
| SED-04 | 成功後の遷移                                  | `PUT` が 200 を返す                                                           | 保存                                       | ダイアログが閉じ、`router.refresh()` が呼ばれる                                                      | 正常                 |
| SED-05 | 404: `StockNotFoundError`                     | `PUT` が 404 を返す                                                           | 保存                                       | 「この在庫はすでに削除されています」が表示され、ダイアログが閉じて `router.refresh()` が呼ばれる     | 異常（E-1）          |
| SED-06 | 422: `fieldErrors` 反映                       | `PUT` が 422 を返す                                                           | 保存                                       | 該当フィールドにエラーメッセージが表示される（`price-record-edit-dialog` の `fieldErrors` パターン） | 異常・境界           |
| SED-07 | クライアント側検証: 数量 0 以下を送信前に弾く | 数量欄に `0` を入力                                                           | 保存をクリック                             | `PUT` が呼ばれず、`fieldErrors` にクライアント側エラーが表示される（`parseQuantity` 検証）           | 異常・境界（防御性） |
| SED-08 | 期限クリア                                    | 期限欄に値がある状態から空にする                                              | 保存                                       | `PUT` のボディの `expiresAt` が `null`                                                               | 正常・境界           |
| SED-09 | 保存場所クリア                                | 保存場所を「未設定」に戻す                                                    | 保存                                       | `PUT` のボディの `storedLocation` が `null`                                                          | 正常・境界           |
| SED-10 | 通信エラー                                    | `PUT` が例外を投げる（`fetch` reject）                                        | 保存                                       | 「通信エラーが発生しました」が表示され、ダイアログは閉じずフォームの入力値が保持される               | 異常（E-5）          |
| SED-11 | ローディング状態                              | 保存処理中                                                                    | 保存ボタンをクリックした直後               | 保存ボタンが `disabled` になる                                                                       | フロントエンド固有   |
| SED-12 | 起動導線: `stock-row.tsx` から開く            | `pantry-client.tsx` が編集対象 Stock を state に保持                          | `stock-row.tsx` の「編集」ボタンをクリック | `stock-edit-dialog` が該当 Stock を対象に開く（`open = stock !== null`）                             | 正常                 |

### 7-2. `complete-shopping-panel.tsx`（既存ファイル追記。配置: 既存

`complete-shopping-panel.test.tsx`）

| #              | 観点                                                                | 前提                                                   | 操作                               | 期待結果                                                               | 分類                   |
| -------------- | ------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------- | ---------------------- |
| CSP-01         | 「賞味期限を設定」で日付入力が展開される                            | 行が選択済み                                           | 「賞味期限を設定」リンクをクリック | `Input type="date"` を含む行が展開表示される                           | 正常（N-7 の UI 起点） |
| CSP-02         | 展開せず完了すると `expiresAt: null` が送られる                     | 期限入力を展開しない                                   | 「完了する」をクリック             | `stockAdditions[].expiresAt === null`（既定の後方互換。N-8）           | 正常・回帰             |
| CSP-03         | 入力して完了すると値が送られる                                      | 期限を展開し `2026-08-20` を入力                       | 「完了する」をクリック             | `stockAdditions[].expiresAt === '2026-08-20'`                          | 正常（N-7）            |
| CSP-04         | 展開解除で値がクリアされる                                          | 期限入力に値がある状態から「賞味期限を削除」をクリック | 折りたたまれた状態で「完了する」   | `expiresAt === null`（クリアされた値が送信に反映される）               | 正常・境界             |
| CSP-05         | 混在ケース（B-6）                                                   | 品目 A は期限入力済み、品目 B は未入力                 | 「完了する」をクリック             | `stockAdditions` の A は入力値、B は `null` がそれぞれ独立して送られる | 正常・境界             |
| CSP-06（回帰） | 既存の `checked`/`amountText`/`storedLocation` ロジックへの影響なし | 既存の完了パネルテストケース一式                       | 既存の操作パターンを再実行         | 既存アサーションがすべて成立する（R-4 の回帰確認）                     | 回帰                   |

### 7-3. `stock-row.tsx`（既存ファイル追記。配置: 既存 `stock-row.test.tsx`）

| #                        | 観点                                              | 前提                                                  | 操作                             | 期待結果                                                                                        | 分類                                               |
| ------------------------ | ------------------------------------------------- | ----------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| SR-EDIT-01               | 保存場所ラベルの常時表示                          | `storedLocation: 'fridge'` の Stock                   | render                           | カード内に保存場所ラベル（`冷蔵` 等）が表示される                                               | 正常（N-9・P-4）                                   |
| SR-EDIT-02               | `storedLocation: null` でもラベル領域が破綻しない | `storedLocation: null` の Stock                       | render                           | 「未設定」表示、またはラベル非表示（実装計画で確定した表示仕様どおり）でレイアウトが崩れない    | 正常・境界                                         |
| SR-EDIT-03（**最重要**） | 緊急度チップは**閾値内**の在庫にのみ表示される    | `expiresAt` が `asOf` から 3 日以内（閾値内）の Stock | render（`asOf` を props で注入） | 緊急度チップが表示される                                                                        | 正常（N-9）                                        |
| SR-EDIT-04（**最重要**） | 緊急度チップは**閾値外**の在庫には表示されない    | `expiresAt` が `asOf` から 10 日後（閾値外）の Stock  | render                           | 緊急度チップが表示されない。`formatExpiresAt` によるプレーンな日付表示のみ（既存 SR-02 の回帰） | 正常・境界（**`/pantry` は全在庫一覧のため必須**） |
| SR-EDIT-05               | `expiresAt: null` はチップ・緊急度計算の対象外    | `expiresAt: null` の Stock                            | render                           | 緊急度チップが表示されない、かつエラーにならない（既存 SR-03 の回帰）                           | 正常・境界                                         |
| SR-EDIT-06               | 「編集」ボタンから `onEdit` が呼ばれる            | —                                                     | 「編集」ボタンをクリック         | `onEdit(stock)` が呼ばれる（既存 SR-04 の「消費」パターンと同型）                               | 正常                                               |

### 7-4. `pantry-client.tsx`（既存ファイル追記）

| #          | 観点                                      | 前提                                             | 操作                                  | 期待結果                                                                                         | 分類         |
| ---------- | ----------------------------------------- | ------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------ |
| PC-EDIT-01 | 編集対象 state と `useApiAction` の独立性 | consume/discard が pending 中                    | 別の Stock の「編集」ボタンをクリック | 編集ダイアログが開く（`useApiAction` の pending 状態に影響されない。設計書「起動導線」節の確認） | 正常・防御性 |
| PC-EDIT-02 | `asOf` の伝播                             | Server Component から `asOf` を props で受け取る | render → `LocationGroup` → `StockRow` | `StockRow` に同一の `asOf` が渡る（緊急度算出の基準時刻が一貫する）                              | 正常         |

### 7-5. `expiry.ts` 移設回帰（純粋な移動。ロジック変更なし）

| #      | 観点                                            | 前提                       | 操作                                                             | 期待結果                                                                                                                                                                  | 分類         |
| ------ | ----------------------------------------------- | -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| EXP-01 | 既存 `dashboard-view.node.test.ts` の全件 pass  | 移動後の import パス       | `pnpm test`（apps/web）                                          | 既存テストが `expiry.ts` からの re-export 経由でも全件 pass（テストファイルが `dashboard-view.ts` から直接 import している場合は import パスを `expiry.ts` に追随させる） | 回帰         |
| EXP-02 | 既存 `dashboard.test.tsx` の全件 pass           | 同上                       | 同上                                                             | ダッシュボードの表示が既存どおり（`getExpiryUrgency`/`formatExpiryUrgencyLabel` の挙動不変）                                                                              | 回帰         |
| EXP-03 | `EXPIRY_URGENCY_WITHIN_DAYS` の値が両画面で一致 | `expiry.ts` の export 定数 | ダッシュボード `page.tsx` と `/pantry` `page.tsx` の両方から参照 | 両方とも `3`（同一の import 元。ドリフトしないことの確認）                                                                                                                | データ整合性 |

---

## 8. 回帰試験範囲

| #                    | 対象                                                                                                     | 確認方法                                                                                                                                  | 根拠                                                                                                                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REG-01               | 既存 4 エンドポイント（`GET`/`POST(add)`/`POST(consume)`/`POST(discard)`）                               | `pnpm test`（apps/web）全件 pass                                                                                                          | WH-PUT-07                                                                                                                                                                                                                                                  |
| REG-02               | 既存 Domain（`Stock.create/reconstruct/consume/isEmpty`・`Pantry` 全メソッド）                           | `pnpm test`（packages/domain）全件 pass                                                                                                   | `updateDetails`/`updateStockDetails` 追加が既存メソッドに影響しないこと                                                                                                                                                                                    |
| REG-03               | 既存 Application（`AddStockUseCase`/`ConsumeStockUseCase`/`DiscardStockUseCase`/`GetPantryUseCase`）     | `pnpm test`（packages/application）全件 pass                                                                                              | 新規 UseCase 追加のみで既存 UseCase は無変更                                                                                                                                                                                                               |
| REG-04               | 既存 Infrastructure（`DrizzlePantryRepository` の他観点：往復・削除同期・UNIQUE 制約・購入日時順ソート） | `pnpm test`（packages/infrastructure）全件 pass                                                                                           | `set` 句 4 列化が他の既存動作（`find()` のソート順・削除同期・UNIQUE 制約）に影響しないこと                                                                                                                                                                |
| REG-05（**最重要**） | **在庫引き算（`GenerateShoppingListUseCase.applyPantryDeduction`）**                                     | `pantry-shopping-integration` 系の既存テスト（D-1「単位不一致は差し引かず全量購入」・P-1「数えられる単位のみ切り上げ」）を実行し全件 pass | 本ユニットはロジックを変更しないが、**在庫の単位をユーザー操作で変更できるようになる**ため、既存テストが固定している入出力契約が崩れていないことを確認する必要がある（設計書 R-5・要件書 B-5）。新規シナリオの追加は対象外（在庫引き算ロジック自体は不変） |
| REG-06               | 買い物完了の冪等性（`hasStockFromShoppingItem` + `source_shopping_item_id` UNIQUE）                      | 既存 `CompleteShoppingUseCase` の冪等性テスト（`CS-IDEM-*`）・Infrastructure の UNIQUE 制約テストを実行し全件 pass                        | 完了パネルへの期限入力追加が既存の冪等ガードの経路（`itemId` ベースの判定）に触れていないことの確認                                                                                                                                                        |
| REG-07               | 既存 `product-detail-client`/`price-comparison` 等、pantry 外の既存機能                                  | `pnpm test` 全体を実行                                                                                                                    | スコープ外の意図しない影響がないこと（`expiry.ts` 移動は apps/web 内に閉じるため対象は apps/web に限定）                                                                                                                                                   |
| REG-08               | 型・Lint                                                                                                 | `pnpm type-check` / `pnpm lint`                                                                                                           | Hono RPC の `AppType` 拡張・`api-contract` の `export *` に影響がないこと                                                                                                                                                                                  |

---

## 9. 特性観点

- **権限**: 対象外（ADR-0003/ADR-0004。認証・複数ユーザー概念は本ユニットの対象外）。
- **データ整合性**: STK-UPD-09（対象外フィールド不変）、PT-UPD-04、A-UPD-10/11、
  INF-UPD-08（Repository の `set` 句に対象外 4 列を追加していないことの確認）、EXP-03。
- **冪等性**: `PUT` は完全べき等（契約設計書 §6。`Stock` が `updatedAt` 相当を持たないため）。
  A-UPD-12、WH-PUT-06。買い物完了の冪等性は既存機構の回帰確認（REG-06）として扱う（本ユニット
  自体が新規に冪等性を導入するわけではない）。
- **障害系（外部 I/O）**: 対象外。新規の外部 API・外部ストレージ I/O はない（設計書「エラー処理」
  節）。通信エラーへの対処はフロントエンド固有区分（SED-10）で扱う。
- **フロントエンド固有**: ローディング（SED-11）、エラー表示（SED-05/06/10, CSP 系の異常系は
  設計書どおり品目単位ハンドリングをしない前提）、楽観的更新のロールバックは**対象外**
  （編集ダイアログはパターン C = `router.refresh()` によるサーバー真実源方式であり楽観的更新を
  行わない。設計書「データ取得・更新のパターン」節）。
- **防御性（Domain 層）**:
  - 防御的コピー: `Stock.expiresAt`/`purchasedAt` の既存防御的コピー実装（getter）が
    `updateDetails()` 経由でも維持されること（STK-UPD-03/06 で間接確認。`Quantity` は
    immutable VO のため `amount` 自体に防御的コピーの概念は不要）。`Pantry.stocks` の防御的
    コピーは PT-UPD-05 で回帰確認。
  - 不変条件: STK-UPD-04（数量 0 拒否）、STK-UPD-09（対象外フィールド不変）、PT-UPD-04。
  - 副作用: 対象外（`Stock`/`Pantry` に `updatedAt` 相当のタイムスタンプフィールドは無い。
    契約設計書 §6 で明記済み）。
  - 不正引数の伝搬: STK-UPD-04/05（`amount.value` 0・負値）。

---

## 10. manual-browser-verify（実画面確認）の前提データ

過去 3 回、確認項目の前提条件を満たすデータを選ばなかったために「何も無いことが PASS と
誤報告される」事象が発生している。本ユニットでは以下を必須手順とする。

### 10-1. シードすべきデータの組み合わせ表

`/pantry` は保存場所（3 種 + 未設定）× 賞味期限（あり/なし）× 緊急度（閾値内/閾値外/期限切れ）を
横断して確認する必要があるため、代表値 1〜2 件では確認項目の前提を満たせない。以下の
組み合わせを**すべて**シードする（`asOf` = 確認実施日を基準とする）。

| #   | displayName（例） | 保存場所       | 賞味期限                            | 緊急度分類           | 用途（どの確認項目のために必要か）                                                                             |
| --- | ----------------- | -------------- | ----------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------- |
| S-1 | 牛乳              | fridge         | asOf + 1 日                         | 閾値内（critical）   | MB-02（単位のみ変更）/ MB-04（期限クリア）/ MB-06（保存場所クリア）/ MB-07（チップ表示）/ MB-10 / MB-16（404） |
| S-2 | 冷凍餃子          | freezer        | asOf + 20 日                        | 閾値外               | MB-08（チップ**非表示**の固定）/ MB-10                                                                         |
| S-3 | 米                | pantry         | null（未設定）                      | 該当なし             | MB-01（値のみ変更）/ MB-03（期限を null → 設定）/ MB-10（期限なしでもラベルが出る）                            |
| S-4 | 卵                | null（未設定） | asOf - 1 日（**期限切れ**）         | overdue              | MB-05（保存場所を未設定 → 設定）/ MB-09（「期限切れ」ラベル）/ MB-10（未設定表示）                             |
| S-5 | 玉ねぎ            | fridge         | asOf 当日                           | critical（本日まで） | MB-07（境界値「本日まで」）/ MB-10                                                                             |
| S-6 | 味噌              | pantry         | asOf + 3 日（**閾値ちょうど**）     | 閾値内の境界         | MB-07（閾値ちょうどは**含む**）/ MB-10。S-7 との直接比較材料                                                   |
| S-7 | 塩                | freezer        | asOf + 4 日（**閾値超えの最小差**） | 閾値外の境界         | MB-08（S-6 との対比で 3/4 日の切り替わりを確認）/ MB-10                                                        |

> **番号の対応は §10-2 の表を正とする。** ここの「用途」列は §10-2 の MB-ID をそのまま
> 引いている。片方だけを編集すると「前提データ全消化チェック」（§10-2 手順 3）が機能しなく
> なるので、**どちらかを変えたら必ず両方を突き合わせること**（2026-08-09 レビュー S-1）。

- 買い物完了パネルの確認（MB-11〜14）には、シード済みデータとは別に**買い物リストの品目**を
  2 件以上（1 件は期限入力する、1 件は入力しない）用意する。
- **MB-17（`/pantry` の 375px 目視）は S-1〜S-7 の全件が一覧に並んだ状態**で確認する
  （カード 1 枚だけでは折り返しの破綻が出ない。2026-08-09 レビュー M-3）。

### 10-2. 確認手順

1. 上記 S-1〜S-7 をすべてシードする（DB へ直接投入、または `/pantry` の「追加」フォームから
   手動投入）。
2. `/pantry` を開き、以下の各項目を確認する。

| ID    | 確認項目                                                                                                                                                           | 必要な前提データ                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| MB-01 | 数量の値を編集して保存 → リロードしても値が保持されている                                                                                                          | S-1 または任意の 1 件                                                          |
| MB-02 | **数量の単位のみを編集して保存 → リロードしても単位が保持されている**（値は変えない）                                                                              | S-1（`個`→`g` 等、値は据え置き）                                               |
| MB-03 | 賞味期限を編集して保存 → リロードしても保持されている                                                                                                              | S-3（null → 値設定）                                                           |
| MB-04 | 賞味期限を `null` にクリアして保存 → リロードしても `null` のまま                                                                                                  | S-1（値設定済み → クリア）                                                     |
| MB-05 | 保存場所を編集して保存 → リロードしても保持されている                                                                                                              | S-4（`未設定` → `fridge` 等）                                                  |
| MB-06 | 保存場所を「未設定」にクリアして保存 → リロードしても `未設定` のまま                                                                                              | S-1（`fridge` → 未設定）                                                       |
| MB-07 | 閾値内（S-1, S-5, S-6）に緊急度チップが表示されている                                                                                                              | S-1, S-5, S-6                                                                  |
| MB-08 | **閾値外（S-2, S-7）に緊急度チップが表示されていない**（プレーンな日付表示のみ）                                                                                   | S-2, S-7                                                                       |
| MB-09 | 期限切れ（S-4）に「期限切れ」等のラベルが表示されている                                                                                                            | S-4                                                                            |
| MB-10 | 保存場所ラベルが全カードに常時表示されている（期限の有無に関わらず）                                                                                               | S-1〜S-7 全件                                                                  |
| MB-11 | 買い物完了パネルで「賞味期限を設定」を押すと日付入力が展開される                                                                                                   | 未完了の買い物リスト（品目 2 件以上）                                          |
| MB-12 | 展開せず完了した品目は在庫化後 `expiresAt` が空（`/pantry` で確認）                                                                                                | 同上（1 件は未入力のまま完了）                                                 |
| MB-13 | 期限を入力して完了した品目は在庫化後その期限が表示される                                                                                                           | 同上（もう 1 件は入力して完了）                                                |
| MB-14 | 375px 幅（モバイル）で完了パネルの日付入力行がレイアウトを崩さない                                                                                                 | 同上（R-2 の目視確認）                                                         |
| MB-15 | 編集ダイアログで数量を 0 にしようとするとクライアント側でエラー表示され送信されない                                                                                | 任意の 1 件                                                                    |
| MB-16 | 存在しない Stock（別タブで消費/廃棄済みにした後）を編集しようとすると 404 メッセージが出る                                                                         | S-1 等を編集ダイアログで開いたまま、別タブで同じ Stock を消費/廃棄してから保存 |
| MB-17 | **375px 幅で `/pantry` の在庫カードがレイアウトを崩さない**（編集ボタン追加で 3 個 + 保存場所ラベル + 緊急度チップを同時に足すため。品目名が不自然に切れないこと） | **S-1〜S-7 の全件が一覧に並んだ状態**（カード 1 枚では折り返しの破綻が出ない） |

3. **前提データ全消化チェック**: 上記シード S-1〜S-7・買い物リスト品目のうち、
   **一度も MB-xx の確認に使われなかったものが無いか**を最後に確認する（未使用データが
   残っている場合、その項目の確認観点が漏れている可能性が高い。逆に MB-xx が「該当データが
   無いため確認できず」を PASS として報告することを禁止する — 該当データが無ければ FAIL
   または「未実施」として報告する）。
4. 確認結果は MB-01〜MB-16 の ID ごとに PASS/FAIL/未実施を記録し、**「該当データなしのため
   何も表示されない」を PASS とした報告があれば差し戻す**。

---

## 11. E2E smoke（Playwright）の要否判断

**対象外**。理由:

- 本ユニットの主要リスク（R-1: Repository の `set` 句拡張漏れ）は Infrastructure 層の PGlite
  回帰テスト（§5）で構造的に検出できる。E2E でなければ検出できない種類の欠陥ではない。
- UI 導線（編集ダイアログの起動・保存・404/422 分岐、完了パネルの展開/折りたたみ）は RTL
  コンポーネントテスト（§7）でカバーできる範囲であり、複数ページをまたぐ導線の複雑さは無い
  （既存の pantry-core / price-record-edit-and-store-rename も同様の判断で E2E を対象外として
  いる）。
- モバイル幅崩れ（R-2）は自動化コストに対してリスクが小さく、目視確認（MB-14）で十分。
- Cookpit MVP1 では Playwright の E2E 基盤が pantry 系画面に対して整備されていない
  （既存の pantry-core / price-record-edit-and-store-rename いずれも E2E を「対象外」としており
  本ユニットもこれを踏襲する）。

---

## 12. 試験データ

- Domain/Application: `Quantity.of(value, unit)` は `packages/domain/src/shared/unit.ts` の
  プリセット単位（`個`/`g`/`kg`/`ml`/`l` 等）と自由入力文字列の両方を使う。境界値は `0`・
  小数（`0.5`）・自由入力単位（`箱`）を用意する。
- 期限（`expiresAt`）は `YYYY-MM-DD` 形式のローカル日付文字列。境界値として「今日」「今日 -1
  （過去日付。B-1 で許可されている）」「今日 +3（閾値ちょうど）」「今日 +4（閾値超え最小差）」を
  用意する。
- 保存場所（`storedLocation`）は `'fridge' | 'freezer' | 'pantry' | null` の全 4 状態を必ず
  カバーする。
- Infrastructure（PGlite）: 既存の `createStock()` ヘルパー（`drizzle-pantry.repository.test.ts`
  実測）を再利用し、`overrides` で編集前後の値を指定する。
- manual-browser-verify: §10-1 の S-1〜S-7 表をそのままシードデータとして使う。

---

## 13. 完了条件

- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` が変更パッケージ（domain / application /
      api-contract / infrastructure / apps/web）すべてで通る。
- [ ] Domain: STK-UPD-01〜10・PT-UPD-01〜05 が実装され pass する（特に STK-UPD-04・
      STK-UPD-02 が必須）。
- [ ] Application: A-UPD-01〜14 が実装され pass する（A-UPD-07・08・14 の 404/422/経路排他性を
      含む）。
- [ ] api-contract: Z-UPD-01〜10 が実装され pass する。
- [ ] **Infrastructure（最重要・リリースブロッカー）**: INF-UPD-01（既存テストの修正）・
      INF-UPD-02〜08 がすべて実装され pass する。**特に INF-UPD-03（単位のみ変更）と
      INF-UPD-07（4 項目同時変更）は必須**（罠の再発防止の核）。
- [ ] Presentation: WH-PUT-01〜07、SED-01〜12、CSP-01〜06、SR-EDIT-01〜06、PC-EDIT-01〜02、
      EXP-01〜03 が実装され pass する（特に SR-EDIT-03/04 の閾値内外出し分けは必須）。
- [ ] 回帰試験範囲（§8 REG-01〜08）がすべて pass する。特に REG-05（在庫引き算）・REG-06
      （買い物完了の冪等性）は明示的に実行結果を確認する。
- [ ] manual-browser-verify（§10）: MB-01〜16 をすべて実施し、S-1〜S-7 のシードデータが
      全て確認に使われたことをチェックする。「該当データなしで PASS」の報告があれば差し戻す。
- [ ] roadmap Sprint 8 完了条件 2 件（既存在庫の後付け編集／買い物完了時の任意期限入力）を
      満たすことを実装後に確認する。

---

## 14. 層別のテスト配置（vitest include 確認済み）

| 層                        | include グロブ（実測）                                  | 新規・追記ファイル                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain`         | `tests/**/*.test.ts`（`@cookpit/config/vitest/base`）   | `packages/domain/tests/pantry/pantry.test.ts`（追記）                                                                                                                                                                                                                                                                                                                                                                                           |
| `packages/application`    | `tests/**/*.test.ts`                                    | `packages/application/tests/pantry/update-stock-details.use-case.test.ts`（新規）                                                                                                                                                                                                                                                                                                                                                               |
| `packages/api-contract`   | `tests/**/*.test.ts`                                    | `packages/api-contract/tests/pantry.schema.test.ts`（追記）                                                                                                                                                                                                                                                                                                                                                                                     |
| `packages/infrastructure` | `tests/**/*.test.ts`                                    | `packages/infrastructure/tests/repositories/drizzle-pantry.repository.test.ts`（追記 + 既存 1 件修正）                                                                                                                                                                                                                                                                                                                                          |
| `apps/web`（node）        | `tests/**/*.node.test.ts` / `tests/server/**/*.test.ts` | `apps/web/tests/server/routes/pantry.test.ts`（追記）                                                                                                                                                                                                                                                                                                                                                                                           |
| `apps/web`（dom）         | `tests/**/*.dom.test.ts` / `tests/**/*.test.tsx`        | `apps/web/tests/app/pantry/_components/stock-edit-dialog.test.tsx`（新規・`.test.tsx`）、`stock-row.test.tsx`（追記）、`pantry-client.test.tsx`（追記）、`apps/web/tests/app/shopping-lists/_components/complete-shopping-panel.test.tsx`（追記）、`apps/web/tests/app/_utils/dashboard-view.node.test.ts`（import パス確認。`.node.test.ts` は node project 側の include に一致）、`apps/web/tests/app/_components/dashboard.test.tsx`（回帰） |

全層で include パターンとの不一致は無い。`dashboard-view.node.test.ts` は `.node.test.ts`
サフィックスのため node project の include（`tests/**/*.node.test.ts`）に一致することを確認済み
（apps/web の `_utils` テストであっても DOM 依存が無ければ `.node.test.ts` を使う既存命名規約）。

---

## 15. 不足・矛盾していると感じた点（Orchestrator への申し送り。設計書は書き換えない）

1. **`Pantry.updateStockDetails` の JSDoc 例が `StockNotFoundError` を throw すると記載しているが、
   Domain 層は `packages/application` の `StockNotFoundError` を import できない**（依存方向:
   `packages/domain` は他パッケージに依存しない）。実測した既存 `Pantry.consumeStock` /
   `discardStock` は素の `Error('Stock not found')` を throw し、`StockNotFoundError` への変換は
   `ConsumeStockUseCase`/`DiscardStockUseCase` が UseCase 層で事前チェックして行っている。
   本書では PT-UPD-02 を「素の `Error`」を期待する形に補正した。実装計画・実装時にこの点を
   確認してほしい。
2. **`UpdateStockDetailsUseCase` の 404/422 の発生経路（事前チェック型 vs try/catch 変換型）が
   設計書に明記されていない**。既存の `ConsumeStockUseCase`/`DiscardStockUseCase`（事前チェックで
   `StockNotFoundError`）と `AddStockUseCase`（`try/catch` で `InvalidStockOperationError` に
   変換）は異なるパターンを取っており、`UpdateStockDetailsUseCase` は両方（存在確認は事前チェック、
   数量バリデーションは try/catch 変換）を組み合わせる必要があると推測されるが、設計書はこの
   組み合わせを明示していない。A-UPD-14（存在しない `stockId` かつ数量 0 の複合ケースで
   `StockNotFoundError` が優先される）を追加し、実装計画フェーズでの経路確定を促す観点とした。
3. **`Quantity.of()` は `value === 0` を許容する**（`value < 0` のみ reject）ことを実装コードで
   確認した。設計書は「`Quantity.of()` の生成自体が非正数を弾く実装であれば `Stock.updateDetails`
   内の再チェックは不要」という条件文を含むが、実際には条件が成立しないため
   `Stock.updateDetails` は**必ず**自前で `amount.value <= 0` を throw する必要がある（設計書も
   「実装計画フェーズで `Quantity` の実装を確認して確定する」としており、本書の走査結果は
   その確認作業を先取りしたものである）。矛盾ではなく、設計書の条件分岐を解消する情報として
   報告する。
4. 既存の Infrastructure テスト「同一 id の再 save() は amountValue のみ更新し不変フィールドを
   維持する」（`drizzle-pantry.repository.test.ts`）が、修正すべき既存テストとして設計書・要件書
   のどちらにも明記されていない。本書 INF-UPD-01 で明示したが、実装計画のタスク分解にも
   「既存テスト 1 件の修正」を含めることを推奨する（見落とすと `set` 句を 4 列化した瞬間に
   既存テストが失敗し、実装者が「デグレした」と誤認するリスクがある）。
