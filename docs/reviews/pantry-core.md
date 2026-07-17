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
