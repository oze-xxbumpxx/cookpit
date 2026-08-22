# 実装計画: shopping-list-ingredient-merge

- 前提となる設計書: docs/designs/shopping-list-ingredient-merge.md
- レベル: L2
- 実装ルート: Orchestrator（implementer）
- 判断理由: 既定（docs/06-ai-tools.md の観点「既存ロジックの仕様変更」）。Domain 1 メソッド追加を
  含む多層変更で、既存の集計・同期仕様との整合判断が要るため Codex へは委譲しない。

## 変更対象ファイル

| path                                                                                          | なぜ変えるか                                                                                     |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/domain/src/shopping-list/shopping-list.ts`                                          | 注記の上書き手段（`updateAmountNote` / `updateItemAmountNote`）が無く、Sync が注記を更新できない |
| `packages/application/src/shopping-list/ingredient-aggregation.ts`                            | 数量なし材料が無条件に個別行になる。材料名の照合キーが `trim()` 止まりで表記ゆれを吸収しない     |
| `packages/application/src/shopping-list/sync-shopping-list-from-meal-plan.use-case.ts`        | 注記変更の反映と、旧仕様で生成済みの重複行の解消が必要                                           |
| `apps/web/src/app/shopping-lists/_utils/shopping-list-view.ts`                                | `diffSyncResult` が数量しか見ておらず、注記だけ変わると「変更はありませんでした」と誤表示する    |
| `packages/domain/tests/shopping-list/shopping-list.test.ts`                                   | 新規メソッドの試験                                                                               |
| `packages/application/tests/shopping-list/generate-shopping-list.use-case.test.ts`            | 集計仕様の変更に伴う既存試験の更新と新規観点                                                     |
| `packages/application/tests/shopping-list/sync-shopping-list-from-meal-plan.use-case.test.ts` | 注記更新・重複解消の新規観点                                                                     |
| `apps/web/tests/app/shopping-lists/_utils/shopping-list-view.node.test.ts`                    | `diffSyncResult` の新規観点                                                                      |

## 新規作成ファイル

なし（既存ファイルへの追記のみ）。

## ファイルごとの変更内容

### packages/domain/src/shopping-list/shopping-list.ts

- 変更内容:
  - `ShoppingItem.updateAmountNote(note: string): void` を追加。`updateRequiredAmount` の対称形。
    `status !== 'pending'` / `itemAmountNote === null`（数量品目）/ `note.trim() === ''` を throw。
  - `ShoppingList.updateItemAmountNote(itemId, note): void` を追加。`assertActive` → `findItem` →
    委譲。JSDoc に `@throws` を書く（coding-standards の公開 API 規約）。
- 完了条件: 既存の `updateRequiredAmount` 系試験が緑のまま、新規メソッドの試験が通る。

### packages/application/src/shopping-list/ingredient-aggregation.ts

- 変更内容:
  - `normalizeDisplayName(displayName: string): string`（trim + NFKC）を追加。
  - `matchKey()` の `base` を `normalizeDisplayName(displayName)` に変更。
  - `matchKey()` を `aggregateIngredients()` のキー生成にも使い、インラインのキー組み立てを消す
    （集計キーと照合キーの規則が二重定義になっているのを一本化する）。
  - 数量なし材料を `individual: ResolvedIngredient[]` から
    `noted: Map<string, { productId; displayName; notes: string[] }>` に置き換える。
    注記は `normalizeDisplayName` 相当の正規化で重複排除し、初出順で保持する。
  - 出力は従来どおり `[...数量あり行, ...数量なし行]`。数量なし行の `amountNote` は `notes.join('・')`。
- 完了条件: 同一注記が 1 行に、異なる注記が併記で 1 行にまとまる。単位違いは別行のまま。

### packages/application/src/shopping-list/sync-shopping-list-from-meal-plan.use-case.ts

- 変更内容:
  - `existingItems` を照合キーで 1 パス走査し、`duplicateItems`（2 件目以降かつ `from_meal_plan`
    かつ `pending`）と `dedupedItems` に分ける。`existingKeys` は全品目のキー集合のまま。
  - `updateCandidates` / `removalCandidates` の入力を `dedupedItems` に変える。
  - `noteUpdates: Array<{ item: ShoppingItem; note: string }>` を組み立てる。対象は
    `from_meal_plan` かつ `pending` かつ `amountNote !== null` で、集計結果の `amountNote` が
    現在値と異なるもの。
  - no-op 判定に `noteUpdates.length` と `duplicateItems.length` を加える。
  - 適用順: 数量更新 → 注記更新 → 削除 → 重複行の削除 → 新規追加（既存の順序を壊さない）。
- 完了条件: 注記変更が反映され、重複行が 1 行に寄り、差分なしのときは `save` が呼ばれない。

### apps/web/src/app/shopping-lists/_utils/shopping-list-view.ts

- 変更内容: `diffSyncResult` の更新判定に `prior.amountNote !== item.amountNote` を OR で加える。
- 完了条件: 注記だけ変わったケースで `updatedCount` が 1 になる。

## 実装手順

1. Domain メソッド追加 … `packages/domain/src/shopping-list/shopping-list.ts` /
   `updateAmountNote` + `updateItemAmountNote` / 既存試験が緑のまま新規試験が通る。
2. 集計仕様の変更 … `packages/application/src/shopping-list/ingredient-aggregation.ts` /
   材料名正規化 + 数量なし材料の集約 / Generate の新規試験が通る。
3. Sync の注記更新・重複解消 … `sync-shopping-list-from-meal-plan.use-case.ts` /
   上記のとおり / Sync の新規試験が通る。
4. 差分表示の修正 … `apps/web/.../shopping-list-view.ts` / 注記差分を updated に数える /
   `shopping-list-view.node.test.ts` の新規試験が通る。
5. 既存試験の更新 … Generate の「集計キーの単位境界、適量の個別行、小数 scaleFactor」試験を
   新仕様（3 行・注記併記）へ更新 / 全パッケージの `pnpm test` が緑。
6. ドキュメント同期 … `docs/04-domain-model.md` の ShoppingItem 定義に新メソッドを反映 /
   実装と一致。

## 依存関係

- 手順 1 → 手順 3（Sync は Domain の新メソッドに依存）。
- 手順 2 → 手順 3（Sync の重複解消は正規化後の照合キーを前提にする）。
- 手順 4 は独立（並行可）。
- 手順 5 は 2 の完了後。

## テスト計画

`docs/tests/shopping-list-ingredient-merge.md` と対応。配置先:

| 観点                       | ファイル                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| Domain（M-01〜M-06）       | `packages/domain/tests/shopping-list/shopping-list.test.ts`                                   |
| Generate（G-01〜G-05）     | `packages/application/tests/shopping-list/generate-shopping-list.use-case.test.ts`            |
| Sync（S-01〜S-06）         | `packages/application/tests/shopping-list/sync-shopping-list-from-meal-plan.use-case.test.ts` |
| Presentation（P-01〜P-02） | `apps/web/tests/app/shopping-lists/_utils/shopping-list-view.node.test.ts`                    |

apps/web の新規観点は既存の `*.node.test.ts` へ追記するため、vitest projects の
include（`tests/**/*.node.test.ts`）と整合する。

## リスク

- 既存 Generate 試験の期待値変更が必要（4 行 → 3 行）。仕様変更に伴う正当な更新であり、
  変更前のコードで新規試験が失敗することを確認してから期待値を直す（空振りテスト防止）。
- Sync の重複解消が `bought` の購入実績を消す事故 → 削除対象を `from_meal_plan` かつ `pending`
  に限定し、S-04 で bought の重複が残ることを固定する。

## ロールバック方法

コード差し戻しのみ。DB スキーマ・API 契約とも無変更で、併記済みの注記文字列
（例「少々・適量」）は旧コードでもそのまま表示・保存できるためデータ修復は不要。

## ドキュメント更新対象

- `docs/04-domain-model.md` … ShoppingItem の公開メソッドに `updateAmountNote` を追記（必須）。
- `docs/designs/shopping-list-core.md` … S-4 の「`amount = null` の材料は合算対象外」は本タスクで
  改定されるため、本設計書（shopping-list-ingredient-merge）で上書きした旨を追記する。
- ADR は不要（アーキテクチャ判断ではなく既存集計仕様の改定。ADR-0007 / ADR-0018 の方針内）。
