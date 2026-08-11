# 06. AI ツール活用方針

## ツール別の役割

| ツール      | 役割                           |
| ----------- | ------------------------------ |
| Claude Code | 設計・実装設計・最終レビュー   |
| Codex       | 実装（定型・ボイラープレート） |
| Gemini      | 技術調査                       |
| Perplexity  | ライブラリ検索                 |

> 補足: L2/L3 の開発タスクでは Claude Code は Orchestrator として動き、実装を
> implementer Subagent が担当することもある。使い分けは次節を参照。

---

## 実装ルートの使い分け（Codex 委譲 か Orchestrator/implementer か）

実装ルートは 2 系統ある。タスク開始時に変更レベル（L0〜L3）の判定と一緒に、
どちらのルートを使うかを宣言する（2026-07-02 明文化）。

| 観点       | Codex 委譲                                                                             | Orchestrator / implementer（CLAUDE.md の開発ワークフロー）            |
| ---------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 向くタスク | 仕様・設計が確定済みで、定型・ボイラープレート比重が高い大量実装                       | 工程管理と整合性保証が必要な L2/L3。探索的・対話的な変更              |
| 進め方     | Claude Code が設計・実装計画・実装指示書を作成 → Codex が実装 → Claude Code がレビュー | Orchestrator が要求分析〜設計〜実装〜試験〜レビューを Subagent へ委譲 |
| コスト     | 別サブスクのため Claude Code の usage を消費しない（最大のコストレバー）               | Subagent はコールドスタートで文脈を再取得するため usage は増える      |
| 実績       | Sprint 1 の各画面実装（`docs/tasks/`）、Sprint 2 product-master（`docs/tasks/codex/`） | ビジュアルデザイン移行（2026-06-16）、store-master（2026-06-28）      |

判断の目安:

- **指示書に書き切れるなら Codex**。実装中に設計判断が発生しうるなら Orchestrator。
- どちらのルートでも設計判断と最終レビューは Claude Code が担う（下記の注意事項どおり）。
- Codex ルートの実装計画は軽量（分解・依存・完了条件のみ）とし、ファイル別の実装内容は
  ブリーフ `docs/tasks/codex/<feature>/` が正本（IMP-2026-025。二重生成しない）。
- Codex 実装のレビューは下記の既知リスク catalog を機械検出と Reviewer の探索へ使う。

### Codex 実装の既知リスク catalog（2026-08-11 更新）

Sprint 1〜2 の Codex 実装レビューで繰り返し検出したミスの型。多くは `tsc` / `eslint` を
通過するが、これは**人間が毎回全項目を走査するチェックリストではない**。最初に機械検出し、
Reviewer が差分で真偽を確定し、操作でしか分からない変更経路だけを実画面で確認する。
（出典: `logs/2026-05-16.md` / `2026-05-17.md` / `2026-06-06.md` / `2026-06-16.md`）

```bash
node .claude/scripts/check-codex-implementation.mjs --brief docs/tasks/codex/<feature>
```

| 既知リスク                           | 一次検出               | 追加証拠が必要な条件                 |
| ------------------------------------ | ---------------------- | ------------------------------------ |
| 識別子のタイポ                       | script + brief 照合    | public contract と実装が曖昧なとき   |
| Tailwind クラス名のタイポ・連結ミス  | script                 | 表示に影響する候補だけ実画面         |
| イベントハンドラの結線漏れ           | script + Reviewer      | 変更した操作経路だけ実画面           |
| `'use client'` の付け忘れ / 不要付与 | script                 | 原則不要                             |
| `import type` 規約漏れ               | lint または Reviewer   | lint 未導入時だけ差分確認            |
| 命名の傾向ずれ                       | script + brief 照合    | contract / DB 命名の意図が曖昧なとき |
| 差し戻しの部分反映                   | review state + 指摘 ID | 以前の open 指摘と影響経路を再確認   |
| バリデーションの分岐漏れ             | script + test          | 高影響の反例が未試験のとき           |

機械結果の誤検出や green 項目は、人間へ再確認させず監査ログへ圧縮する。人間へ渡すのは
主観・不可逆・未知の最大 3 件だけで、現在状態は
`node .claude/scripts/review-readiness.mjs check --feature <feature>` で鮮度を確認する。詳細手順は
`.claude/skills/review-codex-implementation/SKILL.md`、表示契約は `docs/reviews/README.md` を正典とする。

実際に使った Codex の model / reasoning effort は既知リスクとは別の運用メタデータとして、
`docs/reviews/<feature>.md` と metrics YAML の `codex:` セクションへ記録する。

---

## 各ツールの詳細

### Claude Code — 設計・実装設計・最終レビュー

プロジェクトの文脈（ADR・ドメインモデル・アーキテクチャ方針）を保持するメインエージェント。
設計判断が必要な作業はすべてここに集約する。

**担当する作業**

- アーキテクチャ・ドメインモデルの設計判断
- 実装設計（どう実装するかの方針決定）
- コードレビュー（設計方針との整合性確認）
- 設計の壁打ち・議論

**使わない場面**

- 単純な補完・タイピング補助 → Codex に任せる

---

### Codex — 実装（定型・ボイラープレート）

Claude が決めた実装設計に従って、繰り返しパターンのコードを高速に生成する。

**担当する作業**

- Drizzle スキーマの定型記述
- Repository 実装のボイラープレート
- shadcn/ui コンポーネントの組み合わせ
- IDE 上のリアルタイム補完

**使わない場面**

- 設計判断が含まれる実装 → Claude に相談してから Codex で書く

---

### Gemini — 技術調査

長いコンテキスト窓を活かした調査・レビューに使う。

**担当する作業**

- 複数ファイルをまとめた俯瞰レビュー
- ライブラリの公式ドキュメントの解釈
- Claude とセカンドオピニオンが欲しい場合の比較検討

---

### Perplexity — ライブラリ検索

最新情報の検索に特化して使う。

**担当する作業**

- ライブラリの最新バージョン・breaking changes の確認
- エラーメッセージの原因調査
- 「○○ vs ○○ 2025年時点」のような比較調査

---

## フェーズ別の使い方

### Sprint 0（環境構築）

```
Perplexity: Turborepo + Next.js 16 + Tailwind v4 の最新セットアップ手順を確認
    ↓
Claude Code: セットアップ実施・設定ファイル生成・エラー対応
    ↓
Gemini: 設定ファイル群をまとめてレビュー
```

### Sprint 1〜（ドメイン・アプリケーション層実装）

```
Claude Code: ドメインモデル実装設計・設計判断の壁打ち
Codex: Drizzle スキーマ・Repository のボイラープレート補完
Gemini: 集約をまたぐ設計の俯瞰レビュー
```

### 画面実装フェーズ

```
Claude Code: コンポーネント設計・Hono RPC との接続設計
Codex: shadcn/ui コンポーネントの組み合わせ・定型 UI 実装
Perplexity: TanStack Query の特定パターンなど調べ物
```

---

## 注意事項

- 設計判断は必ず Claude Code に集約する。Codex が出したコードが設計方針と合っているかは Claude でレビューする。
- 複数ツールに同じ質問を並列投げして「良い方を採用」する運用は避ける。プロジェクト文脈を知らないツールの答えは方針と噛み合わないことがある。
