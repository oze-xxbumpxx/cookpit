# 設計書: meal-plan-sync

- ステータス: confirmed（Gate A ユーザー確定・2026-08-13）
- レベル: L3
- 関連:
  - `docs/requirements/meal-plan-sync.md`（本設計の要件定義書）
  - `docs/designs/meal-plan-shopping-sync.md`（v1 設計。ADR-0007 の詳細設計。**本書は上書きしない**。
    v1 が「追加のみ」で確定した経緯・却下案の記録として残す）
  - [ADR-0007](../decisions/ADR-0007-shopping-list-differential-merge.md)（差分マージ・明示トリガの
    決定。決定2「既存品目は変更・削除しない」・決定4「数量の増分は行わない」と
    Consequences リスク1「削除追随は将来課題」を本書が塗り替える。決定6「明示トリガ」は維持する）
  - [ADR-0009](../decisions/ADR-0009-shopping-list-item-check-uncheck.md)（`check()`/`uncheck()`。
    `ItemStatus` に `checked` が無く、チェックは `bought` へ写像されることの根拠）
  - [ADR-0011](../decisions/ADR-0011-shopping-item-hard-delete.md)（`removeItem` 物理削除。本書の
    削除ロジックはこのメソッドをそのまま呼ぶだけで Domain/Infrastructure 変更を要さない）

## 背景

`docs/requirements/meal-plan-sync.md` §背景と同一。要約: ADR-0007（2026-07-24）は
`SyncShoppingListFromMealPlanUseCase` を「新規材料の追加のみ」に絞って新設し、削除追随と数量合算を
将来課題として残した。その後 ADR-0011（手動削除）・ADR-0009（軽量チェック）により
`ItemStatus`/`removeItem` の意味論が固まったことで、この 2 つの将来課題を閉じられる状態になった。
2026-08-13、Gate A でユーザーが削除対象・数量更新方針・トリガを確定した
（`docs/05-roadmap.md` §Unit A の Gate A）。

## 目的

- 献立からレシピを外した、または材料の必要量が変わったときに、既存の明示同期
  （`POST /api/shopping-lists/:id/sync`）が買い物リストへ正しく追随するようにする。
- チェック済み（`bought`）・手動追加（`manually_added`）品目とその購入実績は一切変更・削除しない。
- 契約（HTTP API・Zod スキーマ・DB スキーマ）を変更せず、既存エンドポイントの振る舞いだけを拡張する。

## 要件

`docs/requirements/meal-plan-sync.md` の FR-1〜FR-10、正常系 N-1〜N-9、異常系 E-1〜E-7、
境界条件 B-1〜B-6 を参照。

## 対象範囲

- Domain（`packages/domain/src/shopping-list/shopping-list.ts`）: `ShoppingItem.updateRequiredAmount`
  の新設、`ShoppingList.updateItemRequiredAmount` の新設（薄いラッパー）。
- Application（`packages/application/src/shopping-list/sync-shopping-list-from-meal-plan.use-case.ts`）:
  削除・数量更新の判定と適用を追加。既存の追加ロジック（新規キーの `ShoppingItem.create`）は無変更。
- Application（`packages/application/src/shopping-list/ingredient-aggregation.ts`）: 変更なし
  （既存の `resolveMealPlanIngredients` / `ingredientMatchKey` / `itemMatchKey` /
  `applyPantryDeduction` をそのまま再利用する）。
- Presentation（`apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`）:
  `handleSync` の通知メッセージ組み立てを、同期前後の `items` を ID で比較する方式に直す。
- Presentation（`apps/web/src/app/shopping-lists/_utils/shopping-list-view.ts`）: 同期結果の差分
  （追加・削除・数量更新の件数）を計算する純関数を追加。
- api-contract / Infrastructure / DB スキーマ: 変更なし。

## 対象外

- Unit B（DB トランザクション / UoW・`drizzle-orm/neon-serverless` へのドライバ変更）。本設計に
  混ぜない。ShoppingList 保存と Pantry 保存の間の部分失敗窓は本ユニットで閉じない。
- `ConsumeStock` の二重送信抑止（Sprint 10 タスク6・別ユニット）。
- `meal-plan.mapper.ts` の JST 日付ずれ修正（Sprint 10 タスク2・別 PR）。
- Sprint 8 Unit B（expiry-alert）の実機確認（Sprint 10 タスク5・別ユニット）。
- 献立変更時の自動同期（Gate A で明示ボタン維持と確定。トリガは変更しない）。
- Pantry 巻き戻し（Gate A で確認不要事項として明記済み。削除・数量減少のいずれでも在庫を戻さない）。
- `bought` 品目の数量変更・自動削除。
- 手動追加（`manually_added`）品目の自動削除。
- `skipped` 状態の API/UI 露出。
- 新規 HTTP エンドポイント・新規 Zod スキーマ・DB マイグレーション。

## 確定事項（Gate A・2026-08-13 ユーザー確定）

| #   | 論点               | 確定                                                                                                                                                                                         | 根拠                                                                                                                                                                                           |
| --- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1 | 削除対象の範囲     | `source === 'from_meal_plan'` かつ `status === 'pending'` の品目のみ、献立集計に無いキーなら削除する。`bought`・`manually_added` は残す                                                      | roadmap 完了条件は「レシピを外すと追随する」。購入済み（チェック済みを含む）を消すと実績・購入意思が消える（ADR-0011 の削除確認ダイアログの理由と同じ）                                        |
| P-2 | 数量更新の範囲     | 同じキーの `pending` 品目は新しい集計値で**上書き**する。`bought` は触らない                                                                                                                 | ADR-0007 が数量合算を却下した理由は bought 品目との矛盾。`pending` のみへの上書きならその矛盾は起きない                                                                                        |
| P-3 | 同期のトリガ       | 明示ボタン維持（既存「献立の変更を反映」）。献立変更時の自動同期はしない                                                                                                                     | ADR-0007 決定6。集約間の暗黙結合と、ユーザーが意図しないタイミングでの削除・数量変更を避ける                                                                                                   |
| P-4 | Pantry 巻き戻し    | しない（削除・数量減少のいずれでも在庫を復元しない）                                                                                                                                         | 生成時消費の逆操作は一意に戻せない。roadmap 完了条件の文言にも無い（確認不要事項として明記済み）                                                                                               |
| P-5 | `checked` の写像   | `ItemStatus` に `checked` という状態は存在しない。画面のチェックは `ShoppingItem.check()` が `bought` にする。したがって「チェック済み」はすべて `bought` として扱い、削除も数量更新もしない | ADR-0009。Gate A の「チェック済みは pending と同じ扱い」という問いは、実装ではこの写像により「bought は削除・数量変更の対象外」に帰着する                                                      |
| P-6 | 契約変更           | 新規 API・新規 Zod・新規 DB 列を追加しない。レスポンスは既存 `ShoppingListDto` のまま。同期前後の件数比較はクライアントが行う                                                                | contract-designer を起動しない前提（Orchestrator 指示）。既存の `dto.items.length - items.length` は削除が入ると破綻するため、ID 比較に置き換える（バックエンド設計・フロントエンド設計 参照） |
| P-7 | 増分のみ在庫引き算 | 数量増加（delta > 0）分だけ Pantry を引く。フル量を再度引かない（二重消費防止）。数量減少では Pantry を操作しない                                                                            | 既存品目は生成/前回同期の時点で既にフル量の在庫引き算を経ている。増加分のみを対象にすることで、既に引いた在庫をもう一度引く二重消費を避ける                                                    |

## 現状構成

### Domain（`packages/domain/src/shopping-list/shopping-list.ts`）

`ShoppingItem` は `requiredAmount: Quantity | null` と `amountNote: string | null` を
「ちょうど一方が非 null」の排他で持つ（`create()` で検証。生成後にこの排他を崩す操作は無い）。
数量を変更する既存メソッドは存在しない（`markAsBought` は購入実績、`reassignStore` は店舗、
`check`/`uncheck` はステータスのみを変える）。

`ShoppingList` の更新系メソッド（`addItem` / `markAsBought` / `reassignStore` / `markAsSkipped` /
`check` / `uncheck` / `removeItem` / `complete`）はすべて `assertActive` を通し、`completed` では
`Error` を投げる（`unassignStore` は例外的に `assertActive` を通さない。本設計は踏襲するだけで
変更しない）。`removeItem` は ADR-0011 により status/source を問わず削除できる。

### Application（`sync-shopping-list-from-meal-plan.use-case.ts`）

現状は「新規キーだけ追加」の実装（`packages/application/src/shopping-list/sync-shopping-list-from-meal-plan.use-case.ts:64-101`）。

```ts
const aggregated = await resolveMealPlanIngredients(mealPlan, this.recipeRepository);
const existingKeys = new Set(shoppingList.items.map(itemMatchKey));
const newIngredients = aggregated.filter(
  (ingredient) => !existingKeys.has(ingredientMatchKey(ingredient)),
);
if (newIngredients.length === 0) {
  return toShoppingListDto(shoppingList); // no-op
}
// applyPantryDeduction → ShoppingItem.create → addItem のループ
```

削除・数量更新の判定は一切無い。`ingredient-aggregation.ts` の `resolveMealPlanIngredients` /
`applyPantryDeduction` / `ingredientMatchKey` / `itemMatchKey` は本設計でもそのまま再利用する
（変更しない。「増分専用の呼び出し方」を後述の §バックエンド設計 で明記する）。

### Presentation（`shopping-list-client.tsx` の `handleSync`）

```ts
async function handleSync(): Promise<void> {
  setSyncMessage(null);
  await syncAction.run(
    () => client.api['shopping-lists'][':id'].sync.$post({ param: { id: shoppingList.id } }),
    {
      onSuccess: (dto) => {
        const addedCount = dto.items.length - items.length; // 削除が入ると壊れる
        setItems(dto.items);
        setSyncMessage(
          addedCount > 0 ? `${addedCount}件の材料を追加しました` : '追加する材料はありませんでした',
        );
      },
    },
  );
}
```

`dto.items.length - items.length` は追加のみを前提にした差分計算で、削除が同時に起きると
（例: 追加2件・削除3件で総数が1件減る）誤った、あるいは負の「追加件数」を表示してしまう。

## 変更後構成

### Domain

```ts
/**
 * 献立同期による数量の上書き専用。pending の from_meal_plan 品目にのみ使うことを想定する
 * （呼び出し元の Application 層が対象を絞る。Domain 側では pending 以外を拒否するのみで
 * source は見ない — source によるガードは Application の責務に置く）。
 * amountNote 品目（requiredAmount が null）は note ↔ 数量の変換をサポートしないため拒否する。
 * amountNote には触れない（数量側の排他はそのまま維持される）。
 *
 * @throws Error status が pending 以外の場合
 * @throws Error 現在の requiredAmount が null（amountNote 品目）の場合
 */
updateRequiredAmount(amount: Quantity): void {
  if (this.itemStatus !== 'pending') {
    throw new Error(`Cannot update required amount of a ShoppingItem with status '${this.itemStatus}'`);
  }
  if (this.itemRequiredAmount === null) {
    throw new Error('Cannot update required amount of a ShoppingItem with amountNote');
  }
  this.itemRequiredAmount = amount;
}
```

`ShoppingList` に既存の `markAsBought` / `reassignStore` と同型の薄いラッパーを追加する。

```ts
/** @throws Error active でない、または itemId の品目が存在しない場合（Domain 側の追加制約は ShoppingItem.updateRequiredAmount を参照） */
updateItemRequiredAmount(itemId: ShoppingItemId, amount: Quantity): void {
  this.assertActive('updateItemRequiredAmount');
  this.findItem(itemId).updateRequiredAmount(amount);
}
```

**設計判断**: `updateRequiredAmount` 自身は `source` を検査しない（既存の `markAsBought` 等と
同じ「Domain は状態不変条件のみを守り、どの品目を対象にするかは呼び出し元が決める」という
既存の責務分担を踏襲）。単位の一致チェックも Domain には持たせない（呼び出し元がマッチキー
（`itemMatchKey`/`ingredientMatchKey`）で単位が同一であることを既に保証しているため、Domain
側で再検証すると責務が重複する）。削除は既存の `removeItem(itemId)` をそのまま使う（新規メソッド
は追加しない）。

### Application（`SyncShoppingListFromMealPlanUseCase`）

既存の 404/422（`ShoppingListNotFoundError` / `InvalidShoppingListStateError` /
`MealPlanNotFoundError` / `InvalidMealPlanStateError`）チェックは無変更。集計取得後の処理を
「追加のみ」から「追加・数量更新・削除」の 3 系統に拡張する。

```ts
const aggregated = await resolveMealPlanIngredients(mealPlan, this.recipeRepository);
const aggregatedByKey = new Map(aggregated.map((ing) => [ingredientMatchKey(ing), ing]));
const existingItems = shoppingList.items; // 集約からの防御的コピー（取得時点のスナップショット）
const existingKeys = new Set(existingItems.map(itemMatchKey));

// (a) 追加候補: 集計にあってリストに無いキー（既存ロジック・無変更）
const newIngredients = aggregated.filter((ing) => !existingKeys.has(ingredientMatchKey(ing)));

// (b) 更新候補: from_meal_plan かつ pending かつ requiredAmount !== null で、
//     キーが集計に存在し、値が変わっている品目
const updateCandidates = existingItems.filter((item) => {
  if (item.source !== 'from_meal_plan' || item.status !== 'pending') return false;
  if (item.requiredAmount === null) return false; // amountNote 品目は対象外
  const aggIngredient = aggregatedByKey.get(itemMatchKey(item));
  if (aggIngredient?.requiredAmount == null) return false; // キー消失 or note 側 → (c) へ
  return aggIngredient.requiredAmount.value !== item.requiredAmount.value; // 単位はキー一致で保証済み
});

// (c) 削除候補: from_meal_plan かつ pending で、キーが集計に無い品目（amountNote も対象）
const removalCandidates = existingItems.filter(
  (item) =>
    item.source === 'from_meal_plan' &&
    item.status === 'pending' &&
    !aggregatedByKey.has(itemMatchKey(item)),
);
```

**(b) 数量更新の適用**（増加と減少で扱いを分ける。P-7）:

```ts
let listChanged = false;
let pantryConsumed = false;

for (const item of updateCandidates) {
  const newAmount = aggregatedByKey.get(itemMatchKey(item))!.requiredAmount!; // (b) の絞り込みで非null
  const delta = newAmount.value - item.requiredAmount!.value;

  if (delta < 0) {
    // 減少: そのまま上書き。Pantry は操作しない（P-4/P-7）。
    shoppingList.updateItemRequiredAmount(item.id, newAmount);
    listChanged = true;
    continue;
  }

  // 増加: delta 分だけを合成の ResolvedIngredient として applyPantryDeduction に渡す
  // （既存ユーティリティを再利用。フル量を再度引かない＝二重消費防止）。
  const deltaIngredient: ResolvedIngredient = {
    productId: item.productId,
    displayName: item.displayName,
    requiredAmount: Quantity.of(delta, item.requiredAmount!.unit),
    amountNote: null,
  };
  const { ingredients: afterDelta, consumed } = applyPantryDeduction([deltaIngredient], pantry);
  if (consumed) pantryConsumed = true;

  // afterDelta が空 = delta の全量を在庫でまかなえた（買うべき増分は 0）。
  const buyDelta = afterDelta[0]?.requiredAmount?.value ?? 0;
  const updatedValue = item.requiredAmount!.value + buyDelta;

  if (updatedValue <= 0) {
    // 防御的分岐（B-4）。通常のドメイン不変条件下（既存 requiredAmount > 0・buyDelta >= 0）
    // では到達しないが、Quantity.of(0, ...) を作らないためにガードとして残す。
    shoppingList.removeItem(item.id);
    listChanged = true;
  } else if (updatedValue !== item.requiredAmount!.value) {
    shoppingList.updateItemRequiredAmount(item.id, Quantity.of(updatedValue, item.requiredAmount!.unit));
    listChanged = true;
  }
  // updatedValue === item.requiredAmount!.value（delta 全量が在庫でまかなえた）のときは
  // リストの見た目は変わらないが、pantryConsumed は true のままなので Pantry の保存は行われる。
}

// (c) 削除の適用
for (const item of removalCandidates) {
  shoppingList.removeItem(item.id);
  listChanged = true;
}

// (a) 追加の適用（既存ロジック・無変更）
if (newIngredients.length > 0) {
  const { ingredients: afterDeduction, consumed } = applyPantryDeduction(newIngredients, pantry);
  if (consumed) pantryConsumed = true;
  for (const ingredient of afterDeduction) {
    shoppingList.addItem(ShoppingItem.create({ ...ingredient, source: 'from_meal_plan', targetStore: /* 既存の店舗解決 */ }));
    listChanged = true;
  }
}

if (listChanged) {
  await this.shoppingListRepository.save(shoppingList);
}
if (pantryConsumed) {
  await this.pantryRepository.save(pantry);
}
return toShoppingListDto(shoppingList);
```

**(a)(b)(c) の実行順序についての注記**: 追加・更新・削除は集計結果に対する互いに素な分類
（キーごとに「新規」「更新」「削除」「対象外」のいずれか 1 つにしか属さない）なので、
Pantry への影響（消費）を除けば実行順序に依存関係は無い。上記コードは削除 → 追加の順で示したが、
実装時にどちらを先に処理してもよい（`shoppingList.items` の配列内での物理的な並び順が変わる
だけで、レスポンスの意味には影響しない）。**唯一の順序制約**は、(b) の増加分の Pantry 引き算と
(a) の新規追加の Pantry 引き算は、同一 `pantry` インスタンス上で順に適用すること（同じ
`Pantry.find()` 呼び出しで取得した集約を 1 回だけ更新し、最後に 1 回だけ `save()` する）。

**Pantry 引き算のヘルパー再利用に関する補足**: `applyPantryDeduction` は `ResolvedIngredient[]` を
受け取る既存の汎用関数で、単一要素の配列を渡す使い方は既存の呼び出し方（新規追加分の配列）と
シグネチャ上は同じであり、新しいユーティリティを追加する必要は無い。`productId === null`
（Product マスタ未登録の材料）の場合、`applyPantryDeduction` は在庫と一致させられないため
その要素を素通りさせる（既存の実装のまま）。したがって増加分の delta もそのまま
`buyDelta = delta` として上書きされ、Pantry は操作されない（在庫引き算不可な品目は元々対象外）。

**削除候補の抽出タイミング（E-5 への対応）**: `existingItems` は UseCase 冒頭で 1 回だけ取得した
`shoppingList.items` のスナップショット（`ShoppingList.items` getter は防御的コピーを返す）。
(a)(b)(c) いずれの判定もこのスナップショットに対して行い、`shoppingList` 集約への変更適用
（`removeItem`/`updateItemRequiredAmount`/`addItem`）は判定が終わったあとにまとめて実行する。
これにより「削除しながら同時にその配列を走査する」ような不整合を避ける。2 人が同時に同じ品目を
操作する競合（例: 削除候補と判定した直後に別リクエストが先に `removeItem` していた）は
既存の `findItem` の `Error('ShoppingItem not found')` がそのまま投げられ、UseCase レベルの
リトライ・排他制御は行わない（既存の Last-Write-Wins 方針を継続。ADR-0009 のリスク記述と同種）。

**no-op 判定（FR-6）**: `listChanged` が false なら `ShoppingListRepository.save()` を呼ばない。
`pantryConsumed` が false なら `PantryRepository.save()` を呼ばない。既存コード（追加のみの版）が
既に「追加 0 件でも Pantry 消費があれば Pantry を保存する」という非対称な保存判定を持っていた
（`sync-shopping-list-from-meal-plan.use-case.ts:94-99`）ため、本設計はこのパターンを削除・更新にも
そのまま拡張しているだけで、新しい設計思想を持ち込んでいない。

### Presentation

#### バックエンド（ルート・契約）

`apps/web/src/server/routes/shopping-lists.ts` の `.post('/:id/sync', ...)` は無変更
（UseCase のコンストラクタ引数・呼び出し方も変わらない）。api-contract の変更も無い。

#### フロントエンド（`shopping-list-client.tsx` の `handleSync`）

同期前の `items`（クライアントの現在の state）と、レスポンス `dto.items` を品目 ID で比較し、
追加・削除・数量変更の件数を算出する。サーバーはこれらの件数を返さない（P-6）。

```ts
// apps/web/src/app/shopping-lists/_utils/shopping-list-view.ts に追加
export interface SyncDiff {
  addedCount: number;
  removedCount: number;
  updatedCount: number;
}

export function diffSyncResult(before: ShoppingItemDto[], after: ShoppingItemDto[]): SyncDiff {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterIds = new Set(after.map((item) => item.id));

  let addedCount = 0;
  let updatedCount = 0;
  for (const item of after) {
    const prior = beforeById.get(item.id);
    if (prior === undefined) {
      addedCount += 1;
      continue;
    }
    if (!isSameRequiredAmount(prior.requiredAmount, item.requiredAmount)) {
      updatedCount += 1;
    }
  }
  const removedCount = before.filter((item) => !afterIds.has(item.id)).length;

  return { addedCount, removedCount, updatedCount };
}

export function describeSyncResult({ addedCount, removedCount, updatedCount }: SyncDiff): string {
  if (addedCount === 0 && removedCount === 0 && updatedCount === 0) {
    return '変更はありませんでした';
  }
  const parts: string[] = [];
  if (addedCount > 0) parts.push(`追加${addedCount}件`);
  if (updatedCount > 0) parts.push(`更新${updatedCount}件`);
  if (removedCount > 0) parts.push(`削除${removedCount}件`);
  return parts.join('・');
}
```

`isSameRequiredAmount` は `{ value, unit } | null` の 2 値を比較する小さなヘルパー（同ファイルに
private 関数として追加、または既存の値比較パターンに合わせる）。

```ts
async function handleSync(): Promise<void> {
  setSyncMessage(null);
  await syncAction.run(
    () => client.api['shopping-lists'][':id'].sync.$post({ param: { id: shoppingList.id } }),
    {
      onSuccess: (dto) => {
        const diff = diffSyncResult(items, dto.items);
        setItems(dto.items);
        setSyncMessage(describeSyncResult(diff));
      },
    },
  );
}
```

ボタン文言（「献立の変更を反映」）は変更しない。献立画面側に自動同期を追加しない（P-3）。

## データフロー

### フロー: 献立変更 → 明示同期 → 買い物リスト追随

1. ユーザーが `/meal-plans/[id]` でレシピを外す、または `scaleFactor` を変える（既存の
   `MealPlan.removeRecipe` / 倍量変更 API。本ユニットでは変更しない）。
2. ユーザーが `/shopping-lists/[id]` を開き「献立の変更を反映」ボタンを押す。
3. `POST /api/shopping-lists/:id/sync` → `SyncShoppingListFromMealPlanUseCase.execute`。
4. UseCase が ShoppingList・MealPlan を取得し状態を検証（既存の 404/422 判定）。
5. `resolveMealPlanIngredients` で現在の献立材料を再集計。
6. 既存品目を「追加候補」「更新候補（増加/減少）」「削除候補」「対象外（bought/manually_added/
   amountNote で値不変）」の 4 群に分類する（Application 層のメモリ上の集合演算。DB クエリの
   追加発行は無い）。
7. 更新候補の増加分についてのみ Pantry の在庫を消費（`applyPantryDeduction` の delta 版呼び出し）。
   追加候補にはフル量の在庫引き算を適用（既存ロジック）。
8. `ShoppingList` 集約に削除・更新・追加を適用し、変更があれば 1 回 `save()`。Pantry 消費が
   あれば Pantry も 1 回 `save()`（MealPlan の状態遷移は行わない。既存動作）。
9. `ShoppingListDto` をクライアントへ返却。クライアントは同期前の `items` と比較して通知文を
   組み立て、一覧を更新後の `items` で置き換える。

## API 設計

**変更なし（振る舞いだけが変わる）。**

`POST /api/shopping-lists/:id/sync` のパス・メソッド・リクエスト（ボディ無し・`param.id` のみ）・
レスポンス（`ShoppingListDto`、200 / 404 / 422）はすべて既存のまま。追加件数等を返すレスポンス
フィールドの拡張は行わない（P-6。Orchestrator 指示により contract-designer は起動しない）。

| メソッド | パス                           | リクエスト              | レスポンス        | ステータス      | 変更                         |
| -------- | ------------------------------ | ----------------------- | ----------------- | --------------- | ---------------------------- |
| POST     | `/api/shopping-lists/:id/sync` | なし（`param.id` のみ） | `ShoppingListDto` | 200 / 404 / 422 | **無し（振る舞いのみ変更）** |

## DB 設計

**変更なし。** `packages/infrastructure/src/db/schema.ts` の `shopping_items` テーブル・列は
無変更。マイグレーションは発生しない。

`DrizzleShoppingListRepository.save()` の既存実装（`notInArray` による差分削除・
`onConflictDoUpdate` による upsert）は、本設計の `removeItem`（集約から要素が消える）と
`updateItemRequiredAmount`（`requiredAmount` フィールドが変わる）の両方にそのまま追随する。
確認事項:

- 削除: 既存の `save()` は「現在の集約に存在する ID 以外を DB から削除する」（`notInArray`）
  実装のため、`removeItem` で集約から取り除かれた品目は次の `save()` で自動的に DB からも消える。
  ADR-0011 の実装追記（`docs/04-domain-model.md` §ShoppingList 集約）で既に確認済みの経路であり、
  本ユニットのための Infrastructure 変更は不要。
- 数量更新: 既存の `save()` の `onConflictDoUpdate` が `requiredAmountValue`（および
  `requiredAmountUnit`）を含む upsert を行っている前提（新規追加時に同じ upsert 経路を使って
  `requiredAmount` を書き込めているため、既存の値変更でも同じ列が更新される）。実装時に
  `packages/infrastructure/src/repositories/drizzle-shopping-list.repository.ts` の
  `onConflictDoUpdate.set` 句が `requiredAmountValue` を含んでいることを確認する
  （stock-edit で発覚した「set 句に列が無く見かけ上成功する」実装上の罠と同種のリスクがある
  ため、Infrastructure の回帰テスト（既存 PGlite テスト基盤）で「数量更新 → save → find で
  更新後の値が保持される」ことを確認する。§テスト方針 参照）。

## フロントエンド設計

「Presentation」節の「フロントエンド（`shopping-list-client.tsx`）」を参照。追加点:

- `diffSyncResult` / `describeSyncResult` は `apps/web/src/app/shopping-lists/_utils/shopping-list-view.ts`
  に純関数として追加する（既存の `groupItemsByStore` / `describeRemoveConfirmation` と同じ
  ファイル・同じ「Client からロジックを追い出す」方針）。
- 同期後の一覧描画（`groupItemsByStore(optimisticItems, stores)` 以降）は無変更。削除された品目は
  `setItems(dto.items)` により自然に一覧から消える（`dto.items` に含まれないため）。
- 削除確認ダイアログ（`describeRemoveConfirmation`）・オフライン同期キュー（`useCheckedSyncQueue`）
  はいずれも本ユニットで変更しない。同期実行中に他の品目操作（チェック・削除）が競合するケースの
  UI 制御（例: 二重送信防止）は既存の `syncAction.pending` によるボタン無効化のままで足りる
  （新しい排他制御は追加しない）。

## バックエンド設計

「変更後構成」節の Domain / Application を参照。追加点:

- UseCase のコンストラクタ引数（`shoppingListRepository, mealPlanRepository, recipeRepository,
productRepository, pantryRepository`）は無変更。
- `resolveTargetStores`（新規追加品目の店舗解決）は既存ロジックのまま、追加候補（(a)）にのみ適用
  する。更新候補・削除候補には店舗解決は関係しない（`targetStore` は既存品目の値を保持したまま）。

## エラー処理

本変更は DB I/O（Repository の `save()`/`find()`）を伴うため、Skill 手順6の 5 項目を記載する。

- **(a) リトライ**: サーバー側の DB 書き込みに対する自動リトライは行わない（既存動作を継続）。
  クライアント側も自動リトライは行わない。ユーザーが「献立の変更を反映」ボタンを再度押すことで
  再試行する（明示的な再送。無限リトライは行わない）。
- **(b) タイムアウト**: 既存の HTTP タイムアウト設定（Vercel Function のデフォルト。本ユニットで
  変更しない）に従う。個別のタイムアウト値の新設は無い。
- **(c) 冪等性**: 同一の献立に対して連続して同期を実行すると、2 回目以降は追加・更新・削除の
  いずれも発生せず no-op になる（FR-7）。ただし品目の買う量と集計生値は一致しない。
  生成時に在庫を引いた品目を献立変更なしで再同期すると、買う量が生値まで戻ることがある
  （§リスク R-4。P-6 のため受容）。専用の冪等性キーは導入しない
  （既存の `POST` はキー無しで内容ベースに冪等〈おおむね〉という既存方針を継続）。
- **(d) 部分失敗**: `ShoppingListRepository.save()` が成功し `PantryRepository.save()` が失敗する
  ケース（またはその逆）は、既存の `SyncShoppingListFromMealPlanUseCase` と同様に**許容する**
  （単一トランザクションではない）。買い物リスト側が先に確定し、Pantry の在庫消費が反映されない
  ままになる可能性がある。この部分失敗窓を閉じるのは Sprint 10 Unit B（DB トランザクション /
  UoW 導入）であり、本ユニットでは対応しない（§対象外）。
- **(e) フォールバック**: 外部サービスへの依存は無い（DB のみ）。DB 書き込みが失敗した場合は
  HTTP エラー応答をそのままクライアントへ伝え、UI はエラーメッセージを表示する
  （既存の `syncAction.errorMessage` 表示をそのまま使う）。縮退動作（キャッシュ済みの古いリストを
  見せる等）は行わない。

## ログと監視

Cookpit MVP1 には専用のログ基盤・APM は導入されていない。本変更も既存方針（サーバーエラーは
`app.onError` 経由で HTTP ステータスとして返し、クライアントはエラーメッセージを画面表示する）を
踏襲し、新規のログ・監視の追加は行わない（対象外）。

## セキュリティ

- 認証・認可は対象外（ADR-0003 / ADR-0004。単一世帯前提が継続）。
- 入力値: `POST /:id/sync` はリクエストボディを持たないため、新規の入力検証は発生しない。
- DB アクセスは既存の Drizzle パラメータ化クエリのみで、SQL インジェクションのリスクは無い
  （Repository 実装を変更しないため）。

## 性能

新規の外部 API / 外部ストレージ I/O は導入せず、大量データを扱う一覧・集計クエリの新設・変更も
無い（既存の `resolveMealPlanIngredients` の集計と、その結果に対するメモリ上の差分計算を追加する
だけ）。明示された性能要件も無い。したがって性能セクションは簡潔にとどめる。

- 追加の DB クエリは無い（削除・更新候補の判定はメモリ上の集合演算。`ShoppingList.items` の
  スナップショットと `resolveMealPlanIngredients` の結果はいずれも既存の同期処理で既に取得して
  いたデータ）。
- 増分専用の Pantry 引き算（`applyPantryDeduction` を単一要素配列で呼ぶ）は既存の呼び出しと
  同じ計算量（`Pantry.stocks` に対する線形スキャン 1 回）であり、更新候補の件数分繰り返しても
  買い物リスト・献立とも数十品目規模（`docs/01-overview.md` の 2 人世帯利用）のため無視できる
  コスト（推定）。
- レスポンスタイム: 既存の `POST /api/shopping-lists/:id/sync`（追加のみ版）と同等の応答時間に
  なる見込み（確認推奨。既存エンドポイントの実測値がドキュメント化されていないため、本設計では
  数値を断定しない）。
- N+1 リスク・新規インデックスの要否: 該当なし（新規クエリを追加しないため）。
- 負荷試験シナリオ: 対象外（新規外部 I/O が無いため）。

## テスト方針

- Domain（`packages/domain/tests/shopping-list/shopping-list.test.ts`）:
  - `ShoppingItem.updateRequiredAmount()`: 正常系（`pending` 品目の値変更）、`pending` 以外での
    throw、amountNote 品目（`requiredAmount === null`）での throw。
  - `ShoppingList.updateItemRequiredAmount()`: 正常系、`completed` での throw、存在しない itemId
    での throw（既存の `findItem` の `Error` を継承）。
- Application（`packages/application/tests/shopping-list/sync-shopping-list-from-meal-plan.use-case.test.ts`）:
  - 削除: `from_meal_plan` + `pending` の品目が集計から消えると削除される／`bought` は残る／
    `manually_added` は残る／amountNote 品目も削除される。
  - 数量更新: 増加時に `requiredAmount` が更新される／減少時に更新され Pantry は操作されない／
    値が同じときは更新されない／`bought` 品目は更新されない／amountNote 品目は更新されない。
  - 増分の在庫引き算: Pantry に対応する在庫がある場合、増加分のみが消費され、既存分は再消費
    されない（二重消費防止の直接検証）。
  - no-op / 冪等: 追加・更新・削除が 0 件のとき `ShoppingListRepository.save` / `PantryRepository.save`
    のいずれも呼ばれないこと。Pantry が空の状態で同一献立を 2 回同期すると 2 回目が no-op になる
    こと（FR-7・N-9）。
  - 既存の追加ロジックの回帰: 新規材料の追加・在庫引き算・店舗解決が本変更後も既存どおり動作する
    こと。
  - 既存の 404/422 テスト（`ShoppingListNotFoundError` / `InvalidShoppingListStateError` /
    `MealPlanNotFoundError` / `InvalidMealPlanStateError`）が回帰なく通ること。
- Infrastructure（`packages/infrastructure/tests/repositories/drizzle-shopping-list.repository.test.ts`
  相当）: 数量更新後に `save()` → 新しい Repository インスタンスで `find()` →
  `requiredAmount`（値・単位）が更新後の値であることを確認する回帰テスト（DB 設計節の
  「実装上の罠」に該当するリスクの検出目的）。削除は既存の ADR-0011 実装時の回帰テストが
  カバーしているため新規追加は不要（既存テストの回帰確認のみ）。
- apps/web:
  - `shopping-list-client.tsx` のコンポーネントテスト: `diffSyncResult`/`describeSyncResult` の
    単体テスト（追加のみ・削除のみ・数量更新のみ・複合・0件）。`handleSync` 実行後に一覧から
    削除品目が消え、通知文が正しく表示されること。
  - 既存の同期ボタン・エラー表示のテストが回帰なく通ること。

## 移行とリリース

DB マイグレーションは不要。api-contract の変更も無いため、フロントエンド・バックエンドの
デプロイ順序に依存関係は無い（同一 PR / 単一デプロイでよい）。

1. Domain（`updateRequiredAmount`/`updateItemRequiredAmount`）を追加。
2. Application（`SyncShoppingListFromMealPlanUseCase`）の削除・更新ロジックを追加。既存の追加
   ロジックのテストが回帰なく通ることを確認する。
3. Presentation（`diffSyncResult`/`describeSyncResult`・`handleSync` 改修）を追加。
4. Infrastructure の回帰テスト（数量更新の `save`/`find` 往復）を追加し、既存の `onConflictDoUpdate`
   が `requiredAmountValue`（および単位列）を正しく含んでいることを確認する。含んでいなければ
   Infrastructure の `set` 句を拡張する（stock-edit で発覚した実装上の罠の再発確認。DB 設計節
   参照）。機能フラグは導入しない（MVP1 の他機能と同様、単一 PR/デプロイでよい規模）。

## リスク

| #   | リスク                                                                                                                                                                                                                                                                                       | 影響                                                                                              | 対策                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-1 | `bought` 品目が既存キーを占有している場合、集計上の必要量が増えても新規行として足さない（既知の限定）                                                                                                                                                                                        | 「チェック済みの品目の分だけ献立の必要量より少なく表示される」ケースが残る                        | Gate A で明示的に受容（P-1/P-2 の対象外）。ユーザーは必要に応じて手動で数量調整・手動追加する。ADR-0007 決定4と同種の既知の割り切り                                                                                                                    |
| R-2 | 献立由来（`from_meal_plan`）の `pending` 品目を手動削除（既存の `removeItem` API）した直後に同期を実行すると、その材料が集計に存在する限り再び追加される                                                                                                                                     | ユーザーには「削除したのに戻ってきた」と見えうる                                                  | ADR-0011 が既に明示している既存の仕様どおり（`describeRemoveConfirmation` が `from_meal_plan` の削除確認時にこの旨を伝えている）。本ユニットで挙動を変更しない                                                                                         |
| R-3 | ShoppingList の保存が成功し Pantry の保存が失敗する部分失敗窓                                                                                                                                                                                                                                | Pantry の在庫消費が買い物リストの数量変更と食い違う（在庫が減っていないのに数量が減って見える等） | **解消済み（ADR-0019）**。Sprint 10 Unit B で書き込み UseCase を 1 トランザクションに閉じた                                                                                                                                                            |
| R-4 | 品目の `requiredAmount` は「買う量」（生成時・前回同期の在庫引き算後）であり、同期の delta は集計の生値との差になる。生成時に在庫を引いた品目は、献立を変えずに再同期すると生値まで戻ることがある。在庫は生成時に消費済みで空になっていることが多いため、「Pantry が空なら起きない」ではない | 買う量が黙って増える（買いすぎ）。その後の同期は no-op になる                                     | 受容する（P-6 で生値列を足さないため本ユニットでは解消できない）。試験は Pantry 空かつ品目が生値のケースで冪等を確認する（A-19）。生成時に在庫引き算が効いた品目の再同期は A-20 で「例外なく完了」のみ確認する。将来、生値を品目に保持すれば解消できる |
| R-5 | Infrastructure の `onConflictDoUpdate.set` 句が `requiredAmountValue`（または単位列）を含んでいない場合、数量更新が見かけ上成功しリロードで消える（stock-edit で発覚した罠と同種）                                                                                                           | ユーザー体験を著しく損なう。単体テスト・コンポーネントテストでは検出できない                      | PGlite を使った Infrastructure 回帰テストを完了条件に含める（§テスト方針）。含まれていなければ `set` 句を拡張する                                                                                                                                      |

## 未決事項

なし（Gate A は 2026-08-13 にユーザー確定済み。`docs/05-roadmap.md` §Unit A の Gate A、および
本書 §確定事項 P-1〜P-7 を参照）。
