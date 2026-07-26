# ハーネス — リポジトリ所有者が行う設定手順

コードでは閉じられない設定をまとめた作業手順。**AI は実行できない**（実行できてしまうと
安全境界にならない）。上から順に、効果の大きい順に並べている。

正典（仕組みの説明）: [harness-state-and-approval.md](./harness-state-and-approval.md)

| #   | 作業                                         | 時期     | 所要      | 効果                                  | 状態      |
| --- | -------------------------------------------- | -------- | --------- | ------------------------------------- | --------- |
| 0   | 再監査の修正パッチ適用                       | —        | 完了      | 待機期間中の唯一の層を healthy にした | ✅ 完了   |
| 1-A | Actions 復旧の確認                           | 2026-08  | 約 5 分   | CI が実際に動くことの検証             | ⬜ 待機中 |
| 1-B | main の branch protection                    | 1-A の後 | 約 3 分   | CI に強制力を与える                   | ⬜ 待機中 |
| 2   | ハーネス変更の承認フロー（初回セットアップ） | 今すぐ   | 約 5 分   | 保護対象を変更できるようにする        | ⬜ 未実施 |
| 3   | CI 側の保護対象差分検証（要 #2）             | 1-B の後 | 約 30 分  | ローカル境界の破れをサーバ側で検出    | ⬜ 待機中 |
| 4   | 承認発行の到達可能な経路                     | 今すぐ〜 | 約 1 時間 | ロックアウトの解消                    | ⬜ 未実施 |

> **方針**: GitHub Actions は 2026-08 に復旧見込みのため、**代替 CI は構築しない**。
> `.github/workflows/ci.yml` を唯一の CI として扱う。
>
> **待機期間中の実効的な安全境界はローカルの `guard-dangerous.mjs` 1 層だけ**である。
> #0（2026-07-26 完了）でその層の既知の穴を塞いだため、現在は健全な状態にある。
> 次にハーネスを変更するときは、この層を壊していないか `pnpm test:harness` で確認すること。

---

## 0. 再監査の修正パッチ適用（✅ 2026-07-26 完了）

再監査で発見した Critical / High 欠陥 4 件を修正済み（コミット `4cd9774`）。

| ID    | 欠陥                                                                         | 修正                                                   |
| ----- | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| R-001 | `toRepoRelative` が正規化せず、`.claude/./hooks/` 等で保護対象を素通りできた | `path.resolve` による正規化 + 大文字小文字非依存の照合 |
| R-003 | `node -e` / `python -c` がリテラルの保護対象パスを含んでも素通りしていた     | インライン実行を検出して拒否                           |
| R-004 | `updateRunState` の read-modify-write がロック外で、並行更新が無言で消えた   | ロック区間に収め、関数形式でのマージに対応             |
| R-005 | project root 不在時に状態解決が誤って失敗し、復旧を壊していた                | root 実在時のみ realpath を取る                        |

適用後の検証（実コードに対して実施）:

- ハーネステスト **86/86**（適用前 75/75）
- 攻撃スイート **31/31 期待どおり** — 前回突破した 11 件をすべて拒否、通常操作 10 件は許可のまま
- 6 プロセス並行更新で**失われた更新なし**
- project root 不在でも状態解決に成功
- 全品質ゲート（harness / lint / type-check / build / format-check / test）**PASS**

> AI は保護境界により適用できず、人間が自分の端末で `git apply` した。
> この経緯が §4 のロックアウト（R-007）の実例である。

---

## 1-A. Actions 復旧の確認（2026-08）

### なぜ必要か

2026-07-26 時点で、GitHub Actions は**ジョブを実行していない**。直近 32 実行がすべて
3〜5 秒で failure し、`runner_id` は 0。本ハーネス改修以前から同じ状態のため、
`Harness tests` も `assert-e2e-results.mjs` も一度も動作していない。

環境側の一時的な制約であり 2026-08 に解消見込みだが、**復旧したことを「緑になった」
だけで判断してはいけない**。何も実行せずに success になる状態と区別がつかないため
（`E2E Smoke` の偽の成功と同じ失敗パターン）。

### 確認手順

PR を 1 本作るか、`workflow_dispatch` で `CI` を手動実行し、次を**すべて**確認する。

| 確認項目                          | 期待値                                                      | 未復旧なら     |
| --------------------------------- | ----------------------------------------------------------- | -------------- |
| `Quality Gates` の実行時間        | **30 秒以上**（install + lint + type-check + build + test） | 3〜5 秒        |
| ジョブの Runner 欄                | ランナー名が表示される                                      | 空             |
| ログに `pnpm test:harness` の出力 | `# pass 86`（パッチ適用後）が出る                           | ログ自体が無い |
| `E2E Smoke` の conclusion         | `success`（skipped ではない）                               | skipped        |
| E2E ログの最終行                  | `✓ E2E 判定: 実行済み・全件成功`                            | 出ない         |
| E2E の DB 経路サマリ              | Job Summary に `pglite` または `neon`                       | 出ない         |

```bash
# 実行時間とランナーの確認（gh がある場合）
gh run list --workflow=ci.yml --limit 1
gh run view --log | grep -E "pass 86|E2E 判定"
```

すべて確認できたら、[harness-state-and-approval.md](./harness-state-and-approval.md) の
§6 の表と §7-4 を「復旧済み」に更新し、§1-B へ進む。

---

## 1-B. main の branch protection（1-A の後）

### なぜ必要か

`main` は `protected: false`（2026-07-26 に GitHub API で確認）。この状態では
Actions が復旧しても CI は**実行されるだけで何も止めない**。

- 赤い CI のまま PR をマージできる。
- `main` への直 push を止めているのは lefthook（ローカル層）だけで、`--no-verify` や
  別クローンからの push はサーバ側で素通りする。

品質ゲート・ハーネステストは、この設定が入って初めて「迂回できない最終ゲート」になる。

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

> **注意**: 必須チェック名は CI が一度**完走**した後でないと候補に出ない。
> §1-A を先に済ませること（未復旧の状態では候補に現れない）。

### 完了確認

```bash
# protected: true になっていること
gh api repos/oze-xxbumpxx/cookpit/branches/main --jq '.protected'
```

`gh` を使わない場合は、ブラウザで PR を開き「Merge」ボタンの上に
`Required statuses must pass before merging` が出ることを確認する。

確認できたら [harness-state-and-approval.md](./harness-state-and-approval.md) §7-5 と
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

## 4. 承認発行の到達可能な経路（任意ではなくなった）

### なぜ必要か

**2 つの問題が同じ場所に出ている。**

**(a) ロックアウト（実際に発生済み）** — 承認発行（`harness-approve.mjs`）は TTY か
out-of-band トークンを要求する。リモートの Claude Code セッションでは人間が同一環境に
端末を持たないため、**誰も承認を発行できない**。2026-07-26 の再監査では、保護対象に
Critical な欠陥（R-001）を見つけたにもかかわらずその場で塞げず、修正を検証済みパッチとして
リポジトリへ保全し、**人間が自分の端末で `git apply` して初めて適用できた**（§0）。

fail-closed 設計自体は正しい。欠けていたのは「安全側に倒れたあと誰がどう戻すか」である。

**(b) 認証境界としての限界** — AI と人間が同一 OS ユーザーで任意のシェルを実行できる限り、
ファイルベースの承認は暗号学的な認証境界にならない。変数分割・base64 による難読化は
修正後も通過する（再監査で実証）。

(a) は運用が止まる問題、(b) は悪意への耐性の問題。**優先すべきは (a)。**

### 選択肢（どれか 1 つ）

| 方式                  | 内容                                                                         | 向き             |
| --------------------- | ---------------------------------------------------------------------------- | ---------------- |
| A. 別 OS ユーザー     | 状態ディレクトリを別ユーザー所有にし、`harness-approve.mjs` を setgid で実行 | ローカル開発機   |
| B. GitHub Environment | 保護対象変更を deploy job 化し、required reviewers を設定                    | CI 中心の運用    |
| C. 現状維持           | 個人開発・単独利用ならリスク許容                                             | **現時点の推奨** |

**推奨は B**。(a) と (b) を同時に解消でき、リモートセッション中でもブラウザから承認できる。
Actions 復旧（§1-A）が前提になるため、それまでは A か、下記の暫定運用で凌ぐ。

| 案                    | (a) ロックアウト解消         | (b) 認証境界 | 前提                 |
| --------------------- | ---------------------------- | ------------ | -------------------- |
| A. 別 OS ユーザー     | ローカルのみ解消             | 解消         | 開発機での作業が前提 |
| B. GitHub Environment | **解消**（ブラウザで承認可） | 解消         | Actions 復旧（§1-A） |
| C. 現状維持           | **未解消**                   | 未解消       | —                    |

### 暫定運用（Actions 復旧まで）

保護対象の修正が必要になったら、次のいずれかで対応する。

1. **開発機で適用** — リモートセッションは検証済みパッチをリポジトリ内の一時パス
   （例 `docs/claude-code/pending/`）へ出力してコミットし、人間が手元で `git apply` →
   検証 → 一時パスを削除して push する。**2026-07-26 の R-001 修正で実際に使った方法**。
   `guard-dangerous.mjs` は Claude Code の Hook なので、人間の端末での操作は傍受しない
   （承認の発行は不要）。
2. **`HARNESS_APPROVAL_TOKEN` を事前設定** — 開発機のシェル設定へ入れておけば、
   その端末からは TTY なしでも発行できる。**この値を AI へ渡さないこと**
   （渡した時点で自己承認が可能になり、境界が消える）。

いずれも「人間が端末を持っている」ことが前提で、リモートセッション単独では解決しない。
これが B を推奨する理由。

---

## 変更履歴

| 日付       | 内容                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-26 | 初版。branch protection 未設定を確認したため作成                                                                           |
| 2026-07-26 | 再監査を反映。#0（pending パッチ適用）を最優先で追加。#1 を 1-A（Actions 復旧確認）と 1-B（protection）へ分割。#4 を必須化 |
