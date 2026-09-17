# 改善候補: better-auth-login

> reflection-agent が起票。1 タスクの振り返りから抽出した知見をまとめる。
> 設定は変更しない。昇格判断は [../../memory-policy.md](../../memory-policy.md) の昇格条件に従う。

- **task-id**: better-auth-login
- **作成日**: 2026-09-17
- **対象タスク概要**: L3。Basic 認証 → Better Auth（email+password）+ Cookie セッションへの
  全面置換（パスキーは第二段として別 PR）。要件〜設計〜契約〜実装計画〜試験計画〜実装
  （implementer 5 回）〜レビュー（reviewer・security-reviewer、初回失敗込み）〜closure
  修正〜git 事故対応〜rebase〜PR #208 作成までを 1 セッションで実施。
- **関連成果物**: `docs/designs/better-auth-login.md` / `docs/designs/better-auth-login.contract.md` /
  `docs/implementation-plans/better-auth-login.md` / `docs/tests/better-auth-login.md` /
  `docs/reviews/better-auth-login.md`（Task 1 初回レビュー・Task 2 closure review） /
  `docs/reviews/better-auth-login.security.md` / `docs/decisions/ADR-0023-better-auth-login.md` /
  `docs/decisions/ADR-0021-basic-auth-for-public-repository.md`（Superseded） /
  `logs/2026-09-17.md` / PR #206（クローズ）・#207（依存更新・harness 修正）・#208（本体）

## タスクメトリクス（logs/2026-09-17.md から拾える範囲）

- **主要工程数**: 要件確認・Gate A 確定 → 設計（architecture-designer, Fable オーバーライド）
  → 契約/実装計画/試験計画（並列 3 委譲）→ 整合確認（validate-deliverables）→ 実装（implementer
  5 回）→ レビュー（reviewer・security-reviewer、並列・初回失敗込みで実質 2 ラウンド）→
  closure 修正 → git 事故発見・復旧 → 依存更新の先行 PR 分離（#206→#207 作り直し）→
  main への rebase・ADR 振り直し → closure review → PR #208 作成、の 11 段階。
- **Subagent 委譲回数（リトライ込み概算）**: architecture-designer 1 + contract-designer 1 +
  implementation-planner 1 + test-designer 1 + implementer 5 + reviewer 3（429 失敗 1 +
  Task 1 成功 1 + Task 2 closure 成功 1）+ security-reviewer 2（429 失敗 1 + 成功 1）
  ＝ **概算 15 回**。
- **手戻り**: reviewer BLOCK 2 件（B-01/B-02）+ security-reviewer BLOCK 2 件（SEC-1/SEC-10）を
  closure で解消、FOLLOW_UP 計 11 件（reviewer 3 + security 8。うち即時対応・受容含む）、
  git 汚染からの復旧（2 ブランチへ `rebase --exec 'commit --amend --reset-author'`）、
  先行 PR の作り直し 1 回（#206 → #207）、ADR 番号の振り直し 16 ファイル。
- **所要時間**: 記載しない（close-session が自動推定する運用のため）。

## 観測した事象（複数可）

### 事象 1: Opus の月間利用上限（HTTP 429）から成果物なしで停止 → 冪等判定での再委譲が機能した

- **種類**: 成功手順（環境要因からの回復）
- **観測した事象**: reviewer・security-reviewer（ともに `model: claude-opus-5`）を並列委譲した
  初回、両方とも起動直後に HTTP 429（monthly spend limit）で停止し成果物ゼロだった。21:33 に
  `docs/reviews/better-auth-login*` の不在を確認したうえで同一指示のまま再委譲し、両方完了した
  （`logs/2026-09-17.md` L40-42）。
- **発生回数**: このタスク内 1 回（reviewer・security-reviewer 2 Agent 同時）。
  **関連する先行事象**: `candidates/public-release-basic-auth.md` 事象 1（Fable の 429 で
  architecture-designer が停止、累計 2 回）とはトリガー種別（HTTP 429・利用上限）は同じだが、
  対象 Agent・モデル（Opus のレビュー系 2 本）が異なる。今回は Fable 専用のフォールバック文言
  ではなく、`orchestration-policy.md` §再開時の完了判定の**一般的な冪等判定**（期待成果物の
  有無で判定してから再委譲）で回復した点が異なる。
- **対象タスク**: better-auth-login（reviewer・security-reviewer）/ 関連: public-release-basic-auth・
  expiry-alert（architecture-designer・Fable）
- **原因仮説**: モデルの利用上限超過は Agent・モデルを問わず「起動直後に成果物ゼロで停止」という
  同じ壊れ方をする。既存の一般ルール（成果物の有無で冪等判定 → 再委譲）がモデル非依存で機能した。
- **改善案**: 追加変更は不要。今回の事例は「Fable 専用」に見えていたフォールバックが実際には
  Opus のレビュー系 Agent にも汎用的に効くことを実地で確認した、という記録が主目的。
- **変更対象**: なし（既存ルールの追加確認）
- **想定される副作用**: なし
- **評価方法**: 次に Opus/Fable 以外のモデルで同種の 429 が起きた際も、同じ冪等判定で復旧できるかを確認する。
- **昇格判定**: Memory 留め（昇格せず）。既存ルールが機能した確認のため新規候補は不要。
  orchestrator Subagent Memory に「429 は Fable 固有ではなく Opus のレビュー系でも発生し、
  同じ冪等判定で回復する」と 1 行残すことを推奨。

### 事象 2: security-reviewer が Write ツールを持たず、レビュー記録を本文で返した（Orchestrator が代理保存）

- **種類**: Agent 定義とレビュー成果物保存フローの構造的なギャップ
- **観測した事象**: `.claude/agents/security-reviewer.md` の `tools` は `Read, Grep, Glob, Bash`
  のみで Write が無い。今回、指摘内容が本文（HTML エスケープされた状態）で返り、Orchestrator が
  エスケープを復元して `docs/reviews/better-auth-login.security.md` として保存した
  （同ファイル冒頭の注記、`logs/2026-09-17.md` L47-49）。ログの気づき欄に
  「expiry-alert のときも同じ運用だったか次回確認」と記載されている。
- **発生回数**: このタスク内 1 回（確認済み）。`docs/reviews/expiry-alert.security.md` は
  存在するが、同ファイルには「Orchestrator が保存した」旨の注記が無く、当時どちらの経路で
  保存されたかは**未確認**（agent 定義の `tools` は今回確認した限り一貫して Write を含まないため、
  構造的には毎回同じ手動保存が必要になっている可能性が高いが、ログ上の直接証拠はない）。
- **対象タスク**: better-auth-login（確認済み）/ expiry-alert（未確認・構造的には同型の可能性）
- **原因仮説**: security-reviewer は「コードを変更しない」という制約からツールを絞っているが、
  この制約は「コード」であって「自分のレビュー記録の保存」までは本来含意しない。ツール設計時に
  両者を区別せず一括して Write を外した可能性がある。
- **改善案（どちらか一方、または両方を manager 判断で選択）**:
  1. `security-reviewer.md` の `tools` に Write を追加する。ただし書き込み先を
     `docs/reviews/*.security.md` に限定する運用注記を agent 定義に明記し、コード変更の禁止は
     維持する（「コードは変更しない」の制約とは独立した権限として整理）。
  2. Write を追加せず、Orchestrator（または reviewer）が security-reviewer の本文出力を
     `docs/reviews/<feature>.security.md` へ保存する手順を Skill（`reflect-task` ではなく
     レビュー実施系の Skill、または `orchestration-policy.md`）に明文化し、HTML エスケープの
     復元を含めて手順化する。
- **変更対象**: `.claude/agents/security-reviewer.md`（選択肢 1）または
  `docs/claude-code/orchestration-policy.md` ほかレビュー実施手順（選択肢 2）。
  いずれも Agent のツール権限 or 実行手順の変更で **PR レビュー承認境界**に該当する。
- **想定される副作用**: 選択肢 1 は「コードは変更しない」という Agent の自己認識に Write が
  混ざることで、将来 security-reviewer が誤ってコードへ書き込むリスクをゼロにはできない
  （書き込み先限定の運用注記だけでは Hook レベルの強制にならない）。選択肢 2 は Orchestrator の
  手作業が構造的に毎回発生し続け、HTML エスケープ復元のような機械的だが省略されやすい手順が残る。
- **評価方法**: 次に security-reviewer を起動するタスクで、レビュー記録の保存が手作業なしで
  完了するか（選択肢 1）、または手順どおりに欠落なく保存されるか（選択肢 2）を確認する。
- **昇格判定**: **昇格候補として提示**（manager の横断分析対象）。1 回のみの確定観測だが、
  security-reviewer を起動するたび**構造的に必ず発生する**（Agent 定義を変えない限り毎回同じ
  手作業が要る）ため、通常の「3 回以上」を待つ前に選択肢の提示だけ済ませておく。
  最終判断（選択肢 1 か 2 か、あるいは見送りか）は manager と人間に委ねる。

### 事象 3: pre-push の `pnpm test:harness` がフック元リポジトリを汚染した（重大インシデント・恒久的な設計論点）

- **種類**: テスト失敗（環境／ハーネス設計起因）・重大インシデントに近い手戻り
- **観測した事象**: review-readiness のサンドボックス git が `GIT_DIR` 等の環境変数を継承した
  ため、フック元の実リポジトリに対して動作し、(a) 別ワークツリー（`../Cookpit-deps-audit`）の
  ブランチに「全 1,219 ファイル削除 + `src/example.txt`」の "initial" コミットが 2 つ混入
  （PR #206 → 作り直して #207）、(b) ワークツリー共有の `.git/config` の `user.name`/`user.email`
  が `Review Test <test@example.com>` に書き換わり、closure 修正 10 コミット + #207 の 4
  コミットの著者が誤った（`rebase --exec 'commit --amend --reset-author'` で両ブランチを修復、
  リモートは force push が必要なためユーザーへ依頼）、(c) `core.bare=true` に書き換わり
  implementer がそのつど手動で戻していた（`logs/2026-09-17.md` L54-58, L74-89）。
  根本原因は 2 つ: ①`harness-state.test.mjs` の `URL#pathname` が日本語パスを扱えない、
  ②review-readiness のサンドボックス git（テストコード）と ③`review-readiness.mjs` 本体
  （**プロダクションコード**。Stop hook 等から通常運用でも呼ばれる）の**両方**が、子プロセス
  `git` 呼び出し時に `GIT_DIR` / `GIT_INDEX_FILE` 等を明示的に落とした env を渡していなかった。
  PR #207 で 3 点とも修正済み。`LEFTHOOK=0` によるフック無効化や `push --force` は
  `guard-dangerous.mjs` が正しくブロックしており、この防御自体は機能していた。
- **発生回数**: このタスク内で実害 3 系統（ブランチ混入・著者破損・`core.bare` 反転）。
  根本原因は git フック配下で git を子プロセス実行するコード**一般**に共通するクラスの不具合で、
  他候補ファイルに同種の記録は無い（新規）。
- **対象タスク**: better-auth-login。影響範囲は `.claude/scripts/review-readiness.mjs` と
  そのテストハーネス一式（feature 非依存）。
- **原因仮説**: Node の `child_process` で `git` を spawn する際、`env` を明示しなければ
  `process.env` がそのまま継承される。git フック（pre-push）から起動されたプロセスは
  `GIT_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE` 等を既に持っており、これが子プロセスの
  `git -C <別ディレクトリ>` や `cwd` 指定より優先されるため、意図と異なるリポジトリに対して
  git コマンドが実行される。テストのサンドボックスだけでなく、本番運用コード
  （`review-readiness.mjs`）も同じ欠陥を持っていた点が重大（テストのバグに閉じていなかった）。
- **改善案（3 案。manager の横断分析・人間承認を想定）**:
  1. **横展開の監査**: `.claude/scripts/` / `.claude/lib/` 配下で `git` を子プロセス実行する
     全箇所を洗い出し、`env` を明示的に渡していない箇所を確認する。実測:
     `.claude/scripts/check-codex-implementation.mjs` の `gitAt()`（`execFileSync('git', args,
{ cwd, encoding, maxBuffer })`）は `env` を渡しておらず、`cwd` 指定だけで `GIT_DIR` 系の
     継承を防げていない。現状はこのスクリプトが git フックから呼ばれる経路は無い（Orchestrator
     からの手動実行が前提）ため実害は未確認だが、将来フック配線されれば同じ罠に落ちる。
     `GIT_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE` / `GIT_OBJECT_DIRECTORY` 等を明示的に
     `delete` した `env` を渡す共通ヘルパー（例: `spawnGitClean()`）に統一し、監査結果を
     Skill か `docs/claude-code/harness-state.md` に記録する。
  2. **pre-push で git を子プロセス実行するテストを回す設計自体の是非**: `lefthook.yml` の
     コメント（`pre-push.harness`）は「ローカルでの早期フィードバック用で、最終的な必須ゲートは
     CI が担う」と明記している。CI が最終ゲートであるなら、git サンドボックスを伴う重いテスト
     （review-readiness 系）は pre-push から外し CI 専任にする選択肢がある。pre-push には
     git を子プロセス実行しない軽量サブセットのみ残す。
  3. **regression test の追加**: 「ハーネスのどの git 呼び出しも `GIT_*` を継承した `env` を
     渡していないこと」を機械的に検証するテスト（対象ファイルを grep するか、`env` に
     `GIT_DIR` をダミー値で注入した状態でサンドボックス操作が汚染されないことを確認する）を
     追加し、同クラスの再発を CI で検知できるようにする。
- **変更対象**: `.claude/scripts/check-codex-implementation.mjs`（案 1・要監査）、
  `lefthook.yml`（案 2・pre-push の対象縮小。**破壊的変更のため人間承認必須**）、
  `.claude/tests/`（案 3・回帰テスト追加）。案 1・3 は非破壊的な追加、案 2 は Hook の
  ブロック条件変更に相当し PR レビューで確認する。
- **想定される副作用**: 案 2（pre-push 縮小）は「ローカルでの早期フィードバック」が失われ、
  同種のバグが CI まで検出されずに進む可能性がある（今回はローカルで検出できたからこそ実害が
  外部に出る前に気づけた側面もある）。案 1・3 は追加の保守対象が増える。
- **評価方法**: 案 1 は `.claude/scripts/*.mjs` の git 呼び出し全数に対する監査結果を
  `docs/claude-code/harness-state.md` 等に記録し、次回同種スクリプト追加時にレビュー観点として
  使えるか確認する。案 3 は追加した regression test が実際に旧バグ（`env` 未指定）を検出できるか
  （旧コードに対して再実行し FAIL することを確認）。
- **昇格判定**: **昇格候補（強く推奨）**。memory-policy の昇格条件「本番障害または重大な試験
  不具合につながった」に直接該当する（実ブランチへのファイル全削除コミット混入、10 コミット超の
  著者破損、force push を要する復旧）。1 回の発生だが実害の重大性から早期昇格の対象とする。

### 事象 4: `new URL(...).pathname` が日本語パス配下で壊れる不具合が、タスク内で 2 箇所発見された

- **種類**: テスト失敗（原因分類: 環境）・横断的な潜在バグ
- **観測した事象**: (a) `vitest.*.config.mts` の alias 解決が `URL#pathname` を使っており、
  リポジトリのパス（`/Users/siro/個人開発/Cookpit`。`個人開発` が非 ASCII）配下では
  `vi.mock('@/...')` が解決できなかった（implementer が自主検知し `fileURLToPath` へ修正。
  `logs/2026-09-17.md` L101-102）。(b) `harness-state.test.mjs:301` が同じ `URL#pathname` 起因で
  1 件失敗した（事象 3 の根本原因①。PR #207 で修正）。reviewer の closure review
  （`docs/reviews/better-auth-login.md` L339-341）はこれを「PRE_EXISTING・本 feature の
  差分外」として受け入れ判定から分離しているが、原因は本 feature 側の実装是正 (a) と同一クラス。
- **発生回数**: このタスク内で独立に 2 箇所（vitest alias 設定・harness-state テスト）。
  過去の候補ファイル・backlog に同種の記録は無い（新規）。
- **対象タスク**: better-auth-login。ただしリポジトリのパス自体が恒久的に日本語を含むため、
  **今後も新規に `new URL(...).pathname` でファイルパスを組み立てるコードを書けば同じ理由で
  再発する**構造的リスク。
- **原因仮説**: `URL#pathname` は非 ASCII 文字を percent-encode するため、ファイルシステムの
  パスとして使うと文字化けする（`fileURLToPath()` は正しくデコードする）。このリポジトリの
  絶対パスが恒常的に日本語を含むため、Cookpit 固有の再現条件になっている。
- **改善案**: リポジトリ全体で `new URL(import.meta.url).pathname`（または類似パターン）を
  grep し、ファイルパスとして使っている箇所を `fileURLToPath` へ置き換える監査タスクを起票する。
  加えて、新規にモジュールパス解決コードを書く際の注意点として「`import.meta.url` から
  ファイルパスを得るときは `fileURLToPath` を使う（`URL#pathname` は不可、日本語ディレクトリ名
  で壊れる）」という 1 行を coding-standards 相当の場所に残す価値がある
  （ただし 2 回とも「設定・テストコード」領域であり、プロダクションコードでの発生はまだ無い）。
- **変更対象**: （まだ未定）監査タスクは別タスク化。恒久記述先は `.claude/rules/coding-standards.md`
  または Auto Memory（`build-and-test` トピック）が候補。
- **想定される副作用**: 監査の範囲を広げすぎるとトークン消費が増える。`import.meta.url` を
  ファイルパスへ変換している箇所（設定ファイル・スクリプト系が主）に絞れば局所的で済む。
- **評価方法**: 監査後、`grep -rn "new URL(import.meta.url).pathname\|\.pathname" .claude
vitest.*.config.mts` 相当の再検索で残存箇所がゼロになることを確認する。
- **昇格判定**: Memory 留め（昇格せず・累計 2 回。3 回条件は未達）。ただしリポジトリのパスが
  恒久的に日本語を含む構造的事実があるため、**次に同種の不具合が 1 件でも見つかれば即昇格**を
  推奨する（3 回目を待たずに早期対応の余地がある「確証あり・修正極小」に近い性質）。

### 事象 5: implementer 1 回目がコミット指示ありにもかかわらずコミットせず終えた

- **種類**: ユーザー（Orchestrator）指示の不遵守・手戻り小
- **観測した事象**: implementer 1 回目（Step 0〜3・7）は品質ゲート全通過で完了したが、
  指示にコミットの実施が含まれていたにもかかわらずコミットせずに終えた。Orchestrator が代行
  コミット（`8f2f39e` / `a2d6537`）した。2 回目以降は「コミットせずに終えない」を指示で強調し
  解消した（`logs/2026-09-17.md` L33-35, 気づき欄）。
- **発生回数**: このタスク内 1 回（1 回目のみ。2〜5 回目は再発なし）。
  backlog の「implementer が完了報告なく停止し検証報告が皆無」系の累計 5 回相当パターン
  （`candidates/public-release-basic-auth.md` 事象 2、`candidates/offline-write-queue.md` 事象 4）
  とは症状が異なる（今回は完了報告・品質ゲート結果は正しく返っており、コミットという
  1 アクションのみが漏れた）。関連はするが同一カウンタには合算しない。
- **対象タスク**: better-auth-login（implementer 1 回目のみ）
- **原因仮説**: 指示文中の「コミットする」が、品質ゲート実行や成果物報告と並ぶ複数指示の
  1 項目に埋もれていた可能性がある（2 回目以降、同じ指示を「強調」しただけで解消したことから、
  指示の表現の強さに依存していたことが伺える）。
- **改善案**: implementer への委譲指示のテンプレートで「コミットする」を他の完了条件と並列の
  1 項目としてではなく、末尾に独立した箇条書き（例:「作業完了 = 品質ゲート通過 **かつ**
  コミット完了。コミットせずに完了報告しない」）として強調する。
- **変更対象**: （まだ未定 — 1 回目の観測。再発したら `.claude/agents/implementer.md` または
  `orchestration-policy.md` の委譲テンプレートへの追記を検討）
- **想定される副作用**: 強調表現を増やすと implementer への指示が長くなる。他の完了条件との
  優先度が曖昧にならないよう、追記は 1 行に留めるのが望ましい。
- **評価方法**: 次回 implementer への委譲で、コミット漏れが再発しないか確認する。
- **昇格判定**: Memory 留め（昇格せず・1 回目）。2 回目以降で同一セッション内に自己解消して
  いるため緊急度は低いが、再発時は早期昇格を検討する。

### 事象 6: ADR 番号の衝突（並行 PR のマージ順序に起因）

- **種類**: Agent 間というより並行開発起因の手戻り（恒久記録への影響あり）
- **観測した事象**: 本 feature が `ADR-0022-better-auth-login.md` としてチェックポイント
  コミット時点で採番していたが、並行して main へマージされた PR #205（review-readiness の
  決定インターフェース化）が同時期に `ADR-0022-review-readiness-as-decision-interface.md` を
  採番・マージ済みだった。rebase 時に本 feature 側を `ADR-0023` へ振り直し（参照 10 文書超・
  16 ファイル。`logs/2026-09-17.md` L83-85, L61）。
- **発生回数**: このタスク内 1 回。**構造的に類似する先行事象がある**: `improvement-backlog.md`
  §申し送り「IMP-2026-020〜023 の二重採番」（2026-07-15）も、並行ブランチが同じ連番
  （IMP-2026-020/021）を独立に採番し、マージ順序で衝突した事例。対象ドメイン（ADR と IMP 提案
  番号）は異なるが、「連番を採るファイル群を複数ブランチが並行して編集し、マージ順で確定する」
  という根本構造は同一。**この意味で累計 2 件目**。
- **対象タスク**: better-auth-login（ADR）/ improvement-backlog 二重採番（IMP、2026-07-15）
- **原因仮説**: ADR・IMP のような逐次採番ファイルは、ブランチ作成時点でのローカルな「次の
  空き番号」を仮に採用してしまうと、他ブランチが同時に同じ番号を使っていても作業中は検知できない。
  番号の確定は本質的に「main へのマージ順」でしか一意に決まらない。
- **改善案（2 案）**:
  1. **マージ時点で確定する運用**: ブランチ上での ADR 番号は「仮番号」として扱い、
     PR 作成直前（または rebase 直前）に `main` の最新状態を見て空き番号を再確認・確定する
     手順を明文化する（設計 Skill・PR 作成手順に 1 行追記）。
  2. **予約制**: `docs/decisions/README.md`（または同等の索引）に採番済み・作業中の ADR 番号を
     一覧化し、新規 ADR 作成時にその一覧へ「作業中」として追記する（あるいは grep でカバーできる
     なら不要）。ただし複数ブランチ間でファイルを共有しないと機能しないため、運用コストに見合うか
     要検討。
- **変更対象**: `.claude/skills/create-design-document/SKILL.md`（ADR 採番手順への追記。
  非破壊的な Skill 追加のため manager レビュー後可）または PR 作成手順（`development-workflow.md`）。
- **想定される副作用**: 案 1 は「PR 直前に番号を再確認する」手順が 1 ステップ増える
  （軽微）。案 2 は索引ファイルのメンテナンスコストが増え、更新漏れが起きれば無意味化する。
- **評価方法**: 次に ADR を伴う L3 タスクが main と並行して走った際、番号衝突が再発しないか
  （または再発しても rebase 時に機械的に検知できるか）を確認する。
- **昇格判定**: Memory 留め（昇格せず・ADR 単体では 1 回目）。ただし IMP 番号衝突と合わせた
  「連番ファイルの並行採番」という上位テーマでは累計 2 件目であり、**3 件目が発生したら
  昇格を推奨**（上位テーマとして扱う場合は次回で条件充足）。

### 事象 7: 計画外の是正 3 件（うち 2 件は環境・依存の一時是正、実装計画の記載と乖離した判断を含む）

- **種類**: 実装計画からの逸脱（軽微・実害なし）・レビュー観点での申し送り
- **観測した事象**:
  1. `@better-auth/cli` を devDependency に固定する実装計画 Step 0-1 の判断
     （`docs/implementation-plans/better-auth-login.md` L156）に反し、実装時に pnpm のピア
     解決が壊れ `generate` が失敗したため `pnpm dlx` での都度実行に変更した
     （`cli.config.ts` に理由を記載。reviewer が「第二段での再現手順として十分」と確認済み）。
  2. `db:generate` が既存 `shopping_items` / `shopping_lists` へ無関係な
     `ALTER COLUMN ... DROP DEFAULT` 3 行を出した（`0009_snapshot.json` の旧形式に由来する
     既存ドリフト。実 DB では no-op と確認済み、reviewer P-01 で `resolved`。**恒久的に解消済み**
     — 新しい `0010_snapshot.json` は当該キーを持たないため再発しない）。
  3. `vitest.*.config.mts` の alias が日本語パスで壊れる問題（事象 4 と同一。ここでは重複記載
     せず事象 4 を参照）。
- **発生回数**: 1 と 2 はこのタスク内 1 回ずつ。1 は実装計画の判断が実装時に覆った初のケース、
  2 は既に構造的に再発しないことが確認済み（P-01）。
- **対象タスク**: better-auth-login
- **原因仮説（1 のみ）**: 実装計画が「CLI パッケージを devDependency に固定する」という判断を
  下した時点では pnpm のピア解決の実挙動を検証していなかった（設計時の仮定と実装時の実測が
  食い違った）。CLI ツールを devDependency に固定する設計判断は、ピア依存の衝突リスクを
  実装前に検証していないと覆る可能性がある。
- **改善案**: 実装計画で「CLI ツール等を devDependency として固定する」判断を書く場合、
  実装前提として `pnpm install` を一度実行してピア解決が壊れないかを Step 0 相当のスパイクに
  含める（今回はスパイク項目 0-1 に含まれていたが「追加のみ」で peer 解決確認は無かった）。
- **変更対象**: （まだ未定 — 1 回目。再発したら `.claude/skills/create-implementation-plan/SKILL.md`
  の「CLI/ツール系依存追加時はピア解決の実測をスパイクに含める」への追記を検討）
- **想定される副作用**: スパイク項目が増えるとStep 0 の所要が伸びる。今回は既にスパイク方式が
  機能した（12 項目中 12 が OK でフォールバック不要）ため、追加は 1 項目程度に抑えるのが妥当。
- **評価方法**: 次回 CLI ツールを devDependency 化する設計判断が出た際、ピア解決の実測が
  Step 0 に含まれているか確認する。
- **昇格判定**: Memory 留め（昇格せず）。1 は 1 回目・実害軽微（実装時に自己解消）。
  2 は既に恒久的に解消済みのため追加対応不要（reviewer P-01 のとおり）。

### 事象 8: Subagent が Web に出られない制約を、Orchestrator の事前調査でカバーし Step 0 スパイクが 12/12 OK だった

- **種類**: 成功手順
- **観測した事象**: Subagent は Web に出られないため、Better Auth 1.7.5 の事実（API 形・
  パッケージ名・既定値。例: `@better-auth/passkey` は別パッケージ、CLI は `@better-auth/cli`
  1.4.21）を Orchestrator が WebFetch で事前に集め、委譲プロンプトへ埋め込んだ
  （`logs/2026-09-17.md` 気づき欄）。結果、実装計画 Step 0 のスパイク検証 12 項目
  （0-2〜0-12。契約書 §10 の要検証事項とも重なる）が**すべて OK でフォールバック不要**だった
  （`docs/implementation-plans/better-auth-login.md` L166-286、`docs/designs/…contract.md` §10）。
- **発生回数**: このタスク内 1 回（Step 0 スパイク 12/12 OK という結果は初計測）。
- **対象タスク**: better-auth-login
- **原因仮説**: 外部ライブラリの実挙動に関する不確実性は、実装前に事実収集を厚くするほど
  実装時のフォールバック分岐が不要になる。今回は Orchestrator が主体的に事前調査を担い、
  委譲プロンプトへ根拠として埋め込んだことで、実装計画が立てた NG 分岐（罠 2・罠 10 など）が
  ほぼ発生しなかった。
- **改善案**: 外部ライブラリ・SDK を新規導入する L2/L3 タスクでは、設計・実装計画の前に
  Orchestrator が対象バージョンの一次情報（公式ドキュメント・ソース）を WebFetch で収集し、
  委譲プロンプトへ「確認済みの事実」として埋め込む進め方を標準パターンとして扱う。
- **変更対象**: orchestrator Subagent Memory（成功パターンとして記録）。
- **想定される副作用**: 事前調査に時間を使うため、単純な機能追加では過剰投資になりうる。
  「新規外部ライブラリ導入」かつ「Subagent が検証できない API 詳細に依存する」場合に限定するのが妥当。
- **評価方法**: 次に外部ライブラリを新規導入する L2/L3 タスクで、Step 0 相当のスパイク成功率を
  比較する（今回 12/12 OK を基準値とする）。
- **昇格判定**: Memory 留め（昇格せず・成功 1 回目）。次回同型タスクでも再現すれば
  `docs/claude-code/orchestration-policy.md` または `create-implementation-plan` Skill への
  昇格を検討する（memory-policy「成功パターンの複数タスク再現」）。

### 事象 9: reviewer が PGlite + 実ハンドラの black-box を自前実行し、契約書の未検証項目を実測で埋めた

- **種類**: 成功手順
- **観測した事象**: reviewer が `createAuth(...).handler(new Request(...))` を使った一時スクリプト
  （リポジトリ外）で PGlite + 実ハンドラへ疑似 HTTP リクエストを送り、契約書 §10 の未解決項目の
  うち 5・7・9・10・11・17（Cookie の Secure 判定・DB ストレージのレート制限・429 の形・
  sign-out/revoke-other-sessions の応答形・sign-up のコード・session_data の属性）を実測で
  埋めた（`docs/reviews/better-auth-login.md` L224-243）。試験計画側で test-designer が
  差し戻し候補として提示していた 3 件（§14-2）は Orchestrator 判断で吸収した。
- **発生回数**: このタスク内 1 回。
- **対象タスク**: better-auth-login
- **原因仮説**: reviewer に「コードは変更しないが実行して確認してよい」という black-box 検証の
  裁量があり、契約書が「未検証」と明記していた項目を実装後に reviewer 自身が埋める運用が
  機能した。test-designer が実装前に立てた「自動化困難」判定（§14-1）とは独立に、実装後の
  reviewer が実測で補完できる範囲が広かった。
- **改善案**: 契約書・試験計画が「未検証」と明記した項目のうち、実装後に PGlite +
  実ハンドラで black-box 実行すれば確認できるものは、reviewer の標準確認手順として明示的に
  期待してよい（今回は reviewer が自発的に実施した）。
- **変更対象**: （まだ未定 — 1 回目。再現したら `.claude/agents/reviewer.md` または
  `docs/claude-code/orchestration-policy.md` の reviewer 起動条件への追記を検討）
- **想定される副作用**: black-box 実行はリポジトリ外の一時スクリプトに依存するため、
  reviewer ごとに実行内容が再現困難（監査ログに実測値は残るが、スクリプト自体は残らない）。
  再現性を求めるなら、契約書の「要検証事項」をテストコードへ組み込む方が望ましいが、それは
  test-designer/implementer の責務であり reviewer の即興確認とは役割が異なる。
- **評価方法**: 次回 L3 タスクで、契約書の「未検証」項目のうち reviewer の black-box 実行で
  何件埋まったかを記録し、比率が今回（6/複数件）と同程度か確認する。
- **昇格判定**: Memory 留め（昇格せず・成功 1 回目）。reviewer Subagent Memory に
  「PGlite + 実ハンドラでの black-box 実行は契約書の未検証項目を埋める有効な手段」と
  記録することを推奨。

### 事象 10: 上流 3 Agent の並列委譲は機能したが、新規ファイルの命名が 3 文書で 3 通りに分かれた

- **種類**: 成功手順 + 軽微な Agent 間認識不一致（実害化せず）
- **観測した事象**: contract-designer / implementation-planner / test-designer を並列委譲し、
  contract-designer には設計書本体を編集させず別ファイル（`*.contract.md`）へ書かせることで
  競合を避けた（`logs/2026-09-17.md` L117-119）。一方、3 者が独立に言及した Service Worker の
  純関数切り出し先ファイル名が、契約書・実装計画・試験計画で 3 通りに分かれていた。
  validate-deliverables による整合確認で `apps/web/src/app/_utils/sw-cache-plugins.ts` に
  統一し、実装前に解消した（`logs/2026-09-17.md` L29-31、コミット `05fede0`/`f4af2de`）。
- **発生回数**: このタスク内 1 回。過去の候補・backlog に同種の記録は無い（新規）。
- **対象タスク**: better-auth-login
- **原因仮説**: 3 Agent を並列委譲すると、各自が独立に「新規ファイルが必要」と判断した場合、
  他 Agent の命名を見る手段が無いため独自の名前を付けてしまう。今回は試験計画側の設計への
  差し戻し候補（§14-2 事象 1）がこの新規ファイルの必要性自体を提起しており、3 者の判断が
  「切り出しが必要」という結論では一致していたが名前だけがずれた。
- **改善案**: 並列委譲する Agent 群が新規ファイルを提案しうる場合、(a) 委譲プロンプトに
  「新規ファイルの命名は `<層>/<用途>.ts` のような命名規則で統一し、他文書との突き合わせは
  Orchestrator の validate-deliverables に委ねてよい」と明記するか、(b) validate-deliverables
  の確認観点に「新規ファイルパスの一致確認」を明示的に含める（今回は機能したため、明文化のみで
  足りる可能性が高い）。
- **変更対象**: （まだ未定 — 1 回目。今回の validate-deliverables は実害なく機能したため、
  再発時に `docs/claude-code/orchestration-policy.md` §validate-deliverables 観点への
  追記を検討）
- **想定される副作用**: 命名規則を厳格化しすぎると、各 Agent の専門判断（設計上自然な配置）を
  阻害する可能性がある。
- **評価方法**: 次回 3 Agent 並列委譲時に、新規ファイル命名の不一致件数が今回（1 件）と比べて
  増減するか確認する。
- **昇格判定**: Memory 留め（昇格せず・1 回目・実害化せず実装前に解消）。

### 事象 11: implementer を 2 回に分割し文脈量を抑えた

- **種類**: 成功手順
- **観測した事象**: implementer を Step 0〜3・7（1 回目）と Step 4〜6・8・9（2 回目）に分割して
  委譲した。両回とも品質ゲート全通過・計画外の新規ファイルゼロで完了した
  （`logs/2026-09-17.md` L33-39）。
- **発生回数**: このタスク内 1 回（L3・10 Step の実装計画に対する分割）。
- **対象タスク**: better-auth-login
- **原因仮説**: 10 Step にわたる大規模実装計画を単一の implementer 委譲にまとめると文脈量が
  膨らみ見落としのリスクが増える。ステップ境界（依存関係が薄い箇所）で分割することで、
  各回の文脈を絞れた。
- **改善案**: L3 で実装計画が 8 Step 以上にわたる場合、Step の依存関係を見て 2 回以上に
  分割する委譲を標準パターンとして検討する。
- **変更対象**: （まだ未定 — 1 回目。再現したら `docs/claude-code/orchestration-policy.md` の
  implementer 委譲方針への追記を検討）
- **想定される副作用**: 分割回数が増えるほど Orchestrator の統合コスト（コミット代行・
  引き継ぎ確認）が増える。今回も 1 回目はコミット漏れ（事象 5）が発生しており、分割自体が
  無コストではない。
- **評価方法**: 次回同規模（8 Step 以上）の L3 実装で、分割の有無による手戻り件数を比較する。
- **昇格判定**: Memory 留め（昇格せず・1 回目）。

### 事象 12: Vercel Preview デプロイの「Deployment was blocked」が #206/#207/#208 で共通して発生（原因未確認）

- **種類**: 未確認の環境事象（外部プラットフォーム起因の可能性）
- **観測した事象**: PR #206・#207・#208 のいずれでも Vercel の Preview デプロイが
  「Deployment was blocked」で失敗した。また `main` の CI・Post-deploy readiness も
  PR #205 マージ後の push で failure になっている（`logs/2026-09-17.md` L137-138）。
  **原因は未確認**（次回やることとしてダッシュボード確認が申し送られている）。
- **発生回数**: このタスク内で PR 3 本すべてに発生。原因未特定のため過去との比較は不能。
- **対象タスク**: better-auth-login（および並走した依存更新 PR #206/#207）
- **原因仮説**: 不明（推測で補完しない）。Vercel 側の設定・シークレット・デプロイ保護ルールの
  いずれかが疑われるが、本セッションの範囲では確認できていない。
- **改善案**: Orchestrator・Subagent はいずれも Vercel ダッシュボードへアクセスできないため、
  人間による確認が必要（申し送り済み）。改善候補としては起票せず、次回セッションへの
  引き継ぎ事実として記録するのみ。
- **変更対象**: なし（人間の確認待ち）
- **想定される副作用**: なし
- **評価方法**: 該当なし（原因判明後に再評価）
- **昇格判定**: 対象外（Memory・改善候補いずれにも該当しない外部要因の事実記録）。

## まとめ

- **改善候補として起票したもの**（→ backlog への追記は本 reflection では実施しない。
  理由は下記「backlog への追記について」を参照）:
  - 事象 2: security-reviewer が Write を持たず本文転記になる構造的ギャップ
    （選択肢 1: Write 追加 / 選択肢 2: 保存手順の明文化。manager 判断を推奨）
  - 事象 3: pre-push `test:harness` の GIT_\* 継承によるリポジトリ汚染（重大インシデント相当。
    横展開監査・pre-push 設計の見直し・regression test 追加の 3 案を提示。**強く昇格推奨**）
- **Memory に留めたもの**（昇格せず・再発監視）:
  - 事象 1: Opus 429 からの冪等判定リトライが Fable 以外にも汎用的に機能した（成功パターン確認）
  - 事象 4: `URL#pathname` の日本語パス不具合が 2 箇所で発見された（累計 2 回。次回 1 件で即昇格推奨）
  - 事象 5: implementer 1 回目のコミット漏れ（1 回目・同セッション内で自己解消）
  - 事象 6: ADR 番号の衝突（ADR 単体では 1 回目。IMP 番号衝突と合わせた上位テーマでは累計 2 件目）
  - 事象 7: 計画外の是正（`@better-auth/cli` の devDependency 化がピア解決を壊した。1 回目）
  - 事象 8: Orchestrator の事前 Web 調査で Step 0 スパイクが 12/12 OK（成功パターン 1 回目）
  - 事象 9: reviewer の PGlite + 実ハンドラ black-box が契約書の未検証項目を実測で埋めた（成功パターン 1 回目）
  - 事象 10: 上流 3 Agent 並列委譲は成功、ただし新規ファイル命名が 3 通りに分かれた（1 回目・実害化せず）
  - 事象 11: implementer の 2 分割委譲が文脈量抑制に機能した（成功パターン 1 回目）
- **対象外（事実記録のみ）**:
  - 事象 12: Vercel「Deployment was blocked」の原因未確認（人間のダッシュボード確認待ち）

### backlog への追記について

本タスクの実行指示は「`docs/claude-code/improvements/candidates/better-auth-login.md` 以外への
Write」を明示的に禁止しているため、reflect-task Skill が通常求める
`improvement-backlog.md` への 1 行追記は本 reflection では**実施していない**。
事象 2・事象 3（昇格候補）および事象 4・6（上位テーマでの累計カウント対象）を
`improvement-backlog.md` の「候補（candidate ファイルあり・proposal 起票待ち）」表および
「Memory 留め」表へ追記する作業は、次回の manager 横断分析または別途の Write 許可がある
セッションで行うことを推奨する。
