import { describe, expect, it } from 'vitest';
import {
  expiryAlertsCronResultSchema,
  pushEndpointSchema,
  pushSubscriptionKeysSchema,
  subscribeToExpiryAlertSchema,
  unsubscribeFromExpiryAlertSchema,
  vapidPublicKeyResponseSchema,
} from '../src/push-subscription.schema';

const BASE64URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64url(length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += BASE64URL_CHARS[i % BASE64URL_CHARS.length];
  }
  return out;
}

const VALID_ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';
const VALID_P256DH = base64url(87);
const VALID_AUTH = base64url(22);

describe('subscribeToExpiryAlertSchema', () => {
  it('Z-PUSH-01: 正常系を受け入れる', () => {
    const result = subscribeToExpiryAlertSchema.safeParse({
      endpoint: VALID_ENDPOINT,
      keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
    });

    expect(result.success).toBe(true);
  });

  it('Z-PUSH-07: keys が欠落していると失敗する', () => {
    const result = subscribeToExpiryAlertSchema.safeParse({ endpoint: VALID_ENDPOINT });

    expect(result.success).toBe(false);
  });
});

describe('pushEndpointSchema', () => {
  it('Z-PUSH-02: http（https でない）を reject する', () => {
    expect(pushEndpointSchema.safeParse('http://example.com/x').success).toBe(false);
  });

  it('Z-PUSH-03: URL 形式でない文字列を reject する', () => {
    expect(pushEndpointSchema.safeParse('not-a-url').success).toBe(false);
  });

  it('Z-PUSH-04: 2048 文字超を reject する', () => {
    const longEndpoint = `https://fcm.googleapis.com/${'a'.repeat(2048)}`;
    expect(pushEndpointSchema.safeParse(longEndpoint).success).toBe(false);
  });

  it('Z-PUSH-05: 2048 文字ちょうどを受理する（境界）', () => {
    const prefix = 'https://fcm.googleapis.com/';
    const padded = prefix + 'a'.repeat(2048 - prefix.length);
    expect(padded).toHaveLength(2048);
    expect(pushEndpointSchema.safeParse(padded).success).toBe(true);
  });

  it('Z-PUSH-15: IPv4/IPv6 リテラルホストを reject する', () => {
    for (const endpoint of ['https://127.0.0.1/x', 'https://[::1]/x', 'https://192.168.1.1/x']) {
      expect(pushEndpointSchema.safeParse(endpoint).success).toBe(false);
    }
  });

  it('Z-PUSH-16: localhost/.local/.internal サフィックスのホストを reject する', () => {
    for (const endpoint of [
      'https://localhost/x',
      'https://foo.local/x',
      'https://foo.internal/x',
    ]) {
      expect(pushEndpointSchema.safeParse(endpoint).success).toBe(false);
    }
  });

  it('Z-PUSH-17: userinfo 部を含む URL を reject する', () => {
    expect(pushEndpointSchema.safeParse('https://evil.example@fcm.googleapis.com/x').success).toBe(
      false,
    );
  });

  it('Z-PUSH-19: 正規ホストを accept する', () => {
    expect(pushEndpointSchema.safeParse('https://fcm.googleapis.com/fcm/send/xxx').success).toBe(
      true,
    );
  });

  it('Z-PUSH-20: 大文字スキーム（HTTPS://）を accept する（境界）', () => {
    expect(pushEndpointSchema.safeParse('HTTPS://fcm.googleapis.com/fcm/send/xxx').success).toBe(
      true,
    );
  });

  it('localhost を含むだけの正規な外部ドメインは誤って拒否しない（includes 誤検知の回帰）', () => {
    expect(pushEndpointSchema.safeParse('https://localhost.example.com/x').success).toBe(true);
  });
});

describe('pushSubscriptionKeysSchema', () => {
  it('Z-PUSH-06: base64url 以外の文字を reject する', () => {
    const result = pushSubscriptionKeysSchema.safeParse({
      p256dh: `${base64url(85)}+`,
      auth: VALID_AUTH,
    });

    expect(result.success).toBe(false);
  });

  it('Z-PUSH-07(keys): p256dh/auth の空文字を reject する', () => {
    expect(pushSubscriptionKeysSchema.safeParse({ p256dh: '', auth: VALID_AUTH }).success).toBe(
      false,
    );
  });

  it('Z-PUSH-08: p256dh が上限（88 文字）超を reject する', () => {
    expect(
      pushSubscriptionKeysSchema.safeParse({ p256dh: base64url(89), auth: VALID_AUTH }).success,
    ).toBe(false);
  });

  it('Z-PUSH-09: auth が上限（24 文字）超を reject する', () => {
    expect(
      pushSubscriptionKeysSchema.safeParse({ p256dh: VALID_P256DH, auth: base64url(25) }).success,
    ).toBe(false);
  });

  it('Z-PUSH-21: p256dh が下限（86 文字）未満を reject する', () => {
    expect(
      pushSubscriptionKeysSchema.safeParse({ p256dh: base64url(85), auth: VALID_AUTH }).success,
    ).toBe(false);
  });

  it('Z-PUSH-22〜23: p256dh が 86〜88 文字を受理する（境界）', () => {
    for (const length of [86, 87, 88]) {
      expect(
        pushSubscriptionKeysSchema.safeParse({ p256dh: base64url(length), auth: VALID_AUTH })
          .success,
      ).toBe(true);
    }
  });

  it('Z-PUSH-24: auth が下限（22 文字）未満を reject する', () => {
    expect(
      pushSubscriptionKeysSchema.safeParse({ p256dh: VALID_P256DH, auth: base64url(21) }).success,
    ).toBe(false);
  });

  it('Z-PUSH-25〜26: auth が 22〜24 文字を受理する（境界）', () => {
    for (const length of [22, 23, 24]) {
      expect(
        pushSubscriptionKeysSchema.safeParse({ p256dh: VALID_P256DH, auth: base64url(length) })
          .success,
      ).toBe(true);
    }
  });
});

describe('unsubscribeFromExpiryAlertSchema', () => {
  it('Z-PUSH-10: endpoint 単体を受理する', () => {
    expect(unsubscribeFromExpiryAlertSchema.safeParse({ endpoint: VALID_ENDPOINT }).success).toBe(
      true,
    );
  });

  it('Z-PUSH-11: subscribe と同一の endpoint バリデーションを共有する（DRY の確認）', () => {
    const invalidEndpoint = 'https://127.0.0.1/x';

    expect(
      subscribeToExpiryAlertSchema.safeParse({
        endpoint: invalidEndpoint,
        keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
      }).success,
    ).toBe(false);
    expect(unsubscribeFromExpiryAlertSchema.safeParse({ endpoint: invalidEndpoint }).success).toBe(
      false,
    );
  });
});

describe('vapidPublicKeyResponseSchema', () => {
  it('Z-PUSH-12: 文字列を受理する', () => {
    expect(vapidPublicKeyResponseSchema.safeParse({ publicKey: 'BEl62...' }).success).toBe(true);
  });
});

describe('expiryAlertsCronResultSchema', () => {
  it('Z-PUSH-13: 非負整数以外を reject する', () => {
    const base = { subscriptionCount: 1, sentCount: 1, removedCount: 0, expiringStockCount: 1 };

    expect(expiryAlertsCronResultSchema.safeParse({ ...base, subscriptionCount: -1 }).success).toBe(
      false,
    );
    expect(expiryAlertsCronResultSchema.safeParse({ ...base, sentCount: 1.5 }).success).toBe(false);
  });

  it('Z-PUSH-14: 全 0（早期終了ケース）を受理する', () => {
    const result = expiryAlertsCronResultSchema.safeParse({
      subscriptionCount: 0,
      sentCount: 0,
      removedCount: 0,
      expiringStockCount: 0,
    });

    expect(result.success).toBe(true);
  });
});
