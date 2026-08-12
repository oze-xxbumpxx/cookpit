# docs/reviews

feature 単位のレビュー記録（`<feature-name>.md`）を置く。ここは、現在の意思決定表示と詳細な
監査証跡の**単一の正典**であり、PR 本文へ全文を複製しない。

## 1 ファイルの構造

```markdown
# レビュー記録: <feature>

<!-- review-readiness:begin -->
<!-- prettier-ignore-start -->

<!-- review-readiness:state
{ ... schema v1 JSON ... }
-->

## Review handoff

...
<!-- prettier-ignore-end -->
<!-- review-readiness:end -->

## 監査ログ

## Task 1: ...

...
```

- marker 内: 最新 review subject に対する current state と、人間向けの短い packet。
- marker 外: Reviewer の指摘、処置、ゲート、実画面証拠を残す追記型監査ログ。
- Codex 委譲経路では `## Task N` 見出しを維持する。既存の Task coverage checker が照合する。
- marker は 1 組だけ置き、hidden JSON や表示 Markdown を手で別々に直さない。
- Prettier range-ignore は marker 内の契約の一部。削除すると formatter が表示を変えて drift する。

## 人間向け packet の読み方

表示順は固定する。人間は上から順に読み、必要ならだけ監査ログへ降りる。

1. 人間が判断・確認すること（主観・不可逆・未知だけ、最大 3 件）
2. 残余リスク・未確認
3. 振る舞い差分（最大 5 件）
4. claim と evidence の対応
5. 折り畳んだ AI assessment

`human_review_requested` は AI による承認ではなく、人間へ材料を渡せる状態を表す。
`ai_blocked` / `evidence_pending` は引き渡し前、`stale` は保存した subject と現在差分が異なる状態。
最終的なリスク受容とマージ判断は人間が行う。

目標は **60〜90 秒で判断を開始できること**。summary は原則 40 表示行以内
（要件 N-3）。長い監査ログを読ませない。

## 人間向け packet の書き方（Gate B）

Reviewer / Orchestrator が current packet を書くときの規範。監査ログの詳細さは維持し、
**先頭の handoff だけを意思決定 UI として薄く保つ**。

### 禁止語・禁止パターン

handoff と人間向け要約に次を使わない。

- `受け入れ可` / `PASS` / `APPROVED` / `マージ OK` / 成功を示唆する緑 banner
- Must / Should / Nice を人間 UI の主語彙にすること（監査ログ内部に閉じる）
- 固定チェックリストの再走査を人間へ求めること
- 誤検出 WARN や FOLLOW_UP 詳細を handoff 前面に並べること

open `BLOCK` や critical/high の未検証があるうちは `human_review_requested` にしない。

### 人間項目（最大 3）

`subjective` / `irreversible` / `unknown` のみ。AI が正誤を断言できる指摘はここに入れず、
`BLOCK`（手渡し前に解消）か `FOLLOW_UP`（監査ログ）へ送る。

各項目は schema どおり `question` / `recommendation` / `evidenceRefs` を埋める。

| kind | 入れるもの | 入れないもの |
| --- | --- | --- |
| `subjective` | UX 密度、コピートーン、トレードオフ受容 | lint 失敗、仕様不一致 |
| `irreversible` | 破壊的 API、migration、公開契約の確定 | すぐ戻せる UI 微調整 |
| `unknown` | 環境上ここまでしか確認できない受容判断 | ローカルで取れる証拠不足（それは `evidence_pending`） |

`question` は Yes/No または A/B で答えられる一文にする。「全体的に良さそう」は不可。
`recommendation` には推奨（accept / reject / accept_risk 等）と、なぜ AI では代替できないかを
短く含める。

### 残余リスク

行動不能な不安（「どこかにバグがあるかも」）は書かない。
**今回受容する未確認**だけを「何が未確認か / 今回どう扱うか」で書く（最大 5）。

### 振る舞い差分

利用者から見える変化だけを 1〜5 件。UseCase 追加や schema 変更などの実装日誌は監査ログへ。

### 証拠

人間項目と残余リスクの裏付けを優先する。claim は検証可能な一文。`fail` がある時点で
handoff しない。

### 行き先の早見

| 内容 | 行き先 |
| --- | --- |
| 正しさの欠陥・受け入れ不能 | `BLOCK`（手渡し前に解消） |
| 人間しか決められない今の判断 | `humanItems`（最大 3） |
| 今回止めない改善 | `FOLLOW_UP`（監査ログ、最大 3） |
| 未確認の飲み込み | 残余リスク |
| 検証済みの事実 | 証拠テーブル |
| 今回の差分外 | `PRE_EXISTING`（受け入れと分離） |

### handoff テンプレ（コピペ用イメージ）

```markdown
## Review handoff

> **人間レビュー待ちです。** これは承認ではありません。
> 対象: `sha256:…` / R2 / N changes

### あなたが判断・確認すること（K 件）

1. **[主観] …？** — 推奨: accept（…はプロダクト判断） / 証拠: EV-…
2. **[不可逆] …をこの PR で確定するか？** — 推奨: accept / 証拠: EV-…

### 残余リスク・未確認

- …は未確認。今回は accept_risk（次回 …）

### 振る舞い差分

- （利用者言語で 1〜5 件）

### 証拠

| ID | 主張 | 種別 | 結果 | 参照 |
| --- | --- | --- | --- | --- |
| EV-… | … | test / black_box / … | pass | … |
```

実生成は `review-readiness.mjs render` が行う。手書きで marker 内を個別編集しない。

## 生成と検証

スクリプトは read-only。対象差分を stage した後、assessment JSON を repository 外の一時
ファイルに置いて使う。

```bash
node .claude/scripts/review-readiness.mjs subject --feature <feature> --base <base>
node .claude/scripts/review-readiness.mjs render \
  --feature <feature> --base <base> --assessment <assessment-json>
node .claude/scripts/review-readiness.mjs check --feature <feature> --base <base>
# 人間引き渡し hard stop（legacy 不可）
node .claude/scripts/review-readiness.mjs handoff-check --feature <feature> --base <base>
# PR / チャット用の短文
node .claude/scripts/review-readiness.mjs handoff-blurb --feature <feature> --base <base>
```

`render` の stdout を Orchestrator が marker 間へ挿入する。当該 review 文書だけは digest から
除外されるが、要件・設計・テスト・`.claude`・`.github` を含む他の変更はすべて対象になる。
subject が変わったら packet を再生成する。

`check` / `render` は Gate B 文言を **warn** 検査する（禁止語、疑問形、recommendation の
行動語、振る舞い差分のプロセス言語）。warn だけでは handoff を止めないが、放置しない。

## 引き渡し強制（session hard stop）

「完了」「PR 準備完了」「人間レビュー待ち」と報告する前に `handoff-check` を通す。
接続先は Orchestrator / close-session / validate-deliverables / definition-of-done。
CI の review-readiness は当面 warning-only のまま（ADR-0017。strict 化は別タスク）。

## 次のプロダクト feature での実戦

harness 自身（`review-readiness`）以外の **次の L2/L3 プロダクト feature** では、必ず
structured packet を生成し `handoff-check` を通す。legacy 長文のまま Gate B へ渡さない。
これが採用ギャップを閉じる移行 SLA である。

## 既存文書と安全限界

- marker のない既存文書は legacy 監査ログとして保持し、一括変換しない。次に触る feature から
  current packet を追加する。
- digest は「この差分に対する記録」であることを検出する仕組みで、レビュー品質や Claude 実行、
  悪意ある改ざんを証明しない。branch protection と人間のマージ判断を置き換えない。
- 初期 CI は warning-only。blocking 化は試行実績とユーザー承認を要する別タスクとする。

schema、review tier、digest、移行条件の正典は
[`review-readiness` 設計](../designs/review-readiness.md) と
[`ADR-0017`](../decisions/ADR-0017-review-readiness-as-decision-interface.md)。
