# 開発ワークフロー（Orchestrator 主導）

このプロジェクトの機能追加・修正は、**Orchestrator が指揮**し、専門 Subagent に
調査・設計・計画・実装・試験・レビューを委譲する形で進める。

CLAUDE.md には常時必要な原則だけを置き、工程の詳細はこの文書と各 Subagent 定義
（`.claude/agents/`）、各 Skill（`.claude/skills/`）に分離している。

## 標準フロー

```
ユーザー要求
  │
  ▼
Orchestrator … 変更レベル判定（L1/L2/L3）・タスク分解・委譲計画
  │
  ├─(L3・必要なL2)→ requirements-analyst … 要求整理・既存調査・観点抽出
  ├─(L2/L3)→ architecture-designer … 技術設計 → docs/designs/<feature>.md
  ├─(契約変更時)→ contract-designer … 契約設計（orchestration-policy.md §必須起動トリガー）
  ├─(L2/L3)→ implementation-planner … 実装計画 → docs/implementation-plans/<feature>.md
  ├─(L2/L3)→ test-designer … 試験観点 → docs/tests/<feature>.md
  ├────────→ implementer … 実装 + 単体テスト + lint/型チェック/テスト
  │           （実装ルートが Codex 委譲の場合はこの工程のみ Codex + review-codex-implementation
  │             で代替する。正典は orchestration-policy.md §実装ルートの分岐）
  ├─(L2/L3)→ reviewer … 整合性・品質のレビュー
  ├─(L2/L3)→ security-reviewer … セキュリティ専門レビュー（L2 は省略条件あり・正典は orchestration-policy）
  └─(L2/L3)→ reflection-agent … 振り返り → improvements/candidates/<task-id>.md
  │
  ▼
Orchestrator … 成果物の統合・矛盾解消・完了条件確認 → ユーザー報告
```

Level 1（軽微）は設計書・計画を省略し、implementer（または直接修正）→ 必要なら
reviewer の最小フローで進める。レベルの定義は
[document-policy.md](./document-policy.md) を参照。

## 実装前に必ず満たす条件

L2/L3 の実装に着手する前に、以下が揃っていることを確認する。

- `docs/designs/<feature-name>.md`（確定済み設計）
- `docs/implementation-plans/<feature-name>.md`（実装計画）

これらが無い、または必須セクションが空のまま実装に入らない。設計から逸脱する必要が
生じた場合、implementer は独断で変更せず Orchestrator へ差し戻す。

## feature-name の扱い

1 つの作業単位を識別する `feature-name`（kebab-case）を Orchestrator が最初に決める。
全成果物のファイル名にこの名前を使い、横断的な追跡を可能にする。

作業中の feature-name は `.claude/state/current-feature` に記録する（Hook がこの値を
使って成果物の有無を検証する。詳細は [document-policy.md](./document-policy.md)）。

## 完了条件

Orchestrator は以下をすべて確認してから「完了」とユーザーへ報告する。

- 要求 → 設計 → 実装計画 → 実装 → 試験 の間に矛盾がない
- L2/L3 で必要な成果物が存在し、必須セクションが埋まっている
- `pnpm lint` / `pnpm type-check` / `pnpm test`（Vitest。全層導入済み — 2026-07-01 PR #21）が通っている
- スコープ外の変更が混入していない
- ユーザー確認が必要な判断（下記）が解決済み

## ユーザーへ確認すべき条件

以下に該当する場合は、実装を進める前にユーザーへ確認する。

- アーキテクチャ・ドメインモデル・DB スキーマに関わる設計判断
- 新規ファイルの作成、既存ファイルの削除
- 依頼スコープを超える変更が必要になったとき
- 後方互換性・データ移行が絡むとき
- 複数の妥当な設計案があり、トレードオフの選択が必要なとき

## セッション跨ぎの復旧（強制中断・計画分割）

usage リミット・分類器障害・ユーザー都合などでセッションが途中終了した場合、
**次セッションは経験で再発明せず、次のチェックリストで復元する**
（出典: shopping-list-screens 事象 1・7 / harness-post-020-audit 事象 3）。

### 共通の復旧の型

1. **直近の日次ログを読む** — `logs/` の最新（または対象日）の
   「今日のタスク」「やったこと」「次回やること」から、完了フェーズと残工程を特定する。
2. **リモートの成果を確認する** — `git fetch` のうえ `git ls-remote --heads origin` 等で、
   feature 名を含むブランチと最新コミットを確認する（エフェメラル環境ではローカルだけでは足りない）。
3. **継続ブランチを明示選択する** — 前セッションの `feature/*` と、新セッションが採番した
   `claude/*` 等が並存しうる。どちらで続けるかを決めてから作業を再開する
   （黙って別ブランチに積み上げない。PR 集約先の二重化防止）。
4. **未完了工程だけを再開する** — ログとリモート成果を突き合わせ、済んだ工程はやり直さない。

### 中断理由ごとの分岐

| 中断理由 | 追加でやること |
| --- | --- |
| usage リミット等の強制終了 | チェックポイントコミットがリモートにある前提。無い工程だけ再実行 |
| 計画的なセッション分割 | ログの「次回やること」を kickoff のタスク案の起点にする（従来どおり） |
| 分類器障害・Hook 誤ブロック | 復旧後、期待成果物の有無で冪等判定してから再委譲（二重起動防止） |

kickoff-session は手順に「強制中断からの再開か」を確認する項を持つ。
close-session は強制終了が近いと判断したとき、フェーズ境界のチェックポイントコミットと
「次回やること」の具体化を優先する。
