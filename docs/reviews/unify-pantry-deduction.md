# レビュー記録: unify-pantry-deduction

- レベル: L2（Application 内部。パントリー控除の Generate/Sync 統一）
- 対象ブランチ: `cursor/unify-pantry-deduction-9527`
- 関連: `docs/designs/unify-pantry-deduction.md` / `docs/implementation-plans/unify-pantry-deduction.md` / `docs/tests/unify-pantry-deduction.md`

<!-- review-readiness:begin -->
<!-- prettier-ignore-start -->

<!-- review-readiness:state
{
  "schemaVersion": 1,
  "feature": "unify-pantry-deduction",
  "status": "human_review_requested",
  "reviewTier": "R2",
  "subject": {
    "algorithm": "git-raw-v1",
    "baseSha": "1314dee1dee1c0c151afdc433059f71c3b8f277f",
    "digest": "sha256:dad2a7c96602ad6e4a396ab80afd04f97a9093377c48e39a7dc07cc87c2110af",
    "source": "commit",
    "entryCount": 8
  },
  "aiAssessment": {
    "blockingOpen": 0,
    "highImpactUnverified": 0,
    "followUpOpen": 0
  },
  "humanItems": [
    {
      "id": "H-1",
      "kind": "subjective",
      "question": "可算単位で端数が出る材料の再同期で、買う量が切り上げ値から端数へ下がる非一致を今回は受容しますか",
      "recommendation": "accept_risk。切り上げは在庫がある場合だけ効く既存ルールに由来し、直すと在庫なし Generate の買う量も変わる。整数必要量では Generate と Sync は一致する",
      "evidenceRefs": [
        "EV-01",
        "EV-02"
      ]
    }
  ],
  "residualRisks": [
    "可算単位で生必要量に小数が出る材料は、部分引き算後の再同期で買う量が Generate 時の切り上げ値と一致しない状態が残る（本タスクでは D-5 を変えない）",
    "献立を変えない同期でも在庫の再読み出しが毎回発生する（保存は行われない）"
  ],
  "behaviorChanges": [
    "手持ちの在庫だけで足りる材料は、献立を編集して買い物リストへ反映したときにも一覧から消え、在庫でまかなえた材料として表示される",
    "献立を変えずに買い物リストへ反映し直しても、買う量が在庫を引く前の量に戻らなくなり、リストは何も変わらない",
    "献立の分量が減って、すでに在庫から引いた分だけで足りる材料は、一覧から消えて在庫でまかなえた扱いになる",
    "分量が減ってもまだ足りない材料は、不足している分だけが買う量として残る"
  ],
  "evidence": [
    {
      "id": "EV-01",
      "claim": "application パッケージの全テストが緑（diff 単体と Generate vs Sync 一致ロックを含む）",
      "kind": "test",
      "result": "pass",
      "ref": "pnpm --filter @cookpit/application test → 27 files / 432 tests passed"
    },
    {
      "id": "EV-02",
      "claim": "控除ルールの実体は applyPantryDeduction のみ。Generate と Sync はフル量相当を渡す",
      "kind": "static",
      "result": "pass",
      "ref": "packages/application/src/shopping-list/ingredient-aggregation.ts / generate-shopping-list.use-case.ts / sync-shopping-list-diff.ts"
    },
    {
      "id": "EV-03",
      "claim": "bought と manually_added は同期後も削除・数量変更されない",
      "kind": "test",
      "result": "pass",
      "ref": "packages/application/tests/shopping-list/sync-shopping-list-from-meal-plan.use-case.test.ts"
    },
    {
      "id": "EV-04",
      "claim": "CompleteShopping・献立修復・Domain・web・api-contract に差分がない",
      "kind": "static",
      "result": "pass",
      "ref": "git diff origin/main...HEAD --stat"
    },
    {
      "id": "EV-05",
      "claim": "lint と type-check が通る",
      "kind": "static",
      "result": "pass",
      "ref": "pnpm lint / pnpm type-check"
    }
  ],
  "reviewer": {
    "agent": "reviewer",
    "model": "claude-opus-5",
    "reviewedAt": "2026-08-26T13:20:00Z"
  }
}
-->
## Review handoff

> **人間レビュー待ちです。**
> Claude の評価です。これは承認ではありません。以下の判断事項・残余リスク・振る舞い差分を確認してください。
> 対象: `sha256:dad2a7c96602…` / R2 / 8 changes

### あなたが判断・確認すること（1 件）

1. **[主観] 可算単位で端数が出る材料の再同期で、買う量が切り上げ値から端数へ下がる非一致を今回は受容しますか** — 推奨: accept\_risk。切り上げは在庫がある場合だけ効く既存ルールに由来し、直すと在庫なし Generate の買う量も変わる。整数必要量では Generate と Sync は一致する / 証拠: EV-01, EV-02

### 残余リスク・未確認

- 可算単位で生必要量に小数が出る材料は、部分引き算後の再同期で買う量が Generate 時の切り上げ値と一致しない状態が残る（本タスクでは D-5 を変えない）
- 献立を変えない同期でも在庫の再読み出しが毎回発生する（保存は行われない）

### 振る舞い差分

- 手持ちの在庫だけで足りる材料は、献立を編集して買い物リストへ反映したときにも一覧から消え、在庫でまかなえた材料として表示される
- 献立を変えずに買い物リストへ反映し直しても、買う量が在庫を引く前の量に戻らなくなり、リストは何も変わらない
- 献立の分量が減って、すでに在庫から引いた分だけで足りる材料は、一覧から消えて在庫でまかなえた扱いになる
- 分量が減ってもまだ足りない材料は、不足している分だけが買う量として残る

### 証拠

| ID | 主張 | 種別 | 結果 | 参照 |
| --- | --- | --- | --- | --- |
| EV-01 | application パッケージの全テストが緑（diff 単体と Generate vs Sync 一致ロックを含む） | test | pass | pnpm --filter @cookpit/application test → 27 files / 432 tests passed |
| EV-02 | 控除ルールの実体は applyPantryDeduction のみ。Generate と Sync はフル量相当を渡す | static | pass | packages/application/src/shopping-list/ingredient-aggregation.ts / generate-shopping-list.use-case.ts / sync-shopping-list-diff.ts |
| EV-03 | bought と manually\_added は同期後も削除・数量変更されない | test | pass | packages/application/tests/shopping-list/sync-shopping-list-from-meal-plan.use-case.test.ts |
| EV-04 | CompleteShopping・献立修復・Domain・web・api-contract に差分がない | static | pass | git diff origin/main...HEAD --stat |
| EV-05 | lint と type-check が通る | static | pass | pnpm lint / pnpm type-check |

<details>
<summary>AI assessment</summary>

- blocking open: 0
- high-impact unverified: 0
- follow-up open: 0
- reviewer: reviewer / claude-opus-5
- reviewed at: 2026-08-26T13:20:00Z

</details>

<!-- prettier-ignore-end -->
<!-- review-readiness:end -->

## 監査ログ

### 2026-08-26 Orchestrator 経路

- 変更レベル: L2。契約・DB・UI なし。security-reviewer は省略（内部 Application ロジック、秘密情報・外部 I/O・認証・依存追加なし）。
- 実装: `applyQuantityUpdate` を `reconcileItemDeduction` に置換。控除エンジンは `applyPantryDeduction` のみ。
- Reviewer: blocking 0。文書追随漏れは Orchestrator が設計/計画/試験計画と `meal-plan-sync` 注記で解消。
- CompleteShopping の保存順と献立 shopping→cooking 修復は未変更。
