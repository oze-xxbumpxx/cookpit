# 設計書: recipe-form-usability

- ステータス: confirmed
- レベル: L2
- 関連: `docs/designs/recipe-edit-screen.md` / `docs/designs/recipe-form-refactor-test-backfill.md`

## 背景

レシピ追加・編集画面へのユーザー（パートナー）からの実利用フィードバック 2 件。

1. **材料の並べ替えができない。** 材料は追加した順に固定で、後から順序を直せない。
2. **戻る操作で入力が消える。** 確認なしに離脱するため、誤操作で入力内容が一瞬で失われる。
   「本当に戻りますか？（内容は保存されません）」のクッションが欲しい。

## 目的

- 材料の順序をドラッグ&ドロップで直せるようにする。
- 未保存の変更があるまま画面を離れようとしたとき、確認を挟む。

## 要件

| #   | 要件                                                                                 |
| --- | ------------------------------------------------------------------------------------ |
| A-1 | レシピ追加・編集画面で、材料の行をドラッグ&ドロップで並べ替えられる                  |
| A-2 | タッチ（iPhone / Android）で動作する。ドラッグ中も**リストの縦スクロールを壊さない** |
| A-3 | ドラッグ以外の代替手段（キーボード）でも並べ替えられる                               |
| A-4 | 並べ替えた順序が保存され、詳細画面にその順で表示される                               |
| B-1 | 未保存の変更があるとき、画面内「キャンセル」で確認ダイアログを出す                   |
| B-2 | 未保存の変更があるとき、**ブラウザ / スワイプの戻る**でも確認ダイアログを出す        |
| B-3 | 未保存の変更があるとき、**ボトムナビのタブ**を踏んでも確認ダイアログを出す           |
| B-4 | 変更が無ければ確認せず即座に離脱する（過剰なガードをしない）                         |
| B-5 | 保存に成功した後の遷移では確認ダイアログを出さない                                   |

## 対象範囲

`apps/web` のみ（レシピ追加画面・レシピ編集画面）。

## 対象外

- 作り方の**手順（steps）の並べ替え**（ユーザーが「材料のみ」を選択）
- products のフォーム画面への離脱確認の適用（要望に無い。フックは再利用可能な形にする）
- リロード・タブを閉じる操作のガード（`beforeunload` は入れない）
- Domain / Application / Infrastructure / api-contract / DB（**すべて変更なし**）

## 現状構成

- `recipe-form-fields.tsx` が new/edit 共通のフィールド群。**state を持たない完全制御**で、
  親から `value: RecipeFormValue` / `onChange` を受け、`addIngredient` / `updateIngredient` /
  `removeIngredient` が `updateValue({ ingredients })` 一本で親へ返す。
- `ingredient-row.tsx` は 3 カラムグリッド
  `grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_36px]`（食材名 / 分量 / 削除）。
- 親は `recipe-form-client.tsx`（新規。`baseServings` を**別 state** で持つ）と
  `recipe-edit-form-client.tsx`（編集。`baseServings` は読み取り専用表示）。
- キャンセルはいずれも `router.push(...)` の直呼びで、確認なし。`router.back()` /
  `beforeunload` はコードベース全体で未使用。
- `app/layout.tsx` が**全ページに `NavBar`（`fixed` のボトムタブ・`next/link` 6 本）**を
  レンダーしている。レシピフォームも例外ではない。

**材料の並び順の権威は `RecipeFormValue.ingredients` の配列順のみ。**
`recipeIngredientSchema` に order 系フィールドは無く、DB は `recipes.ingredients` の JSONB 配列で
配列順がそのまま往復する。`buildIngredientInput` は入力配列を先頭から走査するため、
UI の順序がそのまま送信配列の順序になる。

## 変更後構成

| 対象                                                     | 変更                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| `apps/web/package.json`                                  | `@dnd-kit/core` / `@dnd-kit/sortable` / `@dnd-kit/utilities` を追加 |
| `recipes/_utils/move-array-item.ts`（新規）              | 配列要素の移動の純関数                                              |
| `recipes/_utils/recipe-form-dirty.ts`（新規）            | 未保存判定の純関数                                                  |
| `lib/use-leave-confirmation.ts`（新規）                  | 離脱ガードのフック                                                  |
| `app/_components/leave-confirmation-dialog.tsx`（新規）  | 確認ダイアログ                                                      |
| `ingredient-row.tsx`                                     | `useSortable` 対応・ドラッグハンドル列を追加                        |
| `recipe-form-fields.tsx`                                 | `DndContext` / `SortableContext` / `moveIngredient`                 |
| `recipe-form-client.tsx` / `recipe-edit-form-client.tsx` | dirty 算出とフック・ダイアログの結線                                |

## データフロー

```
[ドラッグ or ↑↓キー] → handleDragEnd / onMove
    → moveIngredient(from, to)
    → updateValue({ ingredients: moveArrayItem(...) })   ← 親の setValue
    → 保存時は buildIngredientInput が配列順に走査 → API へ配列順で送信
```

```
[キャンセル / ブラウザバック / ボトムタブ]
    → dirty ? ダイアログ : 即離脱
    → 「編集を続ける」: 留まる（履歴 sentinel を積み直す）
    → 「戻る」       : ガード解除 → router.push / replace
```

## API 設計

**変更なし。**

## DB 設計

**変更なし。**（材料の順序は `recipes.ingredients` JSONB 配列の順序で表現済み）

## フロントエンド設計

### A. ドラッグ&ドロップ

**ライブラリ**: `@dnd-kit/core@6.3.1` + `@dnd-kit/sortable@10.0.0` + `@dnd-kit/utilities@3.2.2`。

- HTML5 Drag and Drop API は**モバイルのタッチで発火しない**ため使えない。このアプリは
  `max-w-md` のモバイル前提レイアウト・PWA でタッチ動作が必須要件。
- `@dnd-kit/core` 6.3.1 の peerDependencies は `react: >=16.8.0` で **React 19.2.4 と競合しない**
  （インストール時に検証済み）。後継の `@dnd-kit/react` は 0.5.0 とまだ 0.x のため採らない。
- 比較検討: Pointer Events の自前実装も評価した。依存ゼロで repo の自作方針（`useApiAction` を
  自作、TanStack Query 未導入）と整合するが、ポインタ捕捉・スクロール競合・キャンセル・
  キーボード代替・読み上げ通知を合わせて 250〜350 行の DOM 幾何コードを抱えることになる。
  happy-dom では `getBoundingClientRect()` が 0 を返すためどちらの方式でもドラッグ挙動は
  自動テストできず、テスト条件は同等。保守リスクを重く見てライブラリ採用とした（ユーザー確認済み）。

**センサー構成**

| センサー         | 設定                                            | 理由                         |
| ---------------- | ----------------------------------------------- | ---------------------------- |
| `PointerSensor`  | `activationConstraint: { distance: 8 }`         | クリック・タップとの誤爆防止 |
| `KeyboardSensor` | `coordinateGetter: sortableKeyboardCoordinates` | A-3 のキーボード代替         |

`PointerSensor` はタッチ・マウス・ペンを統一的に扱うため `TouchSensor` は併用しない
（両方登録すると同一操作が二重に活性化しうる）。

**スクロール競合（A-2）**

`touch-action: none`（Tailwind の `touch-none`）は**ドラッグハンドルにだけ**当てる。
行全体・リストコンテナには当てない。ハンドルは 28px 幅の専用列で、そこを掴んだときだけ
ブラウザのスクロールジェスチャを奪う。入力欄・削除ボタン・余白は `touch-action` を変えないため
**縦スクロールは一切阻害されない**。

**アクセシビリティ（A-3）**

- ハンドルはフォーカス可能な `<button>`。`aria-label` は `「玉ねぎ」を並べ替え`
  （食材名が未入力なら `2番目の材料を並べ替え`）。
- dnd-kit の `KeyboardSensor` により Space で掴む → ↑↓ で移動 → Space で確定が動く。
- dnd-kit が既定のスクリーンリーダー通知（`announcements`）を持つが英語のため、
  `DndContext` の `accessibility.announcements` に日本語文言を渡す。

**配置**

- `moveIngredient(from, to)` は `recipe-form-fields.tsx` の内部関数として
  `addIngredient` / `removeIngredient` の隣に置く。`updateValue({ ingredients })` 一本で完結し、
  完全制御の構造を崩さない。
- 行の `key` は既存の `ingredient.id`（`ingredient-${n}` の単調増加）をそのまま
  `useSortable` の item id に使う。**削除後に追加しても重複しない**。
- グリッドは `grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_36px]` の 4 列へ。

### B. 離脱確認

**dirty 判定**（`recipe-form-dirty.ts`）

初期値スナップショットとの**正規化比較**。変更フラグ方式は「入力→消して元に戻した」で
誤検知するため採らない。素の `JSON.stringify` 比較も、空行の追加やタグの付け外しで
過剰にガードするため採らない。

| フィールド                                        | 正規化                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `name` / `notes` / `cookingTime` / `baseServings` | `trim()`                                                                              |
| `tags`                                            | `[...tags].sort()`（選択順の差を無視）                                                |
| `ingredients`                                     | 完全な空行を除外 → `{ displayName, amountText }` に trim して写像し **`id` は落とす** |
| `steps`                                           | 空行を除外 → `{ description }` に trim                                                |

**`id` を落とすのが要点**。「材料を追加ボタンを押しただけ（空行が 1 行増える）」は dirty に
ならず、**並べ替えは配列順が変わるので dirty になる**（A と正しく噛み合う）。

`baseServings` は new のみ別 state。dirty の算出は各クライアントで行い、フックには
`boolean` を渡す（フックは値の形を知らない）。

**フック**（`lib/use-leave-confirmation.ts`）

不変条件を 1 つだけ置く:

> **dirty が true の間は、履歴にダミーエントリ（sentinel）がちょうど 1 段積まれている。**

これを冪等な `ensureSentinel()` で維持し、popstate 由来かキャンセル由来かの分岐を持たない。

1. `dirty` が false → true になった瞬間に
   `history.pushState(null, '', window.location.href)` を 1 回だけ積む（`useRef` で多重防止）。
   マウント時に積まないのは、何も入力していないユーザーの戻るを 1 回空振りさせないため。
2. `popstate` を受けたら（sentinel が消費された）ダイアログを開く。
3. 「編集を続ける」→ `ensureSentinel()` で積み直す。
4. 「戻る」→ ガード解除して `router.push`（sentinel が残っていれば `router.replace` で潰す）。
   `history.go(-1)` を採らない理由: popstate の時点で sentinel は消費済みなので、さらに
   `go(-1)` するとフォームに入る前の履歴へ飛ぶ。それが目的地とは限らず、履歴が無ければ
   何も起きない。`router.push` は遷移先が決定的で、既存のキャンセル挙動とも一致する。
5. 保存成功時は `leaveAfterSave(href)` でガードを解除してから遷移する（B-5）。

**ボトムナビ（Link）のガード（B-3）**

`app/layout.tsx` が全ページに `NavBar` を出しているため、**実際に最も踏みやすい離脱経路は
ボトムタブの誤タップ**。これは `popstate` を発火しないので、capture フェーズの `click`
インターセプトを入れる。

- `document.addEventListener('click', handler, true)` で `a[href]` を `closest` で拾い、
  `preventDefault()` + `stopPropagation()`（capture で止めるので Next の `Link` の内部
  ハンドラに届かない）
- 除外: `dirty === false` / `defaultPrevented` / 左クリック以外 / 修飾キー付き /
  `target="_blank"` / 別オリジン / 同一 URL

**ダイアログ**

既存 `components/ui/alert-dialog.tsx` を**制御モード**（`open` / `onOpenChange`）で使う。
既存 2 箇所は `AlertDialogTrigger` の非制御パターンだが、popstate 起因ではトリガー要素が
存在しないため制御モードが必須。`AlertDialog` は Root の props を透過するのでラッパーの
変更は不要。

- タイトル「本当に戻りますか？」
- 説明「入力した内容は保存されません。」
- ボタン「編集を続ける」（`AlertDialogClose` + outline）/「戻る」（destructive）

### 既知の限界（B）

1. コード内の `router.push` / `router.replace` はガードできない（popstate も click も
   発火しないため）。対象 2 画面ではキャンセルと保存のみで、どちらもフックを経由する。
2. リロード・タブを閉じる・アプリ切替はガードしない（`beforeunload` 不採用）。
3. 戻るの高速連打は 1 段しか吸収できない。sentinel を多段積みすると離脱時の後始末が
   複雑になるため採らない。
4. PWA standalone モードではスワイプバック自体が無いため、その経路は Safari タブ利用時のみ。
5. capture の click インターセプトは、将来 `<a>` に独自 `onClick` を載せたコンポーネントを
   壊しうる。現状そのようなコンポーネントは無く、フォーム画面のマウント中だけ登録される。

## バックエンド設計

**変更なし。**

## エラー処理

外部 I/O を伴わない UI 変更のため、リトライ・タイムアウト・冪等性・部分失敗・
フォールバックの 5 項目は**対象外**。保存失敗時はガードを解除しないため、続くキャンセル操作で
確認ダイアログが出る（入力を失わない）。

## ログと監視

**対象外。**

## セキュリティ

**対象外**（認証なし・入力経路の変更なし）。

## 性能

材料は通常 5〜15 行。dnd-kit の追加により `apps/web` のバンドルが増えるが、レシピフォーム
画面に限定される。**追加の最適化は対象外。**

## テスト方針

`docs/tests/recipe-form-usability.md` を正とする。要点:

- happy-dom では `getBoundingClientRect()` が 0 を返すため**ポインタドラッグは自動テストできない**。
  並べ替えロジックは純関数 `moveArrayItem` で固定し、UI は**キーボード操作**で検証する。
- dirty 判定は純関数として全分岐を固定する。
- 離脱ガードはテスト用ハーネスで `history.pushState` の spy・`popstate` の dispatch・
  リンククリックを検証する。
- ドラッグのタッチ挙動とスクロール競合、実機のスワイプバックは**実画面確認で担保する**
  （自動テストで代替できない）。

テストファイル名は apps/web の vitest `include`（`*.node.test.ts` / `*.test.tsx`）に合わせる。

## 移行とリリース

DB・API の変更が無いため移行手順は**不要**。

## リスク

| リスク                                                              | 対策                                                                                                                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`pushState` でフォーム state が失われる**（B の根幹・最悪の回帰） | Next.js は `history.pushState` を patch している。同一 URL を明示指定した push で入力が保持されることを実装直後に dev サーバーで実測する。失われる場合は sentinel 方式を捨てフォールバックする |
| ドラッグが縦スクロールを潰す                                        | `touch-none` をハンドルのみに限定。`PointerSensor` に `distance: 8`。実画面確認を必須にする                                                                                                    |
| happy-dom でドラッグを再現できず並べ替えが無テストになる            | 純関数 `moveArrayItem` を切り出して固定 + キーボード操作で RTL テスト                                                                                                                          |
| capture の click インターセプトが将来のリンクを壊す                 | 除外条件を明示し、`dirty === false` では一切介入しない。マウント中のみ登録                                                                                                                     |
| dnd-kit 追加が CI の Dependency Audit に影響                        | 追加後に production 依存の脆弱性を確認する                                                                                                                                                     |

## 申し送り（Next.js を更新するときに必ず再確認すること）

離脱ガードは **Next.js が `history.pushState` を patch している挙動に依存している**。
2026-07-25 時点の Next.js 16.2.11 では「同一 URL を明示指定した `pushState` ではルートが
不変で、フォームの Client Component の state が保持される」ことを実機で確認済み（試験計画 E-1）。
**これは公式に保証された仕様ではない。**

この依存が危険なのは**失敗の向き**にある。

- 望ましい壊れ方（許容）: patch の仕様が変わってガードが効かなくなる → 挙動がガード導入前に戻るだけ
- **危険な壊れ方**: 同一 URL の `pushState` で state が破棄されるようになる →
  **入力途中に sentinel を積んだ瞬間にフォームが消える**。ガードが原因でユーザーの入力を失わせる

したがって **Next.js のバージョンを上げるときは、試験計画の E-1 を必ず再実行する**こと
（`pnpm dev:pglite` + レシピ追加画面で 1 文字入力 → `history.length` が 1 増え、かつ
入力値が残ること）。自動テストでは検出できない（RTL は Next のルーターを介さないため）。

E-1 が FAIL した場合のフォールバック: sentinel 方式を捨て、「`popstate` を検知したら即座に
`pushState` で 1 段戻してからダイアログを出す」方式へ切り替える。URL が一瞬前の画面になる
代わりに、フォーム state の保持を `pushState` の挙動に依存しなくなる。

## 未決事項

なし。DnD の方式（ライブラリ採用）・対象（材料のみ）・離脱ガードの範囲はユーザー確認済み。
