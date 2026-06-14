# .claude/rules

特定のファイル・ディレクトリにだけ適用するスコープ別ルールを置く。CLAUDE.md には
プロジェクト全体で常時必要な原則だけを残し、局所ルールはここへ分離している。

> 注意：Claude Code はこのディレクトリを**自動では読み込まない**（`.claude/rules/` の
> 自動ロードは標準機能ではない）。各 Subagent 定義（`.claude/agents/`）と CLAUDE.md から
> **明示的に参照**することで効かせている。新しいルールを足したら、関係する agent 定義から
> 参照を追加すること。

## ルール一覧

| ファイル | 適用範囲 |
| --- | --- |
| [domain-layer.md](./domain-layer.md) | `packages/domain/`（および集約をまたぐ操作） |
| [coding-standards.md](./coding-standards.md) | 全 TypeScript コード |
| [presentation-layer.md](./presentation-layer.md) | `apps/web/`（Next.js / Hono） |
