# 実装計画: harness-portability

- 前提となる設計書: docs/designs/harness-portability.md
- レベル: L2
- 実装ルート: Orchestrator（implementer）
- 判断理由: 既定（docs/06-ai-tools.md — ハーネス自身の安全境界に触れる変更で、既存の
  fail-closed 判定を壊さない検証が要る。Codex 委譲の対象外）

## 変更対象ファイル

| path                                        | なぜ変えるか                                             |
| ------------------------------------------- | -------------------------------------------------------- |
| `.claude/lib/harness-paths.mjs`             | 名前空間のリテラル固定を導出へ置き換える（本変更の中心） |
| `.claude/tests/harness-paths.test.mjs`      | 導出の試験を追加。既存期待値のリテラル依存を外す         |
| `.claude/hooks/check-improvement-cycle.mjs` | TZ 環境変数の後方互換つき改名（1 箇所）                  |
| `.claude/scripts/collect-task-metrics.mjs`  | 同上（コメント 1 + コード 1）                            |
| `.claude/scripts/estimate-session-time.mjs` | 同上（コメント 1 + コード 1）                            |
| `.claude/scripts/session-briefing.sh`       | 同上（1 箇所）                                           |
| `.claude/scripts/sprint-summary.sh`         | 同上（1 箇所）                                           |
| `.claude/hooks/record-activity.mjs`         | 記録先パスのコメントが `cookpit-harness` 固定（追随）    |
| `docs/claude-code/harness-state.md`         | 解決順の記述が `cookpit-harness` 固定（追随）            |

## 新規作成ファイル

なし（本 Phase では新規モジュールを作らない。設計判断 B 却下の帰結）。

## ファイルごとの変更内容

### `.claude/lib/harness-paths.mjs`

- 変更内容:
  1. `export const STATE_NAMESPACE = 'cookpit-harness';` を削除する。
  2. `export const DEFAULT_NAMESPACE = 'claude-harness';` を追加する。
  3. `sanitizeNamespaceSegment(value)`（非公開）を追加する。先頭 `@` の除去、
     `/` `\` `.` を含む非許可文字を `-` へ、連続 `-` の圧縮、前後 `-` の除去。
     結果が空文字なら `null` を返す。
  4. `export function resolveNamespace({ env, root })` を追加する。解決順は
     `HARNESS_NAMESPACE` → `<root>/package.json` の `name` から `${sanitized}-harness`
     → `DEFAULT_NAMESPACE`。**例外は投げない**（`package.json` の欠損・破損・`name` 無しは
     既定値へ落とす）。
  5. `resolveStateDir` 内の `STATE_NAMESPACE` 参照 2 箇所（XDG 経路・home 経路）を
     `resolveNamespace({ env, root })` の結果へ置き換える。同一呼び出し内で 2 回
     評価しないようローカル変数へ束ねる。
  6. 冒頭コメントの解決順の記述を更新する。
- 完了条件: `STATE_NAMESPACE` の参照がリポジトリから消え、`resolveNamespace` が
  3 分岐すべてを返せる。`resolveStateDir` の既存戻り値の形（`dir` / `source` /
  `trusted` / `warnings`）が不変。

### `.claude/tests/harness-paths.test.mjs`

- 変更内容:
  1. import を `STATE_NAMESPACE` から `DEFAULT_NAMESPACE, resolveNamespace` へ差し替える。
  2. 既存 2 件（`XDG_STATE_HOME を名前空間つきで使う` / `環境変数が無ければ
~/.local/state/<ns> を使う`）の期待値を `resolveNamespace({ env, root })` 経由に変える。
  3. 新規試験を追加する（詳細は `docs/tests/harness-portability.md` の No.1〜8）。
- 完了条件: `pnpm test:harness` が全件 PASS。リテラル `'cookpit-harness'` を
  期待値に持つ箇所が無い（回帰試験 No.8 を除く。あちらは意図的にリポジトリルートで固定する）。

### `.claude/hooks/check-improvement-cycle.mjs`

- 変更内容: `:102` の `process.env.COOKPIT_TZ || 'Asia/Tokyo'` を
  `process.env.HARNESS_TZ || process.env.COOKPIT_TZ || 'Asia/Tokyo'` へ。
- 完了条件: `HARNESS_TZ` が優先され、未設定時に `COOKPIT_TZ` が効く。

### `.claude/scripts/collect-task-metrics.mjs`

- 変更内容: `:45` の TZ と `:46` の `COOKPIT_GAP_CAP_MIN` を 2 段フォールバックへ
  （`HARNESS_GAP_CAP_MIN` → `COOKPIT_GAP_CAP_MIN` → 30）。`:12` の使い方コメントの
  `COOKPIT_TZ` を `HARNESS_TZ` へ（旧名も可と併記）。
- 完了条件: 同上。`--since` / `--until` の日付解釈が従来と一致する。

### `.claude/scripts/estimate-session-time.mjs`

- 変更内容: `:24` の TZ・`:25` の GAP_CAP_MIN・`:6` のコメントを上記と同様に。
- 完了条件: 同上。

### `.claude/scripts/session-briefing.sh`

- 変更内容: `:12` の `TZ="${COOKPIT_TZ:-Asia/Tokyo}"` を
  `TZ="${HARNESS_TZ:-${COOKPIT_TZ:-Asia/Tokyo}}"` へ。
- 完了条件: 実行して日付行が現行と同じ値で出る。

### `.claude/scripts/sprint-summary.sh`

- 変更内容: `:13` の `TZ_NAME="${COOKPIT_TZ:-Asia/Tokyo}"` を同じ 2 段フォールバックへ。
- 完了条件: 同上。

### `.claude/hooks/record-activity.mjs`

- 変更内容: `:10` のコメントの `~/.local/state/cookpit-harness/` を、導出である旨の
  記述へ変更する（実パスをコメントで断定しない）。
- 完了条件: コメントが実挙動と矛盾しない。

### `docs/claude-code/harness-state.md`

- 変更内容: `:19-20` の `XDG_STATE_HOME/cookpit-harness` / `~/.local/state/cookpit-harness`
  を `<ns>` 表記へ改め、`<ns>` の決まり方（`HARNESS_NAMESPACE` → `package.json` の
  `name` + `-harness` → `claude-harness`）と Cookpit での実値を追記する。
- 完了条件: 記述と `resolveNamespace` の解決順が一致する。

## 実装手順

1. **名前空間の導出を実装** … `.claude/lib/harness-paths.mjs` /
   上記 1〜6 / `node -e` で 3 分岐の戻り値を目視確認できる
2. **試験を追随・追加** … `.claude/tests/harness-paths.test.mjs` /
   期待値差し替え + 新規 8 件 / `pnpm test:harness` が全件 PASS
3. **移行不要の実測確認** … 手順なし（コマンド実行のみ）/
   リポジトリルートでの導出が `cookpit-harness` であることを実行して確認 /
   一致すれば R-2 充足。**不一致ならここで中断してユーザーへ報告**（サフィックス規則の見直し）
4. **環境変数の改名（mjs 3 本）** … `check-improvement-cycle.mjs` /
   `collect-task-metrics.mjs` / `estimate-session-time.mjs` /
   `HARNESS_TZ` + `HARNESS_GAP_CAP_MIN` を 2 段フォールバック /
   `grep -rn 'COOKPIT_'` の残存が後方互換フォールバックと対象外ファイルのみ
5. **TZ 環境変数の改名（sh 2 本）** … `session-briefing.sh` / `sprint-summary.sh` /
   2 段フォールバック / 両スクリプトを実行して日付が現行と同じ
6. **コメント・ドキュメント追随** … `record-activity.mjs` / `harness-state.md` /
   実挙動との矛盾解消 / 記述の解決順が実装と一致
7. **品質ゲート** … 変更なし / `pnpm lint` `type-check` `test` `test:harness` /
   全 PASS（既存 warning 1 は許容）

## 依存関係

- 手順 1 → 2 → 3 は直列（導出が無いと試験が書けず、試験が通らないと移行判定ができない）。
- 手順 3 は**ゲート**。ここで不一致なら 4 以降へ進まない。
- 手順 4・5・6 は互いに独立（並行可）。1〜3 とも独立だが、まとめてゲートを回す都合で後段に置く。
- 手順 7 は全ステップ完了後。

## テスト計画

`docs/tests/harness-portability.md` と整合。ランナーは **node:test**
（`pnpm test:harness` = `node --test .claude/tests/*.test.mjs`）。Vitest ではないため
`tests/**/*.node.test.ts` 等の命名規約は適用されない。追加先は既存の
`.claude/tests/harness-paths.test.mjs` 1 本のみで、新規テストファイルは作らない。

TZ 変更（手順 4・5）は自動試験を追加しない。`.claude/tests/` に対象スクリプトの
テストが存在せず、本 Phase で新設するとスコープを超える。代わりに
手順 4 の `grep` 照合と手順 5 の実行確認を完了条件に置く（試験計画 No.9・10 に対応）。

## リスク

設計書「リスク」の R-a〜R-d を継承する。実装時の判断は以下に固定する。

| #   | 発生時の対応（優先順）                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------- |
| R-a | 導出結果が `cookpit-harness` と不一致 → **手順 3 で中断しユーザーへ報告**。独断でサフィックスを変えない |
| R-b | 既存試験が既定値で落ちる → 期待値を `resolveNamespace({ env, root })` 経由へ（設計済みの想定挙動）      |
| R-c | sanitize が正当な名前を壊す → 許可文字を英数 `-` `_` に限定し、境界値試験 No.4〜6 で固定                |
| R-d | TZ の箇所漏れ → `grep -rn 'COOKPIT_TZ'` の残存が「後方互換のフォールバック内のみ」であることを確認      |

## ロールバック方法

単一コミットに収め、`git revert <sha>` で戻す。データ移行を伴わない（設計書「移行と
リリース」）ため、revert 後に状態ファイルの復旧作業は不要。
`~/.local/state/cookpit-harness/` は変更前後で同一パスのまま。

## ドキュメント更新対象

- `docs/claude-code/harness-state.md` — 必須（実装手順 6。解決順の記述が実装と乖離する）
- `docs/04-domain-model.md` — **更新不要**（ドメインモデルの変更を含まない。
  対象は Claude Code ハーネスのみでアプリコードに触れない）
- ADR — 不要（L2。アーキテクチャ決定に相当する判断はなく、設計書の 2 つの
  設計判断表で足りる）
- `logs/2026-07-31.md` — セッション追記で実施内容を残す
