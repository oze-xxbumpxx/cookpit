# 実装計画: expiry-alert

- ステータス: ready（要 Orchestrator 確認 2 件。末尾「Orchestrator への申し送り」参照）
- 設計書: `docs/designs/expiry-alert.md`（確定。P-1〜P-12 は 2026-08-09 ユーザー確定）
- 契約設計書: `docs/designs/expiry-alert.contract.md`（確定。§11 実装ファイル一覧を本計画のベースにした）
- ADR: `docs/decisions/ADR-0017-web-push-expiry-alert.md`（方式決定・Migration/Rollback 手順）
- 要件定義: `docs/requirements/expiry-alert.md`
- 実装ルート: **Orchestrator 経路**（`docs/05-roadmap.md:649`。Codex 委譲ではない。
  `implementer` Subagent が本計画を読んで実装する）。`docs/tasks/codex/` は作らない。
- 試験計画: test-designer が `docs/tests/expiry-alert.md` を並行作成中。本計画は
  「テスト計画への参照」節でポインタのみ示し、詳細ケースは先取りしない。

---

## 新規作成・削除ファイル一覧（着手前に Orchestrator が一括承認）

CLAUDE.md「新規ファイルの作成・既存ファイルの削除は、必ず事前に確認を取る」に基づき、
実装着手前にまとめて確認を取る。詳細は各 Step を参照。

### 新規作成（33 ファイル。マイグレーション自動生成 2 件を含む）

| # | ファイル | Step |
| --- | --- | --- |
| 1 | `packages/domain/src/push-subscription/push-subscription.ts` | 1 |
| 2 | `packages/domain/src/push-subscription/push-subscription-id.ts` | 1 |
| 3 | `packages/domain/src/push-subscription/push-subscription.repository.ts` | 1 |
| 4 | `packages/domain/src/push-subscription/push-sender.ts`（申し送り#1・要確認） | 1 |
| 5 | `packages/domain/tests/push-subscription/push-subscription.test.ts` | 1 |
| 6 | `packages/domain/tests/push-subscription/push-subscription-id.test.ts` | 1 |
| 7 | `packages/infrastructure/src/repositories/drizzle-push-subscription.repository.ts` | 2 |
| 8 | `packages/infrastructure/src/notification/web-push-sender.ts` | 2 |
| 9 | `packages/infrastructure/tests/repositories/drizzle-push-subscription.repository.test.ts` | 2 |
| 10 | `packages/infrastructure/tests/notification/web-push-sender.test.ts` | 2 |
| 11 | `apps/web/src/db/migrations/0008_xxxxx.sql`（`drizzle-kit generate` 自動生成） | 2 |
| 12 | `apps/web/src/db/migrations/meta/0008_snapshot.json`（自動生成） | 2 |
| 13 | `packages/application/src/pantry/expiry.ts`（`apps/web` から移設） | 3 |
| 14 | `packages/application/src/pantry/get-expiring-stocks.use-case.ts` | 3 |
| 15 | `packages/application/src/notification/push-sender-types.ts`（申し送り#1で#4に置くなら不要。#1参照） | 3 |
| 16 | `packages/application/src/notification/send-expiry-alerts.use-case.ts` | 3 |
| 17 | `packages/application/src/notification/subscribe-to-expiry-alert.use-case.ts` | 3 |
| 18 | `packages/application/src/notification/unsubscribe-from-expiry-alert.use-case.ts` | 3 |
| 19 | `packages/application/src/notification/index.ts` | 3 |
| 20 | `packages/application/tests/pantry/expiry.test.ts`（既存テストの移設先） | 3 |
| 21 | `packages/application/tests/pantry/get-expiring-stocks.use-case.test.ts` | 3 |
| 22 | `packages/application/tests/notification/send-expiry-alerts.use-case.test.ts` | 3 |
| 23 | `packages/application/tests/notification/subscribe-to-expiry-alert.use-case.test.ts` | 3 |
| 24 | `packages/application/tests/notification/unsubscribe-from-expiry-alert.use-case.test.ts` | 3 |
| 25 | `packages/api-contract/src/push-subscription.schema.ts` | 4 |
| 26 | `packages/api-contract/tests/push-subscription.schema.test.ts` | 4 |
| 27 | `apps/web/src/server/routes/push.ts` | 5 |
| 28 | `apps/web/src/server/routes/cron.ts` | 5 |
| 29 | `apps/web/tests/server/routes/push.test.ts` | 5 |
| 30 | `apps/web/tests/server/routes/cron.test.ts` | 5 |
| 31 | `apps/web/tests/app/_utils/expiry.node.test.ts`（既存テストの分割先。#20 も参照） | 6 |
| 32 | `apps/web/src/app/_components/expiry-alert-subscription.tsx` | 8 |
| 33 | `apps/web/tests/app/_components/expiry-alert-subscription.test.tsx` | 8 |
| 34 | `vercel.json`（リポジトリルート。現状 0 件） | 7 |

`#15` は申し送り#1（`PushSender` port の配置先）の解決方法により作成有無が変わる暫定エントリ。
Step 1/3 の本文で扱いを明記する。

### 削除

| # | ファイル | 理由 | Step |
| --- | --- | --- | --- |
| 1 | `apps/web/src/app/_utils/expiry.ts` | 全 6 export（`EXPIRY_URGENCY_WITHIN_DAYS` / `parseExpiryDate` / `toLocalMidnight` / `ExpiryUrgency` / `getExpiryRemainingDays` / `getExpiryUrgency` / `formatExpiryUrgencyLabel`）を `packages/application/src/pantry/expiry.ts` へ移設し尽くすため（申し送り#2・要確認）。 | 6 |

---

## 概要

roadmap Sprint 8 完了条件 3 件目「期限が近い在庫にアプリを開かずに気づける」を Web Push
（VAPID）+ Vercel Cron の日次ダイジェスト通知で満たす。新規集約 `PushSubscription`（Domain）
を起点に、期限判定ロジックを Presentation から Application 層へ移設し（`GetExpiringStocksUseCase`
新設・ダッシュボードも差し替え）、`SendExpiryAlertsUseCase` が Pantry 集約と PushSubscription
集約をまたいで日次送信を行う。Infrastructure に初めての外部 I/O（`web-push` パッケージ経由の
Push 送信）が入る。`vercel.json` を新設して Cron を JST 08:00 台（UTC `0 23 * * *`）に登録する。

**dev では Service Worker が生成されない**（`apps/web/next.config.ts:24-29`）ため、DB・Domain・
Application・API・既存 UI 差し替えまでを自動テストで固めた後に、`sw.ts` と新規購読 UI（実機
確認が必要な範囲）へ進む順序で Step を並べる。

---

## 前提の確認（着手前に実測すべきこと。本計画作成時点で確認済み）

| # | 確認事項 | 実測結果 |
| --- | --- | --- |
| 1 | `packages/infrastructure/tests/testing/create-test-db.ts` の `stocks` DDL 位置 | `CREATE TABLE stocks` が L100-111、`CREATE INDEX stocks_product_id_idx` が L113、テンプレートリテラルの閉じ `` ` `` が L114。`push_subscriptions` は L113 と L114 の間に追記する |
| 2 | `packages/infrastructure/src/db/schema.ts` の現状テーブル数 | 9 テーブル（`recipes`/`stores`/`products`/`priceRecords`/`mealPlans`/`plannedRecipes`/`shoppingLists`/`shoppingItems`/`stocks`）。追加に必要な `text`/`timestamp`/`pgTable` は全て既存 import 済みで import 文の変更は不要 |
| 3 | `apps/web/src/db/migrations/` の最大連番 | `0007_tranquil_the_anarchist.sql` が最大。次は `0008` |
| 4 | `apps/web/src/server/app.ts` の現状 | 全 35 行。7 ルートを `.route()` でマウント、`onError` は `NotFoundError→404`/`InvalidOperationError→422`/それ以外→500 の 3 分岐のみ。本ユニットはこの `onError` を変更しない |
| 5 | `vercel.json` の存在 | リポジトリに 0 件（新設） |
| 6 | `apps/web/package.json` の依存 | `web-push` は無し。`@hono/zod-validator`・`hono`・`zod` は既存 |
| 7 | `packages/infrastructure/package.json` の依存 | `@cookpit/domain`・`@neondatabase/serverless`・`drizzle-orm` のみ。**`@cookpit/application` への依存は無い** — 申し送り#1 の根拠 |
| 8 | Domain ID VO の実際のパターン | `packages/domain/src/product/product-id.ts` は `Identifier<'ProductId'>` を継承し `static generate()`/`static fromString()` のみを持つ薄い実装（`packages/domain/src/shared/identifier.ts` の共通基底）。`PantryId`/`StockId` も同型。設計書のスケッチ（独自 private フィールドを持つ完全なクラス）より現行コードの方が薄いため、`PushSubscriptionId` は現行パターンに合わせる |
| 9 | Domain/Application/api-contract のテスト配置規約 | `packages/domain/tests/<集約>/`・`packages/application/tests/<集約>/`・`packages/api-contract/tests/`・`packages/infrastructure/tests/repositories/` に `src/` をミラーする形で実在（`packages/domain/src/**/*.test.ts` の co-located 版は無い） |
| 10 | `apps/web/src/app/_utils/expiry.ts` の呼び出し元 | `apps/web/src/app/page.tsx`（Server Component）・`apps/web/src/app/_components/dashboard.tsx`（Server Component、`use client` 無し）・`apps/web/src/app/pantry/_components/stock-row.tsx`（**Client Component**。`pantry-client.tsx`（`use client`）→ `location-group.tsx` → `stock-row.tsx` の経由で確認）。`stock-row.tsx` だけが R-12（バンドルサイズ）の対象 |
| 11 | `apps/web/src/app/_utils/category-color.ts` の `expiryUrgencyChipClass` | 引数は `urgency: string`（`ExpiryUrgency` 型を import していない）。`expiry.ts` の変更と無関係で、確定どおり**触らない** |
| 12 | 既存コンポーネントテストの存在 | `apps/web/tests/app/pantry/_components/stock-row.test.tsx` と `apps/web/tests/app/_components/dashboard.test.tsx` が存在（既存・回帰確認対象。中身は未確認のため実装時に import 差し替えの影響を確認する） |
| 13 | `apps/web/tests/app/_utils/dashboard-view.node.test.ts` の中身 | `selectExpiringStocks`（dashboard-view.ts 由来）と `MEAL_PLAN_STATUS_LABELS`（dashboard-view.ts 由来）、`getExpiryRemainingDays`/`EXPIRY_URGENCY_WITHIN_DAYS`/`getExpiryUrgency`/`formatExpiryUrgencyLabel`（expiry.ts 由来）の 4 系統のテストが 1 ファイルに同居している。Step 6 で系統ごとに移設先を分ける |

---

## 実装順序

`docs/designs/expiry-alert.md` §移行とリリース は「環境変数 → DB migration → vercel.json →
期限判定ロジック移設 → UI」というリリース順序を規定するが、これは**デプロイ順序**であり、
実装順序とは目的が異なる（開発中は dev で検証できる範囲を先に固めたい）。本計画は以下の順序で
実装し、最終的な**マージ・デプロイ**は ADR-0017 §Migration の順序に従う（Step 9 で明記）。

```
Step 1: Domain（PushSubscription 集約 + Repository IF + PushSender port）
  └─→ Step 2: Infrastructure（schema/DDL/migration/Repository実装/WebPushSender）
        └─→ Step 3: Application（期限判定ロジック移設 + GetExpiringStocksUseCase +
                                   notification/ 3 UseCase）
              ├─→ Step 4: api-contract（Zod スキーマ）
              └─→ Step 5: Presentation API（push.ts/cron.ts/app.ts/repositories.ts）
                    └─→ Step 6: 既存 UI 差し替え（page.tsx/dashboard.tsx/stock-row.tsx/
                                 既存テスト分割。dev で検証可能）
                          └─→ Step 7: 環境変数・vercel.json（設定作業。コード変更は小さい）
                                └─→ Step 8: sw.ts + 購読 ON/OFF UI（本番ビルド経路でのみ確認可）
                                      └─→ Step 9: iOS 実機確認（P-11）・リリース手順・品質ゲート
```

Step 1〜6 は `pnpm dev`（Turbopack）で自動テストと型検査だけで完結できる。Step 7〜9 は
Vercel Preview Deployment 以降でないと実地検証できない（実装上の罠 1）。

---

## Step 1: Domain 層 — `PushSubscription` 集約

**依存**: なし（既存 `packages/domain` のみ）

### 対象ファイル

| 種別 | ファイル | 内容 |
| --- | --- | --- |
| 新規 | `packages/domain/src/push-subscription/push-subscription-id.ts` | `PushSubscriptionId`（`ProductId`/`StockId` と同型） |
| 新規 | `packages/domain/src/push-subscription/push-subscription.ts` | `PushSubscription` エンティティ |
| 新規 | `packages/domain/src/push-subscription/push-subscription.repository.ts` | `PushSubscriptionRepository` IF |
| 新規（申し送り#1） | `packages/domain/src/push-subscription/push-sender.ts` | `PushSender` port（`PushPayload`/`PushSendResult`/`PushSubscriptionTarget`/`PushSender`） |
| 追記 | `packages/domain/src/index.ts` | 集約 4 export 追加 |
| 新規 | `packages/domain/tests/push-subscription/push-subscription-id.test.ts` | ID VO テスト |
| 新規 | `packages/domain/tests/push-subscription/push-subscription.test.ts` | エンティティテスト |

### 1-1. `PushSubscriptionId`（前提確認 8 の現行パターンに合わせる）

```ts
// packages/domain/src/push-subscription/push-subscription-id.ts
import { Identifier, generateId } from '../shared/identifier';

export class PushSubscriptionId extends Identifier<'PushSubscriptionId'> {
  static generate(): PushSubscriptionId {
    return new PushSubscriptionId(generateId());
  }

  static fromString(value: string): PushSubscriptionId {
    return new PushSubscriptionId(value);
  }
}
```

設計書のスケッチ（`PushSubscriptionId` に独自の `equals`/`value` を持たせる完全なクラス）
より薄いが、`ProductId`/`StockId`/`PantryId` の現行実装と完全に一致させる（IMP 相当の機械的
補正。設計判断の変更ではない）。

### 1-2. `PushSubscription` エンティティ

設計書 §変更後構成 Domain のインターフェース定義をそのまま実装する。

```ts
// packages/domain/src/push-subscription/push-subscription.ts
import { PushSubscriptionId } from './push-subscription-id';

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
  private constructor(
    private readonly subscriptionId: PushSubscriptionId,
    private readonly subscriptionEndpoint: string,
    private readonly subscriptionP256dh: string,
    private readonly subscriptionAuth: string,
    private readonly subscriptionCreatedAt: Date,
  ) {}

  /** @throws Error endpoint / p256dh / auth のいずれかが空文字の場合 */
  static create(input: CreatePushSubscriptionInput): PushSubscription {
    if (input.endpoint.trim() === '' || input.p256dh.trim() === '' || input.auth.trim() === '') {
      throw new Error('endpoint, p256dh, auth must not be empty');
    }
    return new PushSubscription(
      PushSubscriptionId.generate(),
      input.endpoint,
      input.p256dh,
      input.auth,
      new Date(),
    );
  }

  static reconstruct(props: PushSubscriptionProps): PushSubscription {
    return new PushSubscription(
      props.id,
      props.endpoint,
      props.p256dh,
      props.auth,
      props.createdAt,
    );
  }

  get id(): PushSubscriptionId {
    return this.subscriptionId;
  }
  get endpoint(): string {
    return this.subscriptionEndpoint;
  }
  get p256dh(): string {
    return this.subscriptionP256dh;
  }
  get auth(): string {
    return this.subscriptionAuth;
  }
  get createdAt(): Date {
    return new Date(this.subscriptionCreatedAt);
  }
}
```

`createdAt` の getter は既存 precedent（`Stock.purchasedAt` 等）どおり防御的コピーを返す。

### 1-3. `PushSubscriptionRepository`

```ts
// packages/domain/src/push-subscription/push-subscription.repository.ts
import type { PushSubscription } from './push-subscription';

export interface PushSubscriptionRepository {
  findAll(): Promise<PushSubscription[]>;
  findByEndpoint(endpoint: string): Promise<PushSubscription | null>;
  /** endpoint が既存なら鍵を更新（upsert）。新規なら追加する（P-8）。 */
  save(subscription: PushSubscription): Promise<void>;
  /** 存在しなくても例外を投げない（冪等）。 */
  deleteByEndpoint(endpoint: string): Promise<void>;
  /** Cron の一括失効削除用（N+1 回避）。 */
  deleteByEndpoints(endpoints: string[]): Promise<void>;
}
```

### 1-4. `PushSender` port（申し送り#1 — 配置先を Domain にする理由）

設計書 §変更後構成 Application は `PushSender`（`PushPayload`/`PushSendResult`/
`PushSubscriptionTarget` を含む）を `packages/application/src/notification/push-sender.ts`
に置くとしている。しかし **`packages/infrastructure/package.json` は `@cookpit/domain` にのみ
依存し `@cookpit/application` には依存していない**（前提確認 7）。`WebPushSender`
（Infrastructure）がこのインターフェースを `implements` するには型を import する必要があり、
Application に置いたままだと `packages/infrastructure` に新規パッケージ依存
（`@cookpit/application`）を追加することになる。これは CLAUDE.md/`.claude/rules/domain-layer.md`
の依存方向 `Presentation → Application → Domain ← Infrastructure`（Infrastructure は Domain
にのみ依存する）に反する。

既存の全 Repository インターフェース（`PantryRepository` 等）が Domain に置かれ Infrastructure
が実装する、という現行の依存グラフに合わせ、`PushSender` port も **Domain**
（`packages/domain/src/push-subscription/push-sender.ts`）に置く。「失効した購読を削除する
という**業務判断**は Application 層（`SendExpiryAlertsUseCase`）が行う」という設計書の意図
（§変更後構成 Application の設計判断メモ）は、interface の宣言場所を Domain にしても損なわれない
（判断ロジック自体は UseCase 内に留まる）。

```ts
// packages/domain/src/push-subscription/push-sender.ts
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

この変更により Step 3 の `packages/application/src/notification/` からは `push-sender.ts`
（型のみの再定義ファイル）を削除し、`SendExpiryAlertsUseCase` は `@cookpit/domain` から
`PushSender`/`PushPayload`/`PushSendResult`/`PushSubscriptionTarget` を import する
（新規ファイル一覧の #15 は不要になる）。

**この配置変更は「設計判断の変更ではなく機械的な整合」と判断したが、設計書のコード例の
配置（Application）と異なるため、末尾の申し送りに記録し実装着手前に Orchestrator の確認を
得ること。**

### 1-5. `domain/src/index.ts` 追記

```ts
// PushSubscription 集約
export * from './push-subscription/push-subscription';
export * from './push-subscription/push-subscription-id';
export * from './push-subscription/push-subscription.repository';
export * from './push-subscription/push-sender';
```

### 追加テスト

- `PushSubscriptionId`: `generate()` が異なる値を返す／`fromString` の往復／`equals` の真偽
- `PushSubscription.create()`: `endpoint`/`p256dh`/`auth` いずれかが空文字（空白のみ含む）で
  throw／正常系で全プロパティが設定される／`id` は毎回異なる
- `PushSubscription.reconstruct()`: 空文字でも throw しない（DB からの復元は検証を経ない）
- 防御性: `createdAt` の getter が防御的コピーを返す

### 完了条件

```bash
pnpm --filter @cookpit/domain test
pnpm --filter @cookpit/domain type-check
pnpm lint
```

- `packages/domain` 内の他ファイルへの依存が `node:crypto`（`generateId` 経由）のみ
  （Drizzle・HTTP・`web-push` の型を持ち込んでいない）
- `push-sender.ts` に `web-push` 固有の型（`webpush.PushSubscription` 等）が一切現れないこと
  （Domain は Infrastructure の実装詳細を知らない）

---

## Step 2: Infrastructure 層 — DB スキーマ・Repository・Push 送信実装

**依存**: Step 1（`PushSubscription`/`PushSubscriptionRepository`/`PushSender` の型）

### 対象ファイル

| 種別 | ファイル | 内容 |
| --- | --- | --- |
| 追記 | `packages/infrastructure/src/db/schema.ts` | `pushSubscriptions` テーブル定義・型 |
| 追記 | `packages/infrastructure/tests/testing/create-test-db.ts` | DDL 追記（罠 6） |
| 新規 | `apps/web/src/db/migrations/0008_xxxxx.sql` + `meta/0008_snapshot.json` | `drizzle-kit generate` 自動生成 |
| 追記 | `apps/web/src/db/migrations/meta/_journal.json` | 自動更新 |
| 新規 | `packages/infrastructure/src/repositories/drizzle-push-subscription.repository.ts` | `DrizzlePushSubscriptionRepository` |
| 新規 | `packages/infrastructure/src/notification/web-push-sender.ts` | `WebPushSender` |
| 追記 | `packages/infrastructure/src/index.ts` | 2 export 追加 |
| 追記 | `packages/infrastructure/package.json` | `web-push` 依存追加（下記 2-5 参照） |
| 新規 | `packages/infrastructure/tests/repositories/drizzle-push-subscription.repository.test.ts` | PGlite 統合テスト |
| 新規 | `packages/infrastructure/tests/notification/web-push-sender.test.ts` | `web-push` のモックテスト |

### 2-1. `schema.ts` 追記（契約書 §2 と同一。確定形）

```ts
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: text('id').primaryKey(),
  endpoint: text('endpoint').notNull().unique(), // P-8 確定: UNIQUE。onConflictDoUpdate の target
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscriptionRow = typeof pushSubscriptions.$inferInsert;
```

`text`/`timestamp`/`pgTable` は先頭の import 文にすべて含まれているため、import 文の変更は
不要（前提確認 2）。既存 9 テーブルの定義は一切変更しない。

### 2-2. `create-test-db.ts` DDL 追記（罠 6・必須）

`DDL` 定数の **L113（`CREATE INDEX IF NOT EXISTS stocks_product_id_idx ...`）の後、L114
（閉じ `` ` ``）の前**に追記する（前提確認 1 で実測済み）。

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id text PRIMARY KEY,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
```

### 2-3. マイグレーション生成

```bash
pnpm --filter @cookpit/web db:generate
```

- 生成先: `apps/web/src/db/migrations/`（`0008_xxxxx.sql`。現状の最大連番 `0007` の次）
- 生成された `.sql` に `CREATE TABLE "push_subscriptions"` と `UNIQUE` 制約（`endpoint`）が
  含まれること
- `meta/_journal.json` に新エントリが追記され、既存 `0000`〜`0007` のエントリは変更しないこと
- 既存 9 テーブルへの `ALTER` 文が含まれないこと
- 生成ファイルは手動編集せずそのままコミットする

### 2-4. `DrizzlePushSubscriptionRepository`

```ts
// packages/infrastructure/src/repositories/drizzle-push-subscription.repository.ts
import { eq, inArray } from 'drizzle-orm';
import { PushSubscription } from '@cookpit/domain/src/push-subscription/push-subscription';
import { PushSubscriptionId } from '@cookpit/domain/src/push-subscription/push-subscription-id';
import type { PushSubscriptionRepository } from '@cookpit/domain/src/push-subscription/push-subscription.repository';
import type { DrizzleClient } from '../db/client';
import { pushSubscriptions, type PushSubscriptionRow } from '../db/schema';

export class DrizzlePushSubscriptionRepository implements PushSubscriptionRepository {
  constructor(private readonly db: DrizzleClient) {}

  async findAll(): Promise<PushSubscription[]> {
    const rows = await this.db.select().from(pushSubscriptions);
    return rows.map((row) => this.toEntity(row));
  }

  async findByEndpoint(endpoint: string): Promise<PushSubscription | null> {
    const [row] = await this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);
    return row === undefined ? null : this.toEntity(row);
  }

  async save(subscription: PushSubscription): Promise<void> {
    await this.db
      .insert(pushSubscriptions)
      .values({
        id: subscription.id.value,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        createdAt: subscription.createdAt,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { p256dh: subscription.p256dh, auth: subscription.auth },
      });
  }

  async deleteByEndpoint(endpoint: string): Promise<void> {
    await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }

  async deleteByEndpoints(endpoints: string[]): Promise<void> {
    if (endpoints.length === 0) return;
    await this.db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, endpoints));
  }

  private toEntity(row: PushSubscriptionRow): PushSubscription {
    return PushSubscription.reconstruct({
      id: PushSubscriptionId.fromString(row.id),
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      createdAt: row.createdAt,
    });
  }
}
```

**Unit A の罠の再発防止（設計書で明示的に警告済み）**: `save()` の `onConflictDoUpdate` の
`set` 句に `p256dh`/`auth` を必ず含める（`stock-edit` の `drizzle-pantry.repository.ts`
の `set` 句欠落と同種の欠陥が再発しやすい箇所）。PGlite テストで
「同一 `endpoint` を異なる鍵で再 `save()` → `findByEndpoint()` が新しい鍵を返す」を必ず
カバーする。

`deleteByEndpoints([])` は空配列ガードを入れる（`inArray` に空配列を渡すと SQL が壊れる
ため。`Promise.allSettled` の結果 0 件失効時に呼ばれても安全にする）。

### 2-5. `WebPushSender`（`web-push` 依存の追加先の訂正）

設計書は「`web-push` パッケージを追加する」（P-9）とだけ確定しており、追加先パッケージまでは
明記していない。**実際に `import webpush from 'web-push'` を書くのは
`packages/infrastructure/src/notification/web-push-sender.ts` であるため、`web-push` は
`packages/infrastructure/package.json` の `dependencies` に追加する。** pnpm workspace は
phantom dependency を許さないため、`apps/web/package.json` にだけ追加しても
`packages/infrastructure` からは解決できない（前提確認 7 の依存関係とも整合）。

```bash
pnpm --filter @cookpit/infrastructure add web-push
```

型定義の要否を実装時に確認する（`web-push` 本体に型が同梱されていなければ
`pnpm --filter @cookpit/infrastructure add -D @types/web-push` を追加する）。

```ts
// packages/infrastructure/src/notification/web-push-sender.ts
import webpush from 'web-push';
import type {
  PushPayload,
  PushSendResult,
  PushSender,
  PushSubscriptionTarget,
} from '@cookpit/domain/src/push-subscription/push-sender';

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
        { timeout: 10_000 },
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

> **VAPID subject の制約（罠 8）**: `vapidSubject` は `mailto:` または HTTPS URL でなければ
> ならない。Apple の `web.push.apple.com` はこれ以外だと 403 を返す。環境変数の値の形式は
> Step 7 で明記する。
>
> **`WebPushSender` のコンストラクタが不正な鍵で throw する場合の扱い**: `webpush.setVapidDetails`
> は鍵の形式が不正だと同期的に例外を投げる。この例外は `pushSender()`（Step 5 で追加する
> `repositories.ts` のファクトリ）呼び出し時に発生し、Hono ハンドラ内で catch されないため
> `apps/web/src/server/app.ts` の `onError` 3 段目（500 `Internal Server Error`）に落ちる。
> これは E-7（VAPID 未設定時に 500 を返す）の要求を結果的に満たすが、`cron.ts` の
> `CRON_SECRET` チェックのような明示的なガードではない点に注意する（契約書 §5-3 の
> 「予期しない例外」バケットに分類される）。

### 2-6. `infrastructure/src/index.ts` 追記

```ts
export * from './repositories/drizzle-push-subscription.repository';
export * from './notification/web-push-sender';
```

### 追加テスト

`packages/infrastructure/tests/repositories/drizzle-push-subscription.repository.test.ts`
（PGlite。`createTestDb()` 使用）:

- 空 DB での `findAll()` → `[]`
- `save()` → `findAll()`/`findByEndpoint()`: 新規購読が正しく復元される
- 同一 `endpoint` を異なる `p256dh`/`auth` で 2 回 `save()` → `findByEndpoint()` が新しい鍵を
  返す（行数は増えない。UNIQUE + upsert の回帰テスト。§実装要点参照）
- `endpoint` の `UNIQUE` 制約（Drizzle を経由しない直接 INSERT の重複が拒否される）
- `deleteByEndpoint()`: 存在する/しない両方で例外を投げない
- `deleteByEndpoints([])`: 例外を投げず何もしない
- `deleteByEndpoints([...])`: 複数件を 1 回の `DELETE` でまとめて削除する

`packages/infrastructure/tests/notification/web-push-sender.test.ts`（`web-push` をモック）:

- `send()` が成功時 `{ ok: true }` を返す
- `sendNotification` が `statusCode: 404`/`410` を投げると `{ ok: false, reason: 'invalid_subscription' }`
- それ以外のエラー（ネットワークエラー等）では `{ ok: false, reason: 'other' }`
- コンストラクタが `webpush.setVapidDetails` を正しい引数で呼ぶこと

### 完了条件

```bash
pnpm --filter @cookpit/infrastructure test
pnpm --filter @cookpit/infrastructure type-check
pnpm lint
```

- `schema.ts`/`create-test-db.ts` に既存 9 テーブル分の変更がないこと
- `create-test-db.ts` への DDL 追記漏れがあると本 Step のテストが全滅する（罠 6 の即時検知）
- `packages/infrastructure/package.json` に `web-push` が追加されていること

---

## Step 3: Application 層 — 期限判定ロジック移設 + 通知 UseCase

**依存**: Step 1（Domain の型）。実際の DI 配線確認は Step 2（Repository 実装）完了後が
望ましいが、型検査は Step 1 のみで通る。

### 対象ファイル

| # | 種別 | ファイル | 内容 |
| --- | --- | --- | --- |
| 1 | 新規 | `packages/application/src/pantry/expiry.ts` | `apps/web/_utils/expiry.ts` の全 6 export を移設（申し送り#2） |
| 2 | 新規 | `packages/application/src/pantry/get-expiring-stocks.use-case.ts` | `GetExpiringStocksUseCase` |
| 3 | 追記 | `packages/application/src/pantry/index.ts` | 2 export 追加 |
| 4 | 新規 | `packages/application/src/notification/send-expiry-alerts.use-case.ts` | `SendExpiryAlertsUseCase` + `SendExpiryAlertsResultDto` |
| 5 | 新規 | `packages/application/src/notification/subscribe-to-expiry-alert.use-case.ts` | `SubscribeToExpiryAlertUseCase` |
| 6 | 新規 | `packages/application/src/notification/unsubscribe-from-expiry-alert.use-case.ts` | `UnsubscribeFromExpiryAlertUseCase` |
| 7 | 新規 | `packages/application/src/notification/index.ts` | バレル |
| 8 | 追記 | `packages/application/src/index.ts` | `export * from './notification'` 追加 |
| 9 | 新規 | `packages/application/tests/pantry/expiry.test.ts` | 移設テスト（前提確認 13） |
| 10 | 新規 | `packages/application/tests/pantry/get-expiring-stocks.use-case.test.ts` | InMemory テスト |
| 11 | 新規 | `packages/application/tests/notification/send-expiry-alerts.use-case.test.ts` | モック `PushSender` |
| 12 | 新規 | `packages/application/tests/notification/subscribe-to-expiry-alert.use-case.test.ts` | InMemory テスト |
| 13 | 新規 | `packages/application/tests/notification/unsubscribe-from-expiry-alert.use-case.test.ts` | InMemory テスト |

### 3-1. `expiry.ts` の移設（申し送り#2 — `formatExpiryUrgencyLabel` の扱い）

設計書 P-4 は「`formatExpiryUrgencyLabel`（人間可読な文言）は UI 表示専用として
`apps/web/src/app/_utils/` に残す」と確定している。一方 P-7 は「通知本文は
`formatExpiryUrgencyLabel` に依存する」と確定しており、`buildDigestPayload`
（`SendExpiryAlertsUseCase.execute()` 内、Application 層）がこの関数を呼ぶ必要がある。

`packages/application` は `apps/web` に依存できない（依存方向が逆）ため、P-4 の記述どおり
`apps/web` に残したままでは P-7 の実装が成立しない。**本計画は `formatExpiryUrgencyLabel` も
含めて全 6 export を `packages/application/src/pantry/expiry.ts` へ移設し、`apps/web` 側は
`@cookpit/application` から import する形に統一する案を採る**（他の 5 関数と同じ移設パターンに
揃え、ロジックの二重管理を避ける）。これは P-4 の「UI 表示専用として残す」という字句とは
矛盾するため、**実装着手前に Orchestrator の確認を得ること**（申し送り#2）。

```ts
// packages/application/src/pantry/expiry.ts（apps/web/_utils/expiry.ts から移設。挙動不変）
import type { StockDto } from './pantry.dto';

export const EXPIRY_URGENCY_WITHIN_DAYS = 3;

export function parseExpiryDate(expiresAt: string): Date {
  return new Date(`${expiresAt}T00:00:00`);
}

export function toLocalMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export type ExpiryUrgency = 'overdue' | 'critical' | 'soon';

export function getExpiryRemainingDays(expiresAt: string, asOf: Date): number {
  const diff = parseExpiryDate(expiresAt).getTime() - toLocalMidnight(asOf).getTime();
  return Math.round(diff / (24 * 60 * 60 * 1000));
}

export function getExpiryUrgency(remainingDays: number): ExpiryUrgency {
  if (remainingDays < 0) return 'overdue';
  if (remainingDays <= 1) return 'critical';
  return 'soon';
}

export function formatExpiryUrgencyLabel(remainingDays: number): string {
  if (remainingDays < 0) return '期限切れ';
  if (remainingDays === 0) return '本日まで';
  if (remainingDays === 1) return '明日まで';
  return `あと${remainingDays}日`;
}

export function selectExpiringStocks(
  stocks: StockDto[],
  asOf: Date,
  withinDays: number,
): StockDto[] {
  const threshold = toLocalMidnight(asOf);
  threshold.setDate(threshold.getDate() + withinDays);

  return stocks
    .filter((stock): stock is StockDto & { expiresAt: string } => stock.expiresAt !== null)
    .filter((stock) => parseExpiryDate(stock.expiresAt) <= threshold)
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}
```

`apps/web/src/app/_utils/expiry.ts` は全 export を移設し尽くすため**ファイルごと削除**する
（新規作成・削除ファイル一覧「削除 #1」）。`expiryUrgencyChipClass`（`category-color.ts`）は
無関係のため変更しない（前提確認 11）。

### 3-2. `GetExpiringStocksUseCase`

```ts
// packages/application/src/pantry/get-expiring-stocks.use-case.ts
import type { PantryRepository } from '@cookpit/domain/src/pantry/pantry.repository';
import { EXPIRY_URGENCY_WITHIN_DAYS, selectExpiringStocks } from './expiry';
import type { StockDto } from './pantry.dto';
import { toPantryDto } from './pantry.mapper';

export class GetExpiringStocksUseCase {
  constructor(private readonly pantryRepository: PantryRepository) {}

  async execute(asOf: Date, withinDays: number = EXPIRY_URGENCY_WITHIN_DAYS): Promise<StockDto[]> {
    const pantry = await this.pantryRepository.find();
    return selectExpiringStocks(toPantryDto(pantry).stocks, asOf, withinDays);
  }
}
```

### 3-3. `pantry/index.ts` 追記

```ts
export * from './expiry';
export * from './get-expiring-stocks.use-case';
```

### 3-4. `notification/` 3 UseCase（設計書 §変更後構成 Application のコードをそのまま実装）

```ts
// subscribe-to-expiry-alert.use-case.ts
import { PushSubscription } from '@cookpit/domain/src/push-subscription/push-subscription';
import type { PushSubscriptionRepository } from '@cookpit/domain/src/push-subscription/push-subscription.repository';

export interface SubscribeToExpiryAlertInputDto {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** endpoint が既存なら鍵を更新（upsert）、無ければ新規購読を作成する（P-8）。 */
export class SubscribeToExpiryAlertUseCase {
  constructor(private readonly pushSubscriptionRepository: PushSubscriptionRepository) {}

  async execute(input: SubscribeToExpiryAlertInputDto): Promise<void> {
    const existing = await this.pushSubscriptionRepository.findByEndpoint(input.endpoint);
    const subscription =
      existing === null
        ? PushSubscription.create(input)
        : PushSubscription.reconstruct({
            id: existing.id,
            endpoint: input.endpoint,
            p256dh: input.p256dh,
            auth: input.auth,
            createdAt: existing.createdAt,
          });
    await this.pushSubscriptionRepository.save(subscription);
  }
}
```

```ts
// unsubscribe-from-expiry-alert.use-case.ts
import type { PushSubscriptionRepository } from '@cookpit/domain/src/push-subscription/push-subscription.repository';

export interface UnsubscribeFromExpiryAlertInputDto {
  endpoint: string;
}

/** 冪等。存在しない endpoint でも例外を投げない。 */
export class UnsubscribeFromExpiryAlertUseCase {
  constructor(private readonly pushSubscriptionRepository: PushSubscriptionRepository) {}

  async execute(input: UnsubscribeFromExpiryAlertInputDto): Promise<void> {
    await this.pushSubscriptionRepository.deleteByEndpoint(input.endpoint);
  }
}
```

```ts
// send-expiry-alerts.use-case.ts
import type { PantryRepository } from '@cookpit/domain/src/pantry/pantry.repository';
import type {
  PushPayload,
  PushSender,
} from '@cookpit/domain/src/push-subscription/push-sender';
import type { PushSubscriptionRepository } from '@cookpit/domain/src/push-subscription/push-subscription.repository';
import { GetExpiringStocksUseCase } from '../pantry/get-expiring-stocks.use-case';
import { formatExpiryUrgencyLabel, getExpiryRemainingDays } from '../pantry/expiry';
import type { StockDto } from '../pantry/pantry.dto';

export interface SendExpiryAlertsResultDto {
  subscriptionCount: number;
  sentCount: number;
  removedCount: number;
  expiringStockCount: number;
}

const DIGEST_HEAD_COUNT = 3; // P-7 確定: 先頭 3 件 + 「他 n 件」
const DIGEST_TAP_URL = '/pantry'; // P-7 確定

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
    // P-10b 確定: 数量 0（numeric(10,3) 丸め）は通知経路だけで除外する（罠 9）。
    const expiringStocks = allExpiring.filter((stock) => stock.amount.value > 0);
    if (expiringStocks.length === 0) {
      return {
        subscriptionCount: subscriptions.length,
        sentCount: 0,
        removedCount: 0,
        expiringStockCount: 0,
      };
    }

    const payload = buildDigestPayload(expiringStocks, asOf);

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

function buildDigestPayload(stocks: StockDto[], asOf: Date): PushPayload {
  const head = stocks.slice(0, DIGEST_HEAD_COUNT);
  const rest = stocks.length - head.length;
  const lines = head.map((stock) => {
    const remainingDays = getExpiryRemainingDays(stock.expiresAt as string, asOf);
    return `${stock.displayName}（${formatExpiryUrgencyLabel(remainingDays)}）`;
  });
  const body = rest > 0 ? `${lines.join(' / ')} / 他${rest}件` : lines.join(' / ');

  return { title: '賞味期限が近い在庫があります', body, url: DIGEST_TAP_URL };
}
```

`stock.expiresAt as string` は `expiringStocks`（`selectExpiringStocks` 済み）が
`expiresAt !== null` の在庫のみを含む不変条件に依拠する（`selectExpiringStocks` 内部の
type predicate と同じ前提）。通知タイトル・本文の日本語文言は設計書に明記が無いため
本計画での補完であり、test-designer/reviewer が文言レビューの対象に含めること。

### 3-5. `notification/index.ts`

```ts
export * from './send-expiry-alerts.use-case';
export * from './subscribe-to-expiry-alert.use-case';
export * from './unsubscribe-from-expiry-alert.use-case';
```

`push-sender.ts` は置かない（申し送り#1 の解決により Domain へ移設済みのため）。

### 3-6. `application/src/index.ts` 追記

```ts
export * from './notification';
```

### 既存テストの移設（前提確認 13 に対応）

`apps/web/tests/app/_utils/dashboard-view.node.test.ts` のうち以下を
`packages/application/tests/pantry/expiry.test.ts` へ**そのまま移設**する（アサーション内容は
変更不要、import パスのみ `packages/application/src/pantry/expiry`/`pantry.dto` に差し替え）。

- `describe('selectExpiringStocks', ...)`（全 5 ケース）
- `describe('getExpiryRemainingDays', ...)`（EU-01〜EU-08）
- `describe('EXPIRY_URGENCY_WITHIN_DAYS', ...)`（EXP-03）
- `describe('getExpiryUrgency', ...)`（EU-09〜EU-12）
- `describe('formatExpiryUrgencyLabel', ...)`（EU-13〜EU-18）

残す `describe('MEAL_PLAN_STATUS_LABELS', ...)` は Step 6 で扱う（`dashboard-view.ts` に
残るため）。

### 追加テスト（新規分）

- `GetExpiringStocksUseCase`: 空 Pantry で `[]`／閾値境界／`expiresAt` null 除外（移設した
  `selectExpiringStocks` テストと重複しない範囲で UseCase 経由の疎通のみ確認する軽量なテストでよい）
- `SubscribeToExpiryAlertUseCase`: 新規 `endpoint` で作成／既存 `endpoint` で `id` を保持した
  まま鍵が更新される（upsert の意図が UseCase レベルでも壊れていないことの確認）
- `UnsubscribeFromExpiryAlertUseCase`: 存在する/しない `endpoint` の両方で例外を投げない
- `SendExpiryAlertsUseCase`（モック `PushSender`）: 購読 0 件／在庫 0 件／数量 0 のみの在庫
  （P-10b の除外）／全件成功／一部 404-410（`deleteByEndpoints` が 1 回だけ呼ばれる。N+1
  回避の回帰ガード）／一部ネットワークエラー（購読を消さない）／`Promise.allSettled` が
  一部 reject でも UseCase 全体を失敗させない

### 完了条件

```bash
pnpm --filter @cookpit/application test
pnpm --filter @cookpit/application type-check
pnpm lint
```

- `apps/web/tests/app/_utils/dashboard-view.node.test.ts` から移設したテストケースが
  1 件も欠落せず `packages/application/tests/pantry/expiry.test.ts` に存在すること
- `deleteByEndpoints` が N+1 にならないこと（モックの呼び出し回数アサーション）がテストに
  含まれること

---

## Step 4: api-contract 層 — Zod スキーマ

**依存**: なし（型は独立に定義可能。Step 3 の DTO 構造との整合は目視確認）

### 対象ファイル

| 種別 | ファイル | 内容 |
| --- | --- | --- |
| 新規 | `packages/api-contract/src/push-subscription.schema.ts` | 契約書 §3.1 の確定形（6 スキーマ + 型） |
| 追記 | `packages/api-contract/src/index.ts` | 1 export 追加 |
| 新規 | `packages/api-contract/tests/push-subscription.schema.test.ts` | 契約書 §10.1 準拠 |

`push-subscription.schema.ts` の内容は `docs/designs/expiry-alert.contract.md` §3.1 の
コードをそのまま実装する（`pushEndpointSchema`/`pushSubscriptionKeysSchema`/
`subscribeToExpiryAlertSchema`/`unsubscribeFromExpiryAlertSchema`/
`vapidPublicKeyResponseSchema`/`expiryAlertsCronResultSchema`）。本計画では転記しない
（契約設計書が正典）。

### `index.ts` 追記

```ts
export * from './push-subscription.schema';
```

既存 7 行は変更しない。

### 完了条件

```bash
pnpm --filter @cookpit/api-contract test
pnpm --filter @cookpit/api-contract type-check
```

- 契約書 §10.1 の観点表（`endpoint` の https 限定・2048 文字上限、`p256dh`/`auth` の
  base64url 文字集合、`expiryAlertsCronResultSchema` の非負整数）がテストされていること

---

## Step 5: Presentation 層（API）— Hono ルート

**依存**: Step 2（`DrizzlePushSubscriptionRepository`/`WebPushSender`）、Step 3
（3 UseCase）、Step 4（Zod スキーマ）

### 対象ファイル

| 種別 | ファイル | 内容 |
| --- | --- | --- |
| 新規 | `apps/web/src/server/routes/push.ts` | `pushRoute`（契約書 §1・§5-2） |
| 新規 | `apps/web/src/server/routes/cron.ts` | `cronRoute`（契約書 §1.3・§5-3） |
| 追記 | `apps/web/src/server/app.ts` | `.route('/push', pushRoute)` / `.route('/cron', cronRoute)` 追加 |
| 追記 | `apps/web/src/server/repositories.ts` | `pushSubscriptionRepository()`/`pushSender()` 追加 |
| 新規 | `apps/web/tests/server/routes/push.test.ts` | 契約書 §10.2 準拠 |
| 新規 | `apps/web/tests/server/routes/cron.test.ts` | 契約書 §10.2 準拠 |

### 5-1. `repositories.ts` 追記

```ts
import { getDb } from '@/db/client';
import {
  DrizzleMealPlanRepository,
  DrizzlePantryRepository,
  DrizzleProductRepository,
  DrizzlePushSubscriptionRepository,
  DrizzleRecipeRepository,
  DrizzleShoppingListRepository,
  DrizzleStoreRepository,
  WebPushSender,
} from '@cookpit/infrastructure';

// ...既存 6 関数は変更なし...

export function pushSubscriptionRepository(): DrizzlePushSubscriptionRepository {
  return new DrizzlePushSubscriptionRepository(getDb());
}

export function pushSender(): WebPushSender {
  return new WebPushSender(
    process.env.VAPID_PUBLIC_KEY ?? '',
    process.env.VAPID_PRIVATE_KEY ?? '',
    process.env.VAPID_SUBJECT ?? '',
  );
}
```

### 5-2. `routes/push.ts`（契約書 §1・§5-2 のとおり実装）

```ts
import { zValidator } from '@hono/zod-validator';
import { subscribeToExpiryAlertSchema, unsubscribeFromExpiryAlertSchema } from '@cookpit/api-contract';
import { SubscribeToExpiryAlertUseCase, UnsubscribeFromExpiryAlertUseCase } from '@cookpit/application';
import { Hono } from 'hono';
import { pushSubscriptionRepository } from '../repositories';

export const pushRoute = new Hono()
  .get('/vapid-public-key', (c) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (publicKey === undefined || publicKey === '') {
      console.error('VAPID_PUBLIC_KEY is not configured');
      return c.json({ error: 'Server misconfigured' }, 500);
    }
    return c.json({ publicKey }, 200);
  })
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

### 5-3. `routes/cron.ts`（契約書 §1.3・§5-3 のとおり実装。チェック順序が契約上重要）

```ts
import { SendExpiryAlertsUseCase } from '@cookpit/application';
import { Hono } from 'hono';
import { pantryRepository, pushSender, pushSubscriptionRepository } from '../repositories';

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

`CRON_SECRET` 未設定チェックが `Authorization` ヘッダー比較より**先**であること（契約書 §5-3。
「未設定 + 正しい形式のヘッダー」でも 401 ではなく 500 になる）。

### 5-4. `app.ts` 追記

```ts
import { cronRoute } from './routes/cron';
import { pushRoute } from './routes/push';
// ...

export const routes = app
  .route('/health', healthRoute)
  .route('/recipes', recipesRoute)
  .route('/products', productsRoute)
  .route('/stores', storesRoute)
  .route('/meal-plans', mealPlansRoute)
  .route('/shopping-lists', shoppingListsRoute)
  .route('/pantry', pantryRoute)
  .route('/push', pushRoute)
  .route('/cron', cronRoute);
```

`onError`（L24-33）は変更しない（`push`/`cron` は `NotFoundError`/`InvalidOperationError`
を投げないため。契約書 §5-1）。

### 追加テスト

契約書 §10.2 の観点表どおり。既存 `apps/web/tests/server/routes/pantry.test.ts` の
`vi.mock('@/db/client', ...)` + `vi.mock('@cookpit/application', ...)` パターンを踏襲する。
`push.test.ts`/`cron.test.ts` それぞれの主要観点:

- `push.test.ts`: `GET /vapid-public-key` の 200/500（未設定・空文字それぞれ）／
  `POST /subscribe` の 204（UseCase への引数が `endpoint`/`p256dh`/`auth` に平坦化されて
  渡ること）と 400 × 3／`POST /unsubscribe` の 204（存在しない endpoint 含む）と 400
- `cron.test.ts`: 200（正しい Bearer）／401（欠落・不一致、`CRON_SECRET` 設定済み）／
  500（`CRON_SECRET` 未設定。正しい形式のヘッダーでも 500 になることを含む）／
  レスポンスボディが `ExpiryAlertsCronResult` の 4 フィールドと一致すること

### 完了条件

```bash
pnpm --filter @cookpit/web test
pnpm --filter @cookpit/web type-check
pnpm lint
```

- `app.ts` の既存 `onError` 3 分岐が無変更であること
- `AppType` の型（`client.api.pantry.*` 等）が既存のまま構造的部分型で維持されること
  （`tsc --noEmit` で確認）

---

## Step 6: 既存 UI 差し替え（P-4）— dev で検証可能な範囲

**依存**: Step 3（`GetExpiringStocksUseCase`・移設済み `expiry.ts`）

### 対象ファイル

| 種別 | ファイル | 変更内容 |
| --- | --- | --- |
| 削除 | `apps/web/src/app/_utils/expiry.ts` | 全 export を Step 3-1 で移設済みのため削除（申し送り#2） |
| 変更 | `apps/web/src/app/_utils/dashboard-view.ts` | `selectExpiringStocks` と `expiry.ts` の import を削除。`MEAL_PLAN_STATUS_LABELS` のみ残す |
| 変更 | `apps/web/src/app/page.tsx` | `GetExpiringStocksUseCase` 呼び出しに差し替え |
| 変更 | `apps/web/src/app/_components/dashboard.tsx` | import 元を `@/app/_utils/expiry` → `@cookpit/application` に変更（3 関数） |
| 変更 | `apps/web/src/app/pantry/_components/stock-row.tsx` | import 元を `@/app/_utils/expiry` → `@cookpit/application` に変更（5 export。R-12 のバンドルサイズ確認対象） |
| 変更 | `apps/web/tests/app/_utils/dashboard-view.node.test.ts` | `selectExpiringStocks`/`getExpiryRemainingDays`/`EXPIRY_URGENCY_WITHIN_DAYS`/`getExpiryUrgency`/`formatExpiryUrgencyLabel` の describe ブロックを削除（Step 3 で移設済み）。`MEAL_PLAN_STATUS_LABELS` のみ残す |
| 新規 | `apps/web/tests/app/_utils/expiry.node.test.ts` | 不要（`expiry.ts` 自体を削除するため作らない。新規作成ファイル一覧 #31 は本 Step で「作らない」と確定するため取り消し線扱いとする） |
| 確認のみ | `apps/web/tests/app/pantry/_components/stock-row.test.tsx` | import 変更後も既存アサーションが通ることを確認（緊急度ラベル・チップ配色の表示結果は挙動不変のはず） |
| 確認のみ | `apps/web/tests/app/_components/dashboard.test.tsx` | 同上 |

新規作成ファイル一覧の #31（`expiry.node.test.ts` 新設）は、Step 3-1 で `expiry.ts` を
`apps/web` から完全に削除する方針にしたため不要になった。訂正: **削除**が正しく、新設ファイルは
無い（申し送り#2 の解決が「一部を apps/web に残す」方向になった場合はこの限りでない）。

### 6-1. `page.tsx`

```ts
import { GetCurrentMealPlanUseCase, GetExpiringStocksUseCase } from '@cookpit/application';
import { mealPlanRepository, pantryRepository } from '@/server/repositories';
import { Dashboard } from './_components/dashboard';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const now = new Date();
  const [mealPlan, expiringStocks] = await Promise.all([
    new GetCurrentMealPlanUseCase(mealPlanRepository()).execute(now),
    new GetExpiringStocksUseCase(pantryRepository()).execute(now),
  ]);

  return <Dashboard mealPlan={mealPlan} expiringStocks={expiringStocks} asOf={now} />;
}
```

`GetPantryUseCase`/`selectExpiringStocks`/`EXPIRY_URGENCY_WITHIN_DAYS` の import は不要になる
（`GetExpiringStocksUseCase` が内部で閾値と絞り込みを行う）。`Dashboard` に渡す props の型
（`expiringStocks: StockDto[]`）は変わらない。

### 6-2. `dashboard-view.ts`

`selectExpiringStocks` 関数本体と `import { parseExpiryDate, toLocalMidnight } from './expiry';`
を削除する。残る内容は `MEAL_PLAN_STATUS_LABELS` の定義のみ。

### 6-3. `dashboard.tsx` / `stock-row.tsx` の import 差し替え

```ts
// dashboard.tsx（変更前）
import { formatExpiryUrgencyLabel, getExpiryRemainingDays, getExpiryUrgency } from '@/app/_utils/expiry';
// ↓
import { formatExpiryUrgencyLabel, getExpiryRemainingDays, getExpiryUrgency } from '@cookpit/application';
```

```ts
// stock-row.tsx（変更前）
import {
  EXPIRY_URGENCY_WITHIN_DAYS,
  formatExpiryUrgencyLabel,
  getExpiryRemainingDays,
  getExpiryUrgency,
} from '@/app/_utils/expiry';
import type { ExpiryUrgency } from '@/app/_utils/expiry';
// ↓
import {
  EXPIRY_URGENCY_WITHIN_DAYS,
  formatExpiryUrgencyLabel,
  getExpiryRemainingDays,
  getExpiryUrgency,
} from '@cookpit/application';
import type { ExpiryUrgency } from '@cookpit/application';
```

> **R-12（バンドルサイズ確認・確認推奨、断定しない）**: `stock-row.tsx` は Client Component
> （`pantry-client.tsx` → `location-group.tsx` → `stock-row.tsx`。前提確認 10）であるため、
> `@cookpit/application` からの import はクライアントバンドルに含まれる。移設対象の 5
> export（`EXPIRY_URGENCY_WITHIN_DAYS`/`formatExpiryUrgencyLabel`/`getExpiryRemainingDays`/
> `getExpiryUrgency`/`ExpiryUrgency` 型）自体は外部依存を持たない純粋関数だが、
> `@cookpit/application` のバレル（`index.ts`）を経由すると Repository に依存する UseCase
> 群も import グラフに含まれうる。tree-shaking で実害が無い可能性が高いが、**実装時に
> `pnpm --filter @cookpit/web build` 後のバンドルサイズを Step 6 完了時点で 1 度確認する**
> ことを推奨する（断定しない。悪化が見られた場合は `packages/application/src/pantry/expiry`
> のようなサブパス import に切り替える選択肢がある。設計変更が必要な場合は Orchestrator へ
> 報告する）。

### 完了条件

```bash
pnpm --filter @cookpit/web test
pnpm --filter @cookpit/web type-check
pnpm lint
```

- `apps/web/src/app/_utils/expiry.ts` が存在しないこと（削除確認）
- `apps/web/tests/app/_utils/dashboard-view.node.test.ts` に `MEAL_PLAN_STATUS_LABELS` の
  テストのみが残り、移設したテストの重複が無いこと
- `stock-row.test.tsx`/`dashboard.test.tsx` が import 変更後も green であること（表示結果は
  挙動不変のはず。差異が出た場合は移設ミスの疑いがあるため実装を止めて確認する）
- ダッシュボード・`/pantry` の表示結果が移設前後で変わらないこと（回帰確認。設計書
  §移行とリリース 4 の「移動 → 動作確認」の順序）

---

## Step 7: 環境変数の準備・`vercel.json` の新設

**依存**: なし（Step 1〜6 と並行して進められるが、Cron が実際に動くのは全レイヤー完了後）

### 対象

| # | 項目 | 値・手順 |
| --- | --- | --- |
| 1 | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` 等で生成し Vercel プロジェクト環境変数に設定 |
| 2 | `VAPID_SUBJECT` | `mailto:` または HTTPS URL（罠 8。Apple がこれ以外を 403 で拒否） |
| 3 | `CRON_SECRET` | ランダムな秘匿文字列。Vercel Cron が自動的に `Authorization: Bearer $CRON_SECRET` を付与する |
| 4 | `TZ` | `Asia/Tokyo`（罠 5・R-5・R-6。**`vercel.json` の `schedule` 自体は `TZ` の影響を受けず常に UTC**。JST 08:00 台を UTC に変換した値を `vercel.json` に書く点と混同しない） |
| 5 | `vercel.json`（新規） | 下記コード。リポジトリに現状 0 件（前提確認 5） |

```json
{
  "crons": [{ "path": "/api/cron/expiry-alerts", "schedule": "0 23 * * *" }]
}
```

`0 23 * * *`（UTC）= JST 08:00 台（P-10a 確定）。Vercel Hobby では発火が指定時刻から 1
時間ブレる（罠 7）。「毎朝ちょうど 8 時に届く」ことを試験観点にしない（B-6）。

環境変数はローカル `.env` の管理外（このリポジトリに `.env.example` は無い。前提の項参照）
のため、Vercel ダッシュボードでの設定手順を PR の説明または `docs/decisions/ADR-0017-*.md`
§Migration へのリンクとして残す。

### 完了条件

- Vercel プロジェクト設定で 5 つの環境変数が Production/Preview 双方に設定されていることを
  目視確認する（Preview 環境が Step 9 の実機確認に必要なため）
- `vercel.json` が JSON として妥当（`vercel.json` のスキーマ検証は Vercel のデプロイ時に
  行われるため、ローカルでは `JSON.parse` が通ることを確認すれば足りる）
- `Cron の実行時間上限（maxDuration）`（設計書 §性能。確認推奨）を Vercel ダッシュボードで
  確認し、必要なら `apps/web/src/server/routes/cron.ts` に `export const maxDuration = <値>;`
  相当の設定を追加するかどうかを実装時に判断する（design が具体値を示していないため、本計画
  では追加を必須としない。実測の結果、超過の懸念があれば Orchestrator に報告する）

---

## Step 8: `sw.ts` への追加 + 購読 ON/OFF UI（本番ビルド経路でのみ確認可能）

**依存**: Step 5（`/api/push/*` エンドポイント）、Step 7（VAPID 公開鍵が配信可能であること）

dev では `apps/web/next.config.ts:24-29` により Service Worker が生成されないため
（罠 1）、本 Step のコード自体は dev で書けるが、動作確認は Vercel Preview Deployment 以降
まで待つ必要がある。

### 対象ファイル

| 種別 | ファイル | 変更内容 |
| --- | --- | --- |
| 追記 | `apps/web/src/app/sw.ts` | `push`/`notificationclick` ハンドラ追加（末尾） |
| 新規 | `apps/web/src/app/_components/expiry-alert-subscription.tsx` | 購読 ON/OFF ボタン（Client Component） |
| 変更 | `apps/web/src/app/_components/dashboard.tsx` | 「賞味期限が近い在庫」セクション内に `<ExpiryAlertSubscription />` を配置 |
| 新規 | `apps/web/tests/app/_components/expiry-alert-subscription.test.tsx` | `Notification`/`navigator.serviceWorker`/`PushManager` のモックテスト |

### 8-1. `sw.ts` 追記（罠 2 — 既存 `runtimeCaching` 4 件に触れない）

```ts
// 既存の serwist.addEventListeners() の直後に追記
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

**既存 `Serwist` コンストラクタ引数（`runtimeCaching` 配列・`precacheEntries`・
`skipWaiting`・`clientsClaim`・`navigationPreload`）・`serwist.addEventListeners()`
呼び出し（既存 58 行のうち L1-58）には一切手を入れない。** `docs/tests/saturday-flow.md:83-85`
（オフライン再訪問 O-01）の回帰テストを実装完了後に実行して確認する。

### 8-2. `expiry-alert-subscription.tsx`

設計書 §変更後構成 Presentation の仕様どおり実装する:

- ボタン押下（ユーザージェスチャ）を起点に `Notification.requestPermission()` →
  `navigator.serviceWorker.ready` → `registration.pushManager.subscribe({ userVisibleOnly:
  true, applicationServerKey: <GET /api/push/vapid-public-key で取得した公開鍵> })`
  （罠 3: iOS はユーザージェスチャ起点でないと権限要求が失敗する）
- 成功したら `POST /api/push/subscribe` へ `{ endpoint, keys: { p256dh, auth } }` を送信
  （`PushSubscription.toJSON()` の形をそのまま使う）
- OFF は現在の `pushManager` の購読を取得して `unsubscribe()` を呼んだ上で
  `POST /api/push/unsubscribe` を呼ぶ
- 状態管理は既存の `apps/web/src/lib/use-api-action.ts`（`useApiAction` パターン A）を
  再利用する（実装時に既存の呼び出し方を確認する）
- ブラウザが `PushManager` 非対応の場合はボタンを無効化し非対応である旨を表示する（E-4）
- 通知許可拒否時はエラーメッセージを表示し購読を作成しない（E-5）

`GET /api/push/vapid-public-key` から取得した公開鍵（base64url 文字列）は
`applicationServerKey` に渡す前に `Uint8Array` へ変換する処理が必要（Web Push API の
標準的な `urlBase64ToUint8Array` ヘルパー。設計書のコード例には明記が無いため本計画の
補完。test-designer/reviewer の確認対象に含める）。

### 8-3. `dashboard.tsx` への配置

「賞味期限が近い在庫」セクション内に `<ExpiryAlertSubscription />` を追加する。配置の
具体的な JSX 構造は既存セクションのマークアップに合わせて実装時に決める（設計書は
「セクション内」とのみ指定）。

### 完了条件

```bash
pnpm --filter @cookpit/web test
pnpm --filter @cookpit/web type-check
pnpm lint
pnpm --filter @cookpit/web build   # Serwist 適用の本番ビルドが通ることを確認
```

- 既存 `runtimeCaching` 4 件のテスト（オフライン再訪問シナリオ）に回帰が無いこと
- `expiry-alert-subscription.test.tsx` が許可承認・拒否・非対応ブラウザの 3 パターンを
  カバーすること（設計書 §テスト方針）
- 本番ビルド（`next build --webpack`）が成功し `public/sw.js` に `push`/`notificationclick`
  ハンドラが含まれること（`grep` 等での確認で足りる。実地の Push 到達確認は Step 9）

---

## Step 9: iOS 実機確認（P-11）・リリース手順・最終品質ゲート

**依存**: Step 1〜8 すべて完了し、Vercel Preview Deployment が可能な状態

### 9-1. デプロイ順序（ADR-0017 §Migration に従う。実装順序とは目的が異なる点に注意）

1. 環境変数（VAPID 鍵一式・`CRON_SECRET`・`TZ=Asia/Tokyo`）を Vercel に設定（Step 7）
2. Domain/Application/Infrastructure（Step 1〜3）と DB マイグレーション（Step 2）を含む PR を
   マージ
3. `vercel.json` を含む PR をマージ（デプロイ後に Cron ジョブとして登録される）
4. 期限判定ロジック移設（Step 6）は移設前後で表示が挙動不変であることを確認してからリリース
5. UI（購読 ON/OFF・`sw.ts`。Step 8）は Cron・API・Domain/Application/Infrastructure が
   揃った後にリリースする（UI だけ先行させない）
6. 機能フラグは導入しない（他の MVP1 機能と同様、単一 PR/デプロイでよい規模）

実際には Step 1〜8 を 1 つの実装ストリームとして進め、マージ・デプロイのタイミングだけ
上記順序に従う運用でよい（複数 PR に分割するかどうかは Orchestrator の判断に委ねる）。

### 9-2. iOS 実機確認手順（P-11。自動テストでは代替できない）

1. Vercel Preview Deployment の URL を iPhone Safari で開き、ホーム画面に追加する
   （`appleWebApp: { capable: true }` の前提）
2. ホーム画面から起動した PWA でダッシュボードの通知 ON ボタンを押す（ユーザージェスチャ
   起点であることを確認）
3. 通知許可ダイアログを承認し、購読が `POST /api/push/subscribe` に届くことを確認する
4. `GET /api/cron/expiry-alerts` を `Authorization: Bearer $CRON_SECRET` 付きで手動実行し
   （`curl` 等）、通知が iPhone に届くことを確認する
5. 通知をタップし `/pantry` へ遷移することを確認する
6. 通知 OFF ボタンを押し、`POST /api/push/unsubscribe` が呼ばれ以後通知が来ないことを確認する
7. Android Chrome でも同じ手順を実施し、iOS 固有の失敗（罠 3・罠 8）が無いことと比較する

### 9-3. 最終品質ゲート

```bash
pnpm lint
pnpm type-check
pnpm test
```

- Step 1〜8 で追加した Vitest ファイル（Domain 2・Infrastructure 4・Application 7・
  api-contract 1・apps/web 3 = 計 17 ファイル）が全て green
- 既存テスト（Recipe/Product/Store/MealPlan/ShoppingList/Pantry/health/オフライン再訪問）に
  regression が無いこと
- スコープ外変更が無いこと（既存 9 テーブル・既存 7 ルート・`onError`・`sw.ts` の
  `runtimeCaching` 4 件はいずれも本計画で明記した追記箇所以外は一切変更しない）
- roadmap Sprint 8 完了条件 3 件目「期限が近い在庫にアプリを開かずに気づける」を満たすこと
  （9-2 の実機確認で確認）

---

## テスト計画への参照

各 Step の「追加テスト」節は実装計画作成時点での最低限の観点であり、**詳細な試験ケース網羅
（正常系・異常系・境界条件の完全な一覧、ケース番号採番）は test-designer が
`docs/tests/expiry-alert.md` として別途確定する**（並行作成中）。特に以下は設計・契約書由来で
必ず反映されるべき観点として申し送る。

- 要件定義書 N-1〜N-8・E-1〜E-7・B-1〜B-6 の全件
- 契約書 §10.1〜§10.4（Zod バリデーション・Hono ルートのステータスコード・型往復）
- 設計書 §性能（`deleteByEndpoints` の N+1 回避・`Promise.allSettled` の部分失敗耐性）
- 設計書 §テスト方針の手動検証（P-11。iOS 実機）
- 罠 7（Cron 発火の 1 時間ブレ）を前提にした試験観点は組まない（B-6）
- Step 3 で移設した既存テスト（EU-01〜EU-18・EXP-03 等の既存ケース番号）が
  `packages/application/tests/pantry/expiry.test.ts` で 1 件も欠落していないことを
  test-designer 側でも突き合わせる

テストランナーは Vitest。完了条件は各 Step の `pnpm lint`/`pnpm type-check`/`pnpm test`
（該当パッケージ）+ 全体の `pnpm lint`/`pnpm type-check`/`pnpm test`（Step 9）。

---

## リスクと対策

設計書 §リスク（R-1〜R-13）を実装計画の観点で再整理する。

| # | リスク | 影響 | 対策（本計画での対応箇所） |
| --- | --- | --- | --- |
| R-1 | dev で SW が生成されず push 検証ができない（罠 1） | 実装者が「動くはずのものが確認できない」状態で詰まる | Step 1〜6 を自動テストで固めた後に Step 8〜9 へ進む順序にした |
| R-2 | `sw.ts` 追記が既存 `runtimeCaching` 4 件を壊す（罠 2） | オフライン再訪問（O-01）の回帰 | Step 8-1 で Serwist インスタンスと独立した `addEventListener` に限定し、既存回帰テストの実行を完了条件に含めた |
| R-3 | iOS はホーム画面追加済み PWA + ユーザージェスチャ起点でないと動かない（罠 3） | iOS だけ通知が届かない | Step 8-2 でボタン起点の実装を明記、Step 9-2 で iOS 実機確認を必須化 |
| R-4 | VAPID 秘密鍵の露出（罠 4） | 第三者によるなりすまし送信 | Step 5-2 で公開鍵専用エンドポイントのみ実装。秘密鍵は Step 7 でサーバー環境変数のみに設定 |
| R-5/R-6 | `TZ`/`vercel.json` の UTC/JST 混同（罠 5） | 通知対象選定が 1 日ずれる、または発火時刻がズレる | Step 7 に UTC 変換値と設定手順を明記 |
| R-7 | PGlite テスト DDL の同期漏れ（罠 6） | Repository テストが全滅 | Step 2-2 で追記位置を実測済みの行番号で明記。完了条件で即時検知できる |
| R-8 | Vercel Hobby の Cron 発火が 1 時間ブレる（罠 7） | 「毎朝ちょうど n 時」の試験観点が成立しない | Step 7・9-2 で「その日のうちに届く」粒度の確認にとどめる |
| R-9 | Apple の VAPID subject 制約（罠 8） | iOS だけ 403 | Step 7 で `mailto:`/HTTPS URL を明記。Step 9-2 に iOS 実機確認を含める |
| R-10 | 数量 0 の在庫が通知対象に混じる（罠 9） | 空の在庫が通知され混乱を招く | Step 3-4 で `amount.value > 0` フィルタを `SendExpiryAlertsUseCase` にのみ実装 |
| R-11 | Cron の重複起動（B-5） | 同日に通知が二重に届く可能性 | 冪等性キーは持たない設計を受容（P-2 確定どおり実装。追加対応なし） |
| R-12 | Application 層関数のクライアントバンドル取り込み | ページ初期表示が遅くなる可能性 | Step 6 完了条件でビルド後バンドルサイズの確認を明記（断定しない） |
| R-13 | Push Service 全体のダウン | 通知が届かない日が発生 | フォールバック UI なし。翌日の再送に委ねる（設計書どおり実装） |
| IMP-1 | `PushSender` port の配置先が設計書（Application）と実装（Domain）で異なる | reviewer が「設計から逸脱している」と誤診する可能性 | Step 1-4 に理由を明記し、申し送り#1 として Orchestrator へ事前確認を依頼 |
| IMP-2 | `formatExpiryUrgencyLabel` の配置先が P-4（apps/web 据え置き）と異なる | 同上 | Step 3-1 に理由を明記し、申し送り#2 として Orchestrator へ事前確認を依頼 |
| IMP-3 | `web-push` の追加先パッケージが依頼文（apps/web）と実装（packages/infrastructure）で異なる | Codex/implementer が誤って apps/web にだけ追加し型解決に失敗する | Step 2-5 に pnpm workspace の phantom dependency 制約を明記 |

---

## ロールバック手順

ADR-0017 §Rollback を実装計画のファイル単位に対応させたもの。最速の緊急停止は 1 のみ実行すれば
足りる（以降は正式な巻き戻し）。

1. **最速の緊急停止**: `vercel.json` の `crons` エントリを削除する（ファイルごと削除でも可）。
   デプロイすれば日次実行が止まり、以降の手順を待たずに通知を止められる
2. **Presentation（Step 5・8）**: `apps/web/src/server/routes/push.ts`・
   `apps/web/src/server/routes/cron.ts`（+ テスト）を削除し、`app.ts` の `.route()` 2 行と
   import を削除。`apps/web/src/app/sw.ts` の `push`/`notificationclick` ハンドラを削除
   （既存 `runtimeCaching` 4 件は触れない）。`apps/web/src/app/_components/
   expiry-alert-subscription.tsx`（+ テスト）を削除し、`dashboard.tsx` から参照を外す
3. **api-contract（Step 4）**: `push-subscription.schema.ts`（+ テスト）を削除し、
   `index.ts` の追記行を削除
4. **Application（Step 3）**: `packages/application/src/notification/` ディレクトリを削除。
   `packages/application/src/pantry/get-expiring-stocks.use-case.ts`（+ テスト）を削除。
   `page.tsx` を `GetPantryUseCase` + `selectExpiringStocks`（Application 層に残す場合は
   `pantry/expiry.ts` の関数をそのまま使う。apps/web にロールバックする場合は
   `_utils/expiry.ts`/`dashboard-view.ts` を復元する）呼び出しへ戻す。
   **`GetExpiringStocksUseCase` への差し替え自体（P-4）は戻さなくてよい**
   （ADR-0017 §Rollback「層責務として正しい形であり、通知を止めても画面表示は同じ結果になる」）
5. **Infrastructure（Step 2）**:
   - `schema.ts` から `pushSubscriptions` 定義を削除
   - `create-test-db.ts` の DDL から該当 `CREATE TABLE` を削除
   - 生成済みマイグレーション（`0008_xxxxx.sql` + `meta/0008_snapshot.json`）を削除し
     `meta/_journal.json` の該当エントリを削除
   - 本番 DB に適用済みの場合は `DROP TABLE push_subscriptions;`（他テーブルからの被参照
     FK が無いため単純に DROP できる）。**保存済みの購読情報は端末側の購読が生きている限り
     有効なので、テーブルを消すと再購読が必要になる**点に注意する
   - `drizzle-push-subscription.repository.ts`/`web-push-sender.ts`（+ テスト）を削除し、
     `infrastructure/src/index.ts` の export 行を削除。`packages/infrastructure/package.json`
     から `web-push` 依存を削除
6. **Domain（Step 1）**: `packages/domain/src/push-subscription/` ディレクトリを削除し、
   `domain/src/index.ts` の 4 export を削除
7. **環境変数**: VAPID 鍵一式・`CRON_SECRET` を Vercel から削除する。**`TZ=Asia/Tokyo` は
   残す**（既存ダッシュボード表示のズレも解消しているため。ADR-0017 §Rollback 明記）

各層は疎結合であり、既存の `Recipe`/`Product`/`Store`/`MealPlan`/`ShoppingList`/`Pantry`
縦スライスは一切変更していないため、本ユニットの完全撤去は既存機能に影響しない。

---

## ドキュメント更新対象（実装完了後のフォローアップ。本計画では実施しない）

| # | 対象ドキュメント | 更新内容 |
| --- | --- | --- |
| 1 | `docs/04-domain-model.md` | `PushSubscription` 集約の追加を反映（既存 Pantry 集約セクションと同様の記述粒度） |
| 2 | `docs/02-tech-stack.md:118` | 「MVP1 ではプッシュ通知を使わない」の記述を訂正（ADR-0017 の Consequences で明記済みの訂正対象） |
| 3 | `docs/05-roadmap.md` | Sprint 8 Unit B 行を「未着手」→「完了」に更新し、完了条件 3 件目を達成済みにする |
| 4 | `docs/decisions/ADR-0017-web-push-expiry-alert.md` | 本計画の Step 1-4/3-1 で `PushSender` port と `formatExpiryUrgencyLabel` の配置を設計書の記載から変更した場合、ADR 本文または末尾の補記として実装との差異を記録するかを Orchestrator が判断する |

---

## Orchestrator への申し送り

矛盾ではなく「設計書のコード例をそのまま実装すると既存の依存方向ルール・確定済みの別決定と
整合しない」箇所が 2 件見つかった。いずれも実装着手前に確認を得ること。設計書・契約設計書は
書き換えていない。

### 申し送り#1: `PushSender` port の配置先（Application → Domain への変更提案）

- **設計書の記載**: `packages/application/src/notification/push-sender.ts`
  （`PushPayload`/`PushSendResult`/`PushSubscriptionTarget`/`PushSender`）
- **問題**: `packages/infrastructure/package.json` は `@cookpit/domain` にのみ依存し
  `@cookpit/application` に依存していない（実測。前提確認 7）。`WebPushSender`
  （Infrastructure）がこの port を実装するには、設計書どおりの配置だと
  `packages/infrastructure` に新規パッケージ依存を追加することになり、CLAUDE.md/
  `.claude/rules/domain-layer.md` の依存方向（`Presentation → Application → Domain ←
Infrastructure`。Infrastructure は Domain にのみ依存）に反する
- **本計画の提案**: `PushSender` port を `packages/domain/src/push-subscription/push-sender.ts`
  に置く（既存の全 Repository インターフェースが Domain にあり Infrastructure が実装する、
  という現行の依存グラフに合わせる）。「失効した購読を消す」という業務判断自体は
  `SendExpiryAlertsUseCase`（Application）に残るため、設計書の意図（Infrastructure に
  業務判断を持たせない）は損なわれない
- **確認したいこと**: この配置変更で進めてよいか。あるいは
  `packages/infrastructure/package.json` に `@cookpit/application` を追加する方針（依存方向
  ルールの例外を認める）を採るか

### 申し送り#2: `formatExpiryUrgencyLabel` の配置先（P-4 と P-7 の確定内容の非両立）

- **P-4 の確定（設計書 §変更後構成 Application）**: 「`formatExpiryUrgencyLabel`
  （人間可読な文言）と `expiryUrgencyChipClass`（CSS クラス名）は UI 表示専用として
  `apps/web/src/app/_utils/` に残す（Application 層に表示文字列・CSS を持ち込まない）」
- **P-7 の確定（設計書 §確定事項 P-7 の詳細）**: 「これにより通知本文は
  `apps/web/src/app/_utils/expiry.ts` の `formatExpiryUrgencyLabel` に依存する」
- **問題**: `SendExpiryAlertsUseCase`（Application 層・`packages/application`）が通知本文の
  組み立て（`buildDigestPayload`）内で `formatExpiryUrgencyLabel` を呼ぶ必要があるが、
  `packages/application` は `apps/web` に依存できない（`packages/application/package.json`
  に `@cookpit/web` は無く、そもそも `apps/web` が `@cookpit/application` に依存する向きが
  逆であるため循環依存になる）。P-4 の「apps/web に残す」を文字どおり実装すると P-7 が
  成立しない
- **本計画の提案**: `formatExpiryUrgencyLabel` を含む `expiry.ts` の全 6 export を
  `packages/application/src/pantry/expiry.ts` へ移設し、`apps/web` は
  `@cookpit/application` から import する（他の 5 関数と同じ移設パターンに揃える）。
  `apps/web/src/app/_utils/expiry.ts` は削除する。`expiryUrgencyChipClass`
  （`category-color.ts`）は無関係のため据え置く
- **確認したいこと**: この移設（P-4 の「apps/web に残す」を実質的に取り消す）で進めてよいか。
  あるいは「通知本文は `formatExpiryUrgencyLabel` と同等の別関数を Application 層に複製する」
  （ロジック二重化のリスクを受容してでも P-4 の文言を厳密に守る）方針を採るか

---

## 完了条件（Definition of Done 対応）

`docs/claude-code/definition-of-done.md` / `docs/requirements/expiry-alert.md` §受け入れ条件
に対応する。

- [ ] 申し送り#1・#2 について Orchestrator の確認が得られている（実装着手前）
- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` が通る（Step 9-3）
- [ ] Domain: `PushSubscription` 集約の単体テスト（生成・復元・不変条件）
- [ ] Application: 購読 ON/OFF UseCase・`SendExpiryAlertsUseCase`・`GetExpiringStocksUseCase`
      のテスト（正常系・購読 0 件・在庫 0 件・送信失敗の一部混在ケースを含む）
- [ ] Infrastructure: PGlite 回帰テスト（save/findAll/findByEndpoint/deleteByEndpoint(s)）。
      `create-test-db.ts` への DDL 追記を含む
- [ ] apps/web: Cron ルートのテスト（200/401/500）、購読/購読解除ルートのテスト（200/400）、
      ダッシュボードの購読 ON/OFF UI のコンポーネントテスト
- [ ] 期限判定ロジック移設後、ダッシュボード・`/pantry` の既存表示に回帰が無いことを確認する
      テスト（Step 6 完了条件）
- [ ] iOS 実機での Push 到達確認手順を実施する（Step 9-2）
- [ ] roadmap Sprint 8 完了条件 3 件目を満たす
- [ ] スコープ外変更が無いこと（既存 9 テーブル・既存 7 ルート・`onError`・`sw.ts` の
      `runtimeCaching` 4 件・`expiryUrgencyChipClass` は本計画で明記した箇所以外変更しない）
