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
