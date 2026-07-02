# ルール: コーディング規約

適用範囲: 全 TypeScript コード。出典: `docs/07-dev-rules.md` / CLAUDE.md / AGENTS.md。

## 型・構文

- `any` 型は禁止。`unknown` を使う。
- デフォルトエクスポートは禁止。名前付きエクスポートのみ。
- 型のみのインポートは `import type` を使う。
- `===` / `!==` を使う。`==` / `!=` は禁止。
- 「値なし」は `null` に統一する（`undefined` と混在させない）。
- 型は明示する。

## コメント

- コメントは「なぜ（Why）」が非自明な場合のみ書く。
- 「何をしているか（What）」はコメントしない。

## エラーハンドリング

- ドメイン境界（UseCase の入口）でハンドリングする。内部では例外をそのまま投げる。

## 品質ゲート（実装後に必ず実行）

```
pnpm lint
pnpm type-check
pnpm test      # テストランナー: Vitest
pnpm format    # 必要に応じて
```

テストランナーは Vitest。全層に導入済み — Domain（co-located `src/**/*.test.ts`）/
Application（UseCase テスト）/ Infrastructure（PGlite Repository テスト）/ apps/web
（Hono ルート + RTL コンポーネントテスト。2026-07-01 PR #21）。該当パッケージを変更したら
対応するテストを追加・実行する。

## スコープ

- 依頼スコープ外のリファクタリング・改善は行わない。気づきはコメントとして報告する。
