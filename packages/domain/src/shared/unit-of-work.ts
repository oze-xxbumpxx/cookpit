/**
 * 1 つの書き込みユースケースを原子的に実行するためのポート。
 * 実装は Infrastructure（Drizzle の transaction）が持つ。Domain は BEGIN/COMMIT を知らない。
 *
 * ネストした execute はサポートしない。UseCase が別 UseCase を呼ばない現状の構成が前提。
 */
export interface UnitOfWork {
  execute<T>(work: () => Promise<T>): Promise<T>;
}
