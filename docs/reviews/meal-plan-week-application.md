# レビュー記録: meal-plan-week-application

- レベル: L2（層の構造修正・挙動不変）
- 対象ブランチ: `cursor/meal-plan-week-application-7997`
- 関連: `docs/designs/meal-plan-week-application.md` / `docs/implementation-plans/meal-plan-week-application.md` / `docs/tests/meal-plan-week-application.md`

<!-- review-readiness:begin -->
<!-- prettier-ignore-start -->

<!-- review-readiness:state
{
  "schemaVersion": 1,
  "feature": "meal-plan-week-application",
  "status": "human_review_requested",
  "reviewTier": "R2",
  "subject": {
    "algorithm": "git-raw-v1",
    "baseSha": "4c0205a44811c78209f11b4448b5980ecbdcd9d4",
    "digest": "sha256:132199f763863df9b4d73ef23a50013b116a433abf0b38849a6af3c84030c1a0",
    "source": "index",
    "entryCount": 10
  },
  "aiAssessment": {
    "blockingOpen": 0,
    "highImpactUnverified": 0,
    "followUpOpen": 0
  },
  "humanItems": [
    {
      "id": "H-01",
      "kind": "unknown",
      "question": "実ブラウザ確認なしで、この層移動をマージしてよいか。",
      "recommendation": "accept_risk。MealPlanClient の JSX と props は無変更。週ナビの href と Application の query 解釈は既存・新規テストがロックしている。見た目変更は意図していない。",
      "evidenceRefs": [
        "EV-01",
        "EV-02",
        "EV-03"
      ]
    }
  ],
  "residualRisks": [
    "実ブラウザでの /meal-plans?week= と /meal-plans/history の目視は未実施。今回は accept_risk（JSX と MealPlanClient の props が無変更で、週ナビと query 解釈はテストがロック）。"
  ],
  "behaviorChanges": [
    "献立画面の ?week= の扱い（土曜への丸め、不正値・未指定時の今週フォールバック、前の週 / 次の週のリンク先、履歴の「今週」表示）は変更前と同じ",
    "現在週と選択週の基準時刻を 1 回だけ取るようになり、週の変わり目ちょうどに開いても両者がずれない"
  ],
  "evidence": [
    {
      "id": "EV-01",
      "claim": "meal-plan-week-query.test.ts の MPWQ-01〜20 が 20 件すべて通る",
      "kind": "test",
      "result": "pass",
      "ref": "pnpm --filter @cookpit/application exec vitest run tests/meal-plan/meal-plan-week-query.test.ts"
    },
    {
      "id": "EV-02",
      "claim": "apps/web の meal-plan 関連テスト（WC-M-14/15/16 を含む）は無改修のまま通る",
      "kind": "test",
      "result": "pass",
      "ref": "pnpm --filter @cookpit/web exec vitest run tests/app/meal-plans / git diff origin/main...HEAD -- apps/web/tests が空"
    },
    {
      "id": "EV-03",
      "claim": "Domain の土曜スナップ不変条件テストは無改修のまま通る",
      "kind": "test",
      "result": "pass",
      "ref": "pnpm --filter @cookpit/domain exec vitest run tests/shared/week-identifier.test.ts"
    },
    {
      "id": "EV-04",
      "claim": "meal-plans/page.tsx と history/page.tsx から @cookpit/domain の import が消え、週計算は Application の純関数にある",
      "kind": "static",
      "result": "pass",
      "ref": "rg @cookpit/domain apps/web/src/app/meal-plans が不一致 / packages/application/src/meal-plan/meal-plan-week-query.ts"
    },
    {
      "id": "EV-05",
      "claim": "差分は献立の週計算と L2 文書に限定され、shopping-list / pantry / cheapest-store / recipe / price-record / fixture に触れていない",
      "kind": "static",
      "result": "pass",
      "ref": "git diff origin/main...HEAD --name-only"
    },
    {
      "id": "EV-06",
      "claim": "pnpm format:check が通る（レビュー時に落ちていた Markdown 表は整形済み）",
      "kind": "test",
      "result": "pass",
      "ref": "pnpm format:check"
    },
    {
      "id": "EV-07",
      "claim": "pnpm lint と pnpm type-check が通る（web の既存 unused-var warning 1 件は本差分外）",
      "kind": "test",
      "result": "pass",
      "ref": "pnpm lint / pnpm type-check"
    }
  ],
  "reviewer": {
    "agent": "reviewer",
    "model": "claude-opus-5",
    "reviewedAt": "2026-08-26T06:50:00Z"
  }
}
-->
## Review handoff

> **人間レビュー待ちです。**
> Claude の評価です。これは承認ではありません。以下の判断事項・残余リスク・振る舞い差分を確認してください。
> 対象: `sha256:132199f76386…` / R2 / 10 changes

### あなたが判断・確認すること（1 件）

1. **[未知] 実ブラウザ確認なしで、この層移動をマージしてよいか。** — 推奨: accept\_risk。MealPlanClient の JSX と props は無変更。週ナビの href と Application の query 解釈は既存・新規テストがロックしている。見た目変更は意図していない。 / 証拠: EV-01, EV-02, EV-03

### 残余リスク・未確認

- 実ブラウザでの /meal-plans?week= と /meal-plans/history の目視は未実施。今回は accept\_risk（JSX と MealPlanClient の props が無変更で、週ナビと query 解釈はテストがロック）。

### 振る舞い差分

- 献立画面の ?week= の扱い（土曜への丸め、不正値・未指定時の今週フォールバック、前の週 / 次の週のリンク先、履歴の「今週」表示）は変更前と同じ
- 現在週と選択週の基準時刻を 1 回だけ取るようになり、週の変わり目ちょうどに開いても両者がずれない

### 証拠

| ID | 主張 | 種別 | 結果 | 参照 |
| --- | --- | --- | --- | --- |
| EV-01 | meal-plan-week-query.test.ts の MPWQ-01〜20 が 20 件すべて通る | test | pass | pnpm --filter @cookpit/application exec vitest run tests/meal-plan/meal-plan-week-query.test.ts |
| EV-02 | apps/web の meal-plan 関連テスト（WC-M-14/15/16 を含む）は無改修のまま通る | test | pass | pnpm --filter @cookpit/web exec vitest run tests/app/meal-plans / git diff origin/main...HEAD -- apps/web/tests が空 |
| EV-03 | Domain の土曜スナップ不変条件テストは無改修のまま通る | test | pass | pnpm --filter @cookpit/domain exec vitest run tests/shared/week-identifier.test.ts |
| EV-04 | meal-plans/page.tsx と history/page.tsx から @cookpit/domain の import が消え、週計算は Application の純関数にある | static | pass | rg @cookpit/domain apps/web/src/app/meal-plans が不一致 / packages/application/src/meal-plan/meal-plan-week-query.ts |
| EV-05 | 差分は献立の週計算と L2 文書に限定され、shopping-list / pantry / cheapest-store / recipe / price-record / fixture に触れていない | static | pass | git diff origin/main...HEAD --name-only |
| EV-06 | pnpm format:check が通る（レビュー時に落ちていた Markdown 表は整形済み） | test | pass | pnpm format:check |
| EV-07 | pnpm lint と pnpm type-check が通る（web の既存 unused-var warning 1 件は本差分外） | test | pass | pnpm lint / pnpm type-check |

<details>
<summary>AI assessment</summary>

- blocking open: 0
- high-impact unverified: 0
- follow-up open: 0
- reviewer: reviewer / claude-opus-5
- reviewed at: 2026-08-26T06:50:00Z

</details>

<!-- prettier-ignore-end -->
<!-- review-readiness:end -->

## 監査ログ

### 指摘と処置

| ID   | action    | 処置                                                                                                    |
| ---- | --------- | ------------------------------------------------------------------------------------------------------- |
| B-01 | BLOCK     | Markdown 表の Prettier 崩れ。`pnpm format` で 3 文書を整形し `pnpm format:check` が通ることを確認した。 |
| F-01 | FOLLOW_UP | JSDoc を日本語にし、500 回避と `asOf` 1 度評価（R-1）を追記した。                                       |
| F-02 | FOLLOW_UP | 本ファイルを作成し `handoff-check` を通す。                                                             |

### 完了条件の静的確認

- `apps/web/src/app/meal-plans/page.tsx` と `history/page.tsx` は `@cookpit/domain` を import しない。
- 週計算は `packages/application/src/meal-plan/meal-plan-week-query.ts`。Domain の `WeekIdentifier` は Application 内部でのみ使う。
- Get* UseCase のシグネチャは変更していない。
- shopping-list / pantry / cheapest-store / recipe / price-record / fixture に差分なし。

### security-reviewer

L2 省略条件を満たすため起動していない。既存の `?week=` 検証を Application へ移しただけで、入力境界の新設・緩和、依存追加、DB・認証・外部 I/O はない。

### 本レビューの限界

- 実ブラウザ確認は未実施（H-01）。
- 実装モデルは GPT-5.6 Luna high（Max ではなく high。Task slug 制約）。
