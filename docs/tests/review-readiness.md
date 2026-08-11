# 試験計画: review-readiness

- 前提: `docs/designs/review-readiness.md`
- レベル: L3
- 自動試験: `.claude/tests/review-readiness.test.mjs`（Node 標準 `node:test`）

## 1. Public API 網羅

script から export する pure function を直接試験する。

| API                   | 観点                                         |
| --------------------- | -------------------------------------------- |
| `validateFeatureName` | kebab-case、空、path traversal               |
| `validateAssessment`  | schema、enum、count、ID、evidence ref、上限  |
| `deriveStatus`        | blocker / unverified / human budget / normal |
| `computeSubject`      | index / commit、raw bytes、base、除外        |
| `renderPacket`        | 表示順、escape、AI 非承認表現、marker        |
| `parseReviewState`    | 正常、legacy、壊れた JSON、重複 marker       |
| `checkReview`         | schema、feature、Task coverage、stale        |

## 2. Digest 正常系

| ID   | 操作                                         | 期待                               |
| ---- | -------------------------------------------- | ---------------------------------- |
| D-01 | 一時 repo で staged file を subject 化       | full SHA-256 と entry count を返す |
| D-02 | 同じ index を再計算                          | 同じ digest                        |
| D-03 | staged 内容を commit して commit mode で計算 | index mode と同じ digest           |
| D-04 | review 文書だけ変更                          | digest 不変                        |

## 3. Digest 異常・境界

| ID   | 操作                              | 期待                                       |
| ---- | --------------------------------- | ------------------------------------------ |
| D-11 | 同じ path の内容だけ変更          | digest が変わる                            |
| D-12 | executable bit 変更               | digest が変わる                            |
| D-13 | file 追加 / 削除                  | digest が変わる                            |
| D-14 | base commit を変更                | digest が変わる                            |
| D-15 | 存在しない base                   | remediation 付き error                     |
| D-16 | 不正 feature `../x`               | Git 実行前に拒否                           |
| D-17 | binary / symlink / gitlink を追加 | 各 index metadata の変化で digest が変わる |

## 4. Schema

| ID   | 入力                                     | 期待                |
| ---- | ---------------------------------------- | ------------------- |
| S-01 | 最小の有効 assessment                    | error 0             |
| S-02 | 未知 reviewTier / kind / evidence result | error               |
| S-03 | count が負数・小数                       | error               |
| S-04 | human / evidence ID 重複                 | error               |
| S-05 | evidenceRefs が存在しない                | error               |
| S-06 | behavior 6 件                            | 1 画面 budget error |
| S-07 | marker 文字列を含む user text            | injection error     |

## 5. Status と人間 budget

| ID   | 条件                         | 期待                                                        |
| ---- | ---------------------------- | ----------------------------------------------------------- |
| H-01 | blocker 1                    | `ai_blocked`                                                |
| H-02 | high impact unverified 1     | `evidence_pending`                                          |
| H-03 | 人間項目 0〜3、他 0          | `human_review_requested`                                    |
| H-04 | 人間項目 4                   | `evidence_pending`、通常 handoff を出さない、4 件を隠さない |
| H-05 | evidence fail かつ blocker 0 | schema contradiction を検出                                 |

## 6. 表示と認知負荷

| ID   | 観点            | 期待                                        |
| ---- | --------------- | ------------------------------------------- |
| U-01 | 順序            | human → residual → behavior → evidence → AI |
| U-02 | automation bias | `PASS` / `APPROVED` / `READY` を含まない    |
| U-03 | HTML            | `<script>` 等を escape                      |
| U-04 | AI assessment   | `<details>` 内に置く                        |
| U-05 | human 0         | 承認済みでなく「追加判断なし」と表示        |
| U-06 | formatter       | Prettier range-ignore が marker 内を覆う    |

## 7. Review parser / checker

| ID   | 条件                            | 期待                                    |
| ---- | ------------------------------- | --------------------------------------- |
| C-01 | marker 1 個 + valid JSON        | state を取得                            |
| C-02 | marker なし                     | legacy                                  |
| C-03 | marker 重複                     | invalid                                 |
| C-04 | JSON 不正                       | invalid、stack trace を人間へ要求しない |
| C-05 | 保存 digest と現在 digest不一致 | `stale`                                 |
| C-06 | brief Task 見出し不足           | uncovered Task を維持して報告           |

## 8. CLI / CI

| ID      | 条件                               | 期待                        |
| ------- | ---------------------------------- | --------------------------- |
| CLI-01  | `subject` 引数不足                 | usage、exit 2               |
| CLI-01b | 未知 / 重複 option                 | usage、exit 2               |
| CLI-02  | `render` valid assessment          | marker Markdown、exit 0     |
| CLI-03  | `check` stale                      | exit 1                      |
| CLI-04  | `ci --mode warn` invalid review    | warning、exit 0             |
| CLI-05  | `ci --mode strict` invalid review  | exit 1                      |
| CLI-06  | changed review なし                | 短い info、exit 0           |
| CLI-07  | changed L2/L3 成果物に review なし | warning は 0、strict は非 0 |

## 9. 回帰・整合

| ID   | 観点                        | 期待                                                       |
| ---- | --------------------------- | ---------------------------------------------------------- |
| R-01 | `pnpm test:harness`         | 既存を含め全 PASS                                          |
| R-02 | `check-review-coverage.mjs` | export / CLI / Stop Hook の挙動不変                        |
| R-03 | CI                          | job 数、install、E2E の no-skipped-green を維持            |
| R-04 | plugin manifest             | workflow +3、improvement -1、総数 +2、未分類 0             |
| R-05 | 依存                        | package.json / lockfile 無変更                             |
| R-06 | L3 closure                  | audit 確定後の final review と review 生成後の digest 不変 |

## 10. セキュリティ

| ID     | 観点            | 期待                                                  |
| ------ | --------------- | ----------------------------------------------------- |
| SEC-01 | Git 呼び出し    | shell を使わず引数配列                                |
| SEC-02 | feature         | path traversal 不可                                   |
| SEC-03 | assessment text | Markdown / marker injection 不可                      |
| SEC-04 | CI              | write permission / `pull_request_target` を追加しない |

## 11. 対象外

- Claude の意味レビュー精度そのものの自動証明
- 悪意ある maintainer による state / CI 改ざん防止
- アプリ Vitest / Playwright の追加
- CI strict 化

## 完了条件

- D / S / H / U / C / CLI / R / SEC の必須観点が PASS。
- 未実装観点を「対象外」なしで成功扱いにしない。
- Claude Code Reviewer が試験計画と実装の対応を確認する。
