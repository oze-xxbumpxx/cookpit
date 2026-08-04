# レビュー記録: harness-plugin-split（L3 / ハーネスの Plugin 3 層分割）

- 日付: 2026-07-31
- 対象: 要件定義書 / 設計書 / ADR-0014 / 実装計画 / 試験計画 / 実装 / 層マニフェスト
- 関連: `docs/designs/harness-plugin-split.md` /
  `docs/decisions/ADR-0014-harness-plugin-three-layer-split.md` /
  `docs/claude-code/plugin-layer-manifest.md`
- レビュー実施: メインセッション（Orchestrator 役）が実施。本セッションでは Subagent 委譲を
  行わない制約があったため reviewer Agent には委譲していない。**この点は独立性の弱みとして
  明記する**（自己レビューであり、reviewer による第三者確認は PR レビューに委ねる）。

## 結論

Must 1 件を**レビュー中に検出し修正済み**。Should 3 件・Nice 2 件を申し送る。

## 品質ゲート（独立に再現）

| ゲート              | 結果                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:harness` | PASS（67 件 / fail 0）                                                                                                                |
| `pnpm lint`         | PASS（0 errors。警告 1 件は `product-form-fields.test.tsx` の既存分）                                                                 |
| `pnpm type-check`   | PASS                                                                                                                                  |
| `pnpm build`        | PASS                                                                                                                                  |
| `pnpm test`         | PASS                                                                                                                                  |
| `format-check`      | FAIL 3 件。`git stash` で HEAD 時点でも同一と確認した既存 FAIL（`accepted/` と `archive/` 配下 = 歴史的ドキュメントのため対象外方針） |

## 要件・設計・実装・試験の整合性

| 要件 | 実装                                                                         | 検証                          |
| ---- | ---------------------------------------------------------------------------- | ----------------------------- |
| F-1  | `docs/claude-code/plugin-layer-manifest.md`（72 ファイルを 5 分類）          | 観点 11・双方向照合           |
| F-2  | 無条件依存 2 件を解消。条件付き参照 2 件は許容として分類                     | 観点 1                        |
| F-3  | `close-session` 手順 4 を条件付き参照へ。実体は `record-metrics-and-reflect` | 観点 2・3・4                  |
| F-4  | `kickoff-session` と `close-session` を共に workflow 層へ                    | マニフェスト workflow 表      |
| F-5  | cookpit-local 14 ファイルを非同梱として分離（D-1 により内容は不変）          | マニフェスト cookpit-local 表 |
| F-6  | `.claude/templates/claude-md-coding-standards.md` を新規作成                 | 観点 12                       |
| F-7  | 出典をパス形式 32 箇所 + 素の feature 名 7 箇所 = **39 箇所**書き換え        | 観点 8・9・10                 |

対象外に挙げた項目（スタック固有 1,418 行 / `plugin.json` / Cookpit の利用側転換 /
アプリコード）に手を出していないことを `git status` の差分で確認した。

## Must（修正必須）

**M-1: 要件 F-7 が部分充足のまま「完了」と報告しかけた。**（レビュー中に検出・修正済み）

出典の書き換えをパス形式（`docs/claude-code/improvements/candidates/<name>.md` 等）だけで
実施し、**素の feature 名形式**（`出典: shopping-list-core 事象 2` のようにパスを持たない
もの）を見落としていた。D-3 の決定は「プロジェクト名を前置する」であり、パス形式かどうかは
条件ではない。

- 検出方法: `grep -rhoE "出典[:：][^)）。]{0,70}" | grep -v "cookpit/"` で
  前置が無い出典を洗い出した。
- 修正: workflow 層の 2 ファイル（`create-implementation-plan` / `create-test-plan`）の
  7 箇所へ `cookpit/` を前置。
- 残る 4 箇所は cookpit-local の 3 ファイル（`create-codex-brief` /
  `manual-browser-verify` / `review-codex-implementation`）で、**D-1 により対象外**。

**根本原因**: 実装時に「出典 38 箇所」をパス参照の grep で数えたため、母集団の定義が
`出典` という語ではなくパス形式になっていた。Phase 1 で同種のミス
（`COOKPIT_TZ` を数えて `COOKPIT_GAP_CAP_MIN` を見落とし）を起こしており、**同じ類型の
再発**である。

## Should（申し送り・別タスク）

**S-1: workflow 層の Skill が Cookpit 固有ドキュメントを参照している。**
`create-implementation-plan/SKILL.md:39` が `docs/06-ai-tools.md` を実装ルート判断の
根拠として参照している。移植先にこのファイルは存在しない。出典形式ではないため F-7 の
対象外だったが、**層をまたぐ参照と同じ問題**（存在しないものを参照する指示）。
他に `logs/2026-06-24.md`（`write-work-log`）、
`docs/claude-code/archive/claude-code-multi-agent-implementation-instructions.md`
（`classify-change`）も同類。Phase 3 の切り出し時に棚卸しが必要。

**S-2: 「core だけで動く」ことが未実証。** Plugin リポジトリが無いため install できず、
本 Phase の検証は静的な依存照合に留まる。試験計画に Phase 3 へ引き継ぐ旨を明記済みだが、
**静的照合が拾えない依存**（Skill 本文が暗黙に前提とするディレクトリ構造など）が
残っている可能性がある。要件 B-01〜B-03（`logs/` や `docs/designs/` が無い場合）は
設計で挙げたが検証していない。

**S-3: `settings.json` の扱いが層マニフェストで「層外」となっているが、hooks の配線が
無ければ core の Hook 3 本は動かない。** マニフェストは「各プロジェクトが自分で持つ・
Plugin 側は README に設定例を載せる」としたが、その README はまだ無い（Phase 3）。
core を install しただけでは Hook が有効にならない点を Phase 3 で明示する必要がある。

## Nice（任意）

**N-1: 層マニフェストの検算表が手書きの数値を持つ。** ディレクトリ別の積み上げに改めたが、
依然として手動更新。ファイルを増減させたときに自動照合するスクリプトがあると
陳腐化を防げる（今回は照合コマンドを文書に載せるところまで）。

**N-2: 出典の `cookpit/` 前置により Cookpit 内での追跡性が下がった。** D-3 で受容した
トレードオフだが、`cookpit/store-master 設計書` から実ファイルへ辿るには
`docs/designs/store-master.md` を知っている必要がある。マニフェストか
`docs/claude-code/README.md` に「`cookpit/<feature>` の解決規則」を書くと補える。

## アーキテクチャ原則の確認

- 依存方向: アプリコード（`packages/` / `apps/`）に変更なし。Domain 層への影響ゼロ。
- 本 Phase の変更は `.claude/` と `docs/` に閉じている（`git status` で確認）。
- `guard-dangerous.mjs` を core 層に置く設計は、最小構成でも安全境界が効く点で妥当。

## 問題なし（確認済み項目）

- `close-session` 分割の手順対照: 旧手順 1〜7 + 完了条件が新旧 2 Skill へ 1:1 で対応し、
  欠落・二重化なし。手順番号も連続（close-session 1〜6 / 新 Skill 1〜3）。
- `record-task-metrics.sh` の改名: `COOKPIT_` 残存 0。実行して YAML 生成・更新を確認。
  `missing_documents: 1` を正しく検出（試験計画が未作成だった時点の実測）。
- 出典分類 (b) の生存: `.claude/` 配下への参照 11 件すべてが実在。
- 層マニフェストと実ファイルの双方向照合: 記載 → 実在、実在 → 記載ともに漏れ 0。
- `classify-change` の無条件依存の解消: `reflection-agent` と `contract-designer` を
  「存在する場合のみ」へ。**この欠陥は層照合で新規に発見したもので、Phase 3 まで
  持ち越していたら壊れた組み合わせを配ることになっていた。**
