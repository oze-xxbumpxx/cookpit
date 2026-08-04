# 設計書: store-delete-and-unit-price-basis

- ステータス: confirmed（**③店舗の削除は 2026-07-27 に ADR-0013 で置き換え済み**）
- レベル: L3
- 関連: `docs/requirements/store-delete-and-unit-price-basis.md` /
  `docs/decisions/ADR-0012-store-delete-restrict-on-reference.md` /
  ADR-0011（物理削除の先例）/ ADR-0008（単位の自由記述）/ ADR-0010（パッケージ公開境界）

> **③店舗の削除に関する記述は現行実装と異なる。**本書は ADR-0012（参照が 1 件でもあれば
> 削除拒否・`StoreInUseError` → 422）に基づいているが、同方針は
> [ADR-0013](../decisions/ADR-0013-store-limit-and-delete-cascade.md) で覆され、
> 削除は参照ごとカスケードする（価格記録は物理削除・買い物品目の店舗指定は未割当へ）方式に
> 変わった。`StoreInUseError` は削除済み。現行の正典は
> [store-limit-and-render-performance.md](./store-limit-and-render-performance.md)。
> ①単価の表示基準・②価格記録の削除に関する記述は現行のまま有効。

## 背景

要件定義書 §背景を正とする。3 件を 1 タスクにまとめる理由は、②（価格記録の削除）が
実質的に「①で読みやすくなった単価を、誤入力のせいで読めない」状態の解消であり、
③（店舗削除）と同じ「ユーザーが自分で掃除できるようにする」系の変更だから。

## 目的

要件定義書 §目的を正とする。

## 要件

要件定義書 §機能要件 F-1〜F-8 を正とする。

## 対象範囲

| 層             | 変更の有無                          |
| -------------- | ----------------------------------- |
| Domain         | あり                                |
| Application    | あり                                |
| Infrastructure | あり                                |
| api-contract   | あり（パラメータスキーマ 1 本追加） |
| Presentation   | あり                                |
| DB スキーマ    | **なし**                            |

## 対象外

要件定義書 §対象外を正とする。要点: 価格記録の編集 / 店舗のリネーム / 論理削除 /
カスケード削除 / 単価の保存値の基準変更 / 商品ごとの表示単位設定 / DB マイグレーション。

## 現状構成

### 単価

`UnitPriceCalculator.calculate(price, packageSize)` が保存用の正準値を作る。

```ts
const WEIGHT_UNITS = new Set(['g', 'kg']); // 厳密一致。正規化しない
const VOLUME_UNITS = new Set(['ml', 'l']);
// 重量: g へ揃えて × 100  → 100g あたり
// 容量: ml へ揃えて × 100 → 100ml あたり
// その他: price / value   → 1 単位あたり
// 最後に 0.1 単位へ丸める
```

結果を `price_records.unit_price_amount` に保存する。表示側は
`unitPriceBasisLabel(unit)` が `g`/`kg` → `'100g'`、`ml`/`l` → `'100ml'`、それ以外 →
`` `1${unit}` `` を返し、`product-card.tsx` / `product-detail-client.tsx` の 3 箇所で
`{formatYen(amount)} / {unitPriceBasisLabel(unit)}` と描画している。

### 価格記録

`Product` 集約が `PriceRecord[]` を持つ。追加は `recordPrice()` のみで、**取り除く操作が無い**。
`PriceRecordDto` に `id` フィールドが無く、フロントは記録を一意に指せない
（`product-detail-client.tsx` の `key` は `` `${record.storeId}-${record.observedAt}` ``）。

### 店舗

`StoreRepository` は `findById` / `findAll` / `save` の 3 本。ルートは `GET /` と `POST /` の
2 本。UI では価格記録フォーム（`price-record-form.tsx`）だけが店舗を作れる。
`ShoppingListRepository` は `findById` / `findByMealPlanId` / `save` の 3 本で、
店舗 ID による問い合わせ手段が無い。

## 変更後構成

| 層                     | 変更                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain                 | `Product.removePriceRecord(id)` を追加。`StoreRepository.delete()` / `ProductRepository.countPriceRecordsByStore()` / `ShoppingListRepository.countItemsByStore()` を追加 |
| Application            | `DeletePriceRecordUseCase` / `DeleteStoreUseCase` を新規追加。`PriceRecordNotFoundError` / `StoreInUseError` を追加。`PriceRecordDto` に `id` を追加                      |
| Infrastructure         | Drizzle 3 リポジトリに上記メソッドを実装                                                                                                                                  |
| api-contract           | `priceRecordIdParamSchema` を追加（`idParamSchema.extend`）                                                                                                               |
| Presentation（ルート） | `DELETE /products/:id/price-records/:priceRecordId`（204）と `DELETE /stores/:id`（204）を追加                                                                            |
| Presentation（画面）   | `product-format.ts` に単価表示の換算を追加。商品詳細に記録削除ボタン、価格記録フォームに店舗管理パネル                                                                    |
| DB                     | **変更なし**                                                                                                                                                              |

## データフロー

### 単価表示（①）

```
DB: unit_price_amount = 29.8   （100g 基準の正準値。変更しない）
        ↓ PriceRecordDto.unitPriceAmount = 29.8, packageSizeUnit = 'kg'
formatUnitPrice(29.8, 'kg')
        ↓ 基準を選ぶ: kg → { factor: 10, label: '1kg' }
        ↓ 29.8 × 10 = 298 → 0.1 単位へ丸め
    "298円 / 1kg"
```

比較（最安店舗の判定 `Product.cheapestStoreAt`）は従来どおり**正準値**で行う。
表示だけを換算するため、300g の記録と 1kg の記録が混ざっても比較結果は変わらない。

### 価格記録の削除（②）

```
[記録行のゴミ箱ボタン] → setPendingDeleteRecord(record)
    → 確認ダイアログ（店舗名・価格・内容量を出す）
    → 「削除する」
    → DELETE /api/products/:id/price-records/:priceRecordId
         → 204        : router.refresh()（Server Component が再フェッチ）
         → 404        : 成功扱い（削除は冪等）。router.refresh()
         → その他      : エラーバナー。表示は変えない

サーバー:
Hono DELETE → zValidator('param', priceRecordIdParamSchema)
  → DeletePriceRecordUseCase.execute({ productId, priceRecordId })
      → findById()             … 無ければ ProductNotFoundError（404）
      → 価格履歴に無ければ      … PriceRecordNotFoundError（404）
      → Product.removePriceRecord()
      → repository.save()      … notInArray で該当行が DELETE される
  → 204
```

### 店舗の削除（③）

```
[店舗管理パネルの削除ボタン] → setPendingDeleteStore(store)
    → 確認ダイアログ
    → DELETE /api/stores/:id
         → 204 : 一覧から除去。選択中だった場合は選択解除（F-7）
         → 404 : 成功扱い。一覧から除去
         → 422 : 「この店舗は価格記録 3 件・買い物リスト 1 件で使われているため削除できません。」
         → その他 : 汎用エラーメッセージ

サーバー:
Hono DELETE → zValidator('param', idParamSchema)
  → DeleteStoreUseCase.execute(id)
      → storeRepository.findById()                     … 無ければ StoreNotFoundError（404）
      → productRepository.countPriceRecordsByStore()   ┐ 並行実行（Promise.all）
      → shoppingListRepository.countItemsByStore()     ┘
      → 合計 > 0 なら StoreInUseError（422）
      → storeRepository.delete()
  → 204
```

## API 設計

### `DELETE /api/products/:id/price-records/:priceRecordId`

| 項目   | 値                                                                       |
| ------ | ------------------------------------------------------------------------ |
| param  | `priceRecordIdParamSchema` = `{ id: uuid, priceRecordId: uuid }`（新規） |
| ボディ | なし                                                                     |
| 成功   | **204 No Content**                                                       |
| 404    | 商品が存在しない / 価格記録が存在しない                                  |
| 400    | パスパラメータが UUID でない                                             |

`shoppingItemIdParamSchema` と同じく `idParamSchema.extend({ ... })` で作る。

### `DELETE /api/stores/:id`

| 項目   | 値                                            |
| ------ | --------------------------------------------- |
| param  | `idParamSchema`（**既存を再利用**）           |
| ボディ | なし                                          |
| 成功   | **204 No Content**                            |
| 404    | 店舗が存在しない                              |
| 422    | 店舗が価格記録 / 買い物品目から参照されている |
| 400    | `id` が UUID でない                           |

204 とボディなしは `recipes.ts` / `products.ts` / `meal-plans.ts` /
`shopping-lists.ts` の既存例と揃える。エラー → HTTP 変換は `app.ts` の既存 `onError` に乗せ、
**ルート層では try/catch しない**。

### レスポンス DTO の変更

`PriceRecordDto` に `id: string` を追加する。既存フィールドは変えない（後方互換）。

## DB 設計

**変更なし。**

- 価格記録の削除: `DrizzleProductRepository.save()` が既に
  `delete(priceRecords).where(and(eq(productId), notInArray(id, currentIds)))` で
  「集約に無い行」を消す。集約から取り除くだけで永続化まで追随する。
  `currentIds` が空のとき（最後の 1 件を消したとき）は当該商品の全行 DELETE に落ちる。
- 店舗の削除: `delete(stores).where(eq(stores.id, ...))` を素で発行する。UseCase が先に
  参照ゼロを確認しているため `price_records` の FK（`restrict`）には触れない。
- 参照件数: `COUNT(*)` を 2 本。索引の追加はしない（要件定義書 §非機能要件）。

## フロントエンド設計

### ① 単価表示は `product-format.ts` の純関数に閉じる

```ts
interface UnitPriceBasis {
  /** 保存されている正準値（100g / 100ml / 1 単位あたり）に掛ける倍率 */
  factor: number;
  /** 表示ラベル */
  label: string;
}
```

| 単位     | factor | label     |
| -------- | ------ | --------- |
| `kg`     | 10     | `1kg`     |
| `g`      | 1      | `100g`    |
| `l`      | 10     | `1L`      |
| `ml`     | 1      | `100ml`   |
| 上記以外 | 1      | `1<単位>` |

**判定は `UnitPriceCalculator` と同じ厳密一致（`Set` への `has`）にする。** 表示側だけ
`toLowerCase()` や NFKC 正規化を足すと、`'KG'` のような入力で「正準化は 1 単位あたり・表示は
1kg 基準」という食い違いが生まれ、単価が 10 倍ズレて出る。**正準化側を変えない以上、
表示側も同じ判定にするのが唯一安全**（要件 B-4）。

公開する関数は `formatUnitPrice(unitPriceAmount, unit): string`（`"298円 / 1kg"` を返す）の 1 本。
呼び出し 3 箇所（`product-card.tsx` ×1、`product-detail-client.tsx` ×2）は
`{formatYen(amount)} / {unitPriceBasisLabel(unit)}` からこの 1 呼び出しに置き換える。
既存の `unitPriceBasisLabel` は**削除する** — 金額とラベルは常に対で出るため、
置き換え後の呼び出し元がゼロになり、残すとテストだけが参照する死んだ公開 API になる。丸めは `Math.round(x * 10) / 10` で 0.1 単位。
保存値が既に 0.1 単位に丸められているため、`×10` しても 0.1 単位を超える桁は出ない。

### ② 価格記録の削除ボタン

- `product-detail-client.tsx` の「最近の記録」の各行に `Trash2` アイコンボタンを足す。
- 確認ダイアログは**クライアントに 1 つだけ**置き、`pendingDeleteRecord: PriceRecordDto | null`
  で制御する（`shopping-item-remove` の先例）。行ごとに `AlertDialog` を置くと DOM が増える。
- `key` を `record.id` に変える。従来の `` `${storeId}-${observedAt}` `` は同一店舗・同一時刻の
  記録で衝突しうる。
- 楽観的更新はしない。この画面は Server Component からの props で状態を持ち、
  `useOptimistic` の基盤が無い。削除は買い物中の連打操作ではないので `router.refresh()` の
  往復（数百 ms）で足りる。**この点は買い物リストの削除（楽観的更新あり）と方針が異なる。**
- 404 は成功扱い（削除は冪等）。
- 削除中は該当行のボタンのみ `disabled` にする。

### ③ 店舗管理パネル

`price-record-form.tsx` の店舗プルダウン直下にある破線パネルを「店舗の管理」に拡張する。

- **プルダウンの中（`Select.Item`）に削除ボタンは置かない。** Base UI の `Select.Item` は
  `role="option"` で描画され、その内側に `<button>` を入れ子にすると
  (1) ARIA 的に不正（`option` の子に対話要素を置けない）、
  (2) 項目クリックの選択挙動とボタンの `onClick` が競合する。
  プルダウンは選択専用のまま、管理はすぐ下のパネルで行う。
- パネルの中身: 登録済み店舗を 1 行ずつ並べ、右端に `Trash2` の削除ボタン。その下に
  既存の「追加する店舗名」入力＋追加ボタン。
- 確認ダイアログは 1 つを制御モードで持つ（`pendingDeleteStore: StoreDto | null`）。
- 422 のとき、レスポンスボディの `error` から件数を取り出さず、**クライアントは
  「使用中のため削除できません」旨の固定文言に、サーバーが返した内訳を添えて出す**。
  内訳はサーバーのメッセージ文字列をそのまま出すと英語になるため、
  UseCase 側で件数を持つ `StoreInUseError` を定義し、クライアントは**件数を数値として**
  受け取れるようにする… のが理想だが、既存の `onError` は `{ error: message }` しか返さない。
  ここは既存契約を変えず、**クライアント側で 422 = 使用中と判断して日本語の固定文言を出す**。
  件数はサーバーログとテストのために例外メッセージへ残す。
- 削除に成功した店舗が選択中だった場合は `setStoreId('')` に戻す（F-7）。
- 店舗が 0 件になったらプルダウンは既存ロジックで `disabled` になる。

## バックエンド設計

### Domain

```ts
// Product
/**
 * 価格記録を 1 件取り除く。誤って記録した価格・内容量を消して記録し直すための操作。
 *
 * @throws Error 指定 ID の価格記録が存在しない場合
 */
removePriceRecord(priceRecordId: PriceRecordId): void {
  const exists = this.productPriceHistory.some((record) => record.id.equals(priceRecordId));
  if (!exists) {
    throw new Error(`Price record not found: ${priceRecordId.value}`);
  }
  this.productPriceHistory = this.productPriceHistory.filter(
    (record) => !record.id.equals(priceRecordId),
  );
  this.touch();
}
```

`Store` エンティティ自体は変更しない（削除はリポジトリの操作であり、集約の状態遷移ではない）。

リポジトリインターフェースの追加:

```ts
// StoreRepository
delete(id: StoreId): Promise<void>;

// ProductRepository
/** 指定店舗を参照する価格記録の件数。店舗削除の可否判定に使う。 */
countPriceRecordsByStore(storeId: StoreId): Promise<number>;

// ShoppingListRepository
/** 指定店舗を購入予定店舗または実購入店舗として参照する品目の件数。 */
countItemsByStore(storeId: StoreId): Promise<number>;
```

`ProductRepository` / `ShoppingListRepository` に「件数だけ返す」メソッドを足すのは、
集約全件をメモリに載せて数えるのを避けるため。返り値がプリミティブなので集約の
カプセル化は壊れない。

### Application

```ts
export class DeletePriceRecordUseCase {
  constructor(private readonly productRepository: ProductRepository) {}
  async execute(input: DeletePriceRecordInputDto): Promise<void>;
}

export class DeleteStoreUseCase {
  constructor(
    private readonly storeRepository: StoreRepository,
    private readonly productRepository: ProductRepository,
    private readonly shoppingListRepository: ShoppingListRepository,
  ) {}
  async execute(storeId: string): Promise<void>;
}
```

新規エラー:

- `PriceRecordNotFoundError extends NotFoundError` → 404
- `StoreInUseError extends InvalidOperationError` → 422。
  メッセージは `` `Store ${id} is in use (price records: ${n}, shopping items: ${m})` ``。
  件数を持つのは、テストとログで「何が参照を残しているか」を追えるようにするため。

検査順は `shopping-item-remove` の先例に合わせ、**存在確認 → 状態（参照）確認 → 変更 → 保存**。

### Infrastructure

```ts
// DrizzleStoreRepository
async delete(id: StoreId): Promise<void> {
  await this.db.delete(stores).where(eq(stores.id, id.value));
}

// DrizzleProductRepository
async countPriceRecordsByStore(storeId: StoreId): Promise<number> {
  const rows = await this.db
    .select({ value: count() })
    .from(priceRecords)
    .where(eq(priceRecords.storeId, storeId.value));
  return rows[0]?.value ?? 0;
}

// DrizzleShoppingListRepository
async countItemsByStore(storeId: StoreId): Promise<number> {
  const rows = await this.db
    .select({ value: count() })
    .from(shoppingItems)
    .where(
      or(
        eq(shoppingItems.targetStoreId, storeId.value),
        eq(shoppingItems.actualStoreId, storeId.value),
      ),
    );
  return rows[0]?.value ?? 0;
}
```

Drizzle の `count()` は `numeric` ではなく number を返す（`drizzle-orm` の集約ヘルパ）。

## エラー処理

外部 API / 外部ストレージへの I/O を含まない（DB のみ）ため、リトライ・タイムアウト・
フォールバックの各項目は**対象外**。

- **部分失敗**: 店舗削除は「参照件数の確認」と「DELETE」が別トランザクション。
  確認と削除の間に参照が生まれた場合、`price_records` の FK（`restrict`）が最後の砦として
  働き 500 になる。2 人利用・同時操作がほぼ起きない前提で追加のロックは入れない
  （ADR-0012 §Consequences に既知の制約として記載）。
- **冪等性**: 2 回目の削除はサーバー側で 404。**クライアントが 404 を成功として扱う**ことで、
  ユーザーから見た削除操作は冪等になる（`shopping-item-remove` と同じ扱い）。
- ドメイン境界（UseCase の入口）で存在と参照を検査し、既存のエラー基底を継承した
  例外を投げる。ルート層は変換せず `onError` に委ねる。

## ログと監視

**対象外**（本プロジェクトに構造化ログ・監視基盤は無い）。`onError` の 500 経路のみ
`console.error` に出る既存挙動を維持する。

## セキュリティ

MVP1 は認証なし（ADR-0003）のため認可の観点は**対象外**。パスパラメータは `zValidator` で
UUID 形式を検証し、Drizzle のパラメタライズドクエリを通すため SQL インジェクションの経路は無い。
削除系エンドポイントが 2 本増えるが、既存の削除系（商品・レシピ・献立・買い物品目）と
同じ露出レベルである。

## 性能

- 参照件数は `COUNT(*)` 2 本を `Promise.all` で並行実行。件数は数百規模で索引なしでも十分。
- 価格記録の削除は既存 `save()` の「全行 upsert + 差分 DELETE」に乗るため、クエリ本数は増えない。
- 単価表示の換算は乗算 1 回。**追加の最適化は対象外。**

## テスト方針

`docs/tests/store-delete-and-unit-price-basis.md` を正とする。層ごとの要点:

- 純関数（`product-format`）: 5 単位 ×（ラベル / 換算値）、丸め、未知単位
- Domain（`Product.removePriceRecord`）: 削除成功 / 他記録が不変 / 存在しない ID で throw /
  最後の 1 件 / `updatedAt` の更新 / `priceHistory` の防御的コピー維持
- Application: 2 UseCase の正常系・404・422・「拒否時に delete を呼ばない」・検査順
- Infrastructure（PGlite）: 店舗の物理削除 / 件数クエリ（`target` のみ・`actual` のみ・両方）/
  価格記録の削除が行に反映されること
- Hono ルート: 204 / 400 / 404 / 422（既存の `vi.mock('@cookpit/application')` パターン）
- Web（RTL）: 削除ボタンの描画・確認ダイアログ・成功後の再取得・422 の文言・
  選択中店舗の削除で選択解除・単価表示の 1kg 表記

テストファイル名は apps/web の vitest `include`（`src/server/**/*.test.ts` / `*.test.tsx`）に
合わせる。素の `src/**/*.test.ts` は silent skip になるため使わない
（`product-format` は既存の `*.node.test.ts` に追記する）。

## 移行とリリース

DB 変更なし・既存契約の破壊的変更なしのため、特別な移行手順は**不要**。デプロイ順序の制約もない。

リリース後にユーザーが行う復旧手順:

1. 商品詳細 → 「最近の記録」で `3001kg` の行を削除
2. 「価格を記録」から内容量 `1kg` で記録し直す
3. 店舗管理パネルから不要な店舗を削除

## リスク

| リスク                                                                                      | 対策                                                                                                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 表示側だけ単位判定を正規化して、正準化側とズレて単価が 10 倍になる                          | `UnitPriceCalculator` と同じ厳密一致の `Set` を使う。テストで `'KG'` が「その他」扱いになることを固定する                         |
| リポジトリインターフェースへのメソッド追加でテスト用 InMemory 実装 6 箇所がコンパイルエラー | `pnpm type-check` が確実に検出する。6 箇所すべてに実装を足す（うち 1 つは `test-helpers.ts` の共有実装）                          |
| 「参照ゼロ確認 → 削除」の競合                                                               | FK `restrict` が最後の砦。ADR-0012 に既知の制約として記載                                                                         |
| 価格記録を全部消すと最安店舗カードが「未登録」に変わる                                      | 仕様どおり（要件 B-1）。確認ダイアログで「元に戻せません」と明示                                                                  |
| 店舗名を打ち間違えたまま価格を記録すると、その店舗はもう消せない                            | ADR-0012 の受容したトレードオフ。リネーム機能は今回の対象外（申し送り）                                                           |
| 新規 DELETE ルートが既存パスと食い合う                                                      | `products.ts` の既存 `DELETE /:id` とはパスが異なり、`POST /:id/price-records` とはメソッドが異なる。ルートテストで既存解決を確認 |

## 未決事項

なし。3 論点（表示基準・修正手段・削除時の参照の扱い）と、プルダウン内ではなく直下の
パネルに管理 UI を置く方針は、いずれもユーザー確認済み。
