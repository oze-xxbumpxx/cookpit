# ADR-0018: 献立同期で pending 品目の削除追随と数量上書きを行う

- Status: Accepted
- Date: 2026-08-13
- 関連 feature: meal-plan-sync

## Context（背景・なぜ判断が必要か）

[ADR-0007](./ADR-0007-shopping-list-differential-merge.md) は、献立変更を買い物リストへ
反映する明示同期を「新規材料の追加のみ」に絞った。数量合算と削除追随は将来課題とした。
理由は、買い物途中のチェック／購入実績を失わないこと（ADR-0006 が完全再生成を却下したのと
同じ軸）だった。

その後 [ADR-0009](./ADR-0009-shopping-list-item-check-uncheck.md) で画面のチェックが
`bought` になり、[ADR-0011](./ADR-0011-shopping-item-hard-delete.md) で手動の物理削除が
入った。削除と「触ってよい品目」の意味論が固まったので、将来課題を閉じられる。

Sprint 10 の完了条件「献立からレシピを外すと買い物リストが追随する」は、追加のみの同期では
満たせない。ADR-0007 の決定そのもの（明示トリガ・既存キーは追加しない）は維持したまま、
決定 4（数量合算しない）と Consequences のリスク 1（削除追随しない）だけを塗り替える必要がある。

## Decision（採用した決定）

**既存の `POST /api/shopping-lists/:id/sync` の振る舞いを拡張し、献立集計との差分で
`from_meal_plan` かつ `pending` の品目だけ削除・数量上書きする。**

1. **削除**: 集計に無いマッチキーの `from_meal_plan` × `pending` を `removeItem` する。
   `bought`（画面のチェック済みを含む）と `manually_added` は残す。
2. **数量**: 同じキーの `pending`（`requiredAmount !== null`）は新しい集計値で上書きする。
   `bought` は触らない。増分だけ Pantry を引き、減少では在庫を戻さない。
3. **トリガ**: 明示ボタンのまま。献立変更時の自動同期はしない（ADR-0007 決定 6 を維持）。
4. **契約**: 新規 API / Zod / DB 列は足さない。件数メッセージはクライアントが同期前後の
   `items` を ID 比較して作る。
5. **checked の写像**: `ItemStatus` に `checked` は無い。`check()` は `bought` にする
   （ADR-0009）。チェック済みは削除も数量更新もしない。

詳細は `docs/designs/meal-plan-sync.md` の P-1〜P-7。

**ADR-0007 との関係**: 本 ADR は ADR-0007 を superseded しない。明示トリガ・マッチキー・
「既存キーへの新規行追加はしない」は維持する。塗り替えるのは「数量は変えない」「削除しない」
の 2 点だけである。v1 設計 `docs/designs/meal-plan-shopping-sync.md` は追加のみの記録として残す。

## Alternatives（検討した非採用案と却下理由）

| 案                                              | 内容                                          | 却下理由                                                                      |
| ----------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| A: 完全再生成                                   | リストを破棄して作り直す                      | ADR-0006 / ADR-0007 で却下済み。チェック状態が消える                          |
| B: 献立変更時に自動同期                         | Add/RemoveRecipe が内部で sync する           | 集約間の暗黙結合。ユーザーが意図しないタイミングで品目が消える（Gate A 問 3） |
| C: bought も含めて削除・数量更新                | 追随を最大化する                              | 購入実績と店頭のチェック意思を消す。ADR-0007 が守ってきた原則と衝突           |
| D: 不足分を新規行として足す                     | bought のキーを占有していても増分を別行にする | 同一キーの重複品目。マッチキー制約と UI の店舗グループが壊れる                |
| E: 採用（pending のみ削除・上書き、明示トリガ） | 本決定                                        | 完了条件を満たしつつ bought / 手動追加を守る                                  |

## Consequences（良い影響・悪い影響・残るリスク）

- 良: レシピを外すと pending の材料がリストから消える。倍量変更も pending に反映される。
- 悪: `bought` がキーを占有していると、献立側の増分はリストに出ない（設計書 R-1。受容）。
- 悪: 手動削除した `from_meal_plan` pending は再同期で復活する（ADR-0011 と同じ。R-2）。
- リスク: ShoppingList 保存と Pantry 保存の部分失敗窓は残る（Unit B で閉じる。R-3）。
- リスク: 品目の `requiredAmount` は「買う量」（在庫引き後）であり、再同期の delta は
  生の集計値との差になる。Pantry が空でないと厳密な冪等にならない（R-4。受容）。

## Migration（移行が必要な場合の手順）

対象外（スキーマ変更なし。既存リストは次回の明示同期から新しい差分ロジックの対象になる）。

## Rollback（決定を戻す場合）

1. `SyncShoppingListFromMealPlanUseCase` を追加のみの実装に戻す。
2. `ShoppingItem.updateRequiredAmount` / `ShoppingList.updateItemRequiredAmount` を削除する。
3. クライアントの同期メッセージを件数差に戻す。
   既存の生成・チェック・手動削除は無関係なため、追加分の除去で足りる。

## References

- `docs/designs/meal-plan-sync.md` / `docs/requirements/meal-plan-sync.md`
- `docs/designs/meal-plan-shopping-sync.md`（v1）
- ADR-0007 / ADR-0009 / ADR-0011
- Gate A: `docs/05-roadmap.md` Sprint 10 進め方（2026-08-13 ユーザー確定）
