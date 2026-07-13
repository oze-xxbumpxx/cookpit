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

合計約 **2.5ヶ月**。

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
   - 実装指針 `docs/tasks/sprint1-visual-design-system.md`
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

- [ ] 献立から買い物リストが自動生成される（API は Unit A で完了。画面操作は Unit B）
- [ ] スーパーで実際に使って、ストレスなく操作できる
- [ ] 2人で同じリストを見て、お互いの操作が反映される（最低限 refetch でOK）

### 進め方（2026-07-11 ユニット分割確定）

| ユニット                      | 内容                                                                                                                                 | レベル | 実装ルート                       | 状態                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------------------------------- | ---------------------------------------------------------------------------------- |
| Unit A: shopping-list-core    | Domain（ShoppingList / ShoppingItem / Quantity.add()）+ Drizzle スキーマ（shopping_lists / shopping_items）+ UseCase 5 本 + API 5 本 | L3     | Codex 委譲（01〜05）             | **完了**（PR #51〜#57）                                                            |
| Unit B: shopping-list-screens | 買い物リスト画面（店舗グループ・チェック・価格入力・手動追加・推奨店舗バッジ）+ PWA オフライン強化                                   | L2     | Orchestrator 経路（implementer） | **実装完了**（2026-07-13。品質ゲート緑・manual-browser-verify とレビューは未実施） |

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
- [ ] manual-browser-verify（実画面確認）・Orchestrator レビューは別途実施

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

- [ ] 買い物完了で在庫が自動追加される
- [ ] 在庫の消費を記録できる
- [ ] 次の献立作成時に在庫が考慮される

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

4. **ダッシュボード（簡易）**
   - 「今週の状態」サマリ
   - 賞味期限が近い在庫（Phase 2 で完全対応、MVP1 はリスト表示のみ）

### 完了条件

- [ ] 2人で実際に1週間の運用を完走
- [ ] バグなしで土曜の買い物が完了

## Phase 2 以降の見出しのみ

**詳細は必要になってから設計する。**

### Phase 2 候補機能

- 賞味期限アラート（プッシュ通知 or PWA Badge）
- 認証導入（Better Auth）
- 食材ロス分析
- レシピ提案（LLM 活用、冷蔵庫在庫を考慮）
- 月次の食費分析
- レシピ OCR 取り込み（カメラで紙レシピを撮影）

### Phase 3 以降の構想

- レシピのインポート/エクスポート
- 友人との献立シェア
- 外部レシピサイトからの取り込み

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
