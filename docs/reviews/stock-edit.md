# レビュー記録: stock-edit（設計フェーズ・成果物 5 点 + ADR）

- レビュー日: 2026-08-08
- レビュー対象（実装は未着手。設計成果物のみ）:
  - `docs/requirements/stock-edit.md`
  - `docs/designs/stock-edit.md`（confirmed）
  - `docs/designs/stock-edit.contract.md`（confirmed）
  - `docs/tests/stock-edit.md`
  - `docs/implementation-plans/stock-edit.md`（Codex ルート・軽量版）
  - `docs/decisions/ADR-0016-stock-details-mutable.md`
- 観点: 文書間整合 / 実コードとの事実整合 / 設計判断の妥当性 / 抜け漏れ / Codex 委譲の実行可能性 /
  ドキュメント品質
- 結果: **Must 3 件 / Should 7 件 / Nice 9 件**

---

## 0. 先に確認できた「問題なし」の範囲（再検証不要）

以下は実コードで裏取りし、文書の記述が正しいことを確認した。

| 文書の記述                                                                                                                                      | 実コード                                                                                                                                                                    | 判定                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `Pantry` は素の `Error('Stock not found')` を投げる（`pantry.ts:196`）                                                                          | `packages/domain/src/pantry/pantry.ts:196`                                                                                                                                  | 一致                                      |
| 404 は UseCase 事前チェック（`consume-stock.use-case.ts:19-23`）                                                                                | 同 `:19-23`                                                                                                                                                                 | 一致                                      |
| `Quantity.of` は `value < 0` のみ reject（0 は許容）                                                                                            | `packages/domain/src/shared/quantity.ts:9-14`                                                                                                                               | 一致                                      |
| `save()` の `set` 句は `amountValue` 1 列のみ（`:27-47` / `:37-46`）                                                                            | `drizzle-pantry.repository.ts:37-45`                                                                                                                                        | 一致                                      |
| 既存テスト `:111-136` が罠を固定化（3 アサーション）                                                                                            | `amountUnit:131`/`expiresAt:133`/`storedLocation:134` が `'個'`/`'2026-07-18'`/`'fridge'` を期待。`changed` は `Quantity.of(1.25,'g')`/`2026-07-19`/`'freezer'`（:115-123） | 一致。4 列化で**ちょうど 3 件**が失敗する |
| `complete-shopping-panel.tsx` の行番号群（L103 / L17-21 / L41-43 / L121-134 / L199-277 / L215 / L241-268）                                      | 全て実測一致                                                                                                                                                                | 一致                                      |
| `complete-shopping.use-case.ts` は `expiresAt` を `Stock.create()` に渡す                                                                       | `:160` `expiresAt: addition.expiresAt === null ? null : new Date(...)`                                                                                                      | 一致（Application 変更不要は正しい）      |
| `Product.updatePriceRecord(id, props)` が一括更新の先例（`product.ts:197-`）                                                                    | `:197`                                                                                                                                                                      | 一致                                      |
| roadmap 完了条件 L638-639 / ユーザー確定 L652-665                                                                                               | 実測一致                                                                                                                                                                    | 一致                                      |
| apps/web の vitest include（node: `tests/**/*.node.test.ts`,`tests/server/**/*.test.ts` / dom: `tests/**/*.dom.test.ts`,`tests/**/*.test.tsx`） | `vitest.node.config.mts` / `vitest.dom.config.mts`                                                                                                                          | 一致                                      |
| `expiryUrgencyChipClass` は `category-color.ts` にあり `overdue/critical/soon` を持つ                                                           | `category-color.ts:44-48,66-68`                                                                                                                                             | 一致                                      |

**アーキテクチャ原則（`.claude/rules/domain-layer.md`）違反は見つからなかった。**
依存方向（Domain は素の `Error`、写像は UseCase）、1 ユースケース = 1 クラス + `execute()`、
`create()`/`reconstruct()` の維持、集約またぎは ID 参照のみ、DB ⇔ ドメイン変換は Repository、
手動 DI — いずれも設計どおり。ADR-0016 の Decision 3（差し替え方式を採らない）も
Entity 同一性の観点で妥当。

---

## Must（実装着手前に直すべき）

### M-1. P-4 の「緊急度チップ」で**期限切れ（残日数が負）**の扱いが未定義。下流で矛盾している

- 対象: `docs/designs/stock-edit.md` §UI 設計「`/pantry` カードへの保存場所ラベル・緊急度チップ追加」/
  `docs/tests/stock-edit.md` §7-3（SR-EDIT-01〜06）と §10-2（MB-09）
- 問題: 設計書は「閾値（既定 3 日）**以内**の在庫にのみチップを表示する」としか書いていない。
  実装は 2 通り取り得る。
  - (a) `remainingDays <= EXPIRY_URGENCY_WITHIN_DAYS`（負値＝期限切れも含む）
  - (b) `0 <= remainingDays && remainingDays <= EXPIRY_URGENCY_WITHIN_DAYS`（期限切れは非表示）

  試験計画 MB-09 は「期限切れ（S-4 = `asOf - 1` 日）に『期限切れ』等のラベルが表示されている」を
  期待しており **(a) 前提**だが、RTL 観点 SR-EDIT-01〜06 に overdue のケースが**無い**。
  つまり (b) で実装しても自動テストは全件 Green のまま、手動確認 MB-09 だけが落ちる。
  手動確認が省略されると欠陥がそのまま残る（本ユニットが最も警戒している「false PASS」の型）。

- 根拠（実コード）:
  - `apps/web/src/app/_utils/dashboard-view.ts:48-51` — `getExpiryRemainingDays` は負値を返す。
  - 同 `:57-65` — `getExpiryUrgency` は `remainingDays < 0` → `'overdue'`。
  - 同 `:36-39` — ダッシュボードの `selectExpiringStocks` は `parseExpiryDate(...) <= threshold` で
    **期限切れを含める**。「ダッシュボードと表現の意味を完全に一致させる」（設計書の目的）なら
    (a) が正解。
  - `apps/web/src/app/_utils/category-color.ts:45` — `overdue` の配色が既にある。
- 直し方:
  1. 設計書に「チップ表示条件は `remainingDays <= EXPIRY_URGENCY_WITHIN_DAYS`（**負値＝期限切れを含む**）」と明記する。
  2. 試験計画 §7-3 に `SR-EDIT-07: expiresAt が asOf より過去のとき overdue チップが表示される` を追加し、完了条件の必須観点に含める。

### M-2. P-4 の「チップに表示する文言」がどの文書にも定義されていない

- 対象: `docs/designs/stock-edit.md` §UI 設計 / §期限緊急度ユーティリティの共通化、
  `docs/tests/stock-edit.md` §7-3
- 問題: 設計書は `getExpiryRemainingDays` / `getExpiryUrgency` / `expiryUrgencyChipClass` の使用は
  書くが、`formatExpiryUrgencyLabel`（`期限切れ`/`本日まで`/`明日まで`/`あとN日`）を `/pantry` で
  使うとは書いていない（`expiry.ts` への移設対象リストに名前が出るだけ）。加えて、閾値内カードで
  既存のプレーン日付表示（`〜8/20まで`）を**残すのか置き換えるのか**も未定義（SR-EDIT-04 は閾値外に
  ついてのみ「プレーン表示のみ」と書く）。SR-EDIT-03 の期待結果は「緊急度チップが表示される」
  だけで文言をアサートしないため、どの実装でもテストが通る。
- 根拠: `apps/web/src/app/_utils/dashboard-view.ts:68-79`（`formatExpiryUrgencyLabel` 実在）。
  `apps/web/src/app/pantry/_components/stock-row.tsx` の現状表示は
  `〜{formatExpiresAt(stock.expiresAt)}` のみ。
- 直し方: 設計書 §UI 設計に「チップ文言は `formatExpiryUrgencyLabel(remainingDays)`。
  閾値内でもプレーン日付表示は残す／置き換える（どちらか）」を明記し、SR-EDIT-03 の期待結果を
  具体文言（例: `本日まで`）のアサートに変更する。

### M-3. `/pantry` 在庫カードのモバイル幅（375px）検証が抜けている（P-1 + P-4 を同時に足すため）

- 対象: `docs/designs/stock-edit.md` §リスク（R-2 は完了パネルのみ）、
  `docs/tests/stock-edit.md` §10-2（MB-14 は完了パネルのみ）
- 問題: `stock-row.tsx` は現在 1 行（`<li className="flex items-center gap-3 ...">`）で、
  左に「品目名／数量／期限」の縦積み、右に `shrink-0` の**ボタン 2 個**が入っている。本ユニットは
  ここへ **編集ボタン（3 個目）+ 保存場所ラベル + 緊急度チップ**を同時に追加する。完了パネル
  （R-2 として明示的に対策済み）より破綻リスクが高いのに、`/pantry` 側にはリスク項目も配置方針も
  目視確認項目も無い。設計書は「既存の『消費』『廃棄』ボタンの並びに 1 つ増やす」としか書いておらず、
  ラベル・チップをどの行に置くかの指定もない（Codex にとって判断が残る＝観点 5 の問題でもある）。
- 根拠: `apps/web/src/app/pantry/_components/stock-row.tsx` 全体（実測）。
- 直し方:
  1. 設計書 §UI 設計に `/pantry` カードの配置方針（保存場所ラベル・チップを品目名行に置くか
     別行にするか、ボタン 3 個の折り返し／アイコンのみ化の方針）を追記する。
  2. 試験計画 §10-2 に `MB-17: 375px 幅で /pantry の在庫カード（ボタン 3 個 + ラベル + チップ）が
崩れない` を追加し、設計書リスク表に R-2 と同型の項目を足す。

---

## Should（実装前に直すことを推奨）

### S-1. 試験計画 §10-1 の MB 参照番号が §10-2 の MB 表と系統的にずれている

- 対象: `docs/tests/stock-edit.md` §10-1 の「用途（どの確認項目のために必要か）」列。
- 実際のずれ:
  | シード | §10-1 が指す ID | §10-2 の同 ID の実際の内容 |
  | --- | --- | --- |
  | S-1 | MB-03（緊急度チップ表示） | MB-03 = 賞味期限を編集して保存 |
  | S-2 | MB-04（チップ非表示） | MB-04 = 賞味期限を null クリア |
  | S-3 | MB-05（期限なし表示） | MB-05 = 保存場所を編集 |
  | S-4 | MB-06（期限切れラベル） | MB-06 = 保存場所を未設定にクリア |
  | 完了パネル | MB-09〜11 | MB-09 = 期限切れラベル（完了パネルは MB-11〜13） |
- なぜ Must 級に近いか: §10-2 手順 3 の「前提データ全消化チェック」は、この対応表を突き合わせて
  「未使用のシードが無いか」を確認する手順である。対応表が壊れていると、過去 3 回の false PASS を
  防ぐために導入した安全装置がそのまま機能しない。
- 直し方: §10-1 の ID を §10-2 の表に合わせて振り直す（チップ関連は MB-07〜10、完了パネルは MB-11〜14）。

### S-2. 回帰観点 REG-05 / REG-06 の「確認方法」が実在しないテストを指している

- 対象: `docs/tests/stock-edit.md` §8、`docs/implementation-plans/stock-edit.md` Step 12。
- REG-05「`pantry-shopping-integration` 系の既存テスト」— この名前で実在するのは
  `docs/designs/pantry-shopping-integration.md` と `docs/implementation-plans/pantry-shopping-integration.md`
  という**文書だけ**で、テストファイルは無い。在庫引き算の実体は
  `packages/application/src/shopping-list/generate-shopping-list.use-case.ts` と
  `packages/application/tests/shopping-list/generate-shopping-list.use-case.test.ts`。
- REG-06 の `CS-IDEM-*` は `docs/tests/pantry-core.md:368-370` の**観点 ID** であってテスト名ではない。
  実体は `packages/application/tests/shopping-list/complete-shopping.use-case.test.ts`。
- 影響: Step 12 を実行する担当（プロジェクト文脈を持たない場合を含む）が対象テストを特定できない。
- 直し方: 両行の「確認方法」に実ファイルパスを併記する。

### S-3. `location-group.tsx` の変更が試験計画に落ちていない（実装計画にはある）

- 実装計画 Step 9 は `location-group.tsx`（`asOf` / `onEdit` の中継）を変更対象に含め、完了条件で
  `location-group.test.tsx` の回帰 Green を要求している。
- 一方で試験計画 §1（メソッド網羅チェック表）・§14（層別テスト配置）には `location-group` が無く、
  §7 にも観点が無い（§0-2 に既存ファイルとして名前が出るだけ）。設計書 §UI 設計も
  `location-group.tsx` に触れていない（データフロー フロー 3 の 2 で 1 度出るのみ）。
- 直し方: 試験計画 §1・§14 に `location-group.tsx`（変更）を追加し、§7 に
  `LG-EDIT-01: asOf / onEdit を StockRow へそのまま中継する` 相当の観点を足す。

### S-4. `docs/05-roadmap.md` の Sprint 8 記述が P-1（数量）・P-4（チップ）を反映していない

- `docs/05-roadmap.md:631`「Stock の編集（賞味期限・保存場所の後付け）」、
  `:648` の Unit A 行「タスク 1（Stock の編集：期限・保存場所の後付け）」、
  `:638-639` の完了条件 — いずれも P-1 で加わった**数量**と P-4 の**緊急度チップ**を含まない。
- 実装計画 Step 12 のドキュメント更新は `pantry-core.md` への注記のみで、roadmap を含まない。
- 影響: 完了判定の正典（roadmap 完了条件）と実装スコープがずれたまま残る。
- 直し方: Step 12 の作業に roadmap Unit A 行の更新（数量を含む旨・状態を「設計完了／実装待ち」へ）を追加する。

### S-5. `amount_value` の DB 精度（`numeric(10,3)`）により「0 の在庫」を作れる抜け穴が残る

- 根拠: `packages/infrastructure/src/db/schema.ts:149`
  `amountValue: numeric('amount_value', { precision: 10, scale: 3 })`、
  `packages/domain/src/shared/quantity.ts:9-14`（`Quantity.of(0, unit)` は成功する）。
- 問題: `amount.value = 0.0001` は Zod の `positive()`（契約層 400）も Domain の `<= 0` チェック
  （422）も**通過する**が、DB では `0.000` に丸められる。次の `find()` で
  `Quantity.of(0, unit)` として復元され、`isEmpty()` が true の Stock が集約に残る — 設計書 R-6 が
  防ごうとした「集約に残る 0 個の在庫」がまさに発生する。3 段防御（400/422/Domain）が
  この経路を止められないことは、どの文書にも書かれていない。
- 直し方（いずれか）:
  - 契約に精度制約（`.multipleOf(0.001)` 等）を入れる。既存 `addStockSchema` にも同じ穴があるため
    スコープ拡大の可否は Orchestrator 判断。
  - スコープを広げないなら、設計書 §エラー処理 or R-6 に既知の制限として明記し、試験計画 §5 に
    `INF-UPD-09: 0.0005 未満の値を save → find すると 0 に丸められる（既知の制限の固定）` を追加する。

### S-6. 暦として存在しない日付（`2026-02-31`）の扱いが未定義

- Application は `new Date(\`${input.expiresAt}T00:00:00\`)`で組み立てる（設計書 §Application、
既存`packages/application/src/pantry/add-stock.use-case.ts:26`と同規約）。JS の`Date`は`2026-02-31` を **3/3 にサイレントにシフト**する。
- `z.iso.date()` が暦の妥当性まで検証するかは本レビューでは実行確認できなかった（Zod の
  バージョン依存。`packages/api-contract` は `zod ^4.4.3`）。検証しない場合、ユーザーが
  意図しない日付が保存される。
- 試験計画 Z-UPD-01〜10 / A-UPD-01〜14 にこの境界観点が無い。
- 直し方: Z-UPD に「存在しない日付（`2026-02-31`）」の観点を追加し、実測結果（reject / 受理）を
  契約として固定する。受理される場合は Application 側の扱い（拒否するか受け入れるか）を設計書に明記する。

### S-7. `Stock.updateDetails` の入力 `Date` に対する防御的コピー方針が未定義

- 根拠: `packages/domain/src/pantry/pantry.ts:111-117` — getter は `new Date(...)` を返すが、
  `create()`（`:51-60`）は入力の `Date` をそのまま保持しており、**書き込み側のコピーはしていない**。
- `updateDetails` を同じ実装にすると、呼び出し側が保持する `Date` を後から `setDate()` した際に
  集約の内部状態が変わる（エイリアシング）。
- 試験計画 §9「防御性」は「`Stock.expiresAt`/`purchasedAt` の防御的コピーが `updateDetails()` 経由でも
  維持されること（STK-UPD-03/06 で間接確認）」と書くが、STK-UPD-03/06 は値の一致しか見ておらず
  **入力側エイリアシングを検出しない**。A-UPD-13 も `amount` のプレーンオブジェクトのみが対象。
- 直し方: 設計書 §変更後構成 Domain に「入力 `Date` はコピーしない（`create()` と同じ）」または
  「コピーする」を明記し、決めた方を `STK-UPD-11` として観点化する（§9 の「間接確認」という記述は
  実態に合っていないので合わせて修正）。

---

## Nice（あると良い / 記述精度）

- **N-1**: 実装計画 Step 11 の変更内容に、`complete-shopping-panel.tsx` の JSDoc
  （`:60-63`「賞味期限は入力させず常に null を送る（Q-1）」— 変更後は事実と矛盾する）の更新と、
  `RowProps`（`:187-197`。`StockAdditionRow` は `RowState` ではなく個別 props を受け取る）への
  `expiresAt` / `expiresAtExpanded` / 対応ハンドラの追加が列挙されていない。
- **N-2**: 設計書 §Application の「`Stock.create()` 呼び出しにもそのまま渡っている**想定**」は
  実測で正しい（`packages/application/src/shopping-list/complete-shopping.use-case.ts:160`）。
  「想定」→「実測確認済み（`:160`）」に更新すると Codex の再確認コストが減る。
- **N-3**: 試験計画 SED-01 の期待結果「数量欄に `2`・単位 `個`」は `QuantityField` の実態
  （値と単位を 1 つの文字列で扱う。`complete-shopping-panel.tsx:246-253` + `parseQuantity`）と
  合わない。「数量欄に `2個`」が正確。
- **N-4**: 設計書 §リスク表（L760-791）と §確定事項の表（L799-809）が、セル内改行により
  Markdown テーブルとして描画されない（R-1・R-2・P-1・P-4 の行が壊れている）。読者適合の問題。
- **N-5**: ADR-0016 §Consequences が記録している lost update リスク（`save()` の集約丸ごと保存。
  書き込み経路が 1 つ増える分だけ窓が広がる）が、設計書 §リスク表に転記されていない。
  試験計画にも「編集の `save()` が他の Stock 行を消さない」観点が無い（INF-UPD-08 は対象 Stock の
  対象外フィールドのみを見る）。Sprint 10 送りの既知課題なので Nice に留めるが、
  INF に 2 件の Stock を持つ Pantry で 1 件を編集 → `find()` で 2 件残ることを見る観点があると安全。
- **N-6**: 設計書 §DB 設計の `schema.ts:144-162` は `stocks` テーブル定義（144-159）＋型 export
  （161-162）を含む範囲。列定義だけを指すなら 146-156。
- **N-7**: STK-UPD-04（数量 0 拒否）の期待結果に「`expiresAt` / `storedLocation` も変更前のまま」を
  追加すると、`updateDetails` がフィールドを順に代入してから検証する実装（部分適用）を弾ける。
- **N-8**: 既存 `stock-row.test.tsx` の `SR-06: submitting 中は両ボタンが disabled になる` は、
  ボタンが 3 個になった後の期待（編集ボタンは disabled にしない ＝ PC-EDIT-01 と整合）が
  SR-EDIT-\* に明記されていない。
- **N-9**: `docs/05-roadmap.md` の Unit A 状態が「設計中」のまま（設計は confirmed）。

---

## 未確認の範囲

- `z.iso.date()` が暦の妥当性（`2026-02-31`）まで検証するかは、依存解決の都合で実行確認できていない（S-6）。
- `pnpm lint` / `pnpm type-check` は未実行（実装が存在しない設計フェーズのため）。
- `docs/designs/pantry-core.md` / `pantry-screens.md` / `shopping-complete-stock-selection.md` の
  引用行番号（S-4 案 α の L313-315 / L796-797 / L1117-1118、Q-1 の L327-328、P-3 / R-3）は未検証。
- `price-record-edit-dialog.tsx` の内部構造（設計書が引用する L85-131 等）は未検証。

---

## Orchestrator への差し戻し先

| 指摘                        | 直すべき成果物                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| M-1 / M-2 / M-3             | `docs/designs/stock-edit.md`（UI 設計・リスク）→ 反映後 `docs/tests/stock-edit.md`（§7-3・§10-2）        |
| S-1 / S-2 / S-3 / S-6 / S-7 | `docs/tests/stock-edit.md`（S-3 は §1・§7・§14、S-7 は設計書 §変更後構成 Domain も）                     |
| S-4                         | `docs/implementation-plans/stock-edit.md` Step 12（+ `docs/05-roadmap.md`）                              |
| S-5                         | `docs/designs/stock-edit.md`（R-6 / エラー処理）+ `docs/designs/stock-edit.contract.md` §3 + 試験計画 §5 |
| N-1                         | `docs/implementation-plans/stock-edit.md` Step 11                                                        |
| N-2 / N-4 / N-6             | `docs/designs/stock-edit.md`                                                                             |
| N-3 / N-5 / N-7 / N-8       | `docs/tests/stock-edit.md`                                                                               |
| N-9                         | `docs/05-roadmap.md`                                                                                     |

契約設計書（`stock-edit.contract.md`）は S-5・S-6 を除き指摘なし。ADR-0016 は指摘なし
（lost update・単位編集の波及・`set` 句の罠まで Consequences に明記されており、
むしろ設計書側がその一部を取りこぼしている ＝ N-5）。
