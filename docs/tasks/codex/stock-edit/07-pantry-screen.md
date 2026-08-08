# Task 7: UI — /pantry の編集ダイアログと在庫カードの表示強化

## 概要

`/pantry` に在庫の編集導線とダイアログを追加し、在庫カードに保存場所ラベル・緊急度チップを
表示する。参照する既存パターンは
**`apps/web/src/app/products/[id]/_components/price-record-edit-dialog.tsx`**
（制御モードの `AlertDialog` + フォーム。**この構造をそのまま踏襲する**）。

**Task 5（route）・Task 6（`expiry.ts`）が完了している前提。**
Task 6 の `pantry/page.tsx` 変更と合わせて 1 コミットにまとめてよい。

> 本 Task は Presentation 層のため、指示書は**公開シグネチャ + 不変条件 + 落とし穴 +
> 公開識別子一覧**を正本とする（IMP-2026-025 Phase 2）。JSX の完成コードは載せていない。
> **`price-record-edit-dialog.tsx` を読んで同じ形に揃えること。**

## アーキテクチャ制約

- Presentation 層は UseCase / API を呼ぶだけ。**ドメインロジックを書かない。**
- Hono ルートの型はフロントから `import type` で取り込み、型安全に呼び出す（Hono RPC）。
- `any` 型は禁止。デフォルトエクスポート禁止（`app/**/page.tsx` 等の Next.js 規約は例外）。
- 型のみのインポートは `import type`。`===` / `!==` を使う。「値なし」は `null`。
- **TanStack Query は使わない**（このプロジェクトでは不採用。素の Hono RPC + `useState`）。

## 実装対象ファイル

### 1. `apps/web/src/app/pantry/_components/stock-edit-dialog.tsx`（新規・`'use client'` **必要**）

```ts
interface Props {
  stock: StockDto | null;
  onOpenChange: (open: boolean) => void;
}
export function StockEditDialog({ stock, onOpenChange }: Props): JSX.Element;
```

`price-record-edit-dialog.tsx` と同型にする:

- `open = stock !== null`（`AlertDialog` の制御モード）
- `useEffect([stock?.id])` で各フィールドの初期値を state に投入
- フィールドは **3 つ**:
  - 数量: `QuantityField`（`@/components/ui/quantity-field`）+ `parseQuantity`
  - 保存場所: `SelectField`（`@/components/ui/select-field`）+ `LOCATION_SELECT_OPTIONS` /
    `toStorageLocation`（`../_utils/pantry-view` から import）
  - 賞味期限: `Input type="date"`（`@/components/ui/input`。空文字 → `null` に変換）
- 送信:
  `client.api.pantry.stocks[':stockId'].$put({ param: { stockId: stock.id }, json: body })`
- 成功時: `onOpenChange(false)` → `router.refresh()`
- **404**: 「この在庫はすでに削除されています」を表示してダイアログを閉じる
- **422**: `fieldErrors` に反映
- **通信エラー**: `try/catch` で「通信エラーが発生しました」
- `AlertDialogClose` へは **`render={<Button ... />}`**（Base UI の合成方法。`asChild` ではない）

### 2. `apps/web/src/app/pantry/_components/stock-row.tsx`（変更）

Props に `asOf: Date` と `onEdit: (stock: StockDto) => void` を追加する。

- **保存場所ラベルを常時表示**する。`storedLocation` が `null` のときも表示が崩れないこと
  （`LOCATION_LABELS` / `UNSET_LOCATION_LABEL` を `../_utils/pantry-view` から使う）。
- **緊急度チップ**は次の条件を**すべて**満たすときだけ表示する:
  1. `stock.expiresAt !== null`
  2. `getExpiryRemainingDays(stock.expiresAt, asOf) <= EXPIRY_URGENCY_WITHIN_DAYS`

  **`remainingDays` が負（期限切れ）も表示対象に含める。**
  `0 <= remainingDays && remainingDays <= 3` のように下限を付けてはいけない
  （期限切れが非表示になり、ダッシュボードと意味がずれる。期限切れこそ最も目立つべき）。

  表示は `getExpiryUrgency(remainingDays)` → `expiryUrgencyChipClass(urgency)` を class に、
  **`formatExpiryUrgencyLabel(remainingDays)` を文言**に使う
  （`期限切れ` / `本日まで` / `明日まで` / `あとN日`。ダッシュボードと同じ文言にする）。
  前 3 つは `@/app/_utils/expiry`、`expiryUrgencyChipClass` は `@/app/_utils/category-color`。

- 既存の `〜{formatExpiresAt(stock.expiresAt)}` 表示は**残す**
  （チップは緊急度、日付表示は事実。役割が違うので置き換えない）。
- 「編集」ボタンを追加し `onEdit(stock)` を呼ぶ。

#### ⚠️ レイアウト（375px で破綻させない）

現在の `stock-row.tsx` は `<li className="flex items-center gap-3">` の中に
「情報側（`flex min-w-0 flex-1 flex-col gap-1`）」と「ボタン側（`flex shrink-0 gap-2`・
ボタン 2 個）」が横に並ぶ構造。ここへ**編集ボタン（3 個目）+ 保存場所ラベル +
緊急度チップ**を同時に足すので、**モバイル幅で破綻するリスクが高い**。

- **保存場所ラベルと緊急度チップは情報側（`flex-1` の列）に置く。** ボタン側に足さない。
- **ボタンが 3 個になるので `shrink-0` の横並びのままだと情報側が潰れる。**
  ボタン行を情報行の下へ折り返すか、ボタンをアイコンのみ（`size="icon"` + `aria-label`）に
  縮めるかを選ぶこと。**どちらでもよいが、375px 幅で情報側のテキスト（品目名）が
  1 文字も切れないことを基準にする。**
- 実装後、**375px 幅で目視確認すること**（`truncate` が効いて品目名が `…` で切れるのは
  長い名前の場合のみで、`玉ねぎ` 程度が切れるならレイアウトが破綻している）。

### 3. `apps/web/src/app/pantry/_components/location-group.tsx`（変更）

`asOf` と `onEdit` を props で受け取り、`StockRow` へ**そのまま中継**する。
このコンポーネント自身のロジックは増やさない。

### 4. `apps/web/src/app/pantry/_components/pantry-client.tsx`（変更）

- Props に `asOf: Date` を追加し、`LocationGroup` へ伝播する。
- 編集対象を `useState<StockDto | null>(null)` で保持し、`StockEditDialog` を結線する。
- **既存の `useApiAction`（consume / discard の pending 管理）とは独立させる。**
  編集ダイアログは自前の `useState` + `router.refresh()` で完結する
  （`price-record-edit-dialog.tsx` と同じパターン）。

## 公開識別子一覧（タイポ照合の基準。この綴りと完全一致させること）

| 種別                | 識別子                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 新規コンポーネント  | `StockEditDialog`（ファイル `stock-edit-dialog.tsx`）                                                                                     |
| 既存コンポーネント  | `StockRow` / `LocationGroup` / `PantryClient`                                                                                             |
| pantry-view から    | `LOCATION_SELECT_OPTIONS` / `LOCATION_LABELS` / `UNSET_LOCATION_LABEL` / `UNSET_LOCATION_VALUE` / `toStorageLocation` / `formatExpiresAt` |
| expiry から         | `getExpiryRemainingDays` / `getExpiryUrgency` / `formatExpiryUrgencyLabel` / `EXPIRY_URGENCY_WITHIN_DAYS` / `ExpiryUrgency`（型）         |
| category-color から | `expiryUrgencyChipClass`                                                                                                                  |
| UI 部品             | `Button` / `Input` / `SelectField` / `QuantityField` / `AlertDialog` / `AlertDialogContent` / `AlertDialogTitle` / `AlertDialogClose`     |
| RPC                 | `client.api.pantry.stocks[':stockId'].$put`                                                                                               |

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **`getExpiryUrgency` は閾値判定をしない。** その JSDoc に
  「`selectExpiringStocks` の 3 日以内フィルタ済みの値を渡す前提のため、**4 日以上も
  `'soon'` に収束する**」と明記されている。ダッシュボードは `selectExpiringStocks` で
  事前に絞っているが、**`/pantry` は全在庫を出す**ので、絞らずに呼ぶと**期限が 30 日先の
  在庫にも「soon」チップが出てしまう**。`stock-row.tsx` 側で
  `remainingDays <= EXPIRY_URGENCY_WITHIN_DAYS` を必ず判定すること。
  **`getExpiryUrgency` 自体を改造して閾値を持たせてはいけない**（ダッシュボードが壊れる）。
- **`'use client'` の要否**（ファイルごとに明記）:
  - `stock-edit-dialog.tsx` … **必要**（hooks を使う）
  - `pantry-client.tsx` … **既に付いている**（変更不要）
  - `stock-row.tsx` / `location-group.tsx` … **付けない**（純表示コンポーネント。
    現在も付いておらず、props でハンドラを受けるだけ。ファイル名に client が無いことと
    判定は無関係だが、hooks を使わないなら不要）
- **`onEdit` の結線漏れに注意。** props で受けた `onEdit` を「編集」ボタンの `onClick` に
  実際に渡すこと（`onClick={() => onEdit(stock)}`）。過去に props で受けたハンドラを要素に
  渡し忘れる実績が複数ある。
- **`onEdit` は `stock` オブジェクトを渡す**（`stock.id` ではない）。ダイアログが
  初期値の投入に全フィールドを必要とするため。既存の `onConsume` / `onDiscard` が
  `stockId: string` を受ける形と**シグネチャが違う**ので混同しない。
- **`AlertDialogClose` に `asChild` を使わない。** Base UI なので `render={<Button ... />}`。
- **Tailwind クラス名のタイポに注意**（`tsc` / `eslint` を通過してしまう）。
  既存の `stock-row.tsx` のクラス（`flex items-center gap-3 rounded-xl border border-border
bg-card p-3 shadow-sm` など）をコピーして使い、手打ちしない。
- **`parseQuantity` の戻り値を検証してから送る。** 数量が不正（0 以下・パース不能）なときは
  送信ボタンを disable にするか送信を止める（サーバーは 400 を返すが、クライアント側で
  止めるのが既存ダイアログの作法）。
- **`router.refresh()` を忘れない。** `/pantry` の `page.tsx` は Server Component で
  `force-dynamic`。`refresh()` しないと一覧が更新されない。
- 型のみの import（`StockDto` / `StorageLocation` / `ExpiryUrgency`）は `import type`。

## テスト

`apps/web/tests/app/pantry/_components/` 配下に置く（`src/` の構造をミラーする既存の
置き方に合わせる）。既存の `pantry-client.test.tsx` が `vi.mock('@/lib/api-client')` で
RPC をネスト構造ごとモックしているので、同じ形にする。

> **テストファイルの拡張子に注意**: `apps/web` の vitest は `*.node.test.ts` /
> `*.dom.test.ts` / `*.test.tsx` で拾う。コンポーネントテストは **`*.test.tsx`**。
> 素の `*.test.ts` は `server` 配下以外では **silent skip** になる。

試験計画 `docs/tests/stock-edit.md` §7-1（SED-01〜12）・§7-3（SR-EDIT-01〜06）・
§7-4（PC-EDIT-01〜02）。

**必須ケース**:

- `stock-edit-dialog.test.tsx`: 初期値投入 / 3 項目の送信ボディが正しい /
  `expiresAt` を空にすると `null` が送られる / 保存場所「未設定」で `null` が送られる /
  **404 で「この在庫はすでに削除されています」** / 422 で `fieldErrors` /
  成功時に `onOpenChange(false)` と `router.refresh()` が呼ばれる /
  **数量 0 以下は送信されない**
- `stock-row.test.tsx`: **SR-EDIT-03/04**（閾値内の在庫にチップが出る /
  **閾値外の在庫にチップが出ない**）/ **SR-EDIT-07**（**期限切れ = 残日数が負の在庫に
  「期限切れ」チップが出る**。これが無いと、下限を付けた実装でも自動テストが全件 Green のまま
  手動確認だけが落ちる）/ 閾値ちょうど（3 日）で出る・4 日で出ないの境界 /
  保存場所ラベルが `null` でも表示される / 「編集」ボタンで `onEdit(stock)` が呼ばれる
- `pantry-client.test.tsx`: 編集ボタンでダイアログが開く / 既存の consume / discard が回帰しない

## 完了条件

- [ ] `pnpm --filter @cookpit/web test` 全 green（既存の pantry / dashboard のテスト含む）
- [ ] `pnpm --filter @cookpit/web type-check` / `pnpm lint` 全 green
- [ ] **閾値外の在庫にチップが出ない**ことがテストで固定されている
- [ ] `getExpiryUrgency` / `getExpiryRemainingDays` / `formatExpiryUrgencyLabel` /
      `expiryUrgencyChipClass` の**実装に差分が無い**（呼び出すだけ）
- [ ] `stock-row.tsx` / `location-group.tsx` に `'use client'` を付けていない
- [ ] 「編集」ボタンの `onClick` が `onEdit(stock)` に結線されている
