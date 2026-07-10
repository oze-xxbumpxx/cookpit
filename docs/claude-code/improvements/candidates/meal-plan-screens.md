# 改善候補: meal-plan-screens（Sprint 3 Unit B）

> reflection-agent が起票。1 タスクの振り返りから抽出した知見をまとめる。
> 設定は変更しない。昇格判断は [../../memory-policy.md](../../memory-policy.md) の昇格条件に従う。

- **task-id**: meal-plan-screens
- **作成日**: 2026-07-10
- **対象タスク概要**: Sprint 3 Unit B。L2・Presentation 層のみ（apps/web）。実装ルートはユーザー判断で
  Codex 委譲 → Orchestrator 経路へ変更（ハーネス改善 IMP 群の実地検証を兼ねる）。メインセッションが
  orchestrator 役、implementer(Sonnet) → reviewer(Opus) → reflection-agent(本エージェント) の委譲。
  セッション途中に auto モード分類器の一時障害（Bash/Agent 不可）で中断 → 再開。
- **関連成果物**: `docs/designs/meal-plan-screens.md` / `docs/implementation-plans/meal-plan-screens.md` /
  `docs/tests/meal-plan-screens.md` / `docs/reviews/meal-plan-screens.md` /
  `docs/claude-code/improvements/metrics/TASK-2026-003.yml`

## 観測した事象

### 事象 1: vitest projects の include パターンとテストファイル名の不一致による silent skip（IMP-2026-012 適用後も残る穴）

- **種類**: テスト失敗（未然回避）／レビュー指摘（妥当と判定された逸脱）
- **観測した事象**: 実装計画・試験計画が指定した新規テストファイル名 `meal-plan-view.test.ts` は、
  apps/web の vitest 設定（`*.node.test.ts` / `*.dom.test.ts` / `*.test.tsx` /
  `src/server/**/*.test.ts` のみを include）のどの projects にも一致せず、その名前のまま作成すると
  テストが実行されないのに（テストファイル自体は存在するため）品質ゲートは green に見える状態
  だった。implementer が実装時に自ら検知し `.node.test.ts` へリネームして対応、reviewer も
  「素の `*.test.ts` は無言でスキップされるため妥当」と独立に確認した（`docs/reviews/meal-plan-screens.md`）。
- **発生回数**: このタスク内 1 回（IMP-2026-012 適用後、初めてこの粒度の穴が顕在化）
- **対象タスク**: meal-plan-screens
- **原因仮説**: IMP-2026-012（create-test-plan Skill への追加）は「対象パッケージにテスト実行環境が
  あるか」の確認は追加したが、「environment 別に include パターンが分かれているパッケージ（apps/web
  の node/dom projects 分割）でファイル名がどの projects にも一致するか」までは踏み込んでいなかった。
  実装計画・試験計画のいずれもファイル名レベルの vitest include 突き合わせを行っていない。
- **改善案**: create-implementation-plan / create-test-plan Skill に「新規テストファイルを作成する
  前に、対象パッケージの vitest 設定（`vitest.config.*` / `vitest.workspace.*` / projects 定義）の
  `include` パターンとファイル名を突き合わせる」チェック項目を追加する。加えて、機械的に検知できる
  ならテスト実行後に「vitest の対象外だが `*.test.*` という名前のファイルが存在する」ことを警告する
  仕組み（Hook 案）も将来検討に値するが、今回は Skill レベルの確認追加を優先案とする。
- **変更対象**: Skill（create-implementation-plan / create-test-plan）。Hook 案は別途・副作用要検討。
- **想定される副作用**: チェック項目が増えるほど Skill の手順が重くなる。プロジェクト構成が単純な
  パッケージ（projects 分割なし）では冗長なチェックになり得るため、「projects 分割があるパッケージ
  でのみ必須」等の適用条件を明記しないと肥大化・形骸化のリスクがある。
- **評価方法**: 次回 environment-split な vitest 構成を持つパッケージ（apps/web 等）へ新規テストを
  追加するタスクで、Skill 適用後にファイル名不一致（silent skip）が発生しないかを確認する。
- **昇格判定**: 発生 1 回で、かつ今回は implementer の自主対応により実害（silent skip が実際に
  green 判定を汚染する事態）には至っていない。memory-policy の昇格条件（同問題 3 回 / 重大な試験
  不具合につながった等）を厳密には満たさないため、正式には **Memory 留め（昇格せず・再発監視）**。
  ただし silent skip は「気づかれないまま蓄積する」性質を持ち、今回は実装者の注意力に依存して
  偶然検知できた点に留意。次回同種の発生時は、IMP-2026-012 自体が「原因が明確・修正が小さい」を
  理由に 1 回で例外的に早期昇格した前例があるため、3 回の蓄積を待たずに早期昇格を検討する価値が
  ある旨をここに明記しておく（採否は manager 判断）。

### 事象 2: 「弱いアサーション」パターンの再発（累計 2 件目）

- **種類**: レビュー指摘（Should・再発性あり）
- **観測した事象**: 仕様が集合・列挙・デフォルト値を規定する箇所で、テストが代表値・境界 2 点程度
  のみを検証し、想定される値集合の過不足を固定していないパターン。1 件目 = meal-plan-core Task 03
  （デフォルト limit 4 を seed 2 件で検証・Codex 実装・logs/2026-07-06.md、
  `docs/claude-code/improvements/candidates/meal-plan-core.md` のまとめに Memory 留めとして記録済み）。
  2 件目 = 今回（倍量プリセット集合 `[1, 1.5, 2, 3]` を 1× / 2× の 2 点でしか検証していなかった。
  reviewer の Should-1 指摘を受け、orchestrator 側で WC-K-08（4 プリセットの過不足なし描画を固定）を
  追加し即日対応・`docs/reviews/meal-plan-screens.md`）。
- **発生回数**: 累計 2 回（実装ルートは Codex 委譲と Orchestrator 経路〈Sonnet〉の両方で発生してお
  り、実装ルートに依存しない根本原因と判断できる）
- **対象タスク**: meal-plan-core（2026-07-06）/ meal-plan-screens（2026-07-09）
- **原因仮説**: create-test-plan Skill の試験観点に「仕様が集合・列挙・デフォルト値を規定する場合は
  過不足なしを固定する」という観点が明示されておらず、テスト作成者（Codex／implementer いずれも）が
  代表値の確認で仕様を満たしたと判断しやすい。
- **改善案**: create-test-plan Skill の観点に「仕様が集合／列挙／デフォルト値を規定する場合は、
  `toEqual` 等で想定値集合の過不足なしを検証する、または境界を跨ぐデータ量で固定する」を追加する。
- **変更対象**: Skill（create-test-plan）
- **想定される副作用**: すべての集合仕様に網羅性を要求すると、テストが冗長化し実装コストが増える
  懸念がある。「仕様上意味のある集合（プリセット・デフォルト値・上限/下限を規定する列挙）」に限定
  する運用注記が必要。
- **評価方法**: 次回、集合／列挙／デフォルト値を含む仕様のタスクで、レビューにおける「弱いアサー
  ション」型の Should 以上の指摘がゼロになるかを確認する。
- **昇格判定**: 累計 2 回で memory-policy の昇格条件（同種の重大指摘複数回、目安 3 回）にはあと 1 件
  足りない。厳密には **Memory 留め（昇格せず・再発監視）**とするが、実装ルートを跨いで同一パターン
  が再現している点から、次回 3 回目が発生した場合は条件を満たすため優先的に昇格候補とすることを
  明記しておく。

### 事象 3: 成功パターン: リモート実画面確認（Playwright）のスクリプト自動化

- **種類**: 成功手順
- **観測した事象**: `pnpm --filter @cookpit/web dev:pglite` でアプリを起動し、Playwright（同梱
  Chromium・`executablePath` 明示）をスクリプトで駆動して MB-01〜08 の 8 項目を自動実行・全 PASS
  させた（`docs/reviews/meal-plan-screens.md` 「実画面確認」節）。従来この工程はリモート環境の制約
  で BLOCKED（手動確認不可）が常態だったが、今回スクリプト化により自動化に成功した。つまずき所も
  記録価値がある：`type="search"` の input は role が `textbox` ではなく `searchbox` になる／同梱
  Chromium は `executablePath` を明示しないと起動しない／確認スクリプトは対象パッケージ配下に置か
  ないと import 解決に失敗する。
- **発生回数**: 1 回（このタスクで初めて成功パターンとして確立）
- **対象タスク**: meal-plan-screens
- **原因仮説**: —（失敗ではなく成功パターンの記録）
- **改善案**: manual-browser-verify Skill に、今回のスクリプト構成（`dev:pglite` 起動 → API レスポン
  ス形の事前確認 → セレクタは role/placeholder ベース → PASS/FAIL 判定と根拠の機械的出力）と、上記
  つまずき所 3 点（searchbox ロール／Chromium executablePath／スクリプト設置場所）を手順として追記
  する。
- **変更対象**: Skill（manual-browser-verify）
- **想定される副作用**: 環境固有の記述（executablePath の実パス等）を書きすぎると別のリモート環境で
  陳腐化するリスクがある。一般化可能な手順（role ベースセレクタ・設置場所の原則）と環境固有の注意点
  （パス例）を区別して記載する必要がある。
- **評価方法**: 次回の L2/L3 タスクで同スクリプト構成を再利用し、BLOCKED（手動確認不可で記録のみ）
  の発生割合が減るかを確認する。
- **昇格判定**: 発生 1 回。memory-policy の昇格条件「明確な成功パターンが複数タスクで再現した」は
  1 回では未達のため **Memory 留め（昇格せず・再発監視）**。次回別タスクで同様に自動化が再現すれば
  昇格（Skill への正式追記）を推奨する。

### 事象 4: 単一 Sub-agent 委譲の実行方式が orchestration-policy の記述（同期既定）と実挙動（常に background）で乖離

- **種類**: Agent 間認識不一致（ポリシー記述とハーネス実挙動の不一致）
- **観測した事象**: `docs/claude-code/orchestration-policy.md`（IMP-2026-008 由来）は「単一 Sub-agent
  への委譲は同期待機を既定とする」としているが、本環境では Agent ツールが `run_in_background:false`
  を指定しても常に background 起動になった（`.claude/state/subagent-log.jsonl` に feature が
  `null`（分類器障害中）→ `meal-plan-screens`（再開後）の 2 エントリが記録され、通知を介さず完了
  確認する運用で対処したことからも実挙動を確認できる）。今回は IMP-2026-009 の冪等判定（成果物の
  存在確認）で問題なく運用できたが、policy の記述と実挙動には差異がある。
- **発生回数**: このタスク内で観測 1 回（implementer・reviewer への委譲いずれも background 起動）
- **対象タスク**: meal-plan-screens
- **原因仮説**: `run_in_background` 指定がハーネス側の Agent ツール仕様で無視される、または
  「同期待機」という policy 上の概念自体がこの環境の Agent ツールの起動方式（常時非同期）と噛み
  合っていない。Cookpit 側の Agent 定義では直接制御できない可能性がある（backlog の申し送り表に
  ある「孫 Sub-agent 通知バイパス」の観測と類似の、ハーネス側仕様に起因する制約）。
- **改善案**: orchestration-policy.md の「既知の制約」節に、単一 Sub-agent 委譲であっても実際には
  background 起動になり得る旨と、その場合は通知を待たず期待成果物の存在確認（IMP-2026-009 の原則）
  で完了を判定する運用を明記する（policy の記述を実態に合わせる訂正）。
- **変更対象**: docs/claude-code/orchestration-policy.md（既知の制約 節への追記・訂正）
- **想定される副作用**: 「同期待機を既定」という記述を弱めると、待機を前提にした他の手順（メトリク
  ス計測のタイミング等）との整合を再確認する必要がある。
- **評価方法**: 次回の L1/L2 タスクで単一 Sub-agent 委譲を行い、background 起動が再現するかを確認
  する（3 タスク連続で再現すれば記述訂正の確度が上がる）。
- **昇格判定**: 発生 1 回（このタスクでの観測が初回）。memory-policy の昇格条件を満たさないため
  **Memory 留め（昇格せず・再発監視。orchestrator Subagent Memory）**。

### 事象 5: Stop hook の WIP チェックポイントコミットがエフェメラル環境の成果保全として機能（成功パターン）

- **種類**: 成功手順
- **観測した事象**: セッション途中に auto モード分類器の一時障害（Bash/Agent 不可）が発生し中断した
  際、Sub-agent 実行中の未コミット差分に対して Stop hook が WIP チェックポイントコミット
  （`f654b70`）を自動作成した。これにより再開後も成果が失われず、期待成果物の存在確認による冪等
  判定（IMP-2026-009 の原則）と組み合わせて未完了工程のみを再実行できた。
- **発生回数**: 1 回（このタスクで初めて明示的に観測・機能を確認）
- **対象タスク**: meal-plan-screens
- **原因仮説**: —（既存 Hook 挙動が想定外の中断シナリオでも意図通り機能した、という確認）
- **改善案**: 現時点では Hook の変更提案はない（既存挙動が有効に機能したことの記録）。
  improvement-backlog.md の Memory 留め置き表（成功パターン欄）に 1 行残し、再現を追跡する。
- **変更対象**: なし（記録のみ。Hook は変更しない）
- **想定される副作用**: なし
- **評価方法**: 次回、同種の分類器障害・予期しない中断が発生した際に同じ回復パターンが再現するかを
  確認する。
- **昇格判定**: 発生 1 回。memory-policy の昇格条件「成功パターンが複数タスクで再現」には未達のため
  **Memory 留め（昇格せず・再発監視）**。

## IMP 実地検証結果（滞留 6 件）

今回のタスクは、直前セッションで方針変更されたハーネス改善 IMP 群の実地検証を兼ねている。
各 IMP の検証結果を記録する（backlog への転記は orchestrator 側で実施）。

| IMP                                                    | 検証結果                         | 詳細                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IMP-2026-007（L3 設計並列化の定量計測）                | 対象外（変化なし）               | 今回は L2 のため並列化フェーズの対象外。定量 after 計測は次の正常 L3 タスクへ持ち越し。                                                                                                                                                                                                                                      |
| IMP-2026-009（resume 後の冪等判定）                    | 実地検証済み・機能（変則ケース） | stop/resume ではなく auto モード分類器障害による中断→再開だったが、同じ原則（通知に頼らず期待成果物の存在・不在で直前委譲の完了を判定）で reflection-agent 未実行を正しく検出し、二重起動ゼロで未完了工程のみ再委譲できた（`.claude/state/subagent-log.jsonl` の feature: null → meal-plan-screens の 2 エントリで裏付け）。 |
| IMP-2026-010（implementer のドキュメント更新完遂義務） | 検証済み・機能                   | implementer が実装計画の §ドキュメント更新対象 3 点を実施し「実施/対象外(理由)」形式で報告。reviewer の独立確認でも漏れゼロ（`docs/reviews/meal-plan-screens.md`）。                                                                                                                                                         |
| IMP-2026-012（test-designer の実行環境事前確認）       | 部分的に機能                     | 試験計画はランナー有無を層別に明示していたが、ファイル名レベルの穴（vitest include 不一致による silent skip）が発覚。詳細は本ファイル事象 1 参照。                                                                                                                                                                           |
| IMP-2026-014（モデル采配）                             | 検証済み・機能                   | 委譲前に采配表を提示、implementer=Sonnet／reviewer=Opus を実起動。Explore(haiku)・Fable オーバーライドは本タスク（L2）では出番なく、次の L3 で確認予定。                                                                                                                                                                     |
| IMP-2026-016（L2 security-reviewer 省略条件）          | 検証済み・機能                   | ドライラン判定表の frontend-screen-addition と同判定を実タスクで再現。省略条件 3 点（Presentation のみ・依存追加なし・秘密情報/外部I/O/認証なし）を充足し省略、理由を `docs/reviews/meal-plan-screens.md` に 1 行記録。                                                                                                      |

## 参照のみ（重複起票せず）

- メトリクス相関の前提 2 件（current-feature の委譲前設定・ブランチフィルタ明示）は
  [proposals/IMP-2026-019.md](../proposals/IMP-2026-019.md) に既に記載済みのため、本ファイルでは
  重複起票しない。`metrics/TASK-2026-003.yml` への転記はセッション内で完了済み（IMP-2026-019 方針
  A の実地トライアル）。

## まとめ

- 改善候補として起票したもの（→ backlog に追記した ID）: なし。事象 1〜5 のいずれも今回の発生
  回数のみでは memory-policy の昇格条件（3 回 / 同種重大指摘複数回 / 成功パターンの複数再現 等）を
  厳密には満たさない。
- Memory に留めたもの（昇格せず・再発監視）:
  - 事象 1: vitest include とテストファイル名の不一致による silent skip（1 回目。IMP-2026-012 の
    残存穴。severity が高いため次回発生時は早期昇格を検討する価値ありと明記）
  - 事象 2: 「弱いアサーション」パターン（累計 2 回。次の 3 回目で昇格条件を満たす見込み・優先監視）
  - 事象 3: リモート実画面確認の Playwright スクリプト自動化（成功パターン 1 回目・再現待ち）
  - 事象 4: 単一 Sub-agent 委譲が policy 記述と異なり常に background 起動（1 回目・再現待ち）
  - 事象 5: Stop hook の WIP チェックポイントコミットがエフェメラル環境の成果保全として機能
    （成功パターン 1 回目・再現待ち）
