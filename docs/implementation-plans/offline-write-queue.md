# 実装計画: offline-write-queue

- 前提となる設計書: `docs/designs/offline-write-queue.md`
  （ヘッダーは `ステータス: draft` のままだが、P-1〜P-9 の全論点は Orchestrator/ユーザーにより
  確定済み。本計画は「先に必ず読むもの」で示された確定事項に基づく。設計書のステータス欄の
  更新は本計画のスコープ外だが、Orchestrator へ整合を申し送る）。
- 関連要件書: `docs/requirements/offline-write-queue.md`
- レベル: L3
- 実装ルート: Orchestrator（implementer）
- 判断理由: Presentation 層のみに閉じるが、新規 IndexedDB モジュール・新規 React フック・
  `useEffect` のタイミング制御（`online`/`focus`/マウント）・`useOptimistic` との相互作用など、
  クロージャの鮮度（stale closure）や `try/catch` の境界設計が正しさに直結する箇所が多く、
  実装計画だけで完全に確定させる必要があるため Codex 委譲ではなく Orchestrator 主導で進める
  （docs/06-ai-tools.md の実装ルートの使い分け）。

## 実装計画作成時に補った論点（設計書だけでは決まらなかった箇所。実装前に確認推奨）

設計書の公開インターフェース（型・関数シグネチャ）は変更していない。ただし以下は設計書が
明記していなかった実装レベルの決定であり、本計画で解決した。実装前に軽く目を通すこと。

1. **`response.json()` の失敗を誤ってオフライン判定しない**（Orchestrator 指摘）。
   `handleSetChecked` と `flush` のどちらも、`fetch` 呼び出し自体を囲む `try/catch`（真の
   ネットワーク例外を検出する）と、`response.json()` だけを囲む内側の `try/catch`
   （200 だが本文が壊れているケースを一般的な失敗として扱う）を分離する。`navigator.onLine`
   は使わない（ブラウザ間で信頼性が一様でないため）。
2. **`useCheckedSyncQueue` のエラー通知経路**。設計書のフック型定義にはエラー通知用のフィールドが
   無いが、E-01（422 破棄時のエラー表示）・E-04（attempts 上限到達時のエラー表示）は
   「エラー表示する」ことが要件（FR-8, E-01, E-04）で必須のため、`onQueueError: (kind: 'rejected'
| 'exhausted') => void` を追加のコールバック引数として補った。呼び出し側
   （`shopping-list-client.tsx`）は既存の `itemsAction.setErrorMessage` に委譲する。
3. **`useEffect` の stale closure 対策**。既存の `handleFocus` の `useEffect` は依存配列が空
   （`eslint-disable-next-line react-hooks/exhaustive-deps`）のパターンを踏襲する。`flush` は
   （後述のとおり）どの render で捕捉されても壊れない実装にする一方、`handleRefetch` の
   `onSuccess` が読む `pendingItemIds`（P-4 のマージ規則）は時間とともに変化する値のため、
   `useRef` でミラーして常に最新値を参照できるようにする（`pendingItemIdsRef`）。
4. **IndexedDB 接続のライフサイクル**。`checked-sync-queue.ts` は呼び出しごとに `openDB` →
   操作 → `db.close()` する（コネクションをモジュールスコープでキャッシュしない）。理由は
   テスト時に `fake-indexeddb` のファクトリを `beforeEach` ごとに差し替えて確実に分離するため。
   想定件数が小規模なため、毎回オープンするオーバーヘッドは許容する。
5. **`items` パラメータの用途**。設計書の `useCheckedSyncQueue` シグネチャに含まれる `items` は、
   `pendingItemIds` を「現在表示中のリストに実在する item」だけに絞り込むフィルタとして使う
   （P-7 の「未同期の行表示は現在表示中のリストの itemId のみでフィルタする」を具体化）。

---

## 変更対象ファイル

| #   | パス                                                                                  | 変更理由                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `apps/web/package.json`                                                               | `idb`（dependencies）・`fake-indexeddb`（devDependencies）追加                                                                                    |
| 2   | `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`                | `handleSetChecked` 拡張、`useCheckedSyncQueue` 配線、`online`/`focus`/マウント時の flush トリガー、`handleRefetch` のマージ規則、未同期バナー表示 |
| 3   | `apps/web/src/app/shopping-lists/_components/store-group.tsx`                         | `pendingItemIds` を受け取り `unsynced` として `ShoppingItemRow` へ中継                                                                            |
| 4   | `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`                   | `unsynced` prop 追加・行内インジケーター表示                                                                                                      |
| 5   | `apps/web/tests/app/shopping-lists/_components/shopping-list-client.checked.test.tsx` | LC-28 の期待値を新仕様に書き換え、enqueue 経路の新規テスト追加                                                                                    |
| 6   | `apps/web/tests/app/shopping-lists/_components/store-group.test.tsx`                  | `pendingItemIds` デフォルト追加・中継テスト追加                                                                                                   |
| 7   | `apps/web/tests/app/shopping-lists/_components/shopping-item-row.test.tsx`            | `unsynced` デフォルト追加・表示/disable 判定テスト追加                                                                                            |
| 8   | `docs/05-roadmap.md`                                                                  | L715 の「（Background Sync）」表記を実態に合わせて修正                                                                                            |

## 新規作成ファイル

| #   | パス                                                                                        | 役割                                                                                    |
| --- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | `apps/web/src/app/shopping-lists/_utils/checked-sync-queue.ts`                              | IndexedDB 読み書きの純粋なラッパー（フレームワーク非依存）                              |
| 2   | `apps/web/src/app/shopping-lists/_utils/use-checked-sync-queue.ts`                          | React フック。キュー状態・再送処理をカプセル化                                          |
| 3   | `apps/web/tests/app/shopping-lists/_utils/checked-sync-queue.node.test.ts`                  | 1 の単体テスト（node 環境 + `fake-indexeddb`）                                          |
| 4   | `apps/web/tests/app/shopping-lists/_utils/use-checked-sync-queue.test.tsx`                  | 2 の単体テスト（dom 環境 + `fake-indexeddb`）                                           |
| 5   | `apps/web/tests/app/shopping-lists/_components/shopping-list-client.offline-queue.test.tsx` | オフライン→復帰の結合シナリオ（enqueue → 未同期表示 → online/focus flush → マージ規則） |

Domain / Application / Infrastructure / `packages/api-contract` / `apps/web/src/app/sw.ts` は
**変更しない**（設計書の対象範囲・対象外のとおり）。実装中にこれらへの変更が必要と判明した
場合は、独断で広げず作業を止めて Orchestrator へ差し戻す。

---

## 実装手順

依存関係のある順に Step 1 → 6 で進める。各 Step は単独で `pnpm --filter @cookpit/web lint` /
`type-check` / `test` が通る粒度にしてある（Step 3・4 は Step 1・2 の完了が前提）。

### Step 1: `checked-sync-queue.ts`（IndexedDB ラッパー）+ 依存追加

**対象ファイル**:

- `apps/web/package.json`（変更）
- `apps/web/src/app/shopping-lists/_utils/checked-sync-queue.ts`（新規）
- `apps/web/tests/app/shopping-lists/_utils/checked-sync-queue.node.test.ts`（新規）

**変更内容**:

1. 依存追加。以下のコマンドをリポジトリルートで実行する（バージョンはコマンド実行時に
   pnpm が解決した最新版を使う。本計画では固定しない）。

   ```
   pnpm --filter @cookpit/web add idb
   pnpm --filter @cookpit/web add -D fake-indexeddb
   ```

   完了後、`apps/web/package.json` の `dependencies` に `idb` が、`devDependencies` に
   `fake-indexeddb` が追加されていることを確認する（アルファベット順が既存の並びと
   ずれていないかも確認。pnpm が挿入位置を維持しない場合は手動で並べ替える）。

2. `apps/web/src/app/shopping-lists/_utils/checked-sync-queue.ts` を新規作成する。

   ```typescript
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

   function openQueueDb(): Promise<IDBPDatabase<CheckedOpsSchema>> {
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
   ```

3. `apps/web/tests/app/shopping-lists/_utils/checked-sync-queue.node.test.ts` を新規作成する。
   `fake-indexeddb` はテストごとにファクトリを差し替えて分離する。

   ```typescript
   import { IDBFactory } from 'fake-indexeddb';
   import { beforeEach, describe, expect, it } from 'vitest';
   import {
     bumpAttempts,
     deleteCheckedOp,
     enqueueCheckedOp,
     listCheckedOps,
   } from '../../../../src/app/shopping-lists/_utils/checked-sync-queue';

   beforeEach(() => {
     globalThis.indexedDB = new IDBFactory();
   });

   describe('checked-sync-queue', () => {
     it('enqueueCheckedOp → listCheckedOps で往復し、同一内容が読める', async () => {
       await enqueueCheckedOp({
         key: 'list-1:item-1',
         shoppingListId: 'list-1',
         itemId: 'item-1',
         checked: true,
       });

       const ops = await listCheckedOps();

       expect(ops).toEqual([
         {
           key: 'list-1:item-1',
           shoppingListId: 'list-1',
           itemId: 'item-1',
           checked: true,
           enqueuedAt: expect.any(Number),
           attempts: 0,
         },
       ]);
     });

     it('同一 key で 2 回 enqueueCheckedOp すると 1 件に上書きされる（P-1 の coalesce）', async () => {
       await enqueueCheckedOp({
         key: 'list-1:item-1',
         shoppingListId: 'list-1',
         itemId: 'item-1',
         checked: true,
       });
       await enqueueCheckedOp({
         key: 'list-1:item-1',
         shoppingListId: 'list-1',
         itemId: 'item-1',
         checked: false,
       });

       const ops = await listCheckedOps();

       expect(ops).toHaveLength(1);
       expect(ops[0]?.checked).toBe(false);
     });

     it('deleteCheckedOp 後は listCheckedOps に含まれない', async () => {
       await enqueueCheckedOp({
         key: 'list-1:item-1',
         shoppingListId: 'list-1',
         itemId: 'item-1',
         checked: true,
       });

       await deleteCheckedOp('list-1:item-1');

       expect(await listCheckedOps()).toEqual([]);
     });

     it('bumpAttempts で attempts が増加する', async () => {
       await enqueueCheckedOp({
         key: 'list-1:item-1',
         shoppingListId: 'list-1',
         itemId: 'item-1',
         checked: true,
       });

       await bumpAttempts('list-1:item-1');
       await bumpAttempts('list-1:item-1');

       const ops = await listCheckedOps();
       expect(ops[0]?.attempts).toBe(2);
     });

     it('bumpAttempts は存在しない key を渡しても例外を投げない', async () => {
       await expect(bumpAttempts('missing:missing')).resolves.toBeUndefined();
     });
   });
   ```

**完了条件**:

- `apps/web/package.json` に `idb`（dependencies）・`fake-indexeddb`（devDependencies）が
  追加されている。
- `checked-sync-queue.ts` が上記 4 関数・`QueuedCheckedOp` 型を上記シグネチャで公開している。
- `pnpm --filter @cookpit/web type-check` がエラーなし。
- `pnpm --filter @cookpit/web test -- checked-sync-queue.node.test.ts` で上記 5 ケースが通る。

**このステップで実行するテスト**: `checked-sync-queue.node.test.ts`（新規、上記 5 ケース）。

---

### Step 2: `use-checked-sync-queue.ts`（React フック）

**対象ファイル**:

- `apps/web/src/app/shopping-lists/_utils/use-checked-sync-queue.ts`（新規）
- `apps/web/tests/app/shopping-lists/_utils/use-checked-sync-queue.test.tsx`（新規）

**変更内容**:

1. `apps/web/src/app/shopping-lists/_utils/use-checked-sync-queue.ts` を新規作成する。

   ```typescript
   'use client';

   import type { Dispatch, SetStateAction } from 'react';
   import { useCallback, useRef, useState } from 'react';
   import type { ShoppingItemDto } from '@cookpit/application';
   import { client } from '@/lib/api-client';
   import {
     bumpAttempts,
     deleteCheckedOp,
     enqueueCheckedOp,
     listCheckedOps,
     type QueuedCheckedOp,
   } from './checked-sync-queue';

   /** エンキューから 24 時間で破棄する（P-7）。 */
   const TTL_MS = 24 * 60 * 60 * 1000;
   /** 再送の試行上限（P-7）。 */
   const MAX_ATTEMPTS = 5;

   interface EnqueueInput {
     shoppingListId: string;
     itemId: string;
     checked: boolean;
   }

   interface UseCheckedSyncQueueParams {
     items: ShoppingItemDto[];
     setItems: Dispatch<SetStateAction<ShoppingItemDto[]>>;
     shoppingListId: string;
     /**
      * flush が 422（E-01）または attempts 上限超過（E-04）でエントリを破棄したときに呼ばれる。
      * 呼び出し側でエラーバナー表示に使う（設計書には無いが FR-8/E-01/E-04 を満たすために
      * 実装計画で追加したコールバック。実装計画 冒頭「補った論点」2 を参照）。
      */
     onQueueError: (kind: 'rejected' | 'exhausted') => void;
   }

   export interface UseCheckedSyncQueueResult {
     /** 現在キューに残っている itemId の集合（行の「未同期」表示に使う。P-6）。 */
     pendingItemIds: ReadonlySet<string>;
     /** ネットワーク例外時にキューへ積むコールバック。handleSetChecked から呼ぶ。 */
     enqueue: (input: EnqueueInput) => Promise<void>;
     /** online / focus / mount から呼ぶ。キューを再送し、成功分を items へ反映する。 */
     flush: () => Promise<void>;
   }

   export function useCheckedSyncQueue({
     items,
     setItems,
     shoppingListId,
     onQueueError,
   }: UseCheckedSyncQueueParams): UseCheckedSyncQueueResult {
     const [pendingItemIds, setPendingItemIds] = useState<ReadonlySet<string>>(() => new Set());
     const flushingRef = useRef(false);

     const refreshPendingItemIds = useCallback(async () => {
       try {
         const ops = await listCheckedOps();
         const ids = ops
           .filter(
             (op) =>
               op.shoppingListId === shoppingListId && items.some((item) => item.id === op.itemId),
           )
           .map((op) => op.itemId);
         setPendingItemIds(new Set(ids));
       } catch {
         // E-06: IndexedDB が使えない環境では「未同期」表示を出せないだけで致命的ではない。
       }
     }, [items, shoppingListId]);

     const enqueue = useCallback(
       async (input: EnqueueInput) => {
         try {
           await enqueueCheckedOp({
             key: `${input.shoppingListId}:${input.itemId}`,
             shoppingListId: input.shoppingListId,
             itemId: input.itemId,
             checked: input.checked,
           });
           await refreshPendingItemIds();
         } catch {
           // E-06: enqueue を no-op にする。呼び出し元（handleSetChecked）は既に
           // 確定 state 側の直接パッチを終えているため、キュー投入の成否に関わらず
           // 「チェックしたまま表示され続ける」P-2 の挙動自体は維持される。
         }
       },
       [refreshPendingItemIds],
     );

     const handleRetryableFailure = useCallback(
       async (op: QueuedCheckedOp) => {
         if (op.attempts + 1 >= MAX_ATTEMPTS) {
           await deleteCheckedOp(op.key).catch(() => {});
           onQueueError('exhausted');
           return;
         }
         await bumpAttempts(op.key).catch(() => {});
       },
       [onQueueError],
     );

     const flush = useCallback(async () => {
       // 短時間の二重発火（online と focus がほぼ同時等）を無駄打ちしないためのローカルな排他制御
       // （SetItemCheckedUseCase 自体は冪等なので安全側だが、無駄なリクエストを避ける。P-3）。
       if (flushingRef.current) {
         return;
       }
       flushingRef.current = true;
       try {
         let ops: QueuedCheckedOp[];
         try {
           ops = await listCheckedOps();
         } catch {
           return; // E-06
         }
         for (const op of ops) {
           if (Date.now() - op.enqueuedAt > TTL_MS) {
             await deleteCheckedOp(op.key).catch(() => {}); // E-05
             continue;
           }

           let response;
           try {
             response = await client.api['shopping-lists'][':id'].items[':itemId'].checked.$post({
               param: { id: op.shoppingListId, itemId: op.itemId },
               json: { checked: op.checked },
             });
           } catch {
             await handleRetryableFailure(op); // E-03
             continue;
           }

           if (response.ok) {
             try {
               const updated: ShoppingItemDto = await response.json();
               await deleteCheckedOp(op.key);
               setItems((current) =>
                 current.map((item) => (item.id === updated.id ? updated : item)),
               );
             } catch {
               // 200 だが本文の解析に失敗。成功と確定できないため再送対象として残す
               // （handleSetChecked と同じ理由。実装計画 冒頭「補った論点」1 を参照）。
               await handleRetryableFailure(op);
             }
             continue;
           }

           // Hono RPC の型は 404/422 を知らないため number へ広げる
           // （shopping-list-client.tsx の handleRemoveItem と同じ理由）。
           const status: number = response.status;
           if (status === 404) {
             await deleteCheckedOp(op.key).catch(() => {}); // E-02: エラー表示なし
             continue;
           }
           if (status === 422) {
             await deleteCheckedOp(op.key).catch(() => {});
             onQueueError('rejected'); // E-01
             continue;
           }
           // 5xx はネットワーク例外と同様に一時的な障害とみなす（P-5）。
           await handleRetryableFailure(op);
         }
         await refreshPendingItemIds();
       } finally {
         flushingRef.current = false;
       }
     }, [handleRetryableFailure, onQueueError, refreshPendingItemIds, setItems]);

     return { pendingItemIds, enqueue, flush };
   }
   ```

2. `apps/web/tests/app/shopping-lists/_utils/use-checked-sync-queue.test.tsx` を新規作成する。
   `renderHook`（`@testing-library/react`）を使う。`client` はモックする。TTL/attempts 上限の
   ケースは `checked-sync-queue.ts` の `enqueueCheckedOp` を直接呼んで `enqueuedAt`/`attempts`
   を操作できないため（`Omit` で除外されている）、`idb` の `openDB` を直接使ってレコードを
   注入する。

   ```tsx
   import { openDB } from 'idb';
   import { IDBFactory } from 'fake-indexeddb';
   import { act, renderHook, waitFor } from '@testing-library/react';
   import { beforeEach, describe, expect, it, vi } from 'vitest';
   import type { ShoppingItemDto } from '@cookpit/application';

   const { postChecked } = vi.hoisted(() => ({ postChecked: vi.fn() }));

   vi.mock('@/lib/api-client', () => ({
     client: {
       api: {
         'shopping-lists': {
           ':id': {
             items: {
               ':itemId': {
                 checked: { $post: (...args: unknown[]) => postChecked(...args) },
               },
             },
           },
         },
       },
     },
   }));

   import { useCheckedSyncQueue } from '../../../../src/app/shopping-lists/_utils/use-checked-sync-queue';

   const ITEM: ShoppingItemDto = {
     id: 'item-1',
     productId: null,
     displayName: '醤油',
     requiredAmount: null,
     amountNote: '1本',
     targetStoreId: null,
     status: 'pending',
     actualPrice: null,
     actualStoreId: null,
     source: 'manual',
   };

   /** DB スキーマを import せず直接レコードを注入する（TTL/attempts の境界値を作るため）。 */
   async function seedRawOp(overrides: {
     key: string;
     shoppingListId: string;
     itemId: string;
     checked: boolean;
     enqueuedAt: number;
     attempts: number;
   }): Promise<void> {
     const db = await openDB('cookpit-offline-queue', 1, {
       upgrade(database) {
         database.createObjectStore('checkedOps', { keyPath: 'key' });
       },
     });
     await db.put('checkedOps', overrides);
     db.close();
   }

   beforeEach(() => {
     globalThis.indexedDB = new IDBFactory();
     vi.clearAllMocks();
   });

   describe('useCheckedSyncQueue', () => {
     it('enqueue 呼び出し後、pendingItemIds に itemId が含まれる', async () => {
       const setItems = vi.fn();
       const onQueueError = vi.fn();
       const { result } = renderHook(() =>
         useCheckedSyncQueue({
           items: [ITEM],
           setItems,
           shoppingListId: 'list-1',
           onQueueError,
         }),
       );

       await act(async () => {
         await result.current.enqueue({
           shoppingListId: 'list-1',
           itemId: 'item-1',
           checked: true,
         });
       });

       await waitFor(() => {
         expect(result.current.pendingItemIds.has('item-1')).toBe(true);
       });
     });

     it('flush 成功時、pendingItemIds から除去され setItems が呼ばれる', async () => {
       postChecked.mockResolvedValue({
         ok: true,
         status: 200,
         json: async () => ({ ...ITEM, status: 'bought' }),
       });
       const setItems = vi.fn();
       const onQueueError = vi.fn();
       const { result } = renderHook(() =>
         useCheckedSyncQueue({
           items: [ITEM],
           setItems,
           shoppingListId: 'list-1',
           onQueueError,
         }),
       );
       await act(async () => {
         await result.current.enqueue({
           shoppingListId: 'list-1',
           itemId: 'item-1',
           checked: true,
         });
       });

       await act(async () => {
         await result.current.flush();
       });

       expect(result.current.pendingItemIds.has('item-1')).toBe(false);
       expect(setItems).toHaveBeenCalled();
     });

     it('flush が 404 を受けるとエラー表示なしでキューから除去される（E-02）', async () => {
       postChecked.mockResolvedValue({ ok: false, status: 404 });
       const onQueueError = vi.fn();
       const { result } = renderHook(() =>
         useCheckedSyncQueue({
           items: [ITEM],
           setItems: vi.fn(),
           shoppingListId: 'list-1',
           onQueueError,
         }),
       );
       await act(async () => {
         await result.current.enqueue({
           shoppingListId: 'list-1',
           itemId: 'item-1',
           checked: true,
         });
       });

       await act(async () => {
         await result.current.flush();
       });

       expect(result.current.pendingItemIds.has('item-1')).toBe(false);
       expect(onQueueError).not.toHaveBeenCalled();
     });

     it('flush が 422 を受けるとエラー表示ありでキューから除去される（E-01）', async () => {
       postChecked.mockResolvedValue({ ok: false, status: 422 });
       const onQueueError = vi.fn();
       const { result } = renderHook(() =>
         useCheckedSyncQueue({
           items: [ITEM],
           setItems: vi.fn(),
           shoppingListId: 'list-1',
           onQueueError,
         }),
       );
       await act(async () => {
         await result.current.enqueue({
           shoppingListId: 'list-1',
           itemId: 'item-1',
           checked: true,
         });
       });

       await act(async () => {
         await result.current.flush();
       });

       expect(result.current.pendingItemIds.has('item-1')).toBe(false);
       expect(onQueueError).toHaveBeenCalledWith('rejected');
     });

     it('flush がネットワーク例外を受けるとキューに残り attempts が増える（E-03）', async () => {
       postChecked.mockRejectedValue(new Error('network'));
       const onQueueError = vi.fn();
       const { result } = renderHook(() =>
         useCheckedSyncQueue({
           items: [ITEM],
           setItems: vi.fn(),
           shoppingListId: 'list-1',
           onQueueError,
         }),
       );
       await act(async () => {
         await result.current.enqueue({
           shoppingListId: 'list-1',
           itemId: 'item-1',
           checked: true,
         });
       });

       await act(async () => {
         await result.current.flush();
       });

       expect(result.current.pendingItemIds.has('item-1')).toBe(true);
       expect(onQueueError).not.toHaveBeenCalled();
     });

     it('attempts が上限（5回）を超えたエントリは破棄される（E-04）', async () => {
       await seedRawOp({
         key: 'list-1:item-1',
         shoppingListId: 'list-1',
         itemId: 'item-1',
         checked: true,
         enqueuedAt: Date.now(),
         attempts: 4,
       });
       postChecked.mockRejectedValue(new Error('network'));
       const onQueueError = vi.fn();
       const { result } = renderHook(() =>
         useCheckedSyncQueue({
           items: [ITEM],
           setItems: vi.fn(),
           shoppingListId: 'list-1',
           onQueueError,
         }),
       );

       await act(async () => {
         await result.current.flush();
       });

       expect(result.current.pendingItemIds.has('item-1')).toBe(false);
       expect(onQueueError).toHaveBeenCalledWith('exhausted');
     });

     it('enqueuedAt が TTL（24時間）を超えたエントリは送信せず破棄される（E-05）', async () => {
       await seedRawOp({
         key: 'list-1:item-1',
         shoppingListId: 'list-1',
         itemId: 'item-1',
         checked: true,
         enqueuedAt: Date.now() - 25 * 60 * 60 * 1000,
         attempts: 0,
       });
       const onQueueError = vi.fn();
       const { result } = renderHook(() =>
         useCheckedSyncQueue({
           items: [ITEM],
           setItems: vi.fn(),
           shoppingListId: 'list-1',
           onQueueError,
         }),
       );

       await act(async () => {
         await result.current.flush();
       });

       expect(postChecked).not.toHaveBeenCalled();
       expect(result.current.pendingItemIds.has('item-1')).toBe(false);
     });

     it('IndexedDB が使えない環境では enqueue/flush が例外を投げず no-op になる（E-06）', async () => {
       // @ts-expect-error テストのため意図的に未定義にする
       globalThis.indexedDB = undefined;
       const setItems = vi.fn();
       const onQueueError = vi.fn();
       const { result } = renderHook(() =>
         useCheckedSyncQueue({
           items: [ITEM],
           setItems,
           shoppingListId: 'list-1',
           onQueueError,
         }),
       );

       await act(async () => {
         await result.current.enqueue({
           shoppingListId: 'list-1',
           itemId: 'item-1',
           checked: true,
         });
         await result.current.flush();
       });

       expect(result.current.pendingItemIds.size).toBe(0);
       expect(setItems).not.toHaveBeenCalled();
       expect(onQueueError).not.toHaveBeenCalled();
     });
   });
   ```

**完了条件**:

- `use-checked-sync-queue.ts` が `UseCheckedSyncQueueResult`（`pendingItemIds`/`enqueue`/`flush`）
  を返し、`onQueueError` コールバックを受け取る。
- 上記 9 ケースが `pnpm --filter @cookpit/web test -- use-checked-sync-queue.test.tsx` で通る。
- `pnpm --filter @cookpit/web type-check` がエラーなし。

**このステップで実行するテスト**: `use-checked-sync-queue.test.tsx`（新規、上記 9 ケース）。

---

### Step 3: `shopping-list-client.tsx` の配線（キュー統合の中心）

**対象ファイル**:

- `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`
- `apps/web/tests/app/shopping-lists/_components/shopping-list-client.checked.test.tsx`（既存拡張）
- `apps/web/tests/app/shopping-lists/_components/shopping-list-client.offline-queue.test.tsx`（新規）

**変更内容**:

1. import 文（L24）を変更する。

   ```typescript
   import { startTransition, useEffect, useMemo, useOptimistic, useRef, useState } from 'react';
   ```

   末尾（L32 の直後）に追加する。

   ```typescript
   import { useCheckedSyncQueue } from '../_utils/use-checked-sync-queue';
   ```

2. メッセージ定数を `resolveItemFailureMessage`（L56-58）の直後に追加する。

   ```typescript
   /** キューに残っている未同期の変更がある間、画面上部に表示する案内文（P-6）。 */
   const OFFLINE_QUEUE_BANNER_MESSAGE =
     'オフライン中の変更があります。オンラインになると自動的に送信されます。';

   /** キューの再送が上限回数に達し同期を断念したときの文言（E-04）。 */
   const QUEUE_SYNC_FAILED_MESSAGE =
     '同期できなかった変更があります。品目を確認し、もう一度操作してください。';
   ```

3. `syncAction` の宣言（L99）の直後・`productMap` の `useMemo`（L101）の前に、フック呼び出しと
   `pendingItemIdsRef` を追加する。

   ```typescript
   function handleQueueError(kind: 'rejected' | 'exhausted'): void {
     itemsAction.setErrorMessage(
       kind === 'rejected' ? COMPLETED_REJECTED_MESSAGE : QUEUE_SYNC_FAILED_MESSAGE,
     );
   }

   const { pendingItemIds, enqueue, flush } = useCheckedSyncQueue({
     items,
     setItems,
     shoppingListId: shoppingList.id,
     onQueueError: handleQueueError,
   });
   // handleFocus の useEffect は依存配列を空にする既存パターン（L139-148）を踏襲するため、
   // pendingItemIds の最新値は ref 経由で読む（stale closure 対策）。
   const pendingItemIdsRef = useRef<ReadonlySet<string>>(pendingItemIds);
   useEffect(() => {
     pendingItemIdsRef.current = pendingItemIds;
   }, [pendingItemIds]);
   ```

   `handleQueueError` は関数宣言（`function` 文）のためホイスティングされ、後方の
   `itemsAction`/定数を参照していても定義順は問題にならない。ただし可読性のため上記の位置に置く。

4. `handleRefetch`（L124-137）の `onSuccess` を P-4 のマージ規則に変更する。

   ```typescript
   async function handleRefetch({ silent }: { silent: boolean }): Promise<void> {
     await itemsAction.run(
       () => client.api['shopping-lists'][':id'].$get({ param: { id: shoppingList.id } }),
       {
         key: REFRESH_KEY,
         silent,
         onSuccess: (dto) => {
           setItems((current) =>
             dto.items.map((serverItem) =>
               pendingItemIdsRef.current.has(serverItem.id)
                 ? (current.find((c) => c.id === serverItem.id) ?? serverItem)
                 : serverItem,
             ),
           );
           itemsAction.setErrorMessage(null);
         },
       },
     );
   }
   ```

5. `handleFocus` の `useEffect`（L139-148）を書き換え、`online` イベント用・マウント時 flush 用の
   `useEffect` を追加する。

   ```typescript
   useEffect(() => {
     function handleFocus(): void {
       void (async () => {
         await flush();
         await handleRefetch({ silent: true });
       })();
     }
     window.addEventListener('focus', handleFocus);
     return () => {
       window.removeEventListener('focus', handleFocus);
     };
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

   useEffect(() => {
     function handleOnline(): void {
       void flush();
     }
     window.addEventListener('online', handleOnline);
     return () => {
       window.removeEventListener('online', handleOnline);
     };
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);

   useEffect(() => {
     // マウント時に 1 度キューの再送を試みる（FR-5, N-06）。オフラインのままなら
     // flush 内部の catch で attempts が増えるだけで実害はない。
     void flush();
     // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);
   ```

6. `handleSetChecked`（L189-224）を、`fetch` 呼び出しを囲む外側 `try/catch` と
   `response.json()` だけを囲む内側 `try/catch` に分離した形へ書き換える
   （「補った論点」1 を参照）。

   ```typescript
   function handleSetChecked(itemId: string, checked: boolean): void {
     if (submittingItemId === itemId) {
       return;
     }
     setSubmittingItemId(itemId);
     itemsAction.setErrorMessage(null);
     startTransition(async () => {
       setOptimisticItems({
         type: 'patch',
         itemId,
         patch: checked
           ? { status: 'bought' }
           : { status: 'pending', actualPrice: null, actualStoreId: null },
       });
       try {
         const response = await client.api['shopping-lists'][':id'].items[':itemId'].checked.$post({
           param: { id: shoppingList.id, itemId },
           json: { checked },
         });
         if (!response.ok) {
           itemsAction.setErrorMessage(resolveItemFailureMessage(response.status));
           return;
         }
         let updated: ShoppingItemDto;
         try {
           updated = await response.json();
         } catch {
           // 200 だが本文の解析に失敗。オフラインではないためキューには積まず、
           // 既存の一般失敗表示にとどめる（response.json() の失敗を誤ってオフライン
           // 判定しないための分岐）。
           itemsAction.setErrorMessage(API_FAILURE_MESSAGE);
           return;
         }
         setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
         if (!checked) {
           // チェックを外したら展開中の価格フォームも閉じる（誤操作防止。設計書 §フロントエンド設計）
           setExpandedItemId((current) => (current === itemId ? null : current));
         }
       } catch {
         // fetch 自体の例外 = オフライン等のネットワーク例外（P-2 案B）。
         // ロールバックの代わりに確定 state 側へ望む状態を直接書き込み、キューへ積む。
         setItems((current) =>
           current.map((item) =>
             item.id === itemId
               ? checked
                 ? { ...item, status: 'bought' }
                 : { ...item, status: 'pending', actualPrice: null, actualStoreId: null }
               : item,
           ),
         );
         if (!checked) {
           setExpandedItemId((current) => (current === itemId ? null : current));
         }
         await enqueue({ shoppingListId: shoppingList.id, itemId, checked });
       } finally {
         setSubmittingItemId(null);
       }
     });
   }
   ```

7. `itemsAction.errorMessage` のバナー（L381-385）の直後に、未同期バナーを追加する。

   ```tsx
   {
     pendingItemIds.size > 0 && (
       <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
         {OFFLINE_QUEUE_BANNER_MESSAGE}
       </p>
     );
   }
   ```

8. `<StoreGroup>` 呼び出し（L479-496）に `pendingItemIds={pendingItemIds}` を追加する
   （`readOnly={readOnly}` の直後）。

**完了条件**:

- `handleSetChecked` が上記の二重 `try/catch` 構造になっている。
- `useCheckedSyncQueue` が配線され、`pendingItemIds` が `<StoreGroup>` へ渡っている。
- `online`/`focus`/マウント時にそれぞれ `flush` が呼ばれる（`focus` は `flush` → `handleRefetch`
  の順）。
- `handleRefetch` の `onSuccess` が `pendingItemIdsRef.current` を使ったマージ規則になっている。
- `pnpm --filter @cookpit/web type-check` がエラーなし。

**テスト変更内容**:

- `shopping-list-client.checked.test.tsx` の `LC-28` を新仕様に書き換える（ロールバックされない
  ことを検証する内容に変更。テスト ID は `LC-28` のまま維持し、タイトルのみ更新する）。

  ```typescript
  it('LC-28: チェック操作中のネットワークエラーではロールバックされず、チェック状態が保持される（P-2）', async () => {
    const user = userEvent.setup();
    let rejectChecked: (reason: unknown) => void = () => {};
    postChecked.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectChecked = reject;
      }),
    );
    const shoppingList = createShoppingListDto({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
    });
    render(<ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />);

    await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });

    await act(async () => {
      rejectChecked(new Error('network'));
    });

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
      expect(screen.queryByText('通信エラーが発生しました。')).toBeNull();
    });
  });
  ```

  `LC-25`（`ok: false` の通常失敗パス）・`LC-26`・`LC-27` は挙動不変のため変更しない
  （設計書「オンライン時の handleSetChecked 単発実行では 404/422 の分岐は既存のまま変更しない」）。

- `shopping-list-client.offline-queue.test.tsx` を新規作成する（`fake-indexeddb` を使う結合
  シナリオ）。

  ```tsx
  import { IDBFactory } from 'fake-indexeddb';
  import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
  import {
    createShoppingItemDto,
    createShoppingListDto,
    PRODUCTS,
    STORES,
  } from './shopping-list-test-fixtures';

  const { getShoppingList, postChecked } = vi.hoisted(() => ({
    getShoppingList: vi.fn(),
    postChecked: vi.fn(),
  }));

  vi.mock('@/lib/api-client', () => ({
    client: {
      api: {
        'shopping-lists': {
          ':id': {
            $get: (...args: unknown[]) => getShoppingList(...args),
            items: {
              ':itemId': {
                checked: { $post: (...args: unknown[]) => postChecked(...args) },
              },
            },
          },
        },
      },
    },
  }));

  import { ShoppingListClient } from '../../../../src/app/shopping-lists/_components/shopping-list-client';

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  describe('ShoppingListClient（オフライン書き込みキュー結合シナリオ）', () => {
    afterEach(() => {
      cleanup();
      vi.clearAllMocks();
    });

    it('OQ-01: オフラインでチェック後、行に「未同期」表示とバナーが出る', async () => {
      const user = userEvent.setup();
      postChecked.mockRejectedValue(new Error('network'));
      const shoppingList = createShoppingListDto({
        items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
      });
      render(
        <ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />,
      );

      await user.click(screen.getByRole('checkbox', { name: /醤油/ }));

      await waitFor(() => {
        expect(screen.getByText('未送信')).toBeDefined();
        expect(
          screen.getByText(
            'オフライン中の変更があります。オンラインになると自動的に送信されます。',
          ),
        ).toBeDefined();
      });
    });

    it('OQ-02: online イベントで flush され、成功した品目は「未同期」表示が消える', async () => {
      const user = userEvent.setup();
      postChecked.mockRejectedValueOnce(new Error('network'));
      const shoppingList = createShoppingListDto({
        items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
      });
      render(
        <ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />,
      );
      await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
      await waitFor(() => {
        expect(screen.getByText('未送信')).toBeDefined();
      });

      postChecked.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () =>
          createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'bought' }),
      });
      await act(async () => {
        window.dispatchEvent(new Event('online'));
      });

      await waitFor(() => {
        expect(screen.queryByText('未送信')).toBeNull();
      });
    });

    it('OQ-03: focus イベントでは flush が handleRefetch より先に完了する（P-4）', async () => {
      const user = userEvent.setup();
      const callOrder: string[] = [];
      postChecked.mockImplementation(async () => {
        callOrder.push('checked');
        return {
          ok: true,
          status: 200,
          json: async () =>
            createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'bought' }),
        };
      });
      getShoppingList.mockImplementation(async () => {
        callOrder.push('refetch');
        return { ok: true, json: async () => createShoppingListDto() };
      });
      // まずネットワーク例外でキューへ積む
      postChecked.mockRejectedValueOnce(new Error('network'));
      const shoppingList = createShoppingListDto({
        items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
      });
      render(
        <ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />,
      );
      await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
      await waitFor(() => {
        expect(screen.getByText('未送信')).toBeDefined();
      });

      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });

      await waitFor(() => {
        expect(callOrder).toEqual(['checked', 'refetch']);
      });
    });

    it('OQ-04: flush 未完了のまま handleRefetch が成功しても、pendingItemIds の品目はサーバー値で上書きされない（P-4）', async () => {
      const user = userEvent.setup();
      postChecked.mockRejectedValue(new Error('network')); // flush してもずっと失敗し続ける
      getShoppingList.mockResolvedValue({
        ok: true,
        json: async () =>
          createShoppingListDto({
            items: [
              createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' }),
            ],
          }),
      });
      const shoppingList = createShoppingListDto({
        items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
      });
      render(
        <ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />,
      );
      await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
      await waitFor(() => {
        expect(screen.getByText('未送信')).toBeDefined();
      });

      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });

      await waitFor(() => {
        expect(getShoppingList).toHaveBeenCalled();
      });
      // サーバーは pending を返すが、ローカルの未同期な「チェック済み」表示が優先される
      expect(screen.getByRole('checkbox', { name: /醤油/ }).getAttribute('aria-checked')).toBe(
        'true',
      );
    });

    it('OQ-05: flush が 404 を受けるとエラー表示なしでキューから除去される（E-02）', async () => {
      const user = userEvent.setup();
      postChecked.mockRejectedValueOnce(new Error('network'));
      const shoppingList = createShoppingListDto({
        items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
      });
      render(
        <ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />,
      );
      await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
      await waitFor(() => {
        expect(screen.getByText('未送信')).toBeDefined();
      });

      postChecked.mockResolvedValue({ ok: false, status: 404 });
      await act(async () => {
        window.dispatchEvent(new Event('online'));
      });

      await waitFor(() => {
        expect(screen.queryByText('未送信')).toBeNull();
      });
      expect(screen.queryByText('操作に失敗しました。')).toBeNull();
    });

    it('OQ-06: flush が 422 を受けるとエラー表示ありでキューから除去される（E-01）', async () => {
      const user = userEvent.setup();
      postChecked.mockRejectedValueOnce(new Error('network'));
      const shoppingList = createShoppingListDto({
        items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油', status: 'pending' })],
      });
      render(
        <ShoppingListClient shoppingList={shoppingList} stores={STORES} products={PRODUCTS} />,
      );
      await user.click(screen.getByRole('checkbox', { name: /醤油/ }));
      await waitFor(() => {
        expect(screen.getByText('未送信')).toBeDefined();
      });

      postChecked.mockResolvedValue({ ok: false, status: 422 });
      await act(async () => {
        window.dispatchEvent(new Event('online'));
      });

      await waitFor(() => {
        expect(screen.queryByText('未送信')).toBeNull();
        expect(
          screen.getByText('買い物完了後は変更できません。「買い物を再開」してください。'),
        ).toBeDefined();
      });
    });
  });
  ```

**完了条件**:

- `shopping-list-client.checked.test.tsx` の `LC-28` が新仕様で通り、他の既存ケース（LC-04〜27,
  31〜33）がすべて変更なしで通る。
- `shopping-list-client.offline-queue.test.tsx` の OQ-01〜06 が通る。
- `pnpm --filter @cookpit/web test -- shopping-list-client` で当該ファイル群がすべて通る。

**このステップで実行するテスト**: `shopping-list-client.checked.test.tsx`（既存 + LC-28 更新）、
`shopping-list-client.offline-queue.test.tsx`（新規 6 ケース）。念のため
`shopping-list-client.view.test.tsx` / `.sync.test.tsx` / `.remove.test.tsx` / `.complete.test.tsx`
も実行し、`useEffect` 追加（online/mount flush）が既存の呼び出し回数系アサーション
（例: `LC-15`, `LC-22`）に影響しないことを確認する。

---

### Step 4: `store-group.tsx` / `shopping-item-row.tsx` の `unsynced` 表示

**対象ファイル**:

- `apps/web/src/app/shopping-lists/_components/store-group.tsx`
- `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`
- `apps/web/tests/app/shopping-lists/_components/store-group.test.tsx`（既存拡張）
- `apps/web/tests/app/shopping-lists/_components/shopping-item-row.test.tsx`（既存拡張）

**変更内容**:

1. `store-group.tsx` の `Props`（L5-21）に追加する（`readOnly` の直後）。

   ```typescript
   /** 現在キューに残っている itemId の集合（P-6）。 */
   pendingItemIds: ReadonlySet<string>;
   ```

   分割代入の引数（L24-38）に `pendingItemIds` を追加し、`<ShoppingItemRow>`（L54-67）に
   `unsynced={pendingItemIds.has(item.id)}` を `readOnly={readOnly}` の直後へ追加する。

2. `shopping-item-row.tsx` の `Props`（L17-34）に追加する（`readOnly` の直後）。

   ```typescript
   /** true のとき、この品目はオフラインキューに積まれ未送信であることを示す（P-6）。 */
   unsynced: boolean;
   ```

   分割代入の引数（L44-56）に `unsynced` を追加する。`item.displayName` の `<p>`（L108-115）の
   直後に、未同期インジケーターを追加する。

   ```tsx
   {
     unsynced && <span className="text-[10px] text-muted-foreground">未送信</span>;
   }
   ```

   チェックボタンの `disabled={locked}`（L96、`locked = submitting || readOnly`）は
   **変更しない**（設計書 P-6: 未同期の品目もタップして再変更できる必要がある）。

**完了条件**:

- `StoreGroup` が `pendingItemIds` を受け取り `ShoppingItemRow` へ `unsynced` として中継する。
- `ShoppingItemRow` が `unsynced` のとき「未送信」テキストを表示し、`disabled` 判定には
  一切影響しない。
- `pnpm --filter @cookpit/web type-check` がエラーなし（Step 3 で `<StoreGroup pendingItemIds=.../>`
  を渡していないと型エラーになるため、Step 3 完了後に実施する）。

**テスト変更内容**:

- `store-group.test.tsx` の `renderStoreGroup` の `defaults`（L62-77）に
  `pendingItemIds: new Set<string>()` を追加する。新規ケースを追加する。

  ```typescript
  it('SG-09: pendingItemIds に含まれる item は unsynced として ShoppingItemRow へ中継される', () => {
    renderStoreGroup({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油' })],
      pendingItemIds: new Set(['item-1']),
    });

    expect(screen.getByText('未送信')).toBeDefined();
  });

  it('SG-10: pendingItemIds に含まれない item は未同期表示されない', () => {
    renderStoreGroup({
      items: [createShoppingItemDto({ id: 'item-1', displayName: '醤油' })],
      pendingItemIds: new Set(['item-2']),
    });

    expect(screen.queryByText('未送信')).toBeNull();
  });
  ```

- `shopping-item-row.test.tsx` の `renderRow` の `defaults`（L89-101）に `unsynced: false` を
  追加する。新規ケースを追加する。

  ```typescript
  it('IR-38: unsynced のとき「未送信」インジケーターが表示される', () => {
    renderRow({ unsynced: true });

    expect(screen.getByText('未送信')).toBeDefined();
  });

  it('IR-39: unsynced でないとき「未送信」インジケーターは表示されない', () => {
    renderRow({ unsynced: false });

    expect(screen.queryByText('未送信')).toBeNull();
  });

  it('IR-40: unsynced でもチェックボタンの disabled は submitting/readOnly のみで決まる', () => {
    renderRow({ unsynced: true, submitting: false, readOnly: false });

    expect(screen.getByRole('checkbox').hasAttribute('disabled')).toBe(false);
  });
  ```

**完了条件**: 上記 5 ケースが通る。既存の SG-01〜08・IR-01〜37 が変更なしで通る。

**このステップで実行するテスト**: `store-group.test.tsx`（既存 + 新規 2 ケース）、
`shopping-item-row.test.tsx`（既存 + 新規 3 ケース）。

---

### Step 5: `docs/05-roadmap.md` の表記修正

**対象ファイル**: `docs/05-roadmap.md`

**変更内容**: L715 を変更する。

変更前:

```
| 1   | PWA オフライン書き込みキュー（Background Sync） | `docs/designs/shopping-list-screens.md` S-5（本命の耐久性対策）                                  |
```

変更後:

```
| 1   | PWA オフライン書き込みキュー（アプリ層 IndexedDB キュー。Background Sync は不採用） | `docs/designs/offline-write-queue.md`（本命の耐久性対策。Background Sync 不採用の理由は同設計書§前提） |
```

**完了条件**: L715 のタスク名・出典列が上記のとおり更新されている。他の行（L713-724）に
差分がない。このステップはコード変更を伴わないため独立して実施でき、他 Step の前後どちらでも
良い。

**このステップで実行するテスト**: 対象外（ドキュメントのみ）。

---

### Step 6: 品質ゲート・最終確認

**対象**: リポジトリ全体。

**実施内容**:

1. `pnpm --filter @cookpit/web lint`
2. `pnpm --filter @cookpit/web type-check`
3. `pnpm --filter @cookpit/web test`
4. ルートで `pnpm lint` / `pnpm type-check` / `pnpm test` を実行し、他パッケージ
   （`packages/domain` 等、無変更のはず）に副作用がないことを確認する。
5. `git diff --stat` で変更ファイルが本計画の「変更対象ファイル」「新規作成ファイル」一覧と
   一致することを確認する（スコープ外変更が混入していないか）。
6. `apps/web/src/app/sw.ts` に差分が無いことを明示的に確認する（`git diff --stat -- apps/web/src/app/sw.ts` が空）。
7. `packages/domain` / `packages/application` / `packages/infrastructure` / `packages/api-contract`
   に差分が無いことを確認する。

**完了条件**: 上記 1〜4 がすべてエラーなしで完了し、5〜7 の差分確認で想定外の変更が無い。

**このステップで実行するテスト**: リポジトリ全体の `pnpm test`（回帰確認）。

---

## 依存関係

```
Step 1 (checked-sync-queue.ts + 依存追加)
  └─> Step 2 (use-checked-sync-queue.ts)
        └─> Step 3 (shopping-list-client.tsx 配線)
              └─> Step 4 (store-group.tsx / shopping-item-row.tsx の unsynced 表示)
                    └─> Step 6 (品質ゲート)
Step 5 (roadmap.md) は他 Step と独立。Step 1〜4 の前後どのタイミングで実施してもよい。
```

Step 3 は Step 4 の型変更（`<StoreGroup pendingItemIds=... />`）を前提にしているため、
Step 3 単独では `pnpm --filter @cookpit/web type-check` が通らない可能性がある
（`StoreGroup` の `Props` に `pendingItemIds` が無い状態で呼び出すため）。**Step 3 と Step 4 は
実装上ほぼ同時に行い、型チェックは両方完了した時点で走らせること**（Step 3 単独コミットが
必要な場合は、`pendingItemIds` を渡す行だけを Step 4 側に含める調整も可）。

## テスト計画

| ファイル                                                                                            | 種別 | 内容                                                                                         |
| --------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| `apps/web/tests/app/shopping-lists/_utils/checked-sync-queue.node.test.ts`（新規）                  | node | IndexedDB ラッパーの CRUD・coalesce                                                          |
| `apps/web/tests/app/shopping-lists/_utils/use-checked-sync-queue.test.tsx`（新規）                  | dom  | enqueue/flush・404/422/ネットワーク例外・TTL・attempts上限・IndexedDB 不可時のフォールバック |
| `apps/web/tests/app/shopping-lists/_components/shopping-list-client.checked.test.tsx`（既存拡張）   | dom  | LC-28 の期待値変更（ロールバックしない）                                                     |
| `apps/web/tests/app/shopping-lists/_components/shopping-list-client.offline-queue.test.tsx`（新規） | dom  | enqueue→未同期表示→online/focus flush→P-4 マージ規則の結合シナリオ                           |
| `apps/web/tests/app/shopping-lists/_components/store-group.test.tsx`（既存拡張）                    | dom  | `pendingItemIds` の中継                                                                      |
| `apps/web/tests/app/shopping-lists/_components/shopping-item-row.test.tsx`（既存拡張）              | dom  | `unsynced` の表示・disabled 非連動                                                           |

`docs/tests/offline-write-queue.md`（試験計画）は本実装計画と別工程で test-designer が作成する
想定。上記テストファイル名はそちらとも整合させること。

## リスク

| ID  | リスク                                                                                                                                                                                                  | 影響                                                     | 対策                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | `pnpm add` で解決される `idb`/`fake-indexeddb` の実バージョンが未知（本計画は固定しない）                                                                                                               | API の破壊的変更があれば型エラー・テスト失敗             | Step 1 完了時に `type-check`/`test` で検知できる。両パッケージとも安定した薄いラッパーで破壊的変更は稀                                                                  |
| R-2 | `fake-indexeddb` のファクトリをテスト間でリセットし忘れるとテスト汚染が起きる                                                                                                                           | 特定の実行順でのみ失敗する不安定なテスト                 | 各新規テストファイルの `beforeEach` で `globalThis.indexedDB = new IDBFactory()` を必須にする（本計画のテストコードに明記済み）                                         |
| R-3 | `LC-28` の期待値変更は意図的な破壊的変更（挙動そのものを変える）                                                                                                                                        | レビュー時に「デグレでは」と誤解されうる                 | Step 3 の完了条件・テストのコメントに変更理由（P-2 案B）を明記済み。PR 説明でも触れる                                                                                   |
| R-4 | `flush` の 5xx/ネットワーク例外は `attempts` 上限（5回）までリトライを許すが、`online`/`focus` が短時間に連打されると無駄なリクエストが増える                                                           | 軽微な無駄なネットワーク呼び出し                         | `flushingRef` による排他制御で同時実行は防止済み。上限はエントリ単位のためリクエスト総数は有界                                                                          |
| R-5 | `useEffect` 依存配列を空にする既存パターンのまま `flush`/`handleRefetch` を呼ぶため、将来 `shoppingList.id` が変わり得る画面（同一コンポーネントを再利用する形の遷移）では stale closure のリスクが残る | 将来の画面遷移パターン変更時に見落とすと不具合になりうる | 現状の `ShoppingListClient` は URL 遷移のたびに再マウントされる設計（App Router の `page.tsx` 経由）で `shoppingList.id` は不変のため実害なし。コメントで前提を明記する |
| R-6 | Safari のプライベートブラウジング等で IndexedDB オープンが頻繁に失敗する環境では、`checked-sync-queue.ts` が呼び出しごとに `openQueueDb()` を試みるため失敗コストが繰り返し発生する                     | 軽微な体感遅延（オフライン判定自体には影響しない）       | E-06 のフォールバックで例外は握りつぶされるため機能的な問題はない。性能はスコープ外（設計書§性能で許容範囲と判断済み）                                                  |

## ロールバック方法

- 本実装は Presentation 層の新規ファイル追加 + 3 ファイルの機能追加であり、DB マイグレーション・
  API 契約変更を伴わない。問題が発生した場合は該当コミット（Step 1〜5）を `git revert` すれば
  即座に旧挙動へ戻せる。
- `idb`/`fake-indexeddb` の依存追加のみを切り戻す場合は `apps/web/package.json` から該当行を
  削除し `pnpm install` を再実行する。
- IndexedDB に書き込み済みのキューデータ（ユーザー端末側）が残っていても、ロールバック後の
  旧コードはこれを一切参照しないため実害はない（次回同機能を再導入したときに古いキューが
  読み込まれる可能性はあるが、TTL 24 時間で自然に消える）。

## ドキュメント更新対象

- `docs/05-roadmap.md`（Step 5。L715 の表記修正）。
- `docs/04-domain-model.md`: 対象外（Domain 層の変更なし。ShoppingList/ShoppingItem 集約の定義に
  変更はないため更新不要）。
- `docs/designs/offline-write-queue.md`: 本計画のスコープ外。ヘッダーの `ステータス: draft` を
  `確定` へ更新するかどうかは Orchestrator の判断に委ねる（実装着手の可否は本計画冒頭の記載の
  とおり、Orchestrator から提示された確定事項に基づいて進めてよい）。
- ADR: 新規の設計判断（アーキテクチャ・ドメイン・DB スキーマ）を伴わないため、新規 ADR は
  不要と判断する（P-9 の LWW 踏襲は既存 ADR-0009 の延長であり新規決定ではない）。
