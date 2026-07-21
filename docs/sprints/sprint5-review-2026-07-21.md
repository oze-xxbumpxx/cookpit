# Sprint 5 レビュー（2026-07-21）

> 集計は `sprint-summary.sh`（既定・直近 7 日 = 2026-07-15 〜 2026-07-21）。
> Sprint 5 は 7/14 キックオフのため、7/14 のユニット分割確定は 7/15 ログに継続分として含む。

## 期間と Sprint

- 対象期間: 2026-07-14（キックオフ）〜 2026-07-21（Sprint 5 は 1.5 週間枠）
- Sprint 5 ゴール（roadmap）: 買い物完了後、自動で在庫が増える。手動で消費を記録できる。
- 結果: **ゴール達成・Pantry 在庫管理が機能的に完成**。Unit A/B/C すべて完了し、roadmap の
  完了条件 3 項目（買い物完了で在庫自動追加 / 消費記録 / 次の献立作成で在庫考慮）を充足。
  これで MVP1 の最後の機能ドメインが揃った（残るは Sprint 6 = 仕上げ・運用開始）。

## 完了したこと

- **Unit A: pantry-core**（L3・Codex 委譲。7/14〜7/19・PR #80 マージ）
  - 上流フェーズ 2 の中断復旧 → 実装計画（約 1,620 行・IMP-1〜8）+ 試験計画（747 行・約 143 観点）
    完成 → 統合クロスチェック差し戻しゼロ → Codex 指示書パック 5 通作成（7/15・PR #63）
  - Codex 5 層実装マージ: Domain（PR #66）/ Infrastructure（PR #67）/ Application（PR #68）/
    api-contract（PR #69）/ Presentation API（PR #80）
  - 受け入れレビュー: Task 5 = Must 0 / Should 1、Task 2/3 遡及 = Must 0 / Should 0
    （Nice 1・指示書不整合 1 を実装が正しく解消。7/19・`docs/reviews/pantry-core.md`）
  - `pantryRepository()` を `server/repositories.ts` の共有ファクトリへ集約（Should 1 対応）
- **Unit B: pantry-screens**（L2・Codex 委譲。7/19〜7/20・PR #82/#83/#84 マージ）
  - 設計 P-1〜P-6 確定 → 実装計画（IMP-2026-025 Phase 1 軽量モード）+ 試験計画（48 観点 + 実画面 10 件）
  - 在庫一覧画面（保存場所別）+「使った」「捨てた」ボタン + 買い物リストからの買い物完了導線
  - レビュー + 実画面確認済み（`docs/pantry` screen review record）
- **Unit C: 在庫引き算連携**（L2・Orchestrator メイン直接指揮 + implementer。7/20・PR #89 マージ 7/21）
  - `GenerateShoppingListUseCase` に `PantryRepository` を注入し、差し引き・生成時消費を実装
  - 切り上げルール P-1（数えられる単位のみ切り上げ・連続量は小数）/ productId 一致マッチング P-2 /
    生成時に Pantry を実減算 P-3 をユーザー確定
  - `isCountableUnit()` 追加（+ テスト 17 件）・application 在庫引き算 9 シナリオ追加
- **スプリント期間中の運用・ハーネス改善**（スプリント外・並行）
  - Obsidian Vault 化 + notes/ 新設（7/16・PR #64/#65）
  - IMP-2026-025/026 承認適用（Codex 上流二重生成の解消 + レビュー網羅の機械担保。7/18・PR #74/#78/#79）
  - CI format check ジョブ追加（7/18・PR #76）/ Devin PR 4 本マージ（#70〜73）/ セキュリティヘッダ
  - ハーネス複雑度診断 → IMP-2026-027/028/029 採用・全適用（成熟しすぎた構成の簡素化。7/20・PR #85）
  - CI Dependency Audit 復旧（推移依存 `brace-expansion` の ReDoS advisory を override で解消。
    7/21・PR #90/#91 + #89 へ波及）

## 所要時間合計

- 7/15: 記録なし（7/14 夜〜7/15 早朝・断続） / 7/16: 約 2 時間（1.5h + 追記 0.5h） /
  7/18: 約 4 時間 18 分 / 7/19: 約 33 分 / 7/20: 約 5 時間 15 分 / 7/21: 約 1 時間 53 分
- **合計（記録あり 5 件）: 約 13 時間 59 分**（2:00 + 4:18 + 0:33 + 5:15 + 1:53）
- **「記録なし」1 件**（7/15。複数セッション跨ぎの深夜作業 — レトロ改善点参照）

## メトリクスサマリ

- TASK-2026-005（pantry-core・L3・2026-07-17）: agent_calls 5・retries unknown・
  reviewer critical/major/minor 0・user_corrections 0・implementation_rework 0・unresolved 0
- **Unit B（pantry-screens）/ Unit C（在庫引き算）の TASK-\*.yml は本集計に不在**
  （L2・Codex/Orchestrator ルートの計測経路が揃っていない — レトロ改善点参照）
- reviewer 指摘（Pantry 全体）: Unit A Task 5 = Should 1 / Task 2 = Nice 1 / Task 3 = 特記 1・
  いずれも Must 0。手戻り・差し戻しゼロ
- 期間内コミット 105・283 files changed / +19,913 -4,779（ハーネス改善・Obsidian 化を含む大きめの差分）

## 継続課題（未完了の持ち越し・重複排除済み）

1. **027/028 ハーネス改善の実地確認**（次の L2/L3 を正規ルート＝メイン直接指揮のみで完走・
   default export 例外の判断劣化チェック。App Router 特殊ファイルを含むタスクで 027 確認）（7/20・7/21）
2. harness-complexity candidate 事象 4・5 の採否判断（1〜2 タスク様子見後）（7/20）
3. CI の DATABASE_URL（Neon ブランチ DB）設定（7/15〜16 持ち越し・E2E smoke の実 DB 書き込み）
4. meal-plan-core Task 01 の遡及受け入れレビュー（7/15〜16 持ち越し）
5. CLAUDE.md への notes/ 導線 3 行の手動適用 / ローカル Obsidian での動作確認（7/16）
6. 週次スプリントレビューの Routine 化・再試行（7/21）
7. IMP-2026-025 効果実測の継続（Codex 委譲タスクで 3 点合計行数・実装計画÷ブリーフ比。
   pantry-screens で初期値記録済み・次タスクで比較）（7/18・7/19）
8. （任意）#88 / #87 Dependabot の branch 更新（7/21）

## AI ツール活用ハイライト

- **うまく機能した委譲**: Codex への pantry-core 5 層 + pantry-screens が受け入れ可・差し戻しゼロ。
  既知ミス型への先回り（4 段保存順序・PGlite DDL・クランプ vs throw の責務分離ほか）が奏功
- **回帰評価の実効性**: agent-evaluator（sonnet）×4 が IMP-027/028 の v1 を 2 件とも「悪化あり」で
  却下 → v2 改訂で悪化ゼロ・採用。**悪化検知が設計判断のゲートとして機能**した好例
- **Orchestrator 直接指揮**（Unit C）: IMP-028 で正規ルート化した「メイン直接指揮 + implementer」で
  在庫引き算連携を完走。多段委譲を避けた軽量経路が L2 に馴染む
- **失敗と回復**: (a) pantry-core フェーズ 2 で中断 7 回 → 状態ファイル冪等再開で完走。
  (b) 保護ファイル承認のリモートデッドロック（累計 4 回）→ IMP-2026-029（allow 登録）で解消。
  (c) 推移依存 advisory による CI 突然赤化 → override で復旧し #89 へ cherry-pick 波及

## レトロ

### うまくいったこと

- Sprint 5 全 3 完了条件を達成し、**Pantry 在庫管理が機能的に完成**。MVP1 の機能ドメインが出揃った
- ハーネスの「成熟したが複雑化しすぎ」問題に正面から対処（複雑度診断 → IMP-027/028/029 で
  衛星要約の削減・経路の実態正典化・承認デッドロック解消）。回帰評価で悪化ゼロを担保して適用
- Codex 委譲の受け入れレビューが 3 本連続で差し戻しゼロ。指示書の先回り精度が安定してきた
- CI の推移依存 advisory を最小差分（既存 override 書式踏襲）で復旧し、機能 PR #89 まで非破壊で波及

### 改善点

- **Sprint 4 のレビュー文書が未作成**（`sprint4-review` が無い）。スプリント締めの習慣が Sprint 3 の
  初運用以降飛んでいる → 週次レビューの Routine 化（継続課題 6）で恒常化したい
- 所要時間「記録なし」1 件（7/15）。複数セッション跨ぎ・深夜作業の記録経路が依然弱い（Sprint 3 と同じ指摘）
- **L2 タスクの計測経路が弱い**: Unit B（Codex）/ Unit C（Orchestrator）の TASK-\*.yml が揃わず、
  IMP-2026-025 の効果実測（実装計画÷ブリーフ比等）が定量で締められていない
- スプリント期間の実働の過半がハーネス改善・運用タスク（7/16・18・20・21）に寄った。
  改善サイクルの投資は意図的だが、機能開発（7/15・17・19・20）とのバランスは記録しておく

## 次スプリント候補（採否はユーザー判断）

| 優先 | 候補                                                                                         | 根拠                                             |
| ---- | -------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 高   | Sprint 6: 全体結合テスト（土曜運用の通し: 献立 → 買い物リスト → 買い物 → 在庫追加 → 平日消費） | roadmap Sprint 6 タスク 1 / 完了条件「2 人で 1 週間運用完走」 |
| 高   | Sprint 6: UX 調整・表示崩れ修正・レスポンシブ最終確認                                         | roadmap Sprint 6 タスク 2                        |
| 中   | Sprint 6: PWA 調整（アイコン・スプラッシュ・manifest・iOS/Android）+ MB-10〜12 オフライン実確認 | roadmap Sprint 6 タスク 3 / Sprint 4 持ち越し    |
| 中   | Sprint 6: 簡易ダッシュボード（今週の状態サマリ・賞味期限が近い在庫リスト表示）                | roadmap Sprint 6 タスク 4                        |
| 中   | 027/028 ハーネス改善の実地確認（Sprint 6 の L2/L3 タスクで正規ルート完走を兼ねる）            | 継続課題 1 / IMP-2026-027・028                   |
| 中   | CI DATABASE_URL（Neon ブランチ DB）設定                                                       | 継続課題 3                                       |
| 低   | meal-plan-core Task 01 遡及レビュー / notes/ 導線・Obsidian 確認 / 週次レビュー Routine 化 / #87・#88 | 継続課題 4〜8                                     |
