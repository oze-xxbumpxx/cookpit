# Claude Code マルチエージェント開発基盤 構築実施指示書

## 0. この文書の使い方

この文書は、Claude Codeにそのまま読み込ませ、対象リポジトリへマルチエージェント開発基盤を構築させるための実施指示書である。

Claude Codeは本書を読んだ後、すぐに設定ファイルを量産してはならない。最初に対象リポジトリを調査し、既存構成との競合、利用可能なコマンド、技術スタック、既存ドキュメント、既存Claude Code設定を確認すること。

実装時点のClaude Code公式仕様は変更される可能性があるため、Subagent、Skills、Hooks、Memory、settings.jsonの構文について、利用中のClaude Codeバージョンおよび公式ドキュメントを確認してから適用すること。本書に記載された例と現在の公式仕様が異なる場合は、目的を維持したまま現在の公式仕様を優先すること。

---

# 1. 依頼の目的

このリポジトリに、以下を実現するClaude Code開発基盤を構築する。

1. 指揮役のOrchestratorがユーザー要求を分析する
2. 変更規模とリスクに応じて作業を分解する
3. 調査、設計、計画、実装、テスト、レビューを専門Subagentへ委譲する
4. ユーザーが明示しなくても、必要な設計書・実装計画・試験計画を作成または更新する
5. Definition of Doneと品質ゲートを機械的に確認する
6. 実装者とは独立したReviewerが成果物を評価する
7. タスク完了後に振り返りを行い、再利用可能な知見と改善候補を蓄積する
8. Auto Memory、Subagent Memory、Skills、Rulesを適切に使い分ける
9. 複数タスクで再現した問題だけをAgent改善候補へ昇格する
10. Agent設定変更前後を固定評価ケースで比較する
11. 重要な設定変更は、人間の承認なしに自動反映しない
12. 過剰なAgent呼び出し、ドキュメント作成、トークン消費を防ぐ

この基盤の最優先事項は、Agent数を増やすことではない。

最優先事項は以下である。

- 要件、設計、実装、テストの整合性
- 既存アーキテクチャとの整合性
- 手戻りの削減
- 見落としの削減
- 変更理由と設計判断の追跡可能性
- 機械的に検証できる品質ゲート
- 改善の効果を客観的に評価できること
- 小規模変更を過剰な工程で重くしないこと

---

# 2. モデル構成

以下のモデル割り当てを基本とする。

## 2.1 指揮・改善担当

- Orchestrator: `claude-opus-4-8`
- Agent Improvement Manager: `claude-opus-4-8`

## 2.2 専門実務担当

以下は原則として `claude-sonnet-4-6` を使用する。

- Requirements Analyst
- Architecture Designer
- Contract Designer
- Test Designer
- Implementation Planner
- Implementer
- Independent Reviewer
- Reflection Agent
- Agent Evaluator

完全なモデルIDが現在の環境で利用できない場合、勝手に代替モデルを採用しないこと。

その場合は以下を報告する。

- 利用できなかったモデルID
- 現在利用可能な候補
- 代替時の影響
- 推奨代替案

モデルエイリアスではなく完全なモデルIDを優先する。ただし、組織ポリシーや利用環境によって完全IDが許可されない場合は、現行仕様に従うこと。

すべてのSubagentへ一律適用する環境変数による上書きは原則として使用しない。Agent定義ごとにモデルを指定し、将来の個別変更を可能にすること。

---

# 3. 基本設計原則

## 3.1 Orchestratorは詳細実装を抱え込まない

Orchestratorの責務は以下に限定する。

- ユーザー要求の解釈
- 変更レベル判定
- タスク分解
- Agent選択
- 実行順序の決定
- 並列実行可否の判断
- Agentへ渡すコンテキストの整理
- 成果物の統合
- Agent間の矛盾解消
- 完了条件の確認
- ユーザーへの最終報告

Orchestratorは、専門Agentが存在する作業を自分だけで完結させない。

## 3.2 Agentの責務を分離する

以下を原則とする。

- 調査Agentはコードを変更しない
- 設計Agentはプロダクションコードを変更しない
- 計画Agentはプロダクションコードを変更しない
- 実装Agentは設計方針を独断で変更しない
- Reviewerは原則としてコードを修正しない
- Reflection Agentは設定ファイルを変更しない
- Improvement Managerは重要設定を直接反映せず、最初に提案と差分を作る

## 3.3 機械判定とLLM判断を分離する

機械的に判定できるものはスクリプトまたはHooksで確認する。

例:

- ファイルの存在
- JSON/YAMLの構文
- typecheckの成功
- lintの成功
- testの成功
- buildの成功
- 禁止コマンド
- 必須セクションの存在
- 設定ファイル参照切れ

意味判断が必要なものはAgentへ委譲する。

例:

- 要件を満たしているか
- 設計と実装が整合しているか
- テスト観点が十分か
- 責務分離が適切か
- 既存設計と矛盾していないか
- ドキュメントが実装内容を正確に表しているか

## 3.4 指示を肥大化させない

同じ内容を以下へ重複記載しない。

- CLAUDE.md
- Agent定義
- Skills
- Rules
- Memory
- Hooks

各保存先の責務は後述の分類に従うこと。

---

# 4. 最初に実施するリポジトリ調査

ファイル作成前に、以下を調査する。

## 4.1 Claude Code設定

確認対象:

- `CLAUDE.md`
- `CLAUDE.local.md`
- `.claude/`
- `.claude/settings.json`
- `.claude/settings.local.json`
- `.claude/agents/`
- `.claude/skills/`
- `.claude/rules/`
- `.claude/commands/`
- 既存Hooks
- 既存MCP設定
- 既存プラグイン
- Auto Memoryの利用可否
- 利用中のClaude Codeバージョン

## 4.2 プロジェクト構成

確認対象:

- 使用言語
- フレームワーク
- パッケージマネージャー
- モノレポか単一リポジトリか
- フロントエンド構成
- バックエンド構成
- DB
- API方式
- インフラ
- テストフレームワーク
- CI
- コンテナ環境
- コード生成
- マイグレーション方法
- Lint、Format、Typecheck、Buildコマンド

## 4.3 既存ドキュメント

確認対象:

- README
- 開発ガイド
- コーディング規約
- アーキテクチャ資料
- API仕様
- DB設計
- ADR
- テスト計画
- リリース手順
- 障害対応手順
- Contributing guide

## 4.4 Git・CI

確認対象:

- ブランチ戦略
- PR/MRテンプレート
- CIワークフロー
- 必須チェック
- CODEOWNERS
- セキュリティスキャン
- 依存関係更新
- リリースフロー

## 4.5 調査結果の出力

変更前に以下を提示する。

1. 現在の構成
2. 利用可能な品質コマンド
3. 既存Claude Code設定
4. 既存設定との競合
5. 不足している情報
6. 採用する構成
7. 採用しない構成と理由
8. 作成予定ファイル
9. 更新予定ファイル
10. リスク
11. 段階導入案

重大な不明点があっても、調査可能な範囲を先に進めること。ただし、本番環境へ影響する設定、秘密情報、破壊的操作については推測で実行しない。

---

# 5. 変更レベル分類

Orchestratorはタスク開始時に変更レベルを判定する。

## Level 0: 調査・相談

例:

- コード調査
- 原因分析
- 設計相談
- 実装案比較
- ドキュメントの説明

成果物:

- 調査結果
- 必要に応じて提案書
- プロダクションコード変更なし

## Level 1: 軽微な変更

例:

- 文言修正
- コメント修正
- 小規模CSS調整
- 明らかなtypo
- 単純なnullチェック
- テストコードだけの軽微修正
- 既存仕様を変えない小規模バグ修正

必須工程:

- 影響範囲確認
- 実装
- 対象品質ゲート
- 簡易レビュー

原則不要:

- 独立した設計書
- 独立した実装計画
- ADR

## Level 2: 通常変更

例:

- 既存APIの項目追加
- 既存画面への機能追加
- バリデーション変更
- 業務ロジック変更
- 既存Lambda処理変更
- Repository変更
- 既存イベントペイロード変更
- 複数ファイルにまたがるバグ修正

必須成果物:

- `docs/designs/<feature-name>.md`
- `docs/implementation-plans/<feature-name>.md`
- `docs/tests/<feature-name>.md`

必須工程:

- 要件・影響範囲調査
- 設計
- テスト観点
- 実装計画
- 実装
- 品質ゲート
- 独立レビュー
- 振り返り

## Level 3: 重要変更

例:

- 新規API
- DBスキーマ変更
- データ移行
- 認証・認可
- 新規画面
- 外部サービス連携
- AWSサービス間連携変更
- 金銭・個人情報・権限に関わる変更
- アーキテクチャ変更
- 大規模リファクタリング
- 後方互換性に影響する変更

必須成果物:

- `docs/requirements/<feature-name>.md`
- `docs/designs/<feature-name>.md`
- `docs/implementation-plans/<feature-name>.md`
- `docs/tests/<feature-name>.md`
- 必要なADR
- `docs/reviews/<feature-name>.md`
- `docs/claude-code/improvements/candidates/<task-id>.md`

必須工程:

- 詳細な既存調査
- 要件整理
- 契約設計
- アーキテクチャ設計
- テスト設計
- 実装計画
- 実装
- 品質ゲート
- 独立レビュー
- 必要に応じたセキュリティ・性能レビュー
- 振り返り

## 判定ルール

Orchestratorは以下を出力する。

- 判定レベル
- 判定理由
- 必要Agent
- 必要成果物
- 省略する工程と理由

小規模な変更にLevel 3相当の工程を適用しないこと。

---

# 6. 構築するディレクトリ

現在のリポジトリ構成に合わせて調整してよいが、原則として以下を構築する。

```text
project/
├── CLAUDE.md
├── .claude/
│   ├── settings.json
│   ├── agents/
│   │   ├── orchestrator.md
│   │   ├── requirements-analyst.md
│   │   ├── architecture-designer.md
│   │   ├── contract-designer.md
│   │   ├── test-designer.md
│   │   ├── implementation-planner.md
│   │   ├── implementer.md
│   │   ├── reviewer.md
│   │   ├── reflection-agent.md
│   │   ├── agent-evaluator.md
│   │   └── agent-improvement-manager.md
│   ├── skills/
│   │   ├── classify-change/
│   │   │   └── SKILL.md
│   │   ├── create-requirements-document/
│   │   │   └── SKILL.md
│   │   ├── create-design-document/
│   │   │   ├── SKILL.md
│   │   │   └── templates/design.md
│   │   ├── create-implementation-plan/
│   │   │   ├── SKILL.md
│   │   │   └── templates/implementation-plan.md
│   │   ├── create-test-plan/
│   │   │   ├── SKILL.md
│   │   │   └── templates/test-plan.md
│   │   ├── create-adr/
│   │   │   ├── SKILL.md
│   │   │   └── templates/adr.md
│   │   ├── review-deliverables/
│   │   │   └── SKILL.md
│   │   └── reflect-task/
│   │       └── SKILL.md
│   ├── rules/
│   │   ├── backend.md
│   │   ├── frontend.md
│   │   ├── database.md
│   │   ├── api-contracts.md
│   │   ├── testing.md
│   │   └── documentation.md
│   ├── scripts/
│   │   ├── detect-project-commands.sh
│   │   ├── run-quality-gates.sh
│   │   ├── validate-documents.sh
│   │   ├── validate-agent-config.sh
│   │   ├── validate-protected-changes.sh
│   │   └── record-task-metrics.sh
│   └── evals/
│       ├── README.md
│       ├── cases/
│       ├── rubrics/
│       ├── baselines/
│       └── results/
└── docs/
    ├── requirements/
    ├── designs/
    ├── implementation-plans/
    ├── tests/
    ├── decisions/
    ├── reviews/
    └── claude-code/
        ├── README.md
        ├── development-policy.md
        ├── definition-of-done.md
        ├── agent-catalog.md
        ├── memory-policy.md
        ├── improvement-policy.md
        └── improvements/
            ├── README.md
            ├── backlog.md
            ├── candidates/
            ├── proposals/
            ├── evaluations/
            ├── accepted/
            ├── rejected/
            └── incidents/
```

不要な空ディレクトリを大量作成するのではなく、運用開始時に必要なものを優先して作ること。

---

# 7. CLAUDE.mdの要件

CLAUDE.mdは短く保つ。

目標:

- プロジェクト全体で毎回必要な原則
- 具体的で検証可能
- 詳細手順を含めすぎない
- Agent定義やSkillsと重複しない

最低限、以下を含める。

## 7.1 ワークフロー

- Level 2以上は調査、設計、テスト観点、計画、実装、レビューの順で進める
- 複数工程ではOrchestratorを利用する
- 設計書と計画なしにLevel 2以上の本実装を開始しない
- 設計変更が必要になったら実装者が独断で変更しない
- 実装後に品質ゲートを実行する
- 重大レビュー指摘を残したまま完了扱いにしない

## 7.2 ドキュメント

- Level別成果物
- 既存文書を確認してから新規作成
- 重複文書を作らない
- 実装と文書の不一致を残さない
- 「対象外」「変更なし」を明示する

## 7.3 安全性

- 秘密情報を読み取らない
- 本番環境を変更しない
- 破壊的操作を実行しない
- force pushを実行しない
- 未承認の公開・デプロイをしない

## 7.4 完了条件

Definition of Doneへの参照を記載する。

CLAUDE.mdへ長いテンプレートを直接記載しないこと。

---

# 8. Agent定義

各Agentの定義には、現在のClaude Code公式仕様に合うfrontmatterを使用する。

各Agentには最低限、以下を定義する。

- name
- description
- model
- 必要最小限のtools
- 必要であればpreloadするskills
- 責務
- 入力
- 出力
- 完了条件
- 禁止事項
- エスカレーション条件

## 8.1 Orchestrator

モデル:

```yaml
model: claude-opus-4-8
```

責務:

1. 依頼をLevel 0〜3へ分類
2. feature-nameとtask-idを決定
3. 必要Agentを選定
4. 実行順序を決定
5. 並列可能な調査だけを並列化
6. Agentへコンテキストを渡す
7. 成果物を統合
8. 不整合を解消
9. 品質ゲート結果を確認
10. 完了報告

委譲時に渡す情報:

- タスクID
- 目的
- 変更レベル
- 対象範囲
- 対象外
- 参照ファイル
- 既知の制約
- 期待成果物
- 出力先
- 完了条件
- 禁止事項
- 未確定事項

Orchestratorは直接大量のコードを書かない。

可能であれば起動可能なAgentを許可リストで制限する。現在のClaude Code仕様で有効な記法を確認して適用する。

## 8.2 Requirements Analyst

モデル:

```yaml
model: claude-sonnet-4-6
```

推奨権限:

- Read
- Glob
- Grep
- 必要最小限の読み取り系Bash

責務:

- 要求整理
- 既存仕様調査
- 既存実装調査
- 影響範囲調査
- 前提・制約・不明点
- 正常系・異常系・境界条件
- 後方互換性
- 関連テスト
- 関連ドキュメント

禁止:

- プロダクションコード変更
- 設計の確定
- 推測での仕様決定

## 8.3 Architecture Designer

モデル:

```yaml
model: claude-sonnet-4-6
```

責務:

- 変更後構成
- 責務分離
- データフロー
- API設計
- DB設計
- フロントエンド設計
- バックエンド設計
- エラー処理
- トランザクション
- ログ・監視
- セキュリティ
- 性能
- 後方互換性
- リリース・移行
- テスト方針
- 設計選択肢と採用理由

出力:

- `docs/designs/<feature-name>.md`
- 必要なADR候補

禁止:

- プロダクションコード変更
- 未調査の既存構成を無視した設計

## 8.4 Contract Designer

モデル:

```yaml
model: claude-sonnet-4-6
```

必要な場合だけ起動する。

対象:

- GraphQL Schema
- REST/OpenAPI
- DB Schema
- SQS/SNS/EventBridgeメッセージ
- Step Functions入出力
- Native-WebViewメッセージ
- 外部サービス連携
- DTO
- バリデーションSchema

責務:

- 契約の型
- 必須・任意
- nullability
- バージョン
- 後方互換性
- エラー形式
- 冪等性キー
- サンプル
- 契約テスト方針

契約をコードで定義できる場合、設計書だけでなくSchema、型、バリデーションとの単一情報源を検討する。

## 8.5 Test Designer

モデル:

```yaml
model: claude-sonnet-4-6
```

設計完了後、実装計画前に実行する。

責務:

- 正常系
- 異常系
- 境界値
- null/undefined
- 権限
- 重複実行
- リトライ
- タイムアウト
- 部分失敗
- 外部障害
- データ整合性
- トランザクション
- 回帰
- テストデータ
- 単体・結合・E2Eの責務分担

出力:

- `docs/tests/<feature-name>.md`

## 8.6 Implementation Planner

モデル:

```yaml
model: claude-sonnet-4-6
```

責務:

- 変更ファイル
- 新規ファイル
- ファイルごとの変更内容
- 実装順序
- 依存関係
- 各ステップの完了条件
- テスト追加位置
- マイグレーション
- フィーチャーフラグ
- ロールバック
- 文書更新
- リスク

出力:

- `docs/implementation-plans/<feature-name>.md`

禁止:

- プロダクションコード変更
- 抽象的で実行不能な計画

## 8.7 Implementer

モデル:

```yaml
model: claude-sonnet-4-6
```

責務:

- 設計書を読む
- 実装計画を読む
- テスト計画を読む
- 既存規約に合わせる
- 小さな単位で変更する
- 必要なテストを実装する
- 品質ゲートを実行する
- 設計との差異を記録する

禁止:

- 設計の独断変更
- テストの無効化
- 既存失敗を無関係として隠す
- 秘密情報へのアクセス
- 本番操作
- force push
- 無関係な大規模リファクタリング

エスカレーション条件:

- 設計通り実装できない
- 既存仕様と矛盾
- DB移行リスク
- 後方互換性破壊
- セキュリティ懸念
- 品質ゲートを解消できない
- スコープ外変更が必要

## 8.8 Independent Reviewer

モデル:

```yaml
model: claude-sonnet-4-6
```

Reviewerには原則として以下を渡す。

- 元の要求
- 要件整理
- 設計書
- 実装計画
- Git diff
- テスト計画
- テスト結果
- 関連既存コード

実装者の自己説明は最初のレビューでは優先しない。

評価:

- 要件充足
- 設計整合
- 契約整合
- 実装計画整合
- 責務分離
- エラー処理
- ログ
- セキュリティ
- 性能
- 後方互換性
- テスト不足
- ドキュメント不一致
- 不要変更
- 保守性

指摘レベル:

- Critical
- Major
- Minor
- Suggestion

CriticalまたはMajorが残る場合、原則として完了不可。

## 8.9 Reflection Agent

モデル:

```yaml
model: claude-sonnet-4-6
```

責務:

- 手戻り
- 要件見落とし
- 設計変更
- テスト失敗
- Reviewer指摘
- ユーザー訂正
- Agent間不整合
- 重複作業
- 成功パターン
- Memory候補
- 改善候補

出力:

- `docs/claude-code/improvements/candidates/<task-id>.md`

禁止:

- CLAUDE.md変更
- Agent定義変更
- Skill変更
- Hook変更
- settings.json変更

## 8.10 Agent Evaluator

モデル:

```yaml
model: claude-sonnet-4-6
```

責務:

- 固定評価ケースの実行
- 評価基準による採点
- 改善前後比較
- 品質悪化検知
- 過剰工程検知
- トークン・Agent呼び出し効率の比較

出力:

- `.claude/evals/results/`
- `docs/claude-code/improvements/evaluations/`

## 8.11 Agent Improvement Manager

モデル:

```yaml
model: claude-opus-4-8
```

責務:

- 複数の振り返りを横断分析
- 一時的問題と恒久的問題の区別
- 重複候補の統合
- 保存先の決定
- CLAUDE.md、Rules、Skills、Agents、Hooksの変更提案
- 副作用分析
- 評価ケース選定
- ロールバック案
- 改善提案作成

出力:

- `docs/claude-code/improvements/proposals/<proposal-id>.md`

重要設定は直接変更せず、変更差分を提示する。

---

# 9. Skillsの構築

Skillsは複数ステップの再利用可能な作業手順に使用する。

各Skillは、Claudeが適切な場面で選択できる具体的なdescriptionを持たせる。

Agentが特定Skillを常に必要とする場合、現在のClaude Code仕様に従ってpreloadを検討する。

## 9.1 classify-change

入力:

- ユーザー要求
- 既存構成
- 影響範囲

出力:

- Level 0〜3
- 判定理由
- 必須Agent
- 必須成果物
- 省略工程

## 9.2 create-requirements-document

必須項目:

- 背景
- 目的
- ユーザー要求
- 機能要件
- 非機能要件
- 正常系
- 異常系
- 境界条件
- 前提
- 制約
- 対象範囲
- 対象外
- 受け入れ条件
- 未決事項

## 9.3 create-design-document

必須項目:

- 背景
- 目的
- 要件への対応
- 対象範囲
- 対象外
- 現状構成
- 変更後構成
- コンポーネント責務
- データフロー
- API
- DB
- Frontend
- Backend
- Contract
- Validation
- Error handling
- Transaction
- Logging
- Monitoring
- Security
- Performance
- Compatibility
- Migration
- Release
- Rollback
- Test strategy
- Risks
- Alternatives
- Open issues

対象外項目は削除せず、「対象外」または「変更なし」と記載する。

## 9.4 create-implementation-plan

必須項目:

- 前提文書
- 変更ファイル
- 新規ファイル
- 削除ファイル
- ステップ
- 依存関係
- 完了条件
- テスト
- データ移行
- リリース順
- ロールバック
- リスク
- 文書更新
- Reviewer確認点

## 9.5 create-test-plan

必須項目:

- テスト対象
- 対象外
- 単体
- 結合
- E2E
- Contract test
- 正常系
- 異常系
- 境界値
- 権限
- 冪等性
- リトライ
- タイムアウト
- 部分失敗
- データ整合性
- 回帰
- テストデータ
- 実行コマンド
- 完了条件

## 9.6 create-adr

必須項目:

- Status
- Context
- Decision
- Alternatives
- Consequences
- Migration
- Rollback
- References

## 9.7 review-deliverables

確認対象:

- 要件
- 設計
- 契約
- 実装計画
- コード
- テスト
- ドキュメント
- 品質ゲート結果

## 9.8 reflect-task

確認対象:

- 何がうまくいったか
- 何が失敗したか
- 手戻り
- ユーザー訂正
- Reviewer指摘
- 再利用可能な知見
- 一時的知見
- 改善候補
- 保存先候補
- 発生回数

---

# 10. Rulesの構築

Rulesは、特定領域や特定パスに適用する確定ルールに使用する。

現行Claude Codeのpath-scoped rules構文を確認して設定する。

## backend.md

対象例:

- UseCase
- Domain
- Repository
- Resolver/Controller
- Transaction
- Error
- Logging

## frontend.md

対象例:

- Component責務
- Hooks
- State管理
- Presentational分離
- Accessibility
- UIテスト
- Figmaとの整合

## database.md

対象例:

- Migration
- Index
- Constraint
- Transaction
- Rollback
- Backward compatibility
- Data migration

## api-contracts.md

対象例:

- GraphQL
- REST
- Event payload
- DTO
- zod/Schema
- Versioning
- Nullability

## testing.md

対象例:

- テスト責務
- testcontainers
- Mock方針
- Fixture
- Flaky test禁止
- Regression

## documentation.md

対象例:

- ファイル命名
- feature-name
- task-id
- 必須見出し
- 更新ルール
- 重複防止

リポジトリの既存規約を調査してから内容を作ること。一般論をそのまま強制しない。

---

# 11. Definition of Done

`docs/claude-code/definition-of-done.md`を作成する。

Level別に適用条件を定義する。

## 共通

- 要求が明確に整理されている
- 対象範囲と対象外が明確
- 既存実装への影響が確認済み
- 無関係な変更を含まない
- 秘密情報を含まない
- 未解決事項が記録されている

## Level 1

- 対象品質ゲート成功
- 簡易レビュー完了
- 変更理由を説明可能
- 回帰影響確認済み

## Level 2

- 設計書作成・更新
- 実装計画作成・更新
- テスト計画作成・更新
- Typecheck成功
- Lint成功
- Unit test成功
- 必要なIntegration test成功
- Build成功
- ReviewerのCritical/Major解消
- 文書と実装が一致

## Level 3

Level 2に加えて:

- 要件文書
- 必要なADR
- 契約互換性確認
- 移行・ロールバック確認
- セキュリティ確認
- 性能確認
- 障害・部分失敗確認
- レビュー記録
- 振り返り記録

実在するコマンドだけを定義すること。

---

# 12. 品質ゲート

`.claude/scripts/detect-project-commands.sh`で既存設定からコマンド候補を検出する。

確認元:

- package.json
- Makefile
- Taskfile
- pyproject.toml
- Cargo.toml
- go.mod
- Gradle
- Maven
- CI設定
- README
- 開発ガイド

`.claude/scripts/run-quality-gates.sh`を作成する。

要件:

- `set -euo pipefail`
- 実在するコマンドだけを実行
- 実行したコマンドを明示
- 成功・失敗を明示
- 結果を記録可能
- Levelや変更領域に応じて対象を限定可能
- 全テストが重すぎる場合、対象テストと全体テストを区別
- 既存失敗と今回の失敗を区別して報告
- 既存失敗を勝手に無視しない

候補:

- format check
- lint
- typecheck
- unit test
- integration test
- contract test
- build
- migration validation
- schema validation
- security scan

---

# 13. Hooks

Hooksは決定論的な検証と安全制御に限定する。

現在のClaude Code公式仕様に合わせて`.claude/settings.json`へ設定する。

## 13.1 PreToolUse

防止対象候補:

- `rm -rf`
- `git push --force`
- `git reset --hard`
- `npm publish`
- 本番デプロイ
- 本番Terraform apply
- 秘密情報の読み取り
- `.env`
- secrets
- credentials
- production config
- 未承認のCI/CD変更

既存のpermissions denyと併用する。

## 13.2 PostToolUse

対象ファイル:

- `CLAUDE.md`
- `.claude/agents/**`
- `.claude/skills/**`
- `.claude/rules/**`
- `.claude/settings.json`

検査:

- JSON構文
- YAML frontmatter
- モデルID
- Agent名重複
- 存在しないAgent参照
- 存在しないSkill参照
- 過剰権限
- 禁止ツール
- 保護対象変更
- Shell構文

## 13.3 SubagentStop

可能な範囲で以下を記録する。

- Agent
- Task ID
- 担当作業
- 成果物
- 未解決事項
- 失敗
- 次Agentへの引き継ぎ
- Memory候補
- 改善候補

ログが肥大化しない形式にする。

## 13.4 Stop

確認:

- 必須成果物
- 品質ゲート結果
- Reviewer実施
- Critical/Major残存
- 未解決事項
- Level 2以上の振り返り
- 設計と実装の明らかな不一致

Stop Hookの無限再実行を防止する。

## 13.5 Hooksの制限

以下はHooksで完全判定しない。

- 要件充足
- 設計品質
- テスト観点の意味的十分性
- アーキテクチャ妥当性
- ドキュメント内容の正しさ

これらはReviewerへ委譲する。

---

# 14. 権限設計

最小権限にする。

## 推奨

| Agent | Read | Grep/Glob | Write docs | Edit code | Bash | Agent起動 |
|---|---:|---:|---:|---:|---:|---:|
| Orchestrator | Yes | Yes | 原則No | No | 最小限 | Yes |
| Requirements Analyst | Yes | Yes | No | No | 読み取りのみ | No |
| Architecture Designer | Yes | Yes | Yes | No | 最小限 | No |
| Contract Designer | Yes | Yes | Yes | 必要時限定 | 検証のみ | No |
| Test Designer | Yes | Yes | Yes | No | 最小限 | No |
| Implementation Planner | Yes | Yes | Yes | No | 最小限 | No |
| Implementer | Yes | Yes | Yes | Yes | Yes | No |
| Reviewer | Yes | Yes | レビュー文書のみ | No | テスト実行 | No |
| Reflection Agent | Yes | Yes | 改善候補のみ | No | No | No |
| Evaluator | Yes | Yes | 評価結果のみ | No | 評価実行 | No |
| Improvement Manager | Yes | Yes | 提案のみ | No | 最小限 | 必要時限定 |

現在のClaude Codeでより細かなツール・パス制限が可能な場合は利用する。

---

# 15. Memory設計

Memoryをモデル再学習と誤認しない。

Memoryは次回セッションに読み込まれるコンテキストであり、強制ルールではない。

## 15.1 Auto Memory

保存対象:

- ビルド・テストコマンド
- デバッグで判明した注意
- 頻出エラー
- ユーザーの繰り返し修正
- プロジェクト固有の発見
- 検証中の知見

保存しない:

- 秘密情報
- 一時的な個別タスク状態
- 未検証の推測を確定事項として保存
- 長大なログ
- CLAUDE.mdと同じ内容の重複

MEMORY.mdは索引として簡潔にする。

詳細はトピック別に分ける。

例:

```text
memory/
├── MEMORY.md
├── build-and-test.md
├── architecture-findings.md
├── debugging.md
├── reviewer-findings.md
└── user-preferences.md
```

Auto Memoryはマシンローカルであることを前提に、チームで共有すべき確定知見はGit管理された文書へ昇格する。

## 15.2 Subagent Memory

利用可能な場合、各Agentの専門知見だけを保存する。

例:

- Architecture Designer: 採用済み設計判断、非採用案
- Planner: 漏れやすい変更箇所、実装順序
- Implementer: ビルド・デバッグ知見
- Reviewer: 頻出バグ、重大レビュー観点

複数Agentが知るべき内容を1AgentのMemoryへ閉じ込めない。

## 15.3 CLAUDE.mdへの昇格

条件:

- 全Agentが知る必要がある
- 長期間有効
- 複数回再現
- 明確で検証可能
- 既存ルールと競合しない

## 15.4 Rulesへの昇格

条件:

- 特定領域・パスだけに適用
- 確定した規約
- 複数回利用

## 15.5 Skillsへの昇格

条件:

- 複数ステップの再利用手順
- 成功パターンが複数回再現
- チェックリスト化できる
- コンテキスト必要時だけ読み込む方がよい

## 15.6 Hooksへの昇格

条件:

- 必ず実行すべき
- 機械判定可能
- 誤検知を抑えられる
- セキュリティ・安全性に関わる

---

# 16. 改善候補の昇格条件

単発の失敗でAgent定義を変更しない。

以下のいずれかを満たす場合に改善候補へ昇格する。

- 同じ問題が3回以上
- 同じユーザー訂正が2回以上
- Reviewerの同種Major以上が複数回
- 本番障害または重大試験不具合
- 複数Agentで同じ認識不足
- 継続的な不要Agent呼び出し
- 継続的なトークン浪費
- 成功パターンが複数タスクで再現
- 既存ルールの明確な矛盾

改善候補には以下を記載する。

- ID
- タイトル
- ステータス
- 対象
- 観測事象
- 発生回数
- 対象タスク
- 原因仮説
- 変更案
- 代替案
- 副作用
- 評価方法
- ロールバック
- 承認要否

ID例:

```text
IMP-2026-001
```

---

# 17. 自動変更と承認範囲

## 自動実行可能

- 振り返り作成
- 改善候補作成
- 評価結果作成
- 重複候補の統合提案
- フォーマット修正
- 明確なリンク切れ修正
- Auto Memoryの整理
- タスクメトリクス記録

## Opusレビュー後に反映可能

人間承認ポリシーに反しない範囲で:

- Skillのチェック項目追加
- テンプレートの非破壊的改善
- Agent descriptionの軽微な改善
- 非破壊的Rule追加
- ドキュメント整理

## 人間承認必須

- CLAUDE.md
- Agent責務
- モデル
- ツール権限
- Hooksのブロック条件
- 自動実行シェルコマンド
- セキュリティルール
- 本番関連設定
- 成果物省略条件
- Agent削除・統合
- 自動デプロイ
- 外部送信
- CI/CD変更
- 秘密情報アクセス範囲

---

# 18. Golden TasksとAgent評価

`.claude/evals/`を構築する。

最初は、実コードを変更せずに評価できるシナリオまたは過去タスクを匿名化して作成する。

## 初期評価ケース

1. small-bug-fix
2. api-field-addition
3. graphql-validation-change
4. database-schema-change
5. frontend-screen-change
6. aws-event-flow-change
7. refactoring
8. external-service-failure
9. permission-change
10. documentation-only-change

## 採点

各項目0〜3点。

- 0: 未実施または重大不足
- 1: 不足が多い
- 2: 概ね満たす
- 3: 十分に満たす

評価項目:

- 要件理解
- 影響範囲
- 既存設計理解
- 設計品質
- 契約品質
- テスト観点
- 実装計画
- 実装整合性
- Reviewer品質
- ドキュメント
- 安全性
- 不要作業の少なさ
- Agent呼び出し効率
- トークン効率
- ユーザー確認の適切さ

## 改善採用条件

- 主要品質項目が悪化していない
- 合計点が改善または同等
- Criticalな回帰がない
- 小規模タスクの工程が過剰化していない
- トークン・Agent呼び出しが許容範囲
- ロールバック可能

評価を行えない変更は、理由を明示する。

---

# 19. 品質メトリクス

タスクごとに以下を記録できる仕組みを作る。

```yaml
task_id: TASK-YYYY-NNN
feature_name: example-feature
change_level: 2

agents:
  calls: 0
  retries: 0
  unnecessary_calls: 0

quality:
  tests_added: 0
  initial_test_failures: 0
  reviewer_critical: 0
  reviewer_major: 0
  reviewer_minor: 0
  user_corrections: 0
  escaped_defects: 0

process:
  requirement_rework: 0
  design_rework: 0
  implementation_rework: 0
  missing_documents: 0
  unresolved_items: 0
```

メトリクス取得のために機密情報や会話全文を保存しない。

数値が自動取得できない場合は、推測値を入れず`unknown`とする。

---

# 20. 実運用フロー

Level 2の例:

```text
ユーザー依頼
  ↓
Orchestrator
  ├─ Level判定
  ├─ task-id / feature-name決定
  ↓
Requirements Analyst
  ↓
Architecture Designer
  ↓
必要なら Contract Designer
  ↓
Test Designer
  ↓
Implementation Planner
  ↓
Implementer
  ↓
Quality Gates
  ↓
Independent Reviewer
  ↓
必要なら修正
  ↓
Reflection Agent
  ↓
Orchestrator最終確認
  ↓
ユーザー報告
```

## 並列化

並列化してよい例:

- Backend影響調査とFrontend影響調査
- API契約調査とDB影響調査
- 複数独立モジュールの読み取り調査

直列にする例:

- 要件整理前の設計確定
- 設計前の実装計画確定
- テスト観点前の本実装
- 実装完了前の最終レビュー

並列化を目的化しない。

---

# 21. 初期導入フェーズ

すべてを一度に有効化しない。

## Phase A: 基盤

作成:

- CLAUDE.md
- development-policy
- definition-of-done
- settings permissions
- quality gate scripts

確認:

- 人間が単独で実行可能
- コマンドが正しい
- 既存CIと矛盾しない

## Phase B: 最小Agent

有効化:

- Orchestrator
- Requirements Analyst
- Architecture Designer
- Implementation Planner
- Implementer
- Reviewer

確認:

- 1つのLevel 1シミュレーション
- 1つのLevel 2シミュレーション
- 実コードは変更しない

## Phase C: Skillsと文書

有効化:

- classify-change
- design
- implementation plan
- test plan
- review

確認:

- テンプレートが重すぎない
- 重複文書が作られない
- Level 1で不要文書を作らない

## Phase D: Hooks

有効化:

- 危険操作防止
- 設定検証
- Stop時確認

確認:

- 誤検知
- 無限ループ
- 正常作業を妨げない
- エラーメッセージが具体的

## Phase E: MemoryとReflection

有効化:

- Auto Memory方針
- Reflection Agent
- 改善候補

確認:

- 未検証知見を確定ルールにしない
- Memory肥大化防止
- 秘密情報を保存しない

## Phase F: ImprovementとEvals

有効化:

- Golden Tasks
- Evaluator
- Improvement Manager
- 改善承認フロー

確認:

- 改善前後比較
- ロールバック
- 過剰適応防止

---

# 22. 実装時の禁止事項

以下を禁止する。

1. 調査前に大量の設定ファイルを作る
2. 既存CLAUDE.mdを無断で置換する
3. 既存Hooksを無断で削除する
4. 既存コマンドを推測して品質ゲートへ入れる
5. 存在しないモデルIDで構築完了とする
6. すべてのタスクをLevel 2以上にする
7. 毎タスクAgent定義を変更する
8. 単発事象を恒久ルールへ昇格する
9. Auto Memoryへ秘密情報を保存する
10. Reviewerに実装者の説明だけを渡す
11. テスト失敗を勝手に無視する
12. 本番デプロイを実行する
13. force pushを実行する
14. CI/CDを無承認で変更する
15. Agentへ過剰なツール権限を与える
16. Hookだけで意味的品質を保証したと主張する
17. 公式仕様未確認のHook構文を適用する
18. サンプル検証でプロダクションコードを変更する
19. 成果物ファイルを作っただけで品質向上と判断する
20. トークン効率を無視して常に全Agentを起動する

---

# 23. 構築後の検証シナリオ

実コードを変更せず、委譲計画と成果物案だけをシミュレーションする。

## Scenario 1: 軽微修正

依頼:

```text
画面上の誤字を修正してください。
```

期待:

- Level 1
- 設計書なし
- 最小限の調査
- 実装・対象テスト・簡易レビュー
- 不要なAgentを呼ばない

## Scenario 2: 通常変更

依頼:

```text
既存GraphQL APIに項目を追加し、React画面へ表示してください。
```

期待:

- Level 2
- Backend/Frontend影響調査
- 設計書
- テスト計画
- 実装計画
- 実装Agent
- Reviewer
- 振り返り

## Scenario 3: 重要変更

依頼:

```text
通話要約完了後にSQSとSNSを経由してPush通知を送信してください。
```

期待:

- Level 3
- Step Functions、Lambda、SQS、SNS、端末契約調査
- Event Contract
- リトライ、重複、部分失敗、冪等性
- 設計書
- ADR候補
- テスト計画
- ロールバック
- 独立レビュー
- 振り返り

## Scenario 4: Agent改善

状況:

```text
過去3タスクでReviewerから同じ指摘が出た。
```

期待:

- 改善候補へ昇格
- 保存先判定
- Improvement Managerが変更案作成
- Golden Tasksで比較
- 人間承認前は重要設定を変更しない

---

# 24. 完了条件

以下をすべて満たすまで構築完了としない。

## 設定

- 現行Claude Code仕様と整合
- モデル指定が有効
- Agent定義の構文が有効
- Skillsの構文が有効
- Hooksの構文が有効
- settings.jsonが有効
- 参照切れなし
- Agent名重複なし
- 最小権限

## 運用

- Level分類が機能
- Level 1で過剰工程を起動しない
- Level 2以上で必要文書を作る
- 実装前に設計・計画を確認
- 品質ゲート実行可能
- Reviewer独立性
- 振り返り保存
- Memory保存方針
- 改善承認フロー
- ロールバック方法

## 文書

- development-policy
- definition-of-done
- agent-catalog
- memory-policy
- improvement-policy
- 各Skillテンプレート
- 構築・変更ファイル一覧
- 運用開始手順

## 検証

- 4つのシナリオをシミュレーション
- 誤検知・過剰実行を確認
- 本番コードを変更していない
- 未解決事項を明示

---

# 25. 最終報告フォーマット

構築後、以下の形式で報告する。

## 1. 調査結果

- 技術スタック
- 既存Claude Code設定
- 既存品質コマンド
- 競合
- 制約

## 2. 採用した構成

- Agent一覧
- Model
- Tools
- Skills
- Rules
- Hooks
- Memory

## 3. 作成ファイル

ファイルごとに目的を記載する。

## 4. 更新ファイル

変更点と既存設定への影響を記載する。

## 5. 自動化された内容

- Level分類
- 文書作成
- 品質ゲート
- 設定検証
- 振り返り
- 改善候補

## 6. 自動化していない内容

- 人間承認が必要な変更
- 本番操作
- 重要設定変更

## 7. 検証結果

各シナリオの結果を記載する。

## 8. 未解決事項

推測せず明記する。

## 9. 運用開始方法

- Orchestratorの起動方法
- 通常依頼例
- Memory確認方法
- 改善提案確認方法
- Hook無効化・復旧方法

## 10. ロールバック

作成・変更ファイルを元に戻す手順を記載する。

---

# 26. Claude Codeへの最終実行命令

以上の要件に従い、対象リポジトリへClaude Codeマルチエージェント開発基盤を構築してください。

次の順序を厳守してください。

1. 現在のClaude Codeバージョンと公式仕様を確認
2. リポジトリを調査
3. 既存設定との競合を分析
4. 最小構成と完成構成を比較
5. 導入計画を提示
6. Phase Aから段階的にファイルを作成
7. 各Phaseで構文と動作を検証
8. シミュレーションを実施
9. 問題があれば修正
10. 最終報告を作成

調査や公式仕様の確認で、本書の例をそのまま適用できない部分が判明した場合は、目的を維持した代替構成を採用し、差異と理由を報告してください。

本番コード、CI/CD、本番インフラ、秘密情報へ影響する操作は実行しないでください。

重要設定の自動変更範囲を広げないでください。

構築の品質は、作成ファイル数ではなく、役割分離、検証可能性、安全性、保守性、手戻り削減、過剰実行防止によって評価してください。
