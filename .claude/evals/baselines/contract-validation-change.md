# ベースライン採点: 契約・バリデーション変更（L2/L3）

## スナップショット情報

- branch: claude/wizardly-edison-89snea
- commit: 2258bd5
- date: 2026-06-24
- 位置づけ: 現状構成のベースライン採点。後続の改善提案の before 比較基準。

## 採点表（15軸）

| 軸 | スコア | 根拠 |
|---|---|---|
| 要件理解 | 4 | classify-change Skill で「バリデーション変更 → L2、後方互換影響あり → L3 上位扱い」の判定が可能。必須フィールド追加の後方互換破壊を L3 として扱う判断基準が明文化されている |
| 影響範囲調査 | 4 | L3 フローで requirements-analyst が既存 Zod・Hono・ドメインの形を調査。contract-designer が既存契約を読んでから差分を示す手順（「未調査の既存契約を無視した設計」を禁止事項に明記） |
| 既存設計理解 | 4 | contract-designer が既存 `packages/api-contract`・Drizzle スキーマを読む手順を持つ。architecture-designer も `docs/03-architecture.md` / `docs/04-domain-model.md` から既存構成を把握 |
| 設計品質 | 4 | 「バリデーションはドメイン（Entity/VO）と Zod 契約の単一情報源で持ち、二重定義・乖離を避ける」が contract-designer 定義に明記。依存方向の遵守も architecture-designer で担保 |
| 契約品質 | 5 | contract-designer が型・必須/任意・nullability・バージョン・後方互換・エラー形式・冪等性キー・サンプル・契約テスト方針を担当する専門 Agent として設計されている。L2/L3 の契約変更で起動される設計 |
| 実装計画品質 | 4 | implementation-planner が「契約更新 → ドメイン → Repository → Hono」の順序と各ステップの完了条件を計画に含める Skill あり |
| 実装整合性 | 4 | implementer のゲートが機能。「Zod だけ変えてドメイン/Repository を更新し忘れる」失敗パターンは実装計画の各ステップで対処可能 |
| テスト網羅性 | 3 | test-designer が「境界（最大長±1・enum 外・未指定）と後方互換の回帰」を設計書から抽出する手順あり。契約テスト方針は contract-designer から test-designer へ引き継ぐ設計。テストランナー未導入で観点止まり |
| レビュー品質 | 4 | reviewer が要件・設計・実装・試験の整合性を確認。「バリデーションを Hono ルートに直書きしていないか」を domain-layer.md / coding-standards.md に照らして検出可能 |
| ドキュメント品質 | 4 | L3 なら全成果物 + ADR。L2 なら3成果物。check-deliverables.mjs でチェック。contract-designer の設計書 Contract 節が必須セクションとして機能 |
| 安全性 | 5 | guard-dangerous.mjs + settings.json ガード。バリデーション変更スコープで安全性問題の必然性はない |
| ユーザー確認の適切さ | 5 | contract-designer 定義に「後方互換性破壊をユーザー確認なしに確定しない」と明文化。orchestrator にも「後方互換性・データ移行が絡む場合は確認」が明記。必須フィールド追加の後方互換破壊は必ず確認する設計 |
| 不要な作業量 | 4 | 契約変更があるため contract-designer の起動は正当。スコープ外変更の禁止は各 Subagent で明示 |
| Agent 呼び出し効率 | 3 | L3 の7エージェント（requirements-analyst → arch → contract-designer → planner ∥ test-designer → implementer → reviewer + ADR → reflection）。契約変更ケースとして正当だが全体のエージェント数が多い |
| トークン効率 | 3 | L3 フルフロー + contract-designer の追加で最多エージェント数。並列実行（planner ∥ test-designer）で部分最適化。reflection-agent 必須でさらにコスト増 |

## 劣化指標の現状観測（ベースライン値）

| 指標 | 現状観測 |
|---|---|
| 要件の見落とし | 低リスク。requirements-analyst が後方互換影響を抽出 |
| 設計漏れ | 低リスク。contract-designer が型・nullability・互換を専門的に担当 |
| 不要な質問回数 | 低リスク。後方互換破壊の確認は必須として適切に定義されている |
| 実装計画と実装の不一致 | 低リスク。implementer ゲートと contract-designer の差分定義が整合を担保 |
| テスト漏れ | 中リスク。テストランナー未導入。境界値・後方互換回帰が観点止まり |
| レビュー指摘数（重大） | 低リスク。reviewer が domain-layer.md 違反（バリデーションを Hono に書く）を検出可能 |
| ドキュメント不足 | 低リスク。L3 全成果物 + ADR + contract-designer の Contract 節 |
| Agent 呼び出し回数・トークン消費 | 高め。最多エージェント数のフロー |

## 総評

### 強み
- 契約品質（5）：contract-designer が専門 Agent として存在し、型・nullability・後方互換・エラー形式・サンプルを一元的に担当する設計は現構成の最大の強み。
- ユーザー確認の適切さ（5）：後方互換破壊の確認が contract-designer・orchestrator の両方で義務化されており、確認漏れによる失敗パターンへの対策が充実。

### 弱み
- Agent 呼び出し効率・トークン効率（各3）：このケースで最多エージェント数になる。契約変更として正当化されるが、後方互換を壊さない単純なフィールド追加でも同等のフローが走ることになる可能性。
- テスト網羅性（3）：テストランナー未導入による制約が依然として残る。

### 特に注目すべき軸
契約品質（5）：contract-designer の存在がこのケースを最も手厚くカバーしており、現構成が最も強みを発揮するケース。
