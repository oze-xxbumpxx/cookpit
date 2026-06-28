# セキュリティレビュー: store-master

- レビュー日: 2026-06-28
- ブランチ: `claude/backlog-tasks-28cpv8`
- レビュアー: security-reviewer
- 設計書: `docs/designs/store-master.md`（§13 セキュリティ参照）

---

## 確認観点と結果サマリ

| # | 観点 | 結果 |
|---|---|---|
| 1 | 入力検証・インジェクション（OWASP A03） | 指摘あり（Should 1件） |
| 2 | 認証・認可（OWASP A01/A07） | 設計上の意図的 no-auth（問題なし、留意点あり） |
| 3 | 秘密情報の漏洩（OWASP A02/A09） | 指摘あり（Should 1件） |
| 4 | 依存パッケージの脆弱性 | 指摘あり（Must 1件） |
| 5 | セキュリティヘッダー・Cookie | 対象外（`apps/web/src/server/` の API 層のみ変更、Cookie 非使用） |

---

## 指摘事項

### [Must] 観点4: hono に高深刻度脆弱性（GHSA-88fw-hqm2-52qc）

**該当箇所**: `apps/web/package.json`（`"hono": "^4.12.18"`）

**理由**:
`pnpm audit` の結果、hono `<4.12.25` に高深刻度（high）の脆弱性が報告されている。

> GHSA-88fw-hqm2-52qc: CORS Middleware reflects any Origin with credentials
> when `origin` defaults to the wildcard

現在のインストールバージョンは `^4.12.18` の範囲内にあり、パッチ済みバージョン
`>=4.12.25` が存在する。

本実装のコードベース内に CORS ミドルウェアの使用箇所（`hono/cors` の import）は
確認されなかった。ただし hono 本体パッケージにバンドルされた脆弱性であり、
今後 CORS ミドルウェアを追加する際に無警戒で有効化されるリスクがある。
また `^4.12.18` の範囲指定では `pnpm update` 時に自動的にパッチバージョンが
上がらない場合もある（ロックファイル固定）。

**修正案**:
`apps/web/package.json` の `hono` を `^4.12.25` 以上に引き上げ、`pnpm install`
（または `pnpm update hono`）を実行してロックファイルを更新する。
なお、合計17件の脆弱性（low 3件、moderate 13件）が存在するが、high はこの1件のみ。
moderate 以下は今回スコープの判断を implementer に委ねる。

---

### [Should] 観点1: `name` フィールドに上限長制約がない

**該当箇所**: `/home/user/cookpit/packages/api-contract/src/store.schema.ts` line 3-5

```typescript
const nonBlankString = z.string().refine((value) => value.trim() !== '', {
  message: 'required',
});
```

**理由**:
`createStoreSchema` の `name` は「空文字・空白のみ」を弾く制約（`nonBlankString`）
のみで、最大長の制約が存在しない。Recipe の `name` も同様のパターンであり、
今回の Store 実装が踏襲している。

この状態では任意の長さの文字列（例: 数 MB の JSON を `name` に詰める）が
DB への INSERT まで到達する。PostgreSQL の `text` 型はサイズ上限がないため
DB レベルでも拒否されない。攻撃者がペイロードを大量投入することで、
DB ストレージの消費や、レスポンスデータ量の増大による DoS 的負荷が生じうる。

MVP1・2名利用の想定では即時の悪用リスクは低いが、外部公開 API として
設計する以上、上限長は明示すべきである。Store 名の業務的な上限（例: 100〜255文字）
を定義し、Zod スキーマに `.max()` を追加することが望ましい。

**修正案**:
```typescript
// 業務要件に応じた上限値（例: 255文字）を設定する
const nonBlankString = z.string().min(1).max(255).refine(
  (value) => value.trim() !== '',
  { message: 'required' },
);
```
なお `recipe.schema.ts` の `nonBlankString` も同様のパターンであるが、
そちらはスコープ外のため本指摘の対象としない。

---

### [Should] 観点3: `onError` で `console.error(err)` がエラーオブジェクト全体を出力している

**該当箇所**: `/home/user/cookpit/apps/web/src/server/app.ts` line 21

```typescript
console.error(err);
```

**理由**:
`onError` の最終フォールバックで `err` オブジェクト全体を `console.error` に渡している。
DB 接続エラー（例: PostgreSQL の接続文字列を含むスタックトレース）や、
ORM が生成した内部クエリ文字列（パラメータ値を含む場合がある）がそのまま
サーバーログに出力される可能性がある。

環境変数 `DATABASE_URL` 等の秘密情報がエラーメッセージ内に含まれるケースは
稀だが、ユーザー入力由来のデータ（`name` の値）が内部エラーのコンテキストと
して混入するリスクもある。

クライアントへのレスポンスは `{ error: 'Internal Server Error' }` 固定（問題なし）
だが、ログ側の制御が不十分である。

**修正案**:
```typescript
// スタックトレースのみに限定するか、構造化ログで出力フィールドを制御する
console.error('[Internal Error]', err instanceof Error ? err.stack : String(err));
```
あるいは将来的に構造化ログライブラリを導入する際に改めて対処する、
という判断でも許容できる（MVP1 の2名利用・開発環境のみの前提であれば）。
既存の Recipe 実装から引き継いだパターンであり、本指摘は Store 新規実装
の範囲に留まらない横断的課題でもあるため、優先度は Should とする。

---

## 問題なし（確認済み項目）

### 観点1: Zod バリデーションの網羅性（空文字・空白のみの拒否）

`createStoreSchema` の `name` は `nonBlankString`（`refine` で `trim() !== ''`）で
検証されており、Hono ルートの `zValidator('json', createStoreSchema)` が `POST /` の
前段に配置されている（`stores.ts` line 18）。バリデーション通過後は `c.req.valid('json')`
で型付き値を取得しており、未検証の生文字列が UseCase に渡ることはない。

### 観点1: SQL インジェクション対策

`DrizzleStoreRepository` 内に `sql` テンプレートタグの直接使用はない。
全クエリが Drizzle ORM のクエリビルダー（`.select()`, `.insert()`, `.where(eq(...))`,
`.onConflictDoUpdate()`）で構築されており、パラメータバインディングが自動適用される。

### 観点2: 認証・認可

設計書 §13 に「MVP1 は認証なし（ADR-003 準拠）」と明記されており、意図的な設計判断。
Phase 2 で認証を導入する際の差し込み箇所として、`storesRoute` のハンドラ前段に
認証ミドルウェアを挿入する構造が Recipe ルートと対称的に確保されている（問題なし）。

### 観点3: 秘密情報のハードコードなし

レビュー対象ファイル全体を走査した結果、API キー・接続文字列・トークン等の
ハードコードは確認されなかった。DB 接続は `getDb()` 経由（環境変数参照）で処理されている。

### 観点3: エラーレスポンスへの情報漏洩なし

`StoreNotFoundError` のメッセージ（`"Store not found: ${storeId}"`）が 404 レスポンスの
`{ error: message }` に含まれる。`storeId` は UUID 文字列であり、現時点では
`StoreNotFoundError` を throw する UseCase が存在しないため実害はない。
将来 単件取得・更新 UseCase 実装時には、ID の漏洩が許容できるか改めて判断すること。


---

# 品質レビュー: store-master

- レビュー日: 2026-06-28
- ブランチ: `claude/backlog-tasks-28cpv8`
- レビュアー: reviewer
- 設計書: `docs/designs/store-master.md`
- 実装計画: `docs/implementation-plans/store-master.md`
- 要件書: `docs/requirements/store-master.md`

---

## サマリ

| 重大度 | 件数 |
|---|---|
| Must | 0 |
| Should | 3 |
| Nice | 2 |

品質ゲート: `pnpm lint`（warning 2件、既存由来を含む）/ `pnpm type-check` / `pnpm test` いずれもエラーなし・全テスト通過。

---

## 指摘事項

### [Should-1] `app.ts` の import 文がスタイル規約と一致しない

**該当箇所**: `apps/web/src/server/app.ts` line 5-6

**理由**:
`RecipeNotFoundError` と `StoreNotFoundError` が同一パッケージ `@cookpit/application` から
別々の `import` 文で記述されている。TypeScript のコーディング規約（coding-standards.md）に
明示的な記述はないが、同一モジュールからの import は1行にまとめるのが一般的なスタイルであり、
lint の `@typescript-eslint/no-unused-vars` 警告（`routes` 変数: 9行目）も既存から継続している。

**修正案**:
```typescript
import { RecipeNotFoundError, StoreNotFoundError } from '@cookpit/application';
```
なお `routes` の lint 警告（`'routes' is assigned a value but only used as a type`）は
今回の変更前から存在する既存の問題であり、本実装で新たに導入したものではない。

---

### [Should-2] 試験計画観点 N-02 がテストに未実装

**該当箇所**: `packages/application/src/store/store-use-cases.test.ts`

**理由**:
要件書（`docs/requirements/store-master.md` §5）の試験計画 N-02
「`CreateStoreUseCase.execute()` で生成した ID で後から `GetStoresUseCase` で確認できる」
がテストに実装されていない。

設計書（§17-2）の Application 層テスト対象リストでは N-02 を明示的に含んでいないため、
test-designer と implementer の間でのスコープ絞り込みによる省略の可能性がある。ただし
N-02 はユースケース間の連携（create → getAll）を確認する重要なシナリオであり、
`InMemoryStoreRepository` を使えば追加コストなく実装可能なケースである。

設計書 §17-2 が N-02 を省略していることについて、Orchestrator 経由でテスト設計の意図を
確認することを推奨する。

**修正案（テストコード例）**:
```typescript
it('CreateStoreUseCase で作成した Store が GetStoresUseCase で取得できる（N-02）', async () => {
  const createUsecase = new CreateStoreUseCase(repository);
  const dto = await createUsecase.execute({ name: '西友' });

  const getUsecase = new GetStoresUseCase(repository);
  const dtos = await getUsecase.execute();

  expect(dtos).toHaveLength(1);
  expect(dtos[0]?.id).toBe(dto.id);
  expect(dtos[0]?.name).toBe('西友');
});
```

---

### [Should-3] `DrizzleStoreRepository` に `import type` を使うべき箇所がある

**該当箇所**: `packages/infrastructure/src/repositories/drizzle-store.repository.ts` line 2

```typescript
import { Store, StoreId } from '@cookpit/domain/src/shared/store';
```

**理由**:
`Store` は `Store.reconstruct()` の呼び出し（値として使用）があるため通常 import が必要。
しかし `StoreId` は `findById(id: StoreId)` のシグネチャ型注釈としてのみ使用されており、
実装内部では `id.value`（getter）にアクセスしているだけで `StoreId` コンストラクタ/静的メソッドを
直接呼んでいない。`StoreId.fromString()` は `toEntity()` 内で呼ばれているため通常 import が必要。

実際には `toEntity()` 内で `StoreId.fromString()` を呼んでいるため、
現状の通常 import は正しい判断である。指摘は「実装計画コメント（Step 4 注意点）が
`StoreId` を `import type` で統一可能と示唆しているが実際には不可」という
文書と実装のズレの認識を求めるもの。実装コード自体は正しい。

**対応不要**: コードは正しい。実装計画書（Step 4 注意点末尾）の文言
「`StoreRow`、`NewStoreRow` は〜`DrizzleRecipeRepository` の〜同様に型インポートで統一する」
という記述が `Store`/`StoreId` にも誤解されかねない表現になっているが、
ドキュメントの小さな曖昧さのため対応優先度は低い。

---

### [Nice-1] `StoreNotFoundError` が `onError` に登録されているが throw する UseCase が存在しない

**該当箇所**: `apps/web/src/server/app.ts` line 18-20 / `docs/designs/store-master.md` D-6

**理由**:
設計書 D-6 で「将来の単件取得・更新で使う前提のプレースホルダ」と明記されている。
`onError` への登録自体は設計通りであり、問題はない。
ただし現時点では到達しない分岐（dead code に準ずる）であることを将来の開発者が
誤解する可能性がある。コメントを付与することを提案する。

**修正案**:
```typescript
// StoreNotFoundError は現時点で throw する UseCase はないが、
// 将来の単件取得・更新 UseCase（設計書 D-6）に備えてハンドリングを登録している。
if (err instanceof StoreNotFoundError) {
  return c.json({ error: err.message }, 404);
}
```

---

### [Nice-2] `docs/04-domain-model.md` の `Store` エンティティ定義が実装と乖離している

**該当箇所**: `docs/04-domain-model.md` line 128-143

**理由**:
`docs/04-domain-model.md` に記述されている `Store` エンティティのスニペットは、
実装済みの `packages/domain/src/shared/store.ts` と以下の点で乖離している。

| 観点 | ドキュメント | 実装 |
|---|---|---|
| `create()` シグネチャ | `static create(name: string): Store` | `static create(input: StoreCreateInput): Store`（オブジェクト受け取り） |
| `reconstruct()` シグネチャ | `static reconstruct(id: StoreId, name: string): Store` | `static reconstruct(props: StoreProps): Store`（オブジェクト受け取り） |
| `createdAt` フィールド | 記載なし | 実装済み（`private readonly createdDate: Date`） |
| ドメインバリデーション | 記載なし | `name.trim() === ''` チェック実装済み |

また、同ドキュメント line 145 に「MVP1 では Store はシード（初期データ）として 2 件を DB に
登録する想定。動的な追加は Phase 2 以降」と記述されているが、今回の実装では `POST /api/stores`
で動的追加が実装されており、要件書・設計書とも整合している。ドキュメントの記述が古い状態である。

**修正案**:
`docs/04-domain-model.md` の Store セクションを現在の実装に合わせて更新する。
また、「動的追加は Phase 2」の記述を「Sprint 2 Unit A で動的追加 API を実装済み」に改める。

---

## 問題なし（確認済み項目）

### 要件・設計・実装計画・実装の整合性

設計書の確定判断 D-1〜D-6 がすべて実装に反映されている。

- D-1: `storeResponseSchema` が `packages/api-contract/src/store.schema.ts` に定義済み
- D-2: `StoreDto`（`{ id: string; name: string; createdAt: string }`）が `storeResponseSchema` の
  `z.infer` と構造一致している
- D-3: `stores.name` にユニーク制約なし（`schema.ts` 確認済み）
- D-4: `save()` が `INSERT ... ON CONFLICT (id) DO UPDATE SET name = ...` で実装済み
  （`createdAt` は更新対象外で正しい）
- D-5: `GET /api/stores/:id` ルートが定義されていない（スコープ外）
- D-6: `StoreNotFoundError` がプレースホルダとして定義・エクスポート済み

### Clean Architecture 依存方向

`packages/domain` が他パッケージに依存していないことを確認。
`DrizzleStoreRepository` が Domain の型（`Store`/`StoreId`/`StoreRepository`）に依存し、
逆方向の依存がないことを確認。Application 層が Infrastructure を直接 import していないことを確認。

### コーディング規約

- `any` 型: 使用なし
- default export 禁止: `app.ts` の `export default app` は Hono アプリの既存パターンで踏襲
- `import type`: `StoreRepository`・`CreateStoreInputDto`・`StoreDto` 等で適切に使用
- `===`: 全コード確認、`==` 使用なし
- 「値なし」は `null`: `findById` の `null` 返却が正しく実装されている

### マイグレーションの内容

`0002_lucky_king_bedlam.sql` が `CREATE TABLE "stores"` のみを含み、
`recipes` テーブルへの変更が存在しないことを確認。DDL は設計書 §11-2 の想定内容と一致。

### テストの通過

`pnpm test` 実行結果:
- `packages/domain`: 129 tests passed
- `packages/application`: 44 tests passed（新規 store テスト 10 件含む）

### 試験計画 vs 実装の対応（設計書 §17-2 の観点）

| 設計書観点 | テストファイル | 実装状況 |
|---|---|---|
| N-01: `CreateStoreUseCase` 正常系 | `store-use-cases.test.ts` | 実装済み |
| E-01: 空 name でバリデーション失敗 | `store-use-cases.test.ts` | 実装済み |
| E-02: 空白のみ name でバリデーション失敗 | `store-use-cases.test.ts` | 実装済み |
| N-03: `GetStoresUseCase` 0件 | `store-use-cases.test.ts` | 実装済み |
| N-04: `GetStoresUseCase` 複数件 | `store-use-cases.test.ts` | 実装済み |
| N-05: `toStoreDto` Mapper 全フィールド | `store.mapper.test.ts` | 実装済み |
| N-02: create → getAll 連携 | なし | 未実装（Should-2 参照） |

### Mapper の public API 網羅

`toStoreDto()` は唯一の public 関数であり、`store.mapper.test.ts` でテストされている。
全フィールド（id / name / createdAt の ISO 8601 変換）の正しさを検証済み。

