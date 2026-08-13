# レビュー記録: small-ux

<!-- review-readiness:begin -->
<!-- prettier-ignore-start -->

<!-- review-readiness:state
{
  "schemaVersion": 1,
  "feature": "small-ux",
  "status": "human_review_requested",
  "reviewTier": "R2",
  "subject": {
    "algorithm": "git-raw-v1",
    "baseSha": "c28123e6e38823e62548209bcd51aff6fc856aa5",
    "digest": "sha256:dc5d21e1dc94425eb421e62e9544608febefbee1ec30517bfd3b3cfe9e98befd",
    "source": "index",
    "entryCount": 16
  },
  "aiAssessment": {
    "blockingOpen": 0,
    "highImpactUnverified": 0,
    "followUpOpen": 1
  },
  "humanItems": [
    {
      "id": "H-01",
      "kind": "subjective",
      "question": "作り方の各行で、番号の左に並べ替え用のつまみが並ぶ見た目でよいか。",
      "recommendation": "accept。材料行と同じ操作に揃えた。狭いと感じるなら番号をつまみに兼ねる案へ戻せる。",
      "evidenceRefs": [
        "EV-04",
        "EV-06"
      ]
    }
  ],
  "residualRisks": [
    "手順を指で掴んだときの縦スクロールは自動試験で確認していない（材料と同じ実装）。",
    "商品画面でのスワイプ戻るは実機未確認（同じ離脱の仕組みはレシピ画面で確認済み）。"
  ],
  "behaviorChanges": [
    "商品の追加・編集で、入力したまま戻ろうとすると確認が出る。何も変えていなければすぐ戻れる。",
    "保存できたあとは確認なしで一覧または詳細へ移る。保存に失敗したあとは入力が残り、戻るときに確認が出る。",
    "レシピの作り方を、材料と同じようにつまみを掴んで並べ替えられる。キーボードでも動かせる。",
    "並べ替えた作り方の順が、保存後の詳細にもそのまま出る。"
  ],
  "evidence": [
    {
      "id": "EV-01",
      "claim": "品質ゲート（harness / lint / type-check / test）が通る",
      "kind": "test",
      "result": "pass",
      "ref": "run-quality-gates.sh RESULT OK。web 894 tests"
    },
    {
      "id": "EV-02",
      "claim": "商品フォームの未保存判定が空白差を無視し、別名の並び順差を検出する",
      "kind": "test",
      "result": "pass",
      "ref": "apps/web/tests/app/products/_utils/product-form-dirty.node.test.ts PFD-01〜07"
    },
    {
      "id": "EV-03",
      "claim": "商品の追加・編集で未編集は即離脱、編集後は確認、保存成功後は確認なし",
      "kind": "test",
      "result": "pass",
      "ref": "product-form-client.test.tsx PFC-01〜06 / product-edit-form-client.test.tsx PEC-01〜04"
    },
    {
      "id": "EV-04",
      "claim": "キーボードで手順を入れ替えられ、材料順は変わらず、送信順が UI 順になる",
      "kind": "test",
      "result": "pass",
      "ref": "recipe-form-fields.test.tsx RFF-13〜16 / recipe-form-dirty.node.test.ts RFD-14"
    },
    {
      "id": "EV-05",
      "claim": "API・DB・Domain の差分は無く、離脱の仕組みは既存フックの再利用",
      "kind": "static",
      "result": "pass",
      "ref": "git diff origin/main -- packages apps/web/src/server が空。use-leave-confirmation.ts 無変更"
    },
    {
      "id": "EV-06",
      "claim": "手順の並べ替えは材料と別リストで、touch-none はつまみだけ",
      "kind": "static",
      "result": "pass",
      "ref": "recipe-form-fields.tsx 別 DndContext / step-row.tsx ハンドルの touch-none"
    }
  ],
  "reviewer": {
    "agent": "orchestrator",
    "model": "cursor-grok-4.6",
    "reviewedAt": "2026-08-13T08:10:00Z"
  }
}
-->
## Review handoff

> **人間レビュー待ちです。**
> Claude の評価です。これは承認ではありません。以下の判断事項・残余リスク・振る舞い差分を確認してください。
> 対象: `sha256:dc5d21e1dc94…` / R2 / 16 changes

### あなたが判断・確認すること（1 件）

1. **[主観] 作り方の各行で、番号の左に並べ替え用のつまみが並ぶ見た目でよいか。** — 推奨: accept。材料行と同じ操作に揃えた。狭いと感じるなら番号をつまみに兼ねる案へ戻せる。 / 証拠: EV-04, EV-06

### 残余リスク・未確認

- 手順を指で掴んだときの縦スクロールは自動試験で確認していない（材料と同じ実装）。
- 商品画面でのスワイプ戻るは実機未確認（同じ離脱の仕組みはレシピ画面で確認済み）。

### 振る舞い差分

- 商品の追加・編集で、入力したまま戻ろうとすると確認が出る。何も変えていなければすぐ戻れる。
- 保存できたあとは確認なしで一覧または詳細へ移る。保存に失敗したあとは入力が残り、戻るときに確認が出る。
- レシピの作り方を、材料と同じようにつまみを掴んで並べ替えられる。キーボードでも動かせる。
- 並べ替えた作り方の順が、保存後の詳細にもそのまま出る。

### 証拠

| ID | 主張 | 種別 | 結果 | 参照 |
| --- | --- | --- | --- | --- |
| EV-01 | 品質ゲート（harness / lint / type-check / test）が通る | test | pass | run-quality-gates.sh RESULT OK。web 894 tests |
| EV-02 | 商品フォームの未保存判定が空白差を無視し、別名の並び順差を検出する | test | pass | apps/web/tests/app/products/\_utils/product-form-dirty.node.test.ts PFD-01〜07 |
| EV-03 | 商品の追加・編集で未編集は即離脱、編集後は確認、保存成功後は確認なし | test | pass | product-form-client.test.tsx PFC-01〜06 / product-edit-form-client.test.tsx PEC-01〜04 |
| EV-04 | キーボードで手順を入れ替えられ、材料順は変わらず、送信順が UI 順になる | test | pass | recipe-form-fields.test.tsx RFF-13〜16 / recipe-form-dirty.node.test.ts RFD-14 |
| EV-05 | API・DB・Domain の差分は無く、離脱の仕組みは既存フックの再利用 | static | pass | git diff origin/main -- packages apps/web/src/server が空。use-leave-confirmation.ts 無変更 |
| EV-06 | 手順の並べ替えは材料と別リストで、touch-none はつまみだけ | static | pass | recipe-form-fields.tsx 別 DndContext / step-row.tsx ハンドルの touch-none |

<details>
<summary>AI assessment</summary>

- blocking open: 0
- high-impact unverified: 0
- follow-up open: 1
- reviewer: orchestrator / cursor-grok-4.6
- reviewed at: 2026-08-13T08:10:00Z

</details>

<!-- prettier-ignore-end -->
<!-- review-readiness:end -->

## 監査ログ

- 日付: 2026-08-13
- 対象: 設計書 / 実装計画 / 試験計画 / 実装差分 / テスト / `docs/05-roadmap.md`
- 対象差分: `origin/main..HEAD` + 本コミットのログ追記
- レベル: L2 / review tier R2（UI の振る舞い変更。API・DB・認証なし）
- 省略: security-reviewer（外部 I/O・認証なし） / contract-designer（契約変更なし） / Codex ブリーフ（Orchestrator 経路）

### 検証済み指摘

検証済み指摘なし（BLOCK 0）。

| ID   | action    | impact | evidence | status | path:line                               | 根拠・再現                                                                                                                | 修正案                                                   |
| ---- | --------- | ------ | -------- | ------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| F-01 | FOLLOW_UP | low    | E1       | open   | docs/tests/recipe-form-usability.md:137 | 回帰表が「products のフォームは変更していない」のまま。歴史的対象外の記録としては正しいが、後続タスク後の鮮度は落ちている | small-ux 完了後に「後続 small-ux で適用」へ 1 行更新する |

### 設計との整合

- 商品離脱確認は既存 `useLeaveConfirmation` の結線のみ。スナップショットは `useState` 初期化関数（`useRef` 不使用）。
- 手順 DnD は材料と別 `DndContext` + `useId()`。`touch-none` はハンドルのみ。
- Domain / Application / Infrastructure / api-contract に差分なし。

### 試験計画との対応

- PFD-01〜07 / PFC-01〜06 / PEC-01〜04 / RFF-13〜16 / RFD-14 を実装し、品質ゲートで pass。
- 実画面 E-1〜E-3 は試験計画どおり本タスクの自動完了条件外。

### 品質ゲート

`bash .claude/scripts/run-quality-gates.sh` → RESULT OK。harness / lint / type-check / test。web 894 tests。
