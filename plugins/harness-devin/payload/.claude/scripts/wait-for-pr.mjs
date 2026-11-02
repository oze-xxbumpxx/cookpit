#!/usr/bin/env node
// Issueに紐づくPRができるまで待つ（Devinなど他のエージェントに渡したIssueの自動レビュー用）。
//
// 使い方:
//   node .claude/scripts/wait-for-pr.mjs <issue番号> [--interval秒] [--timeout秒]
//     既定: 60秒ごとに確認し、8時間で諦める。
//   Claude CodeからはBashのrun_in_backgroundで起動する。終了するとセッションが呼び戻される。
//
// 終了コード:
//   0 … 見つかった。標準出力に {"issue","number","url","title","headRefName"} のJSONを1行出す
//   2 … 引数の誤り
//   3 … 時間切れ
//
// 方針:
// - 「紐づく」の判定はfindLinkedPrに閉じ込め、テストで固定する。
//   GitHubが認識した紐づけ（closingIssuesReferences）、本文のCloses / Fixes / Resolves #N、
//   またはブランチ名の末尾 -N。Devinは本文にClosesを書き忘れることがあるため
//   ブランチ名も見る。本文の「Issue #N」という言及だけでは紐づけとみなさない（別PRの誤検出）。
// - 対象はIssueの作成以降に作られたPRだけ。取得も作成日時で絞り、件数の上限で取りこぼさない。
// - ghの一時的な失敗（ネットワーク等）では止めず、次の周期で再試行する。

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_INTERVAL_SEC = 60;
const DEFAULT_TIMEOUT_SEC = 8 * 60 * 60;

/**
 * @param {Array<{number:number,title?:string,body?:string,headRefName?:string,url?:string,
 *   createdAt?:string,closingIssuesReferences?:Array<{number:number}>}>} prs
 * @param {number} issue
 * @param {string | null} since Issueの作成日時（ISO 8601）。これより前に作られたPRは対象外。
 * @returns {object | null} 一意に紐づくPR。無い、又は複数ある場合はnull。
 */
export function findLinkedPr(prs, issue, since = null) {
  const n = String(issue);
  const bodyLink = new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s+#${n}(?!\\d)`, 'i');
  const branchSuffix = new RegExp(`[-/]${n}$`);
  const sinceMs = since === null ? null : Date.parse(since);
  const linked = prs.filter((pr) => {
    if (sinceMs !== null && !(Date.parse(pr.createdAt ?? '') >= sinceMs)) return false;
    const closes = (pr.closingIssuesReferences ?? []).some((ref) => ref.number === issue);
    const text = `${pr.title ?? ''}\n${pr.body ?? ''}`;
    return closes || bodyLink.test(text) || branchSuffix.test(pr.headRefName ?? '');
  });
  return linked.length === 1 ? linked[0] : null;
}

function parseArgs(argv) {
  const [issueArg, ...rest] = argv;
  const issue = Number(issueArg);
  if (!Number.isInteger(issue) || issue <= 0) return null;
  let interval = DEFAULT_INTERVAL_SEC;
  let timeout = DEFAULT_TIMEOUT_SEC;
  for (let i = 0; i < rest.length; i += 2) {
    const value = Number(rest[i + 1]);
    if (!Number.isFinite(value) || value <= 0) return null;
    if (rest[i] === '--interval') interval = value;
    else if (rest[i] === '--timeout') timeout = value;
    else return null;
  }
  return { issue, interval, timeout };
}

export function issueCreatedAt(issue) {
  const out = execFileSync('gh', ['issue', 'view', String(issue), '--json', 'createdAt', '--jq', '.createdAt'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return out.trim();
}

export function listPrs(since) {
  const out = execFileSync(
    'gh',
    [
      'pr', 'list', '--state', 'all', '--limit', '1000',
      '--search', `created:>=${since}`,
      '--json', 'number,title,body,headRefName,url,createdAt,closingIssuesReferences',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const prs = JSON.parse(out);
  if (!Array.isArray(prs) || prs.length >= 1000) throw new Error('PR一覧を全件確認できません');
  return prs;
}

const sleep = (sec) => new Promise((resolve) => setTimeout(resolve, sec * 1000));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    console.error('usage: wait-for-pr.mjs <issue番号> [--interval 秒] [--timeout 秒]');
    process.exit(2);
  }
  const deadline = Date.now() + args.timeout * 1000;
  console.log(`Issue #${args.issue} に紐づく PR を待っています（${args.interval} 秒ごと）`);
  let since = null;
  for (;;) {
    try {
      since ??= issueCreatedAt(args.issue);
      const prs = listPrs(since);
      const pr = findLinkedPr(prs, args.issue, since);
      if (pr !== null) {
        console.log(`PR #${pr.number} が見つかりました: ${pr.url}`);
        console.log(JSON.stringify({ issue: args.issue, number: pr.number, url: pr.url, title: pr.title, headRefName: pr.headRefName }));
        process.exit(0);
      }
    } catch (error) {
      console.error(`gh の確認に失敗しました（次の周期で再試行）: ${error.message.split('\n')[0]}`);
    }
    if (Date.now() + args.interval * 1000 > deadline) {
      console.log(`時間切れ: Issue #${args.issue} に紐づく PR は見つかりませんでした`);
      process.exit(3);
    }
    await sleep(args.interval);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // 最上位でawaitしない。mainの中で読み込むdelegation.mjsがこのファイルを読み込み返すため、
  // このファイルの評価が終わっていないと読み込みが輪になって互いを待ち、終了コード13で止まる。
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
