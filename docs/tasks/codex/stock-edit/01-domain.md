# Task 1: Domain — Stock の詳細編集メソッドを実装

## 概要

`Stock` の賞味期限・保存場所・数量を生成後に変更できるようにする。現在この 3 つのうち
`expiresAt` / `storedLocation` は `private readonly` で変更手段が無い（`amount` のみ
`consume()` のために可変）。参照する既存パターンは同ファイル内の `Stock.create()`
（バリデーション）と `Pantry.consumeStock()` / `Pantry.discardStock()`（委譲メソッドの形）。

対象ファイルは `packages/domain/src/pantry/pantry.ts` の 1 本のみ。
**他のパッケージには一切触れない。**

## アーキテクチャ制約

- 依存方向: `Presentation → Application → Domain ← Infrastructure`。
  **`packages/domain` は他のパッケージに依存しない。** ORM（Drizzle）や HTTP の型を持ち込まない。
- ドメインロジック（バリデーション・状態遷移）は Entity / Value Object に閉じ込める。
  UseCase や Repository に書かない。
- Entity 生成は `static create()`、DB 復元は `static reconstruct()`。
- `any` 型は禁止（`unknown` を使う）。デフォルトエクスポート禁止（名前付きのみ）。
- 型のみのインポートは `import type`。`===` / `!==` を使う。「値なし」は `null` に統一。
- 公開 API（集約の公開メソッド）には JSDoc を書く。内容は**型に表せない契約情報のみ**
  （不変条件・`@throws`・冪等性など）。`@param props 更新内容` のような型の言い換えは書かない。

## 実装対象ファイル

### `packages/domain/src/pantry/pantry.ts`（追記・一部変更）

#### 1. `Stock` のフィールドを可変にする

`private constructor` の引数のうち、次の 2 つから **`readonly` を外す**。

```ts
private stockExpiresAt: Date | null,
private stockStoredLocation: StorageLocation | null,
```

**他の 5 フィールド（`stockId` / `stockProductId` / `stockDisplayName` / `stockPurchasedAt` /
`stockSourceShoppingItemId`）の `readonly` は外さない。** `stockAmount` は元から `readonly` が
付いていない（変更不要）。引数の順序も変更しない。

#### 2. `Stock.updateDetails()` を追加

`consume()` の直後に置く。

```ts
  /**
   * 生成後の在庫の詳細（数量・賞味期限・保存場所）をまとめて更新する。
   *
   * 3 項目すべてを指定する全体置換。値を消す場合は `null` を渡す（キー省略はできない）。
   * `displayName` / `purchasedAt` / `productId` / `sourceShoppingItemId` は変更しない。
   *
   * @throws Error amount.value が 0 以下の場合
   */
  updateDetails(props: {
    amount: Quantity;
    expiresAt: Date | null;
    storedLocation: StorageLocation | null;
  }): void {
    if (props.amount.value <= 0) {
      throw new Error('Stock amount must be positive');
    }

    this.stockAmount = props.amount;
    this.stockExpiresAt = props.expiresAt;
    this.stockStoredLocation = props.storedLocation;
  }
```

#### 3. `Pantry.updateStockDetails()` を追加

`discardStock()` の直後、`hasStockFromShoppingItem()` の前に置く。

```ts
  /**
   * 在庫の詳細（数量・賞味期限・保存場所）を更新する。数量を 0 以下にはできない
   * （残量 0 の在庫は `consumeStock` が集約から取り除く扱いのため）。
   *
   * @throws Error stockId の Stock が存在しない場合、または amount.value が 0 以下の場合
   */
  updateStockDetails(
    stockId: StockId,
    props: {
      amount: Quantity;
      expiresAt: Date | null;
      storedLocation: StorageLocation | null;
    },
  ): void {
    const stock = this.findStock(stockId);
    stock.updateDetails(props);
  }
```

既存の private `findStock(stockId)` をそのまま再利用する（見つからなければ
`throw new Error('Stock not found')` を投げる実装が既にある）。

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **`StockNotFoundError` を import しない。** これは `packages/application/src/pantry/` の
  クラスで、Domain から import すると依存方向違反になり `pnpm lint` / アーキテクチャ原則の
  両方に反する。Domain が投げるのは**素の `Error`** である（既存の `consumeStock` /
  `discardStock` / `findStock` と同じ）。
- **`Quantity.of()` の 0 許容に注意。** `packages/domain/src/shared/quantity.ts` の
  `Quantity.of()` は **`value < 0` のみ reject** し、**`0` は成功する**（`consume()` が残量 0 を
  表現するために必要）。したがって「`Quantity` が弾くから `updateDetails` のチェックは不要」は
  **成立しない**。`props.amount.value <= 0` のチェックを省略しないこと。
  比較演算子は `<= 0`（`< 0` ではない）。
- **メソッド名の綴り**: `updateDetails`（Stock 側）と `updateStockDetails`（Pantry 側）は
  **別名**である。片方に寄せない。`updateStock` / `updateStockDetail`（単数）などにしない。
- **`readonly` の外し忘れ / 外しすぎ**: 外すのは `stockExpiresAt` と `stockStoredLocation` の
  **2 つだけ**。`stockDisplayName` や `stockPurchasedAt` の `readonly` を一緒に外さないこと
  （編集対象外であることを型で守っている）。
- **getter は変更しない。** `get expiresAt()` は `new Date(this.stockExpiresAt)` の防御的コピーを
  返す既存実装のままでよい（`null` チェック込み）。
- **`props` を分割代入して個別に検証し直さない。** バリデーションは `amount.value <= 0` の
  1 つだけ。`expiresAt` の過去日付は**許可する**（賞味期限切れを事後に記録するケースがあるため。
  要件 B-1 で確定済み）。
- **`Pantry.updateStockDetails` で `stocks` getter を使わない。** `this.stocks` は
  `[...this.pantryStocks]` のコピーを返すが、要素は同一インスタンスなので更新自体は通る。
  ただし既存 2 メソッドと形を揃えるため `this.findStock(stockId)` を使うこと。

## テスト

`packages/domain/tests/pantry/pantry.test.ts` に追記する（`src/` の構造をミラーする既存の
置き方に合わせる）。試験計画 `docs/tests/stock-edit.md` §2-1（STK-UPD-01〜10）・
§2-2（PT-UPD-01〜05）の観点を実装する。

**必須ケース**:

- `STK-UPD-04`: `amount.value` が **0** のとき throw する（`Quantity.of(0, unit)` は成功するので、
  `updateDetails` 自身が弾くことの確認。**最重要境界**）
- `STK-UPD` 系: 負値で throw / 3 項目同時更新 / `expiresAt` を `null` にクリア /
  `storedLocation` を `null` にクリア / 単位のみ変更
- `STK-UPD` 系: 編集後も `displayName` / `purchasedAt` / `productId` / `sourceShoppingItemId` が
  変わっていないこと（対象外フィールドの回帰ガード）
- `PT-UPD-02`: 存在しない `stockId` で **素の `Error`**（`message` が `'Stock not found'`）が
  throw されること。`StockNotFoundError` ではないことをテストで固定する

## 完了条件

- [ ] `pnpm --filter @cookpit/domain test` 全 green
- [ ] `pnpm --filter @cookpit/domain type-check` / `pnpm lint` 全 green
- [ ] `grep -r "@cookpit/application" packages/domain/src` が **0 件**（依存方向の確認）
- [ ] `Stock.updateDetails` / `Pantry.updateStockDetails` が上記シグネチャどおりに存在する
- [ ] `stockExpiresAt` / `stockStoredLocation` の 2 つだけ `readonly` が外れている
      （他 5 フィールドは `readonly` のまま）
