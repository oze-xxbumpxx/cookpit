# ハーネス — リポジトリ所有者が行う設定手順

コードでは閉じられない設定をまとめた作業手順。**AI は実行できない**（実行できてしまうと
安全境界にならない）。上から順に、効果の大きい順に並べている。

正典（仕組みの説明）: [harness-state-and-approval.md](./harness-state-and-approval.md)

| #   | 作業                                         | 所要      | 効果                               | 状態      |
| --- | -------------------------------------------- | --------- | ---------------------------------- | --------- |
| 1   | main の branch protection                    | 約 3 分   | **最大**。CI に強制力を与える      | ⬜ 未実施 |
| 2   | ハーネス変更の承認フロー（初回セットアップ） | 約 5 分   | 保護対象を変更できるようにする     | ⬜ 未実施 |
| 3   | CI 側の保護対象差分検証（要 #2）             | 約 30 分  | ローカル境界の破れをサーバ側で検出 | ⬜ 未実施 |
| 4   | 承認発行の OS ユーザー分離                   | 約 1 時間 | 残存リスクの原理的解消             | ⬜ 任意   |

---

## 1. main の branch protection（最優先）

### なぜ必要か

現状 `main` は `protected: false`。この状態では CI は**実行されるだけで何も止めない**。

- 赤い CI のまま PR をマージできる。
- `main` への直 push を止めているのは lefthook（ローカル層）だけで、`--no-verify` や
  別クローンからの push はサーバ側で素通りする。

今回追加した品質ゲート・ハーネステストは、この設定が入って初めて「迂回できない最終ゲート」
になる。**この 3 分の作業の効果が、ハーネス改修全体より大きい。**

### 手順

1. GitHub で `oze-xxbumpxx/cookpit` を開く → **Settings** → **Branches**
2. **Add branch ruleset**（または classic の Add rule）→ 対象を `main` にする
3. 次を有効にする。

   | 設定                                      | 値                             | 理由                                                    |
   | ----------------------------------------- | ------------------------------ | ------------------------------------------------------- |
   | Require a pull request before merging     | ON                             | 直 push を防ぐ                                          |
   | └ Required approvals                      | 0 で可                         | 個人開発のため。レビューは Claude 側で実施済み          |
   | Require status checks to pass             | ON                             | **これが本体**                                          |
   | └ 必須チェック                            | `Quality Gates`<br>`E2E Smoke` | ジョブ名は `.github/workflows/ci.yml` の `name:` と一致 |
   | Require branches to be up to date         | ON                             | 古い base で緑になった PR を防ぐ                        |
   | Do not allow bypassing the above settings | ON                             | 管理者も対象にする（外すと意味が薄れる）                |
   | Allow force pushes                        | OFF                            | 履歴破壊の防止                                          |
   | Allow deletions                           | OFF                            | 同上                                                    |

4. Save changes。

> **注意**: 必須チェック名は PR で一度 CI が走った後でないと候補に出ないことがある。
> その場合は先に PR を 1 本作り、CI 完走後に設定する。

### 完了確認

```bash
# protected: true になっていること
gh api repos/oze-xxbumpxx/cookpit/branches/main --jq '.protected'
```

`gh` を使わない場合は、ブラウザで PR を開き「Merge」ボタンの上に
`Required statuses must pass before merging` が出ることを確認する。

確認できたら [harness-state-and-approval.md](./harness-state-and-approval.md) §7-4 と
§6 の表を「設定済み」に更新する（現在は「強制力なし」と書いてある）。

---

## 2. ハーネス変更の承認フロー（初回セットアップ）

### なぜ必要か

`.claude/` 配下・`CLAUDE.md`・`lefthook.yml`・`.github/workflows/` は保護対象になった。
以後、AI がこれらを変更するには**あなたが発行した承認**が要る。承認は AI が発行できない。

### 初回セットアップ

状態ディレクトリの既定は `~/.local/state/cookpit-harness/`。変更したい場合だけ、シェルの
設定ファイル（`~/.zshrc` 等）へ次を追加する。**リポジトリ配下は指定できない**（拒否される）。

```bash
export HARNESS_STATE_DIR="$HOME/.local/state/cookpit-harness"
```

解決結果の確認:

```bash
node .claude/scripts/harness-run.mjs where
# state dir: /Users/<you>/.local/state/cookpit-harness
# source: home
# trusted: true      ← false なら承認を受け付けない
```

### 承認の出し方（毎回の運用）

AI から「保護対象を変更したいので承認してほしい」と言われたら、**あなたの端末**で実行する。

```bash
# 1. run を開始（未開始なら。承認は runId に束縛される）
node .claude/scripts/harness-run.mjs start

# 2. 承認を発行（確認語 approve の入力を求められる）
node .claude/scripts/harness-approve.mjs --target .claude/hooks/ --ttl-minutes 15
```

`--target` の書き方:

| 書き方           | 意味                                                   |
| ---------------- | ------------------------------------------------------ |
| `.claude/hooks/` | ディレクトリ配下すべて。期限内は複数ファイルへ再利用可 |
| `CLAUDE.md`      | そのファイルのみ。**1 回使うと消費される**             |

取り消し・確認:

```bash
node .claude/scripts/harness-approve.mjs --status   # 現在の承認を表示
node .claude/scripts/harness-approve.mjs --revoke   # 取り消し
```

> **TTY が無い環境（CI・リモート）で承認を出す場合**のみ、out-of-band に
> `HARNESS_APPROVAL_TOKEN` を設定して `--token` を渡す。この値は AI に見せないこと。

### 注意

- 承認は最大 60 分で失効する。作業が終わったら `--revoke` するか、放置して失効させる。
- 旧方式のマーカー `.claude/state/config-change-approved` は**無効**。残っていても効果はない。

---

## 3. CI 側の保護対象差分検証（#2 の完了後）

### なぜ必要か

`guard-dangerous.mjs` は正規表現ベースのため、難読化された書き込みは原理的に検出しきれない
（[harness-state-and-approval.md](./harness-state-and-approval.md) §7-1〜3）。
ローカル境界が破られた場合に**サーバ側で気づける**ようにするのがこの作業。

### 手順

1. あなたの端末で承認を出す。

   ```bash
   node .claude/scripts/harness-run.mjs start
   node .claude/scripts/harness-approve.mjs --target .github/workflows/ --ttl-minutes 30
   ```

2. Claude に「CI に保護対象差分の検証ジョブを追加して」と依頼する。追加内容は、
   PR が保護対象（`PROTECTED_TARGETS`）に触れている場合に:
   - PR 本文またはコミットに承認の出典（日付・承認者・対象）が記載されているかを確認する
   - Job Summary へ変更された保護対象ファイルの一覧を出す
   - `Harness tests` の結果とあわせて必須チェックにする

3. 完了後、承認を取り消す。

   ```bash
   node .claude/scripts/harness-approve.mjs --revoke
   ```

4. #1 の必須チェック一覧に新ジョブ名を追加する。

---

## 4. 承認発行の OS ユーザー分離（任意・将来）

### なぜ必要か

AI と人間が同一 OS ユーザーで任意のシェルを実行できる限り、ファイルベースの承認は
**暗号学的な認証境界にならない**。現在の実装は「事故と安易な自己承認の排除」までで、
悪意ある偽装は防げない。これを原理的に解消する唯一の方法が発行主体の分離。

### 選択肢（どれか 1 つ）

| 方式                  | 内容                                                                         | 向き             |
| --------------------- | ---------------------------------------------------------------------------- | ---------------- |
| A. 別 OS ユーザー     | 状態ディレクトリを別ユーザー所有にし、`harness-approve.mjs` を setgid で実行 | ローカル開発機   |
| B. GitHub Environment | 保護対象変更を deploy job 化し、required reviewers を設定                    | CI 中心の運用    |
| C. 現状維持           | 個人開発・単独利用ならリスク許容                                             | **現時点の推奨** |

Cookpit は個人開発・2 人利用のため、当面は **C（現状維持）** で妥当。
複数人・外部コントリビュータが入る段階になったら A か B を検討する。

---

## 変更履歴

| 日付       | 内容                                             |
| ---------- | ------------------------------------------------ |
| 2026-07-26 | 初版。branch protection 未設定を確認したため作成 |
