export class CookingStep {
  public constructor(public readonly description: string) {
    if (description.trim() === '') {
      throw new Error('Description is required');
    }
  }
}
