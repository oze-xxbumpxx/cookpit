import type { UnitOfWork } from '@cookpit/domain';

/** Application テスト用。トランザクションを張らず work をそのまま実行する。 */
export const passthroughUnitOfWork: UnitOfWork = {
  execute<T>(work: () => Promise<T>): Promise<T> {
    return work();
  },
};
