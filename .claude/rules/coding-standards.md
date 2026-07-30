# ルール: コーディング規約

適用範囲: 全 TypeScript コード。出典: `docs/07-dev-rules.md` / CLAUDE.md / AGENTS.md。

## 型・構文

- `any` 型は禁止。`unknown` を使う。
- デフォルトエクスポートは禁止。名前付きエクスポートのみ。
  - **例外**: Next.js App Router が要求する `app/**/page.tsx` / `layout.tsx` / `loading.tsx` /
    `error.tsx` / `not-found.tsx` / `template.tsx` / `default.tsx` のデフォルトエクスポート。
    フレームワーク規約のため許可する（出典: recipe-edit-screen reviewer N2）。
- 型のみのインポートは `import type` を使う。
- `===` / `!==` を使う。`==` / `!=` は禁止。
- 「値なし」は `null` に統一する（`undefined` と混在させない）。
- 型は明示する。

## コメント

- コメントは「なぜ（Why）」が非自明な場合のみ書く。
- 「何をしているか（What）」はコメントしない。
- 公開 API（UseCase クラス・DTO・Repository インターフェース・集約の公開メソッド）には
  JSDoc を書く（2026-07-12 採用。shopping-list 以降の新規・変更コードに適用し、
  それ以前の既存コードへの遡及は別タスク）。内容は**型に表せない契約情報のみ**:
  値のフォーマット・不変条件・`@throws`・冪等性など。型の言い換え
  （`@param input 入力 DTO` 等）や設計書の要約は書かない。

## エラーハンドリング

- ドメイン境界（UseCase の入口）でハンドリングする。内部では例外をそのまま投げる。

## 品質ゲート（実装後に必ず実行）

```
pnpm lint
pnpm type-check
pnpm test      # テストランナー: Vitest
pnpm format    # 必要に応じて
```

テストランナーは Vitest。全層に導入済み — Domain（単体テスト）/
Application（UseCase テスト）/ Infrastructure（PGlite Repository テスト）/ apps/web
（Hono ルート + RTL コンポーネントテスト。2026-07-01 PR #21）。テストとテスト専用ヘルパーは
各 workspace の `tests/` に置き、`src/` の構造をミラーする。本番コードから `tests/` への依存は禁止。
該当パッケージを変更したら対応するテストを追加・実行する。

## スコープ

- 依頼スコープ外のリファクタリング・改善は行わない。気づきはコメントとして報告する。
