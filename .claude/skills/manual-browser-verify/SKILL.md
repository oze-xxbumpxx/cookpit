---
name: manual-browser-verify
description: >
  apps/web の画面変更を dev サーバー + ブラウザ（Playwright）で手動確認する手順。
  画面実装の完了確認、Codex 実装のレビュー補完（Tailwind タイポ等は tsc を通過するため
  実画面確認が必須）に使う。確認項目ごとに PASS / BLOCKED(理由) / FAIL を報告する。
---

# ブラウザ手動確認スキル

`apps/web` の画面を実際に起動して確認する。テスト green でも実画面でしか分からない
問題（Tailwind クラスタイポ・結線漏れ・レイアウト崩れ）を検出する。
（出典: `logs/2026-06-24.md`・`logs/2026-06-26.md` タスク3 の実績を手順化。
自動化成功パターン: meal-plan-screens / shopping-list-screens）

## 発動条件

- 画面（`apps/web/src/app/**`）の追加・変更を含むタスクの完了確認。
- Codex 実装のレビュー（`docs/06-ai-tools.md` のチェックリストと併用）。
- 使わない場面: 画面に出ない変更（Domain / Application のみ・API のみ・ドキュメントのみ）。

## 手順

1. **確認項目を先に列挙する**（初期表示 / 入力・保存 / エラー系 / 遷移・キャンセル等）。
   試験計画 `docs/tests/<feature>.md` があればその FE 観点を項目にする。
2. dev サーバーを起動する。**リモート（DATABASE_URL 未設定）環境では PGlite 経路を使う**:
   `pnpm --filter @cookpit/web dev:pglite`（マイグレーション + シード + pglite:// で起動。
   apps/web/scripts/setup-pglite-dev.mjs 参照）。ローカルは `pnpm dev`（素の Turbopack で起動できる。Serwist は
   本番ビルド限定 — 2026-06-26 commit 473ad09。**古いログの「`--webpack` 必須」には
   従わない**。`docs/07-dev-rules.md` §環境の既知の事実）。
3. Playwright（Chromium 同梱）で `http://localhost:3000`（ポートは `pnpm dev` の出力に
   従う）配下の対象 URL へナビゲートし、項目を順に確認する。
   スクリーンショットを撮って報告に添える。
4. **環境制約の扱い**: リモート環境は `dev:pglite` で DB 経路も live 確認できる。
   BLOCKED は PGlite でも動かない項目（Neon 固有機能・PWA/Service Worker 等）に限定する。
   - 動かない項目は **BLOCKED（理由: …）** とし、擬似的に PASS 扱いしない。
   - BLOCKED 項目は該当コードのコードリーディングで実装の正しさを確認し、
     「コード確認済み・完全確認に必要な条件」と補足する。
   - **PWA / Service Worker（MB 系）**: 本番ビルドは `db/client.ts` の pglite 分岐を
     dead code 除去するため、リモートでは「本番ビルド + DB」が原理的に成立しない。
     PWA 項目はローカル（Neon 等の実 DB）確認事項として BLOCKED 理由にその旨を書く
     （出典: shopping-list-screens 事象 4）。
5. FAIL を見つけたら、該当箇所（path:line）と再現手順を添えて報告する（修正は依頼元の
   フローに従う。勝手にスコープ外修正をしない）。

## 自動化の型（リモートで推奨）

meal-plan-screens / shopping-list-screens で再現した型。毎回ゼロから探らない。

1. `pnpm --filter @cookpit/web dev:pglite` で起動を待つ
2. 必要なら API レスポンス形を事前確認（空状態・シード有無）
3. Playwright スクリプトは**対象パッケージ配下**（例: `apps/web/scripts/`）に置く
   （リポジトリ直下だと import 解決に失敗しやすい）
4. セレクタは **role / label / placeholder ベース**（CSS クラス依存を避ける）
5. 項目ごとに PASS / BLOCKED(理由) / FAIL を機械的に出力する

### 既知の UI 操作メモ（ライブラリ固有・簡潔に）

| 対象                     | 注意                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `type="search"` の input | role は `textbox` ではなく **`searchbox`**                                                  |
| 同梱 Chromium            | `executablePath` を明示しないと起動しない環境がある                                         |
| Base UI SelectField      | ネイティブ `<select>` ではない。`getByLabel(...).click()` → `getByRole('option', { name })` |
| 確認スクリプトの置き場   | `apps/web` 配下（パッケージの依存解決が通る場所）                                           |

## 完了条件

- 手順 1 で列挙した**全項目に PASS / BLOCKED(理由つき) / FAIL のいずれかが付いている**
  （サイレントに項目を落とさない）。
- BLOCKED 項目にはコードリーディングでの補完結果と、完全確認に必要な条件
  （ローカル環境 / DB 接続文字列 等）が書かれている。
- FAIL ゼロ、または FAIL の扱い（修正 / 差し戻し / 別タスク化）が決まっている。

## 良い例（実績）

- `logs/2026-06-26.md` タスク3 — レシピ編集画面の 4 項目を「live 確認 2 / コード確認補完 2
  （BLOCKED 理由つき）」に分けて報告。環境制約下でも確認の抜けと過大報告の両方を防いだ。
- meal-plan-screens — `dev:pglite` + Playwright で MB-01〜08 全 PASS（リモート自動化の初成功）。
- shopping-list-screens — 同型で MB 12 項目 live PASS。PWA 3 項目は本番ビルド制約で BLOCKED。
