# ADR-0011: RecipeIngredient の商品参照に ProductId 値オブジェクトを使う

- Status: Accepted
- Date: 2026-07-25
- 関連 feature: productref-to-productid
- 関連 ADR: ADR-0010（案 D を本 ADR で採用）

## Context（背景・なぜ判断が必要か）

ADR-0010 でバレル公開時の名前衝突を避けるため、`RecipeIngredient` 側の商品参照型を
構造的 `interface ProductRef` に一時改名した。その結果、集約をまたぐ ID 参照が
公称型ではなく構造的型になり、`docs/04-domain-model.md` の意図（`ProductId | null`）と
実装が乖離した。

## Decision（採用した決定）

**`RecipeIngredient.productRef` の型を `ProductId | null` とする。`ProductRef` は削除する。**

- プロパティ名は `productRef` のまま（API DTO のフィールド名と対応づける）。
- Application / Infrastructure は `ProductId.fromString` で組み立て、`.value` で永続化・DTO 化する。
- API・DB のワイヤ形式（string | null）は変えない。

## Alternatives（検討した非採用案と却下理由）

### 案 A: `ProductRef` を維持する

却下。型安全性が回復せず、ADR-0010 の残リスクが残る。

### 案 B: プロパティ名も `productId` にリネームする

却下。API・DB・フロント・契約のリネームが広がり、本タスクの「挙動不変」を超える。
名前の整理は必要になった時点で別タスクとする。

### 案 C: Recipe 用の別 VO（例: `RecipeProductId`）を新設する

却下。意味は Product 集約の ID と同じであり、二重定義になる。

## Consequences（良い影響・悪い影響・残るリスク）

良い影響:

- 集約間 ID 参照が公称型になり、誤った文字列ラッパをコンパイル時に拒否できる。
- `docs/04-domain-model.md` と実装が一致する。

悪い影響・コスト:

- テスト・mapper の `{ value: '...' }` を `ProductId.fromString` に書き換える必要がある。

残るリスク:

- プロパティ名 `productRef` と型名 `ProductId` のずれは残る（案 B を先送りしたため）。

## Migration（移行手順）

1. `ProductRef` を削除し、`RecipeIngredient` を `ProductId | null` に変更する。
2. mapper / repository / テストを `ProductId.fromString` に追随する。
3. 冗長な `ProductId.fromString(ingredient.productRef.value)` を直接利用に整理する。
4. `pnpm type-check` / `pnpm test` を通す。

## Rollback（決定を戻す場合の手順）

本変更を含むコミットを `git revert` する。ワイヤ形式は不変のためデータロールバックは不要。

## References

- docs/designs/productref-to-productid.md
- docs/decisions/ADR-0010-package-public-boundary.md（案 D）
- docs/04-domain-model.md（RecipeIngredient）
- `.claude/rules/domain-layer.md`（集約間は ID 参照のみ）
