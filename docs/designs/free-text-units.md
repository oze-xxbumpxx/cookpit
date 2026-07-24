# 設計書: free-text-units（単位の完全自由記述化）

- ステータス: Proposed（レビュー待ち・2026-07-24）
- レベル: L3
- 関連: Sprint1 確定方針「プリセット固定・カスタム単位なし（型安全性優先）」の**撤回**にあたる。
  `packages/domain/src/shared/unit.ts`（`Unit` 型・`isCountableUnit`）、
  `packages/domain/src/shared/quantity.ts`、`packages/api-contract`（`unitSchema`）、
  改善要望 項目3（`logs/2026-07-23.md` セッション2）。ADR 化を推奨（型安全方針の撤回のため）。
- 要件入力: ユーザーは「完全自由記述への置き換え」を希望（セッション2 で確定方向）。

---

## 背景・目的

単位は現在 17 個のプリセット union 型 `Unit` に固定され、カスタム単位を入力できない。ユーザーは
任意の単位を自由入力したい。`Unit` を文字列へ広げ、全層（Domain / Application / Contract /
Infrastructure / Presentation）で自由記述を許容する。

## 影響範囲（`Unit` を参照する非テストファイル・実測）

- Domain: `shared/unit.ts`（型・`isCountableUnit`）、`shared/quantity.ts`（`Quantity` の単位）、`product/product.ts`。
- Application: `recipe`/`product`/`pantry`/`shopping-list` の各 DTO・mapper、`generate-shopping-list.use-case.ts`
  （集計キー・在庫引き算・`isCountableUnit` による切り上げ）。
- Contract: `recipe`/`product`/`shopping-list`/`pantry` の各 schema（`unitSchema = z.enum(...)`）。
- Infrastructure: `repositories/mappers.ts`（`toUnit` が enum 検証し未知値で throw）。
- Presentation: 単位 SelectField を持つ 4 フォーム（recipe / product / add-item / add-stock）。

DB カラムは既に `text`（`amount_unit` / `package_size_unit` / `default_unit` 等）なので**データ移行は不要**
（enum→string の拡大は後方互換）。

## 設計判断（レビュー対象）

| #   | 論点                                           | 推奨案                                                                                                                                  | 代替                                               |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| U-1 | `Unit` 型                                      | `type Unit = string`（trim 済み・空不可・最大長 20 程度）。ブランド型にはしない（自由記述のため）                                       | ブランド型で最小の型安全を残す（利便性低下）       |
| U-2 | `unitSchema`                                   | `z.string().trim().min(1).max(20)`                                                                                                      | 正規表現で許容文字制限（過剰制約になりやすい）     |
| U-3 | `toUnit` mapper                                | 検証をやめ trim して素通し（未知値で throw しない）                                                                                     | 既知集合のみ許可（自由記述の目的に反する）         |
| U-4 | `isCountableUnit`                              | **既知の可算プリセット集合をヒューリスティックとして保持**。集合に含まれる単位のみ true、未知の自由単位は false（切り上げせず小数保持） | 切り上げ自体を廃止（既存の可算単位の挙動が変わる） |
| U-5 | 集計キー・在庫引き算の単位一致（表記ゆれ対策） | マッチングは**正規化した単位**で行う（`trim` + `NFKC` 正規化。例: 全角ｍｌ→ml、前後空白除去）。**表示は入力原文**を保持                 | 正規化なし（"個" と " 個 " が別集計になる）        |
| U-6 | UI                                             | 単位入力を**自由入力 Input + プリセット候補**（datalist もしくは候補チップ）へ変更。プリセットはワンタップ、任意入力も可                | 完全フリー Input のみ（既存単位の入力が面倒に）    |
| U-7 | `Quantity.add` の単位一致                      | 正規化後の単位が一致するときのみ加算可（不一致は従来どおり例外）。集計は U-5 の正規化キーで束ねる                                       | 生文字列一致（表記ゆれで加算不能が増える）         |

## 変更方針（承認後に実装）

1. Domain: `Unit = string` 化。`normalizeUnit(raw): string`（trim + NFKC）を新設。`isCountableUnit` は既知集合＋
   `normalizeUnit` で判定。`Quantity` は単位を保持しつつ加算時に正規化比較。
2. Contract: `unitSchema` を `z.string().trim().min(1).max(20)` へ。enum 依存の型は自動的に string 化。
3. Infrastructure: `toUnit` を trim 素通しに変更。
4. Application: `generate-shopping-list` の集計キー・在庫引き算・在庫マッチを `normalizeUnit` ベースに。
   `isCountableUnit` 呼び出しは正規化単位で行う。
5. Presentation: 4 フォームの単位 SelectField を「自由入力＋プリセット候補」へ置換。プリセット一覧は
   共有定数（旧 `unitSchema.options` 相当）を候補として残す。

## 対象外

- 単位の換算（g↔kg 等の自動変換）。従来どおり行わない（別単位は別集計）。
- 既存データの正規化バッチ（不要・後方互換）。

## リスク

| #   | リスク                                                        | 対策                                                                            |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| R-1 | 型安全性の低下（Sprint1 方針の撤回）                          | ADR 化して意思決定を残す。`normalizeUnit` と max 長・空チェックで最低限のガード |
| R-2 | 表記ゆれで集計・在庫引き算が割れる                            | U-5 の正規化キー。表示は原文、マッチは正規化。回帰テストで「個/ 個/全角」ケース |
| R-3 | `isCountableUnit` が自由単位を常に非可算扱い→買い物量が小数に | 既知プリセットは従来どおり切り上げ。自由単位は小数許容（仕様として明記）        |
| R-4 | 広範囲変更による回帰                                          | 型変更は段階導入（Domain→Contract→Infra→App→UI）。各段で `pnpm type-check`/test |

## テスト方針（承認後）

- Domain: `normalizeUnit`（trim/NFKC）、`isCountableUnit`（既知=true・自由=false）、`Quantity.add`（正規化一致/不一致）。
- Application: 集計が正規化キーで束なること・自由単位の在庫引き算（切り上げなし）・既知単位の切り上げ維持。
- Contract: `unitSchema` の空 reject・最大長・任意文字許容。
- Presentation: 自由入力＋プリセット候補の入力/送信。
- 実画面: レシピ/在庫/買い物で自由単位を入力→保存→集計まで通る。
