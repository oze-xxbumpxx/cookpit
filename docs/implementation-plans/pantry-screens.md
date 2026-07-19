# 実装計画: pantry-screens

- 前提となる設計書: `docs/designs/pantry-screens.md`（確定・2026-07-19。P-1〜P-6 全件ユーザー確定
  〈全件推奨案A〉・D-1〜D-8 確定）
- レベル: L2
- 実装ルート: Codex 委譲
- 判断理由: 設計書冒頭のとおり既定（`docs/06-ai-tools.md` 実装ルート基準・Presentation 層のみの
  画面追加）。**IMP-2026-025 Phase 1 の Codex 軽量モードを適用**（本タスクは効果実測対象）。
  実質的な読者は Codex ブリーフ（`docs/tasks/codex/pantry-screens/`）であり、実装計画は
  タスク分解・対象ファイル・依存関係・完了条件・リスク・ロールバックのみを持つ。確定コード・
  完成コードはブリーフ側にのみ置き、本計画には書かない（二重生成の禁止。出典:
  `docs/claude-code/improvements/candidates/pantry-core.md` 事象 1）。

## 対象外（本計画に含めない）

設計書の対象外をそのまま継承する。バックエンド / Domain / Application / Infrastructure /
API Contract（Zod）/ DB スキーマの変更、保存場所の設定・編集 UI・API、消費量の部分入力 UI、
消費・廃棄の取り消し、PWA オフライン強化、Unit C（在庫引き算連携）は行わない。

## 変更対象ファイル（既存編集）

| パス                                                                        | なぜ変えるか                                                                                                                        |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`      | 「買い物完了」ボタン + 成功バナー + 「在庫を見る」リンクを追加（P-4/P-5）。既存のチェック・手動追加・店舗再割当ロジックには触れない |
| `apps/web/src/app/shopping-lists/_components/shopping-list-client.test.tsx` | 上記追記分のテストケースを追加（既存ケースは変更しない）                                                                            |
| `apps/web/src/app/meal-plans/_components/meal-plan-client.tsx`              | ヘッダーに「在庫」リンクを 1 個追加（P-1）。既存の作成・追加・削除フローには触れない                                                |
| `apps/web/src/app/meal-plans/_components/meal-plan-client.test.tsx`         | 「在庫」リンクの表示・遷移先のテストケースを追加（既存ケースは変更しない）                                                          |

上記 4 ファイル以外の既存ファイル（`packages/*`・`apps/web/src/server/`・他の `apps/web/src/app/**`）
は一切変更しない。

## 新規作成ファイル

| パス                                                          | 役割                                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web/src/app/pantry/page.tsx`                            | 在庫一覧の Server Component（`GetPantryUseCase` 直呼び・`pantryRepository()` 経由・D-3） |
| `apps/web/src/app/pantry/_utils/pantry-view.ts`               | `groupStocksByLocation` / `formatExpiresAt`（表示用純関数。P-3）                         |
| `apps/web/src/app/pantry/_utils/pantry-view.node.test.ts`     | 上記の単体テスト（`vitest.node.config.mts` の `*.node.test.ts` 規約）                    |
| `apps/web/src/app/pantry/_components/stock-row.tsx`           | stock 1 行（表示 + 使った/捨てたボタン。P-2/P-4/P-6）                                    |
| `apps/web/src/app/pantry/_components/stock-row.test.tsx`      | RTL テスト                                                                               |
| `apps/web/src/app/pantry/_components/location-group.tsx`      | 保存場所ごとのグループ（ヘッダー + stock 一覧）                                          |
| `apps/web/src/app/pantry/_components/location-group.test.tsx` | RTL テスト                                                                               |
| `apps/web/src/app/pantry/_components/pantry-client.tsx`       | 状態管理・全体統括（Client。D-4〜D-7）                                                   |
| `apps/web/src/app/pantry/_components/pantry-client.test.tsx`  | RTL テスト（Hono RPC モック）                                                            |

新規 9 ファイル（実装 5・テスト 4）+ 既存編集 4 ファイル = 計 13 ファイル。

## 既存実装の確認結果（実装前提）

- `apps/web/src/server/repositories.ts` に `pantryRepository(): DrizzlePantryRepository` が
  既に定義済み（D-3 の共有ファクトリはすでに存在。新規追加不要）。
- `packages/application` は `GetPantryUseCase` / `ConsumeStockUseCase` / `DiscardStockUseCase` /
  `PantryDto` / `StockDto` / `StorageLocation`（`'fridge' | 'freezer' | 'pantry'`）を
  トップレベル export 済み（`packages/application/src/index.ts` 経由）。
- `apps/web/src/lib/api-client.ts` の `client`（`hc<AppType>('/')`）はルート未変更のため無改修で
  使える。`client.api.pantry.$get()` / `client.api.pantry.stocks[':stockId'].consume.$post()` /
  `client.api.pantry.stocks[':stockId'].discard.$post()` / `client.api['shopping-lists'][':id'].complete.$post()`
  の 4 経路を使用する。
- `shopping-list-client.tsx` は現行、`items`/`errorMessage`/`expandedItemId`/`addFormOpen`/
  `submittingItemId`/`addSubmitting`/`refreshing` の state と `useOptimistic`（`markAsBought` 限定）
  を持つ。「買い物完了」機能はこれらと独立した新規 state・新規ハンドラとして追加する
  （`meal-plan-client.tsx` の `handleShoppingList` が既存フローと state を分離した先例と同型）。
- `meal-plan-client.tsx` は現行、ヘッダー `flex justify-end` 側に「履歴」リンクのみを持つ
  （`flex justify-start gap-1` 側に「レシピ」「商品」）。「在庫」リンクは「履歴」の隣に追加する。
- `Button` コンポーネント（`apps/web/src/components/ui/button.tsx`）は `variant="destructive"` を
  持つ（「捨てた」ボタンに使用）。

## 実装手順

1. **表示ユーティリティ** — `_utils/pantry-view.ts` + `.node.test.ts`。`groupStocksByLocation`
   （固定順 `fridge → freezer → pantry → null`・0 件グループ除外・全件 `null` のケース）、
   `formatExpiresAt`（非 null ケースのみ）を実装。
   - 完了条件: `pnpm --filter @cookpit/web test -- pantry-view` が green。設計書 §フロントエンド
     設計 `_utils/pantry-view.ts` のシグネチャ・`LOCATION_ORDER`/`LOCATION_LABELS`/
     `UNSET_LOCATION_LABEL` の定義と一致すること。
2. **stock 行コンポーネント** — `_components/stock-row.tsx` + `.test.tsx`。表示（displayName +
   数量 + `expiresAt` 併記）、「使った」「捨てた」ボタン（確認ダイアログなし・P-4/P-6）、
   `disabled={submitting}`。
   - 完了条件: RTL テスト green。観点: `expiresAt` 非 null 時のみ併記、両ボタンの
     `disabled` 条件、`onConsume`/`onDiscard` への配線。
3. **保存場所グループコンポーネント** — `_components/location-group.tsx` + `.test.tsx`。
   `LOCATION_LABELS` によるヘッダー変換、`stock-row` への配線（Step 1・2 完了後）。
   - 完了条件: RTL テスト green。観点: `location === null` で「保存場所未設定」ヘッダー、
     `submittingStockId` が対応する行だけに伝播すること。
4. **状態管理クライアント** — `_components/pantry-client.tsx` + `.test.tsx`（Step 1〜3 完了後）。
   - state: `stocks`（初期値 `pantry.stocks`）、`errorMessage`、`submittingStockId`（D-6）、
     `refreshing`。
   - `handleConsume(stockId)`: 対象 stock の `amount` をそのまま送信（P-2・全量ワンタップ）。
     成功時は応答 `PantryDto` で `stocks` を丸ごと置換（D-5）。
   - `handleDiscard(stockId)`: 成功時は応答 `PantryDto` で `stocks` を丸ごと置換。
   - `handleRefetch({ silent })`（D-7）: `GET /api/pantry` を再取得し `stocks` を置換。
     `focus` イベントで silent 呼び出し、手動更新ボタンで非 silent 呼び出し。
   - エラー処理は設計書 §エラー処理の表どおり（404/422/400 → 「操作に失敗しました。」、
     catch → 「通信エラーが発生しました。」）。
   - 完了条件: RTL テスト green。観点: 空状態表示、グルーピング表示、「使った」/「捨てた」で
     stock が一覧から消える、失敗時 `errorMessage`、focus イベントでの silent refetch、
     手動更新ボタン、二重送信防止（`submittingStockId` 中は対象行のみ disabled）。
5. **Server Component** — `pantry/page.tsx`（Step 4 完了後）。`GetPantryUseCase(pantryRepository())`
   を直呼び。`export const dynamic = 'force-dynamic'`。try/catch なし（`GetPantryUseCase` は
   例外を投げない。S-1〈pantry-core〉）。
   - 完了条件: `pnpm --filter @cookpit/web type-check` 通過。`/pantry` が SSR で表示される。
6. **買い物リスト詳細への「買い物完了」導線追加** — `shopping-list-client.tsx` + `.test.tsx` 追記
   （Step 1〜5 と独立して着手可）。既存 state・ハンドラには触れず、新規 state
   （`completeSubmitting`/`completeSuccess`/`completeErrorMessage`）と新規ハンドラ
   （`handleComplete`）を追加する。`shoppingList.status === 'active'` のときのみボタン表示
   （P-4）。成功後は成功バナー + 「在庫を見る」リンク（`Link href="/pantry"`）表示（P-5）、
   ステータスをローカル state で `'completed'` に更新し以後「買い物完了」・手動追加ボタンを
   非表示にする。
   - 完了条件: 既存 `shopping-list-client.test.tsx` の全ケースが green のまま、追記分
     （`status === 'active'` のときのみボタン表示、成功時のバナー・リンク・ボタン非表示化、
     失敗時/通信エラー時のメッセージ出し分け）のテストケースが追加され green。
7. **献立画面への「在庫」リンク追加** — `meal-plan-client.tsx` + `.test.tsx` 追記（P-1。Step 6 と
   同時期でも着手可・独立）。ヘッダー `flex justify-end` 側、既存「履歴」リンクの隣に
   `Link href="/pantry"` を追加。既存の作成・追加・削除フローには触れない。
   - 完了条件: 既存 `meal-plan-client.test.tsx` の全ケースが green のまま、「在庫」リンクの
     表示・`href` のテストケースが追加され green。
8. **品質ゲート + 実画面確認** — `pnpm lint` / `pnpm type-check` / `pnpm test` 全 green。
   manual-browser-verify（トークン適用・レスポンシブ・保存場所グループ表示・「使った」/
   「捨てた」の実操作・「買い物完了」→「在庫を見る」導線・focus refetch）。Codex 委譲のため
   review-codex-implementation（機械チェック + 受け入れレビュー）を実施し
   `docs/reviews/pantry-screens.md` に記録する。

## 依存関係

- Step 1 → Step 4（`groupStocksByLocation`/`formatExpiresAt` を使用）
- Step 2 → Step 3（`LocationGroup` が `StockRow` をレンダリング）
- Step 3 → Step 4（`PantryClient` が `LocationGroup` を使用）
- Step 4 → Step 5（`pantry/page.tsx` が `PantryClient` を使用）
- Step 6・Step 7 は Step 1〜5 と技術的に独立（既存ファイルへの追記のみ。ただし `client.api['shopping-lists']`
  の呼び出し形は `meal-plan-client.tsx` の既存 `handleShoppingList` と同型のため、実装順は
  どちらが先でもよい）
- Step 8 は全ステップ完了後
- パッケージ間依存: なし（`apps/web` 内で完結。`@cookpit/application`（`GetPantryUseCase`/
  `PantryDto`/`StockDto`/`StorageLocation`）への import は既存 workspace 依存の範囲）

## テスト計画

詳細な試験計画は `docs/tests/pantry-screens.md`（test-designer が並行作成）。配置は既存規約どおり
co-located。**注意**: `_utils/pantry-view.ts` のテストは JSX を含まない純粋関数のため
`pantry-view.node.test.ts`（`vitest.node.config.mts` の include 対象）として作成すること。
`.test.ts`（拡張子のみ）は node/dom いずれのプロジェクトにも含まれず実行されないため使用しない
（出典: meal-plan-screens 事象 1 / IMP-2026-012）。

| 対象                                 | ファイル                                                          | 種別 | モック                                                                     |
| ------------------------------------ | ----------------------------------------------------------------- | ---- | -------------------------------------------------------------------------- |
| `pantry-view.ts`                     | `_utils/pantry-view.node.test.ts`                                 | 単体 | なし                                                                       |
| `stock-row.tsx`                      | `_components/stock-row.test.tsx`                                  | RTL  | なし（props のみ）                                                         |
| `location-group.tsx`                 | `_components/location-group.test.tsx`                             | RTL  | なし（props のみ）                                                         |
| `pantry-client.tsx`                  | `_components/pantry-client.test.tsx`                              | RTL  | `vi.mock('@/lib/api-client')`（`client.api.pantry` 系）                    |
| `shopping-list-client.tsx`（追記分） | `shopping-list-client.test.tsx`（既存拡張）                       | RTL  | 既存モックに `'shopping-lists': { ':id': { complete: { $post } } }` を追加 |
| `meal-plan-client.tsx`（追記分）     | `meal-plan-client.test.tsx`（既存拡張）                           | RTL  | 既存モック済みの `next/link` を流用（`href` 検証）                         |
| `pantry/page.tsx`                    | なし（Server Component。type-check のみ）                         | -    | -                                                                          |
| API ルート                           | 追加なし（既存 `pantry.test.ts`/`shopping-lists.test.ts` で担保） | -    | -                                                                          |

## 品質ゲート・実行タイミング

- 各ステップ完了時: `pnpm --filter @cookpit/web type-check` と該当テストファイルの
  `pnpm --filter @cookpit/web test -- <ファイル名>` を都度実行する。
- 全ステップ完了後（Step 8）: `pnpm lint` / `pnpm type-check` / `pnpm test` / 必要に応じ
  `pnpm format` + manual-browser-verify + review-codex-implementation。

## リスク

| #   | リスク                                                                                                                                        | 対策                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| R-1 | `stock-row`/`location-group`/`pantry-client` の構築順を誤ると型チェックが通らない段階が生じる（shopping-list-screens 先例と同型の失敗モード） | 実装手順を「下位コンポーネントから積み上げる」順（Step 1〜5）に固定する                                                              |
| R-2 | consume/discard の応答形状（`PantryDto` 全体か単一 `StockDto` か）を取り違えると型エラーになる                                                | 設計書 D-3・D-5 のとおり「更新後 `PantryDto`（全在庫）」が確定形。ブリーフに明記し、Step 4 の type-check で検出できる                |
| R-3 | `shopping-list-client.tsx`/`meal-plan-client.tsx` という既存完了ファイルへの追記が既存テストを壊す                                            | 新規 state・新規ハンドラのみを追加し、既存の state・関数名・分岐には触れない（Step 6・7 の完了条件に既存ケース green を明記）        |
| R-4 | 「捨てた」に確認ダイアログがなく誤操作で在庫が消える（設計書 R-2 の継承）                                                                     | 設計判断どおり実装。取り消し手段がないことは Phase 2 申し送り事項（対応なし）                                                        |
| R-5 | P-3 により MVP1 では「保存場所未設定」の単一グループしか実際には表示されない（設計書 R-3 の継承）                                             | 実装上の対応なし（意図的な設計判断）。RTL テストは「固定順で並ぶこと」「複数グループが来た場合の表示」を仕組みとして検証するに留める |

## ロールバック方法

- 新規ファイルは `apps/web/src/app/pantry/` ディレクトリごと削除すれば完全に戻る（他所から
  参照されない）。
- `shopping-list-client.tsx`/`shopping-list-client.test.tsx` は「買い物完了」追加分の hunk のみを
  revert すればよい（既存 state・関数名を変更していないため差分は独立している）。
- `meal-plan-client.tsx`/`meal-plan-client.test.tsx` は「在庫」リンク追加分の hunk のみを revert
  すればよい。
- DB・API・契約の変更がないため、データやスキーマのロールバックは不要。

## ドキュメント更新対象

- `docs/05-roadmap.md` — Sprint 5 Unit B の状態を完了時に更新。
- `docs/designs/pantry-screens.md` — 実装完了時にステータスを「実装済み」へ更新。
- `docs/04-domain-model.md` — **対象外**（ドメインモデル変更なし。既存 Pantry/ShoppingList
  集約の定義を変更しないことを整合確認のみ行う）。
- `logs/YYYY-MM-DD.md` — セッションログ（close-session で記録）。
- `docs/reviews/pantry-screens.md` — Codex 実装の受け入れレビュー記録（正本。完了条件）。

## Orchestrator へ差し戻す事項

**なし。** 確定設計書（P-1〜P-6/D-1〜D-8 すべて確定済み）の範囲内で実装計画を完結できた。
