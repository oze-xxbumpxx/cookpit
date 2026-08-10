import { GetExpiringStocksUseCase, SendExpiryAlertsUseCase } from '@cookpit/application';
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

  const getExpiringStocksUseCase = new GetExpiringStocksUseCase(pantryRepository());
  const result = await new SendExpiryAlertsUseCase(
    getExpiringStocksUseCase,
    pushSubscriptionRepository(),
    pushSender(vapid),
  ).execute(new Date());

  console.log('expiry-alerts cron result', result);
  return c.json(result, 200);
});
