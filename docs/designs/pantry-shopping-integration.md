# 設計書: pantry-shopping-integration（在庫引き算連携）

- ステータス: 確定（P-1〜P-3 ユーザー確定・2026-07-20 / D-1〜D-8 設計者裁量・先例準拠で確定）
- レベル: L2
- スプリント: Sprint 5 Unit C（在庫引き算連携。実装ルート: Orchestrator 経路（メイン直接指揮 + implementer））
- 関連:
  - `docs/designs/shopping-list-core.md`（`GenerateShoppingListUseCase` の確定設計・S-2 で在庫引き算を Sprint 5 へ送った出典）
  - `docs/designs/pantry-core.md` / `docs/designs/pantry-core-contract.md`（Pantry / Stock 集約の確定形）
  - `docs/04-domain-model.md` §「設計上の論点 3. ShoppingList 生成時の在庫引き算」（切り上げルールの論点本体）
  - `docs/05-roadmap.md` Sprint 5 Unit C / 完了条件 3「次の献立作成時に在庫が考慮される」
  - `.claude/rules/domain-layer.md`（集約をまたぐ操作は Application 層 UseCase に置く）

---

## 背景

Sprint 4（`shopping-list-core`）で `GenerateShoppingListUseCase` を実装した際、Pantry 集約が
未実装だったため在庫引き算は行わず、必要量を全量そのまま買い物リストへ載せていた（S-2）。
Sprint 5 Unit A / B で Pantry 集約（Domain / Repository / UseCase / 画面）が揃ったため、本ユニットで
「献立から買い物リストを生成する際、家にある在庫分を差し引く」連携を追加する。これにより
Sprint 5 完了条件 3「次の献立作成時に在庫が考慮される」を満たす。

## 目的

- `GenerateShoppingListUseCase` に `PantryRepository` を注入し、集約した必要量から在庫分を
  差し引いた「買う量」で `ShoppingItem` を生成する。
- 在庫でまかなえる分は Pantry から消費（実際に減算）する。

## スコープ

対象:

- `packages/domain/src/shared/unit.ts`：切り上げ対象判定 `isCountableUnit` の追加（新規 export）
- `packages/application/src/shopping-list/generate-shopping-list.use-case.ts`：在庫引き算・消費ロジック
- `apps/web/src/server/routes/shopping-lists.ts`：`GenerateShoppingListUseCase` への `pantryRepository()` 注入
- 上記の単体テスト

対象外:

- 新規 API・Zod 契約・DB スキーマの変更（本ユニットは既存の生成 API の内部挙動変更のみ）
- 画面（Unit B で実装済み。生成結果の表示はそのまま）
- 単位換算（g ⇔ ml 等の換算表導入は行わない。D-1 参照）
- Pantry 側の編集 API（保存場所設定等）

---

## 設計判断サマリ

`shopping-list-screens` に倣い **P-x（ユーザー確定が必要）** と **D-x（設計者裁量・先例準拠）** に分ける。

### P-x（ユーザー確定済み・2026-07-20）

| #   | 論点                     | 確定                                                                                                                                              |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1 | 切り上げルール（論点 3） | **数えられる単位のみ切り上げ**。`個/本/枚/玉/尾/切れ/束/袋/缶` は「必要量 − 在庫」を `ceil`。連続量 `g/kg/ml/l/大さじ/小さじ/cup/合` は小数のまま |
| P-2 | 在庫マッチングのキー     | **productId 一致のみ**。productId 未設定（productRef が null）の食材は引き算対象外＝従来どおり全量購入                                            |
| P-3 | 生成時に在庫を消費するか | **消費する**。差し引いた分を Pantry から実際に減算し保存する（読み取り専用ではない）                                                              |

### D-x（設計者裁量・先例準拠で確定）

| #   | 論点                                   | 確定                                                                                                                                                                                   |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | 単位不一致（必要量と在庫の単位が違う） | **差し引かない（全量購入）**。`Quantity` に単位換算は無く（`add`/`subtract` は単位不一致で throw）、換算表導入は本スコープ外。productId が一致しても単位が異なる在庫は在庫量に数えない |
| D-2 | 必要量が数値でない食材（`少々` 等）    | `requiredAmount === null` の食材は差し引き対象外。従来どおりそのまま `ShoppingItem` 化（`amountNote` 保持）                                                                            |
| D-3 | 同一 product に複数 Stock がある場合   | 単位一致の Stock 量を合算して在庫量とする。消費は **賞味期限昇順（`expiresAt` の近い順・null は最後）→ 購入日昇順（古い順）** で順に減算                                               |
| D-4 | 在庫が必要量以上ある場合               | 買う量 = 0 → **`ShoppingItem` を生成しない**（その食材は買い物リストに出さない）。消費量 = 必要量                                                                                      |
| D-5 | 在庫が必要量に満たない場合             | 買う量 = 必要量 − 在庫（P-1 の丸めを適用）。消費量 = 利用可能な在庫**全量**                                                                                                            |
| D-6 | 数えられる単位の定義                   | `個/本/枚/玉/尾/切れ/束/袋/缶`。`合`（米の計量単位）・`cup`・`大さじ`・`小さじ`・`g/kg/ml/l` は連続量として **切り上げしない**                                                         |
| D-7 | 集約横断の永続化順序と部分失敗         | 差し引き計算は純粋（in-memory）に行い、永続化は **ShoppingList → Pantry → MealPlan** の順。UoW（トランザクション）は現状無いため部分失敗のリスクを許容（下記§整合性）                  |
| D-8 | 冪等性（S-6）との関係                  | 既存リストが見つかる冪等パス（`created: false`）では在庫消費を**行わない**。在庫消費は初回生成（`created: true`）でのみ発生する                                                        |

---

## 差し引きアルゴリズム（確定）

`aggregateIngredients()` で集約した各 `ResolvedIngredient`（`productId` / `displayName` /
`requiredAmount: Quantity | null` / `amountNote`）に対し、`ShoppingItem` 化の前に以下を適用する。

1. `requiredAmount === null`（D-2）または `productId === null`（P-2）→ 差し引かず、そのまま出力。消費なし。
2. 一致する Stock を抽出: `stock.productId` が食材の `productId` と一致 **かつ** `stock.amount.unit === requiredAmount.unit`（D-1）。
3. 利用可能量 `A` = 抽出した Stock の `amount.value` の合計。`A === 0` → 差し引かず、そのまま出力。消費なし。
4. `buyRaw = requiredAmount.value − A`
   - `buyRaw <= 0`（D-4）→ `ShoppingItem` を生成しない。消費量 = `requiredAmount.value`。
   - `buyRaw > 0`（D-5）→ 数えられる単位なら `buy = ceil(buyRaw)`、連続量なら `buy = buyRaw`。
     `requiredAmount = Quantity.of(buy, unit)` として `ShoppingItem` を生成。消費量 = `A`。
5. 消費量 `C = min(requiredAmount.value, A)` を、D-3 の順で対象 Stock から順に `pantry.consumeStock()` で減算する
   （各 Stock を全量→残りへと消費し、`C` を消化しきったら終了）。`Stock.consume()` は残量以上を渡すと 0 にクランプするため、
   端数割り当ての取り扱いは Domain 側の既存挙動に委ねる。

数えられる単位の判定は `isCountableUnit(unit: Unit): boolean`（`packages/domain/src/shared/unit.ts`・新規 export）に切り出す。
「単位が離散的か」は Domain の知識であり、UseCase 固有ロジックではないため Domain 層に置く。

## 集約横断の整合性（D-7 詳細）

本 UseCase は 1 回の生成で **ShoppingList（新規）/ Pantry（消費）/ MealPlan（状態遷移）** の 3 集約を書き込む。
MVP1 は手動 DI で UoW を持たないため、以下の方針で部分失敗の影響を最小化する。

- 差し引きと消費対象の決定は純粋計算で先に済ませ、`ShoppingItem[]` と「消費済み Pantry」を in-memory に用意する。
- 永続化順序: `shoppingListRepository.save()` →（Pantry を消費して）`pantryRepository.save()` → `mealPlan.transitionTo('shopping')` + `save()`。
- 部分失敗時の性質:
  - ShoppingList 保存後・Pantry 保存前に失敗 → 再実行は既存リストを返す冪等パス（`created: false`）に入り、**在庫は再消費されない**。
    結果として「リストは在庫を差し引いた買う量・Pantry は未消費」という不整合が残るが、データ破壊ではなく過大在庫方向（安全側）。2 名運用・手動再実行前提で許容する。
  - これは既存設計が MealPlan 遷移について持っていた「部分失敗を冪等パスで自己修復」の方針（S-6）と同系統の割り切り。
- 本割り切りは MVP1 限定。将来トランザクション（Drizzle transaction / UoW）を導入する際に見直す（改善バックログ候補）。

## テスト観点（単体）

Domain（`unit.test.ts`）:

- `isCountableUnit`: 数えられる単位 9 種が true、連続量 8 種（`合` 含む）が false。

Application（`shopping-list-use-cases.test.ts` に追記・`InMemoryPantryRepository` を追加）:

- 在庫なし（Pantry 空）→ 従来どおり全量が買い物リストに出る（回帰）。
- 在庫が必要量以上（数えられる単位）→ その食材は出ない。Pantry は必要量分だけ減る。
- 在庫が一部（数えられる単位）→ `ceil(必要量 − 在庫)` で出る。Pantry は 0（全量消費）。
- 在庫が一部（連続量 g）→ 小数のまま出る。切り上げなし。
- 単位不一致（productId 一致・unit 違い）→ 差し引かれず全量購入。Pantry 不変（D-1）。
- productId が null の食材 → 差し引かれず全量購入（P-2）。
- 複数 Stock（同一 product・単位一致）→ 賞味期限の近い順に消費（D-3）。
- 冪等: 既存リストありで再実行 → `created: false`・Pantry 不変（D-8）。
- `requiredAmount === null`（`少々`）→ そのまま出る・Pantry 不変（D-2）。

## 完了条件

- `pnpm lint` / `pnpm type-check` / `pnpm test`（domain + application）が PASS。
- Sprint 5 完了条件 3「次の献立作成時に在庫が考慮される」を UseCase レベルで満たす。
