# Sprint 10 レビュー（2026-08-17）

> 集計は `bash .claude/scripts/sprint-summary.sh --since 2026-08-12 --until 2026-08-17`。
> Sprint 10 は 2026-08-13 キックオフ（`logs/2026-08-13.md` セッション 5）〜 2026-08-17 クローズ。
> `logs/2026-08-12.md` は Sprint 8 完了後のハーネス作業（IMP-2026-032 の評価）で Sprint 10 の
> 範囲外のため、本書では「スプリント外の並行作業」としてのみ扱う。
>
> **Sprint 6〜9 のレビュー文書は未作成**（`docs/sprints/` は sprint3 / sprint5 のみ）。
> 本書は Sprint 10 分だけを扱い、遡及作成はしない。レトロの改善点に記録する。

## 期間と Sprint

- 対象期間: 2026-08-13（キックオフ）〜 2026-08-17（クローズ）。roadmap 枠 1.5 週間に対し実績 5 日
- Sprint 10 ゴール（roadmap）: **献立の変更が買い物リストへ正しく追随し、集約横断の書き込みが
  部分失敗しない**
- 結果: **完了条件 3 件すべて達成してクローズ**（`docs/05-roadmap.md`「Sprint 10 クローズ」節）。
  独立 Reviewer の最終監査は BLOCK 0 / 未検証の高影響項目 0
- 位置づけ: **MVP2 の最終スプリント**。MVP2 スケジュール表の 4 本のうち Sprint 7 / 9 / 10 が
  クローズ済み表記、Sprint 8 は完了条件 3 件が `[x]` になったがクローズ節が未作成（後述の
  roadmap 更新提案 1）

| 完了条件                                     | 達成日     | 証拠                                                                      |
| -------------------------------------------- | ---------- | ------------------------------------------------------------------------- |
| 献立からレシピを外すと買い物リストが追随する | 2026-08-13 | PR #162。削除追随・数量上書き・`bought` / `manually_added` 保護を自動試験 |
| 集約横断の書き込みが部分失敗しない           | 2026-08-16 | 本番 `DB_WRITE_TRANSACTION=on` で書き込み確認（ADR-0020 / PR #173・#174） |
| 期限が近い在庫にアプリを開かずに気づける     | 2026-08-15 | iPhone PWA + 本番 Cron 手動実行で `sentCount: 1`（`logs/2026-08-15.md`）  |

## 完了したこと

- **Unit A: meal-plan-sync**（L3・Orchestrator 経路。08-13・PR #162 マージ）
  - Gate A 3 問をユーザー確定 — 削除は `from_meal_plan` × `pending` のみ / `pending` の数量は
    新集計値で上書き（`bought` は不変）/ 明示トリガ維持 / Pantry 巻き戻しはしない
  - 成果物: `docs/requirements/meal-plan-sync.md` / `docs/designs/meal-plan-sync.md` /
    `ADR-0018` / `docs/implementation-plans/meal-plan-sync.md` / `docs/tests/meal-plan-sync.md`
  - 実装: `ShoppingItem.updateRequiredAmount` / `ShoppingList.updateItemRequiredAmount`、
    `SyncShoppingListFromMealPlanUseCase` を追加・更新・削除の 3 系統へ拡張、
    Presentation の `diffSyncResult` / `describeSyncResult`。API 契約と DB は変更なし
  - レビュー: 初回 BLOCK 2 件を同コミットで処置。security-reviewer は差分起因 BLOCK なし
- **Unit B: uow**（L3・Orchestrator 経路。08-13〜08-16・PR #164 → #168 → #171 → #173 → #174）
  - 08-13 PR #164: `neon-serverless` の WebSocket `Pool` + `UnitOfWork` を導入
  - 08-13 PR #168: **本番が読み取りごと落ちて差し戻し**（`/api/health` が `db:"error"`・約 16 秒）。
    ADR-0019 のロールバック手順を実行し `useTransaction: false` へ
  - 08-15 PR #171: 案 S（読み取りは neon-http、書き込み経路だけ WebSocket）を再導入
  - 08-16 PR #173: 障害 1 =`globalThis` Pool の使い回し。`createTxConnection`（1 リクエスト
    1 `Client`・`finally` で `close()`）へ変更し、[ADR-0020](../decisions/ADR-0020-tx-connection-per-request.md)
    で ADR-0019 の「warm Pool 再利用」を破棄。UoW テスト 14 → 17 件
  - 08-16 PR #174: 障害 2 =`ws` の `bufferutil` が空モジュールにエイリアスされ 48 バイト超の
    フレームで `mask` が壊れる。`next.config.ts` の `env: { WS_NO_BUFFER_UTIL: '1' }` で
    ビルド時にガードを畳んで解消（`serverExternalPackages` は無効と実測）
  - 08-16 決着: 本番 `DB_WRITE_TRANSACTION=on` で書き込み成功。読み取り経路への影響なし
    （health 0.23s / 読み取り 0.2〜0.45s）
  - 08-17 PR #175: 最終独立レビュー（BLOCK 0 / 未検証の高影響 0）、正典 6 文書を実装後の
    構成へ更新、R3 レビューパケット再生成
- **サイド: mapper-jst**（L1・メイン直接。08-13・PR #166）
  - `toPlannedRecipeDto` の `scheduledDate` を `toISOString().slice(0,10)` から
    `toLocalDateString` へ。JST で前日ずれが再現することをキックオフ時に実測で確認済み
- **サイド: small-ux**（L2・Orchestrator。08-13・PR #167）
  - 商品フォームの離脱確認（`useLeaveConfirmation` 結線）+ レシピ手順の dnd-kit 並べ替え。
    web 894 tests・レビュー BLOCK 0
- **サイド: expiry-alert 実機**（L0・ユーザー実機 + 本番。08-15）
  - 本番に VAPID 3 点 + `CRON_SECRET` を設定 → 500 の原因を Vercel Logs で
    `Vapid subject is not a valid URL.` と特定 → `mailto:` 付与で解決 → iPhone PWA で受信。
    **Sprint 8 の完了条件 3 件目もここで達成**
- **判断でクローズしたもの**
  - タスク 6（`ConsumeStock` 冪等性キー）: バックログへ戻す（完了条件外・オフラインキューを
    `consume` へ広げる先行条件）
  - タスク 7（フォント追加削減）: 3 ウェイト・第一水準サブセット 1.89MB の現状維持で判断完了
- **規模**: Sprint 9 クローズ（`7334ce2`）から main まで **非マージコミット 17 件 /
  133 files changed / +8,278 -967**

## 所要時間合計

| 日付       | 記録                                        | 備考                               |
| ---------- | ------------------------------------------- | ---------------------------------- |
| 2026-08-13 | **記録なし × 5**（セッション 5〜9）         | すべて Cloud Agent セッション      |
| 2026-08-15 | **約 1 時間 5 分**（セッション 1）          | セッション 2（uow 案 S）は記録なし |
| 2026-08-16 | **記録なし**（参考: 会話ログ帯で約 4 時間） | 本番障害対応のため計測せず         |
| 2026-08-17 | **約 16 分**                                | 自動推定・活動時間ベース           |

- **合計（記録あり 2 件）: 約 1 時間 21 分**（1:05 + 0:16）
- **「記録なし」7 セッション**（08-13 の 5 件 / 08-15 セッション 2 / 08-16）。
  参考値まで含めると実働はおおよそ 5〜6 時間規模で、記録側が実態を大きく取りこぼしている
- 08-13 セッション 1〜4（約 2 時間 50 分）は Sprint 9 の作業のため本集計に含めない

## メトリクスサマリ

- **期間内の `TASK-*.yml` は不在**（最新は TASK-2026-009・2026-08-11・review-readiness）。
  Sprint 10 の Unit A / Unit B は本レビューと同時に TASK-2026-010 / TASK-2026-011 として
  遡及記録する。Sprint 5 レビューと**同じ「L2/L3 の計測経路が弱い」指摘が再発**している
- reviewer 指摘（Unit B・`docs/reviews/uow.md`）:
  - Task 1（08-13）: 初回 open BLOCK 1 件（`pool.on('error')` 未登録）→ 後続コミットで resolved。
    FOLLOW_UP 残 2 件（本番レイテンシ未計測 / BEGIN 失敗時の接続未返却はドライバ既知挙動）
  - Task 2（08-17）: BLOCK 0 / 未検証の高影響 0。FOLLOW_UP は R-08（U-2）・R-09（U-3 / U-4 +
    WebSocket 実行時テスト）を carryover として明示
- reviewer 指摘（Unit A・`docs/reviews/meal-plan-sync.md`）: 初回 BLOCK 2 件を同コミットで処置。
  security BLOCK なし
- reviewer 指摘（small-ux・`docs/reviews/small-ux.md`）: 検証済み指摘なし（BLOCK 0）
- **本番障害 3 回**（PR #164 起因の読み取り全断 / `globalThis` Pool / `ws` bufferutil）。
  いずれも自動試験（PGlite）では検出できない接続方式・バンドル起因

## 継続課題（未完了の持ち越し・重複排除済み）

1. **U-2: 書き込みレイテンシの定量計測**（`DB_WRITE_TRANSACTION` ON/OFF 差分。見積もり 10〜30ms
   の裏取り）— 08-16・08-17 / `docs/reviews/uow.md` R-08
2. **U-3 / U-4: 本番 `DATABASE_URL` の pooled 判定と transaction pooling の制約確認** — 08-16・08-17 / R-09
3. **WebSocket 書き込み経路の実行時自動テスト**（現状 PGlite のみ。依存更新時は Preview で
   `DB_WRITE_TRANSACTION=on` の手動一巡が必要）— 08-17 / R-09
4. **`createTxConnection` に成功ログを 1 行入れる**（WS 経路が実際に走ったかをログで一意に判定）— 08-16
5. **タスク 6: `ConsumeStock` の冪等性キー**（L2〜L3。オフラインキューを `consume` へ広げる先行条件）— 08-16・08-17
6. **`shopping-list-client.offline-queue.test.tsx` のフレーキー修正**（クリーン HEAD でも 5 回中
   3 回落ちる）— 08-16
7. **改善候補の昇格判断**: `candidates/offline-write-queue.md` / `expiry-alert.md` /
   `meal-plan-sync.md`（+ 本レビューで起票する `uow.md`）— 08-13・08-15
8. **`pnpm.overrides` の範囲見直し** — 08-12 から連続持ち越し
9. **`docs/tests/recipe-form-usability.md` の回帰表更新**（FOLLOW_UP F-01。歴史的記述のまま）— 08-13・08-16
10. **Background Sync の iOS 非対応の裏取り**（案 C 採用の根拠だが一次情報未確認。この環境から
    egress 403。覆っても案 C は無駄にならない）— 08-13
11. **expiry-alert 試験計画 MB の残り 13 件**（Android 対照・通知本文形式・O-01 回帰）—
    **追わないと決定済み**（`docs/tests/expiry-alert.md` §10-5）。再開する場合のみ課題

## AI ツール活用ハイライト

- **うまく機能した**: 08-16 の本番障害 2 件を、**ビルド成果物（`chunks/219.js`）と
  `node_modules` の実体（`ws/lib/buffer-util.js` / `@neondatabase/serverless`）を直接読んで**
  特定できた。公式ドキュメントへの egress が 403 で塞がれた環境でも、一次情報に当たる方法が
  機能した好例（Claude Code）
- **うまく機能した**: Sprint 10 キックオフ（Cursor Cloud Agent）が「neon-http は
  `db.transaction()` を持たない」を実測し、**Unit B を「transaction() を足すだけ」と
  設計する事故を着手前に防いだ**
- **うまく機能した**: 08-15 の VAPID 500 切り分け（Cursor Grok）。コード変更ゼロで
  Vercel Logs から `mailto:` 不足を特定
- **失敗と回復**: 08-15 に Claude Code が**口頭報告を鵜呑みにして試験判定を誤記録**し、
  main の実施ログと突き合わせて訂正。証跡の一次情報は口頭ではなくログ側にある
- **委譲の穴**: small-ux（PR #167）は独立 Reviewer Subagent を起動せず Orchestrator が
  レビュー記録を書いた。L2 の R2 tier としては許容範囲だが、レビューの独立性は落ちている

## レトロ

### うまくいったこと

- **完了条件 3 件を全達成して MVP2 の最終スプリントを締めた。** 献立同期・トランザクション境界・
  実機 Push という毛色の違う 3 本を、5 日で完了条件との対応で切って回収できた
- **本番障害 3 回から毎回「なぜ自動試験で出ないか」を構造で説明し、ADR に残した。**
  ADR-0019 →ADR-0020 の置換（warm Pool 再利用の破棄）は、失敗した設計判断を上書きではなく
  明示的に破棄した形で追跡できている
- **差し戻し（PR #168）の判断が速かった。** 本番読み取り全断を検知してから、既に用意していた
  ADR-0019 のロールバック手順で戻した。設計時にロールバック手順を書いておく効果が出た
- **キックオフで前提崩しを実測した**（neon-http にトランザクションが無い / 本番 VAPID が 500）。
  着手前の 2 件の実測が、後続 2 ユニットの設計を現実に固定した

### 改善点

- **本番接続方式の検証が設計に組み込まれていなかった。** Unit B のレビュー H-01 は
  「Preview で書き込みを一巡させてから本番へ」を推奨していたが reject され、**PGlite の
  自動試験だけで本番へ出て読み取りごと落ちた**。外部インフラ（ドライバ・接続方式・バンドル）に
  触る変更は、自動試験の外に検証段を持つ必要がある — 本 Sprint 最大の学び
- **メトリクス記録が 2 スプリント連続で欠落。** Sprint 5 レビューで「L2 の計測経路が弱い」と
  書いた指摘が、Sprint 10 では L3 2 本ですら記録なしという形で悪化している
- **所要時間の記録なしが 7 セッション。** Cloud Agent セッションで close-session を通さない
  運用が定着してしまっている（Sprint 3・Sprint 5 と同じ指摘の 3 回目）
- **スプリントレビューが Sprint 6〜9 の 4 本連続で飛んだ。** Sprint 5 レビューの継続課題 6
  「週次レビューの Routine 化」が未実施のまま。習慣ではなく仕組みで担保する必要がある
- **1 日（08-13）に 5 セッション・4 PR が集中した。** ログは追えているが、同日複数セッションだと
  ブリーフィングスクリプトが先頭セッションの申し送りしか拾わない問題も再現している

## 次スプリント候補（採否はユーザー判断）

MVP2 の 4 スプリントは本 Sprint で終了。roadmap に Sprint 11 の定義は無く、次は
**Phase 3 候補と実運用の穴のどちらを先に取るかの選択**になる。

| 優先 | 候補                                                                                                                                          | 根拠                                                                    |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 高   | **U-2 / U-3 / U-4 の決着**（書き込みレイテンシ実測・pooled 判定・transaction pooling 制約）                                                   | 継続課題 1・2 / `docs/reviews/uow.md` R-08・R-09                        |
| 高   | **WebSocket 書き込み経路の実行時自動テスト**（+ `createTxConnection` の成功ログ 1 行）                                                        | 継続課題 3・4 / 本 Sprint の本番障害 3 回の再発防止に直結               |
| 高   | **タスク 6: `ConsumeStock` の冪等性キー**（L2〜L3）                                                                                           | roadmap Sprint 10 タスク 6 / 継続課題 5。オフラインキュー拡張の先行条件 |
| 中   | **`offline-queue` テストのフレーキー修正**                                                                                                    | 継続課題 6。CI の信頼性を落とす既知の不安定要因                         |
| 中   | **計測・レビュー習慣の仕組み化**（TASK-\*.yml の記録忘れ / 週次レビュー Routine 化）                                                          | レトロ改善点 2〜4 / Sprint 5 レビュー継続課題 6 の未実施分              |
| 中   | **2 人での実運用サイクル 1 周の観察**（MVP2 で入れた機能が土曜運用で実際に噛み合うかの確認）                                                  | MVP2 のゴール「実運用の穴を塞ぐ」の答え合わせ。新規実装を伴わない       |
| 低   | **Phase 3 候補への着手判断**（月次の食費分析 / 食材ロス分析 — 価格記録・消費履歴の蓄積が前提）                                                | roadmap「MVP2 に含めないもの（Phase 3 候補）」                          |
| 低   | 積み残しの雑務（`pnpm.overrides` の範囲見直し / recipe-form-usability 回帰表 F-01 / Background Sync の iOS 裏取り / 改善候補 4 件の昇格判断） | 継続課題 7〜10                                                          |

> 未決定の IMP は無い（`improvement-backlog.md` は IMP-2026-001〜032 がすべて accepted /
> rejected 済み）。改善サイクルの入力は現在 candidates 側にのみ滞留している。

## roadmap 更新の提案（未適用・ユーザー確認待ち）

1. **MVP2 スケジュール表の Sprint 8 行**に完了マークが無い。完了条件 3 件はすべて `[x]` で、
   3 件目は 2026-08-15 に達成済み（Sprint 10 タスク 5 として消化）。Sprint 7 / 9 / 10 と同じ
   「✅ **クローズ済み**（2026-08-15）」表記と、Sprint 7 / 9 / 10 に倣ったクローズ節の追加を提案する。
   ただし「Sprint 8 のクローズを何日付にするか」は判断が要るため、勝手には書き換えない
2. **MVP2 全体の締め節が無い。** 4 スプリントすべてがクローズ済みになったので、
   「MVP2 クローズ」節（各スプリントの完了条件の一覧と、Phase 3 への申し送り）を
   置く場所として `docs/05-roadmap.md` が適切かどうかを含めて確認したい
