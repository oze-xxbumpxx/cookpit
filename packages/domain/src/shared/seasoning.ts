// 調味料の名前判定。レシピ材料は商品マスタに紐付かない自由記述のため、材料名（displayName）の
// キーワード照合で「調味料か」を判定する。買い物リスト生成時に調味料を除外する用途で使う。
// 誤検出・取りこぼしは許容する設計（取りこぼしは手動追加で補える）。

/** 材料名を照合用に正規化する（NFKC + trim）。全角/半角・前後空白の表記ゆれを吸収する。 */
function normalizeName(name: string): string {
  return name.trim().normalize('NFKC');
}

/**
 * 短く曖昧で、他の食材名の一部になりやすい語。**完全一致**でのみ調味料とみなす。
 * 例: 「塩」は調味料だが「塩鮭」は食材、「酒」は調味料だが「甘酒」は飲料。
 */
const exactSeasonings: ReadonlySet<string> = new Set<string>([
  '塩',
  '酒',
  '酢',
  '油',
  'だし',
  '出汁',
  'こしょう',
  '胡椒',
  'コショウ',
]);

/**
 * 識別性が高く、他語の一部として現れても調味料である語。**部分一致**で調味料とみなす。
 * 例: 「醤油」は「薄口醤油」「濃口醤油」を、「味噌」は「赤味噌」を拾う。
 */
const substringSeasonings: readonly string[] = [
  '醤油',
  'しょうゆ',
  '味噌',
  'みそ',
  'みりん',
  '砂糖',
  '料理酒',
  '米酢',
  '穀物酢',
  'ぽん酢',
  'ポン酢',
  'ごま油',
  'サラダ油',
  'オリーブオイル',
  'オリーブ油',
  '塩こしょう',
  '塩コショウ',
  'マヨネーズ',
  'ケチャップ',
  'ソース',
  'オイスターソース',
  'めんつゆ',
  '白だし',
  'だしの素',
  'コンソメ',
  '鶏がらスープ',
  '鶏ガラスープ',
  '中華だし',
  '豆板醤',
  'コチュジャン',
  '甜麺醤',
  'ナンプラー',
  'ラー油',
  'はちみつ',
  '蜂蜜',
  'カレー粉',
  'わさび',
  'からし',
  'マスタード',
  '七味',
  '一味',
];

/**
 * 材料名が調味料を表すかを返す。買い物リスト生成での除外判定に使う。
 * 短く曖昧な語は完全一致、識別性の高い語は部分一致で照合する。
 */
export function isSeasoningName(name: string): boolean {
  const normalized = normalizeName(name);
  if (normalized === '') {
    return false;
  }
  if (exactSeasonings.has(normalized)) {
    return true;
  }
  return substringSeasonings.some((keyword) => normalized.includes(keyword));
}
