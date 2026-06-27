# 回帰評価: frontend-screen-addition（L2）

## 評価情報

- 評価日: 2026-06-27
- 対象提案: 新3エージェント追加（security-reviewer / performance-designer / e2e-test-implementer）コミット c96d6a9
- ベースライン（before）コミット: 2258bd5（2026-06-24）
- 採点方法: 実コード実行なし。Agent 定義・orchestration-policy のプロンプトレビューによる定性評価

## ケース概要

レシピ詳細画面（apps/web）追加の L2 変更。
Server Component 初期表示 + Hono RPC の使い分けが評価の核心。
apps/web/ への変更が含まれるため security-reviewer の観点5（セキュリティヘッダー/Cookie）が追加される。

新3エージェントで本ケースへの影響:
- security-reviewer: L2/L3 全タスクで必須起動 → 本ケースに適用。apps/web/ 変更あり → 観点5も適用
- performance-designer: L2 なので起動しない（起動条件は L3 のみ）
- e2e-test-implementer: L3 のみ → 本ケースには起動しない

## before / after スコア比較（15軸）

| 軸 | before | after | 差分 | 根拠（after） |
|---|---|---|---|---|
| 要件理解 | 4 | 4 | = | 変更なし |
| 影響範囲調査 | 3 | 3 | = | L2 の requirements-analyst 任意起動の問題は解消されない |
| 既存設計理解 | 4 | 4 | = | 変更なし |
| 設計品質 | 4 | 4 | = | 変更なし。performance-designer は L2 不起動 |
| 契約品質 | 3 | 3 | = | 新規 API なしケースで既存契約利用漏れへの防止機構が弱い点は変わらない |
| 実装計画品質 | 4 | 4 | = | 変更なし |
| 実装整合性 | 4 | 4 | = | 変更なし |
| テスト網羅性 | 3 | 3 | = | e2e-test-implementer は L3 のみ起動。L2 では不起動のため改善なし |
| レビュー品質 | 4 | 5 | +1 | security-reviewer が apps/web/ 変更に対して Cookie（httpOnly/SameSite/Secure）と CSP ヘッダーの設定を確認する（観点5）。before の reviewer は「責務分離・エラー処理・テスト不足」が中心で、セキュリティヘッダーの専門確認がなかった。after は security-reviewer がこれを専門的に補完。かつ「一般品質レビューは重複して行わない」と役割分担が明文化されており、重複による非効率もない |
| ドキュメント品質 | 4 | 4 | = | 変更なし |
| 安全性 | 5 | 5 | = | ガード機構変更なし。既に最高値 |
| ユーザー確認の適切さ | 4 | 4 | = | 変更なし |
| 不要な作業量 | 4 | 4 | = | security-reviewer は L2 全タスクで必須（ドキュメントのみ変更を除く）。本ケースはコード変更あり → 適切な起動。performance-designer・e2e-test-implementer は不起動 → 過剰工程なし |
| Agent 呼び出し効率 | 4 | 4 | = | L2 フロー: arch → planner ∥ test-designer → implementer → reviewer → security-reviewer → reflection。security-reviewer の追加で1 Agent 増だが、L2 必須フローとして組み込まれており「不要起動」ではない。rubric「レベルに対し必要最小」基準でスコア維持 |
| トークン効率 | 4 | 4 | = | security-reviewer の追加分トークン増。ただし reviewer との役割分担が明確で重複ゼロ。「冗長な呼び出し」には当たらない。スコアは横ばいと判断 |

## 劣化指標の確認

| 指標 | before | after | 変化 |
|---|---|---|---|
| 要件の見落とし | 低リスク | 低リスク | 横ばい |
| 設計漏れ | 中リスク（手動 DI 構造の具体化依存） | 中リスク（同一） | 横ばい |
| 不要な質問回数 | 低〜中リスク | 低〜中リスク | 横ばい |
| 実装計画と実装の不一致 | 低リスク | 低リスク | 横ばい |
| テスト漏れ | 中リスク | 中リスク（L2 で e2e 不起動は変わらず） | 横ばい |
| レビュー指摘数（重大） | 低リスク | 低リスク（さらに低下傾向） | 改善傾向 |
| ドキュメント不足 | 低リスク | 低リスク | 横ばい |
| Agent 呼び出し回数・トークン消費 | 中程度（L2 標準） | やや増加（+1 Agent） | 増加 |

## 特記事項

L2 ケースで security-reviewer が必須化されたことで 1 Agent 増加するが、本ケースは Web
画面変更を含むためセキュリティヘッダー確認（観点5）は適切な価値を持つ。

performance-designer と e2e-test-implementer が正しく L2 では起動しないことを確認した。
起動条件の記述は orchestration-policy.md と各 Agent 定義の両方に一貫して記載されており、
過剰起動リスクは低い。

## ケース単位の総合判定

**改善（+1）**: レビュー品質 4→5  
**悪化なし**: 全残軸で横ばい  
**Agent 呼び出し増**: L2 必須フローとして正当化された増加
