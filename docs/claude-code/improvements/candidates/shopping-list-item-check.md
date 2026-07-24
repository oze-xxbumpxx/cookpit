# 改善候補: shopping-list-item-check

> reflection-agent が起票。1 タスクの振り返りから抽出した知見をまとめる。
> 設定は変更しない。昇格判断は [../../memory-policy.md](../../memory-policy.md) の昇格条件に従う。

- **task-id**: shopping-list-item-check
- **作成日**: 2026-07-25
- **対象タスク概要**: 買い物リストの品目タップでチェック/解除できる機能。L2・Orchestrator 主導
  （implementer 実装ルート）。`docs/designs/shopping-list-screens.md` S-3（2026-07-13 ユーザー確定:
  「チェック解除は実装しない」）をユーザーが明示的に覆す要望からスタートし、AskUserQuestion 2 回
  （計 3 問）で要件確定 → ADR-0009 作成 → architecture-designer → contract-designer →
  （implementation-planner ∥ test-designer 並行）→ implementer → reviewer（Should 2 件）→
  security-reviewer（指摘なし）→ 品質ゲート、まで手戻りなく完走。reviewer の Should 2 件は
  Orchestrator が直接修正し再度品質ゲートで確認した。`.claude/state/subagent-log.jsonl` に本 feature
  の SubagentStop が 5 件記録されている（2026-07-24T13:09〜22:32）。
- **関連成果物**: `docs/designs/shopping-list-item-check.md` /
  `docs/decisions/ADR-0009-shopping-list-item-check-uncheck.md` /
  `docs/implementation-plans/shopping-list-item-check.md` /
  `docs/tests/shopping-list-item-check.md` /
  `apps/web/src/app/shopping-lists/_components/shopping-list-client.test.tsx`（実装差分の直接確認）。
  **`docs/reviews/shopping-list-item-check.md` は存在しない**（L2 のため
  `definition-of-done.md` 上は必須ではない — L3 のみ必須。reviewer 指摘の一次ソースが会話ログのみに
  残り、本振り返りでは実装差分から間接確認した点に留意）。

## 観測した事象（複数可）

### 事象 1: test-designer の最重要観点（SC-04・通信エラー時のロールバック）が実装計画への集約時に理由記載なくドロップされ、reviewer の受け入れレビューで初めて検出された

- **種類**: レビュー指摘 / 手戻り / Agent 間認識不一致（test-designer と implementation-planner の並行実行間）
- **観測した事象**:
  `docs/tests/shopping-list-item-check.md` §6-3 は `shopping-list-client.tsx` 向けに新規 8 観点
  （SC-01〜SC-08）を定義し、うち **SC-03（失敗レスポンスでのロールバック）と SC-04（通信エラー＝
  reject でのロールバック）を「最重要・ロールバック」と明記**していた（§8 特性観点でも重複して
  「楽観的更新のロールバック（SC-03・SC-04 が最重要）」と強調）。
  一方 `docs/implementation-plans/shopping-list-item-check.md` Step 20 は、これらを
  `LC-24`〜`LC-27` の 4 本（うち失敗レスポンス系は `LC-25` の 1 本のみ）に集約すると明記し、
  「番号は `LC-04` の次に使われていない `LC-24` から振り、`LC-23` は欠番とする」という**番号採番の
  理由は説明しているが、SC-04（通信エラー / reject 系）を含めない理由は一切説明していない**。
  結果として `docs/implementation-plans/shopping-list-item-check.md` には reject 系のテストが
  1 本も存在しないまま Step 23（品質ゲート）まで進み、reviewer の受け入れレビューで
  Should として指摘された。Orchestrator が直接修正し、実装コード側には
  `apps/web/src/app/shopping-lists/_components/shopping-list-client.test.tsx:790`
  に `LC-28: チェック操作中のネットワークエラーでロールバックされる` が追加され green を確認した。
  **ただし `docs/implementation-plans/shopping-list-item-check.md` は `LC-28` 追加後も更新されて
  おらず、計画書は Step 20 時点の「LC-24〜27・LC-23 欠番」の記述のまま**で実コードと乖離している
  （実装計画が「計画時点のスナップショット」のまま完了扱いになっている）。
  なお `docs/tests/shopping-list-item-check.md` の SC-01（未解決 Promise 時点での楽観的反映の検証）・
  SC-08（チェック操作専用の「操作中 item のみ disable」検証）に厳密に対応するテストも実装コード上
  確認できなかった（`SC-08` 相当は既存 `LC-17` が価格記録フローでの disable 確認を担っており、
  チェック操作フロー専用のケースとしては未実装。reviewer の指摘対象に含まれていたかは
  `docs/reviews/` が存在しないため未確認）。
- **発生回数**: このタスク内 1 回。過去の類似事象として IMP-2026-012
  （recipe-servings 事象 2・並列実行した test-designer と implementation-planner の判断食い違いで
  「実施不可能なテストが試験計画に混入」）があるが、**方向が逆**（IMP-2026-012 は
  test-designer 側の見積り誤りで試験計画が実装不可能な観点を含んでいた事象、本事象は
  implementation-planner 側が test-designer の確定済み最重要観点を無言で落とした事象）であり、
  同一の根本原因として扱わず別事象として記録する。
- **対象タスク**: shopping-list-item-check
- **原因仮説**: test-designer と implementation-planner は並行実行される
  （`.claude/skills/classify-change/SKILL.md` L2 早見表: `(planner ∥ test-designer)`）。
  実装計画の Step 20 は試験計画の SC-01〜08 を「参照して要約」する形で LC-24〜27 に落とし込んで
  いるが、試験計画側が持つ §9「メソッド網羅チェック表」（観点 ID → 対象 API の対応表）や §13
  完了条件の「特に SI-CK-04・SIC-03/04・**SC-03/04**・CS-CK-01 は最重要観点として個別に green を
  確認する」という明示的な重要度マーキングを、実装計画側が転記・突き合わせせずに独自の番号体系
  （LC-24〜27）へ圧縮したため、集合としての要素数が合わず 1 項目（SC-04）が欠落したまま気づかれ
  なかったと考えられる。並行実行のため、実装計画作成時点で試験計画が確定していたか、逆に試験計画が
  実装計画の Step 20 を参照して整合させたかの順序も不明瞭（両者の成果物着手ログでは相互参照の記述が
  乏しい）。
- **改善案**（manager 判断用の選択肢。決定はしない）:
  1. Orchestrator が並行委譲（planner ∥ test-designer）完了後、implementer 起動前に
     試験計画の観点 ID 一覧（特に「最重要」マーク付き）と実装計画のテスト追加ステップを
     突き合わせる軽量な整合確認ステップを追加する（orchestration-policy.md か
     create-implementation-plan Skill）。
  2. 現状どおり reviewer の「試験計画の全観点がテストコードに実装されているか」チェックに委ねる
     （今回はこれで実害なく検出・修正できた。ただし検出は implementer 実装後・reviewer 到達後
     というタイミングであり、より早い工程（計画統合直後）で検出できれば手戻りコストはさらに
     小さくなる）。
  3. 実装計画のテスト追加ステップに「試験計画の該当観点 ID」を明記させ（例:
     `LC-25 ← SC-03`、`LC-28 ← SC-04`）、対応漏れが視覚的に分かるようにする（今回の LC-24〜27 では
     採番理由は書かれていたが、試験計画 ID との対応関係は書かれていなかった）。
  4. `LC-28` 追加時に実装計画書自体を更新する運用を明示する（完了条件に「レビュー起因の追加テストは
     実装計画書にも反映する」を加える等）。
- **変更対象**: 未定（.claude/skills/create-implementation-plan/SKILL.md /
  docs/claude-code/orchestration-policy.md / .claude/agents/reviewer.md のいずれか。manager 判断）。
- **想定される副作用**: 整合確認ステップを追加すると L2/L3 のトークン・時間コストが増える。
  「最重要」マークの観点だけに絞った軽量チェックであれば副作用は限定的と考えられる。
- **評価方法**: 次に test-designer ∥ implementation-planner を並行実行する L2/L3 タスクで、
  試験計画の「最重要」マーク付き観点が実装計画・実装コードに理由の記載なく欠落していないかを
  reflection-agent が突き合わせる。
- **昇格判定**: Memory 留め（昇格せず・このタスクで 1 回目）。ただし (a) 「最重要」と明記された
  観点が無言で欠落した点、(b) 欠落がレビュー起因の修正後も計画書に反映されず文書とコードが乖離した
  点の 2 点は再発時のコスト（手戻り＋文書鮮度劣化の複合）が大きいため、次回同種の欠落が観測された
  時点で早期昇格を検討する価値がある（IMP-2026-012 と同様、原因が比較的明確なため）。

### 事象 2: 設計書自身が列挙した「S-3 関連 4 箇所」の更新対象が、同じ設計書内の 5 箇所目（「ユーザー確定記録」の箇条書き）を見落としており、reviewer の受け入れレビューで検出された

- **種類**: レビュー指摘 / 手戻り
- **観測した事象**: `docs/designs/shopping-list-item-check.md` §移行とリリースは
  「S-3 関連 4 箇所」として `docs/designs/shopping-list-screens.md` の
  L56（サマリ表）・L103（対象外 箇条書き）・L631（R-5 リスク行）・L664（将来課題 箇条書き）を
  列挙し、実装計画 Step 21 もこの 4 箇所（＋見出し直後の supersede 注記＝計 5 箇所目だが同一設計書
  内の別セクション）をそのまま踏襲した。しかし `docs/designs/shopping-list-screens.md` には
  L644「### ユーザー確定記録（2026-07-13・全件確定済み）」という**別の見出し配下**に
  「**S-3: 案 A** — チェック解除 UI は実装しない（訂正は上書きのみ。制約はユーザー受容済み）」
  という 6 箇所目（設計書側の数え方では 5 箇所目）の言及が存在し、これは列挙から漏れていた。
  reviewer の Should-1 で指摘され、Orchestrator が直接修正（現在のファイルには L650-652 に
  Superseded 注記が追加済みであることを実ファイルで確認済み）。
- **発生回数**: このタスク内 1 回（この正確な失敗形態＝「設計書が自ら列挙した更新対象リストが
  同一ファイル内の別セクションを見落とす」は初観測）。
- **対象タスク**: shopping-list-item-check
- **原因仮説**: `docs/designs/shopping-list-screens.md` 内で文字列 `S-3` は 8 箇所に出現する
  （L56, L72, L81, L103, L137, L639, L650, L674 — reflection-agent が
  `grep -n "S-3"` で確認）。列挙された 4 箇所（L56/L103/L631/L664。うち L631 は本タスク時点で
  実際には L639 に相対移動していた——実装計画 R-3 リスクで「行番号がずれる可能性」自体は
  事前に認識・対策されていたにもかかわらず、対策は「編集直前に `grep -n "S-3"` で該当箇所を
  再検索する」という**行番号ずれの再検索**のみで、**列挙そのものが全出現箇所を網羅しているかの
  件数検証**は行っていなかった。設計書自身の §リスク R-2 は「S-3 関連 4 箇所を更新し忘れると
  設計書間で矛盾した記述が残る」と明示的にリスクとして先回りしていたが、その「4 箇所」という
  数え方自体が、機械的な全文検索ではなく「現行の設計結論を述べているセクション」を人手で拾う
  形で作られたと推定され、`### ユーザー確定記録` という**過去の確定経緯を記録する履歴セクション**
  （L644）は「現行の設計結論セクション」という暗黙のフィルタから外れて見落とされたと考えられる。
  リスクを先回りして書いたこと自体は機能したが、リスクの見積り（「4 箇所」という数）を検証する
  手段が伴っていなかった。
- **改善案**（manager 判断用の選択肢）:
  1. `create-design-document` Skill または `create-implementation-plan` Skill に、「既存の
     確定済み判断（S-3 等）を supersede する場合、対象文書内の当該識別子（例:
     `S-3`）の全出現箇所数を `grep -c` 等で確認し、列挙した更新対象リストの件数と一致することを
     確認する」という軽量な検証ステップを追加する。追加コストは grep 1 回分のみで小さい。
  2. 上記 1 を implementer/reviewer 側の完了条件（「supersede 対象の全出現箇所を更新したか」）
     として明記する案も考えられるが、reviewer は既に今回この役割を実際に果たして検出できている
     ため、Skill 側での予防（工程の早い段階での網羅性確保）と reviewer 側での検出（安全網）の
     二重化が過剰かどうかは manager 判断に委ねる。
- **変更対象**: 未定（.claude/skills/create-design-document/SKILL.md /
  .claude/skills/create-implementation-plan/SKILL.md。manager 判断）。
- **想定される副作用**: ほぼ無し（grep 1 コマンド分のコスト増）。既存の確定判断を supersede
  しない大多数のタスクには影響しない（トリガー条件を「supersede 記述を伴う設計変更」に限定すれば
  過剰適用は避けられる）。
- **評価方法**: 次に既存の確定済み設計判断を覆す（supersede する）設計書を作成するタスクで、
  対象識別子の全出現箇所数と列挙された更新対象リストの件数が一致しているかを reflection-agent が
  確認する。
- **昇格判定**: Memory 留め（昇格せず・1 回目）。ただし原因が明確（機械的な件数検証の欠如）かつ
  修正コストが非常に小さい（grep 1 手順の追加）ため、IMP-2026-012（recipe-servings, 原因が明確・
  修正が小さいため 3 回蓄積を待たず早期昇格した前例）と同型のケースとして、manager 判断で早期
  昇格を検討する余地がある。

### 事象 3: implementer がテスト基盤起因の不具合（React 19 の `useOptimistic`/`startTransition` に伴う未解決 Promise のテスト間汚染）を自己判断で発見・最小修正した

- **種類**: 成功手順（ただし implementer の権限境界の解釈が問われる事象として記録）
- **観測した事象**: 実装差分を確認したところ、
  `apps/web/src/app/shopping-lists/_components/shopping-list-client.test.tsx` の
  `LC-17`（L609）・`LC-18`（L643）・`LC-27`（L878）の 3 箇所に同一のコメント
  「保留中の Promise を解決し、他テストの startTransition/useOptimistic に影響を残さない」と
  それに続く `await act(async () => { resolveXxx({ ok: false }); })` が付与されている。
  このうち `LC-17`/`LC-18` は Step 20-3 で改修対象と指定された**既存**テストであり、`LC-27` は
  Step 20-4 で新規追加されたテストである。実装計画のコード例（Step 20 内のサンプル）には
  この「後始末」コードは含まれておらず、実装時に implementer（または対応した Agent）が独自に
  追加したものと判断できる。ユーザーの説明によれば、これは「React 19 の未解決 Promise がテスト
  ファイル内で cross-test pollution を起こす」問題を implementer が発見し、影響範囲を最小
  （3 テストへの後始末コード追加のみ、いずれも実装計画で変更対象と指定済みの同一ファイル内）に
  抑えて自己修正したもの。
- **発生回数**: このタスク内 1 回（この具体的な技術的不具合の観測・修正は初）。ただし
  `useOptimistic` パターン自体は本プロジェクトで shopping-list-screens・meal-plan-screens に続き
  3 例目の利用であり、同種の不具合は今後 `useOptimistic` を使うテストで再発しうる。
- **対象タスク**: shopping-list-item-check
- **原因仮説（分析）**: `.claude/agents/implementer.md` の「禁止事項」は「依頼スコープ外の
  リファクタリング・改善（気づきはコメントとして報告）」を禁じる一方、「テスト品質基準」は
  「試験計画にない観点の自主追加（差分は報告に含める）」のみを明示的に許可しており、**「自ら
  追加したテストが引き起こすテスト基盤起因の不具合を、`pnpm test` green という完了条件を満たす
  ために最小修正してよいか」という中間的なケースへの明文の言及がない**。今回の修正は
  (a) 既に実装計画で変更対象と指定済みの同一ファイル内に閉じている、(b) 修正範囲が最小
  （3 箇所への後始末コード追加のみ）、(c) 新規ファイル追加や設計逸脱を伴わない、という 3 点で
  「スコープ外のリファクタリング」ではなく「完了条件（`pnpm test` green）を満たすために必要な
  修正」に該当すると判断でき、今回の対応は妥当だったと考えられる。ただし、これが implementer.md の
  どの条項に基づく判断だったのかは agent 定義上は明示されておらず、担当 Agent の解釈に委ねられて
  いた点はグレーゾーンとして残る。
- **改善案**（manager 判断用の選択肢）:
  1. `.claude/agents/implementer.md` に、「自身が追加したテストに起因するテスト基盤の不具合
     （既存の共有ヘルパー・パターンが新規テストで初めて問題化したもの等）を発見した場合、
     影響範囲を実装計画で指定済みのファイルに限定した最小修正で解消し、報告に含めることを許可する。
     影響範囲が計画外のファイル（共有 setup ファイル・vitest 設定等）に及ぶ場合は Orchestrator へ
     差し戻す」という条項を明文化する案。
  2. 現状のまま「気づきはコメントとして報告」の運用に委ね、implementer の裁量判断に任せる
     （今回は結果的に適切な判断だったため、明文化しない選択肢もある）。
- **変更対象**: 未定（.claude/agents/implementer.md。manager 判断）。
- **想定される副作用**: 明文化により「自己修正してよい範囲」を implementer が拡大解釈し、
  スコープ外のリファクタリングに流用するリスクがある。「実装計画で指定済みのファイルに限定」等の
  歯止めを条項に含める必要がある。
- **評価方法**: 次に implementer がテスト基盤起因の不具合を発見するタスクで、自己修正の範囲が
  計画外ファイルに及んでいないか、報告が伴っているかを reflection-agent が確認する。
- **昇格判定**: Memory 留め（昇格せず・1 回目。権限境界の解釈問題としての記録に留める）。

### 事象 4（成功パターン）: 既存の確定済みユーザー判断を覆す ADR の作成パターンが 2 タスク連続で機能した

- **種類**: 成功手順
- **観測した事象**: 直前タスクの `docs/decisions/ADR-0008-free-text-units.md`
  （2026-07-23・「単位を自由記述にする（Sprint1 のプリセット固定・型安全優先方針を撤回）」）と、
  本タスクの `docs/decisions/ADR-0009-shopping-list-item-check-uncheck.md`
  （2026-07-24・S-3「チェック解除は実装しない」を撤回）は、いずれも**既存の確定済み設計判断を
  ユーザーの新規要望により覆す**という同一パターンで、`.claude/skills/create-adr/SKILL.md` の
  テンプレート（Context/Decision/Alternatives/Consequences/Migration/Rollback）に沿って
  同日中にユーザー確定・Accepted まで完了している。いずれも Alternatives 節に非採用案（本 ADR
  では「S-3 現状維持」を選択肢 B として明記）を残し、覆す判断の経緯が後から追跡可能な形で
  記録されている。
- **発生回数**: 累計 2 回（ADR-0008 → ADR-0009）。
- **対象タスク**: 数量単位統合（ADR-0008 のタスク） / shopping-list-item-check（本タスク）
- **原因仮説（成功要因）**: `create-adr` Skill のテンプレート自体が既に汎用的で機能しているため、
  特別な工夫なしに 2 回連続で機能した。ただし Skill の「いつ作るか」節には「既存のユーザー確定済み
  判断を覆す場合」という具体的なトリガー例が明記されておらず、両タスクとも「ADR 作成の要否」を
  設計書の未決事項としていったんユーザーに確認する手順を踏んでいる（本タスクでは
  `docs/designs/shopping-list-item-check.md` §未決事項 1 参照）。
- **改善案**: `.claude/skills/create-adr/SKILL.md` の「いつ作るか」節に「既存のユーザー確定済み
  判断（設計書の確定記録・過去の ADR 等）を覆す場合」を明示的なトリガー例として追記する。
  これにより次回以降、Orchestrator が「ADR 要否をユーザーに確認する」往復を省略できる可能性がある
  （ただし判断の重さ次第ではユーザー確認自体に価値があるため、往復の省略を目的化しない）。
- **変更対象**: .claude/skills/create-adr/SKILL.md（いつ作るか節。manager 判断）。
- **想定される副作用**: ほぼ無し（Skill のトリガー例を 1 行追加するだけの非破壊的変更）。
- **評価方法**: 次に既存の確定済み判断を覆すタスクが発生した際、Orchestrator が ADR 要否の判断に
  要した往復回数・ユーザー確認の要否を記録し、Before（本タスクまで）と比較する。
- **昇格判定**: Memory 留め（昇格せず）。ただし「成功パターンの複数タスクでの再現」（2 回）に
  該当しうるため、変更が小さく低リスクである点も踏まえ、manager 判断で早期昇格を検討する余地がある。

## まとめ

- 改善候補として起票したもの（→ backlog に追記した ID）: なし（全 4 事象とも Memory 留め。
  事象 2・4 は変更コストが小さく原因が明確なため manager 判断での早期昇格の余地ありと明記）。
- Memory に留めたもの（昇格せず・再発監視）:
  - 事象 1: 試験計画の「最重要」観点が実装計画への集約時に無言で欠落（1 回目。再発時は早期昇格検討）。
  - 事象 2: 設計書の自己列挙した supersede 対象リストが同一文書内の別セクションを見落とす（1 回目。
    修正コスト小・原因明確のため早期昇格の余地あり）。
  - 事象 3: implementer のテスト基盤不具合の自己修正の権限境界が agent 定義上グレー（1 回目）。
  - 事象 4: 既存確定判断を覆す ADR 作成パターンが 2 回連続で成功（成功パターン。早期昇格の余地あり）。
