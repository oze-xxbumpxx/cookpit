# ドキュメント方針（変更レベルと自動成果物）

「すべての変更で重い設計書を作る」ことも「設計書を一切残さない」ことも避ける。
変更規模を 3 段階に分類し、レベルに応じて必要な成果物だけを作る。

設計書の作成自体を目的にしない。**実装に必要な判断**と**後から追跡すべき内容**を残す。

## 変更レベルの判定

Orchestrator は作業開始時にレベルを判定し、判定理由を簡潔に提示する。

### Level 0：調査・相談

コード調査 / 原因分析 / 設計相談 / 実装案比較 / ドキュメントの説明。

成果物：

- 調査結果（必要なら提案書）。**プロダクションコードは変更しない。**
- 設計書・実装計画・ADR は作らない。`.claude/state/current-feature` も設定しない。

### Level 1：軽微な変更

文言修正 / CSS 微調整 / コメント修正 / 単純な null チェック / テストコードだけの修正 /
明らかな小規模バグ修正。

成果物：

- 設計書・実装計画は原則不要
- 最終報告に「変更理由」と「確認した内容」を記載

### Level 2：通常変更

既存 API への項目追加 / 既存画面への機能追加 / バリデーション変更 / 業務ロジック変更 /
既存処理の変更。

成果物：

```
docs/designs/<feature-name>.md
docs/implementation-plans/<feature-name>.md
docs/tests/<feature-name>.md
```

### Level 3：重要変更

新規 API / DB スキーマ変更 / 認証・認可変更 / 新規画面（**新規 API・DB 変更を伴う場合。
既存 API・既存契約のみを使う画面追加は Level 2**。実判定: recipe-edit-screen） /
外部サービス連携 / アーキテクチャ変更 / 既存データの移行。

成果物：

```
docs/requirements/<feature-name>.md
docs/designs/<feature-name>.md
docs/implementation-plans/<feature-name>.md
docs/tests/<feature-name>.md
docs/decisions/ADR-<number>-<title>.md
docs/reviews/<feature-name>.md
```

> 判断に迷う境界例（例：既存 API への項目追加だが DB スキーマも変わる）は、
> **上位レベル**として扱う。

## 自動ドキュメント作成

ユーザーが明示的に「設計書を作って」と言わなくても、L2/L3 と判定した場合は必要な
成果物を作成する。ただし以下を守る。

- 既存ドキュメントがある場合、新規作成の前に**更新対象か確認**する
- 同じ内容のドキュメントを重複作成しない
- 対象外の項目は削除せず「対象外」または「変更なし」と明記する（設計書テンプレート参照）

成果物の作成手順とテンプレートは各 Skill に定義している。

- 設計書 … `create-design-document`
- 実装計画 … `create-implementation-plan`
- 試験計画 … `create-test-plan`
- 整合性確認 … `validate-deliverables`

## feature-name と成果物検証

`feature-name` は成果物ファイル名を貫く識別子（kebab-case、例 `recipe-tag`）。

Orchestrator は作業開始時に `.claude/state/current-feature` へ現在の feature-name を
1 行で書き込む。Hook はこの値を使い、L2/L3 のソース変更に対して対応する設計書・
実装計画・試験計画の存在と必須セクションの非空を**警告として**チェックする
（ブロックはしない）。詳細は
[orchestration-policy.md](./orchestration-policy.md) と `.claude/hooks/` を参照。

Hook で機械的に判定できない整合性（要件と実装の意味的な一致など）は
`validate-deliverables` Skill と reviewer に委譲する。

## 既存ドキュメントとの関係

プロジェクトの恒久ドキュメント（`docs/01`〜`08`、`docs/` 直下の ADR-001〜004、
`docs/04-domain-model.md` など）は引き続き正典。feature 単位の成果物（`docs/designs/` 等）は
それらを参照し、重要な意思決定が恒久ドキュメントに昇格すべき場合は ADR
（`docs/decisions/`・採番は ADR-0005 から — `.claude/skills/create-adr/SKILL.md`）として残す。

## notes/（未整形メモ）

`notes/` はユーザーが Obsidian で書き溜める未整形メモ（アイディア・改善の種）の置き場で、
**変更レベル成果物（L1〜L3）の置き場ではない**（本ポリシーの成果物パス規約の対象外）。
Claude が読むのは、ユーザーが明示的に指したとき、またはタスクに直接関連するメモの存在を
伝えられたときのみ。セッション開始時の必読には含めない。

住み分け: notes/ は「人間側の inbox」、Auto Memory は「Agent 側の inbox」。
昇格ルール（docs/ の型への落とし方）は [notes/README.md](../../notes/README.md) を正とし、
[memory-policy.md](./memory-policy.md) / [improvement-cycle.md](./improvement-cycle.md) の
段階原則と競合させない。
