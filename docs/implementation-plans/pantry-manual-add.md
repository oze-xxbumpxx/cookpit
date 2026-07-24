# 実装計画: pantry-manual-add（在庫の手動追加）

- 対象設計書: `docs/designs/pantry-manual-add.md`（確定・L2）
- ブランチ: `claude/resolve-yesterday-issues-gfchu4`
- 完了条件: `pnpm lint` / `pnpm type-check` / `pnpm test` 全 PASS、実画面確認 PASS、スコープ外変更なし。

## 実装順（下位レイヤーから）

### Step 1. api-contract

- ファイル: `packages/api-contract/src/pantry.schema.ts`
- 追加: `addStockSchema`（`displayName: z.string().min(1)`, `amount: {value: positive, unit: unitSchema}`,
  `storedLocation: storageLocationSchema.nullable()`, `expiresAt: z.iso.date().nullable()`）と型 `AddStockBody`。
- テスト: `pantry.schema.test.ts`（無ければ新規）に parse 成功/失敗（空名・value0・不正 location）。
- 完了条件: `pnpm --filter @cookpit/api-contract test` 緑。

### Step 2. Application

- ファイル: `packages/application/src/pantry/pantry.dto.ts` に `AddStockInputDto` を追加。
- 新規: `packages/application/src/pantry/add-stock.use-case.ts`（`AddStockUseCase`）。
  設計書 §バックエンド設計の擬似コードどおり。`Quantity`（`@cookpit/domain/src/shared/quantity`）と
  `InvalidStockOperationError` を利用。公開 API に JSDoc（`@throws`）。
- export: `packages/application/src/pantry/index.ts` に `add-stock.use-case` を追加。
- テスト: `add-stock.use-case.test.ts`（fake pantry repo。既存 consume/discard テストのフェイク実装に倣う）。
- 完了条件: `pnpm --filter @cookpit/application test` 緑。

### Step 3. Hono ルート

- ファイル: `apps/web/src/server/routes/pantry.ts`
- 追加: `.post('/stocks', zValidator('json', addStockSchema), ...)` → `new AddStockUseCase(pantryRepository())` →
  `c.json(dto, 201)`。import に `addStockSchema` / `AddStockUseCase` を追加。
- テスト: `apps/web/src/server/routes/pantry.test.ts` に 201+PantryDto（`execute` 引数）・400（空名/value0）。
- 完了条件: `pnpm --filter @cookpit/web test -- pantry` 緑。

### Step 4. Presentation UI

- 新規: `apps/web/src/app/pantry/_components/add-stock-form.tsx`（雛形 `add-item-form.tsx`）。
  保存場所ラベルは `_utils/pantry-view.ts` の `LOCATION_LABELS` / `UNSET` を利用。
- 変更: `apps/web/src/app/pantry/_components/pantry-client.tsx` に `addFormOpen` state・「在庫を追加」トグル・
  `handleAddStock`。
- テスト: `pantry-client.test.tsx` の api-client モックツリーに `stocks.$post` を追加し操作テスト、
  `add-stock-form.test.tsx` 新規。
- 完了条件: `pnpm --filter @cookpit/web test` 緑。

### Step 5. ドキュメント・仕上げ

- `docs/04-domain-model.md` Pantry セクションに「手動追加（productId=null / sourceShoppingItemId=null）」を追記
  （全面同期はしない）。
- 品質ゲート全実行 → 実画面確認（manual-browser-verify）→ 作業ログ追記 → コミット（層のまとまりで分割）→ プッシュ。

## 変更対象ファイル一覧

- `packages/api-contract/src/pantry.schema.ts`（+ `pantry.schema.test.ts`）
- `packages/application/src/pantry/pantry.dto.ts` / `add-stock.use-case.ts`（新規）/ `index.ts` / `add-stock.use-case.test.ts`（新規）
- `apps/web/src/server/routes/pantry.ts`（+ `pantry.test.ts`）
- `apps/web/src/app/pantry/_components/add-stock-form.tsx`（新規）/ `pantry-client.tsx`（+ テスト各種）
- `docs/04-domain-model.md`（追記のみ）

## ロールバック

各 Step はコミット単位で独立。UI（Step4）を戻しても API（Step1-3）は無害に残る（未使用エンドポイント）。
問題時は該当コミットを revert。DB スキーマ変更なしのためデータ移行の考慮不要。
