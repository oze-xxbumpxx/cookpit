# ハーネスの状態永続化と人間承認

保護対象の変更・実行状態・品質ゲート結果を、**コードで強制される形**で扱うための正典。
自然言語のルールではなく、`.claude/lib/` のモジュールと `.claude/tests/` のテストが実体。

## 1. 前提と限界（最初に読むこと）

AI と人間が**同一 OS ユーザー**で任意のシェルを実行できる環境では、ファイルベースの承認は
**暗号学的な認証境界にならない**。本仕組みが提供するのは次の 2 つであり、それ以上ではない。

- 事故・手順の省略・安易な自己承認を**決定論的に排除する**こと。
- 迂回しようとすると、明示的で目立つ操作（人間の許可プロンプト or 端末操作）を必要とすること。

完全な分離が必要なら、承認発行を別 OS ユーザー・別ホスト・CI の承認ゲートへ移す必要がある。
残存リスクは §7 に列挙する。

## 2. 状態の保存先

| 種類                   | 置き場所               | 例                                                                     |
| ---------------------- | ---------------------- | ---------------------------------------------------------------------- |
| リポジトリ（Git 管理） | 定義・ロジック・テスト | 状態スキーマ / ゲート定義 / 保護対象定義 / 承認検証 / テスト / 本文書  |
| 永続領域（Git 管理外） | 実行時データ           | run 状態 / ゲート結果 / 承認 / 使用済み承認 / 活動ログ / Subagent ログ |

保存先の解決順（`.claude/lib/harness-paths.mjs` の `resolveStateDir`）:

1. `HARNESS_STATE_DIR`（絶対パス必須・**リポジトリ配下は拒否**）
2. `XDG_STATE_HOME/cookpit-harness`（同上）
3. `~/.local/state/cookpit-harness`
4. 最終手段: `<repo>/.claude/state`（`trusted: false`。**承認は受け付けない**）

シンボリックリンクで実体がリポジトリ配下へ戻る指定は `symlink_into_repo` として拒否する。
ディレクトリは `0700`、状態ファイルは `0600` で作成する。

確認コマンド:

```bash
node .claude/scripts/harness-run.mjs where     # 解決結果と trusted 状態
node .claude/scripts/migrate-state.mjs         # 旧 .claude/state/ から冪等に移行（元は消さない）
```

## 3. run 状態

`<stateDir>/run-state.json`（`schemaVersion: 1`）。原子的書き込み（一時ファイル → fsync → rename）
とロックで、部分書き込み・同時更新の破損を防ぐ。

```json
{
  "schemaVersion": 1,
  "runId": "run-...",
  "taskId": "",
  "phase": "planning | implementing | gates | blocked | completed | failed",
  "status": "active | waiting_for_approval | completed | failed",
  "changedFiles": [],
  "gateResults": {},
  "approvalStatus": "not_required | pending | approved | rejected | expired",
  "startedAt": "ISO 8601",
  "updatedAt": "ISO 8601",

  "attempt": 0,
  "maxAttempts": 0,
  "lastFailureFingerprint": null
}
```

> `attempt` / `maxAttempts` / `lastFailureFingerprint` は**将来の有界修正ループ用の予約**。
> 現在どのコードもこの値を解釈せず、自動修正は一切行わない。

未知フィールド・列挙値外・非 ISO 8601 のタイムスタンプはすべて拒否する（`validateRunState`）。
`.tmp-` 接頭辞の中断ファイルは正式な状態として読まない。

秘密情報は保存しない。`changedFiles` はパス、`gateResults` はゲート名と結果のみ。

## 4. 保護対象

`.claude/lib/harness-approval.mjs` の `PROTECTED_TARGETS` が唯一の定義。

完全一致: `CLAUDE.md` / `AGENTS.md` / `lefthook.yml` / `.claude/settings.json` /
`.claude/settings.local.json`

前置一致: `.claude/agents/` / `.claude/hooks/` / `.claude/lib/` / `.claude/rules/` /
`.claude/scripts/` / `.claude/skills/` / `.claude/tests/` / `.github/actions/` / `.github/workflows/`

対象外（成果物・アプリコード）: `.claude/state/` / `.claude/evals/` / `docs/` / `logs/` /
`packages/` / `apps/`

**読み取りは常に許可**する。制限するのは Edit / Write / MultiEdit と、Bash 経由の書き込み経路。

## 5. 承認の発行と検証

### 発行（人間のみ）

```bash
node .claude/scripts/harness-approve.mjs --target .claude/hooks/ --ttl-minutes 15
node .claude/scripts/harness-approve.mjs --revoke
```

人間であることの確認は次のいずれか。どちらも AI の非対話シェルからは満たせない。

1. **TTY** で実行し、確認語 `approve` を `/dev/tty` から入力する。
2. out-of-band に設定した `HARNESS_APPROVAL_TOKEN` と一致する `--token` を渡す。

さらに `guard-dangerous.mjs` が、AI からの `harness-approve` 実行・承認ファイルへの書き込み・
状態ディレクトリを差し替える環境変数の設定を deny する。

### 承認ペイロード

```json
{
  "schemaVersion": 1,
  "approvalId": "uuid",
  "runId": "run-...",
  "operation": "config_change",
  "target": ".claude/hooks/",
  "approvedAt": "ISO 8601",
  "expiresAt": "ISO 8601",
  "approvedBy": "human"
}
```

### 検証（`verifyApproval`）

次をすべて満たすときのみ受理する。1 つでも欠ければ**拒否**。

- スキーマが一致する（`schemaVersion: 1`・**未知フィールドは拒否**・必須欠落は拒否）
- `approvedBy === 'human'`
- `operation` が要求と一致する
- `target` が対象パスを覆う（`/` 終端は前置一致、それ以外は完全一致）
- `runId` が現在の run 状態と一致する（run 状態が無い・壊れていれば拒否）
- `expiresAt` が未来（かつ有効期間は最大 60 分）
- 使用済み台帳（`used-approvals.jsonl`）に無い
- 保存先が `trusted`（リポジトリ内フォールバックからは受け付けない）

### 再利用条件（明示）

| `target` の形                               | 挙動                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| ファイル完全一致（例 `CLAUDE.md`）          | **単回使用**。1 回使うと台帳へ記録し承認ファイルを削除する               |
| ディレクトリ前置一致（例 `.claude/hooks/`） | 同一 run・有効期限内に限り**複数ファイルへ再利用可**（バッチ変更のため） |

いずれも run をまたいだ再利用はできない（`runId` 束縛）。

## 6. ローカル Hook と CI の役割分担

| 層                                 | 役割                                                                                    | 迂回可能性                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| lefthook（pre-commit / pre-push）  | 早期フィードバック（format / lint / type-check / harness テスト / main 直コミット防止） | `--no-verify` / `LEFTHOOK=0` で外せる（**人間の明示操作**として許容） |
| PreToolUse Hook（guard-dangerous） | AI の操作に対する即時ガード（危険操作・秘密情報・保護対象・回避コマンド）               | 同一 OS ユーザーの難読化には限界あり（§7）                            |
| GitHub Actions                     | 最終ゲート（**2026-08 まで不動作** — §7-4 / §7-5）                                      | 復旧・protection 設定後は迂回不能                                     |

`guard-dangerous.mjs` は次の回避コマンドを deny する: `git commit/push --no-verify`、
`LEFTHOOK=0` / `HUSKY=0` / `SKIP=` の前置、`git config core.hooksPath` の変更。

CI 側は `Harness tests`（`pnpm test:harness`）を実行する設計のため、保護機構やそのテストを
骨抜きにする変更はサーバ側で検出される **— ただしそれは Actions が動いていればの話**。

2026-07 時点では次の 2 段階で強制力が欠けている。

1. **Actions がジョブを実行していない**（§7-4。2026-08 に解消見込み）→ 検出すらされない
2. **branch protection が未設定**（§7-5）→ 検出されてもマージは止まらない

**この 2 つが揃うまで、本節の役割分担は設計上の意図であって実効的な強制ではない。**
待機期間中の実質的な安全境界はローカルの `guard-dangerous.mjs` 1 層のみである。

## 7. 残存リスク（隠さず記録する）

1. **同一 OS ユーザーの難読化**: コマンド文字列を base64・変数展開・間接実行で組み立てれば、
   正規表現ベースの deny は原理的に回避できる。`guard-dangerous.mjs` は既知の直接経路
   （`touch` / `echo` / `printf` / `tee` / `cp` / `mv` / `install` / `ln` / `node -e` /
   `python -c` / リダイレクト）を塞ぐが、網羅の保証はない。
2. **状態ディレクトリの直接改変**: 承認ファイルを AI が別経路で書ければ検証は通る。
   実効的な緩和は「発行を別 OS ユーザー / 別ホストへ移す」ことだけ。
3. **`HARNESS_STATE_DIR` の実行時差し替え**: 環境変数の設定コマンドは deny するが、
   親プロセス側で設定された値は検出できない。
4. **GitHub Actions が実行されていない（期限付きの既知リスク・2026-08 に解消予定）**:
   2026-07-26 時点で、直近 32 実行がすべて 3〜5 秒で failure し、`runner_id` は 0。
   `main` ブランチの実行も同様で、本ハーネス改修**以前から**同じ状態。
   つまり `Harness tests` も `assert-e2e-results.mjs` も**一度も動作していない**。

   これは環境側の一時的な制約であり、2026-08 に解消見込み（ユーザー確認済み）。
   **代替 CI は構築しない方針**（`.github/workflows/ci.yml` を唯一の CI として扱う）。

   **待機期間中のリスク姿勢（重要）**: この間、安全境界は**ローカルの
   `guard-dangerous.mjs` 1 層だけ**になる。サーバ側のバックストップが無いため、
   - 保護機構やそのテストを壊す変更を検出する手段が無い。
   - 「ローカル Hook を回避しても CI で止まる」という前提が成立しない。

   したがって **[pending/](./pending/) の修正パッチ適用は Actions の復旧を待たずに行う**。
   待機期間中こそローカル層の健全性が唯一の防御になる。

   復旧の確認手順は [harness-owner-setup.md](./harness-owner-setup.md) §1-A。
   **「緑になった」ことだけで復旧と判断しない** — 実行時間とログの実体を確認する
   （何も実行せず success になる状態と区別できないため）。

5. **branch protection が未設定（2026-07-26 確認済み）**:
   GitHub API で `main` が `protected: false`。required check が 1 件も無いため、
   Actions が復旧しても**赤い CI のままマージできる**。`main` への直 push を止めるのは
   lefthook の `branch-guard` だけで、これはローカル層であり別クローンからの push は
   サーバ側で止まらない。

   **対応（リポジトリ所有者のみ実施可能。コードでは解決できない）**:
   手順は [harness-owner-setup.md](./harness-owner-setup.md) §1-B。Actions 復旧後に
   `Quality Gates` / `E2E Smoke` を required check として設定する。

6. **保護境界を修復する手段が環境内に存在しない（2026-07-26 の再監査で発見）**:
   承認発行（`harness-approve.mjs`）は TTY か out-of-band トークンを要求するが、
   リモートの Claude Code セッションでは人間が同一環境に端末を持たない。
   結果として、**保護対象に Critical な欠陥が見つかっても、その場で塞げない**
   （実際に 2026-07-26 の再監査でロックアウトが発生し、修正はパッチとして
   [pending/](./pending/) に保全するしかなかった）。

   fail-closed 設計自体は正しいが、「安全側に倒れたあと誰がどう戻すか」が設計されて
   いなかった。恒久対応は [harness-owner-setup.md](./harness-owner-setup.md) §4 案 B
   （GitHub Environment の required reviewers）を推奨。

## 8. 関連ファイル

| ファイル                                 | 役割                                                  |
| ---------------------------------------- | ----------------------------------------------------- |
| `.claude/lib/harness-paths.mjs`          | 状態ディレクトリの解決・リポジトリ配下の拒否          |
| `.claude/lib/harness-state.mjs`          | run 状態スキーマ・原子的書き込み・ロック              |
| `.claude/lib/harness-approval.mjs`       | 保護対象定義・承認検証・単回使用                      |
| `.claude/scripts/harness-run.mjs`        | run 状態の作成・参照・更新（AI が使う読み書き系 CLI） |
| `.claude/scripts/harness-approve.mjs`    | 承認の発行（**人間専用**）                            |
| `.claude/scripts/migrate-state.mjs`      | 旧 `.claude/state/` からの冪等移行                    |
| `.claude/scripts/assert-e2e-results.mjs` | E2E の未実行・0 件を成功扱いにしない検証              |
| `.claude/hooks/guard-dangerous.mjs`      | PreToolUse での deny（承認検証の呼び出し元）          |
| `.claude/tests/*.test.mjs`               | 上記すべての回帰テスト（`pnpm test:harness`）         |
