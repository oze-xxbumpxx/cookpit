# Task 7: Hook による上限の強制と正典ドキュメント

## 概要

上限を「プロンプトによる自制」ではなく**実際の執行**にする最後の層。ループが停止状態・
上限到達のとき、`guard-dangerous.mjs`（PreToolUse Hook）が AI の Edit / Write を deny する。
あわせて正典ドキュメントを作成する。

- 変更: `.claude/hooks/guard-dangerous.mjs`（追記のみ）
- 変更: `.claude/lib/harness-approval.mjs` の `APPROVAL_SURFACE_TOKENS`（1 行追加）
- 新規: `docs/claude-code/bounded-repair-loop.md`
- 変更: `docs/claude-code/harness-state-and-approval.md`（予約フィールドの記述を更新）

## アーキテクチャ制約

- Node ESM（`.mjs`）。**新規依存の追加は禁止**。
- 既存 Hook の作法を厳守: deny は **`process.exit(2)`** + 理由を stderr。許可は `exit 0`。
- **既存の deny 判定を 1 つも削除・弱体化しない**（追記のみ）。
- 状態の読み取りは既存 `loadRunState` / 新規 `loadLoopState` を使い、**例外を投げさせない**。

## 実装する強制（最小限・過剰 deny を避ける）

### 1. 停止状態での編集を deny

ループ状態が存在し、その `status` が終了状態
（`needs_human_review` / `budget_exceeded` / `unsafe_change_detected` / `failed` / `completed`）の
とき、**Edit / Write / MultiEdit** と Bash 経由の書き込みを deny する。

deny メッセージには必ず次を含める（人間が次に何をすべきか分かるように）:

```
⛔ 有界修正ループが停止状態です: <status> / <stopReason>
attempt <n>/<maxAttempts>・停止理由の詳細は次で確認してください:
  node .claude/scripts/bounded-repair.mjs report
続行するには人間の判断が必要です。新しい run を開始するか、cancel してください:
  node .claude/scripts/bounded-repair.mjs cancel
```

### 2. 上限到達での編集を deny

`attempt >= maxAttempts` かつ `phase === 'gates'`（＝次の修正が許可されていない）状態での
編集を deny する。「上限到達後に AI を呼ばない」を実際に執行する。

### 3. ループ状態ファイルを承認面へ追加

`.claude/lib/harness-approval.mjs` の `APPROVAL_SURFACE_TOKENS` に
**`'bounded-repair-state.json'`** を追加する。これにより AI がループ状態を直接書き換えて
停止を解除する経路が塞がれる（既存の `'run-state.json'` と同じ扱い）。

### 4. opt-in であること（最重要の設計判断）

**ループ状態ファイルが存在しない場合は、従来どおり一切制限しない。** 有界修正ループは
opt-in の機構であり、通常の開発セッションを止めてはならない。

ただし次は fail-closed にする:

- ループ状態が**存在するが壊れている / 検証を通らない**場合 → **deny**
  （状態不整合時の停止。破損させれば無制限になる、という抜け道を作らない）

この 2 つの区別を間違えると、(a) 通常開発が全部止まる、または
(b) 状態を壊せば上限が消える、のどちらかになる。

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **「状態が無い」と「状態が壊れている」を区別する（最重要）。** `loadLoopState()` の
  `reason: 'missing'` は許可、`'corrupt'` / `'schema_mismatch'` / `'unknown_field'` は deny。
  `if (!result.ok) deny()` と書くと、ループを使っていない通常セッションで**すべての編集が
  deny され開発が完全に停止する**。逆に `if (!result.ok) return` と書くと、状態を壊すだけで
  上限が無効化される。必ず `reason` で分岐する。
- **既存の `checkProtectedWrite` / `isStateWritePath` / `bashTouchesApprovalSurface` を
  壊さない。** 新しい判定は**追加**であり、既存の deny 経路の前後どちらに置いても
  既存テスト（`guard-dangerous.test.mjs`）が通ること。
- **`exit 2` が deny、`exit 0` が許可。** `exit 1` は Hook のエラーとして扱われ deny に
  ならない。既存 `deny()` 関数を使い、新しい終了コードを発明しない。
- **`APPROVAL_SURFACE_TOKENS` への追加は 1 要素だけ。** 既存要素の綴りを変えない
  （`'run-state.json'` を `'run_state.json'` に直したくなっても触らない）。
- Hook は**毎ツール呼び出しで実行される**。ループ状態の読み取りは軽量に保ち、
  品質ゲートの実行や git 呼び出しを Hook 内で行わないこと（開発体験が壊れる）。
- Hook 内で例外を投げない。`try` / `catch` で囲み、判定不能なら安全側（deny）に倒す。
  ただし「状態ファイルが無い」は判定不能ではなく「ループ未使用」なので許可。

## ドキュメント

### 新規 `docs/claude-code/bounded-repair-loop.md`

既存 `docs/claude-code/harness-state-and-approval.md` の構成・トーン（日本語・表中心・
限界を隠さない）に合わせる。含める節:

1. **前提と限界**（最初に読む節）— プログラム的なモデル呼び出し口が無いため、ループは
   「門番 + 事後の差分検査 + Hook による執行」で成立していること。トークン・料金は
   取得不能で `unsupported` であること。**CI が実行されていないため、ローカル層が唯一の
   実効的な境界であること**（`harness-state-and-approval.md` §7-4 を参照）。
2. **上限表**（Task 1 の表を転記。根拠つき）
3. **状態スキーマと保存先**
4. **状態遷移表**（許可 / 禁止の両方）
5. **失敗種別と自動修正の可否**（18 種の表）
6. **フィンガープリントの正規化規則**
7. **差分検査とゲート弱体化の検出一覧**
8. **CLI の使い方**（`start` / `status` / `gates` / `authorize` / `record-repair` / `resume` /
   `cancel` / `report` と終了コードの意味）
9. **安全上の不変条件**（下記 10 項目）
10. **残存リスク**（隠さず記録する。CI 不動作・同一 OS ユーザーの限界・
    モデル呼び出し数が発行ベースの計上であること）

### 安全上の不変条件（この 10 項目を明記し、テストで担保されていることを示す）

1. 上限到達後に AI を呼ばない
2. 状態保存失敗後に修正を開始しない
3. 保護対象変更後に自動継続しない
4. 未知の失敗を自動修正しない
5. 環境障害をコード修正で解決しようとしない
6. テストやゲートを弱体化して合格にしない
7. 承認待ち状態から AI 自身が承認済みへ遷移しない
8. 同じ run を二重実行しない
9. 完了済み run を自動再開しない
10. 秘密情報を状態やログへ保存しない

### 変更 `docs/claude-code/harness-state-and-approval.md`

§3 の次の記述が**古くなる**ので更新する。

> `attempt` / `maxAttempts` / `lastFailureFingerprint` は**将来の有界修正ループ用の予約**。
> 現在どのコードもこの値を解釈せず、自動修正は一切行わない。

→ 有界修正ループが実装され、状態は別ファイル `bounded-repair-state.json` で管理すること、
`run-state.json` の予約フィールドは引き続き未使用であること（U1 でスキーマを変えないため）を
記述する。§5 の「再利用条件」表に Task 0 の修正が反映されていることも確認する。

## テスト

新規 `.claude/tests/bounded-repair-hook.test.mjs`（既存 `guard-dangerous.test.mjs` の
Hook 起動ヘルパの作法に合わせ、一時ディレクトリの状態ディレクトリを使う）:

- **ループ状態が存在しない → 通常の Edit / Write が許可される**（opt-in の確認。最重要）
- ループ状態が `needs_human_review` → `apps/web/src/x.tsx` への Write が deny（exit 2）
- ループ状態が `budget_exceeded` → deny
- ループ状態が `unsafe_change_detected` → deny
- ループ状態が `completed` → deny
- ループ状態が `active` かつ `attempt < maxAttempts` → 許可
- `attempt >= maxAttempts` かつ `phase: 'gates'` → deny
- **ループ状態が壊れている（不正 JSON / 未知フィールド）→ deny**（状態不整合時の停止）
- `bounded-repair-state.json` への Write / Bash 経由の操作が deny される
- deny メッセージに `report` コマンドの案内が含まれる
- 既存の deny 判定（保護対象・秘密情報・force push・`--no-verify`）が**すべて従来どおり**動く
  （回帰確認。既存テストが通ることで担保）

## 完了条件

- [ ] `pnpm test:harness` 全 green（既存 86 件を含む）
- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` 全 green
- [ ] `pnpm format:check` が green（Markdown も対象。新規ドキュメントの整形漏れに注意）
- [ ] ループ状態が無いとき通常開発が一切妨げられないテストがある
- [ ] ループ状態が壊れているとき deny されるテストがある
- [ ] 既存 Hook の deny 判定を削除・弱体化していない（`git diff` で追記のみを確認）
- [ ] `docs/claude-code/bounded-repair-loop.md` の 10 節すべてが埋まっている
- [ ] `harness-state-and-approval.md` の古い記述が更新されている
- [ ] 安全上の不変条件 10 項目が、対応するテスト名とともに記載されている
