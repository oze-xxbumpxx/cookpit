# Sprint 1：レシピ編集画面 実装指針

Codex への実装指示書。実装後は必ず Claude Code でレビューを受けること。

**前提**：作成フォーム（`/recipes/new`）・詳細画面（`/recipes/[id]`）・ビジュアルデザイン「温かいキッチン」が実装済み。`UpdateRecipeUseCase` / `updateRecipeSchema`（`UpdateRecipeBody`）/ `PUT /api/recipes/:id` はサーバー側で実装済み。

**このタスクの2本柱**：

1. 作成フォームを **DRY に共通抽出**し、編集画面 `/recipes/[id]/edit` を新設する（PUT で更新）。
2. 詳細画面に **編集ボタンを追加**する（前タスクで保留した導線）。

---

## 確定済みの設計判断

- **フォームは共通抽出（DRY）**：入力 UI を presentational な共通コンポーネントへ、検証・変換ロジックを共通モジュールへ切り出し、作成/編集は state・送信・baseServings の差分だけを持つ。
- **編集では `baseServings` を変更しない**（`UpdateRecipeBody` に `baseServings` は無い。`UpdateRecipeUseCase` も `rename/updateIngredients/updateSteps/updateTags/updateCookingTime/updateNotes` のみ）。編集画面では基準人数を**読取専用で表示**する（「2人分（変更不可）」）。
- **送信後の遷移先は詳細 `/recipes/[id]` + `router.refresh()`**（編集していたレシピへ戻る）。
- **色はトークン（温かいキッチン）で実装**（`zinc-*` 直書きしない。`bg-background`/`bg-card`/`text-foreground`/`bg-primary` 等）。

---

## 事前確認

- `.claude/rules/presentation-layer.md` / `.claude/rules/coding-standards.md`
- `apps/web/src/app/recipes/new/_components/recipe-form-client.tsx`（**抽出元の作成フォーム**。state・helpers・`buildCreateInput`・JSX 構造を把握）
- `apps/web/src/app/recipes/new/_components/{ingredient-row,step-row}.tsx`（共有へ移動する対象）
- `apps/web/src/app/recipes/[id]/page.tsx` / `recipe-detail-client.tsx`（取得パターンの手本・編集ボタン追加先）
- `packages/application/src/recipe/update-recipe.use-case.ts`（`execute(input: UpdateRecipeInputDto)`）
- `packages/api-contract/src/recipe.schema.ts`（`updateRecipeSchema` / `UpdateRecipeBody` ＝ name・ingredients・steps・tags・cookingTime・notes。**baseServings なし**）
- `apps/web/src/server/routes/recipes.ts`（`PUT /:id` ＝ `client.api.recipes[':id'].$put({ param, json })`）

---

## ファイル構成（移動・新規・更新）

```
移動（new/_components → recipes/_components へ。作成・編集の共有のため）
apps/web/src/app/recipes/new/_components/ingredient-row.tsx
  → apps/web/src/app/recipes/_components/ingredient-row.tsx
apps/web/src/app/recipes/new/_components/step-row.tsx
  → apps/web/src/app/recipes/_components/step-row.tsx

新規
apps/web/src/app/recipes/_components/recipe-form-shared.ts            # 型・初期化・検証・build・逆変換（ロジック）
apps/web/src/app/recipes/_components/recipe-form-fields.tsx           # 共通の入力 UI（presentational, 'use client'）
apps/web/src/app/recipes/[id]/edit/page.tsx                          # Server Component（取得→notFound→編集クライアント）
apps/web/src/app/recipes/[id]/edit/_components/recipe-edit-form-client.tsx  # 編集クライアント（PUT）

更新
apps/web/src/app/recipes/new/_components/recipe-form-client.tsx       # 共通抽出に合わせて再構成（POST・baseServings 編集）
apps/web/src/app/recipes/[id]/_components/recipe-detail-client.tsx    # 編集ボタン追加
```

> **移動は既存ファイルの削除＋再作成にあたる。** 実装着手前にユーザーへ確認すること。移動後、作成フォーム側の import パスも更新する。

---

## 共通抽出の設計

### 共通の型と差分

作成と編集で**同一**なのは：レシピ名・タグ・調理時間・材料・手順・メモ。**差分**は：初期値（空 / 既存値）・baseServings（編集可 / 読取専用・送信しない）・送信（POST / PUT）・遷移先・送信ボディ（`CreateRecipeBody` / `UpdateRecipeBody`）。

`UpdateRecipeBody` ＝ `CreateRecipeBody` から `baseServings` を除いたもの。これを「共通入力」として扱う。

### `recipe-form-shared.ts`（ロジック）

共通の型・初期化・検証・build・逆変換を集約する（JSX なし）。

```ts
import type { UpdateRecipeBody } from '@cookpit/api-contract';
import type { RecipeIngredientDto } from '@cookpit/application';
import type { IngredientRowValue } from './ingredient-row';
import type { StepRowValue } from './step-row';

export interface CommonFieldErrors {
  cookingTime: string | null;
  ingredients: Record<string, string>;
}

export function emptyCommonFieldErrors(): CommonFieldErrors {
  return { cookingTime: null, ingredients: {} };
}

export function createIngredientRow(id: string): IngredientRowValue {
  return { id, displayName: '', amountText: '', amountUnit: '' };
}

export function createStepRow(id: string): StepRowValue {
  return { id, description: '' };
}

// RecipeDto の材料 → フォーム行（buildCreateInput の逆変換）
export function toIngredientRowValue(dto: RecipeIngredientDto, id: string): IngredientRowValue {
  if (dto.amountValue !== null) {
    return {
      id,
      displayName: dto.displayName,
      amountText: String(dto.amountValue),
      amountUnit: dto.amountUnit ?? '',
    };
  }
  return {
    id,
    displayName: dto.displayName,
    amountText: dto.amountNote ?? '',
    amountUnit: '',
  };
}

// 共通6フィールド（name/tags/cookingTime/notes/ingredients/steps）を検証して UpdateRecipeBody 形に build。
// baseServings は含めない（作成側で別途付与）。
export interface BuildCommonResult {
  input: UpdateRecipeBody | null;
  errors: CommonFieldErrors;
}

export function buildCommonRecipeInput(args: {
  name: string;
  tags: UpdateRecipeBody['tags'];
  cookingTime: string;
  notes: string;
  ingredients: IngredientRowValue[];
  steps: StepRowValue[];
}): BuildCommonResult {
  // 既存 buildCreateInput の ingredients/steps/cookingTime 検証ロジックをそのまま移植する。
  // - 量の数値/テキスト判定（数値→amountValue+amountUnit、テキスト→amountNote、単位欠落や負値は行エラー）
  // - cookingTime 空→null、非整数/負値→errors.cookingTime
  // - 食材名空の行はスキップ／空でない行は検証
  // 返す input は { name: name.trim(), tags, cookingTime, notes, ingredients, steps }（UpdateRecipeBody）。
  // エラーがあれば input: null。
}
```

> `buildCommonRecipeInput` の中身は、既存 `recipe-form-client.tsx` の `buildCreateInput` から **baseServings 関連を除いた部分**をそのまま移植する。作成側は戻り値 `input` に `baseServings` を付けて `CreateRecipeBody` にする。

### `recipe-form-fields.tsx`（共通の入力 UI・presentational）

state は持たず、値と変更ハンドラを props で受ける。**baseServings セルは `baseServingsSlot` として外から差し込む**（作成＝編集可能な Input、編集＝読取専用表示）。ヘッダ（キャンセル/タイトル/保存）も差分があるため、`header` を props で受けるか各クライアントが描画する（どちらでも可。下記例は fields に header を含めない方式）。

```tsx
'use client';

import type { ReactNode } from 'react';
import type { UpdateRecipeBody } from '@cookpit/api-contract';
import type { IngredientRowValue } from './ingredient-row';
import type { StepRowValue } from './step-row';
import type { CommonFieldErrors } from './recipe-form-shared';

type RecipeTag = UpdateRecipeBody['tags'][number];

interface Props {
  name: string;
  onNameChange: (value: string) => void;
  tags: RecipeTag[];
  onToggleTag: (tag: RecipeTag) => void;
  tagOptions: readonly RecipeTag[];
  baseServingsSlot: ReactNode; // 作成=Input / 編集=読取専用表示
  cookingTime: string;
  onCookingTimeChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  ingredients: IngredientRowValue[];
  onAddIngredient: () => void;
  onUpdateIngredient: (next: IngredientRowValue) => void;
  onRemoveIngredient: (id: string) => void;
  steps: StepRowValue[];
  onAddStep: () => void;
  onUpdateStep: (next: StepRowValue) => void;
  onRemoveStep: (id: string) => void;
  unitOptions: readonly IngredientRowValue['amountUnit'][]; // '' を除いた IngredientUnit[] を渡す
  errors: CommonFieldErrors;
}
```

- 既存 `recipe-form-client.tsx` の JSX（レシピ名・タグ・基準人数+調理時間の2カラム・材料・手順・メモ）を**この共通コンポーネントへ移植**する。`zinc-*` はトークンへ（既にデザイン適用済みの作成フォームから移すので、その時点でトークン化されている）。
- 2カラムグリッドの左セル（基準人数）に `baseServingsSlot` を置き、右セルに調理時間 Input を置く。

---

## ステップ1：共有化（移動＋抽出）

1. `ingredient-row.tsx` / `step-row.tsx` を `recipes/_components/` へ移動。
2. `recipe-form-shared.ts` を作成（上記）。`buildCreateInput` の共通部分を `buildCommonRecipeInput` へ移植。
3. `recipe-form-fields.tsx` を作成。作成フォームの入力 JSX を移植。
4. `recipe-form-client.tsx`（作成）を再構成：
   - state は従来どおり（name/tags/baseServings/cookingTime/ingredients/steps/notes/submitting/errorMessage）。baseServings の検証・エラーは作成クライアントが持つ。
   - 送信は `buildCommonRecipeInput(...)` → `input !== null` かつ baseServings 妥当なら `{ ...input, baseServings: Number(...) }`（`CreateRecipeBody`）で `$post`。
   - `baseServingsSlot` に編集可能な数値 Input を渡す。
   - `RecipeFormFields` を描画。
   - **作成フォームの挙動は従来と完全に同一に保つ**（回帰なし）。

## ステップ2：編集ページ（Server Component）

`apps/web/src/app/recipes/[id]/edit/page.tsx`：詳細の `page.tsx` と同じ取得パターン。

```tsx
import { getDb } from '@/db/client';
import { GetRecipeUseCase, RecipeNotFoundError } from '@cookpit/application';
import { DrizzleRecipeRepository } from '@cookpit/infrastructure';
import { notFound } from 'next/navigation';
import { RecipeEditFormClient } from './_components/recipe-edit-form-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RecipeEditPage({ params }: Props) {
  const { id } = await params;
  const repository = new DrizzleRecipeRepository(getDb());
  const useCase = new GetRecipeUseCase(repository);

  try {
    const recipe = await useCase.execute(id);
    return <RecipeEditFormClient recipe={recipe} />;
  } catch (error) {
    if (error instanceof RecipeNotFoundError) {
      notFound();
    }
    throw error;
  }
}
```

## ステップ3：編集クライアント

`recipe-edit-form-client.tsx`：`RecipeDto` をプレフィルし、`RecipeFormFields` を描画、PUT で更新。

- 初期化：`recipe.ingredients` を `toIngredientRowValue` で行へ（0件なら空1行）。`recipe.steps` を `StepRowValue` へ（0件なら空1行）。`name`/`tags`/`cookingTime`（`recipe.cookingTime === null ? '' : String(...)`）/`notes` をプレフィル。
- `baseServingsSlot` に**読取専用表示**（例：`基準人数 2人分（変更不可）`）を渡す。baseServings の state・検証は持たない。
- 送信：`buildCommonRecipeInput(...)` → `input !== null` なら `client.api.recipes[':id'].$put({ param: { id: recipe.id }, json: input })`。
- 成功（`res.ok`）→ `router.push(`/recipes/${recipe.id}`)` + `router.refresh()`。失敗 → エラーメッセージ。
- ヘッダ：キャンセル → `router.push(`/recipes/${recipe.id}`)`、タイトル「レシピを編集」、保存（`name.trim() !== '' && !submitting`）。
- `canSubmit` / `submitting` / `errorMessage` / `fieldErrors`（`CommonFieldErrors`）を持つ。

## ステップ4：詳細画面に編集ボタン追加

`recipe-detail-client.tsx` のトップバー右（現在は空の `<span aria-hidden className="w-9" />` プレースホルダ）を、`/recipes/[id]/edit` への「編集」リンクに置き換える。

```tsx
import Link from 'next/link';
// ...
<Link href={`/recipes/${recipe.id}/edit`} className="text-sm font-medium text-primary">
  編集
</Link>;
```

- 中央タイトルの中央寄せを崩さないよう、左の戻るボタンと幅バランスを取る（グリッド `grid-cols-[auto_1fr_auto]` は維持）。

---

## 型チェック・動作確認

```bash
pnpm --filter @cookpit/web type-check
pnpm --filter @cookpit/web lint
pnpm --filter @cookpit/web dev --webpack
```

ブラウザ確認：

- 詳細画面の「編集」→ `/recipes/[id]/edit` に遷移し、**既存値がすべてプレフィル**される（名前・タグ・調理時間・材料（数値量/「少々」両方）・手順・メモ）
- 基準人数は読取専用で表示され、編集できない
- 数値量の材料が `量=数値・単位選択` でプレフィルされ、「少々」等が `量=テキスト・単位空` でプレフィルされる
- 値を変更して保存 → 詳細 `/recipes/[id]` に戻り、変更が反映されている（`router.refresh()`）
- レシピ名を空にすると保存ボタンが disabled
- 不正な材料（数値なのに単位なし等）で行エラーが出て送信されない（作成フォームと同じ挙動）
- **作成フォーム（`/recipes/new`）が従来どおり動く**（回帰確認：新規作成→保存→一覧反映）
- 存在しない id の `/recipes/[id]/edit` で 404
- 375px でレイアウト崩れなし

---

## 共通の注意事項

- `any` 禁止 / default export 禁止（page.tsx 例外）/ 型のみ `import type` / `===`・`!==` / 「値なし」は `null`。
- 色はトークン（`zinc-*` 直書き禁止）。移植時に作成フォームの既存トークンを引き継ぐ。
- フォーム内部状態（文字列中心）と送信 DTO（数値・null 含む）は別物。変換は `recipe-form-shared.ts` に集約（作成・編集で共有）。
- 単位・タグの選択肢は `@cookpit/api-contract` の `unitSchema.options` / `recipeTagSchema.options` を参照（ハードコード二重管理禁止）。
- TanStack Query は導入しない。送信は `client.api.recipes[':id'].$put`。
- リファクタは「作成フォームの挙動を変えない」ことが絶対条件。移植のみで仕様変更しない。

---

## 完了条件

- [ ] `ingredient-row.tsx` / `step-row.tsx` を `recipes/_components/` へ移動し、作成フォームの import を更新
- [ ] `recipe-form-shared.ts` / `recipe-form-fields.tsx` を作成し、作成フォームがこれらを使う形に再構成（挙動は不変）
- [ ] `[id]/edit/page.tsx`（Server Component・notFound）と `recipe-edit-form-client.tsx`（PUT）を作成
- [ ] 既存値のプレフィル（数値量・メモ量の逆変換含む）が正しい
- [ ] 基準人数は読取専用・送信しない（`UpdateRecipeBody` に含めない）
- [ ] 保存成功で詳細 `/recipes/[id]` へ戻り反映（`router.refresh()`）
- [ ] 詳細画面に編集ボタン（`/recipes/[id]/edit` リンク）を追加
- [ ] 作成フォームに回帰がない
- [ ] `type-check` / `lint` が通る（色は `zinc-*` 残置なし）
- [ ] 375px で崩れない
- [ ] 実装後に Claude Code へレビュー依頼

---

## レビュー観点（Claude Code 用）

- 共通抽出後、**作成フォームの挙動が変わっていないか**（state・検証・送信・トークン）
- 逆変換（`toIngredientRowValue`）：`amountValue` 行と `amountNote` 行の振り分けが `buildCreateInput` の逆になっているか
- `baseServings` を誤って `UpdateRecipeBody` に含めていないか／編集で変更可能になっていないか
- 移動した `ingredient-row`/`step-row` の import パス更新漏れ
- Tailwind タイポ・トークン化漏れ（`zinc-`/`bg-white` 残置）
- `params` await・`RecipeNotFoundError`→`notFound()`・`$put` の param/json 形
- `'use client'` の付け忘れ／不要付与（`recipe-form-shared.ts` は純ロジックなので `'use client'` 不要）

---

## このタスクのスコープ外

- 商品マスタ連携（`productRef`） — Phase 2
- baseServings の編集（`Recipe.updateBaseServings()` 追加） — 必要になれば別タスクで不整合の扱いを決めてから
- 楽観的更新・TanStack Query — MVP1 では入れない
