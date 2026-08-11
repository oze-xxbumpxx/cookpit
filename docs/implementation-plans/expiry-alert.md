# 実装計画: expiry-alert

- ステータス: ready（2026-08-09 改訂第2版。申し送り#1・#2 は設計書 P-13/P-14 として確定済み。
  security-reviewer 指摘（`docs/reviews/expiry-alert.security.md`）由来の P-15〜P-17 と
  H-2/M-2/M-3/L-3/L-5 を本改訂で反映した。本改訂で新たに Orchestrator の判断を要する事項は
  無い。§Orchestrator への申し送り を参照）
- 設計書: `docs/designs/expiry-alert.md`（確定。P-1〜P-17 は 2026-08-09 ユーザー確定。
  設計書・ADR・契約設計書は他 Agent が更新済みのため、本計画からは変更していない）
- 契約設計書: `docs/designs/expiry-alert.contract.md`（確定。§11 実装ファイル一覧を本計画の
  ベースにした。**§3.1 の Zod コード例は本改訂時点で P-16/P-17 を反映しておらず旧版のまま**
  — 詳細は Step 4 と §Orchestrator への申し送り #3 を参照）
- ADR: `docs/decisions/ADR-0017-web-push-expiry-alert.md`（方式決定・Migration/Rollback 手順）
- 要件定義: `docs/requirements/expiry-alert.md`
- セキュリティレビュー: `docs/reviews/expiry-alert.security.md`（判定: Critical 0 / High 2 /
  Medium 4 / Low 5。High 2 件は P-15・H-2 として本改訂で対応、Medium/Low は該当箇所に反映）
- 実装ルート: **Orchestrator 経路**（`docs/05-roadmap.md:649`。Codex 委譲ではない。
  `implementer` Subagent が本計画を読んで実装する）。`docs/tasks/codex/` は作らない。
- 試験計画: test-designer が `docs/tests/expiry-alert.md` を並行作成中。本計画は
  「テスト計画への参照」節でポインタのみ示し、詳細ケースは先取りしない。

---

## 新規作成・削除ファイル一覧（着手前に Orchestrator が一括承認）

CLAUDE.md「新規ファイルの作成・既存ファイルの削除は、必ず事前に確認を取る」に基づき、
実装着手前にまとめて確認を取る。詳細は各 Step を参照。前回版からの変更点: `push-sender.ts`
の配置は Step 1 のとおり Domain で確定（P-13）、`push-sender-types.ts`（提案時点の暫定
プレースホルダ）は不要になり削除、`too-many-subscriptions.error.ts`（P-15）と
`apps/web/.env.example`（H-2）を追加した。

### 新規作成（34 ファイル。マイグレーション自動生成 2 件を含む）

| #   | ファイル                                                                                                        | Step |
| --- | --------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | `packages/domain/src/push-subscription/push-subscription.ts`                                                    | 1    |
| 2   | `packages/domain/src/push-subscription/push-subscription-id.ts`                                                 | 1    |
| 3   | `packages/domain/src/push-subscription/push-subscription.repository.ts`                                         | 1    |
| 4   | `packages/domain/src/push-subscription/push-sender.ts`（P-13 確定）                                             | 1    |
| 5   | `packages/domain/tests/push-subscription/push-subscription.test.ts`                                             | 1    |
| 6   | `packages/domain/tests/push-subscription/push-subscription-id.test.ts`                                          | 1    |
| 7   | `packages/infrastructure/src/repositories/drizzle-push-subscription.repository.ts`                              | 2    |
| 8   | `packages/infrastructure/src/notification/web-push-sender.ts`                                                   | 2    |
| 9   | `packages/infrastructure/tests/repositories/drizzle-push-subscription.repository.test.ts`                       | 2    |
| 10  | `packages/infrastructure/tests/notification/web-push-sender.test.ts`                                            | 2    |
| 11  | `apps/web/src/db/migrations/0008_xxxxx.sql`（`drizzle-kit generate` 自動生成）                                  | 2    |
| 12  | `apps/web/src/db/migrations/meta/0008_snapshot.json`（自動生成）                                                | 2    |
| 13  | `packages/application/src/pantry/expiry.ts`（`apps/web` から移設。P-14 確定）                                   | 3    |
| 14  | `packages/application/src/pantry/get-expiring-stocks.use-case.ts`                                               | 3    |
| 15  | `packages/application/src/notification/too-many-subscriptions.error.ts`（新規・P-15）                           | 3    |
| 16  | `packages/application/src/notification/send-expiry-alerts.use-case.ts`                                          | 3    |
| 17  | `packages/application/src/notification/subscribe-to-expiry-alert.use-case.ts`                                   | 3    |
| 18  | `packages/application/src/notification/unsubscribe-from-expiry-alert.use-case.ts`                               | 3    |
| 19  | `packages/application/src/notification/index.ts`                                                                | 3    |
| 20  | `packages/application/tests/pantry/expiry.test.ts`（既存テストの移設先）                                        | 3    |
| 21  | `packages/application/tests/pantry/get-expiring-stocks.use-case.test.ts`                                        | 3    |
| 22  | `packages/application/tests/notification/send-expiry-alerts.use-case.test.ts`                                   | 3    |
| 23  | `packages/application/tests/notification/subscribe-to-expiry-alert.use-case.test.ts`（P-15 の上限テストを含む） | 3    |
| 24  | `packages/application/tests/notification/unsubscribe-from-expiry-alert.use-case.test.ts`                        | 3    |
| 25  | `packages/api-contract/src/push-subscription.schema.ts`                                                         | 4    |
| 26  | `packages/api-contract/tests/push-subscription.schema.test.ts`                                                  | 4    |
| 27  | `apps/web/src/server/routes/push.ts`                                                                            | 5    |
| 28  | `apps/web/src/server/routes/cron.ts`                                                                            | 5    |
| 29  | `apps/web/tests/server/routes/push.test.ts`                                                                     | 5    |
| 30  | `apps/web/tests/server/routes/cron.test.ts`                                                                     | 5    |
| 31  | `apps/web/src/app/_components/expiry-alert-subscription.tsx`                                                    | 8    |
| 32  | `apps/web/tests/app/_components/expiry-alert-subscription.test.tsx`                                             | 8    |
| 33  | `vercel.json`（リポジトリルート。現状 0 件）                                                                    | 7    |
| 34  | `apps/web/.env.example`（新規・H-2）                                                                            | 7    |

### 削除

| #   | ファイル                            | 理由                                                                                                                                                                                                                                                             | Step |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | `apps/web/src/app/_utils/expiry.ts` | 全 6 export（`EXPIRY_URGENCY_WITHIN_DAYS` / `parseExpiryDate` / `toLocalMidnight` / `ExpiryUrgency` / `getExpiryRemainingDays` / `getExpiryUrgency` / `formatExpiryUrgencyLabel`）を `packages/application/src/pantry/expiry.ts` へ移設し尽くすため（P-14 確定） | 6    |

---

## 概要

roadmap Sprint 8 完了条件 3 件目「期限が近い在庫にアプリを開かずに気づける」を Web Push
（VAPID）+ Vercel Cron の日次ダイジェスト通知で満たす。新規集約 `PushSubscription`（Domain）
を起点に、期限判定ロジックを Presentation から Application 層へ移設し（`GetExpiringStocksUseCase`
新設・ダッシュボードも差し替え）、`SendExpiryAlertsUseCase` が Pantry 集約と PushSubscription
集約をまたいで日次送信を行う。Infrastructure に初めての外部 I/O（`web-push` パッケージ経由の
Push 送信）が入る。`vercel.json` を新設して Cron を JST 08:00 台（UTC `0 23 * * *`）に登録する。

**本改訂の追加スコープ（P-15〜P-17・security-reviewer 指摘）**: (1) 無認証 `subscribe` の
悪用防止として購読件数の上限（10 件）、(2) `endpoint` のホスト検証（SSRF 対策）、
(3) `p256dh`/`auth` の長さ制約の厳格化、(4) `.gitignore`/`.env.example` の整備、
(5) `CRON_SECRET` の生成方法明記と Preview/Production の鍵分離、(6) `sw.ts` の
`notificationclick` の入力検証、(7) Cache-Control ヘッダ、(8) `web-push` 追加後の
`pnpm audit` 実行。いずれも既存 Step の内容を強化するもので、Step 構成・実装順序自体は
前回版から変わらない。

**dev では Service Worker が生成されない**（`apps/web/next.config.ts:24-29`）ため、DB・Domain・
Application・API・既存 UI 差し替えまでを自動テストで固めた後に、`sw.ts` と新規購読 UI（実機
確認が必要な範囲）へ進む順序で Step を並べる。

---

## 前提の確認(着手前に実測すべきこと。本計画作成時点で確認済み)

| #   | 確認事項                                                                       | 実測結果                                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/infrastructure/tests/testing/create-test-db.ts` の `stocks` DDL 位置 | `CREATE TABLE stocks` が L100-111、`CREATE INDEX stocks_product_id_idx` が L113、テンプレートリテラルの閉じ `` ` `` が L114。`push_subscriptions` は L113 と L114 の間に追記する                                                                                                                                                                                 |
| 2   | `packages/infrastructure/src/db/schema.ts` の現状テーブル数                    | 9 テーブル（`recipes`/`stores`/`products`/`priceRecords`/`mealPlans`/`plannedRecipes`/`shoppingLists`/`shoppingItems`/`stocks`）。追加に必要な `text`/`timestamp`/`pgTable` は全て既存 import 済みで import 文の変更は不要                                                                                                                                       |
| 3   | `apps/web/src/db/migrations/` の最大連番                                       | `0007_tranquil_the_anarchist.sql` が最大。次は `0008`                                                                                                                                                                                                                                                                                                            |
| 4   | `apps/web/src/server/app.ts` の現状                                            | 全 35 行。7 ルートを `.route()` でマウント、`onError` は `NotFoundError→404`/`InvalidOperationError→422`/それ以外→500 の 3 分岐のみ。本ユニットはこの `onError` を変更しない                                                                                                                                                                                     |
| 5   | `vercel.json` の存在                                                           | リポジトリに 0 件（新設）                                                                                                                                                                                                                                                                                                                                        |
| 6   | `apps/web/package.json` の依存                                                 | `web-push` は無し。`@hono/zod-validator`・`hono`・`zod` は既存                                                                                                                                                                                                                                                                                                   |
| 7   | `packages/infrastructure/package.json` の依存                                  | `@cookpit/domain`・`@neondatabase/serverless`・`drizzle-orm` のみ。**`@cookpit/application` への依存は無い** — P-13（`PushSender` port を Domain に置く）の根拠                                                                                                                                                                                                  |
| 8   | Domain ID VO の実際のパターン                                                  | `packages/domain/src/product/product-id.ts` は `Identifier<'ProductId'>` を継承し `static generate()`/`static fromString()` のみを持つ薄い実装。`PantryId`/`StockId` も同型。`PushSubscriptionId` は現行パターンに合わせる                                                                                                                                       |
| 9   | Domain/Application/api-contract のテスト配置規約                               | `packages/domain/tests/<集約>/`・`packages/application/tests/<集約>/`・`packages/api-contract/tests/`・`packages/infrastructure/tests/repositories/` に `src/` をミラーする形で実在                                                                                                                                                                              |
| 10  | `apps/web/src/app/_utils/expiry.ts` の呼び出し元                               | `apps/web/src/app/page.tsx`（Server Component）・`apps/web/src/app/_components/dashboard.tsx`（Server Component、`use client` 無し）・`apps/web/src/app/pantry/_components/stock-row.tsx`（**Client Component**。`pantry-client.tsx`（`use client`）→ `location-group.tsx` → `stock-row.tsx` の経由で確認）。`stock-row.tsx` だけが R-12（バンドルサイズ）の対象 |
| 11  | `apps/web/src/app/_utils/category-color.ts` の `expiryUrgencyChipClass`        | 引数は `urgency: string`（`ExpiryUrgency` 型を import していない）。`expiry.ts` の変更と無関係で、確定どおり**触らない**                                                                                                                                                                                                                                         |
| 12  | 既存コンポーネントテストの存在                                                 | `apps/web/tests/app/pantry/_components/stock-row.test.tsx` と `apps/web/tests/app/_components/dashboard.test.tsx` が存在（既存・回帰確認対象）                                                                                                                                                                                                                   |
| 13  | `apps/web/tests/app/_utils/dashboard-view.node.test.ts` の中身                 | `selectExpiringStocks`（dashboard-view.ts 由来）と `MEAL_PLAN_STATUS_LABELS`（dashboard-view.ts 由来）、`getExpiryRemainingDays`/`EXPIRY_URGENCY_WITHIN_DAYS`/`getExpiryUrgency`/`formatExpiryUrgencyLabel`（expiry.ts 由来）の 4 系統のテストが 1 ファイルに同居している。Step 6 で系統ごとに移設先を分ける                                                     |
| 14  | `.gitignore` の現状（H-2）                                                     | 全 62 行。環境変数関連は L11-14 の `.env`/`.env.local`/`.env.*.local` の 3 行のみ。`.env.production` 等は追跡対象のまま                                                                                                                                                                                                                                          |
| 15  | リポジトリ内の `.env*` ファイルの有無                                          | 0 件（`**/.env*` で検索。`.env.example` も含め前例が無いため本改訂で新設する）                                                                                                                                                                                                                                                                                   |
| 16  | Application 層エラークラスの継承パターン                                       | `StockNotFoundError extends NotFoundError`・`InvalidStockOperationError extends InvalidOperationError`（いずれも `packages/application/src/shared/errors.ts` の抽象基底を継承し `super(message)` を呼ぶだけの薄いクラス）。`TooManySubscriptionsError`（P-15）も同型で実装する                                                                                   |
| 17  | `server-only` パッケージの使用状況                                             | リポジトリ全体で 0 件（`apps/web/package.json` にも無し）。Step 5 で採用する場合は新規依存になる                                                                                                                                                                                                                                                                 |

---

## 実装順序

`docs/designs/expiry-alert.md` §移行とリリース は「環境変数 → DB migration → vercel.json →
期限判定ロジック移設 → UI」というリリース順序を規定するが、これは**デプロイ順序**であり、
実装順序とは目的が異なる（開発中は dev で検証できる範囲を先に固めたい）。本計画は以下の順序で
実装し、最終的な**マージ・デプロイ**は ADR-0017 §Migration の順序に従う（Step 9 で明記）。

```
Step 1: Domain（PushSubscription 集約 + Repository IF + PushSender port）
  └─→ Step 2: Infrastructure（schema/DDL/migration/Repository実装/WebPushSender/依存監査）
        └─→ Step 3: Application（期限判定ロジック移設 + GetExpiringStocksUseCase +
                                   notification/ 3 UseCase + 購読上限）
              ├─→ Step 4: api-contract（Zod スキーマ + ホスト検証 + 鍵長制約）
              └─→ Step 5: Presentation API（push.ts/cron.ts/app.ts/repositories.ts）
                    └─→ Step 6: 既存 UI 差し替え（page.tsx/dashboard.tsx/stock-row.tsx/
                                 既存テスト分割。dev で検証可能）
                          └─→ Step 7: 環境変数・vercel.json・.gitignore/.env.example
                                └─→ Step 8: sw.ts（入力検証込み）+ 購読 ON/OFF UI（本番ビルド
                                     経路でのみ確認可）
                                      └─→ Step 9: iOS 実機確認（P-11）・鍵分離・リリース手順
```

Step 1〜6 は `pnpm dev`（Turbopack）で自動テストと型検査だけで完結できる。Step 7〜9 は
Vercel Preview Deployment 以降でないと実地検証できない（実装上の罠 1）。

---

## Step 1: Domain 層 — `PushSubscription` 集約

**依存**: なし（既存 `packages/domain` のみ）

### 対象ファイル

| 種別 | ファイル                                                                | 内容                                                                                                 |
| ---- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 新規 | `packages/domain/src/push-subscription/push-subscription-id.ts`         | `PushSubscriptionId`（`ProductId`/`StockId` と同型）                                                 |
| 新規 | `packages/domain/src/push-subscription/push-subscription.ts`            | `PushSubscription` エンティティ                                                                      |
| 新規 | `packages/domain/src/push-subscription/push-subscription.repository.ts` | `PushSubscriptionRepository` IF                                                                      |
| 新規 | `packages/domain/src/push-subscription/push-sender.ts`                  | `PushSender` port（`PushPayload`/`PushSendResult`/`PushSubscriptionTarget`/`PushSender`。P-13 確定） |
| 追記 | `packages/domain/src/index.ts`                                          | 集約 4 export 追加                                                                                   |
| 新規 | `packages/domain/tests/push-subscription/push-subscription-id.test.ts`  | ID VO テスト                                                                                         |
| 新規 | `packages/domain/tests/push-subscription/push-subscription.test.ts`     | エンティティテスト                                                                                   |

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

### 1-2. `PushSubscription` エンティティ

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
`endpoint`/`p256dh`/`auth` の**形式**検証（URL・ホスト・base64url・長さ）は api-contract 層
（Step 4）の責務であり、Domain の `create()` は「空文字でないこと」のみを見る不変条件に留める
（既存 Entity の空文字チェックと同水準）。

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

**P-15（購読件数の上限）に関する確認**: 上限判定は `findAll()` の結果件数を使って
**Application 層の `SubscribeToExpiryAlertUseCase`（Step 3）で行う**。Domain 層に変更は無い
（`.claude/rules/domain-layer.md`「集約をまたぐ操作は Application 層の UseCase に置く」に
従う。件数の集計はリポジトリ全体を横断する操作であり、単一の `PushSubscription` エンティティの
不変条件ではない）。新規メソッド（`count()` 等）も追加しない。既存の `findAll()` を
`SubscribeToExpiryAlertUseCase` から呼んで件数を数える（N が 2 桁想定のため性能上の懸念は
無い。設計書 §性能の想定規模と同じ前提）。

### 1-4. `PushSender` port（P-13 確定 — Domain に置く理由）

設計書の当初のコード例は `PushSender`（`PushPayload`/`PushSendResult`/
`PushSubscriptionTarget` を含む）を `packages/application/src/notification/push-sender.ts`
に置くとしていたが、**`packages/infrastructure/package.json` は `@cookpit/domain` にのみ
依存し `@cookpit/application` には依存していない**（前提確認 7）。`WebPushSender`
（Infrastructure）がこのインターフェースを `implements` するには型を import する必要があり、
Application に置いたままだと `packages/infrastructure` に新規パッケージ依存
（`@cookpit/application`）を追加することになり、CLAUDE.md/`.claude/rules/domain-layer.md`
の依存方向（`Presentation → Application → Domain ← Infrastructure`）に反する。

本計画のこの提案は 2026-08-09 に **P-13 としてユーザー確定済み**（設計書 §確定事項参照）。
既存の全 Repository インターフェースが Domain に置かれ Infrastructure が実装する、という
現行の依存グラフに合わせ、`PushSender` port も Domain に置く。

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

`packages/application/src/notification/` には `push-sender.ts` は置かない（`SendExpiryAlertsUseCase`
は `@cookpit/domain` からこれらの型を import する）。

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
- `PushSubscriptionRepository` に P-15 用の新規メソッドが追加されていないこと（上限判定は
  Application 層の責務）

---

## Step 2: Infrastructure 層 — DB スキーマ・Repository・Push 送信実装

**依存**: Step 1（`PushSubscription`/`PushSubscriptionRepository`/`PushSender` の型）

### 対象ファイル

| 種別 | ファイル                                                                                  | 内容                                                  |
| ---- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 追記 | `packages/infrastructure/src/db/schema.ts`                                                | `pushSubscriptions` テーブル定義・型                  |
| 追記 | `packages/infrastructure/tests/testing/create-test-db.ts`                                 | DDL 追記（罠 6）                                      |
| 新規 | `apps/web/src/db/migrations/0008_xxxxx.sql` + `meta/0008_snapshot.json`                   | `drizzle-kit generate` 自動生成                       |
| 追記 | `apps/web/src/db/migrations/meta/_journal.json`                                           | 自動更新                                              |
| 新規 | `packages/infrastructure/src/repositories/drizzle-push-subscription.repository.ts`        | `DrizzlePushSubscriptionRepository`                   |
| 新規 | `packages/infrastructure/src/notification/web-push-sender.ts`                             | `WebPushSender`                                       |
| 追記 | `packages/infrastructure/src/index.ts`                                                    | 2 export 追加                                         |
| 追記 | `packages/infrastructure/package.json`                                                    | `web-push` 依存追加（下記 2-5 参照）                  |
| 追記 | ルート `package.json`                                                                     | 必要なら `pnpm.overrides` 調整（下記 2-0 参照。任意） |
| 新規 | `packages/infrastructure/tests/repositories/drizzle-push-subscription.repository.test.ts` | PGlite 統合テスト                                     |
| 新規 | `packages/infrastructure/tests/notification/web-push-sender.test.ts`                      | `web-push` のモックテスト                             |

### 2-0. 依存関係の事前対応（Should。含める理由を明記）

`pnpm audit` の現状（security-reviewer 実測・2026-08-09）は high 4（`brace-expansion`
×3・`js-yaml` ×1。いずれも dev 依存の `eslint` 配下で実害なし）/ moderate 3（`hono`
4.12.33。`memo()`/language ミドルウェア/proxy ヘルパー由来だが該当機能は未使用）/
low 2。**このうち `hono` のアップグレードのみ本 Step に含める**（理由: 本ユニットは
`apps/web/src/server/routes/push.ts`/`cron.ts` で Hono ルートを 2 本追加し、まさにこの
`hono` パッケージに触れる PR であるため、追加前にパッチ版を上げておくのが自然。1 行の
`package.json` 変更で済み、既存機能への影響が無いことは moderate 3 件とも「該当機能未使用」
と確認済み）。

```bash
pnpm --filter @cookpit/web update hono
```

`brace-expansion`/`js-yaml`（dev 依存の `eslint` 配下）と `pnpm.overrides` の範囲修正は
本ユニットのスコープ外とする（本ユニットが悪化させたものではなく、`hono` のように本ユニットが
直接触るファイルとも関係が無いため）。対応する場合は別タスクとして Orchestrator に報告する。

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
不要（前提確認 2）。既存 9 テーブルの定義は一切変更しない。DB 列自体は `p256dh`/`auth` とも
`text`（無制限）のままでよい（長さ制約は Step 4 の api-contract 境界で行う。P-17）。

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
import { PushSubscription, PushSubscriptionId } from '@cookpit/domain';
import type { PushSubscriptionRepository } from '@cookpit/domain';
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

**Unit A の罠の再発防止**: `save()` の `onConflictDoUpdate` の `set` 句に `p256dh`/`auth` を
必ず含める。PGlite テストで「同一 `endpoint` を異なる鍵で再 `save()` → `findByEndpoint()` が
新しい鍵を返す」を必ずカバーする。`deleteByEndpoints([])` は空配列ガードを入れる。

### 2-5. `WebPushSender`（`web-push` 依存の追加先の訂正 + P-17 対応の前提）

**追加先パッケージの訂正**: 依頼文は「`web-push` を `apps/web/package.json` に追加」だが、
実際に `import webpush from 'web-push'` を書くのは
`packages/infrastructure/src/notification/web-push-sender.ts` であるため、`web-push` は
**`packages/infrastructure/package.json` の `dependencies` に追加する**。pnpm workspace は
phantom dependency を許さないため、`apps/web/package.json` にだけ追加しても
`packages/infrastructure` からは解決できない（前提確認 7 の依存関係とも整合）。

```bash
pnpm --filter @cookpit/infrastructure add web-push
```

型定義の要否を実装時に確認する（`web-push` 本体に型が同梱されていなければ
`pnpm --filter @cookpit/infrastructure add -D @types/web-push` を追加する）。

**依存追加後の `pnpm audit` 再実行（必須。security-reviewer 指摘）**:

```bash
pnpm audit
```

`web-push` 配下の推移的依存（HTTP クライアント・JWT 関連ライブラリ等）に high/critical が
出ないことを確認する。出た場合は `pnpm.overrides` で解決するか、解決できなければ
Orchestrator へ差し戻す（`web-push` の代替案の要否を判断してもらう）。2026-08-09 時点の
`pnpm audit`（`web-push` 未導入）は high 4/moderate 3/low 2 のみで、いずれも本ユニットに
無関係と確認済み（security-reviewer レビュー）。これはベースラインであり、`web-push` 追加後の
差分の有無を確認する基準にする。

```ts
// packages/infrastructure/src/notification/web-push-sender.ts
import webpush from 'web-push';
import type {
  PushPayload,
  PushSendResult,
  PushSender,
  PushSubscriptionTarget,
} from '@cookpit/domain';

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
> `repositories.ts` のファクトリ）呼び出し時に発生し、`apps/web/src/server/app.ts` の
> `onError` 3 段目（500 `Internal Server Error`）に落ちる（契約書 §5-3「予期しない例外」）。
>
> **P-17（`p256dh`/`auth` の長さ制約）との関係**: api-contract 境界（Step 4）で長さを
> `min(86).max(88)`/`min(22).max(24)` に制約することで、`web-push` が送信直前に長さ不正で
> 例外を投げるケース（`reason: 'other'` に落ちて購読が削除されず恒久的に失敗し続ける。
> security-reviewer M-4）を購読登録の時点で防ぐ。`WebPushSender` 自体にはコード変更は無い
> （境界での防御のみで足りる）。

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
  返す（行数は増えない）
- `endpoint` の `UNIQUE` 制約（直接 INSERT の重複が拒否される）
- `deleteByEndpoint()`: 存在する/しない両方で例外を投げない
- `deleteByEndpoints([])`: 例外を投げず何もしない
- `deleteByEndpoints([...])`: 複数件を 1 回の `DELETE` でまとめて削除する

`packages/infrastructure/tests/notification/web-push-sender.test.ts`（`web-push` をモック）:

- `send()` が成功時 `{ ok: true }` を返す
- `sendNotification` が `statusCode: 404`/`410` を投げると `{ ok: false, reason: 'invalid_subscription' }`
- それ以外のエラーでは `{ ok: false, reason: 'other' }`
- コンストラクタが `webpush.setVapidDetails` を正しい引数で呼ぶこと

### 完了条件

```bash
pnpm --filter @cookpit/infrastructure test
pnpm --filter @cookpit/infrastructure type-check
pnpm lint
pnpm audit   # web-push 追加後。high/critical の新規混入が無いこと
```

- `schema.ts`/`create-test-db.ts` に既存 9 テーブル分の変更がないこと
- `create-test-db.ts` への DDL 追記漏れがあると本 Step のテストが全滅する（罠 6 の即時検知）
- `packages/infrastructure/package.json` に `web-push` が追加されていること
- `pnpm audit` の high/critical が `web-push` 追加前のベースライン（本計画作成時点で high
  4/moderate 3/low 2、いずれも無関係）から増えていないこと

---

## Step 3: Application 層 — 期限判定ロジック移設 + 通知 UseCase + 購読上限

**依存**: Step 1（Domain の型）。実際の DI 配線確認は Step 2（Repository 実装）完了後が
望ましいが、型検査は Step 1 のみで通る。

### 対象ファイル

| #   | 種別 | ファイル                                                                                 | 内容                                                          |
| --- | ---- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | 新規 | `packages/application/src/pantry/expiry.ts`                                              | `apps/web/_utils/expiry.ts` の全 6 export を移設（P-14 確定） |
| 2   | 新規 | `packages/application/src/pantry/get-expiring-stocks.use-case.ts`                        | `GetExpiringStocksUseCase`                                    |
| 3   | 追記 | `packages/application/src/pantry/index.ts`                                               | 2 export 追加                                                 |
| 4   | 新規 | `packages/application/src/notification/too-many-subscriptions.error.ts`                  | `TooManySubscriptionsError`（P-15）                           |
| 5   | 新規 | `packages/application/src/notification/send-expiry-alerts.use-case.ts`                   | `SendExpiryAlertsUseCase` + `SendExpiryAlertsResultDto`       |
| 6   | 新規 | `packages/application/src/notification/subscribe-to-expiry-alert.use-case.ts`            | `SubscribeToExpiryAlertUseCase`（上限判定込み。P-15）         |
| 7   | 新規 | `packages/application/src/notification/unsubscribe-from-expiry-alert.use-case.ts`        | `UnsubscribeFromExpiryAlertUseCase`                           |
| 8   | 新規 | `packages/application/src/notification/index.ts`                                         | バレル                                                        |
| 9   | 追記 | `packages/application/src/index.ts`                                                      | `export * from './notification'` 追加                         |
| 10  | 新規 | `packages/application/tests/pantry/expiry.test.ts`                                       | 移設テスト（前提確認 13）                                     |
| 11  | 新規 | `packages/application/tests/pantry/get-expiring-stocks.use-case.test.ts`                 | InMemory テスト                                               |
| 12  | 新規 | `packages/application/tests/notification/send-expiry-alerts.use-case.test.ts`            | モック `PushSender`                                           |
| 13  | 新規 | `packages/application/tests/notification/subscribe-to-expiry-alert.use-case.test.ts`     | InMemory テスト + 上限テスト（P-15）                          |
| 14  | 新規 | `packages/application/tests/notification/unsubscribe-from-expiry-alert.use-case.test.ts` | InMemory テスト                                               |

### 3-1. `expiry.ts` の移設（P-14 確定 — `formatExpiryUrgencyLabel` を含め全 6 export を移設）

設計書の当初の P-4 は「`formatExpiryUrgencyLabel`（人間可読な文言）は UI 表示専用として
`apps/web/src/app/_utils/` に残す」としていたが、P-7（「通知本文は `formatExpiryUrgencyLabel`
に依存する」）と両立しないことを本計画の前バージョンで指摘し、**P-14 としてユーザー確定済み**
（`formatExpiryUrgencyLabel` も含め全 6 export を Application へ移設し、P-4 の当該部分を
取り消す）。

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
import type { PantryRepository } from '@cookpit/domain';
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

### 3-4. `too-many-subscriptions.error.ts`（P-15）

```ts
// packages/application/src/notification/too-many-subscriptions.error.ts
import { InvalidOperationError } from '../shared/errors';

/**
 * 購読件数が上限に達した状態で新規 endpoint を購読しようとしたことを表す（P-15。
 * security-reviewer H-1: 無認証 subscribe の悪用防止）。
 */
export class TooManySubscriptionsError extends InvalidOperationError {
  constructor(limit: number) {
    super(`Too many push subscriptions (max ${limit})`);
  }
}
```

既存の `StockNotFoundError`/`InvalidStockOperationError`（前提確認 16）と同型。
`InvalidOperationError` を継承するため `app.ts` の既存 `onError`（変更不要）が自動的に
422 へ変換する。

### 3-5. `notification/` 3 UseCase

```ts
// subscribe-to-expiry-alert.use-case.ts
import { PushSubscription } from '@cookpit/domain';
import type { PushSubscriptionRepository } from '@cookpit/domain';
import { TooManySubscriptionsError } from './too-many-subscriptions.error';

export interface SubscribeToExpiryAlertInputDto {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** 購読件数の上限（P-15 確定）。既存 endpoint の再登録（upsert）は対象外。 */
export const MAX_SUBSCRIPTION_COUNT = 10;

/**
 * endpoint が既存なら鍵を更新（upsert）、無ければ新規購読を作成する（P-8）。
 * 新規購読時のみ `MAX_SUBSCRIPTION_COUNT` の上限を適用する（P-15。既存 endpoint の
 * 再登録は上限の対象外 — 正規利用者が再購読できなくなるのを防ぐ）。
 *
 * @throws TooManySubscriptionsError 新規 endpoint かつ既存購読数が上限以上の場合
 */
export class SubscribeToExpiryAlertUseCase {
  constructor(private readonly pushSubscriptionRepository: PushSubscriptionRepository) {}

  async execute(input: SubscribeToExpiryAlertInputDto): Promise<void> {
    const existing = await this.pushSubscriptionRepository.findByEndpoint(input.endpoint);

    if (existing === null) {
      const currentCount = (await this.pushSubscriptionRepository.findAll()).length;
      if (currentCount >= MAX_SUBSCRIPTION_COUNT) {
        throw new TooManySubscriptionsError(MAX_SUBSCRIPTION_COUNT);
      }
    }

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

`findAll()` で件数を数える実装は、既存の `PushSubscriptionRepository` にメソッドを追加せずに
済む選択（1-3 参照）。想定購読数は 2 桁未満（設計書 §性能）のため、`findByEndpoint()` と
`findAll()` の 2 回の DB 往復（新規購読時のみ）は許容範囲と判断した。

```ts
// unsubscribe-from-expiry-alert.use-case.ts
import type { PushSubscriptionRepository } from '@cookpit/domain';

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
import type {
  PantryRepository,
  PushPayload,
  PushSender,
  PushSubscriptionRepository,
} from '@cookpit/domain';
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
`expiresAt !== null` の在庫のみを含む不変条件に依拠する。通知タイトル・本文の日本語文言は
設計書に明記が無いため本計画での補完であり、test-designer/reviewer が文言レビューの対象に
含めること。

### 3-6. `notification/index.ts`

```ts
export * from './send-expiry-alerts.use-case';
export * from './subscribe-to-expiry-alert.use-case';
export * from './too-many-subscriptions.error';
export * from './unsubscribe-from-expiry-alert.use-case';
```

### 3-7. `application/src/index.ts` 追記

```ts
export * from './notification';
```

### 既存テストの移設（前提確認 13 に対応）

`apps/web/tests/app/_utils/dashboard-view.node.test.ts` のうち以下を
`packages/application/tests/pantry/expiry.test.ts` へ**そのまま移設**する（アサーション内容は
変更不要、import パスのみ差し替え）。

- `describe('selectExpiringStocks', ...)`（全 5 ケース）
- `describe('getExpiryRemainingDays', ...)`（EU-01〜EU-08）
- `describe('EXPIRY_URGENCY_WITHIN_DAYS', ...)`（EXP-03）
- `describe('getExpiryUrgency', ...)`（EU-09〜EU-12）
- `describe('formatExpiryUrgencyLabel', ...)`（EU-13〜EU-18）

残す `describe('MEAL_PLAN_STATUS_LABELS', ...)` は Step 6 で扱う。

### 追加テスト（新規分）

- `GetExpiringStocksUseCase`: 空 Pantry で `[]`／閾値境界／`expiresAt` null 除外
- `SubscribeToExpiryAlertUseCase`:
  - 新規 `endpoint` で作成／既存 `endpoint` で `id` を保持したまま鍵が更新される（upsert）
  - **P-15**: 既存購読が `MAX_SUBSCRIPTION_COUNT - 1`（9 件）の状態で新規 `endpoint` を
    subscribe → 成功し 10 件になる（境界）
  - **P-15**: 既存購読が `MAX_SUBSCRIPTION_COUNT`（10 件）の状態で新規 `endpoint` を
    subscribe → `TooManySubscriptionsError` を throw する
  - **P-15**: 既存購読が上限に達していても、**既存 `endpoint` の再登録**（upsert 経路）は
    成功する（上限の対象外であることの確認）
- `UnsubscribeFromExpiryAlertUseCase`: 存在する/しない `endpoint` の両方で例外を投げない
- `SendExpiryAlertsUseCase`（モック `PushSender`）: 購読 0 件／在庫 0 件／数量 0 のみの在庫
  （P-10b の除外）／全件成功／一部 404-410（`deleteByEndpoints` が 1 回だけ呼ばれる）／
  一部ネットワークエラー（購読を消さない）／`Promise.allSettled` が一部 reject でも UseCase
  全体を失敗させない

### 完了条件

```bash
pnpm --filter @cookpit/application test
pnpm --filter @cookpit/application type-check
pnpm lint
```

- `apps/web/tests/app/_utils/dashboard-view.node.test.ts` から移設したテストケースが
  1 件も欠落せず `packages/application/tests/pantry/expiry.test.ts` に存在すること
- `deleteByEndpoints` が N+1 にならないこと（モックの呼び出し回数アサーション）
- P-15 の 3 ケース（上限未満成功・上限到達で 422 相当・upsert は対象外）がテストされていること

---

## Step 4: api-contract 層 — Zod スキーマ

**依存**: なし（型は独立に定義可能。Step 3 の DTO 構造との整合は目視確認）

### 対象ファイル

| 種別 | ファイル                                                       | 内容                              |
| ---- | -------------------------------------------------------------- | --------------------------------- |
| 新規 | `packages/api-contract/src/push-subscription.schema.ts`        | 6 スキーマ + 型（P-16/P-17 反映） |
| 追記 | `packages/api-contract/src/index.ts`                           | 1 export 追加                     |
| 新規 | `packages/api-contract/tests/push-subscription.schema.test.ts` | バリデーションテスト              |

### 4-1. 契約設計書との差異について（重要・実装前に確認すること）

`docs/designs/expiry-alert.contract.md` §3.1 の Zod コード例は、本改訂時点（2026-08-09）で
**P-16/P-17 を反映しておらず旧版のまま**（`pushEndpointSchema` が `startsWith('https://')`
の文字列前方一致のみ・ホスト検証なし、`p256dh`/`auth` が `min(1)` のまま。実測確認済み）。
一方 `docs/designs/expiry-alert.md`（本体設計書）§セキュリティは P-16/P-17 として具体的な
検証内容を確定済み（`new URL(value).hostname`/`.protocol` を使うこと、IP リテラルと
`localhost`/`.local`/`.internal` を拒否すること、`p256dh` は `.min(86).max(88)`、`auth` は
`.min(22).max(24)`）。**本 Step は本体設計書の確定文言を優先して実装する。** 契約設計書
§3.1 のコード更新は本計画の対象外（他 Agent の担当）だが、乖離があることを
§Orchestrator への申し送り に記録した。

### 4-2. `push-subscription.schema.ts`（P-16/P-17 反映後の完成形）

`pushSubscriptionKeysSchema`/`subscribeToExpiryAlertSchema`/
`unsubscribeFromExpiryAlertSchema`/`vapidPublicKeyResponseSchema`/
`expiryAlertsCronResultSchema` の構造は契約書 §3.1 のまま変更しない。`pushEndpointSchema`
と `p256dh`/`auth` の制約のみ以下のとおり更新する。

```ts
// pushEndpointSchema（更新後）
function isDisallowedHost(hostname: string): boolean {
  // IPv4 リテラル（例: 127.0.0.1）
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  // IPv6 リテラル（URL().hostname はブラケット付きで返る。例: [::1]）
  if (hostname.startsWith('[') && hostname.endsWith(']')) return true;
  // 内部ホスト（P-16 確定）
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return true;
  }
  return false;
}

export const pushEndpointSchema = z
  .url()
  .max(2048)
  .refine(
    (value) => {
      try {
        return new URL(value).protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'endpoint must be an https URL' },
  )
  .refine(
    (value) => {
      try {
        return !isDisallowedHost(new URL(value).hostname);
      } catch {
        return false;
      }
    },
    { message: 'endpoint host is not allowed' },
  );
```

```ts
// pushSubscriptionKeysSchema（更新後。P-17）
export const pushSubscriptionKeysSchema = z.object({
  p256dh: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, 'p256dh must be base64url')
    .min(86)
    .max(88),
  auth: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, 'auth must be base64url')
    .min(22)
    .max(24),
});
```

`isDisallowedHost` の IPv4/IPv6 判定は実装時に test-designer のテストケース（IPv4 各種表記・
IPv6 の省略記法・ブラケット有無等）と突き合わせて確定させること。判定に使う正規表現・分岐が
このコード例と異なっていても、**「`new URL().hostname` を経由し文字列の前方一致・`includes`
を使わない」という P-16 の必須要件さえ満たせば実装の細部は implementer の裁量とする**
（security-reviewer M-1 が明示的に禁止しているのは文字列前方一致のみで、判定ロジックの実装
詳細までは規定していない）。

### 4-3. `index.ts` 追記

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
  base64url 文字集合）に加え、以下を追加でテストすること
  - `endpoint` の IPv4 リテラル（`https://127.0.0.1/x`）・IPv6 リテラル（`https://[::1]/x`）・
    `localhost`/`*.local`/`*.internal` を reject する（P-16）
  - `https://evil.example@fcm.googleapis.com/x`（ユーザー情報を使った偽装）と
    `https://fcm.googleapis.com.evil.example/x`（サブドメイン偽装）を reject する
    （文字列前方一致では通ってしまうケース。P-16 の核心）
  - `p256dh` が 85 文字以下／89 文字以上を reject し、86〜88 文字を accept する（P-17）
  - `auth` が 21 文字以下／25 文字以上を reject し、22〜24 文字を accept する（P-17）
  - `expiryAlertsCronResultSchema` の非負整数制約（既存のまま）

---

## Step 5: Presentation 層（API）— Hono ルート

**依存**: Step 2（`DrizzlePushSubscriptionRepository`/`WebPushSender`）、Step 3
（3 UseCase）、Step 4（Zod スキーマ）

### 対象ファイル

| 種別 | ファイル                                    | 内容                                                                                    |
| ---- | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| 新規 | `apps/web/src/server/routes/push.ts`        | `pushRoute`（Cache-Control 追加）                                                       |
| 新規 | `apps/web/src/server/routes/cron.ts`        | `cronRoute`（Cache-Control 追加）                                                       |
| 追記 | `apps/web/src/server/app.ts`                | `.route('/push', pushRoute)` / `.route('/cron', cronRoute)` 追加                        |
| 追記 | `apps/web/src/server/repositories.ts`       | `pushSubscriptionRepository()`/`pushSender()` 追加 + `import 'server-only'`（下記 5-1） |
| 追記 | `apps/web/package.json`                     | `server-only` 依存追加（下記 5-1）                                                      |
| 新規 | `apps/web/tests/server/routes/push.test.ts` | 契約書 §10.2 準拠 + 422 ケース（P-15）                                                  |
| 新規 | `apps/web/tests/server/routes/cron.test.ts` | 契約書 §10.2 準拠                                                                       |

### 5-1. `repositories.ts` 追記（Nice 対応: `server-only` を採用する）

security-reviewer の Nice 指摘「`repositories.ts` の先頭に `import 'server-only'` を足すと
VAPID 秘密鍵がクライアントへ漏れない構造を型で固定できる」を**採用する**。理由:
(1) 本ユニットで VAPID 秘密鍵という新しい秘密情報をこのファイルに持ち込む PR そのものであり、
スコープ外のリファクタリングではなく今回追加するコードを堅牢にする変更である、
(2) 追加コストが 1 行 + 1 依存のみ、(3) `repositories.ts` は Server Component / Hono ルート
専用ファイルであり誤ってクライアントから import されることは想定されていないが、`server-only`
はその前提を型検査で強制できる。**リポジトリ全体で `server-only` の使用は現状 0 件のため、
新しい規約を持ち込むことになる**点は申し送りとして記録する（§Orchestrator への申し送り）。

```bash
pnpm --filter @cookpit/web add server-only
```

```ts
import 'server-only';

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

/**
 * VAPID 環境変数 3 点を検証する。1 つでも未設定・空文字なら null を返す。
 *
 * 要件 E-7 / 確定 P-12「全エンドポイントで 500 フェイルクローズに揃える」の実装。
 * `?? ''` で空文字を渡すと `setVapidDetails` の throw に依存した「偶然の 500」になり、
 * 要件 E-2 の「明示的にガードする」と矛盾する。さらに `app.onError` 経由の
 * `Internal Server Error` になるため、設定不備と実行時障害をログで切り分けられない。
 */
export function readVapidConfig(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (
    publicKey === undefined ||
    publicKey === '' ||
    privateKey === undefined ||
    privateKey === '' ||
    subject === undefined ||
    subject === ''
  ) {
    return null;
  }
  return { publicKey, privateKey, subject };
}

/** 検証済みの VAPID 設定だけを受け取る。`?? ''` によるフォールバックは置かない。 */
export function pushSender(vapid: {
  publicKey: string;
  privateKey: string;
  subject: string;
}): WebPushSender {
  return new WebPushSender(vapid.publicKey, vapid.privateKey, vapid.subject);
}
```

> **reviewer M-3**: 改訂前は `pushSender()` が `process.env.VAPID_PRIVATE_KEY ?? ''` を
> 使っており、**P-12 が `vapid-public-key` から取り除いたのと同じパターン**が Cron 経路に
> 残っていた。要件 E-7 は設計・契約・試験のどこにも実装されていなかった。

### 5-2. `routes/push.ts`（Cache-Control 追加。L-5）

```ts
import { zValidator } from '@hono/zod-validator';
import {
  subscribeToExpiryAlertSchema,
  unsubscribeFromExpiryAlertSchema,
} from '@cookpit/api-contract';
import {
  SubscribeToExpiryAlertUseCase,
  UnsubscribeFromExpiryAlertUseCase,
} from '@cookpit/application';
import { Hono } from 'hono';
import { pushSubscriptionRepository } from '../repositories';

export const pushRoute = new Hono()
  .get('/vapid-public-key', (c) => {
    c.header('Cache-Control', 'no-store');
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (publicKey === undefined || publicKey === '') {
      console.error('VAPID_PUBLIC_KEY is not configured');
      return c.json({ error: 'Server misconfigured' }, 500);
    }
    return c.json({ publicKey }, 200);
  })
  .post('/subscribe', zValidator('json', subscribeToExpiryAlertSchema), async (c) => {
    c.header('Cache-Control', 'no-store');
    const body = c.req.valid('json');
    await new SubscribeToExpiryAlertUseCase(pushSubscriptionRepository()).execute({
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    });
    return c.body(null, 204);
  })
  .post('/unsubscribe', zValidator('json', unsubscribeFromExpiryAlertSchema), async (c) => {
    c.header('Cache-Control', 'no-store');
    const { endpoint } = c.req.valid('json');
    await new UnsubscribeFromExpiryAlertUseCase(pushSubscriptionRepository()).execute({ endpoint });
    return c.body(null, 204);
  });
```

**P-15 により `POST /subscribe` は 204/400 に加え `TooManySubscriptionsError`
（`InvalidOperationError` のサブクラス）経由で 422 を返しうる。** ルートのコード変更は不要
（既存 `app.onError` の 2 段目がそのまま処理する）が、契約・テスト側のステータス一覧を更新する
必要がある（下記追加テスト参照）。

### 5-3. `routes/cron.ts`（Cache-Control 追加。L-5）

```ts
import { SendExpiryAlertsUseCase } from '@cookpit/application';
import { Hono } from 'hono';
import {
  pantryRepository,
  pushSender,
  pushSubscriptionRepository,
  readVapidConfig,
} from '../repositories';

export const cronRoute = new Hono().get('/expiry-alerts', async (c) => {
  c.header('Cache-Control', 'no-store');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret === undefined || cronSecret === '') {
    console.error('CRON_SECRET is not configured');
    return c.json({ error: 'Server misconfigured' }, 500);
  }
  if (c.req.header('authorization') !== `Bearer ${cronSecret}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // 要件 E-7 / P-12。認証チェックの後に置くのは、未認証の呼び出し元へ設定状態を漏らさないため。
  const vapid = readVapidConfig();
  if (vapid === null) {
    console.error('VAPID environment variables are not configured');
    return c.json({ error: 'Server misconfigured' }, 500);
  }

  const result = await new SendExpiryAlertsUseCase(
    pantryRepository(),
    pushSubscriptionRepository(),
    pushSender(vapid),
  ).execute(new Date());

  console.log('expiry-alerts cron result', result);
  return c.json(result, 200);
});
```

`CRON_SECRET` 未設定チェックが `Authorization` ヘッダー比較より**先**であること（契約書 §5-3）。

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

`onError`（L24-33）は変更しない。

### 追加テスト

- `push.test.ts`: `GET /vapid-public-key` の 200/500（未設定・空文字それぞれ）／
  `POST /subscribe` の 204（UseCase への引数が平坦化されて渡ること）と 400 × 3 に加え、
  **422（`TooManySubscriptionsError` を UseCase がモックで throw した場合。P-15）**／
  `POST /unsubscribe` の 204（存在しない endpoint 含む）と 400／全レスポンスに
  `Cache-Control: no-store` が付くこと（L-5）
- `cron.test.ts`: 200（正しい Bearer）／401（欠落・不一致、`CRON_SECRET` 設定済み）／
  500（`CRON_SECRET` 未設定）／レスポンスボディが `ExpiryAlertsCronResult` の 4 フィールドと
  一致すること／`Cache-Control: no-store` が付くこと（L-5）

### 完了条件

```bash
pnpm --filter @cookpit/web test
pnpm --filter @cookpit/web type-check
pnpm lint
```

- `app.ts` の既存 `onError` 3 分岐が無変更であること
- `AppType` の型が既存のまま構造的部分型で維持されること
- `repositories.ts` の `import 'server-only'` により、Client Component から
  `pushSubscriptionRepository`/`pushSender` を import しようとするとビルドエラーになること
  （手元での簡易確認でよい。既存の他 6 関数も同じファイルにあるため、この変更で既存関数の
  呼び出し元（すべて Server Component/Hono ルート）に影響が無いことを確認する）

---

## Step 6: 既存 UI 差し替え（P-4/P-14）— dev で検証可能な範囲

**依存**: Step 3（`GetExpiringStocksUseCase`・移設済み `expiry.ts`）

### 対象ファイル

| 種別     | ファイル                                                   | 変更内容                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 削除     | `apps/web/src/app/_utils/expiry.ts`                        | 全 export を Step 3-1 で移設済みのため削除（P-14）                                                                                                                                                             |
| 変更     | `apps/web/src/app/_utils/dashboard-view.ts`                | `selectExpiringStocks` と `expiry.ts` の import を削除。`MEAL_PLAN_STATUS_LABELS` のみ残す                                                                                                                     |
| 変更     | `apps/web/src/app/page.tsx`                                | `GetExpiringStocksUseCase` 呼び出しに差し替え                                                                                                                                                                  |
| 変更     | `apps/web/src/app/_components/dashboard.tsx`               | import 元を `@/app/_utils/expiry` → `@cookpit/application` に変更（3 関数）                                                                                                                                    |
| 変更     | `apps/web/src/app/pantry/_components/stock-row.tsx`        | import 元を `@/app/_utils/expiry` → `@cookpit/application` に変更（5 export。R-12 のバンドルサイズ確認対象）                                                                                                   |
| 変更     | `apps/web/tests/app/_utils/dashboard-view.node.test.ts`    | `selectExpiringStocks`/`getExpiryRemainingDays`/`EXPIRY_URGENCY_WITHIN_DAYS`/`getExpiryUrgency`/`formatExpiryUrgencyLabel` の describe ブロックを削除（Step 3 で移設済み）。`MEAL_PLAN_STATUS_LABELS` のみ残す |
| 確認のみ | `apps/web/tests/app/pantry/_components/stock-row.test.tsx` | import 変更後も既存アサーションが通ることを確認                                                                                                                                                                |
| 確認のみ | `apps/web/tests/app/_components/dashboard.test.tsx`        | 同上                                                                                                                                                                                                           |

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

### 6-2. `dashboard-view.ts`

`selectExpiringStocks` 関数本体と `import { parseExpiryDate, toLocalMidnight } from './expiry';`
を削除する。残る内容は `MEAL_PLAN_STATUS_LABELS` の定義のみ。

### 6-3. `dashboard.tsx` / `stock-row.tsx` の import 差し替え

```ts
// dashboard.tsx（変更前）
import {
  formatExpiryUrgencyLabel,
  getExpiryRemainingDays,
  getExpiryUrgency,
} from '@/app/_utils/expiry';
// ↓
import {
  formatExpiryUrgencyLabel,
  getExpiryRemainingDays,
  getExpiryUrgency,
} from '@cookpit/application';
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
> `@cookpit/application` からの import はクライアントバンドルに含まれる。実装時に
> `pnpm --filter @cookpit/web build` 後のバンドルサイズを 1 度確認することを推奨する
> （断定しない。悪化が見られた場合はサブパス import への切り替えを検討し、必要なら
> Orchestrator へ報告する）。

### 完了条件

```bash
pnpm --filter @cookpit/web test
pnpm --filter @cookpit/web type-check
pnpm lint
pnpm --filter @cookpit/web build   # S-5: 本 Step でクライアントバンドルが壊れうるため必須
```

> **S-5（reviewer）**: `stock-row.tsx` からの `@cookpit/application` の**値** import は
> 本リポジトリ初（既存のクライアントコンポーネントは全て `import type`）。バレルは
> `@cookpit/domain` を辿り `identifier.ts:1` / `store.ts:1` が `node:crypto` を import する。
> したがって R-12 は「バンドルサイズ増」ではなく**クライアントバンドルのビルド失敗**リスクを
> 含む。**`build` を本 Step の完了条件に入れる**（改訂前は Step 8 まで `build` が登場せず、
> 失敗しても 2 Step 先まで気づけなかった）。
>
> 失敗した場合の回避策: `formatExpiryUrgencyLabel` / `getExpiryRemainingDays` /
> `getExpiryUrgency` など**クライアントが必要とする純粋関数だけを `node:crypto` を辿らない
> 別モジュール**（例 `packages/application/src/pantry/expiry.ts` を直接指す sub-path export）
> として公開する。バレル経由の値 import をやめる形になるため、採る場合は ADR-0010 との
> 整合を Orchestrator に確認すること。

- `apps/web/src/app/_utils/expiry.ts` が存在しないこと（削除確認）
- `apps/web/tests/app/_utils/dashboard-view.node.test.ts` に `MEAL_PLAN_STATUS_LABELS` の
  テストのみが残ること
- `stock-row.test.tsx`/`dashboard.test.tsx` が import 変更後も green であること
- ダッシュボード・`/pantry` の表示結果が移設前後で変わらないこと（回帰確認）

---

## Step 7: 環境変数の準備・`.gitignore`/`.env.example`・`vercel.json` の新設

**依存**: なし（Step 1〜6 と並行して進められるが、Cron が実際に動くのは全レイヤー完了後）

### 7-1. `.gitignore` の更新（H-2・必須）

現状（前提確認 14）の L11-14 を以下に置き換える。

```diff
-# Environment variables
-.env
-.env.local
-.env.*.local
+# Environment variables
+.env*
+!.env.example
```

`.env*` は `.env.production`/`.env.development`/`.env.test`/`.env.preview` 等、これまで
追跡対象のままだったファイルも含めて無視する。`!.env.example` で例外的に追跡する。

### 7-2. `apps/web/.env.example` の新設（H-2・必須。新規作成ファイル一覧 #34）

キー名とフォーマット注記のみを記載し、値は空にする。

```
DATABASE_URL=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=  # mailto: か https:// のみ（罠 8）
CRON_SECRET=  # openssl rand -base64 32
# TZ は設定しない（Vercel の予約環境変数。P-5 改）
```

### 7-3. 環境変数の準備（Vercel プロジェクト設定）

| #   | 項目                                     | 値・手順                                                                                                                                          |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` 等で生成し Vercel プロジェクト環境変数に設定                                                                   |
| 2   | `VAPID_SUBJECT`                          | `mailto:` または HTTPS URL（罠 8）                                                                                                                |
| 3   | `CRON_SECRET`                            | **`openssl rand -base64 32`（256 bit）で生成する（M-2 確定）。** 401 に対するレート制限が無いため、総当たり耐性は秘密のエントロピーのみに依存する |
| 4   | `TZ`                                     | `Asia/Tokyo`（罠 5・R-5・R-6。`vercel.json` の `schedule` 自体は `TZ` の影響を受けず常に UTC）                                                    |
| 5   | `vercel.json`（新規）                    | 下記コード                                                                                                                                        |

```json
{
  "crons": [{ "path": "/api/cron/expiry-alerts", "schedule": "0 23 * * *" }]
}
```

`0 23 * * *`（UTC）= JST 08:00 台（P-10a 確定）。**Vercel は `CRON_SECRET` 環境変数が
設定されているとき、Cron 実行に `Authorization: Bearer $CRON_SECRET` を自動的に付与する**
（M-2。プラットフォーム仕様。設定漏れ時に 401 が連発する場合はこの自動付与が働いていない
ことを疑う切り分け材料になる）。Vercel Hobby では発火が指定時刻から 1 時間ブレる（罠 7）。

### 完了条件

- `.gitignore` が `.env*`/`!.env.example` に更新されていること
- `apps/web/.env.example` が新設され、値が空でキー名・注記のみであること
- `git status` で秘密値を含むファイルがステージされていないこと（`git add` 後に必ず確認する。
  システムリマインダーの指示どおり、疑わしいファイルは中身を確認してから push する）
- Vercel プロジェクト設定で 5 つの環境変数が Production/Preview 双方に設定されていることを
  目視確認する（Preview は Step 9 で本番と別鍵にする。7-3 とは別の鍵ペアになる点に注意）
- `vercel.json` が JSON として妥当であること
- `Cron の実行時間上限（maxDuration）`（設計書 §性能。確認推奨）を Vercel ダッシュボードで
  確認し、必要なら `cron.ts` に `export const maxDuration = <値>;` を追加するか実装時に判断する

---

## Step 8: `sw.ts` への追加（入力検証込み）+ 購読 ON/OFF UI

**依存**: Step 5（`/api/push/*` エンドポイント）、Step 7（VAPID 公開鍵が配信可能であること）

dev では `apps/web/next.config.ts:24-29` により Service Worker が生成されないため（罠 1）、
本 Step のコード自体は dev で書けるが、動作確認は Vercel Preview Deployment 以降まで待つ
必要がある。

### 対象ファイル

| 種別 | ファイル                                                            | 変更内容                                                                  |
| ---- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 追記 | `apps/web/src/app/sw.ts`                                            | `push`/`notificationclick` ハンドラ追加（入力検証込み。L-3）              |
| 新規 | `apps/web/src/app/_components/expiry-alert-subscription.tsx`        | 購読 ON/OFF ボタン（Client Component）                                    |
| 変更 | `apps/web/src/app/_components/dashboard.tsx`                        | 「賞味期限が近い在庫」セクション内に `<ExpiryAlertSubscription />` を配置 |
| 新規 | `apps/web/tests/app/_components/expiry-alert-subscription.test.tsx` | `Notification`/`navigator.serviceWorker`/`PushManager` のモックテスト     |

### 8-1. `sw.ts` 追記（罠 2・L-3 — 既存 `runtimeCaching` 4 件に触れず、ペイロードを検証する）

> **型付けの制約（reviewer M-4。実測済み）**: `apps/web/tsconfig.json` の `lib` は
> `["dom", "dom.iterable", "esnext"]` で **`webworker` を含まない**。素の `self` は `Window`
> として解決されるため、`self.addEventListener('push', ...)` / `self.registration` /
> `self.clients` はいずれも型エラーになる。既存 `sw.ts:10` が
> `const sw = self as unknown as WorkerGlobalScope & typeof globalThis;` とキャストしているのは
> このため。**追記も必ずこの `sw` を経由すること。** 本 Step の完了条件に `type-check` が
> あるので、素の `self` で書くと着手直後に詰まる。`lib` への `webworker` 追加は `dom` と
> 型が衝突するため採らない（既存の回避策を踏襲する）。

```ts
// 既存の serwist.addEventListeners() の直後に追記。既存の `sw`（L10）を使う。
sw.addEventListener('push', (event) => {
  let data: { title?: unknown; body?: unknown; url?: unknown } | undefined;
  try {
    data = event.data?.json();
  } catch {
    return;
  }
  if (data === undefined || typeof data.title !== 'string' || typeof data.body !== 'string') {
    return;
  }
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';

  event.waitUntil(sw.registration.showNotification(data.title, { body: data.body, data: { url } }));
});

sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data as { url?: unknown } | undefined)?.url;
  const url = typeof rawUrl === 'string' && rawUrl.startsWith('/') ? rawUrl : '/';
  event.waitUntil(sw.clients.openWindow(url));
});
```

`PushEvent` / `NotificationEvent` の型が `sw` のキャスト先（`WorkerGlobalScope & typeof
globalThis`）で解決できるかは**実装時に確認する**。解決できない場合は `serwist` が
再エクスポートする型を使うか、既存の `declare global` ブロックに最小限の型宣言を足す
（**`lib` への `webworker` 追加はしない**）。

**L-3 対応（security-reviewer）**: `event.data?.json()` が不正 JSON で throw しうるため
try/catch する。`title`/`body` は `typeof === 'string'` を確認し、いずれかが文字列でなければ
通知を出さない（`return`）。`url` は `/` で始まる相対パスであることを確認し、そうでなければ
`/` にフォールバックする（外部サイトへの `openWindow` を防ぐ）。**既存 `Serwist` コンストラクタ
引数・`serwist.addEventListeners()` 呼び出しには一切手を入れない。**
`docs/tests/saturday-flow.md:83-86`（オフライン再訪問 O-01）の回帰テストを実装完了後に
実行して確認する。

### 8-2. `expiry-alert-subscription.tsx`

- ボタン押下（ユーザージェスチャ）を起点に `Notification.requestPermission()` →
  `navigator.serviceWorker.ready` → `registration.pushManager.subscribe({ userVisibleOnly:
true, applicationServerKey: <GET /api/push/vapid-public-key で取得した公開鍵> })`
  （罠 3: iOS はユーザージェスチャ起点でないと権限要求が失敗する）
- 成功したら `POST /api/push/subscribe` へ `{ endpoint, keys: { p256dh, auth } }` を送信
- **P-15 対応**: `POST /subscribe` が 422（購読件数の上限到達）を返した場合、UI は
  「これ以上の購読ができません」等のエラーメッセージを表示し、購読状態を ON にしない
  （`useApiAction` の失敗時挙動に乗せる。E-4/E-5 と同じエラー表示パターンを流用する）
- OFF は現在の `pushManager` の購読を取得して `unsubscribe()` を呼んだ上で
  `POST /api/push/unsubscribe` を呼ぶ
- 状態管理は既存の `apps/web/src/lib/use-api-action.ts`（`useApiAction` パターン A）を
  再利用する
- ブラウザが `PushManager` 非対応の場合はボタンを無効化し非対応である旨を表示する（E-4）
- 通知許可拒否時はエラーメッセージを表示し購読を作成しない（E-5）

`GET /api/push/vapid-public-key` から取得した公開鍵（base64url 文字列）は
`applicationServerKey` に渡す前に `Uint8Array` へ変換する処理が必要（標準的な
`urlBase64ToUint8Array` ヘルパー。本計画の補完）。

### 8-3. `dashboard.tsx` への配置

「賞味期限が近い在庫」セクション内に `<ExpiryAlertSubscription />` を追加する。具体的な
JSX 構造は既存セクションのマークアップに合わせて実装時に決める。

### 完了条件

```bash
pnpm --filter @cookpit/web test
pnpm --filter @cookpit/web type-check
pnpm lint
pnpm --filter @cookpit/web build   # Serwist 適用の本番ビルドが通ることを確認
```

- 既存 `runtimeCaching` 4 件のテストに回帰が無いこと
- `sw.ts` の `push`/`notificationclick` の入力検証テスト（不正 JSON・非文字列 `title`/`body`・
  外部 URL の `url`）が含まれること（L-3）
- `expiry-alert-subscription.test.tsx` が許可承認・拒否・非対応ブラウザ・**購読上限到達
  （422）** の 4 パターンをカバーすること
- 本番ビルド（`next build --webpack`）が成功し `public/sw.js` に両ハンドラが含まれること

---

## Step 9: iOS 実機確認（P-11）・リリース手順・最終品質ゲート

**依存**: Step 1〜8 すべて完了し、Vercel Preview Deployment が可能な状態

### 9-1. デプロイ順序（ADR-0017 §Migration に従う）

1. 環境変数（VAPID 鍵一式・`CRON_SECRET`）を Vercel に設定（Step 7）。**`TZ` は設定しない**
   — Vercel の予約変数のため登録できない（P-5 改）
2. Domain/Application/Infrastructure（Step 1〜3）と DB マイグレーション（Step 2）を含む PR を
   マージ
3. `vercel.json` を含む PR をマージ
4. 期限判定ロジック移設（Step 6）は移設前後で表示が挙動不変であることを確認してからリリース
5. UI（購読 ON/OFF・`sw.ts`。Step 8）は Cron・API・Domain/Application/Infrastructure が
   揃った後にリリースする
6. 機能フラグは導入しない

### 9-2. Preview/Production の鍵分離（M-3・必須）

**Vercel Preview Deployment は Deployment Protection を有効にしない限り、URL を知る者は
誰でもアクセスできる。** H-1（無認証 subscribe）と組み合わさると、Preview に本番と同じ鍵を
置くと誰でも本番相当の購読を作れてしまう。以下を必須とする。

1. **Preview 環境専用の VAPID 鍵ペアと `CRON_SECRET` を別途発行する**（本番とは異なる値）。
   検証完了後、Preview 環境の環境変数から破棄する
2. 手動 `curl` は `-H "Authorization: Bearer $CRON_SECRET"` のようにシェル変数を参照し、
   **実値を `docs/` / `logs/` / PR 本文 / チャット に貼らない**（本プロジェクトは `logs/`
   に作業記録を残す運用のため特に注意する）
3. 可能なら Preview に Vercel Deployment Protection を有効化する（任意。手動 `curl` に
   bypass token が必要になる手間があるため必須にはしない。Cron 自体は Production
   デプロイに対してのみ実行されるため Cron の動作には影響しない）

### 9-3. iOS 実機確認手順（P-11）

1. Vercel Preview Deployment の URL を iPhone Safari で開き、ホーム画面に追加する
2. ホーム画面から起動した PWA でダッシュボードの通知 ON ボタンを押す
3. 通知許可ダイアログを承認し、購読が `POST /api/push/subscribe` に届くことを確認する
4. `GET /api/cron/expiry-alerts` を `-H "Authorization: Bearer $CRON_SECRET"`（シェル変数
   参照。9-2 の Preview 専用の値）で手動実行し、通知が iPhone に届くことを確認する
5. 通知をタップし `/pantry` へ遷移することを確認する
6. 通知 OFF ボタンを押し、`POST /api/push/unsubscribe` が呼ばれ以後通知が来ないことを確認する
7. Android Chrome でも同じ手順を実施し、iOS 固有の失敗（罠 3・罠 8）が無いことと比較する
8. 検証完了後、9-2 の Preview 専用鍵を Vercel の環境変数から削除する

### 9-4. 最終品質ゲート

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm audit
```

- Step 1〜8 で追加した Vitest ファイルが全て green
- 既存テスト（Recipe/Product/Store/MealPlan/ShoppingList/Pantry/health/オフライン再訪問）に
  regression が無いこと
- スコープ外変更が無いこと
- `pnpm audit` に `web-push`/`server-only` 追加起因の high/critical が無いこと
- roadmap Sprint 8 完了条件 3 件目「期限が近い在庫にアプリを開かずに気づける」を満たすこと

---

## テスト計画への参照

各 Step の「追加テスト」節は実装計画作成時点での最低限の観点であり、**詳細な試験ケース網羅は
test-designer が `docs/tests/expiry-alert.md` として別途確定する**（並行作成中）。特に以下は
本改訂で追加した観点として必ず反映されるべきものとして申し送る。

- P-15（購読上限）: 上限未満・上限到達（422）・upsert は対象外、の 3 ケース
- P-16（ホスト検証）: IP リテラル・`localhost`/`.local`/`.internal`・ユーザー情報偽装・
  サブドメイン偽装の reject
- P-17（鍵長制約）: `p256dh`/`auth` の境界値（85/86/88/89 文字、21/22/24/25 文字）
- H-2: `.env.example` の値が空であること（誤ってコミット対象に実値が入らないことの静的確認）
- L-3: `sw.ts` の不正ペイロード（非 JSON・非文字列 `title`/`body`・外部 URL）
- L-5: push/cron 両ルートの `Cache-Control: no-store`
- 要件定義書 N-1〜N-8・E-1〜E-7・B-1〜B-6 の全件（既存分）
- 罠 7（Cron 発火の 1 時間ブレ）を前提にした試験観点は組まない（B-6）
- Step 3 で移設した既存テスト（EU-01〜EU-18・EXP-03 等）が
  `packages/application/tests/pantry/expiry.test.ts` で 1 件も欠落していないこと

テストランナーは Vitest。完了条件は各 Step の `pnpm lint`/`pnpm type-check`/`pnpm test`
（該当パッケージ）+ 全体の `pnpm lint`/`pnpm type-check`/`pnpm test`/`pnpm audit`（Step 9）。

---

## リスクと対策

| #       | リスク                                                                          | 影響                                                   | 対策（本計画での対応箇所）                                                          |
| ------- | ------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| R-1     | dev で SW が生成されず push 検証ができない（罠 1）                              | 実装者が詰まる                                         | Step 1〜6 を自動テストで固めた後に Step 8〜9 へ進む順序にした                       |
| R-2     | `sw.ts` 追記が既存 `runtimeCaching` 4 件を壊す（罠 2）                          | オフライン再訪問（O-01）の回帰                         | Step 8-1 で独立した `addEventListener` に限定し、回帰テストの実行を完了条件に含めた |
| R-3     | iOS の権限要求制約（罠 3）                                                      | iOS だけ通知が届かない                                 | Step 8-2 でボタン起点の実装を明記、Step 9-3 で iOS 実機確認を必須化                 |
| R-4     | VAPID 秘密鍵の露出（罠 4）                                                      | なりすまし送信                                         | Step 5-1 の `server-only` + 公開鍵専用エンドポイントで対応                          |
| R-5/R-6 | `TZ`/`vercel.json` の UTC/JST 混同（罠 5）                                      | 通知対象選定・発火時刻のズレ                           | Step 7-3 に UTC 変換値と設定手順を明記                                              |
| R-7     | PGlite テスト DDL の同期漏れ（罠 6）                                            | Repository テストが全滅                                | Step 2-2 で追記位置を実測済みの行番号で明記                                         |
| R-8     | Vercel Hobby の Cron 発火が 1 時間ブレる（罠 7）                                | 試験観点が成立しない                                   | Step 7・9-3 で「その日のうちに届く」粒度の確認にとどめる                            |
| R-9     | Apple の VAPID subject 制約（罠 8）                                             | iOS だけ 403                                           | Step 7-3 で `mailto:`/HTTPS URL を明記。Step 9-3 に iOS 実機確認を含める            |
| R-10    | 数量 0 の在庫が通知対象に混じる（罠 9）                                         | 空の在庫が通知され混乱                                 | Step 3-5 で `amount.value > 0` フィルタを実装                                       |
| R-11    | Cron の重複起動（B-5）                                                          | 同日に通知が二重に届く可能性                           | 冪等性キーは持たない設計を受容（対応なし）                                          |
| R-12    | Application 層関数のクライアントバンドル取り込み                                | 初期表示が遅くなる可能性                               | Step 6 完了条件でバンドルサイズ確認を明記                                           |
| R-13    | Push Service 全体のダウン                                                       | 通知が届かない日が発生                                 | フォールバック UI なし。翌日の再送に委ねる                                          |
| P-15    | 無認証 subscribe の悪用（第三者が在庫名ダイジェストを受信・DB 肥大）            | 情報漏洩・リソース消費                                 | Step 3-4/3-5 で購読件数の上限（10 件）を実装                                        |
| P-16    | `endpoint` を悪用した blind SSRF                                                | 内部ネットワークへの POST・1 ビットの応答オラクル      | Step 4-2 でホスト検証（`new URL().hostname`）を実装                                 |
| P-17    | 長さ不正な鍵の登録で恒久的な送信失敗行が残る                                    | Cron が同じ購読に毎日失敗し続ける                      | Step 4-2 で鍵長制約を実装し登録時点で防ぐ                                           |
| H-2     | 秘密の誤コミット（`.env.production` 等が追跡対象）                              | Git 履歴・fork・CI ログに秘密が残る                    | Step 7-1/7-2 で `.gitignore`/`.env.example` を整備                                  |
| M-2     | `CRON_SECRET` の強度不足・レート制限無し                                        | 総当たりで Cron を起動されうる                         | Step 7-3 で `openssl rand -base64 32` を明記                                        |
| M-3     | Preview に本番鍵を置く                                                          | 誰でも本番相当の購読を作成できる                       | Step 9-2 で鍵分離を必須化                                                           |
| L-3     | `notificationclick` が未検証 URL を `openWindow`                                | 外部サイトへの誘導（現実的な攻撃経路は無いが多層防御） | Step 8-1 で型・相対パス検証を実装                                                   |
| L-5     | 応答に `Cache-Control` が無い                                                   | 中間キャッシュに乗る可能性（未検証・実害小）           | Step 5-2/5-3 で `no-store` を付与                                                   |
| IMP-1   | `PushSender` port の配置先が設計書の当初コード例と異なる（P-13 で解決済み）     | 無し（確定済み）                                       | Step 1-4 に理由を明記。P-13 として確定済み                                          |
| IMP-2   | `formatExpiryUrgencyLabel` の配置先が P-4 の当初文言と異なる（P-14 で解決済み） | 無し（確定済み）                                       | Step 3-1 に理由を明記。P-14 として確定済み                                          |
| IMP-3   | `web-push` の追加先パッケージが依頼文と実装で異なる                             | 型解決に失敗しうる                                     | Step 2-5 に pnpm workspace の制約を明記                                             |
| IMP-4   | `server-only` が新しい規約になる                                                | リポジトリの慣習と異なる技術選択が入る                 | Step 5-1 に理由を明記。§Orchestrator への申し送り にも記録                          |
| IMP-5   | 契約設計書 §3.1 が P-16/P-17 未反映のまま                                       | implementer が旧版コードをそのまま実装しうる           | Step 4-1 で本体設計書優先を明記。§Orchestrator への申し送り に記録                  |

---

## ロールバック手順

ADR-0017 §Rollback を実装計画のファイル単位に対応させたもの。最速の緊急停止は 1 のみ実行すれば
足りる。

1. **最速の緊急停止**: `vercel.json` の `crons` エントリを削除する
2. **Presentation（Step 5・8）**: `apps/web/src/server/routes/push.ts`・
   `apps/web/src/server/routes/cron.ts`（+ テスト）を削除し、`app.ts` の `.route()` 2 行と
   import を削除。`repositories.ts` の `import 'server-only'` は他 6 関数にも安全に適用できる
   ため残してよい（削除は任意）。`apps/web/src/app/sw.ts` の `push`/`notificationclick`
   ハンドラを削除。`apps/web/src/app/_components/expiry-alert-subscription.tsx`（+ テスト）を
   削除し、`dashboard.tsx` から参照を外す
3. **api-contract（Step 4）**: `push-subscription.schema.ts`（+ テスト）を削除し、
   `index.ts` の追記行を削除
4. **Application（Step 3）**: `packages/application/src/notification/` ディレクトリ
   （`too-many-subscriptions.error.ts` を含む）を削除。
   `packages/application/src/pantry/get-expiring-stocks.use-case.ts`（+ テスト）を削除。
   `page.tsx` を元の呼び出しへ戻す。**`GetExpiringStocksUseCase` への差し替え自体は
   戻さなくてよい**（ADR-0017 §Rollback）
5. **Infrastructure（Step 2）**: `schema.ts` から `pushSubscriptions` 定義を削除。
   `create-test-db.ts` の DDL から該当 `CREATE TABLE` を削除。生成済みマイグレーションを削除。
   本番 DB に適用済みの場合は `DROP TABLE push_subscriptions;`。
   `drizzle-push-subscription.repository.ts`/`web-push-sender.ts`（+ テスト）を削除し、
   `infrastructure/src/index.ts` の export 行を削除。`packages/infrastructure/package.json`
   から `web-push` 依存を削除
6. **Domain（Step 1）**: `packages/domain/src/push-subscription/` ディレクトリを削除し、
   `domain/src/index.ts` の 4 export を削除
7. **環境変数**: VAPID 鍵一式・`CRON_SECRET` を Vercel から削除する。**`TZ` は元々設定して
   いない（予約変数）。以下の旧記述は
   残す**。`.gitignore`/`.env.example`（H-2 対応分）はロールバック後も**残してよい**
   （`DATABASE_URL` を含む既存の秘密情報保護のためにも有効であり、本ユニット固有ではない）

各層は疎結合であり、既存の縦スライスは一切変更していないため、本ユニットの完全撤去は既存機能に
影響しない。

---

## ドキュメント更新対象（実装完了後のフォローアップ。本計画では実施しない）

| #   | 対象ドキュメント                        | 更新内容                                                                                 |
| --- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | `docs/04-domain-model.md`               | `PushSubscription` 集約の追加を反映                                                      |
| 2   | `docs/02-tech-stack.md:118`             | 「MVP1 ではプッシュ通知を使わない」の記述を訂正                                          |
| 3   | `docs/05-roadmap.md`                    | Sprint 8 Unit B 行を「未着手」→「完了」に更新                                            |
| 4   | `docs/designs/expiry-alert.contract.md` | §3.1 の Zod コード例を P-16/P-17 に合わせて更新（Step 4-1 の申し送り。契約設計者の担当） |

---

## Orchestrator への申し送り

前回版の申し送り#1・#2 は **P-13・P-14 としてユーザー確定済み**（設計書 §確定事項）。本改訂
時点で新たに Orchestrator の判断を要する事項は無いが、実装時に認識しておくべき情報として
以下を記録する。

### 解決済み（記録として残す）

1. **申し送り#1（`PushSender` port の配置）**: 本計画の提案どおり Domain
   （`packages/domain/src/push-subscription/push-sender.ts`）に確定（P-13）。
2. **申し送り#2（`formatExpiryUrgencyLabel` の配置）**: 本計画の提案どおり Application
   （`packages/application/src/pantry/expiry.ts`）に確定し、`apps/web/src/app/_utils/expiry.ts`
   は削除する（P-14）。

### 情報共有（ブロッキングではないが実装時に影響する）

3. **契約設計書 §3.1 の Zod コード例が P-16/P-17 を反映していない（実測確認済み）**。
   本体設計書（`docs/designs/expiry-alert.md`）§セキュリティは P-16/P-17 として具体的な
   検証内容（`new URL()` ベースのホスト検証・`p256dh`/`auth` の長さ制約）を確定済みだが、
   契約設計書 §3.1 のコードブロックは旧版のまま（`startsWith('https://')` の文字列一致・
   `min(1)`）。本計画（Step 4）は本体設計書の確定文言を優先して実装する方針とした。
   契約設計書のコード例自体を更新するかどうかは Orchestrator/契約設計者の判断に委ねる
   （本計画では契約設計書を変更していない）。
4. **`server-only` を新規依存として採用した**（Step 5-1）。security-reviewer の Nice 指摘を
   採用する判断であり、リポジトリで初めて導入される規約になる。低リスク（1 行 + 1 依存）と
   判断したが、方針として定着させるかどうかは reviewer/Orchestrator の確認対象に含めてよい。
5. **`hono` のパッチアップグレード（`^4.12.33` → `4.12.34` 以上）を Step 2-0 に含めた**。
   security-reviewer の Should 指摘（本ユニット起因ではないが、Hono ルートを追加する PR の
   ついでに実施するのが自然）を採用した判断。`brace-expansion`/`js-yaml`（dev 依存）と
   `pnpm.overrides` の範囲修正は対象外とし、別タスクとして扱う。

---

## 完了条件（Definition of Done 対応）

- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` / `pnpm audit` が通る（Step 9-4）
- [ ] Domain: `PushSubscription` 集約の単体テスト（生成・復元・不変条件）
- [ ] Application: 購読 ON/OFF UseCase（**P-15 の上限テスト含む**）・`SendExpiryAlertsUseCase`・
      `GetExpiringStocksUseCase` のテスト
- [ ] Infrastructure: PGlite 回帰テスト（save/findAll/findByEndpoint/deleteByEndpoint(s)）。
      `create-test-db.ts` への DDL 追記を含む
- [ ] api-contract: `endpoint` のホスト検証（P-16）・`p256dh`/`auth` の長さ制約（P-17）の
      テスト
- [ ] apps/web: Cron ルートのテスト（200/401/500）、購読/購読解除ルートのテスト
      （200/400/**422**）、ダッシュボードの購読 ON/OFF UI のコンポーネントテスト
- [ ] `sw.ts` の入力検証テスト（L-3）
- [ ] 期限判定ロジック移設後、ダッシュボード・`/pantry` の既存表示に回帰が無いことを確認する
      テスト（Step 6 完了条件）
- [ ] `.gitignore`/`.env.example` が整備されていること（H-2）
- [ ] `pnpm audit`（`web-push`/`server-only` 追加後）に high/critical の新規混入が無いこと
- [ ] iOS 実機での Push 到達確認手順を実施する（Step 9-3）。Preview 専用鍵を検証後に破棄した
      ことを確認する（M-3）
- [ ] roadmap Sprint 8 完了条件 3 件目を満たす
- [ ] スコープ外変更が無いこと
