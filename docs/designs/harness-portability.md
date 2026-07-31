# 設計書: harness-portability

- ステータス: confirmed（ユーザー承認: 2026-07-31「配布方式でいきたいと思います」+ 抽象化範囲の選択）
- レベル: L2
- 関連: `logs/2026-07-31.md`（移植性の棚卸し実測） / 後続 Phase 2・3（未着手）

## 背景

Claude Code ハーネスを他プロジェクトへ再利用したい、という要求。2026-07-31 の棚卸しで
移植性は 3 層に分かれると判明した。

| 層         | 対象                              | 行数   | 移植性                         |
| ---------- | --------------------------------- | ------ | ------------------------------ |
| 実行系     | `.claude/hooks` `lib` `scripts`   | 3,627  | ほぼそのまま動く               |
| 指示系     | `.claude/agents` `skills` `rules` | 2,205  | 骨格は汎用・本文にスタック前提 |
| 方針       | `docs/claude-code/*.md` 直下      | 1,867  | 同上                           |
| 実績・履歴 | `evals` `improvements` `archive`  | 17,828 | このプロジェクト固有の資産     |

配布方式は **Plugin 化**（別リポジトリ + marketplace）を採用。全 3 Phase のうち、
本設計は **Phase 1（実行系の抽象化点を潰す）**のみを対象とする。Phase 1 は配布方式に
依存しないため、方式が変わっても成果は無駄にならない。

## 目的

実行系 3,627 行を、プロジェクト名に依存せず他リポジトリでそのまま動く状態にする。
**Cookpit 側の挙動は一切変えない**（状態ディレクトリの実パスも変えない）。

## 要件

- R-1: 状態ディレクトリの名前空間がリポジトリ固有のリテラルに固定されていないこと
- R-2: Cookpit では導出結果が現行値 `cookpit-harness` と一致し、**データ移行が発生しない**こと
- R-3: **利用者が設定する環境変数**がプロジェクト名を含まないこと。かつ旧名
  （`COOKPIT_TZ` / `COOKPIT_GAP_CAP_MIN`）を設定している既存環境が壊れないこと
  - 実装中に `COOKPIT_GAP_CAP_MIN` を追加発見した（当初は TZ のみの想定）。同じ類型で
    同じファイル内にあり、片方だけ残すと中途半端になるため Phase 1 に含めた。
    `record-task-metrics.sh` の `COOKPIT_METRICS_*` は shell と inline node の内部受け渡しで
    利用者が設定するものではないため、同ファイルの Phase 2 対応にまとめる
- R-4: `package.json` に `name` が無い / スコープ付きの環境でも安全な名前空間へ落ちること
- R-5: 名前空間の値経由でパスが意図しない場所へ逃げないこと（`..` や `/` の混入防止）

## 対象範囲

- `.claude/lib/harness-paths.mjs` — 名前空間の導出（本変更の中心）
- `.claude/tests/harness-paths.test.mjs` — 導出ロジックの試験追加・既存期待値の追随
- `.claude/hooks/check-improvement-cycle.mjs` — TZ 環境変数
- `.claude/scripts/collect-task-metrics.mjs` / `estimate-session-time.mjs` —
  TZ + GAP_CAP_MIN 環境変数
- `.claude/scripts/session-briefing.sh` / `sprint-summary.sh` — TZ 環境変数
- `.claude/hooks/record-activity.mjs` — 記録先パスのコメント追随
- `docs/claude-code/harness-state.md` — 解決順の記述追随

## 対象外

- **パッケージマネージャの抽象化**（ユーザー選択 2026-07-31: 全プロジェクト pnpm 前提。
  `run-quality-gates.sh` / `detect-project-commands.sh` の pnpm 決め打ちは**そのまま残す**）
- `.claude/scripts/check-codex-implementation.mjs`（Tailwind / Next 前提が濃い。Phase 2 で扱う）
- `.claude/scripts/record-task-metrics.sh`（固有名詞 14 箇所。Phase 2 で扱う）
- 指示系（agents / skills / rules）のスタック依存記述の切り出し → Phase 2
- Plugin リポジトリの作成（`.claude-plugin/`）→ Phase 3
- 移植ティア（Minimal / Standard / Full）の決定 → 移植先未定のため持ち越し
- アプリコード（Domain / Application / Infrastructure / Presentation）— 変更なし
- DB / API 契約 — 変更なし

## 現状構成

`.claude/lib/harness-paths.mjs:20`:

```js
export const STATE_NAMESPACE = 'cookpit-harness';
```

解決順は `HARNESS_STATE_DIR` → `XDG_STATE_HOME/<ns>` → `~/.local/state/<ns>` →
リポジトリ内フォールバック（`trusted: false`）。`<ns>` が上記リテラル。

参照元は `harness-paths.mjs` 自身（`resolveStateDir` 内 2 箇所）と
`.claude/tests/harness-paths.test.mjs`（import + 期待値 2 箇所）**のみ**。
他 11 ファイルは `statePath` / `safeStatePath` / `resolveReadablePath` 経由で
名前空間を知らない。したがって差し替えの影響は 2 ファイルに閉じる。

## 変更後構成

```js
export const DEFAULT_NAMESPACE = 'claude-harness';

// 名前空間はパスの一部になるため、区切り文字と相対参照を落とす（R-5）。
function sanitizeNamespaceSegment(value) {
  /* @scope/pkg → scope-pkg 等 */
}

export function resolveNamespace({ env = process.env, root = repoRoot(env) } = {}) {
  // 1. HARNESS_NAMESPACE（sanitize 通し）
  // 2. <root>/package.json の name → `${sanitized}-harness`
  // 3. DEFAULT_NAMESPACE
}
```

`resolveStateDir` は `STATE_NAMESPACE` の代わりに `resolveNamespace({ env, root })` を呼ぶ。
`env` と `root` は既に `resolveStateDir` の引数として存在するため、テストから同じ経路で
差し替えられる（既存の設計思想を踏襲）。

**Cookpit での導出結果**: `package.json` の `name` が `cookpit` なので
`cookpit-harness` = 現行値。よって `~/.local/state/cookpit-harness/` の既存データ
（`activity-log.jsonl` / `quality-gates-log.jsonl` / run 状態）はそのまま読める（R-2 充足）。

サフィックス `-harness` を付ける理由は 2 つ。現行値との一致（移行回避）と、OS の状態
ディレクトリ配下で「何の状態か」が名前で分かること。

### 設計判断: `STATE_NAMESPACE` const を残すか

| 案  | 内容                                           | 評価                                                                                                                        |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A   | const を削除し `resolveNamespace()` へ完全移行 | **採用**。参照元が 2 ファイルのみで移行コストが低く、2 経路が並存しない                                                     |
| B   | const を維持し、別名で関数を追加               | 却下。import 時評価の const と呼び出し時評価の関数で値が食い違い得る（テスト sandbox に `package.json` が無い場合に顕在化） |

### 設計判断: TZ 解決の集約先

| 案  | 内容                                        | 評価                                                                                                                                 |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| A   | 各ファイルに 2 段フォールバック式を直接書く | **採用**。式 1 つの重複に留まり、shell 2 本を node へ依存させない                                                                    |
| B   | 共通 lib へ関数を切り出す                   | 却下。`harness-paths.mjs` は「パス解決の正典」であり TZ は責務外。新規 lib は shell から使えず、mjs 3 本のためだけに増やす価値がない |

採用案の式（mjs）: `process.env.HARNESS_TZ ?? process.env.COOKPIT_TZ ?? 'Asia/Tokyo'` に相当する
`||` 連鎖。shell は `${HARNESS_TZ:-${COOKPIT_TZ:-Asia/Tokyo}}`。

## データフロー

変更なし。名前空間の決定タイミングが「モジュール読み込み時」から
「`resolveStateDir` 呼び出し時」へ移るだけで、呼び出し側の API（`statePath` /
`safeStatePath` / `resolveReadablePath`）は不変。

## API 設計

対象外（HTTP API の変更なし）。モジュール公開 API の差分のみ:

- 削除: `STATE_NAMESPACE`（const）
- 追加: `DEFAULT_NAMESPACE`（const） / `resolveNamespace(opts)`（関数）

## DB 設計

対象外（DB 変更なし）。

## フロントエンド設計

対象外（`apps/web` 変更なし）。

## バックエンド設計

対象外（アプリのバックエンド変更なし。対象は Claude Code ハーネスのみ）。

## エラー処理

外部 API / 外部ストレージへの I/O を含まないため、リトライ・タイムアウト・冪等性・
部分失敗・フォールバックの 5 項目は対象外。

ハーネス固有の失敗方針は現行を維持する。

- `resolveNamespace` は**例外を投げない**。`package.json` が無い / 壊れている / `name` が
  無い場合は `DEFAULT_NAMESPACE` へ落ちる。記録系 Hook を名前空間の都合で止めないため。
- 状態ディレクトリの安全判定（リポジトリ配下・シンボリックリンク）は従来どおり
  `assertOutsideRepo` で fail-closed のまま。名前空間の変更はこの判定を弱めない。

## ログと監視

変更なし。記録先ファイル名・JSONL の形式・`quality-gates-log.jsonl` のスキーマは不変。

## セキュリティ

- 名前空間はパスに連結されるため、`HARNESS_NAMESPACE` に `../` や絶対パスを入れて
  状態ディレクトリを移動させられないよう sanitize する（R-5）。`/`・`\`・`.` を
  区切りとして無効化し、英数と `-` `_` に落とす。
- sanitize 後も `assertOutsideRepo` の realpath 検証が後段に残るため、
  リポジトリ配下への逆流は二重に防がれる。
- ディレクトリ権限 0700 の作成方針は不変。

## 性能

影響は無視できる。`resolveNamespace` は `resolveStateDir` 呼び出しごとに
`package.json` を 1 回読む可能性がある。Hook は 1 プロセス 1〜数回の呼び出しで、
`package.json` は数 KB。計測不要と判断する。

## テスト方針

`pnpm test:harness`（`node --test .claude/tests/*.test.mjs`）で実行する。Vitest ではない。
詳細は `docs/tests/harness-portability.md`。

- 導出の 3 分岐（env / package.json / 既定）と sanitize の異常系を新規に固定する。
- 既存 7 件は期待値を `resolveNamespace({ env, root })` 経由へ差し替え、
  リテラル依存をなくす（テスト sandbox に `package.json` が無いため必須）。
- **回帰の要点**: Cookpit のリポジトリルートで導出結果が `cookpit-harness` であること
  を明示的に固定する（R-2 が将来壊れたら検出できるようにする）。

## 移行とリリース

**データ移行なし**（R-2）。導出結果が現行値と一致するため、既存状態ファイルはそのまま
読まれる。`migrate-state.mjs` の変更も不要（あれはリポジトリ内 → 永続領域の移行専用で、
名前空間の変更は扱わない）。

`COOKPIT_TZ` を設定している環境は引き続き有効（後方互換）。新規は `HARNESS_TZ` を使う。

## リスク

| #   | リスク                                                        | 検出タイミング      | 対応                                                                  |
| --- | ------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------- |
| R-a | 導出結果が現行値とズレて既存状態が孤児化する                  | 実装直後の試験      | 回帰試験で `cookpit-harness` を固定。ズレたらサフィックス規則を見直す |
| R-b | テスト sandbox に `package.json` が無く、期待値が既定値になる | `pnpm test:harness` | 期待値をリテラルではなく `resolveNamespace` 経由にする（設計済み）    |
| R-c | `HARNESS_NAMESPACE` の sanitize が過剰で正当な名前を壊す      | 試験（境界値）      | 許可文字を英数 `-` `_` に限定し、スコープ付き名の変換を試験で固定     |
| R-d | `COOKPIT_TZ` の後方互換を落として日付集計がズレる             | 試験・実行時        | 2 段フォールバックを全 5 箇所に入れる。差分レビューで箇所数を照合     |

## 未決事項

- **名前空間を変えた場合の読み取り互換は実装しない。** `HARNESS_NAMESPACE` を後から
  変更すると旧名前空間の状態は孤児になる（読み取りフォールバックは
  「永続領域 → リポジトリ内旧パス」のみで、旧名前空間は見ない）。Cookpit では発生しない
  ため対象外とし、他プロジェクトで実害が出た時点で扱う。
- Phase 2 の切り出し方針（指示系のスタック依存記述をどこへ寄せるか）は本設計の対象外。
  `.claude/rules/` は Plugin の配布プリミティブに含まれないため、汎用ルールを
  skill / CLAUDE.md テンプレートのどちらで配るかは Phase 2 で決める。
- 移植ティア（Minimal / Standard / Full）は移植先プロジェクト未定のため保留。
