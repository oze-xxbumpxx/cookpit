# 設計書: shopping-list-pantry-coverage

- ステータス: confirmed（P-1/P-2/P-3・D-4/D-5/D-6 ユーザー確定）
- レベル: L2
- 関連: `docs/designs/pantry-shopping-integration.md`（生成時引き算）/
  `docs/designs/shopping-list-screens.md`（詳細 UI）/
  `docs/designs/meal-plan-shopping-sync.md`（Sync）

## 背景

在庫引き算（`applyPantryDeduction`）は生成・Sync 時に既に動作している。全量カバーされた材料は
`ShoppingItem` にならず、部分控除は買う量だけが行に載る。しかし詳細画面では「在庫で足りた／一部
まかなった」ことが見えず、土曜の買い物中に「あるものは買わない」が伝わらない。

## 目的

買い物リスト詳細 UI に、Generate/Sync 時点のスナップショットとして保存された在庫控除情報を
可視化する。控除ルール自体は変えない。

## 要件

1. 部分控除: 行数量の下に muted 文言「在庫で {value}{unit}」（バッジ不可・チェック size-6 維持）。
2. 全量カバー: 折りたたみ節「在庫で足りる」（既定閉じ）。チェック不可・楽観更新/オフラインキュー対象外。
3. 「やっぱり買う」操作は設けない。
4. GET は現在の Pantry を再計算しない（スナップショットを返すのみ）。
5. レガシーリスト（フィールド null）はヒントも折りたたみも出さない。
6. `items.length === 0` かつ `coveredIngredients` に要素があるときは EmptyState
   「リストにアイテムがありません」を出さず、カバー節を出す。

## 対象範囲

- Application DTO / Mapper（新フィールドの型と、未永続化時の `null` パススルー）
- api-contract の response schema（GET/Sync が運ぶ形）
- Presentation: `shopping-list-client` / `shopping-item-row` / カバー節コンポーネント
- 上記の Vitest（DOM）

## 対象外

- `applyPantryDeduction` のロジック変更・単位換算
- Domain 集約への新プロパティ追加・永続化・Drizzle マイグレーション（別バックエンドタスク）
- 「やっぱり買う」アクション
- amountNote のみの材料のカバー配列への掲載（数量なしは控除対象外の既存仕様）

## 現状構成

```
Generate/Sync → applyPantryDeduction → ShoppingItem（買う量のみ）→ toShoppingListDto → UI
                                              ↑ 全量カバーはアイテム化されない（見えない）
                                              ↑ 部分控除量も DTO に載らない
```

## 変更後構成

```
Generate/Sync（別タスクでスナップショット永続化）
  → DTO: items[].pantryDeductedAmount / coveredIngredients
  → GET/Sync はそのまま返す（再計算しない）
  → UI: 行ヒント + 「在庫で足りる」折りたたみ + empty-state 分岐
```

本フロントエンド切片では、永続化が未着でも Mapper が常に `null` を出し、UI は null 安全に描画する。

## データフロー

1. 初期表示: Server が渡す `ShoppingListDto` の `items` と `coveredIngredients` を Client state に保持。
2. Sync 成功: `setItems(dto.items)` と同時に `setCoveredIngredients(dto.coveredIngredients)`。
3. Refetch（更新ボタン / focus）成功: items は既存の pending キュー優先マージを維持しつつ、
   `coveredIngredients` はサーバー値で置換（カバー節はキュー対象外）。

## API 設計

既存 GET / Sync レスポンス形（`ShoppingListDto` / `shoppingListResponseSchema`）にフィールド追加。

| フィールド                             | 型                                      | 意味                                               |
| -------------------------------------- | --------------------------------------- | -------------------------------------------------- |
| `ShoppingItemDto.pantryDeductedAmount` | `{ value: number; unit: Unit } \| null` | 部分控除量。なし/レガシーは null                   |
| `ShoppingListDto.coveredIngredients`   | `CoveredIngredientDto[] \| null`        | 全量カバーのスナップショット。なし/レガシーは null |

`CoveredIngredientDto`: `{ displayName, productId, requiredAmount, coveredAmount }`。
数量形は既存 `requiredAmount` と同じ `{ value, unit }`。

Zod はキー欠落も `null` に寄せる（段階的ロールアウト用 `.nullable().default(null)`）。

## DB 設計

**対象外（本切片）。** 永続化・マイグレーションはバックエンド別タスク。

## フロントエンド設計

### P-x（確定）

| #   | 確定                                                                 |
| --- | -------------------------------------------------------------------- |
| P-1 | 全量カバーは「在庫で足りる」折りたたみ。非チェック・非楽観・非キュー |
| P-2 | 部分控除は数量下の muted「在庫で n」（バッジではない）               |
| P-3 | 「やっぱり買う」なし                                                 |

### D-x（確定）

| #   | 確定                                                    |
| --- | ------------------------------------------------------- |
| D-4 | 数量は value+unit                                       |
| D-5 | GET と Sync の両方に同フィールド                        |
| D-6 | buyable 空 ≠ covered-only。後者は EmptyState を出さない |

### 配置

- `shopping-item-row.tsx`: 数量行の直下にヒント（`pantryDeductedAmount !== null` のとき）。
- `shopping-list-client.tsx`: StoreGroup の下にカバー節。`coveredIngredients` を state 管理。
- カバー節は StoreGroup ではない。既定閉じ。件数をサマリに出す。

## バックエンド設計

**本切片は薄いパススルーのみ。** Mapper は新フィールドを `null` で埋める。実スナップショットの
算出・保存は別タスク。

## エラー処理

既存 Sync / refetch のエラーバナー・オフラインキューを変更しない。カバー節は書き込み操作を持たない。

## ログと監視

変更なし。

## セキュリティ

変更なし（認証なし MVP1）。

## 性能

変更なし（追加フィールドは小さい配列）。

## テスト方針

- 部分控除ヒント表示
- covered-only で EmptyState 非表示
- null/レガシーでヒント・折りたたみ非表示
- Sync 成功で coveredIngredients も置換
- 「やっぱり買う」を追加しないこと（UI 文言の不在で確認可）

## 移行とリリース

レガシーリストは null → UI 差分なし。バックエンド永続化後に Generate/Sync 済みリストから可視化が有効化。

## リスク

| リスク                      | 緩和                            |
| --------------------------- | ------------------------------- |
| バックエンド未着で常に null | UI は null 安全。結合は別タスク |
| EmptyState 条件の取り違え   | D-6 を試験で固定                |

## 未決事項

なし（P-1/P-2/P-3・D-4/D-5/D-6 確定済み）。
