# 試験計画: product-detail-performance

- 設計書: [docs/designs/product-detail-performance.md](../designs/product-detail-performance.md)
- レベル: L2
- テストランナー: Vitest
- 要件定義書: なし（設計書の §要件 R-1〜R-6 を正とする。設計書 冒頭に明記済み）

## 前提（性能改善タスクとしての焦点）

本タスクは「動くこと」ではなく「改善したこと」が主目的。次の 2 つを機械的に検証する
観点を最優先に置き、機能面は**入出力が変更前と一致すること**（等価性）の確認に絞る。

1. `GetProductDetailUseCase` のクエリ回数（`findById` 1 回 + `findAll` 1 回、
   `storeRepository.findById` 0 回）— Application 層の単体テストで**回帰ガードとして固定**する。
2. recharts の遅延読み込みが実際に効いていること（初期チャンクから外れる／パス指定ミスで
   永久にスケルトンのままにならない）— ビルド計測 + RTL + 手動確認の3手段で担保する。

## 試験種別

| 種別                | 対象                                                                        | 実施               |
| ------------------- | --------------------------------------------------------------------------- | ------------------ |
| 単体（Application） | `GetProductDetailUseCase`                                                   | 自動               |
| 単体（既存回帰）    | `GetProductUseCase` / `GetCheapestStoreUseCase`（変更なし。既存テスト維持） | 自動               |
| 結合（画面/RTL）    | `ProductDetailClient`（`next/dynamic` 化への追随）                          | 自動               |
| 結合（Hono 回帰）   | `GET /api/products/:id`（GetProductUseCase を使う既存ルート。変更なし）     | 自動               |
| ビルド計測          | `pnpm build` 後のチャンクファイル・client-reference-manifest                | 自動（スクリプト） |
| 手動                | CLS・遅延読み込みの体感・機能等価性の目視確認                               | 手動               |

## 単体試験観点

### Application（`GetProductDetailUseCase`）— ID プレフィクス `GPD`

新規ファイル `packages/application/src/product/get-product-detail.use-case.ts` の
`execute()` が唯一の public メソッド。テストは既存の
`packages/application/tests/product/product-use-cases.test.ts` に
`describe('GetProductDetailUseCase')` として追加する（同ファイル内の
`InMemoryProductRepository` / `InMemoryStoreRepository` を再利用）。

| ID     | 前提                                                                                                        | 操作                   | 期待結果                                                                                                                                                                                                       | 分類                     |
| ------ | ----------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| GPD-01 | 商品1件（店舗2件・価格記録複数、既存の「複数店舗の最新単価から最安店舗を返す」テストと同一 fixture）を seed | `execute('product-1')` | **`productRepository.findByIdCallCount === 1`・`storeRepository.findAllCallCount === 1`・`storeRepository.findByIdCallCount === 0`**（本タスクの目的そのものの回帰ガード。将来また重複クエリが入ったら落ちる） | 正常系・最重要回帰ガード |
| GPD-02 | GPD-01 と同一 fixture                                                                                       | `execute('product-1')` | 戻り値の `product` が、同一 fixture に対する `GetProductUseCase.execute()` の戻り値と一致する（`toEqual`）                                                                                                     | 正常系・等価性           |
| GPD-03 | GPD-01 と同一 fixture                                                                                       | `execute('product-1')` | 戻り値の `cheapestStore` が、同一 fixture に対する `GetCheapestStoreUseCase.execute()` の戻り値と一致する（`toEqual`）                                                                                         | 正常系・等価性           |
| GPD-04 | 商品1件（価格記録0件）を seed                                                                               | `execute('product-1')` | `cheapestStore` が `null`。`storeRepository.findAllCallCount === 1`（価格記録が無くても `findAll` 自体は呼ばれる設計どおり）                                                                                   | 境界値                   |
| GPD-05 | 商品1件（価格記録1件・参照先の店舗を `storeRepository` に seed しない）                                     | `execute('product-1')` | `cheapestStore.storeName === ''` **かつ** `product.priceHistory[0].storeName === ''`（`GetCheapestStoreUseCase` の既存縮退仕様との一致。読み取りを例外で止めない）                                             | 異常系・整合性           |
| GPD-06 | 商品未 seed（`storeRepository` には店舗1件を seed しておく）                                                | `execute('missing')`   | `ProductNotFoundError` を投げる。**`storeRepository.findAllCallCount === 0`・`storeRepository.findByIdCallCount === 0`**（商品未検出時は店舗に一切アクセスしない）                                             | 異常系                   |

> GPD-01・GPD-06 が「4 クエリ → 2 クエリ」削減効果の回帰ガード本体。GPD-02・GPD-03・GPD-05 が
> 「クエリ構成を変えても画面の見え方が変わらない」ことの等価性ガード。

### 既存 UseCase の回帰（変更なし）

`GetProductUseCase` / `GetCheapestStoreUseCase` はロジック変更なし（設計書 §対象外）。
既存の `describe('GetProductUseCase')` / `describe('GetCheapestStoreUseCase')`
（同ファイル内）を**無変更のまま全件 pass**させることが回帰条件。新規追加不要。

## 結合試験観点

### Presentation（`ProductDetailClient`・`next/dynamic` 化）— ID プレフィクス `PDC`

対象: `apps/web/tests/app/products/[id]/_components/product-detail-client.test.tsx`
（既存ファイル。既存 `PDC-01`〜`PDC-12` に**追記**する。vitest `include` は
`tests/**/*.test.tsx`（happy-dom project）に一致済み・新規ファイル不要）。

**`next/dynamic` を `vi.mock` しない。** モックすると `import()` のパス指定ミス
（設計書のリスク「フォールバックコンポーネントを誤って `price-history-chart.tsx` から
import すると遅延化の効果が消える」と対になる実装ミス）をテストが検出できなくなる。
実際の動的 import をそのまま解決させ、`findBy*` / `waitFor` で最終状態を確認する。

| ID     | 前提                                                            | 操作                                                       | 期待結果                                                                                                                                                                                                                                                               | 分類               |
| ------ | --------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| PDC-13 | 価格記録 1 件以上の商品（既存 `renderDetail()` の既定 fixture） | `render()` 後、`waitFor`/`findBy*` で最終状態を待つ        | 最終的に `container.querySelector('[data-slot="chart"]')`（`components/ui/chart.tsx` の `ChartContainer` が付与する属性）が **null でなくなる**。タイムアウトせず解決すること自体が「dynamic import のパス指定ミスで永久にスケルトンのまま」という実装ミスの回帰ガード | 正常系・回帰ガード |
| PDC-14 | 価格記録 0 件の商品（`renderDetail([])`）                       | `render()` 後、`findByText('価格記録がありません')` で待つ | 最終的に「価格記録がありません」が描画される（空データ時の遅延解決確認。PriceHistoryChart は履歴 0 件時に early return する経路のため PDC-13 とは別の解決先を通る）                                                                                                    | 境界値・回帰ガード |
| PDC-15 | 既存 fixture                                                    | 既存 `PDC-01`・`PDC-02`・`PDC-08` をそのまま実行           | チャート領域とは独立した DOM（最安店舗・最新価格カード、「最近の記録」の有無）を見ている同期 `getByText`/`queryByText` は `next/dynamic` 化後も**無修正で pass**する（回帰）。壊れた場合は実装時に該当箇所のみ `findBy*` へ置換し、この行を更新する                    | 回帰               |

> PDC-13 の「render 直後はスケルトン」という前段アサーションは、同一テストファイル内の
> 先行テスト（PDC-01 等）の `render()` で `import('./price-history-chart')` が既に一度
> 解決済み（モジュールキャッシュ）になっている可能性があるため、**前段の有無に依存させない**
> （最終状態の解決確認のみを必須アサーションとする）。前段を厳密に確認したい場合は
> 実装時に `vi.resetModules()` の要否を検討する（過剰実装は避ける）。

### Hono ルート（回帰のみ・変更なし）

対象: `apps/web/tests/server/routes/products.test.ts`（既存 `WH-P-01`〜`WH-P-15`）。
`GetProductUseCase` / `GetCheapestStoreUseCase` を使う既存ルート（`GET /api/products/:id`
ほか）はロジック無変更（設計書 R-2・R-5）。既存テストを**無変更のまま全件 pass**させることが
回帰条件。`GET /api/products/:id/cheapest-store` に専用テストが無いことは既存のギャップで
あり、本タスクのスコープ外（未決事項1として設計書に記録済み）。

## バンドルサイズ削減の検証（ビルド計測・機械的手段）— ID プレフィクス `BLD`

設計書 §テスト方針「バンドルサイズ削減の検証」の手順をそのまま実行する。
`next build --webpack` の Route 表にサイズ列が出ないことを Orchestrator が実測済みのため、
チャンクファイルを直接測る。

前提データ（改善前ベースライン・実測値・コミット `6f39be3`）:

| チャンク                                                         | サイズ     | 内容                |
| ---------------------------------------------------------------- | ---------- | ------------------- |
| `.next/static/chunks/6383-0fb8ea77dabd0644.js`                   | **374 KB** | **recharts を含む** |
| `.next/static/chunks/app/products/[id]/page-682415964608e055.js` | 37 KB      | ページ本体          |

ハッシュはビルドのたびに変わるため、毎回コマンドで特定する。

```bash
pnpm build
grep -rl "recharts" apps/web/.next/static/chunks/ | while read f; do
  printf "%s  %s KB\n" "$f" "$(( $(stat -c %s "$f") / 1024 ))"; done
grep -rl "<chunk-name>" apps/web/.next --include=*.js | grep client-reference-manifest
```

| ID     | 項目                                                                  | PASS 基準                                                                                                                                                                                                                                            |
| ------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BLD-01 | recharts を含むチャンクが独立したオンデマンドチャンクとして出力される | `grep -rl "recharts" apps/web/.next/static/chunks/` で見つかるファイルが `app/products/[id]/page-*.js`（ページ本体チャンク）と**別ファイル**であること                                                                                               |
| BLD-02 | そのチャンクが `/products/[id]` の初期ロードから外れる                | BLD-01 のチャンクを参照する client-reference-manifest から `/products/[id]` が外れていること。**参照が残る場合は BLOCKED とし**、MB-04（実ブラウザの Network タブ確認）の結果を代替エビデンスとして併記する（PASS の代替根拠にする場合は理由を明記） |
| BLD-03 | 数値を前後比較で記録する                                              | 「374 KB が初期ロードチャンク集合から外れた」ことを**実測 KB 値**で記録する。推定値は不可（設計書の明示指示）                                                                                                                                        |

## 特性観点

| 観点           | 内容                                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 権限           | 対象外（ADR-0003。MVP1 は認証なし運用）                                                                                                                                                                                                                                                                                                                                        |
| データ整合性   | 最安店舗判定結果（`cheapestStoreAt()`）とその店舗名解決が変更前後で一致すること（GPD-02・GPD-03）。孤立店舗参照時の空文字縮退が既存仕様と一致すること（GPD-05）                                                                                                                                                                                                                |
| 冪等性         | 対象外（`GetProductDetailUseCase` は読み取り専用 UseCase。書き込み・外部連携を含まない）                                                                                                                                                                                                                                                                                       |
| 障害系         | 対象外（新規の外部 I/O は無く、既存 DB 読み取り経路の再構成のみ。設計書 §エラー処理で明示的に対象外）                                                                                                                                                                                                                                                                          |
| フロントエンド | ローディング（スケルトン。PDC-13/14）／レイアウトシフト（MB-01）／エラー表示は変更なし（回帰。既存 `deleteErrorMessage` 等のフローは触っていない）                                                                                                                                                                                                                             |
| 防御性         | 対象外（理由: Domain 層・Entity/VO の変更なし（R-5）。`GetProductDetailUseCase` は既存の `toProductDto` / `toStoreNameMap`（純関数・イミュータブルな DTO を生成）をそのまま再利用するのみで、新たな可変オブジェクトの受け渡しや不変条件を持つ状態変更メソッドを追加しない。L2 リファクタとして「入出力不変」の回帰観点（GPD-02・GPD-03・GPD-05）を防御性の代替として優先する） |
| 性能           | GPD-01（クエリ回数）・BLD-01〜03（バンドルサイズ）が本タスクの主目的の検証そのもの                                                                                                                                                                                                                                                                                             |

## 手動試験（`manual-browser-verify`）

`apps/web` の画面変更（`ProductDetailClient` の `next/dynamic` 化）を含むため実施する。
各項目の PASS 基準は項目名と同じ強さで書く。

| ID    | 項目                                                                                                                                 | 前提となるテストデータ                                                                                                                                             | PASS 基準                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MB-01 | スケルトン → チャート切り替わり時にレイアウトシフトが発生しない（CLS。R-4）                                                          | 価格記録を 3 件以上持つ商品（例: 店舗「西友」「ライフ」に各複数件、`observedAt` を分散させたもの）を `dev:pglite` の DB にシード                                   | 商品詳細ページを開いた瞬間から「価格推移」セクションの高さが**スケルトン表示中もチャート表示後も変わらない**こと（スクリーンショットで前後の高さ・周辺要素の位置がずれていないことを確認する。目視でカクつき・要素の押し出しが無いこと）                   |
| MB-02 | recharts チャンクが初期ロードに含まれず、チャート表示直前にのみ取得される（BLD-02 の実ブラウザ補完。BLD-02 が BLOCKED の場合は必須） | MB-01 と同一データ                                                                                                                                                 | ブラウザの Network タブで、ページ初回ロード時のリクエスト一覧に recharts を含むチャンク（BLD-01 で特定したファイル名）が**含まれない**こと。「価格推移」セクションがビューポートに入る／マウントされるタイミングで当該チャンクへのリクエストが発生すること |
| MB-03 | 最安店舗欄・価格推移グラフの内容が変更前と同じである（機能等価性。R-2 と対）                                                         | 店舗「西友」（270円/90単価・古い記録）と店舗「ライフ」（270円/90単価より安い記録、例 240円/80単価）を持つ商品を 1 件シード（最安店舗が「ライフ」になる組み合わせ） | 最安店舗カードの店舗名が「ライフ」、単価表示が最新のライフの記録と一致すること。価格推移グラフに西友・ライフ両方の系列（凡例）が表示され、店舗名が正しくラベル付けされていること                                                                           |
| MB-04 | `ssr: false` によるチラつきの許容可否（未決事項3の判断材料。PASS/FAIL ではなく所見を記録する）                                       | MB-01 と同一データ                                                                                                                                                 | 「PASS」判定は付けず、**スケルトンからチャートへの切り替わりが視認できるレベルのちらつきかどうか**を所見として記録する（許容できない体感であれば `ssr: true` への変更要否を Orchestrator へ差し戻す）                                                      |

## メソッド網羅チェック表

| クラス / コンポーネント                               | メソッド / 公開エクスポート                   | 対応する試験 ID                                                                                                                                                                                                          |
| ----------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GetProductDetailUseCase`（新規）                     | `execute`                                     | GPD-01〜06                                                                                                                                                                                                               |
| `GetProductUseCase`（変更なし）                       | `execute`                                     | 既存 `describe('GetProductUseCase')`（無修正で pass。回帰対象）                                                                                                                                                          |
| `GetCheapestStoreUseCase`（変更なし）                 | `execute`                                     | 既存 `describe('GetCheapestStoreUseCase')`（無修正で pass。回帰対象）                                                                                                                                                    |
| `toProductDto` / `toStoreNameMap`（変更なし・再利用） | 純関数                                        | 既存 `packages/application/tests/product/product.mapper.test.ts`（回帰対象）                                                                                                                                             |
| `ProductDetailClient`                                 | `ProductDetailClient`（コンポーネント）       | PDC-01〜16（01〜12 は既存・継続、13〜15 が本タスクの追加分）                                                                                                                                                             |
| `PriceHistoryChartSkeleton`（新規）                   | `PriceHistoryChartSkeleton`（コンポーネント） | PDC-13/14 で `loading` フォールバックとして間接的に描画される。別ファイル分離の効果自体は BLD-01/02 で検証（理由: recharts 非依存の静的プレースホルダで固有の分岐ロジックを持たないため、単体の RTL テストは過剰と判断） |
| `ProductDetailPage`（`page.tsx`、Server Component）   | default export（Next.js 規約上の例外）        | RTL 対象外（async Server Component）。`pnpm type-check` + MB-01〜04 で確認                                                                                                                                               |

## 要件書観点の照合

| 要件 | 内容                                                       | 試験 ID                                                                                                              |
| ---- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| R-1  | DB クエリを 4 本 → 2 本に削減                              | GPD-01                                                                                                               |
| R-2  | `GET /api/products/:id/cheapest-store` の挙動不変          | 回帰（`GetCheapestStoreUseCase` 無変更 + 既存 Hono ルートテスト無変更で pass。専用テスト無しは既存ギャップ・対象外） |
| R-3  | recharts を初期チャンクから除外                            | BLD-01・BLD-02・MB-02                                                                                                |
| R-4  | 遅延読み込み中もレイアウトシフトが発生しない               | MB-01                                                                                                                |
| R-5  | Domain 層・DB スキーマ・api-contract は変更しない          | テスト対象外（コードレビューで確認。`packages/domain` / `packages/api-contract` に diff が無いことをレビューで担保） |
| R-6  | クエリ数・バンドルサイズ削減を機械的に検証できる状態にする | GPD-01（クエリ）+ BLD-01〜03（バンドル）                                                                             |

## 回帰試験範囲

| 範囲                                                                                 | 理由                                                                                                     |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `packages/application/tests/product/product-use-cases.test.ts` 全体                  | `InMemoryProductRepository` / `InMemoryStoreRepository` へのカウンタ追加が既存アサーションを壊さないこと |
| `apps/web/tests/app/products/[id]/_components/product-detail-client.test.tsx` 全体   | `PriceHistoryChart` の `next/dynamic` 化で既存 `PDC-01`〜`12` がタイミング依存にならないこと             |
| `apps/web/tests/server/routes/products.test.ts` 全体                                 | `GetProductUseCase` を使う `GET /api/products/:id` 等が無変更であることの疎通確認                        |
| `apps/web/src/app/products/[id]/edit/page.tsx`（テストは無いため type-check + 目視） | `GetProductUseCase` は変更しないが、`page.tsx` 側の import 整理で誤って巻き込まれていないか              |
| `packages/application/tests/product/product.mapper.test.ts`                          | `toProductDto` / `toStoreNameMap` を新 UseCase が再利用するため、既存の変換仕様が前提のまま保たれること  |

## 試験データ

- **クエリ回数・等価性検証用（GPD）**: 既存の `describe('GetCheapestStoreUseCase')` の
  「複数店舗の最新単価から最安店舗を返す」テストと同一 fixture を流用する
  （店舗 `store-a`（西友）・`store-b`（ライフ）、商品 `product-1`（玉ねぎ）、価格記録
  `store-a-old`（240円/80単価・旧）・`store-a-new`（360円/120単価・新）・
  `store-b-new`（270円/90単価・新）。最安は `store-b`）。
- **価格記録 0 件の商品**（GPD-04）。
- **参照先店舗が `storeRepository` に存在しない価格記録を持つ商品**（GPD-05。既存
  「最安店舗 ID に対応する Store が無くても storeName を空文字で返す」テストと同一 fixture）。
- **存在しない商品 ID**（`'missing'`。GPD-06）。
- **RTL（PDC-13〜15）**: 既存 `product-detail-client.test.tsx` の `renderDetail()` /
  `renderDetail([])` をそのまま使う（新規 fixture 追加不要）。
- **手動確認（MB）**: `dev:pglite` に店舗2件・価格記録3件以上（最安店舗が入れ替わる価格差を含む）
  を持つ商品をシードする。

## テストヘルパーの変更（実装が必要な準備作業）

`packages/application/tests/product/product-use-cases.test.ts` の
`InMemoryProductRepository` / `InMemoryStoreRepository`（同ファイル内ローカルクラス）に、
既存の `saveCount` と同じ命名パターンでカウンタを追加する。

- `InMemoryProductRepository`: `public findByIdCallCount = 0;` を追加し、`findById()` の
  冒頭でインクリメントする。
- `InMemoryStoreRepository`: `public findAllCallCount = 0;` `public findByIdCallCount = 0;`
  を追加し、それぞれ `findAll()` / `findById()` の冒頭でインクリメントする。

この変更自体はテストコードのみ（本番コードへの影響なし）。GPD-01・GPD-04・GPD-06 の
前提となるため、実装計画のテスト実装スコープに含める。

## 完了条件

- GPD-01〜06、PDC-13〜15 がすべて実装され pass する。
- 既存 `product-use-cases.test.ts`（GetProductUseCase・GetCheapestStoreUseCase を含む全体）・
  `product-detail-client.test.tsx`（PDC-01〜12）・`products.test.ts`（WH-P-01〜15）・
  `product.mapper.test.ts` が無修正または軽微な追随のみで全件 pass する。
- `pnpm lint` / `pnpm type-check` / `pnpm test` が通る。
- BLD-01〜03 の実測結果（チャンクファイル名・サイズ・manifest 参照有無）が記録され、
  374 KB が初期ロードチャンク集合から外れたことが実測値で示されている（BLOCKED の場合は
  理由と代替エビデンスが明記されている）。
- MB-01〜04 の全項目に PASS / BLOCKED（理由） / FAIL のいずれかが付いている。
- メソッド網羅チェック表に空欄がない。
- 要件書観点の照合表の R-1〜R-6 すべてに試験 ID または確認手段（レビュー等）が対応している。
