# 要件定義: stock-edit

- task-id / 変更レベル: Sprint 8 Unit A（roadmap タスク 1 + 2 の統合）/ L3
- 作成日: 2026-08-07（2026-08-07 更新: P-1〜P-6 ユーザー確定を反映）

## 背景

Sprint 8 のゴールは「在庫の実用化（期限入力 → アラート）」。賞味期限アラート（Unit B・
タスク 3）が機能するには、まず在庫に期限データが実際に入る必要があるが、現状は 2 つの
主要な流入経路のどちらも期限を持てない・持たせない設計になっている。

1. 買い物完了パネル（`apps/web/src/app/shopping-lists/_components/complete-shopping-panel.tsx`）は
   `docs/designs/shopping-complete-stock-selection.md` Q-1 の確定（2026-07-25）により、
   在庫化時の `expiresAt` を常に `null` で送信する。理由は「買い物直後に全品目の期限を
   入れるのは負荷が高く、パネルも縦に長くなる」。同書は「期限管理を使いたくなった時点で
   『Stock 編集』または『完了パネルへの期限入力』のどちらかを足す」と申し送っていた
   （同書 L327-328）。
2. 既存 Stock の `expiresAt` / `storedLocation` は `packages/domain/src/pantry/pantry.ts` 上
   `private readonly` で、生成後に変更する手段が無い。これは `docs/designs/pantry-core.md`
   S-4 案 α の明示的な決定（「値の後付け（在庫編集操作）は Unit B / Phase 2 の検討事項として
   申し送る」）による。手動追加フォーム（`add-stock-form.tsx`）でのみ期限を入力できる。

このままでは Unit B（アラート）が対象にできる在庫が「手動追加した分のみ」に限られ、
roadmap の Sprint 8 完了条件 2 件を満たせない。

## 目的

- 在庫（Stock）の賞味期限・保存場所・数量を事後に編集できるようにする（roadmap タスク 1。
  数量を含めることは 2026-08-07 のユーザー確定 P-1 による）。
- 買い物完了時に品目ごとに賞味期限を任意入力できるようにする（roadmap タスク 2）。
- 上記 2 つを Unit B（賞味期限アラート）が実データを扱えるようにする前提として満たす。

## ユーザー要求（原文の要約）

- roadmap Sprint 8 完了条件（`docs/05-roadmap.md` L638-639）:
  「買い物完了時に賞味期限を入力できる（任意）」
  「既存の在庫に後から期限・保存場所を設定できる」。
- ユーザー確定（2026-08-07、`docs/05-roadmap.md` L652-665）: タスク 1・2 は 1 ユニット
  （Unit A: stock-edit）にまとめる。理由は「どちらも『賞味期限を入れる手段』で UI 語彙
  （`Input type="date"` / `SelectField` + `LOCATION_SELECT_OPTIONS`）と DTO を共有するため」。
  レベルは L3（新規 HTTP API を伴うため）。実装ルートは Codex 委譲。
- ユーザー確定（2026-08-07、P-1〜P-6）: 設計書 `docs/designs/stock-edit.md` §確定事項を参照。
  特に P-1 は推奨案（期限・保存場所のみ）と異なり「期限・保存場所 + 数量」に確定（打ち間違い
  の訂正ニーズを踏まえた実用上の判断。`displayName` は対象外のまま）。P-4 も推奨案（保存場所
  ラベルのみ）と異なり「保存場所ラベル + 緊急度チップの両方」を `/pantry` に追加することに
  確定。

## 機能要件

- FR-1: 既存 Stock の賞味期限（`expiresAt`）を編集できる（設定・変更・クリアの 3 操作）。
- FR-2: 既存 Stock の保存場所（`storedLocation`）を編集できる（設定・変更・クリアの 3 操作）。
- FR-3: 既存 Stock の数量（`amount`）を編集できる（値・単位の変更。ただし 0 以下には
  できない。**確定・P-1**）。
- FR-4: 買い物完了パネルで、在庫化する品目ごとに賞味期限を任意入力できる（未入力可）。
- FR-5: 編集操作を `/pantry` 画面から起動できる導線（編集ダイアログ）を用意する。
- FR-6: 編集した内容は API レスポンスだけでなく DB にも永続化され、リロード後も保持される
  （「実装上の罠」参照。現状の Repository 実装はこの要件を満たさない。数量の単位変更を
  含めた 4 列すべてが対象）。
- FR-7: `displayName`（品目名）・`purchasedAt`（購入日時）・`productId`・
  `sourceShoppingItemId` は編集対象に含めない（確定・対象外）。
- FR-8: `/pantry` の在庫カードに保存場所ラベルと賞味期限の緊急度チップを表示する
  （確定・P-4。ダッシュボードとの表示の非対称を解消する）。

## 非機能要件

新規の外部 API / 外部ストレージ I/O は無く、大量データを扱う集計クエリも発生しない
（1 件更新の低頻度操作）。厳密な性能要件は明示されていないため、性能設計は対象外
（設計書側の性能セクション記載条件〈外部 I/O 新設・大量データクエリ新設・明示の性能要件〉に
いずれも該当しない）。

## 正常系

- N-1: ユーザーが `/pantry` の在庫カードから編集を開き、賞味期限を `YYYY-MM-DD` で入力して
  保存すると、一覧に即時反映され、DB にも保存される（リロードしても値が保持される）。
- N-2: 保存場所を `fridge` / `freezer` / `pantry` のいずれかに変更して保存すると反映される。
- N-3: 賞味期限入力欄を空にして保存すると `expiresAt` が `null` にクリアされる。
- N-4: 保存場所を「未設定」に戻して保存すると `storedLocation` が `null` にクリアされる。
- N-5: 数量の値のみを変更して保存すると、変更後の値が一覧・DB 双方に反映される。
- N-6: 数量の単位を変更して（例: `個` → `g`）保存すると、値・単位ともに一覧・DB 双方に
  反映される（実装上の罠: 単位のみ変更した場合に反映漏れが起きやすいため要注意）。
- N-7: 買い物完了パネルで在庫化する品目の賞味期限に日付を入力し完了すると、生成される
  Stock の `expiresAt` にその値が入る。
- N-8: 買い物完了パネルで賞味期限を未入力のまま完了すると、従来通り `expiresAt: null` に
  なる（既存挙動との後方互換）。
- N-9: `/pantry` で賞味期限が近い（確定した閾値以内の）在庫カードに緊急度チップが表示され、
  保存場所ラベルが常時表示される。

## 異常系

- E-1: 存在しない `stockId` を編集しようとすると 404（`StockNotFoundError`）。
- E-2: 賞味期限に不正な日付文字列を送ると **400**（`zValidator` の契約層バリデーション）。
- E-3: 保存場所に enum 外の値を送ると **400**（同上）。
- E-4: 数量に 0 以下の値を送ると **400**（契約層。`updateStockSchema` の `positive()`）。
  契約層をバイパスした場合は Domain（`Stock.updateDetails`）が **422**
  （`InvalidStockOperationError`）で拒否する。`Stock.create()` と同じ制約を編集にも適用する。
- E-7: 必須キー（`amount` / `expiresAt` / `storedLocation`）を省略すると **400**。
  部分更新は許さない（P-2 の確定と対になる）。

> **400 と 422 は層が違う**（契約層 = `@hono/zod-validator` が `app.onError` を経由せず自前で
> 返す / ドメイン層 = `InvalidOperationError` 継承を `onError` が 422 へ写像）。
> 正典は `docs/designs/stock-edit.contract.md` §4。

- E-5: 編集リクエスト送信中にネットワークエラーが起きると、画面はエラーメッセージを表示し
  一覧は変更前の状態のまま保たれる（楽観的更新をしない前提。設計側 UI 設計に準拠）。
- E-6: 買い物完了パネルで不正な日付形式の賞味期限が入力された場合の扱い（クライアント側で
  事前に弾くか、API の 422 を品目単位でハンドリングするか）は設計側 P-3 の UI 設計に含める。

## 境界条件

- B-1: `expiresAt` に今日より過去の日付を入力できるか（賞味期限切れ状態を事後に記録する
  ケース）。禁止しない（設計書側で確定。過去日付の入力を許可する）。
- B-2: `expiresAt: null` と `storedLocation: null` を同時に送るリクエスト（両方クリア）。
- B-3: 数量を 0 に設定しようとするリクエスト（`consumeStock` が集約から自動的に除去する
  概念と衝突するため、編集での 0 設定は許可しない。正数のみ許可）。
- B-4: 数量の単位のみを変更するリクエスト（値は変えず単位だけ変更するケース。実装上の罠と
  直結するため回帰テスト必須）。
- B-5: 単位変更が `GenerateShoppingListUseCase.applyPantryDeduction` の在庫引き算（単位不一致は
  差し引かず全量購入・数えられる単位のみ切り上げ）に与える影響（本ユニットでロジック自体は
  変更しないが、編集操作がこの経路の挙動を事後的に変え得ることを認識しておく）。
- B-6: 買い物完了パネルで一部品目だけ期限を入力し、他の品目は未入力のまま送信する混在ケース。

## 前提

- DB スキーマ（`expires_at` date nullable / `stored_location` text nullable / `amount_value` /
  `amount_unit`、いずれも `packages/infrastructure/src/db/schema.ts:144-162`）は変更しない。
- api-contract の `expiresAt: z.iso.date().nullable()` 形式（`YYYY-MM-DD`）を踏襲する。
- `Pantry.stocks` の集約境界・`PantryId.singleton()`（単一世帯前提）は変更しない。
- `packages/application/src/shared/date.ts` の `toLocalDateString` によるローカル日付の
  往復規約を更新系でも踏襲する。
- 在庫引き算（`GenerateShoppingListUseCase.applyPantryDeduction`）のロジック自体は変更しない
  （B-5 の影響は認識のみで、挙動変更はしない）。

## 制約

- Domain 層の不変性方針の変更（`pantry-core.md` S-4 案 α からの転換）を伴うため、
  [ADR-0016](../decisions/ADR-0016-stock-details-mutable.md) に記録する（作成済み・2026-08-07）。
- `packages/infrastructure/src/repositories/drizzle-pantry.repository.ts:27-47` の `save()` は
  `onConflictDoUpdate` の `set` 句が `amount_value` のみであり、これを拡張しないと編集内容が
  DB に反映されない。特に数量の**単位**（`amount_unit`）は現状 `set` 句に無く、値だけ変更が
  反映されて単位変更が反映されない、という同じ罠のもう 1 つの顔がある。しかも API は 200 を
  返し、レスポンスは編集後の値を含むため画面上は一見成功して見え、リロードして初めて消えたと
  分かる（「実装上の罠」）。`amount_value` / `amount_unit` / `expires_at` / `stored_location`
  の 4 列すべての拡張を本ユニットの必須スコープに含める。

## 対象範囲

- Domain: `Stock` に数量・期限・保存場所を変更するメソッドを追加、`Pantry` に集約側の
  委譲メソッドを追加。
- Application: 既存 Stock を更新する新規 UseCase を追加。
- api-contract: 更新用リクエストの Zod スキーマを追加（数量を含む）。
- Presentation(route): 新規 HTTP エンドポイントを追加（`apps/web/src/server/routes/pantry.ts`）。
- Infrastructure: `drizzle-pantry.repository.ts` の `save()` の `onConflictDoUpdate.set` を
  4 列に拡張。
- UI: `/pantry` の編集導線・編集ダイアログ（数量・保存場所・賞味期限の 3 フィールド）の追加、
  買い物完了パネルへの賞味期限入力欄の追加、`/pantry` カードへの保存場所ラベル・緊急度チップの
  追加、期限緊急度ユーティリティの共通化。

## 対象外

- `displayName`（品目名）の編集（確定・対象外。誤字修正ニーズはあるが、Product 連携時の
  整合性検討が必要になるため別ユニットで再検討）。
- `purchasedAt`（購入日時）の編集（対象外。編集ニーズの言及がなく、消費順序等のロジックに
  影響するため据え置く）。
- `productId` / `sourceShoppingItemId` の編集（対象外。集約間の ID 参照・冪等ガードに関わる
  ため変更しない）。
- 賞味期限アラート / Web Push（Unit B。Sprint 8 タスク 3）。
- 消費・廃棄の取り消し（undo）・履歴テーブル（Unit C。Sprint 8 タスク 4）。
- DB スキーマ変更・マイグレーション（既存の nullable 列をそのまま使う）。
- 在庫引き算（`GenerateShoppingListUseCase.applyPantryDeduction`）の挙動変更（B-5 参照。
  影響の認識のみで変更はしない）。
- 認証・ユーザー概念（ADR-0003 / ADR-0004）。

## 後方互換性・データ移行

対象外（DB スキーマ変更なし。既存 Stock 行はそのまま編集可能になるだけで、マイグレーションは
不要）。ただし「実装上の罠」の Repository 修正（4 列への拡張）を怠ると、既存の
AddStock/Consume/Discard の `amount_value` 更新は従来通り機能する一方、新規の編集機能
（特に単位変更・期限・保存場所）だけが見かけ上成功して実際は保存されない不具合になる。
したがって Infrastructure の PGlite 回帰テスト（編集 → 再取得で 4 列すべての値が保持されて
いることの確認。単位変更のケースを必ず含める）を受け入れ条件に含める。

## 受け入れ条件（Definition of Done に対応）

- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` が通る（変更パッケージ分）。
- [ ] Domain: Stock 編集メソッドの単体テスト（正常系・0 以下の拒否・null クリア・単位変更）。
- [ ] Application: 新規 UseCase のテスト（404 / 422 を含む）。
- [ ] Infrastructure: PGlite 回帰テストで、編集後に Repository を再取得（`find()`）した際に
      `amount`（値・単位）/ `expiresAt` / `storedLocation` が更新後の値であることを確認する
      （実装上の罠の再発防止。単位のみ変更するケースを必ず含める）。
- [ ] apps/web: 新規ルートのテスト、編集ダイアログ・完了パネル改修・`/pantry` カードの
      保存場所ラベル/緊急度チップのコンポーネントテスト。
- [ ] roadmap Sprint 8 完了条件 2 件（買い物完了時の任意入力／既存在庫の後付け編集）を満たす。
- [x] ADR-0016 の起票（設計フェーズで完了・2026-08-07）。

## 未決事項

なし（P-1〜P-6 は 2026-08-07 にユーザー確定済み。確定内容と比較検討の記録は
`docs/designs/stock-edit.md` §確定事項を参照）。
