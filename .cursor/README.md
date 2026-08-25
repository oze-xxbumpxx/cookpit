# Cursor Agent 設定

このディレクトリは **Cursor Agent / Cloud Agent** 向けの設定です。
Claude Code CLI（`.claude/agents/`）とは別系統で、互いに上書きしません。

| パス | 役割 |
| ---- | ---- |
| `agents/implementer.md` | Cursor 経路の実装 Subagent。既定モデルは GPT-5.6 Luna Max |
| `rules/implementation-default-model.mdc` | 実装を親モデル（Grok 等）で行わず Luna Max へ委譲するルール |

Claude Code の implementer は引き続き `claude-sonnet-5` です。
詳細は `docs/claude-code/orchestration-policy.md` の「Cursor Agent 経路」を参照してください。
