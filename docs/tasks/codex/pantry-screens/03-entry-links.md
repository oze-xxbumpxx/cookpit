# Task 3: 導線追加 — 「買い物完了」+「在庫」リンクを既存 2 ファイルへ追記

## 概要

既存 2 コンポーネントへの**追記のみ**を行う（新規ファイルなし。テストは既存ファイルへ追加）。

1. `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx` — 「買い物完了」ボタン +
   成功バナー + 「在庫を見る」リンク（P-4/P-5）
2. `apps/web/src/app/meal-plans/_components/meal-plan-client.tsx` — ヘッダーに「在庫」リンク（P-1）

**既存の state・関数名・分岐・JSX には一切触れない**（新規 state・新規ハンドラ・新規 JSX の
追加だけで実現する）。既存テストが 1 件でも red になったら追記方法が間違っている。

## アーキテクチャ制約

- 書き込みは Hono RPC（`@/lib/api-client` の `client`）。ドメインロジックを書かない。
- `any` 禁止・named export のみ・型のみは `import type`・「値なし」は `null`。
- 両ファイルとも既に `'use client'` 付き（変更不要）。

## 実装対象 1: `shopping-list-client.tsx`（追記）

現行の state（**触らない**）: `items` / `errorMessage` / `expandedItemId` / `addFormOpen` /
`submittingItemId` / `addSubmitting` / `refreshing` + `useOptimistic`（`markAsBought` 限定）。

追加する state（この 4 つだけ。名前は厳守）:

- `status`（初期値 `shoppingList.status`。完了成功時に応答で更新するローカル state）
- `completeSubmitting: boolean`
- `completeSuccess: boolean`
- `completeErrorMessage: string | null`

追加するハンドラ `handleComplete()`（**素の async。`startTransition` / `useOptimistic` を
使わない** — 完了 API は冪等でロールバック不要のため）:

1. `completeSubmitting` が true なら即 return（連打ガード）。
2. `setCompleteSubmitting(true)`・`setCompleteErrorMessage(null)`。
3. `client.api['shopping-lists'][':id'].complete.$post({ param: { id: shoppingList.id } })`。
4. `response.ok` → `const dto = await response.json()`。`setStatus(dto.status)`（`'completed'` になる）・
   `setCompleteSuccess(true)`。**`router.push` / `router.refresh` を呼ばない**（P-5。画面に留まる）。
5. `!response.ok` → `setCompleteErrorMessage('操作に失敗しました。')`。
6. catch → `setCompleteErrorMessage('通信エラーが発生しました。')`。
7. finally → `setCompleteSubmitting(false)`。

追加する JSX（既存 `errorMessage` バナー（`{errorMessage !== null && ...}`）の**直後**に置く）:

- `status === 'active'` のとき: 「買い物完了」`Button`（`className="h-11 w-full"`・
  `disabled={completeSubmitting}`・click で `handleComplete`。確認ダイアログなし。P-4）。
- `completeErrorMessage !== null` のとき: 既存 errorMessage と同一クラス列の赤バナー
  （`rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700`）。
- `completeSuccess` のとき: 成功バナー「買い物を完了しました」+ 「在庫を見る」
  `Link href="/pantry"`。コンテナは `rounded-lg border bg-secondary px-3 py-2 text-sm text-foreground`
  （セマンティックトークンのみ。green 系の直接色クラスを使わない）。リンクは
  `cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-9 px-2 text-foreground')`。
- 既存の「手動で追加」ボタン（`手動で追加` ラベル）の表示条件に `status === 'active'` を
  **AND で追加**する（既存条件は残す。completed 後は非表示。チェック・店舗再割当 UI は
  既存どおり残す — 変更しない）。

## 実装対象 2: `meal-plan-client.tsx`（追記）

ヘッダー右側の `<div className="flex justify-end">` を `flex justify-end gap-1` にし、既存
「履歴」`Link`（`href="/meal-plans/history"`）の**後ろ（右隣）**に以下を追加する:

```tsx
<Link
  href="/pantry"
  className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-9 px-2 text-foreground')}
>
  在庫
</Link>
```

既存「レシピ」「商品」「履歴」リンクの href・表示順・クラスは変更しない。

## 公開識別子一覧（タイポ照合基準）

`status` / `completeSubmitting` / `completeSuccess` / `completeErrorMessage` /
`handleComplete` / `買い物を完了しました` / `在庫を見る` / `在庫` /
`client.api['shopping-lists'][':id'].complete.$post`

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- RPC パスはブラケット記法 `client.api['shopping-lists'][':id'].complete.$post`
  （`shopping-lists` はハイフンを含むためドット記法不可。単数 `shopping-list` にしない）。
- 既存 state の `errorMessage` と新規 `completeErrorMessage` を**混同しない**（完了系の
  エラーは必ず `completeErrorMessage` へ。既存ハンドラの挙動を変えない）。
- 差分は「新規 state + 新規ハンドラ + 新規 JSX + 手動追加ボタンの条件 1 箇所」に限定する。
  既存テスト `LC-01〜22` / `WC-M-01〜11` / `MC-01〜06` の期待を 1 件も書き換えない
  （書き換えたくなったら実装が間違っている）。
- Tailwind クラス列は本指示書・既存コードからコピーする（手打ちタイポは tsc を通過する）。
- テスト追加時の新規ケース名プレフィックスは `CB-xx`（shopping-list 側）/ `MN-xx`
  （meal-plan 側）。既存プレフィックス（LC/WC-M/MC）を使わない。

## テスト

### `shopping-list-client.test.tsx`（既存へ CB-01〜11 を追加）

モック追加: 既存の `vi.mock('@/lib/api-client')` 構成に
`'shopping-lists': { ':id': { complete: { $post: vi.fn() } } }` 相当を追加（既存モックの
形に合わせる）。`createShoppingListDto` フィクスチャは既存を流用し `status` を変えて使う。

| #     | 観点                                                                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------- |
| CB-01 | `status: 'active'` → 「買い物完了」ボタン表示                                                                     |
| CB-02 | `status: 'completed'` → 「買い物完了」「手動で追加」とも非表示                                                    |
| CB-03 | click → `complete.$post({ param: { id: shoppingList.id } })` が呼ばれる                                           |
| CB-04 | **最重要**: 成功（`status: 'completed'` の DTO 応答）→ 成功バナー + 「在庫を見る」`href="/pantry"` + ボタン非表示 |
| CB-05 | 成功後も `router.push` / `router.refresh` が**呼ばれない**（P-5・自動遷移しない）                                 |
| CB-06 | `{ ok: false }` → 「操作に失敗しました。」・status 不変                                                           |
| CB-07 | reject → 「通信エラーが発生しました。」                                                                           |
| CB-08 | click で確認 UI が出現せず**即座に** `$post` が呼ばれる（P-4）                                                    |
| CB-09 | 未解決 Promise 中はボタン disabled                                                                                |
| CB-10 | 連打 → `$post` は 1 回のみ                                                                                        |
| CB-11 | 完了後、pending item のチェック・店舗再割当 UI は残る（手動追加のみ非表示。回帰・R-5）                            |

### `meal-plan-client.test.tsx`（既存へ MN-01〜02 を追加）

| #     | 観点                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------- |
| MN-01 | `mealPlan` の有無に関わらずヘッダーに「在庫」リンク（`href="/pantry"`）が常時表示                                |
| MN-02 | 既存「レシピ」（`/recipes`）「商品」（`/products`）「履歴」（`/meal-plans/history`）の href・表示順が不変（R-5） |

## 完了条件

- [ ] 既存テスト全件（`LC-01〜22` / `WC-M-01〜11` / `MC-01〜06`）が**変更なしのまま** green
- [ ] 追加分 CB-01〜11 / MN-01〜02 が green
- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` 全 green
- [ ] 差分が「新規 state・新規ハンドラ・新規 JSX・手動追加ボタン条件・ヘッダー `gap-1`」のみで
      あること（`git diff` で確認）
