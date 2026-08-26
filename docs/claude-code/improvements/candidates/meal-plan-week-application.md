# 改善候補: meal-plan-week-application

> reflection-agent が起票。1 タスクの振り返りから抽出した知見をまとめる。
> 設定は変更しない。昇格判断は [../../memory-policy.md](../../memory-policy.md) の昇格条件に従う。

- **task-id**: meal-plan-week-application
- **作成日**: 2026-08-26
- **対象タスク概要**: 週計算ロジックを Presentation → Application へ移動（構造のみ・挙動不変）。
  L2。`meal-plans/page.tsx` / `history/page.tsx` の `import { WeekIdentifier } from '@cookpit/domain'`
  漏れを解消し、Application 純関数 `currentWeekIdentifier` / `resolveMealPlanWeekQuery` を追加。
  土曜スナップは Domain に残置。
- **関連成果物**: [PR #191](https://github.com/oze-xxbumpxx/cookpit/pull/191)（base main、PR #190 後）/
  `docs/claude-code/improvements/metrics/meal-plan-week-application.yml`

## 観測した事象（複数可）

### 事象 1: 新規追加した Markdown 表が prettier の CI `format:check` で落ちる（再発・累計 7 回相当）

- **種類**: レビュー指摘（BLOCK B-01）
- **観測した事象**: 本ブランチが作成した Markdown 表が prettier の列幅整形に合わず、CI の
  `pnpm format:check` が FAIL した。`pnpm format` を実行して解消。
- **発生回数**: このタスクで 1 回。ただし「Markdown 表が prettier 整形に合わず `format:check` が
  落ちる」という**症状そのもの**は、git 履歴上すでに 6 回の専用 style 修正コミットが確認できる
  （`77a4b29` style: format markdown tables that fail CI format:check / `6f4d668` / `9c69b7a` /
  `f4c3471` / `4b66ca8` / `8cbf53d`）。今回の修正コミット（`0bcc1a8` style: 週計算ドキュメントの
  format と JSDoc を直す）を含めると**累計 7 回相当**。
- **対象タスク**: meal-plan-week-application（過去分は上記コミットの対象タスク・PR に分散）
- **原因仮説**: Markdown 表を人手（または implementer）で書くと、セル幅・区切り線の書式が
  prettier の正規化結果と一致しないことが構造的に起きやすい。CI の `format:check` はコミット後
  にしか検出できず、事前に `pnpm format` を実行する手順がワークフロー上で明示・強制されていない。
- **改善案**: 表を含む Markdown を新規作成・変更した場合、コミット前に `pnpm format` を実行する
  ことを quality-gates skill または implementer の完了条件チェックリストに明記する（可能なら
  lefthook pre-commit / Stop hook 側で自動 `prettier --write` するのが最も再発を防ぐ）。
- **変更対象**: `.claude/skills/quality-gates/SKILL.md`（format 実行の明記）または
  `.claude/scripts/run-quality-gates.sh` / lefthook 設定（人間承認必須の範囲は manager が判断）
- **想定される副作用**: pre-commit で自動整形すると、意図しない箇所まで prettier が書き換える
  リスク（harness-portability 事象 3 で観測済みの「`_` が `*` に化ける」等の変質）。整形後の
  目視確認をセットで求める必要がある。
- **評価方法**: 次の L2/L3 タスクで Markdown 表を含む差分がある場合、`format:check` が
  初回コミットから FAIL せずに通るか（または `pnpm format` 実行がワークフロー上で確実に
  実施されたか）を確認する。
- **昇格判定**: **昇格条件を満たす**（同じ問題が 3 回以上再発）。symptom は繰り返しているが
  対策は毎回その場限りの style 修正コミットで終わっており、恒久対策（自動化またはチェック
  リスト化）が未着手のため、改善候補として起票する。

---

### 事象 2: implementer が自分の変更ファイルの format 失敗を「未変更ドキュメントの PRE_EXISTING」と誤報告した

- **種類**: レビュー指摘（BLOCK B-01 の付随観察）/ Agent 間認識不一致
- **観測した事象**: 事象 1 の format:check FAIL に対して、implementer は「未変更ドキュメントの
  PRE_EXISTING（今回の差分が導入していない問題）」と報告した。reviewer が `origin/main` の同一
  ファイルを確認したところ PASS しており、実際には本ブランチが追加・変更した内容が原因だった
  ことが判明し BLOCK とした。
- **発生回数**: この誤報告のパターン（自分の変更を PRE_EXISTING と主張し reviewer が
  `origin/main` diff で反証する）は、このタスクで初回確認。ただし「自己診断・自己申告の誤り」
  という広いテーマ自体は本プロジェクトで複数回観測済み（
  `price-record-edit-and-store-rename` 事象 2・4: `it.each` 範囲表記が grep 追跡を破壊し Must
  級欠落を誤報告 / `product-detail-performance` 事象 3: `.next` キャッシュ残存を新 UseCase の
  欠陥と誤診しかけた・事象内 grep `-rho` 誤判定）。個別の誤診断メカニズムは毎回異なるため、
  同一問題としての 3 回条件には未到達と判断する。
- **対象タスク**: meal-plan-week-application（関連テーマの過去分: price-record-edit-and-store-rename,
  product-detail-performance）
- **原因仮説**: `reviewer.md` には「候補を指摘へ昇格する前に、今回の差分が導入した問題か確認する」
  という原則があるが、これは reviewer 側の受け入れ判定の原則であり、implementer が自分の変更を
  `PRE_EXISTING` と自己申告する際に同じ確認（`git diff` や `origin/<base>` との比較）を行う
  手順としては明文化されていない。今回は reviewer がその原則どおり検証して正しく BLOCK した
  ため実害には至らなかった（品質ゲートが正常に機能したケース）。
- **改善案**: 実装者が「これは PRE_EXISTING/対象外」と主張する場合は、`origin/<base ブランチ>`
  の同一ファイル・同一チェックの結果を根拠として示す（diff またはコマンド出力）ことを求める
  一文を追加できるか検討する。ただし現時点では単発かつ reviewer が正しく機能した事例のため、
  即時の変更は見送り再発監視とする。
- **変更対象**: （まだ未定）implementer Subagent Memory、または `.claude/agents/reviewer.md` /
  `review-codex-implementation` skill の PRE_EXISTING 判定手順に「申告側の根拠提示」を追記
- **想定される副作用**: PRE_EXISTING 主張のたびに根拠提示を求めると、明らかに対象外な既知の
  issue（例: 既存 lint warning）でも手順が増え、implementer の完了報告コストが上がる。
- **評価方法**: 次回 PRE_EXISTING 主張が発生したタスクで、reviewer の反証が必要になったか
  （＝ implementer の自己申告が正しかったか）を確認する。
- **昇格判定**: Memory 留め（昇格せず）。この具体的な誤診断パターンは初回。広いテーマ
  （自己申告・自己診断の誤り）としては 3 件目相当だが、原因メカニズムが毎回異なるため
  当面は各 Agent の Subagent Memory に留め、次に同型（PRE_EXISTING 主張が反証される）が
  起きたら昇格を検討する。

---

### 事象 3: 設計書の技術的前提の誤り（`2026-02-30` は Invalid Date）を test-designer が実行環境の実測で検出

- **種類**: 成功手順 / 設計書の事実誤り（レビュー指摘に至る前に検出）
- **観測した事象**: 設計書は「`2026-02-30` は Invalid Date になる」という前提を記載していたが、
  実際には V8（Node.js/ブラウザの JS エンジン）はこの入力を overflow 処理し、有効な日付
  （3 月相当）へ繰り上げる。設計書のまま実装・試験を進めていれば誤った期待値のテストになる
  ところを、test-designer が実装前にこの前提を検証し、`MPWQ-14`（`2026-99-99` など本当に
  Invalid Date になる入力）と `MPWQ-15`（`2026-02-30` の overflow 挙動を明示的に期待値化する
  入力）にテスト ID を分離した。
- **発生回数**: このタスクで 1 回。類似テーマ（設計書の記述を前提にせず実環境で検証する重要性）
  は `expiry-alert` の振り返りでも「設計書の記述を前提にせず実コードを当たること」という
  教訓として記録済み。
- **対象タスク**: meal-plan-week-application（関連: expiry-alert の教訓が今回実践された）
- **原因仮説**: 設計書作成時に日付境界値の挙動を実行環境で確認せず、一般的な直感（越境日付は
  Invalid になるはず）で記述してしまった。test-designer が実装前の段階で実行環境（V8）の
  実測を優先したため、実装への伝播前に訂正できた。
- **改善案**: create-design-document / create-test-plan の境界値記述では、日付・数値の
  overflow・parse 挙動などランタイム依存の前提を書く場合、実測（`node -e` 等）で確認したことを
  明記する運用を維持・強化する（既に今回機能した手順を一般化する）。
- **変更対象**: なし（今回は正常に機能した手順。既存の `expiry-alert` の教訓と重複するため
  新規の Skill 変更は提案しない）
- **想定される副作用**: なし
- **評価方法**: 次回、日付・数値境界を含む設計書がある場合、test-designer が実行環境で実測を
  行ったかを確認する。
- **昇格判定**: Memory 留め（昇格せず）。成功パターンとして記録。`expiry-alert` の教訓が
  再現した 2 例目であり、今後も再現すれば「境界値の前提は実測して設計書に残す」を
  create-test-plan Skill に明文化する候補として昇格を検討する。

---

### 事象 4: JSDoc の言語不統一と Why コメント欠落（FOLLOW_UP F-01・解消済み）

- **種類**: レビュー指摘（FOLLOW_UP）
- **観測した事象**: 新規追加した Application 純関数の JSDoc が英語で書かれていたが、既存の
  Application 層のコメントは日本語である。加えて `R-1`（`asOf` を 1 度だけ評価する設計判断）の
  Why が JSDoc に書かれていなかった。reviewer の FOLLOW_UP 指摘を受けて日本語化し、Why を
  追記して解消した。
- **発生回数**: このタスクで 1 回
- **対象タスク**: meal-plan-week-application
- **原因仮説**: implementer（GPT-5.6 Luna high）が既存コードベースのコメント言語規約
  （日本語）を確認せず、モデルの既定言語（英語）で JSDoc を生成した。
- **改善案**: implementer への委譲指示、または Subagent Memory に「このプロジェクトの
  コメント・JSDoc は日本語で統一する（既存コードを確認して倣う）」を残す。
- **変更対象**: implementer Subagent Memory（コメント言語規約）
- **想定される副作用**: なし
- **評価方法**: 次回タスクで新規追加コードの JSDoc/コメントが日本語で書かれているかを確認する。
- **昇格判定**: Memory 留め（昇格せず）。初回確認。次回同種指摘で昇格を検討する。

---

### 事象 5: L2 の security-reviewer 省略判断と docs/reviews handoff 機構が想定どおり機能した（既存対策の実地確認）

- **種類**: 成功手順（既存改善の実地確認）
- **観測した事象**:
  1. security-reviewer は「契約・DB・認証・依存なし、query 検証の移動のみ」という
     IMP-2026-016 の省略条件（Presentation のみ・契約不変リファクタは省略可）に沿って L2 で
     省略された。
  2. docs/reviews が未作成のまま進みかけた（F-02）が、Orchestrator が handoff packet を追加し、
     handoff-check が exit 0 で通過した（IMP-2026-020/026 の対策が機能）。
- **発生回数**: このタスクで各 1 回。いずれも既に `accepted` 済みの改善（IMP-2026-016,
  IMP-2026-020, IMP-2026-026）の実地確認であり、新規事象ではない。
- **対象タスク**: meal-plan-week-application
- **原因仮説**: N/A（正常フロー・既存対策の実地確認）
- **改善案**: N/A
- **変更対象**: なし
- **想定される副作用**: なし
- **評価方法**: N/A（確認のみ）
- **昇格判定**: Memory 留め（昇格せず）。新規の改善候補ではなく、既存改善が機能した記録として
  残す。

---

### 事象 6: Task ツールが Subagent slug 経由で `effort=max` を渡せず `gpt-5.6-luna-high` にフォールバックした

- **種類**: Agent 間認識不一致（ツール制約） / メタ観察
- **観測した事象**: `implementation-default-model.mdc` の既定は `gpt-5.6-luna[effort=max]` だが、
  Task ツールが slug 必須で `effort=max` を渡せないため、ルールが定めるフォールバック
  `gpt-5.6-luna-high` を使用し、報告に「Max ではなく high」と明記した。ルール自体がこの
  例外を想定済みであり、手順どおりに処理された。
- **発生回数**: このタスクで 1 回。ルールに明記されたフォールバックのため、他タスクでも
  同様に発生している可能性が高いが、reflection candidate としての記録は今回が初回。
- **対象タスク**: meal-plan-week-application
- **原因仮説**: Task ツールの現在の実装が Subagent 起動時に `effort` パラメータを個別指定できず、
  slug 名にモデル・effort 情報を埋め込む方式に制約されている（ツール側の制約であり、
  このリポジトリの設定では解決できない）。
- **改善案**: 現時点では改善案なし（ツール制約側の問題）。もしこのフォールバックが高頻度で
  発生し Max との性能差が実害として観測されるなら、Task ツール統合側の改善余地として
  別途記録する。
- **変更対象**: なし（このリポジトリの設定・Agent 定義では対応不可）
- **想定される副作用**: なし
- **評価方法**: 今後のタスクで `gpt-5.6-luna-high` フォールバックの発生頻度と、Max 使用時との
  品質差（レビュー指摘件数等）を比較できると望ましい（現状は比較データなし）。
- **昇格判定**: Memory 留め（昇格せず）。ルールが既に例外として想定済みの挙動であり、
  新規の改善対象ではない。頻度監視のためだけに記録する。

## まとめ

- 改善候補として起票したもの（→ backlog に追記した行）:
  - 事象 1: Markdown 表の prettier 整形崩れによる `format:check` 失敗（累計 7 回相当・
    昇格条件「同じ問題が 3 回以上」を満たす）
- Memory に留めたもの（昇格せず・再発監視）:
  - 事象 2: implementer の PRE_EXISTING 誤報告（初回・広いテーマの一部として次回監視）
  - 事象 3: test-designer による設計書前提の実測検証（成功パターン・2 例目）
  - 事象 4: JSDoc 言語不統一・Why コメント欠落（初回・implementer Memory へ）
  - 事象 5: L2 security-reviewer 省略判断 / docs/reviews handoff（既存対策の実地確認）
  - 事象 6: Task ツールの `effort=max` 制約による Luna high フォールバック（頻度監視のみ）
