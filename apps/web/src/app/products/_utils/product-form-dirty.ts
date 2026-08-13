import type { ProductFormValue } from '@/app/products/_components/product-form-fields';

interface NormalizedSnapshot {
  name: string;
  aliases: string[];
  category: ProductFormValue['category'];
  defaultUnit: ProductFormValue['defaultUnit'];
}

/**
 * 比較用に正規化する。別名は送信と同じ split / trim / 空除去なので、
 * カンマ周りの空白差は変更と見なさない。並び順の差は送信配列が変わるため変更と見なす。
 */
function normalize(value: ProductFormValue): NormalizedSnapshot {
  return {
    name: value.name.trim(),
    aliases: value.aliasesText
      .split(',')
      .map((alias) => alias.trim())
      .filter((alias) => alias !== ''),
    category: value.category,
    defaultUnit: value.defaultUnit,
  };
}

/**
 * 未保存の変更があるか。前後の空白と余分なカンマだけの差は変更と見なさない。
 */
export function isProductFormDirty(initial: ProductFormValue, current: ProductFormValue): boolean {
  return JSON.stringify(normalize(initial)) !== JSON.stringify(normalize(current));
}
