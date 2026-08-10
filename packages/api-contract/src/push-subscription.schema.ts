import z from 'zod';

/**
 * `endpoint` の hostname が「明らかに社内・ローカル向け」であるかを判定する。
 *
 * P-16 確定: 判定は必ず呼び出し側で `new URL(value).hostname` を渡すこと
 * （文字列の前方一致・`includes` は使わない）。`new URL()` の host 解析は IPv4 の
 * 10 進数以外の表記（16 進数・8 進数・単一の 32bit 整数表記等）も正規のドット区切り
 * 表記へ正規化するため、`https://2130706433/x` のような IP 表記の難読化も
 * `hostname` 側で捕捉できる。
 */
const isIpLiteral = (hostname: string): boolean => {
  const isIpv4Literal = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
  const isIpv6Literal = hostname.startsWith('[') && hostname.endsWith(']');
  return isIpv4Literal || isIpv6Literal;
};

const isDisallowedHostname = (hostname: string): boolean =>
  hostname === 'localhost' ||
  hostname.endsWith('.local') ||
  hostname.endsWith('.internal') ||
  isIpLiteral(hostname);

/**
 * Push Service（FCM / Apple / Mozilla 等）が発行する購読エンドポイント URL。
 * Web Push の仕様上エンドポイントは常に HTTPS。長さ上限は実務上の実測値（各 Push Service
 * とも概ね 100〜300 文字）に対し十分な余裕を持たせた防御的な上限であり、正規の URL を
 * 拒否しない値として 2048 を採用する（store.schema.ts の `z.string().max(255)` と同じ
 * 「DB 列自体は無制限だがアプリ境界で上限を設ける」慣習）。
 *
 * P-16 確定: `POST /subscribe` に認証が無い（契約設計書 §1.1）ため `endpoint` は
 * 「Push Service が発行した値である」ことを保証できない外部入力であり、Cron が日次で毎回
 * POST する送信先になる（blind SSRF の経路）。hostname が IPv4/IPv6 リテラル、または
 * `localhost`/`*.local`/`*.internal` の場合は拒否する。既知 Push Service の許可リスト
 * （案 B）は採らない（ブラウザが新しい Push Service に切り替わったとき、正規購読を誤って
 * 拒否するリスクがあるため）。
 *
 * userinfo（`username`/`password`）を含む URL も拒否する。正規の Push Service の
 * `endpoint` に userinfo が含まれることは無く、`new URL().hostname` が userinfo を
 * 読み飛ばしてしまう（例: `https://evil.example@fcm.googleapis.com/x` の `hostname` は
 * `fcm.googleapis.com`）ことを悪用した混乱を避けるための追加防御。
 *
 * L-4 確定: HTTPS 判定は `new URL(value).protocol === 'https:'` で行う（`protocol` は
 * 常に小文字へ正規化されるため `HTTPS://...` のような大文字表記も正しく受理できる）。
 * 文字列の前方一致（`startsWith('https://')`）は大文字スキームを誤って拒否するため使わない。
 */
// `.refine()` は先行するチェック（`z.url()`）が失敗していても実行される（zod v4 の chain は
// 短絡しない）。`new URL(value)` を try/catch なしで呼ぶと、`z.url()` を通過しなかった
// 不正な文字列に対して `safeParse()` 自体が例外を投げてしまう（実装時に実測で確認）。
// 各 refine 内で必ず try/catch し、失敗時は `false` を返す。
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
        const url = new URL(value);
        return url.username === '' && url.password === '';
      } catch {
        return false;
      }
    },
    { message: 'endpoint must not contain userinfo (username/password)' },
  )
  .refine(
    (value) => {
      try {
        return !isDisallowedHostname(new URL(value).hostname);
      } catch {
        return false;
      }
    },
    { message: 'endpoint must not target a private, loopback, or internal host' },
  );

/**
 * ECDH 公開鍵（p256dh）と認証シークレット（auth）。ブラウザの
 * `PushSubscription.toJSON().keys` をそのまま渡す想定。Base64URL（RFC 4648 §5、パディング
 * なし）のみを許可する。
 *
 * P-17 確定: RFC 8291 上 `p256dh` は非圧縮 P-256 公開鍵 65 バイト固定、`auth` は
 * 16 バイト固定であり、いずれも可変長ではない。文字集合の制約だけで下限を `min(1)` の
 * まま許すと、長さが不正な鍵が登録された場合に `web-push` が送信前に例外を投げ、
 * `WebPushSender` の `catch` は `statusCode` を持たない例外を `reason: 'other'` に
 * 分類する。設計上 `'other'` は購読を削除しないため、404/410 を受け取る機会が永遠に来ず、
 * 当該行が Cron 失敗として恒久的に残ってしまう。そのため文字集合に加えて長さレンジを課す。
 * レンジには 1〜2 文字の幅を持たせ、パディング有無・ブラウザ実装差を吸収する（完全一致長
 * にはしない）。ただし `=`（パディング文字）は文字集合の正規表現の対象外のままであり、
 * 長さの上限（88/24）はパディング付き値の許可を意図したものではなく、ブラウザ実装差による
 * ±1 文字程度のブレを吸収する目的にとどまる。
 */
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
