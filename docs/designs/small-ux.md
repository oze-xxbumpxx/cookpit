# 設計書: small-ux

- ステータス: confirmed
- レベル: L2
- 関連: `docs/designs/recipe-form-usability.md` / `docs/tests/recipe-form-usability.md` /
  Sprint 10 タスク 4（`docs/05-roadmap.md`）

## 背景

`recipe-form-usability`（2026-07-25）でレシピ追加・編集に材料のドラッグ並べ替えと未保存離脱確認を入れた。
当時の対象外 2 件が、Sprint 7〜10 の持ち越しとして残っている。

1. **商品の追加・編集フォームに離脱確認が無い。** フックは再利用可能な形にしてあるが、適用先はレシピ 2 画面だけ。
2. **作り方の手順（steps）を並べ替えられない。** 材料と同じ行コンポーネント構造だが、当時ユーザーが「材料のみ」を選んだ。

どちらも既存 API・既存契約のまま Presentation だけで閉じる。

## 目的

- 商品フォームでも、未保存の変更があるまま画面を離れようとしたときに確認を挟む。
- レシピの作り方手順を、材料と同じ操作感でドラッグ&ドロップ（およびキーボード）で並べ替えられるようにする。

## 要件

| #   | 要件                                                                                   |
| --- | -------------------------------------------------------------------------------------- |
| P-1 | 商品追加・編集画面で、未保存の変更があるとき画面内「キャンセル」で確認ダイアログを出す |
| P-2 | 未保存の変更があるとき、ブラウザ / スワイプの戻るでも確認ダイアログを出す              |
| P-3 | 未保存の変更があるとき、ボトムナビのタブを踏んでも確認ダイアログを出す                 |
| P-4 | 変更が無ければ確認せず即座に離脱する                                                   |
| P-5 | 保存に成功した後の遷移では確認ダイアログを出さない                                     |
| S-1 | レシピ追加・編集画面で、手順の行をドラッグ&ドロップで並べ替えられる                    |
| S-2 | タッチで動作する。ドラッグ中もリストの縦スクロールを壊さない                           |
| S-3 | ドラッグ以外の代替手段（キーボード）でも並べ替えられる                                 |
| S-4 | 並べ替えた順序が保存され、詳細画面にその順で表示される                                 |

P-1〜P-5 は `recipe-form-usability` の B-1〜B-5 を商品フォームへ移植する。S-1〜S-4 は同設計の A-1〜A-4 を手順へ移植する。

## 対象範囲

`apps/web` のみ。

- 商品追加画面（`ProductFormClient`）・商品編集画面（`ProductEditFormClient`）
- レシピフォーム共通フィールド（`RecipeFormFields` / `StepRow`）

## 対象外

- 離脱ガードフック自体の再設計（`useLeaveConfirmation` / `LeaveConfirmationDialog` は**変更なし**）
- 材料の並べ替え（既存。回帰のみ）
- リロード・タブを閉じる操作のガード（`beforeunload` は入れない）
- フォント追加削減（Sprint 10 タスク 7。見た目の判断が必要）
- Domain / Application / Infrastructure / api-contract / DB（**すべて変更なし**）

## 現状構成

### 離脱確認

- `useLeaveConfirmation` と `LeaveConfirmationDialog` はレシピ new/edit にだけ結線されている。
- 商品 new/edit のキャンセルは `router.push(...)` の直呼び。保存成功も `router.push` の直呼び。
- 商品フォームの値は `ProductFormValue`（`name` / `aliasesText` / `category` / `defaultUnit`）。
  レシピ側の `isRecipeFormDirty` は商品の形を知らない。

### 手順の並べ替え

- `recipe-form-fields.tsx` の `DndContext` / `SortableContext` は `value.ingredients` のみ。
- `StepRow` は番号バッジ + textarea + 削除の 3 列で、`useSortable` を持たない。
- 手順の並び順の権威は `RecipeFormValue.steps` の配列順のみ。`buildRecipeFormBody` は空行を除いて配列順で送信する。DB は `recipes.steps` JSONB 配列。

## 変更後構成

| 対象                                                       | 変更                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `products/_utils/product-form-dirty.ts`（新規）            | 商品フォームの未保存判定（純関数）                                                         |
| `product-form-client.tsx` / `product-edit-form-client.tsx` | dirty 算出とフック・ダイアログの結線（レシピと同じ）                                       |
| `step-row.tsx`                                             | `useSortable` 対応・ドラッグハンドル列を追加                                               |
| `recipe-form-fields.tsx`                                   | 手順用の **別** `DndContext` + `SortableContext` / `moveStep` / 日本語読み上げ（「手順」） |

フック・ダイアログ・`moveArrayItem`・材料側 DnD は再利用し、新規ライブラリは追加しない。

## データフロー

```
[商品フォーム]
初期スナップショット（useState 初期化関数）
  → isProductFormDirty(initial, current)
  → useLeaveConfirmation({ dirty, fallbackHref })
[キャンセル / ブラウザバック / ボトムタブ]
  → dirty ? ダイアログ : 即離脱
[保存成功]
  → leave.leaveAfterSave(href)
```

```
[手順のドラッグ or ↑↓キー]
  → handleStepDragEnd / moveArrayItem
  → updateValue({ steps })
  → 保存時は buildRecipeFormBody が配列順に走査 → API へ配列順で送信
```

## API 設計

**変更なし。**

## DB 設計

**変更なし。**（手順の順序は `recipes.steps` JSONB 配列の順序で表現済み）

## フロントエンド設計

### A. 商品フォームの離脱確認

レシピと同じ結線。差分は dirty 判定の入力形だけ。

**dirty 判定**（`product-form-dirty.ts`）

初期値スナップショットとの正規化比較。変更フラグ方式は採らない（入力して消して元に戻したときに誤検知するため）。

| フィールド    | 正規化                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `name`        | `trim()`                                                                                         |
| `aliasesText` | 送信と同じ分割（`,` で split → trim → 空要素除去）。空白や余分なカンマだけの差は変更と見なさない |
| `category`    | そのまま                                                                                         |
| `defaultUnit` | そのまま                                                                                         |

別名の**並び順の差は変更と見なす**（送信配列の順序が変わるため）。

スナップショットは `useState` の初期化関数で保持する。`useRef` は `react-hooks/refs` がレンダー中の読み取りを禁止するため使わない（レシピ側と同じ）。

キャンセルは `leave.requestLeave`、保存成功は `leave.leaveAfterSave`。遷移先は既存どおり（新規: `/products`、編集: `/products/:id`）。

ダイアログ文言はレシピと同一（「本当に戻りますか？」「入力した内容は保存されません。」）。画面種別で分岐しない。

### B. 手順の並べ替え

材料の実装を手順へコピーする。ライブラリは既存の `@dnd-kit/core` / `@dnd-kit/sortable` / `@dnd-kit/utilities`。

**別 `DndContext` にする理由**

材料と手順を 1 つの `DndContext` に入れると、材料を手順の上へドロップしたときに衝突判定が混ざる。id 接頭辞（`ingredient-` / `step-`）は衝突しないが、ドロップ先のリストを制限する分岐が要る。兄弟の `DndContext` ならリストが物理的に分離される。

ハイドレーション不一致を避けるため、手順側も `useId()` で `DndContext` の `id` を渡す（材料側と同じ理由）。

**センサー**

材料側と同じ。`PointerSensor`（`activationConstraint: { distance: 8 }`）+ `KeyboardSensor`（`sortableKeyboardCoordinates`）。`TouchSensor` は併用しない。

キーボードセンサーはフォーカス中のハンドルに対してだけ活性化するため、兄弟 `DndContext` が 2 つあっても Space が二重に掴むことはない（材料側の実績と同じ API）。

**スクロール競合（S-2）**

`touch-none` は**ドラッグハンドルにだけ**当てる。行全体・リストコンテナ・番号バッジ・textarea には当てない。

**配置**

`StepRow` のグリッドを `grid-cols-[28px_28px_minmax(0,1fr)_36px]` の 4 列にする。

| 列  | 内容                                                                   |
| --- | ---------------------------------------------------------------------- |
| 1   | `GripVertical` のハンドル（`touch-none` / `useSortable` の listeners） |
| 2   | 既存の番号バッジ（見た目の手順番号。ドラッグ対象にしない）             |
| 3   | 手順 textarea                                                          |
| 4   | 削除ボタン                                                             |

番号バッジをハンドルに兼ねない。番号は並べ替え後に `index + 1` で再描画される見た目であり、掴む対象を材料と揃える。

`aria-label` は説明があれば `「切る」を並べ替え`、空なら `N番目の手順を並べ替え`。

縦方向だけ追従する（`transform.x` を 0 に潰す）。材料行と同じ。

**読み上げ**

材料用の `REORDER_ANNOUNCEMENTS` は「材料」固定のまま残す。手順用に「手順」へ差し替えた `Announcements` を別 `DndContext` へ渡す。共通の位置計算（`sortablePosition`）は共有してよい。

**`moveStep`**

`handleStepDragEnd` を `addStep` / `removeStep` の隣に置き、`moveArrayItem` で並べ替えて `updateValue({ steps })` する。完全制御の構造は崩さない。

行の `key` / sortable id は既存の `step.id`（`step-${n}` の単調増加）を使う。

## バックエンド設計

**変更なし。**

## エラー処理

外部 I/O を伴わない UI 変更のため、リトライ・タイムアウト・冪等性・部分失敗・フォールバックの 5 項目は**対象外**。保存失敗時はガードを解除しないため、続くキャンセル操作で確認ダイアログが出る。

## ログと監視

**対象外。**

## セキュリティ

**対象外**（認証なし・入力経路の変更なし）。

## 性能

dnd-kit はレシピフォームに既に入っている。商品フォームへは離脱確認のみで、バンドル追加はほぼ無い。**追加の最適化は対象外。**

## テスト方針

`docs/tests/small-ux.md` を正とする。要点:

- dirty 判定は純関数として全分岐を固定する。
- 離脱ガードのフック自体は既存テスト（`LG-*`）で固定済み。本件は商品 2 画面への結線を RFC と同じ観点で確認する。
- 手順のポインタドラッグは happy-dom では測れない。材料側と同じ `getBoundingClientRect` スタブ + キーボード操作で結線を固定する。
- タッチのスクロール競合は実画面確認（自動テストで代替できない）。

## 移行とリリース

DB・API の変更が無いため移行手順は**不要**。

## リスク

| リスク                                             | 対策                                                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 兄弟 `DndContext` でキーボード操作が二重活性化する | フォーカス中のハンドルだけが活性化する既存 API に依存。RTL で手順を動かしたあと材料順が変わらないことを固定する |
| 手順ハンドル追加でモバイル幅が窮屈になる           | ハンドル 28px は材料と同じ。実画面で textarea が潰れないことを確認する                                          |
| 商品 dirty が別名の空白差で過剰ガードする          | 送信と同じ split/trim/filter で正規化する                                                                       |
| レシピ側の離脱確認・材料 DnD を壊す                | 既存 RFC / RFF / RFD を回帰として回す                                                                           |

離脱ガードの Next.js `pushState` 依存は `recipe-form-usability` の申し送りを踏襲する。本件で方式は変えない。

## 未決事項

なし。対象（商品離脱確認・手順並べ替え）・方式（既存フック / 既存 dnd-kit のコピー）は 2026-07-25 以降の持ち越しとして確定している。
