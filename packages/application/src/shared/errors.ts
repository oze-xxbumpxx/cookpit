/**
 * 「エンティティが見つからない」系エラーの共通基底。
 * メッセージ書式は `${entityLabel} not found: ${id}` に固定する。
 * 具象クラスはエンティティ種別ごとに定義し、`instanceof` による HTTP 変換を可能にする。
 *
 * Presentation 層はこの基底 1 つで 404 へ変換する（具象クラスを個別に判定しない）。
 */
export abstract class NotFoundError extends Error {
  protected constructor(entityLabel: string, id: string) {
    super(`${entityLabel} not found: ${id}`);
    this.name = new.target.name;
  }
}

/**
 * 「要求は理解できるが、その対象に対しては実行できない操作」系エラーの共通基底。
 * メッセージ書式は具象クラスに委ねる。
 *
 * Presentation 層はこの基底 1 つで 422 へ変換する（具象クラスを個別に判定しない）。
 * 新しく 422 相当のエラーを追加するときは、必ずこの基底を継承させること
 * （継承しないエラーは 500 として扱われる）。
 */
export abstract class InvalidOperationError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * `InvalidOperationError` のうち、「集約の現在の状態が理由で実行できない」ものの基底。
 * メッセージ書式は `Cannot ${operation} a ${entityLabel} with status '${current}'` に固定する。
 */
export abstract class InvalidStateError extends InvalidOperationError {
  protected constructor(entityLabel: string, current: string, operation: string) {
    super(`Cannot ${operation} a ${entityLabel} with status '${current}'`);
  }
}
