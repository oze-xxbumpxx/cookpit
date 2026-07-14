# 改善候補: harness-post-020-audit（IMP-2026-020 後の棚卸し）

> ユーザー依頼「現状のハーネス構成で改善するべき項目を見つけて」（2026-07-14）。
> 設定は変更しない。昇格判断は [../../memory-policy.md](../../memory-policy.md) の昇格条件に従う。
> 棚卸し手順: `.claude/skills/audit-skills/SKILL.md`。

- **task-id**: harness-post-020-audit
- **作成日**: 2026-07-14
- **対象タスク概要**: IMP-2026-020（#1〜#12）適用直後の指示系診断。デッドパス・正典同期漏れ・
  昇格充足の未起票・肥大化を横断確認。変更レベル L0（ドキュメント・候補起票のみ）。
- **関連成果物**: [accepted/IMP-2026-020.md](../accepted/IMP-2026-020.md) /
  [improvement-backlog.md](../improvement-backlog.md) /
  [candidates/shopping-list-screens.md](shopping-list-screens.md)

## 前提（今回対象外）

IMP-2026-020 で対応済みの #1〜#12、および hooks ↔ 実ファイルの一致・Codex reviews 正本・
L2/L3「新規画面」方針・モデル采配表と Agent frontmatter の一致は問題なしと判定した。
以下は **020 後に残る項目のみ**。

---

## 観測した事象（複数可）

### 事象 1: default export 例外の衛星文書への同期漏れ（P0）

- **種類**: Agent間認識不一致 / 正典同期漏れ
- **観測した事象**: IMP-020 #10 で `.claude/rules/coding-standards.md` と `docs/07-dev-rules.md`
  には Next.js App Router の default export 例外が追記されたが、要約側が未更新のまま:
  - `CLAUDE.md` L78: `default export 禁止` のみ
  - `.claude/agents/implementer.md` L62: 同
  - `.claude/skills/create-codex-brief/SKILL.md` L42: 指示書抜粋も例外なし
- **発生回数**: 棚卸しで初確認（IMP-020 適用時の反映先一覧に衛星文書が含まれていなかった）
- **対象タスク**: harness-post-020-audit / 出典: IMP-2026-020 #10
- **原因仮説**: proposal の「反映先一覧」に正典 2 ファイルのみが載り、CLAUDE.md / implementer /
  create-codex-brief の要約コピーが漏れた（IMP-2026-018 の狙う再発パターンと同型）。
- **改善案**: 正典の例外 1 行を 3 文書へ追記する（方針変更ではない客観的修正）。
- **変更対象**: `CLAUDE.md` / `.claude/agents/implementer.md` /
  `.claude/skills/create-codex-brief/SKILL.md`
- **想定される副作用**: なし（例外の有無を正典に合わせるだけ）
- **評価方法**: `rg "default export" CLAUDE.md .claude/agents/implementer.md .claude/skills/create-codex-brief`
  で例外言及が揃うこと。frontend-screen-addition eval で「page.tsx の default export を禁止と誤判定しない」
- **昇格判定**: 昇格条件を満たす（→ 客観的修正として即時適用可。人間承認は CLAUDE.md / Agent / Skill
  変更のため必要）

### 事象 2: create-implementation-plan テンプレに「実装ルート」欄が無い（P0）

- **種類**: 要件見落とし / 正典と Skill の食い違い
- **観測した事象**: `orchestration-policy.md` L98–99 は実装計画の「実装ルート」欄更新を規律とする。
  実成果物（例: `docs/implementation-plans/shopping-list-screens.md`）にも欄があるが、
  Skill テンプレは `- レベル: L2 | L3` のみで「実装ルート」「判断理由」がゼロ。
  shopping-list-screens 事象 5（判断理由欠落 → ユーザー質問）と直結。
- **発生回数**: 構造的欠落 1（実害は shopping-list-screens で 1 回）
- **対象タスク**: shopping-list-screens 事象 5 + 本監査
- **原因仮説**: policy / 実運用が先に進み、Skill テンプレが追従していない。
- **改善案**: テンプレに以下を必須化:
  ```
  - 実装ルート: Orchestrator（implementer）| Codex 委譲
  - 判断理由: （既定どおりなら「既定」+ 06-ai-tools の観点 1 語。特殊判断なら理由 1 行）
  ```
- **変更対象**: `.claude/skills/create-implementation-plan/SKILL.md`
- **想定される副作用**: 既定ルートでも 1 行書く手間（軽微）
- **評価方法**: 次回 L2/L3 実装計画で両欄が埋まり、同種の「なぜこのルートか」質問がゼロ
- **昇格判定**: 昇格条件を満たす（policy との事実整合 + 実害 1 回。早期昇格の前例 IMP-012 と同型）

### 事象 3: 強制中断からのセッション跨ぎ復旧が未正典化（P1・昇格充足）

- **種類**: 成功手順
- **観測した事象**: shopping-list-screens 事象 1 — usage リミット強制中断後、
  `logs/` + `git ls-remote` で中断点を復元し手戻りゼロ。累計 3 回相当で昇格条件充足だが
  proposal 未起票。事象 7（feature/* と claude/* のブランチ二重化）も統合検討可。
- **発生回数**: 広い括りで累計 3 / 強制中断特化で累計 2（candidate 記載どおり）
- **対象タスク**: shopping-list-screens（詳細は同 candidate）
- **原因仮説**: 成功手順が経験知のまま各セッションで再発明されている。
- **改善案**: `development-workflow.md` または kickoff-session / close-session に
  「強制中断からの復旧」チェックリストを追加（ログ読む → リモートブランチ確認 →
  継続ブランチを明示選択 → 未完了工程のみ再開）。
- **変更対象**: `docs/claude-code/development-workflow.md` および/または
  `.claude/skills/kickoff-session` / `close-session`
- **想定される副作用**: 中断理由ごとの分岐を書きすぎると窮屈になる → 「共通の型 + 分岐」で書く
- **評価方法**: 次回強制中断→再開で往復数が今回以下か
- **昇格判定**: 昇格条件を満たす（→ proposal 起票推奨。Skill/正典変更は人間承認）

### 事象 4: validate-agent-config の Explore 誤検知が未ホワイトリスト（P1）

- **種類**: プロセス観察（Hook ノイズ）
- **観測した事象**: `orchestration-policy.md` L290–291 が「Explore 警告は誤検知として扱う」と
  明記。一方 `.claude/hooks/validate-agent-config.mjs` L216–218 は
  `.claude/agents/${r}.md` の存在のみ検査し、組み込み `Explore` を除外していない。
- **発生回数**: 構造的（orchestrator 編集のたびに WARN しうる）
- **対象タスク**: harness-post-020-audit / 出典: orchestration-policy 注記
- **原因仮説**: policy 側で運用回避を書き、Hook 修正を後回しにした。
- **改善案**: 組み込み Agent 名（少なくとも `Explore`）を除外リスト化。policy 注記を
  「除外済み」に更新。
- **変更対象**: `.claude/hooks/validate-agent-config.mjs` /
  `docs/claude-code/orchestration-policy.md`（注記更新）
- **想定される副作用**: 将来同名の独自 Agent を作ると見逃す → コメントで「Claude Code 組み込み」と明記
- **評価方法**: orchestrator.md の tools に Explore がある状態で hook を走らせ WARN ゼロ
- **昇格判定**: 昇格条件を満たす（客観的修正。Hook 変更は人間承認必須）

### 事象 5: metrics `_TEMPLATE.yml` のテストランナー鮮度切れ（P1）

- **種類**: 鮮度切れ
- **観測した事象**: `_TEMPLATE.yml` L14:
  `MVP1 はテストランナー未導入のため通常 unknown`。現実は Vitest 全層導入済み
  （definition-of-done / coding-standards と矛盾）。
- **発生回数**: 1（skills-inventory-audit 事象 1 と同型の「現状記述の賞味期限切れ」）
- **対象タスク**: harness-post-020-audit
- **原因仮説**: テスト基盤導入後にテンプレコメントが更新されていない。
- **改善案**: コメントを「取得できなければ unknown。通常は追加テスト件数を記入」等に更新。
- **変更対象**: `docs/claude-code/improvements/metrics/_TEMPLATE.yml`
- **想定される副作用**: なし
- **評価方法**: テンプレに「未導入」文言が残っていないこと（`rg "未導入" metrics/`）
- **昇格判定**: 昇格条件を満たす（客観的修正・自動実行可能寄りの文書修正）

### 事象 6: orchestrator.md が background 既知制約へのポインタを欠く（P1）

- **種類**: 正典と Agent 要約の食い違い（残差）
- **観測した事象**: IMP-020 #6 は `orchestration-policy.md` に実挙動注記を追加したが、
  `orchestrator.md` L55–58 は「原則同期待機」のみで、常時 background になり得る既知制約への
  参照が無い。
- **発生回数**: 1（IMP-020 の反映先一覧に orchestrator.md が含まれていなかった）
- **対象タスク**: meal-plan-screens 事象 4 の残差 + 本監査
- **原因仮説**: 正典のみ更新し、実行主体の Agent 定義への 1 行ポインタが漏れた。
- **改善案**: orchestrator.md に「実挙動は常に background になり得る。詳細は policy §既知の制約」を
  1〜2 行追加。
- **変更対象**: `.claude/agents/orchestrator.md`
- **想定される副作用**: なし（方針変更ではなくポインタ追加）
- **評価方法**: orchestrator 初見トレースで「同期待機」と実挙動の矛盾に迷わないこと
- **昇格判定**: 昇格条件を満たす（客観的修正。Agent 変更は人間承認）

### 事象 7: backlog 履歴行の死パス表記（P2・衛生）

- **種類**: 鮮度切れ（死パス）
- **観測した事象**: `improvement-backlog.md` L94 付近:
  `.claude/skills/create-test-plan.md`（実体は `create-test-plan/SKILL.md`）。
  candidate `test-runner-introduction.md` にも同誤記の可能性。
- **発生回数**: 履歴行の表記ずれ（実行時参照ではない）
- **対象タスク**: harness-post-020-audit
- **原因仮説**: Skill をディレクトリ形式に移したあと履歴を直していない。
- **改善案**: パスを `create-test-plan/SKILL.md` に訂正。
- **変更対象**: `improvement-backlog.md`（必要なら candidate 側）
- **想定される副作用**: なし
- **評価方法**: `test -e .claude/skills/create-test-plan/SKILL.md` と表記一致
- **昇格判定**: 昇格条件を満たす（客観的修正・自動実行可能）

### 事象 8: orchestration-policy / create-test-plan の肥大（P2・提案止まり）

- **種類**: 構造
- **観測した事象**: `orchestration-policy.md` ≒ 351 行（委譲・Codex・stop/resume・既知制約・
  security/perf/e2e・モデル采配が同居）。`create-test-plan` ≒ 146 行。`orchestrator.md` ≒ 136 行で
  policy 要約が重複。
- **発生回数**: 構造的（単発タスクの失敗ではない）
- **対象タスク**: harness-post-020-audit
- **原因仮説**: 改善のたびに正典へ追記し、分割していない。
- **改善案**: `known-constraints.md` / `model-assignment.md` 等へ切り出し、本体はリンクのみ。
  ただし新規ファイルは承認境界のため提案止まり。
- **変更対象**: `docs/claude-code/orchestration-policy.md` ほか（要承認）
- **想定される副作用**: 分割しすぎると「正典がどれか」が再び曖昧になる → 1 ハブ + 衛星の形を維持
- **評価方法**: 初見 AI のトレースで迷う箇所が減るか（定性）
- **昇格判定**: Memory 留め（提案止まり。ユーザーが分割を求めたら proposal 化）

### 事象 9: phases 完全自動分割・E2E 前提・IMP-007 最終採否（P2・据え置き）

- **種類**: 申し送りの残件
- **観測した事象**:
  1. phases 完全自動分割は未実装（IMP-020 で手埋め欄のみ）
  2. E2E「リモート不可」前提が dev:pglite 実証で緩和（次画面ユニットで再評価）
  3. IMP-2026-007 の最終採否が「人間判断待ち」のままオープン
- **発生回数**: backlog 申し送り表に既存
- **対象タスク**: shopping-list-core / shopping-list-screens / IMP-007
- **原因仮説**: コスト対効果または人間判断待ちで意図的に据え置き。
- **改善案**: 新候補化せず申し送り維持。007 は「定性採用で完了」と明示クローズするか判断を求める。
- **変更対象**: なし（今回）
- **想定される副作用**: なし
- **評価方法**: 次回 L3 / 画面ユニットでの再評価
- **昇格判定**: Memory 留め（据え置き）

### 事象 10: document-reviewer の標準フロー未掲載（P2・任意）

- **種類**: 発動の弱さ
- **観測した事象**: Agent・usage-guide にはあるが、orchestration-policy 委譲フロー /
  development-workflow に起動タイミングが無い。単体起動前提は明記済みで欠陥ではない。
- **発生回数**: 構造的
- **対象タスク**: harness-post-020-audit
- **原因仮説**: レビュー専門 Agent を「必要時のみ」運用にしたままフロー図へ載せていない。
- **改善案**: L3 文書確定後の任意起動を 1 行足すか、現状維持。
- **変更対象**: `orchestration-policy.md` or `usage-guide.md`
- **想定される副作用**: 必須化すると L0/L1 で過剰工程
- **評価方法**: 文書レビュー依頼時に Agent 選択が迷わないこと
- **昇格判定**: Memory 留め（ユーザー要求時のみ提案）

---

## 診断サマリ（audit-skills 6 項目横断）

| 領域 | 判定 | メモ |
| --- | --- | --- |
| hooks ↔ 実ファイル | OK | settings.json の 7 hook すべて実在 |
| Codex reviews 正本 | OK | policy / DoD / Skill 一致（IMP-020） |
| L2/L3・新規画面 | OK | classify-change と一致 |
| モデル采配 | OK | Agent frontmatter と policy 早見表一致 |
| 正典同期 | NG | 事象 1・2・6 |
| 鮮度 | NG | 事象 5・7 |
| Hook ノイズ | NG | 事象 4 |
| 昇格充足の未起票 | NG | 事象 3（+ 事象 2 の早期昇格） |
| 肥大化 | 監視 | 事象 8 |

## 推奨バッチ案（採否は人間）

| バッチ | 内容 | 承認区分 |
| --- | --- | --- |
| A（客観・小） | 事象 1・2・5・6・7 | CLAUDE.md / Skill / Agent 含むため**人間承認必須**だが方針変更なし |
| B（提案化） | 事象 3（復旧手順）+ 事象 4（Explore ホワイトリスト） | Hook/正典 → 人間承認。proposal 起票推奨 |
| C（据え置き） | 事象 8・9・10 | 提案止まり / 申し送り |

## まとめ

- 改善候補として起票したもの（→ backlog に追記）:
  - 事象 1（default export 衛星同期）→ **IMP-2026-021 で対応済み**
  - 事象 2（実装ルート欄のテンプレ欠落）→ **IMP-2026-021 で対応済み**
  - 事象 3（強制中断復旧の正典化）→ **IMP-2026-021 で対応済み**
  - 事象 4（Explore ホワイトリスト）→ **IMP-2026-021 で対応済み**
  - 事象 5（metrics テンプレ鮮度）→ **IMP-2026-021 で対応済み**
  - 事象 6（orchestrator background ポインタ）→ **IMP-2026-021 で対応済み**
  - 事象 7（backlog 死パス）→ **候補起票時に訂正済み**
- Memory に留めたもの（バッチ C・据え置き）:
  - 事象 8（肥大化分割）
  - 事象 9（phases / E2E / IMP-007）
  - 事象 10（document-reviewer フロー）
