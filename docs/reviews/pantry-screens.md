# レビュー記録: pantry-screens（IMP-2026-025 Phase 1 / L2）

feature 全体のレビュー記録。タスク単位（Codex 委譲 Task 1〜）で追記していく。

---

## Task 1: 表示ユーティリティ — pantry-view 純関数（受け入れレビュー）

- 実施日: 2026-07-20
- 実装ルート: Codex 委譲（指示書: `docs/tasks/codex/pantry-screens/01-view-utils.md`）
- レビュー手順: review-codex-implementation Skill（機械チェック → 品質ゲート → 人間チェックリスト → 敵対的精査パス）
- ブランチ: `feature/pantry-view-utils`（基準コミット `7782ae8`。レビュー時点では未コミットの作業ツリー）
- 正典: 設計書 `docs/designs/pantry-screens.md` / 実装計画 `docs/implementation-plans/pantry-screens.md`
- **判定: 受け入れ可（差し戻しなし。Must 0 / Should 0 / 申し送り 1）**

### レビュー範囲

| ファイル                                                  | 内容                                                                                                            |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/pantry/_utils/pantry-view.ts`           | `LOCATION_LABELS` / `UNSET_LOCATION_LABEL` / `StockLocationGroup` / `groupStocksByLocation` / `formatExpiresAt` |
| `apps/web/src/app/pantry/_utils/pantry-view.node.test.ts` | 単体テスト PV-01〜08（8 件）                                                                                    |

### 機械チェック + 品質ゲート

- check-codex-implementation.mjs: 対象 1 ファイル・識別子 225 件照合 → **FAIL 0 / WARN 2 / INFO 0**
  - WARN 2 件はローカル変数 `groups` / `parts` への誤検出（エクスポート識別子ではない）。目視で PASS 確定。
- run-quality-gates.sh: lint / type-check / test すべて **PASS**（apps/web 273 テスト green）
- turbo キャッシュ非経由の直接 Vitest 実行でも `pantry-view.node.test.ts` 8 テスト全 green
  （`.node.test.ts` 拡張子の silent skip 罠に該当しないことを実行ログで確認）

### チェックリスト（docs/06-ai-tools.md 全 8 項目）

| 項目                  | 判定             | 根拠                                                                   |
| --------------------- | ---------------- | ---------------------------------------------------------------------- |
| 識別子のタイポ        | PASS             | スクリプト WARN 2 は誤検出。エクスポート 5 識別子は指示書と完全一致    |
| Tailwind タイポ・連結 | PASS（対象なし） | 純関数のみ、UI 変更なし                                                |
| ハンドラ結線漏れ      | PASS（対象なし） | 同上                                                                   |
| 'use client'          | PASS（対象なし） | 同上                                                                   |
| `import type` 規約    | PASS             | 実装・テストとも `import type { StockDto, ... }`（値 import なし）     |
| 命名の傾向ずれ        | PASS             | `LOCATION_LABELS` のキーは `fridge`/`freezer`/`pantry`（union と一致） |
| 差し戻しの部分反映    | N/A              | 初回レビュー                                                           |
| バリデーション分岐    | PASS（対象なし） | Zod スキーマ変更なし                                                   |

実画面確認は画面変更を含まないため対象外。

### 敵対的精査パスで確認した点（問題なし・Task 1）

- **固定順の逆転リスク**（shopping-list の `groupItemsByStore` は未定が先頭）→ `LOCATION_ORDER`
  は `fridge → freezer → pantry → null` で指示書どおり。PV-01 が逆順入力で担保。
- **0 件グループの除外・入力順維持**: `filter` ベースの実装で両立。PV-02 / PV-05 で担保。
- **`formatExpiresAt` の UTC 日付ずれ**: `new Date()` 不使用、`split('-')` + `Number()` の
  文字列分解で指示書どおり。ゼロ埋めなしも PV-07 / PV-08 で担保。
- **ラベル網羅**: PV-06 が 4 パターン全件を `toEqual` で固定（弱いアサーションなし）。
- **入力配列の非破壊**: `filter` は新配列を返すため入力を変更しない。

### 申し送り（修正不要・Task 1）

1. **`LOCATION_ORDER` の網羅性は型で担保されない**: `LOCATION_LABELS` は
   `Record<StorageLocation, string>` のためキー漏れが型エラーになるが、`LOCATION_ORDER` は
   `(StorageLocation | null)[]` のため、将来 `StorageLocation` union に値が追加されても
   コンパイルエラーにならず、該当在庫が出力から静かに脱落する。MVP1 では union 追加予定が
   ないため修正不要。union を拡張する際は `LOCATION_ORDER` への追加を忘れないこと。

---

## Task 2: `/pantry` 画面 — Server Component + Client 3 コンポーネント（受け入れレビュー）

- 実施日: 2026-07-20
- 実装ルート: Codex 委譲（指示書: `docs/tasks/codex/pantry-screens/02-pantry-screen.md`）
- レビュー手順: review-codex-implementation Skill（機械チェック → 品質ゲート → 人間チェックリスト → 敵対的精査パス → 実画面確認）
- ブランチ: `feature/pantry-view-utils`（基準コミット `7782ae8`。レビュー時点では未コミットの作業ツリー）
- **判定: 受け入れ可（差し戻しなし。Must 0 / Should 0 / 申し送り 2）**

### レビュー範囲（Task 2 分）

| ファイル                                                 | 内容                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| `apps/web/src/app/pantry/page.tsx`                       | Server Component（指示書の確定コードと完全一致）            |
| `apps/web/src/app/pantry/_components/stock-row.tsx`      | 在庫行（'use client' なし・client 親から使用）              |
| `apps/web/src/app/pantry/_components/location-group.tsx` | 保存場所グループ（同上）                                    |
| `apps/web/src/app/pantry/_components/pantry-client.tsx`  | クライアント本体（'use client'・state 4 つ・ハンドラ 3 つ） |
| （+ `.test.tsx` 3 ファイル）                             | SR-01〜07 / LG-01〜03 / PC-01〜17（計 27 テスト）           |

### 機械チェック + 品質ゲート（Task 2）

- check-codex-implementation.mjs: 対象 5 ファイル → **FAIL 0 / WARN 4 / INFO 0**
  - WARN 2 件（`groups` / `parts`）は Task 1 の既知誤検出。
  - WARN 2 件（`use-client-missing`）は stock-row / location-group がイベント属性を持つが
    'use client' 無し、というもの。client 親（pantry-client）からのみ使われる合法パターン
    （`store-group.tsx` 先例と同型・指示書の指定どおり）で、目視で PASS 確定。
- run-quality-gates.sh: lint / type-check / test すべて **PASS**
- turbo キャッシュ非経由の直接 Vitest 実行で dom プロジェクト 3 ファイル 27 テスト全 green
- 禁止 API grep: `AlertDialog` / `useOptimistic` / `startTransition` / TanStack Query いずれも不使用
- D-3（最重要）: `apps/web/src/app/pantry/` 配下に `new Drizzle*` / `getDb` なし。
  `page.tsx` は `pantryRepository()`（`@/server/repositories`）経由

### チェックリスト（docs/06-ai-tools.md 全 8 項目・Task 2）

| 項目                  | 判定             | 根拠                                                                             |
| --------------------- | ---------------- | -------------------------------------------------------------------------------- |
| 識別子のタイポ        | PASS             | WARN 4 は全て誤検出。公開識別子一覧（指示書 §公開識別子）と目視で完全一致        |
| Tailwind タイポ・連結 | PASS             | 指示書の既存クラス列どおり + 実画面（MB-08）で崩れなし                           |
| ハンドラ結線漏れ      | PASS             | SR-04/05 テスト + 実画面で「使った」「捨てた」「更新」全て動作（MB-04/05/10）    |
| 'use client'          | PASS             | `pantry-client.tsx` のみ。`page.tsx` に無し（Server Component 維持）             |
| `import type` 規約    | PASS             | `PantryDto` / `StockDto` / `StorageLocation` すべて `import type`                |
| 命名の傾向ずれ        | PASS             | RPC パス `pantry.stocks[':stockId'].consume/discard` 正。state 名も指示書どおり  |
| 差し戻しの部分反映    | N/A              | 初回レビュー                                                                     |
| バリデーション分岐    | PASS（対象なし） | Zod スキーマ変更なし。consume の json 形は型付き Hono RPC + PC-05 完全一致で担保 |

### 実画面確認（manual-browser-verify・dev:pglite + Playwright・390px モバイル幅・Task 2）

在庫 3 件（全件 `storedLocation: null`・牛乳のみ期限 2026-08-01）を PGlite に投入し 2 タブで確認:

| #     | 結果   | 内容                                                                                                     |
| ----- | ------ | -------------------------------------------------------------------------------------------------------- |
| MB-01 | PASS   | 初期表示で在庫 3 件（Server Component + `pantryRepository()` 経由）                                      |
| MB-02 | PASS   | 全件消費後「在庫がありません」（クライアント遷移後・リロード後の SC 描画とも）                           |
| MB-03 | PASS   | 「保存場所未設定」の単一グループのみ（MVP1 実態）。期限「〜8/1まで」も牛乳行のみに表示                   |
| MB-04 | PASS   | 「使った」→ 対象消滅・他は残存・リロードで再出現なし（サーバー側消費を確認）                             |
| MB-05 | PASS   | 「捨てた」→ 対象消滅・リロードで再出現なし                                                               |
| MB-06 | 対象外 | `/meal-plans` からの導線は Task 3（entry-links）スコープ                                                 |
| MB-07 | 対象外 | `/shopping-lists/[id]` からの導線は Task 3 スコープ                                                      |
| MB-08 | PASS   | 新規 3 コンポーネント分: 温かいキッチントークン適用・モバイル幅で崩れなし（追記 2 箇所は Task 3 で確認） |
| MB-09 | 対象外 | 既存フロー回帰は導線追記（Task 3）後に確認                                                               |
| MB-10 | PASS   | 2 タブ: 片方で操作 → 他方が focus refetch / 手動更新ボタンの両方で最新化                                 |

ヘッダー（戻る `href="/meal-plans"` / h1「在庫」/ 更新）も実画面で確認済み。

### 敵対的精査パスで確認した点（問題なし・Task 2）

- **`page.tsx`**: 指示書の確定コードと 1 文字違わず一致（`force-dynamic` / try-catch なし含む）。
- **P-2（最重要）**: consume は残量全部 `{ amount: { value, unit } }` をそのまま送信。
  PC-05 が `toHaveBeenCalledWith` の完全一致で担保 + 実画面でサーバー側消費を確認。
- **D-5 全置換**: 応答 `PantryDto` の `stocks` で丸ごと置換（部分マージなし）。PC-16 が
  「別 stock の amount 変化も応答どおり反映」で担保。
- **D-6**: `submitting` は `submittingStockId === stock.id` の行単位。PC-10 で他行操作可を担保。
- **focus リスナー**: `useEffect` クリーンアップで `removeEventListener` 実施（PC-14 担保・
  実画面 MB-10 で focus refetch 動作確認）。deps `[]` だが `handleRefetch` は setter しか
  参照しないため stale closure の実害なし。
- **テストの強度**: モック応答の形が実 API（`PantryDto` 全体）と一致。`hasAttribute('disabled')` /
  `toHaveBeenCalledWith` 完全一致など弱いアサーションなし。

### 申し送り（修正不要・Task 2）

1. **submittingStockId の finally クリアの競合ウィンドウ**: stock A の操作中に stock B を
   操作すると `submittingStockId` が B で上書きされ、A の応答到着時の `finally` が
   `setSubmittingStockId(null)` で B の submitting 表示まで解除する（B の通信中に B の
   ボタンが一瞬再有効化され、理論上は連打ガードをすり抜けられる）。
   `shopping-list-client.tsx` の既存パターンと同一・指示書の指定どおりのため指摘ではない。
   恒久対応するなら `setSubmittingStockId((current) => (current === stockId ? null : current))`
   の関数型更新（既存画面含む横断改善候補）。
2. **silent refetch 成功時の errorMessage クリア**: focus による silent refetch が成功すると
   表示中のエラーバナーも消える（指示書は silent 時の成功挙動を明記していない）。最新化に
   成功した時点でエラーは陳腐化しているため UX 上はむしろ自然。変更不要・挙動の記録のみ。

---

## Task 3: 導線追加 — 「買い物完了」+「在庫」リンク（受け入れレビュー）

- 実施日: 2026-07-20
- 実装ルート: Codex 委譲（指示書: `docs/tasks/codex/pantry-screens/03-entry-links.md`）
- レビュー手順: review-codex-implementation Skill（機械チェック → 品質ゲート → 人間チェックリスト → 敵対的精査パス → 実画面確認）
- ブランチ: `feature/pantry-entry-links`（基準コミット `89055ea`。レビュー時点では未コミットの作業ツリー）
- **判定: 受け入れ可（差し戻しなし。Must 0 / Should 0 / 申し送り 0）**

### レビュー範囲（Task 3 分・新規ファイルなし、既存 4 ファイルへの追記のみ）

| ファイル                                                                    | 内容                                                                              |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`      | 新規 state 4 つ + `handleComplete` + 新規 JSX 3 ブロック + 手動追加ボタン条件変更 |
| `apps/web/src/app/shopping-lists/_components/shopping-list-client.test.tsx` | CB-01〜11 追加（11 件）                                                           |
| `apps/web/src/app/meal-plans/_components/meal-plan-client.tsx`              | ヘッダー右側 `gap-1` + 「在庫」リンク追加                                         |
| `apps/web/src/app/meal-plans/_components/meal-plan-client.test.tsx`         | MN-01〜02 追加（2 件）                                                            |

### 機械チェック + 品質ゲート（Task 3）

- check-codex-implementation.mjs: 対象 2 ファイル（.tsx のみ。.test.tsx は対象外） →
  **FAIL 0 / WARN 0 / INFO 0**（指摘なし）
- run-quality-gates.sh: lint / type-check / test すべて **PASS**（apps/web 313 テスト green）
- turbo キャッシュ非経由の直接 Vitest 実行でも `shopping-list-client`（33 件）/
  `meal-plan-client`（18 件）が全 green
- サーバー側 `/complete` エンドポイント（`shopping-lists.ts:82`）の実在を確認
  （`CompleteShoppingUseCase` 経由・既存実装。Task 3 はフロント配線のみ）

### チェックリスト（docs/06-ai-tools.md 全 8 項目・Task 3）

| 項目               | 判定             | 根拠                                                                                  |
| ------------------ | ---------------- | ------------------------------------------------------------------------------------- |
| 識別子のタイポ     | PASS             | WARN 0。公開識別子一覧（指示書 §公開識別子）と目視で完全一致                          |
| Tailwind クラス    | PASS             | 既存クラス列のコピー + 実画面（MB-08 相当）でスクリーンショット確認、崩れなし         |
| ハンドラ結線漏れ   | PASS             | CB-03 テスト + 実画面で「買い物完了」クリック → API 呼び出し・画面遷移まで動作確認    |
| 'use client'       | PASS（対象外）   | 両ファイルとも既存の `'use client'` のまま変更なし                                    |
| `import type` 規約 | PASS             | 新規 import 追加なし（既存 import のみで実装完結）                                    |
| 命名の傾向ずれ     | PASS             | RPC パス `client.api['shopping-lists'][':id'].complete.$post`（ブラケット記法）正しい |
| 差し戻しの部分反映 | N/A              | 初回レビュー                                                                          |
| バリデーション分岐 | PASS（対象なし） | Zod スキーマ変更なし                                                                  |

### 実画面確認（manual-browser-verify・dev:pglite + Playwright・390px モバイル幅・Task 3）

献立作成 → レシピ追加 → 買い物リスト生成 → 完了 → 在庫遷移の一連のフローを実データで確認:

| #     | 結果 | 内容                                                                                               |
| ----- | ---- | -------------------------------------------------------------------------------------------------- |
| MB-06 | PASS | `/meal-plans` ヘッダーの「在庫」リンク `href="/pantry"`                                            |
| MB-07 | PASS | `/shopping-lists/[id]` で「買い物完了」→ 成功バナー + 「在庫を見る」→ `/pantry` へ実遷移           |
| MB-08 | PASS | Task 3 の追記 2 箇所（完了バナー・ヘッダー gap-1）ともトークンのみ使用、モバイル幅で崩れなし       |
| MB-09 | PASS | 献立作成・レシピ追加・買い物リスト生成の既存フローが回帰なく動作（完了後も品目チェック UI が残存） |

Task 2 レビュー時に持ち越した MB-06/07/09 はこれで確認完了（MB-10 は Task 2 で PASS 済み）。

### 敵対的精査パスで確認した点（問題なし・Task 3）

- **diff スコープ**: `git diff --stat` で変更 4 ファイルのみ。`.tsx` 2 ファイルの差分は
  指示書が許可した範囲（新規 state・`handleComplete`・新規 JSX 3 ブロック・手動追加ボタンへの
  `status === 'active'` AND 条件・ヘッダー `gap-1`）に限定されることを diff 全文目視で確認。
  既存ロジック（`handleMarkAsBought` / `handleReassignStore` / `handleAddItem` 等）は無変更。
- **既存テストの無改変**: `shopping-list-client.test.tsx` は LC-01〜22（22 件）+ CB-01〜11
  （11 件）＝ 33 件、`meal-plan-client.test.tsx` は既存 16 件（MC 5 件 + WC-M 11 件）+ MN-01〜02
  （2 件）＝ 18 件で実行結果と一致。**MC-03 の欠番は Task 3 以前から存在**（`git show HEAD`
  で事前確認済み。今回の差分による削除ではない）。
- **CB-05（P-5・自動遷移しないこと）の実効性**: `shopping-list-client.tsx` は元々 `useRouter`
  を import していない（router 遷移の経路自体が無い）ため、テストが追加した
  `vi.mock('next/navigation')` は現状は発火し得ないが、**将来 `handleComplete` に
  `router.push`/`refresh` が追加された場合の回帰検知として機能する**正当な防御的テスト
  （指示書が明示的に要求する CB-05 の意図どおり）。
- **P-4（確認ダイアログなし）**: CB-08 で `queryByRole('dialog')` が null であることを担保 +
  実画面でクリック直後に即座に API 呼び出しが発火することを確認。
- **CB-11（回帰・R-5）**: 完了後も pending item のチェックボックス・店舗再割当ボタンが
  残ることをテスト + 実画面スクリーンショットの両方で確認。「手動で追加」のみが非表示。
- **エラー分離**: 新規 `completeErrorMessage` と既存 `errorMessage` が独立した state・JSX
  であることを diff で確認（指示書の「混同しない」要求どおり。既存エラー系ハンドラの
  分岐・文言には触れていない）。

実画面確認に使った一時スクリプト・PGlite 状態は確認後に削除・破棄済み（リポジトリへの影響なし）。
