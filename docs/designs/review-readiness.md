# 設計書: review-readiness

- ステータス: confirmed
- レベル: L3
- 関連要件: `docs/requirements/review-readiness.md`
- 設計確認: Claude Code `architecture-designer` による反証・再設計・最終整合確認済み

## 1. 設計方針

レビューを「証拠生成」と「人間の意思決定表示」に分ける。既存の詳細レビューは監査ログとして
維持し、同じファイル内に現在状態だけを生成する。AI の評価は機械的事実や人間承認へ昇格させない。

```text
requirements / design / staged diff
                  │
                  ▼
          deterministic gates
                  │
                  ▼
          Claude semantic review
                  │
                  ▼
       review-readiness render/check
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
  current-state packet   append-only audit
        │
        ▼
  human merge decision
```

## 2. 責務境界

| 層            | 責務                                        | 断定可能なこと                |
| ------------- | ------------------------------------------- | ----------------------------- |
| deterministic | lint / type / test / Task coverage / digest | コマンド結果と対象の一致      |
| Claude        | 意味的指摘、設計整合、残余リスク            | 「Claude がそう評価した」こと |
| human         | 意図、UX、不可逆判断、リスク受容            | マージを受容したこと          |

`human_review_requested` は「人間へ渡せる状態」であり、`PASS` や承認ではない。

## 3. レビュー文書構造

`docs/reviews/<feature>.md` を唯一の正典とする。

```markdown
# レビュー記録: <feature>

<!-- review-readiness:begin -->
<!-- prettier-ignore-start -->

<!-- review-readiness:state
{ ... schema v1 JSON ... }
-->

## Review handoff

> 人間レビュー待ち。これは承認ではありません。
> ...

<!-- prettier-ignore-end -->
<!-- review-readiness:end -->

## 監査ログ

...
```

- JSON は機械可読な current state の正本。
- Markdown summary は同じ JSON から生成する表示。
- begin/end 間だけを再生成対象とし、監査ログは追記型のまま維持する。
- Prettier の range-ignore も begin/end 内の正規出力に含め、formatter による表示 drift を防ぐ。
- スクリプトは read-only。`render` 出力の挿入は Orchestrator の Edit が担う。

## 4. State schema v1

```json
{
  "schemaVersion": 1,
  "feature": "stock-edit",
  "status": "human_review_requested",
  "reviewTier": "R2",
  "subject": {
    "algorithm": "git-raw-v1",
    "baseSha": "<40+ hex>",
    "digest": "sha256:<64 hex>",
    "source": "index",
    "entryCount": 12
  },
  "aiAssessment": {
    "blockingOpen": 0,
    "highImpactUnverified": 0,
    "followUpOpen": 1
  },
  "humanItems": [
    {
      "id": "HC-01",
      "kind": "subjective",
      "question": "375px で操作密度を許容できるか",
      "recommendation": "accept",
      "evidenceRefs": ["EV-07"]
    }
  ],
  "residualRisks": ["実機キーボード表示時は未確認"],
  "behaviorChanges": ["保存結果を reload なしで一覧へ反映する"],
  "evidence": [
    {
      "id": "EV-07",
      "claim": "reload なしで表示が更新される",
      "kind": "black_box",
      "result": "pass",
      "ref": "Playwright stock-edit"
    }
  ],
  "reviewer": {
    "agent": "reviewer",
    "model": "claude-opus-5",
    "reviewedAt": "2026-08-11T00:00:00Z"
  }
}
```

### 4.1 status の導出

| 条件                                       | status                                 |
| ------------------------------------------ | -------------------------------------- |
| `blockingOpen > 0` または evidence に fail | `ai_blocked`                           |
| `highImpactUnverified > 0`                 | `evidence_pending`                     |
| 人間項目が 4 件以上                        | `evidence_pending`、handoff 不可を表示 |
| 上記以外                                   | `human_review_requested`               |
| 保存済み digest と現在 digest が不一致     | `stale`                                |

人間項目 4 件以上を先頭 3 件へ切り詰めない。render は警告と引き渡し不可 summary を返し、
PR 分割、設計判断の前倒し、追加証拠のいずれかを要求する。

## 5. Subject digest

### 5.1 アルゴリズム

```text
SHA-256(
  "git-raw-v1\0"
  + feature + "\0"
  + resolved_base_sha + "\0"
  + raw_diff_bytes
)
```

raw diff は次で得る。

```bash
git diff --cached --raw -z --no-renames --no-abbrev <base> -- <pathspec> # local
git diff          --raw -z --no-renames --no-abbrev <base> <head> -- <pathspec> # CI
```

- old/new mode、old/new blob ID、status、path を含む。
- `-z` の raw bytes を文字列へ再解釈せず hash へ渡す。
- rename 推測を無効にし、delete + add として安定化する。
- head SHA は hash 入力にしない。レビュー追記 commit だけで失効させないためである。
- base SHA は含める。base 更新時は安全側に stale とする。

### 5.2 除外

除外は当該 `docs/reviews/<feature>.md` だけとする。要件、設計、テスト、migration、lockfile、
`.claude`、`.github` はレビュー対象なので除外しない。複数 feature の review を 1 PR に含める場合は
自己参照を避けられないため、1 PR = 1 purpose の原則に従って分割する。

### 5.3 保証しないこと

- digest はレビュー品質や Claude 実行を証明しない。
- review state は信頼された個人開発者が協力する前提で、悪意ある改ざんへの防御ではない。
- 悪意ある変更の防止は branch protection / PR review の責務である。

### 5.4 Subject を固定する順序

review 文書以外の metrics、candidate、作業ログ、正典文書はすべて digest 対象である。レビュー後に
これらを更新すると正しく `stale` になるため、L3 は次の順序で閉じる。

1. 品質ゲートと意味 / security review を行い、open 指摘を解消する。
2. review 結果を使う candidate / metrics を確定し、review 文書以外をすべて stage する。
3. final subject を計算し、Reviewer が前回 subject との差分と最終全体を closure review する。
4. closure review 後は review 文書以外を変更しない。変更した場合は 2 へ戻る。
5. final assessment から review marker と監査ログを生成する。review 文書だけは自己参照回避の
   除外対象なので subject は変わらない。

この closure review は人間 gate を増やさない。AI の最終対象固定であり、人間は current packet を
1 回判断する。audit 成果物を広く digest 除外する案は、実質的な変更を隠せるため採用しない。

## 6. CLI

新規 `.claude/scripts/review-readiness.mjs` のみを追加する。

| command         | 入力                            | 出力 / 責務                                   |
| --------------- | ------------------------------- | --------------------------------------------- |
| `subject`       | feature / base / source / head  | digest JSON                                   |
| `render`        | 上記 + assessment JSON          | marker 全体の Markdown（Gate B 文言は warn）  |
| `check`         | 上記 + optional require-handoff | schema、Task、digest の検査                   |
| `handoff-check` | feature / base / source / head  | 人間引き渡し hard stop（legacy 不可）         |
| `handoff-blurb` | 同上                            | PR/チャット用短文（handoff-check 成功時のみ） |
| `ci`            | base / head / mode              | 変更 review の一括検査（当面 warn-only）      |

既定は read-only。`render` は stdout にだけ出力し、ファイルは変更しない。

## 7. 人間向け表示

表示順を固定する。

1. 人間が判断・確認すること（最大 3）
2. 残余リスク / 未確認
3. 振る舞い差分（最大 5）
4. claim と evidence の対応
5. 折り畳んだ AI assessment

0 件の場合も「追加の主観判断なし」とだけ表示し、承認済みとは書かない。`PASS`、`READY`、
緑色の成功 banner は使用しない。

## 8. 指摘契約

Reviewer の各指摘は次の軸を持つ。

| axis     | values                                                           |
| -------- | ---------------------------------------------------------------- |
| action   | `BLOCK` / `HUMAN_DECISION` / `FOLLOW_UP` / `PRE_EXISTING`        |
| impact   | critical / high / medium / low                                   |
| evidence | E0 未確認 / E1 静的 / E2 test / E3 counterfactual / E4 black-box |
| status   | open / resolved / accepted_risk                                  |

`Must → BLOCK` のような機械置換は行わず、影響と行動を別々に判定する。人間向け summary には
`BLOCK` と `HUMAN_DECISION` だけを出し、follow-up の詳細は監査ログへ置く。

## 9. Review tier

既存の成果物 Level は置換しない。既定値は `reviewTier = changeLevel` とし、以下の trigger が
あれば上げる。Claude は上げられるが下げられず、人間が下げる場合は理由を残す。

| tier | trigger / 実行                                                                  |
| ---- | ------------------------------------------------------------------------------- |
| R0   | 非規範 typo 等。format + digest                                                 |
| R1   | 局所的、可逆、既存 pattern。deterministic + Reviewer 1 回                       |
| R2   | UI/API/Domain/永続化の振る舞い。独立 Reviewer + 対象 black-box                  |
| R3   | migration、削除、認証、外部 I/O、`.github`、`.claude`。R2 + 専門観点 + rollback |

## 10. CI 統合

既存 `quality` job の Harness tests 後に 1 step だけ追加する。

```yaml
- name: Review readiness (warning-only)
  if: github.event_name == 'pull_request'
  continue-on-error: true
  run: node .claude/scripts/review-readiness.mjs ci --base "$BASE_SHA" --head HEAD --mode warn
```

- job、checkout、install は増やさない。
- 変更された requirements / design / implementation plan / test plan / review の basename から
  feature 候補を得て、legacy review、missing review、stale、schema error を短い warning として
  表示する。アプリコードだけから feature 名を推測しない。
- strict 化は要件定義の移行条件を満たす別タスクで行う。

## 11. 後方互換

- 既存 Task coverage の `uncovered()` を import して再利用する。
- marker のない既存文書は `legacy`。本文の見出し構造は検査しない。
- 過去 16 文書は一括変更せず、次回 review 時に marker を生成する。
- `check-review-coverage.mjs` と Stop Hook の挙動を変えない。

## 11.1 Plugin 層

`review-readiness.mjs` は Task coverage を実行時に import するため、既存の
`check-review-coverage.mjs` を `harness-improvement` から `harness-workflow` へ再分類する。
ファイル移動や挙動変更はしない。review は workflow の責務であり、improvement 層の Hook が
workflow の checker を参照する方向は許可された上位 → 下位依存になる。

- workflow: 既存 22 + checker 再分類 1 + 新規 script/test 2 = 25
- improvement: 既存 18 - checker 再分類 1 = 17
- `.claude/` 配布対象総数: 72 + 新規 2 = 74

## 12. エラー処理

- `subject` / `render` / `check` は入力不正、Git 解決失敗、schema 不正で非 0。
- `ci --mode warn` は診断を出して 0、`ci --mode strict` は error があれば非 0。
- stale 時は保存 state を改変せず、実行時の診断だけ `stale` とする。
- stack trace ではなく、feature / reason / remediation を出力する。

## 13. セキュリティ

- `execFileSync` の引数配列で Git を呼び、shell interpolation を使わない。
- feature は kebab-case に限定し、path traversal を拒否する。
- assessment は JSON.parse 後に shape と enum を明示検証する。
- review 文書中の HTML / Markdown 制御文字を escape し、生成領域への marker 注入を拒否する。
- CI は PR へ書き込み権限を追加しない。

## 14. 性能・ログ

- raw diff と review 文書を各 1 回読む。外部 I/O、DB、大量データ処理はない。
- 通常実行は 2 秒未満を目標とする。
- state は増やさず stdout/stderr と GitHub Actions log のみ。

## 15. 変更対象

要件定義の対象範囲表に従う。アプリコード、DB、API、既存 review 本文は変更しない。

## 16. 移行・ロールバック

1. warning-only と新形式テンプレートを導入する。
2. 本 feature 自身のレビューで end-to-end 利用する。
3. **セッション hard stop**（Orchestrator / close-session / validate-deliverables）で
   `handoff-check` を必須化する。CI strict より先にこちらを定着させる。
4. Gate B 文言 lint は warn-first。禁止語・疑問形・recommendation 行動語・
   振る舞い差分のプロセス言語を検出する。
5. 次の **プロダクト** feature（harness 以外）2 件以上で packet + handoff-blurb を実戦し、
   誤警告を計測する。
6. CI strict 化はユーザー判断で別変更とする。

ロールバックは CI step、Reviewer/Skill 文言、新規 script/test、正典追記を本 feature の commit で
revert する。既存 review 本文に migration をかけないためデータ復旧は不要。

## 17. 未決事項

なし。
