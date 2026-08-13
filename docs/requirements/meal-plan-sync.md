# 要件定義: meal-plan-sync

- task-id / 変更レベル: Sprint 10 Unit A（roadmap タスク1「献立変更への自動削除追随・数量合算」）/ L3
- 作成日: 2026-08-13（Gate A ユーザー確定・2026-08-13 を反映）

## 背景

[ADR-0007](../decisions/ADR-0007-shopping-list-differential-merge.md)（2026-07-24）は、献立変更を
買い物リストへ反映する明示同期（`POST /api/shopping-lists/:id/sync` →
`SyncShoppingListFromMealPlanUseCase`）を新設したが、スコープを**新規材料の追加のみ**に絞り、
以下を明示的に将来課題として残した（同 ADR §Consequences リスク1・§Alternatives 案C 却下理由）。

1. **削除追随なし**: 献立からレシピを外して材料が減っても、買い物リストの該当品目は残る。
2. **数量合算なし**: 同一材料の必要量が増減しても、既存品目の `requiredAmount` は変わらない。

その後 [ADR-0011](../decisions/ADR-0011-shopping-item-hard-delete.md)（2026-07-25）で品目の手動削除
（`removeItem`）が入り、[ADR-0009](../decisions/ADR-0009-shopping-list-item-check-uncheck.md)
（2026-07-24）で軽量チェック（`check()`/`uncheck()` による `bought` 遷移）が入ったことで、
「削除」「購入済み」の意味論が ADR-0007 策定時より明確になった。Sprint 10 はこの 2 つの将来課題を
閉じ、roadmap の完了条件「献立からレシピを外すと買い物リストが追随する」を満たす。

2026-08-13、Orchestrator 経由でユーザーが Gate A（削除対象・数量更新・トリガの 3 論点）を確定した
（`docs/05-roadmap.md` §Unit A の Gate A）。本書はその確定内容を要件として固定する。

## 目的

- 献立からレシピを外した、または材料の数量が変わったとき、既存の明示同期
  （「献立の変更を反映」ボタン）を押すと買い物リストが正しく追随するようにする。
- チェック済み（`bought`）品目・手動追加品目・購入実績は一切変更・削除しない
  （ADR-0007 が守ってきた「既存品目のチェック/購入状態を失わない」原則を継続する）。
- 新規 API・新規 DB 列・Zod 契約変更を行わず、既存エンドポイントの振る舞いだけを拡張する。

## ユーザー要求（原文の要約）

- roadmap Sprint 10 完了条件 1 件目（`docs/05-roadmap.md` L777）:
  「献立からレシピを外すと買い物リストが追随する」。
- Gate A（2026-08-13、Orchestrator 経由でユーザー確定・推奨案を採用）:
  1. 削除対象は `source === 'from_meal_plan'` かつ `status === 'pending'` の品目のみ。集計に
     無いキーなら削除する。`bought` と `manually_added` は残す。
  2. 同じキーの `pending` 品目は新しい集計値で数量を上書きする。`bought` は触らない。
  3. トリガは既存の明示ボタン（「献立の変更を反映」）を維持する。献立変更時の自動同期は行わない。
  4. Pantry 在庫の巻き戻しは行わない（確認不要事項として roadmap に明記済み）。
- ドメイン写像の確定（`docs/05-roadmap.md` L825-828）: `ItemStatus` に `checked` という状態は存在
  しない。画面のチェックは `ShoppingItem.check()` が `bought` にする（ADR-0009）。したがって
  「チェック済み」はすべて `bought` として扱い、削除も数量更新も行わない。

## 機能要件

- FR-1: 献立の現在の材料集計（`resolveMealPlanIngredients`）に存在しないマッチキーを持つ、
  `source === 'from_meal_plan'` かつ `status === 'pending'` の既存品目を、同期実行時に
  `ShoppingList.removeItem` で削除する。
- FR-2: 献立の現在の材料集計に存在するマッチキーを持つが必要量が変わった、
  `source === 'from_meal_plan'` かつ `status === 'pending'` かつ `requiredAmount !== null`
  （amountNote 品目を除く）の既存品目を、新しい集計値で `ShoppingList.updateItemRequiredAmount`
  により上書きする。
- FR-3: 既存の新規追加ロジック（集計にあってリストに無いキーを `ShoppingItem.create` で追加）は
  変更しない。追加分にはフル量の在庫引き算（既存 `applyPantryDeduction`）を適用する。
- FR-4: FR-2 の数量増加（delta > 0）分についてのみ Pantry 在庫を引き、二重消費を防ぐ
  （既にその品目のために引いた在庫分をもう一度引かない）。減少方向の更新では Pantry を操作しない。
- FR-5: `Domain` に `ShoppingItem.updateRequiredAmount(amount: Quantity): void` と、
  `ShoppingList` に薄いラッパー `updateItemRequiredAmount(itemId, amount): void` を追加する。
- FR-6: 追加・更新・削除の合計が 0 件のとき、`ShoppingList` と `Pantry` のどちらも保存しない
  （no-op）。Pantry 消費が発生した場合は品目に見た目の変化が無くても `Pantry` を保存する。
- FR-7: 同一の献立に対して変更なく 2 回連続で同期を実行すると、2 回目は no-op になる
  （Pantry 在庫が空の運用を前提とする。境界条件 B-6 参照）。
- FR-8: `bought`・`manually_added`・amountNote 品目（`requiredAmount === null`）は、キーの有無や
  値に関わらず削除も数量更新もされない。
- FR-9: 買い物リスト画面のクライアントが、同期前後の `items` を品目 ID で比較し、追加・削除・
  数量変更の件数から通知文を組み立てる（サーバーは追加件数等を返さない。契約変更なし）。
- FR-10: `POST /api/shopping-lists/:id/sync` の HTTP 契約（パス・メソッド・レスポンス形
  `ShoppingListDto`）は変更しない。

## 非機能要件

新規の外部 API / 外部ストレージ I/O は導入しない。DB クエリの形も既存の集計 + Repository の
`save()`（既存の `notInArray` 差分削除・既存の upsert）のままで、大量データを扱う一覧・集計
クエリの新設は無い。厳密な性能要件も明示されていない。したがって性能設計は簡潔にとどめる
（設計書 §性能 参照。外部 I/O 新設・大量データクエリ新設のいずれにも該当しないため）。

## 正常系

- N-1: 献立から 1 レシピを外し、その材料が他のどのレシピにも含まれなくなった状態で「献立の変更を
  反映」を押すと、その材料の `pending` 品目が買い物リストから消える。
- N-2: N-1 と同じ状況で、外した材料に対応する品目が既に `bought`（チェック済み・購入済みを含む）
  だった場合、その品目は削除されず残る。
- N-3: N-1 と同じ状況で、外した材料に対応する品目が `manually_added` だった場合、その品目は
  削除されず残る。
- N-4: 献立内のレシピの倍量（`scaleFactor`）を増やして材料の必要量が増えた状態で同期すると、
  対応する `pending` かつ `from_meal_plan` の品目の `requiredAmount` が新しい値に更新される。
- N-5: N-4 と逆に倍量を減らして必要量が減った状態で同期すると、`requiredAmount` が新しい
  （小さい）値に更新される。Pantry には変化がない。
- N-6: 献立にレシピを追加し新しい材料が増えた状態で同期すると、既存の追加ロジック（新規
  `ShoppingItem.create`）でその材料が新規追加される（既存動作の回帰確認）。
- N-7: 削除・数量更新・追加のいずれも発生しない状態（献立が同期後と一致）で同期すると、
  リストの内容は変化せず、クライアントには「変更はありませんでした」の通知が出る。
- N-8: 数量が増えた材料について、Pantry に対応する在庫がある場合、増加分（delta）のみが
  Pantry から引かれ、品目の `requiredAmount` はその分減じた値になる。既存の（更新前から
  引かれていた）在庫分は再度引かれない。
- N-9: Pantry 在庫が空の状態で、同一の献立に対し変更なく 2 回連続で「献立の変更を反映」を
  押すと、2 回目はリスト・Pantry のどちらも変化せず、「変更はありませんでした」と表示される
  （FR-7）。

## 異常系

- E-1: 対象 `ShoppingList` が存在しない場合、`ShoppingListNotFoundError` により **404**
  （既存動作。変更なし）。
- E-2: 対象 `ShoppingList.status === 'completed'` の場合、`InvalidShoppingListStateError` により
  **422**（既存動作。変更なし。再開してから同期する運用）。
- E-3: 対応する `MealPlan` が存在しない場合、`MealPlanNotFoundError` により **404**
  （既存動作。変更なし）。
- E-4: `MealPlan.status === 'draft'`（まだ生成前）の場合、`InvalidMealPlanStateError` により
  **422**（既存動作。変更なし）。
- E-5: 削除対象の品目（`from_meal_plan` かつ `pending`）が、削除実行時点で既に存在しない
  （2 人で同時に手動削除した等の競合）場合、`ShoppingList.removeItem` は例外を投げるため
  UseCase 内部の集合演算に不整合が起きないよう、削除候補の抽出は取得直後の
  `shoppingList.items` のスナップショットに対して行う（設計書 §バックエンド設計で詳細化）。
- E-6: ShoppingList の保存が成功し Pantry の保存が失敗した場合、部分失敗のまま処理を終える
  （既存動作を継続。Sprint 10 Unit B の UoW 導入で閉じる対象。本ユニットでは対応しない）。
- E-7: クライアントからの同期リクエストがネットワークエラーになった場合、UI はエラーメッセージを
  表示し、リトライはユーザーの明示的な再押下に委ねる（自動リトライ・無限リトライは行わない）。

## 境界条件

- B-1: 集計に材料が 0 件（献立から全レシピを外した）状態で同期すると、既存の
  `from_meal_plan` かつ `pending` の品目がすべて削除される（`bought`/`manually_added` は残る）。
- B-2: `amountNote`（「適量」等の自由記述）の `from_meal_plan` かつ `pending` 品目は、キーが
  集計に存在し続ける限り数量更新の対象外（`requiredAmount === null` のため FR-2 の対象外）だが、
  キーが集計から消えた場合は削除対象になる（FR-1 は `requiredAmount` の有無を問わない）。
- B-3: 数量更新で新しい集計値と現在値が完全に一致する（変化なし）場合は `updateRequiredAmount`
  を呼ばない（FR-2 の「違うときだけ」）。
- B-4: 数量増加分（delta）の Pantry 引き算後の結果が 0 以下になるケース（通常のドメイン不変条件
  下では発生しないと想定される防御的分岐）は、`Quantity` の 0 値を作らずその品目を
  `ShoppingList.removeItem` する（設計書 §バックエンド設計・§リスク で詳細化）。
- B-5: 献立由来の品目を手動削除（`DELETE /api/shopping-lists/:id/items/:itemId`。既存 API）した
  直後に同期を実行すると、その品目の材料が献立集計にまだ存在する限り再び追加される
  （ADR-0011 の既存の申し送りと同一の挙動。本ユニットで変更しない）。
- B-6: 品目の `requiredAmount` は買う量（在庫引き後）であり、同期の比較対象は集計の生値である。
  生成時に在庫を引いた品目は、献立を変えずに再同期すると生値へ戻ることがある
  （設計書 §リスク R-4。P-6 のため本ユニットでは受容し、対応しない）。

## 前提

- ADR-0007 の決定 1・3・6（差分マージの追加、マッチキー、明示トリガ）は維持する。本ユニットは
  ADR-0007 の決定 2（既存品目は変更・削除しない）・決定 4（数量の増分は行わない）と
  Consequences のリスク 1（削除追随しない）を Gate A の確定内容で塗り替える。
- ADR-0009 の確定（`ItemStatus` に `checked` は存在せず、チェックは `bought` へ遷移する）を
  そのまま踏襲する。
- ADR-0011 の確定（`removeItem` は物理削除・status/source を問わず削除可能）を再利用する。
  本ユニットの削除は `removeItem` を呼ぶだけで、Domain/Infrastructure の変更を要さない。
- マッチキーの規則（`productId ?? displayName.trim()` × 単位。amountNote 系は単位 `'note'`）は
  `ingredientMatchKey` / `itemMatchKey`（`packages/application/src/shopping-list/ingredient-aggregation.ts`）
  のまま変更しない。
- Pantry の在庫引き算ロジック（`applyPantryDeduction`）自体のアルゴリズムは変更しない
  （消費順序・端数処理・単位不一致時の全量購入等）。

## 制約

- 新規 HTTP エンドポイント・新規 Zod スキーマ・DB スキーマ変更を行わない
  （`packages/api-contract` は無変更。レスポンスは既存 `ShoppingListDto` のまま）。
- `docs/designs/meal-plan-shopping-sync.md`（ADR-0007 の詳細設計・v1）は更新しない。本書・
  本ユニットの設計書は新規ファイルとして作成し、関連ドキュメントとして参照する。
- Pantry 巻き戻し（削除に伴う在庫の復元）は行わない。
- Unit B（DB トランザクション / UoW・neon-http ドライバ変更）はスコープ外。ShoppingList 保存と
  Pantry 保存の間の部分失敗窓は本ユニットで閉じない。

## 対象範囲

- Domain（`packages/domain/src/shopping-list/shopping-list.ts`）: `ShoppingItem.updateRequiredAmount`、
  `ShoppingList.updateItemRequiredAmount` の追加。
- Application（`packages/application/src/shopping-list/sync-shopping-list-from-meal-plan.use-case.ts`）:
  数量更新・削除の判定と適用ロジックの追加。既存の追加ロジックは変更しない。
- Application（`packages/application/src/shopping-list/ingredient-aggregation.ts`）: 既存の
  `resolveMealPlanIngredients` / `ingredientMatchKey` / `itemMatchKey` / `applyPantryDeduction`
  をそのまま再利用する（変更なし。設計書で「増分専用の呼び出し方」を明記する）。
- Presentation（`apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`）:
  `handleSync` の通知メッセージ組み立てをID比較ベースに直す。
- Presentation（`apps/web/src/app/shopping-lists/_utils/shopping-list-view.ts` 等）: 同期結果の
  差分（追加・削除・数量更新の件数）を計算する純関数の追加。

## 対象外

- Unit B（DB トランザクション / UoW・`drizzle-orm/neon-serverless` へのドライバ変更）。
- `ConsumeStock` の二重送信抑止（冪等性キー。Sprint 10 タスク6・別ユニット）。
- フォント追加削減の判断（Sprint 10 タスク7・別ユニット）。
- Sprint 8 Unit B（expiry-alert）の実機確認（Sprint 10 タスク5・別ユニット）。
- `meal-plan.mapper.ts` の JST 日付ずれ修正（Sprint 10 タスク2・別ユニット・別 PR）。
- 献立変更時の自動同期（Gate A で明示ボタン維持と確定）。
- Pantry 巻き戻し（Gate A で確認不要事項として明記済み）。
- `bought` 品目の数量変更・自動削除。
- 手動追加（`manually_added`）品目の自動削除。
- `skipped` 状態の API/UI 露出（既存どおり到達不能のまま）。
- 新規 HTTP エンドポイント・新規 Zod スキーマ・DB マイグレーション。

## 後方互換性・データ移行

対象外。DB スキーマ変更なし、既存 API の契約（リクエスト・レスポンス形）も変更しない。
既存の買い物リストデータ（過去に生成・同期されたもの）はそのまま次回の同期から新しい削除・
数量更新ロジックの対象になるが、データ移行操作は不要（次回同期実行時に自然に追随する）。

## 受け入れ条件（Definition of Done に対応）

- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` が通る（変更パッケージ分）。
- [ ] Domain: `ShoppingItem.updateRequiredAmount` / `ShoppingList.updateItemRequiredAmount` の
      単体テスト（正常系・`pending` 以外での throw・amountNote 品目での throw）。
- [ ] Application: `SyncShoppingListFromMealPlanUseCase` のテスト（削除・数量増加・数量減少・
      追加・no-op・冪等・404/422・bought/manually_added/amountNote が対象外であることを含む）。
- [ ] apps/web: `shopping-list-client.tsx` の同期結果メッセージのコンポーネントテスト
      （追加のみ・削除のみ・数量更新のみ・複合・0件の各パターン）。
- [ ] roadmap Sprint 10 完了条件 1 件目「献立からレシピを外すと買い物リストが追随する」を満たす。

## 未決事項

なし（Gate A 確定済み。`docs/05-roadmap.md` §Unit A の Gate A・2026-08-13）。
