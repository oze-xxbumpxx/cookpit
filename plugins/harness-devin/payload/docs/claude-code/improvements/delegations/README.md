# 委譲の記録（Issue → Devin → PR）

Devinに渡したIssueごとに1ファイル（`<Issue 番号>.yml`）を置く。DevinがIssueなしで自分から出したPRは`pr-<PR 番号>.yml`
。並行PRでも衝突しないよう、1つのファイルに追記しない。
使う手順は`.claude/skills/review-devin-pr/SKILL.md`。

## 記録の作り方

手で編集せず、`.claude/scripts/delegation.mjs`を使う（形が崩れると集計で読めなくなる）。

| いつ                      | コマンド                                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issueを渡したとき         | `node .claude/scripts/delegation.mjs init <Issue> --model <swe-2-medium\|swe-2-high\|swe-2-max> [--runner cloud] [--level 0-3] [--follow-up-of <前の委譲>]`             |
| レビューのroundごと       | `node .claude/scripts/delegation.mjs review <Issue> --round <n> --sha <head> --verdict <merge\|fix\|escalate> [--posted] --finding '<severity>:<category>:<summary>' …` |
| マージ・クローズの後      | `node .claude/scripts/delegation.mjs finalize <Issue> [--pr <n>]`                                                                                                       |
| 集計                      | `node .claude/scripts/delegation.mjs summary`                                                                                                                           |
| 進行中の委譲の次の動き    | `node .claude/scripts/delegation.mjs status [--json] [--no-gh]`（セッション開始時のフックと同じ）                                                                       |
| IssueなしPRを見つけたとき | `node .claude/scripts/delegation.mjs init pr-<PR> [--model <m>] [--runner <local\|cloud>] [--level 0-3]`。`review` / `finalize`も`pr-<PR>`で指定する                    |

記録はDevinのブランチにcommitしない。その日の締め（close-session）のPRに、finalizeした記録だけを入れる。

### 写し

`init` / `review` / `finalize`は、ここ（正）に書いたあと、ハーネスの状態ディレクトリ
（`~/.local/state/<名前空間>/delegations/`）にも同じ記録を書く。worktreeごとのセッションでも、mainに未マージの
進行中の記録が見えるようにするため。読むときは正と写しをkeyでまとめ、共有seqがあれば大きい方を選び、同じseqなら取得日時を比べる。共有seqの無い旧記録同士だけ、`reviews`の多い方 → `outcome`のある方 → リポジトリの順で選ぶ。
進行中の記録は写しで次のセッションに引き継ぐのでコミットしない（別のworktreeと二重にコミットして衝突させない）。
写しが残らないクラウドのセッションでは、進行中の記録もコミットする。完了した記録の写しは、完了から30日で`status`が消す。
`--dir`を指定したとき（テスト）は、`--mirror-dir`を指定しない限り写さない。

## 項目

| 項目                               | 書く人                  | 意味                                                                                                                                                                                                         |
| ---------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `issue` / `title` / `delegated_at` | init（gh）              | Issueの番号・題・作成日時。IssueなしPRは`issue: null`で、`delegated_at`はPRの作成日時                                                                                                                        |
| `pr` / `origin`                    | init（IssueなしPRだけ） | PR番号と`self`（Devinが自分から出した）。項目が無い記録は`origin: issue`として集計する                                                                                                                       |
| `agent`                            | init                    | いまは常に`devin`                                                                                                                                                                                            |
| `model`                            | init                    | `swe-2-medium` / `swe-2-high` / `swe-2-max` / `unknown`（記録を始める前の委譲。IssueなしPRの既定）                                                                                                           |
| `runner`                           | init                    | Devinを動かした場所。`local`（既定）/ `cloud`。作成者による推定は旧履歴の表示だけに使う。新規起動では明示する。項目が無い古い記録は集計で`unknown`                                                           |
| `shared_seq` / `shared_fetched_at` | 共有状態の写し（任意）  | 共有履歴の版と取得日時。旧記録のreviews数より優先する                                                                                                                                                        |
| `change_level`                     | init                    | 0〜3。分からなければ`null`                                                                                                                                                                                   |
| `follow_up_of`                     | init（任意）            | 前のPRの指摘を直す後続の委譲のとき、前の委譲のkey（Issue番号か`pr-<n>`。複数ならいちばん古いもの）。無い記録は後続ではない                                                                                   |
| `reviews[]`                        | review                  | roundごとの`reviewed_at`（記録した時刻。修正待ちの待機の`--since`に使う。無い古い記録は`delegated_at`で代用）・`reviewed_sha`・`verdict`（merge / fix / escalate）・`posted`（PRに投稿したか）・`findings[]` |
| `findings[]`                       | review                  | `severity`（must / nit / security / decision）・`category`・`summary`                                                                                                                                        |
| `escalations`                      | review                  | `verdict: escalate`の回数（ユーザーに渡した回数）                                                                                                                                                            |
| `outcome`                          | finalize                | merged / closed / open                                                                                                                                                                                       |
| `gh`                               | finalize                | `pr`・`pr_created_at`・`merged_at`・`closed_at`・`commits`・`ci_first_pass`（PR作成時のheadのCIがすべて成功したか。チェックが無ければ`null`）・`closes_linked`                                               |

- 手戻りの回数（round）は`posted: true`のreviewの数。後続の委譲で直した手戻りはroundに出ないので、`summary`の
  「後続を生んだ」「後続なしの一発合格」で見る。
- **`security`の`summary`は自動で`(非公開)`になる。** 記録は公開リポジトリに入ることがあるので、再現手順・迂回の方法をどこにも書かない。

## categoryの語彙

集計はこの名前で数える。合うものがあれば新しく作らない。新しく作ったらこの表に足す。

| category               | 例                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `test-path-mismatch`   | テストが本番と違う組み立てで動き、本番の経路を通っていない。経路は通っているが壊しても落ちないものは`missing-test`       |
| `error-shape`          | エラー応答が設計書の形（`{ code, message }`）でない                                                                      |
| `logging-gap`          | 出すべきログが出ない・出してはいけない項目が出る                                                                         |
| `pr-metadata`          | PR本文の不備（`Closes #N`漏れ、品質確認の結果が無い）                                                                    |
| `scope-creep`          | Issueの範囲外の変更、並行PRの担当を先回り                                                                                |
| `spec-mismatch`        | 名前・置き場所・型・エラーコード・振る舞い（状態の遷移、エラーの表示の出し分け）が設計書・契約・試験計画と違う           |
| `missing-test`         | 試験計画の観点IDに対応するテストが無い、またはあっても確かめたい処理を壊して落ちない（試験データの不足・常に真のassert） |
| `robustness`           | 正常系は動くが、大きすぎる入力・失敗のあとの再送・DBのエラー・同時実行で壊れる。テストで見つかるべきものは`missing-test` |
| `test-robustness`      | 書いた時点では通るが、日付が進む・見た目が変わる・模擬を外すと落ちる試験。今すでに不安定なものは`test-flakiness`         |
| `test-flakiness`       | 同じコードでも、実行の順序やタイミングで結果が変わる試験                                                                 |
| `coding-standard`      | `.claude/rules/coding-standards.md`の違反                                                                                |
| `doc-accuracy`         | コードのコメント・JSDocの根拠や説明が設計書・要件と違う                                                                  |
| `simplification`       | 動きは正しいが、同じ判定の二重定義・使われない公開API・同じ取得の二重呼び出しなど、減らせる書き方                        |
| `security`             | セキュリティの指摘（severityも`security`。`review`は片方だけが`security`の指摘をエラーにする）                           |
| `design-gap`           | 設計書・試験計画の側の穴で、実装どおりでも期待の動きにならない                                                           |
| `error-feedback`       | 失敗したときに利用者への表示・反応が無い                                                                                 |
| `error-code-in-url`    | URLのクエリに内部の失敗理由が残る                                                                                        |
| `merge-conflict`       | mainとの衝突でCIが走らない・マージできない                                                                               |
| `knowledge-inaccurate` | 知見のPRに書かれたコマンド・環境変数・手順が事実と違う                                                                   |
| `harness-conflict`     | 知見のPRが既存の規則・スキルと重複する・置き場所が違う                                                                   |

## 昇格の閾値

`summary`はcategoryごとに「指摘が出た委譲の数」を数える（同じIssue・同じIssueなしPRで何度出ても1件）。
「Issue→PR中央値」にはIssueなしPRを入れない（起点別の行で分けて見る）。

- 異なるIssueで **3件** → 昇格候補。`security`だけ **2件**。
- 候補が出たら`docs/claude-code/improvement-cycle.md`の「委譲ループの軽量サイクル」に従って起票する。
