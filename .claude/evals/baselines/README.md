# baselines

回帰評価のベースラインスコア（スナップショット）を置く。**現行ベースラインは常にこの
README で宣言する**（ファイル名の新旧が直感に反するため。素の `INDEX.md` が最古）。

## 現行ベースライン

- **`INDEX-2026-06-25.md`**（commit 5c385fe / post-IMP-2026-005）← 比較の起点はこれ

## 履歴チェーン（古い順）

1. `INDEX.md` — 2026-06-24 / commit 2258bd5（初回・pre-Phase2/3）
2. `INDEX-2026-06-24-post-phase3.md` — 2026-06-25 / commit 89003b8（Phase2/3 + IMP-001/002 後）
3. `INDEX-2026-06-25.md` — 2026-06-25 / commit 5c385fe（IMP-003/004/005 + Vitest/Playwright 後）

## 運用ルール

- 再採点したら `INDEX-<date>[-<label>].md` を新規追加し、この README の「現行」を差し替える。
- 旧スナップショットは results/ や improvements/ から名前参照されるため、**改名・移動しない**。
