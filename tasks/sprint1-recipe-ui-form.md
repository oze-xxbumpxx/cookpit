# Sprint 1：Recipe 新規作成フォーム 実装指針

Codex への実装指示書。実装後は必ず Claude Code でレビューを受けること。

**前提**：`tasks/sprint1-recipe-ui-list.md` の作業が完了していること（`/recipes` 一覧画面が動作し、`/api/recipes` の `POST` が動く＝`CreateRecipeUseCase` が組み立て可能）。

---

## 事前確認

実装前に以下を必ず読むこと。

- `docs/03-architecture.md`（Presentation 層・サーバーサイドの2つのアプローチ＝**書き込みは Hono RPC + Client Component** 方針）
- `docs/07-dev-rules.md`（コーディング規約）
- `designs/wireframes/recipe-wireframes.html`（**画面 3 「レシピ作成」**セクション。レイアウト・配置はこれに従う）

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

| 「量」フィールドの入力 | 単位 | 送信する DTO |
| ---------------------- | ---- | ------------ |
| 数値（例：`200`）       | 選択あり | `{ amountValue: 200, amountUnit: 'g', amountNote: null }` |
| 数値（例：`200`）       | 未選択 | **不正**（単位必須）→ 行エラー表示。送信させない |
| テキスト（例：`少々`）  | 任意 | `{ amountValue: null, amountUnit: null, amountNote: '少々' }`（**単位は無視**） |
| 空                      | 任意 | **不正**（量必須）→ 行エラー表示 |

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

const TAG_OPTIONS = ['主菜', '副菜', '汁物', '作り置き向き', '冷凍可'] as const satisfies readonly RecipeTag[];

interface IngredientRowState {
  displayName: string;
  amountText: string;      // 数値でもテキストでも受ける生入力
  amountUnit: Unit | '';   // 未選択は ''
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
<button type="button" onClick={() => router.push('/recipes')}>キャンセル</button>
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
