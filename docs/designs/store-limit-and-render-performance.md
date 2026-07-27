# 設計書: store-limit-and-render-performance

- ステータス: 確定
- 変更レベル: L2
- 作成日: 2026-07-27
- 関連 ADR: [ADR-0013](../decisions/ADR-0013-store-limit-and-delete-cascade.md)（ADR-0012 を supersede）
- 関連設計書: [store-master.md](./store-master.md) / [store-delete-and-unit-price-basis.md](./store-delete-and-unit-price-basis.md) / [free-text-units.md](./free-text-units.md)

## 背景

ユーザーから 3 点の修正依頼があった。

1. 価格記録で使う店舗は 3 つまでにしたい。同名店舗は登録できないようにしたい。
2. 内容量の入力例が単位と噛み合っておらず、表示箇所ごとに食い違っている。統一したい。
3. 全体的に画面が描画されるまで時間がかかる。詳細な原因分析が欲しい。

①の背景は実データにある。本番の店舗マスタは **10 件**まで増えており、内訳は実在する店舗
3 件（コモディ飯田・ライフ・業務スーパー）、試し入力の残骸 4 件（`AAAA` / `5555` /
`っっっs` / `sssss`）、そして**「業務スーパー」の重複 4 件**である。重複はいずれも
2026-07-27 に作られており、同名チェックが無いために生まれている。価格記録のプルダウンが
実用に耐えない状態になっていた。

②は `price-record-form.tsx` のプレースホルダが `例：300{基本単位}` の文字列連結である
ことに起因する。基本単位が `個` の商品では「例：300個」という非現実的な例が出る。さらに
同じフォームのバリデーションエラーは `例：300g` と固定文言で、両者が食い違っている。

③については本番（<https://cookpit-web.vercel.app/>）を実測して原因を切り分けた。結果は
§性能 に記載する。

## 目的

- 店舗マスタを「実運用で回る 3 店舗」に収束させ、その状態を仕組みで維持する。
- 内容量の入力例を、単位の性質に応じた自然な例に統一する。
- 描画遅延の原因を実測で特定し、影響度の大きい 2 点（フォント・ストリーミング）を改善する。

## 要件

| ID   | 要件                                                                                      |
| ---- | ----------------------------------------------------------------------------------------- |
| R-1  | 店舗マスタの登録件数は最大 3 件。4 件目の作成要求はサーバー側で拒否する                   |
| R-2  | 既存店舗と同名の店舗は作成できない。比較は前後空白除去 + NFKC 正規化後の完全一致で行う    |
| R-3  | 店舗は参照があっても削除できる。削除時にその店舗の価格記録を全件削除する                  |
| R-4  | 店舗削除時、買い物リスト品目の店舗指定（targetStore / actualStore）は未割当（null）へ戻す |
| R-5  | 削除前に「価格記録 N 件が削除される」件数をユーザーへ提示し、確認を取る                   |
| R-6  | 上限到達時・同名時は、UI 側でも操作前に理由を提示する（サーバー拒否だけに頼らない）       |
| R-7  | 内容量の入力例は単位の性質で出し分ける。可算単位は数量 `1` に統一する                     |
| R-8  | プレースホルダとバリデーションエラーメッセージは同一の例を表示する                        |
| R-9  | 主要ルートに Suspense 境界を置き、サーバー処理完了前に画面の骨組みを描画する              |
| R-10 | 日本語 Web フォントの初回転送量を削減する。Android でも丸ゴシックの見た目を維持する       |

## 対象範囲

- `packages/domain`: 価格記録の店舗別削除、買い物品目の店舗解除、店舗の同名検索
- `packages/application`: 店舗作成の上限・同名検証、店舗削除のカスケード、新規エラー 2 件
- `packages/api-contract`: 店舗参照件数レスポンスのスキーマ
- `packages/infrastructure`: 上記リポジトリメソッドの Drizzle 実装
- `apps/web`: 価格記録フォームの UI、内容量の例、`loading.tsx` 6 件、フォント読み込み

## 対象外

- 店舗の論理削除（アーカイブ）— ADR-0012 で却下済み、本設計でも採用しない
- 店舗の改名（`PATCH /api/stores/:id`）— 依頼範囲外。重複は削除で解消する
- 上限件数のユーザー設定化 — 2 人・2〜3 店舗運用に対して過剰
- 商品詳細の DB 往復削減、recharts の遅延読み込み — 分析済みだがユーザー判断で今回は実施しない
  （§性能 に記録を残し、次タスクの候補とする）
- ISR / キャッシュ戦略の見直し（全ページ `force-dynamic`）— データ鮮度要件との調整が必要

## 現状構成

### 店舗の作成

`CreateStoreUseCase` は `Store.create({ name })` を呼んで保存するだけで、件数も重複も見ない。
`Store.create` は空白のみの名前を拒否するが、それ以上の検証は持たない。

### 店舗の削除（ADR-0012）

`DeleteStoreUseCase` が `countPriceRecordsByStore` と `countItemsByStore` を並列で数え、
合計が 1 件以上なら `StoreInUseError`（→ 422）を投げて削除を拒否する。
`price_records.store_id` の外部キーは `onDelete: 'restrict'` で、これが最後の砦になっている。

この設計は「参照ゼロの店舗を消してプルダウンを掃除する」目的には足りていた。しかし R-1 の
上限を入れると**参照付きの店舗を消せないため上限まで下げられず、新規追加が永久にできない**
状態に陥る。実データ 10 件のうち実在 3 店舗は価格記録を持つため、この詰みは確実に起きる。

### 内容量の入力例

| 箇所                                         | 現状の文言          |
| -------------------------------------------- | ------------------- |
| `price-record-form.tsx` プレースホルダ       | `例：300{基本単位}` |
| `price-record-form.tsx` バリデーションエラー | `例：300g` 固定     |
| `QuantityField` の既定プレースホルダ         | `例：3個 / 300g`    |
| `complete-shopping-panel.tsx` の補助文       | `例：3個`           |

### フォント読み込み

`layout.tsx` が `@fontsource/zen-maru-gothic` の `japanese-400 / 500 / 700` を import し、
`globals.css` の `--font-sans` が `'Zen Maru Gothic'` を先頭に指定している。

## 変更後構成

```
店舗作成（CreateStoreUseCase）
  findAll() → 件数 >= 3 なら StoreLimitExceededError（422）
            → 正規化名の一致があれば DuplicateStoreNameError（422）
            → Store.create() → save()

店舗削除（DeleteStoreUseCase）— ADR-0013
  findById() → 無ければ StoreNotFoundError（404）
  ① productRepository.deletePriceRecordsByStore(storeId)      価格記録を物理削除
  ② shoppingListRepository.findAllByStore(storeId)            参照リストを取得
     各リストで shoppingList.unassignStore(storeId) → save()  店舗指定を null へ
  ③ storeRepository.delete(storeId)                           店舗を物理削除

店舗参照件数（GET /api/stores/:id/usage）
  countPriceRecordsByStore + countItemsByStore を並列取得して返す
```

削除順序は「参照元 → 参照先」で固定する。逆順にすると
`price_records.store_id` の `restrict` 制約に当たって生の DB エラー（→ 500）になる。
外部キーは `restrict` のまま残し、順序ミスを検出する安全網として機能させる
（スキーマ変更・マイグレーションは不要）。

## データフロー

### 店舗の追加（上限・同名）

1. ユーザーが価格記録フォームの店舗パネルに名前を入力し「追加」を押す
2. フロントは登録済み件数が 3 件以上なら**ボタンを無効化**し理由を表示（R-6）。押せない
3. 3 件未満なら `POST /api/stores`
4. サーバーが件数・同名を検証し、違反なら 422 + エラーメッセージ
5. フロントは 422 のとき本文の判別ではなく**再取得した一覧と入力名から理由を組み立てて**表示する

> 422 の理由を本文文字列でパースしない。`StoreLimitExceededError` と
> `DuplicateStoreNameError` はどちらも 422 で、メッセージは英語の内部表現である。
> フロントは「送信直前の一覧」と「入力名」から、どちらの違反かを自前で判定して日本語化する。

### 店舗の削除（カスケード）

1. ユーザーがゴミ箱アイコンを押す
2. フロントが `GET /api/stores/:id/usage` で件数を取得
3. 確認ダイアログに「価格記録 N 件が削除されます / 買い物の品目 M 件の店舗指定が未割当に戻ります」を表示
4. 「削除する」で `DELETE /api/stores/:id`
5. サーバーが ①価格記録削除 → ②店舗指定解除 → ③店舗削除 を実行し 204
6. フロントは一覧から除去し、選択中だった場合は選択を解除。`router.refresh()` で
   価格履歴・グラフ・最安店舗を再取得する

### 内容量の例

```
product.defaultUnit
  → packageSizeExample(unit) → "300g" / "1個" / "1kg" …
      ├─ プレースホルダ: `例：${example}`
      └─ エラーメッセージ: `内容量は「数値+単位」で入力してください（例：${example}）。`
```

## API 設計

### `GET /api/stores/:id/usage`（新規）

店舗を削除したときに失われるものの件数を返す。削除確認ダイアログの表示のためだけに使う。

| 項目           | 内容                                                      |
| -------------- | --------------------------------------------------------- |
| パスパラメータ | `id`: 店舗 ID（`idParamSchema` で UUID 検証）             |
| 200 レスポンス | `{ priceRecordCount: number, shoppingItemCount: number }` |
| 404            | 店舗が存在しない（`StoreNotFoundError`）                  |

`priceRecordCount` は全商品にわたる合計件数。`shoppingItemCount` は全リストにわたる
品目件数で、同じ品目が target / actual の両方で参照していても 1 件と数える
（`countItemsByStore` の既存契約を踏襲）。

### `POST /api/stores`（変更）

| 状況                 | 変更後                                |
| -------------------- | ------------------------------------- |
| 登録済みが 3 件以上  | 422 `StoreLimitExceededError`（新規） |
| 正規化名が既存と一致 | 422 `DuplicateStoreNameError`（新規） |

リクエスト・成功レスポンスのスキーマは変更しない。

### `DELETE /api/stores/:id`（変更）

| 状況                   | 変更前                | 変更後                    |
| ---------------------- | --------------------- | ------------------------- |
| 参照ゼロ               | 204                   | 204（変更なし）           |
| 価格記録・品目から参照 | 422 `StoreInUseError` | **204（カスケード実行）** |
| 店舗が存在しない       | 404                   | 404（変更なし）           |

`StoreInUseError` は本変更で**削除する**（発生経路が無くなる）。

## DB 設計

**スキーマ変更なし・マイグレーションなし。**

- `price_records.store_id` の `references(stores.id, { onDelete: 'restrict' })` は維持する。
  カスケードを Application 層の順序制御で実現するため、FK は「順序ミスの検出装置」として残す。
- `shopping_items.target_store_id` / `actual_store_id` は従来どおり FK なしの ID 参照。
  ここを null へ戻す責務は Application 層（と Domain の `unassignStore`）が持つ。
- 上限 3 件を DB 制約（CHECK 等）で表現しない。件数制約はテーブル横断で書けず、
  2 人運用の同時実行リスクに対して過剰である（§リスク 参照）。

## フロントエンド設計

### ① 店舗パネル（`price-record-form.tsx`）

- `stores.length >= STORE_LIMIT` のとき「追加」ボタンを `disabled`、
  入力欄の下に `店舗は3件までです。追加するには既存の店舗を削除してください。` を表示
- 入力中の名前が既存店舗と正規化一致するとき、押す前に
  `同じ名前の店舗がすでに登録されています。` を表示し追加ボタンを無効化
- 削除ダイアログは `usage` 取得後に件数を差し込む。取得に失敗した場合は件数を伏せ、
  「この店舗の価格記録はすべて削除されます」の定性表現で続行可能にする（削除自体は止めない）
- 上限・同名の判定に使う正規化関数は Domain の `normalizeStoreName` を
  `@cookpit/domain` から import して**サーバーと同一実装を共有**する

### ② 内容量の例（`products/_utils/package-size-example.ts`、新規）

```ts
export function packageSizeExample(unit: string): string;
```

`isCountableUnit()`（Domain）で可算判定し、数量を決める純関数。

| 単位                                           | 例        | 根拠                                      |
| ---------------------------------------------- | --------- | ----------------------------------------- |
| `g` / `ml`                                     | `300g`    | 小さい連続量。300 が現実的な内容量        |
| `kg` / `l`                                     | `1kg`     | 大きい連続量。300kg は非現実的            |
| `個` `本` `枚` `玉` `尾` `切れ` `束` `袋` `缶` | `1個`     | 可算単位は 1 に統一（R-7）                |
| `大さじ` `小さじ` `cup` `合`                   | `1大さじ` | 計量単位。1 が自然                        |
| 上記以外（自由入力の未知単位）                 | `1<unit>` | 安全側。`isCountableUnit` は false を返す |
| 空文字（防御的）                               | `300g`    | 単位不明時は既定の例に落とす              |

`isCountableUnit` は既知の可算プリセットのみ true を返すため、未知単位は
「連続量」に分類される。しかし未知単位で 300 を出すと「300杯」のような不自然な例になり得る。
そこで**連続量の中でも `g` / `ml` だけを 300 とする明示リスト方式**を採る
（`isCountableUnit` の結果に加えて単位名で分岐する）。

### ③ `loading.tsx`（6 ルート、新規）

| ルート                 | 骨組みの内容                                 |
| ---------------------- | -------------------------------------------- |
| `/`                    | ヘッダ + 献立カード + 期限カードのスケルトン |
| `/products/[id]`       | ヘッダ + 指標 2 枚 + フォーム + グラフ枠     |
| `/shopping-lists`      | ヘッダ + 導線カード                          |
| `/shopping-lists/[id]` | ヘッダ + 店舗グループ 2 つ分のリスト         |
| `/recipes/[id]`        | ヘッダ + 材料・手順のリスト                  |
| `/meal-plans/history`  | ヘッダ + 週カード 3 枚                       |

既存の `_components/skeleton.tsx` / `list-skeleton.tsx` を再利用し、新しい部品は作らない。

### ④ フォント（`globals.css` / `layout.tsx`）

- `layout.tsx` の `@fontsource` import 3 行を削除
- `globals.css` に自前の `@font-face` 3 件を追加。`font-display: swap` は踏襲
- 参照先は `apps/web/public/fonts/zen-maru-gothic-subset-{400,500,700}.woff2`

## バックエンド設計

### Domain

**`StoreRepository`（追加）**

```ts
/**
 * 正規化した名前（前後空白除去 + NFKC）が一致する店舗を返す。同名登録の拒否にだけ使う。
 * 正規化は normalizeStoreName に合わせること。
 */
findByNormalizedName(normalizedName: string): Promise<Store | null>;
```

**`packages/domain/src/shared/store.ts`（追加）**

```ts
/**
 * 店舗名の比較用正規化（前後空白除去 + NFKC 正規化）。同名判定に用い、"ライフ" と " ライフ "、
 * 半角/全角の表記ゆれを同一視する。表示には原文を使う（normalizeUnit と同じ方針）。
 */
export function normalizeStoreName(name: string): string;
```

`Store.create` 自体は上限も同名も検査しない。どちらも**単一の Store では判定できない
コレクション制約**であり、Application 層の責務とする（`StoreInUseError` を UseCase 側に
置いた ADR-0012 の判断と同じ理由）。

**`ProductRepository`（追加）**

```ts
/**
 * 指定した店舗の価格記録を全商品から物理削除する（ADR-0013 の店舗削除カスケード）。
 * 店舗削除の前段でのみ呼ぶ。存在しない店舗 ID を渡しても例外にはならない（冪等）。
 */
deletePriceRecordsByStore(storeId: StoreId): Promise<void>;
```

**`ShoppingListRepository`（追加）**

```ts
/**
 * 指定した店舗を targetStore または actualStore として参照する品目を持つリストを返す
 * （completed のリストも含む）。店舗削除カスケード（ADR-0013）のためだけに使う。
 */
findAllByStore(storeId: StoreId): Promise<ShoppingList[]>;
```

**`ShoppingList.unassignStore` / `ShoppingItem.unassignStore`（追加）**

```ts
/**
 * 指定した店舗への参照を全品目から外す（targetStore / actualStore を null へ）。
 * 店舗が削除されたときの後始末（ADR-0013）専用で、ユーザー操作ではないため
 * completed のリストにも適用できる（assertActive を通さない）。
 * 変更があった場合のみ true を返す。
 */
unassignStore(storeId: StoreId): boolean;
```

`assertActive` を通さない理由を JSDoc に明記する。他の更新操作と例外的に異なる点であり、
`reopen()` に次ぐ 2 例目の例外になる。

`bought` かつ `actualStore === null` は既に正当な状態である
（`check()` は actualStore に触れず bought へ遷移する）ため、この操作で不変条件は壊れない。
未完了リストの bought 品目から actualStore が消えると、買い物完了時に
`CompleteShoppingUseCase.buildPriceRecord` が `null` を返して**その品目の価格記録が
スキップされる**。店舗が存在しないのだから記録先も無く、意図した挙動である。

### Application

**`StoreLimitExceededError`（新規）**

```ts
export class StoreLimitExceededError extends InvalidOperationError {
  constructor(readonly limit: number, readonly current: number)
}
```

**`DuplicateStoreNameError`（新規）**

```ts
export class DuplicateStoreNameError extends InvalidOperationError {
  constructor(readonly name: string)
}
```

いずれも `InvalidOperationError` を継承させ、既存の `onError` で 422 になる
（`coding-standards.md` / `errors.ts` の「継承しないと 500 になる」注意に従う）。

**`CreateStoreUseCase`（変更）**

`findAll()` の件数チェックと `findByNormalizedName()` の同名チェックを、
`Store.create` の前に実行する。上限チェックを先に置く（件数超過の方が回復手順が重いため、
先に伝えた方が親切）。

**`DeleteStoreUseCase`（変更）**

`StoreInUseError` を投げる分岐を削除し、カスケード 3 段に置き換える。
単一トランザクションではないため、途中失敗時は再実行で前方回復する
（各段が冪等なので再実行して問題ない）。この方針は `CompleteShoppingUseCase` の
既存判断と揃える。

**`GetStoreUsageUseCase`（新規）**

`countPriceRecordsByStore` と `countItemsByStore` を `Promise.all` で取得して返す。
店舗の存在確認を先に行い、無ければ `StoreNotFoundError`。

### Infrastructure

| メソッド                    | 実装                                                                      |
| --------------------------- | ------------------------------------------------------------------------- |
| `findByNormalizedName`      | `stores` 全件取得後にアプリ側で正規化比較（件数上限 3、インデックス不要） |
| `deletePriceRecordsByStore` | `DELETE FROM price_records WHERE store_id = ?`                            |
| `findAllByStore`            | 該当 `shopping_items` を持つ `shopping_list_id` を絞ってから既存の再構築  |

`findByNormalizedName` を SQL 側の正規化で書かない理由: PostgreSQL の `normalize()` は
NFKC を扱えるが、`Store.name` の正規化規則を SQL と TypeScript の 2 か所に持つと
乖離する。件数が 3 件上限であることを踏まえ、TypeScript 側の 1 実装に寄せる。

## エラー処理

| エラー                    | HTTP | UI の表示                                                              |
| ------------------------- | ---- | ---------------------------------------------------------------------- |
| `StoreLimitExceededError` | 422  | 店舗は3件までです。追加するには既存の店舗を削除してください。          |
| `DuplicateStoreNameError` | 422  | 同じ名前の店舗がすでに登録されています。                               |
| `StoreNotFoundError`      | 404  | 削除は成功として扱う（既に消えている＝目的達成。既存の冪等方針を踏襲） |
| `usage` 取得失敗          | -    | 件数を伏せた定性表現に切り替え、削除操作自体は継続可能にする           |

`StoreInUseError` は削除する。`store-in-use.error.ts` とその export、
`price-record-form.tsx` の `STORE_IN_USE_MESSAGE` も併せて削除する。

## ログと監視

追加しない。既存の `app.onError` が 500 のみ `console.error` する方針を維持する。
422 は想定内の入力エラーであり、ログ対象にしない。

## セキュリティ

- 認証は MVP1 では対象外（ADR-0003）。本変更で前提は変わらない。
- 上限 3 件はサーバー側で強制する。UI の無効化は補助であり、API を直接叩いても超過できない。
- `GET /api/stores/:id/usage` は件数のみを返し、価格・商品名などの内容は含めない。
- 削除カスケードは ID 一致に限定し、ワイルドカード削除の経路を作らない。

## 性能

### 実測（2026-07-27、本番 <https://cookpit-web.vercel.app/>）

```
TTFB        /            2.90s（コールドスタート）
            /products    0.53s
            /recipes     0.54s
            /pantry      0.28s
            /meal-plans  0.47s

転送量      日本語フォント        4.40 MB  ← 1.44 + 1.47 + 1.49（woff2、br 圧縮不可）
（br 後）   JS+CSS /products      317 KB
            JS+CSS /products/[id] 367 KB（うち recharts 105 KB / 生 358 KB）

x-vercel-id kix1::iad1::…  → Function 実行リージョンは iad1（米国東部）
```

### 原因と対応

| 順位 | 原因                                                       | 影響                           | 本設計での対応                    |
| ---- | ---------------------------------------------------------- | ------------------------------ | --------------------------------- |
| 1    | 日本語 Web フォント 4.40 MB（他アセット合計の約 12 倍）    | 初回描画後の大規模再レイアウト | **サブセット化で約 -80%**         |
| 2    | Function が iad1（米国東部）で実行。日本からの RTT ≈ 180ms | 全ナビゲーションに加算         | 対象外（Neon 側リージョン未確認） |
| 3    | `loading.tsx` 欠落 6 ルートで Suspense 境界が無い          | 遷移が無反応に見える           | **6 ルートに追加**                |
| 4    | 商品詳細で `findById` を 2 回呼ぶ（4 往復・2 回重複）      | 1 ページ数十 ms                | 対象外（次タスク候補）            |
| 5    | ハイドレーション後の `GET /api/stores` 追加往復            | 日本→iad1 で 1 往復            | 対象外（次タスク候補）            |
| 6    | recharts が商品詳細の初期バンドルに同梱（105 KB br）       | 商品詳細の JS 約 3 割          | 対象外（次タスク候補）            |
| 7    | 全ページ `force-dynamic` でキャッシュ皆無                  | 毎回フル SSR                   | 対象外（鮮度要件と要調整）        |

順位 2 について: エッジは kix1（大阪）だが SSR は iad1 で実行されている。Tokyo（hnd1）へ
移すには Neon の DB リージョンも合わせて移す必要があり、ローカルに `.env` が無いため
Neon 側の現リージョンを確認できていない。所有者による確認が前提の項目として §未決事項 に残す。

### フォントサブセット化の設計

| 項目           | 内容                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| 手段           | `subset-font`（npm / harfbuzzjs WASM）                                             |
| Python 非採用  | `fonttools` / `pyftsubset` 未インストール、システム Python が 3.9、`brotli` も無し |
| 文字集合       | JIS X 0208 第一水準漢字（16〜47 区）+ 仮名 + 英数記号 + CJK 記号 + 全角半角形      |
| 漢字の生成方法 | 区点コード → Shift_JIS バイト列 → Node の `TextDecoder('shift_jis')` で機械生成    |
| 生成物         | `apps/web/public/fonts/zen-maru-gothic-subset-{400,500,700}.woff2` を**コミット**  |
| ビルド手順     | 増やさない（生成は手動スクリプト、成果物はリポジトリに入れる）                     |
| 見込み         | 4.40 MB → 約 0.5〜0.9 MB（-80% 前後）                                              |

漢字リストを手打ちしない理由: 第一水準は 2965 字あり、手打ちでは取りこぼしを検証できない。
区点 → Shift_JIS の変換式で機械生成すれば網羅性が構造的に保証される。Node 20+ は full ICU を
同梱するため `TextDecoder('shift_jis')` が使える。スクリプト内で既知の対応
（区 16 点 1 = `亜` = `0x889F`）を assert して変換式の正しさを自己検証する。

`@fontsource/zen-maru-gothic` は**サブセットの原本として devDependencies に残す**
（依存を消すと再生成ができなくなる）。

Android と iPhone の両方が利用端末であるため、Web フォント自体は廃止しない
（Android には丸ゴシックが標準搭載されていない）。

## テスト方針

詳細は [docs/tests/store-limit-and-render-performance.md](../tests/store-limit-and-render-performance.md)。

| 層                 | 主な観点                                                                 |
| ------------------ | ------------------------------------------------------------------------ |
| Domain             | `normalizeStoreName` の表記ゆれ、`unassignStore` の対象選択と戻り値      |
| Application        | 上限 3 件の境界（2→3 は可 / 3→4 は拒否）、同名判定、カスケードの実行順序 |
| Infrastructure     | PGlite で `deletePriceRecordsByStore` / `findAllByStore` の実挙動        |
| apps/web           | 上限到達時のボタン無効化、同名時の警告、削除ダイアログの件数表示         |
| apps/web（純関数） | `packageSizeExample` の単位別出力（可算 / g・ml / kg・l / 未知 / 空）    |
| 手動               | フォント差し替え後の見た目（実画面確認）、`loading.tsx` の骨組み表示     |

`loading.tsx` は Next.js のルーティング機構が描画するため単体テストの費用対効果が低い。
手動確認（`manual-browser-verify`）に委ねる。

## 移行とリリース

**データ移行なし。** ただし本番は上限を超える 10 件の店舗を保持した状態でリリースされる。

- 上限チェックは**新規作成時のみ**動く。既存 10 件は読み取り・削除ともに通常どおり動作する
- ユーザーは順次削除して 3 件まで下げる。2 件以下になると追加が再び可能になる（自己回復）
- 実在 3 店舗（コモディ飯田・ライフ・業務スーパー）を残し、試し入力 4 件と
  「業務スーパー」重複 3 件を削除する運用手順を、リリース後にユーザーへ案内する
- **重複「業務スーパー」の削除では価格記録が失われる可能性がある。**どの重複に価格記録が
  付いているかは削除ダイアログの件数表示で判別できる。件数が最も多いものを残す

フェーズ分割してコミットする。

| フェーズ | 内容                                      |
| -------- | ----------------------------------------- |
| A        | 店舗 3 件上限 / 同名禁止 / カスケード削除 |
| B        | 内容量の例の単位別出し分け                |
| C        | `loading.tsx` 6 件 + フォントサブセット化 |

## リスク

| リスク                                                              | 対応                                                                        |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 価格記録の消失は取り消せない                                        | 削除ダイアログで件数を明示。ADR-0013 に判断根拠を残す                       |
| 上限チェックと作成が別トランザクションで、同時実行なら 4 件目が通る | 2 人運用で店舗追加は稀。DB 制約は入れない（§DB 設計）。実害は次回削除で解消 |
| カスケード 3 段の途中失敗で中間状態が残る                           | 各段が冪等。再実行で前方回復。順序ミスは FK `restrict` が検出               |
| サブセットに無い漢字が入力されると fallback フォントで表示される    | 第一水準で日常語はほぼ網羅。発生時は unicode-range 分割へ切り替える（下記） |
| フォント差し替えで見た目が変わる                                    | 実画面確認を完了条件に含める                                                |

サブセットで取りこぼしが実際に問題化した場合の代替案: **unicode-range 分割**
（Google Fonts の日本語方式）。フォントを約 120 個の range 別スライスに分け、
ブラウザがページ内の文字を含むスライスだけを取得する。総バイト数は 4.4 MB のままだが
1 ページあたりの転送は 100〜300 KB に収まり、珍しい漢字も表示できる。
リポジトリに 4.4 MB 相当のスライスを抱える代償があるため、今回は採らない。

## 未決事項

| 項目                                                    | 判断者   | 備考                                                      |
| ------------------------------------------------------- | -------- | --------------------------------------------------------- |
| Vercel Function と Neon のリージョン（順位 2 の対応）   | ユーザー | Neon 側の現リージョン確認が前提。Tokyo 移設は両方セットで |
| 商品詳細の DB 往復削減・recharts 遅延化（順位 4・5・6） | ユーザー | 今回は対象外と決定済み。次タスク候補として保留            |
| `force-dynamic` の見直し（順位 7）                      | ユーザー | データ鮮度要件との調整が必要                              |

## 完了条件

- `pnpm lint` / `pnpm type-check` / `pnpm test` が通る
- R-1〜R-10 を満たす
- 試験計画の必須ケースが PASS
- `loading.tsx` とフォントの見た目を実画面で確認済み
- ADR-0013 を作成し、ADR-0012 に superseded を記載済み
