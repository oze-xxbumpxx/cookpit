# ADR-0008: 単位を自由記述（string）にする（Sprint1 のプリセット固定・型安全優先方針を撤回）

- Status: Accepted（2026-07-24・ユーザー承認のうえ実装）
- Date: 2026-07-24
- 関連 feature: free-text-units（改善要望 項目3）
- 関連: `docs/designs/free-text-units.md`、ADR-0005（週定義）等と同じ「MVP の割り切り」系の判断

## Context（背景・なぜ判断が必要か）

Sprint1 では単位を 17 個のプリセット union 型 `Unit`（Zod `z.enum`）に固定し、型安全性を優先して
カスタム単位を許さない方針を確定していた。しかし実運用で「パック」「房」「株」等の単位を入力したい
という要望（項目3）が出た。プリセット固定のままでは表現できず、方針の撤回可否を決める必要がある。

`Unit` 型は Domain / Application / Contract / Infrastructure / Presentation の全層・約 18 ファイルで
参照されており、変更はアーキテクチャ横断の影響を持つ。DB カラムは既に `text` のため物理スキーマ変更は不要。

## Decision（採用した決定）

**単位を自由記述（`type Unit = string`）に広げる。** Sprint1 のプリセット固定方針を撤回する。

1. Domain: `Unit = string`。`normalizeUnit(raw)`（trim + NFKC）を新設。`isCountableUnit` は既知の可算
   プリセット集合をヒューリスティックとして保持し、正規化後に判定する（未知の自由単位は非可算＝切り上げしない）。
   `Quantity.add/subtract` の単位一致判定は正規化して比較する。
2. Contract: `unitSchema = z.string().trim().min(1).max(20)`（空文字拒否・最大 20 文字）。UI 候補用に
   `UNIT_PRESETS`（旧 17 値）を別途 export する。
3. Infrastructure: `toUnit` は enum 検証をやめ、値を素通しする。
4. Application: 材料集計キー・在庫引き算・在庫マッチを `normalizeUnit` ベースにし、表記ゆれ（"個"/" 個 "/
   全角）を同一視する。表示には入力原文を用いる。
5. Presentation: 単位入力を「自由入力 Input + プリセット候補（datalist）」の共通コンポーネント
   `UnitField` に統一する（recipe / product / price-record / add-item / add-stock）。

## Alternatives（検討した非採用案と却下理由）

| 案                               | 却下理由                                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| プリセット固定を維持（現状）     | 要望（項目3）を満たせない。カスタム単位を表現できない                                                    |
| ブランド型で最小の型安全を残す   | 自由記述の目的に対し利便性が下がる。任意文字列を扱う以上、実効的な型安全は限定的                         |
| `isCountableUnit` の切り上げ廃止 | 既存の可算単位（個/本 等）の買い物量挙動が変わる。既知集合ヒューリスティックで従来挙動を維持する方が安全 |
| 単位換算（g↔kg 等）の導入        | スコープ拡大。従来どおり別単位は別集計とする（対象外）                                                   |

## Consequences（良い影響・悪い影響・残るリスク）

- 良: 任意の単位を入力可能。DB 移行不要（text のまま後方互換）。表記ゆれは正規化キーで吸収。
- 悪: コンパイル時の単位の型安全が失われる（string）。`normalizeUnit` と空/最大長チェックが最低限のガード。
- リスク: 自由単位は `isCountableUnit=false` のため買い物量が小数のままになる（仕様として明記）。
  表記が大きく異なる同一単位（例: "パック" と "ぱっく"）は別集計になる（NFKC では吸収されない）。

## Migration（移行）

対象外。DB カラムは既に `text`。既存データ（プリセット値）はそのまま有効な自由記述値として通る。

## Rollback（決定を戻す場合）

1. `unitSchema` を `z.enum(UNIT_PRESETS)` に戻す。`Unit` を union 型へ戻す。
2. `toUnit` の enum 検証を復活。`UnitField` を `SelectField`（プリセット）へ戻す。
   ただし自由入力で保存された非プリセット単位の既存データがある場合、enum バリデーションで
   読み込み時エラーになるため、戻す前に該当データの正規化が必要になる（破壊的）。

## References

- 設計書: `docs/designs/free-text-units.md`
- 実装: `packages/domain/src/shared/unit.ts`（`normalizeUnit`/`isCountableUnit`）、
  `packages/api-contract/src/recipe.schema.ts`（`unitSchema`/`UNIT_PRESETS`）、
  `apps/web/src/components/ui/unit-field.tsx`（`UnitField`）、
  `packages/application/src/shopping-list/ingredient-aggregation.ts`（正規化マッチ）
