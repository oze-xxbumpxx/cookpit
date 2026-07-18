# 実装計画: recipe-edit-screen

- 前提となる設計書: docs/designs/recipe-edit-screen.md
- レベル: L2
- 作成日: 2026-06-25

## 前提・確認済み設計判断

設計書の未決事項 2 点はユーザー承認済みで以下の通り確定している。本計画はこれに従う。

1. **量判定ロジック（buildIngredientInput）の共通化**: `apps/web/src/app/recipes/_utils/build-ingredient-input.ts` に新規切り出し。作成フォーム（`recipe-form-client.tsx`）もリファクタリングして使用する。
2. **IngredientRow / StepRow の配置移動**: `apps/web/src/app/recipes/new/_components/` から `apps/web/src/app/recipes/_components/` へ移動。作成フォーム・`new/page.tsx` の import パスも更新する。

---

## 変更対象ファイル

| パス                                                                 | 変更理由                                                                                                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/recipes/new/_components/ingredient-row.tsx`        | `_components/` へ移動するため削除（新規パスに再作成）                                                                                                |
| `apps/web/src/app/recipes/new/_components/step-row.tsx`              | `_components/` へ移動するため削除（新規パスに再作成）                                                                                                |
| `apps/web/src/app/recipes/new/_components/recipe-form-client.tsx`    | `buildIngredientInput` ユーティリティ呼び出しへのリファクタリングと IngredientRow/StepRow の import パス更新                                         |
| `apps/web/src/app/recipes/new/page.tsx`                              | IngredientRow/StepRow 移動後の import パス更新は不要（直接 import していない）。実態変更なし — import は `recipe-form-client.tsx` 経由のため変更不要 |
| `apps/web/src/app/recipes/[id]/_components/recipe-detail-client.tsx` | 「編集」ボタン追加（`<span aria-hidden="true" className="w-9" />` を `<Button>` に置き換え）                                                         |

> `apps/web/src/app/recipes/new/page.tsx` は IngredientRow/StepRow を直接 import していないため変更不要。`recipe-form-client.tsx` の import パス更新のみで対応完結する。

---

## 新規作成ファイル

| パス                                                                         | 役割                                                                                                                                                            |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/recipes/_components/ingredient-row.tsx`                    | `IngredientRow` コンポーネントと `IngredientRowValue`/`IngredientUnit` 型の共有定義（`new/_components/` から移動）                                              |
| `apps/web/src/app/recipes/_components/step-row.tsx`                          | `StepRow` コンポーネントと `StepRowValue` 型の共有定義（`new/_components/` から移動）                                                                           |
| `apps/web/src/app/recipes/_utils/build-ingredient-input.ts`                  | `buildIngredientInput` ユーティリティ関数（`IngredientRowValue[]` → `{ ingredients: RecipeIngredientBody[]; errors: Record<string, string> }` を返す）          |
| `apps/web/src/app/recipes/[id]/edit/page.tsx`                                | 編集画面 Server Component。`GetRecipeUseCase` を手動 DI、`RecipeNotFoundError` を catch して `notFound()` 呼出し、`RecipeEditFormClient` に `recipe` を渡す     |
| `apps/web/src/app/recipes/[id]/edit/_components/recipe-edit-form-client.tsx` | 編集フォーム Client Component。`RecipeDto` を props として初期値プリフィル、`buildIngredientInput` と `buildUpdateInput` を使用し `PUT /api/recipes/:id` へ送信 |

---

## ファイルごとの変更内容

### `apps/web/src/app/recipes/_components/ingredient-row.tsx` （新規・移動）

- 変更内容: `new/_components/ingredient-row.tsx` の内容をそのままコピーして新パスに配置。ファイル内部の変更なし。
- 完了条件: `new/_components/ingredient-row.tsx` と同一内容のファイルが新パスに存在すること。

### `apps/web/src/app/recipes/_components/step-row.tsx` （新規・移動）

- 変更内容: `new/_components/step-row.tsx` の内容をそのままコピーして新パスに配置。ファイル内部の変更なし。
- 完了条件: `new/_components/step-row.tsx` と同一内容のファイルが新パスに存在すること。

### `apps/web/src/app/recipes/new/_components/ingredient-row.tsx` （削除）

- 変更内容: 上記移動後にファイルを削除する。削除前に `recipe-form-client.tsx` の import パスが新パスを指していることを確認すること。
- 完了条件: ファイルが存在しない。かつ `pnpm type-check` が通る。

### `apps/web/src/app/recipes/new/_components/step-row.tsx` （削除）

- 変更内容: 上記移動後にファイルを削除する。削除前に `recipe-form-client.tsx` の import パスが新パスを指していることを確認すること。
- 完了条件: ファイルが存在しない。かつ `pnpm type-check` が通る。

### `apps/web/src/app/recipes/_utils/build-ingredient-input.ts` （新規作成）

- 変更内容: `recipe-form-client.tsx` の `buildCreateInput` 内にある材料行の数値/テキスト判定ロジック（`for (const row of ingredients)` ブロック）を関数として抽出する。シグネチャ:

  ```typescript
  import type { IngredientRowValue } from '@/app/recipes/_components/ingredient-row';
  import type { CreateRecipeBody } from '@cookpit/api-contract';

  type RecipeIngredientBody = CreateRecipeBody['ingredients'][number];

  export function buildIngredientInput(rows: IngredientRowValue[]): {
    ingredients: RecipeIngredientBody[];
    errors: Record<string, string>;
  };
  ```

  - 空行スキップ（`isEmptyRow`）のロジックを含む。
  - バリデーションエラー（食材名なし・量なし・数値範囲外・単位なし）を `errors` として返す。
  - `amountNote` ルートの場合は `amountValue: null, amountUnit: null, amountNote: amountText` を組み立てる。
  - `amountValue` ルートの場合は `amountValue, amountUnit: row.amountUnit, amountNote: null` を組み立てる。
  - `productRef: null` を固定で付与する（`createRecipeSchema` / `updateRecipeSchema` 共通）。

- 完了条件: `pnpm type-check` / `pnpm lint` が通る。作成フォームから呼び出した際の動作が既存と等価であること（ステップ 4 の手動テストで確認）。

### `apps/web/src/app/recipes/new/_components/recipe-form-client.tsx` （変更）

- 変更内容:
  1. `IngredientRow` / `StepRow` の import パスを `@/app/recipes/_components/ingredient-row` / `@/app/recipes/_components/step-row` に変更する。
  2. `buildIngredientInput` を `@/app/recipes/_utils/build-ingredient-input` から import する。
  3. `buildCreateInput` 内の材料行ループ（`for (const row of ingredients)` ブロック）を `buildIngredientInput(ingredients)` 呼び出しに置き換え、戻り値の `{ ingredients: parsedIngredients, errors: ingredientErrors }` をマージして使う。
  4. `parsedIngredients` の型宣言と空配列初期化を削除する（`buildIngredientInput` 内部で管理するため）。
  5. `FieldErrors.ingredients` の型は `Record<string, string>` で変わらない。`ingredientErrors` をマージして `errors.ingredients` にセットする形に調整する。
  - **変更の最小化原則**: 上記 5 点以外は一切変更しない。

- 完了条件:
  - `pnpm type-check` / `pnpm lint` が通る。
  - 作成フォームで材料を追加・入力・保存できる（手動テスト: ステップ 4）。
  - 既存の作成フォームの挙動（バリデーション・エラー表示・保存後リダイレクト）が回帰していない。

### `apps/web/src/app/recipes/[id]/_components/recipe-detail-client.tsx` （変更）

- 変更内容:
  1. `Pencil` を `lucide-react` から追加 import する。
  2. `<span aria-hidden="true" className="w-9" />` を以下の `<Button>` に置き換える:
     ```tsx
     <Button
       type="button"
       variant="ghost"
       size="icon-lg"
       onClick={() => router.push(`/recipes/${recipe.id}/edit`)}
       aria-label="編集"
       className="text-foreground"
     >
       <Pencil className="size-5" aria-hidden="true" />
     </Button>
     ```
  - header の `grid-cols-[auto_1fr_auto]` はそのまま維持する。

- 完了条件:
  - 詳細画面ヘッダー右端に鉛筆アイコンの「編集」ボタンが表示される。
  - ボタンクリックで `/recipes/{id}/edit` へ遷移する。
  - `pnpm type-check` / `pnpm lint` が通る。
  - 既存の削除・スケール変更などの機能が回帰していない。

### `apps/web/src/app/recipes/[id]/edit/page.tsx` （新規作成）

- 変更内容: 以下の構造を持つ Server Component を作成する。
  - `export const dynamic = 'force-dynamic'`
  - `params: Promise<{ id: string }>` を受け取る。
  - `DrizzleRecipeRepository` + `GetRecipeUseCase` を手動 DI で実行。DI パターンは `apps/web/src/app/recipes/[id]/page.tsx` と同一。
  - `RecipeNotFoundError` を catch して `notFound()` を呼ぶ。それ以外のエラーは `throw` する。
  - 取得した `recipe: RecipeDto` を `<RecipeEditFormClient recipe={recipe} />` へ渡す。
  - import: `getDb` from `@/db/client`、`GetRecipeUseCase`・`RecipeDto`・`RecipeNotFoundError` from `@cookpit/application`、`DrizzleRecipeRepository` from `@cookpit/infrastructure`、`notFound` from `next/navigation`。

- 完了条件:
  - `/recipes/{id}/edit` にアクセスすると編集フォームが表示される。
  - 存在しない ID でアクセスすると Next.js 標準の 404 ページが表示される。
  - `pnpm type-check` / `pnpm lint` が通る。

### `apps/web/src/app/recipes/[id]/edit/_components/recipe-edit-form-client.tsx` （新規作成）

- 変更内容: 以下の仕様で Client Component を作成する。

  **Props**: `{ recipe: RecipeDto }`

  **State の初期化**:
  - `name`: `useState(recipe.name)`
  - `tags`: `useState(recipe.tags)`
  - `cookingTime`: `useState(recipe.cookingTime !== null ? String(recipe.cookingTime) : '')`
  - `ingredients`: `RecipeDto` の `ingredients` を `IngredientRowValue[]` に変換して `useState` の初期値とする。変換ルール:
    - `amountValue !== null` の場合: `{ id: uuid/index文字列, displayName, amountText: String(amountValue), amountUnit }`
    - `amountNote !== null` の場合: `{ id: uuid/index文字列, displayName, amountText: amountNote, amountUnit: '' }`
    - id は `ingredient-${index}` 形式で生成する（`useRef` で次 ID を管理）
  - `steps`: `RecipeDto` の `steps` を `StepRowValue[]` に変換。`{ id: step-${index}, description }` 形式。
  - `notes`: `useState(recipe.notes)`
  - `submitting`: `useState(false)`
  - `errorMessage`: `useState<string | null>(null)`
  - `fieldErrors`: `useState(emptyFieldErrors())`

  **定数**: `baseServings` は `recipe.baseServings` を参照する変数（State 不要）。

  **`FieldErrors` 型**:

  ```typescript
  interface FieldErrors {
    cookingTime: string | null;
    ingredients: Record<string, string>;
  }
  ```

  （`baseServings` は編集不可のためフィールドエラーなし）

  **`buildUpdateInput()`**:
  - `buildIngredientInput(ingredients)` を呼び出し、材料を組み立てる。
  - `cookingTime` 文字列を `null` または `number` に変換し、バリデーションする（`0以上の整数`）。
  - 成功時に `UpdateRecipeBody` を返す（`name, tags, cookingTime, notes, ingredients, steps`）。`baseServings` を含めない。
  - 失敗時に `errors` を返す。

  **`handleSubmit`**:
  1. `buildUpdateInput()` を呼び出す。
  2. `setFieldErrors(errors)` する。
  3. `input === null` なら `setErrorMessage('入力内容を確認してください。')` して return。
  4. `setSubmitting(true)`。
  5. `client.api.recipes[':id'].$put({ param: { id: recipe.id }, json: input })` を呼ぶ。
  6. `response.ok` なら `router.push(`/recipes/${recipe.id}`)` + `router.refresh()`。
  7. `!response.ok` なら `setErrorMessage('保存に失敗しました。')` する。
  8. catch で `setErrorMessage('通信エラーが発生しました。')` する。
  9. finally で `setSubmitting(false)`。

  **キャンセル**: `router.push(`/recipes/${recipe.id}`)` で詳細画面へ戻る。

  **UI レイアウト**:
  - 作成フォームと同一の `<main>` / `<form>` 構造。
  - header `<h1>` は「レシピを編集」。
  - キャンセルボタン（左）・保存ボタン（右）。
  - `baseServings` は `<p>基準人数: {recipe.baseServings}人分</p>` として静的テキスト表示。編集不可であることを示すキャプション「（作成後は変更できません）」を付与。
  - `IngredientRow` / `StepRow` は `@/app/recipes/_components/ingredient-row` / `@/app/recipes/_components/step-row` から import する。
  - `buildIngredientInput` は `@/app/recipes/_utils/build-ingredient-input` から import する。
  - `client` は `@/lib/api-client` から import する。

- 完了条件:
  - 既存レシピの全フィールド（name/tags/cookingTime/ingredients/steps/notes）が初期表示される。
  - `baseServings` が静的テキストとして表示され、入力不可。
  - 各フィールドを変更して保存すると詳細画面へ遷移し、変更値が反映される。
  - 保存失敗時にエラーメッセージが表示される。フォームは閉じない。
  - `pnpm type-check` / `pnpm lint` が通る。

---

## 実装手順

依存順序に従い、下記の順で実装する。共通化したものが先、それを使う側が後。

### ステップ 1: IngredientRow / StepRow を共有ディレクトリへ移動

**対象ファイル**:

- 新規: `apps/web/src/app/recipes/_components/ingredient-row.tsx`
- 新規: `apps/web/src/app/recipes/_components/step-row.tsx`
- 削除予定: `apps/web/src/app/recipes/new/_components/ingredient-row.tsx`（ステップ 2 完了後に削除）
- 削除予定: `apps/web/src/app/recipes/new/_components/step-row.tsx`（ステップ 2 完了後に削除）

**変更内容**:

1. `apps/web/src/app/recipes/_components/ingredient-row.tsx` を新規作成し、既存 `new/_components/ingredient-row.tsx` の内容をコピーする。ファイル内容の変更なし。
2. `apps/web/src/app/recipes/_components/step-row.tsx` を新規作成し、既存 `new/_components/step-row.tsx` の内容をコピーする。ファイル内容の変更なし。
3. 旧ファイル（`new/_components/` 内）はこの時点ではまだ残す（ステップ 2 で参照先を切り替えた後に削除）。

**完了条件**: 新パスのファイルが存在し、内容が旧ファイルと同一であること。

---

### ステップ 2: buildIngredientInput ユーティリティを切り出し、作成フォームのリファクタリング

**対象ファイル**:

- 新規: `apps/web/src/app/recipes/_utils/build-ingredient-input.ts`
- 変更: `apps/web/src/app/recipes/new/_components/recipe-form-client.tsx`

**変更内容**:

1. `_utils/build-ingredient-input.ts` を新規作成する。`recipe-form-client.tsx` の `buildCreateInput` 内にある材料行ループ全体（空行スキップ・バリデーション・`parsedIngredients.push` までの処理）を抽出して実装する。import は `@/app/recipes/_components/ingredient-row`（ステップ 1 で作成した新パス）から `IngredientRowValue` を使う。
2. `recipe-form-client.tsx` を変更する:
   - `IngredientRow` / `StepRow` の import を `./ingredient-row` / `./step-row` から `@/app/recipes/_components/ingredient-row` / `@/app/recipes/_components/step-row` へ変更する。
   - `buildIngredientInput` を `@/app/recipes/_utils/build-ingredient-input` から import する。
   - `buildCreateInput` 内の材料行ループを `buildIngredientInput(ingredients)` 呼び出しに置き換える。
3. 旧 `new/_components/ingredient-row.tsx` と `new/_components/step-row.tsx` を削除する（この時点で参照がなくなるため）。

**完了条件**:

- `pnpm type-check` / `pnpm lint` が通る。
- 旧ファイル（`new/_components/ingredient-row.tsx` / `new/_components/step-row.tsx`）が存在しない。

---

### ステップ 3: 作成フォーム（recipe-form-client.tsx）の回帰確認

**対象ファイル**: （コード変更なし。手動テストのみ）

**確認内容**:

- レシピ作成フォーム（`/recipes/new`）を開く。
- 材料を複数行追加し、数値量・テキスト量（amountNote 相当）それぞれで入力できること。
- バリデーションエラー（食材名なし・量なし・単位なし・不正数値）が正しく表示されること。
- 保存後に一覧画面へ遷移すること。

**完了条件**: 上記すべての動作が回帰なく確認できること。

---

### ステップ 4: 詳細画面に「編集」ボタンを追加

**対象ファイル**: `apps/web/src/app/recipes/[id]/_components/recipe-detail-client.tsx`

**変更内容**:

- `Pencil` を `lucide-react` から追加 import する。
- header 内 `<span aria-hidden="true" className="w-9" />` を `<Button>` に置き換える（詳細は「ファイルごとの変更内容」参照）。

**完了条件**:

- 詳細画面に「編集」ボタン（鉛筆アイコン）が表示される。
- クリックで `/recipes/{id}/edit` へ遷移する（この時点では編集ページ未実装のため 404 になるが、リンク先 URL が正しいことを確認する）。
- `pnpm type-check` / `pnpm lint` が通る。

---

### ステップ 5: 編集画面 Server Component（edit/page.tsx）を新規作成

**対象ファイル**: `apps/web/src/app/recipes/[id]/edit/page.tsx`（新規作成。ディレクトリも新規）

**変更内容**:

- `apps/web/src/app/recipes/[id]/page.tsx` と同一の手動 DI パターンで `GetRecipeUseCase` を実行する。
- `RecipeNotFoundError` catch → `notFound()` パターンを適用する。
- `<RecipeEditFormClient recipe={recipe} />` を return する（Client Component は次ステップで作成するが、import 先パスは先に決定しておく）。
- `export const dynamic = 'force-dynamic'` を付与する。

**完了条件**:

- ファイルが正しい構造で作成されている。
- `pnpm type-check` が通る（Client Component が未実装の場合は型エラーになる可能性があるため、ステップ 5 と 6 は連続して実施し、完了条件はステップ 6 完了後にまとめて確認してもよい）。

---

### ステップ 6: 編集フォーム Client Component（recipe-edit-form-client.tsx）を新規作成

**対象ファイル**: `apps/web/src/app/recipes/[id]/edit/_components/recipe-edit-form-client.tsx`（新規作成。ディレクトリも新規）

**変更内容**:

- 「ファイルごとの変更内容」節の仕様に従い実装する。
- `IngredientRow` / `StepRow` は `@/app/recipes/_components/ingredient-row` / `@/app/recipes/_components/step-row` から import する。
- `buildIngredientInput` は `@/app/recipes/_utils/build-ingredient-input` から import する。
- `RecipeDto` の `ingredients` を `IngredientRowValue[]` へ変換するロジック（`amountValue` vs `amountNote` の分岐）をコンポーネント内の初期化処理として実装する。
- `nextIngredientId` / `nextStepId` は初期値を「既存行数 + 1」にする（`useRef(recipe.ingredients.length + 1)` 等）。

**完了条件**:

- 既存レシピを開いたとき、全フィールドの現在値がフォームに表示される。
- `baseServings` が静的テキストとして表示され、入力フィールドが存在しない。
- フィールドを変更して保存すると詳細画面へ遷移し、DB の値が更新されている。
- キャンセルボタンで詳細画面へ戻る。
- `pnpm type-check` / `pnpm lint` が通る。

---

### ステップ 7: 品質ゲート（全体）

**対象ファイル**: （コード変更なし）

**実行内容**:

```
pnpm lint
pnpm type-check
pnpm test
```

**完了条件**: 3 コマンドすべてがエラーなしで終了する。

---

## 依存関係

```
ステップ 1（行コンポーネント移動）
  ↓
ステップ 2（util 切り出し + 作成フォームのリファクタリング + 旧ファイル削除）
  ↓
ステップ 3（作成フォームの手動回帰テスト）
  ↓
ステップ 4（詳細画面に編集ボタン追加）
  ↓
ステップ 5 + 6（編集 page.tsx + edit-form-client.tsx 新規作成）— 5 と 6 は連続実施
  ↓
ステップ 7（品質ゲート）
```

- ステップ 1 は ステップ 2 の前提（`_utils/build-ingredient-input.ts` が `@/app/recipes/_components/ingredient-row` を import するため）。
- ステップ 2 で旧 `new/_components/ingredient-row.tsx` / `step-row.tsx` を削除するため、その前にステップ 1 が完了していること。
- ステップ 4（詳細画面の編集ボタン）はステップ 1〜3 と並行実施可能だが、編集先 URL のリンク確認はステップ 5 以降が望ましい。
- ステップ 5 と 6 は同一ディレクトリへの新規作成であり、連続して実施する。page.tsx が Client Component を import するため、型チェックはステップ 6 完了後にまとめて確認する。

---

## テスト計画

Domain 層（`packages/domain`）への変更はないため、既存の Vitest テストへの追加・変更は不要。

Presentation 層の自動テストは coding-standards.md に従い後続フェーズで整備する。本機能の検証は以下の手動テストで行う（詳細テスト計画は `docs/tests/recipe-edit-screen.md` に委ねる）。

**手動テスト観点（完了条件として各ステップに対応）**:

| 観点                                                     | 確認ステップ |
| -------------------------------------------------------- | ------------ |
| 作成フォームの回帰（材料入力・バリデーション・保存）     | ステップ 3   |
| 詳細画面に編集ボタンが表示される                         | ステップ 4   |
| 編集ボタンで `/recipes/[id]/edit` へ遷移                 | ステップ 4   |
| 編集フォームに既存値が全フィールド初期表示される         | ステップ 6   |
| `baseServings` が静的テキスト表示（入力不可）            | ステップ 6   |
| 各フィールドを変更して保存→詳細画面へ遷移・変更反映      | ステップ 6   |
| 保存失敗時にエラーメッセージ表示・フォーム維持           | ステップ 6   |
| 存在しない ID（`/recipes/unknown-uuid/edit`）で 404 表示 | ステップ 5/6 |
| キャンセルボタンで詳細画面へ戻る                         | ステップ 6   |

---

## リスク

| リスク                                                                            | 影響                                       | 対策                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ファイル移動（IngredientRow/StepRow）後に import 漏れが残る                       | `pnpm type-check` で型エラー発生           | ステップ 2 で旧ファイルを削除することにより残存 import が型エラーとして検出される。ステップ 7 の `pnpm type-check` で必ず確認する                                                                                                                                  |
| `buildIngredientInput` の抽出ミスによる作成フォームの回帰                         | 作成機能の破損                             | ステップ 2 後すぐにステップ 3（手動回帰テスト）を実施する。`buildCreateInput` の材料ループを 1:1 で置き換えるため、ロジック変更なしに抽出することを徹底する                                                                                                        |
| `RecipeDto.ingredients` → `IngredientRowValue[]` 変換の実装誤り                   | 編集フォームの初期値が欠損                 | `amountValue !== null` と `amountNote !== null` の判定が `recipeIngredientSchema.superRefine` の制約（両方 null にはなれない）と対応していることを確認する。両方 null の行は DB 制約で存在し得ないが、防御的に `amountText: ''` にフォールバックする実装を推奨する |
| 編集後の `nextIngredientId` / `nextStepId` の初期値が既存行と衝突                 | 行 key の重複による React rendering 不具合 | `useRef` の初期値を `recipe.ingredients.length + 1` とし、既存行の id を `ingredient-0`, `ingredient-1`, ... 形式とすることで衝突を回避する                                                                                                                        |
| `size="icon-lg"` が `Button` コンポーネントに存在しない variant/size である可能性 | 型エラー                                   | 既存の `recipe-detail-client.tsx` が `size="icon-lg"` を使用しているため、サポート済みであることが確認済み。`pnpm type-check` で検証                                                                                                                               |

---

## ロールバック方法

各ステップは Git コミットを単位として実施することを推奨する。

- **ステップ 1〜2 ロールバック**: `new/_components/ingredient-row.tsx` / `step-row.tsx` を削除前の状態に戻し、`recipe-form-client.tsx` の import を元の相対パスに戻す。`_components/ingredient-row.tsx` / `step-row.tsx` と `_utils/build-ingredient-input.ts` を削除する。
- **ステップ 4 ロールバック**: `recipe-detail-client.tsx` の `<Button>` を `<span aria-hidden="true" className="w-9" />` に戻す。
- **ステップ 5〜6 ロールバック**: `apps/web/src/app/recipes/[id]/edit/` ディレクトリごと削除する。
- **全体ロールバック**: `git revert` または当該コミットを drop することで、各ステップを独立して巻き戻せる。

---

## ドキュメント更新対象

| ドキュメント                         | 更新要否                     | 内容                                                |
| ------------------------------------ | ---------------------------- | --------------------------------------------------- |
| `docs/designs/recipe-edit-screen.md` | 不要（設計書はそのまま保持） | —                                                   |
| `docs/03-architecture.md`            | 不要                         | Presentation 層の増分のみで、アーキテクチャ変更なし |
| `docs/04-domain-model.md`            | 不要                         | Domain 層変更なし                                   |
| `docs/tests/recipe-edit-screen.md`   | test-designer が作成         | 詳細テスト計画は test-designer に委ねる             |

---

## 実装後チェックリスト

- [ ] `apps/web/src/app/recipes/_components/ingredient-row.tsx` が存在する
- [ ] `apps/web/src/app/recipes/_components/step-row.tsx` が存在する
- [ ] `apps/web/src/app/recipes/new/_components/ingredient-row.tsx` が存在しない（削除済み）
- [ ] `apps/web/src/app/recipes/new/_components/step-row.tsx` が存在しない（削除済み）
- [ ] `apps/web/src/app/recipes/_utils/build-ingredient-input.ts` が存在する
- [ ] `apps/web/src/app/recipes/new/_components/recipe-form-client.tsx` の import が新パスを指している
- [ ] `apps/web/src/app/recipes/[id]/_components/recipe-detail-client.tsx` に編集ボタンが追加されている
- [ ] `apps/web/src/app/recipes/[id]/edit/page.tsx` が存在する
- [ ] `apps/web/src/app/recipes/[id]/edit/_components/recipe-edit-form-client.tsx` が存在する
- [ ] `pnpm lint` が通る
- [ ] `pnpm type-check` が通る
- [ ] `pnpm test` が通る
- [ ] 作成フォームの手動回帰テストが完了している
- [ ] 編集フォームの手動テスト（全観点）が完了している
