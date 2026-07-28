# ハーネス — リポジトリ所有者が行う設定手順

コードでは閉じられない設定をまとめた作業手順。**AI は実行できない**（実行できてしまうと
安全境界にならない）。上から順に、効果の大きい順に並べている。

正典（仕組みの説明）: [harness-state-and-approval.md](./harness-state-and-approval.md)

| #   | 作業                                  | 時期     | 所要     | 効果                                        | 状態      |
| --- | ------------------------------------- | -------- | -------- | ------------------------------------------- | --------- |
| 0   | 再監査の修正パッチ適用                | —        | 完了     | 待機期間中の唯一の層を healthy にした       | ✅ 完了   |
| 1-A | Actions 復旧の確認                    | 2026-08  | 約 5 分  | CI が実際に動くことの検証                   | ⬜ 待機中 |
| 1-B | main の branch protection             | 1-A の後 | 約 3 分  | **承認境界（PR レビュー）に強制力を与える** | ⬜ 待機中 |
| 2   | PR に構成ファイル差分を可視化（任意） | 1-B の後 | 約 30 分 | レビューでの見落とし防止                    | ⬜ 未実施 |

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
§7 の表と §6-2 を「復旧済み」に更新し、§1-B へ進む。

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

確認できたら [harness-state-and-approval.md](./harness-state-and-approval.md) §6-3 と
§7 の表を「設定済み」に更新する（現在は「強制力なし」と書いてある）。

---

## 2. PR に構成ファイル差分を可視化する（1-B の後・任意）

### なぜ必要か

構成ファイル（`.claude/**` / `CLAUDE.md` / `lefthook.yml` / `.github/workflows/`）の変更は
**PR レビューが承認境界**になった（[harness-state-and-approval.md](./harness-state-and-approval.md) §5）。
レビューで見落とさないよう、触れた構成ファイルを CI が一覧表示すると効果が上がる。

### 手順

1. Claude に「PR が構成ファイルに触れていたら Job Summary へ一覧を出すジョブを追加して」と
   依頼する。承認は不要（構成ファイルは PR レビューで確認する）。
2. `Harness tests`（`pnpm test:harness`）とあわせて必須チェックにする。
3. #1-B の必須チェック一覧に新ジョブ名を追加する。

> 承認ファイルによる機械的な強制（旧 #2〜#4）は 2026-07-28 に撤去した。経緯は
> [harness-state-and-approval.md](./harness-state-and-approval.md) §5。

---

## 変更履歴

| 日付       | 内容                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-26 | 初版。branch protection 未設定を確認したため作成                                                                           |
| 2026-07-26 | 再監査を反映。#0（pending パッチ適用）を最優先で追加。#1 を 1-A（Actions 復旧確認）と 1-B（protection）へ分割。#4 を必須化 |
| 2026-07-28 | 承認層の撤去（承認境界は PR レビュー）に伴い旧 #2〜#4 を削除。#2 を差分可視化へ置換。1-B の重要度を格上げ                  |
