# レビュー記録: product-detail-performance（L2 / Sprint 7 タスク4）

- 日付: 2026-08-07
- 対象: 設計書 / 実装計画 / 試験計画 / 実装差分 / テスト / `docs/05-roadmap.md`
- 対象差分: `git diff 33db736..HEAD`（実装は `1fd610d` の 1 コミット、文書は `5abec3a`）
- 関連: `docs/designs/product-detail-performance.md` /
  `docs/implementation-plans/product-detail-performance.md` /
  `docs/tests/product-detail-performance.md`
- 前提として受け入れた検証（Orchestrator 実施済み・本レビューでは再検証しない）:
  クエリ削減（`findById` 1 + `findAll` 1・`storeRepository.findById` 0）/ バンドル分離
  （374 KB → 373 KB の独立オンデマンドチャンク・初期ロード参照 0 件）/ 実画面等価性
  （最安店舗「ライフ / 80円」が `cheapest-store` API と一致）/ 品質ゲート。

## 結論

**Must 1 件（M-1: 価格記録 0 件の商品でレイアウトシフトが新規に発生し R-4 を満たさない）。**
実装の中核（クエリ削減の等価性・recharts 分離の切り出し方）は設計どおりで、
Domain / api-contract に diff は無く（R-5 充足）、コーディング規約違反は検出されなかった。
Should 6 件は文書側の整合と将来の不整合予防、Nice 7 件は申し送り。

M-1 以外は「動作は正しいが将来ずれる」型の指摘であり、M-1 も修正コストは小さい（後述）。

## 検証方法（テストの green に依存しない独立確認）

1. 差分 8 ファイルを全文読み、`GetCheapestStoreUseCase` / `product.mapper.ts` /
   `price-history-chart.tsx` / `product-detail-client.tsx` の該当箇所と突き合わせた。
2. 店舗名縮退の等価性は `DrizzleStoreRepository`（`packages/infrastructure/src/repositories/drizzle-store.repository.ts:10-31`）の
   `findById` / `findAll` の SQL を読み、`findAll` に絞り込み・LIMIT・論理削除が無いことを確認した。
3. レイアウトシフトは `price-history-chart.tsx:92-105`（空状態と `ChartContainer` の class）と
   `price-history-chart-skeleton.tsx:2`、および `product-detail-client.tsx` のチャート直下の
   DOM（削除ボタン）を読んで、記録 0 件経路の高さ差を机上で算出した。
4. `cheapestStoreAt` / `latestPriceRecordAt` / `latestRecordsByStoreAt`
   （`packages/domain/src/product/product.ts:225-244, 313-325`）を読み、
   新旧 UseCase の計算が同一入力・同一手順であることを確認した。
5. 文書は roadmap Sprint 7 表（`docs/05-roadmap.md:563-570`）・設計書ステータス欄・
   試験計画のテーブル構造を実ファイルで確認した。

## Must

### M-1: 価格記録 0 件の商品で、スケルトン → 空状態の高さ差によりレイアウトシフトが新規発生する（R-4 未達）

- 該当箇所:
  - `apps/web/src/app/products/[id]/_components/price-history-chart-skeleton.tsx:2`（`h-64` = 256px 固定）
  - `apps/web/src/app/products/[id]/_components/price-history-chart.tsx:92-98`
    （`priceHistory.length === 0` の early return は `px-3 py-8` の `<p>` = 概算 84px。`h-64` ではない）
  - `apps/web/src/app/products/[id]/_components/product-detail-client.tsx:196`
    （0 件でも `PriceHistoryChart` を無条件に dynamic レンダ）
  - `apps/web/src/app/products/[id]/_components/product-detail-client.tsx:262-269`
    （チャート直下・条件なしで描画される「この商品を削除」ボタン。
    「最近の記録」セクションは 0 件時に描画されないため、直下はこのボタンになる）
- なぜ問題か:
  - 記録あり（256px → 256px）は MB-01 で高さ不変を実測済みだが、**記録 0 件の商品では
    スケルトン 256px → 空状態 84px へ約 170px 縮む**。設計書 R-4「遅延読み込み中も
    レイアウトシフトが発生しない」は無条件の要件で、この経路は満たしていない。
  - 変更前はスケルトンが存在しなかったため、これは**本変更で新規に持ち込まれたシフト**。
  - 動くのが破壊的操作（商品削除）のボタンであり、読み込み完了直前にタップすると
    誤タップの実害があり得る（PWA・390px 幅・親指操作前提）。
  - 商品は「作成 → 詳細画面で最初の価格を記録」の流れで使われるため、0 件状態は
    例外ケースではなく通常の初期状態である。
  - 試験計画は MB-01 に「価格記録を 3 件以上持つ商品」という前提しか置いておらず、
    0 件経路の CLS 観点が試験計画自体から漏れている（PDC-14 は描画有無のみ確認）。
- 修正案（コード変更は implementer 担当。いずれか）:
  1. **推奨**: 空状態 UI を recharts 非依存のファイルへ移す。例えば
     `price-history-chart-skeleton.tsx` に `PriceHistoryChartEmpty` を追加し、
     `product-detail-client.tsx` 側で
     `product.priceHistory.length === 0 ? <PriceHistoryChartEmpty /> : <PriceHistoryChart ... />`
     とする。0 件時は dynamic import 自体が走らないためシフトが原理的に起きず、
     recharts チャンクの無駄な取得も消える（N-3 も同時解消）。
     `price-history-chart.tsx` 側は同ファイルから `PriceHistoryChartEmpty` を import して
     early return を維持すればよい（chart → skeleton 方向の import は初期バンドルへ
     recharts を引き戻さないため安全。逆方向は設計書 §変更後構成 B の罠に該当するので不可）。
     PDC-14 は「dynamic 解決を待たずに空状態が描画される」へ意図が変わるため試験計画の更新が必要。
  2. スケルトン側を空状態と同じ高さにする分岐を持たせる（`loading` は props を受け取れないため
     `dynamic` の `loading` ではなく呼び出し側で出し分ける形になり、実質 1 と同じ構造になる）。
- 格下げ余地（Orchestrator 判断）: 「0 件商品でのみ、下にあるのは削除ボタン 1 個だけ」を
  許容範囲と判断するなら Should へ格下げ可。ただしその場合は
  **R-4 に「価格記録 1 件以上の場合」という但し書きを設計書と試験計画へ明記**し、
  暗黙の未達を残さないこと。

## Should

### S-1: `CheapestStoreResultDto` の組み立てが 2 箇所に重複し、等価性がテストだけで担保されている

- 該当箇所: `packages/application/src/product/get-cheapest-store.use-case.ts:19-39` と
  `packages/application/src/product/get-product-detail.use-case.ts:36-55`
- 事実確認: `cheapestStoreAt` / `latestPriceRecordAt` の利用箇所は本体 3 ファイル
  （上記 2 つ + `packages/application/src/shopping-list/ingredient-aggregation.ts:216`）だが、
  3 番目は StoreId を得るだけで DTO を組まない。したがって**重複しているのは 2 箇所**で、
  「同じ計算が 3 箇所」という懸念は現時点では 2 箇所である。
- なぜ問題か: 5 つのフィールド（`storeId` / `storeName` / `latestPrice` / `unitPrice` /
  `packageSizeUnit`）と null 判定の順序が完全なコピーになっている。片方だけ直したときに
  検知するのは `GPD-03`（`toEqual` 突き合わせ）だけであり、`GetCheapestStoreUseCase` 側を
  変えた場合も `GetProductDetailUseCase` 側を変えた場合も落ちるが、**なぜ落ちたかを
  読み解く手掛かりがコードに無い**（「この 2 つは同値であるべき」という意図がコードに現れていない）。
  かつ `GET /api/products/:id/cheapest-store` に専用テストが無い（試験計画 §Hono ルートに記載の既存ギャップ）
  ため、公開 API 側の期待値は実質 `GPD-03` に相乗りしている。
- 修正案: `product.mapper.ts` に純関数を切り出し、両 UseCase から呼ぶ。
  例: `toCheapestStoreResultDto(product: Product, at: Date, resolveStoreName: (id: StoreId) => string): CheapestStoreResultDto | null`。
  `GetProductDetailUseCase` は `(id) => storeMap.get(id.value) ?? ''` を渡し、
  `GetCheapestStoreUseCase` は既存どおり `findById` の結果から名前を渡す（クエリ本数・レスポンス形は不変＝R-2 維持）。
  これで等価性が「テストで担保」から「同一実装を共有」へ変わる。
  ただし既存 UseCase の内部変更を伴うため、**設計書 §対象外「`GetCheapestStoreUseCase` 自体の
  変更なし」に触れる。本タスク内で実施するか別タスクにするかは Orchestrator 判断**。
  少なくとも両ファイルに相互参照コメント（「もう一方と同値であるべき。変更時は両方直す」）を
  入れる案は今回のスコープで実施可能。

### S-2: `h-64` がスケルトンとチャートに独立してハードコードされている

- 該当箇所: `price-history-chart-skeleton.tsx:2`（`h-64 w-full ...`）/
  `price-history-chart.tsx:105`（`ChartContainer className="h-64 w-full aspect-auto ..."`）
- なぜ問題か: MB-01 の PASS（高さ 256px 一致）は**この 2 つのリテラルが偶然一致していること**に
  依存している。将来チャート側だけを `h-72` 等に変えても lint / tsc / 既存 RTL は通り、
  レイアウトシフトが静かに復活する（`docs/06-ai-tools.md` の「静的チェックすり抜け」型）。
- 修正案: 高さクラスを共有定数にする。
  `price-history-chart-skeleton.tsx` に
  `export const PRICE_HISTORY_CHART_HEIGHT_CLASS = 'h-64 w-full';` を置き、
  `price-history-chart.tsx` からそれを import して `cn()` で合成する。
  **定数の置き場所は skeleton 側（recharts 非依存・初期バンドル側）でなければならない**
  — chart 側に置いて skeleton から import すると recharts が初期バンドルへ戻り、
  本タスクの成果が消える（設計書 §変更後構成 B の指摘と同型）。
  文字列リテラルは Tailwind のスキャン対象に残るのでクラス消失は起きない。
- 代替（低コスト）: 両ファイルに「もう一方と高さを一致させること」コメントを入れる。

### S-3: `it.todo('PDC-15 ...')` は何も実行せず、試験計画の完了条件と矛盾する

- 該当箇所: `apps/web/tests/app/products/[id]/_components/product-detail-client.test.tsx:237-239`
- 事実: 試験計画 §完了条件 は「GPD-01〜06、PDC-13〜15 がすべて実装され pass する」と規定するが、
  `it.todo` は pass ではなく todo として集計される（品質ゲートの「web 759 + 1 todo」がこれ）。
  一方 PDC-15 の意図（試験計画 74 行目）は「既存 PDC-01・02・08 が**無修正で pass する**」という
  回帰であり、専用テストケースを追加する必要はない性質のもの。恒久的に消えない todo が
  テスト出力に残ると、以後の実行で「未実装のテストがある」というノイズを出し続ける。
- 修正案: `it.todo` を削除し、`docs/tests/product-detail-performance.md` の PDC-15 行と
  完了条件に「PDC-15 は既存 PDC-01/02/08 が無修正で pass することで担保（専用ケース不要・
  実施日 2026-08-07 確認）」と実施結果を書く。テストファイルに残す必要があるなら
  `it.todo` ではなく既存テストへのコメントにする。

### S-4: 試験計画の BLD 表・MB 表が Markdown テーブルとして壊れている

- 該当箇所: `docs/tests/product-detail-performance.md:112-133`（BLD）・`152-192`（MB）
- 事実: どちらも「ヘッダ行の直後に実施結果の引用ブロックを挿入し、区切り行とデータ行が
  その後に続く」形になっている。BLD 表はヘッダ（112-113）の後に区切り行が無く、
  MB 表は区切り行（188）がデータ行より後にある。GitHub / エディタのプレビューでは
  表として描画されず、`| BLD-01 | ... |` が生のパイプ行として並ぶ。
- なぜ問題か: 試験計画は後続タスクが PASS 基準を参照する一次資料であり、
  読めない形で残ると次に同種の性能タスクをやる人がこの手順を再利用できない。
- 修正案: 実施結果の引用ブロックを各表の**直後**へ移動し、表の
  ヘッダ → 区切り → データ行の順序を復元する。内容の書き換えは不要。

### S-5: 設計書ステータスと roadmap のタスク状態が更新されていない

- 該当箇所: `docs/designs/product-detail-performance.md:3`（`- ステータス: draft`）/
  `docs/05-roadmap.md:570`（Sprint 7 タスク4 の「出典・補足」列が
  「2026-07-27 積み残し」のまま）
- 事実: 同じ表のタスク2・3 は `✅ 実装済み（2026-08-06・<設計書パス>）` の形式で更新されている。
  他の設計書のステータス欄も `confirmed` / `実装済み` / `確定` が使われており（`docs/designs/*.md`）、
  `draft` のまま実装・テスト・実画面確認まで完了している状態は前例と整合しない。
  Sprint 7 の 完了条件チェックリスト（574-577 行）にも本タスクに対応する項目が無い。
- 修正案: 設計書ステータスを `実装済み（2026-08-07）` 等へ更新し、roadmap タスク4 を
  `✅ 実装済み（2026-08-07・docs/designs/product-detail-performance.md）` に更新する。
  Sprint 7 が本タスクで締まる旨（設計書 §背景の主張）を完了条件へ 1 行追加するかも
  Orchestrator が判断すること。

### S-6: 設計書 §未決事項 2・3 の決着が記録されていない

- 該当箇所: `docs/designs/product-detail-performance.md:543-548`
- 事実: 未決事項2（案1 で進めてよいか）は実装が案1 で完了しているのに「最終選択は
  ユーザー確認を経て確定する」のまま。未決事項3（`ssr: false` のちらつき許容可否）は
  MB-04 が「所見」（`docs/tests/...md:179-181`: dev で 1.4 秒・2 回目はキャッシュで
  スケルトン非観測・本番体感は残件）を記録しただけで、**許容する/しないの判断が
  どこにも書かれていない**。
- なぜ問題か: 後から読んだ人が「`ssr: false` は検討の上で受け入れたのか、判断を忘れたのか」を
  区別できない。ちらつきが問題化したときの再検討起点も失われる。
- 修正案: 設計書 §未決事項 に決着を追記する。案1 採用の確定日と、
  「`ssr: false` は維持。本番環境での体感は Sprint 9（性能タスク）で再評価する。
  許容できなければ `ssr: true` へ戻す（切り替えは `dynamic()` のオプション 1 行）」の形で
  判断と再訪条件を残す。ユーザー確認が必要なら Orchestrator 経由で確定させること。

### S-7: JSDoc に `cheapestStore` が `null` になる条件が書かれていない（設計書の指示と不一致）

- 該当箇所: `packages/application/src/product/get-product-detail.use-case.ts:7-12` /
  `packages/application/src/product/product.dto.ts:34-37`
- 事実: 設計書 §バックエンド設計 は「JSDoc を付与する（型に表せない契約情報のみ:
  `cheapestStore` が `null` になる条件など）」と明示しているが、実装の JSDoc は
  クエリ本数と `@throws` のみで、null 条件が無い。`ProductDetailResultDto` にも JSDoc が無い。
  型（`CheapestStoreResultDto | null`）からは「どういうときに null か」が読み取れない。
- 修正案: JSDoc に 1 行追加する。例:
  「`cheapestStore` は、現時点（`new Date()`）以前の `observedAt` を持つ価格記録が
  1 件も無い商品では `null`（価格記録 0 件の商品を含む）」。
  クエリ本数の記述（実装詳細寄り）は残す価値がある（回帰ガードの意図説明になっている）ので削らなくてよい。

## Nice

### N-1: 店舗名縮退の等価性は「`findAll()` が全店舗を無条件に返す」実装前提に依存している（明文化推奨）

重点観点2 への回答。**現時点でずれるケースは見つからなかった。**根拠:

- `DrizzleStoreRepository.findAll()`（`drizzle-store.repository.ts:17-20`）は
  `select().from(stores).orderBy(stores.createdAt)` のみ。WHERE / LIMIT / 論理削除フラグが無く、
  `findById()`（同 10-15 行）が返せる行は必ず `findAll()` にも含まれる。
  `stores` は ADR-0013 由来の上限 3 件の小テーブルでページングも無い。
- 旧実装は `findAll()`（#2）と `findById()`（#4）を別トランザクションで撃つため、
  その間に店舗が変更されると `product.priceHistory[].storeName` と
  `cheapestStore.storeName` が食い違い得た。新実装は 1 回のスナップショットから両方を
  解決するので**旧実装より整合性が高い**（`GPD-05` が両方 `''` になることを固定しているのも同じ趣旨）。
- 残るのは将来リスクのみ: `findAll()` にフィルタ（アーカイブ・LIMIT・ページング）が入ると、
  最安店舗名だけが静かに `''` へ縮退する。in-memory フェイクの `findAll()` は全件返すため、
  既存の GPD テストでは検知できない。
- 提案: `GetProductDetailUseCase` に「`storeRepository.findAll()` が全店舗を無条件に返すことを
  前提に店舗名を解決している」旨の Why コメントを 1 行入れる（規約の「Why が非自明な時のみ」に合致）。

### N-2: `GPD-05`（店舗が見つからない縮退）が `GetCheapestStoreUseCase` と突き合わせられていない

`GPD-03` の等価性突き合わせは店舗が seed 済みのケースのみ。縮退経路（`storeName === ''`）は
新 UseCase 単独の期待値しか固定していない。`GPD-05` に
`expect(result.cheapestStore).toEqual(await new GetCheapestStoreUseCase(...).execute('product-1'))`
を 1 行足せば、S-1 の重複が残る間の等価性ガードが縮退経路まで広がる。

### N-3: 価格記録 0 件の商品でも recharts チャンク（373 KB）を取得している

`product-detail-client.tsx:196` は 0 件でも dynamic import を走らせ、読み込んだ recharts を
使わずに空状態を描画する。M-1 の修正案1 を採ると同時に解消し、
「まだ価格を記録していない商品」の初回表示が最も軽くなる。

### N-4: スケルトンが `aria-hidden="true"` のみで、読み込み中であることが支援技術に伝わらない

`price-history-chart-skeleton.tsx:2`。見出し「価格推移」が外側にあるため文脈は失われないが、
スクリーンリーダー利用時は「価格推移」の直後に何も無い状態になる。
`role="status"` + `aria-label="価格推移を読み込み中"` を付ける選択肢がある（MVP1 の
アクセシビリティ方針の範囲外なら不要）。

### N-5: 既存の非整合（申し送り・今回のスコープ外）

`cheapestStoreAt(at)` は `observedAt > at` の記録を除外する
（`packages/domain/src/product/product.ts:313-319`）が、`latestPriceRecordAt(storeId)` は
時点フィルタを持たない（同 225-231）。したがって未来日付の価格記録がある商品では、
**最安店舗の判定は「今まで」で行い、表示する価格・単価は未来の記録から取る**という
ずれが起こり得る。新 UseCase はこの挙動を旧 `GetCheapestStoreUseCase` から忠実にコピーしており
（＝等価性は保たれている）、本タスクの責任範囲ではない。未来日付の記録を入力できるかは
未確認。気づきとして記録するのみ。

### N-6: `toCheapestStoreResult` の `latestPriceRecord === null` 分岐は到達不能に見える

`cheapestStoreAt` が返す StoreId は価格記録から導出されるため、その店舗の
`latestPriceRecordAt` が `null` になる経路は無い。旧 UseCase と同じ防御コードなので
そのまま維持で問題ない（消すと等価性の見た目が崩れる）。指摘ではなく確認事項。

### N-7: 作業ログ `logs/2026-08-07.md` が未作成

`logs/` の最新は `2026-08-06.md`。CLAUDE.md「前回作業は `logs/` の最新ファイル」の運用上、
本タスク（2026-08-07 実施）の記録が残らない。Orchestrator がタスク締めで作成する運用なら本項は無視可。

## 重点観点への回答（サマリ）

1. **ロジック重複**: DTO 組み立ての重複は 2 箇所（3 箇所ではない）。挙動は等価だが等価性の
   担保が `GPD-03` のみでコードに意図が現れていない → S-1（純関数抽出、または相互参照コメント）。
   「既存 2 つを残す」判断自体は妥当（`GetProductUseCase` は編集画面、`GetCheapestStoreUseCase` は
   公開 API の呼び出し元があり、設計書 §案2 却下理由が具体的で筋が通っている）。
2. **空文字縮退の等価性**: 現行実装ではずれない（N-1 に根拠を記載）。新実装のほうが
   スナップショット整合性が高い。将来 `findAll()` にフィルタが入ると静かに壊れるため
   前提の明文化を推奨。
3. **`ssr: false` の妥当性**: 妥当。(a) 本アプリは 2 人で使う PWA（`docs/01-overview.md:5`）で
   商品詳細に SEO 要件が無く、`force-dynamic` 運用。(b) 価格データ自体は「最安店舗」「最新価格」
   カードと「最近の記録」リストとしてサーバー HTML に含まれており、チャートは可視化の重複。
   (c) recharts は DOM 計測前提（`ResponsiveContainer`）で SSR 出力に意味が薄く、
   `ssr: false` によりサーバーバンドルと SSR コストも落ちる。
   残件は体感のみ（MB-04 は dev で 1.4 秒。本番未計測）→ S-6 で判断を記録すること。
4. **`h-64` の結合**: 現状は一致しており MB-01 で実測 PASS だが、一致は暗黙。
   将来チャート側だけ変えると静的チェックをすり抜けてシフトが復活する → S-2（定数共有。
   置き場所は skeleton 側でなければ recharts が初期バンドルへ戻る）。
   加えて 0 件経路では**そもそも高さが一致していない** → M-1。
5. **規約・スコープ**: 違反なし。`any` なし / 新規ファイルは named export（`page.tsx` の
   default export は App Router 例外で既存どおり）/ `import dynamic from 'next/dynamic'` は
   default **import** であり禁止対象外 / 型のみ import は `import type` /
   比較は `===`・`!==` のみ / 「値なし」は `null`（`Map.get()` 由来の `?? ''` は
   既存 `product.mapper.ts:31` と同一パターンで一貫）。
   差分は設計書 §対象範囲の 8 ファイルに収まり、`packages/domain` / `packages/api-contract` に
   diff は無い（R-5 充足）。スコープ外リファクタリングも無い。
   JSDoc は新規 UseCase に付与済みで既存 UseCase（class 直上に `@throws`）と同じ配置。
   ただし内容が設計書の指示を満たしていない → S-7。

## 未確認として残した観点

- `pnpm lint` / `type-check` / `test` の再実行はしていない（Orchestrator 実施済みを前提とした）。
- `pnpm build` によるチャンク再計測、実ブラウザでの再確認はしていない（同上）。
- M-1 の空状態高さ（約 84px）は Tailwind クラスからの机上算出。実測はしていない
  （256px との差が有意であることは、`py-8`+1 行テキストが `h-64` に届かないことから明らか）。
- `apps/web/tests/server/routes/products.test.ts` の内容は未読（本差分に変更が無いため）。
- 未来日付の価格記録が UI から登録可能かは未調査（N-5）。

---

## 対応記録（2026-08-07・Orchestrator）

**Must 1 件・Should 7 件すべて対応済み。** Nice は申し送り。

### M-1 の対応（実測で再現 → 修正 → 実測で解消）

指摘は机上算出だったので**まず実測で再現を確認した**（にんじん = 価格記録 0 件）。

|                                | セクション高             | 「この商品を削除」ボタン        |
| ------------------------------ | ------------------------ | ------------------------------- |
| 修正前・スケルトン中           | 284px                    | Y=862                           |
| 修正前・解決後                 | 114px（**−170px**）      | Y=807（**−55px 上へジャンプ**） |
| **修正後**（初期表示から不変） | **114px → 114px（0px）** | **0px**                         |

修正内容は指摘の修正案どおり: 空状態 UI を `PriceHistoryEmpty` として skeleton 側
（recharts 非依存）へ移し、`product-detail-client.tsx` で
`priceHistory.length === 0` のときは **dynamic import を走らせない**分岐にした。
シフトが原理的に消え、0 件時に 373 KB を取る無駄も無くなった。

**回帰ガードの置き方に注意が要った。** 0 件時の同期描画を
`product-detail-client.test.tsx` 内でアサートすると、**先行テストの `render()` で
`import('./price-history-chart')` が解決済み（モジュールキャッシュ）になり、
バグのある実装でも誤って PASS する**（実際に一度誤 PASS した）。vitest はテストファイル単位で
モジュールレジストリが分かれるため、**独立ファイル
`product-detail-client.lazy-chart.test.tsx` に `PDC-16` を分離**して真の Red を得た。
試験計画にも `MB-05`（0 件時のシフト計測）を追加した。

### Should の対応

| #   | 対応                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1 | 既存 `GetCheapestStoreUseCase` を変更せず、**両 UseCase の JSDoc に相互参照**を入れた（「片方だけ変えると等価性が崩れる」「等価性は `GPD-03` / 縮退は `GPD-05` が担保」）。mapper への抽出は既存 UseCase の変更になり設計書 §対象外に触れるため採らなかった |
| S-2 | `PRICE_HISTORY_CHART_HEIGHT_CLASS` を **skeleton 側に定義**し、skeleton とチャート本体の両方が参照する形にした。チャート側に置くと `loading` からの参照で recharts が初期バンドルへ戻るため、定義の置き場所はこの向きで固定（コメントに明記）               |
| S-3 | `it.todo('PDC-15 ...')` を削除。担保は実体のある `PDC-01/02/08` であることをコメントで明示。品質ゲートの「+1 todo」も解消（web 760 passed）                                                                                                                 |
| S-4 | 試験計画の BLD 表・MB 表の構造を復元（実施結果の引用ブロックを表の**直後**へ移動）。**これは Orchestrator が結果を追記したときに壊したもので、指摘は正当**                                                                                                  |
| S-5 | 設計書ステータスを `draft` → 確定へ。`docs/05-roadmap.md:570` の Sprint 7 タスク4 を `✅ 実装済み` へ（タスク2/3 と同形式）                                                                                                                                 |
| S-6 | 未決事項 2（案1 採用）・3（`ssr: false` 維持）の決着を設計書へ記録。3 は実測 3 点（シフト無し / SEO 要件無し / recharts は DOM 計測前提）を根拠として明記し、本番体感を残件として残した                                                                     |
| S-7 | `GetProductDetailUseCase` の JSDoc に `cheapestStore` が `null` になる条件と、店舗未存在時は `null` ではなく空文字縮退である旨を追記                                                                                                                        |

### 対応後の検証

- 品質ゲート: lint 0 error / type-check 5-5 / application **283** / web **760**（todo 解消）
- バンドル: `736.*.js` **373 KB** / `3957.*.js` 5 KB、**どちらも初期ロード参照 0 件**。
  `price-history-chart.tsx` → skeleton の import を足したが、skeleton は recharts に
  依存しないため分離は維持されている（再ビルドで実測）
- 実画面: MB-05（0 件時）で セクション高 0px 差・ボタン移動 0px を実測
