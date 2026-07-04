---
name: quality-gates
description: >
  品質ゲート（lint / type-check / test、オプションで format チェック・build）を一括実行し、
  PASS / FAIL / SKIP を集計して報告する手順。「品質ゲートを回して」「ゲート確認して」
  「lint とテストをまとめて実行」と依頼されたとき、および実装タスクの完了確認
  （definition-of-done.md のゲート）で使う。実体は .claude/scripts/run-quality-gates.sh。
---

# 品質ゲート一括実行

## 手順

1. 実在するゲートを確認する（擬似コマンドを作らない）:

   ```bash
   .claude/scripts/detect-project-commands.sh
   ```

2. ゲートを実行する:

   ```bash
   .claude/scripts/run-quality-gates.sh            # 既定: lint + type-check + test
   .claude/scripts/run-quality-gates.sh --format   # + prettier --check
   .claude/scripts/run-quality-gates.sh --build    # + build
   .claude/scripts/run-quality-gates.sh --all      # 全部
   ```

3. スクリプトの集計（PASS / FAIL / SKIP）をそのまま報告する。FAIL があれば該当出力を添え、
   `[unavailable]` のゲートは unknown として報告する（勝手に代替コマンドをでっち上げない）。

## 備考

- ローカルの pre-commit（lefthook）は format + lint、pre-push は type-check を自動実行する。
  本スキルはそれらを**手動で前倒し確認**したいときや、完了報告の根拠を残すときに使う。
- 変更したパッケージにテスト追加が必要かは `.claude/rules/coding-standards.md` §品質ゲート を参照。
