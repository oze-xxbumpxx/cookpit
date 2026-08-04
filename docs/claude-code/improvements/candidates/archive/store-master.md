# 改善候補: store-master

> reflection-agent が起票。1 タスクの振り返りから抽出した知見をまとめる。
> 設定は変更しない。昇格判断は [../../memory-policy.md](../../memory-policy.md) の昇格条件に従う。

- **task-id**: store-master
- **作成日**: 2026-06-28
- **対象タスク概要**: Sprint 2 Unit A / Store マスタ（Domain + Infrastructure + Application + API + テスト）/ L3
- **関連成果物**: docs/designs/store-master.md / docs/implementation-plans/store-master.md / docs/reviews/store-master.md

---

## 観測した事象

### 事象 1: orchestrator の stop/resume 後に sub-agent notification を受け取れず無限待機ループに陥る

- **種類**: 手戻り / Agent 間認識不一致（Orchestrator と Sub-agent 完了通知の断絶）
- **観測した事象**: orchestrator が requirements-analyst を background で起動した後、自身が stop した。再開時に Sub-agent 完了通知を受け取れず、「Sub-agent の完了を待つ」ループから抜け出せなかった。結果としてメイン会話が orchestrator の代わりに各 Agent（architecture-designer / contract-designer / implementation-planner / implementer / reviewer / security-reviewer）を直接起動して手動オーケストレーションを行った。
- **発生回数**: このタスク内で複数回（初確認）/ 累計 1 タスク目
- **対象タスク**: store-master
- **原因仮説**: Claude Code の background Agent 起動と stop/resume の組み合わせにより、再開後のセッションコンテキストに Sub-agent の実行状態が引き継がれない構造的制約がある。orchestrator が「Sub-agent の完了通知待ち」という状態を resume 後に継続できないため、無限待機になる。これは IMP-2026-007 が想定した「notification 待ちループ」であり、並列化改善の恩恵を受けるよりも先に解決が必要な根本問題。
- **改善案**:
  1. orchestrator が Sub-agent を background で起動する場合、stop する前に「起動済み Sub-agent のリスト・目的・期待成果物」を状態ファイル（`.claude/state/` 等）に書き出す
  2. orchestrator が resume した際、状態ファイルを読んで Sub-agent の完了を確認する（notification に依存しない冪等チェック方式）
  3. または orchestrator は自身が stop する前に Sub-agent の完了を同期的に待つよう委譲フローを変更する（background 起動を避ける）
- **変更対象**: `.claude/agents/orchestrator.md`（委譲フローの stop/resume ガード）/ `.claude/state/` 運用ルール / docs/claude-code/orchestration-policy.md
- **想定される副作用**: 状態ファイル方式を導入すると orchestrator の起動直後処理が増えトークン増になる可能性。また stop しないよう強制すると長時間タスクでセッション上限に引っかかるリスク。
- **評価方法**: L3 タスクで orchestrator が background Agent 起動後に stop した後、resume で正しく Sub-agent 完了を検知し、手動オーケストレーションなしに次工程へ進めるかを確認する。
- **昇格判定**: 昇格条件を満たす（→ proposal 起票推奨）。単発だが「手動オーケストレーションが必要になった」という重大な機能不全であり、IMP-2026-007 の計測前提を崩す構造的問題。また IMP-2026-007 採否の前提条件になるため優先度が高い。

---

### 事象 2: orchestrator の二重起動により architecture-designer が並走し設計判断（D-1）が一時的に分岐した

- **種類**: Agent 間認識不一致
- **観測した事象**: orchestrator が起動した architecture-designer（バックグラウンド）と、メイン会話が手動で起動した architecture-designer が同時実行状態になった。最初の設計書ではレスポンス用スキーマを api-contract に置かない方針だったが、後から起動した architecture-designer が D-1 として「両スキーマとも api-contract」と確定した。contract-designer は最初の設計書を読んで起動されており、D-1 変更を SendMessage 経由で追送して対処した。
- **発生回数**: このタスク内で 1 回（初確認）/ 累計 1 タスク目
- **対象タスク**: store-master
- **原因仮説**: 事象 1（notification 待ちループ）の結果として手動オーケストレーションが必要になり、orchestrator バックグラウンド Agent が完了しないまま後続 Agent を手動起動したため。根本原因は事象 1 と同じ。
- **改善案**: 事象 1 の解決（orchestrator stop/resume 問題の修正）により、手動オーケストレーションが不要になれば本事象は再発しない。独立した改善案は不要。
- **変更対象**: なし（事象 1 の改善に依存）
- **想定される副作用**: なし
- **評価方法**: 事象 1 の改善効果確認時に同時確認する。
- **昇格判定**: Memory 留め（昇格せず）。事象 1 の副産物であり独立した改善対象ではない。

---

### 事象 3: test-designer と設計書の間でテスト網羅の範囲が暗黙的に絞られ、N-02 が実装されなかった

- **種類**: レビュー指摘（Should）/ Agent 間認識不一致
- **観測した事象**: 要件書（§5）の試験計画 N-02「CreateStoreUseCase で生成した ID を GetStoresUseCase で確認できる」が実装テストに含まれなかった。設計書（§17-2）が N-02 を省略しており、test-designer と implementer がこれを踏襲した。reviewer が Should として指摘し、修正対応された。
- **発生回数**: このタスク内で 1 回 / 過去の recipe-edit-screen でも類似（テスト網羅性が弱い指摘は複数タスクで観測）
- **対象タスク**: store-master（recipe-edit-screen でも類似指摘あり）
- **原因仮説**: 設計書 §テスト計画節が試験計画の一部観点を選択的に省略し、test-designer がその設計書を正規入力として使うため省略が引き継がれる。要件書のテスト観点と設計書のテスト節の齟齬チェックが工程上に存在しない。
- **改善案**: create-test-plan Skill で「要件書の試験計画 N-xx が設計書テスト節に全て反映されているか確認する」チェック項目を追加する（IMP-2026-001 の観点選択基準と組み合わせ）。
- **変更対象**: `.claude/skills/create-test-plan/SKILL.md`（要件書 vs. 設計書テスト節の整合チェック）
- **想定される副作用**: テスト計画の範囲確認ステップが増えるため test-designer の処理量が若干増える。ただし Should 指摘の再発防止効果の方が大きい。
- **評価方法**: 次の L3 タスクで、要件書の全テスト観点が設計書テスト節に含まれているか、または意図的な省略理由が明記されているかを確認する。
- **昇格判定**: 再発監視（Memory 留め）。テスト網羅性の弱さは複数タスクで観測されているが、create-test-plan Skill（IMP-2026-001）は直前に改善済みであり、今回の事象が IMP-2026-001 の残課題か新たな問題かを次タスクで見極める。2 回目の同種指摘で昇格。

---

### 事象 4: `docs/04-domain-model.md` の Store エンティティ定義が実装と乖離していた

- **種類**: レビュー指摘（Nice）
- **観測した事象**: reviewer が Nice-2 として指摘。`docs/04-domain-model.md` の Store エンティティのシグネチャ・フィールドが実装と 4 点乖離しており、かつ「動的追加は Phase 2」という古い記述が残っていた（今回 Sprint 2 で動的追加を実装）。
- **発生回数**: このタスク内で 1 回
- **対象タスク**: store-master
- **原因仮説**: L3 実装後のドメインモデルドキュメント更新が実装計画・チェックリストに含まれていない。実装完了 = 当該ファイルの更新完了、と暗黙に想定されているが、`docs/04-domain-model.md` のような上位設計書は更新対象として明示的にリストアップされていない。
- **改善案**: L3 の実装計画テンプレートまたは implementer の完了チェックリストに「`docs/04-domain-model.md` の対象エンティティ定義が実装と一致しているか確認・更新する」を追加する。
- **変更対象**: `.claude/skills/` （実装計画作成 / implementer 完了チェックリスト）または implementer Agent 定義のチェック項目
- **想定される副作用**: implementer が毎回上位ドキュメントを確認する工数が増える可能性。ただし今回のような乖離が積み重なるよりコストは低い。
- **評価方法**: 次の L3 タスク後に `docs/04-domain-model.md` 等の上位設計書が実装と整合していることを確認する。
- **昇格判定**: Memory 留め（昇格せず）。初回発生。ドキュメント乖離は Nice 指摘であり緊急性は低い。次回同種指摘で昇格を検討する。

---

### 事象 5: レビュー後修正（正常フロー）— hono 脆弱性・import マージ・max(255)・N-02 テスト追加

- **種類**: レビュー指摘（正常な品質ゲート機能）
- **観測した事象**: security-reviewer が Must 1 件（hono 脆弱性 GHSA-88fw-hqm2-52qc）、reviewer が Should 3 件（import マージ / N-02 テスト未実装 / import type 精査）を指摘し、実装が修正対応した。品質ゲートが正常に機能したケース。
- **発生回数**: このタスク内で 1 回
- **対象タスク**: store-master
- **原因仮説**: N/A（正常フロー）。hono 脆弱性は既存コードから引き継いだバージョン指定によるもの（不可抗力に近い）。import マージや max(255) は実装時の細部漏れ。
- **改善案**: N/A。ただし「hono バージョンを最新パッチ以上に維持する」という運用ルールを implementer の注意点 Memory に追記することを推奨。
- **変更対象**: implementer Subagent Memory（hono バージョン管理の注意点）
- **想定される副作用**: なし
- **評価方法**: N/A
- **昇格判定**: Memory 留め（昇格せず）。正常フローの記録。hono バージョンの注意点は implementer Memory に留める。

---

### 事象 6: IMP-2026-007 計測——orchestrator notification 待ちループが計測を歪めた

- **種類**: 成功手順 / メタ観察（改善サイクル観点）
- **観測した事象**: Store マスタは IMP-2026-007 の before 計測対象タスクだったが、orchestrator の stop/resume notification 待ちループ（事象 1）により「実質的にメイン会話が手動オーケストレーション」を行った。このため duration_ms・tool uses 等の計測値が「orchestrator が正常動作した場合の before 値」として使いにくい状態になった。特に設計フェーズは architecture-designer × 2 の二重起動を含むため Subagent 総数・tool uses が正常ケースより多い。
- **発生回数**: このタスク内で 1 回（IMP-2026-007 計測タスクとして初）
- **対象タスク**: store-master
- **原因仮説**: IMP-2026-007 の計測設計が「orchestrator が正常に逐次実行する」前提だったが、事象 1 の notification 待ちループにより前提が崩れた。
- **改善案**: IMP-2026-007 採否判断の定量根拠として、次の L3 タスク（orchestrator が正常動作するか、またはループ問題が解消済みの場合）で再計測することを推奨。今回の計測値は「構造問題が発生した異常ケース」として記録に残す（before 値として使わない）。
- **変更対象**: `docs/claude-code/improvements/evaluations/IMP-2026-007.md`（実タスク計測節に上記経緯を注記済み）
- **想定される副作用**: なし
- **評価方法**: 次 L3 タスクで orchestrator が正常に動作した場合に before 値として使用する。
- **昇格判定**: Memory 留め（昇格せず）。計測の注記として IMP-2026-007 評価ファイルに既に記録。

---

## まとめ

- 改善候補として起票したもの（→ backlog に追記した ID）:
  - **新規昇格候補**: 事象 1「orchestrator stop/resume 後の Sub-agent notification 待ちループ」→ backlog に新規候補として追記（IMP 番号は manager が採番）
- Memory に留めたもの（昇格せず・再発監視）:
  - 事象 2: architecture-designer 二重起動（事象 1 の副産物・事象 1 解消で消える）
  - 事象 3: N-02 テスト未実装（再発監視中・次回同種 Should 指摘で create-test-plan Skill 昇格）
  - 事象 4: `docs/04-domain-model.md` 乖離（Nice 指摘・次回同種指摘で昇格）
  - 事象 5: レビュー後修正（正常フロー・hono バージョン注意点は implementer Memory へ）
  - 事象 6: IMP-2026-007 計測歪み（評価ファイルに注記済み）
