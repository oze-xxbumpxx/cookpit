# ベースライン採点: API フィールド追加（L2）

## スナップショット情報

- branch: claude/wizardly-edison-89snea
- commit: 2258bd5
- date: 2026-06-24
- 位置づけ: 現状構成のベースライン採点。後続の改善提案の before 比較基準。

## 採点表（15軸）

| 軸 | スコア | 根拠 |
|---|---|---|
| 要件理解 | 4 | orchestrator の L2 判定基準に「既存 API への項目追加」が明記されており、後方互換（任意項目）の扱いも classify-change Skill に記載されている |
| 影響範囲調査 | 3 | requirements-analyst が「任意・影響が読めない時」に起動可能だが L2 では必須でない。architecture-designer が5層（api-contract → domain → application → infrastructure → presentation）への波及を把握する設計だが、起動指示の中で「具体パス」まで必ず列挙させる強制は弱い |
| 既存設計理解 | 4 | architecture-designer が `docs/03-architecture.md` / `docs/04-domain-model.md` / `domain-layer.md` を参照する手順を持つ。`null` 統一・VO バリデーションの既存規約を踏まえる設計 |
| 設計品質 | 4 | architecture-designer が「依存方向・集約境界・代替案・トレードオフ」を設計書に含める手順。VO で正の整数バリデーションを閉じ込めるパターンも domain-layer.md で明示 |
| 契約品質 | 3 | api-field-addition は契約変更（Zod スキーマ更新）を伴うが、orchestrator 定義の「契約変更があれば contract-designer を起動」の判断が orchestrator に委ねられており、L2 フィールド追加で contract-designer を起動するかどうかが構成上明確でない。任意項目の nullability・互換については contract-designer が担当するが起動条件が曖昧 |
| 実装計画品質 | 4 | implementation-planner が設計書を入力に「対象ファイル・変更内容・完了条件」が揃ったステップを作成する手順。Skill テンプレートも存在する |
| 実装整合性 | 4 | implementer は設計・計画があれば着手、なければ差し戻しの明確なゲートがある。規約違反（any/===等）は rules で明示 |
| テスト網羅性 | 3 | test-designer が正常系・異常系・境界値（0・負値・未指定・上限）を設計する手順あり。ただしテストランナー未導入のため観点留まり。L2 では test-designer は implementation-planner と並行起動可能で境界観点が設計書に残る |
| レビュー品質 | 4 | reviewer が「要件・設計・実装計画・実装・試験の整合性、責務分離、エラー処理」を確認。domain-layer.md / coding-standards.md への照合が指定されている |
| ドキュメント品質 | 4 | L2 の3成果物（designs/implementation-plans/tests）が check-deliverables.mjs で警告チェックされ、必須セクションの空検知も機能する |
| 安全性 | 5 | guard-dangerous.mjs + settings.json の二層ガード。API フィールド追加スコープで秘密情報を扱う必然性はない |
| ユーザー確認の適切さ | 4 | 任意項目で後方互換を壊さない場合は確認不要。DB スキーマ変更を伴う場合は確認が必要で、orchestrator 定義にその条件が明記されている |
| 不要な作業量 | 4 | L2 で必要な3成果物のみ。current-feature 設定と Hook の成果物チェックで過不足を検知。ADR は L2 では不要とされており、過剰工程の抑制設計がある |
| Agent 呼び出し効率 | 4 | L2 標準フロー（architecture-designer → planner ∥ test-designer → implementer → reviewer → reflection-agent）。requirements-analyst は任意で最小化されている |
| トークン効率 | 4 | 並列実行（planner ∥ test-designer）で効率化。ただし reflection-agent が L2 完了時に必須起動するため、常に1エージェント分のオーバーヘッドが発生する |

## 劣化指標の現状観測（ベースライン値）

| 指標 | 現状観測 |
|---|---|
| 要件の見落とし | 低リスク。5層波及は architecture-designer が設計書に含める |
| 設計漏れ | 中リスク。contract-designer 起動条件が曖昧なため、Zod 契約の後方互換設計が省略されるケースがありうる |
| 不要な質問回数 | 低リスク。後方互換を壊さない任意項目なら確認不要の設計 |
| 実装計画と実装の不一致 | 低リスク。implementer は設計/計画なしでは着手しない |
| テスト漏れ | 中リスク。テストランナー未導入で観点止まり。境界値（0・負値・大値）は test-designer の担当 |
| レビュー指摘数（重大） | 低リスク。reviewer が設計・計画・実装の整合性を突き合わせる |
| ドキュメント不足 | 低リスク。Hook の警告チェックで欠落を検知 |
| Agent 呼び出し回数・トークン消費 | 中程度。L2 で6エージェント（arch/planner/test-designer/implementer/reviewer/reflection） |

## 総評

### 強み
- 5層の変更波及を architecture-designer が設計書で扱う構造が確立されている。
- check-deliverables.mjs による自動チェックで成果物の欠落を早期検知できる。
- 並列実行（planner ∥ test-designer）によるトークン効率の工夫がある。

### 弱み
- contract-designer の起動条件が「契約変更があれば」と orchestrator の判断に依存しており、API フィールド追加（Zod スキーマ変更）で必ず起動するかが不明確。失敗パターンの「Zod だけ直してドメイン/Repository を更新し忘れる」への構造的対策として contract-designer の役割が重要だが、起動条件の明確化が不足。
- テスト網羅性はテストランナー未導入の制約により観点留まり（構造的制約）。

### 特に注目すべき軸
契約品質（3）：L2 の API フィールド追加で contract-designer が起動されるかどうかが orchestrator の裁量に依存している点が最大の弱点。
