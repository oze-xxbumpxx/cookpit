# 改善候補: shopping-list-core

> reflection-agent が起票。1 タスクの振り返りから抽出した知見をまとめる。
> 設定は変更しない。昇格判断は [../../memory-policy.md](../../memory-policy.md) の昇格条件に従う。

- **task-id**: shopping-list-core
- **作成日**: 2026-07-12
- **対象タスク概要**: ShoppingList 集約の実装（L3・Codex 委譲ルート）。本ファイルは
  Task 3（Application 層）の受け入れレビュー完了時点で起票。Task 1（Domain・PR #52）/
  Task 2（Infrastructure・PR #53）はマージ済み、Task 4（api-contract）/ Task 5
  （presentation）は未着手のため、以降のセッションで事象を追記する。
- **関連成果物**: docs/tasks/codex/shopping-list-core/（指示書一式）/
  packages/application/src/shopping-list/（Task 3 実装）

## 観測した事象（複数可）

### 事象 1: 先回り注意付き指示書による Codex 初回レビュー FAIL 0

- **種類**: 成功手順
- **観測した事象**: Task 3（DTO / Mapper / エラー 3 種 / UseCase 5 本 / テスト 29 件）の
  Codex 実装が、機械チェック FAIL 0・品質ゲート全 green・指示書のテスト観点リスト全網羅で
  初回レビューを通過した。過去に頻発した識別子タイポ・結線漏れ等（Memory:
  feedback_codex_review）が 1 件も発生しなかった。`import type` はむしろ指示書サンプル
  より厳密に適用されていた（型のみ使用の `MealPlan`/`Quantity`/`StoreId` を格上げ）。
- **発生回数**: このタスク内 1 回（Codex 委譲での初回 FAIL 0 としては初観測）
- **対象タスク**: shopping-list-core Task 3
- **原因仮説**: 指示書に (a) ほぼ完全なサンプルコード、(b)「命名・記法の注意（過去の
  Codex ミス実績への先回り）」節、(c) 名前衝突（`ProductId` 二重定義）への明示注意を
  含めたことで、Codex の既知ミス型が事前に塞がれた。
- **改善案**: create-codex-brief スキルの「過去ミスへの先回り」節を成功パターンとして
  維持。複数再現（次の Codex 委譲タスクでも FAIL 0）を確認したら昇格を検討。
- **変更対象**: （まだ未定。昇格時は .claude/skills/create-codex-brief）
- **想定される副作用**: 指示書が詳細になるほど作成コストが上がる。サンプルコードの
  バグがそのまま伝播するリスク（事象 2）とトレードオフ。
- **評価方法**: 次回 Codex 委譲タスク（Task 4/5 含む）の初回レビュー FAIL/WARN 数を比較。
- **昇格判定**: Memory 留め（昇格せず・成功パターンの複数再現待ち）

### 事象 2: 指示書サンプルコードの潜在バグが実装へそのまま伝播

- **種類**: レビュー指摘
- **観測した事象**: MarkAsBoughtUseCase の catch ブロックは「try 内で投げるのは item
  未検出のみ」を前提とするが、`Money.of()`（負値で throw）が try 内で評価されるため、
  負の `actualPrice.amount` が `ShoppingItemNotFoundError` に化ける。この構造は指示書
  03-application.md §6 のサンプルコードそのままで、Codex は忠実にコピーしただけ。
  敵対的レビューパス（Memory: feedback_review_depth）で検出し、Task 4 の Zod スキーマに
  `.nonnegative()` を入れる申し送りをユーザーへ報告済み。
- **発生回数**: このタスク内 1 回
- **対象タスク**: shopping-list-core Task 3
- **原因仮説**: 指示書のサンプルコードは設計書から手で書き起こしたもので、実装コードと
  同水準の敵対的レビュー（例外パスの前提検証）を通っていない。「指示書に忠実 = 正しい」
  ではないのに、受け入れレビューの観点が指示書との一致確認に寄りやすい。
- **改善案**: create-codex-brief スキルのチェックリストに「サンプルコード自体の敵対的
  レビュー（catch の捕捉範囲・エラーパスの前提を検証）」を追加。
  review-codex-implementation 側は今回のように指示書一致とは独立の精査パスを維持。
- **変更対象**: （まだ未定。昇格時は .claude/skills/create-codex-brief）
- **想定される副作用**: 指示書作成の工数増。過剰にすると指示書作成が設計レビューの
  重複になる。
- **評価方法**: 次回 Codex 委譲で「指示書由来のバグ」が再発するかを受け入れレビューで分類。
- **昇格判定**: Memory 留め（昇格せず・単発。同種の指示書由来バグが再発したら昇格）

### 事象 3: check-codex-implementation.mjs が指示書内の識別子を WARN 誤検出

- **種類**: ツール誤検出（レビュー工数の浪費・軽微）
- **観測した事象**: 機械チェックが `generate-shopping-list.use-case.ts` の `scaled` を
  「既存コードに無い単語。"scale" のタイポの可能性」と WARN 判定。実際は指示書
  03-application.md のサンプルコード（`const scaled = recipe.scaleIngredients(...)`）
  由来の正当な識別子。スクリプトは指示書から識別子 536 件を収穫していたのに抑制され
  なかった。
- **発生回数**: このタスク内 1 回
- **対象タスク**: shopping-list-core Task 3
- **原因仮説**: identifier-typo ルールの照合辞書が「既存コミット済みコード」のみを参照し、
  指示書コードブロックから収穫した識別子リストを見ていない（収穫はシグネチャ照合用
  にのみ使われている可能性）。
- **改善案**: identifier-typo ルールの許可辞書に `--brief` 指定ディレクトリのコード
  ブロック由来識別子を含める。
- **変更対象**: （まだ未定。昇格時は .claude/scripts/check-codex-implementation.mjs）
- **想定される副作用**: 指示書自体にタイポがある場合に検出漏れとなる（指示書由来の
  タイポは事象 2 と同様、指示書作成時に潰す前提になる）。
- **評価方法**: Task 4/5 のレビューで同種 WARN（指示書内識別子の誤検出）が出るか観測。
- **昇格判定**: Memory 留め（昇格せず・再発監視。スキル備考の Tailwind WARN とは別種）

## IMP-2026-007 追跡計測

本セッションは Codex 委譲ルートの受け入れレビューのみで orchestrator を起動していない
ため計測対象外。shopping-list-core の残タスクまたは次の orchestrator 経由 L3 タスクで
再計測する（未完了のまま申し送り継続）。

## メトリクス記録

feature 進行中（Task 4/5 未着手）のため、メトリクス記録は feature 完了時のセッションで
実施する。本セッションは Subagent 呼び出しなし（レビューはメインセッションで
review-codex-implementation スキルにより実施）。

## まとめ

- 改善候補として起票したもの（→ backlog に追記した ID）: なし（proposal 化なし）
- Memory に留めたもの（昇格せず・再発監視）: 事象 1（先回り指示書の成功パターン）/
  事象 2（指示書サンプル由来バグ）/ 事象 3（機械チェックの指示書内識別子誤検出）
  — いずれも backlog 留め置き表へ追記
