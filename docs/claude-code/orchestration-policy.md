# Orchestration ポリシー

Orchestrator（`claude-opus-4-8`）は**指揮役**であり、自分で詳細設計や大量の実装を
完結させない。タスクを分解し、専門 Subagent（`claude-sonnet-4-6`）へ委譲する。

`Agent` ツールを持つのは orchestrator・reviewer・agent-improvement-manager の 3 つのみ。
orchestrator は全実務 Agent を起動できる。reviewer は検証目的で requirements-analyst
のみ（後述）、agent-improvement-manager は回帰評価目的で agent-evaluator のみ起動できる。
他の Subagent は `Agent` を持たず、互いを起動しない。

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
requirements-analyst（任意・影響が読めない時）
  → architecture-designer        → docs/designs/<feature>.md
  →〔契約変更あれば contract-designer〕→ Contract 節（§必須起動トリガー参照）
  → implementation-planner       → docs/implementation-plans/<feature>.md
  → test-designer（計画と並行可） → docs/tests/<feature>.md
  → implementer                  → 実装 + 単体テスト + lint/型チェック/テスト
  → reviewer                     → 指摘（必要なら docs/reviews/<feature>.md）
  → security-reviewer            → セキュリティ指摘
  → reflection-agent             → improvements/candidates/<task-id>.md
```

### Level 3
```
requirements-analyst  → docs/requirements/<feature>.md
  → architecture-designer      → docs/designs/<feature>.md（+ ADR は docs/decisions/）
  →〔契約変更あれば contract-designer〕→ Contract 節（§必須起動トリガー参照）
  →〔外部I/O/大量データあれば performance-designer（planner と並行可）〕
  → implementation-planner     → docs/implementation-plans/<feature>.md
  → test-designer              → docs/tests/<feature>.md
  → implementer                → 実装 + 単体テスト + lint/型チェック/テスト
  →〔E2E基盤整備済みなら e2e-test-implementer〕→ E2E テスト
  → reviewer                   → docs/reviews/<feature>.md
  → security-reviewer          → セキュリティ指摘
  → reflection-agent           → improvements/candidates/<task-id>.md
```

## 並列実行の指針

- `requirements-analyst` の調査結果が前提になるため、まず先行させる。
- `architecture-designer` 完了後、`implementation-planner` と `test-designer` は
  並列に進められる（どちらも設計書を入力にするため）。
- `implementer` は実装計画の確定後に着手する。
- `reviewer` は実装完了後。設計・計画・実装・試験を突き合わせる。

## stop/resume を跨ぐ委譲の扱い（通知非依存）

出典: IMP-2026-008（store-master 事象1・stop/resume 後の Sub-agent notification 待ちループ解消）。

- **適用レベル: L3 のみ**（L1/L2 では `inflight-agents.json` を使わない）。
- **background 委譲時のみ**、その前に `.claude/state/inflight-agents.json` へ
  `{ agent, purpose, expected_outputs[] }` を追記する。単一 Sub-agent の同期委譲では追記しない。
- resume 直後（未処理エントリがある場合のみ）は notification を待たず expected_outputs の
  存在で完了を冪等判定する。stop していない通常フローでは発動しない。
- 単一 Sub-agent への委譲は同期待機を既定とし、background は複数 Sub-agent の明示的並列化に
  限定する（stop を跨ぐ揮発状態を最小化）。
- **クリアタイミング**: `reflection-agent` 起動時、または feature 完了報告前に空にする。
- **追記責務**: 委譲指示の禁止事項に「`inflight-agents.json` の追記を成果物確定前に行わない」を
  明記し、部分書き込みによる完了誤判定を防ぐ。
- **L1/L2 の同期委譲への拡張**（2026-07-03 ドライラン検証で発見）: `inflight-agents.json` は
  L3 background 限定だが、L1/L2 の単一 Sub-agent 同期委譲でも resume 直後に「直前の委譲が完了したか
  分からない」状況は起こりうる（実測: L2 タスクで architecture-designer が resume 後に二重起動）。
  エントリの有無に関わらず、resume 直後で直前の一手が Sub-agent 委譲だった場合は期待成果物の存在・
  更新時刻を確認してから次を決める（`.claude/agents/orchestrator.md` §進め方 4 参照）。

### 既知の制約: Orchestrator を Agent ツールで子エージェントとして起動した場合

2026-07-03 のドライラン検証（実タスクで改善ループを検証）で観測。本来の起動方法である
`claude --agent orchestrator`（メインセッション）ではなく、Claude Code の `Agent` ツールで
Orchestrator 自体を子エージェントとして起動すると（例: 検証目的の isolation 付き dry run）、
以下の既知の制約がある。

- Orchestrator からさらに委譲した孫 Sub-agent（例: contract-designer）の完了通知が、Orchestrator
  本体ではなく最上位セッションへ直接届くことがある。Orchestrator 自身は完了を認識できない。
- `isolation: worktree` で Orchestrator を分離しても、そこから委譲される孫 Sub-agent のファイル
  I/O には継承されず、実ブランチへ直接書き込まれることがある。

これは Cookpit の Agent 定義ではなく Claude Code 側の子エージェント委譲・通知配送の挙動に起因する。
Orchestrator を本来の起動方法（メインセッション）で使う通常運用では発生しない想定だが、Orchestrator
自体を検証目的で子エージェントとして呼び出す場合はこの制約を踏まえること。全工程を通した生の
Orchestrator ドライランより、既存の `agent-evaluator` による dry run（`.claude/evals/cases` を
使った評価、IMP-2026-006/007 で実績あり）の方が現状は安定した検証手段。

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

**L2/L3 の全タスクで `reviewer` の後に必ず起動する。** L1 では起動しない。

起動しない例外（L2/L3 でも省略してよいケース）:
- ドキュメント / コメント / テキスト文言のみの変更（コード変更がない）。
- `documentation-only-change` 相当の変更。

判断に迷う場合は起動する側に倒す（コードが変わる変更は必ず起動）。

`security-reviewer` は `reviewer` と役割を分担する:
- `reviewer`: 品質・整合性・責務分離・エラー処理・テスト不足を見る。
- `security-reviewer`: OWASP Top 10・認証/認可・秘密情報漏洩・依存脆弱性を見る。

## performance-designer の起動条件

**L3 のみ**、かつ次のいずれかを含む場合に起動する。それ以外では起動しない（過剰工程の禁止）。

1. Infrastructure 経由の外部 API / 外部ストレージへの I/O を新設・変更する。
2. 一覧取得・集計など大量データを扱う DB クエリを新設・変更する。
3. 性能要件が明示された改善タスク。

起動タイミング: `architecture-designer` 完了後、`implementation-planner` / `test-designer` と**並列**に進められる。

## e2e-test-implementer の起動条件

**L3 のみ**、かつ次のいずれかを満たす場合に起動する。

1. `apps/web/playwright.config.ts` が存在する（Playwright 基盤整備済み）。
2. 対象 Hono ルートにテストクライアント用のセットアップが存在する。

テスト基盤が整備されていない場合は起動しない。観点は `docs/tests/<feature>.md` の
「未実装観点（基盤待ち）」セクションに記録するにとどめる。

起動タイミング: `implementer` 完了後、`reviewer` の前。

## reviewer からの例外的な Subagent 起動

reviewer は原則コードを変更せず指摘に徹する。ただし「仕様の事実確認」が必要な場合に
限り、検証目的で `requirements-analyst` を起動してよい（読み取り専用調査）。
設計・実装の変更を伴う再依頼は reviewer が行わず、Orchestrator へ差し戻す。

## モデル割り当て

正典は各 `.claude/agents/<name>.md` の frontmatter `model`（下表は全 15 Agent の早見）。

| Agent | model |
| --- | --- |
| orchestrator | `claude-opus-4-8` |
| requirements-analyst | `claude-sonnet-4-6` |
| architecture-designer | `claude-sonnet-4-6` |
| contract-designer | `claude-sonnet-4-6` |
| implementation-planner | `claude-sonnet-4-6` |
| implementer | `claude-sonnet-4-6` |
| test-designer | `claude-sonnet-4-6` |
| reviewer | `claude-sonnet-4-6` |
| security-reviewer | `claude-sonnet-4-6` |
| e2e-test-implementer | `claude-sonnet-4-6` |
| performance-designer | `claude-sonnet-4-6` |
| document-reviewer | `claude-sonnet-4-6` |
| reflection-agent | `claude-sonnet-4-6` |
| agent-evaluator | `claude-sonnet-4-6` |
| agent-improvement-manager | `claude-opus-4-8` |

> `CLAUDE_CODE_SUBAGENT_MODEL` は設定しない。設定すると全 Subagent のモデルを
> 一律上書きし、Agent 定義の `model` より優先されてしまう。モデルは各 Agent ファイルの
> `model` で個別指定する。

## 起動方法

Orchestrator はメインセッションとして起動するのが安定する。

```
claude --agent orchestrator
```

メインセッションとして起動した場合、`tools` の `Agent(...)` で起動可能な Subagent を
制限できる。通常の Subagent として起動するとこの許可リストは無視されるため、
Orchestrator はメインスレッドとして使う。
