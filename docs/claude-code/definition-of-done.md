# Definition of Done（完了条件）

タスクを「完了」と報告してよい条件を変更レベル別に定める。`development-workflow.md` の
完了条件を Level 別に具体化したもの。**実在するコマンドだけ**をゲートに含める。

## このリポジトリで実在する品質コマンド（2026-07 時点）

| ゲート                    | コマンド                                        | 備考                                                                                                                                                |
| ------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint                      | `pnpm lint`（turbo lint）                       | 実在                                                                                                                                                |
| Type check                | `pnpm type-check`（turbo type-check）           | 実在                                                                                                                                                |
| Build                     | `pnpm build`（turbo build）                     | 実在。重いので L2/L3 で必要時                                                                                                                       |
| Format check              | `pnpm exec prettier --check "**/*.{ts,tsx,md}"` | `pnpm format` は --write（修正）なので確認は --check                                                                                                |
| Unit / Integration        | `pnpm test`（turbo test / Vitest）              | 実在。domain / application / infrastructure / apps/web に導入済み（2026-07-01 PR #21・`docs/designs/test-infra-expansion.md`）                      |
| E2E / Contract / Security | 個別整備中                                      | Playwright 設定は `apps/web` に存在（シナリオは feature 単位で整備）。依存脆弱性は `pnpm audit`（security-reviewer が実行）。擬似コマンドを入れない |

> ゲートは `bash .claude/scripts/run-quality-gates.sh` で実行。実在しないコマンドは
> 実行せず `unavailable` と報告する（推測で通過扱いにしない）。

## Review readiness の共通契約

成果物 Level は作る文書と工程、review tier は必要な証拠の強さを表す。既定は同じ番号だが、
変更内容に応じて Reviewer は tier を上げられる。

| tier | 最小レビュー                                      |
| ---- | ------------------------------------------------- |
| `R0` | 非規範 typo 等。format + subject digest           |
| `R1` | deterministic gates + Reviewer 1 回               |
| `R2` | 独立 Reviewer + 変更した振る舞いの black-box 証拠 |
| `R3` | R2 + security 等の専門観点 + rollback 確認        |

新規または今回更新する L2/L3 review は structured packet を使う。既存の marker なし文書は、
触らない限り legacy 監査ログとして有効。structured packet の完了条件は次のとおり。

- review subject が現在差分と一致し、`stale` でない。
- open `BLOCK` が 0。
- critical / high の未検証が 0。
- state が `human_review_requested`。これは AI の承認ではなく、人間への引き渡し状態。
- 人間項目が主観・不可逆・未知だけで 3 件以下。各項目に質問、推奨、証拠参照がある。
- 機械確認:
  `node .claude/scripts/review-readiness.mjs handoff-check --feature <feature> --base <base>`
  が exit 0。legacy のままでは成功しない。
- チャット/PR の第一面は `handoff-blurb` の出力（または同等の短文）とし、承認語を書かない。

AI 作業の完了報告と、Gate B での人間のマージ受容を混同しない。マージ可否は人間が packet と
残余リスクを読んで決める。セッション完了時の hard stop は Orchestrator / close-session /
validate-deliverables。CI の review-readiness は当面 warning-only（ADR-0017）。

## 共通（全 Level）

- 要求が整理され、対象範囲・対象外が明確。
- 既存実装への影響が確認済み。
- 無関係な変更・スコープ外改変を含まない。
- 秘密情報を含まない・読み取っていない。
- 未解決事項が記録されている（無ければ「なし」と明記）。

## Level 0（調査・相談）

- 調査結果／提案が提示されている。
- **プロダクションコードを変更していない。**
- 設計書等の成果物は原則不要（必要なら提案書のみ）。

## Level 1（軽微）

- 対象品質ゲート（最低 `lint` / `type-check`）が成功。
- 簡易レビュー（reviewer もしくは Orchestrator の自己点検）完了。
- 変更理由を説明可能。
- 回帰影響を確認済み。
- 独立設計書・実装計画・ADR は**作らない**（過剰工程の禁止）。

## Level 2（通常変更）

- `docs/designs/<feature>.md` / `docs/implementation-plans/<feature>.md` /
  `docs/tests/<feature>.md` を作成・更新（必須セクション非空、対象外は「対象外」と明記）。
- `pnpm lint` 成功。
- `pnpm type-check` 成功。
- 必要に応じ `pnpm build` 成功。
- Unit/Integration test：`pnpm test` 成功必須（変更パッケージの対応テスト追加を含む）。
- 独立 Reviewer の open `BLOCK` が 0、critical / high の未検証が 0。
- 今回 review 文書を作成・更新する場合、current な structured packet があり
  `handoff-check` が成功している（legacy 不可）。
- 文書と実装が一致。

## Level 3（重要変更）

Level 2 に加えて：

- `docs/requirements/<feature>.md` を作成・更新。
- 必要な ADR（`docs/decisions/ADR-<番号>-<タイトル>.md`）を作成。
- 契約の後方互換性を確認（contract-designer の設計に対し reviewer が確認）。
- データ移行・ロールバック手順を確認。
- セキュリティ確認（秘密情報・権限・入力検証）。
- 性能確認（明らかな劣化が無いか）。
- 異常系・部分失敗・冪等性を試験観点に含む。
- `docs/reviews/<feature>.md` に current な structured packet とレビュー監査ログ。
  - Codex 委譲ルートでも同じ。受け入れレビュー結果は PR 本文だけでは足りず、
    `docs/reviews/<feature>.md` への記録が完了条件（正本。PR 要約は任意）。
- review tier `R3` の trigger と、専門レビュー・rollback の証拠を記録。
- `docs/claude-code/improvements/candidates/<task-id>.md` に振り返り（reflection-agent）。

## 判定の原則

- 機械判定（ファイル存在・lint・type-check・JSON/YAML 構文）は Hook / スクリプトで確認。
- 意味的整合（要件充足・設計整合・テスト観点の十分性）は **reviewer** に委譲する
  （Hook だけで品質保証したと主張しない）。
- digest は対象の鮮度を検出するだけで、レビュー品質や Claude 実行を証明しない。
- 小規模変更に Level 3 相当の工程を適用しない。
