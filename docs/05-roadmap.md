# 05. ロードマップ・スプリント計画

## 開発スタイル

- **アジャイル開発**：2週間スプリントで進める
- **早期実利用**：Sprint 1 完了時点（レシピ CRUD ができた段階）から、紙のレシピのデジタル化を開始
- **継続的改善**：使ってみて気づいた課題を次スプリントに反映
- **スプリントレビュー**：日曜日のレトロスペクティブ習慣と統合

## 全体スケジュール（目安）

| Sprint   | 期間    | スコープ                  | 累計週 |
| -------- | ------- | ------------------------- | ------ |
| Sprint 0 | 1週間   | 環境構築                  | 1      |
| Sprint 1 | 2週間   | Recipe ドメイン + CRUD    | 3      |
| Sprint 2 | 1.5週間 | Product マスタ + 価格履歴 | 4.5    |
| Sprint 3 | 1.5週間 | MealPlan 献立作成         | 6      |
| Sprint 4 | 2週間   | ShoppingList 買い物リスト | 8      |
| Sprint 5 | 1.5週間 | Pantry 在庫管理           | 9.5    |
| Sprint 6 | 1週間   | 仕上げ・運用開始          | 10.5   |

合計約 **2.5ヶ月**。ここまでが MVP1。Sprint 7 以降は
[§MVP2（Phase 2）：ロードマップ骨子](#mvp2phase-2ロードマップ骨子2026-07-29-起案)を参照。

## Sprint 0：環境構築（1週間）

### ゴール

開発を開始できる状態を整える。「Hello World」が Vercel にデプロイされ、PWA としてホーム画面に追加できることを確認する。

### タスク

1. **モノレポ初期化**
   - `pnpm create turbo@latest` で雛形作成
   - `apps/web` に Next.js 16 を配置
   - `packages/` に `domain` `application` `infrastructure` `api-contract` `ui` `config` の空パッケージを作成

2. **Next.js 16 セットアップ**
   - App Router 設定
   - TypeScript strict mode
   - ESLint + Prettier 設定（業務スタックに合わせる）

3. **Tailwind CSS v4 + shadcn/ui**
   - Tailwind v4 セットアップ
   - shadcn/ui の初期化、`Button` `Card` あたりを動作確認

4. **Hono マウント**
   - `app/api/[[...route]]/route.ts` に Hono ルーターを配置
   - `/api/health` エンドポイントを作成
   - Hono RPC クライアントの動作確認

5. **Drizzle + Neon 接続**
   - Neon プロジェクト作成（無料枠）
   - Drizzle ORM セットアップ
   - 接続テスト用の最小スキーマでマイグレーション実行

6. **PWA セットアップ（Serwist）**
   - manifest.ts 設定
   - アイコン生成
   - Service Worker 登録
   - iPhone と Android で「ホーム画面に追加」を実機確認

7. **Vercel デプロイ**
   - GitHub と連携
   - 環境変数設定（`DATABASE_URL`）
   - 本番デプロイ確認

### 完了条件

- [ ] `pnpm dev` でローカル起動
- [ ] Vercel に自動デプロイ
- [ ] iPhone / Android 両方でホーム画面に追加できる
- [ ] DB に接続できる（health check が DB を叩く）

## Sprint 1：Recipe ドメイン + CRUD（2週間）

### ゴール

紙のレシピを徐々にアプリに転記し始められる状態。**このスプリント完了後から実利用開始**。

### 進捗サマリ（2026-06-16 時点）

タスク 1〜5（ドメイン・スキーマ・Repository・UseCase・API）は完了。タスク 6（画面）は一覧・作成・詳細が実装＋レビュー完了で、編集のみ残り。タスク 7（単位プルダウン）は作成フォームで完了。加えてビジュアルデザイン「温かいキッチン」を全画面へ適用済み（タスク 8）。

| #   | タスク                | 状態                                           |
| --- | --------------------- | ---------------------------------------------- |
| 1   | Recipe ドメインモデル | ✅ 完了                                        |
| 2   | Drizzle スキーマ      | ✅ 完了（JSONB 集約一括保存）                  |
| 3   | Recipe Repository     | ✅ 完了（commit `aaf66c9`）                    |
| 4   | Use Case              | ✅ 完了（commit `1c583d0` ほか・全5本）        |
| 5   | API エンドポイント    | ✅ 完了（commit `5cea98e`）                    |
| 6   | 画面実装              | 🔄 一覧 ✅ / 作成 ✅ / 詳細 ✅ / 編集 未着手   |
| 7   | 単位プルダウン        | ✅ 完了（作成フォームでネイティブ `<select>`） |
| 8   | ビジュアルデザイン    | ✅ 完了（「温かいキッチン」を全画面へ適用）    |

### タスク

1. **Recipe ドメインモデル実装** ✅
   - `packages/domain/recipe/` に Recipe / RecipeId / RecipeIngredient / CookingStep / Recipe Repository Interface
   - 共通値オブジェクト `Quantity` `Unit` も実装
     - `Unit` 型は**日本語統一**：`g / kg / ml / l / 大さじ / 小さじ / cup / 個 / 本 / 枚 / 玉 / 尾 / 切れ / 束 / 袋 / 缶 / 合`（英語表記 `tsp / tbsp / piece / pinch` は廃止）
     - **プリセット固定方針**：ユーザーによるカスタム単位追加は行わない。型安全性を Union 型で維持する
   - `RecipeIngredient` に `amountNote: string | null` を追加（「少々」など非数値量に対応）
   - ユニットテスト

2. **Drizzle スキーマ** ✅
   - `recipes` テーブル
   - `recipe_ingredients` は **JSONB 列**として集約一括保存（ingredients / steps）
   - マイグレーション実行

3. **Recipe Repository 実装** ✅
   - `DrizzleRecipeRepository` 実装
   - `findById` `findAll` `save` `delete`
   - ドメインモデル ↔ DB 行のマッピング

4. **Use Case 実装** ✅
   - `CreateRecipeUseCase`
   - `GetRecipesUseCase`
   - `GetRecipeUseCase`（詳細画面用に追加）
   - `UpdateRecipeUseCase`（`baseServings` は変更しない方針）
   - `DeleteRecipeUseCase`
   - 戻り値は `RecipeDto`（Entity を境界外に漏らさない）／ NotFound は `RecipeNotFoundError`

5. **API エンドポイント（Hono）** ✅
   - `GET /api/recipes`
   - `GET /api/recipes/:id`
   - `POST /api/recipes`
   - `PUT /api/recipes/:id`
   - `DELETE /api/recipes/:id`
   - Zod（`@cookpit/api-contract`）でバリデーション

6. **画面実装** ✅
   - レシピ一覧（`/recipes`）✅ — Server Component で初期取得 → Client で検索・タグ絞り込み
   - レシピ作成（`/recipes/new`）✅ — Hono RPC で POST、量の数値/テキスト判定を `buildCreateInput` に集約、タグ複数選択（実装＋レビュー完了）
   - レシピ詳細（`/recipes/[id]`）✅ — Server Component で初期取得、倍量はクライアント表示計算、削除は base-ui AlertDialog の2段階 → Hono RPC（実装＋レビュー完了）
   - レシピ編集（`/recipes/[id]/edit`）✅ — Server Component で初期取得 → Client フォームで Hono RPC PUT、NotFound は notFound()、共用コンポーネント分離（L2 フルフロー・レビュー完了）
   - shadcn/ui の Input / Button / Textarea を活用
   - 材料入力の単位フィールドはプルダウン選択（プリセット固定）

7. **単位プルダウン** ✅
   - 材料入力の単位フィールドをプルダウン選択（`Unit` 型に定義された値のみ）
   - モバイル PWA 向けにネイティブ `<select>` を採用（OS 標準ピッカー）
   - 設定画面・カスタム追加機能は持たない

8. **ビジュアルデザイン「温かいキッチン」** ✅
   - 実装指針 `docs/tasks/archive/sprint1-visual-design-system.md`
   - `globals.css` の `:root` を温かいトークン（クリーム背景・テラコッタ朱の primary・温かいベージュ境界）へ張り替え
   - 全画面の `zinc-*` / `bg-white` / `amber-*` をセマンティックトークンへ移行（一覧・作成・詳細・alert-dialog）
   - `@theme inline` / `.dark` / shadcn コンポーネントは不変（トークン自動追従）
   - ダークモードの温かい配色・見出しフォント差し替えはスコープ外（後日）

### 完了条件

- [x] レシピを 5 件以上、紙から転記できる — 機能は完備（CRUD 4 画面 + API 5 本）。実転記は運用開始後
- [ ] スマホから操作してもストレスがない — 実利用で確認（機能としてはレスポンシブ対応済み）
- [ ] PWA としてインストール状態で快適に動く — 実利用で確認（Serwist + manifest 設定済み）

### Sprint 1 完了サマリ（2026-06-26）

- **全 8 タスク完了**。画面 4 本（一覧・作成・詳細・編集）+ API 5 本 + ドメインモデル + DB + ビジュアルデザイン
- **品質ゲート**: type-check 6/6 通過、Vitest 43/43 通過（domain 29 + application 14）、Playwright E2E スモーク導入済み
- **lint**: error 1 件は `sw.js`（Serwist 自動生成 Service Worker）の `no-this-alias`。プロジェクトコードは clean
- **harness 効果**: orchestrator L2 フルフロー（5 Agent）が手戻りゼロで完走。改善サイクル IMP-2026-001〜005 を通じて eval ベースラインが全軸改善（悪化なし）
- **残課題**（Sprint 2 以降 or バックログ）:
  - `sw.js` の lint error — ESLint 設定で Serwist 生成ファイルを除外するか検討
  - スマホ実利用での UX 確認 — 実転記開始後に判断
  - ブラウザ手動テスト（編集画面の DB 接続込み）— 実環境で完全確認

### Sprint 1 のマイルストーン

このスプリント完了の翌週末から、土曜の夜に紙のレシピを少しずつ転記する習慣を始める。実利用しながら次スプリント以降を進める。

## Sprint 2：Product マスタ + 価格履歴（1.5週間）

### ゴール

商品の管理と価格履歴の記録ができる。価格比較機能の基盤を構築。

### タスク

1. **Product / Store ドメインモデル実装**
   - `packages/domain/product/` に Product / ProductId / PriceRecord / ProductCategory
   - `packages/domain/shared/store.ts` に Store / StoreId
   - `packages/domain/shared/money.ts` に Money

2. **Drizzle スキーマ**
   - `products` テーブル
   - `price_records` テーブル（履歴は別テーブル推奨）
   - `stores` テーブル
   - 初期データ：Store を 2 件投入（実際の使用店舗）

3. **Repository 実装**
   - `DrizzleProductRepository`
   - `DrizzleStoreRepository`

4. **Use Case 実装**
   - `CreateProductUseCase`
   - `GetProductsUseCase`
   - `RecordPriceUseCase`
   - `GetCheapestStoreUseCase`

5. **API + 画面**
   - 商品一覧・詳細・作成・編集
   - 価格履歴表示（簡易グラフ）
   - 「この商品、どっちの店舗が安い？」ビュー

6. **GitHub Actions CI 導入** — **導入済み**（.github/workflows/ci.yml。PR で lint / type-check / build / test / E2E smoke を実行。2026-07-06 に pnpm audit ジョブを追加）

### 完了条件

- [ ] 商品を 20 件程度登録できる
- [ ] 価格を手動で記録できる
- [ ] 店舗別の価格比較が画面で見える
- [ ] PR に対して lint / type-check / test / build が自動で走る

## Sprint 3：MealPlan 献立作成（1.5週間）

### ゴール

土曜日に「今週の献立」を決めるフローがアプリで完結する。

### タスク

1. **MealPlan ドメインモデル実装**
   - `packages/domain/meal-plan/` に MealPlan / MealPlanId / PlannedRecipe / WeekIdentifier
   - ステータス遷移ロジック

2. **Drizzle スキーマ + Repository**
   - `meal_plans` テーブル
   - `planned_recipes` テーブル

3. **Use Case 実装**
   - `CreateMealPlanUseCase`（週指定で作成）
   - `AddRecipeToMealPlanUseCase`
   - `RemoveRecipeFromMealPlanUseCase`
   - `GetCurrentMealPlanUseCase`
   - `GetMealPlanHistoryUseCase`（過去の献立を見る）

4. **API + 画面**
   - 献立作成画面（レシピ選択 UI）
   - 倍量設定
   - 任意の日付指定
   - 過去の献立履歴ビュー

### 完了条件

- [x] 1週間分の献立を画面で組み立てられる（Unit B: meal-plan-screens）
- [x] 過去 4 週間の献立を遡れる（Unit B: meal-plan-screens）

### 進め方（2026-07-03 計画確定・2026-07-08 復元）

ユニット分割は Sprint 2 の縦割りパターンを踏襲する。
（注: 本節は `07837e7` で確定したが main へ未マージのまま消えていたため、Unit A 完了時点で復元）

| ユニット                  | 内容                                                                                                                                       | レベル | 実装ルート                       | 状態                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------------------------------- | ---------------------------------- |
| Unit A: meal-plan-core    | Domain（MealPlan / PlannedRecipe / WeekIdentifier / ステータス遷移）+ Drizzle スキーマ（meal_plans / planned_recipes）+ UseCase 5 本 + API | L3     | Codex 委譲（01〜05）             | **完了**（PR #37/#42/#44/#45/#46） |
| Unit B: meal-plan-screens | 献立作成画面（レシピ選択・倍量・任意日付）+ 履歴ビュー                                                                                     | L2     | Orchestrator 経路（implementer） | **完了**（2026-07-09）             |

スコープ判断（ユーザー確定・2026-07-03）:

- **献立作成画面・履歴ビュー（Unit B）は Sprint 3 の残タスク**として扱う（Sprint 4 へ丸ごと移す決定ではない）。
- ステータス遷移の UI と調理記録（markAsCooked）の UI は **Sprint 3 対象外**。
  遷移ロジックと cookedAt はドメインには実装済み。draft→shopping の遷移 UI は
  Sprint 4（買い物リスト作成）と連動して出す方が自然なため、そちらで扱う。

Unit A で確定済みだった未決事項（対応済み）:

- **WeekIdentifier の週定義**: 土曜始まり・Date ベースを採用（ADR-0005）。`docs/04-domain-model.md` も同期済み（E-8）。
- 倍量（scaleFactor）のプリセット: Domain は正の数のみ。固定ボタンは Unit B の UI 判断。
- 履歴ビューの範囲: API は `limit` デフォルト 4・最大 12（D-5）。画面側の表示は Unit B。

### Unit A 完了記録（2026-07-08）

- [x] MealPlan ドメインモデル実装（PR #37）
- [x] Drizzle スキーマ + Repository（PR #42）
- [x] Use Case 5 本（PR #44）
- [x] API Contract（PR #45）
- [x] Presentation API（Hono ルート）（PR #46）
- [x] `docs/04-domain-model.md` の WeekIdentifier / MealPlan を実装・ADR に同期（E-8）

## Sprint 4：ShoppingList 買い物リスト（2週間）

### ゴール

土曜の買い物がスマホ完結する。**このスプリントが MVP1 のクライマックス**。

### タスク

1. **ShoppingList ドメインモデル実装**
   - `packages/domain/shopping-list/` に ShoppingList / ShoppingListId / ShoppingItem
   - チェック状態管理

2. **Drizzle スキーマ + Repository**

3. **Use Case 実装**
   - `GenerateShoppingListUseCase`（献立から自動生成、Product から最安店舗を決定。
     Pantry 在庫引きは Sprint 5 へ — S-2）
   - `AddItemUseCase`（手動追加）
   - `MarkAsBoughtUseCase`
   - `ReassignStoreUseCase`
   - `GetShoppingListUseCase`（S-7 で Unit A へスコープ追加）

4. **API + 画面**
   - 買い物リスト画面（店舗ごとにグループ化）
   - チェックボックス
   - 価格入力
   - 手動追加フォーム
   - 価格比較インジケーター（「この商品はA店の方が安い」）

5. **PWA オフライン対応強化**
   - 買い物リスト画面のオフラインキャッシュ
   - 電波が悪いスーパーでも動くように

### 完了条件

- [x] 献立から買い物リストが自動生成される（API は Unit A・画面操作は Unit B で完了。PR #59）
- [ ] スーパーで実際に使って、ストレスなく操作できる（**実運用確認のみ残**。PWA オフライン
      3 項目 MB-10〜12 のローカル確認もこのタイミングで実施 — 2026-07-14 ユーザー確定）
- [x] 2人で同じリストを見て、お互いの操作が反映される（フォーカス refetch + 手動更新ボタンで
      実装。2 タブ収束を MB-13 で実画面確認済み）

### 進め方（2026-07-11 ユニット分割確定）

| ユニット                      | 内容                                                                                                                                 | レベル | 実装ルート                       | 状態                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------------------------------- | ------------------------------------- |
| Unit A: shopping-list-core    | Domain（ShoppingList / ShoppingItem / Quantity.add()）+ Drizzle スキーマ（shopping_lists / shopping_items）+ UseCase 5 本 + API 5 本 | L3     | Codex 委譲（01〜05）             | **完了**（PR #51〜#57）               |
| Unit B: shopping-list-screens | 買い物リスト画面（店舗グループ・チェック・価格入力・手動追加・推奨店舗バッジ）+ PWA オフライン強化                                   | L2     | Orchestrator 経路（implementer） | **完了**（PR #59。2026-07-14 マージ） |

スコープ判断（ユーザー確定・2026-07-12。確定値 S-1〜S-11 / D-1〜D-8 の正典は
`docs/designs/shopping-list-core.md`）:

- Pantry 在庫の引き算は行わない（S-2。Pantry 集約は Sprint 5。タスク 3 の記述を上書き）
- `GetShoppingListUseCase` + `GET /api/shopping-lists/:id` を Unit A へ追加（S-7。UseCase 5 本・API 5 本）
- 生成は冪等（S-6。`shopping_lists.meal_plan_id` UNIQUE + 既存返却 200 / 新規 201。
  MealPlan の draft→shopping 遷移も Generate が担う）
- `markAsSkipped` / `complete()` は Domain のみ実装（API 非公開。S-8 / S-9）。一覧・削除 API はスコープ外

### Unit A 完了記録（2026-07-13）

- [x] 上流工程成果物（要件・設計 + 契約・実装計画・試験計画）+ Codex 指示書パック（PR #51）
- [x] ShoppingList ドメインモデル + `Quantity.add()`（PR #52）
- [x] Drizzle スキーマ + Repository（PR #53）
- [x] UseCase 5 本（PR #54）
- [x] 公開 API JSDoc 規約の採用 + Task 3 振り返り（PR #55）
- [x] API Contract（Zod スキーマ + 契約テスト）（PR #56）
- [x] Presentation API（Hono ルート 5 本 + app.ts 統合）（PR #57）
- [x] `docs/04-domain-model.md` の ShoppingList / 生成ユースケースを実装に同期（S-2/S-5/S-8/S-10）

### Unit B 完了記録（2026-07-13）

- [x] 上流工程成果物（要件・設計・実装計画・試験計画。`docs/designs/shopping-list-screens.md` /
      `docs/implementation-plans/shopping-list-screens.md` / `docs/tests/shopping-list-screens.md`）
- [x] 実装（`/shopping-lists` エントリ画面・`/shopping-lists/[id]` 詳細画面・`meal-plans` への CTA 導線・
      PWA `runtimeCaching` 追記。`feature/shopping-list-screens` ブランチ）
- [x] Vitest 全 green（`pnpm lint` / `pnpm type-check` / `pnpm test`）+ 本番ビルドでの Serwist 有効化確認
- [x] manual-browser-verify（実画面確認。2026-07-14）: MB-01〜09/13〜15 の 12 項目 live PASS
      （PGlite 経路）。MB-10〜12（PWA オフライン）は BLOCKED — 本番ビルドは pglite 経路を
      dead code 除去する設計（`apps/web/src/db/client.ts`）のためリモートでは live 確認不可。
      sw.ts の 3 エントリ（GET 限定 matcher・NetworkFirst/SWR）はコード確認済み、
      Neon 接続の本番相当環境で PASS 見込み
- [x] reviewer レビュー（2026-07-14）: Must 0・Should 2・Nice 5 でマージ可判定。
      Should 2 件（refetch 成功時のエラーバナー残留・silent refetch の更新ボタン disable）は
      同日修正済み（回帰テスト LC-21/LC-22 追加）
- [x] PR #59 マージ（2026-07-14。上流成果物 + 実装 + レビュー修正の 4 コミット一式。
      E2E smoke は試験計画 §E2E smoke の要否判断どおり「任意」のまま見送りをユーザー確定）

本ユニットは要求分析・設計書で挙げられた roadmap の価格比較例示「A店の方が◯円安い」（本節タスク4）を
**満たさない**（S-6 確定 = 案A「推奨店舗バッジのみ」。金額差の定量表示は将来課題へ送った。設計書
`docs/designs/shopping-list-screens.md` §S-6 / R-6 参照）。

## Sprint 5：Pantry 在庫管理（1.5週間）

### ゴール

買い物完了後、自動で在庫が増える。手動で消費を記録できる。

### タスク

1. **Pantry ドメインモデル実装**
   - `packages/domain/pantry/` に Pantry / Stock / StockId

2. **Drizzle スキーマ + Repository**

3. **Use Case 実装**
   - `CompleteShoppingUseCase`（買い物完了 → Pantry 自動追加 + 価格履歴記録）
   - `ConsumeStockUseCase`（手動消費）
   - `DiscardStockUseCase`（廃棄）
   - `GetPantryUseCase`

4. **API + 画面**
   - 在庫一覧（カテゴリ別、保存場所別）
   - 「使った」ボタン
   - 「捨てた」ボタン

### 完了条件

- [x] 買い物完了で在庫が自動追加される（Unit A・PR #80）
- [x] 在庫の消費を記録できる（Unit B・PR #83/#84）
- [x] 次の献立作成時に在庫が考慮される（Unit C・2026-07-20。UseCase レベルで在庫引き算を実装）

### 進め方（2026-07-14 ユニット分割確定）

ユニット分割は Sprint 3/4 の縦割りパターンを踏襲する（ユーザー確定・2026-07-14）。

| ユニット               | 内容                                                                                                                                                                             | レベル | 実装ルート                                                          | 状態                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------- | -------------------------------------------------------- |
| Unit A: pantry-core    | Domain（Pantry / Stock / StockId）+ Drizzle スキーマ + Repository + UseCase 4 本（CompleteShopping / ConsumeStock / DiscardStock / GetPantry）+ API（買い物完了 API の公開含む） | L3     | Codex 委譲                                                          | **完了**（PR #80 マージ・2026-07-19）                    |
| Unit B: pantry-screens | 在庫一覧画面（保存場所別）+「使った」「捨てた」ボタン + 買い物リスト画面からの買い物完了導線                                                                                     | L2     | Codex 委譲（ユーザー確定・2026-07-19。IMP-2026-025 の効果実測対象） | **完了**（PR #83/#84 マージ・レビュー + 実画面確認済み） |
| Unit C: 在庫引き算連携 | `GenerateShoppingListUseCase` への Pantry 注入 + 切り上げルール（S-2 で Sprint 5 へ送った分。完了条件 3 に対応）                                                                 | L2     | Orchestrator 経路（メイン直接指揮 + implementer）                   | **完了**（2026-07-20）                                   |

スコープ注記（キックオフ時点の確認事項）:

- `ShoppingList.complete()` / `markAsSkipped()` はドメイン実装済み・API 非公開（S-8 / S-9）。
  買い物完了 API の公開は Unit A のスコープ。
- `getBoughtItemsForPantry()` は S-8 申し送りどおり Pantry 集約の設計時に再設計して確定する
  （`docs/04-domain-model.md` の CompleteShoppingUseCase は未実装の構想）。
- 依存メソッドは実装済みを確認: `Product.recordPrice()` / `MealPlan.transitionTo('cooking')`
  （shopping → cooking 遷移可）。
- 在庫引き算の端数処理（切り上げルール）は `docs/04-domain-model.md` 設計上の論点 3 のとおり
  Unit C の設計で確定する。

### Unit C 完了記録（2026-07-20）

設計書 `docs/designs/pantry-shopping-integration.md` / 実装計画
`docs/implementation-plans/pantry-shopping-integration.md`（いずれも確定）。

ユーザー確定の設計判断（2026-07-20）:

- **P-1 切り上げルール**: 数えられる単位（`個/本/枚/玉/尾/切れ/束/袋/缶`）のみ「必要量 − 在庫」を切り上げ。
  連続量（`g/kg/ml/l/大さじ/小さじ/cup/合`）は小数のまま。
- **P-2 マッチング**: productId 一致のみ（未設定の食材は従来どおり全量購入）。
- **P-3 在庫消費**: 生成時に Pantry を実際に減算・保存する（読み取り専用ではない）。

実装:

- [x] `packages/domain/src/shared/unit.ts` に `isCountableUnit()` を追加（+ テスト 17 件）
- [x] `GenerateShoppingListUseCase` に `PantryRepository` を注入し、差し引き・生成時消費を実装
      （単位不一致は差し引かず全量購入 = D-1・複数在庫は賞味期限の近い順に消費 = D-3・
      冪等パスでは消費しない = D-8）
- [x] `apps/web` の生成ルートに `pantryRepository()` を配線
- [x] 単体テスト追加（application 在庫引き算 9 シナリオ）。品質ゲート全 PASS
      （domain 297 / application 175 / web 313 / type-check 5-5 / lint 0 error）

積み残し（改善バックログ候補）: 集約横断（ShoppingList / Pantry / MealPlan）の書き込みは UoW が
無いため部分失敗を許容している（設計書 D-7）。将来トランザクション導入時に見直す。

### Sprint 5 完了サマリ（2026-07-21）

- **全 3 完了条件を達成・Pantry 在庫管理が機能的に完成**。Unit A（pantry-core・L3・Codex）+
  Unit B（pantry-screens・L2・Codex）+ Unit C（在庫引き算連携・L2・メイン直接指揮）が完了し、
  **MVP1 の機能ドメインが出揃った**（残るは Sprint 6 = 仕上げ・運用開始）。
- **品質**: Codex 受け入れレビュー 3 本連続で差し戻しゼロ（Task 5 Should 1 / Task 2 Nice 1 /
  Task 3 特記 1・いずれも Must 0）。手戻り 0。
- **期間中の運用改善**: Obsidian Vault 化 / IMP-2026-025〜029 採用・適用（Codex 上流二重生成の解消・
  ハーネス複雑度の簡素化・承認デッドロック解消）/ CI Dependency Audit 復旧（brace-expansion ReDoS）。
- **残課題**（Sprint 6 or バックログ）: 027/028 ハーネス改善の実地確認 / L2 タスクの TASK メトリクス
  経路強化 + IMP-2026-025 効果の定量締め / CI DATABASE_URL（Neon）設定 / 週次レビューの Routine 化。
- レビュー詳細: [docs/sprints/sprint5-review-2026-07-21.md](sprints/sprint5-review-2026-07-21.md)。

## Sprint 6：仕上げ・運用開始（1週間）

### ゴール

MVP1 を完成させ、日常運用に乗せる。

### タスク

1. **全体結合テスト**
   - 土曜運用の通しテスト：献立 → 買い物リスト → 買い物 → 在庫追加 → 平日消費
   - 過去のレシピ参照
   - 価格比較ビュー

2. **UX の調整**
   - 操作感の改善
   - 表示崩れの修正
   - レスポンシブ対応の最終確認

3. **PWA の調整**
   - アイコン・スプラッシュスクリーン
   - manifest の最終調整
   - iOS / Android 両方での動作確認

4. **ダッシュボード（簡易）** ✅ 実装済み（2026-07-21・`docs/designs/dashboard.md`）
   - 「今週の状態」サマリ — 今週の献立の状態 + レシピ件数 + `/meal-plans` 導線（無い場合は作成 CTA）
   - 賞味期限が近い在庫（Phase 2 で完全対応、MVP1 はリスト表示のみ）— 3 日以内 + 期限切れを昇順表示
   - ホーム `/` のリダイレクトを廃止し、土曜運用の起点に。既存 UseCase 集約のみ（新規 API/Domain 無し）

### 完了条件

- [x] MVP1 の全機能ドメインが実装され、土曜運用の導線が繋がっている（献立 → 買い物リスト →
      買い物 → 在庫追加 → 平日消費。各機能は Sprint 1〜5 で実装完了し、Sprint 6 タスク4 の
      ダッシュボードが起点を提供する）
- [ ] 2人で実際に1週間の運用を完走 — **実運用確認のみ残**（後続スプリントを止めない。下記）
- [ ] バグなしで土曜の買い物が完了 — **実運用確認のみ残**（同上）

> **未確認のまま残す項目（誤って完了扱いにしないこと）**: Sprint 6 タスク2（UX の調整）・
> タスク3（PWA の調整）は、個別の完了記録が roadmap にもログにも無い。PWA のインストール確認は
> Sprint 0「iPhone / Android 両方でホーム画面に追加できる」・Sprint 1「PWA としてインストール
> 状態で快適に動く」も未チェックのままで、**実機での確認記録が存在しない**。リモート環境では
> 本番ビルドの PWA 確認が原理的に成立しない（`.claude/skills/manual-browser-verify/SKILL.md`
> 手順 4）ため、実機確認はユーザー作業として残る。

### Sprint 6 クローズ（2026-08-05・ユーザー確定）

**Sprint 6 は締める。** 残る 2 項目は実運用でしか確認できず、Sprint 7 以降のブロッカーとしない。

旧完了条件は「2人で1週間の運用を完走」「バグなしで土曜の買い物が完了」の 2 項目のみで、
**どちらも反証不能だった**（「バグなし」を条件にすると、不具合が 1 件でも出る限り永久に
締まらない。「完走」の定義も無い）。そのため 2026-08-01 に予定した通しテストの結果が
ログに戻らず、**4 セッション連続でブロッカーとして運ばれ続けた**（`logs/2026-08-04.md`
セッション 1〜3）。実態として Sprint 7 タスク1 は先行着手・マージ済みであり、
ブロッカーの体裁だけが残ってロードマップの状態を不正確にしていた。

上記 2 項目を未チェックのまま先へ進めるのは、**Sprint 1・Sprint 4 と同じ扱い**である
（Sprint 1「スマホから操作してもストレスがない — 実利用で確認」、Sprint 4「スーパーで
実際に使って、ストレスなく操作できる（**実運用確認のみ残**）」）。Sprint 6 だけを
ブロッカー扱いしていたのは一貫性を欠いていた。

**申し送り**: 土曜運用の通しテストは価値がある。この 2 クラスの欠陥は自動テストが
構造的に検出できず、実運用でのみ露見してきた実績がある。

- **自由記述データ起因の表示崩れ** — 2026-07-27 の単価 10 倍ズレ（本番に基本単位 `1L` の
  商品が実在し「11L」表示。ユニットテストは全通過）。同型の既知事項が
  `docs/designs/shopping-list-price-comparison.md` §既知の限定事項 2 に現存する
- **機能の継ぎ目** — 2026-07-29 の「買い物完了経由の在庫に期限が付かない」

実施する場合は、観点リスト・合否基準・記録先を定義した形（`docs/tests/saturday-operation.md`
相当）にしないと結果がログに戻らない。これは Sprint 6 の締めとは切り離した独立課題とする。

## MVP2（Phase 2）：ロードマップ骨子（2026-07-29 起案）

### ステータス

**骨子（未確定）**。当初は「Sprint 6 の完了条件（2人で1週間の運用を完走）を先に締め、
そこで出た課題を Sprint 7 の先頭へ差し込んでから確定する」としていた（ユーザー確定・2026-07-29）が、
**2026-08-05 にこの前提を解除した**（上記 Sprint 6 クローズ）。実運用の結果を待たずに
Sprint 7 から着手し、運用で出た課題は都度この骨子へ反映する。
各スプリントの詳細設計は着手時に行う（`docs/designs/` / `docs/requirements/`）。

### MVP2 のゴール

**MVP1 が実運用で機能しきらない穴を先に塞ぎ、その上に新機能を積む。**
優先軸は「実運用の穴 > 新機能 > 基盤」（ユーザー確定・2026-07-29）。MVP1 の設計書・ADR で
意図的に「将来課題」として送った項目が主な入力であり、思いつきの機能追加ではない。

### 全体スケジュール（目安）

| Sprint    | 期間    | スコープ                                         | 主な入力                    |
| --------- | ------- | ------------------------------------------------ | --------------------------- |
| Sprint 7  | 1.5週間 | 価格比較の完成 ✅ **クローズ済み**（2026-08-07） | 困りごと 1 の未達分         |
| Sprint 8  | 1.5週間 | 在庫の実用化（期限入力 → アラート）              | 困りごと 2/3 + Phase 2 候補 |
| Sprint 9  | 1週間   | 土曜運用の耐久性（性能・オフライン）             | 実運用の体感課題            |
| Sprint 10 | 1.5週間 | 献立の精度 + 横断基盤                            | ADR の将来課題              |

合計約 **1.5ヶ月**。

### Sprint 7：価格比較の完成（1.5週間）

**ゴール**: 「どっちの店舗が安いか」を金額で判断でき、記録の打ち間違いを画面から直せる。

MVP1 の看板機能（困りごと 1「価格比較の手間」）が、推奨店舗バッジ止まりで
**roadmap Sprint 4 タスク 4 の例示「A店の方が◯円安い」に届いていない**。ここを閉じる。

| #   | タスク                                         | 出典・補足                                                                                                                          |
| --- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 価格差の定量表示                               | 実装済み（`docs/designs/shopping-list-price-comparison.md`。バルク取得 API 新設は不要と判明）                                       |
| 2   | 価格記録の編集                                 | ✅ 実装済み（2026-08-06・`docs/designs/price-record-edit-and-store-rename.md`）                                                     |
| 3   | 店舗のリネーム（`PUT /api/stores/:id`）        | ✅ 実装済み（2026-08-06・ADR-0015 で ADR-0013 案C の却下理由の射程を切り分けた）                                                    |
| 4   | 商品詳細の DB 往復削減 + recharts 遅延読み込み | ✅ 実装済み（2026-08-07・`docs/designs/product-detail-performance.md`。4 クエリ → 2 クエリ / recharts 373 KB を初期ロードから除去） |

**完了条件**

- [x] 買い物リストで「どちらの店舗が何円安いか」が画面で分かる（`docs/designs/shopping-list-price-comparison.md`）
- [x] 打ち間違えた店舗名・価格記録を画面から修正できる（`docs/designs/price-record-edit-and-store-rename.md`。
      商品詳細「最近の記録」から価格・内容量・店舗を編集、店舗管理カードから店舗名をリネーム）

### Sprint 7 クローズ（2026-08-07・ユーザー依頼により Orchestrator が判断）

**Sprint 7 は締める。** タスク 4 件すべて実装済み・main 反映済みで、完了条件 2 件を
**実コードで裏取りした**（roadmap の記述ではなく実装で確認する。2026-07-31 の学び）。

| 完了条件                       | 実装の実体                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 金額差が画面で分かる           | `price-comparison.ts` の `formatEstimatedDiffMessage()` が `オーケーの方が約210円安い` を生成                                |
| 打ち間違いを画面から修正できる | `PUT /api/products/:id/price-records/:priceRecordId` + `PriceRecordEditDialog` / `PUT /api/stores/:id` + `StoreRenameDialog` |

**ゴール記述との対応も取れている。** Sprint 7 の存在理由は「roadmap Sprint 4 タスク 4 の
例示『A店の方が◯円安い』に届いていない」ことだったが、実装された文言が
`${店舗名}の方が約${金額}円安い` でその形に一致する。

**Sprint 6 のクローズとの違い**: Sprint 6 は完了条件が「2人で1週間の運用を完走」
「**バグなしで**土曜の買い物が完了」で**どちらも反証不能**だったため、4 セッション連続で
ブロッカーとして運ばれ実態と乖離した。Sprint 7 の完了条件は「画面で分かる」
「画面から修正できる」という検証可能な形で、コード・テスト・実画面確認で確認できている。
**待つべき外部要因は無い。**

**申し送り（ブロッカーにしない）**: Sprint 6 の扱いに倣い、以下は締めることの妨げとしない。

- 本番環境での recharts 遅延読み込みの体感（dev で約 1.4 秒。実機確認が残件）
- `PriceRecordForm` の店舗一覧取得による既存 CLS 115px（`product-detail-performance`
  レビュー時に発見。本タスクが持ち込んだものではない）
- `DrizzleProductRepository.save()` の「`notInArray` 削除 → 全件 upsert」が非トランザクションで、
  並行書き込みが価格記録を静かに消す（`price-record-edit-and-store-rename` レビュー Medium 2）
- `hono` のパッチ追随（`<4.12.34` の ReDoS。CORS 未使用のため到達不能だがランタイム依存）
- `GET /api/products/:id/cheapest-store` と `GET /api/products/:id` がフロントエンドから未使用

**Sprint 8 への影響**: 依存関係は Sprint 8 内部（「期限の入力・編集手段がアラートの前提」）に
閉じており、Sprint 7 の成果を待つ必要は無い。契約・DTO・UseCase は既に `expiresAt` を
受け取れる形なので穴は UI 側のみ。**着手可能。**

### Sprint 8：在庫の実用化（1.5週間）

**ゴール**: 賞味期限が実データとして入り、期限切れ前に能動的に気づける。

**依存関係に注意**。賞味期限アラートは単体では成立しない。買い物完了パネルは Q-1 の確定で
常に `expiresAt: null` を送っており（`docs/designs/shopping-complete-stock-selection.md`）、
在庫の主要な流入経路に期限が付かない。手動追加フォームのみ期限入力に対応している。
**期限の入力・編集手段（タスク 1・2）がアラート（タスク 3）の前提**。

> **穴の所在の訂正（2026-08-09・キックオフ時の実測）**: 起案時は「契約・DTO・UseCase は
> すでに `expiresAt` を受け取れる形なので、穴は UI 側に閉じている」と書いていたが、
> これが成り立つのは**タスク 2（買い物完了パネル）だけ**だった。タスク 1（Stock の編集）は
> `Stock.expiresAt` / `storedLocation` が `private readonly`（`pantry-core.md` S-4 の明示的な
> 設計判断）で、更新 UseCase・契約・ルートのいずれも存在しない。さらに
> `DrizzlePantryRepository.save()` の upsert が `set: { amountValue }` のみのため、
> **ドメインを直しても DB に反映されない**。タスク 1 は全層に跨る。

| #   | タスク                                     | 出典・補足                                                                             |
| --- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| 1   | Stock の編集（賞味期限・保存場所の後付け） | `docs/designs/pantry-screens.md` P-3 案 B / shopping-complete-stock-selection 申し送り |
| 2   | 買い物完了パネルへの期限入力（任意入力）   | Q-1 の再訪（「パネルが縦に長くなる」懸念への対処が設計論点）                           |
| 3   | 賞味期限アラート（PWA Badge / 通知）       | Phase 2 候補。ダッシュボードのリスト表示は 2026-07-21 実装済み → 能動通知へ拡張        |
| 4   | 消費・廃棄の取り消し（undo）               | `docs/designs/pantry-screens.md` R-2 申し送り                                          |

**完了条件**

- [x] 買い物完了時に賞味期限を入力できる（任意）— Unit A（PR #145 / #146）
- [x] 既存の在庫に後から期限・保存場所を設定できる — Unit A（PR #145 / #146）
- [ ] 期限が近い在庫にアプリを開かずに気づける — Unit B の**実装は完了**（PR #147）だが、
      **実機での Push 受信確認が未了のため未達扱いとする**（2026-08-10 ユーザー判断で
      後続スプリントへ繰り越し。下記「Unit B の実機確認の繰り越し」）

### 進め方（2026-08-09 ユニット分割確定）

ユニット分割は Sprint 3〜5 の縦割りパターンを踏襲する（ユーザー確定・2026-08-09）。

| ユニット             | 内容                                                                                                                                                   | レベル | 実装ルート        | 状態                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit A: stock-edit   | タスク 1（Stock の編集：期限・保存場所**・数量**の後付け）+ タスク 2（買い物完了パネルへの期限入力）+ `/pantry` カードへの保存場所ラベル・緊急度チップ | L3     | Codex 委譲        | **完了**（PR #145 / #146 で main 反映済み・2026-08-09）                                                                                       |
| Unit B: expiry-alert | タスク 3（賞味期限アラート）                                                                                                                           | L3     | Orchestrator 経路 | **実装完了**（成果物 7 点 + ADR-0017 + 全層の実装。PR #147）。**実機での Push 受信確認は後続スプリントへ繰り越し**（2026-08-10 ユーザー判断） |
| Unit C: stock-undo   | タスク 4（消費・廃棄の取り消し）                                                                                                                       | 未判定 | 未定              | 余力次第                                                                                                                                      |

スコープ判断（ユーザー確定・2026-08-09）:

- **タスク 1・2 は 1 ユニットにまとめる**（Unit A）。どちらも「賞味期限を入れる手段」で
  UI 語彙（`Input type="date"` / `SelectField` + `LOCATION_SELECT_OPTIONS`）と DTO を共有し、
  完了条件 2 件（「買い物完了時に入力できる」「後から設定できる」）を同時に満たす。
- **Unit A のレベルは L3**。新規 HTTP API（`/api/pantry/stocks/:stockId` の更新系）を伴うため
  （`document-policy.md` §Level 3）。DB スキーマ変更は無い（`stocks.expires_at` /
  `stored_location` は nullable 列として既存）。
- **アラート（タスク 3）の方式は Web Push（VAPID）+ 日次 Cron の方向**で設計する。
  「アプリを開かずに気づける」を満たせるのはこの方式のみ（`setAppBadge` は iOS 非対応かつ
  アプリ起動が前提）。manifest / `appleWebApp` は iOS Web Push の前提を既に満たしているが、
  `push` ハンドラ・購読テーブル・VAPID 鍵・`vercel.json` はいずれも未整備。詳細設計と
  ADR は Unit B 着手時に行う（先回りして書かない）。
  → **完了（2026-08-09）**: `docs/designs/expiry-alert.md`（P-1〜P-11 確定）と
  [ADR-0017](./decisions/ADR-0017-web-push-expiry-alert.md)。実行時刻は JST 08:00 台、
  通知は 1 日 1 通のダイジェスト、購読 UI はダッシュボード内。**追加費用は発生しない**
  （Vercel Cron・Web Push・Neon いずれも現行プランの範囲内。日次より高頻度にする場合のみ
  Vercel Pro が必要）。
- **タスク 4（undo）は Sprint 8 の完了条件に含まれない**。Unit A / B が収まった余力で扱う。
- **数量（`amount`）の編集を Unit A に追加した**（P-1 ユーザー確定・2026-08-09）。roadmap の
  元の文言は「賞味期限・保存場所の後付け」だったが、`consume()` は在庫を減らすことしかできず
  打ち間違いを直せないため（回復手段が「廃棄して作り直す」しかなく、
  `source_shopping_item_id` の冪等キーと購入日を失う）。`displayName` は対象外のまま。

### Unit B の実機確認の繰り越し（2026-08-10 ユーザー判断）

Unit B は**実装・自動テスト・品質ゲートまで完了**している（PR #147。`pnpm test` 1990 件 PASS）。
残るのは `docs/tests/expiry-alert.md` §10 の実機確認（MB-01〜14）だが、これを
**Sprint 10 のタスク 5 へ繰り越す**。コードは現状のまま変更しない。

**PR #147 は繰り越しを待たずにマージする**（ユーザー確定）。Sprint 9 タスク 1
（Background Sync）が同じ `sw.ts` を触るため、PR を長く開けたままにすると衝突するのが理由。
本番の環境変数（VAPID 3 点 + `CRON_SECRET`）も設定するが、**購読は ON ボタンを押すまで 0 件**
なので、押さない限り通知は一切飛ばない。未検証の機能が勝手に動き出す経路は無い。

繰り越す理由と、繰り越しても安全な理由:

- 実機確認は **iPhone / Android の実機と Preview Deployment を同時に押さえた作業時間**が要る。
  dev では Serwist が無効で Service Worker が生成されないため（罠 1）、細切れの時間では進まない。
- Vercel の環境変数（VAPID 3 点 + `CRON_SECRET`）は **2026-08-10 に登録済み**。
  ただし**再デプロイ前**なので、確認再開時はまず再デプロイから始める。
- 未確認のままでも他機能を壊さない。VAPID 環境変数が読めない環境では購読 UI が
  ボタン無効 + 案内文の形で degrade し（`expiry-alert-subscription.tsx`）、Cron ルートは
  500 でフェイルクローズする（P-12）。**通知が誤って飛ぶ経路は無い。**

繰り越す作業（再開時はここから）:

1. Preview Deployment を**再デプロイ**する（環境変数は設定後に作られたデプロイにしか反映されない）
2. `curl` で `GET /api/push/vapid-public-key` が 200 を返すことを確認（MB-04。設定ミスの早期検知）
3. ES-1〜ES-6 をシードし、MB-01〜14 を iOS / Android で実施（`docs/tests/expiry-alert.md` §10）

**Sprint 8 の完了条件 3 件目は、この確認が終わるまで未達のまま**にする。実装が乗っていることと
「アプリを開かずに気づける」が成立していることは別であり、実機で一度も通知を受けていない段階で
完了印を付けると、後から「いつ動作確認したか」を誰も辿れなくなる。

### Sprint 9：土曜運用の耐久性（1週間）

**ゴール**: 電波の悪い店内で操作が失われず、体感速度の実測値が改善する。

| #   | タスク                                          | 出典・補足                                                                                       |
| --- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | PWA オフライン書き込みキュー（Background Sync） | `docs/designs/shopping-list-screens.md` S-5（本命の耐久性対策）                                  |
| 2   | Vercel Function を hnd1（東京）へ移す判断       | 2026-07-27 積み残し。**Neon 側の現リージョン確認が前提**（両方セットで移さないと DB 往復が悪化） |
| 3   | `ConsumeStock` の二重送信抑止                   | `docs/designs/pantry-core-contract.md`（非冪等 API）                                             |
| 4   | フォント追加削減の判断                          | 2026-07-27 積み残し（ウェイト 2 種で -33% / 常用漢字化で -28%。見た目の判断が必要）              |

**完了条件**

- [ ] オフライン中のチェック操作が復帰後に反映される
- [ ] 実測（フォント転送量・Function リージョン）で体感速度の改善を確認

### Sprint 10：献立の精度 + 横断基盤（1.5週間）

**ゴール**: 献立の変更が買い物リストへ正しく追随し、集約横断の書き込みが部分失敗しない。

| #   | タスク                                                 | 出典・補足                                                                                                        |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 1   | 献立変更への自動削除追随・数量合算                     | ADR-0007 / ADR-0011 / `docs/designs/meal-plan-shopping-sync.md`                                                   |
| 2   | `meal-plan.mapper.ts` の JST 日付ずれ検証              | `docs/designs/shopping-list-core.md`（潜在バグとして記録・未検証）                                                |
| 3   | DB トランザクション / UoW 導入                         | ADR-0006 → `docs/designs/pantry-core.md` R-3（全 Repository 横断）                                                |
| 4   | 小粒 UX（`useLeaveConfirmation` 適用・steps 並べ替え） | 2026-07-25 からの継続                                                                                             |
| 5   | **Unit B（expiry-alert）の実機確認**                   | Sprint 8 からの繰り越し。`docs/tests/expiry-alert.md` §10（MB-01〜14）。タスク 2 と同じ JST/TZ 系のため同時に扱う |

**完了条件**

- [ ] 献立からレシピを外すと買い物リストが追随する
- [ ] 集約横断の書き込みが部分失敗しない（トランザクション境界が引かれている）
- [ ] **Sprint 8 の完了条件 3 件目**「期限が近い在庫にアプリを開かずに気づける」が
      実機で確認できている（タスク 5）

### MVP2 に含めないもの（Phase 3 候補）

いずれも「実運用の穴」ではなく、データ蓄積や大きな基盤変更が前提のため送る。

- 認証導入（Better Auth）— ADR-0003 で段階的追加の選択肢を保持。2人運用では未だ不要
- 月次の食費分析 / 食材ロス分析 — 価格記録・消費履歴の蓄積が前提。Sprint 8 の undo/履歴が入ってから再評価
- レシピ提案（LLM 活用、冷蔵庫在庫を考慮）
- レシピ OCR 取り込み（カメラで紙レシピを撮影）
- レシピのインポート/エクスポート
- 友人との献立シェア / 外部レシピサイトからの取り込み

### 進め方

- ユニット分割は Sprint 3〜5 の**縦割りパターン**（Unit A: core / Unit B: screens）を踏襲する。
- 各スプリント着手時に変更レベル（L0〜L3）と実装ルート（Codex 委譲 / Orchestrator 経路）を宣言する。
- 詳細設計は着手時に行い、先回りして全スプリント分の設計書を書かない。

## 各スプリント共通の進め方

### スプリント開始時

- バックログから取るタスクを確定
- 概略設計（30 分以内で済ませる）

### スプリント中

- 業務時間外（平日夜・週末）に作業
- AI ツール（Claude Code / Cursor）を活用、ただし**コーディング自体は本人が行う**
- 設計判断は Claude と議論、実装は本人

### スプリント末（日曜）

- スプリントレビュー：何ができたか
- レトロスペクティブ：要件定義・ステークホルダー調整・リーダーシップの3軸で振り返る
- 次スプリントのバックログ確定

## リスクと対策

| リスク                         | 対策                                                                       |
| ------------------------------ | -------------------------------------------------------------------------- |
| Sprint 0 の環境構築でハマる    | 1週間で終わらなければ妥協ライン（PWA を後回しなど）を引く                  |
| Drizzle のスキーマ設計でハマる | 集約構造に合わせて JSONB を活用、過剰正規化しない                          |
| 実利用してUXが悪くてやる気喪失 | Sprint 1 後の実利用で違和感が大きければ、当該スプリント末で UX を優先修正  |
| 設計に時間をかけすぎる         | 各スプリントの設計時間は 1 日以内に収める                                  |
| 仕様変更が多発                 | アジャイルなので歓迎、ただし Sprint 内でのスコープ追加は次スプリントに送る |
