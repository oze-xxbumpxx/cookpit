# ドキュメント方針（変更レベルと自動成果物）

「すべての変更で重い設計書を作る」ことも「設計書を一切残さない」ことも避ける。
変更規模を3段階に分類し、レベルに応じて必要な成果物だけを作る。

設計書の作成自体を目的にしない。**実装に必要な判断**と**後から追跡すべき内容**を残す。

## 変更レベルの判定

このセッションが作業開始時にレベルを判定し、判定理由を簡潔に提示する（`classify-change`）。

### Level 0：調査・相談

コード調査 / 原因分析 / 設計相談 / 実装案比較 / ドキュメントの説明。

成果物：

- 調査結果（必要なら提案書）。**プロダクションコードは変更しない。**
- 設計書・実装計画・ADRは作らない。`.claude/state/current-feature`も設定しない。

### Level 1：軽微な変更

文言修正 / CSS微調整 / コメント修正 / 単純なnullチェック / テストコードだけの修正 /
明らかな小規模バグ修正。

成果物：

- 設計書・実装計画は原則不要
- 最終報告に「変更理由」と「確認した内容」を記載

### Level 2：通常変更

既存APIへの項目追加 / 既存画面への機能追加 / バリデーション変更 / 業務ロジック変更 /
既存処理の変更。

成果物：

```
docs/designs/<feature-name>.md
docs/implementation-plans/<feature-name>.md
docs/tests/<feature-name>.md
```

### Level 3：重要変更

新規API / DBスキーマ変更 / 認証・認可変更 / 新規画面（**新規API・DB変更を伴う場合。
既存API・既存契約のみを使う画面追加はLevel 2**。実判定: recipe-edit-screen） /
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

> 判断に迷う境界例（例：既存APIへの項目追加だがDBスキーマも変わる）は、
> **上位レベル**として扱う。

## 自動ドキュメント作成

ユーザーが明示的に「設計書を作って」と言わなくても、L2/L3と判定した場合は必要な
成果物を作成する。ただし以下を守る。

- 既存ドキュメントがある場合、新規作成の前に**更新対象か確認**する
- 同じ内容のドキュメントを重複作成しない
- 対象外の項目は削除せず「対象外」または「変更なし」と明記する（設計書テンプレート参照）

成果物の作成手順とテンプレートは各Skillに定義している。

- 設計書 … `create-design-document`
- 実装計画 … `create-implementation-plan`
- 試験計画 … `create-test-plan`
- 整合性確認 … `validate-deliverables`

## feature-nameと成果物検証

`feature-name`は成果物ファイル名を貫く識別子（kebab-case、例`recipe-tag`）。

L2/L3では、このセッションが作業開始時に`.claude/state/current-feature`へ現在のfeature-nameを
1行で書き込む。Hookはこの値を使い、L2/L3のソース変更に対して対応する設計書・
実装計画・試験計画の存在と必須セクションの非空を**警告として**チェックする
（ブロックはしない）。詳細は
[orchestration-policy.md](./orchestration-policy.md)と`.claude/hooks/`を参照。

Hookで機械的に判定できない整合性（要件と実装の意味的な一致など）は
`validate-deliverables` Skillとreviewerに委譲する。

## 既存ドキュメントとの関係

プロジェクトの恒久ドキュメント（`AGENTS.md`と、**実在する** `docs/`）が正典。
未作成の`docs/01`〜`07`や層別ルールは正典にしない。
feature単位の成果物（`docs/designs/`等）はそれらを参照し、重要な意思決定はADR
（`docs/decisions/`・採番はADR-0001から — `.claude/skills/create-adr/SKILL.md`）として残す。

## notes/（未整形メモ）

`notes/`はユーザーがObsidianで書き溜める未整形メモ（アイディア・改善の種）の置き場で、
**変更レベル成果物（L1〜L3）の置き場ではない**（本ポリシーの成果物パス規約の対象外）。
Claudeが読むのは、ユーザーが明示的に指したとき、またはタスクに直接関連するメモの存在を
伝えられたときのみ。セッション開始時の必読には含めない。

住み分け: notes/ は「人間側のinbox」、Auto Memoryは「Agent側のinbox」。
昇格ルール（docs/ の型への落とし方）は[notes/README.md](../../notes/README.md)を正とし、
[memory-policy.md](./memory-policy.md) / [improvement-cycle.md](./improvement-cycle.md)の
段階原則と競合させない。
