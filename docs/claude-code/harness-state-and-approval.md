# ハーネスの状態永続化と安全境界

実行状態・品質ゲート結果・危険操作のガードを、**コードで強制される形**で扱うための正典。
自然言語のルールではなく、`.claude/lib/` のモジュールと `.claude/tests/` のテストが実体。

> **2026-07-28 の変更**: 保護ファイルの人間承認層を撤去した。構成ファイル変更の承認境界は
> **PR レビュー**が担う。理由と経緯は §5。run 状態（§2・§3）は現役で稼働している。
> 実体（`harness-approval.mjs` / `harness-approve.mjs` / 対応テスト・計 844 行）は同日削除済み。

## 1. 前提と限界（最初に読むこと）

AI と人間が**同一 OS ユーザー**で任意のシェルを実行できる環境では、ファイルベースのガードは
**暗号学的な認証境界にならない**。本仕組みが提供するのは次の 1 点であり、それ以上ではない。

- 事故・手順の省略・危険操作を**決定論的に排除する**こと。

完全な分離が必要なら、境界を別 OS ユーザー・別ホスト・CI の承認ゲートへ移す必要がある。
残存リスクは §6 に列挙する。

## 2. 状態の保存先

| 種類                   | 置き場所               | 例                                               |
| ---------------------- | ---------------------- | ------------------------------------------------ |
| リポジトリ（Git 管理） | 定義・ロジック・テスト | 状態スキーマ / ゲート定義 / テスト / 本文書      |
| 永続領域（Git 管理外） | 実行時データ           | run 状態 / ゲート結果 / 活動ログ / Subagent ログ |

保存先の解決順（`.claude/lib/harness-paths.mjs` の `resolveStateDir`）:

1. `HARNESS_STATE_DIR`（絶対パス必須・**リポジトリ配下は拒否**）
2. `XDG_STATE_HOME/cookpit-harness`（同上）
3. `~/.local/state/cookpit-harness`
4. 最終手段: `<repo>/.claude/state`（`trusted: false`）

シンボリックリンクで実体がリポジトリ配下へ戻る指定は `symlink_into_repo` として拒否する。
ディレクトリは `0700`、状態ファイルは `0600` で作成する。

確認コマンド:

```bash
node .claude/scripts/harness-run.mjs where     # 解決結果と trusted 状態
node .claude/scripts/migrate-state.mjs         # 旧 .claude/state/ から冪等に移行（元は消さない）
```

> 旧 `.claude/state/activity-log.jsonl` が残っている場合、それは移行前の残骸であり
> 更新されない。現在の書き込み先は `harness-run.mjs where` の出力先。

## 3. run 状態

`<stateDir>/run-state.json`（`schemaVersion: 1`）。原子的書き込み（一時ファイル → fsync → rename）
とロックで、部分書き込み・同時更新の破損を防ぐ。

```json
{
  "schemaVersion": 1,
  "runId": "run-...",
  "taskId": "",
  "phase": "planning | implementing | gates | blocked | completed | failed",
  "status": "active | waiting_for_approval | completed | failed",
  "changedFiles": [],
  "gateResults": {},
  "approvalStatus": "not_required | pending | approved | rejected | expired",
  "startedAt": "ISO 8601",
  "updatedAt": "ISO 8601",

  "attempt": 0,
  "maxAttempts": 0,
  "lastFailureFingerprint": null
}
```

> `attempt` / `maxAttempts` / `lastFailureFingerprint` は**将来の有界修正ループ用の予約**。
> 現在どのコードもこの値を解釈せず、自動修正は一切行わない。
> `approvalStatus` は承認層の撤去後も**スキーマ互換のため残している**が、常に
> `not_required` であり参照されない。

未知フィールド・列挙値外・非 ISO 8601 のタイムスタンプはすべて拒否する（`validateRunState`）。
`.tmp-` 接頭辞の中断ファイルは正式な状態として読まない。

秘密情報は保存しない。`changedFiles` はパス、`gateResults` はゲート名と結果のみ。

## 4. guard-dangerous が止めるもの

`.claude/hooks/guard-dangerous.mjs`（PreToolUse）が deny するのは次の 3 系統だけ。
**読み取り・調査は妨げない。構成ファイルの変更も妨げない。**

| 系統             | 例                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 破壊的・本番影響 | `git push --force` / `git reset --hard` / `publish` / `terraform apply` / `serverless deploy` / `rm -rf` で `/` `~` `$HOME` `*` `.` `..` を対象 |
| 秘密情報         | `.env` / `*.pem` / `id_rsa` / `.npmrc` / `secrets/` / `credentials/` / `.aws/credentials` の読み取り・`printenv`                                |
| Hook 回避        | `--no-verify` / `LEFTHOOK=0` / `HUSKY=0` / `SKIP=` 前置 / `git config core.hooksPath`                                                           |

## 5. 承認境界は PR レビュー

構成ファイル（`CLAUDE.md` / `.claude/agents/**` / `.claude/hooks/**` / `.claude/skills/**` /
`.claude/rules/**` / `.claude/settings.json` ほか）の変更は、**作業ブランチへコミットし
PR レビューで人間が確認する**。`main` へ直接反映しない。

### なぜ機械的な承認層をやめたか

2026-07-28 まで、これらは `harness-approve.mjs` が発行する承認ファイルを Hook が検証する
方式で強制していた。撤去した理由は 2 つ。

1. **個人開発では承認する人とされる人が同一**で、儀式が実質的な検証になっていない。
2. **承認ファイルは実行中コンテナ内**に置かれる。リモートのエフェメラル環境では人間が
   同一環境に端末を持たないため承認を発行できず、**ハーネスが自分自身の修正を恒久的に
   拒否する**デッドロックを生んでいた。IMP-2026-029 で 3 回再発し、2026-07-27 に
   4 回目を実証（guard が guard 自身の修正をブロックした）。

fail-closed 設計自体は正しかったが、「安全側に倒れたあと誰がどう戻すか」が設計されて
いなかった。PR レビューは、リモート・ローカルのどちらからでも到達でき、記録も残る。

> **実効性の前提**: PR レビューを境界にする以上、その強制力は branch protection と CI に
> 依存する。Actions が課金停止で不動作の間、実質的な境界は「マージ前の目視」のみになる
> （§6-2 / §6-3）。

## 6. 残存リスク（隠さず記録する）

1. **同一 OS ユーザーの難読化**: コマンド文字列を base64・変数展開・間接実行で組み立てれば、
   正規表現ベースの deny は原理的に回避できる。網羅の保証はない。

2. **GitHub Actions が実行されていない（課金停止・2026-08 に解消見込み）**:
   直近の CI 実行はすべて 2〜5 秒で failure し、ジョブログは存在しない（HTTP 404）。
   `main` の実行も同様。つまり `Harness tests` も `assert-e2e-results.mjs` も動作していない。
   根本原因は GitHub Actions の課金停止（ユーザーが Actions 画面で確認済み）。
   **代替 CI は構築しない方針**（`.github/workflows/ci.yml` を唯一の CI として扱う）。

   復旧の確認手順は [harness-owner-setup.md](./harness-owner-setup.md) §1-A。
   **「緑になった」ことだけで復旧と判断しない** — 実行時間とログの実体を確認する
   （何も実行せず success になる状態と区別できないため）。

3. **branch protection が未設定**: `main` が `protected: false` で required check が無い。
   Actions が復旧しても**赤い CI のままマージできる**。`main` への直 push を止めるのは
   lefthook の `branch-guard` だけで、別クローンからの push はサーバ側で止まらない。
   承認境界を PR レビューへ移したことで、この設定の重要度は**上がっている**。
   手順は [harness-owner-setup.md](./harness-owner-setup.md) §1-B。

4. **（解消済み）保護境界を修復する手段が環境内に存在しない**: 2026-07-26 の再監査で発見し、
   2026-07-28 の承認層撤去（§5）で解消した。記録として残す。

## 7. ローカル Hook と CI の役割分担

| 層                                 | 役割                                                                                    | 迂回可能性                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| lefthook（pre-commit / pre-push）  | 早期フィードバック（format / lint / type-check / harness テスト / main 直コミット防止） | `--no-verify` / `LEFTHOOK=0` で外せる（**人間の明示操作**として許容） |
| PreToolUse Hook（guard-dangerous） | AI の操作に対する即時ガード（§4 の 3 系統）                                             | 同一 OS ユーザーの難読化には限界あり（§6-1）                          |
| PR レビュー                        | 構成ファイル変更の承認境界（§5）                                                        | branch protection 未設定のため現状は目視のみ（§6-3）                  |
| GitHub Actions                     | 最終ゲート（**課金停止で不動作** — §6-2）                                               | 復旧・protection 設定後は迂回不能                                     |

## 8. 関連ファイル

| ファイル                                 | 役割                                         |
| ---------------------------------------- | -------------------------------------------- |
| `.claude/lib/harness-paths.mjs`          | 状態ディレクトリの解決・リポジトリ配下の拒否 |
| `.claude/lib/harness-state.mjs`          | run 状態スキーマ・原子的書き込み・ロック     |
| `.claude/scripts/harness-run.mjs`        | run 状態の作成・参照・更新                   |
| `.claude/scripts/migrate-state.mjs`      | 旧 `.claude/state/` からの冪等移行           |
| `.claude/scripts/assert-e2e-results.mjs` | E2E の未実行・0 件を成功扱いにしない検証     |
| `.claude/hooks/guard-dangerous.mjs`      | PreToolUse での deny（§4）                   |
| `.claude/tests/*.test.mjs`               | 上記の回帰テスト（`pnpm test:harness`）      |
