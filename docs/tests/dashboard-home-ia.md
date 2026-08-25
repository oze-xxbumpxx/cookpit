# 試験計画: dashboard-home-ia

- 前提となる設計書: docs/designs/dashboard-home-ia.md
- レベル: L2（Presentation のみ。新規 API / DB / Domain / Infra / UseCase なし）
- 要件定義書: 対象外（本タスクは要件定義書を作成しない L2 変更のため
  `docs/requirements/dashboard-home-ia.md` は存在しない。設計書「テスト方針」節を正として
  観点を展開する。設計書の観点をすべて本計画に反映し、追加した観点には理由を付す）

## 試験種別

- **単体試験**: `apps/web/src/app/_utils/dashboard-view.ts` の純関数・定数
  （`getNextAction` / `MEAL_PLAN_STATUS_STEPS` / `getStepState` / 既存
  `MEAL_PLAN_STATUS_LABELS`）。入出力のみで判定でき、DOM 依存なし。
- **結合試験**: `Dashboard` / `NavBar` / `MoreMenu` の RTL レンダリングテスト。純関数の出力・
  ルーティング状態（`usePathname`）・既存ユーティリティ（`formatWeekRange` /
  `mealPlanStatusChipClass` 等）を組み合わせた表示結果を検証する。
- `apps/web/src/app/more/page.tsx` は本リポジトリの既存慣習（`products/page.tsx` /
  `recipes/page.tsx` 等、データ取得を持つ他の `page.tsx` も含め直接の RTL テストが存在しない）
  に合わせ、直接テストしない。`MoreMenu`（結合試験）でカバーする。

## 単体試験観点

対象ファイル: `apps/web/tests/app/_utils/dashboard-view.node.test.ts`
（vitest node project の `include: tests/**/*.node.test.ts` に一致）

| #      | 観点                                            | 前提                            | 操作                                                            | 期待結果                                                                                                                                                                                              | 分類                 |
| ------ | ----------------------------------------------- | ------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| NA-01  | `getNextAction`: mealPlan なし                  | `mealPlan = null`               | `getNextAction(null)`                                           | `{ title: '今週の献立はまだありません', description: '土曜の起点は献立決めから。', href: '/meal-plans', ctaLabel: '今週の献立を作る' }` と `toEqual`                                                  | 境界（null 入力）    |
| NA-02  | `getNextAction`: draft                          | `mealPlan.status = 'draft'`     | `getNextAction(mealPlan)`                                       | `{ title: '献立を仕上げましょう', description: 'レシピを追加して今週のメニューを確定する', href: '/meal-plans', ctaLabel: '献立を続ける' }` と `toEqual`                                              | 正常                 |
| NA-03  | `getNextAction`: shopping                       | `mealPlan.status = 'shopping'`  | `getNextAction(mealPlan)`                                       | `{ title: '買い物に出かけましょう', description: '買い物リストを開いて購入を進める', href: '/shopping-lists', ctaLabel: '買い物リストを開く' }` と `toEqual`                                          | 正常                 |
| NA-04  | `getNextAction`: cooking                        | `mealPlan.status = 'cooking'`   | `getNextAction(mealPlan)`                                       | `{ title: '作り置きの時間です', description: '献立のレシピを見ながら調理する', href: '/meal-plans', ctaLabel: '献立を開く' }` と `toEqual`                                                            | 正常                 |
| NA-05  | `getNextAction`: consuming                      | `mealPlan.status = 'consuming'` | `getNextAction(mealPlan)`                                       | `{ title: '作り置きを食べましょう', description: '期限が近い在庫から消費するのがおすすめ', href: '/pantry', ctaLabel: '在庫を見る' }` と `toEqual`                                                    | 正常                 |
| NA-06  | `getNextAction`: completed                      | `mealPlan.status = 'completed'` | `getNextAction(mealPlan)`                                       | `{ title: '今週は完了しました', description: '次の週の献立を準備できます', href: '/meal-plans', ctaLabel: '献立を見る' }` と `toEqual`                                                                | 正常                 |
| SS-01  | `MEAL_PLAN_STATUS_STEPS`: 5 件過不足なし        | 定数を import                   | `MEAL_PLAN_STATUS_STEPS` をそのまま参照                         | `[{status:'draft',label:'献立'},{status:'shopping',label:'買い物'},{status:'cooking',label:'調理'},{status:'consuming',label:'消費'},{status:'completed',label:'完了'}]` と `toEqual`（順序含め固定） | 境界（集合の過不足） |
| SS-02  | `getStepState`: current=null は全 upcoming      | `current = null`                | `MEAL_PLAN_STATUS_STEPS.map(s => getStepState(null, s.status))` | `['upcoming','upcoming','upcoming','upcoming','upcoming']` と `toEqual`                                                                                                                               | 境界（null）         |
| SS-03  | `getStepState`: current='draft'（先頭境界）     | `current = 'draft'`             | 同上パターンで 5 ステップぶん map                               | `['current','upcoming','upcoming','upcoming','upcoming']` と `toEqual`                                                                                                                                | 境界（先頭）         |
| SS-04  | `getStepState`: current='shopping'              | `current = 'shopping'`          | 同上                                                            | `['complete','current','upcoming','upcoming','upcoming']` と `toEqual`                                                                                                                                | 正常（中間）         |
| SS-05  | `getStepState`: current='cooking'               | `current = 'cooking'`           | 同上                                                            | `['complete','complete','current','upcoming','upcoming']` と `toEqual`                                                                                                                                | 正常（中間）         |
| SS-06  | `getStepState`: current='consuming'             | `current = 'consuming'`         | 同上                                                            | `['complete','complete','complete','current','upcoming']` と `toEqual`                                                                                                                                | 正常（中間）         |
| SS-07  | `getStepState`: current='completed'（末尾境界） | `current = 'completed'`         | 同上                                                            | `['complete','complete','complete','complete','current']` と `toEqual`（末尾は `current`、`complete` にはならないことを確認）                                                                         | 境界（末尾）         |
| LBL-01 | `MEAL_PLAN_STATUS_LABELS`: 既存維持             | 既存テストをそのまま流用        | 全 5 ステータスのラベルを確認                                   | `draft→献立作成中` / `shopping→買い物中` / `cooking→調理中` / `consuming→消費中` / `completed→完了`                                                                                                   | 回帰（既存）         |

補足（防御性・型に関する対象外事項）:

- `getNextAction` の `switch` は `default` を持たない設計（design の確定事項）。これは
  「将来 `MealPlanStatus` に値が追加された場合はコンパイルエラーで検知する」という
  **型システムによる静的保証**であり、実行時テストでは検証できない。したがってランタイム
  テストの観点としては対象外（型チェック `pnpm type-check` が実質的な保証手段）。
- `DashboardNextAction` / `StepState` は型のみのエクスポートで、実行時の振る舞いを持たない
  ため個別のテストケースは設けない。NA-01〜06 / SS-02〜07 の `toEqual` が戻り値の形状
  （プロパティの過不足なし）を実質的に検証する。

## 結合試験観点

### `Dashboard`（`apps/web/tests/app/_components/dashboard.test.tsx`、dom project `**/*.test.tsx`）

| #     | 観点                                                        | 前提                                                                  | 操作                                                                                                                               | 期待結果                                                                                                         | 分類                                 |
| ----- | ----------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| DH-01 | メニュー（二次ナビ）がホームに存在しない                    | `mealPlan = null`                                                     | render → `screen.queryByRole('link', { name: 'レシピ' })` / `{ name: '商品' }`                                                     | 両方 `null`（`href=/recipes` `href=/products` のリンクが存在しない）                                             | 異常系（削除確認・否定アサーション） |
| DH-02 | mealPlan なし → 作成 CTA                                    | `mealPlan = null`                                                     | render → `getByRole('link', { name: '今週の献立を作る' })`                                                                         | `href` が `/meal-plans`                                                                                          | 正常（既存 DC 相当の回帰込み）       |
| DH-03 | shopping → CTA と href                                      | `mealPlan.status = 'shopping'`                                        | render → `getByRole('link', { name: '買い物リストを開く' })`                                                                       | `href` が `/shopping-lists`                                                                                      | 正常                                 |
| DH-04 | ステッパー 5 ラベル表示                                     | 任意の `mealPlan`（例: `null`）                                       | render                                                                                                                             | `献立` `買い物` `調理` `消費` `完了` の 5 テキストがすべて存在する                                               | 境界（集合の過不足）                 |
| DH-05 | consuming: CTA と賞味期限横リンクの「在庫を見る」重複       | `mealPlan.status = 'consuming'`、`expiringStocks` は空でよい          | render → `screen.getAllByRole('link', { name: '在庫を見る' })`                                                                     | 配列長が `2`、両方の `href` が `/pantry`（`getByRole` 単体だと複数要素エラーになるため `getAllByRole` を用いる） | 境界（同名リンクの衝突）             |
| DH-06 | ヒーロー全体が `/meal-plans` リンクでない                   | `mealPlan.status = 'shopping'`（CTA は `/shopping-lists` になる状態） | render → `screen.getAllByRole('link')` を取得し `href === '/meal-plans'` のものを `filter`                                         | 長さ `0`（カード全体を包む旧 `/meal-plans` リンクが残っていない。CTA だけが主リンクという確定 UI 仕様を保証）    | 異常系（旧実装の回帰防止）           |
| DH-07 | mealPlan あり: 週レンジ・状態チップ・レシピ件数（既存維持） | `mealPlan.status = 'shopping'`、`plannedRecipes` 2 件                 | render                                                                                                                             | `買い物中` チップと `レシピ 2 品` が表示される（既存テストからの引き継ぎ）                                       | 回帰（既存）                         |
| DH-08 | 賞味期限セクション: DC-01〜11 / DASH-REG-02 / 空メッセージ  | 既存テストをそのまま維持                                              | （変更なし）                                                                                                                       | 既存アサーションが緑のまま（`asOf` 呼び出し・バッジ色・アイコン・0 件時メッセージ等）                            | 回帰（既存、必須）                   |
| DH-09 | 旧「主要画面へのクイックリンクを表示する」の置換            | `mealPlan = null`                                                     | 旧テストを削除し、`screen.queryByRole('link', { name: '在庫' })` の `href` が `/pantry` になる文脈が無いことを確認（DH-01 で代替） | 旧テストは DH-01 の否定アサーションに置換済みであること                                                          | 異常系（テスト自体の置換確認）       |

### `NavBar`（`apps/web/tests/app/_components/nav-bar.test.tsx`、dom project）

| #     | 観点                                             | 前提                        | 操作                                                                                                                 | 期待結果                                                                                                                                                                                | 分類                               |
| ----- | ------------------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| NV-01 | 5 タブ集合の過不足なし固定                       | `pathname = '/'`            | render → `getAllByRole('link')` を `{ name, href }` に map                                                           | `[{name:'ホーム',href:'/'},{name:'献立',href:'/meal-plans'},{name:'買い物',href:'/shopping-lists'},{name:'在庫',href:'/pantry'},{name:'その他',href:'/more'}]` と `toEqual`（順序込み） | 境界（集合の過不足）               |
| NV-02 | レシピ・商品タブが存在しない                     | `pathname = '/'`            | `screen.queryByRole('link', { name: 'レシピ' })` / `{ name: '商品' }`                                                | 両方 `null`                                                                                                                                                                             | 異常系（削除確認）                 |
| NV-03 | `/recipes` でその他が active                     | `pathname = '/recipes'`     | render → `getByRole('link', { name: 'その他' })`                                                                     | `aria-current` が `'page'`                                                                                                                                                              | 正常                               |
| NV-04 | `/products` でその他が active                    | `pathname = '/products'`    | 同上                                                                                                                 | `aria-current` が `'page'`                                                                                                                                                              | 正常                               |
| NV-05 | `/more` でその他が active                        | `pathname = '/more'`        | 同上                                                                                                                 | `aria-current` が `'page'`                                                                                                                                                              | 正常                               |
| NV-06 | `/recipes/abc`（ネストパス）でもその他が active  | `pathname = '/recipes/abc'` | 同上                                                                                                                 | `aria-current` が `'page'`（`/more` 系の `startsWith` 判定がネストパスにも効く）                                                                                                        | 境界（ネストパス）                 |
| NV-07 | `/` は完全一致のみホームが active                | `pathname = '/meal-plans'`  | `getByRole('link', { name: 'ホーム' })` の `aria-current` と `getByRole('link', { name: '献立' })` の `aria-current` | ホーム側は `null`、献立側は `'page'`（既存挙動の回帰）                                                                                                                                  | 境界（`/` の完全一致 vs 前方一致） |
| NV-08 | `/meal-plans` でその他が誤って active にならない | `pathname = '/meal-plans'`  | `getByRole('link', { name: 'その他' })` の `aria-current`                                                            | `null`（`/meal-plans` は `/more` の `startsWith` に誤マッチしないことの確認）                                                                                                           | 異常系（誤判定防止の境界）         |

### `MoreMenu`（新規: `apps/web/tests/app/more/_components/more-menu.test.tsx`、dom project。

`src/app/more/_components/more-menu.tsx` の構造を `tests/` にミラーする）

| #     | 観点                                | 前提     | 操作                                                            | 期待結果                                               | 分類                 |
| ----- | ----------------------------------- | -------- | --------------------------------------------------------------- | ------------------------------------------------------ | -------------------- |
| MM-01 | レシピリンク表示                    | 初期表示 | render `<MoreMenu />` → `getByRole('link', { name: 'レシピ' })` | `href` が `/recipes`                                   | 正常                 |
| MM-02 | 商品リンク表示                      | 初期表示 | render → `getByRole('link', { name: '商品' })`                  | `href` が `/products`                                  | 正常                 |
| MM-03 | リンクはちょうど 2 件（過不足なし） | 初期表示 | render → `getAllByRole('link')`                                 | 配列長が `2`（レシピ・商品以外のリンクが増えていない） | 境界（集合の過不足） |

## 特性観点

- **権限**: 対象外。認可・ロール判定の変更なし（設計書「セキュリティ」節が対象外と明記）。
- **データ整合性**: `getNextAction` の `href` が実際の遷移先ページと一致していること
  （NA-01〜06 で固定）。`MEAL_PLAN_STATUS_STEPS` と `getStepState` が同じ 5 ステータス集合
  （`MealPlanStatus`）に基づいて算出されること（SS-01〜07 で固定）。書き込み系の整合性
  （DB・トランザクション）は対象外（表示ロジックのみ、永続化データへの影響なし）。
- **冪等性**: 対象外。書き込み系の操作・UseCase 呼び出しの新設・変更がない
  （設計書「エラー処理」節・対象範囲に準拠。表示のみの純関数・コンポーネント）。
- **障害系**（外部 I/O）: 対象外。`page.tsx` の既存 `GetCurrentMealPlanUseCase` /
  `GetExpiringStocksUseCase` 呼び出しは変更なし。新規の外部 API・ストレージ I/O を追加しない
  （設計書「性能」節・「エラー処理」節に準拠）。
- **フロントエンド固有**:
  - ローディング: `loading.tsx` はヒーロースケルトンの高さ調整（`h-24` → `h-40` 目安）のみで、
    ローディング状態遷移ロジックの新設ではないため、スケルトン高さの厳密な数値検証は
    実装ファイルの目視確認に委ね、RTL での自動テスト観点としては対象外とする
    （視覚的な高さはスナップショット/ビジュアルリグレッションの領域であり、本タスクの
    スコープ外）。既存の「賞味期限 3 枚スケルトンを維持・メニュー用 4 枚目を追加しない」点は
    実装レビューで確認する（テストコードでの自動検証は対象外）。
  - エラー表示/エラーバウンダリ: 対象外。新規エラーバウンダリの追加なし
    （Next.js デフォルトの既存エラーハンドリングを変更しない）。
  - 楽観的更新のロールバック: 対象外。書き込み操作・楽観的更新の新設なし
    （`Dashboard` / `NavBar` / `MoreMenu` はいずれも表示専用コンポーネント）。
- **防御性（Domain 層 Entity/VO）**: 対象外。本タスクは Presentation 層のみの変更で、
  `packages/domain` の Entity / Value Object を一切変更しない。

## メソッド網羅チェック表

| ファイル                                                              | 公開 API                              | 対応する試験観点 No                                                                 |
| --------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| `_utils/dashboard-view.ts`                                            | `MEAL_PLAN_STATUS_LABELS`（既存）     | LBL-01                                                                              |
| `_utils/dashboard-view.ts`                                            | `getNextAction`                       | NA-01, NA-02, NA-03, NA-04, NA-05, NA-06                                            |
| `_utils/dashboard-view.ts`                                            | `MEAL_PLAN_STATUS_STEPS`              | SS-01                                                                               |
| `_utils/dashboard-view.ts`                                            | `getStepState`                        | SS-02, SS-03, SS-04, SS-05, SS-06, SS-07                                            |
| `_utils/dashboard-view.ts`                                            | `DashboardNextAction`（型）           | NA-01〜06（戻り値形状を toEqual で間接検証）                                        |
| `_utils/dashboard-view.ts`                                            | `StepState`（型）                     | SS-02〜07（戻り値を toEqual で間接検証）                                            |
| `_components/dashboard.tsx`                                           | `Dashboard`                           | DH-01〜09（＋回帰 DH-08 経由の DC-01〜11 / DASH-REG-02）                            |
| `_components/nav-bar.tsx`                                             | `NavBar`                              | NV-01〜08                                                                           |
| `_components/nav-bar.tsx`                                             | `isActive`（非 export）               | NV-03〜08 経由で間接検証（`NavBar` のレンダリング結果からのみ観測可能）             |
| `more/_components/more-menu.tsx`                                      | `MoreMenu`（新規）                    | MM-01, MM-02, MM-03                                                                 |
| `more/_components/more-menu.tsx`                                      | `MORE_LINKS`（非 export 定数）        | MM-01〜03 経由で間接検証                                                            |
| `more/page.tsx`                                                       | `MorePage`（新規、デフォルト export） | 対象外（既存の他 `page.tsx` 群と同様に直接テストしない慣習に合わせる。`MoreMenu` の |
| MM-01〜03 と `pnpm type-check` / `pnpm lint` の静的チェックでカバー） |

## 回帰試験範囲

- `apps/web/tests/app/_utils/dashboard-view.node.test.ts`: 既存 `MEAL_PLAN_STATUS_LABELS`
  テスト（LBL-01）はそのまま維持する。
- `apps/web/tests/app/_components/dashboard.test.tsx`:
  - 維持（変更なし）: 「今週の献立が無いとき作成 CTA を表示する」（DH-02 相当に統合可）、
    「今週の献立があるとき状態ラベルとレシピ件数を表示する」（DH-07）、
    「賞味期限が近い在庫が無いとき空メッセージを表示する」、
    「賞味期限が近い在庫を名称・保存場所・期限つきで一覧表示する」、
    `DC-01`〜`DC-11`、`DASH-REG-02`。
  - 削除・置換が必要: 「主要画面へのクイックリンクを表示する」（`QUICK_LINKS` 削除に伴い
    DH-01・DH-09 の否定アサーションへ置換する）。
- `apps/web/tests/app/_components/nav-bar.test.tsx`:
  - 「6 つのタブを href つきで表示する」は 5 タブ + その他の期待値に書き換える（NV-01）。
  - 「現在の画面のタブに aria-current=page が付く」（`/pantry` 前提）はそのまま維持できる
    （在庫タブは変更なし）。
  - 「詳細ページ（/recipes/abc）でも親セクションのタブがアクティブ」は「その他」への
    書き換えが必要（NV-06）。
  - 「商品ページで商品タブがアクティブ」は「その他」への書き換えが必要（NV-04 相当）。
  - 「ホームは完全一致のときのみアクティブ」はそのまま維持できる（NV-07）。
- `docs/designs/dashboard.md` に本設計書へのポインタが追記される点はドキュメントのみの変更
  であり、テスト対象外。
- `page.tsx`（`apps/web/src/app/page.tsx`）: 変更なし。`GetCurrentMealPlanUseCase` /
  `GetExpiringStocksUseCase` の呼び出し順・引数（`asOf`/`now`）が変わらないことは、既存の
  `Dashboard` 側テスト（`asOf` を渡した上での賞味期限表示の回帰: DC-01〜11）で間接的に保証する。
  Application / Domain / Infrastructure 層のテストは対象外（変更なしのため）。

## 試験データ

- `MealPlanDto` フィクスチャ: 既存 `createMealPlanDto`（`dashboard.test.tsx` 内）を再利用し、
  `status` のみ上書きして `null` / `draft` / `shopping` / `cooking` / `consuming` / `completed`
  の 6 パターンを用意する（`getNextAction` の NA-01〜06、`Dashboard` の DH-02/03/05/06/07 で共有）。
- `StockDto` フィクスチャ: 既存 `createStock`（`dashboard.test.tsx` 内）をそのまま再利用する
  （DH-05 では `expiringStocks` は空配列で十分。賞味期限セクションの表示内容自体は本タスクの
  対象外）。
- `asOf`: 既存の `ASOF = new Date('2026-07-21T09:00:00')` を維持する（DC-* の期限計算が
  依存するため変更しない）。
- `NavBar` の `pathname` フィクスチャ: 既存の `vi.hoisted` + `vi.mock('next/navigation')` パターン
  を維持し、`state.pathname` に `/` `/meal-plans` `/recipes` `/recipes/abc` `/products` `/more`
  を設定して NV-01〜08 を実行する。
- `MoreMenu` はプロップスを取らないため追加のフィクスチャは不要。

## 完了条件

- 単体試験観点（NA-01〜06, SS-01〜07, LBL-01）がすべて green。
- 結合試験観点（DH-01〜09, NV-01〜08, MM-01〜03）がすべて green。
- 回帰試験範囲に挙げた既存ケース（DC-01〜11, DASH-REG-02、書き換え後の `NavBar` 既存ケース）
  が green のまま維持されている。
- メソッド網羅チェック表の全 public API（型を除く）に対応する観点が存在する。
- 特性観点のうち対象外としたもの（権限・冪等性・障害系・防御性 Domain・楽観的更新・
  エラーバウンダリ）はいずれも設計書の対象外節と整合しており、除外理由が明記されている。
- `pnpm --filter web lint` / `pnpm --filter web type-check` / `pnpm --filter web test` が通る
  （新規テストファイルは `apps/web/tests/**/*.node.test.ts` または `apps/web/tests/**/*.test.tsx`
  の vitest include パターンに一致するパスに配置されていること）。
