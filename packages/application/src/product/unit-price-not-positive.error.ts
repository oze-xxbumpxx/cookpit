import { InvalidOperationError } from '../shared/errors';

/**
 * 価格と内容量の組み合わせから計算した単価が、丸めの結果 0 以下になったときのエラー。
 * `InvalidOperationError` を継承しているため HTTP では 422 になる。
 *
 * 単価は `UnitPriceCalculator` が小数第 1 位へ丸める（正準値は重量 100g・容量 100ml・
 * その他は 1 単位あたり）。内容量が価格に対して極端に大きいと丸めで 0 になり、
 * `PriceRecord.create()` の「単価は正数」という不変条件を満たせない。
 * その状態を素の `Error` のまま通すと 500 になるため、UseCase 入口で本エラーへ変換する。
 *
 * 入力自体の範囲検証（DB 精度の上限）は `api-contract` の Zod スキーマが担う。
 * 本エラーは「上限内でも成立しない組み合わせ」を受け持つ。
 */
export class UnitPriceNotPositiveError extends InvalidOperationError {
  constructor(
    readonly priceAmount: number,
    readonly packageSizeValue: number,
    readonly packageSizeUnit: string,
  ) {
    super(
      `Unit price rounds to zero for price ${priceAmount} and package size ` +
        `${packageSizeValue}${packageSizeUnit}`,
    );
  }
}
