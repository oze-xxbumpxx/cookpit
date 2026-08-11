# レビュー記録: review-readiness

<!-- review-readiness:begin -->
<!-- prettier-ignore-start -->

<!-- review-readiness:state
{
  "schemaVersion": 1,
  "feature": "review-readiness",
  "status": "human_review_requested",
  "reviewTier": "R3",
  "subject": {
    "algorithm": "git-raw-v1",
    "baseSha": "de7bd677e89076b4dede0abe31b4c92d5babb749",
    "digest": "sha256:bc60abf5cdd384f7eae517c7f202582d1c2925f619d5caa3781e839e7e614a13",
    "source": "index",
    "entryCount": 26
  },
  "aiAssessment": {
    "blockingOpen": 0,
    "highImpactUnverified": 0,
    "followUpOpen": 0
  },
  "humanItems": [],
  "residualRisks": [
    "digest は Claude 実行やレビュー品質を証明せず、悪意ある改ざん防止は branch protection の責務",
    "CI は warning-only で開始するため、試行期間中は誤警告と見逃しを metrics で監視する必要がある",
    "人間項目 3 件の budget が適切かは実 feature での運用実績後に再評価する"
  ],
  "behaviorChanges": [
    "L2/L3 の新規 review 文書に current-state packet と追記型監査ログを同居させる",
    "CI が変更された L2/L3 成果物から feature を検出し、review 欠落や stale を警告する",
    "Reviewer の指摘を action、impact、evidence、status の独立した 4 軸で記録する",
    "人間へ渡す判断を主観、不可逆、未知だけに限定し、最大 3 件へ圧縮する",
    "L3 は metrics と candidate の確定後に final subject を closure review してから review 文書を生成する"
  ],
  "evidence": [
    {
      "id": "EV-QG",
      "claim": "L3 の全品質ゲートが成功する",
      "kind": "test",
      "result": "pass",
      "ref": "harness 95 / lint / type / build / format / app 123 files・1872 tests"
    },
    {
      "id": "EV-RR",
      "claim": "digest、schema、表示、注入防止、legacy、CI 境界の専用試験が成功する",
      "kind": "counterfactual",
      "result": "pass",
      "ref": ".claude/tests/review-readiness.test.mjs: 24 tests"
    },
    {
      "id": "EV-PL",
      "claim": "Plugin 配布対象 74 件と workflow の依存方向が整合する",
      "kind": "static",
      "result": "pass",
      "ref": "plugin-layer-manifest の実数検算と依存 grep"
    },
    {
      "id": "EV-CR",
      "claim": "final subject に対する Claude Code closure review の open blocker が 0 件である",
      "kind": "static",
      "result": "pass",
      "ref": "reviewer closure review: 2026-08-11"
    },
    {
      "id": "EV-SEC",
      "claim": "Git、path、表示、CI 権限境界の専門 security review の open blocker が 0 件である",
      "kind": "static",
      "result": "pass",
      "ref": "security-reviewer: 2026-08-11"
    }
  ],
  "reviewer": {
    "agent": "reviewer",
    "model": "claude-opus-4",
    "reviewedAt": "2026-08-11T10:42:14Z"
  }
}
-->
## Review handoff

> **人間レビュー待ちです。**
> Claude の評価です。これは承認ではありません。以下の判断事項・残余リスク・振る舞い差分を確認してください。
> 対象: `sha256:bc60abf5cdd3…` / R3 / 26 changes

### あなたが判断・確認すること（0 件）

- 追加の主観・不可逆・未知の判断はありません。これは承認済みを意味しません。

### 残余リスク・未確認

- digest は Claude 実行やレビュー品質を証明せず、悪意ある改ざん防止は branch protection の責務
- CI は warning-only で開始するため、試行期間中は誤警告と見逃しを metrics で監視する必要がある
- 人間項目 3 件の budget が適切かは実 feature での運用実績後に再評価する

### 振る舞い差分

- L2/L3 の新規 review 文書に current-state packet と追記型監査ログを同居させる
- CI が変更された L2/L3 成果物から feature を検出し、review 欠落や stale を警告する
- Reviewer の指摘を action、impact、evidence、status の独立した 4 軸で記録する
- 人間へ渡す判断を主観、不可逆、未知だけに限定し、最大 3 件へ圧縮する
- L3 は metrics と candidate の確定後に final subject を closure review してから review 文書を生成する

### 証拠

| ID | 主張 | 種別 | 結果 | 参照 |
| --- | --- | --- | --- | --- |
| EV-QG | L3 の全品質ゲートが成功する | test | pass | harness 95 / lint / type / build / format / app 123 files・1872 tests |
| EV-RR | digest、schema、表示、注入防止、legacy、CI 境界の専用試験が成功する | counterfactual | pass | .claude/tests/review-readiness.test.mjs: 24 tests |
| EV-PL | Plugin 配布対象 74 件と workflow の依存方向が整合する | static | pass | plugin-layer-manifest の実数検算と依存 grep |
| EV-CR | final subject に対する Claude Code closure review の open blocker が 0 件である | static | pass | reviewer closure review: 2026-08-11 |
| EV-SEC | Git、path、表示、CI 権限境界の専門 security review の open blocker が 0 件である | static | pass | security-reviewer: 2026-08-11 |

<details>
<summary>AI assessment</summary>

- blocking open: 0
- high-impact unverified: 0
- follow-up open: 0
- reviewer: reviewer / claude-opus-4
- reviewed at: 2026-08-11T10:42:14Z

</details>

<!-- prettier-ignore-end -->
<!-- review-readiness:end -->

## 監査ログ

### 2026-08-11: R3 受け入れレビュー

- Task: `TASK-2026-009`
- Branch: `feature/review-readiness`
- Final subject: `sha256:bc60abf5cdd384f7eae517c7f202582d1c2925f619d5caa3781e839e7e614a13`
- Base: `de7bd677e89076b4dede0abe31b4c92d5babb749` (`origin/main`)
- Scope: review workflow / Reviewer contracts / CI warning / metrics。アプリ、DB、API は変更なし。

#### 品質証拠

| Gate               | 結果    | 詳細                                          |
| ------------------ | ------- | --------------------------------------------- |
| Harness            | success | 95 tests。うち review-readiness 専用 24 tests |
| Lint               | success | error 0。差分外の既存 warning 1 件            |
| Type check         | success | 全対象 package                                |
| Build              | success | Next.js production build                      |
| Format check       | success | generated packet の range-ignore 導入後も確認 |
| Unit / integration | success | 123 files / 1,872 tests                       |

テスト stderr の chart size / example.com network 出力は既存テスト由来で、今回差分の failure ではない。

#### Claude Code review

| 段階              | 対象                               | 結果                                                                 |
| ----------------- | ---------------------------------- | -------------------------------------------------------------------- |
| Architecture      | 要件・digest・人間 budget          | 内容鮮度と 4 件超過時の安全側設計へ改訂後、整合確認                  |
| Main Reviewer     | 初回 staged subject                | 検証済み指摘 0                                                       |
| Security Reviewer | Git / path /表示 / CI 権限境界     | open `BLOCK` 0、`HUMAN_DECISION` 0                                   |
| Closure Reviewer  | audit 成果物確定後の final subject | metrics 自己参照と formatter drift を dogfood 修正後、検証済み指摘 0 |

正式な open finding はない。既存 lint warning とテスト stderr は `PRE_EXISTING` 候補として差分外へ
分離した。人間へ追加で渡す主観・不可逆・未知の項目は 0 件。

#### Dogfood で解消した失敗モード

1. review 文書だけを CI 列挙すると missing review を検出できない。
2. review 後に metrics / candidate を更新すると subject が stale になる。
3. Prettier が generated table を整形すると state と表示が drift する。

いずれも実装・試験・正典へ反映し、final subject に対して closure review 済み。

#### ロールバック

ADR-0017 の手順どおり、本 feature の script/test、CI step、Reviewer/Skill 契約、正典追記を同じ
変更単位で revert する。既存 legacy review とアプリデータの migration はない。
