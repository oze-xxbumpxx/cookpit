# Task 8: UI — 買い物完了パネルに賞味期限の任意入力を追加

## 概要

買い物完了パネルは現在 `expiresAt: null` をハードコードしており、在庫の主要な流入経路に
期限が付かない。行ごとに**任意で**賞味期限を入力できるようにする。

**契約・DTO・UseCase の変更は一切不要**（`stockAdditionSchema` は既に
`expiresAt: z.iso.date().nullable()` を持ち、`CompleteShoppingUseCase` もそのまま受け取れる）。
**変えるのはこのコンポーネント 1 ファイルだけ**。

対象は `apps/web/src/app/shopping-lists/_components/complete-shopping-panel.tsx` と
そのテスト。**他のタスクと独立して着手できる。**

> 本 Task は Presentation 層のため、指示書は**変更点 + 不変条件 + 落とし穴**を正本とする
> （IMP-2026-025 Phase 2）。JSX の完成コードは載せていない。既存のこのファイルを読んで
> 同じ書き方に揃えること。

## アーキテクチャ制約

- Presentation 層は API を呼ぶだけ。ドメインロジックを書かない。
- `any` 型は禁止。デフォルトエクスポート禁止。型のみのインポートは `import type`。
  `===` / `!==` を使う。「値なし」は `null`。
- **TanStack Query は使わない**（このプロジェクトでは不採用）。

## 背景（なぜ「行ごと折りたたみ」なのか）

この機能は一度 `docs/designs/shopping-complete-stock-selection.md` の Q-1 で
**却下されている**。却下理由は「買い物直後に全品目の期限を入れるのは負荷が高く、
**パネルも縦に長くなる**」。

したがって「行に日付入力を常時表示する」のは**この却下理由に真正面からぶつかる**。
P-3 の確定案は**行ごとに折りたたみ、押した行だけ展開する**形で、
**既定状態のパネル高さを一切変えない**ことが要件である。

## 実装対象ファイル

### `apps/web/src/app/shopping-lists/_components/complete-shopping-panel.tsx`（変更）

#### 1. 行の state に 2 つ追加

現在の行 state は `Record<itemId, { checked, amountText, storedLocation }>`。ここへ追加する:

- `expiresAt: string`（`Input type="date"` の値。未入力は空文字 `''`）
- `expiresAtExpanded: boolean`（既定 `false`）

既存の `updateRow` パターンにそのまま乗せる。

#### 2. `StockAdditionRow`（同ファイル内のローカルコンポーネント）に入力欄を追加

- 数量・保存場所の**横並び行（`<div className="flex gap-2">`）の下**に、
  「賞味期限を設定」のテキストリンク調ボタンを置く。
- 押すと `expiresAtExpanded` が `true` になり、**独立した行**として
  `Input type="date"` を含むブロックが展開される（`label` + `Input` の縦積み。
  既存の数量・保存場所と同じ `label` + フィールドの書き方に揃える）。
- 展開中はボタンの文言を「賞味期限を削除」に変え、押すと **`expiresAt` を空文字にクリアして
  折りたたむ**。

**`Input type="date"` を既存の横並び行（`QuantityField` + `SelectField`）に 3 つ目として
入れてはいけない。** 375px 幅で破綻する（設計 P-3 で明示的に排除した案 A）。

#### 3. 送信ボディの組み立てを変更

現在 `handleComplete` 内の `additions.push({...})` にある **`expiresAt: null` のハードコード**を
次に置き換える。

```ts
expiresAt: row.expiresAt === '' ? null : row.expiresAt,
```

`amount` / `storedLocation` / `itemId` の組み立ては**変更しない**。

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **`isRowSelected` の判定式を変えない。** 現在は
  `checked && isAmountValid(amountText)`（「意思」と「妥当性」の論理積）で、数量を打ち直しても
  選択が落ちない設計になっている。**ここに `expiresAt` の条件を足さない**
  （期限は**任意入力**であり、未入力でも在庫化できることが要件 N-8 / R-3）。
- **「すべて選択 / すべて解除」トグルは `expiresAt` を触らない。** チェック状態だけを変える。
  展開状態や入力済みの期限を巻き添えでクリアしないこと。
- **展開ボタンを `<button type="button">` にする。** `type` を省くとフォーム内で
  submit 扱いになり、パネルが意図せず送信される。既存の自作チェックボックスも
  `type="button"` を明示している。
- **`aria-expanded` を付ける。** 折りたたみ UI なので、展開ボタンに
  `aria-expanded={expiresAtExpanded}` を付ける（テストからも参照する）。
- **`useId()` を使う。** 既存の行は `amountId` / `locationId` / `hintId` を `useId()` で
  作って `label` の `htmlFor` に渡している。日付入力にも同じ形で `expiresAtId` を作る。
  **ハードコードした id 文字列を使わない**（行が複数あるので衝突する）。
- **`'use client'` は既に付いている**（ファイル冒頭）。追加も削除もしない。
- **Tailwind クラス名のタイポに注意**（`tsc` / `eslint` を通過してしまう）。
  既存行のクラス（`flex flex-col gap-2 rounded-xl border border-border bg-background p-3`、
  `text-xs text-muted-foreground`、`h-11 rounded-xl bg-background` など）をコピーして使う。
- **`expiresAt` の型は `string`（空文字あり）で持つ。** `string | null` にしない
  （`Input` の `value` に `null` を渡すと React が uncontrolled 警告を出す）。
  `null` への変換は**送信時の 1 箇所だけ**で行う。
- **`storedLocation` の扱いは変えない。** 既存どおり `toStorageLocation(row.storedLocation)` で
  `''` → `null` に変換する（`expiresAt` と変換の書き方が違うが、既存に合わせる）。

## テスト

`apps/web/tests/app/shopping-lists/_components/complete-shopping-panel.test.tsx`
（既存ファイルがあれば追記、無ければ新規作成）。

> **テストファイルの拡張子に注意**: `apps/web` の vitest は `*.node.test.ts` /
> `*.dom.test.ts` / `*.test.tsx` で拾う。コンポーネントテストは **`*.test.tsx`**。
> 素の `*.test.ts` は `server` 配下以外では **silent skip** になる。

試験計画 `docs/tests/stock-edit.md` §7-2（CSP-01〜06）。

**必須ケース**:

- 既定では日付入力が**表示されていない**（パネル高さが変わらないことの代理検証）
- 「賞味期限を設定」を押すと日付入力が表示される（`aria-expanded` が `true` になる）
- 展開して日付を入力し完了すると、その品目の `expiresAt` に**入力値**が送られる
- 展開せずに完了すると、その品目の `expiresAt` が **`null`** で送られる（既存挙動の後方互換）
- 「賞味期限を削除」で値がクリアされ、その後完了すると `expiresAt: null` が送られる
- **一部の品目だけ期限を入力した混在ケース**で、入力した品目だけ値が入り、
  他は `null` になる（要件 B-6）

## 完了条件

- [ ] `pnpm --filter @cookpit/web test` 全 green（既存の買い物リスト系テストを含む）
- [ ] `pnpm --filter @cookpit/web type-check` / `pnpm lint` 全 green
- [ ] **契約・DTO・UseCase・ルートに差分が無い**（`packages/` と `apps/web/src/server/` に
      `git diff` が出ないこと。このタスクはコンポーネント 1 ファイルとテストのみ）
- [ ] 既定状態でパネルの高さが変わっていない（日付入力が既定で非表示）
- [ ] 375px 幅で日付入力行がレイアウトを崩さない（目視。試験計画 MB-14）
- [ ] `isRowSelected` の判定式に差分が無い
