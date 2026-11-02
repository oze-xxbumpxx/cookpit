#!/usr/bin/env node
// 起動したDevin（特にクラウド）が止まっていないかを見張る。止まっていたら終了してClaude Codeを呼び戻す。
//
// 使い方:
//   node .claude/scripts/devin-stall-watch.mjs <issue番号> --log <ログのパス> --offset <起動直前のログのバイト数>
//     [--first-output秒] [--branch秒] [--interval秒]
//     既定: 最初の発言を300秒、ブランチを3600秒待つ。60秒ごとに確かめる。
//   Claude CodeからはBashのrun_in_backgroundで、Devinを起動した直後に起動する。
//
// 終了コード:
//   0 … ブランチ（devin/…-<issue>）ができた。以後はwait-for-pr.mjsに任せる
//   2 … 引数の誤り
//   5 … 起動してから --first-output秒たっても、今回のセッションの発言がログに増えない
//   6 … 起動してから --branch秒たっても、ブランチができない
//
// 方針:
// - ログは同じIssueのファイルに追記されるため、起動直前のバイト数（--offset）より増えたかで
//   今回のセッションの発言を見分ける（前のセッションの発言を今回のものと誤らない）。
// - wait-for-pr.mjsはPRができるか8時間たつまで終わらないので、止まったセッションの検知はここで行う
//   （クラウドで約8時間、ブランチも作らずに止まっていたことがある）。
// - gh / gitの一時的な失敗では止めず、次の周期で再試行する。

import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULTS = { firstOutput: 300, branch: 3600, interval: 60 };

/**
 * @param {{elapsedSec:number, logBytes:number, offset:number, branchFound:boolean,
 *   firstOutputSec:number, branchSec:number}} s
 * @returns {'branch' | 'no-output' | 'no-branch' | 'wait'}
 */
export function judgeStall(s) {
  if (s.branchFound) return 'branch';
  if (s.logBytes <= s.offset && s.elapsedSec >= s.firstOutputSec) return 'no-output';
  if (s.elapsedSec >= s.branchSec) return 'no-branch';
  return 'wait';
}

/** ブランチ名の末尾が -<issue> のdevin/ ブランチを探す。 */
export function findIssueBranch(lsRemoteOutput, issue) {
  const suffix = new RegExp(`refs/heads/(devin/\\S*-${issue})$`);
  for (const line of lsRemoteOutput.split('\n')) {
    const m = line.trim().match(suffix);
    if (m) return m[1];
  }
  return null;
}

function parseArgs(argv) {
  const [issueArg, ...rest] = argv;
  const issue = Number(issueArg);
  if (!Number.isInteger(issue) || issue <= 0) return null;
  const opts = { issue, log: null, offset: null, ...DEFAULTS };
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i];
    const raw = rest[i + 1];
    if (raw === undefined) return null;
    if (key === '--log') opts.log = raw;
    else if (key === '--offset') opts.offset = Number(raw);
    else if (key === '--first-output') opts.firstOutput = Number(raw);
    else if (key === '--branch') opts.branch = Number(raw);
    else if (key === '--interval') opts.interval = Number(raw);
    else return null;
  }
  if (opts.log === null || !Number.isInteger(opts.offset) || opts.offset < 0) return null;
  for (const k of ['firstOutput', 'branch', 'interval']) {
    if (!Number.isFinite(opts[k]) || opts[k] <= 0) return null;
  }
  return opts;
}

function logBytes(path) {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

function remoteBranch(issue) {
  try {
    const out = execFileSync('git', ['ls-remote', '--heads', 'origin', 'devin/*'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return findIssueBranch(out, issue);
  } catch {
    return null;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts === null) {
    console.error(
      'usage: devin-stall-watch.mjs <issue> --log <path> --offset <bytes> [--first-output 秒] [--branch 秒] [--interval 秒]',
    );
    process.exit(2);
  }
  const startedAt = Date.now();
  console.log(`Issue #${opts.issue} の Devin を見張っています（発言 ${opts.firstOutput} 秒、ブランチ ${opts.branch} 秒）`);
  for (;;) {
    const branch = remoteBranch(opts.issue);
    const verdict = judgeStall({
      elapsedSec: (Date.now() - startedAt) / 1000,
      logBytes: logBytes(opts.log),
      offset: opts.offset,
      branchFound: branch !== null,
      firstOutputSec: opts.firstOutput,
      branchSec: opts.branch,
    });
    if (verdict === 'branch') {
      console.log(JSON.stringify({ issue: opts.issue, branch }));
      process.exit(0);
    }
    if (verdict === 'no-output') {
      console.log(`止まっている可能性: ${opts.firstOutput} 秒たっても今回のセッションの発言がありません`);
      process.exit(5);
    }
    if (verdict === 'no-branch') {
      console.log(`止まっている可能性: ${opts.branch} 秒たってもブランチ devin/…-${opts.issue} がありません`);
      process.exit(6);
    }
    await new Promise((r) => setTimeout(r, opts.interval * 1000));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
