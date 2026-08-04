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

- 番号はプロジェクト全体で一意。**既存 ADR は `docs/` 直下に ADR-001〜004 が実在する**
  （`docs/decisions/ADR-0001-web-not-native.md` 〜 `docs/decisions/ADR-0004-no-user-in-domain.md`。設計書・レビューから
  「ADR-003 準拠」等で参照されている）。この連番を引き継ぐ。
- 新規 ADR は `docs/decisions/` に **`ADR-0005-<タイトル>.md` から**作成する
  （既存最大 004 の +1。以降は `docs/` 直下と `docs/decisions/` を合わせた最大 +1）。
  `ADR-0001` から始めない — 既存 ADR-001 と番号が衝突する。
- 既存 4 件は移動しない（移設・置き場所の統一はユーザー判断事項）。

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

## 良い例（既存 ADR）

- `docs/decisions/ADR-0003-no-auth-in-mvp1.md`（ADR-003）— 検討した選択肢 A/B/C と採択理由が残っており、
  後続の設計書（`cookpit/store-master 設計書` §13 ほか）が「ADR-003 準拠」として参照できて
  いる（出典: `cookpit/store-master レビュー` で意図的な設計判断として確認済み）。
  ※旧形式のため Migration / Rollback 節が無い。新規作成では本スキルのテンプレートを使う。

## 注意

- ADR は判断の記録であり、Skill や Rule への昇格とは別。恒久ルール化は
  [memory-policy.md](../../../docs/claude-code/memory-policy.md) の昇格条件に従う。
