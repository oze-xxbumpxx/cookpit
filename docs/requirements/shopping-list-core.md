# 要件定義: ShoppingList Core（Sprint 4 Unit A）

作成日: 2026-07-11
対象スプリント: Sprint 4 Unit A
変更レベル: L3（新規集約 + 新規 DB スキーマ + 新規 API。Domain / Application / Infrastructure /
API Contract / Presentation(API) の全層にまたがる新規実装）
classify-change: 実施済み・再判定不要

---

## 1. 概要 / スコープ

### 1-1. 背景・目的

`docs/01-overview.md` の実運用フロー「土曜日に2人で相談して献立を決め → 買い物リストを作る →
2店舗を回って買い物 → 帰宅後に作り置き」のうち、「買い物リストを作る」〜「買い物中に使う」の
バックエンド一式を実装する。`docs/05-roadmap.md` は Sprint 4 を「MVP1 のクライマックス」と位置づけ、
完了条件は「献立から買い物リストが自動生成される」「スーパーで実際に使って、ストレスなく操作できる」
「2人で同じリストを見て、お互いの操作が反映される（最低限 refetch でOK）」。

本要件書はそのうち **Unit A（ドメイン・DB・UseCase・API のバックエンド一式）** を対象とする。

### 1-2. 要求の要約

| 層                 | 実装対象                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain             | ShoppingList / ShoppingListId / ShoppingItem / ShoppingItemId 新規集約。ItemStatus（pending/bought/skipped）、ItemSource（from_meal_plan/manually_added）、ShoppingListStatus（active/completed） |
| Infrastructure     | Drizzle スキーマ（`shopping_lists` 系テーブル）+ マイグレーション + `DrizzleShoppingListRepository`                                                                                               |
| Application        | UseCase 4 本：`GenerateShoppingListUseCase`（献立から自動生成）/ `AddItemUseCase`（手動追加）/ `MarkAsBoughtUseCase` / `ReassignStoreUseCase`                                                     |
| API Contract       | Zod スキーマ（`packages/api-contract/src/shopping-list.schema.ts`）                                                                                                                               |
| Presentation (API) | Hono ルート（`apps/web/src/server/routes/shopping-lists.ts`）、`app.ts` へのマウント                                                                                                              |

### 1-3. 含む（このユニットで作るもの）

- `packages/domain/shopping-list/` 新規集約一式
- Drizzle スキーマ + `DrizzleShoppingListRepository`
- UseCase 4 本
- API（Hono ルート + `packages/api-contract` の Zod スキーマ）

### 1-4. 含まない（このユニットで作らないもの。対象外）

- **画面・UI 実装・PWA オフライン強化** → Unit B（`shopping-list-screens`、L2）
- **`CompleteShoppingUseCase` の実装・Pantry 連携の実装** → Sprint 5。
  ただし `docs/04-domain-model.md` の `ShoppingList.complete()` /
  `getBoughtItemsForPantry()` を Domain に実装するかどうか自体は本ユニットの設計判断に含まれる
  （MealPlan.transitionTo が Sprint 3 で「Domain には実装するが API 非公開」だった前例と同型の論点。
  セクション 8 参照）
- **認証・複数ユーザー対応** → Phase 2（ADR-0003 / ADR-0004 継続）
- Pantry 集約そのものの実装（Sprint 5。`packages/domain/pantry/` は本ユニットでは作らない）

---

## 2. 確定済みの前提・制約

### 前提 1: Pantry 集約は未実装（Sprint 5）

`docs/04-domain-model.md` の `GenerateShoppingListUseCase` 擬似コードは
`pantryRepo.find()` → `pantry.calculateRequiredAmount()` で在庫を引く手順を含むが、
`Pantry` 集約・`PantryRepository` は現時点でコード上に存在しない（`packages/domain/src/pantry/` なし）。
在庫引き算の「実装」は Sprint 5 スコープ（ユーザー確定）。取り扱いの選択肢はセクション 8-1 参照。

### 前提 2: Product 名寄せは MVP1 制約下（`aliases` 手動管理・Auto-suggest なし）

`docs/04-domain-model.md`「設計上の論点1」と `Product.aliases: string[]` の実装
（`packages/domain/src/product/product.ts`）に基づき、名寄せは手動登録された `aliases` に頼る。
入力時の自動サジェストは MVP1 スコープ外。詳細な名寄せ方法の選択肢はセクション 8-2 参照。

### 前提 3: 単位変換は MVP1 制約下（完全な変換は実装しない）

`docs/04-domain-model.md`「設計上の論点2」に基づき、「大さじ」「g」等の単位間の完全な変換は実装しない。
実装済みの共有 VO `Quantity`（`packages/domain/src/shared/quantity.ts`）は `of()` / `multiply()` のみを持ち、
**`add()` は未実装**（ドキュメントの擬似コードにのみ登場し、実コードには存在しないことを確認済み）。
複数レシピにまたがる同一材料の合算を行うなら `Quantity.add()` の新規実装が前提になる。
詳細はセクション 8-4 参照。

### 前提 4: WeekIdentifier は土曜始まり（ADR-0005）

`MealPlan.weekOf` は `WeekIdentifier`（週開始日=土曜、外部表現 `"YYYY-MM-DD"`）。
`ShoppingList.shoppingDate` を「週開始日（土曜）固定」にするか「実際に買い物した日」にするかは
本ユニットの設計判断に委ねる（セクション 8 の追加論点）。

### 前提 5: 認証・複数ユーザーなし（ADR-0003 / ADR-0004）

ShoppingList に `userId` 等は持たない。2人での共有は「同じデータを見る」（最低限 refetch）で足りる
（roadmap Sprint 4 完了条件どおり）。

### アーキテクチャ制約（変更不可・既存踏襲）

- 依存方向: `Presentation → Application → Domain ← Infrastructure`
- `packages/domain` は他パッケージに依存しない。Drizzle・HTTP の型を持ち込まない
- Entity 生成は `static create()`、DB 復元は `static reconstruct()`
- 集約をまたぐ参照は **ID 参照のみ**（`ShoppingItem.productId: ProductId | null`、
  `ShoppingList.mealPlanId: MealPlanId`）
- UseCase は 1 クラス・`execute()` のみ。手動 DI（コンストラクタ注入）
- `any` 禁止・default export 禁止・`import type` 必須・「値なし」は `null` に統一
- Entity を UseCase の境界外へ漏らさない（`ShoppingListDto` / `ShoppingItemDto` を使う。
  `MealPlanDto` / `ProductDto` 先例に倣う）

---

## 3. 機能要件

### 3-1. ShoppingList 集約（Domain）

集約ルート: `ShoppingList`。ファイル配置想定: `packages/domain/src/shopping-list/`
（`docs/03-architecture.md` のディレクトリ構成に既に記載あり）。

`docs/04-domain-model.md` §ShoppingList 集約（413-497 行）に示された構造を要件のベースラインとする。

| フィールド   | 型                 | 説明                                                                                           |
| ------------ | ------------------ | ---------------------------------------------------------------------------------------------- |
| id           | ShoppingListId     | 一意識別子                                                                                     |
| mealPlanId   | MealPlanId         | どの MealPlan から生成されたか（ID 参照のみ）。手動作成（MealPlan 抜き）は Sprint 4 スコープ外 |
| items        | ShoppingItem[]     | 集約内エンティティのリスト                                                                     |
| shoppingDate | Date               | 買い物対象日（意味論は前提4参照・要確定）                                                      |
| status       | ShoppingListStatus | `'active' \| 'completed'`                                                                      |

主要な振る舞い（要件レベル。厳密なシグネチャは設計フェーズで確定）:

- `static create(input): ShoppingList` — `mealPlanId` / 初期 `items` / `shoppingDate` を受けて `status='active'` で生成
- `static reconstruct(props): ShoppingList` — DB 復元
- `addItem(item: ShoppingItem): void` — 手動追加・自動生成どちらの経路でも使用
- `markAsBought(itemId, actualPrice: Money, actualStore: StoreId): void` — 対象 item を検索し `bought` に遷移。未検出時はエラー
- `reassignStore(itemId, newStoreId: StoreId): void` — `targetStore` を更新

`ShoppingItem`（集約内エンティティ）:

| フィールド     | 型                | 説明                                                                                                |
| -------------- | ----------------- | --------------------------------------------------------------------------------------------------- |
| id             | ShoppingItemId    | 一意識別子                                                                                          |
| productId      | ProductId \| null | Product への ID 参照。**null 許容**（名寄せ未確定・手動追加時）                                     |
| displayName    | string            | 表示名（レシピ由来 or 手動入力）                                                                    |
| requiredAmount | Quantity          | 必要量。**RecipeIngredient.amount が null（amountNote のみ）の場合の扱いは未確定**（セクション8-4） |
| targetStore    | StoreId \| null   | 最安店舗の推奨。**null 許容**（価格データなし等）                                                   |
| status         | ItemStatus        | `'pending' \| 'bought' \| 'skipped'`                                                                |
| actualPrice    | Money \| null     | 実際に支払った金額（bought 時に設定）                                                               |
| actualStore    | StoreId \| null   | 実際に買った店舗（bought 時に設定）                                                                 |
| source         | ItemSource        | `'from_meal_plan' \| 'manually_added'`                                                              |

**未定義の振る舞いギャップ（設計フェーズで要確定）**:

- `ItemStatus` に `'skipped'` があるが、対象 4 UseCase のいずれにも「skip する」操作が存在しない
  （`docs/04-domain-model.md` 擬似コードにも `skipItem` 相当のメソッドはない）。Sprint 4 で
  到達しない状態として残すか、`AddItemUseCase`/別 UseCase で対応するか未確定
- `ShoppingList.addItem` / `reassignStore` に、`MealPlan.addRecipe` のような
  ステータスガード（`status !== 'active'` なら拒否）が擬似コードにない。`complete()` 後の
  UseCase 呼び出しをどう扱うか未確定（Sprint 4 では `complete()` を呼ぶ手段がないため実害は薄いが、
  Domain の不変条件としてガードすべきか設計判断が必要）

### 3-2. ShoppingListRepository（Domain）

UseCase 4 本が必要とする最小限のメソッド（`MealPlanRepository` の先例に倣う想定）:

```
findById(id: ShoppingListId): Promise<ShoppingList | null>
findByMealPlanId(mealPlanId: MealPlanId): Promise<ShoppingList | null>  // 冪等性判定に必要（セクション8-5）
save(shoppingList: ShoppingList): Promise<void>
```

`findByMealPlanId` は必須ではなく候補。`GenerateShoppingListUseCase` の再実行時の挙動（セクション 8-5）
の設計判断次第で要否が変わる。

### 3-3. UseCase 要求（4 本）

#### GenerateShoppingListUseCase

| 項目         | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input        | `mealPlanId: string`                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Output       | `ShoppingListDto`（items 込み）                                                                                                                                                                                                                                                                                                                                                                                                       |
| 事前条件     | 対象 MealPlan が存在すること。MealPlan.status が `draft` であること（セクション 8-5 の判断次第で条件が変わる）                                                                                                                                                                                                                                                                                                                        |
| ドメイン操作 | `MealPlanRepository.findById()` → 含まれる Recipe を取得（**`RecipeRepository.findByIds` は現状のインターフェースに存在しない**。`findById` のループ呼び出しにするか、`findByIds` を新設するかは設計判断。セクション 6 参照）→ `Recipe.scaleIngredients(scaleFactor)` で倍量計算 → 材料の集計（論点4）→ Product 名寄せ（論点2）→ 最安店舗決定（論点3）→ `ShoppingList.create()` → `save()` → MealPlan の `shopping` への遷移（論点5） |
| 正常系       | 新規 ShoppingList が `status='active'` で作成され、`items` に自動生成された ShoppingItem が入る                                                                                                                                                                                                                                                                                                                                       |
| 異常系       | MealPlan が存在しない → `MealPlanNotFoundError`（404 想定）。MealPlan.status が `draft` 以外 → エラー（エラー種別は設計判断）。plannedRecipes が 0 件 → 空の items でリスト自体は作成される想定（要確認）                                                                                                                                                                                                                             |

#### AddItemUseCase

| 項目           | 内容                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input          | `shoppingListId: string`、`displayName: string`、`requiredAmount: { value: number; unit: Unit }`、`productId?: string \| null`、`targetStore?: string \| null` |
| Output         | `ShoppingItemDto`（追加された item）                                                                                                                           |
| 事前条件       | 対象 ShoppingList が存在すること                                                                                                                               |
| バリデーション | `displayName` 非空、`requiredAmount.value` が Quantity の制約（0以上）を満たす。UUID 形式は Hono 層で Zod                                                      |
| ドメイン操作   | `ShoppingListRepository.findById()` → `ShoppingItem` を `source='manually_added'`・`status='pending'` で生成 → `shoppingList.addItem()` → `save()`             |
| 正常系         | ShoppingItem が追加され `ShoppingItemDto` を返す                                                                                                               |
| 異常系         | ShoppingList が存在しない → `ShoppingListNotFoundError`（404）                                                                                                 |

#### MarkAsBoughtUseCase

| 項目                                                                                                           | 内容                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Input                                                                                                          | `shoppingListId: string`、`itemId: string`、`actualPrice: { amount: number; currency: string }`、`actualStore: string` |
| Output                                                                                                         | 更新後の `ShoppingItemDto`（または `void`。設計判断）                                                                  |
| 事前条件                                                                                                       | 対象 ShoppingList・対象 ShoppingItem が存在すること                                                                    |
| ドメイン操作                                                                                                   | `findById()` → `shoppingList.markAsBought(itemId, Money.of(...), StoreId.fromString(...))` → `save()`                  |
| 正常系                                                                                                         | item の `status` が `bought` になり `actualPrice` / `actualStore` が記録される                                         |
| 異常系                                                                                                         | ShoppingList が存在しない → `ShoppingListNotFoundError`（404）。ShoppingItem が存在しない →                            |
| `ShoppingItemNotFoundError`（404）。`actualPrice.amount < 0` → バリデーションエラー（`Money.of` は負数を拒否） |
| 未確定                                                                                                         | 既に `bought` の item を再度 `markAsBought` した場合（上書き許容か冪等か）。`skipped` item への適用可否                |

#### ReassignStoreUseCase

| 項目         | 内容                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------- |
| Input        | `shoppingListId: string`、`itemId: string`、`newStoreId: string`                               |
| Output       | 更新後の `ShoppingItemDto`（または `void`）                                                    |
| 事前条件     | 対象 ShoppingList・対象 ShoppingItem が存在すること                                            |
| ドメイン操作 | `findById()` → `shoppingList.reassignStore(itemId, StoreId.fromString(newStoreId))` → `save()` |
| 正常系       | item の `targetStore` が更新される                                                             |
| 異常系       | ShoppingList が存在しない → `ShoppingListNotFoundError`（404）。ShoppingItem が存在しない →    |

`ShoppingItemNotFoundError`（404）。存在しない `storeId` を指定した場合の挙動未定義（`Store` の
実在チェックをするかは MealPlan の RecipeId 非チェック方針（C-4 案A）に倣うかが論点） |
| 未確定 | `bought` 済み item に対する `reassignStore` の可否（`actualStore` は変えず `targetStore` のみ変更、という理解でよいか） |

### 3-4. API 要求

対象 4 UseCase に対応する最小限のエンドポイントが必要（具体的なパス・HTTP メソッド・ステータスコードは
設計フェーズで確定。`apps/web/src/server/routes/meal-plans.ts` のパターンを踏襲する想定）。

想定される操作:

- 献立からの自動生成（`GenerateShoppingListUseCase` 相当）
- 手動追加（`AddItemUseCase` 相当）
- 購入済みマーク（`MarkAsBoughtUseCase` 相当）
- 店舗再割当（`ReassignStoreUseCase` 相当）

**ギャップ**: 上記 4 操作はすべて書き込み系であり、生成した ShoppingList を**読み取る**UseCase
（`GetShoppingListUseCase` 相当）が対象 4 本に含まれていない。`GenerateShoppingListUseCase` の
戻り値（`ShoppingListDto`）で初回表示は賄えるが、Unit B（画面）がページ再訪問時・他端末からの
参照時に ShoppingList を取得する手段がない。Unit A の対象外と明記されているため本要件書では
確定しないが、後段の設計判断リストに挙げる（セクション 8-7）。

Zod バリデーションは `packages/api-contract` に配置し、既存 `meal-plan.schema.ts` のパターン
（リクエスト用スキーマ・レスポンス用スキーマ・`z.infer` での型導出）を踏襲する。

---

## 4. 5 つの必須論点の整理

ここでは選択肢を洗い出すのみとし、結論は確定しない（後段の architecture-designer が判断）。

### 論点 1: Pantry 依存

**問題**: `docs/04-domain-model.md` の `GenerateShoppingListUseCase` 擬似コードは
`pantryRepo.find()` → `pantry.calculateRequiredAmount()` で在庫を引く手順を含むが、`Pantry` 集約は
コード上に存在しない（Sprint 5 実装予定）。

| 案  | 内容                                                                                                                                                                                                      | 長所                                                                | 短所                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A   | Sprint 4 では在庫引き算を一切行わない。`GenerateShoppingListUseCase` のコンストラクタに `PantryRepository` を含めない。必要量 = レシピからの集計値そのまま                                                | UseCase 構成がシンプル。Sprint 5 で本格導入する際に改めて設計できる | Sprint 5 で `GenerateShoppingListUseCase` のコンストラクタシグネチャ変更が必要（既存呼び出し箇所＝Hono ルートの改修を伴う） |
| B   | `PantryRepository` インターフェースだけ Domain に先行定義し、Sprint 4 では「常に空の Pantry」を返す実装（インメモリ null オブジェクト等）を DI する。UseCase 内部の在庫引き算ロジックの型は先に確定させる | Sprint 5 での差し替えが Repository 実装の追加のみで済む             | Sprint 4 時点で使われない抽象を先行導入することになり、YAGNI に反する可能性。テストの二重管理コスト                         |
| C   | 在庫引き算ロジック自体（`subtractStock` 相当）を UseCase 内に実装しておき、Pantry 未実装の間は「在庫は常に0」とみなして事実上 A と同じ挙動にする                                                          | 将来の拡張ポイントが明示される                                      | Pantry なしで「在庫引き算ロジック」を書く意味が薄く、テストしづらい                                                         |

**制約**: ユーザーの明確なスコープ確定により「Pantry 連携の実装は Sprint 5」（本文冒頭）。
そのため A・B のいずれを選んでも Sprint 4 で実際に在庫を引く処理は動かない。差は
「Sprint 5 への移行コストを今どれだけ払うか」のみ。

### 論点 2: Product 名寄せ

**問題**: レシピ材料は自由記述の `displayName` を持ち、`RecipeIngredient.productRef: ProductId | null`
（Recipe 作成時に手動で紐付けられていれば非 null）。`ShoppingItem.productId` は null 許容だが、
どう Product を確定させるかが未定義。

| 案  | 内容                                                                                                                                                                                  | 長所                                                                                | 短所                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A   | `RecipeIngredient.productRef` をそのまま `ShoppingItem.productId` に引き継ぐのみ。ランタイムでの文字列マッチングは行わない                                                            | 実装が最小。既存の `productRef` 概念をそのまま使う                                  | レシピ作成時に Product 紐付けをしていないと、買い物リスト側で永遠に `productId=null` のまま（名寄せの実利用価値が薄い） |
| B   | Generate 時に全 Product を取得し、`displayName` を `Product.name` / `Product.aliases` と突き合わせて（大文字小文字・空白正規化程度の緩いマッチング）一致すれば `productId` を補完する | 既存 `aliases` 手動管理の仕組みを活用でき、レシピ側で紐付けを忘れていても救済できる | マッチングロジックが新規実装になる。複数一致・曖昧一致の扱いを決める必要がある（例："鶏むね肉"と"鶏もも肉"の誤マッチ）  |
| C   | A と B のハイブリッド（`productRef` があればそれを優先、なければ B のマッチングを試みる）                                                                                             | 両案の長所を両取り                                                                  | 実装・テストコストが最も高い                                                                                            |

**制約**: `docs/04-domain-model.md`「設計上の論点1」が既に MVP1 では `aliases` 手動管理・
Auto-suggest は課題として残す、と明記している。B/C を選ぶ場合もランタイムでの「賢い」名寄せ
（表記ゆれの自動吸収等）までは求められていない。

### 論点 3: 最安店舗の決定

**問題**: `Product.cheapestStoreAt(date): StoreId | null` は実装済み（価格記録がなければ `null`）。
`productId` が null（名寄せ未確定）または該当 Product に価格履歴がない場合、`ShoppingItem.targetStore`
をどう決めるか。

| 案  | 内容                                                                                                   | 長所                                                                                                                           | 短所                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| A   | `targetStore = null`（未定のまま）。UI（Unit B）側で「店舗未定」等の表示にする                         | `Product.cheapestStoreAt` の既存 null 安全な挙動と一貫。`GetCheapestStoreUseCase` の前例（価格データなしは null 扱い）にも合致 | 価格データが乏しい間、多くの item が「店舗未定」になる可能性                         |
| B   | 価格データがない場合、`StoreRepository.findAll()` の先頭など何らかのデフォルト店舗にフォールバックする | UI 側で必ず何らかの店舗にグルーピングできる                                                                                    | 実際の最安店舗ではない情報を提示してしまう。ユーザーに誤解を与えるリスク             |
| C   | 過去の ShoppingList で同一 Product に設定された `targetStore`/`actualStore` の履歴から推定する         | より実用的な推定ができる                                                                                                       | Sprint 4 の実装コストが大きく、ShoppingList 横断のクエリが必要になる。過剰実装の懸念 |

**推奨（叩き台）**: A。既存の `Product.cheapestStoreAt` / `GetCheapestStoreUseCase` の null 安全な
設計方針と一貫させるのが最小変更。ただし最終判断は architecture-designer 及びユーザー確認に委ねる。

### 論点 4: 数量の集計と端数

**問題**: 複数レシピが同一材料（同一 `displayName` または同一 `productId`）を含む場合、
1 つの ShoppingItem に合算するか、レシピ由来のまま複数行にするか。加えて単位不一致
（「大さじ2」と「100g」等）、および `RecipeIngredient.amount` が **null**（`amountNote` のみ。
例:「適量」「少々」）のケースの扱いが未定義。実コードの `Quantity`
（`packages/domain/src/shared/quantity.ts`）には `add()` メソッドが存在しない（`multiply()` のみ）。

| 案  | 内容                                                                                                                                                                                             | 長所                                                                                                       | 短所                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | 集計しない。各 `PlannedRecipe` の材料をそのまま個別の ShoppingItem として並べる（同一材料が複数行になり得る）                                                                                    | `Quantity.add()` の新規実装が不要。実装が最小                                                              | 「玉ねぎ」が3行に分かれる等、買い物中の UX が悪化する可能性（ただし Unit B のグルーピング表示で緩和できる余地あり）                                                                      |
| B   | `(productId ?? displayName, unit)` の組でグルーピングし、単位が完全一致するもの同士のみ `Quantity.add()`（新規実装が前提）で合算する。単位不一致・`amount=null` のものは合算せず個別行のまま残す | `docs/04-domain-model.md`「設計上の論点2」（完全な単位変換はしない）と整合。実用上の合算メリットも得られる | `Quantity` VO（Recipe・Product 等複数集約で共有）への `add()` 追加が必要。既存呼び出し箇所への影響調査が要る（追加のみなので後方互換ではあるが、共有 VO への変更は影響範囲の精査が要る） |
| C   | Product ごとの `defaultUnit` に完全変換してから合算する                                                                                                                                          | 最も UX が良い                                                                                             | 完全な単位変換の実装が必要で、`docs/04-domain-model.md` が明記する MVP1 制約（実装しない）を超える。論点2（名寄せ）が先に解決していないと `defaultUnit` を参照できない（依存関係）       |

**端数処理**: `docs/04-domain-model.md`「設計上の論点3」の「切り上げ」は本来 Pantry 在庫引き算の
文脈（論点1）で語られているものであり、本論点（レシピ間集計）の端数とは別問題。合算後の値を
そのまま保持するか、Product の販売単位（例: 1袋=300g）に切り上げるかは、Product 側に
「販売単位」の概念が現状ないため Sprint 4 では扱えない可能性が高い。

**`amount=null`（amountNote のみ）ケースの扱い**（論点4に付随する未決事項）:

- 案 α: そのまま `requiredAmount` を `Quantity.of(0, 何らかの単位)` 等のプレースホルダにし、
  表示は `amountNote` の文字列に頼る（`ShoppingItem` に `amountNote: string | null` 相当の
  フィールド追加が必要になる可能性）
- 案 β: `ShoppingItem.requiredAmount` 自体を `Quantity | null` に変更する（`docs/04-domain-model.md`
  の擬似コードは非 null 前提だが、`RecipeIngredient.amount` の実際の型と矛盾する）
- 案 γ: `amount=null` の材料は自動生成の対象外とする（買い物リストに載らない。ユーザーが
  手動追加で補う）

### 論点 5: MealPlan の draft→shopping 遷移

**問題**: `MealPlan.transitionTo()` は実装済み（`draft→shopping` 許可）。
`docs/04-domain-model.md` の擬似コード（606-712 行、ステップ7）は
`GenerateShoppingListUseCase` 内で `mealPlan.transitionTo('shopping'); mealPlanRepo.save(mealPlan)`
を呼ぶ想定。かつ `docs/designs/meal-plan-core.md` / roadmap には「shopping への遷移は Sprint 4 の
ShoppingList 生成と連動して初めて UI に出す」と既に記述されている（Sprint 3 時点での前方参照）。

| 案  | 内容                                                                                                                                                            | 長所                                                                                                                                        | 短所                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `GenerateShoppingListUseCase` が MealPlan の取得・保存を担い、生成成功時に自動で `draft→shopping` へ遷移させる（擬似コードどおり）                              | 既存ドキュメント（meal-plan-core 設計書・roadmap）の前方参照と整合。「1 MealPlan : 1 有効な ShoppingList」の不変条件を UseCase が保証できる | `GenerateShoppingListUseCase` の事前条件が「MealPlan.status === 'draft'」に固定される。再生成（同一 MealPlan に対する2回目の呼び出し）が `InvalidMealPlanStateError` 相当になり得る（論点8-5 参照） |
| B   | 遷移させない。ShoppingList 生成と MealPlan のステータス変更を独立した操作として扱う（ステータス変更用の別 UseCase が必要になるが、それは対象 4 本に含まれない） | UseCase の責務が単純になる（単一集約のみ操作）                                                                                              | 前述のドキュメント記述と矛盾する。Sprint 4 完了後も MealPlan が `draft` のままになり、「今週は買い物中」であることが MealPlan からは判別できない                                                    |
| C   | 遷移は行うが、失敗しても ShoppingList の生成自体はロールバックしない（部分失敗の許容）                                                                          | 実装がシンプル                                                                                                                              | データ不整合が起きうる（ShoppingList はあるが MealPlan は draft のまま）                                                                                                                            |

**推奨（叩き台）**: A。既存ドキュメントの前方参照と直接整合するため。ただし A を採用する場合、
「事前条件: MealPlan.status === draft」が確定し、論点8-5（冪等性）の議論と直結する。

---

## 5. 前提・制約（まとめ）

- Pantry 集約・PantryRepository は未実装（Sprint 5）。在庫引き算の「実装」は Sprint 4 対象外（論点1）
- Product 名寄せは `aliases` 手動管理が前提。ランタイムでの高度な名寄せ（表記ゆれ自動吸収等）は
  MVP1 スコープ外（論点2）
- 単位変換の完全実装は MVP1 スコープ外。合算するとしても同一単位同士に限る（論点4）
- `Quantity` VO（共有）に `add()` が存在しない。合算方針（論点4 案B/C）を採る場合は新規実装が前提
- `RecipeRepository` / `ProductRepository` に `findByIds` が存在しない（`findById` / `findAll` のみ）。
  `docs/04-domain-model.md` の擬似コードは `findByIds` を前提にしており、実装ギャップがある
  （セクション 6 参照）
- ADR-0005（WeekIdentifier 土曜始まり）: `ShoppingList.shoppingDate` の意味論確定が必要
- ADR-0003 / ADR-0004（認証・User なし）: ShoppingList に `userId` を持たせない
- `docs/03-architecture.md` のディレクトリ構成に `packages/domain/shopping-list/` /
  `packages/application/shopping-list/` / `packages/infrastructure` の
  `drizzle-shopping-list.repository.ts` / `apps/web/server/routes/shopping-lists.ts` が
  既に記載されており、命名の大枠は既定路線

---

## 6. 影響範囲

### 6-1. 新規作成が見込まれるディレクトリ・ファイル（詳細は設計フェーズで確定）

```
packages/domain/src/shopping-list/
  shopping-list-id.ts
  shopping-item-id.ts
  shopping-list.ts          # ShoppingList 集約 + ShoppingItem エンティティ + 型定義
  shopping-list.repository.ts
  + 各 .test.ts

packages/application/src/shopping-list/
  shopping-list.dto.ts
  shopping-list.mapper.ts
  shopping-list-not-found.error.ts
  shopping-item-not-found.error.ts
  generate-shopping-list.use-case.ts
  add-item.use-case.ts
  mark-as-bought.use-case.ts
  reassign-store.use-case.ts
  index.ts
  + テスト

packages/infrastructure/src/
  db/schema.ts への追記（shopping_lists / shopping_items 相当のテーブル）
  repositories/drizzle-shopping-list.repository.ts
  + テスト

packages/api-contract/src/
  shopping-list.schema.ts

apps/web/src/server/routes/
  shopping-lists.ts
```

### 6-2. 既存ファイルへの追記が見込まれる箇所

| ファイル                                   | 変更内容                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `packages/infrastructure/src/db/schema.ts` | ShoppingList / ShoppingItem テーブル定義を追記                                         |
| `packages/infrastructure/src/index.ts`     | `DrizzleShoppingListRepository` の re-export 追加                                      |
| `packages/application/src/index.ts`        | `export * from './shopping-list'` を追加                                               |
| `packages/api-contract/src/index.ts`       | `export * from './shopping-list.schema'` を追加                                        |
| `apps/web/src/server/app.ts`               | `shoppingListsRoute` の `.route()` 登録、新規エラークラスの `onError` ハンドリング追加 |

### 6-3. 既存集約・既存コードへの影響

| 対象                                                                            | 影響                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MealPlan 集約（`packages/domain/src/meal-plan/meal-plan.ts`）                   | **コード変更は不要**（`transitionTo('shopping')` は既に実装済み）。`GenerateShoppingListUseCase` から呼び出される想定（論点5）。呼び出す場合は `MealPlanRepository` への依存が `GenerateShoppingListUseCase` に追加される                                                                                                                                                                                                                    |
| `MealPlanRepository`（`packages/domain/src/meal-plan/meal-plan.repository.ts`） | 変更不要。`findById` / `save` で足りる                                                                                                                                                                                                                                                                                                                                                                                                       |
| `RecipeRepository`（`packages/domain/src/recipe/recipe.repository.ts`）         | **変更の可能性あり**。現状 `findById` のみで `findByIds` がない。`docs/04-domain-model.md` の擬似コードどおり `findByIds` を新設するなら、`DrizzleRecipeRepository`（`packages/infrastructure/src/repositories/drizzle-recipe.repository.ts`）にも実装追加が要る。追加せず `findById` をループ呼び出しする場合はコード変更なし（MealPlan の `findRecent` が採用した「MVP1 規模なら JOIN+グルーピングで十分」という前例のロジックに近い判断） |
| `ProductRepository`（`packages/domain/src/product/product.repository.ts`）      | 同上。`findByIds` の要否が論点2・論点3の実装方針に依存する                                                                                                                                                                                                                                                                                                                                                                                   |
| `Quantity` VO（`packages/domain/src/shared/quantity.ts`）                       | 論点4で案B/Cを採る場合、`add()` の新規実装が必要。`Recipe` / `Product` 等の既存利用箇所は `of()`/`multiply()` のみ使用のため後方互換的な追加だが、共有 VO への変更のため影響範囲の確認は要る                                                                                                                                                                                                                                                 |
| `StoreRepository`（`packages/domain/src/shared/store.repository.ts`）           | 変更不要（`findById` / `findAll` で足りる）                                                                                                                                                                                                                                                                                                                                                                                                  |
| Product 集約（`cheapestStoreAt` 等）                                            | 変更不要。`GenerateShoppingListUseCase` から読み取り専用で利用                                                                                                                                                                                                                                                                                                                                                                               |

---

## 7. 試験観点

UseCase 4 本ごとに正常系・異常系・境界条件を整理する。具体的なテストケース番号・網羅率は
試験計画フェーズ（`docs/tests/`）で確定する。ここでは論点未確定のため「要確認」を含む形で示す。

### 7-1. GenerateShoppingListUseCase

**正常系**

- 有効な `mealPlanId`（status=draft、plannedRecipes 1件以上）から ShoppingList が生成される
- `scaleFactor`（小数含む）が正しく反映された数量で ShoppingItem が生成される
- `productRef` ありの ingredient は `productId` が引き継がれる（論点2 案A採用時）
- `productRef` なしの ingredient は `productId=null` で生成される
- Product に価格履歴があれば `targetStore` が最安店舗になる
- Product 未登録・価格履歴なしの場合 `targetStore=null`（論点3）
- plannedRecipes が 0 件の MealPlan から生成 → items が空配列の ShoppingList が作成される（要確認：空リスト作成を許容するか）
- 生成成功後、MealPlan.status が `shopping` に遷移する（論点5 案A採用時）

**異常系**

- 存在しない `mealPlanId` → `MealPlanNotFoundError`
- MealPlan.status が `draft` 以外（shopping/cooking/consuming/completed） → エラー（論点5の確定待ち）
- plannedRecipes が参照する RecipeId が削除済み Recipe を指す場合（MealPlan の C-4 相当ケース）の扱い（要確認：スキップするか・エラーにするか）
- 同一 `mealPlanId` に対する2回目の呼び出し（要確認：冪等・エラー・再生成のいずれか。セクション8-5）

**境界条件**

- 複数レシピが同一材料（同一 `displayName`/`productId`）を含む場合の集計結果（論点4の確定案次第で挙動が変わる）
- 同一材料だが単位が異なる場合（例: 大さじ2 と 100g）の扱い
- `amount=null`（`amountNote` のみ。例: 「適量」）の ingredient の扱い（論点4付随の未決事項）
- `scaleFactor` が小数（例 1.5）のときの数量計算精度

### 7-2. AddItemUseCase

**正常系**

- 手動追加で `source='manually_added'`・`status='pending'` の ShoppingItem が作成される
- `productId` を指定した手動追加
- `productId` 未指定（null）の手動追加
- `targetStore` を指定した手動追加

**異常系**

- 存在しない `shoppingListId` → `ShoppingListNotFoundError`
- `displayName` が空文字 → バリデーションエラー
- `requiredAmount.value` が負数 → バリデーションエラー（`Quantity.of` は負数を拒否）

**境界条件**

- `requiredAmount.value = 0` の扱い（`Quantity.of` は0以上を許容するため技術的には通る。意味があるか要確認）
- `status='completed'` の ShoppingList への追加可否（3-1 節の未定義ギャップ）

### 7-3. MarkAsBoughtUseCase

**正常系**

- `pending` の item を `bought` にし、`actualPrice` / `actualStore` が記録される
- `targetStore` と異なる店舗で `actualStore` を記録するケース（提案と異なる店で買った）

**異常系**

- 存在しない `shoppingListId` → `ShoppingListNotFoundError`
- 存在しない `itemId` → `ShoppingItemNotFoundError`
- `actualPrice.amount` が負数 → バリデーションエラー（`Money.of` は負数を拒否）

**境界条件**

- `actualPrice.amount = 0`（無料でもらった等）→ `Money.of` は0以上許容のため正常系として通る想定
- 既に `bought` の item に再度 `markAsBought` した場合（上書き許容か・エラーか。要確認）
- `skipped` の item に `markAsBought` を適用した場合（要確認）

### 7-4. ReassignStoreUseCase

**正常系**

- `targetStore` を別店舗IDに変更する

**異常系**

- 存在しない `shoppingListId` → `ShoppingListNotFoundError`
- 存在しない `itemId` → `ShoppingItemNotFoundError`
- 存在しない `storeId` を指定した場合の挙動（Store 実在チェックの有無。要確認）

**境界条件**

- `bought` 済み item に対する `reassignStore` の可否・`actualStore` への影響有無（要確認）

---

## 8. 未確定でユーザー確認が必要そうな論点の列挙

後段の設計判断リスト（S-x 相当）の種になるものを一覧化する。

| #    | 論点                                                                                                                                                                                                                                                      | 関連セクション |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 8-1  | Pantry 依存の扱い（案A: 依存なし / 案B: 空実装の Repository 先行導入 / 案C: ロジックのみ先行）                                                                                                                                                            | 論点1          |
| 8-2  | Product 名寄せの方式（案A: productRef のみ / 案B: ランタイム alias マッチング / 案C: ハイブリッド）                                                                                                                                                       | 論点2          |
| 8-3  | 最安店舗が決定できない場合の `targetStore` の扱い（案A: null / 案B: デフォルト店舗 / 案C: 履歴推定）                                                                                                                                                      | 論点3          |
| 8-4  | 複数レシピ間の材料集計方針（案A: 集計しない / 案B: 同一単位のみ合算・`Quantity.add()`新設 / 案C: 完全単位変換）。加えて `amount=null`（amountNote のみ）ケースの扱い（案α/β/γ）                                                                           | 論点4          |
| 8-5  | `GenerateShoppingListUseCase` が MealPlan の `draft→shopping` 遷移を担うか（案A: 担う / 案B: 担わない / 案C: 部分失敗許容）。担う場合、同一 MealPlan への2回目の呼び出し（再生成）を冪等にするか・エラーにするか（MealPlan Sprint 3 の C-3 と同型の論点） | 論点5          |
| 8-6  | `RecipeRepository` / `ProductRepository` に `findByIds` を新設するか、`findById` のループ呼び出しで済ませるか                                                                                                                                             | 論点1/2/3/6    |
| 8-7  | ShoppingList を読み取る UseCase（`GetShoppingListUseCase` 相当）が対象 4 UseCase に含まれていない。Unit B のためにいつ・どのユニットで追加するか                                                                                                          | 3-4 節         |
| 8-8  | `ShoppingList.complete()` / `getBoughtItemsForPantry()` を Domain に先行実装するか（MealPlan.transitionTo の Sprint 3 前例に倣うか）                                                                                                                      | 1-4 節         |
| 8-9  | `ItemStatus.skipped` に到達する操作が対象 4 UseCase にない。Sprint 4 で作るか、Sprint 5 以降に持ち越すか                                                                                                                                                  | 3-1 節         |
| 8-10 | `ShoppingList.addItem` / `reassignStore` に `status==='completed'` のガードを設けるか（`MealPlan.addRecipe` 型のステータスガード先例に倣うか）                                                                                                            | 3-1 節         |
| 8-11 | `ShoppingList.shoppingDate` の意味論（週開始日=土曜固定 か、実際に買い物した日か）                                                                                                                                                                        | 前提4          |
| 8-12 | `ReassignStoreUseCase` / `AddItemUseCase` で指定された `storeId` の実在チェックを UseCase 層で行うか（MealPlan の RecipeId 非チェック方針＝C-4 案Aに倣うか）                                                                                              | 3-3 節         |

---

## 9. 参照ファイル（主要なもの）

- `docs/04-domain-model.md`（413-497行 ShoppingList集約、606-712行 UseCase擬似コード、714-735行 設計上の論点）
- `docs/05-roadmap.md`（281-317行 Sprint 4）
- `docs/01-overview.md`（実運用フロー）
- `docs/03-architecture.md`（ディレクトリ構成・依存方向・手動DI）
- `docs/requirements/meal-plan-core.md`（要件書の章立て先例、C-3冪等性の議論が8-5と同型）
- `docs/designs/meal-plan-core.md`（設計書の粒度先例）
- `docs/decisions/ADR-0005-week-definition-saturday-start.md`
- `docs/decisions/ADR-0003-no-auth-in-mvp1.md`
- `docs/decisions/ADR-0004-no-user-in-domain.md`
- `packages/domain/src/meal-plan/meal-plan.ts`（transitionTo実装済み）
- `packages/domain/src/meal-plan/meal-plan.repository.ts`
- `packages/domain/src/recipe/recipe.ts`（scaleIngredients）
- `packages/domain/src/recipe/recipe-ingredient.ts`（amount:Quantity|null と amountNote の排他制約）
- `packages/domain/src/recipe/recipe.repository.ts`（findByIds 不在を確認）
- `packages/domain/src/product/product.ts`（cheapestStoreAt 実装）
- `packages/domain/src/product/product.repository.ts`（findByIds 不在を確認）
- `packages/domain/src/shared/quantity.ts`（add() 不在を確認）
- `packages/domain/src/shared/money.ts`
- `packages/domain/src/shared/store.ts` / `store.repository.ts`
- `packages/application/src/product/get-cheapest-store.use-case.ts`（価格データなし時のnull安全な扱いの先例）
- `packages/infrastructure/src/repositories/drizzle-meal-plan.repository.ts`（JOIN+グルーピングパターン）
- `packages/infrastructure/src/repositories/drizzle-recipe.repository.ts`（JSONB ingredients 変換パターン）
- `packages/infrastructure/src/db/schema.ts`（既存テーブル定義。追記対象）
- `packages/api-contract/src/meal-plan.schema.ts`
- `apps/web/src/server/routes/meal-plans.ts`
- `apps/web/src/server/app.ts`（onError パターン。追記対象）
