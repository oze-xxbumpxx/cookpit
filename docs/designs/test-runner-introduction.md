# 設計書: test-runner-introduction

- ステータス: confirmed
- レベル: L2
- 関連: なし（要件定義書は本フェーズでは作成せず、本設計書に内包） / 関連 ADR: 新規 ADR 候補（テストランナー選定）

## 背景

harness engineering の段階導入における **Phase 2（検証ループの確立）**。Phase 1 で取得した
eval ベースライン（`.claude/evals/baselines/INDEX.md`）では、全15軸中で最弱が
**テスト網羅性（平均 2.6）** であり、その根因が「MVP1 でテストランナー未導入」という
**構造的制約**であると明記された。lint / type-check は存在するが、振る舞いを検証する
自動テストが無いため、implementer もレビュアーも「コードが意図どおり動くか」を機械的に
確認できない。これは harness engineering の中核原則（tight feedback loop）の欠落にあたる。

## 目的

ドメイン層を起点に**自動テストによる検証ループを確立**し、エージェント（implementer）と
人間の双方が振る舞いを機械的に検証できる状態を作る。具体的には、(1) テストランナーを導入し、
(2) 既存の品質ゲート（`run-quality-gates.sh`）と完了条件にテスト実行を組み込み、
(3) 最も純粋でテスト価値の高い `packages/domain` の Entity / Value Object に単体テストを与える。
本フェーズではテストランナーの「基盤」と「最初のテスト群」を導入し、他層への展開は後続とする。

## 要件

- TypeScript（`module: NodeNext` / `target: ES2022`）を**ビルドなしで直接実行**できる
  テストランナーであること（domain は `main: ./src/index.ts` でソースを直接参照する構成）。
- 設定は共有パッケージ `@cookpit/config` に base を置き、各パッケージは薄く extends する
  （既存の TypeScript / ESLint 設定の共有パターンに揃える）。
- パッケージ単位の `test` スクリプト、Turborepo の `test` タスク、ルートの `test` スクリプトを
  追加し、`pnpm test` で全パッケージのテストが走ること。
- `run-quality-gates.sh` の既存 `test` ゲート（現状 `unavailable (MVP1 未導入)` で SKIP）が
  実際に走るようにする。
- `packages/domain` の Recipe / RecipeIngredient / Quantity 等に、正常系・異常系・境界値を
  含む単体テストを与える。
- **本番コードの振る舞いは変更しない**（テストは現状の振る舞いを記述・固定するもの）。

## 対象範囲

- 新規: `@cookpit/config` への Vitest base 設定、`packages/domain` のテストファイルと
  `vitest.config.ts`、`turbo.json` の `test` タスク、ルート `package.json` の `test` スクリプト。
- 変更: `packages/domain/package.json`（`test` スクリプトと devDependency 追加）、
  `.claude/scripts/run-quality-gates.sh`（既定で test ゲートを実行）。
- ドキュメント: `docs/07-dev-rules.md` / `.claude/rules/coding-standards.md` / `CLAUDE.md` の
  「テスト未導入」記述の更新（**保護ファイル**を含むため未決事項で承認確認）。

## 対象外

- `application` / `infrastructure` / `api-contract` / `apps/web` のテスト（後続フェーズ）。
- 結合テスト・E2E・カバレッジ閾値の強制（後続フェーズ）。
- CI（GitHub Actions 等）連携（別途。本フェーズはローカル検証ループの確立に限定）。
- ドメインロジックの修正・バグ修正（テストは**現状の振る舞いを記述**する。仕様バグが
  見つかった場合は別タスクとして切り出し、本フェーズでは修正しない）。

## 現状構成

- 品質ゲートは `lint`（turbo lint）/ `type-check`（turbo type-check）のみ。
- `run-quality-gates.sh` は `test` を `has_script test` で判定し、未定義のため
  `SKIP (unavailable (MVP1 未導入))` を出す。
- `@cookpit/config` が `typescript/*.json` と `eslint/*.mjs` を `exports` で共有。
- domain は build を持たず、`main`/`types` が `src/index.ts` を直接指す。

## 変更後構成

- テストランナー = **Vitest**（推奨。選定理由と代替は「未決事項」参照）。
- `@cookpit/config` に `vitest/base.ts` を追加し `exports` に `./vitest/*` を公開。
- `packages/domain/vitest.config.ts` が base を extends（または mergeConfig）。
- `packages/domain/package.json` に `"test": "vitest run"` と devDependency（vitest）を追加。
- `turbo.json` に `test` タスク（`dependsOn: ["^build"]` は domain がビルド不要のため付けず、
  キャッシュ入力を明示）。ルート `package.json` に `"test": "turbo test"`。
- テストは **co-located**（`src/**/*.test.ts`）に置き、`vitest` から明示 import する
  （`globals` は使わない＝既存の明示志向・`import type` 規約に整合）。

## データフロー

対象外（実行時のデータフロー変更なし。テスト追加のみ）。

## API 設計

対象外（API 変更なし）。

## DB 設計

対象外（スキーマ変更なし）。

## フロントエンド設計

対象外（本フェーズでは web 層を扱わない）。

## バックエンド設計

対象外（UseCase / Repository の変更なし。テスト対象は domain の純粋ロジック）。

## エラー処理

本番コードのエラー処理は変更しない。テストは**既存の例外送出を検証**する:
- `Recipe.create`: 名前空白 / `baseServings <= 0` / `cookingTime < 0` で throw。
- `Quantity.of`: 負値で throw。
- `RecipeIngredient.create`: `displayName` 空 / `amount` と `amountNote` の排他違反で throw。

## ログと監視

ログ出力の変更なし。テスト結果は `run-quality-gates.sh` のサマリ（PASS/FAIL/SKIP）に
反映され、品質ゲートの可視化に寄与する。

## セキュリティ

- テストコードに秘密情報・本番接続情報を含めない（domain は外部依存ゼロのため発生しない）。
- Vitest は devDependency に限定し、本番バンドルに含めない。

## 性能

- Vitest は Vite ベースで TS を直接実行でき、domain の純粋ロジックでは実行は軽量。
- `turbo test` のキャッシュは入力（src / テスト / 設定）を明示し、変更が無ければキャッシュ
  ヒットさせる。失敗結果はキャッシュしない（turbo 既定の挙動に従う）。

## テスト方針

- ランナー: Vitest（`vitest run` を CI/ゲート用、`vitest`(watch) を開発用）。
- 配置: `packages/domain/src/**/*.test.ts`（co-located）。`vitest` から `describe/it/expect` を
  明示 import。
- 対象と観点（正常系・異常系・境界値）:
  - `Quantity.of`: 正（正値）/ 異（負値 throw）/ 境界（0 は許容）。`multiply` のスケール。
  - `RecipeIngredient.create`: 正（amount のみ / amountNote のみ）/ 異（displayName 空、
    amount と amountNote の両立・両欠如）。`scale`（amount=null は自身を返す / amount ありは
    Quantity.multiply 経由でスケールし amountNote を null 化）。
  - `Recipe.create`: 正（最小入力・デフォルト適用）/ 異（名前空白、baseServings<=0、
    cookingTime<0）/ 境界（cookingTime=0 は現状**許容される**＝現状仕様として固定）。
    `rename` / `updateCookingTime`（負値 throw）/ `scaleIngredients`（各 ingredient へ委譲）/
    ゲッターの防御的コピー（配列・Date を外部から変更できない）。
  - `RecipeId.generate` / `reconstruct`（ID 生成・復元の往復）。
- カバレッジ閾値は本フェーズでは**強制しない**（後続で導入検討）。まず domain コアの
  振る舞いを固定することを優先する。

## 移行とリリース

- 追加のみ（additive）で後方互換を壊さない。データ移行なし。
- 導入後、開発者は `pnpm test` を実行できる。`run-quality-gates.sh` が test を含むようになる。
- 既存の lint / type-check の挙動は変えない。

## リスク

- **Vitest と NodeNext の解決差異**: Vite/Vitest は TS を直接解決するため通常問題ないが、
  相対 import の拡張子（NodeNext は `.js` 拡張子を要求しうる）と齟齬が出る可能性。
  → domain は拡張子なし import（`./recipe-id`）で運用されており、Vitest 既定で解決可能。
  type-check（tsc）とランナー（Vitest）で解決系が二系統になる点は受容する。
- **`exactOptionalPropertyTypes` 等の strict 設定**: テストコードも同じ strict 下で書く必要が
  ある。→ テストは型に忠実に記述する。
- **co-located テストの type-check / lint 巻き込み**: `tsc --noEmit`（include: src）と
  `eslint src` がテストファイルも対象にする。→ Vitest 型を tsconfig の types に追加せず
  明示 import で完結させ、lint はテスト向け緩和を最小限に留める（必要時のみ）。
- **Turbo キャッシュの正しさ**: `test` タスクの inputs/outputs 設定を誤ると古い結果を返す。
  → 入力を明示し、まず保守的に設定する。
- **保護ファイル更新**: `CLAUDE.md` / rules の「テスト未導入」記述更新は改善サイクルの
  承認境界に該当（未決事項で確認）。

## 未決事項

すべてユーザー確認済み（2026-06-24）。

1. **テストランナー選定**: **Vitest** に決定。理由＝TS/ESM をビルドなしで直接実行でき設定が
   最小、Vite エコシステムと親和、Jest 互換 API。
2. **テスト配置**: **co-located**（`src/**/*.test.ts`）に決定。
3. **保護ファイルの更新可否**: `CLAUDE.md` / `docs/07-dev-rules.md` /
   `.claude/rules/coding-standards.md` の「テスト未導入（MVP1）」記述を「導入済み（domain から）」へ
   **更新する**ことを承認済み。
