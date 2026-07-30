import { describe, expect, it } from 'vitest';
import { isSeasoningName } from '../../src/shared/seasoning';

describe('isSeasoningName', () => {
  const exact = ['塩', '酒', '酢', '油', 'だし', '出汁', 'こしょう', '胡椒'];
  const substring = [
    '醤油',
    '薄口醤油',
    '濃口醤油',
    'しょうゆ',
    '味噌',
    '赤味噌',
    'みそ',
    'みりん',
    '本みりん',
    '砂糖',
    '料理酒',
    'ごま油',
    'サラダ油',
    'オリーブオイル',
    'マヨネーズ',
    'ケチャップ',
    'オイスターソース',
    'めんつゆ',
    'はちみつ',
  ];
  const notSeasonings = ['塩鮭', '甘酒', '油揚げ', '玉ねぎ', '鶏むね肉', '卵', 'じゃがいも', ''];

  it.each(exact)('完全一致語 %s は調味料', (name) => {
    expect(isSeasoningName(name)).toBe(true);
  });

  it.each(substring)('部分一致語を含む %s は調味料', (name) => {
    expect(isSeasoningName(name)).toBe(true);
  });

  it.each(notSeasonings)('%s は調味料ではない（誤検出しない）', (name) => {
    expect(isSeasoningName(name)).toBe(false);
  });

  it('前後空白・全角を正規化して判定する', () => {
    expect(isSeasoningName('  醤油  ')).toBe(true);
    expect(isSeasoningName('塩')).toBe(true);
    expect(isSeasoningName(' 塩 ')).toBe(true);
  });
});
