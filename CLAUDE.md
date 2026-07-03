# CLAUDE.md

このプロジェクト（Cookpit / Clean Architecture + DDD のモノレポ）で Claude Code が
常時守る原則だけを記載する。工程の詳細手順は Skills（`.claude/skills/`）と各 Subagent
定義（`.claude/agents/`）、局所ルールは `.claude/rules/`、ワークフローの詳細は
`docs/claude-code/` に分離している。ここを肥大化させないこと。

## セッション開始時

作業前に必ず読み込む。

- `docs/01-overview.md` / `docs/03-architecture.md` / `docs/04-domain-model.md` / `docs/07-dev-rules.md`

前回作業は `logs/` の最新ファイル、定型依頼は `docs/08-prompt-templates.md` を参照。

## 開発ワークフロー（Orchestrator 主導）

機能追加・修正は **Orchestrator** が指揮し、専門 Subagent へ調査・設計・計画・実装・
試験・レビューを委譲する。Orchestrator は `claude --agent orchestrator` で起動する。

- **Orchestrator を使う条件**：複数工程・複数ファイル・複数層にまたがる開発タスク
  （機能追加、仕様変更、新規 API/画面、スキーマ変更など）。単発の質問や調査は不要。
- **委譲方針**：Orchestrator は自分で詳細設計や大量実装を完結せず分配する。`Agent` を
  持つのは orchestrator（全実務 Agent）・reviewer（検証用 requirements-analyst のみ）・
  agent-improvement-manager（agent-evaluator のみ）の 3 つ
  （[agent-responsibilities.md](docs/claude-code/agent-responsibilities.md)）。
  実装は implementer、設計は architecture-designer に委譲する。
- 詳細は [docs/claude-code/orchestration-policy.md](docs/claude-code/orchestration-policy.md)
  と [docs/claude-code/development-workflow.md](docs/claude-code/development-workflow.md)。

## ドキュメント方針（変更レベルと自動成果物）

作業開始時に変更レベル（L1/L2/L3）を判定し、判定理由を簡潔に示す。L2/L3 はユーザーの
明示指示がなくても必要な成果物（設計書・実装計画・試験計画ほか）を作成する。設計書作成
自体を目的にせず、実装に必要な判断と後から追跡すべき内容を残す。既存ドキュメントがあれば
更新を優先し、重複作成しない。詳細は
[docs/claude-code/document-policy.md](docs/claude-code/document-policy.md)。

## 実装前に確認すること

L2/L3 の実装着手前に、確定した `docs/designs/<feature>.md` と
`docs/implementation-plans/<feature>.md` が揃い、必須セクションが埋まっていること。
設計から逸脱が必要なら独断で変えず Orchestrator へ差し戻す。

## 行動制約

- **新規ファイルの作成・既存ファイルの削除は、必ず事前に確認を取る。**
- 複数ファイルにまたがる変更は、変更範囲を先に提示してから実施する。
- 設計判断（アーキテクチャ・ドメインモデル・DB スキーマ）は提案にとどめ、
  「提案 → 確認 → 実装」の順を守る。
- 依頼スコープ外のリファクタリング・改善はしない。気づきはコメントで伝える。
- **指定の作業ブランチ**への `git commit` / `git push` は事前承認なしで可（リモートの
  エフェメラル環境では成果保全に必要）。ただし `main` 等の指定外ブランチへの push、
  ブランチの作成・削除、force-push / `git reset --hard` 等の破壊的操作は明示指示があるまで
  行わない。構成ファイル（CLAUDE.md / Agent 定義 / Hook / Skill / Rule）の変更を含むコミットは
  改善サイクルの承認境界に従い、人間承認を得てから行う。

## ユーザーへ確認すべき条件

アーキテクチャ/ドメイン/DB スキーマの設計判断、新規作成・削除、スコープ超過、
後方互換・データ移行、複数案のトレードオフ選択 — これらは進める前に確認する。

## 完了条件

要求 → 設計 → 実装計画 → 実装 → 試験 に矛盾がなく、L2/L3 の必要成果物が揃い、
`pnpm lint` / `pnpm type-check` / `pnpm test`（テストランナーは Vitest。全層導入済みで、
変更したパッケージの該当テストを追加・実行する）が通り、スコープ外変更が
無いことを確認してから完了を報告する。詳細は development-workflow.md。

## アーキテクチャ原則（要約・実装時に必ず守る）

詳細・適用範囲は `.claude/rules/`（`domain-layer.md` / `coding-standards.md` /
`presentation-layer.md`）と `docs/03-architecture.md` を正典とする。

- 依存方向：`Presentation → Application → Domain ← Infrastructure`。
  `packages/domain` は他に依存しない。Domain 層に Drizzle・HTTP の型を持ち込まない。
- Entity 生成は `static create()`、DB 復元は `static reconstruct()`。ドメインロジックは
  Entity / Value Object に閉じ込める。
- 集約をまたぐ参照は ID 参照のみ。集約をまたぐ操作は Application 層の UseCase に置く。
- UseCase は 1 ユースケース = 1 クラス・`execute()`。DI は手動 DI（MVP1 の間）。
- `any` 禁止・default export 禁止・型のみは `import type`・`===`/`!==`・「値なし」は `null`。
- コメントは Why が非自明な時のみ。エラー処理は UseCase の入口で行う。

## 継続的改善（Memory / 改善サイクル）— 半自動型

タスクの手戻り・ユーザー修正・レビュー指摘・テスト失敗・成功手順を蓄積し、Agent 構成を
段階的に改善する。**候補収集と評価は自動、重要設定の変更は人間（または Opus の manager）承認が
必要**な半自動型。原則だけ守ればよく、運用詳細は下記ドキュメントに委ねる。

- 段階を飛ばさない：`単発 → Memory` / `繰り返す → 改善候補` / `検証済み → Agent・Skill・Rule`。
- **毎タスク Agent 定義を書き換えない。** 改善＝指示追加ではなく、不要な指示の削除・移動も含む。
- 保存先分類・昇格条件・誤情報の削除は [docs/claude-code/memory-policy.md](docs/claude-code/memory-policy.md)、
  改善サイクル・承認境界・実行タイミングは
  [docs/claude-code/improvement-cycle.md](docs/claude-code/improvement-cycle.md) を正典とする。

## 参照ドキュメント

| ドキュメント | 内容 |
| --- | --- |
| [docs/01-overview.md](docs/01-overview.md) | プロジェクト概要・スコープ |
| [docs/02-tech-stack.md](docs/02-tech-stack.md) | 技術スタック・選定理由 |
| [docs/03-architecture.md](docs/03-architecture.md) | アーキテクチャ・ディレクトリ構成 |
| [docs/04-domain-model.md](docs/04-domain-model.md) | ドメインモデル設計 |
| [docs/05-roadmap.md](docs/05-roadmap.md) | スプリント計画 |
| [docs/07-dev-rules.md](docs/07-dev-rules.md) | 開発ルール |
| [docs/claude-code/](docs/claude-code/) | Orchestration / ワークフロー / ドキュメント方針 / Agent 責務 |
| [docs/claude-code/memory-policy.md](docs/claude-code/memory-policy.md) | Memory 分類・昇格条件・肥大化対策・誤情報削除 |
| [docs/claude-code/improvement-cycle.md](docs/claude-code/improvement-cycle.md) | 改善サイクル・承認境界・回帰評価・実行タイミング |
| [docs/claude-code/improvements/](docs/claude-code/improvements/) | 改善候補・提案・評価・採否の記録置き場 |
