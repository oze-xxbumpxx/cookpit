# 試験計画: expiry-alert

- 作成日: 2026-08-09
- 前提となる設計書: `docs/designs/expiry-alert.md`（P-1〜P-17 ユーザー確定・2026-08-09・confirmed）
- 前提となる契約設計書: `docs/designs/expiry-alert.contract.md`（confirmed。§10「契約テスト方針」を
  そのまま踏襲し、本書では観点に ID を付与して層別に再配置・拡張する）
- 前提となる要件書: `docs/requirements/expiry-alert.md`（正常系 N-1〜N-8 / 異常系 E-1〜E-7 /
  境界条件 B-1〜B-6）
- 関連 ADR: `docs/decisions/ADR-0017-web-push-expiry-alert.md`
- レベル: L3（Domain / Application / api-contract / Infrastructure / Presentation 全層 +
  外部 I/O 新設 + 手動確認が中心的価値を持つユニット）
- 実装状況: **未実装（プロダクションコード 0 件）**。契約設計書 L24-26 の記載を本書でも
  踏襲する（`push_subscriptions` / `PushSubscription` / `VAPID_PUBLIC_KEY` / `CRON_SECRET`
  を含むアプリコードが存在しないことは契約設計時に grep 確認済み）。したがって本書の
  「メソッド網羅」は**設計書のコード例から読み取れる公開 API 一覧**であり、Unit A のような
  「既存コードの実測」ではない。実装後に差異が出た場合は implementer が本書と突き合わせる。
- 更新1: 2026-08-09（提出後にユーザー確定した P-13/P-14 を反映）。
  **P-13**: `PushSender` port の配置先を `packages/application` から
  `packages/domain/src/push-subscription/push-sender.ts` へ変更（Infrastructure →
  Application の依存方向違反を implementation-planner が検出）。
  **P-14**: `formatExpiryUrgencyLabel` を含む `apps/web/src/app/_utils/expiry.ts` の
  **全 6 export**を `packages/application/src/pantry/expiry.ts` へ移設し、
  `apps/web/src/app/_utils/expiry.ts` 自体を削除する（P-4 と P-7 の非両立を解消。
  `expiryUrgencyChipClass`（CSS クラス名。`apps/web/src/app/_utils/category-color.ts`）は
  据え置き・変更なし）。
- 更新2: 2026-08-09（security-reviewer 起票で確定した P-15〜P-17 と、手動確認手順への
  追記 M-2/M-3/H-1 を反映）。**P-15**: `SubscribeToExpiryAlertUseCase` に購読件数上限
  10 件を追加（新規 `endpoint` かつ既存購読 10 件以上で `InvalidOperationError` → 422。
  既存 `endpoint` の再登録（upsert 経路）は上限の対象外）。無認証 `subscribe` が VAPID
  公開鍵を無認証配布と組み合わさることで悪用され得るための対策。**P-16**:
  `pushEndpointSchema` に `hostname` 検証を追加（IPv4/IPv6 リテラル・`localhost`/`.local`/
  `.internal`・userinfo 埋め込み・サフィックス偽装ホストを reject）。**P-17**: `p256dh`
  を `.min(86).max(88)`、`auth` を `.min(22).max(24)` に厳格化（下限が緩いと不正な長さの
  鍵が `web-push` の送信前例外で `reason: 'other'` に落ち、購読が削除されず恒久的に
  失敗し続けるため）。設計書・ADR・契約設計書・実装計画は他エージェントが並行更新中の
  ため本書からは変更しない。P-15〜P-17 の行番号は更新後の設計書を本書では再読していない
  ため付与しない（§確定事項の項番のみを引用する）。

## 試験種別

- **単体試験**: Domain（`PushSubscription`）、Application（`SubscribeToExpiryAlertUseCase` /
  `UnsubscribeFromExpiryAlertUseCase` / `SendExpiryAlertsUseCase` / `GetExpiringStocksUseCase` /
  移設後の `expiry.ts`）、api-contract（`push-subscription.schema.ts`）。
- **結合試験**: Infrastructure（PGlite。`DrizzlePushSubscriptionRepository` + `web-push` を
  モックした `WebPushSender`）、Presentation の Hono ルート（`app.request()` インプロセス
  HTTP、UseCase は `vi.mock`）、RTL コンポーネントテスト（購読 ON/OFF コンポーネント新設・
  既存 `dashboard.tsx`/`stock-row.tsx` の import 差し替え回帰）。
- **自動化できない観点（基盤上の制約ではなく Web Push の性質上の制約）**: 実機 Push 受信、
  iOS 固有の 2 経路（ホーム画面追加 PWA 前提・VAPID subject 制約）、`vercel.json` の Cron
  実際の発火。これらは §10 manual-browser-verify を**必須の確認手順**として扱う（「基盤待ちの
  未実装観点」ではなく「原理的に自動化できない観点」として明確に区別する）。

---

## 0. 実装コード走査結果（メソッド網羅チェックの基礎）

### 0-1. 新設される公開 API 一覧（設計書コード例からの読み取り。実測ではない）

| 層                                 | クラス/対象                                                                                                                                                    | 公開メソッド                                                                                                                                                                                                                    | 出典                                                                                                                                                      |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain                             | `PushSubscription`                                                                                                                                             | `static create(input)` / `static reconstruct(props)` / `get id` / `get endpoint` / `get p256dh` / `get auth` / `get createdAt`                                                                                                  | 設計書 L178-207                                                                                                                                           |
| Domain                             | `PushSubscriptionId`（既存 `Identifier<Brand>` 基底を使う想定。実測: `packages/domain/src/shared/identifier.ts` L13-25、`StockId` の実装パターン L3-8 と同型） | `static generate()` / `static fromString(value)`                                                                                                                                                                                | 実測（既存 ID クラスの規約からの推定）                                                                                                                    |
| Domain                             | `PushSubscriptionRepository`（interface）                                                                                                                      | `findAll()` / `findByEndpoint(endpoint)` / `save(subscription)` / `deleteByEndpoint(endpoint)` / `deleteByEndpoints(endpoints)`                                                                                                 | 設計書 L215-227                                                                                                                                           |
| Domain（P-13 確定・配置変更）      | `PushSender`（interface。`PushPayload`/`PushSendResult`/`PushSubscriptionTarget` を伴う）                                                                      | `send(subscription, payload): Promise<PushSendResult>`                                                                                                                                                                          | 設計書 §確定事項 P-13（`packages/domain/src/push-subscription/push-sender.ts`）                                                                           |
| Application                        | `SubscribeToExpiryAlertUseCase`（**P-15 確定で挙動追加**）                                                                                                     | `execute(input): Promise<void>`。新規 `endpoint` かつ既存購読が 10 件以上の場合は `InvalidOperationError` を throw する。既存 `endpoint` の再登録（upsert 経路）はこの上限の対象外                                              | 設計書 L419-437 + §確定事項 P-15                                                                                                                          |
| Application                        | `UnsubscribeFromExpiryAlertUseCase`                                                                                                                            | `execute(input): Promise<void>`                                                                                                                                                                                                 | 設計書 L439-446                                                                                                                                           |
| Application                        | `SendExpiryAlertsUseCase`                                                                                                                                      | `execute(asOf): Promise<SendExpiryAlertsResultDto>`（内部で `PushSender`（`@cookpit/domain`）に依存）                                                                                                                           | 設計書 L358-415（P-13 反映後は `PushSender` の import 元のみ変更）                                                                                        |
| Application                        | `GetExpiringStocksUseCase`                                                                                                                                     | `execute(asOf, withinDays = EXPIRY_URGENCY_WITHIN_DAYS): Promise<StockDto[]>`                                                                                                                                                   | 設計書 L277-284                                                                                                                                           |
| Application（P-14 確定・全移設）   | `expiry.ts`（旧 `apps/web/src/app/_utils/expiry.ts` の**全 6 export**を移設）                                                                                  | `EXPIRY_URGENCY_WITHIN_DAYS` / `parseExpiryDate` / `toLocalMidnight` / `getExpiryRemainingDays` / `ExpiryUrgency` / `getExpiryUrgency` / `formatExpiryUrgencyLabel` / `selectExpiringStocks`（旧 `dashboard-view.ts` から移動） | 設計書 §確定事項 P-14。実測（移設前）: `apps/web/src/app/_utils/expiry.ts`（全 52 行・6 export）・`apps/web/src/app/_utils/dashboard-view.ts`（全 31 行） |
| Infrastructure                     | `DrizzlePushSubscriptionRepository`                                                                                                                            | `findAll()` / `findByEndpoint()` / `save()`（upsert） / `deleteByEndpoint()` / `deleteByEndpoints()`                                                                                                                            | 設計書 L508-537                                                                                                                                           |
| Infrastructure                     | `WebPushSender`（P-13 確定: `PushSender`（`@cookpit/domain`）を実装する）                                                                                      | `send(subscription, payload): Promise<PushSendResult>`                                                                                                                                                                          | 設計書 L551-576                                                                                                                                           |
| Presentation                       | `pushRoute`（**P-15 確定で追加分岐**）                                                                                                                         | `GET /vapid-public-key` / `POST /subscribe`（上限超過時は 422） / `POST /unsubscribe`                                                                                                                                           | 設計書 L588-615 + §確定事項 P-15                                                                                                                          |
| Presentation                       | `cronRoute`                                                                                                                                                    | `GET /expiry-alerts`                                                                                                                                                                                                            | 設計書 L618-638                                                                                                                                           |
| Presentation                       | `sw.ts` 追記                                                                                                                                                   | `self.addEventListener('push', ...)` / `self.addEventListener('notificationclick', ...)`                                                                                                                                        | 設計書 L659-674、実測: 既存 `apps/web/src/app/sw.ts`（全 59 行）には該当ハンドラ無し                                                                      |
| apps/web UI                        | `expiry-alert-subscription.tsx`（新設。クライアントコンポーネント）                                                                                            | ON/OFF ボタン                                                                                                                                                                                                                   | 設計書 L676-692                                                                                                                                           |
| apps/web UI（P-14 反映・分裂解消） | `dashboard.tsx`（既存・改修）                                                                                                                                  | `getExpiryRemainingDays`/`getExpiryUrgency`/`formatExpiryUrgencyLabel` の**3 関数すべて**を `@cookpit/application` から import する（`expiryUrgencyChipClass` のみ据え置き）                                                    | 実測（移設前）`apps/web/src/app/_components/dashboard.tsx` L4-8                                                                                           |
| apps/web UI（P-14 反映・分裂解消） | `stock-row.tsx`（既存・改修）                                                                                                                                  | 同上（3 関数すべて `@cookpit/application` から import）                                                                                                                                                                         | 実測（移設前）`apps/web/src/app/pantry/_components/stock-row.tsx` L1-8                                                                                    |
| apps/web                           | `page.tsx`（ダッシュボード。既存・改修）                                                                                                                       | `selectExpiringStocks` 直接呼び出しを `GetExpiringStocksUseCase` に差し替え                                                                                                                                                     | 実測 `apps/web/src/app/page.tsx`（全 19 行）                                                                                                              |

対象外項目（送信履歴の永続化・通知の既読管理・献立リマインダー等の他通知種別）は要件書
「対象外」節のとおり本書のメソッド網羅の対象に含めない。

### 0-2. 実測で確認した重要な事実（設計書に明記が薄く、本書で補う）

- **`dashboard.tsx` は `'use client'` を持たない**（実測: L1 から import 文で始まり
  ディレクティブ無し）。`page.tsx`（Server Component）から直接呼ばれているため、
  `@cookpit/application` の関数を import してもクライアントバンドルには含まれない。
  **設計書 R-12（バンドルサイズ増の懸念）は `dashboard.tsx` には該当しない**。
- **`stock-row.tsx` も自身は `'use client'` を持たない**（実測: L1-14 に該当ディレクティブ無し）。
  ただし `pantry-client.tsx`（親コンポーネント。stock-edit 設計書で `'use client'` かつ
  編集対象 state を持つと記載）配下で描画されるため、Next.js のコンポーネント境界の実際の
  挙動（親が client なら子も client バンドルに含まれるか）は実装時にビルド後のバンドルを
  確認しないと確定しない。試験計画としては**アサーション困難な観点**のため自動テストの
  対象にはせず、実装計画の申し送りとして §15 に記録する。
- **既存 `apps/web/tests/app/_utils/dashboard-view.node.test.ts`（実測・全 196 行）は
  P-4/P-14 の移設対象関数のテストを大量に含んでいる。** `MEAL_PLAN_STATUS_LABELS`
  （L80-88）のみが移動せずに残り、他 5 グループ（`selectExpiringStocks`・
  `getExpiryRemainingDays`・`EXPIRY_URGENCY_WITHIN_DAYS`・`getExpiryUrgency`・
  `formatExpiryUrgencyLabel`）はすべて `packages/application/tests/pantry/expiry.test.ts`
  へ移設する（§3-5・§8 REG-06・§15 項目 1 で解決済み）。
- **`apps/web/src/app/sw.ts` を対象にした既存の自動テストは 0 件**（grep で
  `sw.ts`/`ServiceWorkerGlobalScope`/`self.addEventListener` を検索した結果、ヒットは
  `next.config.ts` の `swSrc: 'src/app/sw.ts'` という文字列参照のみ）。既存の
  `runtimeCaching` 4 件の回帰保証は `docs/tests/saturday-flow.md:83-86`
  （O-01・「本番ビルド + 実機が必要」と明記）が**手動確認としてのみ**担っており、
  自動テストによる回帰ガードは元々存在しない。
- **`sw.ts` の `push`/`notificationclick` ハンドラ自体の単体テストも、モジュール構造上
  自動化が困難と判断する。** `sw.ts`（実測・全 59 行）は import 時に
  `new Serwist({ precacheEntries: sw.__SW_MANIFEST, ... })` を即時実行し、
  `self.__SW_MANIFEST` という Service Worker 専用グローバルに依存する。happy-dom
  環境（`apps/web/vitest.dom.config.mts` 実測）は `ServiceWorkerGlobalScope` を提供しないため、
  モジュール全体を `import` するテストは `Serwist` コンストラクタの呼び出しで失敗する
  可能性が高い。§10 の手動確認を主たる検証手段とする（詳細は §15）。
- **`page.tsx`（ダッシュボード）・`pantry` の `page.tsx` は既存コードベースで直接テストされていない**
  （`apps/web/tests/app/_utils/dashboard-view.node.test.ts` はユーティリティ関数のテストで
  あり `page.tsx` 自体の統合テストではない）。本ユニットも同じ方針を踏襲し、`page.tsx` の
  `GetExpiringStocksUseCase` への差し替えは `dashboard.test.tsx`（Dashboard コンポーネントに
  props で渡された後の表示）と `GES-*`（UseCase 単体）の組み合わせで間接的にカバーする。
- **`apps/web/tests/server/routes/pantry.test.ts`（実測）は既に `UpdateStockDetailsUseCase`
  を import・モックしている**ことを確認した。これは Unit A（stock-edit）がマージ済みで
  あることの直接的な裏付けであり、要件書「前提」節の記載と整合する。
- **（P-15/P-16 反映）既存の「`subscribe`/`unsubscribe` は無認証。`endpoint` の推測困難性に
  依拠する」という設計判断は、security-reviewer の指摘（VAPID 公開鍵が無認証で配布されて
  いるため攻撃者は `endpoint` を推測する必要がない）により、購読件数上限（P-15）と
  `endpoint` のホスト検証（P-16）という 2 つの追加防御で補強された。** 本書は
  この 2 点を単体・契約試験観点として追加する（§3-1 SUB-06〜08・§4 Z-PUSH-15〜26）。

---

## 1. メソッド網羅チェック表

| 層                                           | クラス/対象                                                | メソッド                                                                                                                                                                        | 変更種別         | 対応する試験観点 No                             |
| -------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------- |
| Domain                                       | `PushSubscription`                                         | `static create(input)` / `static reconstruct(props)` / 5 getter                                                                                                                 | 新設             | PS-01〜08                                       |
| Domain                                       | `PushSubscriptionId`                                       | `static generate()` / `static fromString()`                                                                                                                                     | 新設             | PS-01（間接確認）                               |
| Domain（P-13 確定）                          | `PushSender`（interface）                                  | `send(subscription, payload)`                                                                                                                                                   | 新設・配置変更   | 専用テストなし。INF-WPS-01〜06・SEA-\* でカバー |
| Application（**P-15 確定で観点追加**）       | `SubscribeToExpiryAlertUseCase`                            | `execute(input): Promise<void>`                                                                                                                                                 | 新設             | SUB-01〜08                                      |
| Application                                  | `UnsubscribeFromExpiryAlertUseCase`                        | `execute(input): Promise<void>`                                                                                                                                                 | 新設             | UNSUB-01〜02                                    |
| Application                                  | `SendExpiryAlertsUseCase`                                  | `execute(asOf): Promise<SendExpiryAlertsResultDto>`                                                                                                                             | 新設             | SEA-01〜11                                      |
| Application                                  | `GetExpiringStocksUseCase`                                 | `execute(asOf, withinDays?): Promise<StockDto[]>`                                                                                                                               | 新設             | GES-01〜05                                      |
| Application（P-14 確定・拡張）               | `expiry.ts`（移設）                                        | `parseExpiryDate`/`toLocalMidnight`/`getExpiryRemainingDays`/`getExpiryUrgency`/`formatExpiryUrgencyLabel`/`selectExpiringStocks`/`EXPIRY_URGENCY_WITHIN_DAYS`（6 export 全て） | 移設（挙動不変） | APX-01〜24                                      |
| api-contract（**P-16/P-17 確定で観点追加**） | `push-subscription.schema.ts`                              | `subscribeToExpiryAlertSchema`/`unsubscribeFromExpiryAlertSchema`/`vapidPublicKeyResponseSchema`/`expiryAlertsCronResultSchema`.`.parse()`                                      | 新設 + 検証強化  | Z-PUSH-01〜26                                   |
| Infrastructure                               | `DrizzlePushSubscriptionRepository`                        | `findAll()`/`findByEndpoint()`/`save()`/`deleteByEndpoint()`/`deleteByEndpoints()`                                                                                              | 新設             | INF-PUSH-01〜08                                 |
| Infrastructure                               | `WebPushSender`（`PushSender`（`@cookpit/domain`）を実装） | `send(subscription, payload)`                                                                                                                                                   | 新設             | INF-WPS-01〜06                                  |
| Presentation（**P-15 確定で観点追加**）      | `pushRoute`                                                | `GET /vapid-public-key` / `POST /subscribe` / `POST /unsubscribe`                                                                                                               | 新設             | WH-PUSH-01〜11                                  |
| Presentation                                 | `cronRoute`                                                | `GET /expiry-alerts`                                                                                                                                                            | 新設             | WH-CRON-01〜08                                  |
| Presentation                                 | `sw.ts`                                                    | `push`/`notificationclick` ハンドラ                                                                                                                                             | 新設             | SW-01〜05（自動化困難。§10 に委譲）             |
| apps/web UI                                  | `expiry-alert-subscription.tsx`                            | コンポーネント（新設）                                                                                                                                                          | 新設             | EAS-01〜09                                      |
| apps/web UI                                  | `dashboard.tsx`                                            | import 元差し替え（3 関数とも `@cookpit/application`）                                                                                                                          | 変更             | DASH-REG-01〜02                                 |
| apps/web UI                                  | `stock-row.tsx`                                            | import 元差し替え（3 関数とも `@cookpit/application`）                                                                                                                          | 変更             | SR-REG-01〜02                                   |
| apps/web UI                                  | `page.tsx`（ダッシュボード）                               | `GetExpiringStocksUseCase` への差し替え                                                                                                                                         | 変更             | 間接（DASH-REG・GES 経由）                      |

---

## 2. Domain 単体試験観点

配置: `packages/domain/tests/push-subscription/push-subscription.test.ts`（新規）。

| #                       | 観点                                 | 前提                                                                           | 操作                                                         | 期待結果                                                                                                                                                          | 分類                     |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| PS-01                   | 正常生成                             | 有効な `endpoint`/`p256dh`/`auth`                                              | `PushSubscription.create({ endpoint, p256dh, auth })`        | 例外なく生成され、`id`/`createdAt` が自動採番される。全 getter が入力値と一致                                                                                     | 正常                     |
| PS-02                   | `endpoint` 空文字を拒否              | —                                                                              | `create({ endpoint: '', p256dh: 'x', auth: 'y' })`           | `Error` を throw                                                                                                                                                  | 異常・境界               |
| PS-03                   | `p256dh` 空文字を拒否                | —                                                                              | `create({ endpoint: 'https://...', p256dh: '', auth: 'y' })` | `Error` を throw                                                                                                                                                  | 異常・境界               |
| PS-04                   | `auth` 空文字を拒否                  | —                                                                              | `create({ endpoint: 'https://...', p256dh: 'x', auth: '' })` | `Error` を throw                                                                                                                                                  | 異常・境界               |
| PS-05                   | `reconstruct()` は検証をバイパスする | `endpoint`/`p256dh`/`auth` が空文字の `props`（DB 由来を想定した不整合データ） | `PushSubscription.reconstruct(props)`                        | 例外を投げずに復元される（`.claude/rules/domain-layer.md`「DB からの復元は初期化ロジックを通さない」の確認。この不変条件は Unit A の `Stock.reconstruct` と同型） | 正常・不変条件（防御性） |
| PS-06                   | `reconstruct()` の往復一致           | 任意の `props`（`id`/`endpoint`/`p256dh`/`auth`/`createdAt`）                  | `reconstruct(props)` の全 getter                             | 入力 `props` の値と完全一致                                                                                                                                       | データ整合性             |
| PS-07                   | 生成のたびに異なる `id`              | 同一の入力 2 回                                                                | `create()` を 2 回呼ぶ                                       | 2 つのインスタンスの `id.value` が異なる（`generateId()` の非決定性）                                                                                             | 正常                     |
| PS-08（防御性・要確認） | `createdAt` getter の防御的コピー    | `reconstruct()` で復元した `PushSubscription`                                  | `const d = subscription.createdAt; d.setFullYear(1900);`     | 再取得した `subscription.createdAt` が変化しない（設計書 §将来課題に「実装時に確定」と明記された。§15 項目 4 参照。要確認のまま残す）                             | 防御性・要確認           |

`PushSender`（P-13 確定で Domain 層に配置）は interface のみのため、本節では独立した
テストケースを設けない。挙動の確認は §5-3（実装 `WebPushSender`）と §3-3（利用側
`SendExpiryAlertsUseCase`）で行う。

---

## 3. Application 単体試験観点

配置: `packages/application/tests/notification/`（新規ディレクトリ）+
`packages/application/tests/pantry/`（既存ディレクトリへ追記）。
`InMemoryPushSubscriptionRepository` と `InMemoryPushSender`（テスト用の `PushSender`
実装。`PushSender`/`PushPayload`/`PushSendResult`/`PushSubscriptionTarget` はいずれも
`@cookpit/domain` からの型。P-13 確定）を新設する。

### 3-1. `SubscribeToExpiryAlertUseCase`

配置: `packages/application/tests/notification/subscribe-to-expiry-alert.use-case.test.ts`（新規）。

**P-15 確定の追加観点（SUB-06〜08）**: 無認証の `subscribe` エンドポイントが VAPID
公開鍵の無認証配布と組み合わさると、攻撃者は自分のブラウザで購読を量産できてしまう
（`endpoint` の推測は不要）。この悪用を抑えるため、既存購読が 10 件以上かつ**新規**
`endpoint` の場合のみ `InvalidOperationError` を throw する。**既存 `endpoint` の
再登録（upsert 経路）はこの上限の対象外**（SUB-02 の冪等性・N-4 を壊さないことが
最重要の回帰観点）。

| #                                      | 観点                                                               | 前提                                                                          | 操作                                                              | 期待結果                                                                                                                                                                 | 分類                 |
| -------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| SUB-01                                 | 新規購読                                                           | `endpoint` が未登録                                                           | `execute({ endpoint, p256dh, auth })`                             | `repository.save()` が呼ばれ、新規 `PushSubscription` が保存される                                                                                                       | 正常（N-1）          |
| SUB-02（**最重要・N-4/P-8**）          | 既存 `endpoint` の再購読は upsert                                  | 同一 `endpoint` が既に登録済み                                                | 同じ `endpoint`・異なる `p256dh`/`auth` で `execute()`            | `save()` に渡される `PushSubscription` の `id` が既存行と同一（新規行を作らない）。`p256dh`/`auth` は新しい値                                                            | 正常・冪等性         |
| SUB-03                                 | 空文字入力は Domain の検証に委ねる（多層防御の確認）               | —                                                                             | `execute({ endpoint: '', p256dh: 'x', auth: 'y' })`               | `PushSubscription.create()` 由来の `Error` が UseCase を素通りして伝搬する（Zod 境界検証をバイパスして UseCase を直接呼んだ場合の防御線の確認）                          | 異常・防御性         |
| SUB-04                                 | 同一 `endpoint`・同一 `keys` の再送は完全に無害                    | 既存購読と同じ内容で再送                                                      | `execute()` を 2 回連続                                           | 2 回とも成功、`repository.findAll()` の件数が 1 のまま                                                                                                                   | 冪等性               |
| SUB-05                                 | `createdAt` は初回登録時のみ設定され、再購読で変わらない（要確認） | 既存購読あり                                                                  | 再購読 `execute()`                                                | `save()` に渡る `PushSubscription.createdAt` が初回登録時の値のまま（設計書 §将来課題に「実装時に確定」と明記された。§15 項目 2 参照。要確認のまま残す）                 | データ整合性・要確認 |
| SUB-06（**境界・P-15**）               | 上限直前（9 件）で新規購読は成功                                   | `repository.findAll()` が 9 件を返す                                          | 新規 `endpoint` で `execute()`                                    | 例外を投げず正常終了し `save()` が呼ばれる（10 件目として登録できる）                                                                                                    | 正常・境界           |
| SUB-07（**最重要・境界・P-15**）       | 上限到達（10 件）で新規購読は拒否                                  | `repository.findAll()` が 10 件を返す                                         | 新規（未登録）の `endpoint` で `execute()`                        | `InvalidOperationError` を throw、`save()` は呼ばれない                                                                                                                  | 異常・境界           |
| SUB-08（**最重要・回帰ガード・P-15**） | 上限到達（10 件）でも既存 `endpoint` の再登録は成功する            | `repository.findAll()` が 10 件を返し、対象 `endpoint` はその 10 件に含まれる | 既存の `endpoint` で異なる `p256dh`/`auth` を指定して `execute()` | 例外を投げず `save()` が呼ばれ、`p256dh`/`auth` が更新される（**上限チェックの対象外であることの固定。これを落とすと正規利用者が再購読できなくなる回帰を通してしまう**） | 正常・境界・回帰     |

### 3-2. `UnsubscribeFromExpiryAlertUseCase`

配置: `packages/application/tests/notification/unsubscribe-from-expiry-alert.use-case.test.ts`（新規）。

| #                  | 観点                         | 前提                       | 操作                              | 期待結果                                                     | 分類                 |
| ------------------ | ---------------------------- | -------------------------- | --------------------------------- | ------------------------------------------------------------ | -------------------- |
| UNSUB-01           | 正常解除                     | 対象 `endpoint` が登録済み | `execute({ endpoint })`           | `repository.deleteByEndpoint()` が呼ばれ、当該行が削除される | 正常（N-5）          |
| UNSUB-02（冪等性） | 存在しない `endpoint` の解除 | 対象 `endpoint` が未登録   | `execute({ endpoint: '不存在' })` | 例外を投げずに正常終了する                                   | 冪等性・異常系の防御 |

### 3-3. `SendExpiryAlertsUseCase`

配置: `packages/application/tests/notification/send-expiry-alerts.use-case.test.ts`（新規）。

| #                                | 観点                                                    | 前提                                                                                                      | 操作                                                                 | 期待結果                                                                                                                                                                                | 分類                      |
| -------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| SEA-01（B-3・N-7 対）            | 購読 0 件で早期終了                                     | `pushSubscriptionRepository.findAll()` が `[]`                                                            | `execute(asOf)`                                                      | `{ subscriptionCount: 0, sentCount: 0, removedCount: 0, expiringStockCount: 0 }`。`pushSender.send` は 1 度も呼ばれない                                                                 | 正常・境界（B-3）         |
| SEA-02（N-7）                    | 購読はあるが期限が近い在庫が 0 件                       | 購読 1 件以上、`GetExpiringStocksUseCase` の結果が空                                                      | `execute(asOf)`                                                      | `subscriptionCount` は購読数、他 3 フィールドは 0。`pushSender.send` は呼ばれない                                                                                                       | 正常（N-7）               |
| SEA-03                           | 全件成功                                                | 購読 2 件、両方とも `{ ok: true }` を返す                                                                 | `execute(asOf)`                                                      | `sentCount === 2`、`removedCount === 0`                                                                                                                                                 | 正常（N-2, N-8）          |
| SEA-04（**最重要・E-1**）        | 一部が失効（404/410 相当）                              | 購読 3 件、1 件が `{ ok: false, reason: 'invalid_subscription' }`                                         | `execute(asOf)`                                                      | `sentCount === 2`、`removedCount === 1`、`pushSubscriptionRepository.deleteByEndpoints()` が失効した 1 件の `endpoint` を含む配列で**ちょうど 1 回**呼ばれる                            | 異常（E-1）               |
| SEA-05（E-3）                    | 一部がネットワークエラー等（`reason: 'other'`）         | 購読 2 件、1 件が `{ ok: false, reason: 'other' }`                                                        | `execute(asOf)`                                                      | `sentCount === 1`、`removedCount === 0`（失効ではないため削除しない）                                                                                                                   | 異常（E-3）               |
| SEA-06（性能・N+1 回避の回帰）   | 失効購読が複数（3 件）                                  | 購読 5 件、うち 3 件が失効                                                                                | `execute(asOf)`                                                      | `deleteByEndpoints()` が**ちょうど 1 回**、3 件すべての `endpoint` を含む配列で呼ばれる（ループでの個別 `deleteByEndpoint()` 呼び出しが無いこと）                                       | 性能・回帰                |
| SEA-07（**最重要・P-10b・B-1**） | 数量 0 の在庫は通知だけから除外される                   | `GetExpiringStocksUseCase` の結果に `amount.value === 0` の在庫を含める（他に amount > 0 の在庫も含める） | `execute(asOf)`                                                      | `pushSender.send()` に渡るペイロードに数量 0 の在庫が含まれない。`expiringStockCount` も数量 0 の在庫を除いた件数になる                                                                 | 境界・データ整合性（B-1） |
| SEA-08（B-2）                    | 期限切れ在庫を含む                                      | `expiresAt` が過去日の在庫を含む                                                                          | `execute(asOf)`                                                      | 期限切れ在庫がペイロードに含まれる（除外されない）                                                                                                                                      | 正常・境界（B-2）         |
| SEA-09（部分失敗の防御・E-3）    | `pushSender.send()` が Promise を reject する購読が混在 | 購読 2 件、1 件が `send()` 内で例外を投げる（`Promise.allSettled` の `rejected` ケース）                  | `execute(asOf)`                                                      | `execute()` 全体は例外を投げず正常終了する。`sentCount` は成功した 1 件のみ、reject した購読は `removedCount` にも含まれない                                                            | 異常・防御性（E-3）       |
| SEA-10（P-7・P-14 反映）         | 通知本文の組み立て                                      | 期限が近い在庫 5 件（閾値内）                                                                             | `execute(asOf)`                                                      | `pushSender.send()` に渡る `payload.body` が、`formatExpiryUrgencyLabel`（`@cookpit/application`）を用いて組み立てられた先頭 3 件の文言 +「他 2 件」の形式。`payload.url === '/pantry'` | 正常（N-3, P-7）          |
| SEA-11（防御性）                 | `asOf` を UseCase 内部で変更していない                  | `Date` インスタンスを 1 つ渡す                                                                            | `execute(asOf)` 実行後に渡した `Date` インスタンスのプロパティを確認 | 呼び出し前後で `asOf` の時刻が変化しない（内部で mutate していない）                                                                                                                    | 防御性                    |

### 3-4. `GetExpiringStocksUseCase`

配置: `packages/application/tests/pantry/get-expiring-stocks.use-case.test.ts`（新規）。

| #                                  | 観点                                                                            | 前提                                                                    | 操作                             | 期待結果                                                                                                      | 分類                      |
| ---------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------- |
| GES-01                             | 既存 `selectExpiringStocks` の境界を UseCase 経由でも再現                       | `InMemoryPantryRepository` に閾値内外・期限切れ・null を含む在庫を seed | `execute(asOf, 3)`               | 既存の `selectExpiringStocks` テストと同じ結果（閾値ちょうどを含む・期限切れを含む・null を除外・昇順ソート） | 正常・境界（回帰）        |
| GES-02                             | `withinDays` 省略時は既定値 3                                                   | 同上                                                                    | `execute(asOf)`（第 2 引数省略） | `EXPIRY_URGENCY_WITHIN_DAYS`（3）を渡した場合と同じ結果                                                       | 正常                      |
| GES-03（**最重要・P-10b の対照**） | 数量 0 の在庫は**除外しない**（`SendExpiryAlertsUseCase` との非対称の直接固定） | 数量 0 の在庫が閾値内に存在                                             | `execute(asOf)`                  | 結果に数量 0 の在庫が**含まれる**（SEA-07 と対をなす。後から「バグでは」と誤診されないための回帰ガード）      | データ整合性・境界（B-1） |
| GES-04                             | 在庫 0 件                                                                       | `Pantry` の `stocks` が空                                               | `execute(asOf)`                  | `[]` を返す                                                                                                   | 正常・境界                |
| GES-05                             | `expiresAt` が null の在庫は除外                                                | null を含む在庫                                                         | `execute(asOf)`                  | 結果に含まれない                                                                                              | 正常・境界                |

### 3-5. `expiry.ts`（移設後。挙動不変の回帰。P-14 反映で対象を全 6 export に拡大）

配置: `packages/application/tests/pantry/expiry.test.ts`（新規。既存
`apps/web/tests/app/_utils/dashboard-view.node.test.ts` の該当 `describe` を移設する。
§0-2・§8・§15 参照）。

| #          | 観点                                                                                                                                    | 対応する既存テスト（移設元）                          | 分類                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------- |
| APX-01〜05 | `selectExpiringStocks`（昇順ソート・閾値ちょうど含む・閾値超え除外・当日と期限切れを含む・null 除外）                                   | 既存 `dashboard-view.node.test.ts` L29-77（5 ケース） | 正常・境界（回帰）   |
| APX-06〜13 | `getExpiryRemainingDays`（EU-01〜EU-08。当日 0・翌日 1・前日 -1・大幅過去・月またぎ・年またぎ・時刻非依存・不正文字列で例外を投げない） | 既存 L93-126（8 ケース）                              | 正常・境界（回帰）   |
| APX-14     | `EXPIRY_URGENCY_WITHIN_DAYS === 3`                                                                                                      | 既存 L130-132                                         | データ整合性（回帰） |
| APX-15〜18 | `getExpiryUrgency`（1→2 の境界・-1→0 の境界・上限境界 3 日・範囲外 4 日以上でも例外なし）                                               | 既存 L136-153（4 ケース）                             | 正常・境界（回帰）   |
| APX-19〜24 | `formatExpiryUrgencyLabel`（EU-13〜EU-18。期限切れ・本日まで・明日まで・あと N 日・`getExpiryUrgency` との連動確認）                    | 既存 L156-195（6 ケース）                             | 正常・境界（回帰）   |

**移設時の注意（§15 も参照）**: これらのテストケース名・アサーション自体は変更不要（挙動不変の
移設）。`import` 元だけが apps/web 相対パスから `@cookpit/application`（バレル経由）に変わる。

---

## 4. api-contract 契約試験観点

配置: `packages/api-contract/tests/push-subscription.schema.test.ts`（新規）。契約設計書
§10.1 の観点表に ID を付与し、追加ケースを補う。

### 4-1. 基本観点（Z-PUSH-01〜14）

| #                                    | 観点                                                             | テスト値                                                                         | 期待結果               | 分類               |
| ------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------- | ------------------ |
| Z-PUSH-01                            | `subscribeToExpiryAlertSchema` の正常系                          | 契約設計書 §9.2 の成功例                                                         | 成功                   | 正常               |
| Z-PUSH-02                            | `endpoint` が `http://`（https でない）を reject                 | `'http://example.com/x'`                                                         | 失敗                   | 異常・境界         |
| Z-PUSH-03                            | `endpoint` が URL 形式でない文字列を reject                      | `'not-a-url'`                                                                    | 失敗                   | 異常               |
| Z-PUSH-04                            | `endpoint` が 2048 文字超を reject                               | 2049 文字の `https://...`                                                        | 失敗                   | 異常・境界         |
| Z-PUSH-05                            | `endpoint` が 2048 文字ちょうどを受理（境界）                    | 2048 文字の `https://...`                                                        | 成功                   | 正常・境界         |
| Z-PUSH-06                            | `p256dh`/`auth` が base64url 以外の文字を reject                 | `p256dh: 'abc+def/=='`                                                           | 失敗                   | 異常               |
| Z-PUSH-07                            | `p256dh`/`auth` の空文字を reject                                | `p256dh: ''`                                                                     | 失敗                   | 異常・境界         |
| Z-PUSH-08（**P-17 で上限値を更新**） | `p256dh` が上限（88 文字）超を reject                            | 89 文字の base64url 文字列                                                       | 失敗                   | 異常・境界         |
| Z-PUSH-09（**P-17 で上限値を更新**） | `auth` が上限（24 文字）超を reject                              | 25 文字の base64url 文字列                                                       | 失敗                   | 異常・境界         |
| Z-PUSH-10                            | `unsubscribeFromExpiryAlertSchema` は `endpoint` 単体を受理      | `{ endpoint: 'https://fcm.googleapis.com/fcm/send/x' }`                          | 成功                   | 正常               |
| Z-PUSH-11                            | `subscribe`/`unsubscribe` が `endpoint` バリデーションを共有する | 同じ不正 `endpoint` を両スキーマに通す                                           | 両方失敗（DRY の確認） | 異常・データ整合性 |
| Z-PUSH-12                            | `vapidPublicKeyResponseSchema` が文字列を受理                    | `{ publicKey: 'BEl62...' }`                                                      | 成功                   | 正常               |
| Z-PUSH-13                            | `expiryAlertsCronResultSchema` が非負整数のみ受理                | `subscriptionCount: -1` / `sentCount: 1.5`（`it.each`）                          | 失敗                   | 異常・境界         |
| Z-PUSH-14                            | `expiryAlertsCronResultSchema` の全 0 を受理（早期終了ケース）   | `{ subscriptionCount: 0, sentCount: 0, removedCount: 0, expiringStockCount: 0 }` | 成功                   | 正常・境界         |

### 4-2. `endpoint` のホスト検証（P-16 確定・新規追加）

`pushEndpointSchema` に `new URL(value).hostname` を用いた検証が追加される。**単純な
文字列一致（`startsWith`/`includes`）で実装するとバイパスされる 2 パターン
（Z-PUSH-17）が本命の回帰ガード**である。Z-PUSH-18 は「reject されないことを固定する」
観点であり、意味が逆である点に注意する（§15 項目 9）。

| #                                           | 観点                                                                                                                                                                | テスト値                                                                            | 期待結果                                                                                                                                                                                                                                                                                                                 | 分類                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Z-PUSH-15                                   | IPv4/IPv6 リテラルホストを reject                                                                                                                                   | `it.each`: `https://127.0.0.1/x` / `https://[::1]/x` / `https://192.168.1.1/x`      | いずれも失敗                                                                                                                                                                                                                                                                                                             | 異常・境界                                         |
| Z-PUSH-16                                   | `localhost`/`.local`/`.internal` サフィックスのホストを reject                                                                                                      | `it.each`: `https://localhost/x` / `https://foo.local/x` / `https://foo.internal/x` | いずれも失敗                                                                                                                                                                                                                                                                                                             | 異常・境界                                         |
| Z-PUSH-17（**最重要・実装ミス検出の本命**） | userinfo 部を含む URL を reject（文字列一致実装だと `fcm.googleapis.com` を含むため誤って通ってしまう）                                                             | `https://evil.example@fcm.googleapis.com/x`                                         | 失敗（`new URL().hostname` は `evil.example` ではなく実際には `fcm.googleapis.com` になる点に注意。**この URL は `hostname` としては正規ホストと同一になるため、`hostname` 検証だけでは reject できない可能性がある。実装計画で `username`/`password` 部の扱いを明示的に禁止する設計になっているか確認する必要がある**） | 異常・**要確認（実装計画への申し送り。§15 参照）** |
| Z-PUSH-18（**accept が正**）                | サフィックス偽装ホスト（`fcm.googleapis.com.evil.example`）は **accept される**（P-16 のブロックリスト方式では未知の外部ホストと区別できないため。§15 項目 9 参照） | `https://fcm.googleapis.com.evil.example/x`                                         | 成功。**reject を期待しないこと** — 期待すると P-16（許可リストを採らない）と矛盾する                                                                                                                                                                                                                                    | 正常（残存ギャップの固定）                         |
| Z-PUSH-19                                   | 正規ホストを accept                                                                                                                                                 | `https://fcm.googleapis.com/fcm/send/xxx`                                           | 成功                                                                                                                                                                                                                                                                                                                     | 正常                                               |
| Z-PUSH-20（境界）                           | 大文字スキーム（`HTTPS://`）を accept                                                                                                                               | `HTTPS://fcm.googleapis.com/fcm/send/xxx`                                           | 成功（スキームは大小文字非依存。前方一致で実装すると誤って reject するため境界として明示する）                                                                                                                                                                                                                           | 正常・境界                                         |

### 4-3. `p256dh`/`auth` の長さ境界（P-17 確定・新規追加）

**理由（テスト観点として重要）**: 下限を `min(1)` のまま緩く保つと、長さが不正な鍵を
含む購読が登録され、`WebPushSender.send()`（`web-push` の `sendNotification`）が
**送信前に**例外を投げて `{ ok: false, reason: 'other' }` になる（INF-WPS-06 参照）。
`reason: 'other'` は失効判定にならないため `SendExpiryAlertsUseCase` が購読を削除せず
（SEA-05 参照）、**同じ壊れた購読が毎日送信を試みては失敗し続ける**。契約層（Zod）の
下限チェックがこの恒久的な失敗行の発生を未然に防ぐ。

| #         | 観点                                     | テスト値                   | 期待結果 | 分類       |
| --------- | ---------------------------------------- | -------------------------- | -------- | ---------- |
| Z-PUSH-21 | `p256dh` が下限（86 文字）未満を reject  | 85 文字の base64url 文字列 | 失敗     | 異常・境界 |
| Z-PUSH-22 | `p256dh` が下限ちょうど（86 文字）を受理 | 86 文字の base64url 文字列 | 成功     | 正常・境界 |
| Z-PUSH-23 | `p256dh` が上限ちょうど（88 文字）を受理 | 88 文字の base64url 文字列 | 成功     | 正常・境界 |
| Z-PUSH-24 | `auth` が下限（22 文字）未満を reject    | 21 文字の base64url 文字列 | 失敗     | 異常・境界 |
| Z-PUSH-25 | `auth` が下限ちょうど（22 文字）を受理   | 22 文字の base64url 文字列 | 成功     | 正常・境界 |
| Z-PUSH-26 | `auth` が上限ちょうど（24 文字）を受理   | 24 文字の base64url 文字列 | 成功     | 正常・境界 |

**型往復確認（コンパイル時。`pnpm type-check` で確認。ランタイムテスト不要）**:
`SubscribeToExpiryAlertBody` が `SubscribeToExpiryAlertInputDto` の `endpoint`/`p256dh`/
`auth` と構造的に一致すること（契約設計書 §10.4）。

---

## 5. Infrastructure（PGlite）結合試験観点

配置: `packages/infrastructure/tests/repositories/drizzle-push-subscription.repository.test.ts`
（新規）+ `packages/infrastructure/tests/notification/web-push-sender.test.ts`（新規）。

### 5-1. 前提: PGlite テスト DDL への追記（罠 6・最重要の前提条件）

`packages/infrastructure/tests/testing/create-test-db.ts`（実測・全 123 行）の `stocks`
テーブル定義は **L100-113**（`CREATE TABLE` が L100-111、`CREATE INDEX` が L113）、
テンプレートリテラルの閉じバッククォートは **L114**。`push_subscriptions` の
`CREATE TABLE`（契約設計書 §2 のとおり）は**この L113 と L114 の間**に追記する必要がある。
これを忘れると本節のテストが**全滅**する（設計書 罠 6・契約設計書 §10.3 が繰り返し警告する
最重要の前提）。

### 5-2. `DrizzlePushSubscriptionRepository`

| #                                     | 観点                                    | 前提                                                                      | 操作                                                                                          | 期待結果                                                                                                                                          | 分類               |
| ------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| INF-PUSH-01                           | 新規 `save()`                           | 空テーブル                                                                | `save(新規 PushSubscription)` → 新しいインスタンスで `findAll()`                              | 1 件返る。全フィールドが一致                                                                                                                      | 正常               |
| INF-PUSH-02（**最重要・罠再発防止**） | 同一 `endpoint` の再 `save()` は upsert | 既存の購読が 1 件保存済み                                                 | 同じ `endpoint`・異なる `p256dh`/`auth` で `save()` → 新しいインスタンスで `findByEndpoint()` | 行数は増えない（`findAll()` が 1 件のまま）。`p256dh`/`auth` が新しい値に更新される（Unit A の `set` 句欠落と同種の罠を PGlite で固定するテスト） | 正常・**必須**     |
| INF-PUSH-03                           | `findByEndpoint()` の未存在ケース       | 空テーブルまたは対象外の `endpoint` のみ存在                              | `findByEndpoint('不存在')`                                                                    | `null` を返す                                                                                                                                     | 正常・境界         |
| INF-PUSH-04                           | `deleteByEndpoint()` の冪等性           | 対象 `endpoint` が未登録                                                  | `deleteByEndpoint('不存在')`                                                                  | 例外を投げず正常終了する                                                                                                                          | 冪等性             |
| INF-PUSH-05                           | `deleteByEndpoint()` の正常削除         | 2 件保存済み                                                              | 1 件を `deleteByEndpoint()` → `findAll()`                                                     | 削除対象以外の 1 件のみ残る                                                                                                                       | 正常               |
| INF-PUSH-06（性能）                   | `deleteByEndpoints()` の一括削除        | 5 件保存済み                                                              | 3 件分の `endpoint` を配列で渡して `deleteByEndpoints()` → `findAll()`                        | 残り 2 件のみ（1 回の `DELETE ... WHERE endpoint IN (...)` で完了する設計の確認。SQL 発行回数まではアサーションしないが結果整合性で間接確認）     | 正常・性能         |
| INF-PUSH-07                           | `deleteByEndpoints([])` は no-op        | 2 件保存済み                                                              | 空配列で `deleteByEndpoints([])`                                                              | `findAll()` が 2 件のまま（実装コード例のガード `if (endpoints.length === 0) return;` の確認）                                                    | 境界               |
| INF-PUSH-08                           | `UNIQUE` 制約の直接検証                 | `endpoint` が重複する行を Drizzle の upsert ヘルパーを介さず直接 `INSERT` | 2 回目の `INSERT`                                                                             | PGlite が制約違反エラーを返す（DB レベルでの一意性保証の確認。upsert ロジックのバグに依存しない独立した検証）                                     | 異常・データ整合性 |

### 5-3. `WebPushSender`（`web-push` パッケージをモック。P-13 確定: `PushSender`（`@cookpit/domain`）を実装する）

| #                                      | 観点                                                                                                          | 前提                                                          | 操作                          | 期待結果                                                                                                                                                  | 分類        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| INF-WPS-01                             | 正常送信                                                                                                      | `webpush.sendNotification` が resolve                         | `send(subscription, payload)` | `{ ok: true }` を返す。`sendNotification` が `endpoint`/`keys.p256dh`/`keys.auth` を含む形で呼ばれる                                                      | 正常        |
| INF-WPS-02                             | `timeout: 10_000` オプションの付与（§エラー処理 (b)・回帰ガード）                                             | —                                                             | `send()` を呼ぶ               | `sendNotification` の第 3 引数に `{ timeout: 10_000 }` が含まれる                                                                                         | 正常・性能  |
| INF-WPS-03（E-1）                      | `statusCode: 404` を失効として写像                                                                            | `sendNotification` が `statusCode: 404` を含むエラーで reject | `send()`                      | `{ ok: false, reason: 'invalid_subscription' }`                                                                                                           | 異常（E-1） |
| INF-WPS-04（E-1）                      | `statusCode: 410` を失効として写像                                                                            | 同上（410）                                                   | `send()`                      | `{ ok: false, reason: 'invalid_subscription' }`                                                                                                           | 異常（E-1） |
| INF-WPS-05（E-3）                      | それ以外の `statusCode`（例: 500）は `'other'`                                                                | `statusCode: 500` で reject                                   | `send()`                      | `{ ok: false, reason: 'other' }`                                                                                                                          | 異常（E-3） |
| INF-WPS-06（E-3・**P-17 の防御対象**） | `statusCode` を持たない例外（タイムアウト・ネットワークエラー・不正な鍵長による送信前例外を含む）も `'other'` | `statusCode` プロパティの無いエラーで reject                  | `send()`                      | `{ ok: false, reason: 'other' }`（例外を再 throw しない）。**Z-PUSH-21/24 の契約層検証がこの経路への到達自体を未然に防ぐ設計であることを§4-3 で説明済み** | 異常（E-3） |

---

## 6. Presentation — Hono ルート結合試験観点

配置: `apps/web/tests/server/routes/push.test.ts`（新規）+
`apps/web/tests/server/routes/cron.test.ts`（新規）。既存 `pantry.test.ts` の
`vi.mock('@/db/client', ...)` + `vi.mock('@cookpit/application', ...)` パターンを踏襲する
（実測・§0-2 で確認済み）。

### 6-1. `pushRoute`

| #                                                        | 観点                                                  | 前提                                                                         | 操作                                                                                                  | 期待結果                                                                                          | 分類                          |
| -------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------- |
| WH-PUSH-01                                               | 200: `VAPID_PUBLIC_KEY` 設定済み                      | 環境変数モックで値を設定                                                     | `GET /api/push/vapid-public-key`                                                                      | `200`、`{ publicKey: '<値>' }`                                                                    | 正常                          |
| WH-PUSH-02（**最重要・P-12**）                           | 500: `VAPID_PUBLIC_KEY` が `undefined`                | 環境変数を未設定にモック                                                     | 同上                                                                                                  | `500`、`{ error: 'Server misconfigured' }`                                                        | 異常（E-7・フェイルクローズ） |
| WH-PUSH-03（**最重要・P-12。E-7 の別ケースとして扱う**） | 500: `VAPID_PUBLIC_KEY` が空文字                      | 環境変数を `''` にモック                                                     | 同上                                                                                                  | `500`、`{ error: 'Server misconfigured' }`（`undefined` のケースと**別テストとして**実施する）    | 異常（E-7）                   |
| WH-PUSH-04                                               | 204: 正常購読                                         | `SubscribeToExpiryAlertUseCase.execute` が resolve                           | `POST /api/push/subscribe` に §9.2 の成功例                                                           | `204`（ボディなし）。`execute` が `{ endpoint, p256dh, auth }`（`keys` を平坦化した形）で呼ばれる | 正常（N-1）                   |
| WH-PUSH-05                                               | 400 × 4: Zod バリデーション                           | —                                                                            | `endpoint` が https でない / URL 形式でない / `keys` 欠落 / `p256dh` が base64url 外（`it.each`）     | いずれも `400`、`execute` は呼ばれない                                                            | 異常・境界（E-6）             |
| WH-PUSH-06                                               | 204: 正常解除（存在する `endpoint`）                  | `UnsubscribeFromExpiryAlertUseCase.execute` が resolve                       | `POST /api/push/unsubscribe`                                                                          | `204`                                                                                             | 正常（N-5）                   |
| WH-PUSH-07（冪等性）                                     | 204: 存在しない `endpoint` の解除も 204               | `execute` が例外を投げない                                                   | 同上（未登録の `endpoint`）                                                                           | `204`（UseCase 側の冪等性が Hono 層でも透過する確認）                                             | 冪等性                        |
| WH-PUSH-08                                               | 400: `unsubscribe` の不正な `endpoint`                | —                                                                            | `POST /unsubscribe` に `{ endpoint: 'not-a-url' }`                                                    | `400`、`execute` は呼ばれない                                                                     | 異常（E-6）                   |
| WH-PUSH-09（**最重要・P-15**）                           | 422: 購読件数上限超過                                 | `SubscribeToExpiryAlertUseCase.execute` が `InvalidOperationError` を reject | 新規 `endpoint` で `POST /api/push/subscribe`                                                         | `422`、`{ error: '<message>' }`                                                                   | 異常・境界（P-15）            |
| WH-PUSH-10（**最重要・回帰ガード・P-15**）               | 204: 上限到達時でも既存 `endpoint` の再登録は成功する | `execute` が正常 resolve（上限の対象外のケースをモックで表現）               | 既存の `endpoint` で `POST /api/push/subscribe`                                                       | `204`（422 にならない）                                                                           | 正常・境界・回帰（P-15）      |
| WH-PUSH-11（回帰）                                       | 既存 7 ルートの回帰                                   | —                                                                            | 既存 `health`/`recipes`/`products`/`stores`/`meal-plans`/`shopping-lists`/`pantry` の既存テストを実行 | 全件 pass（`.route('/push', pushRoute)` 追加が既存ルートに影響しない）                            | 回帰                          |

### 6-2. `cronRoute`

| #                                                     | 観点                                                                         | 前提                                                                                                     | 操作                                                                  | 期待結果                                                                                                                                                                     | 分類                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| WH-CRON-01                                            | 200: 正常実行                                                                | `CRON_SECRET` 設定済み、正しい `Authorization` ヘッダー、`SendExpiryAlertsUseCase.execute` が resolve    | `GET /api/cron/expiry-alerts` with `Authorization: Bearer <正しい値>` | `200`、レスポンスボディが `ExpiryAlertsCronResult` の 4 フィールドと一致                                                                                                     | 正常（N-2）                       |
| WH-CRON-02                                            | 401: ヘッダー欠落                                                            | `CRON_SECRET` 設定済み                                                                                   | `Authorization` ヘッダーなしでリクエスト                              | `401`、`{ error: 'Unauthorized' }`                                                                                                                                           | 異常（E-2）                       |
| WH-CRON-03                                            | 401: ヘッダー不一致                                                          | `CRON_SECRET` 設定済み                                                                                   | 誤った値の `Authorization: Bearer <誤り>`                             | `401`、`{ error: 'Unauthorized' }`                                                                                                                                           | 異常（E-2）                       |
| WH-CRON-04（**最重要・P-12/契約 §5-3**）              | 500: `CRON_SECRET` が `undefined`（ヘッダー欠落）                            | `CRON_SECRET` 未設定にモック                                                                             | `Authorization` ヘッダーなしでリクエスト                              | `500`、`{ error: 'Server misconfigured' }`（**401 ではない**）                                                                                                               | 異常（E-2・フェイルクローズ）     |
| WH-CRON-05（**最重要・契約 §5-3 項目 6 の直接検証**） | 500: `CRON_SECRET` が `undefined` かつ**正しい形式**のヘッダーを送っても 500 | `CRON_SECRET` 未設定にモック                                                                             | `Authorization: Bearer undefined`（あるいは任意の値）付きでリクエスト | `500`、`{ error: 'Server misconfigured' }`（**未設定チェックが Bearer 比較より先に評価されるため 401 にならないことの固定**）                                                | 異常・境界（要件書 E-2 の詳細化） |
| WH-CRON-06（P-12・E-2 の別ケース）                    | 500: `CRON_SECRET` が空文字                                                  | `CRON_SECRET` を `''` にモック                                                                           | 任意のヘッダーでリクエスト                                            | `500`、`{ error: 'Server misconfigured' }`（`undefined` のケースと別テストとして実施）                                                                                       | 異常（E-2）                       |
| WH-CRON-07（**最重要・契約 §5-3・§12 項目 5**）       | 500: UseCase 内の予期しない例外（設定不備とはボディ形が異なる）              | `CRON_SECRET` 設定済み、正しいヘッダー、`SendExpiryAlertsUseCase.execute` が予期しない `Error` を reject | `GET /api/cron/expiry-alerts`                                         | `500`、`{ error: 'Internal Server Error' }`（`app.onError` 経由。WH-CRON-04/06 の `{ error: 'Server misconfigured' }` と**ボディ形が異なることを明示的にアサーションする**） | 異常（E-3 の極限ケース・回帰）    |
| WH-CRON-08（回帰）                                    | 既存 7 ルート + `pushRoute` の回帰                                           | —                                                                                                        | 既存テスト一式を実行                                                  | 全件 pass（`.route('/cron', cronRoute)` 追加が既存ルートに影響しない）                                                                                                       | 回帰                              |

---

## 7. Presentation — コンポーネント試験観点（RTL）

### 7-1. `expiry-alert-subscription.tsx`（新設。配置:

`apps/web/tests/app/_components/expiry-alert-subscription.test.tsx`）

`Notification`/`navigator.serviceWorker`/`PushManager` をグローバルモックする。設計書
「テスト方針」L927-929 の 3 パターン（許可承認・拒否・非対応ブラウザ）を基礎に拡張する。

| #                               | 観点                                                                   | 前提                                                                                       | 操作                                                                                                                                                                                                                       | 期待結果                                                                                                                                                                              | 分類                            |
| ------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| EAS-01                          | `PushManager` 非対応ブラウザ                                           | `window.PushManager` が `undefined`                                                        | render                                                                                                                                                                                                                     | ON ボタンが無効化される、または非対応の案内文言が表示される（E-4。実装計画でどちらか確定）                                                                                            | 異常（E-4）                     |
| EAS-02                          | ON 押下 → 許可承認 → 購読成功                                          | `Notification.requestPermission()` が `'granted'` を解決、`pushManager.subscribe()` が成功 | ON ボタンをクリック                                                                                                                                                                                                        | `POST /api/push/subscribe` が `{ endpoint, keys: { p256dh, auth } }` で呼ばれる                                                                                                       | 正常（N-1）                     |
| EAS-03（E-5）                   | ON 押下 → 許可拒否                                                     | `requestPermission()` が `'denied'` を解決                                                 | ON ボタンをクリック                                                                                                                                                                                                        | エラーメッセージが表示され、`pushManager.subscribe()`・`POST /subscribe` のいずれも呼ばれない                                                                                         | 異常（E-5）                     |
| EAS-04                          | ユーザージェスチャ起点であることの確認（iOS 制約対応の構造確認・罠 3） | —                                                                                          | ボタンの `onClick` ハンドラ内で直接 `Notification.requestPermission()` を呼んでいるか（`useEffect` 等の非同期経路を経由していないか）をコードレベルで確認する観点。RTL の `fireEvent.click` から同期的に呼ばれることを確認 | `requestPermission()` がクリックイベントのコールスタック内で呼ばれる                                                                                                                  | 正常・防御性（罠 3 の構造確認） |
| EAS-05                          | OFF 押下 → 購読解除                                                    | 既存の購読が `pushManager.getSubscription()` で取得できる状態                              | OFF ボタンをクリック                                                                                                                                                                                                       | `subscription.unsubscribe()` が呼ばれ、その後 `POST /api/push/unsubscribe` が呼ばれる                                                                                                 | 正常（N-5）                     |
| EAS-06                          | サーバー側 500（`VAPID_PUBLIC_KEY` 未設定）時の UI                     | `GET /api/push/vapid-public-key` が 500 を返す                                             | render 後の初期化処理                                                                                                                                                                                                      | エラーメッセージが表示され ON ボタンが無効化される（購読ボタンが無反応のまま原因不明になることを防ぐ。P-12 の意図の UI 側での受け止め）                                               | 異常（P-12 の UI 側帰結）       |
| EAS-07（**P-15 の UI 側帰結**） | サーバー側 422（購読件数上限超過）時の UI                              | `POST /subscribe` が 422 を返す                                                            | ON ボタンをクリック                                                                                                                                                                                                        | 上限超過を示すエラーメッセージが表示される（「一般的な通信エラー」ではなく識別可能な文言であることが望ましい。実装計画で文言を確定する）                                              | 異常・境界（P-15）              |
| EAS-08                          | 通信エラー                                                             | `POST /subscribe` が例外を投げる（fetch reject）                                           | ON ボタンをクリック                                                                                                                                                                                                        | `NETWORK_ERROR_MESSAGE`（`use-api-action.ts` 実測: L9 の定数）相当のメッセージが表示される                                                                                            | 異常（E-3 相当）                |
| EAS-09                          | ローディング状態                                                       | 購読処理中                                                                                 | ボタンをクリックした直後                                                                                                                                                                                                   | ボタンが `disabled` になる（`useApiAction` の `isPending`/`pending` パターンを踏襲）                                                                                                  | フロントエンド固有              |
| EAS-10（要確認・§15）           | 初期表示時の購読状態判定方法                                           | 既に購読済みのブラウザで再訪問                                                             | render                                                                                                                                                                                                                     | ON/OFF どちらの表示になるか（`pushManager.getSubscription()` を mount 時に呼ぶ設計になっているかは設計書 §将来課題に「実装時に確定」と明記された。§15 項目 3 参照。要確認のまま残す） | 要確認                          |

### 7-2. `dashboard.tsx`（既存ファイル。import 元差し替えの回帰。P-14 反映で分裂解消）

配置: 既存 `apps/web/tests/app/_components/dashboard.test.tsx`（追記・確認）。

| #           | 観点                                 | 前提                                                                                                                                                                                                                                        | 操作                        | 期待結果                                                                 | 分類        |
| ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------ | ----------- |
| DASH-REG-01 | 緊急度チップ・ラベルの表示が挙動不変 | `getExpiryRemainingDays`/`getExpiryUrgency`/`formatExpiryUrgencyLabel` の**3 関数すべて** `@cookpit/application` から import する形に差し替えた後の既存テスト一式を実行（`expiryUrgencyChipClass` は `@/app/_utils/category-color` のまま） | `pnpm test`（apps/web dom） | 既存の全アサーションが変更前と同じ結果で pass する                       | 回帰        |
| DASH-REG-02 | 購読 ON/OFF セクションの追加位置     | 「賞味期限が近い在庫」セクション（実測 L108-165）配下                                                                                                                                                                                       | render                      | `expiry-alert-subscription` が当該セクション内に描画される（P-3 の確認） | 正常（P-3） |

### 7-3. `stock-row.tsx`（既存ファイル。import 元差し替えの回帰。P-14 反映で分裂解消）

配置: 既存 `apps/web/tests/app/pantry/_components/stock-row.test.tsx`（確認）。

| #         | 観点                                                                                               | 前提                | 操作                             | 期待結果                                                                | 分類 |
| --------- | -------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------- | ----------------------------------------------------------------------- | ---- |
| SR-REG-01 | 緊急度チップの閾値内外出し分けが挙動不変                                                           | import 元差し替え後 | 既存の閾値内外テストケースを実行 | 全件 pass（Unit A の `SR-EDIT-03/04` 相当の既存観点が壊れていないこと） | 回帰 |
| SR-REG-02 | `formatExpiryUrgencyLabel` を含む 3 関数すべてが同じ `@cookpit/application` の import 元で動作する | 同上                | render                           | ラベル文言（「期限切れ」「本日まで」等）が変更前と一致                  | 回帰 |

### 7-4. `sw.ts`（自動化困難。参考記載）

| #                         | 観点                                                                                                                    | 自動化可否                         | 代替手段                                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| SW-01                     | `push` イベントで正しいタイトル・本文の通知が表示される                                                                 | 困難（§0-2 参照）                  | §10 手動確認（MB-08/MB-09）                                                                                                       |
| SW-02                     | `push` イベントで `data` が無い場合は何もしない                                                                         | 困難                               | 手動確認で代替不可（意図的に空データを送るのが難しいため実装レビューで代替）                                                      |
| SW-03                     | `notificationclick` で `/pantry` へ遷移する                                                                             | 困難                               | §10 手動確認（MB-10）                                                                                                             |
| SW-04                     | `notificationclick` で `data.url` が無い場合は `/` へ遷移する                                                           | 困難                               | 実装レビューで代替（自動生成される通知には常に `url` が付くため、この分岐は到達しにくい防御的コードであり手動確認の優先度も低い） |
| SW-05（**最重要・罠 2**） | 既存 `runtimeCaching` 4 件（Google Fonts / 買い物リスト詳細 GET / 店舗一覧 GET / `/shopping-lists*` GET）が壊れていない | 元々自動テストが存在しない（§0-2） | `docs/tests/saturday-flow.md:83-86` の O-01 手順を**本ユニットのリリース前に再実施**する（§10 に組み込む）                        |

---

## 8. 回帰試験範囲

| #                                | 対象                                                                                                                             | 確認方法                                                                                                                                                                                                                                                                                                                                                        | 根拠                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| REG-01                           | 既存 7 ルート（health/recipes/products/stores/meal-plans/shopping-lists/pantry）                                                 | `pnpm test`（apps/web）全件 pass                                                                                                                                                                                                                                                                                                                                | WH-PUSH-11・WH-CRON-08                                                                                                |
| REG-02                           | 既存 Domain（Pantry 集約・Stock 集約。Unit A で追加された `updateDetails`/`updateStockDetails` を含む）                          | `pnpm test`（packages/domain）全件 pass                                                                                                                                                                                                                                                                                                                         | `PushSubscription`/`PushSender` 追加が既存集約に影響しないこと                                                        |
| REG-03                           | 既存 Application（`AddStockUseCase`/`ConsumeStockUseCase`/`DiscardStockUseCase`/`GetPantryUseCase`/`UpdateStockDetailsUseCase`） | `pnpm test`（packages/application）全件 pass                                                                                                                                                                                                                                                                                                                    | 新規 UseCase・`expiry.ts` 移設（P-14）・購読上限（P-15）が既存 UseCase に影響しないこと                               |
| REG-04                           | 既存 api-contract（`pantry.schema.ts` 等）                                                                                       | `pnpm test`（packages/api-contract）全件 pass                                                                                                                                                                                                                                                                                                                   | 新規スキーマファイル追加のみで既存 7 ファイルは無変更（契約設計書 §8）                                                |
| REG-05                           | 既存 Infrastructure（`DrizzlePantryRepository` 他 8 テーブルの既存 Repository）                                                  | `pnpm test`（packages/infrastructure）全件 pass                                                                                                                                                                                                                                                                                                                 | `create-test-db.ts` への DDL 追記が既存 DDL（`stocks` 含む）を壊していないこと                                        |
| REG-06（**最重要**）             | **`apps/web/tests/app/_utils/dashboard-view.node.test.ts` の再構成**（§0-2・§3-5）                                               | 移設後、`MEAL_PLAN_STATUS_LABELS`（実測 L80-88）**のみ**を含む状態で全件 pass する。移設対象（`selectExpiringStocks`/`getExpiryRemainingDays`/`getExpiryUrgency`/`EXPIRY_URGENCY_WITHIN_DAYS`/`formatExpiryUrgencyLabel`）のテストは `packages/application/tests/pantry/expiry.test.ts`（APX-01〜24）で全件 pass する。ファイル名・配置は変更不要（§15 項目 1） | P-4/P-14 の移設が既存テスト資産を失わせないこと                                                                       |
| REG-07（**最重要**）             | `sw.ts` の既存 `runtimeCaching` 4 件（オフライン再訪問 O-01）                                                                    | `docs/tests/saturday-flow.md:83-86` の手動確認手順を、本ユニットの `push`/`notificationclick` 追加後に**再実施**                                                                                                                                                                                                                                                | 自動テストが存在しないため（§0-2）、手動確認のみが回帰検知手段。§10 MB-14 に組み込む                                  |
| REG-08                           | ダッシュボード表示（`page.tsx`/`dashboard.tsx`）                                                                                 | `GetExpiringStocksUseCase` への差し替え後、既存 `dashboard.test.tsx` 全件 pass                                                                                                                                                                                                                                                                                  | P-4「既存 UI も差し替える」の挙動不変確認                                                                             |
| REG-09                           | `/pantry` 表示（`stock-row.tsx`）                                                                                                | import 元差し替え後、既存 `stock-row.test.tsx` 全件 pass                                                                                                                                                                                                                                                                                                        | 同上                                                                                                                  |
| REG-10                           | 型・Lint                                                                                                                         | `pnpm type-check` / `pnpm lint`                                                                                                                                                                                                                                                                                                                                 | `AppType` 拡張・`api-contract` の `export *` 追加、`PushSender` の配置変更（P-13）に影響がないこと                    |
| REG-11（**最重要・新規・P-15**） | 購読上限（P-15）が正規利用者の再購読を妨げないこと                                                                               | `pnpm test`（packages/application・apps/web）                                                                                                                                                                                                                                                                                                                   | SUB-08・WH-PUSH-10 が pass すること。上限チェックの実装ミスにより既存 `endpoint` の再登録まで拒否してしまう回帰を防ぐ |

---

## 9. 特性観点

- **権限**: 対象外（ADR-0003/ADR-0004。`subscribe`/`unsubscribe`/Cron 以外は認証を持たない。
  Cron の Bearer 保護は WH-CRON-01〜07 で扱う）。
- **セキュリティ（P-15/P-16。無認証エンドポイントの悪用防止・本ユニットで新設）**:
  SUB-06〜08（購読件数上限）、WH-PUSH-09〜10（422 写像・上限対象外の回帰）、
  Z-PUSH-15〜20（`endpoint` ホスト検証。特に Z-PUSH-17 は文字列一致実装のバイパスを
  検出する本命の観点）。攻撃シナリオ（VAPID 公開鍵の無認証配布 + `endpoint` 推測不要）は
  設計書 §確定事項 P-15/P-16 を正とする。
- **データ整合性**: SEA-07 と GES-03（数量 0 除外の非対称を両方から固定）、PS-06（`reconstruct`
  往復一致）、INF-PUSH-02（upsert の鍵更新）。
- **冪等性**: `subscribe` は HTTP ステータスは常に冪等だがサーバー状態（鍵）は非冪等
  （契約設計書 §7.1。SUB-02・WH-PUSH-04 で確認）。**上限到達時の既存 `endpoint` 再登録
  （SUB-08・WH-PUSH-10）もこの冪等性の一部として扱う（上限チェックが冪等性を壊さないこと）。**
  `unsubscribe`/`deleteByEndpoint` は完全に冪等（UNSUB-02・WH-PUSH-07・INF-PUSH-04）。
  `cron` は**意図的に非冪等**（契約設計書 §7.3。B-5・R-11 のとおり重複起動時の二重送信を
  受容する設計であり、これを「冪等性の欠陥」としてテストしない）。
- **障害系（外部 I/O・本ユニット最大の新規領域）**: SEA-04〜06/09（部分失敗の隔離）、
  INF-WPS-03〜06（ステータス写像。**INF-WPS-06 は Z-PUSH-21/24 の契約層検証と対になり、
  「壊れた鍵長の購読が毎日失敗し続ける」障害モードを二段構えで防ぐ**）、WH-CRON-07
  （予期しない例外時の 500）。リトライは 0 回・翌日再送に委ねる設計（§エラー処理 (a)）の
  ため「リトライ回数」の試験観点は存在しない。
- **フロントエンド固有**: EAS-06〜09（500/422 時の UI・通信エラー・ローディング）。
  楽観的更新は対象外（購読 ON/OFF は `useApiAction` パターン。設計書 L689）。
- **防御性（Domain 層）**:
  - 防御的コピー: PS-08（`createdAt` getter。実装計画での確定が必要。§15 項目 4）。
  - 不変条件: PS-02〜04（空文字拒否は `create()` のみ）、PS-05（`reconstruct()` は検証を
    バイパスする既存パターンとの整合）。
  - 副作用: `PushSubscription` に `updatedAt` 相当のタイムスタンプは無い（`createdAt` のみ）。
    再購読時に `createdAt` が変わらないことを SUB-05 で確認する。
  - 不正引数の伝搬: SUB-03（Zod バイパス時の Domain 側フォールバック）。
- **性能**: SEA-06（N+1 回避）、INF-PUSH-06（`deleteByEndpoints` の一括削除）、
  INF-WPS-02（タイムアウト設定）。負荷試験は設計書のとおり対象外（§性能 L896-901）。

---

## 10. manual-browser-verify（実画面確認）— 本ユニットの中心的価値

自動テストで検証できる範囲は §2〜§7 で尽くされる。しかし本ユニットの主要リスク
（iOS 固有の 2 経路・実機 Push 受信・`vercel.json` の実際の発火・`sw.ts` の O-01 回帰）は
**原理的に自動化できない**。以下を必須の確認手順として扱う。「該当環境が無いため確認できず」を
PASS として報告することを禁止する（stock-edit の manual-browser-verify で確立した運用を
踏襲する）。

> **実施時期（2026-08-10 ユーザー判断）**: 本節は **Sprint 10 のタスク 5 へ繰り越した**。
> 実装は完了し PR #147 でマージ済みだが、本節が未実施である限り **Sprint 8 の完了条件
> 3 件目は未達扱い**とする（`docs/05-roadmap.md`「Unit B の実機確認の繰り越し」）。
> 再開時は**まず Preview Deployment の再デプロイから**始めること。Vercel の環境変数
> （2026-08-10 に登録済み）は、設定後に作られたデプロイにしか反映されない。
>
> **→ 2026-08-15 に実施済み。結果は §10-5 を参照。** iOS 側は全項目 PASS。Android 実機を
> 用意できなかったため、Android 前提の 5 項目（MB-01 / MB-02 / MB-08b / MB-09b / MB-12）は
> **未実施のまま残る**。

### 10-1. 環境変数の準備チェックリスト（実施前提。**M-2/M-3 反映**）

**Preview Deployment は Deployment Protection を有効にしない限り、URL を知る誰もが
アクセスできる（社内限定ではない）。** そのため以下の鍵はすべて**Preview 専用に新規発行し、
検証完了後に破棄する**（本番の VAPID 鍵・`CRON_SECRET` を絶対に流用しない。M-3）。

| 変数                                     | 値の形式                                                                                                              | 確認事項                                                                                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `web-push generate-vapid-keys` 等で生成した鍵ペア。**Preview 専用に新規発行**（本番鍵を流用しない）                   | Preview Deployment の環境変数に設定済みであること。検証完了後に破棄する                                                                                                                 |
| `VAPID_SUBJECT`                          | `mailto:` または HTTPS URL（**罠 8**）                                                                                | `mailto:` 形式か HTTPS URL 形式であることを目視確認（他の形式だと iOS だけ 403 になり気づきにくい）                                                                                     |
| `CRON_SECRET`（**M-2**）                 | `openssl rand -base64 32` 等で生成した 256 bit のランダムな秘匿文字列。**Preview 専用に新規発行**（本番と共有しない） | 手動 `curl` で使う値はシェル変数として保持し、実値を `docs/`／`logs/`／PR 本文に貼らない（§10-3 参照）                                                                                  |
| `TZ`（**設定しない**）                   | —                                                                                                                     | Vercel の予約環境変数のため登録できない（P-5 改）。JST は `packages/application/src/pantry/expiry.ts` にコード上で明示してあるので、実行時 TZ が UTC のままでも通知日はずれない（罠 5） |

### 10-2. シードデータの組み合わせ表

`/pantry` の在庫データと Push 購読の両方を横断して確認する必要がある。

| #                  | 種別              | 内容                                                                                          | 用途（どの確認項目のために必要か）                                                                                   |
| ------------------ | ----------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| ES-1               | 在庫              | 牛乳・asOf + 1 日・数量 2 個                                                                  | MB-05（通知本文 1 件目）/ MB-06（閾値内）                                                                            |
| ES-2               | 在庫              | 卵・asOf - 1 日（期限切れ）・数量 1 個                                                        | MB-05（通知本文に期限切れが含まれる。B-2）                                                                           |
| ES-3               | 在庫              | 豆腐・asOf 当日・数量 1 個                                                                    | MB-05（通知本文 3 件目）                                                                                             |
| ES-4               | 在庫              | 納豆・asOf + 2 日・数量 1 個                                                                  | MB-05（「他 n 件」への集約対象。4 件目）                                                                             |
| ES-5（**最重要**） | 在庫              | ヨーグルト・asOf + 3 日（閾値ちょうど）・数量 0.0001 個（DB の `numeric(10,3)` 丸めで実質 0） | MB-07（**P-10b の非対称を実機で確認**: `/pantry`・ダッシュボードには表示されるが通知本文には出ない）                 |
| ES-6               | 在庫              | 味噌・asOf + 10 日（閾値外）・数量 1 個                                                       | MB-05 の対照（通知にもダッシュボードにも出ないことの確認）                                                           |
| PS-1               | Push 購読         | Android Chrome（PWA 化不要）                                                                  | MB-01/02（ON/OFF）/ MB-04（Cron 到達・Android）                                                                      |
| PS-2（**最重要**） | Push 購読         | iPhone Safari。**事前にホーム画面へ追加した PWA**                                             | MB-03（iOS の権限要求）/ MB-08（Cron 到達・iOS）/ MB-09（タップ遷移・iOS）                                           |
| PS-3               | Push 未購読の対照 | iPhone Safari。ホーム画面に追加していない通常タブ                                             | MB-03b（罠 3(a) の確認: ホーム画面未追加では購読フローが機能しない、またはボタン自体を出さない実装であることの確認） |

> ES-1〜ES-6 と PS-1〜PS-3 は**すべて**シードする。片方だけでは通知本文の要約（先頭 3 件 +
> 「他 n 件」）と P-10b の非対称を同時に確認できない。

### 10-3. 確認手順（**M-3/H-1 反映**）

1. **デプロイ**: Vercel Preview Deployment を作成する（`next build` 相当で `sw.ts` が
   `public/sw.js` に生成されることを確認する。罠 1 の対応）。
2. **DB シード**: ES-1〜ES-6 を Preview 環境の DB に投入する（`/pantry` の「追加」フォーム、
   または DB へ直接投入）。
3. **iOS 実機**: Preview URL に Safari でアクセスし、共有シート →「ホーム画面に追加」で
   PWA 化する（PS-2）。ホーム画面のアイコンから起動する（ブラウザタブのままでは Web Push が
   動かない。罠 3(a)）。
4. **Android 実機/エミュレータ**: Preview URL に Chrome でアクセスする（PWA 化は必須ではない。
   PS-1）。
5. ダッシュボードの購読 ON ボタンを iOS・Android それぞれで押し、通知許可ダイアログが
   ユーザージェスチャ起点で表示されることを確認する（罠 3(b)）。
6. `GET /api/push/vapid-public-key` を `curl` で叩き、200 で公開鍵が返ることを確認する
   （環境変数の設定漏れの早期検知。P-12）。
7. `GET /api/cron/expiry-alerts` を以下の 3 パターンで `curl` する。**`CRON_SECRET` は
   シェル変数（例: `export CRON_SECRET=...`）に格納したうえで `-H "Authorization: Bearer
$CRON_SECRET"` の形で参照し、実値そのものをコマンド出力ごと `docs/`／`logs/`／PR 本文に
   貼り付けない**（本プロジェクトは `logs/` に作業記録を残す運用のため、実値の転記経路が
   実在する。M-3）:
   - `Authorization` ヘッダーなし → `401`
   - 誤った `Bearer` 値 → `401`
   - 正しい `Bearer $CRON_SECRET` → `200`、レスポンスボディの `sentCount` が購読数と一致
8. iOS・Android それぞれで通知が届くことを確認する（**Vercel Cron のスケジュール発火を
   待つのではなく、手順 7 の手動 `curl`（または Vercel ダッシュボードの Cron 手動トリガー）で
   即座に確認する**。B-6 のとおり自動発火は 1 時間ブレるため「08:00 ちょうどに届く」ことを
   検証項目にしない）。
9. 通知をタップし、`/pantry` へ遷移することを確認する（iOS・Android 両方）。
10. `sw.ts` の既存オフライン挙動（O-01）を再確認する: `docs/tests/saturday-flow.md:83-86`
    の手順（買い物中に `/shopping-lists/{id}` をオフラインで再表示できること）を、本ユニットの
    `push`/`notificationclick` 追加後の Preview Deployment で再実施する。
11. 375px 幅（モバイル）でダッシュボードの購読 ON/OFF ボタンがレイアウトを崩さないことを
    目視確認する。
12. **前提データ全消化チェック**: ES-1〜ES-6・PS-1〜PS-3 のうち一度も MB-xx の確認に
    使われなかったものが無いか最後に確認する。「該当データなしで PASS」の報告は差し戻す。
13. **事後確認（H-1・新規）**: Vercel の実行ログに出力される
    `console.log('expiry-alerts cron result', result)` の `subscriptionCount` が、
    検証で登録した想定デバイス台数（PS-1・PS-2 の 2 台。追加の検証端末を使った場合はその数）を
    **超えていないか確認する**（第三者が無断で購読を登録していないかの検知経路。P-15 の
    上限が破られていないことの運用側の裏付けにもなる）。

### 10-4. 確認項目一覧（MB-xx）

| ID                               | 確認項目                                                                                                                                                                                                                                 | 必要な前提データ                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| MB-01                            | Android で ON ボタンを押すと通知許可ダイアログが出て、承認すると購読が保存される                                                                                                                                                         | PS-1                                           |
| MB-02                            | Android で OFF ボタンを押すと購読が解除され、以後 Cron を叩いても届かない                                                                                                                                                                | PS-1                                           |
| MB-03                            | iOS（ホーム画面追加済み PWA）で ON ボタンを押すと通知許可ダイアログが出て購読できる                                                                                                                                                      | PS-2                                           |
| MB-03b（**必須**）               | iOS のホーム画面未追加のブラウザタブでは購読が機能しない、または UI 側で案内される（罠 3(a)）                                                                                                                                            | PS-3                                           |
| MB-04                            | `curl` で `GET /api/push/vapid-public-key` が 200 で公開鍵を返す                                                                                                                                                                         | 環境変数（§10-1）                              |
| MB-05（**最重要**）              | Cron 実行後の通知本文が「先頭 3 件 + 他 2 件」の形式になっている（ES-1〜ES-4 が閾値内、ES-5 は amount 0 で除外、ES-6 は閾値外で除外。閾値内が ES-1〜ES-5 の 5 件中、amount>0 なのは ES-1〜ES-4 の 4 件 → 先頭 3 件 + 他 1 件になるはず） | ES-1〜ES-6                                     |
| MB-06                            | 通知本文の期限切れ在庫（ES-2）が含まれている（B-2）                                                                                                                                                                                      | ES-2                                           |
| MB-07（**最重要・P-10b**）       | ES-5（数量実質 0）が `/pantry`・ダッシュボードには表示されるが、通知本文には含まれない                                                                                                                                                   | ES-5                                           |
| MB-08（**必須・iOS**）           | iOS 実機で Cron 手動トリガー後に通知が届く                                                                                                                                                                                               | PS-2                                           |
| MB-08b（**必須・Android 対照**） | Android で同じ Cron 実行後に通知が届く（iOS だけ落ちていないかの対照。罠 8・R-9 の検出）                                                                                                                                                 | PS-1                                           |
| MB-09（**必須・iOS**）           | iOS で通知をタップすると `/pantry` へ遷移する                                                                                                                                                                                            | PS-2                                           |
| MB-09b                           | Android で通知をタップすると `/pantry` へ遷移する                                                                                                                                                                                        | PS-1                                           |
| MB-10                            | `curl` で `Authorization` ヘッダーなし → 401、誤った値 → 401、正しい値 → 200                                                                                                                                                             | 環境変数（§10-1）                              |
| MB-11                            | 期限が近い在庫が 0 件の状態で Cron を叩いても通知が来ない（ES-1〜ES-6 を一時的に全て消費・廃棄した状態で確認。N-7）                                                                                                                      | 一時的に在庫 0 件の状態                        |
| MB-12                            | 複数デバイス（PS-1・PS-2）が購読している状態で Cron を叩くと両方に届く（N-8）                                                                                                                                                            | PS-1, PS-2                                     |
| MB-13                            | 375px 幅でダッシュボードの購読 ON/OFF ボタンがレイアウトを崩さない                                                                                                                                                                       | —                                              |
| MB-14（**最重要・REG-07**）      | `sw.ts` 変更後も既存のオフライン再訪問（O-01）が機能する                                                                                                                                                                                 | `docs/tests/saturday-flow.md:83-86` の手順一式 |

### 10-5. 実施結果（2026-08-15）

**実施者**: ユーザー本人。**端末**: iPhone（Safari / ホーム画面追加済み PWA = PS-2、および
ホーム画面未追加の通常タブ = PS-3）。**Android 実機は用意できなかった**。

本節は**ユーザーの実施報告を転記したもの**であり、Claude が自身で観測した結果ではない。
Android 前提の項目は、§10 冒頭の「該当環境が無いため確認できず」を PASS として報告しない
運用に従い、**未実施**として残す。

| ID     | 判定       | 備考                                                                           |
| ------ | ---------- | ------------------------------------------------------------------------------ |
| MB-01  | **未実施** | Android 端末なし（PS-1 未シード）。iOS 側の購読 ON は MB-03 で確認済み         |
| MB-02  | **未実施** | Android 端末なし。iOS 側の OFF 経路は MB-xx に対応項目が無い（下記「残る穴」） |
| MB-03  | PASS       | iOS PWA で権限ダイアログ表示 → 購読成功                                        |
| MB-03b | PASS       | ホーム画面未追加タブでは購読が機能しない（罠 3(a)）                            |
| MB-04  | PASS       | `GET /api/push/vapid-public-key` が 200 で公開鍵を返す                         |
| MB-05  | PASS       | 通知本文が「先頭 3 件 + 他 n 件」の形式（ES-1〜ES-6 をシード）                 |
| MB-06  | PASS       | 期限切れ在庫（ES-2）が本文に含まれる（B-2）                                    |
| MB-07  | PASS       | ES-5 が `/pantry`・ダッシュボードに出て通知本文には出ない（P-10b の非対称）    |
| MB-08  | PASS       | iOS 実機で Cron 手動トリガー後に通知が届く                                     |
| MB-08b | **未実施** | Android 対照が取れていない（罠 8・R-9 の検出経路が空いたまま）                 |
| MB-09  | PASS       | iOS で通知タップ → `/pantry` へ遷移                                            |
| MB-09b | **未実施** | Android 端末なし                                                               |
| MB-10  | PASS       | ヘッダーなし → 401 / 誤値 → 401 / 正値 → 200                                   |
| MB-11  | PASS       | 期限が近い在庫 0 件では通知が来ない（N-7）                                     |
| MB-12  | **未実施** | 購読デバイスが 1 台のみのため複数デバイス配信を確認できていない（N-8）         |
| MB-13  | PASS       | 375px でダッシュボードの ON/OFF ボタンが崩れない                               |
| MB-14  | PASS       | `sw.ts` 変更後もオフライン再訪問（O-01）が機能する（REG-07）                   |

**シードデータの消化状況**（§10-3 手順 12）: ES-1〜ES-6 / PS-2 / PS-3 は使用済み。
**PS-1（Android Chrome）のみ未使用**で、これが上記 5 項目の未実施と対応している。

**残る穴（次に実機を触れるときの持ち越し）**:

1. **Android 対照（MB-08b）が取れていない。** 試験計画が「必須」に指定している項目で、
   `VAPID_SUBJECT` の形式ミスなど **iOS だけ落ちる/Android だけ落ちる**種類の障害
   （罠 8・R-9）は、片側だけでは検出できない。Cookpit の主対象は iPhone PWA なので
   利用上の実害は小さいが、**未検出のまま**であることは記録に残す。
2. **複数デバイス配信（MB-12）が未確認。** 2 台目を購読させたときに `sentCount` が
   デバイス数と一致するかは未検証。
3. **iOS 側の購読 OFF（解除）に対応する MB 項目が無い。** MB-02 が Android 前提で書かれて
   いるため、iOS で OFF を押した後に通知が止まることは今回の範囲外。次回実機時に
   MB-02 の iOS 版として実施するのが妥当。
4. **§10-3 手順 13（`subscriptionCount` の想定台数確認）と M-3（Preview 用 VAPID 鍵・
   `CRON_SECRET` の破棄）は、今回の報告に含まれていない。** 実施済みかどうか未確認。

---

## 11. E2E smoke（Playwright）の要否判断

**対象外**。理由:

- 本ユニットの主要リスク（実機 Push 受信・iOS 固有経路・Cron の実際の発火）は Playwright
  では代替できない性質のものであり、§10 の手動確認が唯一の有効な検証手段である。
- API 契約（400/401/422/500 の分岐）は Hono ルートの結合試験（§6）で構造的に検証できる。
- Cookpit MVP1 では pantry 系画面・ダッシュボードに対して Playwright E2E 基盤が整備されて
  おらず、既存ユニット（pantry-core・stock-edit）と同じ判断を踏襲する。

---

## 12. 試験データ

- Domain/Application: `endpoint` は `https://fcm.googleapis.com/fcm/send/<任意文字列>`
  形式を基本とし、境界値として 2048 文字ちょうど・2049 文字を用意する。`p256dh`/`auth` は
  契約設計書 §4.2 の実測目安値（87 文字・22 文字前後）を基本とし、**P-17 確定後の境界**
  として `p256dh` は 85/86/88/89 文字、`auth` は 21/22/24/25 文字を用意する。
- `endpoint` のホスト検証（P-16）用に、IPv4/IPv6 リテラル（`127.0.0.1`/`[::1]`/
  `192.168.1.1`）、`localhost`/`foo.local`/`foo.internal`、userinfo 埋め込み
  （`evil.example@fcm.googleapis.com`）、サフィックス偽装
  （`fcm.googleapis.com.evil.example`）、正規ホスト（`fcm.googleapis.com`）の各テスト値を
  用意する。
- Application（購読上限・P-15）: `InMemoryPushSubscriptionRepository` の `findAll()` が
  9 件・10 件を返す 2 パターンの seed ヘルパーを用意する。
- 期限（`expiresAt`）: 既存 `apps/web/tests/app/_utils/dashboard-view.node.test.ts` の
  境界値（当日・前日・月またぎ・年またぎ）を移設先でもそのまま再利用する。数量 0 の境界は
  `numeric(10,3)` 丸めを想定した `0.0001` を使う（Unit A レビュー S-5 と同じ値）。
- Infrastructure（PGlite）: `createStock()` 相当の `createPushSubscription()` ヘルパーを
  新設し、`overrides` で `endpoint`/`p256dh`/`auth` を指定できるようにする。
- Infrastructure（`WebPushSender`）: `web-push` パッケージを `vi.mock('web-push')` で
  モックし、`statusCode` の有無・値をテストケースごとに差し込む。
- manual-browser-verify: §10-2 の ES-1〜ES-6・PS-1〜PS-3 表をそのままシードデータとして使う。
  環境変数は Preview 専用に新規発行する（§10-1・M-2/M-3）。

---

## 13. 完了条件

- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` が変更パッケージ（domain / application /
      api-contract / infrastructure / apps/web）すべてで通る。
- [ ] Domain: PS-01〜08 が実装され pass する（PS-08 は実装計画での確定後）。
- [ ] Application: SUB-01〜08・UNSUB-01〜02・SEA-01〜11・GES-01〜05・APX-01〜24 が実装され
      pass する（**SEA-04/06/07・GES-03 の非対称固定に加え、SUB-07（422）・SUB-08（上限
      対象外の回帰）は必須**）。`PushSender` 関連の型は `@cookpit/domain` から import
      されていることを確認する（P-13）。
- [ ] api-contract: Z-PUSH-01〜26 が実装され pass する（**Z-PUSH-17（userinfo・
      サフィックス偽装の reject）と Z-PUSH-21/24（鍵長下限）は必須**）。
- [ ] **Infrastructure（最重要・リリースブロッカー）**: `create-test-db.ts` への DDL 追記
      （§5-1）を含め INF-PUSH-01〜08・INF-WPS-01〜06 がすべて実装され pass する。
      **特に INF-PUSH-02（upsert の鍵更新）は必須**（罠の再発防止の核）。`WebPushSender` が
      `PushSender`（`@cookpit/domain`）を実装していることを確認する（P-13）。
- [ ] Presentation: WH-PUSH-01〜11・WH-CRON-01〜08・EAS-01〜10・DASH-REG-01〜02・
      SR-REG-01〜02 が実装され pass する（**WH-PUSH-02/03・WH-PUSH-09/10・
      WH-CRON-04〜07 の 400/401/422/500 の分岐は必須**）。
- [ ] 回帰試験範囲（§8 REG-01〜11）がすべて pass する。**特に REG-06（既存
      `dashboard-view.node.test.ts` の再構成）・REG-07（O-01 の手動再確認）・
      REG-11（購読上限が正規再購読を妨げないこと）は明示的に実行結果を確認する。**
- [~] manual-browser-verify（§10）: MB-01〜MB-14 をすべて実施し、ES-1〜ES-6・PS-1〜PS-3 の
  シードデータが全て確認に使われたことをチェックする。**MB-08・MB-08b（iOS/Android 対照）・
  MB-07（P-10b の非対称）・MB-14（O-01 再確認）は特に必須。§10-3 手順 13（H-1・
  `subscriptionCount` の想定台数確認）も実施する。** 「該当環境なしで PASS」の
  報告があれば差し戻す。Preview 用の VAPID 鍵・`CRON_SECRET` は検証完了後に破棄する
  （M-3）。
  → **2026-08-15 に部分実施（§10-5）**。iOS 側 12 項目 PASS（MB-07・MB-08・MB-14 を含む）。
  **Android 実機が無く MB-01 / MB-02 / MB-08b / MB-09b / MB-12 は未実施**のため、
  本条件は**完全充足ではない**（必須指定の MB-08b が欠けている）。手順 13 と M-3 の
  鍵破棄も未確認。
- [x] roadmap Sprint 8 完了条件 3 件目「期限が近い在庫にアプリを開かずに気づける」を
      満たすことを実機確認後に確認する。
      → **達成（2026-08-15）**。利用者の実機 iPhone（PWA）で Cron 実行後に通知を受信し
      （MB-08）、タップで `/pantry` へ遷移することを確認した（MB-09）。Cookpit の主対象端末
      での経路が通っているため条件は満たすと判断する。Android 対照が未取得である点は
      §10-5「残る穴」に残す。

---

## 14. 層別のテスト配置（vitest include 確認済み）

| 層                                                                                        | include グロブ（実測）                                | 新規・追記ファイル                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/domain`                                                                         | `tests/**/*.test.ts`（`@cookpit/config/vitest/base`） | `packages/domain/tests/push-subscription/push-subscription.test.ts`（新規。`PushSender` は interface のため専用テストファイルなし）                                                                                                                                                                                                                                                                                       |
| `packages/application`                                                                    | `tests/**/*.test.ts`                                  | `packages/application/tests/notification/subscribe-to-expiry-alert.use-case.test.ts`（新規。SUB-06〜08 含む）、`unsubscribe-from-expiry-alert.use-case.test.ts`（新規）、`send-expiry-alerts.use-case.test.ts`（新規）、`packages/application/tests/pantry/get-expiring-stocks.use-case.test.ts`（新規）、`packages/application/tests/pantry/expiry.test.ts`（新規・既存 apps/web テストの移設先。P-14 で全 6 export 分） |
| `packages/api-contract`                                                                   | `tests/**/*.test.ts`                                  | `packages/api-contract/tests/push-subscription.schema.test.ts`（新規。Z-PUSH-15〜26 のホスト検証・鍵長境界を含む）                                                                                                                                                                                                                                                                                                        |
| `packages/infrastructure`                                                                 | `tests/**/*.test.ts`                                  | `packages/infrastructure/tests/repositories/drizzle-push-subscription.repository.test.ts`（新規）、`packages/infrastructure/tests/notification/web-push-sender.test.ts`（新規）、`packages/infrastructure/tests/testing/create-test-db.ts`（DDL 追記）                                                                                                                                                                    |
| `apps/web`（node。実測 include: `tests/**/*.node.test.ts` / `tests/server/**/*.test.ts`） | 同左                                                  | `apps/web/tests/server/routes/push.test.ts`（新規。WH-PUSH-09/10 の 422/204 分岐を含む）、`apps/web/tests/server/routes/cron.test.ts`（新規）、`apps/web/tests/app/_utils/dashboard-view.node.test.ts`（再構成。`MEAL_PLAN_STATUS_LABELS` のみ残す）                                                                                                                                                                      |
| `apps/web`（dom。実測 include: `tests/**/*.dom.test.ts` / `tests/**/*.test.tsx`）         | 同左                                                  | `apps/web/tests/app/_components/expiry-alert-subscription.test.tsx`（新規・`.test.tsx`。EAS-07 の 422 UI 分岐を含む）、`dashboard.test.tsx`（追記）、`apps/web/tests/app/pantry/_components/stock-row.test.tsx`（回帰確認）                                                                                                                                                                                               |

全層で include パターンとの不一致は無い（`apps/web/vitest.node.config.mts` /
`apps/web/vitest.dom.config.mts` を実測確認済み）。`sw.ts` の自動テストは§7-4/§0-2 のとおり
配置先を定めない（自動化困難と判断）。

---

## 15. 不足・矛盾していると感じた点（Orchestrator への申し送り。設計書は書き換えない）

1. **【解決済み・2026-08-09 P-14 確定】既存 `apps/web/tests/app/_utils/dashboard-view.node.test.ts`
   の扱いが、提出時点では設計書・要件書のどちらにも明記が無かった。** P-14 確定
   （`formatExpiryUrgencyLabel` を含む全 6 export を Application 層へ移設し
   `apps/web/src/app/_utils/expiry.ts` を削除）によりこの矛盾は解消済み。結論:
   `packages/application/tests/pantry/expiry.test.ts`（新規）へ 6 export 分すべて
   （APX-01〜24）を移設し、元ファイルには `MEAL_PLAN_STATUS_LABELS` の `describe`
   （L80-88）のみが残る。ファイル名・配置の変更は不要（`dashboard-view.ts` 自体は
   `MEAL_PLAN_STATUS_LABELS` の定義を持ち続けるため）。
2. **【新規・P-16 の実装確認事項】Z-PUSH-17（userinfo 部を含む URL の reject）は、
   `new URL(value).hostname` だけでは検出できない可能性がある。** `new URL('https://
evil.example@fcm.googleapis.com/x').hostname` は `'fcm.googleapis.com'` を返す
   （`username`/`password` 部は `hostname` に含まれない）ため、「`hostname` が
   許可リストと一致するかだけを見る」実装では userinfo 部の有無に関わらず正規ホストと
   同じ扱いになり、**reject できない可能性がある**。P-16 の確定事項が「userinfo 埋め込みを
   reject する」ことを求めている以上、実装は `hostname` 検証に加えて **`URL.username`/
   `URL.password` が空文字であることも別途検証する**必要があると推測される。この
   実装詳細は設計書 §確定事項 P-16 に明記されているか本書では確認できていない（設計書を
   再読していないため）。実装計画で `pushEndpointSchema` の `refine()` 実装が
   `username`/`password` チェックを含むかを確認し、Z-PUSH-17 のアサーション対象
   （reject 理由の特定）を確定させてほしい。
3. **`SubscribeToExpiryAlertUseCase` の疑似コード（設計書 L426-437）が全角文字の
   プレースホルダを含み、`reconstruct()` に既存の `createdAt`/`id` をどう渡すかが読み取れない。**
   設計書自身が「誤記防止のためのプレースホルダである」（L449-452）と明記しているため
   矛盾ではないが、**再購読時に `createdAt` が保持されるか（初回登録日時として意味を持つか）
   は実装計画で確定させる必要がある**。設計書 §将来課題に「実装時に確定し、テストで固定する
   対象」として明記されたため、本書の SUB-05（要確認）観点はそのまま残す。
4. **`expiry-alert-subscription.tsx` の初期表示時の購読状態（ON/OFF どちらを表示するか）の
   判定方法が設計書に明記されていない。** 設計書 §将来課題に「実装時に確定し、テストで
   固定する対象」として明記されたため、本書の EAS-10（要確認）観点はそのまま残す。
5. **`PushSubscription.createdAt` getter が防御的コピーを返すかどうかが設計書に明記されて
   いない。** 設計書 §将来課題に「実装時に確定し、テストで固定する対象」として明記された
   ため、本書の PS-08（要確認）観点はそのまま残す。
6. **`sw.ts` の `push`/`notificationclick` ハンドラの自動単体テストが実装可能かどうか、
   設計書「テスト方針」（L930-931）は「実装計画で確認する」と保留にしている。** 本書は
   `sw.ts` の実測構造（import 時に `new Serwist(...)` を即時実行し `self.__SW_MANIFEST` に
   依存する）から**自動化は困難と判断**し、SW-01〜05 を手動確認（§10 MB-05〜MB-09/MB-14）に
   委ねる形で計画した。これは実装アーキテクチャの提案であり試験計画の権限を超えるため、
   Orchestrator/実装計画側の判断に委ねる。
7. **`apps/web/src/app/sw.ts` の既存 `runtimeCaching` 4 件（O-01）の回帰検知が、本ユニット
   以前から自動テストを持たず手動確認のみに依存している。** 試験基盤の恒久的な改善
   （sw.ts の自動テスト整備）はスコープ外の提案として記録するにとどめる。
8. **`stock-row.tsx` のクライアントバンドルへの影響（R-12）は、設計書自身が「確認推奨」
   （断定しない）としている。** 本書はこれを自動テストの対象にできないと判断し（§0-2）、
   実装時のビルド後バンドルサイズ確認という実装計画側のタスクとして申し送るにとどめた。
9. **VAPID subject（`mailto:`/HTTPS URL 制約。罠 8）の Apple 側 403 検証は、Preview
   Deployment + iPhone 実機でしか検証できない。** ステージング環境での自動化は本ユニットの
   スコープでは検討していない。将来 Push Service 依存のテストを安定化させたい場合は、
   独立した改善候補として `docs/claude-code/improvements/` に起票することを推奨する
   （本書はその起票自体は行わない）。

10. **【解決済み・2026-08-10】Z-PUSH-18（サフィックス偽装 `fcm.googleapis.com.evil.example`）の
    期待結果を reject → accept へ訂正した。** 本書の初版は Orchestrator の指示に従って reject を
    期待していたが、**その指示が P-16（許可リストを採らない・ブロックリスト方式）と矛盾していた**。
    ブロックリスト（IP リテラル・`localhost` / `.local` / `.internal`）では
    `fcm.googleapis.com.evil.example` を他の未知の外部ホストと区別できない。区別するには
    P-16 が明示的に却下した許可リストが要る。実装フェーズで implementer が検出した。- **残存ギャップ**: 任意の外部 HTTPS ホストを購読 `endpoint` として登録できる。これは
    ADR-0017 §Consequences に「正規の Push Service に見えるホストへの送信は防げない」として
    記録済みであり、P-16 は内部ネットワーク向けの blind SSRF を塞ぐことを目的としている。
    第三者が購読を登録できること自体は H-1 / P-15（件数上限）で扱う別の論点。- Z-PUSH-17（userinfo 部）は**引き続き reject が正**。`new URL('https://evil.example@
fcm.googleapis.com/x').hostname` は正規ホスト `fcm.googleapis.com` を返すため
    `hostname` 検証だけでは弾けず、`username` / `password` の明示チェックが要る。
    implementer がこれを実装した（契約設計書 §3.1 の literal なコードには無かった追加）。
