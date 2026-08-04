# 要件定義: harness-plugin-split

- task-id / 変更レベル: TASK-2026-008 / **L3**（大規模リファクタ。agents 7 本・skills 17 本・
  rules 3 本・scripts 2 本・方針ドキュメントに及ぶ）
- 作成日: 2026-07-31

## 背景

ハーネスを他プロジェクトへ再利用する取り組みの Phase 2。Phase 1（`harness-portability`・
`d1bf604`）で実行系の名前空間と環境変数をプロジェクト名から切り離し、続いて
`2bcd240` で土台（`harness-paths.mjs` 公開 API 13 件）の試験を埋めた。

配布方式は **Plugin 3 分割**でユーザー確定（2026-07-31）。

| Plugin                | 行数（実測） | 依存     |
| --------------------- | ------------ | -------- |
| `harness-core`        | 1,919        | なし     |
| `harness-workflow`    | +2,324       | core     |
| `harness-improvement` | +2,149       | workflow |

Phase 2 は「どのファイルがどの層に属するか」を確定し、層をまたぐ依存を解消して、
Phase 3（Plugin リポジトリ作成）が機械的に切り出せる状態にする工程。

## 目的

3 つの Plugin が**それぞれ単独で成立する**状態にする。具体的には、ある層だけを install
したプロジェクトで、その層の Skill / Agent / Hook が欠けた依存を参照しないこと。

## ユーザー要求（原文の要約）

- 「私の今の構成を他のプロジェクトにも活かしたい」（2026-07-31 初回）
- 「配布方式でいきたい」= Plugin 化（2026-07-31）
- 「移植ティアを決めますか？」→ 3 分割を選択（2026-07-31）
- 「切り出し前に埋める」= 土台の試験を先に（2026-07-31・完了済み）
- 「お願いします」= Phase 2 着手（2026-07-31）

## 機能要件

- **F-1**: 各 Plugin の同梱ファイル一覧（層マニフェスト）が確定していること。
- **F-2**: 層をまたぐ依存がないこと。下位層は上位層のファイルを参照しない。
- **F-3**: `close-session` が `harness-workflow` だけの環境で完結すること
  （現状はメトリクス系 4 本に依存し、それらは improvement 層）。
- **F-4**: `kickoff-session` と `close-session` が同一層に存在すること
  （skill 自身が「対になる」と規定しているため、層が分かれると運用が破綻する）。
- **F-5**: スタック固有の資産が汎用 Plugin に混入しないこと。
- **F-6**: 汎用ルール（`.claude/rules/coding-standards.md` 相当）が Plugin 経由で
  移植先に届くこと。**`.claude/rules/` は Plugin の配布プリミティブに含まれない**ため、
  別の配り方を決める必要がある。
- **F-7**: 事象出典が移植先で「他プロジェクトの実績」として読めること。
  現状 38 箇所 / 15 ファイルにあり、`docs/claude-code/improvements/candidates/...` 等の
  リポジトリ内パスを含むため移植先では dead link になる。

## 非機能要件

- **N-1**: Cookpit 側の現行挙動を変えない（Phase 1 と同じ制約）。Cookpit は Phase 3 で
  利用側へ転換するまで現構成のまま動くこと。
- **N-2**: `.claude/rules/` は project instructions として**毎セッション自動注入**され、
  常時トークンを消費する（`.claude/rules/README.md` の 2026-07-28 実測）。移植先の
  スタックに合わないルールを配ると、トークンを消費した上で誤った前提を注入する。
  よって「配らない」判断も要件を満たす。
- **N-3**: 性能・可用性: 対象外（開発時のみ動作する構成ファイル群）。

## 正常系

- **N-01**: `harness-core` のみを install したプロジェクトで、`quality-gates` /
  `write-work-log` Skill と `guard-dangerous` Hook が動作する。
- **N-02**: `harness-core` + `harness-workflow` の環境で、L2 開発ワークフロー
  （分類 → 設計 → 計画 → 実装 → レビュー）が Subagent 委譲を含めて完走する。
- **N-03**: 同環境で `kickoff-session` → 作業 → `close-session` が完結する
  （メトリクス・振り返りの節は「improvement 層が無いためスキップ」と明示して飛ばす）。
- **N-04**: 3 層すべてを install した環境で、現在の Cookpit と同じ工程が回る。

## 異常系

- **E-01**: `harness-workflow` を core 無しで install した場合、依存不足が
  install 時または初回実行時に判別できる（`plugin.json` の依存宣言または README の明記）。
- **E-02**: improvement 層が無い環境で `close-session` を実行した場合、
  メトリクス手順で失敗せずスキップし、その旨をログに残す。
- **E-03**: 移植先に `docs/claude-code/improvements/` が無い状態で
  `check-improvement-cycle` Hook が動いても、Hook は作業を止めない（現行の fail-open を維持）。

## 境界条件

- **B-01**: 移植先に `logs/` が無い場合（`write-work-log` / `session-briefing.sh` の前提）。
- **B-02**: 移植先に `docs/designs/` 等の成果物ディレクトリが無い場合
  （`check-deliverables` Hook の前提）。
- **B-03**: 移植先の Agent 定義が 0 本の場合（`validate-agent-config` Hook は
  `.claude/agents/` の存在を前提にしている）。
- **B-04**: `close-session` の分割後、両方が同時に存在する環境で手順が二重実行されないこと。

## 前提

- Plugin は agents / skills / hooks / commands を配布プリミティブとして持つ。
  **`.claude/rules/` に相当する概念は持たない**（F-6 の根拠）。
- 全移植先が pnpm（2026-07-31 ユーザー確定。パッケージマネージャ抽象化は対象外）。
- Cookpit 自身の Plugin 利用側への転換は Phase 3。本 Phase では行わない。

## 制約

- 歴史的ドキュメント（`logs/` / `improvements/accepted/` / `evals/results/`）は書き換えない
  （`harness-personal-light-mode` 設計の既存方針）。
- 構成ファイル（CLAUDE.md / agents / hooks / skills / rules / settings.json）の変更は
  **PR レビュー**を承認境界とする（CLAUDE.md 行動制約）。`settings.json` は Claude 経由の
  編集がハーネス側で拒否されるため、変更が必要ならユーザー直接編集
  （backlog 2026-07-20 の実績で確定）。
- 事象出典は**消さない**。指示の根拠であり、削ると「なぜこの指示があるか」が失われる。

## 対象範囲

- `.claude/skills/close-session/SKILL.md` — 層をまたぐ依存の解消（F-3）
- `.claude/agents/*.md`（7 本）/ `.claude/skills/*/SKILL.md`（17 本）— 層の割り当てと
  スタック依存記述の切り出し（F-5）
- `.claude/rules/` — 配り方の決定（F-6）
- `.claude/scripts/record-task-metrics.sh` — `COOKPIT_METRICS_*` 11 箇所の改名
- 出典表記 38 箇所 / 15 ファイル（F-7）
- 層マニフェストの文書化（Phase 3 の入力）

## 対象外

- **`.claude/scripts/check-codex-implementation.mjs`（861 行）の汎用化**。当初「固有名詞
  10 箇所の脱スタック依存」と見積もったが、実体は Tailwind クラス辞書検証・`globals.css`
  解析・`.tsx` 前提の静的検査で、**中身が丸ごとスタック固有**だった。汎用化する対象ではなく、
  「どこに置くか」の配置問題として扱う（未決事項 D-1）。
- Plugin リポジトリの作成・`plugin.json` / `marketplace.json` の記述 → Phase 3
- Cookpit の利用側への転換 → Phase 3
- アプリコード（Domain / Application / Infrastructure / Presentation）・DB・API 契約
- `evals/baselines` / `evals/results` の移植（プロジェクト固有の実績値）

## 後方互換性・データ移行

- データ移行: **対象外**（状態ファイルの形式・保存先を変更しない。Phase 1 で確定済み）。
- 後方互換: Cookpit の現行運用を壊さないこと（N-1）。`close-session` の分割は、
  Cookpit では両方が存在するため実質的な手順変更なし。

## 受け入れ条件（Definition of Done に対応）

- 層マニフェストが 3 層すべてについて具体パスで確定し、層をまたぐ依存が 0 件であることを
  機械的に確認できる（依存の grep 照合）。
- `close-session` が workflow 層で完結し、improvement 層の手順は条件付きで分離されている。
- `pnpm lint` / `type-check` / `test` / `test:harness` が PASS。
- スタック固有資産の配置が決まっている（D-1 の決着）。
- 汎用ルールの配り方が決まっている（D-2 の決着）。
- 出典表記の形式が決まり、38 箇所へ適用されている（D-3 の決着）。

## 未決事項（誰に何を確認するか）

- **D-1（ユーザー）**: スタック固有資産（`check-codex-implementation.mjs` 861 行 /
  `manual-browser-verify` / `review-codex-implementation` / `create-codex-brief` /
  `rules/domain-layer.md` / `rules/presentation-layer.md` / `contract-designer`。計 1,418 行）を
  どう扱うか。①Cookpit ローカルに残す ②4 本目の stack 固有 Plugin にする
  ③improvement 層に同梱する。
- **D-2（ユーザー）**: `.claude/rules/` の汎用分（`coding-standards.md` 48 行）を
  どう配るか。①Plugin Skill として ②CLAUDE.md テンプレートの断片として
  ③配らず移植先で各自書く。**N-2 の「自動注入＝常時トークン消費」がトレードオフの核**。
- **D-3（ユーザー）**: 出典表記の形式。①`出典: cookpit/recipe-servings 事象2` のように
  プロジェクト名を前置 ②`出典: 他プロジェクト実績（recipe-servings 事象2）` のように
  外部実績と明示 ③現状維持（移植先では dead link だが根拠として残る）。
- **D-4（判断済み・報告のみ）**: `record-activity.mjs` + `estimate-session-time.mjs` を
  improvement 層から **core 層へ移す**。依存は `harness-paths` のみで、`write-work-log`
  （core）の「所要時間」欄を埋めるために必要。前回の層割り当てを訂正する。
- **D-5（判断済み・報告のみ）**: `close-session` の分割方法。手順 1・3・6・7 を
  workflow 層、手順 2 は D-4 により core 層、手順 4・5 と
  `check-review-coverage.mjs` 参照を improvement 層へ。
