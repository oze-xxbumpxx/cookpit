# 設計書: shopping-list-core

- ステータス: **draft**（本設計はドラフトであり、S-x のユーザー確定を経て確定する）
- レベル: L3
- スプリント: Sprint 4 Unit A
- 関連: `docs/requirements/shopping-list-core.md`（要件定義）、`docs/04-domain-model.md` §ShoppingList 集約、
  `docs/designs/meal-plan-core.md`（形式・先例）、ADR-0003 / ADR-0004（認証・User なし）、ADR-0005（土曜始まり週）

---

## 背景

`docs/01-overview.md` の実運用フロー「土曜日に献立を決め → 買い物リストを作る → 2店舗を回って買い物」のうち、
「買い物リストを作る」〜「買い物中に使う」のバックエンド一式を実装する。Sprint 3 で MealPlan（献立）の
バックエンドと `draft→shopping` の遷移ロジックまでが実装済みであり、本ユニットはそれに接続する
新規集約 ShoppingList を全層（Domain / Infrastructure / Application / API Contract / Presentation(API)）に
縦断して追加する。

本フェーズの主眼は、要件書 §8 で洗い出された 12 の未確定論点（8-1〜8-12）の設計上の扱いを固め、
ユーザー確定が必要なものを S-x として明示することにある。

## 目的

- 新規集約 `ShoppingList`（+ 集約内エンティティ `ShoppingItem`）、新規 Drizzle スキーマ、
  UseCase 4 本（Generate / AddItem / MarkAsBought / ReassignStore）、Hono API の技術設計を、
  後段の contract-designer / implementation-planner / test-designer が着手できる粒度で示す。
- 要件書 8-1〜8-12 のすべてを S-x（ユーザー確定）または D-x（設計者裁量・先例準拠）に対応づける。

## 要件

要点のみ。詳細は `docs/requirements/shopping-list-core.md` を正典とする。

- Domain: `ShoppingList` / `ShoppingListId` / `ShoppingItem` / `ShoppingItemId` 新規集約。
  `ItemStatus`（pending/bought/skipped）、`ItemSource`（from_meal_plan/manually_added）、
  `ShoppingListStatus`（active/completed）
- Infrastructure: `shopping_lists` 系テーブル + マイグレーション + `DrizzleShoppingListRepository`
- Application: `GenerateShoppingListUseCase` / `AddItemUseCase` / `MarkAsBoughtUseCase` / `ReassignStoreUseCase`
- API Contract: `packages/api-contract/src/shopping-list.schema.ts`（詳細は contract-designer）
- Presentation (API): `apps/web/src/server/routes/shopping-lists.ts` + `app.ts` マウント
- 前提（確定済み）: Pantry 未実装（Sprint 5）／名寄せは `aliases` 手動管理の MVP1 制約下／
  完全な単位変換はしない／週は土曜始まり（ADR-0005）／認証・User なし（ADR-0003/0004）

## 対象範囲

| 層                 | 実装対象                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Domain             | ShoppingList 集約・ShoppingItem・ID VO 2 種・ステータス型 3 種・ShoppingListRepository IF    |
| Domain（shared）   | `Quantity.add()` の追加（S-4 案 B 採用時のみ。共有 VO への後方互換的追加）                   |
| Infrastructure     | `shopping_lists` / `shopping_items` スキーマ（S-1 案 A 前提）、DrizzleShoppingListRepository |
| Application        | UseCase 4 本 + DTO / Mapper / エラークラス（meal-plan 先例踏襲）                             |
| API Contract       | Zod スキーマの項目一覧（詳細確定は contract-designer）                                       |
| Presentation (API) | Hono ルート + `app.ts` マウント・onError 追記                                                |

## 対象外

- **画面・UI 実装・PWA オフライン強化** → Unit B（`shopping-list-screens`、L2）
- **ShoppingList を読み取る UseCase（`GetShoppingListUseCase` 相当）は Unit A スコープ外**（要件書 8-7 /
  §3-4 ギャップ。ユーザー確定済みの現行スコープでは対象 4 UseCase に含まれない）。
  ただし追加のタイミング・ユニットは S-7 として確定に回す（本書の推奨は「Unit A への 1 本追加」だが、
  確定までは対象外のまま扱う）
- **`CompleteShoppingUseCase` の実装・Pantry 連携の実装** → Sprint 5
  （`ShoppingList.complete()` / `getBoughtItemsForPantry()` の Domain 先行実装可否は S-8）
- **Pantry 集約そのもの**（`packages/domain/src/pantry/` は作らない）
- **認証・複数ユーザー対応** → Phase 2（ADR-0003 / ADR-0004 継続）
- プロダクションコードの変更（本書は設計書のみ）

---

## 設計判断リスト（本フェーズの主眼）

Sprint 3 meal-plan-core の C-x / D-x 方式に倣う。**S-x はユーザー確定が必要な判断**（本書は推奨を示すのみで
確定しない）、**D-x は既存の確定先例に素直に倣う設計者裁量の判断**（理由付きで確定として記録。
別案を選ぶ場合の差分も明記）。

### S-x サマリ（ユーザー確定が必要）

| #    | 論点                                                                      | 推奨案                                                             |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| S-1  | shopping_items の永続化方式（別テーブル vs JSONB）                        | 案 A: 別テーブル                                                   |
| S-2  | Pantry 依存の扱い（要件 8-1）                                             | 案 A: Sprint 4 では依存なし                                        |
| S-3  | Product 名寄せの方式（要件 8-2）                                          | 案 A: productRef 引き継ぎのみ                                      |
| S-4  | 材料集計方針と `Quantity.add()` 新設 = 共有 VO 変更（要件 8-4 前半）      | 案 B: 同一キー・同一単位のみ合算（add() 新設）                     |
| S-5  | `amount = null`（amountNote のみ）材料の扱い（要件 8-4 後半）             | 案 β: `requiredAmount: Quantity \| null` + `amountNote` 保持       |
| S-6  | MealPlan `draft→shopping` 遷移の担当と再実行の冪等性（要件 8-5）          | 遷移を担う + 冪等（既存 active を返す・部分失敗は修復）            |
| S-7  | GetShoppingList（読み取り）をいつ・どのユニットで追加するか（要件 8-7）   | 案 B: Unit A スコープに 1 本追加（スコープ拡張のためユーザー確定） |
| S-8  | `complete()` / `getBoughtItemsForPantry()` の Domain 先行実装（要件 8-8） | complete() のみ実装（API 非公開）・getBoughtItemsForPantry は保留  |
| S-9  | `ItemStatus.skipped` への到達操作（要件 8-9）                             | Domain に markAsSkipped 実装・UseCase/API は作らない               |
| S-10 | `shoppingDate` の意味論（要件 8-11）                                      | 案 A: `mealPlan.weekOf.startDate()`（週開始土曜）固定              |
| S-11 | ShoppingItem 状態遷移の細則（bought 再適用・skipped→bought ほか）         | 上書き許容・寛容方針（詳細は本文）                                 |

### D-x サマリ（設計者裁量・先例準拠で確定）

| #   | 判断                                                                     | 準拠する先例                                                       |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| D-1 | 最安店舗が決定できない場合 `targetStore = null`（要件 8-3）              | `Product.cheapestStoreAt` / GetCheapestStore の null 安全設計      |
| D-2 | items 変更系操作すべてに `status === 'active'` ガード（要件 8-10）       | `MealPlan.addRecipe` / `removeRecipe` のステータスガード           |
| D-3 | `storeId` の UseCase 層での実在チェックはしない（要件 8-12）             | MealPlan の RecipeId 非チェック方針（C-4 案 A）                    |
| D-4 | `findByIds` は新設せず `findById` ループで取得（要件 8-6）               | findRecent の「MVP1 規模なら十分」判断・既存 IF 無変更の最小変更   |
| D-5 | MarkAsBought / ReassignStore の戻り値は更新後 `ShoppingItemDto`          | AddRecipeToMealPlan が `PlannedRecipeDto` を返す先例               |
| D-6 | status/source は `text` カラム（pgEnum 不採用）。FK は親子関係のみ       | 既存 schema.ts 全テーブル（pgEnum 不使用）・planned_recipes の C-4 |
| D-7 | plannedRecipes 0 件の MealPlan からも生成を許容（空 items のリスト作成） | 拒否する積極的理由がなく、AddItem での手動運用を妨げないため       |
| D-8 | 削除済み Recipe を参照する PlannedRecipe は生成時にスキップ              | C-4 案 A（削除済み Recipe への参照を許容する精神）                 |

### 要件書 8-1〜8-12 → S-x / D-x 対応表

| 要件書 # | 論点                                         | 本書での扱い      |
| -------- | -------------------------------------------- | ----------------- |
| 8-1      | Pantry 依存                                  | **S-2**           |
| 8-2      | Product 名寄せ                               | **S-3**           |
| 8-3      | 最安店舗未決定時の targetStore               | **D-1**           |
| 8-4      | 材料集計（+ Quantity.add）／amount=null      | **S-4** / **S-5** |
| 8-5      | MealPlan 遷移・再実行の冪等性                | **S-6**           |
| 8-6      | findByIds 新設 or ループ                     | **D-4**           |
| 8-7      | GetShoppingList のスコープ                   | **S-7**           |
| 8-8      | complete() / getBoughtItemsForPantry()       | **S-8**           |
| 8-9      | skipped への到達操作                         | **S-9**           |
| 8-10     | completed ガード                             | **D-2**           |
| 8-11     | shoppingDate の意味論                        | **S-10**          |
| 8-12     | storeId 実在チェック                         | **D-3**           |
| —        | items 永続化方式（設計フェーズで顕在化）     | **S-1**           |
| —        | ShoppingItem 状態細則（要件 §3-3 の未確定）  | **S-11**          |
| —        | 空 plannedRecipes の扱い（要件 §7-1 要確認） | **D-7**           |
| —        | 削除済み Recipe の扱い（要件 §7-1 要確認）   | **D-8**           |
| —        | 変更系 UseCase の戻り値（要件 §3-3）         | **D-5**           |
| —        | enum 表現・FK 方針（要件 §3-4 設計指示）     | **D-6**           |

---

### S-1: shopping_items の永続化方式（**最重要の DB 設計判断**）

**論点**: `ShoppingList.items` を「別テーブル `shopping_items`」にするか「`shopping_lists` の JSONB カラム」に
するか。既存スキーマには両先例が同居している（`recipes.ingredients` = JSONB、`planned_recipes` = 別テーブル）。

| 観点             | 案 A: 別テーブル（推奨）                                                                                   | 案 B: JSONB カラム                                                             |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 子要素の独立 ID  | ShoppingItem は `ShoppingItemId` を持つ。DB の first-class citizen として一致                              | ID はあるが JSONB 内の値にとどまる                                             |
| 個別更新の頻度   | **markAsBought / reassignStore が Sprint 4 の主操作**。買い物中に何十回も発生する                          | 1 item の更新でも JSONB 全体を書き直す                                         |
| 既存先例との対応 | `planned_recipes`（C-2 で「独立 ID + 個別更新 → 別テーブル」とユーザー確定済み）・`price_records` と同型   | `recipes.ingredients`（ID なし・一括更新のみ）と同型だが、items の性質と不一致 |
| 将来の最適化余地 | item 単位の部分 UPDATE へ移行可能（買い物中の低速回線対策として現実的な進化パス）                          | 常に全量書き換え。行サイズも items 数に比例して肥大                            |
| 実装コスト       | DrizzleMealPlanRepository と同一の JOIN + グルーピング / upsert + NOT IN DELETE パターン。実装コストは既知 | シリアライズ/デシリアライズの新実装                                            |

**推奨: 案 A（別テーブル）**。判断基準は C-2 でユーザー確定済みの「独立 ID を持ち個別更新されるなら
別テーブル」にそのまま合致する。ShoppingItem は PlannedRecipe よりさらに更新頻度が高い
（買い物中のチェック操作が主ユースケース）ため、案 B を選ぶ理由が乏しい。
C-2 と同型の判断ではあるが、スキーマ設計の根幹で後からの変更コストが高いため S とする。

**案 B を選ぶ場合の差分**: `shopping_lists.items jsonb NOT NULL DEFAULT '[]'` の 1 カラムになり、
Repository は DrizzleRecipeRepository の ingredients 変換パターンを踏襲する。§DB 設計は全面差し替え。

---

### S-2: Pantry 依存の扱い（要件 8-1）

**論点**: `docs/04-domain-model.md` の擬似コードは `pantryRepo.find()` → 在庫引き算を含むが、
Pantry 集約は未実装（Sprint 5）。

| 案  | 内容                                                                          | 長所                                    | 短所                                                                                |
| --- | ----------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| A   | 依存なし。コンストラクタに PantryRepository を含めない。必要量 = 集計値のまま | 最小・YAGNI 準拠。Sprint 5 で改めて設計 | Sprint 5 でコンストラクタ変更（呼び出しは Hono ルート 1 箇所 + テストのみで影響小） |
| B   | PantryRepository IF だけ先行定義し「常に空」の null オブジェクトを DI         | Sprint 5 の差し替えが実装追加のみ       | 使われない抽象の先行導入。null オブジェクトとテストの二重管理コスト                 |
| C   | 在庫引き算ロジックを UseCase 内に実装し「在庫は常に 0」とみなす               | 拡張ポイントが明示される                | Pantry なしでは検証不能なロジック。テストが形骸化する                               |

**推奨: 案 A**。ユーザー確定済みスコープ（Pantry 連携は Sprint 5）の下では A/B/C いずれも Sprint 4 の
挙動は同一で、差は「移行コストを今払うか」のみ。移行時の変更は手動 DI の呼び出し 1 箇所と小さく、
Sprint 5 で Pantry の実設計（`calculateRequiredAmount` の端数・切り上げルール含む）と一緒に決める方が
手戻りがない。なお在庫引き算の挿入位置は §バックエンド設計の Generate ステップ 6 と 7 の間であることを
本書に記録しておく（Sprint 5 への申し送り）。

---

### S-3: Product 名寄せの方式（要件 8-2）

**論点**: `RecipeIngredient.productRef: ProductId | null`（レシピ作成時の手動紐付け）をどう
`ShoppingItem.productId` に反映するか。

| 案  | 内容                                                                       | 長所                                                         | 短所                                                                                  |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| A   | `productRef` をそのまま引き継ぐのみ。ランタイム文字列マッチングなし        | 最小実装。既存概念のみ。誤マッチのリスクゼロ                 | レシピ側で紐付けしていない材料は `productId=null` のまま → targetStore も null になる |
| B   | Generate 時に全 Product を取得し `name`/`aliases` と正規化突き合わせで補完 | `aliases` 手動管理の仕組みが活き、レシピ側の紐付け漏れを救済 | マッチングロジック新規実装。複数一致・曖昧一致の規定が必要                            |
| C   | A + B のハイブリッド（productRef 優先、なければ B）                        | 両取り                                                       | 実装・テストコスト最大                                                                |

**推奨: 案 A**。理由: (1) MVP1 制約（`docs/04-domain-model.md` 論点1: aliases 手動管理・Auto-suggest なし）の
下では、名寄せ品質はレシピ登録時の運用で担保するのが素直。(2) Sprint 4 のクライマックスは「買い物体験」で
あり、名寄せ改善は価格比較の質の問題。Product 登録・aliases のデータが溜まってから案 C を入れる方が
検証しやすい。(3) Generate 内の「productId 解決」を private ステップとして分離しておけば、
案 C への移行は UseCase 内部の局所変更で済む。案 A の帰結（targetStore が null になりがち）は
§リスク R-2 に記載し、Unit B の「店舗未定」グルーピング表示（D-1 前提）で受け止める。

---

### S-4: 材料集計方針と `Quantity.add()` 新設（要件 8-4 前半・**共有 VO 変更を含む**）

**論点**: 複数レシピが同一材料を含む場合に合算するか。合算するなら共有 VO `Quantity`
（Recipe / Product も使用）への `add()` 追加が必要（実コードに不在であることを確認済み）。

| 案  | 内容                                                                                                                | 長所                                                       | 短所                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A   | 集計しない。材料をそのまま個別 ShoppingItem に展開                                                                  | `Quantity.add()` 不要。実装最小                            | 「玉ねぎが 3 行」問題。買い物中の UX を直撃（Unit B のグルーピングでも行数自体は減らない） |
| B   | `(productId ?? 正規化 displayName) + unit` の完全一致でグルーピングし `Quantity.add()` で合算。不一致は個別行のまま | 単位変換なしの MVP1 制約と整合しつつ実用上の合算が得られる | 共有 VO への `add()` 追加（後方互換的だが共有 VO 変更のため要確認）                        |
| C   | Product の `defaultUnit` へ完全変換してから合算                                                                     | UX 最良                                                    | 完全な単位変換の実装が必要で MVP1 制約（実装しない）を超える。S-3 の解決にも依存           |

**推奨: 案 B**。理由: (1) 買い物リストの実用価値（同一材料の行散らばり防止）に直結する。
(2) `Quantity.add()` は `Money.add()`（通貨不一致で throw）と同型の 3 行実装であり、既存利用箇所
（`of()`/`multiply()` のみ）に影響しない純追加。(3) 単位が一致するもの**のみ**合算し、不一致・
`amount=null` は個別行のまま残すため、「完全な単位変換はしない」という MVP1 制約と矛盾しない。

**合算仕様（案 B 採用時の確定内容）**:

- `Quantity.add(other: Quantity): Quantity` — 単位不一致は `throw new Error('Cannot add different units')`
  （Money.add と同文型）。値は `Quantity.of(this.value + other.value, this.unit)`
- 集計キー: `productId` が非 null なら `productId.value`、null なら `displayName.trim()`。これに `unit` を連結
- 合算行の `displayName` は最初に出現した材料のものを使う
- `amount = null` の材料は合算対象外（S-5 参照）。同一 displayName でも単位が異なれば別行
- 手動追加（AddItem）は既存行と合算**しない**（ユーザーの明示操作をそのまま尊重する）
- 端数: 合算後の値をそのまま保持する。販売単位への切り上げは Product 側に概念がないため Sprint 4 では扱わない
  （要件書 §4 論点 4 の整理どおり。Pantry 在庫引き算の切り上げは Sprint 5 の論点）

---

### S-5: `amount = null`（amountNote のみ）材料の扱い（要件 8-4 後半・**ドメインモデル変更**）

**論点**: `RecipeIngredient.amount` は `Quantity | null`（「適量」「少々」は `amountNote` のみ）だが、
`docs/04-domain-model.md` の `ShoppingItem.requiredAmount` は非 null 前提で矛盾している。

| 案  | 内容                                                                                             | 長所                                              | 短所                                                                                   |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| α   | `Quantity.of(0, 単位)` 等のプレースホルダ + 表示は amountNote 頼み                               | requiredAmount 非 null を維持                     | 「0 g」という嘘の値が DB に入る。単位の選びようがない。amountNote フィールドは結局必要 |
| β   | `requiredAmount: Quantity \| null` に変更し、`amountNote: string \| null` を ShoppingItem に追加 | RecipeIngredient の実型と完全整合。情報の損失なし | `docs/04-domain-model.md` の擬似コードからの逸脱（要同期）。契約の nullability 増加    |
| γ   | `amount = null` の材料は自動生成の対象外（リストに載せない）                                     | ShoppingItem の型が単純                           | 「塩少々」等が黙って落ちる。買い忘れの温床。ユーザーが欠落に気づけない                 |

**推奨: 案 β**。理由: (1) 出所（RecipeIngredient）と同じ `amount xor amountNote` の排他構造を写像するのが
最も情報損失がなく、買い物中に「適量」という文字が見えることに実用価値がある。(2) 案 α は不正な値の
捏造であり、案 γ はサイレントなデータ欠落で「ストレスなく操作できる」という Sprint 4 完了条件に反する。
(3) ドメインモデル文書からの逸脱になるため S とする（確定後に `docs/04-domain-model.md` を同期。
ADR-0005 の E-8 対応と同じフォローアップ方式）。

**案 β 採用時の不変条件**: `ShoppingItem.create()` で「`requiredAmount` と `amountNote` はちょうど一方が
非 null」を検証する（`RecipeIngredient.create` と同一ルール）。手動追加（AddItem）は Unit A の契約上
`requiredAmount` 必須のため常にこの不変条件を満たす（`amountNote` 付き手動追加の許容は Unit B 以降の検討。
§未決事項参照）。

---

### S-6: MealPlan `draft→shopping` 遷移の担当と再実行の冪等性（要件 8-5）

**論点 (a)**: `GenerateShoppingListUseCase` が MealPlan の取得・遷移・保存まで担うか。

| 案  | 内容                                        | 評価                                                                                                             |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A   | 担う（生成成功時に自動で `draft→shopping`） | **推奨**。meal-plan-core 設計書・roadmap の前方参照（「shopping への遷移は Sprint 4 の生成と連動」）と直接整合   |
| B   | 担わない（遷移は別 UseCase）                | ドキュメントと矛盾。Sprint 4 完了後も MealPlan が draft のままになり「買い物中」が MealPlan から判別できない     |
| C   | 遷移するが失敗してもロールバックしない      | 案 A でも DB トランザクションを使わない現行 Repository 構成では実質同じ問題を持つ。下記 (b) の修復設計で吸収する |

**論点 (b)**: 同一 MealPlan への 2 回目の呼び出し（再実行）をどうするか。C-3（CreateMealPlan 冪等・確定済み）
と同型の論点。

| 案  | 内容                                         | 評価                                                                                                 |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| B1  | エラー（MealPlan.status ≠ draft → 422）      | リトライ・誤操作・2人同時操作に弱い。roadmap 完了条件「2人で同じリストを見る」と相性が悪い           |
| B2  | 冪等（既存 ShoppingList があればそれを返す） | **推奨**。C-3 の確定判断（冪等）と同じ理由: 2 名利用の個人アプリでは重複リクエストに安全なのが最重要 |
| B3  | 再生成（既存を破棄して作り直す）             | 買い物途中のチェック状態が消える危険。明示的な「作り直し」機能は将来の別 UseCase とすべき            |

**推奨: (a) 案 A + (b) 案 B2（冪等）**。付随して次を確定内容とする:

1. **不変条件「1 MealPlan : 最大 1 ShoppingList」**を導入し、DB の `shopping_lists.meal_plan_id` に
   UNIQUE 制約を張る（C-3 の `week_start_date UNIQUE` と同型）
2. `ShoppingListRepository.findByMealPlanId()` を冪等判定のために必須メソッドとする
3. **部分失敗の修復**: 保存順は「ShoppingList 保存 → MealPlan 遷移・保存」。2 番目が失敗すると
   「リストはあるが MealPlan は draft」の不整合が残るため、再実行時に
   「既存リストあり && MealPlan.status === 'draft'」なら `transitionTo('shopping')` + save を行ってから
   既存リストを返す（リトライで自己修復する設計）。トランザクション未導入の現行 Repository 構成
   （DrizzleMealPlanRepository.save も複文を非トランザクションで実行）の先例に合わせ、Sprint 4 では
   トランザクションを導入しない（§エラー処理 (d)・§リスク R-3 参照）
4. 既存リストありで MealPlan.status が `shopping` 以外（cooking 等）の場合も既存リストをそのまま返す
   （読み出しの代替として安全）
5. 既存リストなしで MealPlan.status ≠ `draft` の場合はエラー（422。既存の `InvalidMealPlanStateError` を
   流用。§バックエンド設計参照）

**留意点**: MealPlan の遷移表は `shopping → draft`（やり直し）を許可している。将来、遷移 API が公開されて
「shopping→draft に戻してから再生成」が可能になると、冪等設計では古いリストが返り続ける。その時点で
「明示的な再生成 UseCase」の要否を再訪する（§未決事項）。Sprint 4 では遷移 API 非公開のため到達しない。

---

### S-7: GetShoppingList（読み取り UseCase）のスコープ（要件 8-7・**スコープ判断**）

**論点**: 対象 4 UseCase はすべて書き込み系で、生成済みリストを再取得する手段が API にない。
Unit B（画面）はページ再訪問・他端末からの参照（roadmap 完了条件「2人で同じリストを見て refetch」）で
読み取り API を必要とする。

| 案  | 内容                                                    | 長所                                                                                                             | 短所                                                                               |
| --- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| A   | 現行確定スコープ維持。Unit B の冒頭タスクとして追加する | Unit A のスコープが要件確定どおり動かない                                                                        | 画面ユニット（L2）にバックエンド全層縦断の実装が混入し、ユニット分割の意図が崩れる |
| B   | Unit A に `GetShoppingListUseCase` + GET 1 本を追加する | Unit A の API が単体で完結・検証可能になる。追加コストは小（Repository の findById / Mapper / ルート再利用のみ） | ユーザー確定済みスコープの拡張になる（だからこそ S でユーザー確定に回す）          |

**推奨: 案 B（Unit A に追加）**。理由: (1) Sprint 4 完了条件の「refetch で 2 人共有」は読み取り API が
前提であり、どこかで必ず作る。(2) Unit B は Presentation 専任の L2 ユニットで、そこに Domain〜API の
縦断実装を持ち込むより、集約を作っている Unit A で完結させる方が工程・レビューの粒度が揃う。
(3) 追加分は `findById`（既存メソッド）+ Mapper 再利用 + GET ルート 1 本で、設計・試験の増分が最小。

**案 B 採用時の追加内容**: `GetShoppingListUseCase`（`execute(input: { shoppingListId: string })` →
`ShoppingListDto`、null → `ShoppingListNotFoundError`）と `GET /api/shopping-lists/:id`（200）。
必要なら `GET /api/shopping-lists?mealPlanId=` 相当は Unit B 設計で再訪（findByMealPlanId が既にあるため
拡張は容易）。

---

### S-8: `complete()` / `getBoughtItemsForPantry()` の Domain 先行実装（要件 8-8・**スコープ判断**）

**論点**: Sprint 5 の `CompleteShoppingUseCase` が使う 2 メソッドを Domain に先行実装するか。
先例: MealPlan.transitionTo は Sprint 3 で「Domain には実装するが API 非公開」だった（要件書 前提 2）。

**推奨**:

- `complete()` は **Domain に実装する（API 非公開）**。理由: `ShoppingListStatus` の遷移
  （active→completed）は D-2 のステータスガードと一体の不変条件であり、これがないと
  「completed という状態は定義されているのに到達も検証もできない」中途半端な集約になる。
  transitionTo 先例と同型。実装は「active 以外なら throw、completed へ遷移」の数行
- `getBoughtItemsForPantry()` は **Sprint 4 では実装しない**。理由: 戻り値型
  `BoughtItemForPantry` が Pantry 集約（Stock の `AddStockInput`: expiresAt / storedLocation 等）の
  設計に依存する。Pantry 未設計の今、型だけ先に固めると Sprint 5 で作り直しになる公算が高い（YAGNI）

**別案**: 両方実装しない（complete も Sprint 5）。この場合 D-2 のガードは「常に active なので事実上
到達不能」となり実害はないが、集約の状態機械が不完全なままテストされる。

---

### S-9: `ItemStatus.skipped` への到達操作（要件 8-9・**スコープ判断**）

**論点**: 型に `'skipped'` があるのに、対象 4 UseCase のどれも skipped に遷移させない。

| 案  | 内容                                                       | 評価                                                                                     |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| A   | Domain に `markAsSkipped` を実装、UseCase / API は作らない | **推奨**。transitionTo 先例（Domain 実装・API 非公開）と同型。状態機械が完結しテスト可能 |
| B   | 型のみ残し Domain メソッドも作らない                       | 実装最小だが、DB・型に存在する値が到達不能のまま残る                                     |
| C   | UseCase / API まで作る（MarkAsSkippedUseCase）             | UI 要求（Unit B）が固まっていないのに操作を公開するのは先走り                            |

**推奨: 案 A**。`ShoppingItem.markAsSkipped()`（pending → skipped）と
`ShoppingList.markAsSkipped(itemId)`（active ガード + item 検索）を実装し、API 公開は Unit B / Sprint 5 の
画面要求が固まった時点で判断する。

---

### S-10: `shoppingDate` の意味論（要件 8-11・ADR-0005 関連）

**論点**: `ShoppingList.shoppingDate: Date` を何の日付とするか。

| 案  | 内容                                                  | 長所                                                                                      | 短所                                                                 |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| A   | `mealPlan.weekOf.startDate()`（週開始の土曜）に固定   | 運用実態（土曜買い物）・ADR-0005 と一貫。生成時刻に依存せず決定的（テスト安定）。入力不要 | 「実際に買った日」ではない（例: 日曜に買った場合もズレる）           |
| B   | 生成時の `new Date()`（ドメインモデル擬似コード踏襲） | 実装が素直                                                                                | 金曜夜に生成すると金曜の日付になる等、「買い物対象日」の意味とずれる |
| C   | API 入力で任意指定（デフォルトは A か B）             | 柔軟                                                                                      | Sprint 4 に UI 要求がなく、契約・検証が増えるだけ                    |

**推奨: 案 A**。「実際に買い物した日」の追跡が将来必要になれば、それは item 単位の `boughtAt`
（markAsBought 時刻）として別途設計すべき情報であり、リスト単位の shoppingDate に負わせない
（§未決事項に申し送り）。DB は `date` 型カラム（`meal_plans.week_start_date` と同じ変換規約）。

---

### S-11: ShoppingItem 状態遷移の細則（要件 §3-3 の「未確定」事項）

**論点と推奨**（いずれも「2 名利用・買い物中の訂正操作が頻繁」という前提で、エラーで弾くより
上書きを許す寛容方針。C-3 冪等の判断と同じ精神）:

| #   | 論点                                              | 推奨                                                                                                                                                                                                  | 別案                                   |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| (a) | `bought` の item への markAsBought 再適用         | **上書き許容**（actualPrice / actualStore を最新値で置き換え。金額の入力ミス訂正がこの操作 1 つで済む）                                                                                               | 422 エラー（訂正に別操作が必要になる） |
| (b) | `skipped` の item への markAsBought               | **許容**（「やっぱり買った」を自然に表現。skipped → bought）                                                                                                                                          | 422 エラー                             |
| (c) | `bought` の item への reassignStore               | **許容**（`targetStore` のみ変更。`actualPrice` / `actualStore` には触れない。計画情報と実績情報は独立）                                                                                              | pending / skipped のみ許可             |
| (d) | チェック解除（bought → pending に戻す）操作の不在 | **Unit A では作らない**。誤タップの取り消しは買い物 UX に直結するため、Unit B の画面設計で要否を判断し、必要なら小さな UseCase（status を pending に戻し actualPrice/actualStore をクリア）を追加する | Unit A で先行実装                      |

(d) は要件書に明示されていない本設計フェーズでの気づき（4 UseCase では bought が終端になり、
誤操作を取り消せない）。スコープに関わるため S に含める。

---

### D-1: 最安店舗が決定できない場合の `targetStore = null`（要件 8-3・確定）

`productId` が null、または該当 Product に価格履歴がない場合、`targetStore = null` とする。
**理由**: `Product.cheapestStoreAt(date): StoreId | null` の実装（価格記録なしで null 返却。
`packages/domain/src/product/product.ts` で確認済み）および GetCheapestStoreUseCase の null 安全な
先例と一貫。デフォルト店舗へのフォールバック（案 B）は「実際の最安ではない情報」を提示する
誤誘導であり不採用。履歴推定（案 C）は Sprint 4 の過剰実装。UI（Unit B）は null を「店舗未定」として
グルーピング表示する。

### D-2: items 変更系操作すべてに `status === 'active'` ガード（要件 8-10・確定）

`ShoppingList.addItem` / `markAsBought` / `reassignStore` / `markAsSkipped`（S-9 採用時）に
「`status !== 'active'` なら throw」のガードを設ける。**理由**: `MealPlan.addRecipe` / `removeRecipe` の
`canChangeRecipes()` ガード先例に倣う。要件書 8-10 は addItem / reassignStore を挙げているが、
同一の不変条件（「完了したリストは変更不可」）は変更系操作全体に一様に適用するのが集約の整合として
自然なため、対象を揃える。Sprint 4 では complete() を呼ぶ API がなく到達しないが、Domain の不変条件
として正しく、Sprint 5（CompleteShopping）で即座に意味を持つ。

### D-3: `storeId` の UseCase 層での実在チェックはしない（要件 8-12・確定）

ReassignStore / AddItem / MarkAsBought で指定された `storeId` について、`StoreRepository` を引いた
実在チェックは行わない（UUID 形式検証は Hono 層の Zod のみ）。**理由**: MealPlan の RecipeId
非チェック方針（C-4 案 A・ユーザー確定済み）に倣う。集約またぎは ID 参照のみで、参照先の実在保証を
UseCase の責務にしない。Store には削除 API 自体が存在せず（StoreRepository に delete なし）、
実在しない storeId は実運用では UI の選択肢経由でほぼ発生しない。

### D-4: `findByIds` は新設せず `findById` ループ（要件 8-6・確定）

Recipe / Product の取得は `findById` の `Promise.all` ループで行い、`RecipeRepository` /
`ProductRepository` への `findByIds` 追加は行わない。**理由**: (1) MVP1 規模（1 献立あたり数レシピ・
材料数十件）ではループで十分 — MealPlan `findRecent` の「MVP1 規模なら JOIN + グルーピングで十分」と
いう確定済み判断と同じスケール感。(2) 既存インターフェース・既存 Drizzle 実装への変更ゼロで済む
（最小変更原則）。(3) 将来ボトルネック化したら `findByIds` を後方互換的に追加すればよい。
別案（findByIds 新設）を選ぶ場合の差分: 2 つの Repository IF + 2 つの Drizzle 実装 + テスト追加。

### D-5: MarkAsBought / ReassignStore の戻り値は更新後 `ShoppingItemDto`（確定）

`void` ではなく更新後の item DTO を返す。**理由**: AddRecipeToMealPlan が追加後の
`PlannedRecipeDto` を返す先例に倣う。Unit B の Hono RPC + TanStack Query で楽観的更新の確定値として
レスポンスをそのままキャッシュ反映でき、追加の refetch を省ける。

### D-6: enum は `text` カラム・FK は親子関係のみ（確定）

- `shopping_lists.status` / `shopping_items.status` / `shopping_items.source` は `text`。
  **理由**: 既存 schema.ts の全テーブル（`meal_plans.status` 等）が pgEnum を使っていない先例に統一。
  値の妥当性は Domain 型 + Repository 復元時の網羅 switch（`toMealPlanStatus` 先例）で担保
- FK は `shopping_items.shopping_list_id → shopping_lists.id`（ON DELETE CASCADE。
  `planned_recipes.meal_plan_id` と同型の集約内親子）のみ。
  `meal_plan_id` / `product_id` / `target_store_id` / `actual_store_id` は**集約またぎの ID 参照**であり
  FK を張らない。**理由**: C-4 案 A（`planned_recipes.recipe_id` に FK なし・削除済み参照を許容）の
  確定判断に倣う。`price_records` が store/product に FK を張っている古い先例もあるが、あちらは
  集約内子テーブルであり、集約またぎ参照の直近先例（C-4）を優先する

### D-7: plannedRecipes 0 件の MealPlan からも生成を許容（確定）

空の items で ShoppingList を作成し、MealPlan も `shopping` へ遷移させる。**理由**: 拒否する積極的
理由がなく、「今週はレシピなしで買い物だけする」運用（AddItem で手動構成）を妨げない。
エラーにすると Unit B 側にエラーハンドリング分岐が増えるだけで得るものがない。

### D-8: 削除済み Recipe を参照する PlannedRecipe は生成時にスキップ（確定）

`recipeRepo.findById` が null を返した PlannedRecipe は材料展開の対象外とし、エラーにしない。
**理由**: C-4 案 A の精神（削除済み Recipe への参照は許容し、システムを止めない）。1 件の削除済み
レシピで献立全体の買い物リスト生成が失敗する方が実害が大きい。発生は稀（2 名利用で今週の献立中の
レシピを削除するケース）であり、欠落は Unit B の献立画面（削除済み表示）で気づける。

---

## 現状構成

- **Domain**: `recipe` / `product` / `store`(shared) / `meal-plan` 集約が実装済み。
  `packages/domain/src/shopping-list/` は存在しない
- **共有 VO**: `Quantity`（`of`/`multiply` のみ・**add なし**）、`Money`（`of`/`add`/`multiply`/`isLessThan`）、
  `Unit`（17 値の union 型）、`StoreId`/`Store`、`WeekIdentifier`（土曜始まり・ADR-0005）
- **確認済みの実装ギャップ**（要件書 §6 の指摘を実ファイルで再確認）:
  - `RecipeRepository` / `ProductRepository` に `findByIds` 不在（`findById`/`findAll`/`save`/`delete` のみ）
  - `Quantity.add()` 不在（`packages/domain/src/shared/quantity.ts`）
  - `RecipeIngredient.productRef` の型は **recipe-ingredient.ts ローカルの構造的インターフェース
    `{ readonly value: string }`** であり、`packages/domain/src/product/product-id.ts` の `ProductId`
    クラスとは別物。Generate 実装時は `ProductId.fromString(ingredient.productRef.value)` の変換が必要
  - `MealPlan.transitionTo` は実装済み。遷移表は `draft→[shopping]`、`shopping→[draft, cooking]`
    （shopping からの再遷移 `shopping→shopping` は throw）
  - `Product.cheapestStoreAt(at): StoreId | null` 実装済み（価格記録なしで null）
- **Infrastructure**: `schema.ts` に recipes（ingredients は JSONB）/ stores / products / price_records /
  meal_plans + planned_recipes（別テーブル）。2 つの永続化先例が同居
- **Application**: `meal-plan/` に UseCase 5 本 + DTO / Mapper / エラークラス 3 種の先例
- **Presentation**: `apps/web/src/server/app.ts` の onError に instanceof 分岐で 404/422/500 をマッピング。
  ルートは feature 単位ファイル + 手動 DI ファクトリ関数

## 変更後構成

### 新規作成ファイル

```
packages/domain/src/shopping-list/
├── shopping-list-id.ts          # ShoppingListId（ProductId パターン踏襲）
├── shopping-item-id.ts          # ShoppingItemId（同上）
├── shopping-list.ts             # ShoppingList 集約 + ShoppingItem + 型 3 種
├── shopping-list.repository.ts  # ShoppingListRepository IF
├── shopping-list-id.test.ts
└── shopping-list.test.ts

packages/application/src/shopping-list/
├── shopping-list.dto.ts
├── shopping-list.mapper.ts
├── shopping-list-not-found.error.ts
├── shopping-item-not-found.error.ts
├── invalid-shopping-list-state.error.ts
├── generate-shopping-list.use-case.ts
├── add-item.use-case.ts
├── mark-as-bought.use-case.ts
├── reassign-store.use-case.ts
├── get-shopping-list.use-case.ts        # S-7 案 B 採用時のみ
├── shopping-list-use-cases.test.ts
└── index.ts

packages/infrastructure/src/repositories/
├── drizzle-shopping-list.repository.ts
└── drizzle-shopping-list.repository.test.ts

packages/infrastructure/src/db/migrations/   # drizzle-kit 自動生成

packages/api-contract/src/
└── shopping-list.schema.ts                  # 詳細は contract-designer

apps/web/src/server/routes/
└── shopping-lists.ts
```

### 既存ファイルへの追記・変更

| ファイル                                   | 変更内容                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `packages/domain/src/shared/quantity.ts`   | `add()` メソッド追加（**S-4 案 B 採用時のみ**。共有 VO への後方互換的追加）+ テスト追加 |
| `packages/infrastructure/src/db/schema.ts` | `shoppingLists` / `shoppingItems` テーブル定義を追記（S-1 案 A 前提）                   |
| `packages/infrastructure/src/index.ts`     | `DrizzleShoppingListRepository` の re-export 追加                                       |
| `packages/application/src/index.ts`        | `export * from './shopping-list'` を追加                                                |
| `packages/api-contract/src/index.ts`       | `export * from './shopping-list.schema'` を追加                                         |
| `apps/web/src/server/app.ts`               | `shoppingListsRoute` のマウント + 新規エラー 3 種の onError 分岐追加                    |

既存の Recipe / Product / Store / MealPlan の Domain・Repository・ルートには**一切変更を加えない**
（D-4 により findByIds も追加しない）。

## データフロー

### 層責務（誰が何をするか）

| 層             | 責務                                                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Presentation   | Hono ルートで Zod 検証（形式のみ）→ 手動 DI で UseCase 組み立て → execute → DTO を JSON で返す。ドメインロジックを書かない              |
| Application    | UseCase が集約またぎのオーケストレーション（MealPlan 取得・Recipe/Product 取得・集計・ShoppingList 生成・遷移）。エラー変換は入口で行う |
| Domain         | ShoppingList / ShoppingItem が不変条件（active ガード・排他検証・状態遷移）を保持。他パッケージ・Drizzle・HTTP に依存しない             |
| Infrastructure | DrizzleShoppingListRepository が DB 行 ⇔ ドメイン（create ではなく reconstruct）の変換責任を持つ                                        |

### 買い物リスト生成（中核フロー）

```
POST /api/shopping-lists  { mealPlanId }
  → Hono zValidator（mealPlanId: uuid）
  → GenerateShoppingListUseCase.execute({ mealPlanId })
      1. mealPlanRepo.findById → null なら MealPlanNotFoundError(404)
      2. shoppingListRepo.findByMealPlanId → 既存あり:
         ├─ mealPlan.status === 'draft' → transitionTo('shopping') + save（部分失敗の修復）
         └─ 既存の ShoppingListDto を返す（冪等・S-6）
      3. mealPlan.status !== 'draft' → InvalidMealPlanStateError(422)
      4. plannedRecipes の recipeId（重複除去）→ recipeRepo.findById × Promise.all（D-4）
         └─ null（削除済み）はスキップ（D-8）
      5. 各 PlannedRecipe × Recipe → recipe.scaleIngredients(scaleFactor) で材料展開
      6. 材料集計（S-4 案 B）: (productId ?? displayName) + unit キーで Quantity.add() 合算。
         amount=null は個別行（S-5 案 β）
         ※ Sprint 5 の Pantry 在庫引き算はこのステップの直後に挿入される（S-2 申し送り）
      7. unique な productId → productRepo.findById × Promise.all
         → product?.cheapestStoreAt(new Date()) ?? null を targetStore に（S-3 案 A・D-1）
      8. ShoppingItem.create × n（source='from_meal_plan', status='pending'）
      9. ShoppingList.create({ mealPlanId, items, shoppingDate: mealPlan.weekOf.startDate() })（S-10 案 A）
      10. shoppingListRepo.save(shoppingList)
      11. mealPlan.transitionTo('shopping') → mealPlanRepo.save（S-6 案 A）
      12. toShoppingListDto を返す
  → 201 + ShoppingListDto
```

### 購入済みマーク（買い物中の主操作）

```
POST /api/shopping-lists/:id/items/:itemId/bought  { actualPrice: {amount, currency}, actualStoreId }
  → MarkAsBoughtUseCase.execute(...)
      1. findById → null → ShoppingListNotFoundError(404)
      2. status !== 'active' → InvalidShoppingListStateError(422)   ※ UseCase 入口で事前チェック
      3. shoppingList.markAsBought(itemId, Money.of(...), StoreId.fromString(...))
         └─ item 未検出の Error → ShoppingItemNotFoundError(404) に変換
      4. save → 更新後 ShoppingItemDto を返す（D-5）
  → 200 + ShoppingItemDto
```

AddItem / ReassignStore も同型（findById → 事前 status チェック → ドメイン操作 → save → item DTO）。

## API 設計

エンドポイント案。HTTP メソッド・パスの最終確定と Zod 詳細は contract-designer（§未決事項の申し送り参照）。

| メソッド | パス                                                 | UseCase                     | 正常                     | 異常                                     |
| -------- | ---------------------------------------------------- | --------------------------- | ------------------------ | ---------------------------------------- |
| POST     | `/api/shopping-lists`                                | GenerateShoppingListUseCase | 201 + ShoppingListDto ※1 | 400 / 404（MealPlan）/ 422（state）      |
| POST     | `/api/shopping-lists/:id/items`                      | AddItemUseCase              | 201 + ShoppingItemDto    | 400 / 404（List）/ 422（completed・D-2） |
| POST     | `/api/shopping-lists/:id/items/:itemId/bought`       | MarkAsBoughtUseCase         | 200 + ShoppingItemDto    | 400 / 404（List・Item）/ 422             |
| POST     | `/api/shopping-lists/:id/items/:itemId/target-store` | ReassignStoreUseCase        | 200 + ShoppingItemDto    | 400 / 404（List・Item）/ 422             |
| GET      | `/api/shopping-lists/:id`（**S-7 案 B 採用時のみ**） | GetShoppingListUseCase      | 200 + ShoppingListDto    | 400 / 404                                |

※1 冪等パス（既存リスト返却）でも 201 で統一する（CreateMealPlan の C-3 冪等が常に 201 を返す先例に倣う。
契約フェーズで 200/201 の分岐を導入する場合は Hono RPC の型が分岐する点に注意）。

### リクエストボディ概要（Zod は形式検証のみ。意味論は Domain の責務）

| スキーマ                     | 主な検証項目                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generateShoppingListSchema` | `mealPlanId: z.uuid()`                                                                                                                                  |
| `addItemSchema`              | `displayName: 非空文字列`、`requiredAmount: { value: 0 以上の数, unit: Unit 17 値の enum }`、`productId?: uuid \| null`、`targetStoreId?: uuid \| null` |
| `markAsBoughtSchema`         | `actualPrice: { amount: 0 以上の数, currency: 'JPY' リテラル（推奨。§未決事項）}`、`actualStoreId: z.uuid()`                                            |
| `reassignStoreSchema`        | `targetStoreId: z.uuid()`                                                                                                                               |
| param 各種                   | `id: z.uuid()`、`itemId: z.uuid()`                                                                                                                      |

### エラー → HTTP ステータス対応表

| エラー種別                            | 発生箇所                                                        | HTTP | 処理                          |
| ------------------------------------- | --------------------------------------------------------------- | ---- | ----------------------------- |
| MealPlanNotFoundError（既存）         | Generate                                                        | 404  | app.ts onError（既存分岐）    |
| InvalidMealPlanStateError（既存）     | Generate（draft 以外・非冪等時）                                | 422  | app.ts onError（既存分岐）    |
| ShoppingListNotFoundError（新規）     | AddItem / MarkAsBought / ReassignStore / Get                    | 404  | app.ts onError（追記）        |
| ShoppingItemNotFoundError（新規）     | MarkAsBought / ReassignStore                                    | 404  | app.ts onError（追記）        |
| InvalidShoppingListStateError（新規） | AddItem / MarkAsBought / ReassignStore（completed ガード・D-2） | 422  | app.ts onError（追記）        |
| Zod バリデーション失敗                | Hono zValidator                                                 | 400  | 既定処理                      |
| DB エラー / 未知                      | —                                                               | 500  | 既存 console.error + 500 JSON |

## DB 設計

**S-1 案 A（別テーブル・推奨）前提**で記述する。案 B 採用時は本節を全面差し替え。

```typescript
// packages/infrastructure/src/db/schema.ts（追記分）
export const shoppingLists = pgTable('shopping_lists', {
  id: text('id').primaryKey(),
  mealPlanId: text('meal_plan_id').notNull().unique(),
  // ↑ 集約またぎの ID 参照。FK なし（D-6・C-4 先例）。
  //   UNIQUE = 「1 MealPlan : 最大 1 ShoppingList」不変条件（S-6）＋ findByMealPlanId のインデックスを兼ねる
  shoppingDate: date('shopping_date').notNull(), // S-10: 週開始土曜の date（"2026-07-11" 形式）
  status: text('status').notNull(), // 'active' | 'completed'（D-6: text）
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const shoppingItems = pgTable(
  'shopping_items',
  {
    id: text('id').primaryKey(),
    shoppingListId: text('shopping_list_id')
      .notNull()
      .references(() => shoppingLists.id, { onDelete: 'cascade' }), // 集約内親子（planned_recipes と同型）
    productId: text('product_id'), // null 許容・FK なし（集約またぎ ID 参照・D-6）
    displayName: text('display_name').notNull(),
    requiredAmountValue: numeric('required_amount_value', { precision: 10, scale: 3 }), // null 許容（S-5 β）
    requiredAmountUnit: text('required_amount_unit'), // null 許容（S-5 β）
    amountNote: text('amount_note'), // null 許容（S-5 β）
    targetStoreId: text('target_store_id'), // null 許容・FK なし（D-1 / D-6）
    status: text('status').notNull(), // 'pending' | 'bought' | 'skipped'
    actualPriceAmount: numeric('actual_price_amount', { precision: 10, scale: 1 }), // null 許容。bought 時のみ
    actualStoreId: text('actual_store_id'), // null 許容。bought 時のみ
    source: text('source').notNull(), // 'from_meal_plan' | 'manually_added'
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('shopping_items_shopping_list_id_idx').on(table.shoppingListId)],
);
```

**設計注記**:

- `numeric` の精度は既存先例に統一: 数量は `price_records.package_size_value` と同じ `numeric(10, 3)`、
  金額は `price_records.price_amount` と同じ `numeric(10, 1)`
- **通貨カラムは持たない**。`Money` の currency は Repository 復元時に `'JPY'` を与える
  （`drizzle-product.repository.ts` 147-148 行の確定先例に倣う）
- `requiredAmountValue` と `requiredAmountUnit` は必ず対で null / 非 null（S-5 の排他は Domain が保証。
  DB CHECK 制約は既存スキーマに前例がないため導入しない）
- `shopping_items.created_at` は Domain にマッピングしない（`planned_recipes.created_at` と同じ扱い）
- マイグレーション: schema.ts 追記 → `drizzle-kit generate` → `migrate`。既存テーブルへの変更なし（追加のみ）

### DB 行 ⇔ ドメイン変換（Repository の責務）

| ドメイン                                     | DB カラム                                        | 変換                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `shoppingList.shoppingDate`                  | `shopping_date`（date）                          | 保存: ローカル日付整形（DrizzleMealPlanRepository の `toDateString` と同方式）。復元: `new Date(value + 'T00:00:00')` |
| `item.requiredAmount: Quantity \| null`      | `required_amount_value` + `required_amount_unit` | 保存: `amount?.value` / `amount?.unit`。復元: 両方非 null なら `Quantity.of(Number(v), toUnit(u))`、それ以外 null     |
| `item.actualPrice: Money \| null`            | `actual_price_amount`                            | 復元: `Money.of(Number(v), 'JPY')`。null はそのまま                                                                   |
| `item.productId / targetStore / actualStore` | 各 text \| null                                  | `ProductId.fromString` / `StoreId.fromString`（null はそのまま）                                                      |
| `status` / `source`                          | text                                             | 復元時に網羅 switch で検証（`toMealPlanStatus` 先例。未知値は throw）                                                 |

## フロントエンド設計

対象外（Unit B `shopping-list-screens` のスコープ）。本設計は Unit B が使う API 契約と DTO を提供する
ところまでを担う。

## バックエンド設計

### Domain 設計

#### ShoppingListId / ShoppingItemId

ProductId パターンを完全踏襲（`private constructor` / `static generate()` = randomUUID /
`static fromString()` / `equals()` / `get value()`）。

#### 型定義

```typescript
export type ItemStatus = 'pending' | 'bought' | 'skipped';
export type ItemSource = 'from_meal_plan' | 'manually_added';
export type ShoppingListStatus = 'active' | 'completed';
```

#### ShoppingItem（集約内エンティティ）

| フィールド     | 型                | 不変条件                                                                                                                                   |
| -------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| id             | ShoppingItemId    | 不変                                                                                                                                       |
| productId      | ProductId \| null | 不変。**`product/product-id.ts` の ProductId クラス**を使う（集約またぎ ID 参照。RecipeIngredient のローカル構造型とは別物である点に注意） |
| displayName    | string            | 非空（`create` 入口で検証）                                                                                                                |
| requiredAmount | Quantity \| null  | S-5 β: amountNote とちょうど一方が非 null                                                                                                  |
| amountNote     | string \| null    | 同上（RecipeIngredient と同じ排他ルール）                                                                                                  |
| targetStore    | StoreId \| null   | null = 店舗未定（D-1）                                                                                                                     |
| status         | ItemStatus        | 初期値 'pending'。遷移は markAsBought / markAsSkipped のみ（S-11）                                                                         |
| actualPrice    | Money \| null     | bought 時のみ非 null                                                                                                                       |
| actualStore    | StoreId \| null   | bought 時のみ非 null                                                                                                                       |
| source         | ItemSource        | 不変                                                                                                                                       |

```
ShoppingItem
  private constructor(...)
  static create(input: CreateShoppingItemInput): ShoppingItem
    - displayName.trim() === '' → throw Error('Display name is required')
    - requiredAmount / amountNote の排他検証（S-5 β。RecipeIngredient.create と同文型）
    - id = ShoppingItemId.generate()、status = 'pending'、actualPrice = null、actualStore = null
  static reconstruct(props: ShoppingItemProps): ShoppingItem   // 検証なし・DB 復元専用

  markAsBought(price: Money, store: StoreId): void   // S-11(a)(b): 現 status を問わず上書き
  markAsSkipped(): void                              // S-9 採用時
  reassignStore(newStore: StoreId): void             // S-11(c): targetStore のみ変更
  isBought(): boolean

  get id / productId / displayName / requiredAmount / amountNote /
      targetStore / status / actualPrice / actualStore / source
```

```typescript
export interface CreateShoppingItemInput {
  productId: ProductId | null;
  displayName: string;
  requiredAmount: Quantity | null;
  amountNote: string | null;
  targetStore: StoreId | null;
  source: ItemSource;
}
```

#### ShoppingList（集約ルート）

| フィールド   | 型                 | 説明                                             |
| ------------ | ------------------ | ------------------------------------------------ |
| id           | ShoppingListId     | 不変                                             |
| mealPlanId   | MealPlanId         | 不変。ID 参照のみ                                |
| items        | ShoppingItem[]     | 集約内エンティティ                               |
| shoppingDate | Date               | 不変（S-10: 生成時に weekOf.startDate() を渡す） |
| status       | ShoppingListStatus | 'active' → 'completed' の一方向のみ（S-8）       |
| createdAt    | Date               | 不変（MealPlan 先例に合わせて Domain にも保持）  |

```
ShoppingList
  static create(input: { mealPlanId, items: ShoppingItem[], shoppingDate: Date }): ShoppingList
    → id = generate、status = 'active'、createdAt = new Date()
  static reconstruct(props: ShoppingListProps): ShoppingList

  addItem(item: ShoppingItem): void
    → status !== 'active' → throw（D-2）→ items.push
  markAsBought(itemId, price: Money, store: StoreId): void
    → status ガード（D-2）→ item 検索（未検出 throw Error('ShoppingItem not found')）→ item.markAsBought
  reassignStore(itemId, newStore: StoreId): void
    → status ガード → item 検索 → item.reassignStore
  markAsSkipped(itemId): void                      // S-9 採用時。同型
  complete(): void                                 // S-8 採用時
    → status !== 'active' → throw → status = 'completed'

  get items(): ShoppingItem[]     // 防御的コピー
  get shoppingDate(): Date        // 防御的コピー（new Date）
  ほか各 getter
```

**不変条件まとめ**: (1) items 変更系は active のみ（D-2）。(2) 各 item は displayName 非空・
amount/amountNote 排他（ShoppingItem.create が保証）。(3) status は active→completed の一方向。
(4) 「1 MealPlan : 最大 1 ShoppingList」は集約単体では守れないため UseCase（S-6 冪等）+ DB UNIQUE の
二段で保証する（C-3 と同じ構図）。

Domain 内の throw は MealPlan 先例に合わせて汎用 `Error`（メッセージで判別）とし、Application 層で
エラークラスに変換する。

#### ShoppingListRepository（Domain IF）

```typescript
export interface ShoppingListRepository {
  findById(id: ShoppingListId): Promise<ShoppingList | null>;
  findByMealPlanId(mealPlanId: MealPlanId): Promise<ShoppingList | null>; // S-6 冪等判定に必須
  save(shoppingList: ShoppingList): Promise<void>;
}
```

`findByMealPlanId` は S-6 で案 B1（エラー方式）を選ぶ場合は不要になるが、その場合も部分失敗の修復が
できなくなるため、推奨（B2 冪等）とセットで必須とする。delete は Sprint 4 スコープ外のため定義しない。

#### Quantity.add()（S-4 案 B 採用時・shared VO への追加）

```typescript
add(other: Quantity): Quantity {
  if (this.quantityUnit !== other.quantityUnit) {
    throw new Error('Cannot add different units');
  }
  return Quantity.of(this.quantityValue + other.quantityValue, this.quantityUnit);
}
```

Money.add と同文型。既存利用箇所（Recipe / Product は of / multiply のみ使用）への影響なし（純追加）。

### Infrastructure 設計

`DrizzleShoppingListRepository`（`implements ShoppingListRepository`）。
DrizzleMealPlanRepository と同一パターン:

- `findById` / `findByMealPlanId`: LEFT JOIN shopping_items → グルーピング → `reconstruct`
- `save`: shopping_lists を upsert（ON CONFLICT (id) DO UPDATE。set 対象は status のみ ※ mealPlanId /
  shoppingDate / createdAt は不変）→ `NOT IN (currentIds)` DELETE（items 0 件時は全 DELETE）→
  各 item を upsert（set 対象: displayName / requiredAmount\* / amountNote / targetStoreId / status /
  actualPriceAmount / actualStoreId。source と shoppingListId は不変だが upsert の set に含めても実害なし）
- 行変換は §DB 設計の対応表のとおり。status / source の復元は網羅 switch（未知値 throw）

### Application 設計

#### DTO

```typescript
export type ShoppingListStatus = 'active' | 'completed';
export type ItemStatus = 'pending' | 'bought' | 'skipped';
export type ItemSource = 'from_meal_plan' | 'manually_added';

export interface ShoppingItemDto {
  id: string;
  productId: string | null;
  displayName: string;
  requiredAmount: { value: number; unit: string } | null; // S-5 β
  amountNote: string | null; // S-5 β
  targetStoreId: string | null;
  status: ItemStatus;
  actualPrice: { amount: number; currency: string } | null;
  actualStoreId: string | null;
  source: ItemSource;
}

export interface ShoppingListDto {
  id: string;
  mealPlanId: string;
  shoppingDate: string; // ISO date "2026-07-11"
  status: ShoppingListStatus;
  items: ShoppingItemDto[];
  createdAt: string; // ISO 8601 datetime
}

// 入力 DTO
export interface GenerateShoppingListInputDto {
  mealPlanId: string;
}
export interface AddItemInputDto {
  shoppingListId: string;
  displayName: string;
  requiredAmount: { value: number; unit: string };
  productId?: string | null;
  targetStoreId?: string | null;
}
export interface MarkAsBoughtInputDto {
  shoppingListId: string;
  itemId: string;
  actualPrice: { amount: number; currency: string };
  actualStoreId: string;
}
export interface ReassignStoreInputDto {
  shoppingListId: string;
  itemId: string;
  targetStoreId: string;
}
```

#### Mapper

`toShoppingListDto(list)` / `toShoppingItemDto(item)`。**注意**: `shoppingDate` の整形は
`toISOString().slice(0, 10)` を使わず、ローカル日付で整形する（getFullYear/getMonth/getDate。
DrizzleMealPlanRepository の `toDateString` と同方式）。JST 環境ではローカル日付 00:00 の
`toISOString()` が UTC 換算で**前日**になるため。
（気づき・スコープ外報告: 既存 `meal-plan.mapper.ts` の `scheduledDate` は `toISOString().slice(0,10)`
を使っており、JST で非 null 値を扱うと前日にずれる潜在問題がある。Sprint 3 時点では scheduledDate が
常に null のため未顕在。本ユニットでは修正せず、改善候補として報告のみ。）

#### エラークラス

meal-plan 先例と同構造（`extends Error` + `name` 設定）:

- `ShoppingListNotFoundError(shoppingListId: string)` → 404
- `ShoppingItemNotFoundError(itemId: string)` → 404
- `InvalidShoppingListStateError(current: ShoppingListStatus, operation: string)` → 422

Generate の「MealPlan が draft でない」エラーは、新規クラスを作らず既存の
`InvalidMealPlanStateError`（同じ application パッケージ内）を
`new InvalidMealPlanStateError(mealPlan.status, 'generate a ShoppingList from')` の形で流用する
（onError の 422 分岐も既存のまま使える）。

#### UseCase 4 本（+ S-7 採用時 1 本）

**GenerateShoppingListUseCase**

```
constructor(
  private readonly mealPlanRepository: MealPlanRepository,
  private readonly recipeRepository: RecipeRepository,
  private readonly productRepository: ProductRepository,
  private readonly shoppingListRepository: ShoppingListRepository,
)  // S-2 案 A: PantryRepository なし。StoreRepository も不要（D-3）

async execute(input: GenerateShoppingListInputDto): Promise<ShoppingListDto>
```

処理ステップは §データフロー参照。内部は private メソッドに分割する:
`resolveRecipes()`（D-4 ループ + D-8 スキップ）/ `aggregateIngredients()`（S-4 案 B のキー生成と合算）/
`resolveTargetStores()`（S-3 案 A + D-1）。S-3 を将来案 C に変える場合の変更点を
`aggregateIngredients` 後段の productId 解決に閉じ込める。

**AddItemUseCase**（依存: ShoppingListRepository のみ）

```
1. findById → null → ShoppingListNotFoundError
2. list.status !== 'active' → InvalidShoppingListStateError(status, 'addItem')
3. ShoppingItem.create({ productId: input.productId ? ProductId.fromString(...) : null,
     displayName, requiredAmount: Quantity.of(value, unit), amountNote: null,
     targetStore: input.targetStoreId ? StoreId.fromString(...) : null,
     source: 'manually_added' })
4. list.addItem(item) → save → toShoppingItemDto(item)
```

**MarkAsBoughtUseCase / ReassignStoreUseCase**（依存: ShoppingListRepository のみ）

```
1. findById → null → ShoppingListNotFoundError
2. status !== 'active' → InvalidShoppingListStateError(status, 'markAsBought' | 'reassignStore')
3. try { list.markAsBought(itemId, Money.of(amount, currency), StoreId.fromString(storeId)) }
   catch → ShoppingItemNotFoundError(itemId) に変換
   （AddRecipeToMealPlan の try/catch 変換先例。ただし状態違反は手順 2 の事前チェックで先に
     捕捉済みのため、catch に来るのは item 未検出のみで判別が単純になる）
4. save → 更新後の item を list.items から取得 → toShoppingItemDto（D-5）
```

**GetShoppingListUseCase**（S-7 案 B 採用時のみ。依存: ShoppingListRepository のみ）

```
findById → null → ShoppingListNotFoundError → toShoppingListDto
```

### Presentation 設計

`apps/web/src/server/routes/shopping-lists.ts`。meal-plans.ts のパターン踏襲
（ルートファイル内の手動 DI ファクトリ関数 + zValidator + UseCase 実行）。Generate のみ 4 Repository を
組み立てる。`app.ts` に `.route('/shopping-lists', shoppingListsRoute)` を追記し、onError に新規エラー
3 種の分岐を追加する（既存分岐の順序・挙動には影響しない追記のみ）。

## エラー処理

エラーは UseCase の入口で変換し（§バックエンド設計）、Domain 内部は例外をそのまま投げる
（`.claude/rules/coding-standards.md` 準拠）。外部 I/O は DB（PostgreSQL）のみのため、Skill 指定の
5 項目を以下に示す:

- **(a) リトライ**: アプリ層での自動リトライは行わない（既存全機能と同一方針）。クライアント（Unit B）の
  再操作がリトライに相当し、Generate は S-6 の冪等設計で再実行安全
- **(b) タイムアウト**: DB 接続は既存 `getDb()`（Drizzle クライアント）の設定に従う。本ユニットで
  新規の外部呼び出しは追加しない
- **(c) 冪等性**: Generate は mealPlanId をキーに冪等（S-6 案 B2 + DB UNIQUE）。MarkAsBought の再適用は
  上書き（S-11(a)）で重複送信に安全。AddItem は冪等でない（二重送信で 2 行になる。既存 AddRecipe と
  同じ制約。Unit B 側の二重送信抑止に申し送り）
- **(d) 部分失敗**: Generate は「ShoppingList 保存 → MealPlan 保存」の 2 集約更新を非トランザクションで
  行う。後段失敗時は「リストあり・MealPlan は draft」となるが、再実行時の修復分岐（S-6-3）で収束する。
  DB UNIQUE 制約が二重リスト作成を最終防衛する
- **(e) フォールバック**: DB ダウン時は既存 onError の 500 フォールバックに委ねる（縮退動作なし。
  オフライン耐性は Unit B の PWA スコープ）

## ログと監視

対象外（MVP1 では監視基盤なし）。既存の `app.ts` onError 内 `console.error` に委ねる。

## セキュリティ

MVP1 は認証なし（ADR-0003 / ADR-0004。既存機能と同一前提）。ShoppingList に userId は持たない。
入力値は Hono zValidator（Zod）でサーバー側検証。productId / storeId の実在検証は行わない（D-3。
形式検証のみ）。SQL は Drizzle 経由でパラメタライズされる（既存同様）。

## 性能

- データ規模: 週 1 リスト（年約 50 行）、items は 1 リストあたり数十件（年数千行）。読み取りは
  LEFT JOIN + グルーピング 1 クエリで問題なし。`shopping_items(shopping_list_id)` のインデックスと
  `shopping_lists.meal_plan_id` UNIQUE（インデックス兼用）で必要な参照経路をカバー
- **留意点**: save が集約全体の upsert（items 数ぶんの文を逐次発行）のため、買い物中のチェック 1 回ごとに
  数十文が走る。MealPlan save と同一パターンであり MVP1 では許容するが、低速回線での体感が悪ければ
  item 単位の部分 UPDATE への最適化余地がある（S-1 案 A の別テーブルはこの進化を可能にする。
  Unit B 実測後の改善候補として申し送り）
- Generate は Recipe / Product を findById ループ（D-4）で取得する。1 献立あたり高々十数回の
  単純 PK 検索であり問題なし

## 後方互換性

- 既存テーブル・既存 API・既存 Domain への変更は `Quantity.add()` の**純追加**（S-4 案 B 採用時）のみ。
  既存の Quantity 利用箇所（Recipe / Product / MealPlan）は of / multiply のみ使用のため影響なし
- schema.ts / index.ts / app.ts への追記はすべて後方互換（meal-plan-core §14 と同じ判定）
- `docs/04-domain-model.md` の ShoppingList 擬似コードとは S-5（requiredAmount nullable + amountNote）・
  S-10（shoppingDate 意味論）等で乖離が生じる。**S-x 確定後に同ドキュメントを同期する**
  （ADR-0005 の E-8 対応と同じフォローアップ方式。§未決事項）

## テスト方針

要件書 §7（UseCase 4 本の正常系・異常系・境界条件）を土台に、試験計画は test-designer が
`docs/tests/shopping-list-core.md` で確定する。本設計から追加で渡す設計由来の観点:

- **Domain**: amount/amountNote 排他検証、active ガード（D-2。completed リストへの各操作拒否）、
  markAsBought の上書き（S-11(a)）と skipped→bought（S-11(b)）、markAsSkipped（S-9）、complete() の
  二重呼び出し拒否（S-8）、`Quantity.add()` の単位不一致 throw / 0 加算 / 合算値（S-4）
- **Application（Generate）**: 冪等再実行（既存返却）、**部分失敗の修復分岐**（既存リストあり +
  MealPlan=draft → 遷移が実行される）、既存リストあり + MealPlan=cooking 等（既存返却）、
  削除済み Recipe スキップ（D-8）、空 plannedRecipes（D-7）、集計キー境界（同名別単位は別行・
  同 productId 別 displayName は合算・amount=null は個別行）、scaleFactor 小数の数量精度
- **Infrastructure**: PGlite での round-trip（requiredAmount null / amountNote / actualPrice null の
  nullability 全パターン）、meal_plan_id UNIQUE 違反、NOT IN DELETE の挙動（既存 repository テスト先例）
- **API 契約**: contract-designer の確定後、既存 meal-plan.schema.test.ts のパターン
  （parse 通過 / reject / 型往復）で実装
- テストランナーは Vitest（全層導入済み）。実行は `pnpm lint` / `pnpm type-check` / `pnpm test`

## 移行とリリース

- DB マイグレーション: `shopping_lists` / `shopping_items` の追加のみ。既存テーブル変更なし・データ移行なし
- ロールバック: 両テーブルの DROP で戻せる（既存データへの影響なし）
- デプロイ: マイグレーション適用後に Next.js デプロイ（meal-plan-core §18 と同一手順）

## リスク

| #   | リスク                                                                                                                          | 対応                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| R-1 | S-x 未確定のまま実装に着手すると手戻りが大きい（特に S-1 / S-5 は DB スキーマ・DTO の根幹）                                     | 実装計画フェーズ前に S-1〜S-11 のユーザー確定を必須とする                                   |
| R-2 | S-3 案 A では Product 紐付けの運用が進むまで targetStore がほぼ null になり、roadmap の「価格比較インジケーター」の価値が出ない | 既知の MVP1 制約として受容。Unit B は「店舗未定」グルーピングを一級の表示として設計する     |
| R-3 | Generate の 2 集約更新が非トランザクション（部分失敗の窓がある）                                                                | S-6 の修復分岐 + DB UNIQUE で収束させる。トランザクション導入は将来の横断課題として申し送り |
| R-4 | 買い物中の save が集約全体書き込みで低速回線に弱い可能性                                                                        | §性能の留意点。Unit B 実測後に部分 UPDATE 最適化を検討                                      |
| R-5 | チェック解除（bought→pending）が Unit A に存在せず、Unit B の UX 検証で必要と判明する可能性                                     | S-11(d) で明示済み。必要時は小さな UseCase 追加で対応可能な構造にしてある                   |
| R-6 | `docs/04-domain-model.md` と本設計の乖離（S-5 / S-10 ほか）が放置されると後続実装が古い擬似コードを参照する                     | S-x 確定後にドメインモデル文書を同期するタスクを実装計画に含める                            |

## ADR 候補

今はファイルを作らない（実際の ADR 作成は設計確定後のフェーズ 2 で reviewer / Orchestrator が行う）。
恒久決定に昇格すべき候補:

1. **「1 MealPlan : 最大 1 ShoppingList」の一意性と Generate の冪等性**（S-6）
   — DB UNIQUE 制約・再実行セマンティクス・部分失敗の修復方針を含む。C-3（CreateMealPlan 冪等）と
   対をなす恒久判断
2. **材料合算は同一単位の完全一致のみ・単位変換は行わない（`Quantity.add()` の導入と制約）**（S-4）
   — MVP1 恒久制約（docs/04-domain-model.md 論点 2）の実装上の確定形。共有 VO の意味論として恒久性が高い
3. **買い物リストの Product 名寄せは productRef 引き継ぎのみ（MVP1）**（S-3）
   — 案 C（ランタイム alias マッチング）を明示的に先送りする判断として記録する価値がある。
   ただし Sprint 5/6 で覆る可能性があるなら Memory 留めでもよい（判断は確定時に）

## 未決事項

### ユーザー確定待ち（フェーズ 2 進入の前提）

- **S-1〜S-11**（§設計判断リスト）。特に S-1（DB 方式）・S-5（DTO/スキーマの nullability）・
  S-6（冪等）・S-7（スコープ）は contract-designer / implementation-planner の前提になるため先行確定が必要

### contract-designer への申し送り

- `requiredAmount.unit` は既存 `Unit` 17 値の z.enum とする想定（product.schema の defaultUnit の表現と
  整合させる）。詳細は契約フェーズで確定
- `actualPrice.currency` は `'JPY'` リテラル固定を推奨（DB に通貨カラムを持たない D-6 の判断と整合。
  自由文字列を受けても保存時に落ちるだけのため）
- MarkAsBought / ReassignStore のアクションエンドポイントの HTTP メソッド（本書は POST 案。
  PATCH 化する場合は Hono RPC の型と Unit B の呼び出しに影響）と Generate 冪等時のステータスコード
  （本書は 201 統一案）の最終確定
- DTO のフィールド名（`targetStoreId` / `actualStoreId` の Id サフィックス）をレスポンススキーマの
  正式名として確定すること
- エラーレスポンスは既存 `{ error: string }` / 400 は zValidator 既定形（meal-plan §19-7 踏襲）

### implementation-planner への申し送り

- 実装順の推奨: Quantity.add（S-4）→ Domain 集約 → Repository IF → Drizzle スキーマ + マイグレーション +
  Repository 実装 → Application → 契約 → Hono ルート（meal-plan-core の PR 分割先例に準拠）
- `docs/04-domain-model.md` §ShoppingList の同期タスクを計画に含める（R-6）
- `.claude/state/current-feature` は設定済み（変更不要）

### test-designer への申し送り

- §テスト方針の設計由来観点（特に Generate の冪等・修復分岐と集計キー境界）を試験計画に反映すること

### 将来課題（本ユニットでは扱わない）

- Sprint 5: Pantry 在庫引き算の挿入位置は Generate ステップ 6-7 間（S-2）。`getBoughtItemsForPantry()` と
  `BoughtItemForPantry` 型は Pantry 設計と同時に確定（S-8）
- item 単位の `boughtAt`（実際に買った日時）の要否（S-10 の別案吸収先）
- 「明示的な再生成」UseCase（S-6 留意点。遷移 API 公開後に再訪）
- AddItem の `amountNote` 付き手動追加の許容（S-5 注記）
- meal-plan.mapper.ts の `toISOString().slice(0,10)` による JST 日付ずれの潜在問題（スコープ外の気づき。
  改善候補として Orchestrator へ報告）
