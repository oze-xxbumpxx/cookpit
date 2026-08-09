# レビュー記録: stock-edit（設計フェーズ・成果物 5 点 + ADR）

- レビュー日: 2026-08-09
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
  | シード     | §10-1 が指す ID           | §10-2 の同 ID の実際の内容                       |
  | ---------- | ------------------------- | ------------------------------------------------ |
  | S-1        | MB-03（緊急度チップ表示） | MB-03 = 賞味期限を編集して保存                   |
  | S-2        | MB-04（チップ非表示）     | MB-04 = 賞味期限を null クリア                   |
  | S-3        | MB-05（期限なし表示）     | MB-05 = 保存場所を編集                           |
  | S-4        | MB-06（期限切れラベル）   | MB-06 = 保存場所を未設定にクリア                 |
  | 完了パネル | MB-09〜11                 | MB-09 = 期限切れラベル（完了パネルは MB-11〜13） |
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

---

# 受け入れレビュー: Codex 実装（Task 1〜8）

> 下記の「機械チェック」「品質ゲート」「チェックリスト 8 項目」「対象外の遵守」は
> **全 Task 共通の証跡**。Task 単位の判定は本節の末尾（`## Task 1`〜`## Task 8`）に分けて記録する
> （IMP-2026-026 の Task 網羅規約。一括記録だけでは個別 Task の欠落を見逃す）。

- 実施日: 2026-08-09
- 対象: `docs/tasks/codex/stock-edit/01-domain.md` 〜 `08-complete-panel.md`（全 8 Task）
- ブランチ: `claude/sprint8-design-r6qn4z`
- 対象コミット: `38dfbf1` fix(infra): persist editable stock details /
  `62c18b1` feat(pantry): add stock detail editing
- 差分規模: 28 ファイル・+1773 / -98
- **総合判定: 受け入れ可（Must 0 / Should 0 / Nice 1）。差し戻しなし。**

## 機械チェック

```
node .claude/scripts/check-codex-implementation.mjs --brief docs/tasks/codex/stock-edit
→ 対象 17 ファイル / 指示書識別子 402 件
→ FAIL: 0 / WARN: 8 / INFO: 0
```

WARN 8 件はすべて**誤検出**と判定した（根拠つき）。

| WARN                                                      | 判定   | 根拠                                                                                                |
| --------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| `dashboard.tsx:62` `Dashboard` が指示書に無い             | 誤検出 | 既存のコンポーネント名。指示書に出てこないのは当然                                                  |
| `location-group.tsx:1` `'use client'` 無し                | 誤検出 | **指示書が明示的に「付けない」と指定**（純表示・hooks 不使用）。親 `pantry-client.tsx` が client    |
| `stock-row.tsx:1` `'use client'` 無し                     | 誤検出 | 同上                                                                                                |
| `pantry-client.tsx:43` `onSuccess` が要素に渡されていない | 誤検出 | `useApiAction.run()` の**オプション**であって React prop ではない。4 箇所すべてで実際に使われている |
| `stock-edit-dialog.tsx:31` `FieldErrors`                  | 誤検出 | ローカル型名。`fieldErrors`（変数）とは別物                                                         |
| `stock-edit-dialog.tsx:90` `errors`                       | 誤検出 | ローカル変数名                                                                                      |
| `complete-shopping-panel.tsx:36,100` `parsed`             | 誤検出 | `parseQuantity` の戻り値を受けるローカル変数。既存コードでも同じ命名                                |

## 品質ゲート

```
bash .claude/scripts/run-quality-gates.sh
→ PASS: harness lint type-check test / FAIL: (none)
→ RESULT: OK
```

- `@cookpit/web`: Test Files 69 passed / Tests **797 passed**
- 事前に `pnpm install --frozen-lockfile` が必要だった（コンテナに `node_modules` が無かった。
  実装の問題ではない）

## チェックリスト 8 項目（docs/06-ai-tools.md）

| 項目                                 | 判定                         | 根拠                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 識別子のタイポ                       | **PASS**                     | script の brief 突き合わせで FAIL 0。`UpdateStockDetailsUseCase` / `UpdateStockDetailsInputDto` / `updateStockSchema` / `UpdateStockBody` / `Stock.updateDetails` / `Pantry.updateStockDetails` / `EXPIRY_URGENCY_WITHIN_DAYS` を指示書のシグネチャと目視照合し全一致 |
| Tailwind クラスのタイポ・連結        | **PASS**（実画面確認は保留） | script WARN 0。`stock-row.tsx` の新規クラスは既存トークン（`rounded-full px-2 py-0.5 text-xs font-medium` / `flex flex-wrap justify-end gap-2`）のみ。**実画面確認は未実施**（下記）                                                                                  |
| イベントハンドラの結線漏れ           | **PASS**                     | `onEdit` は `onClick={() => onEdit(stock)}` に結線済み（`stock-row.tsx`）。`onExpiresAtChange` / `onExpiresAtExpandedChange` も `complete-shopping-panel.tsx` で結線済み。script の 1 件は誤検出（上表）                                                              |
| `'use client'` の要否                | **PASS**                     | `stock-edit-dialog.tsx` に付与あり。`stock-row.tsx` / `location-group.tsx` は指示書どおり付けていない。`expiry.ts` も付けていない                                                                                                                                     |
| `import type` 規約                   | **PASS**                     | 差分の全 import 行を目視。型のみ import は `import type`（`PantryRepository` / `PantryDto` / `UpdateStockDetailsInputDto` / `StockDto` 等）。値 import に `type` の誤付与も無し                                                                                       |
| 命名の傾向ずれ                       | **PASS**                     | 新規テーブル無し。ファイル名は `update-stock-details.use-case.ts` / `stock-edit-dialog.tsx` で指示書と一致                                                                                                                                                            |
| 差し戻しの部分反映                   | **N/A**                      | 差し戻し無し（初回で受け入れ）                                                                                                                                                                                                                                        |
| バリデーションのエラーメッセージ分岐 | **PASS**                     | `UpdateStockDetailsUseCase` が 404（事前チェック）と 422（try/catch 変換）で別クラスを投げ分けている。`updateStockSchema` は 3 項目とも `nullable()` で `optional()` 無し（キー省略を許さない）                                                                       |

## 設計の重点 3 点の確認（レビュー Must 由来）

| 観点                                                          | 判定                     | 実装                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Repository の `set` 句が 4 列ちょうど**（罠 1・2）          | **PASS**                 | `amountValue` / `amountUnit` / `expiresAt` / `storedLocation` の 4 列。`displayName` 等は含まれていない                                                                                                                                                                                  |
| **「値は据え置き・単位のみ変更」の独立テスト**（罠 2 の検出） | **PASS**                 | `再 save() で数量の値を据え置き、単位のみ変更できる`（値 2.5 固定・`個`→`g`）。`find()` は**新しい Repository インスタンス**で実行                                                                                                                                                       |
| **既存テストが削除されず期待値更新で直っている**              | **PASS**                 | テスト名が `編集対象 4 列を更新し、対象外フィールドは維持する` に改称。`amountUnit`→`'g'` / `expiresAt`→`'2026-07-19'` / `storedLocation`→`'freezer'` に更新。**`productId` / `displayName` / `purchasedAt` / `sourceShoppingItemId` の 4 アサーションは維持**（回帰ガードが残っている） |
| **緊急度チップが期限切れでも出る**（M-1）                     | **PASS**                 | `remainingDays !== null && remainingDays <= EXPIRY_URGENCY_WITHIN_DAYS`。**下限が無い**ので負値（期限切れ）も表示対象。`SR-EDIT-07: 期限切れの在庫に「期限切れ」チップを表示する` でテスト固定済み                                                                                       |
| **チップの文言**（M-2）                                       | **PASS**                 | `formatExpiryUrgencyLabel(remainingDays)` を使用。既存の `〜M/Dまで`（`formatExpiresAt`）も残っている                                                                                                                                                                                    |
| **`/pantry` カードのレイアウト**（M-3）                       | **PASS**（実画面は保留） | `<li>` を `flex items-center` → **`flex flex-col gap-3`** に変更し、ボタン行を情報行の下へ折り返す構成にした（設計で挙げた 2 案のうちの 1 つ）。ボタン行は `flex flex-wrap justify-end gap-2`。品目名の `truncate` は維持                                                                |

## 対象外の遵守

| 確認                                                | 結果                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `apps/web/src/server/app.ts`                        | **差分なし**                                                                                |
| `apps/web/src/app/_utils/category-color.ts`         | **差分なし**（`expiryUrgencyChipClass` を動かしていない）                                   |
| `packages/infrastructure/src/db/schema.ts`          | **差分なし**                                                                                |
| `packages/application/src/pantry/pantry.mapper.ts`  | **差分なし**                                                                                |
| マイグレーションファイル                            | **追加なし**                                                                                |
| `StockNotFoundError` / `InvalidStockOperationError` | **新規作成なし**（既存を import）                                                           |
| Domain の依存方向                                   | **PASS**（`pantry.ts` は素の `Error('Stock not found')`。Application を import していない） |

## Nice（受け入れを妨げない申し送り）

- **N-A**: `SR-EDIT-BND`（閾値ちょうど 3 日 / 4 日の境界）が観点 ID の採番規則から外れている
  （試験計画は `SR-EDIT-01〜07`）。テスト内容自体は有益で、むしろ試験計画に無い境界を
  補っている。次回の試験計画更新時に正式な ID を割り当てるか検討する。

## 未実施（受け入れの条件にはしない）

- **実画面確認（`manual-browser-verify` MB-01〜17）は未実施。**
  試験計画 §10-1 のシードデータ S-1〜S-7 を投入した上で別途実施する。
  特に **MB-02（単位のみ変更してリロード）**・**MB-08（閾値外にチップが出ない）**・
  **MB-17（375px でのレイアウト）** は自動テストで代替できない。
- **Codex のモデル / reasoning effort が未記入。**
  `docs/tasks/codex/stock-edit/README.md` の確定値表「モデル」行が空欄のまま。
  IMP-2026-025 の効果実測に必要なので、実施者による記入が残っている。

---

# Task 単位の判定

共通の証跡（機械チェック FAIL 0 / 品質ゲート全 PASS / チェックリスト 8 項目 / 対象外の遵守）は
上記を参照する。以下は **Task ごとに固有の完了条件**を照合した結果。

## Task 1: Domain — `Stock.updateDetails` / `Pantry.updateStockDetails`

- 指示書: `docs/tasks/codex/stock-edit/01-domain.md`
- 実装: `packages/domain/src/pantry/pantry.ts` / `packages/domain/tests/pantry/pantry.test.ts`（+208 行）
- **判定: 受け入れ可**

| 完了条件                                                               | 判定 | 根拠                                                                                                                              |
| ---------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| `Stock.updateDetails` / `Pantry.updateStockDetails` がシグネチャどおり | PASS | `pantry.ts:99` / `pantry.ts:206`。props の 3 項目・戻り値 `void` が一致                                                           |
| **`readonly` を外したのは 2 つだけ**                                   | PASS | `pantry.ts:37-38` が `private stockExpiresAt` / `private stockStoredLocation`。他 5 フィールドは `readonly` のまま                |
| **`amount.value <= 0` の自前チェック**                                 | PASS | `updateDetails` 冒頭で `throw new Error('Stock amount must be positive')`。比較は `<= 0`（`Quantity.of` は 0 を許容するため必須） |
| **`StockNotFoundError` を import していない**                          | PASS | `pantry.ts` は素の `Error`。`findStock`（既存 private）を再利用して `consumeStock` / `discardStock` と同型                        |
| `packages/domain` が他パッケージを import していない                   | PASS | `grep -r "@cookpit/application" packages/domain/src` が 0 件                                                                      |
| JSDoc が型に表せない契約情報のみ                                       | PASS | 全体置換であること・`@throws`・対象外フィールドを記載。型の言い換えなし                                                           |

## Task 2: Infrastructure — `save()` の `set` 句を 4 列へ拡張

- 指示書: `docs/tasks/codex/stock-edit/02-infrastructure.md`
- 実装: `packages/infrastructure/src/repositories/drizzle-pantry.repository.ts` / 同 `tests/`（+73 行）
- **判定: 受け入れ可（本ユニットの最重要 Task）**

| 完了条件                                                       | 判定 | 根拠                                                                                                                                                  |
| -------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`set` 句が 4 列ちょうど**                                    | PASS | `amountValue` / `amountUnit` / `expiresAt` / `storedLocation`。`displayName` 等は含まれない                                                           |
| 列名の camelCase / snake_case の対応                           | PASS | キーは Drizzle 定義名、`sql` 内は `excluded.amount_unit` 等の物理列名                                                                                 |
| **既存テストを削除せず期待値を更新**                           | PASS | テスト名が `編集対象 4 列を更新し、対象外フィールドは維持する` に改称。`amountUnit`→`'g'` / `expiresAt`→`'2026-07-19'` / `storedLocation`→`'freezer'` |
| **対象外フィールドの回帰ガードが残っている**                   | PASS | `productId` / `displayName` / `purchasedAt` / `sourceShoppingItemId` の 4 アサーションが維持されている                                                |
| **「値は据え置き・単位のみ変更」の独立テスト**（罠 2 の検出）  | PASS | `再 save() で数量の値を据え置き、単位のみ変更できる`。値 2.5 固定で `個`→`g`                                                                          |
| `find()` を新しい Repository インスタンスで実行                | PASS | `new DrizzlePantryRepository(db)` を都度生成。インスタンス内部状態に依存した偽の成功を排除                                                            |
| 4 項目同時変更 / null クリア / null→値 の往復                  | PASS | 該当テスト 4 件を追加（計 6 件の新規往復テスト）                                                                                                      |
| `notInArray` の削除同期・`toStockRows` / `toEntity` に差分なし | PASS | diff で確認                                                                                                                                           |
| DB スキーマ・マイグレーションに差分なし                        | PASS | `schema.ts` 差分 0・migration 追加 0                                                                                                                  |

> Step A（Red の確認）の実施記録は Codex の作業ログに残っていないが、**結果として
> 期待値が正しく更新され回帰ガードも残っている**ため受け入れる。TDD 順を踏んだかは
> 成果物からは検証できない（次回は報告に含めさせる）。

## Task 3: api-contract — `updateStockSchema`

- 指示書: `docs/tasks/codex/stock-edit/03-api-contract.md`
- 実装: `packages/api-contract/src/pantry.schema.ts` / 同 `tests/`（+84 行）
- **判定: 受け入れ可**

| 完了条件                                              | 判定 | 根拠                                                                                            |
| ----------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| `updateStockSchema` / `UpdateStockBody` の定義        | PASS | `addStockSchema` の直後。フィールド順も `amount` → `storedLocation` → `expiresAt`               |
| **`optional()` を使っていない**（キー省略を許さない） | PASS | 3 項目とも `nullable()` のみ                                                                    |
| `expiresAt` が `z.iso.date()`（datetime ではない）    | PASS | 同ファイルの `stockResponseSchema.purchasedAt`（`z.iso.datetime()`）と取り違えていない          |
| `amount.value` が `positive()`（0 を reject）         | PASS | —                                                                                               |
| **`.strict()` / `.passthrough()` を付けていない**     | PASS | `displayName` は strip される既定挙動のまま                                                     |
| `addStockSchema` からの派生でなく独立定義             | PASS | `.omit()` を使っていない                                                                        |
| `index.ts` に差分なし                                 | PASS | 既存の `export *` が自動公開                                                                    |
| 既存スキーマに差分なし                                | PASS | `addStockSchema` / `consumeStockSchema` / `stockResponseSchema` / `pantryResponseSchema` 無変更 |

## Task 4: Application — `UpdateStockDetailsUseCase`

- 指示書: `docs/tasks/codex/stock-edit/04-application.md`
- 実装: `packages/application/src/pantry/update-stock-details.use-case.ts`（新規）/ `pantry.dto.ts` / `index.ts` / テスト（+295 行）
- **判定: 受け入れ可**

| 完了条件                                       | 判定 | 根拠                                                                                                                                             |
| ---------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **404 は事前チェック・422 は try/catch 変換**  | PASS | `pantry.stocks.find(...)` で `null` なら `StockNotFoundError`、その後 `updateStockDetails` を try/catch して `InvalidStockOperationError` に変換 |
| **404 が 422 より先**（複合ケースで 404 優先） | PASS | 事前チェックが try より前に置かれている                                                                                                          |
| **エラークラスを新規作成していない**           | PASS | `./stock-not-found.error` / `./invalid-stock-operation.error` を import。新規 error ファイル 0                                                   |
| `expiresAt` の往復規約                         | PASS | ``new Date(`${input.expiresAt}T00:00:00`)``。素の `new Date(str)` を使っていない                                                                 |
| `catch` で `any` にキャストしていない          | PASS | `error instanceof Error ? error.message : 'Failed to update stock'`                                                                              |
| UseCase にドメインロジックを書いていない       | PASS | `<= 0` 判定は Domain 側。UseCase はエラー型の写像のみ                                                                                            |
| 戻り値が `PantryDto`                           | PASS | `toPantryDto(pantry)`                                                                                                                            |
| テストファイルが独立                           | PASS | `update-stock-details.use-case.test.ts`（既存の `pantry-use-cases.test.ts` に追記していない）                                                    |
| 既存 4 UseCase / `pantry.mapper.ts` に差分なし | PASS | diff で確認                                                                                                                                      |

## Task 5: Presentation route — `PUT /api/pantry/stocks/:stockId`

- 指示書: `docs/tasks/codex/stock-edit/05-route.md`
- 実装: `apps/web/src/server/routes/pantry.ts` / `apps/web/tests/server/routes/pantry.test.ts`（+149 行）
- **判定: 受け入れ可**

| 完了条件                                          | 判定 | 根拠                                                                               |
| ------------------------------------------------- | ---- | ---------------------------------------------------------------------------------- |
| `.put()`（`.patch()` ではない）                   | PASS | `discard` の直後にチェーン                                                         |
| **`param` + `json` の 2 バリデータ**              | PASS | `stockIdParamSchema` と `updateStockSchema`。`discard`（param のみ）を真似ていない |
| ステータス 200（201 ではない）                    | PASS | —                                                                                  |
| `try/catch` を書いていない                        | PASS | `app.onError` に委ねる既存 4 ルートと同型                                          |
| Repository は `pantryRepository()` ファクトリ経由 | PASS | 直書きしていない                                                                   |
| **`apps/web/src/server/app.ts` に差分なし**       | PASS | diff 0                                                                             |
| 既存 4 ルートのハンドラに差分なし                 | PASS | import 行の追加のみ                                                                |

## Task 6: UI 基盤 — `expiry.ts` への切り出し

- 指示書: `docs/tasks/codex/stock-edit/06-expiry-utils.md`
- 実装: `apps/web/src/app/_utils/expiry.ts`（新規 51 行）/ `dashboard-view.ts` / `page.tsx` / `pantry/page.tsx`
- **判定: 受け入れ可**

| 完了条件                                                                           | 判定 | 根拠                                                                                  |
| ---------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------- |
| **純粋な移動（挙動不変）**                                                         | PASS | `dashboard-view.node.test.ts` / `dashboard.test.tsx` が回帰なし（品質ゲート全 green） |
| `parseExpiryDate` / `toLocalMidnight` を export して `dashboard-view.ts` が import | PASS | 指示書の推奨方針どおり。`selectExpiringStocks` の比較ロジックは無変更                 |
| `selectExpiringStocks` / `MEAL_PLAN_STATUS_LABELS` が `dashboard-view.ts` に残る   | PASS | —                                                                                     |
| **`expiryUrgencyChipClass` を動かしていない**                                      | PASS | `category-color.ts` 差分 0                                                            |
| `EXPIRY_URGENCY_WITHIN_DAYS = 3` の新設                                            | PASS | `page.tsx` のローカル定数 `EXPIRY_WITHIN_DAYS` は削除され、両画面が同じ定数を参照     |
| `'use client'` を付けていない                                                      | PASS | `expiry.ts` は純関数モジュール                                                        |
| `pantry/page.tsx` が `asOf={now}` を渡す                                           | PASS | ダッシュボードと同型のパターン                                                        |

## Task 7: UI — 編集ダイアログと在庫カードの表示強化

- 指示書: `docs/tasks/codex/stock-edit/07-pantry-screen.md`
- 実装: `stock-edit-dialog.tsx`（新規 226 行）/ `stock-row.tsx` / `location-group.tsx` / `pantry-client.tsx` / テスト（+208 / +56 / +81 行）
- **判定: 受け入れ可**

| 完了条件                                           | 判定                   | 根拠                                                                                                                                                                |
| -------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **緊急度チップが期限切れでも出る**（レビュー M-1） | PASS                   | `remainingDays !== null && remainingDays <= EXPIRY_URGENCY_WITHIN_DAYS`。**下限なし**。`SR-EDIT-07` でテスト固定                                                    |
| **閾値外にチップが出ない**                         | PASS                   | `SR-EDIT-04` + 境界テスト `SR-EDIT-BND`（3 日で表示 / 4 日で非表示）                                                                                                |
| **チップの文言**（レビュー M-2）                   | PASS                   | `formatExpiryUrgencyLabel(remainingDays)`。既存の `〜M/Dまで` も残存                                                                                                |
| **`getExpiryUrgency` を改造していない**            | PASS                   | 閾値判定は呼び出し側（`stock-row.tsx`）で実施                                                                                                                       |
| 保存場所ラベルを常時表示（null でも）              | PASS                   | `SR-EDIT-01` / `SR-EDIT-02`                                                                                                                                         |
| `onEdit` の結線                                    | PASS                   | `onClick={() => onEdit(stock)}`。`SR-EDIT-06` で `stock` オブジェクトが渡ることを固定                                                                               |
| **375px のレイアウト対策**（レビュー M-3）         | PASS（実画面は未確認） | `<li>` を `flex items-center` → **`flex flex-col gap-3`** に変更しボタン行を下へ折り返す。ボタン行は `flex flex-wrap justify-end gap-2`。品目名の `truncate` は維持 |
| `'use client'` の要否                              | PASS                   | ダイアログのみ付与。`stock-row.tsx` / `location-group.tsx` には付けていない                                                                                         |
| ダイアログの 404 / 422 / 通信エラー分岐            | PASS                   | `SED` 系テストで固定                                                                                                                                                |
| 編集ダイアログを `useApiAction` と独立させる       | PASS                   | ローカル `useState` + `router.refresh()`（パターン C）                                                                                                              |

## Task 8: UI — 買い物完了パネルへの賞味期限入力

- 指示書: `docs/tasks/codex/stock-edit/08-complete-panel.md`
- 実装: `complete-shopping-panel.tsx` / テスト（+92 行）
- **判定: 受け入れ可**

| 完了条件                                     | 判定 | 根拠                                                                                    |
| -------------------------------------------- | ---- | --------------------------------------------------------------------------------------- |
| **既定で日付入力が非表示**（パネル高さ不変） | PASS | `expiresAtExpanded` 既定 `false`。展開時のみ独立行として描画                            |
| `expiresAt: null` ハードコードの解除         | PASS | `expiresAt: row.expiresAt === '' ? null : row.expiresAt`                                |
| **`isRowSelected` の判定式に差分なし**       | PASS | `row.checked && isAmountValid(row.amountText)` のまま。`expiresAt` の条件を足していない |
| 折りたたみ解除で値がクリアされる             | PASS | `expiresAt: expiresAtExpanded ? row.expiresAt : ''`                                     |
| `aria-expanded` の付与                       | PASS | 展開ボタンに付与済み                                                                    |
| `useId()` の使用                             | PASS | `expiresAtId`。ハードコード id なし                                                     |
| **契約・DTO・UseCase・ルートに差分なし**     | PASS | `packages/` と `apps/web/src/server/` に差分 0。コンポーネント 1 ファイル + テストのみ  |

---

# 実画面確認（manual-browser-verify）と修正

- 実施日: 2026-08-09
- 環境: `DATABASE_URL=pglite://.pglite-dev next dev`（リモート・PGlite 経路）
- スクリプト: `apps/web/scripts/seed-stock-edit-verify.mjs` / `apps/web/scripts/verify-stock-edit.mjs`
- **結果（修正後）: PASS 14 / FAIL 0 / BLOCKED 1。前提データ S-1〜S-7 は全消化。**

## 検出した欠陥 2 件（いずれも修正済み・コミット `22560bb`）

**どちらも自動テストが全 green のまま通過していた。** 実画面確認でのみ検出できた。

### 1. MB-18: 編集の成功が一覧へ反映されない（新規観点として追加）

保存してもカードの表示が変わらず、**リロードして初めて反映される**。ユーザーには
「編集が効いていない」ように見える。編集機能の主経路であり、影響は MB-16 より大きい。

原因: `PantryClient` は `stocks` を `useState(pantry.stocks)` で持ち props と同期しない。
ダイアログ側は `price-record-edit-dialog.tsx` を踏襲して `router.refresh()` を呼んでいたが、
Server Component の再レンダリングで `pantry` prop が変わっても `useState` の値は変わらない。
先例のコピー元（商品詳細）は server props を直接描画しており、この差を吸収していなかった。

修正: 応答の `PantryDto` を `onUpdated(dto.stocks)` で返し、`PantryClient` が
`setStocks` する形にした（consume / discard と同じ D-5「応答の PantryDto で丸ごと置換」に統一）。

**この欠陥を確認で見逃しかけた理由**: 当初の MB-01〜06 が毎回 `page.reload()` してから
アサートしていた。DB 永続化（本ユニットの罠）は検証できていたが、画面反映は見ていなかった。
確認スクリプトに **MB-18（リロードしない）** を追加した。

### 2. MB-16: 404 のメッセージが一度も表示されない

別タブで消費・廃棄済みの在庫を保存すると、ダイアログが黙って閉じて項目が消えるだけで
理由が分からない。設計書 §エラー処理と Codex ブリーフ Task 7 はどちらも
「『この在庫はすでに削除されています』を**表示して**閉じる」と指示していた。

原因: `setErrorMessage(...)` の直後に `onOpenChange(false)` を呼んでいたが、
`errorMessage` は `<AlertDialogContent>` の**内側**にしか描画されない。
`PantryClient` の `onOpenChange` は `setEditingStock(null)` するのでダイアログは即座に
アンマウントされ、メッセージは描画される前に消える。

修正: `onStockMissing()` で一覧側の共有エラーバナー（`action.errorMessage`）に委ねる。
`handleRefetch` は成功時にバナーを消すため、**再同期を待ってからメッセージを設定**する
順序にした（逆にすると即座に消える。実装中に一度踏んだ）。

### RTL テストがこれを検出できなかった理由（構造的な問題）

`SED-05` は `onOpenChange` に `vi.fn()` を渡している。実環境では `stock` が `null` になり
ダイアログがアンマウントされるが、モックでは何も起きないので `stock` が残りメッセージが
見える。テストは「メッセージが出る」と「`onOpenChange(false)` が呼ばれる」を**両方**
アサートしていたが、**実環境ではこの 2 つは同時に成立しない**。

追加した回帰ガード（いずれも修正前のコードで Red になることを確認済み）:

| ID           | 内容                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------ |
| `SED-04`     | 成功時に `onUpdated(stocks)` が呼ばれることへ変更（`router.refresh` の検証をやめた）       |
| `SED-05`     | 404 で `onStockMissing()` が呼ばれることへ変更                                             |
| `SED-05b`    | **実際に閉じる Host コンポーネント**で再現し、メッセージがダイアログ内に残らないことを固定 |
| `PC-EDIT-03` | `PantryClient` 経由で、編集成功が**リロードなしに**一覧へ反映されること                    |
| `PC-EDIT-04` | `PantryClient` 経由で、404 のとき一覧側にバナーが出ること                                  |

## 確認結果（修正後）

| ID        | 判定        | 内容                                                                                                                                 |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| MB-01     | PASS        | 数量の値を変更 → リロード後も保持（米 5kg→3kg）                                                                                      |
| MB-02     | PASS        | **値は据え置き・単位のみ変更** → リロード後も保持（牛乳 2.5個→2.5g）＝罠 2 の直接検出                                                |
| MB-03     | PASS        | 賞味期限を `null` → 値に設定 → 保持（チップ「あと2日」）                                                                             |
| MB-04     | PASS        | 賞味期限を `null` にクリア → 保持                                                                                                    |
| MB-05     | PASS        | 保存場所を未設定 → 冷蔵に設定 → 保持                                                                                                 |
| MB-06     | PASS        | 保存場所を未設定に戻す → 保持                                                                                                        |
| MB-07     | PASS        | 閾値内にチップ（牛乳=明日まで / 玉ねぎ=本日まで / 味噌=あと3日）                                                                     |
| MB-08     | PASS        | **閾値外にチップが出ない**（冷凍餃子 +20日 / 塩 +4日）。S-6（+3日）との境界が正しい                                                  |
| MB-09     | PASS        | 期限切れ（卵 -1日）に「期限切れ」チップ                                                                                              |
| MB-10     | PASS        | 保存場所ラベルが 7 件すべてに常時表示（未設定含む）                                                                                  |
| MB-11〜14 | **BLOCKED** | 買い物完了パネルは「未完了の買い物リスト」が必要で、dev シードに献立・買い物リストが無く到達不可。RTL の `CSP-01〜06` で代替検証済み |
| MB-15     | PASS        | 数量 0 はクライアント側で送信されない                                                                                                |
| MB-16     | PASS        | 別経路で廃棄済みの Stock を保存すると 404 メッセージを表示（**修正後**）                                                             |
| MB-17     | PASS        | 375px で横スクロールなし・テキスト切れなし。S-1〜S-7 の 7 件が並んだ状態で確認                                                       |
| MB-18     | PASS        | 編集成功が**リロードなしで**一覧へ反映（**修正後**・新規観点）                                                                       |

## 品質ゲート（修正後）

```
PASS: harness lint type-check test / FAIL: (none) / RESULT: OK
domain 423 / application 297 / infrastructure 84 / api-contract 268 / web 800
```

## 確認手順側のミス 1 件（記録）

最初のシードで `stock-S-1` という **UUID でない ID** を使い、`stockIdParamSchema` の
`z.uuid()` に弾かれて全 API が 400 になった。一瞬「実装の欠陥」と誤診しかけた。
`seed-stock-edit-verify.mjs` にコメントとして残した。
**環境・データ側の不備を実装の欠陥と誤診するのはこれで 3 回目**（前 2 回は
`.next` の残骸と dev 起動中の PGlite 再シード）。
