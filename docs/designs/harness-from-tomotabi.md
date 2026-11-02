# 設計: Tomotabiで育てたハーネスをCookpitの配布物へ戻す

変更レベル: L3（配布するハーネスの構成と層が変わり、導入先すべてに効くため）。ユーザー承認: 済み（2026-11-02。下の4つの判断はすべて推奨の案Aで承認された）。

| 判断                     | 決定                                |
| ------------------------ | ----------------------------------- |
| 機能の進め方             | 一つのループに置き換える（§1の案A） |
| Devinへの委譲の置き場    | 新しい層`harness-devin`（§2の案A）  |
| 確認のページの画面の撮影 | 外す（§4）                          |
| Liveへの導入             | `git init`して4層を入れる（§7）     |

この文書で決めること: Tomotabiの`.claude/`・`.agents/`・`docs/claude-code/`のどれを、どの層に入れて配るか。何を配らないか。配布物の版と入れ方をどう変えるか。

比べた元: Tomotabi `main`の`2f202e58`と、Cookpit `plugins/`（各0.1.0）。Tomotabiだけにあるファイルは約50、両方にあって中身が変わったファイルは60。

## 1. 機能の進め方を「一つのループ」に置き換える

配布物の`harness-workflow`は今、`orchestrator`が7つの子エージェント（設計・計画・実装・試験設計・振り返りなど）へ渡す形になっている。Tomotabiはこれをやめ、`develop-feature`スキルでメインのセッションが設計から実装まで進め、子エージェントは`reviewer`・`security-reviewer`・広い探索だけにした。`.claude/evals/folded-loop-checklist.md`で、畳んだあとも正しいスキルに届くかを確かめてある。

案:

- A（推奨）: 配布物も一つのループにする。`orchestrator`・`architecture-designer`・`implementation-planner`・`implementer`・`test-designer`と、改善層の`reflection-agent`・`agent-improvement-manager`・`agent-evaluator`を配布物から外す。代わりに`develop-feature`・`implement-change`・`improve-harness`を入れる。`docs/claude-code/`の5本もTomotabi版を元にする。
  - 利点: 文脈を渡し直す手間とトークンが減る。Tomotabiで2か月使った形をそのまま配れる。
  - 欠点: 導入済みの先（Tomotabi以外は無い）で古い子エージェントを呼ぶ指示が残ると届かなくなる。Cookpit本体の`.claude/`は今のorchestrator型のままで、配布物と食い違う。
- B: 両方を配り、導入時に選ばせる。
  - 利点: 古い形も残せる。
  - 欠点: スキルと方針文書が2組になり、直しを2か所に入れることになる。

Cookpit本体の`.claude/`は今回変えない（配布物だけ変える）。

## 2. Devinへの委譲は4つ目の層`harness-devin`にする

Devinへの委譲は、`gh`・Devin CLI・専用クローン・Issueのひな形が要る。Devinを使わないプロダクトには不要なので、既存の3層には混ぜない。

- A（推奨）: 新しい層`harness-devin`。core・workflowの後に任意で入れる。
- B: `harness-workflow`に入れる。入れる層が減るが、Devinを使わない先にもフックと20本近いスクリプトが入る。

`harness-devin`に入れるもの:

- スクリプト: `delegation.mjs`・`delegation-launch.mjs`・`delegation-status.mjs`・`devin-watch.mjs`・`devin-stall-watch.mjs`・`wait-for-pr.mjs`・`wait-for-pr-update.mjs`・`wait-for-devin-pr.mjs`
- フック: `delegation-status.mjs`（SessionStart）・`suggest-pr-watch.mjs`（PostToolUse Bash）
- スキル: `review-devin-pr`、Devinが読む`.agents/skills/devin-workflow`
- ひな形: `.github/ISSUE_TEMPLATE/devin-task.md`、`docs/claude-code/improvements/delegations/README.md`、`.claude/config/delegation-review.json`（`repository`は導入時に埋める）
- 試験: 上のスクリプトとフックのテスト

汎用にするための直し:

- `devin-watch.mjs`の既定のクローン`~/個人開発/devin-work/tomotabi`を、リポジトリ名から作る（`~/devin-work/<リポジトリ名>`）。
- `devin-workflow`のnpmコマンド・`configure-app`・v3の画面確認など、Tomotabiのスタックの話を外し、「`AGENTS.md`の品質コマンドを通す」に置き換える。
- `review-devin-pr`のPR番号つきの実例（#35・#39など）と、Tomotabiの設計書へのリンクを外す。
- `.agents/skills/`は、ほかのスキルへの相対リンクを導入時に張る（Devinは`.agents/skills/`を読むため）。

## 3. 既存の層に足すもの

harness-core:

- `.claude/rules/writing-style.md`（文章の書き方。`shizen-nihongo`の要点の写し）。「Tomotabi」の題などを外す。
- `.claude/lib/harness-time.mjs`（日付をJSTでそろえる）、`.claude/lib/package-manager.mjs`（ロックファイルからnpm/pnpm/yarn/bunを選ぶ。今はpnpm固定）
- `.claude/hooks/precompact-context.mjs`（PreCompact）。SessionEnd・ConfigChangeのフック登録もTomotabiに合わせる。
- 変わった既存ファイル（`guard-dangerous.mjs`・`harness-state.mjs`・`run-quality-gates.sh`ほか）はTomotabi版にする。
- 試験: `harness-time`・`package-manager`・`record-activity`・`run-quality-gates`・`estimate-session-time`・`precompact-context`

harness-workflow:

- `ask-questions`（`SKILL.md`・`template.md`）、`create-requirements-document/checklist.md`
- 確認のページ: `discussion.mjs`・`discussion-page.html`・フック`discussion-status.mjs`・`docs/discussions/README.md`
- `develop-feature`・`implement-change`、`.claude/evals/folded-loop-checklist.md`
- 試験: `discussion`・`record-subagent`・`validate-agent-config`

harness-improvement:

- `improve-harness`。中身が変わった`docs/claude-code/`の2本と各スキル。

## 4. 配らないもの

- 画面の撮影: `v3-screens.mjs`とそのテスト。`discussion.mjs`からv3の画面を撮る機能（`--no-screens`・`--v3-latest`・「v3の版」）を外し、問いの「画面:」の欄も外す。図はmermaidで描く。
- Tomotabiのアプリ用: `.agents/skills/testing-web-ui`、`deploy-integration-workflow.test.mjs`、`.claude/launch.json`
- 記録: `docs/claude-code/improvements/`の候補・評価・委譲の記録・`improvement-backlog.md`、`docs/discussions/`の各機能の記録、`.claude/state/`
- `AGENTS.md`・`CLAUDE.md`の本文。代わりに、ゲートの表・作業の進め方・ツールごとの入口だけを残したひな形を`templates/`に置き、導入後にプロダクトに合わせて書く。
- Codexの入口: 各層の`.codex-plugin/`、配布物の`check-review-coverage.mjs`、`kickoff-session`・`session-briefing.sh`などに残るCodexの記述。

## 5. 入れ方と版

- 各層を0.2.0にする。`harness-devin`は0.1.0から。
- `.claude-plugin/marketplace.json`を、Claude Codeで登録できる形にする（`owner`を足し、`policy`・`interface`を外す）。Tomotabiの`docs/harness-setup.md`に書いた回避が不要になる。
- 導入時に`.claude/settings.json`の`env.HARNESS_NAMESPACE`を`<リポジトリ名>-harness`で入れる（無いときだけ）。`package.json`が無い先でも状態の置き場がほかと混ざらない。
- インストーラーの「差分があるファイルは上書きしない」は変えない。導入済みの先の更新は、今回は対象外（導入済みはTomotabiだけで、Tomotabiは配布元側なので戻す必要がない）。

## 6. 試験

- `plugins/tests/portable-harness.test.mjs`に足す: 4層の一覧のファイルがすべてあること、4層を順に一時リポジトリへ入れてフックが重ならないこと、配布物に`tomotabi`・`v3`・`codex`の文字が無いこと、導入先で`node --test .claude/tests/*.test.mjs`が通ること。
- `pnpm lint`・`pnpm type-check`・`pnpm test`（Cookpit本体の変更は無いので、prettierの対象になる配布物の書式だけが関係する）。

## 7. Liveへの導入

Liveはいま空のディレクトリ。ユーザーの確認を取ってから`git init`し、更新した配布物を（PRのブランチから）4層とも入れる。`AGENTS.md`・`CLAUDE.md`はひな形から作り、プロダクトの中身が決まっていない欄は空のまま残す。Liveのリモートが無いので、Live側はローカルの最初のコミットまでにする（ブランチ名は確認する）。

## 未決事項

- Liveのプロダクトの内容とスタック（`AGENTS.md`の「現在の状態」に書く材料が無い）。
- Liveに置くGitHubのリモートを作るか。

## 実装で足したこと（承認後）

- インストーラーに、`permissions.deny`の既定（秘密ファイルの読み書きの拒否。Tomotabiの`.claude/settings.json`と同じ並び）を足した。`.claude/evals/folded-loop-checklist.md`がこの拒否を前提にしているため。
- `AGENTS.md`・`CLAUDE.md`のひな形は`harness-workflow`の`.claude/templates/`に置いた。リポジトリのルートに直接入れると、既にある先で衝突してインストール全体が止まるため。
- Codex用のマーケットプレイス定義`.agents/plugins/marketplace.json`も消した。
- 配布物のスキル・試験の中の、Tomotabiの設計書・試験計画へのリンクとPR番号の実例を外した。共通受付（管理Issue）の説明は、スクリプト側に実装が残っていないので消した。

## 実装計画と試験

実装の手順は次のとおり。どれも`plugins/`の中で閉じ、Cookpit本体のコードは変えない。

1. Tomotabiのファイルを層ごとに写し、外す子エージェント・Codexの入口を消す。
2. 固有の記述（プロダクト名・v3・旅行の例・PR番号・設計書へのリンク）を一般の言葉に置き換える。
3. `discussion.mjs`から画面の撮影を外し、対応する試験を消す。
4. `harness-devin`の`plugin.json`・`install-manifest.json`・README・導入スキルを作り、インストーラーに`envDefaults`・`permissionsDeny`・`links`を足す。
5. `plugins/tests/portable-harness.test.mjs`に、§6の試験を足す。

試験: `node --test plugins/tests/portable-harness.test.mjs`（6件）と、`pnpm lint`・`pnpm type-check`・`pnpm test`・`prettier --check`。
