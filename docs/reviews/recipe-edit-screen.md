# レビュー結果: recipe-edit-screen

- レビュー日: 2026-06-25
- レベル: L2
- 対象: Presentation 層のみ（バックエンド変更なし）
- 総合判定: **承認可（minor/nits のみ、要修正項目なし）**

---

## 指摘一覧

### minor

#### M1: `amountUnit as IngredientUnit` — 型ガードなしキャスト
- ファイル: `apps/web/src/app/recipes/[id]/edit/_components/recipe-edit-form-client.tsx:54`
- 理由: `RecipeDto.ingredients[].amountUnit` は `Unit | null` 型（domain）であり、`IngredientUnit`（= `NonNullable<unitSchema.options>`）と値セットは同一だが TypeScript 型システム上は別型。`as` キャストにより型安全性が一部失われている。実行時安全（`recipeIngredientSchema.superRefine` で `amountValue !== null` ↔ `amountUnit !== null` が保証されているため `null` が来ない分岐）だが、将来 `Unit` と `unitSchema` の値が乖離した場合に検出できない。
- 修正案:
  ```typescript
  import { unitSchema } from '@cookpit/api-contract';
  // amountUnit が IngredientUnit か確認してからセット
  const unit = unitSchema.options.find((u) => u === ingredient.amountUnit);
  amountUnit: unit ?? '', // 非ヒットは防御的 fallback
  ```
  または Application 層の `RecipeDto` の `amountUnit` 型を `IngredientUnit | null` に揃える（ただしこれは Domain/Application 層の変更を伴うため Orchestrator 判断）。

---

### nits

#### N1: `ingredient-{index}` は 0-based、`nextIngredientId` は `length+1` (1-based+1) — 欠番 `ingredient-{length}` が発生
- ファイル: `apps/web/src/app/recipes/[id]/edit/_components/recipe-edit-form-client.tsx:48, 84`
- 理由: 既存行 ID が `ingredient-0`〜`ingredient-{length-1}` (0-based) で、新規追加 ID が `ingredient-{length+1}` からになるため `ingredient-{length}` が欠番になる。React key の重複は発生しないため実害なし。実装計画（line 306）の記述と整合している。
- 修正案（任意）: `nextIngredientId = useRef(recipe.ingredients.length)` にすれば欠番なしになるが、今後行を削除した際にも重複はないため現状でも問題なし。

#### N2: `page.tsx` の `export default` — コーディング規約「デフォルトエクスポートは禁止」との表面的な矛盾
- ファイル: `apps/web/src/app/recipes/[id]/edit/page.tsx:13`
- 理由: coding-standards.md では「デフォルトエクスポートは禁止」とあるが、Next.js App Router の page.tsx は `export default` が必須（フレームワーク要件）。既存の `[id]/page.tsx`, `new/page.tsx` も同じパターンであり、プロジェクト内で確立された例外扱い。
- 修正案: 問題なし。ただし coding-standards.md に「Next.js page/layout は除く」旨を明記することを Nice として推奨。

#### N3: `notes` フィールドの `useState(recipe.notes)` — `null` 非対応だが DTO 型は `string` で問題なし
- ファイル: `apps/web/src/app/recipes/[id]/edit/_components/recipe-edit-form-client.tsx:98`
- 理由: `RecipeDto.notes: string`（non-null）なので問題なし。念のため確認のみ。

---

## 重大指摘なし（critical / major）

---

## 設計・計画整合チェック

| 観点 | 結果 |
|---|---|
| 初期表示 Server Component + GetRecipeUseCase 手動 DI | 実装通り（page.tsx:15-26） |
| RecipeNotFoundError → notFound() | 実装通り（page.tsx:22-24） |
| dynamic = 'force-dynamic' | 実装通り（page.tsx:7） |
| PUT /api/recipes/:id Hono RPC 呼び出し | 実装通り（recipe-edit-form-client.tsx:207-210） |
| baseServings 読み取り専用表示 / PUT ボディに含めない | 実装通り（line 103, 174-186） |
| PUT 失敗 → '保存に失敗しました。' | 実装通り（line 216） |
| ネットワークエラー → '通信エラーが発生しました。' | 実装通り（line 218） |
| submitting による二重送信防止 | 実装通り（line 99, 104, 192, 205） |
| キャンセル → router.push(`/recipes/${recipe.id}`) | 実装通り（line 236-238） |
| IngredientRow/StepRow 共通ディレクトリへ移動 | 完了（`_components/` に配置、旧 `new/_components/` 削除済み） |
| buildIngredientInput ユーティリティ切り出し | 完了（`_utils/build-ingredient-input.ts`） |
| 作成フォームの buildIngredientInput 呼び出しへのリファクタリング | 完了（recipe-form-client.tsx:149-151） |

---

## 作成フォーム共通化の回帰リスク評価

`buildIngredientInput` の抽出は 1:1 等価と判定。以下を確認済み:

- 空行スキップ（`isEmptyRow`）: `build-ingredient-input.ts:16-20` ← 元の `recipe-form-client.tsx` の処理と同等
- displayName 空エラー: `build-ingredient-input.ts:22-25`
- amountText 空エラー: `build-ingredient-input.ts:27-30`
- 数値判定 / 範囲外エラー: `build-ingredient-input.ts:32-39`
- 単位なしエラー: `build-ingredient-input.ts:41-44`
- amountValue ルート push: `build-ingredient-input.ts:46-53`（`productRef: null` 付与済み）
- amountNote ルート push: `build-ingredient-input.ts:56-62`（`amountValue: null, amountUnit: null` 付与済み）

`recipe-form-client.tsx` 側の `buildCreateInput` は `buildIngredientInput` 呼び出しに置き換え済み（line 149-151）。元のループは削除されており、回帰リスクは低い。

---

## 品質ゲート

- `pnpm lint`: エラー 0（warning 2 件は既存・今回対象外ファイル）
- `pnpm type-check`: 全パッケージ pass
- `pnpm test`: 未再実行（implementer が green 報告済み、Domain 層変更なしのため）
