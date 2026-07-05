export class WeekIdentifier {
  private constructor(private readonly weekStartDate: Date) {}

  static fromDate(date: Date): WeekIdentifier {
    const startDate = new Date(date);
    const daysFromSaturday = (startDate.getDay() + 1) % 7;
    startDate.setDate(startDate.getDate() - daysFromSaturday);
    startDate.setHours(0, 0, 0, 0);

    return new WeekIdentifier(startDate);
  }

  static current(): WeekIdentifier {
    return WeekIdentifier.fromDate(new Date());
  }

  static fromString(value: string): WeekIdentifier {
    // 非土曜の入力（ユーザー指定週など）も直前の土曜へスナップし、週開始日 = 土曜の不変条件を保つ
    return WeekIdentifier.fromDate(new Date(value + 'T00:00:00'));
  }

  startDate(): Date {
    return new Date(this.weekStartDate);
  }

  endDate(): Date {
    const endDate = this.startDate();
    endDate.setDate(endDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    return endDate;
  }

  next(): WeekIdentifier {
    const nextDate = this.startDate();
    nextDate.setDate(nextDate.getDate() + 7);

    return new WeekIdentifier(nextDate);
  }

  previous(): WeekIdentifier {
    const previousDate = this.startDate();
    previousDate.setDate(previousDate.getDate() - 7);

    return new WeekIdentifier(previousDate);
  }

  equals(other: WeekIdentifier): boolean {
    return this.startDate().getTime() === other.startDate().getTime();
  }

  toString(): string {
    const startDate = this.startDate();
    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const date = String(startDate.getDate()).padStart(2, '0');

    return `${year}-${month}-${date}`;
  }
}
