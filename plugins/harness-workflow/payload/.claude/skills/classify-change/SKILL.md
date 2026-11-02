---
name: classify-change
description: >
  ユーザー要求を変更レベル（Level 0〜3）へ分類し、判定理由・このセッションで読むスキル・
  起動する検証役・必須成果物・省略工程を決める。機能追加や修正の最初に使う。
  小規模変更を過剰工程にしないための判断に用いる。
---

# 変更レベル分類スキル

タスク開始時に変更レベルを判定する手順。レベル定義の決まりは
[docs/claude-code/document-policy.md](../../../docs/claude-code/document-policy.md)、完了条件は
[definition-of-done.md](../../../docs/claude-code/definition-of-done.md)。

## 入力

- ユーザー要求（原文）
- 既存構成（影響しそうな層・パッケージ・ファイル）
- 影響範囲の初期見積り

## 判定フロー

1. **コード変更が無いか？** → Level 0（調査・相談）。
2. 変更はあるが**既存仕様を変えない軽微修正**（文言・コメント・CSS微調整・明らかなtypo・
   単純なnullチェック・小規模バグ修正）か？ → Level 1。
3. **既存API/画面/ロジック/Repositoryの変更**で、複数ファイルに及ぶが後方互換を壊さないか？
   → Level 2。
4. **新規API・DBスキーマ変更・データ移行・認証認可・外部/AWS連携・
   アーキテクチャ変更・大規模リファクタ・後方互換に影響**するか？ → Level 3。
   - **新規画面だけではL3にしない。** 新規API / DB変更を伴う場合のみL3。既存API・既存契約
     だけを使う画面追加はL2（配布元Cookpitのrecipe-edit-screen実判定）。
     「新規画面」をL3トリガー一覧の見出しだけで読まないこと。
5. 境界例（例：API項目追加だがDBスキーマも変わる）は**上位レベル**として扱う。

### 判定例（実タスクの実績）

- **L2の例**: recipe-edit-screen — 新規画面だがバックエンド・契約は既存のまま
  （Presentation層のみ）→ L2。手戻りゼロで完走
  （出典: `cookpit/recipe-edit-screen`事象1・3）。
- **L3の例**: store-master — 新規API（`GET/POST /api/stores`）+ DBスキーマ変更
  （storesテーブル）を含む全層変更 → L3
  （出典: `cookpit/store-master 要件` / `cookpit/store-master 設計書`）。
- **L2の例（テストのみの変更）**: test-infra-expansion — プロダクションコード変更0の
  テスト基盤拡張だが、新規9ファイル・複数パッケージ（infrastructure / apps/web）に及ぶ
  → 「軽微修正」ではなくL2。手戻りゼロで完走
  （出典: `cookpit/test-infra-expansion`対象タスク概要・事象1）。

## 出力（会話でユーザーへ提示）

- **判定レベル**（0〜3）
- **判定理由**（なぜそのレベルか、1〜3行）
- **ユーザー承認**（必要 / 不要）
  - L0 / L1: 不要。小さな修正は直接進める。
  - L2 / L3: 必要。設計書の承認後に実装へ進む。ADR級の決定（スタック・アーキテクチャ・後方互換）もユーザーが決める。
  - 正典は`AGENTS.md`の「作業分担（AI駆動開発）」。
- **このセッションで読むスキルと、起動する検証役**
- **必要成果物**（document-policyのレベル別成果物）
- **省略する工程と理由**（過剰工程を避けるため、何を作らないか）

### レベル別のスキル・検証役・成果物（早見）

| Level | このセッションで読むもの | 検証役 | 必須成果物 |
| ----- | --- | --- | --- |
| 0 | コードを読む。広ければ探索を子に渡す（`Explore`） | なし | なし（必要なら提案） |
| 1 | `implement-change` | 振る舞いが変わるなら`reviewer` | なし（報告に変更理由） |
| 2 | `ask-questions`、`create-design-document`、`create-implementation-plan`、`create-test-plan`、承認後`implement-change` | `reviewer`。`security-reviewer`は条件付き | designs / implementation-plans / tests |
| 3 | L2に加え`create-requirements-document`。ADR級なら`create-adr` | `reviewer`と`security-reviewer` | requirements / designs / implementation-plans / tests / decisions(ADR) |

契約の形は設計書のContract節に書く。専用の契約役は無い。改善サイクルの振り返りは、ユーザーが頼んだときだけ`reflect-task`。無い工程は飛ばし、飛ばした旨を報告に書く。

## 注意

- 小規模変更にLevel 3相当の工程を当てない。
- 判定後、L2/L3ではこのセッションが`.claude/state/current-feature`に
  feature-nameを書く。L0/L1では設定しない（Hookの誤検知を防ぐ）。
- L2/L3と判定したら、論点の記録と進み具合を作る:
  `node .claude/scripts/discussion.mjs init <feature-name> --level L2|L3 --title <機能の名前>`。
  以降、工程が変わるたびに`discussion.mjs stage`で進み具合を更新する（`docs/discussions/README.md`）。
