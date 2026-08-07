# 設計書: product-detail-performance

- ステータス: **確定（実装・レビュー・実画面確認まで完了。2026-08-07）**
- レベル: L2
- 関連: `docs/05-roadmap.md` Sprint 7 タスク4（要件定義書・ADR なし）

## 背景

`docs/05-roadmap.md` Sprint 7 タスク4「商品詳細の DB 往復削減 + recharts 遅延読み込み」。
2026-07-27 の積み残しで、**Sprint 7 の最後の 1 件**。これが片付くと Sprint 7 が締まる。

商品詳細ページ（`apps/web/src/app/products/[id]/page.tsx`）には次の 2 つの性能課題がある。

### 課題A: DB クエリが 4 本走る（うち 1 本は完全な重複）

`page.tsx` は `dynamic = 'force-dynamic'`（毎回サーバーで実行）で、2 つの UseCase を順に呼ぶ。

| #   | 呼び出し                                                             | クエリ                                       |
| --- | -------------------------------------------------------------------- | -------------------------------------------- |
| 1   | `GetProductUseCase.execute()` → `productRepository.findById()`       | `products ⟕ price_records`（LEFT JOIN 1 本） |
| 2   | 同上 → `storeRepository.findAll()`                                   | `stores` 全件                                |
| 3   | `GetCheapestStoreUseCase.execute()` → `productRepository.findById()` | **# 1 と同じ商品を再取得（完全な重複）**     |
| 4   | 同上 → `storeRepository.findById()`                                  | `stores` 1 件（# 2 の結果に含まれている）    |

`GetCheapestStoreUseCase` が実際に使っているのは `Product.cheapestStoreAt()` /
`Product.latestPriceRecordAt()`（`packages/domain/src/product/product.ts:226-244`。
どちらも既にロード済みの `priceHistory` に対する純粋な計算）と、店舗名解決だけである。
`# 1` の `findById()` の結果と `# 2` の `findAll()` の結果があれば `# 3` `# 4` は不要。

### 課題B: recharts が静的 import で初期バンドルに乗る

- `apps/web/src/app/products/[id]/_components/price-history-chart.tsx:17` が recharts から
  `CartesianGrid, Line, LineChart, XAxis, YAxis` を静的 import。
- `apps/web/src/components/ui/chart.tsx:4` が `import * as RechartsPrimitive from 'recharts'`
  で recharts 全体を静的 import（`ChartContainer` / `ChartTooltip` 等の実装に使用）。
- `PriceHistoryChart` の利用箇所は `product-detail-client.tsx:184` の 1 か所のみ、
  `components/ui/chart.tsx` の利用箇所も `price-history-chart.tsx` の 1 か所のみ（grep 確認済み）。

### 付随して分かったこと（今回のスコープ外・申し送り）

`GET /api/products/:id/cheapest-store`（`apps/web/src/server/routes/products.ts:94-99`）は
フロントエンドから一度も呼ばれていない（`client.api.products` 配下の呼び出し箇所を grep したが
`cheapest-store` への `$get` は存在しない）。`GetCheapestStoreUseCase` を消費しているのは
このルートと `page.tsx` の Server Component 経路のみ。加えて調査中、`GET /api/products/:id`
ルート自体（`GetProductUseCase` を使う `.get('/:id')`）もフロントエンドから
`client.api.products[':id'].$get()` の形で呼ばれている箇所が見つからなかった
（PUT/DELETE/POST は使われているが GET は無い）。どちらもエンドポイントの削除は
**今回のスコープ外**。§未決事項に記録する。

## 目的

1. 商品詳細ページ初期表示の DB クエリを 4 本から 2 本へ削減する（うち 1 本は完全な重複排除）。
2. `recharts` を商品詳細ページの初期 JS バンドルから外し、初回表示の First Load JS を削減する。
3. 上記 2 点の効果を、リモート環境で機械的に確認できる手段を用意する。

## 要件

- R-1: `/products/[id]` の初期表示（Server Component 経路）で発行される DB クエリを
  4 本から 2 本に削減する。
- R-2: `GET /api/products/:id/cheapest-store` の挙動・レスポンス形は変更しない
  （公開 API の後方互換性を維持する）。
- R-3: `recharts` を `/products/[id]` の初期チャンクから外し、`PriceHistoryChart` 表示が
  必要になった時点でのみ読み込む。
- R-4: 遅延読み込み中もレイアウトシフト（CLS）が発生しない。
- R-5: Domain 層・DB スキーマ・api-contract は変更しない。
- R-6: クエリ数削減・バンドルサイズ削減の両方を、テスト／チャンクファイル計測という機械的な手段で
  検証できる状態にする。

## 対象範囲

- Application 層（`packages/application/src/product/`）: 新規 `GetProductDetailUseCase` の追加、
  `ProductDetailResultDto` の追加、`packages/application/src/product/index.ts` のバレル export 追加。
- Presentation 層（`apps/web`）:
  - `apps/web/src/app/products/[id]/page.tsx`（UseCase 呼び出しの差し替え）
  - `apps/web/src/app/products/[id]/_components/product-detail-client.tsx`
    （`PriceHistoryChart` の `next/dynamic` 化 + フォールバックコンポーネント新設）
- テスト:
  - `packages/application/tests/product/`（新規 UseCase のクエリ回数アサーション）
  - `apps/web/tests/app/products/[id]/_components/product-detail-client.test.tsx`
    （非同期化への追随）

## 対象外

- `GetProductUseCase` / `GetCheapestStoreUseCase` 自体の削除・シグネチャ変更
  （他の呼び出し元があるため維持。詳細は §変更後構成）。
- `GET /api/products/:id/cheapest-store`・`GET /api/products/:id` の削除
  （未使用の疑いがあると判明したが、これは調査の副産物であり本タスクの目的ではない。
  §未決事項へ申し送る）。
- recharts 自体の差し替え・より軽量なチャートライブラリの検討。
- フォント削減（Sprint 9 タスク4）・Vercel Function リージョン変更（Sprint 9 タスク2）。
  性能課題としては関連するが、roadmap 上は別タスクとして切られている。
- `@next/bundle-analyzer` 等の新規ツール導入（既存の `next build` 出力の比較で足りると判断）。
- Domain 層・DB スキーマ・api-contract の変更。

## 現状構成

### DB クエリ（課題A）

```
apps/web/src/app/products/[id]/page.tsx
  ├─ GetProductUseCase.execute(id)
  │    ├─ productRepository.findById(id)   … products ⟕ price_records
  │    └─ storeRepository.findAll()        … stores 全件
  └─ GetCheapestStoreUseCase.execute(id)
       ├─ productRepository.findById(id)   … ※ 上と同じ商品を再取得（重複）
       ├─ product.cheapestStoreAt(now)     … ドメインの純粋計算（クエリなし）
       ├─ product.latestPriceRecordAt(id)  … ドメインの純粋計算（クエリなし）
       └─ storeRepository.findById(id)     … ※ findAll() の結果に含まれる店舗を再取得
```

- `GetProductUseCase`（`packages/application/src/product/get-product.use-case.ts`）は
  `apps/web/src/app/products/[id]/page.tsx` と `apps/web/src/app/products/[id]/edit/page.tsx`
  の両方から使われている。編集画面は最安店舗の情報を必要としない。
- `GetCheapestStoreUseCase`（`packages/application/src/product/get-cheapest-store.use-case.ts`）は
  `page.tsx` と `GET /api/products/:id/cheapest-store` ルートの両方から使われている。

### recharts の static import（課題B）

```
product-detail-client.tsx ('use client')
  └─ 静的 import: price-history-chart.tsx
       ├─ 静的 import: recharts（CartesianGrid, Line, LineChart, XAxis, YAxis）
       └─ 静的 import: components/ui/chart.tsx
            └─ 静的 import: recharts（* as RechartsPrimitive、全体）
```

## 変更後構成

### A: クエリ削減 — 新規 `GetProductDetailUseCase`（採用案）

比較検討した 3 案とトレードオフは次のとおり。

#### 案1（採用）: 新規 `GetProductDetailUseCase` を作り `{ product, cheapestStore }` を 1 回で返す

```typescript
// packages/application/src/product/product.dto.ts に追加
export interface ProductDetailResultDto {
  product: ProductDto;
  cheapestStore: CheapestStoreResultDto | null;
}

// packages/application/src/product/get-product-detail.use-case.ts（新規）
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

ポイント:

- `productRepository.findById()` は 1 回のみ。`storeRepository` は `findAll()` の 1 回のみ
  （`findById()` は使わない — 最安店舗の店舗名は `findAll()` で得た `storeMap` から解決する）。
  → **DB 往復は 4 本 → 2 本**（`products` の JOIN クエリ 1 本 + `stores` 全件 1 本）。
- `toProductDto` / `toStoreNameMap`（`packages/application/src/product/product.mapper.ts`）を
  そのまま再利用する。バレル（`product/index.ts`）で既に公開済みのため import 経路の追加は不要。
- `apps/web/src/app/products/[id]/page.tsx` はこの 1 UseCase だけを呼ぶ形に差し替える。
  `try/catch` で `ProductNotFoundError` を `notFound()` にする既存の流れは変わらない。

**「1 ユースケース = 1 クラス」との整合性**: 「商品詳細画面を表示する」は、対象アプリの
1 画面（`/products/[id]`）に対応する 1 つの読み取りユースケースとして扱える。
Sprint 4 で `GetShoppingListUseCase` を「画面 1 枚が必要とするデータの取得」という単位で
追加した前例（S-7）と同じ考え方であり、既存の粒度方針から逸脱しない。
`GetProductUseCase`（商品単体の取得。編集画面が必要とする）と
`GetCheapestStoreUseCase`（最安店舗のみの取得。公開 API が必要とする）は、
それぞれ別の目的を持つ既存の呼び出し元がいるため**どちらも残す**（削除しない）。

#### 案2（却下）: `GetProductUseCase` の戻り値に `cheapestStore` を含める

`GetProductUseCase` は既に `product` と `stores`（`findAll()`）を持っているため、
`cheapestStoreAt()` の計算に**追加の DB クエリは不要**（案1と同じ 2 クエリで済む）。
その意味では「タダ」に見えるが、次の理由で却下する。

- `GetProductUseCase` の呼び出し元は `page.tsx` だけでなく
  `apps/web/src/app/products/[id]/edit/page.tsx` にもある。編集画面は最安店舗情報を
  一切使わないのに、戻り値の形が変わることで影響を受ける（呼び出し側の書き換えが強制される）。
- `GET /api/products/:id` ルート（`apps/web/src/server/routes/products.ts:36-41`）も
  `c.json(product)` の形でこの UseCase の戻り値をそのまま返している。戻り値の形を変えると
  この公開 API のレスポンス形も変わる（対象外に定めた API 設計変更を誘発する）。
- 「商品を取得する」という単一責務に「その商品の最安店舗を計算する」という別責務が
  常時付随する形になり、後から「商品だけ欲しい／最安店舗だけ欲しい」という要求が来たときに
  戻しにくい。

クエリコストの観点では案1と同等だが、既存呼び出し元への影響範囲が案1より広いため、
影響を商品詳細画面に閉じられる案1を推奨する。

#### 案3（却下）: Presentation 層で `ProductDto` から最安店舗を計算する

却下理由: `.claude/rules/presentation-layer.md`「Presentation 層は UseCase を呼ぶだけ。
ドメインロジックを Presentation に書かない」に直接抵触する。

`Product.cheapestStoreAt()` / `Product.latestPriceRecordAt()` は Domain Entity の
メソッドであり、`ProductDto`（`packages/application/src/product/product.dto.ts`）は
既にこれらのメソッドを持たない平坦なデータへ変換済みである。Presentation 側で
「最安店舗」を再現するには、`priceHistory: PriceRecordDto[]` から店舗ごとに最新の記録を
抜き出し、単価を比較する、という**ドメインの決定ロジックをもう一箇所に複製する**ことになる。

これは `apps/web/src/app/shopping-lists/_utils/price-comparison.ts` の前例と一見似ているが、
性質が異なる。

|                                                                                   | `price-comparison.ts`（既存・Presentation 層）                                               | 本タスクの「最安店舗」                                                     |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 何を計算するか                                                                    | 買い物リストの品目ごとの**必要量**に対する概算総額差（表示用の推定値）                       | 商品の**正式な**最安店舗判定                                               |
| Domain に同等のメソッドがあるか                                                   | ない（`requiredAmount` を織り込む計算は Domain 未実装）                                      | **ある**（`Product.cheapestStoreAt()`。`RecordPriceUseCase` 経由の副作用や |
| `GetCheapestStoreUseCase` など複数箇所から参照される「正式な」business decision） |
| 表示上の位置づけ                                                                  | 「約◯円安い」という推定・非最終決定（`EstimatedPriceDiff` という命名も推定であることを明示） | 商品詳細の「最安店舗」欄そのもの（唯一の正解であるべき値）                 |

`price-comparison.ts` は Domain にまだ存在しない計算をやむを得ず Presentation 側で
行っている（それ自体、将来 Domain へ引き上げる余地があるものとして扱われている）のに対し、
今回は**既に Domain に正式なメソッドがある**判定をわざわざ Presentation で再実装することになる。
2026-07-27 の「単価 10 倍ズレ」事故（`docs/05-roadmap.md` Sprint 6 クローズ節に記録）は、
まさに単位換算ロジックが複数箇所に分散したことに起因する不具合であり、同型のリスクを
新たに増やすことになるため、案3は明確に却下する。

### B: recharts の遅延読み込み

`price-history-chart.tsx` と `components/ui/chart.tsx` の両方が recharts を静的 import
しているが、**`components/ui/chart.tsx` を静的 import しているのは `price-history-chart.tsx`
だけ**（grep で確認済み）。したがって `PriceHistoryChart` コンポーネント単位で
`next/dynamic` 化すれば、バンドラの import グラフ解決により `chart.tsx` 経由の recharts も
まとめて同じ遅延チャンクに入る。`chart.tsx` 側を個別に手当てする必要はない。

```typescript
// product-detail-client.tsx（'use client'）
import dynamic from 'next/dynamic';
import { PriceHistoryChartSkeleton } from './price-history-chart-skeleton'; // 新規・軽量

const PriceHistoryChart = dynamic(
  () =>
    import('./price-history-chart').then((mod) => mod.PriceHistoryChart),
  {
    ssr: false,
    loading: () => <PriceHistoryChartSkeleton />,
  },
);
```

設計判断:

- **`ssr` は `false` を推奨。** `product-detail-client.tsx` は既に `'use client'` なので
  `ssr: false` は許可される（Server Component からは使えない制約に抵触しない）。
  `ResponsiveContainer`（`chart.tsx` の `INITIAL_DIMENSION` フォールバックが必要な理由も
  これ）はブラウザでの DOM 計測が前提のコンポーネントであり、SSR で意味のある出力にならない。
  `ssr: false` にすることで、サーバー側でも recharts のモジュール解決自体が発生しなくなる
  （サーバーバンドル・SSR コストの両方を避けられる）。
- **フォールバック UI はレイアウトシフトを避ける固定高さのスケルトンにする。**
  既存の `ChartContainer` は `className="h-64 w-full aspect-auto rounded-xl bg-card p-2"`
  （`price-history-chart.tsx:105`）。フォールバックも同じ `h-64 w-full rounded-xl bg-card`
  を持つプレースホルダにし、読み込み前後で高さが変わらないようにする。
- **フォールバックコンポーネントは `price-history-chart.tsx` とは別ファイルに分離する。**
  `next/dynamic` の `loading` オプションは遅延対象とは別に**即時評価**される
  （初期バンドルに含まれる）。フォールバックを `price-history-chart.tsx` 内に置いて
  そこから import すると、同ファイルの recharts 静的 import も一緒に初期バンドルへ
  引き戻されてしまい、遅延化の効果が消える。そのため
  `price-history-chart-skeleton.tsx`（recharts 非依存の小さいファイル）を新規に切り出す。

## データフロー

### 変更前

```
Browser → GET /products/:id (Server Component)
  → GetProductUseCase.execute()
      → DB: products ⟕ price_records（findById） … #1
      → DB: stores（findAll）                    … #2
  → GetCheapestStoreUseCase.execute()
      → DB: products ⟕ price_records（findById） … #3（#1 と重複）
      → DB: stores（findById）                    … #4（#2 に含まれる）
  → HTML 応答（ProductDetailClient に product / cheapestStore を渡す）
      → クライアントで recharts を含む JS を読み込み（初期バンドルの一部）
```

### 変更後

```
Browser → GET /products/:id (Server Component)
  → GetProductDetailUseCase.execute()
      → DB: products ⟕ price_records（findById） … #1
      → DB: stores（findAll）                    … #2
      → cheapestStoreAt() / latestPriceRecordAt()（ドメイン純粋計算、クエリなし）
  → HTML 応答（ProductDetailClient に product / cheapestStore を渡す）
      → 初期 JS には recharts を含まない
      → PriceHistoryChart 表示直前に recharts チャンクを動的 import
```

## API 設計

対象外。Hono ルート（`apps/web/src/server/routes/products.ts`）・api-contract の変更はない。
`GetProductDetailUseCase` は Server Component から直接呼ぶユースケースであり、API として
公開しない（`.claude/rules/presentation-layer.md` の「初期表示は方法A（Server Component 直接）」
の方針どおり）。

## DB 設計

対象外。テーブル・インデックス・マイグレーションの変更はない。クエリの**内訳**が
変わるのみ（詳細は §変更後構成 A・§性能）。

## フロントエンド設計

- `apps/web/src/app/products/[id]/page.tsx`: `GetProductUseCase` + `GetCheapestStoreUseCase`
  の 2 回呼び出しを `GetProductDetailUseCase` の 1 回呼び出しに差し替える。
  `ProductNotFoundError` → `notFound()` の既存フローは変えない。
- `apps/web/src/app/products/[id]/_components/product-detail-client.tsx`:
  `PriceHistoryChart` の静的 import を `next/dynamic` に差し替える（§変更後構成 B）。
  Props（`priceHistory: PriceRecordDto[]`）はそのまま渡せる。
- 新規 `apps/web/src/app/products/[id]/_components/price-history-chart-skeleton.tsx`:
  `PriceHistoryChartSkeleton`（named export。default export 禁止規約に従う）。
  recharts に依存しない、固定高さのプレースホルダ。
- `apps/web/src/app/products/[id]/edit/page.tsx` は変更なし（引き続き `GetProductUseCase` を使う）。

## バックエンド設計

- `packages/application/src/product/get-product-detail.use-case.ts`（新規）:
  `GetProductDetailUseCase`。コンストラクタ注入は `ProductRepository` / `StoreRepository`
  （手動 DI。既存 UseCase と同じ形）。公開クラスのため JSDoc を付与する
  （コーディング規約「shopping-list 以降の新規・変更コードに適用」に従う。型に表せない契約
  情報のみ: `cheapestStore` が `null` になる条件など）。
- `packages/application/src/product/product.dto.ts`: `ProductDetailResultDto` を追加。
- `packages/application/src/product/index.ts`: `export * from './get-product-detail.use-case';`
  を追加（バレル境界を維持。ADR-0010）。
- 既存 `GetProductUseCase` / `GetCheapestStoreUseCase` はロジック変更なし。

## エラー処理

外部 API・外部ストレージへの新規 I/O は無い（既存の DB 読み取り経路を再構成するのみ）ため、
Skill テンプレートのリトライ／タイムアウト／冪等性／部分失敗／フォールバックの 5 項目は対象外。

- `GetProductDetailUseCase` は `productRepository.findById()` が `null` を返した場合に
  `ProductNotFoundError` を投げる（既存 2 UseCase と同じ入口処理）。
- `page.tsx` 側の `try/catch` → `notFound()` の扱いは変更しない。

## ログと監視

変更なし。既存の商品詳細ページ・UseCase にログ出力の仕組みは無く、本タスクでも追加しない。

## セキュリティ

変更なし。MVP1 は認証なし運用（ADR-0003）。本タスクは読み取りクエリの再構成とバンドル分割のみで、
権限・入力検証の範囲に変更はない。

## 性能

DB クエリの新設・変更を含むため、本節を厚く書く（Orchestrator 指示に基づく）。

### クエリ削減効果（実測ではなく設計上の内訳）

|                                        | 変更前                        | 変更後                 |
| -------------------------------------- | ----------------------------- | ---------------------- |
| `products ⟕ price_records`（findById） | 2 回（うち 1 回は完全な重複） | 1 回                   |
| `stores`（findAll / findById 合算）    | 2 回                          | 1 回（`findAll` のみ） |
| 合計 DB 往復                           | **4 本**                      | **2 本**               |

`force-dynamic` のためこのページはアクセスごとに毎回実行される。往復半減の効果は
アクセス頻度に比例して積み上がる。

### N+1 リスク

新規の N+1 リスクはない。`findById` は単一商品の JOIN 1 本、`findAll` は `stores`
全件 1 本（`stores` は 2 人運用・上限 3 件想定の小テーブル。§出典:
`DrizzleStoreRepository.findByNormalizedName` のコメント「上限 3 件の小さなテーブル」）。
ループ内でのクエリ発行は発生しない。

### インデックス

変更なし。クエリの発行回数は減るが、クエリ自体の形（`products.id` への等値検索・
`price_records` の JOIN・`stores` 全件走査）は変わらないため、新規インデックスは不要と判断する。

### キャッシュ

対象外。MVP1 は TanStack Query 未導入（`docs/02-tech-stack.md`）であり、
商品詳細ページは初期表示を Server Component が毎回取得する方針のまま変えない
（`force-dynamic` の維持）。キャッシュ導入はスコープ外。

### レスポンスタイム予算

Neon はスケールゼロからのコールドスタートで数秒の遅延が起こりうる（`docs/02-tech-stack.md`）。
コールドスタート時の絶対値は本タスクでは改善されない（往復回数が減るだけで、各往復自体の
レイテンシは変わらない）。**定量的な改善幅は未計測**であり、「クエリ 1 本あたりの往復コスト ×
2 本分」が理論上の削減量という以上の数値は断定しない。§テスト方針の効果測定で
ビルド出力・クエリ回数を機械的に確認する。

### 負荷試験

対象外。外部 API・外部ストレージへの新規 I/O ではなく、既存 DB 接続経路の呼び出し回数を
減らす変更のため、新規の負荷試験シナリオは不要と判断する。

## テスト方針

L2 だが性能改善そのものが目的のタスクのため、効果を機械的に確認できる手段を明記する。

### クエリ数削減の検証（Vitest・UseCase 単体テスト）

`packages/application/tests/product/product-use-cases.test.ts` に既にある
`InMemoryProductRepository` / `InMemoryStoreRepository`（DB 不要のフェイク実装）に、
呼び出し回数を数えるカウンタを追加する（既存の `saveCount` と同じパターン）。

```typescript
// InMemoryProductRepository に追加
public findByIdCallCount = 0;
async findById(id: ProductId): Promise<Product | null> {
  this.findByIdCallCount += 1;
  return this.map.get(id.value) ?? null;
}

// InMemoryStoreRepository に追加
public findAllCallCount = 0;
public findByIdCallCount = 0;
async findAll(): Promise<Store[]> {
  this.findAllCallCount += 1;
  return [...this.map.values()];
}
async findById(id: StoreId): Promise<Store | null> {
  this.findByIdCallCount += 1;
  return this.map.get(id.value) ?? null;
}
```

新規 `describe('GetProductDetailUseCase')` で次を検証する。

- 商品・複数店舗の価格記録を seed → `execute()` 実行後、
  `productRepository.findByIdCallCount === 1`・`storeRepository.findAllCallCount === 1`・
  `storeRepository.findByIdCallCount === 0` を assert する（**この最後の assert が
  「店舗の個別再取得をしない」という本タスクの目的そのものの回帰ガードになる**）。
- 返り値の `product` / `cheapestStore` が、既存の `GetProductUseCase` /
  `GetCheapestStoreUseCase` を個別に呼んだ場合と同じ値になることを確認する
  （既存 2 UseCase のテストケースを流用・同じ fixture で突き合わせる）。
- 商品が存在しない場合に `ProductNotFoundError` を投げ、`storeRepository` へは
  一切アクセスしないこと（`findAllCallCount === 0`）も確認する。

この形であれば DB（PGlite/Neon）なしで、クエリ回数の削減を CI 上で機械的に確認できる。

### バンドルサイズ削減の検証（チャンクファイルの直接計測）

> **2026-08-06 に Orchestrator が実測して手順を確定した。** 当初この節は
> 「`next build --webpack` はルートごとの First Load JS を含む表を印字する」前提で書いていたが、
> **本プロジェクトの Next.js では Route 表にサイズ列が出ない**（`ƒ` / `○` のマーカーと
> パスだけ）。実際に `pnpm build` を実行して確認した。よってチャンクファイルを直接測る。

#### 改善前のベースライン（実測値・コミット `6f39be3`）

| チャンク                                                         | サイズ     | 内容                |
| ---------------------------------------------------------------- | ---------- | ------------------- |
| `.next/static/chunks/6383-0fb8ea77dabd0644.js`                   | **374 KB** | **recharts を含む** |
| `.next/static/chunks/app/products/[id]/page-682415964608e055.js` | 37 KB      | ページ本体          |

`6383-*.js` を参照している client-reference-manifest は **2 ページのみ**:
`/products/[id]` と `/products/[id]/edit`。
→ **recharts の 374 KB は商品詳細（と商品編集）だけが引き込んでいる。**
編集画面にチャートは無いため、編集ページ側の参照が実際のロードを伴うのかは実装時に確認する
（伴うなら遅延化の効果は 2 ページ分になる）。

#### 手順（リモート環境で実行可能・ブラウザ操作不要）

```bash
pnpm build
# recharts を含むチャンクとサイズ
grep -rl "recharts" apps/web/.next/static/chunks/ | while read f; do
  printf "%s  %s KB\n" "$f" "$(( $(stat -c %s "$f") / 1024 ))"; done
# そのチャンクを参照するページ（client-reference-manifest を見る）
grep -rl "<chunk-name>" apps/web/.next --include=*.js | grep client-reference-manifest
```

#### 完了条件

1. recharts を含むチャンクが**独立したオンデマンドチャンクとして出力される**こと。
2. そのチャンクを参照する client-reference-manifest から `/products/[id]` が外れる
   （＝初期ロードに含まれなくなる）か、参照が残る場合は実際のネットワークロードが
   チャート表示時まで遅延することを実画面で確認すること。
3. 数値は「374 KB が初期ロードから外れた」形で前後比較して記録する。
   **推定値ではなく実測値を書くこと。**

### 機能面の回帰確認（RTL）

`apps/web/tests/app/products/[id]/_components/product-detail-client.test.tsx` は
現状 `PriceHistoryChart` の描画内容を直接 assert していないため大きな書き換えは不要と
見込むが、`next/dynamic` 化により当該コンポーネントの初期表示が 1 tick 非同期になる。
既存テストで `render()` 直後に同期的な `getByText` 等を使っている箇所がタイミング依存に
ならないか実装時に確認し、必要な箇所は `findBy*` / `waitFor` に置き換える。
加えて、遅延読み込みが正しく解決しチャート（または空データ時の
「価格記録がありません」文言）が最終的に描画されることを 1 件確認する
（dynamic import の path 指定ミスで永久にスケルトンのまま、という実装ミスの回帰ガード）。

## 移行とリリース

データ移行は無い。A（クエリ削減）と B（recharts 遅延化）は互いに独立した変更で、
別々にリリースしても問題ない。フィーチャーフラグは不要（挙動の見た目は変わらない）。

## リスク

- `GetProductDetailUseCase` 新設に伴い、`page.tsx` の書き換えを漏らすと
  旧 2 UseCase 呼び出しが残存し、削減効果が出ない（§テスト方針のクエリ回数テストで検知可能）。
- フォールバックコンポーネントを誤って `price-history-chart.tsx` から import すると、
  遅延化の効果が消える（§変更後構成 B で明記済み。実装時にビルド出力で確認する）。
- `ssr: false` により、JS 無効環境・極端に遅い回線ではチャート部分がスケルトンのまま
  留まる時間が伸びる可能性がある。MVP1 は 2 人運用の PWA であり許容範囲と判断するが、
  体感が悪ければ `ssr: true` へ戻す選択肢もある（§未決事項）。

## 未決事項

1. **`GET /api/products/:id/cheapest-store` と `GET /api/products/:id` の扱い**:
   調査の結果いずれもフロントエンドから未使用と判明した。削除するか、将来利用を見越して
   残すかは今回のスコープ外の判断であり、Orchestrator 経由でユーザーに確認する
   （削除するなら別タスクとして切り出す）。
2. **案1（新規 UseCase）で進めてよいか** → **解消（2026-08-07 ユーザー確定）**: 案1 を採用した。
3. **`ssr: false` のちらつきの許容可否** → **解消（2026-08-07・実測で判断）**:
   `ssr: false` を維持する。根拠は 3 点。
   - **レイアウトシフトが無い**。「価格推移」セクションの高さがスケルトンとチャートで
     完全に同一（284px）であることを実測（試験計画 §手動試験 MB-01）。価格記録 0 件の
     経路はレビュー M-1 で修正し、遅延読み込み自体を行わないようにした（MB-05 で 0px を実測）。
   - **SEO 要件が無い**。2 人利用の PWA で `force-dynamic`。価格データ自体は最安店舗カードと
     「最近の記録」でサーバー HTML に含まれるため、チャートが SSR されなくても情報は届く。
   - recharts は DOM 計測を前提とするため SSR 出力の価値が薄い。
   - **残件**: 本番環境での体感（切り替えの速さ）は dev では測れない。MB-04 は dev で
     約 1.4 秒だった。実機で気になるようなら `ssr: true` への変更を再検討する。
