---
name: create-adr
description: >
  アーキテクチャ決定記録（ADR）をdocs/decisions/ADR-<番号>-<タイトル>.mdに作成する手順と
  テンプレート。Level 3の重要な設計判断（採用案と非採用案・後方互換・移行）を追跡可能に残す。
---

# ADR作成スキル

重要な設計判断を後から追跡できるよう、ADR（Architecture Decision Record）を
`docs/decisions/ADR-<番号>-<タイトル>.md`に残すための手順と雛形。主にLevel 3で使う。

## いつ作るか

- アーキテクチャ・ドメインモデル・DBスキーマ・契約・外部連携など、後から「なぜこうしたか」を
  説明する必要がある判断をしたとき。
- 複数の妥当な案からトレードオフで1つを選んだとき。

## 採番

- 番号はプロジェクト全体で一意。`docs/decisions/`にADRが無ければ
  **`docs/decisions/ADR-0001-<タイトル>.md`から開始**する。
- 以降は`docs/decisions/`の最大番号 +1。配布元のADRは引き継がない。

## 候補の比べ方

ADR級の決定（スタック・アーキテクチャ・後方互換）は、AIが候補と比較を示し、ユーザーが決める（AGENTS.md）。
比較は、その機能の論点の記録（`docs/discussions/<feature-name>.md`）に論点として書き、確認のページで出す
（[ask-questions](../ask-questions/SKILL.md)の「ユーザーへの出し方」）。候補ごとに利点と欠点を書き、推奨を1つ選ぶ。
答えが出たら、ADRのAlternativesに選ばなかった候補と理由を短く書き、詳しくは論点の記録へリンクする
（ADRは単独で読まれるので、リンクだけにしない。2026-10-04決定）。

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

- Statusが設定されている。
- Alternativesに非採用案と却下理由がある（「検討した」ことを残す）。
- Migration / Rollbackが判断されている（不要なら「対象外」と明記）。

## 良い例

初めて書くときは本スキルのテンプレートを使い、
Alternativesに非採用案と却下理由を残す。
（配布元CookpitではADRに選択肢A/B/Cと採択理由があり、後続設計が「ADR-xxx準拠」と
参照できた。その型を踏襲する。）

## 注意

- ADRは判断の記録であり、SkillやRuleへの昇格とは別。恒久ルール化は
  [memory-policy.md](../../../docs/claude-code/memory-policy.md)の昇格条件に従う。
