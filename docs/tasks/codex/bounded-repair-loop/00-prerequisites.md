# Task 0: 前提バグの修正 — 保護対象判定の穴とディレクトリ承認

## 概要

有界修正ループが依存する安全基盤に、実測で確認済みのバグが 2 件ある。ループ本体の前に塞ぐ。
対象は `.claude/lib/harness-approval.mjs` と `.claude/scripts/harness-approve.mjs` の 2 ファイルのみ。
既存の作法は `.claude/lib/harness-approval.mjs` と `.claude/tests/harness-approval.test.mjs` を読んで合わせる。

## アーキテクチャ制約

- Node ESM（`.mjs`）。**新規依存の追加は禁止**。Node 標準モジュールのみ。
- デフォルトエクスポート禁止。名前付きエクスポートのみ。
- `===` / `!==` を使う。`==` / `!=` は禁止。
- 「値なし」は `null` に統一する（`undefined` と混在させない）。
- 公開関数には JSDoc を書く。内容は**型に表せない契約情報のみ**（不変条件・`@throws`・
  正規化規則）。型の言い換えは書かない。
- コメントは「なぜ（Why）」が非自明な場合のみ。
- **fail-closed を弱めない**。判定に迷う入力は「保護対象である」側に倒す。

## バグ B1: 保護対象ディレクトリ自身が保護されない

### 現状（実測済み）

```
isProtectedPath('.claude/lib')                   → false   ← 穴
isProtectedPath('.claude/lib/harness-state.mjs') → true
```

`PROTECTED_PREFIXES` は `'.claude/lib/'` のように末尾スラッシュ付きで定義されており、
`rel.startsWith(prefix)` は `'.claude/lib'`（スラッシュなし）にマッチしない。

Hook へ実入力を与えた結果:

| 投入コマンド                           | 現状               | 期待               |
| -------------------------------------- | ------------------ | ------------------ |
| `rm -rf .claude/lib/harness-state.mjs` | exit 2 DENIED      | 変更なし（DENIED） |
| `rm -rf .claude/lib`                   | exit 0 **ALLOWED** | **exit 2 DENIED**  |
| `rm -rf .claude/hooks`                 | exit 0 **ALLOWED** | **exit 2 DENIED**  |
| `mv .claude/tests /tmp/gone`           | exit 0 **ALLOWED** | **exit 2 DENIED**  |

### 修正

`.claude/lib/harness-approval.mjs` の `isProtectedPath()` を、**保護プレフィックスから
末尾スラッシュを取り除いたパス自身**も保護対象と判定するよう拡張する。

期待する挙動（すべて満たすこと）:

```
isProtectedPath('.claude/lib')       → true    (新規)
isProtectedPath('.claude/lib/')      → true    (新規)
isProtectedPath('.claude/lib/x.mjs') → true    (既存・不変)
isProtectedPath('.claude/libs')      → false   (前方一致の誤爆を作らない。最重要)
isProtectedPath('.claude/library')   → false   (同上)
isProtectedPath('.claude/state')     → false   (既存・対象外のまま)
isProtectedPath('.claude/evals')     → false   (既存・対象外のまま)
isProtectedPath('docs/x.md')         → false   (既存・不変)
isProtectedPath('../outside')        → false   (既存・不変。リポジトリ外は対象外)
```

大文字小文字を区別しない照合（既存の `lower` 経路）も新しい判定に適用すること。

## バグ B2: ディレクトリ承認が配下ファイルを覆わない

### 現状（実測済み）

`harness-approve.mjs` は `--target` を `toRepoRelative()` で正規化し、その際 **末尾スラッシュが
除去される**。一方 `approvalCoversTarget()` は「末尾が `/` のときだけ前置一致」の契約。

```
issuer input        : ".claude/lib/"
stored approval.tgt : ".claude/lib"      ← スラッシュが消える
approvalCoversTarget(".claude/lib", ".claude/lib/x.mjs")  → false  ← 覆わない
approvalCoversTarget(".claude/lib/", ".claude/lib/x.mjs") → true
```

さらに B1 の帰結で `isProtectedPath('.claude/lib') === false` のため、issuer 側が先に
`--target が保護対象ではありません（承認は不要です）` で**発行自体を拒否**する。
結果として `docs/claude-code/harness-state-and-approval.md` §5 が謳う
「ディレクトリ前置一致 → バッチ変更のため再利用可」は**一度も成立していない**。

### 修正

`.claude/scripts/harness-approve.mjs` で、**`--target` の生入力が `/` で終わっていた場合、
正規化後の相対パスに `/` を復元してから承認ペイロードへ書く**。

```
--target .claude/lib/   → approval.target = ".claude/lib/"   (前置一致・複数ファイル再利用可)
--target CLAUDE.md      → approval.target = "CLAUDE.md"      (完全一致・単回使用。既存のまま)
```

## 命名・記法の注意（過去の Codex ミス実績への先回り）【必須】

- **`toRepoRelative()` 自体を書き換えないこと（最重要）。** 末尾スラッシュを保持するよう
  `toRepoRelative` を変えると、`isProtectedPath` / `approvalCoversTarget` / `guard-dangerous.mjs` の
  全呼び出し元の契約が同時に変わり、既存の承認と既存テストが壊れる。**スラッシュの復元は
  `harness-approve.mjs` 側のローカルな処理**として実装する。
- **`startsWith` による誤爆を作らないこと。** `'.claude/libs'` や `'.claude/library'` を
  保護対象にしてはいけない。プレフィックス一致は「`prefix` そのもの」または
  「`prefix` で始まる（`prefix` は `/` 終端）」の 2 条件で判定する。単純に
  `rel.startsWith('.claude/lib')` と書くとこの誤爆が起きる。
- **`PROTECTED_EXACT` と `PROTECTED_PREFIXES` の定義文字列は変更しない。** 判定ロジック側で
  末尾スラッシュを扱う。定義を書き換えると `PROTECTED_TARGETS`（`harness-approve.mjs` の
  ヘルプ表示に使われる）の表示が崩れる。
- `Object.freeze` された配列を再代入・変更しないこと。
- 既存テスト `.claude/tests/harness-approval.test.mjs` / `guard-dangerous.test.mjs` を
  **書き換えて通すのは禁止**。落ちたら実装側を直す。
- リポジトリ外へ出るパス（`rel === '..'` / `rel.startsWith('../')`）は既存どおり `false` を
  維持する（別ルールで扱う設計）。

## テスト

`.claude/tests/harness-approval.test.mjs` へ**追記**（新規ファイルを作らない。既存の
`sandbox()` ヘルパの作法に合わせる）:

- `isProtectedPath` がディレクトリ自身を保護と判定する（`.claude/lib` / `.claude/hooks` /
  `.claude/tests` / `.claude/scripts` / `.claude/agents` / `.claude/rules` / `.claude/skills` /
  `.github/workflows` / `.github/actions`、各々スラッシュ有無の 2 形）
- `'.claude/libs'` / `'.claude/library'` / `'.claude/statement'` を保護と誤判定しない
- `.claude/state` / `.claude/evals` / `docs/` は対象外のまま
- ディレクトリ承認（`target: '.claude/lib/'`）が配下の複数ファイルを覆う
- ファイル完全一致承認（`target: 'CLAUDE.md'`）は他ファイルを覆わない

`.claude/tests/guard-dangerous.test.mjs` へ**追記**（既存の Hook 起動ヘルパを使う）:

- `rm -rf .claude/lib` / `rm -rf .claude/hooks` / `mv .claude/tests /tmp/gone` が
  **exit 2 で deny** される
- `rm -rf node_modules` / `rm -rf apps/web/.next` は**従来どおり許可**される（誤検知回帰の防止）

## 完了条件

- [ ] `pnpm test:harness` 全 green（既存 86 件 + 追記分）
- [ ] `pnpm lint` / `pnpm type-check` / `pnpm test` 全 green
- [ ] 上記「期待する挙動」9 行すべてが満たされている
- [ ] `rm -rf .claude/lib` 相当 3 件が deny される
- [ ] `toRepoRelative()` の実装が変更されていない（`git diff` で確認）
- [ ] `PROTECTED_EXACT` / `PROTECTED_PREFIXES` の定義文字列が変更されていない
- [ ] 既存テストを書き換えていない（追記のみ）
