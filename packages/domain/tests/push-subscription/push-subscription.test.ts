import { describe, expect, it } from 'vitest';
import type {
  CreatePushSubscriptionInput,
  PushSubscriptionProps,
} from '../../src/push-subscription/push-subscription';
import { PushSubscription } from '../../src/push-subscription/push-subscription';
import { PushSubscriptionId } from '../../src/push-subscription/push-subscription-id';

function createInput(
  overrides: Partial<CreatePushSubscriptionInput> = {},
): CreatePushSubscriptionInput {
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/example',
    p256dh:
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7Dk',
    auth: 'tBHItJI5svbpez7KI4CCXg',
    ...overrides,
  };
}

function reconstructProps(overrides: Partial<PushSubscriptionProps> = {}): PushSubscriptionProps {
  return {
    id: PushSubscriptionId.fromString('push-subscription-1'),
    endpoint: createInput().endpoint,
    p256dh: createInput().p256dh,
    auth: createInput().auth,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('PushSubscription', () => {
  it('create は入力された全フィールドを設定する (PS-01)', () => {
    const input = createInput();
    const subscription = PushSubscription.create(input);

    expect(subscription.id.value).toMatch(/^[0-9a-f-]{36}$/);
    expect(subscription.endpoint).toBe(input.endpoint);
    expect(subscription.p256dh).toBe(input.p256dh);
    expect(subscription.auth).toBe(input.auth);
    expect(subscription.createdAt).toBeInstanceOf(Date);
  });

  it('create は endpoint が空文字の場合を拒否する (PS-02)', () => {
    expect(() => PushSubscription.create(createInput({ endpoint: '' }))).toThrow(
      'endpoint, p256dh, auth must not be empty',
    );
  });

  it('create は endpoint が空白のみの場合を拒否する (PS-02)', () => {
    expect(() => PushSubscription.create(createInput({ endpoint: '   ' }))).toThrow(
      'endpoint, p256dh, auth must not be empty',
    );
  });

  it('create は p256dh が空文字の場合を拒否する (PS-03)', () => {
    expect(() => PushSubscription.create(createInput({ p256dh: '' }))).toThrow(
      'endpoint, p256dh, auth must not be empty',
    );
  });

  it('create は auth が空文字の場合を拒否する (PS-04)', () => {
    expect(() => PushSubscription.create(createInput({ auth: '' }))).toThrow(
      'endpoint, p256dh, auth must not be empty',
    );
  });

  it('reconstruct は空文字でも throw しない（DB からの復元は検証を経ない） (PS-05)', () => {
    expect(() =>
      PushSubscription.reconstruct(reconstructProps({ endpoint: '', p256dh: '', auth: '' })),
    ).not.toThrow();
  });

  it('reconstruct は入力された props をそのまま復元する (PS-06)', () => {
    const props = reconstructProps();
    const subscription = PushSubscription.reconstruct(props);

    expect(subscription.id.equals(props.id)).toBe(true);
    expect(subscription.endpoint).toBe(props.endpoint);
    expect(subscription.p256dh).toBe(props.p256dh);
    expect(subscription.auth).toBe(props.auth);
    expect(subscription.createdAt).toEqual(props.createdAt);
  });

  it('create は呼ぶたびに異なる id を発行する (PS-07)', () => {
    const a = PushSubscription.create(createInput());
    const b = PushSubscription.create(createInput());

    expect(a.id.equals(b.id)).toBe(false);
  });

  it('createdAt getter は防御的コピーを返す (PS-08)', () => {
    const subscription = PushSubscription.reconstruct(reconstructProps());
    const createdAt = subscription.createdAt;

    createdAt.setFullYear(1900);

    expect(subscription.createdAt.getFullYear()).not.toBe(1900);
    expect(subscription.createdAt).toEqual(reconstructProps().createdAt);
  });
});
