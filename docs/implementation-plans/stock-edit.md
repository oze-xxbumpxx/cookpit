# 実装計画: stock-edit

- ステータス: ready
- 設計書: `docs/designs/stock-edit.md`（confirmed・P-1〜P-6 ユーザー確定・2026-08-07）
- 契約設計書: `docs/designs/stock-edit.contract.md`（confirmed）
- 試験計画: `docs/tests/stock-edit.md`（観点 ID: STK-UPD-\*, PT-UPD-\*, A-UPD-\*, Z-UPD-\*,
  INF-UPD-\*, WH-PUT-\*, SED-\*, CSP-\*, SR-EDIT-\*, PC-EDIT-\*, EXP-\*, REG-\*, MB-\*）
- 要件定義: `docs/requirements/stock-edit.md`
- 実装ルート: **Codex 委譲**（`docs/06-ai-tools.md` §実装ルートの使い分け）。
  **implementer は起動しない。** `create-codex-brief` 以降（`docs/tasks/codex/stock-edit/` への
  指示書分割・生成・Codex 実行・レビュー）はメインエージェント側で実施する。本計画は
  「分解・依存・完了条件」のみを扱う軽量版（IMP-2026-025 準拠）。**ファイル別の実装内容
  （関数シグネチャ・Zod スキーマ本体・JSX・コード片）はブリーフ側が正本であり、本書には
  再掲しない。** コード内容は設計書 §変更後構成・契約設計書 §2/§8 を参照すること。

---

## 概要

既存 Stock（数量・賞味期限・保存場所）の事後編集を可能にする新規 UseCase・API・UI と、
買い物完了パネルの賞味期限入力解禁を実装する。Domain の不変性方針転換（ADR-0016）を伴う。
**最重要リスクは Repository の `onConflictDoUpdate.set` 拡張漏れ**（実装上の罠。API・画面は
成功して見えるが DB に反映されない）であり、これを検出する PGlite 回帰テストと、現在この罠を
「正しい挙動」として固定している既存テスト 1 件の期待値更新を独立ステップとして扱う。

---

## 前提の確認（着手前に実測すべきこと）

以下は本計画作成時点（実装計画担当が実測済み）の前提。Codex 実装時にリポジトリの状態が
これと食い違っていた場合は実装を止めて Orchestrator へ差し戻すこと。

| #      | 前提                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 実測結果                                                                                                                                                                                                                                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PRE-1  | `DrizzlePantryRepository.save()` の `set` 句は現在 `amountValue` 1 列のみ                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | 実測確認済み（`packages/infrastructure/src/repositories/drizzle-pantry.repository.ts:37-46`。`sql` import 済み・`onConflictDoUpdate` は `sql\`excluded.amount_value\`` の 1 プロパティのみ）                                                                                 |
| PRE-2  | 既存テスト「同一 id の再 save() は amountValue のみ更新し不変フィールドを維持する」が罠を固定化している                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 実測確認済み（`packages/infrastructure/tests/repositories/drizzle-pantry.repository.test.ts:111-136`。`amountUnit`/`expiresAt`/`storedLocation` の「変更前の値のまま」を期待するアサーションが存在）                                                                         |
| PRE-3  | `Stock`/`Pantry` に編集系メソッドが無い                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 実測確認済み（`packages/domain/src/pantry/pantry.ts`。`consume`/`isEmpty` のみが可変操作、他は全 `readonly`）                                                                                                                                                                |
| PRE-4  | `packages/application/src/pantry/` は 4 UseCase のみ、更新系は無い                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 実測確認済み（`add-stock.use-case.ts`/`consume-stock.use-case.ts`/`discard-stock.use-case.ts`/`get-pantry.use-case.ts` + `index.ts` バレル。`AddStockUseCase` は try/catch 変換型の先例）                                                                                    |
| PRE-5  | `pantry.schema.ts` に `updateStockSchema` が無い                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 実測確認済み（`packages/api-contract/src/pantry.schema.ts`。`addStockSchema`/`consumeStockSchema`/`storageLocationSchema`/`stockResponseSchema`/`pantryResponseSchema` のみ）                                                                                                |
| PRE-6  | `routes/pantry.ts` に `PUT` が無い                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 実測確認済み（`apps/web/src/server/routes/pantry.ts`。GET/POST(add)/POST(consume)/POST(discard) の 4 本のみ）                                                                                                                                                                |
| PRE-7  | `complete-shopping-panel.tsx` L103 で `expiresAt: null` を固定送信                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 実測確認済み（`handleComplete()` 内 `additions.push({ ..., expiresAt: null })`）                                                                                                                                                                                             |
| PRE-8  | `dashboard-view.ts` に緊急度関数群が実装済み、`expiry.ts` は未作成                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 実測確認済み（`apps/web/src/app/_utils/dashboard-view.ts` に `parseExpiryDate`/`toLocalMidnight`（非公開）/`selectExpiringStocks`/`getExpiryRemainingDays`/`getExpiryUrgency`/`formatExpiryUrgencyLabel`。`expiryUrgencyChipClass` は `category-color.ts` にあり別ファイル） |
| PRE-9  | `stock-row.tsx`/`location-group.tsx`/`pantry-client.tsx` に編集導線・保存場所ラベル・緊急度チップが無い                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 実測確認済み。`StockRow` は品目名・数量・`〜N/N まで`・消費/廃棄ボタンのみ。`LocationGroup` の見出しにのみ保存場所が出る                                                                                                                                                     |
| PRE-10 | `/pantry` の `page.tsx` は `asOf` を渡していない（ダッシュボードの `page.tsx` は `now`/`EXPIRY_WITHIN_DAYS = 3` をローカル定数として持つ）                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 実測確認済み（`apps/web/src/app/pantry/page.tsx` と `apps/web/src/app/page.tsx` を比較）                                                                                                                                                                                     |
| PRE-11 | `price-record-edit-dialog.tsx` が編集ダイアログの先例として実在する                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 実測確認済み（`apps/web/src/app/products/[id]/_components/price-record-edit-dialog.tsx`）                                                                                                                                                                                    |
| PRE-12 | 既存テスト配置: `packages/domain/tests/pantry/pantry.test.ts`・`packages/application/tests/pantry/pantry-use-cases.test.ts`・`packages/api-contract/tests/pantry.schema.test.ts`・`apps/web/tests/server/routes/pantry.test.ts`・`apps/web/tests/app/pantry/_components/{stock-row,pantry-client,location-group,add-stock-form}.test.tsx`・`apps/web/tests/app/pantry/_utils/pantry-view.node.test.ts`・`apps/web/tests/app/shopping-lists/_components/complete-shopping-panel.test.tsx`・`apps/web/tests/app/_utils/{dashboard-view,category-color}.node.test.ts`・`apps/web/tests/app/_components/dashboard.test.tsx` | 全件 Glob で実在確認済み                                                                                                                                                                                                                                                     |

---

## 実装順序（層 → UI）

```
[Step 1] Infra 既存テスト期待値の先行修正（Red）
     ↓
[Step 2] Infra set 句 4 列拡張 + 新規回帰テスト（Green）
     ↓（Domain は Infra と独立実装可だが、Application が両方に依存するため直列に置く）
[Step 3] Domain: Stock.updateDetails / Pantry.updateStockDetails
     ↓
[Step 4] Application: UpdateStockDetailsUseCase
     ↓
[Step 5] api-contract: updateStockSchema
     ↓
[Step 6] Presentation route: PUT /api/pantry/stocks/:stockId
     ↓
[Step 7] UI基盤: expiry.ts への切り出し（純粋移動）
     ↓
[Step 8] UI: /pantry page.tsx・ダッシュボード page.tsx の asOf/閾値定数配線
     ↓
[Step 9] UI: stock-row.tsx / location-group.tsx / pantry-client.tsx（ラベル・チップ・編集導線）
     ↓
[Step 10] UI: stock-edit-dialog.tsx 新設（Step 6 の PUT・Step 9 の導線に依存）
     ↓
[Step 11] UI: complete-shopping-panel.tsx の expiresAt 解禁（Step 6 系とは独立、契約変更なし）
     ↓
[Step 12] 品質ゲート・回帰確認・manual-browser-verify
```

Step 11 は Step 1〜10 と契約上の依存が無い（契約設計書 §10「買い物完了 API は契約変更なし」）
ため、Codex ブリーフ分割時に Step 1〜10 と並行実行してよい。Step 7・8 は Step 1〜6（バックエンド）
と独立のため、バックエンド実装と並行できる。

---

## ステップ分解

### Step 1: Infrastructure 既存テスト期待値の先行修正（TDD Red）

- **対象ファイル**: `packages/infrastructure/tests/repositories/drizzle-pantry.repository.test.ts`
  （L111-136 の既存テスト 1 件）
- **変更内容**:
  - テスト名を「同一 id の再 save() は amountValue のみ更新し不変フィールドを維持する」から、
    4 列（amountValue/amountUnit/expiresAt/storedLocation）が更新される旨に改める。
  - `rows[0]?.amountUnit`（`'個'`）/ `rows[0]?.expiresAt`（`'2026-07-18'`）/
    `rows[0]?.storedLocation`（`'fridge'`）の 3 アサーションを、テスト内の `changed`
    （`Quantity.of(1.25, 'g')` / `expiresAt: 2026-07-19` / `storedLocation: 'freezer'`）に対応する
    **変更後の値**へ書き換える。
  - `rows[0]?.productId`（`'product-1'`）/ `rows[0]?.displayName`（`'玉ねぎ'`）/
    `rows[0]?.purchasedAt`（`PURCHASED_AT`）/ `rows[0]?.sourceShoppingItemId`
    （`'shopping-item-1'`）の 4 アサーションは**変更しない**（対象外フィールドの回帰ガードとして
    維持する）。
- **依存する前ステップ**: なし。
- **完了条件**:
  - `pnpm --filter @cookpit/infrastructure test` を実行し、**この 1 件のテストが Red（失敗）に
    なる**ことを確認する（現在の `set` 句が 1 列しか更新しないため）。Red になったことを
    Step 2 着手前の確認事項として記録する。
  - 他の既存テストは影響を受けず Green のまま。

### Step 2: Infrastructure `save()` の `set` 句を 4 列へ拡張（TDD Green）+ 新規回帰テスト

- **対象ファイル**: `packages/infrastructure/src/repositories/drizzle-pantry.repository.ts`
  （L37-46 の `save()` 内 `onConflictDoUpdate.set`）、
  `packages/infrastructure/tests/repositories/drizzle-pantry.repository.test.ts`（新規テスト追加）
- **変更内容**:
  - `set` 句を `amountValue`/`amountUnit`/`expiresAt`/`storedLocation` の 4 列に拡張する
    （設計書 §実装上の罠「対応」節のコードを実装。`sql\`excluded.<column>\``形式を維持）。`displayName`/`purchasedAt`/`productId`/`sourceShoppingItemId` は追加しない（対象外・
    設計書「対象外」節の確定事項）。
  - 新規回帰テストを追加する（試験計画 §5-2、INF-UPD-02〜08）。**必須**: 数量の**単位のみ**
    変更する往復テスト（INF-UPD-03。罠 2 の直接検出）と、4 項目同時変更の往復テスト
    （INF-UPD-07）。`find()` は新しい `DrizzlePantryRepository` インスタンスで呼ぶ（既存パターン
    踏襲・インスタンス内部キャッシュに依存した見かけ上の成功を排除）。
- **依存する前ステップ**: Step 1（Red の確認後に着手する）。
- **完了条件**:
  - `pnpm --filter @cookpit/infrastructure test` が全件 Green（Step 1 で Red にしたテストを含む）。
  - INF-UPD-02〜08（試験計画 §5-2）が実装され Green。
  - `pnpm --filter @cookpit/infrastructure type-check` / `pnpm lint` 通過。

### Step 3: Domain — `Stock.updateDetails` / `Pantry.updateStockDetails`

- **対象ファイル**: `packages/domain/src/pantry/pantry.ts`（追記）、
  `packages/domain/tests/pantry/pantry.test.ts`（追記）
- **変更内容**:
  - `Stock` に `updateDetails(props: { amount: Quantity; expiresAt: Date | null; storedLocation: StorageLocation | null }): void` を追加（設計書 §変更後構成 Domain のシグネチャ・JSDoc をそのまま実装）。
    **`amount.value <= 0` の場合は必ず自前で `Error` を throw する**（`Quantity.of()` は
    `value === 0` を許容するため、このチェックを省略しないこと。`Stock.create()` の既存チェックと
    同一パターン）。
  - `Pantry` に `updateStockDetails(stockId: StockId, props): void` を追加。既存 `findStock`
    （private）を再利用し、見つからない場合は**素の `Error('Stock not found')`** を throw する
    （`consumeStock`/`discardStock` と同型。`StockNotFoundError` は Application 層のクラスであり
    Domain から import してはならない — 依存方向違反）。
  - 対象外フィールド（`id`/`displayName`/`productId`/`purchasedAt`/`sourceShoppingItemId`）は
    変更しない。
  - テスト追加: 試験計画 §2-1（STK-UPD-01〜10）・§2-2（PT-UPD-01〜05）。特に STK-UPD-04
    （数量 0 拒否・最重要境界）と PT-UPD-02（`Error('Stock not found')` が素の `Error` である
    こと）を必須含める。
- **依存する前ステップ**: なし（Step 1/2 と独立に着手可）。
- **完了条件**:
  - `pnpm --filter @cookpit/domain test` 全件 Green（新規 describe を含む）。
  - `pnpm --filter @cookpit/domain type-check` / `pnpm lint` 通過。
  - `packages/domain` が他パッケージ（`@cookpit/application` 等）を import していないこと
    （依存方向の確認。`grep -r "@cookpit/application" packages/domain/src` が 0 件）。

### Step 4: Application — `UpdateStockDetailsUseCase`

- **対象ファイル**: `packages/application/src/pantry/update-stock-details.use-case.ts`（新規）、
  `packages/application/src/pantry/pantry.dto.ts`（`UpdateStockDetailsInputDto` 追記）、
  `packages/application/src/pantry/index.ts`（バレル追記）、
  `packages/application/tests/pantry/update-stock-details.use-case.test.ts`（新規。既存
  `pantry-use-cases.test.ts` への追記ではなく独立ファイルとする — 観点数が 14 件と多く、既存
  ファイルのこれ以上の肥大化を避けるため。`AddStockUseCase`/`ConsumeStockUseCase` 系テストの
  `InMemoryPantryRepository` を再利用できる場合は import、できない場合はこのファイル内で
  ローカル定義する）
- **変更内容**:
  - `UpdateStockDetailsInputDto`（`stockId`/`amount`/`expiresAt`/`storedLocation`。設計書
    §変更後構成 Application のシグネチャ）を追加。
  - `UpdateStockDetailsUseCase.execute()` を実装。**404 は事前チェック**（`pantry.stocks.find()`
    で対象が無ければ `StockNotFoundError` を throw。`ConsumeStockUseCase`/`DiscardStockUseCase`
    と同型）、**422 は try/catch 変換**（`pantry.updateStockDetails()` の呼び出しを try/catch し、
    Domain の素の `Error` を `InvalidStockOperationError` に変換。`AddStockUseCase` と同型）。
    **両方を組み合わせる**（設計書「404 / 422 の発生経路」表のとおり。存在しない `stockId` かつ
    数量 0 の複合ケースでは 404 を優先させる — 事前チェックを try/catch より先に実行する）。
  - `expiresAt` の往復規約は `add-stock.use-case.ts` と同一（`new Date(\`${input.expiresAt}T00:00:00\`)`）。
  - テスト追加: 試験計画 §3（A-UPD-01〜14）。特に A-UPD-07（404 優先）・A-UPD-08（422）・
    A-UPD-14（複合ケースで 404 が優先されることの確認）を必須含める。
- **依存する前ステップ**: Step 3（`Stock.updateDetails`/`Pantry.updateStockDetails` の型・例外
  仕様が確定していること）。
- **完了条件**:
  - `pnpm --filter @cookpit/application test` 全件 Green。
  - `pnpm --filter @cookpit/application type-check` / `pnpm lint` 通過。
  - A-UPD-14（404 優先の経路）がテストで固定されている。

### Step 5: api-contract — `updateStockSchema`

- **対象ファイル**: `packages/api-contract/src/pantry.schema.ts`（追記。配置位置は
  `addStockSchema` の直後）、`packages/api-contract/tests/pantry.schema.test.ts`（追記）
- **変更内容**:
  - `updateStockSchema` / `UpdateStockBody` を追加（契約設計書 §2.1 の定義そのまま。
    `amount`/`storedLocation`/`expiresAt` の 3 フィールドすべて必須キー・`addStockSchema` からの
    派生ではなく独立定義）。
  - `index.ts` への追記は**不要**（既存の `export *` が自動で公開する）。
  - テスト追加: 契約設計書 §9.1/§9.2、試験計画 §4（Z-UPD-01〜10）。**Z-UPD-08**（3 項目それぞれの
    キー省略を reject）と **Z-UPD-09**（`displayName` を送っても strip され reject しない）を
    必須含める。
- **依存する前ステップ**: なし（Step 1〜4 と独立に着手可）。
- **完了条件**:
  - `pnpm --filter @cookpit/api-contract test` 全件 Green。
  - `pnpm --filter @cookpit/api-contract type-check` 通過。
  - `UpdateStockBody` 型が `UpdateStockDetailsInputDto`（Step 4）の `amount`/`expiresAt`/
    `storedLocation` と構造的に一致すること（`pnpm type-check` で確認。契約設計書 §9.4）。

### Step 6: Presentation route — `PUT /api/pantry/stocks/:stockId`

- **対象ファイル**: `apps/web/src/server/routes/pantry.ts`（追記。既存
  `.post('/stocks/:stockId/discard', ...)` の直後に配置）、
  `apps/web/tests/server/routes/pantry.test.ts`（追記）
- **変更内容**:
  - `.put('/stocks/:stockId', zValidator('param', stockIdParamSchema), zValidator('json', updateStockSchema), ...)` を追加し、`UpdateStockDetailsUseCase` を呼ぶ（契約設計書 §1 のコードそのまま）。
  - `apps/web/src/server/app.ts` は**変更不要**（既存 `onError` の `NotFoundError`/
    `InvalidOperationError` 2 段分岐がそのまま拾う。契約設計書 §4-1 で実測確認済み）。
  - テスト追加: 試験計画 §6（WH-PUT-01〜07）。WH-PUT-04（400 × 4 パターン。`amount.value: 0` /
    `expiresAt` datetime 形式 / `storedLocation` enum 外 / キー省略）と WH-PUT-07（既存 4
    エンドポイントの回帰）を必須含める。
- **依存する前ステップ**: Step 4（UseCase）・Step 5（Zod スキーマ）。
- **完了条件**:
  - `pnpm --filter @cookpit/web test`（該当ファイル）全件 Green。
  - `pnpm --filter @cookpit/web type-check` 通過（Hono RPC の `AppType` に `.put()` が反映され、
    フロント側で `client.api.pantry.stocks[':stockId'].$put(...)` が型解決できることを Step 10
    実装時に確認する前提の土台になる）。
  - `app.ts` に差分が無いこと（git diff で確認）。

### Step 7: UI基盤 — `expiry.ts` への切り出し（純粋な移動）

- **対象ファイル**: `apps/web/src/app/_utils/expiry.ts`（新規）、
  `apps/web/src/app/_utils/dashboard-view.ts`（変更・re-import に変更）、
  `apps/web/tests/app/_utils/dashboard-view.node.test.ts`（import パス確認・必要なら追随）
- **変更内容**:
  - `getExpiryRemainingDays` / `getExpiryUrgency`（`ExpiryUrgency` 型含む）/
    `formatExpiryUrgencyLabel` と、これらが依存する非公開ヘルパー（`parseExpiryDate` /
    `toLocalMidnight`）を `dashboard-view.ts` から `expiry.ts` へ**ロジック無変更**で移動する。
  - `EXPIRY_URGENCY_WITHIN_DAYS = 3` を `expiry.ts` に `export const` として新設する
    （ダッシュボードの `page.tsx` にある現行のローカル定数 `EXPIRY_WITHIN_DAYS` の値をそのまま
    移設。値は変えない）。
  - `dashboard-view.ts` は `expiry.ts` からこれらを re-import する形に変更し、
    `selectExpiringStocks`（ダッシュボード固有の「上位 N 件選出」責務）はそのまま残す。
  - **`expiryUrgencyChipClass` は `category-color.ts` から動かさない**（設計書確定事項）。
  - `parseExpiryDate`/`toLocalMidnight` の扱い: `expiry.ts` 内に閉じ、`dashboard-view.ts` の
    `selectExpiringStocks` からは `expiry.ts` の公開関数（`getExpiryRemainingDays`）経由で
    利用する形に整理してよいが、既存の直接比較ロジック（`parseExpiryDate(stock.expiresAt) <= threshold`）をそのまま残す場合は該当ヘルパーも `expiry.ts` から export する。**いずれを選ぶかは
    「挙動不変」を最優先して実装時に判断する**（設計書「移設に伴う注意」節）。
  - 既存テストの import パス追随: `apps/web/tests/app/_utils/dashboard-view.node.test.ts` が
    移動対象の関数を直接 import している場合、`expiry.ts` からの import に変更する。
- **依存する前ステップ**: なし（バックエンド Step と独立）。
- **完了条件**:
  - `pnpm --filter @cookpit/web test`（`dashboard-view.node.test.ts`・`dashboard.test.tsx`）が
    移動前と**完全に同じ結果**で全件 Green（EXP-01/EXP-02。回帰なし）。
  - `pnpm --filter @cookpit/web type-check` 通過。
  - `apps/web/src/app/page.tsx`（ダッシュボード）はこの Step 単体では変更しない（Step 8 で
    `EXPIRY_URGENCY_WITHIN_DAYS` の参照に切り替える）。

### Step 8: UI — `/pantry` page.tsx・ダッシュボード page.tsx の `asOf`/閾値定数配線

- **対象ファイル**: `apps/web/src/app/pantry/page.tsx`（変更）、
  `apps/web/src/app/page.tsx`（変更。ローカル定数 `EXPIRY_WITHIN_DAYS` を `expiry.ts` の
  `EXPIRY_URGENCY_WITHIN_DAYS` の参照に置き換え）
- **変更内容**:
  - `/pantry` の `page.tsx` がダッシュボードの `page.tsx` と同型のパターンで `now = new Date()`
    を生成し、`PantryClient` に `pantry` と `asOf={now}` を props で渡すよう変更する。
  - ダッシュボードの `page.tsx` はローカル定数 `EXPIRY_WITHIN_DAYS = 3` を削除し、
    `expiry.ts` の `EXPIRY_URGENCY_WITHIN_DAYS` を import して使う（値は変わらないため
    `selectExpiringStocks(pantry.stocks, now, EXPIRY_URGENCY_WITHIN_DAYS)` の結果は不変）。
- **依存する前ステップ**: Step 7（`EXPIRY_URGENCY_WITHIN_DAYS` の定義）。`PantryClient` が
  `asOf` を受け取れるようになるのは Step 9 のため、この Step の変更は Step 9 と合わせて
  1 コミットにまとめてよい（`page.tsx` 単体では型エラーになる可能性があるため）。
- **完了条件**:
  - `pnpm --filter @cookpit/web type-check` 通過（Step 9 の `PantryClient` props 変更と合わせて
    確認する）。
  - `apps/web/tests/app/_components/dashboard.test.tsx` が回帰なく Green（EXP-03: 両画面で
    閾値が一致することの確認）。

### Step 9: UI — `stock-row.tsx` / `location-group.tsx` / `pantry-client.tsx`

- **対象ファイル**: `apps/web/src/app/pantry/_components/stock-row.tsx`（変更）、
  `apps/web/src/app/pantry/_components/location-group.tsx`（変更。`asOf`/`onEdit` の中継）、
  `apps/web/src/app/pantry/_components/pantry-client.tsx`（変更。`asOf` props 追加・編集対象
  state・`StockEditDialog` 結線）、
  `apps/web/tests/app/pantry/_components/{stock-row,location-group,pantry-client}.test.tsx`（追記）
- **変更内容**:
  - `stock-row.tsx`: 保存場所ラベルを**常時表示**（`storedLocation: null` でも「未設定」表示
    等でレイアウトが崩れないこと）。緊急度チップは `expiresAt !== null` かつ
    `getExpiryRemainingDays` の結果が `EXPIRY_URGENCY_WITHIN_DAYS` 以内（`/pantry` は全在庫一覧
    のため、ダッシュボードと異なり自前で閾値判定が必要 — 設計書「`/pantry` カードへの…」節の
    理由をそのまま踏襲）の場合にのみ `getExpiryUrgency`/`expiryUrgencyChipClass` で表示する。
    「編集」ボタンを追加し `onEdit(stock)` を呼ぶ（既存「消費」「廃棄」ボタンと並び）。
  - `location-group.tsx`: `asOf`/`onEdit` を props として受け取り `StockRow` へ中継する。
  - `pantry-client.tsx`: `asOf` を props で受け取り `LocationGroup` へ伝播する。編集対象
    `StockDto | null` を state で保持し、`StockEditDialog`（Step 10）を条件付きレンダリングする。
    **既存の `useApiAction`（consume/discard の pending 管理）とは独立させる**（設計書「起動
    導線」節。編集ダイアログはパターン C = ローカル `useState` + `router.refresh()`）。
  - テスト追加: 試験計画 §7-3（SR-EDIT-01〜06）・§7-4（PC-EDIT-01〜02）。SR-EDIT-03/04（閾値内
    外での表示/非表示の出し分け）を必須含める。
- **依存する前ステップ**: Step 7・8（`asOf`/`EXPIRY_URGENCY_WITHIN_DAYS` の配線）。
  `StockEditDialog` 自体は Step 10 だが、`onEdit` の呼び出し口はこの Step で作る
  （`stock-edit-dialog.test.tsx` 側のダイアログ本体テストは Step 10 に属する）。
- **完了条件**:
  - `pnpm --filter @cookpit/web test`（該当 3 ファイル）全件 Green。
  - `pnpm --filter @cookpit/web type-check` 通過。
  - `apps/web/tests/app/pantry/_components/location-group.test.tsx` の既存観点が回帰なく Green。

### Step 10: UI — `stock-edit-dialog.tsx` 新設

- **対象ファイル**: `apps/web/src/app/pantry/_components/stock-edit-dialog.tsx`（新規）、
  `apps/web/tests/app/pantry/_components/stock-edit-dialog.test.tsx`（新規）
- **変更内容**:
  - `price-record-edit-dialog.tsx`（`apps/web/src/app/products/[id]/_components/price-record-edit-dialog.tsx`）の構造を踏襲（設計書「編集ダイアログ」節）。
    Props `{ stock: StockDto | null, onOpenChange }`、`open = stock !== null`、
    `useEffect([stock?.id])` で初期値投入、フィールドは数量（`QuantityField` +
    `parseQuantity`）/ 保存場所（`SelectField` + `LOCATION_SELECT_OPTIONS`）/ 賞味期限
    （`Input type="date"`）の 3 つ。送信は
    `client.api.pantry.stocks[':stockId'].$put({ param: { stockId: stock.id }, json: body })`。
    成功時 `onOpenChange(false)` → `router.refresh()`。404/422/通信エラーの分岐は
    `price-record-edit-dialog.tsx` と同型。
  - `pantry-client.tsx`（Step 9）から `stock`/`onOpenChange` を受け取る形で結線する
    （このステップで `pantry-client.tsx` に軽微な追記が発生する場合、Step 9 の diff に含めてよい）。
  - テスト追加: 試験計画 §7-1（SED-01〜12）。SED-07（クライアント側で数量 0 以下を送信前に
    弾く）・SED-05（404 分岐）・SED-06（422 の `fieldErrors` 反映）を必須含める。
- **依存する前ステップ**: Step 6（PUT エンドポイントの型が確定していること）、Step 9
  （`onEdit`/state 結線先が存在すること）。
- **完了条件**:
  - `pnpm --filter @cookpit/web test`（`stock-edit-dialog.test.tsx`）全件 Green。
  - `pnpm --filter @cookpit/web type-check` 通過（`client.api.pantry.stocks[':stockId'].$put`
    の型が Hono RPC 経由で解決できること）。

### Step 11: UI — `complete-shopping-panel.tsx` の `expiresAt` ハードコード解除

- **対象ファイル**: `apps/web/src/app/shopping-lists/_components/complete-shopping-panel.tsx`
  （変更。L103 付近と `RowState`/`StockAdditionRow`）、
  `apps/web/tests/app/shopping-lists/_components/complete-shopping-panel.test.tsx`（追記）
- **変更内容**:
  - `RowState` に `expiresAt: string`（date input の値）と `expiresAtExpanded: boolean` を追加。
  - `StockAdditionRow` に「賞味期限を設定」ボタン（既定非表示。押すと `Input type="date"` を
    含む行が**独立した行として**展開される。数量/保存場所の横並び行には追加しない — モバイル
    幅 375px での破綻回避、設計書 R-2 対策）。展開中は「賞味期限を削除」に文言が変わり、
    押すと値をクリアして折りたたむ。
  - `handleComplete()` の `additions.push(...)` の `expiresAt: null` 固定を
    `expiresAt: row.expiresAt === '' ? null : row.expiresAt` に変更。
  - **契約・DTO・UseCase は変更不要**（契約設計書 §10 で確認済み。`stockAdditionSchema`/
    `CompleteShoppingUseCase` は無変更）。
  - **既存の `checked`/`amountText`/`storedLocation` のロジックには手を入れない**（設計書 R-4
    対策・回帰リスク低減）。
  - テスト追加: 試験計画 §7-2（CSP-01〜06）。CSP-02（展開せず完了すると `expiresAt: null` が
    送られる = 既存動作の回帰確認）と CSP-06（既存ロジックへの回帰なし）を必須含める。
- **依存する前ステップ**: なし（契約変更が無いため Step 1〜10 と完全に独立）。
- **完了条件**:
  - `pnpm --filter @cookpit/web test`（`complete-shopping-panel.test.tsx`）全件 Green
    （既存ケース + 新規 CSP-01〜06）。
  - `pnpm --filter @cookpit/web type-check` 通過。
  - `packages/api-contract/src/shopping-list.schema.ts` に diff が無いこと（契約変更なしの確認）。

### Step 12: 品質ゲート・回帰確認・manual-browser-verify

- **対象**: リポジトリ全体（コード変更なし。確認のみ）
- **内容**:
  - `pnpm lint` / `pnpm type-check` / `pnpm test`（全 workspace）を実行し、REG-01〜REG-08
    （試験計画 §8）に対応する回帰確認を行う。特に **REG-05**（在庫引き算
    `GenerateShoppingListUseCase.applyPantryDeduction` の既存テストが単位編集の導入後も
    全件 Green）と **REG-06**（買い物完了の冪等性ガードの回帰）を確認する。
  - `docs/tests/stock-edit.md` §10 の manual-browser-verify を実施し、S-1〜S-7 の前提データを
    すべてシードした上で MB-01〜MB-16 を実行する（「該当データなしのため確認できず」を PASS と
    報告することは禁止。試験計画の該当節を参照）。
  - `pantry-core.md` S-4 案 α の記述箇所に「stock-edit で覆された」旨の注記を追記する
    （設計書リスク R-3 の対応。**設計書に明記された、実装計画フェーズで対応すべき軽微な
    ドキュメント更新**。追記のみで S-4 案 α 自体の記述は削除しない）。
- **依存する前ステップ**: Step 1〜11 すべて。
- **完了条件**:
  - `pnpm lint` / `pnpm type-check` / `pnpm test` が全 workspace で成功。
  - manual-browser-verify の MB-01〜MB-16 が PASS/FAIL/未実施のいずれかで記録され、
    「該当データなしを PASS」とした報告が無い。
  - `docs/designs/pantry-core.md` への注記追記が完了。
  - スコープ外の変更（`displayName`/`purchasedAt`/`productId`/`sourceShoppingItemId` の
    編集機能、DB マイグレーション、認証等）が含まれていないこと。

---

## テスト計画への参照

各ステップの試験観点は `docs/tests/stock-edit.md` の該当節を参照。ID の対応は以下のとおり
（内容は再掲しない）。

| ステップ  | 試験観点 ID                                        |
| --------- | -------------------------------------------------- |
| Step 1・2 | INF-UPD-01〜08（§5）                               |
| Step 3    | STK-UPD-01〜10, PT-UPD-01〜05（§2）                |
| Step 4    | A-UPD-01〜14（§3）                                 |
| Step 5    | Z-UPD-01〜10（§4）                                 |
| Step 6    | WH-PUT-01〜07（§6）                                |
| Step 7・8 | EXP-01〜03（§7-5）                                 |
| Step 9    | SR-EDIT-01〜06, PC-EDIT-01〜02（§7-3, §7-4）       |
| Step 10   | SED-01〜12（§7-1）                                 |
| Step 11   | CSP-01〜06（§7-2）                                 |
| Step 12   | REG-01〜08（§8）, 特性観点（§9）, MB-01〜16（§10） |

E2E（Playwright）は対象外（試験計画 §11 で確定済み）。

---

## リスクと対策

| #                       | リスク                                                                                                                | 影響                                                             | 対策（対応ステップ）                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| R-1                     | Repository の `set` 句拡張漏れ・部分漏れ（特に `amount_unit` のみ漏れる「罠 2」は値が変わって見えるため気づきにくい） | 編集が見かけ上成功しリロードで消える。ユーザー体験を著しく損なう | Step 1（Red 化）→ Step 2（Green 化 + 単位のみ変更ケース必須）                                                        |
| R-2                     | 完了パネルの日付入力追加でモバイル幅（375px）が崩れる                                                                 | 買い物完了という主要導線が視覚的に破綻する                       | Step 11 で独立行として追加（既存の横並び行に詰め込まない）。Step 12 の MB-14 で目視確認                              |
| R-3                     | Domain 不変性方針変更（ADR-0016）と `pantry-core.md` S-4 案 α の記述が矛盾したまま残る                                | 将来の実装者が古い決定を正と誤認する                             | Step 12 で `pantry-core.md` に注記追記                                                                               |
| R-4                     | `complete-shopping-panel.tsx` は完成済み既存ファイルで、改修が既存テストの回帰を招く                                  | 既存の完了フローが壊れる                                         | Step 11 で既存 `checked`/`amountText`/`storedLocation` ロジックに手を入れない。CSP-06 で回帰確認                     |
| R-5                     | 数量の単位編集が在庫引き算（`applyPantryDeduction`）の噛み合いを変える                                                | 献立作成時の買い物リスト生成結果が意図せず変わる可能性           | 本ユニットでロジック変更はしない（対象外）。Step 12 の REG-05 で既存回帰テストを確認                                 |
| R-6                     | 数量を編集で 0 に設定しようとする操作                                                                                 | `consumeStock` の「0 で除去」概念と衝突し意味論が曖昧になる      | Step 3（Domain 側 throw）+ Step 4（422 変換）+ Step 5（契約層 400 で早期拒否）の 3 段防御                            |
| R-7                     | `expiry.ts` 切り出しがダッシュボード表示に意図せぬ回帰を起こす                                                        | ダッシュボードの賞味期限表示が壊れる                             | Step 7 を純粋な移動に限定し、EXP-01/EXP-02 で移動直後に既存テスト全件 Green を確認してから Step 8/9 の新規利用に進む |
| R-8（実装計画側で追加） | Step 9/10 の相互依存（`onEdit` の受け口と `StockEditDialog` 本体）を誤った順序で実装すると型エラーが長引く            | Codex 実装効率の低下（機能リスクではない）                       | Step 9 と Step 10 は同一 Codex ブリーフにまとめることを推奨（本書「Codex タスク分割の目安」参照）                    |

---

## ロールバック手順

本ユニットは単一 PR/デプロイでリリースする（設計書「移行とリリース」節。機能フラグ無し）。
DB マイグレーションが無い（スキーマ変更なし）ため、ロールバックは**コードの revert のみ**で
完結する。

1. 本ユニットの PR を `git revert`（または該当コミット群の revert）する。
2. DB マイグレーション・データ移行は本ユニットに含まれないため、ロールバック時の DB 操作は
   不要（`stocks` テーブルの既存 nullable 列をそのまま使っているため）。
3. revert 後、以下を確認する:
   - `PUT /api/pantry/stocks/:stockId` が消え、既存 4 エンドポイント（GET/POST(add)/
     POST(consume)/POST(discard)）のみに戻ること。
   - `stock-row.tsx`/`pantry-client.tsx`/`complete-shopping-panel.tsx` が編集前の挙動に戻ること。
   - `Stock`/`Pantry` の Domain 層が readonly の状態（`updateDetails`/`updateStockDetails` が
     消える）に戻ること。
4. 部分ロールバックは推奨しない（Step 1・2 のみ revert して Step 3〜 を残す、等の分割 revert は
   `set` 句が再び 1 列に戻ることで新しい編集 API がサイレントに壊れるため危険）。ロールバックは
   本ユニット全体を一括で行う。

---

## Codex タスク分割の目安（参考。確定は create-codex-brief 側）

`docs/tasks/codex/stock-edit/` への分割時の目安。層単位でまとめると Step 1〜2（Infra）・
Step 3（Domain）・Step 4〜6（Application/api-contract/Presentation。相互依存が強く 1 本の
ブリーフにまとめやすい）・Step 7〜10（UI 本体。`expiry.ts` 切り出し→配線→表示→ダイアログの
順で 1 本、または Step 7・8 とStep 9・10 で 2 本に分割）・Step 11（完了パネル。独立実行可）の
**4〜5 本**を想定する。最終的なブリーフ分割・粒度は `create-codex-brief` 実行時に確定する。

| #   | まとめるステップ | 対象層                                                             |
| --- | ---------------- | ------------------------------------------------------------------ |
| 1   | Step 1・2        | Infrastructure                                                     |
| 2   | Step 3           | Domain                                                             |
| 3   | Step 4・5・6     | Application / api-contract / Presentation                          |
| 4   | Step 7・8・9・10 | UI（`/pantry` 系）                                                 |
| 5   | Step 11          | UI（買い物完了パネル。独立実行可）                                 |
| —   | Step 12          | 品質ゲート・回帰確認（全ブリーフ完了後にメインエージェントが実施） |

---

## 完了条件（Definition of Done 対応）

`docs/claude-code/definition-of-done.md` と `.claude/rules/coding-standards.md` §品質ゲートに
対応。

- [ ] `pnpm lint` が成功する。
- [ ] `pnpm type-check` が成功する。
- [ ] `pnpm test`（Vitest。Domain/Application/api-contract/Infrastructure/apps/web の全層）が
      成功する。変更したパッケージの該当テストが追加・実行されている
      （Step 1〜11 の各「完了条件」を参照）。
- [ ] `pnpm format` が必要に応じて実行されている。
- [ ] 試験計画 `docs/tests/stock-edit.md` の観点（Domain/Application/api-contract/Infrastructure/
      Presentation/UI の各層）が実装され Green。特に INF-UPD-03（単位のみ変更）と
      Step 1 の Red 確認が実施されている。
- [ ] manual-browser-verify（§10）が S-1〜S-7 の前提データをすべて用いて実施され、
      MB-01〜MB-16 が記録されている。
- [ ] `docs/designs/pantry-core.md` に「stock-edit で覆された」旨の注記が追記されている（R-3）。
- [ ] スコープ外の変更（`displayName`/`purchasedAt`/`productId`/`sourceShoppingItemId` の編集、
      DB マイグレーション、認証・認可、賞味期限アラート/Web Push、消費・廃棄の取り消し）が
      含まれていない。
- [ ] ADR-0016（Domain 不変性方針の変更）が設計フェーズで作成済みであることを確認済み
      （新規作成は不要）。
