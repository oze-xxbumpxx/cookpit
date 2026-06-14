---
name: create-design-document
description: >
  機能の技術設計書を docs/designs/<feature-name>.md に作成する手順とテンプレート。
  architecture-designer が L2/L3 の設計時に使う。対象外項目は削除せず「対象外」と明記する。
---

# 設計書作成スキル

`docs/designs/<feature-name>.md` を作成する。`<feature-name>` は kebab-case
（`.claude/state/current-feature` の値と一致させる）。

## 手順

1. 入力を確認する：要求メモ（requirements-analyst）、`docs/03-architecture.md`、
   `docs/04-domain-model.md`、関連する既存実装。
2. 既存の `docs/designs/<feature-name>.md` があれば**更新**する（重複作成しない）。
3. 下のテンプレートの**全セクションを残す**。該当しないセクションは削除せず
   「対象外」または「変更なし」と明記する。
4. 設計判断は「提案」として書き、トレードオフがあれば併記して推奨を 1 つ示す。
5. アーキテクチャ原則（依存方向・集約境界・create/reconstruct・手動 DI）に反しないか
   セルフチェックする。

## テンプレート

```markdown
# 設計書: <feature-name>

- ステータス: draft | confirmed
- レベル: L2 | L3
- 関連: docs/requirements/<feature-name>.md（あれば） / 関連 ADR

## 背景
## 目的
## 要件
## 対象範囲
## 対象外
## 現状構成
## 変更後構成
## データフロー
## API 設計
## DB 設計
## フロントエンド設計
## バックエンド設計
## エラー処理
## ログと監視
## セキュリティ
## 性能
## テスト方針
## 移行とリリース
## リスク
## 未決事項
```

## 完了条件

- 全セクションが存在し、対象外は明記されている。
- 「未決事項」にユーザー確認が必要な点が列挙されている。
- アーキテクチャ原則に反する設計が含まれていない。
