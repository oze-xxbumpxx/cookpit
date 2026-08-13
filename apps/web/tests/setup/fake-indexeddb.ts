import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach } from 'vitest';

/**
 * happy-dom は IndexedDB を実装していない（実測済み。window.indexedDB / IDBKeyRange が
 * undefined）。useCheckedSyncQueue はマウント時に無条件で flush()（= IndexedDB オープン）を
 * 試みるため、このポリフィルが無いと本機能と無関係な既存の shopping-list 系 dom テストまで
 * 巻き添えになりうる（`idb` パッケージが IDBRequest/IDBTransaction 等の複数のグローバルを
 * 参照するため）。`checked-sync-queue.ts` 側の `typeof indexedDB` ガード（コード側の防御。
 * E-06 相当）と合わせた二重の防御として、dom project 全体に導入する
 * （実装計画 docs/implementation-plans/offline-write-queue.md の
 * 「happy-dom の IndexedDB 未実装への対応方針」参照）。
 *
 * テストごとにファクトリを差し替え、キューの内容が前のテストから漏れないようにする
 * （fake-indexeddb はプロセス内でグローバルに状態を保持するため）。
 */
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
