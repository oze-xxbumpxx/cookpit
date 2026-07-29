# 試験計画: harness-personal-light-mode

- 前提設計: docs/designs/harness-personal-light-mode.md
- レベル: L2
- 対象: ハーネス指示系・Agent 構成（アプリコードなし）

## 正常系

| ID   | 前提      | 操作                              | 期待結果                                                                            |
| ---- | --------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| N-01 | PR 適用後 | `ls .claude/agents/*.md \| wc -l` | 11（archive 除く）                                                                  |
| N-02 | 同上      | orchestrator.md の tools 行       | 旧 4 Agent 名を含まない                                                             |
| N-03 | 同上      | usage-guide にライトモード節      | L0/L1・改善頻度・常備セットが読める                                                 |
| N-04 | 同上      | memory-policy                     | 早期昇格原則禁止と archive 基準がある                                               |
| N-05 | 同上      | metrics \_TEMPLATE.yml            | `meta_work_ratio` 欄がある                                                          |
| N-06 | 同上      | orchestration-policy の L3 フロー | requirements-analyst / performance-designer / e2e-test-implementer の単独起動が無い |

## 異常系・境界

| ID   | 前提                     | 操作                                  | 期待結果                             |
| ---- | ------------------------ | ------------------------------------- | ------------------------------------ |
| A-01 | 旧名で起動したくなる依頼 | orchestration-policy / archive README | 吸収先へ誘導する記述がある           |
| A-02 | 単発の改善欲求           | memory-policy 昇格節                  | 3 回未満は候補留め・早期昇格しない   |
| B-01 | security 触点のある L3   | orchestration-policy                  | security-reviewer は引き続き起動必須 |

## 整合性

| ID   | 観点                                                                             | 期待                                      |
| ---- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| C-01 | README / agent-responsibilities / usage-guide / orchestration-policy の Agent 数 | すべて 11（または「11 + archive」）で一致 |
| C-02 | classify-change の必要 Agent 表                                                  | 旧単独 Agent を必須起動にしていない       |
| C-03 | create-requirements-document                                                     | 実行主体が architecture-designer（L3）    |

## 回帰

| ID   | 範囲                                                | 期待                                                    |
| ---- | --------------------------------------------------- | ------------------------------------------------------- |
| R-01 | `.claude/tests/*.test.mjs`                          | 既存ハーネス単体テスト PASS                             |
| R-02 | guard-dangerous                                     | 破壊的操作・秘密情報・Hook 回避の拒否が維持される       |
| R-03 | 歴史ドキュメント（logs / accepted / evals/results） | 未変更                                                  |
| R-04 | harness-state schema v1                             | v2 へ読み込め、承認フィールドが除去される               |
| R-05 | 現行の実行手順                                      | 承認マーカーや廃止 CLI を指示しない（履歴記録は対象外） |

## 対象外

- アプリの Vitest / Playwright シナリオ追加
- Hook の新規ブロック条件
- security-reviewer 統合後の評価（将来）

## 2026-07-29 追補: 旧承認機構の撤去

本設計の PR レビュー承認を正典として、ファイル承認の実装・CLI・テストを削除する。
run 状態は schema v2 に更新し、既存 schema v1 を読み込み時に移行する。重要構成の変更は
ユーザーの明示承認、専用ブランチ、ハーネステスト、Claude Code レビュー、PR マージで扱う。

## 完了条件

- N/A/B/C/R の自動・目視確認が PASS
- Critical/Major の文書不整合が残っていない
