# 設計書: price-record-edit-and-store-rename

- ステータス: draft
- レベル: L3
- 関連: `docs/requirements/price-record-edit-and-store-rename.md` /
  [ADR-0015](../decisions/ADR-0015-store-rename-for-typo-correction.md)（accepted・2026-08-05 起票済み） /
  ADR-0012（superseded） / ADR-0013（accepted）

## 背景

`docs/05-roadmap.md` Sprint 7 の完了条件「打ち間違えた店舗名・価格記録を画面から修正できる」が
未達で残っている。現状、価格記録は追加・削除のみ、店舗名の更新 API・UI は存在しない
（詳細は要件定義書 §背景）。

### ADR-0015 で扱う決定事項（2026-08-05 起票済み・正典は ADR-0015）

店舗のリネームは 2026-07-27 の ADR-0013 で一度検討され、却下されている
（`docs/decisions/ADR-0013-store-limit-and-delete-cascade.md` §Alternatives 案C）。

> 重複店舗を「1 つに統合する」のが本質的な要求なら、リネームではなくマージ
> （価格記録の store_id を付け替えて片方を消す）が必要になる。（中略）
> リネーム単体では重複は解消しない（名前が同じ店舗が 2 つ残る）。

この却下理由は**重複統合**という目的に対する評価であり、今回の目的（**打ち間違いの訂正**）とは
別物である。次の 4 論点は
[ADR-0015](../decisions/ADR-0015-store-rename-for-typo-correction.md)（Accepted・2026-08-05）で
確定済みで、そちらが正典。ADR-0013 の Status は `accepted` のまま維持され、本タスクは
ADR-0013 の結論を覆さない。

1. ADR-0013 案C の却下理由の射程は「重複統合」に限られ、「誤字訂正」目的のリネームには
   当てはまらないこと（＝ADR-0013 の結論を覆すものではないこと）の明文化。
2. リネームに同名禁止ルール（`normalizeStoreName` + `findByNormalizedName`）を適用し、
   自分自身との比較では衝突と判定しない設計判断の記録。
3. `Store` Entity に `rename()` を追加する（不変性の一部緩和）という Domain 層の変更の記録。
4. ADR-0012 が残した「使ってしまった店舗はもう消せない」というリスク記述の扱い
   （リネームという訂正手段が加わったことで、削除以外の回避策が生まれたことの反映）。

## 目的

1. 商品詳細画面「最近の記録」から、価格記録（店舗・価格・内容量）を編集できるようにする。
2. 店舗名を編集（リネーム）できるようにする。
3. いずれも削除して記録し直す運用を不要にし、Sprint 7 の残り完了条件を満たす。

## 要件

`docs/requirements/price-record-edit-and-store-rename.md` を参照。主要な確定事項（Orchestrator
経由でユーザー確定済み・変更しない）:

- **D-1**: 価格記録の編集可能項目は価格・内容量・店舗。単価は `UnitPriceCalculator` で再計算する。
  記録日時（`observedAt`）は元の値を維持し、編集対象外。
- **D-2**: 編集対象は商品詳細「最近の記録」直近 5 件のまま。表示件数の拡張はしない。
- **D-3**: ドメイン設計は差し替え方式。`Product.updatePriceRecord()` が新しい `PriceRecord` を
  生成して配列内を置換する。`PriceRecord` の不変性は維持し、`PriceRecord.create()` の正数
  バリデーションを再利用する。`PriceRecord.update()` は作らない。
- **D-4**: ADR は新規に起こす（ADR-0015）。本書は論点整理のみ行う。

## 対象範囲

- Domain 層: `Product.updatePriceRecord()`、`Store.rename()` の追加。
- Application 層: `UpdatePriceRecordUseCase`、`RenameStoreUseCase` の新設。DTO・mapper の拡張。
- api-contract: 価格記録更新・店舗リネームのリクエストスキーマの方針（最終形は contract-designer）。
- Presentation 層（`apps/web`）: `PUT /api/products/:id/price-records/:priceRecordId`、
  `PUT /api/stores/:id` の Hono ルート。商品詳細画面「最近の記録」への編集導線、店舗管理カードへの
  リネーム導線。

## 対象外

- 記録日時の編集、6 件目以降の価格記録の編集、店舗のマージ（統合）機能、店舗上限件数の変更、
  変更履歴（監査ログ）の保存、独立した店舗管理画面の新設、価格記録の一括編集、DB スキーマ変更、
  認証・権限制御の追加。（詳細は要件定義書 §対象外）

## 現状構成

### 価格記録

- API: `POST /api/products/:id/price-records`（新規記録）、
  `DELETE /api/products/:id/price-records/:priceRecordId`（削除）のみ
  （`apps/web/src/server/routes/products.ts:58-79`）。
- Application: `RecordPriceUseCase`（`packages/application/src/product/record-price.use-case.ts`）が
  `UnitPriceCalculator.calculate()` で単価を計算し `Product.recordPrice()` を呼ぶ。
  `DeletePriceRecordUseCase` が `Product.removePriceRecord()` を呼ぶ。
- Domain: `PriceRecord`（`packages/domain/src/product/product.ts:19-84`）は全フィールド
  `private readonly`。生成は `create()` / `reconstruct()` のみで更新手段が無い。
  `Product` は `recordPrice()`（追加）・`removePriceRecord()`（削除）のみを持つ。
- UI: `apps/web/src/app/products/[id]/_components/product-detail-client.tsx` の
  「最近の記録」セクション（直近 5 件・`sortPriceHistoryByObservedAt().slice(-5).reverse()`、
  36-37 行目）。各行に削除ボタン（ゴミ箱アイコン）のみ。編集導線は無い。
- 新規記録フォームは `apps/web/src/app/products/[id]/_components/price-record-form.tsx`
  （`PriceRecordForm`）。店舗プルダウン + 価格 + 内容量の入力に加え、店舗の追加・削除も
  同じコンポーネントの中で行っている（店舗管理カード、369-432 行目）。

### 店舗

- API: `GET /api/stores`・`POST /api/stores`・`GET /api/stores/:id/usage`・
  `DELETE /api/stores/:id` のみ（`apps/web/src/server/routes/stores.ts`）。`PUT` は無い。
- Application: `CreateStoreUseCase`（上限 3 件・同名禁止）、`DeleteStoreUseCase`
  （カスケード削除）、`GetStoreUsageUseCase`（削除で失われる件数の事前提示）。更新系は無い。
- Domain: `Store`（`packages/domain/src/shared/store.ts:44-74`）は `storeName` を含む全フィールドが
  `private readonly`。更新メソッドが無い。
- UI: 独立した店舗一覧画面は無い。`PriceRecordForm` 内の店舗管理カードで、店舗名の一覧表示・
  追加・削除ができる。リネーム導線は無い。

### Infrastructure（参考・変更対象外）

- `DrizzleProductRepository.save()`（`packages/infrastructure/src/repositories/drizzle-product.repository.ts:66-117`）:
  `products` を `onConflictDoUpdate` で upsert したのち、`priceRecords` を
  「現在の集約に無い ID を削除 → 残りをバッチ `onConflictDoUpdate`」で同期する。バッチ upsert は
  `excluded.*` で行ごとに自身の値へ更新するため、**既存 ID のまま値を差し替えて `save()` すれば
  そのまま更新になる**（新規行は増えない）。統合テスト `IR-P-06`（既存行の upsert 上書き）・
  `IR-P-08`（複数行バッチ upsert が各行を自身の値で更新する）で担保済み。
- `DrizzleStoreRepository.save()`（`packages/infrastructure/src/repositories/drizzle-store.repository.ts:33-44`）:
  `name` を `onConflictDoUpdate` で upsert している。既存 ID のまま `name` を変えて `save()` すれば
  そのまま更新になる。

## 変更後構成

### Domain 層

`packages/domain/src/product/product.ts` の `Product` に差し替え方式のメソッドを追加する。

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

設計判断: `observedAt` の維持を **Domain 側で保証する**（呼び出し側の Application 層に
「維持し忘れ」の余地を残さない）。`unitPrice` は呼び出し側（Application 層）が
`UnitPriceCalculator.calculate()` で計算して渡す。これは既存の `RecordPriceUseCase`
（`packages/application/src/product/record-price.use-case.ts:41-50`）と同じ責務分担であり、
新しい非対称性を持ち込まない。

`packages/domain/src/shared/store.ts` の `Store` に `rename()` を追加する。これに伴い
`storeName` を `private readonly` から `private` へ変更する（Product の他フィールドと同様、
可変フィールドは既に `Product` に前例がある）。

```typescript
export class Store {
  private constructor(
    private readonly storeId: StoreId,
    private storeName: string, // readonly を外す
    private readonly createdDate: Date,
  ) {}

  // ...create() / reconstruct() は変更なし

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

### Application 層

`packages/application/src/product/update-price-record.use-case.ts`（新設）

```typescript
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
    // 1. productRepository.findById() → ProductNotFoundError
    // 2. product.priceHistory に priceRecordId が存在するか確認 → PriceRecordNotFoundError
    //    （DeletePriceRecordUseCase と同じ事前確認パターンを踏襲し、エラー種別を Product 未存在と
    //    区別する。Product.updatePriceRecord() 自体も存在しなければ Error を投げるが、
    //    ドメイン境界での型付きエラーへの変換はここで行う）
    // 3. storeRepository.findById() → StoreNotFoundError
    // 4. Money.of(input.priceAmount, 'JPY') / Quantity.of(...) を組み立てる
    // 5. UnitPriceCalculator.calculate(price, packageSize) で単価を再計算する
    // 6. product.updatePriceRecord(priceRecordId, { storeId, price, unitPrice, packageSize })
    // 7. productRepository.save(product)
    // 8. storeRepository.findAll() → toStoreDto の storeMap を作り toProductDto() で DTO化して返す
  }
}
```

`RecordPriceUseCase` とほぼ同じ組み立て（`Money.of` → `Quantity.of` →
`UnitPriceCalculator.calculate`）を踏襲する。相違点は「新規 `PriceRecordId.generate()` /
`observedAt: new Date()`」ではなく「既存 ID・既存 `observedAt` を維持したまま置換する」こと。

`packages/application/src/store/rename-store.use-case.ts`（新設）

```typescript
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

DTO 追加:

- `packages/application/src/product/product.dto.ts`:
  `UpdatePriceRecordInputDto { productId: string; priceRecordId: string; storeId: string; priceAmount: number; packageSizeValue: number; packageSizeUnit: Unit }`
- `packages/application/src/store/store.dto.ts`:
  `RenameStoreInputDto { id: string; name: string }`

`GetStoreUsageUseCase` は変更しない。リネーム時の注意喚起（後述 §フロントエンド設計）に
既存のまま再利用する。

### api-contract 層（方針。最終形は contract-designer）

- 価格記録更新のリクエストボディは既存 `recordPriceSchema`
  （`packages/api-contract/src/product.schema.ts:33-38`）と同じ形
  （`storeId: uuid`, `priceAmount: positive`, `packageSizeValue: positive`, `packageSizeUnit`）を
  再利用する想定。新規記録と共有できるかスキーマの切り出し可否は contract-designer が判断する。
- 店舗リネームのリクエストボディは既存 `createStoreSchema`
  （`packages/api-contract/src/store.schema.ts:8-10`）と同じ形（`name: nonBlankString`）を
  再利用する想定。
- レスポンス型は §API 設計 のとおり、価格記録更新は `ProductDto` 相当、店舗リネームは
  `StoreDto`（`storeResponseSchema`）を想定。

### Infrastructure 層・DB スキーマ

**変更不要。** 根拠は §現状構成「Infrastructure（参考・変更対象外）」のとおりで、
両リポジトリの `save()` が既存 ID のまま値を差し替える更新を `onConflictDoUpdate` で
サポート済みであることを既存の統合テスト（`IR-P-06`・`IR-P-08`）で確認した。

## データフロー

### 価格記録の編集

```
[商品詳細] 「最近の記録」の行の鉛筆アイコンをクリック
  → PriceRecordEditDialog が開く（対象記録の店舗・価格・内容量を初期値に設定）
  → 店舗一覧を GET /api/stores で取得（ダイアログを開くたびに取得。フォームの店舗管理カードで
    追加・削除された直後でも常に最新の一覧になる）
  → ユーザーが値を編集し「保存」
  → PUT /api/products/:productId/price-records/:priceRecordId
    → zValidator でボディ検証
    → UpdatePriceRecordUseCase.execute()
      → ProductRepository.findById() / 存在確認
      → 対象 priceRecordId の存在確認
      → StoreRepository.findById() / 存在確認
      → UnitPriceCalculator.calculate() で単価再計算
      → Product.updatePriceRecord() で差し替え（id・observedAt 維持）
      → ProductRepository.save()（upsert）
      → StoreRepository.findAll() → ProductDto を組み立てて返す
    → 200 + ProductDto
  → クライアントはレスポンスボディを使わず router.refresh() で
    Server Component 経由の再取得に揃える（既存の他の書き込み操作と同じパターン。
    §API 設計「なぜ ProductDto を返すか」参照）
  → ダイアログを閉じる
```

### 店舗のリネーム

```
[商品詳細] 店舗管理カードの店舗行にある鉛筆アイコンをクリック
  → StoreRenameDialog が開く（現在の店舗名を初期値に設定）
  → GET /api/stores/:id/usage を取得し、priceRecordCount > 0 なら注意文を表示
    （取得失敗時は注意文を出さずに続行させる。削除確認ダイアログの requestDeleteStore と
    同じ「補助情報の取得失敗は操作を止めない」方針を踏襲）
  → ユーザーが名前を編集し「保存」
  → PUT /api/stores/:id
    → zValidator でボディ検証
    → RenameStoreUseCase.execute()
      → StoreRepository.findById() / 存在確認
      → normalizeStoreName() + findByNormalizedName()（自分自身は除外）
      → Store.rename()
      → StoreRepository.save()（upsert）
    → 200 + StoreDto
  → クライアントは店舗一覧のローカル state を更新し、router.refresh() で商品・
    価格記録側の表示（storeName は toStoreDto の storeMap 経由で解決される）も揃える
  → ダイアログを閉じる
```

## API 設計

### `PUT /api/products/:id/price-records/:priceRecordId`（新設）

| 項目               | 内容                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| パスパラメータ     | `id`（商品 UUID）、`priceRecordId`（価格記録 UUID）。既存 `priceRecordIdParamSchema` を再利用                                                                                   |
| リクエストボディ   | `{ storeId: string(uuid), priceAmount: number(positive), packageSizeValue: number(positive), packageSizeUnit: Unit }`（`recordPriceSchema` と同形。最終形は contract-designer） |
| レスポンス（成功） | `200` + 更新後の `ProductDto`（`priceHistory` を含む集約全体）                                                                                                                  |
| レスポンス（異常） | `404`（`ProductNotFoundError` / `PriceRecordNotFoundError` / `StoreNotFoundError`）、`400`（Zod バリデーション）                                                                |

**なぜ `ProductDto` を返すか**: 既存の `PUT /api/products/:id`
（`UpdateProductUseCase` → `c.json(product)`）は更新後の資源全体を返す慣習であり、`PUT` の
意味論（べき等な置き換え）にも合う。一方、隣接する `POST /price-records` は本文無し 200
を返す「コマンド」寄りの慣習である。新設エンドポイントは `PUT` なので前者の慣習に揃える。
ただし Presentation 層のクライアント状態管理は「Server Component が真実の源、書き込み後は
`router.refresh()`」という既存の一貫した方針（商品詳細画面の他の全ミューテーションが
この方針）を優先し、レスポンスボディは使わずに `router.refresh()` する。ボディを持たせておくのは
将来クライアント側の状態管理を最適化する余地を残すためで、今回の実装では消費しない。

### `PUT /api/stores/:id`（新設）

| 項目               | 内容                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| パスパラメータ     | `id`（店舗 UUID）。既存 `idParamSchema` を再利用                                                 |
| リクエストボディ   | `{ name: string(non-blank, max 255) }`（`createStoreSchema` と同形。最終形は contract-designer） |
| レスポンス（成功） | `200` + 更新後の `StoreDto`（`storeResponseSchema` 形）                                          |
| レスポンス（異常） | `404`（`StoreNotFoundError`）、`422`（`DuplicateStoreNameError`）、`400`（Zod バリデーション）   |

`roadmap` の記載（`PUT /api/stores/:id`）どおりのメソッド・パスを採用する。

### 既存エンドポイントへの影響

無し。`POST /price-records`・`DELETE /price-records/:id`・`POST /stores`・`DELETE /stores/:id`・
`GET /stores/:id/usage` はいずれも変更しない。

## DB 設計

対象外。DB スキーマ変更・マイグレーションは不要（§現状構成「Infrastructure」の根拠のとおり、
両リポジトリの `save()` が既存 ID を維持した更新をすでにサポートしている）。

## フロントエンド設計

### 論点1: 店舗リネームの波及と注意喚起

`price_records.store_id` は ID 参照のため、店舗名を変えると過去の全価格記録・買い物品目の
**表示名が一斉に変わる**。これは「訂正」としては正しい挙動だが、「A店で買った記録のつもりが
リネームでB店表示に変わった」という誤用（間違った店舗を選んでリネームした場合）のリスクがある。

**採用案（ユーザー確定・2026-08-05。U-2 解消）**: リネームダイアログを開いた時点で
`GET /api/stores/:id/usage` を呼び、
`priceRecordCount > 0` のときだけインライン警告文を表示する。

```
この店舗の価格記録 {priceRecordCount} 件の表示名も変わります。
違う店舗を選んでいないか確認してください。
```

削除操作のような**確認ステップ付き AlertDialog**（キャンセル/削除するボタンの二段階）までは
設けない。理由:

- リネームはデータを失わない可逆操作（誤って変えても再度リネームすれば戻せる）。
  削除（不可逆・カスケード物理削除）と同じ強さの確認は過剰。
- 警告文で十分に「影響範囲が全記録に及ぶ」ことを伝えられる。
- `priceRecordCount` は `GetStoreUsageUseCase` の既存戻り値をそのまま使えるため、新規 API 不要。

トレードオフとして「誤って別の店舗をリネームしてしまう」事故は警告文だけでは完全には防げないが、
2 人運用・店舗 3 件以内という規模ではリスクは限定的と判断する（削除確認と同水準にすると、
名前を1文字直すだけの軽微な操作にも二段階確認を強いることになり、UX 上の負担が大きい）。

### 論点2: リネーム時の同名チェック

`normalizeStoreName()` + `findByNormalizedName()` をリネームにも適用する
（§Application 層 `RenameStoreUseCase` 参照）。自分自身との衝突は次のとおり除外する。

- `findByNormalizedName()` の結果が「対象店舗自身」であれば衝突と判定しない
  （`duplicate.id.equals(storeId)` で判定）。これにより、同じ名前のまま保存し直す操作（N-08）や、
  大文字小文字だけを変える操作（N-07・"Life" → "life" は `normalizeStoreName` 後も別の文字列
  なので、そもそも自分自身ヒットにならず通常のリネームとして通る）の両方をカバーする。
- クライアント側の事前ヒント（`apps/web/src/app/products/_utils/store-name.ts` の
  `isDuplicateStoreName`）も同じロジックで「自分自身を除いた比較」に対応させる。具体的には
  `StoreRenameDialog` が `isDuplicateStoreName` へ渡す既存名リストから編集対象自身の名前を
  あらかじめ除外して呼び出す（ユーティリティ関数自体は変更しない）。

### 論点3: 店舗変更が価格比較へ与える影響

編集で `storeId` を変えると `Product.cheapestStoreAt()`
（`packages/domain/src/product/product.ts:201-211`）や買い物リスト詳細の単価比較
（`apps/web/src/app/shopping-lists/_utils/price-comparison.ts`）の結果が、次に読み取られた
タイミングで自動的に変わる。これはいずれも**都度計算**（キャッシュを持たない）ため、
編集後に無効化すべき状態は無い。`router.refresh()` で Server Component を再実行すれば
最新の計算結果が画面に反映される。

同一店舗の記録が複数になる／無くなるケースは、いずれも既存ロジックがすでに扱う範囲に収まる。

- **複数になるケース**（例: A店の記録をB店からA店へ編集し、A店に元々あった記録と重複）:
  `latestRecordsByStoreAt()`（`product.ts:280-303`）・`pickLatestRecordPerStore()`
  （`price-comparison.ts:58-72`）はどちらも店舗ごとに `observedAt` 最大の 1 件だけを採用する
  設計のため、複数件あっても最新の 1 件に自動的に絞られる。
  - **タイブレークの既知の注意点**: 編集は元の `observedAt` を維持するため、理論上は
    「編集前から同じ `observedAt` を持つ 2 件が、編集後に同じ店舗を指す」状態が作れる
    （通常運用では `observedAt` は記録時刻がそのまま入るため衝突しにくいが、ゼロではない）。
    この場合の勝者は `product.ts` 側が「後着ちの厳密な `>`」、`price-comparison.ts` 側が
    「`>=`（後に見つかった方）」で決まり、両者の判定基準はすでに異なる（既存の実装済み挙動）。
    本タスクが新たに持ち込む不整合ではないため、追加対応はしない。
- **無くなるケース**（例: A店唯一の記録をB店へ編集）: A店は `latestRecordsByStoreAt()` の対象から
  自然に外れ、`cheapestStoreAt()` の候補にならなくなる。買い物リストの単価内訳
  （`buildStoreUnitPriceBreakdown()`）も同様に自然に除外される。特別な後始末は不要。

### 論点4: 編集 UI の形

既存の削除は `AlertDialog`（`apps/base-ui` 由来の汎用モーダル。`AlertDialogPopup` は
「警告」専用ではなく任意の内容を置けるコンポーネント）。編集はフォームが要る
（店舗プルダウン + 価格 + 内容量）。

**`PriceRecordForm` は編集に再利用しない。** 新規に `PriceRecordEditDialog`
（`apps/web/src/app/products/[id]/_components/price-record-edit-dialog.tsx`）を作る。

再利用しない理由:

1. `PriceRecordForm`（実物: `apps/web/src/app/products/[id]/_components/price-record-form.tsx`）は
   「新規記録の入力」に加えて「店舗の追加・削除」という別ドメインの操作（369-432 行目の
   店舗管理カード）まで抱えた複合コンポーネントである。編集ダイアログにその機能は不要で、
   混在させると誤操作を誘発する。
2. 新規記録は「常に今日時刻の新しい `observedAt` を作る」操作（`RecordPriceUseCase` が
   `observedAt: new Date()` を生成）だが、編集は「既存の `observedAt` を保持する」操作
   （D-1・D-3）で、送信メソッドも `POST` と `PUT` で異なる。フォーム内部に
   「モードフラグ」を増やして分岐させるより、責務の異なる別コンポーネントにする方が
   `PriceRecordForm` の既存の単一責任（新規記録 + 店舗管理）を壊さない。
3. `PriceRecordForm` は店舗一覧をマウント時に 1 度だけ取得する
   （109-145 行目の `useEffect`）。編集ダイアログは開くたびに最新の店舗一覧が必要
   （店舗管理カードで直前に追加・削除された可能性があるため）なので、取得タイミングの
   前提も異なる。

**見分け方**（ユーザーから見て）:

- 「価格を記録」ボタン（`PriceRecordForm` 本体、既存のまま）＝常に**新規追加**。
- 「最近の記録」一覧の各行に新設する鉛筆アイコン（削除のゴミ箱アイコンの隣）＝
  その行の記録を**編集**。クリックで `PriceRecordEditDialog` が開く。
- ダイアログのタイトルは「価格記録を編集」、送信ボタンの文言は「保存」とし、新規フォームの
  タイトル「価格を記録」・ボタン「記録」とは文言レベルでも区別する。

**フィールドの再利用**: `SelectField` / `Input` / `QuantityField`（`apps/web/src/components/ui/`）と
`packageSizeExample()` / `parseQuantity()` はプレゼンテーション用の汎用ヘルパーなので、
`PriceRecordEditDialog` からもそのままインポートして使う（`PriceRecordForm` 自体は再利用しないが、
その内部で使っている個別のユーティリティ・UI プリミティブは共有する）。フォームの JSX マークアップ
自体（3 フィールド分、50 行程度）は `PriceRecordForm` と重複するが、本タスクでは共通コンポーネントへの
切り出しは行わない（YAGNI。§リスク に切り出しの要否を申し送りとして残す）。

**店舗リネーム UI の配置**: 独立画面は新設しない（D-2 の精神・要件書 §対象外を踏襲し、
既存の店舗管理カードに機能を足す）。`PriceRecordForm` の店舗一覧行
（377-398 行目）に、削除ボタン（ゴミ箱アイコン）の隣へ編集ボタン（鉛筆アイコン）を追加し、
クリックで新規コンポーネント `StoreRenameDialog`
（`apps/web/src/app/products/[id]/_components/store-rename-dialog.tsx`）を開く。
リネーム成功後は `PriceRecordForm` 側の `stores` state を更新し、`router.refresh()` で
価格記録側の表示にも反映する。

### 論点5: エラー設計（UI 側）

| エラー                                                 | HTTP | 画面表示                                                                                                                                                                                             |
| ------------------------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ProductNotFoundError`                                 | 404  | 通常発生しない（同じ商品詳細画面からの操作のため）。汎用エラー文言「記録の更新に失敗しました。」を表示                                                                                               |
| `PriceRecordNotFoundError`                             | 404  | 「この記録はすでに削除されています。」→ ダイアログを閉じて `router.refresh()`（削除の 404 と同じ「既に無ければ成功扱い」に倣うが、編集は不可逆な削除ではないため、成功扱いにはせず再読み込みを促す） |
| `StoreNotFoundError`（編集で指定した店舗が存在しない） | 404  | 「選択した店舗が見つかりません。店舗一覧を確認してください。」+ 店舗一覧を再取得                                                                                                                     |
| Zod バリデーション（価格・内容量）                     | 400  | 既存 `PriceRecordForm` と同じフィールドレベルのエラー表示（`FieldErrors` パターンを流用）                                                                                                            |
| `StoreNotFoundError`（リネーム対象）                   | 404  | 「この店舗はすでに削除されています。」→ ダイアログを閉じて `router.refresh()`                                                                                                                        |
| `DuplicateStoreNameError`                              | 422  | 「同じ名前の店舗がすでに登録されています。」（`PriceRecordForm` の `DUPLICATE_STORE_MESSAGE` と同文言で統一）                                                                                        |
| Zod バリデーション（店舗名）                           | 400  | 「店舗名を入力してください。」                                                                                                                                                                       |
| 通信エラー・タイムアウト                               | -    | 「通信エラーが発生しました。」ダイアログは閉じずフォームの入力値を保持する（既存の他フォームと同じ方針）                                                                                             |

いずれも既存の共通 `onError`（`apps/web/src/server/app.ts:24-33`）が
`NotFoundError` → 404、`InvalidOperationError` → 422 に変換する既存の仕組みをそのまま使う。
新しいエラークラス（`ProductNotFoundError` 等）はすべて既存の基底を継承しているため、
`app.ts` 自体の変更は不要。

### 論点6: 層ごとの変更範囲（まとめ）

| 層             | 変更内容                                                                                                                                        | 変更不要の根拠                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Domain         | `Product.updatePriceRecord()` 追加、`Store.rename()` 追加（`storeName` の `readonly` を外す）                                                   | -                                                                                                         |
| Application    | `UpdatePriceRecordUseCase`・`RenameStoreUseCase` 新設、DTO・mapper 拡張                                                                         | -                                                                                                         |
| api-contract   | 価格記録更新・店舗リネームの Zod スキーマ（方針まで）                                                                                           | -                                                                                                         |
| Presentation   | Hono ルート 2 本追加、`PriceRecordEditDialog`・`StoreRenameDialog` 新設、`product-detail-client.tsx` / `price-record-form.tsx` に編集導線を追加 | -                                                                                                         |
| Infrastructure | **変更不要**                                                                                                                                    | `save()` が既存 ID を維持した `onConflictDoUpdate` upsert をすでに実装済み（`IR-P-06`・`IR-P-08` で担保） |
| DB スキーマ    | **変更不要**                                                                                                                                    | 上記と同じ理由。新しいカラム・テーブルは不要                                                              |

## バックエンド設計

`apps/web/src/server/routes/products.ts` に `.put('/:id/price-records/:priceRecordId', ...)` を、
`apps/web/src/server/routes/stores.ts` に `.put('/:id', ...)` を追加する
（既存ルートの手動 DI パターン・`zValidator` の使い方をそのまま踏襲する）。

```typescript
// apps/web/src/server/routes/products.ts（追加分イメージ）
.put(
  '/:id/price-records/:priceRecordId',
  zValidator('param', priceRecordIdParamSchema),
  zValidator('json', updatePriceRecordSchema), // 名称は contract-designer が確定
  async (c) => {
    const { id, priceRecordId } = c.req.valid('param');
    const body = c.req.valid('json');
    const usecase = new UpdatePriceRecordUseCase(productRepository(), storeRepository());
    const product = await usecase.execute({ productId: id, priceRecordId, ...body });
    return c.json(product);
  },
)
```

```typescript
// apps/web/src/server/routes/stores.ts（追加分イメージ）
.put(
  '/:id',
  zValidator('param', idParamSchema),
  zValidator('json', renameStoreSchema), // 名称は contract-designer が確定
  async (c) => {
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');
    const usecase = new RenameStoreUseCase(storeRepository());
    const store = await usecase.execute({ id, ...body });
    return c.json(store);
  },
)
```

## エラー処理

外部 API・外部ストレージへの新規 I/O は無いため、リトライ・タイムアウト・冪等性キー・
補償トランザクション・フォールバックの 5 項目は対象外（DB への通常の upsert のみで、
既存の `save()` 経路をそのまま使う）。HTTP レベルのエラー分類は §フロントエンド設計 論点5、
§API 設計の表を参照。

## ログと監視

既存方針を踏襲する。`app.ts` の `onError` は分類不能な 500 のみ `console.error` する
（24-33 行目）。404・422 は意図した業務エラーとしてログしない。新設する 2 エンドポイントも
同じ扱いとし、専用のログ・監視は追加しない。

編集・リネームともに変更履歴（誰が・いつ・何を・元の値は何だったか）は保存しない
（要件定義書 §対象外）。編集後は元の値を画面からは確認できない点は、既存の削除
（`removePriceRecord` の JSDoc「取り消し（undo）は無く、消した記録は復元できない」）と
同じ思想であり、新しいリスクではない。

## セキュリティ

MVP1 は認証なし（ADR-0003）。操作主体の区別・権限制御は行わない。既存の作成・削除エンドポイントと
同じ権限モデル（誰でも操作可能）を踏襲する。入力値はサーバー側で Zod により検証する
（クライアント側検証は UX 目的であり、権威はサーバー側）。新設エンドポイントによる新たな
攻撃面（XSS・CSRF・インジェクション等）の増加は無い（既存の `zValidator` + Drizzle
パラメータ化クエリの枠内に収まる）。

## 性能

対象外（該当条件なし）。判定根拠:

1. Infrastructure 経由の外部 API・外部ストレージへの I/O 新設・変更 → 無し
   （既存の `save()` upsert をそのまま使う）。
2. 一覧取得・集計など大量データを扱う DB クエリの新設・変更 → 無し（商品 1 件・価格記録 1 件・
   店舗 1 件を対象にした単純な `findById` / `save` のみ）。
3. 性能要件の明示 → 無し。

参考として、`priceHistory` は商品あたり数十件規模（Sprint 2 設計時点の想定どおり、2 人・週1回の
買い物で数年運用しても問題ない規模。`docs/04-domain-model.md` §Product 集約 設計ポイント）であり、
`save()` のバッチ upsert・削除同期のコストは既存の新規記録・削除操作と同等（O(件数)）で
悪化しない。

## テスト方針

### Domain（単体テスト）

- `Product.updatePriceRecord()`:
  - 正常系: 店舗・価格・内容量を差し替えると、該当 `PriceRecord` が新しいインスタンスに
    置き換わり、`id` と `observedAt` は元のまま
  - 異常系: 存在しない `priceRecordId` を指定すると `Error`
  - 異常系: `price` / `packageSize` が正数でないと `PriceRecord.create()` 由来の `Error`
  - `updatedAt`（`touch()`）が更新されること
- `Store.rename()`:
  - 正常系: 名前が差し替わる
  - 異常系: 空文字列・空白のみは `Error`

### Application（UseCase テスト）

- `UpdatePriceRecordUseCase`:
  - 正常系: 単価が `UnitPriceCalculator` の計算どおりに再計算される
  - 異常系: `ProductNotFoundError` / `PriceRecordNotFoundError` / `StoreNotFoundError`
  - 境界: 価格・内容量の下限（0 以下）
- `RenameStoreUseCase`:
  - 正常系: 名前が変わる。同じ名前のまま保存し直しても成功する（自己衝突除外）
  - 正常系: 大文字小文字だけ変える名前変更が成功する
  - 異常系: `StoreNotFoundError`
  - 異常系: 自分以外の既存店舗と正規化後に一致すると `DuplicateStoreNameError`

### Infrastructure（既存カバレッジの確認）

新規のリポジトリ変更は無いが、`Product.updatePriceRecord()` 経由で `save()` を呼ぶ経路が
既存の `IR-P-06`（既存行の upsert 上書き）・`IR-P-08`（バッチ upsert の各行独立更新）で
実質的にカバーされていることを実装時に確認する。不足があれば
「同一 `id` で店舗・価格・内容量を変えて `save()` し、`findById()` で新しい値が返る」
統合テストを追加する。

### apps/web（Hono ルート + RTL コンポーネントテスト）

- ルートテスト: `PUT /api/products/:id/price-records/:priceRecordId` の 200 / 404×3 / 400
- ルートテスト: `PUT /api/stores/:id` の 200 / 404 / 422 / 400
- コンポーネントテスト: `PriceRecordEditDialog` の初期値表示・送信・エラー表示
- コンポーネントテスト: `StoreRenameDialog` の初期値表示・注意文の表示条件（`priceRecordCount > 0`）・
  自己衝突を拒否しないこと（表示レベルのヒント）

## 移行とリリース

DB スキーマ変更が無いためデータ移行は不要。新設する `PUT` エンドポイントは既存エンドポイントと
共存し、破壊的変更を伴わない。段階的リリース（フィーチャーフラグ等）は不要な規模と判断する。

## リスク

- **リネームの誤用**: 違う店舗を選んでリネームしてしまうと、無関係な価格記録の表示名が
  巻き添えで変わる。§フロントエンド設計 論点1 の注意喚起で軽減するが、完全には防げない
  （可逆操作であるため、致命度は削除より低いと判断）。
- **フォームマークアップの重複**: `PriceRecordEditDialog` と `PriceRecordForm` の入力フィールド
  部分（店舗選択・価格・内容量、50 行程度）が重複する。本タスクでは共通化しない
  （§フロントエンド設計 論点4）。将来、価格記録の入力フォームに変更が入る際は両方への追従が
  必要になる点を申し送る。
- **既知の限定事項（申し送り）**: 商品詳細「最近の記録」に出ない 6 件目以降の価格記録は
  この機能では編集できない（D-2 確定）。過去の古い記録を直したい場合は、依然として
  削除して記録し直すしかない。表示件数の拡張は将来課題として送る。
- **同時実行**: 価格記録編集と店舗削除（カスケード）が同時に起きると、編集の `StoreNotFoundError`
  で検出される（既存の `RecordPriceUseCase` と同じ挙動）。2 人運用でまれなケースであり、
  追加のロックは入れない（ADR-0013 が同種のリスクを既知の制約として受け入れているのと同じ判断）。

## 未決事項

- 要件定義書 §未決事項 U-1〜U-3 を参照。
  - **U-1（contract-designer へ委譲中）**: `PUT /price-records/:priceRecordId` のレスポンスボディを
    `ProductDto` とする提案（§API 設計）の最終確定。契約設計書
    `price-record-edit-and-store-rename.contract.md` の結論を正典とする。
  - **U-2（解消・2026-08-05 ユーザー確定）**: リネーム時の注意喚起はインライン警告のみとする
    （二段階確認は設けない）。§フロントエンド設計 論点1 のとおり。
  - **U-3（解消・2026-08-05）**: ADR-0015 を
    [`docs/decisions/ADR-0015-store-rename-for-typo-correction.md`](../decisions/ADR-0015-store-rename-for-typo-correction.md)
    として起票済み（Status: Accepted）。
- `PriceRecordEditDialog` のコンポーネント名・ファイル配置（本書の提案どおりで良いか）は
  実装時に implementer が最終決定してよい規模の粒度と考えるが、念のため確認を残す。
