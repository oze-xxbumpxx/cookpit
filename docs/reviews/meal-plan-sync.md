# レビュー記録: meal-plan-sync

<!-- review-readiness:begin -->
<!-- prettier-ignore-start -->

<!-- review-readiness:state
{
  "schemaVersion": 1,
  "feature": "meal-plan-sync",
  "status": "human_review_requested",
  "reviewTier": "R3",
  "subject": {
    "algorithm": "git-raw-v1",
    "baseSha": "7334ce21632e8d029f8630887e68e0183125a680",
    "digest": "sha256:51a3c4e378fd1e86b8b11e8e6504d2888ac9e4ebbbfc9f0ed111030c23283925",
    "source": "commit",
    "entryCount": 20
  },
  "aiAssessment": {
    "blockingOpen": 0,
    "highImpactUnverified": 0,
    "followUpOpen": 2
  },
  "humanItems": [
    {
      "id": "H-01",
      "kind": "subjective",
      "question": "生成時に在庫を引いた品目が、献立を変えずに同期すると買う量が生値まで戻る挙動を、R-4 としてこの PR で受容しますか。",
      "recommendation": "accept_risk。P-6 で生値列を足せないため本 PR では直せない。説明は『Pantry が空なら起きない』から『生成時に在庫を引いたあとの再同期で起きる』へ直した。拒否するなら次 PR で生値の保持が要る。",
      "evidenceRefs": [
        "EV-04",
        "EV-08"
      ]
    },
    {
      "id": "H-02",
      "kind": "irreversible",
      "question": "献立由来の未チェック品目が、同期ボタン1回で確認なしに物理削除されることを受け入れますか。",
      "recommendation": "accept_risk。Gate A の P-1 で削除対象は確定済みで、消えるのは献立から再生成できる pending のみ。手動削除には確認があるが、同期削除は無言である点だけ人間が同意する必要がある。",
      "evidenceRefs": [
        "EV-03"
      ]
    }
  ],
  "residualRisks": [
    "生成時に在庫を引いた品目は、献立変更なしの同期で買う量が生値へ戻ることがある（R-4。H-01）。",
    "ShoppingList 保存成功後の Pantry 保存失敗は Unit B まで残る既知の部分失敗窓である。",
    "同期ボタンの二重送信防止（pending 中 disabled）はコンポーネントテスト未追加で、実装の disabled={syncAction.pending} の静的確認のみ。"
  ],
  "behaviorChanges": [
    "献立からレシピを外して「献立の変更を反映」を押すと、未チェックの献立由来の品目が買い物リストから消える。チェック済みと手動追加は残り、確認ダイアログは出ない。",
    "レシピの倍量を変えると、未チェックの献立由来の品目の数量が新しい値に置き換わる。チェック済みの数量は変わらない。",
    "同期後の通知が「追加N件・更新N件・削除N件」になり、変化が無いときは「変更はありませんでした」と出る。",
    "在庫を引いて少なく作られた品目は、献立を変えずに同期すると在庫を引く前の量まで戻ることがある。",
    "献立に変更が無く、品目の買う量が集計生値と一致していれば、同期を押しても保存しない。"
  ],
  "evidence": [
    {
      "id": "EV-01",
      "claim": "lint と type-check が通る（既存 warning 1 件は対象外）",
      "kind": "static",
      "result": "pass",
      "ref": "pnpm lint / pnpm type-check。web lint warning は product-form-fields.test.tsx:8"
    },
    {
      "id": "EV-02",
      "claim": "品質ゲートの test が通る",
      "kind": "test",
      "result": "pass",
      "ref": "run-quality-gates.sh RESULT OK。domain 447 / application 370 / web 867 / infrastructure 101"
    },
    {
      "id": "EV-03",
      "claim": "pending の from_meal_plan は削除され bought と手動追加は残る",
      "kind": "test",
      "result": "pass",
      "ref": "sync-shopping-list-from-meal-plan.use-case.test.ts の削除3件と複合ケース"
    },
    {
      "id": "EV-04",
      "claim": "品目の requiredAmount は買う量であり、再同期の比較対象は集計生値である",
      "kind": "static",
      "result": "pass",
      "ref": "generate-shopping-list.use-case.ts の applyPantryDeduction 後 create / sync の updateCandidates"
    },
    {
      "id": "EV-05",
      "claim": "PantryRepository.find は null を返さない契約で UseCase と一致する",
      "kind": "static",
      "result": "pass",
      "ref": "packages/domain/src/pantry/pantry.repository.ts と sync UseCase の find()"
    },
    {
      "id": "EV-06",
      "claim": "数量更新は既存 upsert の数量列に乗り、save 後 find で保持される",
      "kind": "test",
      "result": "pass",
      "ref": "drizzle-shopping-list.repository.test.ts の数量更新 save→find"
    },
    {
      "id": "EV-07",
      "claim": "api-contract と server route と Infrastructure 本番コードは無変更",
      "kind": "static",
      "result": "pass",
      "ref": "git diff main...HEAD -- packages/api-contract apps/web/src/server packages/infrastructure/src"
    },
    {
      "id": "EV-08",
      "claim": "R-4 の説明を『生成時に在庫を引いたあとの再同期』へ直し、A-16 A-17 A-20 を追加した",
      "kind": "test",
      "result": "pass",
      "ref": "docs/designs/meal-plan-sync.md R-4 / ADR-0018 / application UseCase テスト追記"
    }
  ],
  "reviewer": {
    "agent": "reviewer",
    "model": "claude-opus-5",
    "reviewedAt": "2026-08-13T05:25:00.000Z"
  }
}
-->
## Review handoff

> **人間レビュー待ちです。**
> Claude の評価です。これは承認ではありません。以下の判断事項・残余リスク・振る舞い差分を確認してください。
> 対象: `sha256:51a3c4e378fd…` / R3 / 20 changes

### あなたが判断・確認すること（2 件）

1. **[主観] 生成時に在庫を引いた品目が、献立を変えずに同期すると買う量が生値まで戻る挙動を、R-4 としてこの PR で受容しますか。** — 推奨: accept\_risk。P-6 で生値列を足せないため本 PR では直せない。説明は『Pantry が空なら起きない』から『生成時に在庫を引いたあとの再同期で起きる』へ直した。拒否するなら次 PR で生値の保持が要る。 / 証拠: EV-04, EV-08
2. **[不可逆] 献立由来の未チェック品目が、同期ボタン1回で確認なしに物理削除されることを受け入れますか。** — 推奨: accept\_risk。Gate A の P-1 で削除対象は確定済みで、消えるのは献立から再生成できる pending のみ。手動削除には確認があるが、同期削除は無言である点だけ人間が同意する必要がある。 / 証拠: EV-03

### 残余リスク・未確認

- 生成時に在庫を引いた品目は、献立変更なしの同期で買う量が生値へ戻ることがある（R-4。H-01）。
- ShoppingList 保存成功後の Pantry 保存失敗は Unit B まで残る既知の部分失敗窓である。
- 同期ボタンの二重送信防止（pending 中 disabled）はコンポーネントテスト未追加で、実装の disabled={syncAction.pending} の静的確認のみ。

### 振る舞い差分

- 献立からレシピを外して「献立の変更を反映」を押すと、未チェックの献立由来の品目が買い物リストから消える。チェック済みと手動追加は残り、確認ダイアログは出ない。
- レシピの倍量を変えると、未チェックの献立由来の品目の数量が新しい値に置き換わる。チェック済みの数量は変わらない。
- 同期後の通知が「追加N件・更新N件・削除N件」になり、変化が無いときは「変更はありませんでした」と出る。
- 在庫を引いて少なく作られた品目は、献立を変えずに同期すると在庫を引く前の量まで戻ることがある。
- 献立に変更が無く、品目の買う量が集計生値と一致していれば、同期を押しても保存しない。

### 証拠

| ID | 主張 | 種別 | 結果 | 参照 |
| --- | --- | --- | --- | --- |
| EV-01 | lint と type-check が通る（既存 warning 1 件は対象外） | static | pass | pnpm lint / pnpm type-check。web lint warning は product-form-fields.test.tsx:8 |
| EV-02 | 品質ゲートの test が通る | test | pass | run-quality-gates.sh RESULT OK。domain 447 / application 370 / web 867 / infrastructure 101 |
| EV-03 | pending の from\_meal\_plan は削除され bought と手動追加は残る | test | pass | sync-shopping-list-from-meal-plan.use-case.test.ts の削除3件と複合ケース |
| EV-04 | 品目の requiredAmount は買う量であり、再同期の比較対象は集計生値である | static | pass | generate-shopping-list.use-case.ts の applyPantryDeduction 後 create / sync の updateCandidates |
| EV-05 | PantryRepository.find は null を返さない契約で UseCase と一致する | static | pass | packages/domain/src/pantry/pantry.repository.ts と sync UseCase の find\(\) |
| EV-06 | 数量更新は既存 upsert の数量列に乗り、save 後 find で保持される | test | pass | drizzle-shopping-list.repository.test.ts の数量更新 save→find |
| EV-07 | api-contract と server route と Infrastructure 本番コードは無変更 | static | pass | git diff main...HEAD -- packages/api-contract apps/web/src/server packages/infrastructure/src |
| EV-08 | R-4 の説明を『生成時に在庫を引いたあとの再同期』へ直し、A-16 A-17 A-20 を追加した | test | pass | docs/designs/meal-plan-sync.md R-4 / ADR-0018 / application UseCase テスト追記 |

<details>
<summary>AI assessment</summary>

- blocking open: 0
- high-impact unverified: 0
- follow-up open: 2
- reviewer: reviewer / claude-opus-5
- reviewed at: 2026-08-13T05:25:00.000Z

</details>

<!-- prettier-ignore-end -->
<!-- review-readiness:end -->

## 監査ログ

### Task 1: 実装レビュー（2026-08-13）

独立 reviewer（claude-opus-5）と security-reviewer の指摘。初回 BLOCK 2 件は本コミットで処置した。

| ID              | action             | impact | status        | 処置                                                                                           |
| --------------- | ------------------ | ------ | ------------- | ---------------------------------------------------------------------------------------------- |
| R-01            | HUMAN_DECISION     | high   | accepted_risk | コードは変えず、R-4 の説明を「生成時に在庫を引いたあとの再同期」へ直した。H-01                 |
| R-02            | FOLLOW_UP から解消 | high   | resolved      | A-16 / A-17 / A-20 を追加して通過                                                              |
| R-03            | FOLLOW_UP          | medium | open          | 必須分岐以外の観点の残り。C-8/C-9/C-10 と A-6/A-11/A-12 は追加済み。C-7 と一部 Domain 境界は未 |
| R-04            | FOLLOW_UP          | medium | resolved      | ADR-0007 の決定番号の誤引用を要件・設計で修正。決定6（明示トリガ）は維持                       |
| R-05            | FOLLOW_UP          | low    | resolved      | 減少時も品目側の単位原文を保つ                                                                 |
| R-06            | PRE_EXISTING       | medium | accepted_risk | ShoppingList / Pantry の部分失敗窓。Unit B                                                     |
| R-07            | PRE_EXISTING       | low    | open          | amountNote 材料の集計非畳み。今回悪化なし                                                      |
| R-08            | PRE_EXISTING       | low    | open          | ADR-0017 番号重複。今回の差分外                                                                |
| SEC-01 / SEC-02 | PRE_EXISTING       | high   | open          | pnpm audit の eslint 配下 DoS。lockfile 未変更                                                 |
| SEC-03          | HUMAN_DECISION     | low    | open          | no-auth のまま sync が破壊的になった。ADR-0003 の再評価は H-02 の隣接                          |
| SEC-04          | FOLLOW_UP          | low    | open          | `updateRequiredAmount` は素の Error。現状は UseCase が絞るので到達しない                       |

security-reviewer: 差分起因の BLOCK なし。認証・入力境界・秘密情報の新規触点なし。

### 品質ゲート

`bash .claude/scripts/run-quality-gates.sh`（実装コミット時点）: harness / lint / type-check / test すべて PASS。
