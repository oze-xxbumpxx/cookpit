# 改善候補: pantry-core

> reflection-agent が起票。1 タスクの振り返りから抽出した知見をまとめる。
> 設定は変更しない。昇格判断は [../../memory-policy.md](../../memory-policy.md) の昇格条件に従う。

- **task-id**: pantry-core
- **作成日**: 2026-07-17
- **対象タスク概要**: Pantry 在庫管理（Sprint 5 Unit A）のバックエンド一式。L3・Codex 委譲ルート。
  設計書 S-1〜S-11 確定 → 実装計画（Codex 5 タスク分割）→ 試験計画 → Codex 実装指示書パック
  （README + 01〜05）を Claude が作成し、Codex が Task 1（Domain）〜Task 3（Application）まで
  実装・マージ済み（PR #67 相当＝Infrastructure、#68＝Application。Task 1 は別 PR）。
  本振り返り時点で Task 4（API Contract）はブランチ作成済み・未コミット、Task 5 は未着手。
- **関連成果物**: docs/designs/pantry-core.md（1,122 行）/
  docs/implementation-plans/pantry-core.md（1,618 行）/
  docs/tests/pantry-core.md（747 行）/ docs/tasks/codex/pantry-core/（README + 01〜05・合計 1,415 行）/
  docs/reviews/pantry-core.md（Task 1 のみ記録）/ logs/2026-07-15.md・logs/2026-07-16.md

## 観測した事象（複数可）

### 事象 1: Codex 委譲ルートの上流文書量が直近 3 件連続で増加傾向・実装計画とブリーフの二重生成が定量的に確認できる（ユーザー明示の問題意識）

- **種類**: 手戻りではなく構造的コスト過多（成功はしているが非効率）
- **観測した事象**: Codex 委譲ルートの直近 3 L3 ユニットで、Codex が着手する前に Claude が
  生成する設計書＋実装計画＋ブリーフの合計行数を実測すると、単調ではないが高水準が継続し、
  かつ「実装計画がブリーフを上回る」比率が悪化している。

  | feature                           | 設計書 | 実装計画 | ブリーフ(6ファイル) | 3点合計 | 実装計画÷ブリーフ |
  | --------------------------------- | -----: | -------: | ------------------: | ------: | ----------------: |
  | meal-plan-core（Sprint 3）        |  1,286 |      674 |               1,181 |   3,141 |              0.57 |
  | shopping-list-core（Sprint 4）    |  1,643 |    2,048 |               1,908 |   5,599 |              1.07 |
  | pantry-core（Sprint 5・本タスク） |  1,122 |    1,618 |               1,415 |   4,155 |              1.14 |

  さらに pantry-core の実装計画とブリーフは、タスク単位の行数がほぼ 1:1 対応する
  （実装計画 Task 1: 97-436 行=339行 ⇔ ブリーフ 01-domain.md 347 行／実装計画 Task 3:
  678-1157 行=479行 ⇔ ブリーフ 03-application.md 481 行）。ブリーフ側は「そのまま実装」という
  語で完成コードをそのまま貼る箇所が 5 ファイル中 13 箇所（うち 03-application.md だけで 5 箇所）
  あり、コードブロック数は 24（shopping-list-core 21・meal-plan-core 26）と 3 件とも同水準に多い。
  実質、設計書 → 実装計画 → ブリーフの 3 段で同じ確定コードが多くの箇所で再度書き起こされている。

- **発生回数**: 累計 3 回（meal-plan-core → shopping-list-core → pantry-core の Codex 委譲 L3
  ユニット全てで再現。同じ問題が 3 回以上発生した、の昇格条件を満たす）
- **対象タスク**: meal-plan-core / shopping-list-core / pantry-core（いずれも Sprint 3〜5 の
  Unit A）
- **原因仮説**:
  1. `create-implementation-plan` Skill の完了条件（`.claude/skills/create-implementation-plan/SKILL.md`
     78 行目）が「**implementer** がこの計画だけで実装に着手できる粒度になっている」と、実装ルートに
     関わらず Orchestrator/implementer 読者を前提にした重い完了基準を課している。Codex 委譲ルートでは
     `docs/tasks/codex/README.md` が「参照ドキュメント（読み取り専用参照。実装の根拠が必要な場合のみ）」
     と明記するとおり、実装計画は Codex の主要な入力にならず、実質的な読者が存在しない
     （ユーザー仮説どおり）。
  2. `create-codex-brief` Skill 手順 4 は「期待するクラス・関数シグネチャ（タイポ照合の基準になる
     正確な識別子名）」を必須項目とするのみで、完成コード全文の貼付を要求していない
     （テンプレートの「実装対象ファイル」欄は「期待するシグネチャをコードブロックで明示」であり
     「実装をそのまま書く」ではない）。にもかかわらず実運用では shopping-list-core 事象 1・4
     （初回レビュー FAIL 0 の成功パターンとして 2 回確認・昇格条件充足・backlog 記載）を踏まえ、
     完成コードを貼る慣行が定着し、meal-plan-core → shopping-list-core → pantry-core の 3 件で
     継続・強化されている。この成功パターンへの対応は IMP-2026-020 で「先回り注意の必須節化」
     （命名・記法の注意セクション）のみが正式化され、「完成コードを貼る」慣行自体は一度も
     Skill テキストに明文化されないまま踏襲され続けている。
  3. Orchestrator の統合クロスチェック（logs/2026-07-15.md）は「契約書コード片と実装計画コードは
     逐語一致」を合格基準の一つとしており、設計〜実装計画〜ブリーフ間の verbatim 一致は現状
     「望ましい整合性」として肯定的に評価される仕組みになっている。二重生成のコストと整合性検証の
     価値のトレードオフが明文化されていない。
- **改善案**: 以下はユーザー本人が提示した仮説であり、reflection-agent としてはログの事実で
  裏付けたうえで候補化する（採否・具体案の選定は agent-improvement-manager に委ねる）。
  1. ブリーフから完成コードを削り、公開シグネチャ・層またぎ制約・テスト観点・完了条件・
     「命名・記法の注意」節だけの薄いブリーフにする（公開識別子一覧はタイポ検出の照合基準として残す）。
     ただし事象 4 のとおり完成コード同梱は識別子・配線ミスをゼロに保つ効果を実測しているため、
     単純な削除は品質とのトレードオフを伴う（事象 3 参照）。
  2. 実装ルート＝Codex と宣言したタスクでは実装計画書を省略し、ブリーフが実装計画を兼ねる
     （`create-implementation-plan` Skill 側に Codex ルート向けの軽量モードを設ける、または
     Codex ルートでは同 Skill の起動自体をスキップする）。
  3. （reflection-agent からの追加観測）どちらを採るにせよ、Orchestrator の統合クロスチェックが
     「逐語一致」を無条件の合格基準にしている点は見直しが必要（薄いブリーフを採用すると
     「逐語一致しない」ことが正常になるため）。
- **変更対象**: `.claude/skills/create-implementation-plan/SKILL.md` /
  `.claude/skills/create-codex-brief/SKILL.md` / `docs/claude-code/orchestration-policy.md`
  （統合クロスチェック基準）
- **想定される副作用**: ブリーフを薄くすると事象 4 の成功パターン（識別子・配線ミス 0 件）が
  崩れる可能性がある。実装計画を省略すると、Codex ルート開始後に Orchestrator ルートへ切り替える
  場合（設計判断が実装中に発覚するケース）の土台文書が失われる。
- **評価方法**: 次の Codex 委譲 L3 タスクで、(a) 変更後の総行数・実装計画÷ブリーフ比率が
  改善するか、(b) Codex 実装の初回レビュー FAIL/WARN 数が悪化しないか、の両方を計測する。
- **昇格判定**: 満たす（→ 改善候補として起票。backlog に追記）

### 事象 2: docs/reviews/<feature>.md への受け入れレビュー記録欠落が IMP-2026-020 適用後も再発（累計 5 回相当）

- **種類**: レビュー指摘（要件見落とし・完了条件の未達）
- **観測した事象**: `docs/claude-code/definition-of-done.md`（64-66 行）と
  `docs/claude-code/orchestration-policy.md`（92-96 行）はいずれも「Codex 委譲ルートでも
  `docs/reviews/<feature>.md` への記録が完了条件（正本）。複数 Task の feature では Task 単位で
  追記」と明記している（2026-07-14 IMP-2026-020 で明文化・統一済み）。にもかかわらず、
  `docs/reviews/pantry-core.md` には Task 1（Domain）の受け入れレビューのみが記録され、
  main へ既にマージ済みの Task 2（Infrastructure）・Task 3（Application）の受け入れレビュー
  記録が存在しない。`.claude/state/quality-gates-log.jsonl` にも `feature/pantry-infrastructure`
  `feature/pantry-application` ブランチでの品質ゲート実行記録がない（`feature/pantry-core-domain`
  の 1 件のみ）。`.git/logs/HEAD` を確認すると、Task 3 用ブランチ（`feature/pantry-application`）は
  Task 2 用ブランチ（`feature/pantry-infrastructure`）から直接分岐しており、その後 main への
  `pull`（両 PR のマージ取り込み）が 1 回だけ発生している。Task 2 の PR マージが本セッションの
  ローカル操作を経由せずに成立した可能性が高く、`review-codex-implementation` の受け入れレビューが
  実施されたのか、実施されたが記録されなかったのか、そもそも省略されたのかを本セッションからは
  判別できない（不明のまま記録する）。
- **発生回数**: 累計 5 回相当（shopping-list-core Task 3・4・5 の 3 回 → 2026-07-14 に
  IMP-2026-020 でテキストポリシーを統一・修正 → その 2 日後の pantry-core Task 2・3 で
  同型の欠落が再発。ポリシー文言の修正だけでは再発を防げなかったことを示す実地証拠）
- **対象タスク**: shopping-list-core Task 3/4/5（過去分）+ pantry-core Task 2/3（今回）
- **原因仮説**: definition-of-done.md / orchestration-policy.md の文言統一（IMP-2026-020）は
  「書くべきである」という規範を明確にしたが、それを**強制する機械的チェック**（Hook や
  close-session 相当の確認）が存在しない。複数 Task を連続処理する Codex ルートでは、
  PR 作成・マージが人間の手動操作やセッション外で進むことがあり（shopping-list-core 事象 7
  と同型の「PR 作成・マージ主体の暗黙受け渡し」）、テキストポリギーだけでは記録の付け忘れを
  防止できない。
- **改善案**: (a) `docs/reviews/<feature>.md` の記録有無を機械的に検知する仕組み（例:
  feature ブランチが main へマージされた形跡があるのに対応する `docs/reviews/` エントリが
  無い場合に close-session やレビュー完了報告時点で警告する）を検討する。(b) 複数 Task
  feature の close-session チェックリストに「全マージ済み Task 分の `docs/reviews/` 記録が
  揃っているか」を明示項目として追加する。具体策の選定は agent-improvement-manager に委ねる。
- **変更対象**: Hook（`.claude/hooks/`）または close-session 関連手順（人間承認必須。
  Hook のブロック条件変更は improvement-cycle.md §承認境界により人間承認が必要）
- **想定される副作用**: 機械チェックを厳格にしすぎると、正当な理由で PR 本文にのみ記録した
  ケースを誤検知する可能性がある（definition-of-done.md は「PR 要約は任意」とし
  `docs/reviews/` を正本と明記しているため、誤検知のリスクは低いと見積もられる）。
- **評価方法**: 次の複数 Task Codex ルート L3 タスクで、全 Task 分の `docs/reviews/` 記録が
  揃うかを確認する。
- **昇格判定**: 満たす（強く。テキストポリシー修正後もなお再発しており、同一問題 3 回以上の
  条件を大きく超過している）

### 事象 3: ブリーフの「そのまま実装」サンプルコードに潜在バグが混入し、実装段階で修正された形跡がある（shopping-list-core 事象 2 と同型の 2 回目の発生・ただし実害化せず）

- **種類**: レビュー指摘（潜在バグ）/ 成功手順（実害化を防いだ結果）の両面
- **観測した事象**: `docs/tasks/codex/pantry-core/03-application.md` §7 の「そのまま実装」
  サンプルコードでは `CompleteShoppingUseCase.toAddStockInput()` が
  `amount: item.requiredAmount ?? Quantity.of(1, '個')` という nullish coalescing のみで
  実装されている。しかし `item.requiredAmount` が `null` ではなく `value: 0` の `Quantity`
  である場合（設計書 S-9 条件 3 が明示的に許容している現実的なケース。契約でも同スキーマの
  `requiredAmount.value` は 0 を許容する）、`??` は 0 を代替しないため
  `Quantity.of(0, unit)` がそのまま `Pantry.addStock()` に渡り、Task 1 で確定した
  `Stock.create()` の不変条件（`amount.value <= 0` で throw）に抵触して例外が発生する
  潜在バグがあった。実際にマージ済みの
  `packages/application/src/shopping-list/complete-shopping.use-case.ts`（77-92 行）では
  `item.requiredAmount === null || item.requiredAmount.value <= 0` という分岐に修正されており、
  JSDoc にも「数量不明または 0 以下の bought 品目は…1 個として Stock 化」という当初のブリーフに
  無かった説明が追加されている。対応するテストケース「`requiredAmount が 0`」
  （`complete-shopping.use-case.test.ts` 444-448 行）も存在する。ブリーフの「命名・記法の注意」
  節や「テスト」節は `requiredAmount === null` のケースしか明示しておらず、`value: 0` の
  ケースをブリーフのテスト観点として要求していない。つまり、実装（または実装レビュー）段階で
  ブリーフの記述を上回る追加の検証が行われ、潜在バグが実害化する前に修正された。
- **発生回数**: 累計 2 回（shopping-list-core Task 3 の `Money.of()` 負値 throw が
  `ShoppingItemNotFoundError` に誤変換される潜在バグ・事象 2 と同型。2 回とも「ブリーフの
  サンプルコードが設計書からの手書き起こしで、実コードと同水準の敵対的レビューを経ていない」
  という同一の原因構造）
- **対象タスク**: shopping-list-core Task 3（過去分）+ pantry-core Task 3（今回）
- **原因仮説**: `create-codex-brief` Skill 手順 5（「サンプルコードを敵対的に一度読む」）は
  既にテキストとして存在するが、pantry-core のブリーフ作成時にこの手順が実効的に機能した形跡が
  ない（機能していれば `??` の穴はブリーフ執筆時点で潰せたはず）。事象 2（今回の事象 1）で
  指摘した上流文書量の多さ・時間的制約が、手順 5 のような「もう一段の敵対的レビュー」を
  形骸化させている可能性がある。
- **改善案**: 「完成コードをそのまま貼る」運用を続ける場合、手順 5 の敵対的レビューを
  Codex への引き渡し前に独立したチェックポイントとして明示的に実行した記録を残す（例:
  ブリーフ本文または作成メモに「敵対的レビュー実施済み」の一言を残す）ことで、実行有無を
  事後検証可能にする。
- **変更対象**: `.claude/skills/create-codex-brief/SKILL.md` 手順 5（実行記録の明示化）
- **想定される副作用**: 記録作業自体が上流文書量をさらに増やす（事象 1 と相反する方向の
  改善のため、manager による横断判断が必要）。
- **評価方法**: 次の Codex 委譲タスクで、ブリーフのサンプルコードに起因する潜在バグの
  有無と、手順 5 実施記録の有無を突き合わせる。
- **昇格判定**: Memory 留め（昇格せず・累計 2 回だが実害化せず。次回同型が発生した時点で
  3 回目として確実に昇格する。ただし事象 1・4 との関連が強いため、manager の横断分析では
  一括して扱うことが望ましい旨を申し送る）

### 事象 4: 完成コード同梱ブリーフが Task 1・Task 2 で識別子・配線ミスをゼロに保つ効果を 3 回目として再確認（成功パターンの継続）

- **種類**: 成功手順
- **観測した事象**: Task 1（Domain）は `review-codex-implementation` による正式なレビューが
  実施され、`docs/reviews/pantry-core.md` に「機械チェック FAIL 0 / WARN 0・品質ゲート全 green・
  人間チェックリスト全 PASS・差し戻しなし」と記録されている。Task 2（Infrastructure）は
  正式なレビュー記録こそ無い（事象 2）が、マージ済みの
  `packages/infrastructure/src/repositories/drizzle-pantry.repository.ts` を
  `docs/tasks/codex/pantry-core/02-infrastructure.md` §4 のサンプルコードと突き合わせたところ、
  import 順序（lint 整形起因とみられる）以外は完全に一致しており、識別子タイポ・命名ミスは
  皆無だった。shopping-list-core 事象 1・4 で確認済みの「先回り注意 + ほぼ完全なサンプルコード
  → 初回レビュー FAIL 0」という成功パターンが、pantry-core でも（Task 2 は正式レビュー未実施
  ながら）3 件目として概ね再現している。
- **発生回数**: 累計 3 回相当（shopping-list-core Task 3・Task 5 に続き、pantry-core Task 1
  （正式確認）・Task 2（コード突合による簡易確認）で再現）
- **対象タスク**: shopping-list-core Task 3/5（過去分）+ pantry-core Task 1/2（今回）
- **原因仮説**: 事象 1 と同一（完成コード同梱 + 「命名・記法の注意」節）。ボイラープレート色の
  強い Domain・Infrastructure 層では特に効果が高い。
- **改善案**: 既に backlog 上で「対応済み（→ IMP-2026-020）」として扱われている成功パターンの
  追加確認であり、新規の変更提案はしない。ただし事象 1 の改善（ブリーフを薄くする案）を
  検討する際は、本事象（完成コード同梱の効果は Domain/Infrastructure 層で高い）と事象 3
  （Application 層のロジックが絡む箇所ではサンプル自体の潜在バグリスクがある）を層ごとに
  分けて評価すべき、という示唆として記録する。
- **変更対象**: なし（観測のみ。事象 1・3 の判断材料として記録）
- **想定される副作用**: なし
- **評価方法**: 事象 1 の改善が適用された後、層別（Domain/Infrastructure vs Application/
  Presentation）でレビュー指摘率に差が出るかを追跡する。
- **昇格判定**: Memory 留め（昇格せず・肯定的な観測として記録。事象 1 の判断材料）

## IMP-2026-007 追跡計測

対象外。本タスクは要件分析〜実装計画〜ブリーフ作成までを別セッション（logs/2026-07-14〜15）で
完了しており、本振り返りセッション自体は Codex 実装コードとの突合・レビュー記録確認のみで
Subagent 呼び出しを伴わない（`.claude/state/subagent-log.jsonl` の pantry-core 関連エントリは
2026-07-14 の設計・計画フェーズのもののみ）。

## メトリクス記録

本振り返りセッションは Read/Write/Grep/Glob のみのツール権限で実行しており、
`bash .claude/scripts/record-task-metrics.sh` を実行できない（shopping-list-core 振り返り時と
同型の制約）。`docs/claude-code/improvements/metrics/pantry-core.yml` の作成は、Bash ツール
権限を持つセッション（Orchestrator またはメインセッション）での対応が必要。

## まとめ

- 改善候補として起票したもの（→ backlog に追記した行）:
  - 事象 1（Codex 委譲ルートの上流文書量肥大化・実装計画とブリーフの二重生成。ユーザー明示の
    問題意識を定量データで裏付け）
  - 事象 2（`docs/reviews/` 受け入れレビュー記録欠落が IMP-2026-020 適用後も再発・累計 5 回相当）
- Memory に留めたもの（昇格せず・再発監視）:
  - 事象 3（ブリーフのサンプルコード潜在バグの 2 回目の発生。実害化せず。次回発生で昇格）
  - 事象 4（完成コード同梱ブリーフの成功パターンが 3 回目として再現。事象 1・3 の判断材料）
