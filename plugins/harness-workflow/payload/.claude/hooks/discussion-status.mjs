#!/usr/bin/env node
// SessionStart Hook — 完了していないL2・L3の機能の工程と、回答待ちの問いを出す（非ブロッキング）。
//
// 方針:
// - 確認のページで答えても、Claude Codeのセッションには知らせが届かない。次のセッションが進み具合の記録から気づけるようにする。
// - 出す行が無ければ何も出さない。記録が読めなくても常にexit 0。

import { main } from '../scripts/discussion.mjs';

try {
  main(['status', '--hook'], { out: (s) => process.stdout.write(s), err: () => {} });
} catch {
  // 記録が崩れていてもセッションは止めない
}
process.exit(0);
