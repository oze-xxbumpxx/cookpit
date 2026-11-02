#!/usr/bin/env node
// Issueに紐づかないDevinのPR（知見のPRなど）ができるまで待つ。
//
// 使い方:
//   node .claude/scripts/wait-for-devin-pr.mjs --since <ISO 8601> [--interval秒] [--timeout秒]
//     既定: 60秒ごとに確認し、8時間で諦める。セッションで1本だけrun_in_backgroundで起動する。
//     見つけると終了するので、見つかったPRの記録をinitしてから、同じ --sinceで起動し直す
//     （記録があるPRは通知しない）。
//
// 終了コード:
//   0 … 見つかった。見つかったPRごとに {"pr","url","title","headRefName","author"} のJSONを1行ずつ出す
//   2 … 引数の誤り
//   3 … 時間切れ
//
// 方針:
// - 判定はfindUnlinkedDevinPrsに閉じ込め、テストで固定する。
// - 「紐づく」は、委譲の記録があるIssueにwait-for-pr.mjsの規則で紐づくときだけ。
//   そのPRはwait-for-pr.mjsが待っているので、ここでは拾わない（二重レビューを避ける）。
//   記録の無いIssueに紐づくPRは誰も待っていないので拾う。
//   ブランチ名の末尾 -Nの規則だけで判定すると、devin/update-skills-1790414398のような
//   時刻の数字をIssue番号と誤読するため、記録のある番号に限る。
// - 既知のPRは、委譲の記録（Issueの記録のgh.pr、またはpr-<n>.yml。reviewsが空でもよい）か、
//   PRのコメントの <!-- claude-reviewの印で判断する。initだけで中断したレビューは、
//   セッション開始時の表示（delegation-status）が「初回レビュー前」として出す。
// - コメントの取得はPRごとに失敗を扱う（1件の失敗で他のPRを捨てない）。
// - 取得の都度、記録（正 ∪ 写し）を読み直す（待機中にinitされた記録を、別のworktreeのものも含めて反映する）。

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readKnownRecords } from './delegation.mjs';
import { findLinkedPr } from './wait-for-pr.mjs';

const DEFAULT_INTERVAL_SEC = 60;
const DEFAULT_TIMEOUT_SEC = 8 * 60 * 60;
const GH_TIMEOUT_MS = 30_000;
export const DEVIN_BRANCH_PREFIX = 'devin/';
export const REVIEW_MARKER = '<!-- claude-review';

/**
 * @param {Array<{number:number,headRefName?:string,createdAt?:string,title?:string,body?:string,
 *   closingIssuesReferences?:Array<{number:number}>}>} prs
 * @param {{since?: string | null, delegatedIssues?: number[], knownPrs?: number[]}} options
 *   sinceより前に作られたPRは対象外（nullなら絞らない）。knownPrsは記録があるPR。
 * @returns {Array<object>} 対象のPRを番号の昇順で。
 */
export function findUnlinkedDevinPrs(prs, { since = null, delegatedIssues = [], knownPrs = [] } = {}) {
  const sinceMs = since === null ? null : Date.parse(since);
  const known = new Set(knownPrs);
  return prs
    .filter((pr) => (pr.headRefName ?? '').startsWith(DEVIN_BRANCH_PREFIX))
    .filter((pr) => sinceMs === null || Date.parse(pr.createdAt ?? '') >= sinceMs)
    .filter((pr) => !known.has(pr.number))
    .filter((pr) => !delegatedIssues.some((issue) => findLinkedPr([pr], issue) !== null))
    .sort((a, b) => a.number - b.number);
}

/** 記録から「委譲したIssue」と「記録があるPR」を取り出す。 */
export function knownFromRecords(records) {
  const delegatedIssues = [];
  const knownPrs = [];
  for (const rec of records) {
    if (Number.isInteger(rec.issue)) delegatedIssues.push(rec.issue);
    if (Number.isInteger(rec.pr)) knownPrs.push(rec.pr);
    if (Number.isInteger(rec.gh?.pr)) knownPrs.push(rec.gh.pr);
  }
  return { delegatedIssues, knownPrs };
}

/** @param {Array<{body?: string}> | null} comments */
export const hasReviewMarker = (comments) => (comments ?? []).some((c) => (c.body ?? '').includes(REVIEW_MARKER));

/**
 * 候補からレビューの印があるものを除く。コメントの取得に失敗したPRはuncheckedに分け、他のPRは捨てない。
 * @param {Array<{number:number}>} prs
 * @param {(pr: number) => Array<{body?: string}>} commentsOf
 */
export function filterUnreviewed(prs, commentsOf) {
  const pending = [];
  const unchecked = [];
  for (const pr of prs) {
    try {
      // 旧レビューの印は現在headの両レビューを証明しない。
      commentsOf(pr.number);
      pending.push(pr);
    } catch {
      unchecked.push(pr);
    }
  }
  return { pending, unchecked };
}

export function prComments(pr, timeout = GH_TIMEOUT_MS) {
  const out = execFileSync('gh', ['pr', 'view', String(pr), '--json', 'comments'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
  });
  return JSON.parse(out).comments;
}

export const toOutputLine = (pr) =>
  JSON.stringify({
    pr: pr.number,
    url: pr.url,
    title: pr.title,
    headRefName: pr.headRefName,
    author: pr.author?.login ?? null,
  });

/** OPENのDevinのPR。sinceを渡すと作成日時で絞る。 */
export function listOpenDevinPrs(since = null, timeout = GH_TIMEOUT_MS) {
  const args = ['pr', 'list', '--state', 'open', '--limit', '1000', '--json', 'number,title,body,headRefName,url,createdAt,closingIssuesReferences,author,headRefOid,state'];
  if (since !== null) args.push('--search', `created:>=${since}`);
  const out = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout });
  const prs = JSON.parse(out);
  if (!Array.isArray(prs) || prs.length >= 1000) throw new Error('PR一覧を全件確認できません');
  return prs.filter((pr) => (pr.headRefName ?? '').startsWith(DEVIN_BRANCH_PREFIX));
}

export function parseArgs(argv) {
  let since = null;
  let interval = DEFAULT_INTERVAL_SEC;
  let timeout = DEFAULT_TIMEOUT_SEC;
  for (let i = 0; i < argv.length; i += 2) {
    const value = argv[i + 1];
    if (value === undefined) return null;
    if (argv[i] === '--since') {
      if (Number.isNaN(Date.parse(value))) return null;
      since = value;
      continue;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (argv[i] === '--interval') interval = n;
    else if (argv[i] === '--timeout') timeout = n;
    else return null;
  }
  if (since === null) return null;
  return { since, interval, timeout };
}

const sleep = (sec) => new Promise((resolve) => setTimeout(resolve, sec * 1000));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    console.error('usage: wait-for-devin-pr.mjs --since <ISO 8601> [--interval 秒] [--timeout 秒]');
    process.exit(2);
  }
  const deadline = Date.now() + args.timeout * 1000;
  console.log(`${args.since} 以降に作られた、Issue に紐づかない Devin の PR を待っています（${args.interval} 秒ごと）`);
  for (;;) {
    try {
      const candidates = findUnlinkedDevinPrs(listOpenDevinPrs(args.since), {
        since: args.since,
        ...knownFromRecords(readKnownRecords()),
      });
      const { pending: found, unchecked } = filterUnreviewed(candidates, (n) => prComments(n));
      if (unchecked.length > 0) {
        console.error(`コメントを確認できなかった PR（次の周期で再確認）: ${unchecked.map((pr) => `#${pr.number}`).join(' ')}`);
      }
      if (found.length > 0) {
        console.log(`Issue に紐づかない Devin の PR が見つかりました: ${found.map((pr) => `#${pr.number}`).join(' ')}`);
        for (const pr of found) console.log(toOutputLine(pr));
        process.exit(0);
      }
    } catch (error) {
      console.error(`確認に失敗しました（次の周期で再試行）: ${error.message.split('\n')[0]}`);
    }
    if (Date.now() + args.interval * 1000 > deadline) {
      console.log('時間切れ: Issue に紐づかない Devin の PR は見つかりませんでした');
      process.exit(3);
    }
    await sleep(args.interval);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
