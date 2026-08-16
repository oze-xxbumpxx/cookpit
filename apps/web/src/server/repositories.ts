import 'server-only';

import { getDb, getTxDb } from '@/db/client';
import {
  DrizzleMealPlanRepository,
  DrizzlePantryRepository,
  DrizzleProductRepository,
  DrizzlePushSubscriptionRepository,
  DrizzleRecipeRepository,
  DrizzleShoppingListRepository,
  DrizzleStoreRepository,
  DrizzleUnitOfWork,
  WebPushSender,
} from '@cookpit/infrastructure';

export interface WriteContext {
  uow: DrizzleUnitOfWork;
  recipe: DrizzleRecipeRepository;
  product: DrizzleProductRepository;
  store: DrizzleStoreRepository;
  mealPlan: DrizzleMealPlanRepository;
  shoppingList: DrizzleShoppingListRepository;
  pantry: DrizzlePantryRepository;
  pushSubscription: DrizzlePushSubscriptionRepository;
}

/**
 * 書き込みトランザクションのキルスイッチ。`DB_WRITE_TRANSACTION=on` のときだけ有効。
 *
 * **既定は無効**（フェイルセーフ）。2026-08-13 に WebSocket 接続の失敗で全画面が落ちた際、
 * 復旧にコード変更とロールバック PR（#168）が要った。環境変数にしておけば再デプロイだけで
 * 戻せる。有効化は Preview で書き込みを一巡させてから（レビュー H-01）。
 */
function isWriteTransactionEnabled(): boolean {
  return process.env.DB_WRITE_TRANSACTION === 'on';
}

/**
 * 読み取り経路の UoW。`execute` を呼ばないので常に自動コミットで、
 * WebSocket 接続を張ることはない。
 */
function createReadUnitOfWork(): DrizzleUnitOfWork {
  return new DrizzleUnitOfWork(getDb(), { useTransaction: false });
}

/**
 * 書き込み経路の UoW。キルスイッチが有効なときだけ、トランザクションを
 * WebSocket 接続（`getTxDb`）の上で開く。読み取りは neon-http のまま
 * （設計書「トランザクション再導入の設計案」案 S）。
 */
function createWriteUnitOfWork(): DrizzleUnitOfWork {
  const enabled = isWriteTransactionEnabled();
  return new DrizzleUnitOfWork(getDb(), {
    useTransaction: enabled,
    createTxClient: enabled ? getTxDb : null,
  });
}

/** 書き込み UseCase 用。1 リクエスト = 1 UoW。配下の Repository は皆同じ client を見る。 */
export function createWriteContext(): WriteContext {
  const uow = createWriteUnitOfWork();
  return {
    uow,
    recipe: new DrizzleRecipeRepository(uow),
    product: new DrizzleProductRepository(uow),
    store: new DrizzleStoreRepository(uow),
    mealPlan: new DrizzleMealPlanRepository(uow),
    shoppingList: new DrizzleShoppingListRepository(uow),
    pantry: new DrizzlePantryRepository(uow),
    pushSubscription: new DrizzlePushSubscriptionRepository(uow),
  };
}

function readUow(): DrizzleUnitOfWork {
  return createReadUnitOfWork();
}

export function recipeRepository(): DrizzleRecipeRepository {
  return new DrizzleRecipeRepository(readUow());
}

export function productRepository(): DrizzleProductRepository {
  return new DrizzleProductRepository(readUow());
}

export function storeRepository(): DrizzleStoreRepository {
  return new DrizzleStoreRepository(readUow());
}

export function mealPlanRepository(): DrizzleMealPlanRepository {
  return new DrizzleMealPlanRepository(readUow());
}

export function shoppingListRepository(): DrizzleShoppingListRepository {
  return new DrizzleShoppingListRepository(readUow());
}

export function pantryRepository(): DrizzlePantryRepository {
  return new DrizzlePantryRepository(readUow());
}

export function pushSubscriptionRepository(): DrizzlePushSubscriptionRepository {
  return new DrizzlePushSubscriptionRepository(readUow());
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
