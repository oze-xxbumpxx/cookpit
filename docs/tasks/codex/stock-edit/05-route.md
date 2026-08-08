# Task 5: Presentation route — PUT /api/pantry/stocks/:stockId

## 概要

在庫更新の HTTP エンドポイントを 1 本追加する。参照する既存パターンは同ファイルの
`.post('/stocks/:stockId/consume', ...)`（`param` + `json` の 2 バリデータを併用する形）。

対象は `apps/web/src/server/routes/pantry.ts` と対応するテストのみ。
**Task 3（api-contract）・Task 4（Application）が完了している前提。**

## アーキテクチャ制約

- Presentation 層は UseCase を呼ぶだけ。**ドメインロジックを書かない。**
- UseCase の組み立て（手動 DI）は呼び出し側（ルート）で行う。
- Hono ルートの型はフロントから `import type` で取り込み、型安全に呼び出す（Hono RPC）。
- 入出力スキーマは Zod（`packages/api-contract`）を使う。
- `any` 型は禁止。デフォルトエクスポート禁止。型のみのインポートは `import type`。

## 実装対象ファイル

### `apps/web/src/server/routes/pantry.ts`（追記）

既存の `.post('/stocks/:stockId/discard', ...)` の**直後**にチェーンする。

```ts
  .put(
    '/stocks/:stockId',
    zValidator('param', stockIdParamSchema),
    zValidator('json', updateStockSchema),
    async (c) => {
      const { stockId } = c.req.valid('param');
      const body = c.req.valid('json');
      const usecase = new UpdateStockDetailsUseCase(pantryRepository());
      const dto = await usecase.execute({ stockId, ...body });
      return c.json(dto, 200);
    },
  );
```

import の追加:

- `@cookpit/api-contract` から `updateStockSchema`
- `@cookpit/application` から `UpdateStockDetailsUseCase`

（どちらも既存の import 文にアルファベット順で差し込む。既存の並びを崩さない）

### `apps/web/src/server/app.ts`

**変更不要。** 既存の `onError` が `NotFoundError` → 404 / `InvalidOperationError` → 422 の
2 段分岐で拾う。**このファイルに差分を出さないこと**（出ていたら何かを間違えている）。

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **メソッドは `.put()`。** `.patch()` にしない（P-2 で `PATCH` は明示的に却下されている）。
- **バリデータは 2 つ必要**（`param` と `json`）。`consume` と同じ形。`discard` は `param` のみ
  なので、そちらを真似すると `json` バリデータが抜ける。
- **`c.req.valid('param')` と `c.req.valid('json')` を取り違えない。**
  `stockId` は `param` 側、`amount` / `expiresAt` / `storedLocation` は `json` 側。
- **`{ stockId, ...body }` の順序**を守る（`consume` と同じ）。`{ ...body, stockId }` でも
  結果は同じだが、既存の並びに揃えること。
- **ステータスは 200**（`consume` / `discard` と同じ）。`.post('/stocks', ...)` の **201 と
  取り違えない**（201 は新規作成のみ）。
- **`try/catch` を書かない。** エラーは throw させて `app.onError` に拾わせる
  （既存 4 ルートすべてが `try/catch` を持たない）。
- **チェーンの末尾のセミコロン**に注意。現在は `.post('/stocks/:stockId/discard', ...)` の
  行末が `});` でチェーンが終わっている。`.put()` を足したら、そちらが末尾になる。
- ルート変数名は `pantryRoute`（単数）。既存の宣言を変えない。
- Repository は **`pantryRepository()` ファクトリ経由**（`new DrizzlePantryRepository(getDb())` の
  直書きをしない）。既存 4 ルートと同じ。

## テスト

`apps/web/tests/server/routes/pantry.test.ts` に追記する（既存ファイル。`vi.mock` で
UseCase をモックする既存の書き方に揃える）。

> **テストファイルの拡張子に注意**: `apps/web` の vitest は `include` パターンでファイルを
> 拾う。`server` 配下の既存テストは `*.test.ts` で拾われている（既存ファイルに追記するので
> 問題は起きないが、新規ファイルを作る場合は既存の命名に必ず合わせること。合わないと
> **silent skip** になり「テストが通った」ように見える）。

試験計画 `docs/tests/stock-edit.md` §6（WH-PUT-01〜07）。

**必須ケース**:

- 200: 正常更新で `UpdateStockDetailsUseCase.execute` が
  `{ stockId, amount, expiresAt, storedLocation }` で呼ばれ、DTO がそのまま返る
- 404: UseCase が `StockNotFoundError` を throw → `res.status === 404`
- 422: UseCase が `InvalidStockOperationError` を throw → `res.status === 422`
- **WH-PUT-04**: **400 が 4 パターン**（`amount.value: 0` / `expiresAt` が datetime 形式 /
  `storedLocation` が enum 外 / 必須キー省略）。いずれも **`execute` が呼ばれない**ことを
  併せてアサートする（UseCase 到達前に `zValidator` が弾くため）
- **WH-PUT-07**: 既存 4 エンドポイント（`GET /` / `POST /stocks` /
  `POST /stocks/:stockId/consume` / `POST /stocks/:stockId/discard`）が回帰していないこと

## 完了条件

- [ ] `pnpm --filter @cookpit/web test`（該当ファイル）全 green
- [ ] `pnpm --filter @cookpit/web type-check` / `pnpm lint` 全 green
- [ ] **`apps/web/src/server/app.ts` に差分が無い**（`git diff` で確認）
- [ ] 400 の 4 パターンで `execute` が呼ばれないことがテストで固定されている
- [ ] 既存 4 ルートのハンドラに差分が無い（import 行の追加のみ）
