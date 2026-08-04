# レビュー記録: shopping-list-price-comparison（L2 / 価格差の定量表示）

- 日付: 2026-08-04
- 対象: 設計書 / 実装計画 / 試験計画 / 実装 / テスト / `docs/05-roadmap.md`
- 対象差分: ブランチ `feat/shopping-list-price-comparison`（`git diff main...HEAD`。
  コミット 4fba2d8 / 270ecd9 / b35297e / aff7684 / 960b0fa）
- 関連: `docs/designs/shopping-list-price-comparison.md` /
  `docs/implementation-plans/shopping-list-price-comparison.md` /
  `docs/tests/shopping-list-price-comparison.md` / `logs/2026-07-27.md`（単価 10 倍ズレ事故） /
  `docs/decisions/ADR-0013-store-limit-and-delete-cascade.md`

## 結論

**Must 1 件のためマージ不可。** M-1（内訳計算の未ガード `reduce` による TypeError）を直せばマージ可。
Should 7 件・Nice 8 件は申し送り（うち S-3 / S-6 / S-7 は設計変更を伴うため Orchestrator 判断）。

計算の中核（`requiredBasis` / `recordBasis` の使い分け）は**手計算と実行の両方で正しいことを確認した**。
2026-07-27 の「単価 10 倍ズレ」と同型の欠陥は無い。

## 検証方法（テストの green に頼らない独立検証）

1. **手計算での追跡**: `estimateItemPriceDiff` の式
   `unitPriceAmount * (value * requiredBasis.canonicalFactor / requiredBasis.divisor)` を、
   設計書 §計算仕様 の固定例 A〜D で独立に検算した。

   | #   | 必要量   | 記録           | `unitPriceAmount` | 手計算                      | 実装の出力                       | 判定 |
   | --- | -------- | -------------- | ----------------- | --------------------------- | -------------------------------- | ---- |
   | A   | `0.3kg`  | `500g` / ¥250  | 50 円/100g        | `50 × (0.3×1000/100)` = 150 | 対照店舗 120 円/100g との差 210  | OK   |
   | B   | `300g`   | `1kg` / ¥500   | 50 円/100g        | `50 × (300×1/100)` = 150    | 差 0 → `null`                    | OK   |
   | C   | `2l`     | `500ml` / ¥100 | 20 円/100ml       | `20 × (2×1000/100)` = 400   | 対照店舗 80 円/100ml との差 1200 | OK   |
   | D   | `2000ml` | `1l` / ¥200    | 20 円/100ml       | `20 × (2000×1/100)` = 400   | 差 0 → `null`                    | OK   |

   `recordBasis.canonicalFactor` / `recordBasis.divisor` は金額計算に一切現れず
   （`price-comparison.ts:115-117`）、`recordBasis` は `kind` の一致判定にのみ使われている
   （`:101-108`）。設計書 §計算仕様 の意図どおり。

2. **浮動小数点**: `0.3 * 1000` は IEEE754 で厳密に `300`（誤差 1.11e-14 は 300 近傍の
   ulp 5.68e-14 の半分未満で丸め上がる）。`Math.round` は**差分に対して 1 回だけ**適用され
   （`:126`）、丸め前に誤差が累積する経路は無い。`0.29kg` のような誤差が残る値でも
   `144.99999999999997 - 173.99999999999997 = 28.999999999999996 → 29` で影響しない。
3. **実行による探索**: `apps/web/node_modules/.bin/tsx` で `price-comparison.ts` を直接読み込み、
   設計書の縮退表に無い入力（全記録が `storeName === ''` / 単価差 0.5 円未満 / `value = 0` /
   `kind` 混在 / 不正 `observedAt` / 空文字単位 / `1e9` / 小数の必要量）を投入した。
   検出結果が M-1・S-1・S-2 である。

## 要件・設計・実装・試験の整合性

| 確定事項                                                | 実装                                                                | 試験                      |
| ------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------- |
| P-1 Presentation の純粋関数                             | `_utils/price-comparison.ts`（Domain/Application に差分ゼロを確認） | PC-01〜31                 |
| P-2 2 番目に安い店舗との差・`targetStoreId` 非依存      | `:125-129`                                                          | PC-08 / PC-09 / IR-37     |
| P-3 本文列へ 1 行追加・3 カラムと `w-28` バッジは無変更 | `shopping-item-row.tsx:121-123`                                     | IR-25 / IR-26             |
| P-4 未購入にも展開トリガー                              | `shopping-item-row.tsx:129-138`                                     | IR-27〜34 / LC-31 / LC-32 |
| 新規 API / DB / 契約の変更なし                          | `page.tsx` は既存 UseCase を追加呼び出しのみ                        | —                         |

対象外（`formatUnitPrice` の変更・推奨店舗バッジの変更・Sprint 7 タスク2〜4）に手を出していないことを
差分で確認した。`price-comparison.ts` の公開 4 関数はすべて本番コードから参照されており、
2026-07-27 の「置き換え元が死んだ公開関数」は発生していない。

## アーキテクチャ原則の確認

- 依存方向: `packages/domain` / `packages/application` に差分ゼロ。`price-comparison.ts` は
  `import type` のみで `@cookpit/application` を参照し、値 import が browser バンドルへ混入していない
  （2026-07-27 の `node:crypto` 混入と同型の事故なし）。
- 集約境界: 読み取り専用の表示計算であり、集約インスタンスの越境保持は無い。P-1 の逸脱理由は
  設計書に明記済みで、既存の `groupItemsByStore` と同じパターン。
- `any` なし / default export なし（`page.tsx` は Next.js 規約の例外）/ `import type` /
  `===`・`!==` / 破壊的 `sort` なし（`[...candidates]` `[...filtered]`。PC-29 が固定）。

---

## Must

### M-1: 全記録が `storeName === ''` のとき `buildStoreUnitPriceBreakdown` が TypeError で落ちる

- 箇所: `apps/web/src/app/shopping-lists/_utils/price-comparison.ts:69-73`（`findCheapestRecord`）と
  その呼び出し `:145-147`
- 事象: `pickLatestRecordPerStore` が `storeName === ''` の記録をすべて除外した結果、
  `latestRecords` が空配列になると、初期値なしの `reduce` が
  `TypeError: Reduce of empty array with no initial value` を投げる。
  実行で確認済み（`estimateItemPriceDiff` は `candidates.length < 2` で守られており `null` を返すが、
  `buildStoreUnitPriceBreakdown` だけが素通りする）。
- 影響: `ShoppingItemRow` は `breakdown` を**全行で無条件に計算する**（`shopping-item-row.tsx:69`）ため、
  該当商品を含む買い物リスト詳細画面が**レンダリング時に例外 → Next.js のエラーバウンダリで画面全体が落ちる**。
  品目名・チェック操作も含めて何も表示できない。
- 再現条件: `product.priceHistory.length > 0` かつ、その全記録の `storeName` が空文字
  （= `product.mapper.ts` の `storeMap.get(...) ?? ''` に落ちる = 参照先の店舗が `GetStoresUseCase` の
  結果に存在しない）。現状は `price_records.store_id` の FK が `restrict`
  （`packages/infrastructure/src/db/schema.ts:60-62`）で孤児レコードを防いでいるため通常運用では到達しないが、
  **同じシナリオを 1 行上で明示的に防御しておきながら、その帰結でクラッシュする**のは内部矛盾である。
  設計書 §縮退ケース一覧 #7 は総額差・内訳の双方について「候補から除外」（＝非表示に縮退）と定めており、
  現実装はこの契約を満たしていない。手動 SQL・シード・将来の店舗マージ/リネーム機能で容易に到達しうる。
- 修正案: `:145` の直後にガードを 1 つ足す（`filtered.length < 2` の判定を前倒しするのが簡潔）。

  ```ts
  const latestRecords = pickLatestRecordPerStore(product.priceHistory);
  if (latestRecords.length < 2) {
    return null;
  }
  const cheapestRecord = findCheapestRecord(latestRecords);
  ```

  併せて `findCheapestRecord` を `PriceRecordDto[] → PriceRecordDto | null` にするか、
  空配列を渡さない前提を JSDoc で固定すること。

- 試験の追補: 試験計画 PC-20 は「有効 2 件 + 空文字 1 件」の部分ケースしか見ていない
  （`price-comparison.node.test.ts:499-534`）ため、この欠陥を検出できない。
  **全記録が空文字のケース**を PC-20b として追加し、両関数が `null` を返す（例外を投げない）ことを固定する。

---

## Should

### S-1: 単価差が 1 円未満の店舗に「+0円」と表示される

- 箇所: `price-comparison.ts:170`（`Math.round(record.unitPriceAmount - cheapestValue)`）と
  `store-unit-price-list.tsx:20`（`+${entry.diffFromCheapestYen}円`）
- 事象: `unitPriceAmount` は `UnitPriceCalculator` が小数第 1 位まで保持する値
  （`unit-price-calculator.ts:27`、DB も `numeric(10,1)`）。したがって
  `100.0` と `100.4` のように **1 円未満の差**が普通に発生する。このとき 2 行目は
  `isCheapest: false` かつ `diffFromCheapestYen: 0` になり、「← 最安」でもないのに「**+0円**」と表示される。
  実行で確認済み（`{unitPriceAmount:100} / {unitPriceAmount:100.4}` → `diffFromCheapestYen: 0`）。
- 影響: 「100円 / 100g ＋ ← 最安」「100.4円 / 100g ＋ +0円」が並び、ユーザーには
  「差が無いのに片方だけ最安と言われている」ように見える。価格比較機能の中核の表示で信頼を損なう。
- 再現条件: 同一単位区分の 2 店舗で、正準単価の差が 0.5 円未満（100g 単価が 2 桁台の食材では日常的）。
- 修正案: (a) 差が 0 に丸まる行は「ほぼ同額」等の別表記にする、(b) `diffFromCheapestYen` を
  小数第 1 位まで保持して `+0.4円` と出す、(c) `isCheapest` の判定を「丸め後の差が 0」に揃える
  （＝ 100.4 も最安扱いにする）。表示仕様の選択なので Orchestrator/ユーザー確認を推奨。
  試験計画にも「非最安なのに差が 0 に丸まる」観点が無く、PC-25 は非整数差（`50.3/62.1/70.9`）だけを見ている。

### S-2: `basisLabel` が `1${packageSizeUnit}` 固定のため、数字始まりの自由記述単位で「11L」になる

- 箇所: `price-comparison.ts:174-179`、表示は `store-unit-price-list.tsx:16-18`
- 事象: `kind === 'other'` のとき `basisLabel` は `` `1${cheapestRecord.packageSizeUnit}` ``。
  `packageSizeUnit` は `parseQuantity()` が「先頭の数値の後ろ」をそのまま単位として採るため
  （`apps/web/src/lib/parse-quantity.ts:47-51`）、内容量に「1 1L」「3 500ml入り」と入力すると
  単位は `1L` / `500ml入り` になる。結果、内訳は「200円 / **11L**」「300円 / **1500ml入り**」と表示される。
- 影響: **2026-07-27 に本番で実際に検出したバグと同型**（`logs/2026-07-27.md:130-132`
  「本番に基本単位 `1L` の商品が実在し、数量を前置して `例：11L` になっていた。ユニットテストは全部通っていた」）。
  当時の学び「単位が自由記述である以上『数字で始まる単位』を想定すべきだった」が本機能に反映されていない。
- 併発する問題: `kind === 'other'` の内訳は生文字列一致を要求しない（設計書の既知の限定事項・PC-27 で固定）ため、
  「袋」と「パック」が混在すると**基準記録の単位でまとめてラベル付けされる**。実行で確認済み:
  `袋 120円 / パック 300円` → `basisLabel: '1袋'` となり、パックの価格が「300円 / 1袋」と表示される。
  比較の粗さは設計で許容済みだが、**片方の単価を他方の単位で言い切る表示**は許容範囲の外に見える。
- 修正案: (a) `basisLabel` を `1` 前置ではなく `${unit}あたり` にする、(b) 数字始まりの単位は
  `1 ${unit}`（空白挟み）にする、(c) `other` の内訳も生文字列一致を要求して混在時は非表示にする。
  いずれも設計書 §計算仕様 手順 8 の変更を伴うため Orchestrator 判断。

### S-3: 内訳の基準区分を「全記録の raw 最小単価の kind」で決めるため、比較可能な多数派が捨てられる

- 箇所: `price-comparison.ts:146-158`
- 事象: `findCheapestRecord` は `unitPriceAmount` を**単位区分をまたいで**数値比較する。
  100g 単価・100ml 単価・1 単位あたりの価格は次元が違うため、この比較に意味は無い。
  実行で確認: `1L 200円（other）/ 1L 150円（other）/ ml 18円（volume）` の 3 店舗では
  最小値 18 の volume が基準になり、比較可能だった other の 2 店舗が捨てられて `breakdown = null`。
- 影響: 価格記録が揃っているのに内訳も展開トリガーも出ない「静かな空振り」。
  実装計画 R-6 が懸念した症状（例外を投げないため気づきにくい）が、中継漏れではなくアルゴリズム側で起きる。
- 再現条件: 1 商品に単位区分の異なる記録が混在し、少数派の kind の単価が数値として小さいとき。
  自由記述単位のため混在は現実的に起こる。
- 修正案: 基準区分を「最頻の kind」または「その kind 内で 2 件以上そろう区分のうち記録数最大」で選ぶ。
  設計書 §計算仕様 手順 3 の変更が必要なので Orchestrator 判断。現状維持なら設計書の
  「既知の限定事項」に本挙動（多数派が捨てられうること）を追記すべき。

### S-4: 全商品 × 全価格履歴が毎回 RSC ペイロードに載る（低速回線への影響が S-6 の却下理由と衝突）

- 箇所: `apps/web/src/app/shopping-lists/[id]/page.tsx:26-30`、
  `shopping-list-client.tsx:101`（`ShoppingListClient` は Client Component なので `products` は
  そのままフライトペイロードへ直列化される）
- 事象: `GetProductsUseCase.execute()` はフィルタなしで**全商品 + 全期間の `priceHistory`** を返す。
  買い物リストが参照しない商品も、過去の全価格記録も含めて毎回クライアントへ送られる。
  絞り込みは `productMap` 構築後の `productMap.get()`（クライアント側）でしか行われない。
- 影響: 価格記録は削除しない限り貯まり続ける（週 1 買い物 × 20 商品で年 1000 行規模）。
  S-6 が案 B を却下した理由は「低速回線で表示が遅延する」であり、その懸念が
  N+1 から**ペイロードサイズ**へ形を変えて残る。買い物中のモバイル回線が主要ユースケース。
- 修正案: `page.tsx` で `shoppingList.items` の `productId` 集合に絞ってから `ShoppingListClient` へ渡す
  （`products.filter((p) => referencedIds.has(p.id))`）。データフローは変わらず、
  `productMap` が小さくなるだけで既存テストにも影響しない。設計書 §データフロー に 1 行追記が必要。
  併せて設計書 R-2 の「軽微（推定）」を実測値で裏取りするか、条件付きの記述に改めることを推奨。

### S-5: 補助情報の取得失敗が買い物リスト画面全体を落とす（縮退設計なし）

- 箇所: `page.tsx:26-36`
- 事象: `GetProductsUseCase` の例外は `ShoppingListNotFoundError` 以外として再 throw され、
  買い物リスト詳細画面ごと 500 になる。価格記録の 1 行でも
  `Money.of`（負値で throw）/ `Quantity.of`（負値で throw）に引っかかると、
  買い物リストそのものは健全でも画面が表示されない。
- 影響: 価格比較は**あれば嬉しい補助情報**であり、買い物中に本体（品目一覧・チェック）まで
  巻き添えで使えなくなるのは割に合わない。ブラストレディウスが本 PR で広がっている。
- 修正案: 3 本目だけ `.catch(() => [])` で縮退させ（`products` が空なら総額差・内訳が出ないだけ）、
  設計書 §エラー処理 の表に「価格取得の失敗はフォールバック（空配列）」として明記する。
  現状維持を選ぶ場合も、**意図的に縮退させない判断**であることを設計書へ書き残すべき。

### S-6: 試験計画の LC-33 / LC-34 が未実装（完了条件 §10 未達）

- 箇所: `docs/tests/shopping-list-price-comparison.md:223-224` に対し、
  `apps/web/tests/` 全体を grep しても `LC-33` / `LC-34` が存在しない。
- 内容: LC-33（`handleReassignStore` が総額差・内訳に影響しないこと＝整合性観点）、
  LC-34（フォーカス復帰 refetch が `products` を再取得しないこと＝回帰観点）。どちらも
  設計書 §データフロー が明示した性質で、壊れても型では検出できない。
- 影響: 試験計画 §10「§3（… LC-29〜34）の全観点が実装され green」を満たしていない。
  特に LC-34 は「`products` は refetch 対象に含めない」という設計判断を固定する唯一の観点。
- 修正案: `shopping-list-client.checked.test.tsx` に LC-33、`.view.test.tsx` に LC-34 を追加する。
  実装しない判断なら、試験計画側に「対象外」と理由を書いて完了条件を更新すること
  （計画と実装のどちらを直すかは Orchestrator が決める）。

### S-7: 実画面確認（MB-01〜06）の実施記録が無い

- 箇所: 設計書 §テスト方針「実装後に **390px での表示崩れ確認が必須**」、
  試験計画 §7 MB-01〜06、§10 完了条件、実装計画 Step 15。
- 事象: `docs/` `logs/` を grep しても本 feature の MB-01〜06 の PASS/BLOCKED 記録が無い。
  `logs/2026-07-30.md` は「実装 + 単体テスト」「レビュー・品質ゲート」が未チェックのままで、
  `logs/2026-08-04.md` は別セッション（進捗調査・PR 整理）の内容しか無く、本実装の記録が欠けている。
- 影響: 本 PR は品目カードに 1 行 +（未購入品目にも）展開トリガーを増やす変更で、
  リスク R-1/R-4 が「390px の実画面確認で担保する」と明記された唯一の担保手段になっている。
  静的テストだけでは `text-xs` の折り返し・タップ領域の競合を検出できない。
- 修正案: `manual-browser-verify` Skill で MB-01〜06 を実施し、PASS/BLOCKED を
  設計書または本レビュー記録へ追記する。実施できない環境なら BLOCKED として理由を残す。
  併せて `logs/2026-07-30.md`（または 08-04 のログ）に実装・レビュー工程の結果を記録すること。

---

## Nice

### N-1: 公開関数に JSDoc が無く、設計書にあったフィールドの契約コメントが実装で落ちている

`price-comparison.ts` の公開 4 関数（`estimateItemPriceDiff` `buildStoreUnitPriceBreakdown`
`formatEstimatedDiffMessage` `formatYen`）に JSDoc が無い。とくに「どの条件で `null` を返すか」は
型に表せない契約で、`.claude/rules/coding-standards.md` の JSDoc 方針に最も合致する内容。
また設計書 §コンポーネント設計 が持っていた `/** isCheapest のとき 0。 */`（`StoreUnitPriceEntry.diffFromCheapestYen`）と
`/** '100g' | '100ml' | \`1${unit}\` */`（`StoreUnitPriceBreakdown.basisLabel`）が実装（`:14`/`:18`）で
削られている。内部ヘルパー（`unitBasis`/`pickLatestRecordPerStore`）には why コメントが十分あるだけに、
公開契約側の欠落が目立つ。

### N-2: 「値なし」の表現が `null` と `undefined` で混在している

`price-comparison.ts:83` / `:139` は `product: ProductDto | undefined` を受けて `null` を返す。
`Map.get()` の戻り値をそのまま流す設計（設計書どおり）だが、
`.claude/rules/coding-standards.md`「『値なし』は `null` に統一する（`undefined` と混在させない）」とは
形式上ずれる。`shopping-item-row.tsx:67` で `?? null` に寄せて引数型を `ProductDto | null` にすれば揃う。
判断を変えないなら、設計書に「`Map.get` の戻り値を素通しするため例外的に `undefined`」と 1 行残すと良い。

### N-3: 金額表記が 3 箇所で不揃い

内訳の単価は `formatYen`（`1,234円`）、差額は `+${n}円`（カンマなし）、総額差メッセージは
`約${n}円`（カンマなし）。設計書どおりではあるが、同じパネル内で「1,234円 / 100g ＋ +1200円」のように
桁区切りが混ざる。`formatYen` に寄せるか、全て素の数値に寄せるかを揃えたい。

### N-4: `stores` テーブルを 1 リクエストで 2 回引いている

`page.tsx:28-29` の `GetStoresUseCase` と `GetProductsUseCase` がそれぞれ `storeRepository.findAll()` を呼ぶ
（`get-products.use-case.ts:12-13`。しかも UseCase 内では `await` 直列）。最大 3 行なので実害は無いが、
設計書 §コンポーネント設計 の説明は「`storeRepository()` の呼び出しが 2 回になるが軽量なファクトリ」であり、
**クエリが 2 回走る**点には触れていない。設計書の記述を実態に合わせるか、`GetStoresUseCase` の結果を
使い回す形にするか、どちらかで整合させたい。

### N-5: 不正な `observedAt` では設計書の tie-break 規則が崩れる

`pickLatestRecordPerStore`（`:62`）は `Date.parse` の結果を比較するため、値が `NaN` になると
`NaN >= NaN === false` で**先に見つかった方**が残る。設計書「実装時の技術的補足」の
「後に見つかった方を採用」と逆。DTO は必ず `toISOString()` 由来なので到達不能だが、
PC-24 が固定した規則の唯一の例外なのでコメントに一言あると安全。

### N-6: 店舗の最新記録の単位区分が違うだけで、その店舗が比較から丸ごと消える

`:97` で「店舗ごとの最新 1 件」に絞ってから `:102` で `kind` フィルタをかけるため、
ある店舗で直近に「1本」と記録した瞬間、過去の「500ml」の記録があっても比較対象から外れる。
設計書 §縮退ケース #6 の範囲内だが、自由記述単位ではユーザーの体感として
「昨日まで出ていた比較が消えた」となる。将来 S-3 と併せて再検討の候補。

### N-7: 完了（`readOnly`）時に `expandedItemId` がリセットされない

`handleComplete`（`shopping-list-client.tsx:305-321`）は `expandedItemId` を触らないため、
展開したままリストを完了すると、トリガーだけが消えてパネルが開いたまま閉じられなくなる。
bought 側では以前から `PurchaseInputForm` が操作可能なまま残る（送信すると 422）既存の穴があり、
**本 PR で悪化はしていない**（未購入側は読み取り専用の内訳が残るだけ）。スコープ外だが、
P-4 で未購入行にも展開状態が生まれたぶん遭遇確率は上がる。別タスクでの是正を推奨。

### N-8: テストのアサーションが計画よりわずかに緩い箇所

- SG-08（`store-group.test.tsx:164-189`）は計画では「総額差テキストが表示される」だが、
  実装は展開トリガーの存在確認。中継確認としては成立するが、`priceDiff` 側の中継は
  IR-25/LC-29 に依存する形になっている。
- PF-10 は「ボタン行の**直後**に表示される」という配置要件を検証していない（存在確認のみ）。
- PC-29 は `toEqual` によるコピー比較で、計画が求めた「参照同一性を含む」までは見ていない。
- PC-02 / PC-04 は `toBeNull()` のみ。`recordBasis` 取り違えは 2 店舗の単位が異なるため検出できる
  （検算済み）が、`estimatedTotal` の絶対値そのものは PC-01 / PC-03 でしか固定されていない。
  いずれも致命的ではないため Nice に留める。

---

## 確認して問題が無かった点（再レビュー時の重複防止）

- 単位換算の 4 方向（A〜D）は手計算・実行の双方で一致。`recordBasis` を金額計算に使っていない。
- `Math.round` は差分に 1 回だけ適用。丸め前に誤差が乗る経路なし。`divisor` は 100 か 1 のみで 0 にならない。
- `requiredAmount.value === 0` は全候補の総額が 0 になり差 0 → 非表示（例外なし）。負値は
  `Quantity.of` が Domain 側で拒否するため DTO に現れない。
- `'KG'` / `'Ｇ'`（NFKC で `'G'`）/ `' g '`（`parseQuantity` が trim 済み）は `kind === 'other'` に落ち、
  `UnitPriceCalculator` の正準化と**同じ判定**になる。正準化と表示が厳密一致で揃っており、
  2026-07-27 の 10 倍ズレは再発しない（PC-06 が対照実験付きで固定）。
- `packageSizeUnit` が空文字になる経路は無い（`price-record-form.tsx` の `canSubmit` が
  `parsedPackageSize.kind === 'amount'` を要求し、`parseQuantity` は単位なしを `valueOnly` に落とす）。
- P-4 の回帰: IR-12/13/14/18 は無変更で成立。`handleSetChecked` の
  「チェック解除時のみ `expandedItemId` をリセット」（`shopping-list-client.tsx:213-216`）は無変更で、
  未購入 → チェックの遷移でパネルが保持されることを LC-31 が、解除で閉じることを LC-32 が固定している。
  `readOnly` 時にトリガーが出ないことは IR-31 が固定。
- `productMap` の `useMemo` 依存配列は `[products]`。`products` は Server Component から渡る
  同一参照なので再計算されない。行ごとの `estimateItemPriceDiff` / `buildStoreUnitPriceBreakdown` は
  メモ化されていないが、品目数 × 記録数の走査であり設計書 §性能 の判断どおり問題ない規模。
- 破壊的操作なし（`[...candidates]` / `[...filtered]`）。共有される `product.priceHistory` は不変（PC-29）。
- `docs/05-roadmap.md:528` / `:535` の更新内容は実態と一致。参照リンク
  （設計書 → ADR-0013 / shopping-list-screens.md / logs/2026-07-27.md、
  `schema.ts:69` `schema.ts:126` `unit-price-calculator.ts:4-5`）はいずれも実在を確認した。

## 差し戻し先

| 指摘            | 直すべき成果物                                                 |
| --------------- | -------------------------------------------------------------- |
| M-1             | 実装（`price-comparison.ts`）+ 試験（PC-20b 追加）             |
| S-1 / S-2 / S-3 | 設計書（表示仕様・基準区分の決め方）→ 確定後に実装・試験       |
| S-4 / S-5       | 設計書（§データフロー・§エラー処理）→ 実装（`page.tsx`）       |
| S-6             | 試験（LC-33 / LC-34 の実装）または試験計画（対象外化の明記）   |
| S-7             | 実施記録（`manual-browser-verify` の PASS/BLOCKED）+ `logs/`   |
| N-1〜N-8        | 実装・設計書・試験の軽微な追補（今スプリント内で必須ではない） |
