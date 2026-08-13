# 設計書: meal-plan-shopping-sync（献立変更の買い物リストへの差分マージ）

- ステータス: 確定（ユーザー承認・実装済み・2026-07-24）。**削除追随・数量上書きは
  Sprint 10 の `docs/designs/meal-plan-sync.md` / [ADR-0018](../decisions/ADR-0018-meal-plan-sync-delete-and-quantity.md)
  が塗り替えた。本書は v1（追加のみ）の記録として残す。**
- レベル: L3
- 関連: ADR-0007（差分マージの決定）、ADR-0006（冪等生成）、ADR-0018（pending の削除・数量）、
  `docs/designs/shopping-list-core.md`、`packages/application/src/shopping-list/generate-shopping-list.use-case.ts`
- 要件入力: 改善要望 項目7「献立変更を買い物リストに反映」（`logs/2026-07-23.md` セッション2）

---

## 背景・目的

買い物リスト作成後に献立へレシピを追加しても材料が反映されない（生成が冪等・ADR-0006）。
チェック/購入状態を失わずに、後から追加したレシピの材料を買い物リストへ**追記**できるようにする。

## 方針（ADR-0007 準拠）

明示トリガの差分マージ同期を新設。既存品目は不変、**新規材料のみ追加**。数量合算・削除追随はしない。

## 変更内容（承認後に実装）

### Application: `SyncShoppingListFromMealPlanUseCase`（新規）

- 依存: `shoppingListRepository, mealPlanRepository, recipeRepository, productRepository, pantryRepository`
  （生成 UseCase と同じ集計・在庫引き算・店舗解決を再利用するため）。
- `execute({ shoppingListId })`:
  1. ShoppingList を取得（無ければ `ShoppingListNotFoundError`）。`completed` は 422（`InvalidShoppingListStateError`。
     再開してから同期する運用）。
  2. その `mealPlanId` の MealPlan を取得。`draft` は 422（未生成）。
  3. MealPlan の材料を再集計（`generate` の `resolveRecipes`/`aggregateIngredients` 相当を共通化して再利用）。
  4. 既存 ShoppingItem のマッチキー集合を作成（`productId?.value ?? displayName.trim()` × `unit`。
     `requiredAmount` が null の材料は `amountNote` 系として displayName のみのキー）。
  5. 集計材料のうち既存キーに**無いものだけ**を抽出 → 在庫引き算（新規分のみ `applyPantryDeduction`）→
     `ShoppingItem.create({ source: 'from_meal_plan', ... })` で追加。
  6. 追加が 0 件なら保存せず現状を返す（no-op 冪等）。追加ありなら ShoppingList を save、在庫を消費したら
     Pantry を save。MealPlan 遷移はしない（既に shopping 以降）。
  7. `ShoppingListDto`（+ 追加件数 `addedCount` を返す DTO 拡張は任意）を返す。
- **共通化**: `generate` と `sync` で材料集計ロジックが重複するため、集計・在庫引き算・店舗解決を
  純関数/ドメインサービス（例: `packages/application/src/shopping-list/ingredient-aggregation.ts`）へ抽出し
  両者から使う（reviewer 指摘の DRY 化を先回り）。

### Presentation

- ルート: `POST /api/shopping-lists/:id/sync` → 上記 UseCase → 200（`ShoppingListDto`）。
- 契約: `shopping-list.schema.ts` に sync のレスポンス（既存 `shoppingListResponseSchema` 再利用）。
- UI: 買い物リスト画面（`shopping-list-client.tsx`）に「買い物リストを更新（献立の変更を反映）」ボタンを追加。
  実行後は応答の DTO で items を置換。追加 0 件時は「変更はありませんでした」等の軽い通知。
  献立画面側の「買い物リストを開く」導線はそのまま。

### Domain / Infrastructure

- 変更なし（既存の `ShoppingList.addItem` / `ShoppingItem.create` / Pantry 消費を使う）。DB スキーマ変更なし。

## 対象外

- 数量合算（同一材料の増分）。将来課題。
- 削除追随（レシピを外した材料の除去）。将来課題。
- レシピ追加時の自動同期（明示トリガのみ）。

## テスト方針

- Application: 新規材料のみ追加/既存キーはスキップ/追加 0 件で no-op/completed・draft で 422/
  在庫引き算が新規分のみ/店舗解決。集計共通化後は generate 側の既存テストが回帰なく緑であること。
- ルート: 200 + DTO、404、422。
- Component: ボタンで sync 呼び出し・items 反映・0 件通知。
- 実画面: 献立にレシピ追加 → 買い物リスト更新 → 新材料が追記されチェック済みが保持されることを確認。

## リスク

| #   | リスク                                 | 対策                                                                               |
| --- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| R-1 | 集計ロジック二重化による生成との挙動差 | 集計/在庫引き算を共通モジュールへ抽出し両者で共有。generate の既存テストで回帰検知 |
| R-2 | 表記ゆれで重複品目                     | 生成時と同じキー制約。項目3（単位自由記述化）実装時に正規化方針を合わせる          |
| R-3 | 在庫二重消費（同期を連打）             | 追加 0 件 no-op ＋ 新規分のみ消費。UI で送信中ガード                               |
