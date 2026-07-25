# 実装計画: recipe-form-usability

- 前提となる設計書: `docs/designs/recipe-form-usability.md`
- レベル: L2
- 実装ルート: Orchestrator（implementer）
- 判断理由: 既定（UI の状態管理とライブラリ結線が中心で、実画面確認と往復するため）

## 変更対象ファイル

| path                                                                              | なぜ変えるか                                                                                 |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/web/package.json`                                                           | `@dnd-kit/core` / `@dnd-kit/sortable` / `@dnd-kit/utilities` を追加                          |
| `apps/web/src/app/recipes/_components/ingredient-row.tsx`                         | `useSortable` 対応・ドラッグハンドル列の追加・`index` prop                                   |
| `apps/web/src/app/recipes/_components/ingredient-row.test.tsx`                    | 必須になった `index` を各 render に追加                                                      |
| `apps/web/src/app/recipes/_components/recipe-form-fields.tsx`                     | `DndContext` / `SortableContext` / センサー / `handleIngredientDragEnd` / 日本語読み上げ文言 |
| `apps/web/src/app/recipes/_components/recipe-form-fields.test.tsx`                | 並べ替えの観点を追加                                                                         |
| `apps/web/src/app/recipes/new/_components/recipe-form-client.tsx`                 | dirty 算出・離脱ガード・ダイアログの結線                                                     |
| `apps/web/src/app/recipes/new/_components/recipe-form-client.test.tsx`            | `replace` のモック追加・離脱確認の観点を追加                                                 |
| `apps/web/src/app/recipes/[id]/edit/_components/recipe-edit-form-client.tsx`      | 同上                                                                                         |
| `apps/web/src/app/recipes/[id]/edit/_components/recipe-edit-form-client.test.tsx` | `replace` のモック追加                                                                       |

## 新規作成ファイル

| path                                                             | 役割                     |
| ---------------------------------------------------------------- | ------------------------ |
| `apps/web/src/app/recipes/_utils/move-array-item.ts`             | 配列要素移動の純関数     |
| `apps/web/src/app/recipes/_utils/move-array-item.node.test.ts`   | 同テスト                 |
| `apps/web/src/app/recipes/_utils/recipe-form-dirty.ts`           | 未保存判定の純関数       |
| `apps/web/src/app/recipes/_utils/recipe-form-dirty.node.test.ts` | 同テスト                 |
| `apps/web/src/lib/use-leave-confirmation.ts`                     | 離脱ガードのフック       |
| `apps/web/src/lib/use-leave-confirmation.test.tsx`               | 同テスト（ハーネス経由） |
| `apps/web/src/app/_components/leave-confirmation-dialog.tsx`     | 確認ダイアログ           |

## ファイルごとの変更内容

### `ingredient-row.tsx`

- 変更内容: `useSortable({ id: value.id })` を使い、ルート `div` に `setNodeRef` と
  `transform`（**x を 0 に潰して縦 1 次元に固定**）/ `transition` を当てる。グリッドを
  `grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_36px]` の 4 列にし、先頭に `GripVertical` の
  ハンドル `<button>` を置く。ハンドルには `touch-none` と `attributes` / `listeners` を付ける。
  `aria-label` は食材名があれば `「〇〇」を並べ替え`、無ければ `N番目の材料を並べ替え`。
- 完了条件: `touch-none` が**ハンドルにだけ**当たっている（行・コンテナには当てない）。
  既存の入力欄・削除ボタンの振る舞いが不変。

### `recipe-form-fields.tsx`

- 変更内容: 材料の `map` を `DndContext`（`PointerSensor` は `distance: 8`、
  `KeyboardSensor` は `sortableKeyboardCoordinates`）+ `SortableContext`
  （`verticalListSortingStrategy`）で包む。`handleIngredientDragEnd` を
  `addIngredient` / `removeIngredient` の隣に置き、`moveArrayItem` で並べ替えて
  `updateValue({ ingredients })` する。`accessibility.announcements` に日本語文言を渡す。
- 完了条件: `RecipeFormFields` が state を持たない完全制御のままであること。
  `TouchSensor` は併用しない（`PointerSensor` がタッチも扱うため二重活性化を避ける）。

### `use-leave-confirmation.ts`（新規）

- 変更内容: 設計書 §B の sentinel 方式。`ensureSentinel` / `navigate` /
  `popstate` リスナ / capture フェーズの `click` インターセプトを実装する。
- 完了条件: `dirty === false` では `pushState` も `preventDefault` も一切起きない。
  アンマウントで両リスナが外れる。

### `recipe-form-client.tsx` / `recipe-edit-form-client.tsx`

- 変更内容: 初期スナップショットを **`useState` の初期化関数**で保持し（`useRef` は
  `react-hooks/refs` がレンダー中の読み取りを禁止するため使えない）、`isRecipeFormDirty` で
  `dirty` を算出。キャンセルを `leave.requestLeave(href)` に、保存成功時の `router.push` を
  `leave.leaveAfterSave(href)` に置き換え、末尾に `LeaveConfirmationDialog` を置く。
- 完了条件: 保存成功後に確認ダイアログが出ない。既存の送信・エラー表示の挙動が不変。

## 実装手順

1. **依存追加** … `@dnd-kit/core@^6.3.1` / `@dnd-kit/sortable@^10` / `@dnd-kit/utilities@^3.2.2` /
   完了条件: React 19 との peer 競合が出ない
2. **純関数** … `move-array-item.ts` / `recipe-form-dirty.ts` とその `.node.test.ts` /
   完了条件: `pnpm lint && pnpm type-check && pnpm test`
3. **DnD の UI 結線** … `ingredient-row.tsx` → `recipe-form-fields.tsx` /
   完了条件: 同上。既存の recipe テストが通る
4. **離脱ガード** … フック → ダイアログ → 2 画面への結線 /
   完了条件: 同上
5. **実画面確認** … `manual-browser-verify`（PGlite dev + Playwright）

## テスト計画

正典は `docs/tests/recipe-form-usability.md`。ファイル名と vitest project の対応:

| ファイル                                      | project |
| --------------------------------------------- | ------- |
| `_utils/move-array-item.node.test.ts`         | node    |
| `_utils/recipe-form-dirty.node.test.ts`       | node    |
| `lib/use-leave-confirmation.test.tsx`         | dom     |
| `_components/recipe-form-fields.test.tsx`     | dom     |
| `new/_components/recipe-form-client.test.tsx` | dom     |

素の `src/**/*.test.ts`（server 以外）はどの project にも一致せず silent skip になるため使わない。

### happy-dom での既知の制約と対処

happy-dom は `getBoundingClientRect()` が常に 0 を返すため、dnd-kit が要素の位置を測れず
並べ替え先を決定できない（ポインタ・キーボードとも）。テストでは兄弟内の位置から縦に積んだ
矩形を返すスタブ（`stubVerticalRects`）を入れて計測だけを成立させ、**キーボード操作**で
結線を検証する。またdnd-kit の `KeyboardSensor` は `event.key` ではなく **`event.code`** を
見るため、user-event では**物理キーコード記法（角括弧 `[Space]` / `[ArrowDown]`）**で
送る必要がある（`{Space}` では発火しない）。

## リスク

| リスク                                         | 対策                                                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pushState` でフォーム state が失われる        | 実装直後に dev サーバーで実測する。失われる場合は sentinel 方式をフォールバックへ切り替える                           |
| ドラッグが縦スクロールを潰す                   | `touch-none` をハンドルのみに限定。実画面確認を完了条件に含める                                                       |
| 既存テストの `push` アサーションが壊れる       | 保存成功時は sentinel を潰すため `replace` になる。**意図した変更**なのでテストの期待値を更新し、理由をコメントに残す |
| dnd-kit 追加で production 依存の脆弱性が増える | 追加後に確認する                                                                                                      |

## ロールバック

`@dnd-kit/*` 3 パッケージを削除し、`ingredient-row.tsx` を 3 カラムに戻す。離脱ガードは
フック・ダイアログ・2 画面の結線を外し、キャンセルと保存成功時の `router.push` 直呼びへ戻す。
新規の純関数 4 ファイルを削除する。DB・API の変更が無いためデータ側の後始末は不要。

## ドキュメント更新対象

- `docs/designs/recipe-form-usability.md`（作成済み）
- `docs/tests/recipe-form-usability.md`
