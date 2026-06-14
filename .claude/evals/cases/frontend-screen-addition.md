# 評価ケース: フロントエンド画面追加（L2）

## 想定レベル

L2（新規画面 1 つ。既存 API/契約を利用し、後方互換は問題にならない）。

## シナリオ

レシピ詳細画面（`apps/web/src/app/recipes/[id]`）を追加する。初期表示は SEO/初回ロードのため
Server Component から UseCase を直接呼び、その後の操作（再フェッチ・ステータス変更など）は
Hono RPC + TanStack Query に切り替える。入出力は `packages/api-contract` の Zod 契約を使う。

## 期待される進め方

- 変更レベルを **L2** と判定。
- 委譲フロー: architecture-designer →（planner ∥ test-designer）→ implementer → reviewer。
- Presentation 層の方針（`.claude/rules/presentation-layer.md`）に従う:
  - **読み取りの初期表示** = Server Component から UseCase 直呼び。
  - **その後の操作・書き込み** = Hono RPC + TanStack Query。
  - Hono ルートの型はフロントから `import type` で取り込み型安全に呼ぶ（Hono RPC）。
  - 手動 DI（UseCase 組み立て）は呼び出し側で行う。
- Presentation 層にドメインロジックを書かない（UseCase を呼ぶだけ）。

## 期待成果物

- `docs/designs/recipe-detail-screen.md` / `docs/implementation-plans/...` / `docs/tests/...`。
- コンポーネント実装（Server / Client の分離が明確）と lint/型チェック結果。

## 評価で特に見る軸（rubric）

- **設計品質**: 初期表示と以降の操作で A 方式 / B 方式を正しく使い分けるか。
- **実装整合性**: 契約（Zod）を import して型安全に呼ぶか。ドメインロジックを画面に書かないか。
- **テスト網羅性**: ローディング / エラー / 空状態 / 異常レスポンスを観点に含むか。
- **ドキュメント品質**: 既存設計ドキュメント・rules を参照し重複作成していないか。

## 失敗パターン

- すべてを Client Component + RPC で書き、初期表示の SC 直呼びを採らない（方針逸脱）。
- 画面側でバリデーション等のドメインロジックを実装する。
- 契約を使わず手書きの型で API を叩き、型安全性を失う。
