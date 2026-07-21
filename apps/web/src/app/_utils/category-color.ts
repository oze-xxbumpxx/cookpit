// 料理カテゴリ/レシピタグのチップ配色（中央集約）。
// 色はここだけに置き、画面側へ散らさない（#2 の red 直書き解消と同じ方針）。
// 温かいテーマに馴染むよう彩度を抑えた食材連想色。text/bg は AA（>=4.5:1）準拠。

const CHIP = {
  rose: 'bg-[#F3E2DC] text-[#9A4A34]', // 肉・主菜
  olive: 'bg-[#E7EEDD] text-[#556B33]', // 野菜・副菜
  teal: 'bg-[#DFEAEA] text-[#3E6668]', // 魚・汁物
  amber: 'bg-[#F4E8D2] text-[#785A1E]', // 調味料・作り置き向き
  blue: 'bg-[#E2E8F1] text-[#41597A]', // 冷凍・冷凍可
  brown: 'bg-[#ECE1CE] text-[#6E5636]', // 乾物
  neutral: 'bg-secondary text-secondary-foreground', // その他・未知
} as const;

const RECIPE_TAG_CHIP: Record<string, string> = {
  主菜: CHIP.rose,
  副菜: CHIP.olive,
  汁物: CHIP.teal,
  作り置き向き: CHIP.amber,
  冷凍可: CHIP.blue,
};

const PRODUCT_CATEGORY_CHIP: Record<string, string> = {
  野菜: CHIP.olive,
  肉: CHIP.rose,
  魚: CHIP.teal,
  調味料: CHIP.amber,
  乾物: CHIP.brown,
  冷凍: CHIP.blue,
  その他: CHIP.neutral,
};

/** レシピタグのチップ配色クラスを返す（未知タグは neutral）。 */
export function recipeTagChipClass(tag: string): string {
  return RECIPE_TAG_CHIP[tag] ?? CHIP.neutral;
}

/** 商品カテゴリのチップ配色クラスを返す（未知カテゴリは neutral）。 */
export function productCategoryChipClass(category: string): string {
  return PRODUCT_CATEGORY_CHIP[category] ?? CHIP.neutral;
}
