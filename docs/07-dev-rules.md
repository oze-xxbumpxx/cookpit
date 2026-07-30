# 07. 開発ルール

Google Engineering Practices および Google TypeScript Style Guide から、このプロジェクトに適用するルールを抜粋・整理したもの。

参照元：

- [Google Engineering Practices](https://google.github.io/eng-practices/)
- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)

---

## ブランチ戦略

### ブランチ種別

| プレフィックス | 用途                         | 例                           |
| -------------- | ---------------------------- | ---------------------------- |
| `feature/`     | 新機能の追加                 | `feature/recipe-crud`        |
| `fix/`         | バグ修正                     | `fix/recipe-name-validation` |
| `chore/`       | 環境構築・設定変更・依存更新 | `chore/setup-turborepo`      |
| `refactor/`    | 機能変更なしの内部改善       | `refactor/recipe-repository` |
| `docs/`        | ドキュメントのみの変更       | `docs/update-domain-model`   |

### 運用ルール

- `main` ブランチへの直接コミットは禁止。必ずブランチを切る。
- 1ブランチ = 1スプリントタスク を原則とする。
- スプリント内でのスコープ追加は次スプリントのブランチに送る。

---

## PR（プルリクエスト）ルール

### PR の粒度（Small CLs の原則）

- **1PR = 1つの目的** に絞る。複数の変更を1PRに混ぜない。
- レビュアーが30分以内で理解できる粒度を目安にする。
- 「大きすぎる」と感じたら、タスクを分割してから PR を作る。

### PR の説明

- タイトルは **何をしたか** を簡潔に（例：`feat(recipe): add create recipe use case`）
- 本文には **なぜ変更したか** を書く。What（何を）はコードを読めばわかる。
- スクリーンショット・動作確認結果があれば添付する。

### コードレビュー

- AI 生成コードは必ず Claude Code でレビューしてからコミットする。
- レビューコメントへの対応は「修正した」「なぜ修正しないか」のどちらかを明示する。
- 指摘は人格ではなくコードに向けて書く。

---

## コミットメッセージ規約

[Conventional Commits](https://www.conventionalcommits.org/) に準拠する。

```
<type>(<scope>): <subject>

type:
  feat     新機能
  fix      バグ修正
  chore    ビルド・設定・依存関係
  refactor リファクタリング
  docs     ドキュメント
  test     テスト
  style    フォーマット（機能変更なし）

scope（任意）: recipe | product | meal-plan | shopping-list | pantry | infra | ui

例:
  feat(recipe): add scale ingredients use case
  fix(shopping-list): fix null handling in mark as bought
  chore: setup turborepo and pnpm workspaces
```

---

## TypeScript コーディング規約

### 命名規則

| 対象                               | 規則           | 例                                   |
| ---------------------------------- | -------------- | ------------------------------------ |
| クラス・インターフェース・型・Enum | UpperCamelCase | `RecipeIngredient`, `MealPlanStatus` |
| 変数・関数・メソッド・プロパティ   | lowerCamelCase | `scaleFactor`, `findById`            |
| グローバル定数・Enum 値            | CONSTANT_CASE  | `MAX_SERVINGS`                       |
| ファイル名                         | kebab-case     | `recipe-ingredient.ts`               |

- アンダースコアを接頭辞・接尾辞として使わない（`_name` は禁止）
- 省略語は1単語として扱う（`loadHttpUrl`、`xmlParser` など）

### インポート・エクスポート

- **デフォルトエクスポートは禁止**。名前付きエクスポートのみ使用する。
  - **例外**: Next.js App Router が要求する `app/**/page.tsx` / `layout.tsx` /
    `loading.tsx` / `error.tsx` / `not-found.tsx` / `template.tsx` / `default.tsx`。
    フレームワーク規約のため許可する。
- 型のみのインポートは `import type` を使う。
- 相対インポート（`./`）を優先する。

```typescript
// Good
import type { RecipeId } from './recipe-id';
import { Recipe } from './recipe';

// Bad
import Recipe from './recipe'; // default export は禁止
```

### 型の使い方

- `any` 型は禁止。代わりに `unknown` を使う。
- 型推論に任せてよいが、パブリック API（関数の引数・戻り値）は明示する。
- インターフェースを優先し、型エイリアス（`type`）は Union 型など複合型にのみ使う。
- 配列は `T[]` 記法を優先する（`Array<T>` は複雑な型のみ）。

```typescript
// Good
interface RecipeRepository {
  findById(id: RecipeId): Promise<Recipe | null>;
}

// Good（Union型はtypeで）
type MealPlanStatus = 'draft' | 'shopping' | 'cooking' | 'consuming' | 'completed';
```

### クラス

- `private` / `protected` / `readonly` 修飾子を明示する。
- プライベートフィールドに `#` 記法は使わない（TypeScript の `private` を使う）。
- 再代入しないプロパティは `readonly` を付ける。

```typescript
// Good
export class RecipeId {
  private constructor(private readonly _value: string) {}
}
```

### 制御構造

- `===` / `!==` を使う（`==` / `!=` は禁止）。
- 制御フロー（`if` / `for` など）は必ず中括弧で囲む。
- ループは `for...of` を優先する。`for...in` はオブジェクトの辞書操作のみ。
- 例外は `new Error('message')` で投げる。文字列をそのまま throw しない。

### その他

- セミコロンは付ける。
- `null` と `undefined` の混在を避ける。このプロジェクトでは**「値なし」は `null` に統一**する。

---

## AI ツールへの作業委譲ルール

### Codex に作業を渡す前に

```text
□ Claude Code で実装設計が完了しているか
□ プロジェクトルートの AGENTS.md が最新であるか
□ 関連するドメインモデルのファイルをエディタで開いているか
```

Codex はプロジェクト起動時に `AGENTS.md` を自動で読み込む。
`AGENTS.md` には `docs/` の参照先が明記されており、Codex はそれに従いドキュメントを読んでから実装する。

### Gemini に作業を渡す前に

```text
□ 依頼の目的（調査 / レビュー / 生成）を明示しているか
□ 関連する docs/ ファイルを添付しているか
□ アーキテクチャの制約（Clean Architecture / DDD）を伝えているか
```

### AI 生成コードのレビュー必須化

**Codex 等で生成したコードは、必ず Claude Code でレビューしてからコミットする。**

特に以下の観点を確認する：

- Domain 層に Infrastructure の依存が混入していないか
- `static create()` / `static reconstruct()` のパターンが守られているか
- 集約の境界を越えた参照になっていないか
- UseCase が複数の責務を持っていないか
- 上記の TypeScript 規約に沿っているか

---

## スプリント運用ルール

- スプリント中に追加タスクが発生した場合、**当 Sprint には入れず次 Sprint のバックログに積む。**
- 設計の議論は 1 日以内に収める。長引く場合は「とりあえず動くもの」で進めて後で改善する。

---

## テスト方針

| 対象                                 | テスト種別                            | 方針           |
| ------------------------------------ | ------------------------------------- | -------------- |
| Domain 層（Entity / Value Object）   | ユニットテスト                        | 必須           |
| Application 層（UseCase）            | ユニットテスト（Repository はモック） | 必須           |
| Infrastructure 層（Repository 実装） | 統合テスト（実 DB）                   | 必須           |
| E2E                                  | Playwright スモーク                   | 主要フローのみ |

テストランナーは **Vitest**。全層に導入済み — Domain（単体テスト）/
Application（UseCase テスト）/ Infrastructure（PGlite Repository テスト）/ apps/web
（Hono ルート + RTL。2026-07-01 PR #21）。`pnpm test`（= `turbo test`）で実行する。
E2E は Playwright で、シナリオは feature 単位で整備する。

### テスト配置

- 各 workspace の本番コードは `src/`、テストコードは `tests/` に分離する。
- `tests/` は `src/` のサブディレクトリ構造をミラーする。
- テスト専用のフィクスチャ・テストダブル・DB セットアップも `tests/` に置く。
- 本番コードから `tests/` への依存は禁止する。
- `src/**/*.{test,spec}.{ts,tsx}` は ESLint で禁止し、配置の後戻りを防ぐ。
- apps/web の Vitest は `tests/**/*.node.test.ts` / `tests/server/**/*.test.ts` を node、
  `tests/**/*.dom.test.ts` / `tests/**/*.test.tsx` を DOM テストとして検出する。
- Playwright E2E は `apps/web/tests/e2e/` に置く。

---

## 環境の既知の事実（AI セッション向け・実績由来）

過去セッションで確認済みの環境固有の事実。**日付より古いログの記述はここが優先。**

- **dev サーバーは素の `pnpm dev`（Turbopack）で起動できる**（2026-06-26 の
  `next.config.ts` 修正で Serwist を本番ビルド限定化・commit 473ad09）。それ以前のログに
  ある「`--webpack` フラグ必須」は**解消済みなので従わない**。
- **`randomUUID` は `import { randomUUID } from 'node:crypto'`** を使う。グローバル
  `crypto.randomUUID()` は使わない（`@types/node` 前提。出典: `logs/2026-05-16.md`）。
- **turbo キャッシュは潜在エラーを隠す**: あるパッケージの変更で別パッケージの
  lint / type-check が突然失敗したら、自分の変更が原因と決めつけず base コミットで再現し
  「変更前から存在するエラーか」を確認する（出典:
  `docs/claude-code/improvements/candidates/test-runner-introduction.md` 事象 1）。
- **Neon はコールドスタートで初回レスポンスが 1 秒超**になることがある（個人利用では許容。
  出典: `logs/2026-05-09.md`）。
- **リモート（エフェメラル）環境では `DATABASE_URL` 未設定のため live DB 経路は動かない**。
  画面の手動確認は確認できた項目と BLOCKED（理由つき）を分けて報告し、コードリーディングで
  補完する（出典: `logs/2026-06-26.md` タスク3）。
