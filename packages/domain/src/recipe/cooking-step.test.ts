import { describe, expect, it } from 'vitest';
import { CookingStep } from './cooking-step';

describe('CookingStep', () => {
  it('有効な説明でステップを生成できる (CS1)', () => {
    const step = new CookingStep('玉ねぎを薄切りにする');
    expect(step.description).toBe('玉ねぎを薄切りにする');
  });

  it('空文字は拒否する (CS2)', () => {
    expect(() => new CookingStep('')).toThrow('Description is required');
  });

  it('空白のみは拒否する (CS3)', () => {
    expect(() => new CookingStep('   ')).toThrow('Description is required');
  });

  it('前後に空白があっても有効な説明ならインスタンスを生成できる (CS4)', () => {
    const step = new CookingStep('  強火で炒める  ');
    expect(step.description).toBe('  強火で炒める  ');
  });
});
