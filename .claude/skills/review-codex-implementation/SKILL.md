---
name: review-codex-implementation
description: >
  Codex 委譲実装の受け入れレビューを一括実行する手順。tsc / eslint を通過する既知ミス型
  （識別子・Tailwind クラスのタイポ、イベントハンドラ結線漏れ、'use client' 漏れ等）を
  機械検出スクリプトで先に洗い出し、品質ゲート・人間チェックリスト・実画面確認へつなぐ。
  「Codex の実装をレビューして」「差し戻し後の再レビュー」で使う。
  docs/06-ai-tools.md のレビューチェックリストと対。
---

# Codex 実装の受け入れレビュー

## 発動条件

- `docs/tasks/codex/<feature>/` の指示書で Codex に委譲した実装を受け取ったとき
- 差し戻し後の再実装を再レビューするとき

## 手順

1. **機械チェック**（既知ミス型の一次検出）:

   ```bash
   node .claude/scripts/check-codex-implementation.mjs --brief docs/tasks/codex/<feature>
   ```

   - 既定では merge-base origin/main 以降の変更ファイルを検査する（`--base <ref>` で変更可）
   - **FAIL**（結線漏れ・'use client' 漏れ）は即差し戻し候補
   - **WARN / INFO** は目視で PASS / FAIL を確定する（新規の正当な Tailwind クラス等は
     誤検出になりうる。機械チェックは人間チェックリストの代替ではなく前処理）

2. **品質ゲート**: `bash .claude/scripts/run-quality-gates.sh`（quality-gates Skill 参照）。

3. **人間チェックリスト**: docs/06-ai-tools.md「Codex 実装のレビューチェックリスト」全 8 項目を
   表で走査する。機械検出済みの項目（識別子 / Tailwind / 結線 / use client / テーブル命名 /
   バリデーション分岐の一部）はスクリプト結果を引用し、機械検出できない項目は diff を目視する:

   | 項目                  | 確認方法                                                                |
   | --------------------- | ----------------------------------------------------------------------- |
   | 識別子のタイポ        | script（brief 突き合わせ + サブトークン）+ 指示書のシグネチャと目視照合 |
   | Tailwind タイポ・連結 | script + 実画面確認（手順 4）                                           |
   | ハンドラ結線漏れ      | script + 実画面での操作確認                                             |
   | 'use client'          | script                                                                  |
   | `import type` 規約    | diff を目視（機械検出なし）                                             |
   | 命名の傾向ずれ        | script（テーブル単数形のみ）+ 目視                                      |
   | 差し戻しの部分反映    | **手順 5 のプロセスで担保**（機械検出なし）                             |
   | バリデーション分岐    | script（INFO）+ 該当 Zod スキーマを目視                                 |

4. **実画面確認**: 画面変更を含む場合は manual-browser-verify Skill へハンドオフする。
   リモート環境では PGlite 経路（`pnpm --filter @cookpit/web dev:pglite`）を使う。

5. **差し戻し**: 指摘は全件を番号付きリストで指示書ディレクトリに追記して Codex へ渡す。
   再実装後は**指摘全件を再レビュー**（部分反映が既知ミス型。1 件でも未確認のまま
   受け入れない）+ スクリプト再実行。

6. **記録 + 報告**:
   - **必須**: `docs/reviews/<feature>.md` に受け入れレビュー結果を追記する
     （ファイルが無ければ作成。既存があれば Task 単位で追記）。
     最低限含める項目: 実施日 / 対象 Task・指示書パス / ブランチ /
     機械チェック結果（FAIL/WARN 件数）/ 品質ゲート結果 /
     チェックリスト 8 項目の判定表 / 実画面確認（該当時）/ 総合判定（受け入れ可 or 差し戻し）。
     良い例: `docs/reviews/shopping-list-core.md` Task 1・2。
   - チャットへの報告は上記ファイルへのリンク付き要約でよい。
   - PR 本文への転記は任意（正本は `docs/reviews/`。出典: shopping-list-core 事象 6）。

## 完了条件

- スクリプトの FAIL が 0、または全 FAIL に処置（修正 / 差し戻し / 誤検出と判断した根拠）が決定済み
- チェックリスト全 8 項目に判定がついている
- 品質ゲートが green
- 差し戻しがあった場合、指摘全件の再確認が済んでいる
- `docs/reviews/<feature>.md` への今回分の追記が完了している

## 備考

- スクリプトの検出原理: 既存コミット済みコードから収穫した「既知クラス辞書」と Tailwind 文法で
  照合するため、**新規クラスの誤検出（WARN）はあり得る**。マージ後は辞書側に取り込まれるので
  同じ WARN は再発しない。
- `import type` 規約の機械化は eslint ルール
  （`@typescript-eslint/consistent-type-imports`）の導入が本筋。改善候補として別途起票する。
