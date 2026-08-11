import 'server-only';

import { getDb } from '@/db/client';
import {
  DrizzleMealPlanRepository,
  DrizzlePantryRepository,
  DrizzleProductRepository,
  DrizzlePushSubscriptionRepository,
  DrizzleRecipeRepository,
  DrizzleShoppingListRepository,
  DrizzleStoreRepository,
  WebPushSender,
} from '@cookpit/infrastructure';

export function recipeRepository(): DrizzleRecipeRepository {
  return new DrizzleRecipeRepository(getDb());
}

export function productRepository(): DrizzleProductRepository {
  return new DrizzleProductRepository(getDb());
}

export function storeRepository(): DrizzleStoreRepository {
  return new DrizzleStoreRepository(getDb());
}

export function mealPlanRepository(): DrizzleMealPlanRepository {
  return new DrizzleMealPlanRepository(getDb());
}

export function shoppingListRepository(): DrizzleShoppingListRepository {
  return new DrizzleShoppingListRepository(getDb());
}

export function pantryRepository(): DrizzlePantryRepository {
  return new DrizzlePantryRepository(getDb());
}

export function pushSubscriptionRepository(): DrizzlePushSubscriptionRepository {
  return new DrizzlePushSubscriptionRepository(getDb());
}

/**
 * VAPID 環境変数 3 点を検証する。1 つでも未設定・空文字なら null を返す。
 *
 * 要件 E-7 / 確定 P-12「全エンドポイントで 500 フェイルクローズに揃える」の実装。
 * `?? ''` で空文字を渡すと `setVapidDetails` の throw に依存した「偶然の 500」になり、
 * 要件 E-2 の「明示的にガードする」と矛盾する。さらに `app.onError` 経由の
 * `Internal Server Error` になるため、設定不備と実行時障害をログで切り分けられない。
 */
export function readVapidConfig(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (
    publicKey === undefined ||
    publicKey === '' ||
    privateKey === undefined ||
    privateKey === '' ||
    subject === undefined ||
    subject === ''
  ) {
    return null;
  }
  return { publicKey, privateKey, subject };
}

/** 検証済みの VAPID 設定だけを受け取る。`?? ''` によるフォールバックは置かない。 */
export function pushSender(vapid: {
  publicKey: string;
  privateKey: string;
  subject: string;
}): WebPushSender {
  return new WebPushSender(vapid.publicKey, vapid.privateKey, vapid.subject);
}
