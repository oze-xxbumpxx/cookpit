---
name: create-adr
description: >
  アーキテクチャ決定記録（ADR）を docs/decisions/ADR-<番号>-<タイトル>.md に作成する手順と
  テンプレート。Level 3 の重要な設計判断（採用案と非採用案・後方互換・移行）を追跡可能に残す。
---

# ADR 作成スキル

重要な設計判断を後から追跡できるよう、ADR（Architecture Decision Record）を
`docs/decisions/ADR-<番号>-<タイトル>.md` に残すための手順と雛形。主に Level 3 で使う。

## いつ作るか

- アーキテクチャ・ドメインモデル・DB スキーマ・契約・外部連携など、後から「なぜこうしたか」を
  説明する必要がある判断をしたとき。
- 複数の妥当な案からトレードオフで 1 つを選んだとき。

## 採番

- `docs/decisions/` の既存 ADR 連番の最大 +1。`ADR-0007-recipe-status-migration.md` の形式。
- 既存の恒久 ADR ディレクトリ（`docs/decisions/` または `docs/adr/`）があればそれに合わせる。

## テンプレート

```markdown
# ADR-<番号>: <タイトル>

- Status: Proposed | Accepted | Superseded by ADR-XXXX | Deprecated
- Date: YYYY-MM-DD
- 関連 feature: <feature-name>

## Context（背景・なぜ判断が必要か）
## Decision（採用した決定）
## Alternatives（検討した非採用案と却下理由）
## Consequences（良い影響・悪い影響・残るリスク）
## Migration（移行が必要な場合の手順。不要なら「対象外」）
## Rollback（決定を戻す場合の手順）
## References（設計書・要件・関連 ADR・外部資料へのリンク）
```

## 完了条件

- Status が設定されている。
- Alternatives に非採用案と却下理由がある（「検討した」ことを残す）。
- Migration / Rollback が判断されている（不要なら「対象外」と明記）。

## 注意

- ADR は判断の記録であり、Skill や Rule への昇格とは別。恒久ルール化は
  [memory-policy.md](../../../docs/claude-code/memory-policy.md) の昇格条件に従う。
