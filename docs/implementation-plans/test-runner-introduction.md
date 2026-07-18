# 実装計画: test-runner-introduction

- 前提となる設計書: docs/designs/test-runner-introduction.md
- レベル: L2

## 変更対象ファイル

- `packages/config/package.json` … `exports` に `./vitest/*` を追加し、共有 Vitest base を公開。
  Vitest を devDependency に追加（base 設定が `vitest/config` を import するため）。
- `packages/domain/package.json` … `test` スクリプトと Vitest devDependency を追加。
- `turbo.json` … `test` タスクを追加（pnpm test を turbo 経由で実行可能にする）。
- `package.json`（ルート） … `test` スクリプト（`turbo test`）を追加。
- `.claude/scripts/run-quality-gates.sh` … `test` ゲートを `--all` 時のみでなく既定でも実行する
  （domain に test スクリプトが実在するようになるため）。
- `docs/07-dev-rules.md` / `.claude/rules/coding-standards.md` / `CLAUDE.md` …
  「テスト未導入（MVP1）」記述を「導入済み（domain から）」へ更新（保護ファイル・承認済み）。

## 新規作成ファイル

- `packages/config/vitest/base.ts` … 共有 Vitest base 設定（node 環境・globals 無効・include 規約）。
- `packages/domain/vitest.config.ts` … base を mergeConfig で取り込む domain 用設定。
- `packages/domain/src/shared/quantity.test.ts` … Quantity の単体テスト。
- `packages/domain/src/recipe/recipe-ingredient.test.ts` … RecipeIngredient の単体テスト。
- `packages/domain/src/recipe/recipe.test.ts` … Recipe の単体テスト。
- `packages/domain/src/recipe/recipe-id.test.ts` … RecipeId の単体テスト。

## ファイルごとの変更内容

### packages/config/vitest/base.ts（新規）

- 変更内容: `defineConfig`（`vitest/config`）で `test.environment='node'` / `test.globals=false` /
  `test.include=['src/**/*.test.ts']` を持つ base 設定を名前付き export（default export 禁止規約に従う）。
- 完了条件: 他パッケージから import して mergeConfig できる。

### packages/config/package.json

- 変更内容: `exports` に `"./vitest/*": "./vitest/*.ts"` を追加。`devDependencies` に `vitest` を追加。
- 完了条件: `@cookpit/config/vitest/base` が解決できる。

### packages/domain/vitest.config.ts（新規）

- 変更内容: base 設定を取り込む（`mergeConfig(baseConfig, defineConfig({...}))`）。domain 固有の
  上書きが不要なら base をそのまま再公開。
- 完了条件: `pnpm --filter @cookpit/domain test` がこの設定で起動する。

### packages/domain/package.json

- 変更内容: `scripts.test = "vitest run"` を追加。`devDependencies` に `vitest` と
  `@cookpit/config`（既存）を確認。
- 完了条件: `pnpm --filter @cookpit/domain test` が通る。

### packages/domain/src/\*_/_.test.ts（新規）

- 変更内容: 試験計画（docs/tests/test-runner-introduction.md）の観点を実装。`vitest` から
  `describe/it/expect` を明示 import。本番コードは import するのみで変更しない。
- 完了条件: 全テストが green。

### turbo.json

- 変更内容: `tasks.test` を追加。`outputs` は無し（レポート生成しない）、`inputs` は既定。
  `dependsOn` は付けない（domain はビルド不要）。
- 完了条件: `pnpm test`（= `turbo test`）が domain のテストを実行する。

### package.json（ルート）

- 変更内容: `scripts.test = "turbo test"` を追加。
- 完了条件: ルートで `pnpm test` が動く。

### .claude/scripts/run-quality-gates.sh

- 変更内容: `tests（実在時のみ）` ブロックを `--all` 限定から外し、`has_script test`（ルートに
  test がある）なら既定でも実行する。実在しなければ従来どおり SKIP。
- 完了条件: `bash .claude/scripts/run-quality-gates.sh` の出力に test ゲートの PASS が出る。

### docs/07-dev-rules.md / .claude/rules/coding-standards.md / CLAUDE.md

- 変更内容: 「テスト未導入（MVP1）」「テストランナー導入後は…」という条件付き記述を、
  「domain 層は Vitest で単体テスト済み。新規/変更時は該当テストを追加・実行する」へ更新。
- 完了条件: 記述が現状（domain にテスト有り）と矛盾しない。

## 実装手順

1. 共有 base 設定 … `packages/config/vitest/base.ts` 作成 + `packages/config/package.json` の
   exports / devDeps 更新。完了条件: base が import 可能。
2. domain 設定 … `packages/domain/vitest.config.ts` 作成 + `packages/domain/package.json` に
   test スクリプト/依存追加。完了条件: domain で空テストでも runner が起動。
3. 依存インストール … `pnpm install`。完了条件: vitest が node_modules に入る。
4. テスト実装 … domain の 4 テストファイルを試験計画に沿って作成。完了条件: 全 green。
5. 配線 … `turbo.json` の test タスク、ルート `package.json` の test スクリプト追加。
   完了条件: `pnpm test` が通る。
6. 品質ゲート更新 … `run-quality-gates.sh` の test ゲート既定実行化。完了条件: ゲート出力に test。
7. ドキュメント更新 … dev-rules / coding-standards / CLAUDE.md の記述更新。完了条件: 矛盾解消。
8. 検証 … `pnpm lint` / `pnpm type-check` / `pnpm test` が全て通る。

## 依存関係

- 手順 1 → 2 → 3 → 4 の順（base が無いと domain 設定が解決できない / install 前は runner 不在）。
- 手順 5・6・7 は 4 の green 後。
- 手順 8 は最後。

## テスト計画

詳細は docs/tests/test-runner-introduction.md。追加テストは `packages/domain/src/**/*.test.ts` に
co-located。Quantity / RecipeIngredient / Recipe / RecipeId の正常系・異常系・境界値を網羅。

## リスク

- Vitest と NodeNext の解決差異（拡張子なし import）→ Vitest 既定で解決可能。type-check と
  ランナーの二系統は受容。
- co-located テストが `tsc --noEmit`（include: src）/ `eslint src` に巻き込まれる →
  Vitest 型は明示 import で完結させ、必要時のみ lint 緩和。type-check は green を維持する。
- turbo test キャッシュの誤り → 初期は保守的に（outputs 無し）。
- 保護ファイル更新 → 承認済み（2026-06-24）。

## ロールバック方法

- 追加ファイル（config/vitest, domain の \*.test.ts, vitest.config.ts）の削除と、
  package.json / turbo.json / run-quality-gates.sh / docs の該当差分の revert で原状復帰。
- 追加のみの変更のため本番挙動への影響なし。単一コミットにまとめ revert 容易にする。

## ドキュメント更新対象

- `docs/07-dev-rules.md`（品質ゲートにテスト追加）。
- `.claude/rules/coding-standards.md`（品質ゲート節）。
- `CLAUDE.md`（完了条件・品質ゲートの記述）。
- ADR 候補: テストランナー選定（Vitest）を `docs/decisions/` に残すかは任意（本フェーズでは未作成、
  必要なら後続で create-adr）。
