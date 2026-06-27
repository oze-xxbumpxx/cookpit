# 回帰評価: small-bug-fix（L1）

## 評価情報

- 評価日: 2026-06-27
- 対象提案: 新3エージェント追加（security-reviewer / performance-designer / e2e-test-implementer）コミット c96d6a9
- ベースライン（before）コミット: 2258bd5（2026-06-24）
- 採点方法: 実コード実行なし。Agent 定義・orchestration-policy のプロンプトレビューによる定性評価

## ケース概要

packages/domain のバリデーションバグ修正（L1）。
新3エージェントが起動しないことを確認するケース。

新3エージェントで本ケースへの影響:
- security-reviewer: orchestration-policy.md §security-reviewer「L1 では起動しない」と明記
- performance-designer: orchestration-policy.md §performance-designer「L3 のみ起動」と明記
- e2e-test-implementer: orchestration-policy.md §e2e-test-implementer「L3 のみ起動」と明記

## 起動条件の確認

3エージェントとも L1 では起動しない条件が以下の複数箇所に記載されている:

1. orchestrator.md 委譲フロー早見: 「L1：implementer へ直接修正」のみ（新3エージェント記載なし）
2. orchestration-policy.md §security-reviewer: 「L1 では起動しない」
3. orchestration-policy.md §performance-designer: 「L1/L2 の軽微変更・純粋ロジック修正では起動しない」
4. orchestration-policy.md §e2e-test-implementer: 「L3 のみ起動」
5. 各 Agent 定義内にも起動条件が明記

**L1 での不起動は構成的に担保されている。**

## before / after スコア比較（15軸）

| 軸 | before | after | 差分 | 根拠（after） |
|---|---|---|---|---|
| 要件理解 | 4 | 4 | = | 変更なし |
| 影響範囲調査 | 4 | 4 | = | 変更なし |
| 既存設計理解 | 4 | 4 | = | 変更なし |
| 設計品質 | N/A | N/A | = | L1 で設計書不要（評価対象外） |
| 契約品質 | N/A | N/A | = | L1 で契約変更なし（評価対象外） |
| 実装計画品質 | N/A | N/A | = | L1 で計画不要（評価対象外） |
| 実装整合性 | 4 | 4 | = | 変更なし |
| テスト網羅性 | 2 | 2 | = | テストランナー未導入の構造的制約は変わらない |
| レビュー品質 | 3 | 3 | = | L1 で reviewer は任意起動のまま。security-reviewer も L1 不起動。変更なし |
| ドキュメント品質 | 4 | 4 | = | 変更なし |
| 安全性 | 5 | 5 | = | ガード機構変更なし |
| ユーザー確認の適切さ | 4 | 4 | = | 変更なし |
| 不要な作業量 | 5 | 5 | = | 新3エージェントが L1 で正しく不起動。過剰工程は発生しない |
| Agent 呼び出し効率 | 5 | 5 | = | L1 は implementer（+ 必要なら reviewer）のみ。新エージェントは起動しない |
| トークン効率 | 4 | 4 | = | L1 最小フロー。Orchestrator の起動時読み込みファイル数は変わらない（orchestration-policy.md が更新されたが読み込むのは同一ファイル） |

## 劣化指標の確認

| 指標 | before | after | 変化 |
|---|---|---|---|
| 要件の見落とし | 低リスク | 低リスク | 横ばい |
| 設計漏れ | N/A | N/A | — |
| 不要な質問回数 | 低リスク | 低リスク | 横ばい |
| 実装計画と実装の不一致 | N/A | N/A | — |
| テスト漏れ | 高リスク | 高リスク | 横ばい（構造的制約） |
| レビュー指摘数（重大） | 中リスク | 中リスク | 横ばい |
| ドキュメント不足 | 低リスク | 低リスク | 横ばい |
| Agent 呼び出し回数・トークン消費 | 良好（最小） | 良好（最小） | 横ばい |

## 特記事項

L1 での新3エージェント不起動は、orchestration-policy.md と各 Agent 定義の両方に
起動条件が明記されており、構成的に担保されている。単一ソースではなく複数箇所で一致して
定義されていることでモデルの判断ブレを抑制できる設計になっている。

Orchestrator が読み込む orchestration-policy.md のサイズが増加しているが（新セクション追加）、
読み込み自体は 1 ファイルのため固定コストの増加は軽微。

## ケース単位の総合判定

**悪化なし**: 全軸で横ばい  
**確認事項**: 新3エージェントが L1 で正しく不起動であることを構成から確認済み
