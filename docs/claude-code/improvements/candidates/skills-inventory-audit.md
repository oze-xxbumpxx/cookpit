# 改善候補: skills-inventory-audit

> スキル棚卸し（第2回）+ 指示系横断棚卸し + ナレッジ整備のセッションからの振り返り。
> 設定は変更しない（本セッションの設定変更は個別に人間承認済み）。
> 昇格判断は [../../memory-policy.md](../../memory-policy.md) の昇格条件に従う。

- **task-id**: skills-inventory-audit
- **作成日**: 2026-07-02
- **対象タスク概要**: `.claude/skills/` 8件の6項目診断と実績還流（commit 8743e97 / b7ebf71）、
  指示系全体（CLAUDE.md / rules / agents / skills / docs/claude-code）の重複・食い違い・
  死記述の横断整理（commit c8ec43e）、logs/ 8件からのナレッジ抽出・永続化。
- **関連成果物**: 上記コミット / docs/06-ai-tools.md（Codex レビューチェックリスト）/
  docs/07-dev-rules.md（環境の既知の事実）

## 観測した事象

### 事象 1: 「現状」を書いた指示は必ず陳腐化する（8箇所で同時発生）

- **種類**: 食い違い（指示の鮮度切れ）
- **観測した事象**: テスト基盤の状態（「未導入」「Domain のみ導入」）を記述した指示が
  CLAUDE.md / implementer.md / coding-standards.md / definition-of-done.md /
  development-workflow.md / usage-guide.md / agent-responsibilities.md / 07-dev-rules.md の
  **8箇所**に分散し、2026-07-01 の全層導入（PR #21）後もすべて古いまま残っていた。
  implementer.md は「application 等はテスト観点を計画に残す（実装しない）」と読める状態で、
  次の実装タスクで実害が出る直前だった。
- **発生回数**: 1回（ただし同一原因で8箇所同時）
- **原因仮説**: 環境の「現状」を複数文書に直接書き込むと、状態が変わったとき全箇所の
  更新が必要になるが、更新責務がどこにも定義されていない。
- **改善案**: (a) 環境状態を書くときは日付・出典（PR/commit）を併記する（今回の修正で適用済み。
  検索で古い記述を発見しやすくなる）。(b) 基盤状態が変わるタスクの実装計画の
  「ドキュメント更新対象」に、状態を記述している全ファイルの grep 確認を含める。
- **変更対象**: (b) は create-implementation-plan Skill への追記候補（再発時に昇格検討）
- **昇格判定**: Memory 留め（横断観測として1回目）。同種の鮮度切れが再発したら (b) を昇格。

### 事象 2: 委譲フローの定義が5文書に重複し、それぞれ食い違っていた

- **種類**: 食い違い（重複記載の分岐）
- **観測した事象**: L2/L3 の委譲フローが orchestrator.md / orchestration-policy.md /
  development-workflow.md / usage-guide.md / classify-change Skill の5箇所に書かれ、
  contract-designer・security-reviewer・reflection-agent の有無、requirements-analyst の
  L2 起動条件がばらばらだった。orchestration-policy は同一ファイル内で「必須起動」と
  定めながらフロー図に載せない自己矛盾もあった。
- **発生回数**: 1回（5文書）
- **原因仮説**: IMP-2026-006（Agent 3種追加）の適用時に、フローを記載した全文書へ
  反映されなかった。改善適用時の「反映先チェックリスト」が無い。
- **改善案**: 改善 proposal のテンプレートに「同じ内容を記載している他文書の一覧と更新要否」
  欄を設ける（proposals/\_TEMPLATE.md への追記候補）。
- **昇格判定**: Memory 留め（1回目）。次の改善適用で同様の反映漏れが出たら昇格。

### 事象 3: Codex 実装の頻出ミスが昇格条件を満たしていた（→ 06-ai-tools へ反映済み）

- **種類**: 昇格（同種問題3回以上）
- **観測した事象**: 識別子タイポ・Tailwind クラスタイポ・結線漏れ・`'use client'` 漏れ等が
  logs/2026-05-16 / 05-17 / 06-06 / 06-16 の**4セッションで反復**していたが、
  チェックリストとしては永続化されておらず、06-ai-tools.md に1行の要約があるのみだった。
- **対応**: memory-policy の昇格条件（同じ問題が3回以上）を満たすため、
  docs/06-ai-tools.md にレビューチェックリスト（8項目・出典つき）として反映（2026-07-02）。
- **昇格判定**: 昇格済み（docs への反映。保護ファイル変更なし）。

### 事象 4: ログ内の知識に「賞味期限切れ」が混在（--webpack 必須）

- **種類**: 誤情報リスク
- **観測した事象**: 「`pnpm dev` は `--webpack` 必須」が logs 3件に記録されているが、
  2026-06-26 の next.config.ts 修正（473ad09）で解消済み。ナレッジ抽出時にそのまま
  拾うと誤った知識を定着させるところだった。
- **対応**: docs/07-dev-rules.md「環境の既知の事実」に**打ち消し情報として**記録
  （「古いログの記述はここが優先」の原則つき）。
- **昇格判定**: 対応済み。教訓: ログからの還流時は現行コード・直近コミットで裏取りする。

## 新スキル候補（2026-07-02 人間承認済み → 作成完了）

1. **write-work-log**: logs/YYYY-MM-DD.md 作成手順（実績8件・\_template.md 既存）。
2. **audit-skills**: スキル・指示系棚卸しの手順（本日2回実施。ユーザー依頼文が手順原型）。
3. **manual-browser-verify**: 画面手動確認の手順（`pnpm dev` 素起動可 / リモートは
   DB BLOCKED を明記 等の環境知識込み。実績: logs/2026-06-24・06-26）。

→ 3 件とも `.claude/skills/` に作成済み（人間承認あり・同日コミット）。

## 追記（2026-07-02・第3回 = document-reviewer による独立検証）

新設した document-reviewer をセッション変更文書 30 件に初適用した結果、**人手（メイン
セッション）の棚卸し 2 回が見逃した Must 2 件を検出**した。

- M-1: CLAUDE.md「`Agent` を持つのは Orchestrator のみ」— reviewer /
  agent-improvement-manager の frontmatter と矛盾する事実誤り（修正済み）
- M-2: docs/README.md 冒頭の表に `docs/adr/` デッドリンクが残存 — 8743e97 は同ファイル
  下部のリンクのみ修正し、表の行を見落としていた（修正済み）
- Should 3 件（Rules 件数 4→3 / モデル割り当て表の 5 Agent 欠落 / orchestration-policy
  冒頭の「Orchestrator だけ」自己矛盾）・Nice 3 件も修正済み。

**知見**: 同一ファイル内の同種記述（リンク・数値）は 1 箇所直しても他が残る
（M-2 の型）。修正時は「同ファイル内の同種参照を grep してから閉じる」こと。
独立レビュアー（コールドスタート）は作業者本人のバイアス（自分が直した箇所は
確認済みと思い込む）を補正できることが実証された。

## まとめ

- 昇格して反映したもの: 事象 3（Codex チェックリスト → 06-ai-tools）、
  事象 4（環境の既知の事実 → 07-dev-rules）
- Memory 留め（再発監視）: 事象 1（現状記述の陳腐化）、事象 2（改善適用時の反映先漏れ）
- 人間承認済み・実施済み（2026-07-02）: 新スキル3件の作成、レガシー計画文書2件
  （.claude/docs/）の ARCHIVED 注記追加
