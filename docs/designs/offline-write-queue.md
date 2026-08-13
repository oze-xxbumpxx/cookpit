# 設計書: offline-write-queue

- ステータス: draft
- レベル: L3
- 関連:
  - `docs/requirements/offline-write-queue.md`（本設計の要件書。N-xx/E-xx/B-xx の採番は本設計と共通）
  - `docs/designs/shopping-list-item-check.md`（対象操作 `checked` の元設計。`useOptimistic` +
    `startTransition` + `submittingItemId` パターン、`SetItemCheckedUseCase` の冪等設計の出典）
  - `docs/designs/shopping-list-screens.md` S-4（楽観的更新の採用）/ S-5（本設計が置き換える
    「オフライン書き込みキュー」の先行検討。案 A を実装済み、本設計は未採用だった案 C の派生）
  - `docs/decisions/ADR-0009-shopping-list-item-check-uncheck.md`（`bought`/`pending` の状態設計）
  - `docs/05-roadmap.md` Sprint 9 タスク1（L709-724。本設計の完了条件の出典）

## 背景

`docs/requirements/offline-write-queue.md` §背景のとおり、Sprint 9 タスク1として「電波の悪い
店内でチェック操作が失われない」ことを実現する。現状、`apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`
の `handleSetChecked`（L189-224）は次の実装になっている。

```
function handleSetChecked(itemId, checked) {
  setSubmittingItemId(itemId);
  itemsAction.setErrorMessage(null);
  startTransition(async () => {
    setOptimisticItems({ type: 'patch', itemId, patch: {...} });  // L196-202: 即時反映
    try {
      const response = await client.api['shopping-lists'][':id'].items[':itemId'].checked.$post(...);
      if (!response.ok) { itemsAction.setErrorMessage(...); return; }  // 4xx: L208-211
      const updated = await response.json();
      setItems((current) => current.map(...));  // L213: 確定 state を更新
    } catch {
      itemsAction.setErrorMessage(NETWORK_ERROR_MESSAGE);  // L218-219: オフライン等はここに落ちる
    } finally {
      setSubmittingItemId(null);
    }
  });
}
```

ここで `catch` に落ちた場合（オフライン等のネットワーク例外）、`setItems` が呼ばれないため
確定 state（`items`）は変化しない。`useOptimistic`（L81）の仕組み上、`startTransition` の
非同期処理が完了すると `optimisticItems` は次のレンダリングで再度 `items`（この場合は変化して
いない＝チェック前の状態）を基準に再計算される。つまり**楽観値は自動的に破棄される**
（`docs/designs/shopping-list-screens.md` L353 に明記済みの既知の挙動）。本設計はこの「オフライン
時にチェックが元に戻って見える」問題を解消する。

## 目的

`docs/requirements/offline-write-queue.md` §目的と同一。要約：

- オフライン中のチェック操作を UI 上で失わない（チェックしたまま表示され続ける）。
- 端末内（IndexedDB）に永続化し、オンライン復帰後に自動再送する。
- 既存の楽観的更新・Service Worker の読み取りキャッシュ戦略を壊さない。

## 要件

`docs/requirements/offline-write-queue.md` の FR-1〜FR-12・N-01〜N-08・E-01〜E-07・B-01〜B-06 を
参照。本設計はこれらすべてに対応する実装方式を決定する。

## 対象範囲

- `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`
- `apps/web/src/app/shopping-lists/_components/store-group.tsx`
- `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`
- 新規: `apps/web/src/app/shopping-lists/_utils/checked-sync-queue.ts`
  （IndexedDB 読み書きの純粋なラッパー。フレームワーク非依存で単体テストしやすくする）
- 新規: `apps/web/src/app/shopping-lists/_utils/use-checked-sync-queue.ts`
  （React フック。`checked-sync-queue.ts` を用いてキュー状態・再送処理をカプセル化する）

`packages/domain` / `packages/application` / `packages/infrastructure` / `packages/api-contract`
への変更はない（既存の `POST /api/shopping-lists/:id/items/:itemId/checked` をそのまま再利用。
`packages/api-contract/src/shopping-list.schema.ts` L36-38 `setItemCheckedSchema` は無変更）。

## 対象外

`docs/requirements/offline-write-queue.md` §対象外と同一。特に重要な 3 点を再掲する。

- Background Sync API（`SyncManager`）の採用。iOS Safari 非対応は 2026-08-13 に一次情報で
  確認済み（§リスク R-1）。Cookpit の主対象は iPhone の PWA のため不採用のまま。
- `apps/web/src/app/sw.ts` の変更（一切行わない）。
- `markAsBought` / `DELETE` / `consume` をキュー対象に含めること（`checked` のみが対象）。

## 現状構成

### Presentation（`apps/web/src/app/shopping-lists/_components/`）

- `shopping-list-client.tsx`
  - L80-81: `items`（確定 state）と `optimisticItems`（`useOptimistic` の派生 state）を分離。
  - L64-76: `OptimisticAction` は判別可能ユニオン（`patch` / `remove`）。`applyOptimisticAction`
    は `items` に対してパッチ or 除去を適用する純粋関数。
  - L84-86 のコメント: 「品目の楽観的更新（check / markAsBought）は状態更新の順序自体が挙動に
    なるため `useApiAction` に寄せず、この state と `startTransition` のまま維持する」
    — 本設計もこの方針を継承し、`useApiAction` は使わない。
  - L139-148: `useEffect` で `window.addEventListener('focus', handleFocus)` を登録し、
    `handleFocus` は `handleRefetch({ silent: true })` を呼ぶだけ（L124-137）。
  - L189-224: `handleSetChecked`（上記「背景」に引用）。

- `store-group.tsx`（L1-72）: `ShoppingListClient` → `StoreGroup` → `ShoppingItemRow` の 3 層で
  `submittingItemId` を `submitting: boolean` に変換して中継している（L58-59）。同じパターンで
  「未同期」フラグも中継する。

- `shopping-item-row.tsx`（L44-105）: チェックボタンは `onClick={() => onSetChecked(item.id, !bought)}`
  （L95）。`locked = submitting || readOnly`（L61）でボタンを無効化している。

### `apps/web/src/lib/`

- `use-api-action.ts` L94-100 のコメント: 「楽観的更新（`useOptimistic` + `startTransition`）を
  伴う操作には使わない」— チェック操作は元々このフックの対象外であり、本設計でも踏襲する。
- `api-client.ts`（L1-4）: `hc<AppType>('/')` の型安全クライアント。キューからの再送でも
  同じ `client.api['shopping-lists'][':id'].items[':itemId'].checked.$post(...)` をそのまま使う。

### Hono ルート・契約

- `apps/web/src/server/routes/shopping-lists.ts` L77-88: `POST /:id/items/:itemId/checked`。
  `zValidator('json', setItemCheckedSchema)`（`packages/api-contract/src/shopping-list.schema.ts`
  L36-38）。
- `packages/application/src/shopping-list/set-item-checked.use-case.ts` L32-37: 現在の
  `item.status` と `input.checked` が既に一致する場合は Domain 呼び出しをスキップする冪等設計。
  これにより**同一の望む状態を何度再送しても安全**（キューの重複再送・二重フラッシュに対する
  安全網として利用する）。

### Service Worker（`apps/web/src/app/sw.ts`。変更しないが干渉がないことを確認済み）

- L64-74: `GET /api/shopping-lists/:id` のみを `NetworkFirst`（`networkTimeoutSeconds: 3`）で
  ランタイムキャッシュする。L64-65 のコメントで「POST（bought/target-store/items 追加）を
  誤ってキャッシュ対象にしないよう matcher で GET を明示する」と明記されており、`checked` への
  POST は Serwist のハンドラにマッチしない。
- Serwist/Workbox の一般的な挙動として、`runtimeCaching` にマッチしないリクエストは
  `respondWith()` されず通常のブラウザのネットワークフェッチにフォールバックする。したがって
  オフライン時の `checked` POST はブラウザの `fetch` がそのまま例外を投げる（現行の `catch`
  ブロックと同じ経路）。**本設計はこの前提の上に成り立っており、`sw.ts` を変更しなくても
  アプリ層だけで失敗検知ができる。**
- L83-93: `/shopping-lists` 配下のページ（RSC ペイロード含む）も `NetworkFirst` でキャッシュ
  される。オフライン再訪問時は直前のキャッシュが使われるため、画面マウント時のキュー復元
  （FR-5）は「キャッシュされた古いページ + IndexedDB から読み込んだ未同期分の上書き」という
  組み合わせで成立させる必要がある（§フロントエンド設計）。

### 依存パッケージ

`apps/web/package.json`（L22-49 `dependencies`、L50-69 `devDependencies`）を確認した。
IndexedDB 用のラッパーライブラリ（`idb` / `dexie` 等）は**未導入**。他に PWA 関連では
`@serwist/next` / `serwist` のみが存在する。

## 変更後構成

### レイヤー別の変更概要

| レイヤー       | 変更内容                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain         | 変更なし                                                                                                                                                                   |
| Application    | 変更なし                                                                                                                                                                   |
| api-contract   | 変更なし                                                                                                                                                                   |
| Infrastructure | 変更なし                                                                                                                                                                   |
| Hono ルート    | 変更なし（既存 `checked` ルートをそのまま再利用）                                                                                                                          |
| Presentation   | `shopping-list-client.tsx` の `handleSetChecked` 拡張・キュー再送トリガー追加。`store-group.tsx`/`shopping-item-row.tsx` に「未同期」表示を追加。新規モジュール 2 点を追加 |

### 新規モジュール

**`apps/web/src/app/shopping-lists/_utils/checked-sync-queue.ts`**（IndexedDB ラッパー。純粋関数・React 非依存）

```ts
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

export async function enqueueCheckedOp(
  op: Omit<QueuedCheckedOp, 'enqueuedAt' | 'attempts'>,
): Promise<void>;
export async function listCheckedOps(): Promise<QueuedCheckedOp[]>;
export async function deleteCheckedOp(key: string): Promise<void>;
export async function bumpAttempts(key: string): Promise<void>;
```

**`apps/web/src/app/shopping-lists/_utils/use-checked-sync-queue.ts`**（React フック）

```ts
interface UseCheckedSyncQueueResult {
  /** 現在キューに残っている itemId の集合（行の「未同期」表示に使う。P-6）。 */
  pendingItemIds: ReadonlySet<string>;
  /** ネットワーク例外時にキューへ積み、確定 state を更新するコールバック。handleSetChecked から呼ぶ。 */
  enqueue: (input: { shoppingListId: string; itemId: string; checked: boolean }) => Promise<void>;
  /** online / focus / mount から呼ぶ。キューを再送し、成功分を items へ反映する。 */
  flush: () => Promise<void>;
}

export function useCheckedSyncQueue(params: {
  items: ShoppingItemDto[];
  setItems: Dispatch<SetStateAction<ShoppingItemDto[]>>;
  shoppingListId: string;
}): UseCheckedSyncQueueResult;
```

`shopping-list-client.tsx` は `useCheckedSyncQueue` を呼び出し、`pendingItemIds` を
`StoreGroup`/`ShoppingItemRow` に中継し、`handleSetChecked` の `catch` 節から `enqueue` を呼び、
`online` イベントと `handleFocus`（既存 L139-148）から `flush` を呼ぶ形に拡張する。

### 設計判断（P-1〜P-9）

#### P-1: キューの粒度（coalesce vs 操作列の全保持）

| 案        | 内容                                                                                                       | 長所                                                                                                                   | 短所                                                                                                                                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A（推奨） | 同一 itemId は最新の望む状態 1 件へ集約（`put` による上書き。キーを `${shoppingListId}:${itemId}` にする） | 実装が単純。ストレージ使用量が品目数に比例し増え続けない。`checked` は絶対値（Set 操作）であり中間状態を送る必要がない | オフライン中の操作履歴（チェック→解除→チェックの回数など）は残らない                                                                                                            |
| B         | 操作のたびに配列へ追記し、再送時は記録順にすべて送る                                                       | 操作履歴が残る                                                                                                         | `checked` はトグルの列ではなく Set 操作のため、最終的にサーバーへ反映すべきは最新値のみ。中間状態を律儀に送っても意味がなく無駄なリクエストが増える。ストレージが際限なく増える |

**推奨: 案 A**。`SetItemCheckedUseCase` は「望む状態」を受け取る Set 操作であり
（`docs/designs/shopping-list-item-check.md` §API設計の設計判断表、案 A の推奨理由と同じ思想）、
中間状態を送る価値がないため。

#### P-2: 楽観値の寿命（本設計の核心）

現状（背景節で引用）は `catch` に落ちても `setItems` を呼ばないため、`useOptimistic` の
transition 終了時に楽観値が確定 state（元の値）へ戻る。これはオンライン時の「サーバーが
拒否したら元に戻す」という正しいロールバック挙動だが、オフライン時には「操作が失われた」ように
見えてしまう。

| 案        | 内容                                                                                                                                                                            | 長所                                                                                                                                                                                                                             | 短所                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A         | `useOptimistic` を廃止し、確定 state のみで管理する（送信前に `setItems` で直接更新し、失敗時のみ手動でロールバックする）                                                       | シンプル。ただし本タスクの範囲を超える                                                                                                                                                                                           | オンライン時の即時反映という既存の UX（S-4 案 B の意図）を壊す。`handleMarkAsBought` 等の既存の他操作との一貫性も失われる。スコープ外の広範な変更になる |
| B（推奨） | `useOptimistic` は現状のまま維持しつつ、`catch` 節を「ネットワーク例外」と判定した場合だけ、ロールバックの代わりに `setItems` で確定 state 側へ直接パッチを反映し、キューへ積む | 既存の `useOptimistic` パターン（S-4 案 B）・他操作（`handleMarkAsBought` 等）は無変更。`catch` 節の分岐を 1 箇所拡張するだけで済む。4xx（422/404）の場合は従来どおりロールバック（`setItems` を呼ばない）ため既存挙動と完全互換 | 「オフラインで確定 state を直接書き換える」という、他の操作にはない特殊な経路が 1 つ増える（コメントで意図を明記する必要がある）                        |

**推奨: 案 B**。`useOptimistic` の「transition 完了で確定 state に収束する」という性質を逆手に
取り、**確定 state 側にオフライン時の望む状態を先出しで書き込む**ことで、`useOptimistic` の
仕組みを変えずに「チェックしたまま表示され続ける」を実現する。要点：

```ts
try {
  const response = await client.api[...].checked.$post({ ... });
  if (!response.ok) {
    const status: number = response.status;
    if (status === 404) { return; }  // E-02: 何もせず終了（既存 handleRemoveItem と同じ思想）
    itemsAction.setErrorMessage(resolveItemFailureMessage(status));  // E-01: 422 等は従来どおり
    return;
  }
  const updated = await response.json();
  setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
} catch {
  // ここが拡張点（P-2 案B）。オンライン確認ができない = オフラインとみなし、
  // 従来の setErrorMessage の代わりに「確定 state への反映 + キュー投入」を行う。
  setItems((current) =>
    current.map((item) =>
      item.id === itemId
        ? checked
          ? { ...item, status: 'bought' }
          : { ...item, status: 'pending', actualPrice: null, actualStoreId: null }
        : item,
    ),
  );
  await enqueue({ shoppingListId: shoppingList.id, itemId, checked });
}
```

上記コード例は設計意図を示す参考実装であり、最終的な変数名・分岐の書き方は実装者の裁量とする。
`submittingItemId` のクリア（`finally`）は既存のまま維持し、ユーザーはキュー投入後すぐに
同じ品目を再度タップできる（オフライン中に何度もトグルしても coalesce されるため安全。P-1）。

#### P-3: 再送トリガーとリトライ間隔・バックオフ

| トリガー                                          | 発火タイミング                             | 採用可否                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `online` イベント                                 | ブラウザがネットワーク接続を検知したとき   | 採用（FR-3）                                                                                                                                        |
| 既存の `focus` イベント（L139-148 `handleFocus`） | タブ・アプリがフォアグラウンドに戻ったとき | 採用（FR-4）。iOS の PWA では `online` イベントの発火が不安定なケースがあるため、フォーカス復帰を保険にする                                         |
| マウント時                                        | 画面初回表示・再訪問時                     | 採用（FR-5）。オフラインのままタブを閉じて後日再度開いたケースを拾う                                                                                |
| `visibilitychange`                                | タブの表示/非表示切り替え                  | 不採用（見送り）。`focus` と発火タイミングが大きく重複し、実装を複雑にする割に検知範囲の増分が小さいと判断。実装者の裁量で `focus` と併用してもよい |
| タイマーによる定期ポーリング／指数バックオフ      | 一定間隔で再送を試みる                     | **不採用**。理由は下記                                                                                                                              |

**バックオフ方針（不採用の理由を含む）**: 本設計は再送を「接続状態が変化したことを示す実イベント
（`online`/`focus`/マウント）」にのみ紐づけ、時間経過だけで再試行するタイマー・指数バックオフは
持たない。理由は、(1) オフライン中にタイマーを回し続けても成功しないリクエストを繰り返すだけで
無意味かつバッテリーを消費する、(2) 個人開発規模でサーバー側のレート制限等を気にする必要がなく、
複雑な間隔制御を導入する価値が薄い、(3) 既存の「更新」ボタン（L368-377）が手動トリガーとして
フォールバックになる、ため。

ただし同一トリガーが短時間に重複発火（例: `online` と `focus` がほぼ同時に発火）した場合の
二重フラッシュを防ぐため、フック内部に「フラッシュ中フラグ」（`useRef<boolean>`）を持たせ、
実行中は新規フラッシュ要求を無視する（`SetItemCheckedUseCase` 自体が冪等なため安全側に振れるが、
無駄なリクエストを避けるためのローカルな排他制御として設ける）。

**送信失敗時の扱い**: 個々のエントリの送信がネットワーク例外で失敗した場合はキューに残し
`attempts` をインクリメントする（§P-7 で上限を規定）。同一フラッシュ内で複数エントリのうち
一部が失敗しても、成功したエントリは削除し処理を継続する（後述エラー処理 (d) 部分失敗）。

#### P-4: 既存の focus 再取得（`handleRefetch`）との順序

現状の `handleFocus`（L139-148）は `handleRefetch({ silent: true })` を直接呼ぶだけである。
これをキュー再送を先に完了させてから呼ぶ順序に変更する。

```
handleFocus():
  await flush()          // 1. キューに残っている未同期分をまず送信する
  await handleRefetch({ silent: true })  // 2. その後にサーバーの最新状態を取得する
```

**理由**: 順序を逆にすると、`handleRefetch` の `onSuccess`（L130-134）が無条件に
`setItems(dto.items)` でサーバー値を上書きするため、まだ送信できていないローカルの「未同期」
変更がサーバーの古い値で消されてしまう（データロス）。

**さらなる防御（`flush` が完全に成功しなかった場合）**: `flush` 自体がネットワーク断で失敗し
キューにエントリが残った状態で `handleRefetch` を呼ぶケースがありうる（例: `flush` の途中で
再びオフラインに戻った）。この場合、`handleRefetch` の `onSuccess` は「キューに残っている
itemId」についてはサーバー値で上書きせず、ローカルの未同期値を優先して保持するようにマージする。

```ts
onSuccess: (dto) => {
  setItems((current) =>
    dto.items.map((serverItem) =>
      pendingItemIds.has(serverItem.id)
        ? (current.find((c) => c.id === serverItem.id) ?? serverItem)
        : serverItem,
    ),
  );
  itemsAction.setErrorMessage(null);
},
```

同様に、手動「更新」ボタン（`onClick={() => void handleRefetch({ silent: false })}`, L372）も
同じマージ規則を通す（`handleRefetch` 自体を共通化しているため自然に適用される）。

#### P-5: 失敗の分類

| 分類                             | 判定                                                   | 扱い                                                                                                                                               |
| -------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| ネットワーク例外（オフライン等） | `fetch` が例外を投げる（`catch` 節）                   | キューへ積む・再送対象（FR-1, N-02）                                                                                                               |
| 4xx: 422（リスト `completed`）   | `response.ok === false` かつ `response.status === 422` | キューへ積まない。既存エントリがあれば破棄し、`resolveItemFailureMessage(422)`（既存関数 L56-58）でエラー表示する（E-01）                          |
| 4xx: 404（品目が既にない）       | `response.status === 404`                              | キューへ積まない・エラー表示もしない（`handleRemoveItem` の 404 許容 L244-250 と同じ思想。E-02）                                                   |
| 5xx                              | `response.ok === false` かつ `response.status >= 500`  | ネットワーク例外と同様に一時的な障害とみなし再送対象とする（サーバー再起動等からの回復を期待する）。ただし attempts 上限・TTL は同じ扱いで適用する |

**フラッシュ時の判定**: オンライン時の `handleSetChecked` 単発実行（キューを経由しない通常経路）
では 404/422 の分岐は既存のまま変更しない。キューの `flush` 処理では、送信結果に応じて
上記の分類を適用し、404/422 はキューエントリを削除、ネットワーク例外/5xx は残す。

#### P-6: 未同期状態の UI 表現

| 案        | 内容                                                                                                                               | 長所                                                                                                                                                                                      | 短所                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A（推奨） | 行単位のマーク。`ShoppingItemRow` のチェックボタン付近に小さいインジケーター（例: 「未送信」バッジやオレンジ系のドット）を表示する | どの品目が未同期かが一目でわかる。既存の `submitting`（disabled 表示）と混同しないよう別の視覚表現にできる。行単位の粒度は既存の `submittingItemId`/`expandedItemId` の設計思想と一貫する | 行数が多いと視認性がやや下がる（ただし買い物リストの品目数は小規模）                                     |
| B         | 件数バッジ（画面上部に「3件未送信」等）                                                                                            | 実装が最小。ヘッダー1箇所で完結                                                                                                                                                           | どの品目が未同期かは分からない。チェックを外したくても対象が識別できない                                 |
| C         | バナー（画面全体に「オフラインです。復帰後に自動送信します」）                                                                     | オンライン/オフライン状態そのものを伝えられる                                                                                                                                             | 個々の未同期品目は分からない。既存の `itemsAction.errorMessage` バナー（L381-385）と視覚的に競合しやすい |

**推奨: 案 A + 補助的に案 C の簡易版**。行単位のマークで「どれが」未同期かを示し、
1件以上未同期がある間だけ画面上部に軽量な状態文言（例:「オフライン中の変更があります。
オンラインになると自動的に送信されます」）を出す。既存の `syncMessage` 表示パターン
（L398-402、`handleSync` 用）と同じスタイルの `<p>` 要素を流用でき、新規 UI プリミティブの
追加は不要（D-4 の「新規 UI プリミティブは追加しない」方針を継承）。

`ShoppingItemRow` への Props 追加案:

```ts
interface Props {
  // ...既存
  /** true のとき、この品目はオフラインキューに積まれ未送信であることを示す（P-6）。 */
  unsynced: boolean;
}
```

チェックボタン disabled 判定（`locked = submitting || readOnly`, L61）は**変更しない**
（未同期の品目もタップして状態を再変更できる必要がある。§P-2 コード例のとおり `enqueue` は
coalesce されるため安全）。`unsynced` は見た目のみに使う。

#### P-7: 永続化のキー設計とスコープ、上限・TTL

- **DB 名**: `cookpit-offline-queue`（バージョン 1）。
- **オブジェクトストア名**: `checkedOps`、`keyPath: 'key'`。
- **キー設計**: `` `${shoppingListId}:${itemId}` ``（複合キーの文字列結合）。
  `itemId` は UUID でありドメイン上は単独でも一意だが、明示的に `shoppingListId` を含めることで
  「どのリストの品目か」がキーだけで判別でき、複数リストにまたがるデバッグ・将来のクエリ拡張
  （リスト単位でのフィルタ等）が容易になるため複合キーを推奨する。
- **スコープ**: ストア自体は画面（リスト）をまたいだグローバル 1 本とし、`flush` は
  「現在マウントされているどのリスト画面からでも、キューに残っている全エントリを対象に」実行する。
  理由: 品目を追加したリストとは別のリストを開いている間にオンライン復帰した場合でも同期を
  進められるようにするため（B-05 で除外される追加操作以外は、ユーザーがどのリストを開いていても
  オフライン中の書き込みは可能な限り早く同期したい）。ただし「未同期」の行表示（P-6）は
  現在表示中のリストの itemId のみでフィルタする。
- **上限**: ハードリミットは設けない（B-03。買い物リストの品目数自体が小規模なため、
  IndexedDB のクォータに到達する事態は実運用上想定しにくい）。
- **TTL**: エンキューから 24 時間（買い物という行為の単位が「その日」であり、翌日以降まで
  古いチェック意図を持ち越す価値が薄いため）。`flush` 実行のたびに `enqueuedAt` を確認し、
  超過エントリは送信を試みずに破棄する（E-05）。
- **attempts 上限**: 5 回（防御的な上限。TTL が主たる歯止めであり、この上限に到達する前に
  TTL 超過で削除されるケースが大半になる想定だが、「短時間に何度もオンライン/オフラインを
  行き来する」極端なケースへの保険として設ける）。上限到達時はエントリを破棄し、
  `itemsAction.setErrorMessage` 相当の手段でユーザーに同期不能を通知する（E-04）。

#### P-8: IndexedDB を素の API で書くか、`idb` 等を新規追加するか（要ユーザー確認・未確定）

| 案                | 内容                                                                                                                                      | 長所                                                                                                                                                                | 短所                                                                                                                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A                 | 素の `indexedDB` API（`IDBDatabase`/`IDBTransaction`/`IDBRequest`）をコールバックベースで直接記述する                                     | 新規依存ゼロ                                                                                                                                                        | イベントハンドラベースの API を Promise でラップする定型コードが `checked-sync-queue.ts` 内に数十行必要になり、可読性・保守性が下がる。エラーハンドリング（`onerror`/`onblocked`/`onupgradeneeded`）を自前で正しく書く必要がある |
| B（推奨・要確認） | `idb`（Jake Archibald 製、`openDB` ベースの薄い Promise ラッパー。gzip 後 1KB 台）を `apps/web/package.json` の `dependencies` に追加する | コードが大幅に簡潔になる（`openDB`/`db.put`/`db.getAll`/`db.delete` の数行で完結）。型定義が同梱されており `any` を使わずに書ける。広く使われており保守リスクが低い | **新規依存の追加**であり `CLAUDE.md` の行動制約「新規ファイルの作成・既存ファイルの削除は、必ず事前に確認を取る」に準ずる形でユーザー確認が必要。継続費用は発生しない（npm パッケージのため）                                    |

**推奨は案 B（`idb`）だが、本設計では確定しない。** 新規依存の追加はユーザー確認を要する
（本タスクの制約）。ユーザーが素の API を希望する場合は案 A で進める。どちらを選んでも
`checked-sync-queue.ts` の公開インターフェース（P-1 節の型定義）は変わらないため、実装計画・
試験計画への影響は「内部実装の差」に限定される。

#### P-9: 2人運用での競合（Last-Write-Wins の容認）

| 案        | 内容                                                                                                                                                                                | 長所                                                                                                                                                                                                   | 短所                                                                                                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A（推奨） | 既存の `markAsBought`/`reassignStore`/`checked` と同じ Last-Write-Wins を踏襲する。復帰時にキューを送信した内容がそのままサーバーの最終状態になる（バージョンチェック等は行わない） | 実装コスト最小。既存の設計思想（`docs/designs/shopping-list-item-check.md` §エラー処理「A がチェック → B が外す…は既存の Last-Write-Wins の設計に揃える」）と一貫する。Domain/Application の変更が不要 | オフライン時間が長引くほど「自分が知らない間に相手が行った変更」を後から上書きしてしまうリスクが実時間操作より高くなる（相手の変更を見ずに古い意図を送信するため）                                                     |
| B         | 楽観的ロック（バージョン番号・`updatedAt` の比較）を導入し、競合時はエラーを返してユーザーに再確認させる                                                                            | 意図しない上書きを防げる                                                                                                                                                                               | `ShoppingItem`/`ShoppingList` 集約へのバージョンフィールド追加が必要（Domain/Application/Infrastructure/api-contract すべてに影響）。本設計の制約「変更は Presentation 層に閉じる」を超え、L3 の再スコープが必要になる |

**推奨: 案 A**。既存の全操作が Last-Write-Wins である以上、`checked` だけを特別扱いする理由が
薄く、Presentation 層に閉じるという本タスクの制約とも整合する。ただし「オフライン時間が長い分
だけリスクが実時間操作より高い」ことは新しい観測であり、リスクとして明記し（§リスク R-3）、
ユーザーへの認識合わせを未決事項に残す。

## データフロー

### オフライン時のチェック（新規）

```
[shopping-item-row.tsx] チェックボタン tap
  → onSetChecked(itemId, !bought)
  → [shopping-list-client.tsx] handleSetChecked
      1. setOptimisticItems({ type: 'patch', ... })  // 即時反映（既存 L196-202、無変更）
      2. fetch POST .../checked  → オフラインのため例外
      3. catch:
         a. setItems(...) で確定 state に望む状態を直接書き込む（P-2）
         b. useCheckedSyncQueue().enqueue({ shoppingListId, itemId, checked })
            → IndexedDB へ put（P-1: 同一 itemId は上書き）
      4. finally: setSubmittingItemId(null)
      → 再レンダリング: useOptimistic は変化済みの items を基準に再計算 → チェック状態は
        「ついたまま」表示される（P-2 の狙いどおり）。pendingItemIds に itemId が含まれ、
        行に「未同期」マークが表示される（P-6）
```

### オンライン復帰時の再送（新規）

```
window 'online' イベント / handleFocus（既存 L139-148 を拡張）
  → useCheckedSyncQueue().flush()
      1. listCheckedOps() で全エントリ取得
      2. 各エントリについて TTL 超過（P-7）なら破棄して次へ
      3. POST .../checked を送信
         - 成功 → deleteCheckedOp(key) し、setItems で確定値に更新（サーバー DTO を反映）
         - 404 → deleteCheckedOp(key)（E-02。エラー表示なし）
         - 422 → deleteCheckedOp(key) + エラーメッセージ表示（E-01）
         - ネットワーク例外/5xx → bumpAttempts(key)。attempts が上限超過なら破棄 + エラー表示（E-04）
      4. すべて処理後、handleFocus 経由の場合のみ後続で handleRefetch({ silent: true }) を実行
         （P-4）。手動フラッシュ（オンラインイベント単独）では実行しない
```

## API 設計

新規エンドポイントの追加はない。既存の `POST /api/shopping-lists/:id/items/:itemId/checked`
（`apps/web/src/server/routes/shopping-lists.ts` L77-88、契約は
`packages/api-contract/src/shopping-list.schema.ts` L36-38 `setItemCheckedSchema`）を、
（a）通常のオンライン操作、（b）キューからの再送、の 2 経路から同一の形で呼び出す。
呼び出しパラメータ・レスポンス形状・エラー形状（`{ error: string }` / 404 / 422）はすべて
`docs/designs/shopping-list-item-check.md` §API設計・§Contract の確定内容から変更しない。

## DB 設計

### サーバー側（Neon PostgreSQL）

変更なし。`shopping_items` テーブル・マイグレーションともに対象外
（`docs/designs/shopping-list-item-check.md` §DB設計で確認済みのとおり、`status`/`actualPriceAmount`/
`actualStoreId` は既に nullable でチェックのみの状態を表現できる）。

### クライアント側（IndexedDB。新規）

P-7 の決定に基づくスキーマ:

| ストア                                      | キー                                           | フィールド                                                                               | 用途                                   |
| ------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| `checkedOps`（DB: `cookpit-offline-queue`） | `key: string`（`${shoppingListId}:${itemId}`） | `shoppingListId`, `itemId`, `checked: boolean`, `enqueuedAt: number`, `attempts: number` | オフライン中のチェック操作の永続キュー |

インデックスは設けない（想定件数が小規模で `getAll()` + JS 側フィルタで十分。P-7）。

## フロントエンド設計

### `shopping-list-client.tsx` の変更

- `useCheckedSyncQueue({ items, setItems, shoppingListId: shoppingList.id })` を呼び出し、
  `pendingItemIds` / `flush` を得る。
- `handleSetChecked` の `catch` 節を P-2 のコード例のとおり拡張する。
- 既存の `useEffect`（L139-148）を拡張し、`handleFocus` 内で `await flush()` を先に実行してから
  `handleRefetch({ silent: true })` を呼ぶ（P-4）。
- 新規 `useEffect` で `window.addEventListener('online', () => void flush())` を登録する（P-3）。
  クリーンアップで `removeEventListener` する（既存の focus effect と同じパターン）。
- マウント時（`useCheckedSyncQueue` 内部、または `shopping-list-client.tsx` 側の追加
  `useEffect`）で 1 度 `flush()` を試みる（FR-5, N-06）。オフラインのままなら各エントリで
  ネットワーク例外が発生し、attempts がインクリメントされるだけで実害はない。
- `handleRefetch` の `onSuccess`（L130-134）を P-4 のマージ規則に変更する。
- 1 件以上 `pendingItemIds` があるあいだ、既存の `syncMessage` 表示（L398-402）と同じ位置・
  スタイルで簡易バナーを表示する（P-6）。

### `store-group.tsx` / `shopping-item-row.tsx` の変更

- `store-group.tsx`: 新規 `pendingItemIds: ReadonlySet<string>` を受け取り、
  `unsynced={pendingItemIds.has(item.id)}` として `ShoppingItemRow` へ中継する
  （既存の `submittingItemId` → `submitting` 変換と同じパターン、L58-59）。
- `shopping-item-row.tsx`: `unsynced` prop を受け取り、チェックボタン付近に小さいインジケーター
  （例: `<span className="text-[10px] text-muted-foreground">未送信</span>` 相当）を表示する。
  既存の `bought && item.actualPrice !== null` 表示（L124-128）と同様の条件付き表示として追加する。
  デザイントークン（`--primary` テラコッタ等）を流用し新規カラーパレットは追加しない
  （D-4 方針の継承）。

## バックエンド設計

対象外（変更なし）。`SetItemCheckedUseCase`（`packages/application/src/shopping-list/set-item-checked.use-case.ts`）
・Hono ルート・api-contract のいずれも変更しない。本設計はこの既存の冪等な Set 操作の性質
（L32-37）にフロントエンド側の再送ロジックを乗せる形で完結する。

## エラー処理

本設計は「外部ストレージ（IndexedDB）への新規 I/O」と「既存 HTTP エンドポイントに対する
再送ロジックの新設」そのものが主題であるため、`create-design-document` Skill が要求する
5 項目を明記する。

**(a) リトライ**: 無限リトライはしない。トリガーは実イベント（`online`/`focus`/マウント）のみで
タイマーによる自動再試行は行わない（P-3）。各エントリの再送試行回数は最大 5 回
（`attempts` フィールド、P-7）。上限到達時は破棄しエラー表示する（E-04）。

**(b) タイムアウト**: 個々の `fetch` 呼び出しに新規のタイムアウト（`AbortController` 等）は
設けない。既存の `handleSetChecked`（オンライン時の通常経路）も現状タイムアウトを持たないため、
本設計もこれに合わせる（挙動の一貫性を優先）。ブラウザ標準のタイムアウト・オフライン検知に
委ねる。**既知のギャップ**として、電波が不安定で「オフラインではないが極端に遅い」状況では
`fetch` が長時間ペンディングし続け、`submittingItemId` がロックされたままになりうる。これは
本設計固有の新規リスクではなく既存の `handleSetChecked`/`handleMarkAsBought` にも共通する
既存のギャップであり、本タスクのスコープでは対応しない（気づきとして記録）。

**(c) 冪等性**: `SetItemCheckedUseCase` が「望む状態が既に一致していれば no-op」という冪等設計
（L32-37）を持つため、キューからの重複送信・二重フラッシュがあっても安全側に倒れる。クライアント
側でも P-1 の coalesce（`put` による上書き）と P-3 のフラッシュ中フラグにより、同一エントリの
並行送信を実務上発生させない設計にしている。

**(d) 部分失敗**: `flush` は複数エントリを 1 件ずつ処理し、成功したものはその都度キューから
削除する。1 件の失敗（ネットワーク例外・5xx）が他のエントリの処理を止めることはない
（`Promise.allSettled` 相当のエントリ単位の独立処理。実装は for-of による逐次処理でも
`Promise.allSettled` による並列処理でも設計上どちらでもよく、実装者の裁量とする。ただし各
エントリの成否が他に影響しないことは必須要件とする）。ロールバック・補償処理は不要
（各エントリは独立した Set 操作であり、途中失敗しても既に成功した分の一貫性は保たれる）。

**(e) フォールバック**: IndexedDB のオープンに失敗した場合（プライベートブラウジングでの
制限・ストレージ拒否等。E-06）、`checked-sync-queue.ts` はエラーを投げずに「キュー機構が
使えない」ことを示す状態を返し、`use-checked-sync-queue.ts` はこれを検知して `enqueue`/`flush`
を no-op にフォールバックする。この場合 `handleSetChecked` の `catch` 節は**現行のまま**
（`itemsAction.setErrorMessage(NETWORK_ERROR_MESSAGE)`）に自動的に戻る（P-2 の分岐で
「キューが使える場合のみ」新しい経路に入るようにガードする）。これにより IndexedDB が
使えない環境でも既存の挙動を壊さず安全に縮退する。

## ログと監視

- 新規の外部監視基盤は追加しない（個人開発規模。既存の Hono `onError` の `console.error` +
  500 ログ運用を踏襲する方針、`docs/designs/shopping-list-item-check.md` §ログと監視と同じ）。
- キューエントリを破棄する経路（TTL 超過・attempts 上限超過・IndexedDB オープン失敗）では、
  デバッグ用に `console.warn` を残すことを推奨する（実装者の裁量。ユーザー向け通知は
  エラーバナーで別途行うため、`console.warn` はあくまで開発時の追跡用）。

## セキュリティ

- 認証なし MVP1/MVP2 の既存信頼モデル（`docs/decisions/ADR-0003-no-auth-in-mvp1.md`）を維持する。
  新規の認可判断は発生しない。
- IndexedDB は同一オリジンのみアクセス可能なブラウザ標準の分離境界に依存する。第三者オリジンから
  読み取られることはない。
- キューに保存するデータは `shoppingListId`/`itemId`（UUID）と `checked`（真偽値）のみで、
  価格・個人情報等の機微情報は含まない。

## 性能

外部 API（第三者サービス）への新規 I/O ではなく、既存の内部エンドポイント呼び出し方の変更と、
端末内 IndexedDB への小規模 I/O の追加である（`docs/claude-code/agent-responsibilities.md` の
性能設計の適用条件「Infrastructure 経由の外部 API/外部ストレージへの I/O を新設・変更する」は
サーバー側 Infrastructure 層を指しており、本変更はサーバー側 Infrastructure に触れないため
性能セクションを厚くする条件には該当しない。以下は参考情報として軽く記載する）。

- IndexedDB の読み書きは 1 リストあたり想定十数件以下・1 件数十バイトのレコードであり、
  体感遅延・ストレージ圧迫は想定しにくい（推定。実測は行っていない）。
- `flush` によるサーバーへのリクエスト数は「オフライン中に発生した変更の件数」に比例するのみで、
  既存のポーリング等は追加しない。N+1 やサーバー側インデックス追加の必要はない（サーバー側は
  無変更のため）。
- `online`/`focus` のイベントリスナーはブラウザ標準の軽量な仕組みであり、追加の性能リスクは
  想定しない。

## テスト方針

Vitest（`apps/web/vitest.dom.config.mts` は `environment: 'happy-dom'`、
`apps/web/vitest.node.config.mts` は `environment: 'node'`）。

**既知の確認事項（実装着手前に要確認）**: `happy-dom` が `indexedDB` グローバルを実装しているかを
本タスク実行環境では一次情報で確認できていない。実装していない場合、`checked-sync-queue.ts` の
単体テストには `fake-indexeddb` 等のポリフィルパッケージの追加が必要になる可能性があり、これも
新規 devDependency の追加としてユーザー確認が要る（P-8 の `idb` 追加判断と合わせて実装計画時に
確認することを推奨する）。

### `apps/web/src/app/shopping-lists/_utils/checked-sync-queue.test.ts`（新規）

- `enqueueCheckedOp` → `listCheckedOps` で往復し、同一内容が読めること。
- 同一 `key` で 2 回 `enqueueCheckedOp` すると 1 件に上書きされること（P-1 の coalesce）。
- `deleteCheckedOp` 後は `listCheckedOps` に含まれないこと。
- `bumpAttempts` で `attempts` が増加すること。

### `apps/web/src/app/shopping-lists/_utils/use-checked-sync-queue.test.ts`（新規）

- `enqueue` 呼び出し後、`pendingItemIds` に itemId が含まれること。
- `flush` 成功時、`pendingItemIds` から除去され `setItems` が呼ばれること。
- `flush` が 404 を受けた場合、エラー表示なしでキューから除去されること（E-02）。
- `flush` が 422 を受けた場合、エラー表示ありでキューから除去されること（E-01）。
- `flush` がネットワーク例外を受けた場合、キューに残り `attempts` が増えること（E-03）。
- `attempts` が上限を超えたエントリは破棄されること（E-04）。
- `enqueuedAt` が TTL を超えたエントリは送信せず破棄されること（E-05）。
- IndexedDB のオープンに失敗した場合、`enqueue`/`flush` が例外を投げず no-op になること（E-06）。

### `apps/web/src/app/shopping-lists/_components/shopping-list-client.test.tsx`（既存拡張）

- オフライン相当（`fetch` をネットワーク例外でモック）で `handleSetChecked` を呼んだとき、
  `items` の該当行が望む状態のまま維持されること（P-2。従来の「ロールバックされる」挙動との
  差分を検証する新規テスト）。
- `handleFocus` 相当の処理で、`flush` が `handleRefetch` より先に完了することを順序付きモックで
  検証する（P-4）。
- `flush` 未完了のままサーバー応答を受けた場合、`pendingItemIds` に含まれる itemId は
  サーバー値で上書きされないこと（P-4 のマージ規則）。

### `apps/web/src/app/shopping-lists/_components/store-group.test.tsx` /

`apps/web/src/app/shopping-lists/_components/shopping-item-row.test.tsx`（既存拡張）

- `unsynced` prop が `true` のとき、未同期インジケーターが表示されること。
- `unsynced` が `true` でもチェックボタンの `disabled` は `submitting`/`readOnly` のみで
  決まり、`unsynced` 単体では disable されないこと（§フロントエンド設計）。

## 移行とリリース

- マイグレーション不要（サーバー側 DB 変更なし）。
- 段階的リリース（フィーチャーフラグ等）は導入しない。個人開発規模のため一括デプロイで問題ない。
- **実装着手の前提条件**: P-8（`idb` 追加）・テスト方針の IndexedDB ポリフィル要否の 2 点は
  実装計画（`docs/implementation-plans/offline-write-queue.md`）作成前にユーザー確認を推奨する。
  確認が取れない場合は「素の IndexedDB API」を暫定の既定値として進めることもできるが、
  コード量・保守性の観点で `idb` を推奨する（P-8）。
- `docs/05-roadmap.md` L715 の「（Background Sync）」表記は本設計により実態と異なることになる。
  本タスクでは roadmap ファイル自体の更新は行わない（要件書§未決事項 5 のとおり Orchestrator へ
  申し送る）。

## リスク

| ID  | リスク                                                                                                                                                                                                   | 影響                                                                                                                                     | 対策                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | iOS Safari が将来 Background Sync に対応した場合、より堅牢な再送（`sw.ts` 経由・タブ閉鎖中も再送）を補強として積んでいない                                                                               | 現状の主対象（iPhone PWA）では非対応のため実害なし。対応後もアプリ層キューは無駄にならず、Background Sync は追加の補強として後から積める | **2026-08-13 一次情報で非対応を確認**。出典: [MDN BCD `SyncManager`](https://github.com/mdn/browser-compat-data/blob/main/api/SyncManager.json) は `safari` / `safari_ios` とも `version_added: false`（追跡バグ [WebKit 182565](https://bugs.webkit.org/show_bug.cgi?id=182565)）。[caniuse background-sync](https://caniuse.com/background-sync) は Safari on iOS 3.2–26.5 および Safari TP を Not supported。[WebKit standards-positions #14](https://github.com/WebKit/standards-positions/issues/14) は open のまま（`concerns: privacy` / `concerns: power`、肯定的ポジションなし）。Firefox も MDN BCD で `version_added: false` |
| R-2 | iOS は7日間アプリを起動しないとローカルストレージ（IndexedDB 含む）がクリアされる場合がある（`docs/02-tech-stack.md` L116）                                                                              | 長期間放置された未同期エントリが黙って消える                                                                                             | 本設計の TTL（24時間）はこれより十分短く、実害は限定的（7日間より前に TTL 側で破棄される想定）。エントリ消失時にユーザーへ明示通知する仕組みは持たない点は許容リスクとして記録                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| R-3 | Last-Write-Wins のまま（P-9）。オフライン時間が長引くほど、相手の変更を知らずに上書きするリスクが実時間操作より高い                                                                                      | 稀に意図と異なる最終状態になる（既存の R-3 相当リスクの延長。`docs/designs/shopping-list-item-check.md` R-3 参照）                       | 既存の設計思想を踏襲する前提でユーザーへの認識合わせを推奨（要件書§未決事項6）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| R-4 | `happy-dom` の IndexedDB 実装有無が未確認                                                                                                                                                                | 単体テストが書けない、または追加の devDependency が必要になり実装が止まる                                                                | 実装計画着手前に確認（要件書§未決事項3・本設計§テスト方針）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| R-5 | `idb` 追加が承認されない場合、素の IndexedDB API での実装コストが増える                                                                                                                                  | 実装工数の増加                                                                                                                           | P-8 のとおり公開インターフェースは変わらないため、実装計画側で見積りの幅を持たせる                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| R-6 | 既存の `submittingItemId` が単一の `string \| null` であり、複数品目が同時に in-flight でも 1 品目分の disabled 表示しか正しく機能しない既知の制約（本設計はこれを悪化させない設計にしたが解消もしない） | 稀に別品目の操作中に UI 上の disabled 表示がずれる（既存の潜在挙動）                                                                     | 本タスクのスコープ外。気づきとして記録し、修正は別タスクに委ねる                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## 未決事項

`docs/requirements/offline-write-queue.md` §未決事項と共通。設計固有の補足のみ再掲する。

1. **P-8: `idb` パッケージ追加の可否**。推奨は追加だが確定しない。ユーザー確認が必要。
2. **`happy-dom` の IndexedDB 実装有無**（R-4）。実装計画着手前に確認。未実装なら
   `fake-indexeddb` 等の追加要否も合わせて確認する。
3. **P-6: 未同期表示の最終デザイン**（バッジの文言・配置）。本設計は「行内の小さいテキスト
   インジケーター + 1本のバナー」を推奨するが、最終的な文言・配置は実装時の軽微な UI 判断として
   実装者の裁量に委ねてよいか、ユーザー確認を推奨する。
4. **P-7 の TTL（24時間）・attempts 上限（5回）の具体値**。設計上の推奨値であり、実運用での
   体感（土曜の買い物は数時間で終わる想定）から妥当と判断したが、確定値としてユーザー確認を
   推奨する。
5. **R-1: Background Sync の iOS 対応状況の一次情報確認** — **解消済み（2026-08-13）**。
   iOS Safari は非対応。出典は §リスク R-1。案 C（アプリ層キュー）の採用根拠は成立。
   将来 Safari が対応しても本設計は無駄にならず、Background Sync は追加の補強として後から積める。
6. **`docs/05-roadmap.md` L715 の表記更新要否**（実装と同時に更新するか、別タスクにするか）。
