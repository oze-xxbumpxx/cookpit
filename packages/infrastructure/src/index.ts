/**
 * `@cookpit/infrastructure` の公開境界（ADR-0010）。
 * 消費側は `@cookpit/infrastructure/src/...` ではなくこのバレル経由で import する。
 */
export * from './db/schema';
export * from './db/client';

/**
 * Drizzle の `drizzle(client, { schema })` に渡すためのテーブル定義名前空間。
 * バレル全体（Repository クラス等を含む）を渡さずに済むよう、schema だけを名前付きで公開する。
 */
export * as schema from './db/schema';

export * from './repositories/drizzle-recipe.repository';
export * from './repositories/drizzle-product.repository';
export * from './repositories/drizzle-store.repository';
export * from './repositories/drizzle-meal-plan.repository';
export * from './repositories/drizzle-shopping-list.repository';
export * from './repositories/drizzle-pantry.repository';
export * from './repositories/drizzle-push-subscription.repository';
export * from './notification/web-push-sender';
