# Sprint 1 Recipe 編集 UI 実装計画

- 前提となる指示書: `tasks/sprint1-recipe-ui-edit.md`
- レベル: L2
- 対象スプリント: Sprint 1 Recipe CRUD

## 目的

`/recipes/[id]/edit` に Recipe 編集画面を追加し、作成済みレシピをアプリ上で修正できる状態にする。

このタスクでは、既存の作成フォームを作成専用のまま増築せず、入力 UI と入力変換ロジックを `recipes/_components` に共通抽出する。編集画面は既存 Recipe を Server Component で取得し、Client Component でプレフィル表示、`PUT /api/recipes/:id` で更新する。

依存方向は次を守る。

```text
Presentation(Next.js App Router / Hono RPC) -> Application(UseCase) -> Domain <- Infrastructure
```

## ゴール

- `/recipes/[id]/edit` で Recipe 編集画面を表示できる。
- 編集画面の初期表示は Server Component から `GetRecipeUseCase` を直接呼び出す。
- 存在しない Recipe ID は `RecipeNotFoundError` を `notFound()` に変換して 404 にする。
- 編集フォームは既存 Recipe の `name`、`tags`、`cookingTime`、`ingredients`、`steps`、`notes` をプレフィルする。
- 編集では `baseServings` を変更しない。画面には `N人分（変更不可）` として読取専用表示する。
- 送信時は `UpdateRecipeBody` 形の JSON を `client.api.recipes[':id'].$put({ param, json })` で送る。
- 更新成功後は `/recipes/[id]` に戻り、`router.refresh()` で詳細画面を再取得する。
- 詳細画面の右上に `/recipes/[id]/edit` への編集リンクを追加する。
- 作成フォーム `/recipes/new` の既存挙動を維持する。
- 温かいキッチンのデザイントークンを使い、`zinc-*` や `bg-white` の直書きを追加しない。
- `pnpm --filter @cookpit/web type-check` が通る。
- 実装後に Claude Code へレビューを依頼する。

## スコープ

### 対象

- 作成フォームの共通化
- 編集画面の新規追加
- 詳細画面への編集導線追加
- フロントエンドの入力検証、DTO 変換、Hono RPC 呼び出し

### 対象外

- Domain 層の変更
- Application 層の変更
- Infrastructure 層の変更
- API 契約の変更
- `baseServings` の編集対応
- 認証、認可
- TanStack Query 導入
- E2E テスト追加

## 前提

- `/recipes/new` の作成フォームは実装済み。
- `/recipes/[id]` の詳細画面は実装済み。
- `UpdateRecipeUseCase` は `baseServings` を変更しない。
- `updateRecipeSchema` / `UpdateRecipeBody` は `name`、`ingredients`、`steps`、`tags`、`cookingTime`、`notes` のみを含む。
- `PUT /api/recipes/:id` は Hono route に実装済み。
- `RecipeDto`、`GetRecipeUseCase`、`RecipeNotFoundError` は `@cookpit/application` から import できる。
- `updateRecipeSchema`、`UpdateRecipeBody`、`recipeTagSchema`、`unitSchema` は `@cookpit/api-contract` から import できる。

## 変更対象ファイル

```text
apps/web/src/app/recipes/new/_components/recipe-form-client.tsx
```

作成フォームの state、送信、baseServings 検証は残し、入力 UI と共通入力 build 処理を新しい共有モジュールへ委譲する。

```text
apps/web/src/app/recipes/[id]/_components/recipe-detail-client.tsx
```

トップバー右側の空プレースホルダを編集リンクに置き換える。

## 移動対象ファイル

```text
apps/web/src/app/recipes/new/_components/ingredient-row.tsx
  -> apps/web/src/app/recipes/_components/ingredient-row.tsx

apps/web/src/app/recipes/new/_components/step-row.tsx
  -> apps/web/src/app/recipes/_components/step-row.tsx
```

作成フォームと編集フォームの両方から使うため、`new/_components` から `recipes/_components` へ移動する。

実装時の注意: ファイル移動は既存ファイルの削除と新規作成を伴う。着手前にユーザーへ移動実行の確認を取る。

## 新規作成ファイル

```text
apps/web/src/app/recipes/_components/recipe-form-shared.ts
```

作成と編集で共通の型、初期行生成、Recipe DTO からフォーム行への逆変換、共通 6 フィールドの検証と `UpdateRecipeBody` build を担う。JSX は置かない。

```text
apps/web/src/app/recipes/_components/recipe-form-fields.tsx
```

作成と編集で共通の入力 UI を担う presentational Client Component。状態は持たず、値と handler を props で受け取る。

```text
apps/web/src/app/recipes/[id]/edit/page.tsx
```

編集画面の Server Component。Recipe 取得、404 変換、編集 Client Component への DTO 受け渡しだけを担う。

```text
apps/web/src/app/recipes/[id]/edit/_components/recipe-edit-form-client.tsx
```

編集フォームの Client Component。既存 Recipe のプレフィル、共通フォーム描画、PUT 送信、遷移を担う。

## ファイルごとの変更内容

### `apps/web/src/app/recipes/_components/ingredient-row.tsx`

- 変更内容:
  - `new/_components/ingredient-row.tsx` から移動する。
  - `CreateRecipeBody` 由来の `IngredientUnit` は、編集でも使えるように `UpdateRecipeBody` または `unitSchema.options` と整合する型へ見直す。
  - UI と挙動は現状維持する。
- 完了条件:
  - 作成フォームと編集フォームの両方から import できる。
  - 単位 select はプリセット固定で、未選択は空文字のまま扱える。
  - `import type` が必要な import は型専用になっている。

### `apps/web/src/app/recipes/_components/step-row.tsx`

- 変更内容:
  - `new/_components/step-row.tsx` から移動する。
  - UI と挙動は現状維持する。
- 完了条件:
  - 作成フォームと編集フォームの両方から import できる。
  - 手順番号、削除ボタン、textarea の既存アクセシビリティを維持している。

### `apps/web/src/app/recipes/_components/recipe-form-shared.ts`

- 変更内容:
  - `CommonFieldErrors`、`emptyCommonFieldErrors()` を定義する。
  - `createIngredientRow(id)`、`createStepRow(id)` を定義する。
  - `toIngredientRowValue(dto, id)` を定義し、`RecipeIngredientDto` をフォーム行へ変換する。
  - `toStepRowValue(dto, id)` または編集側で同等の変換を使い、既存手順をフォーム行へ変換する。
  - `buildCommonRecipeInput(args)` を定義し、`UpdateRecipeBody` を返す。
- 完了条件:
  - `buildCommonRecipeInput()` は `baseServings` を含まない。
  - 作成フォームの既存 `buildCreateInput()` から、材料、手順、調理時間の検証を同じ挙動で移植している。
  - 数値量は `amountValue + amountUnit`、非数値量は `amountNote` として扱う。
  - 空の材料行と空の手順行は送信対象から除外する。
  - `cookingTime` は空文字なら `null`、0以上の整数なら number、それ以外はエラーにする。
  - エラー時は `input: null` と `CommonFieldErrors` を返す。

想定する公開 API:

```ts
import type { UpdateRecipeBody } from '@cookpit/api-contract';
import type { RecipeIngredientDto } from '@cookpit/application';
import type { IngredientRowValue } from './ingredient-row';
import type { StepRowValue } from './step-row';

export interface CommonFieldErrors {
  cookingTime: string | null;
  ingredients: Record<string, string>;
}

export interface BuildCommonResult {
  input: UpdateRecipeBody | null;
  errors: CommonFieldErrors;
}

export function emptyCommonFieldErrors(): CommonFieldErrors;
export function createIngredientRow(id: string): IngredientRowValue;
export function createStepRow(id: string): StepRowValue;
export function toIngredientRowValue(
  dto: RecipeIngredientDto,
  id: string,
): IngredientRowValue;
export function buildCommonRecipeInput(args: {
  name: string;
  tags: UpdateRecipeBody['tags'];
  cookingTime: string;
  notes: string;
  ingredients: IngredientRowValue[];
  steps: StepRowValue[];
}): BuildCommonResult;
```

### `apps/web/src/app/recipes/_components/recipe-form-fields.tsx`

- 変更内容:
  - 既存作成フォームのレシピ名、タグ、基準人数枠、調理時間、材料、手順、メモの JSX を移植する。
  - `baseServingsSlot` で作成と編集の差分を差し込めるようにする。
  - `header` は持たせず、各 Client Component 側で描画する。
  - state は持たない。
- 完了条件:
  - `RecipeFormFields` は props の値と handler のみで描画できる。
  - `TAG_OPTIONS` と `UNIT_OPTIONS` は呼び出し側から渡せる。
  - 作成フォームの見た目とモバイル幅での収まりを維持する。
  - トークン色のみを使い、`zinc-*` や `bg-white` を新規追加していない。

想定する props:

```tsx
'use client';

import type { ReactNode } from 'react';
import type { UpdateRecipeBody } from '@cookpit/api-contract';
import type { CommonFieldErrors } from './recipe-form-shared';
import type { IngredientRowValue, IngredientUnit } from './ingredient-row';
import type { StepRowValue } from './step-row';

type RecipeTag = UpdateRecipeBody['tags'][number];

interface Props {
  name: string;
  onNameChange: (value: string) => void;
  tags: RecipeTag[];
  onToggleTag: (tag: RecipeTag) => void;
  tagOptions: readonly RecipeTag[];
  baseServingsSlot: ReactNode;
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
  unitOptions: readonly IngredientUnit[];
  errors: CommonFieldErrors;
}
```

### `apps/web/src/app/recipes/new/_components/recipe-form-client.tsx`

- 変更内容:
  - `IngredientRow` / `StepRow` の import 先を `../../_components/...` 相当に更新する。
  - `recipe-form-shared.ts` から `createIngredientRow`、`createStepRow`、`emptyCommonFieldErrors`、`buildCommonRecipeInput` を使う。
  - `RecipeFormFields` を使って入力 UI を描画する。
  - `baseServings` の state、検証、エラーは作成フォーム側に残す。
  - 送信時は `buildCommonRecipeInput()` の戻り値に `baseServings` を付けて `CreateRecipeBody` を組み立てる。
- 完了条件:
  - `/recipes/new` の保存先は従来どおり `POST /api/recipes`。
  - 保存成功後は従来どおり `/recipes` に戻って `router.refresh()` する。
  - `baseServings` のエラー表示は維持される。
  - 作成フォームの既存挙動に回帰がない。

作成側の build 方針:

```ts
const commonResult = buildCommonRecipeInput({
  name,
  tags,
  cookingTime,
  notes,
  ingredients,
  steps,
});

const createInput: CreateRecipeBody = {
  ...commonResult.input,
  baseServings: parsedBaseServings,
};
```

`commonResult.input` が `null` の可能性を必ず分岐で潰してから spread する。

### `apps/web/src/app/recipes/[id]/edit/page.tsx`

- 変更内容:
  - 詳細画面 `page.tsx` と同じ手動 DI で `GetRecipeUseCase` を呼ぶ。
  - `params: Promise<{ id: string }>` を await する。
  - `RecipeNotFoundError` は `notFound()` へ変換する。
  - 取得した `RecipeDto` を `RecipeEditFormClient` に渡す。
  - `export const dynamic = 'force-dynamic'` を付ける。
- 完了条件:
  - Server Component のままで、`'use client'` がない。
  - 初期表示で Hono API を fetch していない。
  - 存在しない ID で 404 になる。
  - Next.js page の default export 以外は named export 規約に沿っている。

実装例:

```tsx
import { getDb } from '@/db/client';
import { GetRecipeUseCase, type RecipeDto, RecipeNotFoundError } from '@cookpit/application';
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

  let recipe: RecipeDto;
  try {
    recipe = await useCase.execute(id);
  } catch (error) {
    if (error instanceof RecipeNotFoundError) {
      notFound();
    }
    throw error;
  }

  return <RecipeEditFormClient recipe={recipe} />;
}
```

### `apps/web/src/app/recipes/[id]/edit/_components/recipe-edit-form-client.tsx`

- 変更内容:
  - 冒頭に `'use client'` を置く。
  - `RecipeDto` を `import type` で受け取る。
  - 既存 Recipe から state を初期化する。
  - `RecipeFormFields` を描画する。
  - `baseServingsSlot` は読取専用表示にする。
  - 送信時は `buildCommonRecipeInput()` の戻り値を `PUT /api/recipes/:id` に送る。
  - 成功時は `/recipes/${recipe.id}` に戻って `router.refresh()` する。
- 完了条件:
  - `baseServings` の state と送信値を持たない。
  - 更新成功後に詳細画面で変更後の内容が見える。
  - 失敗時はフォーム上部へエラーメッセージを表示する。
  - 送信中は保存ボタンを disabled にし、二重送信を防ぐ。
  - キャンセルは詳細画面へ戻る。

初期化方針:

```ts
const [name, setName] = useState(recipe.name);
const [tags, setTags] = useState<RecipeTag[]>(recipe.tags);
const [cookingTime, setCookingTime] = useState(
  recipe.cookingTime === null ? '' : String(recipe.cookingTime),
);
const [notes, setNotes] = useState(recipe.notes);
const [ingredients, setIngredients] = useState<IngredientRowValue[]>(
  recipe.ingredients.length === 0
    ? [createIngredientRow('ingredient-1')]
    : recipe.ingredients.map((ingredient, index) =>
        toIngredientRowValue(ingredient, `ingredient-${index + 1}`),
      ),
);
const [steps, setSteps] = useState<StepRowValue[]>(
  recipe.steps.length === 0
    ? [createStepRow('step-1')]
    : recipe.steps.map((step, index) => ({
        id: `step-${index + 1}`,
        description: step.description,
      })),
);
```

送信方針:

```ts
const result = buildCommonRecipeInput({
  name,
  tags,
  cookingTime,
  notes,
  ingredients,
  steps,
});

if (result.input === null) {
  setErrorMessage('入力内容を確認してください。');
  return;
}

const response = await client.api.recipes[':id'].$put({
  param: { id: recipe.id },
  json: result.input,
});
```

### `apps/web/src/app/recipes/[id]/_components/recipe-detail-client.tsx`

- 変更内容:
  - `Link` を `next/link` から import する。
  - ヘッダ右側の `<span aria-hidden="true" className="w-9" />` を編集リンクに置き換える。
  - 既存の戻るボタン、中央タイトル、削除処理は変更しない。
- 完了条件:
  - `/recipes/${recipe.id}/edit` に遷移できる。
  - タイトル中央寄せが崩れない。
  - `Button` の `asChild` は使わない。リンクは `Link` と className で表現する。

実装例:

```tsx
<Link
  href={`/recipes/${recipe.id}/edit`}
  className="w-9 text-right text-sm font-medium text-primary"
>
  編集
</Link>
```

## 実装コード

以下は実装時にそのままベースとして使うコード例。実際に組み込む際は、ファイル移動後の import path と type-check 結果に合わせて微調整する。

### `apps/web/src/app/recipes/_components/ingredient-row.tsx`

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { UpdateRecipeBody } from '@cookpit/api-contract';
import { X } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useId } from 'react';

export type IngredientUnit = NonNullable<UpdateRecipeBody['ingredients'][number]['amountUnit']>;

export interface IngredientRowValue {
  id: string;
  displayName: string;
  amountText: string;
  amountUnit: IngredientUnit | '';
}

interface Props {
  value: IngredientRowValue;
  errorMessage: string | null;
  onChange: (next: IngredientRowValue) => void;
  onRemove: () => void;
  unitOptions: readonly IngredientUnit[];
}

function isIngredientUnit(
  value: string,
  unitOptions: readonly IngredientUnit[],
): value is IngredientUnit {
  return unitOptions.some((unit) => unit === value);
}

export function IngredientRow({ value, errorMessage, onChange, onRemove, unitOptions }: Props) {
  const displayNameId = useId();
  const amountId = useId();
  const unitId = useId();
  const errorId = useId();

  function handleDisplayNameChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange({ ...value, displayName: event.target.value });
  }

  function handleAmountTextChange(event: ChangeEvent<HTMLInputElement>): void {
    onChange({ ...value, amountText: event.target.value });
  }

  function handleAmountUnitChange(event: ChangeEvent<HTMLSelectElement>): void {
    const nextValue = event.target.value;
    onChange({
      ...value,
      amountUnit: isIngredientUnit(nextValue, unitOptions) ? nextValue : '',
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(70px,0.85fr)_82px_36px] gap-2">
        <label htmlFor={displayNameId} className="sr-only">
          食材名
        </label>
        <Input
          id={displayNameId}
          value={value.displayName}
          onChange={handleDisplayNameChange}
          placeholder="食材名"
          aria-invalid={errorMessage !== null}
          aria-describedby={errorMessage === null ? undefined : errorId}
          className="h-11 rounded-lg bg-card px-2 text-sm"
        />

        <label htmlFor={amountId} className="sr-only">
          量
        </label>
        <Input
          id={amountId}
          value={value.amountText}
          onChange={handleAmountTextChange}
          placeholder="量"
          aria-invalid={errorMessage !== null}
          aria-describedby={errorMessage === null ? undefined : errorId}
          className="h-11 rounded-lg bg-card px-2 text-sm"
        />

        <label htmlFor={unitId} className="sr-only">
          単位
        </label>
        <select
          id={unitId}
          value={value.amountUnit}
          onChange={handleAmountUnitChange}
          aria-invalid={errorMessage !== null}
          aria-describedby={errorMessage === null ? undefined : errorId}
          className="h-11 w-full rounded-lg border border-input bg-card px-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
        >
          <option value="">単位</option>
          {unitOptions.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>

        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          onClick={onRemove}
          aria-label="材料を削除"
          title="材料を削除"
          className="h-11 w-9 rounded-lg text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {errorMessage !== null && (
        <p id={errorId} className="text-xs text-red-600">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
```

### `apps/web/src/app/recipes/_components/step-row.tsx`

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useId } from 'react';

export interface StepRowValue {
  id: string;
  description: string;
}

interface Props {
  index: number;
  value: StepRowValue;
  onChange: (next: StepRowValue) => void;
  onRemove: () => void;
}

export function StepRow({ index, value, onChange, onRemove }: Props) {
  const descriptionId = useId();

  function handleDescriptionChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    onChange({ ...value, description: event.target.value });
  }

  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)_36px] gap-2">
      <div
        className="flex h-11 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground"
        aria-hidden="true"
      >
        {index + 1}
      </div>
      <label htmlFor={descriptionId} className="sr-only">
        手順 {index + 1}
      </label>
      <Textarea
        id={descriptionId}
        value={value.description}
        onChange={handleDescriptionChange}
        placeholder="手順を入力"
        className="min-h-20 rounded-lg bg-card text-sm"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        onClick={onRemove}
        aria-label="手順を削除"
        title="手順を削除"
        className="h-11 w-9 rounded-lg text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
```

### `apps/web/src/app/recipes/_components/recipe-form-shared.ts`

```ts
import type { UpdateRecipeBody } from '@cookpit/api-contract';
import type { RecipeIngredientDto } from '@cookpit/application';
import type { IngredientRowValue } from './ingredient-row';
import type { StepRowValue } from './step-row';

export interface CommonFieldErrors {
  cookingTime: string | null;
  ingredients: Record<string, string>;
}

export interface BuildCommonResult {
  input: UpdateRecipeBody | null;
  errors: CommonFieldErrors;
}

export function emptyCommonFieldErrors(): CommonFieldErrors {
  return {
    cookingTime: null,
    ingredients: {},
  };
}

export function createIngredientRow(id: string): IngredientRowValue {
  return {
    id,
    displayName: '',
    amountText: '',
    amountUnit: '',
  };
}

export function createStepRow(id: string): StepRowValue {
  return {
    id,
    description: '',
  };
}

export function toIngredientRowValue(
  dto: RecipeIngredientDto,
  id: string,
): IngredientRowValue {
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

export function buildCommonRecipeInput(args: {
  name: string;
  tags: UpdateRecipeBody['tags'];
  cookingTime: string;
  notes: string;
  ingredients: IngredientRowValue[];
  steps: StepRowValue[];
}): BuildCommonResult {
  const errors = emptyCommonFieldErrors();
  const parsedIngredients: UpdateRecipeBody['ingredients'] = [];
  const trimmedCookingTime = args.cookingTime.trim();
  const parsedCookingTime = trimmedCookingTime === '' ? null : Number(trimmedCookingTime);

  if (
    parsedCookingTime !== null &&
    (!Number.isFinite(parsedCookingTime) ||
      !Number.isInteger(parsedCookingTime) ||
      parsedCookingTime < 0)
  ) {
    errors.cookingTime = '調理時間は0以上の整数で入力してください。';
  }

  for (const row of args.ingredients) {
    const displayName = row.displayName.trim();
    const amountText = row.amountText.trim();
    const isEmptyRow = displayName === '' && amountText === '' && row.amountUnit === '';

    if (isEmptyRow) {
      continue;
    }

    if (displayName === '') {
      errors.ingredients[row.id] = '食材名を入力してください。';
      continue;
    }

    if (amountText === '') {
      errors.ingredients[row.id] = '量を入力してください。';
      continue;
    }

    const amountValue = Number(amountText);
    const isNumericAmount = !Number.isNaN(amountValue);

    if (isNumericAmount) {
      if (!Number.isFinite(amountValue) || amountValue < 0) {
        errors.ingredients[row.id] = '量は0以上の数値で入力してください。';
        continue;
      }

      if (row.amountUnit === '') {
        errors.ingredients[row.id] = '数値の量には単位を選択してください。';
        continue;
      }

      parsedIngredients.push({
        productRef: null,
        displayName,
        amountValue,
        amountUnit: row.amountUnit,
        amountNote: null,
      });
      continue;
    }

    parsedIngredients.push({
      productRef: null,
      displayName,
      amountValue: null,
      amountUnit: null,
      amountNote: amountText,
    });
  }

  const hasIngredientErrors = Object.keys(errors.ingredients).length > 0;
  if (errors.cookingTime !== null || hasIngredientErrors) {
    return {
      input: null,
      errors,
    };
  }

  return {
    input: {
      name: args.name.trim(),
      tags: args.tags,
      cookingTime: parsedCookingTime,
      notes: args.notes,
      ingredients: parsedIngredients,
      steps: args.steps
        .map((row) => ({ description: row.description.trim() }))
        .filter((row) => row.description !== ''),
    },
    errors,
  };
}
```

### `apps/web/src/app/recipes/_components/recipe-form-fields.tsx`

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useId } from 'react';
import type { CommonFieldErrors } from './recipe-form-shared';
import { IngredientRow, type IngredientRowValue, type IngredientUnit } from './ingredient-row';
import { StepRow, type StepRowValue } from './step-row';

interface Props<Tag extends string> {
  name: string;
  onNameChange: (value: string) => void;
  tags: Tag[];
  onToggleTag: (tag: Tag) => void;
  tagOptions: readonly Tag[];
  baseServingsSlot: ReactNode;
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
  unitOptions: readonly IngredientUnit[];
  errors: CommonFieldErrors;
}

export function RecipeFormFields<Tag extends string>({
  name,
  onNameChange,
  tags,
  onToggleTag,
  tagOptions,
  baseServingsSlot,
  cookingTime,
  onCookingTimeChange,
  notes,
  onNotesChange,
  ingredients,
  onAddIngredient,
  onUpdateIngredient,
  onRemoveIngredient,
  steps,
  onAddStep,
  onUpdateStep,
  onRemoveStep,
  unitOptions,
  errors,
}: Props<Tag>) {
  const nameId = useId();
  const cookingTimeId = useId();
  const cookingTimeErrorId = useId();
  const notesId = useId();

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <label htmlFor={nameId} className="text-sm font-medium text-foreground">
          レシピ名 <span className="text-xs font-normal text-red-600">必須</span>
        </label>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="例：鶏むね肉の塩こうじ漬け"
          className="h-11 rounded-xl bg-card"
        />
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">
          タグ <span className="text-xs font-normal text-muted-foreground">複数選択可</span>
        </p>
        <div className="flex flex-wrap gap-2" aria-label="レシピタグ">
          {tagOptions.map((tag) => {
            const selected = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onToggleTag(tag)}
                aria-pressed={selected}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm transition-colors',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-secondary text-secondary-foreground hover:bg-muted',
                )}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {baseServingsSlot}

        <div className="flex flex-col gap-2">
          <label htmlFor={cookingTimeId} className="text-sm font-medium text-foreground">
            調理時間 <span className="text-xs font-normal text-muted-foreground">任意</span>
          </label>
          <Input
            id={cookingTimeId}
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={cookingTime}
            onChange={(event) => onCookingTimeChange(event.target.value)}
            placeholder="25"
            aria-invalid={errors.cookingTime !== null}
            aria-describedby={errors.cookingTime === null ? undefined : cookingTimeErrorId}
            className="h-11 rounded-xl bg-card"
          />
          {errors.cookingTime !== null && (
            <p id={cookingTimeErrorId} className="text-xs text-red-600">
              {errors.cookingTime}
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">材料</p>
        <div className="flex flex-col gap-2">
          {ingredients.map((ingredient) => (
            <IngredientRow
              key={ingredient.id}
              value={ingredient}
              errorMessage={errors.ingredients[ingredient.id] ?? null}
              onChange={onUpdateIngredient}
              onRemove={() => onRemoveIngredient(ingredient.id)}
              unitOptions={unitOptions}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={onAddIngredient}
            className="h-10 justify-start rounded-lg border-dashed bg-card text-foreground"
          >
            <Plus className="size-4" aria-hidden="true" />
            材料を追加
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">作り方</p>
        <div className="flex flex-col gap-3">
          {steps.map((step, index) => (
            <StepRow
              key={step.id}
              index={index}
              value={step}
              onChange={onUpdateStep}
              onRemove={() => onRemoveStep(step.id)}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={onAddStep}
            className="h-10 justify-start rounded-lg border-dashed bg-card text-foreground"
          >
            <Plus className="size-4" aria-hidden="true" />
            ステップを追加
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <label htmlFor={notesId} className="text-sm font-medium text-foreground">
          メモ <span className="text-xs font-normal text-muted-foreground">任意</span>
        </label>
        <Textarea
          id={notesId}
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="補足や保存方法など"
          className="min-h-24 rounded-xl bg-card"
        />
      </section>
    </div>
  );
}
```

### `apps/web/src/app/recipes/new/_components/recipe-form-client.tsx`

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { client } from '@/lib/api-client';
import { recipeTagSchema, unitSchema, type CreateRecipeBody } from '@cookpit/api-contract';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useId, useRef, useState } from 'react';
import { RecipeFormFields } from '../../_components/recipe-form-fields';
import {
  buildCommonRecipeInput,
  createIngredientRow,
  createStepRow,
  emptyCommonFieldErrors,
  type CommonFieldErrors,
} from '../../_components/recipe-form-shared';
import type { IngredientRowValue } from '../../_components/ingredient-row';
import type { StepRowValue } from '../../_components/step-row';

type RecipeTag = CreateRecipeBody['tags'][number];

interface CreateFieldErrors extends CommonFieldErrors {
  baseServings: string | null;
}

interface BuildCreateResult {
  input: CreateRecipeBody | null;
  errors: CreateFieldErrors;
}

const TAG_OPTIONS = recipeTagSchema.options;
const UNIT_OPTIONS = unitSchema.options;

function emptyCreateFieldErrors(): CreateFieldErrors {
  return {
    ...emptyCommonFieldErrors(),
    baseServings: null,
  };
}

export function RecipeFormClient() {
  const router = useRouter();
  const baseServingsId = useId();
  const baseServingsErrorId = useId();
  const nextIngredientId = useRef(2);
  const nextStepId = useRef(2);

  const [name, setName] = useState('');
  const [tags, setTags] = useState<RecipeTag[]>([]);
  const [baseServings, setBaseServings] = useState('2');
  const [cookingTime, setCookingTime] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRowValue[]>([
    createIngredientRow('ingredient-1'),
  ]);
  const [steps, setSteps] = useState<StepRowValue[]>([createStepRow('step-1')]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<CreateFieldErrors>(emptyCreateFieldErrors);

  const canSubmit = name.trim() !== '' && !submitting;

  function toggleTag(tag: RecipeTag): void {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((value) => value !== tag) : [...prev, tag],
    );
  }

  function addIngredient(): void {
    const nextId = `ingredient-${nextIngredientId.current}`;
    nextIngredientId.current += 1;
    setIngredients((prev) => [...prev, createIngredientRow(nextId)]);
  }

  function updateIngredient(next: IngredientRowValue): void {
    setIngredients((prev) => prev.map((row) => (row.id === next.id ? next : row)));
  }

  function removeIngredient(id: string): void {
    setIngredients((prev) => prev.filter((row) => row.id !== id));
    setFieldErrors((prev) => {
      const nextIngredientErrors = { ...prev.ingredients };
      delete nextIngredientErrors[id];
      return {
        ...prev,
        ingredients: nextIngredientErrors,
      };
    });
  }

  function addStep(): void {
    const nextId = `step-${nextStepId.current}`;
    nextStepId.current += 1;
    setSteps((prev) => [...prev, createStepRow(nextId)]);
  }

  function updateStep(next: StepRowValue): void {
    setSteps((prev) => prev.map((row) => (row.id === next.id ? next : row)));
  }

  function removeStep(id: string): void {
    setSteps((prev) => prev.filter((row) => row.id !== id));
  }

  function buildCreateInput(): BuildCreateResult {
    const commonResult = buildCommonRecipeInput({
      name,
      tags,
      cookingTime,
      notes,
      ingredients,
      steps,
    });
    const errors: CreateFieldErrors = {
      ...commonResult.errors,
      baseServings: null,
    };
    const trimmedBaseServings = baseServings.trim();
    const parsedBaseServings = Number(trimmedBaseServings);

    if (
      trimmedBaseServings === '' ||
      !Number.isFinite(parsedBaseServings) ||
      parsedBaseServings <= 0
    ) {
      errors.baseServings = '基準人数は1以上の数値で入力してください。';
    }

    if (commonResult.input === null || errors.baseServings !== null) {
      return {
        input: null,
        errors,
      };
    }

    return {
      input: {
        ...commonResult.input,
        baseServings: parsedBaseServings,
      },
      errors,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const result = buildCreateInput();
    setFieldErrors(result.errors);
    setErrorMessage(null);

    if (result.input === null) {
      setErrorMessage('入力内容を確認してください。');
      return;
    }

    setSubmitting(true);
    try {
      const response = await client.api.recipes.$post({ json: result.input });
      if (!response.ok) {
        setErrorMessage('保存に失敗しました。入力内容を確認してください。');
        return;
      }
      router.push('/recipes');
      router.refresh();
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4"
      >
        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex justify-start">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => router.push('/recipes')}
              className="h-9 px-2 text-foreground"
            >
              キャンセル
            </Button>
          </div>
          <h1 className="text-lg font-semibold text-foreground">レシピを追加</h1>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!canSubmit} className="h-9 px-4">
              {submitting ? '保存中' : '保存'}
            </Button>
          </div>
        </header>

        {errorMessage !== null && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <RecipeFormFields
          name={name}
          onNameChange={setName}
          tags={tags}
          onToggleTag={toggleTag}
          tagOptions={TAG_OPTIONS}
          baseServingsSlot={
            <div className="flex flex-col gap-2">
              <label htmlFor={baseServingsId} className="text-sm font-medium text-foreground">
                基準人数
              </label>
              <Input
                id={baseServingsId}
                type="number"
                min="1"
                step="1"
                inputMode="decimal"
                value={baseServings}
                onChange={(event) => setBaseServings(event.target.value)}
                aria-invalid={fieldErrors.baseServings !== null}
                aria-describedby={
                  fieldErrors.baseServings === null ? undefined : baseServingsErrorId
                }
                className="h-11 rounded-xl bg-card"
              />
              {fieldErrors.baseServings !== null && (
                <p id={baseServingsErrorId} className="text-xs text-red-600">
                  {fieldErrors.baseServings}
                </p>
              )}
            </div>
          }
          cookingTime={cookingTime}
          onCookingTimeChange={setCookingTime}
          notes={notes}
          onNotesChange={setNotes}
          ingredients={ingredients}
          onAddIngredient={addIngredient}
          onUpdateIngredient={updateIngredient}
          onRemoveIngredient={removeIngredient}
          steps={steps}
          onAddStep={addStep}
          onUpdateStep={updateStep}
          onRemoveStep={removeStep}
          unitOptions={UNIT_OPTIONS}
          errors={fieldErrors}
        />
      </form>
    </main>
  );
}
```

### `apps/web/src/app/recipes/[id]/edit/page.tsx`

```tsx
import { getDb } from '@/db/client';
import { GetRecipeUseCase, type RecipeDto, RecipeNotFoundError } from '@cookpit/application';
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

  let recipe: RecipeDto;
  try {
    recipe = await useCase.execute(id);
  } catch (error) {
    if (error instanceof RecipeNotFoundError) {
      notFound();
    }
    throw error;
  }

  return <RecipeEditFormClient recipe={recipe} />;
}
```

### `apps/web/src/app/recipes/[id]/edit/_components/recipe-edit-form-client.tsx`

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { client } from '@/lib/api-client';
import { recipeTagSchema, unitSchema, type UpdateRecipeBody } from '@cookpit/api-contract';
import type { RecipeDto } from '@cookpit/application';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import { RecipeFormFields } from '../../../_components/recipe-form-fields';
import {
  buildCommonRecipeInput,
  createIngredientRow,
  createStepRow,
  emptyCommonFieldErrors,
  toIngredientRowValue,
  type CommonFieldErrors,
} from '../../../_components/recipe-form-shared';
import type { IngredientRowValue } from '../../../_components/ingredient-row';
import type { StepRowValue } from '../../../_components/step-row';

type RecipeTag = UpdateRecipeBody['tags'][number];

interface Props {
  recipe: RecipeDto;
}

const TAG_OPTIONS = recipeTagSchema.options;
const UNIT_OPTIONS = unitSchema.options;

export function RecipeEditFormClient({ recipe }: Props) {
  const router = useRouter();
  const initialIngredientCount = recipe.ingredients.length === 0 ? 1 : recipe.ingredients.length;
  const initialStepCount = recipe.steps.length === 0 ? 1 : recipe.steps.length;
  const nextIngredientId = useRef(initialIngredientCount + 1);
  const nextStepId = useRef(initialStepCount + 1);

  const [name, setName] = useState(recipe.name);
  const [tags, setTags] = useState<RecipeTag[]>(recipe.tags);
  const [cookingTime, setCookingTime] = useState(
    recipe.cookingTime === null ? '' : String(recipe.cookingTime),
  );
  const [ingredients, setIngredients] = useState<IngredientRowValue[]>(
    recipe.ingredients.length === 0
      ? [createIngredientRow('ingredient-1')]
      : recipe.ingredients.map((ingredient, index) =>
          toIngredientRowValue(ingredient, `ingredient-${index + 1}`),
        ),
  );
  const [steps, setSteps] = useState<StepRowValue[]>(
    recipe.steps.length === 0
      ? [createStepRow('step-1')]
      : recipe.steps.map((step, index) => ({
          id: `step-${index + 1}`,
          description: step.description,
        })),
  );
  const [notes, setNotes] = useState(recipe.notes);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<CommonFieldErrors>(emptyCommonFieldErrors);

  const canSubmit = name.trim() !== '' && !submitting;

  function toggleTag(tag: RecipeTag): void {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((value) => value !== tag) : [...prev, tag],
    );
  }

  function addIngredient(): void {
    const nextId = `ingredient-${nextIngredientId.current}`;
    nextIngredientId.current += 1;
    setIngredients((prev) => [...prev, createIngredientRow(nextId)]);
  }

  function updateIngredient(next: IngredientRowValue): void {
    setIngredients((prev) => prev.map((row) => (row.id === next.id ? next : row)));
  }

  function removeIngredient(id: string): void {
    setIngredients((prev) => prev.filter((row) => row.id !== id));
    setFieldErrors((prev) => {
      const nextIngredientErrors = { ...prev.ingredients };
      delete nextIngredientErrors[id];
      return {
        ...prev,
        ingredients: nextIngredientErrors,
      };
    });
  }

  function addStep(): void {
    const nextId = `step-${nextStepId.current}`;
    nextStepId.current += 1;
    setSteps((prev) => [...prev, createStepRow(nextId)]);
  }

  function updateStep(next: StepRowValue): void {
    setSteps((prev) => prev.map((row) => (row.id === next.id ? next : row)));
  }

  function removeStep(id: string): void {
    setSteps((prev) => prev.filter((row) => row.id !== id));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    const result = buildCommonRecipeInput({
      name,
      tags,
      cookingTime,
      notes,
      ingredients,
      steps,
    });
    setFieldErrors(result.errors);
    setErrorMessage(null);

    if (result.input === null) {
      setErrorMessage('入力内容を確認してください。');
      return;
    }

    setSubmitting(true);
    try {
      const response = await client.api.recipes[':id'].$put({
        param: { id: recipe.id },
        json: result.input,
      });

      if (!response.ok) {
        setErrorMessage('保存に失敗しました。入力内容を確認してください。');
        return;
      }

      router.push(`/recipes/${recipe.id}`);
      router.refresh();
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4"
      >
        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex justify-start">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/recipes/${recipe.id}`)}
              className="h-9 px-2 text-foreground"
            >
              キャンセル
            </Button>
          </div>
          <h1 className="text-lg font-semibold text-foreground">レシピを編集</h1>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!canSubmit} className="h-9 px-4">
              {submitting ? '保存中' : '保存'}
            </Button>
          </div>
        </header>

        {errorMessage !== null && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <RecipeFormFields
          name={name}
          onNameChange={setName}
          tags={tags}
          onToggleTag={toggleTag}
          tagOptions={TAG_OPTIONS}
          baseServingsSlot={
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">基準人数</p>
              <div className="flex h-11 items-center rounded-xl border border-input bg-muted px-3 text-sm text-muted-foreground">
                {recipe.baseServings}人分（変更不可）
              </div>
            </div>
          }
          cookingTime={cookingTime}
          onCookingTimeChange={setCookingTime}
          notes={notes}
          onNotesChange={setNotes}
          ingredients={ingredients}
          onAddIngredient={addIngredient}
          onUpdateIngredient={updateIngredient}
          onRemoveIngredient={removeIngredient}
          steps={steps}
          onAddStep={addStep}
          onUpdateStep={updateStep}
          onRemoveStep={removeStep}
          unitOptions={UNIT_OPTIONS}
          errors={fieldErrors}
        />
      </form>
    </main>
  );
}
```

### `apps/web/src/app/recipes/[id]/_components/recipe-detail-client.tsx` の差分

```diff
 import { cn } from '@/lib/utils';
 import type { RecipeDto } from '@cookpit/application';
 import { ChevronLeft } from 'lucide-react';
+import Link from 'next/link';
 import { useRouter } from 'next/navigation';
 import { useState } from 'react';
```

```diff
           <h1 className="truncate text-center text-lg font-semibold text-foreground">
             {recipe.name}
           </h1>
-          <span aria-hidden="true" className="w-9" />
+          <Link
+            href={`/recipes/${recipe.id}/edit`}
+            className="w-9 text-right text-sm font-medium text-primary"
+          >
+            編集
+          </Link>
         </header>
```

## 実装手順

### コマンド手順

1. 作業前に差分を確認する。

```bash
git status --short
```

2. 共有コンポーネントの置き場を作る。

```bash
mkdir -p apps/web/src/app/recipes/_components
mkdir -p 'apps/web/src/app/recipes/[id]/edit/_components'
```

3. `ingredient-row.tsx` と `step-row.tsx` を移動する。

```bash
mv apps/web/src/app/recipes/new/_components/ingredient-row.tsx apps/web/src/app/recipes/_components/ingredient-row.tsx
mv apps/web/src/app/recipes/new/_components/step-row.tsx apps/web/src/app/recipes/_components/step-row.tsx
```

4. 新規ファイルを作成し、上記の実装コードを入れる。

```text
apps/web/src/app/recipes/_components/recipe-form-shared.ts
apps/web/src/app/recipes/_components/recipe-form-fields.tsx
apps/web/src/app/recipes/[id]/edit/page.tsx
apps/web/src/app/recipes/[id]/edit/_components/recipe-edit-form-client.tsx
```

5. `apps/web/src/app/recipes/new/_components/recipe-form-client.tsx` を上記コードで再構成する。

6. `apps/web/src/app/recipes/[id]/_components/recipe-detail-client.tsx` に編集リンク差分を入れる。

7. 型チェックを実行する。

```bash
pnpm --filter @cookpit/web type-check
```

8. 型エラーが import path だけなら、移動後の相対パスを修正して再実行する。

9. 開発サーバーで手動確認する。

```bash
pnpm --filter @cookpit/web dev --webpack
```

10. Claude Code にレビューを依頼してからコミットする。

### 作業ステップ詳細

1. 共有行コンポーネントを移動する
   - 対象ファイル: `ingredient-row.tsx`、`step-row.tsx`
   - 変更内容: `recipes/new/_components` から `recipes/_components` へ移動し、作成フォーム側の import を更新する。
   - 完了条件: `pnpm --filter @cookpit/web type-check` で移動由来の import error が出ない状態にできる。

2. 共通ロジックを抽出する
   - 対象ファイル: `recipe-form-shared.ts`
   - 変更内容: 行生成、DTO 逆変換、共通 validation、`UpdateRecipeBody` build を実装する。
   - 完了条件: 作成フォームの既存 `buildCreateInput()` と同じ材料・手順・調理時間の挙動を再現できる。

3. 共通入力 UI を抽出する
   - 対象ファイル: `recipe-form-fields.tsx`
   - 変更内容: 作成フォームの JSX のうち入力フィールド群を presentational component へ移す。
   - 完了条件: state を持たず、作成と編集の差分を props で受けられる。

4. 作成フォームを共通部品へ接続する
   - 対象ファイル: `recipe-form-client.tsx`
   - 変更内容: state と POST 送信を残し、共通ロジックと `RecipeFormFields` を使う形へ再構成する。
   - 完了条件: `/recipes/new` で従来どおり作成でき、baseServings の編集と検証が維持される。

5. 編集 Server Component を追加する
   - 対象ファイル: `recipes/[id]/edit/page.tsx`
   - 変更内容: `GetRecipeUseCase` で Recipe を取得し、404 変換して `RecipeEditFormClient` に渡す。
   - 完了条件: 有効 ID で編集画面が表示され、無効 ID で 404 になる。

6. 編集 Client Component を追加する
   - 対象ファイル: `recipe-edit-form-client.tsx`
   - 変更内容: Recipe DTO を state に変換し、共通フォームを描画し、PUT 送信する。
   - 完了条件: 更新成功後に詳細へ戻り、変更内容が反映される。

7. 詳細画面へ編集リンクを追加する
   - 対象ファイル: `recipe-detail-client.tsx`
   - 変更内容: ヘッダ右側に編集リンクを置く。
   - 完了条件: 詳細画面から編集画面へ遷移できる。

8. 型チェックとブラウザ確認を行う
   - 対象: `apps/web`
   - 変更内容: type-check と手動確認を実施する。
   - 完了条件: 下記のテスト計画を満たす。

## 依存関係

- `ingredient-row.tsx` と `step-row.tsx` の移動後に、`recipe-form-shared.ts` と `recipe-form-fields.tsx` を作る。
- `recipe-form-fields.tsx` は移動後の `IngredientRow` / `StepRow` に依存する。
- `recipe-form-client.tsx` の再構成は、共通ロジックと共通 UI ができてから行う。
- `recipe-edit-form-client.tsx` は `recipe-form-shared.ts` と `recipe-form-fields.tsx` に依存する。
- 編集ページの Server Component は `RecipeEditFormClient` の export 名が決まってから import する。
- 詳細画面の編集リンクは編集 route が追加された後に確認する。

## テスト計画

### コマンド

```bash
pnpm --filter @cookpit/web type-check
```

必要に応じて実行する。

```bash
pnpm lint
pnpm type-check
```

### ブラウザ確認

- `/recipes/new` で既存どおりレシピを作成できる。
- 作成フォームで数値量 + 単位が送信できる。
- 作成フォームで「少々」「適量」など非数値量が `amountNote` として送信できる。
- 作成フォームで `baseServings` の空、0以下、不正値がエラーになる。
- `/recipes/[id]` の右上に編集リンクが表示される。
- 編集リンクから `/recipes/[id]/edit` に遷移できる。
- 編集フォームに既存値がプレフィルされる。
- 編集フォームでは基準人数が `N人分（変更不可）` として表示され、入力できない。
- 編集で名前、タグ、調理時間、材料、手順、メモを変更して保存できる。
- 編集保存後に `/recipes/[id]` へ戻り、変更内容が表示される。
- 編集キャンセルで `/recipes/[id]` へ戻る。
- 存在しない ID の `/recipes/[id]/edit` で 404 になる。
- 375px 幅でヘッダ、材料行、手順行、保存ボタンの文字が崩れない。

## リスク

- 作成フォームの共通化により、既存の作成挙動が回帰する可能性がある。
- `IngredientRowValue.amountUnit` が `CreateRecipeBody` に依存したままだと、編集側の型と不自然に結合する。
- `buildCommonRecipeInput()` のエラー型から `baseServings` を外すため、作成側で baseServings エラーと共通エラーを合成する必要がある。
- 編集で `baseServings` を送ってしまうと API 契約と UseCase 方針に反する。
- `recipe.ingredients.map()` による初期 ID 採番後、追加行の `nextIngredientId` 初期値を既存件数 + 1 にしないと ID が重複する。

## ロールバック方法

- 編集 route 追加で問題が出た場合は、`recipes/[id]/edit` 配下の新規ファイルと詳細画面の編集リンクを戻す。
- 共通化で作成フォームに回帰が出た場合は、`recipe-form-client.tsx` を共通化前の実装へ戻し、移動した `ingredient-row.tsx` / `step-row.tsx` を `new/_components` へ戻す。
- API、Application、Domain、Infrastructure は変更対象外のため、ロールバック対象は Presentation 層に限定する。

## ドキュメント更新対象

- 恒久ドキュメントの更新は原則不要。
- 実装完了後、必要なら `docs/05-roadmap.md` の Sprint 1 進捗で「編集 UI 完了」を反映する。
- 実装コードはコミット前に Claude Code でレビューを受ける。

## 注意点

- `apps/web/src/app/recipes/[id]/edit/page.tsx` は Server Component のままにする。
- 初期表示では Hono API を呼ばず、Application UseCase を直接呼ぶ。
- フォーム送信は Hono RPC を使う。
- Domain Entity を Client Component に渡さず、`RecipeDto` のみを渡す。
- `baseServings` は編集対象にしない。
- 「値なし」は `null` に統一する。DTO 変換で `undefined` を混ぜない。
- `any` は使わない。
- 型のみの import は `import type` を使う。
- default export は Next.js page の要求箇所だけに限定する。
- UI 色は `bg-background`、`bg-card`、`text-foreground`、`text-muted-foreground`、`border-border`、`bg-primary` などのトークンを使う。
- `Button` は Base UI ラップであり、Radix/shadcn の `asChild` 前提にしない。
- スコープ外の改善は実装しない。気づいた点はレビュー時のコメントに留める。
