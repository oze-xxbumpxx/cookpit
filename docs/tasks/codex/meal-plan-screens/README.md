# Codex Implementation Tasks — meal-plan-screens

Sprint 3 Unit B（MealPlan 画面 UI）を Codex に委譲するための実装指示書。
**番号順に実行する**（02 は 01 の `_utils` / 検証済みパターンに依存）。

## タスク一覧

| #   | ファイル                                             | 対象               | 概要                                                                                          |
| --- | ---------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------- |
| 1   | [01-plan-screen.md](./01-plan-screen.md)             | `/meal-plans` 画面 | 表示ユーティリティ / 献立項目 / レシピピッカー / クライアント統合 / Server Component + テスト |
| 2   | [02-history-and-links.md](./02-history-and-links.md) | 履歴ビュー + 導線  | 履歴週カード / `/meal-plans/history` / recipes・products ヘッダーへのリンク追加 + テスト      |

## 前提（既に確定済み。実装中に変更しない）

設計書（`docs/designs/meal-plan-screens.md`、confirmed・設計判断 S-1〜S-8 / D-1〜D-5 確定済み）・
実装計画（`docs/implementation-plans/meal-plan-screens.md`）・試験計画（`docs/tests/meal-plan-screens.md`）
がすべて確定済み。各指示書は自己完結だが、根拠が必要な場合はこれらを読み取り専用で参照してよい。

**バックエンドは一切変更しない**: `packages/*`・`apps/web/src/server/`・DB・マイグレーションは
変更禁止。使用する API 5 本（POST /api/meal-plans、GET current、GET history、POST :id/recipes、
DELETE :id/recipes/:plannedRecipeId）と Zod 契約は実装・テスト済み（Unit A）。

## 確定値表（実装中に変更しない）

| ID  | 確定内容                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1 | 画面は `/meal-plans`（今週の編集）と `/meal-plans/history`（閲覧のみ）のルート分割                                                                                                                                                                                                                                                          |
| S-2 | 倍量はプリセットのみ: `[1, 1.5, 2, 3]`・表示は `1×` `1.5×` `2×` `3×`・デフォルト `1`。自由入力欄は作らない                                                                                                                                                                                                                                  |
| S-3 | `scheduledDate` は UI に一切出さない（表示も入力もしない。値は常に null）                                                                                                                                                                                                                                                                   |
| S-4 | 名前解決できない recipeId は「削除済みレシピ」表示・詳細リンクなし。ただし献立からの削除ボタンは有効のまま                                                                                                                                                                                                                                  |
| S-5 | レシピ名解決は Recipe 一覧から `Map<recipeId, name>` を構築。Map に無い ID = 削除済み                                                                                                                                                                                                                                                       |
| S-6 | 初期表示は Server Component の手動 DI 直呼び。操作は素の Hono RPC + `router.refresh()`。**TanStack Query は導入しない**（新規依存追加禁止）                                                                                                                                                                                                 |
| S-7 | MealPlan 未作成時は「今週の献立をはじめる」ボタンで作成（自動作成しない）。API は冪等なので連打安全                                                                                                                                                                                                                                         |
| S-8 | 導線は recipes / products 一覧ヘッダー左のリンク群へ「献立」を追加（Task 2）                                                                                                                                                                                                                                                                |
| D-1 | 対象は現在週のみ。過去・未来週の作成・編集 UI は作らない                                                                                                                                                                                                                                                                                    |
| D-2 | ステータス（draft 等）は一切表示しない                                                                                                                                                                                                                                                                                                      |
| D-3 | 献立からのレシピ削除に確認ダイアログは出さない（即時 DELETE）                                                                                                                                                                                                                                                                               |
| D-4 | 履歴の追加読み込みは `?limit=` リンク（4→8→12）。履歴画面に Client Component を作らない                                                                                                                                                                                                                                                     |
| D-5 | 現在週の識別子は Server Component で `WeekIdentifier.current().toString()` を算出し props で渡す。クライアントで土曜始まり計算を再実装しない                                                                                                                                                                                                |
| G-1 | `WeekIdentifier` の import は深いパス `@cookpit/domain/src/shared/week-identifier`（application パッケージと同規約）。**apps/web から `@cookpit/domain` を import するのは本タスクが初**。type-check が通らない場合は回避策を自作せず中断して報告する                                                                                       |
| G-2 | Hono RPC はブラケットアクセス `client.api['meal-plans']`（パスにハイフンを含むため）。型が解決しない場合は中断して報告する                                                                                                                                                                                                                  |
| G-3 | エラー文言は固定: RPC 失敗（`!response.ok`）=「操作に失敗しました。」/ 例外 catch =「通信エラーが発生しました。」                                                                                                                                                                                                                           |
| G-4 | 週表示は `formatWeekRange` で `7/4（土）〜7/10（金）` 形式（年なし・全角括弧・`〜` U+301C）。曜日は `['日','月','火','水','木','金','土']`                                                                                                                                                                                                  |
| G-5 | `'use client'` の要否: `meal-plan-client.tsx`・`recipe-picker.tsx`・`planned-recipe-item.tsx` = **必要**。`history-week-card.tsx`・`_utils/meal-plan-view.ts`・`page.tsx` 2 本 = **付けない**（history-week-card は Map を props で受けるため Client 境界にすると Next のシリアライズで壊れる）                                             |
| G-6 | UI 文言の固定値: タイトル「今週の献立」「献立の履歴」/ ボタン「今週の献立をはじめる」「レシピを追加」「献立に追加」「さらに表示」/ 空状態「今週の献立はまだありません」「レシピがまだ追加されていません」「履歴はまだありません」「レシピなし」「該当するレシピがありません」/ ラベル「今週」「削除済みレシピ」/ aria-label「献立から削除」 |
| G-7 | Tailwind はセマンティックトークンのみ（`bg-background` / `bg-card` / `text-foreground` / `text-muted-foreground` / `border` / `primary` 系）。`zinc-*` `amber-*` `bg-white` 等の直接色は禁止                                                                                                                                                |
| G-8 | Next の `page.tsx` のみ default export（フレームワーク規約の例外）。それ以外は名前付きエクスポートのみ                                                                                                                                                                                                                                      |

## 完了条件（全タスク通し）

```bash
pnpm lint        # 全 green
pnpm type-check  # 全 green
pnpm test        # 全 green（新規テスト含む）
```

- 既存テスト（product-list-client.test.tsx の WC-P-01〜04・API ルートテスト）に regression がないこと
- `docs/06-ai-tools.md`「Codex 実装のレビューチェックリスト」の観点（識別子タイポ・Tailwind クラスの
  タイポ / 連結ミス・イベントハンドラ結線漏れ・`'use client'` 漏れ・`import type` 漏れ）を
  セルフチェック済みであること

## 対象外（このパックで実装しないもの）

- ステータス遷移 UI・markAsCooked・scheduledDate の UI（Sprint 4 以降）
- 過去・未来週の編集、E2E テスト追加（E2E-01 は受け入れ時に判断）
- `packages/*` / `apps/web/src/server/` / DB / 契約の変更（禁止）
- グローバルナビゲーション新設・TanStack Query 導入（禁止）

## 参照ドキュメント（読み取り専用）

- 設計書: `docs/designs/meal-plan-screens.md`
- 実装計画: `docs/implementation-plans/meal-plan-screens.md`
- 試験計画: `docs/tests/meal-plan-screens.md`（U-V / WC-I / WC-K / WC-M / WC-H の全観点）
- API 契約: `packages/api-contract/src/meal-plan.schema.ts`
