export class Money {
  private constructor(
    private readonly moneyAmount: number,
    private readonly moneyCurrency: string,
  ) {}

  static of(amount: number, currency: string): Money {
    if (amount < 0) {
      throw new Error('Money amount must be non-negative');
    }

    return new Money(amount, currency);
  }

  add(other: Money): Money {
    if (this.moneyCurrency !== other.moneyCurrency) {
      throw new Error('Cannot add different currencies');
    }

    return Money.of(this.moneyAmount + other.moneyAmount, this.moneyCurrency);
  }

  multiply(factor: number): Money {
    return Money.of(this.moneyAmount * factor, this.moneyCurrency);
  }

  isLessThan(other: Money): boolean {
    if (this.moneyCurrency !== other.moneyCurrency) {
      throw new Error('Cannot compare different currencies');
    }

    return this.moneyAmount < other.moneyAmount;
  }

  get amount(): number {
    return this.moneyAmount;
  }

  get currency(): string {
    return this.moneyCurrency;
  }
}
