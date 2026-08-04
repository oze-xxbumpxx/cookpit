# 吸収済み Agent（凍結）

IMP-2026-031 / harness-personal-light-mode（2026-07-26）。
旧定義を `docs/claude-code/archive/agents/` に凍結した（`.claude/agents/` からは除去）。

| 旧 Agent             | 吸収先                                                           |
| -------------------- | ---------------------------------------------------------------- |
| requirements-analyst | orchestrator（調査）+ architecture-designer（requirements 保存） |
| performance-designer | architecture-designer（条件付き性能節）                          |
| e2e-test-implementer | implementer（条件付き E2E 実装）                                 |
| document-reviewer    | reviewer（条件付き文書レビュー）                                 |

復元する場合は本ディレクトリから `.claude/agents/` へ戻し、orchestration-policy と
orchestrator の `tools:` を同期すること。通常運用では起動しない。

> PR #116 と同趣旨。本ブランチでは e2e の吸収先を **implementer** に確定
> （ツール適合。試験計画は従来どおり test-designer）。
