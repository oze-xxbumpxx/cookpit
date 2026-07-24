// 数量と単位を 1 つの入力欄にまとめるためのパース（要望2）。
// 「3個」「300g」のように入力された文字列を、先頭の数値と残りの単位に分解する。

export type ParsedQuantity =
  | { kind: 'amount'; value: number; unit: string } // 先頭が数値かつ単位あり（例: 3個 / 300g）
  | { kind: 'valueOnly'; value: number } // 数値のみで単位なし（例: 3）
  | { kind: 'note'; note: string } // 数値で始まらない自由記述（例: 少々 / 大さじ2）
  | { kind: 'empty' }; // 空

// 先頭の数値部分。分数（1/2）を小数（0.5）より前に試し、"1/2" が "1" と "/2" に割れないようにする。
const LEADING_NUMBER = /^(\d+\/\d+|\d+(?:\.\d+)?)\s*(.*)$/;

function parseLeadingNumber(text: string): number | null {
  if (text.includes('/')) {
    const [numeratorText, denominatorText] = text.split('/');
    const numerator = Number(numeratorText);
    const denominator = Number(denominatorText);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
      return null;
    }
    return numerator / denominator;
  }
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * 数量入力（数値＋単位を 1 欄にまとめたもの）を分解する。
 * NFKC 正規化で全角数字・全角単位（例: `３個`）を吸収する。負の数値は自由記述（note）として扱う。
 */
export function parseQuantity(input: string): ParsedQuantity {
  const normalized = input.normalize('NFKC').trim();
  if (normalized === '') {
    return { kind: 'empty' };
  }

  const match = LEADING_NUMBER.exec(normalized);
  if (match === null) {
    return { kind: 'note', note: normalized };
  }

  const value = parseLeadingNumber(match[1]);
  if (value === null || value < 0) {
    return { kind: 'note', note: normalized };
  }

  const unit = match[2].trim();
  if (unit === '') {
    return { kind: 'valueOnly', value };
  }
  return { kind: 'amount', value, unit };
}
