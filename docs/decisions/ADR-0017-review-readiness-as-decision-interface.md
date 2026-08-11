# ADR-0017: レビュー記録を監査ログと意思決定インターフェースの二層にする

- Status: Accepted
- Date: 2026-08-11
- 関連 feature: review-readiness

## Context（背景・なぜ判断が必要か）

Cookpit のレビュー記録は詳細な追記型で、検証証跡として強い。一方、feature が大きいほど
初期指摘、修正、再レビュー、実画面結果が離れ、人間が現在の結論を再構築する負荷が増える。
AI の肯定結果を先に見せると、自動化バイアスにより未確認事項を読み飛ばす危険もある。

監査能力を捨てず、人間が安全に短時間で判断できる表示を追加する方法を決める必要がある。

## Decision（採用した決定）

1. `docs/reviews/<feature>.md` を唯一の正典として維持する。
2. 同じ文書を、機械生成 current-state packet と追記型 audit log の二層にする。
3. packet は人間項目、残余リスク、振る舞い差分、証拠、AI 評価の順で表示する。
4. AI は `PASS` / `APPROVED` を出さず、`human_review_requested` までしか進めない。
5. base SHA と Git raw diff の digest でレビュー対象の鮮度を検証する。
6. 人間項目は主観・不可逆・未知だけ、最大 3 件とする。超過時は引き渡さない。
7. legacy 文書を一括移行せず、CI warning-only から段階導入する。

## Alternatives（検討した非採用案と却下理由）

| 案                                 | 却下理由                                   |
| ---------------------------------- | ------------------------------------------ |
| 詳細 review を短く書き換える       | 原因追跡、再発防止、差し戻し履歴を失う     |
| PR 本文に手書き summary を追加     | `docs/reviews` と二重管理になり drift する |
| ファイル名一覧だけを digest にする | 同じファイル内の内容変更を検出できない     |
| AI の PASS を表示する              | 人間承認と誤認させ、自動化バイアスを強める |
| 固定 8 項目を人間が再確認する      | 自動確認と重複し、認知負荷を削減できない   |
| 人間項目の先頭 3 件だけ表示する    | 4 件目以降を隠し、安全性を落とす           |
| 新しい DB / SaaS / bot を導入する  | 個人開発・継続費用なしの制約に対して過剰   |

## Consequences（良い影響・悪い影響・残るリスク）

**良い影響**

- 人間は 1 画面から判断を開始し、必要時だけ詳細ログへ降りられる。
- レビュー後の対象変更を stale として検出できる。
- 自動検証済みチェックの再実行を人間へ要求しない。
- 既存の監査証跡と Task coverage を維持できる。

**悪い影響**

- Reviewer は structured assessment を返す必要がある。
- current-state marker と schema の保守が増える。
- base 更新でも stale になるため、初期は再レビュー通知が過敏になりうる。

**残るリスク**

- digest は Claude が本当にレビューしたことやレビュー品質を証明しない。
- リポジトリを書ける主体は state JSON も変更できる。
- 人間項目 3 件という budget が不適切な場合、PR 分割が増える可能性がある。

## Migration（移行が必要な場合の手順）

既存 review は legacy のまま残す。新規または次に更新する feature から marker を追加する。
CI は warning-only で開始し、2 週間または 3 feature の運用で誤警告 0 を確認する。

## Rollback（決定を戻す場合の手順）

新規 script/test、CI step、正典文書、Reviewer/Skill の追加契約を `git revert` する。生成 marker は
HTML comment と Markdown だけなので、残っても既存監査ログの読み取りを妨げない。必要なら
marker 範囲だけを通常の編集で削除する。

## References（設計書・要件・関連 ADR・外部資料へのリンク）

- `docs/requirements/review-readiness.md`
- `docs/designs/review-readiness.md`
- `docs/designs/harness-personal-light-mode.md`
- `docs/reviews/stock-edit.md`
- `docs/claude-code/definition-of-done.md`
