#!/usr/bin/env node
// SessionStart Hook — 進行中のDevinへの委譲の「次の動き」・Issueに紐づかないDevinのPR・未起票の昇格候補を出す（非ブロッキング）。
//
// 方針:
// - 待機スクリプト（wait-for-pr・wait-for-pr-update・wait-for-devin-pr）はセッションと一緒に止まる。
//   次のセッションが、記録（正 ∪ 写し）から待機の起動し直し・レビュー・finalizeを決められるようにする。
// - Hookはバックグラウンド処理もレビューも起動できないため、additionalContextで促すだけにする。
// - ghが無い・未認証・遅い環境（クラウドのセッションなど）では、記録上の最後の状態と未起票の昇格候補だけを出す。
//   出す行が無ければ何も出さない。失敗しても常にexit 0。

import { fileURLToPath } from 'node:url';
import { collectStatus, formatStatus } from '../scripts/delegation-status.mjs';

const GH_TIMEOUT_MS = 8_000;

/** SessionStartの出力。textが空ならnull（何も出さない）。 */
export function hookOutput(text) {
  if (text === '') return null;
  return JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } });
}

async function main() {
  let output = null;
  try {
    output = hookOutput(formatStatus(collectStatus({ timeout: GH_TIMEOUT_MS })));
  } catch {
    process.exit(0);
  }
  if (output !== null) process.stdout.write(output);
  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
