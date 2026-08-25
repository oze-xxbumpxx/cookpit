# 実装計画: expiry-alert-ops（フロントエンド slice）

- ステータス: confirmed
- レベル: L2
- 設計書: `docs/designs/expiry-alert-ops.md`

## Step 1: `/pantry` で `stock` クエリを受け取る

- 対象: `apps/web/src/app/pantry/page.tsx`
- 内容: `searchParams: Promise<{ stock?: string }>` を `await`（`meal-plans/page.tsx` と同型）。
  空・未指定は `null`。`PantryClient` に `highlightStockId` を渡す。
- 完了条件: type-check 通過。未知 id でもページは 200 相当で描画可能。

## Step 2: 行ハイライトとスクロール

- 対象:
  - `apps/web/src/app/pantry/_components/pantry-client.tsx`
  - `apps/web/src/app/pantry/_components/location-group.tsx`
  - `apps/web/src/app/pantry/_components/stock-row.tsx`
- 内容:
  - 一致 id があるときだけ `highlighted` を伝播
  - DOM id は `stock-${id}`
  - 強調: `border-primary ring-2 ring-primary/30`
  - `useEffect` で `scrollIntoView({ behavior: 'smooth', block: 'center' })`
  - 編集ダイアログは自動オープンしない
- 完了条件: 一致時ハイライト、不一致時 no-op。EmptyState 条件不変。

## Step 3: iOS 非 PWA 案内

- 対象: `apps/web/src/app/_components/expiry-alert-subscription.tsx`
- 内容: iOS かつ非 standalone で muted 案内。ボタン無効化なし。
  `requestPermission` はクリック内同期のまま。
- 完了条件: 案内表示の分岐がテストで固定される。

## Step 4: Vitest

- 対象:
  - `apps/web/tests/app/pantry/_components/pantry-client.test.tsx`
  - `apps/web/tests/app/pantry/_components/stock-row.test.tsx`
  - `apps/web/tests/app/_components/expiry-alert-subscription.test.tsx`
- 完了条件: 下記ケースが PASS。

## Step 5: 品質ゲート

- `pnpm --filter @cookpit/web type-check`
- 関連 pantry / expiry-alert テスト

## 対象外（やらない）

- Cron / payload `url` / secrets UI / `sw.ts` の `/` チェック緩和
