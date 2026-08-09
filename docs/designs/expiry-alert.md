# 設計書: expiry-alert

- ステータス: confirmed（P-1〜P-11 ユーザー確定・2026-08-09）
- レベル: L3
- 関連:
  - `docs/requirements/expiry-alert.md`（本設計の要件定義書）
  - `docs/designs/stock-edit.md`（Unit A。本ユニットの前提となる在庫編集・期限データの実装。
    §変更後構成の期限判定ロジック `expiry.ts` はここで新設されたもの）
  - `docs/05-roadmap.md:638-669`（Sprint 8 完了条件・方式確定・ユニット分割）
  - `docs/decisions/ADR-0017-web-push-expiry-alert.md`（本ユニットの方式決定。Orchestrator
    判断で起票する。Domain 新規集約の追加自体は既存の「集約 = テーブル 1:1」方針の延長だが、
    Web Push + 日次 Cron という**外部サービス連携の新設**と、ADR-0001 §プッシュ通知および
    `docs/02-tech-stack.md:118`「MVP1 ではプッシュ通知を使わない」の**前提の再訪**を伴うため、
    `docs/claude-code/document-policy.md` §Level 3 の必須成果物として作成する）

## 背景

`docs/requirements/expiry-alert.md` の背景と同一。要約: Sprint 8 完了条件 3 件のうち
「期限が近い在庫にアプリを開かずに気づける」（`docs/05-roadmap.md:640`）だけが未達。
Unit A（stock-edit）のマージにより在庫に実際の期限データが入る経路が揃った。方式は
Web Push（VAPID）+ 日次 Cron にユーザー確定済み（`docs/05-roadmap.md:660-664`）。

## 目的

- ユーザーがアプリを開かなくても、期限が近い（または期限切れの）在庫があることに日次で
  気づけるようにする。
- 通知から `/pantry` へ遷移し、消費・廃棄・編集の行動につなげる。

## 要件

`docs/requirements/expiry-alert.md` の FR-1〜FR-8、正常系 N-1〜N-8、異常系 E-1〜E-7、
境界条件 B-1〜B-6 を参照。

## 対象範囲

- Domain（新規 `packages/domain/src/push-subscription/`）: `PushSubscription` 集約 +
  Repository インターフェース。
- Application（新規 `packages/application/src/notification/` + 既存
  `packages/application/src/pantry/` の拡張）: 購読 ON/OFF の UseCase 2 本、日次ダイジェスト
  送信の UseCase 1 本、期限判定ロジックの移設・`GetExpiringStocksUseCase` 新設。
- api-contract（新規 `packages/api-contract/src/push-subscription.schema.ts`）: 購読・
  購読解除のリクエストスキーマ。
- Infrastructure（新規）: `push_subscriptions` テーブル・Repository 実装、`web-push`
  パッケージを用いた Push 送信実装（P-9）。
- Presentation（apps/web）: Cron 用 Hono ルート、購読/購読解除 Hono ルート、`sw.ts` への
  `push`/`notificationclick` ハンドラ追加、ダッシュボードへの購読 ON/OFF UI 追加。
- 設定: `vercel.json` 新設、Vercel 環境変数（VAPID 鍵一式・`CRON_SECRET`・`TZ=Asia/Tokyo`）
  の追加。

## 対象外

- 認証の導入（ADR-0003 を再訪しない）。Cron エンドポイントの Bearer 保護は当該ルート限定の
  インラインチェックとして設計し、汎用ミドルウェアは追加しない。
- Unit C（stock-undo。消費・廃棄の取り消し）。
- Sprint 9 の Background Sync。ただし `sw.ts` を両ユニットが触るため、共存方針を
  §将来課題に 1 段落残す。
- 通知の送信履歴・開封率などの分析（送信結果はログにのみ残し、テーブル化しない。P-2 の
  「送信履歴テーブルは作らない」確定に対応）。
- 期限アラート以外の通知（献立リマインダー等）。
- `stocks` テーブルへのスキーマ変更（既存の nullable 列をそのまま利用する）。

## 現状構成

### PWA / Service Worker

- `apps/web/src/app/manifest.ts`: `display: 'standalone'`・`start_url: '/'`・アイコン
  192/512 の any/maskable。iOS Web Push の前提の一部を満たす。
- `apps/web/src/app/layout.tsx:23-27`: `appleWebApp: { capable: true, statusBarStyle:
'default', title: 'Cookpit' }`。ホーム画面追加済み PWA であることが iOS Web Push の
  必須条件（実装上の罠 3）。
- `apps/web/src/app/sw.ts`（Serwist 9.5、全 58 行）: `new Serwist({ precacheEntries,
skipWaiting: true, clientsClaim: true, navigationPreload: false, runtimeCaching: [4件]
})` + `serwist.addEventListeners()`（L58）のみ。`push` / `notificationclick` の
  `addEventListener` は**存在しない**。
  - runtimeCaching 4 件（L18-54）: Google Fonts（CacheFirst）/ `GET /api/shopping-lists/:id`
    （NetworkFirst 3s）/ `GET /api/stores`（StaleWhileRevalidate）/ `GET /shopping-lists*`
    （NetworkFirst 3s）。この挙動は `docs/tests/saturday-flow.md:83-85`
    （オフライン再訪問 O-01）が固定している。
- `apps/web/next.config.ts:24-29`: `process.env.NODE_ENV === 'production'` のときだけ
  `withSerwist({ swSrc: 'src/app/sw.ts', swDest: 'public/sw.js' })` を適用する。dev では
  SW が生成されない（実装上の罠 1）。
- `Notification` / `PushManager` / `webpush` / `VAPID` を含むアプリコードは 0 件（実測）。

### Cron / 環境変数 / 認証

- `vercel.json` はリポジトリ全体に存在しない。
- 定期実行は `.github/workflows/weekly-maintenance.yml`（`cron: '0 21 * * 0'` = 月曜
  06:00 JST、L6）のみで、アプリのビジネスロジックを叩く定期実行は無い。
- `.github/workflows/post-deploy.yml` は「外部から本番 `*.vercel.app` の HTTPS URL の
  `/api/health` を叩き、リトライ（6 回・段階的バックオフ）とタイムアウト
  （`AbortSignal.timeout(10_000)`）を伴う」既存パターン（L44-61）。本設計の Push 送信の
  タイムアウト設計（§エラー処理 (b)）はこのパターンを踏襲する。
- `apps/web/src/db/client.ts:26-31` の `getDb()`（`db === null` なら `throw new
Error('DATABASE_URL is not configured')`）が、環境変数未設定時のハンドリングの唯一の
  前例。`.env.example` や検証層（zod 等）は存在しない。
- Hono の `.use(` は 0 件（ADR-0003）。`apps/web/src/server/app.ts`（全 35 行）は
  `new Hono().basePath('/api')` に 7 ルートを `.route()` でマウントし、`app.onError`
  （L24-33）が `NotFoundError → 404` / `InvalidOperationError → 422` / それ以外 500 を
  返す。`apps/web/src/app/api/[[...route]]/route.ts` が `runtime = 'nodejs'` で
  GET/POST/PUT/PATCH/DELETE を `handle(app)` に割り当てる。

### 期限判定ロジック（現状は apps/web の Presentation ユーティリティ）

Unit A（stock-edit）で `apps/web/src/app/_utils/expiry.ts`（新設済み）に集約されている。

```ts
// apps/web/src/app/_utils/expiry.ts（実測）
export const EXPIRY_URGENCY_WITHIN_DAYS = 3;
export function parseExpiryDate(expiresAt: string): Date {
  /* T00:00:00 ローカル */
}
export function toLocalMidnight(date: Date): Date {
  /* ローカル 0 時 */
}
export function getExpiryRemainingDays(expiresAt: string, asOf: Date): number {
  /* 負値可 */
}
export type ExpiryUrgency = 'overdue' | 'critical' | 'soon';
export function getExpiryUrgency(remainingDays: number): ExpiryUrgency {
  /* 3 段階 */
}
export function formatExpiryUrgencyLabel(remainingDays: number): string {
  /* 期限切れ / 本日まで / 明日まで / あとN日 */
}
```

`apps/web/src/app/_utils/dashboard-view.ts` の `selectExpiringStocks(stocks, asOf,
withinDays)`（L19-31）が `expiry.ts` の `parseExpiryDate` / `toLocalMidnight` を import し、
`expiresAt` が null の在庫を除外・`asOf + withinDays` 以下（境界含む）でフィルタ・
`expiresAt` 昇順にソートする。`apps/web/src/app/page.tsx`（ダッシュボード）が
`new Date()` を生成し、`GetCurrentMealPlanUseCase` / `GetPantryUseCase` を `Promise.all`
で呼んだ後、`selectExpiringStocks(pantry.stocks, now, EXPIRY_URGENCY_WITHIN_DAYS)` で
絞って `<Dashboard>` に渡す。`expiryUrgencyChipClass()` は
`apps/web/src/app/_utils/category-color.ts:66-68` にある（配色専用ファイルのため P-4 で
動かさない方針が既に確定している。stock-edit 設計書 §UI設計を参照）。

**Application / Domain 層に期限判定ロジックは存在しない。** これが本ユニットの Cron
（サーバーサイド専用の実行経路で、React コンポーネントを経由しない）が同じ判定ロジックを
再利用できない直接の理由である（P-4 で Application 層へ移す動機）。

### Domain / Application / Infrastructure（Pantry 集約。既存）

- `packages/domain/src/pantry/pantry.ts`: `Stock.expiresAt: Date | null`（防御的コピーを
  返す getter）。`Pantry.stocks` getter はコピーを返す。
- `packages/domain/src/pantry/pantry.repository.ts`: `find(): Promise<Pantry>` /
  `save(pantry): Promise<void>` の 2 メソッドのみ。期限で絞る取得メソッドは無い
  （Cron は毎回 `find()` で世帯全体を取得し、Application 側で絞り込む設計になる）。
- `packages/domain/src/index.ts`: 集約単位のコメント付きバレル（L1-49）。「新しい集約・
  値オブジェクトを追加したら、同じコミットでここにも追加する」と明記（L6）。
- `packages/application/src/pantry/pantry.dto.ts`: `StockDto.expiresAt` は
  `YYYY-MM-DD | null` のローカル日付文字列。
- `packages/application/src/shared/date.ts`: `toLocalDateString(date): string`
  （ローカル年月日を `YYYY-MM-DD` にする。`toISOString()` は使わない）。
- `packages/infrastructure/src/db/schema.ts:144-162`: `stocks` は `expires_at` が
  `date()`・nullable。インデックスは `stocks_product_id_idx` のみ。
- 全 9 テーブルがドメイン集約と 1:1 対応している（例外なし）。本ユニットの
  `push_subscriptions` も同じ方針を踏襲する（P-6）。
- PGlite テスト DDL は `packages/infrastructure/tests/testing/create-test-db.ts` の
  巨大テンプレートリテラル（`stocks` は L100-113）に手で同期する必要がある。忘れると
  当該 Repository テストが全滅する（実装上の罠 6）。
- `apps/web/drizzle.config.ts`: schema は
  `../../packages/infrastructure/src/db/schema.ts`、out は `./src/db/migrations`。
  既存マイグレーションは `0000`〜`0007`。
- `packages/api-contract/src/index.ts`: 1 集約 1 ファイルを `export *` するだけのバレル
  （L1-8）。`import z from 'zod'`（zod v4 の default import）。
- `apps/web/src/server/repositories.ts`: `getDb()` を渡して各 `Drizzle*Repository` を
  `new` する手動 DI 関数群（L11-33）。UseCase は呼び出し箇所で毎回 `new` する。
- `web-push` パッケージは未導入。

## 変更後構成

### Domain — 新規集約 `PushSubscription`（`packages/domain/src/push-subscription/`）

Push 購読情報（ブラウザが発行する `endpoint` と暗号化鍵 `p256dh` / `auth`）を表す新規集約。
既存 9 テーブルがすべてドメイン集約と 1:1 対応している一貫性を保つため、Infrastructure
限定の技術テーブルとしてではなく Domain 集約として置く（確定・P-6）。

```ts
// push-subscription.ts（新設）
export interface CreatePushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionProps {
  id: PushSubscriptionId;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
}

export class PushSubscription {
  private constructor(/* ... */) {}

  /** @throws Error endpoint / p256dh / auth のいずれかが空文字の場合 */
  static create(input: CreatePushSubscriptionInput): PushSubscription;
  static reconstruct(props: PushSubscriptionProps): PushSubscription;

  get id(): PushSubscriptionId;
  get endpoint(): string;
  get p256dh(): string;
  get auth(): string;
  get createdAt(): Date;
}
```

`PushSubscriptionId` は既存の ID 値オブジェクト（`StockId` 等）と同じ基底
（`packages/domain/src/shared/identifier.ts`）を使う。単一世帯前提（`PantryId.singleton()`
と同様の設計）のためユーザー ID は持たない。1 世帯が複数デバイスから購読する場合は
複数行として管理する（N-8）。

```ts
// push-subscription.repository.ts（新設）
export interface PushSubscriptionRepository {
  findAll(): Promise<PushSubscription[]>;
  findByEndpoint(endpoint: string): Promise<PushSubscription | null>;
  /** endpoint が既存なら鍵を更新（upsert）。新規なら追加する（P-8）。 */
  save(subscription: PushSubscription): Promise<void>;
  /** 存在しなくても例外を投げない（冪等。ブラウザ側の再送・Cron 側の失効削除の両方から
   * 呼ばれるため）。 */
  deleteByEndpoint(endpoint: string): Promise<void>;
  /** Cron の一括失効削除用。1 件ずつ削除すると N+1 になるため専用メソッドを設ける
   * （§性能）。 */
  deleteByEndpoints(endpoints: string[]): Promise<void>;
}
```

`packages/domain/src/index.ts` に以下を追加する（既存バレルの方針どおり）。

```ts
// PushSubscription 集約
export * from './push-subscription/push-subscription';
export * from './push-subscription/push-subscription-id';
export * from './push-subscription/push-subscription.repository';
```

### Application

#### 期限判定ロジックの移設（確定・P-4）

`apps/web/src/app/_utils/expiry.ts` の計算系関数（判定に業務上の意味を持つもの）を
`packages/application/src/pantry/expiry.ts`（新設）へ移す。

```ts
export const EXPIRY_URGENCY_WITHIN_DAYS = 3;
export function parseExpiryDate(expiresAt: string): Date {
  /* 挙動不変 */
}
export function toLocalMidnight(date: Date): Date {
  /* 挙動不変 */
}
export function getExpiryRemainingDays(expiresAt: string, asOf: Date): number {
  /* 挙動不変 */
}
export type ExpiryUrgency = 'overdue' | 'critical' | 'soon';
export function getExpiryUrgency(remainingDays: number): ExpiryUrgency {
  /* 挙動不変 */
}
export function selectExpiringStocks(
  stocks: StockDto[],
  asOf: Date,
  withinDays: number,
): StockDto[] {
  /* dashboard-view.ts から挙動不変で移動 */
}
```

`formatExpiryUrgencyLabel`（人間可読な文言）と `expiryUrgencyChipClass`（CSS クラス名）は
**UI 表示専用**として `apps/web/src/app/_utils/` に残す（Application 層に表示文字列・CSS
を持ち込まない）。通知本文の文言は P-7 で別途扱う。

新規 UseCase:

```ts
export class GetExpiringStocksUseCase {
  constructor(private readonly pantryRepository: PantryRepository) {}

  async execute(asOf: Date, withinDays: number = EXPIRY_URGENCY_WITHIN_DAYS): Promise<StockDto[]> {
    const pantry = await this.pantryRepository.find();
    return selectExpiringStocks(toPantryDto(pantry).stocks, asOf, withinDays);
  }
}
```

`apps/web/src/app/page.tsx`（ダッシュボード）は `selectExpiringStocks` の直接呼び出しを
やめ、`GetExpiringStocksUseCase` を呼ぶ形に差し替える。

```ts
const [mealPlan, expiringStocks] = await Promise.all([
  new GetCurrentMealPlanUseCase(mealPlanRepository()).execute(now),
  new GetExpiringStocksUseCase(pantryRepository()).execute(now),
]);
```

`apps/web/src/app/_utils/dashboard-view.ts` から `selectExpiringStocks` の実装を削除し、
`@cookpit/application` から re-export するか、呼び出し元を `GetExpiringStocksUseCase`
経由に統一して `dashboard-view.ts` からこの関数自体を削除する（後者を推奨。呼び出し元は
`page.tsx` の 1 箇所のみのため実装コストは小さい）。`/pantry` の `stock-row.tsx` が個々の
在庫の緊急度（`getExpiryRemainingDays` / `getExpiryUrgency`）を算出する箇所も、
`@cookpit/application` の関数を import する形に差し替える（P-4「既存 UI も差し替える」の
対象）。

> **クライアントバンドルへの影響（実装計画への申し送り）**: `stock-row.tsx` は Client
> Component 側で描画されるため、`@cookpit/application` の関数を直接 import すると
> Application 層のコードがクライアントバンドルに含まれる。`getExpiryRemainingDays` 等の
> 対象関数自体は外部依存を持たない純粋関数であり、Repository に依存する UseCase 群を
> import しなければ tree-shaking で他の重い依存（Domain の集約クラス等）まで含まれる
> リスクは小さい想定だが、**実装時にビルド後のバンドルサイズを確認すること**を推奨する
> （断定はしない。確認推奨）。

#### 通知（新規 `packages/application/src/notification/`）

`SendExpiryAlertsUseCase` は Pantry 集約と PushSubscription 集約の両方をまたぐため、
`.claude/rules/domain-layer.md`「集約をまたぐ操作は Application 層の UseCase に置く」に
従い Application 層に置く。Pantry 固有でも PushSubscription 固有でもないため、新規
モジュール `notification/` を切る（`pantry/` にも `push-subscription/` にも属させない）。

```ts
// push-sender.ts（Application 層のポート。Infrastructure が実装する）
export interface PushPayload {
  title: string;
  body: string;
  url: string; // タップ時の遷移先（相対パス。P-7）
}

export type PushSendResult = { ok: true } | { ok: false; reason: 'invalid_subscription' | 'other' };

export interface PushSubscriptionTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSender {
  send(subscription: PushSubscriptionTarget, payload: PushPayload): Promise<PushSendResult>;
}
```

> **設計判断（提案）**: `PushSender` の実装（`web-push` の呼び出し・404/410 判定）は
> Infrastructure に置くが、「404/410 を受け取ったら購読を削除する」という業務判断は
> Application 層（`SendExpiryAlertsUseCase`）が行う。Infrastructure は HTTP ステータスを
> `PushSendResult.reason` へ写像するだけの薄い変換に留める。理由: 「失効した購読を消す」は
> ビジネスポリシーであり、Repository/Infrastructure に業務判断を持たせると
> `.claude/rules/domain-layer.md` の責務分離（DB スキーマ変換のみを Repository が担う）から
> 逸脱するため（P-8 で確定。詳細は §確定事項（続き・P-7〜P-11））。

```ts
// send-expiry-alerts.use-case.ts
export interface SendExpiryAlertsResultDto {
  subscriptionCount: number;
  sentCount: number;
  removedCount: number;
  expiringStockCount: number;
}

export class SendExpiryAlertsUseCase {
  constructor(
    private readonly pantryRepository: PantryRepository,
    private readonly pushSubscriptionRepository: PushSubscriptionRepository,
    private readonly pushSender: PushSender,
  ) {}

  async execute(asOf: Date): Promise<SendExpiryAlertsResultDto> {
    const subscriptions = await this.pushSubscriptionRepository.findAll();
    if (subscriptions.length === 0) {
      return { subscriptionCount: 0, sentCount: 0, removedCount: 0, expiringStockCount: 0 };
    }

    const allExpiring = await new GetExpiringStocksUseCase(this.pantryRepository).execute(asOf);
    // P-10b 確定: 数量 0（numeric(10,3) 丸めで生じる空の在庫）は通知経路だけで除外する。
    // GetExpiringStocksUseCase 側には入れない（ダッシュボード・/pantry の表示を変えないため）。
    const expiringStocks = allExpiring.filter((stock) => stock.amount.value > 0);
    if (expiringStocks.length === 0) {
      return {
        subscriptionCount: subscriptions.length,
        sentCount: 0,
        removedCount: 0,
        expiringStockCount: 0,
      };
    }

    // P-7 確定: formatExpiryUrgencyLabel を流用し先頭 3 件 +「他 n 件」。遷移先は /pantry。
    const payload = buildDigestPayload(expiringStocks);

    const results = await Promise.allSettled(
      subscriptions.map((subscription) => this.pushSender.send(subscription, payload)),
    );

    const staleEndpoints = subscriptions
      .filter((_, index) => {
        const result = results[index];
        return (
          result.status === 'fulfilled' &&
          !result.value.ok &&
          result.value.reason === 'invalid_subscription'
        );
      })
      .map((subscription) => subscription.endpoint);

    if (staleEndpoints.length > 0) {
      await this.pushSubscriptionRepository.deleteByEndpoints(staleEndpoints);
    }

    const sentCount = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;

    return {
      subscriptionCount: subscriptions.length,
      sentCount,
      removedCount: staleEndpoints.length,
      expiringStockCount: expiringStocks.length,
    };
  }
}
```

```ts
// subscribe-to-expiry-alert.use-case.ts
export interface SubscribeToExpiryAlertInputDto {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export class SubscribeToExpiryAlertUseCase {
  constructor(private readonly pushSubscriptionRepository: PushSubscriptionRepository) {}

  async execute(input: SubscribeToExpiryAlertInputDto): Promise<void> {
    const existing = await this.pushSubscriptionRepository.findByEndpoint(input.endpoint);
    const subscription =
      existing === null
        ? PushSubscription.create(input)
        : PushSubscription.reconstruct({ ...existing та鍵を上書き, /* id は既存を維持 */ });
    await this.pushSubscriptionRepository.save(subscription);
  }
}

// unsubscribe-from-expiry-alert.use-case.ts
export class UnsubscribeFromExpiryAlertUseCase {
  constructor(private readonly pushSubscriptionRepository: PushSubscriptionRepository) {}

  async execute(input: { endpoint: string }): Promise<void> {
    await this.pushSubscriptionRepository.deleteByEndpoint(input.endpoint); // 冪等
  }
}
```

> 上記の `SubscribeToExpiryAlertUseCase` の疑似コード中の全角文字列は誤記防止のための
> プレースホルダである。実装時は「既存行があれば `p256dh` / `auth` を新しい値で更新した
> `PushSubscription` を `reconstruct` し、無ければ `create` する」という upsert の意図を
> 素直に実装する。

### api-contract（新規 `packages/api-contract/src/push-subscription.schema.ts`）

```ts
import z from 'zod';

export const pushSubscriptionKeysSchema = z.object({
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

export const subscribeToExpiryAlertSchema = z.object({
  endpoint: z.url(),
  keys: pushSubscriptionKeysSchema,
});

export const unsubscribeFromExpiryAlertSchema = z.object({
  endpoint: z.url(),
});

export const vapidPublicKeyResponseSchema = z.object({
  publicKey: z.string(),
});

export type SubscribeToExpiryAlertBody = z.infer<typeof subscribeToExpiryAlertSchema>;
export type UnsubscribeFromExpiryAlertBody = z.infer<typeof unsubscribeFromExpiryAlertSchema>;
```

`packages/api-contract/src/index.ts` に `export * from './push-subscription.schema';` を
追加する（既存の 1 集約 1 ファイル方針どおり）。

### Infrastructure

#### DB スキーマ（`packages/infrastructure/src/db/schema.ts` へ追加）

```ts
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: text('id').primaryKey(),
  endpoint: text('endpoint').notNull().unique(), // P-8 確定: UNIQUE
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;
```

`pnpm --filter @cookpit/web db:generate` で新規マイグレーション（既存 `0000`〜`0007` に
続く `0008` を想定）を生成する。`packages/infrastructure/tests/testing/create-test-db.ts`
の DDL テンプレートに同じ `CREATE TABLE` を手動で追記する（実装上の罠 6）。

#### Repository 実装

```ts
export class DrizzlePushSubscriptionRepository implements PushSubscriptionRepository {
  constructor(private readonly db: DrizzleClient) {}

  async findAll(): Promise<PushSubscription[]> {
    /* select * from push_subscriptions */
  }
  async findByEndpoint(endpoint: string): Promise<PushSubscription | null> {
    /* ... */
  }

  async save(subscription: PushSubscription): Promise<void> {
    await this.db
      .insert(pushSubscriptions)
      .values(toRow(subscription))
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { p256dh: sql`excluded.p256dh`, auth: sql`excluded.auth` },
      });
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async deleteByEndpoints(endpoints: string[]): Promise<void> {
    if (endpoints.length === 0) return;
    await this.db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, endpoints));
  }
}
```

> **Unit A の罠の再発防止**: `save()` を `onConflictDoUpdate` にする際は、更新すべき列
> （`p256dh` / `auth`）を `set` 句に確実に含める。`drizzle-pantry.repository.ts` の
> `set` 句欠落（stock-edit「実装上の罠」参照）と同種の欠陥がここでも再発し得るため、
> PGlite 回帰テストで「同一 `endpoint` を異なる鍵で再 `save()` → `findByEndpoint()` で
> 新しい鍵が返る」ケースを必ず含める。

#### Push 送信の実装（P-9 確定: `web-push` パッケージを追加する）

```ts
// packages/infrastructure/src/notification/web-push-sender.ts（新設）
import webpush from 'web-push';

export class WebPushSender implements PushSender {
  constructor(vapidPublicKey: string, vapidPrivateKey: string, vapidSubject: string) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  }

  async send(subscription: PushSubscriptionTarget, payload: PushPayload): Promise<PushSendResult> {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
        { timeout: 10_000 }, // post-deploy.yml の AbortSignal.timeout(10_000) と同水準
      );
      return { ok: true };
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        return { ok: false, reason: 'invalid_subscription' };
      }
      return { ok: false, reason: 'other' };
    }
  }
}
```

> **VAPID subject の制約（実装上の罠 8）**: `vapidSubject` は `mailto:` または HTTPS URL
> でなければならない。Apple の `web.push.apple.com` はこれ以外の subject を **403** で
> 拒否する（Chrome/Firefox では通るため気づきにくい）。環境変数として設定する値の形式を
> 実装計画・試験計画に明記すること。

### Presentation（apps/web）

#### Hono ルート（既存の `server/app.ts` へ集約する。§設計判断参照）

```ts
// apps/web/src/server/routes/push.ts（新設）
export const pushRoute = new Hono()
  .get('/vapid-public-key', (c) => c.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? '' }))
  .post('/subscribe', zValidator('json', subscribeToExpiryAlertSchema), async (c) => {
    const body = c.req.valid('json');
    await new SubscribeToExpiryAlertUseCase(pushSubscriptionRepository()).execute({
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    });
    return c.body(null, 204);
  })
  .post('/unsubscribe', zValidator('json', unsubscribeFromExpiryAlertSchema), async (c) => {
    const { endpoint } = c.req.valid('json');
    await new UnsubscribeFromExpiryAlertUseCase(pushSubscriptionRepository()).execute({ endpoint });
    return c.body(null, 204);
  });
```

```ts
// apps/web/src/server/routes/cron.ts（新設）
export const cronRoute = new Hono().get('/expiry-alerts', async (c) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret === undefined || cronSecret === '') {
    console.error('CRON_SECRET is not configured');
    return c.json({ error: 'Server misconfigured' }, 500);
  }
  if (c.req.header('authorization') !== `Bearer ${cronSecret}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const result = await new SendExpiryAlertsUseCase(
    pantryRepository(),
    pushSubscriptionRepository(),
    pushSender(),
  ).execute(new Date());

  console.log('expiry-alerts cron result', result);
  return c.json(result, 200);
});
```

`apps/web/src/server/app.ts` に `.route('/push', pushRoute)` と `.route('/cron',
cronRoute)` を追加する（`app.onError` の変更は不要。本ルートは 401/500 を自前で返すのみで
`InvalidOperationError` / `NotFoundError` を投げない）。

> **設計判断（提案）**: Cron 用のエンドポイントは、Next.js の素の Route Handler として
> `apps/web/src/app/api/cron/expiry-alerts/route.ts` に切り出す案も検討したが、
> 既存の全 API が `server/app.ts` 経由の Hono に集約されている一貫性・既存のルートテスト
> パターン（`apps/web/tests/server/routes/pantry.test.ts` 等）の再利用を優先し、Hono
> ルートとして実装する。認証チェックはこのルートの先頭に**インラインの `if`** として書き、
> `.use()` によるミドルウェア化はしない（既存の「Hono の `.use(` が 0 件」という前提を
> 崩さない）。

#### `sw.ts` への追加（実装上の罠 2 に対する対応）

既存の `runtimeCaching` 配列・`serwist.addEventListeners()` 呼び出しには一切手を入れず、
`push` / `notificationclick` は Serwist のインスタンスとは独立した `self.addEventListener`
として追記する（イベント種別が異なるため、Serwist の fetch/install/activate 処理とは
競合しない）。

```ts
// apps/web/src/app/sw.ts への追記（末尾。既存の serwist.addEventListeners() の後）
self.addEventListener('push', (event) => {
  const data = event.data?.json() as { title: string; body: string; url: string } | undefined;
  if (data === undefined) return;
  event.waitUntil(
    self.registration.showNotification(data.title, { body: data.body, data: { url: data.url } }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';
  event.waitUntil(self.clients.openWindow(url));
});
```

#### 購読 UI（ダッシュボード。確定・P-3）

`apps/web/src/app/_components/dashboard.tsx` の「賞味期限が近い在庫」セクション内に、
新規クライアントコンポーネント `expiry-alert-subscription.tsx` を追加する。

- ボタン押下（ユーザージェスチャ）を起点に `Notification.requestPermission()` →
  `navigator.serviceWorker.ready` → `registration.pushManager.subscribe({
userVisibleOnly: true, applicationServerKey: <VAPID 公開鍵> })` を呼ぶ（iOS の
  「権限要求はユーザージェスチャ起点必須」制約への対応。実装上の罠 3）。
- 成功したら `POST /api/push/subscribe` へ `{ endpoint, keys: { p256dh, auth } }` を送信
  （`PushSubscription.toJSON()` から取得できる形）。
- OFF は `pushManager` から取得した現在の購読の `unsubscribe()` を呼んだ上で
  `POST /api/push/unsubscribe` を呼ぶ。
- 状態管理は `apps/web/src/lib/use-api-action.ts`（既存の `useApiAction` パターン A）を
  再利用する。
- ブラウザが `PushManager` 非対応の場合はボタンを無効化し、非対応である旨を表示する
  （E-4）。

## データフロー

### フロー 1: 購読 ON

1. ユーザーがダッシュボードの ON ボタンを押す（ユーザージェスチャ）。
2. `Notification.requestPermission()` → 許可 → `pushManager.subscribe(...)`。
3. 取得した `PushSubscription`（ブラウザ API。Domain の `PushSubscription` エンティティとは
   別物）から `endpoint` / `keys.p256dh` / `keys.auth` を取り出し
   `POST /api/push/subscribe` を呼ぶ。
4. Hono ルート → `SubscribeToExpiryAlertUseCase` → `PushSubscriptionRepository.save()`
   （upsert）→ 204。

### フロー 2: 日次 Cron によるダイジェスト送信

1. Vercel Cron が `vercel.json` の schedule に従い、JST 08:00 台（P-10a 確定。UTC
   `0 23 * * *`。罠 7 のとおり実際の発火は 08:00〜08:59 のどこか）に
   `GET /api/cron/expiry-alerts` を `Authorization: Bearer $CRON_SECRET` 付きで呼ぶ。
2. `cronRoute` がヘッダを検証 → `SendExpiryAlertsUseCase.execute(new Date())`。
3. `PushSubscriptionRepository.findAll()`（DB 往復 1 回）。購読 0 件なら早期 return。
4. `GetExpiringStocksUseCase.execute(asOf)` が `PantryRepository.find()`（DB 往復 1 回）
   → `selectExpiringStocks` で絞り込み。さらに **`SendExpiryAlertsUseCase` 側で数量 0 の
   在庫を除外する**（P-10b 確定。`GetExpiringStocksUseCase` には入れない）。
   0 件なら早期 return。
5. 購読ごとに `PushSender.send()` を `Promise.allSettled` で並列実行
   （§性能で直列/並列を検討）。
6. 404/410 だった購読の `endpoint` をまとめて `deleteByEndpoints()`（DB 往復 1 回。
   §性能で N+1 回避を扱う）。
7. Cron ルートが `{ subscriptionCount, sentCount, removedCount, expiringStockCount }` を
   200 で返す（Vercel の実行ログにも記録される）。

### フロー 3: 通知タップ

1. `sw.ts` の `notificationclick` ハンドラが `event.notification.data.url`
   （P-7 確定: `/pantry`）を `clients.openWindow()` する。

## API 設計

| メソッド | パス                         | リクエスト                                                     | レスポンス                                                           | ステータス      |
| -------- | ---------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- | --------------- |
| GET      | `/api/push/vapid-public-key` | なし                                                           | `{ publicKey: string }`                                              | 200             |
| POST     | `/api/push/subscribe`        | `{ endpoint: string; keys: { p256dh: string; auth: string } }` | なし                                                                 | 204 / 400       |
| POST     | `/api/push/unsubscribe`      | `{ endpoint: string }`                                         | なし                                                                 | 204 / 400       |
| GET      | `/api/cron/expiry-alerts`    | なし（`Authorization: Bearer $CRON_SECRET`）                   | `{ subscriptionCount, sentCount, removedCount, expiringStockCount }` | 200 / 401 / 500 |

- `subscribe` / `unsubscribe` は認証を持たない（ADR-0003・単一世帯前提）。`endpoint` は
  ブラウザの Push Service が発行する推測困難な URL であり、実務上のリスクは小さいと判断する
  （既存アプリ全体の無認証方針と整合）。
- `subscribe` は同一 `endpoint` に対して冪等（upsert）。`unsubscribe` も冪等（存在しなくても
  204）。
- `cron` エンドポイントの 400 系は無い（リクエストボディを取らないため契約層バリデーション
  対象が無い）。

## DB 設計

新規テーブル `push_subscriptions`（列は §変更後構成 Infrastructure を参照）。

- `endpoint` に `UNIQUE` 制約を付ける（P-8 確定）。これにより Drizzle の
  `onConflictDoUpdate` が使え、同一ブラウザからの再購読が重複行を作らない。
- 追加インデックスは不要（`findAll()` は全件取得、`findByEndpoint()` は `UNIQUE`
  制約が自動的にインデックスを作る）。
- 既存 `stocks` テーブルへの変更は無い（`expires_at` へのインデックス追加は本ユニットでは
  不要。§性能を参照）。
- マイグレーション: `pnpm --filter @cookpit/web db:generate` で `0008` 相当を生成し、
  `.sql` + `meta/0008_snapshot.json` + `meta/_journal.json` の更新をコミットする
  （手動編集しない）。

## フロントエンド設計

「§変更後構成 Presentation」の購読 UI・`sw.ts` 追加を参照。

## バックエンド設計

「§変更後構成 Domain / Application / Infrastructure / Presentation」を参照。

## 実装上の罠

1. **dev で Service Worker が生成されない**（`apps/web/next.config.ts:24-29`。
   `NODE_ENV === 'production'` 分岐）。`pnpm dev` では push を検証できず、「動くはずの
   ものが確認できない」形で詰まる。P-11 で実機確認手順を扱う。
2. **`sw.ts` への `push` / `notificationclick` ハンドラ追加が既存 `runtimeCaching` 4 件を
   壊さないこと。** `docs/tests/saturday-flow.md:83-85`（オフライン再訪問 O-01）がこの
   4 件の挙動を固定している。§変更後構成のとおり、追加ハンドラは Serwist インスタンスとは
   独立した `self.addEventListener` として書き、既存の `Serwist` コンストラクタ引数
   （`runtimeCaching` 配列）には触れない。
3. **iOS の 2 条件。** (a) ホーム画面追加済み PWA でのみ Web Push が動く（`appleWebApp:
{ capable: true }` は満たしているが、ユーザーが実際にホーム画面に追加していなければ
   Push は届かない。UI 側の案内文言の検討は実装計画に委ねる）。(b) 権限要求
   （`Notification.requestPermission()`）はユーザージェスチャ起点でないと失敗する。
   P-3（ダッシュボードのボタン起点にする確定）はこの制約を満たすための設計である。
4. **VAPID 秘密鍵をクライアントへ出さない。** `GET /api/push/vapid-public-key` は公開鍵
   のみを返す。追加する環境変数一覧（`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` /
   `VAPID_SUBJECT` / `CRON_SECRET` / `TZ`）は §移行とリリースに明記する。既存の秘密情報は
   `DATABASE_URL` のみで検証層も無いため（`.env.example` 不在）、ここに書き残さないと
   実装時に失われる。
5. **`TZ=Asia/Tokyo` の設定忘れで静かにズレる。** コード変更が無いぶん、設定漏れが
   「通知が 1 日ずれる」形でしか現れない（気づきにくい）。§移行とリリースに設定手順を
   明記する。**加えて、Vercel Cron の `schedule` フィールド自体は `TZ` 環境変数の影響を
   受けず常に UTC で解釈される。** JST の意図した時刻を UTC に変換して `vercel.json` に
   書く必要があり、`TZ=Asia/Tokyo` を設定したからといって `vercel.json` に JST の値を
   そのまま書いてよいわけではない（別々の設定箇所であることの注意喚起）。
6. **PGlite テスト DDL の手動同期**（`packages/infrastructure/tests/testing/
create-test-db.ts` の `stocks` テーブル定義は L100-113）。`push_subscriptions` の
   `CREATE TABLE` を同ファイルに追記しないと、新規 Repository テストが全滅する。
7. **Vercel Hobby の Cron 制約（2026-08-09 公式ドキュメント確認）。** 日次 1 回まで
   （本設計は日次のため該当しない）。かつ**発火は指定時刻の 1 時間内でブレる**
   （`0 23 * * *` は 23:00:00〜23:59:59 UTC のどこかで実行される）。「毎朝ちょうど 8 時に
   届く」前提の設計・試験観点は組めない（B-6・N-2 の受け入れ基準は「その日のうちに届く」
   程度の粒度にとどめる）。
8. **Apple の VAPID subject 制約（2026-08-09 確認）。** subject が `mailto:` か HTTPS URL
   以外だと `web.push.apple.com` が **403** を返す。Chrome/Firefox では通るため
   「Android で確認して iOS だけ落ちる」形で現れる（P-11 の実機確認手順に iOS を必ず
   含める理由）。
9. **数量 0 の在庫が通知対象に混じりうる。** Unit A のレビュー S-5
   （`docs/reviews/stock-edit.md:156-164`）: `amount.value = 0.0001` は Zod の
   `positive()` も Domain の `<= 0` チェックも通過するが、`amount_value` が
   `numeric(10,3)`（`packages/infrastructure/src/db/schema.ts:150`）であるため DB では
   `0.000` に丸められる。`isEmpty()` が true の Stock が集約に残り得る。
   **P-10b 確定: `SendExpiryAlertsUseCase` で `amount.value > 0` を追加フィルタして除外する。
   `GetExpiringStocksUseCase` には入れない**ため、ダッシュボード・`/pantry` の表示には
   引き続き現れる（既存画面の挙動を変えないための意図的な非対称。S-5 の恒久対処は申し送り）。

## エラー処理

外部 I/O（Push Service への配信）を新設するため、Skill 手順 6 の 5 項目を記載する。

- **(a) リトライ**: 同一 Cron 実行内での自動リトライは行わない（0 回。無限リトライ禁止の
  条件を自明に満たす）。1 日 1 通のダイジェスト再送（P-2 確定）が実質的な「翌日リトライ」
  として機能する設計であり、追加のリトライ機構は不要と判断する。
- **(b) タイムアウト**: `web-push` の `sendNotification` 呼び出しに `timeout: 10_000`
  （ミリ秒）を設定する。`post-deploy.yml` の `AbortSignal.timeout(10_000)`
  （L60）と同水準。未設定時はライブラリ既定のタイムアウト挙動に委ねることになり、
  遅延した Push Service が全体の Cron 実行時間を押し上げるリスクがあるため必ず設定する。
- **(c) 冪等性**: 購読/購読解除は `endpoint` の UNIQUE + upsert / delete-if-exists により
  冪等（P-8）。ダイジェスト送信自体は「毎日再送する」という業務設計そのものが冪等性を
  前提にしていない（同じ内容が再送されることを許容する。P-2）。
- **(d) 部分失敗**: `Promise.allSettled` を使い、一部の購読への送信が失敗しても他の送信・
  Cron 全体の完了を妨げない。404/410 の購読のみ削除し、それ以外の失敗（ネットワーク
  エラー等）は購読を残したまま翌日再送に委ねる。
- **(e) フォールバック**: Push Service（FCM / Apple / Mozilla）全体がダウンした場合の
  ユーザー向け縮退 UI は設けない（通知はベストエフォートであり、アプリ本体の閲覧・編集
  機能には影響しないため）。

契約層の 400（`zValidator`）は `app.onError` を経由せず自前で返す（Unit A で実測確認済みの
規約。本ユニットも同じ）。Cron ルートの 401/500 は `zValidator` を使わないため
ハンドラ内で直接 `c.json(..., ステータス)` を返す。

## ログと監視

Cookpit MVP1 には専用のログ基盤・APM は導入されていない。Cron は UI を持たないバック
グラウンド処理であり失敗が画面に現れないため、最低限の可視性として Cron ルートのハンドラ
内で `console.log(結果サマリ)` / `console.error(異常系)` を出力する（Vercel の実行ログで
確認できる）。送信履歴・開封率の永続化・専用ダッシュボードは対象外（要件定義書の対象外に
対応）。

## セキュリティ

- 認証・認可は対象外（ADR-0003 / ADR-0004。単一世帯前提が継続）。`subscribe` /
  `unsubscribe` は無認証のまま設計する（§API設計参照。`endpoint` の推測困難性に依拠）。
- Cron エンドポイントは Vercel が付与する `Authorization: Bearer $CRON_SECRET` で
  保護する。`CRON_SECRET` 未設定時はフェイルクローズ（500）とし、比較の偶然の安全性
  （`Bearer undefined` との不一致）に依存しない明示的なガードにする。
- VAPID 秘密鍵はサーバー環境変数のみに置き、クライアントへは公開鍵のみを配る
  （実装上の罠 4）。
- 入力値は `zValidator` による Zod スキーマ検証を境界で行う（`endpoint` の URL 形式・
  `p256dh` / `auth` の非空制約）。
- DB アクセスは Drizzle のパラメータ化クエリのみで、SQL インジェクションのリスクは無い。
- Push ペイロードには在庫の表示名・件数程度の低機微情報のみを含め、個人を特定する情報は
  含めない（単一世帯前提のため元々個人識別情報を扱っていない）。

## 性能

L3 かつ外部 I/O（Push Service）を新設するため、性能セクションを厚く書く
（`orchestration-policy.md:194-212`）。

- **想定規模**: 単一世帯・数デバイス（N-8 の想定は 2〜数台）。購読数 N は MVP1 の間、
  2 桁に達しない想定（推定。実測データなし）。
- **送信の直列/並列**: N が小さいため `Promise.allSettled` による**非制限の並列送信**で
  十分（§変更後構成の `SendExpiryAlertsUseCase`）。N が将来的に数十〜数百に増える場合は
  同時接続数を絞るバッチ処理（例: `p-limit` 相当での同時実行数制限）を検討する必要が
  あるが、単一世帯利用の MVP1 ではこの規模には達しない見込みのため本ユニットでは
  導入しない（過剰実装を避ける）。
- **Push Service のタイムアウト**: 1 件あたり 10 秒（§エラー処理 (b)）。N 件を並列実行
  する場合、全体の所要時間は「最も遅い 1 件のタイムアウト」に収束するため、直列実行
  （N × 10 秒の可能性）より並列実行の方が Cron の実行時間予算に対して安全側に働く。
- **Cron の実行時間上限（Vercel Function の制約）**: プラン別の `maxDuration` の既定値・
  上限は変更され得るため本設計では具体的な秒数を断定しない（**確認推奨**）。実装時に
  Vercel ダッシュボードまたは公式ドキュメントで現在の契約プランの上限を確認し、必要なら
  Route Handler / Hono ハンドラ側で `export const maxDuration = <値>;` を明示することを
  実装計画に含める。本設計の処理内容（DB 往復 2〜3 回 + N 件の並列 Push 送信、各 10 秒
  タイムアウト）は、N が 2 桁以内である限り既定の上限内に収まる可能性が高いと考えられる
  が、実測値ではないため確認推奨にとどめる。
- **1 回の Cron での DB 往復回数**: 3 回が上限（① `PushSubscriptionRepository.findAll()`
  ② `PantryRepository.find()`（`GetExpiringStocksUseCase` 経由） ③ 失効購読の
  `deleteByEndpoints()`。③ は失効が無ければ 0 回）。**N+1 の回避**: 失効した購読を
  1 件ずつ `deleteByEndpoint()` でループ削除すると往復回数が購読数 N に比例して増える
  （N+1 リスク）。`deleteByEndpoints(endpoints: string[])` で 1 回の `DELETE ... WHERE
endpoint IN (...)` にまとめる設計にしている（§変更後構成 Domain 参照）。
- **レスポンスタイム予算**: Cron はユーザーが待つ経路ではないため、対話的なレスポンス
  タイム目標（P50/P99 数百 ms 級）は適用しない。実行完了までの目安は「DB 往復 2〜3 回
  （既存の `GetPantryUseCase` 相当のクエリと同程度、確認推奨）+ Push 送信の並列実行
  （最悪ケースで 10 秒のタイムアウト × 1 回分）」であり、既定の Vercel Function
  タイムアウト内に収まる設計を目指す（実測値がないため断定はしない）。
- **負荷試験シナリオの骨子**（外部 I/O 新設のため）: 本番相当の負荷試験基盤は導入しない
  （購読数が小規模なため過剰）。代わりに、`PushSender` をモックした Application 層の
  UseCase テストで「購読 N 件・一部が 404/410 を返すケース」を用意し、
  `deleteByEndpoints` が 1 回のみ呼ばれること（N+1 になっていないこと）と、全体の
  `Promise.allSettled` が例外を投げずに完了することを確認する。実機での Push 到達時間の
  計測は P-11 の手動確認手順に委ね、自動化した負荷試験は対象外とする。

## テスト方針

- Domain（`packages/domain/tests/push-subscription/`）: `PushSubscription.create()` /
  `reconstruct()` の単体テスト（不変条件・空文字拒否）。
- Application（`packages/application/tests/notification/` /
  `packages/application/tests/pantry/`）:
  - `SubscribeToExpiryAlertUseCase` / `UnsubscribeFromExpiryAlertUseCase` の正常系・
    冪等性（同一 `endpoint` の再購読・存在しない `endpoint` の解除）。
  - `SendExpiryAlertsUseCase` のテスト（モック `PushSender` を使用）: 購読 0 件・在庫
    0 件・全件成功・一部 404/410（削除される）・一部ネットワークエラー（削除されない）の
    各ケース。`deleteByEndpoints` が 1 回のみ呼ばれることを確認（N+1 回避の回帰ガード）。
  - `GetExpiringStocksUseCase` のテスト（既存 `selectExpiringStocks` のケースを踏襲。
    閾値境界・期限切れ含む・`expiresAt` null 除外）。
  - 移設後のダッシュボード表示ロジックが挙動不変であることの回帰確認（P-4）。
- api-contract: `subscribeToExpiryAlertSchema` / `unsubscribeFromExpiryAlertSchema` の
  バリデーションテスト（不正 URL・空文字の鍵を reject）。
- Infrastructure（`packages/infrastructure/tests/repositories/`）: PGlite を使い、
  `push_subscriptions` の `save`（新規・upsert 両方）/ `findAll` / `findByEndpoint` /
  `deleteByEndpoint` / `deleteByEndpoints` を確認する回帰テスト。`create-test-db.ts`
  への DDL 追記を忘れると全滅する点をテスト実装時に再確認する（罠 6）。
- apps/web:
  - Cron ルートのテスト: 200（正常）/ 401（不正・欠落 Bearer）/ 500
    （`CRON_SECRET` 未設定）。
  - 購読/購読解除ルートのテスト: 204 / 400（不正な `endpoint` 形式・鍵欠落）。
  - ダッシュボードの購読 ON/OFF コンポーネントテスト（`Notification` /
    `navigator.serviceWorker` / `PushManager` のモックを用意する）: 許可承認・拒否・
    非対応ブラウザの 3 パターン。
  - `sw.ts` の `push` / `notificationclick` ハンドラの単体テスト（Service Worker
    のテスト環境が必要なため、既存のテストインフラで対応可能かを実装計画で確認する）。
  - 既存 `runtimeCaching` 4 件の回帰確認（`docs/tests/saturday-flow.md` のオフライン
    再訪問シナリオが壊れていないこと）。
- 手動検証（P-11。自動テストでは代替できない）: iOS 実機（ホーム画面追加済み PWA）での
  通知許可・購読・Cron 手動実行・通知到達・タップ遷移の一連の確認。

## 移行とリリース

DB マイグレーションは新規追加のみ（既存データへの影響なし）。設定作業を含むため、
以下の順序で進める。

1. **環境変数の準備**（Vercel プロジェクト設定）: `VAPID_PUBLIC_KEY` /
   `VAPID_PRIVATE_KEY`（`web-push generate-vapid-keys` 等で生成） /
   `VAPID_SUBJECT`（`mailto:` または HTTPS URL。実装上の罠 8） / `CRON_SECRET`
   （Vercel Cron 用。ランダムな秘匿文字列） / `TZ=Asia/Tokyo`（P-5）。
2. **DB マイグレーション**（`push_subscriptions` テーブル）を Domain/Application/
   Infrastructure の実装と同一 PR で先にリリースする。
3. **`vercel.json` の追加**（Cron スケジュール定義）。Vercel へのデプロイ後に Cron
   ジョブとして登録される。
4. **期限判定ロジックの移設**（P-4。`expiry.ts` → `@cookpit/application`）は、移設前後で
   ダッシュボード・`/pantry` の表示が挙動不変であることを確認してからリリースする
   （stock-edit の `expiry.ts` 切り出しと同じ「移動 → 動作確認」の順序を踏襲）。
5. **UI（購読 ON/OFF ボタン・`sw.ts` ハンドラ）** は、Cron・API・Domain/Application/
   Infrastructure が揃った後にリリースする。UI だけ先行させると「ON にしても Cron が
   まだ無いので通知が来ない」という不完全な状態がユーザーに見えてしまう。
6. 機能フラグは導入しない（MVP1 の他機能と同様、単一 PR/デプロイでよい規模と判断する）。

## リスク

| #    | リスク                                                                                                        | 影響                                                  | 対策                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| R-1  | dev で SW が生成されないため push 検証ができない（罠 1）                                                      | 実装者が「動くはずのものが確認できない」状態で詰まる  | P-11 の実機確認手順（Preview Deployment 等の本番ビルド環境）を実装計画・試験計画に明記する                   |
| R-2  | `sw.ts` への追記が既存 `runtimeCaching` 4 件を壊す（罠 2）                                                    | オフライン再訪問（O-01）の回帰                        | Serwist インスタンスとは独立した `self.addEventListener` として追記し、既存回帰テストを実行する              |
| R-3  | iOS はホーム画面追加済み PWA + ユーザージェスチャ起点の権限要求でないと動かない（罠 3）                       | iOS だけ通知が届かない                                | P-3（ダッシュボードのボタン起点）で設計上対応済み。P-11 で iOS 実機確認を必須化する                          |
| R-4  | VAPID 秘密鍵が誤ってクライアントに露出する（罠 4）                                                            | 第三者が任意の購読へなりすまし送信可能になる          | 公開鍵専用エンドポイントのみ公開し、秘密鍵はサーバー環境変数のみに置く。実装計画でコードレビュー観点に含める |
| R-5  | `TZ=Asia/Tokyo` の設定忘れ（罠 5）                                                                            | 通知の対象選定が 1 日ずれる。気づきにくい             | 移行とリリース §1 に手順を明記し、実装計画のデプロイ前チェックリストに含める                                 |
| R-6  | `vercel.json` の `schedule` が UTC 固定であることの誤認（罠 5 の追加論点）                                    | JST 08:00 のつもりが別の時刻に発火する                | 設計書に UTC 変換値（`0 23 * * *`）を明記し、実装計画で二重チェックする                                      |
| R-7  | PGlite テスト DDL の手動同期漏れ（罠 6）                                                                      | 新規 Repository テストが全滅する                      | `create-test-db.ts` への追記を実装計画のタスクに明示的に含める                                               |
| R-8  | Vercel Hobby の Cron 発火時刻が 1 時間ブレる（罠 7）                                                          | 「毎朝ちょうど n 時」を前提にした試験観点が成立しない | B-6 のとおり受け入れ基準を「その日のうちに届く」粒度にとどめる                                               |
| R-9  | Apple の VAPID subject 制約により iOS だけ 403 になる（罠 8）                                                 | Android/Chrome では気づけない                         | `VAPID_SUBJECT` を `mailto:` か HTTPS URL に固定し、P-11 の実機確認に iOS を必須で含める                     |
| R-10 | 数量 0（丸め後）の在庫が通知対象に混じる（罠 9）                                                              | 「空の在庫」が通知され、ユーザーが混乱する            | P-10b 確定: `SendExpiryAlertsUseCase` で `amount.value > 0` を追加フィルタする                               |
| R-11 | Cron の重複起動（B-5）                                                                                        | 同日に通知が二重に届く可能性がある                    | 冪等性キーは持たない設計を受容する（P-2 確定に対応）。実運用で頻発する場合は再検討する                       |
| R-12 | `@cookpit/application` の関数をクライアントコンポーネントから import することによるバンドルサイズ増加の可能性 | ページの初期表示が遅くなる可能性                      | 実装時にビルド後のバンドルサイズを確認する（確認推奨。断定しない）                                           |
| R-13 | Push Service（FCM/Apple/Mozilla）全体のダウン                                                                 | 通知が届かない日が発生する                            | フォールバック UI は設けず、翌日の再送に委ねる（§エラー処理 (e)）                                            |

## 費用

2026-08-09 に公式ドキュメントで確認済み。追加費用は発生しない見込み。

- **Vercel Cron**: 全プランで利用可能。Hobby プランは日次 1 回までの制約があるが本設計は
  日次のため該当しない。ジョブ数の上限は 2026-01-20 に全プランで 100/project へ緩和済み。
- **Web Push（VAPID 方式）**: Push Service（FCM / Apple / Mozilla）はいずれも無料。
  **iOS も Apple Developer Program への加入は不要**（VAPID 方式の Web Push であれば
  ネイティブアプリの APNs とは異なり開発者登録が不要）。
- **Neon（DB）**: Free プランは 100 CU-hours/月・5 分アイドルでスケール to ゼロ。日次 1 回・
  数秒の Cron 起床は誤差の範囲。購読テーブルは 2 人分＝数行でストレージ 0.5GB 上限にも
  影響しない。
- **有料化する唯一の経路**: 「日次より高頻度に送りたくなった場合」（Vercel Pro が必要。
  本ユニットのスコープ外）。

## 確定事項

P-1〜P-11 は 2026-08-09 にユーザー確定済み（Orchestrator 経由の確認）。以下に確定内容と、
比較検討した非採用案の記録を残す（`docs/designs/stock-edit.md` の書式に倣う）。
**P-7〜P-11 はいずれも本設計書の推奨どおりに確定した。**

| #     | 論点                      | 確定                                                                               |
| ----- | ------------------------- | ---------------------------------------------------------------------------------- |
| P-1   | 日次 Cron の実行基盤      | Vercel Cron。`Authorization: Bearer $CRON_SECRET` で保護する                       |
| P-2   | 通知の粒度と再送          | 1 日 1 通のダイジェスト・再送あり。送信履歴テーブルは作らない                      |
| P-3   | 購読 ON/OFF UI の置き場所 | ダッシュボードの「賞味期限が近い在庫」セクション内                                 |
| P-4   | 期限判定ロジックの層      | Application 層へ移す。ダッシュボードも新 UseCase に差し替える                      |
| P-5   | タイムゾーン              | `TZ=Asia/Tokyo` を Vercel 環境変数で固定する                                       |
| P-6   | Push 購読情報の位置づけ   | 新規集約として Domain に置く                                                       |
| P-7   | 通知本文の文言と遷移先    | 既存 `formatExpiryUrgencyLabel` を流用。先頭 3 件 +「他 n 件」。タップで `/pantry` |
| P-8   | 購読の同一性と失効        | `endpoint` に UNIQUE 制約。失効時の削除判断は Application 層が行う                 |
| P-9   | VAPID 実装手段            | `web-push` パッケージを追加する                                                    |
| P-10a | Cron 実行時刻             | JST 08:00 台（`vercel.json` に UTC `0 23 * * *`）。発火は 1 時間ブレる             |
| P-10b | 数量 0 の在庫             | 通知経路だけで除外する。ダッシュボード・`/pantry` の表示は変更しない               |
| P-11  | 実機検証手段              | Vercel Preview Deployment + iPhone 実機                                            |

### P-1 の詳細（確定: Vercel Cron）

比較した案:

- 案 A（確定）: Vercel Cron。
- 案 B: GitHub Actions schedule。`weekly-maintenance.yml` の既存パターンがあり分単位の
  精度も出せるが、本番 URL と `CRON_SECRET` を GitHub Secrets に持つ必要があり、設定が
  Vercel と GitHub の 2 箇所に割れる。

**確定: 案 A**。`docs/02-tech-stack.md:34`「デプロイは Vercel 1 つで完結（環境変数も
1 箇所）」に整合する。GitHub Actions 案は既存の `post-deploy.yml` パターン（外部から
HTTPS URL を叩く）を転用できる利点があったが、環境変数の分散管理コストが上回ると判断した。

### P-2 の詳細（確定: 1 日 1 通ダイジェスト再送あり）

比較した案:

- 案 A（確定）: 毎日ダイジェスト再送。
- 案 B: 同一在庫は 1 回だけ通知。`notified_at` 相当の記録先が新たに必要になり L3 の
  スキーマ変更が 1 つ増える。さらに消費・廃棄・期限編集時のリセット条件も設計対象になる。
- 案 C: 在庫ごとに個別通知。件数が増えると通知が大量に出る。

**確定: 案 A**。2 人・在庫数十件の規模では通知疲れは限定的で、「今日の期限」を毎朝
思い出せる利点の方が大きいと判断する。送信履歴テーブルは作らない（追跡コストを避ける）。

### P-3 の詳細（確定: ダッシュボードの当該セクション内）

比較した案:

- 案 A（確定）: ダッシュボードの「賞味期限が近い在庫」セクション内。
- 案 B: 新規 `/settings` 画面。新規画面 + NavBar 導線でスコープが増える。
- 案 C: `/pantry` ページ内。通知のトリガ表示（期限が近い在庫リスト）はダッシュボード側に
  あるため文脈が割れる。

**確定: 案 A**。通知対象そのものの隣に置けて文脈が自明。iOS の「権限要求はユーザー
ジェスチャ起点必須」という制約とも噛み合う（ボタン起点にできる）。

### P-4 の詳細（確定: Application 層へ移し既存 UI も差し替え）

比較した案:

- 案 A（確定）: Application 層へ移して既存 UI も差し替える。
- 案 B: Application 層へ新設するが既存 UI は触らない（apps/web 側は現状維持でロジックを
  複製する）。Unit B のスコープが最小になるが、閾値ロジックが 2 箇所に並存し「画面には
  出るが通知は来ない」型のズレが将来出る。
- 案 C: Cron ルート内に閉じる。CLAUDE.md の層責務（Presentation は UseCase を呼ぶだけ）に
  反する。

**確定: 案 A**。既存 UI に手が入ることでスコープが広がることを受容する。ロジックの
二重管理を避けることを優先した。

### P-5 の詳細（確定: `TZ=Asia/Tokyo` を環境変数で固定）

比較した案:

- 案 A（確定）: `TZ=Asia/Tokyo` を環境変数で固定。
- 案 B: コード上で `Asia/Tokyo` を明示（`Intl.DateTimeFormat` 等）。環境変数に依存せず
  テストで固定できるが、日付計算の実装量が増え、既存のローカルタイム規約
  （`meal-plan.mapper` / `pantry.mapper` / `expiry.ts`）と二重規範になる。
- 案 C: 両方。

**確定: 案 A**。代償は「環境変数の設定忘れで静かに壊れる」依存を作ることであり
（実装上の罠 5）、移行節に設定手順を明記することで対応する。

### P-6 の詳細（確定: 新規集約として Domain に置く）

比較した案:

- 案 A（確定）: 新規集約として Domain に置く。
- 案 B: Infrastructure 限定の技術テーブルとして扱う。購読情報は業務概念ではなく配信
  チャネルであるという整理として筋は通るが、既存 9 テーブルが例外なくドメイン集約と
  1:1 対応している一貫性を破るため、ADR で例外を明示する必要が出る。

**確定: 案 A**。既存の一貫性を優先する。

## 確定事項（続き・P-7〜P-11）

P-7〜P-11 は 2026-08-09 にユーザー確定済み（Orchestrator 経由の確認）。**5 件すべて本設計書の
推奨どおりに確定した**ため、以下は「比較した案 → 推奨」の記述をそのまま残し、確定を明記する。

### P-7 の詳細（確定: 折衷案・遷移先は `/pantry`）

比較した案:

- 案 A: `formatExpiryUrgencyLabel` の 5 パターン（stock-edit の `dashboard.md` P-6
  Option B）をそのまま流用し、対象在庫を列挙する本文を組み立てる。既存文言との一貫性が
  高いが、対象件数が多いと本文が長くなる。
- 案 B: ダイジェスト専用の文言を新設する（例: 「賞味期限が近い在庫が n 件あります」+
  上位数件の要約）。件数が多い場合の要約設計を独立して最適化できるが、ダッシュボードの
  文言と別管理になり、閾値や表現が将来ズレるリスクがある。

**確定**: 案 A をベースに、件数が多い場合は先頭 3 件 + 「他 n 件」で要約する折衷案（推奨どおり）。
タップ時の遷移先は **`/pantry`**（通知の目的が消費・廃棄・編集の行動喚起であり、
Unit A の編集導線がある画面のため）。`/`（ダッシュボード）は表示専用のサマリであり
行動に直結しないため採らない。

これにより通知本文は `apps/web/src/app/_utils/expiry.ts` の `formatExpiryUrgencyLabel` に
依存する。文言を変更する場合はダッシュボードのチップ表示と通知が同時に変わる点に注意する。

### P-8 の詳細（確定: UNIQUE 制約あり・削除判断は Application 層）

比較した案（`endpoint` の一意性）:

- 案 A: `endpoint` に `UNIQUE` 制約を付け、`save()` を upsert にする。
- 案 B: `UNIQUE` 制約を付けず単純追記する。重複購読が積み重なり、同一デバイスに複数回
  通知が届くリスクがある。

**確定**: 案 A（推奨どおり）。

比較した案（失効検知時の削除責務）:

- 案 A: Infrastructure（`PushSender` 実装）が 404/410 を検知してそのまま
  `PushSubscriptionRepository.deleteByEndpoint()` を呼ぶ。実装は単純だが、「失効した
  購読を消す」という業務判断が Infrastructure に漏れる。
- 案 B: `PushSender.send()` が判別可能な結果型（`invalid_subscription` / `other`）を
  返し、Application 層（`SendExpiryAlertsUseCase`）が判断して削除を呼ぶ。

**確定**: 案 B（推奨どおり。§変更後構成で採用した設計）。業務判断は Application 層に置き、
Infrastructure は HTTP ステータスの写像のみを担う。

### P-9 の詳細（確定: `web-push` パッケージ）

比較した案:

- 案 A: `web-push` npm パッケージを追加する。ECDH 鍵合意・AES128GCM 暗号化・VAPID JWT
  署名を実装済みで実績が豊富。Node.js 専用（Edge runtime 非対応）だが、Cron ルートは
  元々 Node.js runtime 前提のため問題にならない。
- 案 B: Web Crypto（`crypto.subtle`）で VAPID JWT・暗号化を自前実装する。追加依存が
  ゼロだが、RFC 8291（Web Push 暗号化）・RFC 8292（VAPID）の実装は非自明であり、
  既存コードベースに前例が無い。

**確定**: 案 A（推奨どおり）。実装ミスによるセキュリティ・信頼性リスクを避けるコストが、
依存追加のコストを上回る。`web-push` は MIT ライセンスで追加費用は発生しない。
依存追加は `orchestration-policy.md` の security-reviewer 起動条件 4 に該当する。

### P-10 の詳細（確定: JST 08:00 台・数量 0 は通知経路だけで除外）

比較した案（実行時刻）:

- 案 A: JST 08:00 台。「今日/明日期限のものに気づいて調理に活かす」利用シーンに合う。
- 案 B: JST 06:00 台。より早め。
- 案 C: JST 21:00 台（前夜）。翌日の献立準備向け。

**確定**: 案 A（推奨どおり。JST 08:00 台。`vercel.json` には UTC `0 23 * * *` と記載する。
実際の発火は罠 7 のとおり 1 時間ブレるため、試験計画では「08:00 ちょうどに届く」ことを
期待値にしない）。

比較した案（数量 0 の在庫の扱い）:

- 案 A: 除外する（`SendExpiryAlertsUseCase` または `GetExpiringStocksUseCase` 内で
  `stock.amount.value > 0` の追加フィルタを入れる）。
- 案 B: 除外しない（現状の表示ロジックと同じ扱いにする）。

**確定**: 案 A（推奨どおり）。含めると「期限が近いが数量ゼロの空の在庫」を通知してしまい
ユーザーが混乱する（罠 9）。

**フィルタの適用範囲も確定した（ユーザー確認・2026-08-09）**: 追加フィルタは
**`SendExpiryAlertsUseCase`（通知経路）だけに入れる**。共通の `GetExpiringStocksUseCase` には
入れない。後者に入れるとダッシュボードと `/pantry` の表示から数量 0 の在庫が消え、
**Unit B が持ち込んでいない既存画面の挙動変更**になるため。結果として
「画面には出るが通知には出ない在庫」が理論上存在しうるが、これは
`numeric(10,3)` 丸め（Unit A レビュー S-5）という別個の既知課題の副作用であり、
本ユニットで表示側まで直すのはスコープ外とする。S-5 の恒久対処は申し送りとする。

### P-11 の詳細（確定: Vercel Preview Deployment + iPhone 実機）

比較した案:

- 案 A: Vercel Preview Deployment（`next build` 相当で SW が生成される本番ビルド環境）を
  使い、iPhone 実機のホーム画面に追加して確認する。`post-deploy.yml` が同種のパターン
  （本番 URL への外部確認）を既に持っており、追加インフラが不要。
- 案 B: ローカルで `pnpm build && pnpm start`（`NODE_ENV=production` で Serwist 有効化）
  した上で ngrok 等の HTTPS トンネルを張り、実機からアクセスする。

**確定**: 案 A（推奨どおり）。既存の `post-deploy.yml` パターンとの親和性が高く、
追加のトンネリングインフラを要しない。iOS 実機でホーム画面追加 → 通知許可 → 購読 → Cron エンドポイントを
認証ヘッダ付きで手動 `curl` する（または Vercel ダッシュボードから Cron を手動トリガー
する）→ 通知到達 → タップ遷移、の一連を試験計画（test-designer）の手動検証手順として
渡す。

## 将来課題・申し送り

- Unit C（stock-undo）: 本ユニットとは独立した操作系統であり、本ユニットの実装は
  Unit C の設計を制約しない。
- Sprint 9 Background Sync との `sw.ts` 共存: 本ユニットは `push` /
  `notificationclick` を追加し、Sprint 9 の Background Sync は `sync` イベントの
  ハンドラを追加すると想定される。いずれも既存の `runtimeCaching`（fetch イベント）とは
  別種のイベントであり、Serwist インスタンスの外側に `self.addEventListener` を積み
  重ねる設計方針を両ユニットで共有すれば、実装順序（本ユニットが先行）に関わらず
  コンフリクトなく共存できる。Sprint 9 着手時に本ユニットの `sw.ts` 差分を前提として
  設計すること。
- 通知本文の文言（P-7）・数量 0 除外の実装範囲（P-10b）のダッシュボードへの波及は確認済み。
  P-7 は既存 `formatExpiryUrgencyLabel` を**共有する**ため、文言変更時はチップ表示と通知が
  同時に変わる。P-10b は通知経路だけに閉じるため**ダッシュボード・`/pantry` の表示は変わらない**。
- **数量 0（`numeric(10,3)` 丸め）の在庫が表示側には残る**（P-10b の意図的な非対称）。
  Unit A レビュー S-5 の恒久対処（`amount.value` の下限を DB 精度に合わせて検証する等）は
  本ユニットのスコープ外。表示側でも除外したくなった場合は `GetExpiringStocksUseCase` に
  フィルタを移し、ダッシュボード・`/pantry` の回帰試験を併せて行うこと。
- `expires_at` へのインデックス追加は、本ユニットの Cron が `PantryRepository.find()`
  （世帯全体取得）を使う限り不要。将来「期限が近い順」に絞る専用クエリが必要になった
  場合（例: 世帯数が増え Pantry 集約が大規模化する場合）に再検討する。
- Push 購読数が将来的に増加する場合（本ユニットの想定規模を超える場合）、§性能で
  触れたバッチ処理・同時実行数制限の導入を検討する。
