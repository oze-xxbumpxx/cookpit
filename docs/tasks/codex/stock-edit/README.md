# Codex Implementation Tasks — stock-edit

Sprint 8 Unit A（在庫の期限・保存場所・数量の後付け編集 + 買い物完了パネルへの期限入力）を
Codex に委譲するための実装指示書。**番号順に実行する**（Task 1 → 8）。

本ブリーフは IMP-2026-025 Phase 2（層別薄化）適用。**Domain / Infrastructure（Task 1・2）は
完成コードを同梱**し、**Application / Presentation（Task 4〜8）は公開シグネチャ + 不変条件 +
公開識別子一覧 + テスト観点を正本**とする。

## このタスクの背景（1 段落で把握する）

在庫（Stock）の賞味期限は、生成後に変更する手段が無く（Domain が `private readonly`）、
主要な流入経路である買い物完了パネルも常に `expiresAt: null` を送っている。結果として
**本番の在庫の賞味期限は事実上すべて `null`** になっており、ダッシュボードの
「賞味期限が近い在庫」は実装があるのに表示するデータが無い。本ユニットはこの 2 つの穴を塞ぐ。

## タスク一覧

| #   | ファイル                                       | 対象                              | 概要                                                              | 実装計画の Step |
| --- | ---------------------------------------------- | --------------------------------- | ----------------------------------------------------------------- | --------------- |
| 1   | [01-domain.md](./01-domain.md)                 | `packages/domain`                 | `Stock.updateDetails` / `Pantry.updateStockDetails` + 単体テスト  | Step 3          |
| 2   | [02-infrastructure.md](./02-infrastructure.md) | `packages/infrastructure`         | `save()` の `set` 句を 4 列へ拡張（**既存テスト修正あり**）       | Step 1・2       |
| 3   | [03-api-contract.md](./03-api-contract.md)     | `packages/api-contract`           | `updateStockSchema` + 契約テスト                                  | Step 5          |
| 4   | [04-application.md](./04-application.md)       | `packages/application`            | `UpdateStockDetailsUseCase` + DTO + テスト                        | Step 4          |
| 5   | [05-route.md](./05-route.md)                   | `apps/web/src/server/routes`      | `PUT /api/pantry/stocks/:stockId`                                 | Step 6          |
| 6   | [06-expiry-utils.md](./06-expiry-utils.md)     | `apps/web/src/app/_utils`         | 期限緊急度関数の `expiry.ts` への切り出し（**純粋な移動**）+ 配線 | Step 7・8       |
| 7   | [07-pantry-screen.md](./07-pantry-screen.md)   | `apps/web/src/app/pantry`         | 編集ダイアログ + 編集導線 + 保存場所ラベル・緊急度チップ          | Step 9・10      |
| 8   | [08-complete-panel.md](./08-complete-panel.md) | `apps/web/src/app/shopping-lists` | 買い物完了パネルへの賞味期限入力（行ごと任意展開）                | Step 11         |

Task 1〜3 は相互に独立。Task 4 は Task 1 に依存。Task 5 は Task 3・4 に依存。
Task 6 は独立。Task 7 は Task 5・6 に依存。Task 8 は独立（契約変更なし）。

## 確定値表（設計判断はすべて確定済み。実装中に変更しない）

| ID     | 確定内容                                                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1    | 編集できるのは **`amount`（値・単位）/ `expiresAt` / `storedLocation` の 3 項目のみ**。`displayName` / `purchasedAt` / `productId` / `sourceShoppingItemId` は**編集不可** |
| P-2    | **`PUT /api/pantry/stocks/:stockId`**。3 項目すべて**必須キー**（`optional()` にしない）。`null` 送信＝クリア。`PATCH` にはしない                                          |
| P-3    | 買い物完了パネルの期限入力は**行ごとに折りたたみ／任意展開**。既定は非表示。展開時は**独立した行**として追加する（既存の横並びに 3 つ目を詰め込まない）                    |
| P-4    | `/pantry` の在庫カードに**保存場所ラベル（常時）+ 緊急度チップ（閾値内のみ）**の両方を出す                                                                                 |
| P-5    | Domain の不変性方針の変更は **ADR-0016** に記録済み（`docs/decisions/ADR-0016-stock-details-mutable.md`）                                                                  |
| P-6    | Domain API は **`Stock.updateDetails(props)` 一括**（個別 setter にしない）。`Pantry.updateStockDetails(stockId, props)` が委譲                                            |
| 罠     | `DrizzlePantryRepository.save()` の `onConflictDoUpdate.set` を **4 列**（`amountValue` / `amountUnit` / `expiresAt` / `storedLocation`）へ拡張する（Task 2）              |
| 0 拒否 | `amount.value <= 0` は拒否。**`Quantity.of()` は `value === 0` を許容する**（`value < 0` のみ reject）ので、`Stock.updateDetails` 内で自前チェックが必須                   |
| 依存   | **Domain は `StockNotFoundError` を import してはならない**（Application 層のクラス。依存方向違反）。Domain は素の `Error('Stock not found')` を throw する                |
| 経路   | 404 = UseCase の**事前チェック**（`StockNotFoundError`）/ 422 = Domain の素の `Error` を UseCase が **try/catch で変換**（`InvalidStockOperationError`）。**404 が優先**   |
| 400    | Zod バリデーション失敗は `@hono/zod-validator` が**自前で 400** を返す（`app.onError` を経由しない）。422 と混同しない                                                     |
| strip  | `displayName` を送っても Zod の既定挙動（v4）で **strip される**（reject しない）。`.strict()` は付けない                                                                  |
| 閾値   | 緊急度チップの閾値は **3 日**。`EXPIRY_URGENCY_WITHIN_DAYS` として `expiry.ts` に置く（現行のダッシュボードのローカル定数 `EXPIRY_WITHIN_DAYS = 3` の値をそのまま移設）    |
| モデル | **Codex モデル / reasoning effort**: ＿＿＿＿（実装完了時に実際に使った値をこの行に記入し、`docs/reviews/stock-edit.md` と metrics YAML `codex:` に同じ値を記録する）      |

## 完了条件（全タスク通し）

```bash
pnpm lint        # 全 green
pnpm type-check  # 全 green
pnpm test        # 全 green
```

- **Task 2 で既存テスト 1 件の期待値を更新すること**（下記「特に注意」参照）。
- 既存テスト（Domain / Application / Infrastructure / apps/web の全既存観点）に regression が
  無いこと。特にダッシュボードのテスト（Task 6 の関数移動の影響を受ける）。
- `docs/06-ai-tools.md`「Codex 実装のレビューチェックリスト」の観点（識別子タイポ・
  Tailwind クラスタイポ・ハンドラ結線漏れ・`'use client'`・`import type`）をセルフチェック済み。
- **作業ブランチでのみコミットする**（main 直コミット禁止。lefthook がブロックする）。

## 特に注意（これを外すと静かに壊れる）

### 1. Repository の `set` 句（Task 2）

`packages/infrastructure/src/repositories/drizzle-pantry.repository.ts` の `save()` は
`onConflictDoUpdate` の `set` が `amountValue` の 1 列しか無い。ここを直さないと、
Domain と API を正しく実装しても **DB に反映されない**。しかも:

- **API は 200 を返す**
- **画面はレスポンス DTO（メモリ上の集約）を描画するので成功して見える**
- **リロードして初めて消えたと分かる**

UseCase 単体テストとコンポーネントテストでは**構造的に検出できない**。PGlite を使った
Infrastructure 層のテストでのみ検出できる。

さらに**罠には 2 つの顔がある**: `expires_at` / `stored_location` が丸ごと無いことに加え、
`amount_value` はあるが **`amount_unit` が無い**。つまり「数量の**値**は反映されるが、
**単位**を変えると反映されない」という、値が変わって見えるぶん気づきにくい形が存在する。
**「値は据え置き、単位だけ変える」テストを必ず独立したケースにすること。**

### 2. 既存テストが罠を「正しい挙動」としてアサートしている（Task 2）

`packages/infrastructure/tests/repositories/drizzle-pantry.repository.test.ts:111` の
`同一 id の再 save() は amountValue のみ更新し不変フィールドを維持する` が、現在の挙動を
そのまま固定している。`set` 句を拡張すると**このテストが 3 アサーションで失敗する**。
**これは回帰ではなく期待値の更新が必要な変更**である。テストを消さず、期待値を直すこと。

### 3. 既存のエラークラスを再定義しない（Task 4）

`StockNotFoundError`（`packages/application/src/pantry/stock-not-found.error.ts`）と
`InvalidStockOperationError`（同 `invalid-stock-operation.error.ts`）は **pantry-core で
作成済み**。新規作成せず import して使うこと。`apps/web/src/server/app.ts` の変更も不要。

## 対象外（このパックで実装しないもの）

- `displayName` / `purchasedAt` / `productId` / `sourceShoppingItemId` の編集
  （**Repository の `set` 句にも追加しない**）
- DB スキーマ変更・マイグレーション（`stocks.expires_at` / `stored_location` は既存の nullable 列）
- 賞味期限アラート / Web Push / PWA Badge（Sprint 8 Unit B）
- 消費・廃棄の取り消し（undo）・履歴テーブル（Sprint 8 Unit C）
- 在庫引き算（`GenerateShoppingListUseCase.applyPantryDeduction`）のロジック変更
- `expiryUrgencyChipClass` の移動（`category-color.ts` に据え置く）
- `docs/05-roadmap.md` 等のドキュメント更新（実装完了後にメイン側で対応）
- E2E smoke の追加（受け入れレビュー時にメイン側で判断）

## 参照ドキュメント（読み取り専用。実装の根拠が必要な場合のみ）

- 要件定義: `docs/requirements/stock-edit.md`（FR-1〜FR-8 / N-1〜N-9 / E-1〜E-7 / B-1〜B-6）
- 設計書: `docs/designs/stock-edit.md`（P-1〜P-6 の確定根拠・データフロー・§実装上の罠）
- 契約設計: `docs/designs/stock-edit.contract.md`（Zod 定義・ステータス・サンプル）
- 試験計画: `docs/tests/stock-edit.md`（全観点 ID + 実画面確認 MB-01〜16 + シードデータ表）
- 実装計画: `docs/implementation-plans/stock-edit.md`（Step 1〜12・依存・ロールバック）
- ADR: `docs/decisions/ADR-0016-stock-details-mutable.md`
