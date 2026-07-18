# 設計書: recipe-form-refactor-test-backfill

- ステータス: 実装中（2026-07-18 ユーザー承認済みスコープ: B → 1 → A の順で実施）
- レベル: L2（既存画面ロジックの複数ファイル共通化 + テスト補充。API 契約・DB・Domain 変更なし。
  テストのみ変更でも複数新規ファイルは L2 とする先例 `test-infra-expansion` に準拠）
- スプリント: Sprint 5 期間中の品質改善タスク（スプリント外）
- 関連: `docs/designs/recipe-edit-screen.md`（edit フォーム導入時の設計）、
  `apps/web/src/app/products/_components/product-form-fields.tsx`（共通化パターンの先例）、
  2026-07-18 セッションの全体監査結果（会話ログ）

---

## 背景

全体監査で、`recipe-form-client.tsx`（398 行）と `recipe-edit-form-client.tsx`（396 行）の
約 9 割（状態管理・材料/ステップ行操作・バリデーション・JSX）が重複していると判明した。
また RTL コンポーネントテスト導入（2026-07-01 PR #21）以前に実装された recipes / products 系
画面がほぼ未テストであり、特に `build-ingredient-input.ts` は分岐の多い純関数なのに
間接カバーすら無い。

## 目的

1. 共通化リファクタリングの安全網として、まず `build-ingredient-input` の単体テストを整備する（B）。
2. products で確立済みの `*-form-fields.tsx` パターンに揃えて、レシピ new/edit フォームの
   重複を解消する（1）。**挙動・API 契約・画面の見た目は変えない。**
3. リファクタ後の形に対して recipes / products 系コンポーネントの RTL テストを補充する（A）。

## 要件

- レシピ new/edit フォームの見た目・操作感・送信される JSON・エラーメッセージ文言を
  一切変えずに、重複コードを共通モジュールへ集約すること。
- `build-ingredient-input` / `product-format` のロジックが単体テストで固定されること。
- recipes / products 系の未テストコンポーネントに RTL テストが追加され、
  meal-plans / shopping-lists 系と同水準のカバレッジになること（対象外リスト除く）。
- API 契約・DB・Domain・Application 層は変更しないこと。

## スコープ

### 対象

- B: `apps/web/src/app/recipes/_utils/build-ingredient-input.ts` /
  `apps/web/src/app/products/_utils/product-format.ts` の node 単体テスト新規作成
- 1: `apps/web/src/app/recipes/_components/recipe-form-fields.tsx` 新規作成と
  new/edit フォームクライアント 2 本の書き換え
- A: recipes 系コンポーネント（form-fields / form-client / edit-form-client / ingredient-row /
  step-row / tag-filter / recipe-card / recipe-list-client / recipe-detail-client）と
  products 系（product-form-fields / price-record-form）の RTL テスト新規作成

### 対象外（理由付き）

- `price-history-chart.tsx`: recharts の描画のみでロジックを持たない。テスト費用対効果が低い
- `product-form-client.tsx` / `product-edit-form-client.tsx` / `product-detail-client.tsx`:
  薄いラッパー。フォームロジックは `product-form-fields` の build 関数テストでカバーする。
  残余は改善バックログ（フォローアップ）とする
- Hono ルート・UseCase・Domain・api-contract の変更（一切触らない）
- E2E テスト追加（別タスク）

## 設計判断

| #   | 判断                                                                                                                                                      | 理由                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| D-1 | 共通化は products の `product-form-fields.tsx` パターン（value 型 + errors 型 + build 関数 + 初期値ファクトリ + Fields コンポーネント）に揃える           | 既存先例との一貫性。新規パターンを増やさない                                                                             |
| D-2 | 基準人数フィールドは `RecipeFormFields` の props `baseServingsSlot: ReactNode` として呼び出し側が注入する                                                 | new（編集可能 Input）と edit（読み取り専用表示）で唯一構造が異なる箇所。モードフラグを共有コンポーネントに持ち込まない   |
| D-3 | 共有 build 関数 `buildRecipeFormBody()` は `UpdateRecipeBody` 形（baseServings なし）を返し、new クライアントが baseServings の検証・付加を行う           | `updateRecipeSchema` = `createRecipeSchema` − baseServings という既存契約の形に一致させる                                |
| D-4 | 材料/ステップ行の ID 採番（useRef カウンター）と行操作関数は `RecipeFormFields` 内部へ移動。初期行 ID は両フォームとも index ベース（`ingredient-0`〜）へ | 行 ID は表示されない内部表現であり挙動不変。重複の主因だった行操作ロジックを 1 箇所にする                                |
| D-5 | 材料行削除時の `fieldErrors.ingredients` エントリ削除処理は廃止する                                                                                       | エラーは行 ID キーで参照され、行が消えれば表示されない。次回 submit で errors は全再計算されるため、可視挙動は変わらない |
| D-6 | フィールドエラーの保持・submit 時のエラーバナー・ヘッダー（タイトル/キャンセル先/送信先）は各クライアントに残す                                           | new/edit で正当に異なる箇所。products パターンと同じ分担                                                                 |

## 変更後構成

```
apps/web/src/app/recipes/
├── _components/
│   ├── recipe-form-fields.tsx      # 新規: 共通フィールド + RecipeFormValue / build 関数
│   ├── ingredient-row.tsx          # 変更なし（fields から利用）
│   └── step-row.tsx                # 変更なし（fields から利用）
├── _utils/
│   └── build-ingredient-input.ts   # 変更なし（buildRecipeFormBody から利用）
├── new/_components/
│   └── recipe-form-client.tsx      # 薄いクライアントへ書き換え（ヘッダー + baseServings 入力 + POST）
└── [id]/edit/_components/
    └── recipe-edit-form-client.tsx # 薄いクライアントへ書き換え（ヘッダー + baseServings 表示 + PUT）
```

- `recipe-form-fields.tsx` のエクスポート:
  `RecipeFormValue` / `RecipeFieldErrors` / `emptyRecipeFieldErrors()` /
  `createInitialRecipeFormValue()` / `toRecipeFormValue(dto)` / `buildRecipeFormBody(value)` /
  `RecipeFormFields`（props: `value` / `fieldErrors` / `onChange` / `baseServingsSlot`）
- `buildRecipeFormBody()` は `UpdateRecipeBody` 形を返す（D-3）。new クライアントは
  baseServings を検証して `CreateRecipeBody` に合成する。

## テスト方針

`docs/tests/recipe-form-refactor-test-backfill.md` を正典とする。要点:

- リファクタ前に `build-ingredient-input` の単体テスト（BI-xx）を先行整備し安全網とする。
- フォーム系 RTL テスト（RFC-xx / REF-xx）は「送信 JSON の形」をアサートして現行挙動を固定する。
- 既存 apps/web テスト全件 + 全パッケージテストを回帰範囲とする。

## 変更ファイル一覧

| 区分     | ファイル                                                                     | 内容                            |
| -------- | ---------------------------------------------------------------------------- | ------------------------------- |
| 新規     | `apps/web/src/app/recipes/_utils/build-ingredient-input.node.test.ts`        | B: 単体テスト                   |
| 新規     | `apps/web/src/app/products/_utils/product-format.node.test.ts`               | B: 単体テスト                   |
| 新規     | `apps/web/src/app/recipes/_components/recipe-form-fields.tsx`                | 1: 共通フィールド + build 関数  |
| 書き換え | `apps/web/src/app/recipes/new/_components/recipe-form-client.tsx`            | 1: 共通化後の薄いクライアント   |
| 書き換え | `apps/web/src/app/recipes/[id]/edit/_components/recipe-edit-form-client.tsx` | 1: 共通化後の薄いクライアント   |
| 新規     | recipes 系 `*.test.tsx` × 9・products 系 `*.test.tsx` × 2                    | A: RTL テスト（詳細は試験計画） |

## リスクと対策

- **リフレクタで挙動が変わるリスク** → B のテストを先に入れ、A のテストは「送信 JSON の形」を
  検証して現行挙動を固定する。実装後に `pnpm lint` / `pnpm type-check` / `pnpm test` 全通過を確認
- **見た目の劣化** → JSX は現行の class 文字列を移動するだけで書き換えない
