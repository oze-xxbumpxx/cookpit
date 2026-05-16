import type { Quantity } from '../shared/quantity';

export interface ProductId {
  readonly value: string;
}

export interface RecipeIngredientCreateProps {
  productRef: ProductId | null;
  displayName: string;
  amount: Quantity;
}

export class RecipeIngredient {
  private constructor(
    private readonly productReference: ProductId | null,
    private readonly ingredientDisplayName: string,
    private readonly ingredientAmount: Quantity,
  ) {}

  static create(props: {
    productRef: ProductId | null;
    displayName: string;
    amount: Quantity;
  }): RecipeIngredient {
    if (props.displayName.trim() === '') {
      throw new Error('Display name is required');
    }
    return new RecipeIngredient(props.productRef, props.displayName, props.amount);
  }

  scale(factor: number): RecipeIngredient {
    return new RecipeIngredient(
      this.productReference,
      this.ingredientDisplayName,
      this.ingredientAmount.multiply(factor),
    );
  }

  get productRef(): ProductId | null {
    return this.productReference;
  }

  get displayName(): string {
    return this.ingredientDisplayName;
  }

  get amount(): Quantity {
    return this.ingredientAmount;
  }
}
