# 契約設計: expiry-alert

> §背景・目的・ドメイン設計・Application 設計・UI 設計・実装上の罠・費用は
> `docs/designs/expiry-alert.md`（confirmed。§変更後構成 / §API 設計 / §DB 設計 /
> §エラー処理 / §確定事項 が正典）を参照。本書はその契約を `packages/api-contract`
> （Zod）・Drizzle スキーマ・Hono RPC の型として実装可能な水準まで確定する。本体設計書と
> 矛盾する記述は無効（矛盾に気づいた場合は Orchestrator へ差し戻す。本書末尾「本体設計書との
> 差異メモ・申し送り」に記録した）。

- ステータス: **確定事項の実装詳細化**（本体設計書 P-1〜P-12 は 2026-08-09 にユーザー確定済み。
  本書はその契約実装詳細のみを追加する。**本書が差し戻した非対称 1 件は P-12 として確定し
  反映済み。§12 に security-reviewer 向けの確認事項を記録した**）
- 対象: 新規 `packages/api-contract/src/push-subscription.schema.ts`、新規
  `packages/infrastructure/src/db/schema.ts` 追記（`push_subscriptions` テーブル）、
  新規 Hono ルート `apps/web/src/server/routes/push.ts` / `apps/web/src/server/routes/cron.ts`、
  `apps/web/src/server/app.ts` 追記
- 参照した既存契約（実測）: `packages/api-contract/src/pantry.schema.ts` /
  `packages/api-contract/src/store.schema.ts` / `packages/api-contract/src/index.ts` /
  `apps/web/src/server/app.ts` / `apps/web/src/server/routes/pantry.ts` /
  `apps/web/src/server/routes/health.ts` / `apps/web/src/server/repositories.ts` /
  `apps/web/src/db/client.ts` / `packages/infrastructure/src/db/schema.ts` /
  `packages/infrastructure/tests/testing/create-test-db.ts` /
  `apps/web/tests/server/routes/pantry.test.ts`
- **本ユニットは Unit A（stock-edit）と異なり未実装（プロダクションコード 0 件。
  `push_subscriptions` / `PushSubscription` / `VAPID_PUBLIC_KEY` / `CRON_SECRET` を
  grep して確認済み）。** したがって本書における「実測」は既存契約（Pantry・app.ts・
  zValidator の挙動等）に限り、新規エンドポイント自体の挙動は**本体設計書のコード例からの
  読み取り**であることを明記する（実装後に差異が出れば test-designer / implementer が
  本書と突き合わせる）。
- プロダクションコードは変更しない（実装は implementer）。

---

## 目次

1. [エンドポイント仕様（新規 4 本）](#1-エンドポイント仕様新規-4-本)
2. [DB スキーマ: `push_subscriptions` テーブル](#2-db-スキーマ-push_subscriptions-テーブル)
3. [Zod スキーマ定義と既存スキーマとの差分](#3-zod-スキーマ定義と既存スキーマとの差分)
4. [バリデーション規則](#4-バリデーション規則)
5. [ステータスコードとエラー形式](#5-ステータスコードとエラー形式)
6. [nullability と「値なし」の表現](#6-nullability-と値なしの表現)
7. [冪等性](#7-冪等性)
8. [後方互換性判定](#8-後方互換性判定)
9. [サンプルペイロード](#9-サンプルペイロード)
10. [契約テスト方針（test-designer への橋渡し）](#10-契約テスト方針test-designer-への橋渡し)
11. [実装ファイル一覧（参考・実装は implementer）](#11-実装ファイル一覧参考実装は-implementer)
12. [本体設計書との差異メモ・申し送り](#12-本体設計書との差異メモ申し送り)

---

## 1. エンドポイント仕様（新規 4 本）

| メソッド | パス                         | UseCase                                   | リクエストボディ                                                       | レスポンスボディ                                           | ステータス      | 認証                                                    |
| -------- | ---------------------------- | ----------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- | --------------- | ------------------------------------------------------- |
| GET      | `/api/push/vapid-public-key` | なし（環境変数を直接返す）                | なし                                                                   | `VapidPublicKeyResponse`（`{ publicKey: string }`）        | 200 / 500       | なし                                                    |
| POST     | `/api/push/subscribe`        | `SubscribeToExpiryAlertUseCase`（新）     | `SubscribeToExpiryAlertBody`（`subscribeToExpiryAlertSchema`）         | なし                                                       | 204 / 400       | なし                                                    |
| POST     | `/api/push/unsubscribe`      | `UnsubscribeFromExpiryAlertUseCase`（新） | `UnsubscribeFromExpiryAlertBody`（`unsubscribeFromExpiryAlertSchema`） | なし                                                       | 204 / 400       | なし                                                    |
| GET      | `/api/cron/expiry-alerts`    | `SendExpiryAlertsUseCase`（新）           | なし                                                                   | `ExpiryAlertsCronResult`（`expiryAlertsCronResultSchema`） | 200 / 401 / 500 | `Authorization: Bearer $CRON_SECRET`（インライン `if`） |

配置: `pushRoute`（`push.ts`）は `GET /vapid-public-key → POST /subscribe → POST /unsubscribe` の
並び（本体設計書のコード順）。`cronRoute`（`cron.ts`）は `GET /expiry-alerts` の 1 本のみ。
`app.ts` には既存 7 ルートの末尾に `.route('/push', pushRoute)` と
`.route('/cron', cronRoute)` を追記する（本体設計書のとおり）。

### 1.1 `subscribe` / `unsubscribe` に認証が無いことの契約上の位置づけ

本体設計書 §セキュリティで確定済み（ADR-0003・単一世帯前提の踏襲であり、本書で新規に
決めた事項ではない）。`endpoint` はブラウザの Push Service が発行する推測困難な URL であり、
これを事実上の秘匿情報として扱う設計。**契約上の帰結**として、`subscribe` /
`unsubscribe` の Zod スキーマは「入力の型・形式」だけを守り、「誰が呼んでよいか」の制御は
持たない。

### 1.2 `cron` を `GET` にする是非（本体設計書の確定を踏襲・整理）

Vercel Cron はスケジュール実行時に常に `GET` でエンドポイントを叩く仕様であり、`POST` 等を
選ぶ余地が無い（プラットフォーム制約）。一方 HTTP の意味論では `GET` は safe method
（副作用を持たないことが期待される）であり、本エンドポイントは Push 送信という副作用を持つ
ため、原則からは逸脱する。この逸脱を受容できる理由は 3 点:

1. `Authorization: Bearer $CRON_SECRET` を持たない呼び出しは 401 で弾かれる（§5）ため、
   ブラウザのプリフェッチ・クローラー・CDN のキャッシュ再検証など「意図しない `GET`」が
   実際に副作用を発生させることはない。
2. どの HTML からもリンクされない（`<a>` 要素・ナビゲーションの対象にならない）ため、
   ブラウザの link prefetch 経由での誤発火が起きない。
3. 公開 API として文書化・クライアント SDK 化する対象ではなく、Vercel Cron からの
   サーバー間呼び出し専用エンドポイントである。

**この整理は本体設計書に明記が無かったため本書で補った（§12 に記録）。** 確定内容
（`GET` にする・`Authorization: Bearer` で保護する）自体は本体設計書の記載どおりで、
本書はその是非の説明を厚くしただけであり、新たな設計判断ではない。

### 1.3 認証チェックに `zValidator('header', ...)` を使わない理由（契約上重要な制約）

`@hono/zod-validator` のバリデーション失敗は必ず **400** を返す（`.claude/rules` 準拠の
実測事実。§5 参照）。もし `Authorization` ヘッダーの検証を `zValidator('header', ...)` で
実装すると、ヘッダー欠落・不一致は **400** になり、本体設計書 §API 設計・§セキュリティが
確定している **401**（認証失敗）と食い違う。したがって `cronRoute` の Bearer 検証は
**必ずハンドラ内のインライン `if` で行い、`zValidator` を使わない**契約とする
（本体設計書のコード例と一致。ADR-0003「`.use(` によるミドルウェア化はしない」の理由とは
別に、契約レベルでも zValidator 不使用が必須である点を本書で明確化した）。

---

## 2. DB スキーマ: `push_subscriptions` テーブル

`packages/infrastructure/src/db/schema.ts` への追記（本体設計書のコードと同一。既存の
`pgTable` 定義の直後・末尾に配置する想定）。

```typescript
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

- `text('endpoint')` は Postgres `text` 型であり DB 列自体には長さ上限が無い。§4 の Zod
  `max(2048)` はアプリケーション境界での防御であり、DB 列の型とは独立した制約である
  （既存の `store.schema.ts` の `z.string().max(255)` も `stores.name` が `text`（無制限）
  であるのと同じ関係で、コードベースの既存慣習と一致する）。
- 追加インデックスは不要（`UNIQUE` 制約が `findByEndpoint()` 用のインデックスを自動生成する。
  本体設計書 §DB 設計のとおり）。
- マイグレーション: `pnpm --filter @cookpit/web db:generate` で `0008` を生成
  （既存 `0000`〜`0007` の続き。`apps/web/drizzle.config.ts` 実測: schema は
  `../../packages/infrastructure/src/db/schema.ts`、out は `./src/db/migrations`）。
- **PGlite テスト DDL の追記**（実装上の罠 6・本書で実測確認）:
  `packages/infrastructure/tests/testing/create-test-db.ts` の `stocks` テーブル定義は
  **実測で L100-113**（`CREATE TABLE IF NOT EXISTS stocks (...)` と直後の
  `CREATE INDEX ... stocks_product_id_idx`）、テンプレートリテラルの閉じ `` ` `` は **L114**。
  `push_subscriptions` の `CREATE TABLE` は **L113 の `CREATE INDEX` 文の後・L114 の閉じ
  バッククォートの前**に追記する。

  ```sql
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id text PRIMARY KEY,
    endpoint text NOT NULL UNIQUE,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  );
  ```

---

## 3. Zod スキーマ定義と既存スキーマとの差分

### 3.1 新規ファイル `packages/api-contract/src/push-subscription.schema.ts`

本体設計書のコード例（§変更後構成 api-contract、L456-479）をベースに、§4 のバリデーション
規則を反映した完成形を以下に示す。

```typescript
import z from 'zod';

/**
 * Push Service（FCM / Apple / Mozilla 等）が発行する購読エンドポイント URL。
 * Web Push の仕様上エンドポイントは常に HTTPS。長さ上限は実務上の実測値（各 Push Service
 * とも概ね 100〜300 文字）に対し十分な余裕を持たせた防御的な上限であり、正規の URL を
 * 拒否しない値として 2048 を採用する（store.schema.ts の `z.string().max(255)` と同じ
 * 「DB 列自体は無制限だがアプリ境界で上限を設ける」慣習）。
 */
export const pushEndpointSchema = z
  .url()
  .max(2048)
  .refine((value) => value.startsWith('https://'), {
    message: 'endpoint must be an https URL',
  });

/**
 * ECDH 公開鍵（p256dh）と認証シークレット（auth）。ブラウザの
 * `PushSubscription.toJSON().keys` をそのまま渡す想定。Base64URL（RFC 4648 §5、パディング
 * なし）のみを許可する。長さは実測値（p256dh は 65 バイトの非圧縮 EC 公開鍵で約 87 文字、
 * auth は 16 バイトの共有シークレットで約 22 文字）に対して十分な余裕を持たせた上限とし、
 * 完全一致長では検証しない（ブラウザ実装差・将来の鍵長変更に対して過度に脆くしないため）。
 */
export const pushSubscriptionKeysSchema = z.object({
  p256dh: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, 'p256dh must be base64url')
    .min(1)
    .max(128),
  auth: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, 'auth must be base64url')
    .min(1)
    .max(32),
});

export const subscribeToExpiryAlertSchema = z.object({
  endpoint: pushEndpointSchema,
  keys: pushSubscriptionKeysSchema,
});

export const unsubscribeFromExpiryAlertSchema = z.object({
  endpoint: pushEndpointSchema,
});

export const vapidPublicKeyResponseSchema = z.object({
  publicKey: z.string(),
});

/**
 * Cron ルート（GET /api/cron/expiry-alerts）のレスポンス。`SendExpiryAlertsResultDto`
 * （`packages/application/src/notification/`）と同じ 4 フィールドを持つ。既存の
 * `pantryResponseSchema` / `stockResponseSchema` が `PantryDto` / `StockDto`
 * （Application 層）と並存して定義されているのと同じ、このコードベース既存の慣習
 * （api-contract に「配線された契約」として Zod 版を維持し、実行時の zValidator による
 * レスポンス検証は行わない）を踏襲する。
 */
export const expiryAlertsCronResultSchema = z.object({
  subscriptionCount: z.number().int().nonnegative(),
  sentCount: z.number().int().nonnegative(),
  removedCount: z.number().int().nonnegative(),
  expiringStockCount: z.number().int().nonnegative(),
});

export type SubscribeToExpiryAlertBody = z.infer<typeof subscribeToExpiryAlertSchema>;
export type UnsubscribeFromExpiryAlertBody = z.infer<typeof unsubscribeFromExpiryAlertSchema>;
export type VapidPublicKeyResponse = z.infer<typeof vapidPublicKeyResponseSchema>;
export type ExpiryAlertsCronResult = z.infer<typeof expiryAlertsCronResultSchema>;
```

### 3.2 本体設計書のコード例との差分表

| 項目                                  | 本体設計書のコード例（L456-479）           | 本書での確定                                                      | 差分の理由                                                                                         |
| ------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `endpoint`                            | `z.url()`                                  | `pushEndpointSchema`（`z.url().max(2048)` + https 限定 `refine`） | 外部由来の値に対する長さ・スキームの防御的検証を追加（§4.1）。本体設計書の確定事項と矛盾しない追記 |
| `p256dh` / `auth`                     | `z.string().min(1)`                        | base64url 文字集合の正規表現 + `min(1)` + `max()`                 | 明らかに不正な値（空白混入・非 base64url 文字）を境界で早期に弾く（§4.2）                          |
| `expiryAlertsCronResultSchema`        | 無し（Application 層の TS interface のみ） | 新規追加                                                          | 既存の `pantryResponseSchema` と同じ「レスポンス契約を api-contract にも置く」慣習を踏襲（§12）    |
| `subscribeToExpiryAlertSchema` の構造 | `{ endpoint, keys: { p256dh, auth } }`     | 変更なし                                                          | 本体設計書のとおり                                                                                 |
| `unsubscribeFromExpiryAlertSchema`    | `{ endpoint: z.url() }`                    | `{ endpoint: pushEndpointSchema }`                                | `subscribe` と同一の `endpoint` バリデーションを共有（DRY。§4.1）                                  |
| `vapidPublicKeyResponseSchema`        | `{ publicKey: z.string() }`                | 変更なし                                                          | 本体設計書のとおり                                                                                 |

### 3.3 `index.ts` への影響

`packages/api-contract/src/index.ts` は「1 集約 1 ファイルを `export *` するだけのバレル」
（実測）であるため、以下の 1 行を末尾に追記する（既存 7 行は変更不要）。

```typescript
export * from './push-subscription.schema';
```

---

## 4. バリデーション規則

### 4.1 `endpoint`

| 規則                                 | 内容                                                       | 理由                                                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 形式                                 | `z.url()`（本体設計書のコード例のまま）                    | Web Push の `endpoint` は URL 形式を持つ（RFC 8030）                                                                                                                                                                   |
| 長さ                                 | `.max(2048)`（本書で追加）                                 | 実務上の Push Service の `endpoint` は数百文字以内。悪意ある巨大文字列の送りつけ・DB 肥大化への防御。既存の `store.schema.ts` の `max(255)` と同種の「防御的上限」の慣習                                               |
| スキーム                             | `https://` で始まることを `.refine()` で要求（本書で追加） | 実在する Push Service（FCM / Mozilla autopush / Apple `web.push.apple.com`）のエンドポイントは常に HTTPS。VAPID subject の HTTPS/mailto 制約（罠 8）とは別の検証だが、同じ「Push は HTTPS 前提」という仕様理解に基づく |
| `subscribe` / `unsubscribe` での共有 | 両スキーマとも `pushEndpointSchema` を共有                 | DB の `UNIQUE` 制約と同じ値をキーに使う 2 つの操作であり、バリデーション規則がずれると「登録は通るが解除できない `endpoint`」のような非対称が生まれ得るため一致させる                                                  |

### 4.2 `p256dh` / `auth`

| 項目     | 実測値の目安（RFC 8291 の鍵長から算出）           | 本書の制約                                   | 完全一致長にしない理由                                                                                                                              |
| -------- | ------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `p256dh` | 非圧縮 EC 公開鍵 65 バイト → base64url 約 87 文字 | `/^[A-Za-z0-9_-]+$/` + `min(1)` + `max(128)` | ブラウザ実装（Chrome/Firefox/Safari）間の細かな差異や将来の仕様変更に対して過度に脆い契約にしないため。文字集合と上限のみで「明らかな不正値」を弾く |
| `auth`   | 共有シークレット 16 バイト → base64url 約 22 文字 | `/^[A-Za-z0-9_-]+$/` + `min(1)` + `max(32)`  | 同上                                                                                                                                                |

本体設計書のコード例（`z.string().min(1)`）より厳しい制約だが、正規の `PushSubscription.
toJSON().keys` の値を reject するケースは無い想定（base64url の文字集合・実測長の範囲内に
収まる）。**この追加は本書で新規に判断した契約詳細であり、本体設計書 P-1〜P-11 の対象では
ない。security-reviewer の確認事項として §12 に記録する。**

### 4.3 `cron` エンドポイントのリクエストボディ

ボディを取らない（本体設計書 §API 設計「`cron` エンドポイントの 400 系は無い」のとおり）。
Zod スキーマは定義しない。認証は §1.3 のとおりインライン `if` で行い、`zValidator` の対象に
しない。

---

## 5. ステータスコードとエラー形式

### 5-1. 既存契約（実測。本ユニットでの変更は無い）

`apps/web/src/server/app.ts`（実測・全 35 行）の `onError`（L24-33）は次の 2 段の基底分岐で
全エラーをマッピングする。**本ユニットはこの `onError` を変更しない。**

```typescript
app.onError((err, c) => {
  if (err instanceof NotFoundError) {
    return c.json({ error: err.message }, 404);
  }
  if (err instanceof InvalidOperationError) {
    return c.json({ error: err.message }, 422);
  }
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});
```

`@hono/zod-validator` のバリデーション失敗は `onError` を経由せず**自前で 400** を返す
（Unit A の契約設計で実測確認済みの規約。**422 になるのは `InvalidOperationError`、404 は
`NotFoundError` のみ**）。`push.ts` の `subscribe` / `unsubscribe` はこの一般則にそのまま
従う。

### 5-2. `push.ts` のステータス対応表

| ステータス | エンドポイント                    | 発生条件                                                                                      | 経路                                                       | レスポンスボディ                              |
| ---------- | --------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| 200        | `GET /vapid-public-key`           | `VAPID_PUBLIC_KEY` が設定されている（§5-4 参照）                                              | ハンドラが直接 `c.json` を返す                             | `{ publicKey: string }`（空文字にはならない） |
| 500        | `GET /vapid-public-key`           | `VAPID_PUBLIC_KEY` が未設定または空文字（P-12 確定。フェイルクローズ）                        | ハンドラのインラインチェック（`app.onError` 経由ではない） | `{ "error": "Server misconfigured" }`         |
| 204        | `POST /subscribe`                 | 正常（新規登録・upsert 更新のいずれも同じ 204）                                               | `SubscribeToExpiryAlertUseCase` 正常終了                   | なし（`c.body(null, 204)`）                   |
| 204        | `POST /unsubscribe`               | 正常（存在する `endpoint` を削除／存在しない `endpoint` でも冪等に 204）                      | `UnsubscribeFromExpiryAlertUseCase` 正常終了               | なし                                          |
| 400        | `POST /subscribe` / `unsubscribe` | `subscribeToExpiryAlertSchema` / `unsubscribeFromExpiryAlertSchema` の Zod バリデーション失敗 | `@hono/zod-validator`（UseCase 未到達）                    | `@hono/zod-validator` 標準形                  |
| 500        | 全 push ルート共通                | UseCase/Repository 側で予期しない例外（例: DB 接続断）                                        | `app.onError` の 3 段目（既存・変更不要）                  | `{ "error": "Internal Server Error" }`        |

**`push.ts` の 2 本（subscribe / unsubscribe）は 404 / 422 を返さない。** 理由:
`SubscribeToExpiryAlertUseCase` は upsert であり「存在しない」状態が無く、
`UnsubscribeFromExpiryAlertUseCase` は削除が冪等（`deleteByEndpoint` は存在しなくても
例外を投げない。本体設計書 §変更後構成 Domain）。`InvalidOperationError` /
`NotFoundError` を投げる分岐が UseCase 内に存在しないため、契約上も 422/404 は無いと確定する。

### 5-3. `cron.ts` のステータス対応表

| ステータス            | 発生条件                                                                                             | レスポンスボディ                       | 備考                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 200                   | `Authorization` ヘッダーが `Bearer $CRON_SECRET` と一致                                              | `ExpiryAlertsCronResult`               | `SendExpiryAlertsUseCase.execute()` の戻り値をそのまま返す                                               |
| 401                   | `CRON_SECRET` は設定済みだが、ヘッダーが欠落／不一致                                                 | `{ "error": "Unauthorized" }`          | インライン `if` が直接返す（`onError` を経由しない）                                                     |
| 500（設定不備）       | `CRON_SECRET` が未設定（`undefined` または空文字）                                                   | `{ "error": "Server misconfigured" }`  | インライン `if` が直接返す。**フェイルクローズ**（本体設計書 §セキュリティ確定事項）                     |
| 500（予期しない例外） | `SendExpiryAlertsUseCase.execute()` 内で捕捉されない例外（DB 接続断・Push Service の想定外の例外等） | `{ "error": "Internal Server Error" }` | `app.onError` の 3 段目を経由（既存の一般則。**設定不備の 500 とボディ形が異なる**点に注意。§12 に記録） |

**チェック順序が契約上重要**: `CRON_SECRET` 未設定チェックが先、`Authorization` ヘッダー比較が
後（本体設計書のコード順）。したがって「`CRON_SECRET` が未設定 かつ 正しい形式の
`Authorization` ヘッダーを送った」場合でも **401 ではなく 500** になる。試験観点として
401 と 500（設定不備）を独立したケースとして扱うこと（§10）。

**cron は `400` を返さない**（§4.3・本体設計書 §API 設計のとおり）。

### 5-4. `GET /vapid-public-key` は環境変数未設定時に 500 を返す（P-12 確定・解決済み）

本書の初版は、本体設計書の当初のコード例（`process.env.VAPID_PUBLIC_KEY ?? ''`）に従って
未設定時に `{ publicKey: '' }` を **200** で返す契約としていた。これは `cron` の
`CRON_SECRET` 未設定時の**フェイルクローズ（500）**と非対称であり、§12 項目 4★ として
Orchestrator へ差し戻した。

**2026-08-09 にユーザー確定（P-12）: 500 でフェイルクローズする側に揃えた。** 本ユニット
最大の罠が「環境変数の設定忘れで静かに壊れる」（本体設計書 罠 4・罠 5）であり、
200 + 空文字ではクライアントが「サーバ未設定」と「ブラウザ非対応」を区別できず、
購読ボタンが無反応になる形でしか現れないため原因が追えない。500 なら Vercel の実行ログに残る。

確定後の契約:

- `VAPID_PUBLIC_KEY` が設定済み → **200** `{ publicKey: string }`（空文字にはならない）
- 未設定または空文字 → **500** `{ error: 'Server misconfigured' }`（ハンドラのインライン
  チェックが返す。`app.onError` は経由しない。`cron` の設定不備 500 と同じ形）

なお `vapidPublicKeyResponseSchema` は `publicKey: z.string()` のままとする。200 のときは
必ず非空文字が入るが、`.min(1)` を課しても実行時に検証されない（レスポンススキーマは
`zValidator` を通さない既存慣習）ため、型の表現力を上げる意味が薄い。

---

## 6. nullability と「値なし」の表現

- プロジェクト規約（`.claude/rules/coding-standards.md`）どおり「値なし」は `null` に統一する。
- **本ユニットの新規スキーマに `nullable()` フィールドは無い**（`endpoint` / `p256dh` /
  `auth` はいずれも必須の非 null 文字列）。既存の Pantry 系スキーマ
  （`storedLocation.nullable()` / `expiresAt.nullable()`）とは異なり、購読情報は「一部を
  クリアする」概念を持たないため、nullable 設計は不要である。
- `publicKey: z.string()` はスキーマ上は空文字も通る型だが、**200 のレスポンスに空文字が
  入ることは無い**（P-12 確定。未設定・空文字はいずれも 500 でフェイルクローズする。§5-4）。
  `.min(1)` を課さない理由は §5-4 のとおり（レスポンススキーマは `zValidator` を通さない
  既存慣習のため実行時に検証されない）。「値なし」を `null` で表す規約との衝突は生じない。
- `ExpiryAlertsCronResult` の 4 フィールドはいずれも非負整数の必須フィールドで、`null` を
  取らない（購読 0 件・在庫 0 件のケースはすべて `0` で表現する。本体設計書
  `SendExpiryAlertsUseCase` の早期 return も 4 フィールドとも `0` を返す設計）。

---

## 7. 冪等性

### 7.1 `POST /subscribe`

| 項目                         | 1 回目         | 2 回目（同一 `endpoint`・同一 `keys`） | 2 回目（同一 `endpoint`・**異なる** `keys`）      |
| ---------------------------- | -------------- | -------------------------------------- | ------------------------------------------------- |
| ステータス                   | 204            | 204                                    | 204                                               |
| `push_subscriptions` の行数  | +1             | 変化なし（`UNIQUE` により upsert）     | 変化なし（同一行の `p256dh`/`auth` が更新される） |
| 保存される `p256dh` / `auth` | リクエストの値 | 変化なし                               | **2 回目の値に上書きされる**                      |

**HTTP のステータスコードは常に 204 で冪等（同じレスポンスが返る）だが、サーバー状態
（保存される鍵）は「同一 `endpoint`・異なる `keys`」の場合に非冪等**（本体設計書 P-8
「upsert」の確定どおり。ブラウザが購読を再作成すると `p256dh`/`auth` が変わりうるため、
この非冪等性は意図的な設計である）。

### 7.2 `POST /unsubscribe`

`deleteByEndpoint()` は存在しなくても例外を投げない（本体設計書 §変更後構成 Domain）ため、
完全に冪等（何回呼んでも 204、DB 状態は「対象行が無い」で収束する）。

### 7.3 `GET /cron/expiry-alerts`

**非冪等**（意図的）。同一リクエストを複数回送ると、購読が存在し期限が近い在庫が存在する限り
**毎回 Push 通知が再送される**（本体設計書 P-2「1 日 1 通のダイジェスト・再送あり」の設計が
そのまま「1 回の Cron 呼び出しごとに 1 回送信」の非冪等性として現れる）。これは
「冪等性キーは持たない設計を受容する」（本体設計書リスク R-11）という確定済みの判断であり、
本書で新たに決める事項ではない。`Idempotency-Key` ヘッダー等は導入しない。

### 7.4 `GET /vapid-public-key`

副作用を持たない（環境変数の読み取りのみ）ため自明に冪等。

---

## 8. 後方互換性判定

**破壊的変更なし。全て新規追加（新規ファイル・新規テーブル・新規ルート）であり、既存の
契約は一切変更しない。**

- `packages/api-contract/src/index.ts` への追記は `export * from './push-subscription.schema'`
  という新規行の追加のみ。既存 7 行（`shared` / `recipe` / `product` / `store` /
  `meal-plan` / `shopping-list` / `pantry`）は変更しない。
- `packages/infrastructure/src/db/schema.ts` への追記は `pushSubscriptions` テーブルの
  新規定義のみ。既存 9 テーブル（`recipes` 〜 `stocks`）の列定義は一切変更しない。マイグレーション
  `0008` は新規テーブルの `CREATE TABLE` のみで、既存データへの `ALTER` は無い。
- `apps/web/src/server/app.ts` への変更は `.route('/push', pushRoute)` /
  `.route('/cron', cronRoute)` の追加 2 行のみ。既存 7 ルートの実装・エラー処理
  （`onError`）は変更しない。
- **Hono RPC の型伝播**: `AppType`（`export type typeof routes`）は新しい `.route()` の
  追加によりプロパティが増えるだけで、既存の `client.api.pantry.*` 等の型は構造的部分型に
  より維持される（`stock-edit.contract.md` §7 と同じ性質）。
- 既存の 7 ルート（`health` / `recipes` / `products` / `stores` / `meal-plans` /
  `shopping-lists` / `pantry`）のいずれのスキーマ・ルート・エラー処理にも触れない。
- 移行・データ影響: 新規テーブルのため既存データへの影響は無い（本体設計書 §移行とリリース）。

---

## 9. サンプルペイロード

### 9.1 `GET /api/push/vapid-public-key`

```
GET /api/push/vapid-public-key
```

成功レスポンス（200）:

```json
{ "publicKey": "BEl62iUYgUivxIkv69yViEuiBIa40HI0DLLuxazjqAKt..." }
```

環境変数未設定時（500・フェイルクローズ。P-12 確定。§5-4 参照）:

```json
{ "error": "Server misconfigured" }
```

### 9.2 `POST /api/push/subscribe`

リクエストボディ:

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/eXaMpLe-endpoint-id",
  "keys": {
    "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
    "auth": "tBHItJI5svbpez7KI4CCXg"
  }
}
```

成功レスポンス（204・ボディなし）。

400（`endpoint` が `https://` で始まらない）:

```json
{ "endpoint": "http://example.com/push/abc", "keys": { "p256dh": "x", "auth": "y" } }
```

400（`p256dh` が base64url 文字集合外）:

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/x",
  "keys": { "p256dh": "not base64url!", "auth": "tBHItJI5svbpez7KI4CCXg" }
}
```

400（`keys` 欠落）:

```json
{ "endpoint": "https://fcm.googleapis.com/fcm/send/x" }
```

### 9.3 `POST /api/push/unsubscribe`

リクエストボディ:

```json
{ "endpoint": "https://fcm.googleapis.com/fcm/send/eXaMpLe-endpoint-id" }
```

成功レスポンス（204・存在しない `endpoint` を指定しても同じ 204）。

### 9.4 `GET /api/cron/expiry-alerts`

```
GET /api/cron/expiry-alerts
Authorization: Bearer <CRON_SECRET の値>
```

成功レスポンス（200・購読 2 件・在庫 3 件・1 件が失効）:

```json
{ "subscriptionCount": 2, "sentCount": 1, "removedCount": 1, "expiringStockCount": 3 }
```

購読 0 件・在庫 0 件（早期 return。本体設計書のとおり全フィールド 0）:

```json
{ "subscriptionCount": 0, "sentCount": 0, "removedCount": 0, "expiringStockCount": 0 }
```

401（`Authorization` ヘッダー欠落。`CRON_SECRET` は設定済みの前提）:

```json
{ "error": "Unauthorized" }
```

500（`CRON_SECRET` 未設定。ヘッダーの有無に関わらずこちらが優先。§5-3）:

```json
{ "error": "Server misconfigured" }
```

500（UseCase 内の予期しない例外。`app.onError` 経由。ボディ形が上記と異なる点に注意）:

```json
{ "error": "Internal Server Error" }
```

---

## 10. 契約テスト方針（test-designer への橋渡し）

以下はテスト設計の観点まとめ。テストケースの詳細設計・実装は test-designer の責務。

### 10.1 `push-subscription.schema.ts`（配置先: `packages/api-contract/tests/push-subscription.schema.test.ts` 新設）

| 観点                                                                          | テスト値の例                                             | 期待結果     |
| ----------------------------------------------------------------------------- | -------------------------------------------------------- | ------------ |
| 正常な `subscribeToExpiryAlertSchema` を受け入れる                            | §9.2 の成功例                                            | 成功         |
| `endpoint` が `http://`（https でない）を reject する                         | `endpoint: 'http://example.com/x'`                       | 失敗         |
| `endpoint` が URL 形式でない文字列を reject する                              | `endpoint: 'not-a-url'`                                  | 失敗         |
| `endpoint` が 2048 文字超を reject する                                       | 長い文字列を生成                                         | 失敗         |
| `p256dh` / `auth` が base64url 以外の文字（`+` `/` `=` 空白等）を reject する | `p256dh: 'abc+def/=='`                                   | 失敗         |
| `p256dh` / `auth` の空文字を reject する                                      | `p256dh: ''`                                             | 失敗         |
| `unsubscribeFromExpiryAlertSchema` が `endpoint` 単体を受け入れる             | `{ endpoint: 'https://fcm.googleapis.com/fcm/send/x' }`  | 成功         |
| `subscribe` と `unsubscribe` が同一の `endpoint` バリデーションを共有すること | 同じ不正 `endpoint` を両スキーマに通して両方失敗すること | 失敗（両方） |
| `vapidPublicKeyResponseSchema` が文字列を受け入れる（§5-4）                   | `{ publicKey: 'BEl62...' }`                              | 成功         |
| `expiryAlertsCronResultSchema` が非負整数のみ受け入れる                       | `subscriptionCount: -1` / `sentCount: 1.5` 等            | 失敗         |

### 10.2 Hono ルート（配置先: `apps/web/tests/server/routes/push.test.ts` /

`apps/web/tests/server/routes/cron.test.ts` 新設。既存 `pantry.test.ts` の
`vi.mock('@/db/client', ...)` + `vi.mock('@cookpit/application', ...)` パターンを踏襲）

| ルート                    | 観点                                                                                                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /vapid-public-key`   | 200・`VAPID_PUBLIC_KEY` 設定時に値が返ること／**未設定時と空文字設定時にそれぞれ 500 `{ error: 'Server misconfigured' }` を返すこと**（P-12・§5-4。環境変数モック。空文字設定は `undefined` とは別ケースとして扱う） |
| `POST /subscribe`         | 204・`UseCase.execute` が正しい引数（`endpoint`/`p256dh`/`auth` に平坦化されていること）で呼ばれること／400 × 3（§9.2 のケース）で `execute` が呼ばれないこと                                                        |
| `POST /unsubscribe`       | 204・存在しない `endpoint` でも 204／400（`endpoint` 不正）                                                                                                                                                          |
| `GET /cron/expiry-alerts` | 200（正しい `Authorization`）／401（欠落・不一致、`CRON_SECRET` 設定済み）／500（`CRON_SECRET` 未設定。§5-3 のチェック順序どおり、正しい形式のヘッダーを送っても 500 になることを含む）                              |
| `GET /cron/expiry-alerts` | レスポンスボディが `ExpiryAlertsCronResult` の 4 フィールドと一致すること                                                                                                                                            |

### 10.3 Infrastructure（配置先: `packages/infrastructure/tests/repositories/`。本体設計書

§テスト方針の再掲・契約観点の補足）

| 観点                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `save()` が新規 `endpoint` を追加すること                                                                                                                                                                                    |
| `save()` を同一 `endpoint`・異なる `p256dh`/`auth` で 2 回呼ぶと、`findByEndpoint()` が新しい鍵を返すこと（`onConflictDoUpdate` の `set` 句欠落は Unit A の既知の罠と同種。§7.1 の非冪等性を DB レベルで固定する回帰テスト） |
| `endpoint` の `UNIQUE` 制約により、Drizzle 層を経由しない直接 `INSERT` の重複が拒否されること（PGlite で確認）                                                                                                               |
| `create-test-db.ts` への DDL 追記漏れがあると本節のテストが全滅すること（罠 6 の再確認。実装時のチェックリスト）                                                                                                             |

### 10.4 型の往復・後方互換の確認観点

- `SubscribeToExpiryAlertBody` 型が `SubscribeToExpiryAlertInputDto`
  （本体設計書「Application」節。`packages/application/src/notification/`）の
  `endpoint`/`p256dh`/`auth` と構造的に一致すること（ネストされた `keys` を平坦化する変換が
  Hono ルート側にあることを踏まえて確認する）。
- 既存 `pantry.schema.ts` / `shopping-list.schema.ts` 等のテストが本ユニットの変更後も
  全件パスすること（§8 の裏付け。機械的な回帰確認）。
- `AppType` に `push` / `cron` の新しいプロパティが追加され、既存の `client.api.pantry.*`
  等の型が変化しないこと（型レベルの確認。実装時に `tsc --noEmit` 相当で確認）。

---

## 11. 実装ファイル一覧（参考・実装は implementer）

| ファイル                                                                  | 変更種別         | 内容                                                                                  |
| ------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| `packages/api-contract/src/push-subscription.schema.ts`                   | 新規             | §3.1 の 6 つの Zod スキーマ + 型                                                      |
| `packages/api-contract/src/index.ts`                                      | 追記             | `export * from './push-subscription.schema'`（§3.3）                                  |
| `packages/api-contract/tests/push-subscription.schema.test.ts`            | 新規             | §10.1（test-designer 確定後に implementer が実装）                                    |
| `packages/infrastructure/src/db/schema.ts`                                | 追記             | `pushSubscriptions` テーブル定義（§2）                                                |
| `apps/web/src/db/migrations/0008_*.sql`（+ `meta/0008_snapshot.json` 等） | 新規（自動生成） | `pnpm --filter @cookpit/web db:generate` で生成。手動編集しない                       |
| `packages/infrastructure/tests/testing/create-test-db.ts`                 | 追記             | `push_subscriptions` の `CREATE TABLE`（§2。L113-114 の間）                           |
| `apps/web/src/server/routes/push.ts`                                      | 新規             | `pushRoute`（§1）                                                                     |
| `apps/web/src/server/routes/cron.ts`                                      | 新規             | `cronRoute`（§1・§1.3 のインライン認証）                                              |
| `apps/web/src/server/app.ts`                                              | 追記             | `.route('/push', pushRoute)` / `.route('/cron', cronRoute)`（§8。`onError` 変更不要） |
| `apps/web/src/server/repositories.ts`                                     | 追記             | `pushSubscriptionRepository()` 関数（本体設計書の手動 DI パターン）                   |
| `apps/web/tests/server/routes/push.test.ts`                               | 新規             | §10.2                                                                                 |
| `apps/web/tests/server/routes/cron.test.ts`                               | 新規             | §10.2                                                                                 |

Domain（`PushSubscription` 集約・`PushSubscriptionRepository` インターフェース）・
Application（`SubscribeToExpiryAlertUseCase` 等・`SendExpiryAlertsUseCase`）・
Infrastructure（`DrizzlePushSubscriptionRepository` / `WebPushSender`）・`sw.ts` /
購読 UI コンポーネントは本体設計書の記載どおりで、本書の対象外（契約設計は api-contract /
Drizzle スキーマ / Hono ルートの型契約のみ）。

---

## 12. 本体設計書との差異メモ・申し送り

矛盾は無い。以下は本書が実装可能な水準まで詳細化する過程で追加した契約詳細・確認事項であり、
いずれも本体設計書 P-1〜P-11 の確定内容とは矛盾しない**追記**である。Orchestrator 経由で
ユーザー確認が必要な項目には★を付けた。

1. **`endpoint` の長さ上限（`.max(2048)`）と HTTPS 限定（`.refine()`）を追加した**
   （§3.2・§4.1）。本体設計書のコード例は `z.url()` のみ。既存の `store.schema.ts` の
   `max(255)` と同種の防御的な追加であり、正規の Push Service エンドポイントを reject しない
   想定。security-reviewer の確認事項として記録する。
2. **`p256dh` / `auth` に base64url 文字集合の正規表現 + 上限長を追加した**（§3.2・§4.2）。
   本体設計書のコード例は `z.string().min(1)` のみ。完全一致長ではなく上限のみとした理由は
   §4.2 のとおり。security-reviewer の確認事項として記録する。
3. **`expiryAlertsCronResultSchema` を api-contract に新設した**（§3.1・§3.2）。本体設計書は
   Application 層の `SendExpiryAlertsResultDto`（TS interface）のみを定義しており、
   api-contract 側の Zod 版は無かった。既存の `pantryResponseSchema`/`StockDto` の並存慣習を
   踏襲した追加であり、実行時の `zValidator` によるレスポンス検証は行わない（既存慣習と同じ
   位置づけ）。
4. ~~★`GET /vapid-public-key` が `VAPID_PUBLIC_KEY` 未設定時に 200 + 空文字を返す点は、
   `CRON_SECRET` 未設定時のフェイルクローズ（500）と非対称である。~~
   → **解決済み（2026-08-09・ユーザー確定 P-12）。500 でフェイルクローズする側に揃えた。**
   本体設計書（§変更後構成の `pushRoute` コード例・§API 設計の表・§確定事項 P-12）と
   本書（§5-2・§5-4・§6・§9.1・§10.1・§10.2）を更新済み。**本書の差し戻しが設計の
   非対称を実装前に捕まえた事例**として記録する。
5. **`cron` エンドポイントの 500 には 2 種類のボディ形が存在する**（§5-3）: 設定不備
   （`{ "error": "Server misconfigured" }`、インラインチェックが返す）と、予期しない例外
   （`{ "error": "Internal Server Error" }`、`app.onError` 経由）。本体設計書のコード例を
   忠実に反映した結果であり矛盾ではないが、明記が無かったため本書で確定した。test-designer は
   この 2 パターンを別ケースとして扱うこと。
6. **`CRON_SECRET` 未設定チェックと `Authorization` ヘッダー比較の順序**（§5-3 の表の下の
   注記）: 未設定チェックが常に優先されるため、「未設定 + 正しい形式のヘッダー」は 401 では
   なく 500 になる。本体設計書のコード順（`if (cronSecret === undefined ...) ... return 500;
if (header !== ...) ... return 401;`）をそのまま契約化した。
7. **Bearer 比較は単純な文字列不等号（`!==`）であり、タイミング攻撃对策（定数時間比較）を
   持たない**（本体設計書のコード例のまま）。`CRON_SECRET` は外部に漏れなければ実害は
   小さいと考えられるが、security-reviewer の確認事項として記録する（本書はこの点を変更する
   権限を持たない。契約設計者は Zod/DB/Hono の型契約のみを扱う）。
8. `SubscribeToExpiryAlertUseCase` の疑似コード（本体設計書 L426-437）に全角文字の
   プレースホルダが含まれる点は、本体設計書自身が「誤記防止のためのプレースホルダである」と
   明記済み（L449-452）であり、Application 層の実装詳細（`reconstruct()` に既存 `id` を渡す
   upsert ロジック）に属するため、api-contract の契約（リクエスト/レスポンスの型・
   バリデーション）には影響しない。本書では言及にとどめる。
9. `web-push` パッケージの追加（P-9 確定）は依存関係の追加であり、api-contract / Drizzle /
   Hono の型契約そのものではないため本書の対象外。security-reviewer の起動条件（依存追加）に
   該当する旨のみ記録する。
