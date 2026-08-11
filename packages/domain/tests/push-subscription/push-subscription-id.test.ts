import { describe, expect, it } from 'vitest';
import { PushSubscriptionId } from '../../src/push-subscription/push-subscription-id';

describe('PushSubscriptionId', () => {
  it('generate は毎回異なる UUID を生成する', () => {
    const a = PushSubscriptionId.generate();
    const b = PushSubscriptionId.generate();
    expect(a.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.equals(b)).toBe(false);
  });

  it('fromString は値を保持する', () => {
    expect(PushSubscriptionId.fromString('push-subscription-1').value).toBe('push-subscription-1');
  });

  it('同じ値どうしは equals が true', () => {
    expect(
      PushSubscriptionId.fromString('push-subscription-1').equals(
        PushSubscriptionId.fromString('push-subscription-1'),
      ),
    ).toBe(true);
  });

  it('異なる値どうしは equals が false', () => {
    expect(
      PushSubscriptionId.fromString('push-subscription-1').equals(
        PushSubscriptionId.fromString('push-subscription-2'),
      ),
    ).toBe(false);
  });
});
