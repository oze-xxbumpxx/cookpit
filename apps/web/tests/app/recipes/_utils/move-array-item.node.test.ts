import { describe, expect, it } from 'vitest';
import { moveArrayItem } from '../../../../src/app/recipes/_utils/move-array-item';

describe('moveArrayItem', () => {
  it('MAI-01: 先頭を末尾へ移動する', () => {
    expect(moveArrayItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('MAI-02: 末尾を先頭へ移動する', () => {
    expect(moveArrayItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('MAI-03: 隣接する要素を入れ替える', () => {
    expect(moveArrayItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveArrayItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
  });

  it('MAI-04: from === to では内容が変わらない', () => {
    expect(moveArrayItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('MAI-05: 範囲外の index では内容が変わらない', () => {
    expect(moveArrayItem(['a', 'b', 'c'], -1, 1)).toEqual(['a', 'b', 'c']);
    expect(moveArrayItem(['a', 'b', 'c'], 3, 1)).toEqual(['a', 'b', 'c']);
    expect(moveArrayItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveArrayItem(['a', 'b', 'c'], 0, 3)).toEqual(['a', 'b', 'c']);
  });

  it('MAI-06: 要素 1 個・空配列でも例外を投げない', () => {
    expect(moveArrayItem(['a'], 0, 0)).toEqual(['a']);
    expect(moveArrayItem([], 0, 0)).toEqual([]);
  });

  it('MAI-07: 元の配列を破壊しない', () => {
    const original = ['a', 'b', 'c'];

    const result = moveArrayItem(original, 0, 2);

    expect(original).toEqual(['a', 'b', 'c']);
    expect(result).not.toBe(original);
  });
});
