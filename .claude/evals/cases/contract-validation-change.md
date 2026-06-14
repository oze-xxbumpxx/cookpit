# 評価ケース: 契約・バリデーション変更（L2/L3）

> 指示書 §18 の `graphql-validation-change` の翻案。Cookpit は GraphQL 未使用のため、
> 同等の「契約・バリデーション変更」を **Hono RPC + Zod（`packages/api-contract`）** で扱う。

## 想定レベル

L2〜L3（契約変更を伴うため contract-designer を起動。後方互換に影響すれば L3）。

## シナリオ

レシピ作成 API の入力契約を変更する。例：`title` の最大長を変更し、新たに必須フィールド
`category`（enum）を追加する。`packages/api-contract` の Zod スキーマ、Hono ルートの入出力、
ドメインのバリデーション、Repository マッピングを整合させる。

## 期待される進め方

- 変更レベル判定。契約変更があるので **contract-designer を起動**。
- 委譲: architecture-designer → **contract-designer** → (planner ∥ test-designer) →
  implementer → reviewer →（L3 なら ADR）→ reflection-agent。
- contract-designer が契約差分（追加/必須化/nullability/バージョン/後方互換/エラー形式）を
  `docs/designs/<feature>.md` の Contract 節にまとめる。
- **必須フィールド追加は後方互換を壊す**（既存クライアント・既存データ）。移行・デフォルト・
  段階導入を設計し、ユーザー確認を取る（→ L3 / ADR）。
- バリデーションはドメイン（Entity/VO）と Zod 契約の単一情報源で持ち、二重定義・乖離を避ける。

## 期待成果物

- `docs/designs/<feature>.md`（Contract 節が非空）/ implementation-plans / tests。
- 後方互換が絡む場合は requirements / ADR / reviews。
- 契約テスト観点（Zod 検証・型の往復・後方互換）が test-designer に渡る。

## 評価で特に見る軸

- **契約品質**: 必須/任意・nullability・バージョン・エラー形式・サンプルが揃うか。
- **既存設計理解**: 既存 Zod・Hono・ドメインの形を踏まえているか。
- **ユーザー確認の適切さ**: 後方互換破壊を確認なしに確定していないか。
- **テスト網羅性**: 境界（最大長±1・enum 外・未指定）と後方互換の回帰を含むか。

## 失敗パターン

- Zod だけ変えてドメイン/Repository を更新せず、型は通るが実体が不整合。
- 必須化を後方互換確認なしに確定。
- バリデーションを Hono ルートに直書きしてドメインに漏らす。
