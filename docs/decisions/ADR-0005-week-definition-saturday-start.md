# ADR-0005: MealPlan の週定義に ISO 8601 週番号を採用せず土曜始まりを採用する

- Status: Accepted
- Date: 2026-07-05
- 関連 feature: meal-plan-core

## Context（背景・なぜ判断が必要か）

Sprint 3 で MealPlan 集約を実装するにあたり、「週」をどう識別するかを決める必要がある。
実際の運用は「土曜日に献立を決め → 買い出し → 金曜まで消費」というサイクルであり、週の開始日は土曜日である
（`docs/requirements/meal-plan-core.md` 前提1、ユーザー確定）。

一方 `docs/04-domain-model.md` の `WeekIdentifier` のコードスニペットには、`fromDate()` の実装コメントとして
「ISO 8601 週番号で算出」との記述がある。ISO 8601 週番号は月曜始まりで定義されるため、
土曜始まりの運用と矛盾する。この矛盾を放置すると、実装時にどちらの仕様に従うべきか曖昧になる。

## Decision（採用した決定）

`WeekIdentifier` は **ISO 8601 週番号を採用せず、土曜始まりの独自の週定義**を実装する。

- 週は「直近の土曜日を週開始日とする 7 日間（土曜〜金曜）」
- 内部表現は週開始日の `Date`（例: `2026-07-04`）とし、ISO 8601 の `year + weekNumber` 形式は使用しない
  （`docs/designs/meal-plan-core.md` C-1、2026-07-05 ユーザー確認済み）
- `docs/04-domain-model.md` の「ISO 8601 週番号で算出」という記述は本実装では採用しない。
  同ドキュメントは本 ADR の決定を反映するよう別途更新する

## Alternatives（検討した非採用案と却下理由）

- **ISO 8601 週番号（月曜始まり）をそのまま採用**: `docs/04-domain-model.md` の既存記述と一致するが、
  実際の運用（土曜始まり）と矛盾する。ユーザーの実利用フローを優先し却下。
- **年 + 独自週番号（例: `2026-27`、土曜始まりで独自算出）**: ISO 週番号との混同を避けつつ番号方式を維持する案。
  年をまたぐ週の番号計算が複雑になり、`toString()` のパースや年またぎのエッジケース処理の実装コストが高い。
  `Date` ベースに比べて可読性・保守性で劣るため却下（`docs/designs/meal-plan-core.md` C-1 参照）。

## Consequences（良い影響・悪い影響・残るリスク）

**良い影響**:
- 週開始日が `Date` に直接反映され、ISO 週番号との混同が生じない
- DB カラムを `date` 型にでき、範囲検索・UNIQUE 制約が素直に効く
- 年またぎ週（例: 2026-12-26〜2027-01-01）も特殊なロジックなしに自然に表現できる

**悪い影響・残るリスク**:
- `docs/04-domain-model.md` の既存コードスニペットと実装が乖離する（本 ADR 決定に合わせて同ドキュメントの
  該当箇所を更新する必要がある。フォローアップ参照）
- 将来 ISO 週番号ベースの外部システムと連携する場合、変換ロジックが別途必要になる（MVP1 では想定なし）

## Migration（移行が必要な場合の手順）

対象外。MealPlan は Sprint 3 で新規実装するため、既存データの移行は発生しない。

## Rollback（決定を戻す場合の手順）

`meal_plans` テーブルをまだ本番投入していない段階であれば、`week_start_date`（date型）を
`week_start_year` + `week_start_number`（integer 2列）に置き換え、`WeekIdentifier` の
`fromDate` / `toString` / `fromString` を年+週番号方式で再実装する。既存データがある場合は
週開始日から ISO 週番号相当への変換バッチが必要になる（土曜始まり基準のため単純な ISO 変換では不整合が生じる点に注意）。

## References（設計書・要件・関連 ADR・外部資料へのリンク）

- `docs/requirements/meal-plan-core.md`（前提1、6-3節 境界条件 B-01〜B-05・B-11）
- `docs/designs/meal-plan-core.md`（3章 C-1、4-6節 WeekIdentifier設計、16章 ADR候補、17章 確定記録）
- `docs/04-domain-model.md`（WeekIdentifier 既存記述。本 ADR の決定に合わせて更新予定）
