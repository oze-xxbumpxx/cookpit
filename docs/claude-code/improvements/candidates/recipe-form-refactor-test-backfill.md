# 改善候補: recipe-form-refactor-test-backfill

> reflection 相当の振り返り（メインセッションで起票）。1 タスクの振り返りから抽出した知見をまとめる。
> 設定は変更しない。昇格判断は [../../memory-policy.md](../../memory-policy.md) の昇格条件に従う。

- **task-id**: recipe-form-refactor-test-backfill
- **作成日**: 2026-07-18
- **対象タスク概要**: 全体監査で判明したレシピ new/edit フォーム重複（約 9 割）の共通化と、
  RTL テスト導入以前の recipes / products 系画面へのテスト補充（L2）
- **関連成果物**: `docs/designs/recipe-form-refactor-test-backfill.md` /
  `docs/implementation-plans/recipe-form-refactor-test-backfill.md` /
  `docs/tests/recipe-form-refactor-test-backfill.md` /
  `apps/web/src/app/recipes/_components/recipe-form-fields.tsx`

## 観測した事象（複数可）

### 事象 1: number input のカスタムバリデーション分岐が UI から到達不能（実装知見）

- **種類**: テスト失敗からの学び（実装のデッドコード発見）
- **観測した事象**: RFC-03（基準人数 0 でカスタムエラー表示）が通らない。調査の結果、
  `type="number" min="1"` の入力に 0 を入れると **ブラウザ（happy-dom も同様）の
  native constraint validation が form submit 自体をブロック**するため、
  `buildCreateInput()` 内の `parsedBaseServings <= 0` 分岐（エラーメッセージ
  「基準人数は1以上の数値で入力してください。」）へは UI 操作では到達できない。
  `price-record-form.tsx` の価格・内容量バリデーションも同構造
- **発生回数**: 2（recipe new フォーム / price-record-form）
- **対象タスク**: recipe-form-refactor-test-backfill
- **原因仮説**: フォーム実装時に native 制約（min/step）とクライアント側カスタム検証を
  二重に実装し、native 側が先に効くことを確認していなかった
- **改善案**: 新規フォーム実装時のチェック観点として「number input は native 制約と
  カスタム検証のどちらが効くかを確認し、二重実装を避ける」を implementer / reviewer の
  観点に追加するか、Memory 留めにする。既存のデッドコード分岐の削除は別タスクとして起票
  （挙動に害はないため急がない）
- **変更対象**: （昇格するなら）`.claude/agents/reviewer.md` のチェック観点 1 行
- **想定される副作用**: なし（観点追加のみ）
- **評価方法**: 次回フォーム実装タスクで同種の二重実装が入らないこと
- **昇格判定**: Memory 留め（2 箇所で確認したが同一起源。次のフォーム実装で再発したら proposal）

### 事象 2: happy-dom の既知制約 2 件でテストが書けない操作がある（テスト実装知見）

- **種類**: テスト失敗からの学び（環境制約）
- **観測した事象**:
  1. `user.clear()` が number input に効かない（選択 API が type=number に無いため。
     silent に失敗し値が残る）→ `fireEvent.input(el, { target: { value: ... } })` で代替
  2. `step="0.1"` の step 判定が浮動小数点誤差で壊れており、有効値（内容量 300 等）も
     invalid 扱いになり click 経由の submit がブロックされる → `fireEvent.submit(form)` で代替
- **発生回数**: 各 1
- **対象タスク**: recipe-form-refactor-test-backfill
- **原因仮説**: happy-dom の実装制約。jsdom と挙動が異なる部分が number input 周りに集中している
- **改善案**: apps/web のコンポーネントテストで number input を扱う際の代替パターン
  （fireEvent.input / fireEvent.submit + 理由コメント）を Memory または
  e2e-test-implementer / implementer の参照知識に還流する
- **変更対象**: （昇格するなら）Auto Memory。テストコード内には理由コメントを残置済み
- **想定される副作用**: なし
- **評価方法**: 次回 number input を含むコンポーネントテスト実装で同じ調査を繰り返さないこと
- **昇格判定**: Memory 留め（再発したら Skill/Rule 化を検討）

### 事象 3: 「テスト先行 → リファクタ → テスト補充」の 3 Step 分割が手戻りゼロで機能（成功手順）

- **種類**: 成功手順
- **観測した事象**: B（安全網の単体テスト）→ 1（共通化）→ A（RTL 補充）の順で独立コミットに
  分割した結果、リファクタ（563 行削除・409 行追加）が既存 215 テスト + 新規 17 テストの
  回帰ゼロで完了。products の `product-form-fields.tsx` という既存先例パターンへ揃えたことで
  設計判断も最小化できた
- **発生回数**: 1
- **対象タスク**: recipe-form-refactor-test-backfill
- **原因仮説**: 既存先例パターンの踏襲 + 挙動固定テスト先行が効いた
- **改善案**: リファクタ系タスクの標準手順として「①対象ロジックの挙動固定テスト → ②リファクタ →
  ③テスト拡充、Step ごとに独立コミット」を Memory に残す
- **変更対象**: Auto Memory（設定変更なし）
- **想定される副作用**: なし
- **評価方法**: 次回リファクタ系タスクで同手順が再利用されること
- **昇格判定**: Memory 留め（リファクタ系タスクの 2 例目で Skill 化を検討）

## レビュー記録について

L2 のため reviewer 専用文書（docs/reviews/）は作成対象外。検証は品質ゲート
（lint / type-check / 全パッケージ test）と、送信 JSON 固定アサーション付き RTL テストで実施
（`docs/tests/recipe-form-refactor-test-backfill.md` 完了条件を満たす）。
