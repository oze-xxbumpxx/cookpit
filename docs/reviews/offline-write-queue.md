# レビュー記録: offline-write-queue

- レビュー対象: `docs/requirements/offline-write-queue.md` / `docs/designs/offline-write-queue.md` /
  `docs/tests/offline-write-queue.md` / `docs/implementation-plans/offline-write-queue.md`
- レビュー種別: 実装着手前の文書4点整合性レビュー（実装コードは未着手・存在しない）
- レビュー日: 2026-08-11
- 前提: 方式（アプリ層のみ・IndexedDB永続キュー）、キュー対象（チェック操作のみ）、
  P-1〜P-9の各決定はユーザー確定済みとして是非を問い直さない。

## サマリ

- Must: 2件
- Should: 5件
- Nice: 3件

**実装着手前に必ず潰すべき指摘（Must 2件）**:

1. Step 3 の `handleFocus`（flush 先行化）が既存 `shopping-list-client.view.test.tsx` の
   `LC-22` を破壊する（下記 M1。実測で確認済み）。
2. Step 2 の `use-checked-sync-queue.test.tsx` サンプルコードが `ItemSource` 型と矛盾し
   `type-check` が通らない（下記 M2）。

---

## Must

### M1. `handleFocus` の flush 先行化により既存 `LC-22` が壊れる（実測で確認済み）

- 該当箇所: `docs/implementation-plans/offline-write-queue.md` Step 3 手順5（`handleFocus` の
  書き換え、L1256-1292 付近）、および影響先
  `apps/web/tests/app/shopping-lists/_components/shopping-list-client.view.test.tsx:263-277`
  （`LC-22: silent な focus refetch では更新ボタンが disable されない`）。
- 事実確認:
  - `LC-22` は次の形で `getShoppingList` の呼び出し回数を**同期的に**（`waitFor` なしで）検証する。
    ```ts
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(getShoppingList).toHaveBeenCalledTimes(1); // waitFor で囲まれていない
    ```
  - 現行コード（`shopping-list-client.tsx:139-148`）は `handleFocus` が `handleRefetch` を
    直接呼ぶため、`act()` が解決する時点までに（非同期関数を同期的に呼んだときの通常の
    JS セマンティクスにより）`getShoppingList`（`client.api...$get`）の呼び出し自体は
    完了している。
  - 実装計画の新 `handleFocus` は `await flush(); await handleRefetch(...)` の順にする
    （`docs/implementation-plans/offline-write-queue.md:1259-1292`）。`flush()` は
    `checked-sync-queue.ts` 経由で `idb`/`indexedDB` の非同期オープン・`getAll` を経由するため、
    `getShoppingList` の呼び出しは **flush() の IndexedDB 往復が解決した後**にずれ込む。
  - `fake-indexeddb` + `idb` を実際にインストールし、`act(async () => cb())` 相当の単一
    マイクロタスク待機のみで IndexedDB オープン→`getAll` が解決するかを検証したところ、
    **解決しない**ことを実測で確認した（scratchpad で実行。`SYNC-CHECK-AFTER-ACT` の時点で
    `flush` 未解決・`refetch-called` 未発火、`setTimeout` で明示的にマクロタスクへ進めて
    初めて両方が発火する）。IndexedDB の `IDBRequest` はマイクロタスクではなくタスク
    （マクロタスク相当）で解決するため、`act()` の単純な await では吸収されない。
  - したがって `LC-22` はこのままでは **flaky ではなく確実に fail する**（`getShoppingList`
    がまだ 0 回の時点でアサーションが走る）。
- 実装計画の該当箇所: Step 3 の完了条件・テスト実行節（L1707-1715）は「`.view.test.tsx` を実行し
  `LC-15`, `LC-22` 等の呼び出し回数系アサーションへの影響を**確認する**」とリスクの存在は
  認識しているが、具体的な対処（修正版テストコード）を提示していない。`LC-15` はボタンクリック
  経由（`flush()` を経由しない）なので無影響だが、`LC-22` は影響を受ける。
- 修正案: `docs/implementation-plans/offline-write-queue.md` の Step 3「テスト変更内容」に、
  `shopping-list-client.view.test.tsx` の `LC-22` を `waitFor()` でラップする変更を明記して
  追加する（変更対象ファイル一覧にも `shopping-list-client.view.test.tsx` を追加）。
  ```ts
  await waitFor(() => {
    expect(getShoppingList).toHaveBeenCalledTimes(1);
  });
  const refreshButton = screen.getByRole('button', { name: '更新' }) as HTMLButtonElement;
  expect(refreshButton.disabled).toBe(false);
  ```

### M2. Step 2 サンプルコードの `source: 'manual'` が型エラーになる

- 該当箇所: `docs/implementation-plans/offline-write-queue.md` Step 2 手順2、
  `use-checked-sync-queue.test.tsx` の `ITEM` フィクスチャ定義（L708-719付近）。
- 事実確認: `packages/application/src/shopping-list/shopping-list.dto.ts:6,19` で
  `ItemSource = 'from_meal_plan' | 'manually_added'` と定義されている。既存フィクスチャ
  `apps/web/tests/app/shopping-lists/_components/shopping-list-test-fixtures.ts:33` も
  `source: 'from_meal_plan'` を既定値に使っている。実装計画のサンプルは
  `source: 'manual'` を直書きしており、`ItemSource` に存在しない値のため
  `pnpm --filter @cookpit/web type-check` がこの行で失敗する。
- 修正案: `source: 'from_meal_plan'`（または `'manually_added'`）に修正する。可能であれば
  既存の `createShoppingItemDto`（`shopping-list-test-fixtures.ts`）を流用し、手書きの
  `ITEM` オブジェクトをやめて型ズレを構造的に防ぐことを推奨する。

---

## Should

### S1. `enqueue` の `Promise<boolean>` 化が設計書 §エラー処理 (e) の文言と矛盾したまま

- 該当箇所: `docs/designs/offline-write-queue.md` §エラー処理 (e)（L541-547）と
  `docs/implementation-plans/offline-write-queue.md`「実装計画作成時に補った論点」7（L54-59）。
- 設計書は「`checked-sync-queue.ts` はエラーを投げずに『キュー機構が使えない』ことを示す状態を
  返し」と明記しているが、実装計画 Step 1 の `checked-sync-queue.ts`（`openQueueDb()`）は
  `indexedDB` 未使用時に `Promise.reject(new Error(...))` を返す＝**例外を投げる**設計になっており、
  「エラーを投げない」という設計書の文言と字面上矛盾する。実際には `use-checked-sync-queue.ts`
  側（1 階層上）でこの reject を catch し `boolean` に変換しているため、**利用者（`handleSetChecked`）
  から見た契約は満たされている**が、設計書の記述精度としては古いままである。
- 実装計画自身も「ドキュメント更新対象」節（L1943-1948）で「設計書側にも軽微な追記を反映するか
  どうかは Orchestrator の判断に委ねる」と保留にしている。
- 修正案: 実装着手前に Orchestrator が判断し、設計書 §新規モジュール・§エラー処理(e) を
  「`checked-sync-queue.ts` は例外を投げる／`use-checked-sync-queue.ts` の `enqueue` がそれを
  `boolean` に変換して吸収する」という実態に合わせて更新する（または「実装計画が優先」という
  優先順位をどこかに明示する）。ステータス `draft` のまま実装着手すること自体は前提として
  許容されているが、矛盾が残ったまま放置しないことを推奨する。

### S2. `useCheckedSyncQueue` の online/focus/mount effect が空依存配列のため、`items` 起因の stale closure で「未同期」バッジがマウント後に追加された品目に対して正しく更新されなくなりうる

- 該当箇所: `docs/implementation-plans/offline-write-queue.md` Step 2 の `use-checked-sync-queue.ts`
  （`refreshPendingItemIds` が `items` に依存、L556-569）、Step 3 の online/focus/mount
  `useEffect`（いずれも依存配列 `[]`、L1259-1292）。
- 事実確認（構造的な検証。実測はしていないため「未確認」を含む）:
  - `flush`/`enqueue` は `useCallback` で `items`（を経由する `refreshPendingItemIds`）に依存する。
  - `handleFocus`/`online`/マウント用の3つの `useEffect` は依存配列が `[]` のため、初回レンダー時
    に生成された `flush` のクロージャを以後ずっと使い続ける（React の古典的な stale closure。
    実装計画の「実装計画作成時に補った論点」3 は `pendingItemIdsRef` でこの種の問題に
    **一部だけ**対処しているが、`refreshPendingItemIds` が内部で参照する `items` 自体の
    staleness には対処していない）。
  - `enqueue`（`handleSetChecked` から直接呼ばれる。ユーザークリックの都度、その時点の
    render のクロージャを使うため stale ではない）は影響を受けないが、`flush`（online/focus/
    マウントの3経路から呼ばれる）は影響を受ける。
  - 具体的な影響シナリオ: オンライン中に `handleAddItem` で新規品目を追加 → その後オフラインで
    その新規品目をチェック（`enqueue` は fresh closure なので直後は正しくバッジが付く）→
    その後 `online`/`focus` イベントで stale な `flush` が発火 → 内部の `refreshPendingItemIds`
    は**マウント時点の `items`**（新規品目を含まない）でキュー内容をフィルタするため、
    `pendingItemIds` の再計算からこの品目が漏れ、実際にはまだキューに残っている
    （または送信中）にもかかわらず「未同期」バッジが消える／二度と正しく再現しない。
  - `flush` 自体の送信ロジック（`listCheckedOps()`・POST・`deleteCheckedOp`/`bumpAttempts`）は
    IndexedDB の生データと `setItems` の関数更新形しか使っておらず stale ではないため、
    **データの同期自体（サーバーへの送信）は失われない**。影響は表示（P-6 のバッジ）に限定される。
- 設計書・試験計画・実装計画のいずれにもこの経路は言及がない。
- 修正案: `pendingItemIdsRef` と同様に `items`（または `itemIds` の集合）も `useRef` でミラーし、
  `refreshPendingItemIds` がその ref を読むようにする。あるいは既知の限定的な UI 上のリスクとして
  設計書のリスク表（R-6 相当）に追記し、対応要否を Orchestrator に諮る。

### S3. `UOQ-07`/`LCQ-11`（attempts 上限）の破棄タイミングの記述が実装コードと食い違う

- 該当箇所: `docs/tests/offline-write-queue.md` UOQ-07（L161）・LCQ-11（L191）と
  `docs/implementation-plans/offline-write-queue.md` Step 2 の `handleRetryableFailure`
  （L590-600）・同 Step の UOQ-07 テストコード（L912-938）。
- 試験計画の文言は「`attempts:4` の状態から**5 回目の flush() 失敗で `attempts:5` に到達**→
  **6 回目の flush() トリガー**で初めて（送信を試みずに）破棄される」という、2 段階（送信して
  bump→次回に破棄判定）のシナリオを記述している。
- 一方、実装計画の実装コードは `handleRetryableFailure` が送信失敗の**その場**で
  `op.attempts + 1 >= MAX_ATTEMPTS` を判定し、`attempts:4` からの失敗（5 回目の送信試行）で
  **即座に破棄**する（6 回目のトリガーを待たない）。実装計画自身の UOQ-07 サンプルコードも
  `flush()` を 1 回呼ぶだけで破棄・`onQueueError('exhausted')` を検証しており、実装の挙動と
  整合する形になっている＝**試験計画の文言だけが実装と食い違っている**。
- 最終的に「合計 5 回試行して打ち切る」という結果は両者で一致するため機能的な欠陥ではないが、
  試験計画のシナリオ記述をそのまま読んで実装しようとすると誤った期待値でテストを書きかねない。
- 修正案: `docs/tests/offline-write-queue.md` の UOQ-07・LCQ-11 の記述を実装計画の実装
  （同一 flush サイクル内での即時破棄）に合わせて修正する。

### S4. Step 2 の `UOQ-08` サンプルコードが TTL 境界の片側しかカバーしていない

- 該当箇所: `docs/tests/offline-write-queue.md` UOQ-08（L162。「24h 未満は再送対象、24h 超過は
  破棄」の両方を要求）と `docs/implementation-plans/offline-write-queue.md` Step 2 の
  `UOQ-08` サンプルコード（L940-965）。
- 実装計画の `UOQ-08` は `enqueuedAt: Date.now() - 25 * 60 * 60 * 1000`（TTL 超過）のケースのみを
  検証しており、「24h 未満はまだ送信対象」という反対側の境界のアサーションが無い。
  `LCQ-10`（結合レベル）は両側を書く旨が記載されているが、`UOQ-08` 単体では欠落している。
- Step 2 の完了条件（L1158-1166）は「UOQ-01〜14（14 ケース）が…で通る」としており、LCQ 節の
  ような「テンプレートとして扱い実装者が拡充する」という免責が明記されていないため、この片側
  欠落は見落とされやすい。
- 修正案: `UOQ-08` に「TTL 未満（例: `enqueuedAt: Date.now() - (TTL_MS - 1000)`）では
  `postChecked` が呼ばれる」ケースを追加する。

### S5. 実装計画の LCQ セクションは「最重要」「Orchestrator必須」の観点の大半を具体コードで示していない

- 該当箇所: `docs/implementation-plans/offline-write-queue.md` Step 3
  「テスト変更内容」（L1442-1698）。
- 試験計画（`docs/tests/offline-write-queue.md` §5）は LCQ-01〜20 のうち
  LCQ-03/05/06/07/08/09/10/11/16/20 に「Orchestrator必須」または「最重要」の注記を付けている。
  特に LCQ-09（`response.json()` 誤判定の固定）は試験計画で明示的に「最重要」と位置づけられている。
- 実装計画が具体コードとして提示しているのは LCQ-01・04・05・06・13・14・独自追加の
  `LCQ-EX` の 7 件のみで、LCQ-09 を含む残り 13 件（うち「必須」指定 8 件）は
  「同じパターンで追加できるため、実装時に試験計画の表と突き合わせて全観点を満たす」
  （L1695-1698）として具体化されていない。
- LCQ-09（`response.json()` が reject する `{ok:true,status:200}` のケース）・LCQ-10
  （`vi.useFakeTimers()`/`vi.setSystemTime()` と DOM レンダリングの組み合わせ）・LCQ-16
  （LWW 容認の固定）はいずれも技術的に一癖あり（フェイクタイマーと非同期 IndexedDB の
  組み合わせ、`postChecked` の複数分岐モック等）、「同じパターン」だけでは実装者ごとに
  ブレが生じやすい。
- 修正案: 少なくとも LCQ-09（試験計画が「最重要」と明記する唯一の観点）と LCQ-10（フェイク
  タイマー利用の唯一の結合テスト）は実装計画に具体コードとして含めることを推奨する。
  難しければ、Orchestrator へ「実装時にこれらのテストコードの追加レビューを行う」ことを
  明示的な完了条件として申し送る。

---

## Nice

### N1. 設計書 §背景の行番号参照に軽微なズレ

- `docs/designs/offline-write-queue.md:44`「L84-86 のコメント」は実際には
  `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx:84-85`（2 行）。
  実害はない（実装計画側の行番号参照は別途確認済みで正確）。

### N2. `UOQ-08` の TTL 判定手法が試験計画の方針（フェイクタイマー）と異なる

- `docs/tests/offline-write-queue.md` §2 は「TTL は `vi.useFakeTimers()` + `vi.setSystemTime()`
  で固定する」と明記するが、実装計画の `UOQ-08` は `Date.now() - 25h` という相対オフセットを
  直接埋め込む方式で代用しており、フェイクタイマーを使っていない。結果は決定的で機能的な
  問題はないが、方針の文言とは不一致。

### N3. `store-group.test.tsx`/`shopping-item-row.test.tsx` の `defaults` 行番号参照が実ファイルと数行ズレている

- `docs/tests/offline-write-queue.md` L208/L218 の「L62-77」「L89-101」は実際には
  `defaults` 開始行が L63/L89、関数終了が L79/L105（数行のズレ）。実装者が該当箇所を
  特定する上で支障になるほどではない。

---

## 確認事項（未確認のまま）

- iOS Safari の Background Sync 未対応という前提（要件書§前提、設計書R-1）は、本レビューの
  実行環境でも一次情報（developer.mozilla.org / caniuse.com）へのアクセスができず、
  引き続き未確認。要件書・設計書が既に「未確認」と明記済みであり、新たな確認手段は本レビューでは
  提供できない。
- `happy-dom` が `indexedDB`/`IDBKeyRange` を実装していないという試験計画の主張は、本レビューで
  実機能検証を行い**真であることを確認した**（`apps/web` の `happy-dom` を用いて実測）。
