# Definition of Done（完了条件）

タスクを「完了」と報告してよい条件を変更レベル別に定める。`development-workflow.md`の
完了条件をLevel別に具体化したもの。**実在するコマンドだけ**をゲートに含める。

## このリポジトリで実在する品質コマンド（2026-09時点）

| ゲート             | コマンド                                 | 備考                                                                    |
| ------------------ | ---------------------------------------- | ----------------------------------------------------------------------- |
| Lint               | `npm run lint`                           | ESLint                                                                  |
| Type check         | `npm run type-check`                     |                                                                         |
| Build              | `npm run build`                          | contracts → api → web。重いのでL2 / L3で必要なときに実行                |
| Format check       | `unavailable`                            | Prettier未導入                                                          |
| Unit / Integration | `npm test`                               | Vitest（web / api）。実DBの結合は`npm run test:api-db`（Dockerが必要）  |
| Contract / Schema  | `npm run api:check` / `npm run db:check` | API契約を変えたら`api:check`、DBスキーマを変えたら`db:check`            |
| Harness            | `npm run test:harness`                   | `.claude/`か`.agents/`を変えたときに実行。CIのharnessジョブでも実行する |
| E2E                | `unavailable`                            | Playwright未導入                                                        |
| 依存脆弱性         | `npm audit`                              | security-reviewerが、起動条件に当たるとき実行する                       |

> ゲートは`bash .claude/scripts/run-quality-gates.sh`で実行する。ロックファイルから
> パッケージマネージャー（本リポジトリではnpm）を検出し、既定では休眠中の試験を除いて回る。
> 実在しないコマンドは実行せず`unavailable`と報告する（推測で通過扱いにしない）。

## Review readinessの共通契約

成果物Levelは作る文書と工程、review tierは必要な証拠の強さを表す。既定は同じ番号だが、
変更内容に応じてReviewerはtierを上げられる。

| tier | 最小レビュー                                   |
| ---- | ---------------------------------------------- |
| `R0` | 非規範typo等。format + subject digest          |
| `R1` | deterministic gates + Reviewer 1回             |
| `R2` | 独立Reviewer + 変更した振る舞いのblack-box証拠 |
| `R3` | R2 + security等の専門観点 + rollback確認       |

新規または今回更新するL2/L3 reviewはstructured packetを使う。既存のmarkerなし文書は、
触らない限りlegacy監査ログとして有効。structured packetの完了条件は次のとおり。

- review subjectが現在差分と一致し、`stale`でない。
- open `BLOCK`が0。
- critical / highの未検証が0。
- stateが`human_review_requested`。これはAIの承認ではなく、人間への引き渡し状態。
- 人間項目が主観・不可逆・未知だけで3件以下。各項目に質問、推奨、証拠参照がある。
- 機械確認:
  `node .claude/scripts/review-readiness.mjs handoff-check --feature <feature> --base <base>`
  がexit 0。legacyのままでは成功しない。
- チャット/PRの第一面は`handoff-blurb`の出力（または同等の短文）とし、承認語を書かない。

AI作業の完了報告と、Gate Bでの人間のマージ受容を混同しない。マージ可否は人間がpacketと
残余リスクを読んで決める。セッション完了時のhard stopはclose-session / validate-deliverables（休眠のあいだはpacketを作ったfeatureだけ）。CIのreview-readinessは当面warning-only（ADR-0017）。

## 共通（全Level）

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

- 対象品質ゲート（最低`lint` / `type-check`）が成功。
- 簡易レビュー（reviewerか、このセッションの自己点検）完了。
- 変更理由を説明可能。
- 回帰影響を確認済み。
- 独立設計書・実装計画・ADRは**作らない**（過剰工程の禁止）。

## Level 2（通常変更）

- `docs/designs/<feature>.md` / `docs/implementation-plans/<feature>.md` /
  `docs/tests/<feature>.md`を作成・更新（必須セクション非空、対象外は「対象外」と明記）。
- `npm run lint`成功。
- `npm run type-check`成功。
- 必要に応じ`npm run build`成功。
- Unit/Integration test：`npm test`成功必須（変更パッケージの対応テスト追加を含む）。
- 独立Reviewerのopen `BLOCK`が0、critical / highの未検証が0。
- review文書をstructured packetで作成・更新した場合だけ、packetがcurrentで
  `handoff-check`が成功している（legacy不可）。`review-readiness`は`AGENTS.md`で休眠のため、packetを作らないL2は指摘と検証結果をPRと日次ログに残せばよい。
- 文書と実装が一致。

## Level 3（重要変更）

Level 2に加えて：

- `docs/requirements/<feature>.md`を作成・更新。
- 必要なADR（`docs/decisions/ADR-<番号>-<タイトル>.md`）を作成。
- 契約の後方互換性を確認（設計書のContract節に対しreviewerが確認）。
- データ移行・ロールバック手順を確認。
- セキュリティ確認（秘密情報・権限・入力検証）。
- 性能確認（明らかな劣化が無いか）。
- 異常系・部分失敗・冪等性を試験観点に含む。
- `review-readiness`が休眠のあいだは、レビュー指摘と検証結果をPRと日次ログに残す。packetを作った場合は`docs/reviews/<feature>.md`にcurrentなstructured packetとレビュー監査ログ。
- review tier `R3`のtriggerと、専門レビュー・rollbackの証拠を記録。
- 振り返り（`docs/claude-code/improvements/candidates/<task-id>.md`）は、改善サイクルが休眠のあいだは完了条件にしない。ユーザーが頼んだとき、このセッションが`reflect-task`で書く。

## 判定の原則

- 機械判定（ファイル存在・lint・type-check・JSON/YAML構文）はHook / スクリプトで確認。
- 意味的整合（要件充足・設計整合・テスト観点の十分性）は **reviewer** に委譲する
  （Hookだけで品質保証したと主張しない）。
- digestは対象の鮮度を検出するだけで、レビュー品質やClaude実行を証明しない。
- 小規模変更にLevel 3相当の工程を適用しない。
