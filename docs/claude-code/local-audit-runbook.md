# ローカル PC 診断手順書（read-only）

リモートセッションからは PC 本体が見えないため、PC 全体のディレクトリ階層とユーザー
グローバルの Claude Code 設定は**手元のターミナルで**以下を実行して棚卸しする。
すべて読み取り専用コマンド。結果をそのまま Claude Code セッションに貼り付ければ、
2026-07-04 のリポジトリ監査（本ブランチ）の続きとして診断できる。

## 1. PC 全体のディレクトリ階層

```bash
# ホーム直下の全体像（隠しディレクトリ除く）
ls -d ~/*/ | head -30
du -sh ~/*/ 2>/dev/null | sort -rh | head -20

# 開発フォルダの深さと散らかり（プロジェクト置き場を特定して実行）
find ~/dev ~/projects ~/Documents -maxdepth 3 -type d ! -path '*/.*' 2>/dev/null | head -100

# git リポジトリの所在一覧（プロジェクト置き場の一貫性確認）
find ~ -maxdepth 4 -name .git -type d ! -path '*/Library/*' 2>/dev/null | sed 's|/.git$||'
```

**診断観点**: プロジェクトが 1 箇所（例: `~/dev/`）に集約されているか / 命名が kebab-case で
統一されているか / ダウンロード・デスクトップに作業ファイルが滞留していないか /
1 年以上更新のない放置リポジトリ（`ls -lt` で確認）。

## 2. ユーザーグローバルの Claude Code 設定（~/.claude）

```bash
ls -la ~/.claude/
# CLAUDE.md のトークン概算（日本語は bytes÷3、英語は ÷4 が目安）
wc -c ~/.claude/CLAUDE.md 2>/dev/null

# settings の各スコープ（user / project / local）と有効値
cat ~/.claude/settings.json 2>/dev/null
claude config list 2>/dev/null

# グローバル skills / agents / output-styles / keybindings の有無
ls ~/.claude/skills/ ~/.claude/agents/ ~/.claude/output-styles/ 2>/dev/null
cat ~/.claude/keybindings.json 2>/dev/null | head -20
```

**診断観点**: ユーザー CLAUDE.md に「全プロジェクト共通で常時必要」以外（特定プロジェクトの
手続き・一時メモ）が混ざっていないか / user スコープの permissions.allow が広すぎないか /
プロジェクト側と重複する指示がないか（重複は片方をポインタ化）。

## 3. MCP サーバー・プラグイン

```bash
# ユーザーレベルの MCP 登録（~/.claude.json）
python3 -c "import json,sys;d=json.load(open('$HOME/.claude.json'));print(json.dumps(d.get('mcpServers',{}),indent=2))" 2>/dev/null
claude mcp list 2>/dev/null

# プラグイン
claude plugin list 2>/dev/null
```

**診断観点**: 30 日以上使っていないサーバー（会話履歴・用途を思い出せないものは削除候補）/
同機能の重複（例: GitHub 系が 2 つ）/ 認証トークンの権限過多（read で足りるのに write）。

## 4. 「毎回言っている指示」の抽出

直近 2 週間のセッションを振り返り、以下に該当する指示があれば移設する：

| 頻出パターン                                   | 移設先                                    |
| ---------------------------------------------- | ----------------------------------------- |
| 毎回言う前提・好み（口調、言語、フォーマット） | `~/.claude/CLAUDE.md` または output-style |
| プロジェクト固有で毎回言う原則                 | プロジェクトの `CLAUDE.md`                |
| 「〜して」と依頼する定型の手続き（3 回以上）   | `.claude/skills/<name>/SKILL.md`          |
| 忘れると事故る強制事項（フォーマット・確認）   | hook / permissions（settings.json）       |

補助: `npx ccusage@latest` でセッション履歴のトークン消費傾向も確認できる（任意）。

## 5. 結果の持ち込み方

上記の出力を貼り付けて「ローカル診断の続きをして」と依頼する。本手順書の観点で
影響度×工数のマトリクスに落とし、`~/.claude/` 側の最適化案（グローバル CLAUDE.md の
理想形・移設マッピング）を提示する、というのが続きの流れ。
