import type { RecipeFormValue } from '@/app/recipes/_components/recipe-form-fields';

export interface RecipeFormSnapshot {
  value: RecipeFormValue;
  /** new は入力中の文字列、edit は変更不可なので初期値と同じ文字列を渡す。 */
  baseServings: string;
}

interface NormalizedSnapshot {
  name: string;
  tags: string[];
  cookingTime: string;
  baseServings: string;
  ingredients: { displayName: string; amountText: string }[];
  steps: { description: string }[];
}

/**
 * 比較用に正規化する。行の `id` は落とす — これにより「材料を追加ボタンを押しただけ
 * （空行が 1 行増える）」は変更と見なされず、並べ替え（配列順の変化）は変更と見なされる。
 * タグは選択順の差を無視するためソートする。
 */
function normalize(snapshot: RecipeFormSnapshot): NormalizedSnapshot {
  const { value } = snapshot;
  return {
    name: value.name.trim(),
    tags: [...value.tags].sort(),
    cookingTime: value.cookingTime.trim(),
    baseServings: snapshot.baseServings.trim(),
    ingredients: value.ingredients
      .map((row) => ({
        displayName: row.displayName.trim(),
        amountText: row.amountText.trim(),
      }))
      .filter((row) => row.displayName !== '' || row.amountText !== ''),
    steps: value.steps
      .map((row) => ({ description: row.description.trim() }))
      .filter((row) => row.description !== ''),
  };
}

/**
 * 未保存の変更があるか。空行の追加・前後の空白・タグの選択順の差は変更と見なさない。
 * 材料の並べ替えは配列順が変わるため変更と見なす。
 */
export function isRecipeFormDirty(
  initial: RecipeFormSnapshot,
  current: RecipeFormSnapshot,
): boolean {
  return JSON.stringify(normalize(initial)) !== JSON.stringify(normalize(current));
}
