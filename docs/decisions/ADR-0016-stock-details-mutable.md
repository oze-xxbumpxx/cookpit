# ADR-0016: Stock の数量・賞味期限・保存場所を可変にする（pantry-core S-4 の再検討）

- Status: Accepted
- Date: 2026-08-07
- 関連 feature: stock-edit

## Context（背景・なぜ判断が必要か）

Sprint 8 のゴールは「賞味期限が実データとして入り、期限切れ前に能動的に気づける」ことである。
その前提として、**現在の Cookpit では在庫の賞味期限が事実上すべて `null` になっている**。

原因は 2 つの設計判断が重なったことにある。どちらも当時は妥当だった。

1. **`docs/designs/pantry-core.md` S-4 案 α**（Unit A 設計時）
   — `Stock` の `expiresAt` / `storedLocation` を**不変**とし、
   「値の後付け（在庫編集操作）は Unit B / Phase 2 の検討事項として申し送る」と決めた
   （同書 L313-315 / 不変条件表 L796-797 / 将来課題 L1117-1118）。
2. **`docs/designs/shopping-complete-stock-selection.md` Q-1**（2026-07-25）
   — 買い物完了パネルには賞味期限を出さず、クライアントは常に `expiresAt: null` を送ると決めた。
   理由は「買い物直後に全品目の期限を入れるのは負荷が高く、パネルも縦に長くなる」。
   同書はこの帰結を申し送りとして明記している（L327-328）:

   > Stock の編集機能が無いため、Q-1 の決定により在庫の賞味期限は当面すべて `null` になる。
   > 期限管理を使いたくなった時点で「Stock 編集」または「完了パネルへの期限入力」の
   > どちらかを足す。

在庫の主要な流入経路は買い物完了（`CompleteShoppingUseCase`）であり、期限入力に対応しているのは
在庫画面からの手動追加（`AddStockUseCase`）だけである。結果として、
**ダッシュボードの「賞味期限が近い在庫」セクション（2026-07-21 実装）は、動く実装があるのに
表示すべきデータが存在しない**という状態が続いている。

判断が必要な理由は、S-4 が「不変」を**明示的な設計判断として記録している**ことにある。
記録を残さずに `readonly` を外すと、後から `pantry-core.md` だけを読んだ人には
「不変と決めたはずのフィールドが変更されている」と見える。両設計書が申し送った
「期限管理を使いたくなった時点」がまさに到来した、という時系列を明文化する必要がある。

## Decision（採用した決定）

**`Stock` の `amount` / `expiresAt` / `storedLocation` を可変にし、`updateDetails()` による
一括更新を追加する。`displayName` / `purchasedAt` / `productId` / `sourceShoppingItemId` は
引き続き不変とする。**

決定の内訳は 5 点。

### 1. S-4 の「不変」は、編集ニーズが未顕在だった時点の判断として有効だった

S-4 案 α は「実装しない」という選択であり、当時は編集ニーズ自体が観測されていなかった。
不変性を保つコストはゼロで、緩めるコストは後から払えるため、先送りは正しい順序だった。

本 ADR はその判断を**覆すのではなく、申し送られた条件が満たされたので実行する**ものである。
`pantry-core.md` の Status・本文は書き換えない（superseded な記述を後から編集すると判断の
時系列が読めなくなる。ADR-0015 が ADR-0012 に対して採った方針と同じ）。

### 2. `amount` も編集対象に含める（ユーザー確定・2026-08-07）

roadmap Sprint 8 タスク 1 の文言は「賞味期限・保存場所の後付け」であり、設計時の推奨案も
その 2 項目に限る案 A だった。ユーザー確定により `amount` を追加する。

理由は、**`consume()` は在庫を減らすことしかできず、増やすことも打ち間違いを直すこともできない**
という実態にある。「3 個」を「30 個」と打ち間違えて登録した場合、現状の回復手段は
「廃棄して作り直す」しかない（下記 §Alternatives 案 A の却下理由を参照）。

`amount` はもともと `Stock` で唯一の可変フィールド（`consume()` が書き換える）であり、
`private readonly` を外す必要すらない。不変性の緩和という観点では
`expiresAt` / `storedLocation` の 2 つだけが新しい。

`displayName` を含めない理由は、表示専用文字列の変更にとどまらず、将来 Product 連携
（`RecipeIngredient.productRef` / #114）が入った場合の整合性検討が必要になるためである。
実データで打ち間違いの困りごとが観測された時点で別ユニットとして再検討する。

### 3. Entity の同一性を保った更新とし、差し替え方式は採らない

`Stock` は `StockId` を持つ Entity であり、同一性を保ったまま属性が変わることは正当である。
`Stock.updateDetails(props)` で自身の状態を書き換え、`Pantry.updateStockDetails(stockId, props)`
が対象を検索して委譲する（見つからなければ `StockNotFoundError`。`consumeStock` /
`discardStock` と同じ形に揃える）。

同一集約内で可変フィールドを持つ前例は `Product`（`update()`）・`Store`（`rename()`・ADR-0015）に
すでにある。`Product.updatePriceRecord(id, props)` という一括更新の先例もあり、
メソッドの形はこれに揃える。

`PriceRecord` が採っている差し替え方式（新インスタンスを生成して配列内を置換）は採らない。
`PriceRecord` は「ある時点の観測値」という**記録**なので差し替えが意味論に合うが、
`Stock` は現在の状態を表す Entity であり、かつ `sourceShoppingItemId`（買い物完了の冪等キー）を
引き継ぐ必要があるため、差し替えは取り違えの事故を招きやすい。

### 4. API は `PUT /api/pantry/stocks/:stockId`（全項目必須・`null` でクリア）とする

`ADR-0015` 案 C が `PATCH` を却下した理由がそのまま当てはまる。更新可能なフィールドが
編集ダイアログで常に一緒に表示・編集される以上、部分更新と全体置換は実質一致し、
「キー省略＝変更しない」と「`null` 明示＝クリア」の区別をクライアント・サーバー双方で
常に正しく扱う実装コストを払う理由がない。既存の `PUT /api/products/:id` /
`PUT /api/stores/:id` /「価格記録の編集」とも構造が揃う。

`updateStockSchema` は `addStockSchema` から `displayName` を除いた形になる。

### 5. Repository の `onConflictDoUpdate.set` を 4 列へ拡張することを決定の一部とする

`DrizzlePantryRepository.save()` は集約全体を差分同期する方式で、既存行の更新は
`set: { amountValue: sql\`excluded.amount_value\` }` の 1 列だけを行う。

**この `set` 句の拡張は実装詳細ではなく、本決定が成立するための条件である。**
Domain と API を正しく実装しても、`set` 句を直さない限り DB には反映されない。しかも
API は 200 を返し、画面はレスポンス DTO（メモリ上の集約）を描画するため**一見成功して見え、
リロードして初めて消えたと分かる**。UseCase 単体テストとコンポーネントテストでは検出できず、
PGlite を使った Infrastructure 層のテストでのみ検出できる。

必要な列は `amountValue` / **`amountUnit`** / `expiresAt` / `storedLocation` の 4 つ。
`amountUnit` が現状の `set` 句に無いことに注意が必要で、これは
「**数量の値は反映されるが、単位を変えると反映されない**」という同じ罠のもう 1 つの顔である。
回帰テストには単位を変更するケースを必ず含める。

不変のまま残すフィールド（`displayName` / `purchasedAt` / `productId` /
`sourceShoppingItemId`）は `set` 句に追加しない。将来これらを編集対象に含める場合は
同じ罠が再発するため、本 ADR と設計書の該当節を必ず参照すること。

## Alternatives（検討した非採用案と却下理由）

### 案 A: 不変のまま維持し、「廃棄して作り直す」運用を続ける（却下）

在庫の廃棄（`POST /api/pantry/stocks/:stockId/discard`）と手動追加
（`POST /api/pantry/stocks`）はどちらも実装済みなので、期限や数量を直したければ
「消して作り直す」ことは技術的には今すぐ可能である。コード変更も ADR も不要。

却下理由は 2 つある。

1. **買い物完了の冪等ガードが壊れる。** 買い物完了経由で作られた在庫は
   `sourceShoppingItemId` を持ち、`stocks.source_shopping_item_id` の UNIQUE 制約と
   `Pantry.hasStockFromShoppingItem()` の二段で「再開 → 再完了で二重追加されない」ことを
   担保している（`shopping-complete-stock-selection.md` R-4 / S-3）。廃棄すると行ごと
   物理削除されるためこのキーが失われ、**同じ買い物リストを再完了すると同じ品目が
   もう一度在庫に入る**。手動で作り直した在庫は `sourceShoppingItemId: null` になるので、
   重複した 2 件が残る。
2. **`purchasedAt` を失う。** 作り直した在庫の購入日は操作日になる。
   `DrizzlePantryRepository.find()` は `purchasedAt` 順（FIFO）で返すため、
   一覧の並びが実態とずれる。

「賞味期限を 1 日直したい」という目的に対して、冪等性と購入日を失うのは代償が過大である。

### 案 B: `expiresAt` のみ可変にし、`storedLocation` と `amount` は不変のまま残す（却下）

不変性の緩和を最小限にする案。Sprint 8 の主目的（期限データを入れる）だけは満たせる。

却下理由: roadmap Sprint 8 の完了条件が「既存の在庫に後から**期限・保存場所**を設定できる」と
両方を明記している。さらに `pantry-screens.md` P-3 は、保存場所の設定 UI が無いために
在庫画面の保存場所別グルーピングが MVP1 では「保存場所未設定」の単一グループにしかならない、
という既知の制約を記録している（同書 P-3 / R-3）。`storedLocation` を外すとこの制約が残り続ける。
`amount` はユーザー確定により含める（上記 Decision 2）。

### 案 C: `PATCH /api/pantry/stocks/:stockId`（部分更新）として実装する（却下）

将来 `displayName` などを編集対象に加えたとき、キーを足すだけで済む柔軟性がある。

却下理由: ADR-0015 案 C と同じ。「省略と `null` の違い」を常に正しく扱うコストに見合う
利点がなく、既存の `PUT` 群と不揃いになる。編集ダイアログは 3 フィールドを常に一緒に
表示・編集するため、部分更新の意味論が活きる場面がない。

### 案 D: `Stock` を不変に保ち、更新は新インスタンスへの差し替えで表現する（却下）

`Product.updatePriceRecord()` が `PriceRecord` に対して行っている方式。`readonly` を
一切外さずに済む。

却下理由: Decision 3 のとおり。`Stock` は `StockId` を持つ Entity であり、
`PriceRecord`（ある時点の観測値という記録）とは意味論が異なる。差し替えでは
`sourceShoppingItemId` / `purchasedAt` / `productId` を手作業で引き継ぐことになり、
1 つ落とすと冪等ガードが静かに壊れる。`Stock.reconstruct()` が全フィールドを受け取れるため
技術的には可能だが、事故の可能性に対して得るものがない。

## Consequences（良い影響・悪い影響・残るリスク）

良い影響:

- roadmap Sprint 8 の完了条件 2 件（「買い物完了時に賞味期限を入力できる（任意）」
  「既存の在庫に後から期限・保存場所を設定できる」）が満たされる。
- **Unit B（賞味期限アラート）のデータが揃う。** 現状はアラートを実装しても発火対象が
  ほぼ存在しない。本決定が Unit B の前提条件になる。
- `pantry-screens.md` P-3 / R-3 が記録した「保存場所別グルーピングが単一グループにしか
  ならない」という制約が解消する。
- DB スキーマ変更・データ移行が不要（`stocks.expires_at` / `stored_location` は
  nullable 列として既存）。
- 打ち間違えた数量を、冪等キー（`sourceShoppingItemId`）と購入日を失わずに直せる。

悪い影響 / 残るリスク:

- **`Stock` の不変性が失われる。** 以後 `Stock` のインスタンスを共有する箇所では
  「途中で値が変わりうる」前提が必要になる。現状 `Stock` は UseCase 内で取得して DTO 化するか、
  `GenerateShoppingListUseCase` の在庫引き算内で消費されるだけで、長命な参照を持つ箇所は無い。
- **単位を変更すると在庫引き算の噛み合いが変わる。**
  `GenerateShoppingListUseCase.applyPantryDeduction` は「単位不一致は差し引かず全量購入」
  （`pantry-shopping-integration.md` D-1）・「数えられる単位（`isCountableUnit`）のみ切り上げ」
  （同 P-1）で動く。在庫の単位を `個` → `g` に編集すると、それまで差し引けていた食材が
  差し引けなくなる（またはその逆）。本決定は引き算の挙動そのものを変えないが、
  **ユーザー操作でこの経路の結果を変えられるようになる**。編集 UI から単位を変えられる以上、
  避けられない帰結として受容する。
- **`onConflictDoUpdate.set` の罠が将来再発しうる。** 今回 4 列へ拡張するが、
  編集対象フィールドを増やすたびに同じ見落としが起こる。しかも症状が
  「API 200・画面は正しい・リロードで消える」なので気づきにくい。Decision 5 と
  設計書 §実装上の罠 に対策を記録した。
- **編集履歴を残さない**（誰が・いつ・元の値は何だったか）。元の値は画面から確認できなくなる。
  既存の削除・リネーム（ADR-0015）と同じ思想であり、監査ログは MVP の対象外。
  消費・廃棄の undo・履歴（`stock_events` 相当）は Sprint 8 タスク 4 / Unit C の主題であり、
  本決定はそれを前倒ししない。
- `DrizzlePantryRepository.save()` の集約丸ごと保存方式が持つ lost update リスク
  （`pantry-core.md` R-4「同時更新で失われた更新／復活が起こりうる」）は解消しない。
  書き込み操作が 1 つ増えるぶん、2 人運用での並行書き込みの窓はわずかに広がる。
  トランザクション / UoW の導入は Sprint 10 タスク 3（ADR-0006 → `pantry-core.md` R-3）の主題。

## Migration（移行が必要な場合の手順。不要なら「対象外」）

**対象外。** DB スキーマ変更・データ移行は不要。`stocks.expires_at`（`date` 型・nullable）と
`stocks.stored_location`（`text` 型・nullable）は既存の列であり、新設する
`PUT /api/pantry/stocks/:stockId` は既存エンドポイント（`GET /api/pantry` /
`POST /api/pantry/stocks` / `POST .../consume` / `POST .../discard`）と共存し、
破壊的変更を伴わない。

本番 DB に現存する「賞味期限が `null` の在庫」は、本決定によって画面から後付けできるようになる。
一括で埋めるバッチは用意しない（どの在庫にいつの期限を入れるかは人にしか判断できない）。

## Rollback（決定を戻す場合の手順）

1. `PUT /api/pantry/stocks/:stockId` のルート（`apps/web/src/server/routes/pantry.ts`）を削除する。
2. `UpdateStockDetailsUseCase` と `UpdateStockDetailsInputDto`、`updateStockSchema` を削除する。
3. `Pantry.updateStockDetails()` と `Stock.updateDetails()` を削除し、
   `stockExpiresAt` / `stockStoredLocation` を `private readonly` へ戻す。
4. `DrizzlePantryRepository.save()` の `onConflictDoUpdate.set` を
   `{ amountValue: sql\`excluded.amount_value\` }` へ戻す。
5. `StockEditDialog` と `stock-row.tsx` の編集導線、買い物完了パネルの期限入力を削除する
   （`complete-shopping-panel.tsx` の `expiresAt` を `null` 固定へ戻す）。

DB スキーマ・保存済みデータへの影響が無いため、ロールバックはコードの巻き戻しのみで完結する。
すでに設定された賞味期限・保存場所は列に残り、`GetPantryUseCase` 経由で読み出され続ける
（データとして正常な状態であり修復は不要）。以後編集できなくなるだけである。

## References

- 設計書: `docs/designs/stock-edit.md`
- 要件定義書: `docs/requirements/stock-edit.md`
- `docs/designs/pantry-core.md` §S-4（本 ADR が再検討する判断）/ §R-3 / §R-4
- `docs/designs/shopping-complete-stock-selection.md` §Q-1 と §申し送り（L327-328）
- `docs/designs/pantry-screens.md` §P-3 / §R-3（保存場所グルーピングの既知の制約）
- `docs/designs/pantry-shopping-integration.md` §D-1 / §P-1（在庫引き算と単位の関係）
- [ADR-0015: 店舗のリネームを「誤字訂正」目的で採用する](./ADR-0015-store-rename-for-typo-correction.md)
  （`readonly` 除去 + 編集 API 追加の同型の先例。§Alternatives 案 C が `PATCH` 却下の出典）
- [ADR-0006: 買い物リスト生成を冪等にする](./ADR-0006-shopping-list-generate-idempotent.md)
  （トランザクション境界の将来課題）
- `docs/05-roadmap.md` Sprint 8 タスク 1・2 と Unit A
