# 実装計画: small-ux

- 前提となる設計書: docs/designs/small-ux.md
- レベル: L2
- 実装ルート: Orchestrator（implementer）
- 判断理由: 既定（既存 UI パターンの移植。画面結線と RTL が中心で、指示書に書き切る Codex 委譲より往復が少ない）

## 変更対象ファイル

| path                                                                           | なぜ変えるか                                                   |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `apps/web/src/app/products/new/_components/product-form-client.tsx`            | dirty 算出・離脱ガード・ダイアログの結線                       |
| `apps/web/src/app/products/[id]/edit/_components/product-edit-form-client.tsx` | 同上                                                           |
| `apps/web/src/app/recipes/_components/step-row.tsx`                            | `useSortable`・ドラッグハンドル列                              |
| `apps/web/src/app/recipes/_components/recipe-form-fields.tsx`                  | 手順用の別 `DndContext` / `handleStepDragEnd` / 日本語読み上げ |
| `apps/web/tests/app/recipes/_components/recipe-form-fields.test.tsx`           | 手順並べ替えの観点を追加                                       |
| `apps/web/tests/app/recipes/_utils/recipe-form-dirty.node.test.ts`             | 手順並べ替えが dirty になる回帰                                |
| `docs/05-roadmap.md`                                                           | Sprint 10 タスク 4 をレビュー中へ                              |
| `docs/designs/recipe-form-usability.md`                                        | 後続ドキュメントへのポインタ                                   |

## 新規作成ファイル

| path                                                                                  | 役割                     |
| ------------------------------------------------------------------------------------- | ------------------------ |
| `apps/web/src/app/products/_utils/product-form-dirty.ts`                              | 商品フォームの未保存判定 |
| `apps/web/tests/app/products/_utils/product-form-dirty.node.test.ts`                  | 同テスト                 |
| `apps/web/tests/app/products/new/_components/product-form-client.test.tsx`            | 新規画面の離脱確認結線   |
| `apps/web/tests/app/products/[id]/edit/_components/product-edit-form-client.test.tsx` | 編集画面の離脱確認結線   |
| `docs/designs/small-ux.md`                                                            | 本設計書                 |
| `docs/implementation-plans/small-ux.md`                                               | 本実装計画               |
| `docs/tests/small-ux.md`                                                              | 試験計画                 |

テストパスは apps/web の vitest `include`（`*.node.test.ts` / `*.test.tsx`）に合わせる。素の `*.test.ts` は使わない。

## ファイルごとの変更内容

### `product-form-dirty.ts`

- 変更内容: `isProductFormDirty(initial, current)` を追加する。`name` は trim、`aliasesText` は送信と同じ split/trim/空除去、`category` / `defaultUnit` はそのまま比較する。
- 完了条件: 空白だけの差は `false`、別名の並び順の差は `true`、変更して元に戻すと `false`。

### `product-form-client.tsx` / `product-edit-form-client.tsx`

- 変更内容: 初期スナップショットを `useState` 初期化関数で保持し、`isProductFormDirty` で `dirty` を算出。キャンセルを `leave.requestLeave`、保存成功の `router.push` を `leave.leaveAfterSave` に置き換え、末尾に `LeaveConfirmationDialog` を置く。
- 完了条件: 保存成功後に確認ダイアログが出ない。既存の送信・エラー表示の挙動が不変。`useRef` でスナップショットを持たない。

### `step-row.tsx`

- 変更内容: `useSortable({ id: value.id })` を使い、ルートに `setNodeRef` と縦固定の `transform` / `transition` を当てる。グリッドを 4 列にし、先頭に `GripVertical` ハンドルを置く。`touch-none` はハンドルだけ。
- 完了条件: 番号バッジ・textarea・削除の既存ラベルが残る。空行でもハンドルを `N番目の手順を並べ替え` で特定できる。

### `recipe-form-fields.tsx`

- 変更内容: 手順の `map` を材料とは別の `DndContext`（`useId()` の id）+ `SortableContext` で包む。`handleStepDragEnd` で `moveArrayItem` → `updateValue({ steps })`。読み上げは「手順」。
- 完了条件: `RecipeFormFields` が state を持たない完全制御のまま。材料の `DndContext` を手順と共有しない。`TouchSensor` は併用しない。

## 実装手順

1. **dirty 純関数** … `product-form-dirty.ts` と `.node.test.ts` / 完了条件: 試験計画 PFD-01〜07 が通る
2. **商品フォーム結線** … new/edit クライアントと RTL / 完了条件: PFC-01〜06 / PEC-01〜04 が通る。既存の送信失敗バナーが残る
3. **手順 DnD** … `step-row.tsx` → `recipe-form-fields.tsx` と RFF-13〜16 / 完了条件: キーボードで手順が入れ替わり、材料順は変わらない。既存 RFF-01〜12 が通る
4. **ドキュメント** … roadmap のタスク 4 をレビュー中へ。`recipe-form-usability` に後続ポインタ / 完了条件: Sprint 10 表と矛盾しない
5. **品質ゲート** … `pnpm lint` / `pnpm type-check` / 変更パッケージの test / 完了条件: 失敗ゼロ

## 依存関係

1 → 2 は直列（dirty が先）。3 は 1・2 と独立。4 は実装後。5 は全部の後。

## テスト計画

`docs/tests/small-ux.md` と一致させる。

| ファイル                                                                     | 観点                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------- |
| `tests/app/products/_utils/product-form-dirty.node.test.ts`                  | PFD-01〜07                                |
| `tests/app/products/new/_components/product-form-client.test.tsx`            | PFC-01〜06（既存送信 + 離脱）             |
| `tests/app/products/[id]/edit/_components/product-edit-form-client.test.tsx` | PEC-01〜04                                |
| `tests/app/recipes/_components/recipe-form-fields.test.tsx`                  | RFF-13〜16 を追加。既存 RFF-01〜12 は回帰 |
| `tests/app/recipes/_utils/recipe-form-dirty.node.test.ts`                    | RFD-14（手順並べ替え）を追加              |

## リスク

| ID  | リスク                                    | 検出                                              | 回避                                                                         |
| --- | ----------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| R-1 | happy-dom で手順 DnD が動かない           | RFF-14 が順序不変のまま pass してしまう           | 材料側と同じ `stubVerticalRects` + `[Space]` / `[ArrowDown]`（`event.code`） |
| R-2 | 材料と手順の DndContext が干渉する        | RFF-15                                            | 別 Context。手順移動後に材料順を `toEqual` で固定                            |
| R-3 | 商品フォームの Select 操作が RTL で不安定 | カテゴリ変更の dirty を画面テストに書くとフレーク | カテゴリ/単位の dirty は純関数で固定。画面テストは name 入力で結線だけ見る   |

## ロールバック方法

Presentation のみなので、本ブランチを落とすか該当ファイルを戻す。DB 移行は無い。

## ドキュメント更新対象

- `docs/05-roadmap.md` … Sprint 10 タスク 4 の状態
- `docs/designs/recipe-form-usability.md` … 後続ポインタのみ（対象外節の歴史は書き換えない）
- `docs/04-domain-model.md` … **変更なし**（ドメインモデルを触らない）
