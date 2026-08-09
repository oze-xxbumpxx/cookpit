# Task 2: Infrastructure — save() の set 句を 4 列へ拡張する

## 概要

`DrizzlePantryRepository.save()` は既存行の更新時に `amount_value` の 1 列しか UPDATE しない。
Task 1 で Domain が編集できるようになっても、**このままでは DB に反映されない**。
`set` 句を 4 列へ拡張し、往復（`save()` → `find()`）の回帰テストを追加する。

対象は `packages/infrastructure/` の 2 ファイルのみ。**他のパッケージには触れない。**

**このタスクは TDD 順で進める**: まず既存テストの期待値を実態へ直して **Red** を作り、
次に `set` 句を拡張して **Green** にする。

## アーキテクチャ制約

- 依存方向: `Presentation → Application → Domain ← Infrastructure`。
- **DB スキーマ形 ⇔ ドメインモデル形の変換責任は Repository 実装が持つ。**
  Domain 層は DB の形を知らない。
- `any` 型は禁止。デフォルトエクスポート禁止。型のみのインポートは `import type`。
  `===` / `!==` を使う。「値なし」は `null`。
- **DB スキーマ変更・マイグレーションは行わない**（`stocks.expires_at` は `date` 型 nullable、
  `stocks.stored_location` は `text` 型 nullable として既に存在する）。

## ⚠️ このタスクで直す欠陥の性質（必ず読む）

`set` 句を直さないと何が起きるか:

- **API は 200 を返す**
- **画面はレスポンス DTO（メモリ上の集約）を描画するので成功して見える**
- **リロードして初めて消えたと分かる**

UseCase 単体テストとコンポーネントテストでは**構造的に検出できない**。PGlite を使った
Infrastructure 層のテストでのみ検出できる。

**罠には 2 つの顔がある**:

1. `expires_at` / `stored_location` が丸ごと `set` 句に無い（元々の罠）
2. `amount_value` は `set` 句にあるが **`amount_unit` は無い**。つまり
   「数量の**値**は反映されるが、**単位**を変えると反映されない」という、値が変わって
   見えるぶん気づきにくい罠がもう 1 つある

→ **「値は据え置き、単位だけ変える」テストを必ず独立したケースにすること。**
値も一緒に変えるテストでは罠 2 を検出できない。

## Step A（先に実施）: 既存テストの期待値を実態へ直して Red にする

### `packages/infrastructure/tests/repositories/drizzle-pantry.repository.test.ts`

L111 の既存テスト **`同一 id の再 save() は amountValue のみ更新し不変フィールドを維持する`** は、
**現在の罠を「正しい挙動」としてアサートしている**。

このテストは `changed` として
`amount: Quantity.of(1.25, 'g')` / `expiresAt: 2026-07-19` / `storedLocation: 'freezer'` を
渡した上で、次のように「変わらないこと」を確認している:

```ts
expect(rows[0]?.amountUnit).toBe('個'); //         ← 変更後は 'g' になるべき
expect(rows[0]?.expiresAt).toBe('2026-07-18'); //  ← 変更後は '2026-07-19' になるべき
expect(rows[0]?.storedLocation).toBe('fridge'); // ← 変更後は 'freezer' になるべき
```

**やること**:

- この 3 アサーションを、`changed` に対応する**変更後の値**へ書き換える。
- テスト名を実態に合わせて改める（例: `同一 id の再 save() は編集対象 4 列を更新し、対象外
フィールドは維持する`）。**テストを削除しない。**
- 次の 4 アサーションは **そのまま残す**（対象外フィールドの回帰ガードとして引き続き有効）:
  `productId`（`'product-1'`）/ `displayName`（`'玉ねぎ'`）/ `purchasedAt`（`PURCHASED_AT`）/
  `sourceShoppingItemId`（`'shopping-item-1'`）。
- `amountValue`（`1.25`）のアサーションは既に正しいので変更不要。

**この時点で `pnpm --filter @cookpit/infrastructure test` を実行し、このテストが Red になる
ことを確認してから Step B へ進む。** 他のテストは Green のままであること。

## Step B: `set` 句を 4 列へ拡張する

### `packages/infrastructure/src/repositories/drizzle-pantry.repository.ts`

`save()` 内の `onConflictDoUpdate` を次のとおり変更する。

```ts
if (stockRows.length > 0) {
  // 配列バッチ upsert。set は各行の値を excluded.* で参照する。
  // 編集可能なのは amount（値・単位）/ expiresAt / storedLocation の 4 列のみ
  // （stock-edit の P-1 で確定）。displayName / purchasedAt / productId /
  // sourceShoppingItemId は編集対象外なので意図的に含めない。
  await this.db
    .insert(stocks)
    .values(stockRows)
    .onConflictDoUpdate({
      target: stocks.id,
      set: {
        amountValue: sql`excluded.amount_value`,
        amountUnit: sql`excluded.amount_unit`,
        expiresAt: sql`excluded.expires_at`,
        storedLocation: sql`excluded.stored_location`,
      },
    });
}
```

`save()` の他の部分（`notInArray` による削除同期・`toStockRows` / `toEntity`）は**変更しない**。

## Step C: 新規回帰テストを追加する

同じテストファイルに追加する。試験計画 `docs/tests/stock-edit.md` §5-2（INF-UPD-02〜08）。

**必須ケース**:

- **単位のみ変更の往復**（罠 2 の直接検出）: 値は据え置きで `個` → `g` のように単位だけ変え、
  `save()` → `find()` して単位が変わっていること
- **4 項目同時変更の往復**: 数量（値・単位）・`expiresAt`・`storedLocation` を同時に変えて往復
- `expiresAt` を `null` にクリアする往復
- `storedLocation` を `null` にクリアする往復
- `null` → 値を設定する往復（期限も保存場所も）

**`find()` は必ず新しい `DrizzlePantryRepository` インスタンスで呼ぶ**（既存テストのパターンを
踏襲する）。同一インスタンスで確認すると、インスタンス内部の状態に依存した見かけ上の成功を
掴んでしまう。

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **列名の綴りに注意。** `set` のキーは Drizzle のカラム定義名（camelCase の
  `amountValue` / `amountUnit` / `expiresAt` / `storedLocation`）、
  `sql` テンプレート内は **DB の物理列名（snake_case）** で `excluded.amount_value` /
  `excluded.amount_unit` / `excluded.expires_at` / `excluded.stored_location`。
  **両者を取り違えない**（`excluded.amountUnit` は動かない）。
- **`displayName` / `purchasedAt` / `productId` / `sourceShoppingItemId` を `set` 句に
  足さないこと。** 「ついでに全部更新できるようにする」は**やってはいけない**
  （編集対象外であり、既存テストの回帰ガードが失敗する）。
- **既存テストを削除して新しく書き直さない。** 期待値だけを直す。削除すると対象外
  フィールドの回帰ガードが失われる。
- **`amount_value` は `numeric` 型なので DB からは文字列で返る。** 既存テストが
  `Number(rows[0]?.amountValue)` としているのはこのため。新規テストでも同じ変換を使う。
- **`expires_at` は `date` 型なので `'2026-07-19'` の文字列で比較する**（`Date` オブジェクトでは
  ない）。`purchased_at` は `timestamp` 型で `Date` として返る点と**扱いが違う**ので混同しない。
- `import type` 規約: 型のみの import（`StockRow` / `NewStockRow` / `PantryRepository` /
  `StorageLocation` など）は `import type` を使う（既存ファイル冒頭の書き方に揃える）。

## テスト

`packages/infrastructure/tests/repositories/drizzle-pantry.repository.test.ts`（既存ファイルに
修正 1 件 + 新規ケース追加）。PGlite を使う既存のテスト基盤をそのまま利用する。

## 完了条件

- [ ] Step A で既存テストが **Red** になることを確認した（記録して Step B へ進んだ）
- [ ] `pnpm --filter @cookpit/infrastructure test` 全 green（既存修正 + 新規を含む）
- [ ] `pnpm --filter @cookpit/infrastructure type-check` / `pnpm lint` 全 green
- [ ] **「値は据え置き、単位のみ変更」の往復テストが独立したケースとして存在する**
- [ ] `set` 句が 4 列ちょうど（`displayName` 等が混ざっていない）
- [ ] `save()` の削除同期（`notInArray`）と `toStockRows` / `toEntity` に差分が無い
- [ ] DB スキーマ・マイグレーションファイルに差分が無い
