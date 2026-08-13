# 試験計画: offline-write-queue

- 前提となる設計書: `docs/designs/offline-write-queue.md`（ステータス draft。P-1〜P-9 が確定済みの設計判断として本計画の入力）
- 要件書: `docs/requirements/offline-write-queue.md`（FR-1〜12・N-01〜08・E-01〜07・B-01〜06 の採番出典）
- レベル: L3。ただし変更範囲は `apps/web`（Presentation 層）に閉じる。`packages/domain` /
  `packages/application` / `packages/infrastructure` / `packages/api-contract` は無変更。
- 実装計画: `docs/implementation-plans/offline-write-queue.md` は本計画作成時点で未作成（Glob 確認済み）。
  作成され次第、本計画と矛盾がないか照合すること。

---

## 0. 実装コード走査結果（メソッド網羅チェックの前提・設計ギャップの洗い出し）

対象・新規ファイルを Read/Grep で走査した。

| 対象                                | ファイル                                                               | 既存 / 新規 public API                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ShoppingListClient`                | `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx` | `handleSetChecked`（L189-224。`catch` 節が拡張対象）/ `handleFocus`（L139-148 内の無名関数。`flush` → `handleRefetch` の順序拡張対象）/ `handleRefetch`（L124-137。`onSuccess` のマージ規則拡張対象）/ 他の `handleMarkAsBought`/`handleReassignStore`/`handleRemoveItem`/`handleAddItem`/`handleComplete`/`handleReopen`/`handleSync`/`handleToggleExpand`/`handleCompleteRequest` は無変更（回帰対象） |
| `StoreGroup`                        | `apps/web/src/app/shopping-lists/_components/store-group.tsx`          | 既存 Props（`onToggleExpand`/`onSetChecked`/`onMarkAsBought`/`onReassignStore`/`onRequestRemove` 中継）は無変更。新規 `pendingItemIds: ReadonlySet<string>` の受け取り・`unsynced` への変換中継が追加対象                                                                                                                                                                                                |
| `ShoppingItemRow`                   | `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`    | 既存 Props は無変更。新規 `unsynced: boolean` の受け取り・インジケーター表示が追加対象。`locked = submitting \|\| readOnly` の disabled 判定式自体は**変更しない**（設計書 §フロントエンド設計で明記）                                                                                                                                                                                                   |
| `checked-sync-queue.ts`（新規）     | `apps/web/src/app/shopping-lists/_utils/checked-sync-queue.ts`         | `enqueueCheckedOp(op)` / `listCheckedOps()` / `deleteCheckedOp(key)` / `bumpAttempts(key)`（いずれも `Promise` を返す。IndexedDB ラッパーは `idb` を使う想定・P-8確定済み）                                                                                                                                                                                                                              |
| `use-checked-sync-queue.ts`（新規） | `apps/web/src/app/shopping-lists/_utils/use-checked-sync-queue.ts`     | `useCheckedSyncQueue({ items, setItems, shoppingListId })` → `{ pendingItemIds, enqueue, flush }`                                                                                                                                                                                                                                                                                                        |

既存テストの有無: `shopping-list-client.*.test.tsx`（`.view`/`.complete`/`.remove`/`.checked`/`.sync` の 5 ファイル分割）・
`store-group.test.tsx`・`shopping-item-row.test.tsx` が既に存在する。本計画は新規ファイル
（`checked-sync-queue.node.test.ts` / `use-checked-sync-queue.test.tsx` /
`shopping-list-client.offline-queue.test.tsx`）の追加と、既存 `store-group.test.tsx` /
`shopping-item-row.test.tsx` への追記として設計する。

### 0-1. 設計書に明記のない実装ギャップ（走査で判明。実装計画への申し送り事項）

1. **`happy-dom` は `indexedDB`/`IDBKeyRange` を実装していない（実測済み・推測ではない）**。

   ```
   node --input-type=module -e "import { Window } from 'happy-dom'; const w = new Window();
   console.log(typeof w.indexedDB, typeof w.IDBKeyRange)"
   → undefined undefined
   ```

   したがって `checked-sync-queue.ts`/`use-checked-sync-queue.ts` を直接 exercise するテストは
   `fake-indexeddb`（devDependency 追加確定済み）の導入が前提になる。**さらに重要な派生問題**が
   0-2 にある。

2. **`UseCheckedSyncQueueResult` に「キュー利用可否」を示すフィールドが無い**。設計書 §エラー処理 (e)
   は「`checked-sync-queue.ts` はエラーを投げずに『キュー機構が使えない』ことを示す状態を返し、
   `use-checked-sync-queue.ts` はこれを検知して `enqueue`/`flush` を no-op にフォールバックする」
   「`handleSetChecked` の `catch` 節は現行のまま…に自動的に戻る（『キューが使える場合のみ』新しい
   経路に入るようにガードする）」と書いているが、§新規モジュール節の型定義
   （`pendingItemIds`/`enqueue`/`flush` のみ）には、`shopping-list-client.tsx` 側がこの判定をする
   ための公開フィールド（例: `available: boolean`）が存在しない。設計として矛盾しており、
   実装計画で `UseCheckedSyncQueueResult` に可否フィールドを追加するか、`enqueue` 自体を
   「使えないときは何もせず戻り値だけで判別可能にする」規約にするかを確定する必要がある。
   本計画の E-06 関連観点（UOQ-12・LCQ 該当なし）はこの**未確定の契約**を前提に、観測可能な
   振る舞い（`postChecked` が呼ばれない・エラー文言が旧来のものに戻る）で検証する形にとどめ、
   内部フィールド名を断定しない。
3. **全既存 `shopping-list-client` 系 dom テストへの波及リスク（最重要）**。`useCheckedSyncQueue` は
   `ShoppingListClient` から無条件に呼び出される設計であり、マウント時に 1 度 `flush()` を試みる
   （FR-5）。これは「IndexedDB オープン → `listCheckedOps()`」を**既存の全 `LC-*`/`CB-*`/`SY-*` テスト
   でも実行させる**ことを意味する。もし実装が `typeof indexedDB === 'undefined'` を素の API 未対応
   （E-06 相当）として防御的にガードしていない場合、`indexedDB` は未宣言のグローバル識別子として
   参照時に `ReferenceError` を投げ、**この機能と無関係な既存テストまで全滅する**リスクがある。
   本計画では §11 回帰試験範囲でこれを明示的な検証対象にする。対策は 2 択のどちらかを実装計画で
   確定することを推奨する：
   - (a) `checked-sync-queue.ts` が `typeof indexedDB === 'undefined'` を E-06 と同じ「利用不可」
     として扱う（推奨。プライベートブラウジングでの制限と同じ縮退経路に自然に合流する）。
   - (b) `apps/web/vitest.dom.config.mts` の `setupFiles` に `fake-indexeddb/auto` を追加し、
     dom プロジェクト全体で `indexedDB` グローバルを常に利用可能にする。
   - いずれを選んでも、**fake-indexeddb はテスト間でグローバルに状態が残る**ため、キュー関連の
     テストは `afterEach` でストア内容をクリアする必要がある（0-4 参照）。
4. **`StoreGroup`/`ShoppingItemRow` への Props 追加は既存テストヘルパーの `defaults` 更新を要する**。
   `store-group.test.tsx` の `renderStoreGroup()` の `defaults` に `pendingItemIds` が無いまま
   `pendingItemIds` が必須 Props になると型エラーになる。同様に `shopping-item-row.test.tsx` の
   `renderRow()` の `defaults` に `unsynced` が必要（`shopping-list-item-check` の `onSetChecked`
   追加時と同型のパターン。実装計画への申し送り）。
5. **`response.json()` の失敗が `catch` に落ちる経路（Orchestrator 指摘・最重要）**。設計書 P-2 の
   コード例（L232-256）は `await response.json()` が `try` の内側にあるため、200 が返っても本文の
   JSON パースに失敗すると「オフラインと同じ `catch` 節」に入る。この場合サーバー側の書き込みは
   既に成功しているにもかかわらず、UI は「未同期」として扱いキューへ積む（`SetItemCheckedUseCase`
   が冪等なため再送自体は無害だが、意味的な誤判定であることに変わりはない）。本計画は §5 LCQ-09
   でこの挙動を明示的に固定し、リスクとして記録する（コードは変更しないため「バグ」として報告する
   のではなく、設計の既知のギャップとして Orchestrator/reviewer に申し送る）。
6. **TTL・attempts 上限の判定ロジックの所在**: `checked-sync-queue.ts` は `enqueuedAt`/`attempts`
   フィールドを保存するだけで、「現在時刻と比較して破棄するか」の判断ロジックは持たない
   （引数に「今」を必要とする関数が公開されていない）。この判断は `flush()`（`use-checked-sync-queue.ts`
   側）にあると設計書 §データフローに明記されている。したがって TTL/attempts 上限の**enforcement**
   の試験は OQ（データ層）ではなく UOQ（hook 層）・LCQ（結合）に置く。

### 0-2. fake-indexeddb 導入方式（テスト実装者への申し送り）

上記 0-1-3 のとおり、fake-indexeddb を個々のテストファイルで `import 'fake-indexeddb/auto'` する
方式と、`vitest.dom.config.mts` の `setupFiles` へ追加する方式のどちらを取るかで既存テストへの
影響範囲が変わる。本計画は**グローバル導入（`setupFiles`）を推奨**する。理由: 個別 import 方式では
実装が 0-1-3 (a) の防御的ガードを持たない場合に既存テスト（本タスクと無関係な `LC-*` 等）が壊れる
ため、根本原因（`indexedDB` グローバル不在）をテスト環境側でも解消しておくのが安全側。どちらを採用
するかは実装計画で確定すること。

---

## 1. 試験種別

| 種別                   | 対象                                              | ランナー / 手段                                                                                                                                                                                                                                                       | 新規 or 拡張 |
| ---------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 単体（データ層）       | `checked-sync-queue.ts` の 4 関数                 | Vitest node project（`tests/**/*.node.test.ts`）                                                                                                                                                                                                                      | 新規         |
| 単体（フック層）       | `use-checked-sync-queue.ts`                       | Vitest dom project + RTL `renderHook`（`tests/**/*.test.tsx`）                                                                                                                                                                                                        | 新規         |
| 結合（コンポーネント） | `ShoppingListClient` のオフラインキュー経路       | Vitest dom project + RTL（新規ファイル `shopping-list-client.offline-queue.test.tsx`）                                                                                                                                                                                | 新規         |
| コンポーネント拡張     | `StoreGroup`/`ShoppingItemRow` の `unsynced` 表示 | 既存 `store-group.test.tsx`/`shopping-item-row.test.tsx` への追記                                                                                                                                                                                                     | 拡張         |
| 実画面                 | オフライン実機挙動・iOS PWA・7日間クリア          | manual-browser-verify（**§7 参照。dev 環境の制約で一部確認不可**）                                                                                                                                                                                                    | 該当なし     |
| E2E                    | —                                                 | 対象外（既存 `recipe-crud.smoke.spec.ts`/`saturday-flow.spec.ts` は本機能と無関係。新規シナリオは追加しない。理由: オフライン E2E は Playwright の `context.setOffline()` で技術的に可能だが、個人開発規模で新規 E2E 基盤投資までは本タスクのスコープを超えると判断） | —            |

---

## 2. 環境前提（実装前に確定させること）

- `happy-dom`（`apps/web/vitest.dom.config.mts:8`）は `indexedDB` 未実装（0-1-1 の実測結果）。
- `fake-indexeddb` を devDependency として追加する（ユーザー確定済み）。node/dom いずれの環境でも
  純粋な JS 実装のため動作する。
- **状態リセットが必須**: fake-indexeddb はプロセス内でグローバルにデータを保持するため、複数の
  `it` にまたがって前のテストのキューエントリが残る。各テストファイルは `beforeEach`/`afterEach` で
  データベースを削除する（例: `indexedDB.deleteDatabase('cookpit-offline-queue')` を
  `await` し完了を待つ、または `fake-indexeddb` の `IDBFactory` を都度再生成する）処理を持つこと。
  これを怠ると「前のテストで積んだキューが後続テストのマウント時 flush に混入する」という
  テスト間干渉が発生する（本タスク固有の新規リスク）。
- 現在時刻に依存する TTL（24時間）判定は `vi.useFakeTimers()` + `vi.setSystemTime()` で固定し、
  境界値（24h 未満/24h 超過）を決定的に検証する。

---

## 3. `checked-sync-queue.ts` 単体試験観点（OQ）

新規 `apps/web/tests/app/shopping-lists/_utils/checked-sync-queue.node.test.ts`。

| #                                       | 観点                                   | 前提                                                    | 操作                                                                                                                   | 期待結果                                                                                                                                                | 分類              |
| --------------------------------------- | -------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| OQ-01                                   | enqueue → list の往復                  | 空のストア                                              | `enqueueCheckedOp({key:'list-1:item-1', shoppingListId:'list-1', itemId:'item-1', checked:true})` → `listCheckedOps()` | 1 件返り、`key`/`shoppingListId`/`itemId`/`checked` が一致                                                                                              | 正常              |
| OQ-02（**coalesce・Orchestrator必須**） | 同一 key の上書き（P-1）               | `key:'list-1:item-1'` で `checked:true` を enqueue 済み | 同じ `key` で `checked:false` を再度 enqueue → `listCheckedOps()`                                                      | 件数は 1 のまま、`checked === false` に更新されている                                                                                                   | 正常/冪等         |
| OQ-03（**防御性**）                     | enqueue 時のデフォルト値の防御的初期化 | 呼び出し時刻を `vi.setSystemTime()` で固定              | `enqueueCheckedOp({key,...})`（`enqueuedAt`/`attempts` を引数に含めない）                                              | 返り値の `enqueuedAt` が固定時刻と一致、`attempts === 0` で初期化される（呼び出し側が誤って `attempts` に非ゼロを渡せない型設計になっていることの確認） | 正常/防御性       |
| OQ-04                                   | delete で除去される                    | 1 件 enqueue 済み                                       | `deleteCheckedOp(key)` → `listCheckedOps()`                                                                            | 空配列になる                                                                                                                                            | 正常              |
| OQ-05（境界）                           | 存在しない key の delete               | 空のストア                                              | `deleteCheckedOp('missing:missing')`                                                                                   | 例外を投げず正常終了（no-op）                                                                                                                           | 境界              |
| OQ-06                                   | bumpAttempts で increment              | `attempts:0` で enqueue 済み                            | `bumpAttempts(key)` → `listCheckedOps()`                                                                               | `attempts === 1`                                                                                                                                        | 正常              |
| OQ-07（境界）                           | 存在しない key への bumpAttempts       | 空のストア                                              | `bumpAttempts('missing:missing')`                                                                                      | 例外を投げず no-op（実装がエントリを新規作成しないことを確認。`listCheckedOps()` が空のまま）                                                           | 境界              |
| OQ-08（**キー設計・P-7**）              | 別リストの同一 itemId は別エントリ     | `list-1:item-1` を enqueue 済み                         | `list-2:item-1`（`itemId` は同じだが `shoppingListId` が異なる）を enqueue → `listCheckedOps()`                        | 2 件とも残る（coalesce されない。複合キーの意図どおり）                                                                                                 | 境界              |
| OQ-09                                   | 空ストアでの list                      | 何も enqueue していない                                 | `listCheckedOps()`                                                                                                     | 空配列を返す（`undefined`/`null` ではない）                                                                                                             | 境界              |
| OQ-10（データ整合性）                   | 異なる key の並行 enqueue              | 空のストア                                              | `item-1`/`item-2` を並行して enqueue（`Promise.all`）                                                                  | 2 件とも保存され、互いのデータを破壊しない                                                                                                              | 正常/データ整合性 |

---

## 4. `use-checked-sync-queue.ts` 単体試験観点（UOQ）

新規 `apps/web/tests/app/shopping-lists/_utils/use-checked-sync-queue.test.tsx`。`@/lib/api-client`
を `vi.mock`（既存 `shopping-list-client.*.test.tsx` と同じパターン）し、`renderHook`
（`@testing-library/react`。既存 `use-api-action.test.tsx` の `UAA-*` と同じ手段）で検証する。

| #                                                         | 観点                                                  | 前提                                                                                                                      | 操作                                                                                                                                                                                              | 期待結果                                                                                                                                                                                               | 分類        |
| --------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| UOQ-01（FR-7）                                            | enqueue 後 pendingItemIds に反映                      | フック初期化済み                                                                                                          | `enqueue({shoppingListId:'list-1', itemId:'item-1', checked:true})`                                                                                                                               | `pendingItemIds.has('item-1') === true`                                                                                                                                                                | 正常        |
| UOQ-02（**coalesce・冪等**）                              | 同一 itemId を複数回 enqueue                          | —                                                                                                                         | 同じ itemId で `checked:true`→`false`→`true` を連続 enqueue                                                                                                                                       | `pendingItemIds` のサイズは 1 のまま（`item-1` のみ）                                                                                                                                                  | 正常/冪等   |
| UOQ-03                                                    | flush 成功で確定反映                                  | 1 件 enqueue 済み、`postChecked` が bought dto を resolve                                                                 | `flush()`                                                                                                                                                                                         | `postChecked` が 1 回呼ばれる、`pendingItemIds` から除去される、`setItems` が呼ばれサーバー DTO が反映される                                                                                           | 正常        |
| UOQ-04（E-02）                                            | flush が 404                                          | 1 件 enqueue 済み、`postChecked` が `{ok:false, status:404}`                                                              | `flush()`                                                                                                                                                                                         | キューから削除される、`setItems` によるエラー表示相当のコールバックは呼ばれない（呼び出し側の `itemsAction.setErrorMessage` 等はフックの責務外のため、フックからは「エラーなしで消えた」ことのみ確認） | 異常        |
| UOQ-05（E-01）                                            | flush が 422                                          | 1 件 enqueue 済み、`postChecked` が `{ok:false, status:422}`                                                              | `flush()`                                                                                                                                                                                         | キューから削除される、エラー通知手段（フックが公開する形。設計未確定のためコールバック引数 or 戻り値で確認）                                                                                           | 異常        |
| UOQ-06（E-03）                                            | flush がネットワーク例外                              | 1 件 enqueue 済み、`postChecked` が reject                                                                                | `flush()`                                                                                                                                                                                         | キューに残る（`pendingItemIds` に itemId が残る）、内部 `attempts` が 1 増える（`listCheckedOps` 相当で間接確認）                                                                                      | 異常        |
| UOQ-07（**attempts境界・Orchestrator必須**）              | 上限 5 回超過で破棄                                   | 1 件のエントリが `attempts:4` の状態（UOQ-06 相当を 4 回連続実行して作る、または直接 IndexedDB へ投入）                   | 5 回目の `flush()` 失敗（`attempts:5` に到達） → 6 回目の `flush()` トリガー                                                                                                                      | 6 回目では送信を試みずキューから破棄される（5 回目までは送信対象のまま）                                                                                                                               | 境界        |
| UOQ-08（**TTL境界・Orchestrator必須**）                   | 24時間 TTL                                            | `vi.setSystemTime(T0)` でエントリを enqueue                                                                               | `vi.setSystemTime(T0 + 24h - 1ms)` で `flush()` → 送信される（`postChecked` 呼ばれる）。続けて `vi.setSystemTime(T0 + 24h + 1ms)` で新規エントリを別途 enqueue → `flush()` → 送信されず破棄される | 24h 未満は再送対象、24h 超過は送信を試みず破棄                                                                                                                                                         | 境界        |
| UOQ-09（**部分失敗・Orchestrator必須・防御性**）          | 複数エントリの一部失敗                                | `item-1`（成功する `postChecked`）と `item-2`（reject する `postChecked`）を enqueue                                      | `flush()`                                                                                                                                                                                         | `item-1` はキューから削除され `pendingItemIds` から消える、`item-2` は残る。1 件の失敗が他エントリの処理を止めない                                                                                     | 異常/防御性 |
| UOQ-10（**冪等・P-3二重防止**）                           | 同時 flush の排他制御                                 | 1 件 enqueue 済み、`postChecked` が未解決 Promise                                                                         | `flush()` を連続 2 回呼ぶ（1 回目が完了する前に 2 回目を呼ぶ）                                                                                                                                    | `postChecked` は 1 回のみ呼ばれる（フラッシュ中フラグにより 2 回目は無視される）                                                                                                                       | 正常/冪等   |
| UOQ-11（境界 B-01）                                       | 空キューでの flush                                    | 何も enqueue していない                                                                                                   | `flush()`                                                                                                                                                                                         | `postChecked` は呼ばれない（no-op）                                                                                                                                                                    | 境界        |
| UOQ-12（E-06・防御性）                                    | IndexedDB オープン失敗時のフォールバック              | `indexedDB.open` が例外を投げる/失敗するようスタブ                                                                        | `enqueue(...)` → `flush()`                                                                                                                                                                        | いずれも例外を投げずに完了する（no-op）。`postChecked` は呼ばれない                                                                                                                                    | 異常/防御性 |
| UOQ-13（回帰・E-03継続）                                  | 失敗後も次回トリガーで再送対象のまま                  | UOQ-06 でキューに残った状態                                                                                               | 別の `flush()` 呼び出し（`postChecked` を今度は成功するよう再設定）                                                                                                                               | 前回失敗したエントリが今回は送信され、成功すればキューから消える                                                                                                                                       | 正常        |
| UOQ-14（**Orchestrator指摘・response.json誤判定の派生**） | flush 内でも `response.json()` 失敗が例外経路に落ちる | 1 件 enqueue 済み、`postChecked` が `{ok:true, status:200, json: () => Promise.reject(new Error('bad json'))}` を resolve | `flush()`                                                                                                                                                                                         | 成功として扱われずキューに残る／`attempts` が増える（LCQ-09 と同根の設計ギャップが `flush` 側にも存在することを明示的に固定。§0-1-5 参照）                                                             | 異常/防御性 |

---

## 5. `ShoppingListClient` 結合試験観点（オフラインキュー。LCQ）

新規 `apps/web/tests/app/shopping-lists/_components/shopping-list-client.offline-queue.test.tsx`。
既存 `shopping-list-client.checked.test.tsx` と同じ `vi.mock('@/lib/api-client', ...)` パターンに加え、
`fake-indexeddb`（§2 の前提）を有効にした状態で**実物の** `useCheckedSyncQueue` フックを通す
（フックはモックしない。統合の実効性を担保するため）。

| #                                                             | 観点                                                             | 前提                                                                                                                                                                                                                                                                                                                                                            | 操作                                                                                                                                                                                                                                                                          | 期待結果                                                                                                                                                                                                                                                                                                                                    | 分類                                  |
| ------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| LCQ-01（N-02）                                                | オフラインチェックで即時反映 + 未同期表示                        | pending item、`postChecked` が reject                                                                                                                                                                                                                                                                                                                           | チェックボタン click                                                                                                                                                                                                                                                          | `aria-checked === 'true'` のまま保持される（従来のロールバックが起きない。P-2 の核心）、行に未同期インジケーターが表示される                                                                                                                                                                                                                | 正常                                  |
| LCQ-02（N-03）                                                | 複数品目のオフライン操作                                         | 2 品目とも pending、`postChecked` が reject                                                                                                                                                                                                                                                                                                                     | 両方のチェックボタンを click                                                                                                                                                                                                                                                  | 両方とも `aria-checked === 'true'` のまま、両方に未同期インジケーターが表示される                                                                                                                                                                                                                                                           | 正常                                  |
| LCQ-03（**coalesce E2E・Orchestrator必須・N-04**）            | 同一品目の複数回トグル → 再送は1回                               | pending item、`postChecked` が reject（オフライン相当）                                                                                                                                                                                                                                                                                                         | チェック → 解除 → チェックの 3 回 click（都度 `postChecked` は reject） → その後 `postChecked` を成功するよう設定し直し `window.dispatchEvent(new Event('online'))`                                                                                                           | オンライン復帰後の `postChecked` 呼び出しは 1 回のみ、送信される `json` は最新の意図（`{checked:true}`）                                                                                                                                                                                                                                    | 正常/冪等                             |
| LCQ-04（N-05）                                                | online イベントでの自動再送                                      | pending item をオフラインでチェック済み（未同期表示あり）、`postChecked` を成功するよう再設定                                                                                                                                                                                                                                                                   | `window.dispatchEvent(new Event('online'))`                                                                                                                                                                                                                                   | `postChecked` が呼ばれ、成功後は未同期インジケーターが消える                                                                                                                                                                                                                                                                                | 正常                                  |
| LCQ-05（**P-4順序・Orchestrator必須・N-07**）                 | flush が refetch より先に完了する                                | 未同期エントリあり、`postChecked`/`getShoppingList` の両方をモックし呼び出し順序を記録できるようにする                                                                                                                                                                                                                                                          | `window.dispatchEvent(new Event('focus'))`                                                                                                                                                                                                                                    | `postChecked` の呼び出しが `getShoppingList`（`handleRefetch` 由来）より先に完了している（呼び出し順序をモック呼び出し履歴の配列で検証）                                                                                                                                                                                                    | 正常                                  |
| LCQ-06（**P-4マージ・Orchestrator必須・データロス防止**）     | flush 未完了のまま refetch を受けてもデータが消えない            | 2 品目が未同期（`postChecked` は `item-1` が reject し続け `item-2` は resolve）。`getShoppingList` が「サーバーには両方とも pending のまま」という古い DTO を返す                                                                                                                                                                                              | `window.dispatchEvent(new Event('focus'))`                                                                                                                                                                                                                                    | `item-2` はサーバー値（またはフラッシュ成功後の確定値）で更新される。`item-1` は `pendingItemIds` に残っているため、`onSuccess` のマージ規則によりサーバーの古い値（pending）で上書きされず、ローカルの「チェック済み」表示が維持される                                                                                                     | 正常/データ整合性                     |
| LCQ-07（**部分失敗・Orchestrator必須**）                      | flush 中の一部失敗（他エントリへ影響しない）                     | `item-1`/`item-2` とも未同期、online 復帰後 `postChecked` は `item-1` は成功・`item-2` は reject するよう `mockImplementation` で分岐                                                                                                                                                                                                                           | `window.dispatchEvent(new Event('online'))`                                                                                                                                                                                                                                   | `item-1` の未同期表示は消える、`item-2` の未同期表示は残る                                                                                                                                                                                                                                                                                  | 異常/防御性                           |
| LCQ-08（**flush中の再オフライン化・Orchestrator必須**）       | flush 実行中に再度ネットワークが失われる                         | 3 品目が未同期。`postChecked` を「1 回目の呼び出し（`item-1`）は成功、2 回目以降（`item-2`/`item-3`）は reject」するよう設定                                                                                                                                                                                                                                    | `window.dispatchEvent(new Event('online'))`                                                                                                                                                                                                                                   | `item-1` は成功しキューから消える、`item-2`/`item-3` はキューに残り未同期表示のまま（1 件の途中失敗が後続の処理を止めない。UOQ-09 の結合版）                                                                                                                                                                                                | 異常/防御性                           |
| LCQ-09（**最重要・Orchestrator必須・response.json()誤判定**） | 200 だが本文が壊れているレスポンスが「オフライン」と誤判定される | pending item、`postChecked` が `{ok:true, status:200, json:() => Promise.reject(new Error('invalid json'))}` を resolve（実際にはサーバー側の書き込みは成功している想定）                                                                                                                                                                                       | チェックボタン click                                                                                                                                                                                                                                                          | `catch` 節が実行され、`aria-checked === 'true'` のまま（本来の成功パスと外形上は同じ）だが、**行に未同期インジケーターが表示され、`checked-sync-queue` にエントリが積まれる**（実際はオンラインで書き込み済みにもかかわらず「未同期」と誤表示される設計ギャップを明示的に固定する。§0-1-5 のリスクとして reviewer/Orchestrator へ申し送る） | 異常/防御性（設計ギャップの固定）     |
| LCQ-10（**TTL境界・Orchestrator必須**）                       | 24時間 TTL の境界                                                | `vi.setSystemTime(T0)` でオフラインチェック（未同期エントリ生成）                                                                                                                                                                                                                                                                                               | `vi.setSystemTime(T0 + 24h - 1ms)` で `online` イベント → 送信される。別ケースとして `T0 + 24h + 1ms` まで進めてから `online` イベント → 送信を試みず破棄され未同期表示が消える（エラー表示の有無は E-05 の扱いに従い「表示なし」想定。設計書に明記がなければ実装計画で確認） | 24h 未満は再送、24h 超過は破棄                                                                                                                                                                                                                                                                                                              | 境界                                  |
| LCQ-11（**attempts境界・Orchestrator必須**）                  | 再送上限 5 回超過                                                | 未同期エントリ 1 件。`postChecked` を 5 回連続 reject させ、都度 `online`/`focus` イベントで再送を試みさせる                                                                                                                                                                                                                                                    | 6 回目の再送トリガー                                                                                                                                                                                                                                                          | エントリが破棄され、未同期表示が消え、同期不能を示すエラーメッセージが表示される（E-04）                                                                                                                                                                                                                                                    | 境界                                  |
| LCQ-12（FR-5/N-06）                                           | マウント時のキュー復元                                           | IndexedDB に事前に未同期エントリを直接投入した状態（前セッションの残留を模す）                                                                                                                                                                                                                                                                                  | `ShoppingListClient` を新規に `render`                                                                                                                                                                                                                                        | マウント直後に自動 flush が試みられる。`postChecked` が成功するよう設定していれば未同期表示は消え、失敗するよう設定していれば未同期表示が現れる（IR 相当の表示で確認）                                                                                                                                                                      | 正常                                  |
| LCQ-13（E-01）                                                | flush 中の 422                                                   | 未同期エントリ 1 件、`postChecked` が `{ok:false,status:422}`                                                                                                                                                                                                                                                                                                   | `online` イベント                                                                                                                                                                                                                                                             | キューから破棄、未同期表示が消える、`COMPLETED_REJECTED_MESSAGE` 相当のエラーバナーが表示される                                                                                                                                                                                                                                             | 異常                                  |
| LCQ-14（E-02）                                                | flush 中の 404                                                   | 未同期エントリ 1 件、`postChecked` が `{ok:false,status:404}`                                                                                                                                                                                                                                                                                                   | `online` イベント                                                                                                                                                                                                                                                             | キューから破棄、未同期表示が消える、エラーバナーは表示されない                                                                                                                                                                                                                                                                              | 異常                                  |
| LCQ-15（P-5）                                                 | flush 中の 5xx                                                   | 未同期エントリ 1 件、`postChecked` が `{ok:false,status:500}`                                                                                                                                                                                                                                                                                                   | `online` イベント                                                                                                                                                                                                                                                             | ネットワーク例外と同様にキューに残り、未同期表示が維持される（`attempts` が増える）                                                                                                                                                                                                                                                         | 異常                                  |
| LCQ-16（**LWW容認の固定・Orchestrator必須・N-08/E-07**）      | 2人運用競合。相手が先に触った品目を自分の値で上書きする          | `item-1` が `pending`。オフライン化して `checked:false`（自分の意図。既に `pending` なので実質 no-op 相当の操作だが、想定は「相手が checked:true にした後を知らずに自分は pending のまま維持したい」ケースを模すため、item を `bought` から `pending` へのオフライン変更で表現する: 前提を `status:'bought'` にし、オフライン中に「チェックを外す」操作を行う） | チェック解除ボタン click（オフライン。`postChecked` reject）→ `online` イベントで再送（`postChecked` は成功し `status:'pending'` の dto を返す）                                                                                                                              | 再送時に `postChecked` へ渡される `json` が自分の意図（`{checked:false}`）のままであること（サーバーが直前に別ユーザーの操作で `bought` に変わっていたとしても、それを確認せずに上書きする＝LWW）。これは**バグではなく設計の容認事項**としてテストで固定する（P-9）                                                                        | 正常/データ整合性（容認リスクの固定） |
| LCQ-17（境界 B-01）                                           | 空キューでの online                                              | 未同期エントリなし                                                                                                                                                                                                                                                                                                                                              | `online` イベント                                                                                                                                                                                                                                                             | `postChecked` は呼ばれない                                                                                                                                                                                                                                                                                                                  | 境界                                  |
| LCQ-18（P-6バナー）                                           | 未同期が 1 件以上ある間バナー表示                                | pending item をオフラインでチェック                                                                                                                                                                                                                                                                                                                             | チェックボタン click 直後                                                                                                                                                                                                                                                     | 画面上部に軽量な状態バナー相当の要素が表示される（文言は実装者裁量のため、`data-testid` 等の構造的セレクタで存在を確認する想定。実装計画でセレクタを確定すること）                                                                                                                                                                          | 正常/FE固有                           |
| LCQ-19（回帰）                                                | バナーが全件同期後に消える                                       | LCQ-18 の状態から `postChecked` を成功に切替                                                                                                                                                                                                                                                                                                                    | `online` イベント                                                                                                                                                                                                                                                             | 未同期件数が 0 になった時点でバナーが非表示になる                                                                                                                                                                                                                                                                                           | 正常                                  |
| LCQ-20（**回帰・最重要**）                                    | fake-indexeddb 導入後も既存 dom テストが act 警告なく green      | 既存 `shopping-list-client.view/complete/remove/checked/sync.test.tsx` の代表的な 1 ケースずつ                                                                                                                                                                                                                                                                  | 既存テストをそのまま実行                                                                                                                                                                                                                                                      | 全て green（§0-1-3 の懸念の実証。マウント時 flush が空キューで確実に no-op になることの確認）                                                                                                                                                                                                                                               | 回帰                                  |

---

## 6. コンポーネント拡張観点（`unsynced` 表示。SG/IR）

### 6-1. `store-group.tsx`（`store-group.test.tsx` に追記。既存 SG-01〜08 は無変更）

**設計書に明記のない改修点**: `renderStoreGroup()` の `defaults` に `pendingItemIds: new Set<string>()`
の追加が必要（0-1-4）。

| #             | 観点                                                    | 前提                                                              | 操作   | 期待結果                                                                       | 分類 |
| ------------- | ------------------------------------------------------- | ----------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------ | ---- |
| SG-09（新規） | pendingItemIds が該当 item へ unsynced として中継される | `pendingItemIds: new Set(['item-1'])`、items に `item-1`/`item-2` | render | `item-1` の行にのみ未同期インジケーターが表示される、`item-2` には表示されない | 正常 |
| SG-10（新規） | pendingItemIds が空のとき全 item が unsynced=false      | `pendingItemIds: new Set()`                                       | render | どの行にも未同期インジケーターが表示されない                                   | 境界 |

### 6-2. `shopping-item-row.tsx`（`shopping-item-row.test.tsx` に追記。既存 IR-01〜37 は無変更）

**設計書に明記のない改修点**: `renderRow()` の `defaults` に `unsynced: false` の追加が必要（0-1-4）。

| #                         | 観点                                             | 前提                                                     | 操作   | 期待結果                                                                                                                                                                 | 分類        |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| IR-38（新規）             | unsynced=true でインジケーター表示               | `unsynced: true`                                         | render | 未同期インジケーターが表示される（実装計画でセレクタ確定。`data-testid="unsynced-badge"` 等の安定した識別子を推奨）                                                      | 正常        |
| IR-39（新規）             | unsynced=false でインジケーター非表示            | `unsynced: false`                                        | render | 未同期インジケーターが表示されない                                                                                                                                       | 境界        |
| IR-40（新規・**防御性**） | unsynced 単体ではチェックボタンを disable しない | `unsynced: true`、`submitting: false`、`readOnly: false` | render | チェックボタンの `disabled` は `false`（`locked = submitting \|\| readOnly` の不変条件が `unsynced` の影響を受けないことの固定。設計書「変更しない」方針の明示的な検証） | 境界/防御性 |

---

## 7. 手動確認（manual-browser-verify。dev 環境の制約を明記）

| #     | 確認内容                                                                                                                | dev 環境での制約                                                                                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MB-01 | 実機（iPhone Safari PWA）で機内モードにしてチェック → ホーム画面に戻り復帰 → 再送される                                 | 本タスク実行環境には実機・iOS Safari が無く確認不可。ネットワークタブの Offline スロットリングで代替検証は可能だが、iOS 固有の `online`/`focus` イベント発火の癖（R-1 に記載の背景）はエミュレートできない |
| MB-02 | 2 台の端末（またはブラウザプロファイル）で同一リストを開き、オフラインで別品目を操作 → 両方が独立して同期される（N-08） | 単一の dev 環境では 2 実機相当のセッションを同時に用意しづらい。複数ブラウザプロファイルでの代替確認は可能                                                                                                 |
| MB-03 | 7日間 IndexedDB が保持され続けない（R-2）ことの実地確認                                                                 | 実時間で 7 日間待機する必要があり本タスクの期間内では検証不可。TTL（24h）が先に効くため実害は小さいという設計判断の裏取りに限定される                                                                      |
| MB-04 | 未同期バッジ・バナーの実際の視認性（デザイン確認）                                                                      | 自動テストでは構造的な出現/非表示のみ検証するため、文言・配置の最終確認は実画面で行う（P-6 未決事項3）                                                                                                     |
| MB-05 | 電波の悪い場所（オフラインではなく極端に遅い回線）での挙動                                                              | 設計書 §エラー処理 (b) に明記の既知のギャップ（タイムアウト無し）。dev 環境で「オフラインではないが極端に遅い」状態を再現するのは困難なため、実地確認を推奨するのみで完了条件には含めない                  |

### 実施結果（2026-08-13・`dev:pglite` + Playwright Chromium）

スクリプト: `apps/web/scripts/verify-offline-write-queue.mjs`

| #     | 結果    | メモ                                                                           |
| ----- | ------- | ------------------------------------------------------------------------------ |
| MB-01 | PASS    | Chromium `context.setOffline` で代替。復帰後に再読み込みしてもチェックが残った |
| MB-02 | BLOCKED | 2 端末を同時に用意できない                                                     |
| MB-03 | BLOCKED | 7 日の実時間待機は期間内にできない                                             |
| MB-04 | PASS    | 行の「未送信」と上部バナーを目視相当で確認                                     |
| MB-05 | BLOCKED | 試験計画どおり完了条件のブロッカーではない                                     |

iPhone Safari PWA の機内モード確認はマージ後の実機作業として残す。

---

## 8. 特性観点

- **権限**: 対象外（MVP1 は認証なし。既存前提を維持）。
- **データ整合性**: coalesce（OQ-02/UOQ-02/LCQ-03）、flush 前後でのマージ規則（LCQ-06）、部分失敗時の
  独立性（UOQ-09/LCQ-07/LCQ-08）で担保する。`uncheck()` の価格クリア等の Domain レベルの整合性は
  本タスクで無変更のため対象外（`docs/tests/shopping-list-item-check.md` が既にカバー済み）。
- **冪等性（必須）**: `SetItemCheckedUseCase` の既存の冪等設計に依拠し、キュー側は「同一 key の
  coalesce」（OQ-02/UOQ-02）と「二重 flush 防止」（UOQ-10）の 2 層で担保する。要件書の
  「対象外: 2人利用時の意味的競合を解消する仕組みの新規導入」を踏まえ、LWW 自体の是非は問わず
  「容認された挙動として固定する」観点（LCQ-16）のみを設ける。
- **障害系（必須。IndexedDB という新規の端末内ストレージ I/O のため）**:
  - タイムアウト: 対象外（設計書 §エラー処理 (b) で明記。新規のタイムアウト機構を追加しない）。
  - リトライ: 実イベントトリガーのみ（P-3）。タイマー・指数バックオフは無いことを UOQ-11/LCQ-17
    （空キューで何もしない）で間接的に確認する。
  - 部分失敗: UOQ-09・LCQ-07・LCQ-08（最重要。Orchestrator 指定）。
  - フォールバック: UOQ-12（E-06）。ただし §0-1-2 のとおり公開インターフェースが未確定のため、
    観測可能な振る舞い（例外を投げない・`postChecked` が呼ばれない）で検証する。
- **フロントエンド固有（必須）**: 未同期表示（IR-38/39, SG-09/10）、バナー（LCQ-18/19）、
  楽観的更新の維持（LCQ-01。従来のロールバックとの違いが本設計の核心）、エラー表示（LCQ-13/14/15）。
- **防御性**:
  - IR-40: `unsynced` が既存の disable 不変条件に影響しないこと。
  - OQ-03: enqueue のデフォルト値（`attempts:0`）が呼び出し側から汚染されないこと。
  - UOQ-07/08: TTL・attempts という上限不変条件が境界値で正しく機能すること。
  - LCQ-09・UOQ-14: `response.json()` 失敗の誤判定という設計ギャップを、バグとして隠さず
    テストで明示的に固定し、reviewer/Orchestrator が挙動を認識できるようにする。

---

## 9. メソッド網羅チェック表

| 対象                        | public API / コンポーネント                                                                                                                                       | 対応する試験観点 No                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `checked-sync-queue.ts`     | `enqueueCheckedOp(op): Promise<void>`                                                                                                                             | OQ-01〜03, OQ-08, OQ-10                                    |
| `checked-sync-queue.ts`     | `listCheckedOps(): Promise<QueuedCheckedOp[]>`                                                                                                                    | OQ-01, OQ-04, OQ-09                                        |
| `checked-sync-queue.ts`     | `deleteCheckedOp(key): Promise<void>`                                                                                                                             | OQ-04, OQ-05                                               |
| `checked-sync-queue.ts`     | `bumpAttempts(key): Promise<void>`                                                                                                                                | OQ-06, OQ-07                                               |
| `use-checked-sync-queue.ts` | `useCheckedSyncQueue(params).pendingItemIds`                                                                                                                      | UOQ-01, UOQ-02, UOQ-03〜09, UOQ-11                         |
| `use-checked-sync-queue.ts` | `useCheckedSyncQueue(params).enqueue`                                                                                                                             | UOQ-01, UOQ-02, UOQ-12                                     |
| `use-checked-sync-queue.ts` | `useCheckedSyncQueue(params).flush`                                                                                                                               | UOQ-03〜11, UOQ-13, UOQ-14                                 |
| `ShoppingListClient`        | `handleSetChecked`（`catch` 拡張・P-2）                                                                                                                           | LCQ-01〜03, LCQ-09, LCQ-16                                 |
| `ShoppingListClient`        | `handleFocus`（`flush`→`handleRefetch` 順序拡張・P-4）                                                                                                            | LCQ-05, LCQ-06                                             |
| `ShoppingListClient`        | `online` イベントリスナー（新規）                                                                                                                                 | LCQ-03, LCQ-04, LCQ-07, LCQ-08, LCQ-10, LCQ-11, LCQ-13〜17 |
| `ShoppingListClient`        | マウント時 flush（新規）                                                                                                                                          | LCQ-12                                                     |
| `ShoppingListClient`        | `handleRefetch` の `onSuccess` マージ規則（P-4）                                                                                                                  | LCQ-06                                                     |
| `ShoppingListClient`        | 既存ハンドラ群（`handleMarkAsBought`/`handleReassignStore`/`handleRemoveItem`/`handleAddItem`/`handleComplete`/`handleReopen`/`handleSync`/`handleToggleExpand`） | 無変更。§11 回帰試験範囲（既存 LC/CB/SY 全ケース）         |
| `StoreGroup`                | `pendingItemIds` → `unsynced` 中継                                                                                                                                | SG-09, SG-10                                               |
| `ShoppingItemRow`           | `unsynced` prop 表示                                                                                                                                              | IR-38, IR-39, IR-40                                        |

---

## 10. 要件対応表（`docs/requirements/offline-write-queue.md` FR/N/E/B との照合）

| 要件       | 内容（要約）                                                 | 対応する試験観点                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1       | オフライン失敗時にキューへ積む                               | LCQ-01, UOQ-01                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR-2       | 確定 state へ即時反映され `useOptimistic` 終了後も維持       | LCQ-01                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| FR-3       | online イベントで自動再送                                    | LCQ-04, LCQ-17                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR-4       | フォーカス復帰時の再送 → refetch の順序                      | LCQ-05, LCQ-06                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR-5       | マウント時のキュー読み込み・再送                             | LCQ-12                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| FR-6       | 同一品目の coalesce                                          | OQ-02, UOQ-02, LCQ-03                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| FR-7       | 行単位の未同期表示                                           | IR-38, IR-39, SG-09, SG-10, LCQ-01                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| FR-8       | 422 はキューへ積まない/破棄しエラー表示                      | UOQ-05, LCQ-13                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR-9       | 404 は破棄しエラー表示なし                                   | UOQ-04, LCQ-14                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR-10      | attempts/TTL による自動破棄                                  | UOQ-07, UOQ-08, LCQ-10, LCQ-11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| FR-11      | `checked` のみが対象（`bought`/`DELETE`/`consume` は対象外） | 対象外（理由: 本タスクはこれらのハンドラを一切変更しないため、既存 `LC-*`（`handleMarkAsBought`）・`shopping-list-client.remove.test.tsx`・在庫消費関連テストが無変更のまま green であることが回帰証跡になる。新規のキュー対象外を証明する専用テストは追加しない）                                                                                                                                                                                                                                                                                                                                                                                          |
| FR-12      | `sw.ts` を変更しない                                         | 対象外（テスト計画のスコープ外。`sw.ts` 自体に変更が無いことはコードレビュー・diff で確認する事項であり、Vitest 観点ではない）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| N-01〜N-08 | 正常系シナリオ                                               | N-01: 対象外（既存 LC-04/24 等の回帰でカバー済み・オンライン時は無変更） / N-02: LCQ-01 / N-03: LCQ-02 / N-04: LCQ-03 / N-05: LCQ-04 / N-06: LCQ-12 / N-07: LCQ-05 / N-08: 対象外（理由: 端末=ブラウザごとの IndexedDB 分離はブラウザ標準の境界でありアプリ層の独自ロジックではないため、複数品目の独立動作を検証する LCQ-02/LCQ-07 で実質的に代替される）                                                                                                                                                                                                                                                                                                  |
| E-01〜E-07 | 異常系シナリオ                                               | E-01: LCQ-13 / E-02: LCQ-14 / E-03: UOQ-06, LCQ-15 / E-04: LCQ-11 / E-05: LCQ-10 / E-06: UOQ-12 / E-07: LCQ-16                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| B-01〜B-06 | 境界条件                                                     | B-01: UOQ-11, LCQ-17 / B-02: OQ-02（coalesce の不変条件） / B-03: 対象外（ハードリミット無しという「上限を設けない」仕様のため、上限に達しないことを積極的に証明するテストは行わない。設計判断の記録として §試験データで代表件数のみ扱う） / B-04: LCQ-03・LCQ-16 が `checked:true`/`false` の両方を扱う / B-05: 対象外（理由: `AddItemForm` 経由の追加操作は本タスクで一切変更しないため、既存の追加関連テストの回帰確認で足りる） / B-06: 対象外（理由: 既存 IR-17 が readOnly 時のチェックボタン disable を既に担保しており、disabled なボタンはクリックできないためオフラインキューにも積まれないことは UI 層の既存制約から自明。新規観点は追加しない） |

---

## 11. 回帰試験範囲

- `apps/web` dom: 既存 `shopping-list-client.view/complete/remove/checked/sync.test.tsx`
  （`LC-01〜34`・`CB-01〜23`・`SY-01〜03`）が全て green のまま。**特に §0-1-3 のとおり、
  `useCheckedSyncQueue` の無条件マウントが `fake-indexeddb` 導入後も既存テストを壊さないことを
  LCQ-20 で明示的に確認する（最重要）。**
- `apps/web` dom: `store-group.test.tsx`（`SG-01〜08`）・`shopping-item-row.test.tsx`
  （`IR-01〜37`）は、Props 追加に伴う `defaults` 更新（0-1-4）以外は無変更のまま green。
- `apps/web` dom: `add-item-form.test.tsx`・`purchase-input-form.test.tsx`・
  `shopping-list-entry-client.test.tsx`・`complete-shopping-panel.test.tsx` は無変更のまま green
  （本機能はチェック操作にのみ触れる）。
- `apps/web` node: `tests/server/routes/shopping-lists.checked.test.ts` を含む全 Hono ルートテストは
  無変更のまま green（バックエンド API を一切変更しないため）。
- Domain / Application / api-contract / Infrastructure: 変更が無いため対象外
  （`packages/domain`・`packages/application`・`packages/api-contract`・`packages/infrastructure`
  の既存全テストは無関係。実行自体は CI の通常フローで担保される）。
- `apps/web/src/app/sw.ts`: 変更しないため専用の回帰テストは追加しない（FR-12 の遵守はコード
  レビューで確認する事項）。
- 他機能（`pantry`/`recipe`/`meal-plan`/`product`/`store`）への波及なし。

---

## 12. 試験データ

- 既存 `shopping-list-test-fixtures.ts` の `createShoppingItemDto`/`createShoppingListDto`/
  `STORES`/`PRODUCTS`/`fillPurchaseInputForm` をそのまま流用する。
- 新規: `checked-sync-queue.node.test.ts`/`use-checked-sync-queue.test.tsx` 用に
  `QueuedCheckedOp` を直接組み立てる最小ヘルパ（`createQueuedCheckedOp(overrides)`）を用意し、
  マウント時 flush の事前投入（LCQ-12）にも流用する。
- TTL/attempts の境界値検証は `vi.useFakeTimers()` + `vi.setSystemTime()` で固定時刻を扱う
  （実時間待機は行わない）。
- fake-indexeddb のリセット手段（§2）を共有ヘルパー化すること（`resetOfflineQueueDb()` 等）を
  実装計画で検討する。

---

## 13. 完了条件

- §3〜§6 の全観点（OQ/UOQ/LCQ/SG/IR）が Vitest で green。**特に LCQ-05（P-4 順序）・LCQ-06（データ
  ロス防止）・LCQ-07/08（部分失敗）・LCQ-09（`response.json()` 誤判定の固定）・LCQ-10/11（TTL/attempts
  境界）・LCQ-16（LWW 容認の固定）・LCQ-20（fake-indexeddb 導入後の既存テスト無事故）は最重要観点
  として個別に green を確認する。**
- `pnpm lint` / `pnpm type-check` / `pnpm test` が全 green（§11 回帰試験範囲を含む）。
- §10 要件対応表の FR-1〜12・N-01〜08・E-01〜07・B-01〜06 すべてに対応する試験観点があるか、
  または対象外理由が明記されている。
- §0-1 の設計ギャップ（特に 2: `UseCheckedSyncQueueResult` の可否フィールド未確定、3: 全既存テスト
  への波及リスク、5: `response.json()` 誤判定）が実装計画・実装コードで対応方針が確定していること。
  未確定のまま実装に入らないよう Orchestrator へ明示的に申し送る。
- §6 で明記した「設計書に無い改修必須点」（`store-group.test.tsx`/`shopping-item-row.test.tsx` の
  `defaults` 更新）が実装計画・実装コードに反映されていること。
- 実装計画のテスト計画セクションと矛盾しないこと（実装計画作成後に整合を取る。矛盾があれば
  Orchestrator 経由で調整する）。
- MB-01〜05（手動確認）は推奨・任意（完了条件のブロッカーにはしない。§7 で dev 環境の制約を明記済み）。
