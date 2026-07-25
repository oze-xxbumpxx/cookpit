# 凍結 Agent 定義アーカイブ

2026-07-25 の Agent 稼働統合（IMP-2026-030）で `.claude/agents/` から外した定義の保管場所。

| 凍結 Agent             | 吸収先                                                          |
| ---------------------- | --------------------------------------------------------------- |
| `requirements-analyst` | orchestrator（要求分析）+ architecture-designer（要件書 Write） |
| `performance-designer` | architecture-designer（条件付きパフォーマンス節）               |
| `e2e-test-implementer` | test-designer（条件付き E2E 実装節）                            |
| `document-reviewer`    | reviewer（文書レビュー観点）                                    |

- 現行の起動対象は `.claude/agents/` の **11 Agent** のみ。
- ここにある定義は履歴・参照用。Claude Code から起動しない。
- 正典の委譲フローは [../orchestration-policy.md](../orchestration-policy.md)。
