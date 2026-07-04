# Sprint 1：RecipeIngredient ドメイン修正（amountNote 追加）

Codex への実装指示書。実装後は必ず Claude Code でレビューを受けること。

---

## 事前確認

実装前に以下を必ず読むこと。

- `docs/04-domain-model.md`（Recipe 集約の設計）
- `docs/07-dev-rules.md`（命名規則・コーディング規約）
- `packages/domain/src/recipe/recipe-ingredient.ts`（現在の実装）
- `packages/domain/src/recipe/recipe.ts`（`scaleIngredients` への影響確認）

---

## 変更の背景

「少々」「適量」のような数値で表現できない量をレシピ材料として登録できるようにするため、
`RecipeIngredient` に `amountNote` フィールドを追加し、`amount` を nullable にする。

---

## 変更対象ファイル

```
packages/domain/src/recipe/recipe-ingredient.ts  ← 変更
```

`recipe.ts` は **変更しない**。`scaleIngredients` は各 `ingredient.scale()` を呼ぶだけなので、
`scale()` 側で null ハンドリングすれば影響は出ない。

---

## 変更仕様

### フィールド構成（変更後）

| フィールド              | 型                | 説明                                |
| ----------------------- | ----------------- | ----------------------------------- |
| `productReference`      | `ProductId\|null` | 変更なし                            |
| `ingredientDisplayName` | `string`          | 変更なし                            |
| `ingredientAmount`      | `Quantity\|null`  | `null` の場合は `amountNote` を使う |
| `ingredientAmountNote`  | `string\|null`    | 「少々」「適量」など                |

`amount` と `amountNote` は**どちらか一方のみ**設定する。両方 `null` は禁止。

### バリデーションルール

```
displayName が空文字 → Error
amount === null かつ amountNote が null または空文字 → Error
```

### `scale(factor: number)` の挙動

- `amount` が `Quantity` のとき：`amount.multiply(factor)` した新しい `RecipeIngredient` を返す
- `amount` が `null`（= amountNote が入っている）のとき：`this` をそのまま返す（「少々」は倍量しない）

### ゲッター

以下の 4 つを公開する。

```typescript
get productRef(): ProductId | null
get displayName(): string
get amount(): Quantity | null
get amountNote(): string | null
```

---

## 実装後の完成イメージ

```typescript
import type { Quantity } from '../shared/quantity';

export interface ProductId {
  readonly value: string;
}

export class RecipeIngredient {
  private constructor(
    private readonly productReference: ProductId | null,
    private readonly ingredientDisplayName: string,
    private readonly ingredientAmount: Quantity | null,
    private readonly ingredientAmountNote: string | null,
  ) {}

  static create(props: {
    productRef: ProductId | null;
    displayName: string;
    amount: Quantity | null;
    amountNote: string | null;
  }): RecipeIngredient {
    if (props.displayName.trim() === '') {
      throw new Error('Display name is required');
    }
    if (props.amount === null && (props.amountNote === null || props.amountNote.trim() === '')) {
      throw new Error('Either amount or amountNote is required');
    }
    return new RecipeIngredient(
      props.productRef,
      props.displayName,
      props.amount,
      props.amountNote,
    );
  }

  scale(factor: number): RecipeIngredient {
    if (this.ingredientAmount === null) {
      return this;
    }
    return new RecipeIngredient(
      this.productReference,
      this.ingredientDisplayName,
      this.ingredientAmount.multiply(factor),
      null,
    );
  }

  get productRef(): ProductId | null {
    return this.productReference;
  }

  get displayName(): string {
    return this.ingredientDisplayName;
  }

  get amount(): Quantity | null {
    return this.ingredientAmount;
  }

  get amountNote(): string | null {
    return this.ingredientAmountNote;
  }
}
```

---

## 共通の注意事項

- `any` 型は禁止
- デフォルトエクスポートは禁止。名前付きエクスポートのみ
- `null` と `undefined` を混在させない（「値なし」は `null` に統一）
- コメントは「なぜ（Why）」が非自明な場合のみ書く
- セミコロンは付ける

---

## 完了条件

- [ ] `recipe-ingredient.ts` が上記仕様通りに変更されている
- [ ] `recipe.ts` は変更されていない
- [ ] TypeScript のコンパイルエラーがない（`pnpm --filter @repo/domain tsc --noEmit` で確認）
- [ ] 実装後に Claude Code へレビュー依頼を行う
