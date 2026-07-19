# Codex Implementation Tasks — pantry-screens

Sprint 5 Unit B（Pantry 在庫管理の画面一式）を Codex に委譲するための実装指示書。
**番号順に実行する**（Task 1 → 2 → 3。Task 3 は Task 1・2 と技術的に独立だが、動作確認の
都合で最後に回す）。バックエンドは Unit A で実装済み・**一切変更しない**。

本ブリーフは IMP-2026-025 Phase 2（層別薄化）適用。Presentation 層のため完成コードの同梱は
最小化し、**公開シグネチャ + 不変条件 + 公開識別子一覧（タイポ照合基準）+ テスト観点**を正本とする。

## タスク一覧

| #   | ファイル                                     | 対象                                                | 概要                                                           |
| --- | -------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| 1   | [01-view-utils.md](./01-view-utils.md)       | `apps/web/src/app/pantry/_utils/`                   | 表示用純関数（グルーピング・賞味期限表示）+ 単体テスト         |
| 2   | [02-pantry-screen.md](./02-pantry-screen.md) | `apps/web/src/app/pantry/`                          | `/pantry` 在庫一覧画面（SC + Client 3 コンポーネント）         |
| 3   | [03-entry-links.md](./03-entry-links.md)     | `shopping-list-client.tsx` / `meal-plan-client.tsx` | 「買い物完了」導線 + 「在庫」ナビリンク（既存 2 ファイル追記） |

## 前提（既に確定済み。実装中に変更しない）

設計書（P-1〜P-6 全件ユーザー確定 2026-07-19・D-1〜D-8 確定）・実装計画・試験計画が確定済み。
各指示書はこれらから転記した自己完結の内容。API・DTO・Zod 契約・DB は Unit A（main マージ済み）
のものをそのまま使う。

## 確定値表（設計判断はすべて確定済み。実装中に変更しない）

| ID     | 確定内容                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1    | `/pantry` への恒久導線は `meal-plan-client.tsx` ヘッダー（`justify-end` 側・「履歴」の隣）に「在庫」リンク                                                                |
| P-2    | 「使った」= **残量全部を 1 タップで消費**（`json: { amount: stock.amount }` をそのまま送信。数量入力フォームは作らない）                                                  |
| P-3    | グルーピングは**機構のみ**実装。固定順 `fridge → freezer → pantry → null(未設定)`。MVP1 実データは全件 `storedLocation: null`（単一グループ表示が正常）                   |
| P-4    | 「買い物完了」に確認ダイアログ**なし**（ワンタップ。API は冪等）                                                                                                          |
| P-5    | 完了成功後は**自動遷移しない**。成功バナー「買い物を完了しました」+「在庫を見る」リンク（`href="/pantry"`）                                                               |
| P-6    | 「捨てた」に確認ダイアログ**なし**（`AlertDialog` を import しない）                                                                                                      |
| D-3    | Repository 組み立ては **`@/server/repositories` の `pantryRepository()` 経由**。既存 2 画面の `new Drizzle...Repository(getDb())` 直書きは**真似しない**                  |
| D-4    | TanStack Query 不採用。素の Hono RPC + `useState`。**`useOptimistic` / `startTransition` も使わない**（shopping-list-client とは意図的に異なる）                          |
| D-5    | consume / discard 成功時は応答の**更新後 `PantryDto` で `stocks` state を丸ごと置換**（部分マージしない）                                                                 |
| D-6    | 二重送信防止は `submittingStockId: string \| null`（操作中の stock の行のみ disable）                                                                                     |
| D-7    | `window` の `'focus'` イベントで silent refetch（失敗は無視）+ ヘッダー「更新」ボタンで非 silent refetch（失敗時はエラー表示）                                            |
| 文言   | エラー: 「操作に失敗しました。」（`!response.ok`）/「通信エラーが発生しました。」（catch）。空状態: 「在庫がありません」。成功バナー: 「買い物を完了しました」            |
| 表示   | 賞味期限は `expiresAt !== null` のときのみ `〜8/1まで` 形式で併記（MVP1 では常に null のため通常非表示。表示ロジック自体は実装する）                                      |
| モデル | **Codex モデル / reasoning effort**: ＿＿＿＿（実装完了時に実際に使った値をこの行に記入し、`docs/reviews/pantry-screens.md` と metrics YAML `codex:` に同じ値を記録する） |

## 完了条件（全タスク通し）

```bash
pnpm lint        # 全 green
pnpm type-check  # 全 green
pnpm test        # 全 green（新規 PV-01〜08 / PC-01〜17 / LG-01〜03 / SR-01〜07 / CB-01〜11 / MN-01〜02 含む）
```

- 既存テスト（`LC-01〜22` / `WC-M-01〜11` / `MC-01〜06` / API ルートテスト / E2E smoke）に regression がないこと
- **`pantry/page.tsx` が `pantryRepository()` 経由であること（D-3。最重要確認点。既存 2 画面の直書き先例に引きずられない）**
- `docs/06-ai-tools.md`「Codex 実装のレビューチェックリスト」の観点（識別子タイポ・Tailwind クラスタイポ・
  ハンドラ結線漏れ・`'use client'`・`import type`）をセルフチェック済みであること
- **作業ブランチでのみコミットする**（main 直コミット禁止。lefthook がブロックする）

## 対象外（このパックで実装しないもの）

- バックエンド / Domain / Application / Infrastructure / API Contract / DB スキーマの変更（一切禁止）
- 保存場所（`storedLocation`）の設定・編集 UI・API（P-3。Phase 2）
- 消費量の部分入力フォーム（P-2）・消費/廃棄の取り消し（Phase 2）
- 賞味期限管理の完全対応（Phase 2）・在庫引き算連携（Unit C）・PWA オフライン強化
- E2E smoke の追加（推奨・任意。受け入れレビュー時にメイン側で判断）
- `docs/05-roadmap.md` 等ドキュメント更新（実装完了後にメイン側で対応）

## 参照ドキュメント（読み取り専用参照。実装の根拠が必要な場合のみ）

- 設計書: `docs/designs/pantry-screens.md`（P-1〜P-6 / D-1〜D-8 の詳細根拠・データフロー全文）
- 実装計画: `docs/implementation-plans/pantry-screens.md`（分解・依存・ロールバック）
- 試験計画: `docs/tests/pantry-screens.md`（全 48 観点 + 実画面確認 MB-01〜10 の完全な一覧）
- Unit A 確定契約: `docs/designs/pantry-core.md` / `docs/designs/pantry-core-contract.md`
