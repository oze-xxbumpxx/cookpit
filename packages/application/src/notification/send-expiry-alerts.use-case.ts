import type { PushPayload, PushSender, PushSubscriptionRepository } from '@cookpit/domain';
import { formatExpiryUrgencyLabel, getExpiryRemainingDays } from '../pantry/expiry';
import type { GetExpiringStocksUseCase } from '../pantry/get-expiring-stocks.use-case';
import type { StockDto } from '../pantry/pantry.dto';

export interface SendExpiryAlertsResultDto {
  subscriptionCount: number;
  sentCount: number;
  removedCount: number;
  expiringStockCount: number;
}

const DIGEST_HEAD_COUNT = 3; // P-7 確定: 先頭 3 件 + 「他 n 件」
const DIGEST_TAP_URL = '/pantry'; // P-7 確定

/**
 * 期限が近い在庫の日次ダイジェストを、購読中の全デバイスへ Push 送信する（Vercel Cron から
 * 日次で 1 回呼ばれる想定）。個別送信の失敗は `Promise.allSettled` で吸収し、全体を失敗させない
 * （要件 E-3）。404/410（`reason: 'invalid_subscription'`）を返した購読のみ削除する
 * （`'other'` では削除しない。恒久的な障害と一時的な障害を区別するため）。
 */
export class SendExpiryAlertsUseCase {
  /**
   * `GetExpiringStocksUseCase` はコンストラクタで受け取る（`execute()` 内で `new` しない）。
   * ダッシュボード表示側と同じ UseCase インスタンスを手動 DI の外で使い回すためではなく、
   * テストで期限抽出の結果を制御しやすくするための設計（reviewer S-3）。
   */
  constructor(
    private readonly getExpiringStocksUseCase: GetExpiringStocksUseCase,
    private readonly pushSubscriptionRepository: PushSubscriptionRepository,
    private readonly pushSender: PushSender,
  ) {}

  async execute(asOf: Date): Promise<SendExpiryAlertsResultDto> {
    const subscriptions = await this.pushSubscriptionRepository.findAll();
    if (subscriptions.length === 0) {
      return { subscriptionCount: 0, sentCount: 0, removedCount: 0, expiringStockCount: 0 };
    }

    const allExpiring = await this.getExpiringStocksUseCase.execute(asOf);
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

    const payload = buildDigestPayload(expiringStocks, asOf);

    const results = await Promise.allSettled(
      subscriptions.map((subscription) => this.pushSender.send(subscription, payload)),
    );

    const staleEndpoints = subscriptions
      .filter((_, index) => {
        const result = results[index];
        return (
          result?.status === 'fulfilled' &&
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
    // buildDigestPayload の呼び出し元は expiringStocks（selectExpiringStocks 済み）を渡すため
    // expiresAt !== null の不変条件に依拠する。
    const remainingDays = getExpiryRemainingDays(stock.expiresAt as string, asOf);
    return `${stock.displayName}（${formatExpiryUrgencyLabel(remainingDays)}）`;
  });
  const body = rest > 0 ? `${lines.join(' / ')} / 他${rest}件` : lines.join(' / ');

  return { title: '賞味期限が近い在庫があります', body, url: DIGEST_TAP_URL };
}
