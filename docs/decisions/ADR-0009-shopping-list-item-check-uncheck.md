# ADR-0009: 買い物リストのチェックを価格記録から分離し、チェック解除（bought→pending）を許可する

- Status: Accepted（2026-07-24・ユーザー確定のうえ実装）
- Date: 2026-07-24
- 関連 feature: shopping-list-item-check
- 関連 ADR: なし（S-3 は ADR ではなく `docs/designs/shopping-list-screens.md` 内の確定判断）

## Context（背景・なぜ判断が必要か）

買い物リスト画面の品目チェックは、現状「タップ → `PurchaseInputForm` が下に展開 → 価格・購入店舗を
入力して送信 → 初めて `bought`（購入済み）になる」という2段階フローになっている。

`docs/designs/shopping-list-screens.md` の **S-3**（2026-07-13 ユーザー確定済み）では「チェック解除
（bought→pending）UI・UseCase は実装しない」と定められていた。理由は「既存 API のみで完結させる
L2 の前提を超えるため」。

今回、ユーザーから「アイテムをタップしたら即チェックが付き、買い物完了とわかる軽量な操作」が要望され、
以下 2 点が AskUserQuestion で明示的に確定した。

1. チェック操作は価格・店舗の記録と切り離す（チェック＝軽量フラグ、価格記録は任意・別操作）。
2. チェックは何度でも外せる（トグル可能）。

(2) は S-3 の結論と正面から矛盾するため、S-3 を覆す決定として ADR に残す。

## Decision（採用した決定）

**`ShoppingItem` に `check()` / `uncheck()` を新設し、価格・店舗の記録（既存 `markAsBought`）とは
独立した軽量なチェック操作として扱う。既存 API は無変更のまま維持する。**

1. `ShoppingItem.check(): void` — 価格・店舗に触れず `itemStatus` を `'bought'` にする。
2. `ShoppingItem.uncheck(): void` — `'bought'` からのみ許可。`itemStatus` を `'pending'` に戻し、
   同時に `actualPrice` / `actualStore` を `null` にクリアする（§Consequences で理由を補足）。
3. `ShoppingList` に薄いラッパー `check(itemId)` / `uncheck(itemId)` を追加（`assertActive` ガード付き、
   既存の `markAsBought(itemId, ...)` と同じパターン）。
4. Application 層に `SetItemCheckedUseCase` を新設し、`checked: boolean` で「望む状態」を受け取る
   冪等な Set 操作とする（トグルではなく Set。2人利用時の competing writes でも例外にならないため）。
5. API に `POST /api/shopping-lists/:id/items/:itemId/checked { checked: boolean }` を新設する。
6. **既存の `MarkAsBoughtUseCase` / `markAsBoughtSchema` /
   `POST /api/shopping-lists/:id/items/:itemId/bought`（価格・店舗の記録／訂正）は一切変更しない。**
   価格記録は「チェック済み品目に対する任意の追加操作」として引き続きこのエンドポイントが担う。
7. DB マイグレーションは行わない。`packages/infrastructure/src/db/schema.ts` の
   `actualPriceAmount` / `actualStoreId` は元々 `.notNull()` が付いておらず nullable であることを
   確認済み。「`status='bought'` かつ価格 `NULL`」は既存スキーマで表現可能。

詳細設計は `docs/designs/shopping-list-item-check.md` を正典とする。

## Alternatives（検討した非採用案と却下理由）

| 案                                             | 内容                                                                                               | 却下理由                                                                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A: `markAsBought` の signature を nullable 化  | `markAsBought(price: Money \| null, store: StoreId \| null)` にし、null なら「チェックのみ」を表す | 既存呼び出し元（`MarkAsBoughtUseCase`）の型に影響。同一メソッド名が「チェックのみ」と「価格記録あり」の二重の意味を持ち、null 渡し忘れで既存価格を意図せず消す事故リスクがある |
| B: S-3 現状維持（チェック解除は実装しない）    | 既存方針を変えず、チェックは一方向のみ                                                             | 今回ユーザーが明示的に「外せるようにする」ことを要求しており、要件を満たせない                                                                                                 |
| C: `checked: boolean` 専用の別フィールドを新設 | `itemStatus`（bought/pending/skipped）とは別軸に `checked` フィールドを追加                        | 状態の二重管理になり `itemStatus` との整合ルールが複雑化。DB マイグレーションも必要になり要件 R-6（マイグレーション不要）に反する                                              |
| D（採用）: `check()`/`uncheck()` を新設        | 既存 `markAsBought` は無変更、新規メソッドで軽量チェックを追加                                     | 後方互換を壊さず、既存呼び出し元・テストへの影響ゼロ。メソッド名が操作の意図を直接表す                                                                                         |

## Consequences（良い影響・悪い影響・残るリスク）

- 良: タップ一発でチェック/解除できる軽量な UX を実現しつつ、既存の価格記録機能（`MarkAsBoughtUseCase`
  以下の実装・テスト・契約）を一切変更せずに済む。影響範囲を新規追加のみに限定できた。
- 良: DB マイグレーション不要（既存スキーマの nullable カラムで表現可能）。
- 悪/トレードオフ: `uncheck()` は `actualPrice` / `actualStore` を `null` にクリアする仕様のため、
  「価格を記録した後にうっかりチェックを外す」と価格情報が消える。データ整合性
  （古い価格が黙って買い物完了時の価格記録に使われる事故の防止）を優先した意図的な設計判断であり、
  再入力の手間は「金額を記録」ボタンの再利用で最小化する。
- リスク: Last-Write-Wins のままのため、2人が「チェック」と「解除」をほぼ同時に行うと最後の書き込みが
  勝つ（意味的競合は解消しない）。既存の `markAsBought`/`reassignStore` と同じ設計思想であり、
  本 ADR 固有の新しいリスクではない。
- S-3 の記述（`docs/designs/shopping-list-screens.md` 4箇所）は本 ADR により superseded となる。
  実ファイルへの supersede 注記は本 feature の実装作業に含める。

## Migration（移行）

対象外。DB スキーマ変更なし。既存 API・既存データへの移行操作は不要（既存の `bought` 品目は
`actualPrice`/`actualStore` を保持したまま新機能と共存できる）。

## Rollback（決定を戻す場合）

1. 新設した `ShoppingItem.check()`/`uncheck()`・`ShoppingList.check()`/`uncheck()`・
   `SetItemCheckedUseCase`・`setItemCheckedSchema`・
   `POST /api/shopping-lists/:id/items/:itemId/checked` を削除する。
2. `shopping-item-row.tsx` のタップ挙動を「即トグル」から元の「タップ→展開」に戻す。
3. 既存の `markAsBought` 系（Domain/Application/api-contract/Route）は本 ADR で無変更のため、
   ロールバックは追加分の除去のみで完結する。
4. `docs/designs/shopping-list-screens.md` の supersede 注記を削除し、S-3 の結論を復元する。

## References

- 設計書: `docs/designs/shopping-list-item-check.md`（本 ADR の詳細設計）
- Superseded: `docs/designs/shopping-list-screens.md` S-3（2026-07-13 確定判断）
- 隣接する冪等設計の先例: ADR-0006（生成の冪等化）/ ADR-0007（差分マージ）
- 実装対象: `packages/domain/src/shopping-list/shopping-list.ts` /
  `packages/application/src/shopping-list/` / `packages/api-contract/src/shopping-list.schema.ts` /
  `apps/web/src/server/routes/shopping-lists.ts` /
  `apps/web/src/app/shopping-lists/_components/`
