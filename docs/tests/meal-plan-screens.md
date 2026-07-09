# 試験計画: meal-plan-screens

- 前提となる設計書: `docs/designs/meal-plan-screens.md`（confirmed）
- 実装計画: `docs/implementation-plans/meal-plan-screens.md`
- レベル: L2（Presentation 層のみ。Domain / Application / Infrastructure / 契約の変更なし）

## 試験種別

| 種別             | 対象                            | ランナー / 手段                                                                            |
| ---------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| 単体（純関数）   | `_utils/meal-plan-view.ts`      | Vitest（co-located）                                                                       |
| コンポーネント   | `_components/*.tsx`             | Vitest + RTL（co-located。product-list-client.test.tsx 先例）                              |
| Server Component | `page.tsx` / `history/page.tsx` | RTL 対象外（async Server Component は RTL 非対応）→ type-check + 実画面確認（MB 系）で担保 |
| API ルート       | なし（追加不要）                | 既存 `meal-plans.test.ts` で担保済み。サーバー側変更なし                                   |
| 実画面           | 全画面 + 導線                   | manual-browser-verify スキル（MB 系）                                                      |
| E2E smoke        | ハッピーパス                    | Playwright（ローカル `pnpm e2e`）。**推奨・任意**（L2 のため必須にしない）                 |

## 単体試験観点（`meal-plan-view.test.ts`）

| #      | 観点             | 前提           | 操作                             | 期待結果                         | 分類 |
| ------ | ---------------- | -------------- | -------------------------------- | -------------------------------- | ---- |
| U-V-01 | 通常週の整形     | —              | `formatWeekRange('2026-07-04')`  | `7/4（土）〜7/10（金）`          | 正常 |
| U-V-02 | 月またぎ週       | —              | `formatWeekRange('2026-06-27')`  | `6/27（土）〜7/3（金）`          | 境界 |
| U-V-03 | 年またぎ週       | —              | `formatWeekRange('2026-12-26')`  | `12/26（土）〜1/1（金）`         | 境界 |
| U-V-04 | 名前 Map 構築    | RecipeDto 2 件 | `buildRecipeNameMap(recipes)`    | size 2・`get(id)` が name を返す | 正常 |
| U-V-05 | 空配列           | —              | `buildRecipeNameMap([])`         | 空 Map                           | 境界 |
| U-V-06 | limit 省略       | —              | `resolveHistoryLimit(undefined)` | `4`                              | 正常 |
| U-V-07 | limit 有効域     | —              | `'1'` / `'4'` / `'12'`           | `1` / `4` / `12`                 | 正常 |
| U-V-08 | limit 下限 clamp | —              | `'0'` / `'-3'`                   | `1` / `1`                        | 境界 |
| U-V-09 | limit 上限 clamp | —              | `'13'`                           | `12`                             | 境界 |
| U-V-10 | limit 非整数     | —              | `'abc'` / `'4.5'`                | `4` / `4`                        | 異常 |

## コンポーネント試験観点

### planned-recipe-item（WC-I）

| #       | 観点                      | 前提                     | 操作             | 期待結果                                     | 分類 |
| ------- | ------------------------- | ------------------------ | ---------------- | -------------------------------------------- | ---- |
| WC-I-01 | 名前解決あり              | `recipeName: '肉じゃが'` | render           | 名前表示 + `/recipes/<recipeId>` への `Link` | 正常 |
| WC-I-02 | 削除済み表示              | `recipeName: null`       | render           | 「削除済みレシピ」表示・リンクなし           | 正常 |
| WC-I-03 | 削除発火                  | 名前あり                 | 削除ボタン click | `onRemove(plannedRecipe.id)` が 1 回呼ばれる | 正常 |
| WC-I-04 | 削除済みでも削除可（S-4） | `recipeName: null`       | 削除ボタン click | `onRemove` が呼ばれる（disabled でない）     | 正常 |
| WC-I-05 | 送信中は削除不可          | `submitting: true`       | render           | 削除ボタン disabled                          | 正常 |
| WC-I-06 | 倍量表示                  | `scaleFactor: 1.5`       | render           | `1.5×` が表示される                          | 正常 |

### recipe-picker（WC-K）

| #       | 観点                 | 前提                             | 操作                   | 期待結果                                           | 分類 |
| ------- | -------------------- | -------------------------------- | ---------------------- | -------------------------------------------------- | ---- |
| WC-K-01 | 検索絞り込み         | レシピ 2 件（肉じゃが / カレー） | 検索欄に「カレー」入力 | カレーのみ表示                                     | 正常 |
| WC-K-02 | 未選択時は追加不可   | 選択なし                         | render                 | [献立に追加] disabled                              | 正常 |
| WC-K-03 | デフォルト倍量 1×    | レシピ選択のみ                   | [献立に追加] click     | `onAdd(recipeId, 1)`                               | 正常 |
| WC-K-04 | 倍量プリセット選択   | レシピ選択 + `2×` click          | [献立に追加] click     | `onAdd(recipeId, 2)`                               | 正常 |
| WC-K-05 | 追加後に選択リセット | WC-K-03 実施後                   | render 確認            | [献立に追加] が再び disabled（検索テキストは維持） | 正常 |
| WC-K-06 | 送信中は追加不可     | `submitting: true`・選択あり     | render                 | [献立に追加] disabled                              | 正常 |
| WC-K-07 | 検索 0 件            | 検索語が全レシピに不一致         | render                 | 該当なしの文言表示                                 | 境界 |

### meal-plan-client（WC-M）

モック: `vi.mock('next/link')`（先例踏襲）+ `vi.mock('next/navigation')`（`useRouter` → `{ refresh: vi.fn(), push: vi.fn() }`）+ `vi.mock('@/lib/api-client')`（`client.api['meal-plans']` の `$post` / `.recipes.$post` / `.recipes[':plannedRecipeId'].$delete` を `vi.fn()` で差し替え）。

| #       | 観点                 | 前提                               | 操作                       | 期待結果                                                                                         | 分類 |
| ------- | -------------------- | ---------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ | ---- |
| WC-M-01 | 未作成の空状態       | `mealPlan: null`                   | render                     | 空状態文言 + 「今週の献立をはじめる」ボタン                                                      | 正常 |
| WC-M-02 | 作成の RPC 結線      | `mealPlan: null`・$post 成功モック | 作成ボタン click           | `$post` に `{ json: { weekIdentifier: currentWeekIdentifier } }`・`router.refresh()` 呼び出し    | 正常 |
| WC-M-03 | 作成失敗の表示       | `$post` が `ok: false`             | 作成ボタン click           | 「操作に失敗しました。」表示・`refresh` 未呼び出し                                               | 異常 |
| WC-M-04 | 通信エラーの表示     | `$post` が reject                  | 作成ボタン click           | 「通信エラーが発生しました。」表示                                                               | 異常 |
| WC-M-05 | 献立の表示           | `mealPlan` あり・名前解決可能      | render                     | 週表示（U-V-01 形式）+ レシピ名の列挙                                                            | 正常 |
| WC-M-06 | レシピ 0 件の空状態  | `plannedRecipes: []`               | render                     | 「レシピがまだ追加されていません」系文言                                                         | 境界 |
| WC-M-07 | 削除済みの表示       | Map に無い recipeId を含む         | render                     | 当該行が「削除済みレシピ」                                                                       | 正常 |
| WC-M-08 | 追加の RPC 結線      | picker でレシピ選択済み            | [献立に追加] click         | `.recipes.$post` に `{ param: { id }, json: { recipeId, scaleFactor } }`・成功で `refresh`       | 正常 |
| WC-M-09 | 削除の RPC 結線      | `mealPlan` あり                    | 項目の削除ボタン click     | `.recipes[':plannedRecipeId'].$delete` に `{ param: { id, plannedRecipeId } }`・成功で `refresh` | 正常 |
| WC-M-10 | 送信中の二重発火防止 | `$post` が未解決 Promise           | 作成ボタン click 後 render | ボタン disabled（多重送信されない）                                                              | 正常 |
| WC-M-11 | ヘッダー導線         | `mealPlan` 任意                    | render                     | 「レシピ」`/recipes`・「商品」`/products`・「履歴」`/meal-plans/history` の href                 | 正常 |

### history-week-card（WC-H）

| #       | 観点                    | 前提                      | 操作   | 期待結果                                   | 分類 |
| ------- | ----------------------- | ------------------------- | ------ | ------------------------------------------ | ---- |
| WC-H-01 | 週カード表示            | レシピ 2 件・名前解決可能 | render | 週表示 + レシピ名（倍量付き）列挙          | 正常 |
| WC-H-02 | 今週ラベル              | `isCurrentWeek: true`     | render | 「今週」ラベル表示                         | 正常 |
| WC-H-03 | 過去週はラベルなし      | `isCurrentWeek: false`    | render | 「今週」が表示されない                     | 正常 |
| WC-H-04 | レシピ 0 件の週         | `plannedRecipes: []`      | render | 「レシピなし」表示                         | 境界 |
| WC-H-05 | 削除済みの表示          | Map に無い recipeId       | render | 「削除済みレシピ」                         | 正常 |
| WC-H-06 | ステータス非表示（D-2） | `status: 'draft'`         | render | `draft` 等のステータス文字列が表示されない | 正常 |

## 実画面確認（MB 系。manual-browser-verify で PASS / BLOCKED / FAIL を報告）

| #     | 確認内容                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------- |
| MB-01 | `/meal-plans` 初期表示: 未作成週で空状態 + 作成ボタンが出る                                                         |
| MB-02 | 作成ボタンで献立が表示される。**連打しても 1 件のみ**（冪等の実確認）                                               |
| MB-03 | レシピ追加フロー（検索 → 選択 → 倍量 2× → 追加）が反映される。**同一レシピの 2 回追加**で 2 行になる（要件書 B-10） |
| MB-04 | 削除ボタンで項目が消える（確認ダイアログなし・D-3）                                                                 |
| MB-05 | `/meal-plans/history`: 週カード・「今週」ラベル・「さらに表示」で `?limit=8` へ遷移                                 |
| MB-06 | 導線: recipes/products ヘッダー「献立」→ `/meal-plans`、「履歴」→ history、history から戻り                         |
| MB-07 | 「温かいキッチン」トークン適用（直接色 `zinc-*` 等の混入なし）・モバイル幅（max-w-md）で崩れなし                    |
| MB-08 | レシピ削除後に `/meal-plans` と history で「削除済みレシピ」表示になる（C-4 実確認）                                |

## E2E 観点（推奨・任意。L2 のため完了条件に含めない）

| #      | 観点                                                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| E2E-01 | 献立ハッピーパス smoke: `/meal-plans` → 作成 → レシピ追加 → 履歴で確認 → 削除。`apps/web/e2e/recipe-crud.smoke.spec.ts` と同型（ローカル `pnpm e2e`・DB 必要）。実装時に追加するかは受け入れレビュー時に判断 |

## 特性観点

- 権限: 対象外（MVP1 は認証なし。既存画面と同前提）
- データ整合性: サーバーを single source of truth とし、変更系成功後の `router.refresh()` を
  WC-M-02 / 08 / 09 で検証（ローカル状態にコピーしない設計の担保）
- 冪等性: Create の冪等性は API 側で担保済み（Unit A 試験 N-02）。UI 側は二重送信ガード
  （WC-M-10）と実画面の連打確認（MB-02）のみ
- 障害系: 対象外（外部 API / 外部ストレージへの I/O なし。RPC 失敗の表示は FE 固有観点で担保）
- フロントエンド固有: ローディング / 二重送信（WC-M-10）・エラー表示（WC-M-03 / 04）。
  楽観的更新ロールバック: **対象外**（設計で楽観的更新を不採用のため）
- 防御性: 対象外（Domain 層 Entity / VO の変更なし）

## メソッド網羅チェック表

| 対象                    | public API                                        | 対応する試験観点 No                                          |
| ----------------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| meal-plan-view.ts       | `formatWeekRange`                                 | U-V-01〜03                                                   |
| meal-plan-view.ts       | `buildRecipeNameMap`                              | U-V-04〜05                                                   |
| meal-plan-view.ts       | `resolveHistoryLimit`                             | U-V-06〜10                                                   |
| planned-recipe-item.tsx | `PlannedRecipeItem`                               | WC-I-01〜06                                                  |
| recipe-picker.tsx       | `RecipePicker`                                    | WC-K-01〜07                                                  |
| meal-plan-client.tsx    | `MealPlanClient`                                  | WC-M-01〜11                                                  |
| history-week-card.tsx   | `HistoryWeekCard`                                 | WC-H-01〜06                                                  |
| meal-plans/page.tsx     | default 相当の SC（named export なし・Next 規約） | MB-01〜04（async SC は RTL 非対応のため実画面で担保）        |
| history/page.tsx        | 同上                                              | MB-05 + U-V-06〜10（limit 解決は util へ抽出して単体で担保） |

## 要件書観点の照合

個別の要件書は作成していない（設計書「要件」節が正）。関連する既存要件書
`docs/requirements/meal-plan-core.md` の Unit B 申し送り観点を照合:

| 出典                      | 観点                                                 | 反映先                              |
| ------------------------- | ---------------------------------------------------- | ----------------------------------- |
| §5-4 / C-4                | 削除済み Recipe の UI 表示                           | WC-I-02 / WC-M-07 / WC-H-05 / MB-08 |
| §6-3 B-10                 | 同一 recipeId の複数回追加が UI からも可能           | MB-03                               |
| §6-1 N-02                 | Create 冪等                                          | MB-02（API 側は Unit A で試験済み） |
| roadmap Sprint 3 完了条件 | 1 週間分の献立を組み立てられる / 過去 4 週間を遡れる | MB-01〜05                           |

対象外とした観点: scheduledDate / markAsCooked / ステータス遷移の UI（S-3・設計対象外のため）。

## 回帰試験範囲

- `product-list-client.test.tsx` 既存 4 ケース（WC-P-01〜04）が green のまま（ヘッダーリンク追加の回帰検知）
- 既存 API ルートテスト（`meal-plans.test.ts` / `recipes.test.ts` / `products.test.ts`）が green のまま
- 既存 E2E smoke（`recipe-crud.smoke.spec.ts`）が green のまま（recipes ヘッダー変更の影響確認）
- recipes / products 画面の表示・検索・絞り込み（実画面で目視）

## 試験データ

- `RecipeDto` フィクスチャ: `createRecipeDto(overrides)` ヘルパ（product-list-client.test.tsx の
  `createProductDto` 先例踏襲。UUID は固定値リテラル）
- `MealPlanDto` / `PlannedRecipeDto` フィクスチャ: `createMealPlanDto(overrides)` /
  `createPlannedRecipeDto(overrides)`。`weekIdentifier: '2026-07-04'`・`status: 'draft'`・
  `scheduledDate: null`・`cookedAt: null`・`notes: ''`
- 削除済みレシピ: Map に存在しない固定 UUID を `recipeId` に持つ PlannedRecipeDto

## 完了条件

**必須（リリースブロッカー）**

- U-V-01〜10・WC-I / WC-K / WC-M / WC-H 全件が Vitest で green
- `pnpm lint` / `pnpm type-check` / `pnpm test` 全 green（回帰含む）
- MB-01〜08 が manual-browser-verify で全 PASS

**推奨（任意）**

- E2E-01 の追加（受け入れレビュー時に判断）
