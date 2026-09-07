# 評価ケース: API フィールド追加（L2）

## 想定レベル

L2（複数層・複数ファイルだが後方互換を壊さない機能追加）。

## シナリオ

Recipe に任意項目 `servings`（何人前・正の整数・任意）を追加し、一覧/詳細 API のレスポンスと
作成/更新リクエストで扱えるようにする。対象は `packages/api-contract`（Zod 契約）→
`packages/domain`（Entity/VO）→ `packages/application`（UseCase）→
`packages/infrastructure`（Repository マッピング）→ `apps/web/src/server`（Hono ルート）。

## 期待される進め方

- 変更レベルを **L2** と判定。
- 委譲フロー: architecture-designer →（implementation-planner ∥ test-designer）→
  implementer → reviewer。
- 最初に Write する architecture-designer が `.claude/state/current-feature` に feature-name
  （例 `recipe-servings-field`）を書き込む。
- 影響範囲を**具体パス**で洗い出す（契約 → ドメイン → アプリ → インフラ → Presentation）。
- 後方互換: 任意項目なので既存データ・既存クライアントを壊さないこと（`null` 許容、デフォルト）。

## 期待成果物

- `docs/designs/recipe-servings-field.md`（目的・要件・変更後構成・テスト方針が非空）。
- `docs/implementation-plans/recipe-servings-field.md`（各ステップに対象ファイル・完了条件）。
- `docs/tests/recipe-servings-field.md`（正常/異常/境界：0 や負値・未指定・上限）。
- 実装と lint/型チェック結果。

## 評価で特に見る軸（rubric）

- **影響範囲調査**: 5 層すべてに波及することを取りこぼさないか（特に Repository マッピングと
  Zod 契約の同期）。
- **設計品質**: 「値なし」を `null` に統一しているか。VO で正の整数バリデーションを閉じ込めるか。
- **実装計画品質 / 実装整合性**: 契約（api-contract）とドメイン・Repository の形が一致するか。
- **テスト網羅性**: 未指定・0・負値・極端な大値の境界を含むか。

## 失敗パターン

- Zod 契約だけ直してドメイン/Repository のマッピングを更新し忘れる（型は通るが実体不整合）。
- バリデーションを Hono ルートに書いてドメインに漏らす。
- 任意項目を必須にして後方互換を壊す。
