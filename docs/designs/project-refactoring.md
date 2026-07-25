# 設計書: project-refactoring

- ステータス: confirmed
- レベル: L2
- 関連: docs/implementation-plans/project-refactoring.md / docs/tests/project-refactoring.md /
  docs/decisions/ADR-0010-package-public-boundary.md / docs/03-architecture.md /
  `.claude/rules/coding-standards.md`

## 背景

MVP1 の機能追加を Sprint 1〜5 で積み上げた結果、機能そのものは動作しているが、以下の構造的な
ばらつきが蓄積した。いずれも「機能追加のたびに増える」性質を持つため、放置すると新規実装の
参照コストと追従漏れリスクが上がり続ける。

棚卸しで確認した事実（2026-07-25 時点）：

| 観点 | 事実                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------- |
| A    | `packages/domain/src/index.ts` が実質空で、`@cookpit/domain/src/...` の deep import が 285 箇所         |
| B    | Server Component の DI 組み立てが「ファクトリ経由」と「`new Drizzle...(getDb())` 直書き」の 2 流儀      |
| C    | `server/app.ts` の `onError` が 11 連の `if (err instanceof ...)`。`export default app` は規約違反      |
| D    | `shopping-list-client.tsx` 446 行 / `useState` 16 個。同一構造の mutation ハンドラが 7 個               |
| E    | ShoppingList 系 3 UseCase に「ロード → 状態検査 → 品目検査 → 保存 → 再取得」が丸ごと重複                |
| F    | `toDate` / `toDateString` が 3 リポジトリに重複定義。`toLocalDateString` が 2 mapper に重複             |
| G    | 1000 行超のテストファイルが 2 件（`shopping-list-use-cases.test.ts` / `shopping-list-client.test.tsx`） |

## 目的

**外部から観測可能な挙動を一切変えずに**、上記の構造的ばらつきを解消する。
判定基準はベースラインのテスト件数と結果の維持（下記「テスト方針」）。

## 要件

1. API のパス・ステータスコード・レスポンス形状を変えない。
2. DB スキーマ・マイグレーションを変更しない。
3. 画面の表示・文言・操作結果を変えない。
4. ドメインモデルの意味（不変条件・状態遷移）を変えない。
5. 各観点は独立してコミットでき、単独で切り戻せる。

## 対象範囲

観点 A / B / C / D / E / F / G（ユーザー確定）。実施順は依存の浅い順に
**A → C → F → E → B → D → G**。

## 対象外

- 観点 H（`docs/` の棚卸し・archive 化）— ユーザー判断で今回は対象外。
- `source_shopping_item_id` 列の物理削除（破壊的スキーマ変更。2026-07-24 から継続の残置事項）。
- TanStack Query の本格導入（観点 D の代替案。ユーザー確定で自前ヘルパを採用）。
- `RecipeIngredient` が持つ商品参照を構造的 `interface` から `ProductId` 値オブジェクトへ
  変更すること（ドメインモデルの意味変更にあたるため。「リスク」節に申し送り）。
- パフォーマンス改善・機能追加・文言変更。

## 現状構成

- `packages/domain` は `main: ./src/index.ts` を宣言しているが、`index.ts` の中身は
  コメント 1 行のみ。実質的に公開境界が存在せず、全消費者が実装ファイルを直接指している。
- `apps/web/src/server/repositories.ts` に Repository ファクトリが 6 個あるが、
  利用は `app/page.tsx` と `app/pantry/page.tsx` のみ。他 5 ページは直接 `new` している。
- Application 層に `shared/errors.ts`（`NotFoundError` / `InvalidStateError` の抽象基底）が
  既に存在するが、`server/app.ts` は具象クラスを 11 個個別に判定している。

## 変更後構成

### A. パッケージ公開境界（詳細は ADR-0010）

```
packages/domain/src/index.ts        ← 全集約・共有 VO・Repository IF を re-export
consumers                           ← import { X } from '@cookpit/domain'
```

- パッケージ内部（domain 内の相互参照）は従来どおり相対パス。
- 名前衝突が 1 件だけ存在する: `recipe/recipe-ingredient.ts` の
  `export interface ProductId`（構造的な `{ value: string }`）が
  `product/product-id.ts` の `class ProductId` と衝突する。
  → **前者を `ProductRef` へ改名**する。構造的型のため呼び出し側（`{ value: 'prod-1' }` を
  渡している箇所）は無変更で通る。値オブジェクト化そのものは対象外（上記）。

### C. エラー変換

```ts
// 変更後（概念）
app.onError((err, c) => {
  if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
  if (err instanceof InvalidStateError) return c.json({ error: err.message }, 422);
  console.error(err);
  return c.json({ error: 'Internal Server Error' }, 500);
});
```

- 現行の 11 具象クラスはすべて 2 基底のいずれかを継承しているため、**変換結果は同一**。
  <br>※ この前提は実装時に 1 件外れた（`InvalidStockOperationError` のみ素の `Error` 継承）。
  対応は「実施結果 › 設計との差分」を参照。実際の変換結果は同一に保っている。
- `export default app` → `export const app`。`app/api/[[...route]]/route.ts` を named import に追随。
  `AppType`（Hono RPC の型）は現状どおり `routes` から導出し、フロントの型は不変。

### F. 日付変換

- Infrastructure: `repositories/mappers.ts` に `toLocalDate` / `toLocalDateString` を集約
  （nullable 版は呼び出し側で `=== null` 判定する形に揃え、関数自体は非 null 前提にする）。
- Application: `shared/date.ts` を新設し `toLocalDateString` を集約。
- **Domain の `week-identifier.ts` は共有しない**（`packages/domain` は他に依存しない原則を優先。
  Application が Domain のヘルパを使うことは可能だが、日付整形は Domain の関心ではないため
  Domain 側に公開ヘルパを増やさない）。

### E. UseCase の重複

`packages/application/src/shopping-list/load-shopping-list.ts` を新設し、
「`findById` → 未存在なら `ShoppingListNotFoundError` → `status !== 'active'` なら
`InvalidShoppingListStateError`」と「保存後の品目再取得」を関数として切り出す。
`mark-as-bought` / `set-item-checked` / `reassign-store` が利用する。
例外の種類・メッセージ・送出順序は現行と同一にする。

### B. DI 組み立て

Server Component は `@/server/repositories` のファクトリのみを使う。
Presentation から `@cookpit/infrastructure` への直接 import は
`src/server/repositories.ts` と `src/db/*` に閉じる。

### D. mutation ボイラープレート

`apps/web/src/lib/use-api-action.ts` を新設する。

```ts
// 概念。エラー文言は現行と同一の 2 種類に固定する。
const action = useApiAction();
// action.run(() => client.api...$post(...), { onSuccess })
// action.pending / action.errorMessage
```

- 現行の「`!response.ok` → `'操作に失敗しました。'`」「`catch` → `'通信エラーが発生しました。'`」を
  ヘルパ内に閉じ込める。文言は変えない。
- `useOptimistic` + `startTransition` を使う経路（`handleMarkAsBought` / `handleSetChecked`）は
  楽観的更新の順序が挙動に効くため、**フックに寄せず現行構造を維持**する。
  共通化対象は「非 optimistic な単発 mutation」に限定する。

### G. テスト分割

- `shopping-list-use-cases.test.ts`（1171 行）→ UseCase 単位のファイルへ。
- `shopping-list-client.test.tsx`（1160 行）/ `server/routes/shopping-lists.test.ts`（814 行）→
  機能単位（品目操作 / 完了・再開 / 同期・追加）へ。
- `describe` / `it` のタイトルとテスト件数は変えない（移動のみ）。

## データフロー

変更なし。層をまたぐ呼び出し順序（Presentation → Application → Domain ← Infrastructure）は
一切変更しない。

## API 設計

変更なし（パス・メソッド・リクエスト／レスポンス形状・ステータスコードすべて現行維持）。

## DB 設計

変更なし（スキーマ・マイグレーションともに触らない）。

## フロントエンド設計

観点 B / D / G が該当。上記「変更後構成」に記載。画面表示・文言・操作結果は不変。

## バックエンド設計

観点 A / C / E / F が該当。上記「変更後構成」に記載。

## エラー処理

外部 API / 外部ストレージへの新規 I/O は無いため、リトライ・タイムアウト・冪等性・
部分失敗・フォールバックの 5 項目は **対象外**。

既存のエラー処理については以下を保証する。

- HTTP 変換結果（404 / 422 / 500）は観点 C の前後で同一。
- UseCase が送出する例外クラスとメッセージは観点 E の前後で同一。
- 画面のエラー文言 2 種類は観点 D の前後で同一。

## ログと監視

変更なし（`console.error(err)` を含む現行の出力を維持する）。

## セキュリティ

変更なし。認証・認可は MVP1 で対象外（ADR-0003）。入力バリデーションは
`packages/api-contract` の Zod スキーマのまま変更しない。

## 性能

意図的な性能変更は行わない。観点 A のバレル導入により Server 側バンドルが domain 全体を
含む可能性があるが、Client Component は `@cookpit/domain` を値として import していない
（棚卸しで確認済み。Client の値 import は `@cookpit/api-contract` のみ）ため、
クライアントバンドルへの影響は無い。

## テスト方針

**新しいテストは原則追加しない**（挙動不変のリファクタリングであり、既存テストが回帰検知の
役割を果たすため）。例外は観点 D で新設する `use-api-action` のフック単体テスト。

ベースライン（2026-07-25 実測）を全観点で維持する。

| パッケージ     | テスト件数 |
| -------------- | ---------- |
| domain         | 352        |
| application    | 205        |
| infrastructure | 53         |
| api-contract   | 220        |
| web            | 439        |
| 合計           | **1269**   |

- lint: 0 error（既存 warning 1 件 `product-form-fields.test.tsx` は今回のスコープ外）
- type-check: 5/5 PASS

詳細は docs/tests/project-refactoring.md。

## 移行とリリース

- データ移行は不要。
- 観点ごとに独立したコミットとし、各コミット時点で品質ゲートが通る状態を保つ。
- リリース手順の変更なし。

## リスク

| リスク                                          | 対応                                                                                               |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 観点 A の 285 箇所置換で import 漏れ・循環参照  | 機械置換後に type-check を全パッケージで実行。domain 内部は相対パス維持で循環を作らない            |
| `ProductId` 改名が想定外の箇所に波及            | 当該 `interface` を import している箇所は 0 件（棚卸し確認済み）。構造的型のため呼び出し側は無変更 |
| 観点 C で 500 に落ちるべき例外が 404/422 になる | 現行 11 クラスの継承関係を実装前に全件確認する。基底を継承しないエラーは従来どおり 500             |
| 観点 E の共通化で例外送出順序が変わる           | 抽出関数内で現行と同じ順序（リスト未存在 → 状態不正 → 品目未存在）を保つ。既存テストで検証         |
| 観点 D で楽観的更新の即時反映が壊れる           | `useOptimistic` 経路は共通化対象から除外する                                                       |
| 観点 G の分割でテストが消える                   | 分割前後で件数（application 205 / web 439）を突き合わせる                                          |

**申し送り（今回は変更しない）**: `RecipeIngredient.productRef` の型が
構造的 `interface`（`{ value: string }`）であり、`ProductId` 値オブジェクトの公称型付け
（`Identifier` のファントムブランド）を回避できてしまっている。集約をまたぐ ID 参照の
型安全性としては弱い。ドメインモデルの変更にあたるため別タスクとして提案する。

## 未決事項

なし（対象観点・UI 共通化方針・コミット粒度・新規ファイルはユーザー確定済み）。

## 実施結果（2026-07-25）

全 7 観点を実施済み。観点ごとに 1 コミット。

| 観点 | コミット  | 主な差分                                                          |
| ---- | --------- | ----------------------------------------------------------------- |
| A    | `f529b52` | deep import 285 → 0。70 ファイル。`ProductId` → `ProductRef` 改名 |
| C    | `671802a` | onError 11 分岐 → 3 分岐。`export default app` を解消             |
| F    | `75f1ad6` | 日付ヘルパ 5 重複 → infrastructure 1 / application 1              |
| E    | `ebbf896` | 3 UseCase の重複ブロックを `load-shopping-list.ts` へ             |
| B    | `b355c0f` | Server Component 10 ページを Repository ファクトリへ統一          |
| D    | `4eb9ec2` | `use-api-action.ts` 新設。shopping-list-client 446 → 393 行       |
| G    | `5c247ed` | 1000 行超 2 件・814 行 1 件 → 18 ファイルへ分割                   |

### 設計との差分（実装時に判明した点）

- **観点 C**: 設計では「現行の 11 具象クラスはすべて 2 基底のいずれかを継承している」と
  記載したが、実際は `InvalidStockOperationError` のみ素の `Error` を継承していた。
  メッセージ書式を固定しない中間基底 `InvalidOperationError` を新設して吸収し、
  メッセージ・`name`・HTTP 変換結果はいずれも現行のまま維持した。
- **観点 D**: 「`onSuccess` を指定したときだけ `json()` を呼ぶ」設計では、
  本文を使わない成功時（`router.refresh()` のみ）にも `json()` が走ってしまうため、
  `onSuccessWithoutBody` を分けた。テストモックが `json()` を持たないケースで顕在化した。
- **観点 D**: `reassign-store` は当初「per-item pending グループを維持する」ために
  対象外としていたが、エラーバナーを `useApiAction` と共有する形で移行できた。
  楽観的更新の 2 ハンドラ（`markAsBought` / `setItemChecked`）は設計どおり対象外。
- **観点 G**: `shopping-list-client.checked.test.tsx` が 574 行で「概ね 400 行以下」に
  届いていない。楽観的更新のロールバック検証が本質的に長いため、これ以上の分割は
  凝集を損なうと判断して現状とした。

### 最終品質ゲート

- type-check 5/5 PASS / lint 0 error（既存 warning 1 件のみ）
- テスト: domain 352 / application 205 / infrastructure 53 / api-contract 220 / web 446 =
  **1276 PASS**（ベースライン 1269 + 観点 D のフック単体テスト 7 件）
