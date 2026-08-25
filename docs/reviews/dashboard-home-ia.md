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
    "digest": "sha256:78315bf7e385ec26d504d6f7c82e9cfeee7dea1493e39051db210d1d1d08aae3",
    "source": "commit",
    "entryCount": 14
  },
  "aiAssessment": {
    "blockingOpen": 0,
    "highImpactUnverified": 0,
    "followUpOpen": 3
  },
  "humanItems": [
    {
      "id": "H-01",
      "kind": "unknown",
      "question": "実ブラウザでの表示確認をせずに、このホーム IA 変更をマージ判断へ回してよいか。",
      "recommendation": "accept_risk（気になる場合は manual-browser-verify を 1 回実施）。リンク先・active 判定・要素集合は RTL と静的確認で押さえたが、Tailwind の実描画（ヒーローの余白、320px でのステッパー折返し、ナビの見た目）は表示品質の許容判断が要るため AI では代替できない。",
      "evidenceRefs": [
        "EV-01",
        "EV-04",
        "EV-08"
      ]
    }
  ],
  "residualRisks": [
    "実ブラウザでの見た目（ヒーロー・ステッパー・下部ナビ）は未確認。今回は RTL と静的計算で代替し accept_risk とする。",
    "Playwright E2E は本環境で未実行。ホーム・下部タブを参照する spec が無いことの静的確認で代替する。",
    "旧 IA を記述した既存文書 2 箇所（dashboard.md / ui-visibility-tokens.md）は今回未修正のまま残す（F-01）。"
  ],
  "behaviorChanges": [
    "ホーム先頭が「次の一手」1 つの見出し + ボタンになり、献立の状態で遷移先が変わる（未作成→献立、買い物中→買い物リスト、消費中→在庫）。",
    "ホームの献立カードは全体をタップしても献立へ移動しなくなり、ボタンだけが遷移する。",
    "ホームに「献立→買い物→調理→消費→完了」の進捗表示が加わる（表示のみでタップできない）。",
    "ホーム下部の「メニュー」5 リンクが無くなる。",
    "下部タブが 6 個から 5 個（ホーム/献立/買い物/在庫/その他）になり、レシピ・商品は「その他」画面から開く。レシピ・商品を開いている間は「その他」タブが現在地表示になる。"
  ],
  "evidence": [
    {
      "id": "EV-01",
      "claim": "apps/web の Vitest が 79 ファイル / 930 件すべて通る（NA/SS/DH/NV/MM を含む）",
      "kind": "test",
      "result": "pass",
      "ref": "pnpm --filter @cookpit/web test（2026-08-25 実行、41s）"
    },
    {
      "id": "EV-02",
      "claim": "pnpm lint / pnpm type-check が通る（web の warning 1 件は products テストの未使用変数で本差分外）",
      "kind": "test",
      "result": "pass",
      "ref": "pnpm lint / pnpm type-check（turbo 全 5 パッケージ）"
    },
    {
      "id": "EV-03",
      "claim": "packages/ と apps/web/src/server に差分が無く、dashboard-view.ts の Application 型参照は import type のみ",
      "kind": "static",
      "result": "pass",
      "ref": "git diff --stat origin/main...HEAD -- packages apps/web/src/server が空 / dashboard-view.ts:1"
    },
    {
      "id": "EV-04",
      "claim": "試験計画の全 ID（NA-01〜06 / SS-01〜07 / LBL-01 / DH-01〜07 / NV-01〜08 / MM-01〜03）が実テストに存在する",
      "kind": "static",
      "result": "pass",
      "ref": "dashboard-view.node.test.ts / dashboard.test.tsx / nav-bar.test.tsx / more-menu.test.tsx"
    },
    {
      "id": "EV-05",
      "claim": "E2E spec 2 本はホーム画面と下部タブを参照せず、saturday-flow の「在庫を見る」は買い物完了画面の操作なので同名リンク重複の影響を受けない",
      "kind": "static",
      "result": "pass",
      "ref": "apps/web/tests/e2e/saturday-flow.spec.ts:119 / recipe-crud.smoke.spec.ts:12"
    },
    {
      "id": "EV-06",
      "claim": "ヒーローは Link で包まれず CTA だけがリンクで、ステッパーの li はリンクを持たない",
      "kind": "static",
      "result": "pass",
      "ref": "apps/web/src/app/_components/dashboard.tsx:61-113（DH-06 が回帰を固定）"
    },
    {
      "id": "EV-07",
      "claim": "旧 IA（ホームのクイックリンク・6 タブ）を記述した既存文書が 2 箇所残っている",
      "kind": "static",
      "result": "pass",
      "ref": "docs/designs/dashboard.md:25 / docs/designs/ui-visibility-tokens.md:3"
    },
    {
      "id": "EV-08",
      "claim": "ラベル拡大後の下部ナビ高さは概算 3.6rem で main の下余白 4.5rem 予算内（静的計算・実測ではない）",
      "kind": "static",
      "result": "pass",
      "ref": "nav-bar.tsx（py-2 + icon 20px + gap 2px + text-xs 12px + pb 8px）/ globals.css:139"
    }
  ],
  "reviewer": {
    "agent": "reviewer",
    "model": "claude-opus-5",
    "reviewedAt": "2026-08-25T12:30:00Z"
  }
}
-->
## Review handoff

> **人間レビュー待ちです。**
> Claude の評価です。これは承認ではありません。以下の判断事項・残余リスク・振る舞い差分を確認してください。
> 対象: `sha256:78315bf7e385…` / R2 / 14 changes

### あなたが判断・確認すること（1 件）

1. **[未知] 実ブラウザでの表示確認をせずに、このホーム IA 変更をマージ判断へ回してよいか。** — 推奨: accept\_risk（気になる場合は manual-browser-verify を 1 回実施）。リンク先・active 判定・要素集合は RTL と静的確認で押さえたが、Tailwind の実描画（ヒーローの余白、320px でのステッパー折返し、ナビの見た目）は表示品質の許容判断が要るため AI では代替できない。 / 証拠: EV-01, EV-04, EV-08

### 残余リスク・未確認

- 実ブラウザでの見た目（ヒーロー・ステッパー・下部ナビ）は未確認。今回は RTL と静的計算で代替し accept\_risk とする。
- Playwright E2E は本環境で未実行。ホーム・下部タブを参照する spec が無いことの静的確認で代替する。
- 旧 IA を記述した既存文書 2 箇所（dashboard.md / ui-visibility-tokens.md）は今回未修正のまま残す（F-01）。

### 振る舞い差分

- ホーム先頭が「次の一手」1 つの見出し + ボタンになり、献立の状態で遷移先が変わる（未作成→献立、買い物中→買い物リスト、消費中→在庫）。
- ホームの献立カードは全体をタップしても献立へ移動しなくなり、ボタンだけが遷移する。
- ホームに「献立→買い物→調理→消費→完了」の進捗表示が加わる（表示のみでタップできない）。
- ホーム下部の「メニュー」5 リンクが無くなる。
- 下部タブが 6 個から 5 個（ホーム/献立/買い物/在庫/その他）になり、レシピ・商品は「その他」画面から開く。レシピ・商品を開いている間は「その他」タブが現在地表示になる。

### 証拠

| ID | 主張 | 種別 | 結果 | 参照 |
| --- | --- | --- | --- | --- |
| EV-01 | apps/web の Vitest が 79 ファイル / 930 件すべて通る（NA/SS/DH/NV/MM を含む） | test | pass | pnpm --filter @cookpit/web test（2026-08-25 実行、41s） |
| EV-02 | pnpm lint / pnpm type-check が通る（web の warning 1 件は products テストの未使用変数で本差分外） | test | pass | pnpm lint / pnpm type-check（turbo 全 5 パッケージ） |
| EV-03 | packages/ と apps/web/src/server に差分が無く、dashboard-view.ts の Application 型参照は import type のみ | static | pass | git diff --stat origin/main...HEAD -- packages apps/web/src/server が空 / dashboard-view.ts:1 |
| EV-04 | 試験計画の全 ID（NA-01〜06 / SS-01〜07 / LBL-01 / DH-01〜07 / NV-01〜08 / MM-01〜03）が実テストに存在する | static | pass | dashboard-view.node.test.ts / dashboard.test.tsx / nav-bar.test.tsx / more-menu.test.tsx |
| EV-05 | E2E spec 2 本はホーム画面と下部タブを参照せず、saturday-flow の「在庫を見る」は買い物完了画面の操作なので同名リンク重複の影響を受けない | static | pass | apps/web/tests/e2e/saturday-flow.spec.ts:119 / recipe-crud.smoke.spec.ts:12 |
| EV-06 | ヒーローは Link で包まれず CTA だけがリンクで、ステッパーの li はリンクを持たない | static | pass | apps/web/src/app/\_components/dashboard.tsx:61-113（DH-06 が回帰を固定） |
| EV-07 | 旧 IA（ホームのクイックリンク・6 タブ）を記述した既存文書が 2 箇所残っている | static | pass | docs/designs/dashboard.md:25 / docs/designs/ui-visibility-tokens.md:3 |
| EV-08 | ラベル拡大後の下部ナビ高さは概算 3.6rem で main の下余白 4.5rem 予算内（静的計算・実測ではない） | static | pass | nav-bar.tsx（py-2 + icon 20px + gap 2px + text-xs 12px + pb 8px）/ globals.css:139 |

<details>
<summary>AI assessment</summary>

- blocking open: 0
- high-impact unverified: 0
- follow-up open: 3
- reviewer: reviewer / claude-opus-5
- reviewed at: 2026-08-25T12:30:00Z

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

| ID   | action    | impact | evidence | status | path:line                                                                 | 根拠・再現                                                                                                                                                                                                                                                                                                                         | 修正案                                                                                                              |
| ---- | --------- | ------ | -------- | ------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| F-01 | FOLLOW_UP | medium | E1       | open   | `docs/designs/dashboard.md:25` / `docs/designs/ui-visibility-tokens.md:3` | 本差分でホームのクイックリンクは削除され、ボトムナビは 5 タブになったが、両文書は「クイックリンク: レシピ / 商品 / 献立 / 買い物リスト / 在庫」「ボトムナビ(6タブ)」と旧 IA を現状として記述したまま。`dashboard.md` 末尾に追記したポインタは「本ファイルの内容はそのまま有効」と書いており、25 行目の食い違いを打ち消していない。 | `dashboard.md:25` に「2026-08-25 以降は `/more` へ移設」を注記し、`ui-visibility-tokens.md:3` を 5 タブへ更新する。 |
| F-02 | FOLLOW_UP | low    | E1       | open   | `docs/designs/dashboard-home-ia.md:488-489`                               | 実装記録が `aria-label="今週の進捗"` の追加を「設計書『ステッパー見た目』補足で許容範囲と明記済み」と説明するが、設計書にその記述はない（許容の根拠は実装計画 `dashboard.test.tsx` 節の「テスト容易性のための最小限のマークアップ追加」）。文書間の参照が事実と不一致。                                                            | 参照先を `docs/implementation-plans/dashboard-home-ia.md` の該当節に直す（実装自体の変更は不要）。                  |
| F-03 | FOLLOW_UP | low    | E1       | open   | `apps/web/src/app/loading.tsx:17`                                         | ヒーロー化で「今週の献立」見出しが無くなったのに、スケルトンには見出し相当の `h-4 w-24` 行が残る。ローディング→本体で 1 行分の縦ずれが出る。設計・計画とも高さ変更 1 行のみを指示しており、実装は計画どおり（計画側の取りこぼし）。                                                                                                | 見出しスケルトン行を削除するか、ヒーロー内の週レンジ/チップ行に対応する形へ置き換える。                             |

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

- 実ブラウザ確認は未実施（H-01 / 残余リスク）。
- E2E は未実行。ホーム・ナビを参照する spec が無いことの静的確認に留まる。
