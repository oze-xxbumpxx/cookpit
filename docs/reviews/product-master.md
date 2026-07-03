# レビュー結果: product-master（事後レビュー）

- 実施日: 2026-07-03
- レビュアー: reviewer Subagent（Codex 実装の事後レビュー。実装は Sprint 2 で docs/codex-tasks/ 01〜05 により Codex へ委譲されたもの）
- 経緯: 実装当時のレビュー記録が存在しないことが 2026-07-02 の棚卸しで判明し、Sprint 3 Unit A と並行で事後実施（ユーザー承認済み）
- 修正履歴: 初版の C-2 / M-3 / M-5 / 旧 m-1（StoreNotFoundError 配置）/ StoreRepository.save() 指摘は、
  store-master（2026-06-28 完了・レビュー済み `docs/reviews/store-master.md`）の設計判断
  D-2 / D-4 / D-6 と設計書記載の再検証により**取り下げ**。詳細は「初版からの変更点」参照

## 重大度サマリ

| 重大度 | 件数 | 主な内容 |
| --- | --- | --- |
| critical | 2 | C-1 ProductCategory 開放型 / C-3 品質ゲート未通過（→2026-07-03 解消済み・追記参照） |
| major | 5 | M-1 save の削除挙動 / M-2 複合インデックス欠如 / M-4 契約外フィールド / M-5・M-6 Domain API の設計乖離 |
| minor | 8 | m-1 指示外 UI / m-2 未使用メソッド / m-3〜m-8 スタイル・テスト不足 |
| nits | 2 | n-1 CSS 変数 / n-2 FK アノテーション |

## 初版からの変更点

| 旧指摘 | 変更 | 理由 |
| --- | --- | --- |
| C-2（CreateStoreUseCase / POST /api/stores / createStoreSchema / StoreRepository.save() のスコープ外指摘） | バックエンド一式を撤回。フロント UI 部分のみ m-1（minor）へ降格 | store-master 設計書（行 16-20）に明記された正規スコープ。セキュリティレビュー済み |
| M-3（DrizzleStoreRepository の onConflictDoUpdate） | 取り下げ | store-master 設計判断 D-4 で upsert が正規設計。シードスクリプト自体が存在せず再実行リスクは事実として不在 |
| M-5（StoreDto の createdAt） | 取り下げ | store-master 設計判断 D-2 で `{ id, name, createdAt }` が確定設計 |
| 旧 m-1（StoreNotFoundError の配置） | 取り下げ | store-master 設計判断 D-6 で `packages/application/src/store/` が正規位置 |
| M-4（CheapestStoreResultDto packageSizeUnit） | 維持 | product-master.contract.md（行 378-385）にも store-master 設計書にも記載なし。設計外を確認 |

## 品質ゲート実行結果

| コマンド | レビュー時 | 追記（2026-07-03 解消後） |
| --- | --- | --- |
| `pnpm lint` | PASS（全パッケージ） | PASS |
| `pnpm type-check` | FAIL（infrastructure: vitest / pglite 未解決） | **PASS（6/6）** |
| test: domain | PASS（129 tests） | PASS |
| test: application | PASS（73 tests） | PASS |
| test: infrastructure | FAIL（vitest: command not found） | **PASS** |
| test: apps/web | FAIL（同上） | ローカルのみ FAIL（下記追記） |

> **追記（メイン会話・2026-07-03）**: C-3 の原因は workspace root での `pnpm install` 未実行。
> install 実行で type-check 6/6・domain/application/infrastructure テストは PASS に転じた。
> apps/web テストのみローカル Node v20.17.0 が vite 7 の要件（Node ≥20.19 / ≥22.12、
> `require(ESM)` サポート）未満のため FAIL。CI（node-version: 20 = 最新 20.x）では通過して
> おり（PR #21 実績）、コードの問題ではない。ローカル Node の更新を依頼済み。

---

## CRITICAL

### C-1: `ProductCategory` 型が事実上 `string` になっている

**該当**: `packages/domain/src/product/product.ts` 行 8

```typescript
export type ProductCategory = '野菜' | '肉' | '魚' | '調味料' | '乾物' | '冷凍' | string;
```

末尾の `| string` が全リテラルを吸収し、型として `string` と等価になっている。TypeScript はリテラル一致を検査できず、閉じた列挙型の保証がゼロになる。テスト P15 が `'嗜好品'` を意図的に通しており実装者の意図的選択だが、要件は「確定列挙」を指定している。Zod が API 境界でバリデーションしても、Domain を直接利用するルート（テスト・UseCase 内部）では任意文字列が通る。

- **修正案**: `| string` を削除する。開放型カテゴリが要件として必要なら設計変更として差し戻す。

### C-3: `pnpm type-check` / `pnpm test` が通らない（→ 解消済み）

**原因**: `packages/infrastructure` に追加されたテスト依存（`vitest`, `@electric-sql/pglite`）が `package.json` には宣言されているが `node_modules` に未インストール。

- **修正案**: workspace root で `pnpm install` を実行する。コード変更不要。
- **状態**: 2026-07-03 に install 実施済み（上記追記参照）。残るローカル Node 更新のみ。

---

## MAJOR

### M-1: `DrizzleProductRepository.save()` が add-only でない（設計違反）

**該当**: `packages/infrastructure/src/repositories/drizzle-product.repository.ts` 約 85-109 行

upsert 後に、メモリ上の `product.priceHistory` に含まれない `price_records` 行を `DELETE ... WHERE id NOT IN (...)` で削除している。実装計画 S2-2 は「save は add-only（既存 PriceRecord の削除は行わない）。DELETE は delete() メソッドのみ」と明示している。

現 MVP1 では findById が常に全件ロードするため即時障害にはならないが、同一 Product への競合書き込み（リクエスト A と B が独立に取得・更新・保存）でいずれかの PriceRecord が消えるリスクがある。将来の部分ロード最適化時に無音のデータ損失につながる設計債務でもある。

- **修正案**: `DELETE ... NOT IN` ブロックを除去し、`price_records` を純粋な upsert（`INSERT ... ON CONFLICT (id) DO UPDATE SET ...`）のみとする。

### M-2: DB スキーマに複合インデックスが 2 件ともない

**該当**: `packages/infrastructure/src/db/schema.ts`

設計書指定の 2 インデックス:

1. `(productId, observedAt DESC)` — `latestRecordsByStoreAt()` / `cheapestStoreAt()` の主クエリパターン
2. `(productId, storeId)` — 店舗フィルタリング

実装は `price_records_product_id_idx`（単一列 `productId`）1 件のみ。特に `(productId, observedAt DESC)` の欠如は `cheapestStoreAt()` で全 product スキャンになる性能上の懸念。

- **修正案**: Drizzle で複合インデックスを 2 件追加し、マイグレーションを再生成する。

### M-4: `CheapestStoreResultDto` に設計外の `packageSizeUnit` フィールド

**該当**: `packages/application/src/product/product.dto.ts` / `get-cheapest-store.use-case.ts`

`product-master.contract.md` 行 378-385 の `CheapestStoreResultDto` は `{ storeId, storeName, latestPrice, unitPrice }` のみ。実装は `packageSizeUnit: Unit` を追加しており、フロントエンドが `unitPriceBasisLabel(cheapestStore.packageSizeUnit)` で実際に利用している。UX 上の意義はあるが契約変更として設計書・api-contract の更新が未実施。

- **修正案**: 正式に契約化（contract.md 更新・`cheapestStoreSchema` への追加）するか、フィールドを削除してフロントを修正するかを判断する。

### M-5: `Product.latestPriceAt()` の返り型が設計と異なる

**該当**: `packages/domain/src/product/product.ts`

設計計画 S1-5 は `latestPriceAt(storeId): PriceRecord | null` を定義しているが、実装は `Money | null` を返す。別途 `latestPriceRecordAt(storeId): PriceRecord | null` が未設計の public メソッドとして追加されており、Domain Entity の公開 API が設計から乖離している。

### M-6: `UnitPriceCalculator.calculate()` の第 1 引数型が設計と異なる

**該当**: `packages/domain/src/product/unit-price-calculator.ts`

設計計画 S1-6 は `static calculate(priceAmount: number, packageSize: Quantity): Money` だが、実装は `static calculate(price: Money, packageSize: Quantity): Money`。機能的には等価で型安全性はむしろ高いが、設計書との乖離として設計書の追記または差し戻し判断が必要。

---

## MINOR

### m-1: `price-record-form.tsx` の「新規店舗追加」UI が Codex 指示外実装

**該当**: `apps/web/src/app/products/[id]/_components/price-record-form.tsx` 行 156-187

`docs/codex-tasks/05-frontend.md` 行 178 の指示は「storeId: セレクト — `useEffect` で `client.api.stores.$get()` を呼んで店舗一覧を取得」のみ。`handleCreateStore()` とインライン「新規店舗追加」入力・ボタンは指示に含まれていない。呼び先 `POST /api/stores` は store-master セキュリティレビュー済みのため安全上の問題はないが、この UX は試験計画・UI 設計のどちらにも含まれておらずテストが存在しない。

- **修正案**: 削除して指示通り GET のみとするか、正規実装として UX 設計・テストを追加するかを判断する。

### m-2: `Product.averagePrice()` / `isPriceLow()` がスコープ外で追加されている

**該当**: `packages/domain/src/product/product.ts` — どこからも呼ばれずテストも無い未使用メソッド。Sprint 3 以降の先行実装であれば設計書への記録が必要。

### m-3: api-contract の Zod インポートがデフォルトインポート

**該当**: `packages/api-contract/src/product.schema.ts` / `store.schema.ts` — `import z from 'zod'`。他ファイルおよび Zod 公式は `import { z } from 'zod'`。

### m-4: `recordPriceSchema.storeId` が `z.uuid()` を使用

**該当**: `packages/api-contract/src/product.schema.ts` — contract.md 行 102 は `z.string().uuid()` を指定。動作は等価だがスタイル乖離。

### m-5: 価格履歴チャートの CSS 変数キーに UUID を使用

**該当**: `apps/web/src/app/products/[id]/_components/price-history-chart.tsx` 行 121 — `stroke={`var(--color-${item.storeId})`}` は `--color-<UUID>` という変数名になる。shadcn chart context が短いキーを期待している場合、色が適用されない可能性。実画面確認（manual-browser-verify Skill）を推奨。

### m-6: api-contract Zod スキーマ単体テストが未実装

試験計画 §4 の `product.schema.test.ts`（ZP-1〜ZR-9）が存在しない。境界値テスト（空文字 name・storeId フォーマット等）が未カバー。

### m-7: テスト UC-DP-2（二重削除）が未実装

試験計画 §3-6 UC-DP-2「削除済み ID を再度 delete → ProductNotFoundError」が `product-use-cases.test.ts` に無い。

### m-8: Infrastructure テストがスコープ外で追加された

試験計画 §5 は「Infrastructure: 本 Sprint はスコープ外」だが Repository テスト 2 本が追加されている。内容は適切で歓迎できる追加（未 install が C-3 の直接原因になった点のみ注意）。

---

## NITS

### n-1: CSS 変数 UUID 問題（m-5 の補足）

実画面で色が正しく描画されるかの確認を推奨。tsc/eslint は通過するため目視確認が必要。

### n-2: `storeId` FK に明示的 `{ onDelete: 'restrict' }`

**該当**: `packages/infrastructure/src/db/schema.ts` — PostgreSQL のデフォルトが RESTRICT のため動作影響なし。設計書に記載のない明示アノテーション。低影響。

---

## 設計差し戻し事項（ユーザー判断が必要）

1. **C-1**: `ProductCategory` を閉じた列挙に戻すか、開放型を要件として認めるか。
2. **M-4**: `CheapestStoreResultDto.packageSizeUnit` を正式契約化するか、削除するか。
3. **m-1**: 「新規店舗追加」インライン UI を削除するか、正規 UX として設計・テストを追加するか。

## 確認済み（問題なし）

- CreateStoreUseCase / POST /api/stores / createStoreSchema / StoreRepository.save() — store-master 正規スコープ（セキュリティレビュー済み）
- StoreDto `{ id, name, createdAt }` — store-master D-2 準拠
- DrizzleStoreRepository.save() の upsert — store-master D-4 準拠
- StoreNotFoundError の配置（`packages/application/src/store/`）— store-master D-6 準拠
- Clean Architecture 依存方向（Domain に ORM/HTTP 型の混入なし）
- `static create()` / `static reconstruct()` パターン、UseCase = 1 クラス 1 `execute()`
- 確定値 U1（小数 1 桁 + `Math.round` + `numeric(10,1)`）/ U3 / U5 / U7、C1 / C2
- `'use client'` 付与漏れなし、`import type` の使い分け
- `pnpm lint` 全パッケージ通過、Domain 129 件・Application 73 件テスト PASS
