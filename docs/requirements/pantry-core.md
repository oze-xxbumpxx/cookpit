# 要件定義: Pantry Core（Sprint 5 Unit A）

作成日: 2026-07-14
対象スプリント: Sprint 5 Unit A（pantry-core）
変更レベル: L3（新規集約 + 新規 DB スキーマ + 新規 UseCase 4 本 + 新規 API。Domain /
Application / Infrastructure / API Contract / Presentation(API) の全層にまたがる新規実装。
かつ 4 集約（ShoppingList / Pantry / Product / MealPlan）をまたぐオーケストレーション）
classify-change: 実施済み・再判定不要

---

## 1. 背景・目的

`docs/01-overview.md` の実運用フロー「土曜日に2人で相談して献立を決め → 買い物リストを作る →
2店舗を回って買い物 → 帰宅後に作り置き」のうち、「買い物完了 → 在庫が自動で増える」
「平日に在庫を手動で減らす（使った/捨てた）」のバックエンド一式を実装する。
`docs/05-roadmap.md` Sprint 5 の完了条件は「買い物完了で在庫が自動追加される」
「在庫の消費を記録できる」「次の献立作成時に在庫が考慮される」の 3 点。本ユニット（Unit A）は
このうち最初の 2 点のバックエンド実装を担う（3 点目は Unit C）。

これまで Sprint 3（MealPlan）・Sprint 4（ShoppingList）で `transitionTo()` /
`complete()` / `getBoughtItemsForPantry()`（未実装）等、Pantry 連携を見越した設計判断が
複数回「Sprint 5 に送る」形で申し送りされている（S-2 / S-8 / ADR-0006 等）。本要件書は
それらの申し送りを実際の Pantry 設計にどうつなぐかを整理する一次調査であり、
`getBoughtItemsForPantry()` の再設計を含め、確定は行わず論点として architecture-designer に
引き継ぐ。

## 2. スコープ / 非スコープ

### 2-1. 含む（このユニットで作るもの）

| 層                  | 実装対象                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Domain              | Pantry / PantryId / Stock / StockId 新規集約、`PantryRepository`（インターフェース）                                        |
| Infrastructure      | Drizzle スキーマ（新規テーブル。分離 or 単一かは設計判断 §6-d）+ `DrizzlePantryRepository`                                  |
| Application          | UseCase 4 本：`CompleteShoppingUseCase` / `ConsumeStockUseCase` / `DiscardStockUseCase` / `GetPantryUseCase`               |
| API Contract         | Zod スキーマ（`packages/api-contract/src/pantry.schema.ts` 相当）+ **買い物完了 API の新規スキーマ**                       |
| Presentation (API)   | Hono ルート（`apps/web/src/server/routes/pantry.ts` 相当）+ **`shopping-lists.ts` への買い物完了エンドポイント追加**       |

### 2-2. 含まない（対象外・他ユニット/他フェーズのスコープ）

- **在庫一覧画面・「使った」「捨てた」ボタン UI・買い物完了導線の UI** → Unit B
  （`pantry-screens`、L2、Orchestrator 経路）
- **`GenerateShoppingListUseCase` への Pantry 注入・在庫引き算・切り上げルールの実装** → Unit C
  （在庫引き算連携、L2、Orchestrator 経路）。ただし `calculateRequiredAmount()` /
  `findByProduct()` を Pantry 集約に含めるか否か自体は本ユニットで論点提起にとどめる（§6-e）
- 認証・複数ユーザー対応（Phase 2、ADR-0003 / ADR-0004 継続）
- 賞味期限アラート・食材ロス分析（Phase 2、`findExpiringSoon()` は草案に存在するが実装要否は
  設計判断に委ねる）
- security-reviewer / performance-reviewer 等の下流工程

### 2-3. Unit B / Unit C との境界（依存関係の明示）

- Unit B は本ユニットが公開する 4 UseCase + API（在庫一覧取得・使った・捨てた・買い物完了）に
  依存する。Unit B 着手前に本ユニットの API Contract が確定している必要がある。
- Unit C は本ユニットが確定する `Pantry` 集約の読み取り系メソッド（`findByProduct` /
  `calculateRequiredAmount` 相当）に依存する可能性がある。本ユニットでこれらを Pantry に含めない
  と判断した場合、Unit C 側で別途置き場所を設計する必要が生じる（§6-e）。

---

## 3. 機能要件

### 3-1. Pantry 集約（Domain）

`docs/04-domain-model.md` §Pantry 集約（L486-591）を要件のベースラインとする（**未実装の構想**。
シグネチャ・型は設計フェーズで確定）。

| 要素      | 内容                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------- |
| Pantry    | 集約ルート。`_stocks: Stock[]` を保持。`addStock` / `consumeStock` / `discardStock` / `findExpiringSoon`（Phase 2 保留候補） / `findByProduct`（§6-e） / `calculateRequiredAmount`（§6-e） |
| Stock     | 集約内エンティティ。`productId: ProductId`（ID 参照）、`amount: Quantity`、`purchasedAt: Date`、`expiresAt: Date \| null`、`storedLocation`（`'fridge' \| 'freezer' \| 'pantry'` 相当の文字列 union。既存 `ItemStatus` 等と同型のパターン） |
| StockId   | Stock の識別子。既存 ID VO（`ShoppingItemId` 等）と同じ `generate()` / `fromString()` / `equals()` / `value` パターンを踏襲想定 |

主要な振る舞い（要件レベル。厳密なシグネチャは設計フェーズで確定）:

- `addStock(input): StockId` — 買い物完了時に呼ばれる。新規 `Stock` を生成し追加
- `consumeStock(stockId, amount, reason): void` — 手動消費。対象 Stock を検索し量を減らす。
  未検出時はエラー。量がゼロになったら Stock をリストから削除
- `discardStock(stockId, reason): void` — 手動廃棄。対象 Stock を検索し全量削除。未検出時はエラー

### 3-2. PantryRepository（Domain）

草案は `pantryRepo.find()`（引数なし）という**単一世帯・単一 Pantry 前提のシングルトン集約**を
想定している（§5-4 で事実確認のとおり、既存 4 リポジトリに前例なし）。設計フェーズで以下を
確定する必要がある（§6-a）:

- `find(): Promise<Pantry | null>` として「初回は null、初回書き込みで作成」とするか
- 何らかの起動時シードで常に 1 件存在する前提にするか
- `PantryId` を明示的に固定値・シングルトンとして扱うか

### 3-3. UseCase 要求（4 本）

#### CompleteShoppingUseCase

`docs/04-domain-model.md` §L627-671 の擬似コードをベースラインとするが、**未実装の構想**であり
`getBoughtItemsForPantry()` を含め Pantry 集約の設計時に再設計する（S-8 申し送り）。

| 項目           | 内容                                                                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input          | `shoppingListId: string`                                                                                                                                                                             |
| 事前条件       | 対象 ShoppingList が存在すること。`status === 'active'`（`complete()` の既存ガードに一致）                                                                                                          |
| ドメイン操作   | (1) 買った品目（`status === 'bought'`）を Pantry に `addStock` → 保存。(2) 品目ごとに `productId` があれば `Product.recordPrice()` で価格履歴記録 → 保存。(3) `ShoppingList.complete()` → 保存。(4) `MealPlan.transitionTo('cooking')` → 保存 |
| 集約をまたぐ数 | 4 集約（ShoppingList / Pantry / Product / MealPlan）。既存 UseCase で最多（`GenerateShoppingListUseCase` は 3 集約）                                                                              |
| 正常系         | 買った品目分だけ Stock が Pantry に追加され、価格履歴が記録され、ShoppingList が completed、MealPlan が cooking になる                                                                              |
| 異常系         | ShoppingList が存在しない → `ShoppingListNotFoundError`（404 想定）。`status !== 'active'` →
`InvalidShoppingListStateError`（`complete()` の既存ガードに一致・422 想定）。MealPlan が存在しない（不整合ケース）の扱いは未確定 |
| 未確定         | 買った品目が 0 件（全て pending/skipped のまま完了）の扱い。Pantry 保存後に後続処理（価格記録・complete・MealPlan遷移）が失敗した場合の部分失敗の扱い（§6-c）。`actualPrice.amount === 0`（無料でもらった品）が `PriceRecord.create` の正数チェックと矛盾する点（§5-2 参照） |

#### ConsumeStockUseCase

| 項目         | 内容                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Input        | `stockId: string`、`amount: { value: number; unit: Unit }`、`reason: ConsumptionReason`            |
| 事前条件     | 対象 Pantry・対象 Stock が存在すること                                                             |
| ドメイン操作 | `pantryRepo.find()` → `pantry.consumeStock(stockId, Quantity, reason)` → `save()`                  |
| 正常系       | Stock の `amount` が減る。ゼロになれば Stock が削除される                                          |
| 異常系       | Pantry が存在しない → 扱い未確定（§3-2）。Stock が存在しない → `StockNotFoundError`（404 想定）    |
| 境界条件     | 消費量が現在の在庫量を上回る場合の扱い（`Quantity` に `subtract()` が存在しないため実装ギャップ。§5-5） |

#### DiscardStockUseCase

| 項目         | 内容                                                                          |
| ------------ | -------------------------------------------------------------------------------- |
| Input        | `stockId: string`、`reason: string`                                              |
| 事前条件     | 対象 Pantry・対象 Stock が存在すること                                           |
| ドメイン操作 | `pantryRepo.find()` → `pantry.discardStock(stockId, reason)` → `save()`          |
| 正常系       | 対象 Stock が全量削除される（残量に関わらず、部分廃棄はできない）                |
| 異常系       | Pantry が存在しない → 扱い未確定（§3-2）。Stock が存在しない → `StockNotFoundError`（404 想定） |

#### GetPantryUseCase

| 項目         | 内容                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Input        | なし（シングルトン。`GetShoppingListUseCase` と異なり ID を取らない設計になる見込み）                       |
| ドメイン操作 | `pantryRepo.find()` → `PantryDto` に変換                                                                   |
| 正常系       | Pantry の Stock 一覧を返す                                                                                 |
| 異常系/境界   | Pantry が未作成（`find()` が null）の場合の扱い（空の Pantry を返すか、404 か。§3-2 の確定次第）。Stock 0件（空配列）の扱い |

### 3-4. API 要求

対象 4 UseCase に対応する最小限のエンドポイント + **買い物完了 API の新規公開**。

- 在庫取得（`GetPantryUseCase` 相当）
- 「使った」（`ConsumeStockUseCase` 相当）
- 「捨てた」（`DiscardStockUseCase` 相当）
- **買い物完了**（`CompleteShoppingUseCase` 相当）。ルート配置は既存 `shopping-lists.ts`
  （例: `POST /api/shopping-lists/:id/complete`）か新設 `pantry.ts` かは設計判断

`ShoppingList.complete()` / `markAsSkipped()` は Sprint 4 時点で Domain 実装済み・API 非公開
（S-8 / S-9）。買い物完了 API を公開すると `complete()` が初めて外部から呼ばれる経路になるため、
既存の `assertActive` ガード（`status !== 'active'` で Error）が UseCase 層でどう
`InvalidShoppingListStateError` にマッピングされるかが `MarkAsBoughtUseCase` 等の既存パターン
（`docs/designs/shopping-list-core.md` L936-937 相当）に倣う想定。

Zod バリデーションは `packages/api-contract` に配置し、既存 `shopping-list.schema.ts` /
`meal-plan.schema.ts` のパターン（リクエスト用・レスポンス用スキーマ、`z.infer` での型導出）を
踏襲する。

---

## 4. 非機能・制約

### アーキテクチャ制約（変更不可・既存踏襲）

- 依存方向: `Presentation → Application → Domain ← Infrastructure`
- `packages/domain` は他パッケージに依存しない。Drizzle・HTTP の型を持ち込まない
- Entity 生成は `static create()`、DB 復元は `static reconstruct()`
- 集約をまたぐ参照は **ID 参照のみ**（`Stock.productId: ProductId`）
- 集約をまたぐ操作（`CompleteShoppingUseCase`）は Application 層の UseCase に置く
- UseCase は 1 クラス・`execute()` のみ。手動 DI（コンストラクタ注入）
- `any` 禁止・default export 禁止・`import type` 必須・`===`/`!==`・「値なし」は `null` に統一
- Entity を UseCase の境界外へ漏らさない（`PantryDto` / `StockDto` を使う想定。
  `ShoppingListDto` / `ShoppingItemDto` 先例に倣う）
- 公開 API（UseCase クラス・DTO・Repository インターフェース・集約の公開メソッド）には JSDoc を
  書く（2026-07-12 採用。shopping-list 以降の新規コードに適用 = 本ユニット全体が対象）

### ディレクトリ構成（`docs/03-architecture.md` に既定路線として記載済み）

```
packages/domain/src/pantry/
packages/application/src/pantry/
packages/infrastructure/src/repositories/drizzle-pantry.repository.ts
apps/web/src/server/routes/pantry.ts
```

---

## 5. 既存実装の調査結果（事実確認）

### 5-1. ShoppingList の `complete()` / `markAsSkipped()` / bought 判定（実装済み）

`packages/domain/src/shopping-list/shopping-list.ts` で確認。

- `complete(): void` は**実装済み**。`assertActive('complete')` で `status !== 'active'` なら
  `Error` を投げる。副作用は `status = 'completed'` のみ（bought item の抽出等は行わない）
- `markAsSkipped(itemId): void` は**実装済み**（`ShoppingItem.markAsSkipped()`）。`pending` から
  のみ許可、それ以外は `Error`
- **`getBoughtItemsForPantry()` は未実装**（`shopping-list.ts` 全文を確認したが該当メソッドは
  存在しない）。roadmap のスコープ注記（S-8 由来）どおり、Pantry 集約の設計時に再設計する
- `ShoppingItem` は `actualPrice: Money | null` / `actualStore: StoreId | null` を保持し、
  `status: ItemStatus`（`'pending' | 'bought' | 'skipped'`）で管理。`isBought(): boolean` という
  判定用ゲッターが既に存在する（`status === 'bought'` の薄いラッパー）。`markAsBought()` は
  `actualStoreId` を必須（`markAsBoughtSchema` で `z.uuid()` 必須）にしているため、
  **`bought` 状態の item は `actualPrice` / `actualStore` が必ず非 null** という不変条件が
  すでに成立している。したがって `CompleteShoppingUseCase` は
  `shoppingList.items.filter((item) => item.isBought())` で買った品目を直接取得でき、
  `getBoughtItemsForPantry()` という専用メソッドが実装上は必須ではない
  （Domain に集約ロジックとして置くか Application 層でフィルタするかは設計判断。§6-b）

### 5-2. Product の `recordPrice()` シグネチャと PriceRecord 構築要件（実装済みだが入力ギャップあり）

`packages/domain/src/product/product.ts` / `packages/application/src/product/record-price.use-case.ts`
で確認。

- `Product.recordPrice(record: PriceRecord): void` は**実装済み**（`priceHistory.push()` + `touch()`）
- `PriceRecord.create(props)` は `id` / `storeId` / `price: Money` / `unitPrice: Money` /
  `packageSize: Quantity` / `observedAt: Date` を要求し、`price.amount <= 0` または
  `unitPrice.amount <= 0` または `packageSize.value <= 0` で `Error`（**正の値のみ許容。
  ゼロは不可**）
- 既存の `RecordPriceUseCase` は `packageSizeValue` / `packageSizeUnit` を入力として受け取り、
  `UnitPriceCalculator.calculate(price, packageSize)` で `unitPrice` を導出している
- **ギャップ**: `ShoppingItem` は `actualPrice`（購入時の総額と解釈される。設計書サンプルの
  `actualPrice: 198円` 等）のみを持ち、`packageSize`（購入量）に相当する情報は
  `requiredAmount: Quantity | null`（`amountNote` のみのケースでは null）しかない。
  `PriceRecord` 構築には `unitPrice` の算出根拠となる量が要るため、`requiredAmount` を
  `packageSize` として転用できるか（`amountNote` のみの品目は価格記録をスキップするか）は
  設計判断が必要（§6 追加論点として提起）
- **ギャップ 2**: `actualPrice.amount = 0`（無料でもらった等。`markAsBoughtSchema` は
  `z.number().min(0)` で許容・`Money.of` も 0 以上を許容）と `PriceRecord.create` の
  `price.amount <= 0` で `Error` が矛盾する。無料品を `markAsBought` すること自体は既存 API で
  可能なため、`CompleteShoppingUseCase` 側でこのケースをスキップするかエラーにするかの判断が
  必要（設計判断・要ユーザー確認候補）

### 5-3. MealPlan の `transitionTo('cooking')`（実装済み・遷移可能）

`packages/domain/src/meal-plan/meal-plan.ts` の `TRANSITIONS` テーブルで確認。

```
shopping: ['draft', 'cooking']
```

`shopping → cooking` は**許可されている**。`transitionTo()` は許可外の遷移で `Error` を投げる。
roadmap のスコープ注記どおり実装済みであることを確認した。

### 5-4. 単一集約（シングルトン）パターンの前例（前例なし）

既存 4 つの Repository インターフェースを全て確認した。

| Repository            | メソッド                                                        |
| ---------------------- | ----------------------------------------------------------------- |
| `MealPlanRepository`  | `findById` / `findByWeek` / `findRecent(limit)` / `save`         |
| `ProductRepository`   | `findById` / `findAll` / `save` / `delete`                       |
| `StoreRepository`     | `findById` / `findAll` / `save`                                  |
| `ShoppingListRepository` | `findById` / `findByMealPlanId` / `save`                       |

**いずれも ID または検索条件を伴うクエリのみで、引数なしで単一のインスタンスを返す `find()` の
前例はない**。`docs/04-domain-model.md` の `pantryRepo.find()`（引数なし）＝単一世帯前提の
シングルトン集約という設計は、本プロジェクトで初めて導入するパターンになる。初回起動時に
Pantry レコードが存在しない場合の扱い（自動作成 / シード必須 / null 許容で呼び出し側がガード）を
設計フェーズで確定する必要がある（§6-a）。

### 5-5. 共有 VO（`Quantity` / `ProductId` / `Money` / StorageLocation 相当）の実装状況

- **`Quantity`**（`packages/domain/src/shared/quantity.ts`）: `of(value, unit)`（`value < 0` で
  `Error`）、`multiply(factor)`、**`add(other)` は実装済み**（Sprint 4 で新規実装され、単位不一致
  なら `Error`）。**`subtract()` は未実装**。`docs/04-domain-model.md` の `Stock.consume()`
  擬似コード（`this._amount = this._amount.subtract(amount)`）および Unit C の
  `calculateRequiredAmount()`（`neededAmount.subtract(availableTotal)`。負になったら 0 を返す
  仕様）はいずれも `subtract()` の存在を前提にしているが、現行コードには存在しない。
  **`ConsumeStockUseCase`（本ユニットのスコープ）が動作するには `Quantity.subtract()` の
  新規実装が前提になる**。負値時の挙動（`Quantity.of` は負値で `Error` を投げる既存仕様と
  整合させるなら、`subtract()` 自体をどう振る舞わせるか — 例外を投げる／0 にクランプする — の
  判断が必要。§6 追加論点として提起
- **`ProductId`**（`packages/domain/src/product/product-id.ts`）: 実装済み。`Stock.productId`
  の型としてそのまま使える
- **`Money`**（`packages/domain/src/shared/money.ts`）: 実装済み。`of` は非負のみ許容（0 可）
- **StorageLocation 相当**: VO クラスとしては存在しない。ただし既存の `ItemStatus` /
  `ItemSource`（shopping-list）・`MealPlanStatus`（meal-plan）は VO ではなく**プレーンな文字列
  union 型**として実装されているため、`StorageLocation`（`'fridge' | 'freezer' | 'pantry'`）も
  同様のプレーン union 型として実装するのが既存パターンと整合する（VO クラス化するかは設計判断
  だが、前例に基づけば union 型が自然）
- **ID VO の命名・生成パターン**: `PriceRecordId` / `ShoppingItemId` 等はいずれも
  `generate()` / `fromString()` / `equals()` / `value` の 4 点セット。`StockId` / `PantryId`
  もこのパターンを踏襲する想定

---

## 6. 設計判断として持ち越す論点（確定しない・提起のみ）

以下は architecture-designer が設計フェーズで確定する。ここでは選択肢を洗い出すのみ。

### (a) Pantry のシングルトン設計の是非

`pantryRepo.find()`（引数なし）という単一世帯前提の設計を採用するか。前例なし（§5-4）。
代替案として「`PantryId` を固定値（例: 定数 UUID）にして `findById` に統一し、既存パターンから
逸脱しない」という案もあり得る。初回未作成時の扱い（自動作成・シード・null 許容）も本論点に含む。

### (b) `getBoughtItemsForPantry()` の再設計形

S-8 の申し送りどおり本ユニットで確定する。選択肢:

- Domain に `ShoppingList.getBoughtItemsForPantry(): BoughtItemForPantry[]` を実装し、
  戻り値型を Pantry の `AddStockInput` に対応させる（`docs/04-domain-model.md` 原案）
- Domain には実装せず、Application 層（`CompleteShoppingUseCase`）で
  `shoppingList.items.filter((item) => item.isBought())` を直接使い、`AddStockInput` への変換も
  Application 層で行う（§5-1 の事実確認より技術的には可能）
- 「賞味期限」「保存場所」等 Stock 生成に必要だが ShoppingItem が持たない情報をどう補うか
  （ユーザー入力を求めるか、Product のデフォルト値を使うか、null 許容にするか）も本論点に含む

### (c) 買い物完了の冪等性・部分失敗の扱い

ADR-0006（`GenerateShoppingListUseCase` の生成冪等・部分失敗の自己修復）を先例として参照する。
`CompleteShoppingUseCase` は 4 集約（ShoppingList / Pantry / Product / MealPlan）を更新する
既存最多の操作であり、非トランザクション構成（現行踏襲）では部分失敗の窓がより大きい。論点:

- 保存順序をどうするか（ADR-0006 は「ShoppingList 生成 → MealPlan 遷移」の順で部分失敗を
  自己修復可能にした。本ユースケースは Pantry 保存・価格記録・ShoppingList.complete・MealPlan
  遷移の 4 段階があり、途中失敗時にどこまで再実行で収束できるか設計が要る）
- 同一 `shoppingListId` への 2 回目の呼び出し（すでに `completed` の場合）をエラーにするか
  （`complete()` の `assertActive` は素直に呼べば `Error` になる）、冪等に成功扱いにするか
- Pantry への Stock 二重追加を防ぐ仕組み（`complete()` 呼び出し前に Pantry へ追加済みかを
  判定する手段が現状ない）

### (d) 在庫テーブル設計（pantries / stocks 分離 or stocks 単一テーブル）

`docs/03-architecture.md` は `drizzle-pantry.repository.ts` 1 ファイルのみを示すが、テーブル数は
未確定。選択肢:

- `pantries`（1 行のみ想定） + `stocks`（`pantry_id` で紐付け）の 2 テーブル。
  `shopping_lists` + `shopping_items` の先例パターンに近い
- `stocks` テーブル単一（Pantry がシングルトンなら `pantry_id` 自体が不要という考え方もあり得る）

### (e) `calculateRequiredAmount` / `findByProduct` を本ユニットに含めるか

`docs/04-domain-model.md` の Pantry 草案にはこの 2 メソッドが含まれるが、実際に使うのは
Unit C（`GenerateShoppingListUseCase` への在庫引き算連携）。本ユニットで Pantry 集約の一部として
実装してしまうか（YAGNI に反する可能性）、Unit C 側で必要になった時点で追加するか（Pantry
集約への後方互換的な追加になるが、Unit A/C 間の設計整合コストが生じる）は論点として提起するに
とどめ、確定しない。`calculateRequiredAmount` の切り上げルール自体は
`docs/04-domain-model.md` 設計上の論点 3（L683-688）どおり Unit C の設計で確定する。

### 追加で見つかった論点（上記 5 点に付随）

- `Quantity.subtract()` の新規実装が本ユニット（`ConsumeStockUseCase`）に必須（§5-5）。
  負値時の挙動（例外 or クランプ）を確定する必要がある
- `actualPrice.amount = 0`（無料品）と `PriceRecord.create` の正数チェックの矛盾（§5-2）の扱い
- `ShoppingItem.requiredAmount` が null（`amountNote` のみ）の場合、`PriceRecord` の
  `packageSize` を何にするか（価格記録をスキップする案が有力だが確定しない）

---

## 7. 試験観点

UseCase 4 本 + Domain（Pantry/Stock）ごとに正常系・異常系・境界条件を整理する。具体的な
テストケース番号・網羅率は試験計画フェーズ（`docs/tests/`）で確定する。論点未確定のため
「要確認」を含む形で示す。

### 7-1. Pantry / Stock（Domain）

**正常系**

- `addStock` で新規 Stock が追加される
- `consumeStock` で対象 Stock の量が減る
- `consumeStock` で量がゼロになった Stock がリストから削除される
- `discardStock` で対象 Stock が全量削除される（残量に関わらず）

**異常系**

- 存在しない `stockId` への `consumeStock` / `discardStock` → `Error`（メッセージ・型は設計判断）

**境界条件**

- 消費量が現在の在庫量を上回る場合（`Quantity.subtract()` 未実装のため要設計。§6 追加論点）
- 同一 `productId` の Stock が複数存在する場合の扱い（FIFO 想定だが、`consumeStock` は
  `stockId` 単位の操作なので直接は影響しない。`findByProduct` の並び順検証は Unit C 側）

### 7-2. CompleteShoppingUseCase

**正常系**

- 買った品目（`status='bought'`）がすべて Pantry に Stock として追加される
- `productId` があり `actualPrice` がある品目は Product に価格履歴が記録される
- `productId` が null の品目は価格記録がスキップされる
- ShoppingList が `completed` になる
- MealPlan が `cooking` に遷移する

**異常系**

- 存在しない `shoppingListId` → `ShoppingListNotFoundError`
- `status !== 'active'` の ShoppingList への呼び出し → `InvalidShoppingListStateError`
- 既に `completed` の ShoppingList への 2 回目の呼び出し（冪等 or エラー。§6-c 要確認）

**境界条件**

- 買った品目が 0 件（全て pending/skipped）で完了した場合の Pantry 更新（何も追加されない）
- `actualPrice.amount = 0`（無料品）の価格記録の扱い（§5-2 ギャップ）
- `requiredAmount = null`（`amountNote` のみ）の bought 品目の価格記録の扱い
- Pantry 保存後、価格記録・complete・MealPlan 遷移のいずれかで失敗した場合の部分失敗（§6-c）

### 7-3. ConsumeStockUseCase

**正常系**

- `pending` 相当の在庫を指定量だけ消費する（`reason` ごとの正常系）

**異常系**

- 存在しない `stockId` → `StockNotFoundError`（404 想定）
- Pantry が未作成の場合（§3-2 の確定次第でエラー種別が変わる）

**境界条件**

- 消費量 = 在庫量（ちょうどゼロになる）
- 消費量 > 在庫量（§6 追加論点。エラーか自動クランプか）
- 消費量 = 0 の入力（`Quantity.of(0, unit)` は許容されるため技術的には通る。意味があるか要確認）

### 7-4. DiscardStockUseCase

**正常系**

- 対象 Stock が全量廃棄される

**異常系**

- 存在しない `stockId` → `StockNotFoundError`
- Pantry が未作成の場合（§3-2 の確定次第）

**境界条件**

- 部分廃棄はサポートしない仕様（全量削除のみ）でよいか要確認

### 7-5. GetPantryUseCase

**正常系**

- Stock 一覧を返す（複数件・0 件の両方）

**境界条件**

- Pantry 未作成時に空の Pantry を返すか 404 にするか（§3-2）

---

## 8. 影響範囲

### 8-1. 新規作成が見込まれるディレクトリ・ファイル（詳細は設計フェーズで確定）

```
packages/domain/src/pantry/
  pantry-id.ts
  stock-id.ts
  pantry.ts                # Pantry 集約 + Stock エンティティ + 型定義
  pantry.repository.ts
  + 各 .test.ts

packages/application/src/pantry/
  pantry.dto.ts
  pantry.mapper.ts
  stock-not-found.error.ts
  consume-stock.use-case.ts
  discard-stock.use-case.ts
  get-pantry.use-case.ts
  index.ts
  + テスト

packages/application/src/shopping-list/
  complete-shopping.use-case.ts   # 4集約またぎ。配置は shopping-list 側 or pantry 側かは設計判断

packages/infrastructure/src/
  db/schema.ts への追記（pantries/stocks 相当のテーブル。§6-d）
  repositories/drizzle-pantry.repository.ts
  + テスト

packages/api-contract/src/
  pantry.schema.ts
  shopping-list.schema.ts への追記（買い物完了リクエスト/レスポンス）

apps/web/src/server/routes/
  pantry.ts
  shopping-lists.ts への追記（買い物完了エンドポイント）
```

### 8-2. 既存ファイルへの追記が見込まれる箇所

| ファイル                                     | 変更内容                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| `packages/domain/src/shared/quantity.ts`      | `subtract()` の新規実装が必要（§5-5・§6 追加論点）                              |
| `packages/infrastructure/src/db/schema.ts`    | Pantry / Stock テーブル定義を追記                                              |
| `packages/infrastructure/src/index.ts`        | `DrizzlePantryRepository` の re-export 追加                                    |
| `packages/application/src/index.ts`           | `export * from './pantry'` を追加                                              |
| `packages/api-contract/src/index.ts`          | `export * from './pantry.schema'` を追加                                       |
| `apps/web/src/server/app.ts`                  | `pantryRoute` の `.route()` 登録、新規エラークラス（`StockNotFoundError` 等）の `onError` ハンドリング追加 |

### 8-3. 既存集約・既存コードへの影響

| 対象                                                                | 影響                                                                                                                                     |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| ShoppingList 集約（`packages/domain/src/shopping-list/shopping-list.ts`） | **コード変更が必要な可能性**（§6-b の確定次第。`getBoughtItemsForPantry()` を Domain に追加する場合のみ。Application 層で済ませる場合は変更不要） |
| `ShoppingListRepository`                                             | 変更不要（`findById` / `save` で足りる）                                                                                                     |
| MealPlan 集約                                                        | **コード変更は不要**（`transitionTo('cooking')` は実装済み）。`CompleteShoppingUseCase` から呼び出される（依存追加）                          |
| `MealPlanRepository`                                                 | 変更不要（`findById` / `save` で足りる）                                                                                                     |
| Product 集約（`packages/domain/src/product/product.ts`）              | 変更不要。`recordPrice()` は実装済み（ただし §5-2 の入力ギャップに注意）                                                                     |
| `ProductRepository`                                                  | 変更不要（`findById` / `save` で足りる）                                                                                                     |
| `Quantity` VO（`packages/domain/src/shared/quantity.ts`）             | `subtract()` の新規実装が必要（本ユニット `ConsumeStockUseCase` に必須。共有 VO のため既存利用箇所への影響確認は要る）                       |

---

## 9. 参照ファイル（主要なもの）

- `docs/05-roadmap.md`（L379-421 Sprint 5、特に L401-421 ユニット分割・スコープ注記）
- `docs/04-domain-model.md`（L486-591 Pantry/Stock 集約草案、L627-671 CompleteShoppingUseCase 擬似コード、L683-688 設計上の論点3、L694-696 論点5）
- `docs/03-architecture.md`（L44-135 付近のディレクトリ構成。pantry 関連パスの既定路線）
- `docs/requirements/shopping-list-core.md`（要件書の章立て・粒度の先例）
- `docs/designs/shopping-list-core.md`（S-8 の確定内容「complete() のみ実装・getBoughtItemsForPantry は保留」）
- `docs/decisions/ADR-0006-shopping-list-generate-idempotent.md`（生成冪等・部分失敗の自己修復の先例）
- `packages/domain/src/shopping-list/shopping-list.ts`（`complete()` / `markAsSkipped()` 実装済み、`getBoughtItemsForPantry()` 不在を確認、`isBought()` の存在を確認）
- `packages/domain/src/meal-plan/meal-plan.ts`（`TRANSITIONS` で `shopping → cooking` 許可を確認）
- `packages/domain/src/product/product.ts`（`recordPrice()` 実装済み、`PriceRecord.create` の正数チェックを確認）
- `packages/application/src/product/record-price.use-case.ts`（`packageSize` / `unitPrice` 導出パターン）
- `packages/domain/src/shared/quantity.ts`（`add()` 実装済み・`subtract()` 不在を確認）
- `packages/domain/src/meal-plan/meal-plan.repository.ts` / `packages/domain/src/product/product.repository.ts` / `packages/domain/src/shared/store.repository.ts` / `packages/domain/src/shopping-list/shopping-list.repository.ts`（単一集約 `find()` の前例なしを確認）
- `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.ts`（子テーブル upsert + 差分削除パターンの参照実装）
- `packages/api-contract/src/shopping-list.schema.ts` / `packages/api-contract/src/index.ts`
- `apps/web/src/server/routes/shopping-lists.ts` / `apps/web/src/server/app.ts`（ルート・onError パターン）
