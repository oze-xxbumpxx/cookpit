# Task 4: Application — UpdateStockDetailsUseCase を実装

## 概要

在庫の詳細を更新する UseCase を新設する。参照する既存パターンは
`packages/application/src/pantry/consume-stock.use-case.ts`（404 の事前チェック）と
`add-stock.use-case.ts`（ローカル日付の往復変換）。**この 2 つのパターンを組み合わせる**。

対象は `packages/application/` のみ。**Task 1（Domain）が完了している前提。**

> 本 Task は Application 層のため、指示書は**公開シグネチャ + 不変条件 + 落とし穴 +
> 公開識別子一覧**を正本とする（IMP-2026-025 Phase 2）。メソッド本体の完成コードは
> 意図的に載せていない。既存 UseCase を読んで同じ形に揃えること。

## アーキテクチャ制約

- 依存方向: `Presentation → Application → Domain ← Infrastructure`。
- **1 ユースケース = 1 クラス・`execute()` メソッドのみ。** DI は手動 DI（コンストラクタ注入）。
  DI コンテナは導入しない。
- **エラーハンドリングはドメイン境界（UseCase の入口）で行う。** 内部では例外をそのまま投げる。
- 戻り値は DTO（Entity を境界外に漏らさない）。
- `any` 型は禁止。デフォルトエクスポート禁止。型のみのインポートは `import type`。
  `===` / `!==` を使う。「値なし」は `null`。
- 公開 API（UseCase クラス・DTO）には JSDoc を書く。**型に表せない契約情報のみ**
  （値のフォーマット・不変条件・`@throws`・冪等性）。型の言い換えは書かない。

## 実装対象ファイル

### 1. `packages/application/src/pantry/pantry.dto.ts`（追記）

```ts
export interface UpdateStockDetailsInputDto {
  stockId: string;
  amount: { value: number; unit: Unit };
  /** ローカル日付文字列 `YYYY-MM-DD`。値なしは `null`。 */
  expiresAt: string | null;
  storedLocation: StorageLocation | null;
}
```

`AddStockInputDto` の直後に置く。**`StockDto` / `PantryDto` / `AddStockInputDto` /
`ConsumeStockInputDto` / `DiscardStockInputDto` は変更しない。**

### 2. `packages/application/src/pantry/update-stock-details.use-case.ts`（新規）

```ts
export class UpdateStockDetailsUseCase {
  constructor(private readonly pantryRepository: PantryRepository) {}

  async execute(input: UpdateStockDetailsInputDto): Promise<PantryDto>;
}
```

**処理の順序（この順を守る）**:

1. `pantryRepository.find()` で Pantry を取得
2. `StockId.fromString(input.stockId)` で ID を作る
3. **事前チェック**: `pantry.stocks.find((candidate) => candidate.id.equals(stockId)) ?? null` が
   `null` なら **`StockNotFoundError`** を throw（→ HTTP 404）
4. `pantry.updateStockDetails(stockId, {...})` を **try/catch** で囲み、Domain が投げた
   素の `Error` を **`InvalidStockOperationError`** に変換して throw（→ HTTP 422）
5. `pantryRepository.save(pantry)`
6. `toPantryDto(pantry)` を返す

**`expiresAt` の変換**は `add-stock.use-case.ts` と同一の規約:
`input.expiresAt === null ? null : new Date(\`${input.expiresAt}T00:00:00\`)`（ローカル 0 時で構築し、mapper の`toLocalDateString` と往復整合させる）。

### 3. `packages/application/src/pantry/index.ts`（追記）

`UpdateStockDetailsUseCase` と `UpdateStockDetailsInputDto` をバレルに追加する。
既存のエクスポートの並びに揃える。

## 公開識別子一覧（タイポ照合の基準。この綴りと完全一致させること）

| 種別            | 識別子                                                                       |
| --------------- | ---------------------------------------------------------------------------- |
| クラス          | `UpdateStockDetailsUseCase`                                                  |
| DTO             | `UpdateStockDetailsInputDto`                                                 |
| ファイル名      | `update-stock-details.use-case.ts` / `update-stock-details.use-case.test.ts` |
| Domain メソッド | `pantry.updateStockDetails(stockId, props)`                                  |
| 既存エラー      | `StockNotFoundError` / `InvalidStockOperationError`                          |
| 既存ヘルパー    | `toPantryDto`（`pantry.mapper.ts`）                                          |
| 既存 VO         | `StockId.fromString(...)` / `Quantity.of(value, unit)`                       |

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **`StockNotFoundError` / `InvalidStockOperationError` を新規作成しない。**
  どちらも `packages/application/src/pantry/stock-not-found.error.ts` /
  `invalid-stock-operation.error.ts` に **pantry-core で作成済み**。import して使う。
  同名クラスを二重定義すると型エラーにならないまま `instanceof` 判定が壊れ、
  `app.onError` が 404 / 422 に写像できず 500 になる。
- **404 と 422 の順序を逆にしない。** 事前チェック（404）が try/catch（422）より**先**。
  存在しない `stockId` かつ数量 0 の複合ケースでは **404 が優先**される。これはテストで
  固定する観点（A-UPD-14）なので、順序を入れ替えないこと。
- **Domain が投げるのは素の `Error`。** `pantry.updateStockDetails()` は
  `StockNotFoundError` を投げない（Domain は Application を import できない）。
  catch した `error` を `error instanceof Error ? error.message : ...` で安全に文字列化してから
  `InvalidStockOperationError` に詰める。**`any` にキャストしない。**
- **UseCase にドメインロジックを書かない。** 「`amount.value <= 0` なら 422」の判定を
  UseCase 側で先回りして書かないこと。判定は Domain（`Stock.updateDetails`）が持ち、
  UseCase が担うのは**エラー型の写像だけ**。
- **`expiresAt` に `new Date(input.expiresAt)` を使わない。** 必ず
  ``new Date(`${input.expiresAt}T00:00:00`)`` の形にする。前者は UTC 解釈になり、
  `toLocalDateString` との往復で日付が 1 日ずれる。
- **戻り値は `PantryDto`**（更新した Stock 単体ではない）。既存 4 UseCase すべてが
  `PantryDto` を返す形に揃っている。
- **テストファイルは独立させる。** `pantry-use-cases.test.ts` に追記せず
  `update-stock-details.use-case.test.ts` を新規作成する（観点が 14 件と多く、既存ファイルの
  肥大化を避けるため）。`InMemoryPantryRepository` 相当のテストダブルは既存テストから
  import できればそれを使い、できなければこのファイル内にローカル定義する。

## テスト

`packages/application/tests/pantry/update-stock-details.use-case.test.ts`（新規）。
試験計画 `docs/tests/stock-edit.md` §3（A-UPD-01〜14）。

**必須ケース**:

- 3 項目を更新して `PantryDto` が返り、`save()` が呼ばれること
- `expiresAt` の往復（`'2026-08-10'` を渡して DTO で `'2026-08-10'` が返る。**1 日ずれない**）
- `expiresAt: null` / `storedLocation: null` のクリア
- **A-UPD-07**: 存在しない `stockId` → `StockNotFoundError`（`save()` は呼ばれない）
- **A-UPD-08**: `amount.value` が 0 → `InvalidStockOperationError`
- **A-UPD-14**: 存在しない `stockId` **かつ** 数量 0 の複合ケースで **`StockNotFoundError`**
  （404 が優先されることの固定）

## 完了条件

- [ ] `pnpm --filter @cookpit/application test` 全 green
- [ ] `pnpm --filter @cookpit/application type-check` / `pnpm lint` 全 green
- [ ] `StockNotFoundError` / `InvalidStockOperationError` を**新規作成していない**
      （`git status` に新規 error ファイルが無い）
- [ ] A-UPD-14（404 優先）がテストで固定されている
- [ ] 既存 4 UseCase（`GetPantry` / `AddStock` / `ConsumeStock` / `DiscardStock`）と
      `pantry.mapper.ts` に差分が無い
