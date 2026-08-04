# Sprint 1：ビジュアルデザインシステム（温かいキッチン）実装指針

Codex への実装指示書。実装後は必ず Claude Code でレビューを受けること。

**目的**：アプリ全体の視覚的な質感を「温かいキッチン（Warm Kitchen）」方向に統一する。現状は shadcn 標準のグレー（OKLCH）テーマ＋画面側が `zinc-*` を直接ハードコードしており、機能優先で素っ気ない。デザイントークンを定義し直し、画面のハードコード色をセマンティックトークンへ移行する。

**この指針はビジュアル（色・質感）専用**。レイアウト構造・機能・ドメイン/API は変更しない。

---

## 方針（決定事項）

- 方向性：**温かいキッチン**（クリーム背景＋テラコッタ＝朱のアクセント、ハーブグリーンの補助色）。家庭レシピのデジタル化に合う、食欲をそそる温かみ・生活感。
- 実現方法は2層：
  1. **`globals.css` のトークン張り替え**（CSS 変数＝`--background` 等）。shadcn コンポーネント（button / input / textarea）はこのトークンを参照しているため、ここを変えるだけで自動的に追従する。
  2. **画面の `zinc-*` / `white` / `amber-*` ハードコードをセマンティックトークンへ移行**（一覧・フォーム・詳細）。下記「移行マッピング」に従う。
- **ダークモードは今回スコープ外**（画面が light 色を直書きしており現状ダーク非対応）。`.dark` は既存のまま据え置き、別途「温かいダーク」を後日。
- フォント差し替え（見出し用書体）は今回スコープ外（色・余白・角丸・質感に集中）。

---

## デザイントークン（温かいキッチン・light）

`apps/web/src/app/globals.css` の `:root` を以下に置き換える。色は hex で指定してよい（Tailwind v4 / CSS 変数は hex を受け付け、`/80` `/50` 等の不透明度修飾も `color-mix` で機能する）。既存の OKLCH 表記に揃えたい場合は後日変換でよい（機能上は hex で問題ない）。

| トークン（CSS 変数）     | 値        | 用途                                         |
| ------------------------ | --------- | -------------------------------------------- |
| `--background`           | `#FAF6F0` | アプリ背景（クリーム）                       |
| `--foreground`           | `#3D3630` | 本文・見出し（温かい黒）                     |
| `--card`                 | `#FFFFFF` | カード・入力・面                             |
| `--card-foreground`      | `#3D3630` | カード上の文字                               |
| `--popover`              | `#FFFFFF` | ダイアログ・ポップオーバー面                 |
| `--popover-foreground`   | `#3D3630` | 同上の文字                                   |
| `--primary`              | `#D8552F` | 主要 CTA・選択中（テラコッタ／朱）           |
| `--primary-foreground`   | `#FFFFFF` | primary 上の文字                             |
| `--secondary`            | `#F1E8DB` | 控えめな面・未選択チップ背景                 |
| `--secondary-foreground` | `#3D3630` | secondary 上の文字                           |
| `--muted`                | `#F1E8DB` | 補助面（連番丸・薄い背景）                   |
| `--muted-foreground`     | `#8A7F73` | 補助文字（任意・ヒント）                     |
| `--accent`               | `#FBEDE6` | テラコッタ・ソフト（淡いハイライト／ホバー） |
| `--accent-foreground`    | `#B8431F` | accent 上の濃いテラコッタ文字                |
| `--destructive`          | `#C0392B` | 削除など破壊的（赤。primary の朱と差別化）   |
| `--border`               | `#ECE3D6` | 境界線（温かい）                             |
| `--input`                | `#E4D9C9` | 入力フィールドの境界（やや濃いめ）           |
| `--ring`                 | `#D8552F` | フォーカスリング（テラコッタ）               |
| `--radius`               | `0.75rem` | 角丸を少しやわらかく（10px → 12px）          |

**補助色（ハーブグリーン・任意）**：特定タグ（例：`作り置き向き` / `冷凍可`）のチップに使う場合のみ。core トークンには加えず、画面側で直接クラス指定でよい。

- 緑：`#5B7551` ／ ソフト面：`#E9EFE5`

> `--chart-*` / `--sidebar-*` は現状この MVP で未使用。今回は触らない（必要になったら別途）。`@theme inline { ... }` のマッピング部は変更不要（変数名はそのまま、値だけ `:root` で変わる）。

---

## 移行マッピング（画面の `zinc-*` → トークン）

一覧・フォーム・詳細の各 Client Component / カードで、ハードコードされた色クラスを以下へ機械的に置換する。**レイアウト・余白・サイズ（`h-11` `gap-*` `grid-cols-*` など）は変えない。色だけ。**

| 現状（ハードコード）                                              | 置換後（トークン）                         | 備考                                           |
| ----------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------- |
| `bg-zinc-50`（画面背景）                                          | `bg-background`                            |                                                |
| `bg-white`（カード・入力面）                                      | `bg-card`                                  |                                                |
| `text-zinc-900`                                                   | `text-foreground`                          |                                                |
| `text-zinc-800` / `text-zinc-700`                                 | `text-foreground`                          | 必要なら `text-foreground/80`                  |
| `text-zinc-600` / `text-zinc-500`                                 | `text-muted-foreground`                    | ヒント・補助                                   |
| `border-zinc-200` / `border-zinc-300`                             | `border-border`                            | 入力は `border-input`                          |
| `bg-zinc-100`（連番丸・薄背景）                                   | `bg-muted`                                 |                                                |
| `bg-zinc-900 text-white`（選択中チップ／倍量選択）                | `bg-primary text-primary-foreground`       | 選択状態＝テラコッタ                           |
| `border-zinc-900`（選択中の枠）                                   | `border-primary`                           |                                                |
| `hover:bg-zinc-50`                                                | `hover:bg-muted`                           |                                                |
| `hover:text-zinc-900`                                             | `hover:text-foreground`                    |                                                |
| `bg-amber-100 text-amber-800`（カード第一タグ）                   | `bg-accent text-accent-foreground`         | テラコッタ・ソフト                             |
| `bg-zinc-100 text-zinc-600`（カード以降タグ）                     | `bg-secondary text-muted-foreground`       |                                                |
| エラーの `text-red-600` / `bg-red-50 border-red-200 text-red-700` | そのまま可（または `text-destructive` 系） | フォームのバリデーションエラーは現状維持でよい |

### チップ（タグ）の統一ルール

- **未選択（トグル可・フォーム）**：`border-border bg-secondary text-secondary-foreground hover:bg-muted`
- **選択中（トグル・フォーム）**：`bg-primary text-primary-foreground`
- **表示専用（一覧カード・詳細）**：第一タグ `bg-accent text-accent-foreground`、以降 `bg-secondary text-muted-foreground`

---

## 対象ファイル

```
更新（globals）
apps/web/src/app/globals.css                                   # :root トークン張り替え

更新（画面：zinc → トークン移行）
apps/web/src/app/recipes/_components/recipe-list-client.tsx
apps/web/src/app/recipes/_components/recipe-card.tsx
apps/web/src/app/recipes/_components/tag-filter.tsx
apps/web/src/app/recipes/new/_components/recipe-form-client.tsx
apps/web/src/app/recipes/new/_components/ingredient-row.tsx
apps/web/src/app/recipes/new/_components/step-row.tsx

確認のみ（基本は自動追従）
apps/web/src/components/ui/button.tsx / input.tsx / textarea.tsx  # トークン参照済み。原則編集不要
```

> 詳細画面（`/recipes/[id]`、`docs/tasks/archive/sprint1-recipe-ui-detail.md`）が**この指針より後に実装される場合**は、詳細画面は最初から本トークン（`bg-background` / `text-foreground` / `bg-primary` 等）で実装すること。先に実装済みなら同じ移行マッピングを適用する。

---

## ステップ

1. **`globals.css` の `:root` を上記トークンへ置き換え**。`@theme inline` ブロックと `.dark` は触らない。
2. `pnpm --filter @cookpit/web dev --webpack` で起動し、ボタン・入力・背景が温かい色に変わったことを確認（shadcn コンポーネントは自動追従）。
3. **画面の `zinc-*` / `white` / `amber-*` を移行マッピングで置換**。1ファイルずつ、レイアウトは変えず色だけ。
4. チップ（タグ）を統一ルールに合わせる。
5. 各画面を 375px で目視確認（背景＝クリーム、CTA＝テラコッタ、境界＝温かいベージュ、選択状態＝朱）。

---

## 型チェック・動作確認

```bash
pnpm --filter @cookpit/web type-check
pnpm --filter @cookpit/web lint
pnpm --filter @cookpit/web dev --webpack
```

ブラウザで以下を確認：

- アプリ背景がクリーム（`#FAF6F0`）、カードが白で温かい境界線
- 「保存」「材料を追加」等の主要ボタン・選択中チップ・倍量選択がテラコッタ（朱）
- フォーカスリングがテラコッタ
- 一覧カードの第一タグがテラコッタ・ソフト、以降が控えめなベージュ
- 削除ボタン（詳細）が赤系で、primary の朱と区別できる
- 375px でコントラスト・可読性が確保され、レイアウトが崩れない

---

## 共通の注意事項

- **色だけ変える。レイアウト・余白・サイズ・機能・ロジックは一切変えない**（スコープ厳守）。
- `any` / 型アサーション禁止、デフォルトエクスポート禁止、`import type`、`===`/`!==`、「値なし」は `null`。
- ハードコード色の置き残し（`zinc-` `amber-` `bg-white` の取りこぼし）が無いか grep で確認：
  ```bash
  grep -rn "zinc-\|amber-\|bg-white" apps/web/src/app/recipes
  ```
  （意図的に残すものがあればコメントで理由を書く。原則ゼロを目指す）
- コントラスト：`muted-foreground (#8A7F73)` は補助文字専用。本文・重要情報には使わない（可読性確保）。

---

## 完了条件

- [ ] `globals.css` の `:root` が温かいキッチンのトークンに置き換わっている（`@theme inline` / `.dark` は不変）
- [ ] 一覧・フォーム（＋実装済みなら詳細）の `zinc-*` / `white` / `amber-*` がトークンへ移行済み
- [ ] タグチップが統一ルールに従っている
- [ ] shadcn コンポーネント（button/input/textarea）は編集せずトークン追従のみ
- [ ] `pnpm --filter @cookpit/web type-check` / `lint` が通る
- [ ] 375px で背景クリーム・CTA テラコッタ・可読性 OK
- [ ] ハードコード色の取りこぼしが無い（grep 確認）
- [ ] 実装後に Claude Code へレビュー依頼

---

## レビュー観点（Claude Code 用・Codex 生成の頻出ミス）

- Tailwind クラス名のタイポ（`bg-bacground` 等）
- 移行漏れ（`zinc-` `amber-` `bg-white` の置き残し）＝ grep で機械確認
- レイアウト・サイズまで変えていないか（色以外を触っていないか diff で確認）
- コントラスト不足（`muted-foreground` を本文に使う・薄い文字が読めない）
- `globals.css` の `@theme inline` や `.dark` を誤って変更していないか
- 選択中／未選択のチップ状態が視認できるか（primary と secondary の差）

---

## このタスクのスコープ外

- ダークモードの温かい配色 — 後日（画面が light 直書きのため現状ダーク非対応）
- 見出し用フォントの差し替え — 後日
- アイコン・イラスト・写真サムネイル — MVP1 不要（サムネは Phase で別途）
- レイアウト・情報設計の変更 — 本指針は色のみ
