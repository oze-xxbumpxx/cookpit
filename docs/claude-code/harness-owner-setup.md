# ハーネス — リポジトリ所有者が行う設定手順

コード変更だけでは有効にできない GitHub 側の安全設定をまとめる。

正典:

- 状態と承認境界: [harness-state.md](./harness-state.md)
- 重要構成の区分: [improvement-cycle.md](./improvement-cycle.md)

| #   | 作業                             | 時期    | 状態                   |
| --- | -------------------------------- | ------- | ---------------------- |
| 1   | GitHub Actions 復旧の実体確認    | 2026-08 | **完了（2026-08-04）** |
| 2   | `main` の branch protection 設定 | #1 の後 | **着手可能**           |
| 3   | PR に構成ファイル差分を可視化    | #2 の後 | 任意                   |
| 4   | 重要構成を PR レビューで扱う     | 毎回    | 運用中                 |

GitHub Actions は復旧済みのため、代替 CI は構築しない。
`.github/workflows/ci.yml` を唯一の CI として扱う。

## 1. GitHub Actions 復旧の実体確認

PR を 1 本作るか `workflow_dispatch` で CI を実行し、緑色の表示だけでなく、次を確認する。

| 確認項目            | 期待値                                                            |
| ------------------- | ----------------------------------------------------------------- |
| `Quality Gates`     | install、lint、type-check、build、test、harness test のログがある |
| Runner              | 実際のランナー名が表示される                                      |
| `pnpm test:harness` | テストが実行され、fail が 0                                       |
| `E2E Smoke`         | skipped ではなく success                                          |
| E2E 判定            | `✓ E2E 判定: 実行済み・全件成功` が出る                           |
| DB 経路             | Job Summary に `pglite` または `neon` が出る                      |

```bash
gh run list --workflow=ci.yml --limit 1
gh run view <run-id> --log
```

3〜5 秒程度で終了し、Runner や各コマンドのログが無い場合は未復旧として扱う。
実体を確認できたら、[harness-state.md](./harness-state.md) の防御層表を更新して #2 へ進む。

### 確認記録（2026-08-04）

| 確認項目            | 結果                                                                   | 出典    |
| ------------------- | ---------------------------------------------------------------------- | ------- |
| `Quality Gates`     | 完走（約 7 分）。install / lint / type-check / build / test のログあり | PR #136 |
| Runner              | 実ランナーで実行（`/home/runner/work/cookpit/cookpit`）                | PR #136 |
| `pnpm test:harness` | 71 件実行・fail 0                                                      | PR #130 |
| `E2E Smoke`         | success（skipped ではない）                                            | PR #136 |
| DB 経路             | `DB_MODE: neon`                                                        | PR #136 |

`E2E 判定` の Job Summary 行は未確認（ログ末尾の範囲で確認できなかった）。

**復旧の判定は所要時間で見分けられる。** 未復旧期（〜2026-07-30）のジョブは 2〜4 秒で
終了し、ログ API も 404 を返した。復旧後は Quality Gates が 1〜7 分、E2E Smoke が
1〜2 分かかる。**同じ「赤」でも基盤停止と実失敗は区別すること**（2026-08-04 に滞留 PR
4 本の赤が全て前者だったと判明した実例がある）。

## 2. `main` の branch protection

Actions が完走した後、GitHub の **Settings → Branches** で `main` を対象に ruleset を追加する。

| 設定                                      | 値                           |
| ----------------------------------------- | ---------------------------- |
| Require a pull request before merging     | ON                           |
| Required approvals                        | 個人開発では 0 で可          |
| Require status checks to pass             | ON                           |
| Required checks                           | `Quality Gates`、`E2E Smoke` |
| Require branches to be up to date         | ON                           |
| Do not allow bypassing the above settings | ON                           |
| Allow force pushes                        | OFF                          |
| Allow deletions                           | OFF                          |

required check の候補は CI が一度完走するまで表示されないため、必ず #1 を先に行う。

確認:

```bash
gh api repos/oze-xxbumpxx/cookpit/branches/main --jq '.protected'
```

`true` になり、失敗した required check がマージを止めることまで確認する。完了後、
[harness-state.md](./harness-state.md) の防御層表と既知の限界を更新する。

## 3. PR に構成ファイル差分を可視化する（任意）

構成ファイル（`.claude/**` / `CLAUDE.md` / `lefthook.yml` / `.github/workflows/`）に触れた場合、
変更ファイル一覧を Job Summary へ出すと見落としを減らせる。Actions 復旧後に追加し、
`Harness tests` とあわせて required check にする。

## 4. 重要構成を変更するときの運用

Agent、Hook、Rule、Skill、`CLAUDE.md` などを変更するときは、専用ブランチへ変更をコミットし、
次を PR に残す。

- 変更理由と範囲
- `pnpm test:harness` と品質ゲートの結果
- Claude Code レビューの結果
- ロールバック方法

承認ファイル、ローカルトークン、期限付きマーカーは使わない。ユーザーが PR の差分を確認し、
マージを決定することを承認境界とする。

## 変更履歴

| 日付       | 内容                                                     |
| ---------- | -------------------------------------------------------- |
| 2026-07-26 | 初版。Actions と branch protection の所有者作業を定義    |
| 2026-07-28 | ファイル承認を撤去し、PR レビュー方式へ移行              |
| 2026-07-29 | 状態 schema v2 と現行の PR 運用へ同期                    |
| 2026-08-04 | Actions 復旧を確認し #1 を完了。確認記録と判別方法を追加 |
