# 業務改善分析 — 業務マップと自動化候補（2026-07-04）

Cookpit 開発業務全体（アプリ機能開発・ハーネス運用・メタ作業）を対象に、時間削減の
ボトルネックを分析し、改善候補と優先順位を整理した記録。根拠は `logs/`（2026-05-09〜07-03）、
`docs/claude-code/improvements/`、`docs/05-roadmap.md`。

対で作成した資産: kickoff-session / close-session / create-codex-brief Skill、
`estimate-session-time.mjs` / `session-briefing.sh` / `record-activity.mjs`、
[codex-delegation-playbook.md](./codex-delegation-playbook.md)。

## STEP 1: 業務マップ

### 頻度別の業務一覧

| 頻度 | 業務 | 入力 | 処理 | 出力 | 使うツール | 詰まりやすい点 |
| --- | --- | --- | --- | --- | --- | --- |
| 日次（セッション毎） | 文脈復元・段取り | logs/ 最新・roadmap・backlog | 前回の続き把握、今日のタスク決め | 今日のタスク | 手作業 + Claude | 手作業で毎回同じ読み込み。抜けると持ち越しが落ちる |
| 日次 | 機能開発（L0〜L3） | asks/・roadmap | 設計→計画→実装→試験→レビュー | コード + docs 成果物 + PR | orchestrator + Subagent 群 / Codex | L2/L3 は Agent 待ち時間が長い。Codex 分担はリモートで不可 |
| 日次（終了時） | 日次ログ | セッションの記憶 | write-work-log | logs/YYYY-MM-DD.md | write-work-log Skill | 所要時間が「記録なし」常態化。ログ・メトリクス・振り返りが別々の手作業 |
| タスク毎（L2/L3） | メトリクス記録 | subagent-log・docs | record-task-metrics.sh + 手動記入 | metrics/*.yml | スクリプト | リモートでは subagent-log が残らず自動補完が効かない |
| タスク毎（L2/L3） | 振り返り | 会話・成果物 | reflect-task | candidates/*.md | reflection-agent | 実施忘れ（発動が人依存） |
| 週次（不定期） | 改善サイクル | candidates・eval | manager → evaluator → 人間承認 | IMP 提案・適用 | 改善フライホイール | 半自動化済み。承認待ちが滞留点（IMP-2026-007 未決定） |
| 週次（日曜） | スプリントレビュー・レトロ | logs/・roadmap | 振り返り・次スプリント計画 | roadmap 更新 | 手作業 | logs からの集計が手作業 |
| 単発 | ハーネス整備（eval 再採点・棚卸し） | evals/・.claude/ | agent-evaluator / audit-skills | ベースライン・整理コミット | Subagent | 実施タイミングの判断が人依存 |
| 単発 | 実機確認 | dev サーバー | ブラウザ手動テスト | PASS/FAIL 報告 | manual-browser-verify | リモートは DATABASE_URL 無しで BLOCKED 常態化 |

### 人間がやるべき判断 vs AI に任せられる作業

| 人間の判断（維持する） | AI に任せる（自動化対象） |
| --- | --- |
| アーキテクチャ・ドメイン・DB スキーマの設計判断 | 文脈復元・ブリーフィング・当日ログ雛形 |
| 構成ファイル変更の承認（改善サイクルの承認境界） | 所要時間の計測・メトリクスの機械的収集 |
| トレードオフ選択・スコープ判断・PR マージ | 設計確定後の実装（implementer / Codex） |
| 課金・鍵・外部サービスの操作 | 指示書生成・レビューチェックリスト適用・ログ/振り返りの起票 |

## STEP 2: 自動化/効率化の候補（16 案）

評価軸: 難易度=低/中/高、優先度=A(即)/B(次)/C(様子見)。

| # | 改善案 | 解決する課題 | 期待効果 | 作るもの | 難易度 | 所要時間 | リスク | 優先度 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | close-session Skill（終了メタ作業の一括化） | ログ・メトリクス・振り返り・コミットが別々の手作業で漏れる | 終了処理が 1 依頼に。毎回 10〜20 分 → 数分 | Skill | 低 | 1h | 低（既存 Skill のラッパー） | **A（実装済）** |
| 2 | 所要時間の自動計測 | 「所要時間: 記録なし」が全ログで常態化。改善効果が測れない | 全セッションで時間データが貯まり、改善の定量評価が可能に | Hook + 推定スクリプト | 低 | 1h | 低（追記のみ・秘密情報なし）。Hook 登録は要人間承認 | **A（実装済・Hook は承認待ち）** |
| 3 | kickoff-session Skill（段取りの自動化） | セッション冒頭の文脈復元が毎回手作業。持ち越しが落ちる | 立ち上げ 10〜15 分 → 1〜2 分。持ち越しゼロ | Skill + briefing スクリプト | 低 | 1h | 低（読み取り専用） | **A（実装済）** |
| 4 | create-codex-brief Skill（指示書生成の定型化） | Codex 指示書が都度手書き。品質ばらつきが既知ミス型を誘発 | usage を消費しない実装ルートが定型化。指示書作成 30 分 → 5 分 | Skill + テンプレート | 低 | 1.5h | 低（ドキュメント生成のみ） | **A（実装済）** |
| 5 | Codex 委譲プレイブック | 実行手順・差し戻し・リモート解除条件が暗黙知 | 委譲判断と実行が迷わない。差し戻し取りこぼし防止 | 運用ドキュメント | 低 | 1h | 低 | **A（実装済）** |
| 6 | GitHub Actions CI 導入 | 品質ゲートがローカル実行頼み。PR で自動検証されない | push 忘れ・ゲート飛ばしの構造的防止。レビュー前に green 保証 | ワークフロー yml | 低 | 1〜2h | 低（GitHub 無料枠内。roadmap Sprint 2 に計画済み） | B（次の開発セッションで） |
| 7 | pnpm audit の定期実行 | hono / happy-dom 脆弱性が場当たり検知（backlog 記録あり） | 脆弱性の検知が自動化 | CI ステップ or 週次 Routine | 低 | 30m | 低 | B（#6 に同梱） |
| 8 | リモート環境の DB 検証経路 | ブラウザ手動テストが DATABASE_URL 無しで毎回 BLOCKED | 実画面確認までリモートで完結 | ローカル Postgres/PGlite シード起動スクリプト | 中 | 2〜4h | 中（Next.js ランタイムとの接続互換の検証が必要） | B |
| 9 | 08-prompt-templates の Skill 化整理 | セッション開始テンプレが kickoff-session と重複 | 定型プロンプトの二重管理を解消 | docs 更新 | 低 | 30m | 低 | B（audit-skills の次回棚卸しで） |
| 10 | バックログ状態の機械集計 | improvement-backlog.md の表が肥大化し状態把握が手動 | 未決定・監視中の抽出が一目に（session-briefing に組込済の拡張） | 集計スクリプト | 低 | 1h | 低 | C（briefing で当面十分） |
| 11 | 週次スプリントレビュー半自動化 | 日曜レトロの logs 集計が手作業 | logs 1 週間分の要約 + メトリクス集計が自動で出る | Skill（sprint-review） | 低 | 1.5h | 低 | B |
| 12 | メトリクス完全自動化 | reviewer 指摘数・手戻り数の記入が手動 | reflect-task の記入負荷減 | レビュー成果物のパーサ | 中 | 3h | 中（成果物形式のばらつき） | C（#2 のデータが貯まってから） |
| 13 | 進捗ダッシュボード（ミニ Web） | metrics yml・backlog・logs が散在し全体俯瞰がない | Sprint 進捗・改善効果が 1 画面に | 静的 HTML 生成スクリプト | 中 | 3h | 低（読み取りのみ） | C |
| 14 | レシピ転記の半自動化（紙→JSON→API） | Sprint 1 完了後の実運用（紙レシピ転記）が完全手作業 | 転記 1 件 10 分 → 2 分。実利用の立ち上がり加速 | 画像→構造化→POST の変換フロー | 中 | 3〜4h | 中（API 経由の書き込みは人間確認必須） | B（実転記開始時に） |
| 15 | permission 許可リスト整備 | 読み取り系コマンドの許可プロンプトが摩擦 | プロンプト回数減・フロー中断減 | settings 許可リスト | 低 | 30m | 低（読み取り系のみ・要人間承認） | C |
| 16 | eval 再採点の定型化 | 「主要改善後に全軸再採点」の実施判断が人依存 | 再採点の抜け漏れ防止 | Skill（re-baseline） | 低 | 1h | 低 | C（頻度が低い） |

## STEP 3: 優先順位

- **今日すぐ作る Quick Win**: #1 close-session、#2 所要時間計測、#3 kickoff-session
- **今後ずっと効く業務 OS 改善**: #4 create-codex-brief、#5 playbook、#6 CI、#7 audit、#9、#11
- **Fable 5 の能力がある今こそ挑戦する高難度**: #8 リモート DB 検証経路、#12 メトリクス完全自動化、#14 レシピ転記半自動化

**最初に着手した 3 つ（本タスクで実装済み）と理由:**

1. **#1+#2（close-session + 所要時間計測）** — 全ログで「所要時間: 記録なし」が続いており、
   改善サイクル（Phase 4 メトリクス駆動）の入力データが欠けている。毎セッション発生する
   固定費で、効果が複利で効く。
2. **#3（kickoff-session）** — セッション毎の文脈復元はエフェメラル環境で特にコストが高く、
   持ち越し落ちは手戻りの温床。読み取り専用で リスクゼロ。
3. **#4+#5（Codex 委譲パック）** — ユーザー指定のブロック解除対象。usage を消費しない
   実装ルートは最大のコストレバー（06-ai-tools）で、指示書生成までは鍵なしで今すぐ動く。

## 承認待ちの提案: record-activity Hook の登録（要人間承認）

`.claude/settings.json` は保護ファイルのため、本タスクでは変更していない（auto モードの
自己改変ガードが正しく拒否）。**承認する場合は以下を手動で適用する**。適用しなくても
所要時間推定は当日コミットから動くが、Hook があると精度が上がる（プロンプト単位の活動時間）。

`hooks` に追加する差分:

```json
"SessionStart": [
  { "hooks": [ { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/record-activity.mjs\"" } ] }
],
"UserPromptSubmit": [
  { "hooks": [ { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/record-activity.mjs\"" } ] }
]
```

さらに既存 `Stop` 配列の先頭に同じコマンドを 1 エントリ追加すると、ターン終了時刻も
記録される（任意）。記録内容は ts / event / session_id のみ（`record-activity.mjs` 参照）。

## 明日からの運用手順

1. セッション開始: 「段取りして」→ kickoff-session Skill（ブリーフィング → 今日のタスク確定 →
   ログ雛形 → L 判定 + 実装ルート宣言）。
2. 開発: Orchestrator ルート（L2/L3）または Codex 委譲ルート（create-codex-brief →
   手元 Codex → チェックリストレビュー）。
3. セッション終了: 「締めて」→ close-session Skill（ゲート → 所要時間推定 → ログ →
   メトリクス → 振り返り → コミット & プッシュ）。

## 次に作ると効果が大きいもの

1. **GitHub Actions CI（#6 + #7）** — roadmap Sprint 2 に計画済み。次の開発セッションの
   最初のタスクに適する（L1 相当・ワークフロー yml 追加のみ）。
2. **リモート DB 検証経路（#8）** — manual-browser-verify の BLOCKED 常態化を解消し、
   「依頼 1 行 → PR レビューだけ」に実画面確認まで含められる。
3. **週次スプリントレビュー Skill（#11）** — 日曜レトロの logs 集計を自動化し、
   スプリント運営の残り手作業を畳む。
