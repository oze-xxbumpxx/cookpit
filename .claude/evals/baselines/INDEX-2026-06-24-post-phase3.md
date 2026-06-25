# ベースラインスコア INDEX（post-Phase3）

## スナップショット情報

- branch: claude/continuation-from-yesterday-t0g1sz
- commit: 89003b8
- date: 2026-06-25
- 位置づけ: Phase 2/3 完了後の全軸一括再採点。IMP-2026-001（create-test-plan 改善）・
  IMP-2026-002（Stop フックデバウンス）適用後の現構成を絶対採点した新ベースライン。
  元 INDEX.md（commit 2258bd5、2026-06-24）は pre-Phase2/3 のスナップショットとして残す。
  IMP-2026-001 申し送り「Phase 3 完了後に全軸を一括再採点」の実行。
- 採点方法: 実コード実行なし。Agent 定義・Skill・Rule・Hook・CLAUDE.md・設計ドキュメントの
  プロンプトレビューに基づく定性評価。before/after 比較ではなく「現構成での絶対採点」。

---

## 構成変更サマリ（元 INDEX.md との差分）

| 変更 | 内容 | 主な影響軸 |
| --- | --- | --- |
| Vitest 導入（domain 層） | domain co-located 単体テスト 29 本 green。`turbo test` / `pnpm test` ゲート既定。 | テスト網羅性（domain 層）/ 実装整合性 |
| IMP-2026-001（accepted） | create-test-plan Skill に観点(4)冪等性・(5)障害系・(6)FE 固有と「観点の選択基準」表を追加 | テスト網羅性 |
| IMP-2026-002（accepted） | Stop フック 2 本に変更検知デバウンス追加（30 分クールダウン・ハッシュ比較） | トークン効率 / Agent 呼び出し効率 |
| `@types/node` 追加 | `@cookpit/application` の type-check 修正 | 実装整合性（軽微） |
| commit/push governance 緩和 | 指定作業ブランチへの commit/push を事前承認なしで可に（明文化） | ユーザー確認の適切さ（軽微） |

---

## 採点上の前提と限界

1. **定性評価のみ**: 実コード実行・実 Agent 起動なし。Agent 定義・Skill・Rule・Hook・
   CLAUDE.md のプロンプトレビューに基づく推論。実際のモデル応答品質・判断のブレは
   評価に含まれない。
2. **テストランナーの適用範囲**:
   - domain 層（`packages/domain`）: Vitest 導入済み・co-located テスト 29 本 green。
   - application / infrastructure / apps/web: テストランナー未展開。domain 以外では
     「観点の設計」はできるが「テストの実行」はできない。
   - この非対称性から、domain 層の変更を含むケースと含まないケースで採点の根拠の
     強さが異なる。domain 以外の実行保証がない点を過大評価しないこと。
3. **implementer.md の記述乖離**: CLAUDE.md は「Vitest 導入済み・Domain 層は co-located
   テスト変更時は追加・実行」と記述しているが、implementer.md の担当セクションには
   「現状 MVP1 はテストランナー未導入」という旧記述が残っている。運用上は CLAUDE.md が
   正典だが、implementer が両定義を読んだ場合に混乱する可能性を潜在的リスクとして
   記録しておく。採点では CLAUDE.md を正典とし、domain 層のテスト実行は可能として
   採点した。
4. **スコアの単一評価性**: 同一ケースを複数回実行した平均ではなく、構成から推定した
   一点評価。推定誤差が ±0.5 程度含まれうる。

---

## 9ケース × 15軸 スコア一覧表

スコア: 1〜5（5 が最良）。N/A: そのケースで評価対象外の軸。

| 軸 | small-bug-fix (L1) | api-field-addition (L2) | database-schema-change (L3) | frontend-screen-addition (L2) | aws-integration-change (L3) | refactoring (L2) | contract-validation-change (L3) | external-service-failure (L3) | documentation-only-change (L0/L1) |
|---|---|---|---|---|---|---|---|---|---|
| 要件理解 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | 5 |
| 影響範囲調査 | 4 | 3 | 4 | 3 | 4 | 3 | 4 | 3 | 5 |
| 既存設計理解 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| 設計品質 | N/A | 4 | 4 | 4 | 4 | 4 | 4 | 3 | N/A |
| 契約品質 | N/A | 3 | 3 | 3 | 3 | 4 | 5 | 3 | N/A |
| 実装計画品質 | N/A | 4 | 4 | 4 | 4 | 4 | 4 | 3 | N/A |
| 実装整合性 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | N/A |
| テスト網羅性 | 2 | 3 | 3 | 4 | 3 | 3 | 3 | 4 | N/A |
| レビュー品質 | 3 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | N/A |
| ドキュメント品質 | 4 | 4 | 5 | 4 | 4 | 4 | 4 | 3 | 4 |
| 安全性 | 5 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 5 |
| ユーザー確認の適切さ | 4 | 4 | 5 | 4 | 5 | 4 | 5 | 4 | 5 |
| 不要な作業量 | 5 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 5 |
| Agent 呼び出し効率 | 5 | 4 | 3 | 4 | 3 | 4 | 3 | 3 | 5 |
| トークン効率 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | 5 |

---

## 採点根拠（元 INDEX.md から変動した軸の詳細）

### テスト網羅性

元 INDEX.md からの変動が最も大きい軸。ケースごとの根拠を示す。

**small-bug-fix (L1): 2 → 2（変化なし）**
L1 では create-test-plan の「観点の選択基準」で (4)(5)(6) が「原則対象外」と明示された。
domain 純粋ロジック行でも (5)(6) は「対象外」。Vitest が domain に入ったことで実行基盤は
あるが、L1 の最小修正ではテスト追加よりバグ修正が核心であり、implementer の担当に
「必要な単体テストの作成」が含まれるものの L1 試験計画は作られない構成。スコア変化なし。

**api-field-addition (L2): 3 → 3（変化なし）**
Domain / Application 層の変更を含む。Vitest が domain に導入されたことで implementer が
domain テストを実行可能になった点はプラスだが、application / infrastructure 層はテストランナー
未展開のため全層の実行保証がない。create-test-plan 改善は境界値（0・負値・上限）観点の
明示化には効くが、冪等性(4)は「書き込み系 UseCase」として任意、障害系(5)は「外部 I/O」
が主眼であり api-field-addition の核心ではない。Vitest 導入の恩恵は部分的。スコア変化なし。

**database-schema-change (L3): 3 → 3（変化なし）**
状態遷移（Domain）・マイグレーション（Infrastructure）・データ移行（運用）を含む。
domain テストは実行可能になったが、DB マイグレーション検証・データ移行の結合テストは
infrastructure / apps の範疇でランナー未展開。create-test-plan 改善は冪等性(4)（書き込み
UseCase で必須）が追加されたことでプラスだが、障害系(5)は DB は「外部 I/O 以外」の扱い
で任意。スコア変化なし。

**frontend-screen-addition (L2): 3 → 4（+1）**
create-test-plan の FE 固有観点(6)が「必須」と明示された（Presentation / apps/web 行）。
ローディング・エラー表示・楽観的更新ロールバックが試験計画に含まれる構造的保証が
できた。これは前ベースラインで「観点が薄い」と判定した直接の原因への対処であり、
スコアを 1 上げる根拠として十分。ただし apps/web のテストランナーは未展開なので
「観点設計はできる・実行はできない」。それでも計画品質の向上としてスコア 4 が妥当。

**aws-integration-change (L3): 3 → 3（変化なし）**
外部 API/ストレージ（Infrastructure）を含む L3 ケース。create-test-plan 改善で
障害系(5)・冪等性(4)が Infrastructure 行で「必須」と明示された。前ベースラインでスコア 3
は「正常系は設計できるが異常系・冪等性が不明確」が主因だった。改善後は Skill が
構造的に誘導する。ただし infrastructure のテストランナー未展開のため実行保証なし。
+1 の根拠としては Skill の明示化が有効だが、実行不可の限界を考慮してスコア 3 を維持。
（IMP-2026-001 評価での external-service-failure: 2→4 と異なり、aws-integration-change は
L3 フルフローのコスト面の重さもあり、テスト以外の軸がトータルに効いてくるため）

> 補足: IMP-2026-001 回帰評価（evaluations/IMP-2026-001.md）では external-service-failure の
> テスト網羅性を before:2 → after:4 としている。本ベースラインでは external-service-failure を
> 現構成の絶対採点（4）として扱い、この値を採用した。

**refactoring (L2): 2 → 3（+1）**
IMP-2026-001 回帰評価の結論どおり。「L2/L3 リファクタ（振る舞い不変）→ 回帰観点最優先」
が選択基準に明示され、試験計画の焦点が回帰確認に集中する構造的な後押しを得た。
ただし application 層のテストランナー未展開のため完全な回帰テスト実行は保証できない。
Vitest が domain に入ったことで domain 部分の回帰確認は可能。スコア 3 が妥当。

**contract-validation-change (L3): 3 → 3（変化なし）**
Zod スキーマ・Domain バリデーション・後方互換テストが核心。create-test-plan 改善で
冪等性(4)（書き込み系 UseCase）・障害系(5)（外部 I/O があれば）が追加されたが、
このケースの核心は「契約の境界テスト（最大長±1・enum 外・未指定）・後方互換の回帰」
であり、それは元 Skill の「正常系・異常系・境界値」の範疇。改善の恩恵は限定的。
application / api-contract 層のランナー未展開も継続。スコア変化なし。

**external-service-failure (L3): 2 → 4（+2）**
IMP-2026-001 回帰評価の結論どおり。障害系(5)・冪等性(4)が Skill で「必須」と明示され
（Infrastructure 行）、試験計画が構造的に網羅されるようになった。スコア 4 を採用。

**documentation-only-change (L0/L1): N/A（テスト観点なし・変化なし）**

### トークン効率

元 INDEX.md からの変動軸。IMP-2026-002 の Stop フックデバウンスによる効果。

**変化のあるケース（L3 系）: 3 → 4**

database-schema-change / aws-integration-change / contract-validation-change / refactoring の
4 ケースで元 INDEX.md スコアが 3 だったが、現構成では 4 に改善と評価した。根拠：

Stop フックが L2/L3 の多段 Agent 進行中に毎ターン同一警告を繰り返す問題（IMP-2026-002 の
背景事象）が解消された。reflection-agent を含む L3 フルフロー（6 Agent）では途中ターンで
Stop が頻発し、トークン浪費が顕著だった。デバウンス（同一警告セット + 30 分クールダウン
で沈黙）により警告コンテキストの反復消費が排除された。反復警告は実害（トークン浪費と
重要シグナルの埋没）として IMP-2026-002 で実測確認済み。

ただし L3 の本質的なコスト（全 Agent フルフロー）は変わらないため、スコアは 3 → 4（改善）
にとどまり 5 には届かない。Agent 定義の削減・工程の省略なしにトークン効率 5 は困難。

**変化しないケース（L1・L2 軽量）:**
small-bug-fix (4→4), api-field-addition (4→4), frontend-screen-addition (4→4),
documentation-only-change (5→5) は元スコアが高く変化なし。L2 は Stop フック発火回数が
L3 より少ないため改善幅が小さく、現状維持として扱った。

**external-service-failure (L3): 3 → 3（変化なし）**
IMP-2026-002 の効果はあるが、このケースは「外部連携未導入のため設計・レビュー観点の
質を採点」という定性評価モードのため、Agent 呼び出しフローが L3 フルフローより軽い
可能性がある。また元スコア 3 の主因は「L3 全 Agent 起動と reflection-agent の必須」で
あり、デバウンスだけでは 4 への引き上げ根拠が弱い。変化なしとした。

### Agent 呼び出し効率

IMP-2026-002 は Stop フックのノイズ抑制であり、Agent 呼び出し回数そのものは変わらない。
Agent 呼び出し効率は元 INDEX.md スコアと同値を維持する。

### その他の軸（変化なし）

要件理解・影響範囲調査・既存設計理解・設計品質・契約品質・実装計画品質・実装整合性・
レビュー品質・ドキュメント品質・安全性・ユーザー確認の適切さ・不要な作業量は、
今回の構成変更（Vitest 導入・Skill 改善・Hook デバウンス）が直接影響しない軸のため
元 INDEX.md スコアを据え置く。

---

## 軸別平均スコア（N/A 除く）

| 軸 | 現構成平均（post-Phase3） | 元 INDEX.md 平均 | 差分 (delta) | ケース数 |
|---|---|---|---|---|
| 安全性 | 4.9 | 4.9 | 0.0 | 9 |
| ユーザー確認の適切さ | 4.4 | 4.4 | 0.0 | 9 |
| 不要な作業量 | 4.2 | 4.2 | 0.0 | 9 |
| 既存設計理解 | 4.0 | 4.0 | 0.0 | 9 |
| 実装整合性 | 4.0 | 4.0 | 0.0 | 7 |
| ドキュメント品質 | 4.0 | 4.0 | 0.0 | 9 |
| 設計品質 | 3.9 | 3.9 | 0.0 | 7 |
| 要件理解 | 4.0 | 4.0 | 0.0 | 9 |
| 実装計画品質 | 3.7 | 3.7 | 0.0 | 7 |
| レビュー品質 | 3.7 | 3.7 | 0.0 | 8 |
| Agent 呼び出し効率 | 3.8 | 3.8 | 0.0 | 9 |
| 影響範囲調査 | 3.7 | 3.7 | 0.0 | 9 |
| トークン効率 | 4.0 | 3.7 | **+0.3** | 9 |
| テスト網羅性 | 3.1 | 2.6 | **+0.5** | 8 |
| 契約品質 | 3.4 | 3.4 | 0.0 | 7 |

> トークン効率の平均計算:
> post-Phase3: (4+4+4+4+4+4+4+3+5) = 36 / 9 = 4.0
> 元 INDEX.md: (4+4+3+4+3+4+3+3+5) = 33 / 9 = 3.67 ≈ 3.7 → delta +0.3

---

## 元 INDEX.md との差分サマリ

### 軸別 delta（変動あり）

| 軸 | 元 INDEX.md 平均 | post-Phase3 平均 | delta | 主因 |
|---|---|---|---|---|
| テスト網羅性 | 2.6 | 3.1 | **+0.5** | IMP-2026-001（create-test-plan Skill 改善）+ Vitest 導入 |
| トークン効率 | 3.7 | 4.0 | **+0.3** | IMP-2026-002（Stop フックデバウンス） |

### ケース別 テスト網羅性 delta

| ケース | 元スコア | 新スコア | delta | 主因 |
|---|---|---|---|---|
| small-bug-fix | 2 | 2 | 0 | L1 は観点「原則対象外」・変化なし |
| api-field-addition | 3 | 3 | 0 | application/infra ランナー未展開で変化なし |
| database-schema-change | 3 | 3 | 0 | 同上 |
| frontend-screen-addition | 3 | 4 | **+1** | FE 固有観点(6)が Skill で「必須」に |
| aws-integration-change | 3 | 3 | 0 | Skill 改善あるが infra ランナー未展開で維持 |
| refactoring | 2 | 3 | **+1** | 「回帰観点最優先」が選択基準に明示 |
| contract-validation-change | 3 | 3 | 0 | 改善の恩恵が限定的 |
| external-service-failure | 2 | 4 | **+2** | 障害系(5)・冪等性(4)が Skill で「必須」に |
| documentation-only-change | N/A | N/A | 0 | 対象外 |

### ケース別 トークン効率 delta

| ケース | 元スコア | 新スコア | delta | 主因 |
|---|---|---|---|---|
| small-bug-fix | 4 | 4 | 0 | L1 は元々低コスト |
| api-field-addition | 4 | 4 | 0 | L2 は Stop 発火回数が少なく変化小 |
| database-schema-change | 3 | 4 | **+1** | Stop デバウンスで L3 反復警告を抑制 |
| frontend-screen-addition | 4 | 4 | 0 | L2 は元々 4 で変化なし |
| aws-integration-change | 3 | 4 | **+1** | 同上（L3） |
| refactoring | 4 | 4 | 0 | L2 は元々 4 で変化なし |
| contract-validation-change | 3 | 4 | **+1** | L3 反復警告抑制 |
| external-service-failure | 3 | 3 | 0 | 外部連携未導入・設計モードのため効果限定 |
| documentation-only-change | 5 | 5 | 0 | L0/L1 は元々最大スコア |

---

## 全体傾向（現構成）

### 強い軸（上位 3）

**1. 安全性（平均 4.9）**
guard-dangerous.mjs（PreToolUse）と settings.json の deny リストが二層で機能し、
秘密情報・破壊的操作・本番デプロイのガードが全ケースで有効。変化なし。

**2. ユーザー確認の適切さ（平均 4.4）**
CLAUDE.md・orchestrator・各 Subagent・architecture-designer・contract-designer の
複数箇所で「設計判断・後方互換・DB スキーマは確認が必要」と明文化。L3 ケースで
一貫してスコア 5 を維持。commit/push governance 明文化で確認の適切さが微細に
向上したが、平均への影響なし。変化なし。

**3. 不要な作業量（平均 4.2）**
L1/L0 の過剰工程抑制が classify-change Skill と orchestrator で明示。変化なし。

### 弱い軸（改善後も残る課題）

**1. テスト網羅性（平均 3.1 → 改善後も最弱）**
元 INDEX.md の 2.6 から 3.1 へ改善した。しかし依然として最弱軸。構造的制約が残る：
- domain 以外（application / infrastructure / apps/web）のテストランナーが未展開のため、
  観点設計はできるが実行保証がない。
- implementer.md の「現状 MVP1 はテストランナー未導入」という記述が旧状態のまま残り、
  CLAUDE.md との乖離が潜在的リスク。
- small-bug-fix・database-schema-change・api-field-addition・aws-integration-change・
  contract-validation-change の 5 ケースでスコア 2〜3 が残る。

**2. 契約品質（平均 3.4）**
contract-designer 起動条件が orchestrator の判断に依存しており、L2 の API フィールド追加で
必ず起動するかが不明確な状態が継続。api-field-addition (3)・database-schema-change (3)・
frontend-screen-addition (3)・aws-integration-change (3) で 3 止まり。変化なし。

**3. 影響範囲調査（平均 3.7）/ レビュー品質（平均 3.7）**
- 影響範囲調査: L2 では requirements-analyst が任意で、具体パス洗い出しを強制する仕組みが弱い。
- レビュー品質: reviewer 定義に障害設計固有観点（リトライ嵐・冪等性欠如）が不足。
  L3 の external-service-failure でスコア 3 にとどまる。変化なし。

### 今後の弱点優先順位

1. **テスト網羅性**: application / infrastructure / apps/web へのテストランナー展開が
   根本解決。domain 以外で 3→4 以上を目指すには実行基盤が必要。
   次のアクション候補: application 層への Vitest 展開（別タスク）。
   implementer.md の旧記述（「テストランナー未導入」）修正も低コストで実施可。
2. **契約品質（3.4）**: contract-designer の起動条件を orchestration-policy.md で
   明示化する（人間承認必須領域のため proposal 必要）。
3. **レビュー品質（3.7）**: reviewer に障害設計固有の観点（リトライ嵐・冪等性欠如）を
   追加する（Skill 追加 or reviewer.md 改善 → manager レビュー後可）。

---

## 採点の前提・限界（再確認）

- 本採点は実コード実行なし。定性評価のみ。モデルの実際の動作は含まれない。
- Vitest 導入（domain 層）はスコア根拠に使ったが「テストが通る」事実は commit の green 状態
  の記述に依拠しており、本セッションでの再実行確認は行っていない。
- テスト網羅性の「domain 以外はランナー未展開」という限界は各ケースで明示的に考慮した。
  domain 固有ケースと他層が混在するケースでは採点根拠の強さが異なる。
- IMP-2026-002（Stop フックデバウンス）のトークン効率改善は、実際の反復抑制効果を
  IMP-2026-002 の試験結果（初回出力・連打沈黙・状態変化で再掲・未設定沈黙）に依拠した。
  実運用での削減量は L3 タスクの具体的な Agent 数・ターン数に依存するため定量化できない。
- スコアは 1 点単位の離散値であり、0.5 点の改善が反映しにくい。特にテスト網羅性は
  「観点がある ≠ テストが通る」という質的な差が 4→5 の違いとして捉えにくい。
