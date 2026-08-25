# レビュー記録: dashboard-home-ia

- レベル: L2（Presentation のみ。Domain / Application / Infrastructure に差分なし）
- 対象ブランチ: `cursor/dashboard-home-ia-f91d`（PR #188、base `origin/main`）
- 関連: `docs/designs/dashboard-home-ia.md` / `docs/implementation-plans/dashboard-home-ia.md` / `docs/tests/dashboard-home-ia.md`

<!-- review-readiness:begin -->
<!-- prettier-ignore-start -->

<!-- review-readiness:state
{
  "schemaVersion": 1,
  "feature": "dashboard-home-ia",
  "status": "human_review_requested",
  "reviewTier": "R2",
  "subject": {
    "algorithm": "git-raw-v1",
    "baseSha": "4e73ac486fa24a331a7ccec7eb4a10998787cdec",
    "digest": "sha256:0bc5114652c98635328fe0a6ac578be7374dea14eaab4bd71e2b05b62a0df96c",
    "source": "commit",
    "entryCount": 15
  },
  "aiAssessment": {
    "blockingOpen": 0,
    "highImpactUnverified": 0,
    "followUpOpen": 0
  },
  "humanItems": [
    {
      "id": "H-01",
      "kind": "subjective",
      "question": "献立も期限在庫も無い空状態のホーム余白と、ヒーロー＋ステッパーの密度は運用上許容できるか。",
      "recommendation": "accept_risk。シードに今週の献立が無いため空に見えるのは仕様。390px / 320px / 1280px でヒーロー・5タブ・その他画面は描画済み。",
      "evidenceRefs": [
        "EV-08"
      ]
    }
  ],
  "residualRisks": [
    "Playwright E2E スイート（saturday-flow 等）は今回未実行。ホーム・下部タブを参照する spec が無いことの静的確認で代替する。",
    "買い物中・消費中のヒーロー CTA 切替は RTL で固定し、シード空状態の実画面では未作成 CTA のみ確認した。"
  ],
  "behaviorChanges": [
    "ホーム先頭が「次の一手」1 つの見出し + ボタンになり、献立の状態で遷移先が変わる（未作成→献立、買い物中→買い物リスト、消費中→在庫）。",
    "ホームの献立カードは全体をタップしても献立へ移動しなくなり、ボタンだけが遷移する。",
    "ホームに「献立→買い物→調理→消費→完了」の進捗表示が加わる（表示のみでタップできない）。",
    "ホーム下部の「メニュー」5 リンクが無くなる。",
    "下部タブが 6 個から 5 個（ホーム/献立/買い物/在庫/その他）になり、レシピ・商品は「その他」画面から開く。"
  ],
  "evidence": [
    {
      "id": "EV-01",
      "claim": "apps/web の Vitest が 79 ファイル / 930 件すべて通る（NA/SS/DH/NV/MM を含む）",
      "kind": "test",
      "result": "pass",
      "ref": "pnpm --filter @cookpit/web test（2026-08-25）"
    },
    {
      "id": "EV-02",
      "claim": "品質ゲート harness/lint/type-check/test がすべて成功する",
      "kind": "test",
      "result": "pass",
      "ref": ".claude/scripts/run-quality-gates.sh（2026-08-25）RESULT: OK"
    },
    {
      "id": "EV-03",
      "claim": "packages/ と apps/web/src/server に差分が無く、dashboard-view.ts の Application 参照は import type のみ",
      "kind": "static",
      "result": "pass",
      "ref": "git diff --stat origin/main...HEAD -- packages apps/web/src/server が空"
    },
    {
      "id": "EV-04",
      "claim": "試験計画の全 ID（NA/SS/LBL/DH/NV/MM）が実テストに存在する",
      "kind": "static",
      "result": "pass",
      "ref": "dashboard-view.node.test.ts / dashboard.test.tsx / nav-bar.test.tsx / more-menu.test.tsx"
    },
    {
      "id": "EV-05",
      "claim": "ヒーローは Link で包まれず CTA だけがリンクで、ステッパーの li はリンクを持たない",
      "kind": "static",
      "result": "pass",
      "ref": "dashboard.tsx ヒーロー節（DH-06 が回帰を固定）"
    },
    {
      "id": "EV-06",
      "claim": "旧 IA 記述は dashboard.md と ui-visibility-tokens.md で 5 タブ・/more へ更新済み（F-01 クローズ）",
      "kind": "static",
      "result": "pass",
      "ref": "docs/designs/dashboard.md / docs/designs/ui-visibility-tokens.md"
    },
    {
      "id": "EV-07",
      "claim": "ローディングの見出しスケルトン行を削除し、ヒーローカード相当の h-40 のみにした（F-03 クローズ）",
      "kind": "static",
      "result": "pass",
      "ref": "apps/web/src/app/loading.tsx"
    },
    {
      "id": "EV-08",
      "claim": "dev:pglite + Playwright Chromium で MB-01〜14 がすべて成功（ホーム空状態・5タブ・/more・recipes/products でその他 active・320px ナビ高さ 59px・desktop ナビ幅 448）",
      "kind": "black_box",
      "result": "pass",
      "ref": "Playwright 対 http://localhost:3000（2026-08-25）FAIL 0"
    }
  ],
  "reviewer": {
    "agent": "reviewer",
    "model": "claude-opus-5",
    "reviewedAt": "2026-08-25T13:10:00Z"
  }
}
-->
## Review handoff

> **人間レビュー待ちです。**
> Claude の評価です。これは承認ではありません。以下の判断事項・残余リスク・振る舞い差分を確認してください。
> 対象: `sha256:0bc5114652c9…` / R2 / 15 changes

### あなたが判断・確認すること（1 件）

1. **[主観] 献立も期限在庫も無い空状態のホーム余白と、ヒーロー＋ステッパーの密度は運用上許容できるか。** — 推奨: accept\_risk。シードに今週の献立が無いため空に見えるのは仕様。390px / 320px / 1280px でヒーロー・5タブ・その他画面は描画済み。 / 証拠: EV-08

### 残余リスク・未確認

- Playwright E2E スイート（saturday-flow 等）は今回未実行。ホーム・下部タブを参照する spec が無いことの静的確認で代替する。
- 買い物中・消費中のヒーロー CTA 切替は RTL で固定し、シード空状態の実画面では未作成 CTA のみ確認した。

### 振る舞い差分

- ホーム先頭が「次の一手」1 つの見出し + ボタンになり、献立の状態で遷移先が変わる（未作成→献立、買い物中→買い物リスト、消費中→在庫）。
- ホームの献立カードは全体をタップしても献立へ移動しなくなり、ボタンだけが遷移する。
- ホームに「献立→買い物→調理→消費→完了」の進捗表示が加わる（表示のみでタップできない）。
- ホーム下部の「メニュー」5 リンクが無くなる。
- 下部タブが 6 個から 5 個（ホーム/献立/買い物/在庫/その他）になり、レシピ・商品は「その他」画面から開く。

### 証拠

| ID | 主張 | 種別 | 結果 | 参照 |
| --- | --- | --- | --- | --- |
| EV-01 | apps/web の Vitest が 79 ファイル / 930 件すべて通る（NA/SS/DH/NV/MM を含む） | test | pass | pnpm --filter @cookpit/web test（2026-08-25） |
| EV-02 | 品質ゲート harness/lint/type-check/test がすべて成功する | test | pass | .claude/scripts/run-quality-gates.sh（2026-08-25）RESULT: OK |
| EV-03 | packages/ と apps/web/src/server に差分が無く、dashboard-view.ts の Application 参照は import type のみ | static | pass | git diff --stat origin/main...HEAD -- packages apps/web/src/server が空 |
| EV-04 | 試験計画の全 ID（NA/SS/LBL/DH/NV/MM）が実テストに存在する | static | pass | dashboard-view.node.test.ts / dashboard.test.tsx / nav-bar.test.tsx / more-menu.test.tsx |
| EV-05 | ヒーローは Link で包まれず CTA だけがリンクで、ステッパーの li はリンクを持たない | static | pass | dashboard.tsx ヒーロー節（DH-06 が回帰を固定） |
| EV-06 | 旧 IA 記述は dashboard.md と ui-visibility-tokens.md で 5 タブ・/more へ更新済み（F-01 クローズ） | static | pass | docs/designs/dashboard.md / docs/designs/ui-visibility-tokens.md |
| EV-07 | ローディングの見出しスケルトン行を削除し、ヒーローカード相当の h-40 のみにした（F-03 クローズ） | static | pass | apps/web/src/app/loading.tsx |
| EV-08 | dev:pglite + Playwright Chromium で MB-01〜14 がすべて成功（ホーム空状態・5タブ・/more・recipes/products でその他 active・320px ナビ高さ 59px・desktop ナビ幅 448） | black\_box | pass | Playwright 対 http://localhost:3000（2026-08-25）FAIL 0 |

<details>
<summary>AI assessment</summary>

- blocking open: 0
- high-impact unverified: 0
- follow-up open: 0
- reviewer: reviewer / claude-opus-5
- reviewed at: 2026-08-25T13:10:00Z

</details>

<!-- prettier-ignore-end -->
<!-- review-readiness:end -->

## 監査ログ

### Task 1: dashboard-home-ia の受け入れレビュー（2026-08-25 / reviewer）

対象は `origin/main...HEAD` の commit diff（14 entries、実装 6 ファイル + テスト 4 ファイル + 文書 4 ファイル）。

#### review tier

`R2`。成果物 Level は L2、tier は既定どおり同番号。UI（ホーム画面 IA・グローバルナビ）の
振る舞いが変わるため R2 の要求（独立 Reviewer + 対象 black-box 相当の証拠）を適用した。
R3 の trigger（migration / 削除 API / 認証 / 外部 I/O / `.github` / `.claude`）には該当しない。
セキュリティレビューは依頼どおり省略（依存追加なし・秘密情報なし・認可/入力検証の変更なし）。

#### 検証済み指摘

| ID   | action    | impact | evidence | status | path:line                                                               | 根拠・再現                                                  | 修正案                                    |
| ---- | --------- | ------ | -------- | ------ | ----------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| F-01 | FOLLOW_UP | medium | E1       | closed | `docs/designs/dashboard.md:25` / `docs/designs/ui-visibility-tokens.md` | 旧 IA（クイックリンク・6 タブ）が現状記述のまま残っていた。 | 5 タブ・`/more` へ更新済み（`a297fb4`）。 |
| F-02 | FOLLOW_UP | low    | E1       | closed | `docs/designs/dashboard-home-ia.md` 実装記録                            | `aria-label` の許容根拠の参照先が設計書になっていた。       | 実装計画側へ訂正済み。                    |
| F-03 | FOLLOW_UP | low    | E1       | closed | `apps/web/src/app/loading.tsx`                                          | ヒーロー化後も見出しスケルトン行が残っていた。              | `h-40` カードのみに変更済み。             |

`BLOCK` は 0 件。`critical` / `high` に該当する未検証候補も 0 件。

#### 指摘へ昇格しなかった候補（記録のみ）

- `nav-bar.tsx:27-31`: `/more` の active 判定が `pathname.startsWith('/recipes')` で境界を持たないため、
  将来 `/recipes-archive` のようなパスができると誤 active になる。設計書 §NavBar で確定済みの
  コードであり、現在そのようなルートは存在しないため昇格しない。
- `nav-bar.tsx:39-41`: 背景と上 border が内側 `max-w-md` の `<div>` に移った一方、外側 `<nav>` は
  `fixed inset-x-0` のまま。幅広ビューポートでは下部に透明な帯が残りポインタを受けるが、各ページ本体も
  `max-w-md` 中央寄せで、帯の左右に重なる操作要素が無いため実害を確認できず昇格しない。
- `more/_components/more-menu.tsx:12`: `<nav>` に aria-label が無く、`/more` では無名の navigation
  landmark が 2 つになる。旧 `Dashboard` の `QUICK_LINKS` `<nav>` も同じ状態だった PRE_EXISTING パターンの
  移設であり、今回の差分が悪化させたとは言えない。
- `dashboard.tsx:85-90` と `dashboard.tsx:127-132`: `consuming` のとき「在庫を見る」リンクが同一画面に
  2 つ並ぶ（どちらも `/pantry`）。設計・試験計画とも DH-05 で意図として固定済み。

#### PRE_EXISTING

- `apps/web/tests/app/products/_components/product-form-fields.test.tsx:8` の未使用変数 warning
  （`@typescript-eslint/no-unused-vars`）。本差分の対象外ファイルで、`pnpm lint` は 0 error / 1 warning。

#### 設計 vs 実装 vs 試験計画の整合

- 設計書 §フロントエンド設計の `getNextAction` / `MEAL_PLAN_STATUS_STEPS` / `getStepState` は
  `apps/web/src/app/_utils/dashboard-view.ts:11-89` に文言・href・順序ともコード片どおり実装。
  `default` 節なしの網羅 `switch` も維持されている。
- `dashboard.tsx:61-113` はヒーロー（`mealPlan !== null` のときのみ週レンジ + 状態チップ + レシピ件数）、
  `<h2>{nextAction.title}</h2>`、`buttonVariants` + `h-11` の CTA、非クリッカブルな `<ol>` ステッパーの
  順で設計どおり。カード全体を包む旧 `<Link>` は無い（DH-06 が回帰を固定）。
- `nav-bar.tsx` は 5 タブ・`/more` active・`<nav><div><ul>` 2 段・`text-xs` まで設計どおり。
- `more/page.tsx` / `more-menu.tsx` は設計書のコード片と一致（`page.tsx` の default export は
  `.claude/rules/coding-standards.md` の App Router 例外に該当）。
- 設計から明示された逸脱は `aria-label="今週の進捗"` の追加 1 点のみ（テスト容易性のための最小追加。
  根拠文書の参照ミスは F-02）。

#### 試験計画 ID の落とし込み

| 計画 ID      | 実テスト                                                                           | 状態 |
| ------------ | ---------------------------------------------------------------------------------- | ---- |
| NA-01〜NA-06 | `tests/app/_utils/dashboard-view.node.test.ts`（`describe('getNextAction')` 6 件） | 実装 |
| SS-01        | 同上（`describe('MEAL_PLAN_STATUS_STEPS')` 1 件）                                  | 実装 |
| SS-02〜SS-07 | 同上（`describe('getStepState')` 6 件。計画の 4 パターンを 6 パターンへ拡張）      | 実装 |
| LBL-01       | 同上（既存 `MEAL_PLAN_STATUS_LABELS` テストを無変更で維持）                        | 維持 |
| DH-01〜DH-07 | `tests/app/_components/dashboard.test.tsx`（ID 付きで 7 件）                       | 実装 |
| DH-08        | 同ファイルの `DC-01`〜`DC-11` / `DASH-REG-02` をアサーション無変更で維持           | 維持 |
| DH-09        | 旧「主要画面へのクイックリンクを表示する」を削除し DH-01 の否定アサーションへ置換  | 実装 |
| NV-01〜NV-08 | `tests/app/_components/nav-bar.test.tsx`（ID 付き 8 件 + 在庫タブの回帰 1 件）     | 実装 |
| MM-01〜MM-03 | `tests/app/more/_components/more-menu.test.tsx`（新規 3 件）                       | 実装 |

計画で「対象外」とした項目（`more/page.tsx` の直接テスト、スケルトン高さの自動検証、権限・冪等性・
障害系・Domain 防御性）は、いずれも設計書の対象外節と整合し、除外理由が明記されている。
公開 API 網羅は `dashboard-view.ts` の 4 実行時エクスポート + `Dashboard` / `NavBar` / `MoreMenu` を
すべて含む。

#### 層違反チェック

- `git diff --stat origin/main...HEAD -- packages apps/web/src/server` が空。新規 UseCase・Repository・
  Hono ルート・DB スキーマの追加はない。
- `dashboard-view.ts:1` は `import type { MealPlanDto, MealPlanStatus } from '@cookpit/application'`
  のみ（既存 `MEAL_PLAN_STATUS_LABELS` と同じ型のみ参照）。`packages/domain` への直接依存なし。
- `page.tsx`（ホーム）は無変更で、UI 側の新規 prop 追加もない。

#### UI の静的すり抜け

- ナビ active: NV-03〜NV-08 が `/recipes` `/products` `/more` `/recipes/abc` `/meal-plans` の
  5 pathname で `aria-current` を固定しており、`/` の完全一致も NV-07 で維持。
- ヒーロー全体リンク化: DH-06 が「`href="/meal-plans"` のリンクが 0 件」を `shopping` 状態で固定。
- Tailwind の実描画（ヒーロー余白、320px でのステッパー折返し、ナビ帯の見た目）はコードだけでは
  確定できない。影響経路をホーム（`/`）と `/more`、および 320px 幅のナビに限定した
  `manual-browser-verify` を Orchestrator へ推奨する（固定チェック表の全再走査は不要）。

#### 実行したゲートと証拠

| コマンド                          | 結果                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm --filter @cookpit/web test` | 79 files / 930 tests PASS（41s）                                                         |
| `pnpm lint`                       | 0 error / 1 warning（PRE_EXISTING・差分外）                                              |
| `pnpm type-check`                 | PASS（全 5 パッケージ）                                                                  |
| Playwright E2E                    | 未実行（DB・ブラウザ未整備）。spec 2 本がホーム/下部タブを参照しないことを静的確認で代替 |

設計書の実装記録が主張する「79 ファイル / 930 件 PASS」は本レビューの再実行で一致を確認した。

#### 本レビューの限界

- 初回レビュー時点では実ブラウザ未実施だった。Task 2 で `dev:pglite` + Playwright により MB-01〜14 を確認した。
- リポジトリの Playwright E2E スイート（saturday-flow 等）は未実行のまま。

### Task 2: FOLLOW_UP クローズと実画面確認（2026-08-25 / orchestrator）

- F-01 / F-02 / F-03 を `a297fb4` でクローズ。
- `pnpm --filter @cookpit/web dev:pglite` + Playwright Chromium で MB-01〜14 全成功
  （ホーム空状態 CTA、ステッパー 5 ラベル、本文にレシピ/商品リンク無し、5 タブ、
  `/more` `/recipes` `/products` でその他 active、`/pantry` で在庫 active、
  320px ナビ高さ 59px、desktop ナビ幅 448）。
- packet を再描画し `followUpOpen: 0`、H-01 を空状態密度の主観判断へ差し替えた。
