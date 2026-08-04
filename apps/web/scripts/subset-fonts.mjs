// Zen Maru Gothic の日本語フォントを「サブセット化 + unicode-range 分割」して生成する
// （設計書 store-limit-and-render-performance §性能）。
//
// Fontsource の japanese サブセットは 1 ウェイト約 1.4MB あり、400/500/700 の 3 本で
// 4.40MB に達していた。他アセット合計（JS+CSS 約 320KB）の 12 倍で、描画後の大規模な
// 再レイアウト（FOUT）の主因になっていた。
//
// JIS X 0208 第一水準漢字 + 仮名 + 英数記号へサブセット化し、4.40MB → 約1.9MB（-55%）にする。
//
// unicode-range 分割（Google Fonts の日本語方式）も試したが**採らなかった**。実測すると
// 実際の画面テキストで 16 スライス全部に到達し、転送量が単一サブセットと同じまま CSS だけ
// 73KB 増えた。あの方式が効くのはグリフを**頻度順**に並べ、上位スライスだけで実文が賄える
// ようにしているからで、JIS（読み）順に並べたスライスでは漢字がコードポイント全域へ散る。
// 信頼できる頻度表を持ち込めないため、単純なサブセット 1 本に留める。
//
// 実行: node apps/web/scripts/subset-fonts.mjs
//
// 生成物（src/fonts/*.woff2 と src/app/fonts.css）はリポジトリにコミットする。ビルド手順を
// 増やさず、Vercel のビルドを決定的に保つため。フォントを差し替えるときだけ手で再実行する。
// woff2 を src/ 側に置くのは、webpack にハッシュ付きで /_next/static/media へ出させて
// immutable キャッシュを効かせるため（public/ 配下は既定で must-revalidate になる）。
//
// fonttools / pyftsubset を使わないのは、システム Python が 3.9 で fonttools も brotli も
// 未インストールのため。subset-font は harfbuzz の WASM を同梱しており Python 不要。

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webDir = join(scriptDir, '..');
const sourceDir = join(webDir, 'node_modules/@fontsource/zen-maru-gothic/files');
const fontOutputDir = join(webDir, 'src/fonts');
const cssOutputPath = join(webDir, 'src/app/fonts.css');

const WEIGHTS = [400, 500, 700];

/** 第一水準漢字の字数。JIS X 0208 の規格値。生成数がこれと一致しなければ変換式が壊れている。 */
const JIS_LEVEL1_COUNT = 2965;

/**
 * 区点コード（区, 点）を Shift_JIS の 2 バイトへ変換する。
 * JIS X 0208 の標準的な対応式。
 */
function kutenToShiftJis(ku, ten) {
  const first = ku <= 62 ? Math.floor((ku + 257) / 2) : Math.floor((ku + 385) / 2);
  const second = ku % 2 === 1 ? (ten <= 63 ? ten + 63 : ten + 64) : ten + 158;
  return [first, second];
}

/**
 * JIS X 0208 第一水準漢字（16〜47 区）を機械的に生成する。
 *
 * 2965 字を手打ちすると取りこぼしを検証できないため、区点 → Shift_JIS → Unicode の
 * 変換で網羅性を構造的に保証する。Node 20+ は full ICU を同梱するので
 * TextDecoder('shift_jis') が使える。
 */
function buildJisLevel1Kanji() {
  const decoder = new TextDecoder('shift_jis', { fatal: false });
  const characters = [];

  for (let ku = 16; ku <= 47; ku += 1) {
    for (let ten = 1; ten <= 94; ten += 1) {
      const bytes = Uint8Array.from(kutenToShiftJis(ku, ten));
      const decoded = decoder.decode(bytes);
      // 未定義区点は置換文字になる。1 文字にならないものも除外する。
      if (decoded.length === 1 && decoded !== '�') {
        characters.push(decoded);
      }
    }
  }

  return characters;
}

/**
 * 変換式が正しいことを既知の対応で自己検証する（誤った式で静かに欠落させないため）。
 * 第一水準の先頭（亜）と末尾（腕）を境界として押さえる。
 */
function assertConversion() {
  const expectations = [
    [16, 1, '亜', 0x88, 0x9f],
    [16, 2, '唖', 0x88, 0xa0],
    [47, 51, '腕', 0x98, 0x72],
  ];

  for (const [ku, ten, expectedChar, expectedFirst, expectedSecond] of expectations) {
    const [first, second] = kutenToShiftJis(ku, ten);
    if (first !== expectedFirst || second !== expectedSecond) {
      throw new Error(
        `区点 ${ku}-${ten} の Shift_JIS 変換が不正: ` +
          `0x${first.toString(16)}${second.toString(16)} ` +
          `(期待 0x${expectedFirst.toString(16)}${expectedSecond.toString(16)})`,
      );
    }
    const decoded = new TextDecoder('shift_jis').decode(Uint8Array.from([first, second]));
    if (decoded !== expectedChar) {
      throw new Error(`区点 ${ku}-${ten} が ${expectedChar} に復号されない: ${decoded}`);
    }
  }
}

/** 漢字以外に含める文字（英数記号・仮名・句読点・全角半角形）。 */
function buildBaseCharacters() {
  const ranges = [
    [0x0020, 0x007e], // ASCII（英数・記号）
    [0x00a0, 0x00ff], // Latin-1 補助（± 度記号など）
    [0x2010, 0x201f], // ダッシュ・引用符
    [0x2020, 0x203b], // 各種記号（※ など）
    [0x2190, 0x2193], // 矢印
    [0x25a0, 0x25ff], // 幾何学模様（■ ● ▲ など）
    [0x3000, 0x303f], // CJK 記号・句読点（、。「」〜 など）
    [0x3040, 0x309f], // ひらがな
    [0x30a0, 0x30ff], // カタカナ
    [0x33a0, 0x33ff], // 単位記号（㎏ ㎜ など）
    [0xff00, 0xffef], // 全角半角形
  ];

  const characters = [];
  for (const [start, end] of ranges) {
    for (let code = start; code <= end; code += 1) {
      characters.push(String.fromCodePoint(code));
    }
  }
  return characters;
}

/** サブセットへ含める全文字（漢字以外 + 第一水準漢字）。 */
function buildTargetCharacters() {
  const kanji = buildJisLevel1Kanji();
  if (kanji.length !== JIS_LEVEL1_COUNT) {
    throw new Error(
      `第一水準漢字の生成数が規格値と一致しない: ${kanji.length}（期待 ${JIS_LEVEL1_COUNT}）`,
    );
  }

  return [...buildBaseCharacters(), ...kanji];
}

function buildCss(entries) {
  const header = [
    '/*',
    ' * 生成物。手で編集しないこと（apps/web/scripts/subset-fonts.mjs が生成する）。',
    ' *',
    ' * Zen Maru Gothic を JIS X 0208 第一水準漢字 + 仮名 + 英数記号へサブセット化したもの。',
    ' * Fontsource の japanese サブセット（1 ウェイト約 1.4MB）を置き換える。',
    ' */',
    '',
  ].join('\n');

  const faces = entries.map(({ weight, file }) =>
    [
      '@font-face {',
      "  font-family: 'Zen Maru Gothic';",
      '  font-style: normal;',
      '  font-display: swap;',
      `  font-weight: ${weight};`,
      `  src: url('../fonts/${file}') format('woff2');`,
      '}',
    ].join('\n'),
  );

  return `${header}${faces.join('\n\n')}\n`;
}

async function main() {
  assertConversion();

  const targetCharacters = buildTargetCharacters();
  console.log(`対象文字数: ${targetCharacters.length}（うち第一水準漢字 ${JIS_LEVEL1_COUNT}）`);

  // 前回の生成物を消してから作り直す。命名を変えたときに古いファイルが残らないように。
  await rm(fontOutputDir, { recursive: true, force: true });
  await mkdir(fontOutputDir, { recursive: true });

  const targetText = targetCharacters.join('');
  const entries = [];
  let sourceTotal = 0;
  let outputTotal = 0;

  for (const weight of WEIGHTS) {
    const sourcePath = join(sourceDir, `zen-maru-gothic-japanese-${weight}-normal.woff2`);
    const source = await readFile(sourcePath);
    const subset = await subsetFont(source, targetText, { targetFormat: 'woff2' });

    const file = `zen-maru-gothic-subset-${weight}.woff2`;
    await writeFile(join(fontOutputDir, file), subset);
    entries.push({ weight, file });

    sourceTotal += source.byteLength;
    outputTotal += subset.byteLength;
    console.log(
      `${weight}: ${(source.byteLength / 1024 / 1024).toFixed(2)}MB → ` +
        `${(subset.byteLength / 1024).toFixed(0)}KB`,
    );
  }

  await writeFile(cssOutputPath, buildCss(entries));

  const reduction = ((1 - outputTotal / sourceTotal) * 100).toFixed(1);
  console.log(
    `合計: ${(sourceTotal / 1024 / 1024).toFixed(2)}MB → ` +
      `${(outputTotal / 1024 / 1024).toFixed(2)}MB（-${reduction}%）`,
  );
  console.log(`CSS: ${cssOutputPath}`);
}

await main();
