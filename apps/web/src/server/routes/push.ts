import {
  subscribeToExpiryAlertSchema,
  unsubscribeFromExpiryAlertSchema,
} from '@cookpit/api-contract';
import {
  SubscribeToExpiryAlertUseCase,
  UnsubscribeFromExpiryAlertUseCase,
} from '@cookpit/application';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { createWriteContext } from '../repositories';

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
    const { pushSubscription, uow } = createWriteContext();
    await new SubscribeToExpiryAlertUseCase(pushSubscription, uow).execute({
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
    });
    return c.body(null, 204);
  })
  .post('/unsubscribe', zValidator('json', unsubscribeFromExpiryAlertSchema), async (c) => {
    c.header('Cache-Control', 'no-store');
    const { endpoint } = c.req.valid('json');
    const { pushSubscription, uow } = createWriteContext();
    await new UnsubscribeFromExpiryAlertUseCase(pushSubscription, uow).execute({
      endpoint,
    });
    return c.body(null, 204);
  });
