import { describe, expect, it } from 'vitest';
import { RecipeId } from './recipe-id';

describe('RecipeId', () => {
  it('generate は毎回異なる UUID を生成する (ID1)', () => {
    const a = RecipeId.generate();
    const b = RecipeId.generate();
    expect(a.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.equals(b)).toBe(false);
  });

  it('generate は UUID v4 フォーマットを生成する (ID-GAP-1)', () => {
    const id = RecipeId.generate();
    expect(id.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('fromString は値を保持する (ID2)', () => {
    expect(RecipeId.fromString('abc').value).toBe('abc');
  });

  it('同じ値どうしは equals が true (ID3)', () => {
    expect(RecipeId.fromString('abc').equals(RecipeId.fromString('abc'))).toBe(true);
  });

  it('異なる値どうしは equals が false (ID4)', () => {
    expect(RecipeId.fromString('abc').equals(RecipeId.fromString('xyz'))).toBe(false);
  });
});
