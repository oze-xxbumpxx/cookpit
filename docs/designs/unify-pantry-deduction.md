# 設計書: unify-pantry-deduction

- ステータス: confirmed
- レベル: L2
- 関連:
  - `docs/designs/pantry-shopping-integration.md`（`applyPantryDeduction` D-1〜D-5 の確定元。本設計はルールを変更しない）
  - `docs/designs/shopping-list-pantry-coverage.md`（`pantryDeductedAmount` / `coveredIngredients` スナップショットの契約。DTO・DB 形は本設計で変更しない）
  - `docs/designs/meal-plan-sync.md`（P-4 Pantry 巻き戻ししない・P-7 増分のみ在庫引き算・R-4 「厳密な冪等性は保証しない」受容リスク。本設計は **P-7 の実装（delta 計算式）と R-4 の受容範囲を塗り替える**。P-4 は維持する）
  - `.claude/rules/domain-layer.md` / `.claude/rules/coding-standards.md`

## 背景

`GenerateShoppingListUseCase` と `SyncShoppingListFromMealPlanUseCase` はどちらも
`applyPantryDeduction`（`packages/application/src/shopping-list/ingredient-aggregation.ts`）を
呼ぶが、Sync の「既存 pending 品目の数量更新」経路（`sync-shopping-list-diff.ts` の
`applyQuantityUpdate`）だけは **フル必要量ではなく delta（増分）** を渡している。

delta は `aggregatedRaw.value - item.requiredAmount.value` として計算される。しかし
`item.requiredAmount` は「買う量」（過去の Generate/Sync で在庫を引いた **後** の値）であり、
献立の生必要量ではない。このため delta の基準がズレ、次の 2 パターンで
Generate と Sync が食い違う。

1. **全量まかないの取り逃し**（典型1）: 玉ねぎ 4 個必要・pantry 5 個。
   - Generate（新規）: 全量まかない → items に出さず `coveredIngredients` に 4 個。
   - Sync（既存 pending 行: 買う量 2・`pantryDeductedAmount` なし）: delta=2 を計算し、
     delta が pantry でまかなえる（2 ≦ 5）ため「買う量は変えず」`action: 'none'` で終わる。
     行は pending のまま残り、`coveredIngredients` には乗らない。
2. **再同期での買い過ぎ（R-4）**（典型2）: 必要 5・pantry 2 → Generate で買う量 3・
   `pantryDeductedAmount` 2。献立を変えずに再同期すると、diff 判定が
   `aggregated.requiredAmount.value(5) !== item.requiredAmount.value(3)` を「変更あり」と
   誤検知する（生値と買う量を直接比較しているため、引き算が起きた品目は常に不一致になる）。
   delta = 5-3 = 2 を計算し、pantry が空（前回で使い切っている）なら
   delta 全量が買う量に上乗せされ、買う量が 5 に戻ってしまう。

いずれも根本原因は同じ: **delta の基準を「買う量」に取っている**こと。買う量は
「生必要量 − 既に引いた在庫（`pantryDeductedAmount`）」なので、正しい基準は
「生必要量」と「既に引いた在庫」から独立に導出すべきで、買う量を経由してはならない。

## 目的

パントリー控除（在庫を引いて買う量を決めるロジック本体、D-1〜D-5）を
`applyPantryDeduction` の **1 seam** に統一し、Generate と Sync が同じ献立 + 同じ pantry で
`coveredIngredients` と買う量が一致するようにする。ルール（D-1〜D-5）自体は変更しない。

## 要件

Orchestrator の推奨事項（8 項目）を要件として採用する。各項目の採否と根拠は
「設計判断」節に記載する。

1. 控除エンジンは `applyPantryDeduction` のみ。Sync 専用の引き算ロジックを複製しない。→ 採用
2. Generate / Sync とも「献立集計の必要量フル」を渡す。→ 採用（後述の「等価変形」で実現）
3. 既存分の再消費を防ぐ薄いラッパを許可する。→ 採用（ただし pantry へ在庫を戻す実装ではなく、
   スカラー演算のラッパを採用。理由は「設計判断 3」参照）
4. bought / manually_added は控除入力にも削除・数量上書きにも入れない。→ 採用（既存のまま。
   `updateCandidates` フィルタが `source==='from_meal_plan' && status==='pending'` のみを
   対象にする既存条件を維持）
5. `coveredIngredients` スナップショットは今回フル控除が返した全量まかないを正とする。→ 採用
6. 数量減少時、減少後の必要量が在庫（sunk 分含む）で足りるならリストから外し covered へ。
   → 採用。ただし **Pantry には触らない**（P-4 は維持。詳細は「設計判断 6」）
7. no-op 判定は「買う量 === 生必要量」では行わない。献立キーが同じでも未引き算の
   pending は `reconcileItemDeduction` の対象にする。買う量・引き算スナップショット・
   covered 化が現状と変わらず pantry も消費しないときだけ `action: 'none'`（真の no-op）。
   → 採用（Orchestrator 追記。I-12 のため「gross 不一致」だけを候補にしてはいけない）
8. CompleteShopping・meal-plan shopping→cooking 修復・単位換算・UI・契約変更は対象外。→ 採用

## 対象範囲

- `packages/application/src/shopping-list/ingredient-aggregation.ts`
  - コード変更なし（想定）。`applyPantryDeduction` の入出力契約はそのまま単一の控除エンジンとして扱う。
- `packages/application/src/shopping-list/sync-shopping-list-diff.ts`
  - `applyQuantityUpdate` を `reconcileItemDeduction` に置き換え（内部ロジックを再設計）。
  - `previousGrossRequiredAmount` ヘルパーを新規追加。
- `packages/application/src/shopping-list/sync-shopping-list-from-meal-plan.use-case.ts`
  - `updateCandidates` フィルタの「変更あり」判定式を修正。
  - `applyQuantityUpdate` → `reconcileItemDeduction` の呼び出しに変更。
- `packages/application/src/shopping-list/generate-shopping-list.use-case.ts`
  - コード変更なし（既にフル必要量で `applyPantryDeduction` を呼んでいる）。
- 対応するテスト（`packages/application/tests/shopping-list/` 配下。方針は「テスト方針」節）

## 対象外

- `CompleteShopping` の分割ファイル（`complete-shopping-*.ts`）・保存順（触らない）
- 献立 status 修復（`GenerateShoppingListUseCase` の draft→shopping 自己修復。既存のまま）
- Domain スキーマ・api-contract・apps/web（DTO/API 形は不変。挙動のみ内部で修正）
- g/kg・ml/l 換算（D-1 のまま。単位不一致は差し引かない）
- cheapest-store・recipe・price-record・week 関連の作業
- ADR（アーキテクチャ変更ではなく既存 Application ロジックの修正のため不要）

## 現状構成

```
GenerateShoppingListUseCase
  └─ applyPantryDeduction(aggregated, pantry)         # フル必要量・OK

SyncShoppingListFromMealPlanUseCase
  ├─ 新規キー: applyPantryDeduction(newIngredients, pantry)   # フル必要量・OK
  └─ 既存 pending の数量変更: applyQuantityUpdate(item, aggregatedByKey, pantry)
        delta = aggregatedRaw.value - item.requiredAmount.value   # ← 買う量を基準にした delta（バグ）
        applyPantryDeduction([deltaIngredient], pantry)
        updatedValue = item.requiredAmount.value + buyDelta       # ← 買う量 + delta 由来の買い増し分
```

`updateCandidates` の「変更あり」判定も買う量を基準にしている（旧実装）:

```12:112:packages/application/src/shopping-list/sync-shopping-list-from-meal-plan.use-case.ts
        return aggregatedIngredient.requiredAmount.value !== item.requiredAmount.value;
```

この 2 箇所（delta 計算・変更判定）がいずれも「買う量」を基準にしているため、
在庫を一度でも引いた品目は再同期のたびに正しく扱えない。加えて「生必要量が同じ」
未引き算の pending 行は変更候補から外れ、同じ献立・同じ pantry でも Generate と
covered / 買う量が一致しない（Orchestrator 追記・試験計画 I-12）。

## 変更後構成

### 設計の核: 「生必要量」と「既に引いた量」を独立に持つ

品目の状態を次の 2 値の組として捉え直す。

- `newGross`（今回の献立集計の生必要量。既存の `aggregated` そのもの）
- `prevDeducted = item.pantryDeductedAmount?.value ?? 0`（**既に**在庫から引いた量。sunk cost。
  P-4 により巻き戻さない）

このとき、今回さらに在庫から引く必要がある量（`additionalNeeded`）は

```
additionalNeeded = newGross.value - prevDeducted
```

で求まる。これは「フル必要量 `newGross` を、今 pantry にある量 **と** すでに sunk 済みの
`prevDeducted`（仮想的に "まだ引いていない" ものとして数える）の合計に対して
`applyPantryDeduction` を適用したときの、pantry に対して新たに要求する分」に等しい
（`prevDeducted` は既に確保済みなので、残りの必要分だけを実 pantry にぶつければよい）。
D-1〜D-5 の丸め（可算単位の `ceil`）は `newGross - prevDeducted - available` に対して
1 回だけ効けばよく、`additionalNeeded` はこの値そのものなので、
`applyPantryDeduction` に `additionalNeeded` を渡せば D-1〜D-5 の結果は
「pantry に `prevDeducted` を仮想的に戻してからフル量で控除した場合」と数値的に一致する
（stock をどの順で消費するかという D-3 の割り当てだけが変わりうるが、量には影響しない）。

この式は **増加・減少を区別しない**。減少で `additionalNeeded <= 0` になった場合は
「既に引いた分だけで新しい必要量を満たせる」ことを意味し、pantry を操作せずに
covered へ回せる（決定 6）。旧コードが「増加/減少」で分岐していた理由がそもそも
「買う量を基準にした delta」のズレを場当たり的に補正するためのものだったので、
この式にすると分岐が不要になる。

### 1 seam: `applyPantryDeduction` の呼び出しは 3 か所、すべて「フル量相当」

```
GenerateShoppingListUseCase
  └─ applyPantryDeduction(aggregated, pantry)                        # フル必要量（変更なし）

SyncShoppingListFromMealPlanUseCase
  ├─ 新規キー: applyPantryDeduction(newIngredients, pantry)           # フル必要量（変更なし）
  └─ 既存 pending の数量変更（reconcileItemDeduction 内）:
        additionalNeeded = newGross.value - prevDeducted             # 生必要量から sunk 分を引いた「残りの必要量」
        additionalNeeded <= 0 ?
          → pantry を呼ばずに covered へ（決定 6。P-4 準拠で pantry 不変）
          : applyPantryDeduction([{ requiredAmount: additionalNeeded, ... }], pantry)  # ← 唯一の呼び出し
```

`applyPantryDeduction` 自身にはコード変更を加えない。ルール（D-1〜D-5）は
既存のまま 1 か所に閉じている。

### `sync-shopping-list-diff.ts` の変更

`applyQuantityUpdate` を `reconcileItemDeduction` に置き換える（責務が「delta 計算」から
「sunk 分を差し引いた残り必要量の照合」に変わるため改名する）。戻り値の型
`QuantityUpdateResult`（`'none' | 'remove' | 'update'`）は変更しない。

```typescript
/** 品目の直前の生必要量（買う量 + 既に在庫から引いた量）。変更判定の基準に使う。 */
export function previousGrossRequiredAmount(item: ShoppingItemType): number {
  const buy = item.requiredAmount?.value ?? 0;
  const deducted = item.pantryDeductedAmount?.value ?? 0;
  return buy + deducted;
}

/**
 * 既存 pending 品目を今回の献立集計と照合し、必要なら在庫引き算・買う量更新・
 * 全量まかない化を行う。控除エンジンは `applyPantryDeduction` の 1 回呼び出しのみ
 * （既に在庫から引いた分 `pantryDeductedAmount` は再消費しない。P-4 により pantry には戻さない）。
 *
 * @throws Error item.productId が null なのに aggregatedIngredient.productId が非 null など、
 *   呼び出し側の前提（matchKey 一致）が崩れている場合（想定外・実運用では発生しない）
 */
export function reconcileItemDeduction(
  item: ShoppingItemType,
  aggregatedByKey: Map<string, ResolvedIngredient>,
  pantry: Pantry,
): QuantityUpdateResult {
  const currentAmount = item.requiredAmount;
  const aggregatedIngredient = aggregatedByKey.get(itemMatchKey(item));
  const newGross = aggregatedIngredient?.requiredAmount ?? null;
  if (currentAmount === null || aggregatedIngredient === undefined || newGross === null) {
    return { action: 'none', consumed: false, covered: null };
  }

  const unit = currentAmount.unit;
  const prevDeducted = item.pantryDeductedAmount?.value ?? 0;
  const additionalNeeded = newGross.value - prevDeducted;

  // 既に引いた分だけで新しい必要量を満たせる（増加吸収 or 決定6の減少）。
  // pantry は操作しない（P-4）。productId が null の食材は prevDeducted が常に 0 の不変条件があり
  // このブランチに来ないため、CoveredIngredient.productId の非 null 制約に反しない。
  if (additionalNeeded <= 0 && aggregatedIngredient.productId !== null) {
    return {
      action: 'remove',
      consumed: false,
      covered: {
        displayName: aggregatedIngredient.displayName,
        productId: aggregatedIngredient.productId,
        requiredAmount: newGross,
        coveredAmount: newGross,
      },
    };
  }
  if (additionalNeeded <= 0) {
    // 防御的フォールバック（productId null では理論上発生しない）。covered 化できないので 0 個買う更新にする。
    return { action: 'update', amount: Quantity.of(0, unit), consumed: false, covered: null };
  }

  const {
    ingredients: afterAdditional,
    coveredIngredients,
    consumed,
  } = applyPantryDeduction(
    [
      {
        productId: item.productId,
        displayName: item.displayName,
        requiredAmount: Quantity.of(additionalNeeded, unit),
        amountNote: null,
      },
    ],
    pantry,
  );

  const fullyCoveredByAdditional = afterAdditional.length === 0 && coveredIngredients.length > 0;
  if (fullyCoveredByAdditional) {
    return {
      action: 'remove',
      consumed,
      covered: {
        displayName: aggregatedIngredient.displayName,
        productId: aggregatedIngredient.productId!,
        requiredAmount: newGross,
        coveredAmount: newGross,
      },
    };
  }

  const newBuy = afterAdditional[0]?.requiredAmount?.value ?? additionalNeeded;
  const newlyDeducted = afterAdditional[0]?.pantryDeductedAmount?.value ?? 0;
  const nextDeductedValue = prevDeducted + newlyDeducted;
  const nextDeducted: Quantity | null =
    nextDeductedValue === 0 ? null : Quantity.of(nextDeductedValue, unit);
  const currentDeductedValue = item.pantryDeductedAmount?.value ?? 0;
  const deductedUnchanged =
    (nextDeducted === null && item.pantryDeductedAmount === null) ||
    (nextDeducted !== null && currentDeductedValue === nextDeducted.value);

  if (newBuy === currentAmount.value && deductedUnchanged) {
    return { action: 'none', consumed: false, covered: null };
  }

  return {
    action: 'update',
    amount: Quantity.of(newBuy, unit),
    consumed,
    covered: null,
    pantryDeductedAmount: nextDeducted,
  };
}
```

`splitDuplicateItems` / `collectNoteUpdates` / `rewriteCoveredIngredients` はロジック変更なし
（数量なし材料・重複解消・covered スナップショットのマージは今回のスコープ外）。

### `sync-shopping-list-from-meal-plan.use-case.ts` の変更

「変更あり」判定を `previousGrossRequiredAmount` 基準に変更し、呼び出しを
`reconcileItemDeduction` に切り替える。

```typescript
const updateCandidates = uniqueItems.filter((item) => {
  if (item.source !== 'from_meal_plan' || item.status !== 'pending') {
    return false;
  }
  if (item.requiredAmount === null) {
    return false;
  }
  const aggregatedIngredient = aggregatedByKey.get(itemMatchKey(item));
  if (aggregatedIngredient === undefined || aggregatedIngredient.requiredAmount === null) {
    return false;
  }
  // 生必要量が同じでも、未引き算の pending は Generate と同じフル控除を当てる（I-12）。
  // 真の no-op は reconcileItemDeduction が action:'none' を返したときに初めて確定する。
  return true;
});
```

```typescript
for (const item of updateCandidates) {
  const result = reconcileItemDeduction(item, aggregatedByKey, pantry);
  // 以降の分岐（action === 'remove' / 'update' / pantryDeductedAmount 反映）は既存のまま変更なし
  // action === 'none' かつ consumed === false では list を変えない
  ...
}

// Orchestrator 追記: 早期 return を候補 0 件だけに頼らない。
// 全 reconcile が none・新規/削除/注記/重複が空・newlyCovered 空・pantry 未消費なら
// covered rewrite も save もしない（既存「no-op で保存しない」テストを維持）。
if (
  !listChanged &&
  !pantryConsumed &&
  newlyCovered.length === 0 &&
  newIngredients.length === 0
) {
  return toShoppingListDto(shoppingList);
}
```

`newIngredients` の追加経路・`removalCandidates`・`duplicateItems`・
`rewriteCoveredIngredients` 呼び出し・保存順（`shoppingListRepository.save` →
`pantryRepository.save`）は変更しない。

### `generate-shopping-list.use-case.ts`

変更なし。既にフル必要量 (`aggregated`) を `applyPantryDeduction` に渡している
（`aggregated`, `pantry` の 2 引数、返り値を `ingredients` / `coveredIngredients` / `consumed`
で受けるパターンは Sync の新規キー経路と同一）。

## データフロー

```
MealPlan → resolveMealPlanIngredients → ResolvedIngredient[]（生必要量。調味料除外済み）
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │ Generate（新規のみ）      │ Sync 新規キー            │ Sync 既存 pending
                    ▼                         ▼                         ▼
        applyPantryDeduction(全量)  applyPantryDeduction(全量)   reconcileItemDeduction
                    │                         │                         │
                    │                         │              additionalNeeded = 生 - 既引き算
                    │                         │              additionalNeeded<=0 → pantry 不触・covered へ
                    │                         │              additionalNeeded>0  → applyPantryDeduction(残り必要量)
                    ▼                         ▼                         ▼
     ShoppingItem[] + coveredIngredients（applyPantryDeduction の戻り値をそのまま利用。3経路共通の形）
```

3 経路とも最終的に「`applyPantryDeduction` の戻り値（`ingredients` / `coveredIngredients` /
`consumed`）をそのまま `ShoppingItem` 生成・`pantryDeductedAmount` 更新・
`coveredIngredients` 反映に使う」という同じ形に収まる。

## API 設計

対象外（既存の `POST /shopping-lists/generate` / `POST /shopping-lists/:id/sync` の
リクエスト・レスポンス形は変更しない。挙動の一部が仕様どおりに正しくなるだけ）。

## DB 設計

対象外（スキーマ変更なし。`pantry_deducted_amount_*` / `covered_ingredients` は既存カラムを
そのまま使う）。

## フロントエンド設計

対象外（apps/web は変更しない。DTO 形が不変のため画面側の変更は不要）。

## バックエンド設計

上記「変更後構成」に記載の 3 ファイルの変更がバックエンド設計の全体。まとめ:

| ファイル                                        | 変更                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ingredient-aggregation.ts`                     | 変更なし。`applyPantryDeduction` を唯一の控除エンジンとして維持                                        |
| `sync-shopping-list-diff.ts`                    | `applyQuantityUpdate` → `reconcileItemDeduction`（内部再設計）。`previousGrossRequiredAmount` 新規追加 |
| `sync-shopping-list-from-meal-plan.use-case.ts` | `updateCandidates` の判定式変更・呼び出し関数名変更のみ。保存順・トランザクション境界は変更なし        |
| `generate-shopping-list.use-case.ts`            | 変更なし                                                                                               |

### アーキテクチャ適合性チェック

- 依存方向 `Presentation → Application → Domain ← Infrastructure` を変更しない。
  今回の変更はすべて Application 層内（`packages/application/src/shopping-list/`）。
- Domain 層（`Pantry` / `Quantity` / `ShoppingList` / `CoveredIngredient`）にコード変更なし。
  Drizzle・HTTP 型を Domain に持ち込まない、という制約に抵触しない。
- 集約間参照は既存のまま ID 参照のみ（`ShoppingList` は `MealPlanId` を持つのみ、`Pantry` は
  別集約として UseCase 層で受け渡す）。
- `SyncShoppingListFromMealPlanUseCase` / `GenerateShoppingListUseCase` は 1 ユースケース =
  1 クラス・`execute()` のまま。手動 DI のまま（コンストラクタ引数変更なし）。

## エラー処理

対象外（外部 I/O の新設なし。既存の `UnitOfWork.execute` 内での例外はそのまま UseCase 入口
（`ShoppingListNotFoundError` / `InvalidShoppingListStateError` / `MealPlanNotFoundError` /
`InvalidMealPlanStateError`）でハンドリングされ、本タスクはこれらを変更しない）。

`reconcileItemDeduction` 内で `Quantity.of` に負値を渡すと Domain 側が例外を投げる契約だが、
`additionalNeeded <= 0` を先に判定して早期リターンするため、`Quantity.of(additionalNeeded, unit)`
の呼び出し時点で `additionalNeeded > 0` が保証される。

## ログと監視

対象外（既存に構造化ログ・監視の仕組みは無く、本タスクでも追加しない）。

## セキュリティ

対象外（MVP1 認証なし。既存と同じ。ロジック修正のみで新規の入力面・権限面の変化はない）。

## 性能

対象外（新規の外部 I/O・DB クエリを追加しない。既存の in-memory 集計・Pantry 走査
（`pantry.stocks` を線形に filter/sort する既存コスト、材料数 × Stock 数程度）と同じ
オーダーのまま。`reconcileItemDeduction` はO(1) の追加スカラー演算のみで、
`applyPantryDeduction` の呼び出し回数は「新規キー分をまとめて 1 回」+
「更新候補ごとに最大 1 回」で、旧実装（更新候補ごとに 1 回）と同じ呼び出し回数）。

## テスト方針

### 前提: 既存テストへの影響の切り分け

`packages/application/tests/shopping-list/sync-shopping-list-from-meal-plan.use-case.test.ts`
の既存ケースを実際の数値で再計算した結果、次のように分類できる（テストコード自体は
本タスクでは変更しない。実装後に implementer/test-designer が反映する前提の分類）。

**A. 意味を保つ（数値が変わらない。旧実装 = 新実装が偶然一致する）**

これは「更新前の `pantryDeductedAmount` が `null`（sunk 分ゼロ）の品目に対する更新」
という条件が揃うケース。旧 delta 式（買う量基準）と新 additionalNeeded 式（sunk 分基準）は、
sunk 分がゼロのときに数式が代数的に一致する（`買う量 + buyDelta = 生値 - 消費量` に帰着し、
`additionalNeeded` 式も sunk=0 のとき `生値 - 消費量` に帰着するため）。対象:

- `pending の数量が増えたら上書きする`（在庫なし）
- `pending の数量が減ったら上書きし Pantry は操作しない`（在庫なし）
- `数量増加分だけ Pantry を消費し既存分は再消費しない`（既存 2・必要 4・在庫 1 → 買う量 3）
  — Orchestrator 調査メモがこれを divergence 例として挙げていたが、再計算では
  `additionalNeeded=4, available=1` → `buy=ceil(4-1)=3, deducted=1` となり、旧実装の
  `buy=2+ceil((4-2)-1)=3, deducted=1` と数値が一致する（sunk=0 のため）。**値は変えない**。
- `増加分を在庫でまかなえると買う量は変えず Pantry と引き算スナップショットを保存する`
  （既存 2・必要 4・在庫 2 → 買う量 2 のまま）— 同様に再計算すると
  `additionalNeeded=4, available=2` → `buy=ceil(4-2)=2, deducted=2`（部分引き算・非全量まかない）
  で旧実装と一致する。テストの括弧書き「在庫がフル必要量をまかなえるケースではない」が
  示す通り、この fixture は pantry(2) < 生値(4) なので全量まかない分岐を踏まず、
  分岐差が数値に現れない。**値は変えない**。
- `buy=0` の増分全量まかない品目を削除するテスト（`買う量が 0 のまま増分を在庫でまかなえると
品目を削除する`）も sunk=0 なので値は変えない。
- その他（新規追加・削除・重複解消・amountNote・bought/manually_added 不変・no-op 系）は
  更新候補ロジックに触れないため無条件に不変。

上記 2 件（既存 2・必要 4・在庫 1 → 買う量 3 / 既存 2・必要 4・在庫 2 → 買う量 2）は
Orchestrator の調査メモで「旧 divergence を固定している例」とされていたが、本設計での
再計算では **値は変わらない**（sunk=0 のため旧新の式が一致する）。反証としてこの導出を
明記する。値が変わるのは「sunk（`pantryDeductedAmount` が非 null）の状態から再同期する」
ケースであり、既存テストにはこの前提の fixture が無い（`seededItem()` の
`pantryDeductedAmount` 既定値が `null` のため）。テストコードの `it(...)` タイトル文言や
内部コメントで「delta」という言葉を使っている箇所は、実装が
`reconcileItemDeduction`（sunk 分ベース）に変わったことに合わせて表現を更新するのが
望ましいが、アサーション（期待値）自体の変更は不要。

**B. 旧 divergence を固定していたため更新が必要**

- `Pantry 非空の再同期は例外なく完了する（R-4。厳密な冪等は保証しない）`
  （現在の実装意図: 献立が変わらない再同期でも厳密な冪等は保証しない、という
  受容リスクを検証するテスト）。本設計は R-4 の原因（買う量基準の変更判定）を修正するため、
  **献立が変わらない再同期は真に no-op になる**。このテストは
  「2 回目の同期で `shoppingListRepository.saveCount` / `pantryRepository.saveCount` が
  1 回目から増えないこと」を追加で検証するように强化する（`resolves.toBeDefined()` だけの
  弱い検証から、真の冪等性を検証するテストへ格上げ）。合わせて `meal-plan-sync.md` の
  R-4「受容する」記述は本タスクの変更で解消されることになるため、`docs/designs/meal-plan-sync.md`
  の R-4 行に「`unify-pantry-deduction` で解消（sunk 分を基準にした変更判定に修正）」という
  参照を追記することを推奨する（ドキュメント更新のみ。当該設計書自体の判断は変更しない）。

### 新規に追加するテスト（典型1・典型2・決定6のケース）

いずれも `sync-shopping-list-from-meal-plan.use-case.test.ts` に追加する想定
（既存ケースと同じ `InMemory*Repository` フィクスチャを使う）。

1. **典型1: 既存 pending 品目が、増加後の生必要量を pantry が全量カバーする**
   - 既存: `seededItem()`（買う量 2、`pantryDeductedAmount: null`）
   - 献立: スケール後の生必要量が 4 になるよう変更（例: `scaleFactor: 2`）
   - pantry: 該当 product に 5 個の Stock
   - 期待: 同期後、当該品目は `items` から消え、`coveredIngredients` に
     `{ requiredAmount: {value:4}, coveredAmount: {value:4} }` が追加される。
     `pantryRepository.saveCount` は 1（4 個消費）。
   - 目的: 旧実装のバグ（買う量基準の delta=2 が pantry(5) でまかなえるため
     `action:'none'` で pending のまま残ってしまう）を退行させないためのレグレッションテスト。

2. **典型2: 献立不変の再同期は真の no-op（Generate 直後の部分引き算あり）**
   - Generate 相当のセットアップ: 生必要量 5・pantry 2 → 買う量 3・`pantryDeductedAmount: 2`
     の品目を持つ `ShoppingList` を seed（または実際に Generate → 結果を Sync に渡す
     2 段構成でも良い）。
   - 献立を変更せずに Sync を実行。
   - 期待: `shoppingListRepository.saveCount === 0`、`pantryRepository.saveCount === 0`、
     `items[0].requiredAmount === {value:3}`、`pantryDeductedAmount === {value:2}` のまま。
   - 目的: 旧実装のバグ（生値 5 と買う量 3 を比較して「変更あり」と誤検知し、
     pantry が空なら買う量が 5 に戻ってしまう）の直接的なレグレッションテスト。

3. **決定6: 数量減少で sunk 分だけで covered になるケース**
   - 既存: 買う量 3・`pantryDeductedAmount: 2`（sunk 分 2。生必要量は買う量+sunk=5 相当）
   - 献立変更で生必要量が 2 に減少（5→2。sunk 分 2 で足りる）
   - pantry: 該当 product の Stock は 0（追加消費なし・巻き戻しもしない検証のため）
   - 期待: 品目は `items` から消え、`coveredIngredients` に
     `{ requiredAmount: {value:2}, coveredAmount: {value:2} }` が追加される。
     `pantryRepository.saveCount === 0`（P-4: pantry は操作しない）。

4. **決定6の否定側: 減少しても sunk 分だけでは足りない**
   - 既存: 買う量 3・`pantryDeductedAmount: 2`
   - 献立変更で生必要量が 4 に減少（5→4。sunk 分 2 では足りず、残り 2 が必要）
   - pantry: 該当 product の Stock なし
   - 期待: `items[0].requiredAmount === {value:2}`（4-2）、`pantryDeductedAmount` は
     `2`（変わらず）、`pantryRepository.saveCount === 0`（新たな消費なし）。
   - 目的: 「減少したら常に covered にする」という誤った単純化をしていないことの検証。

5. **Generate/Sync 一致の受け入れテスト（Done 条件の直接検証）**
   - 同一献立・同一 pantry から (a) `GenerateShoppingListUseCase` を実行した結果と
     (b) 空の `ShoppingList`（items なし・`coveredIngredients: []`）に対して
     `SyncShoppingListFromMealPlanUseCase` を実行した結果を比較し、`items`（displayName・
     requiredAmount・pantryDeductedAmount）と `coveredIngredients` が一致することを検証する。
   - 対象ケース: 全量まかない（典型1 相当）・部分引き算・在庫なし の 3 パターン。

### 単体テストの追加提案（`sync-shopping-list-diff.ts` 専用）

現状 `sync-shopping-list-diff.ts` に対する専用テストファイルが存在しない
（`sync-shopping-list-from-meal-plan.use-case.test.ts` からの結合テストのみ）。
`reconcileItemDeduction` は分岐が増えるため、`packages/application/tests/shopping-list/`
に `sync-shopping-list-diff.test.ts` を新規追加し、`Pantry` と `ShoppingItem` を直接
組み立てて次を関数単体で検証することを推奨する。

- `previousGrossRequiredAmount`: 買う量のみ／買う量+sunk分の両方を正しく合算する
- `reconcileItemDeduction`:
  - 増加・pantry 不足なし → `'remove'` + covered
  - 増加・pantry 部分 → `'update'` + `pantryDeductedAmount` 加算
  - 増加・pantry なし → `'update'`、`pantryDeductedAmount` は sunk 分のまま
  - 減少・sunk 分で足りる → `'remove'` + covered、`consumed: false`
  - 減少・sunk 分で足りない → `'update'`、`consumed` は additionalNeeded に対する
    `applyPantryDeduction` の結果次第
  - `item.productId === null`（P-2 対象外）→ 常に受け取った量そのままの `'update'`、
    pantry 不変

この単体テストは既存テストの置き換えではなく追加（結合テストは分岐の統合的な確認として
残す）。

### 品質ゲート

`pnpm lint` / `pnpm type-check` / `pnpm test`（`packages/application` のみで良いが、
`packages/domain` に変更はないため domain のテストは回帰確認のみで十分）。

## 移行とリリース

DB マイグレーション・API 契約変更なし。Application 層内のロジック修正のみで、
デプロイは通常のリリースフローに乗せられる。既存データ（`pantry_deducted_amount_*` /
`covered_ingredients` の既存値）に対する backfill は不要（次回の Generate/Sync 実行時から
新しい判定式が適用される）。

挙動が変わるのは次の 2 ケースのみ（バグ修正であり、機能追加・契約変更ではない）:

1. 既存 pending 品目が、再集計後の生必要量を pantry で全量まかなえる場合、
   これまで pending のまま残っていたのが `coveredIngredients` に移動し `items` から消える。
2. 献立が変わらない再同期が、これまで買う量を生値まで戻してしまうことがあったのが、
   真の no-op（何も保存しない）になる。

いずれもユーザーから見て「買い過ぎない／在庫で足りると正しく表示される」方向の改善であり、
後方互換上の懸念（データ破壊・API 形の変化）はない。

## リスク

| リスク                                                                                          | 緩和                                                                                                                                            |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `reconcileItemDeduction` の分岐（増加/減少/covered/productId null）の実装漏れ                   | 単体テスト（`sync-shopping-list-diff.test.ts` 新設）で分岐ごとに直接検証する                                                                    |
| 既存テストの「値が変わらない」判定が実装時に誤って値変更を要求してしまう                        | 実装後、既存テストが green のまま通ることを確認してから典型1/典型2/決定6 の新規テストを追加する順で進める（既存テストを先に壊さないことを確認） |
| `docs/designs/meal-plan-sync.md` の R-4/P-7 記述が本設計と食い違って見える                      | 本設計書の「関連」節と「テスト方針 B」に明記済み。実装完了後、`meal-plan-sync.md` の                                                            |
| R-4 行に注記を追加することを推奨（本設計のスコープでは提案のみ、追記自体は任意）                |
| decision 6（減少時に covered へ回す）が `meal-plan-sync.md` の P-7 の字面と矛盾するように見える | P-7 の「Pantry を操作しない」は本設計でも守っている（decision 6 は pantry 非操作のまま                                                          |
| ShoppingList 側の表示先を covered に切り替えるだけ）。矛盾ではなく P-7 の「表示」部分の         |
| 上書きであることを本設計の「決定6」節で明記済み                                                 |

## 未決事項

なし。Orchestrator の推奨 8 項目はすべて採用または明示的な根拠付きで確定した
（decision 3 は「pantry へ在庫を戻す」代替案を検討したうえでスカラー演算方式を推奨、
decision 6 は P-7 との関係を上記「リスク」節で整理済み）。実装時に発生し得る細部
（`sync-shopping-list-diff.test.ts` を新設するかどうか）は test-designer の裁量に委ねる。

## 設計判断（詳細）

### 決定3: 「pantry へ在庫を戻すラッパ」ではなく「スカラー演算（additionalNeeded）」を推奨

Orchestrator の要求メモは「対象キーの既存 `pantryDeductedAmount` を in-memory で pantry に
戻してからフル量で `applyPantryDeduction`」という実装例を提示していた。この案（案A）と
本設計が採用する案（案B: スカラー演算で `additionalNeeded` を算出し、その量だけを
`applyPantryDeduction` に渡す）を比較する。

|                | 案A: pantry へ在庫を戻す                                                                                                                                                                                                                 | 案B（採用）: additionalNeeded 演算                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 実装           | `pantry.addStock()` で sunk 分相当の合成 Stock を追加 → フル量で `applyPantryDeduction` → 消費結果から実消費分だけを本物の Pantry に反映するため、消費後の Stock 配列を診断（diff）して合成 Stock 分を除去する必要がある                 | `additionalNeeded = newGross - prevDeducted` を計算し、その量だけ `applyPantryDeduction` に渡す。Pantry には一切合成データを入れない |
| 正しさ         | 合成 Stock の `expiresAt`/`purchasedAt` を人為的に決める必要があり、D-3（消費順）の結果が実 Stock の消費順を歪める可能性がある。さらに合成 Stock が消費されずに残ると、保存時に実在しない Stock が Pantry に永続化される事故リスクがある | D-3 の消費順は実 Stock 同士の比較のみで決まり、歪みが無い。合成データを一切作らないため誤って永続化される事故が構造的に発生しない    |
| 計算量・複雑さ | 消費前後の Stock 配列を diff する処理が追加で必要                                                                                                                                                                                        | スカラー1個の加減算のみ                                                                                                              |
| 数学的な結果   | 案Bと同じ買う量・消費量になる（合成 Stock 分が最終的にキャンセルされる想定）                                                                                                                                                             | 同じ                                                                                                                                 |

**推奨: 案B**。同じ結果を得られるうえで、Pantry 集約に一時的な合成データを持たせない
（Domain の実体を汚さない）ため安全性・可読性が高い。

### 決定6: 減少時に D-4 相当（covered へ移す）を優先し、`meal-plan-sync.md` P-7 の「表示」を上書きする

`meal-plan-sync.md` の P-7 は「数量減少では Pantry を操作しない」と確定している。本設計は
この確定（Pantry を操作しない）を**維持**する。P-7 の趣旨は「巻き戻し（在庫を戻す操作）を
しない」ことであり、これは P-4 と同じ制約を指している。

一方で、P-7 の実装（`meal-plan-sync.md` 時点のコード例）は「減少時はそのまま買う量を
生値に上書きするだけ」だった。これは旧実装の delta 計算式が買う量を基準にしていたことに
付随する実装の副作用であり、`sunk` 分の扱いについて明示的な設計判断ではなかった
（`meal-plan-sync.md` にも「減少時の sunk 分の扱い」を論じた記述はない）。

本設計は「生必要量が sunk 分（既に引いた量）以下まで減った場合、その品目は在庫だけで
足りている」という事実を無視せず、Generate の D-4（在庫が必要量以上 → 買わない・
`ShoppingItem` にしない）と同じ扱いに揃える。これにより Generate/Sync 一致という
本タスクの主目的を満たしつつ、P-4/P-7 の「Pantry を操作しない」という制約は破っていない
（`consumed: false` を明示し、`pantryRepository.save` を呼ばない）。
