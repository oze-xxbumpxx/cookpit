import type { ProductId } from '../product/product-id';
import type { Quantity } from '../shared/quantity';

export interface RecipeIngredientCreateProps {
  /** 商品マスタへの ID 参照。未連携時は null（集約間は ID 参照のみ）。 */
  productRef: ProductId | null;
  displayName: string;
  amount: Quantity | null;
  amountNote: string | null;
}

export class RecipeIngredient {
  private constructor(
    private readonly productReference: ProductId | null,
    private readonly ingredientDisplayName: string,
    private readonly ingredientAmount: Quantity | null,
    private readonly ingredientAmountNote: string | null,
  ) {}

  static create(props: RecipeIngredientCreateProps): RecipeIngredient {
    if (props.displayName.trim() === '') {
      throw new Error('Display name is required');
    }

    const hasAmount = props.amount !== null;
    const hasAmountNote = props.amountNote !== null && props.amountNote.trim() !== '';
    if (!hasAmount && !hasAmountNote) {
      throw new Error('Either amount or amountNote is required');
    }
    if (hasAmount === hasAmountNote) {
      throw new Error('amount and amountNote cannot both be set');
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
