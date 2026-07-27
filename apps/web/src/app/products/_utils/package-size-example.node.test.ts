import { UNIT_PRESETS } from '@cookpit/api-contract';
import { describe, expect, it } from 'vitest';
import { packageSizeExample } from './package-size-example';

describe('packageSizeExample', () => {
  it.each([
    ['g', '300g', 'PSE-01 小さい連続量'],
    ['ml', '300ml', 'PSE-02 小さい連続量'],
    ['kg', '1kg', 'PSE-03 大きい連続量'],
    ['l', '1l', 'PSE-04 大きい連続量'],
    ['個', '1個', 'PSE-05 可算単位は 1'],
    ['本', '1本', 'PSE-06 可算単位'],
    ['枚', '1枚', 'PSE-07 可算単位'],
    ['缶', '1缶', 'PSE-08 可算単位（プリセット末尾）'],
    ['大さじ', '1大さじ', 'PSE-09 計量単位'],
    ['cup', '1cup', 'PSE-10 計量単位'],
    ['合', '1合', 'PSE-11 計量単位'],
    ['杯', '1杯', 'PSE-12 未知単位は安全側の 1'],
    ['', '300g', 'PSE-13 空文字は既定例へ縮退'],
    ['   ', '300g', 'PSE-13 空白のみも既定例へ縮退'],
    [' 個 ', '1個', 'PSE-14 前後空白を除去してから判定'],
    ['ｇ', '300g', 'PSE-14 全角も NFKC で g として扱う'],
    ['G', '300G', 'PSE-14 大文字も 300 側に入れ、表示は原文の字形を保つ'],
    // 単位は自由記述なので、単位自体が数量を含む値が本番に実在する（例: 基本単位 = 1L）。
    // 数量を前置すると「11L」になるため、そのまま返す。
    ['1L', '1L', 'PSE-16 数字で始まる単位は前置しない'],
    ['500ml', '500ml', 'PSE-16 数字で始まる単位は前置しない'],
    ['１L', '1L', 'PSE-16 全角数字で始まる単位も NFKC 後に前置しない'],
    ['2本入り', '2本入り', 'PSE-16 数字で始まる自由記述'],
  ])('%j → %j (%s)', (unit, expected) => {
    expect(packageSizeExample(unit)).toBe(expected);
  });

  it('PSE-16: 数字で始まる単位に数量が二重に付かない', () => {
    for (const unit of ['1L', '500ml', '2袋', '0.5kg']) {
      expect(packageSizeExample(unit)).toBe(unit);
    }
  });

  it('PSE-15: プリセット単位のうち 300 が付くのは g / ml だけ', () => {
    const withLargeQuantity = UNIT_PRESETS.filter((unit) =>
      packageSizeExample(unit).startsWith('300'),
    );

    expect(withLargeQuantity).toEqual(['g', 'ml']);
  });

  it('PSE-15: プリセット単位のすべてが「数値 + その単位」の形になる', () => {
    for (const unit of UNIT_PRESETS) {
      expect(packageSizeExample(unit)).toMatch(new RegExp(`^(1|300)${unit}$`));
    }
  });
});
