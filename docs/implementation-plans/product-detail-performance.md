# 実装計画: product-detail-performance

- 前提となる設計書: [docs/designs/product-detail-performance.md](../designs/product-detail-performance.md)
- 前提となる試験計画: [docs/tests/product-detail-performance.md](../tests/product-detail-performance.md)（試験 ID の正典。本計画はここを参照する）
- レベル: L2
- 実装ルート: Orchestrator（implementer）
- 判断理由: 既定どおり（変更範囲が Application 1 ファイル + Presentation 3 ファイルに閉じ、
  Codex 委譲を要するほどの規模ではない。docs/06-ai-tools.md の実装ルート基準に沿う）

## 進め方（TDD）

各ステップは **Red（先に失敗させる） → Green（最小実装で通す）** で進める。試験 ID は
[docs/tests/product-detail-performance.md](../tests/product-detail-performance.md) を正典として
参照する（ID の追加・変更はしない）。

設計書 §移行とリリース のとおり **A（クエリ削減 = Step 1・2）と B（recharts 遅延化 = Step 3）は
互いに独立**。Step 3 は Step 1・2 の完了を待たずに着手できるが、本計画では
Presentation → Application → Presentation という層の外形に沿って Step 1（Application）→
Step 2（page.tsx）→ Step 3（recharts 遅延化）の順で書く。実装者が並行に進めたい場合は
Step 3 を Step 1 と並行実施してよい（依存なし）。

## 変更対象ファイル

| ファイル                                                                      | なぜ変えるか                                                                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `packages/application/src/product/product.dto.ts`                             | `ProductDetailResultDto` を追加                                                                                          |
| `packages/application/src/product/index.ts`                                   | 新規 UseCase のバレル export 追加                                                                                        |
| `packages/application/tests/product/product-use-cases.test.ts`                | `InMemoryProductRepository`/`InMemoryStoreRepository` へのカウンタ追加、`GetProductDetailUseCase` の新規 `describe` 追加 |
| `apps/web/src/app/products/[id]/page.tsx`                                     | `GetProductUseCase` + `GetCheapestStoreUseCase` の 2 回呼び出しを `GetProductDetailUseCase` の 1 回呼び出しへ差し替え    |
| `apps/web/src/app/products/[id]/_components/product-detail-client.tsx`        | `PriceHistoryChart` の静的 import を `next/dynamic` 化                                                                   |
| `apps/web/tests/app/products/[id]/_components/product-detail-client.test.tsx` | PDC-13〜15 を追記                                                                                                        |

## 新規作成ファイル

| ファイル                                                                      | 役割                                                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/application/src/product/get-product-detail.use-case.ts`             | `GetProductDetailUseCase`。`findById` 1 回 + `findAll` 1 回で `{ product, cheapestStore }` を返す            |
| `apps/web/src/app/products/[id]/_components/price-history-chart-skeleton.tsx` | `PriceHistoryChartSkeleton`。recharts 非依存の固定高さプレースホルダ（`next/dynamic` の `loading` から使う） |

変更しないファイル（設計書 §対象外の再掲。実装時に誤って触らないこと）:
`packages/application/src/product/get-product.use-case.ts`、
`packages/application/src/product/get-cheapest-store.use-case.ts`、
`apps/web/src/app/products/[id]/edit/page.tsx`、
`apps/web/src/app/products/[id]/_components/price-history-chart.tsx`、
`apps/web/src/components/ui/chart.tsx`、
`apps/web/src/server/routes/products.ts`、Domain 層、DB スキーマ、`packages/api-contract`。

---

## Step 1: `GetProductDetailUseCase` 新設（Application 層）

対象試験 ID: `GPD-01`〜`GPD-06`

### Red

先に失敗するテストを書く。

- 対象ファイル: `packages/application/tests/product/product-use-cases.test.ts`
- 変更内容:
  1. `InMemoryProductRepository` に `public findByIdCallCount = 0;` を追加し、`findById()` の
     冒頭でインクリメントする（既存の `saveCount` と同じパターン）。
  2. `InMemoryStoreRepository` に `public findAllCallCount = 0;` `public findByIdCallCount = 0;`
     を追加し、それぞれ `findAll()` / `findById()` の冒頭でインクリメントする。
  3. ファイル冒頭の import に
     `import { GetProductDetailUseCase } from '../../src/product/get-product-detail.use-case';`
     を追加する（この時点では対象ファイルが存在しないため、後述の Green まではモジュール解決エラーで
     テストスイート全体がコンパイル/実行に失敗する — これも「Red」の一形態として扱う）。
  4. 既存の `describe('GetCheapestStoreUseCase')` の直後に
     `describe('GetProductDetailUseCase')` を新設し、試験計画の GPD-01〜06 をそのまま実装する。
     fixture は試験計画 §試験データのとおり既存 `describe('GetCheapestStoreUseCase')` の
     「複数店舗の最新単価から最安店舗を返す」テストと同一のものを流用する
     （店舗 `store-a`（西友）・`store-b`（ライフ）、商品 `product-1`、価格記録
     `store-a-old`/`store-a-new`/`store-b-new`。最安は `store-b`）。
     - GPD-01: `productRepository.findByIdCallCount === 1`・`storeRepository.findAllCallCount === 1`・
       `storeRepository.findByIdCallCount === 0` を assert。
     - GPD-02: `result.product` が同一 fixture の `GetProductUseCase.execute()` 戻り値と `toEqual`。
     - GPD-03: `result.cheapestStore` が同一 fixture の `GetCheapestStoreUseCase.execute()` 戻り値と
       `toEqual`。
     - GPD-04: 価格記録 0 件の商品を seed → `cheapestStore === null`・
       `storeRepository.findAllCallCount === 1`。
     - GPD-05: 価格記録の参照先店舗を `storeRepository` に seed しない商品を seed →
       `cheapestStore.storeName === ''` かつ `result.product.priceHistory[0].storeName === ''`
       （既存の「最安店舗 ID に対応する Store が無くても storeName を空文字で返す」fixture を流用）。
     - GPD-06: 商品を seed せず `storeRepository` にのみ店舗 1 件を seed → `execute('missing')` が
       `ProductNotFoundError` を投げ、`storeRepository.findAllCallCount === 0`・
       `storeRepository.findByIdCallCount === 0`。
- 完了条件: `pnpm --filter @cookpit/application test` を実行し、
  `get-product-detail.use-case` が見つからずテストスイートが失敗することを確認する
  （TypeScript のモジュール解決エラー、または `vitest` の collect エラーとして現れる）。

### Green

失敗したテストを通す最小実装。

- 対象ファイル: `packages/application/src/product/product.dto.ts`
  - 変更内容: `ProductDetailResultDto` を追加する。

    ```typescript
    export interface ProductDetailResultDto {
      product: ProductDto;
      cheapestStore: CheapestStoreResultDto | null;
    }
    ```

  - 完了条件: `pnpm --filter @cookpit/application type-check` が通る。

- 対象ファイル: `packages/application/src/product/get-product-detail.use-case.ts`（新規）
  - 変更内容: 設計書 §変更後構成 A（案1）の実装をそのまま置く。

    ```typescript
    import { ProductId } from '@cookpit/domain';
    import type { Product, ProductRepository, StoreId, StoreRepository } from '@cookpit/domain';
    import type { CheapestStoreResultDto, ProductDetailResultDto } from './product.dto';
    import { ProductNotFoundError } from './product-not-found.error';
    import { toProductDto, toStoreNameMap, type StoreNameMap } from './product.mapper';

    /**
     * 商品詳細画面（`/products/[id]`）が必要とするデータを 1 回の呼び出しで取得する。
     * `productRepository.findById()` 1 回 + `storeRepository.findAll()` 1 回のみ発行し、
     * `storeRepository.findById()` は呼ばない（店舗名は `findAll()` の結果から解決する）。
     * @throws {ProductNotFoundError} `id` に対応する商品が存在しない場合。
     */
    export class GetProductDetailUseCase {
      constructor(
        private readonly productRepository: ProductRepository,
        private readonly storeRepository: StoreRepository,
      ) {}

      async execute(id: string): Promise<ProductDetailResultDto> {
        const productId = ProductId.fromString(id);
        const product = await this.productRepository.findById(productId);
        if (product === null) {
          throw new ProductNotFoundError(productId.value);
        }

        const stores = await this.storeRepository.findAll();
        const storeMap = toStoreNameMap(stores);
        const productDto = toProductDto(product, storeMap);

        const cheapestStoreId = product.cheapestStoreAt(new Date());
        const cheapestStore =
          cheapestStoreId === null
            ? null
            : this.toCheapestStoreResult(product, cheapestStoreId, storeMap);

        return { product: productDto, cheapestStore };
      }

      private toCheapestStoreResult(
        product: Product,
        cheapestStoreId: StoreId,
        storeMap: StoreNameMap,
      ): CheapestStoreResultDto | null {
        const latestPriceRecord = product.latestPriceRecordAt(cheapestStoreId);
        if (latestPriceRecord === null) {
          return null;
        }
        return {
          storeId: cheapestStoreId.value,
          storeName: storeMap.get(cheapestStoreId.value) ?? '',
          latestPrice: latestPriceRecord.price.amount,
          unitPrice: latestPriceRecord.unitPrice.amount,
          packageSizeUnit: latestPriceRecord.packageSize.unit,
        };
      }
    }
    ```

  - 完了条件: 型エラーなし。`ProductRepository` / `StoreRepository` / `Product` / `StoreId` は
    `@cookpit/domain` バレルから import する（ADR-0010）。

- 対象ファイル: `packages/application/src/product/index.ts`
  - 変更内容: `export * from './get-cheapest-store.use-case';` の直後に
    `export * from './get-product-detail.use-case';` を追加する。
  - 完了条件: `apps/web` から `GetProductDetailUseCase` / `ProductDetailResultDto` を
    `@cookpit/application` の named import で解決できる（Step 2 で使用する際に確認）。
    **この export 追加漏れは page.tsx の import エラーとして即座に顕在化するため、
    Step 2 着手前に単独で確認する。**

- 完了条件（Step 1 全体）:
  - `GPD-01`〜`GPD-06` が全て pass する。
  - 同ファイル内の既存 `describe('CreateProductUseCase')` `describe('GetProductsUseCase')`
    `describe('GetProductUseCase')` `describe('UpdateProductUseCase')` `describe('DeleteProductUseCase')`
    `describe('RecordPriceUseCase')` `describe('UpdatePriceRecordUseCase')`
    `describe('GetCheapestStoreUseCase')` `describe('DeletePriceRecordUseCase')` が
    カウンタ追加の影響を受けず無修正のまま全件 pass する
    （カウンタはインクリメントのみで戻り値・副作用を変えないため回帰しない想定）。
  - `pnpm --filter @cookpit/application lint` / `type-check` / `test` が通る。

---

## Step 2: `page.tsx` を新 UseCase 1 回呼び出しへ差し替え（Presentation 層）

対象試験 ID: 専用の自動試験 ID なし（`page.tsx` は async Server Component のため試験計画上
RTL 対象外）。`pnpm type-check` と、Step 4 の手動確認 `MB-01`〜`MB-04` で検証する。

### Red

- このステップには専用の失敗テストが無い（試験計画「メソッド網羅チェック表」の
  `ProductDetailPage` 行に明記済み: 「RTL 対象外。`pnpm type-check` + MB-01〜04 で確認」）。
- 代わりに **変更前の状態を完了条件の基準として記録する**: Step 1 完了時点で
  `page.tsx` はまだ `GetProductUseCase` + `GetCheapestStoreUseCase` の 2 回呼び出しのままであり、
  `pnpm --filter web type-check` は通る（旧実装のまま矛盾がないことの確認）。
- 完了条件: 上記の型チェックが通る状態を Step 2 の開始点として確認する。

### Green

- 対象ファイル: `apps/web/src/app/products/[id]/page.tsx`
  - 変更内容: `GetProductUseCase` + `GetCheapestStoreUseCase` の 2 回呼び出しを
    `GetProductDetailUseCase` の 1 回呼び出しに差し替える。

    ```typescript
    import {
      GetProductDetailUseCase,
      ProductNotFoundError,
      type ProductDetailResultDto,
    } from '@cookpit/application';
    import { productRepository, storeRepository } from '@/server/repositories';
    import { notFound } from 'next/navigation';
    import { ProductDetailClient } from './_components/product-detail-client';

    export const dynamic = 'force-dynamic';

    interface Props {
      params: Promise<{ id: string }>;
    }

    export default async function ProductDetailPage({ params }: Props) {
      const { id } = await params;
      let result: ProductDetailResultDto;
      try {
        const getProductDetail = new GetProductDetailUseCase(productRepository(), storeRepository());
        result = await getProductDetail.execute(id);
      } catch (error) {
        if (error instanceof ProductNotFoundError) {
          notFound();
        }
        throw error;
      }

      return <ProductDetailClient product={result.product} cheapestStore={result.cheapestStore} />;
    }
    ```

  - `ProductDetailClient` の Props（`product: ProductDto`・`cheapestStore: CheapestStoreResultDto | null`）
    は変更しない（`result.product` / `result.cheapestStore` をそのまま渡せる）。
  - `ProductNotFoundError` → `notFound()` の既存フローは変更しない。

- 完了条件:
  - `pnpm --filter web type-check` が通る（`GetProductUseCase` / `GetCheapestStoreUseCase` への
    参照が `page.tsx` から消えていることを diff で確認する）。
  - `apps/web/src/app/products/[id]/edit/page.tsx` は無変更のまま
    （引き続き `GetProductUseCase` を使用。import 整理で誤って巻き込んでいないことを diff で確認する）。
  - `apps/web/tests/server/routes/products.test.ts`（`GetProductUseCase` を使う
    `GET /api/products/:id` 等の既存 `WH-P-01`〜`WH-P-15`）が無修正のまま全件 pass する
    （このルートは `page.tsx` と別経路で `GetProductUseCase` を使い続けるため無関係だが、
    回帰確認として実行する）。

---

## Step 3: recharts の遅延読み込み（Presentation 層。Step 1・2 と独立）

対象試験 ID: `PDC-13`〜`PDC-15`

### Red

- 対象ファイル: `apps/web/tests/app/products/[id]/_components/product-detail-client.test.tsx`
- 変更内容: 既存 `PDC-01`〜`PDC-12` の末尾（`describe` ブロック内の最後）に、試験計画のとおり
  `PDC-13`・`PDC-14`・`PDC-15` を追記する。`next/dynamic` を `vi.mock` しないこと
  （試験計画の明示指示。動的 import のパス指定ミスを検出できなくなるため）。

  ```typescript
  it('PDC-13: 遅延読み込みされたチャートが最終的に描画される', async () => {
    const { container } = render(
      <ProductDetailClient product={createProductDto([createPriceRecord()])} cheapestStore={CHEAPEST_STORE} />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-slot="chart"]')).not.toBeNull();
    });
  });

  it('PDC-14: 価格記録 0 件でも遅延読み込み後に空状態文言が描画される', async () => {
    renderDetail([]);

    expect(await screen.findByText('価格記録がありません')).toBeDefined();
  });

  it('PDC-15: チャート以外の既存表示は next/dynamic 化後も無修正で pass する', () => {
    // PDC-01・PDC-02・PDC-08 を参照。壊れた場合のみここを更新する。
  });
  ```

  （`PDC-15` は新規アサーションを持たず、既存 `PDC-01`/`PDC-02`/`PDC-08` が
  同ファイル内で引き続き pass することの確認を指す。試験計画の記述どおり実体は追加しない
  か、コメントのみのプレースホルダとして残す。実装者の判断で `it.todo` 等の明示形にしてよい。）

- **Red の性質に関する注記（重要）**: `PDC-13`・`PDC-14` は「最終的にどう描画されるか」という
  等価性アサーションであり、変更前の静的 import 実装でも `PriceHistoryChart` は同期的に
  最終状態を描画するため、**この Red 実行時点で既に PASS する**（試験計画が意図的に
  「render 直後はスケルトン」という中間状態依存のアサーションを避けているため——モジュール
  キャッシュにより中間状態が不安定になる、と試験計画に明記済み）。
  したがって Step 3 の「Red」は他ステップと異なり **失敗ではなく「変更前から意味的に
  成立していることの記録」**になる。これらのテストの本来の役割は、Green 実装（`next/dynamic`
  化）が誤ったパス指定やスケルトン分離漏れをした場合に落ちる**回帰ガード**である
  （設計書 §リスク「フォールバックコンポーネントを誤って `price-history-chart.tsx` から
  import すると遅延化の効果が消える」に対応）。
- 完了条件: `pnpm --filter web test` を実行し、`PDC-13`・`PDC-14` が変更前コードに対して
  PASS することを確認・記録する（Green 実装後も同じ 2 件が pass し続けることが本当の完了条件）。

- **【Orchestrator 追記】Step 3 の真の Red は RTL ではなくバンドル計測側にある。**
  「recharts を初期バンドルから外す」という要件は**ビルド時の性質**であり、DOM の最終状態を
  見る RTL では原理的に検証できない。したがって Step 3 の Red / Green は次で成立している。

  |                             | 状態                                                                                       | 実測値                                                                                                                                                                                                |
  | --------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | **Red（変更前・実測済み）** | recharts が `/products/[id]` の初期ロード対象チャンクに含まれる                            | `.next/static/chunks/6383-0fb8ea77dabd0644.js` = **374 KB**。参照する client-reference-manifest は `/products/[id]` と `/products/[id]/edit` の 2 ページ（コミット `6f39be3` で Orchestrator が計測） |
  | **Green（変更後・要計測）** | recharts が独立したオンデマンドチャンクへ分離され、`/products/[id]` の初期ロードから外れる | Step 4 の `BLD-01`〜`03` で実測して記録する                                                                                                                                                           |

  この Red はすでに取得済みなので、Step 3 では**改めて Red を取り直す必要はない**。
  RTL 側（`PDC-13`/`PDC-14`）は上記のとおり回帰ガードとして扱い、
  **「Red が失敗しなかったこと」を欠陥ではなく仕様として記録する**。
  ただし Step 4 の `BLD` 計測を省略すると **B の改善を一切検証していないことになる**ため、
  Step 4 は Step 3 と不可分の完了条件として扱うこと（Step 3 単独では完了としない）。

### Green

- 対象ファイル: `apps/web/src/app/products/[id]/_components/price-history-chart-skeleton.tsx`（新規）
  - 変更内容: recharts に依存しない固定高さのプレースホルダ。既存 `ChartContainer` の
    `className="h-64 w-full aspect-auto rounded-xl bg-card p-2"`（`price-history-chart.tsx:105`）
    と高さを揃える（CLS 回避。設計書 §変更後構成 B）。

    ```typescript
    export function PriceHistoryChartSkeleton() {
      return (
        <div
          className="h-64 w-full animate-pulse rounded-xl bg-card"
          aria-hidden="true"
        />
      );
    }
    ```

  - 完了条件: このファイルが recharts・`@/components/ui/chart` のいずれも import していない
    （`grep -n "recharts\|components/ui/chart" apps/web/src/app/products/[id]/_components/price-history-chart-skeleton.tsx`
    が no-match になること）。

- 対象ファイル: `apps/web/src/app/products/[id]/_components/product-detail-client.tsx`
  - 変更内容: `PriceHistoryChart` の静的 import を `next/dynamic` に差し替える。

    ```typescript
    import dynamic from 'next/dynamic';
    import { PriceHistoryChartSkeleton } from '@/app/products/[id]/_components/price-history-chart-skeleton';

    const PriceHistoryChart = dynamic(
      () =>
        import('@/app/products/[id]/_components/price-history-chart').then(
          (mod) => mod.PriceHistoryChart,
        ),
      {
        ssr: false,
        loading: () => <PriceHistoryChartSkeleton />,
      },
    );
    ```

    既存の `import { PriceHistoryChart } from '@/app/products/[id]/_components/price-history-chart';`
    （1 行目付近）を削除し、上記に差し替える。呼び出し側（`<PriceHistoryChart priceHistory={product.priceHistory} />`、
    182〜185 行目付近）は変更しない。

  - 完了条件:
    - `pnpm --filter web type-check` が通る。
    - `PDC-13`・`PDC-14` が引き続き pass する（実装ミス時に落ちる回帰ガードとしての役割を確認）。
    - `PDC-01`〜`PDC-12`（既存）が無修正のまま全件 pass する（`PDC-15` の確認対象）。
    - `price-history-chart.tsx` 自体は無変更（設計書 §対象範囲どおり）。

- 完了条件（Step 3 全体）:
  - `PDC-13`〜`PDC-15` が全て pass する。
  - `apps/web/tests/app/products/[id]/_components/product-detail-client.test.tsx` 全体が
    無修正の既存ケースも含め全件 pass する。
  - `pnpm --filter web lint` / `type-check` / `test` が通る。

---

## Step 4: バンドル計測（`BLD-01`〜`03`）と実画面確認（`MB-01`〜`04`）

Step 1〜3 完了後、最後にまとめて実施する（設計書 §テスト方針・試験計画の指示どおり
「推定値ではなく実測値」で記録する）。

### 手順

1. `pnpm build` を実行する。
2. チャンク計測（試験計画のコマンドをそのまま使う）。

   ```bash
   grep -rl "recharts" apps/web/.next/static/chunks/ | while read f; do
     printf "%s  %s KB\n" "$f" "$(( $(stat -c %s "$f") / 1024 ))"; done
   ```

3. 見つかったチャンクファイル名を使い、参照元を確認する。

   ```bash
   grep -rl "<chunk-name>" apps/web/.next --include=*.js | grep client-reference-manifest
   ```

4. 結果を記録する（ベースライン: コミット `6f39be3` で `6383-0fb8ea77dabd0644.js` が 374 KB、
   `/products/[id]` と `/products/[id]/edit` の 2 ページから参照。設計書・試験計画に実測値あり）。

### 完了条件（`BLD-01`〜`03`）

| ID       | 完了条件                                                                                                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLD-01` | recharts を含むチャンクが `app/products/[id]/page-*.js`（ページ本体チャンク）と別ファイルとして出力される                                                                              |
| `BLD-02` | そのチャンクを参照する client-reference-manifest から `/products/[id]` が外れる。参照が残る場合は BLOCKED とし、`MB-02`（実ブラウザの Network タブ確認）を代替エビデンスとして併記する |
| `BLD-03` | 「374 KB が初期ロードチャンク集合から外れた」ことを実測 KB 値で記録する（推定値は不可）                                                                                                |

### 完了条件（`MB-01`〜`04`。手動）

`docs/tests/product-detail-performance.md` §手動試験の PASS 基準をそのまま適用する。
`dev:pglite` に店舗2件・価格記録3件以上（最安店舗が入れ替わる価格差を含む）を持つ商品を
シードしてから確認する。

| ID      | 確認内容                                                                                                                       | 判定        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| `MB-01` | スケルトン→チャート切り替わり時に「価格推移」セクションの高さが変わらない（CLS なし）                                          | PASS / FAIL |
| `MB-02` | recharts チャンクが初期ロードの Network リクエストに含まれず、チャート表示直前に取得される（`BLD-02` が BLOCKED の場合は必須） | PASS / FAIL |
| `MB-03` | 最安店舗欄・価格推移グラフの内容が変更前と同じ（機能等価性）                                                                   | PASS / FAIL |
| `MB-04` | `ssr: false` によるちらつきの許容可否（PASS/FAIL ではなく所見を記録）                                                          | 所見        |

---

## 依存関係

```
Step 1（Application: GetProductDetailUseCase + テストヘルパー）
  └─ Step 2（Presentation: page.tsx）… Step 1 の export（index.ts）に依存

Step 3（Presentation: recharts 遅延化）… Step 1・2 と独立。並行着手可

Step 1・2・3 すべて完了
  └─ Step 4（バンドル計測 + 手動確認）
```

- Step 2 は Step 1 の `packages/application/src/product/index.ts` へのバレル export 追加が
  完了していないと `apps/web` から `GetProductDetailUseCase` を import できない
  （ビルドエラーで即座に検知できる）。
- Step 3 は Step 1・2 のコード変更を一切参照しないため、どちらを先に着手してもよい。
  本計画の記載順は層の外形（Application → Presentation）を優先しただけで、実施順の制約ではない。
- Step 4 はビルド成果物（`pnpm build`）と実画面を使うため、Step 1〜3 のコード変更が
  すべて反映された状態で実施する。

## テスト計画

| 追加/変更するテスト                                                                                                           | 配置先                                                                        | 試験 ID    |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------- |
| `GetProductDetailUseCase` の `describe` ブロック新設 + `InMemoryProductRepository`/`InMemoryStoreRepository` へのカウンタ追加 | `packages/application/tests/product/product-use-cases.test.ts`                | GPD-01〜06 |
| `ProductDetailClient` への追記（`next/dynamic` 化への追随）                                                                   | `apps/web/tests/app/products/[id]/_components/product-detail-client.test.tsx` | PDC-13〜15 |
| ビルド計測スクリプト実行（自動化されたテストファイルではなく手順）                                                            | 本計画 Step 4                                                                 | BLD-01〜03 |
| 手動確認                                                                                                                      | `dev:pglite` シード + ブラウザ確認                                            | MB-01〜04  |

新規テストファイルは作成しない（既存ファイルへの追記のみ）。vitest の `include` パターンと
整合済み（`packages/application` は `tests/**/*.test.ts`、`apps/web` は
`tests/**/*.test.tsx`（happy-dom project）に一致）。

回帰確認対象（無変更のまま全件 pass させる）:

- `packages/application/tests/product/product-use-cases.test.ts` 全体
  （`GetProductUseCase`・`GetCheapestStoreUseCase` を含む既存 `describe` すべて）
- `packages/application/tests/product/product.mapper.test.ts`
- `apps/web/tests/app/products/[id]/_components/product-detail-client.test.tsx`（`PDC-01`〜`12`）
- `apps/web/tests/server/routes/products.test.ts`（`WH-P-01`〜`WH-P-15`）
- `apps/web/src/app/products/[id]/edit/page.tsx`（テストなし。`pnpm type-check` + 目視で
  `GetProductUseCase` 使用が変わっていないことを確認）

## リスク

| リスク                                                                                              | 発生し得る箇所  | 検知手段                                                                                                  | 対応                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx` の書き換え漏れで旧 2 UseCase 呼び出しが残存し、クエリ削減効果が出ない                    | Step 2          | `GPD-01`（Application 層で回帰ガード済み）+ `page.tsx` の diff レビュー                                   | `page.tsx` から `GetProductUseCase`/`GetCheapestStoreUseCase` の import が消えていることをレビューで確認する                                          |
| `index.ts` へのバレル export 追加漏れ                                                               | Step 1→2 の境界 | `apps/web` の `type-check`/ビルドが即座に失敗する                                                         | Step 2 着手前に単独で `packages/application` の型チェックを通し、`GetProductDetailUseCase` が `@cookpit/application` から import できることを確認する |
| フォールバックコンポーネントを誤って `price-history-chart.tsx` から import し、遅延化の効果が消える | Step 3          | `BLD-01`（チャンク分離確認）+ `price-history-chart-skeleton.tsx` が recharts 非依存であることの grep 確認 | Step 3 Green の完了条件に grep チェックを明記済み                                                                                                     |
| `next/dynamic` の import パス指定ミスで永久にスケルトンのまま                                       | Step 3          | `PDC-13`・`PDC-14`（`waitFor`/`findBy*` がタイムアウトする）                                              | テスト失敗時は `import()` のパス文字列を再確認する                                                                                                    |
| `ssr: false` によるちらつきが体感上許容できない                                                     | Step 4（手動）  | `MB-04` の所見                                                                                            | 許容できなければ設計書 §未決事項3のとおり Orchestrator へ差し戻し、`ssr: true` への変更要否を判断する（本計画のスコープ外）                           |

## ロールバック方法

A（クエリ削減）と B（recharts 遅延化）は独立した変更のため、個別にロールバックできる。

- **A（Step 1・2）のロールバック**:
  1. `apps/web/src/app/products/[id]/page.tsx` を `GetProductUseCase` + `GetCheapestStoreUseCase`
     の 2 回呼び出しへ戻す（Step 2 Green のコード差分を revert）。
  2. `packages/application/src/product/get-product-detail.use-case.ts` を削除し、
     `packages/application/src/product/index.ts` の export 行を削除する。
  3. `packages/application/src/product/product.dto.ts` から `ProductDetailResultDto` を削除する。
  4. `packages/application/tests/product/product-use-cases.test.ts` の
     `describe('GetProductDetailUseCase')` とカウンタ追加を削除する（カウンタ自体は
     `GetProductUseCase`/`GetCheapestStoreUseCase` の既存テストには影響しないため、
     残しても害はないが対称性のため削除する）。
  - Step 2 のみを個別に戻す場合（新 UseCase は残し呼び出し元だけ戻す）も上記 1. のみで可能。
- **B（Step 3）のロールバック**:
  1. `apps/web/src/app/products/[id]/_components/product-detail-client.tsx` の `next/dynamic` 化を
     静的 import（`import { PriceHistoryChart } from '@/app/products/[id]/_components/price-history-chart';`）
     へ戻す。
  2. `apps/web/src/app/products/[id]/_components/price-history-chart-skeleton.tsx` を削除する。
  3. `apps/web/tests/app/products/[id]/_components/product-detail-client.test.tsx` から
     `PDC-13`〜`15` を削除する。
- A・B ともデータ移行・マイグレーションを伴わないため、コードの revert のみで完全に戻せる
  （設計書 §移行とリリース）。

## ドキュメント更新対象

- `docs/05-roadmap.md` Sprint 7 タスク4の完了報告（Sprint 7 の最後の 1 件。クローズ処理は
  Orchestrator が実施）。
- ドメインモデル変更なし（Domain 層に変更なし）のため `docs/04-domain-model.md` の更新は不要。
- `docs/designs/product-detail-performance.md` §未決事項の 1〜3 は本タスクのスコープ外のまま
  Orchestrator へ引き継ぐ（`GET /api/products/:id/cheapest-store` 等の扱い、`ssr: false` の
  ちらつき許容可否）。実装計画上のアクションは無い。

## 完了条件（本計画全体）

- `GPD-01`〜`GPD-06`・`PDC-13`〜`PDC-15` がすべて実装され pass する。
- 既存 `product-use-cases.test.ts`（`GetProductUseCase`・`GetCheapestStoreUseCase` を含む全体）・
  `product-detail-client.test.tsx`（`PDC-01`〜`12`）・`products.test.ts`（`WH-P-01`〜`15`）・
  `product.mapper.test.ts` が無修正または軽微な追随のみで全件 pass する。
- `pnpm lint` / `pnpm type-check` / `pnpm test` が通る。
- `BLD-01`〜`03` の実測結果（チャンクファイル名・サイズ・manifest 参照有無）が記録され、
  374 KB が初期ロードチャンク集合から外れたことが実測値で示されている
  （BLOCKED の場合は理由と代替エビデンスが明記されている）。
- `MB-01`〜`04` の全項目に PASS / BLOCKED（理由） / FAIL のいずれかが付いている。
- スコープ外の変更（`GetProductUseCase`/`GetCheapestStoreUseCase` のロジック変更、
  `GET /api/products/:id/cheapest-store` の削除、Domain 層・DB スキーマ・api-contract の変更、
  `price-history-chart.tsx`/`components/ui/chart.tsx` の変更）が含まれていない。
