# 実装計画: price-record-edit-and-store-rename

- 前提となる設計書: `docs/designs/price-record-edit-and-store-rename.md` /
  `docs/designs/price-record-edit-and-store-rename.contract.md`
- 前提となる試験計画: `docs/tests/price-record-edit-and-store-rename.md`（**試験 ID の正典**。
  本計画は ID を引用するのみで、期待結果の詳細（データ・アサーション文言）は試験計画の該当表を
  正典として implementer が実装時に参照すること）
- 関連 ADR: `docs/decisions/ADR-0015-store-rename-for-typo-correction.md`
- レベル: L3
- 実装ルート: Orchestrator（implementer）
- 判断理由: 既定。Domain/Application/api-contract/Presentation の全層にまたがり、UI 設計判断
  （ダイアログの props 設計・エラー分岐のクライアント実装方針など、設計書が implementer 裁量に
  残した部分。設計書 §未決事項「`PriceRecordEditDialog` のコンポーネント名・ファイル配置は
  実装時に implementer が最終決定してよい」参照）が残るため、定型のボイラープレート化ができず
  Codex 委譲には向かない（`docs/06-ai-tools.md` の判断目安）。

## 【最重要】本計画の構成方針（TDD・ユーザー指示 2026-08-05）

各ステップは **Red（先に書く失敗テスト）→ Green（最小実装）→ 完了条件** の順で構成する。
Red で列挙する試験 ID は `docs/tests/price-record-edit-and-store-rename.md` の当該 ID・当該表を
正典とし、本計画はテストファイルパスと ID の対応・実装順・依存関係・完了条件を担う。
Red の時点でテストを実行し、**実装前は該当試験が失敗する（存在しない export の import エラー、
または assertion failure）ことを確認してから** Green の実装に進むこと。

---

## 変更対象ファイル一覧

### 既存ファイル変更

| #    | ファイルパス                                                                  | 変更内容                                                         |
| ---- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| E-1  | `packages/domain/src/product/product.ts`                                      | `Product.updatePriceRecord()` 追加                               |
| E-2  | `packages/domain/src/shared/store.ts`                                         | `Store.rename()` 追加、`storeName` の `readonly` を外す          |
| E-3  | `packages/application/src/product/product.dto.ts`                             | `UpdatePriceRecordInputDto` 追加                                 |
| E-4  | `packages/application/src/product/index.ts`                                   | `update-price-record.use-case` の export 追加                    |
| E-5  | `packages/application/src/store/store.dto.ts`                                 | `RenameStoreInputDto` 追加                                       |
| E-6  | `packages/application/src/store/index.ts`                                     | `rename-store.use-case` の export 追加                           |
| E-7  | `packages/application/src/store/duplicate-store-name.error.ts`                | メッセージ文言修正（Orchestrator 追加スコープ。§Step 16 参照）   |
| E-8  | `packages/api-contract/src/product.schema.ts`                                 | `updatePriceRecordSchema` 追加                                   |
| E-9  | `packages/api-contract/src/store.schema.ts`                                   | `renameStoreSchema` 追加                                         |
| E-10 | `apps/web/src/server/routes/products.ts`                                      | `.put('/:id/price-records/:priceRecordId', ...)` 追加            |
| E-11 | `apps/web/src/server/routes/stores.ts`                                        | `.put('/:id', ...)` 追加                                         |
| E-12 | `apps/web/src/app/products/[id]/_components/product-detail-client.tsx`        | 編集アイコン追加、`PriceRecordEditDialog` の描画                 |
| E-13 | `apps/web/src/app/products/[id]/_components/price-record-form.tsx`            | リネームアイコン追加、`StoreRenameDialog` の描画                 |
| E-14 | `packages/domain/tests/product/product.test.ts`                               | `D-PUR-01〜12` 追加                                              |
| E-15 | `packages/domain/tests/shared/store.test.ts`                                  | `D-SRN-01〜06` 追加                                              |
| E-16 | `packages/application/tests/product/product-use-cases.test.ts`                | `A-UPU-01〜17` 追加                                              |
| E-17 | `packages/application/tests/store/store-use-cases.test.ts`                    | `A-RSU-01〜10` 追加                                              |
| E-18 | `packages/api-contract/tests/product.schema.test.ts`                          | `Z-UPR-01〜08` 追加                                              |
| E-19 | `packages/api-contract/tests/store.schema.test.ts`                            | `Z-RSN-01〜05` 追加                                              |
| E-20 | `apps/web/tests/server/routes/products.test.ts`                               | `WH-P-09〜15` 追加、`vi.mock` に `UpdatePriceRecordUseCase` 追加 |
| E-21 | `apps/web/tests/server/routes/stores.test.ts`                                 | `WH-S-05〜11` 追加、`vi.mock` に `RenameStoreUseCase` 追加       |
| E-22 | `apps/web/tests/app/products/[id]/_components/product-detail-client.test.tsx` | `PDC-09〜12` 追加、`vi.mock('@/lib/api-client')` に `$put` 追加  |
| E-23 | `apps/web/tests/app/products/[id]/_components/price-record-form.test.tsx`     | `PRF-15〜17` 追加、`vi.mock('@/lib/api-client')` に `$put` 追加  |
| E-24 | `apps/web/tests/app/shopping-lists/_utils/price-comparison.node.test.ts`      | `PC-EDIT-01/02` 追加                                             |
| E-25 | `packages/infrastructure/tests/repositories/drizzle-store.repository.test.ts` | `IR-S-06` 追加（Should・任意）                                   |
| E-26 | `docs/05-roadmap.md`                                                          | Sprint 7 完了条件のチェック（実装完了後）                        |
| E-27 | `docs/04-domain-model.md`                                                     | §Store・§Product 集約の記述に実装との差分注記を追加              |

### 新規作成ファイル

| #   | ファイルパス                                                                     | 内容                       |
| --- | -------------------------------------------------------------------------------- | -------------------------- |
| N-1 | `packages/application/src/product/update-price-record.use-case.ts`               | `UpdatePriceRecordUseCase` |
| N-2 | `packages/application/src/store/rename-store.use-case.ts`                        | `RenameStoreUseCase`       |
| N-3 | `apps/web/src/app/products/[id]/_components/price-record-edit-dialog.tsx`        | `PriceRecordEditDialog`    |
| N-4 | `apps/web/src/app/products/[id]/_components/store-rename-dialog.tsx`             | `StoreRenameDialog`        |
| N-5 | `apps/web/tests/app/products/[id]/_components/price-record-edit-dialog.test.tsx` | `PRED-01〜10`              |
| N-6 | `apps/web/tests/app/products/[id]/_components/store-rename-dialog.test.tsx`      | `SRD-01〜13`               |

**Infrastructure・DB スキーマの変更は無い**（設計書 §論点6 の根拠どおり。両リポジトリの
`save()` はすでに既存 ID を維持した `onConflictDoUpdate` upsert を実装済み）。E-25 はテスト追加のみ。

---

## 実装順序サマリ（依存関係）

```
Step 1  Domain: Product.updatePriceRecord()          [D-PUR-01〜12]
Step 2  Domain: Store.rename()                        [D-SRN-01〜06]
  └─→ Step 3  Application: UpdatePriceRecordUseCase    [A-UPU-01〜17]
  └─→ Step 4  Application: RenameStoreUseCase          [A-RSU-01〜10]
        └─→ Step 5  api-contract: updatePriceRecordSchema  [Z-UPR-01〜08]
        └─→ Step 6  api-contract: renameStoreSchema        [Z-RSN-01〜05]
              └─→ Step 7  Presentation Hono: PUT /price-records/:priceRecordId [WH-P-09〜15]
              └─→ Step 8  Presentation Hono: PUT /stores/:id                  [WH-S-05〜11]
                    └─→ Step 9  UI: PriceRecordEditDialog（新規）  [PRED-01〜10]
                    └─→ Step 10 UI: StoreRenameDialog（新規）      [SRD-01〜13]
                          └─→ Step 11 UI: ProductDetailClient 配線 [PDC-09〜12]
                          └─→ Step 12 UI: PriceRecordForm 配線     [PRF-15〜17]
Step 13 回帰: price-comparison.node.test.ts PC-EDIT-01/02（Step 1 完了後いつでも着手可）
Step 14 Orchestrator 追加スコープ: DuplicateStoreNameError メッセージ修正（独立、いつでも可）
Step 15 Infrastructure（Should）: IR-S-06（独立、いつでも可）
Step 16 品質ゲート（全ステップ後）
Step 17 manual-browser-verify（Step 16 通過後）
```

Step 3 と Step 4 は独立（Product 系と Store 系で依存が無い）。Step 5〜8 も Product 系 / Store 系で
それぞれ独立に並行できるが、本計画は Product 系 → Store 系の順で記述する（試験計画の記載順と揃える）。

---

## 実装手順

### Step 1: Domain — `Product.updatePriceRecord()`

**Red**

試験 ID: `D-PUR-01`〜`D-PUR-12`（`docs/tests/price-record-edit-and-store-rename.md` §3-1 の表が正典）。

対象ファイル: `packages/domain/tests/product/product.test.ts`（既存ファイルに `describe('Product.updatePriceRecord', ...)` ブロックを追記）。

このステップの時点では `Product` に `updatePriceRecord` メソッドが無いため、以下のテストは
**コンパイルエラー（`updatePriceRecord` が存在しない）で失敗する**。critical 指定
（試験計画 §14-1）の `D-PUR-04` を含め、代表的なケースを示す（他ケースは試験計画の表に
正確に従い実装する）。

```typescript
describe('Product.updatePriceRecord', () => {
  const storeA = StoreId.fromString('store-1');
  const storeB = StoreId.fromString('store-2');

  function seededProduct(): Product {
    const product = createProduct();
    product.recordPrice(
      createPriceRecord('record-1', storeA, 100, new Date('2026-06-01T10:00:00.000Z'), 300),
    );
    return product;
  }

  it('D-PUR-01: 店舗のみ変更する', () => {
    const product = seededProduct();
    product.updatePriceRecord(PriceRecordId.fromString('record-1'), {
      storeId: storeB,
      price: Money.of(300, 'JPY'),
      unitPrice: Money.of(100, 'JPY'),
      packageSize: Quantity.of(3, '個'),
    });

    const updated = product.priceHistory[0];
    expect(updated.storeId.equals(storeB)).toBe(true);
    expect(updated.price.amount).toBe(300);
  });

  it('D-PUR-04: id と observedAt は編集前後で同一値である（critical）', () => {
    const product = seededProduct();
    const before = product.priceHistory[0];

    product.updatePriceRecord(PriceRecordId.fromString('record-1'), {
      storeId: storeB,
      price: Money.of(500, 'JPY'),
      unitPrice: Money.of(200, 'JPY'),
      packageSize: Quantity.of(1, 'kg'),
    });

    const after = product.priceHistory[0];
    expect(after.id.value).toBe(before.id.value);
    expect(after.observedAt.toISOString()).toBe(before.observedAt.toISOString());
  });

  it('D-PUR-05: 存在しない ID は Error を投げ、priceHistory は変化しない', () => {
    const product = seededProduct();
    expect(() =>
      product.updatePriceRecord(PriceRecordId.fromString('missing'), {
        storeId: storeB,
        price: Money.of(300, 'JPY'),
        unitPrice: Money.of(100, 'JPY'),
        packageSize: Quantity.of(3, '個'),
      }),
    ).toThrow('Price record not found: missing');
    expect(product.priceHistory).toHaveLength(1);
  });

  it('D-PUR-06: price が 0 なら Error（PriceRecord.create 由来）', () => {
    const product = seededProduct();
    expect(() =>
      product.updatePriceRecord(PriceRecordId.fromString('record-1'), {
        storeId: storeA,
        price: Money.of(0, 'JPY'),
        unitPrice: Money.of(100, 'JPY'),
        packageSize: Quantity.of(3, '個'),
      }),
    ).toThrow('Price record price must be positive');
  });
});
```

残る `D-PUR-02, 03, 07〜12` も同じ `describe` 内に追加する（内容量のみ変更・`packageSize` 0
境界・`updatedAt` の `touch()` 確認・防御的コピー・対象外レコード不変・N-05 の
「複数店舗になる/無くなる」ケースは試験計画 §3-1 表の前提・操作・期待結果をそのまま実装する）。

**Green**

対象ファイル: `packages/domain/src/product/product.ts`

`removePriceRecord()` の直後に追加する。

```typescript
/**
 * 価格記録の店舗・価格・単価・内容量を差し替える。ID と記録日時（observedAt）は
 * 元の記録から維持し、変更できない（履歴グラフ上の位置を動かさないため）。
 * PriceRecord は不変なので、新しい PriceRecord を内部で生成して配列内の該当要素を置換する。
 *
 * @throws Error 指定 ID の価格記録が存在しない場合
 * @throws Error price / unitPrice / packageSize が正数でない場合（PriceRecord.create() 由来）
 */
updatePriceRecord(
  priceRecordId: PriceRecordId,
  props: { storeId: StoreId; price: Money; unitPrice: Money; packageSize: Quantity },
): void {
  const index = this.productPriceHistory.findIndex((record) => record.id.equals(priceRecordId));
  if (index === -1) {
    throw new Error(`Price record not found: ${priceRecordId.value}`);
  }

  const original = this.productPriceHistory[index];
  const updated = PriceRecord.create({
    id: priceRecordId,
    storeId: props.storeId,
    price: props.price,
    unitPrice: props.unitPrice,
    packageSize: props.packageSize,
    observedAt: original.observedAt,
  });

  this.productPriceHistory = this.productPriceHistory.map((record, i) =>
    i === index ? updated : record,
  );
  this.touch();
}
```

`PriceRecordId` は既に `import type { PriceRecordId } from './price-record-id';` 済み（1 行目）。
追加 import は不要（`Money` は値 import 済み、`Quantity`/`StoreId` は既存の `import type` を使う）。

**完了条件**

- `D-PUR-01`〜`D-PUR-12` が全件 pass する。
- `packages/domain/tests/product/product.test.ts` の既存テスト（P1〜P22、PRR-01〜06）が
  引き続き pass する（回帰なし）。
- `pnpm --filter @cookpit/domain type-check` が通る。

---

### Step 2: Domain — `Store.rename()`

**Red**

試験 ID: `D-SRN-01`〜`D-SRN-06`（試験計画 §3-2 の表が正典）。

対象ファイル: `packages/domain/tests/shared/store.test.ts`（既存ファイルに追記）。

```typescript
describe('Store.rename', () => {
  it('D-SRN-01: 名前が差し替わる', () => {
    const store = Store.reconstruct({
      id: StoreId.fromString('store-1'),
      name: '業務スーパ',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    store.rename('業務スーパー');

    expect(store.name).toBe('業務スーパー');
  });

  it.each(['', '   '])('D-SRN-02/03: 空文字・空白のみ %j を拒否する', (name) => {
    const store = Store.create({ name: 'ライフ' });
    expect(() => store.rename(name)).toThrow('Store name is required');
    expect(store.name).toBe('ライフ');
  });

  it('D-SRN-04: id は不変', () => {
    const store = Store.create({ name: 'ライフ' });
    const before = store.id.value;
    store.rename('新名前');
    expect(store.id.value).toBe(before);
  });

  it('D-SRN-05: createdAt は不変', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const store = Store.reconstruct({
      id: StoreId.fromString('store-1'),
      name: 'ライフ',
      createdAt,
    });
    store.rename('新名前');
    expect(store.createdAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('D-SRN-06: 同じ名前で rename しても例外を投げない（冪等）', () => {
    const store = Store.create({ name: 'ライフ' });
    expect(() => store.rename('ライフ')).not.toThrow();
  });
});
```

**Green**

対象ファイル: `packages/domain/src/shared/store.ts`

```typescript
export class Store {
  private constructor(
    private readonly storeId: StoreId,
    private storeName: string, // readonly を外す
    private readonly createdDate: Date,
  ) {}

  // create() / reconstruct() / getter は変更なし

  /**
   * 店舗名を変更する。空文字列・空白のみは拒否する（create() と同じ制約）。
   * 名前の一意性検査（同名禁止・自分自身の除外）はコレクション制約のため、
   * Entity ではなく RenameStoreUseCase が担う（CreateStoreUseCase と同じ責務分担、ADR-0013）。
   */
  rename(name: string): void {
    if (name.trim() === '') {
      throw new Error('Store name is required');
    }
    this.storeName = name;
  }
}
```

変更は `private readonly storeName` → `private storeName`（コンストラクタ引数の修飾子を外す）と
`rename()` メソッドの追加のみ。`create()` / `reconstruct()` / getter は変更しない。

**完了条件**

- `D-SRN-01`〜`D-SRN-06` が全件 pass する。
- `packages/domain/tests/shared/store.test.ts` の既存テスト（S1〜S5、`normalizeStoreName` 系）が
  引き続き pass する。
- `pnpm --filter @cookpit/domain type-check` が通る。

---

### Step 3: Application — `UpdatePriceRecordUseCase`

**Red**

試験 ID: `A-UPU-01`〜`A-UPU-17`（試験計画 §4-1 の表が正典。特に critical 指定の
`A-UPU-04`（`id`/`observedAt` 直接比較）・`A-UPU-05〜08`（単位換算 4 方向）は必ず含める）。

対象ファイル: `packages/application/tests/product/product-use-cases.test.ts`（既存ファイルに
`describe('UpdatePriceRecordUseCase', ...)` を追記。既存の `InMemoryProductRepository` /
`InMemoryStoreRepository` / `seededStore` / `seededProduct` / `seededPriceRecord` ヘルパーを再利用する）。

この時点では `UpdatePriceRecordUseCase` が存在しないため import エラーで失敗する。

```typescript
import { UpdatePriceRecordUseCase } from '../../src/product/update-price-record.use-case';
// ...
import type { UpdatePriceRecordInputDto } from '../../src/product/product.dto';

describe('UpdatePriceRecordUseCase', () => {
  const baseInput: UpdatePriceRecordInputDto = {
    productId: 'product-1',
    priceRecordId: 'record-1',
    storeId: 'store-b',
    priceAmount: 300,
    packageSizeValue: 3,
    packageSizeUnit: '個',
  };

  function seedBase(): void {
    storeRepository.seed(seededStore('store-a', '西友'));
    storeRepository.seed(seededStore('store-b', 'ライフ'));
    productRepository.seed(
      seededProduct('product-1', '玉ねぎ', [
        seededPriceRecord(
          'record-1',
          StoreId.fromString('store-a'),
          300,
          100,
          new Date('2026-06-01T10:00:00.000Z'),
        ),
      ]),
    );
  }

  it('A-UPU-01: 店舗のみ変更する', async () => {
    seedBase();

    const dto = await new UpdatePriceRecordUseCase(productRepository, storeRepository).execute({
      ...baseInput,
      priceAmount: 300,
      packageSizeValue: 3,
      packageSizeUnit: '個',
    });

    expect(dto.priceHistory[0]?.storeId).toBe('store-b');
    expect(dto.priceHistory[0]?.storeName).toBe('ライフ');
    expect(dto.priceHistory[0]?.priceAmount).toBe(300);
  });

  it('A-UPU-04: id と observedAt は編集前後で同一値である（critical）', async () => {
    seedBase();
    const before = (await productRepository.findById(ProductId.fromString('product-1')))
      ?.priceHistory[0];

    const dto = await new UpdatePriceRecordUseCase(productRepository, storeRepository).execute(
      baseInput,
    );

    expect(dto.priceHistory[0]?.id).toBe(before?.id.value);
    expect(dto.priceHistory[0]?.observedAt).toBe(before?.observedAt.toISOString());
  });

  it.each([
    [
      'kg→g',
      {
        priceAmount: 1000,
        from: { value: 1, unit: 'kg' as const },
        to: { value: 500, unit: 'g' as const },
      },
      200,
    ],
    [
      'g→kg',
      {
        priceAmount: 200,
        from: { value: 200, unit: 'g' as const },
        to: { value: 2, unit: 'kg' as const },
      },
      10,
    ],
    [
      'l→ml',
      {
        priceAmount: 180,
        from: { value: 2, unit: 'l' as const },
        to: { value: 900, unit: 'ml' as const },
      },
      20,
    ],
    [
      'ml→l',
      {
        priceAmount: 250,
        from: { value: 500, unit: 'ml' as const },
        to: { value: 2.5, unit: 'l' as const },
      },
      10,
    ],
  ])(
    'A-UPU-05〜08: 単位換算 %s 方向で単価が再計算される（critical）',
    async (_label, fixture, expected) => {
      storeRepository.seed(seededStore('store-a', '西友'));
      productRepository.seed(
        seededProduct('product-1', '玉ねぎ', [
          seededPriceRecord(
            'record-1',
            StoreId.fromString('store-a'),
            fixture.priceAmount,
            100,
            new Date('2026-06-01T10:00:00.000Z'),
          ),
        ]),
      );

      const dto = await new UpdatePriceRecordUseCase(productRepository, storeRepository).execute({
        productId: 'product-1',
        priceRecordId: 'record-1',
        storeId: 'store-a',
        priceAmount: fixture.priceAmount,
        packageSizeValue: fixture.to.value,
        packageSizeUnit: fixture.to.unit,
      });

      expect(dto.priceHistory[0]?.unitPriceAmount).toBe(expected);
    },
  );

  it('A-UPU-09: 商品が存在しなければ ProductNotFoundError を投げ、保存しない', async () => {
    await expect(
      new UpdatePriceRecordUseCase(productRepository, storeRepository).execute(baseInput),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(productRepository.saveCount).toBe(0);
  });

  it('A-UPU-10: 価格記録が存在しなければ PriceRecordNotFoundError を投げ、保存しない', async () => {
    storeRepository.seed(seededStore('store-b', 'ライフ'));
    productRepository.seed(seededProduct('product-1'));

    await expect(
      new UpdatePriceRecordUseCase(productRepository, storeRepository).execute(baseInput),
    ).rejects.toBeInstanceOf(PriceRecordNotFoundError);
    expect(productRepository.saveCount).toBe(0);
  });

  it('A-UPU-11: 店舗が存在しなければ StoreNotFoundError を投げ、保存しない', async () => {
    productRepository.seed(
      seededProduct('product-1', '玉ねぎ', [
        seededPriceRecord('record-1', StoreId.fromString('store-a'), 300, 100, new Date()),
      ]),
    );

    await expect(
      new UpdatePriceRecordUseCase(productRepository, storeRepository).execute(baseInput),
    ).rejects.toBeInstanceOf(StoreNotFoundError);
    expect(productRepository.saveCount).toBe(0);
  });
});
```

残り（`A-UPU-02, 03, 12〜17`）は試験計画 §4-1 表のとおりに追加する。`PriceRecordNotFoundError` の
import が必要（既に E-16 の diff でファイル先頭に追加する）。

**Green**

対象ファイル（新規）: `packages/application/src/product/update-price-record.use-case.ts`

```typescript
import {
  Money,
  PriceRecordId,
  ProductId,
  Quantity,
  StoreId,
  UnitPriceCalculator,
} from '@cookpit/domain';
import type { ProductRepository, StoreRepository } from '@cookpit/domain';
import type { ProductDto, UpdatePriceRecordInputDto } from './product.dto';
import { PriceRecordNotFoundError } from './price-record-not-found.error';
import { toProductDto, toStoreNameMap } from './product.mapper';
import { ProductNotFoundError } from './product-not-found.error';
import { StoreNotFoundError } from '../store/store-not-found.error';

/**
 * 価格記録の店舗・価格・内容量を編集する。記録日時（observedAt）と ID は元の値を維持し、
 * 変更できない（要件定義書 D-1・D-3）。単価は UnitPriceCalculator で再計算する。
 */
export class UpdatePriceRecordUseCase {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly storeRepository: StoreRepository,
  ) {}

  /**
   * @throws ProductNotFoundError 商品が存在しない場合
   * @throws PriceRecordNotFoundError 商品にその価格記録が無い場合
   * @throws StoreNotFoundError 指定した店舗が存在しない場合
   */
  async execute(input: UpdatePriceRecordInputDto): Promise<ProductDto> {
    const productId = ProductId.fromString(input.productId);
    const product = await this.productRepository.findById(productId);
    if (product === null) {
      throw new ProductNotFoundError(input.productId);
    }

    const priceRecordId = PriceRecordId.fromString(input.priceRecordId);
    const exists = product.priceHistory.some((record) => record.id.equals(priceRecordId));
    if (!exists) {
      throw new PriceRecordNotFoundError(input.priceRecordId);
    }

    const storeId = StoreId.fromString(input.storeId);
    const store = await this.storeRepository.findById(storeId);
    if (store === null) {
      throw new StoreNotFoundError(input.storeId);
    }

    const price = Money.of(input.priceAmount, 'JPY');
    const packageSize = Quantity.of(input.packageSizeValue, input.packageSizeUnit);
    const unitPrice = UnitPriceCalculator.calculate(price, packageSize);

    product.updatePriceRecord(priceRecordId, { storeId, price, unitPrice, packageSize });
    await this.productRepository.save(product);

    const stores = await this.storeRepository.findAll();
    return toProductDto(product, toStoreNameMap(stores));
  }
}
```

対象ファイル: `packages/application/src/product/product.dto.ts`

`RecordPriceInputDto` の直後に追加する。

```typescript
export interface UpdatePriceRecordInputDto {
  productId: string;
  priceRecordId: string;
  storeId: string;
  priceAmount: number;
  packageSizeValue: number;
  packageSizeUnit: Unit;
}
```

対象ファイル: `packages/application/src/product/index.ts`

```typescript
export * from './update-price-record.use-case';
```

（既存の `export * from './record-price.use-case';` の直後に追加する。）

**完了条件**

- `A-UPU-01`〜`A-UPU-17` が全件 pass する。
- 既存の `RecordPriceUseCase`・`DeletePriceRecordUseCase` 系テストが引き続き pass する。
- `packages/application/src/index.ts` は無変更で `UpdatePriceRecordUseCase` が
  `@cookpit/application` から import できる（`export * from './product'` 経由）。
  `pnpm --filter @cookpit/application type-check` で確認する。

---

### Step 4: Application — `RenameStoreUseCase`

**Red**

試験 ID: `A-RSU-01`〜`A-RSU-10`（試験計画 §4-2 の表が正典）。

対象ファイル: `packages/application/tests/store/store-use-cases.test.ts`（既存ファイルに
`describe('RenameStoreUseCase', ...)` を追記。既存の `InMemoryStoreRepository` / `seededStore` を再利用）。

```typescript
import { RenameStoreUseCase } from '../../src/store/rename-store.use-case';

describe('RenameStoreUseCase', () => {
  it('A-RSU-01: 名前が変わる', async () => {
    repository.seed(seededStore('id-1', '業務スーパ'));

    const dto = await new RenameStoreUseCase(repository).execute({
      id: 'id-1',
      name: '業務スーパー',
    });

    expect(dto.name).toBe('業務スーパー');
    expect(repository.saveCount).toBe(1);
  });

  it('A-RSU-02: 同じ文字列のまま保存し直しても成功する（N-08・冪等）', async () => {
    repository.seed(seededStore('id-1', 'ライフ'));

    await expect(
      new RenameStoreUseCase(repository).execute({ id: 'id-1', name: 'ライフ' }),
    ).resolves.toMatchObject({ name: 'ライフ' });
  });

  it('A-RSU-03: 大文字小文字だけ変える（N-07/B-04）', async () => {
    repository.seed(seededStore('id-1', 'Life'));

    await expect(
      new RenameStoreUseCase(repository).execute({ id: 'id-1', name: 'life' }),
    ).resolves.toMatchObject({ name: 'life' });
  });

  it('A-RSU-05: 全角/半角違いが自分以外の既存店舗と一致すると DuplicateStoreNameError', async () => {
    repository.seed(seededStore('id-1', '業務スーパー'));
    repository.seed(seededStore('id-2', 'コンビニ'));

    await expect(
      new RenameStoreUseCase(repository).execute({ id: 'id-2', name: '業務ｽｰﾊﾟｰ' }),
    ).rejects.toBeInstanceOf(DuplicateStoreNameError);
    expect(repository.saveCount).toBe(0);
  });

  it('A-RSU-08: 店舗が存在しなければ StoreNotFoundError を投げる', async () => {
    await expect(
      new RenameStoreUseCase(repository).execute({ id: 'missing', name: 'ライフ' }),
    ).rejects.toBeInstanceOf(StoreNotFoundError);
    expect(repository.saveCount).toBe(0);
  });

  it('A-RSU-10: リネームは店舗件数に影響しない（B-07）', async () => {
    seedStores(repository, STORE_LIMIT);
    const target = (await repository.findAll())[0];

    await new RenameStoreUseCase(repository).execute({ id: target.id.value, name: '新名前' });

    expect((await repository.findAll()).length).toBe(STORE_LIMIT);
  });
});
```

残り（`A-RSU-04, 06, 07, 09`）は試験計画 §4-2 表・§12-3 の同名チェック自己衝突除外データを
そのまま実装する。

**Green**

対象ファイル（新規）: `packages/application/src/store/rename-store.use-case.ts`

```typescript
import { normalizeStoreName, StoreId } from '@cookpit/domain';
import type { StoreRepository } from '@cookpit/domain';
import { DuplicateStoreNameError } from './duplicate-store-name.error';
import { StoreNotFoundError } from './store-not-found.error';
import type { RenameStoreInputDto, StoreDto } from './store.dto';
import { toStoreDto } from './store.mapper';

/**
 * 店舗名を変更する。誤字訂正が目的で、重複店舗の統合（マージ）はスコープ外
 * （ADR-0015。マージには価格記録の storeId 付け替えが必要で、リネームだけでは重複は解消しない）。
 */
export class RenameStoreUseCase {
  constructor(private readonly storeRepository: StoreRepository) {}

  /**
   * @throws StoreNotFoundError 店舗が存在しない場合
   * @throws DuplicateStoreNameError 正規化後の名前が「自分以外の」既存店舗と一致する場合
   */
  async execute(input: RenameStoreInputDto): Promise<StoreDto> {
    const storeId = StoreId.fromString(input.id);
    const store = await this.storeRepository.findById(storeId);
    if (store === null) {
      throw new StoreNotFoundError(input.id);
    }

    const normalizedName = normalizeStoreName(input.name);
    const duplicate = await this.storeRepository.findByNormalizedName(normalizedName);
    // 自分自身がヒットした場合は衝突として扱わない（同じ名前で保存し直す・
    // 大文字小文字だけ変える等の正当なリネームを通す）。
    if (duplicate !== null && !duplicate.id.equals(storeId)) {
      throw new DuplicateStoreNameError(input.name);
    }

    store.rename(input.name);
    await this.storeRepository.save(store);
    return toStoreDto(store);
  }
}
```

対象ファイル: `packages/application/src/store/store.dto.ts`

```typescript
export interface RenameStoreInputDto {
  id: string;
  name: string;
}
```

対象ファイル: `packages/application/src/store/index.ts`

```typescript
export * from './rename-store.use-case';
```

**完了条件**

- `A-RSU-01`〜`A-RSU-10` が全件 pass する。
- 既存の `CreateStoreUseCase`・`DeleteStoreUseCase`・`GetStoreUsageUseCase` 系テストが引き続き pass する。
- `pnpm --filter @cookpit/application type-check` が通る。

---

### Step 5: api-contract — `updatePriceRecordSchema`

**Red**

試験 ID: `Z-UPR-01`〜`Z-UPR-08`（契約設計書 §9.1・試験計画 §5-1 の表が正典）。

対象ファイル: `packages/api-contract/tests/product.schema.test.ts`（既存ファイルに追記。
`recordPriceSchema` の `describe` ブロックの直後に追加する）。

```typescript
import { recordPriceSchema, updatePriceRecordSchema } from '../src/product.schema';

describe('updatePriceRecordSchema', () => {
  const VALID_UPDATE = {
    storeId: VALID_STORE_ID,
    priceAmount: 148,
    packageSizeValue: 1,
    packageSizeUnit: '個',
  };

  it('Z-UPR-01: 正常な入力を受け入れる', () => {
    expect(updatePriceRecordSchema.parse(VALID_UPDATE)).toEqual(VALID_UPDATE);
  });

  it('Z-UPR-02: 不正な storeId を reject する', () => {
    expect(() =>
      updatePriceRecordSchema.parse({ ...VALID_UPDATE, storeId: 'not-a-uuid' }),
    ).toThrow();
  });

  it.each([0, -1])('Z-UPR-03/04: priceAmount が %d の入力を reject する', (priceAmount) => {
    expect(() => updatePriceRecordSchema.parse({ ...VALID_UPDATE, priceAmount })).toThrow();
  });

  it.each([0, -1])(
    'Z-UPR-05/06: packageSizeValue が %d の入力を reject する',
    (packageSizeValue) => {
      expect(() => updatePriceRecordSchema.parse({ ...VALID_UPDATE, packageSizeValue })).toThrow();
    },
  );

  it('Z-UPR-07: packageSizeUnit の自由入力を受け入れ、空文字は reject する', () => {
    expect(
      updatePriceRecordSchema.parse({ ...VALID_UPDATE, packageSizeUnit: '箱' }).packageSizeUnit,
    ).toBe('箱');
    expect(() => updatePriceRecordSchema.parse({ ...VALID_UPDATE, packageSizeUnit: '' })).toThrow();
  });

  it('Z-UPR-08: recordPriceSchema とは独立したスキーマである（退行防止）', () => {
    // 現時点ではキー集合が一致するが、片方だけ変更しても他方は影響を受けない
    // （契約設計書 §2.1 の「複製する」判断が誤って同一参照へ統合されないことの記録目的）。
    expect(Object.keys(updatePriceRecordSchema.shape).sort()).toEqual(
      Object.keys(recordPriceSchema.shape).sort(),
    );
    expect(updatePriceRecordSchema).not.toBe(recordPriceSchema);
  });
});
```

**Green**

対象ファイル: `packages/api-contract/src/product.schema.ts`

`recordPriceSchema`（既存 33-38 行目）の直後、`priceRecordIdParamSchema` の前に追加する。

```typescript
// 価格記録更新リクエストボディ。recordPriceSchema と同形だが、意図的に別スキーマとして
// 複製する（契約設計書 §2.1: createProductSchema/updateProductSchema の前例と同じ判断）。
// id・priceRecordId は URL param（priceRecordIdParamSchema）由来のため body に含めない。
// observedAt は編集対象外（D-1）のためフィールド自体が存在しない。
export const updatePriceRecordSchema = z.object({
  storeId: z.uuid(),
  priceAmount: z.number().positive(),
  packageSizeValue: z.number().positive(),
  packageSizeUnit: unitSchema,
});

export type UpdatePriceRecordBody = z.infer<typeof updatePriceRecordSchema>;
```

ファイル末尾の型エクスポート一覧にも `UpdatePriceRecordBody` を追加する（既存の
`RecordPriceBody` の直後）。

**完了条件**

- `Z-UPR-01`〜`Z-UPR-08` が全件 pass する。
- 既存の `recordPriceSchema` 系テストが無変更のまま pass する。
- `packages/api-contract/src/index.ts` は無変更で `updatePriceRecordSchema` /
  `UpdatePriceRecordBody` が `@cookpit/api-contract` から import できる。

---

### Step 6: api-contract — `renameStoreSchema`

**Red**

試験 ID: `Z-RSN-01`〜`Z-RSN-05`（契約設計書 §9.2・試験計画 §5-2 の表が正典）。

対象ファイル: `packages/api-contract/tests/store.schema.test.ts`（既存ファイルに追記。
`createStoreSchema` の `describe` ブロックの直後に追加する）。

```typescript
import { createStoreSchema, renameStoreSchema } from '../src/store.schema';

describe('renameStoreSchema', () => {
  it('Z-RSN-01: 正常な name を受け入れる', () => {
    expect(renameStoreSchema.parse({ name: 'スーパーA' })).toEqual({ name: 'スーパーA' });
  });

  it.each(['', '   '])('Z-RSN-02: 空白の name %j を reject する', (name) => {
    expect(() => renameStoreSchema.parse({ name })).toThrow();
  });

  it('Z-RSN-03: 255 文字の name を受け入れる', () => {
    const name = 'あ'.repeat(255);
    expect(renameStoreSchema.parse({ name })).toEqual({ name });
  });

  it('Z-RSN-04: 256 文字の name を reject する', () => {
    expect(() => renameStoreSchema.parse({ name: 'あ'.repeat(256) })).toThrow();
  });

  it('Z-RSN-05: name キーの省略を reject する', () => {
    expect(() => renameStoreSchema.parse({})).toThrow();
  });
});
```

**Green**

対象ファイル: `packages/api-contract/src/store.schema.ts`

`createStoreSchema`（既存 8-10 行目）の直後に追加する。

```typescript
// 店舗リネームリクエストボディ。createStoreSchema と同形だが、意図的に別スキーマとして
// 新設する（契約設計書 §2.2）。id は URL param（idParamSchema）由来のため body に含めない。
export const renameStoreSchema = z.object({
  name: nonBlankString,
});

export type RenameStoreBody = z.infer<typeof renameStoreSchema>;
```

**完了条件**

- `Z-RSN-01`〜`Z-RSN-05` が全件 pass する。
- 既存の `createStoreSchema` 系テストが無変更のまま pass する。

---

### Step 7: Presentation（Hono）— `PUT /api/products/:id/price-records/:priceRecordId`

**Red**

試験 ID: `WH-P-09`〜`WH-P-15`（契約設計書 §9.3・試験計画 §6-1 の表が正典）。

対象ファイル: `apps/web/tests/server/routes/products.test.ts`（既存ファイルに追記）。

まず既存の `vi.mock('@cookpit/application', ...)` の返り値オブジェクトに
`UpdatePriceRecordUseCase: vi.fn(),` を追加し、`import` 文にも `UpdatePriceRecordUseCase` を追加する。
既存の `vi.mock` を壊さないよう、追記のみで既存キーは変更しない。

```typescript
import { UpdatePriceRecordUseCase } from '@cookpit/application';
// ...
vi.mock('@cookpit/application', async (importOriginal) => {
  const actual = await importOriginal<typeof ApplicationModule>();
  return {
    ...actual,
    GetProductsUseCase: vi.fn(),
    CreateProductUseCase: vi.fn(),
    GetProductUseCase: vi.fn(),
    DeleteProductUseCase: vi.fn(),
    DeletePriceRecordUseCase: vi.fn(),
    UpdatePriceRecordUseCase: vi.fn(),
  };
});

// ... describe('productsRoute', ...) 内に追記
it('WH-P-09: PUT /price-records/:priceRecordId は 200 で UseCase の返却値を返す', async () => {
  const execute = vi.fn().mockResolvedValue(productDto);
  vi.mocked(UpdatePriceRecordUseCase).mockImplementation(function () {
    return { execute } as unknown as UpdatePriceRecordUseCase;
  });
  const body = {
    storeId: '11111111-1111-4111-8111-111111111111',
    priceAmount: 148,
    packageSizeValue: 1,
    packageSizeUnit: '個',
  };

  const res = await app.request(`/api/products/${PRODUCT_ID}/price-records/${PRICE_RECORD_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(productDto);
  expect(execute).toHaveBeenCalledWith({
    productId: PRODUCT_ID,
    priceRecordId: PRICE_RECORD_ID,
    ...body,
  });
});

it('WH-P-10: ProductNotFoundError 時に 404 を返す', async () => {
  const execute = vi.fn().mockRejectedValue(new ProductNotFoundError(PRODUCT_ID));
  vi.mocked(UpdatePriceRecordUseCase).mockImplementation(function () {
    return { execute } as unknown as UpdatePriceRecordUseCase;
  });

  const res = await app.request(`/api/products/${PRODUCT_ID}/price-records/${PRICE_RECORD_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: '11111111-1111-4111-8111-111111111111',
      priceAmount: 148,
      packageSizeValue: 1,
      packageSizeUnit: '個',
    }),
  });

  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: `Product not found: ${PRODUCT_ID}` });
});

it('WH-P-13: priceAmount が 0 なら 400 を返し、execute は呼ばれない', async () => {
  const execute = vi.fn();
  vi.mocked(UpdatePriceRecordUseCase).mockImplementation(function () {
    return { execute } as unknown as UpdatePriceRecordUseCase;
  });

  const res = await app.request(`/api/products/${PRODUCT_ID}/price-records/${PRICE_RECORD_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storeId: '11111111-1111-4111-8111-111111111111',
      priceAmount: 0,
      packageSizeValue: 1,
      packageSizeUnit: '個',
    }),
  });

  expect(res.status).toBe(400);
  expect(execute).not.toHaveBeenCalled();
});
```

`WH-P-11`（`PriceRecordNotFoundError`）・`WH-P-12`（`StoreNotFoundError`）・`WH-P-14`
（`priceRecordId` が UUID でない）・`WH-P-15`（同一ボディで 2 回連続 PUT）は上記と同じ形で
試験計画 §6-1 表のとおりに追加する。

**Green**

対象ファイル: `apps/web/src/server/routes/products.ts`

import に `updatePriceRecordSchema` と `UpdatePriceRecordUseCase` を追加し、
`.post('/:id/price-records', ...)` の直後・`.delete('/:id/price-records/:priceRecordId', ...)` の
前に追加する。

```typescript
import {
  createProductSchema,
  idParamSchema,
  priceRecordIdParamSchema,
  recordPriceSchema,
  updateProductSchema,
  updatePriceRecordSchema,
} from '@cookpit/api-contract';
import {
  CreateProductUseCase,
  DeletePriceRecordUseCase,
  DeleteProductUseCase,
  GetCheapestStoreUseCase,
  GetProductUseCase,
  GetProductsUseCase,
  RecordPriceUseCase,
  UpdatePriceRecordUseCase,
  UpdateProductUseCase,
} from '@cookpit/application';
```

```typescript
  .put(
    '/:id/price-records/:priceRecordId',
    zValidator('param', priceRecordIdParamSchema),
    zValidator('json', updatePriceRecordSchema),
    async (c) => {
      const { id, priceRecordId } = c.req.valid('param');
      const body = c.req.valid('json');
      const usecase = new UpdatePriceRecordUseCase(productRepository(), storeRepository());
      const product = await usecase.execute({ productId: id, priceRecordId, ...body });
      return c.json(product);
    },
  )
```

**完了条件**

- `WH-P-09`〜`WH-P-15` が全件 pass する。
- 既存の `WH-P-01`〜`WH-P-08` が無変更のまま pass する。
- `app.ts` は無変更のまま `ProductNotFoundError` / `PriceRecordNotFoundError` /
  `StoreNotFoundError` がすべて既存の `NotFoundError` 基底経由で 404 になる。

---

### Step 8: Presentation（Hono）— `PUT /api/stores/:id`

**Red**

試験 ID: `WH-S-05`〜`WH-S-11`（契約設計書 §9.3・試験計画 §6-2 の表が正典）。

対象ファイル: `apps/web/tests/server/routes/stores.test.ts`（既存ファイルに追記）。

`vi.mock('@cookpit/application', ...)` の返り値オブジェクトに `RenameStoreUseCase: vi.fn(),` を
追加し、import 文にも `RenameStoreUseCase` を追加する。

```typescript
it('WH-S-05: PUT /api/stores/:id は 200 で UseCase の返却値を返す', async () => {
  const execute = vi.fn().mockResolvedValue(storeDto);
  vi.mocked(RenameStoreUseCase).mockImplementation(function () {
    return { execute } as unknown as RenameStoreUseCase;
  });

  const res = await app.request(`/api/stores/${STORE_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '西友 高円寺店' }),
  });

  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(storeDto);
  expect(execute).toHaveBeenCalledWith({ id: STORE_ID, name: '西友 高円寺店' });
});

it('WH-S-07: DuplicateStoreNameError 時に 422 を返す', async () => {
  const execute = vi.fn().mockRejectedValue(new DuplicateStoreNameError('西友'));
  vi.mocked(RenameStoreUseCase).mockImplementation(function () {
    return { execute } as unknown as RenameStoreUseCase;
  });

  const res = await app.request(`/api/stores/${STORE_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '西友' }),
  });

  expect(res.status).toBe(422);
});

it('WH-S-10: 同一 name で 2 回連続 PUT しても両方 200（N-08）', async () => {
  const execute = vi.fn().mockResolvedValue(storeDto);
  vi.mocked(RenameStoreUseCase).mockImplementation(function () {
    return { execute } as unknown as RenameStoreUseCase;
  });

  for (let i = 0; i < 2; i += 1) {
    const res = await app.request(`/api/stores/${STORE_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '西友' }),
    });
    expect(res.status).toBe(200);
  }
  expect(execute).toHaveBeenCalledTimes(2);
});
```

`WH-S-06`（`StoreNotFoundError`）・`WH-S-08`（name 空文字）・`WH-S-09`（id が UUID でない）・
`WH-S-11`（大文字小文字だけ変えた name で 200）は試験計画 §6-2 表のとおりに追加する。

**Green**

対象ファイル: `apps/web/src/server/routes/stores.ts`

```typescript
import { createStoreSchema, idParamSchema, renameStoreSchema } from '@cookpit/api-contract';
import {
  CreateStoreUseCase,
  DeleteStoreUseCase,
  GetStoresUseCase,
  GetStoreUsageUseCase,
  RenameStoreUseCase,
} from '@cookpit/application';
```

```typescript
export const storesRoute = new Hono()
  .get('/', async (c) => {
    /* 既存のまま */
  })
  .post('/', zValidator('json', createStoreSchema), async (c) => {
    /* 既存のまま */
  })
  .put(
    '/:id',
    zValidator('param', idParamSchema),
    zValidator('json', renameStoreSchema),
    async (c) => {
      const { id } = c.req.valid('param');
      const body = c.req.valid('json');
      const usecase = new RenameStoreUseCase(storeRepository());
      const store = await usecase.execute({ id, ...body });
      return c.json(store);
    },
  )
  .get('/:id/usage', zValidator('param', idParamSchema), async (c) => {
    /* 既存のまま */
  })
  .delete('/:id', zValidator('param', idParamSchema), async (c) => {
    /* 既存のまま */
  });
```

（`.put('/:id', ...)` を `.post('/', ...)` の直後・`.get('/:id/usage', ...)` の前に挿入する。）

**完了条件**

- `WH-S-05`〜`WH-S-11` が全件 pass する。
- 既存の `WH-S-01`〜`WH-S-04`・`WH-01`〜`WH-06` が無変更のまま pass する。

---

### Step 9: Presentation（UI）— `PriceRecordEditDialog`（新規）

**設計メモ（implementer 裁量の確定事項）**: 設計書 §未決事項は本コンポーネントの props 設計を
implementer に委ねている。本計画では次のとおり確定する（試験計画の期待結果と整合させるため）。

- Props: `{ product: ProductDto; record: PriceRecordDto | null; onOpenChange: (open: boolean) => void }`。
  `record` が `null` のとき非表示（`open = record !== null`）。呼び出し側（`ProductDetailClient`）が
  `editingRecord: PriceRecordDto | null` の state を持ち、そのまま `record` に渡す。
  既存の `pendingDeleteRecord` パターン（`product-detail-client.tsx` 278-318 行目）と同じ設計に揃える。
- 404 のうち `PriceRecordNotFoundError` と `StoreNotFoundError` はどちらも HTTP ステータスが 404 で
  区別できないため、レスポンスボディの `error` 文言の接頭辞（`'PriceRecord not found'` /
  `'Store not found'`）で判定する（契約設計書 §7.1 のサンプルペイロードに準拠）。

**Red**

試験 ID: `PRED-01`〜`PRED-10`（試験計画 §8-1 の表が正典）。

対象ファイル（新規）: `apps/web/tests/app/products/[id]/_components/price-record-edit-dialog.test.tsx`

`price-record-form.test.tsx` の `vi.mock('@/lib/api-client')` パターンを踏襲する。

```typescript
import type { PriceRecordDto, ProductDto, StoreDto } from '@cookpit/application';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getStores, putPriceRecord, refresh } = vi.hoisted(() => ({
  getStores: vi.fn(),
  putPriceRecord: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      stores: { $get: (...args: unknown[]) => getStores(...args) },
      products: {
        ':id': {
          'price-records': {
            ':priceRecordId': { $put: (...args: unknown[]) => putPriceRecord(...args) },
          },
        },
      },
    },
  },
}));

import { PriceRecordEditDialog } from '../../../../../src/app/products/[id]/_components/price-record-edit-dialog';

const STORES: StoreDto[] = [
  { id: 'store-a', name: '店舗A', createdAt: '2026-06-01T00:00:00.000Z' },
  { id: 'store-b', name: '店舗B', createdAt: '2026-06-02T00:00:00.000Z' },
];

function createProductDto(overrides: Partial<ProductDto> = {}): ProductDto {
  return {
    id: 'product-1', name: '玉ねぎ', aliases: [], category: '野菜', defaultUnit: '個',
    priceHistory: [], createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function createRecord(overrides: Partial<PriceRecordDto> = {}): PriceRecordDto {
  return {
    id: 'record-1', storeId: 'store-a', storeName: '店舗A', priceAmount: 298,
    unitPriceAmount: 99.3, packageSizeValue: 3, packageSizeUnit: '個',
    observedAt: '2026-06-01T09:00:00.000Z', ...overrides,
  };
}

describe('PriceRecordEditDialog', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('PRED-01: 初期値が表示される', async () => {
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    render(
      <PriceRecordEditDialog
        product={createProductDto()}
        record={createRecord()}
        onOpenChange={vi.fn()}
      />,
    );

    expect(await screen.findByText('店舗A')).toBeDefined();
    expect((screen.getByLabelText('価格') as HTMLInputElement).value).toBe('298');
    expect((screen.getByLabelText('内容量', { exact: false }) as HTMLInputElement).value).toBe('3個');
  });

  it('PRED-03: 保存で PUT が正しいボディで呼ばれる（observedAt を含まない）', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    putPriceRecord.mockResolvedValue({ ok: true });
    render(
      <PriceRecordEditDialog
        product={createProductDto()}
        record={createRecord()}
        onOpenChange={vi.fn()}
      />,
    );
    await screen.findByText('店舗A');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(putPriceRecord).toHaveBeenCalledWith({
        param: { id: 'product-1', priceRecordId: 'record-1' },
        json: { storeId: 'store-a', priceAmount: 298, packageSizeValue: 3, packageSizeUnit: '個' },
      });
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('PRED-08: 通信エラーではダイアログを閉じずフォームの入力値を保持する', async () => {
    const user = userEvent.setup();
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    putPriceRecord.mockRejectedValue(new Error('network'));
    const onOpenChange = vi.fn();
    render(
      <PriceRecordEditDialog product={createProductDto()} record={createRecord()} onOpenChange={onOpenChange} />,
    );
    await screen.findByText('店舗A');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('通信エラーが発生しました。')).toBeDefined();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect((screen.getByLabelText('価格') as HTMLInputElement).value).toBe('298');
  });

  it('PRED-10: 記録日時の入力欄が無い（B-06）', async () => {
    getStores.mockResolvedValue({ ok: true, json: async () => STORES });
    render(
      <PriceRecordEditDialog product={createProductDto()} record={createRecord()} onOpenChange={vi.fn()} />,
    );
    await screen.findByText('店舗A');

    expect(screen.queryByLabelText(/記録日時/)).toBeNull();
  });
});
```

`PRED-02, 04〜07, 09` は試験計画 §8-1 表のとおりに追加する（`PRED-05`/`PRED-06` は
`putPriceRecord.mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'PriceRecord not found: record-1' }) })`
のように、レスポンスボディの文言でシナリオを作り分ける）。

**Green**

対象ファイル（新規）: `apps/web/src/app/products/[id]/_components/price-record-edit-dialog.tsx`

```typescript
'use client';

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuantityField } from '@/components/ui/quantity-field';
import { SelectField, type SelectFieldOption } from '@/components/ui/select-field';
import { packageSizeExample } from '@/app/products/_utils/package-size-example';
import { client } from '@/lib/api-client';
import { parseQuantity } from '@/lib/parse-quantity';
import type { UpdatePriceRecordBody } from '@cookpit/api-contract';
import type { PriceRecordDto, ProductDto, StoreDto } from '@cookpit/application';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useId, useState } from 'react';

interface Props {
  product: ProductDto;
  record: PriceRecordDto | null;
  onOpenChange: (open: boolean) => void;
}

interface FieldErrors {
  storeId: string | null;
  priceAmount: string | null;
  packageSizeValue: string | null;
}

function emptyFieldErrors(): FieldErrors {
  return { storeId: null, priceAmount: null, packageSizeValue: null };
}

export function PriceRecordEditDialog({ product, record, onOpenChange }: Props) {
  const router = useRouter();
  const storeIdId = useId();
  const priceAmountId = useId();
  const packageSizeId = useId();

  const [stores, setStores] = useState<StoreDto[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [packageSize, setPackageSize] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(emptyFieldErrors);

  const open = record !== null;
  const sizeExample = packageSizeExample(product.defaultUnit);
  const parsedPackageSize = parseQuantity(packageSize);
  const canSubmit =
    storeId !== '' &&
    priceAmount.trim() !== '' &&
    parsedPackageSize.kind === 'amount' &&
    parsedPackageSize.value > 0 &&
    !submitting;
  const storeOptions: SelectFieldOption[] = [
    { value: '', label: storesLoading ? '読み込み中' : '店舗を選択', disabled: true },
    ...stores.map((store) => ({ value: store.id, label: store.name })),
  ];

  useEffect(() => {
    if (record === null) {
      return;
    }
    setStoreId(record.storeId);
    setPriceAmount(String(record.priceAmount));
    setPackageSize(`${record.packageSizeValue}${record.packageSizeUnit}`);
    setErrorMessage(null);
    setFieldErrors(emptyFieldErrors());

    let cancelled = false;
    async function loadStores(): Promise<void> {
      setStoresLoading(true);
      try {
        const response = await client.api.stores.$get();
        if (response.ok && !cancelled) {
          setStores(await response.json());
        }
      } finally {
        if (!cancelled) {
          setStoresLoading(false);
        }
      }
    }
    void loadStores();
    return () => {
      cancelled = true;
    };
    // record.id が変わったときだけ再取得すればよい（同じ記録の再描画では走らせない）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  function buildBody(): UpdatePriceRecordBody | null {
    const errors = emptyFieldErrors();
    const parsedPriceAmount = Number(priceAmount.trim());
    const parsedSize = parseQuantity(packageSize);

    if (storeId === '') {
      errors.storeId = '店舗を選択してください。';
    }
    if (!Number.isFinite(parsedPriceAmount) || parsedPriceAmount <= 0) {
      errors.priceAmount = '価格は1円以上の数値で入力してください。';
    }
    if (parsedSize.kind !== 'amount' || parsedSize.value <= 0) {
      errors.packageSizeValue = `内容量は「数値+単位」で入力してください（例：${sizeExample}）。`;
    }
    setFieldErrors(errors);

    if (
      errors.storeId !== null ||
      errors.priceAmount !== null ||
      errors.packageSizeValue !== null ||
      parsedSize.kind !== 'amount'
    ) {
      return null;
    }
    return {
      storeId,
      priceAmount: parsedPriceAmount,
      packageSizeValue: parsedSize.value,
      packageSizeUnit: parsedSize.unit,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (record === null) {
      return;
    }
    setErrorMessage(null);
    const body = buildBody();
    if (body === null) {
      return;
    }

    setSubmitting(true);
    try {
      const response = await client.api.products[':id']['price-records'][':priceRecordId'].$put({
        param: { id: product.id, priceRecordId: record.id },
        json: body,
      });
      if (response.ok) {
        onOpenChange(false);
        router.refresh();
        return;
      }

      // Hono RPC の型は 404 を知らない（共通 onError 由来で型に現れない）ため number へ広げる。
      const status: number = response.status;
      if (status === 404) {
        const payload = await response.json();
        if (typeof payload.error === 'string' && payload.error.startsWith('PriceRecord not found')) {
          setErrorMessage('この記録はすでに削除されています。');
          onOpenChange(false);
          router.refresh();
          return;
        }
        if (typeof payload.error === 'string' && payload.error.startsWith('Store not found')) {
          setErrorMessage('選択した店舗が見つかりません。店舗一覧を確認してください。');
          const refetch = await client.api.stores.$get();
          if (refetch.ok) {
            setStores(await refetch.json());
          }
          return;
        }
      }
      setErrorMessage('記録の更新に失敗しました。');
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {record !== null && (
        <AlertDialogContent>
          <AlertDialogTitle>価格記録を編集</AlertDialogTitle>
          <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
            {errorMessage !== null && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <label htmlFor={storeIdId} className="text-sm font-medium text-foreground">店舗</label>
              <SelectField
                id={storeIdId}
                value={storeId}
                onValueChange={setStoreId}
                options={storeOptions}
                disabled={storesLoading}
                invalid={fieldErrors.storeId !== null}
              />
              {fieldErrors.storeId !== null && (
                <p className="text-xs text-destructive">{fieldErrors.storeId}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={priceAmountId} className="text-sm font-medium text-foreground">価格</label>
              <Input
                id={priceAmountId}
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={priceAmount}
                onChange={(event) => setPriceAmount(event.currentTarget.value)}
                aria-invalid={fieldErrors.priceAmount !== null}
                className="h-11 rounded-xl bg-card"
              />
              {fieldErrors.priceAmount !== null && (
                <p className="text-xs text-destructive">{fieldErrors.priceAmount}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={packageSizeId} className="text-sm font-medium text-foreground">内容量</label>
              <QuantityField
                id={packageSizeId}
                value={packageSize}
                onValueChange={setPackageSize}
                placeholder={`例：${sizeExample}`}
                invalid={fieldErrors.packageSizeValue !== null}
              />
              {fieldErrors.packageSizeValue !== null && (
                <p className="text-xs text-destructive">{fieldErrors.packageSizeValue}</p>
              )}
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <AlertDialogClose
                render={<Button type="button" variant="outline" className="h-9">キャンセル</Button>}
              />
              <Button type="submit" disabled={!canSubmit} className="h-9">
                {submitting ? '保存中' : '保存'}
              </Button>
            </div>
          </form>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
```

**完了条件**

- `PRED-01`〜`PRED-10` が全件 pass する。
- `record === null` のとき何も描画されない（`AlertDialog open={false}` のみ）。
- `pnpm --filter @cookpit/web type-check` が通る。

---

### Step 10: Presentation（UI）— `StoreRenameDialog`（新規）

**設計メモ（implementer 裁量の確定事項）**: `PriceRecordEditDialog` と同じ「null で非表示」パターンを
採用する。Props: `{ store: StoreDto | null; existingStoreNames: string[]; onOpenChange: (open: boolean) => void; onRenamed: (updated: StoreDto) => void }`。
`existingStoreNames` は呼び出し側（`PriceRecordForm`）が対象店舗自身を除外して渡す
（設計書 §論点2）。`onRenamed` で親の `stores` state をローカル更新する（設計書のデータフロー）。

**Red**

試験 ID: `SRD-01`〜`SRD-13`（試験計画 §8-2 の表が正典）。

対象ファイル（新規）: `apps/web/tests/app/products/[id]/_components/store-rename-dialog.test.tsx`

```typescript
import type { StoreDto } from '@cookpit/application';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { getStoreUsage, putStore, refresh } = vi.hoisted(() => ({
  getStoreUsage: vi.fn(),
  putStore: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      stores: {
        ':id': {
          $put: (...args: unknown[]) => putStore(...args),
          usage: { $get: (...args: unknown[]) => getStoreUsage(...args) },
        },
      },
    },
  },
}));

import { StoreRenameDialog } from '../../../../../src/app/products/[id]/_components/store-rename-dialog';

const STORE: StoreDto = { id: 'store-a', name: '業務スーパ', createdAt: '2026-06-01T00:00:00.000Z' };

describe('StoreRenameDialog', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('SRD-01: 初期値が表示される', async () => {
    getStoreUsage.mockResolvedValue({ ok: true, json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }) });
    render(
      <StoreRenameDialog store={STORE} existingStoreNames={[]} onOpenChange={vi.fn()} onRenamed={vi.fn()} />,
    );

    expect((await screen.findByLabelText('店舗名') as HTMLInputElement).value).toBe('業務スーパ');
  });

  it('SRD-03: priceRecordCount > 0 のとき件数入りの警告文が出る（B-08）', async () => {
    getStoreUsage.mockResolvedValue({ ok: true, json: async () => ({ priceRecordCount: 5, shoppingItemCount: 0 }) });
    render(
      <StoreRenameDialog store={STORE} existingStoreNames={[]} onOpenChange={vi.fn()} onRenamed={vi.fn()} />,
    );

    expect(
      await screen.findByText('この店舗の価格記録 5 件の表示名も変わります。違う店舗を選んでいないか確認してください。'),
    ).toBeDefined();
  });

  it('SRD-04: priceRecordCount === 0 のとき警告文が出ない（B-08）', async () => {
    getStoreUsage.mockResolvedValue({ ok: true, json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }) });
    render(
      <StoreRenameDialog store={STORE} existingStoreNames={[]} onOpenChange={vi.fn()} onRenamed={vi.fn()} />,
    );
    await screen.findByLabelText('店舗名');

    expect(screen.queryByText(/この店舗の価格記録/)).toBeNull();
  });

  it('SRD-07: 保存成功でダイアログが閉じ、onRenamed が呼ばれ、router.refresh() が呼ばれる（N-06）', async () => {
    const user = userEvent.setup();
    getStoreUsage.mockResolvedValue({ ok: true, json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }) });
    const updated: StoreDto = { ...STORE, name: '業務スーパー' };
    putStore.mockResolvedValue({ ok: true, json: async () => updated });
    const onOpenChange = vi.fn();
    const onRenamed = vi.fn();
    render(
      <StoreRenameDialog store={STORE} existingStoreNames={[]} onOpenChange={onOpenChange} onRenamed={onRenamed} />,
    );
    const input = await screen.findByLabelText('店舗名');
    await user.clear(input);
    await user.type(input, '業務スーパー');

    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(putStore).toHaveBeenCalledWith({ param: { id: 'store-a' }, json: { name: '業務スーパー' } });
    });
    expect(onRenamed).toHaveBeenCalledWith(updated);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(refresh).toHaveBeenCalled();
  });

  it('SRD-08: 自分自身と同じ名前のまま保存できる（N-08）', async () => {
    const user = userEvent.setup();
    getStoreUsage.mockResolvedValue({ ok: true, json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }) });
    putStore.mockResolvedValue({ ok: true, json: async () => STORE });
    render(
      // existingStoreNames は自分自身を除外済みという契約（設計書 §論点2）
      <StoreRenameDialog store={STORE} existingStoreNames={[]} onOpenChange={vi.fn()} onRenamed={vi.fn()} />,
    );
    await screen.findByLabelText('店舗名');

    expect(screen.getByRole('button', { name: '保存' }).hasAttribute('disabled')).toBe(false);
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(putStore).toHaveBeenCalled());
  });

  it('SRD-11: DuplicateStoreNameError（422）でメッセージを表示する', async () => {
    const user = userEvent.setup();
    getStoreUsage.mockResolvedValue({ ok: true, json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }) });
    putStore.mockResolvedValue({ ok: false, status: 422 });
    render(
      <StoreRenameDialog store={STORE} existingStoreNames={['西友']} onOpenChange={vi.fn()} onRenamed={vi.fn()} />,
    );
    await screen.findByLabelText('店舗名');

    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('同じ名前の店舗がすでに登録されています。')).toBeDefined();
  });
});
```

`SRD-02, 05, 06, 09, 10, 12, 13` は試験計画 §8-2 表のとおりに追加する。

**Green**

対象ファイル（新規）: `apps/web/src/app/products/[id]/_components/store-rename-dialog.tsx`

```typescript
'use client';

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { isDuplicateStoreName } from '@/app/products/_utils/store-name';
import { client } from '@/lib/api-client';
import type { RenameStoreBody } from '@cookpit/api-contract';
import type { StoreDto } from '@cookpit/application';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useId, useState } from 'react';

const DUPLICATE_STORE_MESSAGE = '同じ名前の店舗がすでに登録されています。';

interface Props {
  store: StoreDto | null;
  existingStoreNames: string[];
  onOpenChange: (open: boolean) => void;
  onRenamed: (updated: StoreDto) => void;
}

export function StoreRenameDialog({ store, existingStoreNames, onOpenChange, onRenamed }: Props) {
  const router = useRouter();
  const nameId = useId();

  const [name, setName] = useState('');
  const [priceRecordCount, setPriceRecordCount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const open = store !== null;
  const nameError =
    name.trim() === ''
      ? '店舗名を入力してください。'
      : isDuplicateStoreName(name, existingStoreNames)
        ? DUPLICATE_STORE_MESSAGE
        : null;
  const canSubmit = nameError === null && !submitting;

  useEffect(() => {
    if (store === null) {
      return;
    }
    setName(store.name);
    setErrorMessage(null);
    setPriceRecordCount(null);

    let cancelled = false;
    async function loadUsage(): Promise<void> {
      try {
        const response = await client.api.stores[':id'].usage.$get({ param: { id: store.id } });
        if (response.ok && !cancelled) {
          const usage = await response.json();
          setPriceRecordCount(usage.priceRecordCount);
        }
      } catch {
        // 件数はリネームの可否に影響しない補助情報なので、失敗を握って操作を続行させる。
      }
    }
    void loadUsage();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store?.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (store === null || !canSubmit) {
      return;
    }

    const body: RenameStoreBody = { name: name.trim() };
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await client.api.stores[':id'].$put({ param: { id: store.id }, json: body });
      if (response.ok) {
        const updated = await response.json();
        onRenamed(updated);
        onOpenChange(false);
        router.refresh();
        return;
      }

      // Hono RPC の型は 404/422 を知らない（共通 onError 由来で型に現れない）ため number へ広げる。
      const status: number = response.status;
      if (status === 404) {
        setErrorMessage('この店舗はすでに削除されています。');
        onOpenChange(false);
        router.refresh();
        return;
      }
      if (status === 422) {
        setErrorMessage(DUPLICATE_STORE_MESSAGE);
        return;
      }
      setErrorMessage('店舗名を入力してください。');
    } catch {
      setErrorMessage('通信エラーが発生しました。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {store !== null && (
        <AlertDialogContent>
          <AlertDialogTitle>店舗名を編集</AlertDialogTitle>
          <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
            {errorMessage !== null && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {errorMessage}
              </p>
            )}
            {priceRecordCount !== null && priceRecordCount > 0 && (
              <p className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground">
                {`この店舗の価格記録 ${priceRecordCount} 件の表示名も変わります。違う店舗を選んでいないか確認してください。`}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <label htmlFor={nameId} className="text-sm font-medium text-foreground">店舗名</label>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                aria-invalid={nameError !== null}
                className="h-11 rounded-xl bg-card"
              />
              {nameError !== null && <p className="text-xs text-destructive">{nameError}</p>}
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <AlertDialogClose
                render={<Button type="button" variant="outline" className="h-9">キャンセル</Button>}
              />
              <Button type="submit" disabled={!canSubmit} className="h-9">
                {submitting ? '保存中' : '保存'}
              </Button>
            </div>
          </form>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
```

**注意（SRD-08 との整合）**: `nameError` は入力欄が空のときにも常に文言を出す設計にしたため、
初期表示（`name = store.name`、空でない）では `nameError === null` となり `SRD-01` の初期値表示・
`SRD-08`（変更せず保存）は妨げられない。

**完了条件**

- `SRD-01`〜`SRD-13` が全件 pass する。
- `store === null` のとき何も描画されない。

---

### Step 11: Presentation（UI）— `ProductDetailClient` 編集導線

**Red**

試験 ID: `PDC-09`〜`PDC-12`（試験計画 §8-3 の表が正典）。

対象ファイル: `apps/web/tests/app/products/[id]/_components/product-detail-client.test.tsx`（既存ファイルに追記）。

まず `vi.mock('@/lib/api-client')` の `products[':id']['price-records']` に
`':priceRecordId': { $delete: ..., $put: vi.fn() }` を追加する（既存の `$delete` モックは変更しない）。

```typescript
const { deletePriceRecord, putPriceRecord, deleteProduct, getStores, refresh, push } = vi.hoisted(
  () => ({
    deletePriceRecord: vi.fn(),
    putPriceRecord: vi.fn(),
    deleteProduct: vi.fn(),
    getStores: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
  }),
);
// ...
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
          $delete: (...args: unknown[]) => deleteProduct(...args),
          'price-records': {
            $post: vi.fn(),
            ':priceRecordId': {
              $delete: (...args: unknown[]) => deletePriceRecord(...args),
              $put: (...args: unknown[]) => putPriceRecord(...args),
            },
          },
        },
      },
    },
  },
}));

// describe('ProductDetailClient', ...) 内に追記
it('PDC-09: 編集アイコンが表示される', () => {
  renderDetail();
  expect(screen.getByRole('button', { name: /の記録を編集$/ })).toBeDefined();
});

it('PDC-10: 編集アイコンから PriceRecordEditDialog を開く', async () => {
  const user = userEvent.setup();
  renderDetail();

  await user.click(screen.getByRole('button', { name: /の記録を編集$/ }));

  expect(await screen.findByText('価格記録を編集')).toBeDefined();
});

it('PDC-11: 6 件中、直近 5 件のみに編集アイコンが表示される（B-05/E-10）', () => {
  const records = Array.from({ length: 6 }, (_, i) =>
    createPriceRecord({ id: `record-${i}`, observedAt: `2026-06-0${i + 1}T09:00:00.000Z` }),
  );
  renderDetail(records);

  expect(screen.getAllByRole('button', { name: /の記録を編集$/ })).toHaveLength(5);
});

it('PDC-12: 編集成功後、router.refresh() が呼ばれる', async () => {
  const user = userEvent.setup();
  putPriceRecord.mockResolvedValue({ ok: true });
  renderDetail();

  await user.click(screen.getByRole('button', { name: /の記録を編集$/ }));
  await screen.findByText('価格記録を編集');
  await user.click(screen.getByRole('button', { name: '保存' }));

  await waitFor(() => expect(refresh).toHaveBeenCalled());
});
```

**Green**

対象ファイル: `apps/web/src/app/products/[id]/_components/product-detail-client.tsx`

1. import に `PriceRecordEditDialog` を追加する。
2. state 追加: `const [editingRecord, setEditingRecord] = useState<PriceRecordDto | null>(null);`
3. 「最近の記録」各行の削除ボタンを、編集・削除 2 ボタンをまとめた `<div>` に置き換える。

```tsx
<div className="flex items-center gap-1">
  <Button
    type="button"
    variant="ghost"
    size="icon"
    onClick={() => setEditingRecord(record)}
    aria-label={`${formatDateTime(record.observedAt)}の記録を編集`}
    className="text-muted-foreground"
  >
    <Pencil className="size-4" aria-hidden="true" />
  </Button>
  <Button
    type="button"
    variant="ghost"
    size="icon"
    onClick={() => setPendingDeleteRecord(record)}
    disabled={deletingRecord}
    aria-label={`${formatDateTime(record.observedAt)}の記録を削除`}
    className="text-muted-foreground"
  >
    <Trash2 className="size-4" aria-hidden="true" />
  </Button>
</div>
```

4. `<PriceRecordEditDialog>` をコンポーネント末尾（既存の削除確認 `AlertDialog` の直後）に追加する。

```tsx
<PriceRecordEditDialog
  product={product}
  record={editingRecord}
  onOpenChange={(open) => {
    if (!open) {
      setEditingRecord(null);
    }
  }}
/>
```

**完了条件**

- `PDC-09`〜`PDC-12` が全件 pass する。
- 既存の `PDC-01`〜`PDC-08` が、削除ボタンの `aria-label`（`/の記録を削除$/`）が変わらないため
  無変更のまま pass する（試験計画 REG-03）。

---

### Step 12: Presentation（UI）— `PriceRecordForm` リネーム導線

**Red**

試験 ID: `PRF-15`〜`PRF-17`（試験計画 §8-4 の表が正典）。

対象ファイル: `apps/web/tests/app/products/[id]/_components/price-record-form.test.tsx`（既存ファイルに追記）。

`vi.mock('@/lib/api-client')` の `stores[':id']` に `$put: vi.fn()` を追加する（既存の `$delete` /
`usage.$get` モックは変更しない）。

```typescript
const { getStores, postStore, deleteStore, putStore, getStoreUsage, postPriceRecord, refresh, push } =
  vi.hoisted(() => ({
    getStores: vi.fn(), postStore: vi.fn(), deleteStore: vi.fn(), putStore: vi.fn(),
    getStoreUsage: vi.fn(), postPriceRecord: vi.fn(), refresh: vi.fn(), push: vi.fn(),
  }));
// ...
vi.mock('@/lib/api-client', () => ({
  client: {
    api: {
      stores: {
        $get: (...args: unknown[]) => getStores(...args),
        $post: (...args: unknown[]) => postStore(...args),
        ':id': {
          $delete: (...args: unknown[]) => deleteStore(...args),
          $put: (...args: unknown[]) => putStore(...args),
          usage: { $get: (...args: unknown[]) => getStoreUsage(...args) },
        },
      },
      products: { ':id': { 'price-records': { $post: (...args: unknown[]) => postPriceRecord(...args) } } },
    },
  },
}));

// describe('PriceRecordForm', ...) 内に追記
it('PRF-15: リネームアイコンが表示される', async () => {
  getStores.mockResolvedValue({ ok: true, json: async () => STORES });
  render(<PriceRecordForm product={createProductDto()} />);
  await waitForStoresLoaded();

  expect(screen.getByRole('button', { name: '店舗Aを編集' })).toBeDefined();
});

it('PRF-16: リネームアイコンから StoreRenameDialog を開く', async () => {
  const user = userEvent.setup();
  getStores.mockResolvedValue({ ok: true, json: async () => STORES });
  getStoreUsage.mockResolvedValue({ ok: true, json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }) });
  render(<PriceRecordForm product={createProductDto()} />);
  await waitForStoresLoaded();

  await user.click(screen.getByRole('button', { name: '店舗Aを編集' }));

  expect(await screen.findByText('店舗名を編集')).toBeDefined();
});

it('PRF-17: リネーム成功後、一覧の表示名が更新され選択は外れない（N-06）', async () => {
  const user = userEvent.setup();
  getStores.mockResolvedValue({ ok: true, json: async () => STORES });
  getStoreUsage.mockResolvedValue({ ok: true, json: async () => ({ priceRecordCount: 0, shoppingItemCount: 0 }) });
  putStore.mockResolvedValue({ ok: true, json: async () => ({ ...STORES[0], name: '店舗A改' }) });
  render(<PriceRecordForm product={createProductDto()} />);
  await waitForStoresLoaded();
  expect(screen.getByRole('combobox', { name: '店舗' }).textContent).toContain('店舗A');

  await user.click(screen.getByRole('button', { name: '店舗Aを編集' }));
  const input = await screen.findByLabelText('店舗名');
  await user.clear(input);
  await user.type(input, '店舗A改');
  await user.click(screen.getByRole('button', { name: '保存' }));

  await waitFor(() => {
    expect(screen.getByRole('combobox', { name: '店舗' }).textContent).toContain('店舗A改');
  });
});
```

**Green**

対象ファイル: `apps/web/src/app/products/[id]/_components/price-record-form.tsx`

1. import に `Pencil`（`lucide-react`）と `StoreRenameDialog` を追加する。
2. state 追加: `const [renamingStore, setRenamingStore] = useState<StoreDto | null>(null);`
3. 店舗一覧 `<li>` 内のボタンをリネーム・削除 2 ボタンをまとめた `<div>` に置き換える。

```tsx
<div className="flex items-center gap-1">
  <Button
    type="button"
    variant="ghost"
    size="icon"
    onClick={() => setRenamingStore(store)}
    aria-label={`${store.name}を編集`}
    className="text-muted-foreground"
  >
    <Pencil className="size-4" aria-hidden="true" />
  </Button>
  <Button
    type="button"
    variant="ghost"
    size="icon"
    onClick={() => void requestDeleteStore(store)}
    disabled={deletingStore}
    aria-label={`${store.name}を削除`}
    className="text-muted-foreground"
  >
    <Trash2 className="size-4" aria-hidden="true" />
  </Button>
</div>
```

4. `<StoreRenameDialog>` をコンポーネント末尾（既存の削除確認 `AlertDialog` の直後）に追加する。

```tsx
<StoreRenameDialog
  store={renamingStore}
  existingStoreNames={
    renamingStore === null ? [] : stores.filter((s) => s.id !== renamingStore.id).map((s) => s.name)
  }
  onOpenChange={(open) => {
    if (!open) {
      setRenamingStore(null);
    }
  }}
  onRenamed={(updated) => {
    setStores((current) => current.map((s) => (s.id === updated.id ? updated : s)));
    setRenamingStore(null);
  }}
/>
```

**完了条件**

- `PRF-15`〜`PRF-17` が全件 pass する。
- 既存の `PRF-01`〜`PRF-14` が、削除ボタンの `aria-label`（`◯を削除`）が変わらないため
  無変更のまま pass する（試験計画 REG-04）。

---

### Step 13: 回帰 — `price-comparison.node.test.ts` の編集シナリオ

**Red**

試験 ID: `PC-EDIT-01`, `PC-EDIT-02`（試験計画 §9 の表が正典）。

対象ファイル: `apps/web/tests/app/shopping-lists/_utils/price-comparison.node.test.ts`（既存ファイルに
新しい `describe` ブロックを追記。既存の `createPriceRecordDto` / `createProductDto` ヘルパーを再利用）。

```typescript
describe('編集シナリオ（price-record-edit-and-store-rename）', () => {
  it('PC-EDIT-01: 編集で同一店舗の記録が複数になっても最新 1 件に絞られる', () => {
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-a',
          storeId: 'store-a',
          storeName: '店舗A',
          unitPriceAmount: 100,
          observedAt: '2026-06-01T00:00:00.000Z',
        }),
        // 編集で storeId が store-a に変わった元 store-b の記録（observedAt はより新しい）
        createPriceRecordDto({
          id: 'r-b',
          storeId: 'store-a',
          storeName: '店舗A',
          unitPriceAmount: 80,
          observedAt: '2026-06-02T00:00:00.000Z',
        }),
        createPriceRecordDto({
          id: 'r-c',
          storeId: 'store-c',
          storeName: '店舗C',
          unitPriceAmount: 90,
          observedAt: '2026-06-01T00:00:00.000Z',
        }),
      ],
    });

    const breakdown = buildStoreUnitPriceBreakdown(product);

    const storeAEntries = breakdown?.entries.filter((e) => e.storeId === 'store-a') ?? [];
    expect(storeAEntries).toHaveLength(1);
    expect(storeAEntries[0]?.unitPriceAmount).toBe(80);
  });

  it('PC-EDIT-02: 編集で店舗の記録が無くなると候補から自然に除外される', () => {
    const product = createProductDto({
      priceHistory: [
        createPriceRecordDto({
          id: 'r-b',
          storeId: 'store-b',
          storeName: '店舗B',
          unitPriceAmount: 80,
        }),
        createPriceRecordDto({
          id: 'r-c',
          storeId: 'store-c',
          storeName: '店舗C',
          unitPriceAmount: 90,
        }),
      ],
    });

    const breakdown = buildStoreUnitPriceBreakdown(product);

    expect(breakdown?.entries.some((e) => e.storeId === 'store-a')).toBe(false);
  });
});
```

**Green**

`apps/web/src/app/shopping-lists/_utils/price-comparison.ts` は**変更しない**（都度計算のため
`ProductDto` の中身が変われば自動的に新しい結果になる。設計書 §論点3）。このステップは
テスト追加のみで、Green は「実装コード無変更のまま pass することを確認する」。

**完了条件**

- `PC-EDIT-01`, `PC-EDIT-02` が pass する。
- 既存の「単位換算の 4 方向テスト（必須。改変禁止）」を含む全既存テストが無変更のまま pass する
  （試験計画 REG-02）。

---

### Step 14: Orchestrator 追加スコープ — `DuplicateStoreNameError` メッセージ修正

このステップは**依頼元（Orchestrator）の追加スコープ**であり、試験計画に対応する試験 ID は無い
（Orchestrator が「このメッセージを検証しているテストが無い」ことを確認済み）。

**Red**

該当なし。既存テスト（`packages/application/tests/store/store-use-cases.test.ts` の `CSU-05〜07`、
`apps/web/tests/server/routes/stores.test.ts` の `WH-05`）は `toBeInstanceOf(DuplicateStoreNameError)` /
`toMatchObject({ attemptedName: ... })` / HTTP ステータスのみを検証し、メッセージ文字列を
アサートしていないため、事前に失敗させるテストは無い。

**Green**

対象ファイル: `packages/application/src/store/duplicate-store-name.error.ts`

```typescript
import { InvalidOperationError } from '../shared/errors';

/**
 * 既存店舗と同名の店舗を作成・リネームしようとしたときのエラー（ADR-0013・ADR-0015）。
 * `InvalidOperationError` を継承しているため HTTP では 422 になる。
 *
 * 同名判定は `normalizeStoreName()`（前後空白除去 + NFKC）後の完全一致。`attemptedName` には
 * 判定に使った正規化後の名前ではなく、ユーザーが入力した原文を保持する。
 *
 * フィールド名を `name` にしないのは、基底の `Error.name` を潰さないため
 * （`InvalidOperationError` が `new.target.name` を代入している）。
 */
export class DuplicateStoreNameError extends InvalidOperationError {
  constructor(readonly attemptedName: string) {
    super(`Store name '${attemptedName}' already exists`);
  }
}
```

変更点は 2 つ: (1) メッセージを `` `Cannot create Store: name '${attemptedName}' already exists` ``
から `` `Store name '${attemptedName}' already exists` `` へ（作成・リネーム両方に対して操作中立な
文言にする）、(2) JSDoc 1 行目を「既存店舗と同名の店舗を作成しようとしたとき」から
「既存店舗と同名の店舗を作成・リネームしようとしたとき」へ更新する。

`store-limit-exceeded.error.ts` の同種メッセージ（`Cannot create Store: limit is...`）は
**変更しない**（作成時のみ発生するエラーのため。Orchestrator 確認済み）。

**完了条件**

- `packages/application/tests/store/store-use-cases.test.ts` の `CSU-05`〜`CSU-08` が無変更のまま pass する。
- `apps/web/tests/server/routes/stores.test.ts` の `WH-05` が無変更のまま pass する。
- リポジトリ全体を `grep -rn "Cannot create Store: name"` して、本ファイル以外に一致が無いことを
  確認する（無いことは事前調査済み。§ドキュメント更新対象 参照）。

---

### Step 15: Infrastructure（Should）— `IR-S-06`

試験計画 §14-2（推奨・Should）。Infrastructure・DB スキーマは変更しないため、**Red → Green の
往復にはならない**（`save()` は既に `onConflictDoUpdate` で `name` を upsert する実装になっている
ため、テストを追加した時点で最初から pass するはずである）。

**テスト追加（往復無し）**

試験 ID: `IR-S-06`。

対象ファイル: `packages/infrastructure/tests/repositories/drizzle-store.repository.test.ts`
（既存ファイルに追記。既存の `IR-S-01`〜`05` の直後に追加する）。

```typescript
it('IR-S-06: save() の name 更新（upsert）を検証する', async () => {
  const store = Store.create({ name: '業務スーパ' });
  await repository.save(store);

  const reloaded = await repository.findById(store.id);
  reloaded?.rename('業務スーパー');
  await repository.save(reloaded as Store);

  const found = await repository.findById(store.id);
  expect(found?.name).toBe('業務スーパー');
  expect(found?.createdAt.getTime()).toBe(store.createdAt.getTime());
});
```

（Step 2 完了後でないと `rename()` が無いため、このステップは Step 2 完了後に着手すること。）

**完了条件**

- `IR-S-06` が pass する（実装済みの `save()` に対する確認テストであり、追加時点から pass する想定）。
  もし失敗した場合は `DrizzleStoreRepository.save()` の `onConflictDoUpdate` に `name` が
  含まれているかを確認する（設計書の前提が崩れている可能性があるため、Orchestrator へ報告する）。

---

### Step 16: 品質ゲート

```bash
pnpm lint
pnpm type-check
pnpm test
```

**完了条件**

- 3 コマンドすべてがエラーなしで通る。
- 試験計画 §14-1（必須）の全項目が pass している:
  - Domain: `D-PUR-01〜12`, `D-SRN-01〜06`
  - Application: `A-UPU-01〜17`, `A-RSU-01〜10`
  - api-contract: `Z-UPR-01〜08`, `Z-RSN-01〜05`
  - Presentation（Hono）: `WH-P-09〜15`, `WH-S-05〜11`
  - Presentation（RTL）: `PRED-01〜10`, `SRD-01〜13`, `PDC-09〜12`, `PRF-15〜17`
  - `PC-EDIT-01/02` と既存回帰（REG-01〜06）
- 試験計画 §1（要件書観点対応表）の全 N-xx/E-xx/B-xx に対応する試験が実装されている。

---

### Step 17: `manual-browser-verify`（実画面確認）

試験計画 §13（`MB-01`〜`MB-05`）を Step 16 通過後に実行する。390px 幅での確認を含む
（`MB-01`）。各項目に PASS / BLOCKED(理由) / FAIL を記録する。

| 試験 ID | 確認内容                                                                   |
| ------- | -------------------------------------------------------------------------- |
| MB-01   | 価格記録編集ダイアログが 390px 幅で崩れず初期値を表示する                  |
| MB-02   | 「最近の記録」6 件中、直近 5 件のみに編集アイコンが表示される              |
| MB-03   | kg→g 単位変更編集で、画面上の単価表示が再計算後の値に変わる                |
| MB-04   | 店舗リネームの警告文が `priceRecordCount > 0` のときだけ表示される         |
| MB-05   | 店舗リネーム後、最安店舗表示・価格記録の店舗名表示が新しい名前に切り替わる |

**完了条件**（試験計画 §14-2）

- `MB-01`〜`MB-05` 全項目に PASS / BLOCKED(理由) / FAIL が付いている。

---

## テスト計画（まとめ）

| 層                        | ファイル                                                                         | 試験 ID         |
| ------------------------- | -------------------------------------------------------------------------------- | --------------- |
| Domain                    | `packages/domain/tests/product/product.test.ts`                                  | `D-PUR-01〜12`  |
| Domain                    | `packages/domain/tests/shared/store.test.ts`                                     | `D-SRN-01〜06`  |
| Application               | `packages/application/tests/product/product-use-cases.test.ts`                   | `A-UPU-01〜17`  |
| Application               | `packages/application/tests/store/store-use-cases.test.ts`                       | `A-RSU-01〜10`  |
| api-contract              | `packages/api-contract/tests/product.schema.test.ts`                             | `Z-UPR-01〜08`  |
| api-contract              | `packages/api-contract/tests/store.schema.test.ts`                               | `Z-RSN-01〜05`  |
| Presentation（Hono）      | `apps/web/tests/server/routes/products.test.ts`                                  | `WH-P-09〜15`   |
| Presentation（Hono）      | `apps/web/tests/server/routes/stores.test.ts`                                    | `WH-S-05〜11`   |
| Presentation（RTL・新規） | `apps/web/tests/app/products/[id]/_components/price-record-edit-dialog.test.tsx` | `PRED-01〜10`   |
| Presentation（RTL・新規） | `apps/web/tests/app/products/[id]/_components/store-rename-dialog.test.tsx`      | `SRD-01〜13`    |
| Presentation（RTL）       | `apps/web/tests/app/products/[id]/_components/product-detail-client.test.tsx`    | `PDC-09〜12`    |
| Presentation（RTL）       | `apps/web/tests/app/products/[id]/_components/price-record-form.test.tsx`        | `PRF-15〜17`    |
| 回帰（node）              | `apps/web/tests/app/shopping-lists/_utils/price-comparison.node.test.ts`         | `PC-EDIT-01/02` |
| Infrastructure（Should）  | `packages/infrastructure/tests/repositories/drizzle-store.repository.test.ts`    | `IR-S-06`       |
| 手動                      | `manual-browser-verify`                                                          | `MB-01〜05`     |

いずれのファイル名・配置も既存の vitest `include` パターン（`packages/*` は `tests/**/*.test.ts`、
`apps/web` は `tests/**/*.node.test.ts` / `tests/**/*.test.tsx` / `tests/server/**/*.test.ts`）に
一致している（新規ファイルはすべて `.test.tsx` または既存の `.test.ts` ファイルへの追記）。

---

## リスク

| #   | リスク                                                                                                                                                                                                                                                    | 影響                                                                   | 対策                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | `PriceRecordEditDialog` が `PriceRecordNotFoundError` / `StoreNotFoundError` をレスポンスボディの文言（`error` 文字列の接頭辞）で判定する設計にしたため、`app.ts` の `onError` やエラークラスのメッセージ書式が将来変わると UI のエラー分岐が静かに壊れる | ユーザーに誤った・汎用的なエラー文言が出る（機能自体は壊れない）       | `NotFoundError` 基底の書式 `${entityLabel} not found: ${id}` は固定契約（`packages/application/src/shared/errors.ts` の JSDoc）なので低リスクだが、変更時はこのコンポーネントも見直す必要があることをコードコメントで明示する |
| R-2 | `DuplicateStoreNameError` のメッセージ変更（Step 14）が、契約設計書 §7.2 のサンプルペイロード（`"Cannot create Store: name '...' already exists"`）と食い違う                                                                                             | 契約ドキュメントが実装と不整合になる（動作には影響しない）             | 本計画の「ドキュメント更新対象」に契約設計書のサンプルペイロード更新を申し送り事項として記録する（設計書本体は本計画の変更対象外のため、実装コード側では対応しきれない）                                                      |
| R-3 | `PriceRecordEditDialog` / `PriceRecordForm` の入力フィールド部分（店舗選択・価格・内容量）が重複する（設計書 §リスク で既知の申し送り）                                                                                                                   | 将来、価格記録の入力フォームに変更が入る際に両方への追従が必要         | 本タスクでは共通化しない（YAGNI、設計書の判断どおり）。将来課題として `docs/designs/price-record-edit-and-store-rename.md` §リスク に既に記載済み                                                                             |
| R-4 | `product-detail-client.tsx` / `price-record-form.tsx` の一覧行 JSX 変更で、既存の `aria-label`（`/の記録を削除$/` 等）を誤って変えてしまうと既存テスト（PDC-01〜08、PRF-01〜14）が壊れる                                                                  | 回帰テスト失敗                                                         | Step 11・12 の Green で `aria-label` 文言を既存のまま維持し、削除ボタンには新しいボタン（編集）を**隣に追加するだけ**にする。diff で `aria-label` の既存値が変わっていないことを目視確認する                                  |
| R-5 | `Store.rename()` の追加で `storeName` を `readonly` から可変に変えることで、`Store` インスタンスを長命に保持する箇所があると「途中で名前が変わりうる」前提が必要になる（ADR-0015 §Consequences で既知）                                                   | 現状は UseCase 内で取得して DTO 化するのみで長命参照は無いため実害なし | 新しい箇所で `Store` インスタンスをキャッシュ・長期保持しないことをレビューで確認する                                                                                                                                         |

---

## ロールバック方法

ADR-0015 §Rollback を土台に、価格記録編集側も含めて手順化する。

1. **Presentation（UI）**: `price-record-edit-dialog.tsx` / `store-rename-dialog.tsx` を削除し、
   `product-detail-client.tsx` / `price-record-form.tsx` の編集導線（追加した state・ボタン・
   ダイアログ描画）を元に戻す。
2. **Presentation（Hono）**: `apps/web/src/server/routes/products.ts` の
   `.put('/:id/price-records/:priceRecordId', ...)` と `apps/web/src/server/routes/stores.ts` の
   `.put('/:id', ...)` を削除する（`app.ts` は変更していないため戻す必要はない）。
3. **api-contract**: `updatePriceRecordSchema` / `UpdatePriceRecordBody`（`product.schema.ts`）、
   `renameStoreSchema` / `RenameStoreBody`（`store.schema.ts`）を削除する。
4. **Application**: `UpdatePriceRecordUseCase` / `RenameStoreUseCase` とその DTO
   （`UpdatePriceRecordInputDto` / `RenameStoreInputDto`）を削除し、`index.ts` の export 行を削除する。
   `DuplicateStoreNameError` のメッセージは元の文言（`Cannot create Store: name '...'`）に戻す
   （任意。実害が無いため戻さなくてもよい）。
5. **Domain**: `Product.updatePriceRecord()` を削除する。`Store.rename()` を削除し、`storeName` を
   `private readonly` へ戻す。
6. DB スキーマ・保存済みデータへの影響は無いため、ロールバックはコードの巻き戻しのみで完結する
   （ADR-0015 と同じ結論）。既にリネーム・編集済みのデータは元に戻らないが、これはデータとして
   正常な状態であり修復は不要。

各ステップは独立してリバート可能（Step 1・2 の Domain 変更だけを戻すと Step 3 以降が型エラーに
なるため、ロールバックする場合は上記の逆順＝Presentation → Application → Domain の順で行う）。

---

## ドキュメント更新対象

- `docs/05-roadmap.md`: Sprint 7 完了条件の
  `- [ ] 打ち間違えた店舗名・価格記録を画面から修正できる` を実装完了後に `- [x]` へ更新する。
- `docs/04-domain-model.md`:
  - §Store（130-158 行目）: 既存の「現行実装は上記より進んでいる」注記の直後に、`rename()` が
    追加されたこと（ADR-0015）を追記する。
  - §Product 集約（267-336 行目）: イラスト用の擬似コードに `recordPrice()` /
    `removePriceRecord()` はすでに反映されていない（既存の既知のギャップ）。同じ体裁で
    `updatePriceRecord()` の追加を注記として追加する（コード全体の書き直しはしない。既存の
    Store 節の注記パターンを踏襲する）。
- `docs/designs/price-record-edit-and-store-rename.md`: ステータスを `draft` から実装完了に応じて
  更新する（Orchestrator が完了条件確認後に反映）。
- `docs/designs/price-record-edit-and-store-rename.contract.md`: §5-3・§7.2 のサンプルペイロードが
  Step 14 のメッセージ変更後は古い文言（`"Cannot create Store: name '...'"`）のままになる。
  本計画は契約設計書を変更しないため、Orchestrator が別途この差分を契約設計書側に反映するか、
  「実装時に是正済み」の注記を追加するかを判断する（§リスク R-2 参照）。

---

## 未決事項（Orchestrator へ差し戻す事項）

- 試験計画に明記が無く、本計画で implementer 裁量として確定した設計判断（試験計画への追加は
  不要と判断したが、念のため記録する）:
  - `PriceRecordEditDialog` / `StoreRenameDialog` の props 設計（`record: PriceRecordDto | null` /
    `store: StoreDto | null` で非表示を表現する null パターン）。試験計画の期待結果（PRED/SRD の
    各表）はこの設計でも矛盾なく満たせることを確認済み。
  - `PriceRecordEditDialog` が 404 の中から `PriceRecordNotFoundError` と `StoreNotFoundError` を
    区別する手段（レスポンスボディの `error` 文言の接頭辞一致）。契約設計書 §7.1 のサンプル
    ペイロードに準拠しており、試験計画 PRED-05/06 の期待結果とも整合する。
- Step 14（`DuplicateStoreNameError` メッセージ修正）の完了後、契約設計書 §5-3・§7.2 の記載が
  古くなる件（§ドキュメント更新対象・§リスク R-2）は、実装計画の範囲外（設計書の変更）のため
  Orchestrator の判断を仰ぐ。
