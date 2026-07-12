# レビュー記録: shopping-list-core（Sprint 4 / L3）

feature 全体のレビュー記録。タスク単位（Codex 委譲 Task 1〜5）で追記していく。

---

## Task 1: Domain 層 — Quantity.add() + ShoppingList 集約（受け入れレビュー）

- 実施日: 2026-07-12
- 実装ルート: Codex 委譲（指示書: `docs/tasks/codex/shopping-list-core/01-domain.md`）
- レビュー手順: review-codex-implementation Skill（機械チェック → 品質ゲート → 人間チェックリスト → 敵対的精査パス）
- ブランチ: `feature/shopping-list-core-domain`（基準コミット `da08285`。レビュー時点では未コミットの作業ツリー）
- 正典: 設計書 `docs/designs/shopping-list-core.md`（S-4/S-5/S-8/S-9/S-11/D-2）/ 実装計画 `docs/implementation-plans/shopping-list-core.md` §Task 1
- **判定: 受け入れ可（差し戻しなし。Must 0 / Should 0 / 申し送り 2）**

### レビュー範囲

| ファイル                                                        | 内容                                           |
| --------------------------------------------------------------- | ---------------------------------------------- |
| `packages/domain/src/shared/quantity.ts`                        | `add()` 追記（S-4 案 B）                       |
| `packages/domain/src/shopping-list/shopping-list-id.ts`         | ShoppingListId VO                              |
| `packages/domain/src/shopping-list/shopping-item-id.ts`         | ShoppingItemId VO                              |
| `packages/domain/src/shopping-list/shopping-list.ts`            | ShoppingList 集約 + ShoppingItem + 型 3 種     |
| `packages/domain/src/shopping-list/shopping-list.repository.ts` | Repository IF（`delete` なし＝スコープどおり） |
| （+ 上記各 `.test.ts` 4 ファイル）                              | 単体テスト（新規 36 + quantity 追加 3）        |

### 機械チェック + 品質ゲート

- check-codex-implementation.mjs: 対象 5 ファイル・識別子 536 件照合 → **FAIL 0 / WARN 0 / INFO 0**
- run-quality-gates.sh: lint / type-check / test すべて **PASS**（Domain 244 テスト green）
- turbo キャッシュ非経由の直接 Vitest 実行でも 45 テスト（shopping-list 30 + ID VO 各 3 + quantity 9）全 green

### チェックリスト（docs/06-ai-tools.md 全 8 項目）

| 項目                  | 判定             | 根拠                                                                                  |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| 識別子のタイポ        | PASS             | スクリプト 0 件 + 指示書シグネチャと目視照合で完全一致                                |
| Tailwind タイポ・連結 | PASS（対象なし） | Domain 層のみ、UI 変更なし                                                            |
| ハンドラ結線漏れ      | PASS（対象なし） | 同上                                                                                  |
| 'use client'          | PASS（対象なし） | 同上                                                                                  |
| `import type` 規約    | PASS             | 型のみ使用の VO は `import type`、runtime 使用の ID 2 種は値インポート                |
| 命名の傾向ずれ        | PASS             | `shoppingListIdValue` / `itemXxx` / `listXxx` は ProductId・MealPlan の既存規約どおり |
| 差し戻しの部分反映    | N/A              | 初回レビュー                                                                          |
| バリデーション分岐    | PASS             | S-5 排他検証・D-2 active ガード・S-9 pending ガードすべて実装 + テスト担保            |

実画面確認は画面変更を含まないため対象外。

### 敵対的精査パスで確認した点（問題なし）

- **バレルエクスポート漏れの疑い** → 問題なし。`packages/domain/src/index.ts` は元々空で、
  Application 層は `@cookpit/domain/src/...` の深いパスで直接インポートする方式が既存慣行。
- **防御的コピー**: `items` / `shoppingDate` / `createdAt` の getter すべてで担保。
  `createdAt` の防御性テストは指示書要求を超える追加分（良）。
- **状態遷移の網羅**: bought 再適用の上書き（S-11a）・skipped→bought（S-11b）・
  bought/skipped からの markAsSkipped 拒否（S-9）・complete 二重呼び出し拒否（S-8）まで全パステスト済み。
- `getBoughtItemsForPantry` は未実装＝S-8 の確定（保留）どおり。

### 申し送り（修正不要・Task 3 以降への引き継ぎ）

1. **空白のみ amountNote の保持**: `ShoppingItem.create()` に `requiredAmount` あり +
   `amountNote: '  '`（空白のみ）を渡すと、排他チェックは通過しつつ空白文字列がそのまま保持される。
   指示書どおりの挙動なので Domain 側は変更不要。Task 3（Application 層）の入力正規化で
   空白のみ → `null` に落とすことを推奨。
2. **items getter 経由の集約ガード迂回**: `list.items` は浅いコピーのため、取得した
   `ShoppingItem` に直接 `markAsBought()` を呼ぶと completed ガード（D-2）を迂回できる。
   MealPlan の `plannedRecipes` と同じ既存パターン（設計正典どおり）のため指摘ではなく、
   UseCase 側で必ず `ShoppingList` のメソッド経由で操作するという運用前提の再確認。

---

## Task 2: Infrastructure 層 — DB スキーマ・DrizzleShoppingListRepository（受け入れレビュー）

- 実施日: 2026-07-12
- 実装ルート: Codex 委譲（指示書: `docs/tasks/codex/shopping-list-core/02-infrastructure.md`）
- レビュー手順: review-codex-implementation Skill（機械チェック → 品質ゲート → 人間チェックリスト → 敵対的精査パス）
- ブランチ: `feature/shopping-list-core-domain`（基準コミット `b33ee20`。レビュー時点では未コミットの作業ツリー）
- **判定: 受け入れ可（差し戻しなし。Must 0 / Should 0 / 申し送り 2）**

### レビュー範囲（Task 2）

| ファイル                                                                                  | 内容                                                                   |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/infrastructure/src/db/schema.ts`                                                | `shoppingLists`/`shoppingItems` テーブル定義 + 型 4 種（末尾追記のみ） |
| `packages/infrastructure/src/testing/create-test-db.ts`                                   | PGlite テスト DDL に 2 テーブル + インデックス追記                     |
| `apps/web/src/db/migrations/0006_previous_jamie_braddock.sql` + `meta/0006_snapshot.json` | drizzle-kit 自動生成（UNIQUE・CASCADE FK・インデックス含む）           |
| `apps/web/src/db/migrations/meta/_journal.json`                                           | idx 6 エントリ追記（既存 0000〜0005 変更なし）                         |
| `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.ts`            | `DrizzleShoppingListRepository`（findById / findByMealPlanId / save）  |
| `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.test.ts`       | PGlite 統合テスト 8 件                                                 |
| `packages/infrastructure/src/index.ts`                                                    | バレルエクスポート 1 行追記                                            |

### 機械チェック + 品質ゲート（Task 2）

- check-codex-implementation.mjs: **FAIL 0 / WARN 3 / INFO 0** — WARN 3 件はすべて目視で誤検出と確定:
  - `schema.ts:52` `priceRecords` / `:75` `mealPlans` → 今回変更していない既存テーブル定義（スクリプトは変更ファイル全体を走査するため検出）
  - `schema.ts:106` `shoppingLists` の "lists" → 指示書が明示要求する複数形テーブル名そのもの（初出のためスクリプト辞書に無いだけ。マージ後は辞書に入り再発しない）
- run-quality-gates.sh: lint / type-check / test すべて **PASS**
- turbo キャッシュ非経由の直接 Vitest 実行で新規統合テスト **8/8 green**（PGlite 実 DB 往復）

### チェックリスト（Task 2 / docs/06-ai-tools.md 全 8 項目）

| 項目                  | 判定             | 根拠                                                                                                                                                      |
| --------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 識別子のタイポ        | PASS             | WARN 3 件すべて誤検出と確定 + 指示書シグネチャと目視照合で完全一致                                                                                        |
| Tailwind タイポ・連結 | PASS（対象なし） | Infrastructure 層のみ、UI 変更なし                                                                                                                        |
| ハンドラ結線漏れ      | PASS（対象なし） | 同上                                                                                                                                                      |
| 'use client'          | PASS（対象なし） | 同上                                                                                                                                                      |
| `import type` 規約    | PASS             | `ShoppingListRepository`/`DrizzleClient`/Row 型/`ShoppingItemProps` は `import type`（または inline `type`）、runtime 使用のクラスは値インポート          |
| 命名の傾向ずれ        | PASS             | テーブル複数形（指示書指定）・カラム snake_case・`*Row`/`New*Row` 型は既存規約どおり                                                                      |
| 差し戻しの部分反映    | N/A              | 初回レビュー                                                                                                                                              |
| バリデーション分岐    | PASS             | `toShoppingListStatus`/`toItemStatus`/`toItemSource` の switch が全列挙 + unknown で throw。numeric→`Number()` 変換・nullability マッピングも指示書どおり |

実画面確認は画面変更を含まないため対象外。

### 敵対的精査パスで確認した点（Task 2・問題なし）

- **既存 6 テーブル・既存マイグレーション 0000〜0005 への変更なし**（全 diff が追記のみ）
- **タイムゾーンの罠を回避**: `date` カラムは `'T00:00:00'` 付与のローカル解釈 + `toDateString` 手動整形（`toISOString().slice()` 不使用）。round-trip テストあり
- **upsert の `set` は `status` のみ**（`mealPlanId`/`shoppingDate`/`createdAt` 不変）— 変更を試みても維持されることをテストで検証済み
- **`notInArray` 削除同期**: item 削除の再 save 反映・0 件時の全 DELETE 分岐ともテスト済み（MealPlan と同一パターン）
- **UNIQUE(meal_plan_id)**: S-6「1 MealPlan : 最大 1 ShoppingList」の制約違反テストあり
- テストが items の取得順に依存しない書き方（`find()` ベース）になっている点も適切

### 申し送り（修正不要・Task 3〜5 への引き継ぎ）

1. **items の並び順は未保証**: 復元時の `shopping_items` に ORDER BY が無く、行順は DB 実装依存
   （MealPlan の `plannedRecipes` と同じ既存パターンで、設計書にも並び順要件なし）。
   画面で安定した表示順が必要になったら、Application/Presentation 層でソート
   （`createdAt` or `displayName`）を入れること。
2. **save() は非トランザクション**: list upsert → items DELETE → items upsert が個別ステートメントで、
   途中失敗時に部分状態が残りうる。MealPlan と同一の既存トレードオフのため指摘ではなく、
   トランザクション化を検討する際は両 Repository まとめて、という申し送り。
