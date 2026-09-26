## 対応概要

<!-- 何を・なぜ を 1〜3 行で。「〜のため、〜を変えた」の形。承認語（受け入れ可 / APPROVED / レビュー PASS）は書かない。 -->

## 変更内容

<!-- 何をどうしたかを箇条書き。「<対象>: <追加 / 変更 / 削除したもの>」の形で、diff を読まなくても把握できる粒度にする。 -->

-

## 実装詳細

<!-- コードを開かなくても実装方針が分かる程度に。主要な設計判断・新しい構造・呼び出し側への影響。変更が小さい場合は省略可。 -->

## Review handoff

L2/L3 で人間マージ判断へ渡す場合は、次を実行して出力を貼る（正本は `docs/reviews/`）。

```bash
node .claude/scripts/review-readiness.mjs handoff-check --feature <feature-name> --base origin/main
node .claude/scripts/review-readiness.mjs handoff-blurb --feature <feature-name> --base origin/main
```

<!-- handoff-blurb の出力をここに貼る。legacy 長文や「受け入れ可」要約は不可。 -->

- feature:
- handoff-check: pass / fail（fail なら PR を「人間レビュー待ち」にしない）
- 詳細: `docs/reviews/<feature-name>.md`

## Test plan

- [ ] 品質ゲート（該当する lint / type-check / test）
- [ ] 人間項目・残余リスク・振る舞い差分を packet で確認した
