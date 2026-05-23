# Sprint 1 DrizzleRecipeRepository 実装レビュー

## レビュー概要

| 項目 | 内容 |
|------|------|
| 対象ブランチ | main |
| レビュー対象 | `sprint1-drizzle-recipe-repository` タスクの実装成果物 |
| レビュー日 | 2026-05-23 |
| 型チェック | `pnpm --filter @cookpit/infrastructure type-check` エラーなし ✅ |

---

## 対象ファイル

| ファイル | 種別 |
|----------|------|
| `packages/infrastructure/src/db/client.ts` | 新規作成 |
| `packages/infrastructure/src/repositories/drizzle-recipe.repository.ts` | 新規作成 |
| `packages/infrastructure/src/index.ts` | 更新 |

---

## 修正必須（2件）

### 1. `constructor` に `private` が抜けている

**場所**：`drizzle-recipe.repository.ts` 24行目

**現状**：
```typescript
constructor(readonly db: DrizzleClient) {}
```

**修正後**：
```typescript
constructor(private readonly db: DrizzleClient) {}
```

**理由**：`readonly` のみではパブリックプロパティになり、クラス外から `repository.db.select(...)` のように直接アクセスできてしまう。`db` は実装の詳細であり、インターフェース (`RecipeRepository`) にも存在しないため、外部に公開すべきでない。

`docs/07-dev-rules.md`：「`private` / `protected` / `readonly` 修飾子を明示する」

---

### 2. ループ変数名が外側の変数をシャドウイングしている

**場所**：`drizzle-recipe.repository.ts` 64行目

**現状**：
```typescript
const ingredients = (row.ingredients as IngredientRow[]).map((ingredients) => {
  const amountUnit = ingredients.amountUnit !== null ? toUnit(ingredients.amountUnit) : null;
```

**修正後**：
```typescript
const ingredients = (row.ingredients as IngredientRow[]).map((ing) => {
  const amountUnit = ing.amountUnit !== null ? toUnit(ing.amountUnit) : null;
```

**理由**：外側の `const ingredients` と同名のループ変数 `ingredients` を宣言している。TypeScript はシャドウイングを許容するが、ループ変数が「材料1件」を指しているのに複数形の `ingredients` という名前は意味的にも誤り。`ing` または `ingredient` が適切。

---

## 軽微（1件）

### 3. `amountNote ?? null` が冗長

**場所**：`drizzle-recipe.repository.ts` 101行目

**現状**：
```typescript
amountNote: ingredient.amountNote ?? null,
```

**修正後**：
```typescript
amountNote: ingredient.amountNote,
```

**理由**：`RecipeIngredient.amountNote` ゲッターの戻り型は `string | null`。`null ?? null` は `null` のままであるため、`?? null` は何も変えない冗長な記述。

---

## 問題なし（確認済み）

| 観点 | 評価 | 理由 |
|------|------|------|
| アーキテクチャ依存方向 | ✅ | Domain 層に Drizzle の型が混入していない |
| `Recipe.reconstruct()` の使用 | ✅ | DB 復元は全て `reconstruct()` を経由している |
| upsert の `set` 句から `createdAt` を除外 | ✅ | 更新時に作成日時を変えない設計として正しい |
| `toUnit` / `toRecipeTag` の網羅性チェック | ✅ | switch の default で `throw` し、DB 値が Unit/RecipeTag 定義外になった場合に即座に検知できる |
| `amount` / `amountNote` の排他制約 | ✅ | `RecipeIngredient.create()` のバリデーションに委ねる方針と合致（実装計画の注意点に明記）|
| `createDb` のファクトリ関数 | ✅ | シングルトンにせず DI 可能な形。テスト時の差し替えが可能 |
| インポートパス（`/src/` 含む） | ✅ | `domain/src/index.ts` が空のため、個別ファイルへの直接インポートは現状の設計上許容 |
| `IngredientRow` / `StepRow` をファイル内ローカルに定義 | ✅ | JSONB 変換に閉じた型。export 不要 |
| `NewRecipeRow` / `RecipeRow` の使い分け | ✅ | `toRow` の戻り型が `NewRecipeRow`、`toEntity` の引数が `RecipeRow` で正しく使い分けられている |

---

## 修正方針まとめ

Codex への修正依頼が必要な箇所は以下の2件（軽微1件はあわせて対応推奨）。

```
[要修正] drizzle-recipe.repository.ts:24
  constructor(readonly db) → constructor(private readonly db)

[要修正] drizzle-recipe.repository.ts:64
  .map((ingredients) → .map((ing)  ※ 内部の ingredients. 参照も ing. に変更

[軽微]   drizzle-recipe.repository.ts:101
  amountNote: ingredient.amountNote ?? null → amountNote: ingredient.amountNote
```

修正後は再度 `pnpm --filter @cookpit/infrastructure type-check` を実行すること。

---

## Codex 傾向メモ

今回発見したパターンを今後の指針 MD に反映することを推奨。

- **`constructor` のアクセス修飾子**：`readonly` のみで `private` を省略する傾向がある。指針 MD に「`private readonly` を明示する」と追記する。
- **ループ変数のシャドウイング**：外側の変数名と同じ名前をループ変数に使う傾向がある。`map` のコールバック引数は単数形の短縮名（`ing`、`step` 等）を使うよう明示する。
