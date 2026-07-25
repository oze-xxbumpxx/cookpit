# ADR-0011: 買い物リスト品目は物理削除する（skipped 状態を再利用しない）

- Status: Accepted
- Date: 2026-07-25
- 関連 feature: shopping-item-remove

## Context（背景・なぜ判断が必要か）

ユーザーから「買い物リストに誤って追加した品目を削除したい」という要望が出た。

買い物リストには品目を取り除く手段が UI にもサーバーにも無い。一方で Domain には
`ShoppingItem.markAsSkipped()` / `ShoppingList.markAsSkipped(itemId)` が既に存在するが、
UseCase・API・UI いずれからも露出していない死んだ状態にある。

また **ADR-0007（買い物リストの差分マージ）** が「献立から材料が減っても削除方向には追随
しない。余分な品目はユーザーがチェックしない / skip で対応する。削除追随は将来課題」と
記述しており、「余分な品目 = skip で対応」という方針を明示している。今回そこに物理削除を
持ち込むため、ADR-0007 との関係を整理して記録する必要がある。

## Decision（採用した決定）

**`ShoppingList.removeItem(itemId)` による物理削除を採用する。**

- 集約から `ShoppingItem` を取り除く。永続化は `DrizzleShoppingListRepository.save()` の
  既存の `notInArray` 削除が追随するため、リポジトリ実装とスキーマは変更しない。
- 削除対象は `status` / `source` を問わない（購入済み品目・献立由来の品目も削除できる）。
- 既存の更新操作と同じく `assertActive` を通し、`completed` のリストでは 422 で拒否する。
- API は `DELETE /api/shopping-lists/:id/items/:itemId` → 204。
- `markAsSkipped()` は Domain に残すが、引き続き API / UI には露出しない。

**ADR-0007 との関係**: ADR-0007 が言う「skip で対応」は、**献立の変更に対する自動追随**の
文脈における回避策である。本 ADR が導入するのは**ユーザーによる明示的な手動削除**であり、
文脈が異なるため ADR-0007 を覆さない。**献立変更に対する自動削除追随は引き続き将来課題**の
ままとする。結果として、献立由来の品目を手動削除しても、その後に「献立の変更を反映」
（`SyncShoppingListFromMealPlanUseCase`）を実行すれば再び追加される。

## Alternatives（検討した非採用案と却下理由）

### 案 A: 既存の `skipped` 状態を API / UI に露出させる（却下）

- **意味論が合わない。** `skipped` は「買う予定だったが今回は買わなかった」という買い物の
  記録であり、「そもそも追加が誤りだった」とは別の概念。誤追加を記録に残す価値がない。
- **要件を満たさない。** `markAsSkipped()` は `pending` からしか呼べず、`bought` からは
  例外を投げる。ユーザー要望は「すべての品目を削除可能」なので購入済みの誤追加を消せない。
- **実装範囲がむしろ広い。** 露出させると「skipped 行を UI でどう見せるか」「店舗グループの
  `bought/total` カウントにどう含めるか」「買い物完了パネルの在庫化候補としてどう扱うか」
  という追加の設計判断が芋づる式に発生する。

### 案 B: 論理削除（`deletedAt` 列の追加）（却下）

- DB スキーマ変更とマイグレーションが必要になる。物理削除なら**どちらも不要**。
- 監査要件・復元要件が無い（個人・2 人利用のアプリ、`docs/01-overview.md`）。
- 全ての読み取りクエリに `WHERE deleted_at IS NULL` の考慮が波及する。

### 案 C: 手動追加（`manually_added`）の品目だけ削除可能にする（却下）

- 献立由来の品目にも「この週は作らないので買わない」という削除需要がある。
- 制限してもユーザーには理由が見えず「消せる品目と消せない品目がある」という不可解な UI に
  なる。sync による復活はダイアログの文言で伝える方が誠実。
- ユーザーが「すべての品目」を明示的に選択した。

## Consequences（良い影響・悪い影響・残るリスク）

**良い影響**

- 誤追加をユーザー自身が解消できる。
- スキーマ変更・マイグレーション・リポジトリ変更がゼロ。Infrastructure は既存の
  `notInArray` 削除がそのまま効く。
- `ItemStatus` の意味論を汚さない（`skipped` を無理に流用しない）。

**悪い影響・残るリスク**

- **削除は取り消せない。** 購入済み品目を削除すると `actualPrice` / `actualStore` の
  購入実績も失われる。→ 確認ダイアログで緩和する。
- **献立由来の品目を削除しても sync で復活する。** ユーザーには「削除が効いていない」と
  見えうる。→ 確認ダイアログで `source === 'from_meal_plan'` のときだけ明示する。
- `skipped` は引き続き到達不能な状態のまま残る（死コードに近い）。削除はしない —
  ADR-0007 が将来の自動追随の回避策として言及しているため。

## Migration（移行が必要な場合の手順）

**対象外。** DB スキーマ・既存 API の契約いずれも変更しない。

## Rollback（決定を戻す場合の手順）

エンドポイント `DELETE /api/shopping-lists/:id/items/:itemId`、`RemoveItemUseCase`、
`ShoppingList.removeItem`、UI の削除ボタンと確認ダイアログを取り除く。既存データに
削除の痕跡は残らない（物理削除のため復元は不可能だが、スキーマ側の後始末は不要）。

## References（設計書・要件・関連 ADR・外部資料へのリンク）

- `docs/requirements/shopping-item-remove.md`
- `docs/designs/shopping-item-remove.md`
- `docs/decisions/ADR-0007-shopping-list-differential-merge.md`（差分マージ・削除追随は将来課題）
- `docs/decisions/ADR-0009-shopping-list-item-check-uncheck.md`（completed リストは 422）
- `docs/04-domain-model.md` §ShoppingList 集約
