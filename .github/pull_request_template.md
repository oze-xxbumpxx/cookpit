## Summary

<!-- 何をなぜ変えたかを 2〜4 行で。承認語（受け入れ可 / APPROVED / レビュー PASS）は書かない。 -->

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
