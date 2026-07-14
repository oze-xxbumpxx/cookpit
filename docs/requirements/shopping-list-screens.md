# 要求メモ: shopping-list-screens（Sprint 4 Unit B — 買い物リスト画面 + PWA オフライン強化）

作成日: 2026-07-13
担当工程: 要求分析
変更レベル: L2（Presentation 層のみ・既存 API/契約のみ使用。Orchestrator が classify-change で確定済み）
関連: `docs/designs/shopping-list-core.md`（Unit A 確定設計・正典）、
`docs/decisions/ADR-0006-shopping-list-generate-idempotent.md`、
`docs/designs/meal-plan-screens.md`（Sprint 3 Unit B・L2 画面ユニットの先例）、
`docs/05-roadmap.md` Sprint 4

---

## 1. 背景・目的・スコープ

### 背景

Sprint 4 Unit A（`shopping-list-core`）で ShoppingList 集約のバックエンド一式（Domain /
Infrastructure / Application / API Contract / Presentation(API) 5 本）が実装済み・main マージ済み
（PR #51〜#57）。API・DTO・エラー処理は確定済みであり、本ユニットはそれを使う画面（UI）と
PWA オフライン強化のみを対象とする。

### 目的

- 土曜の買い物がスマホで完結する画面を作る（roadmap Sprint 4 ゴール・MVP1 のクライマックス）。
- 店舗ごとのグルーピング表示・チェック（購入実績入力）・手動追加・価格比較インジケーターを提供する。
- 電波が悪いスーパーでも最低限の操作ができる PWA オフライン強化を行う。

### 対象（スコープ内）

- `apps/web` の Presentation 層のみ（画面・Client/Server Component・Hono RPC 呼び出し）。
- 既存 5 API（Generate / Get / AddItem / MarkAsBought / ReassignStore）をそのまま使用。
- `apps/web/src/app/sw.ts` の runtimeCaching 追記（既存 Serwist 構成の延長で可能な範囲）。
- 献立画面（`/meal-plans`）側からの遷移導線（範囲は §4 未確定論点で論点提示。確定は次工程）。

### 対象外

- バックエンド / Domain / DB / API 契約の変更（既存を使う前提。追加が必要な場合は S-x 候補として
  記録するのみ・実装しない）。
- `GET /api/shopping-lists?mealPlanId=` 相当の新規クエリ API（shopping-list-core §S-7 で明示的に
  スコープ外・Unit B 再訪事項とされている。本書 §3-1 で「不要」と結論づける）。
- チェック解除（bought→pending）UseCase の新規実装（S-11(d)。要否のみ論点化。実装は本ユニット外の
  可能性あり、次工程で判断）。
- Background Sync によるオフライン書き込みキューの実装（§4 S-B候補として提示のみ）。
- 認証・複数ユーザー対応（ADR-0003 / ADR-0004 継続）。

---

## 2. 画面一覧と各画面の状態・操作・表示要素

現時点で `apps/web/src/app/` に `/shopping` 系ルートは存在しない（新規ディレクトリ）。以下は
roadmap タスク 4「API + 画面」の要求粒度での整理であり、画面構成・コンポーネント分割は
architecture-designer が確定する。

### 画面 A: 買い物リスト画面（仮 `/shopping/[id]` または `/shopping`）

| 状態                                                                         | 内容                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 今週の MealPlan が存在しない                                                 | 「今週の献立がまだありません」+ `/meal-plans` への導線（§4 論点）                     |
| ShoppingList 未生成（MealPlan は draft）                                     | 「買い物リストを作る」導線（冪等 POST。§3-1）                                         |
| ShoppingList 生成済み（active）                                              | 店舗ごとにグルーピングされた item 一覧。チェック操作・手動追加が可能                  |
| ShoppingList completed（S-8 Domain 実装済みだが API 非公開のため到達しない） | Unit B では実質発生しない状態として扱ってよい（`complete()` を呼ぶ API が存在しない） |
| エラー（404 / 422 / ネットワーク）                                           | エラーメッセージ表示（meal-plan-screens 先例のパターン踏襲）                          |

**表示要素**（要件粒度。実装粒度のコンポーネント分割は次工程）:

1. **店舗グループ化**: `items[].targetStoreId` でグルーピング。`null`（店舗未定）は独立グループとして
   表示する（D-1 の帰結。§3-5 参照）。店舗名の解決には `GET /api/stores` の一括取得が必要（§3 表）。
2. **チェックボックス**: `status === 'bought'` を表す。タップで購入実績入力（価格・実購入店舗）に
   進む（MarkAsBought は `actualPrice` と `actualStoreId` が必須のため、単純な boolean トグルでは
   完結しない。入力 UI が要る。§4 論点）。
3. **価格入力**: `actualPrice.amount`（0 以上・JPY 固定）+ `actualStoreId`（必須 UUID）。
   `targetStoreId`（推奨店舗）をデフォルト選択値として使えるが、別店舗で買った実績も入力可能
   （`actualStoreId` は `targetStoreId` と独立。design §S-11(c)）。
4. **手動追加フォーム**: `displayName`（非空）+ `requiredAmount{value, unit}`（0 以上・Unit 17 値）
   - 任意で `productId` / `targetStoreId`（null 許容）。`amountNote` 付き追加は契約上不可（S-5 注記。
     AddItem リクエストは `requiredAmount` 必須）。
5. **価格比較インジケーター**（「この商品は A 店の方が安い」）: `targetStoreId` は Generate 時点で
   算出済みの推奨最安店舗（D-1）。店舗名バッジとしての表示は可能。金額差を伴う比較表示は
   追加のデータ取得が要る（§3-5 で yes/no を確定）。
6. **skipped 表示**: `ItemStatus.skipped` に到達する UI 操作は Unit A に存在しない（S-9 は Domain の
   み・API 非公開）。表示上 `skipped` 状態は現状データに現れない前提でよい（発生しないため UI 分岐の
   優先度は低い。念のため型上は 3 値なので網羅は必要）。

### 画面 B: 献立画面からの導線（既存 `/meal-plans` への追記の可能性）

`docs/05-roadmap.md` Sprint 3 スコープ判断（2026-07-03）:「draft→shopping の遷移 UI は Sprint 4
（買い物リスト作成）と連動して出す方が自然」。現状 `apps/web/src/app/meal-plans/_components/
meal-plan-client.tsx` に ShoppingList への導線は一切ない（`meal-plan-screens.md` 対象外に明記）。
導線をどこまで Unit B に含めるかは §4 論点として次工程に委ねる。

---

## 3. 既存 API とデータ可用性の確認表

### 3-1. 論点1: 画面の入口（今週の買い物リストを開く導線）— **yes**

**結論: 既存 API で実現可能。新規 GET API は不要。**

- `POST /api/shopping-lists { mealPlanId }` は **冪等な get-or-create** として実装済み
  （ADR-0006、`docs/decisions/ADR-0006-shopping-list-generate-idempotent.md`）。
  実装: `apps/web/src/server/routes/shopping-lists.ts:44-54`
  （`GenerateShoppingListUseCase.execute()` → `{ shoppingList, created }` → `created` で 201/200 分岐）。
- レスポンス形は新規・既存いずれも同一の `ShoppingListResponse`（`items` を含む完全な DTO）。
  契約: `packages/api-contract/src/shopping-list.schema.ts` の `shoppingListResponseSchema`
  （`items: z.array(shoppingItemResponseSchema)` を含む）。設計書 §契約確定仕様 §10「ボディ形状は
  どちらも同一」と一致（`docs/designs/shopping-list-core.md` 1407 行）。
- `mealPlanId` は既に `/meal-plans` 画面が持っている。`GET /api/meal-plans/current` が
  `{ data: MealPlanDto | null }`（`id` を含む）を返す（`apps/web/src/server/routes/
meal-plans.ts:31-35`、`packages/application/src/meal-plan/meal-plan.dto.ts`）。
- `GET /api/shopping-lists?mealPlanId=` 相当のクエリ API は**存在せず、Unit A の契約確定仕様でも
  明示的にスコープ外**とされている（`docs/designs/shopping-list-core.md` 1122-1123 行・
  1257-1258 行:「本契約に query スキーマは存在しない」「Unit B 設計での再訪事項」）。
  → 冪等 POST が get-or-create を兼ねるため、この新規 API は不要と本書では結論する
  （S-x 候補にしない）。

**次工程への申し送り（データ可用性ではなく実装形の論点）**:

- 画面訪問時にこの冪等 POST をどう呼ぶか（Server Component から UseCase 直呼び vs Client から
  Hono RPC 経由）は presentation-layer.md の「初期表示は Server Component」方針との整合を含め
  architecture-designer が判断する。
- 「閲覧するだけで POST（副作用のある操作）が走ってよいか」は meal-plan-screens の S-7
  「MealPlan 作成は明示ボタン・閲覧だけで自動作成しない」という先例と方向性が異なりうる。
  冪等なので実害は小さいが、設計判断として明示が必要。

### 3-2. 論点2: 生成 UI との連動（献立画面側の導線）— 事実整理のみ（yes/no 対象外）

`docs/05-roadmap.md` Sprint 3 スコープ判断は確定済みだが、「献立画面にどこまで手を入れるか」は
画面設計判断であり、本工程では事実整理にとどめる。

- 現状 `meal-plan-client.tsx` のヘッダーは「レシピ」「商品」「履歴」の 3 リンクのみ
  （`apps/web/src/app/meal-plans/_components/meal-plan-client.tsx:96-127`）。ShoppingList への
  導線は皆無。
- `MealPlanDto.status`（`'draft' | 'shopping' | 'cooking' | 'consuming' | 'completed'`）は既に
  DTO に含まれる（`packages/application/src/meal-plan/meal-plan.dto.ts`）が、画面では未使用
  （meal-plan-screens D-2「ステータスバッジは表示しない」）。
- Generate 成功時に MealPlan は `draft→shopping` へ自動遷移する（S-6・ADR-0006）ため、
  「今週の献立」画面を再訪すれば `status` の変化は取得できる状態にある（表示するかは画面設計）。
- 論点: (a) `/meal-plans` 画面（Sprint 3 Unit B の既存ファイル）に「買い物リストを作る/開く」
  ボタンを追加するか、(b) `/shopping` 側が自己完結的に現在の MealPlan を解決するか、
  (c) 両方を組み合わせるか。データ取得はいずれの案でも既存 API で可能（新規 API 不要）。

### 3-3. 論点3: PWA オフライン強化のスコープ — **読み取りキャッシュ: yes / 書き込みキュー: no（要 S 候補）**

- 現状 `apps/web/src/app/sw.ts` の `runtimeCaching` は Google Fonts 用 1 件のみ（`CacheFirst` +
  `ExpirationPlugin`）。`/api/*` へのキャッシュ戦略は**存在しない**（sw.ts 1-28 行、全文確認済み）。
- `apps/web/next.config.ts` は本番ビルド（`next build --webpack`）でのみ Serwist を適用し、
  precache は Next.js の静的アセット・ページシェルが対象（`swSrc`/`swDest` 指定のみで、
  API レスポンスの precache 設定はない）。
- **読み取りキャッシュ（GET /:id・画面ナビゲーション）**: 既存 Serwist 構成（`serwist` パッケージ
  `^9.5.11`、既に依存関係にある）の `runtimeCaching` 配列に 1 エントリ追記するだけで実現できる
  （新規パッケージ依存は不要）。`NetworkFirst` や `StaleWhileRevalidate` 等の標準戦略を
  `GET /api/shopping-lists/:id` 等にマッチさせる形。
- **オフライン書き込み**（チェック操作のキュー・Background Sync）: 現状の実装に該当機能は
  一切ない。Serwist は Background Sync 相当のプラグインを提供しうるが未使用・未検証であり、
  導入するとキュー管理・失敗時のリトライ・UI 通知など新規のクライアント側状態設計が必要になる。
  既存の `ExpirationPlugin` 程度の軽微な追加とは性質が異なる。
  → **「別フェーズ候補・S-x」として扱う**（本書は論点提示のみで実装しない）。

### 3-4. 論点4: チェック操作の楽観的更新 — 事実整理（データは既存 API で完結・実装方式は未確定）

- presentation-layer.md（`.claude/rules/presentation-layer.md`）: 「書き込みは基本 Hono RPC
  （楽観的更新を効かせやすい）」「ステータス変更などのアクションは B: Hono RPC + TanStack Query」。
- **事実確認: `@tanstack/react-query` は `apps/web/package.json` に存在しない**
  （grep 確認済み。現状の依存は `serwist` のみで TanStack Query 系パッケージなし）。
  meal-plan-screens（Sprint 3 Unit B）は S-6 で「TanStack Query は導入しない」を確定済み
  （Server Component 直呼び + 素の RPC + `router.refresh()`）ため、本プロジェクトでの
  TanStack Query 初導入は本ユニットが最初になる可能性がある。
- 代替: `react` は `19.2.4`（`apps/web/package.json`）で `useOptimistic` が利用可能。新規依存を
  増やさず楽観的更新を実装する選択肢がある。
- 操作と状態遷移（データ面。API・DTO は確定済み）:
  - チェック ON（購入実績入力 送信）→ `POST .../bought`（200 + 更新後 `ShoppingItemDto`）。
    同一 item への再送信は**上書き許容**（S-11(a)。エラーにならない＝金額訂正が同一操作で可能）。
  - `skipped` の item へのチェック ON → 許容（S-11(b)。skipped→bought）。
  - チェック解除 UI は **Unit A に存在しない**（S-11(d)「Unit A では作らない。Unit B で要否判断」）。
    バックエンドに戻す UseCase がないため、画面側で「一度 bought にした後に取り消す」操作を
    提供する場合は新規 UseCase が必要（§4 S-x 候補）。
  - `reassignStore`（推奨店舗の変更）は bought 後も呼べる（S-11(c)。`actualPrice`/`actualStoreId`
    に影響しない）。
- ロールバック観点（試験観点にも反映）: 楽観的更新を採用する場合、`POST .../bought` /
  `POST .../target-store` の失敗時（404/422/ネットワークエラー）に UI 状態を元に戻す設計が必要。
  データは D-5（更新後 `ShoppingItemDto` を返す）のためサーバー確定値での再同期は容易。

### 3-5. 論点5: 価格比較インジケーター — **「推奨店舗」表示: yes（既存データで可能） / 金額差の比較表示: no（N+1 懸念あり）**

- `ShoppingItemDto.targetStoreId`（`packages/application/src/shopping-list/shopping-list.dto.ts`
  相当。設計書 §Application 設計で確定）は Generate 実行時点の `Product.cheapestStoreAt(new Date())`
  による**スナップショット**（D-1）。以後は `ReassignStore` で手動変更されない限り再計算されない
  （生成後に価格が変わっても自動追従しない、という制約が付随する）。
- **店舗名を含む「推奨店舗」バッジ**: `targetStoreId` は UUID のみで店舗名を含まない。店舗名解決は
  `GET /api/stores`（`apps/web/src/server/routes/stores.ts:12-17`。`StoreDto[]`、
  `packages/application/src/store/store.dto.ts` = `{ id, name, createdAt }`）を**画面初期表示で
  1 回取得**すれば id→name の Map を構築できる（meal-plan-screens の
  `buildRecipeNameMap` と同型パターン）。**→ yes（N+1 なし。1 リクエストで足りる）**。
- **金額差を伴う比較表示**（例:「A店 298円 / B店 250円、B店の方が48円安い」）: 店舗別の価格データは
  `GET /api/products/:id`（`ProductDto.priceHistory: PriceRecordDto[]`。店舗ごとの
  `priceAmount`/`unitPriceAmount`/`observedAt`。`apps/web/src/server/routes/products.ts:39-44`、
  `packages/application/src/product/product.dto.ts`）または
  `GET /api/products/:id/cheapest-store`（`CheapestStoreResultDto`。単一の最安店舗情報のみ、
  `apps/web/src/server/routes/products.ts:75-80`）でしか取得できない。
  `ShoppingItemDto` 自体には価格情報が含まれない（`actualPrice` は購入後のみ非 null）。
  → item ごとに `productId` が異なりうるため、金額差表示には**リスト内の一意な `productId` の数だけ
  `GET /api/products/:id` を呼ぶ N+1 相当の呼び出し**が発生する（`productId` が null の item は
  対象外・名寄せ未確定 S-3 のため対象外）。買い物リストの item 数は「1 リストあたり数十件」
  （設計書 §性能）であり、一意な productId 数はそれ以下だが、ゼロではない性能コストを伴う。
  **→ no（既存 API のみでは金額差の即時表示は N+1 を伴う。バルク取得 API は現状存在しない）**。
- 結論: 「A店の方が安い」という**定性的な推奨店舗バッジ**は既存データ（`targetStoreId` +
  `GET /api/stores`）だけで実現できる。**金額差まで見せる場合**は N+1 の性能懸念が残るため、
  実装方式（許容する/しない・バルク API 新設を検討する）は次工程の論点とする。

### 画面要素 → API 対応表（まとめ）

| 画面要素                            | 使用 API                                                          | 取得できるデータ                                           | 過不足                                          |
| ----------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| リスト入口（生成/取得）             | `POST /api/shopping-lists`（冪等）                                | `ShoppingListDto`（items 込み）、201/200 で新規/既存判別可 | 過不足なし（§3-1）                              |
| リスト再取得（refetch・他端末同期） | `GET /api/shopping-lists/:id`                                     | `ShoppingListDto`                                          | 過不足なし                                      |
| 店舗グループ化・店舗名表示          | `GET /api/stores`                                                 | `StoreDto[]`（id, name）                                   | 過不足なし（1 回取得で Map 化）                 |
| チェック（購入実績入力）            | `POST /api/shopping-lists/:id/items/:itemId/bought`               | 更新後 `ShoppingItemDto`                                   | 過不足なし                                      |
| チェック解除                        | なし                                                              | —                                                          | **不足（S-x 候補。§4）**                        |
| 手動追加フォーム                    | `POST /api/shopping-lists/:id/items`                              | 作成後 `ShoppingItemDto`                                   | 過不足なし（`amountNote` 付き追加は契約上不可） |
| 推奨店舗の変更                      | `POST /api/shopping-lists/:id/items/:itemId/target-store`         | 更新後 `ShoppingItemDto`                                   | 過不足なし                                      |
| 価格比較（推奨店舗バッジ）          | `targetStoreId` + `GET /api/stores`                               | 店舗名まで                                                 | 過不足なし                                      |
| 価格比較（金額差）                  | `GET /api/products/:id` または `/:id/cheapest-store`（item ごと） | 店舗別価格                                                 | **N+1 懸念（§3-5）**                            |
| オフライン読み取り                  | Serwist runtimeCaching 追記                                       | GET レスポンスのキャッシュ                                 | 過不足なし（新規依存不要）                      |
| オフライン書き込みキュー            | なし                                                              | —                                                          | **不足（S-x 候補。§4）**                        |

---

## 4. 未確定論点（S-x 候補）— 推奨案の確定はしない。architecture-designer / ユーザーへの申し送り

| #    | 論点                                                                                                                                   | Unit B スコープ内/外                                                                                        | なぜ確定が要るか                                                                                                                                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-B1 | 献立画面（`/meal-plans`）への「買い物リストを作る/開く」ボタン追加の要否・範囲                                                         | **内**（Presentation のみ・データは既存 API で足りる）                                                      | Sprint 3 Unit B の既存ファイルへの変更が発生し、画面間の導線設計・ユニット境界の判断が要る（§3-2）                                                                                                  |
| S-B2 | 画面訪問時に冪等 POST（Generate）をどう呼ぶか（Server Component 直呼び vs Client+RPC）、副作用ありの POST を閲覧時に自動発火してよいか | **内**                                                                                                      | presentation-layer.md の初期表示方針・meal-plan-screens S-7 先例との整合判断が必要（§3-1）                                                                                                          |
| S-B3 | チェック解除（bought→pending）UI・UseCase の要否                                                                                       | **外の可能性あり**（UseCase 新設は Unit A 相当の Application/API 変更を伴い、既存を使う前提の L2 を超える） | S-11(d) で Unit A から明示的に申し送られた未決事項。画面 UX 検証で必要性が決まる。必要なら**バックエンド追加**（新規 UseCase + API）が要り、その場合は別ユニット/S-x 扱いとすべき                   |
| S-B4 | 楽観的更新の実装方式（TanStack Query 新規導入 vs `useOptimistic` vs 非採用で `router.refresh()` 相当）                                 | **内**（データ面は確定済み・実装方式のみ）                                                                  | TanStack Query は本プロジェクト初導入になる（§3-4）。presentation-layer.md の推奨と meal-plan-screens 先例（不導入）が競合するため方針確定が要る                                                    |
| S-B5 | PWA オフライン**書き込み**（チェック操作のキュー / Background Sync）                                                                   | **外（別フェーズ候補）**                                                                                    | 新規のクライアント状態管理・失敗時 UX 設計を伴い、既存 Serwist 構成の軽微な延長を超える（§3-3）。roadmap の「電波が悪いスーパーでも動く」を読み取りキャッシュのみで完了条件とみなせるかの判断が要る |
| S-B6 | 価格比較インジケーターの表示レベル（推奨店舗バッジのみ or 金額差まで表示）                                                             | **内**（バッジのみなら） / **外の可能性**（金額差表示で N+1 が許容できない場合、バルク API 新設が要る）     | §3-5 の N+1 懸念。既存 API のみで済ませるか、性能改善（バルク取得 API）を Sprint 5 以降に回すかの判断が要る                                                                                         |
| S-B7 | 店舗未定（`targetStoreId === null`）グループの扱い（表示順・ラベル）                                                                   | **内**                                                                                                      | D-1 の帰結として必ず発生しうる状態（S-3 案 A により targetStore が null になりやすいと設計書 R-2 に明記）。UI 上「店舗未定」をどう見せるかは画面設計判断                                            |

---

## 5. 試験観点

### 正常系

| #    | ケース                                                    | 期待結果                                                                                                                           |
| ---- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| N-01 | 今週の MealPlan あり・ShoppingList 未生成                 | 「買い物リストを作る」導線から `POST /api/shopping-lists` が呼ばれ 201 でリスト表示に遷移                                          |
| N-02 | 今週の MealPlan あり・ShoppingList 生成済み（2 回目訪問） | `POST`（または `GET /:id`）で 200・既存 items（チェック状態含む）がそのまま表示される                                              |
| N-03 | items が店舗ごとに正しくグルーピングされる                | `targetStoreId` が同じ item が同一グループに集約される                                                                             |
| N-04 | チェック（購入実績入力）→ 送信成功                        | `status: 'bought'`・`actualPrice`/`actualStoreId` が表示に反映される                                                               |
| N-05 | 同一 item への 2 回目のチェック（金額訂正）               | 上書きされる（S-11(a)。エラーにならない）                                                                                          |
| N-06 | skipped item へのチェック                                 | bought へ遷移する（S-11(b)。Unit A では skipped 到達操作がないため通常は発生しないが、契約上許容されることをレスポンス処理で確認） |
| N-07 | 手動追加フォームの送信                                    | `POST .../items` が 201 を返し、一覧に新規 item（`source: 'manually_added'`）が追加される                                          |
| N-08 | 推奨店舗の変更                                            | `POST .../target-store` が 200 を返し、bought 済み item でも `actualPrice`/`actualStoreId` は変わらない（S-11(c)）                 |
| N-09 | 店舗名の解決                                              | `GET /api/stores` の 1 回取得で全店舗名が Map 化され、`targetStoreId` から店舗名が表示される                                       |
| N-10 | オフライン読み取り（再訪問）                              | ネットワーク切断時でも直前に取得した `GET /api/shopping-lists/:id` のキャッシュ結果が表示される（runtimeCaching 追加後）           |

### 異常系

| #    | ケース                                                                                            | 期待結果                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| E-01 | 今週の MealPlan が存在しない                                                                      | 「今週の献立がまだありません」+ `/meal-plans` への導線を表示（買い物リスト作成不可）                               |
| E-02 | `POST /api/shopping-lists` が 404（MealPlanNotFoundError）                                        | エラーメッセージ表示。（通常は mealPlanId を画面から取得するため実運用では発生しにくいが、削除競合等で起こりうる） |
| E-03 | `POST /api/shopping-lists` が 422（InvalidMealPlanStateError。既存リストなし && status ≠ draft）  | エラーメッセージ表示                                                                                               |
| E-04 | `POST .../items` が 422（InvalidShoppingListStateError・completed ガード。D-2）                   | エラーメッセージ表示（Unit B の到達可能性は低いが型として存在）                                                    |
| E-05 | `POST .../bought` / `.../target-store` が 404（List または Item 消失）                            | エラーメッセージ表示 + 一覧の再同期（refetch）を促す                                                               |
| E-06 | Zod バリデーション失敗（400。手動追加フォームで `displayName` 空、`requiredAmount.value` 負数等） | クライアント側で事前に弾く、またはサーバー 400 をそのままエラー表示                                                |
| E-07 | ネットワークエラー（fetch 失敗）                                                                  | 「通信エラーが発生しました。」表示（meal-plan-screens 先例のパターン）                                             |
| E-08 | オフライン時に書き込み操作（チェック等）を行う                                                    | S-B5 未確定のため、キュー機構なしなら「通信エラー」表示に留まる（挙動は次工程で確定）                              |

### 境界条件

| #    | ケース                                                             | 期待結果                                                                                             |
| ---- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| B-01 | `targetStoreId === null` の item（店舗未定）                       | 独立した「店舗未定」グループとして表示される（D-1・S-B7）                                            |
| B-02 | `requiredAmount === null`（`amountNote` のみ。「適量」等）         | 数量ではなく `amountNote` 文字列が表示される（S-5）                                                  |
| B-03 | items 0 件のリスト（D-7。plannedRecipes 0 件の MealPlan から生成） | 空状態表示 + 手動追加フォームは利用可能                                                              |
| B-04 | `actualPrice.amount = 0`（無料でもらった等）                       | 0 円として正しく入力・表示できる（`markAsBoughtSchema` は `.min(0)`）                                |
| B-05 | `requiredAmount.value = 0` の手動追加                              | 0 として送信・表示できる（`addItemSchema` は `.min(0)`）                                             |
| B-06 | 一意な `productId` を持つ item が多数（性能境界）                  | 金額差表示を採用する場合、N+1 呼び出しの体感遅延が許容範囲か確認（S-B6 採用時のみ）                  |
| B-07 | 2 人が同時に同じ item をチェック（同時操作）                       | 後勝ちで上書きされる（S-11(a)）。片方の端末は refetch/再訪問で最新状態に収束する（roadmap 完了条件） |

### オフライン・楽観的更新のロールバック観点

| #                        | ケース                                                                             | 期待結果                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| O-01                     | オフライン状態で画面を再読み込み                                                   | precache/runtimeCaching 済みのシェル・直前の GET レスポンスが表示される（真っ白にならない）                                                                                    |
| O-02                     | オフライン状態でチェック操作を行う（書き込み）                                     | S-B5 の確定内容に従う。キューなし採用時はエラー表示、キューあり採用時は「同期待ち」等の UI 状態が必要                                                                          |
| O-03（楽観的更新採用時） | チェック送信後、UI は即座に `bought` 表示に切り替わるが、サーバーが 404/422 を返す | UI が元の状態（`pending`/直前の値）にロールバックされ、エラーメッセージが表示される                                                                                            |
| O-04（楽観的更新採用時） | チェック送信の楽観的更新中にネットワークエラー                                     | 同上のロールバック + 「通信エラーが発生しました。」表示                                                                                                                        |
| O-05（楽観的更新採用時） | 2 回連続で素早くチェック操作（連打）                                               | 二重送信でも AddItem のような非冪等な副作用（重複行）は発生しない（MarkAsBought は上書き冪等的挙動・S-11(a)）ため、多重送信ガード（`submitting` 相当）は UX 目的にとどめてよい |

---

## 6. 前提・制約

- **認証なし**（ADR-0003 / ADR-0004）。ShoppingList に userId は持たない。MVP1 の既存前提と同一。
- **MVP1・2 名利用**。「2 人で同じリストを見て、お互いの操作が反映される」は roadmap 完了条件上
  **「最低限 refetch で OK」**と明記されている（`docs/05-roadmap.md` 318 行）。リアルタイム同期
  （WebSocket 等）は不要。
- **週は土曜始まり**（ADR-0005）。`shoppingDate` は `mealPlan.weekOf.startDate()` 固定（S-10）で
  「実際に買った日」ではない。
- Unit A の全 5 API・DTO・エラー処理・冪等性（201/200 分岐）は**確定済みで変更しない**。
  Presentation 層はこれを消費するのみ。
- `packages/domain` / `packages/application` / `packages/infrastructure` / `packages/api-contract`
  への変更は本ユニットの対象外（既存を使う前提）。
- 品質ゲート: `pnpm lint` / `pnpm type-check` / `pnpm test`（Vitest。apps/web は Hono ルートテスト +
  RTL コンポーネントテストの先例あり）。

---

## 7. 5 論点の結論サマリ

| #   | 論点                               | 既存 API で取得可能か                                              | 根拠（実ファイル）                                                                        |
| --- | ---------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 1   | 画面の入口（mealPlanId → リスト）  | **yes**                                                            | `apps/web/src/server/routes/shopping-lists.ts:44-54`、ADR-0006、`shopping-list.schema.ts` |
| 2   | 生成 UI との連動（献立画面の導線） | データは yes（新規 API 不要）。導線範囲は画面設計論点              | `meal-plan-client.tsx`、`meal-plan.dto.ts`                                                |
| 3   | PWA オフライン強化                 | 読み取り: **yes**（既存依存の延長） / 書き込み: **no**（S-x 候補） | `apps/web/src/app/sw.ts`、`next.config.ts`                                                |
| 4   | チェック操作の楽観的更新           | データ面は yes。実装方式（TanStack Query 有無）は未確定            | `apps/web/package.json`（TanStack Query 不在）、`shopping-list.dto.ts`                    |
| 5   | 価格比較インジケーター             | 推奨店舗バッジ: **yes** / 金額差表示: **no**（N+1 懸念）           | `shopping-list.dto.ts`（targetStoreId）、`stores.ts`、`products.ts`、`product.dto.ts`     |
