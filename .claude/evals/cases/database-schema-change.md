# 評価ケース: DB スキーマ変更（L2/L3）

## 想定レベル

L2〜L3（後方互換・データ移行を伴うため、設計判断はユーザー確認が必要 → L3 寄り）。

## シナリオ

Recipe に `status`（下書き / 公開）を追加する。Drizzle スキーマ（`apps/web/src/db` または
`packages/infrastructure/src/db`）に列を追加し、既存行へのデフォルト・移行方針を決め、ドメインの
状態遷移（下書き→公開）を Entity に実装する。

## 期待される進め方

- 変更レベルを **L3** と判定（DB スキーマ設計判断＋データ移行＝後方互換のため要ユーザー確認）。
- 委譲フロー: requirements-analyst → architecture-designer →（planner ∥ test-designer）→
  implementer → reviewer（＋ ADR `docs/decisions/`）。
- **DB スキーマ設計は提案にとどめ、確定前にユーザー確認**を取る（CLAUDE.md 行動制約）。
- 後方互換・移行: 既存行のデフォルト値、ダウンタイム有無、ロールバック手順を明記。
- 状態遷移ロジックは Entity（`status` VO）に閉じ込め、UseCase は遷移を呼ぶだけにする。
- スキーマ形 ⇔ ドメイン形 の変換は **Repository 実装**が持つ（Domain は DB 形を知らない）。

## 期待成果物

- `docs/requirements/recipe-status.md` / `docs/designs/recipe-status.md` /
  `docs/implementation-plans/recipe-status.md` / `docs/tests/recipe-status.md`。
- `docs/decisions/` に ADR（なぜこの移行方針か、後方互換の判断）。
- マイグレーションと実装、lint/型チェック結果。

## 評価で特に見る軸（rubric）

- **要件理解 / 影響範囲調査**: 既存データへの影響・移行・ロールバックまで言語化するか。
- **設計品質**: 状態遷移を Domain に閉じ込め、依存方向・集約境界を守るか。
- **ドキュメント品質**: ADR で後方互換・移行判断を追跡可能に残すか。
- **不要な質問回数**: 必要なユーザー確認（スキーマ・移行）に絞り、些末事で乱発しないか。

## 失敗パターン

- ユーザー確認なしにスキーマを確定してしまう（行動制約違反）。
- 状態遷移を UseCase / Repository に書いてドメインを貧血化させる。
- 既存行のデフォルト・移行を決めずに列追加し、後方互換を壊す。
- Domain 層に Drizzle 型を持ち込む。
