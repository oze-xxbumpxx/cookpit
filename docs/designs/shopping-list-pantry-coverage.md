# 設計書: shopping-list-pantry-coverage

- ステータス: confirmed
- レベル: L3（DB スキーマ変更あり。既存 API レスポンスへのフィールド追加）
- スプリント: pantry-linked shopping visibility の polish
- 関連:
  - `docs/designs/pantry-shopping-integration.md`（`applyPantryDeduction`・D-4 全量まかない除外・消費）
  - `docs/designs/meal-plan-sync.md` / ADR-0007 / ADR-0018（Sync 差分マージ）
  - `docs/designs/shopping-list-screens.md`（買い物リスト UI）

---

## 背景

`pantry-shopping-integration` で Generate / Sync 時に在庫引き算と消費は既に動いている。
しかし UI には「なぜ買う量が減ったか／行が消えたか」の説明が無い。在庫で全量まかなえた食材は
D-4 により `ShoppingItem` にならないため、土曜の「買う行ゼロ・在庫だけで足りる」日が
EmptyState に誤認される。

## 目的

Generate / Sync の時点で在庫引き算の結果をスナップショットし、買い物リスト UI が
「在庫で足りる」「在庫で n」を表示できるようにする。GET では再計算しない
（生成時に Pantry は既に消費済みのため）。

## 要件

### P-x（ユーザー確定）

| #   | 論点               | 確定                                                                                   |
| --- | ------------------ | -------------------------------------------------------------------------------------- |
| P-1 | 全量まかないの表示 | 折りたたみの「在庫で足りる」セクションに出す。チェック可能な `ShoppingItem` にはしない |
| P-2 | 部分引き算の表示   | 数量の下に muted テキスト「在庫で n」（バッジにしない。親指チェックと衝突するため）    |
| P-3 | 「やっぱり買う」   | **実装しない**                                                                         |

### D-x（データ・契約）

| #   | 論点                  | 確定                                                                                                                              |
| --- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | 部分引き算の保持      | `shopping_items.pantryDeductedAmount` を Quantity `{ value, unit }`。null = 引き算なし                                            |
| D-2 | 全量まかないの保持    | `shopping_lists.coveredIngredients` JSONB スナップショット配列 `{ displayName, productId, requiredAmount, coveredAmount }`        |
| D-3 | amountNote のみの材料 | カバレッジ対象外（既に引き算対象外）。covered / deducted のいずれにも載せない                                                     |
| D-4 | Sync                  | 同じスナップショットを **書き換え**（meal-plan 差分マージの結果で再構築）。冪等 GET は既存行のみ返す                              |
| D-5 | 既存リスト            | カラムは null のまま。GET で現在の Pantry から再計算しない。UI は null のときバッジも折りたたみも出さない                         |
| D-6 | DTO                   | GET / Sync（および Generate）レスポンスにフィールドを露出。Client は Sync 後に `items` と `coveredIngredients` をまとめて置換する |
| D-7 | EmptyState            | 「買う行 === 0」と「covered-only の土曜」を区別する。covered のみのときは EmptyState を出さない                                   |

## 対象範囲

- Domain: `ShoppingItem.pantryDeductedAmount` / `ShoppingList.coveredIngredients`
- Application: `applyPantryDeduction` の戻り値拡張（ルール変更なし）、Generate / Sync 書き込み、DTO / mapper
- Infrastructure: schema・migration・Repository マッピング
- api-contract: response schema 拡張
- Presentation: 買い物リスト UI（折りたたみ・「在庫で n」・EmptyState）
- 設計書・テスト

## 対象外

- 単位換算
- `applyPantryDeduction` / D-4 の引き算ルール変更（全量まかないは引き続き ShoppingItem にしない）
- 「やっぱり買う」（force-buy）
- 新規集約
- 賞味期限 Cron
- 既存リストの backfill

## 現状構成

- `applyPantryDeduction` が買う量へ調整し、全量まかないは結果から除外。消費は副作用。
- Generate / Sync が上記を呼び出し `ShoppingItem` を生成・更新。
- UI は `items` のみを state に保持。`items.length === 0` で EmptyState。

## 変更後構成

```
aggregate → applyPantryDeduction（rules 不変）
  ├─ ingredients(+ pantryDeductedAmount) → ShoppingItems
  └─ coveredIngredients → ShoppingList.coveredIngredients スナップショット
GET → 永続化された値をそのまま返す（再計算なし）
```

## データフロー

1. **Generate（初回）**: 引き算後、部分は `pantryDeductedAmount`、全量は `coveredIngredients`（配列。該当なしは `[]`）を書き込む。
2. **GET / 冪等 Generate**: 永続値をそのまま返す。null の既存リストは再計算しない。
3. **Sync（差分あり）**: 新規・増分の引き算結果で `coveredIngredients` を書き換え、部分引き算は品目の `pantryDeductedAmount` を更新。差分なし（no-op）は触らない。
4. **UI**: Sync 成功時に `setItems(dto.items)` と `setCoveredIngredients(dto.coveredIngredients)` を同時更新。

## API 設計

既存エンドポイントのレスポンス拡張のみ（新規ルートなし）。

- `ShoppingItemResponse.pantryDeductedAmount`: `{ value, unit } | null`
- `ShoppingListResponse.coveredIngredients`: `CoveredIngredient[] | null`
  - `CoveredIngredient`: `{ displayName, productId, requiredAmount, coveredAmount }`
  - Quantity 形は既存の `{ value, unit }` に合わせる

## DB 設計

| テーブル         | 列                                                             | 型                   | 備考                                    |
| ---------------- | -------------------------------------------------------------- | -------------------- | --------------------------------------- |
| `shopping_items` | `pantry_deducted_amount_value` / `pantry_deducted_amount_unit` | numeric(10,3) / text | 両方 null = 引き算なし                  |
| `shopping_lists` | `covered_ingredients`                                          | jsonb nullable       | null = 未スナップショット（既存リスト） |

マイグレーションは ADD COLUMN のみ。既存行は null。backfill しない。

## フロントエンド設計

- 折りたたみ `<details>`（「在庫で足りる」）。中身は名前 + 必要量。チェック UI・楽観更新・オフラインキュー対象外。
- 部分引き算: 数量の直下に `text-muted-foreground` で「在庫で {value}{unit}」。
- `coveredIngredients === null` → セクション非表示。`pantryDeductedAmount === null` → テキスト非表示。
- EmptyState: `items.length === 0 && (coveredIngredients === null \|\| coveredIngredients.length === 0)` のときのみ。
- P-3: force-buy UI は置かない。

## バックエンド設計

### `applyPantryDeduction`（拡張・ルール不変）

戻り値に以下を追加する（引き算・消費の条件は変更しない）。

- 結果の各要素に `pantryDeductedAmount: Quantity | null`（部分引き算時は消費した量）
- `coveredIngredients: CoveredIngredient[]`（全量まかない。`requiredAmount` / `coveredAmount` は同値＝必要量）

### Generate

`ShoppingList.create` 時に `coveredIngredients`（配列）と各 item の `pantryDeductedAmount` を設定。

### Sync

差分マージで `applyPantryDeduction` が返した全量まかないを取り込み、既存スナップショットのうち
献立集計に残るキーを残して **書き換え**。増分引き算で部分消費した場合は
既存 `pantryDeductedAmount` に加算。no-op では書き換えない（既存 null を維持）。

### GET

永続値を DTO へそのまま写す。Pantry を読まない。

## エラー処理

対象外（外部 I/O 新規なし。既存 UoW / Repository の枠内）。

## ログと監視

対象外。

## セキュリティ

対象外（MVP1 認証なし・既存と同じ）。

## 性能

スナップショットは生成・同期時の O(材料数)。GET 追加コストは JSONB 読み出しのみ。

## テスト方針

- Acceptance: P-1 折りたたみ・非チェック / P-2「在庫で n」 / P-3 force-buy UI なし
- Regression: covered-only で EmptyState にしない / Sync が coveredIngredients を書き換える / 既存 GET は null
- Generate: 部分 + 全量 + amountNote-only（Note は coverage に入らない）
- 既存 `applyPantryDeduction` 回帰（買う量・消費）が緑のまま

## 移行とリリース

ADD COLUMN のみ。既存リストは null のまま UI も従来どおり。新規 Generate / 差分あり Sync からスナップショットが付く。

## リスク

| リスク                         | 緩和                                                               |
| ------------------------------ | ------------------------------------------------------------------ |
| Sync 忘れで covered が古くなる | 仕様どおり（D-4）。UI はスナップショットを信じ、GET で再計算しない |
| 既存リストは説明が付かない     | backfill しない（スコープ外）。再生成または Sync で付与            |

## 未決事項

なし（P-1 / P-2 / P-3 および D-x はユーザー確定済み）。
