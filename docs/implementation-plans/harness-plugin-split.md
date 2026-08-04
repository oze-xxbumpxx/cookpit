# 実装計画: harness-plugin-split

- 前提となる設計書: docs/designs/harness-plugin-split.md
- レベル: L3
- 実装ルート: Orchestrator（implementer）
- 判断理由: 既定（docs/06-ai-tools.md — ハーネス自身の構成変更で、層をまたぐ依存の
  機械照合と手順の対照が必要。Codex 委譲の対象外）

## 変更対象ファイル

| path                                                                          | なぜ変えるか                                         |
| ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| `.claude/skills/close-session/SKILL.md`                                       | 手順 4・5 と完了条件の improvement 依存を分離（F-3） |
| `.claude/scripts/record-task-metrics.sh`                                      | `COOKPIT_METRICS_*` 11 箇所を `HARNESS_METRICS_*` へ |
| `.claude/hooks/record-activity.mjs`                                           | 層コメント（core 層である旨・D-4）                   |
| `.claude/scripts/estimate-session-time.mjs`                                   | 同上                                                 |
| `.claude/agents/*.md` / `.claude/skills/*/SKILL.md`（出典を含む 15 ファイル） | 出典表記を D-3 の形式へ（分類 (a)(c) のみ）          |

## 新規作成ファイル

| path                                                 | 役割                                                     |
| ---------------------------------------------------- | -------------------------------------------------------- |
| `.claude/skills/record-metrics-and-reflect/SKILL.md` | close-session から分離した improvement 層の手順          |
| `docs/claude-code/plugin-layer-manifest.md`          | 層マニフェスト（Phase 3 の入力・全ファイルの層割り当て） |
| `.claude/templates/claude-md-coding-standards.md`    | CLAUDE.md へ取り込む汎用ルール断片（D-2）                |

## ファイルごとの変更内容

### `.claude/skills/close-session/SKILL.md`

- 変更内容: 手順 4（メトリクス）・手順 5（振り返り）を削除し、
  「improvement 層が利用可能なら `record-metrics-and-reflect` を実行、無ければスキップして
  ログに記録」の 1 手順へ置き換える。完了条件の `check-review-coverage.mjs` 項目も
  新 Skill 側へ移し、close-session 側は「improvement 層がある場合のみ」と条件を明記する。
  frontmatter の description からメトリクス・振り返りの語を外す。
- 完了条件: 残る手順が core 層の依存だけで完結する。手順番号が連続している。

### `.claude/skills/record-metrics-and-reflect/SKILL.md`（新規）

- 変更内容: 旧手順 4・5 の本文をそのまま移し、`check-review-coverage.mjs` の完了条件を
  加える。frontmatter に発動条件（close-session から呼ばれる / 単独でも可）を書く。
- 完了条件: 旧 close-session の手順 4・5 の内容が欠落なく移っている。

### `.claude/scripts/record-task-metrics.sh`

- 変更内容: `COOKPIT_METRICS_OUT` / `_FEATURE` / `_SUBAGENT_LOG` / `_AGENT_CALLS` /
  `_MISSING` の 11 箇所を `HARNESS_METRICS_*` へ。後方互換は不要（内部受け渡し）。
- 完了条件: `grep -c COOKPIT_ ` が 0。スクリプトを実行して YAML が更新される。

### `.claude/hooks/record-activity.mjs` / `.claude/scripts/estimate-session-time.mjs`

- 変更内容: 冒頭コメントに「core 層（Plugin 分割時）」の 1 行を追記する。コードは変更しない。
- 完了条件: 層マニフェストとコメントが一致する。

### 出典を含む 15 ファイル

- 変更内容: 設計書の 3 分類に従い、(a) 事象記録・(c) Cookpit ローカル資産への参照のみ
  `出典: cookpit/<feature> 事象 N` の形へ。(b) Plugin 同梱ファイルへの参照は**変更しない**。
- 完了条件: (b) のパスが生存している。(a)(c) にリポジトリ内パスが残っていない。

### `docs/claude-code/plugin-layer-manifest.md`（新規）

- 変更内容: `.claude/` 全ファイルを core / workflow / improvement / cookpit-local の
  4 分類へ割り当てた表。未分類 0 を保証する。
- 完了条件: `.claude/` の全ファイル数と表の行数が一致する。

### `.claude/templates/claude-md-coding-standards.md`（新規）

- 変更内容: `.claude/rules/coding-standards.md` の汎用分（型・構文・コメント・
  エラーハンドリング・品質ゲート）を、移植先の CLAUDE.md へ貼れる形で切り出す。
  Cookpit 固有の記述（Vitest 導入状況・PR 番号・出典）は落とし、取り込み手順を冒頭に書く。
- 完了条件: 断片だけ読んで移植先で成立する（Cookpit 固有の前提が残っていない）。

## 実装手順

1. **層マニフェストを作る** … `docs/claude-code/plugin-layer-manifest.md` /
   `.claude/` 全ファイルを 4 分類 / 未分類 0 を機械確認
2. **close-session を分割** … `close-session/SKILL.md` +
   `record-metrics-and-reflect/SKILL.md`（新規）/ 手順の移動 /
   分割前の手順 1〜7 と完了条件の対照表で漏れ 0
3. **record-task-metrics.sh の改名** … 11 箇所 / `grep -c COOKPIT_` が 0
4. **層コメントの追記** … `record-activity.mjs` / `estimate-session-time.mjs` / 2 行
5. **CLAUDE.md 断片を作る** … `.claude/templates/claude-md-coding-standards.md` /
   汎用分の切り出し / Cookpit 固有記述が残っていない
6. **出典表記の統一** … 15 ファイル / 3 分類に従って置換 / (b) の生存確認
7. **層をまたぐ依存の機械照合** … 変更なし /
   各層のファイルが上位層のファイルを参照していないことを grep で確認 / 0 件
8. **品質ゲート** … 変更なし / `lint` `type-check` `test` `test:harness` / 全 PASS

## 依存関係

- 手順 1 は他のすべての前提（どの層かを決めないと 2・7 が判断できない）。
- 手順 2 は手順 1 に依存。手順 3・4・5・6 は互いに独立。
- 手順 7 は 1〜6 の完了後。**ここが本 Phase の受け入れ判定**。
- 手順 8 は最後。

## テスト計画

`docs/tests/harness-plugin-split.md` と整合。ランナーは node:test（`pnpm test:harness`）。

本 Phase は**設定ファイルの再編**であり、自動試験を追加する対象は無い（新しい実行ロジックを
書かない）。検証は次の 2 本柱で行う。

- **機械照合**: 層をまたぐ依存 0 件・未分類ファイル 0 件・`COOKPIT_` 残存 0 件・
  出典分類 (b) の生存。
- **手順の対照**: close-session 分割前後の手順・完了条件の 1:1 対照表。

既存 67 件の harness テストは回帰確認として実行する。

## リスク

設計書 R-a〜R-d を継承。実装時の判断を固定する。

| #   | 発生時の対応                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------- |
| R-a | close-session の手順欠落 → 分割前の本文を対照表で 1:1 照合。判断に迷えば**両方に残さず**新 Skill 側へ寄せる（二重実行を防ぐ） |
| R-b | 出典置換で (b) を壊す → 置換前に 38 箇所を 3 分類して一覧化し、(a)(c) だけを対象にする                                        |
| R-c | 層マニフェストの漏れ → `.claude/` の `find` 結果と表の行数を突き合わせる                                                      |
| R-d | metrics 記録が黙って壊れる → 改名後に `record-task-metrics.sh` を実行して YAML 更新を確認                                     |

## ロールバック方法

`.claude/` と `docs/` に閉じるため `git revert <sha>` で戻せる。データ移行を伴わないため
revert 後の復旧作業は不要。新規 3 ファイルは revert で消える。

## ドキュメント更新対象

- `docs/claude-code/plugin-layer-manifest.md` — 新規（手順 1）
- `.claude/rules/README.md` — rules 3 本のうち 2 本が Plugin 非同梱である旨の追記（手順 1 の後）
- `docs/04-domain-model.md` — **更新不要**（ドメインモデルの変更なし。対象は
  Claude Code ハーネスのみでアプリコードに触れない）
- ADR — 作成済み（`docs/decisions/ADR-0014-harness-plugin-three-layer-split.md`）
- `logs/2026-07-31.md` — セッション追記
