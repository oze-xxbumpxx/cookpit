# Codex Implementation Tasks — bounded-repair-loop

既存 AI 開発ハーネスに「有界修正ループ」（品質ゲート失敗を、コードで強制された上限内で
最大 N 回だけ自動修正する制御機構）を実装するための指示書。**番号順に実行する**（依存順）。

対象は `.claude/` 配下の**ハーネス自身のコード**であり、アプリコード（`apps/` / `packages/`）
ではない。TypeScript ではなく **Node ESM（`.mjs`）** で書き、**新規依存は一切追加しない**
（テストランナーは Node 標準の `node --test`）。

本ブリーフは IMP-2026-025 Phase 2（層別薄化）適用。制御ロジック層のため完成コードの同梱は
最小化し、**公開シグネチャ + 不変条件 + 公開識別子一覧（タイポ照合基準）+ テスト観点**を正本とする。
機械的な定数（上限表・遷移表）のみ完成コードを同梱する。

## この機能の目的（誤解しやすいので最初に読む）

目的は「AI に何度も修正させること」ではない。**修正してよい失敗だけを選び、厳格な上限内で
修正し、進展がなければ早く止めて人間へ返すこと**。修正成功率よりも**安全に停止できること**を
優先する。迷ったら「止める」側に倒す実装を選ぶ。

## タスク一覧

| #   | ファイル                                           | 対象                                                | 概要                                                                  |
| --- | -------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| 0   | [00-prerequisites.md](./00-prerequisites.md)       | `harness-approval.mjs` / `harness-approve.mjs`      | **前提バグ 2 件の修正**（保護判定の穴・ディレクトリ承認）+ 回帰テスト |
| 1   | [01-limits.md](./01-limits.md)                     | `bounded-repair-limits.mjs`                         | 上限の唯一の定義。安全上限 → プロジェクト設定 → タスク設定            |
| 2   | [02-state.md](./02-state.md)                       | `bounded-repair-state.mjs`                          | ループ状態スキーマ・遷移表・不正遷移拒否・CAS・実行中フラグ           |
| 3   | [03-classify.md](./03-classify.md)                 | `bounded-repair-classify.mjs`                       | 決定的な失敗分類 + 正規化フィンガープリント                           |
| 4   | [04-gates.md](./04-gates.md)                       | `bounded-repair-gates.mjs` / `run-quality-gates.sh` | ゲート結果の構造化・秘密情報除去・永続ログ参照                        |
| 5   | [05-diff.md](./05-diff.md)                         | `bounded-repair-diff.mjs`                           | 差分計測・保護対象/高リスク/ゲート弱体化・テスト削除 skip 検出        |
| 6   | [06-loop-cli.md](./06-loop-cli.md)                 | `bounded-repair-loop.mjs` / `bounded-repair.mjs`    | 開始条件・終了判定・構造化報告 + CLI                                  |
| 7   | [07-hook-enforcement.md](./07-hook-enforcement.md) | `guard-dangerous.mjs` / docs                        | 上限超過後の編集を Hook で deny + 正典ドキュメント                    |

Task 0 は Task 1 以降と独立に検証できる。Task 1〜5 は相互に独立（並行実行しても良いが、
1 タスク = 1 セッションを守る）。Task 6 は 1〜5 に依存。Task 7 は 2・6 に依存。

## 実装してはいけないもの（スコープ外・明示）

以下は**今回実装しない**。指示書に無い機能を足さないこと。

- Graph フレームワーク / マルチエージェント / Supervisor / 並列実装 / AI レビューエージェント
- 自律的なタスク分割 / LLM だけによる失敗分類 / 無制限の再計画
- 自動デプロイ / 本番環境の自動変更 / DB マイグレーションの自動実行 / 外部システムへの破壊的操作
- 品質ゲートの弱体化・テストの削除や skip による合格・`continue-on-error` による失敗隠蔽
- `.github/workflows/` の変更（**不要**。`pnpm test:harness` が `.claude/tests/*.test.mjs` を
  グロブで自動収集するため、新規テストは追記なしで CI に載る）
- 既存 `run-state.json` のスキーマ変更（U1 参照）
- 新規 npm 依存の追加（`package.json` の `dependencies` / `devDependencies` を変更しない）

## 確定値表（設計判断はすべて確定済み。実装中に変更しない）

| ID     | 確定内容                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U1     | ループ状態は**新規ファイル** `<stateDir>/bounded-repair-state.json`（`schemaVersion: 1`）。既存 `run-state.json` とその `validateRunState`（未知フィールドを拒否する）は**一切変更しない**。両者は `runId` で紐づける                                                                                                                                                                                       |
| U2     | **トークン数・利用料金は取得手段が存在しない**（本リポジトリに Anthropic SDK も `claude -p` 呼び出しも無い）。`inputTokens` / `outputTokens` / `estimatedCost` は **`null`** とし、`budgetSupport: { tokens: 'unsupported', cost: 'unsupported' }` を状態に持つ。**0 を保存して「予算内」と判定することは禁止**。上限チェックは「unsupported なら当該上限を評価対象外にし、代替の回数・時間上限で必ず縛る」 |
| U3     | モデル呼び出し数は観測できないため、**`authorize` が修正許可を 1 件発行した時点で 1 回計上**する（発行＝消費）。呼び出し後の実測値で補正しない                                                                                                                                                                                                                                                              |
| U4     | 上限の初期値と安全上限は [01-limits.md](./01-limits.md) の表が唯一の正典。**複数ファイルへハードコードしない**                                                                                                                                                                                                                                                                                              |
| U5     | 同一失敗フィンガープリントが **2 回連続**したら `needs_human_review` で停止（`maxConsecutiveSameFailure: 1`）                                                                                                                                                                                                                                                                                               |
| U6     | 状態遷移は [02-state.md](./02-state.md) の遷移表のみ許可。`completed` / `failed` / `budget_exceeded` / `unsafe_change_detected` から `repairing` へは**戻せない**                                                                                                                                                                                                                                           |
| U7     | 二重実行防止は 3 重: 既存 `withLock`（O_EXCL）+ `stateVersion` の compare-and-swap + `lease`（実行中フラグ + 有効期限）。ロック取得失敗時は**別のループを開始せず停止**                                                                                                                                                                                                                                     |
| U8     | 孤児ロック・孤児 lease は **mtime / `expiresAt` 基準で 30 秒**経過後に回収（既存 `withLock` の `LOCK_STALE_MS` を踏襲）。内容ベースの年齢判定はしない（既存コードのコメント参照）                                                                                                                                                                                                                           |
| U9     | フィンガープリントは **SHA-256（`node:crypto`）の先頭 16 hex**。材料と正規化規則は [03-classify.md](./03-classify.md)                                                                                                                                                                                                                                                                                       |
| U10    | 自動修正可能な失敗種別は **`lint_failure` / `format_failure` / `typecheck_failure` / `unit_test_failure` / `build_failure` の 5 種のみ**。他はすべて安全停止                                                                                                                                                                                                                                                |
| U11    | 品質ゲートは `run-quality-gates.sh` を**子プロセスとして呼ぶ**。ゲート定義を複製しない（弱体化と乖離を防ぐ）。同スクリプトへの変更は「構造化結果の追記」のみで、**標準出力と終了コードは変えない**（後方互換）                                                                                                                                                                                              |
| U12    | E2E は既定 `requireE2E: false`（ローカルでは実行しない）。`--require-e2e` 指定時のみ必須とし、その場合は既存 `assert-e2e-results.mjs` の `evaluate()` を再利用して判定する。**`not_run` / 実行 0 件を `completed` にしない**                                                                                                                                                                                |
| U13    | 秘密情報（`.env` の値・トークン・接続文字列・Cookie・`Authorization` ヘッダ）は状態・ログ・報告のいずれにも保存しない。ゲートログ全文は永続領域のログファイルへ置き、状態には `logReference`（パスと行範囲）だけを持つ                                                                                                                                                                                      |
| U14    | CLI は `node .claude/scripts/bounded-repair.mjs <start\|status\|authorize\|record-repair\|gates\|resume\|cancel\|report>`                                                                                                                                                                                                                                                                                   |
| U15    | `resume` は**中断された同一ステップの安全な再開のみ**。終了済み（`completed` / `failed` / `budget_exceeded` / `unsafe_change_detected` / `needs_human_review`）の run は再開しない。上限の引き上げ・停止解除は CLI から不可能にする                                                                                                                                                                         |
| U16    | テストは `node:test` + `node:assert/strict`、`.claude/tests/bounded-repair-*.test.mjs`。**一時ディレクトリ・モックモデル・モックツール・モック品質ゲート**を使い、実ユーザー状態・外部環境・実 API を触らない                                                                                                                                                                                               |
| モデル | **Codex モデル / reasoning effort**: ＿＿＿＿（実装完了時に実際に使った値をこの行に記入し、`docs/reviews/bounded-repair-loop.md` と metrics YAML の `codex:` に同じ値を記録する）                                                                                                                                                                                                                           |

## 前提と既知の制約（隠さない）

1. **Task 0 は他のタスクの前提**。現状の `isProtectedPath()` は保護対象ディレクトリ**自身**を
   保護と判定しないため、`rm -rf .claude/lib` / `mv .claude/tests /tmp/gone` が Hook を素通りする
   （実測で確認済み）。この穴を塞がずに Task 5 の差分検査を作ると、**「テストディレクトリごと
   削除してゲートを通す」というループが最優先で止めるべき挙動を「保護対象に触れていない」と
   誤判定する**。必ず Task 0 を先に完了させる。
2. **GitHub Actions が実行されていない**（2026-07-26 時点で 295 実行すべて 1〜5 秒で failure、
   `runner_id: 0`。ジョブは生成されるので YAML は正しく、runner 割り当て側の問題）。
   したがって本実装のテストは**ローカルでのみ実効**であり、サーバ側のバックストップは無い。
   これは環境側の既知リスク（`docs/claude-code/harness-state-and-approval.md` §7-4）で、
   **Codex 側で解決を試みないこと**（代替 CI を作らない方針）。
3. run 状態が未作成の場合がある（`node .claude/scripts/harness-run.mjs start` で作成）。
   ループは run 状態が読めなければ**開始せず停止**する（fail-closed）。

## 完了条件（全タスク通し）

```bash
pnpm test:harness   # 全 green（既存 86 件 + 新規テストすべて）
pnpm lint           # 全 green
pnpm type-check     # 全 green
pnpm test           # 全 green（既存アプリテストに regression なし）
```

- 既存 86 件のハーネステストに regression がないこと（**既存テストを書き換えて通すのは禁止**。
  既存テストが落ちたら実装側を直す）
- 各タスクの完了条件チェックリストが全て満たされていること
- 上限・同一失敗・未知の失敗・高リスク変更・不正遷移・二重実行の**異常系テストが存在**すること
- **作業ブランチでのみコミットする**（main 直コミット禁止。lefthook がブロックする）
- `package.json` に依存が追加されていないこと（`git diff package.json pnpm-lock.yaml` が空）

## 参照ドキュメント

- ハーネスの状態・承認の正典: `docs/claude-code/harness-state-and-approval.md`
- コーディング規約: `.claude/rules/coding-standards.md`
- Codex レビューチェックリスト: `docs/06-ai-tools.md`
- 既存実装（読んで作法を合わせる）: `.claude/lib/harness-state.mjs` / `harness-paths.mjs` /
  `harness-approval.mjs`、`.claude/tests/harness-state.test.mjs`
