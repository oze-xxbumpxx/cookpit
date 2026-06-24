# ベースライン採点: フロントエンド画面追加（L2）

## スナップショット情報

- branch: claude/wizardly-edison-89snea
- commit: 2258bd5
- date: 2026-06-24
- 位置づけ: 現状構成のベースライン採点。後続の改善提案の before 比較基準。

## 採点表（15軸）

| 軸 | スコア | 根拠 |
|---|---|---|
| 要件理解 | 4 | L2 判定（新規画面1つ・既存 API 利用・後方互換なし）が classify-change Skill で捕捉可能。初期表示 SC / 以降 Hono RPC の使い分け要件も presentation-layer.md で明文化されている |
| 影響範囲調査 | 3 | L2 では requirements-analyst は任意。architecture-designer が apps/web/src 配下の既存構成を調査するが、既存 Hono ルート・UseCase の手動 DI 構造を「具体パスで」確認させる指示が弱い |
| 既存設計理解 | 4 | architecture-designer が presentation-layer.md（Server Component / Hono RPC 使い分け）を参照する手順を持つ。手動 DI の構造も docs/03-architecture.md で確認可能 |
| 設計品質 | 4 | presentation-layer.md の使い分け表（読み取り初期表示=SC直呼び、それ以降=Hono RPC）が正典として整備されている。architecture-designer の手順にも参照指示がある |
| 契約品質 | 3 | 新規画面では既存 Zod 契約の import type 利用が中心。新規 API を追加する場合のみ contract-designer が起動する設計だが、既存契約の利用漏れ（手書き型での API 呼び出し）を防ぐ強制機構が弱い |
| 実装計画品質 | 4 | implementation-planner が「対象ファイル・変更内容・完了条件」を揃えた計画を作る Skill あり。Server / Client Component の分離を計画に含めさせる明示的な指示はないが設計書から読み取り可能 |
| 実装整合性 | 4 | implementer が presentation-layer.md 準拠を coding-standards.md 経由で参照。ドメインロジックを画面に書かない原則は CLAUDE.md に明記 |
| テスト網羅性 | 3 | test-designer がローディング/エラー/空状態/異常レスポンス観点を設計書から抽出する。テストランナー未導入で観点止まり。フロントエンド固有の観点（CSR/SSR の動作差異）は Skill に明示されていない |
| レビュー品質 | 4 | reviewer が「責務分離（層・集約境界）・エラー処理・テスト不足」を確認。SC/Client Component の分離の適切さを rules に照らすことができる |
| ドキュメント品質 | 4 | L2 の3成果物が check-deliverables.mjs でチェックされる。既存 rules（presentation-layer.md）の参照で重複ドキュメント作成を避ける |
| 安全性 | 5 | guard-dangerous.mjs + settings.json ガード。画面追加スコープで秘密情報を扱う必然性はない |
| ユーザー確認の適切さ | 4 | 新規画面（新規ファイル作成）は確認が必要と orchestrator に明文化。ただし「新規コンポーネントファイル追加」が毎回確認となると若干過剰になる可能性がある |
| 不要な作業量 | 4 | L2 標準フロー。スコープ外変更は各 Subagent で禁止。既存 rules を参照して重複ドキュメント作成を防ぐ設計 |
| Agent 呼び出し効率 | 4 | L2 標準（arch → planner ∥ test-designer → implementer → reviewer → reflection）。新規画面で契約変更なしなら contract-designer を起動しない正しい分岐 |
| トークン効率 | 4 | 並列実行活用。reflection-agent の必須起動が定常的な追加コスト |

## 劣化指標の現状観測（ベースライン値）

| 指標 | 現状観測 |
|---|---|
| 要件の見落とし | 低リスク。SC/Hono RPC 使い分けが rules で明文化 |
| 設計漏れ | 中リスク。手動 DI の構造・既存 UseCase との接続が設計書で具体化されるかは architecture-designer の質依存 |
| 不要な質問回数 | 低〜中リスク。新規ファイル作成の確認が必要で、コンポーネント単位で確認が増える可能性 |
| 実装計画と実装の不一致 | 低リスク。implementer ゲート機能 |
| テスト漏れ | 中リスク。テストランナー未導入 + フロントエンド固有観点が Skill に薄い |
| レビュー指摘数（重大） | 低リスク。reviewer が presentation-layer.md 違反を検出可能 |
| ドキュメント不足 | 低リスク。Hook チェック機能 |
| Agent 呼び出し回数・トークン消費 | 中程度。L2 標準 |

## 総評

### 強み
- presentation-layer.md の整備：Server Component / Hono RPC の使い分けが正典として明確に定義されており、失敗パターン（全部 Client Component）への設計的対策がある。
- 安全性（5）：スコープ内で秘密情報を扱う必然性がなく、ガードも二層で機能。

### 弱み
- テスト網羅性（3）：フロントエンド固有観点（ローディング・エラー・空状態の UI 挙動）が test-designer の Skill に明示されておらず、設計書から読み取る形になる。テストランナー未導入の制約も重なる。
- 影響範囲調査（3）：既存 Hono ルートや UseCase の DI 構造を具体的なパスで確認させる強制が弱く、依存関係の見落とし（特に手動 DI の組み立て箇所）が起きる可能性。

### 特に注目すべき軸
設計品質（4）：presentation-layer.md の存在が最大の強みで、使い分けの失敗パターンを防ぐ構造的サポートとして機能している。
