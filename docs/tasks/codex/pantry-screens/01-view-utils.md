# Task 1: 表示ユーティリティ — pantry-screens の純関数を実装

## 概要

`/pantry` 画面の表示用純関数 2 つ + 定数を新規ファイルに実装する。既存の同型先例は
`apps/web/src/app/shopping-lists/_utils/shopping-list-view.ts`（機能ローカルの純関数集。
他機能から import しない・させない方針も同じ）。

## アーキテクチャ制約

- `any` 禁止（`unknown` を使う）。デフォルトエクスポート禁止（名前付きのみ）。
- 型のみの import は `import type`。`===` / `!==` のみ。「値なし」は `null`。
- コメントは Why が非自明な場合のみ。

## 実装対象ファイル

### `apps/web/src/app/pantry/_utils/pantry-view.ts`（新規）

```typescript
import type { StockDto, StorageLocation } from '@cookpit/application';

export const LOCATION_LABELS: Record<StorageLocation, string> = {
  fridge: '冷蔵',
  freezer: '冷凍',
  pantry: '常温',
};
export const UNSET_LOCATION_LABEL = '保存場所未設定';

export interface StockLocationGroup {
  location: StorageLocation | null;
  label: string;
  stocks: StockDto[];
}

export function groupStocksByLocation(stocks: StockDto[]): StockLocationGroup[];
export function formatExpiresAt(expiresAt: string): string;
```

仕様（不変条件）:

- `groupStocksByLocation`: `storedLocation` でグルーピングし、**固定順
  `fridge → freezer → pantry → null(未設定)`** で返す（入力の並び順に依らない）。
  - stocks が 0 件のグループは**出力に含めない**（空配列入力 → 空配列出力）。
  - 同一グループ内は入力配列の順序を維持する。
  - `label` は `LOCATION_LABELS[location]`、`location === null` は `UNSET_LOCATION_LABEL`。
  - MVP1 の実データは全件 `storedLocation: null`（「保存場所未設定」の単一グループが正常。P-3）。
- `formatExpiresAt`: `'2026-08-01'` → `'8/1まで'`。ゼロ埋めしない（`'08/01'` は誤り）。
  **`new Date('YYYY-MM-DD')` を使わない**（UTC 解釈による日付ずれの温床）。`split('-')` +
  `Number()` の文字列分解で month/day を取り出す。`null` ガードは呼び出し側の責務
  （この関数は非 null 前提。引数型を `string | null` にしない）。

参考の DTO 形（`@cookpit/application` から import。再定義しない）:

```typescript
interface StockDto {
  id: string;
  productId: string | null;
  displayName: string;
  amount: { value: number; unit: Unit };
  purchasedAt: string; // ISO 8601
  expiresAt: string | null; // 'YYYY-MM-DD'
  storedLocation: StorageLocation | null; // 'fridge' | 'freezer' | 'pantry' | null
}
```

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- テストファイルは **`pantry-view.node.test.ts`**（`.node.test.ts` 拡張子厳守）。素の
  `*.test.ts` は `apps/web` の `src/server/` 配下以外では vitest の include に入らず
  **silent skip** される（過去実績あり。green に見えて実行されていない罠）。
- 固定順は `fridge → freezer → pantry → null`。**shopping-list の `groupItemsByStore`
  は「未定を先頭固定」で逆**なので、先例をコピーすると順序が逆になる。
- `LOCATION_LABELS` のキーは `fridge` / `freezer` / `pantry`（`StorageLocation` union と
  完全一致。`refrigerator` 等の言い換え禁止）。
- `import type { StockDto, StorageLocation } from '@cookpit/application'`（値 import にしない）。

## テスト

`apps/web/src/app/pantry/_utils/pantry-view.node.test.ts`（新規）。フィクスチャは
`createStockDto(overrides)` をファイル内ローカル定義（既定値: `displayName: '牛乳'`、
`amount: { value: 1000, unit: 'ml' }`、`storedLocation: null`、`expiresAt: null`、
`purchasedAt: '2026-07-11T01:00:00.000Z'`、`productId: null`、`id` は固定 UUID リテラル）。

| #     | 観点                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------- |
| PV-01 | 4 ロケーション混在（逆順で入力）→ 出力順が常に `fridge → freezer → pantry → 未設定`                        |
| PV-02 | `fridge` と `null` のみ → 出力 2 グループのみ（0 件グループが出ない）                                      |
| PV-03 | 全件 `storedLocation: null` → `{ location: null, label: '保存場所未設定' }` の単一グループ（MVP1 実態）    |
| PV-04 | 空配列 → 空配列                                                                                            |
| PV-05 | 同一ロケーション 2 件 → 同一グループに入力順で 2 件                                                        |
| PV-06 | `label` の網羅を `toEqual` で固定（冷蔵/冷凍/常温/保存場所未設定 の 4 パターン全件。弱いアサーション禁止） |
| PV-07 | `formatExpiresAt('2026-08-01')` → `'8/1まで'`                                                              |
| PV-08 | `formatExpiresAt('2026-12-31')` → `'12/31まで'` / `formatExpiresAt('2027-01-01')` → `'1/1まで'`            |

## 完了条件

- [ ] `pnpm --filter @cookpit/web test -- pantry-view` が green（PV-01〜08 全件）
- [ ] `pnpm --filter @cookpit/web type-check` / `pnpm lint` green
- [ ] エクスポート識別子が本指示書のシグネチャと完全一致（`LOCATION_LABELS` /
      `UNSET_LOCATION_LABEL` / `StockLocationGroup` / `groupStocksByLocation` / `formatExpiresAt`）
