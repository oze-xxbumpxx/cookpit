# Sprint 1：Recipe 新規作成フォーム 実装指針

Codex への実装指示書。実装後は必ず Claude Code でレビューを受けること。

**前提**：`docs/tasks/sprint1-recipe-ui-list.md` の作業が完了していること（`/recipes` 一覧画面が動作し、`/api/recipes` の `POST` が動く＝`CreateRecipeUseCase` が組み立て可能）。

---

## 事前確認

実装前に以下を必ず読むこと。

- `docs/03-architecture.md`（Presentation 層・サーバーサイドの2つのアプローチ＝**書き込みは Hono RPC + Client Component** 方針）
- `docs/07-dev-rules.md`（コーディング規約）
- `docs/designs/wireframes/recipe-wireframes.html`（**画面 3 「レシピ作成」**セクション。レイアウト・配置はこれに従う）

以下の実装済みファイル・型を読んでから実装すること。

- `packages/application/src/recipe/recipe.dto.ts`（`CreateRecipeInputDto` / `RecipeIngredientDto` / `CookingStepDto`）
- `packages/api-contract/src/recipe.schema.ts`（`createRecipeSchema`・`unitSchema`・`recipeTagSchema`・**材料のバリデーション制約**。下記「材料のバリデーション」で詳説）
- `apps/web/src/lib/api-client.ts`（Hono RPC クライアント `client`）
- `apps/web/src/server/app.ts`（`AppType`・basePath `/api`・RPC パスの確認）
- `apps/web/src/app/recipes/_components/recipe-list-client.tsx`（既存 Client Component のスタイル流儀）
- `apps/web/src/components/ui/button.tsx` / `input.tsx`（既存 shadcn コンポーネント）

---

## タスク概要

`/recipes/new` にレシピ新規作成フォームを実装する。

```
[Server] /recipes/new (page.tsx)
   └─ Client Component (RecipeFormClient): フォーム状態を useState で保持
        ├─ レシピ名・タグ・基準人数・調理時間・材料・手順・メモを入力
        ├─ 保存ボタン押下 → Hono RPC で POST /api/recipes
        ├─ 成功 → router.push('/recipes') + router.refresh()
        └─ 失敗 → エラーメッセージ表示（フォームは保持）
```

**サーバーサイド方針**：一覧（読み取り初期表示）は Server Component 直接呼び出しだったが、**作成（書き込み）は Hono RPC 経由**（arch doc の使い分け表に従う）。TanStack Query は MVP1 では導入しないため、送信は `useState` + `client.api.recipes.$post()` + `fetch` のみで行う。

### 画面要素（スケッチ準拠）

ワイヤーフレーム画面3に従う。上から順に：

1. **トップバー**：左「キャンセル」（`/recipes` へ戻る）、中央タイトル「レシピを追加」、右「保存」ボタン
   - 保存ボタンは**レシピ名が空（trim 後）なら disabled**（スケッチ注釈 a「必須空欄なら無効」）
2. **レシピ名**（必須）：1行入力。プレースホルダ「例：鶏むね肉の塩こうじ漬け」
3. **タグ**（複数選択可）：トグルチップ。`主菜 / 副菜 / 汁物 / 作り置き向き / 冷凍可`。**複数選択**（一覧のフィルタは単一選択だったが、ここは複数選択。混同しないこと）
4. **基準人数**＋**調理時間**（2カラム横並び）：
   - 基準人数：数値入力。デフォルト `2`。`baseServings` にマップ（正の数）
   - 調理時間（任意）：数値入力（分）。空なら `cookingTime: null`
5. **材料**：動的に行を増減できる。1行 = `食材名 / 量 / 単位（プルダウン）/ ✕（行削除）`。下に「＋ 材料を追加」ボタン
6. **作り方**：動的に行を増減できる。1行 = `連番 / 手順（複数行 textarea）/ ✕（行削除）`。下に「＋ ステップを追加」ボタン
7. **メモ**（任意）：複数行 textarea。`notes` にマップ。プレースホルダ「補足や保存方法など」

レイアウト・カラーは既存 `recipe-list-client.tsx` と同じく Tailwind（`bg-zinc-*` / `text-zinc-*` 系）でモバイル前提（`max-w-md` 等）。

---

## 材料のバリデーション（重要・必読）

`createRecipeSchema` の `recipeIngredientSchema` は、材料1行ごとに以下の制約を持つ。**フロントの送信ロジックはこの制約に整合させること**（違反すると API が 400 を返す）。

- `displayName`：空白不可（必須）
- 量は **次のどちらか一方が必須**：
  - **数値量**：`amountValue`（数値）＋ `amountUnit`（単位）を**セットで**。片方だけは不可
  - **メモ量**：`amountNote`（"少々" など。空白不可）
- `amountValue` と `amountNote` の**両方をセットすることは不可**

### フォーム上の入力方式（決定事項）

材料行の入力は `食材名 / 量 / 単位` の3カラムを維持しつつ、**「量」フィールドはテキストも受け付ける**。送信時に値を判定して DTO に変換する：

| 「量」フィールドの入力 | 単位     | 送信する DTO                                                                    |
| ---------------------- | -------- | ------------------------------------------------------------------------------- |
| 数値（例：`200`）      | 選択あり | `{ amountValue: 200, amountUnit: 'g', amountNote: null }`                       |
| 数値（例：`200`）      | 未選択   | **不正**（単位必須）→ 行エラー表示。送信させない                                |
| テキスト（例：`少々`） | 任意     | `{ amountValue: null, amountUnit: null, amountNote: '少々' }`（**単位は無視**） |
| 空                     | 任意     | **不正**（量必須）→ 行エラー表示                                                |

- 数値判定：`Number(trimmed)` が `NaN` でなく、かつ `trimmed !== ''` のときに数値量とみなす（全角数字は対象外で良い。MVP1 は半角前提）
- テキスト量の場合、単位プルダウンの選択値は送信に含めない（`amountNote` のみ）
- `productRef` は MVP1 では常に `null`（商品マスタ連携は Phase 2）

> この判定ロジックは送信直前（`buildCreateInput`）に1箇所へ集約する。行コンポーネント側は「文字列としての量」と「選択中の単位」を保持するだけにする。

---

## 作成・変更するファイル一覧

```
新規作成
apps/web/src/app/recipes/new/page.tsx                          # Server Component（フォームを描画するだけ）
apps/web/src/app/recipes/new/_components/recipe-form-client.tsx # Client Component（フォーム本体・送信）
apps/web/src/app/recipes/new/_components/ingredient-row.tsx     # 材料1行（Presentational）
apps/web/src/app/recipes/new/_components/step-row.tsx           # 手順1行（Presentational）
apps/web/src/components/ui/textarea.tsx                         # shadcn Textarea を追加（CLI: 後述）

更新
（なし。一覧の「追加」ボタンのリンク先 /recipes/new は実装済み）
```

> `_components` は Next.js のプライベートフォルダ規約。`new/` 配下に閉じたコンポーネントは共通 `components/` に置かない。

---

## ステップ 0：shadcn Textarea の追加

```bash
cd apps/web
pnpm dlx shadcn@latest add textarea
```

`apps/web/src/components/ui/textarea.tsx` が生成される。

- **単位プルダウンは shadcn Select を使わず、ネイティブ `<select>` を Tailwind でスタイリングする**。理由：モバイル PWA ではネイティブ select が OS 標準ピッカーを出し、UX・アクセシビリティ・実装コストの面で最適。base-ui の Select 導入は MVP1 では過剰。
- ネイティブ `<select>` のスタイルは既存 `input.tsx` の `className` に倣い、高さ・角丸・ボーダーを揃える。

---

## ステップ 1：`apps/web/src/app/recipes/new/page.tsx`（Server Component）

フォームはクライアント状態を持つため、page は Client Component を描画するだけ。

```tsx
import { RecipeFormClient } from './_components/recipe-form-client';

export default function NewRecipePage() {
  return <RecipeFormClient />;
}
```

- DB アクセスも UseCase 呼び出しもしない（作成は送信時に Hono RPC 経由）。
- `dynamic = 'force-dynamic'` は不要（DB を読まない）。

---

## ステップ 2：`recipe-form-client.tsx`（Client Component）

フォーム状態を `useState` で保持し、保存ボタンで Hono RPC に POST する。

### 状態設計（例）

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RecipeTag } from '@cookpit/application';
import type { Unit } from '@cookpit/domain/src/shared/unit';
import { client } from '@/lib/api-client';
// ... Input / Button / Textarea / IngredientRow / StepRow を import

const TAG_OPTIONS = [
  '主菜',
  '副菜',
  '汁物',
  '作り置き向き',
  '冷凍可',
] as const satisfies readonly RecipeTag[];

interface IngredientRowState {
  displayName: string;
  amountText: string; // 数値でもテキストでも受ける生入力
  amountUnit: Unit | ''; // 未選択は ''
}

interface StepRowState {
  description: string;
}
```

- `name: string`、`tags: RecipeTag[]`、`baseServings: string`（入力は文字列で保持し送信時に数値化）、`cookingTime: string`、`ingredients: IngredientRowState[]`、`steps: StepRowState[]`、`notes: string`
- `submitting: boolean`、`errorMessage: string | null`
- 初期値：材料1行・手順1行を空で用意しておくと UX が良い。`baseServings` は `'2'`。

### タグのトグル（複数選択）

```tsx
function toggleTag(tag: RecipeTag) {
  setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
}
```

### 保存可否

```tsx
const canSubmit = name.trim() !== '' && !submitting;
```

保存ボタンの `disabled={!canSubmit}`。

### 送信ペイロードの組み立て（量の判定をここに集約）

```tsx
function buildCreateInput(): CreateRecipeBody {
  return {
    name: name.trim(),
    tags,
    baseServings: Number(baseServings),
    cookingTime: cookingTime.trim() === '' ? null : Number(cookingTime),
    notes,
    ingredients: ingredients
      .filter((row) => row.displayName.trim() !== '') // 食材名が空の行は捨てる
      .map((row) => {
        const amount = row.amountText.trim();
        const isNumeric = amount !== '' && !Number.isNaN(Number(amount));
        if (isNumeric) {
          return {
            productRef: null,
            displayName: row.displayName.trim(),
            amountValue: Number(amount),
            amountUnit: row.amountUnit === '' ? null : row.amountUnit,
            amountNote: null,
          };
        }
        return {
          productRef: null,
          displayName: row.displayName.trim(),
          amountValue: null,
          amountUnit: null,
          amountNote: amount === '' ? null : amount,
        };
      }),
    steps: steps
      .map((row) => ({ description: row.description.trim() }))
      .filter((row) => row.description !== ''),
  };
}
```

> `CreateRecipeBody` は `@cookpit/api-contract` からインポートする（`z.infer` 由来の型）。`any` や独自型を作らない。

### 送信処理（Hono RPC）

```tsx
async function handleSubmit() {
  setSubmitting(true);
  setErrorMessage(null);
  try {
    const res = await client.api.recipes.$post({ json: buildCreateInput() });
    if (!res.ok) {
      setErrorMessage('保存に失敗しました。入力内容を確認してください。');
      return;
    }
    router.push('/recipes');
    router.refresh(); // 一覧の Server Component を再取得させる
  } catch {
    setErrorMessage('通信エラーが発生しました。');
  } finally {
    setSubmitting(false);
  }
}
```

- 送信前にクライアント側で**最低限の整合性**（数値量なのに単位未選択、量もメモも空、の行）をチェックして弾くと、API 400 を待たずにエラー表示できる。MVP1 では「保存に失敗しました」一括表示でも可だが、**どの行が不正かを示せるとなお良い**（任意）。
- `client.api.recipes.$post` のパスは `server/app.ts` の `basePath('/api')` + `.route('/recipes', ...)` 構成に対応。実際の呼び出し名は `AppType` から型補完されるので確認すること。

### キャンセル

```tsx
<button type="button" onClick={() => router.push('/recipes')}>
  キャンセル
</button>
```

---

## ステップ 3：`ingredient-row.tsx`（材料1行・Presentational）

props で値と変更ハンドラ・削除ハンドラを受け取るだけ。状態は持たない。

```tsx
interface Props {
  value: IngredientRowState;
  onChange: (next: IngredientRowState) => void;
  onRemove: () => void;
  unitOptions: readonly Unit[];
}
```

- `食材名`（Input）/ `量`（Input・テキスト可）/ `単位`（ネイティブ `<select>`、先頭に「単位 ▾」相当の空 option）/ `✕`（削除ボタン）
- 単位 option は `unitSchema` の値（`g / kg / ml / l / 大さじ / 小さじ / cup / 個 / 本 / 枚 / 玉 / 尾 / 切れ / 束 / 袋 / 缶 / 合`）を使う。`@cookpit/api-contract` か `@cookpit/domain` から取得し、ハードコードの二重管理を避ける
- 削除ボタンには `aria-label="材料を削除"` を付ける

---

## ステップ 4：`step-row.tsx`（手順1行・Presentational）

```tsx
interface Props {
  index: number; // 表示用の連番（1始まり）
  value: StepRowState;
  onChange: (next: StepRowState) => void;
  onRemove: () => void;
}
```

- `連番`（`{index + 1}`）/ `手順`（Textarea）/ `✕`（削除、`aria-label="手順を削除"`）

---

## 型チェック・動作確認

```bash
pnpm --filter @cookpit/web type-check
pnpm --filter @cookpit/web dev --webpack   # webpack 起動（既存設定の都合）
```

ブラウザで以下を確認：

- `/recipes` の「＋ 追加」から `/recipes/new` に遷移できる
- レシピ名が空のとき「保存」が disabled
- レシピ名のみ入力 → 保存できる（材料・手順なしでも可。スキーマ上 `ingredients: []` / `steps: []` は許容）
- 材料で「量＝数値・単位選択」→ 保存後、一覧/詳細で数値量が表示される
- 材料で「量＝"少々"」→ `amountNote` として保存される（単位を選んでいても無視される）
- タグを複数トグルできる（一覧フィルタと違い複数選択）
- 保存成功 → `/recipes` に戻り、作成したレシピが一覧に出る
- 「キャンセル」で `/recipes` に戻る（入力は破棄）
- モバイル幅（375px）でレイアウトが崩れない

---

## 共通の注意事項

- `any` / 型アサーション（`as`）は禁止（`as const satisfies` を除く）。
- デフォルトエクスポート禁止（Next.js が要求する page.tsx のみ例外）。
- Client Component は冒頭に必ず `'use client'`。Presentational でも hooks や `onChange` を扱うので付ける。
- 送信ペイロードの型は `@cookpit/api-contract` の `CreateRecipeBody` を使う。フォーム内部状態（文字列中心）と送信 DTO（数値・null 含む）は別物として扱い、変換は `buildCreateInput` に集約する。
- 単位・タグの選択肢はドメイン/契約パッケージの定義を参照し、画面側でハードコードの配列を二重管理しない（タグは `as const satisfies readonly RecipeTag[]` で型一致を強制）。
- TanStack Query は導入しない。状態は `useState` のみ、送信は `client.api.recipes.$post`。

---

## 完了条件

- [ ] shadcn `textarea` を追加し、`@/components/ui/textarea.tsx` が存在する
- [ ] `apps/web/src/app/recipes/new/page.tsx` が Client フォームを描画する Server Component になっている
- [ ] `recipe-form-client.tsx` / `ingredient-row.tsx` / `step-row.tsx` が `new/_components` 配下に作成されている
- [ ] レシピ名が空のとき保存ボタンが無効
- [ ] 材料の「量」がテキスト（"少々"等）なら `amountNote`、数値なら `amountValue`+`amountUnit` に変換して送信される
- [ ] タグが複数選択できる
- [ ] 保存成功で `/recipes` に戻り、一覧に反映される（`router.refresh()`）
- [ ] 単位プルダウンはネイティブ `<select>`、選択肢は契約/ドメイン定義を参照
- [ ] `pnpm --filter @cookpit/web type-check` が通る
- [ ] モバイル幅（375px）でレイアウトが崩れない
- [ ] 実装後に Claude Code へレビュー依頼を行う

---

## レビュー観点（Claude Code 用・Codex 生成の頻出ミス）

- Tailwind クラス名のタイポ（`tsc` を通過するため目視必須。例：`w-fll` / `bg-zinc-90`）
- `onClick` / `onChange` をハンドラ要素に結線し忘れる
- `'use client'` の付け忘れ／hooks 不使用 presentational への不要な付与
- 量の判定ロジック（数値/テキスト分岐）が `createRecipeSchema` の制約に整合しているか（`amountValue` と `amountNote` の同時セット・単位欠落）
- 単位・タグ選択肢のハードコード二重管理になっていないか

---

## このタスクのスコープ外（次の指針で扱う）

- `/recipes/[id]`（詳細画面・倍量変更・削除導線） — `sprint1-recipe-ui-detail.md` で扱う
- `/recipes/[id]/edit`（編集） — フォームを `UpdateRecipeUseCase` 向けに再利用する設計を別途検討
- 削除確認 AlertDialog — 詳細指針で扱う
- 商品マスタ連携（`productRef`） — Phase 2

---

## 付録：完成コード例

この章は、上記の実装指針に沿った完成コード例。実装時は既存ファイルの状態を確認し、差分がある場合は既存実装を優先して調整すること。

### `apps/web/src/app/recipes/new/page.tsx`

```tsx
import { RecipeFormClient } from './_components/recipe-form-client';

export default function NewRecipePage() {
  return <RecipeFormClient />;
}
```

### `apps/web/src/components/ui/textarea.tsx`

```tsx
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
```

### `apps/web/src/app/recipes/new/_components/ingredient-row.tsx`

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CreateRecipeBody } from '@cookpit/api-contract';
import { X } from 'lucide-react';
import type { ChangeEvent } from 'react';
import { useId } from 'react';

export type IngredientUnit = NonNullable<CreateRecipeBody['ingredients'][number]['amountUnit']>;

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
          className="h-11 rounded-lg bg-white px-2 text-sm"
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
          className="h-11 rounded-lg bg-white px-2 text-sm"
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
          className="h-11 w-full rounded-lg border border-input bg-white px-2 text-sm text-zinc-900 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
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
          className="h-11 w-9 rounded-lg text-zinc-500 hover:text-zinc-900"
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

### `apps/web/src/app/recipes/new/_components/step-row.tsx`

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
        className="flex h-11 items-center justify-center rounded-full bg-zinc-100 text-sm font-medium text-zinc-700"
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
        className="min-h-20 rounded-lg bg-white text-sm"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        onClick={onRemove}
        aria-label="手順を削除"
        title="手順を削除"
        className="h-11 w-9 rounded-lg text-zinc-500 hover:text-zinc-900"
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
```

### `apps/web/src/app/recipes/new/_components/recipe-form-client.tsx`

```tsx
'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { client } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { recipeTagSchema, unitSchema, type CreateRecipeBody } from '@cookpit/api-contract';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useId, useRef, useState } from 'react';
import { IngredientRow, type IngredientRowValue } from './ingredient-row';
import { StepRow, type StepRowValue } from './step-row';

type RecipeTag = CreateRecipeBody['tags'][number];

interface FieldErrors {
  baseServings: string | null;
  cookingTime: string | null;
  ingredients: Record<string, string>;
}

interface BuildResult {
  input: CreateRecipeBody | null;
  errors: FieldErrors;
}

const TAG_OPTIONS = recipeTagSchema.options;
const UNIT_OPTIONS = unitSchema.options;

function emptyFieldErrors(): FieldErrors {
  return {
    baseServings: null,
    cookingTime: null,
    ingredients: {},
  };
}

function createIngredientRow(id: string): IngredientRowValue {
  return {
    id,
    displayName: '',
    amountText: '',
    amountUnit: '',
  };
}

function createStepRow(id: string): StepRowValue {
  return {
    id,
    description: '',
  };
}

export function RecipeFormClient() {
  const router = useRouter();
  const nameId = useId();
  const baseServingsId = useId();
  const cookingTimeId = useId();
  const notesId = useId();
  const baseServingsErrorId = useId();
  const cookingTimeErrorId = useId();
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(emptyFieldErrors);

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

  function buildCreateInput(): BuildResult {
    const errors = emptyFieldErrors();
    const parsedIngredients: CreateRecipeBody['ingredients'] = [];
    const trimmedBaseServings = baseServings.trim();
    const parsedBaseServings = Number(trimmedBaseServings);
    const trimmedCookingTime = cookingTime.trim();
    const parsedCookingTime = trimmedCookingTime === '' ? null : Number(trimmedCookingTime);

    if (
      trimmedBaseServings === '' ||
      !Number.isFinite(parsedBaseServings) ||
      parsedBaseServings <= 0
    ) {
      errors.baseServings = '基準人数は1以上の数値で入力してください。';
    }

    if (
      parsedCookingTime !== null &&
      (!Number.isFinite(parsedCookingTime) ||
        !Number.isInteger(parsedCookingTime) ||
        parsedCookingTime < 0)
    ) {
      errors.cookingTime = '調理時間は0以上の整数で入力してください。';
    }

    for (const row of ingredients) {
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
    if (errors.baseServings !== null || errors.cookingTime !== null || hasIngredientErrors) {
      return {
        input: null,
        errors,
      };
    }

    return {
      input: {
        name: name.trim(),
        tags,
        baseServings: parsedBaseServings,
        cookingTime: parsedCookingTime,
        notes,
        ingredients: parsedIngredients,
        steps: steps
          .map((row) => ({ description: row.description.trim() }))
          .filter((row) => row.description !== ''),
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
    <main className="min-h-dvh bg-zinc-50">
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
              className="h-9 px-2 text-zinc-700"
            >
              キャンセル
            </Button>
          </div>
          <h1 className="text-lg font-semibold text-zinc-900">レシピを追加</h1>
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

        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-2">
            <label htmlFor={nameId} className="text-sm font-medium text-zinc-900">
              レシピ名 <span className="text-xs font-normal text-red-600">必須</span>
            </label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例：鶏むね肉の塩こうじ漬け"
              className="h-11 rounded-xl bg-white"
            />
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium text-zinc-900">
              タグ <span className="text-xs font-normal text-zinc-500">複数選択可</span>
            </p>
            <div className="flex flex-wrap gap-2" aria-label="レシピタグ">
              {TAG_OPTIONS.map((tag) => {
                const selected = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={selected}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm transition-colors',
                      selected
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50',
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label htmlFor={baseServingsId} className="text-sm font-medium text-zinc-900">
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
                className="h-11 rounded-xl bg-white"
              />
              {fieldErrors.baseServings !== null && (
                <p id={baseServingsErrorId} className="text-xs text-red-600">
                  {fieldErrors.baseServings}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor={cookingTimeId} className="text-sm font-medium text-zinc-900">
                調理時間 <span className="text-xs font-normal text-zinc-500">任意</span>
              </label>
              <Input
                id={cookingTimeId}
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={cookingTime}
                onChange={(event) => setCookingTime(event.target.value)}
                placeholder="25"
                aria-invalid={fieldErrors.cookingTime !== null}
                aria-describedby={fieldErrors.cookingTime === null ? undefined : cookingTimeErrorId}
                className="h-11 rounded-xl bg-white"
              />
              {fieldErrors.cookingTime !== null && (
                <p id={cookingTimeErrorId} className="text-xs text-red-600">
                  {fieldErrors.cookingTime}
                </p>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium text-zinc-900">材料</p>
            <div className="flex flex-col gap-2">
              {ingredients.map((ingredient) => (
                <IngredientRow
                  key={ingredient.id}
                  value={ingredient}
                  errorMessage={fieldErrors.ingredients[ingredient.id] ?? null}
                  onChange={updateIngredient}
                  onRemove={() => removeIngredient(ingredient.id)}
                  unitOptions={UNIT_OPTIONS}
                />
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={addIngredient}
                className="h-10 justify-start rounded-lg border-dashed bg-white text-zinc-700"
              >
                <Plus className="size-4" aria-hidden="true" />
                材料を追加
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <p className="text-sm font-medium text-zinc-900">作り方</p>
            <div className="flex flex-col gap-3">
              {steps.map((step, index) => (
                <StepRow
                  key={step.id}
                  index={index}
                  value={step}
                  onChange={updateStep}
                  onRemove={() => removeStep(step.id)}
                />
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={addStep}
                className="h-10 justify-start rounded-lg border-dashed bg-white text-zinc-700"
              >
                <Plus className="size-4" aria-hidden="true" />
                ステップを追加
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <label htmlFor={notesId} className="text-sm font-medium text-zinc-900">
              メモ <span className="text-xs font-normal text-zinc-500">任意</span>
            </label>
            <Textarea
              id={notesId}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="補足や保存方法など"
              className="min-h-24 rounded-xl bg-white"
            />
          </section>
        </div>
      </form>
    </main>
  );
}
```
