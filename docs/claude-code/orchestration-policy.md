# Orchestration ポリシー

Orchestrator（`claude-opus-4-8`）は**指揮役**であり、自分で詳細設計や大量の実装を
完結させない。タスクを分解し、専門 Subagent（`claude-sonnet-4-6`）へ委譲する。

`Agent` ツールを持つのは Orchestrator だけ。他の Subagent は原則 `Agent` を持たず、
互いを起動しない（例外：reviewer のみ、検証目的に限り requirements-analyst を
起動できる。後述）。

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
  → implementation-planner       → docs/implementation-plans/<feature>.md
  → test-designer（計画と並行可） → docs/tests/<feature>.md
  → implementer                  → 実装 + 単体テスト + lint/型チェック
  → reviewer                     → 指摘（必要なら docs/reviews/<feature>.md）
```

### Level 3
```
requirements-analyst  → docs/requirements/<feature>.md
  → architecture-designer      → docs/designs/<feature>.md（+ ADR は docs/decisions/）
  → implementation-planner     → docs/implementation-plans/<feature>.md
  → test-designer              → docs/tests/<feature>.md
  → implementer                → 実装 + 単体テスト + lint/型チェック
  → reviewer                   → docs/reviews/<feature>.md
```

## 並列実行の指針

- `requirements-analyst` の調査結果が前提になるため、まず先行させる。
- `architecture-designer` 完了後、`implementation-planner` と `test-designer` は
  並列に進められる（どちらも設計書を入力にするため）。
- `implementer` は実装計画の確定後に着手する。
- `reviewer` は実装完了後。設計・計画・実装・試験を突き合わせる。

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

## reviewer からの例外的な Subagent 起動

reviewer は原則コードを変更せず指摘に徹する。ただし「仕様の事実確認」が必要な場合に
限り、検証目的で `requirements-analyst` を起動してよい（読み取り専用調査）。
設計・実装の変更を伴う再依頼は reviewer が行わず、Orchestrator へ差し戻す。

## モデル割り当て

| Agent | model |
| --- | --- |
| orchestrator | `claude-opus-4-8` |
| requirements-analyst | `claude-sonnet-4-6` |
| architecture-designer | `claude-sonnet-4-6` |
| implementation-planner | `claude-sonnet-4-6` |
| implementer | `claude-sonnet-4-6` |
| test-designer | `claude-sonnet-4-6` |
| reviewer | `claude-sonnet-4-6` |

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
