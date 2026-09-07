# Orchestration ポリシー

Orchestrator（`claude-opus-5`）は**指揮役**であり、自分で詳細設計や大量の実装を
完結させない。タスクを分解し、専門 Subagent（`claude-sonnet-5`）へ委譲する。

`Agent` ツールを持つのは orchestrator・agent-improvement-manager の 2 つ（実務委譲）と、
回帰評価目的の manager→evaluator。orchestrator は常備 11 Agent を起動できる
（IMP-2026-031）。reviewer は他 Agent を起動しない（事実確認は自身の Read/Grep）。
他の Subagent は `Agent` を持たず、互いを起動しない。

> 吸収済み（起動禁止）: requirements-analyst / performance-designer /
> e2e-test-implementer / document-reviewer。定義は `docs/claude-code/archive/agents/` に凍結。

## Orchestrator の責務

1. ユーザー要求の分析
2. 変更レベルの判定（[document-policy.md](./document-policy.md)）
3. タスクの分解
4. 必要な Subagent の選定
5. 実行順序と依存関係の決定
6. 並列実行可能な作業の判定
7. Subagent への明確なコンテキスト提供
8. 各成果物の統合
9. エージェント間の矛盾解消
10. 完了条件の確認（[development-workflow.md](./development-workflow.md)）

Orchestrator は Subagent の出力を**無条件で採用しない**。要件・設計・実装計画・
実装・試験の間に矛盾がないか確認し、矛盾があれば該当 Subagent へ差し戻す。

## 委譲時に必ず伝えること

Subagent へ依頼する際、最低限これらを明示する。

- **目的** … 何のための作業か
- **対象範囲** … 触れてよいファイル・領域
- **対象外** … 触れてはいけない領域
- **参照すべきファイル** … 設計書・既存実装・恒久ドキュメント
- **期待する成果物** … 出力の形式
- **出力先** … 保存パス（`docs/designs/<feature>.md` 等）
- **完了条件** … どうなれば完了か
- **禁止事項** … スコープ外変更・無断の設計変更など

## 委譲フロー（レベル別）

### Level 1

- 必要に応じ implementer に直接修正を依頼、または Orchestrator が確認のみで完結。
- 設計書・計画は作らない。最終報告に変更理由と確認内容を記載。

### Level 2

```
architecture-designer          → docs/designs/<feature>.md
  →〔契約変更あれば contract-designer〕→ Contract 節（§必須起動トリガー参照）
  → implementation-planner     → docs/implementation-plans/<feature>.md
  → test-designer（計画と並行可） → docs/tests/<feature>.md
  → implementer                → 実装 + 単体テスト + lint/型チェック/テスト
  → reviewer                   → 指摘（必要なら docs/reviews/<feature>.md）
  →〔security-reviewer（省略条件あり・§起動条件参照）〕→ セキュリティ指摘
  → reflection-agent           → improvements/candidates/<task-id>.md
```

### Level 3

```
architecture-designer
    → docs/requirements/<feature>.md + docs/designs/<feature>.md
      （外部I/O/大量データ時は設計書の性能節も厚く書く）
  →〔契約変更あれば contract-designer〕→ Contract 節（§必須起動トリガー参照）
  → implementation-planner     → docs/implementation-plans/<feature>.md
  → test-designer              → docs/tests/<feature>.md
  → implementer                → 実装 + 単体テスト +〔E2E基盤整備済みなら E2E〕
  → reviewer                   → docs/reviews/<feature>.md（文書観点含む）
  → security-reviewer          → セキュリティ指摘
  → reflection-agent           → improvements/candidates/<task-id>.md
```

## 実装ルートの分岐（Codex 委譲）

実装ルートは 2 系統ある（選定基準の正典は `docs/06-ai-tools.md` §実装ルートの使い分け、
実行手順は `docs/claude-code/codex-delegation-playbook.md`）。**どちらのルートでも
implementer 工程以外は共通**であり、上流（要件〜試験計画）と下流（振り返り）を省略しない。

```
…→ implementation-planner → test-designer →┬→ implementer（Orchestrator 経路）────────────┬→ reviewer →…
                                           └→ create-codex-brief → Codex 実装（人間が実行） ┘
                                              → review-codex-implementation（受け入れレビュー）
```

Codex 委譲時の必須規律（2026-07-06 Task 01 の main 直コミット・レビュー記録なしの再発防止）:

1. **作業ブランチ必須**。main への直コミットは禁止（lefthook pre-commit の branch-guard がブロック）。
2. **受け入れレビュー必須**。`review-codex-implementation` Skill を PR 作成前に実行し、
   結果（機械検出・品質ゲート・Reviewer の意味レビュー・必要な black-box 証拠）を
   `docs/reviews/<feature>.md` の current-state packet と監査ログへ記録する（**必須**。
   複数 Task の feature では Task 単位で追記）。人間向け packet の書き方は
   `docs/reviews/README.md` の Gate B 規範に従う。
   受け入れレビューが Orchestrator 経路の reviewer 工程に相当する（省略ではなく代替）。
3. **引き渡し hard stop**。PR 作成・「人間レビュー待ち」報告の前に
   `node .claude/scripts/review-readiness.mjs handoff-check --feature <feature>` が
   exit 0 であること（legacy 不可）。PR/チャット要約は `handoff-blurb` を使い、
   正本は常に `docs/reviews/`。承認語は書かない。
4. **reflection-agent は Codex ルートでも実施**する（feature 完了時）。
5. 実装途中でルートを切り替えた場合（Orchestrator ⇔ Codex）、実装計画の「実装ルート」欄を
   更新し、切替理由を日次ログに残す。
6. **PR 作成・マージの主体**: 受け入れレビュー（handoff-check 成功）後、作業ブランチからの
   draft/open PR 作成は Orchestrator（またはレビュー実施セッション）が行い、
   **main へのマージ判断は人間**が行う。
   （出典: shopping-list-core 事象 7 — 合格後の受け渡しが暗黙だった問題の明文化）

## 並列実行の指針

- L3 では `architecture-designer`（requirements + design）を先行させる。orchestrator の
  先行調査フェーズ（任意）で所在情報を渡してよい。
- `architecture-designer` 完了後、`implementation-planner` と `test-designer` は
  並列に進められる（どちらも設計書を入力にするため）。
- `contract-designer` は、契約の骨子（既存 `schema.ts` / `packages/api-contract` から確定
  できる型・nullability・エラー形式）が立てられる場合に限り、`architecture-designer` と
  **並列に先行起動できる**。並列化したときは:
  - 契約書に設計書への参照リンク（「§集約設計は `docs/designs/<feature>.md` を参照」）を必ず入れる。
  - `architecture-designer` が集約境界・新規 Entity・層責務を確定したら、その確定差分を
    orchestrator が `contract-designer` へ追送し、契約を再確認させる（差し戻しでなく追補）。
  - 整合チェックは orchestrator の統合フェーズで行う。
  - **集約構造が未確定で契約の骨子が立てられない L3（新規ドメイン中心）では並列化せず直列**にする。
- 性能観点は `architecture-designer` の条件付き節で設計書に含める（単独 Agent は起動しない）。
- `implementer` は実装計画の確定後に着手する。E2E も同 Agent が条件付きで担当する。
- `reviewer` は実装完了後。設計・計画・実装・試験を突き合わせる。

## 再開時の完了判定（1 原則）

resume・再開直後（stop/resume・強制中断・killed からの復帰を含む）は notification を
待たず、**直前までに委譲した未確認の Sub-agent すべてについて、それぞれの期待成果物の
存在・更新時刻で完了を冪等判定してから次を決める**。完了した分は次工程へ進め、
未完了のものだけを再委譲する（並列 background 委譲の部分完了では、完了済み Sub-agent を
再起動しない）。単一委譲・並列委譲を問わず適用する（「完了待ちループ」と二重起動の
両方を防ぐ。出典: IMP-2026-009 の一般化。単一委譲での実績: meal-plan-screens 2026-07-09 /
pantry-screens 2026-07-19。並列委譲は同判定を各成果物へ適用する）。

> 旧 stop/resume 機構（`inflight-agents.json`・IMP-2026-008）と既知の制約の詳細は
> [archive/orchestration-frozen-mechanisms.md](./archive/orchestration-frozen-mechanisms.md)
> に凍結した（IMP-2026-028。2026-07 時点のハーネス挙動を前提とした機構。ハーネス側の
> 通知配送・isolation 継承が改善されたら復元を判断する）。`inflight-agents.json` の運用は停止。

## contract-designer の必須起動トリガー

contract-designer の起動を orchestrator の定性判断だけに委ねない。次のいずれかに該当したら
**変更レベル（L2/L3）に関わらず必ず起動する**。L2 の「API フィールド追加」も該当すれば必須。

1. `packages/api-contract`（Zod）のスキーマにフィールドの追加 / 変更 / 削除がある。
2. Drizzle スキーマ（DB 契約）に列・制約・型の追加 / 変更 / 削除がある。
3. 内蔵 Hono の RPC 入出力型、または層をまたぐ DTO の形が変わる。
4. フィールドの必須⇔任意・nullability・enum 値・最大長などバリデーション境界が変わる。
5. エラー形式・冪等性キーなど外部から観測される契約が変わる。

**起動しない（過剰工程の禁止・不要起動の抑制）**:

- 契約の形が一切変わらない内部実装リファクタ（入出力・スキーマ不変）。
- ドキュメント / コメント / UI 文言のみの変更。
- L1 の単一ファイル軽微修正で契約に触れないもの。

判断に迷うフィールド変更は「契約変更あり」側に倒し起動する（契約品質の欠落は後段で高コスト）。

## security-reviewer の起動条件

**L1 では起動しない。** L3 は原則必須（下記のドキュメントのみ例外を除く）。
L2 はセキュリティ触点があるとき必須、省略条件に該当すれば省略してよい。

### 必ず起動する（L2/L3）

次のいずれかに該当したら `reviewer` の後に必ず起動する。

1. 認証・認可・セッション・Cookie / セキュリティヘッダーの新設・変更がある。
2. 秘密情報（トークン・API キー・個人情報）の取り扱いが変わる、またはログ出力経路が変わる。
3. Infrastructure 経由の外部 API / 外部ストレージ I/O を新設・変更する。
4. 依存パッケージの追加・メジャー更新がある（`package.json` / lockfile）。
5. 入力境界（Hono ルート・Zod 契約）の新設・変更で、未検証入力が Domain / UseCase に
   届きうる変更がある。
6. L3 の全層変更（新規 API / DB スキーマ / データ移行を含むもの）。

### 省略してよい（L2 限定・過剰工程の禁止）

次の**すべて**を満たす L2 では省略してよい。省略した場合は最終報告に「省略理由」を 1 行書く。

- Presentation のみ、または契約・DB・認証に触れない内部リファクタ / テスト基盤のみ。
- 依存パッケージの追加・メジャー更新がない。
- 秘密情報・外部 I/O・認証認可に触れていない。

L2/L3 共通で省略してよいケース:

- ドキュメント / コメント / テキスト文言のみの変更（コード変更がない）。
- `documentation-only-change` 相当の変更。

判断に迷う場合は起動する側に倒す。

`security-reviewer` は `reviewer` と役割を分担する:

- `reviewer`: 品質・整合性・責務分離・エラー処理・テスト不足を見る。
- `security-reviewer`: OWASP Top 10・認証/認可・秘密情報漏洩・依存脆弱性を見る。

## パフォーマンス設計（architecture-designer 条件付き・旧 performance-designer）

**L3 のみ**、かつ次のいずれかを含む場合に `architecture-designer` が設計書の性能節を厚く書く。
単独の performance-designer は起動しない（IMP-2026-031）。

1. Infrastructure 経由の外部 API / 外部ストレージへの I/O を新設・変更する。
2. 一覧取得・集計など大量データを扱う DB クエリを新設・変更する。
3. 性能要件が明示された改善タスク。

## E2E・結合テスト（implementer 条件付き・旧 e2e-test-implementer）

**L3 のみ**、かつ次のいずれかを満たす場合に `implementer` が E2E/結合テストも実装する。
単独の e2e-test-implementer は起動しない（IMP-2026-031）。

1. `apps/web/playwright.config.ts` が存在する（Playwright 基盤整備済み）。
2. 対象 Hono ルートにテストクライアント用のセットアップが存在する。

テスト基盤が整備されていない場合は実装せず、観点は `docs/tests/<feature>.md` の
「未実装観点（基盤待ち）」セクションに記録するにとどめる。

## モデル割り当て

正典は各 `.claude/agents/<name>.md` の frontmatter `model`（下表は常備 11 Agent の早見。
IMP-2026-031）。モデルは「作業量」ではなく「判断の重さ」で選ぶ。采配基準は次の 4 層。

### 采配基準（4 層）

| 層                 | 作業タイプ                                                                    | モデル                                                   |
| ------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| 軽い               | ファイル確認・検索・差分や書式のチェック                                      | Haiku（組み込み `Explore` を `model: haiku` 指定で起動） |
| 方針が決まっている | 確定済み方針での実装・編集・設計書/計画/試験計画の作成・ライティング          | `claude-sonnet-5`                                        |
| 判断がいる         | レビュー・練り直し・横断分析・オーケストレーション                            | `claude-opus-5`                                          |
| 特に重要           | L3 の全体設計・方針決め・重大トレードオフ・最終確認（失敗すると手戻りが重い） | Fable（動的オーバーライドまたはメイン切り替え）          |

禁止事項（トークン浪費の典型パターン）：

- 探すだけ・見比べるだけの作業を上位モデルに回さない（`Explore`/haiku へ委譲する）。
- 決まりきった編集を上位モデルで大量にこなさない（implementer/sonnet へ委譲する）。
- 散らかったままの大量ファイルを、軽いモデルで整理する前に上位モデルへ流し込まない。

> `Explore` は Claude Code の組み込み Agent のため `.claude/agents/` に定義ファイルが無い。
> `validate-agent-config.mjs` は `BUILTIN_AGENTS`（現状 `Explore`）を存在チェックから除外する
> （IMP-2026-021）。組み込みを増やす場合は同 Set に追加する。

### Agent 別早見表

| Agent                     | model                                                     |
| ------------------------- | --------------------------------------------------------- |
| orchestrator              | `claude-opus-5`                                           |
| architecture-designer     | `claude-sonnet-5`（L3 は Fable オーバーライド。下記参照） |
| contract-designer         | `claude-sonnet-5`                                         |
| implementation-planner    | `claude-sonnet-5`                                         |
| implementer               | `claude-sonnet-5`                                         |
| test-designer             | `claude-sonnet-5`                                         |
| reviewer                  | `claude-opus-5`                                           |
| security-reviewer         | `claude-opus-5`                                           |
| reflection-agent          | `claude-sonnet-5`                                         |
| agent-evaluator           | `claude-sonnet-5`                                         |
| agent-improvement-manager | `claude-opus-5`                                           |
| （組み込み）Explore       | 呼び出し時に `model: haiku` を指定                        |

agent-evaluator を Sonnet に据え置く理由：採点基準表ありの定型評価で呼び出し回数が多い
（回帰評価で複数ケース実行）。悪化検知の最終判断は Opus の agent-improvement-manager が担う。

### Fable の使い方（L3 限定）

- frontmatter に Fable を固定しない（L2 の小さな設計でも動いてしまいコスト増のため）。
- L3 判定時のみ、orchestrator が architecture-designer を Agent 呼び出しの `model: fable`
  オーバーライド（呼び出し時パラメータ。frontmatter より優先）で起動する。
- オーバーライドが CLI バージョンにより効かない場合のフォールバック：メインモデルを Fable に
  切り替え（人間が実施）、設計判断だけメインで行い、成果物化は architecture-designer
  （Sonnet）へ委譲する。

### メインモデル切り替えガイド

切り替えは人間が行う（`/model`）。orchestrator・メインセッションの Claude は、切り替えが
有益な場面で**タイミングと切り替え先を明示して**提案する。

| セッション/局面                           | 推奨メインモデル                |
| ----------------------------------------- | ------------------------------- |
| 単発の質問・軽い調査のみのセッション      | Sonnet                          |
| 通常の開発タスク（orchestrator・L1/L2）   | Opus（現行 frontmatter どおり） |
| L3 の方針決め・重大トレードオフ・最終確認 | Fable（提案して人間が切り替え） |

> `CLAUDE_CODE_SUBAGENT_MODEL` は設定しない。設定すると全 Subagent のモデルを
> 一律上書きし、Agent 定義の `model` より優先されてしまう。モデルは各 Agent ファイルの
> `model` で個別指定する。

### Cursor Agent 経路（Claude Code とは別）

Cursor Agent / Cloud Agent で **実装** を行うときの既定モデルは GPT-5.6 Luna Max とする。
Claude Code の implementer（`claude-sonnet-5`）は変更しない。

| 経路                       | implementer の定義                                                    | 既定 model                 |
| -------------------------- | --------------------------------------------------------------------- | -------------------------- |
| Claude Code CLI            | `.claude/agents/implementer.md`                                       | `claude-sonnet-5`          |
| Cursor Agent / Cloud Agent | `.cursor/agents/implementer.md`（同名のため Cursor ではこちらが優先） | `gpt-5.6-luna[effort=max]` |

例外・Task slug のフォールバックは
[`.cursor/rules/implementation-default-model.mdc`](../../.cursor/rules/implementation-default-model.mdc)
が正典。設計・レビュー・オーケストレーションのモデルは上表の Claude Code 4 層を維持する。

親セッションが Grok 等でも、アプリケーション実装を親モデルで書かない。implementer へ委譲する。

## 起動方法（正規ルート）

**Orchestrator 役はメインセッションが務める。**

- ローカル: `claude --agent orchestrator`（メインセッション起動）。
- リモート: 通常セッションが本ポリシーに従い専門 Subagent を直接起動する
  （実績: pantry-screens 2026-07-19）。
- **Orchestrator 自体を `Agent` ツールの子エージェントとして起動する多段委譲は行わない**
  （孫 Sub-agent の通知配送先・isolation 未継承の既知問題により「成果物なし完了」が
  累計 3 系統で反復。詳細は
  [archive/orchestration-frozen-mechanisms.md](./archive/orchestration-frozen-mechanisms.md)）。

メインセッションとして起動した場合、`tools` の `Agent(...)` で起動可能な Subagent を
制限できる。通常の Subagent として起動するとこの許可リストは無視される点も、
メインセッション正規化の理由の一つ。
