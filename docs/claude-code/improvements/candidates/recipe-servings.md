# 改善候補: recipe-servings

> reflection-agent が起票。1 タスクの振り返りから抽出した知見をまとめる。
> 設定は変更しない。昇格判断は [../../memory-policy.md](../../memory-policy.md) の昇格条件に従う。

- **task-id**: recipe-servings
- **作成日**: 2026-07-03
- **対象タスク概要**: Recipe 集約への servings 任意項目追加 / L2 / 5 層実装（api-contract / domain / application / infrastructure / apps-web）+ マイグレーション。品質ゲート（lint / type-check / test）全通過。
- **関連成果物**: docs/designs/recipe-servings.md / docs/implementation-plans/recipe-servings.md / docs/tests/recipe-servings.md

---

## 観測した事象

### 事象 1: implementer が実装計画に明記された非コード指示（恒久ドキュメント更新・ステータス変更）を漏らした

- **種類**: レビュー指摘（Should）/ 手戻り
- **観測した事象**:
  - Should-1: `docs/04-domain-model.md` に servings フィールドが反映されなかった。実装計画 §ドキュメント更新箇所に「`docs/04-domain-model.md` の `Recipe` フィールド一覧に `servings: number | null` を追記する」と明示されていたが implementer が未実施。Orchestrator が直接修正して解消。
  - Should-2: 設計書（`docs/designs/recipe-servings.md`）のステータスが実装完了後も `draft` のままだった。実装計画 §ドキュメント更新箇所に「実装完了後にステータスを `confirmed` に更新する」と明示されていたが implementer が未実施。
  - 両件とも「実装計画に明記された非コード指示を implementer が実行しなかった」という同一根本パターン。
- **発生回数**: このタスク内 2 件（Should-1, Should-2）/ 累計 3 件（store-master 事象 4「`docs/04-domain-model.md` 乖離（reviewer Nice-2）」を含む）
- **対象タスク**: recipe-servings（Should-1, Should-2）/ store-master（事象 4）
- **原因仮説**:
  1. 実装計画のドキュメント更新指示がコード変更ステップと同一フォーマット・同一セクションで列挙されているため、コード変更完了後にドキュメント更新指示を見落としやすい。
  2. implementer の完了チェックリストに「実装計画が列挙したドキュメント更新を全件実施したか」という検証ステップが存在しない。
  3. 設計書ステータスは「実装完了後に更新する」という指示のみで、更新主体（implementer なのか Orchestrator なのか）が不明瞭なまま委譲されている。
- **改善案**:
  1. create-implementation-plan Skill で「§ドキュメント更新」を独立セクションとしてコード変更リストと明確に分離し、見落としにくい構造にする。
  2. implementer の完了チェックリスト（Skill または Agent 定義）に「実装計画 §ドキュメント更新の全項目を確認・実施した」チェックを追加する。
  3. （副次的）設計書ステータス更新は Orchestrator が統合フェーズで一括管理するルールも選択肢として proposal で検討する。
- **変更対象**: `.claude/skills/create-implementation-plan/SKILL.md`（ドキュメント更新セクションのコード変更リストからの分離）/ `.claude/agents/implementer.md`（完了チェックリストへの追加）
- **想定される副作用**: 実装計画のフォーマット変更により、implementation-planner の生成物レイアウトが変わる。既存の実装計画テンプレートとの互換性を確認する必要がある。Orchestrator がステータス更新を引き受ける場合は orchestrator の処理量が若干増える。
- **評価方法**: 次の L2/L3 タスクで、implementer が実装計画のドキュメント更新指示を reviewer の指摘なしに全件実施できるかを確認する。Should 指摘ゼロが目標。
- **昇格判定**: **昇格条件を満たす**（同種問題 3 回以上: store-master 事象 4 + recipe-servings Should-1 + Should-2）。proposal 起票を推奨。

---

### 事象 2: 並列実行した test-designer と implementation-planner の判断が食い違い、試験計画に実施不可能なテストが混入した

- **種類**: Agent 間認識不一致
- **観測した事象**: test-designer が試験計画に T-C01〜T-C18 として `packages/api-contract` の Zod バリデーション単体テストを作成した。一方 implementation-planner は「`packages/api-contract` に Vitest 設定が存在しないためスコープ外」と判断し、api-contract テストは実装しなかった（実装計画 §確認事項 2 に明記）。両者が並列実行されたため、implementation-planner のスコープ判断が test-designer の試験計画に反映されず、試験計画に実施されなかったテストが残留した。Orchestrator が事後に試験計画に「未実施理由」を追記して解消。
- **発生回数**: このタスク内 1 件 / 累計 1 件（初回）
- **対象タスク**: recipe-servings
- **原因仮説**:
  1. test-designer と implementation-planner が並列実行される設計上、両 Agent がリアルタイムに情報共有できない。
  2. test-designer が試験計画を作成する時点で「対象パッケージにテスト実行環境（Vitest 設定）が存在するか」を確認するステップが create-test-plan Skill に含まれていない。
  3. Orchestrator が並列 Agent の成果物を受け取った統合フェーズで「試験計画のスコープ × implementation-planner のスコープ外判断」の整合を照合していなかった。
- **改善案**:
  1. Orchestrator の並列実行完了後の統合フェーズに「test-designer の試験計画と implementation-planner のスコープ外判断を照合し、実施不可能なテストが残留していないかを確認する」ステップを追加する。
  2. または create-test-plan Skill に「試験計画を書く前に対象パッケージの Vitest / Jest 設定有無を確認し、テスト基盤がない場合は試験計画にその旨を明記する」ステップを追加する。
- **変更対象**: `.claude/agents/orchestrator.md`（並列統合フェーズの整合確認）/ または `.claude/skills/create-test-plan/SKILL.md`（環境制約確認ステップ）
- **想定される副作用**: 統合フェーズのチェック追加は Orchestrator の処理量・トークン増。test-designer の環境確認追加は試験計画作成の工数増。
- **評価方法**: 次に test-designer と implementation-planner が並列実行されるタスクで、試験計画のスコープと実装スコープが整合しているか（または不一致があれば試験計画側に理由が明記されているか）を確認する。
- **昇格判定**: Memory 留め（昇格せず）。初回発生。ただし並列実行の構造的リスクであり、IMP-2026-007（orchestrator 並列化）が適用済みの現状では再発可能性が高い。次回同種の不整合（Orchestrator が事後に追記・修正が必要になった場合）で昇格を推奨。

---

### 事象 3: devDependency happy-dom に critical RCE 脆弱性が検出された（本番非影響・スコープ外）

- **種類**: セキュリティ指摘（security-reviewer・既存コード起因）
- **観測した事象**: security-reviewer による `pnpm audit` で、既存 devDependency `happy-dom ^17.6.3` に critical な RCE 脆弱性（GHSA-37j7-fg3j-429f 等複数）が検出された。今回の recipe-servings feature とは無関係の既存問題。本番影響なし（devDependency）だが CI 環境での悪用リスクあり。スコープ外として報告のみで今回は未対応。
- **発生回数**: このタスク内 1 件 / 累計 2 件（store-master の hono 脆弱性 GHSA-88fw-hqm2-52qc と同パターン：既存 devDependency 脆弱性が security-reviewer に検出される）
- **対象タスク**: recipe-servings（初検知）/ store-master（hono、類似パターン）
- **原因仮説**: devDependency の定期アップデートを実施する仕組みがなく、脆弱性が蓄積されている。security-reviewer がタスクのたびに全依存を検査するため、未修正の既存脆弱性が毎タスク報告される可能性がある。
- **改善案**: N/A（スコープ外対応）。ただし「CI 環境に影響する devDependency 脆弱性の対応フロー（担当・タイミング・重大度閾値）」の整備は将来課題として記録する。
- **変更対象**: implementer Subagent Memory（happy-dom を最新パッチ以上に維持する必要がある旨）
- **想定される副作用**: なし
- **評価方法**: N/A
- **昇格判定**: Memory 留め（昇格せず）。本番非影響・スコープ外。ただし「既存 devDependency 脆弱性の報告がタスクをまたいで 3 回続く」場合は対応フロー整備を候補化する。

---

### 事象 4: check-deliverables.mjs が実質的な内容のある設計書セクションを「空」と誤判定した疑い

- **種類**: Hook 誤検知（ブロックなし）
- **観測した事象**: `check-deliverables.mjs`（推定）が「設計書の必須セクションが空: 変更後構成（空）, テスト方針（空）」と警告を出力したが、実際には両セクションとも 100 行以上の実質的な内容が記述されていた。ブロックは発生せず作業継続に影響なし。
- **発生回数**: このタスク内 1 件 / 累計 1 件（初回）
- **対象タスク**: recipe-servings
- **原因仮説**:
  1. Hook の空セクション判定ロジックが「セクション見出し直後の行が空白かどうか」のみを検査しており、内容が数行後から始まるパターンを誤って「空」と判定する可能性がある。
  2. または設計書のセクション見出し形式（`##` のネスト深さ・前後のスペース）が Hook の想定フォーマットと一致していなかった可能性がある。
  3. 確証なし（ブロックされていないため詳細調査が困難。フォーマット依存の誤検知の可能性を否定できない）。
- **改善案**: Hook のセクション空判定ロジックを「次の見出しまでの非空白行数で判定する」方式に変更する（確証が得られた場合）。変更前に誤検知した設計書と Hook のロジックを照合して原因を特定する。
- **変更対象**: `.claude/hooks/check-deliverables.mjs`（セクション空判定ロジック）
- **想定される副作用**: Hook 変更はブロック条件変更に該当する可能性があり、人間承認が必要。誤検知の修正が逆に検知漏れを生む可能性を eval で確認する必要がある。
- **評価方法**: 同じ設計書フォーマット（`docs/designs/recipe-servings.md`）で Hook を手動再実行し、警告が再現するかを確認する。再現した場合は Hook コードの判定ロジックを精査する。
- **昇格判定**: Memory 留め（昇格せず）。初回・非ブロック・原因不確定。次回同種の誤警告が発生した場合に Hook コードを精査し、確証が得られたら昇格する。

---

## まとめ

- 改善候補として起票したもの（backlog 昇格候補に追記）:
  - 事象 1「implementer が実装計画の非コード指示（恒久ドキュメント更新・ステータス変更）を漏らす」→ 昇格条件満たす（累計 3 回以上）。proposal 起票を推奨。
- Memory に留めたもの（昇格せず・再発監視）:
  - 事象 2: 並列 Agent（test-designer / implementation-planner）の判断食い違い（初回。並列実行構造上の再発リスクあり。次回同種で昇格）
  - 事象 3: devDependency happy-dom RCE 脆弱性（本番非影響・スコープ外。同種が 3 タスク続いたら対応フロー整備を候補化）
  - 事象 4: check-deliverables.mjs セクション空判定の誤検知疑い（初回・非ブロック・原因不確定。次回再現で Hook コードを精査）
