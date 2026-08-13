# 要件定義: offline-write-queue

- task-id / 変更レベル: Sprint 9 タスク1「PWA オフライン書き込みキュー」 / L3
- 作成日: 2026-08-11

## 背景

`docs/05-roadmap.md`（L709-724）の Sprint 9 タスク1は「PWA オフライン書き込みキュー
（Background Sync）」として計画され、出典は `docs/designs/shopping-list-screens.md` S-5
（L167-176）に遡る。S-5 では 3 案が比較され、Unit B（L2 相当）の粒度では「案 A: 実装しない
（既存の catch による通信エラー表示のみ）」が採用され、「案 C: Background Sync + IndexedDB
の本格実装」は「新規のクライアント側アーキテクチャ・状態設計が必要で L2 の粒度を超える。
実質 L3 相当」として先送りされていた。今回 Sprint 9 で L3 として着手する。

ただし、Orchestrator とユーザーの事前検討により、S-5 案 C からさらに一歩踏み込んだ方式を
採用することが確定している（詳細は §前提）。**roadmap の「（Background Sync）」という表記は
実際の採用方式と異なる**（Background Sync API は不採用）。実装時・レビュー時の混乱を避けるため、
roadmap の当該行は本要件確定後に「PWA オフライン書き込みキュー（アプリ層のみ・案 C 派生）」
などへ更新することを推奨する（本タスクのスコープでは更新を実施しない。§未決事項に記載）。

また `docs/05-roadmap.md` L684-687 には「Sprint 9 タスク1（Background Sync）が同じ `sw.ts` を
触るため」PR #147 を早期マージしたという記述があるが、本要件確定後は **`sw.ts` を一切変更しない**
ため、この懸念は実質的に解消される。

対象の書き込み操作は、2026-07-24 に確定した「チェック操作」（`docs/designs/shopping-list-item-check.md`）
に限定する。同設計により `POST /api/shopping-lists/:id/items/:itemId/checked` が新設され、
`apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx` の `handleSetChecked`
（L189-224）が `useOptimistic` + `startTransition` + `submittingItemId` のパターンで実装済みである。
このオフライン失敗時、現状は `catch` ブロックで `NETWORK_ERROR_MESSAGE` を表示するのみで、
`useOptimistic` の楽観値は transition 終了時に確定 state（`items`）へ自動的に巻き戻る
（`docs/designs/shopping-list-screens.md` L353「楽観値は自動的に破棄される」）。

## 目的

- 電波の悪い店内（土曜の買い物運用）でチェック操作が「失われた」ように見えることをなくす。
- オフライン中に行ったチェック操作を端末内に永続化し、オンライン復帰後に自動的にサーバーへ
  反映する。
- 既存の楽観的更新（`useOptimistic` パターン）・Service Worker の読み取りキャッシュ戦略
  （`apps/web/src/app/sw.ts`）を破壊しない。

## ユーザー要求（原文の要約）

- 方式は「案 C: アプリ層のみ」。IndexedDB に永続キューを持ち、`online` イベントとフォーカス
  復帰で再送する。`apps/web/src/app/sw.ts` には一切触らない。
- キュー対象はチェック操作（`POST .../items/:itemId/checked`）のみ。`bought` / `DELETE` /
  `consume` は対象外。
- Background Sync API（SyncManager）は不採用。理由は Chromium 系限定で iOS Safari が未対応な
  ため（Cookpit の主対象は iPhone の PWA）。**2026-08-13 に一次情報で確認済み**（MDN BCD /
  caniuse / WebKit standards-positions。詳細は設計書 §リスク R-1）。
- Background Sync 併用は将来拡張として対象外に申し送る。

## 機能要件

| ID    | 要件                                                                                                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | オフライン中に `handleSetChecked` が失敗（ネットワーク例外）した場合、操作を端末内に永続化されたキューへ積む                                              |
| FR-2  | キューに積んだ操作の内容は、確定 state（`items`）に即座に反映され、`useOptimistic` の transition 終了後も UI 上のチェック状態が保持される                 |
| FR-3  | `online` イベント発火時にキューを自動再送する                                                                                                             |
| FR-4  | 既存のフォーカス復帰時再取得（`shopping-list-client.tsx` L139-148 の `handleFocus`）のタイミングでもキューを再送する。再送完了後に再取得（refetch）を行う |
| FR-5  | 画面マウント時（ページ再読み込み・再訪問）にも、端末内に残っているキューを読み込み・反映・再送を試みる                                                    |
| FR-6  | 同一品目に対する複数回のチェック操作は、最新の望む状態 1 件へ集約（coalesce）される                                                                       |
| FR-7  | キューに積まれている品目は、行単位で「未同期」であることが UI 上で識別できる                                                                              |
| FR-8  | サーバーが 4xx（422: リスト完了済み）を返した場合はキューへ積まず、または既存のキューエントリを破棄し、エラー表示する                                     |
| FR-9  | サーバーが 404（品目が既に存在しない）を返した場合はキューエントリを破棄し、エラー表示はしない                                                            |
| FR-10 | キューエントリには送信試行回数（attempts）と保持期限（TTL）を持ち、上限・期限超過時は自動的に破棄する                                                     |
| FR-11 | 対象は `checked` 操作のみ。`markAsBought`（`.../bought`）・品目削除（`DELETE`）・在庫消費（`consume`）はキュー対象に含めない                              |
| FR-12 | `apps/web/src/app/sw.ts` は変更しない                                                                                                                     |

## 非機能要件（性能・セキュリティ・可用性など。無ければ「対象外」）

- **可用性**: iOS Safari を含む主要ブラウザで、オフライン中に行った操作がタブを閉じても失われない
  （IndexedDB の永続化に依存。ただし `docs/02-tech-stack.md` L116「iOS は7日間アプリを起動しないと
  ローカルストレージがクリアされる場合がある」という既知の制約があるため、無期限保持は前提にしない
  — 本要件の TTL 設計と整合させる）。
- **性能**: キューの読み書きは端末内 IndexedDB への小規模（数件〜十数件、1件あたり数十バイト）の
  I/O であり、サーバー負荷・ネットワーク帯域への影響はない。既存エンドポイントの呼び出し回数は
  増えない（再送は失敗した分のみ）。
- **セキュリティ**: 認証なし MVP1/MVP2 の既存信頼モデル（`docs/decisions/ADR-0003-no-auth-in-mvp1.md`）
  を維持する。IndexedDB は同一オリジンのみアクセス可能なブラウザ標準の分離境界に依存する。新規の
  認可判断は発生しない。
- **テスト容易性（既知の懸念）**: 現行のコンポーネントテスト環境は `happy-dom`
  （`apps/web/vitest.dom.config.mts` L8）であり、IndexedDB の実装有無を本タスク実行環境内では
  一次情報で確認できていない（§未決事項）。

## 正常系

| ID   | シナリオ                                                                                                                       |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| N-01 | オンライン時にチェック操作 → 既存どおり即座にサーバーへ反映される（キューは使われない）                                        |
| N-02 | オフライン時にチェック操作 → 即座に UI へ反映され「未同期」表示になり、キューへ永続化される                                    |
| N-03 | オフラインで複数品目をチェック → すべて「未同期」表示のままキューに積まれる                                                    |
| N-04 | オフラインで同一品目を複数回操作（チェック→解除→チェック） → キューは最新の状態 1 件のみ保持する（FR-6）                       |
| N-05 | オフライン→オンライン復帰（`online` イベント） → キューが自動再送され、成功した品目は「未同期」表示が消える                    |
| N-06 | オフラインのままタブを閉じて後日再度開く → 画面マウント時にキューが読み込まれ、UI に未同期状態が復元される（FR-5）             |
| N-07 | 画面をバックグラウンドにしてから復帰（フォーカス） → キュー再送が先に完了してから、既存の `handleRefetch` が実行される（FR-4） |
| N-08 | 2人が同時に別の品目をオフラインでチェック → それぞれの端末のキューが独立して同期される（互いに干渉しない）                     |

## 異常系

| ID   | シナリオ                                                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-01 | キュー再送時にリストが `completed`（422） → キューエントリを破棄し、エラーメッセージを表示する                                                                                                                   |
| E-02 | キュー再送時に品目が既に存在しない（404） → キューエントリを破棄し、エラーメッセージは表示しない（`handleRemoveItem` の 404 許容と同じ思想）                                                                     |
| E-03 | 再送を試みたが再びネットワーク例外 → キューに残し、次回のトリガー（`online`/フォーカス/マウント）を待つ。attempts をインクリメントする                                                                           |
| E-04 | attempts が上限を超過 → キューエントリを破棄し、同期不能をユーザーに提示する                                                                                                                                     |
| E-05 | エンキュー時刻から TTL（推奨24時間）を超過 → 次回の再送試行時にエントリを破棄する                                                                                                                                |
| E-06 | IndexedDB が利用不可（プライベートブラウジング等でオープンに失敗） → キュー機構全体を無効化し、既存の即時エラー表示（現行挙動）にフォールバックする                                                              |
| E-07 | 2人が同じ品目をそれぞれオフラインで操作し、後から双方のキューが非同期に同期される → 最後に成功した書き込みが勝つ（Last-Write-Wins。既存の `markAsBought`/`reassignStore` と同じ設計思想を踏襲。§未決事項で確認） |

## 境界条件（null・空・上限/下限・権限境界）

| ID   | 条件                                                                                                                                                                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-01 | キューが空の状態でオンライン復帰イベントが発火 → 何もしない（no-op）                                                                                                    |
| B-02 | キューに同一 itemId のエントリが複数存在する状態は発生させない（coalesce の不変条件。実装は put による上書きで担保）                                                    |
| B-03 | 1リスト・1セッションで想定されるキュー件数は数件〜十数件（買い物リストの品目数の上限）。上限件数のハードリミットは設けない（品目数自体が小規模なため）                  |
| B-04 | `checked: true` と `checked: false` のどちらも扱う（trueのみに限定しない）                                                                                              |
| B-05 | オフライン中に品目が追加された場合（`AddItemForm` 経由）は本キューの対象外（FR-11）。追加操作自体がオフラインで失敗した場合は既存の即時エラー表示のまま（現行挙動維持） |
| B-06 | リストが `readOnly`（`completed`）状態でのチェック操作は、UI 側で既に操作自体を無効化しているため、オフラインキューにも積まれない                                       |

## 前提

- 方式は「案C: アプリ層のみ」で確定済み（Orchestrator/ユーザー確定）。`packages/domain` /
  `packages/application` / `packages/infrastructure` / `packages/api-contract` の変更は不要
  （既存の `POST /api/shopping-lists/:id/items/:itemId/checked` をそのまま再利用する。
  スキーマは `packages/api-contract/src/shopping-list.schema.ts` L36-38 `setItemCheckedSchema`）。
- Background Sync API（`ServiceWorkerRegistration.sync` / `SyncManager`）は採用しない。
  **確認済み（2026-08-13）**: iOS Safari は非対応。出典は設計書 §リスク R-1
  （MDN BCD `safari` / `safari_ios` とも `version_added: false`、caniuse Safari on iOS
  3.2–26.5 Not supported、WebKit standards-positions #14 は open で肯定的ポジションなし）。
  将来 iOS Safari が対応した場合、`sw.ts` の `addEventListener('sync', ...)` +
  `ServiceWorkerRegistration.sync.register()` によるブラウザネイティブの再送機構を追加検討
  できるが、これは `sw.ts` への変更を伴うため本要件のスコープ外（案C固定）のまま変わらない。
- 対象操作はチェック操作 1 種類のみ（`SetItemCheckedUseCase` 経由）。同ユースケースは
  `packages/application/src/shopping-list/set-item-checked.use-case.ts` L32-37 のとおり
  「望む状態が既に一致していれば Domain 呼び出しをスキップする」冪等設計であり、キューからの
  重複送信・再送が安全である前提が既に整っている。
- `apps/web/src/app/sw.ts` の `runtimeCaching`（L56-94）は GET リクエストのみを対象にしており
  （L64-65 のコメント「POST（bought/target-store/items 追加）を誤ってキャッシュ対象にしないよう
  matcher で GET を明示する」）、`checked` への POST は Service Worker のキャッシュ処理を経由せず
  通常のネットワークフェッチとして扱われる。オフライン時は `fetch` が例外を投げる（現行の
  `handleSetChecked` の `catch` ブロックと同じ経路）。この前提により、Service Worker を一切
  変更せずにアプリ層だけで失敗検知・キュー投入ができる。

## 制約

- 変更は Presentation 層（`apps/web/`）に閉じる。Domain / Application / Infrastructure に変更が
  必要と判明した場合は、独断で広げず設計書へ論点として明記し Orchestrator へ差し戻す。
- `packages/api-contract` は変更しない。
- コーディング規約（`.claude/rules/coding-standards.md`）に従う：`any` 禁止・default export
  禁止・`import type`・`===`/`!==`・「値なし」は `null`。
- テストランナーは Vitest。
- 実装コードは本タスク（要件定義・設計）では変更しない。

## 対象範囲

- `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`
  （`handleSetChecked` の拡張、キュー再送のトリガー配線、`handleFocus` との順序制御）。
- `apps/web/src/app/shopping-lists/_components/store-group.tsx` /
  `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`
  （「未同期」状態を表す新規 prop の中継・表示）。
- 新規クライアント側モジュール（IndexedDB キュー読み書き・再送処理。ファイル配置は設計書で決定）。
- 既存の `POST /api/shopping-lists/:id/items/:itemId/checked` エンドポイントの**呼び出し方**の
  変更（エンドポイント自体・契約は変更しない）。

## 対象外

- Background Sync API（`SyncManager`）の採用（§前提。2026-08-13 時点で iOS Safari 非対応を確認済み）。
  将来 iOS Safari が対応し、かつ `sw.ts` への変更が許容される段階で再検討する候補として申し送る。
- `apps/web/src/app/sw.ts` の変更。
- `markAsBought`（`.../bought`）・品目削除（`DELETE .../items/:itemId`）・在庫消費（`consume`）を
  キュー対象に含めること。
- 2人利用時の競合を解消する仕組み（楽観的ロック・バージョニング・CRDT 等）の新規導入。
  Last-Write-Wins のまま（既存の `markAsBought`/`reassignStore` と同じ設計思想。
  `docs/designs/shopping-list-item-check.md` の R-3 リスクの延長として扱う）。
- `packages/domain` / `packages/application` / `packages/infrastructure` / `packages/api-contract`
  の変更。
- 複数デバイス間のリアルタイム同期強化（WebSocket 等）。
- チェック操作以外（手動追加・削除・店舗再割当・価格記録・買い物完了）のオフライン耐性強化。

## 後方互換性・データ移行（該当なければ「対象外」）

対象外。DB マイグレーション・API 契約の変更を伴わない。新規に追加するのは端末内 IndexedDB の
スキーマのみであり、既存データ・既存クライアントへの影響はない。

## 受け入れ条件（Definition of Done に対応）

- `docs/05-roadmap.md` L722 の完了条件「オフライン中のチェック操作が復帰後に反映される」を
  満たす設計になっている。
- 上記の正常系 N-01〜N-08・異常系 E-01〜E-07・境界条件 B-01〜B-06 が設計書でカバーされている。
- `apps/web/src/app/sw.ts` への変更を含まない。
- Domain / Application / Infrastructure / api-contract への変更を含まない（含める場合は
  Orchestrator 経由でユーザー確認を得た上で設計書に明記する）。
- `pnpm lint` / `pnpm type-check` / `pnpm test` が通ることを実装計画・試験計画に含める
  （本タスクでは要件定義・設計のみのため実行はしない）。

## 未決事項（誰に何を確認するか）

1. **Background Sync 未対応（iOS Safari）の一次情報確認** — **解消済み（2026-08-13）**。
   iOS Safari は非対応（§前提・設計書 R-1）。案 C の採用根拠は成立。
2. **IndexedDB を素の API で書くか、`idb` 等のパッケージを新規追加するか**。新規依存の追加は
   ユーザー確認が必要（設計書 §フロントエンド設計で推奨案を提示するが確定しない）。
3. **`happy-dom`（`apps/web/vitest.dom.config.mts`）が IndexedDB を実装しているか未確認**。
   実装しない場合、単体テストに `fake-indexeddb` 等の追加ポリフィル（さらなる新規 devDependency）
   が必要になる可能性がある。実装着手前に確認要（設計書 §テスト方針に記載）。
4. **未同期状態の UI 表現**（行ごとのバッジ／件数バッジ／バナーのいずれか）。設計書で推奨案を
   示すが最終確定はユーザー確認を推奨する。
5. **`docs/05-roadmap.md` L715 の「（Background Sync）」表記の更新要否**。本要件確定後に
   実態と異なる表記が残る点をどう扱うか（更新するか、注記を残すか）。
6. **E-07（2人が同じ品目を非同期にオフライン操作した場合の LWW 容認）の明示的な合意**。
   既存踏襲という前提で進めるが、オフライン時間が長引くほど「知らないうちに相手の変更を
   上書きする」リスクが実時間操作より大きくなる点をユーザーに認識してもらった上での確認を推奨する。
