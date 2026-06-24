# ベースライン採点: DB スキーマ変更（L2/L3）

## スナップショット情報

- branch: claude/wizardly-edison-89snea
- commit: 2258bd5
- date: 2026-06-24
- 位置づけ: 現状構成のベースライン採点。後続の改善提案の before 比較基準。

## 採点表（15軸）

| 軸 | スコア | 根拠 |
|---|---|---|
| 要件理解 | 4 | classify-change Skill に「DB スキーマ変更 → L3」が明記。requirements-analyst が既存データへの影響・移行・ロールバックまで抽出する手順を持つ |
| 影響範囲調査 | 4 | requirements-analyst → architecture-designer の L3 フローで既存行への影響・移行・ロールバック要否を洗い出す設計。ただし「ダウンタイム有無」を必ず言語化させる明示的な指示は設計書テンプレートの「移行とリリース」節に依存 |
| 既存設計理解 | 4 | architecture-designer が既存 Drizzle スキーマと domain-layer.md を参照し、「Domain 層に Drizzle 型を持ち込まない」原則を踏まえた設計を行う構造がある |
| 設計品質 | 4 | 状態遷移を Entity/VO に閉じ込め、DB 形 ⇔ ドメイン形 の変換を Repository が持つパターンが domain-layer.md と architecture-designer で明示。代替案・トレードオフ明記も手順に含まれる |
| 契約品質 | 3 | DB スキーマ変更は contract-designer の対象（Drizzle スキーマが契約の一部）。orchestrator の「契約変更があれば起動」で捕捉されるが、DB スキーマ変更が必ず contract-designer を起動させるかは orchestrator の判断依存 |
| 実装計画品質 | 4 | implementation-planner が「マイグレーション手順・ロールバック方法」を計画に含める Skill（create-implementation-plan）がある。ただしロールバック手順の具体化はケースに依存 |
| 実装整合性 | 4 | implementer は設計/計画のゲートあり。規約（Domain に Drizzle 型を持ち込まない）は rules に明示 |
| テスト網羅性 | 3 | test-designer が状態遷移・境界（遷移不可パターン）・移行後整合性を設計書から抽出する手順あり。テストランナー未導入で観点留まり |
| レビュー品質 | 4 | reviewer が要件・設計・実装計画・実装の整合性を確認。L3 では docs/reviews/ に記録する指示あり |
| ドキュメント品質 | 5 | L3 の全成果物（requirements/designs/implementation-plans/tests/decisions(ADR)/reviews）が document-policy.md に明記。ADR で後方互換・移行判断が追跡可能になる設計 |
| 安全性 | 4 | DB スキーマ変更自体は秘密情報を扱わない。guard-dangerous.mjs でインフラ破壊的操作をガード。ただし移行スクリプトの誤実行リスクは構成では担保されない |
| ユーザー確認の適切さ | 5 | orchestrator と architecture-designer で「DB スキーマ設計はユーザー確認取得前に確定しない」が明確に義務化されている。CLAUDE.md の行動制約にも明記 |
| 不要な作業量 | 4 | L3 で必要な6成果物を作成。スコープ外変更の禁止は各 Subagent に明記。ただし requirements-analyst 起動が必須となり orchestrator → requirements → architecture のシリアルフローで工程数が増える |
| Agent 呼び出し効率 | 3 | L3 は requirements-analyst → architecture-designer → (planner ∥ test-designer) → implementer → reviewer(+ADR) → reflection-agent の6〜7エージェント。L3 として適切だが、DB スキーマ変更の複雑さに比例したコストとして許容範囲 |
| トークン効率 | 3 | L3 の工程数は正当化されるが、planner と test-designer の並列実行以外に効率化の仕組みがない。全成果物を作る義務があり reflection-agent も必須で、総トークンはL2より大きく増える |

## 劣化指標の現状観測（ベースライン値）

| 指標 | 現状観測 |
|---|---|
| 要件の見落とし | 低リスク。requirements-analyst が移行・ロールバック・既存データ影響を抽出する |
| 設計漏れ | 中リスク。DB スキーマ設計で contract-designer の起動が orchestrator 判断依存 |
| 不要な質問回数 | 低リスク。DB スキーマ・移行方針の確認は必須として明文化。些末な確認の乱発を抑止する設計 |
| 実装計画と実装の不一致 | 低リスク。implementer のゲートが機能 |
| テスト漏れ | 中リスク。テストランナー未導入。状態遷移の境界テストが観点止まり |
| レビュー指摘数（重大） | 低リスク。L3 では reviewer が docs/reviews/ に記録し追跡可能 |
| ドキュメント不足 | 低リスク。L3 成果物一覧が明確で Hook チェックも機能 |
| Agent 呼び出し回数・トークン消費 | 高め。L3 必須の工程数（6〜7エージェント）。必要なコストとして許容 |

## 総評

### 強み
- ユーザー確認の義務化（スコア5）：DB スキーマ確定前の確認が CLAUDE.md・orchestrator・architecture-designer の3箇所で明示されており、確認なしの確定という失敗パターンへの対策が最も強い軸。
- ドキュメント品質（スコア5）：L3 の全成果物とADRが document-policy.md で明確に定義されており、後方互換・移行判断の追跡可能性が高い。

### 弱み
- Agent 呼び出し効率・トークン効率（各3）：L3 として正当化されるが、DB スキーマ変更のたびに6〜7エージェントが直列・並列で起動する。境界が複雑でない単純なカラム追加でも同じフローになる可能性がある。
- テスト網羅性（3）：状態遷移の境界テストがテストランナー未導入で観点止まりになる構造的制約。

### 特に注目すべき軸
ユーザー確認の適切さ（5）がこのケースで最も重要で、現構成の最大の強みとなっている。
