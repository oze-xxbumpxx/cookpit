# 改善記録（Agent 継続的改善機構）

このディレクトリは、タスク実行で得た知見を蓄積し、Agent 構成（Agent / Skill / Rule /
CLAUDE.md / Hook）を**半自動型**で段階的に改善するための記録置き場です。

- 改善サイクルの全体像・承認フロー・実行タイミング: [../improvement-cycle.md](../improvement-cycle.md)
- 知見の保存先分類・昇格条件・肥大化対策: [../memory-policy.md](../memory-policy.md)
- 現行の承認方式: [../harness-state.md](../harness-state.md)（2026-07-29 以降は PR レビュー。
  過去の proposal に残る承認マーカー手順は履歴であり、実行しない）

## 重要な前提（過剰適応を避ける）

1. **Memory は学習済みモデルではない。** 次回セッションに読み込まれる永続コンテキストに
   過ぎない。誤った内容を保存すれば次回以降も誤りを参照する。誤情報は memory-policy.md の
   手順で削除する。
2. **毎タスク Agent 定義を変更しない。** 1 回の失敗で直すと特定事例へ過剰適応する。
   `単発 → Memory` / `繰り返す → 改善候補` / `検証済み → Agent・Skill・Rule` の段階を守る。
3. **改善前後を評価する。** 指示を増やすだけでは改善しない。不要な指示の削除・移動も改善に
   含む。`agent-evaluator` の回帰評価で悪化しないことを確認してから採用する。

## ディレクトリ

| パス                     | 内容                                         | 主担当                     |
| ------------------------ | -------------------------------------------- | -------------------------- |
| `improvement-backlog.md` | 全候補・提案の一覧（ID・ステータス）         | reflection-agent / manager |
| `candidates/`            | タスクごとの改善候補（`<task-id>.md`）       | reflection-agent           |
| `proposals/`             | 横断分析後の改善提案書（`<proposal-id>.md`） | agent-improvement-manager  |
| `evaluations/`           | 提案の回帰評価レポート（`<proposal-id>.md`） | agent-evaluator            |
| `accepted/`              | 承認・適用済み提案                           | （承認後に移動）           |
| `rejected/`              | 却下・不採用提案（理由付き）                 | manager / 人間             |
| `incidents/`             | 重大インシデント記録（改善トリガー）         | 検知者                     |

各サブディレクトリの `_TEMPLATE.md` を雛形に使う。

## ステータス遷移

```
candidate → proposal → (evaluation) → accepted / rejected
                                    ↘ incident（重大時は最優先で proposal 化）
```

| ステータス  | 意味                                                    |
| ----------- | ------------------------------------------------------- |
| `candidate` | reflection-agent が起票。昇格条件は未確定 or 単一タスク |
| `proposal`  | manager が横断分析し変更案を作成。評価待ち              |
| `evaluated` | agent-evaluator が回帰評価済み（推奨／非推奨つき）      |
| `accepted`  | 承認され本適用済み（軽微は manager、重要は人間承認）    |
| `rejected`  | 却下。理由とロールバック判断を記録                      |

## ID 採番規約

- 改善提案: `IMP-<西暦>-<連番3桁>`（例: `IMP-2026-001`）。`improvement-backlog.md` の
  最大連番 +1 で採番する。
- インシデント: `INC-<西暦>-<連番3桁>`（例: `INC-2026-001`）。
- 候補ファイル名は `<task-id>.md`（task-id は kebab-case。`.claude/state/current-feature`
  と揃える）。

## 運用の最小ルール

- 候補・提案を起票したら必ず `improvement-backlog.md` に 1 行追加・更新する。
- 「人間の承認が必要」な対象（improvement-cycle.md §承認境界）は、proposal に差分を書くだけで
  本適用しない。明示承認後に専用ブランチで適用し、PR レビューを経て `accepted/` へ移動する。
- 採用・却下のいずれでも、理由とロールバック方法を残す（再発時の判断材料）。
