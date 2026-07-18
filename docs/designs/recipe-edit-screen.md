# 設計書: recipe-edit-screen

- ステータス: draft
- レベル: L2
- 関連: なし（新規画面、既存 API・スキーマ・DB 変更なし）

## 背景

レシピ詳細画面（`/recipes/[id]`）には現時点で削除ボタンのみ存在し、レシピの内容を編集する手段がない。バックエンド（`UpdateRecipeUseCase` / `PUT /api/recipes/:id` / `updateRecipeSchema`）はすでに実装済みであるため、Presentation 層のみの追加で機能を完成できる。

## 目的

既存レシピの name / ingredients / steps / tags / cookingTime / notes を UI から編集・保存できるようにする。

## 要件

1. 詳細画面（`/recipes/[id]`）に「編集」ボタンを追加する。
2. 編集画面（`/recipes/[id]/edit`）を新設する。
3. 編集画面では既存レシピの現在値がフォームに初期表示される。
4. 保存時に `PUT /api/recipes/:id` を呼び出し、成功後は詳細画面へ遷移する。
5. 存在しない ID にアクセスした場合は 404 を返す。
6. `baseServings` は `UpdateRecipeUseCase` が変更対象としていないため、編集不可（読み取り専用表示）とする。

## 対象範囲

- `apps/web/src/app/recipes/[id]/edit/` ディレクトリ（新規）
  - `page.tsx`（Server Component）
  - `_components/recipe-edit-form-client.tsx`（Client Component）
- `apps/web/src/app/recipes/[id]/_components/recipe-detail-client.tsx`（編集ボタン追加）

## 対象外

- `packages/application`、`packages/domain`、`packages/infrastructure` の変更なし。
- `packages/api-contract` の変更なし（`updateRecipeSchema` は既存）。
- `apps/web/src/server/` の変更なし（`PUT /api/recipes/:id` は既存）。
- 画像アップロード・カバー写真などは対象外。
- `baseServings` の編集機能は対象外（使用制約あり、詳細は「baseServings の扱い」節）。

## 現状構成

```
apps/web/src/app/recipes/
├── page.tsx                          # 一覧（Server Component）
├── new/
│   ├── page.tsx                      # 作成（Server Component、薄いラッパー）
│   └── _components/
│       ├── recipe-form-client.tsx    # 作成フォーム（Client Component）
│       ├── ingredient-row.tsx
│       └── step-row.tsx
└── [id]/
    ├── page.tsx                      # 詳細（Server Component + DI）
    └── _components/
        └── recipe-detail-client.tsx  # 詳細表示＋削除（Client Component）
```

詳細画面の Server Component は `GetRecipeUseCase` を手動 DI で呼び出し、`RecipeDto` を Client Component へ渡すパターンが確立している。

## 変更後構成

```
apps/web/src/app/recipes/
├── page.tsx
├── new/
│   ├── page.tsx
│   └── _components/
│       ├── recipe-form-client.tsx    # 変更なし
│       ├── ingredient-row.tsx        # 変更なし
│       └── step-row.tsx              # 変更なし
└── [id]/
    ├── page.tsx                      # 変更なし
    ├── edit/                         # 新規
    │   ├── page.tsx                  # Server Component（初期値取得・DI）
    │   └── _components/
    │       └── recipe-edit-form-client.tsx  # Client Component（編集フォーム）
    └── _components/
        └── recipe-detail-client.tsx  # 編集ボタン追加のみ
```

## データフロー

### 初期表示

```
ブラウザ → /recipes/[id]/edit
  → [id]/edit/page.tsx (Server Component)
      → GetRecipeUseCase.execute(id)          # 手動 DI
          → DrizzleRecipeRepository.findById  # DB 取得
      → RecipeDto をフォームへ初期値として渡す
  → recipe-edit-form-client.tsx (Client Component)
      → useState で各フィールドを RecipeDto 値で初期化
```

### 保存フロー

```
ユーザーが「保存」ボタンを押す
  → buildUpdateInput()（バリデーション・型変換）
  → client.api.recipes[':id'].$put({ param: { id }, json: body })  # Hono RPC
      → PUT /api/recipes/:id
          → UpdateRecipeUseCase.execute({ id, ...body })
              → Recipe エンティティ更新 → recipeRepository.save()
          → RecipeDto を返す
  → 成功: router.push(`/recipes/${id}`) + router.refresh()
  → 失敗: errorMessage 表示（フォームは閉じない）
```

### エラー時（404）

```
[id]/edit/page.tsx で GetRecipeUseCase が RecipeNotFoundError を throw
  → catch して next/navigation の notFound() を呼ぶ
  → Next.js 標準の 404 ページへ
```

## API 設計

変更なし。既存エンドポイント `PUT /api/recipes/:id` を使用する。

| 項目           | 値                                                    |
| -------------- | ----------------------------------------------------- |
| メソッド       | PUT                                                   |
| パス           | /api/recipes/:id                                      |
| リクエスト     | `UpdateRecipeBody`（`updateRecipeSchema` で検証済み） |
| レスポンス成功 | 200 `RecipeDto`                                       |
| レスポンス失敗 | 404 `{ error: string }` / 400 / 500                   |

`updateRecipeSchema` に含まれるフィールド: `name` / `ingredients` / `steps` / `tags` / `cookingTime` / `notes`。`baseServings` はスキーマに含まれないため送信しない。

## DB 設計

変更なし。

## フロントエンド設計

### 共通化方針（論点 1）

#### 案 A: `recipe-form-client.tsx` を作成/編集共用に改造（props で mode 切り替え）

- 長所: コードの重複がない。将来のフォームフィールド追加が 1 箇所で済む。
- 短所: 既存作成フォームへの回帰リスクがある。`mode` 分岐がコンポーネント内に増え、可読性が下がりやすい。`baseServings` の扱い（作成=編集可、編集=読み取り専用）の分岐が複雑化する。

#### 案 B: 編集専用 `recipe-edit-form-client.tsx` を新規作成（複製ベース）（推奨）

- 長所: 作成フォームへの回帰リスクがゼロ。編集固有の差異（初期値プリフィル・`baseServings` 読み取り専用・保存先 API の差異）を明確に分離できる。コンポーネントの責務が単純になる。
- 短所: `buildCreateInput` / `buildUpdateInput` のロジックが重複する部分がある。`IngredientRow` / `StepRow` は共有するため重複は最小限。

**推奨: 案 B**。作成フォームは MVP1 の最初に実装され安定しているコアコンポーネントであり、編集モードの props を後付けすることで分岐が複雑化するリスクを避ける。重複する量の数値/テキスト判定ロジックは、共有ユーティリティ関数として `apps/web/src/app/recipes/_utils/build-ingredient-input.ts` に切り出すことで DRY を確保する（詳細は「量の数値/テキスト判定（論点 5）」節）。

### 初期値プリフィル（論点 2）

Server Component（`[id]/edit/page.tsx`）が `GetRecipeUseCase` を手動 DI で呼び出し、取得した `RecipeDto` を Client Component へ props として渡す。

```
// [id]/edit/page.tsx の骨格
export default async function RecipeEditPage({ params }) {
  const { id } = await params;
  // 手動 DI
  const repository = new DrizzleRecipeRepository(getDb());
  const useCase = new GetRecipeUseCase(repository);
  let recipe: RecipeDto;
  try {
    recipe = await useCase.execute(id);
  } catch (error) {
    if (error instanceof RecipeNotFoundError) {
      notFound();   // next/navigation
    }
    throw error;
  }
  return <RecipeEditFormClient recipe={recipe} />;
}
```

Client Component は受け取った `recipe` を `useState` の初期値として設定する。

`RecipeDto` から `IngredientRowValue` への変換（`amountValue` / `amountUnit` / `amountNote` → `amountText` / `amountUnit`）はフォームコンポーネント側で初期化時に行う。

- `amountValue !== null` の場合: `amountText = String(amountValue)`, `amountUnit = amountUnit`
- `amountNote !== null` の場合: `amountText = amountNote`, `amountUnit = ''`

NotFound 時は `notFound()` で Next.js 標準の 404 ページへ遷移する（詳細画面と同じパターン）。

### `baseServings` の扱い（論点 3）

`UpdateRecipeUseCase` は `baseServings` を更新しない（`UpdateRecipeInputDto` にフィールドが存在しない）。編集画面では `baseServings` を **読み取り専用として表示する**。

具体的な実装方針:

- フォーム内に `基準人数: N人分` を静的テキストとして表示する（`Input` ではなく `<p>` タグ）。
- キャプションとして「作成後は変更できません」または「基準人数」ラベルを添える。
- `buildUpdateInput` で `baseServings` を含まない `UpdateRecipeBody` を組み立てる。

理由: `baseServings` を変更しようとすると UseCase・ドメイン・DB の変更が必要になりスコープを超過する。将来的に変更機能を追加する場合は別途設計する。

### 保存フロー（論点 4）

**楽観的更新は採用しない。保存後 redirect を採用する。**

理由:

- 楽観的更新はロールバック処理（更新失敗時に元の状態へ戻す）が必要であり、フォーム全体の状態管理が複雑になる。
- 編集フォームはユーザーが意図的に「保存」を押す操作であり、即時のフィードバックよりも確実な保存確認の方が UX に合う。
- 詳細画面へ redirect することで、保存後に最新状態が Server Component を通じて取得され一貫性が保たれる。

フロー:

1. `handleSubmit` 内で `buildUpdateInput()` を呼び入力バリデーション。
2. `client.api.recipes[':id'].$put(...)` で `PUT /api/recipes/:id` を呼ぶ。
3. 成功（`response.ok`）: `router.push(`/recipes/${recipe.id}`)` + `router.refresh()`。
4. 失敗（`!response.ok`）: `errorMessage` に「保存に失敗しました。」を設定。フォームは閉じない。
5. ネットワークエラー: `catch` で「通信エラーが発生しました。」を設定。

キャンセル時は `router.push(`/recipes/${recipe.id}`)` で詳細画面に戻る。

### 量の数値/テキスト判定（論点 5）

作成フォームの `buildCreateInput` 内に実装されているロジック（数値量 vs `amountNote` の判定）を編集フォームでも使用する。

共通ユーティリティ関数 `buildIngredientInput` を `apps/web/src/app/recipes/_utils/build-ingredient-input.ts` に切り出す。

```typescript
// 切り出す関数のシグネチャ（実装は指示範囲外）
export function buildIngredientInput(rows: IngredientRowValue[]): {
  ingredients: RecipeIngredientBody[];
  errors: Record<string, string>;
};
```

- `RecipeIngredientBody` は `CreateRecipeBody['ingredients'][number]` と同型（`updateRecipeSchema` の `ingredients` も同じ `recipeIngredientSchema` を使用しているため共有可能）。
- 作成フォームの `buildCreateInput` はこのユーティリティを呼び出す形にリファクタリングする。ただし、これは作成フォームへの変更を伴うため、**影響範囲として事前確認が必要**（「未決事項」参照）。

代替案: ユーティリティ分離をせず、`recipe-edit-form-client.tsx` 内に同等のロジックをインライン複製する。DRY には反するが、作成フォームへの影響がゼロになる。

**推奨: ユーティリティ分離**。ただし作成フォーム変更の確認を取ってから実施する。

### 詳細画面の「編集」ボタン追加

`recipe-detail-client.tsx` の header 右端（現在 `<span aria-hidden="true" className="w-9" />` が占めているスペース）に「編集」ボタンを配置する。

```
header: [戻るボタン] [タイトル] [編集ボタン]
```

現在のレイアウトは `grid-cols-[auto_1fr_auto]` であり、右端のスペーサー `<span>` を `<Button>` に置き換えることで自然に収まる。

ボタン: `variant="ghost"`, `size="icon-lg"` に鉛筆アイコン（`Pencil` from lucide-react）を使用し、`aria-label="編集"` を付与。クリックで `router.push(`/recipes/${recipe.id}/edit`)` を呼ぶ。

## バックエンド設計

変更なし。既存の `PUT /api/recipes/:id`（`apps/web/src/server/routes/recipes.ts`）をそのまま使用する。UseCase の手動 DI は呼び出し側（Hono ルート）で組み立て済み。

## エラー処理

| エラー種別                          | 発生箇所                         | 処理方法                                            |
| ----------------------------------- | -------------------------------- | --------------------------------------------------- |
| レシピ未存在（RecipeNotFoundError） | Server Component（初期表示時）   | `notFound()` で 404                                 |
| 入力バリデーションエラー            | Client Component（handleSubmit） | `fieldErrors` / `errorMessage` を setState で表示   |
| PUT 失敗（!response.ok）            | Client Component（handleSubmit） | `errorMessage` に「保存に失敗しました。」表示       |
| ネットワークエラー                  | Client Component（handleSubmit） | `errorMessage` に「通信エラーが発生しました。」表示 |

アーキテクチャ原則に従い、ドメイン境界（UseCase 入口）でのハンドリングはバックエンド側が担う。Presentation 層は HTTP レスポンスのステータスコードを見てユーザー向けメッセージを表示する。

## ログと監視

対象外（MVP1 では監視基盤なし）。サーバー側エラーは `console.error` が `app.onError` で既に実装されている。

## セキュリティ

MVP1 は認証なし（ADR-003 準拠）。URL を知っていれば誰でも編集可能。これは既存の削除機能と同じ前提であり、本機能追加で状況は変わらない。Phase 2 で認証導入時に再検討する。

入力値は `updateRecipeSchema`（Zod）によりサーバー側でバリデーションされる。クライアント側バリデーションは UX のための補助であり、サーバー側バリデーションが正とする。

## 性能

対象外（Presentation 層の増分で、DB アクセスは既存の GET + PUT と同一）。`export const dynamic = 'force-dynamic'` を編集ページにも適用し、SSR でレシピ最新値を取得する。

## フロントエンド設計（コンポーネント詳細）

### `[id]/edit/page.tsx`

- Server Component（`async`）。
- `export const dynamic = 'force-dynamic'` を付与。
- `params: Promise<{ id: string }>` を受け取る（詳細画面と同様）。
- `GetRecipeUseCase` を手動 DI で実行。
- `RecipeNotFoundError` を catch して `notFound()` を呼ぶ。
- 取得した `recipe: RecipeDto` を `<RecipeEditFormClient recipe={recipe} />` へ渡す。

### `[id]/edit/_components/recipe-edit-form-client.tsx`

- `'use client'` 宣言。
- Props: `{ recipe: RecipeDto }`。
- State:
  - `name`: `useState(recipe.name)`
  - `tags`: `useState(recipe.tags)`
  - `cookingTime`: `useState(recipe.cookingTime !== null ? String(recipe.cookingTime) : '')`
  - `ingredients`: `useState` で `RecipeDto` の ingredients を `IngredientRowValue[]` に変換して初期化
  - `steps`: `useState` で `RecipeDto` の steps を `StepRowValue[]` に変換して初期化
  - `notes`: `useState(recipe.notes)`
  - `submitting`: `useState(false)`
  - `errorMessage`: `useState<string | null>(null)`
  - `fieldErrors`: `useState(emptyFieldErrors())`
- `baseServings` は `recipe.baseServings` を直接参照する定数（State 不要）。
- `buildUpdateInput()`: `UpdateRecipeBody` を組み立てる。`buildIngredientInput` ユーティリティを使用。`baseServings` は含めない。
- `handleSubmit`: 上記保存フローに従う。`PUT /api/recipes/:id` は `client.api.recipes[':id'].$put({ param: { id: recipe.id }, json: body })` で呼ぶ。
- UI: 作成フォームと同レイアウト。ヘッダーの `<h1>` は「レシピを編集」。キャンセルボタンで `router.push(`/recipes/${recipe.id}`)` に戻る。`baseServings` は静的テキスト表示。

`IngredientRow` / `StepRow` は `apps/web/src/app/recipes/new/_components/` からそのまま `import` して使用する。

## テスト方針

L2（Presentation 層増分）のため、Domain 層テストへの影響なし。

手動テスト観点:

- 詳細画面に「編集」ボタンが表示される。
- 編集ボタンで `/recipes/[id]/edit` へ遷移する。
- 編集フォームに既存値が初期表示される（全フィールド確認）。
- `baseServings` が読み取り専用として表示される。
- 各フィールドを変更して保存すると詳細画面へ遷移し、変更値が反映されている。
- 保存失敗時（ネットワーク切断等）にエラーメッセージが表示される。
- 存在しない ID（`/recipes/unknown-uuid/edit`）で 404 ページが表示される。
- キャンセルボタンで詳細画面へ戻る。

自動テスト: Application 層以下は既存テストに含まれる想定。Presentation 層の自動テストは後続フェーズで整備（coding-standards.md 準拠）。

## 移行とリリース

- DBスキーマ変更・マイグレーションなし。
- 既存データへの影響なし。
- 既存 API への変更なし（後方互換性完全維持）。
- デプロイはそのまま Vercel へ push するだけで完結する。

## リスク

| リスク                                                                  | 影響                  | 対策                                                                                                             |
| ----------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `IngredientRow` / `StepRow` の `import type` の参照パスが相対パスになる | 型エラー・lint エラー | `@/` エイリアスが `apps/web/src/` を指すため、絶対パス `@/app/recipes/new/_components/ingredient-row` で参照する |
| 作成フォームリファクタリング（ユーティリティ切り出し）による回帰        | 作成機能の破損        | 切り出し後に作成フォームの手動テストを必ず実施。未決事項として確認を取る                                         |
| `RecipeDto` から `IngredientRowValue` への変換の実装誤り                | 初期値が欠損する      | `amountNote` 側と `amountValue` 側の判定条件を `recipeIngredientSchema` の `superRefine` と対応させる            |

## 未決事項

1. **作成フォームのリファクタリング可否**: `buildIngredientInput` ユーティリティを切り出す際に `recipe-form-client.tsx` を変更する。L2 の作業対象外ファイルへの変更となるため、実施可否をユーザーに確認する必要がある。代替案（編集フォームにインライン複製）と合わせてトレードオフを提示する。

2. **`IngredientRow` / `StepRow` の配置場所**: 現在これらは `apps/web/src/app/recipes/new/_components/` 配下にある。編集フォームから参照するには `new/` を越えた相対インポートになる。`apps/web/src/app/recipes/_components/` などの共通ディレクトリへの移動が望ましいが、これも既存ファイルの移動に該当するためユーザー確認が必要。移動なしに `new/_components/` から直接 import する選択肢も許容される。
