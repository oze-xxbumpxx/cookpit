---
name: review-codex-implementation
description: >
  Codex 委譲実装の受け入れレビューを一括実行する手順。既知ミス型の機械検出、品質ゲート、
  Claude の意味レビュー、必要な black-box 証拠を統合し、人間には主観・不可逆・未知の
  最大 3 判断だけを渡す。「Codex の実装をレビューして」「差し戻し後の再レビュー」で使う。
---

# Codex 実装の受け入れレビュー

## 発動条件

- `docs/tasks/codex/<feature>/` の指示書で Codex に委譲した実装を受け取ったとき
- 差し戻し後の再実装を再レビューするとき

## 原則

- 正本は `docs/reviews/<feature>.md`。current-state packet と追記型監査ログを同居させる。
- 固定チェックリストを人間に再走査させない。機械が確認できることは機械証拠、意味的整合は
  Reviewer、操作でしか分からないことは対象を絞った black-box 証拠にする。
- 人間へ渡すのは `subjective` / `irreversible` / `unknown` の例外だけで、最大 3 件。
- AI は受け入れを承認しない。最終判断は packet を読んだ人間が行う。

## 入力

- `<feature>`: kebab-case の feature-name
- `<base>`: 原則 `origin/main`。取得できない環境では明示した merge-base
- `docs/tasks/codex/<feature>/`: 対象 Task のブリーフ
- staged snapshot: 今回受け入れる変更をすべて stage したもの

当該 `docs/reviews/<feature>.md` だけは subject digest から除外される。その他の未 stage / untracked
変更がある状態では snapshot が不完全として停止する。

## 手順

### 1. 対象を固定する

Orchestrator が意図した変更を stage し、subject を取得する。

```bash
node .claude/scripts/review-readiness.mjs subject --feature <feature> --base <base>
```

以後、対象差分が変われば以前のレビューは `stale`。小さな修正でも subject を再計算する。

### 2. 安い機械検出を先に回す

```bash
node .claude/scripts/check-codex-implementation.mjs \
  --brief docs/tasks/codex/<feature> --base <base>
bash .claude/scripts/run-quality-gates.sh
```

`docs/06-ai-tools.md` の既知リスク型は人間チェック表ではなく、機械検出と Reviewer の探索 catalog。
検出結果は次のように処理する。

- 明確な failure は `BLOCK` 候補。
- warning / info は差分と照合し、真の問題だけを指摘へ昇格する。
- lint / type / test と同じ原因は重複指摘にしない。
- 誤検出は根拠を監査ログへ 1 行残し、人間判断には含めない。

### 3. Claude Reviewer で意味を検証する

Reviewer へ requirements / design / implementation plan / test plan / brief / staged diff / 機械結果を
渡す。Reviewer は各候補について introduced-by-diff、証拠、CI 重複、根本原因の重複を検証し、
`action / impact / evidence / status` の 4 軸と `review_assessment` JSON を返す。

- open `BLOCK` は修正へ戻す。
- critical / high の未検証候補は追加証拠を取るまで `evidence_pending`。
- `FOLLOW_UP` は今回を止めず、最大 3 件を監査ログへ置く。
- `PRE_EXISTING` は今回の受け入れと分離する。

### 4. 必要な経路だけ black-box で確認する

画面変更を含み、コードと自動試験だけでは操作・表示を確定できない場合は
`manual-browser-verify` Skill へハンドオフする。すべての画面を巡回せず、変更した振る舞いと
高影響の反例に限定する。リモート環境では PGlite 経路
（`pnpm --filter @cookpit/web dev:pglite`）を使う。

実行結果は claim / kind / result / ref を持つ evidence として assessment へ戻す。単なる
「画面を見た」ではなく、どの主張をどの操作で確かめたかを記録する。

### 5. 差し戻しと再レビュー

open `BLOCK` を番号付きで Codex へ返す。再実装後は次を行う。

1. 全変更を stage し直し、subject を再計算する。
2. 機械チェックと品質ゲートを再実行する。
3. 以前の open `BLOCK` 全件と、修正が触れた振る舞いを再確認する。
4. 新しい差分が別の失敗モードを増やしていないか Reviewer が確認する。

既に証拠があり、修正の影響を受けない詳細を人間が最初から全走査する必要はない。ただし
以前の指摘を未確認のまま消してはならない。

### 6. 監査ログと current packet を生成する

L3 で reflection candidate / metrics を作る場合は、先にそれらを確定して stage する。これらは
subject digest の対象なので、意味レビュー後に更新した場合は Reviewer が最終差分を closure review
してから assessment を確定する。closure 後に review 文書以外を変更したら再度 stale になる。

`docs/reviews/<feature>.md` の監査ログへ、最低限次を Task 単位で追記する。

- 実施日、Task / brief、branch、subject digest
- Codex model / reasoning effort
- 機械検出と品質ゲートの結果
- 4 軸の指摘、処置、再確認結果
- black-box evidence（該当時）
- 残余リスクと人間判断候補

Task coverage は既存の `## Task N` 見出しで維持する。assessment JSON は repository 外の一時
ファイルへ保存し、render の stdout から marker 全体を得る。

```bash
node .claude/scripts/review-readiness.mjs render \
  --feature <feature> --base <base> --assessment <assessment-json>
```

Orchestrator が出力を `docs/reviews/<feature>.md` の
`review-readiness:begin` / `review-readiness:end` 間へ挿入する。スクリプト自身はファイルを
変更しない。最後に state、表示、Task coverage、subject freshness をまとめて確認する。

```bash
node .claude/scripts/review-readiness.mjs handoff-check --feature <feature> --base <base>
node .claude/scripts/review-readiness.mjs handoff-blurb --feature <feature> --base <base>
```

`handoff-check` が exit 0 になるまで「人間レビュー待ち」「PR 準備完了」と報告しない。
チャットと PR 本文は `handoff-blurb` の出力だけを貼る。詳細を二重転記しない。
内容 lint の WARN（禁止語・プロセス言語の振る舞い差分など）は修正するか、監査ログへ理由を残す。

## 人間への引き渡し条件

- open `BLOCK` が 0。
- critical / high の未検証が 0。
- 品質ゲートが green、または unavailable の理由と代替証拠が明記されている。
- 差し戻しがあった場合、対象指摘の再確認が済んでいる。
- review state が current な `human_review_requested`。
- 人間項目が 3 件以下で、各項目に質問・推奨・証拠参照がある。
- handoff が `docs/reviews/README.md` の Gate B 書き方に従っている
  （禁止語なし、振る舞い差分は利用者言語、残余リスクは今回受容する未確認のみ）。
- 誤検出 WARN や FOLLOW_UP 詳細を handoff 前面に並べていない（監査ログへ圧縮）。

この条件は AI による承認ではない。人間は packet の先頭から、例外判断、残余リスク、
振る舞い差分、必要な証拠だけを確認してマージ可否を決める。
チャットと PR に `受け入れ可` / `PASS` / `APPROVED` と書かない。packet へのリンクと
人間項目の要約だけにする。

## 備考

- `check-codex-implementation.mjs` は、既存コミット済みコードから収穫した既知クラス辞書と
  Tailwind 文法を使うため、新規クラスの誤検出はあり得る。
- `import type` は eslint による機械化が本筋。未導入の環境では Reviewer が差分だけを確認する。
- marker のない既存 review は legacy 監査ログとして残す。次にその feature をレビューするときに
  current packet を追加し、一括 migration はしない。
