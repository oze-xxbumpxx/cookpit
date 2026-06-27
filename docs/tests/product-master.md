# 試験計画: Product マスタ + 価格履歴（Sprint 2）

- 作成日: 2026-06-26
- 対応スプリント: Sprint 2
- 変更レベル: L3
- 参照:
  - `docs/requirements/product-master.md`（§7 試験観点 N1〜N18 / E1〜E13 / B1〜B8）
  - `docs/designs/product-master.md`（§5 計算ロジック / §6 永続化 / §7 DB スキーマ / §11 エラー処理）
  - `docs/designs/product-master.contract.md`（§7 契約テスト方針）

---

## 目次

1. [試験スコープと層別方針](#1-試験スコープと層別方針)
2. [単体テスト観点（Domain 層）](#2-単体テスト観点domain-層)
3. [UseCase テスト観点（Application 層）](#3-usecase-テスト観点application-層)
4. [契約・結合テスト観点](#4-契約結合テスト観点)
5. [E2E スモーク観点](#5-e2e-スモーク観点)
6. [境界値・unitPrice 切り替わり表](#6-境界値unitprice-切り替わり表)
7. [冪等性・回帰範囲](#7-冪等性回帰範囲)
8. [試験データ](#8-試験データ)
9. [完了条件](#9-完了条件)
10. [未確定事項（ブロッカー候補）](#10-未確定事項ブロッカー候補)

---

## 1. 試験スコープと層別方針

### 1-1. Sprint 2 で実装・検証する範囲

| 層 | 自動テスト | 備考 |
|---|---|---|
| Domain（`packages/domain`） | Vitest co-located（`src/**/*.test.ts`）必須 | 本 Sprint 実装対象。既存パターン踏襲 |
| Application（`packages/application`） | Vitest co-located（`src/**/*.test.ts`）必須 | 本 Sprint で UseCase テストを実装する |
| Infrastructure（`packages/infrastructure`） | 後続フェーズ整備（coding-standards.md 準拠） | 本 Sprint はスコープ外。手動確認で代替 |
| API 契約（`packages/api-contract`） | Vitest co-located | Zod スキーマ単体テストを実装する |
| E2E | Playwright スモーク（`apps/web/e2e/`）。原則ローカル `pnpm e2e` | 実 UI 完成後に実行。UI 未実装の間は観点記述のみ |

### 1-2. スコープ外

- MealPlan / Pantry / ShoppingList に関連する機能
- Recipe 集約の変更（Sprint 2 スコープ外。`RecipeIngredient.productRef` は現状維持）
- 認証・権限制御（MVP1 は認証なし。ADR-003 準拠）
- Infrastructure 層の自動テスト（後続フェーズ）

---

## 2. 単体テスト観点（Domain 層）

テストランナー: Vitest。配置: `packages/domain/src/**/*.test.ts`（co-located）。
既存パターン: `recipe-id.test.ts` / `recipe.test.ts` / `recipe-ingredient.test.ts` に倣う。

---

### 2-1. Money 値オブジェクト（`packages/domain/src/shared/money.ts`）

**ファイル**: `money.test.ts`

#### of — 生成・境界値

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| MO-1 | — | `Money.of(0, 'JPY')` | 成功。`amount === 0`、`currency === 'JPY'` |
| MO-2 | — | `Money.of(100, 'JPY')` | 成功。`amount === 100` |
| MO-3 | — | `Money.of(0.01, 'JPY')` | 成功（最小正数）。`amount === 0.01` |
| MO-4 | — | `Money.of(-1, 'JPY')` | `Error` を throw（負の金額は不可） |
| MO-5 | — | `Money.of(-0.001, 'JPY')` | `Error` を throw |

#### add

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| MO-6 | `a = Money.of(100, 'JPY')`, `b = Money.of(50, 'JPY')` | `a.add(b)` | `amount === 150` |
| MO-7 | `a = Money.of(0, 'JPY')`, `b = Money.of(0, 'JPY')` | `a.add(b)` | `amount === 0` |

#### multiply

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| MO-8 | `m = Money.of(100, 'JPY')` | `m.multiply(3)` | `amount === 300` |
| MO-9 | `m = Money.of(100, 'JPY')` | `m.multiply(0)` | `amount === 0` |
| MO-10 | `m = Money.of(100, 'JPY')` | `m.multiply(0.5)` | `amount === 50` |

#### isLessThan

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| MO-11 | `a = Money.of(40, 'JPY')`, `b = Money.of(50, 'JPY')` | `a.isLessThan(b)` | `true` |
| MO-12 | `a = Money.of(50, 'JPY')`, `b = Money.of(50, 'JPY')` | `a.isLessThan(b)` | `false`（同値は false） |
| MO-13 | `a = Money.of(60, 'JPY')`, `b = Money.of(50, 'JPY')` | `a.isLessThan(b)` | `false` |

---

### 2-2. ID 値オブジェクト群

既存 `RecipeId` テストのパターン（ID1〜ID4）を完全踏襲する。

#### ProductId（`packages/domain/src/product/product-id.ts`）

**ファイル**: `product-id.test.ts`

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| PI-1 | — | `ProductId.generate()` を2回呼ぶ | 各戻り値が UUID 形式（`/^[0-9a-f-]{36}$/`）。2値は等しくない |
| PI-2 | — | `ProductId.fromString('abc').value` | `'abc'` |
| PI-3 | — | `ProductId.fromString('abc').equals(ProductId.fromString('abc'))` | `true` |
| PI-4 | — | `ProductId.fromString('abc').equals(ProductId.fromString('xyz'))` | `false` |

#### StoreId（`packages/domain/src/shared/store.ts` 内、または専用ファイル）

**ファイル**: `store.test.ts`（Store Entity と同ファイルも可）

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| SI-1 | — | `StoreId.generate()` を2回呼ぶ | 各戻り値が UUID 形式。2値は等しくない |
| SI-2 | — | `StoreId.fromString('abc').value` | `'abc'` |
| SI-3 | — | `StoreId.fromString('abc').equals(StoreId.fromString('abc'))` | `true` |
| SI-4 | — | `StoreId.fromString('abc').equals(StoreId.fromString('xyz'))` | `false` |

#### PriceRecordId

**ファイル**: `product.test.ts` 内、または `price-record-id.test.ts`

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| PRI-1 | — | `PriceRecordId.generate()` を2回呼ぶ | UUID 形式。2値は等しくない |
| PRI-2 | — | `PriceRecordId.fromString('abc').value` | `'abc'` |
| PRI-3 | — | `PriceRecordId.fromString('abc').equals(PriceRecordId.fromString('abc'))` | `true` |

---

### 2-3. Store Entity（`packages/domain/src/shared/store.ts`）

**ファイル**: `store.test.ts`

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| ST-1 | — | `Store.create({ name: 'コモディイイダ' })` | `id.value` が UUID 形式。`name === 'コモディイイダ'` |
| ST-2 | 固定 ID `store-1`、name `ライフ`、createdAt 指定 | `Store.reconstruct({ id, name, createdAt })` | `id.value === 'store-1'`、`name === 'ライフ'`、`createdAt` が引数と同値 |

---

### 2-4. Product 集約（`packages/domain/src/product/product.ts`）

**ファイル**: `product.test.ts`

#### Product.create — バリデーション

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| PC-1 | — | `Product.create({ name: '玉ねぎ', aliases: [], category: '野菜', defaultUnit: '個' })` | 成功。`id.value` が UUID 形式。`priceHistory === []` |
| PC-2 | — | name に `''` を渡す | `Error` を throw（`'Product name is required'` 相当） |
| PC-3 | — | name に `'  '` を渡す | `Error` を throw（trim 後空文字） |
| PC-4 | — | `aliases: ['タマネギ', 'オニオン']` を渡す | `aliases` が `['タマネギ', 'オニオン']` |

#### Product.reconstruct

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| PR-1 | 固定 ID・createdAt・updatedAt を持つ props | `Product.reconstruct(props)` | 全フィールドが props 値を保持する。`priceHistory` が渡した配列と同値 |

#### Product.recordPrice — 価格履歴追加

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| PP-1 | `priceHistory === []` の Product | 有効な PriceRecord を `recordPrice()` で追加 | `priceHistory.length === 1`。追加したレコードが含まれる |
| PP-2 | PriceRecord が1件ある Product | 別の PriceRecord を `recordPrice()` で追加 | `priceHistory.length === 2` |

#### Product.latestPriceAt — 最新価格取得

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| LP-1 | storeId `s1` の PriceRecord を observedAt `t1`、`t2`（`t2 > t1`）で2件登録 | `latestPriceAt(s1, now)` | `observedAt === t2` のレコード（最新）を返す |
| LP-2 | storeId `s1` の PriceRecord が1件 | `latestPriceAt(s1, now)` | そのレコードを返す |
| LP-3 | storeId `s2` の記録はあるが `s1` の記録はない | `latestPriceAt(s1, now)` | `null` を返す |
| LP-4 | `priceHistory === []` | `latestPriceAt(s1, now)` | `null` を返す |

#### Product.cheapestStoreAt — 最安店舗取得

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| CS-1 | storeId `s1` のみ価格記録あり（unitPrice 45.7） | `cheapestStoreAt(now)` | `storeId === s1` の StoreId を返す |
| CS-2 | storeId `s1`（unitPrice 45.7）と `s2`（unitPrice 38.2）を登録 | `cheapestStoreAt(now)` | `storeId === s2`（unitPrice が低い方）を返す |
| CS-3 | storeId `s1`（unitPrice 50）と `s2`（unitPrice 50）を登録（同価格） | `cheapestStoreAt(now)` | どちらか一方の StoreId が返る（同値の場合の優先ルールは設計書に規定なし。実装確定後に1案へ収束） |
| CS-4 | `priceHistory === []` | `cheapestStoreAt(now)` | `null` を返す |
| CS-5 | storeId `s1` に古い記録（`t1`）と新しい記録（`t2`）が2件あり | `cheapestStoreAt(now)` | `t2`（最新）の unitPrice を使って比較する |

---

### 2-5. UnitPriceCalculator（`packages/domain/src/product/unit-price-calculator.ts`）

**ファイル**: `unit-price-calculator.test.ts`

丸め方針（U1）は設計推奨「小数点以下1桁 + `Math.round`」を前提に記述する。
**U1 が未確定のため、境界値テストはパラメタ化して記述し、確定後に期待値を1案に収束させること。**

#### 重量系

| No | 前提 | 操作（priceAmount, packageSizeValue, unit） | 期待 unitPriceAmount |
|---|---|---|---|
| UC-1 | — | `(137, 300, 'g')` | `137 / 300 * 100` を丸め（推奨案: 45.7） |
| UC-2 | — | `(200, 1, 'kg')` | 1kg = 1000g → `200 / 1000 * 100` を丸め（推奨案: 20.0） |
| UC-3 | — | `(500, 500, 'g')` | `500 / 500 * 100` = 100.0 |
| UC-4 kg→g 換算 | — | `(300, 0.5, 'kg')` | 0.5kg = 500g → `300 / 500 * 100` = 60.0 |

#### 容量系

| No | 前提 | 操作（priceAmount, packageSizeValue, unit） | 期待 unitPriceAmount |
|---|---|---|---|
| UC-5 | — | `(198, 500, 'ml')` | `198 / 500 * 100` を丸め（推奨案: 39.6） |
| UC-6 | — | `(298, 1, 'l')` | 1l = 1000ml → `298 / 1000 * 100` = 29.8 |
| UC-7 l→ml 換算 | — | `(198, 0.5, 'l')` | 0.5l = 500ml → `198 / 500 * 100` = 39.6 |

#### 個数系・調理単位

対象 Unit: `大さじ` `小さじ` `cup` `個` `本` `枚` `玉` `尾` `切れ` `束` `袋` `缶` `合`

| No | 前提 | 操作（priceAmount, packageSizeValue, unit） | 期待 unitPriceAmount |
|---|---|---|---|
| UC-8 | — | `(98, 1, '個')` | `98 / 1` = 98.0（1単位あたり） |
| UC-9 | — | `(98, 3, '個')` | `98 / 3` を丸め（推奨案: 32.7） |
| UC-10 | — | `(300, 5, '本')` | `300 / 5` = 60.0 |
| UC-11 | — | `(200, 10, '大さじ')` | `200 / 10` = 20.0 |
| UC-12 | — | `(400, 6, '枚')` | `400 / 6` を丸め（推奨案: 66.7） |

#### 丸め境界値（U1 確定後に期待値1案へ収束）

| No | 操作 | 推奨案（小数点以下1桁 + Math.round） | 代替案（整数 Math.round） |
|---|---|---|---|
| UC-13 | `(137, 300, 'g')` → 45.666... | 45.7 | 46 |
| UC-14 | `(100, 3, '個')` → 33.333... | 33.3 | 33 |
| UC-15 | `(100, 6, '個')` → 16.666... | 16.7 | 17 |

#### ゼロ除算・最小値境界

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| UC-16 | — | `priceAmount = 0.01`（最小正数）, `packageSizeValue = 1, 'g'` | 計算成功。ゼロ除算は発生しない |
| UC-17 | — | `priceAmount = 1`, `packageSizeValue = 0.001, 'g'` | 計算成功（`1 / 0.001 * 100` = 100000.0）。Money.of に渡る前に overflow なし |
| UC-18 | — | `packageSizeValue = 0`（Quantity が正数制約で弾くが、Calculator 直呼びを想定する場合） | ゼロ除算回避のため `Error` を throw する、または Quantity.of が先に throw する（実装によって確認） |

---

## 3. UseCase テスト観点（Application 層）

テストランナー: Vitest。配置: `packages/application/src/product/*.test.ts`。
インメモリ Repository スタブを使用（`recipe-use-cases.test.ts` の `InMemoryRecipeRepository` パターン踏襲）。

### 3-1. インメモリ Repository スタブの構成

実装時に用意するスタブの I/F:

```
InMemoryProductRepository implements ProductRepository
  - store: Map<string, Product>
  - saveCount: number
  - deletedIds: string[]
  - findById(id: ProductId): Promise<Product | null>
  - findAll(): Promise<Product[]>
  - save(product: Product): Promise<void>
  - delete(id: ProductId): Promise<void>
  - seed(product: Product): void

InMemoryStoreRepository implements StoreRepository
  - store: Map<string, Store>
  - findById(id: StoreId): Promise<Store | null>
  - findAll(): Promise<Store[]>
  - seed(store: Store): void
```

---

### 3-2. CreateProductUseCase

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| UC-CP-1 | repository 空 | `execute({ name: '玉ねぎ', aliases: [], category: '野菜', defaultUnit: '個' })` | `saveCount === 1`。返却 DTO の `id` が UUID 形式、`name === '玉ねぎ'`、`priceHistory === []` |
| UC-CP-2 | — | aliases に `['タマネギ', '', '  オニオン  ']` を渡す | UseCase 入口で空文字除去・trim が適用される。返却 DTO の `aliases === ['タマネギ', 'オニオン']` |
| UC-CP-3 | — | aliases に `['', '  ']` を渡す | 除去後 `aliases === []`。saveCount === 1（エラーにならない） |
| UC-CP-4 | — | `name: ''` を渡す | `Error` を throw（name 空白不可）。`saveCount === 0` |
| UC-CP-5 | — | `name: '  '` を渡す | `Error` を throw（trim 後空文字）。`saveCount === 0` |
| UC-CP-6 | — | `createdAt` が返却 DTO の ISO 文字列形式 | `dto.createdAt` が `new Date(dto.createdAt).toISOString() === dto.createdAt` を満たす |

---

### 3-3. GetProductsUseCase

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| UC-GP-1 | repository 空 | `execute()` | `[]` を返す |
| UC-GP-2 | repository に2件シード | `execute()` | `length === 2`。全件 ProductDto が返る |

---

### 3-4. GetProductUseCase

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| UC-GS-1 | `id-1` をシード | `execute('id-1')` | `dto.id === 'id-1'` |
| UC-GS-2 | repository 空 | `execute('missing')` | `ProductNotFoundError` を throw |

---

### 3-5. UpdateProductUseCase

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| UC-UP-1 | `id-1` をシード（`name: '玉ねぎ'`, `aliases: []`） | `execute({ id: 'id-1', name: 'たまねぎ', aliases: ['タマネギ'], category: '野菜', defaultUnit: '個' })` | 返却 DTO `name === 'たまねぎ'`、`aliases === ['タマネギ']`。`saveCount === 1` |
| UC-UP-2 | `id-1` をシード | aliases に `['', '玉ねぎ', '  ']` を渡す | 返却 DTO `aliases === ['玉ねぎ']`（空文字除去） |
| UC-UP-3 | repository 空 | `execute({ id: 'missing', ... })` | `ProductNotFoundError` を throw。`saveCount === 0` |
| UC-UP-4 | `id-1` をシード（`updatedAt: t1`） | `execute({ id: 'id-1', ... })` | 返却 DTO `updatedAt > createdAt`（更新時刻が進む） |

---

### 3-6. DeleteProductUseCase

U3 の確定に依存する（推奨案: `ProductNotFoundError`）。両案を記述し、確定後に収束させる。

| No | 前提 | 操作 | 期待結果（推奨案 U3-NotFound） | 期待結果（代替案 U3-冪等） |
|---|---|---|---|---|
| UC-DP-1 | `id-1` をシード | `execute('id-1')` | `deletedIds === ['id-1']`。例外なし | 同左 |
| UC-DP-2 | `id-1` をシード → 削除後に再度削除 | `execute('id-1')` x2 | 2回目は `ProductNotFoundError` を throw。`deletedIds` の要素は1件 | 2回目も例外なし（冪等） |
| UC-DP-3 | repository 空 | `execute('missing')` | `ProductNotFoundError` を throw。`deletedIds === []` | 例外なし |

---

### 3-7. RecordPriceUseCase

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| UC-RP-1 | Product `p1`、Store `s1` をシード | `execute({ productId: 'p1', storeId: 's1', priceAmount: 137, packageSizeValue: 300, packageSizeUnit: 'g' })` | 例外なし。`saveCount === 1`。Product の `priceHistory.length === 1` |
| UC-RP-2 | Product `p1`、Store `s1` をシード | `execute()` を2回呼ぶ | `priceHistory.length === 2`（U5 推奨案: 重複許可） |
| UC-RP-3 | — | `priceAmount: 0` | `Error` を throw。`saveCount === 0` |
| UC-RP-4 | — | `priceAmount: -1` | `Error` を throw |
| UC-RP-5 | — | `packageSizeValue: 0` | `Error` を throw（ゼロ除算防止） |
| UC-RP-6 | — | `packageSizeValue: -0.5` | `Error` を throw |
| UC-RP-7 | Store `s1` はシードするが Product は存在しない | `execute({ productId: 'missing', ... })` | `ProductNotFoundError` を throw |
| UC-RP-8 | Product `p1` はシードするが Store は存在しない | `execute({ storeId: 'missing-store', ... })` | `StoreNotFoundError` を throw（U4 推奨案）。`saveCount === 0` |
| UC-RP-9 | Product `p1`、Store `s1` をシード。重量系 g | `execute({ priceAmount: 200, packageSizeValue: 500, packageSizeUnit: 'g' })` | 保存後 `priceHistory[0].unitPrice.amount` が期待値（推奨案: 40.0）と一致 |
| UC-RP-10 | Product `p1`、Store `s1` をシード。容量系 l | `execute({ priceAmount: 298, packageSizeValue: 1, packageSizeUnit: 'l' })` | `unitPrice.amount` が期待値（推奨案: 29.8）と一致 |
| UC-RP-11 | Product `p1`、Store `s1` をシード。個数系 | `execute({ priceAmount: 98, packageSizeValue: 1, packageSizeUnit: '個' })` | `unitPrice.amount === 98` |

---

### 3-8. GetCheapestStoreUseCase

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| UC-GC-1 | Product `p1`（priceHistory なし）、Store シードあり | `execute('p1')` | `null` を返す |
| UC-GC-2 | Product `p1` に Store `s1`（unitPrice 45.7）の記録 | `execute('p1')` | `storeId === 's1'`、`storeName === 'コモディイイダ'`、`unitPrice === 45.7` |
| UC-GC-3 | Product `p1` に Store `s1`（unitPrice 45.7）と `s2`（unitPrice 38.2）の記録 | `execute('p1')` | `storeId === 's2'`（最安） |
| UC-GC-4 | Product が存在しない | `execute('missing')` | `ProductNotFoundError` を throw |
| UC-GC-5 | Product `p1` に Store `s1` の記録が2件（古い unitPrice 50、新しい unitPrice 40） | `execute('p1')` | 最新記録（unitPrice 40）を使って比較する |

---

### 3-9. GetStoresUseCase

| No | 前提 | 操作 | 期待結果 |
|---|---|---|---|
| UC-GStore-1 | InMemoryStoreRepository に `コモディイイダ` / `ライフ` の2件をシード | `execute()` | `length === 2`。`id` が UUID 形式、`name` が各店舗名 |
| UC-GStore-2 | InMemoryStoreRepository 空 | `execute()` | `[]` を返す（エラーにならない） |

---

## 4. 契約・結合テスト観点

### 4-1. Zod スキーマ単体テスト（`packages/api-contract/src/product.schema.test.ts`）

contract.md §7-1 の観点に基づく。テストランナー: Vitest。

#### createProductSchema

| No | 前提 | テスト値 | 期待結果 |
|---|---|---|---|
| ZP-1 | — | `name: "玉ねぎ"` + 有効な category / defaultUnit / aliases | `safeParse` 成功 |
| ZP-2 | — | `name: ""` | `safeParse` 失敗（required エラー） |
| ZP-3 | — | `name: "  "` | `safeParse` 失敗（trim 後空文字） |
| ZP-4 | — | `category: "果物"` | `safeParse` 失敗（enum 外） |
| ZP-5 | — | category に全7値（`野菜` `肉` `魚` `調味料` `乾物` `冷凍` `その他`）を各々入力 | 全て成功 |
| ZP-6 | — | `defaultUnit: "oz"` | `safeParse` 失敗（enum 外） |
| ZP-7 | — | `aliases: []` | 成功 |
| ZP-8 | — | `aliases: ["", "玉ねぎ"]` | Zod 層では成功（空文字除去は UseCase 責務） |
| ZP-9 | — | `aliases` フィールドなし | `safeParse` 失敗（required） |

#### recordPriceSchema

| No | 前提 | テスト値 | 期待結果 |
|---|---|---|---|
| ZR-1 | — | 有効な storeId（UUID）/ priceAmount 正数 / packageSizeValue 正数 / 有効 unit | 成功 |
| ZR-2 | — | `priceAmount: 0` | 失敗（positive 制約） |
| ZR-3 | — | `priceAmount: -1` | 失敗 |
| ZR-4 | — | `priceAmount: 0.01` | 成功（最小正数） |
| ZR-5 | — | `packageSizeValue: 0` | 失敗（positive 制約） |
| ZR-6 | — | `packageSizeValue: -1` | 失敗 |
| ZR-7 | — | `storeId: "not-a-uuid"` | 失敗（UUID 形式外） |
| ZR-8 | — | `storeId: "550e8400-e29b-41d4-a716-446655440010"` | Zod 層では成功（存在確認は UseCase 責務） |
| ZR-9 | — | `packageSizeUnit: "oz"` | 失敗（enum 外） |

#### updateProductSchema

| No | 前提 | テスト値 | 期待結果 |
|---|---|---|---|
| ZU-1 | — | 有効な全フィールド | 成功 |
| ZU-2 | — | `name: "  "` | 失敗 |
| ZU-3 | — | `aliases: []` | 成功 |

---

### 4-2. Hono ルート契約テスト観点

Infrastructure / DB を伴うため、これらは本 Sprint では手動確認または後続フェーズの自動テストとする。
以下の観点を記録し、自動化時に実装する。

#### HTTP ステータス確認

| No | 操作 | 期待ステータス | 備考 |
|---|---|---|---|
| HR-1 | `GET /api/products` | 200 | — |
| HR-2 | `POST /api/products`（有効 body） | 201 | — |
| HR-3 | `GET /api/products/:id`（存在する ID） | 200 | — |
| HR-4 | `GET /api/products/:id`（存在しない ID） | 404 + `{ error: "Product not found: ..." }` | — |
| HR-5 | `GET /api/products/not-a-uuid` | 400（param UUID チェック） | `zValidator('param', idParamSchema)` |
| HR-6 | `PUT /api/products/:id`（存在する ID・有効 body） | 200 | — |
| HR-7 | `PUT /api/products/:id`（存在しない ID） | 404 | — |
| HR-8 | `DELETE /api/products/:id`（存在する ID） | 204（空ボディ） | — |
| HR-9 | `DELETE /api/products/:id`（存在しない ID） | 404（推奨案 U3）または 204（代替案）| **U3 確定待ち。確定後に1案へ収束** |
| HR-10 | `POST /api/products/:id/price-records`（正常） | **200 or 201 or 204（C1 未確定）** | **C1 確定待ち。両案の期待値は下記に別記** |
| HR-11 | `POST /api/products/:id/price-records`（priceAmount = 0） | 400 | — |
| HR-12 | `POST /api/products/:id/price-records`（storeId 不正 UUID） | 400（Zod） | — |
| HR-13 | `POST /api/products/:id/price-records`（存在しない storeId） | 404（StoreNotFoundError、U4 推奨案） | — |
| HR-14 | `GET /api/products/:id/cheapest-store`（価格記録あり） | 200 + CheapestStoreResultDto | — |
| HR-15 | `GET /api/products/:id/cheapest-store`（価格記録なし） | 200 + null 相当（**C2 確定待ち。両案別記**） | — |
| HR-16 | `GET /api/stores` | 200 + `StoreDto[]`（シード2件） | — |

**C1（RecordPrice 成功ステータス）確定待ちの両案期待値:**

| 案 | 期待ステータス | 期待ボディ |
|---|---|---|
| 案A（推奨） | 200 | 空ボディ |
| 案B | 201 | 空ボディ |
| 案C | 204 | 空ボディ |

**C2（cheapest-store null 表現）確定待ちの両案期待値:**

| 案 | 価格記録なし時の body | 価格記録あり時の body |
|---|---|---|
| 案A（推奨） | `{ "data": null }` | `{ "data": { storeId, storeName, latestPrice, unitPrice } }` |
| 案B | `null`（JSON リテラル） | `{ storeId, storeName, latestPrice, unitPrice }` |

---

### 4-3. DTO 往復テスト観点（統合観点）

手動確認または後続の結合テストで検証する。

| No | 観点 | 確認内容 |
|---|---|---|
| DT-1 | ProductDto の全フィールド型 | Repository → Entity → Mapper → ProductDto 変換で全フィールドの型・値が一致すること |
| DT-2 | PriceRecordDto.storeName 解決 | UseCase が StoreRepository から storeName を解決し、PriceRecordDto.storeName に非 null 値が入ること |
| DT-3 | priceHistory 空配列 | 価格記録なし Product の `dto.priceHistory === []` |
| DT-4 | ISO 文字列変換 | `createdAt` / `updatedAt` / `observedAt` が `new Date(str).toISOString() === str` を満たすこと |
| DT-5 | aliases 空文字除去の往復 | UseCase 入口で `["", " 玉ねぎ ", "  "]` を渡した場合、返却 DTO の `aliases === ["玉ねぎ"]` |
| DT-6 | unitPrice の DB 保存・復元 | 保存前の `unitPrice.amount` と DB 復元後の値が一致すること（丸め方針 U1 確定後に精度確認） |

---

### 4-4. 後方互換検証観点

| No | 観点 | 確認内容 |
|---|---|---|
| BC-1 | recipe 契約への無影響 | `GET /api/recipes` が引き続き 200 を返し、既存の `RecipeDto` 形式を返すこと |
| BC-2 | api-contract の既存エクスポート | `unitSchema` / `createRecipeSchema` 等が変わらず `@cookpit/api-contract` から import できること |
| BC-3 | onError の既存動作 | `RecipeNotFoundError` が引き続き 404 にマップされること（`ProductNotFoundError` 追加後も） |
| BC-4 | recipe E2E への無影響 | `apps/web/e2e/recipe-crud.smoke.spec.ts` が引き続き通過すること |

---

## 5. E2E スモーク観点

テストランナー: Playwright。配置: `apps/web/e2e/product-crud.smoke.spec.ts`（新規）。
実行コマンド: `pnpm e2e`（ローカル。アプリ + DB 起動必須）。

**注意: 実 UI は未実装のため、現時点ではセレクタ方針のみを記述する。実装完了後にセレクタを確定し、テストコードを実装すること。以下のセレクタ・ロール・見出しは recipe-crud.smoke の構造と方針に従った想定例であり、実装後に修正が必要な場合がある。**

`recipe-crud.smoke.spec.ts` の踏襲方針:
- テスト名は `'商品を作成・編集・削除できる'` 相当
- 実行ごとに一意な名前（`Date.now()` サフィックス）でデータ衝突を回避
- `page.getByRole()` / `page.getByPlaceholder()` / `page.getByText()` を優先する

---

### 5-1. 商品 CRUD ハッピーパス

```
テスト: 商品を作成・編集・削除できる

前提: アプリ + DB 起動済み。stores テーブルにシードデータ（コモディイイダ / ライフ）投入済み。

1. 一覧
   page.goto('/products')
   getByRole('heading', { name: '商品一覧' 相当 }) が表示される（実装後にセレクタ確定）

2. 作成画面へ
   getByRole('link', { name: '追加' 相当 }) をクリック
   作成フォームの見出しが表示される

3. 入力して保存
   name フィールドに `E2Eスモーク-<timestamp>` を入力
   category セレクタで '野菜' を選択
   defaultUnit セレクタで '個' を選択
   aliases 欄（カンマ区切り）に 'テスト用,テスト商品' を入力
   保存ボタンをクリック
   一覧 URL（/products）へリダイレクトされる

4. 一覧に作成した商品が表示される
   作成した商品名のカード or リンクが表示されること

5. 詳細画面へ
   商品名のリンクをクリック（実装後にセレクタ確定）
   見出しに商品名が表示される
   aliases が ',' 区切りまたはリストで表示される

6. 編集画面へ
   編集ボタンをクリック
   編集フォーム見出しが表示される
   name を `E2Eスモーク-<timestamp>-改` に変更して保存
   保存後に詳細画面へ戻り、変更後の名前が見出しに表示される

7. 削除
   削除ボタンをクリック
   確認ダイアログが表示される（recipe パターン踏襲: 2段階確認）
   確認して削除
   一覧へ戻り、削除した商品が表示されないこと
```

---

### 5-2. 価格記録 + 最安店舗表示 + グラフ表示 ハッピーパス

```
テスト: 価格記録が詳細画面に反映され、最安店舗が表示される

前提: 上記 5-1 で作成した商品（または別途 seed した商品）が存在すること。

1. 詳細画面へ遷移（/products/[id]）
   価格記録ゼロの状態では「価格記録なし」相当の表示がある（実装後にセレクタ確定）
   GetCheapestStore が null のため最安店舗は表示されない

2. 価格記録フォームに入力
   storeId: 'コモディイイダ' をセレクタで選択
   priceAmount: 137 を入力
   packageSizeValue: 300 を入力
   packageSizeUnit: 'g' を選択
   記録ボタンをクリック
   TanStack Query が invalidate され、詳細が再描画される

3. 詳細に価格記録が反映される
   priceHistory に1件追加されている（表示上で確認）
   unitPrice が算出されて表示される（推奨案: 45.7円/100g 相当）

4. さらに別店舗で記録
   storeId: 'ライフ' を選択
   priceAmount: 120, packageSizeValue: 300, packageSizeUnit: 'g' で記録
   unitPrice: 40.0円/100g 相当

5. 最安店舗が表示される
   GetCheapestStore が 'ライフ'（unitPrice 40.0）を返す
   詳細画面に 'ライフ' が最安店舗として表示される

6. グラフ表示
   価格推移グラフ（折れ線）が表示される
   X軸: observedAt（時系列）
   Y軸: unitPrice
   店舗別色分け（コモディイイダ / ライフが異なる色）

注記: グラフ内容の正確な検証（Recharts の canvas/SVG）は Playwright で困難なため、
表示エラーがないこと（コンソールエラーなし）の確認に留める。
```

---

## 6. 境界値・unitPrice 切り替わり表

単位種別ごとの計算基準と切り替わりを網羅した表。

### 6-1. 単位種別と計算基準

| 単位 | 種別 | 計算基準 | 換算 | 計算式 |
|---|---|---|---|---|
| `g` | 重量系 | 100g あたり | そのまま | `priceAmount / grams * 100` |
| `kg` | 重量系 | 100g あたり | 1kg = 1000g | `priceAmount / (value * 1000) * 100` |
| `ml` | 容量系 | 100ml あたり | そのまま | `priceAmount / ml * 100` |
| `l` | 容量系 | 100ml あたり | 1l = 1000ml | `priceAmount / (value * 1000) * 100` |
| `個` | 個数系 | 1個あたり | — | `priceAmount / value` |
| `本` | 個数系 | 1本あたり | — | `priceAmount / value` |
| `枚` | 個数系 | 1枚あたり | — | `priceAmount / value` |
| `玉` | 個数系 | 1玉あたり | — | `priceAmount / value` |
| `尾` | 個数系 | 1尾あたり | — | `priceAmount / value` |
| `切れ` | 個数系 | 1切れあたり | — | `priceAmount / value` |
| `束` | 個数系 | 1束あたり | — | `priceAmount / value` |
| `袋` | 個数系 | 1袋あたり | — | `priceAmount / value` |
| `缶` | 個数系 | 1缶あたり | — | `priceAmount / value` |
| `合` | 調理単位 | 1合あたり | — | `priceAmount / value` |
| `大さじ` | 調理単位 | 1大さじあたり | — | `priceAmount / value` |
| `小さじ` | 調理単位 | 1小さじあたり | — | `priceAmount / value` |
| `cup` | 調理単位 | 1cupあたり | — | `priceAmount / value` |

### 6-2. 単位種別の境界切り替わりテスト（パラメタ化推奨）

| No | priceAmount | packageSizeValue | unit | 種別 | 期待 unitPriceAmount（推奨案） |
|---|---|---|---|---|---|
| BV-1 | 300 | 100 | `g` | 重量系 | 300.0 |
| BV-2 | 300 | 0.1 | `kg` | 重量系（kg→g: 100g） | 300.0（0.1kg = 100g なので同値） |
| BV-3 | 198 | 200 | `ml` | 容量系 | 99.0 |
| BV-4 | 198 | 0.2 | `l` | 容量系（l→ml: 200ml） | 99.0（0.2l = 200ml なので同値） |
| BV-5 | 100 | 1 | `個` | 個数系 | 100.0 |
| BV-6 | 100 | 1 | `大さじ` | 調理単位 | 100.0 |
| BV-7 | 100 | 1 | `cup` | 調理単位 | 100.0 |
| BV-8（g/kg 境界） | 500 | 1000 | `g` | 重量系 | 50.0（1000g = 1kg 相当） |
| BV-9（g/kg 境界） | 500 | 1 | `kg` | 重量系 | 50.0（1kg = 1000g） |
| BV-10（ml/l 境界） | 500 | 1000 | `ml` | 容量系 | 50.0 |
| BV-11（ml/l 境界） | 500 | 1 | `l` | 容量系 | 50.0（1l = 1000ml） |

BV-8 と BV-9、BV-10 と BV-11 の結果が一致することで、g/kg・ml/l 換算の対称性を確認する。

---

## 7. 冪等性・回帰範囲

### 7-1. 冪等性一覧

| エンドポイント / 操作 | 冪等性 | 根拠・備考 |
|---|---|---|
| GET /api/products | 冪等 | 副作用なし |
| GET /api/products/:id | 冪等 | 副作用なし |
| GET /api/products/:id/cheapest-store | 冪等 | 副作用なし |
| GET /api/stores | 冪等 | 副作用なし |
| PUT /api/products/:id | 冪等 | 同一ボディで複数回呼んでも結果は同じ |
| DELETE /api/products/:id | 非冪等（推奨案 U3） | 2回目は ProductNotFoundError → 404 |
| POST /api/products | 非冪等 | 毎回新規 Product が UUID 採番で作成される |
| POST /api/products/:id/price-records | 非冪等（U5 推奨: 重複許可） | 同一ボディを複数回呼ぶと同数の PriceRecord が追加される |
| Store シード（ON CONFLICT DO NOTHING） | 冪等 | 重複投入してもエラーにならない |

### 7-2. 冪等性テスト観点

| No | 操作 | 確認内容 |
|---|---|---|
| IMP-1 | `GET /api/products` を連続2回呼ぶ | 両レスポンスが一致すること（DB 変更なし） |
| IMP-2 | `PUT /api/products/:id` を同一ボディで2回呼ぶ | 2回目のレスポンスも1回目と同じ ProductDto |
| IMP-3 | Store シード SQL を2回実行する | 2回目でエラーが発生しない。store レコードは2件のまま |
| IMP-4 | `POST /api/products/:id/price-records` を同一ボディで2回呼ぶ | Product の `priceHistory.length === 2`（重複許可。U5 推奨案） |

### 7-3. 回帰テスト範囲

Product マスタ機能追加による既存機能への影響を確認する。

| No | 回帰対象 | 確認内容 | 確認方法 |
|---|---|---|---|
| REG-1 | Recipe 一覧 API | `GET /api/recipes` が 200 を返す | `pnpm test`（UseCase テスト） + 手動 |
| REG-2 | Recipe CRUD | 作成・取得・更新・削除が正常動作する | `pnpm test`（UseCase テスト） |
| REG-3 | recipe-crud E2E | `apps/web/e2e/recipe-crud.smoke.spec.ts` が通過する | `pnpm e2e` |
| REG-4 | api-contract エクスポート | `unitSchema` / `createRecipeSchema` 等が変わらず import できる | `pnpm type-check` |
| REG-5 | onError ハンドリング | `RecipeNotFoundError` が 404 にマップされること（`ProductNotFoundError` 追加後も） | 手動確認 |
| REG-6 | `pnpm lint` / `pnpm type-check` | エラーなし | 自動 |

---

## 8. 試験データ

### 8-1. Store シードデータ（固定 UUID）

```
Store A:
  id: （実装者が割り当てる固定 UUID。設計書 §7 U2 推奨案）
  name: 'コモディイイダ'

Store B:
  id: （実装者が割り当てる固定 UUID）
  name: 'ライフ'
```

シード SQL は `INSERT INTO stores ... ON CONFLICT (id) DO NOTHING` で冪等投入。

### 8-2. UseCase テスト用インメモリシードデータ

```
商品 A（id: 'p1'）:
  name: '玉ねぎ'
  aliases: ['タマネギ', 'オニオン']
  category: '野菜'
  defaultUnit: '個'
  priceHistory: []（初期空）

商品 B（id: 'p2'）:
  name: '牛薄切り肉'
  aliases: []
  category: '肉'
  defaultUnit: 'g'
  priceHistory:
    - storeId: 's1', priceAmount: 398, unitPrice: 199.0 /100g, packageSize: 200g, observedAt: '2026-06-01T10:00:00.000Z'
    - storeId: 's2', priceAmount: 348, unitPrice: 174.0 /100g, packageSize: 200g, observedAt: '2026-06-01T11:00:00.000Z'

Store A（id: 's1'）: name = 'コモディイイダ'
Store B（id: 's2'）: name = 'ライフ'
```

### 8-3. E2E テスト用動的データ

```
商品名: `E2Eスモーク-<Date.now()>`（実行ごとに一意化）
category: '野菜'
defaultUnit: '個'
aliases: 'テスト用商品'（カンマ区切りテキスト入力）

価格記録1（コモディイイダ）:
  priceAmount: 137
  packageSizeValue: 300
  packageSizeUnit: 'g'
  期待 unitPrice: 45.7円/100g（推奨案）

価格記録2（ライフ）:
  priceAmount: 120
  packageSizeValue: 300
  packageSizeUnit: 'g'
  期待 unitPrice: 40.0円/100g（推奨案）
  → 最安店舗として表示されることを確認
```

### 8-4. 境界値テスト専用データ

```
priceAmount 最小値: 0.01
packageSizeValue 最小値: 0.001（Quantity.of の非負チェックが通る最小値）
kg 換算チェック: { priceAmount: 500, packageSizeValue: 1, unit: 'kg' } → 100g あたり 50.0
l 換算チェック: { priceAmount: 500, packageSizeValue: 1, unit: 'l' } → 100ml あたり 50.0
aliases 空文字除去: ['', '  ', '玉ねぎ', '  タマネギ  '] → ['玉ねぎ', 'タマネギ']
```

---

## 9. 完了条件

以下をすべて満たした状態を「Sprint 2 試験完了」とする。

### 9-1. 自動テスト（必須）

| 条件 | コマンド | 対象範囲 |
|---|---|---|
| Domain 層テスト（緑） | `pnpm test`（Vitest） | `Money` / `StoreId` / `ProductId` / `PriceRecordId` / `Store` / `Product` / `UnitPriceCalculator` の各 `.test.ts` |
| Application 層テスト（緑） | `pnpm test` | 全8 UseCase の `.test.ts`（インメモリ Repository スタブ使用） |
| api-contract テスト（緑） | `pnpm test` | `createProductSchema` / `updateProductSchema` / `recordPriceSchema` / `storeSchema` の `.test.ts` |
| lint（緑） | `pnpm lint` | 全新規ファイル + 追記ファイル |
| 型チェック（緑） | `pnpm type-check` | 全 TypeScript ファイル |
| 既存テスト（回帰・緑） | `pnpm test` | `packages/domain/src/recipe/**/*.test.ts` / `packages/application/src/recipe/**/*.test.ts` |

### 9-2. E2E テスト

| 条件 | コマンド | 補足 |
|---|---|---|
| 商品 CRUD スモーク（緑） | `pnpm e2e` | 実 UI 実装後に実行。ローカル環境（アプリ + DB 起動済み） |
| 価格記録 + 最安店舗スモーク（緑） | `pnpm e2e` | 同上 |
| recipe-crud 回帰スモーク（緑） | `pnpm e2e` | 既存 `recipe-crud.smoke.spec.ts` が通過すること |

### 9-3. 手動確認（自動化前に実施）

| 確認項目 | 担当 | 状態 |
|---|---|---|
| aliases カンマ区切り入力が配列として保存・表示される | 実装者 / テスター | — |
| カテゴリ・単位のセレクト選択が機能する | 同上 | — |
| 価格記録フォームで重量/容量/個数の unitPrice が正しく計算される（目視） | 同上 | — |
| 価格推移グラフが店舗別色分けで表示される | 同上 | — |
| 最安店舗が商品詳細に表示される | 同上 | — |
| Store シード重複投入が冪等に完了する（ON CONFLICT DO NOTHING） | 実装者 | — |
| 存在しない商品 ID にアクセスすると Next.js 404 画面になる | 実装者 | — |
| `onError` 拡張後も RecipeNotFoundError が引き続き 404 にマップされる | 実装者 | — |

### 9-4. Infrastructure 層テスト

本 Sprint はスコープ外（`coding-standards.md` §テストランナー「Application / Infrastructure 層は後続フェーズで整備」に準拠）。
後続フェーズで以下を実装予定:

- `DrizzleProductRepository` の CRUD 統合テスト（テスト用 DB）
- `DrizzleStoreRepository` のシードデータ取得テスト
- `price_records` JOIN 復元の正確性検証

---

## 10. 未確定事項（ブロッカー候補）

試験計画上、期待値が確定できない未決事項を優先度順に列挙する。

| 優先度 | 未決 ID | 内容 | 影響テスト | 現状の扱い |
|---|---|---|---|---|
| 高 | **U1 / C3** | **unitPrice の丸め桁数・方式**（小数点以下1桁 + Math.round 推奨） | UC-13 / UC-14 / UC-15 / UC-RP-9 / UC-RP-10 / BV-1〜BV-11 の期待 unitPriceAmount | 推奨案を前提に記述。確定前に「小数点以下1桁 + Math.round」以外の案が選ばれた場合、数値を修正する必要がある |
| 高 | **C1** | **RecordPrice の成功ステータスコード**（200 / 201 / 204 の3案） | HR-10 | 両案（200 推奨 / 201 / 204）を別記。確定後に1案へ収束する |
| 高 | **C2** | **cheapest-store の null 表現**（`{ "data": null }` vs `null`） | HR-15 / E2E スモーク 5-2 の確認方法 | 両案を別記。確定後に1案へ収束する |
| 中 | **U3 / C4** | **DeleteProductUseCase の存在チェック**（404 vs 冪等 204） | UC-DP-2 / UC-DP-3 / HR-9 | 推奨案（404）を優先記述し、代替案（冪等）を併記 |
| 低 | **U5 / C5** | **価格記録の重複可否**（重複許可 vs 制限） | UC-RP-2 / IMP-4 | 推奨案（重複許可）を前提に記述 |
| 参考 | **U2** | **Store シード ID の固定化可否** | ST-1 / ST-2 / UseCase テストのシードデータ | 推奨案（固定 UUID）を前提に記述。テスト環境では InMemoryStoreRepository を使うため直接影響なし |

### ブロッカーとなる未決事項のサマリ

1. **U1（丸め方針）**: `UnitPriceCalculator` の期待 unitPriceAmount が数値として確定しない。テストコードは「推奨案の数値を仮置き」で実装し、確定時に修正する。
2. **C1（RecordPrice ステータス）**: Hono ルートテスト・E2E スモークの `expect(response.status).toBe(?)` の引数が1案に絞れない。確定後に即修正できる箇所を明示している（HR-10）。
3. **C2（null 表現）**: クライアントの型安全コードと E2E セレクタに影響する。`{ "data": null }` か `null` かで TanStack Query の `data` アクセスパターンが変わるため、早期確定が望ましい。
