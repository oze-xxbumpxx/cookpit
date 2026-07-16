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

## Task 2: Infrastructure 層 — stocks スキーマ + DrizzlePantryRepository（受け入れレビュー）

- 実施日: 2026-07-16
- 実装ルート: Codex 委譲（指示書: `docs/tasks/codex/pantry-core/02-infrastructure.md`）
- レビュー手順: review-codex-implementation Skill（機械チェック → 品質ゲート → 人間チェックリスト → 敵対的精査パス）
- 対象: PR #67（head `f269f78`。基準 `origin/main` = `9169523`、8 コミット・8 ファイル +1,043 行）
- 正典: 設計書 `docs/designs/pantry-core.md`（S-1〜S-5）/ 実装計画
  `docs/implementation-plans/pantry-core.md` §Task 2
- **判定: 受け入れ可（差し戻しなし。Must 0 / Should 0 / 申し送り 1）**

### レビュー範囲

| ファイル                                                                       | 内容                                                     |
| ------------------------------------------------------------------------------ | -------------------------------------------------------- |
| `packages/infrastructure/src/db/schema.ts`                                     | `stocks` テーブル定義 + `StockRow`/`NewStockRow`（追記） |
| `packages/infrastructure/src/testing/create-test-db.ts`                        | PGlite テスト DDL に `stocks` 追記（IMP-2）              |
| `apps/web/src/db/migrations/0007_tranquil_the_anarchist.sql` + meta 2 ファイル | `drizzle-kit generate` 自動生成（IMP-1）                 |
| `packages/infrastructure/src/repositories/drizzle-pantry.repository.ts`        | `DrizzlePantryRepository`                                |
| `packages/infrastructure/src/repositories/drizzle-pantry.repository.test.ts`   | PGlite 統合テスト 9 件                                   |
| `packages/infrastructure/src/index.ts`                                         | export 追記                                              |

### 機械チェック + 品質ゲート

- check-codex-implementation.mjs: 対象 4 ファイル・識別子 420 件照合 → **FAIL 0 / WARN 9 / INFO 0**
  - WARN 9 件はすべて `schema.ts` の**既存テーブル識別子**（`recipes`/`stores`/`products`/
    `priceRecords`/`mealPlans`/`shoppingLists`/`shoppingItems`/`StoreRow`/`NewStoreRow`）。
    pantry-core 指示書に載っていないだけで、diff 上は無変更（追記のみ）を確認 → **全件誤検出と判定**
- run-quality-gates.sh: lint / type-check / test すべて **PASS**（web 198 件含む全パッケージ green）
- `pnpm --filter @cookpit/infrastructure test`: 6 ファイル 50 件 green（うち pantry 新規 9 件）

### チェックリスト（docs/06-ai-tools.md 全 8 項目）

| 項目                  | 判定             | 根拠                                                                                                                                       |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 識別子のタイポ        | PASS             | スクリプト FAIL 0（WARN 9 は既存識別子の誤検出）+ 指示書の確定コードと目視照合で一致                                                       |
| Tailwind タイポ・連結 | PASS（対象なし） | Infrastructure 層のみ、UI 変更なし                                                                                                         |
| ハンドラ結線漏れ      | PASS（対象なし） | 同上                                                                                                                                       |
| 'use client'          | PASS（対象なし） | 同上                                                                                                                                       |
| `import type` 規約    | PASS             | 型のみの `PantryRepository`/`DrizzleClient`/`StorageLocation`/`StockRow`/`NewStockRow`/`StockProps` はすべて `import type` / inline `type` |
| 命名の傾向ずれ        | PASS             | テーブル `stocks`（複数形）・index `stocks_product_id_idx`・Row 型命名は既存 7 テーブルの規約どおり                                        |
| 差し戻しの部分反映    | N/A              | 初回レビュー                                                                                                                               |
| バリデーション分岐    | PASS             | Zod は Task 4 の範囲外。`toStorageLocation` の default throw（不正値の防衛）を実装 + 型で担保                                              |

実画面確認は画面変更を含まないため対象外。

### 敵対的精査パスで確認した点（問題なし）

- **指示書コードとの照合**: `schema.ts` 追記・`create-test-db.ts` DDL・
  `drizzle-pantry.repository.ts`・`index.ts` は指示書の確定コードと**逐語一致**
  （import 文の並びのみ lint の sort 順。挙動差なし）
- **既存 7 テーブル無変更**: `schema.ts`/`create-test-db.ts` は diff が追記のみ。
  `meta/0006_snapshot.json` と `0007_snapshot.json` の既存テーブル定義を機械比較し
  **byte 単位で同一**（追加は `public.stocks` のみ）。`_journal.json` も idx 7 の追記のみ
- **マイグレーション SQL**: `CREATE TABLE "stocks"` +
  `stocks_source_shopping_item_id_unique` UNIQUE 制約 + `stocks_product_id_idx` の
  CREATE INDEX のみ。既存テーブルへの `ALTER` なし・手動編集痕なし
- **過去ミス型への先回り（指示書「命名・記法の注意」6 点）**: `Number()` 変換 /
  `'T00:00:00'` 付与のローカル日付整形（読み書き両側とも `toISOString().slice` 不使用）/
  単段 sync（shopping-list の 2 段構成を誤って持ち込んでいない）/ upsert `set` は
  `amountValue` のみ / `ORDER BY purchased_at ASC` / 複数形テーブル名 — すべて充足
- **テスト観点**: 指示書の 9 観点すべてに対応するテストあり。特に「同一 id 再 save で
  不変フィールド維持」は Domain を経由せず生 SQL で row を検証しており、upsert `set` の
  範囲逸脱を確実に検出できる良い書き方。nullability round-trip は全 null / 全非 null の
  2 パターンで 4 フィールド × 両状態をカバー
- **sync パターンの一貫性**: `save()` にトランザクションが無いのは模範コード
  （drizzle-shopping-list.repository）と同型で、指示書の確定コードどおり

### 申し送り

1. `save()` は delete → 逐次 upsert が非トランザクションのため、UNIQUE 制約違反で reject
   した場合に先行 insert 分が残る（部分適用）。これは shopping-list 以来の既存パターン踏襲で
   指示書の確定コードどおりのため受け入れ可とするが、単一ユーザー MVP1 を超えて整合性要件が
   上がる際は Repository 層への `db.transaction()` 導入を全 Repository 横断で検討する
   （本 Task の差し戻し対象ではない。改善候補として記録のみ）。
