# レビュー記録: pantry-core（Sprint 5 Unit A / L3）

feature 全体のレビュー記録。タスク単位（Codex 委譲 Task 1〜5）で追記していく。

---

## Task 1: Domain 層 — Quantity.subtract() + Pantry 集約（受け入れレビュー）

- 実施日: 2026-07-16
- 実装ルート: Codex 委譲（指示書: `docs/tasks/codex/pantry-core/01-domain.md`）
- レビュー手順: review-codex-implementation Skill（機械チェック → 品質ゲート → 人間チェックリスト → 敵対的精査パス）
- ブランチ: `feature/pantry-core-domain`（基準コミット `60d3166`。レビュー時点では未コミットの作業ツリー）
- 正典: 設計書 `docs/designs/pantry-core.md`（S-1/S-3/S-5/S-7・D-2）/ 実装計画
  `docs/implementation-plans/pantry-core.md` §Task 1
- **判定: 受け入れ可（差し戻しなし。Must 0 / Should 0 / 申し送り 0）**

### レビュー範囲

| ファイル                                          | 内容                                                          |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `packages/domain/src/shared/quantity.ts`          | `subtract()` 追記（S-7・厳格 throw）                          |
| `packages/domain/src/pantry/pantry-id.ts`         | `PantryId`（`singleton()` のみ・`generate()` なし。S-1/D-2）  |
| `packages/domain/src/pantry/stock-id.ts`          | `StockId`（`ProductId` パターン完全踏襲）                     |
| `packages/domain/src/pantry/pantry.ts`            | `Pantry` 集約 + `Stock` + `StorageLocation` + 入力型（IMP-7） |
| `packages/domain/src/pantry/pantry.repository.ts` | `PantryRepository` IF（`find()` 非 null 契約）                |
| （+ 上記各 `.test.ts` 4 ファイル）                | 単体テスト（新規 30 + quantity 追加 5 = 35）                  |

`packages/domain/src/index.ts` は無変更（IMP-8 どおり）を git status で確認。

### 機械チェック + 品質ゲート

- check-codex-implementation.mjs: 対象 5 ファイル・識別子 420 件照合 → **FAIL 0 / WARN 0 / INFO 0**
- run-quality-gates.sh: lint / type-check / test すべて **PASS**（全パッケージ green・既存テストに
  regression なし）

### チェックリスト（docs/06-ai-tools.md 全 8 項目）

| 項目                  | 判定             | 根拠                                                                                                        |
| --------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------- |
| 識別子のタイポ        | PASS             | スクリプト 0 件 + 指示書シグネチャと目視照合で完全一致                                                      |
| Tailwind タイポ・連結 | PASS（対象なし） | Domain 層のみ、UI 変更なし                                                                                  |
| ハンドラ結線漏れ      | PASS（対象なし） | 同上                                                                                                        |
| 'use client'          | PASS（対象なし） | 同上                                                                                                        |
| `import type` 規約    | PASS             | 型のみ使用の `ProductId`/`ShoppingItemId` は `import type`、runtime 使用の `Quantity`/ID 2 種は値インポート |
| 命名の傾向ずれ        | PASS             | `stockIdValue`/`pantryIdValue`/`stockXxx`/`pantryXxx` は ProductId・ShoppingList の既存規約どおり           |
| 差し戻しの部分反映    | N/A              | 初回レビュー                                                                                                |
| バリデーション分岐    | PASS             | `Stock.create` の空白 displayName・`amount <= 0` 拒否 / `consume` の単位不一致拒否をすべて実装 + テスト担保 |

実画面確認は画面変更を含まないため対象外。

### 敵対的精査パスで確認した点（問題なし）

- **指示書コードとの照合**: `pantry.ts`（201 行）・`pantry-id.ts`・`pantry.repository.ts`・
  `Quantity.subtract()` は指示書の確定コードと**逐語一致**。`stock-id.ts` は `product-id.ts` を
  一字一句踏襲（プロパティ名 `stockIdValue`）
- **S-7 の責務分離（IMP-R5 の重点確認）**: `Quantity.subtract()` は負値で throw（テストが
  `'Quantity must be non-negative'` の実メッセージを固定）、全量クランプは `Stock.consume()` の
  `>=` 境界で実装。「ちょうど一致 → 0 + isEmpty」「超過 → 0 クランプ」の両境界をテスト済み
- **ゼロ到達時の集約からの削除**: `consumeStock` の isEmpty 削除・`discardStock` の残量無関係削除・
  過剰消費経由の削除まで 3 経路すべてテスト済み
- **S-3 の冪等キー**: `hasStockFromShoppingItem` の 3 パターン（一致 true / null のみ false /
  不一致 false）をテスト済み
- **防御的コピー**: `purchasedAt`/`expiresAt`/`Pantry.stocks` の全 getter を変異テストで担保
  （Mapper が Domain 内部状態を書き換える事故の予防。Task 1 リスク欄どおり)
- **指示書要求を超える良い追加**: `Stock.reconstruct` が `amount 0` を検証なしで復元するテスト
  （DB 復元経路では create 検証を通さない仕様の固定）

### 申し送り

なし。

---

## Task 4: API Contract 層 — pantry.schema.ts（受け入れレビュー）

- 実施日: 2026-07-17
- 実装ルート: Codex 委譲（指示書: `docs/tasks/codex/pantry-core/04-api-contract.md`）
- レビュー手順: review-codex-implementation Skill（機械チェック → 品質ゲート → 人間チェックリスト → 敵対的精査パス）
- ブランチ: `feature/pantry-api-contract`（基準コミット `a325d99`。レビュー時点では未コミットの作業ツリー）
- 正典: 契約書 `docs/designs/pantry-core-contract.md` §1（confirmed）/ 指示書 Task 4
- **判定: 受け入れ可（差し戻しなし。Must 0 / Should 0 / 申し送り 0）**

### レビュー範囲

| ファイル                                          | 内容                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `packages/api-contract/src/pantry.schema.ts`      | 新規。スキーマ 5 本 + `z.infer` 型 5 本                                                               |
| `packages/api-contract/src/pantry.schema.test.ts` | 新規。契約テスト 35 件                                                                                |
| `packages/api-contract/src/index.ts`              | `export * from './pantry.schema';` の 1 行追記のみ（git diff で既存 export の並び・内容無変更を確認） |

`shopping-list.schema.ts` ほか既存 4 契約ファイルは無変更（merge-base 比 diff で確認。完了条件どおり）。

### 機械チェック + 品質ゲート

- check-codex-implementation.mjs: 対象 2 ファイル・識別子 420 件照合 → **FAIL 0 / WARN 0 / INFO 0**
- run-quality-gates.sh: lint / type-check / test すべて **PASS**（api-contract 106 テスト
  〔うち pantry.schema.test.ts 35 件〕を含む全パッケージ green・既存テストに regression なし）

### チェックリスト（docs/06-ai-tools.md 全 8 項目）

| 項目                  | 判定             | 根拠                                                                                                                 |
| --------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| 識別子のタイポ        | PASS             | スクリプト 0 件 + 契約書 §1.1 と目視照合で 5 スキーマ・5 型とも綴り完全一致                                          |
| Tailwind タイポ・連結 | PASS（対象なし） | api-contract 層のみ、UI 変更なし                                                                                     |
| ハンドラ結線漏れ      | PASS（対象なし） | 同上                                                                                                                 |
| 'use client'          | PASS（対象なし） | 同上                                                                                                                 |
| `import type` 規約    | PASS             | 値使用の `unitSchema` / 各スキーマは値インポート、型のみの `PantryDto`/`StockDto`/`StockResponse` 等は `import type` |
| 命名の傾向ずれ        | PASS             | スキーマ名・param キー（`stockId`）とも指示書「命名・記法の注意」と一致                                              |
| 差し戻しの部分反映    | N/A              | 初回レビュー                                                                                                         |
| バリデーション分岐    | PASS             | `consumeStockSchema.amount.value` は `positive()`（`min(0)` ではない）。D-6 の 0 reject を目視 + テストで確認        |

実画面確認は画面変更を含まないため対象外。

### 敵対的精査パスで確認した点（問題なし）

- **契約書との照合**: `pantry.schema.ts` は契約書 §1.1 の確定コードと**逐語一致**
  （import・スキーマ 5 本・型 5 本・D-6/D-2/D-7 コメント位置まで）。`index.ts` 追記も §1.2 どおり
- **`unitSchema` の再利用**: `recipe.schema.ts` から import（独自定義なし）。テストの
  `VALID_UNITS` 17 値は `unitSchema` の enum 定義と順序含め完全一致
- **D-6 の意図的な非対称**: 0 reject テストが同一テスト内で `addItemSchema.requiredAmount.value`
  の 0 許容を併記し、`addItemSchema` との差分を退行防止として明示（契約書 §7.3 の要求どおり）
- **DTO との構造一致**: fixture を `StockDto` / `PantryDto` 型（`@cookpit/application` の
  `import type`）で宣言し、parse 結果を `StockResponse` / `PantryResponse` に代入 +
  `toEqual` で round-trip 確認。application を型のみ参照するのは
  `shopping-list.schema.test.ts`（`ShoppingListDto`）の既存先例どおりで、devDependency も宣言済み
- **日付形式の境界**: `purchasedAt` に date-only 文字列を reject / `expiresAt` に
  **datetime 文字列を date として reject**（`2026-07-24T00:00:00.000Z`）+ `2026/07/24` の
  区切り違いも reject。指示書のテスト表の要求を満たす
- **discard / 完了 API 用の余計なスキーマを作っていない**（指示書「過去の Codex ミス実績への
  先回り」項目。新規スキーマは 5 本のみ）

### 申し送り

なし。

---

## Task 5: Presentation 層 — pantry ルート 3 本 + complete + app.ts 統合（受け入れレビュー）

- 実施日: 2026-07-19
- 実装ルート: Codex 委譲（指示書: `docs/tasks/codex/pantry-core/05-presentation.md`）
- レビュー手順: review-codex-implementation Skill（機械チェック → 品質ゲート → 人間チェックリスト → 敵対的精査パス）
- ブランチ: `feature/pantry-core-presentation`（基準コミット `d1453c8`。レビュー時点では未コミットの作業ツリー）
- 正典: 契約書 `docs/designs/pantry-core-contract.md` / 指示書 Task 5
- **判定: 受け入れ可（差し戻しなし。Must 0 / Should 1 / 申し送り 1）**

### レビュー範囲

| ファイル                                            | 内容                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web/src/server/routes/pantry.ts`              | 新規。`pantryRoute`（GET `/`・POST consume・POST discard の 3 本）                       |
| `apps/web/src/server/routes/pantry.test.ts`         | 新規。ルートテスト 10 件                                                                 |
| `apps/web/src/server/routes/shopping-lists.ts`      | 追記。`POST /:id/complete`（既存 5 エンドポイントの定義・順序は無変更）                  |
| `apps/web/src/server/routes/shopping-lists.test.ts` | 追記。complete テスト 4 件（既存 33 件は無変更・全 37 件 green）                         |
| `apps/web/src/server/app.ts`                        | 追記。`/pantry` マウント + onError 2 分岐（既存 9 分岐の順序・挙動は diff で無変更確認） |

### 機械チェック + 品質ゲート

- check-codex-implementation.mjs: 対象 3 ファイル（`*.test.ts` はスクリプトの設計上対象外）・
  識別子 420 件照合 → **FAIL 0 / WARN 0 / INFO 0**
- run-quality-gates.sh: lint / type-check / test すべて **PASS**（web 265 テスト
  〔うち pantry.test.ts 10 件・shopping-lists.test.ts 37 件〕を含む全パッケージ green）。
  lint warning 1 件は既存ファイル `product-form-fields.test.tsx` の未使用変数で今回スコープ外

### チェックリスト（docs/06-ai-tools.md 全 8 項目）

| 項目                  | 判定             | 根拠                                                                                                                            |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 識別子のタイポ        | PASS             | スクリプト 0 件 + 指示書シグネチャと目視照合（`pantryRoute` / `stockIdParamSchema` / `consumeStockSchema` / UseCase 4 本）      |
| Tailwind タイポ・連結 | PASS（対象なし） | サーバールートのみ、UI 変更なし                                                                                                 |
| ハンドラ結線漏れ      | PASS             | `app.ts` の `.route('/pantry', pantryRoute)` マウントと onError 2 分岐を目視。テストが 4 エンドポイントすべてを実呼び出しで検証 |
| 'use client'          | PASS             | スクリプト 0 件。サーバーサイドのため不要（付いていないことを目視確認）                                                         |
| `import type` 規約    | PASS             | `pantry.test.ts` の `PantryDto`/`StockDto`/`ApplicationModule` は `import type`。値インポートは実行時使用のみ                   |
| 命名の傾向ずれ        | PASS             | `pantryRoute` 単数・パス小文字 `stocks`/`consume`/`discard`/`complete`。ファクトリ配置のずれのみ申し送り 1 へ                   |
| 差し戻しの部分反映    | N/A              | 初回レビュー                                                                                                                    |
| バリデーション分岐    | PASS             | consume は param + json、discard は param のみ、complete は既存 `shoppingListIdParamSchema` 再利用（新規スキーマ import なし）  |

実画面確認は画面変更を含まない（API のみ）ため対象外。

### 敵対的精査パスで確認した点（問題なし）

- **UseCase シグネチャ照合**: `CompleteShoppingUseCase` のコンストラクタ順
  shoppingList → pantry → product → mealPlan が実装（`complete-shopping.use-case.ts`）と一致。
  `ConsumeStockInputDto` `{ stockId, amount }` / `DiscardStockInputDto` `{ stockId }` と
  ルートの `execute()` 呼び出しが一致
- **complete に 201 分岐なし**: 常に 200。「2 回連続でも同じ形を 200 で返す」テストで
  契約レベルの冪等を固定（ADR-0006 の Generate 201/200 分岐との意図的差異どおり）
- **`GET /api/pantry` に 404 分岐なし**: `.get('/')` のみ。空 Pantry → 200 + `{ stocks: [] }`
  テストあり（S-1）
- **onError 挿入位置**: `InvalidShoppingListStateError` 直後・`console.error` 前（指示書どおり）。
  既存 9 分岐は diff で無変更
- **エラーメッセージまで検証**: 404 / 422 テストが `err.message` 変換を JSON 本文の
  `toEqual` まで確認
- **余計なエンドポイントなし**: 3 + 1 本のみ。在庫直接追加 API・一覧クエリ・complete の
  ショートカット等は未作成
- **`export const routes` / `export default app` 無変更**（lint 回避の既存構造を保持）
- **テスト網羅**: 指示書のテスト表全ケースを網羅（pantry 10 件・complete 4 件。
  amount 0 → 400〔D-6〕・不正 uuid → 400・404 / 422 変換を含む）

### 申し送り

1. **[Should] `pantryRepository()` のローカル重複定義**: `pantry.ts` と `shopping-lists.ts` の
   2 箇所に同一の 3 行ファクトリがローカル定義されている。既存傾向は
   `apps/web/src/server/repositories.ts` の共有ファクトリ（5 本）に集約する形。
   指示書 Task 5 §2 の「既存ファクトリ関数群の末尾に追加」が `repositories.ts` の存在を
   反映していなかったことに起因し、Codex は指示書どおりに実装している（Codex のミスではない）。
   動作・品質ゲートに影響はないため受け入れは妨げず、`repositories.ts` へ移して両ファイルから
   import する小整理を後続タスクとして推奨。

---

## Task 2: Infrastructure 層 — stocks スキーマ + DrizzlePantryRepository（遡及受け入れレビュー）

- 実施日: 2026-07-19（**遡及レビュー**。実装は 2026-07-17・main マージ済み。logs 7/15 持ち越し分の解消）
- 実装ルート: Codex 委譲（指示書: `docs/tasks/codex/pantry-core/02-infrastructure.md`）
- レビュー手順: review-codex-implementation Skill（機械チェック → 品質ゲート → 人間チェックリスト → 敵対的精査パス）
- レビュー対象: **main の現行状態**（実装コミット `025295c`〜`f269f78` + 後続の prettier 一括整形
  `e5ed14a`・共通化リファクタ `c8686ea`〔ユーザー実施〕適用後）
- 正典: 契約書 `docs/designs/pantry-core-contract.md` §2 / 指示書 Task 2
- **判定: 受け入れ可（差し戻しなし。Must 0 / Should 0 / 申し送り 1〔Nice〕）**

### レビュー範囲

| ファイル                                                                     | 内容                                                                       |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/infrastructure/src/db/schema.ts`                                   | `stocks` テーブル + `StockRow`/`NewStockRow` 追記                          |
| `packages/infrastructure/src/testing/create-test-db.ts`                      | DDL に `stocks` + index 追記                                               |
| `apps/web/src/db/migrations/0007_tranquil_the_anarchist.sql` ほか            | 自動生成マイグレーション + journal/snapshot                                |
| `packages/infrastructure/src/repositories/drizzle-pantry.repository.ts`      | `DrizzlePantryRepository` 新規                                             |
| `packages/infrastructure/src/repositories/drizzle-pantry.repository.test.ts` | PGlite 統合テスト 9 件                                                     |
| `packages/infrastructure/src/index.ts`                                       | `export * from './repositories/drizzle-pantry.repository'` の 1 行追記のみ |

### 機械チェック + 品質ゲート

- check-codex-implementation.mjs（`--base b153395^`）: **FAIL 0** / WARN 33。WARN は base を
  実装コミット起点まで遡ったことで diff 集合に入った**範囲外ファイルへの誤検出のみ**
  （`schema.ts` の 9 件も既存テーブル定義行。stocks 追記部分・pantry 系ファイルへの指摘は 0 件）
- run-quality-gates.sh（2026-07-19 実行）: lint / type-check / test すべて **PASS**
  （infrastructure 50 テスト〔うち drizzle-pantry 9 件〕を含む全パッケージ green）

### チェックリスト（docs/06-ai-tools.md 全 8 項目）

| 項目                  | 判定             | 根拠                                                                                                                        |
| --------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 識別子のタイポ        | PASS             | スクリプト対象範囲内 0 件 + 指示書の確定コードと目視照合で一致（Repository は逐語一致・import 順のみ整形差）                |
| Tailwind タイポ・連結 | PASS（対象なし） | Infrastructure 層のみ、UI 変更なし                                                                                          |
| ハンドラ結線漏れ      | PASS（対象なし） | 同上                                                                                                                        |
| 'use client'          | PASS（対象なし） | 同上                                                                                                                        |
| `import type` 規約    | PASS             | `PantryRepository`/`DrizzleClient`/`StockRow`/`NewStockRow`/`StorageLocation` は `import type`、値使用は値インポート        |
| 命名の傾向ずれ        | PASS             | テーブル名 `stocks`（複数形）・index 名 `stocks_product_id_idx`・カラム snake_case とも指示書「命名・記法の注意」と一致     |
| 差し戻しの部分反映    | N/A              | 初回（遡及）レビュー                                                                                                        |
| バリデーション分岐    | PASS             | `toStorageLocation` の default throw ガードあり。`numeric` の `Number()` 変換・`date` の `'T00:00:00'` 付与とも指示書どおり |

実画面確認は画面変更を含まないため対象外。

### 敵対的精査パスで確認した点（問題なし）

- **既存 7 テーブル無変更**: 実装コミット範囲の diff は `schema.ts` / `create-test-db.ts` とも
  **追記のみ（削除行 0）**。migration journal も idx 7 の 1 エントリ追記のみで既存 `0000`〜`0006`
  無変更
- **マイグレーション内容**: `CREATE TABLE "stocks"`・`source_shopping_item_id` の UNIQUE 制約・
  `stocks_product_id_idx` を含む。`pantries` テーブルは作られていない（S-1/S-2）
- **upsert の `set` が `amountValue` のみ**: テストが「他フィールドを変更した Stock の再 save で
  `productId`/`displayName`/`purchasedAt`/`expiresAt`/`storedLocation`/`sourceShoppingItemId` が
  全て元の値のまま」を DB 行レベルで検証（Domain の「Stock は amount のみ可変」不変条件と対応）
- **JST 日付ずれ対策**: `expiresAt` は読み `'T00:00:00'` 付与・書きローカル整形
  （`toISOString` 不使用）。タイムゾーン往復テストあり
- **テスト網羅**: 指示書のテスト表 9 項目を全て充足（空 DB 200 相当の空 Pantry・全フィールド
  round-trip・nullable 4 フィールドの null/非 null 両状態・UNIQUE 違反・削除同期 + 0 件全削除・
  number 復元・FIFO 昇順）
- **`save()` の非トランザクション構成**は模範コード（drizzle-shopping-list）踏襲の既存パターンで、
  部分失敗は設計書 S-3 の自己修復が受け止める前提（設計どおり）

### 申し送り

1. **[Nice] `stocks` スキーマ定義の Why コメント省略**: 指示書 §1 の確定コードにあった
   `// null 許容・FK なし（集約またぎ。D-8/S-5）`・`// UNIQUE = 「1 bought 品目 : 最大 1 Stock」
不変条件（S-3 の二重追加防止の最終防衛線）` 等のコメントが初回コミット時点から省略されている。
   不変条件自体はテストと設計書で追跡可能なため受け入れは妨げないが、`sourceShoppingItemId` の
   UNIQUE の意図は非自明なので、次に `schema.ts` を触る機会に復元するとよい。

---

## Task 3: Application 層 — Pantry UseCase 3 本 + CompleteShoppingUseCase（遡及受け入れレビュー）

- 実施日: 2026-07-19（**遡及レビュー**。実装は 2026-07-17・main マージ済み。logs 7/15 持ち越し分の解消）
- 実装ルート: Codex 委譲（指示書: `docs/tasks/codex/pantry-core/03-application.md`）
- レビュー手順: review-codex-implementation Skill（機械チェック → 品質ゲート → 人間チェックリスト → 敵対的精査パス）
- レビュー対象: **main の現行状態**（実装コミット `59d52dc` + 後続の共通化リファクタ `c8686ea`
  〔エラー 2 種の共有基底化。ユーザー実施〕適用後）
- 正典: 契約書 `docs/designs/pantry-core-contract.md` / 設計書 `docs/designs/pantry-core.md`（S-3〜S-9・D-1〜D-5）/ 指示書 Task 3
- **判定: 受け入れ可（差し戻しなし。Must 0 / Should 0 / 特記 1〔指示書コードとの正当な差分〕）**

### レビュー範囲

指示書の実装対象 14 ファイル（pantry/ 配下 9 + shopping-list/ 配下 4 + `application/src/index.ts`）
すべてを現行 main で目視。`export * from './pantry'`・`CompleteShoppingInputDto` の
`shopping-list.dto.ts` 配置（IMP-4）・独立テストファイル（IMP-5）とも指示書どおり。

### 機械チェック + 品質ゲート

- check-codex-implementation.mjs（`--base b153395^`）: **FAIL 0**。pantry / complete-shopping 系
  ファイルへの WARN 0 件（Task 2 の欄に記載のとおり WARN 33 はすべて範囲外への誤検出）
- run-quality-gates.sh（2026-07-19 実行）: lint / type-check / test すべて **PASS**
  （application 166 テスト〔うち pantry-use-cases 9 件・complete-shopping 16 件〕を含む全パッケージ green）

### チェックリスト（docs/06-ai-tools.md 全 8 項目）

| 項目                  | 判定             | 根拠                                                                                                                                  |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 識別子のタイポ        | PASS             | 指示書「命名・記法の注意」の綴りリスト 8 種（UseCase 4・エラー 2・mapper 2）すべて一致                                                |
| Tailwind タイポ・連結 | PASS（対象なし） | Application 層のみ、UI 変更なし                                                                                                       |
| ハンドラ結線漏れ      | PASS（対象なし） | 同上                                                                                                                                  |
| 'use client'          | PASS（対象なし） | 同上                                                                                                                                  |
| `import type` 規約    | PASS             | 型のみ使用（`Unit`・Repository IF 4 種・`CreateStockInput`・DTO 型・mapper の `Pantry`/`Stock`）はすべて `import type`                |
| 命名の傾向ずれ        | PASS             | 1 UseCase = 1 クラス・`execute()` のみ・手動 DI。JSDoc は冪等性・`@throws`・保存順序など契約情報のみ（規約どおり）                    |
| 差し戻しの部分反映    | N/A              | 初回（遡及）レビュー                                                                                                                  |
| バリデーション分岐    | PASS             | S-9 スキップ判定順序が条件 2 → 条件 3 → `calculate` → 条件 4 の指示順（条件 3 が calculate より前）。冪等ガードは `complete()` より前 |

実画面確認は画面変更を含まないため対象外。

### 敵対的精査パスで確認した点（問題なし）

- **保存順序 Pantry → Product → ShoppingList → MealPlan（S-3）**: 実装の呼び出し順どおりで、
  テストが `saveEvents` 配列により 4 段の順序そのものを検証（順序入れ替えを検出できる作り）
- **冪等ガード**: `status === 'completed'` 分岐が `complete()` 呼び出しより前。再実行テストは
  Pantry/Product の find/save 0 回 + ShoppingList save 0 回 + 同一 DTO 返却まで検証
- **部分失敗の修復 3 種**: (i) Stock 追加済み + active → `hasStockFromShoppingItem` で二重追加なし、
  (ii) completed + MealPlan `shopping` → 一段遷移、(iii) `draft` → 二段遷移。いずれもテストあり。
  修復対象外（`consuming`）で save しないことも検証
- **`now` は `execute()` 冒頭で 1 回だけ生成**し引き回し（priceRecord の `observedAt` と Stock の
  `purchasedAt` の一致をテストが検証）
- **D-5 グルーピング**: 同一 Product 複数品目で `findById`/`save` 各 1 回（スパイ検証）。
  記録 0 件でも Product が見つかれば save 1 回（IMP-6）
- **S-9 スキップ**: 5 種 + Product 削除済み（条件 5）の 6 ケースを `it.each` で網羅。
  各ケースで「Stock は追加される・価格記録のみスキップ」を検証
- **D-4**: MealPlan 不存在でも完了処理が成功。`ShoppingListNotFoundError` 時は副作用 0 も検証
- **エラー契約**: 共通基底化（`c8686ea`）後も `name`/`message` の公開契約をテストが固定
  （`StockNotFoundError` → `Stock not found: <id>` — Task 5 の onError 変換テストとも整合）

### 特記: 指示書コードとの正当な差分（実装が正）

`toAddStockInput` が指示書 §7 の `item.requiredAmount ?? Quantity.of(1, '個')` ではなく
**`requiredAmount === null || requiredAmount.value <= 0` の両方を 1 個へフォールバック**している。
指示書コードのままだと `requiredAmount.value === 0` の bought 品目で `Stock.create` の
`amount <= 0` 拒否（Task 1）により完了処理全体が throw し、指示書自身のテスト表
「`requiredAmount.value === 0` → **Stock 追加は行われる**」と矛盾する。実装はこの矛盾を
正しく解消しており、クラス JSDoc（「数量不明または 0 以下の bought 品目は…1 個として Stock 化」）
にも明記、テスト（`requiredAmount が 0` ケース）でも担保済み。**指示書テンプレートの確定コードと
テスト表の不整合**という改善候補として reflection の材料になり得る。

### 申し送り

なし（特記の指示書不整合は改善候補として扱う）。
