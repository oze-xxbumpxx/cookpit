# Definition of Done（完了条件）

タスクを「完了」と報告してよい条件を変更レベル別に定める。`development-workflow.md` の
完了条件を Level 別に具体化したもの。**実在するコマンドだけ**をゲートに含める。

## このリポジトリで実在する品質コマンド（2026-06 時点）

| ゲート | コマンド | 備考 |
| --- | --- | --- |
| Lint | `pnpm lint`（turbo lint） | 実在 |
| Type check | `pnpm type-check`（turbo type-check） | 実在 |
| Build | `pnpm build`（turbo build） | 実在。重いので L2/L3 で必要時 |
| Format check | `pnpm exec prettier --check "**/*.{ts,tsx,md}"` | `pnpm format` は --write（修正）なので確認は --check |
| Unit / Integration / Contract / E2E / Security | **未導入** | MVP1。導入されるまで DoD では `unknown` 扱い。勝手に擬似コマンドを入れない |

> ゲートは `bash .claude/scripts/run-quality-gates.sh` で実行。実在しないコマンドは
> 実行せず `unavailable` と報告する（推測で通過扱いにしない）。

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
- Unit/Integration test：**導入後**は成功必須。未導入の現状は試験計画でカバーし `unknown`。
- **独立 Reviewer の Critical / Major がゼロ**（残すなら完了不可）。
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
- `docs/reviews/<feature>.md` にレビュー記録。
- `docs/claude-code/improvements/candidates/<task-id>.md` に振り返り（reflection-agent）。

## 判定の原則

- 機械判定（ファイル存在・lint・type-check・JSON/YAML 構文）は Hook / スクリプトで確認。
- 意味的整合（要件充足・設計整合・テスト観点の十分性）は **reviewer** に委譲する
  （Hook だけで品質保証したと主張しない）。
- 小規模変更に Level 3 相当の工程を適用しない。
