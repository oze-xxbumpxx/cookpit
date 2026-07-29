# .claude/rules

特定のファイル・ディレクトリにだけ適用するスコープ別ルールを置く。CLAUDE.md には
プロジェクト全体で常時必要な原則だけを残し、局所ルールはここへ分離している。

> 読み込まれ方（2026-07-28 実測で更新）：この配下の `.md` は、CLAUDE.md と同じ
> **project instructions として自動注入される**ことを Claude Code on the web で確認した。
> ただし全バージョン・全実行環境で保証される挙動とは限らないため、各 Subagent 定義
> （`.claude/agents/`）と CLAUDE.md からの**明示参照は冗長化として維持する**。
> 新しいルールを足したら、関係する agent 定義からの参照も追加すること。
>
> 自動注入されるということは、**ここに置いた分だけ毎セッションのトークンを常に消費する**。
> 局所ルールであっても短く保ち、手順は Skills へ、メタ記録は `docs/claude-code/` へ分ける。

## ルール一覧

| ファイル | 適用範囲 |
| --- | --- |
| [domain-layer.md](./domain-layer.md) | `packages/domain/`（および集約をまたぐ操作） |
| [coding-standards.md](./coding-standards.md) | 全 TypeScript コード |
| [presentation-layer.md](./presentation-layer.md) | `apps/web/`（Next.js / Hono） |
