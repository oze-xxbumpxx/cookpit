# 実装計画: review-readiness

- 前提: `docs/requirements/review-readiness.md` / `docs/designs/review-readiness.md` /
  `docs/decisions/ADR-0022-review-readiness-as-decision-interface.md`
- レベル: L3
- 実装ルート: Codex 実装 → Claude Code Reviewer 受け入れレビュー
- 対象外: アプリ本体、DB、API、既存レビュー本文の一括移行、CI blocking 化

## 変更対象

| path                                                                                 | 変更                                                 |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `.claude/scripts/review-readiness.mjs`                                               | subject / render / check / ci の実装                 |
| `.claude/tests/review-readiness.test.mjs`                                            | pure function と一時 Git repo の回帰試験             |
| `.claude/scripts/check-review-coverage.mjs`                                          | 挙動を変えず improvement → workflow へ再分類         |
| `.claude/agents/reviewer.md`                                                         | 四軸指摘、検証、handoff JSON 契約                    |
| `.claude/agents/security-reviewer.md`                                                | 専門指摘を同じ四軸へ統一                             |
| `.claude/skills/review-codex-implementation/SKILL.md`                                | 人間 8 項目再走査を廃止し、packet 生成へ移行         |
| `.claude/skills/create-codex-brief/SKILL.md`                                         | checklist 参照を task 固有 risk catalog へ変更       |
| `.claude/skills/{record-metrics-and-reflect,reflect-task}/SKILL.md`                  | 4 軸指摘と人間負荷 metric の記録手順を同期           |
| `.claude/scripts/sprint-summary.sh`                                                  | review 負荷 / 状態 metric を週次要約へ含める         |
| `.github/workflows/ci.yml`                                                           | 既存 quality job へ warning-only step 追加           |
| `docs/06-ai-tools.md`                                                                | checklist を機械 / Reviewer 用 risk catalog へ再定義 |
| `docs/reviews/README.md`                                                             | state + audit、表示順、schema の正典                 |
| `docs/claude-code/{agent-responsibilities,codex-delegation-playbook,usage-guide}.md` | 現行ガイドの旧 severity / checklist 契約を同期       |
| `docs/claude-code/development-workflow.md`                                           | review state と二つの人間ゲート                      |
| `docs/claude-code/definition-of-done.md`                                             | BLOCK 0、freshness、人間項目 budget                  |
| `docs/claude-code/plugin-layer-manifest.md`                                          | script/test を workflow 層へ追加し件数同期           |
| `docs/claude-code/improvements/metrics/_TEMPLATE.yml`                                | 人間レビュー負荷の最小計測                           |

## 実装手順

### Step 1: subject digest

- feature / ref の検証、base 解決、index/commit raw diff を Buffer で取得する。
- 当該 review 文書だけを pathspec で除外する。
- version / feature / base / raw bytes を SHA-256 へ入れる。
- 完了条件: 内容、mode、base の変更で digest が変わり、review 文書変更では変わらない。

### Step 2: schema と renderer

- assessment JSON の shape / enum / count / ID / evidence ref を依存なしで検証する。
- status を count と evidence から導出する。
- state JSON と人間向け Markdown を同じ marker に render する。
- 完了条件: `PASS` を表示せず、リスク優先順、3 件 budget、HTML escape、formatter 安定性が成立する。

### Step 3: checker と CI mode

- review 文書から state JSON を parse し、schema / feature / Task coverage / digest を検証する。
- `ci` は変更された `docs/reviews/*.md` を列挙し、legacy / stale / invalid を短く報告する。
- `warn` は常に 0、`strict` は error で非 0 とする。
- 完了条件: legacy 互換と warning-only が試験で固定される。

### Step 4: Reviewer / Skill / 正典統合

- Reviewer の Must/Should/Nice を四軸へ変更する。
- candidate finding は introduced-by-diff / evidence / duplicate を検証してから記録する。
- 固定 8 項目の表を人間へ要求せず、機械証拠と例外だけを監査ログに残す。
- handoff assessment を Reviewer の出力契約へ追加する。
- 完了条件: 何を AI、機械、人間が担うかが 1 箇所ずつ明確で矛盾しない。

### Step 5: CI / metrics / plugin manifest

- CI の既存 quality job に 1 step だけ追加する。
- metrics に review time bucket / confidence / full diff opened を追加する。
- CI は変更された L2/L3 成果物から feature を検出し、review 欠落も warning にする。
- plugin manifest は workflow +3 / improvement -1 / 総数 +2 とする。
- 完了条件: job と依存は増えず、manifest 未分類 0 を維持する。

### Step 6: dogfood と Claude review

- 品質ゲートを実行する。
- Claude Code Reviewer に requirements/design/plan/tests/実装を突き合わせてもらう。
- BLOCK を修正し再レビューする。
- candidate / metrics を確定し、review 文書以外を staged snapshot にする。
- final subject の差分を closure review し、以後は review 文書以外を変更しない。
- 本 feature の review 文書を render し、check で current を検証する。

## 依存関係

Step 1 → Step 2 → Step 3 → Step 4/5 → Step 6。

## テスト

`docs/tests/review-readiness.md` を正典とし、Node 標準 `node:test` で実装する。

## リスクと緩和

| リスク                        | 緩和                                                      |
| ----------------------------- | --------------------------------------------------------- |
| parser が既存 Markdown を壊す | script は read-only、marker 外を変更しない                |
| digest の偽一致               | raw bytes + base + feature、full SHA-256 保存             |
| stale / missing の誤警告      | 対象ディレクトリを L2/L3 成果物に限定、warning-only trial |
| packet が肥大                 | human 3 / behavior 5、AI assessment を折り畳む            |
| meta 作業の増加               | 新規 script/test 各 1、既存 Skill へ統合、sidecar なし    |

## ロールバック

ADR の Rollback に従い、本 feature の変更を revert する。review 文書本文とアプリデータの移行はない。

## 完了条件

- 試験計画の必須観点が実装されている。
- `pnpm test:harness` / `pnpm lint` / `pnpm type-check` / `pnpm test` が成功する。
- Claude Code Reviewer の open `BLOCK` が 0。
- review-readiness 自身の packet が current digest で生成される。
