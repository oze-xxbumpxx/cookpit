# 実装計画: project-refactoring

- 対応設計書: docs/designs/project-refactoring.md（confirmed / L2）
- 試験計画: docs/tests/project-refactoring.md
- 方針: 観点ごとに 1 コミット。各コミット前に `pnpm lint` / `pnpm type-check` / `pnpm test` を通す。

## 全体の完了条件

- 全ステップ完了時点で type-check 5/5 PASS、lint 0 error、テスト 1269 件 PASS
  （domain 352 / application 205 / infrastructure 53 / api-contract 220 / web 439）。
- API・DB・画面の挙動に差分が無い。
- スコープ外の変更（機能追加・文言変更・性能改善）を含まない。

---

## ステップ 1: 観点 A — パッケージ公開境界の統一

### 対象ファイル

- `packages/domain/src/index.ts`（追記）
- `packages/domain/src/recipe/recipe-ingredient.ts`（`ProductId` → `ProductRef` 改名）
- `packages/application/src/**`（213 箇所の import 書き換え）
- `packages/infrastructure/src/**`（65 箇所）
- `packages/api-contract/src/**`（5 箇所）
- `apps/web/src/app/meal-plans/page.tsx` / `history/page.tsx`（2 箇所）
- `apps/web/src/db/pglite-client.ts`（`@cookpit/infrastructure/src/db/schema` → `@cookpit/infrastructure`）

### 変更内容

1. `recipe-ingredient.ts` の `export interface ProductId` を `ProductRef` へ改名
   （`RecipeIngredientCreateProps.productRef` の型注釈とクラス内の型注釈も追随）。
2. `packages/domain/src/index.ts` に全公開シンボルを `export * from './<dir>/<file>'` で集約。
   対象は集約 5 種（recipe / product / meal-plan / shopping-list / pantry）、
   共有（identifier / money / quantity / unit / week-identifier / store / seasoning）、
   Repository インターフェース 6 種。テストファイルは含めない。
3. `@cookpit/domain/src/...` からの import をすべて `@cookpit/domain` に機械置換し、
   同一ファイル内で重複した import 文を 1 本にまとめる。
4. `import type` と値 import の区別は現行を維持する。

### 完了条件

- `grep -r "@cookpit/domain/src" apps packages` が 0 件。
- `grep -r "@cookpit/infrastructure/src" apps` が 0 件。
- type-check 5/5、テスト件数・結果がベースラインと一致。

### リスクとロールバック

循環参照が発生した場合は当該ファイルのみ相対 import に戻す。ステップ単位で `git revert` 可能。

---

## ステップ 2: 観点 C — エラー変換のテーブル化と default export 解消

### 対象ファイル

- `apps/web/src/server/app.ts`
- `apps/web/src/app/api/[[...route]]/route.ts`
- （必要なら）`apps/web/src/server/routes/*.test.ts` の import

### 変更内容

1. 実装前に 11 個の具象エラークラスの継承元を全件確認する
   （`NotFoundError` 系 8 / `InvalidStateError` 系 3 の想定。差異があれば個別分岐を残す）。
2. `onError` を `NotFoundError` → 404 / `InvalidStateError` → 422 / それ以外 → 500 の 3 分岐に置換。
3. `export default app` を `export const app` へ変更し、`route.ts` を
   `import { app } from '@/server/app'` に追随させる。

### 完了条件

- `server/routes/*.test.ts`（route テスト 100 件超）が全 PASS し、404 / 422 / 500 の
  返却が変わらない。
- `apps/web/src` に App Router 例外以外の default export が無い。

---

## ステップ 3: 観点 F — 日付変換ヘルパの集約

### 対象ファイル

- `packages/infrastructure/src/repositories/mappers.ts`（追記）
- `packages/infrastructure/src/repositories/drizzle-pantry.repository.ts`
- `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.ts`
- `packages/infrastructure/src/repositories/drizzle-meal-plan.repository.ts`
- `packages/application/src/shared/date.ts`（新規）
- `packages/application/src/pantry/pantry.mapper.ts`
- `packages/application/src/shopping-list/shopping-list.mapper.ts`

### 変更内容

1. `mappers.ts` に `toLocalDate(value: string): Date` と `toLocalDateString(value: Date): string`
   を定義（いずれも非 null 前提）。3 リポジトリのローカル定義を削除して import に差し替える。
   meal-plan の nullable 版は呼び出し側で `=== null` 判定に展開する。
2. `application/src/shared/date.ts` に `toLocalDateString` を定義し、2 mapper のローカル定義を
   削除して import に差し替える。`shared/errors.ts` と同じ配置規約に従う。
3. Domain（`week-identifier.ts`）には手を入れない。

### 完了条件

- `padStart(2, '0')` による日付整形の定義が infrastructure に 1 箇所、application に 1 箇所、
  domain（week-identifier）に 1 箇所のみ。
- infrastructure 53 件 / application 205 件が PASS（日付往復のテストを含む）。

---

## ステップ 4: 観点 E — ShoppingList 系 UseCase の重複解消

### 対象ファイル

- `packages/application/src/shopping-list/load-shopping-list.ts`（新規）
- `packages/application/src/shopping-list/mark-as-bought.use-case.ts`
- `packages/application/src/shopping-list/set-item-checked.use-case.ts`
- `packages/application/src/shopping-list/reassign-store.use-case.ts`

### 変更内容

1. `loadActiveShoppingList(repository, shoppingListId, operation)` を新設。
   処理順は「`findById` → `null` なら `ShoppingListNotFoundError` →
   `status !== 'active'` なら `InvalidShoppingListStateError(status, operation)`」で現行と同一。
2. `requireItem(shoppingList, itemId, rawItemId)` を新設し、
   未存在なら `ShoppingItemNotFoundError` を送出。`Array.find` の結果は `?? null` で
   `null` に正規化する（規約「値なしは null」）。
3. 保存後の再取得（現行の `if (updated === undefined) throw new Error(...)`）も
   同ヘルパに寄せ、メッセージを現行と同一に保つ。
4. 3 UseCase の JSDoc（`@throws`）は現行のまま維持する。

### 完了条件

- application 205 件 PASS。特に `shopping-list-use-cases.test.ts` の異常系
  （404 / 422 / 品目未存在）が全 PASS。
- 3 UseCase から重複ブロックが消えている。

---

## ステップ 5: 観点 B — Server Component の DI 統一

### 対象ファイル

- `apps/web/src/app/recipes/page.tsx`
- `apps/web/src/app/recipes/[id]/page.tsx` / `[id]/edit/page.tsx`
- `apps/web/src/app/shopping-lists/page.tsx` / `[id]/page.tsx`
- `apps/web/src/app/meal-plans/page.tsx` / `history/page.tsx`
- `apps/web/src/app/products/page.tsx` / `[id]/page.tsx` / `[id]/edit/page.tsx`

### 変更内容

1. `new DrizzleXxxRepository(getDb())` を `@/server/repositories` のファクトリ呼び出しに置換。
2. 置換後に不要となった `@cookpit/infrastructure` / `@/db/client` の import を削除。
3. 1 ページで同一 DB クライアントを複数 Repository に渡していた箇所（`meal-plans/page.tsx` の
   `const db = getDb()` 等）は、ファクトリが都度 `getDb()` を呼ぶ形に揃える
   （`getDb()` は既存のシングルトン取得であり、接続数は増えないことを実装時に確認する）。

### 完了条件

- `apps/web/src/app/**` に `new Drizzle` が 0 件。
- `@cookpit/infrastructure` の import が `src/server/repositories.ts` と `src/db/*` に閉じている。
- web 439 件 PASS。

---

## ステップ 6: 観点 D — mutation ボイラープレートの共通化

### 対象ファイル

- `apps/web/src/lib/use-api-action.ts`（新規）
- `apps/web/src/lib/use-api-action.test.tsx`（新規）
- `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`
- `apps/web/src/app/shopping-lists/_components/shopping-list-entry-client.tsx`
- `apps/web/src/app/meal-plans/_components/meal-plan-client.tsx`
- `apps/web/src/app/pantry/_components/pantry-client.tsx`

### 変更内容

1. `useApiAction()` を新設。`pending` / `errorMessage` / `run(fn, handlers)` / `reset()` を提供し、
   `!response.ok` → `'操作に失敗しました。'`、例外 → `'通信エラーが発生しました。'` を内包する。
   二重実行ガード（`if (pending) return`）も内包する。
2. 非 optimistic な mutation ハンドラをこのフックに載せ替える
   （sync / complete / reopen / refetch / addItem / addStock / 献立系の各操作）。
3. `useOptimistic` + `startTransition` を使う `handleMarkAsBought` / `handleSetChecked` は
   **現行構造のまま残す**（設計書「フロントエンド設計」の判断）。
4. フック自体の単体テスト（成功 / `!ok` / 例外 / 二重実行ガード）を追加する。

### 完了条件

- `shopping-list-client.tsx` の `useState` が削減され、エラー文言のリテラルが
  各 client から消えて `use-api-action.ts` に集約されている。
- 既存のコンポーネントテスト（`shopping-list-client.test.tsx` 他）が**修正なしで** PASS する
  ことを優先する。テスト修正が必要になった場合は、その理由を最終報告に記載する。
- web は 439 件＋フック単体テスト分の増加。

---

## ステップ 7: 観点 G — 巨大テストファイルの分割

### 対象ファイル

- `packages/application/src/shopping-list/shopping-list-use-cases.test.ts`（1171 行）
- `apps/web/src/app/shopping-lists/_components/shopping-list-client.test.tsx`（1160 行）
- `apps/web/src/server/routes/shopping-lists.test.ts`（814 行）

### 変更内容

1. application: UseCase 単位のファイルへ分割（generate / get / add-item / mark-as-bought /
   set-item-checked / reassign-store / reopen / sync）。共有のテストヘルパ（fixture 生成関数）は
   同ディレクトリの `test-helpers.ts` へ切り出す。
2. web client: 機能単位（品目操作 / 完了・再開 / 同期・手動追加）へ分割。共通の
   `renderClient` ヘルパを切り出す。
3. route: 同様に機能単位へ分割。
4. `describe` / `it` のタイトル・件数・アサーションは変更しない（移動のみ）。

### 完了条件

- 分割後のテスト件数が分割前と一致（application 205 / web 439 を維持。ステップ 6 で
  増えたフックテスト分は加算）。
- 各ファイルが概ね 400 行以下。

---

## 実施順の根拠

A（import 経路）を先に済ませると以降の全ステップの差分が読みやすくなる。
C / F は独立性が高く小さい。E は F の後（application の共通置き場が確定してから）。
B は web 内で完結。D は web の構造変更を含むため後半。G はコード変更が完了してから
テストを動かす方が、分割とロジック変更が混ざらない。
