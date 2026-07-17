/**
 * 「エンティティが見つからない」系エラーの共通基底。
 * メッセージ書式は `${entityLabel} not found: ${id}` に固定する。
 * 具象クラスはエンティティ種別ごとに定義し、`instanceof` による HTTP 変換を可能にする。
 */
export abstract class NotFoundError extends Error {
  protected constructor(entityLabel: string, id: string) {
    super(`${entityLabel} not found: ${id}`);
    this.name = new.target.name;
  }
}

/**
 * 「その状態では実行できない操作」系エラーの共通基底。
 * メッセージ書式は `Cannot ${operation} a ${entityLabel} with status '${current}'` に固定する。
 */
export abstract class InvalidStateError extends Error {
  protected constructor(entityLabel: string, current: string, operation: string) {
    super(`Cannot ${operation} a ${entityLabel} with status '${current}'`);
    this.name = new.target.name;
  }
}
