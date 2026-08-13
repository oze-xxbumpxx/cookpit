import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

const DB_NAME = 'cookpit-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'checkedOps';

/** オフラインキューの 1 エントリ（設計書 P-7）。 */
export interface QueuedCheckedOp {
  /** `${shoppingListId}:${itemId}`。IndexedDB のキー兼 coalesce の単位（P-1/P-7）。 */
  key: string;
  shoppingListId: string;
  itemId: string;
  checked: boolean;
  /** enqueue した時刻（epoch ms）。TTL 判定に使う（P-7）。 */
  enqueuedAt: number;
  /** 送信を試みた回数。上限判定に使う（P-3/P-7）。 */
  attempts: number;
}

interface CheckedOpsSchema extends DBSchema {
  checkedOps: {
    key: string;
    value: QueuedCheckedOp;
  };
}

/**
 * `indexedDB` が未宣言のグローバルである環境（happy-dom にポリフィルが無い場合、Safari の
 * プライベートブラウジング等）を、E-06「キューが使えない」と同じ扱いにする
 * （Orchestrator 確定要求 1(a)）。`idb` の内部コードを一切呼ばずに済ませることで、
 * `idb` が参照する他の IDB* グローバル（IDBRequest 等）の有無に関わらず安全に短絡する。
 */
function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openQueueDb(): Promise<IDBPDatabase<CheckedOpsSchema>> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new Error('indexedDB is not available in this environment'));
  }
  return openDB<CheckedOpsSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore(STORE_NAME, { keyPath: 'key' });
    },
  });
}

/**
 * 呼び出しのたびに接続を開いて閉じる（モジュールスコープでキャッシュしない）。
 * 想定件数が小規模（十数件以下）なため、オープンのオーバーヘッドより
 * テスト時の接続分離（fake-indexeddb のファクトリ差し替え）のしやすさを優先する。
 */
export async function enqueueCheckedOp(
  op: Omit<QueuedCheckedOp, 'enqueuedAt' | 'attempts'>,
): Promise<void> {
  const db = await openQueueDb();
  try {
    await db.put(STORE_NAME, { ...op, enqueuedAt: Date.now(), attempts: 0 });
  } finally {
    db.close();
  }
}

export async function listCheckedOps(): Promise<QueuedCheckedOp[]> {
  const db = await openQueueDb();
  try {
    return await db.getAll(STORE_NAME);
  } finally {
    db.close();
  }
}

export async function deleteCheckedOp(key: string): Promise<void> {
  const db = await openQueueDb();
  try {
    await db.delete(STORE_NAME, key);
  } finally {
    db.close();
  }
}

/** 対象キーが存在しない場合は何もしない（削除済み・破棄済みの二重呼び出しを許容）。 */
export async function bumpAttempts(key: string): Promise<void> {
  const db = await openQueueDb();
  try {
    const existing = await db.get(STORE_NAME, key);
    if (existing !== undefined) {
      await db.put(STORE_NAME, { ...existing, attempts: existing.attempts + 1 });
    }
  } finally {
    db.close();
  }
}
