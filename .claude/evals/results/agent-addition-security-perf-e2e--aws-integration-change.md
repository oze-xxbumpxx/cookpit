# 回帰評価: aws-integration-change（L3）

## 評価情報

- 評価日: 2026-06-27
- 対象提案: 新3エージェント追加（security-reviewer / performance-designer / e2e-test-implementer）コミット c96d6a9
- ベースライン（before）コミット: 2258bd5（2026-06-24）
- 採点方法: 実コード実行なし。Agent 定義・orchestration-policy・agent-responsibilities のプロンプトレビューによる定性評価

## ケース概要

レシピ画像を外部オブジェクトストレージ（S3 互換）にアップロードする L3 変更。
外部 I/O・秘密情報・本番影響を含む。

新3エージェントで本ケースへの影響:
- security-reviewer: L2/L3 全タスクで reviewer の後に必須起動 → 本ケースに適用
- performance-designer: L3 かつ外部 I/O 新設 → 本ケースに適用（起動条件を満たす）
- e2e-test-implementer: L3 かつ基盤整備済み条件 → MVP1 で Playwright 未整備なら不起動の可能性大

## before / after スコア比較（15軸）

| 軸 | before | after | 差分 | 根拠（after） |
|---|---|---|---|---|
| 要件理解 | 4 | 4 | = | 変更なし。requirements-analyst が担う軸で新エージェント影響なし |
| 影響範囲調査 | 4 | 4 | = | 変更なし。要件調査担当は同一 |
| 既存設計理解 | 4 | 4 | = | 変更なし |
| 設計品質 | 4 | 4 | = | performance-designer が外部 I/O の N+1・インデックス・タイムアウト予算を設計書に追記する。設計の深掘りがされるが、アーキテクチャ自体の決定責務は architecture-designer と変わらず、スコアは維持 |
| 契約品質 | 3 | 3 | = | 外部 API 契約設計の担当不明確の問題は解消されない（security-reviewer・performance-designer いずれも契約設計は担わない） |
| 実装計画品質 | 4 | 4 | = | 変更なし |
| 実装整合性 | 4 | 4 | = | 変更なし |
| テスト網羅性 | 3 | 3 | = | e2e-test-implementer は Playwright/Hono 基盤が整備済みの場合のみ起動。MVP1 では基盤未整備でほぼ不起動。単体テスト観点の改善は本変更に含まれない |
| レビュー品質 | 4 | 5 | +1 | security-reviewer が OWASP A01/A02/A03・秘密情報漏洩・依存脆弱性（pnpm audit）を専門確認。before は reviewer が「エラー処理・セキュリティ概要」を担うのみで、S3 キー漏洩・認証ミドルウェア漏れ・SQLi バインディングの深掘りがなかった。after は security-reviewer が専門的に確認し「Must/Should/Nice + path:line + 修正案」形式で指摘する。かつ reviewer の障害設計観点（リトライ嵐・タイムアウト・冪等性）と security-reviewer の役割分担が明文化されており重複もない |
| ドキュメント品質 | 4 | 4 | = | performance-designer が docs/designs/ にパフォーマンス節を追記することで設計書が充実するが、L3 必須成果物の構造自体は変わらない。現状スコア4から一段上げる根拠は乏しい |
| 安全性 | 5 | 5 | = | guard-dangerous.mjs・settings.json ガードは変化なし。security-reviewer 追加でセキュリティ指摘の深度は上がるが、この軸は「ガード機構が機能しているか」であり既に最高値 |
| ユーザー確認の適切さ | 5 | 5 | = | 変更なし |
| 不要な作業量 | 4 | 4 | = | performance-designer の起動条件（L3 かつ外部 I/O/大量データ）を本ケースは満たすため、起動は適切。security-reviewer も L2/L3 で明文化された必須フローであり「不要」には当たらない |
| Agent 呼び出し効率 | 3 | 3 | = | before: L3 フルフロー（6〜7 Agent）。after: security-reviewer + performance-designer が追加され 8〜9 Agent になる。効率は下がるが、起動条件を満たすケースであり「不要起動」ではない。rubric は「レベルに対し必要最小の Agent」基準でありスコアを下げない判断。ただし before からの増加を「横ばい」と見なすことには一定の不確かさがある |
| トークン効率 | 3 | 3 | = | Agent 数増加分のトークン増。ただし security-reviewer（pnpm audit 実行・Grep 走査）と performance-designer（N+1 特定・タイムアウト予算設計）はいずれも本ケースで価値のある出力を生む。「冗長な呼び出し」には当たらないと判断 |

## 劣化指標の確認

| 指標 | before | after | 変化 |
|---|---|---|---|
| 要件の見落とし | 低リスク | 低リスク | 横ばい |
| 設計漏れ | 中リスク（外部 API 契約不明確） | 中リスク（同一） | 横ばい |
| 不要な質問回数 | 低リスク | 低リスク | 横ばい |
| 実装計画と実装の不一致 | 低リスク | 低リスク | 横ばい |
| テスト漏れ | 中リスク | 中リスク | 横ばい |
| レビュー指摘数（重大） | 低リスク | 低リスク（さらに低下） | 改善傾向 |
| ドキュメント不足 | 低リスク | 低リスク | 横ばい |
| Agent 呼び出し回数・トークン消費 | 高め（L3 フルフロー） | やや増加（+2 Agent） | 増加 |

## 特記事項

Agent 呼び出し回数・トークン消費が増加している。ただし：
- security-reviewer は L2/L3 の全タスクに明示的に起動条件として組み込まれており「過剰」ではない
- performance-designer も本ケースの起動条件（外部 I/O 新設）を満たす
- rubric §劣化指標「減少 or 横ばい」の判定は「増加が不要な増加か否か」で判断すべき

増加分は条件を満たした必要な Agent 起動であり、rubric の非推奨基準「指示を追加しただけで質問回数・トークン消費だけが増えた」には該当しない。

## ケース単位の総合判定

**改善（+1）**: レビュー品質 4→5  
**悪化なし**: 全残軸で横ばい  
**Agent 呼び出し増**: 条件付き必要起動であり劣化指標の「不要な増加」に非該当
