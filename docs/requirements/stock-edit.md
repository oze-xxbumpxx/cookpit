# 要件定義: stock-edit

- task-id / 変更レベル: Sprint 8 Unit A（roadmap タスク 1 + 2 の統合）/ L3
- 作成日: 2026-08-07

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

- 在庫（Stock）の賞味期限・保存場所を事後に編集できるようにする（roadmap タスク 1）。
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

## 機能要件

- FR-1: 既存 Stock の賞味期限（`expiresAt`）を編集できる（設定・変更・クリアの 3 操作）。
- FR-2: 既存 Stock の保存場所（`storedLocation`）を編集できる（設定・変更・クリアの 3 操作）。
- FR-3: 買い物完了パネルで、在庫化する品目ごとに賞味期限を任意入力できる（未入力可）。
- FR-4: 編集操作を `/pantry` 画面から起動できる導線を用意する（起動 UI の形は設計側 P-3
  以外の論点として扱う。編集ダイアログの起動導線自体は設計書で確定する）。
- FR-5: 編集した内容は API レスポンスだけでなく DB にも永続化され、リロード後も保持される
  （「実装上の罠」参照。現状の Repository 実装はこの要件を満たさない）。
- FR-6: 編集できる項目の範囲（期限・保存場所のみか、数量・品目名も含むか）は設計側 P-1 の
  判断に委ねる。

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
- N-5: 買い物完了パネルで在庫化する品目の賞味期限に日付を入力し完了すると、生成される
  Stock の `expiresAt` にその値が入る。
- N-6: 買い物完了パネルで賞味期限を未入力のまま完了すると、従来通り `expiresAt: null` に
  なる（既存挙動との後方互換）。

## 異常系

- E-1: 存在しない `stockId` を編集しようとすると 404（`StockNotFoundError`）。
- E-2: 賞味期限に不正な日付文字列を送ると 422（バリデーションエラー）。
- E-3: 保存場所に enum 外の値を送ると 422。
- E-4: 編集リクエスト送信中にネットワークエラーが起きると、画面はエラーメッセージを表示し
  一覧は変更前の状態のまま保たれる（楽観的更新をしない前提。設計側 UI 設計に準拠）。
- E-5: 買い物完了パネルで不正な日付形式の賞味期限が入力された場合の扱い（クライアント側で
  事前に弾くか、API の 422 を品目単位でハンドリングするか）は設計側 P-3 の UI 設計に含める。

## 境界条件

- B-1: `expiresAt` に今日より過去の日付を入力できるか（賞味期限切れ状態を事後に記録する
  ケース）。禁止する理由は無いと考えられるが、設計側で確認する。
- B-2: `expiresAt: null` と `storedLocation: null` を同時に送るリクエスト（両方クリア）。
- B-3: 数量（`amount`）を編集対象に含める場合の 0 以下・単位変更の扱い（P-1 が数量を含む
  結論になった場合のみ発生。本ユニットでは非対象の想定）。
- B-4: 買い物完了パネルで一部品目だけ期限を入力し、他の品目は未入力のまま送信する混在ケース。

## 前提

- DB スキーマ（`expires_at` date nullable / `stored_location` text nullable、いずれも
  `packages/infrastructure/src/db/schema.ts:144-162`）は変更しない。
- api-contract の `expiresAt: z.iso.date().nullable()` 形式（`YYYY-MM-DD`）を踏襲する。
- `Pantry.stocks` の集約境界・`PantryId.singleton()`（単一世帯前提）は変更しない。
- `packages/application/src/shared/date.ts` の `toLocalDateString` によるローカル日付の
  往復規約を更新系でも踏襲する。

## 制約

- Domain 層の不変性方針の変更（`pantry-core.md` S-4 案 α からの転換）を伴うため、ADR-0016 を
  別途起票する（本書・設計書では参照のみで ADR 本体は書かない）。
- `packages/infrastructure/src/repositories/drizzle-pantry.repository.ts:27-47` の `save()` は
  `onConflictDoUpdate` の `set` 句が `amount_value` のみであり、これを拡張しないと編集内容が
  DB に反映されない。しかも API は 200 を返し、レスポンスは編集後の値を含むため画面上は
  一見成功して見え、リロードして初めて消えたと分かる（「実装上の罠」）。この修正を本ユニットの
  必須スコープに含める。

## 対象範囲

- Domain: `Stock` に期限・保存場所を変更するメソッドを追加、`Pantry` に集約側の委譲メソッドを
  追加。
- Application: 既存 Stock を更新する新規 UseCase を追加。
- api-contract: 更新用リクエストの Zod スキーマを追加。
- Presentation(route): 新規 HTTP エンドポイントを追加（`apps/web/src/server/routes/pantry.ts`）。
- Infrastructure: `drizzle-pantry.repository.ts` の `save()` の `onConflictDoUpdate.set` を拡張。
- UI: `/pantry` の編集導線・編集ダイアログの追加、買い物完了パネルへの賞味期限入力欄の追加。

## 対象外

- 賞味期限アラート / Web Push（Unit B。Sprint 8 タスク 3）。
- 消費・廃棄の取り消し（undo）・履歴テーブル（Unit C。Sprint 8 タスク 4）。
- DB スキーマ変更・マイグレーション（`stocks.expires_at` / `stored_location` は既存の
  nullable 列をそのまま使う）。
- 在庫引き算（`GenerateShoppingListUseCase.applyPantryDeduction`）の挙動変更。
- 認証・ユーザー概念（ADR-0003 / ADR-0004）。

## 後方互換性・データ移行

対象外（DB スキーマ変更なし。既存 Stock 行はそのまま編集可能になるだけで、マイグレーションは
不要）。ただし「実装上の罠」の Repository 修正を怠ると、既存の AddStock/Consume/Discard の
`amount_value` 更新は従来通り機能する一方、新規の編集機能だけが見かけ上成功して実際は保存
されない不具合になる。したがって Infrastructure の PGlite 回帰テスト（編集 → 再取得で値が
保持されていることの確認）を受け入れ条件に含める。

## 受け入れ条件（Definition of Done に対応）

- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` が通る（変更パッケージ分）。
- [ ] Domain: Stock 編集メソッドの単体テスト（正常系・不正値・null クリア）。
- [ ] Application: 新規 UseCase のテスト（404 / 422 を含む）。
- [ ] Infrastructure: PGlite 回帰テストで、編集後に Repository を再取得（`find()`）した際に
      `expiresAt` / `storedLocation` が更新後の値であることを確認する（実装上の罠の再発防止）。
- [ ] apps/web: 新規ルートのテスト、編集ダイアログ・完了パネル改修のコンポーネントテスト。
- [ ] roadmap Sprint 8 完了条件 2 件（買い物完了時の任意入力／既存在庫の後付け編集）を満たす。
- [ ] ADR-0016 の起票（別タスク。本ユニットの完了条件そのものには含めないが申し送る）。

## 未決事項

- 設計書 `docs/designs/stock-edit.md` の「未決事項」で扱う P-1〜P-6（編集項目の範囲 /
  HTTP メソッドと部分更新セマンティクス / 完了パネルの期限入力 UI / `/pantry` カードへの
  保存場所ラベル・緊急度チップ追加要否 / Domain 不変性方針の変更 / Domain API の形）。
- B-1: 過去日付の `expiresAt` 入力を許可するか（設計書側で確認）。
