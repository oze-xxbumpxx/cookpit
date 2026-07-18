# 要求定義: test-infra-expansion

変更レベル: L3
作成日: 2026-07-01

---

## 要求の要約

テスト基盤を `packages/domain`（17本）+ `packages/application`（6本）の現状から、
`packages/infrastructure` と `apps/web` の 2 層に拡張する。

- **packages/infrastructure**: Vitest を新規導入し、DrizzleProductRepository /
  DrizzleStoreRepository / DrizzleRecipeRepository の CRUD 動作・マッピング往復を検証する。
- **apps/web**: Vitest を新規導入し、Hono RPC ルート単体テスト（`app.request` ベース）と
  代表的 React コンポーネントのユニットテストを整備する。既存 Playwright E2E は変更しない。

---

## 確定している前提・制約

### プロジェクト共通

- pnpm モノレポ + Turborepo。ルートの `pnpm test` → `turbo test` で全パッケージを実行する。
- 共有 Vitest 設定は `packages/config/vitest/base.cjs`（`globals: false`, `include: src/**/*.test.ts`, `environment: node`）。
- 後付け前例は `packages/application`:
  - `package.json` に `"test": "vitest run"` を追加。
  - `devDependencies` に `vitest` と `@cookpit/config` を追加。
  - `vitest.config.ts` で `export default baseConfig`（baseConfig を再エクスポートするだけ）。
- コーディング規約: `any` 禁止、named export のみ、`import type`、`===`、`null` 統一。
- 既存 Playwright E2E（`apps/web/e2e/`）は本タスクのスコープ外。

### packages/infrastructure の前提

- 現時点では `package.json` に `"test"` スクリプトなし、`vitest` 非インストール。
- DB 接続実装（`packages/infrastructure/src/db/client.ts`）:

  ```typescript
  export function createDb(databaseUrl: string) {
    return drizzle(neon(databaseUrl), { schema });
  }
  export type DrizzleClient = ReturnType<typeof createDb>;
  ```

  - `neon()` は `@neondatabase/serverless` の HTTP ドライバ固定。ローカル PostgreSQL や
    PGlite には直接向けられない。URL を差し替えても接続先が Neon 以外ならプロトコルが合わない。
  - `drizzle-orm/neon-http` ドライバを前提にした型（`DrizzleClient = ReturnType<typeof createDb>`）
    になっているため、別ドライバのクライアントを注入するには型変更を伴う。
  - ファクトリ関数として切り出されているため、引数レベルの差し替えは可能な構造ではある。

- Repository のコンストラクタはすべて `constructor(private readonly db: DrizzleClient)` の形で
  `DrizzleClient` を外から注入する設計になっている。

- Drizzle スキーマ定義テーブル: `recipes`, `stores`, `products`, `priceRecords` の 4 テーブル。
  外部キー: `priceRecords.productId → products.id (cascade)`, `priceRecords.storeId → stores.id (restrict)`。

- `DrizzleProductRepository.save` は複数 INSERT + DELETE を別々のステートメントで実行（トランザクションなし）。

- `DrizzleProductRepository.findById` / `findAll` は products + priceRecords の LEFT JOIN で結合し、
  Map を使って `ProductGroup` にグルーピングしてから Entity を生成する。

### apps/web の前提

- Vitest 非インストール、`package.json` に `"test"` スクリプトなし。
- Hono ルートは `src/server/routes/*.ts` で各 UseCase を手動 DI して組み立てる。DB 接続は
  各ルート内のファクトリ関数（例: `function recipeRepository() { return new DrizzleRecipeRepository(getDb()); }`）
  で生成する。`getDb()` は `src/db/client.ts` に定義されたモジュールレベルのシングルトン。
- `src/server/app.ts` は `routes` と `AppType` を named export。`hono/testing` の `testClient`
  または `app.request()` でルートへのリクエストをシミュレートできる。
- `apps/web` の DB クライアント（`src/db/client.ts`）は `@cookpit/infrastructure` の `createDb` を
  薄くラップし、`process.env.DATABASE_URL` が存在しない場合 `null` を返す設計。
- Playwright E2E は既に整備済み（`playwright.config.ts`, `e2e/recipe-crud.smoke.spec.ts`）。
  レシピ CRUD のハッピーパスを担っているため、同等シナリオを Vitest で重複実装しない。

### React コンポーネントの種類と外部依存

- `RecipeCard`（`src/app/recipes/_components/recipe-card.tsx`）: `Link`（Next.js）依存の presentational。
- `TagFilter`（`src/app/recipes/_components/tag-filter.tsx`）: state なし、props + callback のみの純粋コンポーネント。
- `RecipeListClient`（`src/app/recipes/_components/recipe-list-client.tsx`）: `useState` + `useMemo`
  で検索・タグフィルタロジックを持つ。`Link` / `TagFilter` / `RecipeCard` に依存。
- `ProductListClient`（`src/app/products/_components/product-list-client.tsx`）: カテゴリフィルタ +
  検索（日本語ロケール `toLocaleLowerCase('ja-JP')`）。
- `RecipeFormClient`（`src/app/recipes/new/_components/recipe-form-client.tsx`）: `useRouter`（Next.js）
  - Hono RPC 呼び出し（`client.api.recipes.$post`）依存。Testing Library での単体テストには
    モック設定が複雑になる。
- `product-format.ts`（`src/app/products/_utils/product-format.ts`）: React 非依存の純粋関数群。
  `findLatestPriceRecord`, `formatYen`, `unitPriceBasisLabel` など。Vitest で DB レス・jsdom レスで
  テスト可能。

---

## 不明点・要確認事項

### [Q1] テスト DB 戦略の選択（最重要・architecture-designer で決定が必要）

Infrastructure の Repository テストには実 DB アクセスが必要。候補は以下:

| 戦略                                | 概要                                       | 利点                                                          | 制約                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Neon テスト用ブランチ            | Neon の branch 機能でテスト専用 DB を用意  | 本番と完全同一の `drizzle-orm/neon-http` ドライバを使用できる | CI で `DATABASE_URL` 環境変数が必要、ネットワーク依存、Neon 無料枠ブランチ上限（10件）に注意                                                              |
| B: PGlite（`@electric-sql/pglite`） | Node.js 内で PostgreSQL をインプロセス起動 | CI で外部接続不要、高速、Docker 不要                          | `createDb` が `neon()` に固定されているためドライバ差し替え（型変更含む）が必要。`drizzle-orm` の PGlite アダプタ（`drizzle-orm/pglite`）の動作確認が必要 |
| C: docker-compose で local PG       | CI で PostgreSQL コンテナを起動            | 標準 `node-postgres` ドライバを使用可能                       | CI に Docker が必要（GitHub Actions では `services` で対応可能だが設定が必要）。`drizzle-orm/node-postgres` へのドライバ変更またはデュアルサポートが必要  |
| D: モックのみ（DB アクセスなし）    | `DrizzleClient` をモック化                 | 外部依存ゼロ                                                  | マッピング往復・整合性の実動検証ができず Infrastructure テストの価値が薄い                                                                                |

**確認事項:**

- CI 環境（GitHub Actions かローカルのみか）で Docker を使えるか・使いたいか。
- Neon 無料枠のブランチ数制限が制約になるか（MVP1 の制約: Vercel + Neon 無料枠）。
- `createDb` の型・実装変更を伴うリファクタを許容するか（戦略 B / C の場合に必要）。

### [Q2] apps/web Hono RPC テストにおける DB 依存の扱い

Hono ルートは `getDb()` を直接呼んでいるため、テスト時に以下のいずれかが必要:

- a) `vi.mock('@cookpit/infrastructure', ...)` で Repository をモジュールレベルでモック化する。
- b) UseCase 層をモック化する（`vi.mock('@cookpit/application', ...)`）。
- c) テスト用 DB に向けた `DATABASE_URL` 環境変数をセットして実接続する。

どのレベルのモック境界が許容されるか、architecture-designer の判断が必要。

### [Q3] React コンポーネントテストの環境設定

base.cjs が `environment: 'node'` を設定しているため、jsdom が必要なコンポーネントテストとは
環境が異なる。Vitest のファイルごとの `@vitest-environment jsdom` アノテーションを使うか、
`apps/web` 専用の vitest workspace 設定を作るかの判断が必要。

### [Q4] apps/web の vitest.config.ts のパスエイリアス解決

`apps/web` は `@/...`（tsconfig の paths）を使用している。Vitest は tsconfig の paths を
自動解決しないため、`vitest-tsconfig-paths` プラグインまたは `resolve.alias` の手動設定が必要。

### [Q5] テスト実行スコープの分離

Infrastructure テストが実 DB 接続を必要とする場合、`pnpm test`（turbo task）でまとめて
実行するか、Infrastructure テストのみ別コマンドに分離するかを決める必要がある。
個人開発でオフライン開発を想定する場面があるかどうかによってトレードオフが変わる。

---

## 影響範囲

### packages/infrastructure

| ファイル                                              | 変更種別 | 内容                                                                          |
| ----------------------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| `package.json`                                        | 追加     | `"test": "vitest run"` スクリプト、`vitest` + `@cookpit/config` devDependency |
| `vitest.config.ts`                                    | 新規     | baseConfig を再エクスポート（application と同パターン）                       |
| `src/repositories/drizzle-recipe.repository.test.ts`  | 新規     | Recipe Repository テスト                                                      |
| `src/repositories/drizzle-product.repository.test.ts` | 新規     | Product Repository テスト（priceRecords 結合含む）                            |
| `src/repositories/drizzle-store.repository.test.ts`   | 新規     | Store Repository テスト                                                       |
| `src/repositories/mappers.test.ts`                    | 新規     | `toUnit()` マッパー単体テスト（DB 不要）                                      |

テスト DB 戦略によっては以下も影響範囲に入る（戦略確定後に決定）:

| ファイル           | 変更種別     | 条件                                                                            |
| ------------------ | ------------ | ------------------------------------------------------------------------------- |
| `src/db/client.ts` | 変更の可能性 | PGlite / docker-compose PostgreSQL 戦略の場合、ドライバ抽象化のリファクタが必要 |

### apps/web

| ファイル                                                  | 変更種別 | 内容                                                                                                          |
| --------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `package.json`                                            | 追加     | `"test": "vitest run"` スクリプト、`vitest` + `@testing-library/react` + `jsdom` or `happy-dom` devDependency |
| `vitest.config.ts`                                        | 新規     | base 設定 + `@/` パスエイリアス解決                                                                           |
| `src/server/routes/recipes.test.ts`                       | 新規     | Hono recipesRoute 単体テスト                                                                                  |
| `src/server/routes/products.test.ts`                      | 新規     | Hono productsRoute 単体テスト                                                                                 |
| `src/server/routes/health.test.ts`                        | 新規     | Hono healthRoute テスト（DB なし分岐を含む）                                                                  |
| `src/app/recipes/_components/tag-filter.test.tsx`         | 新規     | TagFilter コンポーネントテスト                                                                                |
| `src/app/recipes/_components/recipe-list-client.test.tsx` | 新規     | RecipeListClient フィルタリングロジックテスト                                                                 |
| `src/app/products/_utils/product-format.test.ts`          | 新規     | product-format.ts の純粋関数テスト（jsdom 不要）                                                              |

### パッケージ設定（変更なし）

| ファイル                          | 変更種別 | 内容                          |
| --------------------------------- | -------- | ----------------------------- |
| `packages/config/vitest/base.cjs` | 変更なし | 既存設定を流用                |
| `turbo.json`                      | 変更なし | `"test"` タスク定義は既に存在 |

---

## 試験観点

### packages/infrastructure — Repository テスト

#### 正常系

| ID         | 対象                                              | 観点                                                                                                 |
| ---------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| INFRA-R-01 | DrizzleRecipeRepository.save → findById           | 保存した Recipe を ID で取得し、全フィールドが一致すること（マッピング往復）                         |
| INFRA-R-02 | DrizzleRecipeRepository.save → findAll            | 保存した Recipe が全件取得に含まれること                                                             |
| INFRA-R-03 | DrizzleRecipeRepository.save（上書き）            | 同一 ID で再 save すると更新されること（onConflictDoUpdate）                                         |
| INFRA-R-04 | DrizzleRecipeRepository.delete → findById         | 削除後に findById が null を返すこと                                                                 |
| INFRA-R-05 | Recipe ingredients JSONB 往復                     | amount あり / amountNote のみ / productRef あり / productRef null の各パターンが正確に復元されること |
| INFRA-R-06 | Recipe steps JSONB 往復                           | 複数ステップが順序を保ったまま往復すること                                                           |
| INFRA-R-07 | DrizzleProductRepository.save → findById          | Product（priceHistory なし）のマッピング往復                                                         |
| INFRA-R-08 | DrizzleProductRepository.save → findById          | Product + priceRecords（複数）の LEFT JOIN 結合・グルーピングが正しいこと                            |
| INFRA-R-09 | DrizzleProductRepository.delete                   | 商品削除時に関連 priceRecords が cascade 削除されること                                              |
| INFRA-R-10 | PriceRecord の numeric 精度                       | `priceAmount` / `unitPriceAmount`（numeric(10,1)）が `Number()` 変換で桁落ちしないこと               |
| INFRA-R-11 | DrizzleStoreRepository.save → findAll             | Store の全フィールドマッピング往復                                                                   |
| INFRA-R-12 | DrizzleProductRepository.save（priceRecord 更新） | priceHistory に追加された PriceRecord が onConflictDoUpdate で更新されること                         |

#### 異常系

| ID         | 対象                                                            | 観点                                              |
| ---------- | --------------------------------------------------------------- | ------------------------------------------------- |
| INFRA-E-01 | findById（存在しない ID）                                       | null が返ること                                   |
| INFRA-E-02 | toUnit（未知の unit 文字列）                                    | `Error: Unknown unit: xxx` がスローされること     |
| INFRA-E-03 | DrizzleProductRepository.save（storeId が stores に存在しない） | FK 制約違反（restrict）で DB エラーが発生すること |
| INFRA-E-04 | DrizzleRecipeRepository の toRecipeTag（未知のタグ）            | `Error: Unknown recipe tag:` がスローされること   |

#### 境界条件

| ID         | 対象                                   | 観点                                                              |
| ---------- | -------------------------------------- | ----------------------------------------------------------------- |
| INFRA-B-01 | Recipe の ingredients / steps が空配列 | 空 JSONB が正しく保存・復元されること                             |
| INFRA-B-02 | Recipe の cookingTime が null          | null のまま往復すること                                           |
| INFRA-B-03 | Product の aliases が空配列            | 空配列が text[] として正しく往復すること                          |
| INFRA-B-04 | Product の priceHistory が 0 件        | LEFT JOIN で priceRecord が null の行が空配列として復元されること |
| INFRA-B-05 | priceAmount の小数点以下               | numeric(10,1) の小数値が `Number()` 変換で正しく往復すること      |

#### マッパー単体（DB 不要）

| ID         | 対象               | 観点                                                                                                                           |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| INFRA-M-01 | toUnit（全許容値） | 'g', 'kg', 'ml', 'l', '大さじ', '小さじ', 'cup', '個', '本', '枚', '玉', '尾', '切れ', '束', '袋', '缶', '合' が正しく返ること |
| INFRA-M-02 | toUnit（未知値）   | `Error: Unknown unit: xxx` をスローすること                                                                                    |

---

### apps/web — Hono RPC ルートテスト

前提: UseCase / Repository をモック化（または環境変数でテスト用 DB に向ける）し、
`app.request()` または `hono/testing` の `testClient` でリクエストを発行する。

#### 正常系

| ID        | 対象                                 | 観点                                                                |
| --------- | ------------------------------------ | ------------------------------------------------------------------- |
| HONO-R-01 | GET /api/recipes                     | 200 + JSON 配列が返ること                                           |
| HONO-R-02 | GET /api/recipes/:id（存在する）     | 200 + 対象 RecipeDto が返ること                                     |
| HONO-R-03 | POST /api/recipes                    | 201 + 作成済み RecipeDto が返ること                                 |
| HONO-R-04 | PUT /api/recipes/:id                 | 200 + 更新済み RecipeDto が返ること                                 |
| HONO-R-05 | DELETE /api/recipes/:id              | 204 が返ること                                                      |
| HONO-R-06 | GET /api/products                    | 200 + JSON 配列が返ること                                           |
| HONO-R-07 | POST /api/products/:id/price-records | 200 が返ること                                                      |
| HONO-R-08 | GET /api/health（DB なし）           | `{ status: 'ok', db: 'disconnected (no DATABASE_URL)' }` が返ること |

#### 異常系

| ID        | 対象                                       | 観点                                                        |
| --------- | ------------------------------------------ | ----------------------------------------------------------- |
| HONO-E-01 | GET /api/recipes/:id（存在しない）         | 404 + `{ error: "..." }` が返ること（onError ハンドラ経由） |
| HONO-E-02 | POST /api/recipes（バリデーション違反）    | 400 が返ること（zValidator 経由）                           |
| HONO-E-03 | GET /api/recipes/:id（UUID 形式でない ID） | 400 が返ること（`idParamSchema` の `z.uuid()` 違反）        |
| HONO-E-04 | GET /api/products/:id（存在しない）        | 404 + `{ error: "..." }` が返ること                         |

---

### apps/web — React コンポーネント・ユーティリティテスト

#### product-format.ts（純粋関数、jsdom 不要）

| ID        | 対象                                  | 観点                                      |
| --------- | ------------------------------------- | ----------------------------------------- |
| UTIL-F-01 | findLatestPriceRecord（複数レコード） | observedAt が最も新しいレコードが返ること |
| UTIL-F-02 | findLatestPriceRecord（0 件）         | null が返ること                           |
| UTIL-F-03 | formatYen                             | 数値を「X円」形式にフォーマットすること   |
| UTIL-F-04 | unitPriceBasisLabel（g/kg）           | '100g' を返すこと                         |
| UTIL-F-05 | unitPriceBasisLabel（ml/l）           | '100ml' を返すこと                        |
| UTIL-F-06 | unitPriceBasisLabel（その他単位）     | `1${unit}` 形式を返すこと                 |

#### TagFilter（純粋コンポーネント、state なし）

| ID        | 対象            | 観点                                              |
| --------- | --------------- | ------------------------------------------------- |
| COMP-T-01 | 初期状態        | 「すべて」が `selected` 状態であること            |
| COMP-T-02 | タグクリック    | `onChange` が正しい TagFilterValue で呼ばれること |
| COMP-T-03 | value prop 変更 | value に応じて選択状態が更新されること            |

#### RecipeListClient（フィルタリングロジック）

| ID        | 対象                | 観点                                           |
| --------- | ------------------- | ---------------------------------------------- |
| COMP-L-01 | initialRecipes が空 | 「まだレシピがありません」が表示されること     |
| COMP-L-02 | テキスト検索        | レシピ名が一致するものだけ絞り込まれること     |
| COMP-L-03 | タグフィルタ        | 一致するタグを持つものだけ絞り込まれること     |
| COMP-L-04 | 絞り込み結果 0 件   | 「該当するレシピがありません」が表示されること |

---

### Playwright E2E との棲み分け

| テスト種別 | Playwright E2E（既存）                               | Vitest（新規）                                                                           |
| ---------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 担当       | ブラウザでの CRUD ハッピーパス・エンドツーエンド検証 | ルート単体のレスポンス検証、コンポーネントの描画ロジック、ユーティリティ関数の網羅的検証 |
| DB 必要    | 必要（実 Neon）                                      | Hono RPC テストは Q2 の方針による、コンポーネント/ユーティリティテストは不要             |
| 重複回避   | レシピ CRUD ハッピーパスはすでに Playwright で担保   | Vitest では網羅的な入力パターン・エラーケースを担当                                      |

---

## テスト容易性のための要確認事項（コード変更の可否判断が必要）

以下は現時点では実装変更しないが、戦略決定後に最小リファクタが必要になる可能性がある箇所。
architecture-designer へのインプットとして列挙する。

1. **`packages/infrastructure/src/db/client.ts` — ドライバ抽象化**
   PGlite または docker-compose PostgreSQL 戦略を選ぶ場合、`createDb(url)` が
   `neon(url)` + `drizzle-orm/neon-http` に固定されているためドライバ差し替えができない。
   引数を URL 文字列から Drizzle クライアントそのものに変えるか、ファクトリ関数を複数用意するか、
   もしくはドライバを環境変数で切り替えるかの設計変更が必要になりうる。
   現在 `DrizzleClient` 型が `ReturnType<typeof createDb>` として定義されているため、
   別ドライバのクライアントを Repository に注入する際に型の互換性確認が必要。

2. **`apps/web/src/server/routes/*.ts` — `getDb()` の直接呼び出し**
   各ルートがモジュールレベルのファクトリ関数内で `getDb()` を呼んでいるため、
   テストでは以下のいずれかの対処が必要:
   - `vi.mock('@/db/client', () => ({ getDb: vi.fn().mockReturnValue(mockDb) }))` でモジュールモック
   - `vi.mock('@cookpit/infrastructure', ...)` で Repository をモック
   - `vi.mock('@cookpit/application', ...)` で UseCase をモック

3. **`apps/web/vitest.config.ts` — パスエイリアス解決**
   `@/` は tsconfig の paths で定義されているが、Vitest は tsconfig の paths を自動解決しない。
   `vitest-tsconfig-paths` プラグインまたは手動の `resolve.alias` 設定が必要。
   これはコード変更なしに設定ファイルのみで対応可能。

---

## 非機能要件・CI 考慮事項

- **実行速度**: `mappers.test.ts`（INFRA-M-01/02）と `product-format.test.ts`（UTIL-F-_）と
  React コンポーネントテスト（COMP-_）は DB 不要で高速実行可能。
  Repository 統合テストは DB 接続がボトルネックになりえる。
- **Vercel + Neon 無料枠制約**: 本プロジェクトは継続費用ゼロ制約あり。Neon テスト用ブランチの
  作成数制限（無料枠: ブランチ 10 件まで）に注意が必要。
- **CI 分離オプション**: 実 DB を必要とする Repository テストを別コマンド（例: `pnpm test:infra`）
  に分離し、ユニットテストのみを高速 CI パスに乗せる設計が有効な可能性あり。

---

## スコープ外（明示）

- Playwright E2E テストの新規実装・変更
- `packages/domain` / `packages/application` の既存テスト変更
- プロダクションコードの機能改変
- MealPlan / ShoppingList / Pantry の Repository テスト（現在 Repository 実装が `packages/infrastructure` に存在しないため）
