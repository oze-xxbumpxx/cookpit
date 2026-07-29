# ハーネスの状態管理と承認境界

ハーネスの実行状態と、重要な構成変更を扱う手順の正典。

## 1. 原則

- 実行状態は Git 管理外のユーザー状態ディレクトリへ保存する。
- 破壊的操作・秘密情報・Hook 回避は `guard-dangerous.mjs` で即時に拒否する。
- Agent、Hook、Rule、Skill、`CLAUDE.md` などの重要構成は、**人間の明示承認と PR レビュー**
  を承認境界にする。
- ファイルやトークンによるローカル承認は使わない。同一 OS ユーザーで任意のシェルを実行できる
  環境では認証境界にならず、リモート環境では正規の修復まで止めるため。

## 2. 状態の保存先

`.claude/lib/harness-paths.mjs` が次の順に保存先を解決する。

1. `HARNESS_STATE_DIR`（絶対パス必須、リポジトリ配下は拒否）
2. `XDG_STATE_HOME/cookpit-harness`（同上）
3. `~/.local/state/cookpit-harness`
4. `<repo>/.claude/state`（永続性のない最終フォールバック）

シンボリックリンクで実体がリポジトリ配下へ戻る指定も拒否する。ディレクトリは `0700`、
状態ファイルは `0600` で作成する。

```bash
node .claude/scripts/harness-run.mjs where
node .claude/scripts/migrate-state.mjs --dry-run
node .claude/scripts/migrate-state.mjs
```

`migrate-state.mjs` は旧 `.claude/state/` の元データを削除せず、移行先に既存ファイルがある場合も
上書きしない。廃止済みの承認マーカーと承認ログは移行対象外。

## 3. run 状態

`<stateDir>/run-state.json` は `schemaVersion: 2`。一時ファイルへの書き込み、`fsync`、`rename`
による原子的書き込みと排他ロックで、部分書き込みと同時更新による消失を防ぐ。

```json
{
  "schemaVersion": 2,
  "runId": "run-...",
  "taskId": "",
  "phase": "planning | implementing | gates | blocked | completed | failed",
  "status": "active | completed | failed",
  "changedFiles": [],
  "gateResults": {},
  "startedAt": "ISO 8601",
  "updatedAt": "ISO 8601",
  "attempt": 0,
  "maxAttempts": 0,
  "lastFailureFingerprint": null
}
```

`attempt`、`maxAttempts`、`lastFailureFingerprint` は将来の有界修正ループ用の予約フィールドで、
現時点では値を解釈しない。未知フィールド、不正な列挙値、非 ISO 8601 の日時は拒否する。

schema v1 は読み込み時に v2 へ移行する。`approvalStatus` は削除し、
`waiting_for_approval` は `phase=blocked`、`status=active` へ変換する。次回更新時に v2 で保存される。

主な操作:

```bash
node .claude/scripts/harness-run.mjs start --task-id <id>
node .claude/scripts/harness-run.mjs show
node .claude/scripts/harness-run.mjs set --phase gates --status active
node .claude/scripts/harness-run.mjs gate --name lint --result pass
```

状態へ秘密情報を保存しない。`changedFiles` はパス、`gateResults` はゲート名と結果だけを扱う。

## 4. 重要構成の承認手順

重要構成の範囲は [improvement-cycle.md](./improvement-cycle.md) の「承認境界」を正典とする。
変更時は次の順序を守る。

1. 変更理由、対象、差分または実施内容、リスク、ロールバック方法を提示する。
2. ユーザーが対象範囲を明示承認する。
3. 専用の作業ブランチで、承認された範囲だけを変更する。
4. `pnpm test:harness` と対象に応じた品質ゲートを通す。
5. Claude Code のレビューを受け、重大な指摘を解消する。
6. PR に承認の出典、変更範囲、検証結果を残す。
7. ユーザーが差分を確認し、マージを決定する。

承認前は提案書や差分の作成までに留め、重要構成を直接変更しない。承認は
`.claude/state/` のマーカーではなく、会話と PR の履歴で追跡する。

## 5. 防御層と現在の強制力

| 層                          | 役割                                                | 現在の位置づけ         |
| --------------------------- | --------------------------------------------------- | ---------------------- |
| `.claude/settings.json`     | Claude Code の秘密情報・危険コマンド権限を deny     | ローカルで有効         |
| `guard-dangerous.mjs`       | 破壊的操作、秘密情報、Hook 回避を拒否               | ローカルで有効         |
| `validate-agent-config.mjs` | Agent / Skill / 設定の構文・整合性を検証            | ローカルで有効         |
| lefthook                    | format、lint、type-check、test、main 直コミット防止 | 明示的な回避は可能     |
| Claude Code review          | 構成と実装の独立レビュー                            | コミット前に必須       |
| GitHub Actions              | サーバー側の品質ゲート                              | 2026-08 の復旧確認待ち |
| branch protection           | PR と required checks の強制                        | Actions 復旧後に設定   |

Actions と branch protection が揃うまでは、サーバー側の強制力がない。現在の安全性は、
ローカルガード、ユーザーの明示承認、専用ブランチ、レビュー、手動のマージ判断に依存する。

## 6. 既知の限界

1. 正規表現ベースのコマンド検査は、任意シェルに対する完全なセキュリティ境界ではない。
2. 同一 OS ユーザーが変更できるファイルや環境変数は、人間性を証明する認証要素にならない。
3. リポジトリ内の状態フォールバックは、環境破棄後の永続性を保証しない。
4. Actions 停止中は CI が実行されず、branch protection 未設定では失敗した CI もマージを止めない。
5. PR レビュー方式は個人開発における判断記録と事故防止の境界であり、組織的な職務分離ではない。

Actions 復旧後の設定手順は
[harness-owner-setup.md](./harness-owner-setup.md) を参照する。

## 7. 関連ファイル

| ファイル                                  | 役割                                          |
| ----------------------------------------- | --------------------------------------------- |
| `.claude/lib/harness-paths.mjs`           | 状態ディレクトリの解決                        |
| `.claude/lib/harness-state.mjs`           | schema、検証、ロック、原子的書き込み、v1 移行 |
| `.claude/scripts/harness-run.mjs`         | run 状態の CLI                                |
| `.claude/scripts/migrate-state.mjs`       | 旧状態の非破壊移行                            |
| `.claude/hooks/guard-dangerous.mjs`       | 危険操作・秘密情報・Hook 回避の拒否           |
| `.claude/hooks/validate-agent-config.mjs` | 構成の構文・整合性検証                        |
| `.claude/tests/*.test.mjs`                | ハーネスの回帰テスト                          |
| `docs/claude-code/improvement-cycle.md`   | 重要構成と承認区分の正典                      |
