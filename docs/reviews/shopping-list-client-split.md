# レビュー記録: shopping-list-client-split

- レベル: L2（Presentation 分割・挙動不変）
- 対象ブランチ: `cursor/shopping-list-client-split-c35c`
- 関連: `docs/designs/shopping-list-client-split.md` / `docs/implementation-plans/shopping-list-client-split.md` / `docs/tests/shopping-list-client-split.md`

<!-- review-readiness:begin -->
<!-- prettier-ignore-start -->

<!-- review-readiness:state
{
  "schemaVersion": 1,
  "feature": "shopping-list-client-split",
  "status": "human_review_requested",
  "reviewTier": "R2",
  "subject": {
    "algorithm": "git-raw-v1",
    "baseSha": "cc3efb977b2390021bd9ba9c1e27b96437c3fc6e",
    "digest": "sha256:65da07d717ba57d5d66929196e9cab3c457c34c0dd517c4f12ddc337296d4977",
    "source": "commit",
    "entryCount": 6
  },
  "aiAssessment": {
    "blockingOpen": 0,
    "highImpactUnverified": 0,
    "followUpOpen": 1
  },
  "humanItems": [
    {
      "id": "H-01",
      "kind": "unknown",
      "question": "ブラウザ実機確認なしで、この分割リファクタをマージしてよいか。",
      "recommendation": "accept_risk。既存 shopping-list-client RTL 101 件が分割前後で同アサーション緑。見た目変更は意図していない。",
      "evidenceRefs": [
        "EV-01",
        "EV-02",
        "EV-03"
      ]
    }
  ],
  "residualRisks": [
    "実ブラウザでの見た目・操作感は未確認（RTL 回帰のみ）。",
    "fixture 統一（createShoppingItemDto）は未着手の follow-up。"
  ],
  "behaviorChanges": [
    "買い物リスト詳細の見た目・操作・エラー文言は変わらない（内部の hooks 分割のみ）。",
    "チェック・購入・削除・追加・店舗再割当・Sync・更新・完了・再開の手順はこれまでどおり。",
    "オフライン中のキュー表示と、オンライン復帰後の自動再送もこれまでどおり。"
  ],
  "evidence": [
    {
      "id": "EV-01",
      "claim": "shopping-list-client 既存テスト 101 件が分割後もアサーション無変更で通る",
      "kind": "test",
      "result": "pass",
      "ref": "vitest run tests/app/shopping-lists/_components/shopping-list-client（6 files / 101 tests）"
    },
    {
      "id": "EV-02",
      "claim": "use-checked-sync-queue 関連テストを含め 116 件が通る",
      "kind": "test",
      "result": "pass",
      "ref": "vitest … shopping-list-client + use-checked-sync-queue（7 files / 116 tests）"
    },
    {
      "id": "EV-03",
      "claim": "web の lint / type-check が通る（既存 warning 1 件のみ・本件無関係）",
      "kind": "test",
      "result": "pass",
      "ref": "pnpm --filter @cookpit/web lint / type-check"
    },
    {
      "id": "EV-04",
      "claim": "Domain / Application / Infrastructure / api-contract / Hono ルートに差分がない",
      "kind": "static",
      "result": "pass",
      "ref": "git diff origin/main -- packages apps/web/src/server が空。変更は shopping-lists Presentation と docs のみ"
    },
    {
      "id": "EV-05",
      "claim": "Sync / refetch の onSuccess で items と coveredIngredients を同じブロックで置換している",
      "kind": "static",
      "result": "pass",
      "ref": "use-shopping-list-items.ts handleSync / handleRefetch（PR #184 不変条件）"
    }
  ],
  "reviewer": {
    "agent": "orchestrator",
    "model": "cursor-grok-4.5",
    "reviewedAt": "2026-08-25T02:40:00Z"
  }
}
-->
## Review handoff

> **人間レビュー待ちです。**
> Claude の評価です。これは承認ではありません。以下の判断事項・残余リスク・振る舞い差分を確認してください。
> 対象: `sha256:65da07d717ba…` / R2 / 6 changes

### あなたが判断・確認すること（1 件）

1. **[未知] ブラウザ実機確認なしで、この分割リファクタをマージしてよいか。** — 推奨: accept\_risk。既存 shopping-list-client RTL 101 件が分割前後で同アサーション緑。見た目変更は意図していない。 / 証拠: EV-01, EV-02, EV-03

### 残余リスク・未確認

- 実ブラウザでの見た目・操作感は未確認（RTL 回帰のみ）。
- fixture 統一（createShoppingItemDto）は未着手の follow-up。

### 振る舞い差分

- 買い物リスト詳細の見た目・操作・エラー文言は変わらない（内部の hooks 分割のみ）。
- チェック・購入・削除・追加・店舗再割当・Sync・更新・完了・再開の手順はこれまでどおり。
- オフライン中のキュー表示と、オンライン復帰後の自動再送もこれまでどおり。

### 証拠

| ID | 主張 | 種別 | 結果 | 参照 |
| --- | --- | --- | --- | --- |
| EV-01 | shopping-list-client 既存テスト 101 件が分割後もアサーション無変更で通る | test | pass | vitest run tests/app/shopping-lists/\_components/shopping-list-client（6 files / 101 tests） |
| EV-02 | use-checked-sync-queue 関連テストを含め 116 件が通る | test | pass | vitest … shopping-list-client + use-checked-sync-queue（7 files / 116 tests） |
| EV-03 | web の lint / type-check が通る（既存 warning 1 件のみ・本件無関係） | test | pass | pnpm --filter @cookpit/web lint / type-check |
| EV-04 | Domain / Application / Infrastructure / api-contract / Hono ルートに差分がない | static | pass | git diff origin/main -- packages apps/web/src/server が空。変更は shopping-lists Presentation と docs のみ |
| EV-05 | Sync / refetch の onSuccess で items と coveredIngredients を同じブロックで置換している | static | pass | use-shopping-list-items.ts handleSync / handleRefetch（PR \#184 不変条件） |

<details>
<summary>AI assessment</summary>

- blocking open: 0
- high-impact unverified: 0
- follow-up open: 1
- reviewer: orchestrator / cursor-grok-4.5
- reviewed at: 2026-08-25T02:40:00Z

</details>

<!-- prettier-ignore-end -->
<!-- review-readiness:end -->

## 監査ログ

### 分割の機械確認

- `shopping-list-client.tsx` は ~26KB → ~10KB。状態と操作は
  `use-shopping-list-items.ts` / `use-shopping-list-complete.ts` へ移動。
- `useCheckedSyncQueue` の実装・テストは無変更（配線のみ items hook 側）。
- 既存 `shopping-list-client.*.test.tsx` のアサーションは無変更。

### FOLLOW_UP

- F-01: `createShoppingItemDto` フィクスチャ統一（本 PR 対象外・指示どおり）。

### 本レビューの限界

- 独立 reviewer サブエージェントは未起動（Orchestrator 自己レビュー）。
- 実ブラウザ確認は未実施（H-01）。
