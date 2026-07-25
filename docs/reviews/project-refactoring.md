# レビュー記録: project-refactoring（L2 / 挙動不変リファクタリング）

- 対象ブランチ: `claude/project-refactoring-vc1pmz`（分岐元 `590dfc2`、コミット 8 本）
- 対象成果物: `docs/designs/project-refactoring.md` / `docs/implementation-plans/project-refactoring.md` /
  `docs/tests/project-refactoring.md` / `docs/decisions/ADR-0010-package-public-boundary.md`
- レビュー実施日: 2026-07-25
- 実施者: reviewer サブエージェント（独立レビュー）＋ Orchestrator（機械検証）

## 結論

**Must 指摘なし。差し戻し不要。** 最重要要件「外部から観測可能な挙動を一切変えない」は、
単一操作の経路では全観点で維持されていることを確認した。

判断を要する項目が 2 件（S1 / S2）あった。**S1 はユーザー判断により修正済み**（下記）。
S2 は受容（記録のみ）。いずれも並行操作・過渡表示に限られ、データ整合性やエラー変換には
影響しない。

## 品質ゲート（独立に再現）

| ゲート     | 結果                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------- |
| type-check | 5/5 PASS                                                                                      |
| lint       | 0 error（既存 warning 1 件 `product-form-fields.test.tsx`。スコープ外）                       |
| prettier   | クリーン                                                                                      |
| build      | `pnpm build` 成功。17 ルートの構成は変更前と同一                                              |
| test       | domain 352 / application 205 / infrastructure 53 / api-contract 220 / web 446 = **1276 PASS** |

ベースラインは 1269。増分 7 件は観点 D で新設した `use-api-action` の単体テスト。

## 機械検証の結果（Orchestrator 実施）

読みでは見落としやすい「取りこぼし」を実測で確認した。

### 観点 G — 分割で検証内容が失われていないか

分岐元 `590dfc2` の 3 ファイルと、分割後のファイル群を厳密比較。

|             | `it` 表題           | `expect()` 呼び出し | `not.toHaveBeenCalled` |
| ----------- | ------------------- | ------------------- | ---------------------- |
| web client  | 42 → 42（完全一致） | 85 → 85             | 3 → 3                  |
| route       | 26 → 26（完全一致） | 82 → 82             | 7 → 7                  |
| application | 58 → 58（完全一致） | 130 → 130           | 0 → 0                  |

`vi.mock` を各ファイルが使うエンドポイントだけに絞った影響で失われたアサーションは無い。

### 観点 C — エラー → HTTP 変換の等価性

使い捨てテストで `onError` と同一の判定を実行し、次を確認（検証後に削除済み）。

- `NotFoundError` 派生 8 クラス → 404
- `InvalidOperationError` 派生 3 クラス → 422
- 基底を継承しないエラー（`Error` / `TypeError` / 任意の派生）→ 500
- `name` と `message` が変更前と同一（継承元を変えた `InvalidStockOperationError` を含む）

reviewer 側でも `packages/application/src/**/*.error.ts` を全件確認し、
基底を継承しないエラークラスが他に存在しないことを確認済み。

### 観点 A — バレルの網羅性

domain の公開シンボル **64 個すべて**がバレル経由で到達可能。名前衝突なし。
domain の差分は `index.ts` と `recipe-ingredient.ts`（`ProductId` → `ProductRef` の純粋な改名）の 2 ファイルのみ。

### スコープ外変更の混入

確認範囲では**なし**。各コミットは対象観点に閉じており、機能追加・文言変更・
意図的な性能改善は検出されなかった。

## Should

### S1: `useApiAction` の共有インスタンスで pending スロットが単一のため、並行操作時に観測差が出る

- 該当: `apps/web/src/app/shopping-lists/_components/shopping-list-client.tsx`（`itemsAction` を
  追加・再取得・店舗再割当で共有）、`apps/web/src/app/pantry/_components/pantry-client.tsx`
  （`action` を消費・破棄・追加・再取得で共有）
- 変更前は `refreshing` / `addSubmitting` / `submittingStockId` を**独立した state** で保持していた。
  統合後は単一の `pendingKey` を別キーで奪い合うため、たとえば「手動更新の GET が飛んでいる最中に
  追加フォームを送信」すると `pendingKey` が `'add'` に上書きされ、更新ボタンが応答到着前に
  再活性化する。逆に再取得の `finally` が追加側の pending も消す。
- 影響: 低。意図的な同時操作かつネットワーク往復の窓が必要で、リクエスト自体は正しく完了する。
  データ不整合は起きない。行単位の disable は `submittingItemId`（別 state）を使い続けるため無影響。
- 判断: **修正済み（ユーザー指示）**。pending を単一キー `pendingKey` から集合
  `ReadonlySet<string>` に変更し、変更前の「独立した pending」と等価にした。
  公開 API から `pendingKey` を外し、`pending`（size > 0）と `isPending(key)` に統一。
  併せて N1 も解消した（下記）。回帰テスト UAA-08 を追加し、**旧実装では落ちること**を
  確認済み（単一キー実装に一時的に戻して失敗を再現）。

> reviewer は「手動更新が in-flight のとき focus による silent 再取得がガードで
> スキップされ得る」も S1 の一部として挙げたが、これは**成立しない**。
> focus ハンドラは `useEffect([])` で第 1 レンダー時のクロージャを捕捉しており、
> そこから見える `pendingKey` は常に初期値 `null` のため、ガード条件
> `pendingKey === key` は成立しない。変更前と同じく silent 再取得は常に実行される。

### S2: 非 silent の再取得で、エラーバナーがリクエスト開始時点で消える（Orchestrator 検出）

- 該当: `shopping-list-client.tsx` / `pantry-client.tsx` の `handleRefetch`
- 変更前の `handleRefetch` は開始時に `errorMessage` をクリアせず、成功時にクリア・失敗時に
  同じ文言で上書きしていた。`useApiAction.run` は非 silent 実行の開始時に必ずクリアするため、
  「更新」を押した瞬間にバナーが消え、失敗すると再表示される。
- 他のハンドラ（追加・完了・再開・同期・献立系）は変更前も開始時にクリアしていたため差分なし。
- 影響: 過渡表示のみ。既存テスト（LC-21「refetch 成功で既存のエラーバナーがクリアされる」）は
  どちらの挙動でも通る。
- 判断: **受容（ユーザー指示）**。「新しい試行を始めたら前のエラーを消す」は一般的な挙動で
  あり、機能への影響が無いため記録のみとする。厳密に変更前と揃えるなら、開始時クリアを
  抑止するオプションを `RunOptions` に足すことで対応できる。

## Nice

### N1: `pantry-client` が `submittingStockId` に `'add'` / `'refresh'` を取り得る値を渡していた（対応済み）

`submittingStockId={action.pendingKey}` は、stockId が文字列 `'add'` / `'refresh'` と
衝突しない前提（実際は UUID のため安全）に暗黙依存していた。S1 の集合化に伴い、
グループ内で実行中の stockId を `isPending` で解決する形
（`group.stocks.find((stock) => action.isPending(stock.id))?.id ?? null`）に変更し、
キー衝突の余地を無くした。子コンポーネント（`LocationGroup` / `StockRow`）の API は不変。

### N2: 二重実行ガードの新規導入は UI 経由では観測不能

`handleAddItem` / `handleGenerate` / 献立の create・add・remove / `handleRefetch` に
ガードが新設されたが、いずれも pending 中はボタン・フォームが disable されるため
通常 UI では二重発火し得ない。設計書が `useApiAction` の役割として二重実行ガードを
明記しており意図的。ロバスト性の微改善として記録に留める。

### N3: `onSuccess` と `onSuccessWithoutBody` の排他が型で強制されていない

JSDoc は「排他で使う」と記すが未強制。現行の呼び出し側に違反はない。
将来の誤用防止としてユニオン型化の余地がある（任意）。

### N4: 設計書本文と実装事実の不整合（対応済み）

`docs/designs/project-refactoring.md` §変更後構成 C の「現行の 11 具象クラスはすべて
2 基底のいずれかを継承しているため」は誤り（`InvalidStockOperationError` のみ素の `Error` 継承）。
「実施結果 › 設計との差分」で訂正済みだったが、本文にも注記を追加した。
ADR-0010 の記述は実装と整合しており問題なし。

## 各観点の確認結果（reviewer）

- **観点 C**: 全 11 具象クラスの継承を全件確認。8 → `NotFoundError`、3 → `InvalidOperationError` に
  過不足なく収まり、404 / 422 / 500 のマッピングは同一。`name` は `new.target.name` により保持
  （`InvalidStateError` は自身の `this.name` 代入を削除したが親が設定、
  `InvalidStockOperationError` はハードコード名 → 親の `new.target.name` で同値）。
- **観点 E**: 「リスト未存在 → 状態不正 → 品目未存在」の送出順序を保持。例外クラス・メッセージ・
  operation 名（`markAsBought` / `setItemChecked` / `reassignStore`）とも一致。
  `findUpdatedItem` は従来同様の素の `Error`。`complete-shopping` の `entries()` 化も等価
  （`entry === undefined` は元々ループ境界上のデッドコード、`?? null` は従来の二重比較と等価）。
- **観点 D**: `onSuccess`（`json()` を読む）と `onSuccessWithoutBody`（読まない）の分離により、
  各ハンドラの `json()` 呼び出し有無が原コードと完全一致。エラー文言 2 種は共通定数に集約され不変。
  楽観的更新 2 経路は `submittingItemId` + `startTransition` 構造を維持。
  complete / reopen / sync は独立インスタンスでバナーの独立性を保持。
- **観点 A**: deep import 285 → 0（残存 2 件はコメント）。値 import と型 import の振り分けは
  type-check 通過が担保する（値を `import type` で取り込めば型エラーになる）。
- **観点 F**: `toLocalDate` / `toLocalDateString` の式は原定義と同一。meal-plan の nullable 版は
  呼び出し側の `=== null` 判定へ展開され等価。
- **観点 B**: ファクトリは `new DrizzleXxxRepository(getDb())` そのもの。`getDb()` は
  シングルトンを返すため接続は増えない。等価。

## 申し送り（別タスク）

- `RecipeIngredient.productRef` の `ProductRef`（構造的 interface）→ `ProductId` 値オブジェクト化。
  ADR-0010 案 D として記録済み。集約をまたぐ ID 参照の公称型付けが回復する。
- recipe / product のフォーム系 client 7 ファイルは 400 のフィールドエラー解析を伴うため
  `useApiAction` の対象外。共通化するなら別設計が必要。
- `shopping-list-client.checked.test.tsx` は 574 行で「概ね 400 行以下」に未達。
  楽観的更新のロールバック検証が本質的に長く、これ以上の分割は凝集を損なうと判断した。
