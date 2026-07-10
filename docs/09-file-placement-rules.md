# ファイル配置の判断ルール

「どこに何を置くか」を迷わないための 1 枚。2026-07-10 のフォルダ構造監査で制定。
既存の正典（`docs/claude-code/document-policy.md`・各 Skill）と矛盾する場合はそちらが優先。

## 判断表：作るファイルの種類 → 置き場所

| 作るもの                                            | 置き場所                                                                                                | 命名                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 日次の作業ログ                                      | `logs/`                                                                                                 | `YYYY-MM-DD.md`（雛形: `_template.md`）          |
| スプリントレビュー・スプリント記録                  | `docs/sprints/`                                                                                         | `sprint<N>-review-YYYY-MM-DD.md` 等              |
| 要件定義書（L3）                                    | `docs/requirements/`                                                                                    | `<feature-name>.md`                              |
| 設計書（L2/L3）                                     | `docs/designs/`                                                                                         | `<feature-name>.md`                              |
| 契約設計の分割ファイル                              | `docs/designs/`                                                                                         | `<feature-name>-contract.md`（ドット区切り不可） |
| ワイヤーフレーム等のデザイン資産                    | `docs/designs/wireframes/`                                                                              | 任意（PDF 出力は gitignore 済み）                |
| 実装計画（L2/L3）                                   | `docs/implementation-plans/`                                                                            | `<feature-name>.md`                              |
| 試験計画（L2/L3）                                   | `docs/tests/`                                                                                           | `<feature-name>.md`                              |
| レビュー記録（L3）                                  | `docs/reviews/`                                                                                         | `<feature-name>.md`                              |
| ADR（重要な設計判断）                               | `docs/decisions/`                                                                                       | `ADR-<番号 4 桁>-<タイトル>.md`（0005〜）        |
| Codex 委譲の実装指示書                              | `docs/tasks/codex/<feature>/`（**直下に置かない**）                                                     | `README.md` + `NN-<layer>.md`                    |
| ハーネス運用ドキュメント（ワークフロー・ポリシー）  | `docs/claude-code/`                                                                                     | 内容を表す kebab-case                            |
| 改善候補 / 提案 / 評価 / 採否 / メトリクス          | `docs/claude-code/improvements/{candidates,proposals,evaluations,accepted,rejected,metrics,incidents}/` | 各 `_TEMPLATE` に従う                            |
| 役目を終えたハーネス文書                            | `docs/claude-code/archive/`（削除しない）                                                               | 元の名前のまま                                   |
| Agent 定義 / Skill / 局所ルール / Hook / スクリプト | `.claude/{agents,skills,rules,hooks,scripts}/`                                                          | 既存の並びに従う（保護対象・承認必要）           |
| 回帰評価のケース / ベースライン / 結果              | `.claude/evals/{cases,baselines,results}/`                                                              | baselines は **改名・移動禁止**（README 参照）   |
| 一時ファイル・実験スクリプト                        | リポジトリに入れない（セッションの scratchpad か `.claude/state/`（gitignore 済み））                   | —                                                |

## 迷ったときの原則

1. **feature 単位の成果物か？** → feature-name（kebab-case）をファイル名にして
   `docs/{requirements,designs,implementation-plans,tests,reviews}/` のいずれか。
   どの工程の文書か迷ったら document-policy.md の変更レベル表で決める。
2. **ハーネス（Claude Code 運用）の話か、プロダクトの話か？**
   ハーネス → `docs/claude-code/` または `.claude/`。プロダクト → `docs/` 直下の番号付き文書か feature 成果物。
3. **時系列の記録か、参照される正典か？** 記録（ログ・レビュー・メトリクス）は日付や
   ID で追記型に。正典（規約・ポリシー）は 1 ファイルを更新し続ける。
4. **既存ドキュメントの更新で足りないか？** 新規作成の前に必ず確認（document-policy.md）。
   新しいフォルダを切りたくなったら、先にユーザーへ確認する。
5. **削除は選択肢にしない。** 役目を終えた文書は `archive/` へ、判断に迷うものは
   保留リストに残して確認する。

## 歴史的文書（凍結・移動しない）

現行規約の制定前に作られた以下は、相互参照保全のため**当時の場所のまま凍結**する。
新規ファイルをこれらの並びに追加しない。

- `docs/sprints/sprint1-*.md`（9 件）— Sprint 1 の実装計画・レビュー・ガイド
- `docs/tasks/sprint1-*.md`（14 件）— Sprint 1 のタスク指示書
- `.claude/evals/baselines/INDEX*.md` — 回帰評価スナップショット（README が移動禁止を明記）

## 過去の移動記録

配置修正の履歴は `docs/claude-code/reorganization-log-<日付>.md` に全件記録する
（初回: [reorganization-log-2026-07-10.md](./claude-code/reorganization-log-2026-07-10.md)）。
