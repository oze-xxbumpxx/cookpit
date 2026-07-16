# notes/ — 未整形メモ（Obsidian inbox）

アイディア・改善の種・調査の走り書きなど、**まだ docs の型に落ちていないメモ**の置き場。
Obsidian でリポジトリルートを Vault として開いたとき、新規ノート（Ctrl+N）と貼り付け画像は
ここに落ちる（`.obsidian/app.json`）。

**このディレクトリは正典ではない。** docs/ と内容が矛盾したら docs/ が正。
プロジェクトの索引は [docs/README.md](../docs/README.md)、日次ログは [logs/](../logs/) を参照。

## 運用ルール

- **構成**: フォルダは掘らず、notes/ 直下にフラットに置く。`notes/attachments/` は
  Obsidian の画像貼り付け先（手動では触らない）。
- **一覧**: `_dashboard.base`（Obsidian 1.9+ の Bases）で未昇格メモを status / created の
  テーブルで見られる。frontmatter を付けたメモだけが状態列に値を持つ。
- **命名**: `<topic>.md`（kebab-case。docs の feature-name 規約と揃える）。
- **frontmatter（任意・notes/ 限定）**: 使う場合は次の 2 キーのみ。既存 docs/ への遡及付与はしない。

  ```yaml
  ---
  status: idea # idea | growing | promoted
  created: 2026-07-16
  ---
  ```

## 昇格フロー

段階を飛ばさない（[memory-policy.md](../docs/claude-code/memory-policy.md) /
[improvement-cycle.md](../docs/claude-code/improvement-cycle.md) と整合）。

| メモの種類                 | 昇格先                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 機能・設計のアイディア     | 通常の L2/L3 フロー（[document-policy.md](../docs/claude-code/document-policy.md)）で `docs/requirements/` / `docs/designs/` へ |
| Claude Code 運用改善のメモ | `docs/claude-code/improvements/candidates/` へ起票 + backlog に 1 行追加                                                        |

昇格したら notes/ 側のファイルは**削除**する（履歴は git に残る。重複記述を作らない）。
notes/ は「人間側の inbox」、Auto Memory は「Agent 側の inbox」という住み分け。

## 禁止事項

- **Obsidian 上で docs/ 配下のファイルをリネーム・移動しない。**
  docs/ のパス・ファイル名は CLAUDE.md・Skills・Agent 定義・Hooks・スクリプトに
  多数ハードコードされており、Obsidian のリンク自動更新はそれらに追随しない。

## 将来候補（スコープ外の気づき）

- kickoff-session スキルへの notes/ 未昇格メモのブリーフィング組み込み（スキル変更は
  改善サイクルの承認境界を通す）。
- `logs/_template.md` の Daily notes テンプレート対応（`{{date}}` 構文化）。現状は
  Daily note 作成後に見出しの日付を手動修正する。
