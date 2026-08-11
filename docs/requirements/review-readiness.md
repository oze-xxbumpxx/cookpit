# 要件定義: review-readiness

- task-id / 変更レベル: TASK-2026-009 / **L3**（レビュー、CI、Claude Code ハーネスの
  安全境界を横断して変更するため）
- 作成日: 2026-08-11
- ステータス: confirmed（ユーザー指示「本格的に入り込んでいきましょう」）

## 背景

AI 実装の量と速度が上がる一方、人間は長い差分、機械チェック、AI 指摘、実画面確認、
差し戻し履歴を統合して最終判断する必要がある。Cookpit は証拠生成を十分に持つが、証拠を
現在の判断へ圧縮する境界がない。

実例として `docs/reviews/stock-edit.md` は 657 行あり、先頭の設計レビュー結果と末尾の
最終結果が異なる。全自動テスト green 後に実画面確認で 2 件の欠陥も見つかっている。
監査ログとしては有用だが、人間が現在状態を得るには全文を再構築しなければならない。

## 目的

1. 人間が最初の 1 画面で「何を判断するか」「何が未確認か」を理解できるようにする。
2. 古いコードに対するレビュー結果を、現在の差分へ誤って再利用できないようにする。
3. 自動検証済み項目を人間へ再確認させず、主観・不可逆・未知の判断だけを渡す。
4. 既存の追記型レビュー記録を監査証跡として維持する。
5. 個人開発ライトモードを壊さず、依存・CI job・日常の手作業を増やさない。

## 機能要件

- **F-1: 現在状態** — `docs/reviews/<feature>.md` の先頭付近に、機械可読 state、
  人間向け summary、formatter 保護を同一 marker 内で持てること。
- **F-2: 単一の正典** — current state と詳細監査ログを同じレビュー文書に保存し、
  PR 本文や別 sidecar を正典にしないこと。
- **F-3: 対象 digest** — base SHA、feature 名、Git raw diff の mode / blob ID / status /
  path から SHA-256 digest を計算できること。
- **F-4: 自己参照回避** — 当該 `docs/reviews/<feature>.md` を digest から除外し、レビュー記録の
  追記だけで自分自身を stale にしないこと。
- **F-5: 二つの入力源** — ローカルでは staged index、CI では base-to-head commit diff を
  同じアルゴリズムで検証できること。
- **F-6: 状態** — `ai_blocked` / `evidence_pending` / `human_review_requested` / `stale` を扱い、
  AI が `PASS` / `APPROVED` を付与しないこと。
- **F-7: 人間項目** — `subjective` / `irreversible` / `unknown` だけを人間へ渡し、
  3 件以下にすること。4 件以上は省略せず、引き渡し前状態へ戻すこと。
- **F-8: 表示順** — 人間項目、残余リスク、振る舞い差分、証拠、AI 評価の順で表示すること。
- **F-9: 指摘契約** — 指摘を action / impact / evidence / status の独立軸で記録し、
  既存の severity と人間の行動を混同しないこと。
- **F-10: リスク適応** — 成果物 Level と別に R0〜R3 の review tier を持ち、低リスク変更へ
  高リスク工程を一律適用しないこと。
- **F-11: Task coverage** — 既存 `check-review-coverage.mjs` の Task 見出し照合を維持すること。
- **F-12: CLI** — 1 本の Node スクリプトで `subject` / `render` / `check` / `ci` を提供すること。
- **F-13: CI** — 既存 `quality` job 内で warning-only 検証し、job を追加しないこと。
- **F-14: 後方互換** — current-state marker のない既存レビューを legacy として読み、
  初期導入では警告だけにすること。
- **F-15: Closure 順序** — review 結果を入力にする metrics / candidate を final subject より先に
  確定し、closure review 後は digest 対象を変更しないこと。

## 非機能要件

- **N-1: 依存** — Node.js と Git の標準機能だけを使い、package 依存を追加しない。
- **N-2: 性能** — CI の追加処理は通常 30 秒未満、目標 2 秒未満とする。
- **N-3: 認知負荷** — summary は原則 40 表示行以内、振る舞い差分は 5 件以内とする。
- **N-3a: Formatter 安定性** — repository の Prettier を実行しても生成 marker が変化せず、
  state と表示が drift しないこと。
- **N-4: 安全側の失敗** — digest 不一致や schema 不正を「レビュー済み」と表示しない。
- **N-5: 初期可用性** — CI 導入時はスクリプト異常でも既存品質ゲートを妨げない。
- **N-6: 改ざん限界** — 本仕組みをセキュリティ境界や Claude 実行の証明と主張しない。
- **N-7: 可搬性** — 新規スクリプトとテスト、および実行時依存する既存 Task coverage checker は
  `harness-workflow` 層へ分類する。

## 正常系

- **N-01**: staged index から生成した digest が、同じ内容を commit した CI diff と一致する。
- **N-02**: 0 blocker、0 high-impact unverified、人間項目 3 件以下なら
  `human_review_requested` を表示する。
- **N-03**: 人間項目 0 件でも承認済みとは表示せず、振る舞い差分と残余リスクを提示する。
- **N-04**: 既存監査ログを変更せず、生成 block だけを差し替えられる。
- **N-05**: current-state marker のある変更 review を CI が検証し、結果を短く表示する。
- **N-06**: L3 の audit 成果物を確定した final subject に対して closure review し、その後の
  review 文書生成では digest が変わらない。

## 異常系・境界条件

- **E-01**: 同じパスのファイル内容だけが変わっても digest が変わる。
- **E-02**: mode 変更、追加、削除、symlink、binary、gitlink の変化で digest が変わる。
- **E-03**: base SHA が変われば raw diff が同じでも stale になる。
- **E-04**: レビュー文書だけの変更では digest が変わらない。
- **E-05**: malformed JSON、未知 enum、負数 count、重複 ID、存在しない evidence ref を検出する。
- **E-06**: 人間項目 4 件以上では通常の handoff summary を生成せず、分割・追加証拠を促す。
- **E-07**: marker が無い legacy review は CI warning に留める。
- **E-08**: shallow clone や解決不能 base は明示的 unknown とし、成功扱いしない。

## 制約

- アプリの Domain / Application / Infrastructure / Presentation、DB、API 契約は変更しない。
- 既存レビュー本文 16 件を一括移行しない。次に触る feature から段階移行する。
- 新規スクリプト 1 本、新規テスト 1 本を上限とする。
- GitHub bot、PR コメント書き込み権限、外部 SaaS は導入しない。
- main へのマージ判断は人間が行う。

## 対象範囲

- `.claude/agents/reviewer.md`
- `.claude/agents/security-reviewer.md`
- `.claude/skills/review-codex-implementation/SKILL.md`
- `.claude/skills/create-codex-brief/SKILL.md`
- `.claude/skills/{record-metrics-and-reflect,reflect-task}/SKILL.md`
- `.claude/scripts/review-readiness.mjs`（新規）
- `.claude/tests/review-readiness.test.mjs`（新規）
- `.claude/scripts/sprint-summary.sh`
- `.github/workflows/ci.yml`
- `docs/reviews/README.md`
- `docs/reviews/review-readiness.md`（本仕組み自身の dogfood）
- `docs/06-ai-tools.md`
- `docs/claude-code/{agent-responsibilities,codex-delegation-playbook,development-workflow,definition-of-done,plugin-layer-manifest,usage-guide}.md`
- `docs/claude-code/improvements/metrics/_TEMPLATE.yml`
- `docs/claude-code/improvements/{candidates,metrics}/TASK-2026-009.*`

## 後方互換性・移行

- marker のないレビューは legacy として有効な監査ログのまま残す。
- warning-only の期間中に新規 feature 2 件以上で試行する。
- blocking 化は、誤警告 0、2 週間または 3 feature の試行、ユーザー明示承認をすべて満たした後、
  別タスクで行う。

## 受け入れ条件

- F-1〜F-15 と E-01〜E-08 を Node 標準テストまたは文書照合で確認できる。
- `pnpm test:harness` / `pnpm lint` / `pnpm type-check` / `pnpm test` が成功する。
- CI job 数と依存パッケージ数が増えない。
- current-state summary が `PASS` / `APPROVED` を表示しない。
- Claude Code Reviewer の `BLOCK` が 0 である。
- 人間が読むべき項目が 3 件以下、かつ残余リスクが明示される。

## 未決事項

なし。blocking 化だけを運用実績後の別判断として残す。
