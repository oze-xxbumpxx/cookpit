# 実装計画: shopping-list-price-comparison

- ステータス: ready
- レベル: L2
- 設計書: `docs/designs/shopping-list-price-comparison.md`（確定・未決事項なし）
- 試験計画: `docs/tests/shopping-list-price-comparison.md`（test-designer が並行作成中。本計画の
  テスト箇所指定はファイル配置と粒度のみを定め、個別ケースの ID・詳細観点はそちらに委ねる）
- 作業ブランチ: `feat/shopping-list-price-comparison`
- 実装ルート: **Orchestrator（implementer が本計画に基づき直接実装）**
- 判断理由: 設計書に指定済み（Codex ブリーフは作成しない）。

## 設計逸脱の有無

**なし。** 設計書 §フロントエンド設計・§計算仕様・§コンポーネント設計の記述どおりに実装する。
本計画で新たな設計判断は行わず、実装単位への分解とファイル特定のみを行う。

---

## 全体の完了条件

- 買い物リスト詳細画面で、換算可能な店舗が 2 件以上ある品目に「◯店の方が約△円安い」が表示される。
- チェック有無を問わず、価格記録のある品目には「店舗別の単価を見る」/「金額を記録」の展開トリガーが出て、
  店舗別単価の内訳（最大 3 行）が確認できる。
- 縮退ケース（設計書 §縮退ケース一覧 1〜9）で過剰な表示・エラー落ちが起きない。
- 既存の推奨店舗バッジ・3 カラム構造・`w-28` 固定幅・購入実績入力フロー・`expandedItemId` の
  既存遷移（チェックを外すと展開パネルが閉じる 等）が壊れていない。
- `pnpm lint` / `pnpm type-check` / `pnpm test` が通る。
- 新規 API・DB スキーマ・Domain/Application/Infrastructure 層への変更が無い（Presentation 層のみ）。

---

## 変更対象ファイル一覧

### 新規作成（4 ファイル）

| #   | ファイルパス                                                                   | 内容                                         |
| --- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| N-1 | `apps/web/src/app/shopping-lists/_utils/price-comparison.ts`                   | 単位換算・総額差・内訳の純粋関数群           |
| N-2 | `apps/web/tests/app/shopping-lists/_utils/price-comparison.node.test.ts`       | N-1 の単体テスト                             |
| N-3 | `apps/web/src/app/shopping-lists/_components/store-unit-price-list.tsx`        | 店舗別単価の内訳リスト（共有コンポーネント） |
| N-4 | `apps/web/tests/app/shopping-lists/_components/store-unit-price-list.test.tsx` | N-3 の RTL テスト                            |

### 既存ファイル変更（5 ファイル + 5 つの既存テストファイル）

| #    | ファイルパス                                                                           | 変更種別                                                      |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| E-1  | `apps/web/src/app/shopping-lists/[id]/page.tsx`                                        | `GetProductsUseCase` を `Promise.all` に追加                  |
| E-2  | `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`                 | `products` prop 追加 + `productMap` の `useMemo` + 中継       |
| E-3  | `apps/web/src/app/shopping-lists/_components/store-group.tsx`                          | `productMap` prop 追加・中継のみ                              |
| E-4  | `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`                    | `productMap` prop 追加 + 総額差行 + 展開トリガー条件拡張      |
| E-5  | `apps/web/src/app/shopping-lists/_components/purchase-input-form.tsx`                  | `breakdown` prop 追加 + 内訳セクション                        |
| E-6  | `apps/web/tests/app/shopping-lists/_components/shopping-list-test-fixtures.ts`         | `createProductDto` / `createPriceRecordDto` / `PRODUCTS` 追加 |
| E-7  | `apps/web/tests/app/shopping-lists/_components/shopping-list-client.view.test.tsx`     | `products` prop 追加 + 中継確認テスト追加                     |
| E-8  | `apps/web/tests/app/shopping-lists/_components/shopping-list-client.checked.test.tsx`  | `products` prop 追加 + P-4 遷移テスト追加                     |
| E-9  | `apps/web/tests/app/shopping-lists/_components/shopping-list-client.complete.test.tsx` | `products` prop 追加                                          |
| E-10 | `apps/web/tests/app/shopping-lists/_components/shopping-list-client.remove.test.tsx`   | `products` prop 追加                                          |
| E-11 | `apps/web/tests/app/shopping-lists/_components/shopping-list-client.sync.test.tsx`     | `products` prop 追加                                          |
| E-12 | `apps/web/tests/app/shopping-lists/_components/shopping-item-row.test.tsx`             | `productMap` デフォルト追加 + 新規 IR ケース                  |
| E-13 | `apps/web/tests/app/shopping-lists/_components/store-group.test.tsx`                   | `productMap` デフォルト追加 + 中継確認テスト追加              |
| E-14 | `apps/web/tests/app/shopping-lists/_components/purchase-input-form.test.tsx`           | 10 箇所に `breakdown={null}` 追加 + 新規ケース                |

**変更しないファイル**（設計書 §対象外 の確認）: `apps/web/src/app/shopping-lists/_utils/shopping-list-view.ts`、
`apps/web/src/app/products/_utils/product-format.ts`、`packages/domain` / `packages/application` /
`packages/infrastructure` / `packages/api-contract` / `apps/web/src/server/**`、
`apps/web/tests/app/shopping-lists/_components/add-item-form.test.tsx`（`AddItemForm` を直接
レンダリングしており `ShoppingListClient` を経由しないため無関係）。

---

## 実装手順

実装順序は設計書 §コンポーネント設計 の記載順（純粋関数 → 共有コンポーネント →
`page.tsx` → `shopping-list-client.tsx` → `store-group.tsx` → `shopping-item-row.tsx` →
`purchase-input-form.tsx`）に従う。この順序では Step 5〜9 の間、親から子へ新しい prop を
先に渡す形になるため、**Step 5〜9 が全て完了するまでは `pnpm type-check` が通らない**
（子コンポーネントが対応する prop をまだ受け取らないため）。これは想定内であり、各ステップの
完了条件は「そのファイル単体の実装が設計書の記述と一致していること」とし、リポジトリ全体の
type-check は Step 16（品質ゲート）でまとめて確認する。

---

### Step 1: `_utils/price-comparison.ts`（新規）

**対象ファイル**: `apps/web/src/app/shopping-lists/_utils/price-comparison.ts`

**実装内容**: 設計書 §計算仕様・§コンポーネント設計 のとおり実装する。公開 API・型は以下。

```typescript
import type { PriceRecordDto, ProductDto, ShoppingItemDto } from '@cookpit/application';

export interface EstimatedPriceDiff {
  cheapestStoreId: string;
  cheapestStoreName: string;
  estimatedDiffYen: number;
}

export interface StoreUnitPriceEntry {
  storeId: string;
  storeName: string;
  unitPriceAmount: number;
  isCheapest: boolean;
  diffFromCheapestYen: number;
}

export interface StoreUnitPriceBreakdown {
  basisLabel: string;
  entries: StoreUnitPriceEntry[];
}

export function estimateItemPriceDiff(
  item: ShoppingItemDto,
  product: ProductDto | undefined,
): EstimatedPriceDiff | null {
  /* ... */
}

export function buildStoreUnitPriceBreakdown(
  product: ProductDto | undefined,
): StoreUnitPriceBreakdown | null {
  /* ... */
}

export function formatEstimatedDiffMessage(diff: EstimatedPriceDiff): string {
  return `${diff.cheapestStoreName}の方が約${diff.estimatedDiffYen}円安い`;
}

export function formatYen(amount: number): string {
  return `${amount.toLocaleString('ja-JP')}円`;
}
```

内部ヘルパー（非公開）:

```typescript
type UnitBasisKind = 'weight' | 'volume' | 'other';

interface UnitBasis {
  kind: UnitBasisKind;
  canonicalFactor: number;
  divisor: number;
}

// UnitPriceCalculator（packages/domain/src/product/unit-price-calculator.ts）の
// WEIGHT_UNITS / VOLUME_UNITS と同一の厳密一致。normalizeUnit は使わない。
function unitBasis(unit: string): UnitBasis {
  switch (unit) {
    case 'g':
      return { kind: 'weight', canonicalFactor: 1, divisor: 100 };
    case 'kg':
      return { kind: 'weight', canonicalFactor: 1000, divisor: 100 };
    case 'ml':
      return { kind: 'volume', canonicalFactor: 1, divisor: 100 };
    case 'l':
      return { kind: 'volume', canonicalFactor: 1000, divisor: 100 };
    default:
      return { kind: 'other', canonicalFactor: 1, divisor: 1 };
  }
}

// 店舗ごとに observedAt 最大の 1 件へ絞る。storeName === '' の記録（削除済み店舗の防御的縮退。
// product.mapper.ts の storeMap.get(...) ?? ''）は除外する（縮退ケース #7）。
// 同一店舗・同一 observedAt が万一並んだ場合は配列走査順で後に見つかった方を採用する
// （決定的にするための実装上の取り決め。設計書「実装時の技術的補足」参照）。
function pickLatestRecordPerStore(priceHistory: PriceRecordDto[]): PriceRecordDto[] {
  const latestByStore = new Map<string, PriceRecordDto>();
  for (const record of priceHistory) {
    if (record.storeName === '') {
      continue;
    }
    const current = latestByStore.get(record.storeId);
    if (current === undefined || Date.parse(record.observedAt) >= Date.parse(current.observedAt)) {
      latestByStore.set(record.storeId, record);
    }
  }
  return [...latestByStore.values()];
}
```

**`estimateItemPriceDiff` の手順**（設計書 §計算仕様「アイテム行の概算総額差」の手順 1〜10 を
そのまま実装する）:

1. `item.productId === null` → `null`
2. `item.requiredAmount === null` → `null`
3. `productMap.get` に対応する `product` が `undefined`、または `product.priceHistory.length === 0` → `null`
4. `pickLatestRecordPerStore(product.priceHistory)` で店舗ごとの直近記録に絞る
5. `requiredBasis = unitBasis(item.requiredAmount.unit)` を算出し、`recordBasis = unitBasis(record.packageSizeUnit)`
   の `kind` が一致する記録のみを候補にする。**`requiredBasis.kind === 'other'` のときは
   `record.packageSizeUnit === item.requiredAmount.unit` の完全一致も要求する**
6. 各候補について
   `estimatedTotal = record.unitPriceAmount * (item.requiredAmount.value * requiredBasis.canonicalFactor / requiredBasis.divisor)`
   を算出する。**`recordBasis` の値は換算に使わない**（設計書の 1000 倍ズレ事故と同型の欠陥を防ぐ、
   本タスク最大の注意点）
7. 候補が 2 件未満 → `null`
8. `estimatedTotal` の昇順にソートし、**最安（1 位）と 2 番目（2 位）の差**を
   `Math.round(候補[1].estimatedTotal - 候補[0].estimatedTotal)` で算出する
   （個々の `estimatedTotal` は丸めない。丸めるのは差だけ）
9. 差が `0` 以下 → `null`
10. `{ cheapestStoreId: 候補[0].storeId, cheapestStoreName: 候補[0].storeName, estimatedDiffYen: 差 }` を返す

**`buildStoreUnitPriceBreakdown` の手順**（設計書 §計算仕様「展開パネルの店舗別内訳」の手順 1〜9）:

1. `product === undefined`、または `product.priceHistory.length === 0` → `null`
2. `pickLatestRecordPerStore(product.priceHistory)` で直近記録に絞る
3. 直近記録のうち `unitPriceAmount` が最小の 1 件（最安記録）を選び、`unitBasis(最安記録.packageSizeUnit).kind`
   を基準区分とする
4. 基準区分と `unitBasis(record.packageSizeUnit).kind` が一致する記録のみ残す
   （`kind === 'other'` でも `packageSizeUnit` の生文字列一致は**要求しない**。設計書の
   「既知の限定事項」を踏襲する既存の簡略化であり、本タスクで新たに導入する制約ではない）
5. 残りが 2 件未満 → `null`
6. `unitPriceAmount` 昇順にソート
7. 表示値は `unitPriceAmount` をそのまま使う（正準値なので追加換算不要。`formatUnitPrice` は使わない）
8. `basisLabel` は `kind === 'weight' ? '100g' : kind === 'volume' ? '100ml' : `1${基準記録.packageSizeUnit}``
9. ソート後の最小値を `cheapest` とし、`unitPriceAmount === cheapest` の行はすべて
   `isCheapest: true, diffFromCheapestYen: 0`。それ以外は
   `isCheapest: false, diffFromCheapestYen: Math.round(unitPriceAmount - cheapest)`

**完了条件**:

- 上記の公開関数・型がすべて実装され、`export` されている。
- `unitBasis` / `pickLatestRecordPerStore` は非公開（`price-comparison.ts` の外から import できない）。
- `estimateItemPriceDiff` の換算に `requiredBasis`（`item.requiredAmount.unit` 側）のみを使い、
  `recordBasis`（`record.packageSizeUnit` 側）の `canonicalFactor` / `divisor` を金額計算に使っていない
  （**実装後にコード上で目視確認する**。Step 2 のテストが 1000 倍ズレを検出する設計だが、
  実装者自身によるコードレビュー観点としても明記する）。
- コメントは Why のみ（既存 `shopping-list-view.ts` / `product-format.ts` と同じスタイル。
  JSDoc は付けない — UseCase/DTO/Repository ではなく Presentation 層の表示計算のため）。

---

### Step 2: `price-comparison.ts` の単体テスト（新規）

**対象ファイル**: `apps/web/tests/app/shopping-lists/_utils/price-comparison.node.test.ts`
（node 環境。`vitest.node.config.mts` の `include: ['tests/**/*.node.test.ts', ...]` に一致）

**テスト配置の粒度**（詳細ケースは test-designer の試験計画に従うが、最低限このファイルに
以下の観点を配置する）:

1. **単位換算 4 方向テスト（必須）**: 設計書 §テスト方針 の表（A: 0.3kg×500g/¥250 → 150円、
   B: 300g×1kg/¥500 → 150円、C: 2l×500ml/¥100 → 400円、D: 2000ml×1l/¥200 → 400円）を
   そのまま固定値テストとして実装する。A・C は「`recordBasis` を誤って使うと 1000 倍ズレる」
   ことを検出する回帰テストとして機能させる（`recordBasis` を誤用すると A は `0.15円` になり
   確実に失敗する）。
2. **`unitBasis` 相当ロジックの `UnitPriceCalculator` との整合テスト**: `@cookpit/domain` から
   `Money` / `Quantity` / `UnitPriceCalculator` を値 import し（`store-name.node.test.ts` と同じ
   アプローチ。Node 実行のテストファイルには「Client Component からの値 import 不可」制約が
   適用されないため可能）、`UnitPriceCalculator.calculate(...)` の出力から間接的に正準化倍率が
   `price-comparison.ts` 側の判定と乖離していないことを検証する。
3. **縮退ケース 1〜9**（設計書 §縮退ケース一覧）を `estimateItemPriceDiff` / `buildStoreUnitPriceBreakdown`
   それぞれに対して網羅する。
4. 2 番目に安い店舗との差の算出（3 件以上の候補があるケースを含む）。
5. 同額時の扱い（総額差: 1 位・2 位同額 → 差 0 円で `null`。内訳: 複数店舗同額 → 該当行すべて
   `isCheapest: true`）。
6. `formatYen` / `formatEstimatedDiffMessage` の出力フォーマット。

**注意（vitest 4 の制約）**: このファイルは純粋関数のみをテストし、クラスをモックする必要は
ないため通常は該当しないが、念のため — vitest 4 では `vi.fn()` にアロー関数を渡すと `new` で
呼び出せない（`TypeError: ... is not a constructor`。アロー関数は `[[Construct]]` を持たない）。
本ステップ・本機能全体で `vi.hoisted` 等によるコンストラクタのモックは発生しない想定だが、
もし実装中にモックが必要になった場合は関数式（`function` キーワード）を使うこと。

**完了条件**: `pnpm --filter @cookpit/web test` でこのファイルの全ケースが通る。特に A・C の
固定値ケースが「意図的に `recordBasis` を使うよう壊した場合に失敗する」ことを、実装者が
一時的に Step 1 のコードを `recordBasis` 使用に書き換えてテストが red になることを確認してから
元に戻す、という手順で検証することを推奨する（テスト自体の有効性確認）。

---

### Step 3: `_components/store-unit-price-list.tsx`（新規・共有コンポーネント）

**対象ファイル**: `apps/web/src/app/shopping-lists/_components/store-unit-price-list.tsx`

**実装内容**（設計書 §コンポーネント設計 のとおり）:

```typescript
import type { StoreUnitPriceEntry } from '../_utils/price-comparison';
import { formatYen } from '../_utils/price-comparison';

interface Props {
  basisLabel: string;
  entries: StoreUnitPriceEntry[];
}

export function StoreUnitPriceList({ basisLabel, entries }: Props) {
  return (
    <ul className="flex flex-col gap-1">
      {entries.map((entry) => (
        <li key={entry.storeId} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate text-foreground">{entry.storeName}</span>
          <span className="shrink-0 text-muted-foreground">
            {formatYen(entry.unitPriceAmount)} / {basisLabel}
          </span>
          <span className="shrink-0 font-medium text-foreground">
            {entry.isCheapest ? '← 最安' : `+${entry.diffFromCheapestYen}円`}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

`entries` は `buildStoreUnitPriceBreakdown` が既に「最大 3 件（ADR-0013 の店舗上限）」に
収まる配列を渡す前提のため、このコンポーネント側で件数を絞り込む処理は行わない
（呼び出し側の契約として設計書に明記済み）。既存のセマンティックトークン
（`text-foreground` / `text-muted-foreground`）のみ使用し、新規トークンは追加しない。

**完了条件**:

- `Props` が `{ basisLabel: string; entries: StoreUnitPriceEntry[] }` である。
- 各行に店舗名・`${formatYen(unitPriceAmount)} / ${basisLabel}`・
  `isCheapest ? '← 最安' : '+${diffFromCheapestYen}円'` が表示される。
- default export ではなく名前付き export（`coding-standards.md`）。

---

### Step 4: `store-unit-price-list.tsx` の RTL テスト（新規）

**対象ファイル**: `apps/web/tests/app/shopping-lists/_components/store-unit-price-list.test.tsx`
（happy-dom 環境。`vitest.dom.config.mts` の `include: [..., 'tests/**/*.test.tsx']` に一致）

**テスト配置の粒度**:

- 単体レンダリング（2〜3 件の `entries` で店舗名・単価・`basisLabel` が表示される）。
- 最安行（`isCheapest: true`）が「← 最安」、それ以外が「+◯円」と表示される。
- `entries` が最大想定件数（3 件。ADR-0013）でも崩れず表示される。

**完了条件**: `pnpm --filter @cookpit/web test` で全ケース通過。

---

### Step 5: `[id]/page.tsx`（変更）

**対象ファイル**: `apps/web/src/app/shopping-lists/[id]/page.tsx`

**現在の内容**（抜粋。全文は Read 済み）:

```typescript
import {
  GetShoppingListUseCase,
  GetStoresUseCase,
  ShoppingListNotFoundError,
  type ShoppingListDto,
  type StoreDto,
} from '@cookpit/application';
import { shoppingListRepository, storeRepository } from '@/server/repositories';
...
  let shoppingList: ShoppingListDto;
  let stores: StoreDto[];
  try {
    [shoppingList, stores] = await Promise.all([
      new GetShoppingListUseCase(shoppingListRepository()).execute({ shoppingListId: id }),
      new GetStoresUseCase(storeRepository()).execute(),
    ]);
  } catch (error) {
    if (error instanceof ShoppingListNotFoundError) {
      notFound();
    }
    throw error;
  }

  return <ShoppingListClient shoppingList={shoppingList} stores={stores} />;
```

**変更内容**:

1. import に `GetProductsUseCase`, `type ProductDto` を追加（`@cookpit/application`）。
2. `@/server/repositories` の import に `productRepository` を追加。
3. `let products: ProductDto[];` を宣言に追加。
4. `Promise.all` に `new GetProductsUseCase(productRepository(), storeRepository()).execute()` を
   追加し、`products` へ分割代入する。
5. `catch` ブロックは変更しない（`GetProductsUseCase` は `NotFoundError` 系を投げないため、
   既存の `ShoppingListNotFoundError` 分岐のみで良い）。
6. `<ShoppingListClient shoppingList={shoppingList} stores={stores} products={products} />` に変更。

**確認ポイント（既存挙動）**:

- `catch (error) { if (error instanceof ShoppingListNotFoundError) notFound(); throw error; }` の
  分岐・順序を変えない（`GetShoppingListUseCase` が投げるエラーのみが `notFound()` に到達する
  既存挙動を保つ）。
- `storeRepository()` の呼び出しが 2 回（`GetStoresUseCase` 用と `GetProductsUseCase` 用）になるが、
  設計書が明記済みの許容事項（`getDb()` の同一接続をラップする軽量ファクトリ）。新規ファクトリは
  作らない。

**完了条件**: ファイル内のロジックが上記と一致する。このステップ単体では
`<ShoppingListClient>` がまだ `products` prop を受け取らないため型エラーになるが、
Step 6 完了後に解消される想定内の状態である。

---

### Step 6: `_components/shopping-list-client.tsx`（変更）

**対象ファイル**: `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`

**変更内容**:

1. import 文（現状 1-23 行目）に `ProductDto`（型のみ）を追加し、`useMemo` を `react` の
   import に追加する。
   ```typescript
   import type {
     ProductDto,
     ShoppingItemDto,
     ShoppingListDto,
     StockAdditionInputDto,
     StoreDto,
   } from '@cookpit/application';
   ...
   import { startTransition, useEffect, useMemo, useOptimistic, useState } from 'react';
   ```
2. `Props` インターフェース（現状 33-36 行目）に `products: ProductDto[];` を追加する。
3. 関数シグネチャの分割代入に `products` を追加する（`{ shoppingList, stores, products }: Props`）。
4. 各種 `useState` / `useApiAction` フックの宣言群の直後（現状 97 行目 `const syncAction = useApiAction();`
   の後、`const boughtItems = ...`（現状 100 行目）の前）に以下を追加する。
   ```typescript
   const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
   ```
5. `<StoreGroup ... />` の呼び出し（現状 474-491 行目）の props に `productMap={productMap}` を
   追加する。

**確認ポイント（既存挙動）**: `items` / `optimisticItems` / `expandedItemId` の state 定義・
`handleSetChecked` / `handleMarkAsBought` / `handleRemoveItem` / `handleReassignStore` /
`handleToggleExpand` 等の既存ロジックは一切変更しない（設計書 §データフロー「既存の書き込み
フロー（変更なし）」）。`productMap` の追加はレンダリング用の派生値であり、他の state・
`startTransition` の呼び出し順序に影響しない。

**完了条件**: 上記 5 点が反映されている。このステップ単体では `<StoreGroup>` がまだ
`productMap` prop を受け取らないため型エラーになるが、Step 7 完了後に解消される想定内の状態。

---

### Step 7: `_components/store-group.tsx`（変更・中継のみ）

**対象ファイル**: `apps/web/src/app/shopping-lists/_components/store-group.tsx`

**変更内容**:

1. import の `import type { ShoppingItemDto, StoreDto } from '@cookpit/application';` に
   `ProductDto` を追加する。
2. `Props` インターフェースに `productMap: Map<string, ProductDto>;` を追加する
   （末尾の `stores: StoreDto[];` の後など、既存の並び順を大きく崩さない位置）。
3. 分割代入に `productMap` を追加する。
4. `<ShoppingItemRow ... />` の呼び出し（現状 51-65 行目）に `productMap={productMap}` を追加する。

**確認ポイント（既存挙動）**: `groupItemsByStore` によるグルーピングロジック・見出し
（推奨店舗バッジ相当のヘッダー表示、S-6 案A）には一切触れない。`boughtCount` の算出も変更しない。

**完了条件**: 上記 4 点が反映されている。このステップ単体では `<ShoppingItemRow>` がまだ
`productMap` prop を受け取らないため型エラーになるが、Step 8 完了後に解消される想定内の状態。

---

### Step 8: `_components/shopping-item-row.tsx`（変更・本タスクの中心）

**対象ファイル**: `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`

**変更内容**:

1. import に以下を追加する。
   ```typescript
   import type { ProductDto, ShoppingItemDto, StoreDto } from '@cookpit/application';
   import {
     buildStoreUnitPriceBreakdown,
     estimateItemPriceDiff,
     formatEstimatedDiffMessage,
   } from '../_utils/price-comparison';
   import { StoreUnitPriceList } from './store-unit-price-list';
   ```
2. `Props` インターフェース（現状 11-27 行目）に `productMap: Map<string, ProductDto>;` を追加する。
3. 分割代入（現状 37-48 行目）に `productMap` を追加する。
4. 関数本体の先頭（`storeSelectId` / `storeEditing` の宣言の後）に計算ロジックを追加する。
   ```typescript
   const product = item.productId !== null ? productMap.get(item.productId) : undefined;
   const priceDiff = estimateItemPriceDiff(item, product);
   const breakdown = buildStoreUnitPriceBreakdown(product);
   const hasBreakdown = breakdown !== null;
   ```
5. **本文列への総額差行の追加**: 現状 103-107 行目（数量表示の `<p>`）の直後・
   108 行目（`{bought && item.actualPrice !== null && (...)}`）の前に挿入する。
   ```tsx
   {
     priceDiff !== null && (
       <p className="text-xs text-muted-foreground">{formatEstimatedDiffMessage(priceDiff)}</p>
     );
   }
   ```
6. **展開トリガーの条件拡張**: 現状 113-122 行目を以下に変更する。
   ```tsx
   {
     (bought || hasBreakdown) && !readOnly && (
       <button
         type="button"
         onClick={() => onToggleExpand(item.id)}
         disabled={submitting}
         className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
       >
         {bought ? '金額を記録' : '店舗別の単価を見る'}
       </button>
     );
   }
   ```
7. **展開パネルの分岐**: 現状 166-176 行目（`{bought && expanded && (<PurchaseInputForm .../>)}`）を
   以下に変更する。
   ```tsx
   {
     expanded &&
       (bought ? (
         <PurchaseInputForm
           item={item}
           stores={stores}
           submitting={submitting}
           breakdown={breakdown}
           onSubmit={(actualPrice, actualStoreId) =>
             onMarkAsBought(item.id, actualPrice, actualStoreId)
           }
           onCancel={() => onToggleExpand(item.id)}
         />
       ) : (
         hasBreakdown && (
           <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
             <StoreUnitPriceList basisLabel={breakdown.basisLabel} entries={breakdown.entries} />
           </div>
         )
       ));
   }
   ```
   `hasBreakdown` は `breakdown !== null` の言い換えだが、`breakdown.basisLabel` への
   アクセス時に TypeScript の narrowing を効かせるため、`hasBreakdown &&` ではなく
   `breakdown !== null &&` を使うか、`hasBreakdown` を使う場合は
   `breakdown !== null && <StoreUnitPriceList .../>` の形に揃えて null チェックを明示すること
   （`hasBreakdown` という別変数越しでは TypeScript が `breakdown` を non-null と推論できない
   ため、実装時にコンパイルエラーになる。`breakdown !== null && (...)` を使う）。

**確認ポイント（既存挙動・回帰リスクが最も高い箇所）**:

- **IR-13「pending item は『金額を記録』ボタンが表示されない」**: `hasBreakdown` が `false`
  （`productId === null` または価格記録不足）の pending item では、新条件でもトリガー自体が
  出ない。ただし `hasBreakdown` が `true` の pending item では**新たに**「店舗別の単価を見る」
  ボタンが表示されるようになる（これは P-4 で意図された変更であり、回帰ではなく仕様追加）。
  既存テスト IR-13 のデフォルト fixture（`productId: null`）では `hasBreakdown` が常に `false`
  になるため、既存アサーションは変更なしで通る（Step 12 で確認）。
- **IR-18「readOnly のとき『金額を記録』ボタンは表示されない」**: 新条件
  `(bought || hasBreakdown) && !readOnly` でも `!readOnly` が効くため、`hasBreakdown` が `true`
  でも `readOnly` なら表示されない。これは新規テストケースとして Step 12 に追加する
  （既存 IR-18 は bought かつ readOnly のケースのみ検証しており、pending かつ hasBreakdown かつ
  readOnly のケースは新規追加が必要）。
- **IR-10b「pending かつ expanded のとき PurchaseInputForm は表示されない」**: 新しい分岐でも
  `bought` が `false` のときは `PurchaseInputForm` ではなく内訳パネル（または何も表示しない）に
  分岐するため、`購入を記録` ボタンは出ない。既存アサーションのまま通る。
- **`handleSetChecked` の `expandedItemId` リセット挙動との相互作用**（設計書 §データフロー
  「展開状態の再利用によって生まれる遷移」）: `shopping-list-client.tsx` の
  `handleSetChecked` は本ステップで変更しないため、`checked === false` のときのみ
  `expandedItemId` をリセットする既存挙動はそのまま残る。本ステップの変更により新たに
  「pending の内訳パネルを開いたままチェックすると `expandedItemId` は保持されたまま
  `bought` に切り替わり、`PurchaseInputForm`（内訳セクション込み）へシームレスに切り替わる」
  という**新しい遷移**が成立するようになる。この遷移は Step 8 のコード変更だけで自然に成立し、
  追加のハンドリングは不要（設計書で確認済み）。Step 11 でこの遷移を統合テストとして固定する。

**完了条件**: 上記 7 点が反映されている。このステップ単体では `<PurchaseInputForm>` に
`breakdown` prop を渡すが `PurchaseInputForm` 側がまだ受け取らないため型エラーになる。
Step 9 完了後に解消される想定内の状態。

---

### Step 9: `_components/purchase-input-form.tsx`（変更）

**対象ファイル**: `apps/web/src/app/shopping-lists/_components/purchase-input-form.tsx`

**変更内容**:

1. import に以下を追加する。
   ```typescript
   import type { StoreUnitPriceBreakdown } from '../_utils/price-comparison';
   import { StoreUnitPriceList } from './store-unit-price-list';
   ```
2. `Props` インターフェース（現状 9-15 行目）に `breakdown: StoreUnitPriceBreakdown | null;` を
   追加する。
3. 関数シグネチャの分割代入に `breakdown` を追加する。
4. ボタン行（現状 89-96 行目、`<div className="flex gap-2">...</div>`）の直後・
   コンポーネントの閉じ `</div>`（現状 97 行目）の前に、以下を追加する。
   ```tsx
   {
     breakdown !== null && (
       <div className="flex flex-col gap-1 border-t border-border pt-3">
         <p className="text-xs font-medium text-foreground">店舗別の単価</p>
         <StoreUnitPriceList basisLabel={breakdown.basisLabel} entries={breakdown.entries} />
       </div>
     );
   }
   ```

**確認ポイント（既存挙動）**: `priceInput` / `selectedStoreId` / `canSubmit` / `handleSubmit` /
送信ペイロード（`onSubmit(parsedPrice, selectedStoreId)`）・キャンセル動作は一切変更しない
（設計書「既存の価格・実購入店舗入力・ボタン行は一切変更しない」）。`item.status === 'bought'`
のときのみ表示される訂正注意文（現状 52-56 行目）も変更しない。

**完了条件**: 上記 4 点が反映されている。ここまで（Step 1〜9）で
`<ShoppingListClient>` → `<StoreGroup>` → `<ShoppingItemRow>` → `<PurchaseInputForm>` の
prop チェーンが一貫し、単体では `pnpm --filter @cookpit/web type-check` が通る状態になる。

---

### Step 10: 共有テストフィクスチャの拡張

**対象ファイル**: `apps/web/tests/app/shopping-lists/_components/shopping-list-test-fixtures.ts`

**変更内容**: 既存の `createStoreDto` / `createShoppingItemDto` / `createShoppingListDto` /
`STORE_A` / `STORE_B` / `STORES` と同じパターンで以下を追加する。

```typescript
import type { PriceRecordDto, ProductDto /* 既存の型に追加 */ } from '@cookpit/application';

export function createPriceRecordDto(overrides: Partial<PriceRecordDto> = {}): PriceRecordDto {
  return {
    id: 'price-record-a',
    storeId: 'store-a',
    storeName: '店舗A',
    priceAmount: 198,
    unitPriceAmount: 99,
    packageSizeValue: 200,
    packageSizeUnit: 'g',
    observedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

export function createProductDto(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: 'product-a',
    name: '醤油',
    aliases: [],
    category: '調味料',
    defaultUnit: '本',
    priceHistory: [],
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

export const PRODUCTS: ProductDto[] = [];
```

`PRODUCTS` は既存の `STORES` と同じ役割（`ShoppingListClient` render 呼び出しのデフォルト値）
だが、既存 5 テストファイルはいずれも価格比較の値そのものを検証しないため、空配列で十分。
個々のテストで価格差を検証する場合は `createProductDto` / `createPriceRecordDto` の
`overrides` でその場限りの配列を組み立てる（Step 11 の新規ケースで使用）。

**完了条件**: `createPriceRecordDto` / `createProductDto` / `PRODUCTS` がエクスポートされ、
既存 3 ファクトリ・`STORES` 等の既存エクスポートを変更していない。

---

### Step 11: `shopping-list-client.*.test.tsx`（5 ファイル）に `products` prop を追加

**対象ファイル**:

- `apps/web/tests/app/shopping-lists/_components/shopping-list-client.view.test.tsx`（12 箇所）
- `apps/web/tests/app/shopping-lists/_components/shopping-list-client.checked.test.tsx`（15 箇所）
- `apps/web/tests/app/shopping-lists/_components/shopping-list-client.complete.test.tsx`（18 箇所）
- `apps/web/tests/app/shopping-lists/_components/shopping-list-client.remove.test.tsx`（1 箇所）
- `apps/web/tests/app/shopping-lists/_components/shopping-list-client.sync.test.tsx`（3 箇所）

**変更内容**:

1. 各ファイルの `import { createShoppingItemDto, createShoppingListDto, ..., STORES } from
'./shopping-list-test-fixtures';` に `PRODUCTS` を追加する。
2. 各ファイル内の `<ShoppingListClient shoppingList={...} stores={STORES} />` 呼び出しはすべて
   `stores={STORES}` という文字列を含む（各ファイルの `stores={STORES}` の出現数は
   `<ShoppingListClient` の出現数と完全一致することを事前に確認済み。他コンポーネントの
   render 呼び出しとは混在しない）。**この 5 ファイルに限定して**、`stores={STORES}` を
   `stores={STORES} products={PRODUCTS}` に一括置換する。
   - 対象外: `add-item-form.test.tsx`（`stores={STORES}` 12 箇所）と
     `purchase-input-form.test.tsx`（`stores={STORES}` 10 箇所）は `<ShoppingListClient>` を
     レンダリングしないため、この置換の対象に**含めない**（誤って含めると無関係なコンポーネントに
     存在しない prop を渡すことになり、型エラーになる）。
3. **新規テストケース（結合レベル、1〜2 件ずつ）**:
   - `shopping-list-client.view.test.tsx`: `products` prop が `productMap` を経由して
     `ShoppingItemRow` まで届き、価格差メッセージ（`formatEstimatedDiffMessage` の出力）が
     画面に表示されることを検証する 1 ケース。`createProductDto` で 2 店舗分の
     `priceHistory`（同じ `kind` の単位、価格差あり）を用意し、`createShoppingItemDto` の
     `productId` をその商品 ID に合わせ、`requiredAmount` をどちらかの記録と換算可能な単位にする。
   - `shopping-list-client.checked.test.tsx`: 設計書 §データフロー「展開状態の再利用によって
     生まれる遷移」を固定する 1 ケース。pending 品目の内訳パネル（「店舗別の単価を見る」）を
     開いた状態でチェックすると、`expandedItemId` が保持されたまま `PurchaseInputForm`
     （内訳セクション込み）に切り替わることを検証する。既存の IR/LC 系と同じ
     `render` → `user.click` → `waitFor` の作法に合わせる。

**完了条件**: 5 ファイルすべてで `<ShoppingListClient>` の呼び出しに `products` が渡り、
既存アサーションは無修正で通る。新規 2 ケースが追加され通る。

---

### Step 12: `shopping-item-row.test.tsx` の更新

**対象ファイル**: `apps/web/tests/app/shopping-lists/_components/shopping-item-row.test.tsx`

**変更内容**:

1. `import type { ShoppingItemDto, StoreDto } from '@cookpit/application';` に `ProductDto` を追加する。
2. `renderRow` の `defaults`（現状 38-49 行目）に `productMap: new Map<string, ProductDto>(),` を
   追加する（型注釈が無いと `new Map()` は `Map<unknown, unknown>` と推論され、`Map` の invariance
   により `Map<string, ProductDto>` 型の必須 prop に代入できず型エラーになる。明示的な型引数が必要）。
3. **新規ケース**（配置粒度のみ指定。詳細は試験計画に従う）:
   - `priceDiff !== null` のときのみ総額差の行が表示される（`productMap` に対応する `ProductDto`
     を注入し、`estimateItemPriceDiff` が非 `null` を返す状況を作る）。
   - 展開トリガーのラベル出し分け: bought → 「金額を記録」、pending かつ `hasBreakdown` →
     「店舗別の単価を見る」。
   - pending かつ `hasBreakdown` が `false`（デフォルト fixture のまま）ではトリガーが出ない
     （既存 IR-13 の維持を明示的に再確認する形で追加してもよい）。
   - **readOnly かつ `hasBreakdown` が `true`** でもトリガーが出ない（既存 IR-18 は bought 側の
     ケースのみのため、pending 側のこの組み合わせは新規）。
   - pending かつ `expanded` かつ `hasBreakdown` のとき、`PurchaseInputForm`（「購入を記録」ボタン）
     ではなく `StoreUnitPriceList` の内訳のみが表示される。
   - bought かつ `expanded` のとき、`hasBreakdown` の有無に関わらず `PurchaseInputForm` が
     表示され、`breakdown` が非 `null` なら内訳セクションも併せて表示される（`PurchaseInputForm`
     側の描画は Step 14 で検証するため、ここでは「呼び出しに `breakdown` が正しく渡っていること」
     を確認できれば十分）。

**確認ポイント（既存挙動の再確認）**: 既存 IR-01〜IR-24 が `productMap: new Map()`
（空 Map。`productId: null` のデフォルト fixture と組み合わさるため `product` は常に
`undefined`）の追加だけで、アサーション内容を変更せずに通ることを確認する
（`hasBreakdown` が常に `false` になるため、新条件は旧条件と同じ結果になる）。

**完了条件**: 既存 IR-01〜IR-24 が無修正で通り、新規ケースが追加され通る。

---

### Step 13: `store-group.test.tsx` の更新

**対象ファイル**: `apps/web/tests/app/shopping-lists/_components/store-group.test.tsx`

**変更内容**:

1. `import type { ShoppingItemDto, StoreDto } from '@cookpit/application';` に `ProductDto` を追加する。
2. `renderStoreGroup` の `defaults`（現状 35-48 行目）に `productMap: new Map<string, ProductDto>(),`
   を追加する。
3. **新規ケース（1 件、結合レベル）**: `productMap` に商品データを注入した状態で
   `StoreGroup` を描画し、`ShoppingItemRow` まで `productMap` が中継されていること
   （価格差メッセージ、または「店舗別の単価を見る」トリガーの出現で確認する）。

**確認ポイント（既存挙動）**: SG-04「金額差表示が存在しない（S-6 案A・スコープ確認）」は
`renderStoreGroup()`（引数なし＝デフォルト、`productMap` は空）で検証しているため、
`productMap: new Map()` の追加後も `screen.queryByText(/円安い/)).toBeNull()` は変わらず通る
ことを確認する。

**完了条件**: 既存 SG-01〜SG-07 が無修正で通り、新規ケースが追加され通る。

---

### Step 14: `purchase-input-form.test.tsx` の更新

**対象ファイル**: `apps/web/tests/app/shopping-lists/_components/purchase-input-form.test.tsx`

**変更内容**:

1. `import type { ShoppingItemDto, StoreDto } from '@cookpit/application';` の下に
   `import type { StoreUnitPriceBreakdown } from '../../../../src/app/shopping-lists/_utils/price-comparison';`
   を追加する（テストからの相対 import は既存の `PurchaseInputForm` の import パスに揃える）。
2. 既存 10 箇所の `<PurchaseInputForm item={...} stores={STORES} submitting={...}
onSubmit={...} onCancel={...} />` 呼び出しすべてに `breakdown={null}` を追加する
   （`stores={STORES}` の直後に挿入する形で統一する）。
3. **新規ケース（2 件）**:
   - `breakdown={null}` のとき「店舗別の単価」セクションが表示されない
     （`screen.queryByText('店舗別の単価')` が `null`）。
   - `breakdown` に `StoreUnitPriceBreakdown`（`basisLabel` + `entries` 2 件程度）を渡すと、
     見出し「店舗別の単価」と `StoreUnitPriceList` の内容が表示される。

**完了条件**: 既存 PF-01〜PF-08 とその他ケースが無修正で通り、新規 2 ケースが追加され通る。

---

### Step 15: 実画面での 390px 確認（manual-browser-verify）

**内容**: 設計書 §テスト方針「実画面確認」のとおり、実装後に `manual-browser-verify` Skill を
使って以下を確認する（ローカル PGlite 環境などで実データを用意した上で）。

- 390px 幅で総額差の行（P-3 の縦積み 1 行）が折り返さずに収まる。
- 未購入品目の展開パネル（P-4）が既存の bought 品目の展開パネルと同時に競合表示されない
  （`expandedItemId` は単一値のため設計上競合しないはずだが、視覚的に確認する）。
- 店舗別内訳（最大 3 行）が `w-28` 固定幅の店舗バッジと干渉しない。
- 推奨店舗バッジと総額差の「最安店舗」表示が食い違うケース（P-2 で許容済み）でも、
  画面が破綻しない（レイアウト崩れがないことのみ確認。表示内容の一致は求めない）。

**完了条件**: 上記 4 点を目視確認し、崩れがあれば Tailwind クラスの微修正（設計書の
セマンティックトークン方針の範囲内）を行う。レイアウト自体の再設計が必要な崩れが見つかった
場合は実装を止めて Orchestrator へ報告する（設計逸脱になるため）。

---

### Step 16: 品質ゲート

```bash
pnpm lint
pnpm type-check
pnpm test
pnpm format
```

**完了条件**:

- 4 コマンドすべてがエラーなし（`pnpm test` は新規追加ケースを含め全 PASS、既存ケースに
  回帰がない）。
- `git status` で意図しないファイル変更（スコープ外のパッケージ・ドメイン層等）が無いことを
  確認する。

---

## 実装順序サマリ

```
Step 1  N-1  _utils/price-comparison.ts（新規・純粋関数）
Step 2  N-2  tests/.../price-comparison.node.test.ts（新規）
Step 3  N-3  _components/store-unit-price-list.tsx（新規）
Step 4  N-4  tests/.../store-unit-price-list.test.tsx（新規）
Step 5  E-1  [id]/page.tsx（GetProductsUseCase 追加）
Step 6  E-2  _components/shopping-list-client.tsx（products prop + productMap）
Step 7  E-3  _components/store-group.tsx（productMap 中継）
Step 8  E-4  _components/shopping-item-row.tsx（総額差行 + トリガー拡張 + 内訳中継）
Step 9  E-5  _components/purchase-input-form.tsx（breakdown セクション）
Step 10 E-6  tests/.../shopping-list-test-fixtures.ts（フィクスチャ拡張）
Step 11 E-7〜E-11  shopping-list-client.*.test.tsx 5 ファイル（products prop + 新規2件）
Step 12 E-12 shopping-item-row.test.tsx（productMap + 新規ケース）
Step 13 E-13 store-group.test.tsx（productMap + 新規ケース）
Step 14 E-14 purchase-input-form.test.tsx（breakdown + 新規ケース）
Step 15      manual-browser-verify（390px 確認）
Step 16      品質ゲート（lint / type-check / test / format）
```

## 依存関係グラフ

```
Step 1（price-comparison.ts）
  ├─→ Step 2（単体テスト）
  ├─→ Step 3（store-unit-price-list.tsx）─→ Step 4（RTL テスト）
  ├─→ Step 8（shopping-item-row.tsx が estimateItemPriceDiff 等を使用）
  └─→ Step 9（purchase-input-form.tsx が StoreUnitPriceBreakdown 型を使用）

Step 3 ─→ Step 8（未購入パネルで StoreUnitPriceList を使用）
Step 3 ─→ Step 9（内訳セクションで StoreUnitPriceList を使用）

Step 5 ⇄ Step 6 ⇄ Step 7 ⇄ Step 8 ⇄ Step 9
  （products/productMap/breakdown の prop チェーン。design書の記載順に実装するが、
   チェーン全体が揃うまで型チェックは通らない。Step 9 完了時点で解消）

Step 1〜9 ─→ Step 10（フィクスチャ拡張。ProductDto/PriceRecordDto の形が Step 1 の入力契約と一致）
Step 10 ─→ Step 11（PRODUCTS を使う）
Step 8 ─→ Step 12（productMap を要求する Props に追随）
Step 7 ─→ Step 13（productMap を要求する Props に追随）
Step 9 ─→ Step 14（breakdown を要求する Props に追随）

Step 1〜14 ─→ Step 15（実画面確認は機能一式が揃った状態が必要）
Step 1〜15 ─→ Step 16（品質ゲートは最後にまとめて実行）
```

---

## テスト計画（配置先サマリ）

| ファイル                                                                                          | 環境      | 内容                                                                               |
| ------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| `apps/web/tests/app/shopping-lists/_utils/price-comparison.node.test.ts`（新規）                  | node      | 単位換算4方向・UnitPriceCalculator 整合・縮退ケース1-9・同額処理・フォーマット関数 |
| `apps/web/tests/app/shopping-lists/_components/store-unit-price-list.test.tsx`（新規）            | happy-dom | 単体レンダリング・最安/差額ラベル・最大件数表示                                    |
| `apps/web/tests/app/shopping-lists/_components/shopping-item-row.test.tsx`（既存拡張）            | happy-dom | 総額差行・トリガー条件拡張・ラベル出し分け・readOnly抑制・パネル分岐               |
| `apps/web/tests/app/shopping-lists/_components/purchase-input-form.test.tsx`（既存拡張）          | happy-dom | breakdown null/非null の内訳セクション出し分け                                     |
| `apps/web/tests/app/shopping-lists/_components/store-group.test.tsx`（既存拡張）                  | happy-dom | productMap の中継確認                                                              |
| `apps/web/tests/app/shopping-lists/_components/shopping-list-client.view.test.tsx`（既存拡張）    | happy-dom | products prop が末端まで届く結合確認                                               |
| `apps/web/tests/app/shopping-lists/_components/shopping-list-client.checked.test.tsx`（既存拡張） | happy-dom | P-4 の expandedItemId 保持遷移（未購入内訳→PurchaseInputForm）                     |
| `apps/web/tests/app/shopping-lists/_components/shopping-list-test-fixtures.ts`（既存拡張）        | -         | `createProductDto` / `createPriceRecordDto` / `PRODUCTS`                           |

詳細な観点・アサーション・テスト ID は `docs/tests/shopping-list-price-comparison.md`
（test-designer 作成）を正典とする。本計画はファイル配置と粒度のみを定める。

---

## リスク

| #   | リスク                                                                                                                                                                                                | 影響                                                 | 対策                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| R-1 | Step 1 で `estimateItemPriceDiff` が `recordBasis` の `canonicalFactor`/`divisor` を誤って使う（2026-07-27 事故と同型）                                                                               | 単価が最大 1000 倍ズレる                             | Step 2 の A・C 固定値テストが確実に検出する設計。Step 1 完了条件に「`recordBasis` を金額計算に使っていない」ことの目視確認を明記済み |
| R-2 | Step 8 で `hasBreakdown &&` のまま `breakdown.basisLabel` にアクセスし、TypeScript の narrowing が効かず型エラーになる                                                                                | 実装が止まる（軽微、コンパイルエラーで即検出）       | Step 8 の完了条件に `breakdown !== null &&` を使う指示を明記済み                                                                     |
| R-3 | Step 5〜9 の prop チェーンを途中まで実装した状態でコミット・レビューに出すと、一見未完成に見える                                                                                                      | レビュー時の誤解                                     | Step 1〜9 は 1 つの作業単位としてまとめて完了させてから Step 16 の品質ゲートに進む。中間コミットを分ける場合はその旨を明記する       |
| R-4 | 既存 5 つの `shopping-list-client.*.test.tsx` の `stores={STORES}` 置換時に、無関係な箇所（`add-item-form.test.tsx` 等）を巻き込む                                                                    | 無関係コンポーネントに存在しない prop を渡し型エラー | Step 11 で対象ファイルを明示的に 5 つに限定し、対象外ファイルを明記済み。置換後に `pnpm type-check` で確認                           |
| R-5 | P-4 の展開トリガー拡張により、未購入品目でも「店舗別の単価を見る」が押せるようになり、`shopping-item-row.tsx` の情報密度が増える（設計書 R-4 相当）                                                   | UX 上の見づらさ（軽微、Sprint 7 内では計測対象外）   | 設計書で明示的に許容済み。Step 15 の 390px 確認でレイアウト崩れがないことのみ確認する                                                |
| R-6 | `hasBreakdown` の判定に `productMap` の中身が必要なため、Step 6〜9 のいずれかで `productMap` の中継漏れが起きると、価格記録があるのに内訳が出ない静かな不具合になる（例外は投げないため気づきにくい） | 機能が動いているように見えて実は空振りする           | Step 11・13 の結合レベルテスト（products/productMap が末端まで届くことの確認）で検出する                                             |

---

## ロールバック方法

各ステップは新規ファイルの削除・既存ファイルの差分取り消しで独立にロールバックできるが、
Step 5〜9 は prop チェーンで相互依存するため、実質的には **Step 1〜9 をまとめて 1 単位として
`git revert`** するのが安全。

1. Step 1〜4（新規ファイル）: `_utils/price-comparison.ts` /
   `_components/store-unit-price-list.tsx` と対応するテストファイルを削除する。
2. Step 5（page.tsx）: `Promise.all` の 3 要素目と `products` 宣言、`import` の追加分を削除し、
   `<ShoppingListClient shoppingList={shoppingList} stores={stores} />` に戻す。
3. Step 6（shopping-list-client.tsx）: `products` prop・`productMap`・`useMemo` の import・
   `<StoreGroup>` への `productMap` 中継を削除する。
4. Step 7（store-group.tsx）: `productMap` prop と `<ShoppingItemRow>` への中継を削除する。
5. Step 8（shopping-item-row.tsx）: `productMap` prop・計算ロジック・総額差行・トリガー条件
   （`(bought || hasBreakdown) && !readOnly` → `bought && !readOnly` に戻す）・展開パネル分岐を
   元に戻す。
6. Step 9（purchase-input-form.tsx）: `breakdown` prop と内訳セクションを削除する。
7. Step 10〜14（テストファイル）: Step 1〜9 のロールバックに合わせて、追加した prop・
   フィクスチャ・新規ケースを削除する（既存アサーションは元々無修正のため影響なし）。

DB スキーマ・マイグレーション・API 契約の変更が無いため、ロールバックにデータ移行の考慮は不要。

---

## ドキュメント更新対象

- `docs/designs/shopping-list-price-comparison.md`: 実装完了後、ステータスを「確定」から
  「実装済み」に更新する（本リポジトリの慣例。例: `meal-plan-core.md` / `meal-plan-shopping-sync.md`）。
- `docs/05-roadmap.md` Sprint 7 タスク1「価格差の定量表示」を完了マークに更新する（実装完了後）。
- `docs/04-domain-model.md`: 更新不要（Domain 層の変更が無いため）。
- 参考（本計画の対象外・Orchestrator 判断事項）: `docs/designs/shopping-list-screens.md` の
  S-6/R-6 は「バルク取得 API が無いため N+1 になる」という当時の前提を記録したまま残っている。
  本設計書 §背景 でその前提が現在は成立しないことを確認済みだが、S-6/R-6 自体の書き換えは
  本設計書の変更対象ファイル一覧に含まれていないため、本実装計画のスコープにも含めない。
  必要であれば別途 Orchestrator 経由で追記を検討する。
