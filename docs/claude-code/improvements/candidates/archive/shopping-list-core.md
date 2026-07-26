# 改善候補: shopping-list-core

> reflection-agent が起票。1 タスクの振り返りから抽出した知見をまとめる。
> 設定は変更しない。昇格判断は [../../memory-policy.md](../../memory-policy.md) の昇格条件に従う。

- **task-id**: shopping-list-core
- **作成日**: 2026-07-12（Task 3 時点で起票）
- **更新日**: 2026-07-13（Task 4・Task 5・受け入れレビュー・締め作業を追記。feature 完了）
- **対象タスク概要**: ShoppingList 集約の実装（L3・Codex 委譲ルート）。Task 1（Domain・PR #52）/
  Task 2（Infrastructure・PR #53）/ Task 3（Application・PR #54）/ 公開 API JSDoc 規約採用
  （PR #55）/ Task 4（API Contract・PR #56）/ Task 5（Presentation API・PR #57）まで完了し、
  Sprint 4 Unit A が完了した（`docs/05-roadmap.md`「Unit A 完了記録（2026-07-13）」）。本ファイルは
  Task 3 完了時点の起票を、Task 4/5・受け入れレビュー・締め作業（`docs/04-domain-model.md` 同期・
  `docs/05-roadmap.md` 更新・ADR-0006 作成）まで追記して更新した。
- **関連成果物**: docs/tasks/codex/shopping-list-core/（指示書一式）/
  packages/application/src/shopping-list/（Task 3）/
  packages/api-contract/src/shopping-list.schema.ts（Task 4）/
  apps/web/src/server/routes/shopping-lists.ts（Task 5）/
  docs/reviews/shopping-list-core.md（Task 1/2 のみ記録・事象 6 参照）/
  docs/decisions/ADR-0006-shopping-list-generate-idempotent.md

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
- **昇格判定**: 満たす（→ 事象 4 で複数再現を確認。詳細は事象 4 参照）

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
- **昇格判定**: Memory 留め（昇格せず。事象 5 のとおり Task 4 で申し送りが実際に反映され、
  再発ではなく既知の懸念の解消として決着したため、このタスク内では再発なし）

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
- **昇格判定**: Memory 留め（昇格せず・再発監視終了に近い）。**追記（2026-07-13）**:
  Task 2 で WARN 3 件（うち 1 件がこの事象と同型）が出た後、Task 4/5 のレビューでは
  同種 WARN の再発は報告されなかった（Task 5 は「機械チェック指摘 0 件」で確認済み。
  Task 4 は本セッションからは docs/reviews への記録が無く未確認・事象 6 参照）。
  マージ後に辞書が更新され再発しなくなるという原因仮説と整合する結果だが、Task 4 分の
  確証が取れないため「解消」と断定はしない。

### 事象 4（事象 1 の追跡・累計 2 回確認）: 先回り指示書パターンが Task 5 でも再現し「複数タスク再現」の昇格条件を充足

- **種類**: 成功手順（事象 1 の継続観測）
- **観測した事象**: Task 5（Presentation 層・Hono ルート 5 本）の受け入れレビュー
  （2026-07-13）で、機械チェック（check-codex-implementation.mjs）指摘 0 件・品質ゲート
  （lint/type-check/test）全 green・人間チェックリスト（docs/06-ai-tools.md 8 項目）全 PASS・
  差し戻し 0 件の初回合格。指示書 05-presentation.md の「命名・記法の注意」節（ルート変数名
  `shoppingListsRoute` の複数形・`bought`/`target-store` の綴り・`result.created ? 201 : 200`
  の三項の向き・`param`+`json` 2 バリデータの明記・`'use client'` 不要の明記）が、実装物
  （`apps/web/src/server/routes/shopping-lists.ts`）と完全一致した形で反映されており、
  過去に頻発した Codex 既知ミス型が今回も 1 件も発生しなかった。事象 1 で設定した昇格基準
  「複数再現（次の Codex 委譲タスクでも FAIL 0）を確認したら昇格を検討」を満たす。
- **発生回数**: 累計 2 回確認（Task 3・Task 5）。Task 4 は docs/reviews への記録が無く
  本セッションからは FAIL/WARN 件数を確認できない（事象 6 参照。不明として扱い、
  昇格判定にはカウントしない）。
- **対象タスク**: shopping-list-core Task 3・Task 5
- **原因仮説**: 事象 1 と同一（先回り注意 + ほぼ完全なサンプルコード + 名前衝突等への
  明示注意）。Task 5 では特に「三項の向き」「2 バリデータの明記」など Hono ルート特有の
  既知ミス型への先回りが有効だったとみられる。
- **改善案**: create-codex-brief スキルの「命名・記法の注意（過去の Codex ミス実績への
  先回り）」節を必須テンプレート項目として明文化する。ただし本候補は reflection-agent の
  権限では提案化（proposal 起票）まで行わない。agent-improvement-manager による横断分析
  （他 feature の Codex 委譲タスクでも同様の効果が出ているか）を推奨する。
- **変更対象**: .claude/skills/create-codex-brief/SKILL.md（テンプレート必須セクション化）
- **想定される副作用**: 事象 1 と同一（指示書肥大化コスト）。「命名・記法の注意」節が
  形骸化しないよう、既知ミス型のリストは feature ごとに実際の過去指摘から抽出する運用を
  維持する必要がある（汎用チェックリストのコピペ化は効果が薄れる懸念）。
- **評価方法**: 次の Codex 委譲タスク（Sprint 5: Pantry 等）で同パターンの初回 FAIL 0 が
  3 回目として再現するか。または agent-improvement-manager が本事象を proposal 化する場合は
  IMP 番号採番後に評価ケースを設計する。
- **昇格判定**: **満たす**（成功パターンの複数タスク再現。事象 1 で定めた基準を充足）。
  backlog 側の該当行を「昇格条件充足・proposal 化検討推奨」に更新した。

### 事象 5: create-codex-brief が改善候補ファイルの申し送りを直接参照し、次の指示書に反映（改善サイクルのフィードバックが機能した実例）

- **種類**: 成功手順 / 再利用可能な知見
- **観測した事象**: `docs/tasks/codex/shopping-list-core/04-api-contract.md` の「厳守事項」に
  「`actualPrice.amount` の `.min(0)` は削除・緩和禁止」という注意があり、その根拠として
  「Task 3 レビューで `MarkAsBoughtUseCase` の catch が try 内で評価される `Money.of`
  （負値で throw）の例外を `ShoppingItemNotFoundError` に誤変換する潜在バグが判明しており
  （`docs/claude-code/improvements/candidates/shopping-list-core.md` 事象 2）」と、この
  candidate ファイル自体を名指しで参照していた。実装（`shopping-list.schema.ts`）は
  `.min(0)` を維持したまま完成し、事象 2 の懸念が実害化しなかった。
- **発生回数**: このタスク内 1 回
- **対象タスク**: shopping-list-core Task 4
- **原因仮説**: create-codex-brief 作成者（Orchestrator/人間）が、proposal 化・Skill 改訂を
  待たずに candidate ファイルの内容を次の指示書作成時に直接参照した。「単発 → Memory」
  の記録が、正式な昇格を経なくても次回作業の入力として機能した実例。
- **改善案**: この運用（次の Codex ブリーフ作成時に直近の candidate ファイルを参照する）が
  create-codex-brief の手順として明文化されているか確認する価値はあるが、1 回のみの観測
  であり、かつ「機能した」というポジティブな観測のため、変更提案はしない。
- **変更対象**: なし（観測のみ）
- **想定される副作用**: なし
- **評価方法**: 次回以降の create-codex-brief でも同様に直近の candidate ファイルが
  参照されるかを確認する。
- **昇格判定**: Memory 留め（昇格せず・肯定的な運用実例として記録のみ）

### 事象 6: docs/reviews/shopping-list-core.md に Task 3・Task 4・Task 5 の受け入れレビュー記録が欠落

- **種類**: 要件見落とし（成果物欠落の疑い）
- **観測した事象**: `docs/claude-code/definition-of-done.md` の Level 3 節は
  「`docs/reviews/<feature>.md` にレビュー記録」を条件無く完了条件として明記する一方、
  `docs/claude-code/orchestration-policy.md` は「結果（機械チェック・品質ゲート・
  チェックリスト判定）を PR 本文または `docs/reviews/` に記録する」と OR 条件で緩めている
  （2 文書間で必須性の記述が食い違う）。実際に `docs/reviews/shopping-list-core.md` には
  Task 1（PR #52）・Task 2（PR #53）の受け入れレビューのみが記録されており、Task 3
  （PR #54）・Task 4（PR #56）・Task 5（PR #57、本セッション）の受け入れレビュー結果は
  ローカルファイルとして残っていない。PR 本文に記録されている可能性はあるが、本セッションは
  GitHub への直接アクセス手段を持たず確認できていない（不明のまま記録する）。
- **発生回数**: この feature 内で 3 回（Task 3・Task 4・Task 5）。同一問題が 3 回以上
  発生した、という昇格条件に該当する可能性が高いが、発生範囲が単一 feature 内の連続タスクに
  限定されるため、他 feature でも再現するかの確認が望ましい。
- **対象タスク**: shopping-list-core Task 3・Task 4・Task 5
- **原因仮説**: (a) definition-of-done.md と orchestration-policy.md の文言の食い違いにより、
  「PR 本文への記録で足りる」という判断がされた可能性。(b) 1 feature 内で複数タスクを
  連続処理する長尺セッションで、最初の 1-2 タスクは記録したが以降は省略されるという
  運用のなし崩し（Task 1/2 は同一の集中レビューセッションで記録、Task 3 以降は別セッション
  にまたがったため記録の継続が途切れた可能性）。いずれか、または両方。
- **改善案**: 2 案。(1) definition-of-done.md と orchestration-policy.md の文言をどちらかに
  統一する（PR 本文記録で足りるとするか、docs/reviews/ を必須とするか、を明確化）。
  (2) review-codex-implementation Skill の手順 6「報告」に、L3 タスクでは
  `docs/reviews/<feature>.md` への追記を明示的な完了条件として追加する。
- **変更対象**: docs/claude-code/definition-of-done.md / docs/claude-code/orchestration-policy.md /
  .claude/skills/review-codex-implementation/SKILL.md（いずれも未定・横断判断が必要）
- **想定される副作用**: 記録の二重管理（PR 本文と docs/reviews/ の両方に書く手間）。
  Codex ルートで複数タスクを連続処理する場合、記録の付け忘れが起きやすい構造自体は
  Hook で機械検出しにくい（PR 本文に書いたかどうかはローカルから見えない）。
- **評価方法**: 次の L3・Codex 委譲タスクで docs/reviews/ への記録が全タスク分揃うかを
  確認する。揃わなければ 4 回目の発生として確定的に昇格する。
- **昇格判定**: **昇格条件を満たす可能性が高い**（同一問題 3 回以上）。改善候補として
  起票し、backlog へ新規行として追加した。ただし他 feature での再現有無の確認と、
  2 文書間の文言統一という横断判断が必要なため、proposal 化は agent-improvement-manager
  に委ねる。

### 事象 7: 受け入れレビュー合格後の PR 作成・main マージの主体受け渡しが暗黙

- **種類**: プロセス観察（Agent 間・人間間の役割境界の曖昧さ）
- **観測した事象**: Task 5 のレビュー合格報告後、PR #57 の作成〜main マージはユーザーが
  セッション外で直接実施した（`docs/05-roadmap.md`「Unit A 完了記録（2026-07-13）」に
  PR #57 が完了済みとして反映されていることで確認）。review-codex-implementation Skill の
  手順 6「報告」はレビュー結果の報告までを求めるが、報告後の PR 作成・マージを誰が
  （AI が作業ブランチから PR を作成するか、ユーザーが手動で行うか）行うかは
  orchestration-policy.md の Codex ルート節に明記されていない。
- **発生回数**: このタスク内 1 回。同種の暗黙の受け渡しは他 feature でも起きている
  可能性があるが本セッションでは未確認（不明のまま記録する）。
- **対象タスク**: shopping-list-core Task 5
- **原因仮説**: orchestration-policy.md §実装ルートの分岐は Codex ルートの「受け入れ
  レビュー必須」までは規定するが、レビュー合格後の PR 作成主体を明記していない。
- **改善案**: orchestration-policy.md の Codex ルート節に「受け入れレビュー合格後の
  PR 作成・マージの主体」を一文で明記する。
- **変更対象**: docs/claude-code/orchestration-policy.md（未定・単発のため即時変更は
  提案しない）
- **想定される副作用**: なし（明確化のみ）。
- **評価方法**: 次の Codex 委譲タスクで同様の暗黙受け渡しが発生するか、差し戻し時に
  再レビューの起点が曖昧になる実害が出るかを観察する。
- **昇格判定**: Memory 留め（昇格せず・単発。今回は実害なし。再発または差し戻し時の
  実害発生で昇格検討）

### 事象 8: モック化されたルートテストが green でも実配線を担保しない可能性を敵対的レビューで検証（新規の調査観点）

- **種類**: 成功手順 / 再利用可能な知見
- **観測した事象**: `shopping-lists.test.ts` は `vi.mock('@cookpit/application', ...)` で
  UseCase を全モック化するため、テストが green でもコンストラクタ引数順・入力 DTO の
  フィールド名などの実配線が指示書・契約と一致しているかはテストだけでは担保されない
  （オブジェクトスプレッドで渡す入力は TypeScript の excess property check を素通り
  しうる）。Task 5 の敵対的レビューパスで、実装（`shopping-lists.ts`）のコンストラクタ
  引数順・入力 DTO フィールド名・契約 §10 を実コードと直接照合し、問題なしを確認した。
  エラーメッセージ文言は `vi.mock` の `importOriginal` スプレッドにより実クラスの
  `.message` がそのまま使われるため、この部分は自動的に担保されていた。
- **発生回数**: このタスク内 1 回（今回は不具合の検出には至っていない。新規の調査観点
  としての初観測）
- **対象タスク**: shopping-list-core Task 5
- **原因仮説**: review-codex-implementation Skill の人間チェックリスト 8 項目は
  「差し戻しの部分反映」以外は diff 目視ベースだが、「モックの背後にある実配線」を
  明示的に照合する項目が独立して存在しない。
- **改善案**: review-codex-implementation のチェックリストに「モックで置換された
  コンポーネント（UseCase・Repository 等）の実配線（コンストラクタ引数順・入力 DTO
  フィールド名）を実コードと直接照合する」観点を追加する。ただし毎回のレビューで行うと
  工数が増えるため、対象を「UseCase/Repository を丸ごとモック化するルートテストを持つ層
  （Presentation）」に限定する等の運用工夫が必要。
- **変更対象**: .claude/skills/review-codex-implementation/SKILL.md（未定）
- **想定される副作用**: レビュー工数増。効果測定なしに追加すると形骸化するリスク
  （チェック項目が増えるだけで実効性を伴わない懸念。過去の reviewer 観点追加の教訓と同型）。
- **評価方法**: 次回以降のレビューでこの観点により実際に不具合を検出できるかを追跡する
  （今回は 0 件のため「予防効果があった」との断定はできない）。
- **昇格判定**: Memory 留め（昇格せず・単発。実際に不具合を検出した実績がまだないため、
  成功パターンとして確定させるにはもう 1〜2 回の観測が必要）

### 事象 9: 前回ログの「次回やること」がセッションを跨いだ引き継ぎとして正しく機能（締め作業の成功パターン）

- **種類**: 成功手順
- **観測した事象**: `logs/2026-07-11.md`「次回やること」に記載されていた締め作業項目
  （実装完了後: `docs/04-domain-model.md` 同期・`docs/05-roadmap.md` Sprint 4 更新・
  ADR 作成要否の判断・reflection-agent）が、本セッション（2026-07-13）で漏れなく実施
  されたことを確認した（`docs/04-domain-model.md` の ShoppingList 集約・
  `GenerateShoppingListUseCase` 疑似コードへの 2026-07-13 実装同期注記、
  `docs/05-roadmap.md` の「Unit A 完了記録（2026-07-13）」追加、
  `docs/decisions/ADR-0006-shopping-list-generate-idempotent.md` 新規作成、本振り返り）。
- **発生回数**: このタスク内 1 回。同種のログ引き継ぎ成功は他 feature でも起きている
  可能性が高いが、本ファイルとしては初観測。
- **対象タスク**: shopping-list-core（締め作業全体）
- **原因仮説**: logs/ のチェックリスト形式（`- [ ]`）が具体的なファイルパス・対象セクション
  まで指定していたため、セッションが変わっても実施漏れが起きにくかった。
- **改善案**: 特になし（既存の logs/ 運用が機能しているため変更提案はしない）。
- **変更対象**: なし
- **想定される副作用**: なし
- **評価方法**: 次回以降のセッション跨ぎでも同様に機能するかを観察する。
- **昇格判定**: Memory 留め（昇格せず・単発。複数 feature での再現が確認できれば
  「計画セッション分離型が手戻りゼロで完走」（test-infra-expansion の既存knowledge）
  と統合して成功パターンとして扱う）

## IMP-2026-007 追跡計測

**追記（2026-07-13）**: shopping-list-core の上流工程（要件確認〜試験計画確定。
セッション `a4fbde9e-5da5-4895-8c4a-f6d5d2b805cd`、2026-07-11〜12）が、orchestrator の
notification 待ちループ（IMP-2026-008 対象）が発生しない状態で完走した「次の正常 L3」に
該当すると判断し、`docs/claude-code/improvements/evaluations/IMP-2026-007.md` に after 計測を
追記した（申し送り継続だった backlog 行を更新）。要点:

- 改善 A（contract-designer 並列化）: 新規ドメイン中心の L3 のためガードが発動し直列固定。
  これは評価時の database-schema-change ケースと同型の「ガード正常動作」の再確認であり、
  「並列化が実際に発動するケースでの効果測定」はまだ得られていない。
- 改善 B（先行調査の共有）: `agent_calls` に `Explore: 1` が記録されており、IMP-2026-014 で
  仕様化された Explore(haiku) 委譲による先行調査フェーズが発動したとみられる。ただし
  フェーズ別のトークン内訳が記録されていないため、重複探索削減の定量効果（トークン収支）は
  算出できない。
- 計測粒度の注意: 本セッションのメトリクス（`TASK-2026-004.yml`）はフェーズ 1（要件分析）〜
  create-codex-brief 完成までの**セッション全体**の値であり、IMP-2026-007 の元の before
  計測（product-master・「設計フェーズ」のみに限定・duration_ms 1,169,584）とは範囲が
  異なる。直接比較すると「増加した」ように見えるが、比較対象のスコープが違うため
  参考値にとどめる（詳細は evaluations/IMP-2026-007.md 追記分を参照）。

本セッション自体（Task 4/5 の受け入れレビュー・締め作業）は Codex 委譲ルートの受け入れ
レビュー・ドキュメント同期のみで、main セッション上での作業のため orchestrator を新規に
起動していない（Subagent 呼び出しなし）。

## メトリクス記録

`docs/claude-code/improvements/metrics/TASK-2026-004.yml` が shopping-list-core の上流工程
（2026-07-11〜12・セッション a4fbde9e）を記録済み。本セッション（Task 4/5 の受け入れレビュー・
締め作業。2026-07-13）は Subagent 呼び出しがなく `.claude/state/subagent-log.jsonl` にも
新規エントリが無いため、新しいメトリクス YAML は作成しない（Task 3 完了時の前回振り返りと
同じ扱い）。`record-task-metrics.sh` の実行は Bash ツール権限を持つセッションでの対応が
必要（本振り返りセッションは Read/Write/Grep/Glob のみ）。

## まとめ

- 改善候補として起票したもの（→ backlog に追記した行）:
  - 事象 4（先回り指示書パターンの複数タスク再現・昇格条件充足）
  - 事象 6（docs/reviews/ への Task 3-5 レビュー記録欠落・同一問題 3 回）
- Memory に留めたもの（昇格せず・再発監視）:
  - 事象 1（Task 5 再現をもって事象 4 へ発展的に統合）
  - 事象 2（Task 4 で申し送りが反映され実害化せず。再発なし）
  - 事象 3（Task 4/5 で再発報告なし。Task 4 分は未確認のため「解消」と断定はしない）
  - 事象 5（candidate ファイルが次回指示書作成に直接参照された成功実例）
  - 事象 7（PR 作成・マージ主体の暗黙受け渡し。単発・実害なし）
  - 事象 8（モック配線の実物照合という新規調査観点。単発・不具合検出実績なし）
  - 事象 9（ログ引き継ぎによる締め作業の成功パターン。単発）
