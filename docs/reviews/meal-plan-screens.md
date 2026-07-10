# レビュー記録: meal-plan-screens（Sprint 3 Unit B / L2）

- 実施日: 2026-07-09
- 実装ルート: Orchestrator 経路（implementer/Sonnet → reviewer/Opus。IMP-2026-014 の采配どおり）
- 対象コミット: `17719fa`（実装本体）+ レビュー反映（本記録と同コミット）

## reviewer（Opus）判定

**総合判定: 受け入れ可（Must 0 / Should 1 / Nice 3）**

- 逸脱 1 件（`meal-plan-view.test.ts` → `.node.test.ts`）: **妥当**。素の `*.test.ts` は
  apps/web の vitest projects（node/dom）のどちらの include にも一致せず**無言でスキップ**
  されるため、実装計画のファイル名ではテストが実行されなかった。
- ドキュメント更新対象 3 点（roadmap / 設計書ステータス / domain-model 対象外判断): 漏れなし
  （IMP-2026-010 の完了条件・報告義務が機能）。
- 仕様値の固定: limit clamp 全域・デフォルト 1×・週表示形式・二重送信ガードは強い。

### 指摘と対応

| #        | 区分   | 内容                                                                          | 対応                                                                                                  |
| -------- | ------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Should-1 | テスト | 倍量プリセット集合 `[1, 1.5, 2, 3]` が未固定（弱いアサーション既知パターン）  | **対応済み**: WC-K-08 を追加（4 プリセットの過不足なし描画を固定）。試験計画にも追記。web 82 件 green |
| Nice-1   | テスト | meal-plan-client 経由の非デフォルト倍量 pass-through 未固定                   | 記録のみ（WC-K-04 で部分担保）                                                                        |
| Nice-2   | テスト | 追加後の「倍量維持」が未 assert                                               | 記録のみ                                                                                              |
| Nice-3   | 記録   | Server Component 2 本は自動テストなし（試験計画が明示的に容認・MB-05 で担保） | 記録のみ                                                                                              |

## security-reviewer: 省略（IMP-2026-016 の省略条件に該当）

省略理由: Presentation 層のみの L2・依存パッケージ追加なし・秘密情報/外部 I/O/認証認可に
触れない（orchestration-policy §security-reviewer「省略してよい（L2 限定）」の 3 条件をすべて充足。
frontend-screen-addition 相当のドライラン判定表どおり）。

## 実画面確認（manual-browser-verify・MB-01〜08 全 PASS）

リモート環境の PGlite 経路（`pnpm --filter @cookpit/web dev:pglite`）+ Playwright（同梱 Chromium）で実施。

| #     | 結果 | 根拠                                                                                                                                                     |
| ----- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MB-01 | PASS | 未作成週で空状態 + 「今週の献立をはじめる」表示                                                                                                          |
| MB-02 | PASS | UI 作成後、同一週へ同時二重 POST [201,201] でも plan 不変・当該週 1 件（冪等 C-3）                                                                       |
| MB-03 | PASS | 検索→選択→2×→追加、同一レシピ 2 回目（デフォルト 1×）で 2 行（B-10）。倍量 [1,2]                                                                         |
| MB-04 | PASS | 削除で 2→1 件・確認ダイアログ 0 件（D-3）                                                                                                                |
| MB-05 | PASS | 週カード・「今週」ラベル表示。「さらに表示」は `?limit=1` で href `limit=5` を確認（`min(limit+4,12)` 機構。データ 1 週のため 4→8 遷移は機構確認で代替） |
| MB-06 | PASS | recipes→献立 / 献立→履歴 / 履歴→戻り / products の献立リンク全通過                                                                                       |
| MB-07 | PASS | 直接色クラス（zinc/slate/gray/neutral/stone）混入 0 件・390px 幅で横はみ出し 0px                                                                         |
| MB-08 | PASS | レシピ DELETE(204) 後、/meal-plans と history の両方で「削除済みレシピ」表示（C-4）                                                                      |

スクリーンショット: セッション記録に添付（mb03-two-rows / mb05-history / mb07-mobile / mb08-deleted）。

## 補足

- 品質ゲート: lint / type-check / test 全 green（web 82 件・全パッケージ）。
- スコープ外の気づき（reviewer Nice 参考）: `GetMealPlanHistoryUseCase` の `limit` に
  UseCase 側の上限 cap がない（UI 側 clamp で担保・Unit A の責務）。
