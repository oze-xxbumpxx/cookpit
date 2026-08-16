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
E2E は Playwright で、主要導線を feature 単位で整備する。現在はレシピ CRUD と土曜運用フローを
`apps/web/tests/e2e/` で自動化し、Pull Request の CI では Neon または PGlite を使って実行する。

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
- **本番 Neon のリージョンは `ap-southeast-1`（シンガポール）**。sprint-0 の記録に加え、
  2026-08-13 に Neon Console の Project Settings で
  `AWS Asia Pacific 1 (Singapore)` を目視確認した。Vercel の同リージョンは `sin1`。
- **本番 Vercel Function のリージョンは `sin1`（シンガポール）**（PR #158、2026-08-13 マージ）。
  `x-vercel-id` は `pdx1::sin1::...`。Vercel の新規プロジェクト既定は今も `iad1` だが、
  Cookpit 本番は `vercel.json` の `"regions": ["sin1"]` で上書きしている。
  Function↔Neon の 1 往復は、移設前の約 0.20 秒から測定誤差まで縮んだ
  （warm 中央値で vapid と `/api/stores` がどちらも約 0.25 秒。出典: `logs/2026-08-13.md` セッション3）。
  移設前は `pdx1::iad1::...` だった（`logs/2026-07-27.md`）。
- **本番の Drizzle 接続は `neon-http`（HTTPS）**。Sprint 10 Unit B で `neon-serverless`
  の WebSocket `Pool` に切り替えたところ、Vercel `sin1` から Neon へ接続できず
  `GET /api/health` が `db: "error"`、画面は `loading.tsx` のあと RSC digest で落ちた
  （2026-08-13 実測。ADR-0019 ロールバック実行記録）。対話型トランザクションの再導入は
  Preview で接続確認してからにする。
  - **2026-08-15 以降**: 書き込み経路だけ WebSocket に載せる案 S を実装した
    （`docs/designs/uow.md`）。**読み取り・SSR は引き続き `neon-http`** で、ここは変えない。
    切り替えは環境変数 `DB_WRITE_TRANSACTION=on` で、**既定は無効**。未設定なら
    WebSocket 接続を張らないので、上記の障害は再現しない。
  - **`GET /api/health` は書き込み経路を見ていない。** `@/db/client` の `db`（neon-http）を
    直接叩くだけなので、`db: "connected"` が返っても**トランザクション経路が生きている
    証拠にはならない**。案 S の確認には実際の書き込み操作が要る。
  - **2026-08-16 以降: 本番で `DB_WRITE_TRANSACTION=on` が有効**（書き込みのみ WebSocket、
    読み取り・SSR は neon-http）。到達までに本番障害 2 回。詳細は
    [ADR-0020](decisions/ADR-0020-tx-connection-per-request.md) と `logs/2026-08-16.md`。
    - **書き込み用の WebSocket 接続は 1 リクエスト 1 接続。使い回してはいけない。**
      `globalThis` に `Pool` を保持するとソケットがリクエストより長生きし、FaaS の
      インスタンス凍結中に死ぬ。その死亡イベントが**無関係なリクエストを巻き添えにする**
      （読み取りも止まるが、書き込みとの相関は無い）。
    - **`ws` をバンドルすると `bufferutil` 問題を踏む。** Next は `ws` の optional な
      ネイティブ依存 `bufferutil` / `utf-8-validate` を**空モジュールにエイリアス**する。
      `ws` は `require` が throw する前提で JS 実装へフォールバックするため、空モジュールが
      返ると `catch` が働かず、48 バイト以上のフレームで `b.mask is not a function` になる。
      `coalesceWrites` の `setTimeout` 内で起きるので**未捕捉例外＝プロセスごと落ちる**。
      `next.config.ts` の `env: { WS_NO_BUFFER_UTIL: '1' }` で回避している。**この設定を
      外さないこと。** `serverExternalPackages: ['ws']` では回避できない（効果なしを確認済み）。
- **WebSocket 書き込み経路の自動テストは存在しない。** テストは全層 PGlite で、
  `pnpm build` が通ってもバンドルの実行時挙動は検証できない。**`ws` /
  `@neondatabase/serverless` / Next のいずれかを上げたら、Preview で
  `DB_WRITE_TRANSACTION=on` にして書き込みを一巡させること。** 2026-08-13 / 08-16 の
  本番障害 3 件はすべてこの工程の欠落で起きている。**環境変数を変えたら再デプロイが要る**
  （しないと実行中の関数に反映されず、「変更したのに動いた／落ちた」の誤判定になる）。
- **Vercel の `Sensitive` 環境変数は書き込み専用で、値を読み出せない。** ダッシュボードにも
  `Show value` は無く（`Copy to Clipboard` は鍵アイコンで無効）、`vercel env pull` でも
  返らない。`DATABASE_URL` が該当するため、本番の接続文字列が pooled かどうかは
  **リポジトリ側からは確認不能**（`docs/designs/uow.md` U-3）。Neon のリージョンは
  Neon Console 側で確認できる（2026-08-16 時点で AWS `ap-southeast-1`。Vercel は `sin1` で同一メトロ）。
- **本番の Web Push 環境変数（VAPID 3 点 + `CRON_SECRET`）は 2026-08-15 に Production へ設定済み。**
  `GET /api/push/vapid-public-key` は 200。`TZ` は Vercel の予約変数なので設定しない。
  `VAPID_SUBJECT` は `mailto:` か `https://` のみ。メールアドレスだけだと
  `web-push` が `Vapid subject is not a valid URL` を throw し、Cron は
  `{ error: "Internal Server Error" }` になる（未設定時の `Server misconfigured` とは別）。
  出典: `logs/2026-08-15.md`。
- **VAPID 鍵生成は `pnpm dlx web-push generate-vapid-keys`**（または `npx`）。
  `pnpm exec web-push` はローカル `node_modules` に CLI が無いと失敗する。
- **リモート（エフェメラル）環境では `DATABASE_URL` 未設定のため live DB 経路は動かない**。
  画面の手動確認は確認できた項目と BLOCKED（理由つき）を分けて報告し、コードリーディングで
  補完する（出典: `logs/2026-06-26.md` タスク3）。
- **PGlite の dev DB（`.pglite-dev`）を再シードするときは dev サーバーを止めてから行う**。
  起動中に `rm -rf .pglite-dev` して作り直すと、サーバーが削除済みディレクトリのハンドルを
  掴んだまま**古い状態を返し続ける**。「編集前の前提を満たしていないのに PASS に見える」
  という**偽の PASS** を作る（出典: `docs/tests/price-record-edit-and-store-rename.md` §13
  の実施結果。2026-08-06 に実際に誤判定した）。
- **`next build` を実行した後に `next dev` を起動するなら、先に `.next` を消す**。
  本番ビルド成果物が残ったまま dev を起動すると、**実在するページが 404 を返す**
  （ファイルを 1 度触って再コンパイルさせると解消する）。旧経路のページだけが 200 になるため
  **「新しく追加したコードの欠陥」に見える偽の FAIL** を作る（出典:
  `docs/tests/product-detail-performance.md` §手動試験 の実施結果。2026-08-07 に実際に誤診しかけた）。
- **`pnpm build`（`next build --webpack`）の Route 表にはサイズ列（First Load JS）が出ない**。
  バンドルサイズを前後比較するときは `.next/static/chunks/` のファイルを直接測り、
  `client-reference-manifest` の参照有無で初期ロード対象かを判定する（手順は
  `docs/designs/product-detail-performance.md` §バンドルサイズ削減の検証）。
