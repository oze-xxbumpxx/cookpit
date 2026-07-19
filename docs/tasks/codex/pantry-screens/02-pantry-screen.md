# Task 2: `/pantry` 画面 — 在庫一覧（Server Component + Client 3 コンポーネント）を実装

## 概要

在庫一覧画面 `/pantry` を新規実装する。Task 1 の `pantry-view.ts` を使用する。構成・状態管理の
先例は `apps/web/src/app/shopping-lists/`（`[id]/page.tsx` / `_components/shopping-list-client.tsx` /
`store-group.tsx` / `shopping-item-row.tsx`）。**ただし本画面は `useOptimistic` /
`startTransition` を使わない**（D-4/D-5。先例との意図的な差分）。

## アーキテクチャ制約

- Presentation 層は UseCase を呼ぶだけ。ドメインロジックを書かない。
- 初期表示は Server Component から UseCase 直呼び、書き込みは Client から Hono RPC
  （`@/lib/api-client` の `client`。変更不要でそのまま使える）。
- `any` 禁止・named export のみ（**例外: `page.tsx` は Next.js App Router 規約の
  default export 必須**）・型のみは `import type`・「値なし」は `null`。
- **D-3（最重要）**: Repository 組み立ては `@/server/repositories` の `pantryRepository()` 経由。
  既存の `meal-plans/page.tsx` / `shopping-lists/[id]/page.tsx` は
  `new DrizzleXRepository(getDb())` を直書きしているが、**この先例は真似しない**（意図的な運用変更）。

## 実装対象ファイル（4 実装 + 3 テスト）

### 1. `apps/web/src/app/pantry/page.tsx`（新規・Server Component）

以下の確定コードをそのまま使う（try/catch しない。`GetPantryUseCase` は例外を投げず常に
`PantryDto` を返す。DB 障害は Next.js エラーバウンダリに委ねる）:

```typescript
import { GetPantryUseCase } from '@cookpit/application';
import { pantryRepository } from '@/server/repositories';
import { PantryClient } from './_components/pantry-client';

export const dynamic = 'force-dynamic';

export default async function PantryPage() {
  const pantry = await new GetPantryUseCase(pantryRepository()).execute();
  return <PantryClient pantry={pantry} />;
}
```

### 2. `apps/web/src/app/pantry/_components/stock-row.tsx`（新規・`'use client'` 不要）

```typescript
interface Props {
  stock: StockDto;
  submitting: boolean;
  onConsume: (stockId: string) => void;
  onDiscard: (stockId: string) => void;
}
export function StockRow({ stock, submitting, onConsume, onDiscard }: Props);
```

- 表示: `displayName` + `${stock.amount.value}${stock.amount.unit}`（`shopping-item-row.tsx`
  の数量表示と同型フォーマット）。
- `stock.expiresAt !== null` のときのみ `〜${formatExpiresAt(stock.expiresAt)}` を
  `text-muted-foreground` の小さめテキストで併記（null なら要素ごと出さない）。
- 右側にボタン 2 つ（`@/components/ui/button` の `Button`）:
  「使った」`variant="outline"` / 「捨てた」`variant="destructive"`。両方 `disabled={submitting}`。
  click で `onConsume(stock.id)` / `onDiscard(stock.id)`（**確認ダイアログなし。P-4/P-6。
  `AlertDialog` を import しない**）。

### 3. `apps/web/src/app/pantry/_components/location-group.tsx`（新規・`'use client'` 不要）

```typescript
interface Props {
  location: StorageLocation | null;
  stocks: StockDto[];
  submittingStockId: string | null;
  onConsume: (stockId: string) => void;
  onDiscard: (stockId: string) => void;
}
export function LocationGroup({ location, stocks, submittingStockId, onConsume, onDiscard }: Props);
```

- ヘッダー: `location === null ? UNSET_LOCATION_LABEL : LOCATION_LABELS[location]`
  （`store-group.tsx` のグループヘッダーと同型の見た目）。
- 本文: `stocks.map()` で `<StockRow>` を展開。`submitting` は
  `submittingStockId === stock.id` を渡す（**全行に同じ boolean を渡さない**。D-6）。
- `stocks: []` でも throw しない（ヘッダーのみ表示。防御的挙動）。

### 4. `apps/web/src/app/pantry/_components/pantry-client.tsx`（新規・**`'use client'` 必須**）

```typescript
interface Props {
  pantry: PantryDto;
}
export function PantryClient({ pantry }: Props);
```

state（これ以外を増やさない）:

- `stocks: StockDto[]`（初期値 `pantry.stocks`）
- `errorMessage: string | null`
- `submittingStockId: string | null`（D-6）
- `refreshing: boolean`（手動更新ボタン用）

ハンドラ仕様（**素の async 関数 + `useState`。`useOptimistic` / `startTransition` 禁止**）:

- `handleConsume(stockId)`: `submittingStockId === stockId` なら即 return（同一 stock の
  連打ガード。`shopping-list-client.tsx` の `if (submittingItemId === itemId) return;` と同型）。
  `setSubmittingStockId(stockId)`・`setErrorMessage(null)` 後、対象 stock を `stocks` から
  探し（見つからなければ return）、
  `client.api.pantry.stocks[':stockId'].consume.$post({ param: { stockId }, json: { amount: { value: stock.amount.value, unit: stock.amount.unit } } })`
  を呼ぶ（**残量全部をそのまま送信。P-2 最重要**）。
  `response.ok` → `const dto = await response.json()` の `dto.stocks` で `stocks` を
  **丸ごと置換**（D-5。部分マージしない）。`!response.ok` → 「操作に失敗しました。」。
  catch → 「通信エラーが発生しました。」。finally → `setSubmittingStockId(null)`。
- `handleDiscard(stockId)`: 同上の流れで
  `client.api.pantry.stocks[':stockId'].discard.$post({ param: { stockId } })`（json なし）。
- `handleRefetch({ silent }: { silent: boolean })`（D-7）: `client.api.pantry.$get()` を呼び
  `stocks` を置換。silent 時は失敗を無視（既存表示維持）。非 silent 時は `refreshing` を
  立て、失敗時「操作に失敗しました。」・catch 時「通信エラーが発生しました。」。
- `useEffect`: `window.addEventListener('focus', ...)` で silent refetch を登録し、
  **クリーンアップで必ず `removeEventListener`**（PC-14 で検証される）。

レンダリング:

- ヘッダー（`shopping-list-client.tsx` の `<header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">`
  構成と同型）: 左「戻る」`Link href="/meal-plans"`（`cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-9 px-2 text-foreground')`）/
  中央 `<h1>` 「在庫」 / 右「更新」`Button variant="ghost"`（click で非 silent refetch・
  `disabled={refreshing}`）。
- エラーバナー: `errorMessage !== null` のとき
  `<p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">`
  （既存と同一クラス列）。
- 本文: `groupStocksByLocation(stocks)` を `map` して `<LocationGroup>`。
  `stocks.length === 0` のときは「在庫がありません」（`text-muted-foreground`）。
- 外枠: `<main className="min-h-dvh bg-background">` + `mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4`
  （既存画面と同型。セマンティックトークンのみ使用・新規トークン追加禁止）。

## 公開識別子一覧（タイポ照合基準）

`PantryPage`（default） / `PantryClient` / `LocationGroup` / `StockRow` /
`groupStocksByLocation` / `formatExpiresAt` / `LOCATION_LABELS` / `UNSET_LOCATION_LABEL` /
`pantryRepository` / `GetPantryUseCase` / `PantryDto` / `StockDto` / `StorageLocation` /
`stocks` / `errorMessage` / `submittingStockId` / `refreshing` /
`handleConsume` / `handleDiscard` / `handleRefetch`

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **Tailwind クラスのタイポ・連結ミス**（`w-fll` / `rounded-xlborder` 型）は tsc/eslint を
  通過する。上記の既存クラス列をコピーして使い、独自クラス列を手打ちしない。
- **ハンドラ結線漏れ**: `onConsume` / `onDiscard` を受け取ってボタンに渡し忘れない
  （SR-04/05 で検証される）。
- `'use client'` は `pantry-client.tsx` **のみ**（hooks を使うため必須）。`stock-row.tsx` /
  `location-group.tsx` は不要（hooks なし。`store-group.tsx` 先例と同じ）。`page.tsx` に
  付けたら Server Component でなくなるので**絶対に付けない**。
- RPC パスの取り違え注意: `client.api.pantry.stocks[':stockId'].consume.$post` /
  `...discard.$post`（`stock` 単数や `pantries` 複数にしない）。
- 応答は**更新後 `PantryDto` 全体**（`{ stocks: StockDto[] }`）。単一 `StockDto` ではない
  （取り違えると型エラー。R-2）。
- `import type` を使う: `PantryDto` / `StockDto` / `StorageLocation` は型のみ import。

## テスト

フィクスチャ `createStockDto(overrides)` / `createPantryDto` は各テストファイルにローカル定義
（Task 1 と同じ既定値）。`pantry-client.test.tsx` は `vi.mock('@/lib/api-client')` で
`client.api.pantry.$get` / `...consume.$post` / `...discard.$post` を `vi.fn()` 差し替え
（既存 `shopping-list-client.test.tsx` のモック構成が先例）。`LocationGroup` / `StockRow` は
モックせず実物を使う。

### `stock-row.test.tsx`（SR）

| #     | 観点                                                                                        |
| ----- | ------------------------------------------------------------------------------------------- |
| SR-01 | `displayName: '牛乳'` + `amount 1000ml` → `牛乳` と `1000ml` が表示                         |
| SR-02 | `expiresAt: '2026-08-01'` → 「〜8/1まで」併記                                               |
| SR-03 | `expiresAt: null` → 併記テキストが存在しない（MVP1 通常ケース）                             |
| SR-04 | 「使った」click → `onConsume(stock.id)` が呼ばれる                                          |
| SR-05 | 「捨てた」click → `onDiscard(stock.id)` が呼ばれる                                          |
| SR-06 | `submitting: true` → 両ボタン disabled                                                      |
| SR-07 | 各ボタン click で確認 UI が出現せず**即座に**コールバックが呼ばれる（ダイアログ非搭載確認） |

### `location-group.test.tsx`（LG）

| #     | 観点                                                                                 |
| ----- | ------------------------------------------------------------------------------------ |
| LG-01 | `location` 4 パターン → ヘッダーが `冷蔵`/`冷凍`/`常温`/`保存場所未設定`（網羅固定） |
| LG-02 | `stocks` 3 件 → `StockRow` が 3 件レンダリング                                       |
| LG-03 | `stocks: []` → 例外なくヘッダーのみ表示                                              |

### `pantry-client.test.tsx`（PC）

| #     | 観点                                                                                                                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PC-01 | `stocks: []` → 「在庫がありません」                                                                                                                                     |
| PC-02 | `fridge`/`freezer`/`null` 混在 → 各グループヘッダー配下に対応 stock のみ・固定順                                                                                        |
| PC-03 | 全件 `null` → 「保存場所未設定」単一グループ（MVP1 実態・重点）                                                                                                         |
| PC-04 | consume 成功（応答に当該 stock なし）→ 一覧から消える（他は残る）                                                                                                       |
| PC-05 | **最重要**: `amount { value: 300, unit: 'ml' }` の stock で「使った」→ `$post` 引数が `{ param: { stockId }, json: { amount: { value: 300, unit: 'ml' } } }` と完全一致 |
| PC-06 | discard 成功 → 当該 stock が消える                                                                                                                                      |
| PC-07 | consume `{ ok: false }` → 「操作に失敗しました。」・一覧不変                                                                                                            |
| PC-08 | discard `{ ok: false }` → 同上                                                                                                                                          |
| PC-09 | reject → 「通信エラーが発生しました。」                                                                                                                                 |
| PC-10 | stock A 操作中（未解決 Promise）→ A の両ボタンのみ disabled・B は操作可能（D-6・重点）                                                                                  |
| PC-11 | 同一 stock 連打 → `$post` は 1 回のみ                                                                                                                                   |
| PC-12 | `window` へ `focus` dispatch → `$get` が呼ばれ state 置換・エラー非表示（silent）                                                                                       |
| PC-13 | 「更新」click・`$get` 失敗 → 「操作に失敗しました。」（非 silent）                                                                                                      |
| PC-14 | `unmount()` 後に `focus` dispatch → `$get` が呼ばれない（リスナー解除）                                                                                                 |
| PC-15 | ヘッダー: 「戻る」`href="/meal-plans"` + 「在庫」 + 「更新」ボタン                                                                                                      |
| PC-16 | consume 応答で**別 stock の amount も変化した `PantryDto`** → 応答どおり全置換（部分マージでない。D-5・重点）                                                           |
| PC-17 | エラー表示中に別 stock を操作（成功）→ `errorMessage` がクリアされる                                                                                                    |

## 完了条件

- [ ] `pnpm --filter @cookpit/web test -- stock-row location-group pantry-client` green（SR/LG/PC 全件）
- [ ] `pnpm lint` / `pnpm type-check` green
- [ ] `page.tsx` が `pantryRepository()` 経由（`new DrizzlePantryRepository` / `getDb` を
      `apps/web/src/app/` 配下に書いていない。D-3 最重要）
- [ ] `AlertDialog` / `useOptimistic` / `startTransition` / TanStack Query を使っていない
