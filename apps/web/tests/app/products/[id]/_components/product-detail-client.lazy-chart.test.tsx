import type { ProductDto } from '@cookpit/application';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * PDC-16 専用の独立ファイル（レビュー M-1 の回帰ガード）。
 *
 * 「価格記録 0 件では遅延読み込みを経由せず同期的に空状態を描画する」ことを検証する。
 * `product-detail-client.test.tsx` 内に置くと、先行テストの `render()` で
 * `import('./price-history-chart')` が解決済み（モジュールキャッシュ）になり、
 * バグのある実装でも同期的に描画されて**誤って PASS する**。
 * vitest はテストファイル単位でモジュールレジストリが分かれるため、別ファイルに置くことで
 * 「初回ロード時に遅延解決を経由しない」ことを実際に検証できる。
 */

const { getStores, refresh, push } = vi.hoisted(() => ({
  getStores: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push }),
}));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      stores: {
        $get: (...args: unknown[]) => getStores(...args),
        $post: vi.fn(),
        ':id': { $delete: vi.fn() },
      },
      products: {
        ':id': {
          $delete: vi.fn(),
          'price-records': {
            $post: vi.fn(),
            ':priceRecordId': { $delete: vi.fn(), $put: vi.fn() },
          },
        },
      },
    },
  },
}));

import { ProductDetailClient } from '../../../../../src/app/products/[id]/_components/product-detail-client';

function createProductDto(): ProductDto {
  return {
    id: 'product-1',
    name: '玉ねぎ',
    aliases: [],
    category: '野菜',
    defaultUnit: '個',
    priceHistory: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

describe('ProductDetailClient（遅延読み込みの分岐）', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('PDC-16: 価格記録 0 件では空状態文言が同期的に描画され、スケルトンを経由しない', () => {
    getStores.mockResolvedValue({ ok: true, json: async () => [] });

    render(<ProductDetailClient product={createProductDto()} cheapestStore={null} />);

    // await を挟まず同期的に出ていること＝ dynamic import を経由していない。
    // 経由していると、この時点ではスケルトン（h-64）だけが描画される。
    expect(screen.getByText('価格記録がありません')).toBeDefined();
    expect(document.querySelector('.animate-pulse')).toBeNull();
  });
});
