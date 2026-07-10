# フォルダ構造監査 — 移動・復元ログ（2026-07-10）

2026-07-10 実施のフォルダ構造全面監査（ブランチ `claude/work-folder-audit-q7pupb`）で
実施したファイル移動の全件記録。**削除は一切行っていない。** すべて `git mv` で移動して
おり、履歴は保持されている。復元する場合は「復元コマンド」をそのまま実行する。

## 移動一覧（元の場所 → 新しい場所）

| #   | 元の場所                                  | 新しい場所                                             | 理由                                                                         |
| --- | ----------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1   | `logs/sprint-0.md`                        | `docs/sprints/sprint0-setup.md`                        | `logs/` は日次ログ（YYYY-MM-DD.md）置き場。スプリント記録は `docs/sprints/`  |
| 2   | `docs/tasks/codex/README.md`              | `docs/tasks/codex/product-master/README.md`            | Codex 委譲指示書の規約は `docs/tasks/codex/<feature>/`（create-codex-brief） |
| 3   | `docs/tasks/codex/01-domain.md`           | `docs/tasks/codex/product-master/01-domain.md`         | 同上                                                                         |
| 4   | `docs/tasks/codex/02-infrastructure.md`   | `docs/tasks/codex/product-master/02-infrastructure.md` | 同上                                                                         |
| 5   | `docs/tasks/codex/03-application.md`      | `docs/tasks/codex/product-master/03-application.md`    | 同上                                                                         |
| 6   | `docs/tasks/codex/04-api.md`              | `docs/tasks/codex/product-master/04-api.md`            | 同上                                                                         |
| 7   | `docs/tasks/codex/05-frontend.md`         | `docs/tasks/codex/product-master/05-frontend.md`       | 同上                                                                         |
| 8   | `docs/designs/product-master.contract.md` | `docs/designs/product-master-contract.md`              | 契約分割ファイルの命名規約は `<feature>-contract.md`（contract-designer）    |

## 参照リンクの追随更新

| ファイル                                      | 更新内容                                                                         | 状態                                                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `docs/implementation-plans/product-master.md` | `product-master.contract.md` → `product-master-contract.md`（2 箇所）            | 更新済み                                                             |
| `docs/tasks/codex/product-master/README.md`   | 同上（1 箇所）                                                                   | 更新済み                                                             |
| `docs/tests/product-master.md`                | 同上（1 箇所）                                                                   | 更新済み                                                             |
| `.claude/skills/create-codex-brief/SKILL.md`  | 実例パス `docs/tasks/codex/README.md`・`01〜05` → `product-master/` 配下（2 行） | **未了**（保護構成ファイルのため人間承認待ち。下記「未了事項」参照） |

## 復元コマンド

```bash
git mv docs/sprints/sprint0-setup.md logs/sprint-0.md
git mv docs/tasks/codex/product-master/README.md docs/tasks/codex/README.md
git mv docs/tasks/codex/product-master/01-domain.md docs/tasks/codex/01-domain.md
git mv docs/tasks/codex/product-master/02-infrastructure.md docs/tasks/codex/02-infrastructure.md
git mv docs/tasks/codex/product-master/03-application.md docs/tasks/codex/03-application.md
git mv docs/tasks/codex/product-master/04-api.md docs/tasks/codex/04-api.md
git mv docs/tasks/codex/product-master/05-frontend.md docs/tasks/codex/05-frontend.md
git mv docs/designs/product-master-contract.md docs/designs/product-master.contract.md
```

（参照リンクの追随更新も戻す場合は、上記 3 ファイルの `product-master-contract.md` を
`product-master.contract.md` に戻す。）

## 保留リスト（移動しないと判断・ユーザー確認済み）

- **Sprint 1 時代の歴史的文書（計 23 件）** — 現状維持で凍結。
  - `docs/sprints/sprint1-*.md`（9 件）: 現行規約なら `implementation-plans/` / `reviews/` 相当だが、規約制定前の成果物で相互参照が多く、`docs/05-roadmap.md` からも参照される。
  - `docs/tasks/sprint1-*.md`（14 件）: 同様に規約制定前のタスク指示書。
  - 扱いは `docs/09-file-placement-rules.md` §歴史的文書 に明記。

## 移動しない（現状が正と確認済み）

- `.claude/evals/baselines/INDEX-*.md` — baselines/README.md が「results/ 等から名前参照
  されるため改名・移動しない」と明記。現状が正。

## 未了事項

- `.claude/skills/create-codex-brief/SKILL.md` の実例パス 2 行（L35・L37）が移動前の
  パスのまま。保護構成ファイルのため Hook（guard-dangerous）にブロックされ、承認マーカー
  の自動作成も不可。人間が `touch .claude/state/config-change-approved` を実行してから
  更新を再依頼するか、手動で `docs/tasks/codex/` → `docs/tasks/codex/product-master/` に
  書き換える（作業後マーカーは削除）。

## 参考指摘（今回は変更していない気づき）

- `docs/README.md` の本文に「ADR-001〜004 はこのディレクトリ直下」とあるが、実体は
  すべて `docs/decisions/` 配下（リンク自体は正しい）。
- `docs/claude-code/README.md` の一覧表に `codex-delegation-playbook.md` /
  `local-audit-runbook.md` / `workflow-automation-analysis.md` が未掲載。
