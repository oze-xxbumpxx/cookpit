# 設計書: test-infra-expansion

- feature: test-infra-expansion
- 変更レベル: L2
- 作成日: 2026-07-01
- 担当: architecture-designer

---

## 1. 目的・背景

### 現状

| パッケージ / アプリ     | テスト基盤                                       | テスト本数 |
| ----------------------- | ------------------------------------------------ | ---------- |
| packages/domain         | vitest.config.ts 導入済み・co-located \*.test.ts | 17 本      |
| packages/application    | vitest.config.ts 導入済み・co-located \*.test.ts | 6 本       |
| packages/infrastructure | 未導入（test スクリプト無し・vitest 無し）       | 0 本       |
| apps/web                | 未導入（test スクリプト無し・vitest 無し）       | 0 本       |

### 目的

未導入の 2 層（packages/infrastructure・apps/web）に Vitest テスト基盤を追加する。
プロダクションコードの機能改変はしない。「基盤の確立 + 代表テストの追加」を今回のスコープとし、
全 Repository / 全コンポーネントの網羅は後続フェーズとする。

---

## 2. 対象範囲

### 対象

- packages/infrastructure: vitest 設定・DB 戦略の確立・代表 Repository テスト
- apps/web: vitest 設定・Hono RPC ルートの代表テスト・代表コンポーネントテスト

### 対象外

- packages/domain のテスト追加・変更（既存 17 本は変更なし）
- packages/application のテスト追加・変更（既存 6 本は変更なし）
- E2E テスト（Playwright は apps/web/package.json に e2e スクリプトが既にあるが、今回は対象外）
- MealPlan・ShoppingList・Pantry 集約に対応する Repository（インフラ層にまだ実装が存在しない）
- 全 Hono ルート・全コンポーネントの網羅（後続フェーズ）
- 認証・ミドルウェアのテスト（MVP1 では認証なし）

---

## 3. アーキテクチャ上の位置づけ

```
Presentation (apps/web)          ← 今回: Hono ルート・コンポーネントの代表テスト
        |
Application (packages/application) ← 変更なし
        |
Domain (packages/domain)          ← 変更なし
        |
Infrastructure (packages/infrastructure) ← 今回: DB 戦略確立・Repository テスト
```

Repository テストは「DB スキーマ形 ⇔ ドメインモデル形」の変換責任（domain-layer.md の定義）を
検証することが最大の目的である。Application 層のテストが InMemory Repository でユースケースを
検証するのとは役割が異なる。

---

## 4. 最重要設計判断: packages/infrastructure のテスト DB 戦略

### 4.1 Repository テストが検証すべき責務

`packages/infrastructure/src/repositories/` の各クラスは以下を責務とする。

1. DB 行（Drizzle の `$inferSelect` 型）→ ドメイン Entity への変換（`reconstruct()` 呼び出し）
2. ドメイン Entity → DB 挿入行への変換（`insert().values()` / `onConflictDoUpdate()`）
3. JOIN を含むクエリ（DrizzleProductRepository は products + priceRecords を LEFT JOIN）
4. 外部キー制約の振る舞い（priceRecords → products 間の CASCADE DELETE 等）
5. Drizzle の `numeric` 型が `string` で返ることへの対応（`Number(row.priceAmount)` 等）

「モック化のみ」では上記の 1〜5 を検証できない。特に 3〜5 は SQL を実際に実行しないと
検証が困難であり、Repository の責務の核心部分が抜け落ちる。

### 4.2 テスト DB 戦略の比較

| 観点                     | A: PGlite (in-process PG)                                                                          | B: testcontainers (実 Postgres in Docker)                          | C: pg-mem (in-memory PG 模倣)                    | D: Repository モック化のみ                       |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------ |
| **変換忠実度**           | 高（実 PG プロトコル・型変換を含む）                                                               | 最高（本番 DB と同一バイナリ）                                     | 中（PG 互換だが完全ではない）                    | 低（変換ロジックをスキップ）                     |
| **Drizzle 実クエリ実行** | 可（drizzle-orm/pglite ドライバあり）                                                              | 可（drizzle-orm/node-postgres）                                    | 限定的（未サポートの構文あり）                   | 不可                                             |
| **マイグレーション適用** | 可（Drizzle migrate をそのまま利用可）                                                             | 可                                                                 | 不可（マイグレーションファイルは解析不可）       | 不可                                             |
| **CI 依存**              | Docker 不要。GitHub Actions 標準で動作                                                             | Docker 必須。`services: postgres` または testcontainers SDK が必要 | Docker 不要                                      | Docker 不要                                      |
| **実行速度**             | 高速（プロセス内・ファイルレス）                                                                   | 低速（コンテナ起動 10〜30 秒）                                     | 高速                                             | 最速（IO なし）                                  |
| **導入コスト**           | 低（`@electric-sql/pglite` + Drizzle ドライバ）                                                    | 高（Docker 前提・testcontainers SDK）                              | 低                                               | 最低                                             |
| **保守性**               | 高（Drizzle スキーマが単一の正典）                                                                 | 高（本番と同一だが CI 設定が増える）                               | 中（PG 非互換が増えると壊れる）                  | 低（変換ロジックを別途手動検証する必要がある）   |
| **注意点**               | neon-http ドライバは PGlite 非対応。テスト用に `drizzle-orm/pglite` ドライバを切り替える設計が必要 | ローカル開発に Docker が必要になる                                 | numeric/jsonb の挙動が実 PG と乖離する懸念がある | Repository を全網羅するほど UseCase テストと重複 |

### 4.3 推奨: A（PGlite）

**推奨理由:**

- Repository の変換責務を実 PG プロトコルで検証できる唯一の Docker 不要案。
- CI を Docker なしで完結できる（現行 ci.yml への最小変更）。
- Drizzle の `drizzle-orm/pglite` ドライバが公式サポートされており、スキーマ定義を再利用できる。
- `numeric` 型が `string` で返る挙動・`jsonb` の配列展開など、本番 DB の型変換挙動を同程度に再現できる。
- テスト間の独立性を「テスト毎に PGlite インスタンスを生成 → スキーマを適用 → 終了後破棄」で確保しやすい。

**トレードオフ（承認前に確認事項）:**

- `packages/infrastructure` の `createDb()` が現在 `drizzle-orm/neon-http` を使用しており、
  テスト用に `drizzle-orm/pglite` を使う `DrizzleClient` を生成するファクトリ関数またはオーバーロードが必要になる。
  プロダクションコードへの最小変更として「`createDb(url)` に加え `createTestDb(db: PGlite)` を追加する」
  案を**提案**するが、プロダクションコード変更を伴うため**要確認**とする。
- PGlite はブラウザ / Node 両対応だが、Neon の `@neondatabase/serverless` の特定 API（WebSocket 等）は再現しない。
  ただし Repository テストはトランスポート層（neon-http）ではなく Drizzle の SQL 抽象層を検証するため、実害は少ない。
- PGlite はインメモリ動作のため、テスト実行中にプロセスがクラッシュするとデータは消える（テスト用途には問題なし）。

**B（testcontainers）は後続の選択肢として有効:**
本番 Postgres と完全に同一の挙動を検証したい場面（マイグレーションの互換性確認など）では、
将来的に testcontainers を追加するオプションを残す。今回は CI コスト・導入コストの観点から対象外とする。

---

## 5. packages/infrastructure 設計

### 5.1 共有設定の踏襲

`packages/config/vitest/base.cjs` の `baseConfig` を踏襲する。

```
test.environment = 'node'
test.globals = false
test.include = 'src/**/*.test.ts'
```

infrastructure は上記をそのまま extends する。PGlite の初期化はグローバル setup では行わず、
各テストファイル内の `beforeEach` でインスタンスを生成・破棄して独立性を保つ。

### 5.2 vitest.config.ts の設計

```
packages/infrastructure/vitest.config.ts
```

```typescript
import { baseConfig } from '@cookpit/config/vitest/base';
import { mergeConfig, defineConfig } from 'vitest/config';

export default mergeConfig(
  defineConfig({ test: baseConfig.test }),
  defineConfig({
    test: {
      // PGlite は Node.js ネイティブで動作するため node 環境のまま
      environment: 'node',
    },
  }),
);
```

注意: `baseConfig` が既に object を返すため、domain / application と同様に
`import { baseConfig } from '@cookpit/config/vitest/base'; export default baseConfig;` で
十分な可能性もある。ただし将来的な拡張余地（setup ファイル指定等）を考慮して
`mergeConfig` 形式を採用する。実装時に domain / application と完全に同じ 3 行形式で
問題ないことを確認した場合は単純化してよい。

### 5.3 package.json の変更内容

```json
"scripts": {
  "type-check": "tsc --noEmit",
  "test": "vitest run"
},
"devDependencies": {
  "@cookpit/config": "workspace:*",
  "@electric-sql/pglite": "^0.2.x",
  "@types/node": "^20",
  "drizzle-orm": "^0.45.2",
  "typescript": "^5.8.3",
  "vitest": "^3.2.0"
}
```

PGlite の Drizzle ドライバは `drizzle-orm/pglite` として同梱されているため、
`drizzle-orm` 本体（既に dependencies に存在）に加えて `@electric-sql/pglite` のみ追加すれば足りる。

### 5.4 テスト補助ユーティリティの設計

```
packages/infrastructure/src/testing/
  create-test-db.ts   # PGlite インスタンスを生成し Drizzle クライアントを返す
```

`create-test-db.ts` の役割:

1. `@electric-sql/pglite` の `PGlite` を `new PGlite()` で生成（インメモリ）
2. `drizzle(pglite, { schema })` で Drizzle クライアントを生成
3. `drizzle-kit` ではなく `drizzle-orm` の `migrate()` または SQL を直接実行して
   `src/db/schema.ts` のテーブル定義を適用する

テーブル適用方式の選択肢（実装時に選択する）:

- 案 a: `drizzle-orm/migrator` の `migrate()` を使い `src/db/migrations/` を適用する
  （実マイグレーションファイルの動作保証ができるが、migrations フォルダが必要）
- 案 b: Drizzle の `pushSchema` / `sql`` ` で schema.ts から直接 DDL を生成して適用する
  （migrations フォルダ不要だが、マイグレーション互換性は別途検証が必要）

現時点では `src/db/migrations/` フォルダの有無が未確認のため、**実装担当者が確認して選択する**。

### 5.5 代表テストの対象と範囲

今回は以下の 2 Repository に絞る（代表ケース）。後続で残り Repository を追加する。

**DrizzleProductRepository（最優先）**

Product は外部キーを持つ関連テーブル（priceRecords）との LEFT JOIN を含み、
変換の複雑度が最も高いため代表テストに最適。

| テスト ID | 検証内容                                                                                                        |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| IR-P-01   | save() で product 行が挿入される                                                                                |
| IR-P-02   | findById() で DB 行がドメイン Entity に復元される（id・name・aliases・category・defaultUnit の検証）            |
| IR-P-03   | save() + findAll() のラウンドトリップで priceHistory の変換が正しい（priceAmount の numeric→number 変換を含む） |
| IR-P-04   | findById() で存在しない ID は null を返す                                                                       |
| IR-P-05   | delete() で product および関連 priceRecords が CASCADE で削除される                                             |
| IR-P-06   | save() の upsert（onConflictDoUpdate）が既存行を上書きする                                                      |
| IR-P-07   | priceRecords の INSERT + findById() で LEFT JOIN 結果が正しくグルーピングされる                                 |

**DrizzleStoreRepository（補完）**

JOIN なしのシンプルな Repository。PGlite 設定の動作確認としても機能する。

| テスト ID | 検証内容                                  |
| --------- | ----------------------------------------- |
| IR-S-01   | save() + findById() のラウンドトリップ    |
| IR-S-02   | findAll() で createdAt 順に返る           |
| IR-S-03   | findById() で存在しない ID は null を返す |

**DrizzleRecipeRepository は後続フェーズに委ねる理由:**
jsonb 型（ingredients・steps）の変換検証は必要だが、今回は「基盤確立」を優先する。
上記 2 Repository でパターンが確立した後に追加することで、設計の一貫性を維持する。

---

## 6. apps/web のテスト方針

### 6.1 テスト対象の分類と方針

apps/web では 2 種類のテストを対象とする。

| 対象                 | テスト手法                                 | 今回の範囲               |
| -------------------- | ------------------------------------------ | ------------------------ |
| Hono RPC ルート      | Hono テストクライアント（`app.request()`） | 代表 1〜2 エンドポイント |
| React コンポーネント | React Testing Library（RTL）+ happy-dom    | 代表 1 コンポーネント    |

**重要な方針**: Hono ルートテストでは UseCase / Repository は全てモック化する。
Repository の変換責務は packages/infrastructure のテストで検証済みとし、
Hono ルートテストではリクエスト→UseCase 呼び出し→レスポンスの HTTP レイヤーを検証する。

### 6.2 テスト環境の選定

**Hono ルートのテスト**: `environment: 'node'`

- Hono の `app.request()` は Node.js 環境で動作する
- UseCase・Repository は `vi.mock()` でモック化する
- `@hono/zod-validator` のバリデーション動作（400 レスポンス）も検証可能

**コンポーネントテスト**: `environment: 'happy-dom'`

- `jsdom` より軽量で Next.js App Router との親和性が高い
- Server Component のテストは行わない（後述）
- `'use client'` の Client Component を対象とする

Next.js App Router の Server Component は Vitest 単体では RSC のランタイムを再現できず、
テストコストが高い。今回は Client Component（`'use client'` ディレクティブを持つファイル）
のみを対象とする。Server Component の動作保証は E2E（Playwright）に委ねる。

### 6.3 vitest.config.ts の設計

apps/web には Hono ルートとコンポーネントで環境が異なるため、設定を分ける 2 案を比較する。

**案 1（推奨）: ワークスペース設定（vitest.config.ts の workspace 機能）**

```
apps/web/vitest.config.ts        # workspace を定義するルート設定
apps/web/vitest.node.config.ts   # Hono ルート用（environment: 'node'）
apps/web/vitest.dom.config.ts    # コンポーネント用（environment: 'happy-dom'）
```

`vitest.config.ts`:

```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace(['./vitest.node.config.ts', './vitest.dom.config.ts']);
```

`vitest.node.config.ts`:

```typescript
import { baseConfig } from '@cookpit/config/vitest/base';
import { mergeConfig, defineConfig } from 'vitest/config';

export default mergeConfig(
  defineConfig({ test: baseConfig.test }),
  defineConfig({
    test: {
      name: 'node',
      environment: 'node',
      include: ['src/**/*.node.test.ts', 'src/server/**/*.test.ts'],
    },
  }),
);
```

`vitest.dom.config.ts`:

```typescript
import { baseConfig } from '@cookpit/config/vitest/base';
import { mergeConfig, defineConfig } from 'vitest/config';

export default mergeConfig(
  defineConfig({ test: baseConfig.test }),
  defineConfig({
    test: {
      name: 'dom',
      environment: 'happy-dom',
      include: ['src/**/*.dom.test.ts', 'src/**/*.test.tsx'],
    },
  }),
);
```

**案 2: 単一 vitest.config.ts に environmentMatchGlobs を使う**

```typescript
test: {
  environmentMatchGlobs: [
    ['src/server/**', 'node'],
    ['src/**/*.tsx', 'happy-dom'],
  ],
}
```

シンプルだが、テストファイル名でなくパスで環境を決定するため、意図しない環境で動く可能性がある。

**推奨は案 1**。明示的に環境を分離でき、将来のテスト追加時も設定の意図が明確。

### 6.4 package.json の変更内容

```json
"scripts": {
  "dev": "next dev",
  "build": "next build --webpack",
  "start": "next start",
  "lint": "eslint",
  "type-check": "tsc --noEmit",
  "test": "vitest run",
  "test:ui": "vitest --ui",
  "e2e": "playwright test",
  "e2e:ui": "playwright test --ui",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio"
},
"devDependencies": {
  ...既存...,
  "@cookpit/config": "workspace:*",
  "@testing-library/react": "^16.x",
  "@testing-library/user-event": "^14.x",
  "happy-dom": "^17.x",
  "vitest": "^3.2.0"
}
```

`@testing-library/jest-dom` は globals: false の規約と合わせ、
`@testing-library/react` の `expect` 拡張を `setupFiles` で行う代わりに
`import '@testing-library/jest-dom/vitest'` を各テストの先頭で import する方式を採用する。
あるいは `setupFiles` に配置して全テストに適用する（実装時に判断する）。

### 6.5 代表テストの対象と範囲

**Hono ルート: productsRoute（代表 2 エンドポイント）**

選定理由: products ルートは GET / POST / PUT / DELETE / POST (price-records) / GET (cheapest-store) と
最も多いエンドポイントを持ち、かつ UseCase への引数マッピング・Zod バリデーション・404 エラー処理を
全て含む代表例。

| テスト ID | エンドポイント           | 検証内容                                        |
| --------- | ------------------------ | ----------------------------------------------- |
| WH-P-01   | GET /api/products        | 200 + UseCase 返却値の JSON レスポンス          |
| WH-P-02   | POST /api/products       | 201 + バリデーション通過時の UseCase 呼び出し   |
| WH-P-03   | POST /api/products       | 400 + Zod バリデーションエラー時のレスポンス    |
| WH-P-04   | GET /api/products/:id    | 404 + ProductNotFoundError 時のエラーレスポンス |
| WH-P-05   | DELETE /api/products/:id | 204 レスポンス                                  |

UseCase は `vi.mock('@cookpit/application', ...)` でモック化する。
DB 接続は不要。`getDb()` も `vi.mock('@/db/client', ...)` でモック化する。

**コンポーネント: ProductListClient（代表）**

選定理由: Props として `ProductDto[]` を受け取る純粋な Client Component であり、
useState / useMemo・検索フィルタロジックを持つ。RTL で検証しやすい最適な候補。

| テスト ID | 検証内容                                                      |
| --------- | ------------------------------------------------------------- |
| WC-P-01   | 商品が 0 件のとき「まだ商品がありません」テキストが表示される |
| WC-P-02   | 商品が 1 件のとき ProductCard が 1 件レンダリングされる       |
| WC-P-03   | 検索ボックスに入力すると商品名でフィルタリングされる          |
| WC-P-04   | カテゴリボタンでフィルタリングされる                          |

Server Component（products/page.tsx 等）は対象外。

---

## 7. 共有設定の踏襲方針

`packages/config/vitest/base.cjs` は変更しない。各パッケージから踏襲する。

```
base.cjs の定義
  test.environment = 'node'
  test.globals = false               ← describe/it/expect は vitest から明示 import する
  test.include = 'src/**/*.test.ts'
```

| パッケージ              | 踏襲方針                                                                   |
| ----------------------- | -------------------------------------------------------------------------- |
| packages/domain         | 変更なし（`export default baseConfig` のまま）                             |
| packages/application    | 変更なし（`export default baseConfig` のまま）                             |
| packages/infrastructure | `baseConfig` を base に、必要に応じて mergeConfig で拡張                   |
| apps/web                | workspace 設定を追加。node / dom 各設定で `baseConfig.test` を base にする |

base.cjs への変更は今回不要。将来的にグローバル setup（PGlite 用など）が必要になれば
`packages/config/vitest/` に `infrastructure.cjs` を追加する案を検討するが、今回は対象外。

---

## 8. CI への影響

### 現行 ci.yml の test ジョブ

```yaml
test:
  name: Test
  needs: build
  runs-on: ubuntu-latest
  steps:
    - run: pnpm test
```

`pnpm test` は Turborepo 経由で各パッケージの test スクリプトを実行する。
今回の変更後は以下のパッケージが test スクリプトを持つ。

| パッケージ              | test スクリプト      | Docker 要否 |
| ----------------------- | -------------------- | ----------- |
| packages/domain         | vitest run           | 不要        |
| packages/application    | vitest run           | 不要        |
| packages/infrastructure | vitest run（PGlite） | 不要        |
| apps/web                | vitest run           | 不要        |

**PGlite を採用した場合、ci.yml への変更は不要**（Docker サービスや環境変数の追加が不要）。

testcontainers（案 B）を採用した場合は ci.yml に `services: postgres` または
Docker-in-Docker の設定が必要になるため、その場合は ci.yml の変更が必要になる（今回は対象外）。

---

## 9. 新規作成ファイル一覧

| ファイルパス                                                                  | 種別           | 内容                                                            |
| ----------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------- |
| `packages/infrastructure/vitest.config.ts`                                    | 設定           | baseConfig を踏襲した Vitest 設定                               |
| `packages/infrastructure/src/testing/create-test-db.ts`                       | ユーティリティ | PGlite インスタンス生成・スキーマ適用・Drizzle クライアント返却 |
| `packages/infrastructure/src/repositories/drizzle-product.repository.test.ts` | テスト         | DrizzleProductRepository の代表テスト（IR-P-01 〜 IR-P-07）     |
| `packages/infrastructure/src/repositories/drizzle-store.repository.test.ts`   | テスト         | DrizzleStoreRepository の代表テスト（IR-S-01 〜 IR-S-03）       |
| `apps/web/vitest.config.ts`                                                   | 設定           | workspace ルート設定                                            |
| `apps/web/vitest.node.config.ts`                                              | 設定           | Hono ルート用（environment: 'node'）                            |
| `apps/web/vitest.dom.config.ts`                                               | 設定           | コンポーネント用（environment: 'happy-dom'）                    |
| `apps/web/src/server/routes/products.test.ts`                                 | テスト         | productsRoute の代表テスト（WH-P-01 〜 WH-P-05）                |
| `apps/web/src/app/products/_components/product-list-client.test.tsx`          | テスト         | ProductListClient の代表テスト（WC-P-01 〜 WC-P-04）            |

合計: **新規 9 ファイル**

---

## 10. 変更ファイル一覧

| ファイルパス                           | 変更内容                                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `packages/infrastructure/package.json` | test スクリプト追加・vitest / @electric-sql/pglite を devDependencies に追加                                             |
| `apps/web/package.json`                | test スクリプト追加・vitest / @testing-library/react / @testing-library/user-event / happy-dom を devDependencies に追加 |

合計: **変更 2 ファイル**

---

## 11. テスト容易性のための最小リファクタ（要確認）

### 11.1 packages/infrastructure の DrizzleClient 生成（要確認）

現在の `createDb(databaseUrl: string)` は `drizzle-orm/neon-http` を前提としており、
テストで `drizzle-orm/pglite` を使うには別のファクトリが必要になる。

**提案 A（最小変更）**: `src/testing/create-test-db.ts` 内でのみ PGlite 用クライアントを生成し、
プロダクションコードの `client.ts` は変更しない。テストファイルが `DrizzleClient` 型ではなく
`ReturnType<typeof drizzle>` 相当の型を直接扱う形にする。

**提案 B（やや広い変更）**: `src/db/client.ts` に `DrizzleClient` を型として export し、
`DrizzleProductRepository` のコンストラクタが受け取る型を `DrizzleClient` から
`DrizzleClient | PGliteClient`（共通 interface）に拡張する。

Drizzle ORM は `pglite` ドライバでも同一の `DrizzleInstance` 型が推論されるため、
実際には提案 A で型互換が取れる可能性が高い。**実装担当者が型レベルで確認して判断する（要確認）**。

プロダクションコードの機能変更を伴う場合は Orchestrator 経由でユーザー確認を取ること。

### 11.2 apps/web の getDb() 依存（モック化で対応可能・リファクタ不要）

`apps/web/src/server/routes/products.ts` の `getDb()` は関数内部で呼ばれており、
`vi.mock('@/db/client', () => ({ getDb: vi.fn() }))` でモック化できる。
プロダクションコードの変更は不要。

---

## 12. データフロー（テスト観点）

### packages/infrastructure のテストデータフロー

```
テスト beforeEach
  └─ PGlite インスタンス生成（インメモリ）
     └─ スキーマ適用（DDL 実行）
        └─ DrizzleClient 生成（pglite ドライバ）
           └─ Repository インスタンス生成

テスト
  └─ Repository のメソッド呼び出し
     └─ Drizzle クエリ実行（PGlite 上）
        └─ 結果を検証

テスト afterEach（または GC による自動破棄）
  └─ PGlite インスタンス破棄
```

### apps/web Hono ルートのテストデータフロー

```
テスト
  └─ vi.mock で UseCase / getDb をモック化
     └─ app.request('POST /api/products', ...) 呼び出し
        └─ Hono ルートが UseCase.execute() を呼ぶ（モック）
           └─ HTTP レスポンスを検証（status code / JSON body）
```

---

## 13. エラー処理（テスト観点）

- UseCase が例外を投げるケースは Hono ルートテストで検証する（WH-P-04 が代表例）
- Repository レベルの例外（DB 制約違反等）は infrastructure テストで検証する（IR-P-05 の CASCADE 確認）
- Zod バリデーションエラーは Hono ルートテストで検証する（WH-P-03）

---

## 14. セキュリティ

対象外（テスト基盤の追加であり、セキュリティ要件に変更なし）。
テストコードに接続文字列・シークレットを含めない。PGlite はインメモリのため接続情報不要。

---

## 15. 性能

- PGlite はインメモリ動作のため、Repository テスト 1 本あたり数十ミリ秒以内を想定。
- コンポーネントテスト（happy-dom）も数十ミリ秒以内。
- CI での総テスト時間増加は数分以内を想定（Docker 起動なし）。

---

## 16. 後方互換性

- 既存テスト（domain: 17 本・application: 6 本）は変更しない。
- `packages/config/vitest/base.cjs` は変更しない。
- プロダクションコードの機能改変なし（`src/testing/` は devDependencies 扱い）。

---

## 17. ログ・監視

対象外（テスト基盤の追加のため）。

---

## 18. テスト方針まとめ

| 層                       | テスト手法                             | 検証対象                                              | モック化範囲                            |
| ------------------------ | -------------------------------------- | ----------------------------------------------------- | --------------------------------------- |
| Domain                   | Vitest（既存）                         | Entity / VO のビジネスロジック                        | なし（純粋関数）                        |
| Application              | Vitest + InMemory Repository（既存）   | UseCase のフロー                                      | Repository をインメモリ実装で代替       |
| Infrastructure           | Vitest + PGlite（今回追加）            | DB スキーマ⇔ドメインモデル変換                        | なし（実 PG プロトコルで検証）          |
| Presentation (Hono)      | Vitest + app.request()（今回追加）     | HTTP レイヤー（ルーティング・バリデーション・エラー） | UseCase / Repository を vi.mock         |
| Presentation (Component) | Vitest + RTL + happy-dom（今回追加）   | UI レンダリング・フィルタロジック                     | Next.js Router 等の外部依存を最小モック |
| E2E                      | Playwright（既存スクリプト・将来整備） | 画面遷移・統合動作                                    | なし                                    |

---

## 19. 未解決事項・要確認

1. **テスト DB 戦略の最終確認（最重要）**: PGlite（推奨 A）と testcontainers（案 B）のどちらを採用するか。
   本設計書は PGlite を推奨しているが、Docker 要否・CI コスト・忠実度のトレードオフについてユーザー確認が必要。

2. **DrizzleClient 型互換の確認（要確認）**: `packages/infrastructure/src/db/client.ts` の
   `DrizzleClient` 型が `drizzle-orm/pglite` ドライバ由来のクライアントと型互換かどうかを
   実装時に確認する。互換がない場合は最小限のリファクタが必要になる（要ユーザー確認）。

3. **migrations フォルダの有無（要確認）**: `packages/infrastructure/src/db/migrations/` が
   存在するかを確認し、PGlite でのスキーマ適用方式（migrator vs SQL 直接実行）を決定する。

4. **happy-dom のバージョン選択（実装時に確認）**: Vitest 3.x が対応する happy-dom のバージョンを
   pnpm 互換マトリクスで確認する。

5. **`@testing-library/jest-dom` の導入要否**: RTL のカスタムマッチャーを使うか否かは
   コンポーネントテストの実装時に判断する。使う場合は devDependencies に追加が必要。
