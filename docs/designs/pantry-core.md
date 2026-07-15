# 設計書: pantry-core

- ステータス: **confirmed**（2026-07-14 S-1〜S-11 全件ユーザー確定・推奨案どおり。
  S-3 は訂正コミット b88be9a〈価格記録の非冪等性を明示〉反映済みの内容で確定。§未決事項の確定記録参照）
- レベル: L3
- スプリント: Sprint 5 Unit A
- 関連: `docs/requirements/pantry-core.md`（要件定義・ベースライン）、
  `docs/04-domain-model.md` §Pantry 集約（未実装草案）、
  `docs/decisions/ADR-0006-shopping-list-generate-idempotent.md`（冪等・部分失敗自己修復の直接先例）、
  `docs/designs/shopping-list-core.md` / `docs/designs/meal-plan-core.md`（同型 L3 設計書・S-x/D-x 採番の先例）

---

## 背景

`docs/01-overview.md` の実運用フロー「買い物完了 → 在庫が自動で増える」「平日に在庫を手動で
減らす（使った/捨てた）」のバックエンド一式を実装する。Sprint 4 までに ShoppingList の
`complete()` / `markAsBought()`（bought 品目は `actualPrice` / `actualStore` 必ず非 null という
不変条件つき）・MealPlan の `shopping → cooking` 遷移が Domain 実装済みであり、本ユニットは
それらを初めて外部公開経路（買い物完了 API）でつなぐ。

核となる論点は **4 集約（ShoppingList / Pantry / Product / MealPlan）をまたぐ
`CompleteShoppingUseCase` の冪等性・部分失敗**である。ADR-0006（Generate の冪等・保存順序に
よる自己修復・非トランザクション窓の許容・UNIQUE による不変条件担保）を直接の先例とする。

## 目的

- 新規集約 `Pantry`（+ 集約内エンティティ `Stock`）、新規 Drizzle スキーマ、
  UseCase 4 本（CompleteShopping / ConsumeStock / DiscardStock / GetPantry）、Hono API の
  技術設計を、後段の contract-designer / implementation-planner / test-designer が着手できる
  粒度で示す。
- 要件書 §6 の設計論点 (a)〜(e) + 追加論点のすべてを S-x（ユーザー確定が必要）または
  D-x（設計者裁量・先例準拠）に対応づける。

## 要件

要点のみ。詳細は `docs/requirements/pantry-core.md` を正典とする。

- Domain: `Pantry` / `PantryId` / `Stock` / `StockId` 新規集約、`PantryRepository` IF、
  `Quantity.subtract()`（共有 VO への追加。ConsumeStock に必須）
- Infrastructure: 在庫テーブル（本書 S-2 で単一テーブル案を推奨）+ `DrizzlePantryRepository`
- Application: UseCase 4 本 + DTO / Mapper / エラークラス
- API Contract: `pantry.schema.ts` + 買い物完了 API のスキーマ（`shopping-list.schema.ts` 追記）
- Presentation (API): `routes/pantry.ts` 新設 + `shopping-lists.ts` へ完了エンドポイント追加
- 前提（確定済み）: 認証なし・単一世帯（ADR-0003/0004）／非トランザクション構成の踏襲
  （ADR-0006）／在庫引き算連携は Unit C・画面は Unit B

## 対象範囲

| 層                 | 実装対象                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------- |
| Domain             | Pantry 集約・Stock・ID VO 2 種・`StorageLocation` union 型・PantryRepository IF           |
| Domain（shared）   | `Quantity.subtract()` の追加（S-7。共有 VO への後方互換的追加）                           |
| Infrastructure     | `stocks` テーブル（S-2 案 A 前提）+ マイグレーション + DrizzlePantryRepository            |
| Application        | UseCase 4 本 + PantryDto / StockDto / Mapper / エラークラス 2 種                          |
| API Contract       | Zod スキーマの項目一覧（詳細確定は contract-designer）                                    |
| Presentation (API) | `pantry.ts` 新設 + `shopping-lists.ts` へ complete 追加 + `app.ts` マウント・onError 追記 |

## 対象外

- **在庫一覧画面・「使った」「捨てた」ボタン・買い物完了導線の UI** → Unit B（`pantry-screens`、L2）
- **GenerateShoppingListUseCase への Pantry 注入・在庫引き算・切り上げルール** → Unit C。
  `calculateRequiredAmount()` / `findByProduct()` の含有可否は S-11 で論点確定する（推奨: 非実装）
- **賞味期限アラート・食材ロス分析・`findExpiringSoon()`** → Phase 2（S-10・S-11 参照）
- 認証・複数ユーザー対応（Phase 2、ADR-0003 / ADR-0004 継続）
- 既存ドキュメントの直接編集（更新必要箇所は §ドキュメント更新対象に列挙のみ）
- プロダクションコードの変更（本書は設計書のみ）

---

## 設計判断リスト（本フェーズの主眼）

shopping-list-core の S-x / D-x 方式に倣う。**S-x はユーザー確定が必要な判断**（本書は推奨を
示すのみで確定しない・全件「提案」）、**D-x は既存の確定先例に素直に倣う設計者裁量の判断**
（理由付きで記録。別案を選ぶ場合の差分も明記。最終確定は S-x と同じくユーザーレビューに従う）。
以降の本文はすべて**各論点の推奨案を既定とした一貫設計**として記述する（別案採用時の差分は
各論点内に明記）。

### S-x サマリ（すべて提案・要ユーザー確認）

| #    | 論点                                                                                     | 推奨案                                                                                          |
| ---- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| S-1  | Pantry シングルトンの表現・初回未作成時・GetPantry の応答（要件 6-a）                    | `find(): Promise<Pantry>`（引数なし・**常に非 null**）+ PantryId 固定定数。GetPantry は常に 200 |
| S-2  | 在庫テーブル設計（要件 6-d）                                                             | `stocks` 単一テーブル（pantries テーブルなし）+ `source_shopping_item_id` UNIQUE                |
| S-3  | 買い物完了の冪等性・保存順序・部分失敗・Stock 二重追加防止（要件 6-c）                   | 冪等成功 + 保存順序による自己修復 + UNIQUE 二重追加防止。**ADR 化推奨**                         |
| S-4  | `getBoughtItemsForPantry()` の再設計形と expiresAt / storedLocation の補い方（要件 6-b） | Domain メソッドは作らず Application 層で filter + 変換。expiresAt / storedLocation は null      |
| S-5  | Stock の `productId` null 許容 + `displayName` 保持（設計フェーズで顕在化）              | 両方採用（productId null の bought 品目も在庫化する）                                           |
| S-6  | `requiredAmount = null`（amountNote のみ）の bought 品目の Stock 量                      | `Quantity.of(1, '個')`（1 点）として登録                                                        |
| S-7  | `Quantity.subtract()` の負値時挙動と過剰消費の扱い（要件 §5-5 追加論点）                 | subtract は負値で throw（厳格）。過剰消費は `Stock.consume` が全量消費にクランプ                |
| S-8  | `actualPrice = 0`（無料品）と PriceRecord 正数チェックの矛盾（要件 §5-2）                | 価格記録をスキップ（Stock 追加は行う）                                                          |
| S-9  | `requiredAmount = null` 品目の価格記録・packageSize 転用の妥当性（要件 §5-2）            | requiredAmount を packageSize に転用。null / 0 / unitPrice 丸め 0 はスキップ                    |
| S-10 | 消費・廃棄の `reason` と履歴の永続化                                                     | MVP1 では reason を受け取らない（履歴テーブルは Phase 2 で導入）                                |
| S-11 | `calculateRequiredAmount` / `findByProduct` / `findExpiringSoon` の含有可否（要件 6-e）  | 本ユニットでは実装しない（Unit C / Phase 2 で追加）                                             |

### D-x サマリ（設計者裁量・先例準拠）

| #   | 判断                                                                                                               | 準拠する先例                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| D-1 | CompleteShoppingUseCase は `application/src/shopping-list/` に配置。API は `POST /api/shopping-lists/:id/complete` | Generate（生成物ではなく操作対象の集約側に配置）・既存ルート構成   |
| D-2 | `StorageLocation` はプレーン文字列 union。ID VO は 4 点セット。enum カラムは text                                  | `ItemStatus` / `MealPlanStatus` / 既存 schema.ts 全テーブル        |
| D-3 | Consume / Discard の戻り値は更新後 `PantryDto`（全在庫）                                                           | D-5（更新後 DTO を返す）先例の拡張。削除ケースの表現問題を回避     |
| D-4 | 完了時の MealPlan 遷移は「不存在ならスキップ・draft なら二段遷移で修復」                                           | ADR-0006 の自己修復精神・C-4（参照先の不存在でシステムを止めない） |
| D-5 | 価格記録の N+1 は productId ごとのグルーピングで緩和し、MVP 規模では許容                                           | D-4（findById ループで十分）のスケール感（詳細は §性能）           |
| D-6 | 消費量の契約は `z.number().positive()`（0 消費を 400 で reject）。unit は `unitSchema` 再利用                      | 契約は形式検証のみ・`unitSchema` 共有の既存パターン                |
| D-7 | `PantryDto` に Pantry の id を含めない（`{ stocks: StockDto[] }` のみ）                                            | クライアント操作が pantry id を必要とする経路が存在しないため      |
| D-8 | 集約またぎ ID 参照（product_id / source_shopping_item_id）に FK を張らない                                         | shopping-list D-6 / meal-plan C-4（FK なし・UNIQUE で不変条件）    |

### 要件書論点 → S-x / D-x 対応表（指示論点 1〜10 の網羅確認）

| 指示論点 | 内容                                                       | 本書での扱い              |
| -------- | ---------------------------------------------------------- | ------------------------- |
| 1 (a)    | Pantry シングルトン設計・初回未作成・GetPantry 応答        | **S-1**（+ S-2 と連動）   |
| 2 (b)    | getBoughtItemsForPantry 再設計・expiresAt / storedLocation | **S-4**（+ S-5 / S-6）    |
| 3 (c)    | 冪等性・部分失敗・二重追加防止・ADR 化可否                 | **S-3**                   |
| 4 (d)    | 在庫テーブル設計・FK 方針                                  | **S-2** / **D-8**         |
| 5 (e)    | calculateRequiredAmount / findByProduct の含有可否         | **S-11**                  |
| 6        | Quantity.subtract() の負値挙動                             | **S-7**                   |
| 7        | actualPrice = 0 と PriceRecord 正数チェックの矛盾          | **S-8**                   |
| 8        | requiredAmount = null 品目の価格記録                       | **S-9**                   |
| 9        | CompleteShoppingUseCase の配置・assertActive のマッピング  | **D-1**（+ S-3 内で詳述） |
| 10       | 価格記録ループの N+1                                       | **D-5** / §性能           |

---

### S-1: Pantry シングルトンの表現・初回未作成時・GetPantry の応答（要件 6-a）【提案・要ユーザー確認】

**論点**: 既存 4 リポジトリに前例のない「引数なし `find()`」を導入するか、固定 `PantryId` +
`findById` に統一するか。初回未作成時（自動作成 / シード / null 許容ガード）と GetPantry の
応答（空 Pantry 200 / 404）も本論点に含む。

| 観点             | 案 A: 常在モデル（推奨）                                                                                                       | 案 B: 固定 PantryId + findById 統一                                        | 案 C: lazy create + null 許容                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| IF               | `find(): Promise<Pantry>`（引数なし・**常に非 null**）                                                                         | `findById(id): Promise<Pantry \| null>`（定数 ID を毎回渡す）              | `find(): Promise<Pantry \| null>` + 呼び出し側で `?? Pantry.create()`         |
| 未作成時         | 「未作成」という状態が存在しない。在庫 0 件 = 空の Pantry として常に存在（S-2 の単一テーブル設計により Pantry 自体の行が不要） | 初回 null → lazy create。二重作成は固定 PK で防止                          | 初回 null → lazy create。**ID を `generate()` すると同時実行で 2 行できる穴** |
| GetPantry        | 常に 200（空なら `stocks: []`）                                                                                                | null 時の分岐（空 DTO 200 or 404）が別途必要                               | 同左                                                                          |
| シード           | 不要                                                                                                                           | 不要（lazy）または起動時シード                                             | 不要（lazy）                                                                  |
| 既存パターン整合 | IF は新形だが、「単一世帯にちょうど 1 つ」というドメインの真実を型で表現できる                                                 | 既存 findById 形を維持できるが、呼び出し側全員が定数 ID を知る儀式が増える | find() 形は草案どおりだが null ハンドリングが全 UseCase に散る                |

**推奨: 案 A（常在モデル）**。理由: (1) S-2 の単一テーブル設計（pantries 行を持たない）と
組み合わせると「Pantry が DB に存在しない」という状態自体が消滅し、null 分岐・lazy create の
競合・シードのすべてが不要になる。3 案のうち唯一、初回未作成問題を**解かずに消せる**。
(2) `PantryId` は Domain 内の固定定数 `PantryId.singleton()`（値は `'00000000-0000-0000-0000-000000000000'`。
DB にも API 契約にも現れない、集約の同一性表現のためだけの ID）とし、`Pantry.create()` /
`reconstruct()` パターンは維持する。(3) GetPantry は常に 200 で空配列を返せる。「未作成」は
ユーザーにとって意味のない内部状態であり、404 で露出すべきでない（Unit B は常に一覧画面を
描画できる）。

**案 B/C を選ぶ場合の差分**: `pantries` テーブル（1 行）が必要になり S-2 は 2 テーブル案に
変わる。GetPantry の null 分岐（空 DTO を返す案を推奨）と lazy create の二重作成防止
（案 B は固定 PK・案 C は追加の防衛策）が必要。

---

### S-2: 在庫テーブル設計 — stocks 単一テーブル（要件 6-d）【提案・要ユーザー確認】

**論点**: `pantries` + `stocks` の 2 テーブルか、`stocks` 単一テーブルか。

| 観点                | 案 A: stocks 単一テーブル（推奨）                                                                     | 案 B: pantries + stocks 2 テーブル                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 親行の状態          | Pantry 自体は固有状態を持たない（id 以外に属性なし）ため、親行に入れるものがない                      | `pantries(id, created_at)` の 1 行。状態がないのに行だけある                     |
| S-1 との整合        | 「常在モデル」が自然に成立（全 stocks = Pantry）                                                      | 親行の有無 = 未作成状態が発生し、S-1 案 B/C が必要になる                         |
| 先例との対応        | `shopping_lists + shopping_items` は**親が status / 日付を持つ**から 2 テーブル。前提が違う           | 先例の形には近いが、親に実質データがない点で先例の判断根拠（親の独立状態）を欠く |
| Phase 2（複数世帯） | `stocks.pantry_id` カラムの後方互換的追加で対応可能（認証導入時にどのみち全テーブル横断の改修になる） | 最初から対応形                                                                   |

**推奨: 案 A（stocks 単一テーブル）**。親テーブルは「1 行しか入らない・列が id と created_at
しかない」空箱になるため YAGNI。Repository は「stocks 全行 → `Pantry.reconstruct()`」で常に
Pantry を復元でき、S-1 の常在モデルを最小コストで成立させる。

```typescript
// packages/infrastructure/src/db/schema.ts（追記分・S-2 案 A 前提）
export const stocks = pgTable(
  'stocks',
  {
    id: text('id').primaryKey(),
    productId: text('product_id'), // null 許容・FK なし（集約またぎ ID 参照。D-8 / S-5）
    displayName: text('display_name').notNull(), // S-5: 表示名を Stock 自身が保持
    amountValue: numeric('amount_value', { precision: 10, scale: 3 }).notNull(), // 既存 quantity 系と同精度
    amountUnit: text('amount_unit').notNull(),
    purchasedAt: timestamp('purchased_at').notNull(), // FIFO 順序の基準（同日複数回の買い物も順序保持）
    expiresAt: date('expires_at'), // null 許容（S-4）。date 型・ローカル日付整形（S-10/JST 先例）
    storedLocation: text('stored_location'), // null 許容（S-4）。'fridge' | 'freezer' | 'pantry'
    sourceShoppingItemId: text('source_shopping_item_id').unique(),
    // ↑ 買い物完了による自動追加の由来 ShoppingItem。FK なし（D-8）。
    //   UNIQUE = 「1 bought 品目 : 最大 1 Stock」不変条件（S-3 の二重追加防止の最終防衛線）。
    //   PostgreSQL の UNIQUE は NULL 同士を重複とみなさないため、手動追加等（将来）の null 行は複数共存可
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('stocks_product_id_idx').on(table.productId)],
);
```

**設計注記**:

- `stocks_product_id_idx` は Unit C の `findByProduct` 相当と一般参照経路を先行カバーする
  （インデックスのみの先行は実装コストほぼゼロで、S-11 の非実装判断と矛盾しない）
- enum 系（stored_location）は text（D-2。pgEnum 不使用の既存先例）
- `created_at` は Domain にマッピングしない（`planned_recipes.created_at` と同じ扱い）
- マイグレーション: schema.ts 追記 → `drizzle-kit generate` → `migrate`。既存テーブル変更なし

**案 B を選ぶ場合の差分**: `pantries(id text PK, created_at)` を追加し
`stocks.pantry_id text NOT NULL REFERENCES pantries(id) ON DELETE CASCADE` を持たせる。
S-1 は案 B/C（lazy create）に変わり、GetPantry の null 分岐が復活する。

---

### S-3: 買い物完了の冪等性・保存順序・部分失敗・Stock 二重追加防止（要件 6-c・**本ユニットの核**）【提案・要ユーザー確認】

ADR-0006（Generate 冪等）を直接の先例とし、同じ 3 部構成（再実行セマンティクス・保存順序に
よる自己修復・UNIQUE による最終防衛）で設計する。

#### (1) 2 回目の呼び出し（既に completed）のセマンティクス

| 案  | 内容                                             | 評価                                                                                                          |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| B2  | 冪等成功（現状の ShoppingListDto を 200 で返す） | **推奨**。ADR-0006 (b) 案 B2 と同一の理由: リトライ・誤操作・2 人同時操作に安全。完了ボタンの二度押しが最典型 |
| B1  | エラー（`InvalidShoppingListStateError` 422）    | リトライに弱い。部分失敗の修復経路（下記）も失われる                                                          |

**推奨: B2（冪等成功）**。冪等パスでは後述の MealPlan 遷移修復のみ行い、Stock 追加・価格記録は
再実行しない（completed への到達 = ステップ 3 まで完了済みの証明。下記の順序設計による）。

**`assertActive` のマッピング方針（指示論点 9 後半）**: `ShoppingListStatus` は
`'active' | 'completed'` の 2 値のみであり、冪等案では completed を入口で先に分岐するため、
**`complete()` の `assertActive` には到達しない**（呼ぶのは active 確認後のみ）。したがって
本 UseCase では `InvalidShoppingListStateError` への変換コードは不要（onError の既存 422 分岐は
そのまま・追加変更なし）。案 B1 を選ぶ場合のみ、MarkAsBought 先例どおり入口で
`new InvalidShoppingListStateError(list.status, 'complete')` を投げる形になる。

#### (2) 保存順序と部分失敗の自己修復

4 段階の保存順序は次のとおり（**この順序自体が確定対象**）:

```
(1) Pantry へ Stock 追加 → pantryRepo.save
(2) 価格記録 → productRepo.save（unique な productId ごと）
(3) shoppingList.complete() → shoppingListRepo.save   ← 冪等ガードの「コミットポイント」
(4) MealPlan を cooking へ遷移 → mealPlanRepo.save
```

途中失敗と再実行の収束（非トランザクション。現行 Repository 構成の踏襲・ADR-0006 と同じ）:

| 失敗点          | 再実行時の挙動                                                                                                                 | 収束                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| (1) の途中/直後 | status は active のまま → 全段を再実行。追加済み Stock は `sourceShoppingItemId` で検出しスキップ（下記 (3)）                  | ✔                                                                                           |
| (2) の途中/直後 | status は active のまま → 全段を再実行。Stock はスキップされるが、**記録済みの価格が重複记録される窓がある**（後述）           | △（完了状態へは到達するが、価格記録は非冪等。再実行のたびに重複が累積し、自己修復されない） |
| (3) の直後      | completed → 冪等パスへ。MealPlan 遷移のみ修復して成功を返す。※直前の実行で記録済みの価格はそのまま確定する（重複があれば残る） | ✔                                                                                           |
| (4) の失敗      | 同上（冪等パスの修復で収束）                                                                                                   | ✔                                                                                           |

completed 保存（ステップ 3）を「これより前は再実行対象・これより後は修復のみ」の境界に置く。
ADR-0006 の「ShoppingList 生成 → MealPlan 遷移」順と同じ構図で、**後段の失敗ほど軽い修復で
収束する**ように依存の重い操作を前に置いている。

**用語定義**: 本設計の「収束」は"再実行により完了状態に到達し、以後の再実行が無副作用になる"
ことを指す。ADR-0006 の完全な自己修復（残留副作用ゼロ）とは異なり、価格記録のみ残留副作用
（重複）があり得る。完全一致が必要なら案 A（下記 (4)）を選ぶこと。

#### (3) Stock 二重追加の防止

`Stock` に `sourceShoppingItemId: ShoppingItemId | null`（由来 bought 品目の ID 参照）を持たせ、
二段で防止する:

1. **アプリ層の事前スキップ**: 再実行時、`pantry.hasStockFromShoppingItem(item.id)` が true の
   品目は `addStock` しない（Pantry 集約のドメインメソッドとして実装）
2. **DB の最終防衛**: `stocks.source_shopping_item_id` UNIQUE（S-2）。同時実行で両者が事前
   チェックをすり抜けても後着の save が UNIQUE 違反で失敗し、リトライで収束する
   （ADR-0006 の `meal_plan_id` UNIQUE と同型）

#### (4) 価格記録の重複窓の扱い

| 案  | 内容                                                                                                                                                                        | 評価                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A   | `price_records` にも `source_shopping_item_id`（null 許容）+ UNIQUE を追加し完全自己修復                                                                                    | 全段が重複なしで収束する。ただし既存テーブルの変更 + `PriceRecord`（Product 集約）のドメイン変更 + 既存 Repository/Mapper 改修とスコープが広がる                                                                                                             |
| B   | `stocks` のみ防止し、価格記録の非冪等性（ステップ 3 の保存だけが失敗した場合の再実行で重複し得る）は許容                                                                    | **推奨**。窓は (2) で最初の `productRepo.save` 成功後〜(3) の保存成功前の任意の失敗。リトライ失敗の繰り返しで重複が累積し得る。重複しても `cheapestStoreAt` は店舗ごと最新 1 件を見るため判定は変わらず、`averagePrice` が徐々に歪む。既存集約に手を入れない |
| B'  | スキーマ変更なし。`observedAt` を `new Date()` でなく決定的な値（例 shoppingDate）にし、記録前に「同一 storeId + observedAt の既存レコードあり → スキップ」をアプリ層で判定 | Domain への問い合わせ追加とヒューリスティック重複判定を持ち込むため推奨しない（中間案として併記のみ。推奨は案 B のまま）                                                                                                                                     |
| C   | complete 保存を先頭に移し、価格記録・Stock 追加を後置                                                                                                                       | 後段失敗の再実行が冪等パスに吸われ、**Stock・価格が黙って欠落**する。データ損失であり不採用                                                                                                                                                                  |

**推奨: 案 B**。守るべき優先順位は「在庫量の正しさ（Unit C の在庫引き算の基礎）＞価格履歴の
統計精度」であり、致命側（Stock 重複）だけを DB 保証し、軽微側（価格記録の非冪等性）はリスク
として受容し登録する（§リスク R-2）。案 A はユーザーが完全収束を求める場合の代替として明記する。

#### (5) ADR 化の推奨

**ADR 化を推奨する（可）**。「買い物完了の冪等性・4 段保存順序・`source_shopping_item_id`
UNIQUE による Stock 二重追加防止・価格記録の非冪等性の許容（完了状態は収束・価格履歴は
成功 1 回分と一致しない可能性を受容）」は ADR-0006 と対をなす恒久判断であり、
S-3 確定後に `ADR-0007-complete-shopping-idempotent.md`（仮）として記録する
（作成はレビュー/確定フェーズ。本書では候補提起のみ）。

---

### S-4: `getBoughtItemsForPantry()` の再設計形と不足情報の補い方（要件 6-b）【提案・要ユーザー確認】

**論点 (i)**: bought 品目の抽出を Domain 集約メソッドにするか、Application 層のフィルタにするか。

| 案  | 内容                                                                                               | 評価                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `ShoppingList.getBoughtItemsForPantry(): BoughtItemForPantry[]`（草案どおり）                      | ShoppingList が **Pantry の入力型（AddStockInput 相当）を知る**ことになり、集約間の知識リークが生じる。ShoppingList のコード変更も必要                                                                                                                                                         |
| B   | Application 層で `shoppingList.items.filter((item) => item.isBought())` + `AddStockInput` への変換 | **推奨**。`isBought()` は実装済みで、bought 品目の `actualPrice`/`actualStore` 非 null 不変条件も成立済み（要件 §5-1）。「集約 A の出力 → 集約 B の入力」の変換は集約またぎオーケストレーションの一部であり UseCase の責務（`.claude/rules/domain-layer.md`）。**ShoppingList 集約は変更ゼロ** |

**推奨: 案 B**。専用 Domain メソッドは「bought の抽出」という 1 行のフィルタに名前を付ける
だけで、戻り値型が Pantry 設計に依存する（S-8 で先送りした理由そのもの）。変換ロジックは
CompleteShoppingUseCase の private メソッド `toAddStockInput(item)` に閉じ込める。
`docs/04-domain-model.md` の擬似コード（`getBoughtItemsForPantry()`）からの逸脱になるため
S とする（確定後に同ドキュメントを同期）。

**論点 (ii)**: Stock 生成に要るが ShoppingItem が持たない `expiresAt` / `storedLocation` の補い方。

| 案  | 内容                                 | 評価                                                                                                                   |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| α   | **null 許容（未設定）**              | **推奨**。買い物完了時点で分からない情報を分からないまま持つ。「値なしは null」の規約と整合。捏造がない                |
| β   | Product にデフォルト値を持たせて補完 | Product へのカラム追加（defaultExpiryDays / defaultLocation 等）が必要でスコープ拡大。登録運用も MVP1 では現実的でない |
| γ   | 完了 API でユーザー入力を受ける      | 品目数十件 × 2 項目の入力を完了操作に要求することになり、「帰宅後にワンタップで完了」という UX を破壊する              |

**推奨: 案 α**。`Stock.expiresAt: Date | null` / `Stock.storedLocation: StorageLocation | null`
とする。草案（storedLocation 非 null）からの型変更を含むため S。値の後付け（在庫編集操作）は
Unit B / Phase 2 の検討事項として申し送る。

---

### S-5: Stock の `productId` null 許容 + `displayName` 保持（設計フェーズで顕在化）【提案・要ユーザー確認】

**論点**: 草案の `Stock.productId: ProductId`（非 null）のままでは、`productId = null` の
bought 品目（Product 未紐付け。S-3〈shopping-list〉の「productRef 引き継ぎのみ」方針下では
多数派になり得る）を在庫化できない。また Stock が名前を持たないと、在庫一覧（Unit B）は
Product を引かないと表示できず、null 品目は表示不能になる。

| 案  | 内容                                                                   | 評価                                                                                                    |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| A   | `productId: ProductId \| null` + `displayName: string` を Stock に追加 | **推奨**。買ったものはすべて在庫化される。一覧表示が Stock 単体で完結（Product への N+1 lookup も不要） |
| B   | productId = null の品目は在庫化しない                                  | 買った品目が黙って在庫から欠落する。S-5〈shopping-list〉で案 γ（サイレント欠落）を退けた判断と矛盾      |
| C   | 完了時に Product を自動作成して紐付ける                                | 名寄せ運用（aliases 手動管理）を汚染するゴミ Product が量産される。S-3〈shopping-list〉の確定判断と衝突 |

**推奨: 案 A**。`displayName` は `ShoppingItem.displayName` をコピーする（Product 紐付きなら
将来 Product 名との同期問題があるが、「買った時の名前」のスナップショットとして正当）。
草案からのドメインモデル変更のため S。なお Unit C の在庫引き算は productId 非 null の Stock
のみを対象にすれば成立する（S-11 の申し送りに含める）。

---

### S-6: `requiredAmount = null`（amountNote のみ）の bought 品目の Stock 量【提案・要ユーザー確認】

**論点**: `Stock.amount: Quantity` は非 null（消費操作の対象）だが、「塩 適量」のような
amountNote のみの品目には購入量情報がない。

| 案  | 内容                                     | 評価                                                                                                                                    |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `Quantity.of(1, '個')`（1 点）として登録 | **推奨**。「量はざっくりでも OK」という Pantry の設計思想（`docs/04-domain-model.md` §設計ポイント）に整合。全量消費/廃棄で自然に消える |
| B   | Stock 追加をスキップ                     | 買った品目のサイレント欠落（S-5 案 B と同じ理由で不採用）                                                                               |
| C   | `Stock.amount: Quantity \| null` を許容  | consume の意味論（null から減らす？）が壊れ、Domain・DTO・Unit B すべてに null 分岐が波及する                                           |

**推奨: 案 A**。「1 点」という解釈は不正確だが、無害（消費は手動・ざっくり運用）かつ欠落より
良い。単位 `'個'` は既存 `Unit` 17 値に含まれる。値の捏造を含む判断のため S。

---

### S-7: `Quantity.subtract()` の負値時挙動と過剰消費の扱い（要件 §5-5 追加論点）【提案・要ユーザー確認】

**論点 (i)**: 共有 VO への `subtract()` 追加。負値になる減算をどう振る舞わせるか。

| 案  | 内容                                   | 評価                                                                                                                               |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A   | 負値で throw（`Quantity.of` に委ねる） | **推奨**。`add()` と対称の 3 行実装。「Quantity は非負」という既存不変条件（`of()` が負値 Error）と完全整合。VO の数学的意味が素直 |
| B   | 0 にクランプ                           | 呼び出し側が損失を検知できない。共有 VO（Recipe / Product / ShoppingList も利用）に暗黙のドメインルールを埋め込むことになる        |

```typescript
// 案 A の実装形（add と同文型。単位不一致は throw、負値は Quantity.of が throw）
subtract(other: Quantity): Quantity {
  if (this.quantityUnit !== other.quantityUnit) {
    throw new Error('Cannot subtract different units');
  }
  return Quantity.of(this.quantityValue - other.quantityValue, this.quantityUnit);
}
```

**論点 (ii)**: 消費量 > 在庫量のときの `ConsumeStock` の振る舞い。

| 案  | 内容                                         | 評価                                                                                                                                           |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| α   | `Stock.consume` が全量消費にクランプ（残 0） | **推奨**。「300g 使った（実際の在庫は 200g）」は「あるだけ使った」が実態。エラーで弾くと正確な残量確認をユーザーに強いる（ざっくり運用と矛盾） |
| β   | エラー（422）                                | 在庫量の入力が概算である以上、頻発する正常系をエラーにしてしまう                                                                               |

**推奨: 案 A + 案 α の組み合わせ**。クランプは共有 VO ではなく `Stock.consume()`（Entity の
ドメインルール）に置く: `消費量 >= 現在量 なら amount = Quantity.of(0, unit)、それ以外は
subtract()`。VO は厳格・Entity が業務ルールを持つ、という責務分離。共有 VO 変更 +
`docs/04-domain-model.md` の Unit C 向け記述（「負になったら 0 を返す」= クランプ想定）との
方針すり合わせを含むため S（Unit C は `subtract` 厳格化を前提に、引き算前の大小比較で 0 を
返す実装になる旨を申し送る）。

既存利用箇所への影響: `Quantity` の既存利用は `of` / `multiply` / `add` のみ（Recipe / Product /
ShoppingList / MealPlan）。`subtract` は純追加であり**既存コードへの影響なし**。

---

### S-8: `actualPrice = 0`（無料品）の価格記録（要件 §5-2 ギャップ 2）【提案・要ユーザー確認】

| 案  | 内容                                                 | 評価                                                                                                                    |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A   | 価格記録をスキップ（Stock 追加は行う）               | **推奨**。0 円は「価格比較」のデータとして有害（unitPrice 0 がその店を恒久的に最安と誤認させ `cheapestStoreAt` を破壊） |
| B   | エラーにする                                         | 無料品の markAsBought は既存 API で正当に可能。完了操作全体が 1 品目のために失敗するのは本末転倒                        |
| C   | `PriceRecord.create` の正数チェックを 0 許容に緩める | 既存 Product 集約の不変条件の変更。最安判定の意味論を壊す（案 A の理由と同じ）                                          |

**推奨: 案 A（スキップ）**。要件書が「要ユーザー確認候補」と明示した論点のため S。
スキップはサイレントだが、失われるのは分析用の 1 レコードのみで在庫・完了処理には影響しない。

---

### S-9: `requiredAmount = null` 品目の価格記録と packageSize 転用の妥当性（要件 §5-2 ギャップ 1）【提案・要ユーザー確認】

| 案  | 内容                                                              | 評価                                                                                                                                                                      |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `requiredAmount` を `packageSize` に転用して記録。null はスキップ | **推奨**。requiredAmount は「必要量」であり「購入パッケージ量」と厳密には別物だが、MVP1 の価格傾向把握には近似として十分。null は算出根拠がなくスキップ以外に選択肢がない |
| B   | 価格記録は全品目スキップ（手動 RecordPrice に完全に委ねる）       | roadmap の「買い物完了で価格履歴が貯まる」価値を放棄する。手動記録は続かない                                                                                              |
| C   | 完了 API で購入量の入力を受ける                                   | S-4 案 γ と同じ理由（完了操作の UX 破壊）で不採用                                                                                                                         |

**推奨: 案 A**。スキップ条件を次のとおり確定する（すべて「その品目の価格記録のみスキップ。
Stock 追加・完了処理は続行」）:

1. `productId === null`（記録先の Product がない）
2. `actualPrice.amount <= 0`（S-8）
3. `requiredAmount === null` または `requiredAmount.value <= 0`（packageSize が導出できない /
   `PriceRecord.create` の正数チェックに反する）
4. `UnitPriceCalculator.calculate()` の結果が `amount <= 0`（超安価 × 大容量で丸め 0 になる
   防御的ガード。`PriceRecord.create` の unitPrice 正数チェック対策）
5. `productRepo.findById` が null（削除済み Product。D-8〈shopping-list〉の精神で止めない）

「requiredAmount = packageSize 転用は近似である」ことの許容自体が判断のため S。

---

### S-10: 消費・廃棄の `reason` と履歴の永続化【提案・要ユーザー確認】

**論点**: 草案・要件は `consumeStock(…, reason: ConsumptionReason)` / `discardStock(…, reason:
string)` を持つが、履歴テーブルがない現構成では **reason はどこにも永続化されず消える**
（Stock 行は減量または削除されるのみ）。受け取って捨てる入力は契約として不誠実。

| 案  | 内容                                                    | 評価                                                                                                                                                                                    |
| --- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | MVP1 では reason を受け取らない（API・Domain から除外） | **推奨**。YAGNI。「使った/捨てた」の区別は**操作（エンドポイント）自体**で表現されており、分析基盤（履歴永続化）は Phase 2 の食材ロス分析と同時に `stock_events` 相当を設計するのが一貫 |
| B   | reason を受けるが永続化しない                           | 意味のない入力を契約に固定し、Phase 2 で意味が変わる（保存され始める）という暗黙の互換性問題を仕込む                                                                                    |
| C   | `stock_events` 履歴テーブルを今実装                     | L3 スコープのさらなる拡大。Phase 2 の分析要件が固まっていない今作ると作り直しになる公算                                                                                                 |

**推奨: 案 A**。要件書 §3-3 の Input 定義（reason を含む）からの逸脱になるため S。
`ConsumptionReason` 型も本ユニットでは導入しない（Phase 2 で履歴とともに設計）。

---

### S-11: `calculateRequiredAmount` / `findByProduct` / `findExpiringSoon` の含有可否（要件 6-e）【提案・要ユーザー確認】

| 案  | 内容                     | 評価                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | 本ユニットでは実装しない | **推奨**。実利用者は Unit C（在庫引き算）/ Phase 2（期限アラート）。`calculateRequiredAmount` は切り上げルール（`docs/04-domain-model.md` 論点 3。Unit C で確定）に依存し、今作ると未確定仕様のまま凍結される。S-8〈shopping-list〉で `getBoughtItemsForPantry` を先送りした判断（利用側の設計に依存する型は先に固めない）と同型 |
| B   | 3 メソッドとも今実装     | Unit A/C 間の整合コストは減るが、検証不能なロジック（利用者なし）をテスト込みで先行実装することになり YAGNI に反する                                                                                                                                                                                                             |

**推奨: 案 A**。Pantry への後方互換的なメソッド追加は容易（`findByProduct` は数行 +
`stocks_product_id_idx` は S-2 で先行配置済み）。**Unit C への申し送り**: (1) `findByProduct`
は productId 非 null の Stock のみ対象・purchasedAt 昇順（FIFO）。(2) `subtract` は負値 throw
（S-7）のため、`calculateRequiredAmount` は引き算前に大小比較して 0 を返す実装にする。
(3) 切り上げルールは Unit C 設計で確定。

---

### D-1: CompleteShoppingUseCase の配置と API パス（指示論点 9）

`packages/application/src/shopping-list/complete-shopping.use-case.ts` に配置し、API は
`POST /api/shopping-lists/:id/complete`（既存 `routes/shopping-lists.ts` へ追記）とする。
**理由**: (1) 操作の主語は ShoppingList（完了させる対象）であり、入口エラー・冪等判定・
戻り値（ShoppingListDto）がすべて shopping-list の語彙。(2) Generate（3 集約またぎ）が
shopping-list 側に置かれた先例と一致。(3) REST 的にも `/:id/complete` は既存のアクション
エンドポイント（`/:id/items/:itemId/bought` 等）と同型。
**別案（pantry 側配置）の差分**: `application/src/pantry/` に置き `POST /api/pantry/...` と
する案は、「在庫が増える」副作用を主語にする見方だが、ShoppingList の状態遷移 API が pantry
配下にある方が発見性・契約の一貫性で劣るため不採用。

### D-2: 型・VO の表現（既存先例準拠）

- `StorageLocation = 'fridge' | 'freezer' | 'pantry'` はプレーン文字列 union
  （`ItemStatus` / `MealPlanStatus` 先例。VO クラス化しない）
- `PantryId` / `StockId` は `generate()` / `fromString()` / `equals()` / `value` の 4 点セット。
  `PantryId` のみ `singleton()`（固定値を返す static）を追加（S-1）。`PantryId.generate()` は
  作らない（シングルトンに採番の概念がないため）
- DB の enum 系カラムは text、復元は網羅 switch（`toMealPlanStatus` 先例。未知値 throw）

### D-3: Consume / Discard の戻り値は更新後 `PantryDto`

`void` や `StockDto | null` ではなく更新後の全在庫を返す。**理由**: 消費で Stock が消える
ケース（残量 0 → 削除）を「null を返す」で表現するより、一覧の最新状態を返す方が契約が単純で、
Unit B（在庫一覧画面）が TanStack Query のキャッシュをレスポンスで直接置換できる（D-5
〈shopping-list〉の「更新後 DTO を返す」先例の拡張）。在庫は高々数十件で全量返却のコストは無視できる。
**別案の差分**: `StockDto | null` を返す案はペイロード最小だが、削除の表現と Unit B 側の
キャッシュ手動更新が複雑になる。

### D-4: 完了時の MealPlan 遷移の防御的修復

ステップ 4 は次のガード付きで行う（`transitionTo` は許可外遷移で throw するため素で呼ばない）:

- `mealPlanRepo.findById` が null → **遷移をスキップして完了を成功させる**（ShoppingList は
  必ず実在 MealPlan から生成され、MealPlan に削除 API はないため実運用で到達不能。到達した
  場合も「買い物は完了している」事実を優先し、404 で完了操作を失敗させない。C-4 の
  「参照先の不存在でシステムを止めない」精神）
- `status === 'draft'`（Generate の部分失敗が未修復のまま完了に到達した場合）→
  `transitionTo('shopping')` → `transitionTo('cooking')` の二段遷移で修復
- `status === 'shopping'` → `transitionTo('cooking')`
- 上記以外（cooking 以降）→ 何もしない（再実行・修復済みケース）

この判定は冪等パス（S-3 (1)）の修復でも同一のロジックを使う（private メソッド共有）。

### D-5: 価格記録ループの N+1 の扱い（指示論点 10）

素朴な実装（bought 品目ごとに `productRepo.findById` + `save`）は、同一 Product に複数品目が
あると同じ集約を複数回 load/save する N+1 になる。本設計では **unique な productId で
グルーピングし、Product 1 件につき findById 1 回・（当該 Product の全 PriceRecord を追加後）
save 1 回**とする。それでも Product 数ぶんのループは残るが、MVP1 の規模（買い物 1 回 =
bought 品目数十件・unique Product はそれ以下・実行頻度は週 1 回）では往復数十回の PK 検索 +
保存であり許容する（D-4〈shopping-list〉「findById ループで MVP1 規模なら十分」と同じ
スケール判断）。将来ボトルネック化した場合の改善方針は `findByIds` の後方互換的追加
（同設計書 D-4 の申し送りと同一の進化パス）。

### D-6: 消費量の契約制約

`consumeStockSchema.amount.value` は `z.number().positive()`（0 を reject）。消費量 0 は
無操作であり、要件 §7-3 の境界条件「意味があるか要確認」への回答として契約層で弾く
（`Quantity.of(0)` は Domain では合法のため、これは意味論でなく入力ミス防止の形式制約）。
`amount.unit` は既存 `unitSchema`（recipe.schema.ts）を再利用する。

### D-7: `PantryDto` に Pantry の id を含めない

`PantryDto = { stocks: StockDto[] }`。PantryId は固定定数（S-1）でクライアント操作の
キーになる経路が存在せず、露出は情報ゼロのノイズのため含めない。将来複数世帯化（Phase 2）で
必要になれば後方互換的に追加できる。

### D-8: 集約またぎ ID 参照に FK を張らない

`stocks.product_id` / `stocks.source_shopping_item_id` に FK を張らない。
**理由**: shopping-list D-6・meal-plan C-4 の確定先例（集約またぎは ID 参照のみ・FK なし・
不変条件は UNIQUE で担保）にそのまま倣う。Product 削除時に在庫を道連れにしない
（displayName を Stock が持つため表示も壊れない。S-5）。

---

## 現状構成

- **Domain**: recipe / product / store / meal-plan / shopping-list 集約が実装済み。
  `packages/domain/src/pantry/` は存在しない
- **共有 VO**: `Quantity`（`of` / `multiply` / `add`。**`subtract` なし** — 実コードで確認済み）、
  `Money`（0 以上許容）、`Unit`（17 値 union・`'個'` を含む）
- **確認済みの既存事実**（要件書 §5 を実ファイルで再確認）:
  - `ShoppingList.complete()` 実装済み（`assertActive` → throw、副作用は status 変更のみ）。
    `getBoughtItemsForPantry()` は不在。`ShoppingItem.isBought()` あり。bought 品目は
    `actualPrice` / `actualStore` 必ず非 null（markAsBought のシグネチャで保証）
  - `Product.recordPrice(record)` 実装済み。`PriceRecord.create` は price / unitPrice /
    packageSize すべて**正の値のみ**許容（0 で Error）。`UnitPriceCalculator.calculate` は
    100g/100ml 換算 + 小数 1 位丸め（丸めで 0 になり得る → S-9 条件 4）
  - `MealPlan.transitionTo`: `shopping → cooking` 許可・`draft → cooking` は**不許可**（D-4 の
    二段遷移修復の根拠）
  - `app.ts` onError に `ShoppingListNotFoundError`(404) / `InvalidShoppingListStateError`(422)
    が既にマッピング済み（本ユニットでの新規追加は pantry 系エラーのみ）
  - 単一集約 `find()` の前例なし（既存 4 Repository はすべて ID/条件付き検索）
- **Infrastructure**: schema.ts に stocks / pantries 相当なし。
  `drizzle-shopping-list.repository.ts` に「LEFT JOIN 復元 + upsert + NOT IN DELETE」の
  子テーブル同期パターンあり（DrizzlePantryRepository の参照実装）
- **Presentation**: `routes/shopping-lists.ts` は手動 DI ファクトリ関数 + zValidator +
  `POST /:id/...` アクションエンドポイントのパターン

## 変更後構成

### 新規作成ファイル

```
packages/domain/src/pantry/
├── pantry-id.ts               # PantryId（4 点セット + singleton()。S-1 / D-2）
├── stock-id.ts                # StockId（4 点セット）
├── pantry.ts                  # Pantry 集約 + Stock + StorageLocation + AddStockInput
├── pantry.repository.ts       # PantryRepository IF（find(): Promise<Pantry> / save）
├── pantry-id.test.ts
├── stock-id.test.ts
└── pantry.test.ts

packages/application/src/pantry/
├── pantry.dto.ts              # PantryDto / StockDto / 各 InputDto
├── pantry.mapper.ts           # toPantryDto / toStockDto
├── stock-not-found.error.ts
├── invalid-stock-operation.error.ts
├── consume-stock.use-case.ts
├── discard-stock.use-case.ts
├── get-pantry.use-case.ts
├── pantry-use-cases.test.ts
└── index.ts

packages/application/src/shopping-list/
├── complete-shopping.use-case.ts        # 4 集約またぎ（D-1）
└── （complete-shopping のテストは既存 shopping-list-use-cases.test.ts へ追加 or 単独ファイル。実装計画で確定）

packages/infrastructure/src/repositories/
├── drizzle-pantry.repository.ts
└── drizzle-pantry.repository.test.ts

packages/infrastructure/src/db/migrations/   # drizzle-kit 自動生成（stocks 追加）

packages/api-contract/src/
└── pantry.schema.ts                          # 詳細は contract-designer

apps/web/src/server/routes/
└── pantry.ts
```

### 既存ファイルへの追記・変更

| ファイル                                            | 変更内容                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/domain/src/shared/quantity.ts`            | `subtract()` 追加（S-7。純追加）+ テスト追加                                                                 |
| `packages/infrastructure/src/db/schema.ts`          | `stocks` テーブル定義を追記（S-2）                                                                           |
| `packages/infrastructure/src/index.ts`              | `DrizzlePantryRepository` の re-export 追加                                                                  |
| `packages/application/src/index.ts`                 | `export * from './pantry'` を追加                                                                            |
| `packages/api-contract/src/index.ts`                | `export * from './pantry.schema'` を追加                                                                     |
| `packages/api-contract/src/shopping-list.schema.ts` | 完了 API 用（追加が必要なのは param 再利用のみの見込み。§API 設計参照）                                      |
| `apps/web/src/server/routes/shopping-lists.ts`      | `POST /:id/complete` の追加（D-1）                                                                           |
| `apps/web/src/server/app.ts`                        | `pantryRoute` のマウント + `StockNotFoundError`(404) / `InvalidStockOperationError`(422) の onError 分岐追加 |

**既存の Recipe / Product / Store / MealPlan / ShoppingList の Domain コードには一切変更を
加えない**（S-4 案 B により ShoppingList も変更ゼロ。S-3 案 B により Product/PriceRecord も
変更ゼロ）。

## データフロー

### 層責務

| 層             | 責務                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Presentation   | Hono ルートで Zod 検証（形式のみ）→ 手動 DI → execute → DTO を JSON で返す                                                                              |
| Application    | CompleteShopping が 4 集約のオーケストレーション（bought 抽出・AddStockInput 変換・価格記録・complete・MealPlan 遷移・冪等/修復判定）。エラー変換は入口 |
| Domain         | Pantry / Stock が不変条件（正の初期量・消費クランプ・二重追加検知・削除規則）を保持。他パッケージ非依存                                                 |
| Infrastructure | DrizzlePantryRepository が stocks 全行 ⇔ Pantry 集約（reconstruct）の変換責任を持つ                                                                     |

### 買い物完了（中核フロー・4 集約シーケンス擬似コード）

```
POST /api/shopping-lists/:id/complete   （ボディなし）
  → Hono zValidator（param: id = uuid）
  → CompleteShoppingUseCase.execute({ shoppingListId })
      1. shoppingListRepo.findById
         └─ null → ShoppingListNotFoundError(404)
      2. 冪等ガード（S-3）: list.status === 'completed' なら
         ├─ repairMealPlanTransition(list.mealPlanId)   // D-4 の修復のみ
         └─ return toShoppingListDto(list)              // 200（Stock 追加・価格記録は再実行しない）
      3. boughtItems = list.items.filter((item) => item.isBought())   // S-4 案 B
      4. 【段階 1: Pantry】 pantry = pantryRepo.find()               // 常に非 null（S-1）
         for item of boughtItems:
           if (!pantry.hasStockFromShoppingItem(item.id)) {          // 再実行時の二重追加スキップ（S-3）
             pantry.addStock({
               productId: item.productId,                            // null 許容（S-5）
               displayName: item.displayName,                        // S-5
               amount: item.requiredAmount ?? Quantity.of(1, '個'),  // S-6
               purchasedAt: now,
               expiresAt: null,                                      // S-4 案 α
               storedLocation: null,                                 // S-4 案 α
               sourceShoppingItemId: item.id,                        // S-3 の冪等キー
             })
           }
         pantryRepo.save(pantry)          // stocks.source_shopping_item_id UNIQUE が最終防衛
      5. 【段階 2: Product 価格記録】 recordPrices(boughtItems)（D-5: unique productId でグルーピング）
         対象 = S-9 のスキップ条件 1〜5 をすべて通過した品目のみ:
           unitPrice = UnitPriceCalculator.calculate(item.actualPrice, item.requiredAmount)
           record = PriceRecord.create({ id: generate, storeId: item.actualStore,
                                         price: item.actualPrice, unitPrice,
                                         packageSize: item.requiredAmount, observedAt: now })
           product.recordPrice(record)
         productRepo.save(product)        // Product ごとに 1 回
      6. 【段階 3: ShoppingList】 list.complete()                    // active 確認済みのため throw しない
         shoppingListRepo.save(list)      // ← 冪等ガードのコミットポイント（S-3）
      7. 【段階 4: MealPlan】 repairMealPlanTransition(list.mealPlanId)   // D-4
         ├─ findById null → スキップ（完了を優先）
         ├─ 'draft'    → transitionTo('shopping') → transitionTo('cooking') → save
         ├─ 'shopping' → transitionTo('cooking') → save
         └─ その他     → 何もしない
      8. return toShoppingListDto(list)
  → 200 + ShoppingListDto（初回・冪等再実行とも 200。ADR-0006 の 201/200 分岐と異なり
     新規リソース作成の区別が不要なため常に 200）
```

bought 品目 0 件の場合はステップ 4・5 が空振りし、complete と MealPlan 遷移のみ行われる（正常系）。

### 在庫消費（平日の主操作）

```
POST /api/pantry/stocks/:stockId/consume   { amount: { value, unit } }
  → ConsumeStockUseCase.execute({ stockId, amount })
      1. pantry = pantryRepo.find()
      2. stock = pantry.stocks から stockId 検索 → なし → StockNotFoundError(404)
      3. amount.unit !== stock.amount.unit → InvalidStockOperationError(422)   // UseCase 入口の事前チェック
      4. pantry.consumeStock(StockId, Quantity.of(value, unit))
         └─ Stock.consume: 消費量 >= 現在量 → 0 にクランプ（S-7 案 α）→ isEmpty なら Pantry が Stock を削除
      5. pantryRepo.save(pantry) → toPantryDto(pantry)（D-3）
  → 200 + PantryDto
```

Discard は同型（unit チェックなし・対象 Stock を全量削除 → save → PantryDto）。
GetPantry は `pantryRepo.find()` → `toPantryDto` のみ（常に 200。S-1）。

## API 設計

エンドポイント案。HTTP メソッド・パスの最終確定と Zod 詳細は contract-designer。

| メソッド | パス                                  | UseCase                 | 正常                     | 異常                                  |
| -------- | ------------------------------------- | ----------------------- | ------------------------ | ------------------------------------- |
| POST     | `/api/shopping-lists/:id/complete`    | CompleteShoppingUseCase | 200 + ShoppingListDto ※1 | 400 / 404（List）                     |
| GET      | `/api/pantry`                         | GetPantryUseCase        | 200 + PantryDto（空可）  | —（404 なし。S-1）                    |
| POST     | `/api/pantry/stocks/:stockId/consume` | ConsumeStockUseCase     | 200 + PantryDto          | 400 / 404（Stock）/ 422（単位不一致） |
| POST     | `/api/pantry/stocks/:stockId/discard` | DiscardStockUseCase     | 200 + PantryDto          | 400 / 404（Stock）                    |

※1 冪等再実行時も 200（S-3。作成リソースの区別が不要なため 201/200 分岐は導入しない）。

### リクエスト/param スキーマ概要（Zod は形式検証のみ）

| スキーマ             | 主な検証項目                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| （完了 API）         | ボディなし。param は既存 `shoppingListIdParamSchema`（`id: z.uuid()`）を再利用                                 |
| `stockIdParamSchema` | `stockId: z.uuid()`                                                                                            |
| `consumeStockSchema` | `amount: { value: z.number().positive(), unit: unitSchema }`（D-6。unitSchema は recipe.schema.ts から再利用） |
| （discard API）      | ボディなし（S-10 で reason を除外）                                                                            |

### エラー → HTTP ステータス対応表

| エラー種別                            | 発生箇所                                                | HTTP | 処理                                                              |
| ------------------------------------- | ------------------------------------------------------- | ---- | ----------------------------------------------------------------- |
| ShoppingListNotFoundError（**既存**） | CompleteShopping                                        | 404  | app.ts onError（**既存分岐のまま**）                              |
| InvalidShoppingListStateError（既存） | （冪等案では CompleteShopping から**到達しない**。S-3） | 422  | 既存分岐のまま・変更なし                                          |
| StockNotFoundError（新規）            | Consume / Discard                                       | 404  | app.ts onError（追記）                                            |
| InvalidStockOperationError（新規）    | Consume（単位不一致）                                   | 422  | app.ts onError（追記）                                            |
| Zod バリデーション失敗                | Hono zValidator                                         | 400  | 既定処理                                                          |
| DB エラー / 未知（UNIQUE 違反含む）   | —                                                       | 500  | 既存 console.error + 500 JSON（S-3: UNIQUE 違反はリトライで収束） |

### 冪等性キー一覧（契約サマリ）

| 操作             | 冪等性                                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| CompleteShopping | **冪等**（キー: shoppingListId の completed 状態 + Stock 単位では `source_shopping_item_id` UNIQUE。S-3） |
| ConsumeStock     | **非冪等**（二重送信で二重減算。AddItem と同じ制約。Unit B の二重送信抑止に申し送り）                     |
| DiscardStock     | 実質冪等寄り（2 回目は対象消失で 404。副作用は増えない）                                                  |
| GetPantry        | 読み取りのみ                                                                                              |

## DB 設計

§S-2 の `stocks` テーブル定義（案 A・単一テーブル）を正とする。追加の対応表:

### DB 行 ⇔ ドメイン変換（DrizzlePantryRepository の責務）

| ドメイン                        | DB カラム                              | 変換                                                                                                          |
| ------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Pantry.id`                     | （永続化しない）                       | 復元時に常に `PantryId.singleton()` を与える（S-1 / S-2）                                                     |
| `stock.productId`               | `product_id` text \| null              | `ProductId.fromString`（null はそのまま）                                                                     |
| `stock.amount: Quantity`        | `amount_value` + `amount_unit`         | `Quantity.of(Number(v), toUnit(u))`（unit は網羅 switch。D-2）                                                |
| `stock.purchasedAt`             | `purchased_at` timestamp               | Date そのまま                                                                                                 |
| `stock.expiresAt: Date \| null` | `expires_at` date \| null              | 保存: ローカル日付整形（S-10〈shopping-list〉の JST 前日ずれ回避と同方式）。復元: `new Date(v + 'T00:00:00')` |
| `stock.storedLocation`          | `stored_location` text \| null         | 網羅 switch（'fridge' \| 'freezer' \| 'pantry'。未知値 throw）                                                |
| `stock.sourceShoppingItemId`    | `source_shopping_item_id` text \| null | `ShoppingItemId.fromString`（null はそのまま）                                                                |

### 永続化パターン

- `find()`: `SELECT * FROM stocks ORDER BY purchased_at ASC`（FIFO 表示順）→
  `Pantry.reconstruct({ id: PantryId.singleton(), stocks })`。**null を返さない**
- `save()`: 各 stock を upsert（ON CONFLICT (id) DO UPDATE。set 対象は amount_value のみ —
  他フィールドは不変だが set に含めても実害なし）→ `id NOT IN (currentIds)` の DELETE
  （0 件時は全 DELETE）。`drizzle-shopping-list.repository.ts` の子テーブル同期パターンを踏襲

## フロントエンド設計

対象外（Unit B `pantry-screens` のスコープ）。本設計は Unit B が使う API 契約と DTO
（PantryDto / StockDto / 完了 API）を提供するところまでを担う。

## バックエンド設計

### Domain 設計

#### PantryId / StockId

- `StockId`: ProductId パターン完全踏襲（`generate()` = randomUUID / `fromString` / `equals` / `value`）
- `PantryId`: `fromString` / `equals` / `value` + `static singleton(): PantryId`
  （固定値 `'00000000-0000-0000-0000-000000000000'`。`generate()` は持たない — D-2）

#### 型定義

```typescript
export type StorageLocation = 'fridge' | 'freezer' | 'pantry'; // D-2: プレーン union
```

（`ConsumptionReason` は S-10 により本ユニットでは導入しない。）

#### Stock（集約内エンティティ）

| フィールド           | 型                      | 不変条件                                                                      |
| -------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| id                   | StockId                 | 不変                                                                          |
| productId            | ProductId \| null       | 不変。集約またぎ ID 参照（S-5）                                               |
| displayName          | string                  | 不変・非空（create 入口で検証。S-5）                                          |
| amount               | Quantity                | create 時は正の値（`value <= 0` で throw）。consume で減少（0 クランプ。S-7） |
| purchasedAt          | Date                    | 不変。FIFO 順序の基準                                                         |
| expiresAt            | Date \| null            | 不変（S-4。編集操作は将来検討）                                               |
| storedLocation       | StorageLocation \| null | 不変（S-4。同上）                                                             |
| sourceShoppingItemId | ShoppingItemId \| null  | 不変。買い物完了由来なら非 null（S-3 冪等キー）                               |

```
Stock
  static create(input: CreateStockInput): Stock
    - displayName.trim() === '' → throw
    - amount.value <= 0 → throw（在庫は正の量で生まれる）
    - id = StockId.generate()
  static reconstruct(props: StockProps): Stock   // 検証なし・DB 復元専用

  consume(amount: Quantity): void
    - 単位不一致 → throw（Quantity.subtract に委ねる前に明示チェックしてメッセージを明確化してもよい。実装裁量）
    - amount.value >= 現在量 → this.amount = Quantity.of(0, unit)（S-7 案 α: 全量消費クランプ）
    - それ以外 → this.amount = this.amount.subtract(amount)
  isEmpty(): boolean   // amount.value === 0

  get id / productId / displayName / amount / purchasedAt(防御的コピー) /
      expiresAt(防御的コピー) / storedLocation / sourceShoppingItemId
```

（草案の `Stock.discard(reason)` は S-10 により持たない。削除は Pantry が行う。
`isExpired()` は Phase 2〈S-11〉まで実装しない。）

#### Pantry（集約ルート）

```
Pantry
  static create(): Pantry            // id = PantryId.singleton(), stocks = []（S-1）
  static reconstruct(props: PantryProps): Pantry

  addStock(input: CreateStockInput): StockId
    → Stock.create → push → id を返す
  consumeStock(stockId: StockId, amount: Quantity): void
    → 対象検索（未検出 throw Error('Stock not found')）→ stock.consume(amount)
    → stock.isEmpty() なら stocks から削除
  discardStock(stockId: StockId): void
    → 対象検索（未検出 throw）→ stocks から削除（残量に関わらず全量。部分廃棄なし = 要件どおり）
  hasStockFromShoppingItem(itemId: ShoppingItemId): boolean   // S-3 の再実行スキップ判定

  get id(): PantryId
  get stocks(): Stock[]              // 防御的コピー
```

**不変条件まとめ**: (1) Stock は正の量で生まれ（create 検証）、0 になったら集約から消える
（consumeStock の削除規則）。(2) 「1 bought 品目 : 最大 1 Stock」は集約単体では守れないため
UseCase（S-3 事前スキップ）+ DB UNIQUE の二段で保証する（ADR-0006 / S-6〈shopping-list〉と
同じ構図）。(3) Pantry はシステムに常にちょうど 1 つ（S-1 常在モデル + 単一テーブルで表現）。

Domain 内の throw は先例どおり汎用 `Error`（メッセージ判別）とし、Application 層で
エラークラスに変換する。

#### PantryRepository（Domain IF）

```typescript
export interface PantryRepository {
  /** 単一世帯の Pantry を返す。在庫 0 件でも空の Pantry を返す（null を返さない）。 */
  find(): Promise<Pantry>;
  save(pantry: Pantry): Promise<void>;
}
```

#### Quantity.subtract()（shared VO への追加・S-7）

§S-7 のコードのとおり。`add` と対称・負値は `Quantity.of` の既存検証に委ねる。純追加で
既存利用箇所への影響なし。

### Infrastructure 設計

`DrizzlePantryRepository`（`implements PantryRepository`）。§DB 設計の永続化パターン参照。
JOIN は不要（単一テーブル）で、既存 Repository 群より単純になる。

### Application 設計

#### DTO

```typescript
export type StorageLocation = 'fridge' | 'freezer' | 'pantry';

export interface StockDto {
  id: string;
  productId: string | null;
  displayName: string;
  amount: { value: number; unit: string };
  purchasedAt: string; // ISO 8601 datetime
  expiresAt: string | null; // ISO date "2026-07-11"（ローカル日付整形）
  storedLocation: StorageLocation | null;
}

export interface PantryDto {
  stocks: StockDto[]; // purchasedAt 昇順（FIFO）。D-7: pantry id は含めない
}

// 入力 DTO
export interface CompleteShoppingInputDto {
  shoppingListId: string;
}
export interface ConsumeStockInputDto {
  stockId: string;
  amount: { value: number; unit: string };
}
export interface DiscardStockInputDto {
  stockId: string;
}
```

`sourceShoppingItemId` は内部の冪等キーであり **DTO に含めない**（UI に用途がない）。
CompleteShopping の戻り値は既存 `ShoppingListDto`（shopping-list.mapper を再利用）。

#### エラークラス（meal-plan / shopping-list 先例と同構造）

- `StockNotFoundError(stockId: string)` → 404
- `InvalidStockOperationError(message: string)` → 422（当面の発生源は消費時の単位不一致のみ）

#### UseCase 4 本

**CompleteShoppingUseCase**（配置: `application/src/shopping-list/`。D-1）

```
constructor(
  private readonly shoppingListRepository: ShoppingListRepository,
  private readonly pantryRepository: PantryRepository,
  private readonly productRepository: ProductRepository,
  private readonly mealPlanRepository: MealPlanRepository,
)
async execute(input: CompleteShoppingInputDto): Promise<ShoppingListDto>
```

処理は §データフローの擬似コードのとおり。private メソッドに分割する:
`toAddStockInput(item)`（S-4/S-5/S-6 の変換）/ `addStocks(pantry, boughtItems)`（S-3 スキップ）/
`recordPrices(boughtItems)`（S-9 スキップ条件 + D-5 グルーピング）/
`repairMealPlanTransition(mealPlanId)`（D-4。冪等パスと正常パスで共有）。

**ConsumeStockUseCase / DiscardStockUseCase**（依存: PantryRepository のみ）

§データフロー参照。入口チェック（存在 → 404、単位 → 422）を UseCase で行い、Domain の
throw には正常フローで到達させない（MarkAsBought の事前チェック先例）。

**GetPantryUseCase**（依存: PantryRepository のみ）

```
async execute(): Promise<PantryDto>   // find() → toPantryDto。入力なし・エラーなし
```

### Presentation 設計

- `apps/web/src/server/routes/pantry.ts` 新設: 手動 DI ファクトリ（`pantryRepository()` 等）+
  zValidator + 3 ルート（GET `/`, POST `/stocks/:stockId/consume`, POST `/stocks/:stockId/discard`）
- `apps/web/src/server/routes/shopping-lists.ts` 追記: `POST /:id/complete`
  （CompleteShoppingUseCase は 4 Repository を組み立てる。Generate と同型）
- `app.ts`: `.route('/pantry', pantryRoute)` 追加 + 新規エラー 2 種の onError 分岐追加
  （既存分岐の順序・挙動に影響しない追記のみ）

## エラー処理

エラーは UseCase の入口で変換し、Domain 内部は例外をそのまま投げる（規約準拠）。
外部 I/O は DB（PostgreSQL）のみのため、Skill 指定の 5 項目:

- **(a) リトライ**: アプリ層での自動リトライは行わない（既存全機能と同一方針）。クライアント
  の再操作がリトライに相当し、CompleteShopping は S-3 の冪等設計で再実行安全
- **(b) タイムアウト**: DB 接続は既存 `getDb()` の設定に従う。新規の外部呼び出しなし
- **(c) 冪等性**: §API 設計の冪等性キー一覧参照。CompleteShopping は completed 状態 +
  `source_shopping_item_id` UNIQUE の二段。ConsumeStock は非冪等（Unit B へ申し送り）
- **(d) 部分失敗**: 4 段保存を非トランザクションで行う（現行構成の踏襲・ADR-0006 と同じ）。
  §S-3 (2) の表のとおり、完了状態（ステップ 3 以降）は再実行で収束する。価格記録のみ
  非冪等性が残り（S-3 (4) 案 B で許容・R-2）、重複はリトライのたびに累積し自己修復されない。
  トランザクション導入は引き続き全 Repository 横断の将来課題
  （shopping-list-core R-3 の申し送りを継続）
- **(e) フォールバック**: DB ダウン時は既存 onError の 500 フォールバックに委ねる
  （縮退動作なし。オフライン耐性は Unit B の PWA スコープ）

## ログと監視

対象外（MVP1 では監視基盤なし）。既存の `app.ts` onError 内 `console.error` に委ねる。
D-4 の「MealPlan 不存在スキップ」は理論上の不整合検知点のため、実装時に `console.warn` を
1 行置いてよい（実装裁量・必須としない）。

## セキュリティ

MVP1 は認証なし（ADR-0003 / ADR-0004。既存機能と同一前提）。Pantry に userId は持たない。
入力値は Hono zValidator（Zod）でサーバー側検証。productId / stockId 等の実在検証は形式のみ
（stockId の実在は UseCase の 404 が担う）。SQL は Drizzle 経由でパラメタライズ（既存同様）。

## 性能

- データ規模: stocks は「週 1 回の買い物で数十件追加・消費/廃棄で削除」の定常状態で
  数十〜百件程度。全行 SELECT（find）・全量 upsert + NOT IN DELETE（save）で問題ない規模
- **価格記録の N+1（指示論点 10・D-5）**: 素朴実装では bought 品目ごとに Product の
  load/save が走る N+1 になるため、unique productId ごとに findById 1 回・save 1 回へ
  グルーピングする。それでも Product 件数ぶんの逐次往復は残るが、実行頻度が週 1 回・
  対象は高々数十件の PK 検索であり MVP1 では許容する。ボトルネック化した場合の改善方針は
  `ProductRepository.findByIds` の後方互換的追加（D-4〈shopping-list〉の進化パスと同一）
- **留意点**: consume 1 回ごとに Pantry 集約全体の save（stocks 全行の upsert + DELETE）が
  走る。ShoppingList / MealPlan save と同一パターンで MVP1 は許容。在庫件数が増えて体感が
  悪化したら stock 単位の部分 UPDATE への最適化余地がある（Unit B 実測後の改善候補）

## 後方互換性

- 既存テーブル・既存 API への変更なし（stocks 追加・エンドポイント追加のみ）。
  `Quantity.subtract()` は純追加で既存利用箇所（of / multiply / add のみ使用）に影響なし
- `ShoppingList.complete()` が初めて外部公開経路で呼ばれるが、Domain コード自体は無変更
- schema.ts / index.ts / app.ts / shopping-lists.ts への追記はすべて後方互換
- `docs/04-domain-model.md` の Pantry 擬似コードとは S-4（getBoughtItemsForPantry 廃止・
  expiresAt/storedLocation null）・S-5（productId null + displayName）・S-6（1 点登録）・
  S-7（subtract 厳格 + consume クランプ）・S-10（reason 廃止）・S-11（3 メソッド非実装）で
  乖離する。**S-x 確定後に同ドキュメントを同期する**（§ドキュメント更新対象）

## テスト方針

要件書 §7 を土台に、試験計画は test-designer が `docs/tests/pantry-core.md` で確定する。
本設計から追加で渡す設計由来の観点:

- **Domain（Pantry / Stock / Quantity）**: `subtract` の単位不一致 throw・負値 throw・0 減算
  （S-7）、`Stock.consume` の全量クランプ（消費量 > 在庫量 → 0）と「消費量 = 在庫量」で
  isEmpty（境界）、consumeStock のゼロ到達 → 集約から削除、discardStock の残量無関係の全量削除、
  未検出 stockId の throw、`Stock.create` の `amount.value <= 0` 拒否、
  `hasStockFromShoppingItem` の真偽、`PantryId.singleton()` の同値性
- **Application（CompleteShopping。最重要）**: 冪等再実行（completed → 200・Stock/価格が
  再実行されない）、**部分失敗の修復**（(i) Stock 追加済み + active → 再実行で二重追加なし・
  後続段が実行される、(ii) completed + MealPlan=shopping → 遷移修復、(iii) MealPlan=draft →
  二段遷移修復）、bought 0 件の完了、価格記録スキップ条件 5 種（S-9。productId null /
  actualPrice 0 / requiredAmount null / value 0 / unitPrice 丸め 0）、requiredAmount null 品目
  の「1 個」Stock 化（S-6）、同一 Product 複数品目の save 1 回（D-5 グルーピング）、
  MealPlan 不存在スキップ（D-4）
- **Application（Consume / Discard / Get）**: 単位不一致 → InvalidStockOperationError、
  未検出 → StockNotFoundError、空 Pantry の GetPantry（`stocks: []` で 200 相当）
- **Infrastructure（PGlite）**: 空テーブルからの find（空 Pantry 復元）、round-trip
  （productId null / expiresAt null / storedLocation null / sourceShoppingItemId null の
  nullability 全パターン）、`source_shopping_item_id` UNIQUE 違反、NOT IN DELETE、
  expires_at のローカル日付整形（JST 前日ずれ）
- **API 契約**: contract-designer 確定後、既存 schema.test パターン（parse 通過 / reject /
  型往復）。`consume` の `value: 0` reject（D-6）を含む
- テストランナーは Vitest。完了条件は `pnpm lint` / `pnpm type-check` / `pnpm test`

## 移行とリリース

- DB マイグレーション: `stocks` テーブルの追加のみ。既存テーブル変更なし・データ移行なし
- ロールバック: `stocks` の DROP で戻せる（既存データへの影響なし）
- デプロイ: マイグレーション適用後に Next.js デプロイ（既存手順と同一）

## リスク

| #   | リスク                                                                                                                                           | 対応                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | S-x 未確定のまま実装着手すると手戻りが大きい（特に S-1/S-2 は Repository IF と DB の根幹、S-3 は契約セマンティクス）                             | 実装計画フェーズ前に S-1〜S-11 のユーザー確定を必須とする                                                                                                                                                                   |
| R-2 | 価格記録の非冪等性（S-3 (4) 案 B。(2) で最初の `productRepo.save` 成功後〜(3) の保存成功前の任意の失敗で、再実行のたびに価格が重複記録され得る） | 重複はリトライ回数に比例して累積し、自動修復されない（cheapestStoreAt は店舗ごと最新 1 件を見るため判定は変わらないが、averagePrice の歪みはリトライのたびに増す）。手動削除以外の回復手段がない。完全収束が必要なら案 A へ |
| R-3 | 4 集約更新が非トランザクション（部分失敗の窓自体は残る）                                                                                         | S-3 の保存順序 + UNIQUE + 冪等再実行で収束。トランザクション導入は横断課題として申し送り継続（ADR-0006 R-3 同）                                                                                                             |
| R-4 | Pantry の集約全体 save による同時更新の失われた更新/復活（A が消した Stock を、古い集約を持つ B の save が復活させ得る）                         | 既存 MealPlan / ShoppingList save と同一の既知制約。2 名利用の同時操作頻度では許容し、Unit B 実測後に部分 UPDATE 化を検討                                                                                                   |
| R-5 | S-9 の packageSize 転用（requiredAmount ≒ 購入量の近似）により unitPrice の精度が粗い                                                            | 既知の MVP1 制約として受容。正確な記録は既存の手動 RecordPrice が併存する                                                                                                                                                   |
| R-6 | `docs/04-domain-model.md` との乖離（S-4/S-5/S-6/S-7/S-10/S-11）が放置されると Unit B/C が古い擬似コードを参照する                                | S-x 確定後の同期タスクを実装計画に含める（§ドキュメント更新対象）                                                                                                                                                           |
| R-7 | S-11（findByProduct 等の先送り）により Unit C 着手時に Pantry へのメソッド追加が必要になる                                                       | 後方互換的な追加で済む構造にしてある（インデックス先行配置・FIFO 順序仕様・subtract 意味論を §S-11 で申し送り済み）                                                                                                         |

## ADR 候補

今はファイルを作らない（作成は設計確定後のフェーズで reviewer / Orchestrator が行う）:

1. **買い物完了の冪等性・4 段保存順序・`source_shopping_item_id` UNIQUE による Stock 二重
   追加防止・価格記録の非冪等性の許容（完了状態は収束・価格履歴は成功 1 回分と一致しない
   可能性を受容）**（S-3）— ADR-0006 と対をなす恒久判断。**ADR 化を推奨**
   （仮番号 ADR-0007）
2. Pantry のシングルトン表現（S-1 常在モデル + S-2 単一テーブル）— Phase 2（複数世帯）で
   必ず再訪される前提の判断のため、ADR 化する価値がある（判断は確定時に。Memory 留めでも可）

## ドキュメント更新対象（本書では列挙のみ・編集しない）

| ドキュメント                           | 更新内容                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `docs/04-domain-model.md`              | §Pantry 集約を確定設計に同期（S-4/S-5/S-6/S-7/S-10/S-11 の乖離）。§CompleteShoppingUseCase 擬似コードを実装同期形に更新 |
| `docs/decisions/ADR-0007-*.md`（新規） | S-3 確定後に作成（§ADR 候補 1）                                                                                         |
| `docs/05-roadmap.md`                   | Sprint 5 Unit C の前提注記（findByProduct / calculateRequiredAmount は Unit C 側で Pantry に追加。S-11 申し送り）       |
| `docs/designs/shopping-list-core.md`   | 将来課題の消込（getBoughtItemsForPantry / BoughtItemForPantry は S-4 により「作らない」で決着した旨の追記。任意）       |

## 未決事項

### ユーザー確定記録（2026-07-14・全件確定済み）

S-1〜S-11 の全件をユーザーが推奨案どおり確定（フェーズ 2 続行の前提を満たした）:

- **S-1**: `find(): Promise<Pantry>`（常に非 null）+ PantryId 固定定数。GetPantry は常に 200
- **S-2**: `stocks` 単一テーブル（pantries テーブルなし）+ `source_shopping_item_id` UNIQUE
- **S-3**: 冪等成功 + 保存順序による自己修復 + UNIQUE 二重追加防止（**訂正コミット b88be9a
  〈価格記録の非冪等性を明示〉反映済みの内容で確定**。ADR 化は実装計画の ADR-0007 起票で対応）
- **S-4**: Domain メソッドは作らず Application 層で filter + 変換。expiresAt / storedLocation は null
- **S-5**: productId null 許容 + displayName 保持の両方採用
- **S-6**: amountNote のみの品目は `Quantity.of(1, '個')` として登録
- **S-7**: subtract は負値で throw。過剰消費は `Stock.consume` が全量消費にクランプ
- **S-8**: `actualPrice = 0` は価格記録をスキップ（Stock 追加は行う）
- **S-9**: requiredAmount を packageSize に転用。null / 0 / 丸め 0 はスキップ
- **S-10**: MVP1 では reason を受け取らない（履歴テーブルは Phase 2）
- **S-11**: calculateRequiredAmount / findByProduct / findExpiringSoon は本ユニットでは実装しない

D-1〜D-8（設計者裁量）も異論なしのため確定扱いとする。

### contract-designer への申し送り

- `consumeStockSchema.amount.unit` は `unitSchema`（recipe.schema.ts）再利用（D-6）
- 完了 API はボディなし POST。param は既存 `shoppingListIdParamSchema` 再利用（新規スキーマ
  追加は pantry.schema.ts の 2 本 + `stockIdParamSchema` のみの見込み）
- CompleteShopping のレスポンスは既存 `ShoppingListDto` 形（新規レスポンス型なし）。
  初回・冪等再実行とも 200 で分岐なし（S-3。ADR-0006 の 201/200 分岐とは意図的に異なる）
- `StockDto.purchasedAt` は ISO datetime、`expiresAt` は ISO date（ローカル日付整形。JST 注意）
- エラーレスポンスは既存 `{ error: string }` 形・400 は zValidator 既定形を踏襲

### implementation-planner への申し送り

- 実装順の推奨: `Quantity.subtract`（S-7）→ Domain（pantry 集約）→ Repository IF →
  Drizzle スキーマ + マイグレーション + Repository 実装 → Application（pantry 3 本 →
  CompleteShopping）→ 契約 → Hono ルート（shopping-list-core の PR 分割先例に準拠）
- `docs/04-domain-model.md` の同期タスクと ADR-0007 起票を計画に含める（R-6・§ADR 候補）
- `.claude/state/current-feature` は設定済み（変更不要）

### test-designer への申し送り

- §テスト方針の設計由来観点（特に CompleteShopping の冪等・3 種の部分失敗修復・価格記録
  スキップ 5 条件・consume クランプ境界）を試験計画に反映すること

### 将来課題（本ユニットでは扱わない）

- Unit C: `findByProduct` / `calculateRequiredAmount` の Pantry への追加と切り上げルール
  （S-11 の申し送り 3 点）。在庫引き算の挿入位置は Generate ステップ 6-7 間（S-2〈shopping-list〉）
- Unit B: 在庫の expiresAt / storedLocation の後付け編集操作の要否（S-4 案 α の帰結）、
  ConsumeStock の二重送信抑止（非冪等のため）
- Phase 2: 消費/廃棄履歴（stock_events 相当）と reason の再導入（S-10）、`findExpiringSoon` /
  期限アラート、複数世帯対応時の `stocks.pantry_id` 追加（S-2）
- 横断: DB トランザクション導入（R-3。ADR-0006 からの継続申し送り）
  </content>
