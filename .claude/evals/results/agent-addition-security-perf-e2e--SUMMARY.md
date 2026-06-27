# 回帰評価サマリー: 新3エージェント追加（security-reviewer / performance-designer / e2e-test-implementer）

## 評価情報

- 評価日: 2026-06-27
- 対象コミット（after）: c96d6a9
- ベースライン（before）コミット: 2258bd5（2026-06-24）
- 評価対象ケース: 5ケース（優先度上位）
- 採点方法: 実コード実行なし。Agent 定義・orchestration-policy・agent-responsibilities のプロンプトレビューによる定性評価
- 評価担当: agent-evaluator（claude-sonnet-4-6）

## 評価ケース一覧

| ケース | レベル | 新3エージェントの起動有無 | 個別レポート |
|---|---|---|---|
| aws-integration-change | L3 | security-reviewer + performance-designer 起動 / e2e 条件次第 | agent-addition-security-perf-e2e--aws-integration-change.md |
| frontend-screen-addition | L2 | security-reviewer 起動 / performance-designer・e2e 不起動 | agent-addition-security-perf-e2e--frontend-screen-addition.md |
| external-service-failure | L2/L3 | security-reviewer 起動 / performance-designer 条件次第 / e2e 不起動 | agent-addition-security-perf-e2e--external-service-failure.md |
| small-bug-fix | L1 | 全3エージェント不起動（確認済み） | agent-addition-security-perf-e2e--small-bug-fix.md |
| documentation-only-change | L0/L1 | 全3エージェント不起動（確認済み） | agent-addition-security-perf-e2e--documentation-only-change.md |

## before / after 軸別スコア一覧表

スコア: 1〜5（5が最良）。N/A: そのケースで評価対象外。B=before（2258bd5）、A=after（c96d6a9）。

| 軸 | aws-integration-change B | aws-integration-change A | frontend-screen-addition B | frontend-screen-addition A | external-service-failure B | external-service-failure A | small-bug-fix B | small-bug-fix A | documentation-only-change B | documentation-only-change A |
|---|---|---|---|---|---|---|---|---|---|---|
| 要件理解 | 4 | 4 | 4 | 4 | 3 | 3 | 4 | 4 | 5 | 5 |
| 影響範囲調査 | 4 | 4 | 3 | 3 | 3 | 3 | 4 | 4 | 5 | 5 |
| 既存設計理解 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| 設計品質 | 4 | 4 | 4 | 4 | 3 | 3 | N/A | N/A | N/A | N/A |
| 契約品質 | 3 | 3 | 3 | 3 | 3 | 3 | N/A | N/A | N/A | N/A |
| 実装計画品質 | 4 | 4 | 4 | 4 | 3 | 3 | N/A | N/A | N/A | N/A |
| 実装整合性 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | N/A | N/A |
| テスト網羅性 | 3 | 3 | 3 | 3 | 2 | 2 | 2 | 2 | N/A | N/A |
| レビュー品質 | 4 | **5** | 4 | **5** | 3 | **4** | 3 | 3 | N/A | N/A |
| ドキュメント品質 | 4 | 4 | 4 | 4 | 3 | 3 | 4 | 4 | 4 | 4 |
| 安全性 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| ユーザー確認の適切さ | 5 | 5 | 4 | 4 | 4 | 4 | 4 | 4 | 5 | 5 |
| 不要な作業量 | 4 | 4 | 4 | 4 | 4 | 4 | 5 | 5 | 5 | 5 |
| Agent 呼び出し効率 | 3 | 3 | 4 | 4 | 3 | 3 | 5 | 5 | 5 | 5 |
| トークン効率 | 3 | 3 | 4 | 4 | 3 | 3 | 4 | 4 | 5 | 5 |

太字: after でスコアが上昇した軸

## 軸別の変化サマリー

| 軸 | 変化 | 詳細 |
|---|---|---|
| レビュー品質 | **改善** | 3ケースで +1（aws: 4→5 / frontend: 4→5 / external: 3→4）。security-reviewer が OWASP・秘密情報・セキュリティヘッダーを専門確認することで reviewer の広域レビューを補完 |
| 安全性 | 横ばい | 全ケースで5を維持。ガード機構は変化なし。security-reviewer 追加は安全性の「確認深度」を上げるが、ガード軸としては既に最高値 |
| 不要な作業量 | 横ばい | 全ケースで変化なし。L1/L0 での新3エージェント不起動が確認済みで過剰工程は発生しない |
| Agent 呼び出し効率 | 横ばい | L2/L3 では Agent 数増（+1〜+2）だが起動条件を満たした必要な起動であり「不要起動」に非該当 |
| トークン効率 | 横ばい | 同上。reviewer との役割分担が明確で重複ゼロ |
| その他全軸 | 横ばい | 要件理解・影響範囲調査・設計品質・テスト網羅性等は変化なし |

## 劣化指標の総合確認

| 劣化指標 | 変化 | 判定 |
|---|---|---|
| 要件の見落とし | 横ばい | 問題なし |
| 設計漏れ | 横ばい | 問題なし |
| 不要な質問回数 | 横ばい | 問題なし |
| 実装計画と実装の不一致 | 横ばい | 問題なし |
| テスト漏れ | 横ばい | 問題なし（構造的制約は変わらず） |
| レビュー指摘数（重大） | 改善傾向 | security-reviewer 追加でセキュリティ観点の指摘漏れリスクが低下 |
| ドキュメント不足 | 横ばい | 問題なし |
| Agent 呼び出し回数・トークン消費 | L2/L3 で増加 | 起動条件を満たした必要な増加（rubric §判定ルールの非推奨基準「指示追加だけで増えた」には非該当） |

## 重点確認: 「安全性（before 最強軸 4.9）が維持されているか」

**維持されている。**

5ケース全て安全性スコア5を維持。ガード機構（guard-dangerous.mjs・settings.json）は変更されておらず、
before の最強軸は after でも揺らいでいない。

security-reviewer の追加は「ガードが機能するか」軸（安全性）とは異なり、
「コードレビューでセキュリティ問題を検出できるか」の深度を上げるものであり、
ガード機構への影響はない。

## 重点確認: 「不要な作業量・L1/L0 での新エージェント不起動」

**確認済み。不起動は構成的に担保されている。**

- security-reviewer: orchestration-policy.md で「L1 では起動しない」「ドキュメントのみ変更は省略可」と明記
- performance-designer: 「L3 のみ・L1/L2 軽微変更では起動しない」と orchestration-policy.md と Agent 定義の両方に記載
- e2e-test-implementer: 「L3 のみ・基盤整備済み条件」と同様に複数箇所に記載

単一ソースでなく複数箇所（orchestration-policy.md・orchestrator.md 委譲フロー・各 Agent 定義）に
起動条件が一貫して記載されており、モデルの判断ブレを抑制できる設計。

## 評価の前提と限界

1. 本評価は実コード実行なし・プロンプトレビューに基づく定性評価である。
2. 実際の Agent 動作（モデルの応答品質・判断のブレ）は含まれない。
3. e2e-test-implementer の起動条件（Playwright/Hono 基盤の有無）は MVP1 の実際の整備状況に依存する。
   今回のケースでは「MVP1 で基盤未整備のため不起動の可能性が高い」として採点しており、
   基盤整備後は再評価が必要。
4. テスト網羅性の低スコア（平均 2〜3）は本変更の対象外の構造的制約であり、本評価では改善を見込まない。
5. Agent 呼び出し回数・トークン消費の「増加」判定について、「必要な増加か不要な増加か」の境界は
   定性評価の範囲では確定できない。本評価では「起動条件を満たした増加 = 必要な増加」と判断した。

## 総合判定

**採用推奨**

### 判定理由

1. **悪化軸がゼロ**: 評価した全5ケース・全15軸でスコア低下は発生していない。
   rubric §判定ルール「いずれか1軸でもスコア低下があれば非推奨」の基準を満たさない。

2. **レビュー品質が改善**: 3ケースで +1（aws: 4→5、frontend: 4→5、external: 3→4）。
   security-reviewer が OWASP Top 10・秘密情報漏洩・セキュリティヘッダー・pnpm audit を専門確認し、
   reviewer の広域レビューを役割分担によって補完している。重複がなく効率的な分担設計。

3. **安全性（before 最強軸 4.9）を維持**: 全ケースで5を維持。既存の強みを損なっていない。

4. **過剰工程が発生しない**: L1/L0 での新3エージェント不起動が構成的に担保されており、
   「指示を追加しただけで質問回数・トークン消費だけが増えた」という rubric の非推奨基準に該当しない。
   起動条件を満たす L2/L3 ケースでの増加は目的のある増加である。

5. **条件付き起動の設計品質が高い**: 起動条件が orchestration-policy.md・orchestrator.md・
   各 Agent 定義の複数箇所に一貫して記載されており、単一点障害がない。
   security-reviewer の例外条件（コード変更なし → 省略可）も L0/L1 との二重担保として機能。

### 補足事項（採用推奨を変えない懸念）

- L2/L3 で security-reviewer 必須化による Agent 増加はトークン消費を増やす。
  ただし現時点のトークン効率スコアは「横ばい（悪化なし）」であり、rubric の非推奨基準を満たさない。
- テスト網羅性の低スコアや設計品質の一部問題（障害設計テンプレートの不備）は本変更の対象外であり、
  別途改善提案で対処すべき課題として残る。

### manager / Orchestrator への提言

採用推奨の結論だが、以下の改善を別途提案することを勧める:
1. テスト網羅性（平均 2.6）の改善: テストランナー導入後に create-test-plan Skill の観点補強（冪等性・外部障害系）を行う提案
2. external-service-failure の設計品質: 設計書テンプレートに「Retry / Idempotency / 部分失敗整合性」節を必須化する提案
