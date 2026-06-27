# Task 5: Presentation 層 (UI) — 商品4画面

## 前提

Task 1〜4 が完了していること。

## 概要

商品一覧・作成・詳細・編集の4画面を実装する。
既存の Recipe 画面（`apps/web/src/app/recipes/`）と同じパターンに従う。

## アーキテクチャパターン（Recipe 画面の踏襲）

- **Server Component**: 初期データを UseCase から直接取得し、Client Component に渡す
- **Client Component**: `'use client'` でインタラクション（フォーム・フィルタ等）を担当
- **Hono RPC**: `client.api.products.$post(...)` 等で型安全にAPIを呼び出す
- **手動 DI**: Server Component 内で Repository → UseCase を組み立てる
- **`dynamic = 'force-dynamic'`**: 毎回 Server Component を実行（キャッシュしない）

### API クライアント

```typescript
import { client } from '@/lib/api-client';
// client は hc<AppType>('/') で初期化済み（Hono RPC）
// 例: client.api.products.$post({ json: body })
// 例: client.api.products[':id'].$put({ param: { id }, json: body })
```

`AppType` は `apps/web/src/server/app.ts` で `typeof routes` として export されており、
Task 4 で `productsRoute` と `storesRoute` を追加済みなので自動的に型が付く。

### 利用可能な UI コンポーネント（shadcn/ui）

- `@/components/ui/button` — `Button`, `buttonVariants`
- `@/components/ui/input` — `Input`
- `@/components/ui/textarea` — `Textarea`
- `@/components/ui/alert-dialog` — `AlertDialog` 系
- `@/lib/utils` — `cn()` (clsx + tailwind-merge)
- `lucide-react` — アイコン（`Plus`, `ArrowLeft` 等）
- `next/link` — `Link`
- `next/navigation` — `useRouter`, `notFound`

## Recharts + shadcn chart 導入

商品詳細画面の価格推移グラフに Recharts を使う。
実装前に以下を実行する:

```bash
pnpm --filter @cookpit/web add recharts
pnpm dlx shadcn@latest add chart   # apps/web/ 内で実行
```

これにより `apps/web/src/components/ui/chart.tsx` が生成される。

## 実装対象ファイル

すべて `apps/web/src/app/products/` 配下に新規作成する。

### 1. 商品一覧画面

#### `products/page.tsx` — Server Component

模範: `apps/web/src/app/recipes/page.tsx`

```typescript
import { getDb } from '@/db/client';
import { GetProductsUseCase } from '@cookpit/application';
import { DrizzleProductRepository, DrizzleStoreRepository } from '@cookpit/infrastructure';
import { ProductListClient } from './_components/product-list-client';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const productRepository = new DrizzleProductRepository(getDb());
  const storeRepository = new DrizzleStoreRepository(getDb());
  const useCase = new GetProductsUseCase(productRepository, storeRepository);
  const products = await useCase.execute();

  return <ProductListClient initialProducts={products} />;
}
```

#### `products/_components/product-list-client.tsx` — Client Component

模範: `apps/web/src/app/recipes/_components/recipe-list-client.tsx`

- props: `initialProducts: ProductDto[]`
- `useState` で検索ワード・カテゴリフィルタ管理
- クライアント側フィルタリング（Hono RPC 再取得は不要）
- 「追加」ボタン → `/products/new` へリンク
- 一覧: `products.map(p => <ProductCard key={p.id} product={p} />)`

#### `products/_components/product-card.tsx`

模範: `apps/web/src/app/recipes/_components/recipe-card.tsx`

- props: `product: ProductDto`
- 表示: 商品名、カテゴリ、defaultUnit
- 最新価格: `priceHistory` の最新1件（`observedAt` 最大）の `priceAmount` を表示。なければ「価格未登録」
- `/products/${product.id}` へのリンク

### 2. 商品作成画面

#### `products/new/page.tsx` — Server Component

模範: `apps/web/src/app/recipes/new/page.tsx`

```typescript
import { ProductFormClient } from './_components/product-form-client';

export default function NewProductPage() {
  return <ProductFormClient />;
}
```

#### `products/new/_components/product-form-client.tsx` — Client Component

模範: `apps/web/src/app/recipes/new/_components/recipe-form-client.tsx`

- フォーム項目:
  - name: テキスト入力
  - aliases: カンマ区切りテキスト → 送信時に `split(',').map(s => s.trim()).filter(Boolean)`
  - category: セレクト（`productCategorySchema.options` から選択肢生成）
  - defaultUnit: セレクト（`unitSchema.options` から選択肢生成）
- 送信: `client.api.products.$post({ json: body })`
- 成功後: `router.push('/products')`
- エラー: インライン表示

### 3. 商品詳細画面

#### `products/[id]/page.tsx` — Server Component

模範: `apps/web/src/app/recipes/[id]/page.tsx`

```typescript
import { getDb } from '@/db/client';
import { GetProductUseCase, GetCheapestStoreUseCase, type ProductDto, type CheapestStoreResultDto, ProductNotFoundError } from '@cookpit/application';
import { DrizzleProductRepository, DrizzleStoreRepository } from '@cookpit/infrastructure';
import { notFound } from 'next/navigation';
import { ProductDetailClient } from './_components/product-detail-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  const productRepository = new DrizzleProductRepository(getDb());
  const storeRepository = new DrizzleStoreRepository(getDb());

  let product: ProductDto;
  let cheapestStore: CheapestStoreResultDto | null;
  try {
    const getProduct = new GetProductUseCase(productRepository, storeRepository);
    product = await getProduct.execute(id);
    const getCheapest = new GetCheapestStoreUseCase(productRepository, storeRepository);
    cheapestStore = await getCheapest.execute(id);
  } catch (error) {
    if (error instanceof ProductNotFoundError) {
      notFound();
    }
    throw error;
  }

  return <ProductDetailClient product={product} cheapestStore={cheapestStore} />;
}
```

#### `products/[id]/_components/product-detail-client.tsx` — Client Component

- props: `product: ProductDto`, `cheapestStore: CheapestStoreResultDto | null`
- 商品情報表示: name, category, aliases（タグ表示）, defaultUnit
- 最安店舗表示: cheapestStore が null なら「価格記録なし」
- `<PriceHistoryChart priceHistory={product.priceHistory} />`
- 価格記録フォーム（インライン）:
  - storeId: セレクト — `useEffect` で `client.api.stores.$get()` を呼んで店舗一覧を取得
  - priceAmount: 数値入力
  - packageSizeValue: 数値入力
  - packageSizeUnit: セレクト（`unitSchema.options`）
  - 送信: `client.api.products[':id']['price-records'].$post({ param: { id: product.id }, json: body })`
  - 送信後: `router.refresh()` でデータ再取得
- 「編集」ボタン → `/products/${product.id}/edit` へリンク

#### `products/[id]/_components/price-history-chart.tsx` — Client Component

- props: `priceHistory: PriceRecordDto[]`
- 空配列 → 「価格記録がありません」メッセージ表示
- Recharts の `LineChart` を使用（shadcn/ui chart ラッパー経由）
- X 軸: `observedAt`（時系列）
- Y 軸: `unitPriceAmount`（円）
- 系列: `storeName` で色分け

### 4. 商品編集画面

#### `products/[id]/edit/page.tsx` — Server Component

模範: `apps/web/src/app/recipes/[id]/edit/page.tsx`

```typescript
import { getDb } from '@/db/client';
import { GetProductUseCase, type ProductDto, ProductNotFoundError } from '@cookpit/application';
import { DrizzleProductRepository, DrizzleStoreRepository } from '@cookpit/infrastructure';
import { notFound } from 'next/navigation';
import { ProductEditFormClient } from './_components/product-edit-form-client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProductEditPage({ params }: Props) {
  const { id } = await params;
  const productRepository = new DrizzleProductRepository(getDb());
  const storeRepository = new DrizzleStoreRepository(getDb());

  let product: ProductDto;
  try {
    const useCase = new GetProductUseCase(productRepository, storeRepository);
    product = await useCase.execute(id);
  } catch (error) {
    if (error instanceof ProductNotFoundError) {
      notFound();
    }
    throw error;
  }

  return <ProductEditFormClient product={product} />;
}
```

#### `products/[id]/edit/_components/product-edit-form-client.tsx` — Client Component

- props: `product: ProductDto`（初期値プリフィル）
- フォーム項目: `product-form-client.tsx` と同形
  - name: `product.name` で初期化
  - aliases: `product.aliases.join(', ')` で初期化 → 送信時に split
  - category: `product.category` で初期化
  - defaultUnit: `product.defaultUnit` で初期化
- 送信: `client.api.products[':id'].$put({ param: { id: product.id }, json: body })`
- 成功後: `router.push('/products/' + product.id)`

## ナビゲーション

既存ナビゲーションに「商品」へのリンクを追加する。
`apps/web/src/app/` 配下のレイアウトやナビゲーションコンポーネントに
`/products` へのリンクを追記する（既存の `/recipes` リンクと同列に配置）。

## 完了条件

```bash
pnpm --filter @cookpit/web type-check  # 通過
pnpm lint                               # 通過
# ブラウザで4画面すべてが表示・操作できること（手動確認）
```

## 注意事項

- TanStack Query は未導入のため、ミューテーション後のデータ更新は `router.refresh()` を使う
- スタイルは既存 Recipe 画面の Tailwind クラスを参考にする（モバイルファースト `max-w-md`）
- 既存の `/api/recipes` エンドポイントが引き続き正常動作すること（後方互換）
