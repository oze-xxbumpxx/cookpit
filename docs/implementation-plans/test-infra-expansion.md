# 実装計画: test-infra-expansion

- feature: test-infra-expansion
- 変更レベル: L2
- 作成日: 2026-07-01
- 設計書: docs/designs/test-infra-expansion.md
- 要件: docs/requirements/test-infra-expansion.md

---

## 前提・確定事項

| 項目 | 決定内容 |
| --- | --- |
| テスト DB 戦略 | PGlite（`@electric-sql/pglite`）。ユーザー承認済み |
| スキーマ適用方式 | 案 b: `schema.ts` から DDL 生成して PGlite に直接適用（migrations フォルダ不在のため） |
| プロダクションコード変更 | 原則 0。DrizzleClient 型互換はテスト専用ファクトリ（提案 A）で吸収する |
| テスト専用コード置き場 | `packages/infrastructure/src/testing/` |
| apps/web の環境分離 | workspace 設定（vitest.config.ts + vitest.node.config.ts + vitest.dom.config.ts） |
| Hono ルートテストのモック境界 | UseCase を `vi.mock('@cookpit/application', ...)` でモック化し、getDb も vi.mock でモック |

---

## 新規作成ファイル一覧（9 ファイル）

| # | ファイルパス | 種別 |
| --- | --- | --- |
| N-1 | `packages/infrastructure/vitest.config.ts` | vitest 設定 |
| N-2 | `packages/infrastructure/src/testing/create-test-db.ts` | PGlite ユーティリティ |
| N-3 | `packages/infrastructure/src/repositories/drizzle-product.repository.test.ts` | Repository テスト |
| N-4 | `packages/infrastructure/src/repositories/drizzle-store.repository.test.ts` | Repository テスト |
| N-5 | `apps/web/vitest.config.ts` | workspace ルート設定 |
| N-6 | `apps/web/vitest.node.config.ts` | Hono ルート用（node 環境） |
| N-7 | `apps/web/vitest.dom.config.ts` | コンポーネント用（happy-dom 環境） |
| N-8 | `apps/web/src/server/routes/products.test.ts` | Hono ルートテスト |
| N-9 | `apps/web/src/app/products/_components/product-list-client.test.tsx` | コンポーネントテスト |

設計書 §9 に記載された 9 ファイルと一致。

---

## 変更ファイル一覧（2 ファイル）

| # | ファイルパス | 変更内容 |
| --- | --- | --- |
| M-1 | `packages/infrastructure/package.json` | `"test": "vitest run"` スクリプト追加、`@electric-sql/pglite` / `vitest` を devDependencies 追加 |
| M-2 | `apps/web/package.json` | `"test": "vitest run"` / `"test:ui": "vitest --ui"` スクリプト追加、`vitest` / `@testing-library/react` / `@testing-library/user-event` / `happy-dom` を devDependencies 追加 |

設計書 §10 に記載された 2 ファイルと一致。

---

## 追加依存パッケージ

| パッケージ | バージョン | 配置先 | 用途 |
| --- | --- | --- | --- |
| `@electric-sql/pglite` | `^0.2.x` | `packages/infrastructure` devDependencies | PGlite インメモリ PG |
| `vitest` | `^3.2.0` | `packages/infrastructure` devDependencies | テストランナー |
| `vitest` | `^3.2.0` | `apps/web` devDependencies | テストランナー |
| `@testing-library/react` | `^16.x` | `apps/web` devDependencies | RTL コンポーネントテスト |
| `@testing-library/user-event` | `^14.x` | `apps/web` devDependencies | ユーザー操作シミュレーション |
| `happy-dom` | `^17.x` | `apps/web` devDependencies | DOM 環境（コンポーネントテスト） |

備考:
- `drizzle-orm/pglite` ドライバは `drizzle-orm` 本体に同梱済みのため追加インストール不要。
- `@testing-library/jest-dom` は任意。`@testing-library/react` 付属の expect 拡張または各テストでの import で代替できる。必要と判断した場合のみ追加する。
- `vite-tsconfig-paths` プラグインは apps/web の vitest.config に `resolve.alias` を手動設定することで代替し、追加インストールを回避する（理由: 依存を増やさない方針）。

---

## 実装ステップ

依存関係を考慮した実装順序。ステップ 1〜4 は packages/infrastructure、ステップ 5〜7 は apps/web、ステップ 8 が最終品質ゲート。

### ステップ 1: packages/infrastructure への vitest + PGlite 依存追加

**対象ファイル**

- `packages/infrastructure/package.json` （M-1）

**変更内容**

1. `scripts` に `"test": "vitest run"` を追加する。
2. `devDependencies` に以下を追加する:
   - `"vitest": "^3.2.0"`
   - `"@electric-sql/pglite": "^0.2.x"`
3. `pnpm install` を実行してロックファイルを更新する。

完成形の scripts セクション:
```json
"scripts": {
  "type-check": "tsc --noEmit",
  "test": "vitest run"
}
```

完成形の devDependencies セクション（既存に追加）:
```json
"devDependencies": {
  "@cookpit/config": "workspace:*",
  "@electric-sql/pglite": "^0.2.x",
  "@types/node": "^20",
  "typescript": "^5.8.3",
  "vitest": "^3.2.0"
}
```

**完了条件**

- `packages/infrastructure/package.json` に test スクリプト・2 パッケージが追記されている。
- `pnpm install` が成功し `pnpm-lock.yaml` が更新されている。
- `packages/infrastructure` から `import { PGlite } from '@electric-sql/pglite'` が型エラーなしで解決できることを型チェックで確認する（ステップ 2 完了後に確認可）。

---

### ステップ 2: packages/infrastructure/vitest.config.ts の作成

**対象ファイル**

- `packages/infrastructure/vitest.config.ts` （N-1、新規作成）

**変更内容**

`packages/application/vitest.config.ts` と同じ 3 行パターンを基本とする。PGlite は Node.js 環境で動作するため `baseConfig` の `environment: 'node'` をそのまま継承すれば足りる。将来的に setupFiles 等の追加が必要になった場合に mergeConfig へ切り替える。

```typescript
import { baseConfig } from '@cookpit/config/vitest/base';

export default baseConfig;
```

設計書 §5.2 の注意書きのとおり、既存の domain / application と完全に同じ形式で問題ないことを確認してこの形式を採用する。

**完了条件**

- ファイルが存在する。
- `packages/infrastructure` ディレクトリで `pnpm test` を実行して「No test files found」等のエラーが vitest 由来で出力される（テストファイルが未作成のため）。vitest 自体が起動することを確認する。

---

### ステップ 3: create-test-db.ts（PGlite テスト補助ユーティリティ）の作成

**対象ファイル**

- `packages/infrastructure/src/testing/create-test-db.ts` （N-2、新規作成）

**変更内容**

設計書 §5.4「案 b」を実装する。migrations フォルダが存在しないことをリポジトリ検索で確認済みのため、migrator（案 a）は使用しない。

ユーティリティの責務:

1. `PGlite` をインメモリで生成する（`new PGlite()`）。
2. `drizzle-orm/pglite` ドライバで Drizzle クライアントを生成する。
3. `schema.ts` のテーブル定義から `drizzle-kit` の `pushSchema` 相当の DDL を PGlite に適用する。
   - 具体的には `drizzle-orm` の `sql` タグと Drizzle の内部 DDL 生成 API、または `@electric-sql/pglite` の `exec()` に CREATE TABLE 文を直接渡す方式を採用する。
   - DDL 文字列は `schema.ts` の定義から機械的に対応させる（4 テーブル: recipes / stores / products / price_records）。外部キー制約を含める。
4. 生成した Drizzle クライアントを返す。

関数シグネチャ:

```typescript
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '../db/schema';

export async function createTestDb() {
  const pglite = new PGlite();
  const db = drizzle(pglite, { schema });
  // DDL 適用（CREATE TABLE IF NOT EXISTS を含む SQL を exec で実行）
  await pglite.exec(`
    CREATE TABLE IF NOT EXISTS recipes ( ... );
    CREATE TABLE IF NOT EXISTS stores ( ... );
    CREATE TABLE IF NOT EXISTS products ( ... );
    CREATE TABLE IF NOT EXISTS price_records ( ... );
  `);
  return db;
}
```

戻り値の型:

`drizzle-orm/pglite` ドライバの `drizzle()` が返す型（`PgliteDatabase<typeof schema>` 相当）をそのまま `ReturnType<typeof createTestDb>` として扱う。Repository のコンストラクタが `DrizzleClient`（neon-http ドライバ由来）を期待する型との互換性は、**コンパイル時に型エラーが発生するかどうかで確認する**。

- 型エラーが発生しない場合: そのまま Repository に渡す（提案 A で解決）。
- 型エラーが発生する場合: `as unknown as DrizzleClient` の型キャストを create-test-db.ts 内で行い、プロダクションコードは変更しない。型キャストで解決できない場合（メソッドシグネチャが非互換など）はステップ 3 を中断し、Orchestrator 経由でユーザー確認を取ること（リスク R-1 参照）。

DDL の外部キー制約:

- `price_records.product_id → products.id ON DELETE CASCADE`
- `price_records.store_id → stores.id ON DELETE RESTRICT`

PGlite では外部キーは `PRAGMA foreign_keys = ON` 相当の設定が必要な場合がある。PGlite は PostgreSQL プロトコルを使用するため、PostgreSQL の外部キー制約はデフォルトで有効である。ただし cascade / restrict の動作は PGlite で確認が必要（テスト IR-P-05 / INFRA-E-03 で検証）。

**完了条件**

- `packages/infrastructure/src/testing/create-test-db.ts` が存在する。
- `pnpm type-check`（`packages/infrastructure`）がエラーなしで通過する。
- 単純な動作確認：次ステップのテストファイル作成後、`createTestDb()` が例外なく完了しテーブルが作成されていることを Repository テストの beforeEach で確認する。

---

### ステップ 4: packages/infrastructure の Repository テスト作成

**対象ファイル**

- `packages/infrastructure/src/repositories/drizzle-product.repository.test.ts` （N-3、新規作成）
- `packages/infrastructure/src/repositories/drizzle-store.repository.test.ts` （N-4、新規作成）

**変更内容**

#### 共通パターン（各テストファイル）

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../testing/create-test-db';
// ...

describe('DrizzleXxxRepository', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;

  beforeEach(async () => {
    db = await createTestDb();
  });

  // 各テストケース
});
```

`afterEach` での明示的破棄は不要（PGlite はインメモリのため GC に委ねる）。テスト間の独立性は `beforeEach` で毎回新規インスタンスを生成することで担保する。

#### drizzle-product.repository.test.ts に実装するテストケース

設計書 §5.5 の IR-P-01 〜 IR-P-07 をすべて実装する。

| テスト ID | 内容 | 備考 |
| --- | --- | --- |
| IR-P-01 | `save()` で product 行が挿入される | products テーブルを直接 SELECT して確認 |
| IR-P-02 | `findById()` で DB 行がドメイン Entity に復元される（id / name / aliases / category / defaultUnit を検証） | |
| IR-P-03 | `save()` + `findAll()` ラウンドトリップで priceHistory の変換が正しい（priceAmount の numeric→number 変換を含む） | storeId に対応する store 行の事前挿入が必要 |
| IR-P-04 | `findById()` で存在しない ID は null を返す | |
| IR-P-05 | `delete()` で product および関連 priceRecords が CASCADE で削除される | priceRecords テーブルを直接 SELECT して確認 |
| IR-P-06 | `save()` の upsert（onConflictDoUpdate）が既存行を上書きする | 同一 ID で 2 回 save し name の変化を確認 |
| IR-P-07 | priceRecords の INSERT + `findById()` で LEFT JOIN 結果が正しくグルーピングされる（複数 priceRecord が 1 Product にまとまること） | |

テストデータ生成は `Product.create()` / `Store.create()` 等のドメインファクトリを利用する（ID 採番ロジックを再利用するため）。UUIDv4 固定値でも可。

要件書 §試験観点 の異常系（INFRA-E-01 / INFRA-E-02 / INFRA-E-03）・境界値（INFRA-B-03 / INFRA-B-04 / INFRA-B-05）も追加する。特に:
- INFRA-E-03: storeId が stores テーブルに存在しない状態での priceRecord INSERT が FK 制約エラーになることを `expect(() => ...).rejects.toThrow()` で検証する。
- INFRA-B-04: priceHistory 0 件の Product で `findById()` が空配列を返すことを検証する。
- INFRA-B-05: numeric の小数値（例: 98.5）が `Number()` で正しく往復することを検証する。

#### drizzle-store.repository.test.ts に実装するテストケース

設計書 §5.5 の IR-S-01 〜 IR-S-03 をすべて実装する。

| テスト ID | 内容 |
| --- | --- |
| IR-S-01 | `save()` + `findById()` ラウンドトリップ（id / name / createdAt を検証） |
| IR-S-02 | `findAll()` で `createdAt` 順に返る（2 件挿入して順序を確認） |
| IR-S-03 | `findById()` で存在しない ID は null を返す |

要件書の INFRA-R-11 も含める。

#### mappers.ts のテスト

設計書では `drizzle-product.repository.test.ts` / `drizzle-store.repository.test.ts` のみ新規作成ファイルとして挙げられているが、要件書には `src/repositories/mappers.test.ts`（INFRA-M-01 / INFRA-M-02）が記載されている。

設計書 §9 の新規ファイル一覧（9 ファイル）に `mappers.test.ts` は含まれていない。

**対応方針**: `toUnit()` は DB 不要の純粋関数テストであり、`drizzle-product.repository.test.ts` 内の describe ブロックに組み込むか、別ファイル `mappers.test.ts` を作成するかを実装担当者が判断する。設計書の新規ファイル数（9 ファイル）との整合を保つため、まず `drizzle-product.repository.test.ts` 内に組み込む形を推奨する。別ファイルにする場合は Orchestrator に事前確認すること。

**完了条件**

- `packages/infrastructure/src/repositories/drizzle-product.repository.test.ts` が存在し、IR-P-01 〜 IR-P-07 + 異常系・境界値テストを含む。
- `packages/infrastructure/src/repositories/drizzle-store.repository.test.ts` が存在し、IR-S-01 〜 IR-S-03 を含む。
- `pnpm test`（`packages/infrastructure` ディレクトリ）を実行してすべてのテストが PASS する。
- `pnpm type-check`（`packages/infrastructure`）がエラーなしで通過する。

---

### ステップ 5: apps/web への vitest + Testing Library 依存追加

**対象ファイル**

- `apps/web/package.json` （M-2）

**変更内容**

1. `scripts` に以下を追加する:
   ```json
   "test": "vitest run",
   "test:ui": "vitest --ui"
   ```
2. `devDependencies` に以下を追加する:
   ```json
   "@cookpit/config": "workspace:*",
   "@testing-library/react": "^16.x",
   "@testing-library/user-event": "^14.x",
   "happy-dom": "^17.x",
   "vitest": "^3.2.0"
   ```
3. `pnpm install` を実行してロックファイルを更新する。

`@cookpit/config` は既に `packages/infrastructure` で追加済みだが、`apps/web` の `package.json` にも明示的に追加する（他パッケージからの推移的参照に依存しない）。

happy-dom のバージョンは Vitest 3.x と互換する最新安定版を `pnpm install` 時に確認する。Vitest 3.x は happy-dom 13.x 以上をサポートする。17.x で問題が生じた場合は 13.x に落とす。

**完了条件**

- `apps/web/package.json` に test スクリプト・5 パッケージが追記されている。
- `pnpm install` が成功し `pnpm-lock.yaml` が更新されている。

---

### ステップ 6: apps/web の vitest.config.ts（workspace）作成

**対象ファイル**

- `apps/web/vitest.config.ts` （N-5、新規作成）
- `apps/web/vitest.node.config.ts` （N-6、新規作成）
- `apps/web/vitest.dom.config.ts` （N-7、新規作成）

**変更内容**

設計書 §6.3「案 1（推奨）」の workspace 設定を実装する。

**apps/web/vitest.config.ts**（workspace ルート）:
```typescript
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  './vitest.node.config.ts',
  './vitest.dom.config.ts',
]);
```

**apps/web/vitest.node.config.ts**（Hono ルートテスト用）:
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
    resolve: {
      alias: {
        '@/': new URL('./src/', import.meta.url).pathname,
      },
    },
  }),
);
```

**apps/web/vitest.dom.config.ts**（コンポーネントテスト用）:
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
    resolve: {
      alias: {
        '@/': new URL('./src/', import.meta.url).pathname,
      },
    },
  }),
);
```

`@/` エイリアスは `apps/web/tsconfig.json` の `paths: { "@/*": ["./src/*"] }` に対応する。
Vitest は tsconfig の paths を自動解決しないため `resolve.alias` を明示的に設定する。
`vite-tsconfig-paths` プラグインは追加しない（依存追加を最小にする方針）。

include パターンについて:

- node テスト: `src/server/**/*.test.ts` で Hono ルートテストをすべて拾う。
- dom テスト: `src/**/*.test.tsx` で React コンポーネントテスト（.tsx）をすべて拾う。
- 両方の設定で `baseConfig.test.include`（`src/**/*.test.ts`）がベースになっているが、`mergeConfig` では後者の include で上書きされる。`include` が配列の場合のマージ挙動を実装時に確認する。上書きにならない場合は node 設定に `exclude: ['**/*.tsx']` を追加して重複実行を回避する。

**完了条件**

- 3 ファイルが存在する。
- `apps/web` ディレクトリで `pnpm test` を実行して「No test files found」等の vitest 起動確認ができる（テストファイル未作成のため）。
- `pnpm type-check`（`apps/web`）がエラーなしで通過する。

---

### ステップ 7a: apps/web の Hono ルートテスト作成

**対象ファイル**

- `apps/web/src/server/routes/products.test.ts` （N-8、新規作成）

**変更内容**

設計書 §6.5 の WH-P-01 〜 WH-P-05 を実装する。

モック構成:

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest';

// getDb モック（DB 接続を排除）
vi.mock('@/db/client', () => ({
  getDb: vi.fn(),
  db: null,
}));

// UseCase モック
vi.mock('@cookpit/application', () => ({
  GetProductsUseCase: vi.fn(),
  CreateProductUseCase: vi.fn(),
  GetProductUseCase: vi.fn(),
  DeleteProductUseCase: vi.fn(),
  RecordPriceUseCase: vi.fn(),
  UpdateProductUseCase: vi.fn(),
  GetCheapestStoreUseCase: vi.fn(),
  ProductNotFoundError: class ProductNotFoundError extends Error {},
  // その他 app.ts の onError で参照する Error クラスも含める
  RecipeNotFoundError: class RecipeNotFoundError extends Error {},
  StoreNotFoundError: class StoreNotFoundError extends Error {},
}));

vi.mock('@cookpit/infrastructure', () => ({
  DrizzleProductRepository: vi.fn(),
  DrizzleStoreRepository: vi.fn(),
}));
```

テスト実行は `app.request()` を使用する:

```typescript
import app from '@/server/app';

it('GET /api/products returns 200', async () => {
  // GetProductsUseCase.prototype.execute をモック
  const mockExecute = vi.fn().mockResolvedValue([]);
  (GetProductsUseCase as vi.Mock).mockImplementation(() => ({
    execute: mockExecute,
  }));

  const res = await app.request('/api/products');
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual([]);
});
```

テストケース一覧:

| テスト ID | エンドポイント | 検証内容 |
| --- | --- | --- |
| WH-P-01 | GET /api/products | 200 + UseCase 返却値の JSON レスポンス |
| WH-P-02 | POST /api/products | 201 + バリデーション通過時の UseCase 呼び出し確認 |
| WH-P-03 | POST /api/products（不正ボディ） | 400 + Zod バリデーションエラー |
| WH-P-04 | GET /api/products/:id（ProductNotFoundError） | 404 + `{ error: "..." }` |
| WH-P-05 | DELETE /api/products/:id | 204 レスポンス |

WH-P-04 では `GetProductUseCase.prototype.execute` が `ProductNotFoundError` をスローするよう設定し、`app.onError` の 404 ハンドリングを検証する。

**完了条件**

- ファイルが存在し WH-P-01 〜 WH-P-05 のすべてが PASS する。
- `pnpm type-check`（`apps/web`）がエラーなしで通過する。
- node 環境（vitest.node.config.ts）で実行されることを名前付きテスト結果で確認する。

---

### ステップ 7b: apps/web のコンポーネントテスト作成

**対象ファイル**

- `apps/web/src/app/products/_components/product-list-client.test.tsx` （N-9、新規作成）

**変更内容**

設計書 §6.5 の WC-P-01 〜 WC-P-04 を実装する。

`ProductListClient` は以下の外部依存を持つ:

- `next/link`（Link コンポーネント）: `vi.mock('next/link', ...)` でモック化する（`<a>` 要素を返す簡易モック）。
- `@/components/ui/button`（Button / buttonVariants）: 実コンポーネントを使用するか、必要に応じてモック化する（RTL での描画に問題なければ実コンポーネントを使用推奨）。
- `@/components/ui/input`（Input）: 同上。
- `lucide-react`（Plus アイコン）: 通常はモック不要（描画されるが aria テストに影響しない）。
- `./product-card`（ProductCard）: `vi.mock` でモック化し、`product.name` を表示するだけの簡易版にする。
- `./product-form-fields`（PRODUCT_CATEGORY_OPTIONS）: 実モジュールを import するか、テストで categoryOptions を制御できるよう props を工夫する。

テストケース一覧:

| テスト ID | 検証内容 |
| --- | --- |
| WC-P-01 | `initialProducts=[]` で「まだ商品がありません」テキストが表示される |
| WC-P-02 | `initialProducts` に 1 件のとき ProductCard が 1 件レンダリングされる |
| WC-P-03 | 検索ボックスに入力すると商品名でフィルタリングされる（`userEvent.type` で入力、2 件→1 件に絞り込まれることを確認） |
| WC-P-04 | カテゴリボタンクリックでカテゴリフィルタリングされる（`userEvent.click`、2 件→1 件に絞り込まれることを確認） |

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ProductListClient } from './product-list-client';
```

テストデータの `ProductDto` モックは `@cookpit/application` の型に合わせて最小限のプロパティで構築する。

**完了条件**

- ファイルが存在し WC-P-01 〜 WC-P-04 のすべてが PASS する。
- `pnpm type-check`（`apps/web`）がエラーなしで通過する。
- dom 環境（vitest.dom.config.ts）で実行されることを名前付きテスト結果で確認する。

---

### ステップ 8: 品質ゲート（全体）

**対象**

リポジトリルートおよび各パッケージ。

**実行コマンドと期待結果**

```bash
# ルートから全パッケージをまとめて実行
pnpm lint          # 既存テスト含むすべての ESLint エラーが 0
pnpm type-check    # packages/infrastructure + apps/web の型エラーが 0
pnpm test          # Turborepo 経由で 4 パッケージのテストがすべて PASS
```

テスト本数の確認:

| パッケージ | 実装前 | 実装後（目標） |
| --- | --- | --- |
| packages/domain | 17 本 | 17 本（変更なし） |
| packages/application | 6 本 | 6 本（変更なし） |
| packages/infrastructure | 0 本 | IR-P-01〜07 + 異常系・境界値（11本前後） + IR-S-01〜03（3本） = 14 本以上 |
| apps/web | 0 本 | WH-P-01〜05（5本）+ WC-P-01〜04（4本）= 9 本 |

**プロダクションコード変更 0 の確認**

`packages/infrastructure/src/db/client.ts` が変更されていないことを `git diff --name-only` で確認する。

**完了条件**

- `pnpm lint` / `pnpm type-check` / `pnpm test` がすべて PASS する。
- `git diff --name-only` でプロダクションコード（`src/db/client.ts` 等）の変更が含まれていない。
- 新規作成 9 ファイル・変更 2 ファイルがすべて存在する。

---

## 依存関係と並列可否

```
ステップ 1 ─── ステップ 2 ─── ステップ 3 ─── ステップ 4 ──┐
                                                               ├── ステップ 8（品質ゲート）
ステップ 5 ─── ステップ 6 ─── ステップ 7a ──────────────────┤
                              └── ステップ 7b ────────────────┘
```

- ステップ 1〜4（infrastructure 系）とステップ 5〜7（apps/web 系）は並列作業が可能。
- ステップ 7a と 7b は独立しており並列実行可能。
- ステップ 8 はすべての先行ステップの完了後に実行する。

---

## テスト観点まとめ（各層の責務と境界）

### packages/infrastructure（Repository テスト）

テストの最大目的は「DB スキーマ形 ⇔ ドメインモデル形の変換責務の検証」（設計書 §3）。

| 観点 | 具体的なテスト ID | 補足 |
| --- | --- | --- |
| 正常系: save/findById ラウンドトリップ | IR-P-02, IR-S-01 | 全フィールドの対応確認 |
| 正常系: LEFT JOIN グルーピング | IR-P-03, IR-P-07 | priceRecords の集約が 1 Product にまとまること |
| 正常系: upsert | IR-P-06 | onConflictDoUpdate の上書き動作 |
| 異常系: 存在しない ID | IR-P-04, IR-S-03 | null 返却 |
| 異常系: FK 制約違反 | INFRA-E-03 | stores に存在しない storeId への INSERT |
| 境界値: 空配列 | INFRA-B-03, INFRA-B-04 | aliases=[] / priceHistory=[] |
| 境界値: numeric 小数精度 | INFRA-B-05 | `Number(row.priceAmount)` の精度 |
| 境界値: CASCADE 削除 | IR-P-05 | product 削除後に priceRecords が消えること |

Playwright との棲み分け: Repository テストはマッピングロジックの検証に特化し、ビジネスシナリオ（CRUD ハッピーパス）は Playwright に委ねる。

### apps/web / Hono ルート（HTTP レイヤーテスト）

テストの目的は「リクエスト→UseCase 呼び出し→レスポンス」の HTTP レイヤー検証。UseCase / Repository は vi.mock でモック化し DB 接続不要。

| 観点 | 具体的なテスト ID |
| --- | --- |
| 正常系: 200/201/204 レスポンス | WH-P-01, WH-P-02, WH-P-05 |
| 異常系: Zod バリデーションエラー（400） | WH-P-03 |
| 異常系: ドメインエラー（404） | WH-P-04 |

### apps/web / コンポーネントテスト（UI ロジック検証）

テストの目的は「フィルタリングロジック・レンダリング分岐の検証」。

| 観点 | 具体的なテスト ID |
| --- | --- |
| 正常系: 空リスト表示 | WC-P-01 |
| 正常系: 1件レンダリング | WC-P-02 |
| 正常系: テキスト検索フィルタ | WC-P-03 |
| 正常系: カテゴリフィルタ | WC-P-04 |

---

## リスクと対策

### R-1（最重要）: DrizzleClient 型が PGlite ドライバと非互換

**内容**

`packages/infrastructure/src/repositories/` の各 Repository コンストラクタは `DrizzleClient = ReturnType<typeof createDb>`（neon-http ドライバ）を受け取る。`drizzle-orm/pglite` が返す型（`PgliteDatabase<typeof schema>`）との型互換がない場合、テストファイルが型エラーになる。

**回避策（優先順）**

1. まず `as unknown as DrizzleClient` の型キャストを `create-test-db.ts` 内で試みる（プロダクションコード変更 0 を維持）。
2. 型キャストで解決できるが実行時にメソッドシグネチャ不一致が起きる場合は、`createTestDb()` の戻り値型を Drizzle の共通インタフェース（`BaseSQLiteDatabase` や `DrizzleDB` 等）で表現できるか確認する。
3. それでも解決できない場合（プロダクションコードの変更が不可避と判断した場合）は**ステップ 3 を中断して Orchestrator 経由でユーザー確認を取る**。変更内容の提案は「`src/db/client.ts` の `DrizzleClient` 型を neon-http 固有ではなく Drizzle 共通型に緩める」（設計書 §11.1 提案 B に相当）。

**検出タイミング**: ステップ 3 の `pnpm type-check` 実行時。

---

### R-2: PGlite による DDL 実行（schema push）でエラーが発生する

**内容**

`schema.ts` から手書きした CREATE TABLE 文を PGlite に `exec()` で渡す際、PostgreSQL 構文の細部（`numeric`・`jsonb`・`timestamp` の表記）や外部キー制約の記述でエラーが発生する可能性がある。

**回避策**

- `exec()` に渡す DDL は PostgreSQL の標準構文で記述する（PGlite は PostgreSQL プロトコルを使用するため標準準拠が基本）。
- `CREATE TABLE IF NOT EXISTS` を使用してべき等にする。
- エラーが発生した場合は PGlite の `exec()` エラーメッセージを確認し、問題の構文を特定して修正する。
- PGlite が `jsonb` をサポートしない場合（古いバージョン）は `text` に置き換える（ただし型変換テストが不完全になるためバージョン確認を優先する）。

**検出タイミング**: ステップ 4 のテスト初回実行時（`createTestDb()` が例外を投げる）。

---

### R-3: apps/web の `@/` エイリアスが vitest で解決されない

**内容**

`apps/web/tsconfig.json` に `"@/*": ["./src/*"]` が定義されているが、Vitest はデフォルトで tsconfig の paths を解釈しない。`resolve.alias` 設定が間違っているとテストファイルが import エラーになる。

**回避策**

- `vitest.node.config.ts` / `vitest.dom.config.ts` の両方に `resolve.alias: { '@/': './src/' }` または `new URL('./src/', import.meta.url).pathname` 形式で設定する。
- `import.meta.url` が Node.js 環境で使えない場合は `path.resolve(__dirname, 'src')` を使用する（`__dirname` は `vitest.config.ts` の場合は `import.meta.dirname` で代替可能）。

**検出タイミング**: ステップ 7a / 7b の最初の import 解決時。

---

### R-4: happy-dom と Next.js コンポーネントの互換性

**内容**

`ProductListClient` は `next/link`（Link）に依存しており、happy-dom 環境では Next.js のルーターコンテキストが存在しないため、`Link` コンポーネントが期待どおりに動作しない可能性がある。

**回避策**

- `vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))` でモック化する。
- `@/components/ui/button` や `@/lib/utils` が Tailwind 等を参照している場合も同様にモック化または実 import を許容する（RTL は CSS を解釈しないため動作に問題ない）。

**検出タイミング**: ステップ 7b のテスト実行時（レンダリングエラー）。

---

## ロールバック方法

本機能追加はすべてテスト・設定ファイルの追加と `package.json` への devDependencies 追加のみで構成されている。プロダクションコードの変更は 0 を原則とするため、ロールバックのリスクは低い。

**ロールバック手順**

1. 作業ブランチを `main` にマージする前に問題が発覚した場合はブランチをそのままにして修正する。
2. マージ後にロールバックが必要になった場合は以下を実行する:
   - `git revert <merge-commit-sha>` でマージコミットを revert する。
   - `pnpm install` を再実行して devDependencies の変更を元に戻す。
3. プロダクションコードへの影響はないため、ロールバック後も本番動作に影響しない。
4. Turborepo の turbo.json の `"test"` タスク定義は既存のままのため変更不要。

---

## ドキュメント更新箇所

本機能追加に伴うドキュメント更新は最小限にとどめる。

| ドキュメント | 更新内容 | 必要性 |
| --- | --- | --- |
| `docs/05-roadmap.md` | test-infra-expansion 完了として記録 | 任意（次スプリント開始時に更新） |
| `CLAUDE.md` | 変更なし（テスト基盤追加はアーキテクチャ原則に影響しない） | 不要 |
| `docs/07-dev-rules.md` | infrastructure・web のテスト実行コマンドを追記 | 任意 |

---

## 完了条件（全体）

以下をすべて満たした時点でこの feature を完了とする。

1. 新規作成 9 ファイルがすべて存在する。
2. 変更 2 ファイル（`package.json` × 2）に test スクリプト・依存追加が反映されている。
3. `pnpm lint` がルートから実行してエラー 0。
4. `pnpm type-check` がルートから実行してエラー 0。
5. `pnpm test` がルートから実行して全テスト（domain 17 + application 6 + infrastructure 14+ + web 9+）が PASS する。
6. `git diff --name-only main` にプロダクションコードファイルが含まれていない（変更ファイルが `package.json` × 2 + 9 新規ファイルのみ）。
7. 既存テスト（domain 17 本・application 6 本）が引き続き PASS している（退行なし）。
