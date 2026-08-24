# 実装計画: shopping-list-pantry-coverage

- 前提となる設計書: docs/designs/shopping-list-pantry-coverage.md
- レベル: L2
- 実装ルート: Orchestrator（implementer）
- 判断理由: 既定（Presentation 中心・既存パターン踏襲。docs/06-ai-tools.md）

## 変更対象ファイル

| path                                                                            | 理由                       |
| ------------------------------------------------------------------------------- | -------------------------- |
| `packages/application/src/shopping-list/shopping-list.dto.ts`                   | 新フィールド型             |
| `packages/application/src/shopping-list/shopping-list.mapper.ts`                | null パススルー            |
| `packages/api-contract/src/shopping-list.schema.ts`                             | response schema            |
| `packages/api-contract/tests/shopping-list.schema.test.ts`                      | 契約テスト更新             |
| `apps/web/src/app/shopping-lists/_components/shopping-item-row.tsx`             | 部分控除ヒント             |
| `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`          | state・empty・Sync/refetch |
| `apps/web/tests/app/shopping-lists/_components/shopping-list-test-fixtures.ts`  | ファクトリ既定値           |
| `apps/web/tests/app/shopping-lists/_components/shopping-list-client.*.test.tsx` | 観点追加                   |

## 新規作成ファイル

| path                                                                                          | 役割                       |
| --------------------------------------------------------------------------------------------- | -------------------------- |
| `apps/web/src/app/shopping-lists/_components/covered-ingredients-section.tsx`                 | 「在庫で足りる」折りたたみ |
| `apps/web/tests/app/shopping-lists/_components/shopping-list-client.pantry-coverage.test.tsx` | カバー UI 試験             |
| `docs/designs/shopping-list-pantry-coverage.md`                                               | 設計書                     |
| `docs/implementation-plans/shopping-list-pantry-coverage.md`                                  | 本計画                     |
| `docs/tests/shopping-list-pantry-coverage.md`                                                 | 試験計画                   |

## ファイルごとの変更内容

### packages/application/src/shopping-list/shopping-list.dto.ts

- 変更内容: `pantryDeductedAmount` / `CoveredIngredientDto` / `coveredIngredients` を追加
- 完了条件: 型が設計 D-4 と一致し export される

### packages/application/src/shopping-list/shopping-list.mapper.ts

- 変更内容: `toShoppingItemDto` / `toShoppingListDto` で常に `null` を埋める
- 完了条件: 既存 UseCase テストが型エラーなく通る

### packages/api-contract/src/shopping-list.schema.ts

- 変更内容: response schema に同フィールド（`.nullable().default(null)`）
- 完了条件: キー欠落でも parse 成功、DTO 往復が成功

### shopping-item-row.tsx

- 変更内容: `pantryDeductedAmount !== null` のとき数量下に「在庫で {value}{unit}」
- 完了条件: チェック size-6 維持・バッジなし

### covered-ingredients-section.tsx

- 変更内容: 既定閉じの折りたたみ。チェックなし。件数サマリ
- 完了条件: StoreGroup と独立して描画

### shopping-list-client.tsx

- 変更内容: `coveredIngredients` state。Sync/refetch で置換。D-6 empty-state 分岐。カバー節を StoreGroup 下に配置
- 完了条件: 設計 P-1/D-5/D-6 を満たす

## 実装手順

1. DTO + schema + mapper + fixtures
2. row ヒント + covered section
3. client wiring（state / Sync / refetch / empty）
4. Vitest 追加・更新
5. `pnpm --filter @cookpit/web type-check` と関連テスト

## テスト計画

`docs/tests/shopping-list-pantry-coverage.md` を正とする。DOM 試験は
`shopping-list-client.pantry-coverage.test.tsx` に集約。

## リスクとロールバック

- リスク: バックエンド未着で常に null → UI 差分なしで安全
- ロールバック: 新コンポーネントとフィールド追加を revert

## ドキュメント更新対象

- 本 feature の designs / implementation-plans / tests（上記）
- 恒久 docs（01〜08）は更新しない
