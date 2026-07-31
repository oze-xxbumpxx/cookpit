---
name: create-requirements-document
description: >
  要件定義書を docs/requirements/<feature-name>.md に作成する手順とテンプレート。
  architecture-designer が Level 3（および必要な Level 2）で使う（IMP-2026-031）。
  対象外項目は削除せず「対象外」と明記する。
---

# 要件定義書作成スキル

architecture-designer が `docs/requirements/<feature-name>.md` を作成するための手順と雛形
（旧 requirements-analyst の責務を吸収。IMP-2026-031）。
**コードは変更しない。** 既存の要件文書があれば新規作成せず更新する（重複作成しない）。

## 進め方

1. Orchestrator から渡された目的・対象範囲・参照ファイルを確認する。
2. プロジェクト前提を `docs/01-overview.md` `docs/03-architecture.md` `docs/04-domain-model.md`
   で押さえ、既存実装・既存仕様を Grep/Glob/Read で調査する。
3. 曖昧点・前提・制約を列挙し、ユーザー確認が必要な事項を明示する。
4. 下記テンプレートを埋める。対象外項目は削除せず「対象外」「該当なし」と書く。
5. L3 で最初の Write 担当のときは Orchestrator の指示により `.claude/state/current-feature` に
   feature-name を 1 行で書く。

## テンプレート

```markdown
# 要件定義: <feature-name>

- task-id / 変更レベル:
- 作成日:

## 背景
## 目的
## ユーザー要求（原文の要約）
## 機能要件
## 非機能要件（性能・セキュリティ・可用性など。無ければ「対象外」）
## 正常系
## 異常系
## 境界条件（null・空・上限/下限・権限境界）
## 前提
## 制約
## 対象範囲
## 対象外
## 後方互換性・データ移行（該当なければ「対象外」）
## 受け入れ条件（Definition of Done に対応）
## 未決事項（誰に何を確認するか）
```

## 完了条件

- 全セクションが埋まっている（対象外は明記）。
- 不明点・要確認事項が列挙されている。
- 影響範囲が具体パスで示されている。

## 良い例（実タスクの成果物）

- `cookpit/store-master 要件` §5 — 正常系 N-xx / 異常系 E-xx / 境界 B-xx の採番つき
  観点表で列挙。この採番が下流工程の照合基準になり（create-test-plan 手順8 は「要件書を正」
  として全観点の反映を照合する）、reviewer の「要件・設計・実装計画・実装の整合性」確認を
  通過した（出典: `cookpit/store-master レビュー`。同レビュー Should-2 は、要件書 N-02 を
  下流が省略したことを要件書側の採番のおかげで検出できた例でもある）。

## 禁止事項

- コードの変更・設計の確定（設計は architecture-designer / contract-designer）。
- 推測での仕様確定（未決は「未決事項」に残す）。
